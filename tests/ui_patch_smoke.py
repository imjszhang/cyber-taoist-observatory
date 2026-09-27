"""Compatibility entry: v0.3 comprehensive UI suite includes the recovery tests."""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).with_name('ui_smoke.py')),run_name='__main__')
