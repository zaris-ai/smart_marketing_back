import json
import os
import re
from typing import List, Type
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from pydantic import BaseModel, Field

from crewai import Agent, Crew, Task, Process, LLM
from crewai.tools import BaseTool


USER_AGENT = "Mozilla/5.0 (compatible; ArkaStoreOutreachCrew/1.0)"


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


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def get_session() -> requests.Session:
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})
    return session


def _http_get(url: str, timeout: int = 25) -> str:
    session = get_session()
    response = session.get(url, timeout=timeout, allow_redirects=True)
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


def _extract_same_domain_links(
    soup: BeautifulSoup, base_url: str, limit: int = 30
) -> List[dict]:
    base_domain = urlparse(base_url).netloc.lower()
    results: List[dict] = []
    seen = set()

    for anchor in soup.find_all("a", href=True):
        href = anchor.get("href", "").strip()
        if not href:
            continue

        absolute = urljoin(base_url, href)
        parsed = urlparse(absolute)

        if parsed.scheme not in ("http", "https"):
            continue

        if parsed.netloc.lower() != base_domain:
            continue

        normalized = f"{parsed.scheme}://{parsed.netloc}{parsed.path or '/'}"
        if normalized in seen:
            continue

        seen.add(normalized)
        results.append(
            {
                "url": normalized,
                "text": clean_text(anchor.get_text(" ", strip=True)),
            }
        )

        if len(results) >= limit:
            break

    return results


def _extract_evidence_lines(text: str) -> dict:
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
        "product_mentions": pick(
            [
                "shop",
                "store",
                "product",
                "collection",
                "bundle",
                "new arrival",
                "best seller",
                "sale",
                "gift",
                "subscription",
            ]
        ),
        "analytics_mentions": pick(
            [
                "analytics",
                "insight",
                "dashboard",
                "performance",
                "customer",
                "segment",
                "retention",
                "conversion",
                "recommendation",
                "bundle",
            ]
        ),
        "positioning_mentions": pick(
            [
                "quality",
                "premium",
                "sustainable",
                "luxury",
                "fast shipping",
                "handmade",
                "custom",
                "personalized",
                "shopify",
            ]
        ),
    }


class ReadUrlToolInput(BaseModel):
    url: str = Field(..., description="Full public URL to read.")


class ReadUrlTool(BaseTool):
    name: str = "read_url"
    description: str = (
        "Read a public URL and return structured page data including title, meta description, "
        "headings, bullet points, same-domain links, visible text excerpt, evidence lines, and image candidates."
    )
    args_schema: Type[BaseModel] = ReadUrlToolInput

    def _run(self, url: str) -> str:
        try:
            url = normalize_url(url)
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
                "same_domain_links": _extract_same_domain_links(soup, url),
                "text_excerpt": body_text[:20000],
                "image_candidates": _extract_candidate_images(soup, url),
                "evidence": _extract_evidence_lines(body_text),
            }

            return json.dumps(result, ensure_ascii=False)

        except Exception as exc:
            return json.dumps(
                {
                    "url": normalize_url(url),
                    "error": f"Failed to read URL: {str(exc)}",
                    "domain": urlparse(normalize_url(url)).netloc.lower() if url else "",
                    "title": "",
                    "meta_description": "",
                    "headings": {"h1": [], "h2": [], "h3": []},
                    "bullet_points": [],
                    "same_domain_links": [],
                    "text_excerpt": "",
                    "image_candidates": [],
                    "evidence": {
                        "product_mentions": [],
                        "analytics_mentions": [],
                        "positioning_mentions": [],
                    },
                },
                ensure_ascii=False,
            )


