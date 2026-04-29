import json
import os
import re
from typing import List, Type
from urllib.parse import parse_qs, quote_plus, unquote, urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from pydantic import BaseModel, Field

from crewai import Agent, Crew, Task, Process
from crewai.tools import BaseTool

from crews.shared.llm import build_llm


DDG_HTML_SEARCH_URL = "https://html.duckduckgo.com/html/"
DEFAULT_MAX_RESULTS = 10


def _http_get(url: str, params: dict | None = None, timeout: int = 25) -> str:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        )
    }
    response = requests.get(url, params=params, headers=headers, timeout=timeout)
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


def _resolve_duckduckgo_link(href: str) -> str:
    if not href:
        return ""

    parsed = urlparse(href)

    if parsed.netloc.endswith("duckduckgo.com") and parsed.path.startswith("/l/"):
        query = parse_qs(parsed.query)
        uddg = query.get("uddg", [""])[0]
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
        "pricing_mentions": pick(["$", "price", "pricing", "plan", "free", "trial", "month", "year"]),
        "audience_mentions": pick(
            [
                "marketer",
                "merchant",
                "brand",
                "ecommerce",
                "shopify",
                "founder",
                "operator",
                "manager",
                "agency",
                "enterprise",
                "team",
            ]
        ),
        "positioning_mentions": pick(
            [
                "platform",
                "solution",
                "tool",
                "software",
                "analytics",
                "reporting",
                "automation",
                "optimization",
                "growth",
                "campaign",
                "messaging",
                "seo",
                "research",
            ]
        ),
        "channel_mentions": pick(
            [
                "seo",
                "search",
                "content",
                "email",
                "ads",
                "paid",
                "social",
                "acquisition",
                "campaign",
                "funnel",
                "conversion",
            ]
        ),
    }


class SourceItem(BaseModel):
    title: str = Field(..., description="Readable source title")
    url: str = Field(..., description="Source URL")
    note: str = Field(..., description="Why this source matters")


class ModeratedResearchOutput(BaseModel):
    approved: bool
    title: str
    report_markdown: str
    sources: List[SourceItem]
    reviewer_notes: str


class SearchWebToolInput(BaseModel):
    query: str = Field(..., description="Web search query.")
    max_results: int = Field(
        default=DEFAULT_MAX_RESULTS,
        ge=1,
        le=20,
        description="Maximum number of search results to return.",
    )


class SearchWebTool(BaseTool):
    name: str = "search_web"
    description: str = (
        "Search the public web using a free HTML search fallback and return candidate results "
        "with title, URL, and snippet."
    )
    args_schema: Type[BaseModel] = SearchWebToolInput

    def _run(self, query: str, max_results: int = DEFAULT_MAX_RESULTS) -> str:
        try:
            html = _http_get(
                DDG_HTML_SEARCH_URL,
                params={"q": query},
                timeout=25,
            )
            soup = BeautifulSoup(html, "html.parser")

            results = []
            seen = set()

            for anchor in soup.find_all("a", href=True):
                classes = " ".join(anchor.get("class", []))
                href = _resolve_duckduckgo_link(anchor["href"].strip())
                title = _clean_text(anchor.get_text(" ", strip=True))

                if not href or not title:
                    continue

                if not href.startswith("http"):
                    continue

                if "result__a" not in classes and "/l/?" not in anchor["href"] and "uddg=" not in anchor["href"]:
                    continue

                if href in seen:
                    continue

                seen.add(href)

                snippet = ""
                parent = anchor.find_parent()
                if parent:
                    parent_text = _clean_text(parent.get_text(" ", strip=True))
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
                    "error": f"Search failed: {str(exc)}",
                },
                ensure_ascii=False,
            )


class ReadUrlToolInput(BaseModel):
    url: str = Field(..., description="Full URL to read and extract content from.")


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
                        "audience_mentions": [],
                        "positioning_mentions": [],
                        "channel_mentions": [],
                    },
                },
                ensure_ascii=False,
            )


