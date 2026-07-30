"""
Tests for the applicant pipeline agents.

Everything here runs offline: the suggestion agent's LLM rationale is opt-in and
turned off, so no API key is required.
"""

import yaml

from agents.base_agent import Blackboard
from agents.crn_checker import CrnCheckerAgent, mask
from agents.llm import truncate
from agents.orchestrator import Orchestrator
from agents.resume_reader import ResumeReaderAgent, parse_resume
from agents.schedule_reader import ScheduleReaderAgent
from agents.suggestion_agent import SuggestionAgent
from agents.visualizer import VisualizerAgent


def load_config():
    with open("agents.yaml", "r", encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def populated_board() -> Blackboard:
    """Run the two intake agents for real and return the shared board."""
    board = Blackboard()

    resumes = ResumeReaderAgent(
        name="resume_reader", role="x", options={"path": "data/resumes"}
    )
    schedule = ScheduleReaderAgent(
        name="schedule_reader", role="x", options={"path": "data/applicants.csv"}
    )

    board.put("resume_reader", resumes.run("read resumes", board))
    board.put("schedule_reader", schedule.run("read availability", board))
    return board


# --- resume_reader ---------------------------------------------------------


def test_parse_resume_extracts_the_expected_fields():
    record = parse_resume(
        "applicant_id: APP-009\nname: Test Person\n"
        "email: test@example.invalid\nCRN: CRN-123456\n",
        "fixture.md",
    )

    assert record["applicant_id"] == "APP-009"
    assert record["name"] == "Test Person"
    assert record["email"] == "test@example.invalid"
    assert record["crn"] == "CRN-123456"


def test_resume_reader_loads_the_committed_fixtures():
    result = ResumeReaderAgent(
        name="resume_reader", role="x", options={"path": "data/resumes"}
    ).run("read resumes", Blackboard())

    ids = {c["applicant_id"] for c in result.payload["candidates"]}
    assert {"APP-001", "APP-002"}.issubset(ids)


def test_resume_reader_reports_a_missing_directory():
    result = ResumeReaderAgent(
        name="resume_reader", role="x", options={"path": "data/nope"}
    ).run("read resumes", Blackboard())

    assert result.status == "failed"
    assert result.errors


# --- crn_checker -----------------------------------------------------------


def test_mask_hides_all_but_the_last_four_characters():
    assert mask("CRN-100001") == "******0001"
    assert mask("abc") == "***"
    assert mask("") == ""


def test_crn_checker_separates_valid_from_flagged():
    board = populated_board()
    result = CrnCheckerAgent(name="crn_checker", role="x").run("check", board)

    verdicts = {v["applicant_id"]: v["verdict"] for v in result.payload["verdicts"]}
    assert verdicts["APP-001"] == "valid"
    assert verdicts["APP-002"] == "needs_review"
    assert result.status == "needs_human"


def test_crn_checker_never_leaks_a_raw_crn():
    board = populated_board()
    result = CrnCheckerAgent(name="crn_checker", role="x").run("check", board)

    assert "CRN-100001" not in str(result.payload)
    assert all("crn" not in v for v in result.payload["verdicts"])


def test_crn_checker_skips_when_there_is_no_upstream():
    result = CrnCheckerAgent(name="crn_checker", role="x").run("check", Blackboard())
    assert result.status == "skipped"


# --- suggestion_agent ------------------------------------------------------


def test_suggestion_agent_joins_on_applicant_id():
    board = populated_board()
    board.put(
        "crn_checker", CrnCheckerAgent(name="crn_checker", role="x").run("check", board)
    )

    result = SuggestionAgent(name="suggestion_agent", role="x").run("suggest", board)
    by_id = {s["applicant_id"]: s for s in result.payload["suggestions"]}

    assert by_id["APP-001"]["available_day"] == "Wednesday"
    assert by_id["APP-001"]["recommend"] is True
    # APP-002 has a malformed CRN, so it must not be recommended.
    assert by_id["APP-002"]["recommend"] is False
    assert by_id["APP-002"]["blocked_by"]


def test_suggestion_agent_stays_offline_by_default():
    board = populated_board()
    board.put(
        "crn_checker", CrnCheckerAgent(name="crn_checker", role="x").run("check", board)
    )

    result = SuggestionAgent(name="suggestion_agent", role="x").run("suggest", board)
    assert result.payload["rationale"] == ""


# --- visualizer ------------------------------------------------------------


def test_visualizer_skips_without_suggestions():
    result = VisualizerAgent(name="visualizer", role="x").run("render", Blackboard())
    assert result.status == "skipped"


def test_visualizer_previews_without_writing_files():
    board = populated_board()
    board.put(
        "crn_checker", CrnCheckerAgent(name="crn_checker", role="x").run("check", board)
    )
    board.put(
        "suggestion_agent",
        SuggestionAgent(name="suggestion_agent", role="x").run("suggest", board),
    )

    result = VisualizerAgent(name="visualizer", role="x").run("render", board)
    artifact = result.payload["artifacts"][0]

    assert artifact["written"] is False
    assert "Wednesday" in artifact["preview"]


# --- llm helper ------------------------------------------------------------


def test_truncate_clips_long_prompts():
    assert truncate("abcdefghij", 5) == "ab..."
    assert truncate("short", 100) == "short"


# --- end to end ------------------------------------------------------------


def test_full_pipeline_runs_in_dependency_order():
    orchestrator = Orchestrator(load_config())
    order = orchestrator.order()

    assert order.index("resume_reader") < order.index("crn_checker")
    assert order.index("crn_checker") < order.index("suggestion_agent")
    assert order.index("schedule_reader") < order.index("suggestion_agent")
    # visualizer is enabled: false in agents.yaml
    assert "visualizer" not in order


def test_full_pipeline_produces_a_recommendation():
    orchestrator = Orchestrator(load_config())
    orchestrator.run_pipeline("schedule the applicants")

    suggestions = orchestrator.board["suggestion_agent"].payload
    assert suggestions["recommended"] >= 1
