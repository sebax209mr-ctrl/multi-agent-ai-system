"""Tests for the website factory.

These are the deterministic half of the quality gates, run on every push. The
ones worth knowing about:

  * test_every_text_pair_meets_wcag_aa recomputes contrast from the tokens, so a
    palette change that hurts readability turns CI red instead of shipping.
  * test_bundle_is_byte_identical_across_runs is what lets the deploy step claim
    the site is reproducible from source.
  * test_bundle_carries_no_secret_markers and test_write_bundle_refuses_escape
    cover the two ways a static build usually leaks or corrupts something.
  * test_failed_gate_escalates_to_a_human proves nothing degraded ships quietly.
"""

import json

import pytest

from website_factory import content, design, publish, render
from website_factory.envelope import (
    HUMAN_ROUTE,
    ContractError,
    Envelope,
    Quality,
    apply_route,
    decide_route,
    idempotency_key,
    require,
)
from website_factory.run import Run, build_site, default_run_id, main


@pytest.fixture(scope="module")
def brief():
    return content.idea_brief()


@pytest.fixture(scope="module")
def spec(brief):
    return content.product_spec(brief)


@pytest.fixture(scope="module")
def system(spec):
    return design.design_system(spec)


@pytest.fixture(scope="module")
def bundle(spec, system):
    return render.render_bundle(spec, system, "https://example.invalid/site/")


# -- envelope ------------------------------------------------------------


def _envelope(**overrides):
    defaults = {
        "run_id": "run_test",
        "node_id": "idea_generator",
        "node_type": "agent.ideation",
        "emits": "idea.brief",
        "payload": {"a": 1},
        "quality": Quality(threshold=0.8, rubric={"novelty": 1.0}),
    }
    defaults.update(overrides)
    return Envelope(**defaults)


def test_envelope_carries_the_documented_shape():
    shape = _envelope().to_dict()
    for key in (
        "envelope_version",
        "run_id",
        "idempotency_key",
        "node",
        "trace",
        "status",
        "quality",
        "payload",
        "artifacts",
        "errors",
        "next",
    ):
        assert key in shape
    assert shape["node"]["id"] == "idea_generator"
    assert shape["quality"]["score"] == 1.0


def test_envelope_rejects_an_unknown_status():
    with pytest.raises(ContractError):
        _envelope(status="probably_fine")


def test_idempotency_key_is_stable_and_input_sensitive():
    first = idempotency_key("run_1", "node", {"b": 2, "a": 1})
    again = idempotency_key("run_1", "node", {"a": 1, "b": 2})
    other = idempotency_key("run_1", "node", {"a": 1, "b": 3})
    assert first == again
    assert first != other


def test_a_violation_fails_a_gate_whatever_the_score_says():
    quality = Quality(
        threshold=0.5, rubric={"everything": 1.0}, violations=["build failed"]
    )
    assert quality.score == 1.0
    assert not quality.passed


def test_weighted_score_respects_the_weights():
    quality = Quality(
        threshold=0.0,
        rubric={"a": 1.0, "b": 0.0},
        weights={"a": 0.75, "b": 0.25},
    )
    assert quality.score == 0.75


def test_routing_reworks_before_it_escalates():
    failing = Quality(threshold=0.9, rubric={"a": 0.1})
    first = _envelope(quality=failing, attempt=1)
    assert decide_route(first, "product_manager") == (
        "idea_generator",
        "rework_with_critique",
    )
    last = _envelope(quality=failing, attempt=2)
    assert decide_route(last, "product_manager") == (HUMAN_ROUTE, "gate_failed")
    apply_route(last, "product_manager")
    assert last.status == "needs_human"
    assert last.errors and last.errors[0]["class"] == "E2xx"


def test_require_names_the_missing_fields():
    with pytest.raises(ContractError) as caught:
        require({"a": 1, "b": ""}, ("a", "b", "c"), "some_node")
    message = str(caught.value)
    assert "b" in message and "c" in message


# -- nodes 1 and 2 -------------------------------------------------------


def test_gate_one_passes_on_the_pinned_brief(brief):
    quality = content.grade_idea(brief)
    assert quality.violations == []
    assert quality.passed
    assert len(brief["personas"]) >= 2
    assert len(brief["usps"]) >= 3


def test_gate_two_passes_and_scope_is_published(spec, brief):
    quality = content.grade_product(spec, brief)
    assert quality.violations == []
    assert quality.passed
    assert spec["out_of_scope"], "a spec with no exclusions is a scope-creep bomb"


