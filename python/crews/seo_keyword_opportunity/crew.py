import json
import os
import re
from urllib.parse import parse_qs, quote_plus, unquote, urlparse

import requests
from bs4 import BeautifulSoup
from crewai import Agent, Crew, Task, Process, LLM


USER_AGENT = "Mozilla/5.0 (compatible; ArkaKeywordCrew/1.0)"
DEFAULT_TONE = "professional and analytical"
DDG_HTML_SEARCH_URL = "https://html.duckduckgo.com/html/"


def build_llm():
    model = os.getenv("OPENAI_MODEL_NAME", "gpt-4o-mini")
    return LLM(model=model, temperature=0.2)


def normalize_url(url: str) -> str:
    url = (url or "").strip()
    if not url:
        return ""
    if not url.startswith(("http://", "https://")):
        url = f"https://{url}"
    return url


def clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())


def get_session():
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})
    return session


def fetch_html(url: str) -> str:
    session = get_session()
    response = session.get(url, timeout=25, allow_redirects=True)
    response.raise_for_status()
    return response.text


def extract_site_context(website_url: str):
    html = fetch_html(website_url)
    soup = BeautifulSoup(html, "html.parser")

    title = clean_text(soup.title.get_text(" ", strip=True)) if soup.title else ""

    meta_desc_tag = soup.find("meta", attrs={"name": re.compile("^description$", re.I)})
    meta_description = clean_text(meta_desc_tag.get("content", "")) if meta_desc_tag else ""

    h1s = [clean_text(tag.get_text(" ", strip=True)) for tag in soup.find_all("h1")]
    h2s = [clean_text(tag.get_text(" ", strip=True)) for tag in soup.find_all("h2")]

    anchors = []
    for a in soup.find_all("a", href=True):
        txt = clean_text(a.get_text(" ", strip=True))
        href = clean_text(a.get("href", ""))
        if txt or href:
            anchors.append({"text": txt, "href": href})

    body_text = clean_text(soup.get_text(" ", strip=True))

    return {
        "website_url": website_url,
        "domain": urlparse(website_url).netloc.lower(),
        "title": title,
        "meta_description": meta_description,
        "h1s": h1s[:20],
        "h2s": h2s[:50],
        "anchors": anchors[:100],
        "body_excerpt": body_text[:12000],
    }


def extract_seed_topics(site_context):
    texts = []
    texts.append(site_context.get("title", ""))
    texts.append(site_context.get("meta_description", ""))
    texts.extend(site_context.get("h1s", []))
    texts.extend(site_context.get("h2s", []))
    texts.extend([a.get("text", "") for a in site_context.get("anchors", [])])

    merged = " | ".join([t for t in texts if t]).lower()

    topic_rules = {
        "shopify analytics": ["shopify", "analytics"],
        "ai analytics for shopify": ["ai", "shopify", "analytics"],
        "customer analytics": ["customer", "analytics"],
        "product analytics": ["product", "intelligence", "product performance"],
        "sales analytics": ["sales", "revenue", "order value"],
        "rfm segmentation": ["rfm", "segmentation", "vip", "champions", "at-risk"],
        "churn prevention": ["churn", "at-risk"],
        "purchase journey analytics": ["purchase journey", "journey", "repeat purchase"],
        "shopify ai recommendations": ["ai recommendations", "recommendations"],
        "real-time shopify analytics": ["real-time", "live activity", "monitoring"],
    }

    detected = []
    for topic, signals in topic_rules.items():
        if any(signal in merged for signal in signals):
            detected.append(topic)

    if not detected:
        detected = [
            "shopify analytics",
            "customer analytics",
            "product analytics",
            "sales analytics",
        ]

    return detected


