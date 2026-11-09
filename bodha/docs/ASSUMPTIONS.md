# OffCanvas: Engineering Assumptions & Modeling Foundations

*Last Updated: Stage 5 (Shadow-DOM Preact Panel UI & Playwright Testing)*  
*Honesty In Modeling (Rule 5 & Rule 12)*

---

## 1. Grade Computation Model Assumptions

1. **Credit Hours Absence in Canvas REST API**
   - **Canvas Reality (Verified Stage 1 & 2)**: Probed `/api/v1/courses/:id` with all includes. Confirmed that Canvas REST API does not provide credit hours on Course objects.
   - **Assumption**: Credit hours must be provided by the student or default to 3.0 or 4.0 credit hours. Configured in Options page (`courseCreditHours`) and stored in browser sync storage.
   - **Consequence**: Term GPA weighting across courses uses student-confirmed credit hours.

2. **Unposted Grades & Grade Posting Policy**
   - **Canvas Reality (Verified Stage 1 & 2)**: When a course uses manual posting policy, unposted submissions return `posted_at: null` and the score is withheld in student view.
   - **Current Grade Assumption**: OffCanvas defaults to omitting unposted scores from the current grade calculation (matching Canvas student view where unposted items are omitted and active group weights are normalized).
   - **Final Grade Assumption**: In Canvas final score, unposted assignments count as unsubmitted (0 points out of possible points). OffCanvas mirrors this exactly (`treatUnsubmittedAsZero: true` treats unposted items as 0).
   - **What-If Modeling**: For what-if modeling, the student is given an explicit input field to supply unposted scores.

3. **Instructor Total Score Suppression**
   - **Canvas Reality (Verified Stage 1 & 2)**: If the instructor enables "Hide totals in student grades summary", Canvas strips `computed_current_score` and `computed_final_score` from student enrollment payloads.
   - **Assumption**: OffCanvas independently recalculates the total grade directly from raw assignment scores and group weights, freeing the student from total score suppression while remaining 100% faithful to the official syllabus rules.

4. **Support Depth (Detail Levels)**
   - **Levels**: "a bit", "a bit more", "all in".
   - **Assumption**: Controls the cognitive depth, rubric criteria granularity, and derivation steps of diagnostic feedback. It never produces or completes graded submission work for students.

5. **Canvas Assignment Drop Logic**
   - **Canvas Rule**: Canvas drops the lowest (or highest) assignment(s) that maximize the resulting group percentage:
     $$\text{Group \%} = \frac{\sum \text{kept scores}}{\sum \text{kept possible points}}$$
   - **Assumption**: If all assignments in a group have equal point values (e.g., 100 pts each), dropping lowest points is identical to dropping lowest percentage. If possible points differ, OffCanvas searches candidate combinations to select the subset maximizing the group ratio, strictly excluding any assignment whose ID is present in `neverDrop`.
   - **Tie-Breaking**: When two assignments yield the exact same resulting ratio, OffCanvas tie-breaks by dropping the assignment with higher possible points (higher potential volatility impact), matching Canvas standard behavior.

6. **Missing and Excused Submissions**
   - **Excused Items**: Submissions marked `excused: true` are completely excluded from both points earned and points possible. Dropping rules operate only over the non-excused pool.
   - **Missing Items**: Unless a teacher enters 0 or an explicit missing policy has zeroed out the item, a missing submission with `score: null` is treated as ungraded in *Current Grade* and 0 points in *Final Grade*.

7. **Needed Score Root Solver (`neededScoreForTarget`)**
   - **Non-Linear Dynamics**: Changing a score can cause drop rule shifts (a previously dropped item becomes kept, or vice versa) and alters normalized group weight allocations.
   - **Assumption**: Closed-form linear inversion fails when drop sets change. OffCanvas employs a monotonic bisection search (50 iterations, tolerance $10^{-5}$) between 0 and $2 \times \text{pointsPossible}$. If the target is unreachable with $100\%$, OffCanvas explicitly indicates extra credit requirements.

