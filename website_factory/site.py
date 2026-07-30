"""Node 4b (software engineer, composition): one page becomes a small site.

render.py deliberately produces a single document, because one document is the
smallest thing a gate can grade. A real product site needs more than that, and
the two extra pages here exist for a reason rather than for volume: the index
page sells, these pages commit. Every word on them already lives in
product.spec - the user stories with their acceptance criteria, the explicit
out-of-scope list, the roadmap - so this layer invents no copy either.

Why a separate module instead of more branches inside render_bundle:

  * render.py stays the thing that turns one content model into one document,
    and keeps passing G4 exactly as it did before;
  * this module is the only place that knows a site has more than one page, so
    adding page seven is a change in one file;
  * gate G4b can be tightened here without destabilising the renderer.

The cross-page links are injected into the finished index document instead of
being templated into it. That is the only piece of string surgery in the
codebase and it is deliberate: remove this module and index.html is still a
valid, self-contained page. When the renderer grows a real page registry,
_inject_nav is the first thing to delete.
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any, Dict, List, Optional, Sequence, Tuple

from . import content, design, publish, render
from .envelope import Quality, require
from .render import _a11y_checks, _footer, _head, _topbar, esc, scan_for_secrets
from .run import DEFAULT_BASE_URL

G4B_THRESHOLD = 0.85
G4B_WEIGHTS = {
    "page_completeness": 0.30,
    "accessibility": 0.30,
    "navigation": 0.20,
    "traceability": 0.20,
}

SITE_CONTRACT = ("files", "entrypoints", "routes", "base_url")

# path, nav label, why the page exists. The third field is carried into the run
# report so a reviewer can see the intent without reading the HTML.
PAGES: Tuple[Tuple[str, str, str], ...] = (
    ("stories.html", "What we are building", "commitments and acceptance criteria"),
    ("scope.html", "What it will not do", "boundaries and sequencing"),
)

PAGE_NAV: Tuple[Tuple[str, str], ...] = tuple(
    (label, path) for path, label, _purpose in PAGES
)


def _coverage(actual: int, target: int) -> float:
    """Fraction of a target hit, clamped, so a rubric value never exceeds 1.0."""
    if target <= 0:
        return 0.0
    return round(min(float(actual) / float(target), 1.0), 4)


def _local_nav(current: str) -> List[str]:
    """Nav for a subpage: relative links only, so it works under any base path."""
    out = ['<nav class="nav" aria-label="Pages">', '<a href="./">Overview</a>']
    for path, label, _purpose in PAGES:
        if path == current:
            out.append(
                '<a href="%s" aria-current="page">%s</a>' % (esc(path), esc(label))
            )
        else:
            out.append('<a href="%s">%s</a>' % (esc(path), esc(label)))
    out.append("</nav>")
    return out


def stories_html(spec: Dict[str, Any], canonical: str, version: str = "1.0.0") -> str:
    """The commitments page: one card per story, criteria as a list."""
    require(spec, ("product_name", "stories"), "software_engineer")
    heading = "What we are building"
    lede = spec.get(
        "status_note",
        "Every story below carries the criteria that decide when it is done.",
    )
    title = "%s - %s" % (heading, spec["product_name"])

    out = _head(title, lede, canonical, version)
    out.append("<body>")
    out.extend(_topbar(spec, with_nav=False))
    out.append('<main id="main">')
    out.extend(['<section class="hero">', '<div class="wrap">'])
    out.extend(_local_nav("stories.html"))
    out.extend(
        [
            "<h1>%s</h1>" % esc(heading),
            '<p class="lede">%s</p>' % esc(lede),
            "</div>",
            "</section>",
            '<section id="stories">',
            '<div class="wrap">',
        ]
    )
    for story in spec["stories"]:
        out.extend(
            [
                '<article class="card" id="%s">' % esc(story["id"]),
                "<h2>%s: as %s, %s</h2>"
                % (esc(story["id"]), esc(story["as_a"]), esc(story["i_want"])),
                '<p class="muted">So that %s.</p>' % esc(story["so_that"]),
                "<h3>Done when</h3>",
                "<ul>",
            ]
        )
        for criterion in story["acceptance_criteria"]:
            out.append("<li>%s</li>" % esc(criterion))
        out.extend(["</ul>", "</article>"])
    out.extend(["</div>", "</section>"])

    metrics = spec.get("metrics", [])
    if metrics:
        out.extend(
            [
                '<section id="metrics">',
                '<div class="wrap">',
                "<h2>How we will know it worked</h2>",
                "<ul>",
            ]
        )
        for metric in metrics:
            out.append("<li>%s</li>" % esc(metric))
        out.extend(["</ul>", "</div>", "</section>"])

    out.append("</main>")
    out.extend(_footer(spec))
    out.extend(["</body>", "</html>"])
    return "\n".join(out) + "\n"


def scope_html(spec: Dict[str, Any], canonical: str, version: str = "1.0.0") -> str:
    """The boundaries page: what is out, and what is merely later."""
    require(
        spec,
        ("product_name", "positioning", "out_of_scope", "roadmap"),
        "software_engineer",
    )
    heading = "What it will not do"
    lede = spec["positioning"]
    title = "%s - %s" % (heading, spec["product_name"])

    out = _head(title, lede, canonical, version)
    out.append("<body>")
    out.extend(_topbar(spec, with_nav=False))
    out.append('<main id="main">')
    out.extend(['<section class="hero">', '<div class="wrap">'])
    out.extend(_local_nav("scope.html"))
    out.extend(
        [
            "<h1>%s</h1>" % esc(heading),
            '<p class="lede">%s</p>' % esc(lede),
            "</div>",
            "</section>",
            '<section id="not-building">',
            '<div class="wrap">',
            "<h2>Not in this version</h2>",
            "<ul>",
        ]
    )
    for item in spec["out_of_scope"]:
        out.append("<li>%s</li>" % esc(item))
    out.extend(
        [
            "</ul>",
            "</div>",
            "</section>",
            '<section id="later">',
            '<div class="wrap">',
            "<h2>Later, not never</h2>",
        ]
    )
    for phase in spec["roadmap"]:
        out.extend(
            [
                '<article class="card">',
                "<h3>Phase %s: %s</h3>" % (esc(phase["phase"]), esc(phase["name"])),
                '<p class="muted">%s</p>' % esc(phase["outcome"]),
                "<ul>",
            ]
        )
        for item in phase["items"]:
            out.append("<li>%s</li>" % esc(item))
        out.extend(["</ul>", "</article>"])
    out.extend(["</div>", "</section>", "</main>"])
    out.extend(_footer(spec))
    out.extend(["</body>", "</html>"])
    return "\n".join(out) + "\n"


BUILDERS = {"stories.html": stories_html, "scope.html": scope_html}


def build_pages(
    spec: Dict[str, Any], base_url: str, version: str = "1.0.0"
) -> Dict[str, str]:
    """Render every extra page. In memory, like the renderer: no disk access."""
    base = base_url if base_url.endswith("/") else base_url + "/"
    pages: Dict[str, str] = {}
    for path, _label, _purpose in PAGES:
        pages[path] = BUILDERS[path](spec, base + path, version)
    return pages


def _inject_nav(document: str, links: Sequence[Tuple[str, str]]) -> str:
    """Add page links to the index nav without re-templating the index.

    Only the first </nav> is touched, and only once, so the result is easy to
    assert on: the index still has exactly one nav when this returns.
    """
    if "</nav>" not in document:
        return document
    extra = "".join(
        '<a href="%s">%s</a>' % (esc(path), esc(label)) for label, path in links
    )
    return document.replace("</nav>", extra + "</nav>", 1)


def sitemap_xml(base_url: str, routes: Sequence[str]) -> str:
    """A sitemap that knows about every indexable route, not just the root."""
    base = base_url if base_url.endswith("/") else base_url + "/"
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    for route in routes:
        lines.extend(
            [
                "  <url>",
                "    <loc>%s</loc>" % esc(base + route.lstrip("/")),
                "    <changefreq>monthly</changefreq>",
                "  </url>",
            ]
        )
    lines.append("</urlset>")
    return "\n".join(lines) + "\n"


def extend_bundle(bundle: Dict[str, Any], spec: Dict[str, Any]) -> Dict[str, Any]:
    """code.bundle -> code.bundle, with the extra pages folded in.

    The input bundle is not mutated, and the shape out is the shape in, so
    anything that already accepts a code.bundle keeps working on the result.
    """
    require(bundle, SITE_CONTRACT, "software_engineer")
    base = bundle["base_url"]
    version = bundle.get("version", "1.0.0")

    files = dict(bundle["files"])
    pages = build_pages(spec, base, version)
    files.update(pages)
    files["index.html"] = _inject_nav(files["index.html"], PAGE_NAV)

    indexable = ["/"] + ["/%s" % path for path, _label, _purpose in PAGES]
    files["sitemap.xml"] = sitemap_xml(base, indexable)

    site = dict(bundle)
    site["files"] = files
    site["routes"] = sorted(set(list(bundle["routes"]) + indexable))
    site["pages"] = [
        {"path": path, "label": label, "purpose": purpose}
        for path, label, purpose in PAGES
    ]
    return site


def grade_site(site: Dict[str, Any], spec: Dict[str, Any]) -> Quality:
    """Gate G4b: the extra pages exist, are reachable, accessible and traceable.

    Traceability is the interesting one. It asks whether every story id and
    every out-of-scope line actually reached the HTML, which is the check that
    catches a spec change nobody rendered.
    """
    require(site, SITE_CONTRACT, "software_engineer")
    files: Dict[str, str] = site["files"]
    violations: List[str] = []

    present = [path for path, _label, _purpose in PAGES if path in files]
    for path, _label, _purpose in PAGES:
        if path not in files:
            violations.append("site is missing %s" % path)

    violations.extend(scan_for_secrets({path: files[path] for path in present}))

    checks_total = 0
    checks_ok = 0
    for path in present:
        checks = _a11y_checks(files[path])
        checks_total += len(checks)
        checks_ok += sum(1 for value in checks.values() if value)
        for name, value in sorted(checks.items()):
            if not value:
                violations.append("%s fails: %s" % (path, name))

    index = files.get("index.html", "")
    if index.count("</nav>") != 1:
        violations.append("index.html should have exactly one nav after injection")
    reachable = sum(
        1 for path, _label, _purpose in PAGES if ('href="%s"' % path) in index
    )
    back_links = sum(1 for path in present if 'href="./"' in files[path])

    for route in site["routes"]:
        target = route.lstrip("/") or "index.html"
        if target not in files:
            violations.append("route %s has no file behind it" % route)

    story_ids = [story["id"] for story in spec.get("stories", [])]
    stories_doc = files.get("stories.html", "")
    scope_doc = files.get("scope.html", "")
    out_of_scope = spec.get("out_of_scope", [])
    traced = sum(1 for story_id in story_ids if story_id in stories_doc)
    scoped = sum(1 for item in out_of_scope if esc(item) in scope_doc)

    rubric = {
        "page_completeness": _coverage(len(present), len(PAGES)),
        "accessibility": _coverage(checks_ok, checks_total),
        "navigation": _coverage(reachable + back_links, 2 * len(PAGES)),
        "traceability": _coverage(traced + scoped, len(story_ids) + len(out_of_scope)),
    }
    return Quality(
        threshold=G4B_THRESHOLD,
        rubric=rubric,
        weights=G4B_WEIGHTS,
        violations=violations,
    )


def compose(
    base_url: str = DEFAULT_BASE_URL, version: str = "1.0.0"
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """seed -> brief -> spec -> design -> bundle -> site. Pure and reproducible.

    Returns the spec alongside the site because every gate downstream needs the
    spec to grade against. Nothing here touches the network or the filesystem.
    """
    brief = content.idea_brief()
    spec = content.product_spec(brief)
    system = design.design_system(spec)
    bundle = render.render_bundle(spec, system, base_url, version)
    return spec, extend_bundle(bundle, spec)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m website_factory.site",
        description="Build the multi-page site and grade it against gate G4b.",
    )
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument(
        "--out",
        default=None,
        help="write the site to this directory, only if the gate passes",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="grade only and write nothing; this is what CI runs",
    )
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    """Exit 0 when the gate passes, 1 when it does not. CI reads the exit code."""
    args = _parser().parse_args(argv)
    spec, site = compose(args.base_url, "1.0.0")
    quality = grade_site(site, spec)

    report: Dict[str, Any] = {
        "gate": "G4b",
        "passed": quality.passed,
        "quality": quality.to_dict(),
        "routes": site["routes"],
        "files": sorted(site["files"]),
        "pages": site["pages"],
        "digest": publish.bundle_digest(site["files"]),
    }
    if args.out and not args.check and quality.passed:
        report["written"] = publish.write_bundle(site, args.out)

    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if quality.passed else 1


if __name__ == "__main__":
    sys.exit(main())
