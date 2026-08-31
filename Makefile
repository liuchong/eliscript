EMACS ?= emacs
BUN ?= bun

.PHONY: test check-contracts byte-compile
test: check-contracts
	$(EMACS) --batch -Q -L compiler -L tools/org -L tools/worker -L tests \
		-l tests/eliscript-tests.el \
		-l tests/eliscript-project-tests.el \
		-l tests/eliscript-org-tests.el \
		-l tests/eliscript-worker-tests.el \
		-l tests/bootstrap-tests.el \
		-f ert-run-tests-batch-and-exit
	$(BUN) test tests/vite-plugin.test.mjs tests/org-vite-plugin.test.mjs \
		tests/conformance.test.mjs tests/public-surface.test.mjs \
		tests/ci-contract.test.mjs \
		tests/collection-layout-benchmark.test.mjs \
		tests/bootstrap-symbol.test.mjs tests/bootstrap-reader.test.mjs \
		tests/bootstrap-expander.test.mjs tests/bootstrap-analyzer.test.mjs \
		tests/bootstrap-ir.test.mjs tests/bootstrap-emitter.test.mjs \
		tests/compiler-runtime-scan.test.mjs \
		tests/compiler-ir-kind.test.mjs \
		tests/compiler-indent.test.mjs \
		tests/compiler-locate.test.mjs \
		tests/compiler-binary-comparison.test.mjs \
		tests/compiler-reader-character.test.mjs \
		tests/bootstrap-compiler.test.mjs tests/loop-recur.test.mjs \
		tests/macro-generated-names.test.mjs \
		tests/worker-runtime.test.mjs \
		tests/worker-value-codec.test.mjs \
		tests/worker-value-stream.test.mjs \
		tests/worker-value-stream-probe.test.mjs \
		tests/worker-benchmark.test.mjs tests/stdlib-sequence.test.mjs \
		tests/stdlib-text.test.mjs tests/stdlib-object.test.mjs \
		tests/stdlib-bit.test.mjs \
		tests/portable-persistent-list.test.mjs \
		tests/portable-persistent-map.test.mjs \
		tests/portable-persistent-set.test.mjs \
		tests/portable-persistent-vector.test.mjs \
		tests/persistent-core-exit.test.mjs \
		tests/portable-value-semantics.test.mjs tests/portable-metadata.test.mjs \
		tests/portable-data-text.test.mjs tests/portable-result.test.mjs \
		tests/portable-json.test.mjs tests/portable-numeric.test.mjs \
		tests/atom.test.mjs \
		tests/interop-js.test.mjs \
		tests/identifier.test.mjs tests/metadata.test.mjs \
		tests/data-text.test.mjs \
		tests/protocol.test.mjs tests/eliscript-protocol.test.mjs \
		tests/collection-protocol.test.mjs \
		tests/core-text-object.test.mjs \
		tests/literal-runtime.test.mjs \
		tests/transducer.test.mjs tests/transient.test.mjs \
		tests/core-stdlib.test.mjs \
		tests/persistent-list.test.mjs tests/persistent-vector.test.mjs tests/value-semantics.test.mjs \
		tests/persistent-map.test.mjs tests/persistent-set.test.mjs
	PATH="$(dir $(shell command -v $(BUN))):$$PATH" ./tests/cli-test.sh
	PATH="$(dir $(shell command -v $(BUN))):$$PATH" ./tests/project-cli-test.sh

check-contracts:
	$(BUN) tools/conformance/check.mjs
	$(BUN) tools/surface/check.mjs
	$(BUN) tools/ci/render-workflow.mjs --check

byte-compile:
	EMACS="$(EMACS)" ./tools/ci/strict-byte-compile.sh
