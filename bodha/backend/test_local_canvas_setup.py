"""A responding login page is not enough to call a Canvas replica ready."""
import importlib.util
from io import BytesIO
import json
from pathlib import Path
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
        if url.endswith('/__bodha_sandbox__/status.json'):
            return Response(json.dumps({'revision': setup.LOCK['revision']}).encode())
        if url.endswith('/login/canvas'):
            return Response(b'<form><input name="pseudonym_session[unique_id]"></form><link href="/dist/canvas.css"><script src="/dist/canvas.js"></script>')
        if missing_asset:
            raise URLError('Asset missing')
        return Response(b'/* Compiled Canvas asset */')
    monkeypatch.setattr(setup.urllib.request, 'urlopen', open_url)
    assert setup.status() == (1 if missing_asset else 0)
    assert json.loads(capsys.readouterr().out)['ready'] is (not missing_asset)
