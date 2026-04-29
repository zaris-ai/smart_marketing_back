import os
from crewai import Agent, Crew, Task, Process, LLM


def build_llm():
    model = os.getenv("OPENAI_MODEL_NAME", "gpt-4o-mini")
    return LLM(model=model, temperature=0.35)


def clamp_int(value, default, minimum, maximum):
    try:
        value = int(value)
    except Exception:
        value = default

    return max(minimum, min(maximum, value))


def create_instagram_story_idea_crew(payload):
    brand_name = payload["brand_name"]
    product_or_service = payload["product_or_service"]

    app_website_url = payload.get(
        "app_website_url",
        "http://web.arkaanalyzer.com/",
    )

    shopify_app_store_url = payload.get(
        "shopify_app_store_url",
        "https://apps.shopify.com/arka-smart-analyzer",
    )

    target_audience = payload["target_audience"]
    campaign_goal = payload["campaign_goal"]

    campaign_name = payload.get("campaign_name", "Instagram Story Campaign")

    brand_voice = payload.get(
        "brand_voice",
        "direct, expert, practical, conversion-focused",
    )

    offer = payload.get(
        "offer",
        "Install Arka Smart Analyzer from the Shopify App Store",
    )

    key_message = payload.get(
        "key_message",
        "Your Shopify store data already shows what needs fixing. Arka helps you find it faster.",
    )

    visual_style = payload.get(
        "visual_style",
        "clean SaaS dashboard visuals, Shopify store analytics, fast cuts, premium tech style, vertical mobile video",
    )

    language = payload.get("language", "English")
    notes = payload.get("notes", "")

    number_of_ideas = clamp_int(payload.get("number_of_ideas"), 5, 1, 10)
    story_length_seconds = clamp_int(payload.get("story_length_seconds"), 15, 5, 60)

    llm = build_llm()

    strategist = Agent(
        role="Instagram Story Campaign Strategist",
        goal="Create sharp Instagram Story campaign concepts for Arka Smart Analyzer.",
        backstory=(
            "You create short-form campaign ideas for SaaS and Shopify apps. "
            "You understand ecommerce pain points, Shopify merchant behavior, "
            "Instagram Story pacing, hooks, CTAs, and conversion-focused messaging."
        ),
        llm=llm,
        verbose=False,
        allow_delegation=False,
    )

    prompt_writer = Agent(
        role="Instagram Video Production Prompt Writer",
        goal=(
            "Turn Instagram Story ideas into complete production-ready prompts that include "
            "all frame-level information needed to create the video."
        ),
        backstory=(
            "You write detailed AI video production prompts for vertical short-form marketing videos. "
            "Your prompts are complete enough that a video generator, editor, or motion designer can produce "
            "the video without asking for missing details."
        ),
        llm=llm,
        verbose=False,
        allow_delegation=False,
    )

    publisher = Agent(
        role="Structured Instagram Story Publisher",
        goal="Publish the final Instagram Story ideas as strict JSON for application storage.",
        backstory="You output strict JSON only. No markdown fences. No commentary.",
        llm=llm,
        verbose=False,
        allow_delegation=False,
    )

    strategy_task = Task(
        description=(
            f"Create {number_of_ideas} Instagram Story campaign ideas.\n\n"
            "Fixed app context:\n"
            f"Brand: {brand_name}\n"
            f"Product/service: {product_or_service}\n"
            f"Official website: {app_website_url}\n"
            f"Shopify App Store listing: {shopify_app_store_url}\n\n"
            "Campaign input:\n"
            f"Target audience: {target_audience}\n"
            f"Campaign goal: {campaign_goal}\n"
            f"Campaign name: {campaign_name}\n"
            f"Brand voice: {brand_voice}\n"
            f"Offer: {offer}\n"
            f"Key message: {key_message}\n"
            f"Visual style: {visual_style}\n"
            f"Language: {language}\n"
            f"Notes: {notes}\n\n"
            "Create for each idea:\n"
            "1. A specific title\n"
            "2. A clear marketing angle\n"
            "3. The campaign objective\n"
            "4. A strong first-frame hook\n"
            "5. A CTA connected to the campaign goal\n"
            "6. A 3 to 6 frame Instagram Story sequence\n\n"
            "For each frame include:\n"
            "- frame number\n"
            "- duration in seconds\n"
            "- visual description\n"
            "- on-screen text\n"
            "- voiceover\n"
            "- motion direction\n\n"
            "Rules:\n"
            "1. Promote Arka Smart Analyzer specifically.\n"
            "2. Do not ask for product information.\n"
            "3. Use the fixed website and Shopify App Store listing as context.\n"
            "4. Make ideas relevant to Shopify merchants and ecommerce operators.\n"
            "5. Focus on analytics, pricing problems, inventory problems, product performance, store insights, and decision-making.\n"
            "6. Do not invent unsupported product features.\n"
            "7. Do not claim exact revenue, profit, or conversion improvements.\n"
            "8. Do not use celebrity references.\n"
            "9. Do not use copyrighted style references.\n"
            "10. Write in the requested language.\n"
        ),
        expected_output="A structured list of Instagram Story ideas with frame-by-frame sequences.",
        agent=strategist,
    )

    video_prompt_task = Task(
        description=(
            "Convert each Instagram Story idea into a COMPLETE AI video production prompt.\n\n"
            "The video_prompt field must not be short. It must include every frame and every production detail needed to generate or edit the video.\n\n"
            f"Target video length per idea: about {story_length_seconds} seconds.\n"
            f"Visual style: {visual_style}\n"
            f"Language: {language}\n"
            f"Brand: {brand_name}\n"
            f"Product/service: {product_or_service}\n"
            f"Website: {app_website_url}\n"
            f"Shopify App Store listing: {shopify_app_store_url}\n\n"
            "For EACH idea, write video_prompt as a single complete production prompt with this internal structure:\n\n"
            "VIDEO GOAL:\n"
            "- Explain the purpose of the video and desired viewer action.\n\n"
            "FORMAT:\n"
            "- Instagram Story, vertical 9:16, mobile-first composition.\n"
            "- Recommended resolution: 1080x1920.\n"
            "- Total duration target.\n\n"
            "BRAND CONTEXT:\n"
            "- Brand name.\n"
            "- Product/service summary.\n"
            "- Audience.\n"
            "- Campaign goal.\n"
            "- Offer.\n"
            "- CTA destination.\n\n"
            "VISUAL STYLE:\n"
            "- Overall design style.\n"
            "- Color mood.\n"
            "- Lighting.\n"
            "- Background style.\n"
            "- UI/dashboard treatment.\n"
            "- Typography behavior.\n"
            "- Motion style.\n\n"
            "FRAME-BY-FRAME DIRECTION:\n"
            "- Include every frame from the story_sequence.\n"
            "- For each frame include:\n"
            "  1. Frame number\n"
            "  2. Duration\n"
            "  3. Visual scene\n"
            "  4. Camera direction\n"
            "  5. Motion/animation direction\n"
            "  6. On-screen text exactly as it should appear\n"
            "  7. Voiceover exactly as it should be spoken\n"
            "  8. Background elements\n"
            "  9. Transition into the next frame\n\n"
            "AUDIO DIRECTION:\n"
            "- Music mood.\n"
            "- Sound effects.\n"
            "- Voiceover tone.\n\n"
            "TEXT OVERLAY RULES:\n"
            "- Placement.\n"
            "- Size behavior.\n"
            "- Safe margins for Instagram Story UI.\n"
            "- Readability rules.\n\n"
            "CTA ENDING:\n"
            "- Final action.\n"
            "- Mention Shopify App Store listing where appropriate.\n\n"
            "NEGATIVE PROMPT / AVOID:\n"
            "- Avoid fake UI claims.\n"
            "- Avoid unrealistic revenue promises.\n"
            "- Avoid celebrity references.\n"
            "- Avoid copyrighted visual styles.\n"
            "- Avoid cluttered text.\n"
            "- Avoid horizontal video format.\n\n"
            "Rules:\n"
            "1. The video_prompt must include all frame details. Do not summarize frames.\n"
            "2. The video_prompt must be usable directly in an AI video tool or by a human video editor.\n"
            "3. The video_prompt must include the full story_sequence information inside it.\n"
            "4. The video_prompt must include exact on-screen text and exact voiceover lines.\n"
            "5. The video_prompt must include the CTA and destination.\n"
            "6. The video_prompt must stay brand-safe and realistic.\n"
            "7. Do not use markdown fences.\n"
            "8. Do not reference celebrities.\n"
            "9. Do not reference copyrighted visual styles.\n"
            "10. Do not promise guaranteed financial results.\n"
        ),
        expected_output=(
            "Each Instagram Story idea enriched with one complete video production prompt "
            "that includes every frame and all production details."
        ),
        agent=prompt_writer,
        context=[strategy_task],
    )

    publish_task = Task(
        description=(
            "Convert the final Instagram Story campaign into strict JSON.\n\n"
            "Return exactly one JSON object with this shape:\n"
            "{\n"
            '  "campaign_title": "string",\n'
            '  "strategy_summary": "string",\n'
            '  "ideas": [\n'
            "    {\n"
            '      "id": "idea_1",\n'
            '      "title": "string",\n'
            '      "angle": "string",\n'
            '      "objective": "string",\n'
            '      "hook": "string",\n'
            '      "story_sequence": [\n'
            "        {\n"
            '          "frame": 1,\n'
            '          "visual": "string",\n'
            '          "on_screen_text": "string",\n'
            '          "voiceover": "string",\n'
            '          "motion_direction": "string",\n'
            '          "duration_seconds": 3\n'
            "        }\n"
            "      ],\n"
            '      "video_prompt": "string",\n'
            '      "caption": "string",\n'
            '      "cta": "string",\n'
            '      "hashtags": ["string"],\n'
            '      "production_notes": ["string"]\n'
            "    }\n"
            "  ]\n"
            "}\n\n"
            "Critical video_prompt requirement:\n"
            "The video_prompt value must be a COMPLETE production prompt. It must include:\n"
            "1. Video goal\n"
            "2. Format and resolution\n"
            "3. Brand context\n"
            "4. Visual style\n"
            "5. All frame-by-frame directions\n"
            "6. Every frame duration\n"
            "7. Every frame visual scene\n"
            "8. Every frame camera direction\n"
            "9. Every frame motion direction\n"
            "10. Every frame exact on-screen text\n"
            "11. Every frame exact voiceover\n"
            "12. Background elements\n"
            "13. Transition directions\n"
            "14. Audio/music direction\n"
            "15. Text overlay rules\n"
            "16. CTA ending\n"
            "17. Negative prompt / avoid list\n\n"
            "Rules:\n"
            "1. Output JSON only.\n"
            f"2. ideas must contain exactly {number_of_ideas} items.\n"
            "3. Every idea must promote Arka Smart Analyzer.\n"
            "4. Every idea must include a non-empty and detailed video_prompt.\n"
            "5. Every video_prompt must include the complete story_sequence information inside the prompt text.\n"
            "6. Every story_sequence must contain 3 to 6 frames.\n"
            "7. Every frame must include visual, on_screen_text, voiceover, motion_direction, and duration_seconds.\n"
            "8. Hashtags must be relevant and not spammy.\n"
            "9. CTA must match the campaign goal.\n"
            "10. CTA should generally direct users to install or visit the Shopify App Store listing.\n"
            f"11. Language must be {language}.\n"
            "12. Format must be Instagram Story, vertical 9:16.\n"
            "13. No markdown fences.\n"
            "14. No commentary outside the JSON.\n"
            "15. Do not invent unsupported product features.\n"
            "16. Do not claim exact revenue, profit, or conversion improvements.\n"
        ),
        expected_output="A strict JSON object containing Instagram Story campaign ideas with complete production prompts.",
        agent=publisher,
        context=[strategy_task, video_prompt_task],
    )

    return Crew(
        agents=[strategist, prompt_writer, publisher],
        tasks=[strategy_task, video_prompt_task, publish_task],
        process=Process.sequential,
        verbose=False,
    )