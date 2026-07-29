"""
orchestrator.py

The Orchestrator is responsible for taking a high level task, breaking
it down, and delegating work to specialized worker agents defined in
agents.yaml. This is intentionally framework-agnostic starter code -
swap in your preferred agent framework (LangChain, CrewAI, AutoGen,
a custom loop, etc.) inside the methods below.
"""

from typing import Any, Dict, List

from agents.base_agent import BaseAgent, Message


class WorkerAgent(BaseAgent):
    """Generic worker agent driven purely by its configured role."""

    def run(self, task: str) -> str:
        # Placeholder logic - replace with a real call to your LLM/agent
        # framework of choice using self.model and self.tools.
        return f"[{self.name}] handled task: {task!r} using role: {self.role!r}"


class Orchestrator:
    """Coordinates a set of worker agents to complete a task."""

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.workers: List[WorkerAgent] = [
            WorkerAgent(
                name=agent_cfg["name"],
                role=agent_cfg["role"],
                model=agent_cfg.get("model", "gpt-4o-mini"),
                tools=agent_cfg.get("tools", []),
            )
            for agent_cfg in config.get("agents", [])
        ]
        self.max_iterations = config.get("orchestrator", {}).get("max_iterations", 10)

    def run(self, task: str) -> str:
        """Delegate the task to each worker agent and aggregate results."""
        results = []
        message = Message(sender="orchestrator", content=task)

        for worker in self.workers:
            worker.receive(message)
            result = worker.run(task)
            results.append(result)

        return "\n".join(results)
