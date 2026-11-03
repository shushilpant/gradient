#!/usr/bin/env python3
"""Build, initialize, seed, import an explicit snapshot and start local Canvas."""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import fcntl
import json
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent
RUNTIME = ROOT / '.runtime'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshot', type=Path, help='Explicit student-visible snapshot to import')
    parser.add_argument('--skip-build', action='store_true', help='Use only after setup.py build has succeeded')
    args = parser.parse_args()
    source = args.snapshot.resolve(strict=True) if args.snapshot else None
    RUNTIME.mkdir(exist_ok=True)
    with (RUNTIME / 'bootstrap.lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit('A local Canvas bootstrap is already running.')

        def state(stage, status='running', message=''):
            path = RUNTIME / 'bootstrap-state.json'
            path.write_text(json.dumps({'stage': stage, 'status': status, 'message': message, 'updatedAt': datetime.now(timezone.utc).isoformat()}))
            path.chmod(0o600)

        def run(action, *options):
            state(action)
            subprocess.run([sys.executable, str(ROOT / 'setup.py'), action, *map(str, options)], check=True)

        try:
            if not (ROOT / 'upstream' / 'Dockerfile').exists():
                run('checkout')
            run('configure')
            run('doctor')
            if not args.skip_build:
                run('build')
            marker = RUNTIME / 'initialized.json'
            if not marker.exists():
                run('initialize')
                marker.write_text(json.dumps({'initializedAt': datetime.now(timezone.utc).isoformat()}))
                marker.chmod(0o600)
            run('seed')
            if source:
                run('import', '--snapshot', source)
            run('up')
            state('starting')
            for _ in range(18):
                result = subprocess.run([sys.executable, str(ROOT / 'setup.py'), 'status'], stdout=subprocess.DEVNULL)
                if result.returncode == 0:
                    state('ready', 'complete', 'Canvas is ready at http://127.0.0.1:8080')
                    print('Canvas is ready at http://127.0.0.1:8080')
                    return
                time.sleep(5)
            raise RuntimeError('Canvas did not become ready. Inspect setup.py logs; no replica readiness is claimed.')
        except Exception as error:
            state('error', 'error', str(error)[:1000])
            raise


if __name__ == '__main__':
    main()
