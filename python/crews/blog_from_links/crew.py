import json
import os
from typing import Type
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from pydantic import BaseModel, Field

from crewai import Agent, Crew, Task, Process, LLM
from crewai.tools import BaseTool


def build_llm():
    model = os.getenv("OPENAI_MODEL_NAME", "gpt-4o-mini")
    return LLM(model=model, temperature=0.2)


class ReadUrlToolInput(BaseModel):
    url: str = Field(..., description="Full URL to read and extract content from.")


class ReadUrlTool(BaseTool):
    name: str = "read_url"
    description: str = (
        "Fetch a URL and return structured page data including title, meta description, "
        "headings, visible text, and candidate image URLs from the page."
    )
    args_schema: Type[BaseModel] = ReadUrlToolInput

    def _run(self, url: str) -> str:
        try:
            headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                )
            }

            response = requests.get(url, headers=headers, timeout=20)
            response.raise_for_status()

            soup = BeautifulSoup(response.text, "html.parser")

            for tag in soup(["script", "style", "noscript", "iframe", "svg"]):
                tag.decompose()

            title = ""
            if soup.title and soup.title.string:
                title = soup.title.string.strip()

            def get_meta(*names):
                for name in names:
                    tag = soup.find("meta", attrs={"property": name}) or soup.find(
                        "meta", attrs={"name": name}
                    )
                    if tag and tag.get("content"):
                        return tag["content"].strip()
                return ""

            meta_description = get_meta("description", "og:description", "twitter:description")
            og_image = get_meta("og:image", "twitter:image")

            headings = {
                "h1": [h.get_text(" ", strip=True) for h in soup.find_all("h1")][:10],
                "h2": [h.get_text(" ", strip=True) for h in soup.find_all("h2")][:20],
                "h3": [h.get_text(" ", strip=True) for h in soup.find_all("h3")][:30],
            }

            image_candidates = []

            if og_image:
                image_candidates.append(urljoin(url, og_image))

            for img in soup.find_all("img"):
                src = (
                    img.get("src")
                    or img.get("data-src")
                    or img.get("data-lazy-src")
                    or img.get("srcset", "").split(",")[0].strip().split(" ")[0]
                )
                if not src:
                    continue

                absolute_src = urljoin(url, src)
                if absolute_src not in image_candidates:
                    image_candidates.append(absolute_src)

                if len(image_candidates) >= 10:
                    break

            body_text = soup.get_text(separator=" ", strip=True)
            body_text = " ".join(body_text.split())

            result = {
                "url": url,
                "title": title,
                "meta_description": meta_description,
                "headings": headings,
                "text_excerpt": body_text[:12000],
                "image_candidates": image_candidates[:10],
            }

            return json.dumps(result, ensure_ascii=False)

        except Exception as e:
            return json.dumps(
                {
                    "url": url,
                    "error": f"Failed to read URL: {str(e)}",
                    "title": "",
                    "meta_description": "",
                    "headings": {"h1": [], "h2": [], "h3": []},
                    "text_excerpt": "",
                    "image_candidates": [],
                },
                ensure_ascii=False,
            )


