# OffCanvas consolidation

The product is an academic workspace with four primary sections: **Academics, AI Workspace, Automation, Research**. It keeps the existing Preact, Shadow DOM, Chrome MV3 and loopback-service architecture.

## Repository audit and reuse

| Area | Existing implementation reused | Consolidation |
| --- | --- | --- |
| Canvas access | `canvasFetch`, `canvasClient`, `liveCanvas`, `CanvasAdapter`, existing-session GET/HEAD APIs | Shared snapshot remains the authority; no API tokens or live writes added. |
| Grades | `core/gradeModel`, optimiser/GPA simulator, `GradeLab` | Kept deterministic Canvas weighting, posting and drop rules; effort scenarios retain explicit assumptions and uncertainty. |
| Sources | `canvasMaterials`, local PDF/DOCX/text extraction, source citation components | Permission-checked material cache reused across AI and Research through academic context. |
| AI | Existing assistant client/transport, installed Ollama model discovery, `local_assistant`, Homework Autopilot | Consolidated in AI Workspace with course/assignment focus and reference-material labeling. |
| Automation | `WorkflowMode`, `computer_agent`, `sandbox_mirror`, Canvas OSS setup | Dedicated control surface; existing approval, origin, assessment, logs, screenshot and stop safeguards retained. |
| Research | Existing REU frontend/profile and backend search, Google/university/NSF mechanisms | Course/syllabus/resource evidence, skill distinctions and explainable overlap added without inventing programme facts. |
| Storage | Existing extension options, account-scoped command/deadline state and browser storage | Academic preferences and active context are scoped by origin plus user; legacy unscoped settings remain for explicit import. |
| Legacy tools | Study Studio, Photo Check, command centre, audio, QR and focus tools | Retained behind the legacy boundary, removed from primary product navigation and active entry imports where safe. |
| Demo | Existing fixture adapter, preview launcher and local Canvas environment | Explicit synthetic homework, rubrics and overlapping deadlines; no synthetic results substitute for actual inference or browser execution. |

## Architectural changes and decisions

`Workspace.tsx` owns the four-section shell. Academics contains Overview, Coursework and Grade Lab. Assignment actions retain their selected course and assignment when moving into AI Workspace. Context staging and browser controls are together in Automation. Research receives the same active coursework context.

`academicContext.ts` builds structured course, assignment, syllabus, rubric and resource evidence once for a snapshot, maintains a permission-scoped material cache, and invalidates the active context at account/refresh boundaries. Late requests cannot install text into a different account's context. Research exposure is distinguished from demonstrated coursework evidence; neither implies independent proficiency or admission eligibility.

`academicPreferences.ts` scopes saved course credits and GPA configuration by origin and user. Grade Lab and study planning still use those account-specific settings. The live extension does not silently replace failed Canvas syncs with sample data. Refresh invalidates transient source text and generated views, cancels scoped work, and clears course-specific inputs; export reference materials before refreshing. Saved configuration and account records are preserved.

`ChangeRadar.tsx` reuses existing account-scoped baseline comparison for deadline, instruction and rubric changes without mounting the old command-centre interface. Live Canvas access and grade arithmetic do not require an LLM. Reminder preferences remain saved per account, but notification delivery is bound to the most recently synced student at each Canvas origin; inactive students’ alarms and displayed notifications are cleared. Older saved reminders require a successful account sync before resuming after the migration.

The isolated legacy UI remains in `LegacyWorkspace.tsx` for historical feature maintenance and regression coverage. Primary runtime imports determine what ships in the active experience. Shared functions used by retained features are preserved. No new UI framework, computer-use framework, or dependency was introduced. The legacy regression entry builds outside `dist`, so neither legacy UI nor the synthetic preview is included in the install archive.

