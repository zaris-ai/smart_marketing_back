import json
import os
import re
from typing import Type
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup
from pydantic import BaseModel, Field

from crewai import Agent, Crew, LLM, Process, Task
from crewai.tools import BaseTool


USER_AGENT = "Mozilla/5.0 (compatible; ArkaProblemDiscoveryCrew/1.0)"
DEFAULT_APP_REFERENCE_URL = "https://apps.shopify.com/arka-smart-analyzer"


def build_llm():
    model = os.getenv("OPENAI_MODEL_NAME", "gpt-4o-mini")
    return LLM(model=model, temperature=0.2)


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


class ReadPageToolInput(BaseModel):
    url: str = Field(..., description="Full URL to read and extract visible content from.")


class ReadPageTool(BaseTool):
    name: str = "read_page"
    description: str = (
        "Fetch a URL and return structured page data including host, source type, title, "
        "meta description, headings, and visible text excerpt."
    )
    args_schema: Type[BaseModel] = ReadPageToolInput

    def _run(self, url: str) -> str:
        try:
            response = requests.get(
                url,
                headers={"User-Agent": USER_AGENT},
                timeout=20,
            )
            response.raise_for_status()

            soup = BeautifulSoup(response.text, "html.parser")

            for tag in soup(["script", "style", "noscript", "iframe", "svg"]):
                tag.decompose()

            title = ""
            if soup.title and soup.title.string:
                title = clean_text(soup.title.string)

            def get_meta(*names):
                for name in names:
                    tag = soup.find("meta", attrs={"property": name}) or soup.find(
                        "meta", attrs={"name": name}
                    )
                    if tag and tag.get("content"):
                        return clean_text(tag["content"])
                return ""

            meta_description = get_meta(
                "description",
                "og:description",
                "twitter:description",
            )

            headings = {
                "h1": [clean_text(h.get_text(" ", strip=True)) for h in soup.find_all("h1")][:10],
                "h2": [clean_text(h.get_text(" ", strip=True)) for h in soup.find_all("h2")][:20],
                "h3": [clean_text(h.get_text(" ", strip=True)) for h in soup.find_all("h3")][:30],
            }

            body_text = clean_text(soup.get_text(separator=" ", strip=True))
            host = (urlparse(url).netloc or "").lower()

            if "reddit.com" in host:
                source_type = "reddit"
            elif "shopify" in host and "community" in host:
                source_type = "shopify_community"
            elif "forum" in host or "discuss" in host:
                source_type = "forum"
            elif "blog" in host or "medium.com" in host:
                source_type = "blog"
            else:
                source_type = "unknown"

            result = {
                "url": url,
                "host": host,
                "source_type": source_type,
                "title": title,
                "meta_description": meta_description,
                "headings": headings,
                "text_excerpt": body_text[:18000],
            }
            return json.dumps(result, ensure_ascii=False)

        except Exception as e:
            return json.dumps(
                {
                    "url": url,
                    "host": "",
                    "source_type": "unknown",
                    "title": "",
                    "meta_description": "",
                    "headings": {"h1": [], "h2": [], "h3": []},
                    "text_excerpt": "",
                    "error": f"Failed to read URL: {str(e)}",
                },
                ensure_ascii=False,
            )


