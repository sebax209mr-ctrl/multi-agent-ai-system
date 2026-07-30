"""Node 3 (UI/UX designer): tokens, component hierarchy, and gate G3.

Tokens over pictures. This node emits a design.system payload and nothing about
how it feels - the renderer downstream reads tokens and never picks a colour.

Gate G3 is the one gate in this pipeline that cannot be argued with. Contrast is
arithmetic: WCAG 2.1 relative luminance, computed here, in the repository, on
every run. If a palette change drops a text pair below AA the gate fails and CI
goes red before the site is ever published. That is the whole reason the
contrast maths lives in source instead of in a designer's head.

The second deterministic check is coverage: every feature the product node
promised must map to at least one component. A feature with no component is a
claim the site cannot render.
"""

from __future__ import annotations

from typing import Any, Dict, List, Tuple

from website_factory.envelope import Quality, require

G3_THRESHOLD = 0.85
G3_WEIGHTS = {
    "hierarchy_clarity": 0.4,
    "token_coherence": 0.3,
    "layout_semantics": 0.3,
}

# WCAG 2.1 AA minimums.
AA_NORMAL_TEXT = 4.5
AA_LARGE_TEXT = 3.0

DESIGN_CONTRACT = ("tokens", "components", "text_pairs", "contrast")

# The palette is deliberately small: one ink, one muted ink, one brand, two
# surfaces, one line. Every value below is used by at least one token pair that
# gate G3 checks.
COLOR = {
    "ink": "#10202b",
    "ink-muted": "#40525f",
    "brand": "#0b6e8f",
    "brand-ink": "#ffffff",
    "surface": "#ffffff",
    "surface-alt": "#f2f7f9",
    "line": "#d3e0e6",
    "footer": "#10202b",
    "footer-ink": "#e6eef2",
}

FONT = {
    "sans": (
        "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', "
        "Arial, sans-serif"
    ),
    "scale-hero": "clamp(2rem, 5vw, 3.25rem)",
    "scale-h2": "clamp(1.35rem, 2.6vw, 1.75rem)",
    "scale-body": "1.0625rem",
    "scale-small": "0.9375rem",
    "leading-tight": "1.15",
    "leading-body": "1.6",
}

SPACE = {
    "1": "0.25rem",
    "2": "0.5rem",
    "3": "0.75rem",
    "4": "1rem",
    "6": "1.5rem",
    "8": "2rem",
    "12": "3rem",
    "16": "4rem",
}

SHAPE = {
    "radius": "10px",
    "radius-pill": "999px",
    "measure": "64ch",
    "wrap": "68rem",
    "border": "1px",
}

# Every text-on-background pair the rendered page can actually produce. If the
# renderer introduces a new pair it must be declared here or G3 is meaningless.
TEXT_PAIRS = (
    {"name": "body text", "fg": "ink", "bg": "surface", "min": AA_NORMAL_TEXT},
    {"name": "muted text", "fg": "ink-muted", "bg": "surface", "min": AA_NORMAL_TEXT},
    {"name": "link", "fg": "brand", "bg": "surface", "min": AA_NORMAL_TEXT},
    {
        "name": "card text",
        "fg": "ink",
        "bg": "surface-alt",
        "min": AA_NORMAL_TEXT,
    },
    {
        "name": "card muted text",
        "fg": "ink-muted",
        "bg": "surface-alt",
        "min": AA_NORMAL_TEXT,
    },
    {
        "name": "primary button",
        "fg": "brand-ink",
        "bg": "brand",
        "min": AA_NORMAL_TEXT,
    },
    {
        "name": "footer text",
        "fg": "footer-ink",
        "bg": "footer",
        "min": AA_NORMAL_TEXT,
    },
)


def _channel(value: int) -> float:
    """Linearise one 8-bit sRGB channel (WCAG 2.1 definition)."""
    ratio = value / 255.0
    if ratio <= 0.03928:
        return ratio / 12.92
    return ((ratio + 0.055) / 1.055) ** 2.4


def parse_hex(color: str) -> Tuple[int, int, int]:
    raw = color.lstrip("#")
    if len(raw) == 3:
        raw = "".join(character * 2 for character in raw)
    if len(raw) != 6:
        raise ValueError("expected a 3 or 6 digit hex colour, got %r" % color)
    return (int(raw[0:2], 16), int(raw[2:4], 16), int(raw[4:6], 16))


