import json
import os
import re
from typing import List, Type
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from pydantic import BaseModel, Field

from crewai import Agent, Crew, Task, Process, LLM
from crewai.tools import BaseTool


APP_NAME = "Arka: Smart Analyzer"
APP_STORE_URL = "https://apps.shopify.com/arka-smart-analyzer"
LANDING_PAGE_URL = "https://web.arkaanalyzer.com/"


def build_llm():
    model = os.getenv("OPENAI_MODEL_NAME", "gpt-4o-mini")
    return LLM(model=model, temperature=0.1)


def _http_get(url: str, timeout: int = 25) -> str:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        )
    }
    response = requests.get(url, headers=headers, timeout=timeout)
    response.raise_for_status()
    return response.text


def _clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def _extract_meta(soup: BeautifulSoup, *names: str) -> str:
    for name in names:
        tag = soup.find("meta", attrs={"property": name}) or soup.find(
            "meta", attrs={"name": name}
        )
        if tag and tag.get("content"):
            return _clean_text(tag["content"])
    return ""


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


def _extract_interesting_lines(text: str) -> dict:
    lines = re.split(r"(?<=[.!?])\s+|\n+", text)
    lines = [_clean_text(line) for line in lines if _clean_text(line)]

    def pick(keywords: List[str], limit: int = 12) -> List[str]:
        out = []
        for line in lines:
            low = line.lower()
            if any(keyword in low for keyword in keywords):
                out.append(line)
            if len(out) >= limit:
                break
        return out

    return {
        "pricing_mentions": pick(
            ["$", "price", "pricing", "plan", "free", "month", "year", "trial"]
        ),
        "rating_mentions": pick(["rating", "stars", "star", "rated", "reviews"]),
        "feature_mentions": pick(
            [
                "analytics",
                "dashboard",
                "report",
                "reports",
                "profit",
                "tracking",
                "sales",
                "orders",
                "inventory",
                "customer",
                "cohort",
                "ltv",
                "retention",
                "segmentation",
                "funnel",
                "ai",
                "recommendation",
                "persona",
                "abandon",
            ]
        ),
        "positioning_mentions": pick(
            [
                "insights",
                "real-time",
                "embedded",
                "shopify admin",
                "ai-powered",
                "turn your",
                "optimize",
                "grow",
                "revenue",
            ]
        ),
    }


class ReadUrlToolInput(BaseModel):
    url: str = Field(..., description="Full public URL to read and extract content from.")


class ReadUrlTool(BaseTool):
    name: str = "read_url"
    description: str = (
        "Read a public URL and return structured page data including title, meta description, "
        "headings, bullet points, visible text excerpt, evidence lines, and image candidates."
    )
    args_schema: Type[BaseModel] = ReadUrlToolInput

    def _run(self, url: str) -> str:
        try:
            html = _http_get(url)
            soup = BeautifulSoup(html, "html.parser")

            for tag in soup(["script", "style", "noscript", "iframe", "svg"]):
                tag.decompose()

            title = _clean_text(soup.title.string if soup.title and soup.title.string else "")
            meta_description = _extract_meta(
                soup,
                "description",
                "og:description",
                "twitter:description",
            )

            headings = {
                "h1": [_clean_text(h.get_text(" ", strip=True)) for h in soup.find_all("h1")][:10],
                "h2": [_clean_text(h.get_text(" ", strip=True)) for h in soup.find_all("h2")][:20],
                "h3": [_clean_text(h.get_text(" ", strip=True)) for h in soup.find_all("h3")][:30],
            }

            bullet_points = [
                _clean_text(li.get_text(" ", strip=True))
                for li in soup.find_all("li")
                if _clean_text(li.get_text(" ", strip=True))
            ][:50]

            text = _clean_text(soup.get_text(separator=" ", strip=True))
            evidence = _extract_interesting_lines(text)

            result = {
                "url": url,
                "title": title,
                "meta_description": meta_description,
                "headings": headings,
                "bullet_points": bullet_points,
                "text_excerpt": text[:20000],
                "image_candidates": _extract_candidate_images(soup, url),
                "evidence": evidence,
            }
            return json.dumps(result, ensure_ascii=False)

        except Exception as exc:
            return json.dumps(
                {
                    "url": url,
                    "error": f"Failed to read URL: {str(exc)}",
                    "title": "",
                    "meta_description": "",
                    "headings": {"h1": [], "h2": [], "h3": []},
                    "bullet_points": [],
                    "text_excerpt": "",
                    "image_candidates": [],
                    "evidence": {
                        "pricing_mentions": [],
                        "rating_mentions": [],
                        "feature_mentions": [],
                        "positioning_mentions": [],
                    },
                },
                ensure_ascii=False,
            )


