# OffCanvas smoke-test validation

Checked **9 November 2026 (America/Chicago)** after the OffCanvas naming migration. These are executed results, including the retained regression coverage for optional legacy tools.

## Final checks

| Check | Result |
| --- | --- |
| TypeScript typecheck | Passed |
| Chrome MV3 release build | Passed |
| Full frontend, unit, property and Chrome suite | **477 tests in 60 files passed**, no failures or skips |
| Full Python backend suite | **323 tests passed**, three dependency deprecation warnings |
| Syllabus policy, rubric, retrieval, answer-leak and date-change evaluations | All five passed |
| Extension ZIP inspection | Passed; 12 release files, no preview/test bundles or synthetic corpus |
| Source migration and whitespace checks | All tracked source files preserved; changed lines clean |

Commands from `offcanvas/`:

```sh
npm run typecheck
npm run build
npm test -- --maxWorkers=2 --minWorkers=1
backend/.venv/bin/python -m pytest backend -q
make eval-policy eval-rubric eval-retrieval eval-leak test-schedule
npm run package
```

No standalone lint command is configured. Chrome and loopback servers ran with local sandbox permissions. The final frontend run took 105 seconds; the final backend run took about 9 seconds. The optimizer benchmark completed in 1,153 ms after the fix, compared with 3,050 ms before it under the same two-worker setup. The existing performance threshold was preserved.

## Failures found and fixed

- First-launch AI could remain unavailable when its configured default model was absent. Model discovery now chooses an installed recommended or supported model.
- Monte Carlo grade planning repeatedly sorted grade thresholds for every sample. Thresholds and grade-point values are now prepared once per course; custom unsorted grading schemes still match the grade engine.
- The running local Canvas replica used an older verification marker and was falsely reported unavailable. Explicit legacy marker support restores discovery without changing containers or database volumes.
- New sandbox configuration now uses the OffCanvas name. Existing database project/container and named-volume labels take precedence over credential branding, preserving earlier installations.

## Real local preview and services

A temporary, unmocked synthetic preview ran on loopback port 8087 with the fixture day fixed to 9 November. Headless Chrome verified:

- All four main sections render with OffCanvas branding.
- The selected homework reaches Homework Autopilot with assignment ID 1091.
- What-if grades change from 84.1% at zero to 91.6% at full credit.
- Calendar downloads and the install ZIP use OffCanvas filenames.
- All four sections fit 375, 768, 1024 and 1440 pixel widths without horizontal overflow.
- The assessment page has no injected panel.
- Zero uncaught page errors, failed requests or live Canvas mutations.

The workspace backend was restarted from the new directory. Actual health checks confirmed Ollama connectivity and the installed models. A real local `llama3.2:1b` explanation job completed with synthetic facts. A separate real `qwen3:8b` study-packet job completed using synthetic lecture text, returned two source records and a 1,856-character explanation, with public search disabled. These were real generation requests, not prepared demo results.

The existing local Canvas OSS replica passed its revision, login-page and six local JavaScript/CSS asset checks. The restarted backend's computer-use configuration reports `available: true`. Existing legacy-named containers were not rebuilt or reseeded.

Temporary smoke artifacts are in `/tmp/`: `offcanvas-real-preview-smoke.json`, `offcanvas-live-model-smoke.json`, `offcanvas-live-packet-smoke.json`, `offcanvas-smoke-desktop.png`, `offcanvas-smoke-mobile.png` and `offcanvas-preview-deadlines.ics`. Test logs are `offcanvas-js-smoke-final.log`, `offcanvas-backend-final.log` and `offcanvas-evaluations.log`.

## Naming and upgrade compatibility

The canonical source directory, design-system directory, package, extension metadata, settings, request header, new environment variables, new exports, icons, demo seed and documentation use OffCanvas / `offcanvas` / `OFFCANVAS` as appropriate. The shared icon uses the current rust accent; design references match the warm-paper workspace palette.

Old product-name strings remain only in explicit compatibility paths and their tests, old demo course aliases, and the two source-directory compatibility links. Saved local/extension settings and active run metadata migrate to current keys. Already delivered reminders are reconciled to avoid duplicate alerts. Replanned published calendar blocks preserve their existing event identities and increment sequence numbers. CSS gradient functions retain their technical name.

The compatibility directory links also preserve existing unpacked Chrome extension paths. **Reload the existing extension card** to keep its extension identity and storage. New installations use `offcanvas/dist`. Loading an additional unpacked copy from a different path creates a separate Chrome identity.

## Coverage and remaining limits

The suites cover grade weights/drop rules, deterministic GPA scenarios, shared coursework caching, source permissions, account switching, academic preferences, deadline reminders, cancellation and stale results, citations, equation rendering, exports, assessment rejection, browser isolation and recovery, research ranking/evidence, keyboard controls, responsive layouts and all staged presentation demos. The new smoke tests explicitly traverse all four sections without runtime errors and exercise the built settings page's legacy migration, validation, permission rejection, save/reload and reset behavior.

No institutional SSO or real student account was exercised. Public programme search and current REU deadlines were checked using controlled responses; current availability was not researched. No fresh model-driven browser-agent run against Canvas OSS was performed; actual isolated Chrome execution uses controlled model decisions in tests. Optional audio, photo, sharing and study tools retain regression coverage but were not all invoked against live external dependencies. A successful model request establishes connectivity and generation, not correctness of every generated claim.

The backend warnings are dependency deprecations from Starlette/anyio and protobuf; they did not cause failures. The synthetic preview server was stopped after verification; the existing local assistant remains running with the updated code.

## Maximum-context automation follow-up

The response-limit failure was traced to per-stage generation caps, including 2,600 tokens for assignment parsing and 8,000 for the full draft. The context default is now 262,144 tokens, with each model capped at its own advertised native maximum. Response budgets use the remaining context after conservative prompt/schema/image reserves, and are recalculated for schema repairs. Source fitting uses the same native window. Complete validated JSON is preserved if Ollama reports a generation boundary; incomplete truncated output is rejected explicitly.

This 64 GiB M5 Max workstation loaded `qwen3:30b-a3b-thinking-2507-q8_0` at **262,144 tokens**, confirmed by Ollama's loaded-model API, with **46,683,526,266 bytes (43.48 GiB)** of model/GPU allocation. Flash attention, q8 KV cache, one parallel request and one loaded model are persisted in the existing local Ollama LaunchAgent. The configured service uses loopback port 11435 to coexist with the GUI app on 11434; OffCanvas persists its endpoint and context settings in the ignored local `.env`. Explicit shell variables retain precedence.

The real Qwen assignment-parser test was given a **260,621-token response budget** and completed with **3,604 generated tokens**, exceeding the former 2,600-token cutoff. A final run using the model’s native sampling completed in 34.62 seconds and recovered all three practice requirements. The model’s required thinking mode is respected; final JSON is validated separately from its reasoning trace. Thinking-only models retain native sampling defaults. The backend was restarted to apply these changes.

New regressions cover native context fitting, full response budgets, compact schema repair, valid versus truncated boundary responses, advertised thinking-only/switchable modes and cached model constraints. All **323 backend tests** passed. The frontend source did not change in this follow-up.

Details: [local AI configuration](LOCAL_AI.md). Temporary evidence: `/tmp/offcanvas-max-context-loaded.json`, `/tmp/offcanvas-max-context-parser-smoke.json`, `/tmp/offcanvas-max-context-parser-native-smoke.json` and `/tmp/offcanvas-max-context-backend.log`.
