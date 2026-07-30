# Node 4 — Software Engineer

`type: agent.engineering` · `id: software_engineer` · `version: 1.0.0`
Upstream: **Node 2 (specs)** + **Node 3 (design system)** · Downstream: **Node 5 — IT & Deployment**

---

## Vibe & Persona

> A senior full-stack engineer who has been on call. Boring, readable, well-tested code beats
> clever code every single time.

Writes small modules with single responsibilities, types everything, and treats the design tokens
as the only source of styling truth. Never invents a requirement; if the spec is ambiguous it raises
a question rather than guessing. Runs the build before claiming success — output is only valid if
`install`, `lint`, `typecheck`, `test` and `build` all exit zero.

**Operating rules:** no hard-coded colours, no secrets in source, no dependency added without a
reason recorded in `deps_rationale`, no component over ~150 lines, every story has at least one
test that maps to its acceptance criteria.

---

## Inputs

```json
{
  "product_spec": { "...": "payload from Node 2" },
  "design_system": { "...": "payload from Node 3" },
  "engineering_directives": {
    "stack": "nextjs_app_router",
    "language": "typescript",
    "styling": "tailwind_with_css_variables",
    "package_manager": "pnpm",
    "node_version": "20.x",
    "testing": { "unit": "vitest", "e2e": "playwright" },
    "phase": "ph1",
    "repo": { "owner": "sebax209mr-ctrl", "name": "fieldflow-site", "visibility": "public", "default_branch": "main" },
    "constraints": { "max_bundle_kb_js": 120, "no_client_state_libraries": true }
  },
  "rework_context": {
    "attempt": 1,
    "previous_errors": [],
    "build_log_tail": null
  }
}
```

`rework_context` is how the Orchestrator closes the loop: on a failed build, the log tail and the
parsed error list are injected here rather than restarting the node from scratch.

---

## Internal logic

1. **Plan the file tree.** Derive modules directly from `component_hierarchy` and `site_map`. One file per component, colocated tests.
2. **Generate tokens first.** Compile `design.system.tokens` into `src/styles/tokens.css` and the Tailwind theme extension. Nothing downstream may use a literal colour.
3. **Build bottom-up.** Atoms, then molecules, then organisms, then routes. Each layer compiles before the next is written.
4. **Wire the routes.** Implement each `site_map` entry with metadata, semantic landmarks, and the specified primary CTA.
5. **Tests from acceptance criteria.** Translate each Gherkin criterion into a unit or Playwright test, tagged with the story id.
6. **Verify locally.** Run the toolchain. On failure, self-repair up to the configured attempt limit before reporting.
7. **Repository shaping.** Emit `README.md`, `.env.example` (names only), `.gitignore`, CI workflow, and `docs/` copies of the PM and design artifacts.
8. **Emit the bundle.** File list with hashes, a traceability matrix, and deployment hints for Node 5.

---

## Outputs

Emits `code.bundle`.

