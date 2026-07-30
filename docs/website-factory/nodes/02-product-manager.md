# Node 2 — Product Manager

`type: agent.product` · `id: product_manager` · `version: 1.0.0`
Upstream: **Node 1 — Idea Generator** · Downstream: **Node 3 — UI/UX Designer**

---

## Vibe & Persona

> A senior PM who has shipped v1 four times and has learned that the roadmap is mostly a list of things you agreed not to build.

Ruthless about scope. Translates enthusiasm into testable statements. Every story has acceptance
criteria a machine can verify; every phase has an exit criterion; every exclusion is written down
so that no downstream node can quietly reintroduce it.

**Operating rules:** if it cannot be tested, it is not a requirement. If it is not in `in_scope`,
it is out. Phase 1 must be shippable alone. Vague words (fast, intuitive, seamless) are replaced
with numbers or deleted.

---

## Inputs

Consumes the `idea.brief` payload emitted by Node 1, plus optional delivery constraints.

```json
{
  "idea_brief": { "...": "full idea.brief payload from Node 1" },
  "delivery_constraints": {
    "target_stack_hint": "nextjs",
    "phase_count": 3,
    "max_phase_1_stories": 12,
    "launch_deadline": "2026-09-15",
    "compliance": ["cookie_consent_eu"],
    "site_type": "marketing_site_with_waitlist"
  }
}
```

Rejects the input (E1xx) if `personas`, `features`, or `usps` are missing or empty. It never
invents a persona; missing personas are an upstream defect, not a gap to fill.

---

## Internal logic

1. **Traceability map.** Bind every feature to a persona and a USP. Features that trace to neither are moved to `out_of_scope` with a reason.
2. **Scope carving.** Split into `in_scope` / `out_of_scope` / `non_goals`. `out_of_scope` must not be empty; an unbounded spec is treated as a gate failure.
3. **Story writing.** Convert each in-scope feature into user stories with Gherkin acceptance criteria.
4. **Estimation.** Fibonacci points plus a complexity tag; flag any story above 8 points for splitting.
5. **Phasing.** Build a roadmap where Phase 1 is independently shippable and each phase has measurable exit criteria.
6. **Site map.** Define routes, purpose, primary CTA and required sections — this is the contract the Designer node consumes.
7. **Spec rendering.** Emit human-readable Markdown alongside the JSON, so the repository stays reviewable by humans.
8. **Self-audit.** Verify every acceptance criterion is objectively checkable; rewrite any that are not.

---

## Outputs

Emits `product.spec` plus a Markdown artifact.

