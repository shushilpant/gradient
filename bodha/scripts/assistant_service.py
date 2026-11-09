"""Start the loopback assistant independently of an interactive terminal."""
import json
import os
import shlex
import signal
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


def listener_pids():
    """The bound port is authoritative; a saved PID may be stale or reused."""
    result = subprocess.run(
        ['lsof', '-nP', '-tiTCP:8765', '-sTCP:LISTEN'],
        capture_output=True, text=True, timeout=5,
    )
    if result.returncode == 1 and not result.stdout.strip() and not result.stderr.strip():
        return set()
    if result.returncode != 0:
        raise RuntimeError('Could not identify the process listening on port 8765; no service was stopped.')
    try:
        pids = {int(value) for value in result.stdout.split()}
        if any(pid <= 0 for pid in pids):
            raise ValueError('Invalid PID')
        return pids
    except ValueError as error:
        raise RuntimeError('Could not identify the process listening on port 8765; no service was stopped.') from error


def is_workspace_service(pid):
    command = subprocess.run(
        ['ps', '-p', str(pid), '-o', 'command='],
        capture_output=True, text=True, timeout=5,
    )
    if command.returncode != 0 or not command.stdout.strip():
        return False
    try:
        arguments = shlex.split(command.stdout.strip())
    except ValueError:
        return False
    uvicorn = bool(arguments) and (
        Path(arguments[0]).name == 'uvicorn'
        or len(arguments) > 2 and arguments[1:3] == ['-m', 'uvicorn']
        or len(arguments) > 1 and Path(arguments[0]).name.startswith('python') and Path(arguments[1]).name == 'uvicorn'
    )
    port = '--port=8765' in arguments or any(arguments[index:index + 2] == ['--port', '8765'] for index in range(len(arguments)))
    if not uvicorn or not port or 'backend.app:app' not in arguments:
        return False
    directory = subprocess.run(
        ['lsof', '-a', '-p', str(pid), '-d', 'cwd', '-Fn'],
        capture_output=True, text=True, timeout=5,
    )
    return directory.returncode == 0 and any(
        line.startswith('n') and Path(line[1:]).resolve() == ROOT.resolve()
        for line in directory.stdout.splitlines()
    )


def stop_service():
    listeners = listener_pids()
    # Verify every owner before stopping anything on the shared local port.
    if any(not is_workspace_service(pid) for pid in listeners):
        raise RuntimeError('Port 8765 belongs to another process or workspace; it was not stopped.')
    targets = set(listeners)
    pid_file = RUNTIME / 'assistant.pid'
    try:
        saved_pid = int(pid_file.read_text().strip())
    except (FileNotFoundError, ValueError):
        saved_pid = 0
    if saved_pid > 0 and saved_pid not in targets and is_workspace_service(saved_pid):
        targets.add(saved_pid)
    for pid in targets:
        # Recheck ownership immediately before signalling, including saved PIDs.
        if not is_workspace_service(pid):
            continue
        try:
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    for _ in range(50):
        if not listener_pids() and not any(is_workspace_service(pid) for pid in targets):
            return
        time.sleep(.1)
    raise RuntimeError('The previous OffCanvas service did not stop. Restart failed; no replacement was started.')


def main(argv=None):
    arguments = sys.argv[1:] if argv is None else argv
    try:
        if '--restart' in arguments:
            stop_service()
            if healthy():
                raise RuntimeError('The previous OffCanvas service is still reachable. Restart failed; no replacement was started.')
        elif healthy():
            print('OffCanvas is already reachable at http://127.0.0.1:8765')
            return 0
        RUNTIME.mkdir(exist_ok=True)
        with (RUNTIME / 'assistant.log').open('ab') as log:
            process = subprocess.Popen(
                [python_exec, '-m', 'uvicorn', 'backend.app:app', '--host', '127.0.0.1', '--port', '8765'],
                cwd=ROOT, stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                start_new_session=True, close_fds=True,
            )
        (RUNTIME / 'assistant.pid').write_text(str(process.pid))
        for _ in range(20):
            if process.poll() is not None:
                break
            if healthy():
                print('OffCanvas started independently at http://127.0.0.1:8765')
                return 0
            time.sleep(.5)
        print(f'Startup did not succeed. See {RUNTIME / "assistant.log"}', file=sys.stderr)
        return 1
    except (RuntimeError, OSError, subprocess.SubprocessError) as error:
        print(f'OffCanvas service failed: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