def test_every_story_is_testable(spec):
    for story in spec["stories"]:
        assert story["acceptance_criteria"], story["id"]
        assert len(story["acceptance_criteria"]) >= 2, story["id"]


def test_roadmap_phases_are_ordered(spec):
    phases = [phase["phase"] for phase in spec["roadmap"]]
    assert phases == sorted(phases)


def test_the_site_only_promises_what_the_brief_claimed(spec, brief):
    features = [item["title"] for item in spec["sections"]["features"]["items"]]
    assert features == [usp["title"] for usp in brief["usps"]]


# -- node 3, the gate that cannot be argued with -------------------------


def test_contrast_ratio_matches_known_values():
    assert design.contrast_ratio("#000000", "#ffffff") == 21.0
    assert design.contrast_ratio("#ffffff", "#ffffff") == 1.0
    assert design.contrast_ratio("#fff", "#000") == 21.0


def test_every_text_pair_meets_wcag_aa(system):
    failures = [row for row in system["contrast"] if not row["passes"]]
    assert failures == [], failures
    for row in system["contrast"]:
        assert row["ratio"] >= row["minimum"], row["name"]


def test_gate_three_catches_a_bad_palette(spec):
    broken = design.design_system(spec)
    broken["tokens"]["color"]["ink-muted"] = "#cccccc"
    broken["contrast"] = design.contrast_report(broken["tokens"]["color"])
    quality = design.grade_design(broken, spec)
    assert not quality.passed
    assert any("contrast" in violation for violation in quality.violations)


def test_every_feature_maps_to_a_component(system, spec):
    covered = set()
    for component in system["components"]:
        covered.update(component["covers"])
    for item in spec["sections"]["features"]["items"]:
        assert item["title"] in covered


# -- node 4 --------------------------------------------------------------


def test_bundle_ships_every_required_file(bundle):
    for name in render.REQUIRED_FILES:
        assert name in bundle["files"]


def test_gate_four_passes(bundle, spec):
    quality = render.grade_bundle(bundle, spec)
    assert quality.violations == [], quality.violations
    assert quality.passed


def test_bundle_renders_every_promise_in_the_spec(bundle, spec):
    document = bundle["files"]["index.html"]
    for item in spec["sections"]["features"]["items"]:
        assert render.esc(item["title"]) in document
    for entry in spec["sections"]["faq"]["items"]:
        assert render.esc(entry["question"]) in document
    for excluded in spec["out_of_scope"]:
        assert render.esc(excluded) in document


def test_bundle_carries_no_secret_markers(bundle):
    assert publish.leaked_credentials(bundle["files"]) == []
    assert render.scan_for_secrets(bundle["files"]) == []


def test_css_is_generated_from_tokens_not_hand_picked(bundle, system):
    stylesheet = bundle["files"]["styles.css"]
    for name, value in system["tokens"]["color"].items():
        assert "--color-%s: %s;" % (name, value) in stylesheet


def test_base_url_reaches_the_canonical_link_and_sitemap(bundle):
    assert 'rel="canonical" href="https://example.invalid/site/"' in bundle[
        "files"
    ]["index.html"]
    assert "https://example.invalid/site/" in bundle["files"]["sitemap.xml"]
    assert "https://example.invalid/site/sitemap.xml" in bundle["files"][
        "robots.txt"
    ]


def test_stylesheet_link_is_relative_so_a_subpath_host_works(bundle):
    assert 'href="styles.css"' in bundle["files"]["index.html"]
    assert 'href="/styles.css"' not in bundle["files"]["index.html"]


def test_bundle_is_byte_identical_across_runs(spec, system):
    first = render.render_bundle(spec, system, "https://example.invalid/site/")
    again = render.render_bundle(spec, system, "https://example.invalid/site/")
    assert first["files"] == again["files"]


def test_missing_contract_field_is_a_contract_error(system):
    with pytest.raises(ContractError):
        render.render_bundle({"product_name": "X"}, system)


# -- node 5 --------------------------------------------------------------


def test_write_bundle_refuses_to_escape_its_output_directory(tmp_path, bundle):
    hostile = dict(bundle)
    hostile["files"] = dict(bundle["files"])
    hostile["files"]["../escaped.html"] = "<p>nope</p>"
    with pytest.raises(publish.UnsafePath):
        publish.write_bundle(hostile, str(tmp_path / "dist"))


