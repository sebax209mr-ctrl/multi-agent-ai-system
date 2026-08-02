"""
base_agent.py

Shared base class for all agents in the system, plus the two structures the
orchestrator uses to move data between them:

* AgentResult - the typed envelope every agent returns
* Blackboard  - shared run memory, i.e. communication.shared_memory in agents.yaml

Concrete agents subclass BaseAgent and implement run().
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class Message:
    """A single message passed between agents."""
    sender: str
    content: str
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class AgentResult:
    """
    Structured result returned by every agent.

    status is one of: ok | degraded | needs_human | failed | skipped
    """
    agent: str
    status: str = "ok"
    payload: Any = None
    errors: List[str] = field(default_factory=list)

    def __str__(self) -> str:
        return f"[{self.agent}] status={self.status} payload={self.payload!r}"


class Blackboard(dict):
    """
    Shared memory for a single run.

    Every agent reads the structured output of its upstream dependencies from
    here and writes its own AgentResult back, keyed by agent name. This is what
    makes communication.shared_memory in agents.yaml mean something.
    """

    def put(self, key: str, value: Any) -> None:
        self[key] = value

    def require(self, key: str) -> Any:
        if key not in self:
            raise KeyError(f"missing upstream output: {key!r}")
        return self[key]


class BaseAgent:
    """Base class that all agents inherit from."""

    def __init__(
        self,
        name: str,
        role: str,
        model: str = "gpt-4o-mini",
        tools: Optional[List[str]] = None,
        options: Optional[Dict[str, Any]] = None,
    ):
        self.name = name
        self.role = role
        self.model = model
        self.tools = tools or []
        self.options: Dict[str, Any] = options or {}
        self.history: List[Message] = []

    def receive(self, message: Message) -> None:
        """Store an incoming message in this agent's history."""
        self.history.append(message)

    def run(self, task: str, board: Optional[Blackboard] = None) -> AgentResult:
        """
        Execute the agent's logic for the given task and return an AgentResult.
        Subclasses must override this method.
        """
        raise NotImplementedError("Subclasses must implement run().")

    def __repr__(self) -> str:
        return f"<Agent name={self.name!r} role={self.role!r} model={self.model!r}>"
