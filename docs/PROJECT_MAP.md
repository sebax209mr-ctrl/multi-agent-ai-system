# Project map

Three separate things live in this repository and they are easy to mistake for
each other. This page says what each one is, where the boundaries are, and how
the public website gets built and published.

## The three strands

| Strand | What it is | Where it lives | Runtime |
| --- | --- | --- | --- |
| The product | FieldFlow, a scheduling and CRM tool for small service businesses. PoolFlow is the pool-service MVP. | `docs/fieldflow-spec.md`, `poolflow/` | Node 20, Express, SQLite |
| The factory | A six-node agent pipeline that turns a seed topic into a designed, built and deployed website. | `docs/website-factory/`, `workflows/website-factory.workflow.json`, `website_factory/` | Python 3.10+, standard library only |
| The agent sandbox | The original orchestrator and worker experiment, plus the schedule and applicant readers. | `agents/`, `agents.yaml`, `main.py`, `data/` | Python 3.10+ |

The product is the thing customers pay for. The factory is how the marketing
site for it gets produced. The sandbox is where the orchestration patterns were
worked out before they were written down.

## What connects them

The seam is a contract, not an import. Nothing in `website_factory/` imports from
`poolflow/` or from `agents/`, and it never should. What travels between the
strands is a validated JSON payload with a documented shape.

    docs/fieldflow-spec.md          decided by a human, checked into git
              |
              v
    website_factory  (six nodes, one envelope per edge, a gate per hand-off)
      idea.brief -> product.spec -> design.system -> code.bundle
              |
              v
    dist/  (index.html, styles.css, 404.html, robots.txt, sitemap.xml)
              |
              v
    GitHub Pages                    the public marketing site

    poolflow/  (the product itself, not published by this pipeline)
      routes/webhooks.js -> services/agent.js -> services/slots.js
              |
              v
    inbound SMS becomes a booked job

The two pipelines share three ideas and no code:

Contracts over conversation. The website factory passes envelopes between nodes.
The PoolFlow booking assistant writes a job with a structured tool call rather
than by parsing prose. Same principle, applied twice: if it is not in the
schema, it does not cross the wire.

Gate, then escalate. The factory fails a gate and asks a human. The booking
assistant escalates a conversation to the owner after four unresolved turns.
Neither one silently ships a degraded result.

Secrets are references. The factory lists credential names only and asserts that
no value of a named variable appears in the generated bundle. PoolFlow keeps
`.env.example` with names and no values. No credential value belongs in a
payload, a log line, a commit or a URL.

## The generated website

`website_factory` is an executable version of the architecture in
`docs/website-factory/ARCHITECTURE.md`. Six nodes, each a pure function:

| Node | Emits | Gate | What the gate actually checks here |
| --- | --- | --- | --- |
| 1 idea_generator | idea.brief | G1, 0.80 | at least two personas, at least three distinct USPs, non-goals declared |
| 2 product_manager | product.spec | G2, 0.85 | every story has acceptance criteria, exclusions are published, roadmap phases ordered |
| 3 uiux_designer | design.system | G3, 0.85 | WCAG AA contrast recomputed from the tokens, every feature maps to a component |
| 4 software_engineer | code.bundle | G4, 0.85 | required files present, no secret markers, accessible markup, every spec promise rendered |
| 5 it_deployment | deployment.record | G5, objective | every route resolves, bytes on disk match the bundle, rollback pointer recorded |
| 6 lead_manager | run.report | owns all | event log, budget, the only node allowed to ask a human anything |

Two deliberate departures from the document, both visible in the code:

The creative nodes are pinned rather than sampled. Copy comes from the product
spec that a human already wrote and reviewed. That makes the site reproducible
byte for byte, keeps marketing copy inside pull-request review, and lets CI
prove the pipeline works with no API key. Swapping a node for a real model call
replaces one function body and touches nothing else.

Rework is skipped, honestly. Re-running a pure function cannot change its
output, so the orchestrator enters every gate already at the attempt cap and a
failure routes straight to a human instead of burning two identical retries.
The budget and rework machinery is still there for when the nodes become
stochastic.

## Running it

Build the site and serve it locally:

    python -m website_factory.run --out dist
    python -m http.server --directory dist 8000

Run the gates:

    pytest -q

Run the product itself:

    cd poolflow
    npm install
    npm run migrate
    npm run seed
    npm start

Each run also writes an append-only event log and a run report to
`runs/<run_id>/`. Neither `dist/` nor `runs/` is committed; CI regenerates both.

## Publishing

The workflow `.github/workflows/pages.yml` builds the site on every push to
`main` that touches the factory, uploads it as a Pages artifact, and deploys it.

One step is intentionally left to a person, because it is the step that makes
the site publicly visible:

    Settings -> Pages -> Build and deployment -> Source: GitHub Actions

Until that is set, the build job still runs and the artifact is still uploaded;
only the deploy job fails. Once it is set, the site is served at
`https://sebax209mr-ctrl.github.io/multi-agent-ai-system/`, which is also the
default `--base-url` used for canonical links and the sitemap.

Rolling back is redeploying a known `bundle_digest`: re-run the last green
Publish website run, or check out the commit that produced the digest and build
again. The build is deterministic, so the artifact is reproducible.

## Decisions this raises

These are questions for the team, not things the pipeline should decide.

There are now two landing pages. `poolflow/public/index.html` is served by the
Express app and the generated site is served by Pages. They will drift. The
obvious split is that Pages owns marketing and the app owns everything behind
sign-in, which would reduce `poolflow/public/index.html` to a sign-in shell.

There is also a third one. `docs/fieldflow-spec.md` links a Wix site. Whichever
URL is canonical should be the one in the sitemap and the one the spec links to.

The spec deprioritises hiring. `docs/fieldflow-spec.md` lists resume parsing and
hiring features as explicitly out of scope with no validated demand, and the
generated site publishes that exclusion. Two open pull requests build exactly
that capability against `agents/`. Worth settling which document wins before
they merge.

The Node app has no CI. `python-app.yml` covers Python only, so nothing lints or
tests `poolflow/` on a pull request.

A file named `p` sits in the repository root and looks accidental. Left alone
rather than deleted, since deleting other people's files is not this branch's
job.
