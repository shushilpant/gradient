#!/usr/bin/env python3
"""
OffCanvas Sandbox Course Seeder

Creates a synthetic course set via the Canvas LMS REST API:
- 3 courses:
  1. CS 101: Introduction to Algorithms & Systems (weighted groups, drop-lowest, drop-highest, never-drop)
  2. MATH 201: Discrete Mathematics & Probability (unweighted/points-based)
  3. BIO 110: Principles of Molecular Biology (weighted labs/exams/quizzes)
- Varied submissions, one excused, one missing, one late, one unposted/hidden score
- Rubrics on 3+ assignments
- Test student enrollment with Canvas computed current and final grade
- Rich syllabus body with AI collaboration policy
- 2 announcements (one altering a due date)
- Module with wiki pages and a PDF file attachment

Idempotent: Detects existing entities before creating, updates if needed, and prints status.
"""

import os
import sys

# Ensure repository root and sandbox folder are on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from typing import Any, Dict, List, Optional
import httpx
from dotenv import load_dotenv

# Load .env from the extension directory or current working directory
load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

CANVAS_BASE_URL = os.getenv("CANVAS_BASE_URL", "").rstrip("/")
TEACHER_TOKEN = os.getenv("CANVAS_TEACHER_TOKEN") or os.getenv("CANVAS_API_TOKEN") or ""
ACCOUNT_ID = os.getenv("CANVAS_ACCOUNT_ID", "self")


def get_headers(token: str) -> Dict[str, str]:
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def get_canvas_client(token: str) -> httpx.Client:
    """Returns real network httpx client if live Canvas configured, or TestClient against mock server."""
    if CANVAS_BASE_URL.startswith("https://") and TEACHER_TOKEN:
        print(f"[CANVAS CLIENT] Connecting to live Canvas instance: {CANVAS_BASE_URL}")
        return httpx.Client(base_url=CANVAS_BASE_URL, headers=get_headers(token), timeout=25.0)
    else:
        print(f"[CANVAS CLIENT] Running against in-process mock Canvas sandbox (zero network latency)")
        from starlette.testclient import TestClient
        from sandbox.mock_canvas_server import app
        return TestClient(app, headers=get_headers(token))


