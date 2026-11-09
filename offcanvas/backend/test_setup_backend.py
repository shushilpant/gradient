import importlib.util
from pathlib import Path
from types import SimpleNamespace

import pytest

spec = importlib.util.spec_from_file_location("offcanvas_setup_backend", Path(__file__).resolve().parents[1] / "scripts/setup_backend.py")
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


def test_existing_environment_still_installs_updated_dependencies(tmp_path, monkeypatch):
    venv = tmp_path / ".venv"
    python = venv / "bin/python"
    python.parent.mkdir(parents=True)
    python.touch()
    commands = []
    monkeypatch.setattr(setup, "VENV", venv)
    monkeypatch.setattr(setup, "supported_python", lambda path: True)
    monkeypatch.setattr(setup.shutil, "which", lambda name: "/usr/local/bin/uv")
    monkeypatch.setattr(setup.subprocess, "run", lambda command, **kwargs: commands.append(command))
    setup.install()
    assert len(commands) == 1
    assert commands[0] == ["/usr/local/bin/uv", "pip", "install", "--python", str(python), "-e", "./backend[dev]"]


def test_incomplete_environment_returns_actionable_error(tmp_path, monkeypatch):
    venv = tmp_path / ".venv"
    venv.mkdir()
    monkeypatch.setattr(setup, "VENV", venv)
    with pytest.raises(RuntimeError, match="Rename that directory"):
        setup.install()


def test_explicit_python_is_respected_instead_of_machine_specific_path(monkeypatch):
    monkeypatch.setenv("OFFCANVAS_PYTHON", "/custom/python")
    monkeypatch.setattr(setup, "supported_python", lambda value: value == "/custom/python")
    assert setup.find_python() == "/custom/python"


@pytest.mark.parametrize("version,supported", [([3, 9], False), ([3, 11], True), ([3, 12], True), ([3, 13], False), ([3, 14], False)])
def test_dependency_python_version_support(monkeypatch, version, supported):
    import json
    monkeypatch.setattr(setup.subprocess, "run", lambda *args, **kwargs: SimpleNamespace(stdout=json.dumps(version)))
    assert setup.supported_python("python") is supported


def test_legacy_python_configuration_still_works_but_current_name_takes_precedence(monkeypatch):
    monkeypatch.delenv("OFFCANVAS_PYTHON", raising=False)
    monkeypatch.setenv("BODHA_PYTHON", "/legacy/python")
    monkeypatch.setattr(setup, "supported_python", lambda value: value in ("/legacy/python", "/current/python"))
    assert setup.find_python() == "/legacy/python"
    monkeypatch.setenv("OFFCANVAS_PYTHON", "/current/python")
    assert setup.find_python() == "/current/python"
