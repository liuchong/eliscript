EMACS ?= emacs
BUN ?= bun
NODE ?= node
BUN_TEST_RUNNER ?= tools/testing/final-functional-scope.mjs
ELISCRIPT_JS_RUNTIME ?= $(shell command -v node)
BOOTSTRAP_RELEASE_OUT ?= dist/bootstrap-release
BOOTSTRAP_RELEASE_MANIFEST ?= $(BOOTSTRAP_RELEASE_OUT)/bootstrap.json
NATIVE_TARGET ?= $(if $(filter Linux,$(shell uname -s)),arm64-linux,arm64-macos)
STAGE3_FUNCTIONAL_RUNTIME_PROFILE ?=
STAGE3_FUNCTIONAL_RUNTIME_OPTION = $(if $(strip $(STAGE3_FUNCTIONAL_RUNTIME_PROFILE)),--functional-runtime-profile $(STAGE3_FUNCTIONAL_RUNTIME_PROFILE),)

.PHONY: bootstrap-release verify-bootstrap check-stage3-targets prepare-release-package compiler-release-ci check-release-workflow

# All compiler hosts in this release are JavaScript. Binary targets below are
# generated user programs, never alternative compiler hosts.
bootstrap-release: bootstrap-backends
	ELISCRIPT_JS_RUNTIME="$(ELISCRIPT_JS_RUNTIME)" $(EMACS) --batch -Q -l tools/backends/bootstrap.el --stage0 --output "$(BOOTSTRAP_RELEASE_OUT)/stage0"
	$(NODE) tools/backends/dist/release-cli.mjs bootstrap --stage0-manifest "$(BOOTSTRAP_RELEASE_OUT)/stage0/stage0.json" --output "$(BOOTSTRAP_RELEASE_OUT)"

# Recheck an existing complete product closure without rebuilding or preparing it.
verify-bootstrap:
	@$(NODE) tools/backends/dist/release-cli.mjs verify-bootstrap --bootstrap-manifest "$(BOOTSTRAP_RELEASE_MANIFEST)"

# Deliberately does not rebuild an already authenticated four-stage chain.
check-stage3-targets: prepare-release-package
	$(NODE) tools/backends/dist/release-cli.mjs targets --bootstrap-manifest "$(BOOTSTRAP_RELEASE_MANIFEST)" --output "$(BOOTSTRAP_RELEASE_OUT)/targets" --native-target "$(NATIVE_TARGET)" $(STAGE3_FUNCTIONAL_RUNTIME_OPTION)

prepare-release-package:
	$(NODE) tools/backends/dist/release-cli.mjs prepare-release-package --bootstrap-manifest "$(BOOTSTRAP_RELEASE_MANIFEST)"
	$(BUN) run build:browser

check-release-workflow:
	$(NODE) tools/ci/dist/compiler-release.mjs --check

compiler-release-ci: bootstrap-release
	$(MAKE) verify-bootstrap
	$(NODE) tools/ci/dist/compiler-release.mjs --check
	$(NODE) --test tests/bootstrap-js-stages-selfhosted.test.mjs tests/stage3-targets-selfhosted.test.mjs tests/bootstrap-release-integration-selfhosted.test.mjs
	$(MAKE) check-stage3-targets STAGE3_FUNCTIONAL_RUNTIME_PROFILE=small
	# Reuse the already generated and authenticated cohort. Rebuilding here
	# would replace the installed stage3 runtime with an Emacs bootstrap product.
	ELISCRIPT_SEQUENCE_FUNCTIONAL_RUNTIME_PROFILE=small ELISCRIPT_DEFER_PERFORMANCE_ACCEPTANCE=1 $(MAKE) --assume-old=bootstrap-backends test

.PHONY: test test-core test-applications check-contracts byte-compile bootstrap-backends
test: test-core test-applications