def resolve_ddg_redirect(href: str) -> str:
    href = (href or "").strip()
    if not href:
        return ""

    parsed = urlparse(href)

    if parsed.netloc.endswith("duckduckgo.com") and parsed.path.startswith("/l/"):
        params = parse_qs(parsed.query)
        uddg = params.get("uddg", [""])[0]
        return unquote(uddg) if uddg else href

    if href.startswith("//"):
        return f"https:{href}"

    return href


def run_search_query(query: str, max_results: int = 10):
    session = get_session()

    try:
        response = session.get(
            DDG_HTML_SEARCH_URL,
            params={"q": query},
            timeout=20,
            allow_redirects=True,
        )
        response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")

        results = []
        seen = set()

        for anchor in soup.find_all("a", href=True):
            raw_href = anchor.get("href", "").strip()
            title = clean_text(anchor.get_text(" ", strip=True))
            classes = " ".join(anchor.get("class", []))

            if not raw_href or not title:
                continue

            href = resolve_ddg_redirect(raw_href)
            if not href.startswith("http"):
                continue

            if "result__a" not in classes and "uddg=" not in raw_href:
                continue

            if href in seen:
                continue

            seen.add(href)

            snippet = ""
            parent = anchor.find_parent()
            if parent:
                parent_text = clean_text(parent.get_text(" ", strip=True))
                if parent_text and parent_text != title:
                    snippet = parent_text[:400]

            results.append(
                {
                    "title": title,
                    "url": href,
                    "snippet": snippet,
                }
            )

            if len(results) >= max_results:
                break

        return {
            "query": query,
            "ok": True,
            "results": results,
            "raw": json.dumps(results, ensure_ascii=False)[:12000],
        }

    except Exception as exc:
        return {
            "query": query,
            "ok": False,
            "results": [],
            "raw": "",
            "error": str(exc),
        }


def gather_serp_research(website_url: str, seed_topics, max_keywords: int = 12):
    domain = urlparse(website_url).netloc.lower()

    keyword_candidates = []
    for topic in seed_topics:
        keyword_candidates.extend([
            topic,
            f"best {topic}",
            f"{topic} for shopify",
            f"{topic} for small stores",
        ])

    deduped = []
    seen = set()
    for kw in keyword_candidates:
        key = kw.strip().lower()
        if key and key not in seen:
            seen.add(key)
            deduped.append(kw)

    keywords_checked = deduped[:max_keywords]

    serp_data = []
    for keyword in keywords_checked:
        serp_data.append({
            "keyword": keyword,
            "main_search": run_search_query(keyword, max_results=10),
            "domain_check": run_search_query(f"site:{domain} {keyword}", max_results=10),
        })

    return {
        "domain": domain,
        "keywords_checked": keywords_checked,
        "serp_data": serp_data,
        "search_enabled": True,
        "search_provider": "duckduckgo_html_fallback",
    }


