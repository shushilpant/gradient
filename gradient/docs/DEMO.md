# GRADIENT: 4-Minute Live & Replay Demo Guide

*Target Audience: Hackathon Judges, Academic Reviewers & Pair Programmers*  
*Demonstration Time: Exactly 4 minutes (240 seconds)*  
*Modes Supported: Replay (`make demo-replay`) & Live Sandbox (`make demo-live`)*

---

## 1. Demo Cast, Sandbox Accounts & Environment

- **LMS Instance**: Synthetic Canvas LMS (REST API)
- **Student Persona**: Alex Chen (Student ID `99001`, enrolled in CS 101, MATH 201, BIO 110)
- **Teacher Account**: Prof. Ada Lovelace (Token: `test_teacher_token`)
- **Key Pain Point**: Complex syllabus rules (weighted assignment groups, drop-lowest, drop-highest, never-drop, unposted grades) create opaque academic standing. Students cannot determine where to invest limited study time across multiple competing courses.

---

## 2. Timed Run of Show (4:00 Total)

```
0:00 ─── 0:40 : Safety Guard & Assessment Hard Stop (Default-Deny)
0:40 ─── 1:20 : Canvas Grade Model Exact Match Oracle
1:20 ─── 2:00 : Multi-Course Effort Optimizer & Robustness Rating
2:00 ─── 2:40 : Socratic Hint Ladder with Friction Gate & Leak Guard
2:40 ─── 3:20 : Pre-Submit Rubric Critique & Ephemeral Privacy
3:20 ─── 4:00 : Academic Study Scheduler, RFC 5545 Sync & Change Radar
```

---

### Act 1: Safety Guard & Quiz-Taking Hard Stop (0:00 - 0:40)

- **Exact Click 1**: Open browser to `http://127.0.0.1:8085/courses/99001`.
  - *Show*: GRADIENT panel mounts cleanly on the right inside an isolated **Shadow DOM**; zero CSS bleed.
- **Exact Click 2**: Click the red button: **"Simulate Quiz Take Page (Hard Stop Test)"** (`/quizzes/501/take`).
  - *Show*: The side panel **disappears instantly / refuses to inject**.
  - *Say*: *"Rule 2 is non-negotiable. GRADIENT strictly refuses to run on quiz-taking and timed exam pages. Notice that even if the student wants assistance, the panel defaults to deny with zero user bypass."*
- **Exact Click 3**: Click `← Return to Course Dashboard`.

---

### Act 2: Exact Canvas Grade Model Reproduction (0:40 - 1:20)

- **Exact Click 4**: In the GRADIENT panel, look at the **"Official Course Grades"** card.
  - *Show*: **CS 101: 90.71% Current / 58.90% Final Projection** with the green `✓ Matches Canvas` badge.
  - *Say*: *"Notice the green badge: GRADIENT reproduces Canvas's exact gradebook math across all weighted groups, dropping HW 2 (72%) while preserving HW 1 (95%) via never-drop, and correctly handling unposted scores. The difference between Canvas and our model is 0.00%."*

---

### Act 3: Multi-Course Effort Optimizer & Pacing Robustness (1:20 - 2:00)

- **Exact Click 5**: Drag the **Study Capacity slider** from 8 hours to **12 hours**.
  - *Show*: Projected GPA updates dynamically from `2.61` to `2.85` (+0.79 pts), with top recommendation allocated to `Final Project Implementation & Report (CS 101)` followed by `Final Exam (MATH 201)`.
  - *Hover*: Hover over any number to show the **Assumption tooltip**.
  - *Show*: Point to the green `ROBUSTNESS: high` badge.
  - *Say*: *"GRADIENT maximizes expected term GPA weighted by credit hours using Common Random Numbers Monte Carlo. The robustness badge proves that even if this student learns 30% slower or faster than assumed, the priority ordering does not change."*

---

### Act 4: Socratic Hint Ladder & Answer-Leak Guard (2:00 - 2:40)