8. **Weighted Assignment Groups Normalization**
   - **Canvas Rule**: When `apply_assignment_group_weights` is true and some groups have no graded assignments yet, Canvas normalizes the final score by dividing by the sum of weights of groups with active grades.
   - **Assumption**: OffCanvas implements this normalization verbatim:
     $$\text{Current Pct} = \frac{\sum_{g \in \text{active}} \text{Pct}_g \times \text{Weight}_g}{\sum_{g \in \text{active}} \text{Weight}_g}$$

9. **Grading Scheme & GPA Scale**
   - **Assumption**: If a course provides a custom `grading_standard` from Canvas, OffCanvas uses it. If not set on the course, OffCanvas applies standard plus/minus thresholds (93% A, 90% A-, 87% B+, etc.) and the standard 4.0 scale (A: 4.0, A-: 3.7, B+: 3.3, B: 3.0, etc.), both user-editable.


---

## 2. Effort Optimiser Assumptions (Stage 4)

1. **Concave Diminishing-Returns Response Curves**
   - For an upcoming assignment $a$ with allocated study hours $h$:
     $$\mu_a(h) = \text{cap}_a \cdot (1 - \exp(-h / \tau_{a,\text{eff}}))$$
   - When $h = 0$, $\mu_a(0) = 0$ (unsubmitted / unattempted work receives 0 points in final grade).
   - $\text{cap}_a$: The asymptotic mastery ceiling achievable under unlimited study (e.g. 98% for homework, 92% for timed exams).
   - $\tau_a$: Time constant (hours required to reach $\approx 63.2\%$ of ceiling).

2. **Task Type Empirical Priors (`core/optimiserPriors.ts`)**
   | Task Type | Mastery Cap | Baseline $\tau$ | Noise $\sigma$ | $\alpha_{\text{logged}}$ (Learning Rate) |
   |:---|:---:|:---:|:---:|:---:|
   | Homework | 0.98 | 3.0h | 0.05 | 0.15 / hr |
   | Problem Set | 0.96 | 4.0h | 0.06 | 0.15 / hr |
   | Essay | 0.94 | 6.0h | 0.07 | 0.12 / hr |
   | Exam / Test | 0.92 | 8.0h | 0.08 | 0.10 / hr |
   | Quiz | 0.95 | 2.0h | 0.05 | 0.18 / hr |
   | Project | 0.95 | 10.0h | 0.07 | 0.10 / hr |
   | Default | 0.95 | 4.0h | 0.06 | 0.14 / hr |
   *All priors are labeled as ASSUMPTIONS and fully editable in the student options UI.*

3. **Logged Hours Multiplicative Update**
   - Prior hours logged by the student accelerate time-to-mastery by compressing $\tau$:
     $$\tau_{\text{eff}} = \tau_{\text{base}} \times \tau_{\text{scale}} \times \max\left(0.25, \frac{1}{1 + \alpha_{\text{logged}} \cdot h_{\text{logged}}}\right)$$
   - The safety floor (0.25) prevents singular zero-time collapse even with extensive logged study.

4. **Testing Uncertainty & Common Random Numbers (CRN)**
   - Score noise is modeled via a Truncated Normal distribution clamped to $[0.0, 1.0]$:
     $$\text{scoreFraction}_{a, s} = \operatorname{clamp}(\mu_a(h_a) + \sigma_a \cdot Z_{a, s}, 0.0, 1.0)$$
   - Standard normal variates $Z_{a, s} \sim \mathcal{N}(0, 1)$ are pre-generated using a deterministic Mulberry32 PRNG and Box-Muller transform.
   - **Common Random Numbers (CRN)**: The same random noise matrix is reused across all candidate allocations during optimization. This eliminates Monte Carlo comparison variance, guaranteeing smooth marginal comparisons and strict monotonicity.

