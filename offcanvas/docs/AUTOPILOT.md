# Homework autopilot

Autopilot creates a complete **reference sample** from the selected homework's
readable instructions, rubric, available Canvas material and public research.
It does not submit anything to Canvas or certify a sample as perfect.

## Actual pipeline stages

1. **Parse.** Extract questions, deliverables, calculation/format constraints and
   rubric criteria. Each requirement includes an exact excerpt from instructions.
   Ungrounded requirements are discarded; overlooked numbered items are preserved.
2. **Research.** Read course material and public sources. IDs, URLs and excerpts
   are retained. Inaccessible pages and snippet-only evidence are disclosed.
3. **Draft.** Generate a complete sample with working, units, citations,
   assumptions and AI-assistance disclosure. Autopilot uses the detailed budget.
4. **Render.** Trusted Python computes source-grounded figures before review,
   so the review can assess an actual accompanying plot rather than a promise.
5. **Review.** Assess each requirement as covered, partial or missing. Covered
   requires an exact sample excerpt. Unsupported evidence is downgraded and
   omitted requirements are marked missing.
6. **Revise once.** Revise gaps and review again. Remaining gaps stay visible.
   Revised figures are rendered before the second review. Python never runs
   model-written programs.

Job stages represent actual work. Errors are returned to the caller. Model
reviews can still be wrong; they do not independently prove mathematical
correctness or establish that every instruction was understood.

## Homework only

The request must explicitly set `autopilot: true` and `assignmentKind: "homework"`.
Quizzes, exams, tests, assessment routes, timed/proctored instructions, Canvas
`online_quiz` types and missing instructions are rejected before inference or
public research. Other study modes remain available separately.

## Grounded Python figures

New packets empty the legacy model-invented `diagrams` and `graphs` arrays.
Models can propose `visualSpecs` with exact `quote` and `sourceId`. The renderer
checks these against actual supplied documents and returns PNGs with provenance
or explicit omission warnings. Function plots evaluate supported expressions
from explicit source equations; numeric plots require the `(x,y)` data pairs in
the source. Supported derivative and rational inverse-Laplace plots use trusted SymPy
operations after exact source-formula checks. Concept diagrams need supported
source labels and explicit relations. A
conceptual arrow is not mathematical verification. Missing evidence does not
produce an invented substitute. Public images retain source and license caveats.

Plots use bounded expression parsing and library operations; the renderer never
executes model output as Python, shell commands, imports or arbitrary code. The
frontend can embed PNG base64 figures in the app and HTML exports.

## API

Existing `generate` requests add `autopilot` (boolean), `assignmentKind`
(`homework` or `other`) and optional `assignment.submissionTypes` (string array).
`GET /api/v1/assistant/jobs/{id}` adds `stage` and `label`, with stages `queued`,
`parsing`, `researching`, `drafting`, `reviewing`, `revising`, `rendering`,
`complete` or `error`. Final packets add:

- `brief`: summary, requirements `{id,text,evidence}`, and missingInformation.
- `review`: coverage `{requirementId,status,evidence,notes}` and limitations.
- `renderedVisuals`: PNG data, caption, source quote, and verification type.
- `autopilot`: whether the multi-stage homework pipeline was used.

Instruction evidence and sample-review evidence are checked as exact substrings.
This establishes where a requirement and its claimed answer came from; it does
not turn the local model into a formal mathematical proof checker.

A separate `research` job accepts the same study context and returns `{query,warning}`. It infers broad public academic topic phrases locally for generic homework titles before browser search. Returned browser sources bypass duplicate topic inference in the generation job.
