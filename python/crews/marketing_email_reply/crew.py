import json
import os
from typing import Type
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from pydantic import BaseModel, Field

from crewai import Agent, Crew, Task, Process, LLM
from crewai.tools import BaseTool


DEFAULT_APP_URLS = [
    "https://web.arkaanalyzer.com/",
    "https://apps.shopify.com/arka-smart-analyzer",
]


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

            meta_description = get_meta(
                "description",
                "og:description",
                "twitter:description",
            )
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
                "text_excerpt": body_text[:14000],
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


def create_marketing_email_reply_crew(payload):
    raw_email_body = (payload.get("raw_email_body") or "").strip()

    desired_tone = (
        payload.get("desired_tone") or "professional, direct, helpful"
    ).strip()

    sender_name = (payload.get("sender_name") or "").strip()
    sender_role = (payload.get("sender_role") or "").strip()
    sender_company = (payload.get("sender_company") or "Arka").strip()

    cta_goal = (
        payload.get("cta_goal")
        or "reply clearly and move the conversation to the next useful step"
    ).strip()

    app_urls = payload.get("app_urls") or DEFAULT_APP_URLS

    if not raw_email_body:
        raise ValueError("payload.raw_email_body is required")

    if not isinstance(app_urls, list) or len(app_urls) < 2:
        raise ValueError("payload.app_urls must contain at least 2 URLs")

    llm = build_llm()
    read_url_tool = ReadUrlTool()

    contact_parser = Agent(
        role="Contact Form Email Parser",
        goal="Extract customer/contact details from the email body only.",
        backstory=(
            "You parse website contact-form emails. The email body is the only source "
            "for customer details. You never invent missing customer information."
        ),
        llm=llm,
        verbose=False,
        allow_delegation=False,
    )

    source_analyst = Agent(
        role="Arka Product Source Analyst",
        goal=(
            "Read the official Arka website and Shopify App Store listing, then extract "
            "only supported product facts for use in customer replies."
        ),
        backstory=(
            "You are a strict product analyst. You only use evidence from the provided "
            "official sources. You never invent pricing, integrations, guarantees, metrics, "
            "or unsupported product capabilities."
        ),
        tools=[read_url_tool],
        llm=llm,
        verbose=False,
        allow_delegation=False,
    )

    request_analyst = Agent(
        role="Inbound Contact Request Analyst",
        goal=(
            "Analyze the contact-form submission, customer intent, urgency, sentiment, "
            "and what the reply should accomplish."
        ),
        backstory=(
            "You analyze inbound SaaS and Shopify app contact requests. You are precise, "
            "commercially aware, and careful with vague or low-information messages."
        ),
        llm=llm,
        verbose=False,
        allow_delegation=False,
    )

    reply_strategist = Agent(
        role="Reply Strategy Specialist",
        goal=(
            "Design the best reply strategy using the parsed contact-form details and "
            "only source-grounded Arka product facts."
        ),
        backstory=(
            "You are a senior SaaS growth strategist. You optimize for clarity, credibility, "
            "trust, and useful next steps. You do not overpromise."
        ),
        llm=llm,
        verbose=False,
        allow_delegation=False,
    )

    reply_writer = Agent(
        role="Professional Customer Reply Writer",
        goal="Write a polished, concise, helpful reply to the contact-form sender.",
        backstory=(
            "You write natural customer replies for SaaS and Shopify app businesses. "
            "You avoid fluff, fake personalization, robotic phrasing, and unsupported claims."
        ),
        llm=llm,
        verbose=False,
        allow_delegation=False,
    )

    final_formatter = Agent(
        role="Strict JSON Formatter",
        goal="Return strict valid JSON only for backend storage and UI rendering.",
        backstory=(
            "You are a strict formatter. You return valid JSON only. No markdown. "
            "No code fences. No commentary."
        ),
        llm=llm,
        verbose=False,
        allow_delegation=False,
    )

    parse_task = Task(
        description=(
            "Parse this contact-form email body. Analyze the body only for customer/contact data.\n\n"
            f"EMAIL BODY:\n{raw_email_body}\n\n"
            "Extract these fields if present:\n"
            "- label\n"
            "- full_name\n"
            "- email\n"
            "- shopify_store\n"
            "- topic\n"
            "- message\n"
            "- source\n\n"
            "Rules:\n"
            "- The email body is the only source for customer/contact details.\n"
            "- If a field is missing, return an empty string.\n"
            "- contact.email must come from the *Email:* field in the body if present.\n"
            "- Preserve the customer's message meaning exactly.\n"
            "- Do not invent missing fields.\n"
        ),
        expected_output="Structured customer/contact data extracted from the email body.",
        agent=contact_parser,
    )

    source_analysis_task = Task(
        description=(
            "Analyze the official Arka product sources using the read_url tool:\n"
            f"1. {app_urls[0]}\n"
            f"2. {app_urls[1]}\n\n"
            "Required output:\n"
            "1. Product name\n"
            "2. Product category\n"
            "3. Core product purpose\n"
            "4. Main value proposition\n"
            "5. Main features clearly visible from the source pages\n"
            "6. The type of Shopify user the product is clearly for\n"
            "7. Merchant problems the product appears to solve\n"
            "8. Commercial positioning and messaging angles\n"
            "9. Safe product facts that can be mentioned in replies\n"
            "10. Claims that must be avoided because they are unsupported\n\n"
            "Rules:\n"
            "- Use the read_url tool for both URLs.\n"
            "- Use only the provided URLs as product truth.\n"
            "- Separate fact from inference.\n"
            "- Do not invent pricing, integrations, guarantees, performance metrics, "
            "customer outcomes, or product capabilities.\n"
        ),
        expected_output="A structured, source-grounded Arka product analysis.",
        agent=source_analyst,
    )

    analysis_task = Task(
        description=(
            "Analyze the customer's contact-form submission using the parsed contact data "
            "and the source-grounded Arka product analysis.\n\n"
            "Required analysis:\n"
            "1. Primary intent\n"
            "2. Sentiment\n"
            "3. Urgency\n"
            "4. Is the message actionable?\n"
            "5. Missing information needed from the customer\n"
            "6. Recommended response goal\n"
            "7. Safe product facts relevant to this contact message\n"
            "8. Claims to avoid in this specific reply\n"
            "9. Whether human review is needed\n\n"
            "Rules:\n"
            "- If the customer message is vague, say it is vague.\n"
            "- If the message is short like 'meh', do not pretend there is deep intent.\n"
            "- Use only the parsed body details for customer data.\n"
            "- Use only the source analysis for product facts.\n"
            "- Do not claim the Shopify store was reviewed.\n"
        ),
        expected_output="Structured analysis of the customer request and relevant product facts.",
        agent=request_analyst,
        context=[parse_task, source_analysis_task],
    )

    strategy_task = Task(
        description=(
            "Create the best reply strategy using the parsed contact-form details, "
            "request analysis, and source-grounded Arka product facts.\n\n"
            "Decide:\n"
            "1. Main response objective\n"
            "2. 3 to 7 key points to address\n"
            "3. Which Arka facts are safe to mention\n"
            "4. Which claims must be avoided\n"
            "5. Whether to ask for clarification, offer help, suggest trial, or move to a call\n"
            "6. Best CTA\n"
            "7. Best tone\n"
            "8. Whether human review is needed before sending\n\n"
            f"Desired tone: {desired_tone}\n"
            f"CTA goal: {cta_goal}\n\n"
            "Rules:\n"
            "- Optimize for credibility and forward motion.\n"
            "- Do not over-sell.\n"
            "- If the customer message is unclear, the strategy must ask for clarification.\n"
            "- Use only supported product facts from the official URLs.\n"
        ),
        expected_output="A complete reply strategy.",
        agent=reply_strategist,
        context=[parse_task, source_analysis_task, analysis_task],
    )

    writing_task = Task(
        description=(
            "Write the final reply to the contact-form sender.\n\n"
            f"Desired tone: {desired_tone}\n"
            f"CTA goal: {cta_goal}\n"
            f"Sender name: {sender_name or 'Not provided'}\n"
            f"Sender role: {sender_role or 'Not provided'}\n"
            f"Sender company: {sender_company}\n\n"
            "Requirements:\n"
            "- Address the customer by full name if available.\n"
            "- If their message is vague, ask a clear follow-up question.\n"
            "- If a Shopify store is provided, mention it naturally.\n"
            "- Do not say you reviewed the Shopify store.\n"
            "- Use only source-grounded Arka facts from the official URLs.\n"
            "- Do not invent pricing, guarantees, integrations, timelines, metrics, or capabilities.\n"
            "- Be concise, professional, natural, and commercially useful.\n"
            "- Include a clean signature using provided sender details.\n"
            "- Return a reply subject line, a plain-text reply body, and a simple HTML reply body.\n"
        ),
        expected_output="A reply subject, body_text, and body_html.",
        agent=reply_writer,
        context=[parse_task, source_analysis_task, analysis_task, strategy_task],
    )

    final_json_task = Task(
        description=(
            "Return strict valid JSON only.\n\n"
            "JSON schema:\n"
            "{\n"
            '  "source_type": "contact_form_email",\n'
            '  "app_name": "string",\n'
            '  "source_urls": ["string"],\n'
            '  "contact": {\n'
            '    "label": "string",\n'
            '    "full_name": "string",\n'
            '    "email": "string",\n'
            '    "shopify_store": "string",\n'
            '    "topic": "string",\n'
            '    "message": "string",\n'
            '    "source": "string"\n'
            "  },\n"
            '  "analysis": {\n'
            '    "primary_intent": "string",\n'
            '    "sentiment": "string",\n'
            '    "urgency": "string",\n'
            '    "is_actionable": true,\n'
            '    "missing_information": ["string"],\n'
            '    "recommended_response_goal": "string",\n'
            '    "safe_product_facts": ["string"],\n'
            '    "claims_to_avoid": ["string"],\n'
            '    "needs_human_review": true\n'
            "  },\n"
            '  "reply_strategy": {\n'
            '    "tone": "string",\n'
            '    "cta": "string",\n'
            '    "key_points": ["string"]\n'
            "  },\n"
            '  "reply": {\n'
            '    "subject": "string",\n'
            '    "body_text": "string",\n'
            '    "body_html": "string"\n'
            "  }\n"
            "}\n\n"
            "Hard rules:\n"
            "- Output strict valid JSON only.\n"
            "- No markdown.\n"
            "- No code fences.\n"
            "- No explanation outside JSON.\n"
            "- app_name should be the product/app name found from the official sources, or 'Arka: Smart Analyzer' if clearly supported.\n"
            f"- source_urls must equal: {json.dumps(app_urls, ensure_ascii=False)}\n"
            "- contact data must come only from the email body.\n"
            "- product facts must come only from the official source URLs.\n"
            "- contact.email must come from the *Email:* field in the body if available.\n"
            "- body_html must use only p, br, strong, em, ul, li, a.\n"
        ),
        expected_output="Strict valid JSON only.",
        agent=final_formatter,
        context=[parse_task, source_analysis_task, analysis_task, strategy_task, writing_task],
    )

    return Crew(
        agents=[
            contact_parser,
            source_analyst,
            request_analyst,
            reply_strategist,
            reply_writer,
            final_formatter,
        ],
        tasks=[
            parse_task,
            source_analysis_task,
            analysis_task,
            strategy_task,
            writing_task,
            final_json_task,
        ],
        process=Process.sequential,
        verbose=False,
    )