def create_store_outreach_crew(payload):
    website_url = normalize_url(payload["website_url"])
    store_name = clean_text(payload.get("store_name", ""))
    manager_name = clean_text(payload.get("manager_name", ""))
    tone = clean_text(payload.get("tone", "direct and strategic"))
    email_goal = clean_text(payload.get("email_goal", "book a short intro call"))
    notes = clean_text(payload.get("notes", ""))

    target_app_name = clean_text(payload.get("target_app_name", "Arka: Smart Analyzer"))
    target_app_shopify_url = normalize_url(
        payload.get(
            "target_app_shopify_url",
            "https://apps.shopify.com/arka-smart-analyzer",
        )
    )
    target_app_website_url = normalize_url(
        payload.get(
            "target_app_website_url",
            "https://web.arkaanalyzer.com/",
        )
    )

    llm = build_llm()
    read_url_tool = ReadUrlTool()

    app_feature_analyst = Agent(
        role="App Feature Analyst",
        goal="Read the app sources and extract verified capabilities and merchant value.",
        backstory=(
            "You only use grounded public evidence. You do not invent features, proof points, "
            "performance claims, or customer outcomes."
        ),
        tools=[read_url_tool],
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    store_researcher = Agent(
        role="Store Researcher",
        goal="Read the target store website and identify what the store sells and where the app can help.",
        backstory=(
            "You only use publicly visible website evidence and make uncertainty explicit. "
            "You do not invent hidden store metrics, backend operations, or internal pain points."
        ),
        tools=[read_url_tool],
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    fit_strategist = Agent(
        role="App-to-Store Fit Strategist",
        goal="Map verified app capabilities to the target store's observable needs.",
        backstory=(
            "You do not force a fit. You identify where the fit is strong, weak, or uncertain. "
            "You are strict about separating evidence from inference."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    email_copywriter = Agent(
        role="Marketing Email Copywriter",
        goal="Write a concise personalized outreach email for the store manager.",
        backstory=(
            "You use only observed store facts and verified app capabilities. "
            "You avoid fake familiarity, invented numbers, and manipulative hype."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    finalizer = Agent(
        role="Outreach Finalizer",
        goal="Prepare the final approved outreach package as strict JSON only.",
        backstory=(
            "You preserve only grounded claims, keep the schema exact, and output valid JSON only."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    approver = Agent(
        role="Final Outreach Approver",
        goal="Approve only valid, grounded, strict JSON.",
        backstory=(
            "You reject invented facts, inflated fit logic, weak personalization, and any output "
            "that is not valid JSON or does not match the required schema."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    app_feature_task = Task(
        description=(
            f"Read these app sources using the read_url tool:\n"
            f"- {target_app_shopify_url}\n"
            f"- {target_app_website_url}\n\n"
            "Extract:\n"
            "1. Verified app capabilities\n"
            "2. Merchant problems the app addresses\n"
            "3. Best-fit store types\n"
            "4. Claims that should be used cautiously\n"
            "5. Unsupported claims to avoid\n\n"
            "Rules:\n"
            "- Use only the provided public sources.\n"
            "- Do not invent features or performance proof.\n"
            "- If something is unclear, label it as uncertain.\n"
        ),
        expected_output="Structured app capability analysis.",
        agent=app_feature_analyst,
    )

    store_research_task = Task(
        description=(
            f"Analyze this target store website using the read_url tool: {website_url}\n"
            f"Store name hint: {store_name or 'None'}\n"
            f"Notes: {notes or 'None'}\n\n"
            "Instructions:\n"
            "- Read the homepage first.\n"
            "- If useful, inspect a few same-domain links surfaced by the tool, such as collections, products, about, or bundles pages.\n"
            "- Stay grounded in what is publicly visible.\n\n"
            "Extract:\n"
            "1. What the store sells\n"
            "2. Positioning and messaging\n"
            "3. Visible opportunities for analytics, segmentation, retention, bundling, or conversion improvement\n"
            "4. Uncertainty and blind spots\n"
            "5. Observed signals worth referencing in outreach\n"
        ),
        expected_output="Structured store analysis.",
        agent=store_researcher,
    )

    fit_strategy_task = Task(
        description=(
            f"Decide how {target_app_name} can realistically help this store.\n\n"
            "Return:\n"
            "1. Overall fit: high, medium, or low\n"
            "2. Fit score from 0 to 100\n"
            "3. Reasons\n"
            "4. Top use cases\n"
            "5. Best outreach angles\n"
            "6. Risks and unknowns\n"
            "7. Confidence notes\n\n"
            "Rules:\n"
            "- Use only verified app capabilities plus observed store signals.\n"
            "- Do not force a fit.\n"
            "- Keep the score defensible.\n"
            "- Make risks explicit.\n"
        ),
        expected_output="App-to-store fit analysis.",
        agent=fit_strategist,
        context=[app_feature_task, store_research_task],
    )

    email_task = Task(
        description=(
            f"Write a concise marketing email.\n"
            f"Manager name: {manager_name or 'Unknown'}\n"
            f"Tone: {tone}\n"
            f"Goal: {email_goal}\n\n"
            "Return:\n"
            "1. Subject line\n"
            "2. Preview line\n"
            "3. Plain-text email body\n\n"
            "Rules:\n"
            "- No invented metrics\n"
            "- No fake personalization\n"
            "- Keep CTA low friction\n"
            "- Only reference observed store facts and verified app capabilities\n"
            "- Keep it concise and commercially credible\n"
        ),
        expected_output="Personalized outreach email.",
        agent=email_copywriter,
        context=[app_feature_task, store_research_task, fit_strategy_task],
    )

    approval_task = Task(
        description=(
            "Review the outreach package and return strict JSON only with this schema:\n"
            "{\n"
            '  "title": "string",\n'
            '  "store": {\n'
            '    "name": "string",\n'
            '    "website_url": "string",\n'
            '    "summary": "string",\n'
            '    "observed_signals": ["string"],\n'
            '    "blind_spots": ["string"]\n'
            "  },\n"
            '  "app_fit": {\n'
            '    "overall_fit": "high|medium|low",\n'
            '    "fit_score": 0,\n'
            '    "reasons": ["string"],\n'
            '    "use_cases": ["string"],\n'
            '    "pitch_angles": ["string"],\n'
            '    "risks": ["string"],\n'
            '    "confidence_notes": "string"\n'
            "  },\n"
            '  "email": {\n'
            '    "subject": "string",\n'
            '    "preview_line": "string",\n'
            '    "body": "string"\n'
            "  },\n"
            '  "sources": ["string"]\n'
            "}\n\n"
            "Rules:\n"
            "- Output JSON only.\n"
            "- Reject invented facts.\n"
            "- Fit logic must remain evidence-based.\n"
            "- Sources must contain the public URLs actually used.\n"
        ),
        expected_output="Strict JSON only.",
        agent=approver,
        context=[app_feature_task, store_research_task, fit_strategy_task, email_task],
    )

    finalize_task = Task(
        description=(
            "Prepare the final publishable outreach result.\n\n"
            "Rules:\n"
            "1. Output valid JSON only.\n"
            "2. Keep the approved schema exactly.\n"
            "3. Make only minimal safe cleanup edits if needed.\n"
            "4. Do not add commentary.\n"
            "5. Do not add markdown fences.\n"
        ),
        expected_output="Final strict JSON only.",
        agent=finalizer,
        context=[approval_task],
    )

    return Crew(
        agents=[
            app_feature_analyst,
            store_researcher,
            fit_strategist,
            email_copywriter,
            approver,
            finalizer,
        ],
        tasks=[
            app_feature_task,
            store_research_task,
            fit_strategy_task,
            email_task,
            approval_task,
            finalize_task,
        ],
        process=Process.sequential,
        verbose=True,
    )