"""Install the optional local service with an available Python 3.11 or 3.12."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
VENV = ROOT / "backend" / ".venv"


def supported_python(executable):
    try:
        result = subprocess.run(
            [str(executable), "-c", "import json,sys; print(json.dumps(list(sys.version_info[:2])))"],
            capture_output=True, text=True, check=True, timeout=10,
        )
        version = tuple(json.loads(result.stdout))
        return (3, 11) <= version < (3, 13)
    except (OSError, ValueError, subprocess.SubprocessError):
        return False


def find_python():
    configured = os.environ.get("BODHA_PYTHON")
    candidates = [configured] if configured else [
        shutil.which("python3.12"), shutil.which("python3.11"),
        sys.executable,
    ]
    for candidate in candidates:
        if candidate and supported_python(candidate):
            return candidate
    raise RuntimeError("Install Python 3.11 or 3.12, or set BODHA_PYTHON to its executable, then run make install again.")


def install():
    python = VENV / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    uv = shutil.which("uv")
    if not uv:
        candidate = Path.home() / ".local" / "bin" / "uv"
        uv = str(candidate) if candidate.is_file() else None
    if VENV.exists():
        if not python.is_file() or not supported_python(python):
            raise RuntimeError("backend/.venv is incomplete or uses an unsupported Python. Rename that directory and run make install again.")
    else:
        selected = find_python()
        command = [uv, "venv", str(VENV), "--python", str(selected)] if uv else [str(selected), "-m", "venv", str(VENV)]
        subprocess.run(command, cwd=ROOT, check=True)
    # Always synchronize dependencies, including when the environment already exists.
    command = ([uv, "pip", "install", "--python", str(python)] if uv else [str(python), "-m", "pip", "install"])
    subprocess.run(command + ["-e", "./backend[dev]"], cwd=ROOT, check=True)
    print("Local service installed. Run make assistant-start to start it.")


if __name__ == "__main__":
    try:
        install()
    except (RuntimeError, OSError, subprocess.SubprocessError) as error:
        print("Backend setup failed: {}".format(error), file=sys.stderr)
        sys.exit(1)
