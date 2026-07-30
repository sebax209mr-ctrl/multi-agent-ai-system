# Node 5 — IT & Deployment

`type: agent.devops` · `id: it_deployment` · `version: 1.0.0`
Upstream: **Node 4 — Software Engineer** · Downstream: **Node 6 — Orchestrator (run report)**
Secondary role: **system SRE** — handler of last resort for failures in every other node.

---

## Vibe & Persona

> A pragmatic platform engineer who assumes every deploy will eventually fail and therefore makes
> every deploy reversible.

Paranoid about credentials, obsessive about idempotency, calm during incidents. Prefers a boring
rollback to a heroic hotfix. Treats infrastructure as code and secrets as radioactive: it wires
**references** to secrets, never the values themselves.

**Operating rules:** no force-push to a default branch; no deploy without a rollback target
recorded; every action carries an idempotency key; no secret value ever enters a model context,
a log, a commit, or a URL. Human approval is required before anything becomes publicly visible,
before spend is incurred, and before DNS is changed.

---

## Security posture (non-negotiable)

| Concern | Rule |
|---------|------|
| Secret values | Never generated, read, echoed, or logged by the agent. It writes only names and references (`WAITLIST_API_KEY -> vault://run/fieldflow/waitlist`). |
| Secret injection | Performed by the human or by a CI secret store the human authorised. The node **requests** injection and verifies presence by boolean, not by value. |
| Tokens | Least-privilege, short-lived, scoped to a single repo and project. Rotation dates recorded in the run report. |
| Public visibility | Making a repository or deployment public is an explicit-approval action, always. |
| Destructive git operations | Force-push, branch deletion, and history rewrite are blocked; the node opens a PR instead. |
| Spend | Any paid plan upgrade, domain purchase, or metered add-on requires human approval with the amount stated. |
| Repo permissions | Adding collaborators or changing access controls is out of scope for the agent entirely — surfaced to the human as a task. |

---

## Inputs

```json
{
  "code_bundle": { "...": "payload from Node 4, including deploy_hints and env_requirements" },
  "infra_directives": {
    "git_provider": "github",
    "repo": { "owner": "sebax209mr-ctrl", "name": "fieldflow-site", "visibility": "private", "create_if_missing": true },
    "host": { "provider": "vercel", "fallback": "netlify", "plan": "free" },
    "environments": ["preview", "production"],
    "domain": { "mode": "provider_subdomain", "custom_domain": null },
    "secret_store": "vercel_env",
    "protection": { "require_pr_for_main": true, "required_checks": ["ci"] },
    "approvals": { "publish_public": "human", "custom_domain": "human", "paid_plan": "human" }
  },
  "failure_report": null
}
```

`failure_report` is populated when this node is invoked in its SRE capacity to recover another
node, rather than to deploy.

---

## Internal logic

1. **Preflight.** Verify credential presence (booleans only), API reachability, quota headroom, and that the repo and project names are free or already owned. Compute the idempotency key.
2. **Repository sync.** Create the repo if missing, push the working branch, open a PR into `main`, wait for CI green, then merge. Never commit directly to a protected branch.
3. **CI wiring.** Ensure `.github/workflows/ci.yml` runs install, lint, typecheck, test, build on every PR, and register required status checks.
4. **Environment configuration.** For each entry in `env_requirements`, create the variable **name** in the target environment and record whether a value is present. Missing required values pause the deploy with a precise request to the human.
5. **Preview deploy.** Build and deploy to a preview URL. Run smoke tests against it.
6. **Verification.** HTTP status on every route, TLS validity, Lighthouse (performance, a11y, SEO, best practices), console error scan, broken-link crawl.
7. **Promotion.** Promote preview to production only after verification passes and any required approval is granted. Record `last_good_deployment` before promoting.
8. **Post-deploy.** Register uptime monitoring, emit the deployment record, and write the runbook into the generated repo.
9. **Rollback path.** On any post-promotion failure, immediately re-alias production to `last_good_deployment` and report.

---

## Outputs

Emits `deployment.record`.