def test_deployment_verification_is_all_green(tmp_path, bundle):
    out = str(tmp_path / "dist")
    written = publish.write_bundle(bundle, out)
    record = publish.deployment_record(bundle, out, written)
    failed = [check for check in record["verification"] if not check["passed"]]
    assert failed == [], failed
    assert publish.grade_deployment(record).passed
    assert record["credentials"]["required_names"] == []
    assert record["rollback"]["method"]


def test_bundle_digest_changes_when_content_changes(bundle):
    first = publish.bundle_digest(bundle["files"])
    changed = dict(bundle["files"])
    changed["index.html"] = changed["index.html"] + "<!-- edit -->"
    assert publish.bundle_digest(changed) != first


# -- node 6, end to end --------------------------------------------------


def test_run_id_is_stable_for_a_day_and_configuration():
    first = default_run_id("https://example.invalid/", today="20260730")
    again = default_run_id("https://example.invalid/", today="20260730")
    other = default_run_id("https://elsewhere.invalid/", today="20260730")
    assert first == again
    assert first != other
    assert first.startswith("run_20260730_")


def test_a_whole_run_publishes_a_site(tmp_path):
    out = tmp_path / "dist"
    runs = tmp_path / "runs"
    report = build_site(
        out_dir=str(out),
        base_url="https://example.invalid/site/",
        runs_dir=str(runs),
        run_id="run_test_0001",
    )

    assert report["status"] == "ok"
    assert report["state"] == "DONE"
    assert report["completed"] == [
        "idea_generator",
        "product_manager",
        "uiux_designer",
        "software_engineer",
        "it_deployment",
    ]
    assert all(gate["passed"] for gate in report["gates"])
    assert report["human_interventions"] == 0
    assert report["live_url"] == "https://example.invalid/site/"

    assert (out / "index.html").is_file()
    assert (out / "styles.css").is_file()
    assert (out / "404.html").is_file()
    assert (out / ".nojekyll").is_file()

    log = runs / "run_test_0001" / "events.jsonl"
    assert log.is_file()
    lines = [line for line in log.read_text(encoding="utf-8").splitlines() if line]
    assert len(lines) == report["event_count"]
    for line in lines:
        json.loads(line)

    saved = json.loads(
        (runs / "run_test_0001" / "run-report.json").read_text(encoding="utf-8")
    )
    assert saved["run_id"] == "run_test_0001"


def test_artifacts_are_content_addressed_not_inlined(tmp_path):
    run = Run(
        out_dir=str(tmp_path / "dist"),
        base_url="https://example.invalid/site/",
        runs_dir=None,
        run_id="run_test_0002",
    )
    run.execute()
    build = [e for e in run.envelopes if e.node_id == "software_engineer"][0]
    assert build.artifacts
    for artifact in build.artifacts:
        assert len(artifact["sha256"]) == 64
        assert artifact["bytes"] >= 0
    # The payload lists names only; the bytes live in artifacts.
    assert build.payload["files"] == sorted(
        artifact["path"] for artifact in build.artifacts
    )


def test_failed_gate_escalates_to_a_human(tmp_path, monkeypatch):
    monkeypatch.setattr(
        content,
        "grade_idea",
        lambda brief: Quality(threshold=0.9, rubric={"novelty": 0.1}),
    )
    report = build_site(
        out_dir=str(tmp_path / "dist"),
        base_url="https://example.invalid/site/",
        runs_dir=str(tmp_path / "runs"),
        run_id="run_test_0003",
    )
    assert report["status"] == "needs_human"
    assert report["live_url"] is None
    assert report["human_interventions"] == 1
    assert report["approval_request"]["blocking_node"] == "idea_generator"
    assert not (tmp_path / "dist" / "index.html").exists()


def test_cli_builds_and_returns_zero(tmp_path, capsys):
    code = main(
        [
            "--out",
            str(tmp_path / "dist"),
            "--runs-dir",
            str(tmp_path / "runs"),
            "--run-id",
            "run_test_0004",
            "--base-url",
            "https://example.invalid/site/",
        ]
    )
    assert code == 0
    assert (tmp_path / "dist" / "index.html").is_file()
    assert "run_test_0004" in capsys.readouterr().out


def test_report_is_json_serialisable(tmp_path):
    report = build_site(
        out_dir=str(tmp_path / "dist"),
        base_url="https://example.invalid/site/",
        runs_dir=None,
        run_id="run_test_0005",
    )
    assert json.loads(json.dumps(report, sort_keys=True))["status"] == "ok"
