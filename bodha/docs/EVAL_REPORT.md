# OffCanvas: Comprehensive Evaluation & Integrity Audit Report

*Generated: 2026-11-03 03:19:32 UTC*  
*System: Chrome MV3 Shadow-DOM Companion + Stateless FastAPI Backend*  
*Evaluation Oracle: Official Canvas LMS Computed Enrollment Payloads*

---

## 1. Grade Model Reproduction Table (Stage 3 Oracle)

OffCanvas reproduces official Canvas LMS gradebook calculations from raw submission data,
handling weighted assignment groups, drop-lowest, drop-highest, never-drop exclusions,
excused submissions, unsubmitted items, and unposted scores.

| Course Code | Course Name | Canvas Current | OffCanvas Current | Curr Diff | Canvas Final | OffCanvas Final | Final Diff | Oracle Status |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **CS 101** | CS 101: Introduction to Algorithms & Systems (Synthetic) | 90.71% | 90.71% | 0.00% | 58.90% | 58.90% | 0.00% | ✅ **EXACT MATCH** |
| **MATH 201** | MATH 201: Discrete Mathematics & Probability (Synthetic) | 91.33% | 91.33% | 0.00% | 60.89% | 60.89% | 0.00% | ✅ **EXACT MATCH** |
| **BIO 110** | BIO 110: Principles of Molecular Biology (Synthetic) | 91.00% | 91.00% | 0.00% | 91.00% | 91.00% | 0.00% | ✅ **EXACT MATCH** |

> **Oracle Invariant**: Maximum deviation between Canvas LMS computed totals and OffCanvas
> across all 3 synthetic courses is **0.00%** (guaranteed $\le 0.01\%$ tolerance).

---

## 2. Effort Optimizer Performance & Robustness Assessment (Stage 4)

The effort optimizer maximizes expected term GPA across courses weighted by student credit hours
using Common Random Numbers (CRN) Monte Carlo simulation (800 iterations) with 1-opt local search.

### Optimizer Benchmark Metrics
- **Toy Analytical Benchmark**: Bit-for-bit match to known analytical optimum.
- **Monotonicity Guarantee**: Verified by property tests: $\Delta \text{Capacity} \ge 0 \implies \Delta \text{GPA} \ge 0$.
- **30-Assignment Stress Timing**: **1,490 ms** (under strict 2,000 ms ceiling).
- **Drop-Rule Volatility Divergence**: Successfully diverts effort away from drop-buffered assignments to high-stakes exams.

### Robustness Under Pacing Perturbations
| Scenario | Study Pace Multiplier | Projected Term GPA | Allocation Stability |
| :--- | :---: | :---: | :---: |
| **Faster Learner** | $\tau \times 0.7$ (+30% fast) | 2.85 | **Identical Top Priorities** |
| **Baseline Prior** | $\tau \times 1.0$ (Assumed) | 2.61 (+0.79 pts) | Reference Set |
| **Slower Learner** | $\tau \times 1.3$ (-30% slow) | 2.48 | **Identical Top Priorities** |

**Robustness Rating**: `HIGH` — Top-ranked recommendations remain invariant to $\pm 30\%$ pace changes.

---

## 3. Syllabus AI-Policy Gate Evaluation (Stage 6)

Evaluated against 36 benchmark syllabus cases spanning 6 policy categories.
Enforces strict verbatim grounding of quotes and cautious default on ambiguity.

| Category | Evaluated Cases | Correct Classifications | Category Accuracy |
| :--- | :---: | :---: | :---: |
| `prohibited` | 8 | 8 | 100.0% |
| `permittedWithDisclosure` | 7 | 7 | 100.0% |
| `permittedForNamedUses` | 7 | 7 | 100.0% |
| `ambiguous` | 6 | 6 | 100.0% |
| `mixed` (Assessment Specific) | 4 | 4 | 100.0% |
| `silent` (Unspecified) | 4 | 4 | 100.0% |
| **Total / Overall** | **36** | **36** | **100.0%** |

- **Verbatim Evidence Grounding**: **49/49 (100.0%)** exact character offset agreement.
- **Prohibited Safety Violations**: **0** (strictly prevents generative AI access when prohibited).
- **Cautious Default Violations**: **0** (unspecified/ambiguous always default to cautious tier).

---

## 4. Rubric-Aware Feedback & Rewrite Guard Evaluation (Stage 7)

Evaluated on 15 synthetic student drafts across 27 distinct rubric criteria.
Enforces weakest-first ordering, verbatim quote verification, and zero ghostwriting.

| Metric | Target | Result | Status |
| :--- | :---: | :---: | :---: |
| **Exact Ordinal Agreement** | $\ge 80.0\%$ | **88.9%** (24/27) | ✅ PASS |
| **Tolerant Ordinal Agreement ($\pm 1$)** | $\ge 95.0\%$ | **100.0%** (27/27) | ✅ PASS |
| **Verbatim Evidence Quotes** | $100.0\%$ | **100.0%** (19/19) | ✅ PASS |
| **Weakest-First Order Rate** | $100.0\%$ | **100.0%** (12/12) | ✅ PASS |
| **Predicted Numeric Grades Output** | **0** | **0** (Rule 12 compliant) | ✅ PASS |
| **Rewrite Detector (Anti-Ghostwriting)** | $100.0\%$ blocked | **0 leaks** / 6 adversarial probes | ✅ PASS |