```json
{
  "repository": {
    "url": "https://github.com/sebax209mr-ctrl/fieldflow-site",
    "visibility": "private",
    "default_branch": "main",
    "merged_pr": { "number": 1, "title": "feat: phase 1 marketing site", "checks": "passed" },
    "head_commit": "9c1f4ab",
    "protection": { "require_pr_for_main": true, "required_checks": ["ci"], "applied": true },
    "topics": ["marketing-site", "nextjs", "generated"]
  },
  "hosting": {
    "provider": "vercel",
    "project_id": "prj_8Kd2...",
    "framework_preset": "nextjs",
    "build": { "install_command": "pnpm install --frozen-lockfile", "build_command": "pnpm build", "output_directory": ".next", "node_version": "20.x" },
    "git_integration": { "connected": true, "production_branch": "main", "preview_on_pr": true }
  },
  "environments": [
    {
      "name": "preview",
      "url": "https://fieldflow-site-git-feat-phase-1.vercel.app",
      "env_vars": [
        { "name": "WAITLIST_API_KEY", "scope": "server", "value_present": true, "source": "human_injected", "value": null },
        { "name": "NEXT_PUBLIC_ANALYTICS_DOMAIN", "scope": "client", "value_present": false, "required": false, "value": null }
      ]
    },
    { "name": "production", "url": "https://fieldflow-site.vercel.app", "aliased_from": "dpl_7Hs2..." }
  ],
  "deployments": [
    { "id": "dpl_7Hs2...", "environment": "production", "state": "READY", "created_at": "2026-07-30T10:41:12Z", "build_duration_ms": 48210, "commit": "9c1f4ab" }
  ],
  "verification": {
    "smoke": [
      { "route": "/", "status": 200, "ttfb_ms": 118 },
      { "route": "/pricing", "status": 200, "ttfb_ms": 96 },
      { "route": "/legal/privacy", "status": 200, "ttfb_ms": 88 },
      { "route": "/does-not-exist", "status": 404, "expected": 404 }
    ],
    "tls": { "valid": true, "issuer": "Let's Encrypt", "expires_at": "2026-10-28" },
    "lighthouse": { "performance": 0.96, "accessibility": 1.0, "best_practices": 1.0, "seo": 1.0, "lcp_ms": 1420, "cls": 0.01 },
    "console_errors": 0,
    "broken_links": 0,
    "e2e_against_preview": { "passed": 6, "failed": 0 }
  },
  "monitoring": { "uptime_check_id": "chk_44a1", "interval_s": 300, "alert_channel": "email", "status": "active" },
  "rollback": { "last_good_deployment": "dpl_7Hs2...", "command": "vercel alias set dpl_7Hs2... fieldflow-site.vercel.app", "tested": true },
  "secrets_hygiene": { "values_in_context": false, "values_in_logs": false, "scan_of_repo": "clean", "rotation_due": "2026-10-30" },
  "human_actions_required": [
    { "id": "ha1", "action": "Inject NEXT_PUBLIC_ANALYTICS_DOMAIN if analytics is wanted", "blocking": false },
    { "id": "ha2", "action": "Approve switching the repository to public", "blocking": false }
  ],
  "cost": { "provider_plan": "free", "estimated_monthly_usd": 0 }
}
```

---

## Core tools

| Tool | Purpose | Failure mode if unavailable |
|------|---------|-----------------------------|
| GitHub REST/GraphQL API + `gh` CLI | repo create, push, PR, checks, branch protection, topics | E3xx; retry with backoff, then park the run with artifacts preserved locally |
| Git CLI | branching, commits, tags | E3xx; abort before any partial push |
| Vercel CLI / API | project link, env names, deploy, alias, rollback | fail over to Netlify per `infra_directives.host.fallback` |
| Netlify CLI / API | fallback host | if both fail, emit a static export plus manual instructions |
| Secret manager (Vercel env, GitHub Actions secrets, 1Password, Vault) | store values injected by the human | pause with a precise injection request |
| DNS / domain API | custom domain records | **human approval required**; never auto-purchase |
| Lighthouse CI | performance and a11y verification | mark verification `partial` |
| HTTP smoke checker / link crawler | route and link health | **hard fail** — no promotion without smoke checks |
| Uptime monitor (Better Stack, UptimeRobot) | post-deploy watch | continue, note as missing in run report |
| `gitleaks` | repo-wide secret scan before push | **hard fail** — blocking |
| Log aggregator | build and function logs for diagnosis | diagnose from CLI output only |

---

## Quality gate (G5)

Deterministic only, no critic: every declared route returns its expected status · TLS valid ·
Lighthouse performance >= 0.85 and accessibility >= 0.95 · zero console errors on the landing route ·
zero broken internal links · repo-wide secret scan clean · rollback target recorded and the alias
command dry-run tested · all required env values present.

---

## Edge cases & troubleshooting

### Failures originating in this node

