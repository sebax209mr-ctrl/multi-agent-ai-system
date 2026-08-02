"""
Pytest configuration.

Its presence at the repository root is what puts the root on sys.path, so tests
can `import agents` when pytest is invoked from anywhere in the project.
"""

import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))

if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
