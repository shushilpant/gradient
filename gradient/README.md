# GRADIENT

An intelligent academic workspace inside Canvas: **Academics, AI Workspace, Automation, and Research** share the student's accessible coursework.

GRADIENT is a Chrome Manifest V3 extension with optional local services. It reads the existing signed-in Canvas session without API tokens. Live Canvas stays read-only; ordinary coursework and deterministic grade planning work without AI.

## Run the extension

```sh
npm ci
npm run typecheck
npm run build
```

In `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `dist`. Sign in to Canvas and refresh. Instructure domains connect automatically; grant other supported Canvas domains explicitly in extension settings. `npm run package` also produces `gradient-extension.zip`.

- **Academics:** synced coursework, rubrics, feedback, announcements and resources; search and status filters; Canvas weighted grades and drop rules; what-if scenarios; Grade Lab; study allocation; change tracking; calendar exports and reminders.
- **AI Workspace:** course and assignment assistance through installed Ollama models; three explanation depths; source excerpts and citations; optional public research; Homework Autopilot with final-assignment LaTeX output and `.tex` download; cancellation; HTML and Markdown exports for study packets.
- **Automation:** approved context staging to the existing isolated local Canvas replica, browser automation in the current local Canvas tab with a rust cursor, logs, artifacts and stop controls. **Demo automation** replays the seeded GRADIENT-SIGNALS assignment with a saved result and no model calls. No live assessment completion or submission.
- **Research:** editable interests derived from courses, syllabi and readable materials; coursework evidence; demonstrated and inferred skill distinctions; explainable REU ranking; programme-source excerpts and links. A match does not establish current availability or eligibility.

Study Studio, audio, Photo Check, QR sharing, focus timers and command-centre utilities are isolated from the primary interface. Their implementations remain available for maintenance.

**Automation** has a **Demo Automation** button with a saved presentation example. It uses synthetic data and works without AI or public search; **Back to my workspace** returns to live coursework.

## Optional local AI

Install Python 3.11 or 3.12 and Ollama, then run from this directory:

```sh
make install
make assistant
```

Homework Autopilot requires Pandoc on the backend PATH (`brew install pandoc` on macOS). Download any accompanying figures into the same folder as the `.tex` file before compiling.

Choose an installed completion model in **AI Workspace → Models**. Browser automation also needs a vision model and the separately configured local Canvas replica. See [local AI setup](docs/LOCAL_AI.md) and [local Canvas setup](docs/LOCAL_CANVAS.md). Selected course content goes to the loopback backend and local Ollama. Public research sends editable search keywords to external search services only when enabled.

## Synthetic demonstration

```sh
make demo-replay
```

Open [the synthetic preview](http://127.0.0.1:8085/courses/99001). It contains three courses, posted grades, explicit homework briefs and overlapping deadlines relative to the demo day. It needs no backend for grades, planning or calendar exports. Model generation and browser runs require their actual services; completed runs are never simulated.

Use `make demo-live` to start the same synthetic preview with the local backend. “Live” here means an actual optional service, never a real student account. The preview and the separate Canvas OSS replica are clearly distinguished. [Demo runbook and fallback](docs/DEMO.md) · [Architecture, inventory and 150-second pitch](docs/HACKATHON.md)

## Validate

```sh
npm run typecheck
npm run build
npm test
backend/.venv/bin/pytest backend -q
```

No separate lint command is configured. Browser tests use controlled synthetic Canvas responses. See [validation notes](docs/VALIDATION.md) for recorded results and limitations; these checks do not authenticate to an institutional account.