5. **Term GPA Objective & Credit Hour Weighting**
   - Semester GPA objective function:
     $$\mathbb{E}[\text{Semester GPA}] = \frac{\sum_C w_C \cdot c_C \cdot \mathbb{E}[\text{GPA}_C]}{\sum_C w_C \cdot c_C}$$
   - $c_C$: Course credit hours (user-entered; Canvas REST API does not provide credit hours).
   - $w_C$: Optional user priority weight (default 1.0).

6. **Allocation Algorithm: Greedy Marginal + 1-Opt Local Refinement**
   - Step size: 30-minute units ($\Delta h = 0.5$h) or 15-minute units ($\Delta h = 0.25$h).
   - "Protect Mastery" floor: If enabled, every upcoming assignment receives a baseline floor $\min(\text{floorHours}, \text{maxHours})$ before discretionary marginal allocation.
   - Deadlines: Assignments past their due date (`dueAt <= now`) cannot receive study hours ($\text{maxHours} = 0$).
   - 1-Opt Swaps: Local search transfers study units between pairs of assignments until no swap improves expected GPA.

7. **Robustness Rating (Pacing Perturbations)**
   - Optimization is re-run with $\tau$ scaled by $0.7$ (30% faster pace) and $1.3$ (30% slower pace).
   - **High Confidence**: Top priority assignments remain identical across both faster and slower learning paces.
   - **Medium Confidence**: Top recommendation is stable, but secondary allocations shift.
   - **Low Confidence**: Recommendation shifts significantly, indicating heavy dependence on study speed assumptions.

---

## 3. Rubric-Aware Feedback & Historical Mining Assumptions (Stage 7)

1. **Diagnostic Critique-Only Boundary (Rule 5 & Rule 12)**
   - OffCanvas never drafts, rewrites, or completes graded submission work for students.
   - Outputs are strictly restricted to:
     - The criterion's **readiness level** mapped directly to the official Canvas rubric rating descriptors.
     - **Verbatim quotes** extracted from the student's pasted draft to ground the evaluation.
     - Diagnostic **what would raise it** pointers indicating missing conceptual elements.
   - **Zero Predicted Numeric Grades**: To prevent deceptive precision or grade entitlement, pre-submit checks strictly omit predicted numeric points, percentages, or letter grades.

2. **Weakest-First Prioritization**
   - Criteria are always presented in ascending order of readiness level (lowest rank first).
   - This prioritizes critical gaps (e.g., missing proof base cases, omitted benchmark variance) before acknowledging satisfied criteria.

3. **Multi-Layered Rewrite Detection**
   - Any LLM or rule-based feedback output is evaluated by an automated rewrite detector before reaching the student:
     - **Directive Prohibitions**: Flags directives attempting ghostwriting (`"you should write"`, `"replace with"`, `"instead say"`, `"a better phrasing"`).
     - **Code Block Injection**: Prohibits emitting runnable code or function definitions for the student.
     - **Unverified Quotes**: Any quoted string in the feedback that does not appear verbatim in the student's draft is rejected.
     - **Long Span Overlap**: Lexical n-gram overlap checks ensure the feedback does not copy and modify student prose.

4. **Historical Weakness Mining Heuristics**
   - Recurring point losses are mined locally from the student's own historical rubric assessments (`rubric_assessment`) and instructor comments (`submission_comments`).
   - Criteria and comments are clustered into standardized academic domains:
     - *Algorithmic Complexity & Edge Cases*
     - *Mathematical Rigor & Proof Structure*
     - *Empirical Benchmarking & Performance Analysis*
     - *Code Quality, Modularity & Testing*
     - *Conceptual Clarity & Exposition*
   - Severity is attributed based on point loss percentage ($>20\%$ loss = High, $10-20\%$ = Medium, $<10\%$ = Low).
   - Historical patterns dynamically feed the Dashboard Radar and upcoming Assignment warnings.

---

## 4. Course-Grounded Retrieval & Vector Diagram Assumptions (Stage 8)