The demo uses `hackathon_scenario.json` and `demoScenario.ts` only through the localhost preview entry. Three explicit homework briefs and rubrics are added to copied fixtures, leaving the original recorded data intact. The server serves the same brief/material content and demo day. The preview is not the separate Canvas OSS replica and does not claim successful execution of an optional service. The original HTTPS mirror-origin guard remains intact; use the separate seeded replica for synthetic automation.

## Features

**Retained:** session Canvas sync; courses, assignments, submissions, grades, rubrics, feedback, syllabi, announcements and accessible resources; search/status filters; deterministic grade calculations; what-if/Grade Lab/GPA scenarios; study allocation; calendar exports/reminders; change detection; Ollama discovery and local selection; three explanation depths; source-grounded retrieval and excerpts; optional research; Autopilot requirement extraction, reference generation, coverage review and one revision; progress/cancel/error recovery; HTML/Markdown exports; existing local browser automation; REU search fallbacks.

**Hidden from the primary interface:** Study Studio, flashcards/quizzes/maps/spaced review, audio/narration, Photo Check, QR sharing, standalone timers and duplicate command-centre paths. Their code is retained where safe, with legacy regression coverage separate from the active shell.

**Modified:** navigation, shared source context, account preference isolation, research evidence/ranking, coursework-to-AI handoff, focused Automation controls, change-radar placement, synthetic scenario and documentation.

## Major changed files

- Shell and academic flows: `extension/ui/Workspace.tsx`, styles, `CanvasApp.tsx`, `GradeLab.tsx`, `ChangeRadar.tsx`, `academicPreferences.ts`.
- Shared context and Research: `extension/academicContext.ts`, `reuProfile.ts`, `ui/ReuFinder.tsx`, `assistantClient.ts`, and backend `reu_finder.py` with its source-evidence tests.
- Reliability: `liveCanvas.ts` final identity recheck, `deadlineCalendar.ts` active-account notification binding, `homeworkAutopilot.ts` and backend assessment guards, `AssistantView.tsx` stale inspection/export handling, `WorkflowMode.tsx`, `CanvasMirror.tsx`, computer client and sandbox capture support, with targeted tests.
- Legacy boundary/build: `LegacyWorkspace.tsx`, build/test entry configuration and legacy browser harness.
- Demo: `sandbox/fixtures/hackathon_scenario.json`, `extension/demoScenario.ts`, `previewContent.tsx`, `scripts/demo_runner.py`, demo unit/browser/server tests.
- Documentation: both READMEs, this file, `DEMO.md`, and `VALIDATION.md`.

The repository already contained substantial uncommitted engineering work before consolidation. The source diff includes that earlier work; this inventory describes the consolidation surface rather than claiming authorship of every changed line.

## Validation and limits

Run `npm run typecheck`, `npm run build`, `npm test` and `backend/.venv/bin/pytest backend -q` from `bodha/`. No standalone lint script is configured. [VALIDATION.md](VALIDATION.md) records actual executed checks; never infer a successful live account or model run from a mocked browser test.

Final verification passed 390 frontend/unit/property/browser tests across 47 files, 256 backend tests, typechecking, build, packaging and archive inspection. A separate actual localhost preview smoke passed without network mocks. These checks establish fixture coherence, account isolation and controlled browser behavior; they do not establish real-model output quality or institutional Canvas parity. Full commands and limits are recorded in VALIDATION.md.

Optional model quality and latency vary with installed models and hardware. Browser automation needs the separately prepared local Canvas replica, a compatible browser and reasoning/vision models. Source extraction remains limited to supported, accessible files and configured size bounds. Research page access may fail or expose stale programme cycles; missing facts remain unknown, and overlap is not an admissions prediction. The synthetic preview cannot establish institutional SSO/LTI/theme parity. Study-hour ranges are model assumptions, not predicted grades.

See [DEMO.md](DEMO.md) for extension/service commands, the reproducible synthetic scenario, separate Canvas replica setup, unavailable-service fallback and the 150-second presentation sequence.
