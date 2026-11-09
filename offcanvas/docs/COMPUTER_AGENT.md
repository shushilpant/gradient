# Sandboxed browser agent

OffCanvas Auto mode now uses a **local browser computer-use loop**. It is a small
OffCanvas implementation built on Playwright, not a bundled or renamed Agent S
installation and not a claim to outperform Agent S on general desktop tasks.

The [Agent S framework](https://github.com/simular-ai/Agent-S) provides broader
desktop computer use, while [Browser Use](https://github.com/browser-use/browser-use)
is a browser-agent framework. For this Canvas-only workflow, a constrained
Playwright harness lets the installed reasoning and vision models operate an
isolated browser without desktop access, arbitrary model-written code, cloud
model requirements or reuse of the student's production account profile.

## What actually happens

1. Open a new incognito Chrome context at the configured local Canvas origin.
2. Capture a real screenshot and fixed page-text/link observations. The local
   vision model describes the screenshot; the local reasoning model selects an
   observed link ID or a bounded scroll/read action.
3. Execute that browser action and observe the resulting page again. Continue
   until the requested homework is located, access fails or the step limit is hit.
4. Read the actual Canvas assignment API response using only the isolated local
   session. Read linked course pages and supported local PDF/DOCX/text files.
5. Run the existing homework-autopilot parse/research/draft/render/review pipeline.
6. Save labeled reference artifacts under ignored
   `offcanvas/.runtime/computer-agent/<session-id>/`. HTML, Markdown, JSON and PNG
   figures are available from the session's artifact links.

The trace records real actions and screenshots. A model's `finish` response is
rejected if no reference sample was generated. The agent never submits homework,
changes grades, starts quizzes, edits course records, or acts outside its selected
sandbox origin. HTML export escapes model text and does not execute scripts.

## Local origin and login

`OFFCANVAS_SANDBOX_ORIGIN` defaults to `http://127.0.0.1:8080` (the real Canvas OSS
deployment). Additional origins are disabled by default. For explicit rehearsal
testing, set `OFFCANVAS_SANDBOX_ORIGINS=http://127.0.0.1:8086`; this enables the
clearly labeled synthetic fixture. Origins must be loopback
HTTP origins on explicit ports, excluding the model/backend ports. A rehearsal
fixture is not a one-to-one Canvas replica. The config endpoint reports which
configured origin is verified and reachable; actual Canvas is preferred when
both are ready. Availability requires the sandbox identity marker and, for
Canvas OSS, its login page. An unrelated localhost service is never treated as
Canvas. If only the rehearsal fixture is available, the config message explicitly
identifies it as synthetic and not a Canvas replica before a run.

The actual Canvas sandbox can use the generated local student credentials in
`sandbox/canvas_local/.runtime/credentials.json`. Only its exact
`http://127.0.0.1:8080/login/canvas` form POST is temporarily permitted during the
fixed seeded-login step. The model cannot choose credentials or request a login
POST. Production browser cookies, passwords and profiles are never copied.

Install backend dependencies and keep Chrome installed. The agent uses
`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` by default;
`OFFCANVAS_AGENT_BROWSER` may name another existing Chrome/Chromium executable.
No Playwright browser download is required when that Chrome binary exists.

## Isolation and limits

- The browser network only allows GET/HEAD to the selected sandbox origin.
  Cross-origin pages, redirects and assets are blocked. The single seeded-login
  exception is fixed to the local Canvas login endpoint.
- Model actions contain IDs of already observed read-only coursework links,
  never arbitrary selectors, JavaScript, Python, shell, file paths or URLs.
- Assessment, submission, logout, edit, external-tool and destructive paths are
  rejected before navigation, including percent-encoded variants.
- Canvas file downloads stay on the selected local origin with redirects off.
  Canvas's `download`, `download_frd` and `verifier` query keys are accepted only
  on file routes. The file reader uses the existing 12 MB extraction bounds and
  local parser. Unread required attachments stop the run; unread optional linked
  attachments are disclosed in the packet warnings.
- Public research is separate from browser control and uses the existing bounded
  backend research provider/fallback. A search provider may still be unavailable.
- One Auto session runs at a time. Sessions retain at most six screenshots and
  at most eight in-memory session records. Outputs remain local until deleted.
- Stop requests prevent the next browser action; an in-flight local inference
  finishes before the worker observes cancellation. The UI reports this wait.
- This is browser isolation and origin confinement, not a VM or a claim that
  arbitrary hostile software can safely run on the host. The model runs through
  Ollama; the browser context has no production login state or desktop permissions.

## API

All routes start with `/api/v1/computer` and share the assistant's local-origin
checks. Mutations require `X-OffCanvas-Client: offcanvas-extension`.

- `GET /config`: configured/reachable sandbox origin, isolation, engine and
  browser availability.
- `POST /sessions`: `{origin,goal,reasoningModel,visionModel,maxSteps?}` starts
  asynchronously and returns the full session state.
- `GET /sessions/{id}`: real stage, step trace, screenshots, generated packet,
  artifact links or actionable error.
- `POST /sessions/{id}/cancel`: request a stop; remains running with stage
  `cancelling` until the worker actually stops.
- `GET /sessions/{id}/artifacts/{name}`: one allowlisted generated local file.

Tests cover origin/path restrictions, cancellation semantics, bounded screenshots,
artifact escaping, startup validation and an actual isolated Chrome navigation
flow with controlled models. A live run with installed Gemma4:e4b and gpt-oss:20b
observed three rehearsal pages, navigated to the requested homework, read its
brief and guide, and exported a sample plus a Python-computed figure. The figure
was zero before t=2 and peaked at t=3 with value 1/e, matching the source function.
Its optional revision hit the response limit; the original draft, figure and
partial-coverage review were preserved with a warning. This demonstrates this
specific rehearsal workflow, not universal task completion or verified course
quality. A separate controlled-model browser check against the actual Canvas OSS
deployment verified the generated student's login, asynchronous dashboard and
assignment-list loading, observed-link navigation, assignment API reading and
export path. It caught and fixed Canvas's assignment-index query filters and
loading-state timing; it does not establish local-model quality for every course.