1. **Two-Tier Content Prioritization**
   - The student's own enrolled course materials (modules, wiki pages, lecture slides, assignment guides) always rank strictly above supplementary open resources ($1.2\times$ origin weight).
   - Allowlisted open educational resources (MIT OpenCourseWare, OpenStax, LibreTexts, Wikipedia) serve exclusively as secondary enrichment and carry mandatory license (e.g. `CC BY 4.0`, `CC BY-NC-SA 4.0`) and attribution metadata.

2. **Chunking & Precise Citation Grounding**
   - Ingested Canvas materials are chunked with full structural metadata: `courseId`, `moduleId`, `week` (e.g. "Week 1", "Week 5"), `itemType` (`page`, `slide`, `file`), `pageOrSlideNumber`, and Canvas URL.
   - Citations format consistently as `"Week X, slide Y"` or `"Week X, page Y"`, providing a direct clickable hyperlink back to the authenticated Canvas LMS page.

3. **Composite Scoring & Relevance Thresholding**
   - Composite scoring combines normalized token frequency ($45\%$) and domain concept matching ($55\%$), multiplied by course-target ($1.25\times$) and origin ($1.2\times$) boosts:
     $$\text{Score} = (0.45 \cdot \text{TF} + 0.55 \cdot \text{ConceptMatch}) \times \text{CourseBoost} \times \text{OriginBoost}$$
   - Relevance threshold: $\tau_{\text{min}} = 0.15$.
   - **Grounding Refusal Invariant**: If no chunks achieve the relevance threshold, OffCanvas explicitly states that no relevant materials were found instead of generating generic filler text.

4. **Ephemeral Memory & Storage Architecture**
   - Chunks and embeddings are stored in ephemeral, in-memory RAM caches (per-session backend memory) that are **never written to disk**.
   - In browser extension mode, offline search executes 100% locally via TypeScript in-memory evaluation and IndexedDB session cache.

5. **Diagram Generation (Pure Vector SVG)**
   - Concept relationships are generated using structured Mermaid flowchart definitions.
   - Diagrams are validated against syntax rules (balanced brackets, declarations, script injection guards) and converted directly into inline vector SVG elements.
   - **No Web Images**: SVG code is pure vector markup with zero remote `<img>` tags or CDN links. Raw Mermaid source code is inspectable on demand.

---

## 6. Socratic Hint Ladder & Answer-Leak Guard Assumptions (Stage 9)

1. **Scaffolded Cognitive Rung Invariant**
   - Rungs represent increasing levels of conceptual support:
     - **R0**: Task restatement and naming of core invariant concepts.
     - **R1**: Socratic nudging question drawing attention to boundary or minimum cases.
     - **R2**: Naming of formal mathematical/algorithmic technique or theorem.
     - **R3**: Complete worked example on an ISOMORPHIC VARIANT problem with changed constants and verified distinct answer.
     - **R4**: Check-My-Work reasoning critique evaluating the student's attempt without ghostwriting or rewriting.

2. **Mandatory Friction Gate Prior to Worked Examples**
   - Unlocking R3 or R4 requires active cognitive effort: the student must articulate what they have tried (minimum 15 characters, at least 4 unique non-whitespace characters).
   - This friction gate prevents passive answer consumption and promotes genuine cognitive engagement.

3. **SymPy Verification & Isomorphic Variant Guarantee**
   - For mathematical and symbolic problems, SymPy solves the original problem and the isomorphic variant.
   - If the variant answer is identical to the original answer ($|\Delta| \le 10^{-3}$ or string equality), variant generation is aborted.
   - All rung content is scanned for answer leaks using numeric tolerance and symbolic equivalence checks.

4. **Code Execution Sandbox Isolation**
   - For programming assignments, the variant problem and solution code are executed against a unit test suite inside an isolated Python subprocess (`subprocess.run` with a 2.0s timeout and captured stdout/stderr).
   - The "Verified" badge is applied *only* if the test suite actually executed and passed 100%.