def create_problem_discovery_crew(payload):
    urls = payload["urls"]
    app_reference_url = payload.get("app_reference_url") or DEFAULT_APP_REFERENCE_URL
    max_results = max(1, min(int(payload.get("max_results", 20)), 50))

    if not isinstance(urls, list) or not urls:
        raise ValueError("payload.urls must be a non-empty list")

    llm = build_llm()
    read_page_tool = ReadPageTool()

    source_reader = Agent(
        role="Discussion Source Reader",
        goal=(
            "Read every submitted link and extract the actual user problems, questions, "
            "pain language, and source-page evidence without inventing content."
        ),
        backstory=(
            "You are a strict evidence reader. You inspect every provided page and only use "
            "what is visible in the source content."
        ),
        tools=[read_page_tool],
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    problem_extractor = Agent(
        role="Merchant Problem Extractor",
        goal=(
            "Extract only the meaningful merchant problems and normalize them into clear questions."
        ),
        backstory=(
            "You specialize in pulling real merchant pain points from noisy discussion pages, "
            "forum posts, threads, comments, and product discussions."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    solution_analyst = Agent(
        role="Commerce Solution Analyst",
        goal=(
            "Answer each extracted merchant problem directly and practically based on commerce "
            "best practices."
        ),
        backstory=(
            "You provide grounded answers to ecommerce and Shopify problems. You separate the "
            "general answer from any specific product fit."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    arka_fit_analyst = Agent(
        role="Arka Product Fit Analyst",
        goal=(
            "Use the Arka app page as product truth, judge whether Arka can solve each problem now, "
            "explain how if yes, and describe feature gaps if not."
        ),
        backstory=(
            "You are a strict product-fit analyst. You do not exaggerate product capabilities. "
            "You compare each merchant problem against the actual Arka app information."
        ),
        tools=[read_page_tool],
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    review_analyst = Agent(
        role="Discovery Review Analyst",
        goal=(
            "Review the full candidate set, remove weak entries, ensure source-page fidelity, "
            "and make the result decision-ready."
        ),
        backstory=(
            "You are a quality-control analyst. You reject vague, duplicated, unsupported, "
            "or low-value items."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    final_formatter = Agent(
        role="Final JSON Formatter",
        goal="Return strict valid JSON only for backend storage.",
        backstory="You output valid JSON only and preserve the final reviewed fields exactly.",
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    read_sources_task = Task(
        description=(
            "Review every submitted link. All submitted links must be read.\n\n"
            f"Submitted URLs:\n{json.dumps(urls, ensure_ascii=False, indent=2)}\n\n"
            "For each submitted URL, use the read_page tool and extract:\n"
            "1. Source type\n"
            "2. Source page URL\n"
            "3. Title\n"
            "4. Visible problem statements or questions\n"
            "5. Relevant user pain language\n"
            "6. Whether the page appears to contain merchant pain/question content\n\n"
            "Rules:\n"
            "- Every submitted link must be reviewed.\n"
            "- Do not skip any URL.\n"
            "- Do not invent hidden comments or missing text.\n"
            "- Keep the exact source page URL attached to any extracted problem.\n"
        ),
        expected_output="A structured reading of every submitted source page and its pain signals.",
        agent=source_reader,
    )

    extract_problems_task = Task(
        description=(
            "From the source readings, extract the user problems/questions that should be analyzed.\n\n"
            "Required behavior:\n"
            "- Convert messy statements into clear normalized merchant questions when needed.\n"
            "- Keep only meaningful merchant pain points.\n"
            "- Each item must preserve the exact source page where it came from.\n"
            "- Each item must be assigned exactly one pain_category from:\n"
            "  conversion | aov | customer\n"
            "- Assign a conservative frequency_score between 0 and 1 based on how explicit, repeated, "
            "specific, and commercially important the problem appears.\n\n"
            "Rules:\n"
            "- Remove weak, generic, or unsupported items.\n"
            "- Deduplicate near-identical questions.\n"
            "- Any link may be submitted, so judge by visible page content rather than domain assumptions.\n"
        ),
        expected_output="A candidate list of normalized merchant questions with categories, scores, and source pages.",
        agent=problem_extractor,
        context=[read_sources_task],
    )

    answer_problems_task = Task(
        description=(
            "Provide a practical answer for each extracted merchant problem.\n\n"
            "Rules:\n"
            "- Answer the merchant problem directly.\n"
            "- The answer must be generally useful and commerce-focused.\n"
            "- Do not assume Arka is the answer.\n"
            "- Keep the answer separate from product fit analysis.\n"
            "- Avoid filler and vague advice.\n"
        ),
        expected_output="A list of candidate problems paired with strong, direct answers.",
        agent=solution_analyst,
        context=[read_sources_task, extract_problems_task],
    )

    analyze_arka_fit_task = Task(
        description=(
            "Read the Arka app page and use it as product truth.\n\n"
            f"Arka app reference URL:\n{app_reference_url}\n\n"
            "For each candidate problem:\n"
            "1. Decide whether Arka can solve it now: true or false\n"
            "2. If true, explain clearly how Arka solves it\n"
            "3. If false, explain the feature gap honestly\n"
            "4. Recommend what feature or capability Arka should add to solve it\n\n"
            "Rules:\n"
            "- Use the read_page tool for the Arka app reference URL.\n"
            "- Do not exaggerate current capabilities.\n"
            "- Partial fit is allowed, but state it honestly.\n"
            "- Keep the original source_question_page for each item.\n"
        ),
        expected_output="A full problem-to-Arka-fit analysis for each candidate item.",
        agent=arka_fit_analyst,
        context=[read_sources_task, extract_problems_task, answer_problems_task],
    )

    review_task = Task(
        description=(
            f"Review and finalize the candidate set. Return no more than {max_results} items.\n\n"
            "Review rules:\n"
            "- Every accepted item must have a clear user problem or question\n"
            "- Every accepted item must include the exact source_question_page\n"
            "- The answer must be useful and direct\n"
            "- The Arka fit judgment must be honest and not overstated\n"
            "- If can_arka_solve is true, arka_solution must be meaningful\n"
            "- If can_arka_solve is false, feature_gap and recommended_feature must be meaningful\n"
            "- Remove weak, duplicative, unsupported, or low-value items\n"
            "- Prefer commercially relevant merchant problems\n"
        ),
        expected_output="A reviewed, ranked, and cleaned final candidate set.",
        agent=review_analyst,
        context=[
            read_sources_task,
            extract_problems_task,
            answer_problems_task,
            analyze_arka_fit_task,
        ],
    )

    final_json_task = Task(
        description=(
            "Return valid JSON only.\n\n"
            "Schema:\n"
            "{\n"
            '  "items": [\n'
            "    {\n"
            '      "question": "string",\n'
            '      "pain_category": "conversion | aov | customer",\n'
            '      "frequency_score": 0.0,\n'
            '      "source": "string",\n'
            '      "source_question_page": "string",\n'
            '      "answer": "string",\n'
            '      "can_arka_solve": true,\n'
            '      "arka_solution": "string",\n'
            '      "feature_gap": "string",\n'
            '      "recommended_feature": "string"\n'
            "    }\n"
            "  ],\n"
            '  "summary": {\n'
            '    "total_candidates": 0,\n'
            '    "accepted_count": 0\n'
            "  }\n"
            "}\n\n"
            "Rules:\n"
            "- Output JSON only\n"
            "- No markdown\n"
            "- No code fences\n"
            "- accepted_count must equal items length\n"
            "- frequency_score must be a numeric value between 0 and 1\n"
            "- source_question_page must contain the exact source page URL where the problem/question came from\n"
            "- If can_arka_solve is true, arka_solution must not be empty\n"
            "- If can_arka_solve is false, feature_gap and recommended_feature must not be empty\n"
        ),
        expected_output="Strict valid JSON only.",
        agent=final_formatter,
        context=[
            read_sources_task,
            extract_problems_task,
            answer_problems_task,
            analyze_arka_fit_task,
            review_task,
        ],
    )

    return Crew(
        agents=[
            source_reader,
            problem_extractor,
            solution_analyst,
            arka_fit_analyst,
            review_analyst,
            final_formatter,
        ],
        tasks=[
            read_sources_task,
            extract_problems_task,
            answer_problems_task,
            analyze_arka_fit_task,
            review_task,
            final_json_task,
        ],
        process=Process.sequential,
        verbose=True,
    )


if __name__ == "__main__":
    sample_payload = {
        "urls": [
            "https://community.shopify.com/",
            "https://www.reddit.com/r/shopify/",
        ],
        "app_reference_url": DEFAULT_APP_REFERENCE_URL,
        "max_results": 10,
    }

    crew = create_problem_discovery_crew(sample_payload)
    result = crew.kickoff()
    print(result)