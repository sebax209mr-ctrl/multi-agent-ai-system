"""Tests for the composition layer: the site, not just the page.

The interesting tests here are the ones that would have caught real mistakes:

  * test_pages_use_real_line_breaks - a doubled backslash in a joiner produces
    HTML that still parses, so no structural assertion would notice it;
  * test_index_has_exactly_one_nav - _inject_nav does string surgery, and string
    surgery that runs twice is the obvious way for it to go wrong;
  * test_every_story_reaches_the_page - a spec change that nobody rendered is
    silent otherwise.
"""

import json

import pytest

from website_factory import content, design, publish, render, site


@pytest.fixture(scope="module")
def composed():
    return site.compose("https://example.invalid/base/")


@pytest.fixture(scope="module")
def spec(composed):
    return composed[0]


@pytest.fixture(scope="module")
def built(composed):
    return composed[1]


def test_gate_passes(built, spec):
    quality = site.grade_site(built, spec)
    assert quality.violations == []
    assert quality.passed
    assert quality.score >= site.G4B_THRESHOLD


def test_weights_sum_to_one():
    assert round(sum(site.G4B_WEIGHTS.values()), 6) == 1.0


def test_every_declared_page_is_built(built):
    for path, _label, _purpose in site.PAGES:
        assert path in built["files"]
        assert built["files"][path].strip()


def test_page_metadata_records_intent(built):
    purposes = {page["path"]: page["purpose"] for page in built["pages"]}
    assert set(purposes) == {path for path, _label, _purpose in site.PAGES}
    assert all(purposes.values())


def test_pages_use_real_line_breaks(built):
    literal_escape = chr(92) + "n"
    for path, _label, _purpose in site.PAGES:
        document = built["files"][path]
        assert chr(10) in document
        assert literal_escape not in document


def test_subpages_are_accessible(built):
    for path, _label, _purpose in site.PAGES:
        checks = render._a11y_checks(built["files"][path])
        assert all(checks.values()), (path, checks)


def test_index_has_exactly_one_nav(built):
    assert built["files"]["index.html"].count("</nav>") == 1


def test_index_links_to_every_page(built):
    index = built["files"]["index.html"]
    for path, label, _purpose in site.PAGES:
        assert ('href="%s"' % path) in index
        assert label in index


def test_every_page_links_back(built):
    for path, _label, _purpose in site.PAGES:
        assert 'href="./"' in built["files"][path]


def test_current_page_is_marked(built):
    document = built["files"]["scope.html"]
    assert 'href="scope.html" aria-current="page"' in document
    assert 'href="stories.html">' in document


def test_every_story_reaches_the_page(built, spec):
    document = built["files"]["stories.html"]
    for story in spec["stories"]:
        assert story["id"] in document
        assert render.esc(story["i_want"]) in document
        for criterion in story["acceptance_criteria"]:
            assert render.esc(criterion) in document


def test_every_out_of_scope_line_reaches_the_page(built, spec):
    document = built["files"]["scope.html"]
    for item in spec["out_of_scope"]:
        assert render.esc(item) in document


def test_roadmap_phases_reach_the_scope_page(built, spec):
    document = built["files"]["scope.html"]
    for phase in spec["roadmap"]:
        assert render.esc(phase["name"]) in document
        assert render.esc(phase["outcome"]) in document


def test_canonical_is_per_page(built):
    for path, _label, _purpose in site.PAGES:
        canonical = 'href="https://example.invalid/base/%s"' % path
        assert canonical in built["files"][path]


def test_sitemap_covers_indexable_routes_only(built):
    sitemap = built["files"]["sitemap.xml"]
    assert "https://example.invalid/base/" in sitemap
    for path, _label, _purpose in site.PAGES:
        assert ("https://example.invalid/base/%s" % path) in sitemap
    assert "404" not in sitemap


