EMACS ?= emacs
BUN ?= bun

.PHONY: test
test:
	$(EMACS) --batch -Q -L compiler -L tests \
		-l tests/eliscript-tests.el \
		-f ert-run-tests-batch-and-exit
	$(BUN) test tests/vite-plugin.test.mjs
	PATH="$(dir $(shell command -v $(BUN))):$$PATH" ./tests/cli-test.sh
