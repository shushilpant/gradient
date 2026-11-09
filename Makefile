.PHONY: all install test test-ts test-py build probe sandbox-check clean demo-replay demo-live report assistant

all:
	$(MAKE) -C offcanvas all

install:
	$(MAKE) -C offcanvas install

assistant:
	$(MAKE) -C offcanvas assistant

demo-replay:
	$(MAKE) -C offcanvas demo-replay

demo-live:
	$(MAKE) -C offcanvas demo-live

report:
	$(MAKE) -C offcanvas report

test:
	$(MAKE) -C offcanvas test

test-grades:
	$(MAKE) -C offcanvas test-grades

test-optimiser:
	$(MAKE) -C offcanvas test-optimiser

test-ui:
	$(MAKE) -C offcanvas test-ui

test-schedule:
	$(MAKE) -C offcanvas test-schedule

eval-policy:
	$(MAKE) -C offcanvas eval-policy

eval-rubric:
	$(MAKE) -C offcanvas eval-rubric

eval-retrieval:
	$(MAKE) -C offcanvas eval-retrieval

eval-leak:
	$(MAKE) -C offcanvas eval-leak

test-ts:
	$(MAKE) -C offcanvas test-ts

test-py:
	$(MAKE) -C offcanvas test-py

build:
	$(MAKE) -C offcanvas build

probe:
	$(MAKE) -C offcanvas probe

sandbox-check:
	$(MAKE) -C offcanvas sandbox-check

clean:
	$(MAKE) -C offcanvas clean


assistant-start:
	$(MAKE) -C offcanvas assistant-start

.PHONY: assistant-restart
assistant-restart:
	$(MAKE) -C offcanvas assistant-restart

.PHONY: speech-setup
speech-setup:
	$(MAKE) -C offcanvas speech-setup
