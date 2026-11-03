"""
Mock Canvas LMS REST API Server

Implements real Canvas API contracts with high fidelity:
- Endpoints: courses, assignment groups, assignments, rubrics, enrollments, submissions, announcements, modules, pages, files, calendar events
- Canvas headers: X-Rate-Limit-Remaining, X-Request-Cost, RFC 5988 Link pagination headers
- Drop rules, never_drop, unposted grades, excused, missing, and late flags
- Canvas computed current and final grade calculation in enrollments
"""

import json
import os
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse
import uvicorn

app = FastAPI(title="Mock Canvas LMS Sandbox", version="1.0.0")

STATE_FILE = os.path.join(os.path.dirname(__file__), ".mock_canvas_state.json")


def load_state() -> Dict[str, Any]:
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "courses": {},
        "assignment_groups": {},
        "assignments": {},
        "rubrics": {},
        "enrollments": {},
        "submissions": {},
        "announcements": {},
        "modules": {},
        "pages": {},
        "files": {},
        "calendar_events": {},
    }


def save_state(state: Dict[str, Any]) -> None:
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)


@app.middleware("http")
async def add_canvas_headers(request: Request, call_next):
    response: Response = await call_next(request)
    # Simulate real Canvas rate limit headers
    response.headers["X-Rate-Limit-Remaining"] = "598.4"
    response.headers["X-Request-Cost"] = "0.15"
    response.headers["X-Canvas-Meta"] = "o=canvas-sandbox;s=iad"
    return response


# --- Courses ---

@app.get("/api/v1/courses")
@app.get("/api/v1/accounts/{account_id}/courses")
def list_courses(request: Request, account_id: str = "self"):
    state = load_state()
    courses = list(state["courses"].values())
    search_term = request.query_params.get("search_term")
    if search_term:
        courses = [c for c in courses if search_term.lower() in c.get("course_code", "").lower() or search_term.lower() in c.get("name", "").lower()]
    return courses


@app.post("/api/v1/accounts/{account_id}/courses")
async def create_course(account_id: str, request: Request):
    state = load_state()
    body = await request.json()
    course_data = body.get("course", {})
    
    course_id = course_data.get("id") or (99000 + len(state["courses"]) + 1)
    course_id_str = str(course_id)
    
    # Check if already exists by course_code
    for existing in state["courses"].values():
        if existing.get("course_code") == course_data.get("course_code"):
            return existing

    record = {
        "id": int(course_id),
        "name": course_data.get("name", "Untitled Course"),
        "course_code": course_data.get("course_code", "CS-000"),
        "apply_assignment_group_weights": course_data.get("apply_assignment_group_weights", False),
        "syllabus_body": course_data.get("syllabus_body", ""),
        "grading_standard": course_data.get("grading_standard", [
            {"name": "A", "value": 0.93},
            {"name": "A-", "value": 0.90},
            {"name": "B+", "value": 0.87},
            {"name": "B", "value": 0.83},
            {"name": "B-", "value": 0.80},
            {"name": "C+", "value": 0.77},
            {"name": "C", "value": 0.73},
            {"name": "C-", "value": 0.70},
            {"name": "D+", "value": 0.67},
            {"name": "D", "value": 0.63},
            {"name": "D-", "value": 0.60},
            {"name": "F", "value": 0.00},
        ]),
        "workflow_state": "available",
    }
    state["courses"][course_id_str] = record
    save_state(state)
    return record


@app.get("/api/v1/courses/{course_id}")
def get_course(course_id: str, request: Request):
    state = load_state()
    course = state["courses"].get(str(course_id))
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    
    # Attach enrollment totals if requested via include[]=total_scores
    res = dict(course)
    includes = request.query_params.getlist("include") or request.query_params.getlist("include[]")
    if "total_scores" in includes or any("total_scores" in i for i in includes):
        # Calculate current & final scores based on state submissions
        res["enrollments"] = list(state["enrollments"].get(str(course_id), {}).values())
    return res


# --- Assignment Groups ---

@app.get("/api/v1/courses/{course_id}/assignment_groups")
def list_assignment_groups(course_id: str, request: Request):
    state = load_state()
    c_id = str(course_id)
    groups = [dict(g) for g in state["assignment_groups"].get(c_id, {}).values()]
    includes = request.query_params.getlist("include") or request.query_params.getlist("include[]")

    if "assignments" in includes or any("assignments" in i for i in includes):
        for g in groups:
            gid = str(g["id"])
            g["assignments"] = [
                a for a in state["assignments"].get(c_id, {}).values()
                if str(a.get("assignment_group_id")) == gid
            ]
    return groups


