"""
suggestion_agent.py

Joins CRN verdicts to availability and recommends who to schedule.

The join is deterministic and happens on applicant_id, never on name - two
people with similar names would otherwise be silently merged. The optional
LLM pass only writes the human-readable rationale; it never decides
eligibility, so the recommendation stays reproducible without an API key.
"""

from typing import Any, Dict, List, Optional

from agents.base_agent import AgentResult, BaseAgent, Blackboard
from agents.llm import LLMUnavailable, complete

SYSTEM_PROMPT = (
    "You are a scheduling assistant. Given candidate eligibility and "
    "availability, write one short sentence per candidate explaining the "
    "recommendation. Do not invent facts."
)


class SuggestionAgent(BaseAgent):
    """Recommends candidates by combining CRN verdicts with availability."""

    def _payload(self, board: Blackboard, key: str, default_key: str) -> Dict[str, Any]:
        result = board.get(self.options.get(key, default_key))
        return getattr(result, "payload", None) or {}

    def run(self, task: str, board: Optional[Blackboard] = None) -> AgentResult:
        board = board if board is not None else Blackboard()

        verdicts = self._payload(board, "crn_source", "crn_checker").get("verdicts", [])
        availability = self._payload(board, "schedule_source", "schedule_reader").get(
            "availability", []
        )

        if not verdicts and not availability:
            return AgentResult(
                agent=self.name,
                status="skipped",
                payload={"suggestions": [], "count": 0},
                errors=["no upstream verdicts or availability to work from"],
            )

        by_id = {row["applicant_id"]: row for row in availability if row.get("applicant_id")}
        suggestions: List[Dict[str, Any]] = []
        unmatched: List[str] = []

        for verdict in verdicts:
            applicant_id = verdict.get("applicant_id", "")
            slot = by_id.get(applicant_id)

            if slot is None:
                unmatched.append(applicant_id or verdict.get("name", "unknown"))

            eligible = verdict.get("verdict") == "valid"
            suggestions.append(
                {
                    "applicant_id": applicant_id,
                    "name": verdict.get("name", ""),
                    "available_day": (slot or {}).get("available_day", ""),
                    "recommend": bool(eligible and slot),
                    "blocked_by": (
                        ""
                        if eligible and slot
                        else (verdict.get("reason") if not eligible else "no availability")
                    ),
                }
            )

        rationale = self._explain(suggestions)

        return AgentResult(
            agent=self.name,
            status="degraded" if unmatched else "ok",
            payload={
                "suggestions": suggestions,
                "count": len(suggestions),
                "recommended": sum(1 for s in suggestions if s["recommend"]),
                "rationale": rationale,
            },
            errors=(
                [f"no availability row for: {', '.join(unmatched)}"] if unmatched else []
            ),
        )

    def _explain(self, suggestions: List[Dict[str, Any]]) -> str:
        """Ask the model for a rationale, but never fail the run over it."""
        if not self.options.get("explain", False) or not suggestions:
            return ""

        try:
            return complete(
                system=SYSTEM_PROMPT,
                user=str(suggestions),
                model=self.model,
                max_message_length=self.options.get("max_message_length"),
            )
        except LLMUnavailable:
            return ""
        except Exception:  # noqa: BLE001 - a missing rationale must not fail the run
            return ""
