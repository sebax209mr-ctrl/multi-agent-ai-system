# Node 3 — UI/UX Designer

`type: agent.design` · `id: uiux_designer` · `version: 1.0.0`
Upstream: **Node 2 — Product Manager** · Downstream: **Node 4 — Software Engineer**

---

## Vibe & Persona

> A systems designer who thinks in tokens and components, not screens. Accessibility is a
> constraint, not a nice-to-have, and taste is expressed through restraint.

Produces a design **system**, never a picture. Everything is a named token or a named component
with defined states. It designs mobile-first, checks contrast before it commits a palette, and
writes wireframes as semantic structure so an engineer can implement them without guessing.

**Operating rules:** no raw hex values outside the primitive layer; every colour used for text is
verified against WCAG 2.2 AA; every interactive component defines default, hover, focus-visible,
active, disabled, loading and error states; every section in the PM site map maps to at least one
component.

---

## Inputs

```json
{
  "product_spec": { "...": "full product.spec payload from Node 2" },
  "brand_inputs": {
    "tone_of_voice": ["plain-spoken", "respectful of skilled trades", "zero hype"],
    "logo_asset_url": null,
    "seed_color": null,
    "reference_urls": ["https://..."],
    "must_avoid": ["gradient-heavy hero", "stock photos of people in suits"]
  },
  "technical_constraints": {
    "framework": "nextjs",
    "styling": "css_variables_plus_tailwind",
    "dark_mode": true,
    "icon_set": "lucide",
    "font_hosting": "self_hosted_woff2",
    "a11y_target": "WCAG_2_2_AA"
  }
}
```

---

## Internal logic

1. **Read the jobs, not the vibes.** Derive layout priority from the primary CTA and persona device mix in the spec.
2. **Palette derivation.** Pick a primitive ramp (11 steps per hue), then map primitives to **semantic** tokens. Verify every text/background pair; auto-shift lightness until AA passes.
3. **Type scale.** Choose a modular scale (1.200 minor third for dense trade audiences), clamp fluid sizes, set line-heights by role.
4. **Component inventory.** Walk the site map, extract every section, and reduce to the smallest set of atoms, molecules and organisms that covers all of it.
5. **State matrix.** For each interactive component, define all seven states plus reduced-motion behaviour.
6. **Semantic wireframes.** Express each route as a landmark tree (`header` / `main` / `section` / `footer`) with grid placement and responsive behaviour at each breakpoint.
7. **Accessibility audit.** Contrast report, focus order, target sizes (>= 44px for the van-and-gloves persona), motion preferences.
8. **Handoff.** Emit tokens as JSON in W3C design-token shape plus a generated `tokens.css`, so Node 4 consumes machine-readable values only.

---

## Outputs

Emits `design.system`.

### Design tokens

