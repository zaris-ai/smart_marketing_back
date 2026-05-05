import os
from crewai import Agent, Crew, Task, Process, LLM


def build_llm():
    model = os.getenv("OPENAI_MODEL_NAME", "gpt-4o-mini")
    return LLM(model=model, temperature=0.4)


def create_blog_crew(payload):
    topic = payload["topic"]
    requested_title = payload.get("title", "")
    audience = payload.get("audience", "general readers")
    tone = payload.get("tone", "clear and practical")
    keywords = payload.get("keywords", [])
    min_words = payload.get("min_words", 800)
    max_words = payload.get("max_words", 1200)

    llm = build_llm()

    strategist = Agent(
        role="SEO Blog Strategist",
        goal="Create a focused SEO blog strategy with title and keywords.",
        backstory=(
            "You create publication-ready blog strategies. "
            "You avoid generic writing and focus on practical search intent."
        ),
        llm=llm,
        verbose=False,
        allow_delegation=False,
    )

    writer = Agent(
        role="SEO Blog Writer",
        goal="Write a strong, readable, useful blog post.",
        backstory=(
            "You write practical articles with clear headings, useful examples, "
            "SEO alignment, and minimal fluff."
        ),
        llm=llm,
        verbose=False,
        allow_delegation=False,
    )

    publisher = Agent(
        role="Structured Blog Publisher",
        goal="Return the final blog as strict JSON for application storage.",
        backstory="You output strict JSON only. No markdown fences. No commentary.",
        llm=llm,
        verbose=False,
        allow_delegation=False,
    )

    outline_task = Task(
        description=(
            f"Topic: {topic}\n"
            f"Requested title, if provided: {requested_title or 'None'}\n"
            f"Audience: {audience}\n"
            f"Tone: {tone}\n"
            f"Target keywords: {', '.join(keywords) if keywords else 'None'}\n\n"
            "Create a blog strategy with:\n"
            "1. A publication-ready SEO title.\n"
            "2. A focused search intent.\n"
            "3. A relevant keyword set.\n"
            "4. A section-by-section outline.\n"
            "5. Key arguments and examples to include.\n\n"
            "Rules:\n"
            "- If a requested title is provided, keep its meaning and improve only if needed.\n"
            "- Do not invent fake statistics.\n"
            "- Do not add external or internal links unless explicitly required by the final article context.\n"
        ),
        expected_output="A clear blog strategy, title, keywords, and outline.",
        agent=strategist,
    )

    writing_task = Task(
        description=(
            f"Write the final blog post.\n\n"
            f"Topic: {topic}\n"
            f"Audience: {audience}\n"
            f"Tone: {tone}\n"
            f"Target length: between {min_words} and {max_words} words.\n\n"
            "Writing rules:\n"
            "1. Use markdown formatting.\n"
            "2. Include a strong introduction.\n"
            "3. Use practical H2/H3 sections.\n"
            "4. Include a strong conclusion.\n"
            "5. Do not use markdown code fences.\n"
            "6. Do not add fake data.\n"
            "7. Avoid vague SaaS buzzwords unless they add meaning.\n"
        ),
        expected_output="A complete markdown blog post.",
        agent=writer,
        context=[outline_task],
    )

    publish_task = Task(
        description=(
            "Convert the final blog into strict JSON.\n\n"
            "Return exactly one JSON object with this shape:\n"
            "{\n"
            '  "title": "final blog title",\n'
            '  "meta_description": "max 160 chars",\n'
            '  "excerpt": "short summary",\n'
            '  "suggested_keywords": ["keyword1", "keyword2"],\n'
            '  "content_markdown": "full markdown blog post",\n'
            '  "telegram_report": "short report for Telegram channel"\n'
            "}\n\n"
            "Rules:\n"
            "1. Output JSON only.\n"
            "2. No markdown fences.\n"
            "3. No commentary outside JSON.\n"
            "4. title must be specific and publication-ready.\n"
            "5. meta_description must be useful and max 160 characters.\n"
            "6. suggested_keywords must include relevant keywords from the article.\n"
            "7. content_markdown must contain the full final blog markdown.\n"
            "8. telegram_report must be short and editor-friendly.\n"
        ),
        expected_output="A strict JSON object containing final blog fields.",
        agent=publisher,
        context=[outline_task, writing_task],
    )

    return Crew(
        agents=[strategist, writer, publisher],
        tasks=[outline_task, writing_task, publish_task],
        process=Process.sequential,
        verbose=False,
    )