```json
{
  "product": {
    "name": "FieldFlow",
    "one_liner": "Job management for solo trade operators — run the whole van from your pocket",
    "traces_to_usps": ["u1", "u2", "u3"]
  },
  "scope": {
    "in_scope": [
      "Marketing site with 5 routes",
      "Waitlist capture with email verification",
      "Interactive product tour (static, no backend)",
      "Pricing page with 3 tiers",
      "Cookie consent banner"
    ],
    "out_of_scope": [
      "Working voice-to-job engine (marketing site only shows a demo animation)",
      "Payment processing",
      "User accounts and authentication",
      "Native mobile apps",
      "Multi-language content",
      "Blog / CMS integration"
    ],
    "non_goals": [
      "Competing on feature count with fleet software",
      "Serving shops with more than 3 technicians in v1"
    ],
    "assumptions": [
      "Waitlist provider handles double opt-in",
      "No PII beyond email is collected at launch"
    ],
    "constraints": {
      "performance": "LCP < 2.0s on 4G mobile",
      "accessibility": "WCAG 2.2 AA",
      "seo": "server-rendered, unique meta per route",
      "budget": { "build_hours": 24, "monthly_hosting_usd": 0 }
    }
  },
  "epics": [
    { "id": "e1", "title": "Convince a solo operator in 30 seconds", "persona_ids": ["p1"], "feature_ids": ["f1", "f2"] },
    { "id": "e2", "title": "Capture demand before launch", "persona_ids": ["p1", "p2"], "feature_ids": ["f3"] }
  ],
  "user_stories": [
    {
      "id": "s1",
      "epic_id": "e1",
      "as_a": "solo HVAC technician arriving from a Facebook group link",
      "i_want": "to understand what this does without reading a paragraph",
      "so_that": "I can decide in seconds whether it is for me",
      "acceptance_criteria": [
        "Given a mobile viewport of 390px, when the landing route loads, then the headline, subhead and primary CTA are visible without scrolling",
        "Given any viewport, when the hero renders, then the headline contains the phrase describing solo operators",
        "Given a 4G connection, when the landing route loads, then Largest Contentful Paint is under 2.0 seconds"
      ],
      "priority": "must",
      "estimate_points": 3,
      "dependencies": [],
      "traces_to": { "features": ["f1"], "usps": ["u1"] }
    },
    {
      "id": "s2",
      "epic_id": "e2",
      "as_a": "interested visitor",
      "i_want": "to join the waitlist with only my email",
      "so_that": "I am notified at launch without giving up my time",
      "acceptance_criteria": [
        "Given the waitlist form, when I submit a valid email, then I see a success state within 1 second and receive a confirmation email",
        "Given the waitlist form, when I submit an invalid email, then an inline error is announced to screen readers and focus moves to the field",
        "Given a duplicate email, when I submit, then I see the success state and no duplicate record is created"
      ],
      "priority": "must",
      "estimate_points": 5,
      "dependencies": ["s1"],
      "traces_to": { "features": ["f3"], "usps": ["u2"] }
    }
  ],
  "roadmap": {
    "phases": [
      {
        "id": "ph1",
        "name": "Phase 1 — Proof of interest",
        "goal": "Live site that explains the wedge and captures a waitlist",
        "duration_weeks": 1,
        "includes": ["s1", "s2"],
        "exit_criteria": [
          "All Phase 1 stories pass acceptance criteria",
          "Lighthouse performance >= 0.90 on mobile",
          "At least one end-to-end waitlist submission verified in production"
        ],
        "ship_gate": "auto"
      },
      {
        "id": "ph2",
        "name": "Phase 2 — Objection handling",
        "goal": "Pricing clarity and comparison content",
        "duration_weeks": 1,
        "includes": ["s3", "s4"],
        "exit_criteria": ["Pricing page live", "Comparison table covers 2 incumbents"],
        "ship_gate": "human"
      },
      {
        "id": "ph3",
        "name": "Phase 3 — Product tour",
        "goal": "Animated walkthrough of job capture",
        "duration_weeks": 2,
        "includes": ["s5"],
        "exit_criteria": ["Tour completes without layout shift", "CLS < 0.1"],
        "ship_gate": "human"
      }
    ]
  },
  "site_map": [
    {
      "route": "/",
      "purpose": "Convert cold traffic to waitlist",
      "primary_cta": "Join the waitlist",
      "sections": ["hero", "problem", "three_usps", "how_it_works", "social_proof", "waitlist", "footer"],
      "seo": { "title": "FieldFlow — run the whole van from your pocket", "description": "Job management built for one van, not one hundred." }
    },
    { "route": "/pricing", "purpose": "Remove price uncertainty", "primary_cta": "Join the waitlist", "sections": ["tier_table", "faq", "cta"] },
    { "route": "/how-it-works", "purpose": "Demonstrate the capture flow", "primary_cta": "Join the waitlist", "sections": ["step_walkthrough", "cta"] },
    { "route": "/about", "purpose": "Establish credibility", "primary_cta": "Contact", "sections": ["story", "team", "cta"] },
    { "route": "/legal/privacy", "purpose": "Compliance", "primary_cta": null, "sections": ["policy_body"] }
  ],
  "success_metrics": [
    { "metric": "waitlist_conversion_rate", "baseline": null, "target": "> 6% of unique visitors", "instrumentation": "privacy-friendly analytics event" },
    { "metric": "mobile_lcp_p75", "target": "< 2.0s", "instrumentation": "Lighthouse CI in the deploy pipeline" }
  ],
  "artifacts": { "specs_markdown_path": "runs/<run_id>/pm/feature-specs.md" },
  "open_questions": [
    { "id": "q1", "question": "Confirm whether pricing tiers can be shown before launch", "blocking": false, "owner": "human" }
  ]
}
```

### Markdown artifact template

The same content is rendered to `docs/product-spec.md` in the generated repository, so a human
reviewer never has to read raw JSON.

~~~markdown
# FieldFlow — Product Specification (Phase 1)

## 1. Summary
One-liner, target persona, and the three USPs this build must communicate.

## 2. Scope
### In scope
- ...
### Out of scope (explicitly not building)
- ...
### Non-goals
- ...

## 3. User stories
### S1 — Understand the product in 30 seconds
**As a** solo HVAC technician **I want** ... **so that** ...

**Acceptance criteria**
- [ ] Given ... when ... then ...

## 4. Roadmap
| Phase | Goal | Stories | Exit criteria | Ship gate |
|-------|------|---------|---------------|-----------|

