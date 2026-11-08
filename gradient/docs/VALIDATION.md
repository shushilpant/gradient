# Consolidation validation

Checked November 7, 2026 (America/Chicago). These results describe the consolidated product, including retained legacy regression coverage.

## Executed checks

| Check | Final result |
| --- | --- |
| TypeScript typecheck | Passed |
| MV3 release build | Passed |
| Full frontend/unit/property/Chrome suite | **390 tests, 47 files passed** |
| Full backend suite | **256 tests passed**, 3 dependency warnings |
| Package and archive inspection | Passed; 282,305 bytes, 11 release files |
| Whitespace/diff check | Passed |

No standalone lint script is configured; `git diff --check` checks whitespace.

- `npm run typecheck`: TypeScript compiler check.
- `npm run build`: Chrome MV3 content, background, options and localhost preview bundles; isolated legacy regression bundle outside the release tree.
- `npm test -- --maxWorkers=2 --minWorkers=1`: full unit, property and real-Chrome browser suite using controlled Canvas/network fixtures.
- `backend/.venv/bin/pytest backend -q`: full backend suite, including real isolated browser navigation with mocked model decisions.
- `npm run package`: typecheck, release build and deterministic extension ZIP.
- Archive inspection: required manifest assets present; preview, legacy test bundle and synthetic student/course corpus excluded from the install archive.
- `git diff --check`: whitespace validation.

Chrome and ephemeral loopback test servers required sandbox escalation. No automatic approval review rejected an action. Test services use synthetic data; they do not authenticate to an institutional account.

## Real localhost preview smoke

A separate check started the actual synthetic preview on loopback port 8087 and used Chrome without network interception. It verified:

- Exactly four primary sections, three new readable homework briefs and their rubric/API routes.
- Real local graph-resource retrieval and Research material analysis.
- What-if grades changing from 84.1% at zero to 91.6% at full score.
- Assignment 1091 carried into Homework Autopilot with its course context.
- All four sections fitting a 375px viewport without horizontal overflow.
- Zero page errors, failed requests or live Canvas mutations.

The actual UI reported **Local AI ready** and **Automation needs setup**. This check did not request inference or start an agent session. The temporary preview server was stopped. Screenshot: `/private/tmp/gradient-hackathon-demo.png`.

## Safeguards covered

The suites cover current/final grades, assignment-group weighting and drop rules, fixed-seed effort/GPA scenarios, shared source caching, coursework/source permissions, cancelled and stale results, syllabus/course-only assistance, assessment rejection across explanation/reference/Autopilot modes, source excerpts and safe exports, sandbox origin/navigation restrictions, approval/cancellation and activity evidence, account identity changes during sync, scoped preferences and notifications, keyboard navigation, mobile layout, programme evidence and missing-fact handling, and synthetic/live separation.

Study Studio, command, photo, audio and sharing browser tests run through the isolated legacy test entry. They do not imply those tools remain in the primary interface.

## Unverified behavior and limits

- No institutional SSO, live student account, live assessment or production Canvas mutation was used.
- No fresh end-to-end Ollama generation or model-driven Canvas OSS run was performed during consolidation. Actual isolated Chrome execution is tested with mocked model decisions; this is distinct from real model inference.
- The local Canvas replica was not started or rebuilt. Its first setup can be substantial. Automation's current setup state is shown honestly.
- Public REU discovery was tested with controlled programme pages. Current programme cycles, deadlines, eligibility, funding and application availability require source-page confirmation.
- Research extraction uses deterministic vocabulary and explicit source evidence, with bounded material reads. It is not a comprehensive assessment of student skills.
- Study-hour ranges depend on learning-curve/noise assumptions and are not guaranteed predictions.
- Backend tests emit dependency deprecation warnings for Starlette/anyio and protobuf. These are not test failures.
- Refresh invalidates transient generated views and scoped work. Saved preferences/data remain; export reference material before refreshing. Previously unscoped academic settings require explicit import. Older reminders resume after a successful matching-account sync.

See [HACKATHON.md](HACKATHON.md) for architecture and file inventory, and [DEMO.md](DEMO.md) for setup, fallback and the 150-second pitch.

## Palette follow-up

The shared palette update passed typecheck, build and packaging, plus 31 browser tests across the four sections, Grade Lab, source exports, keyboard navigation and mobile layouts. The synthetic preview HTTP tests passed 4 tests. Shared tokens live in `extension/ui/palette.ts` and are consumed by the workspace, assistant, workflows, Research/legacy shared components, and extension settings. Success, warning and error colours remain distinct.
