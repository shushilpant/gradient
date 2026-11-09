import importlib.util
from pathlib import Path
import signal
from types import SimpleNamespace

import pytest

spec = importlib.util.spec_from_file_location(
    'gradient_assistant_service', Path(__file__).resolve().parents[1] / 'scripts/assistant_service.py',
)
service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(service)


def test_listener_discovery_uses_port_instead_of_pid_file(monkeypatch):
    commands = []
    def run(command, **kwargs):
        commands.append(command)
        return SimpleNamespace(returncode=0, stdout='123\n123\n456\n', stderr='')
    monkeypatch.setattr(service.subprocess, 'run', run)
    assert service.listener_pids() == {123, 456}
    assert commands == [['lsof', '-nP', '-tiTCP:8765', '-sTCP:LISTEN']]


@pytest.mark.parametrize('output,code,error', [('', 1, ''), ('bad-pid', 0, ''), ('', 1, 'Permission denied')])
def test_listener_discovery_distinguishes_empty_port_from_failed_inspection(monkeypatch, output, code, error):
    monkeypatch.setattr(service.subprocess, 'run', lambda *_a, **_k: SimpleNamespace(returncode=code, stdout=output, stderr=error))
    if not output and not error:
        assert service.listener_pids() == set()
    else:
        with pytest.raises(RuntimeError, match='no service was stopped'):
            service.listener_pids()


@pytest.mark.parametrize('command,cwd,owned', [
    ('/venv/bin/python -m uvicorn backend.app:app --port 8765', None, True),
    ('/venv/bin/uvicorn backend.app:app --port 8765', None, True),
    ('python -m uvicorn backend.app:app --port 8765', '/other/workspace', False),
    ('python -m uvicorn unrelated.app:app --port 8765', None, False),
    ('python unrelated.py --note=uvicorn backend.app:app', None, False),
    ('python unrelated.py uvicorn backend.app:app --port 8765', None, False),
    ('python -m uvicorn backend.app:app --port 8766', None, False),
])
def test_service_identity_requires_uvicorn_app_and_exact_workspace(monkeypatch, command, cwd, owned):
    def run(arguments, **kwargs):
        output = command if arguments[0] == 'ps' else 'p123\nfcwd\nn' + (cwd or str(service.ROOT)) + '\n'
        return SimpleNamespace(returncode=0, stdout=output, stderr='')
    monkeypatch.setattr(service.subprocess, 'run', run)
    assert service.is_workspace_service(123) is owned


@pytest.mark.parametrize('saved', ['999', 'not-a-pid', None])
def test_restart_finds_verified_listener_with_stale_or_missing_pid_file(tmp_path, monkeypatch, saved):
    monkeypatch.setattr(service, 'RUNTIME', tmp_path)
    if saved is not None:
        (tmp_path / 'assistant.pid').write_text(saved)
    alive = {123}
    signals = []
    monkeypatch.setattr(service, 'listener_pids', lambda: set(alive))
    monkeypatch.setattr(service, 'is_workspace_service', lambda pid: pid in alive)
    def kill(pid, sent_signal):
        signals.append((pid, sent_signal))
        alive.discard(pid)
    monkeypatch.setattr(service.os, 'kill', kill)
    service.stop_service()
    assert signals == [(123, signal.SIGTERM)]


def test_restart_does_not_kill_a_different_workspace_or_reused_pid(tmp_path, monkeypatch):
    monkeypatch.setattr(service, 'RUNTIME', tmp_path)
    (tmp_path / 'assistant.pid').write_text('999')
    monkeypatch.setattr(service, 'listener_pids', lambda: {123})
    monkeypatch.setattr(service, 'is_workspace_service', lambda _: False)
    signals = []
    monkeypatch.setattr(service.os, 'kill', lambda *args: signals.append(args))
    with pytest.raises(RuntimeError, match='another process or workspace'):
        service.stop_service()
    assert signals == []


def test_restart_fails_when_verified_service_does_not_stop(tmp_path, monkeypatch):
    monkeypatch.setattr(service, 'RUNTIME', tmp_path)
    monkeypatch.setattr(service, 'listener_pids', lambda: {123})
    monkeypatch.setattr(service, 'is_workspace_service', lambda _: True)
    monkeypatch.setattr(service.os, 'kill', lambda *_: None)
    monkeypatch.setattr(service.time, 'sleep', lambda _: None)
    with pytest.raises(RuntimeError, match='did not stop'):
        service.stop_service()


def test_restart_never_reports_success_if_old_service_remains_healthy(monkeypatch, capsys):
    monkeypatch.setattr(service, 'stop_service', lambda: None)
    monkeypatch.setattr(service, 'healthy', lambda: True)
    monkeypatch.setattr(service.subprocess, 'Popen', lambda *_a, **_k: pytest.fail('must not launch alongside old service'))
    assert service.main(['--restart']) == 1
    captured = capsys.readouterr()
    assert 'Restart failed' in captured.err
    assert 'already reachable' not in captured.out


def test_restart_starts_and_records_replacement_after_old_service_stops(tmp_path, monkeypatch):
    monkeypatch.setattr(service, 'RUNTIME', tmp_path)
    stopped = []
    monkeypatch.setattr(service, 'stop_service', lambda: stopped.append(True))
    responses = iter([False, True])
    monkeypatch.setattr(service, 'healthy', lambda: next(responses))
    launches = []
    def launch(arguments, **kwargs):
        launches.append((arguments, kwargs))
        return SimpleNamespace(pid=456, poll=lambda: None)
    monkeypatch.setattr(service.subprocess, 'Popen', launch)
    assert service.main(['--restart']) == 0
    assert stopped == [True]
    assert (tmp_path / 'assistant.pid').read_text() == '456'
    assert launches[0][0][1:4] == ['-m', 'uvicorn', 'backend.app:app']
    assert launches[0][1]['cwd'] == service.ROOT


def test_normal_start_keeps_existing_healthy_service(monkeypatch):
    monkeypatch.setattr(service, 'healthy', lambda: True)
    monkeypatch.setattr(service.subprocess, 'Popen', lambda *_a, **_k: pytest.fail('must keep existing healthy service'))
    assert service.main([]) == 0
