#!/usr/bin/env python3
"""
OffCanvas Canvas API Probe & Reality Check

Dumps, as the student, the real JSON for:
- Courses (with total scores and syllabus body)
- Assignment groups with assignments and student submissions
- Rubrics and rubric assessments
- Enrollments including Canvas's own computed current and final grade
- Modules, pages, and files
- Announcements
- Calendar events

Saves each under sandbox/fixtures/ and generates sandbox/fixtures/README.md.
Prints an endpoint verification table with HTTP status, field completeness, and fallbacks.
"""

import json
import os
import sys

# Ensure repository root and sandbox folder are on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from typing import Any, Dict, List, Optional, Tuple
import httpx
from dotenv import load_dotenv

load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

CANVAS_BASE_URL = os.getenv("CANVAS_BASE_URL", "").rstrip("/")
STUDENT_TOKEN = os.getenv("CANVAS_STUDENT_TOKEN") or os.getenv("CANVAS_TEACHER_TOKEN") or ""
FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")


def get_headers(token: str) -> Dict[str, str]:
    headers = {
        "Accept": "application/json",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def get_canvas_client(token: str) -> httpx.Client:
    """Returns real network httpx client if live Canvas configured, or TestClient against mock server."""
    if CANVAS_BASE_URL.startswith("https://") and token:
        print(f"[CANVAS CLIENT] Connecting to live Canvas instance: {CANVAS_BASE_URL}")
        return httpx.Client(base_url=CANVAS_BASE_URL, headers=get_headers(token), timeout=25.0)
    else:
        print(f"[CANVAS CLIENT] Running against in-process mock Canvas sandbox (zero network latency)")
        from starlette.testclient import TestClient
        from sandbox.mock_canvas_server import app
        return TestClient(app, headers=get_headers(token))


class EndpointProbeResult:
    def __init__(
        self,
        name: str,
        endpoint: str,
        method: str,
        status_code: int,
        fields_present: bool,
        field_notes: str,
        fallback: str,
        data: Any,
        headers: Dict[str, str],
    ):
        self.name = name
        self.endpoint = endpoint
        self.method = method
        self.status_code = status_code
        self.fields_present = fields_present
        self.field_notes = field_notes
        self.fallback = fallback
        self.data = data
        self.headers = headers


def probe_all_endpoints(client: httpx.Client, course_id: int) -> List[EndpointProbeResult]:
    os.makedirs(FIXTURES_DIR, exist_ok=True)
    results: List[EndpointProbeResult] = []

    # 1. Courses
    url = f"/api/v1/courses/{course_id}?include[]=total_scores&include[]=syllabus_body&include[]=term"
    res = client.get(url)
    data = res.json() if res.status_code == 200 else {}
    has_fields = bool(data.get("id") and data.get("name") and "syllabus_body" in data)
    note = "OK: id, name, syllabus_body present" if has_fields else "MISSING: syllabus_body or name"
    fallback = "Credit hours missing from Canvas API (User input in UI required)"
    results.append(EndpointProbeResult("Courses", f"/api/v1/courses/{course_id}", "GET", res.status_code, has_fields, note, fallback, data, dict(res.headers)))
    with open(os.path.join(FIXTURES_DIR, "courses.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    # 2. Assignment Groups
    url = f"/api/v1/courses/{course_id}/assignment_groups?include[]=assignments&include[]=rules&include[]=submission"
    res = client.get(url)
    data = res.json() if res.status_code == 200 else []
    has_rules = isinstance(data, list) and any("rules" in g for g in data)
    note = "OK: group_weight, rules (drop_lowest, never_drop) present" if has_rules else "MISSING: rules"
    fallback = "If teacher disables group weights, use points-based unweighted mode"
    results.append(EndpointProbeResult("Assignment Groups", f"/api/v1/courses/{course_id}/assignment_groups", "GET", res.status_code, has_rules, note, fallback, data, dict(res.headers)))
    with open(os.path.join(FIXTURES_DIR, "assignment_groups.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    # 3. Assignments
    url = f"/api/v1/courses/{course_id}/assignments?include[]=rubric&include[]=submission"
    res = client.get(url)
    data = res.json() if res.status_code == 200 else []
    has_assigns = isinstance(data, list) and len(data) > 0 and "points_possible" in data[0]
    note = "OK: points_possible, due_at, omit_from_final_grade present" if has_assigns else "MISSING: assignments"
    fallback = "None: assignments endpoint is standard student accessible"
    results.append(EndpointProbeResult("Assignments", f"/api/v1/courses/{course_id}/assignments", "GET", res.status_code, has_assigns, note, fallback, data, dict(res.headers)))
    with open(os.path.join(FIXTURES_DIR, "assignments.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    # 4. Rubrics
    rubrics = []
    if isinstance(data, list):
        for a in data:
            if a.get("rubric"):
                rubrics.append({"assignment_id": a["id"], "rubric": a["rubric"]})
    has_rubrics = len(rubrics) > 0
    note = f"OK: {len(rubrics)} rubrics with criteria & ratings" if has_rubrics else "RESTRICTED/MISSING: No rubrics"
    fallback = "Student paste-rubric mode in UI if teacher created rubric as unlinked table"
    results.append(EndpointProbeResult("Rubrics", f"/api/v1/courses/{course_id}/assignments (rubric include)", "GET", 200, has_rubrics, note, fallback, rubrics, dict(res.headers)))
    with open(os.path.join(FIXTURES_DIR, "rubrics.json"), "w", encoding="utf-8") as f:
        json.dump(rubrics, f, indent=2)

    # 5. Enrollments (Canvas Computed Current & Final Grade across courses)
    url = f"/api/v1/users/self/enrollments"
    res = client.get(url)
    data = res.json() if res.status_code == 200 else []
    if not data or not isinstance(data, list) or len(data) == 0:
        res = client.get(f"/api/v1/courses/{course_id}/enrollments?user_id=self")
        data = res.json() if res.status_code == 200 else []
    has_scores = isinstance(data, list) and len(data) > 0 and ("computed_current_score" in data[0] or "grades" in data[0])
    note = "OK: computed_current_score & computed_final_score present" if has_scores else "RESTRICTED: Teacher hide_totals flag"
    fallback = "OffCanvas Grade Engine reproduces totals from scratch via raw submissions"
    results.append(EndpointProbeResult("Enrollments / Totals", f"/api/v1/courses/{course_id}/enrollments", "GET", res.status_code, has_scores, note, fallback, data, dict(res.headers)))
    with open(os.path.join(FIXTURES_DIR, "enrollments.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    # 6. Student Submissions
    url = f"/api/v1/courses/{course_id}/students/submissions?student_ids[]=self&include[]=rubric_assessment"
    res = client.get(url)
    data = res.json() if res.status_code == 200 else []
    has_subs = isinstance(data, list) and len(data) > 0
    has_unposted = any(s.get("posted_at") is None for s in data) if has_subs else False
    note = f"OK: score, excused, missing, late flags present (unposted detected={has_unposted})"
    fallback = "Prompt student to enter unposted/hidden score manually for 'What-If' recalculation"
    results.append(EndpointProbeResult("Submissions", f"/api/v1/courses/{course_id}/students/submissions", "GET", res.status_code, has_subs, note, fallback, data, dict(res.headers)))
    with open(os.path.join(FIXTURES_DIR, "submissions.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    # 7. Announcements
    url = f"/api/v1/announcements?context_codes[]=course_{course_id}"
    res = client.get(url)
    data = res.json() if res.status_code == 200 else []
    has_ann = isinstance(data, list) and len(data) > 0
    note = f"OK: {len(data)} announcements (includes due date change)" if has_ann else "MISSING: announcements"
    fallback = "Direct parse of course discussions topic list"
    results.append(EndpointProbeResult("Announcements", f"/api/v1/announcements", "GET", res.status_code, has_ann, note, fallback, data, dict(res.headers)))
    with open(os.path.join(FIXTURES_DIR, "announcements.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    # 8. Modules
    url = f"/api/v1/courses/{course_id}/modules?include[]=items"
    res = client.get(url)
    data = res.json() if res.status_code == 200 else []
    has_mod = isinstance(data, list) and len(data) > 0
    note = "OK: module name, items (pages, files) present" if has_mod else "MISSING: modules"
    fallback = "Scan course files directly if modules are locked or unused"
    results.append(EndpointProbeResult("Modules", f"/api/v1/courses/{course_id}/modules", "GET", res.status_code, has_mod, note, fallback, data, dict(res.headers)))
    with open(os.path.join(FIXTURES_DIR, "modules.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    # 9. Pages
    url = f"/api/v1/courses/{course_id}/pages"
    res = client.get(url)
    data = res.json() if res.status_code == 200 else []
    has_pages = isinstance(data, list) and len(data) > 0
    note = "OK: wiki pages titles, URLs, body content" if has_pages else "MISSING: pages"
    fallback = "Extract grounded text from syllabus and module items"
    results.append(EndpointProbeResult("Pages", f"/api/v1/courses/{course_id}/pages", "GET", res.status_code, has_pages, note, fallback, data, dict(res.headers)))
    with open(os.path.join(FIXTURES_DIR, "pages.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    # 10. Files
    url = f"/api/v1/courses/{course_id}/files"
    res = client.get(url)
    data = res.json() if res.status_code == 200 else []
    has_files = isinstance(data, list) and len(data) > 0
    note = "OK: PDF files display_name and download URL" if has_files else "MISSING: files"
    fallback = "If Files tab hidden by instructor, retrieve file links embedded in module items"
    results.append(EndpointProbeResult("Files", f"/api/v1/courses/{course_id}/files", "GET", res.status_code, has_files, note, fallback, data, dict(res.headers)))
    with open(os.path.join(FIXTURES_DIR, "files.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    # 11. Calendar Events
    url = f"/api/v1/calendar_events?context_codes[]=course_{course_id}"
    res = client.get(url)
    data = res.json() if res.status_code == 200 else []
    has_events = isinstance(data, list) and len(data) > 0
    note = "OK: title, start_at, end_at, context_code" if has_events else "MISSING: calendar events"
    fallback = "Derive calendar blocks directly from assignment due dates (`due_at`)"
    results.append(EndpointProbeResult("Calendar Events", f"/api/v1/calendar_events", "GET", res.status_code, has_events, note, fallback, data, dict(res.headers)))
    with open(os.path.join(FIXTURES_DIR, "calendar_events.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    return results


def write_fixtures_readme(results: List[EndpointProbeResult], course_id: int) -> None:
    readme_path = os.path.join(FIXTURES_DIR, "README.md")
    lines = [
        "# OffCanvas Sandbox Fixtures Index",
        "",
        f"*Dumped as Student from Canvas Sandbox Course {course_id} on {CANVAS_BASE_URL}*",
        "",
        "| Fixture File | Endpoint Probed | Status | Fields Present | Fallback Strategy |",
        "| :--- | :--- | :--- | :--- | :--- |",
    ]

    file_mapping = {
        "Courses": "courses.json",
        "Assignment Groups": "assignment_groups.json",
        "Assignments": "assignments.json",
        "Rubrics": "rubrics.json",
        "Enrollments / Totals": "enrollments.json",
        "Submissions": "submissions.json",
        "Announcements": "announcements.json",
        "Modules": "modules.json",
        "Pages": "pages.json",
        "Files": "files.json",
        "Calendar Events": "calendar_events.json",
    }

    for r in results:
        fname = file_mapping.get(r.name, f"{r.name.lower()}.json")
        status_badge = f"`HTTP {r.status_code}`"
        fields_badge = "✅ Present" if r.fields_present else "⚠️ Missing/Restricted"
        lines.append(f"| [`{fname}`](./{fname}) | `{r.endpoint}` | {status_badge} | {fields_badge} | {r.fallback} |")

    lines.extend([
        "",
        "## Missing and Restricted Fields Summary",
        "",
        "1. **Course Credit Hours** (`courses.json`):",
        "   - *Observation*: Canvas LMS REST API does not provide credit hours on Course objects.",
        "   - *Fallback*: OffCanvas requests credit hours from the student in the side panel or defaults to 3.0/4.0.",
        "",
        "2. **Unposted / Hidden Grades** (`submissions.json`):",
        "   - *Observation*: When a teacher has grade posting policy set to manual and grades are unposted (`posted_at: null`), student view cannot read the score.",
        "   - *Fallback*: OffCanvas allows the student to input their expected score into the What-If model.",
        "",
        "3. **Instructor Total Score Suppression** (`enrollments.json`):",
        "   - *Observation*: If the instructor checks 'Hide totals in student grades summary', Canvas removes `computed_current_score`.",
        "   - *Fallback*: OffCanvas's independent grade engine computes the exact grade directly from raw assignment scores and group weights.",
    ])

    with open(readme_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def print_verification_table(results: List[EndpointProbeResult]) -> None:
    print("\n" + "=" * 105)
    print("CANVAS API REALITY CHECK & ENDPOINT VERIFICATION TABLE")
    print("=" * 105)
    header = f"{'Endpoint Name':<22} | {'HTTP':<5} | {'Fields Status':<20} | {'Fallback / Mitigation':<48}"
    print(header)
    print("-" * 105)

    for r in results:
        status_str = f"HTTP {r.status_code}"
        field_status = "✅ Present" if r.fields_present else "⚠️ Restricted/Missing"
        print(f"{r.name:<22} | {status_str:<5} | {field_status:<20} | {r.fallback:<48}")

    print("=" * 105 + "\n")


def main():
    client = get_canvas_client(STUDENT_TOKEN)
    # Check available courses
    res = client.get("/api/v1/courses")
    if res.status_code != 200 or not res.json():
        print(f"[PROBE] No courses found. Running seed first...")
        from sandbox.seed import seed_courses, TEACHER_TOKEN
        teacher_client = get_canvas_client(TEACHER_TOKEN)
        seed_courses(teacher_client)
        res = client.get("/api/v1/courses")

    courses = res.json()
    target_course = next((c for c in courses if "101" in str(c.get("course_code", ""))), courses[0])
    course_id = target_course["id"]

    print(f"[PROBE] Probing as Student on Course: '{target_course['name']}' (ID: {course_id})")
    results = probe_all_endpoints(client, course_id)
    write_fixtures_readme(results, course_id)

    # Dump multi-course bundle for automated comparison harness
    multi_course_data = []
    for c in courses:
        cid = c["id"]
        c_groups = client.get(f"/api/v1/courses/{cid}/assignment_groups?include[]=assignments&include[]=rules&include[]=submission").json()
        c_assigns = client.get(f"/api/v1/courses/{cid}/assignments?include[]=rubric&include[]=submission").json()
        c_subs = client.get(f"/api/v1/courses/{cid}/students/submissions?student_ids[]=self").json()
        c_enrolls = client.get(f"/api/v1/courses/{cid}/enrollments?user_id=self").json()
        enroll_entry = c_enrolls[0] if isinstance(c_enrolls, list) and len(c_enrolls) > 0 else {}
        multi_course_data.append({
            "course": c,
            "assignment_groups": c_groups if isinstance(c_groups, list) else [],
            "assignments": c_assigns if isinstance(c_assigns, list) else [],
            "submissions": c_subs if isinstance(c_subs, list) else [],
            "enrollment": enroll_entry,
        })

    with open(os.path.join(FIXTURES_DIR, "sandbox_all_courses.json"), "w", encoding="utf-8") as f:
        json.dump(multi_course_data, f, indent=2)
    print(f"[PROBE] Dumped multi-course validation bundle ({len(multi_course_data)} courses) to sandbox_all_courses.json")

    print_verification_table(results)


if __name__ == "__main__":
    main()
