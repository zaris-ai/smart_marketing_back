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
    customer_email_subject = (payload.get("customer_email_subject") or "").strip()
    customer_email_body = (payload.get("customer_email_body") or "").strip()
    customer_email_from = (payload.get("customer_email_from") or "").strip()
    customer_name = (payload.get("customer_name") or "").strip()
    desired_tone = (payload.get("desired_tone") or "professional, direct, helpful").strip()
    sender_name = (payload.get("sender_name") or "").strip()
    sender_role = (payload.get("sender_role") or "").strip()
    sender_company = (payload.get("sender_company") or "Arka").strip()
    cta_goal = (payload.get("cta_goal") or "continue the conversation and move toward a relevant next step").strip()
    extra_context = (payload.get("extra_context") or "").strip()
    app_urls = payload.get("app_urls") or DEFAULT_APP_URLS

    if not customer_email_body:
        raise ValueError("payload.customer_email_body is required")

    if not isinstance(app_urls, list) or len(app_urls) < 2:
        raise ValueError("payload.app_urls must contain at least 2 URLs")

    llm = build_llm()
    read_url_tool = ReadUrlTool()

    source_analyst = Agent(
        role="Arka Product Source Analyst",
        goal=(
            "Read the official Arka product sources and extract only supported facts about positioning, "
            "value proposition, use cases, target users, features, and commercial angles."
        ),
        backstory=(
            "You are a strict product analyst. You only use evidence from the provided official sources. "
            "You never invent features, promises, pricing, integrations, guarantees, or customer outcomes."
        ),
        tools=[read_url_tool],
        llm=llm,
        verbose=False,
        allow_delegation=False,
    )

    email_analyst = Agent(
        role="Marketing Email Intent Analyst",
        goal=(
            "Analyze an inbound marketing email and determine intent, urgency, sentiment, objections, "
            "questions, buying stage, and what kind of answer is most appropriate."
        ),
        backstory=(
            "You are a precise B2B email analyst. You decompose inbound messages into actionable commercial meaning. "
            "You avoid generic summaries and focus on what the sender actually wants."
        ),
        llm=llm,
        verbose=False,
        allow_delegation=False,
    )

    reply_strategist = Agent(
        role="Marketing Reply Strategist",
        goal=(
            "Design the best response strategy using only supported Arka facts and the sender's actual email. "
            "Choose what to answer, what not to claim, and what next step to propose."
        ),
        backstory=(
            "You are a senior SaaS growth strategist. You optimize for clarity, trust, forward motion, and commercial relevance. "
            "You do not over-sell and you do not make unsupported claims."
        ),
        llm=llm,
        verbose=False,
        allow_delegation=False,
    )

    reply_writer = Agent(
        role="Professional Email Reply Writer",
        goal=(
            "Write a polished, natural, commercially effective email reply to the inbound marketing email."
        ),
        backstory=(
            "You write concise, professional, direct email replies for SaaS and Shopify products. "
            "You avoid fluff, robotic phrasing, and exaggerated claims."
        ),
        llm=llm,
        verbose=False,
        allow_delegation=False,
    )

    final_formatter = Agent(
        role="Final JSON Formatter",
        goal=(
            "Return the final answer package in strict valid JSON only for backend storage and UI rendering."
        ),
        backstory=(
            "You are a strict formatter. You return valid JSON only and preserve the final analysis and reply exactly."
        ),
        llm=llm,
        verbose=False,
        allow_delegation=False,
    )

    source_analysis_task = Task(
        description=(
            f"Analyze the official Arka product sources using the read_url tool:\n"
            f"1. {app_urls[0]}\n"
            f"2. {app_urls[1]}\n\n"
            "Required output:\n"
            "1. Product name\n"
            "2. Product category\n"
            "3. Core product purpose\n"
            "4. Main value proposition\n"
            "5. Main features clearly visible from the source pages\n"
            "6. The type of Shopify user the product is clearly for\n"
            "7. The merchant problems the product appears to solve\n"
            "8. Commercial positioning and messaging angles\n"
            "9. Facts that are safe to mention in an email reply\n"
            "10. Unsupported claims that must be avoided\n\n"
            "Rules:\n"
            "- Use the read_url tool for both URLs.\n"
            "- Use only the provided official sources as truth.\n"
            "- No invented features, metrics, pricing, guarantees, or integrations.\n"
            "- Separate fact from inference.\n"
        ),
        expected_output="A structured source-grounded analysis of Arka for safe use in reply writing.",
        agent=source_analyst,
    )

    email_analysis_task = Task(
        description=(
            "Analyze this inbound marketing email.\n\n"
            f"From: {customer_email_from or 'Unknown'}\n"
            f"Customer name: {customer_name or 'Unknown'}\n"
            f"Subject: {customer_email_subject or '(No subject)'}\n"
            f"Body:\n{customer_email_body}\n\n"
            f"Extra context from backend/user: {extra_context or 'None'}\n\n"
            "Required output:\n"
            "1. Primary intent\n"
            "2. Secondary intent if any\n"
            "3. Sentiment\n"
            "4. Buying or conversation stage\n"
            "5. Main questions explicitly asked\n"
            "6. Hidden concerns or objections inferred from the wording\n"
            "7. Urgency level\n"
            "8. What the sender likely wants next\n"
            "9. Risks in replying incorrectly\n"
            "10. Recommended answer direction\n\n"
            "Rules:\n"
            "- Analyze the actual email, not a hypothetical one.\n"
            "- Be concrete.\n"
            "- Distinguish explicit asks from inferred asks.\n"
            "- Do not answer yet.\n"
        ),
        expected_output="A structured analysis of the inbound email's meaning and reply needs.",
        agent=email_analyst,
        context=[source_analysis_task],
    )

    strategy_task = Task(
        description=(
            "Using the product source analysis and the email analysis, decide the best reply strategy.\n\n"
            "You must decide all of the following:\n"
            "1. Should we reply now or defer to human review?\n"
            "2. Main response objective\n"
            "3. The 3 to 7 key points to address\n"
            "4. Which product facts are safe to use\n"
            "5. Which claims must be avoided\n"
            "6. Whether to push for demo, trial, clarification, or simple follow-up\n"
            "7. Best CTA\n"
            "8. Best tone\n"
            "9. Whether the reply should mention limits/unknowns explicitly\n\n"
            f"Desired tone: {desired_tone}\n"
            f"CTA goal: {cta_goal}\n"
            f"Sender name for signature: {sender_name or 'Not provided'}\n"
            f"Sender role: {sender_role or 'Not provided'}\n"
            f"Sender company: {sender_company}\n\n"
            "Rules:\n"
            "- Use only supported product facts.\n"
            "- If a question cannot be answered from the source pages or provided context, say it should be framed carefully or deferred.\n"
            "- Optimize for credibility and forward motion.\n"
            "- Do not overpromise.\n"
        ),
        expected_output="A complete reply strategy grounded in the sources and the inbound email.",
        agent=reply_strategist,
        context=[source_analysis_task, email_analysis_task],
    )

    writing_task = Task(
        description=(
            "Write the final email reply.\n\n"
            "Requirements:\n"
            "- Professional, direct, natural, human tone\n"
            "- Answer the sender's real intent\n"
            "- Use only supported product information\n"
            "- Keep the email commercially useful\n"
            "- Do not sound generic or robotic\n"
            "- Do not invent pricing, integrations, guarantees, timelines, or capabilities\n"
            "- If something is not confirmed, phrase it carefully\n"
            "- Return both:\n"
            "  1. a reply subject line\n"
            "  2. a plain-text reply body\n"
            "  3. a simple HTML reply body using only p, br, strong, em, ul, li, a\n\n"
            f"Signature guidance:\n"
            f"- Sender name: {sender_name or 'Leave signature generic if not provided'}\n"
            f"- Sender role: {sender_role or 'Omit if not provided'}\n"
            f"- Sender company: {sender_company}\n\n"
            "Rules:\n"
            "- Do not output markdown fences.\n"
            "- Do not output JSON.\n"
            "- Do not include placeholders like [Your Name] unless the data is actually missing.\n"
            "- If signature details are missing, end cleanly without fake details.\n"
        ),
        expected_output="A subject line, a plain-text email reply, and an HTML email reply.",
        agent=reply_writer,
        context=[source_analysis_task, email_analysis_task, strategy_task],
    )

    final_json_task = Task(
        description=(
            "Return valid JSON only.\n\n"
            "JSON schema:\n"
            "{\n"
            '  "app_name": "string",\n'
            '  "source_urls": ["string"],\n'
            '  "customer_email": {\n'
            '    "from": "string",\n'
            '    "name": "string",\n'
            '    "subject": "string",\n'
            '    "body": "string"\n'
            "  },\n"
            '  "analysis": {\n'
            '    "primary_intent": "string",\n'
            '    "secondary_intent": "string",\n'
            '    "sentiment": "string",\n'
            '    "stage": "string",\n'
            '    "urgency": "string",\n'
            '    "explicit_questions": ["string"],\n'
            '    "inferred_concerns": ["string"],\n'
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
            "Rules:\n"
            "- Output strict valid JSON only.\n"
            "- No markdown.\n"
            "- No code fences.\n"
            "- Preserve the actual customer email subject/body.\n"
            "- body_html must be simple email-safe HTML.\n"
            "- needs_human_review must be true if the reply depends on unsupported or missing facts.\n"
        ),
        expected_output="Strict valid JSON only.",
        agent=final_formatter,
        context=[source_analysis_task, email_analysis_task, strategy_task, writing_task],
    )

    return Crew(
        agents=[
            source_analyst,
            email_analyst,
            reply_strategist,
            reply_writer,
            final_formatter,
        ],
        tasks=[
            source_analysis_task,
            email_analysis_task,
            strategy_task,
            writing_task,
            final_json_task,
        ],
        process=Process.sequential,
        verbose=False,
    )


if __name__ == "__main__":
    sample_payload = {
        "customer_email_from": "merchant@example.com",
        "customer_name": "John",
        "customer_email_subject": "Interested in Arka for our Shopify store",
        "customer_email_body": (
            "Hi, we are looking for a better way to understand store performance and customer behavior. "
            "Can you explain what Arka does and whether it can help us make better decisions?"
        ),
        "desired_tone": "professional, helpful, concise",
        "sender_name": "Mahdi",
        "sender_role": "Founder",
        "sender_company": "Arka",
        "cta_goal": "move the conversation toward a short discovery call",
    }

    crew = create_marketing_email_reply_crew(sample_payload)
    result = crew.kickoff()
    print(result)