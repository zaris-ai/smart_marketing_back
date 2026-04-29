import json
import os
import re
from typing import Any, Dict, List, Optional, Type
from urllib.parse import parse_qs, quote_plus, unquote, urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from pydantic import BaseModel, Field

from crewai import Agent, Crew, Task, Process, LLM
from crewai.tools import BaseTool


USER_AGENT = "Mozilla/5.0 (compatible; ArkaShopifyTrendsCrew/1.0)"
DDG_HTML_SEARCH_URL = "https://html.duckduckgo.com/html/"


def build_llm():
    model = os.getenv("OPENAI_MODEL_NAME", "gpt-4o-mini")
    return LLM(model=model, temperature=0.15)


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def normalize_url(url: str) -> str:
    url = (url or "").strip()
    if not url:
        return ""
    if not url.startswith(("http://", "https://")):
        url = f"https://{url}"
    return url


def to_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes", "y", "on"}:
            return True
        if normalized in {"false", "0", "no", "n", "off"}:
            return False
    return default


def get_session() -> requests.Session:
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})
    return session


def _http_get(url: str, params: Optional[Dict[str, Any]] = None, timeout: int = 25) -> str:
    session = get_session()
    response = session.get(url, params=params, timeout=timeout, allow_redirects=True)
    response.raise_for_status()
    return response.text


def _extract_meta(soup: BeautifulSoup, *names: str) -> str:
    for name in names:
        tag = soup.find("meta", attrs={"property": name}) or soup.find(
            "meta", attrs={"name": name}
        )
        if tag and tag.get("content"):
            return clean_text(tag["content"])
    return ""


def _resolve_ddg_link(href: str) -> str:
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


def _extract_candidate_images(
    soup: BeautifulSoup, base_url: str, limit: int = 10
) -> List[str]:
    results: List[str] = []

    og_image = _extract_meta(soup, "og:image", "twitter:image")
    if og_image:
        results.append(urljoin(base_url, og_image))

    for img in soup.find_all("img"):
        src = (
            img.get("src")
            or img.get("data-src")
            or img.get("data-lazy-src")
            or img.get("srcset", "").split(",")[0].strip().split(" ")[0]
        )
        if not src:
            continue

        absolute = urljoin(base_url, src)
        if absolute not in results:
            results.append(absolute)

        if len(results) >= limit:
            break

    return results[:limit]


def _extract_evidence_lines(text: str) -> Dict[str, List[str]]:
    lines = re.split(r"(?<=[.!?])\s+|\n+", text)
    lines = [clean_text(line) for line in lines if clean_text(line)]

    def pick(keywords: List[str], limit: int = 12) -> List[str]:
        picked: List[str] = []
        for line in lines:
            low = line.lower()
            if any(keyword in low for keyword in keywords):
                picked.append(line)
            if len(picked) >= limit:
                break
        return picked

    return {
        "trend_mentions": pick(
            [
                "trend",
                "growth",
                "growing",
                "demand",
                "merchant",
                "shopify",
                "store",
                "retail",
                "ecommerce",
                "customer",
                "analytics",
                "automation",
            ]
        ),
        "feature_mentions": pick(
            [
                "feature",
                "analytics",
                "dashboard",
                "report",
                "pricing",
                "segmentation",
                "insight",
                "recommendation",
                "inventory",
                "sales",
                "performance",
            ]
        ),
        "pricing_mentions": pick(
            ["$", "price", "pricing", "plan", "trial", "free", "month", "year"]
        ),
        "review_mentions": pick(
            ["review", "reviews", "rating", "stars", "testimonial"]
        ),
    }


class SearchWebToolInput(BaseModel):
    query: str = Field(..., description="Public web search query.")
    max_results: int = Field(
        default=10,
        ge=1,
        le=20,
        description="Maximum number of search results to return.",
    )


