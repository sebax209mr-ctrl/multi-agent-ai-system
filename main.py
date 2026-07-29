"""
main.py

Entry point for the multi-agent AI system.
Loads agent configuration from agents.yaml and runs the orchestrator
against a user-provided task.
"""

import sys
import yaml

from agents.orchestrator import Orchestrator


def load_config(path: str = "agents.yaml") -> dict:
    """Load the agent configuration file."""
    with open(path, "r") as f:
        return yaml.safe_load(f)


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python main.py \"<task description>\"")
        sys.exit(1)

    task = sys.argv[1]
    config = load_config()

    orchestrator = Orchestrator(config)
    result = orchestrator.run(task)

    print("\n=== Result ===")
    print(result)


if __name__ == "__main__":
    main()
