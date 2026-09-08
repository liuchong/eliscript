# Eliscript 1.0 Acceptance Report

- Source commit: `a33c2f8a22d37be8ca28ee74ed9823d66b993161`
- Source tree: `aeffcd743d37cb00ba300a9acb7cc2c72a65e3d6`
- Contract: `contracts/final-acceptance.json` (`fc7760bdccc644b014b3513e4020f3647e3128e54676481d1515504967f2651d`)
- Generated: 2026-09-08T22:28:49.035Z
- Environment: Darwin 25.6.0; arm64; Bun 1.4.0; Node v26.8.1; Emacs 31.1
- Corpus complete: yes
- Operational success: yes
- Evidence complete: yes
- Blocking defects: 0
- Final acceptance: not reached

This is the canonical candidate report. It does not declare Eliscript 1.0 accepted while mandatory criteria remain incomplete.

## Mandatory Criteria

Results: 25 pass, 10 incomplete, 0 fail, 35 total.

| Criterion | Result | Declared state | Remaining work |
| --- | --- | --- | --- |
| AC-01 Stable specification coverage | incomplete | partial | Promote every final public language and core library contract to stable with complete evidence. |
| AC-02 Stable corpus compatibility | incomplete | partial | Promote the final provisional core feature, regenerate the stable corpus, and execute one clean retained run. |
| AC-03 Deterministic diagnostics | pass | complete | - |
| AC-04 Reproducible fixed point | incomplete | partial | Record the final fixed point on every required matrix cell in one acceptance run. |
| AC-05 Compiler parity | pass | complete | - |
| AC-06 Self-hosted authority | pass | complete | - |
| AC-07 Repeated determinism | pass | complete | - |
| AC-08 Clean project workflow | pass | complete | - |
| AC-09 Correct incremental builds | pass | complete | - |
| AC-10 Host portability | incomplete | partial | Run the final stable corpus and core CLI fixtures on every supported Bun and Node host. |
| AC-11 Formatter | pass | complete | - |
| AC-12 Emacs mode | incomplete | partial | Close the complete maintained mode suite on Emacs 29 and 30 in the final matrix. |
| AC-13 Interactive evaluation | incomplete | partial | Close documented REPL behavior and restart recovery in the final supported matrix. |
| AC-14 Source-level debugging evidence | pass | complete | - |
| AC-15 Stable library contract | incomplete | partial | Stabilize every core export and close PD-01 through PD-07. |
| AC-16 Worker correctness and recovery | pass | complete | - |
| AC-17 End-to-end performance value | pass | complete | - |
| AC-18 Fuzz robustness | pass | complete | - |
| AC-19 Scale and soak | pass | complete | - |
| AC-20 Boundary security | pass | complete | - |
| AC-21 Supported environment matrix | incomplete | partial | Record the final full suite on all required operating system, Emacs, Bun, and Node cells. |
| AC-22 Documented local onboarding | pass | complete | - |
| AC-23 Complete documentation set | pass | complete | - |
| AC-24 Acceptance audit | incomplete | partial | Produce one clean final acceptance run in which every mandatory criterion passes and no blocking defect remains. |
| PD-01 Persistent Semantics | pass | complete | - |
| PD-02 Vector Structural Bounds | pass | complete | - |
| PD-03 HAMT Structural Bounds | pass | complete | - |
| PD-04 Hash and Equality | pass | complete | - |
| PD-05 Transient Safety | pass | complete | - |
| PD-06 Transformation Efficiency | pass | complete | - |
| PD-07 Host Interop | incomplete | partial | Pass the maintained JavaScript package fixture on the full supported matrix. |
| PD-08 Emacs Codec | pass | complete | - |
| PD-09 Accelerated Operation Correctness | pass | complete | - |
| PD-10 Emacs Performance Reinvestment | pass | complete | - |
| PD-11 State Discipline | pass | complete | - |

## Evidence Summaries

