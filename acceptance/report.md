# Eliscript 1.0 Acceptance Report

- Source commit: `cee69bd1b810d2d8d6b25cacecf71180cd9ebbec`
- Source tree: `ab38df68596dc76a60bc4d49983ff0f7306bb785`
- Contract: `contracts/final-acceptance.json` (`fc7760bdccc644b014b3513e4020f3647e3128e54676481d1515504967f2651d`)
- Generated: 2026-09-08T12:45:46.351Z
- Environment: Darwin 25.6.0; arm64; Bun 1.4.0; Node v26.8.1; Emacs 31.1
- Corpus complete: yes
- Operational success: yes
- Evidence complete: yes
- Blocking defects: 0
- Final acceptance: not reached

This is the canonical candidate report. It does not declare Eliscript 1.0 accepted while mandatory criteria remain incomplete.

## Mandatory Criteria

Results: 24 pass, 11 incomplete, 0 fail, 35 total.

| Criterion | Result | Declared state | Remaining work |
| --- | --- | --- | --- |
| AC-01 Stable specification coverage | incomplete | partial | Promote every final public language and core library contract to stable with complete evidence. |
| AC-02 Stable corpus compatibility | incomplete | partial | Freeze and execute the complete final compatibility corpus. |
| AC-03 Deterministic diagnostics | pass | complete | - |
| AC-04 Reproducible fixed point | incomplete | partial | Record the final fixed point on every required matrix cell in one acceptance run. |
| AC-05 Compiler parity | incomplete | partial | Close seed and self-hosted parity over the final complete shared corpus. |
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
| core-suite | `make test-core` | pass | 0 | 542713.283 | `7fac84ce73b09b5c7d957464dee7d33eb644b5ecf9c284376fb2363311ae82ae` |
| strict-byte-compile | `make byte-compile` | pass | 0 | 1324.727 | `4110c50ff8be0d96e678ed5ef31967a2aca72a86558181796ef5f14b5a350c3e` |

## Artifact Digests