def _normalize_competitors(payload_competitors):
    if not isinstance(payload_competitors, list):
        return []

    normalized = []

    for item in payload_competitors:
        if not isinstance(item, dict):
            continue

        competitor_id = str(item.get("id") or item.get("_id") or "").strip()
        name = str(item.get("name") or "").strip()
        description = str(item.get("description") or "").strip()
        status = str(item.get("status") or "active").strip().lower()

        raw_links = item.get("links", [])
        if not isinstance(raw_links, list):
            raw_links = []

        links = [
            str(link).strip()
            for link in raw_links
            if isinstance(link, str) and str(link).strip()
        ]

        if not name or not links:
            continue

        normalized.append(
            {
                "id": competitor_id,
                "name": name,
                "description": description,
                "status": status if status in {"active", "inactive"} else "active",
                "links": links,
            }
        )

    return normalized


def _apply_selection_rules(competitors, selected_ids, excluded_ids, max_selected):
    selected_ids = {str(item).strip() for item in selected_ids if str(item).strip()}
    excluded_ids = {str(item).strip() for item in excluded_ids if str(item).strip()}

    active_competitors = [item for item in competitors if item.get("status") == "active"]

    if selected_ids:
        active_competitors = [
            item for item in active_competitors if item.get("id") in selected_ids
        ]

    if excluded_ids:
        active_competitors = [
            item for item in active_competitors if item.get("id") not in excluded_ids
        ]

    if max_selected and max_selected > 0:
        active_competitors = active_competitors[:max_selected]

    return active_competitors


