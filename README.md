# GRADIENT: Canvas LMS Grade Model, Effort Optimiser, and Grounded Study Companion

> **Live Canvas extension:** Build with `make build`, then load `gradient/dist` using Chrome’s **Load unpacked** at `chrome://extensions`. Sign in to your real Canvas tab and refresh. No API token or backend is needed for the live workspace. See [extension installation and capabilities](gradient/docs/EXTENSION.md). The localhost demo is a synthetic preview, not your Canvas account.

[![Acceptance Tests](https://img.shields.io/badge/Acceptance_Tests-100%25_Passing-16a34a.svg)](tests/)
[![Grade Model Oracle](https://img.shields.io/badge/Canvas_Grade_Diff-0.00%25-2563eb.svg)](docs/EVAL_REPORT.md)
[![Zero Network Replay](https://img.shields.io/badge/Replay_Mode-Air--Gapped-blue.svg)](docs/DEMO.md)
[![Architecture](https://img.shields.io/badge/Chrome_MV3-Shadow--DOM-purple.svg)](extension/)

GRADIENT is an academically honest pair programming companion and decision-support extension for students using Canvas LMS. It pairs a **Chrome Manifest V3 Shadow-DOM side panel** with a **pure TypeScript core** and an optional **stateless FastAPI backend**.

---

## Key Capabilities

1. **Exact Canvas Grade Model (Stage 3)**: Reproduces Canvas LMS gradebook math down to 0.00% difference, including weighted assignment groups, drop-lowest, drop-highest, never-drop exclusions, and unposted scores.
2. **Effort Optimizer (Stage 4)**: Allocates limited study hours across competing courses to maximize expected semester GPA using Common Random Numbers (CRN) Monte Carlo simulation with 1-opt local search.
3. **Shadow-DOM Panel UI (Stage 5)**: Securely mounted in an open Shadow DOM, completely isolating extension styling from Canvas LMS stylesheets.
4. **Syllabus AI-Policy Gate (Stage 6)**: Extracts and enforces syllabus AI collaboration policies (prohibited, permitted with disclosure, permitted for named uses), with strict verbatim grounding and cautious defaults.
5. **Rubric-Aware Pre-Submit Critique (Stage 7)**: Provides qualitative descriptor alignment and weakest-first pointers. **Strictly zero rewritten prose and zero predicted numeric grades**.
6. **Course-Grounded Retrieval (Stage 8)**: Ranks course slides, modules, and open textbook chunks with Canvas deep links, accompanied by pure vector inline `<svg>` concept diagrams (zero web images).
7. **Socratic Hint Ladder & Leak Guard (Stage 9)**: 5-rung cognitive ladder (R0-R4) with mandatory 15-character friction gates and SymPy / Python subprocess sandbox verification on isomorphic variants to prevent answer leaks.
8. **Academic Study Scheduler & Change Radar (Stage 10)**: Places study blocks in 30-minute intervals around calendar busy blocks, sleep windows, and deadline buffers using OR-Tools CP-SAT with greedy fallback. Generates RFC 5545 `.ics` calendar files with stable UIDs. Detects deadline extensions in announcements with a mandatory human confirmation gate.

---

## Plain Statements of Limits & Boundaries (What GRADIENT Cannot Do)

*See full details in [docs/LIMITS.md](docs/LIMITS.md).*

- **Effort curves are mathematical assumptions**: Pacing time constants ($\tau$) and mastery ceilings ($\text{cap}$) are configurable empirical priors, not guarantees of academic success.
- **Syllabus policy extraction can err**: Complex or contradictory syllabus wording requires human confirmation before features adapt.
- **Critique is not a grade prediction**: Pre-submit checks critique qualitative criteria alignment; they never output predicted scores or grades.
- **Answer-leak guard scope**: Formal verification guarantees apply to mathematical formulas (via SymPy) and code tasks (via test execution in a subprocess). Essay writing uses heuristic rubric structural checks.
- **LLM calls send content off-device**: Live mode transmits draft text over TLS to the backend (with an ephemeral RAM-only zero-retention guarantee). Replay mode runs 100% locally from recorded fixtures.
- **Institutional API restrictions**: If an institution blocks Canvas API tokens, live sync cannot operate.

---

## Quickstart & Demo Modes

### 1. Installation
```bash
# Install Node dependencies and setup Python 3.12 virtualenv
make install

# Build Chrome MV3 extension bundle
make build
```

### 2. Demo Modes (Stage 11)
```bash
# Replay Mode: Boots the full demo environment air-gapped from recorded fixtures with zero network calls
make demo-replay

# Live Mode: Boots against live/sandbox Canvas API and backend with timeout fallbacks
make demo-live
```
Open `http://127.0.0.1:8085/courses/99001` in your browser. The mock Canvas page will mount the GRADIENT Shadow DOM panel.

To rehearse the 4-minute demo script, consult [docs/DEMO.md](docs/DEMO.md).

### 3. Generate Evaluation Report
```bash
# Produce comprehensive multi-stage audit report (saved to docs/EVAL_REPORT.md)
make report
```

### 4. Run Test Suites
```bash
# Run all TypeScript (Vitest) and Python (Pytest) test suites
make test

# Run Playwright UI acceptance tests
make test-ui

# Run Scheduler and Change Radar benchmarks
make test-schedule
```

---

## Project Structure

```
├── Makefile                 # Top-level makefile delegating to gradient/
└── gradient/
    ├── Makefile             # Main build, test, and demo targets
    ├── backend/             # Stateless FastAPI service (OR-Tools, SymPy, Policy, Rubric)
    ├── core/                # Pure TypeScript core (Grade Model, Optimiser, Scheduler)
    ├── docs/
    │   ├── ASSUMPTIONS.md   # Mathematical modeling specifications
    │   ├── DEMO.md          # Timed 4-minute run of show & fallback plans
    │   ├── EVAL_REPORT.md   # Generated audit and evaluation report
    │   └── LIMITS.md        # Explicit limits and non-goals
    ├── eval/                # Benchmark evaluation suites for all stages
    ├── extension/           # Chrome MV3 Content Script & Shadow-DOM Preact UI
    ├── sandbox/             # Synthetic Canvas sandbox seeder and API fixtures
    ├── scripts/             # Demo runner, report generator, and build tooling
    └── tests/               # 18 Vitest test suites (168 tests) + Playwright UI
```

---

## License

MIT License. Designed and built with strict academic integrity standards for student learning.