```json
{
  "stack": {
    "framework": "next@14.2",
    "language": "typescript@5.4",
    "styling": "tailwindcss@3.4 + css custom properties",
    "package_manager": "pnpm@9",
    "node_version": "20.x",
    "deps_rationale": [
      { "package": "zod", "reason": "runtime validation of the waitlist form payload" },
      { "package": "lucide-react", "reason": "icon set specified by the design system" }
    ]
  },
  "repository": {
    "owner": "sebax209mr-ctrl",
    "name": "fieldflow-site",
    "visibility": "public",
    "default_branch": "main",
    "working_branch": "feat/phase-1-marketing-site",
    "commit_strategy": "conventional_commits",
    "commits": [
      { "message": "chore: scaffold next app with tokens pipeline", "files": 14 },
      { "message": "feat(ui): add Button, TextField, Heading atoms", "files": 9 },
      { "message": "feat(marketing): add hero, usp grid and waitlist sections", "files": 11 },
      { "message": "test: cover story s1 and s2 acceptance criteria", "files": 6 }
    ]
  },
  "files": [
    { "path": "src/styles/tokens.css", "purpose": "generated CSS variables", "generated_from": "design.system.tokens", "bytes": 3120, "sha256": "a91f..." },
    { "path": "src/components/Button/Button.tsx", "purpose": "atom", "implements": "c.button", "bytes": 1840, "sha256": "77bd..." },
    { "path": "src/components/WaitlistForm/WaitlistForm.tsx", "purpose": "molecule", "implements": "c.waitlistForm", "traces_to": ["s2"] },
    { "path": "src/app/page.tsx", "purpose": "route /", "traces_to": ["s1"] },
    { "path": "tests/e2e/waitlist.spec.ts", "purpose": "e2e", "traces_to": ["s2"] },
    { "path": ".env.example", "purpose": "declares required env var NAMES only, never values" },
    { "path": ".github/workflows/ci.yml", "purpose": "lint, typecheck, test, build on push and PR" }
  ],
  "verification": {
    "install": { "exit_code": 0, "duration_ms": 21400 },
    "lint": { "exit_code": 0, "errors": 0, "warnings": 2 },
    "typecheck": { "exit_code": 0, "errors": 0 },
    "test": { "exit_code": 0, "passed": 18, "failed": 0, "coverage_pct": 84 },
    "build": { "exit_code": 0, "routes_built": 5 },
    "bundle": { "first_load_js_kb": 96, "budget_kb": 120, "within_budget": true },
    "secret_scan": { "tool": "gitleaks", "findings": 0 }
  },
  "env_requirements": [
    { "name": "WAITLIST_API_KEY", "purpose": "server-side waitlist provider call", "required": true, "scope": "server", "value": null },
    { "name": "NEXT_PUBLIC_ANALYTICS_DOMAIN", "purpose": "privacy-friendly analytics", "required": false, "scope": "client", "value": null }
  ],
  "traceability": [
    { "story_id": "s1", "files": ["src/app/page.tsx", "src/components/Hero/Hero.tsx"], "tests": ["tests/unit/hero.test.tsx", "tests/e2e/landing.spec.ts"] },
    { "story_id": "s2", "files": ["src/components/WaitlistForm/WaitlistForm.tsx", "src/app/api/waitlist/route.ts"], "tests": ["tests/e2e/waitlist.spec.ts"] }
  ],
  "deploy_hints": {
    "framework_preset": "nextjs",
    "install_command": "pnpm install --frozen-lockfile",
    "build_command": "pnpm build",
    "output_directory": ".next",
    "node_version": "20.x",
    "routes": ["/", "/pricing", "/how-it-works", "/about", "/legal/privacy"],
    "required_env": ["WAITLIST_API_KEY"]
  },
  "open_questions": []
}
```

### Code conventions it enforces

```tsx
// src/components/Button/Button.tsx — atom implementing c.button
import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
}

const variantClass: Record<Variant, string> = {
  primary: "bg-action-primary text-action-primary-fg hover:bg-action-primary-hover",
  secondary: "border border-subtle text-primary hover:bg-surface",
  ghost: "text-primary hover:bg-surface",
};

const sizeClass: Record<Size, string> = {
  sm: "min-h-11 px-3 text-sm",
  md: "min-h-11 px-4 text-base",
  lg: "min-h-12 px-6 text-lg",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", isLoading = false, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      aria-busy={isLoading || undefined}
      disabled={isLoading || rest.disabled}
      className={cn(
        "inline-flex items-center justify-center rounded-md font-medium",
        "transition-colors duration-fast motion-reduce:transition-none",
        "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus focus-visible:ring-offset-2",
        "disabled:opacity-60 disabled:cursor-not-allowed",
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
```

Note what is **absent**: no hex values, no magic numbers for touch targets (`min-h-11` = 44px from
the token), reduced-motion handled, focus ring from the token, loading state exposed to assistive
technology.

---

## Core tools

| Tool | Purpose | Failure mode if unavailable |
|------|---------|-----------------------------|
| Filesystem / code sandbox (E2B, Docker, local runner) | write files and run the toolchain | **hard fail** — unverified code must never reach Node 5 |
| Package manager (pnpm/npm) | install and lock dependencies | fail with E5xx; retry with cache cleared |
| Linter + formatter (ESLint, Prettier) | style and correctness | continue with reduced score |
| Type checker (`tsc --noEmit`) | type safety | **hard fail** on errors |
| Test runners (Vitest, Playwright) | verify acceptance criteria | if Playwright browsers cannot install, degrade to unit tests only and flag |
| Bundler / build (`next build`) | prove it compiles | **hard fail** |
| `gitleaks` / `trufflehog` | prove no secrets in the diff | **hard fail** — blocking |
| Lighthouse CI (local) | pre-deploy performance signal | skip, defer to Node 5 |
| Git CLI | branch, commit, tag (push is Node 5 territory) | fail with E3xx |
| Token transformer | tokens.css and Tailwind theme generation | generate manually from token JSON |

