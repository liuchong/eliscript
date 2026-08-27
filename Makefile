EMACS ?= emacs
BUN ?= bun

.PHONY: test
test:
	$(EMACS) --batch -Q -L compiler -L tools/org -L tests \
		-l tests/eliscript-tests.el \
		-l tests/eliscript-org-tests.el \
		-l tests/bootstrap-tests.el \
		-f ert-run-tests-batch-and-exit
	$(BUN) test tests/vite-plugin.test.mjs tests/org-vite-plugin.test.mjs \
		tests/bootstrap-symbol.test.mjs tests/bootstrap-reader.test.mjs \
		tests/bootstrap-expander.test.mjs tests/bootstrap-analyzer.test.mjs
	PATH="$(dir $(shell command -v $(BUN))):$$PATH" ./tests/cli-test.sh
