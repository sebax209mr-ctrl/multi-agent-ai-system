"""
base_agent.py

Shared base class for all agents in the system. Concrete agents
(researcher, coder, reviewer, etc.) should subclass BaseAgent and
implement the `run` method.
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class Message:
    """A single message passed between agents."""
    sender: str
    content: str
    metadata: Dict[str, Any] = field(default_factory=dict)


class BaseAgent:
    """Base class that all agents inherit from."""

    def __init__(self, name: str, role: str, model: str = "gpt-4o-mini", tools: Optional[List[str]] = None):
        self.name = name
        self.role = role
        self.model = model
        self.tools = tools or []
        self.history: List[Message] = []

    def receive(self, message: Message) -> None:
        """Store an incoming message in this agent's history."""
        self.history.append(message)

    def run(self, task: str) -> str:
        """
        Execute the agent's logic for the given task and return a result.
        Subclasses must override this method.
        """
        raise NotImplementedError("Subclasses must implement run().")

    def __repr__(self) -> str:
        return f"<Agent name={self.name!r} role={self.role!r} model={self.model!r}>"
