"""A responding login page is not enough to call a Canvas replica ready."""
import importlib.util
from io import BytesIO
import json
from pathlib import Path
from types import SimpleNamespace
from urllib.error import URLError

import pytest

spec = importlib.util.spec_from_file_location('offcanvas_canvas_setup', Path(__file__).resolve().parents[1] / 'sandbox/canvas_local/setup.py')
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


@pytest.mark.parametrize('missing_asset', [False, True])
def test_canvas_readiness_requires_login_and_working_local_assets(monkeypatch, missing_asset, capsys):
    class Response(BytesIO):
        status = 200
        headers = {'Content-Type': 'text/plain'}
    def open_url(url, **_):
        if url.endswith('/__offcanvas_sandbox__/status.json'):
            return Response(json.dumps({'revision': setup.LOCK['revision']}).encode())
        if url.endswith('/login/canvas'):
            return Response(b'<form><input name="pseudonym_session[unique_id]"></form><link href="/dist/canvas.css"><script src="/dist/canvas.js"></script>')
        if missing_asset:
            raise URLError('Asset missing')
        return Response(b'/* Compiled Canvas asset */')
    monkeypatch.setattr(setup.urllib.request, 'urlopen', open_url)
    assert setup.status() == (1 if missing_asset else 0)
    assert json.loads(capsys.readouterr().out)['ready'] is (not missing_asset)


def test_new_sandbox_projects_use_current_brand_and_existing_volumes_are_preserved(tmp_path, monkeypatch):
    monkeypatch.setattr(setup, 'RUNTIME', tmp_path)
    monkeypatch.delenv('OFFCANVAS_COMPOSE_PROJECT', raising=False)
    monkeypatch.setattr(setup, 'existing_compose_projects', lambda: set())
    assert setup.compose_project_name() == 'offcanvas-canvas-local'
    (tmp_path / 'credentials.json').write_text(json.dumps({'studentEmail': 'student@bodha.local'}))
    assert setup.compose_project_name() == 'bodha-canvas-local'
    (tmp_path / 'credentials.json').write_text(json.dumps({'studentEmail': 'student@gradient.local'}))
    assert setup.compose_project_name() == 'gradient-canvas-local'
    monkeypatch.setenv('OFFCANVAS_COMPOSE_PROJECT', 'offcanvas-custom')
    assert setup.compose_project_name() == 'offcanvas-custom'


def test_existing_database_project_takes_precedence_over_credential_brand(tmp_path, monkeypatch):
    monkeypatch.setattr(setup, 'RUNTIME', tmp_path)
    monkeypatch.delenv('OFFCANVAS_COMPOSE_PROJECT', raising=False)
    (tmp_path / 'credentials.json').write_text(json.dumps({'studentEmail': 'student@gradient.local'}))
    monkeypatch.setattr(setup, 'existing_compose_projects', lambda: {'bodha-canvas-local'})
    assert setup.compose_project_name() == 'bodha-canvas-local'
    monkeypatch.setenv('OFFCANVAS_COMPOSE_PROJECT', 'offcanvas-custom')
    assert setup.compose_project_name() == 'offcanvas-custom'


@pytest.mark.parametrize('running', [True, False])
def test_project_discovery_uses_running_database_or_retained_volume_labels(monkeypatch, running):
    monkeypatch.setattr(setup.shutil, 'which', lambda _: '/usr/bin/docker')
    calls = []
    def execute(command, **options):
        calls.append(command)
        assert options == {'capture_output': True, 'text': True, 'timeout': 3, 'check': False}
        if command[1] == 'ps':
            return SimpleNamespace(returncode=0, stdout='unrelated-app\n' + ('gradient-canvas-local\n' if running else ''))
        return SimpleNamespace(returncode=0, stdout='bodha-canvas-local\n')
    monkeypatch.setattr(setup.subprocess, 'run', execute)
    assert setup.existing_compose_projects() == ({'gradient-canvas-local'} if running else {'bodha-canvas-local'})
    assert len(calls) == (1 if running else 2)


@pytest.mark.parametrize('failure', ['missing', 'unreachable', 'timeout'])
def test_project_discovery_falls_back_when_docker_is_unavailable(monkeypatch, failure):
    monkeypatch.setattr(setup.shutil, 'which', lambda _: None if failure == 'missing' else '/usr/bin/docker')
    def execute(command, **_):
        if failure == 'timeout':
            raise setup.subprocess.TimeoutExpired(command, 3)
        return SimpleNamespace(returncode=1, stdout='')
    monkeypatch.setattr(setup.subprocess, 'run', execute)
    assert setup.existing_compose_projects() == set()