def create_seo_keyword_opportunity_crew(payload=None):
    payload = payload or {}

    website_url = normalize_url(payload.get("website_url", ""))
    if not website_url:
        raise ValueError("website_url is required")

    brand_name = clean_text(payload.get("brand_name", ""))
    tone = clean_text(payload.get("tone", DEFAULT_TONE)) or DEFAULT_TONE
    max_keywords = int(payload.get("max_keywords", 12) or 12)

    site_context = extract_site_context(website_url)
    seed_topics = extract_seed_topics(site_context)
    serp_research = gather_serp_research(
        website_url=website_url,
        seed_topics=seed_topics,
        max_keywords=max_keywords,
    )

    llm = build_llm()

    keyword_strategist = Agent(
        role="Keyword Strategist",
        goal=(
            "Identify the highest-potential SEO keywords for the website based on positioning, "
            "search intent, commercial relevance, and realistic opportunity."
        ),
        backstory=(
            "You are a senior SEO strategist. You separate informational, commercial, "
            "transactional, and navigational intent. You avoid vanity keywords and focus "
            "on keywords that genuinely fit the product."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    competitor_analyst = Agent(
        role="SERP Competitor Analyst",
        goal=(
            "Identify actual keyword-level competitors from available SERP evidence and explain "
            "why they are difficult or easier to beat."
        ),
        backstory=(
            "You analyze search competition, not generic market competition. "
            "You focus on who is occupying search demand for each keyword."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    difficulty_analyst = Agent(
        role="Keyword Difficulty Analyst",
        goal=(
            "Estimate how difficult it is for this website to reach page one for each target keyword, "
            "including the main blockers and what would be required to compete."
        ),
        backstory=(
            "You are conservative and evidence-first. You never guarantee rankings. "
            "You distinguish current-state opportunity from long-term potential."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    ui_ux_designer = Agent(
        role="UI/UX Designer",
        goal=(
            "Design a polished, premium, highly readable analytics-style report UI that feels like "
            "a real SaaS dashboard, not a plain HTML document."
        ),
        backstory=(
            "You are a senior UI/UX designer for data and analytics products. "
            "You specialize in visual hierarchy, card systems, spacing, section composition, "
            "badges, tables, accordions, executive readability, responsive layouts, and dark mode."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    frontend_developer = Agent(
        role="Frontend Developer",
        goal=(
            "Implement the final approved report as polished raw HTML using Tailwind utility classes "
            "and daisyUI-style composition for direct frontend rendering."
        ),
        backstory=(
            "You build premium SaaS dashboard interfaces. You use clean grids, strong card hierarchy, "
            "responsive tables, accordions, badges, alerts, spacing systems, and dark mode. "
            "You do not output markdown."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    backend_approver = Agent(
        role="Backend Approver",
        goal=(
            "Approve only output that is analytically honest, visually strong, structurally correct, "
            "and production-ready for backend storage and frontend rendering."
        ),
        backstory=(
            "You are the final quality gate. You reject invented SEO claims, fake guarantees, weak layout, "
            "dense unreadable sections, flat hierarchy, poor tables, and generic dashboard output."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    finalizer = Agent(
        role="Final Report Finalizer",
        goal="Prepare the final approved keyword opportunity report as raw HTML only.",
        backstory=(
            "You preserve the approved structure, make only safe final cleanup edits, "
            "and output raw HTML only."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    keyword_task = Task(
        description=(
            f"Website URL: {website_url}\n"
            f"Brand name: {brand_name or 'N/A'}\n"
            f"Tone: {tone}\n\n"
            "Build a realistic keyword opportunity strategy using the website context and detected topical signals.\n\n"
            f"Site context JSON:\n{json.dumps(site_context, ensure_ascii=False, indent=2)}\n\n"
            f"Seed topics JSON:\n{json.dumps(seed_topics, ensure_ascii=False, indent=2)}\n\n"
            "Required output:\n"
            "1. Primary keyword clusters\n"
            "2. Long-tail keyword opportunities\n"
            "3. Search intent per keyword\n"
            "4. Why each keyword matters to this website\n"
            "5. Priority label: high / medium / low\n"
            "6. Shortlist of the best keywords to attack first\n"
            "7. Quick-win keywords vs harder strategic keywords\n\n"
            "Rules:\n"
            "- Stay relevant to the actual offer of the website.\n"
            "- Avoid broad irrelevant SEO vanity terms.\n"
            "- Be commercially realistic.\n"
        ),
        expected_output="A structured keyword strategy with clusters, priorities, and attack recommendations.",
        agent=keyword_strategist,
    )

    competitor_task = Task(
        description=(
            f"Website URL: {website_url}\n\n"
            "Use the SERP research and keyword strategy to identify real search competitors by keyword.\n\n"
            f"SERP research JSON:\n{json.dumps(serp_research, ensure_ascii=False, indent=2)}\n\n"
            "Required output:\n"
            "1. Top competing domains/pages per keyword where inferable\n"
            "2. Why those competitors are strong\n"
            "3. Whether the SERP looks beatable, moderately competitive, or crowded\n"
            "4. Likely content/page format in the SERP\n"
            "5. Where this website appears weaker or stronger\n"
            "6. Clear caveats when the search evidence is weak or incomplete\n\n"
            "Rules:\n"
            "- Do not invent exact ranking positions.\n"
            "- Focus on actual SERP competition, not generic business competition.\n"
        ),
        expected_output="A keyword-by-keyword SERP competitor analysis grounded in available evidence.",
        agent=competitor_analyst,
        context=[keyword_task],
    )

    difficulty_task = Task(
        description=(
            f"Website URL: {website_url}\n\n"
            "Estimate ranking difficulty for the keyword opportunities using website context, keyword strategy, "
            "and competitor analysis.\n\n"
            f"Site context JSON:\n{json.dumps(site_context, ensure_ascii=False, indent=2)}\n\n"
            f"SERP research JSON:\n{json.dumps(serp_research, ensure_ascii=False, indent=2)}\n\n"
            "Required output:\n"
            "For each important keyword provide:\n"
            "1. Difficulty score from 1 to 100\n"
            "2. Difficulty band: easy / moderate / hard / very hard\n"
            "3. Current-state page-one likelihood: low / medium / high\n"
            "4. Long-term potential: weak / plausible / strong-fit\n"
            "5. Main blockers\n"
            "6. What would be required to compete\n"
            "7. Recommended page type to target the keyword\n"
            "8. Whether first position is unrealistic, plausible, or strategically worth pursuing\n\n"
            "Rules:\n"
            "- No ranking guarantees.\n"
            "- Be conservative.\n"
            "- Distinguish evidence from inference.\n"
        ),
        expected_output="A realistic keyword difficulty assessment with blockers, effort, and page strategy.",
        agent=difficulty_analyst,
        context=[keyword_task, competitor_task],
    )

    design_task = Task(
        description=(
            "Create a complete UI/UX blueprint for the final keyword opportunity report.\n\n"
            "You are not writing HTML. You are defining exactly how the interface should look and behave.\n\n"
            "Required output:\n"
            "1. Page layout structure from top to bottom\n"
            "2. Section ordering and why\n"
            "3. Visual hierarchy rules\n"
            "4. Typography hierarchy\n"
            "5. Grid and spacing rules\n"
            "6. Card layout recommendations\n"
            "7. Table design recommendations\n"
            "8. Accordion/collapse recommendations\n"
            "9. Badge semantics for priority, intent, difficulty, and confidence\n"
            "10. Warning/callout design for risk and limitations\n"
            "11. Mobile responsiveness rules\n"
            "12. Light/dark mode design guidance\n"
            "13. Exact component guidance for these sections:\n"
            "   - hero summary\n"
            "   - best keyword opportunities\n"
            "   - quick wins\n"
            "   - difficulty matrix\n"
            "   - competitor comparison\n"
            "   - keyword clusters\n"
            "   - recommended page strategy\n"
            "   - long-term bets\n"
            "   - action roadmap\n"
            "   - risks and limitations\n\n"
            "Hard rules:\n"
            "- The output must feel premium.\n"
            "- Avoid document-like layout.\n"
            "- Avoid wall-of-text sections.\n"
            "- Make the keyword opportunity section visually dominant.\n"
            "- Make the difficulty matrix highly scannable.\n"
            "- Keep implementation practical for Tailwind and daisyUI-style HTML.\n"
        ),
        expected_output="A concrete UI/UX blueprint with implementation-ready design guidance.",
        agent=ui_ux_designer,
        context=[keyword_task, competitor_task, difficulty_task],
    )

    html_task = Task(
        description=(
            "Convert the approved report into raw HTML only.\n\n"
            "You must follow the UI/UX Designer blueprint exactly.\n\n"
            "Hard rules:\n"
            "- Output raw HTML only\n"
            "- No markdown\n"
            "- No code fences\n"
            "- Do not include <html>, <head>, or <body>\n"
            "- Use Tailwind utility classes\n"
            "- Use daisyUI-style conventions\n"
            "- Support light and dark mode\n"
            "- Use premium dashboard hierarchy\n"
            "- Use responsive layouts\n"
            "- Include at most one small <style> block for minor polish only\n\n"
            "Mandatory sections in this order:\n"
            "1. Hero summary\n"
            "2. Best keyword opportunities\n"
            "3. Quick wins\n"
            "4. Difficulty matrix\n"
            "5. Competitor comparison\n"
            "6. Keyword clusters\n"
            "7. Recommended page strategy\n"
            "8. Long-term bets\n"
            "9. Action roadmap\n"
            "10. Risks and limitations\n\n"
            "Mandatory UI requirements:\n"
            "- Hero must feel like a premium dashboard header with summary, market framing, and confidence context\n"
            "- Best keyword opportunities must be shown as strong cards in a responsive grid\n"
            "- Quick wins must be separate from long-term bets\n"
            "- Difficulty matrix must be a readable compare-friendly table\n"
            "- Competitor section must use a strong table or grouped cards\n"
            "- Keyword clusters must be visually grouped by topic\n"
            "- Recommended page strategy must be actionable and structured\n"
            "- Risks and limitations must be rendered as a distinct alert/callout area\n"
            "- Use badges for difficulty, priority, intent, and confidence\n"
            "- Use cards, alerts, accordions, dividers, grids, and table containers where useful\n"
            "- Avoid dense paragraphs and flat layout\n\n"
            "Data integrity rules:\n"
            "- Use only the context from prior tasks and the provided structured data\n"
            "- Do not invent rank guarantees or fake SEO metrics\n"
            "- Clearly communicate uncertainty where appropriate\n\n"
            "The final UI must feel like a real modern analytics SaaS dashboard page."
        ),
        expected_output="A polished frontend-ready raw HTML keyword opportunity dashboard.",
        agent=frontend_developer,
        context=[keyword_task, competitor_task, difficulty_task, design_task],
    )

    approval_task = Task(
        description=(
            "Review the final output and improve it if necessary.\n\n"
            "Approval rules:\n"
            "- Final output must be raw HTML only\n"
            "- No invented ranking guarantees\n"
            "- No fake authority metrics\n"
            "- Must clearly distinguish evidence from inference\n"
            "- Must be useful for backend storage and frontend rendering\n"
            "- Must have strong visual hierarchy\n"
            "- Must not look like plain markdown converted to HTML\n"
            "- Must use premium dashboard section composition\n"
            "- Must have readable tables\n"
            "- Must have visually strong keyword cards\n"
            "- Must have a useful difficulty matrix\n"
            "- Must have clear grouping and spacing\n"
            "- Must look good in light and dark mode\n\n"
            "If the UI feels generic, dense, flat, or weak, reject it and improve it."
        ),
        expected_output="Final approved raw HTML only.",
        agent=backend_approver,
        context=[keyword_task, competitor_task, difficulty_task, design_task, html_task],
    )

    finalize_task = Task(
        description=(
            "Prepare the final publishable keyword opportunity report.\n\n"
            "Rules:\n"
            "1. Output raw HTML only.\n"
            "2. Keep the approved structure and make only minimal safe fixes if needed.\n"
            "3. Do not add markdown fences.\n"
            "4. Do not add commentary.\n"
            "5. Preserve light and dark mode support.\n"
        ),
        expected_output="A final raw HTML keyword opportunity report.",
        agent=finalizer,
        context=[approval_task],
    )

    return Crew(
        agents=[
            keyword_strategist,
            competitor_analyst,
            difficulty_analyst,
            ui_ux_designer,
            frontend_developer,
            backend_approver,
            finalizer,
        ],
        tasks=[
            keyword_task,
            competitor_task,
            difficulty_task,
            design_task,
            html_task,
            approval_task,
            finalize_task,
        ],
        process=Process.sequential,
        verbose=True,
    )