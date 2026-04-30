from crews.blog.crew import create_blog_crew
from crews.dashboard.crew import create_dashboard_crew
from crews.research.crew import create_research_crew
from crews.competitor_analysis.crew import create_competitor_analysis_crew
from crews.seo_audit.crew import create_seo_audit_crew
from crews.seo_keyword_opportunity import create_seo_keyword_opportunity_crew
from crews.blog_from_links.crew import create_blog_from_links_crew
from crews.shopify_trends.crew import create_shopify_trends_crew
from crews.store_outreach.crew import create_store_outreach_crew
from crews.problem_discovery.crew import create_problem_discovery_crew
from crews.manage_competitor_analysis.crew import create_manage_competitor_analysis_crew
from crews.marketing_email_reply.crew import create_marketing_email_reply_crew
from crews.instagram.crew import create_instagram_story_idea_crew
from crews.instagram_post.crew import create_instagram_post_idea_crew
from crews.store_crm_analysis.crew import create_store_crm_analysis_crew


def build_crew(crew_name, payload):
    if crew_name == "blog":
        return create_blog_crew(payload)

    if crew_name == "dashboard":
        return create_dashboard_crew(payload)

    if crew_name == "research":
        return create_research_crew(payload)

    if crew_name == "competitor_analysis":
        return create_competitor_analysis_crew(payload)

    if crew_name == "shopify_trends":
        return create_shopify_trends_crew(payload)

    if crew_name == "seo_keyword_opportunity":
        return create_seo_keyword_opportunity_crew(payload)

    if crew_name == "blog_from_links":
        return create_blog_from_links_crew(payload)

    if crew_name == "store_outreach":
        return create_store_outreach_crew(payload)

    if crew_name == "store_crm_analysis":
        return create_store_crm_analysis_crew(payload)

    if crew_name == "seo_audit":
        return create_seo_audit_crew(payload)

    if crew_name == "problem_discovery":
        return create_problem_discovery_crew(payload)

    if crew_name == "manage_competitor_analysis":
        return create_manage_competitor_analysis_crew(payload)

    if crew_name == "marketing_email_reply":
        return create_marketing_email_reply_crew(payload)

    if crew_name == "instagram_story_idea":
        return create_instagram_story_idea_crew(payload)

    if crew_name == "instagram_post_idea":
        return create_instagram_post_idea_crew(payload)

    raise ValueError(f"Unknown crew_name: {crew_name}")