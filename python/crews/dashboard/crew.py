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


SOURCE_URL = "https://apps.shopify.com/arka-smart-analyzer"


def build_llm():
    model = os.getenv("OPENAI_MODEL_NAME", "gpt-4o-mini")
    return LLM(model=model, temperature=0.2)


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
        "feature_mentions": pick(
            [
                "feature",
                "analytics",
                "dashboard",
                "report",
                "reports",
                "sales",
                "orders",
                "inventory",
                "customer",
                "profit",
                "insight",
                "analysis",
                "track",
                "tracking",
            ]
        ),
        "status_mentions": pick(
            [
                "install",
                "launch",
                "built for shopify",
                "new",
                "works with",
                "support",
                "available",
                "app store",
                "shopify",
            ]
        ),
        "caution_mentions": pick(
            [
                "not",
                "only",
                "requires",
                "limit",
                "limited",
                "depends",
                "must",
                "available",
                "unsupported",
            ]
        ),
    }


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
                        "feature_mentions": [],
                        "status_mentions": [],
                        "caution_mentions": [],
                    },
                },
                ensure_ascii=False,
            )


def create_dashboard_crew(payload=None):
    payload = payload or {}
    source_url = payload.get("source_url", SOURCE_URL)

    llm = build_llm()
    read_url_tool = ReadUrlTool()

    researcher = Agent(
        role="Canonical Product Truth Researcher",
        goal=(
            "Extract only explicit, supportable project information from the source URL for an internal manager-facing page."
        ),
        backstory=(
            "You are a strict product-truth researcher. "
            "You extract only what is explicitly supported by the source. "
            "You do not invent features, status, roadmap, pricing, analytics depth, AI claims, or benefits."
        ),
        llm=llm,
        tools=[read_url_tool],
        verbose=True,
        allow_delegation=False,
    )

    content_structurer = Agent(
        role="Internal Product Content Structurer",
        goal=(
            "Turn the approved source truth into a minimal manager-facing page structure focused on project description, features, and short status."
        ),
        backstory=(
            "You structure internal product information for managers. "
            "You avoid landing-page patterns and avoid public marketing fluff. "
            "You prioritize clarity, brevity, section separation, and factual language."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    ui_builder = Agent(
        role="Internal UI Builder",
        goal=(
            "Build a compact, readable, manager-facing HTML page using Tailwind CSS and DaisyUI v5 with light and dark mode support."
        ),
        backstory=(
            "You build internal information pages, not landing pages. "
            "You use Tailwind CSS and DaisyUI v5. "
            "You produce clean sections, cards, alerts, badges, and lists where useful. "
            "You keep the page minimal, factual, and readable in both day and night modes. "
            "You do not include stars, ratings, reviews, testimonials, pricing tables, hero banners, or promotional sections."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    reviewer = Agent(
        role="UI UX and Compliance Reviewer",
        goal=(
            "Review the generated page and reject anything that looks like a landing page, overclaims, adds unsupported detail, or has weak internal UI quality."
        ),
        backstory=(
            "You are a strict internal reviewer. "
            "You reject public-facing marketing patterns, unnecessary visual noise, unsupported claims, vague status language, "
            "and pages with poor hierarchy, poor readability, or weak light/dark mode behavior. "
            "You require a manager-facing information layout only."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    publisher = Agent(
        role="Release Publisher",
        goal="Publish only the final approved HTML page.",
        backstory=(
            "You only publish the final HTML. "
            "No explanations. No markdown fences."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    research_task = Task(
        description=(
            f"Use the read_url tool to read the content of this URL:\n{source_url}\n\n"
            "Extract only a strict source-of-truth summary for an internal manager-facing information page.\n\n"
            "Rules:\n"
            "1. Read the source URL with the read_url tool.\n"
            "2. Extract only explicitly supported information.\n"
            "3. Do not infer hidden features or roadmap.\n"
            "4. Do not infer pricing, reviews, customer feedback, adoption, AI capability depth, automation, segmentation, or predictive capability unless explicitly stated.\n"
            "5. Mark unsupported items as: Not specified in source.\n"
            "6. Keep the output structured and implementation-oriented.\n"
            "7. Focus only on manager-useful information, not public marketing.\n\n"
            "Output must include:\n"
            "- Project name\n"
            "- Short project description\n"
            "- Core purpose\n"
            "- Explicitly supported features\n"
            "- Explicitly supported project status or maturity signals\n"
            "- Items not specified in source\n"
            "- Unsafe claims to avoid\n"
            "- Constraints or cautions worth showing\n"
        ),
        expected_output=(
            "A strict structured source-of-truth summary for an internal manager-facing project information page."
        ),
        agent=researcher,
    )

    structure_task = Task(
        description=(
            "Using the source-truth summary, define the structure of a minimal manager-facing page.\n\n"
            "The page is not a landing page.\n\n"
            "It should contain only compact sections such as:\n"
            "- page title\n"
            "- project description\n"
            "- feature list\n"
            "- short project status\n"
            "- cautions or limits if supported\n\n"
            "Rules:\n"
            "1. Keep it minimal.\n"
            "2. Do not introduce public marketing sections.\n"
            "3. Do not add CTA sections, testimonials, review blocks, stars, rating summaries, pricing, FAQ, banner sections, or showcase sections.\n"
            "4. Prefer concise bullets and small text blocks.\n"
            "5. Keep the wording factual and manager-oriented.\n"
            "6. If project status is weakly supported, keep it brief and careful.\n"
            "7. Recommend only simple UI sections and components.\n"
        ),
        expected_output=(
            "A compact page structure for an internal manager-facing information page."
        ),
        agent=content_structurer,
        context=[research_task],
    )

    build_page_task = Task(
        description=(
            "Using the source-truth summary and page structure, build the final HTML page.\n\n"
            "Requirements:\n"
            "1. Output HTML only.\n"
            "2. Use Tailwind CSS and DaisyUI v5 class names.\n"
            "3. Support both light mode and dark mode.\n"
            "4. This is an internal manager-facing information page, not a landing page.\n"
            "5. Show only text and features with a short minimal project status section.\n"
            "6. Include a brief project description.\n"
            "7. Use a clean container and compact section spacing.\n"
            "8. Use cards, badges, alerts, dividers, and lists only where they improve clarity.\n"
            "9. Keep the design minimal and readable.\n"
            "10. Do not include stars, ratings, reviews, testimonials, pricing, CTA buttons, hero sections, social proof, or promotional metrics.\n"
            "11. Do not invent unsupported details.\n"
            "12. If something is missing, either omit it or label it as Not specified in source.\n"
            "13. Prefer a compact admin/info-page style.\n"
            "14. Keep paragraphs short.\n"
            "15. Use semantic HTML where practical.\n"
            "16. Output only the final HTML page.\n"
            "17. Suitable sections: title header, description card, feature list card, project status card, cautions card if needed.\n"
        ),
        expected_output=(
            "A complete minimal internal HTML page using Tailwind CSS and DaisyUI v5 with light and dark mode support."
        ),
        agent=ui_builder,
        context=[research_task, structure_task],
    )

    review_task = Task(
        description=(
            "Review the generated HTML page.\n\n"
            "You must reject it if:\n"
            "- it looks like a landing page\n"
            "- it includes stars, ratings, reviews, testimonials, public marketing blocks, or promotional sections\n"
            "- it contains unsupported claims\n"
            "- it overstates project status\n"
            "- it has weak hierarchy or poor readability\n"
            "- it is not clearly suitable for both light and dark mode\n"
            "- it is too verbose or too visually noisy\n\n"
            "Output exactly in this format:\n"
            "Verdict: APPROVED or REJECTED\n"
            "Review Summary: short explanation\n"
            "Required Changes:\n"
            "- bullet list\n"
            "Rewrite Requirement: KEEP CURRENT VERSION or REWRITE FROM SCRATCH\n"
        ),
        expected_output=(
            "A strict review verdict for a minimal manager-facing project information page."
        ),
        agent=reviewer,
        context=[research_task, structure_task, build_page_task],
    )

    finalize_task = Task(
        description=(
            "Prepare the final publishable HTML page.\n\n"
            "Rules:\n"
            "1. Output HTML only.\n"
            "2. If review is APPROVED, keep the page with only minimal safe fixes if needed.\n"
            "3. If review is REJECTED, rebuild it from scratch as a minimal internal manager-facing page.\n"
            "4. Do not turn it into a landing page.\n"
            "5. Keep only project description, features, short project status, and supported cautions if relevant.\n"
            "6. Use Tailwind CSS and DaisyUI v5.\n"
            "7. Ensure light and dark mode safety.\n"
            "8. Do not add commentary or markdown fences.\n"
        ),
        expected_output=(
            "A final minimal manager-facing HTML page."
        ),
        agent=ui_builder,
        context=[research_task, structure_task, build_page_task, review_task],
    )

    publish_task = Task(
        description=(
            "Publish the final approved output as strict JSON.\n\n"
            "Return exactly one JSON object with this shape:\n"
            "{\n"
            '  "html": "<final html page>",\n'
            '  "telegram_report": "<clean manager-facing telegram report>"\n'
            "}\n\n"
            "Rules:\n"
            "1. html must contain the full final HTML page only.\n"
            "2. telegram_report must be concise, readable, and suitable for Telegram.\n"
            "3. telegram_report must include these sections if supported:\n"
            "   - Project\n"
            "   - Description\n"
            "   - Key Features\n"
            "   - Project Status\n"
            "   - Cautions or Limits\n"
            "4. No markdown fences.\n"
            "5. No commentary outside the JSON object.\n"
        ),
        expected_output="A strict JSON object with html and telegram_report.",
        agent=publisher,
        context=[finalize_task, review_task, research_task],
        output_file="logs/dashboard_published.json",
    )

    return Crew(
        agents=[
            researcher,
            content_structurer,
            ui_builder,
            reviewer,
            publisher,
        ],
        tasks=[
            research_task,
            structure_task,
            build_page_task,
            review_task,
            finalize_task,
            publish_task,
        ],
        process=Process.sequential,
        verbose=True,
    )