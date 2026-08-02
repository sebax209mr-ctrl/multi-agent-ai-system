"""
orchestrator.py

The Orchestrator takes a high level task, works out what order the configured
agents need to run in (from their depends_on edges), and passes their structured
results between them through a shared Blackboard.

This stays intentionally framework-agnostic - swap in LangChain, CrewAI, AutoGen
or a custom loop inside the individual agents without touching this file.
"""

from typing import Any, Dict, List

from agents.base_agent import AgentResult, BaseAgent, Blackboard, Message
from agents.registry import build_agent
from agents.worker import WorkerAgent

# WorkerAgent used to live in this module; re-exported so existing imports work.
__all__ = ["Orchestrator", "WorkerAgent"]


class Orchestrator:
    """Coordinates a set of worker agents to complete a task."""

    def __init__(self, config: Dict[str, Any]):
        self.config = config

        self.agent_configs: List[Dict[str, Any]] = [
            cfg for cfg in config.get("agents", []) if cfg.get("enabled", True)
        ]
        self.agents: List[BaseAgent] = [build_agent(cfg) for cfg in self.agent_configs]
        self.by_name: Dict[str, BaseAgent] = {a.name: a for a in self.agents}
        self.depends_on: Dict[str, List[str]] = {
            cfg["name"]: list(cfg.get("depends_on") or []) for cfg in self.agent_configs
        }

        orchestrator_cfg = config.get("orchestrator") or {}
        self.max_iterations = orchestrator_cfg.get("max_iterations", 10)

        self.board = Blackboard()

    def order(self) -> List[str]:
        """
        Topologically sort the agents by their depends_on edges.

        Dependencies on agents that are disabled or absent are ignored; a real
        cycle raises so the run fails at startup instead of halfway through.
        """
        pending = {
            name: {d for d in deps if d in self.by_name}
            for name, deps in self.depends_on.items()
        }
        resolved: List[str] = []

        while pending:
            ready = sorted(
                name for name, deps in pending.items() if deps.issubset(resolved)
            )
            if not ready:
                raise ValueError(
                    "dependency cycle in agents.yaml between: "
                    + ", ".join(sorted(pending))
                )
            for name in ready:
                resolved.append(name)
                del pending[name]

        return resolved

    def run_pipeline(self, task: str) -> List[AgentResult]:
        """Run every enabled agent in dependency order, sharing one Blackboard."""
        message = Message(sender="orchestrator", content=task)
        results: List[AgentResult] = []

        for name in self.order():
            agent = self.by_name[name]
            agent.receive(message)
            try:
                result = agent.run(task, self.board)
            except Exception as exc:  # noqa: BLE001 - one bad agent must not kill the run
                result = AgentResult(agent=name, status="failed", errors=[repr(exc)])
            self.board.put(name, result)
            results.append(result)

        return results

    def run(self, task: str) -> str:
        """Delegate the task to each worker agent and aggregate results."""
        return "\n".join(str(result) for result in self.run_pipeline(task))
