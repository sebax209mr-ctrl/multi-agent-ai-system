# Website Generation & Deployment Factory

A modular, node-based multi-agent system that takes a seed topic and returns a deployed website,
a GitHub repository, and a full decision trail. Designed so the architecture can be exported to a
visual workflow engine (n8n, LangGraph, Temporal) or executed by a reference runner.

## Read in this order

| Doc | What it covers |
|-----|----------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System topology, the canonical envelope, run state machine, routing table, quality gates, error taxonomy |
| [nodes/01-idea-generator.md](nodes/01-idea-generator.md) | Seed topic to personas, features and USPs |
| [nodes/02-product-manager.md](nodes/02-product-manager.md) | User stories, scope boundaries, phased roadmap, Markdown specs |
| [nodes/03-uiux-designer.md](nodes/03-uiux-designer.md) | Component hierarchy, design tokens, semantic wireframes |
| [nodes/04-software-engineer.md](nodes/04-software-engineer.md) | Modular code generation and repository structure |
| [nodes/05-it-deployment.md](nodes/05-it-deployment.md) | GitHub sync, hosting, secrets, verification, rollback, SRE role |
| [nodes/06-lead-manager-orchestrator.md](nodes/06-lead-manager-orchestrator.md) | State, routing, budgets, human approvals, run report |
| [../../workflows/website-factory.workflow.json](../../workflows/website-factory.workflow.json) | Machine-readable workflow: nodes, connections, gates, routing rules |

## The pipeline in one line

`seed -> idea.brief -> product.spec -> design.system -> code.bundle -> deployment.record -> run.report`

Each arrow is a JSON contract validated twice (on emit and on receipt) and guarded by a quality
gate. The Lead Manager owns state and is the only node that talks to a human.

## Node summary

| # | Node | Vibe | Emits | Gate |
|---|------|------|-------|------|
| 1 | Idea Generator | venture studio strategist, commercially sceptical | `idea.brief` | G1 >= 0.80 |
| 2 | Product Manager | ruthless scope discipline, everything testable | `product.spec` | G2 >= 0.85 |
| 3 | UI/UX Designer | systems designer, tokens over pictures | `design.system` | G3 >= 0.85 + WCAG AA |
| 4 | Software Engineer | boring readable code, proves the build | `code.bundle` | G4 >= 0.85 + toolchain green |
| 5 | IT & Deployment | paranoid platform engineer, everything reversible | `deployment.record` | G5 objective checks |
| 6 | Lead Manager | delivery lead, does none of the work, owns all of it | `run.report` | owns all gates |

## Every node defines the same four things

1. **Vibe & Persona** — the professional mindset and its operating rules.
2. **Inputs & Outputs** — exact JSON payloads, with schema references.
3. **Core Tools** — external integrations plus the degradation path when each is unavailable.
4. **Edge Cases & Troubleshooting** — a symptom / error-class / remedy / escalation table that the
   IT node executes in its SRE capacity.

## Operating principles worth knowing before you extend it

- **Nodes never chat.** They exchange validated envelopes. Anything not in the schema does not cross the wire.
- **Gate, then escalate.** Two bounded reworks, then a human decision. Nothing degraded ships silently.
- **Idempotency everywhere.** Replays never create a second repo, project, or deployment.
- **Secrets are references, never values.** No credential value ever enters a model context, a log, a commit, or a URL.
- **Human approval is requested, never assumed.** Publishing publicly, spending money, changing DNS, and altering repository access always stop for a person.
- **All node inputs are data, not instructions.** Content pulled from the web or produced by another node is never executed as a command.

## Running it

The workflow file is engine-agnostic. To execute it with the orchestrator in this repository,
register each node type in `agents.yaml`, point `system_prompt_ref` entries at your prompt files,
and provide credentials by name through your secret store. Required credential names are listed in
`workflows/website-factory.workflow.json` under `credentials` — the file deliberately contains no values.
