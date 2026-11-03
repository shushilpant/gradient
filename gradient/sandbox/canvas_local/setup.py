#!/usr/bin/env python3
"""Reproducible official Canvas dev sandbox; no institutional credentials."""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import secrets
import re
import shutil
import subprocess
import sys
import urllib.request
from urllib.parse import urljoin, urlsplit

ROOT = Path(__file__).resolve().parent
UPSTREAM = ROOT / 'upstream'
RUNTIME = ROOT / '.runtime'
LOCK = json.loads((ROOT / 'upstream.lock.json').read_text())
ORIGIN = 'http://127.0.0.1:8080'


def run(args, cwd=ROOT):
    subprocess.run(args, cwd=cwd, check=True)


def compose_cli():
    if shutil.which('docker-compose'):
        return ['docker-compose']
    return ['docker', 'compose']


def compose(*args, bootstrap=False):
    command = [*compose_cli(), '--project-name', 'gradient-canvas-local', '--env-file', str(ROOT / '.env'), '-f', str(ROOT / 'compose.yml')]
    if bootstrap:
        command += ['-f', str(ROOT / 'bootstrap.compose.yml')]
    run(command + list(args))


def configure():
    if not (UPSTREAM / 'Dockerfile').exists():
        raise SystemExit('Official source checkout is missing. Run setup.py checkout first.')
    revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=UPSTREAM, text=True).strip()
    if revision != LOCK['revision']:
        raise SystemExit('The Canvas source revision differs from upstream.lock.json.')
    # Some networks reject plaintext package mirrors. Keep signature checking
    # intact and use HTTPS for the same official PostgreSQL repository.
    web_dockerfile = UPSTREAM / 'Dockerfile'
    web_source = web_dockerfile.read_text().replace('http://apt.postgresql.org/', 'https://apt.postgresql.org/')
    ubuntu_mirror = "RUN sed -i 's|http://us-east-1.ec2.ports.ubuntu.com/ubuntu-ports/|https://ports.ubuntu.com/ubuntu-ports/|g; s|http://ports.ubuntu.com/|https://ports.ubuntu.com/|g; s|http://archive.ubuntu.com/|https://archive.ubuntu.com/|g; s|http://security.ubuntu.com/|https://security.ubuntu.com/|g' /etc/apt/sources.list\n"
    if ubuntu_mirror not in web_source:
        web_source = web_source.replace('USER root\n', 'USER root\n\n' + ubuntu_mirror)
    web_dockerfile.write_text(web_source)
    postgres_dockerfile = UPSTREAM / 'docker-compose' / 'postgres' / 'Dockerfile'
    postgres_source = postgres_dockerfile.read_text()
    mirror_patch = "RUN find /etc/apt/sources.list.d -type f -exec sed -i 's|http://apt.postgresql.org/|https://apt.postgresql.org/|g' {} +\n\n"
    if mirror_patch not in postgres_source:
        postgres_dockerfile.write_text(postgres_source.replace('RUN apt-get update -qq', mirror_patch + 'RUN apt-get update -qq'))
    RUNTIME.mkdir(exist_ok=True)
    credentials_path = RUNTIME / 'credentials.json'
    if credentials_path.exists():
        credentials = json.loads(credentials_path.read_text())
    else:
        credentials = {'origin': ORIGIN, 'adminEmail': 'admin@gradient.local', 'adminPassword': secrets.token_urlsafe(24), 'studentEmail': 'student@gradient.local', 'studentPassword': secrets.token_urlsafe(24)}
        credentials_path.write_text(json.dumps(credentials, indent=2) + '\n')
        credentials_path.chmod(0o600)
    env_file = ROOT / '.env'
    if not env_file.exists():
        env_file.write_text('\n'.join([
            'CANVAS_DATABASE_PASSWORD=' + secrets.token_hex(24),
            'CANVAS_ENCRYPTION_KEY=' + secrets.token_hex(32),
            'CANVAS_ADMIN_EMAIL=' + credentials['adminEmail'],
            'CANVAS_ADMIN_PASSWORD=' + credentials['adminPassword'],
            'CANVAS_HOST_UID=' + str(os.getuid()),
        ]) + '\n')
        env_file.chmod(0o600)
    source_config = UPSTREAM / 'docker-compose' / 'config'
    for source in source_config.glob('*.yml'):
        shutil.copyfile(source, UPSTREAM / 'config' / source.name)
    (UPSTREAM / 'config' / 'domain.yml').write_text('development:\n  domain: "127.0.0.1:8080"\n  ssl: false\ntest:\n  domain: "127.0.0.1:8080"\n  ssl: false\n')
    # A sink address plus the internal runtime network prevents real mail.
    (UPSTREAM / 'config' / 'outgoing_mail.yml').write_text('development:\n  address: "127.0.0.1"\n  port: 9\n  domain: "gradient.local"\n  outgoing_address: "canvas@gradient.local"\n')
    (UPSTREAM / 'public' / '__gradient_sandbox__').mkdir(exist_ok=True)
    (UPSTREAM / 'public' / '__gradient_sandbox__' / 'status.json').write_text(json.dumps({'sandbox': True, 'application': 'Canvas LMS', 'upstream': LOCK['repository'], 'revision': revision, 'origin': ORIGIN, 'institutionReplica': False}) + '\n')
    shutil.copyfile(ROOT / 'seed.rb', UPSTREAM / 'script' / 'gradient_seed.rb')
    login_dir = UPSTREAM / 'app' / 'views' / 'login' / 'canvas'
    shutil.copyfile(ROOT / 'login_layout.html.erb', login_dir / '_gradient_login_layout.html.erb')
    login_view = login_dir / '_new_login_content.html.erb'
    login_patch = '<%= render "login/canvas/gradient_login_layout" %>\n'
    if login_patch not in login_view.read_text():
        login_view.write_text(login_patch + login_view.read_text())
    shutil.copyfile(ROOT / 'import_snapshot.rb', UPSTREAM / 'script' / 'gradient_import_snapshot.rb')
    shutil.copyfile(ROOT / 'git-wrapper.sh', UPSTREAM / 'bin' / 'git')
    (UPSTREAM / 'bin' / 'git').chmod(0o755)
    assets_script = UPSTREAM / 'script' / 'install_assets.sh'
    assets_script.write_text(assets_script.read_text().replace('yarn install || yarn install --network-concurrency 1', 'yarn install --network-concurrency 8 || yarn install --network-concurrency 4'))
    print('Configured isolated Canvas. Synthetic login details: ' + str(credentials_path))


