"""
resume_reader.py

Parses resume files into structured candidate records for the rest of the
pipeline.

Deliberately dependency-light: it reads plain text or markdown files from
options.path and pulls out the fields with regexes. Swap in a real parser (or
an LLM extraction call via agents.llm) later without changing the output shape.

Privacy: real resumes are personal data. Keep only synthetic fixtures in git -
data/resumes/ is gitignored apart from the samples committed for tests.
"""

import os
import re
from typing import Any, Dict, List, Optional

from agents.base_agent import AgentResult, BaseAgent, Blackboard

DEFAULT_PATH = "data/resumes"
TEXT_SUFFIXES = (".txt", ".md")

APPLICANT_ID_RE = re.compile(r"applicant[_ ]?id\s*[:=]\s*([A-Za-z0-9-]+)", re.I)
NAME_RE = re.compile(r"name\s*[:=]\s*(.+)", re.I)
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
CRN_RE = re.compile(r"crn\s*[:=]?\s*([A-Za-z0-9-]{4,})", re.I)


def _first(pattern: re.Pattern, text: str) -> str:
    match = pattern.search(text)
    if not match:
        return ""
    return (match.group(1) if match.groups() else match.group(0)).strip()


def parse_resume(text: str, source: str) -> Dict[str, Any]:
    """Extract a candidate record from one resume's text."""
    return {
        "applicant_id": _first(APPLICANT_ID_RE, text),
        "name": _first(NAME_RE, text),
        "email": _first(EMAIL_RE, text),
        "crn": _first(CRN_RE, text),
        "source": source,
    }


class ResumeReaderAgent(BaseAgent):
    """Turns a directory of resumes into structured candidate records."""

    def run(self, task: str, board: Optional[Blackboard] = None) -> AgentResult:
        path = self.options.get("path", DEFAULT_PATH)

        if not os.path.isdir(path):
            return AgentResult(
                agent=self.name,
                status="failed",
                errors=[f"resume directory not found: {path}"],
            )

        candidates: List[Dict[str, Any]] = []
        for filename in sorted(os.listdir(path)):
            if not filename.lower().endswith(TEXT_SUFFIXES):
                continue
            full_path = os.path.join(path, filename)
            with open(full_path, encoding="utf-8") as handle:
                candidates.append(parse_resume(handle.read(), filename))

        if not candidates:
            return AgentResult(
                agent=self.name,
                status="degraded",
                payload={"candidates": [], "count": 0},
                errors=[f"no .txt or .md resumes found in {path}"],
            )

        incomplete = [c["source"] for c in candidates if not c["applicant_id"]]

        return AgentResult(
            agent=self.name,
            status="degraded" if incomplete else "ok",
            payload={"candidates": candidates, "count": len(candidates)},
            errors=(
                [f"resumes without an applicant_id: {', '.join(incomplete)}"]
                if incomplete
                else []
            ),
        )