def create_manage_competitor_analysis_crew(payload):
    payload = payload or {}

    app_name = str(payload.get("app_name") or APP_NAME).strip()
    app_store_url = str(payload.get("app_store_url") or APP_STORE_URL).strip()
    landing_page_url = str(payload.get("landing_page_url") or LANDING_PAGE_URL).strip()
    analysis_goal = str(
        payload.get("analysis_goal")
        or "Compare the selected competitors against my app, identify strengths, weaknesses, positioning gaps, and catch-up priorities."
    ).strip()

    competitors = _normalize_competitors(payload.get("competitors", []))

    selected_competitor_ids = payload.get("selected_competitor_ids", [])
    if not isinstance(selected_competitor_ids, list):
        selected_competitor_ids = []

    excluded_competitor_ids = payload.get("excluded_competitor_ids", [])
    if not isinstance(excluded_competitor_ids, list):
        excluded_competitor_ids = []

    max_selected_competitors = int(payload.get("max_selected_competitors", 0) or 0)

    final_competitors = _apply_selection_rules(
        competitors=competitors,
        selected_ids=selected_competitor_ids,
        excluded_ids=excluded_competitor_ids,
        max_selected=max_selected_competitors,
    )

    if not final_competitors:
        raise ValueError(
            "No competitors remain after applying selected_competitor_ids, excluded_competitor_ids, and max_selected_competitors."
        )

    llm = build_llm()
    read_url_tool = ReadUrlTool()

    source_researcher = Agent(
        role="First-Party Product Source Researcher",
        goal=(
            "Read the app store page and landing page for the target product, extract grounded evidence, "
            "and build a precise target-product profile without inventing facts."
        ),
        backstory=(
            "You are a strict first-party source researcher. You treat the Shopify App Store page and "
            "the landing page as separate sources, compare them, detect mismatches, and preserve source provenance."
        ),
        tools=[read_url_tool],
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    competitor_researcher = Agent(
        role="Competitor Evidence Researcher",
        goal=(
            "Read the selected competitor pages directly, extract grounded evidence, and compare each competitor "
            "against the target product individually."
        ),
        backstory=(
            "You are a strict market evidence researcher. You do not add extra competitors. You compare only the "
            "submitted competitors and keep unsupported pricing, rating, or review values as N/A."
        ),
        tools=[read_url_tool],
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    strategy_analyst = Agent(
        role="Competitive Strategy Analyst",
        goal=(
            "Turn source evidence into product strategy. Produce both individual competitor comparisons and aggregate "
            "cross-competitor conclusions."
        ),
        backstory=(
            "You think like a product strategy lead. You separate fact from inference, identify threats, explain where "
            "the target app is stronger or weaker, and force concrete catch-up priorities."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    uiux_designer = Agent(
        role="UI UX Report Architect",
        goal=(
            "Design a premium report structure that is easy to scan, visually strong, and clearly separates "
            "target-app findings, per-competitor comparisons, and aggregate conclusions."
        ),
        backstory=(
            "You are a SaaS dashboard UI/UX designer. You care about information architecture, hierarchy, density control, "
            "comparison clarity, and executive readability."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    html_developer = Agent(
        role="Frontend HTML Report Developer",
        goal=(
            "Convert the approved analysis and report structure into polished raw HTML that can be injected directly "
            "into the frontend."
        ),
        backstory=(
            "You write semantic dashboard HTML with Tailwind utility classes and daisyUI-friendly structure. "
            "You support light and dark mode, return raw HTML only, and keep code clean and maintainable."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    final_reviewer = Agent(
        role="Executive Report Final Reviewer",
        goal=(
            "Reject weak reasoning, invented evidence, poor UI structure, and unclear comparison logic."
        ),
        backstory=(
            "You are the final gatekeeper. You enforce evidence discipline, comparison clarity, and executive-ready presentation."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    target_sources_task = Task(
        description=(
            f"Analyze the target product using both first-party sources.\n\n"
            f"Target app name: {app_name}\n"
            f"Shopify App Store URL: {app_store_url}\n"
            f"Landing page URL: {landing_page_url}\n\n"
            "You must:\n"
            "1. Use the read_url tool on the Shopify App Store page.\n"
            "2. Use the read_url tool on the landing page.\n"
            "3. Build two separate source profiles:\n"
            "   - app_store_profile\n"
            "   - landing_page_profile\n"
            "4. Then build a merged_target_profile.\n"
            "5. Explicitly identify any mismatch in branding, positioning, messaging, pricing, review claims, trust claims, or feature emphasis.\n"
            "6. Extract pricing only if explicitly visible in each source; otherwise use N/A.\n"
            "7. Extract rating and review count only if explicitly visible in each source; otherwise use N/A.\n"
            "8. Extract feature buckets, positioning claims, trust signals, and UX/message signals from each source.\n"
            "9. Preserve source provenance. Every important statement should indicate whether it came from app store, landing page, or both.\n\n"
            "Output structure rules:\n"
            "- Keep app store findings separate from landing page findings.\n"
            "- Then produce a merged target profile.\n"
            "- Then produce a source mismatch / alignment section.\n"
            "- Unsupported numeric values must remain N/A.\n"
            "- Do not smooth over contradictions.\n"
        ),
        expected_output=(
            "A structured target product source report with separate app-store and landing-page profiles, "
            "a merged target profile, and a mismatch/alignment section."
        ),
        agent=source_researcher,
    )

    competitor_research_task = Task(
        description=(
            f"Analyze only the selected competitors below. Do not add any new competitors.\n\n"
            f"Analysis goal:\n{analysis_goal}\n\n"
            f"Selected competitor scope:\n{json.dumps(final_competitors, ensure_ascii=False, indent=2)}\n\n"
            "For each competitor:\n"
            "1. Read the provided public URLs using the read_url tool.\n"
            "2. Build one grounded competitor profile.\n"
            "3. Extract positioning.\n"
            "4. Extract core features.\n"
            "5. Extract pricing only if explicitly visible; otherwise N/A.\n"
            "6. Extract rating only if explicitly visible; otherwise N/A.\n"
            "7. Extract review count only if explicitly visible; otherwise N/A.\n"
            "8. Extract trust signals, UX/message signals, and differentiation signals if publicly visible.\n"
            "9. Preserve short evidence notes.\n\n"
            "Rules:\n"
            "- Do not discover new competitors.\n"
            "- Do not replace competitors.\n"
            "- Stay inside the provided competitor scope.\n"
            "- Use stored description only as supporting context.\n"
            "- Public page evidence is primary truth.\n"
            "- Unsupported numeric values must remain N/A.\n"
        ),
        expected_output=(
            "A structured evidence-based report for only the selected competitors."
        ),
        agent=competitor_researcher,
        context=[target_sources_task],
    )

    individual_comparison_task = Task(
        description=(
            f"Create an individual comparison for each selected competitor against {app_name}.\n\n"
            "Comparison rules:\n"
            "1. Compare each competitor separately against the merged target profile.\n"
            "2. For each competitor create a dedicated section with:\n"
            "   - competitor overview\n"
            "   - why it matters\n"
            "   - direct overlap with target app\n"
            "   - where target app is stronger\n"
            "   - where competitor is stronger\n"
            "   - positioning differences\n"
            "   - pricing/trust/UX implications\n"
            "   - concrete catch-up actions\n"
            "   - differentiation opportunities\n"
            "3. Make the result clearly separated competitor by competitor.\n"
            "4. Preserve N/A for unsupported numeric fields.\n"
            "5. Separate verified fact from inference where needed.\n"
        ),
        expected_output=(
            "A competitor-by-competitor comparison report with clearly separated sections for each submitted competitor."
        ),
        agent=strategy_analyst,
        context=[target_sources_task, competitor_research_task],
    )

    aggregate_comparison_task = Task(
        description=(
            f"Now create an aggregate competitive analysis for {app_name} across the submitted competitors.\n\n"
            "Required sections:\n"
            "1. Executive summary\n"
            "2. What the target app consistently does well across the competitor set\n"
            "3. What the target app consistently lacks across the competitor set\n"
            "4. Message and positioning gaps\n"
            "5. Pricing and packaging implications\n"
            "6. UX and trust implications\n"
            "7. Comparison matrix across all competitors\n"
            "8. Catch-up priorities\n"
            "9. Differentiation opportunities\n"
            "10. Strategic recommendations\n"
            "11. 30/60/90 day direction\n\n"
            "Rules:\n"
            "- This section is aggregate, not per competitor.\n"
            "- It must build on the individual comparisons.\n"
            "- Recommendations must follow from evidence.\n"
            "- Preserve N/A for unsupported numeric values.\n"
        ),
        expected_output=(
            "A full aggregate analysis across the selected competitors."
        ),
        agent=strategy_analyst,
        context=[target_sources_task, competitor_research_task, individual_comparison_task],
    )

    design_task = Task(
        description=(
            "Design the information architecture for the final report.\n\n"
            "The final report must clearly separate these layers:\n"
            "1. Target product source analysis\n"
            "2. Source alignment / mismatch between app store and landing page\n"
            "3. Individual competitor comparisons\n"
            "4. Aggregate cross-competitor comparison\n"
            "5. Strategic recommendations\n\n"
            "Required UI sections:\n"
            "- hero header\n"
            "- how to read this report strip\n"
            "- source summary cards\n"
            "- target product sources section with app store and landing page shown separately\n"
            "- source mismatch / alignment section\n"
            "- submitted competitors overview section\n"
            "- individual competitor comparison cards or sections\n"
            "- aggregate comparison matrix\n"
            "- catch-up priorities section\n"
            "- differentiation opportunities section\n"
            "- 30/60/90 day direction section\n"
            "- final notes section\n\n"
            "Design rules:\n"
            "- premium SaaS dashboard style\n"
            "- strong hierarchy and spacing\n"
            "- easy scanning\n"
            "- separate individual vs aggregate sections clearly\n"
            "- include visible source labels such as App Store, Landing Page, Competitor, Verified, Inference where helpful\n"
            "- unsupported numeric fields must display as N/A\n"
        ),
        expected_output="A detailed UI structure and report design plan.",
        agent=uiux_designer,
        context=[target_sources_task, individual_comparison_task, aggregate_comparison_task],
    )

    html_task = Task(
        description=(
            "Convert the approved analysis and design into raw HTML only.\n\n"
            "Critical rules:\n"
            "- Output raw HTML only.\n"
            "- No markdown.\n"
            "- No code fences.\n"
            "- Do not include <html>, <head>, or <body>.\n"
            "- Use Tailwind utility classes and daisyUI-friendly structure.\n"
            "- Include one small embedded <style> block at the top for minor polish only.\n"
            "- Support light and dark mode.\n"
            "- Ensure the HTML renders cleanly inside a React container.\n\n"
            "Required report structure:\n"
            "- outer wrapper div\n"
            "- hero section\n"
            "- explanation strip\n"
            "- first-party source summary cards\n"
            "- separate app store profile block\n"
            "- separate landing page profile block\n"
            "- source mismatch/alignment block\n"
            "- submitted competitors overview block\n"
            "- clearly separated competitor-by-competitor comparison sections\n"
            "- aggregate comparison matrix/table\n"
            "- catch-up priorities block\n"
            "- differentiation opportunities block\n"
            "- strategic recommendations block\n"
            "- 30/60/90 day direction block\n"
            "- final notes block\n\n"
            "Data integrity rules:\n"
            "- Unsupported pricing, rating, or review count must display as N/A.\n"
            "- Do not invent approximate numeric values.\n"
            "- Make individual competitor sections visibly separate from the aggregate section.\n"
            "- Make app store vs landing page findings visibly separate before the merged conclusion.\n"
        ),
        expected_output="A polished raw HTML report ready for direct frontend injection.",
        agent=html_developer,
        context=[target_sources_task, individual_comparison_task, aggregate_comparison_task, design_task],
    )

    final_review_task = Task(
        description=(
            "Review the final HTML and improve it if needed.\n\n"
            "Approval rules:\n"
            "- Final output must remain raw HTML only.\n"
            "- The report must clearly separate app store findings, landing page findings, merged target profile, "
            "individual competitor comparisons, and aggregate conclusions.\n"
            "- No extra competitors may appear.\n"
            "- Unsupported pricing, rating, and review count must display as N/A.\n"
            "- Reject invented evidence, invented numeric values, and generic filler.\n"
            "- Reject weak UI structure and unclear comparison logic.\n"
        ),
        expected_output="A final approved raw HTML competitor analysis report.",
        agent=final_reviewer,
        context=[
            target_sources_task,
            competitor_research_task,
            individual_comparison_task,
            aggregate_comparison_task,
            design_task,
            html_task,
        ],
    )

    return Crew(
        agents=[
            source_researcher,
            competitor_researcher,
            strategy_analyst,
            uiux_designer,
            html_developer,
            final_reviewer,
        ],
        tasks=[
            target_sources_task,
            competitor_research_task,
            individual_comparison_task,
            aggregate_comparison_task,
            design_task,
            html_task,
            final_review_task,
        ],
        process=Process.sequential,
        verbose=True,
    )