import json
from typing import Any, Dict, List

from crewai import Agent, Crew, Process, Task

from crews.shared.llm import build_llm


def _to_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, default=str)


def _compact_activity(activity: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(activity.get("_id") or activity.get("id") or ""),
        "type": activity.get("type", ""),
        "title": activity.get("title", ""),
        "body": activity.get("body", ""),
        "emailSent": bool(activity.get("emailSent", False)),
        "emailTo": activity.get("emailTo", ""),
        "emailSubject": activity.get("emailSubject", ""),
        "contactPerson": activity.get("contactPerson", ""),
        "outcome": activity.get("outcome", ""),
        "nextFollowUpAt": activity.get("nextFollowUpAt"),
        "createdAt": activity.get("createdAt"),
        "updatedAt": activity.get("updatedAt"),
    }


def _compact_activities(
    activities: List[Dict[str, Any]],
    max_items: int = 80,
) -> List[Dict[str, Any]]:
    if not isinstance(activities, list):
        return []

    return [_compact_activity(item) for item in activities[:max_items]]


def create_store_crm_analysis_crew(payload: Dict[str, Any]) -> Crew:
    llm = build_llm()

    store = payload.get("store") or {}
    summary = payload.get("summary") or {}
    activities = _compact_activities(payload.get("activities") or [])

    store_json = _to_json(store)
    summary_json = _to_json(summary)
    activities_json = _to_json(activities)

    crm_auditor = Agent(
        role="CRM Data Auditor",
        goal=(
            "Audit the store CRM timeline and determine what actually happened, "
            "what is missing, and whether the store has been contacted."
        ),
        backstory=(
            "You are a strict CRM operations analyst. You only trust evidence "
            "from the supplied CRM activities. You never invent emails, replies, "
            "calls, meetings, outcomes, or follow-ups."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    outreach_strategist = Agent(
        role="Shopify B2B Outreach Strategist",
        goal=(
            "Turn CRM history into a practical next-step plan for selling a "
            "Shopify analytics app to the store."
        ),
        backstory=(
            "You understand B2B SaaS outreach, Shopify merchants, CRM pipeline "
            "management, follow-up timing, and sales prioritization."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    finalizer = Agent(
        role="CRM Analysis Finalizer",
        goal=(
            "Produce strict JSON that the Node backend can save or display "
            "without manual cleanup."
        ),
        backstory=(
            "You are a precise reviewer. You enforce JSON-only output, evidence-based "
            "reasoning, and practical CRM recommendations."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    audit_task = Task(
        description=f"""
Analyze this store CRM data.

STORE:
{store_json}

CRM SUMMARY:
{summary_json}

CRM ACTIVITIES:
{activities_json}

Your job:
1. Determine whether this store has been emailed.
2. Identify the latest activity.
3. Identify the latest email event, if any.
4. Determine the current CRM stage.
5. Detect missing information.
6. Detect risks, weak records, or contradictory CRM signals.
7. Extract evidence from notes.

Rules:
- Use only the provided data.
- Do not invent contact history.
- If there is no evidence, say the evidence is missing.
- Treat emailSent=true or type=email_sent as evidence that an email was sent.
- Treat outcome=interested or positive as a strong signal.
- Treat outcome=not_interested or negative as a weak/low-priority signal.
""",
        expected_output=(
            "A structured CRM audit explaining contact history, evidence, missing "
            "information, CRM stage, and risks."
        ),
        agent=crm_auditor,
    )

    strategy_task = Task(
        description="""
Create a practical CRM strategy from the audit.

Business context:
- Product: Arka Smart Analyzer
- Product category: Shopify analytics app
- Audience: Shopify merchants
- Core value: detect hidden product, pricing, inventory, and performance issues
- Goal: move the store toward reply, install, demo, or trial

Decision rules:
- If the store has never been emailed, recommend first outreach.
- If the store was emailed but has no reply, recommend follow-up.
- If the store showed interest, recommend direct next step.
- If the store was negative or not interested, lower priority.
- If CRM data is poor, recommend research or CRM cleanup.
- If follow-up date is overdue or missing, flag it.

Return:
- CRM stage
- next recommended action
- priority score
- confidence score
- recommended channel
- recommended timing
- outreach angle
- suggested subject
- suggested short email body
- risks
- missing CRM data
""",
        expected_output=(
            "A next-step CRM strategy with priority, timing, channel, risk, "
            "and outreach recommendation."
        ),
        agent=outreach_strategist,
        context=[audit_task],
    )

    final_task = Task(
        description="""
Return ONLY valid JSON. No markdown. No code fences. No explanation outside JSON.

The JSON must exactly follow this schema:

{
  "crmStatus": {
    "stage": "new|contacted|follow_up_needed|interested|not_interested|closed|unknown",
    "hasEmailed": true,
    "lastActivityAt": "ISO date or null",
    "lastEmailAt": "ISO date or null",
    "nextFollowUpAt": "ISO date or null",
    "dataQuality": "good|partial|poor"
  },
  "score": {
    "priority": 0,
    "confidence": 0,
    "reason": "short explanation"
  },
  "summary": {
    "executiveSummary": "2-4 sentences",
    "whatHappened": ["bullet"],
    "importantSignals": ["bullet"],
    "missingInformation": ["bullet"],
    "risks": ["bullet"]
  },
  "recommendation": {
    "nextAction": "send_first_email|send_follow_up|wait|call|book_meeting|mark_not_interested|research_more",
    "recommendedChannel": "email|call|linkedin|manual_review|none",
    "recommendedTiming": "now|today|this_week|next_week|no_action",
    "reason": "short explanation"
  },
  "outreach": {
    "subject": "short email subject or empty string",
    "body": "short email body or empty string",
    "angle": "short positioning angle"
  },
  "crmUpdates": {
    "suggestedTags": ["tag"],
    "suggestedOutcome": "none|positive|neutral|negative|no_response|interested|not_interested",
    "suggestedNote": "short note to save in CRM"
  }
}

Strict rules:
- priority must be 0 to 100.
- confidence must be 0 to 100.
- Use null for missing dates.
- hasEmailed must be true only if CRM evidence supports it.
- Do not invent replies, calls, or meetings.
- Keep email body short and ready to send.
""",
        expected_output="Strict valid JSON only.",
        agent=finalizer,
        context=[audit_task, strategy_task],
    )

    return Crew(
        agents=[crm_auditor, outreach_strategist, finalizer],
        tasks=[audit_task, strategy_task, final_task],
        process=Process.sequential,
        verbose=True,
    )


if __name__ == "__main__":
    demo_payload = {
        "store": {
            "_id": "demo_store_id",
            "name": "Demo Shopify Store",
            "domain": "demo-store.com",
            "country": "Canada",
            "contactEmail": "team@demo-store.com",
        },
        "summary": {
            "totalActivities": 2,
            "hasEmailed": True,
            "lastActivityAt": "2026-04-30T10:00:00.000Z",
            "lastEmailAt": "2026-04-30T10:00:00.000Z",
            "nextFollowUpAt": None,
        },
        "activities": [
            {
                "_id": "activity_1",
                "type": "email_sent",
                "title": "First outreach email sent",
                "body": "Sent an intro email about product performance and inventory analytics.",
                "emailSent": True,
                "emailTo": "team@demo-store.com",
                "emailSubject": "Hidden product performance issues",
                "contactPerson": "",
                "outcome": "no_response",
                "nextFollowUpAt": None,
                "createdAt": "2026-04-30T10:00:00.000Z",
            }
        ],
    }

    crew = create_store_crm_analysis_crew(demo_payload)
    result = crew.kickoff()
    print(result)