test-core: check-contracts
	$(EMACS) --batch -Q -L compiler -L editor -L tools/org -L tools/worker -L tests \
		-l tests/eliscript-tests.el \
		-l tests/eliscript-analyzer-depth-tests.el \
		-l tests/eliscript-lower-depth-tests.el \
		-l tests/eliscript-emitter-depth-tests.el \
		-l tests/eliscript-emitted-alias-tests.el \
		-l tests/eliscript-ir-await-cache-tests.el \
		-l tests/eliscript-reader-preprocess-tests.el \
		-l tests/eliscript-number-spelling-tests.el \
		-l tests/eliscript-transient-depth-tests.el \
		-l tests/eliscript-portable-depth-tests.el \
		-l tests/eliscript-evaluation-tests.el \
		-l tests/eliscript-project-tests.el \
		-l tests/eliscript-mode-tests.el \
		-l tests/eliscript-repl-tests.el \
		-l tests/eliscript-worker-tests.el \
		-l tests/eliscript-service-tests.el \
		-l tests/eliscript-analysis-tests.el \
		-l tests/bootstrap-tests.el \
		-f ert-run-tests-batch-and-exit
	$(BUN) $(BUN_TEST_RUNNER) ./tests/conformance.test.mjs ./tests/compiler-parity-corpus.test.mjs \
		./tests/stable-compatibility-corpus.test.mjs \
		./tests/public-surface.test.mjs \
		./tests/api-index.test.mjs \
		./tests/pages-site.test.mjs \
		./tests/dogfood-specs.test.mjs \
		./tests/compatibility-rehearsal.test.mjs \
		./tests/onboarding-docs.test.mjs \
		./tests/clean-project-workflow.test.mjs \
		./tests/local-onboarding.test.mjs \
		./tests/test-partition.test.mjs \
		./tests/repository-integrity.test.mjs \
		./tests/repository-integrity-test-legacy.mjs \
		./tests/package-surface.test.mjs \
		./tests/platform-capabilities.test.mjs \
		./tests/reader-program-fuzz.test.mjs \
		./tests/reader-program-fuzz-runtime-selfhosted.test.mjs \
		./tests/persistent-semantics.test.mjs \
		./tests/project-scale.test.mjs \
		./tests/core-performance-benchmark.test.mjs \
		./tests/performance-acceptance-mode.test.mjs \
		./tests/maturity-progress.test.mjs \
		./tests/diagnostic-corpus.test.mjs \
		./tests/source-debugging.test.mjs \
		./tests/core-acceptance-corpus.test.mjs \
		./tests/repeated-determinism.test.mjs \
		./tests/final-acceptance.test.mjs \
		./tests/retained-soak-refresh.test.mjs \
		./tests/retained-transient-refresh.test.mjs \
		./tests/retained-performance-deferral.test.mjs \
		./tests/bootstrap-seed-batch.test.mjs \
		./tests/seed-symbol-reservation.test.mjs \
		./tests/esm-imports.test.mjs \
		./tests/ci-contract.test.mjs \
		./tests/file-workers-selfhosted.test.mjs \
		./tests/test-resource-supervisor.test.mjs \
		./tests/local-compatibility-matrix.test.mjs \
		./tests/collection-layout-benchmark.test.mjs \
		./tests/transient-builder-benchmark.test.mjs \
		./tests/bootstrap-symbol.test.mjs ./tests/bootstrap-reader.test.mjs \
		./tests/bootstrap-formatter.test.mjs \
		./tests/bootstrap-expander.test.mjs ./tests/bootstrap-analyzer.test.mjs \
		./tests/bootstrap-ir.test.mjs ./tests/bootstrap-ir-serialization.test.mjs \
		./tests/bootstrap-emitter.test.mjs \
		./tests/compiler-ir-kind.test.mjs \
		./tests/compiler-indent.test.mjs \
		./tests/compiler-locate.test.mjs \
		./tests/compiler-binary-comparison.test.mjs \
		./tests/compiler-js-codegen.test.mjs \
		./tests/compiler-artifact-archive.test.mjs \
		./tests/compiler-source-archive-streaming.test.mjs \
		./tests/compiler-matrix-original-gates.test.mjs \
		./tests/compiler-corpus-arguments.test.mjs \
		./tests/compiler-corpus-f64-replay.test.mjs \
		./tests/compiler-corpus-source-archive.test.mjs \
		./tests/compiler-corpus-tools-artifact-adapters.test.mjs \
		./tests/compiler-matrix-snapshot.test.mjs \
		./tests/compiler-corpus-source-sharing.test.mjs \
		./tests/compiler-metadata-codec.test.mjs \
		./tests/compiler-sha256.test.mjs \
		./tests/compiler-worker-identities.test.mjs \
		./tests/compiler-ir-validation.test.mjs \
		./tests/compiler-ir-session-ingress.test.mjs \
		./tests/compiler-ir-arity-diagnostics.test.mjs \
		./tests/compiler-corpus-json-patch.test.mjs \
		./tests/compiler-package-session.test.mjs \
		./tests/compiler-session-tools.test.mjs \
		./tests/compiler-session-error-transport.test.mjs \
		./tests/compiler-build-selfhosted.test.mjs \
		./tests/compiler-matrix-archive-debug-selfhosted.test.mjs \
		./tests/compiler-corpus-host-tool-projection-selfhosted.test.mjs \
		./tests/emitter-tdz-seed-parity-selfhosted.test.mjs \
		./tests/compiler-tools-source-identity.test.mjs \
		./tests/wire-error-report-selfhosted.test.mjs \
		./tests/compiler-corpus-project-entry-selfhosted.test.mjs \
		./tests/compiler-seed-runtime-identity.test.mjs \
		./tests/managed-root-lifetimes-selfhosted.test.mjs \
		./tests/managed-project-initializers-selfhosted.test.mjs \
		./tests/managed-project-prepare-roots.test.mjs \
		./tests/managed-project-zero-imports-selfhosted.test.mjs \
		./tests/wasm-managed-language-intrinsics.test.mjs \
		./tests/wasm-managed-apply.test.mjs \
		./tests/compiler-corpus-exports-selfhosted.test.mjs \
		./tests/compiler-cli-corpus-selfhosted.test.mjs \
		./tests/compiler-core-project-corpus-selfhosted.test.mjs \
		./tests/run-artifact-selfhosted.test.mjs \
		./tests/record-grid-selfhosted.test.mjs \
		./tests/compiler-literal-corpus-selfhosted.test.mjs \
		./tests/compiler-error-transport.test.mjs \
		./tests/compiler-browser-session.test.mjs \
		./tests/direct-wasm-backend.test.mjs \
		./tests/wasm-memory-runtime.test.mjs \
		./tests/wasm-memory-allocator.test.mjs \
		./tests/wasm-managed-function-description.test.mjs \
		./tests/wasm-memory-cond.test.mjs \
		./tests/wasm-memory-f64-literal.test.mjs \
		./tests/wasm-memory-f64-unary.test.mjs \
		./tests/wasm-memory-static-data.test.mjs \
		./tests/native-memory-data-copy.test.mjs \
		./tests/native-memory-local-addressing.test.mjs \
		./tests/native-binary-chunks.test.mjs \
		./tests/wasm-binary-chunks.test.mjs \
		./tests/compiler-response-events.test.mjs \
		./tests/compiler-owned-build-consumption.test.mjs \
		./tests/compiler-seed-native-fresh.test.mjs \
		./tests/compiler-backend-frontend.test.mjs \
		./tests/wasm-managed-runtime.test.mjs \
		./tests/wasm-managed-temporary-roots.test.mjs \
		./tests/wasm-managed-temporary-root-cleanup.test.mjs \
		./tests/wasm-managed-debug-options.test.mjs \
		./tests/native-memory-debug-options.test.mjs \
		./tests/wasm-managed-tables.test.mjs \
		./tests/wasm-managed-source-collections.test.mjs \
		./tests/wasm-managed-collection-for-each.test.mjs \
		./tests/wasm-managed-control.test.mjs \
		./tests/wasm-managed-persistent-literals.test.mjs \
		./tests/wasm-managed-transient-state.test.mjs \
		./tests/wasm-managed-core-modules.test.mjs \
	./tests/wasm-managed-wire.test.mjs \
	./tests/wasm-managed-sorted-core.test.mjs \
	./tests/wasm-managed-sequence-data.test.mjs \
		./tests/wasm-managed-empty-bindings.test.mjs \
		./tests/wasm-managed-callables.test.mjs \
		./tests/wasm-managed-native-prototype-callables.test.mjs \
		./tests/wasm-managed-realm-lifetime.test.mjs \
		./tests/wasm-managed-exceptions.test.mjs \
		./tests/wasm-managed-catch-destructuring.test.mjs \
		./tests/wasm-managed-symbols.test.mjs \
		./tests/wasm-managed-exceptions-browser.test.mjs \
		./tests/wasm-managed-iteration.test.mjs \
		./tests/wasm-managed-primitive-properties.test.mjs \
		./tests/wasm-managed-str.test.mjs \
		./tests/wasm-managed-array-inheritance.test.mjs \
		./tests/wasm-managed-array-prototype-methods.test.mjs \
		./tests/wasm-managed-array-index-storage.test.mjs \
		./tests/wasm-managed-template-string.test.mjs \
		./tests/wasm-managed-variadic-calls.test.mjs \
		./tests/wasm-managed-array-callbacks.test.mjs \
		./tests/wasm-managed-array-splice.test.mjs \
		./tests/wasm-managed-array-sort.test.mjs \
		./tests/wasm-managed-array-text.test.mjs \
		./tests/js-array-text-fast-path.test.mjs \
		./tests/compiler-js-array-text-call.test.mjs \
		./tests/wasm-managed-concat.test.mjs \
		./tests/wasm-managed-typeof.test.mjs \
		./tests/wasm-managed-typeof-paths.test.mjs \
		./tests/backend-cli-isolation.test.mjs \
		./tests/wasm-managed-behavior.test.mjs \
		./tests/wasm-managed-module-bindings.test.mjs \
		./tests/wasm-managed-project-linking.test.mjs \
		./tests/wasm-managed-arithmetic.test.mjs \
		./tests/wasm-managed-operand-conversion.test.mjs \
		./tests/wasm-managed-word.test.mjs \
		./tests/wasm-managed-float64-words.test.mjs \
		./tests/wasm-managed-string-code-unit.test.mjs \
		./tests/wasm-managed-arrays.test.mjs \
		./tests/wasm-managed-objects.test.mjs \
		./tests/wasm-managed-strings.test.mjs \
		./tests/wasm-managed-replacement.test.mjs \
		./tests/wasm-managed-text-constructors.test.mjs \
		./tests/wasm-managed-regexp.test.mjs \
		./tests/wasm-managed-regexp-indices.test.mjs \
		./tests/wasm-managed-regexp-unicode-sets.test.mjs \
		./tests/wasm-managed-regexp-property-data.test.mjs \
		./tests/wasm-managed-regexp-exact.test.mjs \
		./tests/regexp-property-outlining.test.mjs \
		./tests/unicode-property-generation.test.mjs \
		./tests/wasm-managed-builtins.test.mjs \
		./tests/wasm-managed-identity.test.mjs \
		./tests/wasm-managed-host-identity.test.mjs \
		./tests/wasm-managed-project-sharing.test.mjs \
		./tests/wasm-managed-initializer-outlining.test.mjs \
		./tests/native-managed-initializer-outlining.test.mjs \
		./tests/wasm-managed-host-identity-runtime.test.mjs \
		./tests/wasm-managed-function-properties-runtime.test.mjs \
		./tests/wasm-managed-primitive-own-runtime.test.mjs \
		./tests/wasm-managed-function-properties.test.mjs \
		./tests/wasm-managed-object-integrity.test.mjs \
		./tests/wasm-managed-array-search.test.mjs \
		./tests/wasm-managed-array-construction.test.mjs \
		./tests/wasm-managed-js-cons.test.mjs \
		./tests/managed-persistent-vector.test.mjs \
		./tests/managed-stdlib-value-json.test.mjs \
		./tests/wasm-managed-object-properties.test.mjs \
		./tests/wasm-managed-reflection-descriptor.test.mjs \
		./tests/wasm-managed-math.test.mjs \
		./tests/wasm-managed-math-transcendental.test.mjs \
		./tests/wasm-managed-json.test.mjs \
		./tests/wasm-managed-json-callbacks.test.mjs \
		./tests/wasm-managed-json-atoms.test.mjs \
		./tests/wasm-managed-gc-batch.test.mjs \
		./tests/wasm-managed-number-conversion.test.mjs \
		./tests/wasm-managed-number-text.test.mjs \
		./tests/wasm-managed-text-format.test.mjs \
		./tests/wasm-managed-primitive-operators.test.mjs \
		./tests/wasm-managed-js-truth.test.mjs \
		./tests/native-backend.test.mjs \
		./tests/native-memory-backend.test.mjs \
		./tests/native-node-memory.test.mjs \
		./tests/native-memory-long-branches.test.mjs \
		./tests/native-memory-indirect.test.mjs \
		./tests/native-managed-runtime.test.mjs \
		./tests/native-managed-temporary-roots.test.mjs \
		./tests/native-managed-behavior.test.mjs \
		./tests/compiler-reader-character.test.mjs \
		./tests/compiler-source-map-cursor.test.mjs \
		./tests/compiler-portable-predicates.test.mjs \
		./tests/compiler-portable-reader.test.mjs \
		./tests/compiler-seed-negative-zero.test.mjs \
		./tests/compiler-internal-string-order.test.mjs \
		./tests/compiler-portable-emitter.test.mjs \
		./tests/compiler-fragment-combine.test.mjs \
		./tests/compiler-source-map-vlq.test.mjs \
		./tests/compiler-portable-errors.test.mjs \
		./tests/compiler-portable-guards.test.mjs \
		./tests/compiler-js-control-context.test.mjs \
		./tests/bootstrap-compiler.test.mjs ./tests/bootstrap-project.test.mjs \
		./tests/bootstrap-evaluation.test.mjs \
		./tests/watch.test.mjs \
		./tests/loop-recur.test.mjs \
		./tests/macro-generated-names.test.mjs \
		./tests/macro-file-dependencies.test.mjs \
		./tests/boundary-security.test.mjs \
		./tests/worker-runtime.test.mjs \
		./tests/worker-value-codec.test.mjs \
		./tests/worker-value-stream.test.mjs \
		./tests/worker-value-stream-probe.test.mjs \
		./tests/worker-lifecycle-soak.test.mjs \
		./tests/worker-benchmark.test.mjs \
		./tests/emacs-analysis-evidence.test.mjs \
		./tests/stdlib-sequence.test.mjs \
		./tests/stdlib-text.test.mjs ./tests/stdlib-object.test.mjs \
		./tests/markdown-wire.test.mjs ./tests/http-rpc.test.mjs ./tests/wire-compiler.test.mjs \
		./tests/stdlib-bit.test.mjs ./tests/stdlib-function.test.mjs \
		./tests/stdlib-deferred.test.mjs \
		./tests/portable-persistent-list.test.mjs \
		./tests/portable-persistent-map.test.mjs \
		./tests/portable-persistent-set.test.mjs \
		./tests/portable-persistent-vector.test.mjs \
		./tests/persistent-core-exit.test.mjs \
		./tests/portable-value-semantics.test.mjs ./tests/portable-metadata.test.mjs \
		./tests/portable-data-text.test.mjs ./tests/portable-result.test.mjs \
		./tests/portable-json.test.mjs ./tests/portable-numeric.test.mjs \
		./tests/atom.test.mjs ./tests/multimethod.test.mjs \
		./tests/declarative-protocol.test.mjs ./tests/declarative-record.test.mjs \
		./tests/declarative-type.test.mjs \
		./tests/value-dispatch.test.mjs ./tests/multi-arity.test.mjs \
		./tests/local-recursive-functions.test.mjs \
		./tests/persistent-tree-walk.test.mjs \
		./tests/persistent-zipper.test.mjs \
		./tests/persistent-sorted.test.mjs \
		./tests/lazy-sequence.test.mjs \
		./tests/regex.test.mjs \
		./tests/core-expression-forms.test.mjs \
		./tests/interop-js.test.mjs \
		./tests/interop-package.test.mjs \
		./tests/identifier.test.mjs ./tests/metadata.test.mjs \
		./tests/data-text.test.mjs \
		./tests/protocol.test.mjs ./tests/eliscript-protocol.test.mjs \
		./tests/collection-protocol.test.mjs \
		./tests/core-text-object.test.mjs \
		./tests/literal-runtime.test.mjs \
		./tests/language-equality.test.mjs \
		./tests/transducer.test.mjs ./tests/transient.test.mjs \
		./tests/core-order.test.mjs \
		./tests/core-set.test.mjs \
		./tests/core-stdlib.test.mjs \
		./tests/persistent-list.test.mjs ./tests/persistent-queue.test.mjs ./tests/persistent-vector.test.mjs ./tests/value-semantics.test.mjs \
		./tests/persistent-map.test.mjs ./tests/persistent-set.test.mjs \
		./tests/record.test.mjs ./tests/type.test.mjs
	$(NODE) --test ./tests/compiler-session-protocol-selfhosted.test.mjs ./tests/compiler-matrix-selfhosted.test.mjs ./tests/managed-module-graph-selfhosted.test.mjs ./tests/compiler-corpus-managed-adapters-selfhosted.test.mjs \
		./tests/compiler-host-scope-selfhosted.test.mjs \
		./tests/managed-host-selfhosted.test.mjs \
		./tests/managed-host-lifecycle-selfhosted.test.mjs \
		./tests/managed-foreign-binding-selfhosted.test.mjs \
		./tests/managed-protocol-dispatch-selfhosted.test.mjs \
		./tests/managed-source-view-refresh-selfhosted.test.mjs \
		./tests/managed-source-view-decode-selfhosted.test.mjs \
		./tests/compiler-corpus-literal-provider-selfhosted.test.mjs \
		./tests/compiler-corpus-implicit-resources-selfhosted.test.mjs \
		./tests/compiler-corpus-tools-cli-selfhosted.test.mjs \
		./tests/compiler-package-selfhosted.test.mjs \
		./tests/bootstrap-project-runtime-selfhosted.test.mjs \
		./tests/browser-workflow-selfhosted.test.mjs \
		./tests/compiler-runtime-scan-selfhosted.test.mjs \
		./tests/compiler-corpus-host-completion-selfhosted.test.mjs \
		./tests/final-functional-scope-selfhosted.test.mjs \
		./tests/release-package-install-selfhosted.test.mjs \
		./tests/managed-runtime-extended-selfhosted.test.mjs \
		./tests/math-runtime-selfhosted.test.mjs \
		./tests/unicode-case-selfhosted.test.mjs \
		./tests/unicode-default-selfhosted.test.mjs \
		./tests/compiler-matrix-archive-debug-selfhosted.test.mjs \
		./tests/compiler-corpus-host-tool-projection-selfhosted.test.mjs \
		./tests/emitter-tdz-seed-parity-selfhosted.test.mjs \
		./tests/compiler-tools-source-identity.test.mjs \
		./tests/wire-error-report-selfhosted.test.mjs
	PATH="$(dir $(shell command -v $(BUN))):$$PATH" ./tests/cli-test.sh
	PATH="$(dir $(shell command -v $(BUN))):$$PATH" ./tests/project-cli-test.sh
	PATH="$(dir $(shell command -v $(BUN))):$$PATH" ./tests/check-cli-test.sh
	PATH="$(dir $(shell command -v $(BUN))):$$PATH" ./tests/format-cli-test.sh

