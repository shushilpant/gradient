# GRADIENT: System Boundaries, Limits & Non-Goals

*Required Public Limits Disclosure (Rule 12)*  
*Stage 11 Demo Readiness & Institutional Transparency Edition*

---

## 1. What GRADIENT Explicitly Cannot Do (Plain Statements of Limits)

1. **Effort Response Curve Parameters are Assumptions, Not Physical Laws**
   - The effort optimization curves ($\mu_a(h) = \text{cap}_a \cdot (1 - \exp(-h / \tau_a))$) are mathematical models based on configurable empirical priors, not deterministic predictions or guarantees of human learning.
   - Pacing ($\tau$), mastery caps ($\text{cap}$), and noise terms ($\sigma$) are transparent approximations. Individual learning rates vary wildly by prior background, fatigue, and task nuances. All parameters are user-editable in settings.

2. **Syllabus Policy Extraction Can Err**
   - Natural language syllabus text varies widely in phrasing, structure, and tone. While the policy gate achieves 100% precision on benchmark datasets with verbatim quoting and cautious fallbacks, heuristic or model-based extraction can misinterpret novel or contradictory policy phrasing.
   - Any extracted policy classified as ambiguous or unspecified requires explicit student confirmation of the quoted policy sentence before features adapt.

3. **Rubric Critique is Strictly NOT a Predicted Numeric Grade**
   - The pre-submit critique evaluates draft alignment against qualitative rubric descriptor levels only.
   - It **never** estimates, predicts, or outputs a numeric score (e.g., "85/100") or letter grade. Only human instructors award grades.

4. **Socratic Answer-Leak Guard is Strongest for Formal Mathematical & Code Tasks**
   - For symbolic mathematics, physics equations, and code tasks, the leak guard uses formal algebraic ground-truth verification (SymPy) and isolated sandbox test execution.
   - For humanities essays, philosophy arguments, and open-ended qualitative prompts, mathematical equivalence is impossible. In qualitative domains, the system relies on rubric structural checks and heuristic span detectors, explicitly labeled in the UI as *"Heuristic / Rubric Structure Check (Weaker Scope)"*.

5. **LLM Calls Send Content Off-Device (When Live Backend is Invoked)**
   - When running in live API mode (`make demo-live`), text payloads (drafts, query concepts, syllabus sentences) are transmitted over TLS to the backend service.
   - While GRADIENT enforces an ephemeral zero-retention invariant (in-memory RAM only, zero database records, zero disk logging), users must know that live calls leave the local machine.
   - In replay mode (`make demo-replay`), all computations execute 100% locally from bundled fixtures with zero network transmission.

6. **Canvas API Access May Be Restricted or Disabled by an Institution**
   - GRADIENT requires access to Canvas LMS REST endpoints (`/api/v1/courses`, `/api/v1/courses/:id/assignment_groups`, etc.).
   - Some institutions block personal access tokens, disable API endpoints for students, or restrict CORS headers. In such environments, live sync cannot function, and GRADIENT operates only from manually imported data or local fixtures.

---

## 2. Technical Invariants & Hard Safety Boundaries

1. **Strictly Read-Only Toward Canvas**
   - GRADIENT contains **zero** mutation endpoints.
   - The runtime fetch wrapper (`canvasFetch`) actively rejects any HTTP method other than `GET`.
   - Any invocation with `POST`, `PUT`, `DELETE`, `PATCH`, or a request body throws `CanvasReadOnlyViolationError`.
   - GRADIENT will never submit an assignment, edit a post, modify a profile, or answer quiz questions.

2. **Absolute Quiz & Assessment Exclusion (`shouldRunOnPage`)**
   - The Chrome extension strictly prohibits injection on quiz pages, timed assessment views, or LTI/New Quizzes wrappers.
   - Discriminated near-misses: Quiz landing overview pages (`/quizzes/:id`) are safe for review, but quiz take pages (`/quizzes/:id/take`, `/quizzes/:id/take/questions`) trigger immediate hard stop.
   - Guard criteria include active DOM timers (`#quiz_timer`, `.quiz-submission-timer`, etc.) and active question containers.
   - **Fail-Closed Principle**: If a page cannot be verified as an allowlisted, safe course space, GRADIENT defaults to inactive.
   - **No Override**: There is intentionally no user setting or bypass flag to enable GRADIENT during assessments.