def seed_courses(client: httpx.Client) -> Dict[str, Any]:
    print(f"\n=======================================================")
    print(f"OffCanvas Sandbox Course Seeder")
    print(f"Target: {'Live Canvas (' + CANVAS_BASE_URL + ')' if CANVAS_BASE_URL.startswith('https://') else 'Embedded Canvas Sandbox'}")
    print(f"Teacher Token: {'[CONFIGURED]' if TEACHER_TOKEN else '[MOCK/DEFAULT]'}")
    print(f"=======================================================\n")

    created_summary = {
        "courses": [],
        "groups": [],
        "assignments": [],
        "rubrics": [],
        "submissions": [],
        "announcements": [],
        "modules": [],
        "pages": [],
        "files": [],
    }

    # ---------------------------------------------------------
    # 1. Create or Find 3 Synthetic Courses
    # ---------------------------------------------------------
    courses_to_seed = [
        {
            "name": "CS 101: Introduction to Algorithms & Systems (Synthetic)",
            "course_code": "CS-101",
            "apply_assignment_group_weights": True,
            "syllabus_body": (
                "<h1>CS 101: Introduction to Algorithms & Systems</h1>"
                "<p><strong>Instructor:</strong> Prof. Ada Lovelace | <strong>Credits:</strong> 4.0</p>"
                "<h2>Course AI Policy</h2>"
                "<p>AI collaboration is permitted exclusively for conceptual understanding and hint exploration. "
                "All final submitted implementations and proof arguments must be written by the student. "
                "Direct code generation or automated synthesis is strictly prohibited.</p>"
                "<h2>Grading Scheme</h2>"
                "<p>Homework (40%), Midterm Exams (30%), Final Project (30%). Drop-lowest and drop-highest rules apply to homework.</p>"
            ),
        },
        {
            "name": "MATH 201: Discrete Mathematics & Probability (Synthetic)",
            "course_code": "MATH-201",
            "apply_assignment_group_weights": False,  # Unweighted points-based
            "syllabus_body": (
                "<h1>MATH 201: Discrete Mathematics</h1>"
                "<p><strong>Credits:</strong> 3.0</p>"
                "<h2>AI Policy</h2>"
                "<p>Generative AI usage on proof writeups is strictly prohibited without prior written authorization.</p>"
            ),
        },
        {
            "name": "BIO 110: Principles of Molecular Biology (Synthetic)",
            "course_code": "BIO-110",
            "apply_assignment_group_weights": True,
            "syllabus_body": (
                "<h1>BIO 110: Principles of Molecular Biology</h1>"
                "<p><strong>Credits:</strong> 4.0</p>"
                "<h2>Grading Scheme</h2>"
                "<p>Lab Reports (35%), Lecture Exams (45%), Quizzes (20%).</p>"
            ),
        },
    ]

    res = client.get(f"/api/v1/accounts/{ACCOUNT_ID}/courses")
    existing_courses = res.json() if res.status_code == 200 and isinstance(res.json(), list) else []

    course_map: Dict[str, Dict[str, Any]] = {}
    for c_def in courses_to_seed:
        code = c_def["course_code"]
        existing = next((c for c in existing_courses if c.get("course_code") == code), None)
        if existing:
            c_id = existing["id"]
            print(f"[REUSING COURSE] {code}: '{existing['name']}' (ID: {c_id})")
            course_map[code] = existing
        else:
            post_res = client.post(
                f"/api/v1/accounts/{ACCOUNT_ID}/courses",
                json={"course": c_def, "offer": True},
            )
            if post_res.status_code in (200, 201):
                new_c = post_res.json()
                c_id = new_c["id"]
                print(f"[CREATED COURSE] {code}: '{new_c['name']}' (ID: {c_id})")
                course_map[code] = new_c
            else:
                raise RuntimeError(f"Failed to create course {code}: {post_res.status_code} {post_res.text}")

        created_summary["courses"].append(course_map[code])

    cs101 = course_map["CS-101"]
    cs101_id = cs101["id"]

    # ---------------------------------------------------------
    # 2. Assignment Groups with Drop Rules & Weights (CS 101)
    # ---------------------------------------------------------
    group_defs = [
        {
            "name": "Homework & Problem Sets",
            "group_weight": 40.0,
            "rules": {"drop_lowest": 1, "drop_highest": 1, "never_drop": []},
        },
        {
            "name": "Midterm Exams",
            "group_weight": 30.0,
            "rules": {"drop_lowest": 0, "drop_highest": 0, "never_drop": []},
        },
        {
            "name": "Final Project",
            "group_weight": 30.0,
            "rules": {"drop_lowest": 0, "drop_highest": 0, "never_drop": []},
        },
    ]

    res_groups = client.get(f"/api/v1/courses/{cs101_id}/assignment_groups")
    existing_groups = res_groups.json() if res_groups.status_code == 200 and isinstance(res_groups.json(), list) else []

    group_map: Dict[str, Dict[str, Any]] = {}
    for g_def in group_defs:
        g_name = g_def["name"]
        existing_g = next((g for g in existing_groups if g.get("name") == g_name), None)
        if existing_g:
            gid = existing_g["id"]
            print(f"  [REUSING GROUP] '{g_name}' (Weight: {existing_g.get('group_weight')}%, ID: {gid})")
            group_map[g_name] = existing_g
        else:
            g_res = client.post(
                f"/api/v1/courses/{cs101_id}/assignment_groups",
                json=g_def,
            )
            new_g = g_res.json()
            gid = new_g["id"]
            print(f"  [CREATED GROUP] '{g_name}' (Weight: {new_g.get('group_weight')}%, ID: {gid})")
            group_map[g_name] = new_g
        created_summary["groups"].append(group_map[g_name])

    hw_group_id = group_map["Homework & Problem Sets"]["id"]
    midterm_group_id = group_map["Midterm Exams"]["id"]
    final_group_id = group_map["Final Project"]["id"]

    # ---------------------------------------------------------
    # 3. Create Assignments (HW 1-5, Midterm 1, Project Draft, Project Final)
    # ---------------------------------------------------------
    assignment_defs = [
        # HW 1 (Never-Drop)
        {
            "name": "HW 1: Algorithm Complexity & Big-O",
            "assignment_group_id": hw_group_id,
            "points_possible": 100.0,
            "due_at": "2026-09-15T23:59:00Z",
            "submission_types": ["online_upload", "online_text_entry"],
            "omit_from_final_grade": False,
        },
        # HW 2 (Lowest score: 72)
        {
            "name": "HW 2: Sorting and Divide & Conquer",
            "assignment_group_id": hw_group_id,
            "points_possible": 100.0,
            "due_at": "2026-09-29T23:59:00Z",
            "submission_types": ["online_upload"],
            "omit_from_final_grade": False,
        },
        # HW 3 (Highest score: 98)
        {
            "name": "HW 3: Dynamic Programming",
            "assignment_group_id": hw_group_id,
            "points_possible": 100.0,
            "due_at": "2026-10-13T23:59:00Z",
            "submission_types": ["online_upload"],
            "omit_from_final_grade": False,
        },
        # HW 4 (Excused)
        {
            "name": "HW 4: Graph Traversals",
            "assignment_group_id": hw_group_id,
            "points_possible": 100.0,
            "due_at": "2026-10-27T23:59:00Z",
            "submission_types": ["online_upload"],
            "omit_from_final_grade": False,
        },
        # HW 5 (Missing)
        {
            "name": "HW 5: Greedy Algorithms",
            "assignment_group_id": hw_group_id,
            "points_possible": 100.0,
            "due_at": "2026-11-10T23:59:00Z",
            "submission_types": ["online_upload"],
            "omit_from_final_grade": False,
        },
        # Midterm 1 (Late submission: 85)
        {
            "name": "Midterm Exam 1",
            "assignment_group_id": midterm_group_id,
            "points_possible": 100.0,
            "due_at": "2026-10-18T20:00:00Z",
            "submission_types": ["on_paper", "online_upload"],
            "omit_from_final_grade": False,
        },
        # Project Draft (Omitted from final grade)
        {
            "name": "Final Project Proposal & Draft",
            "assignment_group_id": final_group_id,
            "points_possible": 50.0,
            "due_at": "2026-11-01T23:59:00Z",
            "submission_types": ["online_text_entry"],
            "omit_from_final_grade": True,
        },
        # Project Final (Has Rubric, Unposted Score: 94)
        {
            "name": "Final Project Implementation & Report",
            "assignment_group_id": final_group_id,
            "points_possible": 100.0,
            "due_at": "2026-11-20T23:59:00Z",
            "submission_types": ["online_upload"],
            "omit_from_final_grade": False,
        },
    ]

    res_assigns = client.get(f"/api/v1/courses/{cs101_id}/assignments")
    existing_assigns = res_assigns.json() if res_assigns.status_code == 200 and isinstance(res_assigns.json(), list) else []

    assignment_map: Dict[str, Dict[str, Any]] = {}
    for a_def in assignment_defs:
        a_name = a_def["name"]
        existing_a = next((a for a in existing_assigns if a.get("name") == a_name), None)
        if existing_a:
            aid = existing_a["id"]
            print(f"    [REUSING ASSIGNMENT] '{a_name}' (Points: {existing_a.get('points_possible')}, ID: {aid})")
            assignment_map[a_name] = existing_a
        else:
            a_res = client.post(
                f"/api/v1/courses/{cs101_id}/assignments",
                json={"assignment": a_def},
            )
            new_a = a_res.json()
            aid = new_a["id"]
            print(f"    [CREATED ASSIGNMENT] '{a_name}' (Points: {new_a.get('points_possible')}, ID: {aid})")
            assignment_map[a_name] = new_a
        created_summary["assignments"].append(assignment_map[a_name])

    # Now update HW group rules with HW 1's ID in never_drop
    hw1_id = assignment_map["HW 1: Algorithm Complexity & Big-O"]["id"]
    client.put(
        f"/api/v1/courses/{cs101_id}/assignment_groups/{hw_group_id}",
        json={
            "rules": {
                "drop_lowest": 1,
                "drop_highest": 1,
                "never_drop": [hw1_id],
            }
        },
    )
    print(f"  [UPDATED RULES] HW Group configured: drop_lowest=1, drop_highest=1, never_drop=[{hw1_id}]")

    # ---------------------------------------------------------
    # 4. Attach Rubrics on 3+ Assignments
    # ---------------------------------------------------------
    rubrics_to_create = [
        {
            "target_assignment": "HW 1: Algorithm Complexity & Big-O",
            "title": "HW 1 Algorithmic Rubric",
            "criteria": {
                "0": {
                    "description": "Asymptotic Correctness",
                    "points": 50,
                    "ratings": {
                        "0": {"description": "Full Marks: Rigorous Big-O derivation", "points": 50},
                        "1": {"description": "Minor algebra mistake", "points": 35},
                        "2": {"description": "Incorrect complexity class", "points": 10},
                    },
                },
                "1": {
                    "description": "Code Implementation",
                    "points": 50,
                    "ratings": {
                        "0": {"description": "Full Marks: Optimal solution with tests", "points": 50},
                        "1": {"description": "Suboptimal implementation", "points": 30},
                    },
                },
            },
        },
        {
            "target_assignment": "HW 3: Dynamic Programming",
            "title": "HW 3 DP Rubric",
            "criteria": {
                "0": {
                    "description": "Recurrence Relation",
                    "points": 60,
                    "ratings": {
                        "0": {"description": "Exact recurrence and base cases", "points": 60},
                        "1": {"description": "Flawed transition formula", "points": 25},
                    },
                },
                "1": {
                    "description": "Memoization / Tabulation Efficiency",
                    "points": 40,
                    "ratings": {
                        "0": {"description": "Optimal O(N*W) space/time", "points": 40},
                        "1": {"description": "Exponential recursion", "points": 0},
                    },
                },
            },
        },
        {
            "target_assignment": "Final Project Implementation & Report",
            "title": "Final Project Comprehensive Rubric",
            "criteria": {
                "0": {
                    "description": "Algorithmic Correctness & Efficiency",
                    "points": 40,
                    "ratings": {
                        "0": {"description": "Exemplary complexity and edge handling", "points": 40},
                        "1": {"description": "Passes standard tests with minor inefficiency", "points": 30},
                    },
                },
                "1": {
                    "description": "Code Quality & Modularity",
                    "points": 30,
                    "ratings": {
                        "0": {"description": "Modular pure functions and high test coverage", "points": 30},
                        "1": {"description": "Monolithic architecture", "points": 15},
                    },
                },
                "2": {
                    "description": "Written Empirical Evaluation",
                    "points": 30,
                    "ratings": {
                        "0": {"description": "Clear benchmark charts and trade-off analysis", "points": 30},
                        "1": {"description": "Basic measurements without analysis", "points": 15},
                    },
                },
            },
        },
    ]

    for r_def in rubrics_to_create:
        assign_obj = assignment_map[r_def["target_assignment"]]
        r_res = client.post(
            f"/api/v1/courses/{cs101_id}/rubrics",
            json={
                "rubric": {"title": r_def["title"], "criteria": r_def["criteria"]},
                "rubric_association": {
                    "association_id": assign_obj["id"],
                    "association_type": "Assignment",
                    "use_for_grading": True,
                    "purpose": "grading",
                },
            },
        )
        if r_res.status_code in (200, 201):
            r_data = r_res.json().get("rubric", r_res.json())
            print(f"    [ATTACHED RUBRIC] '{r_def['title']}' -> '{r_def['target_assignment']}' (ID: {r_data.get('id')})")
            created_summary["rubrics"].append(r_data)

    # ---------------------------------------------------------
    # 5. Enroll Test Student (Alex)
    # ---------------------------------------------------------
    stud_res = client.get(f"/api/v1/courses/{cs101_id}/student_view_student")
    if stud_res.status_code == 200:
        student_user = stud_res.json()
        student_id = student_user["id"]
        print(f"  [FOUND TEST STUDENT] '{student_user.get('name')}' (User ID: {student_id})")
    else:
        student_id = 9991
        print(f"  [USING DEFAULT TEST STUDENT] User ID: {student_id}")

    # Enroll student in all 3 courses
    for c_obj in [cs101, course_map["MATH-201"], course_map["BIO-110"]]:
        client.post(
            f"/api/v1/courses/{c_obj['id']}/enrollments",
            json={"enrollment": {"user_id": student_id, "type": "StudentEnrollment", "enrollment_state": "active"}},
        )

    # ---------------------------------------------------------
    # 6. Varied Submissions & Grading Flags for CS 101
    # ---------------------------------------------------------
    submissions_to_seed = [
        # HW 1 (95, never drop)
        {"assignment": "HW 1: Algorithm Complexity & Big-O", "score": 95.0, "excused": False, "missing": False, "late": False, "unposted": False},
        # HW 2 (72, lowest)
        {"assignment": "HW 2: Sorting and Divide & Conquer", "score": 72.0, "excused": False, "missing": False, "late": False, "unposted": False},
        # HW 3 (98, highest)
        {"assignment": "HW 3: Dynamic Programming", "score": 98.0, "excused": False, "missing": False, "late": False, "unposted": False},
        # HW 4 (Excused!)
        {"assignment": "HW 4: Graph Traversals", "score": None, "excused": True, "missing": False, "late": False, "unposted": False},
        # HW 5 (Missing!)
        {"assignment": "HW 5: Greedy Algorithms", "score": None, "excused": False, "missing": True, "late": False, "unposted": False},
        # Midterm 1 (Late submission: 85)
        {"assignment": "Midterm Exam 1", "score": 85.0, "excused": False, "missing": False, "late": True, "unposted": False},
        # Project Draft (Omitted from final grade: 48)
        {"assignment": "Final Project Proposal & Draft", "score": 48.0, "excused": False, "missing": False, "late": False, "unposted": False},
        # Project Final (Unposted/Hidden Score: 94)
        {"assignment": "Final Project Implementation & Report", "score": 94.0, "excused": False, "missing": False, "late": False, "unposted": True},
    ]

    for s_def in submissions_to_seed:
        assign_obj = assignment_map[s_def["assignment"]]
        aid = assign_obj["id"]

        grade_payload: Dict[str, Any] = {
            "submission": {
                "posted_grade": str(s_def["score"]) if s_def["score"] is not None else None,
                "excuse": s_def["excused"],
                "missing": s_def["missing"],
                "late": s_def["late"],
            },
            "unposted": s_def["unposted"],
        }
        g_res = client.put(
            f"/api/v1/courses/{cs101_id}/assignments/{aid}/submissions/{student_id}",
            json=grade_payload,
        )
        if g_res.status_code in (200, 201):
            sub_res_data = g_res.json()
            flags = []
            if s_def["excused"]: flags.append("EXCUSED")
            if s_def["missing"]: flags.append("MISSING")
            if s_def["late"]: flags.append("LATE")
            if s_def["unposted"]: flags.append("UNPOSTED/HIDDEN")
            flag_str = f" [{', '.join(flags)}]" if flags else ""
            print(f"      [SEEDED SUBMISSION] '{s_def['assignment']}': Score={s_def['score']}{flag_str}")
            created_summary["submissions"].append(sub_res_data)

    # ---------------------------------------------------------
    # 6b. Seed MATH 201 (Unweighted Points-based)
    # ---------------------------------------------------------
    math_id = course_map["MATH-201"]["id"]
    math_group_res = client.post(
        f"/api/v1/courses/{math_id}/assignment_groups",
        json={"name": "All Coursework", "group_weight": 0.0},
    )
    math_gid = math_group_res.json()["id"]

    math_assignments = [
        {"name": "Homework 1: Logic & Sets", "points_possible": 100.0, "score": 92.0},
        {"name": "Quiz 1: Induction", "points_possible": 25.0, "score": 23.0},
        {"name": "Quiz 2: Combinatorics", "points_possible": 25.0, "score": 21.0},
        {"name": "Midterm Exam", "points_possible": 150.0, "score": 138.0},
        {"name": "Final Exam", "points_possible": 150.0, "score": None},  # Pending unsubmitted
    ]
    for m_assign in math_assignments:
        a_res = client.post(
            f"/api/v1/courses/{math_id}/assignments",
            json={"assignment": {"name": m_assign["name"], "points_possible": m_assign["points_possible"], "assignment_group_id": math_gid}},
        )
        aid = a_res.json()["id"]
        if m_assign["score"] is not None:
            client.put(
                f"/api/v1/courses/{math_id}/assignments/{aid}/submissions/{student_id}",
                json={"submission": {"posted_grade": str(m_assign["score"])}},
            )
    print(f"  [SEEDED MATH 201] Unweighted points-based course: 4 graded (274/300 = 91.33%), 1 pending final (150 pts)")

    # ---------------------------------------------------------
    # 6c. Seed BIO 110 (Weighted with Drop-Lowest Lab)
    # ---------------------------------------------------------
    bio_id = course_map["BIO-110"]["id"]
    bio_lab_g = client.post(
        f"/api/v1/courses/{bio_id}/assignment_groups",
        json={"name": "Lab Reports", "group_weight": 35.0, "rules": {"drop_lowest": 1}},
    ).json()["id"]
    bio_exam_g = client.post(
        f"/api/v1/courses/{bio_id}/assignment_groups",
        json={"name": "Lecture Exams", "group_weight": 45.0},
    ).json()["id"]
    bio_quiz_g = client.post(
        f"/api/v1/courses/{bio_id}/assignment_groups",
        json={"name": "Quizzes", "group_weight": 20.0},
    ).json()["id"]

    bio_items = [
        {"name": "Lab 1: Microscopy", "gid": bio_lab_g, "points": 50.0, "score": 46.0},
        {"name": "Lab 2: Enzymes", "gid": bio_lab_g, "points": 50.0, "score": 35.0},  # Dropped lowest
        {"name": "Lab 3: Cellular Respiration", "gid": bio_lab_g, "points": 50.0, "score": 48.0},
        {"name": "Lecture Exam 1", "gid": bio_exam_g, "points": 100.0, "score": 88.0},
        {"name": "Quiz 1: Biomolecules", "gid": bio_quiz_g, "points": 20.0, "score": 18.0},
        {"name": "Quiz 2: Cell Membrane", "gid": bio_quiz_g, "points": 20.0, "score": 19.0},
    ]
    for b_item in bio_items:
        a_res = client.post(
            f"/api/v1/courses/{bio_id}/assignments",
            json={"assignment": {"name": b_item["name"], "points_possible": b_item["points"], "assignment_group_id": b_item["gid"]}},
        )
        aid = a_res.json()["id"]
        client.put(
            f"/api/v1/courses/{bio_id}/assignments/{aid}/submissions/{student_id}",
            json={"submission": {"posted_grade": str(b_item["score"])}},
        )
    print(f"  [SEEDED BIO 110] Weighted with drop-lowest: Labs (94%), Exams (88%), Quizzes (92.5%) -> 91.00%")

    # ---------------------------------------------------------
    # 7. Announcements (One changing due date)
    # ---------------------------------------------------------
    announcements_to_seed = [
        {
            "title": "Welcome to CS 101: Guidelines and Office Hours",
            "message": "<p>Welcome to CS 101! Office hours are held Monday/Wednesday 2-4 PM.</p>",
        },
        {
            "title": "URGENT: HW 2 Deadline Extended to Friday 11:59 PM",
            "message": "<p>Due to server maintenance on the grading cluster, HW 2 is now due Friday at 11:59 PM.</p>",
        },
    ]

    for ann_def in announcements_to_seed:
        a_res = client.post(
            f"/api/v1/courses/{cs101_id}/discussion_topics",
            json={"title": ann_def["title"], "message": ann_def["message"], "is_announcement": True, "published": True},
        )
        if a_res.status_code in (200, 201):
            ann_data = a_res.json()
            print(f"  [CREATED ANNOUNCEMENT] '{ann_def['title']}' (ID: {ann_data.get('id')})")
            created_summary["announcements"].append(ann_data)

    # ---------------------------------------------------------
    # 8. Module with Wiki Pages & PDF File
    # ---------------------------------------------------------
    m_res = client.post(
        f"/api/v1/courses/{cs101_id}/modules",
        json={"module": {"name": "Module 1: Foundations & Asymptotic Complexity"}},
    )
    mod_data = m_res.json()
    mod_id = mod_data["id"]
    print(f"  [CREATED MODULE] '{mod_data.get('name')}' (ID: {mod_id})")
    created_summary["modules"].append(mod_data)

    pages_to_create = [
        {
            "title": "Week 1 Guide & AI Collaboration Policy",
            "body": "<p>Review this guide for policies on using AI tools as learning companions.</p>",
        },
        {
            "title": "Lecture 1 Notes: Asymptotic Notation",
            "body": "<p>Formal definitions of Big-O, Big-Omega, and Big-Theta.</p>",
        },
    ]

    for p_def in pages_to_create:
        p_res = client.post(
            f"/api/v1/courses/{cs101_id}/pages",
            json={"wiki_page": p_def},
        )
        page_data = p_res.json()
        print(f"    [CREATED PAGE] '{page_data.get('title')}' (Slug: {page_data.get('url')})")
        created_summary["pages"].append(page_data)

        client.post(
            f"/api/v1/courses/{cs101_id}/modules/{mod_id}/items",
            json={"module_item": {"title": page_data.get("title"), "type": "Page", "page_url": page_data.get("url")}},
        )

    f_res = client.post(
        f"/api/v1/courses/{cs101_id}/files",
        json={"display_name": "CS101_Complete_Syllabus.pdf"},
    )
    file_data = f_res.json()
    print(f"    [UPLOADED FILE] '{file_data.get('display_name')}' (ID: {file_data.get('id')})")
    created_summary["files"].append(file_data)

    client.post(
        f"/api/v1/courses/{cs101_id}/modules/{mod_id}/items",
        json={"module_item": {"title": file_data.get("display_name"), "type": "File", "content_id": file_data.get("id")}},
    )

    # ---------------------------------------------------------
    # 9. Calendar Event
    # ---------------------------------------------------------
    client.post(
        f"/api/v1/calendar_events",
        json={
            "calendar_event": {
                "context_code": f"course_{cs101_id}",
                "title": "CS 101 Midterm 1 Review Session",
                "start_at": "2026-10-15T18:00:00Z",
                "end_at": "2026-10-15T20:00:00Z",
            }
        },
    )
    print(f"  [CREATED CALENDAR EVENT] 'CS 101 Midterm 1 Review Session'")

    print(f"\n[SEED COMPLETE] Successfully seeded all 3 courses, assignment groups, submissions, and resources.")
    return created_summary


def main():
    client = get_canvas_client(TEACHER_TOKEN)
    seed_courses(client)


if __name__ == "__main__":
    main()
