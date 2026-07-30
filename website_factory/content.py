"""Node 1 (idea generator) and Node 2 (product manager).

In production these two nodes are stochastic: a model reads a seed topic and
invents a brief, then a second model turns the brief into a spec. For the
PoolFlow run they are pinned to decisions that a human has already made and
written down in docs/fieldflow-spec.md.

That is a deliberate trade, not laziness:

  * The published site is reproducible. Two runs of the same commit produce
    byte-identical HTML, so a diff means somebody changed the source.
  * Marketing copy is reviewable in a pull request instead of appearing on the
    live site because a sampler got creative.
  * CI needs no API key, so the pipeline is provable on every push.

Swapping either node for a real model call means replacing one function body.
The schema, the gate and every downstream node stay exactly as they are - that
is the whole point of the contract.

The critic half of gates G1 and G2 is stubbed with deterministic proxies. Each
rubric dimension is scored from something countable in the payload, and every
proxy is named in a comment so nobody mistakes it for a real LLM-as-critic.
"""

from __future__ import annotations

from typing import Any, Dict, List

from website_factory.envelope import Quality, require

SEED = {
    "topic": "scheduling and SMS booking for small pool service crews",
    "vertical": "pool",
    "source_spec": "docs/fieldflow-spec.md",
    "audience": "owner-operators running 1-5 person recurring service routes",
    "constraints": [
        "responsive web only, nothing to install",
        "the scheduling core must stay vertical-agnostic",
        "no payments, no route optimisation, no calendar sync in v1",
    ],
}

G1_THRESHOLD = 0.80
G1_WEIGHTS = {"novelty": 0.3, "market_plausibility": 0.3, "specificity": 0.4}

G2_THRESHOLD = 0.85
G2_WEIGHTS = {
    "completeness": 0.3,
    "internal_consistency": 0.3,
    "scope_discipline": 0.2,
    "testability": 0.2,
}

IDEA_CONTRACT = ("product_name", "tagline", "personas", "usps", "non_goals")
PRODUCT_CONTRACT = (
    "product_name",
    "positioning",
    "stories",
    "out_of_scope",
    "roadmap",
    "sections",
)


def _coverage(actual: int, target: int) -> float:
    """Proxy score: how close a count gets to the count we asked for."""
    if target <= 0:
        return 1.0
    return round(min(1.0, float(actual) / float(target)), 4)


def _has_number(text: str) -> bool:
    return any(character.isdigit() for character in text)


def idea_brief() -> Dict[str, Any]:
    """seed.topic -> idea.brief"""
    return {
        "product_name": "PoolFlow",
        "parent_brand": "FieldFlow",
        "vertical": SEED["vertical"],
        "tagline": "Your week, your customers, and the texts that fill your calendar.",
        "one_liner": (
            "PoolFlow keeps a pool service company's customers, weekly route and "
            "text-message bookings in one place, in any phone browser."
        ),
        "problem": (
            "Small service crews run on group texts, a spreadsheet and a paper "
            "route sheet. Nobody knows which lead never got answered, and the "
            "answer to 'can you come Wednesday' arrives four hours late."
        ),
        "personas": [
            {
                "id": "owner_operator",
                "name": "The owner who is also a technician",
                "context": "Runs 40-70 recurring stops a week with 1-2 helpers.",
                "pain": "Quoting and scheduling happen from a truck, one-handed.",
                "win": "Books a new customer without pulling over.",
            },
            {
                "id": "field_tech",
                "name": "The helper on the route",
                "context": "Given a list of addresses each morning, often verbally.",
                "pain": "No idea what changed after 7am.",
                "win": "Opens today's stops and taps done or no-show at the gate.",
            },
            {
                "id": "homeowner",
                "name": "The customer with a green pool",
                "context": "Found three companies, texted all three.",
                "pain": "Whoever replies first gets the job.",
                "win": "Gets two real time slots back within a minute.",
            },
        ],
        "usps": [
            {
                "title": "Replies in under a minute, at 9pm",
                "claim": (
                    "The booking assistant answers an inbound text from real "
                    "calendar gaps, so the first responder is you."
                ),
                "why_it_holds": (
                    "Slots come from the jobs table, not from a model's "
                    "imagination, and a booking is a tool call, not parsed prose."
                ),
            },
            {
                "title": "One list, and the status is the funnel",
                "claim": (
                    "Leads and customers live in the same list with 4 statuses: "
                    "lead, active, paused, lost."
                ),
                "why_it_holds": (
                    "Booking flips a lead to active automatically, so the funnel "
                    "cannot drift from reality."
                ),
            },
            {
                "title": "A week you can read at a gate",
                "claim": "7 columns, every visit in place, one tap to close a stop.",
                "why_it_holds": (
                    "Responsive web, so the same view works on a cracked phone "
                    "screen and a laptop."
                ),
            },
            {
                "title": "Built to move verticals, not to be rebuilt",
                "claim": (
                    "The scheduling core is vertical-agnostic: property "
                    "management and trade crews reuse the same schema."
                ),
                "why_it_holds": (
                    "Jobs, customers and conversations carry no pool-specific "
                    "columns. Terminology is a label, not a table."
                ),
            },
        ],
        "risks": [
            "The booking bot is the hardest part and the easiest to over-trust.",
            "Operators may not adopt anything that needs a login on a truck.",
            "One shared inbound number versus one per business changes unit cost.",
        ],
        "non_goals": [
            "Being a full field-service ERP",
            "Competing on route optimisation",
            "Anything that requires an app store download",
        ],
    }