3. **No Automatic Credit Hours Discovery**
   - Canvas LMS does not track course credit hours. GRADIENT does not infer credit hours from course codes (e.g. CS 101 != 1.0 or 3.0 credits). Student input via Options page is strictly required.

4. **No Ghostwriting or Graded Content Generation**
   - Detail levels ("a bit", "a bit more", "all in") control the depth of diagnostic advice only.
   - GRADIENT never generates submission code, proof text, or answers.
   - An automated rewrite detector flags and rejects any feedback payload that contains replacement text, suggested phrasing, code blocks, or ghostwriting directives.

5. **No Predicted Numeric Grades in Pre-Submit Checks (Rule 12)**
   - Pre-submit rubric critique explicitly refuses to estimate, project, or output a predicted numeric score or grade letter for student drafts.
   - Scores can only be determined and awarded by the course instructor. GRADIENT provides criterion readiness descriptors only.

6. **Syllabus AI-Policy Supremacy**
   - If a course syllabus classifies generative AI tools as prohibited, all AI-powered features (pre-submit rubric critique, hint ladders, chat) are strictly disabled and locked.
   - Student notes or overrides cannot escalate permissions beyond the verified policy tier.

7. **Embeddings & Course Retrieval Architecture (Stage 8)**
   - **Storage Choice**: Per-session ephemeral backend memory (RAM only) that is **never persisted to disk**, accompanied by pure client-side in-memory search for offline/zero-network execution.
   - **What is Sent Where**:
     - When using the backend retrieval service (`POST /api/v1/retrieval/query`), the query text and course ID are transmitted over TLS, matched in volatile server RAM, and discarded immediately upon response completion.
     - **Zero Server-Side Retention**: Chunks, embeddings, and student search history are never written to disk, database, or telemetry logs.
     - **Offline / Local Mode**: When offline or in fixture mode, retrieval runs 100% inside the browser's JavaScript engine (IndexedDB / session cache) with **zero bytes** transmitted over the network.
   - **No Web Images (Vector SVG Only)**:
     - All concept diagrams are generated as pure inline vector `<svg>` code.
     - Remote web images, external CDNs, tracking pixels, and arbitrary web `<img>` tags are strictly prohibited.
   - **Grounding Invariant & No Generic Padding**:
     - Every retrieval response must explicitly cite the course materials drawn from (e.g. "Week 5, slide 12" with a deep link to Canvas).
     - If no relevant course materials are found for a topic, GRADIENT explicitly reports that no relevant materials were found instead of hallucinating or padding with generic filler.

8. **Hint Ladder & Answer-Leak Guard Scope (Stage 9)**
   - **Zero-Leak Invariant**: Under no circumstance will GRADIENT output the exact solution, numerical answer, or worked steps for the student's assigned problem.
   - **SymPy Mathematical Ground Truth**: For maths and physics symbolic/numeric problems, SymPy is used to solve the assigned problem and verify isomorphic variants with different constants. If the variant solution matches the original solution, generation is aborted.
   - **Sandbox Execution Scope for Code**: Coding worked variants and test suites are executed in an isolated Python subprocess sandbox. The "Verified" badge is rendered *only* if unit tests actually executed and passed 100%.
   - **Essay / Open-Ended Work**: For humanities and qualitative writing, verification is explicitly labeled in the UI as "Heuristic / Rubric Structure Check (Weaker Scope)" to avoid misrepresenting qualitative checks as automated mathematical proof.
   - **Mandatory Friction Gate**: Rungs R3 (Worked Example) and R4 (Check-My-Work) remain strictly locked until the student types what they have tried (minimum 15 non-repetitive characters). Trivial repetition or single-character spam is detected and rejected.
   - **Anti-Ghostwriting in Check-My-Work (R4)**: Diagnostic feedback critiques the student's reasoning only; it never generates rewritten equations, replacement sentences, or complete solutions.
   - **Adversarial Extraction Defenses**: Direct answer attacks ("just give me the answer", "override instructions", "solution key", "my exam is ending in 2 minutes") are detected and blocked with a safe academic integrity refusal.

