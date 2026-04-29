import json
import os
import re
from typing import List, Set, Type
from urllib.parse import quote_plus, urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from pydantic import BaseModel, Field

from crewai import Agent, Crew, Task, Process, LLM
from crewai.tools import BaseTool


APP_NAME = "Arka: Smart Analyzer"
APP_URL = "https://apps.shopify.com/arka-smart-analyzer"
MAX_COMPETITORS = 10

DEFAULT_DISCOVERY_QUERIES = [
    "shopify analytics",
    "shopify sales analytics",
    "shopify reporting",
    "shopify dashboard analytics",
    "shopify profit analytics",
]

SHOPIFY_RESERVED_PATHS: Set[str] = {
    "",
    "search",
    "partners",
    "developers",
    "about",
    "pricing",
    "blog",
    "careers",
    "legal",
    "privacy",
    "terms",
    "login",
}


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
        "pricing_mentions": pick(["$", "price", "pricing", "plan", "free", "month", "year"]),
        "rating_mentions": pick(["rating", "stars", "star", "rated"]),
        "review_mentions": pick(["review", "reviews"]),
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
            ]
        ),
    }


class ReadUrlToolInput(BaseModel):
    url: str = Field(..., description="Full URL to read and extract content from.")


class ReadUrlTool(BaseTool):
    name: str = "read_url"
    description: str = (
        "Read a public URL and return structured page data including title, meta description, "
        "headings, visible text excerpt, evidence lines, and image candidates."
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
            ][:40]

            text = _clean_text(soup.get_text(separator=" ", strip=True))
            evidence = _extract_interesting_lines(text)

            result = {
                "url": url,
                "title": title,
                "meta_description": meta_description,
                "headings": headings,
                "bullet_points": bullet_points,
                "text_excerpt": text[:18000],
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
                        "review_mentions": [],
                        "feature_mentions": [],
                    },
                },
                ensure_ascii=False,
            )


class ShopifySearchToolInput(BaseModel):
    query: str = Field(..., description="Search query for Shopify App Store.")
    max_results: int = Field(
        default=10,
        ge=1,
        le=25,
        description="Maximum number of Shopify app listing URLs to return.",
    )


class ShopifyAppSearchTool(BaseTool):
    name: str = "shopify_app_search"
    description: str = (
        "Search the Shopify App Store results page and return candidate app listing URLs. "
        "This is a free HTML-based search fallback."
    )
    args_schema: Type[BaseModel] = ShopifySearchToolInput

    def _run(self, query: str, max_results: int = 10) -> str:
        search_url = f"https://apps.shopify.com/search?q={quote_plus(query)}"

        try:
            html = _http_get(search_url)
            soup = BeautifulSoup(html, "html.parser")

            candidates = []
            seen = set()

            for anchor in soup.find_all("a", href=True):
                href = anchor["href"].strip()
                absolute = urljoin("https://apps.shopify.com", href)
                parsed = urlparse(absolute)

                if parsed.netloc != "apps.shopify.com":
                    continue

                path = parsed.path.strip("/")
                if not path:
                    continue

                parts = [part for part in path.split("/") if part]
                if len(parts) != 1:
                    continue

                slug = parts[0]
                if slug in SHOPIFY_RESERVED_PATHS:
                    continue

                name = _clean_text(anchor.get_text(" ", strip=True))
                if not name:
                    name = slug.replace("-", " ").title()

                if absolute not in seen:
                    seen.add(absolute)
                    candidates.append({"name": name, "url": absolute})

                if len(candidates) >= max_results:
                    break

            return json.dumps(
                {
                    "query": query,
                    "search_url": search_url,
                    "candidates": candidates[:max_results],
                },
                ensure_ascii=False,
            )

        except Exception as exc:
            return json.dumps(
                {
                    "query": query,
                    "search_url": search_url,
                    "candidates": [],
                    "error": f"Failed to search Shopify App Store: {str(exc)}",
                },
                ensure_ascii=False,
            )