5. **Honest Verification Badges & Humanistic Scope Limits**
   - Symbolic and code tasks display "SymPy Verified" or "Sandbox Executed".
   - Essay and qualitative tasks explicitly display "Heuristic / Rubric Structure Check (Weaker Scope)" to clearly inform the student that subjective writing is evaluated by rubric heuristics rather than automated mathematical proof.

6. **Adversarial Extraction Refusal**
   - Adversarial prompt injection attacks attempting to extract exact answers, bypass instructions, or demand answer keys are intercepted and refused with an academic integrity notice. No student prompt tokens or answers are reflected back.

---

## 7. Academic Study Scheduler & Change Radar Modeling Assumptions (Stage 10)

1. **30-Minute Discrete Grid Discretization**
   - The planning horizon (default 14 days) is partitioned into discrete 30-minute intervals indexed by $t \in \{0, 1, \dots, T-1\}$.
   - Study allocations are integers $s_{i, a} \in \{0, 1\}$ denoting whether assignment $a$ is studied during slot $t$.

2. **Hard Constraint Formulations**
   - **No Busy Overlaps**: $s_{t, a} \cdot \text{isBusy}(t) = 0$ for all assignments $a$ and busy slots $t$ (derived from student calendar / iCal feed).
   - **Sleep Window Protection**: $s_{t, a} = 0$ for all slots $t$ falling within the student's designated sleep window (default 23:00 to 07:00).
   - **Finish-Before-Deadline Buffer**: For assignment $a$ with deadline $T_{\text{due}, a}$, all study blocks must conclude at least $\text{bufferHours}$ (default 2.0h) before $T_{\text{due}, a}$.
   - **Daily Study Effort Cap**: Total allocated hours on calendar day $d$ cannot exceed $\text{dailyCapHours}$ (default 6.0h).
   - **Max Contiguous Block Length**: Consecutive study slots for the same assignment are bounded by $\text{maxBlockLengthHours}$ (default 2.0h) to preserve focus.

3. **Multi-Objective Optimization Hierarchy (OR-Tools CP-SAT)**
   - **Primary Objective (Lateness Minimization)**: Heavily penalizes placing study blocks close to or past assignment deadlines ($P_{\text{lateness}} = \sum_t \text{urgencyPenalty}(t)$).
   - **Secondary Objective (Daily Load Smoothing)**: Minimizes quadratic variance in daily allocated study hours across the planning horizon to prevent peak cramming days.
   - **Tertiary Objective (Preferred Hours Alignment)**: Soft bonus for allocating slots within student's self-selected high-focus study hours (e.g. 14:00 to 18:00).

4. **Rolling Replan & Stable UID Invariant**
   - When a student misses a scheduled block or logs study late, existing completed blocks are preserved in place.
   - Remaining unfulfilled study hours are rescheduled into future available slots.
   - Stable RFC 5545 UIDs (`bodha-{course_id}-{assignment_id}-b{blockIndex}@bodha.app`) are preserved with monotonically incremented `SEQUENCE` counters so calendar apps (Google Calendar, Apple Calendar) update existing events in-place without creating duplicates.

5. **Weekly Crunch Radar Risk Tiers**
   - Measures predicted total weekly study demand $L_w$ against total student study capacity $C_w$ ($C_w = 7 \times \text{dailyCapHours} - \text{busyHours}_w$):
     - **High Crunch Risk** ($\text{Load Ratio} > 0.85$): Pacing alert surfaced with recommendation to frontload work.
     - **Moderate Load** ($0.60 \le \text{Load Ratio} \le 0.85$): Typical academic workload.
     - **Balanced** ($\text{Load Ratio} < 0.60$): Ample capacity buffer for unexpected tasks.

6. **Change Radar Human Confirmation Invariant**
   - Date change patterns are parsed from course announcements and syllabus updates using regex patterns and informal date tokenizers.
   - Exact verbatim sentences and character start/end offsets are extracted as immutable audit evidence.
   - All detected changes initialize with `status: pending_confirmation`. The grade model and study schedule are updated **only** after the student explicitly clicks "Confirm & Replan".


