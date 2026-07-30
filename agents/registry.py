"""
registry.py

Maps the `type` field of each entry in agents.yaml to an agent class.

This is what lets a real implementation (for example ScheduleReaderAgent) be
used instead of the generic WorkerAgent, without the orchestrator needing to
know any concrete class names. To add a new agent type, implement it and add
one line here - or call register() at import time from your own module.
"""

from typing import Any, Dict, Type

from agents.base_agent import BaseAgent
from agents.schedule_reader import ScheduleReaderAgent
from agents.worker import WorkerAgent

AGENT_TYPES: Dict[str, Type[BaseAgent]] = {
    "worker": WorkerAgent,
    "schedule_reader": ScheduleReaderAgent,
}


def register(type_name: str, cls: Type[BaseAgent]) -> None:
    """Register an agent class under a type name used in agents.yaml."""
    AGENT_TYPES[type_name] = cls


def build_agent(cfg: Dict[str, Any]) -> BaseAgent:
    """
    Build a single agent from its agents.yaml entry.

    The type is taken from the `type` key, falling back to `name` so existing
    config keeps working, and finally to the generic WorkerAgent.
    """
    agent_type = cfg.get("type") or cfg.get("name")
    cls = AGENT_TYPES.get(agent_type, WorkerAgent)
    return cls(
        name=cfg["name"],
        role=cfg.get("role", ""),
        model=cfg.get("model", "gpt-4o-mini"),
        tools=cfg.get("tools", []),
        options=cfg.get("options", {}),
    )