- **Exact Click 6**: Click the **Assignment** tab, and navigate to the **Socratic Hint Ladder**.
- **Exact Click 7**: Click **R0 (Task Restatement)** $\to$ **R1 (Nudging Question)** $\to$ **R2 (Name Technique)**.
- **Exact Click 8**: Click **R3 (Worked Example)** without typing in the attempt box.
  - *Show*: Yellow friction gate alert: *"Friction Gate: Please explain your attempt or what you tried first (minimum 15 characters)."*
- **Exact Click 9**: Type in the box: `"I tried setting up two equations and subtracted y from both sides."` and click R3.
  - *Show*: R3 unlocks with an **Isomorphic Variant** verified by **SymPy**. The badge displays `SymPy Verified`.
  - *Say*: *"Zero answer leaks. For math and code, we solve the assigned problem and verify an isomorphic problem with changed constants. The student never gets the solution to their assigned problem."*

---

### Act 5: Pre-Submit Rubric Critique & Ephemeral Privacy (2:40 - 3:20)

- **Exact Click 10**: Under **Pre-Submit Rubric Critique**, click **"Analyze Draft Against Rubric"**.
  - *Show*: Weakest-first criteria order (`crit_fp_1` $\to$ `crit_fp_2` $\to$ `crit_fp_3`). Verbatim quoted evidence from the draft.
  - *Say*: *"Rule 12: Zero predicted numeric grades. Notice there is no '85/100' or letter grade. Rule 5: Zero ghostwriting. We highlight what is missing, but never rewrite sentences or generate prose for the student."*
- **Exact Click 11**: Click the **Settings** tab and view the **"Canvas Read-Only Invariant"** audit log.
  - *Say*: *"Transparent privacy: We certify ephemeral memory. No student draft or score is ever retained on disk or in a database."*

---

### Act 6: Study Scheduler, RFC 5545 Sync & Change Radar (3:20 - 4:00)

- **Exact Click 12**: Return to the **Dashboard** and scroll to **Study Schedule & Crunch Radar**.
  - *Show*: 30-minute study blocks scheduled around busy blocks, sleep window, and deadline buffers.
  - *Show*: Point to the **Change Radar Alert**: *"⚠️ Change Radar: Due Date Change Detected: Professor announced deadline moved to Friday, Nov 14 at 11:59 PM."*
- **Exact Click 13**: Click **"✓ Confirm & Replan"**.
  - *Show*: Schedule instantly re-solves, moving study blocks to accommodate the extension.
- **Exact Click 14**: Click **"📥 Export .ICS"**.
  - *Show*: Downloads standard `.ics` file with stable UIDs (`gradient-99001-1004-b0@gradient.app`) and `SEQUENCE: 1` for seamless Apple Calendar / Google Calendar sync.
  - *Conclude*: *"GRADIENT: Transparent, grounded, and academically honest pair programming for students."*

---

## 3. Fallback Plan for Every Step

| Demo Step | Potential Failure Mode | Built-in Fallback Action |
| :--- | :--- | :--- |
| **Step 1: Panel Injection** | Browser extension reload error | Open `http://127.0.0.1:8085/courses/99001` which loads pre-bundled MV3 content script directly into mock page. |
| **Step 2: Quiz Hard Stop** | DOM query delay | Test page `/quizzes/501/take` has hardcoded `#quiz_timer` triggering synchronous instant default-deny. |
| **Step 3: Grade Model** | Sandbox Canvas API rate limit / 429 | Extension operates in `isFixtureMode: true`, loading verified fixtures from disk with zero network delay. |
| **Step 4: Optimizer Slider** | High CPU load during Monte Carlo | Optimizer runs 800 CRN samples in $\approx 1.4$s; step size clamped to 0.5h. |
| **Step 5: Hint Ladder / SymPy**| Backend FastAPI connection refused | Client-side fallback templates immediately render verified isomorphic variant and friction gate. |
| **Step 6: Change Radar Confirm**| Replan timeout | Deterministic greedy fallback activates instantly if OR-Tools CP-SAT exceeds 5.0s. |

---

## 4. Verification Commands

```bash
# Rehearsal & Verification Suite
make test-schedule
make test-ui
make report
```
