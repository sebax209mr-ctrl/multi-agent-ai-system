"""Canonical envelope, quality gates and idempotency for the website factory.

Implements docs/website-factory/ARCHITECTURE.md section 4 (canonical envelope),
section 6 (conditional routing) and section 7 (quality gates).

The design rules from the architecture that this module actually enforces:

  * Contracts over conversation. Nodes exchange validated payloads, not prose.
    Anything not in the contract does not cross the wire - see require().
  * Envelope-first. Every edge in the graph carries exactly Envelope.to_dict().
  * Gate, then escalate. decide_route() reworks a node at most MAX_REWORKS
    times and then hands the decision to a human. Degraded output never ships
    silently.
  * Idempotency by construction. idempotency_key() is a hash of run id, node id
    and the node input, so a replay of the same input cannot create a second
    repository, project or deployment.

This module performs no I/O and imports nothing outside the standard library,
which is what makes a whole run replayable inside a unit test.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Tuple

ENVELOPE_VERSION = "1.0.0"

# Status vocabulary, verbatim from the architecture doc.
STATUS_OK = "ok"
STATUS_DEGRADED = "degraded"
STATUS_NEEDS_HUMAN = "needs_human"
STATUS_FAILED = "failed"
STATUS_SKIPPED = "skipped"

STATUSES = (
    STATUS_OK,
    STATUS_DEGRADED,
    STATUS_NEEDS_HUMAN,
    STATUS_FAILED,
    STATUS_SKIPPED,
)

# Section 5: REWORK (max 2 per node) before HUMAN_REVIEW.
MAX_REWORKS = 2

# Where a terminally failed gate routes to. The orchestrator is the only node
# allowed to talk to a human, so this is a route name, not a side effect.
HUMAN_ROUTE = "human_approval"


class ContractError(ValueError):
    """A payload does not satisfy a declared contract. Error class E1xx."""

    error_class = "E1xx"


class GateFailure(RuntimeError):
    """A quality gate failed after its rework budget. Error class E2xx."""

    error_class = "E2xx"


def utc_now() -> str:
    """Timestamp in the format used throughout the architecture examples."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def stable_hash(value: Any) -> str:
    """Content address for any JSON-serialisable value.

    Sorted keys and no whitespace, so the same logical value always hashes to
    the same string regardless of dict insertion order.
    """
    blob = json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)
    return "sha256:" + hashlib.sha256(blob.encode("utf-8")).hexdigest()


def idempotency_key(run_id: str, node_id: str, node_input: Any) -> str:
    """hash(run_id + node_id + attempt_of_input) from the architecture doc."""
    return stable_hash({"run_id": run_id, "node_id": node_id, "input": node_input})


def require(payload: Any, keys: Iterable[str], node_id: str) -> Dict[str, Any]:
    """Deterministic half of a gate: reject an incomplete payload immediately.

    Runs before any critic rubric because there is no point grading a payload
    that does not even have the fields the next node reads.
    """
    if not isinstance(payload, dict):
        raise ContractError(
            "%s emitted %s, expected a dict payload" % (node_id, type(payload).__name__)
        )
    empty = (None, "", [], {}, ())
    missing = [k for k in keys if k not in payload or payload[k] in empty]
    if missing:
        raise ContractError(
            "%s payload is missing required fields: %s" % (node_id, ", ".join(missing))
        )
    return payload


@dataclass
class Quality:
    """The quality block: a weighted rubric, a threshold, and hard violations.

    A violation is a deterministic failure (schema, contrast, exit code). It
    fails the gate on its own, whatever the rubric average says, because a
    critic score cannot vote a broken build into production.
    """

    threshold: float
    rubric: Dict[str, float] = field(default_factory=dict)
    weights: Dict[str, float] = field(default_factory=dict)
    violations: List[str] = field(default_factory=list)

    @property
    def score(self) -> float:
        if not self.rubric:
            return 0.0
        if self.weights:
            total = sum(self.weights.get(name, 0.0) for name in self.rubric)
            if total <= 0.0:
                return 0.0
            weighted = sum(
                value * self.weights.get(name, 0.0)
                for name, value in self.rubric.items()
            )
            return round(weighted / total, 4)
        return round(sum(self.rubric.values()) / len(self.rubric), 4)

    @property
    def passed(self) -> bool:
        return not self.violations and self.score >= self.threshold

    def to_dict(self) -> Dict[str, Any]:
        return {
            "score": self.score,
            "threshold": self.threshold,
            "rubric": dict(self.rubric),
            "violations": list(self.violations),
        }


