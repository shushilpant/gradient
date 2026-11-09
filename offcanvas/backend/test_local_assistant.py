"""Local assistant tests: no network calls, model downloads or real Canvas data."""
import base64
import io
import json
import socket
import time
import zipfile

from fastapi.testclient import TestClient
import pytest

from app import app
import local_assistant as ai


client = TestClient(app)
HEADERS = {"X-OffCanvas-Client": "offcanvas-extension"}


def study_request(**updates):
    request = {
        "course": {"id": "1", "name": "Biology", "code": "BIO 101"},
        "assignment": {"id": "2", "title": "Explain photosynthesis", "description": "Compare light reactions and the Calvin cycle.", "url": "https://school.instructure.com/courses/1/assignments/2"},
        "prompt": "Teach me the process.", "level": "a_bit_more", "model": "qwen3:8b", "webResearch": False,
        "resources": [{"title": "Lecture 4", "url": "https://school.instructure.com/courses/1/files/4", "text": "The light reactions convert solar energy to ATP and NADPH."}],
        "mode": "explain",
    }
    request.update(updates)
    return request


def model_output(**updates):
    result = {
        "title": "Photosynthesis", "summary": "Two linked stages.",
        "markdown": "## Process\nLight reactions power carbon fixation. [S2]",
        "sampleMarkdown": "", "diagrams": [{"title": "Stages", "nodes": [{"id": "a", "label": "Light reactions"}, {"id": "b", "label": "Calvin cycle"}], "edges": [{"from": "a", "to": "b", "label": "ATP, NADPH"}]}], "graphs": [],
    }
    result.update(updates)
    return result


def mock_ollama(monkeypatch, output=None, captures=None):
    def call(path, payload=None, timeout=8):
        if captures is not None:
            captures.append((path, payload))
        if path == "/api/tags":
            return {"models": [{"name": "qwen3:8b"}, {"name": "qwen3-vl:8b"}, {"name": "gemma4:e4b"}, {"name": "gpt-oss:20b"}]}
        if path == "/api/show":
            vision = payload["model"] in ("qwen3-vl:8b", "gemma4:e4b")
            return {"capabilities": ["completion", "thinking"] + (["vision"] if vision else []), "details": {"parameter_size": "8B", "quantization_level": "Q4_K_M"}}
        if path == "/api/chat":
            return {"message": {"content": json.dumps(output if output is not None else model_output())}}
        if path == "/api/pull":
            return {"status": "success"}
        if path == "/api/generate":
            return {"done": True}
        raise AssertionError(path)
    monkeypatch.setattr(ai, "ollama_request", call)


def test_health_uses_real_ollama_tags_and_reports_unavailable(monkeypatch):
    mock_ollama(monkeypatch)
    data = client.get("/api/v1/assistant/health").json()
    assert "gpt-oss:20b" in data["models"]
    assert data["recommended"]["reasoningModel"] == "gpt-oss:20b"
    assert data["recommended"]["visionModel"] == "gemma4:e4b"
    assert "vision" in next(model for model in data["modelDetails"] if model["name"] == "gemma4:e4b")["capabilities"]
    def offline(*args, **kwargs):
        raise ai.HTTPException(503, "Ollama offline")
    monkeypatch.setattr(ai, "ollama_request", offline)
    data = client.get("/api/v1/assistant/health").json()
    assert data["ok"] and not data["ollamaConnected"]
    assert "offline" in data["message"]


def test_health_deduplicates_names_and_keeps_useful_local_metadata(monkeypatch):
    monkeypatch.setattr(ai, 'ollama_request', lambda *a, **k: {'models': [{'name':'gpt-oss:20b','variant':'remote'}, {'name':'gpt-oss:20b','variant':'local'}, {'name':'gpt-oss:20b','variant':'sparse'}, {'name':'gemma4:e4b','variant':'local'}]})
    def details(tag):
        return {'name':tag['name'], 'remote':tag['variant']=='remote', 'capabilities':[] if tag['variant']=='sparse' else ['completion', 'vision'], 'size':0 if tag['variant']=='sparse' else 100, 'parameterSize':'20B'}
    monkeypatch.setattr(ai, 'model_details', details)
    data = client.get('/api/v1/assistant/health').json()
    assert data['models'] == ['gpt-oss:20b', 'gemma4:e4b']
    assert len(data['modelDetails']) == 2
    assert data['modelDetails'][0]['remote'] is False
    assert data['modelDetails'][0]['capabilities'] == ['completion', 'vision']
    assert data['recommended']['reasoningModel'] == 'gpt-oss:20b'
    assert data['recommended']['visionModel'] == 'gemma4:e4b'


def test_drive_by_origin_and_missing_client_header_are_rejected(monkeypatch):
    mock_ollama(monkeypatch)
    assert client.post("/api/v1/assistant/generate", json=study_request()).status_code == 403
    assert client.post("/api/v1/assistant/generate", json=study_request(), headers={**HEADERS, "Origin": "https://evil.example"}).status_code == 403
    allowed = client.options("/api/v1/assistant/generate", headers={"Origin": "chrome-extension://" + "a" * 32, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "x-offcanvas-client,content-type"})
    assert allowed.status_code == 200
    denied = client.options("/api/v1/assistant/generate", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
    assert denied.status_code == 400


def test_generate_grounded_sources_diagrams_and_no_external_research(monkeypatch):
    calls = []
    mock_ollama(monkeypatch, captures=calls)
    monkeypatch.setattr(ai, "search_web", lambda *_: pytest.fail("Research disabled"))
    response = client.post("/api/v1/assistant/generate", headers=HEADERS, json=study_request())
    assert response.status_code == 200, response.text
    data = response.json()
    assert [source["id"] for source in data["sources"]] == ["S1", "S2"]
    assert data["sources"][1]["kind"] == "canvas"
    assert data["diagrams"] == [] and data["graphs"] == []
    assert data["renderedVisuals"] == []
    assert data["sampleMarkdown"] == ""
    assert any("research is off" in warning for warning in data["warnings"])
    chat = next(body for path, body in calls if path == "/api/chat")
    assert chat["stream"] is False and chat["keep_alive"] == "30s"
    assert "ATP and NADPH" in chat["messages"][1]["content"]
    assert chat["options"]["num_ctx"] == ai.MIN_CONTEXT_TOKENS


def test_detail_levels_change_word_targets_without_tiny_response_caps(monkeypatch):
    calls = []
    mock_ollama(monkeypatch, captures=calls)
    for level in ("a_bit", "all_in"):
        result = client.post("/api/v1/assistant/generate", headers=HEADERS, json=study_request(level=level))
        assert result.status_code == 200
    chats = [body for path, body in calls if path == "/api/chat"]
    assert all(chat["options"]["num_predict"] > ai.DEPTHS['all_in']['tokens'] for chat in chats)
    assert "250-450" in chats[0]["messages"][0]["content"]
    assert "1600-2400" in chats[1]["messages"][0]["content"]


def test_sample_is_real_separate_output_and_failure_is_explicit(monkeypatch):
    mock_ollama(monkeypatch, model_output(sampleMarkdown="# Sample assignment for review\nA worked model answer. [S2]"))
    result = client.post("/api/v1/assistant/generate", headers=HEADERS, json=study_request(mode="sample"))
    assert result.status_code == 200
    assert "model answer" in result.json()["sampleMarkdown"]
    mock_ollama(monkeypatch)
    assert client.post("/api/v1/assistant/generate", headers=HEADERS, json=study_request(mode="sample")).status_code == 502


def test_no_fabricated_web_sources_when_search_is_unavailable(monkeypatch):
    mock_ollama(monkeypatch)
    def unavailable(*_):
        raise OSError("search provider unavailable")
    monkeypatch.setattr(ai, "search_web", unavailable)
    response = client.post("/api/v1/assistant/generate", headers=HEADERS, json=study_request(webResearch=True))
    assert response.status_code == 200
    assert all(source["kind"] == "canvas" for source in response.json()["sources"])
    assert any("unavailable" in warning for warning in response.json()["warnings"])


def test_research_uses_retrieved_sources_and_does_not_send_private_body(monkeypatch):
    mock_ollama(monkeypatch)
    queries = []
    def search(query, limit):
        queries.append(query)
        return [{"title": "Open textbook", "url": "https://textbook.example/photosynthesis", "snippet": "Carbon fixation"}]
    monkeypatch.setattr(ai, "search_web", search)
    monkeypatch.setattr(ai, "read_page", lambda result: ({"title": result["title"], "url": result["url"], "text": "Chloroplasts capture light."}, []))
    data = client.post("/api/v1/assistant/generate", headers=HEADERS, json=study_request(webResearch=True)).json()
    assert data["sources"][-1]["kind"] == "web"
    assert data["sources"][-1]["url"] == "https://textbook.example/photosynthesis"
    assert "Calvin" not in queries[0] and "BIO 101" not in queries[0]


@pytest.mark.parametrize("url", ["http://example.com/a", "https://localhost/a", "https://127.0.0.1/a", "https://[::1]/a", "https://169.254.169.254/latest/meta-data", "https://user:password@example.com/a", "https://example.com:9000/a"])
def test_public_reader_blocks_private_and_non_https_targets(monkeypatch, url):
    def addresses(host, *_args, **_kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 443))]
    monkeypatch.setattr(ai.socket, "getaddrinfo", addresses)
    with pytest.raises(ValueError):
        ai.public_url(url)