| Group | Complete | Criteria | Artifacts |
| --- | --- | ---: | ---: |
| benchmark | yes | 3 | 2 |
| fuzz | yes | 1 | 1 |
| scale | yes | 4 | 1 |
| soak | yes | 2 | 2 |
| test | yes | 35 | 1 |

## Unresolved Defects

No unresolved defects are recorded.

## Application Validation

| Criterion | Result | Core contribution |
| --- | --- | --- |
| AV-01 Maintained application validation | not-run | no |
| AV-02 Browser publishing validation | not-run | no |

## Commands

| Probe | Command | Result | Exit | Duration (ms) | Output SHA-256 |
| --- | --- | --- | ---: | ---: | --- |
| core-suite | `make test-core` | pass | 0 | 477039.614 | `e55b11a476763db9209f634bc6158f20ab3aa744dbf76fdd587c5d95a3c5b227` |
| strict-byte-compile | `make byte-compile` | pass | 0 | 973.493 | `4110c50ff8be0d96e678ed5ef31967a2aca72a86558181796ef5f14b5a350c3e` |

## Artifact Digests

| File | SHA-256 |
| --- | --- |
| `.github/workflows/compatibility.yml` | `45a2c3941d06adc6d745b4490197beb2a86266fda2685a69a88aeaa6afacfb90` |
| `acceptance/defects.json` | `da4ac30acd7e57ec357e3d30da05c304605d0a2407733137adf1a44f5b137377` |
| `acceptance/manifest.json` | `a573aa34143a75ee0c64290b558e4426b1142db7ff7cb863a11d1dd76cac0330` |
| `acceptance/report.md` | `9f6109a9f86ce6dfc4063b8d6dc730997ffd5df6461e0bd303b4b9abc4a8d33e` |
| `acceptance/runs/m13-02.json` | `de2767587a9c5b2ff4280c7a1005d88274f0dc9f6c327edd89a2944d67053355` |
| `acceptance/runs/m13-04.json` | `47a58aab430e21d26a9fce392283d06bb62b969a90ae5e922307e4dbce58a880` |
| `acceptance/runs/m13-04.md` | `a9b55996a36aab1d86696ec7a1edd4eb63d297060f0c319e959c1c1090e53411` |
| `benchmarks/emacs-analysis-macos-arm64.json` | `e579310afc96d0f102dfb03ede67ce847bedbd2d6a1955ecc720a5fb7da322ba` |
| `benchmarks/transient-builder-macos-arm64.json` | `f8570d5f102076e39dc386dd70b7f725618c693c85683df1f7a455fc9661dd5f` |
| `benchmarks/worker-lifecycle-soak-macos-arm64.json` | `31549c76a27f66b66532d863d16c5b1bbd9151e4dfffa1a6e00c6d7a2d52d009` |
| `benchmarks/worker-value-stream-macos-arm64.json` | `7fdf64d25067722b265d4a4b377e62b87e8b8c678fe15c045c9a5a8876578dd3` |
| `contracts/compatibility-baseline.json` | `2db0534bb231321b4a12ab6a29ff0af91c58e1a678dd80e929b9e7faf42c8e2e` |
| `contracts/compatibility-matrix.json` | `2be33eb441bb5f4969a0e3f157ccae66b35fda6126516befa9e05f08602fe36f` |
| `contracts/compiler-parity-corpus.json` | `bd6cf3f3009210f774d9d9526fab8f2b74c5bbd51392396e37770dc95ce6ffce` |
| `contracts/core-acceptance-corpus.json` | `146a17c9d55c734ec9308cc3ccb5e7b9f2fac72aec961a72e1f9d5328c0fb26c` |
| `contracts/diagnostic-corpus.json` | `f5bc17986e4e202f2539298da2b8b2fce9ee6083a0dff0d2c8a802988172471a` |
| `contracts/documentation.json` | `20002296c8b66e308fea9fd41dc3109f66614d4bfc159d0ca9c80a1d4b858042` |
| `contracts/final-acceptance.json` | `fc7760bdccc644b014b3513e4020f3647e3128e54676481d1515504967f2651d` |
| `contracts/library-api.json` | `78e9b2f19cab1f2efd3ce299e15314a48d472bc7a101a730710836a8384269dc` |
| `contracts/maturity-progress.json` | `36a1833eb891b0ce5fab65005dae99f292638b7b89945c9198054645d9923590` |
| `contracts/repository-integrity.json` | `0989ee1da26dc4f338e2c3d90e7ff09bcbbb7a6df54feaaf4ee52a314c7aee10` |
| `contracts/source-debugging-corpus.json` | `db8221df0aad47b9bf287a0dfef9e854830202298c518c0a239c1850ae1674ad` |
| `contracts/stable-compatibility-corpus.json` | `40dc6d34d9d166e270dd2b21faf5522c26eca83815118ecbd451c2731e4dfcdd` |
| `docs/getting-started.md` | `775c151378028f4cb5083de7cbe20e284d3edbbbffed774670f0050726fc70db` |
| `editor/eliscript-mode.el` | `ecaa7f3cc14fdd7d2a3e790e869cb3caa5bd863bba5cc0f5c17671882d0a37ab` |
| `specs/0009-source-maps.md` | `b994a807c679b6b830d384e3dd212b40da5066526a3ed480a7d0f81b80a622d0` |
| `specs/0019-self-hosted-compiler.md` | `760654f8dfa5bbfd3ff2777110576ea2d5f88eed8b42f6c77873ebe8df8fbe89` |
| `specs/0040-maturity-roadmap.md` | `79a2153b8faf3d289dc7ba1df8eeab8da6eca1d18a89e501245b47f1e393258c` |
| `specs/0041-host-symbiosis-and-persistent-data.md` | `5a64629dec8c089f0e03ad6c4e5a2fa5f70e9fe38dac96cee50a6a28071375c3` |
| `specs/0043-structured-diagnostics.md` | `288e2ff2bf5c67772b659de6c09bce340fa3374086185234cdedb57f5af9a6ff` |
| `specs/0048-value-equality-and-hashing.md` | `24a0af01851c450e8cf500eb5d39e067cf8ee92f52021189b0e7b0879532000a` |
| `specs/0072-atomic-state-references.md` | `b143f1cb604a85a78d80665a649ef68443101e87bc3bded03823ce4ecbadb22c` |
| `specs/0073-native-javascript-container-interop.md` | `9f8fa459e3529579ec7590bc6fdda480efb9f68a3dc9a30670b3472366283d2d` |
| `specs/0078-persistent-collection-core-exit-audit.md` | `ced21c3357b88396ce96a6e6cafbd209ae338e15edebf305b52a0b2c082586c6` |
| `specs/0093-static-transient-ownership-analysis.md` | `078922f8760c891ea2cff4a4923c82012b09f822b941be1400ddd761feb7f2ea` |
| `specs/0104-accelerated-emacs-operation-service.md` | `46b6048ca3520ee46bd7628ab693a827ad138db6cff034d00e9fc9e6173c81e4` |
| `specs/0105-emacs-analysis-performance-reinvestment.md` | `daace718cb416becb271515aa3966ca9c84f3fe3f619a8691f1c5392989e676d` |
| `specs/0112-unified-self-hosted-build-operation.md` | `630f833550f6fa92b5a1a712ceaf547b6a65e2241efb2c1510270dadcf121fb6` |
| `specs/0114-deterministic-concrete-syntax-formatter.md` | `1e3cb72b7b37ec71de7549f3933094b1f813c3c0f1f50d9a0aee88ec43514e8d` |
| `specs/0120-interactive-terminal-repl.md` | `98dbbd9b07f5b817f66f973ef2b61c750e2a2f7c149f2816bacf9f541beed6c7` |
| `specs/0127-deterministic-reader-program-fuzz.md` | `930a691e3545650b31949a9be7aa4f43266ce15e701da4d26814be9eb03dc037` |
| `specs/0128-project-scale-invalidation.md` | `1e0c82302ae0221a95d5f5f121dbff646599f7ee70c5c1deb3c44d065de1cb78` |
| `specs/0130-hostile-boundary-security.md` | `d1d192a2ef1b3000ab37c252de2e81f184c042f1ace5603bba36369470728b9b` |
| `specs/0135-local-onboarding.md` | `37f68fc449b61a2ab90b082f012a433a1808ced117ac7364bb32991a059f7480` |
| `specs/0139-deterministic-persistent-semantics-corpus.md` | `7baf091143a269eddbf81cf74b85240d7cbf65cf9db23a927e1d25e9dd17911a` |
| `specs/0140-clean-configured-project-workflow.md` | `3884ec9bfc18a8da6df2bcdbaab7f7f17e96f7aad37be388b194c03547fa1af9` |
| `specs/0141-repeated-core-determinism.md` | `0d87814a7ad8f601aeff595e310a5cf304c58619cf536259705a252a9ad87ebe` |
| `specs/0142-maintained-javascript-package-interop.md` | `964106e7c60ed3e36bb31aa0207e6c5d421cef7ba9b1a721ca20aedad29de99e` |
| `specs/0143-complete-negative-diagnostic-corpus.md` | `15dbca346655c96077c7544daeb73cb4e15049207b777d81aeb68b02d4ff5fdd` |
| `specs/0144-source-level-failure-mapping.md` | `c3d5531b9bede4737c50e8bee16bec1e530f2c9bc64ea0990631b4043c18fcc3` |
| `specs/0146-complete-compiler-parity-corpus.md` | `7edc6ca3a29a78533b1f2c234b77fea471643200009f541f5e38f4ba96c7cb0a` |
| `specs/0147-complete-stable-compatibility-corpus.md` | `e09e3818ede486f58423927e1814bcc81580c8f64fcb3cbc1ceabec469954fb0` |
| `specs/index.json` | `d9c4a7f19cfc84ad7f9d1aa9aa9ecbd223fc560a59354d85a6bf98b929c67c1b` |
| `tests/api-index.test.mjs` | `2d0c51496090f0696ec5b2dd921326ab8d7c8a6dcf0ba1bd113818ffcdca8c24` |
| `tests/atom.test.mjs` | `1403c404bf1c49c2532899a3ffe306536cf2affc7400d08d785439a9d5dcc296` |
| `tests/bootstrap-analyzer.test.mjs` | `ac2bfaaa29531eb6addab3a526a32b64d4981bba825033204d16703259961287` |
| `tests/bootstrap-compiler.test.mjs` | `fc072334d7731a22def9ec94ab2c13fce43791642da0304ecd2c062e58ab06dc` |
| `tests/bootstrap-emitter.test.mjs` | `bc037864bd2389d17b906033d2b474a53fd07ae1074108a74cd338cd744197ca` |
| `tests/bootstrap-evaluation.test.mjs` | `08db27a96004401e3085387eb3d959f79e87317f9e67f449bed98faae29052c0` |
| `tests/bootstrap-expander.test.mjs` | `f4dc1556352e4e247677a316440e2d2f725a7fb608f7835c9e1e611b6e9d4d2a` |
| `tests/bootstrap-formatter.test.mjs` | `eca99f473e1e83384c078b13e3c4e33a1e32ba00752e086afdbc86b71361f85e` |
| `tests/bootstrap-ir.test.mjs` | `049355f3ed1766d4e01e08e4a951e59fc700b6e1b6c7e12c64c3b602fe537265` |
| `tests/bootstrap-project.test.mjs` | `4e7e0b217e2c0655acd266190ca1c7f15960170d6efb62579281976479dd4a8c` |
| `tests/bootstrap-reader.test.mjs` | `e079d6fe6d0731f1f569804ca38810afdd81450be0fe815631a4efe045de1941` |
| `tests/boundary-security.test.mjs` | `1d63fcc782b15b8a72c451fc5354b457945779ef0882b5b11856cfe6f9be3650` |
| `tests/ci-contract.test.mjs` | `2290a09fd7fc81305e5781f29491a53310c59a9b8cd133e2bc537688b78e5f17` |
| `tests/clean-project-workflow.test.mjs` | `082b8d3262faab8f70e63305dddff63f8bb69d9da9ed6eedb97f7ab21d44ee45` |
| `tests/compiler-parity-corpus.test.mjs` | `20bee8a2c8fff2dbbdf8ed4db70778116bc51b041733dba4e5aaf56a4cfb995f` |
| `tests/conformance.test.mjs` | `261db059f0de49ab8c8f6d5804da0f9aada12f204c0d79344a37c99e67cd92ef` |
| `tests/conformance/manifest.json` | `749dad88567a1ace0922cb2d2f02eeca46e12b0acec3b3e6649cf77f37af1dc6` |
| `tests/core-stdlib.test.mjs` | `d2f763df66221f8b540e1c89f43e65b6762725bd25f3966da17f7ed83cafe539` |
| `tests/diagnostic-corpus.test.mjs` | `4a5b06adc53786e881fab48e72c39a09737d4a3a0cfd7b4fd7b80f1c20980fdd` |
| `tests/eliscript-mode-tests.el` | `5e7e22d28c8cf6472cb80778fd8790df2a6963b457ef5300ce4b984b068791e9` |
| `tests/eliscript-repl-tests.el` | `68f9f92967aabcf26ef9bd2d605368f5df062e524698dd031407c2ca783ac54e` |
| `tests/emacs-analysis-evidence.test.mjs` | `17b1f280f4df04d1cfd2a6f9c35f1e89a04c9189fb38ff3294c97596050e3d57` |
| `tests/esm-imports.test.mjs` | `73db20c832401a1930f6d4e686f0fd9d28a2553bf6ad25f3ea3cc8bee55c2d5f` |
| `tests/final-acceptance.test.mjs` | `5c6429730fdc688beb9abb62db94c57e270215d70c18b833a31fdfd78e78a305` |
| `tests/format-cli-test.sh` | `21cfbe2fd3de2fd908e5bfb01c9e3f8fa874c6b0e6d3c6b4539e4532567a6999` |
| `tests/interop-js.test.mjs` | `f76f8aeb7ca895b44732a6c07716ee5cf6657023cbf6bc6e28c7583db65d35f0` |
| `tests/interop-package.test.mjs` | `627c58c1da19108b2828f32cce99cd325937aa70709b4b6121566bb858c12c94` |
| `tests/local-onboarding.test.mjs` | `759ccfa512954e46ca1743f99e9d1f28cbdaffe5933c82546e48a6b1f7f2d099` |
| `tests/onboarding-docs.test.mjs` | `160415e5929e25b4543ecbae62b3d748f23532d398a443be87d97cfd8869dcb7` |
| `tests/persistent-core-exit.test.mjs` | `5d11be51f0a16955444cc3b602b50b045222e2d93b5629bd8883d0d6ef45332f` |
| `tests/persistent-list.test.mjs` | `d5984bb76486e4dd62fa1014b57e5b9112a533920f8172a07b6ab13d07173ed1` |
| `tests/persistent-map.test.mjs` | `9fe586b9d5a490b3dad9cc05a047ea2ca8110c29228fe45232ec43058dd4315f` |
| `tests/persistent-semantics.test.mjs` | `bebd91e0a061c2e73d14f9e4847b8f389ccf53f11d3a92fa24f933bdf1def413` |
| `tests/persistent-set.test.mjs` | `8441b04e8b0537882d0c2f3c14a721b5e1ab7f5bb03090de1a372036c3193af0` |
| `tests/persistent-vector.test.mjs` | `2b041cc00f1c55d84ec051f9e8f33e71f30c4d74532b7e477b615afb50c21bb2` |
| `tests/project-cli-test.sh` | `8ae6ed64eec2426316ae2df6d615febe80916fc48e1231eb5cd9324011b638ad` |
| `tests/project-scale.test.mjs` | `99a42aedd7c492c2d4879be162b971975cb82a4c4fd98b5a7a7a6aae773101fb` |
| `tests/reader-program-fuzz.test.mjs` | `c568f59570a55e4b95fd75833ee262a042bb285bc113fee6ba6ab8eec1a6424e` |
| `tests/repeated-determinism.test.mjs` | `eb3f2ef5a43bfbcab9615b8c5ff31c85d09092a8f58c1f895ca56692787838ce` |
| `tests/source-debugging.test.mjs` | `8eb14ca45564e54d1874bd04a791f1d5ca89cfff72a4c0f07c82b2d00dee8ca7` |
| `tests/stable-compatibility-corpus.test.mjs` | `cc4f77fee1bc1e535219cb9cdfdd0affb2cd171daaeb53eb8df2a4c0e8250bc2` |
| `tests/transducer.test.mjs` | `a27c55993532f7266d56c3d05a869df4d74ffad5669b15f8e29e9a81fc5f42fc` |
| `tests/transient-builder-benchmark.test.mjs` | `e1022dab110a6eee6a3e196da73c29aee89494e1908b03e41a4909cc1e4e64d8` |
| `tests/transient.test.mjs` | `92571f68ce457c35f8a95cbebad0a464ee445c14283831760aac9d8af77a26af` |
| `tests/value-semantics.test.mjs` | `b93063dd3e8a0dfe657240c6aea8039104d5e8103038c7f1955ae9361483e901` |
| `tests/watch.test.mjs` | `241c2117f6e1856e5afb0dbea9135d92d5d7895bc6cd3b84dd66fb73b7ca407a` |
| `tests/worker-lifecycle-soak.test.mjs` | `c4e38de152c6f3692ccd09797ed3f38cc1f4465b46a61d1445b332aa2e305f05` |
| `tests/worker-runtime.test.mjs` | `010f974d380e9aa0103b6dbb2ed31ed00f212c6196c1870449ec2cfb29d463b1` |
| `tests/worker-value-stream-probe.test.mjs` | `19dac4fabbf7878afbaef9120bb91a5e3c413fd706fc65e4c7d0f5e6930c30b0` |
| `tools/acceptance/finalize.mjs` | `924c7070c64267085f7123c755efcefb084e4ac6050afd19d74ee576751713e6` |
| `tools/collections/persistent-semantics.mjs` | `fc86ef0866cd180afbede79d4dfdd6c3ef25b6e4ee633f066e70916f194d853c` |
| `tools/compatibility/corpus.mjs` | `7d59843ed4f0d078475cdefc9ba4ed5bba2599f6afb158cfd7b6313915d9bea2` |
| `tools/debugging/check.mjs` | `a6fdaad34fcae0e84296f5ba463aa34fe867220c88ac072ea6109afd3678e38e` |
| `tools/diagnostics/check.mjs` | `6d6cb9e65ca59628c60459397b86d77f426b44755f3a5bc1334f2ed0ea43b2dc` |
| `tools/documentation/check.mjs` | `eb19276b62b18c4d8aaa443b97ec5a9252bfd4d0acc744c5762aedcac9bc6447` |
| `tools/integrity/check.mjs` | `12377912218cf242deb8b406cd59cc87afe127dd2a636eafabf2177bbf3a2b39` |
| `tools/parity/check.mjs` | `af999fdfdae13627293cdda495bebc9968d0d0c40c32867280df57626d6327c0` |
