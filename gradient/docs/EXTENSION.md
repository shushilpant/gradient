# Run GRADIENT inside Canvas

GRADIENT is a Chrome/Edge Manifest V3 extension. It uses your existing Canvas login in the same tab. You do not need an API token, local server, or backend for coursework, grade planning, resources, and calendar exports.

## Install the development build

1. From the project root, run `make build`.
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

Requests use the signed-in tab's session, stay on that Canvas origin, and only use GET. Raw course content and credentials are not sent to an external AI service. Account data stays in memory and is fetched afresh on refresh. Instructor restrictions are shown as unavailable sections, never substituted with invented course data. TA/teacher-only enrollments are excluded from the student workspace.

Supported automatic hosts are `*.instructure.com` and `canvas.usm.edu`. Adding another custom domain requires updating the manifest and host allowlist, then reloading the development extension. Browser host permissions are not granted by typing a domain into a text box.

The extension pauses on quiz-taking pages and active assessments. It does not submit work, change grades, send messages, or modify Canvas records.

## Preview and checks

`make demo-replay` opens an explicitly labeled **Demo preview** on localhost. The preview uses synthetic courses; it is a separate entry point, and the installed extension never loads those fixtures.

`make build test` runs type checks, bundles the extension, and runs TypeScript/browser and Python checks. Browser tests intercept Canvas API routes with controlled responses to verify the same-tab session integration and error behavior without requiring your account.

## When Pages or Files is hidden

A course's Pages/Files index can return 403 or 404 while files and pages linked in modules or coursework remain available. GRADIENT builds one deduplicated library from the indexes, module items, syllabus, assignment descriptions, and announcements. Known locked or hidden resources stay excluded. Material access details show when the library uses linked resources instead of an index; Canvas still checks permissions when each link is opened. Unexpected network/server errors remain visible under Sync issues.