def test_sitemap_tolerates_a_base_url_without_a_slash():
    sitemap = site.sitemap_xml("https://example.invalid", ["/", "/a.html"])
    assert "https://example.invalid/a.html" in sitemap
    assert "invalida.html" not in sitemap


def test_every_route_has_a_file(built):
    for route in built["routes"]:
        target = route.lstrip("/") or "index.html"
        assert target in built["files"]


def test_routes_are_sorted_and_unique(built):
    assert built["routes"] == sorted(set(built["routes"]))


def test_no_secrets_in_the_new_pages(built):
    pages = {path: built["files"][path] for path, _label, _purpose in site.PAGES}
    assert render.scan_for_secrets(pages) == []


def test_composition_is_reproducible():
    first = site.compose("https://example.invalid/base/")[1]
    second = site.compose("https://example.invalid/base/")[1]
    assert publish.bundle_digest(first["files"]) == publish.bundle_digest(
        second["files"]
    )


def test_extend_bundle_does_not_mutate_its_input():
    brief = content.idea_brief()
    product = content.product_spec(brief)
    system = design.design_system(product)
    bundle = render.render_bundle(product, system, "https://example.invalid/")
    before = dict(bundle["files"])
    site.extend_bundle(bundle, product)
    assert bundle["files"] == before
    assert "stories.html" not in bundle["files"]


def test_extended_bundle_still_passes_the_renderer_gate(built, spec):
    assert render.grade_bundle(built, spec).passed


def test_inject_nav_is_a_no_op_without_a_nav():
    plain = "<p>no nav here</p>"
    assert site._inject_nav(plain, site.PAGE_NAV) == plain


def test_inject_nav_touches_only_the_first_nav():
    document = "<nav>a</nav><nav>b</nav>"
    result = site._inject_nav(document, (("Label", "page.html"),))
    assert result.count('href="page.html"') == 1
    assert result.index("Label") < result.index("<nav>b")


def test_missing_page_is_a_violation(built, spec):
    broken = dict(built)
    broken["files"] = {
        path: text for path, text in built["files"].items() if path != "stories.html"
    }
    quality = site.grade_site(broken, spec)
    assert not quality.passed
    assert any("stories.html" in item for item in quality.violations)


def test_route_without_a_file_is_a_violation(built, spec):
    broken = dict(built)
    broken["routes"] = list(built["routes"]) + ["/pricing.html"]
    quality = site.grade_site(broken, spec)
    assert not quality.passed
    assert any("pricing.html" in item for item in quality.violations)


def test_copy_is_escaped_not_trusted():
    brief = content.idea_brief()
    product = content.product_spec(brief)
    product["out_of_scope"] = ['<script>alert("x")</script>']
    document = site.scope_html(product, "https://example.invalid/scope.html")
    assert "<script>" not in document
    assert "&lt;script&gt;" in document


def test_contract_is_enforced(spec):
    with pytest.raises(Exception):
        site.extend_bundle({"files": {}}, spec)


def test_cli_reports_the_gate(capsys):
    assert site.main(["--check", "--base-url", "https://example.invalid/"]) == 0
    report = json.loads(capsys.readouterr().out)
    assert report["gate"] == "G4b"
    assert report["passed"] is True
    assert report["digest"]
    assert "stories.html" in report["files"]


def test_cli_check_writes_nothing(tmp_path, capsys):
    out = tmp_path / "dist"
    assert site.main(["--check", "--out", str(out)]) == 0
    capsys.readouterr()
    assert not out.exists()


def test_cli_writes_the_site_when_asked(tmp_path, capsys):
    out = tmp_path / "dist"
    argv = ["--out", str(out), "--base-url", "https://example.invalid/"]
    assert site.main(argv) == 0
    report = json.loads(capsys.readouterr().out)
    assert report["written"]
    assert (out / "index.html").is_file()
    for path, _label, _purpose in site.PAGES:
        assert (out / path).is_file()