def test_dns_rebinding_and_mixed_public_private_resolution_are_blocked(monkeypatch):
    monkeypatch.setattr(ai.socket, "getaddrinfo", lambda *_a, **_k: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443)), (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.1", 443))])
    with pytest.raises(ValueError):
        ai.public_url("https://evil.example/")


def test_model_output_rejects_unsafe_graph_values_and_dangling_edges(monkeypatch):
    invalid = model_output(graphs=[{"title": "Bad", "points": [{"label": "A", "value": float("inf")}]}])
    mock_ollama(monkeypatch, invalid)
    response = client.post("/api/v1/assistant/generate", headers=HEADERS, json=study_request())
    assert response.status_code == 200 and response.json()["graphs"] == []
    assert any("graphs were omitted" in warning for warning in response.json()["warnings"])
    invalid = model_output(diagrams=[{"title": "Broken", "nodes": [{"id": "a", "label": "A"}], "edges": [{"from": "a", "to": "missing"}]}])
    mock_ollama(monkeypatch, invalid)
    response = client.post("/api/v1/assistant/generate", headers=HEADERS, json=study_request())
    assert response.status_code == 200 and response.json()["diagrams"] == []
    assert any("diagrams were omitted" in warning for warning in response.json()["warnings"])


def test_vision_actions_require_visible_same_origin_read_only_links(monkeypatch):
    plan = {"summary": "The assignment is in Modules.", "actions": [
        {"kind": "open", "description": "Open module", "url": "/courses/1/modules"},
        {"kind": "open", "description": "Start quiz", "url": "/courses/1/quizzes/5/take"},
        {"kind": "open", "description": "External", "url": "https://evil.example"},
        {"kind": "find", "description": "Locate the homework", "text": "Homework"},
    ]}
    mock_ollama(monkeypatch, plan)
    result = client.post("/api/v1/assistant/browser/plan", headers=HEADERS, json={"goal": "Find homework", "url": "https://school.instructure.com/courses/1", "text": "Modules /courses/1/modules Quiz /courses/1/quizzes/5/take"})
    assert result.status_code == 200
    data = result.json()
    assert len(data["actions"]) == 2
    assert data["actions"][0]["url"] == "https://school.instructure.com/courses/1/modules"
    assert any("No screenshot" in warning for warning in data["warnings"])


def test_read_actions_reject_unsafe_missing_and_hallucinated_urls(monkeypatch):
    plan = {"summary": "Read the course resources.", "actions": [
        {"kind": "read", "description": "Read visible file", "url": "/courses/1/files/4"},
        {"kind": "read", "description": "Read external page", "url": "https://evil.example/read"},
        {"kind": "read", "description": "Read invented file", "url": "/courses/1/files/999"},
        {"kind": "read", "description": "Missing target"},
    ]}
    mock_ollama(monkeypatch, plan)
    response = client.post("/api/v1/assistant/browser/plan", headers=HEADERS, json={"goal": "Read lecture notes", "url": "https://school.instructure.com/courses/1", "text": "Files /courses/1/files/4 External https://evil.example/read"})
    assert response.status_code == 200
    actions = response.json()["actions"]
    assert len(actions) == 1 and actions[0]["url"] == "https://school.instructure.com/courses/1/files/4"


@pytest.mark.parametrize("candidate", [
    "/courses/1/%71uizzes/3/take", "/courses/1/%2571uizzes/3/take", "/courses/1/quizzes;view/3", "/courses/1/%73ubmissions/3", "/courses/1/assignments/3%5Csubmit", "https://school.instructure.com:BAD/courses/1", "https://[malformed/courses/1",
])
def test_navigation_normalizes_encoded_paths_and_handles_malformed_urls(candidate):
    assert ai.allowed_browser_url(candidate, "https://school.instructure.com/courses/1") is None


def test_generic_assignment_title_uses_local_academic_topics_for_research(monkeypatch):
    calls = []
    mock_ollama(monkeypatch, {"topics": ["photosynthesis light reactions", "calvin cycle"]}, calls)
    request = ai.StudyRequest.model_validate(study_request(assignment={"title": "Homework #3", "description": "PRIVATE NAME AND STUDENT ID 12345. Explain light reactions and the Calvin cycle.", "url": "https://school.instructure.com"}))
    query, warning = ai.research_query(request)
    assert "photosynthesis light reactions" in query and "calvin cycle" in query
    assert "private" not in query.lower() and "12345" not in query
    assert "inferred locally" in warning
    chat = next(body for path, body in calls if path == "/api/chat")
    assert "PRIVATE NAME" in chat["messages"][1]["content"]


def test_generic_assignment_skips_research_when_no_reliable_topics_exist(monkeypatch):
    mock_ollama(monkeypatch, {"topics": ["homework assignment", "somebody@example.com", "Student Private Name"]})
    request = ai.StudyRequest.model_validate(study_request(assignment={"title": "Assignment 2", "description": "No topic supplied."}))
    query, warning = ai.research_query(request)
    assert query is None and "skipped" in warning


def test_invalid_screenshot_is_rejected_before_ollama(monkeypatch):
    monkeypatch.setattr(ai, "ollama_request", lambda *_a, **_k: pytest.fail("Invalid image must not reach Ollama"))
    response = client.post("/api/v1/assistant/browser/plan", headers=HEADERS, json={"goal": "Read", "url": "https://school.instructure.com", "screenshot": "not base64"})
    assert response.status_code == 422


def test_background_jobs_complete_and_expired_results_are_removed(monkeypatch):
    mock_ollama(monkeypatch)
    response = client.post("/api/v1/assistant/jobs", headers=HEADERS, json={"type": "generate", "request": study_request()})
    assert response.status_code == 202
    job_id = response.json()["id"]
    for _ in range(100):
        data = client.get(f"/api/v1/assistant/jobs/{job_id}").json()
        if data["status"] != "running":
            break
        time.sleep(.005)
    assert data["status"] == "complete" and data["result"]["title"] == "Photosynthesis"
    ai._JOBS[job_id]["updated"] = time.monotonic() - 1801
    assert client.get(f"/api/v1/assistant/jobs/{job_id}").status_code == 404


def test_text_and_docx_extraction_stays_local():
    text = "Readable assignment instructions from a Canvas file."
    response = client.post("/api/v1/assistant/materials/extract", headers=HEADERS, json={"title": "assignment.txt", "mimeType": "text/plain", "data": base64.b64encode(text.encode()).decode()})
    assert response.status_code == 200 and response.json()["text"] == text
    document = io.BytesIO()
    with zipfile.ZipFile(document, "w") as archive:
        archive.writestr("word/document.xml", '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Assignment from DOCX.</w:t></w:r></w:p></w:body></w:document>')
    response = client.post("/api/v1/assistant/materials/extract", headers=HEADERS, json={"title": "assignment.docx", "data": base64.b64encode(document.getvalue()).decode()})
    assert response.status_code == 200
    assert response.json()["text"] == "Assignment from DOCX."


def test_real_pdf_text_extraction_and_scanned_pdf_failure():
    from pypdf import PdfWriter
    from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject
    writer = PdfWriter()
    page = writer.add_blank_page(width=612, height=792)
    font = DictionaryObject({NameObject("/Type"): NameObject("/Font"), NameObject("/Subtype"): NameObject("/Type1"), NameObject("/BaseFont"): NameObject("/Helvetica")})
    page[NameObject("/Resources")] = DictionaryObject({NameObject("/Font"): DictionaryObject({NameObject("/F1"): font})})
    content = DecodedStreamObject()
    content.set_data(b"BT /F1 12 Tf 50 700 Td (Compare light reactions and the Calvin cycle.) Tj ET")
    page[NameObject("/Contents")] = writer._add_object(content)
    file = io.BytesIO()
    writer.write(file)
    response = client.post("/api/v1/assistant/materials/extract", headers=HEADERS, json={"title": "assignment.pdf", "mimeType": "application/pdf", "data": base64.b64encode(file.getvalue()).decode()})
    assert response.status_code == 200, response.text
    assert "Calvin cycle" in response.json()["text"]
    empty = PdfWriter()
    empty.add_blank_page(width=612, height=792)
    file = io.BytesIO()
    empty.write(file)
    response = client.post("/api/v1/assistant/materials/extract", headers=HEADERS, json={"title": "scanned.pdf", "data": base64.b64encode(file.getvalue()).decode()})
    assert response.status_code == 422 and "scanned" in response.json()["detail"]


def test_docx_zip_bombs_and_active_xml_are_rejected():
    document = io.BytesIO()
    with zipfile.ZipFile(document, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("word/document.xml", "x" * (12 * 1024 * 1024 + 1))
    response = client.post("/api/v1/assistant/materials/extract", headers=HEADERS, json={"title": "bomb.docx", "data": base64.b64encode(document.getvalue()).decode()})
    assert response.status_code == 413
    document = io.BytesIO()
    with zipfile.ZipFile(document, "w") as archive:
        archive.writestr("word/document.xml", '<!DOCTYPE doc [<!ENTITY test "xx">]><doc>&test;</doc>')
    assert client.post("/api/v1/assistant/materials/extract", headers=HEADERS, json={"title": "entity.docx", "data": base64.b64encode(document.getvalue()).decode()}).status_code == 422


def test_unsupported_files_and_invalid_base64_fail_clearly():
    assert client.post("/api/v1/assistant/materials/extract", headers=HEADERS, json={"title": "bad.txt", "data": "@@@"}).status_code == 422
    response = client.post("/api/v1/assistant/materials/extract", headers=HEADERS, json={"title": "slides.pptx", "mimeType": "application/octet-stream", "data": base64.b64encode(b"some bytes").decode()})
    assert response.status_code == 415


def test_model_download_is_async_and_allowlisted(monkeypatch):
    mock_ollama(monkeypatch)
    response = client.post("/api/v1/assistant/models/pull", headers=HEADERS, json={"model": "qwen3:8b"})
    assert response.status_code == 202
    assert response.json()["model"] == "qwen3:8b"
    assert client.post("/api/v1/assistant/models/pull", headers=HEADERS, json={"model": "unknown-cloud-model"}).status_code == 422


def test_any_exact_installed_local_model_is_accepted_and_missing_alias_is_rejected(monkeypatch):
    mock_ollama(monkeypatch)
    response = client.post("/api/v1/assistant/generate", headers=HEADERS, json=study_request(model="gpt-oss:20b"))
    assert response.status_code == 200 and response.json()["model"] == "gpt-oss:20b"
    missing = client.post("/api/v1/assistant/generate", headers=HEADERS, json=study_request(model="qwen3:30b"))
    assert missing.status_code == 409 and "not installed locally" in missing.json()["detail"]


def test_gpt_oss_thinking_low_and_non_thinking_models_omit_think(monkeypatch):
    ai._MODEL_DETAILS.clear()
    calls = []
    def ollama(path, payload=None, timeout=8):
        calls.append((path, payload))
        if path == "/api/tags":
            return {"models": [{"name": "gpt-oss:20b"}, {"name": "gemma3:4b"}]}
        if path == "/api/show":
            return {"capabilities": ["completion", "thinking"] if payload["model"].startswith("gpt-oss") else ["completion", "vision"]}
        if path == "/api/generate":
            return {"done": True}
        return {"message": {"content": json.dumps(model_output())}}
    monkeypatch.setattr(ai, "ollama_request", ollama)
    for model in ("gpt-oss:20b", "gemma3:4b"):
        assert client.post("/api/v1/assistant/generate", headers=HEADERS, json=study_request(model=model)).status_code == 200
    chats = [body for path, body in calls if path == "/api/chat"]
    assert chats[0]["think"] == "low"
    assert "think" not in chats[1]
    ai._MODEL_DETAILS.clear()


@pytest.mark.parametrize('thinking,expected', [
    ({'values': [True], 'default': True}, True),
    ({'values': [True, False], 'default': True}, False),
    ({'values': ['high', 'medium', 'low'], 'default': 'medium'}, 'low'),
])
def test_generation_uses_least_costly_advertised_thinking_mode(monkeypatch, thinking, expected):
    calls = []
    monkeypatch.setattr(ai, 'installed_model', lambda *_a, **_k: {
        'capabilities': ['completion', 'thinking'], 'thinking': thinking, 'contextLength': 262144,
    })
    def respond(path, payload=None, timeout=8):
        if path == '/api/chat':
            calls.append(json.loads(json.dumps(payload)))
        return {'message': {'content': json.dumps(model_output())}}
    monkeypatch.setattr(ai, 'ollama_request', respond)
    ai.model_json('qwen3:30b-a3b-thinking-2507-q8_0', [{'role': 'user', 'content': 'Explain.'}], ai.ModelStudyOutput, 2600)
    assert calls[0]['think'] == expected
    assert type(calls[0]['think']) is type(expected)
    if expected is True:
        assert 'temperature' not in calls[0]['options']
    else:
        assert calls[0]['options']['temperature'] == 0


def test_model_details_caches_advertised_thinking_constraints(monkeypatch):
    ai._MODEL_DETAILS.clear()
    calls = []
    thinking = {'values': [True], 'default': True}
    def show(path, payload=None, timeout=8):
        calls.append((path, payload))
        assert path == '/api/show'
        return {'capabilities': ['completion', 'thinking'], 'thinking': thinking,
                'model_info': {'qwen3moe.context_length': 262144}}
    monkeypatch.setattr(ai, 'ollama_request', show)
    tag = {'name': 'thinking-constraints-test', 'digest': 'fixed-digest'}
    try:
        first = ai.model_details(tag)
        second = ai.model_details(tag)
        assert first['thinking'] == thinking
        assert second['thinking'] == thinking
        assert first['contextLength'] == 262144
        assert len(calls) == 1
    finally:
        ai._MODEL_DETAILS.clear()


def test_screenshot_rejects_installed_text_only_model(monkeypatch):
    mock_ollama(monkeypatch)
    # A complete PNG header is sufficient for the preflight format check.
    image = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\x00" * 16).decode()
    response = client.post("/api/v1/assistant/browser/plan", headers=HEADERS, json={"goal": "Read", "url": "https://school.instructure.com", "model": "gpt-oss:20b", "screenshot": image})
    assert response.status_code == 409 and "vision support" in response.json()["detail"]


def test_context_budget_trims_large_documents_and_reserves_response_capacity(monkeypatch):
    mock_ollama(monkeypatch)
    for level in ("a_bit", "a_bit_more", "all_in"):
        payload = ai.StudyRequest.model_validate(study_request(level=level))
        documents = [{"id": f"S{i}", "title": "Relevant source", "text": "Large course material. " * 4000} for i in range(2, 25)]
        sources = [ai.Source(id=document["id"], title=document["title"], url="https://school.instructure.com/file", kind="canvas") for document in documents]
        system = "System schema and instructions. " * 200
        tokens = ai.DEPTHS[level]["tokens"]
        context, length, shortened = ai.bounded_study_context(payload, sources, documents, system, tokens)
        assert shortened
        estimated_input = (len(system) + len(json.dumps(context, ensure_ascii=False))) / 3
        assert estimated_input + tokens + 512 <= length


def test_invalid_core_output_gets_one_compact_schema_repair_attempt(monkeypatch):
    calls = []
    mock_ollama(monkeypatch)
    original = ai.ollama_request
    def sequence(path, payload=None, timeout=8):
        if path == "/api/chat":
            calls.append(payload.copy())
            output = {"title": "Missing required markdown"} if len(calls) == 1 else model_output()
            return {"message": {"content": json.dumps(output)}}
        return original(path, payload, timeout)
    monkeypatch.setattr(ai, "ollama_request", sequence)
    response = client.post("/api/v1/assistant/generate", headers=HEADERS, json=study_request())
    assert response.status_code == 200
    assert len(calls) == 2
    assert "failed local schema validation" in calls[1]["messages"][-1]["content"]
    assert len(calls[1]["messages"][-1]["content"]) < 1600
    assert all(call["options"]["temperature"] == 0 for call in calls)


def test_missing_sample_is_repaired_and_persistent_core_errors_remain_explicit(monkeypatch):
    mock_ollama(monkeypatch)
    original = ai.ollama_request
    calls = []
    def sequence(path, payload=None, timeout=8):
        if path == "/api/chat":
            calls.append(payload)
            return {"message": {"content": json.dumps(model_output(sampleMarkdown="" if len(calls) == 1 else "# Sample assignment for review\nA complete worked reference."))}}
        return original(path, payload, timeout)
    monkeypatch.setattr(ai, "ollama_request", sequence)
    response = client.post("/api/v1/assistant/generate", headers=HEADERS, json=study_request(mode="sample"))
    assert response.status_code == 200 and len(calls) == 2
    monkeypatch.setattr(ai, "ollama_request", lambda path, payload=None, timeout=8: {"message": {"content": "{}"}} if path == "/api/chat" else original(path, payload, timeout))
    response = client.post("/api/v1/assistant/generate", headers=HEADERS, json=study_request())
    assert response.status_code == 502 and "after one repair attempt" in response.json()["detail"]


def test_research_falls_back_when_duckduckgo_is_blocked_or_empty(monkeypatch):
    calls = []
    monkeypatch.setattr(ai, "fallback_search", lambda query, limit, fetch: calls.append((query, limit)) or [{"title": "Interval scheduling", "url": "https://en.wikipedia.org/wiki/Interval_scheduling", "snippet": "A scheduling problem", "_provider": "Wikipedia"}])
    def denied(*args, **kwargs):
        raise ValueError("HTTP 202 anti-bot")
    monkeypatch.setattr(ai, "fetch_public_html", denied)
    assert ai.search_web("interval scheduling", 3)[0]["_provider"] == "Wikipedia"
    monkeypatch.setattr(ai, "fetch_public_html", lambda *_a, **_k: ("<html>No results</html>", "https://html.duckduckgo.com"))
    assert ai.search_web("interval scheduling", 3)[0]["_provider"] == "Wikipedia"
    assert len(calls) == 2


def test_irrelevant_site_assets_are_not_assignment_images():
    assert not ai.germane_image("/_static/copy-button.svg", "Copy this Python example", "Python scheduling tutorial")
    assert not ai.germane_image("/assets/brand.png", "Example corporation website branding", "Interval scheduling")
    assert ai.germane_image("/figures/intervals.png", "Diagram showing compatible intervals", "Interval scheduling")


def test_generated_asset_paths_mermaid_and_unverified_citations_do_not_reach_export():
    output = ai.ModelStudyOutput.model_validate(model_output(sampleMarkdown="![Concept diagram](diagram.png)\n[Source](https://invented.example) [S99]\n[Course](https://school.instructure.com/file)\n```mermaid\ngraph TD; A-->B\n```\n```markdown\n![Example syntax](example.png)\n```"))
    warnings = ai.clean_generated_markdown(output, [ai.Source(id="S1", title="File", url="https://school.instructure.com/file", kind="canvas")])
    assert "diagram.png" not in output.sampleMarkdown
    assert "invented.example" not in output.sampleMarkdown and "[S99]" not in output.sampleMarkdown
    assert "Course [S1]" in output.sampleMarkdown
    assert "```mermaid" not in output.sampleMarkdown
    assert "![Example syntax](example.png)" in output.sampleMarkdown
    assert warnings and "unverified citations" in warnings[0]


def test_underescaped_latex_is_preserved_without_corrupting_json_newlines_or_tabs():
    raw = r'{"title":"Math","summary":"Example","markdown":"Math \(f_1\le f_2, \frac{a}{b}, \text{value}, \begin{matrix}x\end{matrix}\).\nNext\tcolumn; quote \"ok\"; Unicode \u2264; \underbrace{x}.","sampleMarkdown":"","diagrams":[],"graphs":[]}'
    fixed = ai.normalise_json_escapes(raw)
    output = ai.ModelStudyOutput.model_validate_json(fixed)
    assert r"\(f_1\le f_2" in output.markdown
    assert r"\frac{a}{b}" in output.markdown and r"\text{value}" in output.markdown
    assert r"\begin{matrix}" in output.markdown and r"\underbrace{x}" in output.markdown
    assert '\nNext\tcolumn; quote "ok"; Unicode ≤' in output.markdown
    assert not any(char in output.markdown for char in ("\b", "\f", "\v"))


def test_already_correct_json_math_escapes_are_unchanged():
    value = {"text": r'Correct \(\frac{a}{b}\), \[\text{"quoted"}\], path C:\folder\file, \underbrace{x}.' + "\nNext\tcolumn"}
    raw = json.dumps(value)
    assert ai.normalise_json_escapes(raw) == raw
    assert json.loads(ai.normalise_json_escapes(raw)) == value


def test_actual_math_json_escape_failure_is_recovered_before_schema_retry(monkeypatch):
    mock_ollama(monkeypatch)
    original = ai.ollama_request
    calls = []
    def invalid_escapes(path, payload=None, timeout=8):
        if path == "/api/chat":
            calls.append(path)
            return {"message": {"content": r'{"title":"Interval scheduling","summary":"Earliest finish","markdown":"The proof uses \(f_1\le f_2\) and \(O(n\log n)\).","sampleMarkdown":"# Sample assignment for review\nUse \(s_i\ge f_j\).","diagrams":[],"graphs":[]}'}}
        return original(path, payload, timeout)
    monkeypatch.setattr(ai, "ollama_request", invalid_escapes)
    response = client.post("/api/v1/assistant/generate", headers=HEADERS, json=study_request(mode="sample"))
    assert response.status_code == 200 and len(calls) == 1
    assert r"\(s_i\ge f_j\)" in response.json()["sampleMarkdown"]


def test_configured_general_search_uses_api_and_rejects_credential_redirects(monkeypatch):
    monkeypatch.setenv('OFFCANVAS_BRAVE_SEARCH_API_KEY', 'test-only-key')
    calls = []
    def fetch(url, **kwargs):
        calls.append((url, kwargs))
        return json.dumps({'web': {'results': [
            {'title': 'Laplace course notes', 'url': 'https://university.example/laplace', 'description': 'Time shift property'},
            {'title': 'Duplicate', 'url': 'https://university.example/laplace'},
            {'title': 'Unsafe', 'url': 'javascript:alert(1)'},
        ]}}), url
    monkeypatch.setattr(ai, 'fetch_public_html', fetch)
    result = ai.optional_brave_search('Laplace time shift', 5)
    assert len(result) == 1 and result[0]['title'] == 'Laplace course notes'
    assert calls[0][0].startswith('https://api.search.brave.com/')
    assert 'test-only-key' not in calls[0][0]
    assert calls[0][1]['redirects'] == 0
    assert calls[0][1]['extra_headers']['X-Subscription-Token'] == 'test-only-key'


def test_google_search_extracts_real_links_and_excludes_google_navigation(monkeypatch):
    calls = []
    def fetch(url, **kwargs):
        calls.append(url)
        return '<a href="https://support.google.com/websearch">Help</a><a href="/url?q=https%3A%2F%2Funiversity.example%2Flaplace"><h3>Laplace notes</h3></a><a href="https://university.example/laplace">Duplicate</a>', url
    monkeypatch.setattr(ai, 'fetch_public_html', fetch)
    results = ai.search_web('Laplace time shift', 3)
    assert calls[0].startswith('https://www.google.com/search?q=')
    assert results == [{'title':'Laplace notes','url':'https://university.example/laplace','snippet':''}]


def test_browser_discovered_results_are_used_without_server_search(monkeypatch):
    monkeypatch.setattr(ai, 'search_web', lambda *_: pytest.fail('Browser results should bypass server search'))
    monkeypatch.setattr(ai, 'read_page', lambda result: ({'title':result['title'],'url':result['url'],'text':'A real browser-discovered source.'}, []))
    payload = ai.StudyRequest.model_validate(study_request(webResearch=True, webSources=[{'title':'University Laplace guide','url':'https://university.example/laplace','snippet':'Time shifting'}]))
    sources, documents, _, warnings = ai.collect_sources(payload)
    assert any(s.url == 'https://university.example/laplace' and s.kind == 'web' for s in sources)
    assert not any('Google search could not' in w for w in warnings)


@pytest.mark.parametrize('updates', [
    {'assignmentKind':'other'},
    {'assignment':{'id':'2','title':'Homework quiz','description':'Solve x + 2 = 4.','url':'https://school.instructure.com/courses/1/quizzes/2'}},
    {'assignment':{'id':'2','title':'Homework','description':'A proctored assignment.'}},
    {'assignment':{'id':'2','title':'Homework','description':'Solve x + 2 = 4.','submissionTypes':['online_quiz']}},
    {'assignment':{'id':'2','title':'Homework','description':''}},
])
def test_autopilot_is_homework_only_and_rejected_before_model_or_web(monkeypatch, updates):
    monkeypatch.setattr(ai, 'installed_model', lambda *_: pytest.fail('Rejected before inference'))
    request = study_request(autopilot=True, assignmentKind='homework')
    request.update(updates)
    response = client.post('/api/v1/assistant/jobs', headers=HEADERS, json={'type':'generate','request':request})
    assert response.status_code == 422


def test_requirement_parser_discards_invented_evidence_and_preserves_numbered_items(monkeypatch):
    payload = ai.StudyRequest.model_validate(study_request(autopilot=True, assignmentKind='homework', assignment={
        'id':'2','title':'Homework 2','description':'1. Solve x + 2 = 4.\n2. Plot f(t)=exp(-t).'}))
    monkeypatch.setattr(ai, 'model_json', lambda *_a, **_k: ai.AssignmentBrief(summary='Algebra and a plot',requirements=[
        ai.Requirement(id='anything',text='Solve the equation',evidence='Solve x + 2 = 4.'),
        ai.Requirement(id='made-up',text='Perform an experiment',evidence='Measure three trials.'),
    ]))
    brief = ai.parse_homework(payload)
    assert [r.id for r in brief.requirements] == ['R1','R2']
    assert any('Plot f(t)' in r.text for r in brief.requirements)
    assert not any('experiment' in r.text for r in brief.requirements)


def test_review_downgrades_unsupported_coverage_and_fills_omitted_items(monkeypatch):
    brief = ai.AssignmentBrief(summary='Work',requirements=[
        ai.Requirement(id='R1',text='Solve',evidence='Solve'),ai.Requirement(id='R2',text='Plot',evidence='Plot')])
    monkeypatch.setattr(ai, 'model_json', lambda *_a, **_k: ai.AssignmentReview(coverage=[
        ai.CoverageItem(requirementId='R1',status='covered',evidence='A made-up answer')]))
    review = ai.review_homework(ai.StudyRequest.model_validate(study_request()),brief,'x = 2')
    assert [r.status for r in review.coverage] == ['partial','missing']


def test_autopilot_revises_once_and_reports_actual_pipeline_stages(monkeypatch):
    mock_ollama(monkeypatch)
    calls, stages = [], []
    brief = ai.AssignmentBrief(summary='Solve the equation',requirements=[ai.Requirement(id='R1',text='Solve x + 2 = 4.',evidence='Solve x + 2 = 4.')])
    def model(_model, _messages, output_type, *_args, **_kwargs):
        calls.append(output_type)
        if output_type is ai.AssignmentBrief: return brief
        if output_type is ai.AssignmentReview:
            return ai.AssignmentReview(coverage=[ai.CoverageItem(requirementId='R1',status='partial' if calls.count(ai.AssignmentReview)==1 else 'covered',evidence='' if calls.count(ai.AssignmentReview)==1 else 'x = 2',notes='Show the solution.')])
        return ai.SampleStudyOutput.model_validate(model_output(sampleMarkdown='Sample assignment for review\nx = 2\nAI assistance disclosed.'))
    monkeypatch.setattr(ai,'model_json',model)
    token=ai._PROGRESS.set(lambda stage,label:stages.append(stage))
    try:
        response=client.post('/api/v1/assistant/generate',headers=HEADERS,json=study_request(autopilot=True,assignmentKind='homework',assignment={
            'id':'2','title':'Homework 2','description':'Solve x + 2 = 4.'}))
    finally: ai._PROGRESS.reset(token)
    assert response.status_code == 200, response.text
    result=response.json()
    assert result['autopilot'] and result['level']=='all_in'
    assert r'\begin{document}' in result['finalLatex']
    assert 'x = 2' in result['finalLatex']
    assert 'Study guide' not in result['finalLatex']
    assert result['review']['coverage'][0]['status']=='covered'
    assert calls.count(ai.SampleStudyOutput)==2 and calls.count(ai.AssignmentReview)==2
    assert stages == ['parsing','researching','drafting','rendering','reviewing','revising','rendering','reviewing','formatting','complete']
    assert result['diagrams']==[] and result['graphs']==[]


@pytest.mark.parametrize('failure', ['review', 'revision', 'revised_review'])
def test_autopilot_preserves_original_sample_and_figures_when_optional_repair_fails(monkeypatch, failure):
    mock_ollama(monkeypatch)
    calls = []
    brief = ai.AssignmentBrief(summary='Solve and plot', requirements=[ai.Requirement(id='R1', text='Solve x + 2 = 4.', evidence='Solve x + 2 = 4.')])
    def model(_model, _messages, output_type, *_args, **_kwargs):
        calls.append(output_type)
        if output_type is ai.AssignmentBrief:
            return brief
        if output_type is ai.AssignmentReview:
            if failure == 'review' or failure == 'revised_review' and calls.count(ai.AssignmentReview) == 2:
                raise ai.HTTPException(502, 'The model hit its response limit.')
            return ai.AssignmentReview(coverage=[ai.CoverageItem(requirementId='R1', status='partial', notes='Explain the intermediate step.')])
        if calls.count(ai.SampleStudyOutput) == 2 and failure == 'revision':
            raise ai.HTTPException(502, 'The model hit its response limit.')
        sample = 'Original complete sample: x = 2. AI assistance disclosed.' if calls.count(ai.SampleStudyOutput) == 1 else 'Candidate revision: x = 9.'
        return ai.SampleStudyOutput.model_validate(model_output(sampleMarkdown=sample))
    monkeypatch.setattr(ai, 'model_json', model)
    response = client.post('/api/v1/assistant/generate', headers=HEADERS, json=study_request(autopilot=True, assignmentKind='homework', assignment={
        'id':'2', 'title':'Homework 2', 'description':'Solve x + 2 = 4. Plot f(t)=exp(-t).'}))
    assert response.status_code == 200, response.text
    result = response.json()
    assert 'Original complete sample' in result['sampleMarkdown'] and 'x = 9' not in result['sampleMarkdown']
    assert result['renderedVisuals'] and base64.b64decode(result['renderedVisuals'][0]['data']).startswith(b'\x89PNG\r\n\x1a\n')
    assert result['review']['coverage'][0]['status'] == 'partial'
    assert any('could not finish' in warning for warning in result['warnings'])


def test_autopilot_job_returns_live_progress(monkeypatch):
    payload=ai.StudyRequest.model_validate(study_request())
    def generate(_payload):
        ai.report_stage('parsing','Reading homework')
        assert ai._JOBS['stage-test']['stage']=='parsing'
        return ai.StudyPacket.model_validate(model_output())
    monkeypatch.setattr(ai,'generate_study_packet',generate)
    ai._JOBS['stage-test']={'id':'stage-test','status':'running','updated':time.monotonic()}
    ai.run_job('stage-test','generate',payload)
    assert ai.get_job('stage-test')['stage']=='complete'
    ai._JOBS.pop('stage-test')


def test_requirement_parser_recovers_exact_sentences_when_model_rewrites_math(monkeypatch):
    payload = ai.StudyRequest.model_validate(study_request(assignment={'title':'Homework','description':'Plot f(t) = exp(-t). Explain the decay.'}, resources=[]))
    monkeypatch.setattr(ai,'model_json',lambda *_a,**_k:ai.AssignmentBrief(summary='Decay',requirements=[ai.Requirement(id='R1',text='Plot it',evidence='Plot f(t)=e^-t')]))
    brief=ai.parse_homework(payload)
    assert [r.evidence for r in brief.requirements]==['Plot f(t) = exp(-t).','Explain the decay.']


def test_visual_preferences_prevent_disabled_figures_and_legacy_numeric_fabrication(monkeypatch):
    mock_ollama(monkeypatch,model_output(visualSpecs=[{'kind':'function','title':'Decay','sourceId':'S1','quote':'Plot f(t)=exp(-t).','expression':'exp(-t)','variable':'t','xMin':0,'xMax':5}]))
    monkeypatch.setattr(ai,'render_visuals',lambda *_a:pytest.fail('Graphs disabled'))
    response=client.post('/api/v1/assistant/generate',headers=HEADERS,json=study_request(assignment={'title':'Homework','description':'Plot f(t)=exp(-t).'},visualPreferences={'graphs':False,'diagrams':False,'images':False}))
    assert response.status_code==200,response.text
    assert response.json()['renderedVisuals']==[] and response.json()['diagrams']==[] and response.json()['graphs']==[]


def test_research_job_infers_topics_and_browser_results_skip_duplicate_inference(monkeypatch):
    mock_ollama(monkeypatch)
    monkeypatch.setattr(ai, 'research_query', lambda *_: ('integration by parts learning resources', None))
    request=study_request()
    response=client.post('/api/v1/assistant/jobs',headers=HEADERS,json={'type':'research','request':request})
    assert response.status_code==202,response.text
    job_id=response.json()['id']
    for _ in range(100):
        state=client.get('/api/v1/assistant/jobs/'+job_id).json()
        if state['status']!='running':break
        time.sleep(.01)
    assert state['status']=='complete' and state['result']['query']=='integration by parts learning resources'
    monkeypatch.setattr(ai, 'research_query', lambda *_:pytest.fail('Browser sources need no second topic inference'))
    monkeypatch.setattr(ai, 'read_page', lambda result:({'title':result['title'],'url':result['url'],'text':'A public explanation.'},[]))
    payload=ai.StudyRequest.model_validate(study_request(webResearch=True,webSources=[{'title':'Public guide','url':'https://university.example/guide'}]))
    assert any(source.kind=='web' for source in ai.collect_sources(payload)[0])


def test_reu_job_preserves_selected_model_candidates_and_dictionary_results(monkeypatch):
    import reu_finder
    captured = []
    def discover(topics, supplied, model):
        captured.append((topics, supplied, model))
        ai.report_stage('summarizing', 'Summarizing application details locally')
        return {'opportunities': [], 'query': 'REU robotics', 'checkedAt': '2026-11-09T00:00:00Z', 'message': ''}
    monkeypatch.setattr(reu_finder, 'discover', discover)
    response = client.post('/api/v1/assistant/jobs', headers=HEADERS, json={
        'type': 'reu', 'request': {'topics':['robotics'], 'model':'qwen3:8b', 'candidates':[{'title':'Robotics REU','url':'https://university.edu/reu'}]},
    })
    assert response.status_code == 202, response.text
    for _ in range(100):
        state = client.get('/api/v1/assistant/jobs/' + response.json()['id']).json()
        if state['status'] != 'running':
            break
        time.sleep(.01)
    assert state['status'] == 'complete', state
    assert state['result']['query'] == 'REU robotics'
    assert captured == [(['robotics'], [{'title':'Robotics REU','url':'https://university.edu/reu'}], 'qwen3:8b')]
    invalid = client.post('/api/v1/assistant/jobs', headers=HEADERS, json={'type':'reu','request':{'topics':[],'model':'qwen3:8b'}})
    assert invalid.status_code == 422


def test_review_accepts_only_literal_interior_of_wrapped_quote(monkeypatch):
    brief=ai.AssignmentBrief(summary='Solve',requirements=[ai.Requirement(id='R1',text='Solve',evidence='Solve')])
    monkeypatch.setattr(ai,'model_json',lambda *_a,**_k:ai.AssignmentReview(coverage=[ai.CoverageItem(requirementId='R1',status='covered',evidence='"x = 2"')]))
    review=ai.review_homework(ai.StudyRequest.model_validate(study_request()),brief,'The answer is x = 2.')
    assert review.coverage[0].status=='covered' and review.coverage[0].evidence=='x = 2'


@pytest.mark.parametrize('sentinel', ['None', 'None – all required data are present in the instructions.', 'No missing information', 'Not applicable', 'N/A'])
def test_requirement_parser_removes_no_missing_information_sentinels(monkeypatch, sentinel):
    payload=ai.StudyRequest.model_validate(study_request(assignment={'title':'Homework','description':'Solve x + 2 = 4.'}))
    monkeypatch.setattr(ai,'model_json',lambda *_a,**_k:ai.AssignmentBrief(summary='Solve',requirements=[ai.Requirement(id='R1',text='Solve',evidence='Solve x + 2 = 4.')],missingInformation=[sentinel,'The measured temperature was not supplied.']))
    assert ai.parse_homework(payload).missingInformation==['The measured temperature was not supplied.']


def test_complete_sample_survives_invalid_optional_visual_specs(monkeypatch):
    monkeypatch.setattr(ai, 'installed_model', lambda *_a, **_k: {'capabilities': []})
    data = model_output(sampleMarkdown='A complete reference sample with calculations.', visualSpecs=[{'kind':'function','expression':'invented'}])
    monkeypatch.setattr(ai, 'ollama_request', lambda *_a, **_k: {'message':{'content':json.dumps(data)}})
    result = ai.model_json('gpt-oss:20b', [], ai.SampleStudyOutput, 2000)
    assert result.sampleMarkdown == data['sampleMarkdown']
    assert result.visualSpecs == []
    assert result._validation_warnings


def test_model_json_accepts_complete_object_with_preamble_and_literal_newlines(monkeypatch):
    monkeypatch.setattr(ai, 'installed_model', lambda *_a, **_k: {'capabilities': []})
    data = model_output(markdown='First line\nSecond line')
    raw = 'Here is the packet:\n' + json.dumps(data).replace('First line\\nSecond line','First line\nSecond line') + '\nEnd.'
    monkeypatch.setattr(ai, 'ollama_request', lambda *_a, **_k: {'message':{'content':raw}})
    result = ai.model_json('gpt-oss:20b', [], ai.ModelStudyOutput, 2000)
    assert result.markdown == 'First line\nSecond line'


@pytest.mark.parametrize('raw', ['[]', 'null', '"incomplete response"', '42'])
def test_malformed_model_json_returns_retryable_error_without_crashing(monkeypatch, raw):
    monkeypatch.setattr(ai, 'installed_model', lambda *_a, **_k: {'capabilities': []})
    monkeypatch.setattr(ai, 'ollama_request', lambda *_a, **_k: {'message': {'content': raw}})
    with pytest.raises(ai.HTTPException) as failure:
        ai.model_json('gpt-oss:20b', [], ai.ModelStudyOutput, 2000)
    assert failure.value.status_code == 502
    assert 'Retry' in failure.value.detail


def test_supported_canvas_preflight_is_allowed_but_arbitrary_sites_are_not():
    response = client.options('/api/v1/assistant/jobs', headers={'Origin':'https://usm.instructure.com','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,x-offcanvas-client'})
    assert response.status_code == 200
    assert response.headers['access-control-allow-origin'] == 'https://usm.instructure.com'
    response = client.options('/api/v1/assistant/jobs', headers={'Origin':'https://attacker.example','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'x-offcanvas-client'})
    assert response.status_code == 400


@pytest.mark.parametrize('requested,expected', [(None,16384),(8192,16384),(32768,32768),(131072,131072)])
def test_model_context_minimum_preserves_larger_windows(monkeypatch,requested,expected):
    calls=[]
    monkeypatch.setattr(ai, 'MIN_CONTEXT_TOKENS', 16384)
    mock_ollama(monkeypatch,captures=calls)
    ai.model_json('gpt-oss:20b', [{'role':'user','content':'Explain'}], ai.ModelStudyOutput, 1000, context_length=requested)
    assert next(body for path,body in calls if path=='/api/chat')['options']['num_ctx']==expected


@pytest.mark.parametrize('configured,expected', [(None,262144),('32768',32768),('100000',100000),('invalid',262144),('8192',16384),('9999999',262144)])
def test_context_configuration_uses_maximum_supported_default(monkeypatch, configured, expected):
    monkeypatch.delenv('OFFCANVAS_CONTEXT_TOKENS', raising=False)
    if configured is not None:
        monkeypatch.setenv('OFFCANVAS_CONTEXT_TOKENS', configured)
    assert ai.configured_context_tokens() == expected


def test_oversized_direct_prompt_is_rejected_before_generation(monkeypatch):
    calls = []
    monkeypatch.setattr(ai, 'MIN_CONTEXT_TOKENS', 16384)
    mock_ollama(monkeypatch, captures=calls)
    with pytest.raises(ai.HTTPException) as failure:
        ai.model_json('gpt-oss:20b', [{'role':'user','content':'x' * 60000}], ai.ModelStudyOutput, 2000)
    assert failure.value.status_code == 413
    assert 'OFFCANVAS_CONTEXT_TOKENS' in failure.value.detail
    assert not any(path == '/api/chat' for path, _ in calls)


def test_source_excerpts_preserve_full_assignment_and_student_request(monkeypatch):
    mock_ollama(monkeypatch)
    monkeypatch.setattr(ai, 'MIN_CONTEXT_TOKENS', 16384)
    description = 'Complete every subpart. ' * 350
    prompt = 'Explain each step. ' * 250
    rubric = 'Show the method and units. ' * 100
    payload = ai.StudyRequest.model_validate(study_request(prompt=prompt, assignment={**study_request()['assignment'], 'description':description, 'rubric':rubric}))
    documents = [{'id':'S2', 'title':'Lecture', 'text':'Reference detail. ' * 3000}]
    context, _, shortened = ai.bounded_study_context(payload, [], documents, 'System instructions', 2200)
    assert context['assignment']['description'] == description
    assert context['assignment']['rubric'] == rubric
    assert context['studentRequest'] == prompt
    assert shortened


def test_oversized_assignment_brief_is_rejected_instead_of_cut(monkeypatch):
    mock_ollama(monkeypatch)
    monkeypatch.setattr(ai, 'MIN_CONTEXT_TOKENS', 16384)
    payload = ai.StudyRequest.model_validate(study_request(assignment={**study_request()['assignment'], 'description':'x' * 50000}))
    with pytest.raises(ai.HTTPException) as failure:
        ai.bounded_study_context(payload, [], [], 'System instructions', 8000)
    assert failure.value.status_code == 413
    assert 'assignment brief' in failure.value.detail


def test_sample_expands_omitted_derivation_by_section(monkeypatch):
    payload=ai.StudyRequest.model_validate(study_request(mode='sample'))
    output=ai.SampleStudyOutput(title='Work',summary='',markdown='Guide',sampleMarkdown='## 1. Derivation\nFull derivation omitted for brevity; see attached PDF.\n## 2. Answer\nx = 2')
    calls=[]
    def expand(*args,**kwargs):
        calls.append(args)
        return ai.ExpandedSection(markdown='## 1. Derivation\nx + 2 = 4. Subtract 2 from both sides: x = 2.')
    monkeypatch.setattr(ai,'model_json',expand)
    result=ai.complete_sample_sections(payload,output,[])
    assert len(calls)==1 and 'Subtract 2' in result.sampleMarkdown
    assert '## 2. Answer\nx = 2' in result.sampleMarkdown
    assert 'omitted' not in result.sampleMarkdown


def test_sample_rejects_expansion_that_still_omits_work(monkeypatch):
    payload=ai.StudyRequest.model_validate(study_request(mode='sample'))
    output=ai.SampleStudyOutput(title='Work',summary='',markdown='Guide',sampleMarkdown='Full derivation omitted for brevity; see attached PDF.')
    monkeypatch.setattr(ai,'model_json',lambda *a,**k: ai.ExpandedSection(markdown='See attached PDF.'))
    with pytest.raises(ai.HTTPException,match='') as error:
        ai.complete_sample_sections(payload,output,[])
    assert error.value.status_code==502


@pytest.mark.parametrize('mode', ['sample', 'explain'])
@pytest.mark.parametrize('assignment', [
    {'id':'2','title':'Exam 2','description':'Solve the assessed problem.'},
    {'id':'2','title':'Homework','description':'Solve it.','submissionTypes':['online_quiz']},
    {'id':'2','title':'Homework','description':'Solve it.','url':'https://school.instructure.com/courses/1/quizzes/2'},
    {'id':'2','title':'Homework','description':'Do not use outside assistance.'},
])
def test_assessment_generation_cannot_bypass_restrictions_by_disabling_autopilot(monkeypatch, mode, assignment):
    monkeypatch.setattr(ai, 'installed_model', lambda *_: pytest.fail('Assessment rejected before model discovery'))
    monkeypatch.setattr(ai, 'collect_sources', lambda *_: pytest.fail('Assessment rejected before source or web research'))
    request=study_request(autopilot=False, mode=mode, assignment=assignment)
    direct=client.post('/api/v1/assistant/generate', headers=HEADERS, json=request)
    queued=client.post('/api/v1/assistant/jobs', headers=HEADERS, json={'type':'generate','request':request})
    assert direct.status_code == queued.status_code == 422
    assert 'course concepts' in direct.json()['detail']


@pytest.mark.parametrize('mode', ['sample', 'explain'])
def test_ordinary_homework_retains_non_autopilot_assistance_without_confirmation(mode):
    payload=ai.StudyRequest.model_validate(study_request(autopilot=False, mode=mode))
    ai.homework_eligible(payload)


def test_final_assignment_latex_excludes_thinking_and_preserves_math_and_figures():
    result = ai.assignment_latex('Homework & math',
        '<think>Private planning that must stay hidden.</think>\n# Problem 1\n\nThe answer is $x = 2$.\n\n' + r'\[\frac{4}{2} = 2\]',
        [{'caption': 'Computed response', 'data': 'unused'}])
    assert 'Private planning' not in result
    assert r'\frac{4}{2}' in result
    assert r'\begin{document}' in result and r'\end{document}' in result
    assert 'figure-1.png' in result
    assert r'Homework \& math' in result


def test_final_assignment_latex_reports_missing_converter(monkeypatch):
    monkeypatch.setattr(ai.shutil, 'which', lambda _: None)
    with pytest.raises(ai.HTTPException, match='Pandoc'):
        ai.assignment_latex('Homework', 'Answer', [])


def test_plain_explanations_only_use_supplied_figures():
    facts = {'courses at 80% or above': 3, 'LIVE-101 current mark': '90.7%'}
    assert ai.grounded_numbers('All 3 courses are at 80% or above; LIVE-101 is on 90.7%.', facts)
    assert not ai.grounded_numbers('LIVE-101 should reach 95% by Friday.', facts)


def test_explain_requests_reject_long_facts():
    with pytest.raises(ai.ValidationError):
        ai.ExplainRequest.model_validate({'model': 'qwen3:8b', 'topic': 'course', 'facts': {'note': 'x' * 400}})


def test_native_model_context_caps_workstation_default(monkeypatch):
    calls = []
    mock_ollama(monkeypatch, captures=calls)
    monkeypatch.setattr(ai, 'MIN_CONTEXT_TOKENS', 131072)
    monkeypatch.setattr(ai, 'installed_model', lambda *_a, **_k: {'capabilities': [], 'contextLength': 40960})
    ai.model_json('qwen3:8b', [{'role': 'user', 'content': 'Explain'}], ai.ModelStudyOutput, 1000)
    chat = next(body for path, body in calls if path == '/api/chat')
    assert chat['options']['num_ctx'] == 40960
    estimated_messages = (sum(len(message['content']) for message in chat['messages']) + 2) // 3
    assert chat['options']['num_predict'] > 1000
    assert estimated_messages + chat['options']['num_predict'] + 1024 <= 40960


def test_homework_parser_can_use_the_native_window_instead_of_2600_token_cap(monkeypatch):
    calls = []
    monkeypatch.setattr(ai, 'MIN_CONTEXT_TOKENS', 262144)
    monkeypatch.setattr(ai, 'installed_model', lambda *_a, **_k: {'capabilities': [], 'contextLength': 262144})
    def respond(path, payload=None, timeout=8):
        if path == '/api/chat':
            calls.append(json.loads(json.dumps(payload)))
            return {'message': {'content': json.dumps({'summary': 'Find the force.', 'requirements': [{'id': 'R1', 'text': 'Calculate force.', 'evidence': 'Calculate force.'}], 'missingInformation': []})}}
        return {}
    monkeypatch.setattr(ai, 'ollama_request', respond)
    payload = ai.StudyRequest.model_validate(study_request(assignment={'title': 'Practice homework', 'description': 'Calculate force.'}))
    assert ai.parse_homework(payload).requirements[0].evidence == 'Calculate force.'
    assert calls[0]['options']['num_ctx'] == 262144
    assert calls[0]['options']['num_predict'] > 100000


def test_source_excerpts_fit_selected_models_native_context_before_generation(monkeypatch):
    monkeypatch.setattr(ai, 'MIN_CONTEXT_TOKENS', 262144)
    payload = ai.StudyRequest.model_validate(study_request())
    documents = [{'id': 'S2', 'title': 'Lecture', 'text': 'Photosynthesis concept detail. ' * 10000}]
    native_context = ai.effective_context_length({'contextLength': 16384})
    context, length, shortened = ai.bounded_study_context(payload, [], documents, 'System instructions', 8000, context_length=native_context)
    assert length == 16384
    assert shortened
    assert context['assignment']['description'] == payload.assignment.description
    assert (len('System instructions') + len(json.dumps(context, ensure_ascii=False))) / 3 + 8000 + 512 <= length


def test_generation_fits_large_sources_to_native_context_and_output_schema(monkeypatch):
    calls = []
    mock_ollama(monkeypatch, captures=calls)
    monkeypatch.setattr(ai, 'MIN_CONTEXT_TOKENS', 262144)
    monkeypatch.setattr(ai, 'installed_model', lambda *_a, **_k: {'capabilities': [], 'contextLength': 16384})
    resources = [{'title': f'Lecture {index}', 'url': f'https://school.instructure.com/files/{index}', 'text': 'Photosynthesis converts solar energy. ' * 500} for index in range(3)]
    response = client.post('/api/v1/assistant/generate', headers=HEADERS, json=study_request(level='all_in', resources=resources))
    assert response.status_code == 200, response.text
    chat = next(body for path, body in calls if path == '/api/chat')
    assert chat['options']['num_ctx'] == 16384
    assert chat['options']['num_predict'] >= ai.DEPTHS['all_in']['tokens']
    assert any('shortened' in warning for warning in response.json()['warnings'])


def test_schema_repair_recomputes_available_response_capacity(monkeypatch):
    monkeypatch.setattr(ai, 'MIN_CONTEXT_TOKENS', 32768)
    monkeypatch.setattr(ai, 'installed_model', lambda *_a, **_k: {'capabilities': [], 'contextLength': 32768})
    calls = []
    def respond(path, payload=None, timeout=8):
        if path == '/api/chat':
            calls.append(json.loads(json.dumps(payload)))
            output = {'title': 'Missing required markdown'} if len(calls) == 1 else model_output()
            return {'message': {'content': json.dumps(output)}}
        return {}
    monkeypatch.setattr(ai, 'ollama_request', respond)
    result = ai.model_json('local-model', [{'role': 'user', 'content': 'Explain this concept.'}], ai.ModelStudyOutput, 2200)
    assert result.title == 'Photosynthesis'
    assert len(calls) == 2
    assert 2200 < calls[1]['options']['num_predict'] < calls[0]['options']['num_predict']
    for chat in calls:
        estimated_messages = (sum(len(message['content']) for message in chat['messages']) + 2) // 3
        assert estimated_messages + chat['options']['num_predict'] + 1024 <= chat['options']['num_ctx']


def test_complete_valid_json_is_retained_when_ollama_reports_length(monkeypatch):
    monkeypatch.setattr(ai, 'installed_model', lambda *_a, **_k: {'capabilities': [], 'contextLength': 32768})
    monkeypatch.setattr(ai, 'ollama_request', lambda *_a, **_k: {'done_reason': 'length', 'message': {'content': json.dumps(model_output())}})
    result = ai.model_json('local-model', [{'role': 'user', 'content': 'Explain.'}], ai.ModelStudyOutput, 2600)
    assert result.markdown == model_output()['markdown']


def test_incomplete_response_at_full_context_never_becomes_a_partial_packet(monkeypatch):
    monkeypatch.setattr(ai, 'installed_model', lambda *_a, **_k: {'capabilities': [], 'contextLength': 32768})
    partial = json.dumps(model_output())[:-1]
    monkeypatch.setattr(ai, 'ollama_request', lambda *_a, **_k: {'done_reason': 'length', 'message': {'content': partial}})
    with pytest.raises(ai.HTTPException) as failure:
        ai.model_json('local-model', [{'role': 'user', 'content': 'Explain.'}], ai.ModelStudyOutput, 2600)
    assert failure.value.status_code == 502
    assert 'context' in failure.value.detail.lower()


def test_full_assignment_automation_prompt_fits_workstation_window(monkeypatch):
    calls = []
    mock_ollama(monkeypatch, captures=calls)
    monkeypatch.setattr(ai, 'MIN_CONTEXT_TOKENS', 131072)
    ai.model_json('gpt-oss:20b', [{'role': 'user', 'content': 'x' * 100000}], ai.ModelStudyOutput, 8000)
    assert next(body for path, body in calls if path == '/api/chat')['options']['num_ctx'] == 131072


def test_homework_parser_reads_extracted_pdf_requirements(monkeypatch):
    question = '1. Calculate the resultant force and show every intermediate step.'
    payload = ai.StudyRequest.model_validate(study_request(assignment={**study_request()['assignment'], 'description': 'See CE 240 Homework 5 Fall 2026.pdf.'}, resources=[{'title': 'CE 240 Homework 5 Fall 2026.pdf', 'url': 'https://school.instructure.com/files/5', 'text': question}]))
    def parse(model, messages, *args, **kwargs):
        assert question in messages[1]['content']
        return ai.AssignmentBrief(summary='Calculate force', requirements=[ai.Requirement(id='R1', text='Calculate force', evidence=question)], missingInformation=[])
    monkeypatch.setattr(ai, 'model_json', parse)
    brief = ai.parse_homework(payload)
    assert brief.requirements[0].evidence == question
    assert brief.missingInformation == []


def test_course_pdf_text_is_not_cut_after_seven_thousand_characters():
    question = 'Final question: calculate the support reactions.'
    text = 'Lecture background. ' * 600 + question
    payload = ai.StudyRequest.model_validate(study_request(resources=[{'title': 'Homework.pdf', 'text': text}]))
    _, documents, _, _ = ai.collect_sources(payload)
    assert question in documents[-1]['text']


def test_reading_guide_uses_only_retrieved_web_sources_and_actual_access():
    output = ai.ModelStudyOutput.model_validate(model_output(readingGuide=[{'sourceId':'S2','focus':'Read the worked transform example.','question':'Which shift theorem applies?','access':'page text'},{'sourceId':'invented','focus':'Invented','question':'Unknown?'},{'sourceId':'S1','focus':'Canvas','question':'Course?'}]))
    sources = [ai.Source(id='S1',title='Brief',url='https://canvas.example/assignment',kind='canvas'), ai.Source(id='S2',title='Transform reference',url='https://university.example/transforms',kind='web'), ai.Source(id='S3',title='Worked example',url='https://university.example/example',kind='web')]
    ai.grounded_reading_guide(output,sources,[{'id':'S2','access':'search snippet only; full page unavailable'},{'id':'S3','access':'page text'}])
    assert [step.sourceId for step in output.readingGuide] == ['S2','S3']
    assert output.readingGuide[0].access.startswith('search snippet only')
    assert output.readingGuide[0].focus == 'Read the worked transform example.'


def test_reading_guide_does_not_invent_readings_when_research_is_off():
    output = ai.ModelStudyOutput.model_validate(model_output())
    ai.grounded_reading_guide(output, [], [])
    assert output.readingGuide == []


def test_qwen_30b_is_preferred_when_installed():
    recommended = ai.recommend_models([{'name':'gpt-oss:20b','capabilities':['completion']},{'name':'qwen3:30b-a3b-thinking-2507-q8_0','capabilities':['completion']}])
    assert recommended['reasoningModel'] == 'qwen3:30b-a3b-thinking-2507-q8_0'
    assert ai.StudyRequest.model_fields['model'].default == 'qwen3:30b-a3b-thinking-2507-q8_0'


@pytest.mark.parametrize("legacy", ["Bodha", "Gradient"])
def test_legacy_client_identification_remains_compatible_during_upgrade(monkeypatch, legacy):
    mock_ollama(monkeypatch)
    response = client.post("/api/v1/assistant/generate", json=study_request(), headers={f"X-{legacy}-Client": f"{legacy.lower()}-extension"})
    assert response.status_code == 200
    assert client.post("/api/v1/assistant/generate", json=study_request(), headers={"X-OffCanvas-Client": "bodha-extension"}).status_code == 403


def test_current_environment_names_override_legacy_configuration(monkeypatch):
    monkeypatch.delenv('OFFCANVAS_CONTEXT_TOKENS', raising=False)
    monkeypatch.setenv('BODHA_CONTEXT_TOKENS', '32768')
    assert ai.configured_context_tokens() == 32768
    monkeypatch.setenv('OFFCANVAS_CONTEXT_TOKENS', '65536')
    assert ai.configured_context_tokens() == 65536
