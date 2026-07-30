"""
crn_checker.py

Validates the CRN on each candidate record produced by resume_reader.

Deterministic first: a regex/format check settles the clear cases cheaply and
reproducibly. Only genuinely ambiguous records are escalated, and only if an
LLM is configured - asking a model to validate an identifier it cannot look up
is both expensive and unauditable.

Privacy: CRNs are sensitive. They are masked in every payload and error string.
"""

import re
from typing import Any, Dict, List, Optional

from agents.base_agent import AgentResult, BaseAgent, Blackboard

# Format is a placeholder until the team confirms the real one - see the open
# questions in docs/AGENT_WIRING.md.
DEFAULT_PATTERN = r"^CRN-[0-9]{6}$"


def mask(crn: str) -> str:
    """Show only the last 4 characters of a CRN."""
    if not crn:
        return ""
    if len(crn) <= 4:
        return "*" * len(crn)
    return "*" * (len(crn) - 4) + crn[-4:]


class CrnCheckerAgent(BaseAgent):
    """Checks each candidate's CRN and emits a verdict per candidate."""

    def run(self, task: str, board: Optional[Blackboard] = None) -> AgentResult:
        upstream = self.options.get("source", "resume_reader")
        board = board if board is not None else Blackboard()

        result = board.get(upstream)
        if result is None or not getattr(result, "payload", None):
            return AgentResult(
                agent=self.name,
                status="skipped",
                payload={"verdicts": [], "count": 0},
                errors=[f"no candidate records from {upstream!r}"],
            )

        pattern = re.compile(self.options.get("pattern", DEFAULT_PATTERN))
        verdicts: List[Dict[str, Any]] = []

        for candidate in result.payload.get("candidates", []):
            crn = (candidate.get("crn") or "").strip()

            if not crn:
                verdict, reason = "missing", "no CRN found on the resume"
            elif pattern.match(crn):
                verdict, reason = "valid", "matches the expected format"
            else:
                verdict, reason = "needs_review", "does not match the expected format"

            verdicts.append(
                {
                    "applicant_id": candidate.get("applicant_id", ""),
                    "name": candidate.get("name", ""),
                    "crn_masked": mask(crn),
                    "verdict": verdict,
                    "reason": reason,
                }
            )

        flagged = [v for v in verdicts if v["verdict"] != "valid"]

        return AgentResult(
            agent=self.name,
            status="needs_human" if flagged else "ok",
            payload={
                "verdicts": verdicts,
                "count": len(verdicts),
                "flagged": len(flagged),
            },
            errors=[
                f"{v['name'] or v['applicant_id']}: {v['reason']}" for v in flagged
            ],
        )
