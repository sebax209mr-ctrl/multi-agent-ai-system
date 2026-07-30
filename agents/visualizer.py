"""
visualizer.py

Renders the schedule as an artifact for humans to look at.

Image generation is slow and costs real money, so this agent is disabled by
default in agents.yaml (enabled: false) and must be opted into. It writes
artifact descriptors - paths and metadata - to the blackboard rather than image
bytes, so a dry run or a CI run stays cheap.

Today it emits a deterministic text grid. Swap _render() for a real image model
call when the team picks one; nothing downstream needs to change.
"""

import os
from typing import Any, Dict, List, Optional

from agents.base_agent import AgentResult, BaseAgent, Blackboard

DAY_ORDER = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
]


class VisualizerAgent(BaseAgent):
    """Turns the suggested schedule into a renderable artifact."""

    def run(self, task: str, board: Optional[Blackboard] = None) -> AgentResult:
        board = board if board is not None else Blackboard()
        source = self.options.get("source", "suggestion_agent")

        upstream = board.get(source)
        suggestions = (getattr(upstream, "payload", None) or {}).get("suggestions", [])

        if not suggestions:
            return AgentResult(
                agent=self.name,
                status="skipped",
                payload={"artifacts": []},
                errors=[f"nothing to render from {source!r}"],
            )

        grid = self._render(suggestions)
        out_dir = self.options.get("output_dir", "runs")
        artifacts: List[Dict[str, Any]] = [
            {
                "kind": "text",
                "path": os.path.join(out_dir, "schedule.txt"),
                "written": False,
                "preview": grid,
            }
        ]

        if self.options.get("write", False):
            os.makedirs(out_dir, exist_ok=True)
            with open(artifacts[0]["path"], "w", encoding="utf-8") as handle:
                handle.write(grid)
            artifacts[0]["written"] = True

        return AgentResult(
            agent=self.name,
            status="ok",
            payload={"artifacts": artifacts, "count": len(artifacts)},
        )

    @staticmethod
    def _render(suggestions: List[Dict[str, Any]]) -> str:
        by_day: Dict[str, List[str]] = {}
        for item in suggestions:
            if not item.get("recommend"):
                continue
            day = item.get("available_day") or "Unscheduled"
            by_day.setdefault(day, []).append(item.get("name") or item.get("applicant_id", "?"))

        days = [d for d in DAY_ORDER if d in by_day] + [
            d for d in sorted(by_day) if d not in DAY_ORDER
        ]
        lines = [f"{day:<12} {', '.join(sorted(by_day[day]))}" for day in days]
        return "\n".join(lines) or "no one recommended"
