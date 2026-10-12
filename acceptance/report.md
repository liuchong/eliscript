# Eliscript 1.0 Acceptance Report

- Source commit: `6e96da95304a081e7f1f6e2310ac0b044297e415`
- Source tree: `498d880eb6e9de7458f8a0c0db94a734209015c6`
- Contract: `contracts/final-acceptance.json` (`fc7760bdccc644b014b3513e4020f3647e3128e54676481d1515504967f2651d`)
- Generated: 2026-10-12T18:42:18.385Z
- Environment: Darwin 25.6.0; arm64; Bun 1.4.0; Node v26.8.2; Emacs 31.1
- Corpus complete: yes
- Operational success: yes
- Evidence complete: yes
- Blocking defects: 0
- Final acceptance: pass

Every mandatory core criterion and final gate passed in the source run.

## Mandatory Criteria

Results: 35 pass, 0 incomplete, 0 fail, 35 total.

| Criterion | Result | Declared state | Remaining work |
| --- | --- | --- | --- |
| AC-01 Stable specification coverage | pass | complete | - |
| AC-02 Stable corpus compatibility | pass | complete | - |
| AC-03 Deterministic diagnostics | pass | complete | - |
| AC-04 Reproducible fixed point | pass | complete | - |
| AC-05 Compiler parity | pass | complete | - |
| AC-06 Self-hosted authority | pass | complete | - |
| AC-07 Repeated determinism | pass | complete | - |
| AC-08 Clean project workflow | pass | complete | - |
| AC-09 Correct incremental builds | pass | complete | - |
| AC-10 Host portability | pass | complete | - |
| AC-11 Formatter | pass | complete | - |
| AC-12 Emacs mode | pass | complete | - |
| AC-13 Interactive evaluation | pass | complete | - |
| AC-14 Source-level debugging evidence | pass | complete | - |
| AC-15 Stable library contract | pass | complete | - |
| AC-16 Worker correctness and recovery | pass | complete | - |
| AC-17 End-to-end performance value | pass | complete | - |
| AC-18 Fuzz robustness | pass | complete | - |
| AC-19 Scale and soak | pass | complete | - |
| AC-20 Boundary security | pass | complete | - |
| AC-21 Supported environment matrix | pass | complete | - |
| AC-22 Documented local onboarding | pass | complete | - |
| AC-23 Complete documentation set | pass | complete | - |
| AC-24 Acceptance audit | pass | complete | - |
| PD-01 Persistent Semantics | pass | complete | - |
| PD-02 Vector Structural Bounds | pass | complete | - |
| PD-03 HAMT Structural Bounds | pass | complete | - |
| PD-04 Hash and Equality | pass | complete | - |
| PD-05 Transient Safety | pass | complete | - |
| PD-06 Transformation Efficiency | pass | complete | - |
| PD-07 Host Interop | pass | complete | - |
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
| core-suite | `make test-core` | pass | 0 | 740713.296 | `3a85cc56d23215b656207f1c3108604e6f0227daa8f4e41f1c90b5dac0202efa` |
| strict-byte-compile | `make byte-compile` | pass | 0 | 1546.383 | `4110c50ff8be0d96e678ed5ef31967a2aca72a86558181796ef5f14b5a350c3e` |

## Artifact Digests