def create_blog_from_links_crew(payload):
    links = payload["links"]
    forbidden_titles = payload.get("forbidden_titles", [])
    retry_reason = payload.get("retry_reason", "")

    if not isinstance(links, list) or len(links) != 2:
        raise ValueError("payload.links must contain exactly 2 URLs")

    llm = build_llm()
    read_url_tool = ReadUrlTool()

    source_analyst = Agent(
        role="Product Source Analyst",
        goal=(
            "Read the provided product links and extract the application's actual positioning, "
            "use cases, target users, pain points, and blog-worthy themes."
        ),
        backstory=(
            "You are a strict product and market analyst. You only use what is supported by the source pages "
            "and clear page evidence. You do not invent features, customers, or claims."
        ),
        tools=[read_url_tool],
        llm=llm,
        verbose=False,
        allow_delegation=False,
    )

    content_strategist = Agent(
        role="Autonomous Content Strategist",
        goal=(
            "Based on the product pages alone, decide the single best professional blog topic to write now, "
            "the best title, the keyword set, and the content angle."
        ),
        backstory=(
            "You are a senior SaaS content strategist. You choose the most commercially useful topic without asking the user. "
            "You avoid weak, generic, or broad article ideas."
        ),
        llm=llm,
        verbose=False,
        allow_delegation=False,
    )

    blog_writer = Agent(
        role="Professional SaaS Blog Writer",
        goal=(
            "Write a specialized, application-relevant, professional blog article that matches the approved strategy."
        ),
        backstory=(
            "You write strong SaaS and Shopify content with clear structure, tight language, useful detail, "
            "and credible positioning. You do not write fluff."
        ),
        llm=llm,
        verbose=False,
        allow_delegation=False,
    )

    image_researcher = Agent(
        role="Blog Image Researcher",
        goal=(
            "Choose one relevant image candidate from the provided source pages and return the image URL, "
            "source page, extraction basis, and alt text suggestion."
        ),
        backstory=(
            "You are a practical content operations researcher. You do not search the web. "
            "You only inspect the provided URLs and select the best available image candidate from those pages."
        ),
        tools=[read_url_tool],
        llm=llm,
        verbose=False,
        allow_delegation=False,
    )

    final_formatter = Agent(
        role="Final JSON Formatter",
        goal=(
            "Return the final approved blog package in strict JSON format for backend storage and editor rendering."
        ),
        backstory=(
            "You are a strict formatter. You output valid JSON only and preserve the final title, topic, metadata, image, and HTML content."
        ),
        llm=llm,
        verbose=False,
        allow_delegation=False,
    )

    source_analysis_task = Task(
        description=(
            f"Analyze these 2 links using the read_url tool:\n"
            f"1. {links[0]}\n"
            f"2. {links[1]}\n\n"
            "Required output:\n"
            "1. Product name\n"
            "2. Product category\n"
            "3. Core product purpose\n"
            "4. Main features visible from the links\n"
            "5. The type of Shopify user this product is clearly for\n"
            "6. Problems this product appears to solve\n"
            "7. Strong educational/commercial blog opportunities\n"
            "8. Fact vs inference section\n\n"
            "Rules:\n"
            "- Use the read_url tool for both links.\n"
            "- Use the links as primary truth.\n"
            "- No invented product claims.\n"
            "- No generic summary.\n"
        ),
        expected_output="A structured product source analysis based only on the provided links.",
        agent=source_analyst,
    )

    strategy_task = Task(
        description=(
            "Using the source analysis only, decide the single best blog to write.\n\n"
            "You must decide all of the following yourself:\n"
            "1. Best topic\n"
            "2. Best title\n"
            "3. Best audience\n"
            "4. Primary keyword\n"
            "5. Secondary keywords\n"
            "6. Search intent\n"
            "7. Article angle\n"
            "8. Slug\n"
            "9. Meta description\n"
            "10. Excerpt\n"
            "11. Outline\n"
            "12. CTA direction\n\n"
            f"Forbidden titles already existing in database:\n{json.dumps(forbidden_titles, ensure_ascii=False)}\n\n"
            f"Retry instruction: {retry_reason or 'None'}\n\n"
            "Rules:\n"
            "- Choose one clear article only.\n"
            "- Do not ask for user input.\n"
            "- Choose the most relevant topic for the actual product.\n"
            "- Avoid generic SEO filler topics.\n"
            "- The article must help position the application professionally.\n"
            "- The chosen title must NOT duplicate or closely mirror any forbidden title.\n"
            "- If a title is too similar to a forbidden title, choose a meaningfully different one.\n"
        ),
        expected_output="A complete autonomous content strategy for one blog article.",
        agent=content_strategist,
        context=[source_analysis_task],
    )

    writing_task = Task(
        description=(
            "Write the final blog article based on the approved autonomous strategy.\n\n"
            "Requirements:\n"
            "- Specialized and professional tone\n"
            "- Strong introduction\n"
            "- Useful body sections\n"
            "- Concrete explanations\n"
            "- Conclusion with natural CTA\n"
            "- HTML only for the main output body\n"
            "- Use editor-friendly tags only: h1, h2, h3, p, ul, li, strong, em, a, blockquote\n"
            "- No full document wrapper\n"
            "- No scripts\n"
            "- No markdown fences\n"
            "- Avoid repeating the title wording excessively in headings\n"
        ),
        expected_output="A final professional HTML blog article and optional markdown version.",
        agent=blog_writer,
        context=[source_analysis_task, strategy_task],
    )

    image_task = Task(
        description=(
            "Using the read_url tool, inspect the provided source pages and select one suitable image candidate "
            "from those pages for the selected blog topic.\n\n"
            "Required output:\n"
            "1. Extraction basis or query label used internally\n"
            "2. Direct image URL if available\n"
            "3. Source page URL\n"
            "4. Alt text\n"
            "5. Why this image is relevant\n\n"
            "Rules:\n"
            "- Do not invent URLs.\n"
            "- Do not search the web.\n"
            "- Only use images discoverable on the provided links.\n"
            "- Choose one best candidate.\n"
        ),
        expected_output="One image candidate with image URL, source page, extraction basis, and alt text.",
        agent=image_researcher,
        context=[source_analysis_task, strategy_task, writing_task],
    )

    final_json_task = Task(
        description=(
            "Return valid JSON only.\n\n"
            "JSON schema:\n"
            "{\n"
            '  "app_name": "string",\n'
            '  "audience": "string",\n'
            '  "topic": "string",\n'
            '  "title": "string",\n'
            '  "slug": "string",\n'
            '  "excerpt": "string",\n'
            '  "meta_description": "string",\n'
            '  "keywords": ["string"],\n'
            '  "cover_image": {\n'
            '    "url": "string",\n'
            '    "source_page": "string",\n'
            '    "query": "string",\n'
            '    "alt": "string"\n'
            "  },\n"
            '  "content_html": "string",\n'
            '  "content_markdown": "string",\n'
            '  "editor_data": {\n'
            '    "type": "html",\n'
            '    "content": "string"\n'
            "  }\n"
            "}\n\n"
            "Rules:\n"
            "- Output JSON only.\n"
            "- No markdown.\n"
            "- No code fences.\n"
            "- content_html must contain the final article HTML.\n"
            "- The title must be materially different from forbidden_titles.\n"
            "- editor_data.type must be 'html'.\n"
        ),
        expected_output="Strict valid JSON only.",
        agent=final_formatter,
        context=[source_analysis_task, strategy_task, writing_task, image_task],
    )

    return Crew(
        agents=[
            source_analyst,
            content_strategist,
            blog_writer,
            image_researcher,
            final_formatter,
        ],
        tasks=[
            source_analysis_task,
            strategy_task,
            writing_task,
            image_task,
            final_json_task,
        ],
        process=Process.sequential,
        verbose=False,
    )