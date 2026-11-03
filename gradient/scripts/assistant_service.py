"""Start the loopback assistant independently of an interactive terminal."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / '.runtime'
URL = 'http://127.0.0.1:8765/api/v1/assistant/health'

VENV_PYTHON = ROOT / 'backend' / '.venv' / 'bin' / 'python'
python_exec = str(VENV_PYTHON) if VENV_PYTHON.exists() else sys.executable

def healthy():
    try:
        with urllib.request.urlopen(URL, timeout=3) as response:
            return json.load(response).get('ok') is True
    except Exception:
        return False

if healthy():
    print('GRADIENT is already reachable at http://127.0.0.1:8765')
    sys.exit(0)
RUNTIME.mkdir(exist_ok=True)
with (RUNTIME / 'assistant.log').open('ab') as log:
    process = subprocess.Popen([python_exec, '-m', 'uvicorn', 'backend.app:app', '--host', '127.0.0.1', '--port', '8765'], cwd=ROOT, stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True, close_fds=True)
(RUNTIME / 'assistant.pid').write_text(str(process.pid))
for _ in range(20):
    if healthy():
        print('GRADIENT started independently at http://127.0.0.1:8765')
        sys.exit(0)
    if process.poll() is not None:
        break
    time.sleep(.5)
print(f'Startup did not succeed. See {RUNTIME / "assistant.log"}', file=sys.stderr)
sys.exit(1)
