# Website factory runbook

The architecture document explains why the pipeline is shaped the way it is.
This is the shorter document: what to type, what the failures mean, and what to
do when the site is wrong at two in the morning.

## 1. Build it on your machine

The factory is standard library only. There is nothing to install to build the
site, and there is no build step for the site itself: no bundler, no framework,
no JavaScript.

```bash
# grade the whole run, six nodes and gates G1 to G5
python -m website_factory.run

# grade the multi-page site only, write nothing, exit non-zero if it fails
python -m website_factory.site --check

# write the site where you can open it
python -m website_factory.site --out dist
python -m http.server --directory dist 8000
```

Open http://localhost:8000. If it looks wrong, the fix is never in `dist`.
See section 4.

Tests:

```bash
pip install pytest
pytest -q
```

## 2. What publishes it

`.github/workflows/pages.yml` builds the site and deploys it to GitHub
Pages. It runs on pushes to `main` that touch the factory, and on manual
dispatch. It is the only thing that publishes, and it publishes only from
`main`.

`.github/workflows/site-check.yml` runs on every branch and every pull
request instead. It grades the site, builds it twice and diffs the two builds,
scans the output for credential-shaped strings, and uploads the result as an
artifact called `site-preview`. Download that artifact to review a change
before it is merged; you do not need Pages for it.

One step is deliberately manual and has to be done once, by someone with admin
rights, in Settings then Pages: set the source to GitHub Actions. Publishing a
site makes it public, so that decision belongs to a person, not to a script.

## 3. The gates

A gate is a threshold plus a list of hard violations. A violation fails the gate
on its own, whatever the rubric average says, because a score cannot vote a
broken build into production.

| Gate | Node | Threshold | Fails when |
| --- | --- | --- | --- |
| G1 | idea generator | 0.80 | the brief is vague, or the personas collapse into one |
| G2 | product manager | 0.85 | a story has no acceptance criteria, or scope has crept |
| G3 | UI/UX designer | 0.85 | text contrast is below WCAG AA, or a component is unused |
| G4 | software engineer | 0.85 | a required file is missing, the markup is inaccessible, or something looks like a secret |
| G4b | software engineer | 0.85 | a page is unreachable, or a spec line never reached the HTML |
| G5 | IT and deployment | 1.00 | the bytes on disk do not match the bundle that was graded |

G5 is the only gate with no partial credit. Either what was published is what
was graded, or the run is void.

## 4. When something is wrong on the site

Work backwards through the seams. The generated output is disposable; something
upstream produced it.

| Symptom | Change this | Not this |
| --- | --- | --- |
| wrong words, missing feature, wrong claim | `website_factory/content.py` | the HTML |
| wrong colour, spacing, type size, contrast | the tokens in `website_factory/design.py` | the CSS |
| wrong markup, missing landmark, bad title | `website_factory/render.py` | `dist/index.html` |
| a page is missing or unlinked | `PAGES` and `BUILDERS` in `website_factory/site.py` | the nav |
| published bytes differ from the review | `website_factory/publish.py` | anything by hand |

Never hand-edit `dist/`. It is ignored by git for exactly that reason: the
next run would silently overwrite the fix and nobody would know why the site
changed back.

Adding a page is three edits and a test: an entry in `PAGES`, a builder
function, an entry in `BUILDERS`, and an assertion that the page is
reachable. G4b will then require it to exist, be accessible and be linked.

## 5. When a gate fails

The run does not retry forever. A node reworks at most twice, and then the run
stops and asks for a person. That cap exists because a critic that can rework
indefinitely will eventually talk itself into shipping something.

Read the violations first and the rubric second. Violations are deterministic and
name the exact file, contrast pair or missing key. The rubric is a judgement and
is only worth reading once the violations are empty.

A run that stops for a human writes its state to `runs/` with the envelope
that failed, the gate that rejected it, and the request for approval. Answer the
question the request asks, then re-run. Do not delete the run log to make the
failure go away; it is the only record of what was decided.

## 6. Rolling back

Every deployment record carries the digest of the bundle it published and a
pointer to the previous one. To roll back, re-run the Pages workflow from the
commit named by that pointer. The build is reproducible, so an old commit
rebuilds byte for byte; that is what the twice-and-diff step in CI is protecting.

Do not fix a live problem by editing files in the Pages branch or in an artifact.
The next run would undo it.

## 7. Credentials

The factory needs none to build. The workflow file lists credential names only,
and deployment uses the token GitHub Actions provides for the job, so no value is
stored in this repository and no value is ever put into an agent context, a
payload, a log line or a URL.

If a future node needs a real credential, add the name to the workflow, add the
value as a repository secret by hand, and keep the value out of every artifact.
The secret scan in `site-check.yml` is there to catch the day someone
forgets.

## 8. Things a person still decides

* enabling Pages, because it makes the site public;
* merging, because that is what makes it real;
* provisioning any credential, because the value must never pass through here;
* whether a rework loop that hit its cap should be overridden.
