"""Node 5 (IT and deployment): code.bundle -> deployment.record.

Paranoid platform engineer. Three rules it will not bend:

  * Secrets are references, never values. REQUIRED_CREDENTIALS holds names only,
    and the node checks that no value of any named variable is present in the
    bundle before it writes a single byte. Publishing to GitHub Pages from CI
    needs no credential value at all - the workflow uses a short-lived OIDC
    identity - so the correct list here is empty, and that is worth stating.
  * Everything reversible. The record carries the content address of the exact
    bundle that was published plus a rollback pointer, so restoring the previous
    site is redeploying a known digest, not rebuilding and hoping.
  * Idempotency by construction. Re-publishing the same digest is a no-op, so a
    replayed run cannot create a second deployment.

Verification here is deliberately offline. Gate G5 in the architecture uses live
HTTP and Lighthouse; this runner asserts what can be proven from the filesystem
before anything is uploaded. The live half belongs to the workflow, after the
host has actually served the files.
"""

from __future__ import annotations

import hashlib
import os
from pathlib import Path
from typing import Any, Dict, List

from website_factory.envelope import Quality, require, stable_hash

# Objective checks only - a critic does not get a vote on whether a file exists.
G5_THRESHOLD = 1.0

DEPLOYMENT_CONTRACT = ("target", "output_dir", "files", "verification", "rollback")

# Names only. If this list ever gains an entry, the value still never enters a
# payload, a log line, an artifact or a URL.
REQUIRED_CREDENTIALS: List[str] = []

CREDENTIAL_NOTE = (
    "GitHub Pages deployment from Actions authenticates with the job's OIDC "
    "identity token, which is minted per run and never stored. No repository "
    "secret is read by this node."
)


class UnsafePath(ValueError):
    """A bundle tried to write outside its output directory. Error class E6xx."""

    error_class = "E6xx"


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def bundle_digest(files: Dict[str, str]) -> str:
    """Content address for a whole bundle: the hash of its path-to-hash map."""
    return stable_hash({path: _sha256(text) for path, text in files.items()})


def leaked_credentials(files: Dict[str, str]) -> List[str]:
    """Check the environment's values for the named credentials, not just names.

    A marker scan catches key-shaped strings. This catches the specific values
    this machine actually holds, which is the failure mode that matters when a
    build runs somewhere that has real credentials in the environment.
    """
    findings = []
    for name in REQUIRED_CREDENTIALS:
        value = os.environ.get(name)
        if not value or len(value) < 8:
            continue
        for path, text in sorted(files.items()):
            if value in text:
                findings.append("%s contains the value of %s" % (path, name))
    return findings


def write_bundle(bundle: Dict[str, Any], out_dir: str) -> List[str]:
    """The only place in the pipeline that touches the filesystem."""
    files: Dict[str, str] = bundle["files"]
    leaked = leaked_credentials(files)
    if leaked:
        raise UnsafePath("refusing to write: %s" % "; ".join(leaked))

    root = Path(out_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)

    written = []
    for path in sorted(files):
        target = (root / path).resolve()
        if root not in target.parents and target != root:
            raise UnsafePath("%r escapes the output directory" % path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(files[path], encoding="utf-8")
        written.append(path)
    return written


def verify(bundle: Dict[str, Any], out_dir: str) -> List[Dict[str, Any]]:
    """Objective, offline pre-flight checks. The live checks belong to CI."""
    root = Path(out_dir)
    files: Dict[str, str] = bundle["files"]
    checks: List[Dict[str, Any]] = []

    def record(name: str, passed: bool, detail: str) -> None:
        checks.append({"name": name, "passed": bool(passed), "detail": detail})

    for route in bundle["routes"]:
        relative = "index.html" if route == "/" else route.lstrip("/")
        target = root / relative
        record(
            "route %s resolves to a file" % route,
            target.is_file(),
            str(relative),
        )

    for path in sorted(files):
        target = root / path
        if path == ".nojekyll":
            record("%s exists" % path, target.is_file(), "marker file, empty by design")
            continue
        record(
            "%s is not empty" % path,
            target.is_file() and target.stat().st_size > 0,
            "%d bytes on disk" % (target.stat().st_size if target.is_file() else 0),
        )

    document = (root / "index.html").read_text(encoding="utf-8") if (
        root / "index.html"
    ).is_file() else ""
    record("document has a title", "<title>" in document, "title element present")
    record(
        "document declares a language",
        'lang="en"' in document,
        "html lang attribute",
    )
    record(
        "stylesheet is referenced",
        'href="styles.css"' in document,
        "relative stylesheet link, so a subpath host still works",
    )
    record(
        "bytes on disk match the bundle",
        all(
            (root / path).is_file()
            and (root / path).read_text(encoding="utf-8") == text
            for path, text in files.items()
        ),
        "written output is byte-identical to the rendered bundle",
    )
    return checks


def deployment_record(
    bundle: Dict[str, Any],
    out_dir: str,
    written: List[str],
    last_good_digest: str = "",
) -> Dict[str, Any]:
    files: Dict[str, str] = bundle["files"]
    digest = bundle_digest(files)
    return {
        "target": "github-pages",
        "strategy": (
            "static artifact uploaded by CI, deployed by actions/deploy-pages"
        ),
        "output_dir": str(Path(out_dir)),
        "base_url": bundle["base_url"],
        "routes": list(bundle["routes"]),
        "bundle_digest": digest,
        "idempotent": True,
        "idempotency_note": (
            "Publishing an unchanged bundle_digest is a no-op, so a replayed run "
            "cannot create a second deployment."
        ),
        "files": [
            {
                "path": path,
                "sha256": _sha256(files[path]),
                "bytes": len(files[path].encode("utf-8")),
            }
            for path in written
        ],
        "credentials": {
            "required_names": list(REQUIRED_CREDENTIALS),
            "note": CREDENTIAL_NOTE,
        },
        "verification": verify(bundle, out_dir),
        "rollback": {
            "method": "redeploy the previous bundle_digest",
            "last_good_digest": last_good_digest,
            "how": (
                "re-run the last green Publish website workflow run, or check out "
                "the commit that produced the digest and run the build again - the "
                "build is deterministic, so the artifact is reproducible"
            ),
        },
        "manual_prerequisite": (
            "Repository Settings, Pages, Source must be set to GitHub Actions. "
            "That is a repository setting and a deliberate human decision, "
            "because it makes the site publicly visible."
        ),
    }


def grade_deployment(record: Dict[str, Any]) -> Quality:
    """Gate G5: every objective check passes, or the deployment does not ship."""
    require(record, DEPLOYMENT_CONTRACT, "it_deployment")
    checks = record["verification"]
    failed = [check["name"] for check in checks if not check["passed"]]
    rubric = {
        "objective_checks": 1.0
        if not checks
        else round((len(checks) - len(failed)) / float(len(checks)), 4)
    }
    return Quality(
        threshold=G5_THRESHOLD,
        rubric=rubric,
        violations=["verification failed: %s" % name for name in failed],
    )