class SearchWebTool(BaseTool):
    name: str = "search_web"
    description: str = (
        "Search the public web using a free HTML search fallback and return result titles, URLs, and snippets."
    )
    args_schema: Type[BaseModel] = SearchWebToolInput

    def _run(self, query: str, max_results: int = 10) -> str:
        try:
            html = _http_get(DDG_HTML_SEARCH_URL, params={"q": query}, timeout=20)
            soup = BeautifulSoup(html, "html.parser")

            results: List[Dict[str, str]] = []
            seen = set()

            for anchor in soup.find_all("a", href=True):
                raw_href = anchor.get("href", "").strip()
                title = clean_text(anchor.get_text(" ", strip=True))
                classes = " ".join(anchor.get("class", []))

                if not raw_href or not title:
                    continue

                href = _resolve_ddg_link(raw_href)
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

            return json.dumps(
                {
                    "query": query,
                    "results": results,
                },
                ensure_ascii=False,
            )

        except Exception as exc:
            return json.dumps(
                {
                    "query": query,
                    "results": [],
                    "error": str(exc),
                },
                ensure_ascii=False,
            )


class ReadUrlToolInput(BaseModel):
    url: str = Field(..., description="Full public URL to read.")


class ReadUrlTool(BaseTool):
    name: str = "read_url"
    description: str = (
        "Read a public URL and return structured page data including title, meta description, headings, "
        "bullet points, visible text excerpt, evidence lines, and image candidates."
    )
    args_schema: Type[BaseModel] = ReadUrlToolInput

    def _run(self, url: str) -> str:
        try:
            html = _http_get(url, timeout=25)
            soup = BeautifulSoup(html, "html.parser")

            for tag in soup(["script", "style", "noscript", "iframe", "svg"]):
                tag.decompose()

            title = clean_text(soup.title.get_text(" ", strip=True)) if soup.title else ""
            meta_description = _extract_meta(
                soup,
                "description",
                "og:description",
                "twitter:description",
            )

            h1s = [clean_text(tag.get_text(" ", strip=True)) for tag in soup.find_all("h1")][:10]
            h2s = [clean_text(tag.get_text(" ", strip=True)) for tag in soup.find_all("h2")][:20]
            h3s = [clean_text(tag.get_text(" ", strip=True)) for tag in soup.find_all("h3")][:30]

            bullet_points = [
                clean_text(li.get_text(" ", strip=True))
                for li in soup.find_all("li")
                if clean_text(li.get_text(" ", strip=True))
            ][:50]

            body_text = clean_text(soup.get_text(" ", strip=True))

            result = {
                "url": url,
                "domain": urlparse(url).netloc.lower(),
                "title": title,
                "meta_description": meta_description,
                "headings": {
                    "h1": h1s,
                    "h2": h2s,
                    "h3": h3s,
                },
                "bullet_points": bullet_points,
                "text_excerpt": body_text[:20000],
                "image_candidates": _extract_candidate_images(soup, url),
                "evidence": _extract_evidence_lines(body_text),
            }

            return json.dumps(result, ensure_ascii=False)

        except Exception as exc:
            return json.dumps(
                {
                    "url": url,
                    "error": f"Failed to read URL: {str(exc)}",
                    "domain": urlparse(url).netloc.lower() if url else "",
                    "title": "",
                    "meta_description": "",
                    "headings": {"h1": [], "h2": [], "h3": []},
                    "bullet_points": [],
                    "text_excerpt": "",
                    "image_candidates": [],
                    "evidence": {
                        "trend_mentions": [],
                        "feature_mentions": [],
                        "pricing_mentions": [],
                        "review_mentions": [],
                    },
                },
                ensure_ascii=False,
            )