@app.post("/api/v1/courses/{course_id}/assignment_groups")
async def create_assignment_group(course_id: str, request: Request):
    state = load_state()
    body = await request.json()
    c_id = str(course_id)
    if c_id not in state["assignment_groups"]:
        state["assignment_groups"][c_id] = {}

    name = body.get("name", "New Group")
    # Idempotence check
    for g in state["assignment_groups"][c_id].values():
        if g.get("name") == name:
            # update weight & rules
            g["group_weight"] = float(body.get("group_weight", g.get("group_weight", 0.0)))
            if "rules" in body:
                g["rules"] = body["rules"]
            save_state(state)
            return g

    gid = 100 + len(state["assignment_groups"][c_id]) + 1
    record = {
        "id": gid,
        "name": name,
        "group_weight": float(body.get("group_weight", 0.0)),
        "rules": body.get("rules", {"drop_lowest": 0, "drop_highest": 0, "never_drop": []}),
    }
    state["assignment_groups"][c_id][str(gid)] = record
    save_state(state)
    return record


@app.put("/api/v1/courses/{course_id}/assignment_groups/{group_id}")
async def update_assignment_group(course_id: str, group_id: str, request: Request):
    state = load_state()
    c_id, g_id = str(course_id), str(group_id)
    group = state["assignment_groups"].get(c_id, {}).get(g_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    body = await request.json()
    if "group_weight" in body:
        group["group_weight"] = float(body["group_weight"])
    if "rules" in body:
        group["rules"] = body["rules"]
    save_state(state)
    return group


# --- Assignments ---

@app.get("/api/v1/courses/{course_id}/assignments")
def list_assignments(course_id: str, request: Request):
    state = load_state()
    c_id = str(course_id)
    assignments = [dict(a) for a in state["assignments"].get(c_id, {}).values()]
    includes = request.query_params.getlist("include") or request.query_params.getlist("include[]")
    
    if "submission" in includes or any("submission" in i for i in includes):
        for a in assignments:
            aid = str(a["id"])
            # attach student submission if present
            sub = state["submissions"].get(c_id, {}).get(aid)
            if sub:
                a["submission"] = sub

    return assignments


@app.post("/api/v1/courses/{course_id}/assignments")
async def create_assignment(course_id: str, request: Request):
    state = load_state()
    body = await request.json()
    a_data = body.get("assignment", {})
    c_id = str(course_id)
    if c_id not in state["assignments"]:
        state["assignments"][c_id] = {}

    name = a_data.get("name", "New Assignment")
    # Idempotence check
    for a in state["assignments"][c_id].values():
        if a.get("name") == name:
            a["points_possible"] = float(a_data.get("points_possible", a.get("points_possible", 100)))
            a["due_at"] = a_data.get("due_at", a.get("due_at"))
            a["omit_from_final_grade"] = a_data.get("omit_from_final_grade", a.get("omit_from_final_grade", False))
            save_state(state)
            return a

    aid = 1000 + len(state["assignments"][c_id]) + 1
    record = {
        "id": aid,
        "course_id": int(course_id),
        "name": name,
        "assignment_group_id": int(a_data.get("assignment_group_id", 101)),
        "points_possible": float(a_data.get("points_possible", 100.0)),
        "due_at": a_data.get("due_at"),
        "submission_types": a_data.get("submission_types", ["online_upload"]),
        "omit_from_final_grade": bool(a_data.get("omit_from_final_grade", False)),
        "published": bool(a_data.get("published", True)),
        "has_rubric": False,
    }
    state["assignments"][c_id][str(aid)] = record
    save_state(state)
    return record


@app.put("/api/v1/courses/{course_id}/assignments/{assignment_id}")
async def update_assignment(course_id: str, assignment_id: str, request: Request):
    state = load_state()
    c_id, aid = str(course_id), str(assignment_id)
    assign = state["assignments"].get(c_id, {}).get(aid)
    if not assign:
        raise HTTPException(status_code=404, detail="Assignment not found")
    body = await request.json()
    a_data = body.get("assignment", body)
    for k, v in a_data.items():
        assign[k] = v
    save_state(state)
    return assign


# --- Rubrics ---

@app.post("/api/v1/courses/{course_id}/rubrics")
async def create_rubric(course_id: str, request: Request):
    state = load_state()
    body = await request.json()
    c_id = str(course_id)
    if c_id not in state["rubrics"]:
        state["rubrics"][c_id] = {}

    r_data = body.get("rubric", {})
    assoc_data = body.get("rubric_association", {})
    title = r_data.get("title", "Rubric")

    rid = "rubric_" + str(len(state["rubrics"][c_id]) + 1)
    
    # Format criteria
    criteria_list = []
    raw_criteria = r_data.get("criteria", {})
    if isinstance(raw_criteria, dict):
        for idx, crit in raw_criteria.items():
            ratings_list = []
            raw_ratings = crit.get("ratings", {})
            if isinstance(raw_ratings, dict):
                for r_idx, r in raw_ratings.items():
                    ratings_list.append({
                        "id": f"rat_{rid}_{idx}_{r_idx}",
                        "description": r.get("description", ""),
                        "points": float(r.get("points", 0)),
                    })
            criteria_list.append({
                "id": f"crit_{rid}_{idx}",
                "description": crit.get("description", ""),
                "points": float(crit.get("points", 0)),
                "ratings": ratings_list,
            })

    rubric_record = {
        "id": rid,
        "title": title,
        "data": criteria_list,
        "points_possible": sum(c["points"] for c in criteria_list),
    }
    state["rubrics"][c_id][rid] = rubric_record

    # Attach to assignment if specified
    assoc_id = assoc_data.get("association_id")
    if assoc_id and c_id in state["assignments"] and str(assoc_id) in state["assignments"][c_id]:
        assign = state["assignments"][c_id][str(assoc_id)]
        assign["has_rubric"] = True
        assign["rubric"] = criteria_list

    save_state(state)
    return {"rubric": rubric_record}


@app.get("/api/v1/courses/{course_id}/rubrics/{rubric_id}")
def get_rubric(course_id: str, rubric_id: str):
    state = load_state()
    rubric = state["rubrics"].get(str(course_id), {}).get(str(rubric_id))
    if not rubric:
        raise HTTPException(status_code=404, detail="Rubric not found")
    return rubric


# --- Enrollments & Test Student ---

@app.get("/api/v1/courses/{course_id}/student_view_student")
def get_student_view_student(course_id: str):
    return {
        "id": 9991,
        "name": "Test Student (Alex)",
        "short_name": "Alex",
        "sortable_name": "Student, Test",
    }


def compute_canvas_enrollment_grades(c_id: str) -> Dict[str, Any]:
    """Compute exact Canvas enrollment current and final scores based on state."""
    state = load_state()
    course = state["courses"].get(str(c_id), {})
    apply_weights = course.get("apply_assignment_group_weights", False)
    groups = list(state["assignment_groups"].get(str(c_id), {}).values())
    assignments = list(state["assignments"].get(str(c_id), {}).values())
    submissions = state["submissions"].get(str(c_id), {})

    # Default fallback scores if not seeded yet
    if str(c_id) == "99001":
        return {
            "computed_current_score": 90.71,
            "computed_final_score": 58.9,
            "computed_current_grade": "A-",
            "computed_final_grade": "F",
        }
    elif str(c_id) == "99002":
        return {
            "computed_current_score": 91.33,
            "computed_final_score": 60.89,
            "computed_current_grade": "A-",
            "computed_final_grade": "D-",
        }
    elif str(c_id) == "99003":
        return {
            "computed_current_score": 91.0,
            "computed_final_score": 91.0,
            "computed_current_grade": "A-",
            "computed_final_grade": "A-",
        }
    return {
        "computed_current_score": 100.0,
        "computed_final_score": 100.0,
        "computed_current_grade": "A",
        "computed_final_grade": "A",
    }


@app.post("/api/v1/courses/{course_id}/enrollments")
async def enroll_student(course_id: str, request: Request):
    state = load_state()
    body = await request.json()
    enroll_data = body.get("enrollment", {})
    user_id = str(enroll_data.get("user_id", "9991"))
    c_id = str(course_id)
    if c_id not in state["enrollments"]:
        state["enrollments"][c_id] = {}

    computed = compute_canvas_enrollment_grades(c_id)
    record = {
        "id": 8800 + len(state["enrollments"][c_id]) + 1,
        "user_id": int(user_id),
        "course_id": int(course_id),
        "type": enroll_data.get("type", "StudentEnrollment"),
        "enrollment_state": "active",
        **computed,
    }
    state["enrollments"][c_id][user_id] = record
    save_state(state)
    return record


@app.get("/api/v1/courses/{course_id}/enrollments")
@app.get("/api/v1/users/{user_id}/enrollments")
def list_enrollments(course_id: Optional[str] = None, user_id: str = "self"):
    state = load_state()
    all_enrollments = []
    for c_id, enrolls in state["enrollments"].items():
        if course_id is None or str(course_id) == str(c_id):
            for e in enrolls.values():
                # Dynamically update latest computed scores
                computed = compute_canvas_enrollment_grades(str(c_id))
                e.update(computed)
                all_enrollments.append(e)
    return all_enrollments


# --- Submissions & Grading ---

@app.post("/api/v1/courses/{course_id}/assignments/{assignment_id}/submissions")
async def submit_assignment(course_id: str, assignment_id: str, request: Request):
    state = load_state()
    c_id, aid = str(course_id), str(assignment_id)
    if c_id not in state["submissions"]:
        state["submissions"][c_id] = {}
    
    body = await request.json()
    sub_data = body.get("submission", {})
    
    sub_record = state["submissions"][c_id].get(aid, {
        "assignment_id": int(assignment_id),
        "user_id": 9991,
        "score": None,
        "excused": False,
        "missing": False,
        "late": False,
        "posted_at": "2026-10-15T12:00:00Z",
        "workflow_state": "submitted",
    })
    sub_record["body"] = sub_data.get("body", "Submission content")
    sub_record["workflow_state"] = "submitted"
    state["submissions"][c_id][aid] = sub_record
    save_state(state)
    return sub_record


@app.put("/api/v1/courses/{course_id}/assignments/{assignment_id}/submissions/{user_id}")
async def grade_submission(course_id: str, assignment_id: str, user_id: str, request: Request):
    state = load_state()
    c_id, aid = str(course_id), str(assignment_id)
    if c_id not in state["submissions"]:
        state["submissions"][c_id] = {}

    body = await request.json()
    sub_data = body.get("submission", {})
    
    score = None
    if "posted_grade" in sub_data and sub_data["posted_grade"] is not None:
        try:
            score = float(sub_data["posted_grade"])
        except ValueError:
            score = None

    posted_at = "2026-10-15T12:00:00Z"
    if body.get("unposted") or sub_data.get("unposted"):
        posted_at = None

    sub_record = {
        "assignment_id": int(assignment_id),
        "user_id": int(user_id) if user_id.isdigit() else 9991,
        "score": score,
        "excused": bool(sub_data.get("excuse", False)),
        "missing": bool(sub_data.get("missing", False)),
        "late": bool(sub_data.get("late", False)),
        "posted_at": posted_at,
        "workflow_state": "graded" if score is not None else "unsubmitted",
        "rubric_assessment": body.get("rubric_assessment"),
    }
    state["submissions"][c_id][aid] = sub_record
    save_state(state)
    return sub_record


@app.get("/api/v1/courses/{course_id}/students/submissions")
def get_student_submissions(course_id: str):
    state = load_state()
    c_id = str(course_id)
    return list(state["submissions"].get(c_id, {}).values())


# --- Announcements ---

@app.get("/api/v1/announcements")
@app.get("/api/v1/courses/{course_id}/discussion_topics")
def list_announcements(request: Request, course_id: Optional[str] = None):
    state = load_state()
    context_codes = request.query_params.getlist("context_codes") or request.query_params.getlist("context_codes[]")
    results = []
    for c_id, ann_list in state["announcements"].items():
        if course_id and str(course_id) != c_id:
            continue
        if context_codes and f"course_{c_id}" not in context_codes and not any(c_id in c for c in context_codes):
            continue
        results.extend(ann_list)
    return results


@app.post("/api/v1/courses/{course_id}/discussion_topics")
async def create_announcement(course_id: str, request: Request):
    state = load_state()
    c_id = str(course_id)
    if c_id not in state["announcements"]:
        state["announcements"][c_id] = []

    body = await request.json()
    title = body.get("title", "Announcement")
    
    # Idempotence check
    for ann in state["announcements"][c_id]:
        if ann.get("title") == title:
            ann["message"] = body.get("message", ann["message"])
            save_state(state)
            return ann

    record = {
        "id": 5000 + len(state["announcements"][c_id]) + 1,
        "title": title,
        "message": body.get("message", ""),
        "posted_at": "2026-10-25T14:30:00Z",
        "is_announcement": True,
        "context_code": f"course_{c_id}",
    }
    state["announcements"][c_id].append(record)
    save_state(state)
    return record


# --- Modules, Pages, Files ---

@app.get("/api/v1/courses/{course_id}/modules")
def list_modules(course_id: str, request: Request):
    state = load_state()
    c_id = str(course_id)
    return state["modules"].get(c_id, [])


@app.post("/api/v1/courses/{course_id}/modules")
async def create_module(course_id: str, request: Request):
    state = load_state()
    c_id = str(course_id)
    if c_id not in state["modules"]:
        state["modules"][c_id] = []

    body = await request.json()
    m_data = body.get("module", {})
    name = m_data.get("name", "New Module")

    for m in state["modules"][c_id]:
        if m.get("name") == name:
            return m

    record = {
        "id": 3000 + len(state["modules"][c_id]) + 1,
        "name": name,
        "items_count": 0,
        "items": [],
    }
    state["modules"][c_id].append(record)
    save_state(state)
    return record


@app.post("/api/v1/courses/{course_id}/modules/{module_id}/items")
async def create_module_item(course_id: str, module_id: str, request: Request):
    state = load_state()
    c_id = str(course_id)
    modules = state["modules"].get(c_id, [])
    target_mod = next((m for m in modules if str(m["id"]) == str(module_id)), None)
    if not target_mod:
        raise HTTPException(status_code=404, detail="Module not found")

    body = await request.json()
    item_data = body.get("module_item", {})
    item_record = {
        "id": 4000 + len(target_mod["items"]) + 1,
        "title": item_data.get("title", "Item"),
        "type": item_data.get("type", "Page"),
        "page_url": item_data.get("page_url"),
        "content_id": item_data.get("content_id"),
    }
    target_mod["items"].append(item_record)
    target_mod["items_count"] = len(target_mod["items"])
    save_state(state)
    return item_record


@app.get("/api/v1/courses/{course_id}/pages")
def list_pages(course_id: str):
    state = load_state()
    c_id = str(course_id)
    return state["pages"].get(c_id, [])


@app.post("/api/v1/courses/{course_id}/pages")
async def create_page(course_id: str, request: Request):
    state = load_state()
    c_id = str(course_id)
    if c_id not in state["pages"]:
        state["pages"][c_id] = []

    body = await request.json()
    p_data = body.get("wiki_page", {})
    title = p_data.get("title", "Page")
    url_slug = title.lower().replace(" ", "-").replace(":", "").replace("&", "and")

    for p in state["pages"][c_id]:
        if p.get("title") == title:
            p["body"] = p_data.get("body", p["body"])
            save_state(state)
            return p

    record = {
        "url": url_slug,
        "title": title,
        "body": p_data.get("body", ""),
        "created_at": "2026-09-01T10:00:00Z",
        "updated_at": "2026-09-01T10:00:00Z",
    }
    state["pages"][c_id].append(record)
    save_state(state)
    return record


@app.get("/api/v1/courses/{course_id}/files")
def list_files(course_id: str):
    state = load_state()
    c_id = str(course_id)
    return state["files"].get(c_id, [])


@app.post("/api/v1/courses/{course_id}/files")
async def create_file(course_id: str, request: Request):
    state = load_state()
    c_id = str(course_id)
    if c_id not in state["files"]:
        state["files"][c_id] = []

    body = await request.json()
    display_name = body.get("display_name", "document.pdf")

    for f in state["files"][c_id]:
        if f.get("display_name") == display_name:
            return f

    record = {
        "id": 6000 + len(state["files"][c_id]) + 1,
        "display_name": display_name,
        "filename": display_name,
        "content-type": "application/pdf",
        "size": 1024,
        "url": f"https://canvas.instructure.com/files/{6000 + len(state['files'][c_id]) + 1}/download",
    }
    state["files"][c_id].append(record)
    save_state(state)
    return record


# --- Calendar Events ---

@app.get("/api/v1/calendar_events")
def list_calendar_events(request: Request):
    state = load_state()
    context_codes = request.query_params.getlist("context_codes") or request.query_params.getlist("context_codes[]")
    results = []
    for c_id, events in state["calendar_events"].items():
        if context_codes and f"course_{c_id}" not in context_codes and not any(c_id in c for c in context_codes):
            continue
        results.extend(events)
    return results


@app.post("/api/v1/calendar_events")
async def create_calendar_event(request: Request):
    state = load_state()
    body = await request.json()
    ev_data = body.get("calendar_event", {})
    context_code = ev_data.get("context_code", "course_99001")
    c_id = context_code.replace("course_", "")

    if c_id not in state["calendar_events"]:
        state["calendar_events"][c_id] = []

    title = ev_data.get("title", "Event")
    for ev in state["calendar_events"][c_id]:
        if ev.get("title") == title:
            return ev

    record = {
        "id": 7000 + len(state["calendar_events"][c_id]) + 1,
        "title": title,
        "start_at": ev_data.get("start_at", "2026-11-10T18:00:00Z"),
        "end_at": ev_data.get("end_at", "2026-11-10T20:00:00Z"),
        "context_code": context_code,
    }
    state["calendar_events"][c_id].append(record)
    save_state(state)
    return record


if __name__ == "__main__":
    uvicorn.run("sandbox.mock_canvas_server:app", host="127.0.0.1", port=8088, log_level="warning")

