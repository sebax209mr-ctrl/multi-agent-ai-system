# Node 1 — Idea Generator

`type: agent.ideation` · `id: idea_generator` · `version: 1.0.0`
Upstream: **Orchestrator (trigger)** · Downstream: **Node 2 — Product Manager**

---

## Vibe & Persona

> A venture studio strategist who has killed more ideas than they have launched, and is proud of it.

Opinionated, commercially sceptical, allergic to generic output. This node refuses to produce
"a modern platform that leverages AI" — it produces a named audience, a specific painful job,
and a reason someone would switch today. It thinks in wedges: who is underserved, what do they
currently hack together in a spreadsheet, and what single feature would make them move.

**Operating rules:** every claim is attached to a persona; every USP must name what it beats,
not just what it does; if the niche is too broad to differentiate, it narrows the niche itself
and says so in `assumptions`.

---

## Inputs

Accepts a `seed.topic` payload inside the standard envelope.

```json
{
  "seed": {
    "topic": "field service management for solo HVAC technicians",
    "constraints": {
      "geography": "US, English",
      "business_model": "b2b_saas",
      "budget_tier": "bootstrapped",
      "site_type": "marketing_site_with_waitlist"
    },
    "brand_hints": { "tone": "practical, no-nonsense", "avoid": ["cutesy", "enterprise-jargon"] },
    "competitor_urls": ["https://example-competitor.com"],
    "variants_requested": 1
  }
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `seed.topic` | string | yes | free text; 3–200 chars |
| `seed.constraints` | object | no | narrows the search space; defaults applied if absent |
| `seed.brand_hints` | object | no | tone and words to avoid |
| `seed.competitor_urls` | string[] | no | seeds the research step |
| `seed.variants_requested` | int | no | 1–3; >1 triggers a fan-out and a selection gate |

---

## Internal logic

1. **Normalise the seed.** Detect vagueness. If the topic scores as too broad, propose a narrowed wedge and record it in `assumptions[]`.
2. **Research pass.** Web search for the niche, existing tools, pricing pages, and community complaints. Cap: 8 queries, 20 fetched pages.
3. **Persona synthesis.** Build 2–4 personas grounded in observed language from forums and reviews, not invented demographics.
4. **Jobs-to-be-done extraction.** Convert pains into JTBD statements, then into candidate features.
5. **Feature triage.** MoSCoW-classify features; score value vs complexity; keep the must-haves to the smallest shippable set.
6. **USP forging.** For each USP, name the incumbent behaviour it displaces and the proof point that makes it credible.
7. **Self-critique.** Score against the G1 rubric, rewrite anything scoring below 0.7, then emit.

---

## Outputs

Emits `idea.brief`.

```json
{
  "niche": "field service management for solo HVAC technicians",
  "narrowed_from": "field service management",
  "market_snapshot": {
    "size_signal": "1.1M+ US HVAC technicians; long tail of 1-3 person shops",
    "incumbent_gap": "existing tools are priced and designed for 10+ seat fleets",
    "sources": ["https://...", "https://..."]
  },
  "personas": [
    {
      "id": "p1",
      "name": "Marcus, the owner-operator",
      "role": "Solo HVAC technician, 12 years experience",
      "context": "Works from a van, quotes on paper, invoices at 9pm",
      "goals": ["Get paid faster", "Stop losing quote requests", "Look legitimate to homeowners"],
      "pains": ["Double-booked appointments", "Chasing unpaid invoices", "No online presence"],
      "jobs_to_be_done": [
        "When a homeowner calls while I am under a furnace, I want to capture the job without stopping work, so I do not lose the lead"
      ],
      "tech_comfort": "medium",
      "devices": ["android_phone", "occasional_laptop"],
      "willingness_to_pay": { "monthly_usd": [19, 49], "confidence": 0.6 },
      "objection": "I already pay for three apps I barely use"
    },
    {
      "id": "p2",
      "name": "Dana, the office half of a two-person shop",
      "role": "Spouse-operator handling scheduling and billing",
      "goals": ["One place for the schedule", "Fewer phone tags"],
      "pains": ["Reconciling texts, voicemails and a paper calendar"],
      "jobs_to_be_done": ["When a job moves, I want the customer notified automatically"],
      "tech_comfort": "high",
      "devices": ["laptop", "iphone"],
      "willingness_to_pay": { "monthly_usd": [29, 79], "confidence": 0.7 },
      "objection": "Migration will cost me a weekend"
    }
  ],
  "features": [
    {
      "id": "f1",
      "name": "Voice-to-job capture",
      "description": "Dictate a job while working; the system parses customer, address and problem into a scheduled job",
      "persona_ids": ["p1"],
      "moscow": "must",
      "value_score": 9,
      "complexity": "M",
      "rationale": "Directly removes the moment leads are lost"
    },
    {
      "id": "f2",
      "name": "Instant quote to paid invoice",
      "description": "One-tap conversion of an approved quote into a payable invoice link",
      "persona_ids": ["p1", "p2"],
      "moscow": "must",
      "value_score": 8,
      "complexity": "M"
    },
    {
      "id": "f3",
      "name": "Automatic customer notifications",
      "description": "SMS on schedule, en-route, and completion",
      "persona_ids": ["p2"],
      "moscow": "should",
      "value_score": 7,
      "complexity": "S"
    }
  ],
  "usps": [
    {
      "id": "u1",
      "statement": "Built for one van, not one hundred",
      "displaces": "Fleet software with per-seat pricing and unused dispatch boards",
      "differentiator": "Single-operator information architecture; zero dispatch concepts",
      "defensibility": "Product shape, not a feature; hard for fleet incumbents to copy without confusing their core buyer",
      "proof_point": "Setup completes in under 8 minutes with no onboarding call"
    },
    {
      "id": "u2",
      "statement": "Quote on the driveway, paid before you leave it",
      "displaces": "Evening admin sessions and 30-day invoice chases",
      "differentiator": "Quote and payment collapse into one flow",
      "proof_point": "Median time-to-payment target under 24 hours"
    },
    {
      "id": "u3",
      "statement": "Works with grease on your hands",
      "displaces": "Form-heavy mobile apps",
      "differentiator": "Voice-first capture and large-target UI",
      "proof_point": "Core job capture in 3 taps or one 10-second dictation"
    }
  ],
  "positioning": {
    "category": "Job management for solo trade operators",
    "tagline": "Run the whole van from your pocket",
    "tone_of_voice": ["plain-spoken", "respectful of skilled trades", "zero hype"],
    "competitors": [
      { "name": "Incumbent A", "url": "https://...", "weakness": "Per-seat pricing punishes solo operators" },
      { "name": "Incumbent B", "url": "https://...", "weakness": "Onboarding requires a sales call" }
    ]
  },
  "naming_candidates": ["FieldFlow", "OneVan", "Wrenchline"],
  "risks": [
    { "risk": "Voice parsing accuracy in noisy environments", "severity": "high", "mitigation": "Confirmation screen with editable fields" },
    { "risk": "Payment processing requires compliance work", "severity": "medium", "mitigation": "Phase 2; use a hosted provider" }
  ],
  "assumptions": [
    "Niche narrowed from generic field service to solo HVAC to make differentiation possible"
  ],
  "confidence": { "market": 0.72, "personas": 0.81, "usps": 0.78 }
}
```

---

## Core tools

| Tool | Purpose | Failure mode if unavailable |
|------|---------|-----------------------------|
| Web Search API (Brave / Tavily / SerpAPI) | market and competitor discovery | degrade to model priors, drop `market_snapshot.sources`, set `confidence.market <= 0.5` |
| URL fetch + readability extractor | read competitor pricing and feature pages | skip that competitor, note it in `assumptions` |
| Trend signal (Google Trends / Reddit / HN search) | demand validation | optional; omit `size_signal` |
| Vector memory / prior-run store | avoid regenerating a niche already covered | proceed without dedupe |
| JSON Schema validator | enforce `idea.brief` contract | **hard fail** — never emit unvalidated output |

---

## Quality gate (G1)

Deterministic: schema valid · `personas.length >= 2` · `usps.length >= 3` · every feature
references at least one existing persona id · no two USPs with cosine similarity > 0.85 · no
banned filler phrases ("cutting-edge", "revolutionary", "leverages AI").

Critic rubric: novelty 0.3 · market plausibility 0.3 · specificity 0.4. **Threshold 0.80.**

---

## Edge cases & troubleshooting

How the IT & Deployment Node (system SRE) recovers failures originating here.

| Symptom | Error class | Root cause | Automated remedy | Escalation |
|---------|-------------|------------|------------------|------------|
| Output fails schema validation | E1xx | model returned prose or truncated JSON | re-prompt with validator error text + `response_format: json`; lower temperature to 0.3 | after 2 attempts, send to human with raw output attached |
| Topic too vague ("build me a website") | E2xx | insufficient seed | auto-narrow and record assumption; if still vague, generate 3 candidate wedges | ask human to pick a wedge |
| Search API 429 / 5xx | E3xx | rate limit or outage | backoff 2^n with jitter, cap 3; fail over to secondary provider | run in **degraded** mode with reduced confidence, flag in run report |
| Generic, undifferentiated USPs | E2xx | model played it safe | rework with an anti-generic critique and a banned-phrase list | after 2 reworks, present variants for human selection |
| Personas contradict constraints (B2C personas for a B2B seed) | E1xx | constraint not honoured | re-prompt with constraints hoisted to the top of the instruction | human review |
| Niche is regulated or restricted (medical, financial advice, gambling) | E4xx-policy | policy boundary | halt branch immediately; do not attempt a workaround | **always** human decision |
| Duplicate of a previous run | E2xx | memory hit | return cached brief with `status: skipped`, or force-regenerate with a novelty penalty | none |
| Token budget exceeded mid-generation | E7xx | oversized research context | truncate research to top 8 sources by relevance, retry once | human if cap breached |

---

## Workflow node definition

```json
{
  "id": "idea_generator",
  "name": "Idea Generator",
  "type": "agent.ideation",
  "typeVersion": 1,
  "position": [280, 240],
  "parameters": {
    "model": "claude-opus-4",
    "temperature": 0.9,
    "max_output_tokens": 6000,
    "system_prompt_ref": "prompts/idea_generator.md",
    "output_schema_ref": "schemas/idea.brief.schema.json",
    "tools": ["web_search", "url_fetch", "trend_signal", "vector_memory"],
    "research_budget": { "max_queries": 8, "max_pages": 20 },
    "variants": 1,
    "retry": { "max_attempts": 2, "on": ["E1xx", "E2xx", "E3xx"], "backoff": "exponential_jitter" },
    "gate": {
      "id": "G1",
      "threshold": 0.8,
      "deterministic": ["schema_valid", "min_personas:2", "min_usps:3", "persona_ref_integrity", "usp_dedupe:0.85"],
      "rubric": { "novelty": 0.3, "market_plausibility": 0.3, "specificity": 0.4 }
    }
  },
  "credentials": { "search_api": "SEARCH_API_KEY", "llm": "ANTHROPIC_API_KEY" },
  "onError": "route_to_orchestrator"
}
```