@dataclass
class Envelope:
    """One edge in the graph. payload is the only node-specific part."""

    run_id: str
    node_id: str
    node_type: str
    emits: str
    payload: Dict[str, Any]
    quality: Quality
    version: str = "1.0.0"
    model: Optional[str] = None
    parent_node: Optional[str] = None
    attempt: int = 1
    started_at: str = field(default_factory=utc_now)
    finished_at: str = field(default_factory=utc_now)
    artifacts: List[Dict[str, Any]] = field(default_factory=list)
    errors: List[Dict[str, Any]] = field(default_factory=list)
    next_route: Optional[str] = None
    next_reason: str = "gate_passed"
    status: str = STATUS_OK

    def __post_init__(self) -> None:
        if self.status not in STATUSES:
            raise ContractError(
                "%s used status %r, which is not in the status vocabulary"
                % (self.node_id, self.status)
            )

    @property
    def idempotency_key(self) -> str:
        return idempotency_key(self.run_id, self.node_id, self.payload)

    def add_artifact(self, kind: str, path: str, text: str) -> Dict[str, Any]:
        """Record a content-addressed artifact. Text is hashed, never inlined."""
        raw = text.encode("utf-8")
        record = {
            "kind": kind,
            "path": path,
            "sha256": hashlib.sha256(raw).hexdigest(),
            "bytes": len(raw),
        }
        self.artifacts.append(record)
        return record

    def add_error(self, error_class: str, message: str) -> Dict[str, Any]:
        record = {"class": error_class, "message": message, "at": utc_now()}
        self.errors.append(record)
        return record

    def to_dict(self) -> Dict[str, Any]:
        return {
            "envelope_version": ENVELOPE_VERSION,
            "run_id": self.run_id,
            "idempotency_key": self.idempotency_key,
            "node": {
                "id": self.node_id,
                "type": self.node_type,
                "version": self.version,
                "model": self.model,
                "emits": self.emits,
            },
            "trace": {
                "parent_node": self.parent_node,
                "attempt": self.attempt,
                "started_at": self.started_at,
                "finished_at": self.finished_at,
                "tokens": {"in": 0, "out": 0},
                "cost_usd": 0.0,
            },
            "status": self.status,
            "quality": self.quality.to_dict(),
            "payload": self.payload,
            "artifacts": list(self.artifacts),
            "errors": list(self.errors),
            "next": {"route": self.next_route, "reason": self.next_reason},
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), sort_keys=True)


def decide_route(
    envelope: Envelope,
    happy_path: Optional[str],
    attempt_cap: int = MAX_REWORKS,
) -> Tuple[Optional[str], str]:
    """Section 6 routing table, written once instead of once per node.

    Returns (route, reason) and mutates nothing, so a caller can ask what would
    happen before committing to it.
    """
    if envelope.quality.passed:
        return happy_path, "gate_passed"
    if envelope.attempt < attempt_cap:
        return envelope.node_id, "rework_with_critique"
    return HUMAN_ROUTE, "gate_failed"


def apply_route(envelope: Envelope, happy_path: Optional[str]) -> Envelope:
    """Stamp the routing decision and the resulting status onto an envelope."""
    route, reason = decide_route(envelope, happy_path)
    envelope.next_route = route
    envelope.next_reason = reason
    if reason == "gate_passed":
        envelope.status = STATUS_OK
    elif reason == "rework_with_critique":
        envelope.status = STATUS_DEGRADED
    else:
        envelope.status = STATUS_NEEDS_HUMAN
        envelope.add_error(GateFailure.error_class, "gate failed after rework budget")
    return envelope
