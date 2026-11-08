"""The synthetic preview exposes readable sources without posing as a Canvas account."""
import json
from datetime import date
from http.server import HTTPServer
from threading import Thread
from urllib.error import HTTPError
from urllib.request import urlopen

import pytest

from scripts.demo_runner import DemoHandler, demo_assignments, generate_demo_page


@pytest.fixture
def preview_server():
    server = HTTPServer(('127.0.0.1', 0), DemoHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield 'http://127.0.0.1:{}'.format(server.server_port)
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def test_preview_is_labeled_synthetic():
    page = generate_demo_page(demo_date=date(2026, 11, 9))
    assert 'Extension preview' in page
    assert 'sample courses' in page
    assert 'Load unpacked' in page
    assert 'data-gradient-demo-date="2026-11-09"' in page
    assert 'no completed execution is simulated' in page


def test_selected_preview_material_is_readable_as_json_and_html(preview_server):
    path = '/courses/99001/pages/chunk_cs101_w1_s12'
    with urlopen(preview_server + '/api/v1' + path, timeout=2) as response:
        material = json.load(response)
    assert material['published'] is True
    assert 'Formal Big-O Definition' in material['body']
    with urlopen(preview_server + path, timeout=2) as response:
        page = response.read().decode()
    assert 'Formal Big-O Definition' in page
    assert 'Back to preview' in page


def test_preview_does_not_substitute_html_for_unknown_api_calls(preview_server):
    with pytest.raises(HTTPError) as failure:
        urlopen(preview_server + '/api/v1/users/self/profile', timeout=2)
    assert failure.value.code == 404


def test_scenario_deadlines_overlap_and_briefs_are_available(preview_server):
    assignments = demo_assignments(date(2026, 11, 9))
    assert len(assignments) == 3
    assert assignments[0]['due_at'] == assignments[1]['due_at'] == '2026-11-10T23:59:00Z'
    with urlopen(preview_server + '/api/v1/courses/99001/assignments/1091', timeout=2) as response:
        assignment = json.load(response)
    assert assignment['synthetic'] is True
    assert 'queue after each visit' in assignment['description']
    assert len(assignment['rubric']) == 3
    with urlopen(preview_server + '/courses/99001/assignments/1091', timeout=2) as response:
        assert assignment['description'] in response.read().decode()
    with urlopen(preview_server + '/api/v1/courses/99001/pages/demo-graph-guide', timeout=2) as response:
        assert 'FIFO queue' in json.load(response)['body']