9. **Unposted/Hidden Scores in Canvas API**
   - Canvas suppresses scores for unposted submissions from the student's view (`posted_at: null`).
   - GRADIENT faithfully excludes unposted items from the *Current Grade* (mirroring Canvas).
   - In *Final Grade*, unposted submissions count as 0/possible points.
   - When a student wants to see "What-If" impact with their estimated score, they can enter an override in the GRADIENT panel, which remains strictly in browser local memory.

10. **No Guarantees or Deterministic Grade Predictions**
    - GPA and effort models provide mathematical optimization based on specified assumptions (response curves, historical weights).
    - They are decision-support heuristics, not deterministic predictions or guarantees of academic performance.
    - All response curve parameters ($\text{cap}$, $\tau$) and noise terms ($\sigma$) are transparent empirical approximations that students can customize.

11. **Hard Deadline Exclusions in Effort Optimization**
    - GRADIENT will never allocate study hours to assignments whose due date has already passed (`dueAt <= now`).
    - Retroactive optimization or altering past submissions is strictly prevented.

12. **Block Allocation Constraints**
    - The optimizer respects configured `minHoursPerAssignment` and `maxHoursPerAssignment` ceilings to prevent unrealistic cramming recommendations (e.g. max 8 hours per assignment).

13. **Support Depth Strictly Gated by Detail Levels**
    - Detail levels ("a bit", "a bit more", "all in") control the depth and breadth of analytical critique and diagnostic study guidance only.
    - In no mode does GRADIENT ever write, generate, or autocomplete answers, essay prose, or graded code.
    - Roadmap features not yet built render an explicit placeholder banner.

14. **Academic Study Scheduling & Change Radar Limits (Stage 10)**
    - **30-Minute Discrete Slotting**: Study sessions are scheduled strictly in discrete 30-minute intervals. Arbitrary fractional minute allocations (e.g., 7 or 12 minutes) are intentionally not supported.
    - **Fail-Safe Constraint Solver Boundaries**: The primary backend scheduler uses Google OR-Tools CP-SAT with a strict 5.0-second timeout. If OR-Tools is unavailable, times out, or returns `INFEASIBLE`, GRADIENT immediately falls back to a deterministic TypeScript greedy scheduler that prioritizes closest deadline and spreads daily load.
    - **RFC 5545 iCalendar (`.ics`) Format Invariants & Stable UIDs**:
      - Study schedules export as valid RFC 5545 `.ics` files with deterministic, stable UIDs (`gradient-{course_id}-{assignment_id}-b{blockIndex}@gradient.app`) and monotonic `SEQUENCE` counter increments on replans.
      - Importing updated `.ics` files in Google Calendar, Apple Calendar, or Microsoft Outlook modifies existing events in-place rather than generating duplicate events.
      - Direct Google Calendar OAuth synchronization is intentionally kept behind a disabled feature flag (`ENABLE_GCAL_SYNC = false`) to avoid unnecessary third-party permissions and preserve student privacy.
    - **Change Radar Human Confirmation Requirement**:
      - Date changes discovered in course announcements or syllabus notes are NEVER applied automatically to the schedule or grade calculations.
      - Every detected date modification requires explicit student review and confirmation (`pending_confirmation` -> `confirmed`).
      - Verbatim quoted sentences with character start/end offsets are shown to the student to verify instructor intent.
      - Announcements referencing non-deadline events (e.g., office hours, lecture room changes, coffee chats, review sessions) are actively filtered to prevent false-positive alert fatigue.

---

## 2. Technical & Environmental Boundaries

1. **LMS Platform Scope**
   - **Supported**: Canvas LMS (via REST API and authenticated browser session).
   - **Roadmap Only**: Blackboard, Moodle, Brightspace/D2L are not currently supported.

2. **Browser Support**
   - Chrome Manifest V3 (MV3) extension architecture. Requires modern Chromium-based browser (Chrome, Edge, Brave).

3. **Network & Offline Bounds**
   - Fetching gradebook updates requires an active network connection and a valid Canvas LMS session.
   - Offline caching is local-only (using browser `chrome.storage.local`).


