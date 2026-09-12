# Eliscript 1.0 Acceptance Report

- Source commit: `9fcb9bf2411905de84bcd798a63263be50fdad95`
- Source tree: `145eec050feb75416bffa9a3cc2d76b9d213134a`
- Contract: `contracts/final-acceptance.json` (`fc7760bdccc644b014b3513e4020f3647e3128e54676481d1515504967f2651d`)
- Generated: 2026-09-12T13:50:51.419Z
- Environment: Darwin 25.6.0; arm64; Bun 1.4.0; Node v24.20.0; Emacs 31.1
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
| core-suite | `make test-core` | pass | 0 | 797915.392 | `9d59b69e144b3cb7f5d68aff25927e82e0685cc48b86a82db6a01755c3b7b981` |
| strict-byte-compile | `make byte-compile` | pass | 0 | 1342.611 | `4110c50ff8be0d96e678ed5ef31967a2aca72a86558181796ef5f14b5a350c3e` |

## Artifact Digests

| File | SHA-256 |
| --- | --- |
| `.github/workflows/compatibility.yml` | `45a2c3941d06adc6d745b4490197beb2a86266fda2685a69a88aeaa6afacfb90` |
| `acceptance/defects.json` | `da4ac30acd7e57ec357e3d30da05c304605d0a2407733137adf1a44f5b137377` |
| `acceptance/manifest.json` | `73df1f50b4f68e055f98e4e8e1daa803fb8d65a7ce8fec1fb7896c01db928ea6` |
| `acceptance/report.md` | `cb501b7365a005e4e14a3a310ed3da7e9c32c4b6833ad9829d152d37eab4acf3` |
| `acceptance/runs/m13-02.json` | `de2767587a9c5b2ff4280c7a1005d88274f0dc9f6c327edd89a2944d67053355` |
| `acceptance/runs/m13-04.json` | `47a58aab430e21d26a9fce392283d06bb62b969a90ae5e922307e4dbce58a880` |
| `acceptance/runs/m13-04.md` | `a9b55996a36aab1d86696ec7a1edd4eb63d297060f0c319e959c1c1090e53411` |
| `benchmarks/emacs-analysis-macos-arm64.json` | `a5eeb3adc2bd5ae44a64833683c77a837ee0798cf3018b6cbfecebdc6e1029dc` |
| `benchmarks/transient-builder-macos-arm64.json` | `8eb053070de12d5063289a3bc70c4a7e2d4ceccd3fe99c68d7e9c921165a62ee` |
| `benchmarks/worker-lifecycle-soak-macos-arm64.json` | `9cfd22ccb0d0e1ec4842c18c3f1a44353ee3fba59029ee62d8df65fd71063b65` |
| `benchmarks/worker-value-stream-macos-arm64.json` | `7fdf64d25067722b265d4a4b377e62b87e8b8c678fe15c045c9a5a8876578dd3` |
| `contracts/compatibility-baseline.json` | `e82f25d0c474c4f644555df104e19b747446f39db1e46e837797a8f8ff0519b1` |
| `contracts/compatibility-matrix.json` | `2be33eb441bb5f4969a0e3f157ccae66b35fda6126516befa9e05f08602fe36f` |
| `contracts/compiler-parity-corpus.json` | `c6dd7e92d2d887bacdc9706b0529920875e8dcff33a245c1245caac3d7f7c30c` |
| `contracts/core-acceptance-corpus.json` | `146a17c9d55c734ec9308cc3ccb5e7b9f2fac72aec961a72e1f9d5328c0fb26c` |
| `contracts/diagnostic-corpus.json` | `bd6bec3513b8c78b527f17662d91505b6c8bc28da5e5c4a41c6753967c0fcdb9` |
| `contracts/documentation.json` | `4191f35aa08ab0e16d8f3ed13ede12d41c722ace443d8ab9a7ddd31c8bee7b6e` |
| `contracts/final-acceptance.json` | `fc7760bdccc644b014b3513e4020f3647e3128e54676481d1515504967f2651d` |
| `contracts/library-api.json` | `b0775772de09eb877033f70811295a9a6ddea5ada4e3cd67dfebb7ecb10483a9` |
| `contracts/maturity-progress.json` | `36a1833eb891b0ce5fab65005dae99f292638b7b89945c9198054645d9923590` |
| `contracts/repository-integrity.json` | `0989ee1da26dc4f338e2c3d90e7ff09bcbbb7a6df54feaaf4ee52a314c7aee10` |
| `contracts/source-debugging-corpus.json` | `db8221df0aad47b9bf287a0dfef9e854830202298c518c0a239c1850ae1674ad` |
| `contracts/stable-compatibility-corpus.json` | `c77c7c1ba869b5ade73001e2382af2a0f9ef073cef2ddfa1f4f032dec931648e` |
| `docs/getting-started.md` | `775c151378028f4cb5083de7cbe20e284d3edbbbffed774670f0050726fc70db` |
| `editor/eliscript-mode.el` | `4dc4e0bf1ad31e8d6c714e496c63425e1fb113b18615a13fe5e4b73634f5cb60` |
| `specs/0009-source-maps.md` | `b994a807c679b6b830d384e3dd212b40da5066526a3ed480a7d0f81b80a622d0` |
| `specs/0019-self-hosted-compiler.md` | `760654f8dfa5bbfd3ff2777110576ea2d5f88eed8b42f6c77873ebe8df8fbe89` |
| `specs/0040-maturity-roadmap.md` | `79a2153b8faf3d289dc7ba1df8eeab8da6eca1d18a89e501245b47f1e393258c` |
| `specs/0041-host-symbiosis-and-persistent-data.md` | `ef40c63c0af8aebc31beda0efda8e625ce8fe1d78359f37a89c34f0a6e6ce13a` |
| `specs/0043-structured-diagnostics.md` | `f18785b2d298f3bed286eb3bd4a3a5e9bafe548a07c2f433eb9c293bd8d70a8f` |
| `specs/0048-value-equality-and-hashing.md` | `24a0af01851c450e8cf500eb5d39e067cf8ee92f52021189b0e7b0879532000a` |
| `specs/0072-atomic-state-references.md` | `a7213318ddcc3be09963c704a8cf97c6bf9f5d17774db4fd31892f91d4b48af2` |
| `specs/0073-native-javascript-container-interop.md` | `9f8fa459e3529579ec7590bc6fdda480efb9f68a3dc9a30670b3472366283d2d` |
| `specs/0078-persistent-collection-core-exit-audit.md` | `ced21c3357b88396ce96a6e6cafbd209ae338e15edebf305b52a0b2c082586c6` |
| `specs/0093-static-transient-ownership-analysis.md` | `de5963a2da0a389ed20c8961a28cd91b7d055f4578b8d62f6b619fb5395206ea` |
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
| `specs/0143-complete-negative-diagnostic-corpus.md` | `34c9cda778aa250fe34ccb5e59b282951318e7b8083e446af5e68f0dfb780257` |
| `specs/0144-source-level-failure-mapping.md` | `c3d5531b9bede4737c50e8bee16bec1e530f2c9bc64ea0990631b4043c18fcc3` |
| `specs/0146-complete-compiler-parity-corpus.md` | `ea350a896697d1d87bb19344a2baff106441e4fe5d6c587ca20cd531011a87d8` |
| `specs/0147-complete-stable-compatibility-corpus.md` | `e09e3818ede486f58423927e1814bcc81580c8f64fcb3cbc1ceabec469954fb0` |
| `specs/index.json` | `d33c9ab511a24327678a5661116e68bc66cda7041a935d4120d0761f5a16fda1` |
| `tests/api-index.test.mjs` | `6e1612812754c4bb193fb81b33ca083b5e1b0649a42ee308c00bc90f29a2d487` |
| `tests/atom.test.mjs` | `913f7c8850eaa95e68dd06cd26a536b512e89c2f2d3376b39c34227cf02522c2` |
| `tests/bootstrap-analyzer.test.mjs` | `ac2bfaaa29531eb6addab3a526a32b64d4981bba825033204d16703259961287` |
| `tests/bootstrap-compiler.test.mjs` | `812e960c12e0a368defe1fce10b447f3492c2d5abe3b6523a08c46d89bcfcdcc` |
| `tests/bootstrap-emitter.test.mjs` | `bc037864bd2389d17b906033d2b474a53fd07ae1074108a74cd338cd744197ca` |
| `tests/bootstrap-evaluation.test.mjs` | `4ff6b861ee755ece587f24a88236923dddeafeb155bf02dd8d144767c263ccc4` |
| `tests/bootstrap-expander.test.mjs` | `f4dc1556352e4e247677a316440e2d2f725a7fb608f7835c9e1e611b6e9d4d2a` |
| `tests/bootstrap-formatter.test.mjs` | `70b0fdf560c3a0ce1303267e2b3dfc836df521503e91c674a0592a331a78d8b6` |
| `tests/bootstrap-ir.test.mjs` | `049355f3ed1766d4e01e08e4a951e59fc700b6e1b6c7e12c64c3b602fe537265` |
| `tests/bootstrap-project.test.mjs` | `4e7e0b217e2c0655acd266190ca1c7f15960170d6efb62579281976479dd4a8c` |
| `tests/bootstrap-reader.test.mjs` | `e079d6fe6d0731f1f569804ca38810afdd81450be0fe815631a4efe045de1941` |
| `tests/boundary-security.test.mjs` | `1d63fcc782b15b8a72c451fc5354b457945779ef0882b5b11856cfe6f9be3650` |
| `tests/ci-contract.test.mjs` | `2290a09fd7fc81305e5781f29491a53310c59a9b8cd133e2bc537688b78e5f17` |
| `tests/clean-project-workflow.test.mjs` | `082b8d3262faab8f70e63305dddff63f8bb69d9da9ed6eedb97f7ab21d44ee45` |
| `tests/compiler-parity-corpus.test.mjs` | `83e4240b6b2dee991f2d2de1cdff4034b44c17f340fd70d486a1ce0d5381047b` |
| `tests/conformance.test.mjs` | `cf5b989597e2b66c35e14b5bce7c23f24f74dbbe1a639e941b190fa74c5c20f0` |
| `tests/conformance/manifest.json` | `5d8d81e1dcf2af6602f991f013e84c1bd95765dbc725fa1a8e2eca0092fe897d` |
| `tests/core-stdlib.test.mjs` | `276c51c18cd59efb37eaebc4b32dc5fdb156d0d4436c9f2bf4f5d2b2abb0882d` |
| `tests/diagnostic-corpus.test.mjs` | `d70fc0c6e0bd4f62305f6c69d28be883649e8c95000e7995f91031a0d67f4a45` |
| `tests/eliscript-mode-tests.el` | `c871a065a5c213b2ab6dac6d9b35afa7c9afc46778ab8629cd7bed691c1823f1` |
| `tests/eliscript-repl-tests.el` | `68f9f92967aabcf26ef9bd2d605368f5df062e524698dd031407c2ca783ac54e` |
| `tests/emacs-analysis-evidence.test.mjs` | `7adb647fd4de888fca31ea2d3726167a2dcd3d07a73baadeeee6de198e95dfa4` |
| `tests/esm-imports.test.mjs` | `73db20c832401a1930f6d4e686f0fd9d28a2553bf6ad25f3ea3cc8bee55c2d5f` |
| `tests/final-acceptance.test.mjs` | `5c6429730fdc688beb9abb62db94c57e270215d70c18b833a31fdfd78e78a305` |
| `tests/format-cli-test.sh` | `21cfbe2fd3de2fd908e5bfb01c9e3f8fa874c6b0e6d3c6b4539e4532567a6999` |
| `tests/interop-js.test.mjs` | `f76f8aeb7ca895b44732a6c07716ee5cf6657023cbf6bc6e28c7583db65d35f0` |
| `tests/interop-package.test.mjs` | `627c58c1da19108b2828f32cce99cd325937aa70709b4b6121566bb858c12c94` |
| `tests/local-onboarding.test.mjs` | `759ccfa512954e46ca1743f99e9d1f28cbdaffe5933c82546e48a6b1f7f2d099` |
| `tests/onboarding-docs.test.mjs` | `5444b6dc8b9779e935f8458b5e3b3a4b173c0b7c33484c75b713e10e926ea16e` |
| `tests/persistent-core-exit.test.mjs` | `5d11be51f0a16955444cc3b602b50b045222e2d93b5629bd8883d0d6ef45332f` |
| `tests/persistent-list.test.mjs` | `d5984bb76486e4dd62fa1014b57e5b9112a533920f8172a07b6ab13d07173ed1` |
| `tests/persistent-map.test.mjs` | `9fe586b9d5a490b3dad9cc05a047ea2ca8110c29228fe45232ec43058dd4315f` |
| `tests/persistent-semantics.test.mjs` | `bebd91e0a061c2e73d14f9e4847b8f389ccf53f11d3a92fa24f933bdf1def413` |
| `tests/persistent-set.test.mjs` | `8441b04e8b0537882d0c2f3c14a721b5e1ab7f5bb03090de1a372036c3193af0` |
| `tests/persistent-vector.test.mjs` | `20b0e66278dfc02fdf035e86c03e72db2a5c09196278ecece886202a4486b817` |
| `tests/project-cli-test.sh` | `8ae6ed64eec2426316ae2df6d615febe80916fc48e1231eb5cd9324011b638ad` |
| `tests/project-scale.test.mjs` | `99a42aedd7c492c2d4879be162b971975cb82a4c4fd98b5a7a7a6aae773101fb` |
| `tests/reader-program-fuzz.test.mjs` | `f6446a6621dacd88a3e4a0fa3f8f13915652ad9a8fb3aa3d29b0469bba9b8b6e` |
| `tests/repeated-determinism.test.mjs` | `eb3f2ef5a43bfbcab9615b8c5ff31c85d09092a8f58c1f895ca56692787838ce` |
| `tests/source-debugging.test.mjs` | `8eb14ca45564e54d1874bd04a791f1d5ca89cfff72a4c0f07c82b2d00dee8ca7` |
| `tests/stable-compatibility-corpus.test.mjs` | `eea99f1234047f92d2bf965075d3e5abd4045cdf4675bf52a2f6e43fe2520f9e` |
| `tests/transducer.test.mjs` | `c63b740db2c8450f815f0beadcfbb53075894e3da3d38d2f23d1316e4c4d5f04` |
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
| `tools/diagnostics/check.mjs` | `951cf34b6ae65f338b0543ca995c6929a1b8966521e8c489116ef2cc5671218d` |
| `tools/documentation/check.mjs` | `eb19276b62b18c4d8aaa443b97ec5a9252bfd4d0acc744c5762aedcac9bc6447` |
| `tools/integrity/check.mjs` | `12377912218cf242deb8b406cd59cc87afe127dd2a636eafabf2177bbf3a2b39` |
| `tools/parity/check.mjs` | `af999fdfdae13627293cdda495bebc9968d0d0c40c32867280df57626d6327c0` |
