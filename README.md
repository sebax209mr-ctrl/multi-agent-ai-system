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
