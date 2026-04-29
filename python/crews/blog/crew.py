import os
from crewai import Agent, Crew, Task, Process, LLM


def build_llm():
    model = os.getenv("OPENAI_MODEL_NAME", "gpt-4o-mini")
    return LLM(model=model, temperature=0.4)


def create_blog_crew(payload):
    topic = payload["topic"]
    audience = payload.get("audience", "general readers")
    tone = payload.get("tone", "clear and practical")
    keywords = payload.get("keywords", [])
    min_words = payload.get("min_words", 800)
    max_words = payload.get("max_words", 1200)

    llm = build_llm()

    strategist = Agent(
        role="Blog Strategist",
        goal="Create a sharp angle and structure for a high-quality blog post.",
        backstory="You turn broad ideas into focused, useful blog strategies.",
        llm=llm,
        verbose=False,
        allow_delegation=False,
    )

    writer = Agent(
        role="Blog Writer",
        goal="Write a strong, readable, useful blog post.",
        backstory="You write practical articles with clear headings, useful examples, and minimal fluff.",
        llm=llm,
        verbose=False,
        allow_delegation=False,
    )

    publisher = Agent(
        role="Structured Blog Publisher",
        goal="Publish the final blog output as strict JSON for application storage.",
        backstory="You output strict JSON only. No markdown fences. No commentary.",
        llm=llm,
        verbose=False,
        allow_delegation=False,
    )

    outline_task = Task(
        description=(
            f"Topic: {topic}\n"
            f"Audience: {audience}\n"
            f"Tone: {tone}\n"
            f"Keywords: {', '.join(keywords) if keywords else 'None'}\n\n"
            "Create:\n"
            "1. A strong SEO-friendly title\n"
            "2. A short article angle\n"
            "3. A section-by-section outline\n"
            "4. Key points to include\n"
        ),
        expected_output="A clear blog title and article outline.",
        agent=strategist,
    )

    writing_task = Task(
        description=(
            f"Write the final blog post on '{topic}'.\n"
            f"Audience: {audience}\n"
            f"Tone: {tone}\n"
            f"Target length: between {min_words} and {max_words} words.\n"
            "Use markdown formatting.\n"
            "Include a strong introduction, useful body sections, and a strong conclusion.\n"
            "Do not include markdown code fences.\n"
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
            "2. title must be specific and publication-ready.\n"
            "3. meta_description must be concise and useful.\n"
            "4. excerpt must be 1 short paragraph.\n"
            "5. suggested_keywords must be a small relevant array.\n"
            "6. content_markdown must contain the full final blog markdown.\n"
            "7. telegram_report must summarize the generated article in a short editor-friendly format.\n"
            "8. No markdown fences.\n"
            "9. No commentary outside the JSON.\n"
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