def relative_luminance(color: str) -> float:
    red, green, blue = parse_hex(color)
    return (
        0.2126 * _channel(red)
        + 0.7152 * _channel(green)
        + 0.0722 * _channel(blue)
    )


def contrast_ratio(foreground: str, background: str) -> float:
    """WCAG contrast ratio, 1.0 to 21.0, order independent."""
    first = relative_luminance(foreground)
    second = relative_luminance(background)
    lighter, darker = max(first, second), min(first, second)
    return round((lighter + 0.05) / (darker + 0.05), 2)


def contrast_report(palette: Dict[str, str]) -> List[Dict[str, Any]]:
    """Every declared text pair, measured. This is the evidence for G3."""
    report = []
    for pair in TEXT_PAIRS:
        ratio = contrast_ratio(palette[pair["fg"]], palette[pair["bg"]])
        report.append(
            {
                "name": pair["name"],
                "foreground": pair["fg"],
                "background": pair["bg"],
                "ratio": ratio,
                "minimum": pair["min"],
                "passes": ratio >= pair["min"],
            }
        )
    return report


def design_system(spec: Dict[str, Any]) -> Dict[str, Any]:
    """product.spec -> design.system"""
    features = [item["title"] for item in spec["sections"]["features"]["items"]]
    components = [
        {"name": "SkipLink", "role": "accessibility", "covers": []},
        {"name": "SiteHeader", "role": "navigation", "covers": []},
        {"name": "Hero", "role": "landing", "covers": []},
        {"name": "FeatureCard", "role": "content", "covers": features},
        {"name": "StepList", "role": "content", "covers": []},
        {"name": "RoadmapPhase", "role": "content", "covers": []},
        {"name": "FaqList", "role": "content", "covers": []},
        {"name": "ClosingLinks", "role": "conversion", "covers": []},
        {"name": "SiteFooter", "role": "navigation", "covers": []},
    ]
    return {
        "tokens": {
            "color": dict(COLOR),
            "font": dict(FONT),
            "space": dict(SPACE),
            "shape": dict(SHAPE),
        },
        "components": components,
        "text_pairs": [dict(pair) for pair in TEXT_PAIRS],
        "contrast": contrast_report(COLOR),
        "layout": {
            "strategy": "single column, content-width wrapper, cards on a grid",
            "breakpoints": {"card_grid": "38rem", "nav_inline": "30rem"},
            "landmarks": ["header", "main", "footer"],
            "focus_visible": True,
            "motion": "none - no animation, nothing to reduce",
        },
    }


def grade_design(design: Dict[str, Any], spec: Dict[str, Any]) -> Quality:
    """Gate G3: WCAG AA on every text pair, plus feature coverage."""
    require(design, DESIGN_CONTRACT, "uiux_designer")

    violations: List[str] = []
    for row in design["contrast"]:
        if not row["passes"]:
            violations.append(
                "%s contrast %.2f is below %.1f"
                % (row["name"], row["ratio"], row["minimum"])
            )

    covered = set()
    for component in design["components"]:
        covered.update(component["covers"])
    features = [item["title"] for item in spec["sections"]["features"]["items"]]
    for feature in features:
        if feature not in covered:
            violations.append("feature %r maps to no component" % feature)

    tokens = design["tokens"]
    referenced = set()
    for pair in design["text_pairs"]:
        referenced.add(pair["fg"])
        referenced.add(pair["bg"])
    unresolved = [name for name in referenced if name not in tokens["color"]]
    for name in unresolved:
        violations.append("token reference %r does not resolve" % name)

    rubric = {
        # proxy: named components with a declared role
        "hierarchy_clarity": min(
            1.0,
            len([c for c in design["components"] if c["role"]])
            / float(len(design["components"])),
        ),
        # proxy: token groups present, target 4 (colour, font, space, shape)
        "token_coherence": min(1.0, len(tokens) / 4.0),
        # proxy: semantic landmarks used instead of anonymous divs
        "layout_semantics": min(
            1.0, len(design["layout"]["landmarks"]) / 3.0
        ),
    }
    return Quality(
        threshold=G3_THRESHOLD,
        rubric=rubric,
        weights=G3_WEIGHTS,
        violations=violations,
    )
