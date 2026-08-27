EMACS ?= emacs
BUN ?= bun

.PHONY: test
test:
	$(EMACS) --batch -Q -L compiler -L tests \
		-l tests/eliscript-tests.el \
		-f ert-run-tests-batch-and-exit
	PATH="$(dir $(shell command -v $(BUN))):$$PATH" ./tests/cli-test.sh