def create_competitor_analysis_crew(payload=None):
    payload = payload or {}

    app_name = payload.get("app_name", APP_NAME)
    app_url = payload.get("app_url", APP_URL)
    max_competitors = int(payload.get("max_competitors", MAX_COMPETITORS))

    competitor_urls = payload.get("competitor_urls", [])
    if not isinstance(competitor_urls, list):
        competitor_urls = []

    competitor_urls = [
        url.strip()
        for url in competitor_urls
        if isinstance(url, str) and url.strip()
    ]

    discovery_queries = payload.get("discovery_queries", DEFAULT_DISCOVERY_QUERIES)
    if not isinstance(discovery_queries, list) or not discovery_queries:
        discovery_queries = DEFAULT_DISCOVERY_QUERIES

    discovery_queries = [
        str(query).strip()
        for query in discovery_queries
        if str(query).strip()
    ]

    llm = build_llm()
    read_url_tool = ReadUrlTool()
    shopify_search_tool = ShopifyAppSearchTool()

    researcher = Agent(
        role="Shopify Competitor Researcher",
        goal=(
            "Build a precise profile of the target Shopify app, discover strong competitor candidates, "
            "read the target and competitor pages directly, reject weak matches, and return only grounded evidence."
        ),
        backstory=(
            "You are a strict market intelligence researcher. You identify the target app's real positioning, "
            "discover likely direct competitors from Shopify App Store search results, verify them by reading "
            "their public pages, and reject weak or noisy matches. You never invent pricing, ratings, review counts, "
            "or unsupported features. Missing evidence must remain N/A."
        ),
        tools=[shopify_search_tool, read_url_tool],
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    reviewer = Agent(
        role="Competitor Selection Reviewer",
        goal=(
            "Tighten the competitor set so only strong direct comparables remain. "
            "Reject weak overlap, broad tools, and noisy candidates."
        ),
        backstory=(
            "You are a strict reviewer. You care about match quality, evidence discipline, and commercial usefulness. "
            "You force clean competitor selection and reject poor comparables."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    analyst = Agent(
        role="Competitive Intelligence Analyst",
        goal=(
            "Turn the reviewed research into a sharp competitive analysis that explains who the real competitors are, "
            "where the target app is stronger, where it is weaker, and what it must do to catch up."
        ),
        backstory=(
            "You are a product strategy analyst. You separate verified fact from inference, avoid filler, and force the "
            "output to be commercially useful. You identify concrete catch-up actions, not vague recommendations."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    designer = Agent(
        role="Product Report Designer",
        goal=(
            "Design the final report as a premium dashboard-style HTML experience that is easy to scan, visually strong, "
            "and self-explanatory."
        ),
        backstory=(
            "You are a UI/UX designer for internal SaaS dashboards. You structure dense information into elegant cards, "
            "tables, badges, section intros, callouts, and strong visual hierarchy."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    frontend_developer = Agent(
        role="Frontend Report Developer",
        goal=(
            "Convert the approved analysis and design into polished raw HTML that can be injected directly into a React container."
        ),
        backstory=(
            "You are a frontend developer focused on semantic dashboard HTML. You use Tailwind utility classes and daisyUI v5, "
            "support light and dark mode, and produce only raw HTML."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    final_reviewer = Agent(
        role="Final Report Reviewer",
        goal=(
            "Reject weak analysis, weak structure, invented metrics, and ugly presentation. "
            "Approve only an executive-ready HTML deliverable."
        ),
        backstory=(
            "You are the final gatekeeper. You think like a product lead, design reviewer, and executive audience combined. "
            "Unsupported numeric values must remain N/A."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    app_profile_task = Task(
        description=(
            f"Analyze this Shopify app listing first using the read_url tool: {app_url}\n\n"
            "Objective:\n"
            "Build a precise profile of the target app before discovering competitors.\n\n"
            "You must:\n"
            "1. Use the read_url tool on the target app URL.\n"
            "2. Extract the app's positioning.\n"
            "3. Extract the main feature buckets.\n"
            "4. Extract public pricing if explicitly visible; otherwise use N/A.\n"
            "5. Extract rating if explicitly visible; otherwise use N/A.\n"
            "6. Extract review count if explicitly visible; otherwise use N/A.\n"
            "7. Determine what type of merchant this app is meant for.\n"
            "8. Produce focused competitor discovery terms.\n"
            "9. Separate verified fact from inference.\n\n"
            "Rules:\n"
            "- Use only visible public information.\n"
            "- Do not guess missing details.\n"
            "- Include short evidence notes for pricing, rating, and review count.\n"
            "- Do not infer numeric values from vague wording.\n"
            "- If any numeric field is not explicitly visible, return N/A.\n"
        ),
        expected_output=(
            "A structured app profile with discovery terms, evidence notes, verified facts, inference notes, "
            "and N/A for unsupported pricing, rating, and review count."
        ),
        agent=researcher,
    )

    discovery_task = Task(
        description=(
            f"Discover competitor candidates for {app_name}.\n\n"
            f"Seed competitor URLs from payload:\n{json.dumps(competitor_urls, ensure_ascii=False, indent=2)}\n\n"
            f"Default discovery queries:\n{json.dumps(discovery_queries, ensure_ascii=False, indent=2)}\n\n"
            "Process:\n"
            "1. Use the app profile context to understand the target app's actual positioning.\n"
            "2. Use the shopify_app_search tool with the most relevant discovery queries.\n"
            "3. Merge discovered candidate URLs with any payload competitor_urls.\n"
            "4. Exclude the target app itself.\n"
            "5. Use the read_url tool on the strongest candidates.\n"
            "6. Reject weak, broad, or noisy matches.\n"
            f"7. Keep at most {max_competitors} strongest direct competitors.\n\n"
            "Selection rules:\n"
            "- Prefer Shopify App Store competitors first.\n"
            "- Reject generic marketing tools, CRO tools, and generic web analytics unless overlap is very strong.\n"
            "- Prefer direct analytics, reporting, profit, dashboard, cohort, and store-performance comparables.\n"
            "- Never invent pricing, ratings, review counts, or unsupported features.\n"
            "- If a field is not explicitly visible, use N/A.\n\n"
            "For each accepted competitor return:\n"
            "1. Name\n"
            "2. URL\n"
            "3. Positioning summary\n"
            "4. Main features\n"
            "5. Pricing summary if explicitly visible, otherwise N/A\n"
            "6. Rating if explicitly visible, otherwise N/A\n"
            "7. Review count if explicitly visible, otherwise N/A\n"
            "8. Why it is a direct competitor\n"
            "9. Stronger than target app in\n"
            "10. Weaker than target app in\n"
            "11. Concrete catch-up actions for the target app\n"
            "12. Evidence notes for pricing, rating, and review count\n\n"
            "Also return a rejected_candidates section with a short rejection reason for each rejected candidate."
        ),
        expected_output=(
            "A candidate discovery report with accepted competitors, rejected candidates, evidence notes, "
            "and N/A for unsupported numeric fields."
        ),
        agent=researcher,
        context=[app_profile_task],
    )

    review_task = Task(
        description=(
            f"Review the discovery output and tighten the competitor set for {app_name}.\n\n"
            "You must:\n"
            "1. Reject weak overlap and noisy candidates.\n"
            "2. Preserve only the strongest direct competitors.\n"
            "3. Make sure each competitor clearly teaches something commercially useful.\n"
            "4. Tighten catch-up notes so they are specific and actionable.\n"
            "5. Preserve N/A for any unsupported pricing, rating, and review count.\n"
            "6. Separate verified fact from inference where needed.\n"
        ),
        expected_output=(
            "A reviewed and tightened direct competitor set with stronger evidence discipline and sharper catch-up notes."
        ),
        agent=reviewer,
        context=[app_profile_task, discovery_task],
    )

    analysis_task = Task(
        description=(
            f"Create a high-quality competitive analysis for {app_name}.\n\n"
            "Required sections:\n"
            "1. Executive summary\n"
            "2. Target app profile\n"
            "3. Direct competitors\n"
            "4. Comparison matrix\n"
            "5. Market patterns\n"
            "6. Target app strengths\n"
            "7. Target app weaknesses\n"
            "8. Catch-up priorities\n"
            "9. Differentiation opportunities\n"
            "10. Strategic recommendations\n"
            "11. 30/60/90 day action direction\n\n"
            "Critical rules:\n"
            "- Be direct.\n"
            "- No filler.\n"
            "- Recommendations must follow from evidence.\n"
            "- Distinguish between must-have catch-up work and nice-to-have differentiation work.\n"
            "- Include product, UX, trust, pricing, positioning, and analytics-depth implications where relevant.\n"
            "- Preserve N/A for unsupported pricing, rating, and review count.\n"
        ),
        expected_output=(
            "A complete structured competitive analysis with concrete catch-up priorities, differentiation opportunities, "
            "and 30/60/90 day direction."
        ),
        agent=analyst,
        context=[app_profile_task, review_task],
    )

    design_task = Task(
        description=(
            "Design the information architecture for the final report as a premium dashboard-style HTML page.\n\n"
            "The page must include:\n"
            "- strong hero header\n"
            "- summary cards\n"
            "- explanation strip near the top telling the reader how to use the report\n"
            "- target app profile section\n"
            "- competitor cards\n"
            "- comparison table\n"
            "- strengths / weaknesses / catch-up priorities section\n"
            "- differentiation opportunities section\n"
            "- strategic recommendations section\n"
            "- 30/60/90 day direction section\n"
            "- final notes section\n\n"
            "Design rules:\n"
            "- modern SaaS dashboard style\n"
            "- excellent spacing and hierarchy\n"
            "- easy scanning\n"
            "- visually clean in light and dark mode\n"
            "- each major section must start with a short explanation paragraph\n"
            "- unsupported metrics must appear clearly as N/A\n"
            "- include a visible note that pricing, rating, and review count appear only when explicitly verified from public sources\n"
        ),
        expected_output="A detailed UI structure and presentation plan for the final HTML report.",
        agent=designer,
        context=[analysis_task],
    )

    html_task = Task(
        description=(
            "Convert the approved analysis and design into raw HTML only.\n\n"
            "Critical rules:\n"
            "- Output raw HTML only.\n"
            "- No markdown.\n"
            "- No code fences.\n"
            "- Do not include <html>, <head>, or <body>.\n"
            "- Use Tailwind utility classes and daisyUI v5-friendly structure.\n"
            "- Include one small embedded <style> block at the top for minor polish only.\n"
            "- Support both light and dark mode.\n"
            "- Ensure the HTML renders cleanly inside this React container:\n"
            "<div className=\"rounded-xl bg-white p-4 shadow-sm dark:bg-gray-900\" dangerouslySetInnerHTML={{ __html: html }} />\n\n"
            "Required UI structure:\n"
            "- outer wrapper div with vertical spacing\n"
            "- hero section\n"
            "- explanation strip\n"
            "- summary cards grid\n"
            "- target app profile card\n"
            "- competitor cards grid\n"
            "- responsive comparison table\n"
            "- strengths / weaknesses / catch-up priorities section\n"
            "- differentiation opportunities section\n"
            "- recommendations cards\n"
            "- 30/60/90 day direction section\n"
            "- final notes section\n\n"
            "Data integrity rules:\n"
            "- Any unsupported pricing, rating, or review count must display as N/A.\n"
            "- Add a visible note near the comparison table that these fields are shown only when explicitly verified from public sources.\n"
            "- Do not invent approximate numeric values.\n"
        ),
        expected_output="A polished raw HTML report ready for direct frontend injection.",
        agent=frontend_developer,
        context=[analysis_task, design_task],
    )

    final_review_task = Task(
        description=(
            "Review the HTML and improve it if necessary.\n\n"
            "Approval rules:\n"
            "- Final output must remain raw HTML only.\n"
            "- Every major section must include a short explanation paragraph.\n"
            "- The competitor set must feel tight, not noisy.\n"
            "- The report must clearly explain what the target app needs to do to catch up.\n"
            "- Presentation must feel premium, not generic.\n"
            "- Unsupported pricing, rating, and review count must display as N/A.\n"
            "- Reject invented or estimated numeric values.\n"
            "- Rewrite weak sections.\n"
        ),
        expected_output="A final approved raw HTML report.",
        agent=final_reviewer,
        context=[app_profile_task, review_task, analysis_task, design_task, html_task],
    )

    return Crew(
        agents=[
            researcher,
            reviewer,
            analyst,
            designer,
            frontend_developer,
            final_reviewer,
        ],
        tasks=[
            app_profile_task,
            discovery_task,
            review_task,
            analysis_task,
            design_task,
            html_task,
            final_review_task,
        ],
        process=Process.sequential,
        verbose=True,
    )