test-applications:
	$(EMACS) --batch -Q -L tools/org -L tests \
		-l tests/eliscript-org-tests.el \
		-f ert-run-tests-batch-and-exit
	$(BUN) $(BUN_TEST_RUNNER) ./tests/vite-plugin.test.mjs ./tests/org-vite-plugin.test.mjs \
		./tests/dogfood-site.test.mjs ./tests/dogfood-action.test.mjs \
		./tests/dogfood-issues.test.mjs ./tests/dogfood-comments.test.mjs \
		./tests/dogfood-discussions.test.mjs ./tests/dogfood-browser.test.mjs \
		./tests/dogfood-identity.test.mjs ./tests/dogfood-events.test.mjs \
		./tests/dogfood-accessibility.test.mjs ./tests/dogfood-config.test.mjs \
		./tests/dogfood-hybrid.test.mjs ./tests/dogfood-matrix.test.mjs \
		./tests/dogfood-resilience.test.mjs ./tests/dogfood-skip.test.mjs \
		./tests/dogfood-workflow.test.mjs ./tests/browser-matrix.test.mjs \
		./tests/browser-playground.test.mjs ./tests/browser-host.test.mjs \
		./tests/docs-site.test.mjs ./tests/pages-assembly.test.mjs \
		./tests/pages-derived-transports-selfhosted.test.mjs \
		./tests/pages-runtime.test.mjs
	PATH="$(dir $(shell command -v $(BUN))):$$PATH" ./tests/application-cli-test.sh

# The browser matrix drives all three engines, so it is its own target: the
# suite above runs one engine and reports rather than requiring a browser to
# be installed. The report is retained as acceptance evidence.
check-browsers: dogfood
	$(BUN) run check:dogfood:browsers

dogfood:
	$(BUN) run dogfood

bootstrap-backends:
	ELISCRIPT_JS_RUNTIME="$(ELISCRIPT_JS_RUNTIME)" $(EMACS) --batch -Q -l tools/backends/bootstrap.el --tests

check-contracts: bootstrap-backends
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