| File | SHA-256 |
| --- | --- |
| `.github/workflows/compatibility.yml` | `e3d5978e4ea198a60d0b2f77dc0dd458008a6ed36248084323b71115abcb06ac` |
| `acceptance/defects.json` | `da4ac30acd7e57ec357e3d30da05c304605d0a2407733137adf1a44f5b137377` |
| `acceptance/manifest.json` | `977625cf96dcbad7ce05d673570c57e151a2ed472ff9b312be1f96255cb09da6` |
| `acceptance/report.md` | `8db320fd24d4423f9e2675f3c8b1eb776204641e9c1cc89e1eddee7cccf09da4` |
| `acceptance/runs/m13-02.json` | `6259ae63d8b9357fe87dddd8fc9911c7c60cb9d558d4fb2141dea9fcd25c18c0` |
| `acceptance/runs/m13-04.json` | `7e72df12309009430615529e5119716df01e472cefd9e077fc969ce117110697` |
| `acceptance/runs/m13-04.md` | `3a0717b71756198f28c7d4e27a94f9b6e7214e8db8a3d0fd000d8652badcd770` |
| `benchmarks/emacs-analysis-macos-arm64.json` | `a5eeb3adc2bd5ae44a64833683c77a837ee0798cf3018b6cbfecebdc6e1029dc` |
| `benchmarks/transient-builder-macos-arm64.json` | `ba7320ca21172c53fa49d80e279b7c5577c0546e2e987b72186325fb96e4b3c1` |
| `benchmarks/worker-lifecycle-soak-macos-arm64.json` | `4bb033334016418d5f646e67594db4fbcd51d48b1dbe82c560cece03b1bb4fa2` |
| `benchmarks/worker-value-stream-macos-arm64.json` | `7fdf64d25067722b265d4a4b377e62b87e8b8c678fe15c045c9a5a8876578dd3` |
| `contracts/compatibility-baseline.json` | `6ac21fb353cf6769ac630bb2162ce2e4bdfaf2d708654df1b27bf3a83c6c548a` |
| `contracts/compatibility-matrix.json` | `b062adae4ed98ce089d2b9ab9c776266b328014e4ed4139cda1c194f18df5a32` |
| `contracts/compiler-parity-corpus.json` | `13c67779a5fff98d600fb3557089e9d9c3e10ef7c29f23e41d9cc14506d469d2` |
| `contracts/core-acceptance-corpus.json` | `146a17c9d55c734ec9308cc3ccb5e7b9f2fac72aec961a72e1f9d5328c0fb26c` |
| `contracts/diagnostic-corpus.json` | `bd6bec3513b8c78b527f17662d91505b6c8bc28da5e5c4a41c6753967c0fcdb9` |
| `contracts/documentation.json` | `4191f35aa08ab0e16d8f3ed13ede12d41c722ace443d8ab9a7ddd31c8bee7b6e` |
| `contracts/final-acceptance.json` | `fc7760bdccc644b014b3513e4020f3647e3128e54676481d1515504967f2651d` |
| `contracts/library-api.json` | `c63e83ae3937ab57b307f9201d2f863852aca3b414f8af950e8f424e8c4bb6f3` |
| `contracts/maturity-progress.json` | `3bf217d65b534c8b18477c7635592607e75d5ea2a0c4936e76cbd999e9e71ca7` |
| `contracts/repository-integrity.json` | `44697a8fdec98dea305d74dbab61a5d0796ebd02d901ed072809246586bcf183` |
| `contracts/source-debugging-corpus.json` | `db8221df0aad47b9bf287a0dfef9e854830202298c518c0a239c1850ae1674ad` |
| `contracts/stable-compatibility-corpus.json` | `509e14eb682fa0898b00e83ecd850d181c5593636084d4025ffa0bd595e49532` |
| `docs/getting-started.md` | `acc4414021d4adf715dc1017967fc44d993882185d189809bff6cc2b4fd891c4` |
| `editor/eliscript-mode.el` | `1fe16b00b8fdee5a7fe72a32c0ca960acfccca391d4c5e3ba1f3b22cd138fa98` |
| `specs/0009-source-maps.md` | `b994a807c679b6b830d384e3dd212b40da5066526a3ed480a7d0f81b80a622d0` |
| `specs/0019-self-hosted-compiler.md` | `760654f8dfa5bbfd3ff2777110576ea2d5f88eed8b42f6c77873ebe8df8fbe89` |
| `specs/0040-maturity-roadmap.md` | `606861b9edafedbcc5a672b3c415e1a6683069cfba988c0dabf0ba76221f8239` |
| `specs/0041-host-symbiosis-and-persistent-data.md` | `2e39555b23fee76470425f0ca564a446a779af3afbe9bbb513d05d37367741a0` |
| `specs/0043-structured-diagnostics.md` | `f18785b2d298f3bed286eb3bd4a3a5e9bafe548a07c2f433eb9c293bd8d70a8f` |
| `specs/0048-value-equality-and-hashing.md` | `24a0af01851c450e8cf500eb5d39e067cf8ee92f52021189b0e7b0879532000a` |
| `specs/0072-atomic-state-references.md` | `a7213318ddcc3be09963c704a8cf97c6bf9f5d17774db4fd31892f91d4b48af2` |
| `specs/0073-native-javascript-container-interop.md` | `0a8698e3e019554c0ddfedeccbe35fbd3ae1a34cf23f28983f3946f43129c331` |
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
| `specs/0142-maintained-javascript-package-interop.md` | `9609946fafa912660f4743090400e62963201acc981080882a7050378eed87cf` |
| `specs/0143-complete-negative-diagnostic-corpus.md` | `34c9cda778aa250fe34ccb5e59b282951318e7b8083e446af5e68f0dfb780257` |
| `specs/0144-source-level-failure-mapping.md` | `c3d5531b9bede4737c50e8bee16bec1e530f2c9bc64ea0990631b4043c18fcc3` |
| `specs/0146-complete-compiler-parity-corpus.md` | `ea350a896697d1d87bb19344a2baff106441e4fe5d6c587ca20cd531011a87d8` |
| `specs/0147-complete-stable-compatibility-corpus.md` | `e4c17dc09491454ba18087f74e79b13c4ed864a231c1d97597b930db490545e4` |
| `specs/index.json` | `338cbb6ef82447659d97d52b8434a66dac6f0555e68f5f4098c020852a04dd8a` |
| `tests/api-index.test.mjs` | `3c12fb0961dc06047f12f0660eaadf6a8a9f74bbe5d9b73411d28b9c6cd103e3` |
| `tests/atom.test.mjs` | `913f7c8850eaa95e68dd06cd26a536b512e89c2f2d3376b39c34227cf02522c2` |
| `tests/bootstrap-analyzer.test.mjs` | `ac2bfaaa29531eb6addab3a526a32b64d4981bba825033204d16703259961287` |
| `tests/bootstrap-compiler.test.mjs` | `812e960c12e0a368defe1fce10b447f3492c2d5abe3b6523a08c46d89bcfcdcc` |
| `tests/bootstrap-emitter.test.mjs` | `1fb3dc7ac20d64c2b6cd392fa6980451d01269f4dbd3f2c91483bb3e6fda6ed0` |
| `tests/bootstrap-evaluation.test.mjs` | `cd1a4ddbefbde24f558d8a33ba921aaebb56e306392e3a67ea8c270b23b88784` |
| `tests/bootstrap-expander.test.mjs` | `f4dc1556352e4e247677a316440e2d2f725a7fb608f7835c9e1e611b6e9d4d2a` |
| `tests/bootstrap-formatter.test.mjs` | `70b0fdf560c3a0ce1303267e2b3dfc836df521503e91c674a0592a331a78d8b6` |
| `tests/bootstrap-ir.test.mjs` | `049355f3ed1766d4e01e08e4a951e59fc700b6e1b6c7e12c64c3b602fe537265` |
| `tests/bootstrap-project.test.mjs` | `4e7e0b217e2c0655acd266190ca1c7f15960170d6efb62579281976479dd4a8c` |
| `tests/bootstrap-reader.test.mjs` | `e079d6fe6d0731f1f569804ca38810afdd81450be0fe815631a4efe045de1941` |
| `tests/boundary-security.test.mjs` | `1d63fcc782b15b8a72c451fc5354b457945779ef0882b5b11856cfe6f9be3650` |
| `tests/ci-contract.test.mjs` | `f6d980ae6dbdff676396db17f32a87d85bd3909659c041ea8c96f61b3697666e` |
| `tests/clean-project-workflow.test.mjs` | `082b8d3262faab8f70e63305dddff63f8bb69d9da9ed6eedb97f7ab21d44ee45` |
| `tests/compiler-parity-corpus.test.mjs` | `83e4240b6b2dee991f2d2de1cdff4034b44c17f340fd70d486a1ce0d5381047b` |
| `tests/conformance.test.mjs` | `ceb5808d9f6e060d2f38606ba9a7d94658d5c79c857bd868432a6017094907c8` |
| `tests/conformance/manifest.json` | `7912b8a9a3e9cf87eb89ab82f291d9e59ad4cb35382f3a527330dcbdabdbecf1` |
| `tests/core-stdlib.test.mjs` | `276c51c18cd59efb37eaebc4b32dc5fdb156d0d4436c9f2bf4f5d2b2abb0882d` |
| `tests/diagnostic-corpus.test.mjs` | `d70fc0c6e0bd4f62305f6c69d28be883649e8c95000e7995f91031a0d67f4a45` |
| `tests/eliscript-mode-tests.el` | `c871a065a5c213b2ab6dac6d9b35afa7c9afc46778ab8629cd7bed691c1823f1` |
| `tests/eliscript-repl-tests.el` | `68f9f92967aabcf26ef9bd2d605368f5df062e524698dd031407c2ca783ac54e` |
| `tests/emacs-analysis-evidence.test.mjs` | `7adb647fd4de888fca31ea2d3726167a2dcd3d07a73baadeeee6de198e95dfa4` |
| `tests/esm-imports.test.mjs` | `73db20c832401a1930f6d4e686f0fd9d28a2553bf6ad25f3ea3cc8bee55c2d5f` |
| `tests/final-acceptance.test.mjs` | `b84d8f5ab7260f9eb140ef24c0f8fe503e8e6bae17cf4d6bbcfb1bf3278e60bb` |
| `tests/format-cli-test.sh` | `21cfbe2fd3de2fd908e5bfb01c9e3f8fa874c6b0e6d3c6b4539e4532567a6999` |
| `tests/interop-js.test.mjs` | `f76f8aeb7ca895b44732a6c07716ee5cf6657023cbf6bc6e28c7583db65d35f0` |
| `tests/interop-package.test.mjs` | `627c58c1da19108b2828f32cce99cd325937aa70709b4b6121566bb858c12c94` |
| `tests/local-onboarding.test.mjs` | `759ccfa512954e46ca1743f99e9d1f28cbdaffe5933c82546e48a6b1f7f2d099` |
| `tests/onboarding-docs.test.mjs` | `51477b1664886e83ba59907f8286ceaa07c4a1d9acf28789ebcc8a093ded6d93` |
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
| `tests/stable-compatibility-corpus.test.mjs` | `ca5b2707bb8c29d1e5aabeb40ce8f7fca70a5e34523b85469ee1178dbd061379` |
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
| `tools/compatibility/corpus.mjs` | `6ac819006fe8778908732a652a31322f9214252c93173b26c3600bdb0b01c5ec` |
| `tools/debugging/check.mjs` | `a6fdaad34fcae0e84296f5ba463aa34fe867220c88ac072ea6109afd3678e38e` |
| `tools/diagnostics/check.mjs` | `951cf34b6ae65f338b0543ca995c6929a1b8966521e8c489116ef2cc5671218d` |
| `tools/documentation/check.mjs` | `eb19276b62b18c4d8aaa443b97ec5a9252bfd4d0acc744c5762aedcac9bc6447` |
| `tools/integrity/check.mjs` | `12377912218cf242deb8b406cd59cc87afe127dd2a636eafabf2177bbf3a2b39` |
| `tools/parity/check.mjs` | `af999fdfdae13627293cdda495bebc9968d0d0c40c32867280df57626d6327c0` |