def grade_idea(brief: Dict[str, Any]) -> Quality:
    """Gate G1. Deterministic checks first, then the proxy rubric."""
    require(brief, IDEA_CONTRACT, "idea_generator")
    personas: List[Dict[str, Any]] = brief["personas"]
    usps: List[Dict[str, Any]] = brief["usps"]
    titles = [usp["title"] for usp in usps]

    violations: List[str] = []
    if len(personas) < 2:
        violations.append("fewer than 2 personas")
    if len(usps) < 3:
        violations.append("fewer than 3 USPs")
    if len(set(titles)) != len(titles):
        violations.append("duplicate USP titles")
    if not brief["non_goals"]:
        violations.append("no non-goals declared")

    rubric = {
        # proxy: distinct USP angles, target 4
        "novelty": _coverage(len(set(titles)), 4),
        # proxy: distinct personas with a named pain, target 3
        "market_plausibility": _coverage(
            len([p for p in personas if p.get("pain")]), 3
        ),
        # proxy: claims that commit to a number rather than an adjective
        "specificity": _coverage(
            len([usp for usp in usps if _has_number(usp["claim"])]), 2
        ),
    }
    return Quality(
        threshold=G1_THRESHOLD,
        rubric=rubric,
        weights=G1_WEIGHTS,
        violations=violations,
    )


REPO_URL = "https://github.com/sebax209mr-ctrl/multi-agent-ai-system"
SPEC_URL = REPO_URL + "/blob/main/docs/fieldflow-spec.md"
FACTORY_URL = REPO_URL + "/tree/main/docs/website-factory"

REQUIRED_SECTIONS = (
    "hero",
    "features",
    "how_it_works",
    "roadmap",
    "faq",
    "closing",
)