```json
{
  "meta": { "name": "FieldFlow Design System", "version": "1.0.0", "format": "w3c-design-tokens-draft" },
  "color": {
    "primitive": {
      "slate": { "50": "#f8fafc", "100": "#f1f5f9", "300": "#cbd5e1", "500": "#64748b", "700": "#334155", "900": "#0f172a" },
      "amber": { "100": "#fef3c7", "400": "#fbbf24", "500": "#f59e0b", "600": "#d97706", "700": "#b45309" },
      "teal": { "100": "#ccfbf1", "500": "#14b8a6", "600": "#0d9488", "700": "#0f766e" },
      "red": { "100": "#fee2e2", "600": "#dc2626", "700": "#b91c1c" }
    },
    "semantic": {
      "bg.canvas": { "value": "{color.primitive.slate.50}", "onDark": "{color.primitive.slate.900}" },
      "bg.surface": { "value": "#ffffff", "onDark": "{color.primitive.slate.700}" },
      "text.primary": { "value": "{color.primitive.slate.900}", "onDark": "{color.primitive.slate.50}", "contrast_on_canvas": 15.8 },
      "text.secondary": { "value": "{color.primitive.slate.700}", "onDark": "{color.primitive.slate.300}", "contrast_on_canvas": 9.2 },
      "action.primary.bg": { "value": "{color.primitive.amber.600}", "contrast_with_action_primary_fg": 5.1 },
      "action.primary.fg": { "value": "#ffffff" },
      "action.primary.bg.hover": { "value": "{color.primitive.amber.700}" },
      "action.secondary.bg": { "value": "transparent" },
      "action.secondary.border": { "value": "{color.primitive.slate.300}" },
      "accent": { "value": "{color.primitive.teal.600}" },
      "feedback.error": { "value": "{color.primitive.red.700}", "contrast_on_canvas": 6.4 },
      "focus.ring": { "value": "{color.primitive.teal.600}", "width": "3px", "offset": "2px" },
      "border.subtle": { "value": "{color.primitive.slate.300}" }
    }
  },
  "typography": {
    "family": {
      "sans": { "value": "\"Inter Variable\", system-ui, sans-serif", "hosting": "self", "subset": "latin", "display": "swap" },
      "mono": { "value": "\"JetBrains Mono\", ui-monospace, monospace" }
    },
    "scale": {
      "ratio": 1.2,
      "base_px": 16,
      "size": {
        "xs": "clamp(0.75rem, 0.74rem + 0.05vw, 0.80rem)",
        "sm": "clamp(0.875rem, 0.86rem + 0.08vw, 0.9375rem)",
        "base": "clamp(1rem, 0.98rem + 0.10vw, 1.0625rem)",
        "lg": "clamp(1.20rem, 1.15rem + 0.25vw, 1.35rem)",
        "xl": "clamp(1.44rem, 1.34rem + 0.50vw, 1.75rem)",
        "2xl": "clamp(1.73rem, 1.55rem + 0.90vw, 2.30rem)",
        "3xl": "clamp(2.07rem, 1.75rem + 1.60vw, 3.05rem)"
      }
    },
    "weight": { "regular": 400, "medium": 500, "semibold": 600, "bold": 700 },
    "line_height": { "tight": 1.15, "snug": 1.3, "normal": 1.55, "relaxed": 1.7 },
    "letter_spacing": { "tight": "-0.02em", "normal": "0", "wide": "0.04em" },
    "role": {
      "display": { "size": "{typography.scale.size.3xl}", "weight": 700, "line_height": 1.15, "letter_spacing": "-0.02em" },
      "h2": { "size": "{typography.scale.size.2xl}", "weight": 600, "line_height": 1.2 },
      "body": { "size": "{typography.scale.size.base}", "weight": 400, "line_height": 1.55 },
      "label": { "size": "{typography.scale.size.sm}", "weight": 500, "line_height": 1.3 }
    }
  },
  "space": { "0": "0", "1": "0.25rem", "2": "0.5rem", "3": "0.75rem", "4": "1rem", "6": "1.5rem", "8": "2rem", "12": "3rem", "16": "4rem", "24": "6rem" },
  "radius": { "none": "0", "sm": "0.25rem", "md": "0.5rem", "lg": "0.75rem", "pill": "9999px" },
  "shadow": { "sm": "0 1px 2px rgb(15 23 42 / 0.08)", "md": "0 4px 12px rgb(15 23 42 / 0.10)", "focus": "0 0 0 3px rgb(13 148 136 / 0.45)" },
  "breakpoint": { "sm": "390px", "md": "768px", "lg": "1024px", "xl": "1280px" },
  "motion": {
    "duration": { "instant": "80ms", "fast": "160ms", "base": "240ms" },
    "easing": { "standard": "cubic-bezier(0.2, 0, 0, 1)", "emphasised": "cubic-bezier(0.3, 0, 0, 1)" },
    "reduced_motion": "disable_transform_animations_keep_opacity"
  },
  "target": { "min_touch_size": "44px" },
  "z_index": { "base": 0, "sticky": 100, "overlay": 400, "toast": 600 }
}
```

### Component hierarchy