def create_research_crew(payload):
    topic = payload["topic"]
    audience = payload.get("audience", "marketing manager")
    market = payload.get("market", "global market")
    business_context = payload.get("business_context", "")
    goal = payload.get("goal", "")
    product_context = payload.get("product_context", "")
    country = payload.get("country", "us")
    locale = payload.get("locale", "en")
    max_sources = int(payload.get("max_sources", 10))

    llm = build_llm()

    search_tool = SearchWebTool()
    read_url_tool = ReadUrlTool()

    prompt_strategist = Agent(
        role="Marketing Prompt Strategist",
        goal=(
            "Turn broad or rough user input into a precise marketing research brief "
            "that leads to commercially useful, specialized analysis."
        ),
        backstory=(
            "You are a senior marketing strategist. You refine vague requests into sharp research scopes. "
            "You identify audience, buyer intent, market dynamics, competitive angles, positioning, "
            "messaging priorities, content opportunities, acquisition implications, and decision-critical questions."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    source_discovery_reviewer = Agent(
        role="Research Source Discovery Reviewer",
        goal=(
            "Discover and tighten the source set so only high-signal, credible, decision-useful sources remain."
        ),
        backstory=(
            "You are a strict source selector. You prefer official pages, pricing pages, product pages, investor materials, "
            "strong research publications, credible editorial analysis, and serious case studies. "
            "You reject spammy SEO pages, weak listicles, duplicate results, and shallow sources."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
        tools=[search_tool, read_url_tool],
    )

    researcher = Agent(
        role="Marketing Research Analyst",
        goal=(
            "Perform detailed marketing research using live web results and direct page reading, "
            "then produce a specific, evidence-backed report with linked sources."
        ),
        backstory=(
            "You are a senior marketing research analyst. You reject generic summaries. "
            "You focus on demand, intent, competition, positioning, messaging, pricing signals, "
            "SEO opportunities, content gaps, acquisition channels, risks, and strategic implications."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
        tools=[search_tool, read_url_tool],
    )

    moderator = Agent(
        role="Research Quality Moderator",
        goal=(
            "Approve only research that is marketing-focused, specific, detailed, properly sourced, "
            "coherent, and safe to show directly to the user."
        ),
        backstory=(
            "You are a strict editorial reviewer. You reject vague, shallow, repetitive, generic, "
            "unsourced, or fabricated work. Polished but empty output must be rejected."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    finalizer = Agent(
        role="Final Research Finalizer",
        goal=(
            "Turn the approved research into the final clean JSON payload that the backend can store and return."
        ),
        backstory=(
            "You are a strict finalizer. You preserve only grounded sources, keep the report intact, "
            "and output valid JSON matching the required schema."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    publisher = Agent(
        role="Research Publisher",
        goal="Publish only the final approved JSON.",
        backstory=(
            "You only publish the final JSON. "
            "No explanations. No markdown fences."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    prompt_strategy_task = Task(
        description=(
            f"The user gave this raw topic: '{topic}'.\n\n"
            f"Audience: {audience}\n"
            f"Market: {market}\n"
            f"Business context: {business_context or 'Not specified'}\n"
            f"Goal: {goal or 'Not specified'}\n"
            f"Product context: {product_context or 'Not specified'}\n"
            f"Country: {country}\n"
            f"Locale: {locale}\n\n"
            "Your job is to turn this into a specialized marketing research brief.\n\n"
            "Create a focused brief that includes:\n"
            "1. Refined research objective\n"
            "2. Core commercial and marketing questions that must be answered\n"
            "3. Target audience and buyer-intent assumptions\n"
            "4. Competitive angles to investigate\n"
            "5. Positioning and messaging angles to investigate\n"
            "6. Pricing/packaging angles if relevant\n"
            "7. SEO/content angles to investigate\n"
            "8. Channel and campaign angles to investigate\n"
            "9. Risks, constraints, and uncertainties to investigate\n"
            "10. Specific instructions that force the researcher to avoid generic output\n"
            "11. A suggested search plan with 8 to 12 targeted queries\n\n"
            "Rules:\n"
            "- Make the scope sharper, narrower, and more commercially useful than the original input.\n"
            "- Do not perform the research yet.\n"
            "- Do not answer the topic directly.\n"
            "- Produce a brief that forces detailed marketing analysis."
        ),
        expected_output=(
            "A structured marketing research brief that transforms the raw user input "
            "into a precise, high-value research scope."
        ),
        agent=prompt_strategist,
    )

    source_discovery_task = Task(
        description=(
            "Use the research brief as your operating scope.\n\n"
            "Discover the best research sources using the available search and page-reading tools.\n\n"
            "Rules:\n"
            f"1. Use the search_web tool to search multiple targeted queries from the brief.\n"
            f"2. Use the read_url tool to inspect the strongest candidate pages.\n"
            f"3. Keep at most {max_sources} final sources.\n"
            "4. Prefer high-signal sources: official company pages, product pages, pricing pages, investor materials, "
            "credible industry research, case studies, and strong editorial publications.\n"
            "5. Reject weak SEO spam pages and shallow listicles unless clearly marked as low-confidence context.\n"
            "6. Avoid duplicate domains unless they serve materially different evidence needs.\n"
            "7. Return a curated source list with why each source matters.\n"
            "8. Make the source set broad enough to support competitor, audience, positioning, channel, and pricing analysis where relevant.\n\n"
            "Return:\n"
            "- recommended research title\n"
            "- final source shortlist\n"
            "- rejected source patterns to avoid\n"
            "- evidence gaps that may remain"
        ),
        expected_output=(
            "A curated shortlist of credible, high-signal research sources with notes on why each source matters."
        ),
        agent=source_discovery_reviewer,
        context=[prompt_strategy_task],
    )

    research_task = Task(
        description=(
            "Use the previous research brief and approved source shortlist as your operating scope.\n\n"
            "Conduct detailed marketing research using the available search and page-reading tools.\n\n"
            "Rules:\n"
            "1. You must use the search and page-reading tools.\n"
            "2. Do not produce a general overview.\n"
            "3. Every major section must contain concrete observations and strategic implications.\n"
            "4. Ground your analysis in the approved source shortlist first, then expand carefully only if necessary.\n"
            "5. Compare competitors explicitly where relevant.\n"
            "6. Identify implications, not just facts.\n"
            "7. Be transparent about uncertainty when evidence is limited.\n"
            "8. Use inline markdown links like [Source Name](https://example.com).\n"
            "9. End with a Sources section.\n\n"
            "Required sections:\n"
            "- Executive summary\n"
            "- Refined market framing\n"
            "- Audience needs and search intent\n"
            "- Competitive landscape and notable competitors\n"
            "- Positioning and messaging implications\n"
            "- Pricing and packaging implications if relevant\n"
            "- SEO / content opportunities\n"
            "- Channel and campaign implications\n"
            "- Strategic recommendations\n"
            "- Risks, limitations, and uncertainties\n"
            "- Sources\n\n"
            "The report must be specific, detailed, and commercially useful."
        ),
        expected_output=(
            "A detailed marketing research report in markdown with inline source links "
            "and a final Sources section."
        ),
        agent=researcher,
        context=[prompt_strategy_task, source_discovery_task],
    )

    moderation_task = Task(
        description=(
            "Review the research draft and decide whether it is good enough to show the user.\n\n"
            "Approval criteria:\n"
            "- Clearly marketing-focused\n"
            "- Detailed and specific, not generic\n"
            "- Complete, coherent, and practically useful\n"
            "- Important claims are backed by sources\n"
            "- Source links are present and plausible\n"
            "- No fabricated citations or unsupported statements\n"
            "- Includes strategic implications, not just descriptive summary\n"
            "- Shows evidence of competitor, audience, and channel thinking\n\n"
            "Rejection criteria:\n"
            "- Generic explanation\n"
            "- Weak sourcing\n"
            "- Filler or repetition\n"
            "- Missing strategic recommendations\n"
            "- Missing marketing depth\n\n"
            "Return valid JSON matching the required schema.\n"
            "If weak, set approved=false and explain why in reviewer_notes.\n"
            "If strong, set approved=true, polish lightly if needed, and return the final report.\n"
            "The `sources` field must be an array of objects with: title, url, note."
        ),
        expected_output="A final approval decision and final user-facing report as valid JSON.",
        agent=moderator,
        context=[source_discovery_task, research_task],
        output_pydantic=ModeratedResearchOutput,
    )

    finalize_task = Task(
        description=(
            "Prepare the final publishable JSON object.\n\n"
            "Rules:\n"
            "1. Output valid JSON only.\n"
            "2. Preserve the exact schema:\n"
            "{\n"
            '  "approved": true,\n'
            '  "title": "string",\n'
            '  "report_markdown": "string",\n'
            '  "sources": [{"title":"string","url":"string","note":"string"}],\n'
            '  "reviewer_notes": "string"\n'
            "}\n"
            "3. If moderation was approved, preserve the approved content with only minimal safe cleanup.\n"
            "4. If moderation was rejected, preserve approved=false and clearly explain why in reviewer_notes.\n"
            "5. Do not add fields.\n"
            "6. Do not add markdown fences.\n"
            "7. Do not add commentary.\n"
        ),
        expected_output="Final valid JSON only.",
        agent=finalizer,
        context=[moderation_task],
    )

    publish_task = Task(
        description=(
            "Publish the final approved JSON.\n\n"
            "Rules:\n"
            "1. Output only the final JSON.\n"
            "2. No explanations.\n"
            "3. No markdown fences.\n"
        ),
        expected_output="The final released JSON output.",
        agent=publisher,
        context=[finalize_task],
    )

    return Crew(
        agents=[
            prompt_strategist,
            source_discovery_reviewer,
            researcher,
            moderator,
            finalizer,
            publisher,
        ],
        tasks=[
            prompt_strategy_task,
            source_discovery_task,
            research_task,
            moderation_task,
            finalize_task,
            publish_task,
        ],
        process=Process.sequential,
        verbose=True,
    )