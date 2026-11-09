.PHONY: all install test test-ts test-py build probe sandbox-check clean demo-replay demo-live report assistant

all:
	$(MAKE) -C bodha all

install:
	$(MAKE) -C bodha install

assistant:
	$(MAKE) -C bodha assistant

demo-replay:
	$(MAKE) -C bodha demo-replay

demo-live:
	$(MAKE) -C bodha demo-live

report:
	$(MAKE) -C bodha report

test:
	$(MAKE) -C bodha test

test-grades:
	$(MAKE) -C bodha test-grades

test-optimiser:
	$(MAKE) -C bodha test-optimiser

test-ui:
	$(MAKE) -C bodha test-ui

test-schedule:
	$(MAKE) -C bodha test-schedule

eval-policy:
	$(MAKE) -C bodha eval-policy

eval-rubric:
	$(MAKE) -C bodha eval-rubric

eval-retrieval:
	$(MAKE) -C bodha eval-retrieval

eval-leak:
	$(MAKE) -C bodha eval-leak

test-ts:
	$(MAKE) -C bodha test-ts

test-py:
	$(MAKE) -C bodha test-py

build:
	$(MAKE) -C bodha build

probe:
	$(MAKE) -C bodha probe

sandbox-check:
	$(MAKE) -C bodha sandbox-check

clean:
	$(MAKE) -C bodha clean


assistant-start:
	$(MAKE) -C bodha assistant-start

.PHONY: assistant-restart
assistant-restart:
	$(MAKE) -C bodha assistant-restart

.PHONY: speech-setup
speech-setup:
	$(MAKE) -C bodha speech-setup
