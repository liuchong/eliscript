EMACS ?= emacs
BUN ?= bun
BUN_TEST_RUNNER ?= test

.PHONY: test test-core test-applications check-contracts byte-compile
test: test-core test-applications

test-core: check-contracts
	$(EMACS) --batch -Q -L compiler -L editor -L tools/org -L tools/worker -L tests \
		-l tests/eliscript-tests.el \
		-l tests/eliscript-evaluation-tests.el \
		-l tests/eliscript-project-tests.el \
		-l tests/eliscript-mode-tests.el \
		-l tests/eliscript-repl-tests.el \
		-l tests/eliscript-worker-tests.el \
		-l tests/eliscript-service-tests.el \
		-l tests/eliscript-analysis-tests.el \
		-l tests/bootstrap-tests.el \
		-f ert-run-tests-batch-and-exit
	$(BUN) $(BUN_TEST_RUNNER) tests/conformance.test.mjs tests/compiler-parity-corpus.test.mjs \
		tests/stable-compatibility-corpus.test.mjs \
		tests/public-surface.test.mjs \
		tests/api-index.test.mjs \
		tests/pages-site.test.mjs \
		tests/dogfood-specs.test.mjs \
		tests/compatibility-rehearsal.test.mjs \
		tests/onboarding-docs.test.mjs \
		tests/clean-project-workflow.test.mjs \
		tests/local-onboarding.test.mjs \
		tests/test-partition.test.mjs \
		tests/repository-integrity.test.mjs \
		tests/package-surface.test.mjs \
		tests/platform-capabilities.test.mjs \
		tests/reader-program-fuzz.test.mjs \
		tests/persistent-semantics.test.mjs \
		tests/project-scale.test.mjs \
		tests/core-performance-benchmark.test.mjs \
		tests/performance-acceptance-mode.test.mjs \
		tests/maturity-progress.test.mjs \
		tests/diagnostic-corpus.test.mjs \
		tests/source-debugging.test.mjs \
		tests/core-acceptance-corpus.test.mjs \
		tests/repeated-determinism.test.mjs \
		tests/final-acceptance.test.mjs \
		tests/retained-soak-refresh.test.mjs \
		tests/retained-transient-refresh.test.mjs \
		tests/retained-performance-deferral.test.mjs \
		tests/bootstrap-seed-batch.test.mjs \
		tests/seed-symbol-reservation.test.mjs \
		tests/esm-imports.test.mjs \
		tests/ci-contract.test.mjs \
		tests/local-compatibility-matrix.test.mjs \
		tests/collection-layout-benchmark.test.mjs \
		tests/transient-builder-benchmark.test.mjs \
		tests/bootstrap-symbol.test.mjs tests/bootstrap-reader.test.mjs \
		tests/bootstrap-formatter.test.mjs \
		tests/bootstrap-expander.test.mjs tests/bootstrap-analyzer.test.mjs \
		tests/bootstrap-ir.test.mjs tests/bootstrap-ir-serialization.test.mjs \
		tests/bootstrap-emitter.test.mjs \
		tests/compiler-runtime-scan.test.mjs \
		tests/compiler-ir-kind.test.mjs \
		tests/compiler-indent.test.mjs \
		tests/compiler-locate.test.mjs \
		tests/compiler-binary-comparison.test.mjs \
		tests/compiler-js-codegen.test.mjs \
		tests/direct-wasm-backend.test.mjs \
		tests/wasm-memory-runtime.test.mjs \
		tests/wasm-managed-runtime.test.mjs \
		tests/wasm-managed-tables.test.mjs \
		tests/wasm-managed-source-collections.test.mjs \
		tests/wasm-managed-collection-for-each.test.mjs \
		tests/wasm-managed-control.test.mjs \
		tests/wasm-managed-empty-bindings.test.mjs \
		tests/wasm-managed-callables.test.mjs \
		tests/wasm-managed-exceptions.test.mjs \
		tests/wasm-managed-catch-destructuring.test.mjs \
		tests/wasm-managed-symbols.test.mjs \
		tests/wasm-managed-exceptions-browser.test.mjs \
		tests/wasm-compiler-modules.test.mjs \
		tests/wasm-compiler-reader.test.mjs \
		tests/wasm-compiler-formatter.test.mjs \
		tests/wasm-compiler-ir-lower.test.mjs \
		tests/wasm-compiler-analyzer.test.mjs \
		tests/wasm-compiler-expander.test.mjs \
		tests/wasm-compiler-emitter.test.mjs \
		tests/wasm-compiler-project.test.mjs \
		tests/wasm-compiler-entry.test.mjs \
		tests/wasm-compiler-candidate-smoke.test.mjs \
		tests/wasm-compiler-runtime.test.mjs \
		tests/wasm-compiler-backends.test.mjs \
		tests/wasm-managed-compiler.test.mjs \
		tests/independent-compiler-producers.test.mjs \
		tests/compiler-producer-stages.test.mjs \
		tests/wasm-compiler-ir-json-errors.test.mjs \
		tests/wasm-compiler-source-map.test.mjs \
		tests/wasm-managed-iteration.test.mjs \
		tests/wasm-managed-primitive-properties.test.mjs \
		tests/wasm-managed-str.test.mjs \
		tests/wasm-managed-array-inheritance.test.mjs \
		tests/wasm-managed-array-prototype-methods.test.mjs \
		tests/wasm-managed-template-string.test.mjs \
		tests/wasm-managed-variadic-calls.test.mjs \
		tests/wasm-managed-array-callbacks.test.mjs \
		tests/wasm-managed-array-splice.test.mjs \
		tests/wasm-managed-array-sort.test.mjs \
		tests/wasm-managed-array-text.test.mjs \
		tests/js-array-text-fast-path.test.mjs \
		tests/compiler-js-array-text-call.test.mjs \
		tests/wasm-managed-concat.test.mjs \
		tests/wasm-managed-typeof.test.mjs \
		tests/wasm-managed-typeof-paths.test.mjs \
		tests/backend-cli-isolation.test.mjs \
		tests/wasm-managed-behavior.test.mjs \
		tests/wasm-managed-module-bindings.test.mjs \
		tests/wasm-managed-project-linking.test.mjs \
		tests/wasm-managed-arithmetic.test.mjs \
		tests/wasm-managed-operand-conversion.test.mjs \
		tests/wasm-managed-word.test.mjs \
		tests/wasm-managed-float64-words.test.mjs \
		tests/wasm-managed-string-code-unit.test.mjs \
		tests/wasm-managed-arrays.test.mjs \
		tests/wasm-managed-objects.test.mjs \
		tests/wasm-managed-strings.test.mjs \
		tests/wasm-managed-replacement.test.mjs \
		tests/wasm-managed-text-constructors.test.mjs \
		tests/wasm-managed-regexp.test.mjs \
		tests/wasm-managed-regexp-exact.test.mjs \
		tests/wasm-managed-builtins.test.mjs \
		tests/wasm-managed-identity.test.mjs \
		tests/wasm-managed-object-integrity.test.mjs \
		tests/wasm-managed-array-search.test.mjs \
		tests/wasm-managed-array-construction.test.mjs \
		tests/wasm-managed-object-properties.test.mjs \
		tests/wasm-managed-reflection-descriptor.test.mjs \
		tests/wasm-managed-math.test.mjs \
		tests/wasm-managed-json.test.mjs \
		tests/wasm-managed-json-atoms.test.mjs \
		tests/wasm-managed-gc-batch.test.mjs \
		tests/wasm-managed-number-conversion.test.mjs \
		tests/wasm-managed-number-text.test.mjs \
		tests/wasm-managed-text-format.test.mjs \
		tests/wasm-managed-primitive-operators.test.mjs \
		tests/wasm-managed-js-truth.test.mjs \
		tests/native-backend.test.mjs \
		tests/native-memory-backend.test.mjs \
		tests/native-memory-long-branches.test.mjs \
		tests/native-memory-indirect.test.mjs \
		tests/native-managed-runtime.test.mjs \
		tests/native-compiler-modules.test.mjs \
		tests/native-compiler-ir-lower-source-map.test.mjs \
		tests/native-compiler-runtime.test.mjs \
		tests/native-managed-behavior.test.mjs \
		tests/compiler-reader-character.test.mjs \
		tests/compiler-source-map-cursor.test.mjs \
		tests/compiler-portable-predicates.test.mjs \
		tests/compiler-portable-reader.test.mjs \
		tests/compiler-seed-negative-zero.test.mjs \
		tests/compiler-internal-string-order.test.mjs \
		tests/compiler-portable-emitter.test.mjs \
		tests/compiler-fragment-combine.test.mjs \
		tests/compiler-source-map-vlq.test.mjs \
		tests/compiler-portable-errors.test.mjs \
		tests/compiler-portable-guards.test.mjs \
		tests/compiler-js-control-context.test.mjs \
		tests/bootstrap-compiler.test.mjs tests/bootstrap-project.test.mjs \
		tests/bootstrap-evaluation.test.mjs \
		tests/watch.test.mjs \
		tests/loop-recur.test.mjs \
		tests/macro-generated-names.test.mjs \
		tests/macro-file-dependencies.test.mjs \
		tests/boundary-security.test.mjs \
		tests/worker-runtime.test.mjs \
		tests/worker-value-codec.test.mjs \
		tests/worker-value-stream.test.mjs \
		tests/worker-value-stream-probe.test.mjs \
		tests/worker-lifecycle-soak.test.mjs \
		tests/worker-benchmark.test.mjs \
		tests/emacs-analysis-evidence.test.mjs \
		tests/stdlib-sequence.test.mjs \
		tests/stdlib-text.test.mjs tests/stdlib-object.test.mjs \
		tests/markdown-wire.test.mjs tests/http-rpc.test.mjs tests/wire-compiler.test.mjs \
		tests/stdlib-bit.test.mjs tests/stdlib-function.test.mjs \
		tests/stdlib-deferred.test.mjs \
		tests/portable-persistent-list.test.mjs \
		tests/portable-persistent-map.test.mjs \
		tests/portable-persistent-set.test.mjs \
		tests/portable-persistent-vector.test.mjs \
		tests/persistent-core-exit.test.mjs \
		tests/portable-value-semantics.test.mjs tests/portable-metadata.test.mjs \
		tests/portable-data-text.test.mjs tests/portable-result.test.mjs \
		tests/portable-json.test.mjs tests/portable-numeric.test.mjs \
		tests/atom.test.mjs tests/multimethod.test.mjs \
		tests/declarative-protocol.test.mjs tests/declarative-record.test.mjs \
		tests/declarative-type.test.mjs \
		tests/value-dispatch.test.mjs tests/multi-arity.test.mjs \
		tests/local-recursive-functions.test.mjs \
		tests/persistent-tree-walk.test.mjs \
		tests/persistent-zipper.test.mjs \
		tests/persistent-sorted.test.mjs \
		tests/lazy-sequence.test.mjs \
		tests/regex.test.mjs \
		tests/core-expression-forms.test.mjs \
		tests/interop-js.test.mjs \
		tests/interop-package.test.mjs \
		tests/identifier.test.mjs tests/metadata.test.mjs \
		tests/data-text.test.mjs \
		tests/protocol.test.mjs tests/eliscript-protocol.test.mjs \
		tests/collection-protocol.test.mjs \
		tests/core-text-object.test.mjs \
		tests/literal-runtime.test.mjs \
		tests/language-equality.test.mjs \
		tests/transducer.test.mjs tests/transient.test.mjs \
		tests/core-order.test.mjs \
		tests/core-set.test.mjs \
		tests/core-stdlib.test.mjs \
		tests/persistent-list.test.mjs tests/persistent-queue.test.mjs tests/persistent-vector.test.mjs tests/value-semantics.test.mjs \
		tests/persistent-map.test.mjs tests/persistent-set.test.mjs \
		tests/record.test.mjs tests/type.test.mjs
	PATH="$(dir $(shell command -v $(BUN))):$$PATH" ./tests/cli-test.sh
	PATH="$(dir $(shell command -v $(BUN))):$$PATH" ./tests/project-cli-test.sh
	PATH="$(dir $(shell command -v $(BUN))):$$PATH" ./tests/check-cli-test.sh
	PATH="$(dir $(shell command -v $(BUN))):$$PATH" ./tests/format-cli-test.sh

