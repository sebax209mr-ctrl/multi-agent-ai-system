# multi-agent-ai-system

A reference implementation / starter template for building a **multi-agent AI system**, where an orchestrator agent coordinates a set of specialized worker agents to complete tasks.

This repo is intended to be shared and extended by a team, so it includes configuration, starter code, and documentation to get everyone on the same page quickly.

## Repository Structure

```
.
├── agents.yaml              # Declarative config for agent roles and capabilities
├── requirements.txt         # Python dependencies
├── main.py                  # Entry point that wires agents together
├── agents/
│   ├── __init__.py
│   ├── base_agent.py        # Shared base class for all agents
│   └── orchestrator.py      # Orchestrator agent that delegates to workers
└── docs/
    └── ARCHITECTURE.md       # System design and agent communication overview
```

## Getting Started

**Step 1 - Clone the repository:**
```bash
git clone https://github.com/sebax209mr-ctrl/multi-agent-ai-system.git
cd multi-agent-ai-system
```

**Step 2 - Create a virtual environment and install dependencies:**
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

**Step 3 - Configure your agents in `agents.yaml`.**

**Step 4 - Run the entry point:**
```bash
python main.py
```

## Configuring Agents

Agent roles, models, and responsibilities are defined declaratively in `agents.yaml`. Edit this file to add new agents or change how existing agents behave, without touching the core orchestration code.

## Documentation

See `docs/ARCHITECTURE.md` for details on how the orchestrator and worker agents communicate, and how to extend the system with new agent types.

## Contributing

This project is shared with collaborators. Please open a pull request with a clear description of your changes, and keep agent configuration changes and code changes in separate commits where possible.

## License

This project is licensed under the MIT License, see the `LICENSE` file for details.


## Website Generation & Deployment Factory (node-based architecture)

A concrete six-node pipeline built on top of this orchestrator pattern. It takes a seed topic and
produces a deployed website, a GitHub repository, and a full decision trail. Each agent is defined
as a standalone **Node** with an explicit input contract, internal logic, output contract, tools,
and failure handling, so the whole system can be exported to a visual workflow engine.

`seed -> idea.brief -> product.spec -> design.system -> code.bundle -> deployment.record -> run.report`

| # | Node | Emits | Spec |
|---|------|-------|------|
| 1 | Idea Generator | `idea.brief` | [docs/website-factory/nodes/01-idea-generator.md](docs/website-factory/nodes/01-idea-generator.md) |
| 2 | Product Manager | `product.spec` | [docs/website-factory/nodes/02-product-manager.md](docs/website-factory/nodes/02-product-manager.md) |
| 3 | UI/UX Designer | `design.system` | [docs/website-factory/nodes/03-uiux-designer.md](docs/website-factory/nodes/03-uiux-designer.md) |
| 4 | Software Engineer | `code.bundle` | [docs/website-factory/nodes/04-software-engineer.md](docs/website-factory/nodes/04-software-engineer.md) |
| 5 | IT & Deployment | `deployment.record` | [docs/website-factory/nodes/05-it-deployment.md](docs/website-factory/nodes/05-it-deployment.md) |
| 6 | Lead Manager (Orchestrator) | `run.report` | [docs/website-factory/nodes/06-lead-manager-orchestrator.md](docs/website-factory/nodes/06-lead-manager-orchestrator.md) |

- Start here: [docs/website-factory/README.md](docs/website-factory/README.md)
- System design: [docs/website-factory/ARCHITECTURE.md](docs/website-factory/ARCHITECTURE.md)
- Importable workflow graph: [workflows/website-factory.workflow.json](workflows/website-factory.workflow.json)

The workflow file lists required credential **names** only. No secret values are stored in this
repository, and the deployment node is designed so credential values never enter an agent context.


## The generated site

The factory above is executable, not a diagram. `python -m website_factory.run`
walks the six nodes, grades every hand-off, and writes a static site and a run
report. Nothing in the output is hand-written, which is the point: the site is a
function of the spec, so reviewing the spec is reviewing the site.

| What | Where |
| --- | --- |
| pipeline, node by node | `website_factory/` |
| the multi-page composition and gate G4b | `website_factory/site.py` |
| tests for both | `tests/test_website_factory.py`, `tests/test_site.py` |
| deploy to Pages | `.github/workflows/pages.yml` |
| drift guard on every pull request | `.github/workflows/site-check.yml` |
| what to type, what failures mean | `docs/website-factory/RUNBOOK.md` |
| how the strands in this repo fit together | `docs/PROJECT_MAP.md` |

```bash
python -m website_factory.run            # six nodes, gates G1 to G5
python -m website_factory.site --check   # grade the site, write nothing
python -m website_factory.site --out dist
python -m http.server --directory dist 8000
```

There is nothing to install for the build: standard library only, no bundler, no
framework, no JavaScript in the output.

The site is published by GitHub Actions from `main`, never from a laptop.
Every pull request builds it twice and diffs the two builds, scans the output for
credential-shaped strings, and uploads it as the `site-preview` artifact, so a
change can be opened and read before it is public.

One step stays manual: enabling Pages, in Settings then Pages, with the source set
to GitHub Actions. Publishing makes the site public, so a person decides it.