def product_spec(brief: Dict[str, Any]) -> Dict[str, Any]:
    """idea.brief -> product.spec

    The sections block is the site's content model. Copy lives here, in the
    product node, because it is a product decision. The renderer downstream only
    decides what it looks like, never what it says.
    """
    require(brief, IDEA_CONTRACT, "idea_generator")
    usps = brief["usps"]

    return {
        "product_name": brief["product_name"],
        "parent_brand": brief["parent_brand"],
        "positioning": (
            "Scheduling and SMS booking for pool service crews, built so the "
            "same core moves to other trades by changing labels, not tables."
        ),
        "status_note": (
            "MVP in build. This page is generated from the product spec by the "
            "website factory in this repository, so it can never quietly drift "
            "from what the team agreed to build."
        ),
        "stories": [
            {
                "id": "S1",
                "as_a": "owner",
                "i_want": "to add a lead in under 20 seconds from my phone",
                "so_that": "nobody who texted me gets lost",
                "acceptance_criteria": [
                    "name and phone are the only required fields",
                    "a new record starts with status lead",
                    "a duplicate phone number is flagged, not silently created",
                ],
            },
            {
                "id": "S2",
                "as_a": "owner",
                "i_want": "a week view of every scheduled stop",
                "so_that": "I can see the route without a paper sheet",
                "acceptance_criteria": [
                    "seven day columns render on a 360px wide screen",
                    "a stop can be marked completed or no-show in one tap",
                    "the view loads for a 70 stop week without pagination",
                ],
            },
            {
                "id": "S3",
                "as_a": "customer",
                "i_want": "to text the company and be offered real times",
                "so_that": "I do not wait a day for a callback",
                "acceptance_criteria": [
                    "the assistant proposes only slots that exist as gaps",
                    "an ambiguous reply produces exactly one clarifying question",
                    "a booking is written by a tool call, never by parsing prose",
                    "confirmation is explicit before anything is written",
                ],
            },
            {
                "id": "S4",
                "as_a": "customer",
                "i_want": "a reminder the day before my visit",
                "so_that": "the gate is unlocked and the dog is inside",
                "acceptance_criteria": [
                    "one reminder per scheduled job, sent once",
                    "a cancelled job never sends a reminder",
                ],
            },
            {
                "id": "S5",
                "as_a": "owner",
                "i_want": "a conversation to escalate to me when it stalls",
                "so_that": "a stuck bot does not cost me the job",
                "acceptance_criteria": [
                    "a thread with no resolution after 4 turns is flagged",
                    "a flagged thread appears in the dashboard with full history",
                ],
            },
            {
                "id": "S6",
                "as_a": "owner",
                "i_want": "one dashboard number for the week",
                "so_that": "I know if the funnel is moving",
                "acceptance_criteria": [
                    "this week's job count, open leads and active customers",
                    "every figure is a query, never a stored counter",
                ],
            },
        ],
        "out_of_scope": [
            "Payments and invoicing",
            "Route optimisation and GPS tracking",
            "Two-way Google Calendar sync",
            "Property management and construction terminology in the UI",
            "A native mobile app",
            "Resume parsing and hiring features",
        ],
        "roadmap": [
            {
                "phase": 1,
                "name": "People and jobs by hand",
                "outcome": "An operator runs a real week inside the app.",
                "items": [
                    "accounts and business setup",
                    "customer and lead records",
                    "manual week-view scheduling, complete and no-show",
                ],
            },
            {
                "phase": 2,
                "name": "Outbound text first",
                "outcome": "Reminders land before anyone trusts a bot.",
                "items": [
                    "day-before reminders",
                    "delivery failures visible to the owner",
                ],
            },
            {
                "phase": 3,
                "name": "The booking assistant",
                "outcome": "Inbound texts turn into booked jobs.",
                "items": [
                    "inbound webhook and conversation threads",
                    "slot proposals from real gaps, structured tool calls",
                    "escalation to a human after 4 unresolved turns",
                ],
            },
            {
                "phase": 4,
                "name": "Second vertical",
                "outcome": "The same core serves a different trade.",
                "items": [
                    "terminology as configuration",
                    "one pilot outside pool service",
                ],
            },
        ],
        "metrics": [
            "median minutes from inbound text to a proposed slot",
            "share of bookings completed without an owner touching the thread",
            "stops closed in the field on the day they happened",
        ],
        "sections": {
            "hero": {
                "heading": brief["tagline"],
                "lede": brief["one_liner"],
                "problem": brief["problem"],
                "primary_cta": {
                    "label": "How the booking assistant works",
                    "href": "#how-it-works",
                },
                "secondary_cta": {"label": "Read the build spec", "href": SPEC_URL},
                "note": "Works in any phone or laptop browser. Nothing to install.",
            },
            "features": {
                "heading": "What it does",
                "items": [
                    {
                        "title": usp["title"],
                        "body": usp["claim"],
                        "evidence": usp["why_it_holds"],
                    }
                    for usp in usps
                ],
            },
            "how_it_works": {
                "heading": "The loop, end to end",
                "steps": [
                    {
                        "title": "A lead texts the business number",
                        "body": (
                            "The thread is matched to a phone number. An unknown "
                            "number becomes a lead record before anything else."
                        ),
                    },
                    {
                        "title": "The assistant reads the real calendar",
                        "body": (
                            "Open slots are computed from gaps in the next seven "
                            "days of jobs. Availability is never invented."
                        ),
                    },
                    {
                        "title": "One or two times are proposed",
                        "body": (
                            "Ambiguity gets exactly one clarifying question. Four "
                            "turns without resolution escalates to the owner."
                        ),
                    },
                    {
                        "title": "Confirmation writes the job",
                        "body": (
                            "The booking is a structured tool call, so a "
                            "double-booking cannot come from a misread sentence."
                        ),
                    },
                    {
                        "title": "The route view closes the loop",
                        "body": (
                            "The stop appears on the week view, gets closed at the "
                            "gate, and the next reminder is queued."
                        ),
                    },
                ],
            },
            "roadmap": {
                "heading": "Build order",
                "note": (
                    "Phase 3 does not start until phases 1 and 2 have been in "
                    "front of a working operator. The bot is the riskiest part, "
                    "so it ships last."
                ),
            },
            "faq": {
                "heading": "Straight answers",
                "items": [
                    {
                        "question": "Can the assistant invent a time it cannot keep?",
                        "answer": (
                            "No. Slots are read from the jobs table and a booking "
                            "is a tool call with an explicit confirmation step."
                        ),
                    },
                    {
                        "question": "Do I need an app?",
                        "answer": (
                            "No. It is a responsive web app, which is also why "
                            "the week view is designed for a narrow screen first."
                        ),
                    },
                    {
                        "question": "Is this only for pool service?",
                        "answer": (
                            "The core is deliberately vertical-agnostic. Pool "
                            "service is the first vertical, not the only one."
                        ),
                    },
                    {
                        "question": "What is explicitly not being built yet?",
                        "answer": (
                            "Payments, route optimisation, calendar sync, a native "
                            "app, and hiring features. Scope is a published list."
                        ),
                    },
                    {
                        "question": "Who generated this page?",
                        "answer": (
                            "A six-node agent pipeline in this repository, from "
                            "the same spec the engineers build against."
                        ),
                    },
                ],
            },
            "closing": {
                "heading": "Where the work lives",
                "body": (
                    "The product spec, the node architecture and the generator "
                    "that built this page are all in the repository."
                ),
                "links": [
                    {"label": "Technical spec", "href": SPEC_URL},
                    {"label": "Website factory architecture", "href": FACTORY_URL},
                    {"label": "Repository", "href": REPO_URL},
                ],
            },
        },
    }