test-applications:
	$(EMACS) --batch -Q -L tools/org -L tests \
		-l tests/eliscript-org-tests.el \
		-f ert-run-tests-batch-and-exit
	$(BUN) $(BUN_TEST_RUNNER) tests/vite-plugin.test.mjs tests/org-vite-plugin.test.mjs \
		tests/dogfood-site.test.mjs tests/dogfood-action.test.mjs \
		tests/dogfood-issues.test.mjs tests/dogfood-comments.test.mjs \
		tests/dogfood-discussions.test.mjs tests/dogfood-browser.test.mjs \
		tests/dogfood-identity.test.mjs tests/dogfood-events.test.mjs \
		tests/dogfood-accessibility.test.mjs tests/dogfood-config.test.mjs \
		tests/dogfood-hybrid.test.mjs tests/dogfood-matrix.test.mjs \
		tests/dogfood-resilience.test.mjs tests/dogfood-skip.test.mjs \
		tests/dogfood-workflow.test.mjs tests/browser-matrix.test.mjs \
		tests/browser-playground.test.mjs tests/browser-host.test.mjs \
		tests/docs-site.test.mjs tests/pages-assembly.test.mjs \
		tests/pages-runtime.test.mjs
	PATH="$(dir $(shell command -v $(BUN))):$$PATH" ./tests/application-cli-test.sh

