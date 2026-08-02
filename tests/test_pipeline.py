"""
Tests for agent construction, dependency ordering and the schedule reader.

These are deliberately cheap: no network, no LLM calls.
"""

import yaml

from agents.base_agent import Blackboard
from agents.orchestrator import Orchestrator
from agents.registry import build_agent
from agents.schedule_reader import ScheduleReaderAgent
from agents.worker import WorkerAgent


def load_config():
    with open("agents.yaml", "r", encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def test_registry_builds_the_real_schedule_reader():
    agent = build_agent(
        {"name": "schedule_reader", "type": "schedule_reader", "role": "x"}
    )
    assert isinstance(agent, ScheduleReaderAgent)


def test_unknown_type_falls_back_to_worker():
    agent = build_agent({"name": "researcher", "role": "x"})
    assert isinstance(agent, WorkerAgent)


def test_schedule_reader_returns_structured_rows():
    agent = ScheduleReaderAgent(
        name="schedule_reader", role="x", options={"path": "data/applicants.csv"}
    )
    result = agent.run("load availability", Blackboard())

    assert result.status == "ok"
    rows = result.payload["availability"]
    assert rows and len(rows) == result.payload["count"]
    assert all(row["applicant_id"] for row in rows)


def test_schedule_reader_reports_a_missing_file():
    agent = ScheduleReaderAgent(
        name="schedule_reader", role="x", options={"path": "data/nope.csv"}
    )
    result = agent.run("load availability", Blackboard())

    assert result.status == "failed"
    assert result.errors


def test_dependencies_run_before_dependents():
    order = Orchestrator(load_config()).order()

    assert order.index("researcher") < order.index("coder")
    assert order.index("coder") < order.index("reviewer")
    assert order.index("schedule_reader") < order.index("reviewer")


def test_cycles_are_rejected():
    config = {
        "agents": [
            {"name": "a", "role": "x", "depends_on": ["b"]},
            {"name": "b", "role": "x", "depends_on": ["a"]},
        ]
    }
    try:
        Orchestrator(config).order()
    except ValueError:
        return
    raise AssertionError("expected a ValueError for a dependency cycle")


def test_every_agent_writes_to_the_shared_blackboard():
    orchestrator = Orchestrator(load_config())
    results = orchestrator.run_pipeline("smoke test")

    assert {r.agent for r in results} == set(orchestrator.by_name)
    assert set(orchestrator.board) == set(orchestrator.by_name)


def test_downstream_agents_can_see_upstream_output():
    orchestrator = Orchestrator(load_config())
    orchestrator.run_pipeline("smoke test")

    reviewer_result = orchestrator.board["reviewer"]
    assert "schedule_reader" in reviewer_result.payload["saw_upstream"]
