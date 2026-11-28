# Eliscript 1.0 Acceptance Report

- Source commit: `cc5e176e37f2047e679f1eb3f293c197a3704779`
- Source tree: `164e860cae91b855da06592b796e8d05e5ccaa88`
- Contract: `contracts/final-acceptance.json` (`032dc718b8d00fd681b52e889c267ed18e39bfffd0ae10759d2c31ee46a8e58d`)
- Generated: 2026-11-28T04:30:48.459Z
- Environment: Darwin 27.2.0; arm64; Bun 1.4.5; Node v24.22.3; Emacs 32.0.50
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
| core-suite | `make test-core` | pass | 0 | 784868.582 | `f36dd2a6e3212eea3172237cdb17819742bf333404808760fb6a5c2d31fe2b27` |
| strict-byte-compile | `make byte-compile` | pass | 0 | 2479.915 | `aa1548c368350af36c74e9b272fa3ffdd33c47c1e30ed761b17fc923c86603f3` |

## Artifact Digests

| File | SHA-256 |
| --- | --- |
| `.github/workflows/compatibility.yml` | `2af20fbf73ba6839c9709cede3fcdf395ad27a1fd4bb42c31138b942b253ac38` |
| `acceptance/defects.json` | `d1868b3aa2fd71385ad40c6ef90825b91007b5ba499184c1a18e8da765513c38` |
| `acceptance/manifest.json` | `204e70c86dbe231f7335f20ec5c5fdead63744f225b231f16737dfc12130792f` |
| `acceptance/report.md` | `c28a42344289baa4a6b5388bb4d7a36afd3b00ccd66cefd7267e79f195cc68f1` |
| `acceptance/runs/m13-02.json` | `ecc76c13bb518c05fff821251c5c7c4edefe0bd69ebd23bac8e3c5ca36d77b8d` |
| `acceptance/runs/m13-04.json` | `0171f940378642a14e9fae7499e3388b8923b2bbeee5bc0e5a852300f3da4fb7` |
| `acceptance/runs/m13-04.md` | `9e6a73d9c16c496659638f4f17b6cc62a260eed12f8d4e33b13f906a3b5ffcd6` |
| `benchmarks/emacs-analysis-macos-arm64.json` | `db5b140ffb60a17466fda23ad9e7fda17cc36e23a6029e81de0fbf41f63f8bed` |
| `benchmarks/transient-builder-macos-arm64.json` | `498ef191352fd0cd35bb551caa207d43c3e3877cc5a347e1c94ca9121a412a45` |
| `benchmarks/worker-lifecycle-soak-macos-arm64.json` | `640ee711146b3ac91ae790ead6b3afcb9c66e5303a49c710d26f9265086e5dda` |
| `benchmarks/worker-value-stream-macos-arm64.json` | `920a5a344385d8e46e76a13ae7f4dedf9997cea8d0f8ad2d454cfe4d93cd85ef` |
| `contracts/compatibility-baseline.json` | `b46dd6aeb117e4cc44baa16f46873ea711401eb773f8b44131d4da7bd76817ff` |
| `contracts/compatibility-matrix.json` | `16fa28f6ad7c6171e12c511a7d7d3aaa7b9464071456f6f1b95cfbaacbb646f2` |
| `contracts/compiler-parity-corpus.json` | `cac2c7c6bae2f688cd63c5f708793f1e529e28efe5b9eb3192669e97e903697e` |
| `contracts/core-acceptance-corpus.json` | `455a5ae1aa6558571263e17251a8a997f11a459c81f05aa9b0bb7c6220a66196` |
| `contracts/diagnostic-corpus.json` | `531637d1118896f5c3abc3f5fe6f4a26bb0c993151827d1d2b42ae4c6b50633b` |
| `contracts/documentation.json` | `0bf231d87a7333647e278761a0765245bcfdbe1ed0ddc9cee7eed3301e666f58` |
| `contracts/final-acceptance.json` | `032dc718b8d00fd681b52e889c267ed18e39bfffd0ae10759d2c31ee46a8e58d` |
| `contracts/library-api.json` | `0c2c71285d0101b79af1a465f672135a52296e21cc7456f7166e0d4ea9701d45` |
| `contracts/maturity-progress.json` | `903cf71144dc71d3d8fdfe37bb40d2efbc028d4c07ef3a43c34a690939d0f480` |
| `contracts/repository-integrity.json` | `8d17e47bcfce4c1d243e93d17c77cb4f43025be93a0309a6d3dcfb5ff741a44d` |
| `contracts/source-debugging-corpus.json` | `7825251f6f60f64c19ffe4e49e349b6ee301ddc0064c31904d0008732fa129ef` |
| `contracts/stable-compatibility-corpus.json` | `c561e93929845b7dd8d329b88d46ad900d34bada553a92e6b160f7f94c814c6e` |
| `docs/getting-started.md` | `560163efea11ed92a4b950011fe89c12d3c6d3e5f782e83301bc3e9f10231ea3` |
| `editor/eliscript-mode.el` | `4c366752886415dbf48e17d5375d73c36e654a6ea75a177ca2a6c32e601c3946` |
| `specs/0009-source-maps.md` | `b994a807c679b6b830d384e3dd212b40da5066526a3ed480a7d0f81b80a622d0` |
| `specs/0019-self-hosted-compiler.md` | `760654f8dfa5bbfd3ff2777110576ea2d5f88eed8b42f6c77873ebe8df8fbe89` |
| `specs/0040-maturity-roadmap.md` | `df5aa48f366f511ac8e9785e1379a737cf504faf8643669d672793c94e0c5876` |
| `specs/0041-host-symbiosis-and-persistent-data.md` | `7786e845dfcacf696a8536f14398d57a1881a4bcc9a23784cc5ef5edba579d1e` |
| `specs/0043-structured-diagnostics.md` | `ac170a41148ba6d4477e188077cfb15a51ee7d82b9827ba6fc19982f705f586a` |
| `specs/0048-value-equality-and-hashing.md` | `24a0af01851c450e8cf500eb5d39e067cf8ee92f52021189b0e7b0879532000a` |
| `specs/0072-atomic-state-references.md` | `a7213318ddcc3be09963c704a8cf97c6bf9f5d17774db4fd31892f91d4b48af2` |
| `specs/0073-native-javascript-container-interop.md` | `0a8698e3e019554c0ddfedeccbe35fbd3ae1a34cf23f28983f3946f43129c331` |
| `specs/0078-persistent-collection-core-exit-audit.md` | `ced21c3357b88396ce96a6e6cafbd209ae338e15edebf305b52a0b2c082586c6` |
| `specs/0093-static-transient-ownership-analysis.md` | `de5963a2da0a389ed20c8961a28cd91b7d055f4578b8d62f6b619fb5395206ea` |
| `specs/0104-accelerated-emacs-operation-service.md` | `8d3990c99ab6c6da8327abbd059565271202afcf7d97694eb88bb735cd979c75` |
| `specs/0105-emacs-analysis-performance-reinvestment.md` | `daace718cb416becb271515aa3966ca9c84f3fe3f619a8691f1c5392989e676d` |
| `specs/0112-unified-self-hosted-build-operation.md` | `bdef35e54100b23072c6b3883be468dd323ce1e741bd6558615c82a2e2a96ded` |
| `specs/0114-deterministic-concrete-syntax-formatter.md` | `c656e7988bd2e7af1dd0c31c30d6cad9c77c73e63d10364f6e8c5d57a3c56fca` |
| `specs/0120-interactive-terminal-repl.md` | `40a4e147b6a9e1936bd8b4e3507a22609d54f20e738e8639bbd4f399b7fd49d3` |
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
| `specs/index.json` | `f3ec7c77c245a299dcae550376f7065dfbe142cd850e6b4403f9f1e858bcc125` |
| `tests/api-index.test.mjs` | `1d39e8fc1c4fcf817d195a1ee4bce7fe8188d554ea6a180ab8fe48d1014e4d1a` |
| `tests/atom.test.mjs` | `2bcf6bd9e93621ad60ac34f4f2460308c003b326c5897c81c1b6e737b6de2fea` |
| `tests/bootstrap-analyzer.test.mjs` | `d7f8c963cca3cc075cea7180670f6b1343325fe20aff967d527297e111f69ca7` |
| `tests/bootstrap-compiler.test.mjs` | `c071df55048a8b6a55d5f12bacf0de14b54b75f7571360e856799e802df8b737` |
| `tests/bootstrap-emitter.test.mjs` | `8e6c6ec0667d26be9ea3af863529a2003f35e8f8d6a87a96634d0696fefe6a83` |
| `tests/bootstrap-evaluation.test.mjs` | `d43e1c2325db93cd1be3d6b158d4421e14b5f9ef46eb216dffea4634a8b75f05` |
| `tests/bootstrap-expander.test.mjs` | `e471f0d7db42725413330c29f7a2691b584f5f269cfcb1007b4eada6010616a8` |
| `tests/bootstrap-formatter.test.mjs` | `2e8c74d20689e00f0011f36973de5e33fdb60f0ba3d8d85f0fa6b116bb4a7764` |
| `tests/bootstrap-ir.test.mjs` | `9f573a0156ad1d937f4ae9f64de094192f91d458ccefe0c2688eedbd91092be6` |
| `tests/bootstrap-project.test.mjs` | `ca3a494e25d41db5e7fdc1044e0c23d182cc1849f867acc9d8ff4935d8b45d12` |
| `tests/bootstrap-reader.test.mjs` | `7f41868daf4463420bc8463f9bab8ede52d6e9a2c9a4c289312c975c5f0d6613` |
| `tests/boundary-security.test.mjs` | `5221e3773bb29a3f3e865fa850ee1fea96e9b5d5b812c03f0812b7d3fc840272` |
| `tests/ci-contract.test.mjs` | `d133e7f16dcaeff9c6a8104c1912a00517a0a1b16c9cc16bc6c40a541dbe7321` |
| `tests/clean-project-workflow.test.mjs` | `caee096f7fc6701ea964baf6c039ec4da7a422ee95c058dc788dc60dca8d0db7` |
| `tests/compiler-parity-corpus.test.mjs` | `109b02350c12b951551c991d044b85520e1a768752e5bd3984e43b24b48adc92` |
| `tests/conformance.test.mjs` | `24e36ef63ec4466e0a836caed5c7c3bdc137bb5fd9f9e19f93ab7baf4c782b81` |
| `tests/conformance/manifest.json` | `4d1d36996eb6b7cf21685d5230d0dd6bd58bb3433799847b6324712f6fd9e7ec` |
| `tests/core-stdlib.test.mjs` | `49211b8abff48b1e80d77e7a78d737618c1354573a333a83a5118f01e876eeb1` |
| `tests/diagnostic-corpus.test.mjs` | `966410f52b6b06ef988a8990bcc905c33cc189ae804c29ccf9b10a19b2f10838` |
| `tests/eliscript-mode-tests.el` | `3acf2875160d376bcd33c9a93f3b4d3d121cedba5d858aa554026285bf3f9527` |
| `tests/eliscript-repl-tests.el` | `68f9f92967aabcf26ef9bd2d605368f5df062e524698dd031407c2ca783ac54e` |
| `tests/emacs-analysis-evidence.test.mjs` | `5cd311852905ab791227082e81bea05324f2d9fb1d1b0ce1197a92f0e784fbcd` |
| `tests/esm-imports.test.mjs` | `acd12e005c0d59776c5eef472694698243ba4be8e4efb08cb1823e9abb88bc5a` |
| `tests/final-acceptance.test.mjs` | `e1545767fd6e50316af40506b88f44087b904493698e67db1690f1da253a3418` |
| `tests/format-cli-test.sh` | `bcbd80592c03605610a2856a82e7602bee393d99d4c05d0c74be2d2a28c8d8b7` |
| `tests/interop-js.test.mjs` | `95a9244ccef54560dd10f2eee6b7d4ff7ceadc118f085a21bd8e23e3271ab931` |
| `tests/interop-package.test.mjs` | `0208083ca59573128c00e5bc3a76a0ad9d25d412f6ccc37638d6e1206d3b4160` |
| `tests/local-onboarding.test.mjs` | `949b5ea6040f9630f0bc811b0be6ddcb244dd071517c37360cb41e4890e4c55f` |
| `tests/onboarding-docs.test.mjs` | `d9ddb5d0e73e5d6d1d9b8eb04eb3008e2063788403b0334fe13e1109b1c8f832` |
| `tests/persistent-core-exit.test.mjs` | `b413bb26f861c4a386abbd01e13da4358232ef636e7b80c238b4d68f2898e9f5` |
| `tests/persistent-list.test.mjs` | `7266e8e681bb268a895fec3c2a78cfabe2a2e16a73f1bbc868939bf98e183ed8` |
| `tests/persistent-map.test.mjs` | `d8c81ca482ac2dc28a86b1a56a21d9ed09dc4fb9cb4564c8fe07c59624bc52b7` |
| `tests/persistent-semantics.test.mjs` | `0d25351004dabd1b961c737522722a588ceccd9d6da3abb1a3089892b02d19fa` |
| `tests/persistent-set.test.mjs` | `3027411f4cf9c3cec0dadbb9b941f8a17dc6cd6e25069601b560e712fc83261a` |
| `tests/persistent-vector.test.mjs` | `4d47374b7becd11adca58e8ee5752691880fd6043536e1035bb0bedc59d1f543` |
| `tests/project-cli-test.sh` | `98e3c00d500b6dc3f1571154fdf8cc7247d218bd8420d750e502becf3e323aa3` |
| `tests/project-scale.test.mjs` | `27812c2187b480f278eb1ef20ad9968a241cde83eddd909fcdb41f5abe82057d` |
| `tests/reader-program-fuzz.test.mjs` | `8e1901c94ceecdb5ac57df593574f04d48370a46488e18fbabad5b284ab02c44` |
| `tests/repeated-determinism.test.mjs` | `894b5b2f0fb36ffd8db4a5c460ccc7d748096b420b91bb2f758e5bccb99923fd` |
| `tests/source-debugging.test.mjs` | `543282bab4e513ab5e2f19817fc352a4b5059b75793278b114062989b92672d1` |
| `tests/stable-compatibility-corpus.test.mjs` | `a88edcb2355db052c89645281eebe2e017d83b47c1a6eb327030c6c70955dec5` |
| `tests/transducer.test.mjs` | `bac7b27663da24bd895b54be42285ec820decfc220cc0e0950661bbdeca31cef` |
| `tests/transient-builder-benchmark.test.mjs` | `43bfa57c24a1e80b2c6c1b8dfe968c135338d9d191cd3364286be9d2c665d7de` |
| `tests/transient.test.mjs` | `fd6119d4b794aac2ec4ab388f4bbee8255b7c5f1c3800d7379fe2df1bcf04862` |
| `tests/value-semantics.test.mjs` | `d59a67261c3e2d62b26d83dfe6c0dcdcbfc721d3945904d7df21893a041aecad` |
| `tests/watch.test.mjs` | `a6e5a961b9356cbdece3e724db2461db65ae5250e09aa38a988e9c097c94f374` |
| `tests/worker-lifecycle-soak.test.mjs` | `3970a0d2f790fa9a50954e3d48214f7b64c12369be21e60d24fb5d05933065f7` |
| `tests/worker-runtime.test.mjs` | `10fd557170a3e4ef92fe52d3d27373452099af2b3da2f44f0c85f20ee9246c15` |
| `tests/worker-value-stream-probe.test.mjs` | `b995e0b5276b604acad71847831fb3b8bcdf8513e4fe931c34347b05fe8db951` |
| `tools/acceptance/finalize.mjs` | `ceaee7f17877313a5743d4339a5c92353e46f49d84f9fa2ffedbfeb8b80a3acb` |
| `tools/collections/persistent-semantics.mjs` | `aaa91c96c5fa2b1a8e5046f838826f0084ed6739c62ec49a88733d4923adb84a` |
| `tools/compatibility/corpus.mjs` | `89b43886ce5293eb0d4478a3309417a9727056439dfbcfd875ddbb95c8da64fd` |
| `tools/debugging/check.mjs` | `b02cd488bfe8aa015d23e069114a7f969ace346de793b084e4cde9bf292bc007` |
| `tools/diagnostics/check.mjs` | `4fcc61094861a41621476824e33fdc4477998a388e8f87c6b6baee2a8b6e21d8` |
| `tools/documentation/check.mjs` | `2d32becbc95690257fbf20264547c46a84348d546201880156ec660a17a5efbc` |
| `tools/integrity/check.mjs` | `7aa738a9250efeeea6725ece35dee48542bc13675a34208be487ac2f92bb4d81` |
| `tools/parity/check.mjs` | `1cf2449cca88947b42438c8f128d434a57b890f56507621a159659e4d9e4fb72` |