## 5. Site map
| Route | Purpose | Primary CTA | Sections |
|-------|---------|-------------|----------|

## 6. Success metrics
| Metric | Target | Instrumentation |
|--------|--------|-----------------|

## 7. Open questions
| ID | Question | Blocking | Owner |
|----|----------|----------|-------|
~~~

---

## Core tools

| Tool | Purpose | Failure mode if unavailable |
|------|---------|-----------------------------|
| Markdown renderer / templating (Jinja, Handlebars) | produce the human-readable spec | emit JSON only, flag `degraded` |
| JSON Schema validator | enforce `product.spec` contract | **hard fail** |
| Estimation heuristic library | consistent point sizing | fall back to T-shirt sizes |
| Issue tracker API (GitHub Issues / Linear / Jira) — optional | mirror stories as issues for human tracking | skip mirroring, note in run report |
| Requirements linter (custom) | detect untestable criteria and vague adjectives | reduce quality score, continue |
| Prior-run spec memory | keep naming and structure consistent across runs | proceed without consistency check |

---

## Quality gate (G2)

Deterministic: schema valid · every story has >= 1 acceptance criterion in Given/When/Then form ·
`scope.out_of_scope` non-empty · every story traces to an existing feature id and persona id ·
roadmap phases ordered with no forward dependencies · every route in `site_map` has a purpose ·
no story estimated above 8 points.

Critic rubric: completeness 0.3 · internal consistency 0.3 · scope discipline 0.2 · testability 0.2.
**Threshold 0.85.**

---

## Edge cases & troubleshooting

| Symptom | Error class | Root cause | Automated remedy | Escalation |
|---------|-------------|------------|------------------|------------|
| `out_of_scope` empty | E2xx | model tried to build everything | re-prompt demanding at least 5 explicit exclusions | human review if it repeats |
| Story references a non-existent feature or persona id | E1xx | hallucinated trace | drop the story, re-run traceability pass; if >20% of stories affected, reject whole output | human review |
| Acceptance criteria are subjective ("looks modern") | E2xx | untestable requirement | requirements linter flags, node rewrites the criterion | after 2 attempts, human |
| Phase 1 not independently shippable | E2xx | dependencies leak across phases | re-run phasing with a topological sort of dependencies | human if unresolvable |
| Scope exceeds `delivery_constraints.build_hours` | E2xx | over-ambitious v1 | auto-defer lowest value-per-point stories to later phases, record in `out_of_scope` | human approval for what gets cut |
| Blocking open question raised | E8xx | genuine unknown | pause branch, ask the human the specific question with options | always human |
| Compliance requirement detected (EU cookies, health data, payments) | E4xx-policy | regulated surface | inject the required story (consent banner, privacy route) and mark for human legal review | always human |
| Circular story dependencies | E1xx | bad decomposition | detect cycle, break it by merging or splitting stories | human if cycle persists |
| Upstream brief thin (confidence < 0.6) | E2xx | weak Node 1 output | request Node 1 rework via Orchestrator rather than compensating silently | human after one loop |

---

## Workflow node definition

```json
{
  "id": "product_manager",
  "name": "Product Manager",
  "type": "agent.product",
  "typeVersion": 1,
  "position": [560, 240],
  "parameters": {
    "model": "claude-opus-4",
    "temperature": 0.4,
    "max_output_tokens": 12000,
    "system_prompt_ref": "prompts/product_manager.md",
    "input_schema_ref": "schemas/idea.brief.schema.json",
    "output_schema_ref": "schemas/product.spec.schema.json",
    "tools": ["markdown_render", "schema_validator", "requirements_linter", "issue_tracker"],
    "emit_artifacts": ["docs/product-spec.md"],
    "phase_count": 3,
    "retry": { "max_attempts": 2, "on": ["E1xx", "E2xx"], "backoff": "immediate_with_critique" },
    "gate": {
      "id": "G2",
      "threshold": 0.85,
      "deterministic": [
        "schema_valid",
        "gherkin_criteria_present",
        "out_of_scope_non_empty",
        "trace_integrity",
        "phase_dependency_acyclic",
        "max_story_points:8"
      ],
      "rubric": { "completeness": 0.3, "internal_consistency": 0.3, "scope_discipline": 0.2, "testability": 0.2 }
    }
  },
  "credentials": { "llm": "ANTHROPIC_API_KEY", "issue_tracker": "GITHUB_TOKEN" },
  "onError": "route_to_orchestrator"
}
```