```json
{
  "component_hierarchy": {
    "atoms": [
      { "id": "c.button", "name": "Button", "variants": ["primary", "secondary", "ghost"], "sizes": ["sm", "md", "lg"], "states": ["default", "hover", "focus-visible", "active", "disabled", "loading"], "tokens_used": ["action.primary.bg", "radius.md", "space.4", "target.min_touch_size"], "a11y": { "role": "button", "min_target": "44px", "focus_ring": "focus.ring" } },
      { "id": "c.input", "name": "TextField", "states": ["default", "focus-visible", "error", "disabled"], "a11y": { "label_required": true, "error_link": "aria-describedby", "invalid": "aria-invalid" } },
      { "id": "c.icon", "name": "Icon", "source": "lucide", "a11y": { "decorative_default": true, "requires_label_if_interactive": true } },
      { "id": "c.badge", "name": "Badge", "variants": ["neutral", "accent"] },
      { "id": "c.heading", "name": "Heading", "props": { "level": [1, 2, 3, 4], "role_token": "display|h2" } }
    ],
    "molecules": [
      { "id": "c.waitlistForm", "name": "WaitlistForm", "composes": ["c.input", "c.button"], "states": ["idle", "submitting", "success", "error"], "a11y": { "live_region": "polite", "focus_on_error": true }, "maps_to_story": "s2" },
      { "id": "c.uspCard", "name": "UspCard", "composes": ["c.icon", "c.heading"], "maps_to_usp": ["u1", "u2", "u3"] },
      { "id": "c.pricingTier", "name": "PricingTier", "composes": ["c.badge", "c.button"], "variants": ["default", "highlighted"] },
      { "id": "c.stepItem", "name": "StepItem", "composes": ["c.icon", "c.heading"] },
      { "id": "c.navLink", "name": "NavLink", "states": ["default", "current", "focus-visible"] }
    ],
    "organisms": [
      { "id": "c.siteHeader", "name": "SiteHeader", "composes": ["c.navLink", "c.button"], "behaviour": { "mobile": "disclosure_menu", "desktop": "inline_nav" }, "landmark": "banner" },
      { "id": "c.hero", "name": "Hero", "composes": ["c.heading", "c.button"], "maps_to_story": "s1", "constraint": "headline + subhead + CTA above the fold at 390x844" },
      { "id": "c.uspGrid", "name": "UspGrid", "composes": ["c.uspCard"], "layout": { "sm": "1col", "md": "3col" } },
      { "id": "c.howItWorks", "name": "HowItWorks", "composes": ["c.stepItem"] },
      { "id": "c.waitlistSection", "name": "WaitlistSection", "composes": ["c.waitlistForm"] },
      { "id": "c.siteFooter", "name": "SiteFooter", "composes": ["c.navLink"], "landmark": "contentinfo" },
      { "id": "c.consentBanner", "name": "ConsentBanner", "composes": ["c.button"], "a11y": { "role": "dialog", "focus_trap": false, "dismissible": true } }
    ],
    "templates": [
      { "id": "t.marketing", "name": "MarketingPage", "slots": ["header", "main", "footer"] },
      { "id": "t.legal", "name": "LegalPage", "slots": ["header", "prose", "footer"] }
    ]
  }
}
```

### Semantic wireframe

Layouts are emitted as landmark trees, not images.

```json
{
  "wireframes": [
    {
      "route": "/",
      "template": "t.marketing",
      "grid": { "columns": { "sm": 4, "md": 8, "lg": 12 }, "gutter": "{space.4}", "max_width": "1200px" },
      "regions": [
        { "landmark": "banner", "component": "c.siteHeader", "sticky": true, "z": "{z_index.sticky}" },
        {
          "landmark": "main",
          "sections": [
            { "id": "hero", "component": "c.hero", "order": 1, "span": { "sm": 4, "lg": 7 }, "content_slots": ["headline", "subhead", "primary_cta", "trust_line"], "traces_to": "s1" },
            { "id": "problem", "component": "c.howItWorks", "order": 2, "span": { "sm": 4, "lg": 10 }, "content_slots": ["problem_statement", "three_pains"] },
            { "id": "three_usps", "component": "c.uspGrid", "order": 3, "span": { "sm": 4, "lg": 12 }, "content_slots": ["usp_1", "usp_2", "usp_3"] },
            { "id": "waitlist", "component": "c.waitlistSection", "order": 4, "span": { "sm": 4, "lg": 6 }, "traces_to": "s2" }
          ]
        },
        { "landmark": "contentinfo", "component": "c.siteFooter" }
      ],
      "focus_order": ["skip_link", "c.siteHeader", "hero.primary_cta", "sections...", "c.siteFooter"],
      "responsive_notes": [
        "Below md, navigation collapses to a disclosure button with aria-expanded",
        "Hero image is decorative and hidden below md to protect LCP"
      ]
    }
  ],
  "accessibility": {
    "contrast_report": [
      { "pair": "text.primary on bg.canvas", "ratio": 15.8, "passes": "AAA" },
      { "pair": "action.primary.fg on action.primary.bg", "ratio": 5.1, "passes": "AA" },
      { "pair": "text.secondary on bg.surface", "ratio": 9.2, "passes": "AAA" }
    ],
    "skip_link": true,
    "reduced_motion_respected": true,
    "min_target_size_px": 44,
    "heading_outline_valid": true
  },
  "handoff_notes": [
    "Generate tokens.css from the token JSON at build time; do not hand-write hex values",
    "All icons decorative unless the icon is the only content of a control"
  ]
}
```

---