---

## Quality gate (G4)

Deterministic: all five toolchain steps exit 0 · zero type errors · zero lint errors · secret scan
clean · bundle within budget · every story in the phase has >= 1 passing test tagged with its id ·
no literal hex or px values outside `tokens.css` · every component in the design hierarchy for this
phase exists as a file.

Critic rubric: modularity 0.3 · readability 0.2 · spec coverage 0.3 · a11y markup 0.2. **Threshold 0.85.**

---

## Edge cases & troubleshooting

| Symptom | Error class | Root cause | Automated remedy | Escalation |
|---------|-------------|------------|------------------|------------|
| Build fails on unresolved import | E5xx | hallucinated module or wrong path | parse the error, resolve or create the missing module, rebuild; `rework_context` carries the log tail | after 3 attempts, human with full log + diff |
| Type errors after generation | E5xx | loose typing | run `tsc`, feed diagnostics back, fix narrowly (never `any`) | 3 attempts, then human |
| Dependency version conflict / peer error | E5xx | unpinned deps | pin to a known-good matrix, clear store, reinstall | human if conflict is structural |
| Package does not exist (typosquat risk) | E4xx | hallucinated dependency | reject the dependency, reimplement with stdlib or an allowlisted package; never install an unverified lookalike | **always** human review |
| Secret found in diff | E4xx | key inlined instead of env reference | abort commit, strip the value, replace with `process.env` reference, rotate advice to human | **always** human |
| Tests pass but a criterion is untested | E2xx | coverage gap | traceability check generates the missing test | human if the criterion is untestable in code |
| Bundle exceeds budget | E2xx | heavy dependency or unsplit route | remove the dependency, dynamic-import, tree-shake, re-measure | human if the feature genuinely needs it |
| Playwright browser download blocked | E3xx | sandbox network policy | run unit tests only, mark e2e `deferred_to_node_5` | flag in run report |
| Spec is ambiguous | E8xx | genuine unknown | do not guess; emit `open_questions` and pause the branch | always human |
| Design token missing for a needed value | E1xx | design gap | request a token from Node 3 via the Orchestrator rather than inventing one | human if Node 3 loops twice |
| Sandbox timeout on install/build | E3xx | cold cache, slow network | retry once with a warmed cache and a longer timeout | human after 2 |
| Generated code exceeds context to review | n/a | large phase | split into per-commit sub-batches; each batch verified independently | none |

---

## Workflow node definition

```json
{
  "id": "software_engineer",
  "name": "Software Engineer",
  "type": "agent.engineering",
  "typeVersion": 1,
  "position": [1120, 240],
  "parameters": {
    "model": "claude-opus-4",
    "temperature": 0.2,
    "max_output_tokens": 32000,
    "system_prompt_ref": "prompts/software_engineer.md",
    "input_schema_refs": ["schemas/product.spec.schema.json", "schemas/design.system.schema.json"],
    "output_schema_ref": "schemas/code.bundle.schema.json",
    "tools": ["code_sandbox", "package_manager", "eslint", "tsc", "vitest", "playwright", "next_build", "gitleaks", "git_cli", "token_transformer"],
    "stack": "nextjs_app_router",
    "budgets": { "max_bundle_kb_js": 120, "max_component_lines": 150 },
    "self_repair": { "max_attempts": 3, "strategy": "inject_build_log_tail" },
    "retry": { "max_attempts": 3, "on": ["E1xx", "E2xx", "E3xx", "E5xx"], "backoff": "exponential_jitter" },
    "gate": {
      "id": "G4",
      "threshold": 0.85,
      "deterministic": [
        "install_exit_0",
        "lint_exit_0",
        "typecheck_exit_0",
        "test_exit_0",
        "build_exit_0",
        "secret_scan_clean",
        "bundle_within_budget",
        "story_test_coverage",
        "no_literal_style_values"
      ],
      "rubric": { "modularity": 0.3, "readability": 0.2, "spec_coverage": 0.3, "a11y_markup": 0.2 }
    }
  },
  "credentials": { "llm": "ANTHROPIC_API_KEY", "sandbox": "SANDBOX_API_KEY" },
  "onError": "route_to_orchestrator"
}
```