def checkout():
    if not UPSTREAM.exists():
        run(['git', 'clone', '--filter=blob:none', '--no-checkout', LOCK['repository'], str(UPSTREAM)])
    run(['git', 'fetch', '--depth', '1', 'origin', LOCK['revision']], cwd=UPSTREAM)
    run(['git', 'checkout', '--detach', LOCK['revision']], cwd=UPSTREAM)


def doctor():
    if not shutil.which('docker'):
        raise SystemExit('Docker CLI/runtime missing. On this Mac install colima, docker and docker-compose, then start Colima.')
    run(['docker', 'info', '--format', '{{.ServerVersion}}'])
    run([*compose_cli(), 'version'])
    print('Canvas origin: ' + ORIGIN)


def status():
    try:
        with urllib.request.urlopen(ORIGIN + '/__gradient_sandbox__/status.json', timeout=5) as response:
            data = json.load(response)
        with urllib.request.urlopen(ORIGIN + '/login/canvas', timeout=15) as response:
            html = response.read(1_000_000).decode('utf-8', errors='replace')
        assets = list(dict.fromkeys(urljoin(ORIGIN, value) for value in re.findall(r'''(?:src|href)=["']([^"']+\.(?:css|js)(?:\?[^"']*)?)["']''', html) if urlsplit(urljoin(ORIGIN, value)).netloc == urlsplit(ORIGIN).netloc))
        healthy = data.get('revision') == LOCK['revision'] and 'pseudonym_session' in html and bool(assets)
        checked = 0
        for asset in assets[:6]:
            with urllib.request.urlopen(asset, timeout=15) as response:
                content = response.read(500)
                if response.status != 200 or not content or 'text/html' in response.headers.get('Content-Type', ''):
                    healthy = False
                checked += 1
        print(json.dumps({'ready': healthy, 'origin': ORIGIN, 'identity': data, 'assetsChecked': checked}, indent=2))
        return 0 if healthy else 1
    except Exception as error:
        print(json.dumps({'ready': False, 'origin': ORIGIN, 'error': str(error)}))
        return 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['checkout', 'configure', 'doctor', 'build', 'initialize', 'seed', 'up', 'down', 'status', 'logs', 'import'])
    parser.add_argument('--snapshot', type=Path)
    arguments = parser.parse_args()
    action = arguments.action
    if action == 'checkout': checkout()
    elif action == 'configure': configure()
    elif action == 'doctor': doctor()
    elif action == 'build':
        doctor(); configure(); compose('build', 'web', 'postgres', bootstrap=True)
        compose('run', '--rm', 'web', './script/install_assets.sh', bootstrap=True)
    elif action == 'initialize':
        compose('run', '--rm', 'web', 'bundle', 'exec', 'rake', 'db:create', 'db:initial_setup')
    elif action == 'seed':
        shutil.copyfile(ROOT / 'seed.rb', UPSTREAM / 'script' / 'gradient_seed.rb')
        credentials = json.loads((RUNTIME / 'credentials.json').read_text())
        compose('run', '--rm', '-e', 'GRADIENT_STUDENT_EMAIL=' + credentials['studentEmail'], '-e', 'GRADIENT_STUDENT_PASSWORD=' + credentials['studentPassword'], 'web', 'bundle', 'exec', 'rails', 'runner', 'script/gradient_seed.rb')
    elif action == 'import':
        if arguments.snapshot is None:
            parser.error('--snapshot is required for import')
        source = arguments.snapshot.resolve(strict=True)
        if source.suffix.lower() != '.json' or source.stat().st_size > 30 * 1024 * 1024:
            raise SystemExit('Choose a JSON snapshot smaller than 30 MB.')
        data = json.loads(source.read_text())
        snapshot = data.get('snapshot', data)
        if not isinstance(snapshot.get('courses'), list) or len(snapshot['courses']) > 100:
            raise SystemExit('Snapshot must contain at most 100 courses.')
        imports = RUNTIME / 'imports'
        imports.mkdir(parents=True, exist_ok=True)
        staged = imports / ('mirror-' + secrets.token_hex(8) + '.json')
        staged.write_text(json.dumps(snapshot))
        staged.chmod(0o600)
        credentials = json.loads((RUNTIME / 'credentials.json').read_text())
        shutil.copyfile(ROOT / 'import_snapshot.rb', UPSTREAM / 'script' / 'gradient_import_snapshot.rb')
        compose('run', '--rm', '-e', 'GRADIENT_STUDENT_EMAIL=' + credentials['studentEmail'], '-e', 'GRADIENT_SNAPSHOT_PATH=/gradient-runtime/imports/' + staged.name, 'web', 'bundle', 'exec', 'rails', 'runner', 'script/gradient_import_snapshot.rb')
    elif action == 'up': compose('up', '-d', 'gateway')
    elif action == 'down': compose('down')
    elif action == 'logs': compose('logs', '--tail', '80', 'web')
    else: sys.exit(status())

if __name__ == '__main__': main()
