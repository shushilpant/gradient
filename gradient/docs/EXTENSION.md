# Run GRADIENT inside Canvas

GRADIENT is a Chrome/Edge Manifest V3 extension. It uses your existing Canvas login in the same tab. You do not need an API token, local server, or backend for coursework, grade planning, resources, and calendar exports.

## Install the development build

1. From the project root, run `make build`. For a portable ZIP, run `cd gradient && npm run package`, then extract `gradient-extension.zip`.
2. In Chrome open `chrome://extensions` (Edge: `edge://extensions`).
3. Enable **Developer mode**, click **Load unpacked**, and choose the `gradient/dist` folder in this project.
4. Open your actual Canvas site, sign in, and refresh the page. USM's Canvas is `https://usm.instructure.com`.
5. GRADIENT opens on the Canvas dashboard and supported course pages. Collapse it to the launcher or expand it for more room. The extension toolbar icon also toggles visibility.

After source changes, run `make build`, click **Reload** on GRADIENT's extension card, and refresh Canvas.

## What is live

- Student courses and Canvas's own grade totals.
- Assignment groups, drop rules, due dates, your own submissions, rubric data, and instructor comments where accessible.
- Course syllabus, modules, pages, files, announcements, and calendar events where allowed by Canvas.
- Local what-if grade calculations, effort planning using configurable credit hours, and downloadable assignment deadline calendars.
- Optional local AI Assistant: installed-model discovery, Canvas PDF/DOCX/page reading, source-based public web research, three explanation depths, illustrated guides and clearly labeled sample assignment exports. Start it with `make assistant`; see [LOCAL_AI.md](LOCAL_AI.md).
- Opt-in deadline tracking in Settings: Chrome reminders at 24 hours and 1 hour before due dates, Google event links, and Apple/Google `.ics` imports. See [CALENDAR.md](CALENDAR.md).

Requests use the signed-in tab's session, stay on that Canvas origin, and only use GET. Raw course content and credentials are not sent to an external AI service. Course contents stay in tab memory and are fetched afresh on refresh. When requested, selected coursework is sent to the loopback AI backend and local Ollama; public research sends assignment-title or locally inferred topic searches to the web. Completed AI jobs expire from backend memory after 30 minutes. Preferences and enabled reminder metadata are saved in local extension storage. Instructor restrictions are shown as unavailable sections, never substituted with invented course data. TA/teacher-only enrollments are excluded from the student workspace.

Supported automatic hosts are `*.instructure.com` and `canvas.usm.edu`. For another school domain, open the extension settings, add its hostname under **Canvas sites**, and save. Chrome asks for access to that exact HTTPS site. Refresh its Canvas tab after granting access. Removing the hostname stops future injection on that site. Optional host access uses Chrome’s [runtime permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions) and [registered content scripts](https://developer.chrome.com/docs/extensions/reference/api/scripting).

The extension pauses on quiz-taking pages and active assessments. It does not submit work, change grades, send messages, or modify Canvas records.

## Preview and checks

`make demo-replay` opens an explicitly labeled **Demo preview** on localhost. The preview uses synthetic courses; it is a separate entry point, and the installed extension never loads those fixtures.

`make build test` runs type checks, bundles the extension, and runs TypeScript/browser and Python checks. Browser tests intercept Canvas API routes with controlled responses to verify the same-tab session integration and error behavior without requiring your account.

## When Pages or Files is hidden

A course's Pages/Files index can return 403 or 404 while files and pages linked in modules or coursework remain available. GRADIENT builds one deduplicated library from the indexes, module items, syllabus, assignment descriptions, and announcements. Known locked or hidden resources stay excluded. Material access details show when the library uses linked resources instead of an index; Canvas still checks permissions when each link is opened. Unexpected network/server errors remain visible under Sync issues.

## New extension permissions

`http://127.0.0.1/*` and `http://localhost/*` allow the service worker to reach your local AI backend; non-loopback backend URLs are rejected. `alarms` and `notifications` support opt-in deadline reminders. `activeTab` supports screenshots after you click the GRADIENT toolbar icon. If screenshot access is unavailable, page inspection uses text and visible resource links and reports that limitation. Screenshots exclude the GRADIENT overlay. No broad desktop control permission is requested.

## Release archive

`npm run package` typechecks, rebuilds a clean `dist`, validates manifest assets, and writes `gradient-extension.zip`. Unzip it, then choose its extracted folder with **Load unpacked**. The archive contains only extension assets; the synthetic preview bundle stays outside the archive.

## Research opportunities

Open **Research** in the workspace tabs. The finder suggests editable research fields from enrolled course names and syllabus text. Only the topic keywords go to public search; the syllabus, identity, and grades stay in the tab. The local backend discovers programmes and uses the reasoning model selected in **AI Workspace → Models** to summarise their practical details.

Results are readable university/government REU pages ranked by topic overlap. **Why this matches your coursework** lists only relevant enrolled courses, once per course, with their matching topics or skills. **Deadline, eligibility & funding** shows concise local-model summaries grounded in the programme page. Missing facts stay unknown; if summarisation is unavailable, the finder explains this instead of showing raw website text. Programme pages can describe previous cycles: the finder does not label a programme open or claim eligibility from a keyword match. Search and summarisation run as a polled local job so slower models can finish without holding a browser request open.

Enable **Use Google in the browser** for browser-based discovery with the existing optional site permission. Otherwise the backend uses public search, with a small set of university program pages checked directly when search is unavailable. Fallback results are labeled. Missing or unreadable evidence is never filled in by a model. The NSF directory remains available for broader discovery.
