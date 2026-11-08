# Hackathon demo runbook

All commands below run from `gradient/`. The presentation uses **synthetic student data**. Model responses and browser traces are shown only when their real local services have run.

## Reliable core preview

```sh
npm ci
npm run typecheck
npm run build
python3 scripts/demo_runner.py --mode replay --open-browser
```

Open [http://127.0.0.1:8085/courses/99001](http://127.0.0.1:8085/courses/99001). If the port is busy, the script reports its actual fallback port. `make demo-replay` runs the build and starts the same preview.

The preview is localhost-only and says **Synthetic demo**. Alex has algorithms, discrete mathematics and molecular biology courses. The scenario adds Graph traversal planning, Probability study outline and Enzyme experiment tasks. The first two are due one day after the server's selected UTC demo day at 23:59 UTC; the third is due two days later at 23:59 UTC. The original historical fixtures remain intact. Refresh reconstructs the same scenario for that server day.

To freeze fixture dates, pass `--date 2026-11-09`. This embeds that day into the page and produces identical deadlines in the preview and served brief APIs. It freezes synthetic data, not the browser's wall clock or timezone. Use today's default for a presentation so due labels and study eligibility reflect the current clock. Dates render in the user's timezone; UTC 23:59 is 17:59 Chicago standard time. Browser tests can additionally fix their clock.

The three new assignment briefs, rubrics and graph notes have actual readable local URLs. Existing posted grades use the same deterministic grade engine as the extension. No coursework comes from a university account. The preview bundle and its sample corpus are excluded from the install archive.

1. In **Academics → Overview**, show three courses and overlapping tasks. Open **Coursework**, choose CS-101, inspect Graph traversal planning and its rubric.
2. Move a what-if score, enter available study hours and build an allocation. Explain that weighted grades and drop rules are deterministic; study-hour/GPA ranges depend on explicit learning assumptions. Download deadlines as `.ics`.
3. Open **Grade Lab** to compare an effort scenario and inspect counted/dropped work. Do not call the modeled interval a guaranteed grade prediction.
4. Use the assignment's AI action to carry its course and rubric into **AI Workspace**. Show the requirements/source context even if generation is unavailable.
5. In **Research**, inspect coursework-derived interests, evidence and editable topics. Read available course materials to enrich the shared context, then search if network and the local service are ready. Results are programme-page evidence, never assumed-open applications.

## Actual local model run

Install backend dependencies and start Ollama beforehand:

```sh
make install
make assistant
```

In another terminal start `python3 scripts/demo_runner.py --mode replay`; or use `make demo-live` to start the backend with the preview. Both modes use synthetic coursework. In **AI Workspace → Models**, refresh installed-model discovery and select a usable completion model. Disable public research for an offline source-grounded example.

Select **Homework: Graph traversal planning**, choose **Homework Autopilot**, inspect its readable instructions and rubric, and start. The synthetic brief permits labeled learning examples on a different graph; final work stays student-authored. Watch the real parse/research/draft/review/revision stages, open a source excerpt, inspect unresolved coverage gaps, and export HTML or Markdown. The MATH syllabus intentionally retains its restriction on AI-written proof submissions; do not use that course to demonstrate permitted generation. Do not promise a fixed generation time: model size, hardware and context change latency.

## Existing local Canvas browser workflow

The preview at 8085 is **not** the actual Canvas replica. The official Canvas OSS development application runs separately on loopback 8080 with its own synthetic student and credentials. It must be built before the presentation; first setup is substantial.

```sh
python3 sandbox/canvas_local/setup.py checkout
python3 sandbox/canvas_local/setup.py configure
python3 sandbox/canvas_local/setup.py build
python3 sandbox/canvas_local/setup.py initialize
python3 sandbox/canvas_local/setup.py seed
python3 sandbox/canvas_local/setup.py up
python3 sandbox/canvas_local/setup.py status
```

Use [the Canvas replica](http://127.0.0.1:8080/login/canvas) and the local student credentials from `sandbox/canvas_local/.runtime/credentials.json`; do not print or place them in pitch slides. The seed provides actual synthetic homework and its guide. Full details and staging/import instructions are in [LOCAL_CANVAS.md](LOCAL_CANVAS.md).

In **Automation**, inspect the configured origin and its synthetic/replica identity, select reasoning and vision models, configure a read-only homework-reference task, approve the run, and start. The browser uses a fresh isolated context, reads observed local links, and records actual screenshots and logs. Inspect its generated artifact and stop controls. No assignment submission, quiz completion or live account control is permitted. For staged coursework, review the snapshot before importing it into the synthetic tenant with the existing import command; never describe copied local data as a live integration write.

The synthetic preview cannot stage itself through the live HTTPS Canvas mirror endpoint. That boundary is retained. Use the separately seeded replica for the synthetic automation demonstration; approved live coursework staging remains a separate explicit workflow.

The optional `sandbox.rehearsal` service on 8086 remains a **synthetic rehearsal fixture**, not the Canvas application. Only enable it explicitly through `GRADIENT_SANDBOX_ORIGINS=http://127.0.0.1:8086`. Its identity is shown before a run. It is useful for controlled browser tests; it is not proof of institutional Canvas parity.

## Honest fallback

| Unavailable capability | Presentation fallback |
| --- | --- |
| Ollama or completion model | Continue with source instructions, rubric, deterministic what-if grades, allocation, calendar export and coursework-derived Research interests. Show the actual connection error; do not display an invented answer. |
| Slow generation | Start before the pitch, then show the actual in-progress state or cancel. A previously exported packet may be shown only as a clearly labeled earlier local run with synthetic context. |
| Browser service, vision model or Canvas replica | Show Automation's actual availability state and configured boundary. Explain the permitted workflow using the runbook. A saved screenshot/log is a prior run only; never label it current execution. |
| Public search or programme page | Show editable interests and course evidence. Open the NSF directory link if accessible. Missing deadlines, funding or eligibility remain unknown. |
| All optional services | The complete Academics demo and local interest extraction still run. Explicitly identify AI and browser execution as unavailable. |

Stop the preview with Ctrl+C. The launcher stops a backend it started itself; an already running backend is left running. `setup.py down` stops the local Canvas Compose project without deleting volumes.

## 150-second sequence

| Time | Screen and message |
| --- | --- |
| 0–15 s | **Academics overview:** “GRADIENT turns the Canvas context students already have into academic action. This is a synthetic student.” Show the three courses and overlapping deadlines. |
| 15–45 s | **Coursework / Grade Lab:** inspect the homework rubric, move a what-if value and show allocation. “Grade rules are deterministic; study-hour scenarios disclose their assumptions.” |
| 45–85 s | **AI Workspace:** show a real completed or in-progress Autopilot run, requirements, one source excerpt, and coverage gaps. “Reference material supports learning; the student authors the submission.” |
| 85–110 s | **Automation:** show a real local replica run with screenshot and log evidence, or clearly name its unavailable state. “Permission is bounded to the synthetic replica, with review and stop controls.” |
| 110–140 s | **Research:** show course-derived interests, one ranked sourced opportunity and its course/skill evidence. “The same syllabus context helps students discover a research direction. Deadlines and eligibility come from source pages.” |
| 140–150 s | Return to the four-section navigation. “One academic context: understand the work, plan the effort, inspect automation, and discover what comes next.” |
