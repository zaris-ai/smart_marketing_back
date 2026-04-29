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


def create_instagram_post_idea_crew(payload):
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

    campaign_name = payload.get("campaign_name", "Instagram Post Campaign")

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
        "clean SaaS dashboard visuals, Shopify store analytics, premium tech style, high-readability feed design",
    )

    language = payload.get("language", "English")
    notes = payload.get("notes", "")
    post_format = payload.get("post_format", "carousel")

    number_of_ideas = clamp_int(payload.get("number_of_ideas"), 5, 1, 10)

    llm = build_llm()

    strategist = Agent(
        role="Instagram Post Campaign Strategist",
        goal="Create sharp Instagram feed post concepts for Arka Smart Analyzer.",
        backstory=(
            "You create high-performing Instagram feed content for SaaS and Shopify apps. "
            "You understand ecommerce merchant pain points, carousel education, single-image hooks, "
            "social proof framing, product-led messaging, and conversion-focused captions."
        ),
        llm=llm,
        verbose=False,
        allow_delegation=False,
    )

    creative_prompt_writer = Agent(
        role="Instagram Post Creative Prompt Writer",
        goal=(
            "Turn Instagram post ideas into complete creative prompts that include all details "
            "needed to design the post or carousel."
        ),
        backstory=(
            "You write complete production prompts for designers and AI image tools. "
            "Your prompts include layout, composition, slide-by-slide content, typography, "
            "visual hierarchy, background, UI mockup direction, CTA treatment, and negative prompts."
        ),
        llm=llm,
        verbose=False,
        allow_delegation=False,
    )

    publisher = Agent(
        role="Structured Instagram Post Publisher",
        goal="Publish the final Instagram post ideas as strict JSON for application storage.",
        backstory="You output strict JSON only. No markdown fences. No commentary.",
        llm=llm,
        verbose=False,
        allow_delegation=False,
    )

    strategy_task = Task(
        description=(
            f"Create {number_of_ideas} Instagram post ideas for Arka Smart Analyzer.\n\n"
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
            f"Post format: {post_format}\n"
            f"Notes: {notes}\n\n"
            "Create for each idea:\n"
            "1. A specific post title\n"
            "2. Post type: carousel, single_image, or reel_cover\n"
            "3. A clear marketing angle\n"
            "4. The campaign objective\n"
            "5. A strong hook\n"
            "6. A CTA connected to the campaign goal\n"
            "7. If carousel: 5 to 8 slides\n"
            "8. If single_image: 1 slide\n"
            "9. If reel_cover: 1 slide designed as a cover\n\n"
            "For each slide include:\n"
            "- slide number\n"
            "- visual description\n"
            "- headline\n"
            "- body text\n"
            "- design direction\n\n"
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
        expected_output="A structured list of Instagram post ideas with slide-by-slide content.",
        agent=strategist,
    )

    creative_prompt_task = Task(
        description=(
            "Convert each Instagram post idea into a COMPLETE creative production prompt.\n\n"
            "The creative_prompt field must not be short. It must include every slide and every production detail needed to design or generate the post.\n\n"
            f"Visual style: {visual_style}\n"
            f"Language: {language}\n"
            f"Brand: {brand_name}\n"
            f"Product/service: {product_or_service}\n"
            f"Website: {app_website_url}\n"
            f"Shopify App Store listing: {shopify_app_store_url}\n"
            f"Post format: {post_format}\n\n"
            "For EACH idea, write creative_prompt as a single complete production prompt with this internal structure:\n\n"
            "POST GOAL:\n"
            "- Explain the purpose of the post and desired viewer action.\n\n"
            "FORMAT:\n"
            "- Instagram feed post.\n"
            "- If carousel: 1080x1350 portrait, 4:5, 5 to 8 slides.\n"
            "- If single image: 1080x1350 portrait, 4:5, one strong composition.\n"
            "- If reel cover: 1080x1920 safe-area-aware cover, with central 4:5 readability.\n\n"
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
            "- Lighting or visual emphasis.\n"
            "- Background style.\n"
            "- Dashboard/UI treatment.\n"
            "- Typography hierarchy.\n"
            "- Icon/illustration style.\n"
            "- Layout rules.\n\n"
            "SLIDE-BY-SLIDE DIRECTION:\n"
            "- Include every slide from the slides array.\n"
            "- For each slide include:\n"
            "  1. Slide number\n"
            "  2. Visual scene\n"
            "  3. Main headline exactly as it should appear\n"
            "  4. Body text exactly as it should appear\n"
            "  5. Layout composition\n"
            "  6. Dashboard/UI or graphic elements\n"
            "  7. Typography hierarchy\n"
            "  8. Design direction\n"
            "  9. Transition or swipe logic if carousel\n\n"
            "CAPTION STRATEGY:\n"
            "- Explain caption angle.\n"
            "- Include CTA behavior.\n\n"
            "TEXT OVERLAY RULES:\n"
            "- Placement.\n"
            "- Safe margins.\n"
            "- Readability rules.\n"
            "- Maximum text density.\n\n"
            "CTA ENDING:\n"
            "- Final action.\n"
            "- Mention Shopify App Store listing where appropriate.\n\n"
            "NEGATIVE PROMPT / AVOID:\n"
            "- Avoid fake UI claims.\n"
            "- Avoid unrealistic revenue promises.\n"
            "- Avoid celebrity references.\n"
            "- Avoid copyrighted visual styles.\n"
            "- Avoid cluttered text.\n"
            "- Avoid tiny unreadable UI.\n"
            "- Avoid off-brand colors.\n\n"
            "Rules:\n"
            "1. The creative_prompt must include all slide details. Do not summarize slides.\n"
            "2. The creative_prompt must be usable directly in an AI image tool or by a human designer.\n"
            "3. The creative_prompt must include the full slides information inside it.\n"
            "4. The creative_prompt must include exact headline and body text for every slide.\n"
            "5. The creative_prompt must include the CTA and destination.\n"
            "6. The creative_prompt must stay brand-safe and realistic.\n"
            "7. Do not use markdown fences.\n"
            "8. Do not reference celebrities.\n"
            "9. Do not reference copyrighted visual styles.\n"
            "10. Do not promise guaranteed financial results.\n"
        ),
        expected_output=(
            "Each Instagram post idea enriched with one complete creative production prompt "
            "that includes every slide and all production details."
        ),
        agent=creative_prompt_writer,
        context=[strategy_task],
    )

    publish_task = Task(
        description=(
            "Convert the final Instagram post campaign into strict JSON.\n\n"
            "Return exactly one JSON object with this shape:\n"
            "{\n"
            '  "campaign_title": "string",\n'
            '  "strategy_summary": "string",\n'
            '  "ideas": [\n'
            "    {\n"
            '      "id": "idea_1",\n'
            '      "title": "string",\n'
            '      "post_type": "carousel",\n'
            '      "angle": "string",\n'
            '      "objective": "string",\n'
            '      "hook": "string",\n'
            '      "slides": [\n'
            "        {\n"
            '          "slide": 1,\n'
            '          "visual": "string",\n'
            '          "headline": "string",\n'
            '          "body_text": "string",\n'
            '          "design_direction": "string"\n'
            "        }\n"
            "      ],\n"
            '      "creative_prompt": "string",\n'
            '      "caption": "string",\n'
            '      "cta": "string",\n'
            '      "hashtags": ["string"],\n'
            '      "production_notes": ["string"]\n'
            "    }\n"
            "  ]\n"
            "}\n\n"
            "Critical creative_prompt requirement:\n"
            "The creative_prompt value must be a COMPLETE production prompt. It must include:\n"
            "1. Post goal\n"
            "2. Format and dimensions\n"
            "3. Brand context\n"
            "4. Visual style\n"
            "5. All slide-by-slide directions\n"
            "6. Every slide visual scene\n"
            "7. Every slide headline\n"
            "8. Every slide body text\n"
            "9. Every slide layout composition\n"
            "10. Dashboard/UI or graphic direction\n"
            "11. Typography hierarchy\n"
            "12. Text overlay rules\n"
            "13. CTA ending\n"
            "14. Negative prompt / avoid list\n\n"
            "Rules:\n"
            "1. Output JSON only.\n"
            f"2. ideas must contain exactly {number_of_ideas} items.\n"
            "3. Every idea must promote Arka Smart Analyzer.\n"
            "4. Every idea must include a non-empty and detailed creative_prompt.\n"
            "5. Every creative_prompt must include the complete slides information inside the prompt text.\n"
            "6. If post_type is carousel, slides must contain 5 to 8 slides.\n"
            "7. If post_type is single_image or reel_cover, slides must contain 1 slide.\n"
            "8. Hashtags must be relevant and not spammy.\n"
            "9. CTA must match the campaign goal.\n"
            "10. CTA should generally direct users to install or visit the Shopify App Store listing.\n"
            f"11. Language must be {language}.\n"
            "12. No markdown fences.\n"
            "13. No commentary outside the JSON.\n"
            "14. Do not invent unsupported product features.\n"
            "15. Do not claim exact revenue, profit, or conversion improvements.\n"
        ),
        expected_output="A strict JSON object containing Instagram post campaign ideas with complete creative prompts.",
        agent=publisher,
        context=[strategy_task, creative_prompt_task],
    )

    return Crew(
        agents=[strategist, creative_prompt_writer, publisher],
        tasks=[strategy_task, creative_prompt_task, publish_task],
        process=Process.sequential,
        verbose=False,
    )