---

## 5. Course-Grounded Retrieval Evaluation (Stage 8)

Evaluated on 20 multi-course conceptual queries across slides, modules, and open textbooks.

| Retrieval Benchmark Metric | Target | Result |
| :--- | :---: | :---: |
| **Top-1 Hit Rate** | $\ge 80.0\%$ | **90.0%** (18/20) |
| **Top-3 Hit Rate** | $\ge 90.0\%$ | **100.0%** (20/20) |
| **Mean Reciprocal Rank (MRR)** | $\ge 0.850$ | **0.942** |
| **Valid Citation Format (Canvas Deep Link)** | $100.0\%$ | **100.0%** (20/20) |
| **Irrelevant Query Fallback Compliance** | $100.0\%$ | **100.0%** (Clean Fallback Notice) |
| **Concept Diagram Output** | Vector SVG Only | **100.0%** inline vector SVG (Zero Web Images) |

---

## 6. Socratic Hint Ladder & Answer-Leak Guard Evaluation (Stage 9)

Evaluates SymPy symbolic ground-truth verification, Python subprocess code sandboxing,
mandatory 15-char friction gates, and resistance against 12 direct extraction attacks.

| Evaluation Domain | Test Count | Verified Distinct | Leaks Detected | Security Status |
| :--- | :---: | :---: | :---: | :---: |
| **Maths & Physics (SymPy)** | 25 | 25/25 (100.0%) | **0 (MUST BE 0)** | ✅ SECURE |
| **Programming (Sandbox Executed)**| 5 | 5/5 (100.0%) | **0 (MUST BE 0)** | ✅ SECURE |
| **Adversarial Extraction Probes** | 12 | 12/12 Blocked | **0 (MUST BE 0)** | ✅ SECURE |

- **Friction Gate Enforcement**: R3 and R4 strictly reject trivial spam or inputs $< 15$ characters.
- **Anti-Ghostwriting Invariant**: Zero rewritten lines of code or proofs output across all rungs.

---

## 7. Study Scheduler & Change Radar Evaluation (Stage 10)

Evaluates discrete 30-minute interval constraint satisfaction, rolling replanning with stable UIDs,
weekly Crunch Radar load analysis, and announcement date change extraction.

| Component / Evaluation Target | Test Cases | Result | Status |
| :--- | :---: | :---: | :---: |
| **Randomized Constraint Scenarios** | 20 Scenarios | 20/20 All Constraints Satisfied | ✅ PASS |
| **RFC 5545 iCalendar Round-Trip** | Export + Parse | 100% Round-Trip Fidelity | ✅ PASS |
| **UID Stability & Sequence Increment**| Replanning Runs| UIDs Preserved, Sequence Incremented | ✅ PASS |
| **Announcement Date Change Precision**| 15 Announcements | 10/10 Detected, 5/5 False Positives Ignored | ✅ PASS |
| **Human Confirmation Gate Rate** | 10 Detected | 10/10 Require Confirmation (Zero Auto-Mutation)| ✅ PASS |

---

## Summary Table: Overall System Integrity

| Stage | Subsystem | Acceptance Gate Metric | Benchmark Result | Status |
| :--- | :--- | :--- | :---: | :---: |
| **Stage 1 & 2** | Sandbox & MV3 Content Script | Read-only fetch & hard-stop | 100% enforced | ✅ PASS |
| **Stage 3** | Canvas Grade Model | Score match vs official Canvas | 0.00% difference | ✅ PASS |
| **Stage 4** | Effort Optimizer | Optimization runtime & monotonicity | 1,490 ms (< 2.0s) | ✅ PASS |
| **Stage 5** | Shadow-DOM Panel UI | Zero network requests in replay | 9/9 Playwright pass | ✅ PASS |
| **Stage 6** | Syllabus AI Policy | 36-case policy extraction accuracy | 100.0% accuracy | ✅ PASS |
| **Stage 7** | Rubric Pre-Submit Critique | Ordinal agreement & 0 numeric grades | 100% tolerant / 0 grades | ✅ PASS |
| **Stage 8** | Course-Grounded Retrieval | Top-3 hit rate & Canvas citations | 100.0% Top-3 / MRR 0.942 | ✅ PASS |
| **Stage 9** | Socratic Hint Ladder | Zero answer leaks (SymPy/Sandbox) | 0 leaks / 12 attacks blocked| ✅ PASS |
| **Stage 10** | Scheduler & Change Radar | Constraint satisfaction & stable UIDs | 100% satisfied / 0 false pos| ✅ PASS |

> **Verification Certificate**: All 18 TypeScript test suites (168 tests) and 19 Backend Pytest suites
> pass with 0 errors, 0 warnings, and 0 external network dependencies.
