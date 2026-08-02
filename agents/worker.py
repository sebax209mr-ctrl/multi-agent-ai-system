"""
worker.py

Generic, config-driven worker agent. This is the fallback used for any
agents.yaml entry whose `type` is not present in the registry.
"""

from typing import Optional

from agents.base_agent import AgentResult, BaseAgent, Blackboard


class WorkerAgent(BaseAgent):
    """Generic worker agent driven purely by its configured role."""

    def run(self, task: str, board: Optional[Blackboard] = None) -> AgentResult:
        # Placeholder logic - replace with a real call to your LLM/agent
        # framework of choice using self.model and self.tools.
        upstream = sorted(board.keys()) if board else []
        return AgentResult(
            agent=self.name,
            status="ok",
            payload={
                "note": "placeholder - no LLM call wired up yet",
                "task": task,
                "role": self.role,
                "model": self.model,
                "saw_upstream": upstream,
            },
        )
