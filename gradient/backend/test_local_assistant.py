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
HEADERS = {"X-Gradient-Client": "gradient-extension"}


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


def test_drive_by_origin_and_missing_client_header_are_rejected(monkeypatch):
    mock_ollama(monkeypatch)
    assert client.post("/api/v1/assistant/generate", json=study_request()).status_code == 403
    assert client.post("/api/v1/assistant/generate", json=study_request(), headers={**HEADERS, "Origin": "https://evil.example"}).status_code == 403
    allowed = client.options("/api/v1/assistant/generate", headers={"Origin": "chrome-extension://" + "a" * 32, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "x-gradient-client,content-type"})
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
    assert data["diagrams"][0]["edges"][0]["from"] == "a"
    assert data["sampleMarkdown"] == ""
    assert any("research is off" in warning for warning in data["warnings"])
    chat = next(body for path, body in calls if path == "/api/chat")
    assert chat["stream"] is False and chat["keep_alive"] == "30s"
    assert "ATP and NADPH" in chat["messages"][1]["content"]
    assert chat["options"]["num_ctx"] <= 16384


def test_detail_levels_change_actual_generation_budgets(monkeypatch):
    calls = []
    mock_ollama(monkeypatch, captures=calls)
    for level in ("a_bit", "all_in"):
        result = client.post("/api/v1/assistant/generate", headers=HEADERS, json=study_request(level=level))
        assert result.status_code == 200
    chats = [body for path, body in calls if path == "/api/chat"]
    assert chats[0]["options"]["num_predict"] < chats[1]["options"]["num_predict"]
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


def test_screenshot_rejects_installed_text_only_model(monkeypatch):
    mock_ollama(monkeypatch)
    # A complete PNG header is sufficient for the preflight format check.
    image = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\x00" * 16).decode()
    response = client.post("/api/v1/assistant/browser/plan", headers=HEADERS, json={"goal": "Read", "url": "https://school.instructure.com", "model": "gpt-oss:20b", "screenshot": image})
    assert response.status_code == 409 and "vision support" in response.json()["detail"]


def test_context_budget_trims_large_documents_and_reserves_response_capacity():
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
    monkeypatch.setenv('GRADIENT_BRAVE_SEARCH_API_KEY', 'test-only-key')
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