## Core tools

| Tool | Purpose | Failure mode if unavailable |
|------|---------|-----------------------------|
| Contrast / WCAG calculator | verify every text-background pair | **hard fail** — never ship an unverified palette |
| Token transformer (Style Dictionary / `tokens.css` generator) | convert token JSON to CSS variables and Tailwind theme | emit JSON only; Node 4 generates CSS instead, flag `degraded` |
| Font metadata / licence check (Google Fonts, Fontsource) | confirm the font is self-hostable and licensed | fall back to a system font stack |
| Icon set registry (Lucide / Phosphor) | resolve icon names that actually exist | replace unknown icons with a documented fallback |
| Reference layout analyser (URL fetch) | learn conventions from reference URLs | proceed from principles only |
| Screenshot / visual diff (Playwright) — optional | compare rendered result to intended layout, feeds back to Node 4 | skip visual regression gate |

---

## Quality gate (G3)

Deterministic: token JSON valid and every alias resolves · zero raw hex outside `color.primitive` ·
all text pairs >= 4.5:1 (>= 3:1 for large text) · every site-map section maps to >= 1 component ·
every interactive component defines focus-visible · heading outline has no skipped levels ·
touch targets >= 44px · exactly one `h1` per route.

Critic rubric: hierarchy clarity 0.4 · token coherence 0.3 · layout semantics 0.3. **Threshold 0.85.**

---

## Edge cases & troubleshooting

| Symptom | Error class | Root cause | Automated remedy | Escalation |
|---------|-------------|------------|------------------|------------|
| Contrast ratio below AA | E2xx | palette chosen for looks | auto-shift primitive lightness step by step until AA passes, then re-verify | human if brand colour is locked and cannot pass |
| Token alias does not resolve ("{color.primitive.brand.500}") | E1xx | invented reference | re-emit with the primitive ramp injected into context; strict alias whitelist | human after 2 attempts |
| A PM site-map section has no component | E2xx | coverage gap | run a coverage pass and generate the missing component | human review |
| Raw hex values leaked into component styles | E1xx | shortcut taken | linter strips them and forces token references | rework |
| Font not self-hostable / licence unclear | E4xx | licensing risk | swap to a permissively licensed equivalent with similar metrics | flag licence choice to human |
| Icon name does not exist in the icon set | E3xx | hallucinated icon | map to nearest valid icon, record substitution | none |
| Hero cannot fit above the fold at 390x844 | E2xx | over-stuffed hero | reduce to headline, subhead, one CTA, one trust line | human if content is mandated |
| Dark mode pair fails contrast | E2xx | onDark values untested | generate and verify the dark ramp independently | human |
| Design implies a feature that is out of scope | E2xx | scope creep from design | reject the component; scope is owned by Node 2 | human if the design is genuinely better |
| Layout depends on unavailable imagery | E3xx | missing assets | fall back to typographic or CSS-generated visuals; never block on stock photography | none |

---

## Workflow node definition

```json
{
  "id": "uiux_designer",
  "name": "UI/UX Designer",
  "type": "agent.design",
  "typeVersion": 1,
  "position": [840, 240],
  "parameters": {
    "model": "claude-opus-4",
    "temperature": 0.6,
    "max_output_tokens": 14000,
    "system_prompt_ref": "prompts/uiux_designer.md",
    "input_schema_ref": "schemas/product.spec.schema.json",
    "output_schema_ref": "schemas/design.system.schema.json",
    "tools": ["contrast_calculator", "token_transformer", "font_licence_check", "icon_registry", "url_fetch"],
    "emit_artifacts": ["docs/design-system.md", "src/styles/tokens.css", "design/tokens.json"],
    "a11y_target": "WCAG_2_2_AA",
    "dark_mode": true,
    "retry": { "max_attempts": 2, "on": ["E1xx", "E2xx"], "backoff": "immediate_with_critique" },
    "gate": {
      "id": "G3",
      "threshold": 0.85,
      "deterministic": [
        "token_json_valid",
        "alias_resolution",
        "no_raw_hex_outside_primitives",
        "contrast_aa_all_text_pairs",
        "sitemap_component_coverage",
        "focus_visible_defined",
        "heading_outline_valid",
        "touch_target_min:44"
      ],
      "rubric": { "hierarchy_clarity": 0.4, "token_coherence": 0.3, "layout_semantics": 0.3 }
    }
  },
  "credentials": { "llm": "ANTHROPIC_API_KEY" },
  "onError": "route_to_orchestrator"
}
```