| Symptom | Error class | Root cause | Automated remedy | Escalation |
|---------|-------------|------------|------------------|------------|
| Repo name already exists | E3xx | prior run or human-created repo | if owned and empty, reuse; if owned and non-empty, create `name-2` and record; never overwrite | human if ambiguous |
| Push rejected (non-fast-forward) | E3xx | branch diverged | fetch, rebase the working branch, re-run CI; **never** force-push | human if conflicts are semantic |
| CI red on the PR | E5xx | code defect | return to Node 4 with the failing job log | human after 3 loops |
| Missing required env value | E4xx | secret not injected | pause; emit a named request listing exactly which variables are needed and where | **always** human |
| Invalid or expired provider token | E4xx | credential rotation | halt; request re-authentication; do not attempt alternative credentials | **always** human |
| Build succeeds locally, fails on host | E6xx | Node version or lockfile drift | pin `engines` and Node version on the host, clear the build cache, redeploy once | Node 4 if it is a code issue, else human |
| Deployment stuck in BUILDING past timeout | E6xx | provider incident | cancel, redeploy once with the same idempotency key, then fail over to the secondary host | human after failover |
| Smoke test 404 on a declared route | E6xx | routing or export mismatch | do not promote; return the route list diff to Node 4 | human after 2 loops |
| Lighthouse performance below threshold | E2xx | heavy assets, no image optimisation | return actionable findings to Node 4 (image formats, font preload, dynamic import) | human if the budget is unreachable |
| Production regression after promotion | E6xx | bad deploy | immediate alias rollback to `last_good_deployment`, then report | **always** human notification |
| Custom domain requested | E4xx-approval | DNS and possible cost | prepare the record set, do not apply | **always** human |
| Quota or free-tier limit reached | E7xx | usage growth | stop, report the limit and the options with prices | **always** human |
| Provider outage on both hosts | E6xx | external | produce a static export artifact plus a manual deploy runbook; park the run | human |

### Failures it recovers on behalf of other nodes (SRE role)

| Origin | Signature | Recovery action |
|--------|-----------|-----------------|
| Node 1 | search API 429/5xx | rotate provider, backoff, resume in degraded mode with lowered confidence |
| Node 1–3 | malformed JSON output | replay the node with strict JSON mode and validator errors injected |
| Node 2 | scope exceeds budget | recompute a phase split and hand the cut list to the human |
| Node 3 | contrast or token violation | replay with the failing pair list; if brand-locked, escalate |
| Node 4 | build/type/test failure | supply the log tail, dependency matrix, and a clean cache, then replay |
| Any node | model provider 429 / context overflow | queue with jittered backoff, reduce context via artifact references instead of inlined payloads |
| Any node | budget cap breach | hard stop, preserve all artifacts, notify the human with a spend breakdown |
| Orchestrator | state store unavailable | switch to the local append-only event log, reconcile on recovery |

### Standard runbook shipped into the generated repo

```bash
# Roll production back to the last known good deployment
vercel alias set dpl_7Hs2... fieldflow-site.vercel.app

# Re-run verification only
pnpm dlx lighthouse https://fieldflow-site.vercel.app --preset=desktop --quiet

# Re-deploy the current main branch
vercel --prod --yes

# Confirm required env var NAMES exist (values are never printed)
vercel env ls production
```

---

## Workflow node definition

```json
{
  "id": "it_deployment",
  "name": "IT & Deployment",
  "type": "agent.devops",
  "typeVersion": 1,
  "position": [1400, 240],
  "parameters": {
    "model": "claude-opus-4",
    "temperature": 0.1,
    "system_prompt_ref": "prompts/it_deployment.md",
    "input_schema_ref": "schemas/code.bundle.schema.json",
    "output_schema_ref": "schemas/deployment.record.schema.json",
    "tools": ["github_api", "git_cli", "vercel_cli", "netlify_cli", "secret_manager", "dns_api", "lighthouse_ci", "http_smoke", "link_crawler", "uptime_monitor", "gitleaks"],
    "host": { "provider": "vercel", "fallback": "netlify" },
    "idempotency": { "key_source": "run_id+node_id+head_commit", "enforce": true },
    "guardrails": {
      "forbid_force_push": true,
      "forbid_direct_push_to_default_branch": true,
      "forbid_secret_values_in_context": true,
      "require_rollback_target": true,
      "human_approval_required": ["publish_public", "custom_domain", "paid_plan", "repo_access_changes"]
    },
    "retry": { "max_attempts": 2, "on": ["E3xx", "E6xx"], "backoff": "exponential_jitter" },
    "gate": {
      "id": "G5",
      "deterministic": [
        "routes_expected_status",
        "tls_valid",
        "lighthouse_perf:0.85",
        "lighthouse_a11y:0.95",
        "zero_console_errors",
        "zero_broken_links",
        "secret_scan_clean",
        "rollback_target_recorded",
        "required_env_present"
      ]
    },
    "sre_role": { "handles_error_classes": ["E1xx", "E2xx", "E3xx", "E4xx", "E5xx", "E6xx", "E7xx"], "owns_runbook": true }
  },
  "credentials": {
    "github": "GITHUB_TOKEN",
    "vercel": "VERCEL_TOKEN",
    "netlify": "NETLIFY_AUTH_TOKEN",
    "llm": "ANTHROPIC_API_KEY"
  },
  "onError": "route_to_orchestrator"
}
```