def grade_product(spec: Dict[str, Any], brief: Dict[str, Any]) -> Quality:
    """Gate G2. A spec with no explicit exclusions is a scope-creep bomb."""
    require(spec, PRODUCT_CONTRACT, "product_manager")
    stories: List[Dict[str, Any]] = spec["stories"]
    roadmap: List[Dict[str, Any]] = spec["roadmap"]
    sections: Dict[str, Any] = spec["sections"]

    violations: List[str] = []
    if not spec["out_of_scope"]:
        violations.append("out_of_scope is empty")
    for story in stories:
        if not story.get("acceptance_criteria"):
            violations.append("story %s has no acceptance criteria" % story.get("id"))
    phases = [phase["phase"] for phase in roadmap]
    if phases != sorted(phases):
        violations.append("roadmap phases are not in order")
    for name in REQUIRED_SECTIONS:
        if name not in sections:
            violations.append("section %s is missing" % name)

    feature_titles = [item["title"] for item in sections["features"]["items"]]
    usp_titles = [usp["title"] for usp in brief["usps"]]
    testable = [story for story in stories if len(story["acceptance_criteria"]) >= 2]

    rubric = {
        # proxy: every section the renderer needs is present
        "completeness": _coverage(
            len([n for n in REQUIRED_SECTIONS if n in sections]),
            len(REQUIRED_SECTIONS),
        ),
        # proxy: the site says what the brief promised, no orphan claims
        "internal_consistency": _coverage(
            len([title for title in feature_titles if title in usp_titles]),
            len(usp_titles),
        ),
        # proxy: exclusions are named, target 5
        "scope_discipline": _coverage(len(spec["out_of_scope"]), 5),
        # proxy: stories with more than one acceptance criterion
        "testability": _coverage(len(testable), len(stories)),
    }
    return Quality(
        threshold=G2_THRESHOLD,
        rubric=rubric,
        weights=G2_WEIGHTS,
        violations=violations,
    )
