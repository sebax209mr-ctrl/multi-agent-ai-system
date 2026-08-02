"""
schedule_reader.py

Reads applicant availability data and returns it in a structured form for other
agents (matching, suggestion, planning) to consume.

The CSV path comes from options.path in agents.yaml, so the orchestrator no
longer has to smuggle a file path in through the task string.
"""

import csv
import os
from typing import Any, Dict, List, Optional

from agents.base_agent import AgentResult, BaseAgent, Blackboard

DEFAULT_PATH = "data/applicants.csv"


class ScheduleReaderAgent(BaseAgent):
    """Loads applicant availability from a CSV into structured records."""

    def run(self, task: str, board: Optional[Blackboard] = None) -> AgentResult:
        path = self.options.get("path", DEFAULT_PATH)

        if not os.path.exists(path):
            return AgentResult(
                agent=self.name,
                status="failed",
                errors=[f"schedule file not found: {path}"],
            )

        applicants: List[Dict[str, Any]] = []
        with open(path, newline="", encoding="utf-8") as handle:
            for row in csv.DictReader(handle):
                applicants.append(
                    {
                        "applicant_id": (row.get("applicant_id") or "").strip(),
                        "name": (row.get("name") or "").strip(),
                        "available_day": (row.get("available_day") or "").strip(),
                    }
                )

        # A missing applicant_id is not fatal, but downstream agents would have
        # to join on name, which silently mismatches people. Flag it instead.
        unidentified = [a["name"] for a in applicants if not a["applicant_id"]]
        errors = (
            [f"rows without applicant_id: {', '.join(unidentified)}"]
            if unidentified
            else []
        )

        return AgentResult(
            agent=self.name,
            status="degraded" if unidentified else "ok",
            payload={"availability": applicants, "count": len(applicants)},
            errors=errors,
        )