# The browser matrix drives all three engines, so it is its own target: the
# suite above runs one engine and reports rather than requiring a browser to
# be installed. The report is retained as acceptance evidence.
check-browsers: dogfood
	$(BUN) run check:dogfood:browsers

dogfood:
	$(BUN) run dogfood

check-contracts:
	$(BUN) tools/conformance/check.mjs
	$(BUN) tools/compatibility/corpus.mjs
	$(BUN) tools/progress/check.mjs
	$(BUN) tools/diagnostics/check.mjs
	$(BUN) tools/parity/check.mjs
	$(BUN) tools/debugging/check.mjs
ifneq ($(ELISCRIPT_SKIP_RETAINED_ACCEPTANCE),1)
	$(BUN) tools/acceptance/check.mjs \
		--verify-run acceptance/runs/m13-01.json \
		--verify-markdown acceptance/runs/m13-01.md
	$(BUN) tools/acceptance/finalize.mjs --verify
	$(BUN) tools/compatibility/matrix.mjs --verify-all
endif
	$(BUN) tools/acceptance/repeat.mjs --verify \
		--json-report acceptance/runs/m13-04.json \
		--markdown-report acceptance/runs/m13-04.md
	$(BUN) tools/surface/check.mjs
	$(BUN) tools/surface/generate-api.mjs --check
	$(BUN) tools/ci/render-workflow.mjs --check
	$(BUN) tools/documentation/check.mjs
	$(BUN) tools/onboarding/check.mjs \
		--verify-run acceptance/runs/m13-02.json \
		--verify-markdown acceptance/runs/m13-02.md
	$(BUN) tools/compatibility/rehearse.mjs \
		--verify-run acceptance/runs/m13-03.json \
		--verify-markdown acceptance/runs/m13-03.md
	$(BUN) tools/integrity/check.mjs

byte-compile:
	EMACS="$(EMACS)" ./tools/ci/strict-byte-compile.sh