def create_shopify_trends_crew(payload):
    topic = clean_text(payload["topic"])
    target_app_name = clean_text(payload.get("target_app_name", "Arka: Smart Analyzer"))
    target_app_url = normalize_url(
        payload.get(
            "target_app_url",
            "https://apps.shopify.com/arka-smart-analyzer",
        )
    )
    target_market = clean_text(payload.get("target_market", "Shopify merchants"))
    tone = clean_text(payload.get("tone", "direct and strategic"))
    publish_goal = clean_text(payload.get("publish_goal", "internal executive report"))
    include_store_analysis = to_bool(payload.get("include_store_analysis", True), True)
    include_app_analysis = to_bool(payload.get("include_app_analysis", True), True)
    include_google_search = to_bool(payload.get("include_google_search", True), True)
    max_apps = int(payload.get("max_apps", 8) or 8)
    max_stores = int(payload.get("max_stores", 8) or 8)
    keywords = payload.get("keywords", [])
    app_urls = [normalize_url(url) for url in payload.get("app_urls", []) if normalize_url(url)]
    store_urls = [normalize_url(url) for url in payload.get("store_urls", []) if normalize_url(url)]
    notes = clean_text(payload.get("notes", ""))

    llm = build_llm()
    search_tool = SearchWebTool()
    read_url_tool = ReadUrlTool()

    trend_researcher = Agent(
        role="Shopify Trend Researcher",
        goal=(
            "Find real Shopify market trends, merchant demand signals, app category movements, "
            "and public search patterns relevant to the requested topic."
        ),
        backstory=(
            "You are a strict research specialist. You separate verified public information from inference, "
            "avoid generic statements, and produce commercially useful findings. You do not invent numbers. "
            "If a claim is weak or indirect, you label it clearly."
        ),
        tools=[search_tool, read_url_tool],
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    app_analyst = Agent(
        role="Shopify App Analyst",
        goal=(
            "Analyze Shopify apps relevant to the topic, including positioning, feature patterns, pricing posture, "
            "review signals when visible, and what the target app should learn from them."
        ),
        backstory=(
            "You are a product and app-market analyst. You compare apps tightly, reject loose matches, "
            "preserve N/A for unsupported fields, and turn public evidence into practical product insight."
        ),
        tools=[search_tool, read_url_tool],
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    store_analyst = Agent(
        role="Shopify Store Analyst",
        goal=(
            "Analyze public Shopify stores related to the topic and identify merchandising, positioning, "
            "conversion, and messaging patterns that reveal merchant demand."
        ),
        backstory=(
            "You are a storefront intelligence analyst. You only use publicly observable information, "
            "avoid invented operational metrics, and focus on patterns that matter to apps, merchants, and growth."
        ),
        tools=[search_tool, read_url_tool],
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    traffic_analyst = Agent(
        role="Traffic Opportunity Analyst",
        goal=(
            "Assess search visibility and traffic opportunity using public search evidence, ranking clues, "
            "query patterns, and discoverability signals without pretending to know private analytics."
        ),
        backstory=(
            "You are a search opportunity analyst. You distinguish first-party truth from public discoverability signals. "
            "You never claim exact third-party traffic unless the number is explicitly public. "
            "You frame external traffic as directional opportunity, not fact."
        ),
        tools=[search_tool, read_url_tool],
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    strategist = Agent(
        role="Insight Strategist",
        goal=(
            "Turn the research into a sharp strategic report with clear implications, priorities, and recommended actions."
        ),
        backstory=(
            "You are an executive strategist. You remove fluff, expose the signal, rank opportunities, "
            "flag weak evidence, and make the report decision-ready."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    designer = Agent(
        role="Product Report Designer",
        goal=(
            "Design the final report as a premium dashboard-style HTML experience with strong hierarchy, "
            "clean scanning, and clear section explanations."
        ),
        backstory=(
            "You are a UI/UX designer for SaaS dashboards and internal reports. "
            "You structure insight-heavy content into elegant sections, cards, tables, badges, and callouts. "
            "You support both light and dark mode and make dense information readable."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    frontend_developer = Agent(
        role="Frontend Report Developer",
        goal=(
            "Convert the approved analysis and design into polished raw HTML ready for direct frontend rendering."
        ),
        backstory=(
            "You are a frontend developer. You write semantic raw HTML using Tailwind utility classes and daisyUI v5 style conventions. "
            "You support both light and dark mode, avoid markdown, avoid code fences, and keep the output injection-ready."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    approver = Agent(
        role="Final Report Approver",
        goal=(
            "Approve only a commercially useful, evidence-aware, visually polished final report."
        ),
        backstory=(
            "You are the final gatekeeper. You reject weak evidence, generic recommendations, invented metrics, "
            "loose competitor selection, messy structure, and poor presentation. "
            "You only approve an executive-ready result."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    finalizer = Agent(
        role="Final Report Finalizer",
        goal="Prepare the final approved trends report as raw HTML only.",
        backstory=(
            "You preserve the approved structure, make only minimal safe edits, "
            "and output raw HTML only."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    publisher = Agent(
        role="Report Publisher",
        goal="Publish only the final approved raw HTML.",
        backstory=(
            "You output only the final raw HTML. No commentary. No markdown fences."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    trend_research_task = Task(
        description=(
            f"Topic: {topic}\n"
            f"Target market: {target_market}\n"
            f"Tone: {tone}\n"
            f"Publish goal: {publish_goal}\n"
            f"Target app name: {target_app_name}\n"
            f"Target app URL: {target_app_url}\n"
            f"Keywords: {', '.join(keywords) if keywords else 'None'}\n"
            f"Additional notes: {notes or 'None'}\n"
            f"Public web search enabled: {include_google_search}\n\n"
            "Research objective:\n"
            "Find the most relevant Shopify trends and demand signals around this topic.\n\n"
            "Tool rules:\n"
            "- Use search_web to find relevant public sources when search is enabled.\n"
            "- Use read_url to inspect the strongest sources directly.\n"
            "- If public web search is disabled, rely only on directly supplied URLs and clearly state the evidence limits.\n\n"
            "Required output:\n"
            "1. Trend summary\n"
            "2. Top market signals\n"
            "3. Top keyword / search demand themes\n"
            "4. What merchants appear to care about most\n"
            "5. What appears rising vs stable vs unclear\n"
            "6. Evidence-backed source list\n"
            "7. Confidence notes\n\n"
            "Rules:\n"
            "- Use grounded public evidence.\n"
            "- Do not invent search volume.\n"
            "- Do not invent traffic.\n"
            "- Separate observed facts from inference.\n"
            "- Be concrete, not generic.\n"
        ),
        expected_output=(
            "A structured Shopify trend research report with evidence-backed signals, demand themes, "
            "merchant pain points, and clear fact-vs-inference separation."
        ),
        agent=trend_researcher,
    )

    app_analysis_task = Task(
        description=(
            f"Analyze Shopify apps relevant to this topic: {topic}\n"
            f"Target app: {target_app_name}\n"
            f"Target app URL: {target_app_url}\n"
            f"App URLs provided directly: {json.dumps(app_urls, ensure_ascii=False)}\n"
            f"Maximum apps to analyze: {max_apps}\n"
            f"Include app analysis: {include_app_analysis}\n\n"
            "Instructions:\n"
            "- If app analysis is disabled, return a short section that says it was skipped by configuration.\n"
            "- If enabled, prefer direct provided app URLs first.\n"
            "- If you need more candidates, use search_web and then inspect pages with read_url.\n\n"
            "Required output:\n"
            "1. Short profile of target app\n"
            "2. List of relevant comparable apps\n"
            "3. Positioning patterns\n"
            "4. Feature patterns\n"
            "5. Pricing patterns if explicitly visible, otherwise N/A\n"
            "6. Reviews / ratings signals only if explicitly visible, otherwise N/A\n"
            "7. What stronger apps communicate better than the target app\n"
            "8. What the target app should build, clarify, improve, or reposition\n\n"
            "Rules:\n"
            "- Prefer Shopify App Store pages and official sites.\n"
            "- Do not invent numbers.\n"
            "- Unsupported fields must be N/A.\n"
            "- Reject weakly related apps.\n"
        ),
        expected_output=(
            "A structured Shopify app analysis with direct comparables, feature and positioning patterns, "
            "and concrete learnings for the target app."
        ),
        agent=app_analyst,
        context=[trend_research_task],
    )

    store_analysis_task = Task(
        description=(
            f"Analyze Shopify stores relevant to this topic: {topic}\n"
            f"Store URLs provided directly: {json.dumps(store_urls, ensure_ascii=False)}\n"
            f"Maximum stores to analyze: {max_stores}\n"
            f"Include store analysis: {include_store_analysis}\n\n"
            "Instructions:\n"
            "- If store analysis is disabled, return a short section that says it was skipped by configuration.\n"
            "- If enabled, use directly provided store URLs first.\n"
            "- If you need more candidates, use search_web and then inspect pages with read_url.\n\n"
            "Required output:\n"
            "1. Relevant store examples\n"
            "2. Common merchandising or messaging patterns\n"
            "3. Product / offer / conversion patterns visible publicly\n"
            "4. Repeated merchant needs implied by these stores\n"
            "5. What these patterns suggest for app opportunity\n"
            "6. Limits of certainty\n\n"
            "Rules:\n"
            "- Use public observable evidence only.\n"
            "- Do not claim hidden analytics.\n"
            "- Do not invent performance metrics.\n"
            "- Focus on practical pattern recognition.\n"
        ),
        expected_output=(
            "A structured Shopify store pattern analysis using public evidence only, with practical implications for app opportunity."
        ),
        agent=store_analyst,
        context=[trend_research_task],
    )

    traffic_analysis_task = Task(
        description=(
            f"Assess traffic opportunity and discoverability for the topic: {topic}\n"
            f"Target app: {target_app_name}\n"
            f"Target app URL: {target_app_url}\n"
            f"Keywords: {', '.join(keywords) if keywords else 'None'}\n"
            f"Public web search enabled: {include_google_search}\n\n"
            "Instructions:\n"
            "- If public web search is disabled, explicitly say that discoverability observations are limited.\n"
            "- If enabled, use search_web and read_url to inspect public search-result patterns and discovered pages.\n\n"
            "Required output:\n"
            "1. Search discoverability observations\n"
            "2. Keyword opportunity themes\n"
            "3. Branded vs non-branded opportunity thinking\n"
            "4. SERP / search-result visibility clues\n"
            "5. Traffic opportunity assessment\n"
            "6. Important caveats explaining what is estimated vs what is factual\n\n"
            "Rules:\n"
            "- Do not claim exact traffic for third parties.\n"
            "- Frame public search evidence as opportunity, not private truth.\n"
            "- Make the caveats explicit.\n"
        ),
        expected_output=(
            "A structured traffic opportunity assessment that clearly separates discoverability signals from exact traffic facts."
        ),
        agent=traffic_analyst,
        context=[trend_research_task, app_analysis_task, store_analysis_task],
    )

    strategy_task = Task(
        description=(
            f"Create a strategic report for topic '{topic}' focused on Shopify trends, apps, store patterns, and traffic opportunity.\n\n"
            "Required sections:\n"
            "1. Executive summary\n"
            "2. What is happening in the market\n"
            "3. App landscape\n"
            "4. Store landscape\n"
            "5. Search / traffic opportunity\n"
            "6. What this means for the target app\n"
            "7. Highest-priority opportunities\n"
            "8. Risks and evidence limitations\n"
            "9. Recommended actions\n"
            "10. Final strategic conclusion\n\n"
            "Rules:\n"
            "- Be direct.\n"
            "- No filler.\n"
            "- Separate fact from inference.\n"
            "- Rank opportunities.\n"
            "- Make recommendations concrete.\n"
            "- Expose blind spots and weak evidence.\n"
        ),
        expected_output=(
            "A complete structured strategic report with ranked opportunities, practical recommendations, and evidence limitations."
        ),
        agent=strategist,
        context=[
            trend_research_task,
            app_analysis_task,
            store_analysis_task,
            traffic_analysis_task,
        ],
    )

    design_task = Task(
        description=(
            "Design the information architecture for a premium HTML report.\n\n"
            "The page must include:\n"
            "- strong hero section\n"
            "- explanation strip near the top explaining how to read the report\n"
            "- executive summary cards\n"
            "- trends section\n"
            "- app analysis section\n"
            "- store analysis section\n"
            "- traffic opportunity section\n"
            "- opportunities and risks section\n"
            "- action priorities section\n"
            "- final notes section\n\n"
            "Design rules:\n"
            "- modern SaaS dashboard style\n"
            "- clean spacing and hierarchy\n"
            "- light and dark mode support\n"
            "- section intro paragraph for every major section\n"
            "- cards, badges, tables, and callouts where useful\n"
            "- executive-ready visual structure\n"
        ),
        expected_output=(
            "A detailed UI structure for a premium dashboard-style report, including section explanations and presentation logic."
        ),
        agent=designer,
        context=[strategy_task],
    )

    html_task = Task(
        description=(
            "Convert the approved analysis and design into raw HTML only.\n\n"
            "Critical rules:\n"
            "- Output raw HTML only.\n"
            "- No markdown.\n"
            "- No code fences.\n"
            "- Do not include <html>, <head>, or <body>.\n"
            "- Use Tailwind utility classes.\n"
            "- Use daisyUI v5 style conventions.\n"
            "- Include one small <style> block at the top for minor polish only.\n"
            "- Support light and dark mode.\n"
            "- Keep the output suitable for direct injection in a frontend container.\n\n"
            "Required UI structure:\n"
            "- outer wrapper\n"
            "- style block\n"
            "- hero section\n"
            "- explanation strip\n"
            "- summary cards grid\n"
            "- trends section with explanation\n"
            "- app analysis section with explanation\n"
            "- store analysis section with explanation\n"
            "- traffic opportunity section with explanation\n"
            "- opportunities and risks section with explanation\n"
            "- action priorities section with explanation\n"
            "- final notes section\n\n"
            "Data integrity rules:\n"
            "- Do not invent metrics.\n"
            "- Unsupported numeric fields must appear as N/A if mentioned.\n"
            "- Traffic language must remain directional unless explicitly verified.\n"
        ),
        expected_output="A polished raw HTML report ready for frontend rendering.",
        agent=frontend_developer,
        context=[strategy_task, design_task],
    )

    approval_task = Task(
        description=(
            "Review the HTML and improve it if necessary.\n\n"
            "Approval rules:\n"
            "- Final output must be raw HTML only.\n"
            "- No markdown or code fences.\n"
            "- Structure must be executive-ready.\n"
            "- Recommendations must be concrete.\n"
            "- Weak evidence must be labeled honestly.\n"
            "- Invented metrics are forbidden.\n"
            "- Presentation must feel premium and clean.\n"
            "- Every major section must begin with a short explanation paragraph.\n"
            "- The final report must be commercially useful, not generic.\n"
        ),
        expected_output="Final approved raw HTML only.",
        agent=approver,
        context=[strategy_task, design_task, html_task],
    )

    finalize_task = Task(
        description=(
            "Prepare the final publishable trends report.\n\n"
            "Rules:\n"
            "1. Output raw HTML only.\n"
            "2. Keep the approved structure and make only minimal safe fixes if needed.\n"
            "3. Do not add markdown fences.\n"
            "4. Do not add commentary.\n"
            "5. Preserve light and dark mode support.\n"
        ),
        expected_output="A final raw HTML trends report.",
        agent=finalizer,
        context=[approval_task],
    )

    publish_task = Task(
        description=(
            "Publish the final approved trends report.\n\n"
            "Rules:\n"
            "1. Output only the final raw HTML.\n"
            "2. No explanations.\n"
            "3. No markdown fences.\n"
        ),
        expected_output="The final released raw HTML trends report.",
        agent=publisher,
        context=[finalize_task],
    )

    return Crew(
        agents=[
            trend_researcher,
            app_analyst,
            store_analyst,
            traffic_analyst,
            strategist,
            designer,
            frontend_developer,
            approver,
            finalizer,
            publisher,
        ],
        tasks=[
            trend_research_task,
            app_analysis_task,
            store_analysis_task,
            traffic_analysis_task,
            strategy_task,
            design_task,
            html_task,
            approval_task,
            finalize_task,
            publish_task,
        ],
        process=Process.sequential,
        verbose=True,
    )