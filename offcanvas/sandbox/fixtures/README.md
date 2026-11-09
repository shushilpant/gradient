# OffCanvas Sandbox Fixtures Index

*Dumped as Student from Canvas Sandbox Course 99001 on *

| Fixture File | Endpoint Probed | Status | Fields Present | Fallback Strategy |
| :--- | :--- | :--- | :--- | :--- |
| [`courses.json`](./courses.json) | `/api/v1/courses/99001` | `HTTP 200` | ✅ Present | Credit hours missing from Canvas API (User input in UI required) |
| [`assignment_groups.json`](./assignment_groups.json) | `/api/v1/courses/99001/assignment_groups` | `HTTP 200` | ✅ Present | If teacher disables group weights, use points-based unweighted mode |
| [`assignments.json`](./assignments.json) | `/api/v1/courses/99001/assignments` | `HTTP 200` | ✅ Present | None: assignments endpoint is standard student accessible |
| [`rubrics.json`](./rubrics.json) | `/api/v1/courses/99001/assignments (rubric include)` | `HTTP 200` | ✅ Present | Student paste-rubric mode in UI if teacher created rubric as unlinked table |
| [`enrollments.json`](./enrollments.json) | `/api/v1/courses/99001/enrollments` | `HTTP 200` | ✅ Present | OffCanvas Grade Engine reproduces totals from scratch via raw submissions |
| [`submissions.json`](./submissions.json) | `/api/v1/courses/99001/students/submissions` | `HTTP 200` | ✅ Present | Prompt student to enter unposted/hidden score manually for 'What-If' recalculation |
| [`announcements.json`](./announcements.json) | `/api/v1/announcements` | `HTTP 200` | ✅ Present | Direct parse of course discussions topic list |
| [`modules.json`](./modules.json) | `/api/v1/courses/99001/modules` | `HTTP 200` | ✅ Present | Scan course files directly if modules are locked or unused |
| [`pages.json`](./pages.json) | `/api/v1/courses/99001/pages` | `HTTP 200` | ✅ Present | Extract grounded text from syllabus and module items |
| [`files.json`](./files.json) | `/api/v1/courses/99001/files` | `HTTP 200` | ✅ Present | If Files tab hidden by instructor, retrieve file links embedded in module items |
| [`calendar_events.json`](./calendar_events.json) | `/api/v1/calendar_events` | `HTTP 200` | ✅ Present | Derive calendar blocks directly from assignment due dates (`due_at`) |

## Missing and Restricted Fields Summary

1. **Course Credit Hours** (`courses.json`):
   - *Observation*: Canvas LMS REST API does not provide credit hours on Course objects.
   - *Fallback*: OffCanvas requests credit hours from the student in the side panel or defaults to 3.0/4.0.

2. **Unposted / Hidden Grades** (`submissions.json`):
   - *Observation*: When a teacher has grade posting policy set to manual and grades are unposted (`posted_at: null`), student view cannot read the score.
   - *Fallback*: OffCanvas allows the student to input their expected score into the What-If model.

3. **Instructor Total Score Suppression** (`enrollments.json`):
   - *Observation*: If the instructor checks 'Hide totals in student grades summary', Canvas removes `computed_current_score`.
   - *Fallback*: OffCanvas's independent grade engine computes the exact grade directly from raw assignment scores and group weights.
