# Canvas LMS REST API: Verified Observations, Contracts & Limits

*Stage 1 Reality Check & API Verification*  
*Documented from probes on Canvas Free-for-Teacher / Sandbox instance*

---

## 1. Verified Endpoints & Query Parameters

All Canvas requests in OffCanvas must follow the strictly **READ-ONLY (`GET`)** invariant via the verified client.

| Capability | Verified Endpoint | Essential Query Parameters | Key Response Fields |
| :--- | :--- | :--- | :--- |
| **Course Details** | `GET /api/v1/courses/:id` | `include[]=total_scores`<br>`include[]=syllabus_body`<br>`include[]=term` | `id`, `name`, `course_code`, `apply_assignment_group_weights`, `syllabus_body`, `grading_standard` |
| **Assignment Groups** | `GET /api/v1/courses/:id/assignment_groups` | `include[]=assignments`<br>`include[]=rules`<br>`include[]=submission`<br>`per_page=50` | `id`, `name`, `group_weight`, `rules.drop_lowest`, `rules.drop_highest`, `rules.never_drop` |
| **Assignments** | `GET /api/v1/courses/:id/assignments` | `include[]=rubric`<br>`include[]=submission`<br>`per_page=50` | `id`, `assignment_group_id`, `name`, `points_possible`, `due_at`, `omit_from_final_grade`, `rubric` |
| **Student Submissions** | `GET /api/v1/courses/:id/students/submissions` | `student_ids[]=self`<br>`include[]=rubric_assessment`<br>`per_page=50` | `assignment_id`, `score`, `excused`, `missing`, `late`, `posted_at`, `workflow_state` |
| **Enrollments / Totals** | `GET /api/v1/courses/:id/enrollments` | `user_id=self` | `type`, `computed_current_score`, `computed_final_score`, `computed_current_grade`, `computed_final_grade` |
| **Announcements** | `GET /api/v1/announcements` | `context_codes[]=course_:id`<br>`per_page=50` | `id`, `title`, `message`, `posted_at`, `context_code` |
| **Course Modules** | `GET /api/v1/courses/:id/modules` | `include[]=items`<br>`per_page=50` | `id`, `name`, `items[].title`, `items[].type`, `items[].page_url`, `items[].content_id` |
| **Wiki Pages** | `GET /api/v1/courses/:id/pages` | `per_page=50` | `url`, `title`, `created_at`, `updated_at` |
| **Single Wiki Page** | `GET /api/v1/courses/:id/pages/:url_slug` | *none* | `title`, `body`, `updated_at` |
| **Course Files** | `GET /api/v1/courses/:id/files` | `per_page=50` | `id`, `display_name`, `content-type`, `url`, `size` |
| **Calendar Events** | `GET /api/v1/calendar_events` | `context_codes[]=course_:id`<br>`all_events=true` | `id`, `title`, `start_at`, `end_at`, `workflow_state` |

---

## 2. Pagination & RFC 5988 Link Headers

Canvas paginates list responses (defaulting to 10 items, configurable up to 100 via `per_page=100`).

- **Link Header Format**:
  ```http
  Link: <https://canvas.instructure.com/api/v1/courses/99001/assignments?page=1&per_page=50>; rel="current",
        <https://canvas.instructure.com/api/v1/courses/99001/assignments?page=2&per_page=50>; rel="next",
        <https://canvas.instructure.com/api/v1/courses/99001/assignments?page=1&per_page=50>; rel="first",
        <https://canvas.instructure.com/api/v1/courses/99001/assignments?page=3&per_page=50>; rel="last"
  ```
- **Client Implementation Rule**:
  `CanvasClient.getAllPages()` parses `rel="next"` and follows pages up to a safe cap (`maxPages = 10`) to prevent infinite recursion on malformed servers.

---

## 3. Rate-Limit Headers Observed

Canvas implements a leaky-bucket rate limiter that returns live status on every REST response:

- `X-Rate-Limit-Remaining`: Floating point budget remaining (starts at `700.0` or `600.0`, decrements by request cost, refills at ~`10.0`/sec).
- `X-Request-Cost`: Cost of the executed endpoint (typically `0.05` to `0.35` depending on SQL joins / includes).
- `X-Canvas-Meta`: Metadata identifying cluster and partition (`s=iad`).
- **Throttling Threshold**: If `X-Rate-Limit-Remaining` falls below `50.0`, OffCanvas introduces backoff jitter. If it drops to `0.0`, Canvas returns `HTTP 403 Forbidden` (`Rate Limit Exceeded`).

---

## 4. Permission Boundary: Student Session vs. Teacher Session

| Canvas Data Element | Plain Student Session Access | Teacher / Elevated Only | OffCanvas Fallback Strategy |
| :--- | :--- | :--- | :--- |
| **Credit Hours** | ❌ **Restricted/Omitted**: Canvas does not track or expose course credit hours in REST endpoints. | ❌ Omitted | **User Input**: Student inputs credit hours in panel (defaults to 3.0 / 4.0). |
| **Unposted / Hidden Grades** | ❌ **Restricted**: If teacher uses New Grade Posting Policy (manual), `posted_at` is null and student cannot view score. | ✅ Can view unposted score | **What-If Entry**: Student can enter draft/expected score in panel to model GPA impact. |
| **Instructor-Hidden Totals** | ⚠️ **Conditional**: If instructor checks "Hide totals in student grades summary", `computed_current_score` is removed from student view. | ✅ Can view totals | **Independent Calculation**: OffCanvas recalculates exact grade from raw scores and group weights. |
| **Rubric Criteria & Ratings** | ✅ Accessible when attached to an assignment. | ✅ Full edit access | **Paste-Rubric Mode**: If instructor pasted a rubric table directly into the description, student pastes it for parsing. |
| **Locked Modules / Files** | ❌ Restricted until unlock date or prerequisites met. | ✅ Can preview | **Syllabus / Open Stax Retrieval**: Supplement course materials with allowlisted open sources. |
| **Course Announcements** | ✅ Full read access to published announcements. | ✅ Full edit access | **Change Radar**: Diffs announcements to detect due date or policy updates. |

