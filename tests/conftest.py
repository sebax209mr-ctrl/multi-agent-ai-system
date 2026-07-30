"""Make the repository root importable for the tests in this directory.

pytest prepends the directory containing a test file to sys.path when that
directory is not a package, which here would be tests/ rather than the
repository root - so `import website_factory` would fail. Fixing it in
tests/conftest.py instead of a root-level conftest.py keeps this branch from
colliding with the other branches in flight, which add one at the root.
"""

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
