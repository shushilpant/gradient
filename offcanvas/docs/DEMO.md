# Hackathon demo runbook

All commands below run from `offcanvas/`. The presentation uses **synthetic student data**. The presentation automation plays a fixed Canvas sequence and shows a clearly labeled saved assignment. Live model runs are a separate option.

## Presentation demos and the guided tour

Every module has a **Demo** button under the tabs. Each one plays a staged run on the sample courses and then shows a real result:

- **Academics** rebuilds the grades, ranks the top three priorities and plans up to eight hours based on assignment type, deadline and grade impact.
- **AI Workspace** builds a saved **CE 240 · Homework 2 - Trapezoidal Piecewise-Linear Waveforms** study packet with **Study** mode and **Go all in** selected. Both **Demo AI Workspace** and **Play full tour** show **Build my study packet**, an illustrative trapezoidal waveform with labeled breakpoints and slopes, piecewise and ramp-function explanations, and practice checks.
- **Automation** loads the saved workflow sequence, assignment and computed plot.
- **Research** reads interests from the coursework and lists real programmes, each linking to its website. The match scores are illustrative and labelled as such.

**Play full tour** in the panel, or **Play the one-minute tour** on the preview page, plays all four in order. Each result stays on screen for about four and a half seconds, and the whole tour takes about a minute. Clicking any tab or **Stop tour** hands control back. The **Watch it** buttons on the preview page start a single module.

Demos make no network requests. **Run saved Canvas demo** still performs the same-tab replay when the seeded local course is available, with the highlighted cursor and a 10-second final pause. **Back to my workspace** restores the live module.

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

The three new assignment briefs, rubrics and graph notes have actual readable local URLs. Existing posted grades use the same deterministic grade engine as the extension. No coursework comes from a university account. The preview bundle is excluded from the install archive. The explicitly selected presentation demos ship their synthetic examples with the extension.

1. In **Academics → Overview**, point to the priority briefing. Open **Panic button** and choose **30 min** for a short block on Graph traversal planning. Switch to **2 hrs** to see a 90-minute first block. Open the assignment and expand **Marking criteria and feedback** to show the personal rubric checklist.
2. Click **Grade target** from the assignment and choose **B+**. Graph traversal needs 82% to reach that target on the current grade using the demo's default scale. Build the eight-hour study plan to show two hours for each homework and a 30-minute starter for the undated final. The remaining 3.5 hours stay free. Use **Add first study block to calendar** to download a timed `.ics` event.
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

Before presenting, reload the rebuilt extension, open the signed-in local Canvas dashboard and let the initial coursework sync finish. In **Automation**, select **Demo automation** directly below **Start automatic workflow**. **Present → Demo Automation** launches the same replay. It uses the seeded **OFFCANVAS-SIGNALS** time-shift homework and also recognizes the **GRADIENT-SIGNALS** and **BODHA-SIGNALS** course codes from earlier seeds.

Watch the highlighted cursor open the course, click **Assignments**, open the homework, and scroll its instructions in the same Canvas tab. When launched from **Demo automation** below the live workflow, the replay pauses 2.5 seconds before each click and scroll, then shows a ten-second preparation step before revealing the saved solution and graph. **Present → Demo Automation** reveals them as soon as the cursor and scroll animation finishes. The replay requires the seeded local Canvas course and runs independently of the assistant backend and model. **Stop run** cancels playback. The saved sequence and result are bundled from [`backend/demo_automation.json`](../backend/demo_automation.json).

In **Academics → Overview → Panic button**, choose **Automate assignment** to review the top eligible homework in Automation. In the signed-in local replica, approve the read-only workflow and select **Start automatic workflow**. From your institution’s Canvas tab, stage and import the local copy first, then select the assignment in the replica.

**Demo panic automation** is available in Panic mode and under **Present → Demo Academics**. Open the signed-in local Canvas replica with the imported **CE 240 H001** course first. The demo selects **Homework 1 - Amplitude Spectrum Derivation**, clicks the main Canvas course and assignment links, and scrolls the instructions before showing the saved derivation and spectrum graph. If the course is unavailable, the button shows setup guidance. The graph labels its illustrative duty cycle because numeric signal parameters were absent from the available notes.

The dedicated **Automation → Demo automation** runs the separate OFFCANVAS-SIGNALS time-shift example. Starting it clears any previous Panic answer immediately, including when the local demo setup is unavailable.

For a live run, inspect the configured origin and its synthetic/replica identity, select reasoning and vision models, configure a read-only homework-reference task, approve the run, and select **Start automatic workflow**. The workflow uses the current signed-in local Canvas tab. It follows observed same-origin coursework links and stops on unsupported assessment pages. Inspect its result and stop controls. No assignment submission, quiz completion or live account control is permitted. For staged coursework, review the snapshot before importing it into the synthetic tenant with the existing import command; never describe copied local data as a live integration write.

The synthetic preview cannot stage itself through the live HTTPS Canvas mirror endpoint. That boundary is retained. Use the separately seeded replica for the synthetic automation demonstration; approved live coursework staging remains a separate explicit workflow.

The optional `sandbox.rehearsal` service on 8086 remains a **synthetic rehearsal fixture**, not the Canvas application. Only enable it explicitly through `OFFCANVAS_SANDBOX_ORIGINS=http://127.0.0.1:8086`. Its identity is shown before a run. It is useful for controlled browser tests; it is not proof of institutional Canvas parity.

## Honest fallback

| Unavailable capability | Presentation fallback |
| --- | --- |
| Ollama or completion model | Continue with source instructions, rubric, deterministic what-if grades, allocation, calendar export and coursework-derived Research interests. Show the actual connection error; do not display an invented answer. |
| Slow generation | Start before the pitch, then show the actual in-progress state or cancel. A previously exported packet may be shown only as a clearly labeled earlier local run with synthetic context. |
| Vision model | Use **Demo automation** with the seeded local Canvas replica. The demo needs the signed-in local Canvas tab and runs without inference. |
| Browser service or Canvas replica | Show Automation's actual availability state. The saved assignment can be shown separately as a prepared artifact. |
| Public search or programme page | Show editable interests and course evidence. Open the NSF directory link if accessible. Missing deadlines, funding or eligibility remain unknown. |
| All optional services | The complete Academics demo and local interest extraction still run. Explicitly identify AI and browser execution as unavailable. |

Stop the preview with Ctrl+C. The launcher stops a backend it started itself; an already running backend is left running. `setup.py down` stops the local Canvas Compose project without deleting volumes.

## 150-second sequence

| Time | Screen and message |
| --- | --- |
| 0–15 s | **Preview page hero:** “Students already have everything in Canvas, but grades, deadlines, rules and opportunities are scattered. OffCanvas pulls them into one panel.” |
| 15–40 s | **Academics overview:** show Alex's priority briefing. In **Panic button**, switch from **30 min** to **2 hrs** to show how available time changes the first block. |
| 40–95 s | **Coursework:** open Graph traversal planning, check a rubric item, then select **B+** in the assignment grade calculator. Show the syllabus AI rule or open the assignment's source context if time permits. |
| 95–125 s | **See it refuse a quiz:** open the assessment page. “On quizzes and timed exams, OffCanvas stays off. It never submits anything.” |
| 125–150 s | **How it works:** “Canvas session in, local AI on your laptop, nothing leaves the machine by default. Install it with Load unpacked today.” If time allows, show a real Autopilot run with Ollama. |
