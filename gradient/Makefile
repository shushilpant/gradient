.PHONY: all install test test-ts test-py build probe sandbox-check clean assistant

SHELL := /bin/bash
UV ?= $(HOME)/.local/bin/uv
PYTHON ?= backend/.venv/bin/python
PYTEST ?= backend/.venv/bin/pytest

all: build test

assistant:
	$(PYTHON) -m uvicorn backend.app:app --host 127.0.0.1 --port 8765

install:
	@echo "==> Installing Node.js dependencies..."
	npm install
	@echo "==> Setting up Python 3.12 virtual environment and backend dependencies..."
	@if [ ! -d "backend/.venv" ]; then \
		if command -v uv >/dev/null 2>&1; then \
			uv venv backend/.venv --python /opt/homebrew/bin/python3.12; \
			uv pip install --python backend/.venv/bin/python -e "./backend[dev]"; \
		elif [ -x "$(UV)" ]; then \
			$(UV) venv backend/.venv --python /opt/homebrew/bin/python3.12; \
			$(UV) pip install --python backend/.venv/bin/python -e "./backend[dev]"; \
		else \
			python3 -m venv backend/.venv; \
			backend/.venv/bin/pip install -e "./backend[dev]"; \
		fi \
	fi

test: test-ts test-py

test-grades:
	@echo "==> Running Stage 3 Canvas Grade Model Acceptance & Property-Based Tests..."
	npm run test:grades

test-optimiser:
	@echo "==> Running Stage 4 Effort Optimizer Acceptance & Benchmark Tests..."
	npm run test:optimiser

test-ui:
	@echo "==> Running Stage 5 Panel UI Playwright Acceptance Tests..."
	npm run build
	npm run test:ui

test-schedule:
	@echo "==> Running Stage 10 Academic Study Scheduler & Change Radar Tests..."
	npx vitest run tests/scheduler.test.ts
	$(PYTHON) eval/schedule/eval_change_radar.py

eval-policy:
	@echo "==> Running Stage 6 Syllabus AI-Policy Gate Evaluation..."
	$(PYTHON) eval/policy/eval_policy.py

eval-rubric:
	@echo "==> Running Stage 7 Rubric-Aware Feedback & Rewrite Guard Evaluation..."
	$(PYTHON) eval/rubric/eval_rubric.py

eval-retrieval:
	@echo "==> Running Stage 8 Course-Grounded Retrieval Evaluation..."
	$(PYTHON) eval/retrieval/eval_retrieval.py

eval-leak:
	@echo "==> Running Stage 9 Hint Ladder & Answer-Leak Guard Evaluation..."
	$(PYTHON) eval/leak/eval_leak.py

test-ts:
	@echo "==> Running TypeScript acceptance test suite (Vitest)..."
	npx vitest run

test-py:
	@echo "==> Running Backend test suite (Pytest)..."
	@if [ -x "$(PYTEST)" ]; then \
		$(PYTEST) backend -v; \
	else \
		pytest backend -v; \
	fi

build:
	@echo "==> Typechecking TypeScript and bundling Chrome MV3 Extension..."
	npx tsc --noEmit
	npm run build

demo-replay: build
	@echo "==> Starting GRADIENT Demo Server in REPLAY Mode (Zero External Network)..."
	$(PYTHON) scripts/demo_runner.py --mode replay --open-browser

demo-live: build
	@echo "==> Starting GRADIENT Demo Server in LIVE Sandbox Mode..."
	$(PYTHON) scripts/demo_runner.py --mode live --open-browser

report:
	@echo "==> Generating Comprehensive System Evaluation Report..."
	$(PYTHON) scripts/generate_report.py

probe:
	@echo "==> Probing Canvas sandbox fixture..."
	npx tsx sandbox/probe.ts

sandbox-check:
	@echo "==> Running Stage 1 Acceptance Test: Sandbox Seed & API Reality Check..."
	backend/.venv/bin/python sandbox/seed.py
	backend/.venv/bin/python sandbox/probe.py

clean:
	rm -rf dist


assistant-start:
	$(PYTHON) scripts/assistant_service.py

.PHONY: assistant-restart
assistant-restart:
	$(PYTHON) scripts/assistant_service.py --restart

.PHONY: speech-setup
speech-setup:
	uv pip install --python backend/.venv/bin/python "kokoro-onnx>=0.4,<0.5" "soundfile>=0.13,<0.15"
	$(PYTHON) scripts/setup_speech.py
