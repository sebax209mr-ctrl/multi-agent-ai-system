"""Node 6 (lead manager / orchestrator) and the command line entry point.

The delivery lead does none of the work and owns all of it: state, routing,
budget, the event log, and the only permission in the system to talk to a human.

How this differs from the architecture document, deliberately and visibly:

  * Every node here is a pure function, so a rework produces byte-identical
    output. Retrying a deterministic node is theatre. The orchestrator therefore
    enters each gate already at the attempt cap, which routes a failure straight
    to human_approval instead of burning two pointless attempts. Swap a node for
    a real model call and the rework budget becomes meaningful again with no
    change here.
  * Budget tracking is present and always zero, because no node calls a paid
    API. The cap is still enforced so the seam exists before it is needed.

What it writes:

    <runs_dir>/<run_id>/events.jsonl   append-only, one envelope per line
    <runs_dir>/<run_id>/run-report.json
    <out_dir>/...                      the publishable site

Usage:
    python -m website_factory.run --out dist
    python -m website_factory.run --out dist --base-url https://example.com/
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from website_factory import content, design, publish, render
from website_factory.envelope import (
    HUMAN_ROUTE,
    MAX_REWORKS,
    STATUS_NEEDS_HUMAN,
    Envelope,
    apply_route,
    stable_hash,
    utc_now,
)

DEFAULT_BASE_URL = "https://sebax209mr-ctrl.github.io/multi-agent-ai-system/"
DEFAULT_OUT_DIR = "dist"
DEFAULT_RUNS_DIR = "runs"

BUDGET_USD_CAP = 12.00
WALL_CLOCK_CAP_MIN = 45

# Rerunning a pure function cannot change its output, so every gate is entered
# at the cap. See the module docstring.
DETERMINISTIC_ATTEMPT = MAX_REWORKS

# id, type, emits, happy path
TOPOLOGY: Tuple[Tuple[str, str, str, Optional[str]], ...] = (
    ("idea_generator", "agent.ideation", "idea.brief", "product_manager"),
    ("product_manager", "agent.product", "product.spec", "uiux_designer"),
    ("uiux_designer", "agent.design", "design.system", "software_engineer"),
    ("software_engineer", "agent.engineering", "code.bundle", "it_deployment"),
    ("it_deployment", "agent.devops", "deployment.record", "lead_manager"),
)

STATE_SEQUENCE = (
    "INIT",
    "IDEATION",
    "PRODUCT_DEF",
    "DESIGN",
    "BUILD",
    "DEPLOY",
    "VERIFY",
    "DONE",
)


class NeedsHuman(RuntimeError):
    """A gate failed terminally. Carries the approval request for the caller."""

    def __init__(self, request: Dict[str, Any]) -> None:
        super().__init__(request["summary"])
        self.request = request


def default_run_id(base_url: str, today: Optional[str] = None) -> str:
    """Stable for a given day and configuration, so replays land in one folder."""
    stamp = today or datetime.now(timezone.utc).strftime("%Y%m%d")
    digest = stable_hash({"base_url": base_url, "seed": content.SEED})
    return "run_%s_%s" % (stamp, digest[7:13])


class Run:
    """One execution of the factory. Owns state; nodes own work."""

    def __init__(
        self,
        out_dir: str = DEFAULT_OUT_DIR,
        base_url: str = DEFAULT_BASE_URL,
        runs_dir: Optional[str] = DEFAULT_RUNS_DIR,
        run_id: Optional[str] = None,
    ) -> None:
        self.out_dir = out_dir
        self.base_url = base_url
        self.runs_dir = runs_dir
        self.run_id = run_id or default_run_id(base_url)
        self.state = "INIT"
        self.events: List[Dict[str, Any]] = []
        self.envelopes: List[Envelope] = []
        self.completed: List[str] = []
        self.started_at = utc_now()
        self.budget = {
            "usd_spent": 0.0,
            "usd_cap": BUDGET_USD_CAP,
            "wall_clock_cap_min": WALL_CLOCK_CAP_MIN,
        }
        self.approval_request: Optional[Dict[str, Any]] = None

    # -- event log ---------------------------------------------------------

    def transition(self, state: str) -> None:
        self.state = state
        self.events.append(
            {"type": "state.transition", "state": state, "at": utc_now()}
        )

    def emit(self, envelope: Envelope) -> Envelope:
        self.envelopes.append(envelope)
        self.completed.append(envelope.node_id)
        self.events.append({"type": "envelope", "envelope": envelope.to_dict()})
        return envelope

    # -- gating ------------------------------------------------------------

    def gate(self, envelope: Envelope, happy_path: Optional[str]) -> Envelope:
        """Apply the routing table, then stop the run if a human is needed."""
        apply_route(envelope, happy_path)
        self.emit(envelope)
        if envelope.next_route == HUMAN_ROUTE:
            request = self.approval(envelope)
            self.events.append({"type": "approval.request", "request": request})
            self.approval_request = request
            raise NeedsHuman(request)
        return envelope

    def approval(self, envelope: Envelope) -> Dict[str, Any]:
        """The orchestrator is the only node allowed to ask a human anything."""
        return {
            "type": "approval.request",
            "run_id": self.run_id,
            "blocking_node": envelope.node_id,
            "reason": "gate_failed",
            "error_class": "E2xx",
            "summary": "%s failed its gate: score %.4f against threshold %.2f"
            % (
                envelope.node_id,
                envelope.quality.score,
                envelope.quality.threshold,
            ),
            "violations": list(envelope.quality.violations),
            "options": [
                {"id": "fix_source", "label": "Fix the source and re-run"},
                {"id": "lower_threshold", "label": "Change the gate deliberately"},
                {"id": "abort", "label": "Abort and keep artifacts"},
            ],
            "on_timeout": "park_run",
        }

    def envelope(
        self,
        node_id: str,
        node_type: str,
        emits: str,
        payload: Dict[str, Any],
        quality: Any,
        parent: Optional[str],
    ) -> Envelope:
        return Envelope(
            run_id=self.run_id,
            node_id=node_id,
            node_type=node_type,
            emits=emits,
            payload=payload,
            quality=quality,
            parent_node=parent,
            attempt=DETERMINISTIC_ATTEMPT,
            model=None,
        )

    # -- the pipeline ------------------------------------------------------

    def execute(self) -> Dict[str, Any]:
        try:
            return self._execute()
        except NeedsHuman:
            report = self.report(status=STATUS_NEEDS_HUMAN)
            self.persist(report)
            return report

    def _execute(self) -> Dict[str, Any]:
        # Node 1
        self.transition("IDEATION")
        brief = content.idea_brief()
        self.gate(
            self.envelope(
                "idea_generator",
                "agent.ideation",
                "idea.brief",
                brief,
                content.grade_idea(brief),
                None,
            ),
            "product_manager",
        )

        # Node 2
        self.transition("PRODUCT_DEF")
        spec = content.product_spec(brief)
        self.gate(
            self.envelope(
                "product_manager",
                "agent.product",
                "product.spec",
                spec,
                content.grade_product(spec, brief),
                "idea_generator",
            ),
            "uiux_designer",
        )

        # Node 3
        self.transition("DESIGN")
        system = design.design_system(spec)
        self.gate(
            self.envelope(
                "uiux_designer",
                "agent.design",
                "design.system",
                system,
                design.grade_design(system, spec),
                "product_manager",
            ),
            "software_engineer",
        )

        # Node 4. The payload carries file names; the bytes live in artifacts,
        # so the event log stays readable and nothing is duplicated.
        self.transition("BUILD")
        bundle = render.render_bundle(spec, system, self.base_url)
        summary = {key: value for key, value in bundle.items() if key != "files"}
        summary["files"] = sorted(bundle["files"])
        build = self.envelope(
            "software_engineer",
            "agent.engineering",
            "code.bundle",
            summary,
            render.grade_bundle(bundle, spec),
            "uiux_designer",
        )
        for path in sorted(bundle["files"]):
            build.add_artifact("file", path, bundle["files"][path])
        self.gate(build, "it_deployment")

        # Node 5
        self.transition("DEPLOY")
        written = publish.write_bundle(bundle, self.out_dir)
        self.transition("VERIFY")
        record = publish.deployment_record(bundle, self.out_dir, written)
        self.gate(
            self.envelope(
                "it_deployment",
                "agent.devops",
                "deployment.record",
                record,
                publish.grade_deployment(record),
                "software_engineer",
            ),
            "lead_manager",
        )

        self.transition("DONE")
        report = self.report(status="ok")
        self.persist(report)
        return report

    # -- reporting ---------------------------------------------------------

    def report(self, status: str) -> Dict[str, Any]:
        gates = [
            {
                "node": envelope.node_id,
                "score": envelope.quality.score,
                "threshold": envelope.quality.threshold,
                "passed": envelope.quality.passed,
                "violations": list(envelope.quality.violations),
            }
            for envelope in self.envelopes
        ]
        deployment = next(
            (
                envelope.payload
                for envelope in self.envelopes
                if envelope.node_id == "it_deployment"
            ),
            None,
        )
        return {
            "emits": "run.report",
            "run_id": self.run_id,
            "status": status,
            "state": self.state,
            "started_at": self.started_at,
            "finished_at": utc_now(),
            "seed": content.SEED,
            "base_url": self.base_url,
            "output_dir": self.out_dir,
            "completed": list(self.completed),
            "gates": gates,
            "budget": dict(self.budget),
            "human_interventions": 0 if self.approval_request is None else 1,
            "approval_request": self.approval_request,
            "live_url": self.base_url if status == "ok" else None,
            "deployment": deployment,
            "event_count": len(self.events),
        }

    def persist(self, report: Dict[str, Any]) -> Optional[str]:
        """Append-only event log plus the final report. Replay reads this."""
        if not self.runs_dir:
            return None
        folder = Path(self.runs_dir) / self.run_id
        folder.mkdir(parents=True, exist_ok=True)
        log = folder / "events.jsonl"
        with log.open("w", encoding="utf-8") as handle:
            for event in self.events:
                handle.write(json.dumps(event, sort_keys=True))
                handle.write("\n")
        (folder / "run-report.json").write_text(
            json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        return str(log)


def build_site(
    out_dir: str = DEFAULT_OUT_DIR,
    base_url: str = DEFAULT_BASE_URL,
    runs_dir: Optional[str] = DEFAULT_RUNS_DIR,
    run_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Convenience wrapper: execute a whole run and return the run.report."""
    return Run(
        out_dir=out_dir, base_url=base_url, runs_dir=runs_dir, run_id=run_id
    ).execute()


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="website_factory.run",
        description="Run the six-node website factory and write a static site.",
    )
    parser.add_argument(
        "--out", default=DEFAULT_OUT_DIR, help="output directory for the site"
    )
    parser.add_argument(
        "--base-url",
        default=DEFAULT_BASE_URL,
        help="public base URL, used for canonical links and the sitemap",
    )
    parser.add_argument(
        "--runs-dir",
        default=DEFAULT_RUNS_DIR,
        help="where to write the event log and run report",
    )
    parser.add_argument("--run-id", default=None, help="override the run id")
    parser.add_argument(
        "--no-log",
        action="store_true",
        help="skip the event log and run report, build the site only",
    )
    parser.add_argument(
        "--quiet", action="store_true", help="print nothing on success"
    )
    return parser


def main(argv: Optional[List[str]] = None) -> int:
    args = _parser().parse_args(argv)
    report = build_site(
        out_dir=args.out,
        base_url=args.base_url,
        runs_dir=None if args.no_log else args.runs_dir,
        run_id=args.run_id,
    )

    if report["status"] != "ok":
        request = report["approval_request"] or {}
        sys.stderr.write("Run %s needs a human decision.\n" % report["run_id"])
        sys.stderr.write("  %s\n" % request.get("summary", "gate failed"))
        for violation in request.get("violations", []):
            sys.stderr.write("  - %s\n" % violation)
        return 2

    if not args.quiet:
        print("run %s complete" % report["run_id"])
        for gate in report["gates"]:
            print(
                "  %-18s %.4f / %.2f  %s"
                % (
                    gate["node"],
                    gate["score"],
                    gate["threshold"],
                    "pass" if gate["passed"] else "FAIL",
                )
            )
        print("  site written to %s" % report["output_dir"])
        print("  canonical base %s" % report["base_url"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
