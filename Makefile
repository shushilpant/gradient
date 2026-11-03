.PHONY: all install test test-ts test-py build probe sandbox-check clean demo-replay demo-live report assistant

all:
	$(MAKE) -C gradient all

install:
	$(MAKE) -C gradient install

assistant:
	$(MAKE) -C gradient assistant

demo-replay:
	$(MAKE) -C gradient demo-replay

demo-live:
	$(MAKE) -C gradient demo-live

report:
	$(MAKE) -C gradient report

test:
	$(MAKE) -C gradient test

test-grades:
	$(MAKE) -C gradient test-grades

test-optimiser:
	$(MAKE) -C gradient test-optimiser

test-ui:
	$(MAKE) -C gradient test-ui

test-schedule:
	$(MAKE) -C gradient test-schedule

eval-policy:
	$(MAKE) -C gradient eval-policy

eval-rubric:
	$(MAKE) -C gradient eval-rubric

eval-retrieval:
	$(MAKE) -C gradient eval-retrieval

eval-leak:
	$(MAKE) -C gradient eval-leak

test-ts:
	$(MAKE) -C gradient test-ts

test-py:
	$(MAKE) -C gradient test-py

build:
	$(MAKE) -C gradient build

probe:
	$(MAKE) -C gradient probe

sandbox-check:
	$(MAKE) -C gradient sandbox-check

clean:
	$(MAKE) -C gradient clean


assistant-start:
	$(MAKE) -C gradient assistant-start