| File | SHA-256 |
| --- | --- |
| `.github/workflows/compatibility.yml` | `45a2c3941d06adc6d745b4490197beb2a86266fda2685a69a88aeaa6afacfb90` |
| `acceptance/defects.json` | `da4ac30acd7e57ec357e3d30da05c304605d0a2407733137adf1a44f5b137377` |
| `acceptance/manifest.json` | `3db53ed73a9d17d422e344054c56d571c6d9364a9fa94ecd10b8b205bb73a89e` |
| `acceptance/report.md` | `32b92f1b6df81fe58557ed66476fda9babfddb60c1b4663bcd3ea3a798df1993` |
| `acceptance/runs/m13-02.json` | `de2767587a9c5b2ff4280c7a1005d88274f0dc9f6c327edd89a2944d67053355` |
| `acceptance/runs/m13-04.json` | `47a58aab430e21d26a9fce392283d06bb62b969a90ae5e922307e4dbce58a880` |
| `acceptance/runs/m13-04.md` | `a9b55996a36aab1d86696ec7a1edd4eb63d297060f0c319e959c1c1090e53411` |
| `benchmarks/emacs-analysis-macos-arm64.json` | `a8eb2c81f90cca55983e48df9cbcc4aeaf68906aed3cc672ae433b3c99fc7b13` |
| `benchmarks/transient-builder-macos-arm64.json` | `68ac7c6e701d58bd91e491b5eb3008136c9d341512ec3207d1614bcf5ac9f6f7` |
| `benchmarks/worker-lifecycle-soak-macos-arm64.json` | `3f08cdd4ec997b9869439794e6a94ed63e0cc483a0d07d450959ac9abce230a2` |
| `benchmarks/worker-value-stream-macos-arm64.json` | `7fdf64d25067722b265d4a4b377e62b87e8b8c678fe15c045c9a5a8876578dd3` |
| `contracts/compatibility-baseline.json` | `a3635d0b99cb3e69945b1ae9e9037f5d7dab7774307fb13706af34aba75083b2` |
| `contracts/compatibility-matrix.json` | `cb8ef575762f556a13a2ad8113ba56448ea5c14113ca438184e2527ee1eeb38d` |
| `contracts/core-acceptance-corpus.json` | `77fcba9f32672005e177bca353965012bc98816021509b8a4436896cf81e2990` |
| `contracts/diagnostic-corpus.json` | `aa6204f3b444c0fca8f490d0b06555f4bf00f0fdcfc66c9597de62d1af69086d` |
| `contracts/documentation.json` | `20002296c8b66e308fea9fd41dc3109f66614d4bfc159d0ca9c80a1d4b858042` |
| `contracts/final-acceptance.json` | `fc7760bdccc644b014b3513e4020f3647e3128e54676481d1515504967f2651d` |
| `contracts/library-api.json` | `1f18edae2cf3dd55f9f979aa67fad08a23c6875e2836ea96a2aefc0b96277eba` |
| `contracts/maturity-progress.json` | `62d05353f686a19401a811b8e4b97fb3ea183cff8d65baa27ab9598878289557` |
| `contracts/repository-integrity.json` | `409e2fcb359ee6151641206d6203608803ae1e81d381aad89ab97d4781e647b4` |
| `contracts/source-debugging-corpus.json` | `db8221df0aad47b9bf287a0dfef9e854830202298c518c0a239c1850ae1674ad` |
| `docs/getting-started.md` | `775c151378028f4cb5083de7cbe20e284d3edbbbffed774670f0050726fc70db` |
| `editor/eliscript-mode.el` | `ecaa7f3cc14fdd7d2a3e790e869cb3caa5bd863bba5cc0f5c17671882d0a37ab` |
| `specs/0009-source-maps.md` | `b994a807c679b6b830d384e3dd212b40da5066526a3ed480a7d0f81b80a622d0` |
| `specs/0019-self-hosted-compiler.md` | `760654f8dfa5bbfd3ff2777110576ea2d5f88eed8b42f6c77873ebe8df8fbe89` |
| `specs/0040-maturity-roadmap.md` | `79a2153b8faf3d289dc7ba1df8eeab8da6eca1d18a89e501245b47f1e393258c` |
| `specs/0041-host-symbiosis-and-persistent-data.md` | `450448af577e8af6044905a9c5c56b8d85b53b2aab4447ee0f8f5d43017f9853` |
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
| `specs/0127-deterministic-reader-program-fuzz.md` | `2beb745f7ccf537fff47feeae46924d35fa3e4fe142aed0ced6adf15b926a16d` |
| `specs/0128-project-scale-invalidation.md` | `7c62b058147263cfa954bf50e1a24c574fc9d6bb0ebb76559fea924df55189d5` |
| `specs/0130-hostile-boundary-security.md` | `f1f24c4ddf55a78641d2ebe9557573c19e0e843718e9eb6224c8dff16b5434f5` |
| `specs/0135-local-onboarding.md` | `b618aca083da1c337f502b185a44048b41b0d064ca15653fc9036f97eb020a04` |
| `specs/0139-deterministic-persistent-semantics-corpus.md` | `94a15a0f2ed7cc595e066a10b81553f7aaf273285bde7741c891f86f194a6c56` |
| `specs/0140-clean-configured-project-workflow.md` | `9e67e5c0ad95f2a320a11fb6e1ed37d3430d700e6576bd496c2e138efcb23c81` |
| `specs/0141-repeated-core-determinism.md` | `0d87814a7ad8f601aeff595e310a5cf304c58619cf536259705a252a9ad87ebe` |
| `specs/0142-maintained-javascript-package-interop.md` | `964106e7c60ed3e36bb31aa0207e6c5d421cef7ba9b1a721ca20aedad29de99e` |
| `specs/0143-complete-negative-diagnostic-corpus.md` | `15dbca346655c96077c7544daeb73cb4e15049207b777d81aeb68b02d4ff5fdd` |
| `specs/0144-source-level-failure-mapping.md` | `c3d5531b9bede4737c50e8bee16bec1e530f2c9bc64ea0990631b4043c18fcc3` |
| `specs/index.json` | `e997d423f9e7fe851e43a9b3f8db2215f2c12a973146becf6c74d289d890b010` |
| `tests/api-index.test.mjs` | `7854b8be563e67a6c569133cea41f4ccf1758bc3955654234e22d91a82b2ec99` |
| `tests/atom.test.mjs` | `1403c404bf1c49c2532899a3ffe306536cf2affc7400d08d785439a9d5dcc296` |
| `tests/bootstrap-analyzer.test.mjs` | `ac2bfaaa29531eb6addab3a526a32b64d4981bba825033204d16703259961287` |
| `tests/bootstrap-compiler.test.mjs` | `6725cb92b5ef5dca952f94e3ae3002c1e0b770fb7ba7e35ff3470fb8755a8d40` |
| `tests/bootstrap-emitter.test.mjs` | `bc037864bd2389d17b906033d2b474a53fd07ae1074108a74cd338cd744197ca` |
| `tests/bootstrap-evaluation.test.mjs` | `08db27a96004401e3085387eb3d959f79e87317f9e67f449bed98faae29052c0` |
| `tests/bootstrap-expander.test.mjs` | `f4dc1556352e4e247677a316440e2d2f725a7fb608f7835c9e1e611b6e9d4d2a` |
| `tests/bootstrap-formatter.test.mjs` | `eca99f473e1e83384c078b13e3c4e33a1e32ba00752e086afdbc86b71361f85e` |
| `tests/bootstrap-ir.test.mjs` | `049355f3ed1766d4e01e08e4a951e59fc700b6e1b6c7e12c64c3b602fe537265` |
| `tests/bootstrap-project.test.mjs` | `4e7e0b217e2c0655acd266190ca1c7f15960170d6efb62579281976479dd4a8c` |
| `tests/bootstrap-reader.test.mjs` | `e079d6fe6d0731f1f569804ca38810afdd81450be0fe815631a4efe045de1941` |
| `tests/boundary-security.test.mjs` | `1d63fcc782b15b8a72c451fc5354b457945779ef0882b5b11856cfe6f9be3650` |
| `tests/ci-contract.test.mjs` | `56ed36c60aa1af5d51ee105ea2d5854cf9a6d37749eb03a7cc322bf54d3ca09e` |
| `tests/clean-project-workflow.test.mjs` | `082b8d3262faab8f70e63305dddff63f8bb69d9da9ed6eedb97f7ab21d44ee45` |
| `tests/conformance.test.mjs` | `e3d5442877cdc0d0bd923892583b67ff2ab3364b6a46f07138756f1715b97ca6` |
| `tests/conformance/manifest.json` | `109e01b417cdd15d69c0be36eaae64cc0ab5b9e2eb3aacebee716eae92851492` |
| `tests/core-stdlib.test.mjs` | `e7ce59b7eabbcbbea36e0cd79ca9fa0cf1ff1f3fc9b06a5de41ec4bcf6edfc9b` |
| `tests/diagnostic-corpus.test.mjs` | `4a5b06adc53786e881fab48e72c39a09737d4a3a0cfd7b4fd7b80f1c20980fdd` |
| `tests/eliscript-mode-tests.el` | `5e7e22d28c8cf6472cb80778fd8790df2a6963b457ef5300ce4b984b068791e9` |
| `tests/eliscript-repl-tests.el` | `68f9f92967aabcf26ef9bd2d605368f5df062e524698dd031407c2ca783ac54e` |
| `tests/emacs-analysis-evidence.test.mjs` | `17b1f280f4df04d1cfd2a6f9c35f1e89a04c9189fb38ff3294c97596050e3d57` |
| `tests/esm-imports.test.mjs` | `73db20c832401a1930f6d4e686f0fd9d28a2553bf6ad25f3ea3cc8bee55c2d5f` |
| `tests/final-acceptance.test.mjs` | `defd9cbe9517cb6caa6408f8357d6b54d749b67c59d19ff6b1709bd2e31abfe7` |
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
| `tests/transducer.test.mjs` | `19574e782a24dca32be074ccf555fb41598491e975fcbc8cf76e694ade8c4974` |
| `tests/transient-builder-benchmark.test.mjs` | `e1022dab110a6eee6a3e196da73c29aee89494e1908b03e41a4909cc1e4e64d8` |
| `tests/transient.test.mjs` | `92571f68ce457c35f8a95cbebad0a464ee445c14283831760aac9d8af77a26af` |
| `tests/value-semantics.test.mjs` | `b93063dd3e8a0dfe657240c6aea8039104d5e8103038c7f1955ae9361483e901` |
| `tests/watch.test.mjs` | `241c2117f6e1856e5afb0dbea9135d92d5d7895bc6cd3b84dd66fb73b7ca407a` |
| `tests/worker-lifecycle-soak.test.mjs` | `c4e38de152c6f3692ccd09797ed3f38cc1f4465b46a61d1445b332aa2e305f05` |
| `tests/worker-runtime.test.mjs` | `010f974d380e9aa0103b6dbb2ed31ed00f212c6196c1870449ec2cfb29d463b1` |
| `tests/worker-value-stream-probe.test.mjs` | `19dac4fabbf7878afbaef9120bb91a5e3c413fd706fc65e4c7d0f5e6930c30b0` |
| `tools/acceptance/finalize.mjs` | `924c7070c64267085f7123c755efcefb084e4ac6050afd19d74ee576751713e6` |
| `tools/collections/persistent-semantics.mjs` | `fc86ef0866cd180afbede79d4dfdd6c3ef25b6e4ee633f066e70916f194d853c` |
| `tools/debugging/check.mjs` | `a6fdaad34fcae0e84296f5ba463aa34fe867220c88ac072ea6109afd3678e38e` |
| `tools/diagnostics/check.mjs` | `6d6cb9e65ca59628c60459397b86d77f426b44755f3a5bc1334f2ed0ea43b2dc` |
| `tools/documentation/check.mjs` | `eb19276b62b18c4d8aaa443b97ec5a9252bfd4d0acc744c5762aedcac9bc6447` |
| `tools/integrity/check.mjs` | `12377912218cf242deb8b406cd59cc87afe127dd2a636eafabf2177bbf3a2b39` |
