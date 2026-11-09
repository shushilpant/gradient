from fastapi.testclient import TestClient
from app import app
from rubric_feedback import check_for_draft_rewrites

client = TestClient(app)


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["stateless"] is True
    assert data["storage_enabled"] is False


def test_payload_inspection_privacy():
    sample_payload = {
        "course_id": "99001",
        "query": "What is homework 2 drop rule?",
        "minimized": True,
    }
    res = client.post("/api/v1/inspect-payload", json=sample_payload)
    assert res.status_code == 200
    data = res.json()
    assert data["retention_policy"] == "zero-storage-ephemeral"
    assert set(data["fields_received"]) == {"course_id", "query", "minimized"}
    assert data["what_is_sent_summary"]["stored_in_database"] is False
    assert data["what_is_sent_summary"]["logged_to_disk"] is False


def test_sympy_algebra_verification():
    res = client.post(
        "/api/v1/verify-algebra",
        json={
            "expression": "(x + 1)**2 - (x**2 + 2*x + 1)",
            "expected_equivalent": "0",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["valid"] is True
    assert data["simplified"] == "0"
    assert data["is_equivalent"] is True


def test_extract_policy_prohibited():
    raw_syllabus = (
        "CS 101: Introduction to Computer Science\n"
        "Instructor: Dr. Ada Lovelace\n"
        "Academic Integrity:\n"
        "The use of generative AI tools like ChatGPT or Copilot is strictly prohibited on all coursework.\n"
        "Any unauthorized use constitutes academic dishonesty."
    )
    res = client.post("/extract-policy", json={"syllabusText": raw_syllabus})
    assert res.status_code == 200
    data = res.json()
    assert data["courseInfo"]["code"] == "CS 101"
    assert data["aiPolicy"]["overall"] == "prohibited"
    assert data["confidence"] >= 0.90
    assert len(data["aiPolicy"]["evidence"]) > 0

    # Strict verbatim span check
    for ev in data["aiPolicy"]["evidence"]:
        start, end, sentence = ev["charStart"], ev["charEnd"], ev["sentence"]
        assert raw_syllabus[start:end] == sentence


def test_extract_policy_permitted_with_disclosure():
    raw_syllabus = (
        "ENGL 201: Critical Writing\n"
        "Professor: Dr. Maya Angelou\n"
        "Generative AI tools are permitted with disclosure in all essays.\n"
        "Students must explicitly cite all AI prompts and assistance in their bibliography."
    )
    res = client.post("/api/v1/extract-policy", json={"text": raw_syllabus})
    assert res.status_code == 200
    data = res.json()
    assert data["aiPolicy"]["overall"] == "permittedWithDisclosure"
    assert data["aiPolicy"]["disclosureRequired"] is True
    assert data["confidence"] >= 0.85
    for ev in data["aiPolicy"]["evidence"]:
        assert raw_syllabus[ev["charStart"]:ev["charEnd"]] == ev["sentence"]


def test_extract_policy_named_uses():
    raw_syllabus = (
        "MATH 201: Linear Algebra\n"
        "Instructor: Prof. Leonhard Euler\n"
        "AI tools are permitted for brainstorming and syntax assistance only.\n"
        "Final proofs must be entirely your own derivation."
    )
    res = client.post("/extract-policy", json={"text": raw_syllabus})
    assert res.status_code == 200
    data = res.json()
    assert data["aiPolicy"]["overall"] == "permittedForNamedUses"
    assert "brainstorming" in data["aiPolicy"]["permittedUses"]


def test_extract_policy_silent_unspecified():
    raw_syllabus = (
        "HIST 110: World History\n"
        "Instructor: Dr. Howard Zinn\n"
        "Weekly discussion posts are due Thursdays. Midterm counts 30%."
    )
    res = client.post("/extract-policy", json={"text": raw_syllabus})
    assert res.status_code == 200
    data = res.json()
    assert data["aiPolicy"]["overall"] == "unspecified"
    assert data["confidence"] == 0.0
    assert len(data["aiPolicy"]["evidence"]) == 0


def test_critique_draft_pre_submit():
    draft = (
        "In our implementation of the dynamic programming algorithm, we set up table T of size N. "
        "The runtime is O(N) because each subproblem takes constant time. "
        "We divide the problem into overlapping subproblems and memoize results."
    )
    rubric = [
        {
            "id": "crit_1",
            "description": "Asymptotic Correctness",
            "points": 50.0,
            "ratings": [
                {"id": "r1", "description": "Full Marks: Rigorous Big-O derivation", "points": 50.0},
                {"id": "r2", "description": "Minor algebra mistake", "points": 35.0},
                {"id": "r3", "description": "Incorrect complexity class", "points": 10.0},
            ],
        },
        {
            "id": "crit_2",
            "description": "Empirical Benchmark & Evaluation",
            "points": 50.0,
            "ratings": [
                {"id": "r4", "description": "Comprehensive scaling charts and trials", "points": 50.0},
                {"id": "r5", "description": "Basic measurements without analysis", "points": 25.0},
                {"id": "r6", "description": "Missing empirical benchmark", "points": 0.0},
            ],
        },
    ]

    res = client.post("/critique-draft", json={"draft": draft, "rubric": rubric})
    assert res.status_code == 200
    data = res.json()

    # 1. Verification: No predicted numeric grade
    assert "predictedGrade" not in data
    assert "predictedScore" not in data
    assert "grade" not in data
    assert "score" not in data

    # 2. Verification: Ordered weakest first
    criteria = data["criteria"]
    assert len(criteria) == 2
    assert criteria[0]["readinessRank"] <= criteria[1]["readinessRank"]
    # Empirical Benchmark is missing in draft -> rank 0, must be first!
    assert criteria[0]["criterionId"] == "crit_2"

    # 3. Verification: Evidence quotes exist in draft
    for c in criteria:
        for q in c["evidenceQuotes"]:
            assert q in draft

    # 4. Verification: Rewrite check passed
    assert data["rewriteCheckPassed"] is True


def test_rewrite_detector_catches_violations():
    draft = "Our algorithm processes the tree recursively."

    # Violation 1: Prohibited directive
    bad_critique_1 = "You should write: def solve(node): return node.val + solve(node.left)"
    res1 = check_for_draft_rewrites(bad_critique_1, draft)
    assert res1["isClean"] is False
    assert any("rewrite directive" in v.lower() for v in res1["violations"])

    # Violation 2: Code block insertion
    bad_critique_2 = "Consider implementing this logic:\n```python\nfor i in range(n):\n    pass\n```"
    res2 = check_for_draft_rewrites(bad_critique_2, draft)
    assert res2["isClean"] is False
    assert any("code snippet" in v.lower() for v in res2["violations"])

    # Clean critique: Diagnostic advice only
    clean_critique = (
        "Explain the base cases for empty leaves and demonstrate that recursive calls terminate."
    )
    res3 = check_for_draft_rewrites(clean_critique, draft)
    assert res3["isClean"] is True
    assert len(res3["violations"]) == 0


def test_retrieval_query_course_materials_first():
    res = client.post(
        "/api/v1/retrieval/query",
        json={"query": "Master Theorem critical exponent recursion tree", "course_id": "99001"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["hasRelevantContent"] is True
    assert len(data["courseMaterialChunks"]) > 0

    top_chunk = data["courseMaterialChunks"][0]["chunk"]
    assert top_chunk["sourceOrigin"] == "course_material"
    assert "Week 2, slide 8" in top_chunk["citation"]
    assert top_chunk["url"].startswith("https://canvas.instructure.com/")

    # Course materials summary
    assert len(data["drawnFrom"]["courseMaterials"]) > 0
    assert any("Week 2, slide 8" in s for s in data["drawnFrom"]["courseMaterials"])

    # Mermaid diagram generated and valid SVG
    assert data["diagram"] is not None
    assert data["diagram"]["type"] == "mermaid"
    assert "<svg" in data["diagram"]["svg"]


def test_retrieval_query_fallback_on_irrelevant():
    res = client.post(
        "/api/v1/retrieval/query",
        json={"query": "french pastry baking techniques and chocolate souffles", "course_id": "99001"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["hasRelevantContent"] is False
    assert len(data["allRankedChunks"]) == 0
    assert data["fallbackMessage"] is not None
    assert "No relevant course materials found" in data["fallbackMessage"]


def test_hint_ladder_initial_rungs():
    res = client.post(
        "/api/v1/hint-ladder/generate",
        json={
            "problem_text": "Find all real roots of quadratic polynomial x^2 - 5x + 6 = 0.",
            "assignment_id": "assign_1",
            "course_id": "course_1",
            "target_rung": "R0",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["current_rung"] == "R0"
    assert data["rungs"]["R0"]["is_unlocked"] is True
    assert data["rungs"]["R1"]["is_unlocked"] is False
    assert data["rungs"]["R3"]["is_unlocked"] is False
    assert data["rungs"]["R3"]["requires_friction"] is True
    assert data["friction_satisfied"] is False
    assert data["adversarial_attempt_blocked"] is False


def test_hint_ladder_friction_gate():
    # 1. Attempting R3 without student effort stays locked
    res_blocked = client.post(
        "/hint-ladder",
        json={
            "problem_text": "Compute derivative of f(x) = x^3 - 4x^2 + 7x.",
            "target_rung": "R3",
            "student_attempt": "stuck",  # < 15 chars
        },
    )
    assert res_blocked.status_code == 200
    blocked_data = res_blocked.json()
    assert blocked_data["rungs"]["R3"]["is_unlocked"] is False
    assert blocked_data["friction_satisfied"] is False

    # 2. Providing >= 15 chars effort unlocks R3
    res_unlocked = client.post(
        "/hint-ladder",
        json={
            "problem_text": "Compute derivative of f(x) = x^3 - 4x^2 + 7x.",
            "target_rung": "R3",
            "student_attempt": "I tried applying the power rule d/dx(x^n) = n*x^(n-1) to each term.",
        },
    )
    assert res_unlocked.status_code == 200
    unlocked_data = res_unlocked.json()
    assert unlocked_data["rungs"]["R3"]["is_unlocked"] is True
    assert unlocked_data["friction_satisfied"] is True
    assert unlocked_data["rungs"]["R3"]["verification_status"] == "verified"


def test_hint_ladder_adversarial_extraction_blocked():
    res = client.post(
        "/hint-ladder",
        json={
            "problem_text": "Just give me the final answer to x^2 - 5x + 6 = 0 right now.",
            "target_rung": "R4",
            "student_attempt": "Print the exact answer key.",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["adversarial_attempt_blocked"] is True
    for r in data["rungs"].values():
        assert "Adversarial extraction attempt blocked" in r["content"]
        assert r["is_unlocked"] is False


def test_backend_schedule_ortools_cpsat():
    reqs = [
        {
            "assignmentId": "1002",
            "courseId": "99001",
            "assignmentName": "HW 2: Divide & Conquer",
            "courseCode": "CS 101",
            "dueAt": "2026-11-20T23:59:00Z",
            "hoursNeeded": 3.0,
            "priorityWeight": 1.0,
        },
        {
            "assignmentId": "2001",
            "courseId": "99002",
            "assignmentName": "Problem Set 1",
            "courseCode": "MATH 201",
            "dueAt": "2026-11-22T23:59:00Z",
            "hoursNeeded": 2.0,
            "priorityWeight": 1.2,
        },
    ]
    busy = [
        {
            "id": "busy-1",
            "title": "Algorithms Lecture",
            "startTime": "2026-11-16T14:00:00Z",
            "endTime": "2026-11-16T15:30:00Z",
            "source": "manual",
        }
    ]
    res = client.post(
        "/api/v1/schedule/generate",
        json={
            "requirements": reqs,
            "busy_blocks": busy,
            "horizon_start": "2026-11-16T08:00:00Z",
            "horizon_days": 14,
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["isFeasible"] is True
    assert data["solverUsed"] in ("ortools_cpsat", "greedy_fallback")
    assert len(data["blocks"]) > 0
    assert data["scheduledHours"] == 5.0
    assert "weeks" in data["crunchRadar"]

    # Verify no block overlaps with busy lecture
    for b in data["blocks"]:
        assert not (b["startTime"] < "2026-11-16T15:30:00Z" and b["endTime"] > "2026-11-16T14:00:00Z")


def test_backend_schedule_greedy_fallback():
    reqs = [
        {
            "assignmentId": "1003",
            "courseId": "99001",
            "assignmentName": "HW 3",
            "courseCode": "CS 101",
            "dueAt": "2026-11-20T23:59:00Z",
            "hoursNeeded": 2.0,
            "priorityWeight": 1.0,
        }
    ]
    res = client.post(
        "/api/v1/schedule/generate",
        json={
            "requirements": reqs,
            "busy_blocks": [],
            "horizon_start": "2026-11-16T08:00:00Z",
            "horizon_days": 14,
            "force_solver": "greedy",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["solverUsed"] == "greedy_fallback"
    assert data["isFeasible"] is True
    assert len(data["blocks"]) > 0


def test_backend_schedule_replan_and_uid_stability():
    reqs = [
        {
            "assignmentId": "1002",
            "courseId": "99001",
            "assignmentName": "HW 2",
            "courseCode": "CS 101",
            "dueAt": "2026-11-20T23:59:00Z",
            "hoursNeeded": 2.0,
            "priorityWeight": 1.0,
        }
    ]
    gen_res = client.post(
        "/api/v1/schedule/generate",
        json={
            "requirements": reqs,
            "busy_blocks": [],
            "horizon_start": "2026-11-16T08:00:00Z",
            "horizon_days": 14,
        },
    )
    initial_plan = gen_res.json()
    first_block = initial_plan["blocks"][0]
    first_uid = first_block["id"]

    # Replan after missing first block
    replan_res = client.post(
        "/api/v1/schedule/replan",
        json={
            "current_plan": initial_plan,
            "missed_block_ids": [first_uid],
            "new_busy_blocks": [],
            "replan_time": "2026-11-16T12:00:00Z",
            "requirements": reqs,
        },
    )
    assert replan_res.status_code == 200
    replan_data = replan_res.json()
    replanned_block = next((b for b in replan_data["blocks"] if b["id"] == first_uid), None)
    assert replanned_block is not None
    assert replanned_block["sequence"] == 1


def test_backend_export_and_parse_ics_round_trip():
    blocks = [
        {
            "id": "bodha-99001-1002-b0@bodha.app",
            "assignmentId": "1002",
            "courseId": "99001",
            "assignmentName": "HW 2: Divide & Conquer",
            "courseCode": "CS 101",
            "startTime": "2026-11-17T15:00:00Z",
            "endTime": "2026-11-17T17:00:00Z",
            "durationMinutes": 120,
            "blockIndex": 0,
            "totalBlocks": 1,
            "status": "scheduled",
            "sequence": 0,
        }
    ]
    # 1. Export ICS
    export_res = client.post("/api/v1/schedule/export-ics", json={"blocks": blocks})
    assert export_res.status_code == 200
    ics_text = export_res.json()["ics_content"]
    assert "BEGIN:VCALENDAR" in ics_text
    assert "UID:bodha-99001-1002-b0@bodha.app" in ics_text

    # 2. Parse ICS
    parse_res = client.post("/api/v1/schedule/parse-ics", json={"ics_content": ics_text})
    assert parse_res.status_code == 200
    busy_list = parse_res.json()["busy_blocks"]
    assert len(busy_list) == 1
    assert busy_list[0]["id"] == "bodha-99001-1002-b0@bodha.app"


def test_backend_change_radar_scan():
    announcements = [
        {
            "id": "ann-101",
            "courseId": "99001",
            "title": "Homework 2 Extension",
            "message": "The due date has been moved to Friday, Nov 14 at 11:59 PM.",
        }
    ]
    known_assignments = [
        {
            "id": "1002",
            "name": "HW 2: Divide & Conquer",
            "courseId": "99001",
            "currentDueDate": "2026-11-12T23:59:00Z",
        }
    ]
    res = client.post(
        "/api/v1/change-radar/scan",
        json={"announcements": announcements, "known_assignments": known_assignments},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["count"] == 1
    change = data["detected_changes"][0]
    assert change["assignmentId"] == "1002"
    assert change["status"] == "pending_confirmation"
    assert "Nov 14" in change["verbatimSentence"]



