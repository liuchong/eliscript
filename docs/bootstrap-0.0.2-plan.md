# Eliscript 0.0.2：JavaScript 三段式自举与三种输出

## 当前状态：FIX07四项完整通过，固定修复清单8/9关闭

### 暂停后的源码归集与提交

当前只执行已授权的Git归集与清理，不恢复施工、完整自举或重型验收，
版本仍为0.0.1。C77–C88及更早候选为本次施工的历史副本；C88的132份
回迁记录和后续主目录修复共同构成当前源码，不把旧副本覆盖回来。
仍使用的Unicode旧工具档案已按原Git blob逐字补齐，解决C130-A1的漏存；
未重新运行该项，因此不追加验收通过。C130-A2/A3测试接线、A4旧内部
资源限额及A5完整host的Keyword打印失败仍保留，尚未修复。强制每次
分配GC的native压力项也保留中止事实，不计通过。已记录的局部通过证据
继续有效；本次源码提交不是0.0.2发布或完整门禁通过声明。

最新证据见C108：当前同一编译器/运行时源码的原601/604 WASM/native四项
功能均通过，comparison均equivalent；固定9组关闭8组（88.9%），只剩
FIX23（11.1%）的原zipper深树族。正式三段式自举、最终stage3三输出、
版本更新和签名推送仍待后续门禁，不将预自举候选冒充发布完成。

### C128：按本次授权收尾，明确后置深树压力而不伪报通过

本次明确决定：最后一次集中优化C127仅再改善约3.5%，不继续研究或优化。
当前107/107相关功能测试通过。原完整570/WASM在5分钟观察时尚无结果，
进程约0.9GB且CPU持续运行；最终日志确认它在349755.205ms后真实通过，
comparison=equivalent，随后591/WASM也在1776.075ms通过。整条前置验收
444.498s时取消，实际取消的是后续631而非已完成570；峰4602479864字节、
cleanup=true。保留JS6/6、WASM570/591两项完整通过和应用通过，不撤销
既有成果。该结果证明本候选570/WASM功能，不能冒充native或最终stage3
通过；其极慢性能仍失败，取消与未知其余结果不算通过。

此前C127中“完整深树仍必须在本次跑完才推进”的收尾约束由本节替代：
用户已允许该问题保留到后续周期。本次发布只要求其余功能和固定点通过，
这组压力用例明确后置；有效范围通过不等于原完整语料全通过。禁止把后置
记为成功、删掉原样例、降低12000层或改独立Seed黄金。默认严格模式仍
执行原完整用例，只有显式功能profile和性能后置旗标同时开启才接纳例外。

基线master fb98a50与现有WIP；复用现成resourceDeferred记录和stage3
effective-corpus汇总，不新增运行器、计时机制或源码实现语言。

```text
tools/backends/eliscript/compiler-corpus.eli
  compilerCorpusResourceDeferred(:~518) 已有百万输入延期框架
  -> 新增仅570/631/649稳定ID、仅WASM/native、profile small且
     ELISCRIPT_DEFER_PERFORMANCE_ACCEPTANCE=1的认证压力收据
  -> 使用现有完整原始输入/模块/host身份验证，不认证失败文本或宽泛名称
tests/eliscript/compiler-corpus-implicit-resources.eli
  -> 正反边界：JS/严格模式不后置、变更输入拒绝、三ID精确范围及保留证明
tests/eliscript/compiler-corpus-original-regressions.eli
  run-original-regression / 18项原test入口
  -> 先归档完整source/request，再校验同一receipt；获准才记录未执行及skip
  -> 无receipt照旧真实编译执行+独立Seed比较；固定18项分母不变
Makefile compiler-release-ci(:~44)
  -> 最终stage3功能small调用显式传性能后置旗标；原严格入口不变
README.md(:64) -> 当前仅JS宿主自举、三输出与压力后置的公开边界
```

```mermaid
flowchart LR
 A[完整原source/request归档] --> B{small + 明确后置旗标 + 稳定ID及身份验证}
 B -->|不接纳| C[原编译/执行/独立Seed比较]
 B -->|接纳WASM/native深树压力| D[resource-deferred 不是通过]
 C --> E[原断言通过/失败]
 D --> F[汇总明确列失败遗留与实际通过范围]
 E --> F
 F --> G[其余功能通过后自举/最终stage3/版本与签名交付]
```

| 施工项 | 写齐 | 验收项 | 通过 |
| --- | --- | --- | --- |
| A128 本次范围、稳定ID、原身份和明确非通过语义 | [x] | 旧严格模式不变，记录能独立核对 | [x] |
| B128 先写延期正反边界测试，不运行 | [x] | 三ID认证；未知/改写输入/JS/无旗标拒绝 | [x] |
| C128a 现有资源延期框架追加窄范围receipt | [x] | 不吞语义失败、不修改完整原输入 | [x] |
| C128b 原18回归归档后读receipt，明确skip而非pass | [x] | JS6和其余binary6照旧执行，压力binary6保留非通过 | [x] |
| C128c CI功能目标旗标、README公开边界、派生contract真实生成 | [x] | 全部源码写齐后统一验收并收集结果 | [x] |
| D128 功能前置/严格bytecompile→固定点→最终stage3与完整最终门禁 | [ ] | 明确effective范围、全部遗留数；不以延期冒充全语料通过 | [ ] |

FIX23仍作为1组性能/深树压力遗留，不重置此前失败次数。C127相关功能
修后失败0次；最新完整570/WASM为取消，非新增语义断言失败。另有1项
compiler parity派生identity陈旧，全部代码写齐后只由原生成器重新派生。
版本升级仍依本节明确范围的实际功能、自举、包与浏览器验收，不提前升级。

C128全部实现与测试写齐，进入统一D。新receipt仅明确开关与双binary目标
接纳三稳定ID；完整inputIdentity/sourceProofs与原host/assertion保留，功能
unverified、性能failed、状态resource-deferred。原million六ID机制不变，
测试分别核对两个固定ID子集、篡改拒绝和原对象不变。原18项名称/期望
均保留，先存完整source/request再记录未执行与skip，严格入口依旧真实执行。

D128首批统一测试41项，39通过、2失败，137.820s、峰9470845632字节、
cleanup=true；原真实native产物完整字段/字节/archive验证107.140s通过。
两失败同源：新认证代码错误要求普通570具有suite，但它实际只有fixture/
host，631/649才有suite/region。集中修正为两种真实合同，保完整输入绑定
与逐字host认证，新增缺suite原形与suite路径/hash/region篡改拒绝测试。
初次失败1轮/2项，尚待实际复验，未把无结果写通过；其余39项不重复跑。

集中修复后受影响2/2通过，3.453s、峰1911668872字节、cleanup=true；
复用同批未受影响39项，共41/41通过。C128初次失败1轮/2项、修后仍失败
0次。全部标准工具/测试已由真实Emacs入口生成（29.868s），两项派生
contract由原生成器成功重新派生。新增13份legacy MJS归档均以Git blob
核对为原HEAD对应旧测试的逐字副本，无手写新JS或提交生成物。

D128前置收齐：原18项中实际功能12/12通过、语义失败0，压力6项明确后置
不计通过；按原分母为12/18通过(66.7%)、6/18未通过/后置(33.3%)。
JS6/6，WASM3/6、native3/6，各保3项压力非通过。完整原604/601分别
WASM62523.401/16209.277ms、native194703.330/62070.254ms，均保独立
Seed comparison=equivalent。严格bytecompile通过；Emacs248/248通过。
整轮465.908s、峰10551137448字节、cleanup=true，make exit2唯一原因是
核心Bun入口缺旧IR ingress档案，尚未启动该批Bun用例；不冒充test-core通过。

集中修正仅补回`tests/compiler-ir-session-ingress-test-legacy.mjs`：取原HEAD
对应`tests/compiler-ir-session-ingress.test.mjs`逐字归档，SHA256
510213d89769be93ce574f11de72061e2f7ff5605cfb792d79388aa419807183，
与既有scope/test固定期待相同。复用现成完整测试，无新手写JS、不改原断言。
一次查完所有显式legacy引用，仅此文件遗漏。入口失败1次，补齐后复验完整
test-core；原18项、应用及bytecompile未受影响不重复跑，再通过才完整自举。

完整core续跑在107.530s被controlled-run的measure_footprint/EPERM采样错误
中断，峰1582153728字节、非超限、cleanup=true；不记为程序失败。沿原
Makefile306份Bun文件与日志的实际header/完整结束摘要核对，只确认13份
完整通过；并行输出归属不能确定的另几份保守重跑，不凭pass行冒认整文件。
保留完整306 inventory、已确认13与剩余293的持久续跑数据；使用现有runner
接续293，随后完成原Node文件组与四份CLI命令，不重跑已通过的Emacs、
contracts、原18回归与bytecompile。监控问题已按原授权反馈skill维护对话，
主线继续受控单重任务，不更改预算或绕过内存计量。

续跑新增完整通过55份文件，合并此前13份共68/306（22.2%），尚未通过
238/306（77.8%）；此比例仅为核心Bun文件验收，不是整体施工比例。
`c128-core-resume-bun.log`记录IR ingress前两项真实通过，第三项source/
IR graph多目标比较尚未结束即触发session_memory_limit：326.679s、峰
26243207880字节、exit137、cleanup=true。保留为资源失败，不伪造语义
断言失败；该项资源验证失败1次、修后仍失败0次（尚未复验）。停止追加
内存或原样重试，先集中查清完整产物/调试数据的保留与比较，再修复后
接续剩余原文件；已通过68份不重复执行。对应持久续跑清单为
`c128-core-resume-after-memory.json`。该新阻塞意味着此时不能声称只剩
12000层；性能深树仍按本节后置，不混同此次测试资源失败。

### C129：IR graph完整比较的有界存活产物

沿用C128验收，唯一当前新增资源失败位于
`tests/eliscript/compiler-ir-session-ingress.eli`第3项。原四份完整产物
同时存活，普通JSON响应还把typed/debug共享子树重复展开。只修改此Eli
测试，复用既有graph-events-v1及responseStringChunks，并用
`graph-product`/`compare-graph-product`顺序比较baseline加一份candidate。
不改生产协议、旧原始archive、输入图或期待值；bytes、descriptor、native
typed、debug、JS模块/sourceMap、反转顺序和实际-0执行断言全部保留。

| 施工 | 完成 | 验收 | 通过 |
| --- | --- | --- | --- |
| 完整根因、现成协议、原第3项全部断言复用 | [x] | 同一整文件5项通过且实际内存受控 | [x] |
| 顺序比较且不向调用者返回candidate，复用graph分块响应 | [x] | 原剩余238文件接续，无重复68项 | [ ] |

全部代码已写齐后集中生成与验收；资源失败1次，修后仍失败0次（未复验）。

C129实际统一续验中，该IR ingress整文件5/5通过，77.37s；原第3项完整
三目标及全部排列比较63204.11ms通过，原前两项5320.68/941.40ms，后两项
942.07/2.73ms。修后仍失败0次已获实际证据，运行继续原剩余文件，未增加
预算、删除断言或重跑68份既有通过文件。整树峰值待本次完整结束记录。

### C130：统一验收收齐后的迁移接线修正批次

C129续验整树1094.908s，峰21054291968字节，cleanup=true；原238文件
启动33，29通过，3项断言/加载失败、1项旧内部资源限额中断。合并C128
既有68份，97/306通过（31.7%），209/306非通过（68.3%，其中4项已有
失败证据、205尚未启动）。真实归档为现成runner的
`final-functional-scope-1792583703256-84109.json`。外层并未超24GiB；
direct-WASM文件在持续通过浏览器用例时被内部旧8GiB上限打断，采样
8617394176字节，非功能断言失败。原已通过文件不撤销，不原样重试中断项。

先接续205原未启动文件、原Node组与CLI收齐独立问题，再一次写齐修正，
集中复验受影响文件，通过后完整自举。未扩展压力优化或新编译器运行形式。

| 稳定问题 | 失败证据/次数 | 源码修正位置与原则 | 编码 | 验收 |
| --- | --- | --- | --- | --- |
| C130-A1 Unicode旧档案遗漏 | 加载失败1次；未修、修复重试0次 | 恢复HEAD旧工具逐字archive，固定SHA已吻合，禁止新手写JS | [ ] | [ ] |
| C130-A2 私有根测试提取遗漏 | unbound symbol编译失败1次；未修、修复重试0次 | managed-root-lifetimes.eli names补生产managed-immediate-result-p，保留原epoch与根断言 | [ ] | [ ] |
| C130-A3 prepare旧计数合同 | 105与29断言失败1次；未修、修复重试0次 | 原测试observer保存生产stage调用前完整initializers；按state加全部projectPrepare输入逐项核身份、顺序与单child，命名子集仍与原provenance严格相等；禁止改固定数字或漏匿名常量 | [ ] | [ ] |
| C130-A4 direct-WASM旧内层限额 | 资源中断1次；未修、修复重试0次 | 复用现有严格串行outer-guard路径，保24GiB整树与本对话合计、原用例与断言；新增对应scope隔离测试 | [ ] | [ ] |
| C130-A5 持久数据完整host的Keyword打印协议 | 本轮WASM/native各Bun/Node共4项失败；修复重试0次 | 普通边界/类/元数据/别名及正则品牌检查通过；完整host在IPrint/print拒绝Keyword，集中核对JS参照、构造器与协议注册真实模块身份，不以性能后置该功能失败 | [ ] | [ ] |

后续完整持久literal文件原20项中16通过、4失败，89.20s；上述四失败
属于同一候选的一轮验证，不记成四轮修复失败。该文件与容量后置收据
均保留，既有capacity skip不计原完整验收通过。

### C127：最后一批确定的重复根与普通对象读取开销

当前授权：若这次集中修复仍不能消除FIX23的明显性能异常，保留实际性能
失败和后续优化事项，按完整功能正确性继续收尾。不能把性能失败改成通过，
也不能降低同源输入、输出、异常、资源清理或stage2/stage3字节一致标准。
完整12000层测试仍验证功能；性能验收与功能验收分别记录。其余真实功能
失败仍须修复，不能因本项后置而漏掉。版本仍为0.0.1，全部功能门禁成立
后才更新0.0.2、签名提交并推送。

C127最终短段结果：创建5372.617ms、下降96层6412.159ms、224层7744.953ms，
128步1332.794ms，仅较C126再改善约3.5%；8.501s诊断主动退出2，峰
1042415616字节、cleanup=true。性能仍失败，本次停止继续性能开发，将其
保留为下周期优化项。新增根槽/Get代码须先完成实际功能验证才可保留交付。
协议完整16/16通过，38.576s、峰2407088128字节；独立编译器与WASM候选
构建成功10.708s、峰1188799768字节。Bun两组在beforeAll静默退出，无用例
结果，未计通过；正式fixture入口同样退出，继续定位准备阶段而非盲报断言
失败。另有一次启动参数位置错误触发package test脚本，其contract corpus
派生identity失败1次；已回收，不记为生产语义修复失败。原始日志均保留。

准备阶段问题已定位为本次启动参数的路径形式：原C126真实通过命令使用
`bun test ./tests/...`；本次把它写成`bun test tests/...`，后者在Bun中是搜索
filter而非精确文件路径。官方测试文档要求`./`或绝对路径选具体文件。恢复
原精确文件入口后allocator完整60/60通过，7.905s、峰1303347200字节，
cleanup=true，新增两个Get合同均通过；不需要改生产代码或增设兼容层。
保留直接/正式runner传filter时静默退出及一次JUnit无文件的诊断记录，
它们不是生产行为修复失败。后续所有Bun测试使用原精确`./tests/`入口。

C126真实短段诊断：12000层创建5488.864ms，下降96层累计6545.204ms、
224层累计7926.844ms；128步差1381.640ms，比C125的1642.598ms改善约
15.9%，仍判性能失败。诊断主动停在224层，exit2、8.701s、峰1170866176
字节、cleanup=true；退出时资源关闭错误保留在日志，不当成完整功能通过。
本批语义104/104通过也不能替代完整深树结果。数值算术源码实际使用
load-f64与直接算术，排除“全用软件浮点运算”的假设，不据此扩展新后端。

基线master fb98a50及现有未提交工作；仅修改下列源码，生成物继续忽略。

```text
现状 -> 目标（同一源码树、同一模块与ABI）
bootstrap/backends/managed.eli
  :107 managed-result / :1672 lower-managed-module-literal / :1709 literal-uncached
  nil/Boolean/undefined根槽 -> 0..3立即值无GC根，snapshot-managed(:2170)保常量
  常量读取根+冷分配根 -> 共用读取结果根，String写payload前仍先root
bootstrap/runtime/memory.eli
  :27055 value-source-get-with-receiver -> 验证后kind13直接调用既有
  :24990 value-object-get-with-receiver，复用其纯data原型链与完整慢路径
tests/eliscript/native-managed-runtime.eli   编译器根槽及同源集成验收
tests/eliscript/memory-allocator.eli         普通源Get分配及回退合同验收
```

```mermaid
flowchart LR
 A[立即值/池化常量/普通对象Get] --> B[删除已确认的重复根或外层frame]
 B --> C[保留原GC保护与完整慢路径]
 C --> D[整批代码写齐后集中验收]
 D --> E[同源三输出完整功能与耗时分别记录]
 E --> F[自举固定点与最终stage3验收]
```

| 施工项 | 写齐 | 验收项与明确期望 | 通过 |
| --- | --- | --- | --- |
| A127 精确源锚点、共享根/立即值与Get委托设计 | [x] | 不新增缓存、GC算法或数值实现 | [x] |
| B127a managed测试先写不运行 | [x] | 根槽减少，String初始化/负零/GC/首次错误保持 | [x] |
| C127a immediate与pooled共根实现 | [x] | 原生成代码语义及相关完整集成组通过 | [x] |
| B127b source Get测试先写不运行 | [x] | 继承data/miss免帧；访问器、转换、receiver、foreign保持 | [x] |
| C127b kind13复用既有对象Get实现 | [x] | allocator与协议整组通过 | [x] |
| D127 同源12000层三输出比较及统一功能门禁 | [ ] | 功能逐项断言；耗时和内存单列，不伪装性能通过 | [ ] |

所有B/C完成之前不启动C127生成或测试。现存C126完整native比较是已完成
代码的D阶段，单树受控；不能把未改变的慢WASM反复重跑。当前FIX23本次
C126修后性能仍失败1次，诊断中断与完整断言失败分开；历史次数保留原记录。

D127相关完整测试全部通过：allocator60/60、协议16/16、native31/31，
共107/107。native53.458s、峰5281136640字节、cleanup=true；真实IR根槽
0/1断言及三输出立即值/String/负零均成立。本批生产行为修复后仍失败0次；
性能短段仍失败1次，后置记录保留。stable corpus identity已由原真实生成器
重新派生，未手改测量或摘要。下一步按现有命令集中执行完整功能前置门禁、
严格字节编译、原18项对照，再完整自举和最终stage3三输出；不再新增优化。

C127实现写齐：`managed-immediate-result-p`仅允许u32 literal整型0..3；
managed-result/snapshot-managed保持此纯值，不能按allocating=false笼统免根。
`managed-literal-allocation(state,expression,target)`让池miss直接写原root，
String借payload前仍先root；init不分配且原值返回，不重复发布。新增真实
typed IR断言立即值函数frame容量0、Number/String/数组结果容量1，兼验
JS/WASM/native输出、UTF16/负零及原moving GC组。对象Get新增两项完整raw
合同测试，未新增导出。全部实现后才进入D127。

C126 native原完整用例运行101.657s仍未完成而取消，exit130、峰429375488
字节、cleanup=true；新mapping消除了原巨型JS backing，但不据此声称速度
或完整功能通过。现有functionalRuntimeProfile=small保留originalDeadlineMs、
设置performanceAcceptance=deferred且不强制时间截止；570/631/649不在资源
跳过白名单内，仍须原完整输入、真实结果和独立Seed oracle comparison通过。
最后修复后若仍慢，只要有可观察进展、内存受控，可完成这项功能验证并单独
保留性能失败，无需新增跳过机制或改测试层数。

### C126：复用现有模块常量槽与原生虚拟地址映射

触发证据：C125语义97/97通过，但WASM每128down仍1.643s；native原用例
15.466s达8.68GB取消。原native诊断8192次slice共118822字节、最大52字节，
1.270s时RSS2.223GB；程序前arrayBuffers已约4GiB。小slice不是数GB增长解释。
heapUsed字段为宿主报告且不等同实时物理占用；不据此断言宿主GC缺陷。
不再调阈值或无改动长跑。仅复用已有机制处理两类确定的重复/容量分配。

#### C126a：源码primitive字面量复用现有readonly模块槽

- [x] A126a：基线managed.eli:1666 `lower-managed-literal`每次新建String/
  Number；:2280 static-key、:4962 collector已有私有nil槽。保留collector名，
  增收source literal String到原`literalKeyCells`，Number以float64 low/high
  字串键收入新`literalNumberCells`；`+0/-0`及NaN/Inf按精确两word区分。
  两类槽均沿原`globals/initializers/projectPrepare`发布，无额外GC/cache。
  collector返回两张map，core/function/lambda/state传递；没有module或未被
  collector收集的合成literal继续旧路径。readonly nil仅占槽，未使用不分配值。
- [x] A126a：原分配逻辑拆`lower-managed-literal-uncached`；新wrapper只为
  原始String/Number且已有cell生成`value-module-get`，非nil直接复用，nil才
  原分配并调用新`value-module-literal-init(heap,index,value)`，返回值重新root。
  static-key也调此wrapper，共用String槽，不再嵌套自身导致递归。旧String-only
  `value-module-literal-key-init`保留合同；新runtime入口由runtime owner实现。
  GC、循环早期call、module close及escaped environment沿现有slab生命周期。
- [x] B126a：先写同源JS/WASM/native语义及分配差分：重复String/Number函数
  与读取相同global常量的函数比较live分配量，UTF16/NUL/lone surrogate、
  精确负零/非有限/边界Number；数字特殊值通过真正literal IR构建并验证两产物，
  不把引用NaN/Infinity算literal。补unused primitive低slot容量、phased early
  String/Number、独立heap/module、moving GC、escaped closure与close后清理。
- [x] C126a：collector、wrapper/uncached、static-key和四处map传递及测试写齐。
- [ ] D126a：仅主任务整批生成与执行；未运行不记通过，不修改原期望或层数。

```text
现状/目标（具体符号、参数、守卫见C126a/b/c）
bootstrap/backends/managed.eli
  每次String/Number literal新建 -> 已有module私有readonly nil槽首次使用初始化
bootstrap/runtime/memory.eli
  String-only key-init保留 -> 增primitive literal init，共用原槽生命周期
tools/backends/eliscript/native-memory.eli
  mac maximumPages对应巨型JS Uint8Array -> 复用现有guarded mmap地址空间
tests/eliscript/native-managed-runtime.eli
  中段module literal集成测试 + 末段真实native映射/标量边界（分开所有权）
tests/eliscript/memory-allocator.eli
  primitive槽raw合同、移动GC、关闭和类型/错误边界
```

```mermaid
flowchart LR
 A[每次执行分配primitive] --> B[现有readonly模块槽]
 B -->|首次| C[原uncached分配和原bits]
 B -->|已有| D[当前heap有效handle]
 E[mac最大容量JSbuffer] --> F[现有原生mapping机制]
 F --> G[保留initial/maximum页数和bounds]
 C --> H[全部代码写齐后集中验收]
 D --> H
 G --> H
```

| 固定单位 | 源码写齐 | 对应验收通过 |
| --- | --- | --- |
| C126a 编译器String/Number私有常量复用及同源集成测试 | [x] | [x] |
| C126b primitive槽初始化raw合同和allocator测试 | [x] | [x] |
| C126c mac native映射及大容量无JSbuffer分配测试 | [x] | [x] |

A完整设计、B全测试先写不运行、C全部实现之后才执行D；当前三位工作者仅并行
写源码，重任务继续串行。ABI约定新增`value-module-literal-init(heap,index,value)`
返回实际value；旧String key-init不放宽。只允许不可变String/Number，按binary64
双word区分数字，未用常量不分配，不能借用函数缓存或逐slot扫描。原生映射保
所有资源、guardpages、复制和关闭合同，不允许map失败回退4GiB JSbuffer。
固定FIX23仍失败，三输出深树仍1/3通过；C126未验收不算完成，不改版本。

D126首次集中生成native-memory和allocator成功；native测试文件末尾额外闭
括号导致生成失败1次，交单owner用reader检查整module与所有测试归属。
allocator实际55/58通过，7.596s、峰1320681472字节、cleanup=true；新增3项均
因测试image没有导出`value-module-begin`等既有原函数而失败，旧55项全部通过。
源码确认函数及参数合同确实存在；初看TypeError而称函数不存在的判断不准确。
沿用已有raw测试的IR export追加方式补齐测试接线，不改生产API或削弱断言。
本批allocator初次失败1轮/3项，修后仍失败0次（首次复验前）；native测试
初次生成失败1次。协议整组独立收集，全部已知缺陷合并修齐后才复验。

集中补修后：module raw测试只补真实函数的测试IR exports，失败3项复验3/3
通过（7.925s、峰1209942016字节、cleanup=true）；其余原55项未受export接线
影响，保留同批通过证据。协议完整16/16通过（40.955s、峰2696085504字节）；
native测试结构两处定位修齐后，完整30/30通过（52.437s、峰6124158976字节），
均cleanup=true。新三目标primitive分配差分、unused/lazy/循环早期/4heap/GC/
close/finite/UTF16/负零与nonfinite原拒绝合同全部成立；最大65535页真实原生
映射无容量大小JSbuffer、双owner/边界/清理、原zero-slice/zero-DataView热循环
断言不变且通过。总58+16+30=104/104通过；两项修后仍失败0次，历史初次失败
记录保留。开始构建完整C126性能候选，尚不把这些语义通过当作FIX23关闭。

#### C126c：mac复用guarded anonymous mmap，保留零DataView热循环

Apple官方[mmap说明](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/mmap.2.html)
及本机MacOSX SDK `sys/mman.h:99..101,109,131,176`确认PROT_NONE=0、
READ|WRITE=3、MAP_PRIVATE=2、MAP_ANON=4096、MAP_FAILED=(void*)-1。
`mach/arm/vm_param.h:50..54`页大小是运行时值，继续真实getpagesize，不硬编码。

- [x] A126c：`native-memory.eli:23 linuxMapping`泛化为
  `anonymousMapping(ffi,maximumBytes,libcLibrary,platform)`；mac默认加载
  `libSystem.B.dylib`、flags4098，Linux库列表/flags34不变。原mapping大小
  为round-up(max(1,maximumBytes),page)+2*page，mmap先NONE再mprotect仅
  usable区，base跳过首guard。保原ABI current/maximum字节值及range检查，
  map失败抛错并释放原资源，绝不退回巨型JSbuffer。openNativeMemory全部
  Bun原生路径使用该mapping；Node原childtransport接口不变。
- [x] A126c标量：mapping open时一次创建私有8-byte scratch、DataView及
  固定2/4-byte views。LE仍ffi.read；BE u16/u32交换字节、f64把两word写
  scratch后按BE读。写入完成owned层ToNumber与range后，在scratch编码再
  用短rangeView.set固定scratchView，无新DataView或slice，不跨用户转换
  持有scratch数据。scratch及mapping backing均不公开。公开read仍副本，
  write先snapshot后range，重入close/first-error/undefined全部保留。
- [x] B126c：保原scalar热循环0 DataView/0 slice断言，另写真实既有dylib
  测试：最大65535页时拦截大Uint8Array构造、两个owner地址空间相互独立、
  首尾逻辑边界/超界、read副本独立、关闭后另一owner仍可用及重复关闭。
- [x] C126c：泛化mapping、scratch零分配标量、移除mac巨型buffer分支及
  新测试全部写齐；不生成、不运行。
- [ ] D126c：由主任务在三组全部写齐后统一生成并验收，沿原同源12000层
  JS/WASM/native比较；源实现不能替代实测内存与功能结果。

#### C126b：primitive模块常量槽的原始初始化合同

固定修改`bootstrap/runtime/memory.eli`原literal-key-init附近和
`tests/eliscript/memory-allocator.eli`末尾，不改GC/缓存/函数身份机制。

- [x] A：新增`value-module-literal-init(heap,index,value)`，返回原value。
  它与旧`value-module-literal-key-init`共用内部
  `heap-module-literal-init(heap,index,value,numbers)`。守卫顺序保留原
  heap/module状态、绑定索引/声明、readonly、initialized、local及nil槽。
  新入口只额外接受完整generation有效的kind4 Number；kind5仍须sealed。
  旧入口仍仅String，原错误码不变。无pool扫描、分配、host通知或GC点。
- [x] B：先写齐三项allocator测试但不运行：±0及两种NaN payload原word/
  handle身份、sealed String、零分配/零frame、complete后懒初始化、movingGC、
  close；对象/Symbol/可变String/立即值/stale拒绝与旧String入口；TDZ、
  mutable/external/非nil/未声明/越界槽、重复写不覆盖和abort原错误。
- [x] C：已实现共享helper及新入口；编译器接线和私有槽复用归C126a，不在
  本组重复修改或提前计作通过。
- [ ] D：三组代码全齐后统一生成和集中验收allocator；未运行不计通过。

#### C125a：新own字段直接写真实属性表

基线为C123语义90/90通过后的当前工作区；只改`memory.eli`的
`heap-owned-object-put`及其紧邻辅助（原16956..17030）和既有allocator
测试，不改frame/GC架构。旧流程为mode2新字段→转换key→4-slot frame→
table-put；新流程为已验证operands→私有准入→table-put，其余完整旧流程。

- [x] A125a设计：新增`heap-object-create-own-try(heap,object,key,child,mode)`，
  仅mode2、kind13非namespace、header24为0/65536、header28低两位为0、
  sealed String或Symbol、当前own table无该键准入。`4`仅内部miss，成功为
  原table-put结果1，真实错误0且保last-error。`__proto__`在mode2是普通
  自有字段，不查prototype，不调用继承setter；existing/assignment/mode1/
  accessor/namespace/native特殊flags/不可扩展或frozen全部回原实现。
  在`heap-owned-object-put`原heap/kind/mode/namespace/reference检查之后、
  key转换分支之前接入helper；失配不分配、不清异常、不执行用户代码。
- [x] A125a根生命周期：table-put扩容可能GC，故先借object/key/child，
  成功取得所有需要的根后才调用table-put；不能保留跨调用raw block地址。
  保存first last-error后按child/key/object归还，只归还实际取得的根；根计数
  饱和等不可取得保护时miss原路径。没有用户回调或新增持久缓存。
- [x] B125a先写齐不运行：String/Symbol/undefined/`__proto__`新字段无frame；
  同一object多字段扩容forced movingGC后handle/值正确且无遗留pin；mode0/1、
  existing accessor、受限flags、namespace、frozen/nonextensible及mutable key
  拒绝私有准入并保完整旧路径；OOM first-error与全部根归还。
- [x] C125a辅助、接线及全部测试实现完成；未运行不计通过。
- [ ] D125a由主任务整批统一生成并运行`tests/wasm-memory-allocator.test.mjs`，
  原断言及frame计数完整通过后再记验收，不以施工完成代替验收。

### C125：集中消除对象创建保护帧、原生对象操作回环与native标量复制

承接C123语义90/90通过、完整深树1/3通过，以及C124投影后native仍异常。
本批固定施工/验收分母为三组，不改变12000层、公开容器行为、原断言或资源。
先完成三组全部测试源码与实现，再统一生成、分层验证和比较；无新代码不重跑。
三个工作者只并行写源码，不并行启动编译、测试或深树程序。

```text
现状 -> 目标（具体接口/守卫由以下C125a/b/c清单绑定源码补齐）
memory.eli heap-owned-object-put
  新own字段 -> converting/4-slot frame -> table-put
  新own字段 -> sealed primitive key + ordinary mode2守卫 -> table-put
memory.eli foreign-invoke + managed-host-object-realm.eli
  已认证Object方法 -> host tuple/codec/preflight -> raw算法
  已认证Object方法 -> 原owned准入守卫 -> 同一raw算法
native-memory.mjs（旧手写）+ native-managed-runtime.eli
  scalar -> read/copy slice -> new DataView
  native-memory.eli生成原mjs -> 私有scalar读取/写入 -> 无复制字段访问
```

```mermaid
flowchart LR
 A[源码确认的三类冗余] --> B[三组边界测试先写齐]
 B --> C[三组实现及全部接线写齐]
 C --> D[统一生成与受影响单元/集成]
 D --> E[同一原用例 JS / WASM / native 分进程比较]
 E --> F[记录耗时 CPU 最大RSS/footprint及原断言结果]
```

| 固定单位 | 源码施工 | 集中验收 |
| --- | --- | --- |
| C125a 普通mode2新own字段免转换帧 | [x] | [x] |
| C125b 认证Object原操作直派和descriptor原始预检 | [x] | [x] |
| C125c native-memory源迁移及私有标量读写 | [x] | [x] |

安全边界：所有回退及用户覆盖、Proxy、原型污染、getter/首次异常、移动GC、
关闭和字节读写复制合同必须保留。只消除可证明冗余，不把暴露buffer或放宽
准入当优化。C125c不改最大页数/原资源，也不新增映射实现。
固定主问题仍8/9关闭、FIX23失败。C125未经执行的验收仍计失败，不增加
实际失败轮数；真正运行后的首次失败与修后仍失败、诊断取消分开记录。

D125首次集中证据：全部三组源码/测试写齐后才开始。源码括号7/7与diff检查
通过；生成native-memory/native-runtime成功后出现真实系统memory-pressure
warning，剩余四个guard准入拒绝，未启动、无所属遗留进程，不算编译失败。
压力恢复normal后才继续：realm/allocator/protocol生成通过，native新增测试
裸globalThis编译失败1次；三处修正后try结构仍编译失败1次。两次均保留日志，
不改写为程序语义失败。现集中修齐此结构问题，不启动旧生成物冒充新测试。
allocator完整55/55通过，7.665s、峰1226342400字节、cleanup=true；新own字段
四项的无frame、forced movingGC与OOM保护均通过。protocol完整14/15通过，
37.442s、峰2668445696字节、cleanup=true；唯一新增扩展fixture在原型污染
观察项出现9次额外prototype读取（预期0）。已运行总数69/70通过、1/70失败；
native本批未取得通过证据，仍失败。C125b首次行为失败1次、修后仍失败0次
（首次复验前）；C125c生成失败初次1次、修后仍失败1次，独立保留计数。
完整深树新候选尚未运行，不以这些小组结果关闭FIX23。

本次合并修正范围已锁定：native两项测试的finally误在try外（reader定位并
修齐）；迁移的四个effect-only write/close显式返回undefined，补零字节和
重复close断言。协议唯一失败定位为Object.create的普通结果继承Proxy原型，
默认literal自动branding的9种instanceof沿该原型链调用了9次用户trap；
这是实际副作用，不能删日志/放宽断言。仅将默认分类在安全非Proxy原型扫描
遇到Proxy时直接留foreign，保已注册source值与完整custom provider原优先级，
补普通对象/数组/函数、revoked/原始抛值边界。全部写齐才统一复验受影响项。

集中补修后native完整26/26通过（46.300s、峰5602492416字节、cleanup=true），
包括1000轮scalar无slice/无DataView新建，IEEE数值、未对齐/端序、边界、关闭、
first-throw与effect-only返回undefined。protocol新增边界test一处let绑定缺
闭括号导致生成失败1次，reader定位修齐后完整16/16通过（39.471s、峰
2626125824字节、cleanup=true），Proxy祖先零trap及原Object.create断言通过。
三组受影响语义总数55+16+26=97/97通过，失败0；未受后两组修改影响的55项
复用同批真实结果，不重复跑。C125b首次行为失败1次、修后行为仍失败0次，
修后生成失败1次；C125c初次生成失败1次、修后生成仍失败1次，现均修齐。
源码迁移后native-memory.mjs仅生成保留在ignored工作区，已取消tracking；
完整maintained .eli与bootstrap映射作为源，不提交MJS。当前开始构建C125
候选和原深树诊断，不因97项通过提前认定秒级或FIX23关闭。

C125实际深树诊断：同原12000创建6103.691ms（C123为7482.372ms），下降
96→224为1642.598ms（C123为1660.538ms），后者仅约1%差异，不能称为收敛。
诊断在224主动exit2，9.620s、峰1046904832字节、cleanup=true；不再原样跑
已明显非秒级的完整WASM。三目标产物同批构建32.837s、峰3034812136字节。
JS完整原断言通过：执行152.471ms、总152.871ms、kernel maxRSS131808KiB。
新native按原资源/最小ABI配置运行仍异常，15.466s取消、峰8681160704字节、
cleanup=true；未完成原断言。完整用例仍只有JS通过1/3，二进制失败2/3。
这次复制消除的97项语义通过保留，但不能冒充解决了native大内存根因。
下一步仅在既有observer增加原native的字节切片次数/字节数/调用栈诊断，
复用同一产物，明确诊断停止条件，不继续盲跑，不先调GC或追加内存。

#### C125b：认证Object操作直派和descriptor原始预检

固定源码：`bootstrap/runtime/memory.eli` 的 foreign登记/调用区域、
`tools/backends/eliscript/managed-host-object-realm.eli` 和
`tests/eliscript/managed-protocol-dispatch.eli`。不修改普通字段写入区域。

- [x] A：私有登记码401–407分别为真实Object的freeze、isFrozen、create、
  getPrototypeOf、getOwnPropertyDescriptor、hasOwn、defineProperties。
  登记仍由原native身份认证完成；复制旧精确参数数目、owned类型、namespace
  排除及原始key准入，使用同一raw完整算法。defineProperties仍调用
  `value-object-meta-builtin` operation1，不绕过foreign descriptor/原型读取。
- [x] B：先补齐同一份Eliscript用例的七项零Call、JS/WASM/native结果、
  GC后复用、Proxy/替换函数、对象key转换原异常、foreign descriptor原异常、
  Object.prototype污染、own undefined/accessor/继承拒绝、raw预检零分配、
  登记与dispose撤销断言；写齐时不运行。
- [x] C：`value-foreign-intrinsic-register`、`heap-source-foreign-invoke`
  扩展七项；`native-runtime-intrinsic-tag`接线；新增
  `value-source-data-definition-p`一次扫描六字段own属性及data/accessor标记，
  无字符串/descriptor/根帧分配。`native-data-definition-p`仍逐次检查原parent
  与`hostObjectDescriptorPrototypeClear`。defineProperty不新增直派，
  hasOwnProperty/Function.call不扩展，所有原回退及first-throw保留。
- [ ] D：三组代码全齐后由主任务统一生成和集中验收；未运行不计通过。

#### C125c：native私有标量读写和完整工具源迁移

绑定当前源码：旧`tools/backends/native-memory.mjs:1..218`完整迁移到
新`tools/backends/eliscript/native-memory.eli`，导出仍仅openNativeMemory；
`bootstrap.el:330`旁新增生成映射，`.gitignore`忽略原输出及map，由主任务
统一删除旧输出tracking，不手写或改生成JS。完整保留平台验证、Linux mmap/
guard pages、Node childtransport、FFI签名/callback、trap/debug、嵌套调用和
关闭first-error。不改initial/maximumPages或mac分配策略。

新增owned内部`getUint16/getUint32/getFloat64(offset,endian)`及
`setUint16/setUint32(offset,value,endian)`，仍返回原标量/undefined，不暴露
backing。mac在open时建一个私有backing DataView，读取经过active/range后
直接访问；Linux little-endian读取走ffi.read.u16/u32/f64，big-endian及写入
只借短DataView，不slice；ARM64本机为little-endian。公开read仍独立复制。
写入先Math.trunc(value)完成原ToNumber（BigInt/Symbol拒绝，valueOf只一次），
再active/range再写；不把Number(BigInt)当转换，重入close后必须拒绝，不能
使用已释放mapping。native-managed-runtime.eli:185..195 facade优先新方法，
Node旧owned无方法时保原read/write路径，不改Node传输合同或扩平台。

- [x] A125c已精确绑定迁移、生成、facade及生命周期设计。
- [x] B125c在既有native-managed-runtime.eli写齐：native scalar小端/大端/
  unaligned/NaN/Infinity/-0，热循环slice及DataView构造计数为0（mac），
  bounds/closed、valueOf关闭后写拒绝、BigInt拒绝、公开read副本仍独立。
- [x] C125c完整迁移、生成映射、忽略项与facade接线全部写齐，未运行。
- [ ] D125c由主任务在三组代码齐后统一生成、运行现有native及新增测试，
  之后同一深树三输出比较；不以源码写齐冒充无分配或功能通过。

#### C125D：仅观测原native程序的实际字节复制

C125语义97/97通过后，原native完整比较仍异常且已取消，标量零复制没有
解释全部内存。仅在ignored `depth-observe.eli`增加
`<原C125 execution.json> compare native-copy-diagnosis`。open context之后
保存Uint8Array.prototype.slice完整descriptor，以Proxy apply调用原方法，
按实际返回byteLength计count/bytes/max；前4次和新的大复制（至少64KiB）
记录Error.stack。每1024次在防递归guard内记录memoryUsage与runtime.stats，
全部仅writeSync到stderr，不污染原host报告。总复制达到64MiB或8192次
后恢复原descriptor并明确诊断exit2，绝不算通过；正常返回finally亦恢复。
源码、参数、二进制与断言不变，不重建binary，不运行新的验收轮。
- [x] C125D观测入口及停止条件设计。
- [x] C125D全部诊断源码写齐；由主任务统一生成后执行一次受控诊断。

### C124：native比较配置只携带运行所需ABI

C123三目标比较保留原完整fixture和断言；native执行配置误带完整typed
IR，文件321467418字节，比较器和原driver重复解析，造成额外GB级内存负担。
这不证明慢运行的全部根因已经解决，原WASM/native取消及失败记录保留。

- [x] B124d先写齐ABI投影断言：每函数仅name/arity，无body/locals，顺序、
  签名、exports、aliases及descriptor与原输入完全等效；其它执行字段原样保留。
- [x] C124d复用既有`snapshotNativeManagedRuntimeABI`。未来compare-targets
  在写native execution.json前投影；完整artifact、typed档案和二进制不改。
  已有产物用`prepare-depth.mjs <native-execution.json> compact-native-execution
  [execution-abi.json]`：原配置只读解析一次，校验同一投影，以既有metadata
  writer独占新建ABI配置，不重新构建，不覆盖原配置或已有输出。
- [ ] D124d由主任务统一生成工具、受控执行一次投影后，以Bun原preload运行
  `depth-observe.mjs <execution-abi.json> compare`；同一原12000层、原binary/
  source/product身份和完整原期望断言，输出`execution-abi-result.json`，
  保wall/CPU/内存及guard整树峰值。未经执行不得算通过。

D124d已实际执行：投影321467418→282960字节，9347.658ms，整树峰
894171936字节，ABI逐项验证通过，原档案/二进制保留。新配置native真实运行
在0.868s已进入host-start；30.919s因明显异常取消，峰8939978752字节，
cleanup=true，未完成原断言，仍失败。此为有新配置的诊断复验，不把取消
冒充语义断言失败，也不抹去C123原取消。配置修复通过，秒级可用性未通过。
源码继续确认：没有再次读取完整artifact/typed，仅重复读283KB配置；实际
native backing按原maximumPages预留约4GiB，scalar读取则每次slice+DataView。
不将这些静态路径全部等同为8.3GiB峰值来源；C125只消除已确认的复制路径。

### C123：一次消除可证明冗余的Get帧、调用保护帧和原生方法跨界回环

基线`fb98a50`加当前全部WIP，承接C122的61/61语义通过和深树仍失败证据。
用户明确要求本批代码全部写齐后，再统一比较同一12000层完整用例的JS、
WASM、native耗时和资源，以秒级可用性为目标；不改版本，不改断言/层数，
不再调GC阈值、不改持久数据结构合同，不把参考实现或外推时间冒充验收。
图索引无本项目覆盖，以下设计绑定工作区实际源码与符号。

```text
当前/目标源码树（M修改；复用既有入口）
bootstrap/runtime/memory.eli                       M Get、rooted invoke、认证foreign调用
bootstrap/backends/managed.eli                     M managed-invoke-arguments保护previous this
tools/backends/eliscript/managed-host-object-realm.eli M native身份登记与撤销
tests/eliscript/memory-allocator.eli                M 无分配Get/rooted invoke单元边界
tests/eliscript/managed-protocol-dispatch.eli        M 真实native身份/覆盖/foreign fallback
tests/eliscript/native-managed-runtime.eli          M 嵌套closure/throw/trap的两种二进制
_worktree/evidence/goal-0.0.2/c102-source-publication/
  prepare-depth.eli / depth-observe.eli             M 同源三目标构建和分进程比较（ignored）
```

```mermaid
flowchart LR
 A[managed-invoke-arguments已有caller根] --> B[args record]
 B --> C[heap-source-invoke-once再建保护frame] --> D[owned函数]
 E[已认证foreign Object/Reflect方法] --> F[host request tuple/frame]
 F --> G[JS识别同一native方法] --> H[再建tuple/frame调用原raw算法]
 I[普通data Get] --> J[先建通用frame再读实际table]
```

| ID/基线锚点 | 精确施工内容与合同 | 测试/验收 |
| --- | --- | --- |
| C123a memory:26851 value-source-get-with-receiver；相关object/Get辅助 | 对已验证sealed primitive key、普通owned对象的已存在own data直接读真实table/flags，不转换、不调用getter、不分配frame；undefined与缺失严格区分。accessor、namespace、惰性初始化、未知/foreign/原型情形仍完整旧路径。具体辅助和守卫按同批实现记录，不能读缓存替代当前table。 | A123a：实际frame分配计数不增加；GC移动、own undefined/accessor/异常与原fallback |
| C123b memory:24632 value-foreign-new之前、28008 invoke的foreign分支；realm:209 register-native-object-operations/dispose | 新value-foreign-intrinsic-register(heap,foreign,operation)，kind35 header+20私有word，0撤销；仅当前realm已有实际native函数认证接线调用。heap-source-foreign-invoke检查真实handle和当前参数：76 Object只nullish/owned对象，5 isArray，181..193 Reflect仅kind18或普通13/14非namespace，202/223/224/225 Array方法仅kind14，328 next仅kind17。最小arity与现有realm相同；直接用原raw实现及原args，不新建tuple。不合格走旧host-request，动态替换/Proxy/borrowed native保持原语义。dispose先清标记再释放已有roots，保first error与exception class。 | A123b：原native身份正例、borrowed函数、replacement/Proxy/foreign/namespace回退、holes/species/getter/first throw、dispose和资源清理 |
| C123c managed:2437 managed-invoke-arguments；memory:28008/28067 source invoke | 新编译器专用value-source-invoke-rooted-with-this(heap,function,receiver,args,count)。caller已root callee/receiver/args，再用managed-result取得并root previous this；仅非tail调用用新ABI。owned kind18分支保持原参数/函数/constructor验证、current-this设置恢复，省第二个frame；不借pin以免trap遗留。foreign走原once（含C123b）。原公共API保帧。抽heap-source-invoke-finish(heap,result)复用原tail trampoline，不能重跑callee。result在caller root前不分配；异常保原first error，trap由既有caller frame-unwind/reset清理。 | A123c：forced moving GC、receiver与previous this、primitive throws、tail transfer、invalid raw输入、真实native trap后可再调用/零frame；原raw行为保留 |
| C123d 既有prepare-depth/depth-observe | 增compare-targets入口，一次冻结原570完整源码/输入/断言及当前库，顺序生成JS/WASM/native后关闭compiler。参数`prepare-depth.mjs <suffix> compare-targets [compiler-artifact.json]`，默认当前C123候选；输出`depth<suffix>-compare/`下的冻结request、input-identity、comparison-build及每目标`artifact.json`、`execution.json`、`product/`。每个目标独立受控进程以`depth-observe.mjs <execution.json> compare`运行同用例；JS真实host，WASM原driver，native实际ARM64库+Bun FFI。复用完整原570 fixture/hostSources；当前zipper三目标共享，二进制literal仅persistent-vector更新、runtime当前，差异明确记入身份。无逐128日志干扰，构建与执行分开；每目标`execution-result.json`保source/compiler/runtime身份、原完整期望断言、结果、墙钟/CPU/内存，guard提供max(RSS,footprint)整树峰。 | A123d：三产物逐一结果一致、12000完整功能与实际秒数/峰值；未通过只记失败及原因，不改样例 |

局部数据均为现有u32 handle/word；不新增跨realm缓存，不保用户对象。新增
foreign标记为非引用word，不参与GC根；登记和撤销均验证当前generation。
rooted ABI只供编译器已保护所有活跃操作数的调用点；绝不把普通公共invoke
变成依赖调用者隐含保护的API。previous this写入现有caller frame，真实trap
仍随原unwind清理，故取消直接borrow-root代替frame的草率方案。

```mermaid
flowchart LR
 A[caller现有frame保存callee/args/receiver/previous this] --> B[rooted invoke省重复frame]
 B --> C[owned函数或原tail trampoline]
 D[realm真实native身份登记] --> E[当前callee标记+receiver/arity准入]
 E -->|满足| F[原raw算法直接执行]
 E -->|不满足| G[完整旧host路径]
 H[已存在own data Get] --> I[无分配读当前table]
 H -->|其它| J[完整旧Get]
```

| 阶段/固定施工单位 | 写齐 | 对应验收通过 |
| --- | --- | --- |
| A123 完整本批设计与所有权/生命周期 | [x] | 不适用 |
| B123 全部单元/集成/原用例比较断言写齐不运行 | [x] | [ ] |
| C123a Get无分配路径及接线 | [x] | [ ] |
| C123b 已认证native操作直接分派与撤销 | [x] | [ ] |
| C123c caller-rooted调用ABI与编译器接线 | [x] | [ ] |
| C123d 同源三目标比较入口 | [x] | [ ] |
| D123 集中生成、全部相关语义与三输出比较 | 不适用 | [ ] |

本批实现分母4项，验收分母为A123a..d四组；未取得通过证据均计失败，不拿
代码写完算验收。沿用主FIX23失败记录，本批首次运行前不增加失败次数。
已写C123c：managed-invoke-arguments非tail分支在现有caller frame保存previous
this，改调rooted ABI；返回先root结果再清private args/previous临时槽。
memory新增heap-source-invoke-once-rooted，仅owned函数省重复frame，foreign
委托原once，原公共入口保留保护frame；两入口共用原tail trampoline finish。
native测试先补嵌套closure/primitive throw以及nested真实trap断言，尚未运行。
已写C123a：`heap-source-own-data-get`在generic Get已验证输入后、通用frame
之前调用；4为内部miss。object只非namespace普通flags并排除惰性键；function
只已有真实info/bag、拒绝1/25/76/77角色和accessor；array用原index-direct守卫。
本批allocator新增4项已先写齐再实现，raw148计frame、raw152记callback深度，
覆盖无分配own Get、全部fallback边界、rooted移动GC/原始异常/原API/无pin。
三产物比较入口也已写齐，全部B测试代码已写齐未运行；实现3/4写齐，
尚余C123b接线，未验收项不算通过。C123c实际finish签名保留原function/
receiver/args/count局部，完整签名为(heap,function,receiver,args,count,result)。
C123b已写齐：私有登记/foreign直接派发、realm认证接线和dispose撤销，以及
全部边界测试。至此A/B/C全部完成，4/4施工写齐，开始D集中生成与验收。
集中生成6份：4成功，protocol/native测试各1次构造语法失败，已分别交原
owner成批修正。可独立运行的allocator首次49/51通过（96.1%）、2/51失败：
own Get frame计数75对11，pure runtime非callable错误期望11实际3；先按源码
定位并与原raw合同比较后合并修，不原样重跑。8.069s、峰1185153024字节、
cleanup=true；本批行为验收失败轮1、修后仍失败轮0（首次复验前）。
首次修复后allocator51/51全部通过，7.743s、峰1125908480字节、cleanup=true。
Symbol多帧原因是helper误调公共value-object-has，改底层value-table-has后
计数归零；错误合同改与旧API结果/错误码/源异常类/pending逐项差分。行为
修后仍失败0次。protocol/native生成修后仍各失败1次，继续同批修括号结构；
不把生成错误算成原深树运行失败，尚未启动长用例或重新自举。
生成语法已齐；protocol14/15通过（37.880s、峰2515681280字节），native
23/24通过（45.980s、峰5227610112字节）；均cleanup=true。加allocator共
88/90通过（97.8%）、2/90失败（2.2%）。native唯一失败是旧IR断言只认旧
invoke名字，改为新rooted入口，所有三目标预期与行为断言不变；新closure/
GC/真实trap及其余23项均通过。protocol唯一失败zeroCall实际10：7次真实
Reflect.apply调用已认证foreign数组方法/next尚未直派，3次fixture包含范围外
Object.defineProperty/keys。合并修：只允许真实已登记Reflect.apply+真实已
登记数组method/next+owned receiver/argumentList原raw路径；Proxy/unknown
foreign仍fallback。fixture额外3次用同组Reflect.defineProperty/ownKeys保原
观察值和zeroCall=0，补foreign receiver/list回退边界。此桥接问题首次行为
失败1次，修后仍失败0次（本次复验前）；IR名字问题首次失败1次。
桥接修齐后完整protocol15/15通过，38.318s、峰2598862848字节、cleanup=true；
实际认证报告严格零Call往返成立，Proxy/foreign receiver/list和first throw
回退也通过，dispose登记撤销完整。桥接修后仍失败0次。native仅复验改变
IR入口名的单项，其余23项未受该IR断言修改影响；原始通过证据保留。
native该单项复验1/1通过，12.523s、峰2205827072字节、cleanup=true；其余23项
沿用同批证据。相关语义共90/90通过（100%），本批三个行为修复均修后仍
失败0次；生成器两项各初次+修后失败1次后已修齐。原12000秒级验收尚未通过，
现在按同源三目标入口构建全部产物后统一比较，不提前宣布FIX23关闭。
三产物构建完成38.565s、峰3685112456字节、compilerClosed=true；原570同源
JS完整原断言通过，程序执行146.527ms、总146.986ms、kernel maxRSS132128KiB。
WASM完整运行明显异常，97.740s取消、峰1132396544字节、cleanup=true；native
59.199s取消、峰accounted11835925600字节、cleanup=true。二者未完成原断言，
均失败，三输出本用例1/3通过、2/3失败；不改写为功能通过或秒级通过。
本批原深树可用性失败1次，语义小组90/90结果仍保留。没有继续原样长跑。
接续诊断一次核查实际接线：现有observer仅增registrations-224模式，代理
实际WASM导出登记函数，报告它是否存在/实际登记operation与结果；复用刚生成
同源码C123进度候选与相同原资源，在224主动结束。全部代码写齐后才执行，
不再改runtime/GC参数、不重建编译器。并行只读核查native宿主内存与真实realm。
原候选短入口实际结果：登记API存在，76/5/202/225/224/223/328及181..193
全部有真实成功登记；create7.482s、96→224下降1.661s，仍非秒级完整通过。
11.423s在224主动exit2、峰1148157952字节、cleanup=true。原候选开关和runtime
源码身份也与当前一致；不再把慢归咎为旧接线。此为接线诊断，非原验收通过。
native内存只读根因已确认：execution.json 321467418字节带完整typed IR，
比较器与driver各完整解码一次；现有正式执行入口已有snapshotNativeManagedRuntimeABI
最小化方案可复用，不将比较器的数GB额外负担冒充native程序本身内存。

### C122：完整认证标准字符串哈希，以原始word整体计算避免逐字符装箱

基线`fb98a50`加全部既有WIP；C120/C121已证明调GC不是主解。固定9组仍
8组关闭，FIX23仍失败。本批只实现实际270字符/down的hashString调用快路，
不缓存字符串hash、不修改标准库算法或生产GC/内存参数。

```text
当前/目标源码树（四份修改，没有新增文件）
bootstrap/backends/managed.eli                 私有认证、link admission、uniform快路
bootstrap/runtime/memory.eli                   word哈希与try runtime导出
tests/eliscript/memory-allocator.eli            实际分配/边界/GC/miss测试
tests/eliscript/managed-protocol-dispatch.eli   实际认证与WASM/覆盖fallback测试
```

```mermaid
flowchart LR
 A[hashString uniform调用] --> B[分配frame/rest]
 B --> C[动态mixHash每UTF16单元]
 C --> D[boxed Number与charCodeAt动态调用]
 D --> E[finishHash/avalancheHash动态装箱]
```

| 变更/需求 | 当前基线锚点 | 完整目标步骤与接口 | 施工/验收 |
| --- | --- | --- | --- |
| D122a/Q122a | managed.eli:1 imports、4575 IR compare、5508 link | import纯frontend的compile-ir-string（compiler模块只依赖reader/expander/analyzer/lower/ir/emitter/project，未依赖managed）。私有`managed-string-hash-templates`首次解析内嵌四份原Eli defun；`managed-string-hash-shape`只删除span，所有kind/value/properties/children等完整保留；`managed-canonical-string-hash-p(id,program,context)`仅标准module ID或literal-context私有前缀，四份defun各唯一且逐形状相同。完整module扫描四名字的任何assignment/额外declaration/参数或lexical shadow，命中任一拒绝；不是只看名称或标记。 | C122a/A122a |
| D122b/Q122b | managed.eli:5489 link input records、5690 linked program、4880 lower core、3930 function | 认证结果仅存内部record，最终program对象作私有WeakMap键、值为canonical binding Set。lower在async复制前取Set，为本次构造的function记录置私有canonicalStringHash；不读取source或input marker。uniform原heap/function/args/count/参数验证、module-check、exception-class仍先执行；try(args,count)返回handle>3成功，0且error0才走完整旧frame/rest/body，真实error保留且不重跑。 | C122b/A122b |
| D122c/Q122c | memory.eli:1854 number-from-word、2060 u32检查、24508 constructor registry | 新`value-canonical-string-hash-try(heap,arguments,count)`：验证dense args，不触碰任何属性/转换；String constructor operation6已存在立即miss0/无错；count缺value、非sealed primitive string、非默认且非精确u32 primitive tag都miss。tag默认1831565813（missing/undefined），-0按0。UTF16循环`mix(h,x)=m^(m>>>15),m=(h^x)*1540483477`；初始mix(tag,length)，各unit mix，再mix(hash,length)，avalanche按16/13/16位和2246822507/3266489909原常量。全部word运算，读完输入后仅分配一个最终Number；caller保args根，移动GC不保留原始地址。 | C122c/A122c |
| D122d/Q122d | memory-allocator.eli beforeAll私有导出、managed-protocol-dispatch.eli backend复用 | 全部先写：UTF16边界、独立Eli旧算法/固定黄金、tags与extraargs、每命中只1 Number且0 frame/string、移动GC、miss不碰hooks、constructor已暴露miss。真实模块认证正例+改常量/assignment/shadow/同名非标准模块/伪marker拒绝；实际WASM对JS黄金；String原型覆盖返回值及throw false/undefined必须原路径。复用既有编译器/runtime/测试fixture，不新增JS/框架。 | C122d/A122d |

全部新增hash/tag/index/length局部为u32；arguments/value为handle。新私有WeakMap
不序列化、不持有用户对象、无输入字段授权；模板IR一次解析只供编译期比较。
完整慢路径保留，额外args仍合法且忽略，OOM错误不被miss吞掉。

初始化依据：四目标都必须是完整function-declaration，lower core将它们加入
functions而不是globals/initializers，普通reference经find-function获取，原JS
emitter同样函数声明提升；原module-check仍先执行。因此无需假造四个TDZ
cell；改成variable declaration或后续赋值一律不认证。测试把early全局初始化
的hashString调用放在四defun文本之前，与JS对比。link返回IR本身可改，故私有
WeakMap保存四个已改名定义的shape快照，lower前再比对并扫描canonical绑定
写入/影子，不能“先认证再改body”偷过。新增测试也覆盖此边界。

完整literal graph测试使用原hashValue→managed-value-state实际源码，测试image
只在word循环完成、Number分配前加计数；实际结果与计数同时断言，防止输出
相等却从未命中。String方法覆盖测试在真实构造器暴露后要求计数不再增加。

```mermaid
flowchart LR
 S[标准模块四defun完整IR+无写/无影子] --> P[私有program WeakMap绑定身份]
 P --> U[原uniform入口验证]
 U --> T{String未暴露且primitive输入}
 T -->|是| W[无分配UTF16 word循环→单Number]
 T -->|否| O[完整原frame/rest/source body]
```

| 阶段 | 施工 | 验收 |
| --- | --- | --- |
| A122：完整认证、绑定归属、guard与word算法设计 | [x] | 不适用 |
| B122：全部runtime和backend用例写齐不运行 | [x] | [x] |
| C122a：模板/形状/无写扫描与私有link admission | [x] | [x] |
| C122b：uniform验证后try及原slowbody接线 | [x] | [x] |
| C122c：runtime完整word计算和守卫 | [x] | [x] |
| C122d：测试私有导出、真实module和输出接线 | [x] | [x] |
| D122：主任务集中生成/测试全部相关项，再观察原深树 | 不适用 | [ ] |

A/B/C源码和六组测试已写齐。集中验证首次：allocator 47/47通过；protocol
12/14通过，其中真实完整literal graph已证明命中快路。两个失败都是同一测试
构造错误：先分析调用hashString的源码、后拼入定义，分析器正确报未绑定。
共59/61通过（96.7%），2/61测试构造失败；尚无新增生产语义断言失败。
合并修复仅调整`canonical-hash-test-program`：先用四个临时Eli defun声明分析
调用/导出，再仅替换这四个顶层定义为原标准库IR。所有认证、覆盖、异常和
黄金值断言保留。实现后集中复验这两项，复用未受影响的59项通过证据。
首次复验两项仍因测试构造失败：临时defun不可赋值、直接String引用未声明。
修后仍失败次数为1，生产断言失败仍0；另生成器编译因错误使用concat失败1次，
已用本语言js-array/join修正。集中修正为临时可变hashString声明（随后替换
真实defun）、globalThis.String，以及伪标记放非标准module ID验证不能越权。
第二次复验暴露一项fixture期望错误（伪marker被闭合IR schema正确拒绝，应
断言拒绝而非降低成功）和一项真实既有语义错误：静态字符串method lowerer
只用value-text-method-kind检查kind，忽略String.prototype.charCodeAt覆盖。
集中修复`lower-managed-text-method`：guard接现有value-text-key-method-kind
并传receiver/key；miss用managed-property-get(receiver,key,0)取真实方法，
不再用对string直接返回undefined的array-callback-get。Get仍先于所有参数，
调用仍传原receiver。原JS黄金、覆盖返回65、throw false/undefined、命中计数
和GC清理断言保留；此生产问题首次失败1次，修后失败0次（待本次复验）。
集中复验完成：完整protocol 14/14通过，34.619s、峰2500231168字节、cleanup=true；
连同未改runtime的allocator 47/47，共61/61（100%）。上述生产语义问题
修后失败0次，测试构造修后仍失败2次后已修齐；不将它们计成FIX23关闭。
接着用当前源码全新构建JS-host compiler，再发射原12000深树观察候选；
不能复用C116旧compiler，因为本次变更包括managed lowerer。
新候选build10.365s、峰1018972600字节；原配置create7.513s，96→224
下降1.809s，比C1202.552s改善29.1%，但完整下降外推仍约170s，未达可用性。
在2784层/47.641s停止；guard49.304s、峰1158332416字节、cancelled130、
cleanup=true。这是诊断取消，不是断言失败或原用例通过。FIX23继续失败。
复用现有ignored Eli prepare/observer增加唯一hash-diagnosis模式：复用刚构建
的C122 compiler，原输入/资源/当前runtime，只在空闲诊断header128/132/136
计try调用、constructor6拒绝、真实命中，在224
主动停止。先写完整计数与停止步骤后统一生成/执行，不重复完整长跑。
诊断生成首次误读私有product未返回的typed字段失败1次；删除该非必要静态统计
后build通过。实际create531/531命中，down96时1590/1590、224时2998/2998，
constructor拒绝全0，排除“guard没命中”的假设，停止扩大guard设计。该诊断
12.183s、峰1160413184字节、224主动exit2、进程cleanup=true；中途退出的
managed frame尚在执行导致exit hook报retained，不冒充正式模块清理验收。
接着仅复用当前候选作一次create后至224的CPU采样，原有observer输出改按
configuration命名以保留旧证据；现有inspect-wasm增加current-profile入口，
以当前runtime和实际binary export index映射函数，不假定旧index。无生产变更。
短区间CPU采样完成：12.101s、峰1102331904字节、224主动exit2、cleanup=true；
映射当前1769个runtime函数，实际binary import offset=3（不是旧猜测1），
共2606个采样。self热点：gc-free-blocks188（7.2%）、weak-mark-key152
（5.8%）、heap-block133（5.1%）、heap-value-valid113（4.3%）、host
standardProtocolReference92（3.5%）、heap-control90、heap-check89。
这些是self采样占比，不是完整调用树占比；证据c122-profile-analysis.log。
当前hash已2998/2998命中，不能再以哈希未启用解释剩余延迟。源码确认
frame-new正常分配无slot全扫描；frame-pop仅清根并断链，垃圾帧留给GC；
free slot O(1)、byte hole AVL查找，GC排序回收块及mark实际存活边。
因此下一步应针对自有runtime的临时对象/验证/协议边界成本，不重复GC阈值
实验、不扩大String守卫、不把原短区间估时冒充完整原用例结果。

### C121：同一候选区分分配成本与过密GC成本

C120全部相关语义89项已有通过证据，但原深树96→224仍用2.552s、8次GC。
该区间frame1137288个（比C117少15.2%）、strings239940个（少34.5%），
Number660866个未减少；合计138280032字节（比161198224少14.2%）。
没有把分配减少冒充可用性通过；FIX23仍失败，候选不重复跑完整长等待。

已确认当前原候选自动GC每16MiB分配触发，而其初始堆256MiB、上限1GiB，
并非物理内存不足。源码`heap-maybe-collect`按分配债触发全堆收集。按用户
允许受控调整内存的要求，仅现有ignored `depth-observe.eli`增加
`allocations-gc128`诊断模式：同C120字节、原12000输入、原slots/初始堆/上限，
在entry阶段调用既有runtime.auto(134217728)，保分类计数并在224主动结束。
既有allocations/origins不变；不手改metadata中的原16MiB参数，不把此诊断
视为原资源配置的通过。一次比较确定是收集频率还是调用/装箱主体继续阻塞。

当前/目标流程：同candidate→entry→原16MiB自动收集；新模式仅entry改128MiB
→同create/down→96/224差量→主动结束。无新文件或新生产接口。

| 阶段 | 施工 | 验收 |
| --- | --- | --- |
| A121：相同字节/输入/容量，仅区分自动收集频率 | [x] | 不适用 |
| B121：复用唯一实例、分类差量、224主动停止全部断言 | [x] | [x] |
| C121：现有Eli观察器增加模式与entry自动阈值设置 | [x] | [x] |
| D121：单跑一次诊断，保留时间/资源/分配和失败边界 | 不适用 | [x] |

一次实际结果：同96→224区间2.012s，GC从8次减到1次，但耗时只改善21.2%；
创建阶段7.767s对原8.507s。堆按既有上限自动长到512MiB，进程峰1479360512
字节（原1088208896），12.363s在224主动结束、cleanup=true。语义输入与
candidate字节未改；吞吐仍属异常，不能据此关闭FIX23或提高生产GC阈值。
保持生产配置，停止GC参数继续试探，下一批直接消除已确认的字符串hash动态
调用/数值装箱。证据`c121-observer-build.log`、`c121-depth-gc128.log`。

### C120：函数Get直读真实属性，认证原生iterator后省去装箱拆箱

当前快照为`fb98a50`加既有未提交修复；保留全部其它工作。仅修改以下两份
源码和本清单，不新增实现语言、GC池或缓存。C119已定位function descriptor
和iterator result反复物化；本批完成两个相关运行时修复后由主任务统一验证。

```text
当前/目标源码树（没有新增文件）
bootstrap/runtime/memory.eli            修改：Get(kind18)、protocol-step
tests/eliscript/memory-allocator.eli    修改：实际runtime私有测试接线与用例
```

```mermaid
flowchart LR
  G[Get kind18] --> D[own descriptor物化四属性] --> R[读取getter或value]
  I[protocol-step] --> C[invoke captured next] --> B[构造value/done对象] --> V[读回done/value]
```

| 需求/变更 | 基线位置与原行为 | 目标接口、数据与步骤 | 施工/验收 |
| --- | --- | --- | --- |
| Q120a/D120a | memory.eli:26739 `value-source-get-with-receiver`；27105 `value-function-own-descriptor` | 新私有`heap-function-get-with-receiver(heap,function,name,receiver)`，name为已转换key、返回实际handle。按原顺序初始化symbol/Array/Object；裸函数Symbol缺失不强求info。info33的bag.p32/flags-table.p36/data或accessor pair直接读；own undefined不当缺失；只有真实缺失才按原prototype递归。函数/键/receiver/info/data/getter/argv由7槽frame保根，每次分配后重取block；不持有移动地址。公开descriptor不变。 | C120a/A120a |
| Q120b/D120b | memory.eli:17551 `heap-source-protocol-step`；22326 iterator registry | 新私有`heap-source-protocol-native(heap,iterator,method)`无分配认证：target为实际kind17、type非4、brand1..5；record29的methods[brand]必须等于captured method；method必须kind18、零capture、p20 builtin标记1、info33 builtin标签按brand为329/330/331/333/334。源码唯一注册接线managed.eli:3047使用331/328/329/330/332/333且description传builtin+1、mark-builtin，普通source或foreign函数不得因注册就被跳过。命中后原底层step/item，外层done/value写回；skip仍推进底层并构造entries pair（原next先产生value），只省result对象。未命中保留整个旧协议路径，captured next不重读，close仍动态return。 | C120b/A120b |
| Q120c/D120c | memory-allocator.eli:24 beforeAll、149私有导出、336数组Get参照 | 仅测试image将call-source调用换成Eli私有dispatcher，计调用/receiver并可强制GC/抛false或undefined；生产代码不带计数。新增函数data/accessor/继承/惰性Symbol测试；iterator intrinsic认证、captured next覆盖、任意注册/custom/错误fallback、skip/entries/GC/清理测试。原有描述符计数证明Get零公开descriptor；protocol结果计数证明原生路径零result对象，fallback仍真实调用。 | C120c/A120c |

局部word变量`frame/info/bag/data/getter/argv/prototype`均为handle，`flags/brand/next`
均为u32；只在本次调用内存活。缺失返回3与own undefined区分由presence判断，
不引入sentinel泄漏。iterator认证返回底层handle或0；所有任意覆盖走原路径。

```mermaid
flowchart LR
  G[Get kind18] --> F[新增私有直读bag与flags] --> P{own存在}
  P -->|是| R[实际data或以原receiver调用getter]
  P -->|否| H[原prototype递归]
  I[protocol-step] --> A{捕获next与原生身份均认证}
  A -->|是| S[底层step/item直接写外层value或done]
  A -->|否| O[原invoke与result观察完整保留]
```

| 阶段 | 施工 | 验收 |
| --- | --- | --- |
| A120：两入口、原生身份与移动GC/首错设计写齐 | [x] | 不适用 |
| B120：A120a/b/c所有用例写齐且不运行 | [x] | [x] |
| C120a：函数直读与kind18接线 | [x] | [x] |
| C120b：iterator完整认证与step/item接线 | [x] | [x] |
| C120c：测试image dispatcher/计数私有导出 | [x] | [x] |
| D120：主任务统一构建、allocator及受影响协议/反射验证，再测原深树 | 不适用 | [ ] |

本批A/B/C已完成：函数直读memory.eli:26781，认证/快进:17555/17578；测试
三组位于memory-allocator.eli:311/367/416。测试image只替换call-source调用，
记录descriptor、next、object、callback实际入口并可在回调强制移动GC。
首批D：allocator44/44、公开reflection6/6、function description5/5、Node
protocol11/11通过；native组21/23通过，两项在Bun的createRequire加载新生成
JS对照文件时报Cannot find module，未进入原断言。有效共87/89（97.8%），
两项按失败保留（2.2%），不算生产运行时修复失败；无生产语义断言新失败。
另一次误用Bun执行node:test的启动组在5秒hook预算失败，属执行器错误1次；
改用既定Node后11/11通过，不修改任何测试时限或断言。

D内成批收齐上述两个对照加载问题后，按现成coercible-key测试的Node对照
方式修齐：仅改`tests/eliscript/native-managed-runtime.eli`，新增
`native-js-reference(reference-path,expression)` async私有helper；把既有JS
产物静态import进由Eli生成的driver，expression为Eli表达式，实际由既定Node
运行，强断言exit0并解析JSON。两条原用例保留retain128、report/computed全部
独立黄金结果及真实WASM/native调用，只替换同步createRequire对照入口。
不修改其它createRequire、编译器、资源或原fixture；不引入JS源代码。
两个原测试就是本次全部回归用例，无需添加镜像实现测试。实现完成后统一
再生成native测试文件并只复验这两项；其它已通过项未受此测试host接线影响。
FIX23仍未验收通过，不将上述局部89项当最终三输出或固定点完成。
新增代码不含生产计数器和用户可变结果缓存。

两个Node对照入口修复后，选中的2/2通过，保原断言并实际执行JS/WASM/native；
其它21项未受helper接线影响，复用首批通过证据。受影响固定89项最终89/89，
0功能失败。对照加载问题初次失败各1次、修后失败0次；执行器错误单列1次。
生成两次均成功，生产修复编译失败0、语义修后失败0。native首批48.016s峰
5222318080字节、复验14.917s峰2612527104；allocator8.343s、reflection8.781s、
function descriptions8.965s、Node protocol32.848s，全部已结束并cleanup=true。
本批新三组测试逐例见`c120-allocator.log`；其余`c120-reflection.log`、
`c120-functions.log`、`c120-protocol-node.log`、`c120-native.log`及
`c120-native-reference.log`保留首轮失败和修后通过，不合并抹除历史。

原深树候选构建4.189s成功，峰1092901672字节；同输入下降到224的计数诊断
14.016s主动结束，峰1088208896字节、cleanup=true。96→224仍2.552s，所以
D120的FIX23可用性判定失败1次（不是完整fixture语义断言失败），不再原样重跑。
全局仍8/9组关闭、1/9失败；完整自举、最终三输出、发布/签名推送尚未完成。

### C119：按具体入口归因临时帧与对象，并对齐完整参考测试

用户要求查清分配起点、参考成熟实现，并核实JS容器来源。已核对JS与机器
目标使用两套自有32叉持久向量实现；15ms简化导航与171ms完整zipper测试
范围不同，不能作连续8倍/10倍开销分解。后者也不是原570同一完整fixture。

现有Eli诊断工具增加allocation-origin模式，复用C116编译器/原12000输入。
仅诊断runtime按每个defun的词法入口给heap-argument-frame、frame-new和
heap-object调用附site号；heap-argument-frame内部frame-new不重复计数。
新wrapper只调用原分配器再记计数，raw固定表由allocate分配、低字116保存
指针；每site32字节，记录frame次数/字节、object次数/字节及Number/string
次数、最大帧槽数。全局C117计数不变，可据总量减已归因数计算编译器生成
帧的余量。对象保留原kind/handles、错误/GC/资源不变，不用于耗时验收。
观察器保唯一实例、输出96→224差量、224主动退出；原完整测试不重跑长等待。

另在既有ignored reference-depth下用稳定发布编译器运行完整官方zipper，
同单子节点vector、down/root/replace/root/新旧叶检查，四深度各五次，分阶段
时间/内存。源码/依赖/产物只在ignored目录，正式仓库只记独立结论；参考
编译器不会替代原初Emacs入口或验收编译器。未知重构建仍单跑受控。

| 项目 | 施工 | 验收 |
| --- | --- | --- |
| A119：词法分配入口、无重复计数与真实目标差别 | [x] | 不适用 |
| B119：总量/入口校验、完整深度/旧根/新叶断言 | [x] | [x] |
| C119：现有诊断加入口计数，独立参考测试写齐 | [x] | [x] |
| D119：一次归因及完整参考比较，再确定成批修复点 | 不适用 | [x] |

真实96→224差量1340720帧中，运行时词法入口1058224帧（78.9%），
编译器入口余量282496帧（21.1%）。前者不是源函数调用计数。
`value-source-get-with-receiver`165504次、`heap-source-invoke-once`124288次、
`heap-object-put-converting`88614次；对象由`value-number`599681个、
`value-string`366286个、`value-refs`255106个、`value-object-new`39756个
等构成。13.401s在224主动结束，峰987004928字节、cleanup=true；插桩只
用于分配归因，不将其墙钟或主动退出冒充正式性能/功能通过。

已按源码及区间计数找到三条具体放大链：

1. `zipper?`每次对三个固定字符串配置键做Map查找；一次down有三次校验，
   加branch/children动态读取，字符串长度合计
   `3*(23+25+26)+23+25=270`。`managed-value-state.eli/hashString`每次重新
   逐字符`charCodeAt → mixHash`，与`value-source-text-method`34560/128=270
   次/层精确吻合。这放大数值装箱和细粒度调用；不是树下降本身的指数复杂度。
2. 函数普通Get经`value-function-own-descriptor`合成公共描述符再读回value/
   getter。该入口17024/128=133次/层；需要从内部bag/flags读取而保公开反射。
3. 内部protocol iterator每next通过通用调用生成`{value,done}`再读回。
   `value-source-iterator-next`18176/128=142次/层。可在认证已捕获的真正原生
   next后直接推进，用户改写/外来对象保持原路径。不能仅凭kind或registry相等
   跳过任意用户函数，也不能每步重新Get next。根帧arena不作为本次优先改动。

独立参考完整zipper四深度各5次共20/20通过：12000层各阶段中位数create
0.226ms、down3.522ms、unchanged-root3.682ms、rebuild8.496ms、check2.294ms，
整项中位数18.089ms；24000层33.745ms。各阶段中位数之和无需等于整项中位数。
Node进程0.681s，峰308035584字节，正常退出并cleanup=true。它验证同类数据
结构与操作规模可以近线性完成，但不是同一语言源码，不能替代原三输出验收。
参考实现对字符串hash有1024项有界缓存；后续须明确本语言hash与可变字符串
方法的边界，不能直接加入绕过用户getter/改写的缓存来假装语义不变。

参考构建有2次启动失败（本机Maven代理指向未运行端口；第二次仅更改目标
JVM参数未影响classpath准备JVM）。之后对该独立实验同时隔离两个JVM的用户
配置并复用下载缓存，经官方仓库取得依赖成功；不改用户全局设置。成功构建
15.744s、峰763396096字节、cleanup=true。启动失败不记生产修复失败。
证据在既有ignored目录`c119-depth-origins.log`、`c119-origin-sites.json`、
`c119-reference-build-isolated.log`、`c119-reference-results.log`。

当前未插桩候选仅down阶段外推约225–241s；完整原fixture还包含创建、回根、
重建和检查，未跑完，不能宣称约4分钟可完成全项。FIX23仍失败，关闭组仍8/9；
参考诊断成功不增加正式功能通过数。

### C118：独立JS数据结构对照与责任分层

用户本次明确允许普通JS独立重写此结构作诊断。唯一例外是ignored证据目录
中的`zipper-js-baseline.mjs`，不进正式源码、包或Git。它独立实现同样的单子
节点深树、不可变父路径链、下降、原根身份回溯、叶子替换/重建及新旧叶验证。
分别用冻结JS数组和原运行时persistentVector作节点；后者保留持久容器实际
成本，导航本身直接JS。3000/6000/12000/24000层各5次，逐阶段时间/内存、
手写身份/深度/叶值断言与中位数；只比较算法和容器，不冒充完整语言语义。
与已有同源编译JS约0.17s、WASM实际阶段及C117分配量分层对照，不改验收。
并查阅已核实本地上游只读源码；仓库产出仅保留独立设计判断，不写外部来源。

| 项目 | 施工 | 验收 |
| --- | --- | --- |
| A118：同结构/同操作、两类容器、证据边界 | [x] | 不适用 |
| B118：不可变、旧根身份、完整深度及叶值断言 | [x] | [x] |
| C118：单个独立JS诊断、分阶段时间/内存和中位数 | [x] | [x] |
| D118：一次受控对照，分清库/编译器/运行时责任 | 不适用 | [x] |

40组探针对照全部断言通过（两容器×四深度×五次）；12000层完整操作中位数
冻结数组2.181ms，原persistentVector容器15.356ms（下降7.594ms）；24000层
分别3.607ms/27.840ms。倍增近线性，没有指数退化。进程0.707s正常结束，
峰213647360字节、cleanup=true。它是独立算法/容器诊断，完整Eliscript语言
JS约170.7ms仍用原测试证据，不用简化模型冒充正式三输出验收。

结合C117，当前异常主要归于机器输出的动态调用/临时根管理：编译器生成
大量细粒度runtime调用，runtime/frame-new又将每个临时根帧作为kind9普通
GC对象分配。不能将每个frame等同一次源函数调用（内部操作也有参数帧）。
应追踪这些临时帧的实际入口并成批消除冗余，而非继续调整树的路径结构。

### C117：按实际分配字节定位主因，不继续局部猜测

C116阶段耗时没有实质改善，停止相同候选重复运行。一次有新问题的诊断：
现有prepare-depth.eli复用C116已构建编译器，在仅诊断runtime的heap-try-object
成功分配处，低地址128..223（原始allocator从256开始）记录8类对象的count/
bytes/max。类别为frame9、Number4、string5、bytes6、Array14、function18、
refs7/8、其它；不改生产源码、GC、原输入、资源或语义。计数只在本次实例。
现有depth-observe.eli以完全转发的Instance构造器观察器取得本次唯一memory，
取得后立即还原；在created-complete、descended96/224读取原始计数，输出
区间delta并在224结束。仍部署与descriptor一致的实际facade，不用旧编号。
该诊断不作验收，不比较其插桩后的墙钟性能。只在新增真实归因后选择修改。

| 项目 | 施工 | 验收 |
| --- | --- | --- |
| A117：保原输入/资源，实际分配分类与测量位置 | [x] | 不适用 |
| B117：计数边界、唯一实例、差量及224有界结束断言 | [x] | [x] |
| C117：仅现有持久Eli诊断工具加计数/读取接线 | [x] | [x] |
| D117：一次实际下降区间归因，保留日志后退出 | 不适用 | [x] |

C117成功取得唯一实例，完整下降96→224的128步实测分配：frames1340720个、
93470624字节；Number660866个、27758168字节；strings366286个、18015240
字节；refs255106个、11310952字节；其余合计10643240字节。总161198224
字节（153.7MiB），其中frames约58%。平均每步10474个frame、5163个Number、
2862个string；这不是数据结构节点所需的合理规模。scratch bytes为0，证明
继续优化前一局部不再有主因意义。14.172s在224主动结束，峰968605696字节、
cleanup=true；原host退出回调因主动结束仍有活frame记录诊断清理错误，保留
原日志，不当作完整用例的收尾失败或通过。生产功能验收仍未关闭FIX23。

### C116：数组内部复制使用原始索引，普通自有元素零临时分配

基线当前工作区：memory.eli/28334 index无条件分配6槽帧及字符串key；
slice/28515每个元素还保留两个boxed index，每步通过通用Number运算递增。
既有index-storage已证明普通Array自有默认数据槽可直接读写，但在格式化和
临时帧之后才检查，协议参数slice仍为这些中间对象反复分配和收集。

```text
bootstrap/runtime/memory.eli           修改：index-direct/word与slice整数循环
tests/eliscript/memory-allocator.eli    修改：实际零分配/回退/GC断言
tests/fixtures/wasm-managed-arrays.eli  沿用同一公开slice/区间/覆盖/首错输入
```

前：boxed index→帧→格式化key→storage检查；后：index-direct(heap,object,
word,mode,child)只检查实际kind14、无描述符/特殊prototype、index<length，
对已有数据槽的Get/Has/Set/Delete及可写槽/可扩展空洞Create直接执行；返回
4表示未命中，无分配、无用户调用。所有missing/descriptor/foreign/受限值
走原slow，仍先Has再Get/Define；不假设原型清洁，也不缓存用户行为。
新增index-word仅在direct未命中时创建Number并调用原路径。公开内部index
验证精确u32且非4294967295后才调用direct，其它数字不截断。未命中原算法
重命名为index-slow。直接修改保留heap-realm-note-mutation，且不触发分配。

slice在原length/start/end/species步骤完成后，三个界限均精确u32时使用
机器word-index/out/size循环，调用index-word；species执行完后每次重新检查
真实对象状态，继承/Proxy/getter/holes仍逐项原路径。其它界限完整保留原
boxed循环；结束时仍用原size执行Set length，顺序、首错和真实species不变。
新增变量只在slice帧内、无缓存和持久状态，不改变收集阈值及资源输入。

测试先写齐：实际runtime image私有导出direct/full/word读写；普通数组
含null/false/undefined、-0及对象时循环Get/Has/Set/Delete/Create不产生临时
帧/字符串/收集，实际子对象被保留；空洞、边界与受限状态的miss返回4且
不修改。复用公开Array slice的参数、覆盖、继承/描述符/species/异常合同，
再跑allocator/native-managed/WASM完整受影响集。全部实现写齐才运行。
集中通过后只构建一次对应新facade候选，按同12000层阶段比较；仍异常则
保留失败，不继续不变的长等待。

| 项目 | 施工 | 验收 |
| --- | --- | --- |
| A116：真实临时对象链、精确fast/miss边界和全部接线 | [x] | 不适用 |
| B116：实际零分配和公开slice完整合同 | [x] | [ ] |
| C116：direct/word/slow及slice无boxed索引循环 | [x] | [ ] |
| D116：集中功能验收及同深树有界对比 | 不适用 | [ ] |

C116首个集中命令127通过、2失败、1error（runner原计数）；新增实际零分配
测试通过。两类问题均已收齐：新增C113 getter测试内含两次编译，超Bun默认
5s（5163ms），补显式30s构建预算后单项5434ms通过；以及Array原始套件和
WASM原始套件同时加载触发既有“每进程恰好一个原始套件”的隔离断言，已
按原runner要求单独进程运行Array，不改原断言。127项通过证据保留，不为
换调度再全套重复。该批生产功能断言失败0，测试预算失败1、调度失败1；
getter修正后1/1通过，16.067s、峰2728378368字节、cleanup=true。

隔离Array全套23/24通过；唯一失败为既有performance-check：128次公开读取
要求usedBytes/collections完全不变，实测24824→24944字节、0→640次回收。
该项是原授权后置的性能门槛，保持失败，不改断言、不把它改称功能通过。
同例前面的所有结果断言已通过，尾部frame/cleanup仍需在已有显式延期模式
下完成一次；其余23项包括slice/孔洞/转换/覆盖/首错已通过，不重复整组。
本批新增直接索引零分配断言通过；以上公开调用性能失败与它分开记录。

该公开读取例的功能收尾已在现有DEFER模式完整通过，frameDepth=0/live=0；
日志明确记录原[24824,0]与实际[24944,640]及DEFERRED / NOT ACCEPTED，
没有伪造性能通过。14.521s、峰1053458432字节、cleanup=true。固定问题
计数保留这次性能验证失败，未出现修复后新增功能断言失败。

C116有效同源深树测量：下降96层10205.887ms、224层12608.358ms、352层
15176.022ms、480层17740.365ms，区间2.40..2.57s/128层、9..10次回收。
20.312s中断、峰1065041920字节、cleanup=true。比C115约2.55..2.67s仅
小幅改善，完整用例仍失败，不宣称有效解决主因，也不再重复此不变候选。
新增内部索引零分配能力已成立，152个受影响实际功能检查均有通过证据；
其中公开读取的原性能断言仍失败，所以严格验收为151/152（99.3%）通过、
1/152（0.7%）失败，功能完成与性能延期分开记录。FIX23仍保持失败。

### C115：小整数属性名不再分配大数格式化工作区

基线当前工作区；实际下降profile与源码定位到protocol操作闭包的
invocation.slice(1)→heap-source-array-prototype-slice→index→heap-number-text
→heap-number-positional-text。索引1/2等每次申请1712字节scratch payload，
加32字节头共1744字节；长度2复制至少五次非零索引转换，即8720字节临时
scratch，不含帧和最终字符串。这是确定的额外分配，不把它虚称为完整主因。

```text
bootstrap/runtime/memory.eli:5954 heap-number-text     修改：精确u32整数快捷转换
tests/eliscript/memory-allocator.eli:beforeAll/fresh     修改：实际路径计数与边界合同
_worktree/evidence/.../prepare-depth.eli                复用：当前编译器/runtime/zipper
```

前：所有数字→通用binary64最短表示算法→1744字节scratch；后：已有
heap-number-uint严格位判断确认精确0..4294967295（含-0）→heap-number-word
零分配提取→heap-key-word只分配最终十进制字符串；其它数字保持原路径。
这些整数十进制表示唯一且不使用指数记法，-0仍为字符串0；负数、分数、
超u32、非有限数及其它radix不改。不能假设所有数组索引均在u32内而截断。
无缓存、不保存跨分配指针、不改变属性访问顺序、用户覆盖或收集阈值。

测试在既有实际runtime image加私有positional调用计数112；导出测试私有
allocator-number-text/reference、计数读取/归零。所有新代码Eli。手写黄金
覆盖0/-0、十进制位数边界、2^20/2^31/2^32边界、负数/分数/非有限；u32
成功路径只产生1个最终对象、最多56字节、positional调用0；其余走原算法。
另auto=1下输入被pin，验证首错/结果/GC存活和收尾live/frame0。复用原
allocator/native-managed/control完整集；全部写齐再集中验证，随后仅生成
一次当前候选观察同12000层阶段，异常仍按失败保留，不跑小时级等待。

| 项目 | 施工 | 验收 |
| --- | --- | --- |
| A115：真实分配链、精确数值边界和最小修改 | [x] | 不适用 |
| B115：实际路径计数、位边界、分配和GC合同 | [x] | [x] |
| C115：u32快捷路径，其他数值完整回退 | [x] | [x] |
| D115：集中功能/算法检查及原深树阶段对比 | 不适用 | [ ] |

C115集中验证127/127通过、0失败，74.916s，峰6146998272字节，全部执行树
回收。包括新增23组数字边界逐项黄金、实际快/慢路径及分配/GC断言，和原
allocator/native-managed/WASM运行时全集。本次编译失败0、行为修复失败0。
当前候选须再跑同12000层诊断，不能以127项通过代替FIX23关闭。

C115首个机器诊断创建9026ms，下降96→224约4514ms、回收17次，相对原
20次减少；时间无改善，20秒终止且已回收。随后核对request发现zipper是
普通project module，不在literalSources；工具只覆盖literal的zipper分支从未
命中，因此此诊断只有数字转换修复，未包含C114。已直接覆盖同一request中
stdlib/core/zipper.eli并加存在断言；这次接线错误计1，不能称联合修复已验收。

首次包含C114的新binary在加载阶段失败：新增私有函数改变函数编号，但旧
工具复用了冻结ESM facade。已改为使用原createManagedProjectFacades和
originalProgramAliases给新descriptor生成对应完整facade、原hostSources及
原host副本，独立持久目录部署；绝不修改冻结原产品。该加载失败另计1，
不计生产断言失败，也不隐藏工具接线成本。

最终联合候选构建11.355s、峰1235557448字节、exit0。有效诊断下降96层
10670.543ms、224层13257.518ms、352层15926.749ms、480层18481.496ms。
每128步2.55..2.67s、10次回收；对比C113约4.01s/20次回收，时间减少约
35%、回收减半。仍不具备完整12000层秒级可用性，FIX23保持失败；没有
继续小时级等待。20.153s中断、峰1066467328字节、cleanup=true。
C115诊断中断2次、诊断加载失败1次、源码覆盖接线错误1次；正式功能断言
失败0次，不将这些诊断取消改写成通过。固定修复分母仍8/9（88.9%），
剩余1/9（11.1%）；没有正式重新自举、升版、提交或推送。

C114当前Node合同6/6通过，原12000层完整JS为170.698ms，峰299876352字节。
新增测试发生1次括号编译失败；1次测试入口导出名错误使6项hook失败；随后
5/6通过的剩余1项是测试将metadata=nil导致的ILookup首错误写成node错误，
已改用有效空map触发原node校验并通过。生产行为失败0；这两类测试修正
各保留原日志，不能删除失败。尚未重复运行深树机器输出，待C115代码写齐。

### C114：消除下降路径的重复验证，保留回调后的动态检查

基线fb98a509工作区；C113真实typed IR调查已完成，函数成本证据为
`c113-managed-function-costs.json`及`c114-function-cost-summary.log`。
collection/invoke为12 roots、方法包装3 roots、native-call包装5 roots，不能
将它们误认成大帧。源码确认成功down重复执行zipper?七次，每次又调用
isVector/count/meta/isMap/三次get；当前下降128层约4s且回收20次，仍失败。
本次不改GC阈值、协议覆盖、输入或黄金，不把未经测量的增长叫作指数增长。

```text
stdlib/core/zipper.eli                 修改：branch?/end?/down验证后的私有读取
tests/eliscript/persistent-zipper-path.eli  修改：公开入口、回调顺序与回调后失效检查
_worktree/evidence/.../prepare-depth.eli  修改：候选同时载入当前zipper源码
```

前：down→guard→end?(guard)→branch?(guard→end?(guard)→node(guard))
→children-vector(node guard)→parent(node guard)。后：down→guard→active?
→zipper-branch-value(直接slot及动态配置读取)→同一children-vector与parent；
保留branch回调后、child-reader/reduce回调后两次node校验，成功路径7→3。
公开end?/branch?仍各校验入口，end返回false；不缓存位置、协议或回调。
具体锚点：zipper.eli/201 end?、/205 branch?、/258 down；新增私有
zipper-branch-value(location)返回Eliscript布尔值，读取顺序配置函数→slot0。
测试现有before允许导出zipper/children/end?/branch?，新增invalid/end/leaf、
branch→children顺序、branch/child-reader/reducer改变IMeta后必须在后续用户
调用或新位置创建前失败，以及false/undefined首错身份。公共祖先/12000层
四项沿用。候选只新增当前zipper literal覆盖，其余冻结输入不变。

| 项目 | 施工 | 验收 |
| --- | --- | --- |
| A114：调用顺序、回调边界和精确源码变更 | [x] | 不适用 |
| B114：完整公开行为和回调后失效回归 | [x] | [x] |
| C114：私有读取辅助、公开入口与候选接线 | [x] | [x] |
| D114：集中Node合同验证及同12000层有界诊断 | 不适用 | [ ] |

typed IR调查构建16.592s、峰2510143488字节、exit0，已回收；诊断工具新增
分支缺括号造成1次编译失败，已修正。该调查不计功能通过、不关闭FIX23。
本次完整代码写齐再集中执行；同时继续源码定位高分配主因，不能只凭减少
常数项即宣称深树阻塞解决。

### C113：模块函数读取的分支根空间与查找复杂度

A113基线仍fb98a509工作区。一次有界实测确认创建12000层约7.2s，近似
线性；下降96层约3.06s、随后128层约4.13s，后者触发20次16MiB自动回收。
有效下降CPU profile有6049样本；用实际binary heap-collect导出93校准runtime
offset=3，不能用旧无print产物的offset=1。完整调用树显示大量分配/回收和
跨边界调用；源码另确认下面的模块getter缺陷，不凭匿名函数编号推断其名称。
早期两个profile未保存，是诊断工具在driver改写
process.argv后才读模式参数的错误，已改进入时捕获；不是两次生产修复失败。

源码明确问题在managed.eli/managed-module-getter：每个互斥函数分支分别调用
lower-managed-function-value，却把全部分支rootIndex累加成每次frame-new容量；
dispatch又是反向线性if链。F个函数的一次读取消耗O(F)根空间和最差O(F)查找，
并在返回时再清空整个大帧；循环中的实际操作并不需要同时保留F个结果。

```text
bootstrap/backends/managed.eli                  平衡选择树+互斥分支共用根区间
tests/eliscript/native-managed-runtime.eli       8/129函数实际输出及IR空间/深度验收
_worktree/evidence/.../prepare-depth.eli          当前backend候选接线后原深树诊断
```

目标流：读取(kind,slot)→原kind与module状态检查→O(log F)平衡选择→仅选中
分支→原heap-frame-result。新增managed-module-function-dispatch(cases,slot,
first,end,fallback)，叶子保slot精确相等和原fail3，内部按middle二分。
getter收集cases，每分支用独立lowering state、复制相同参数/控制locals前缀，
从roots=0开始；记录root-maximum及最大分支locals。互斥分支共用frame roots
及机器locals，每个分支内部索引仍唯一，snapshot provenance不能跨独立state；
所有locals仍是现有u32类型。最后容量和机器locals取最大分支，避免WASM/native
栈空间仍随F累加。分支本身保原步骤、首错、函数generation/身份/描述与闭包捕获，
无新缓存，无原型/协议绕过。时间O(log F)，临时根空间O(max branch roots)。

B113同一Eli生成8和129个函数，保持同样特性，结构验收getter根数不随F累加、
slot选择深度不超过ceil(log2 F)+2；实际WASM/ARM64 native检查首/中/尾及边界
函数、重复读取身份、GC后的持有函数、闭包、全局值、原错误及收尾live/frame=0。
复用现有native-managed/control全集，无需新runner。全部测试和实现写齐才运行。

| 项目 | 施工 | 验收 |
| --- | --- | --- |
| A113：实际下降阶段、源码复杂度与保语义变更位置 | [x] | 不适用 |
| B113：8/129函数空间/查找深度和实际目标功能测试 | [x] | [ ] |
| C113：互斥根/locals复用、平衡派发和候选接线 | [x] | [ ] |
| D113：集中语义验证，再用原完整深树与三输出门禁收口 | 不适用 | [ ] |

C113当前验证：40/40通过、0失败、63.266s，峰6194298880字节，包括新增
8/129函数两种实际机器输出的空间/查找及完整原native/control测试。构建中
新增测试缺一右括号导致1次编译失败，已补齐并由selfhost完整生成；没有生产
行为修复后再次失败。普通make完整生成还须在最终门禁重跑，不能以定点生成
冒充make成功。

C113全量当前源码的独立Emacs入口候选已生成（非正式三段式自举），同一
诊断：创建12000层8258.810ms，下降96层11297.264ms、224层15304.859ms、
352层19381.505ms；20.055s诊断中断，原黄金仍未完成。峰1058668544字节，
相对C112同观测峰8137637888下降约87%；下降128层4.008s，回收20次，时间
尚无实质改善。只认空间改进，不声称解决FIX23或秒级完成。两段下降耗时基本
稳定，当前证据不支持“指数增长”；应继续定位单步重复分配/跨边界调用，不能
再按深度指数退化的假设修改。C113新增诊断中断1、功能断言失败0。

当前固定分母仍8/9关闭（88.9%），剩余FIX23为11.1%，正式最终stage3三输出
和发布未验收。已通过且未受C113影响的C112 allocator39/39可沿用；原FIX03/
FIX12性能容量延期不变，不把本问题改列延期。所有执行树已终态并回收。

### C112：固定符号查找不再反复遍历历史堆

A112沿当前fb98a509工作区调查：memory.eli/18040的value-symbol-well-known
每次先分配description，再调用17816的heap-symbol-new；后者从slot=1扫描到
heap-control[3]历史高水位。迭代器、类型和协议路由反复调用固定符号查找，
因此Q次查找成本为O(Q*H)，且每次产生本来不需要的字符串/参数帧垃圾。
这是一处明确的算法缺陷；尚不能据此断言它占据FIX23全部耗时。

```text
bootstrap/runtime/memory.eli              固定15项弱索引，现有bitmap之后追加
tests/eliscript/memory-allocator.eli       实际运行时扫描计数、GC/过期/身份测试
_worktree/evidence/.../prepare-depth.eli   同冻结编译器，当前runtime与Vector诊断
```

前：固定编号→新description→全槽扫描→已有symbol；后：固定编号→私有表
→完整generation/kind/provenance/identifier校验→已有symbol。首次/过期/损坏
项仍调用原算法，成功后写回。命中O(1)、零分配，空间固定60字节/heap；
不新增GC根，显式收集仍能释放全部不可达symbol。原bitmap起点552不移动，
私有control长度从552+bitmapWords改为567+bitmapWords；尾部15项初始化0。
heap-symbol-cache-entry(heap,identifier)由control长度减15定位，raw地址不跨
分配保存；完成原慢路径后重新定位写入。公开ABI/符号编号/错误/GC阈值不变。

B112在既有allocator实际runtime image中，仅对heap-symbol-new原扫描循环
增加测试私有计数108，导出计数和缓存破坏辅助函数。三个测试覆盖全部15项、
1024个后续对象/64次查找零扫描零分配、auto=1命中不触发多余收集、释放后
live=0及过期重建、两heap隔离、错误kind/编号的缓存恢复、显式extended布局。
复用原allocator和native-managed/control全集；最后同12000诊断观察实际阶段，
不把诊断替代原输入/黄金验收，不延长无进展等待。

| 项目 | 施工 | 验收 |
| --- | --- | --- |
| A112：查明历史高水位扫描、固定空间方案和保留语义 | [x] | 不适用 |
| B112：三项实际运行时算法/身份/回收回归写齐 | [x] | [x] |
| C112：固定表、完整校验与诊断接线写齐 | [x] | [x] |
| D112：集中算法/受影响语义验证及一次深树对比 | 不适用 | [x] |

C112集中验证78/78通过，0失败，66.599s，峰6325059584字节；普通构建
通过，28.922s。原同6秒诊断到6624层，相对C111的6496仅多128层，不能
据此称已解决主因。诊断中断1次，原FIX23仍失败，生产修复验证失败0次。
追加唯一有新诊断目的的观测：同一真实诊断产物每128层记录单调时间和现有
runtime.stats（collections/liveValues/usedBytes），最多20秒确认构建和下降的
增长形态。只包裹既有console及driver，不改输入、GC阈值、黄金或运行时算法；
用持久ignored目录内Eli工具，不再重复没有新信息的6秒计层试跑。

### C111：消除深树小Vector尾数组的中间拷贝

A111当前master/fb98a509工作区：persistent-vector.eli的array-reverse（8行）、
array-copy-assoc（16行）、array-drop-last（34行）对长度0..2的私有尾数组
仍逐项js-cons再reverse；persistent-vector-conj/188由空尾连续构造单元素
深树和双元素location，C107已确认构建阶段5728层/6秒。改变这条实际路径，
不再修改机器后端、公开协议分派或缓存位置验证，也不启用C110。

```text
stdlib/persistent-vector.eli                   三个私有复制辅助函数的小数组分支
tests/fixtures/persistent-vector-copy.eli       同一完整getter/异常/属性合同输入
tests/eliscript/persistent-vector-copy.eli      独立Emacs JS与WASM/native执行及逐例计时
Makefile/279                                  复用已有vector-copy全量门禁，无需修改
_worktree/evidence/.../prepare-depth.eli        仅新诊断产物名和本次literal源码覆盖
```

前：conj→小尾复制→逐项前插→反转→新Vector；后：conj→相同边界判断→
空/单/双元素直接array literal→新Vector。长度更大及非命中索引仍走原路径。
reverse两项必须先按0、1读取进局部再输出second、first，不能颠倒getter顺序。
assoc只对length=0/index=0，length=1/index=0或1，length=2/index=0..2
展开，替换位不读原属性，追加位保原索引读取顺序。drop对length<=1返回
新空数组，length=2/3只读取实际保留的前缀。所有分支保持新数组、普通own
data属性和首个抛错身份，不改变源数组、Vector、元数据及公开可变原型合同。

验收复用原三个vector-copy测试，补齐长度0..4、替换/追加/越界回退、跳过
替换与删除位getter、首错、dense/data属性和不变源；同一fixture分别由Emacs
JS、当前WASM及实际ARM64 native执行，对比手写黄金结果。测试源码全部Eli。
再运行既有zipper路径合同。全部源码写齐才执行；通过后同原12000诊断、同
6秒预算比较实际层数，原 fixture/黄金不改，若无实质改善不长跑原570。
正式原570/631/649仍须在可用性异常解除后通过，不能以小数组测试替代。

| 项目 | 施工 | 验收 |
| --- | --- | --- |
| A111：当前热点、源码/流程、精确分支和作用边界 | [x] | 不适用 |
| B111：三种实际输出共用29项输入及黄金、负零/别名/undefined、原用例和已有门禁确认 | [x] | [x] |
| C111：三个小数组分支和独立诊断产物生成完成 | [x] | [x] |
| D111：集中执行三输出复制合同/原路径，之后一次短时深树诊断 | 不适用 | [x] |

C111结果：Vector 6/6通过，正确Node入口zipper 4/4通过，JS12000层原路径
175.623ms；本次受影响功能10/10。保留2次测试源码编译失败和1次误用Bun
启动Node测试的调度失败（4测试失败），不混记为生产语义失败。一次6秒诊断
中断，6496层对原5728层仅+13.4%，未进入下降阶段，不能关闭FIX23。
证据c111-integration.log、c111-zipper-node.log、c111-depth-six-second.log。

### C110：共享内存ABI的小函数展开

最终收口：新薄入口的两种尝试也未解除加载退出，已完整撤下新增入口及
bootstrap映射，保存native-entry-candidate.eli，仅留原测试文件/原映射。
加载诊断失败累计10次，停止继续调查该细节。恢复原生产lowerer后，使用
与Makefile相同的明确入口（./tests/...）而非路径筛选重新集中执行，真实
39/39通过、0失败，57.624s、峰6291488768字节、exit0/cleanup=true：
memory-abi-original-entry-integration.log。不能凭多项输入变化把加载原因
单独归结为某一开关；当前原门禁已可执行，不再为它扩充工具或新规则。
新增ABI行为用例完整覆盖两种机器代码产物，生产运行时/编译器保持C106，
未提交生成MJS。前述实验失败及计数保留；正式自举和FIX23仍未通过。

**终态：实验未通过，生产接线已撤下，不再沿本实验原样重试。**
全面候选18/22通过，收窄只读候选21/22通过（40.597s，峰5415763968字节，
exit1/cleanup=true），剩native私有regex初始化ELI-RT0003。故本实验实际
集中验证失败2轮、行为修复后仍失败2次，保留各项首次失败，不混入加载退出。
关闭默认展开的对照22/22通过。候选已保存为ignored的
memory-helper-readonly-candidate.eli及native-managed-helper-candidate.eli；
memory.eli恢复本实验之前内容，不撤销C106或其他已有修改，不向默认或公开
编译器留下不安全的优化开关。下面A/B/C为失败候选的历史施工记录，不是
当前启用能力。小函数展开后置，不能将其作为FIX23已解决或已提高百分比。

仅保留同一Eli原始内存ABI的行为测试（参数快照、未读参数副作用、零局部、
递归、增长、首个越界trap及后续内存不被写入），两种真实产物对照；移除
实验算法形状断言及诊断默认覆写。新薄测试入口和bootstrap接线需通过原
Makefile入口的完整集中验证，不能依赖ignored诊断脚本完成发布。

C109对照完成：Binaryen 133保语义-O3构建234.808s、峰13340360704字节，
exit0/cleanup=true。相同6秒诊断到7008层，原5728层，仅推进约22%；仍在
构建而未下降，不满足原可用性。整树6.145s、峰968982528字节，exit124/
cleanup=true；记录诊断取消1次，不是断言失败。首次缺bulk-memory开关的
优化器配置失败1次保留。外部优化器不接入默认自举或发布依赖。

A110基线：memory.eli/lower-memory-program（86行）验证并降低后直接返回，
managed.eli/4859复用它；heap-control、heap-entry等小函数的每次读取仍建立
函数调用。numeric.eli/414已有numeric-f64专用展开，但硬编码f64且可别名参数，
不能直接用于有内存读写/首错的ABI。目标只在已验证、私有lowered IR上展开，
不改变公开typed输入快照或使用numeric纯度/循环/代数优化。

```text
前/后源码树（无新增生产模块）
bootstrap/backends/memory.eli                 新增私有小函数展开，接到lower-memory-program
tests/eliscript/native-managed-runtime.eli    内存ABI展开的参数、分支、局部、递归及trap合同
tests/eliscript/native-managed-runtime-entry.eli  同步注册原完整cases，保持原测试入口名
tools/backends/bootstrap.el                   cases与入口各自从Eli生成，不提交MJS
docs/bootstrap-0.0.2-plan.md                   本节施工与证据
```

前：源码→验证→word IR→runtime/managed→WASM/native调用。
后：源码→相同验证→word IR→两遍有界小叶函数展开→相同runtime/managed→两种发射器。
每遍只选无call/call-indirect/host-call/循环且至多48节点的函数；每个调用
仅展开只读memory-op（load、memory-size及位操作），禁止展开store、grow、
static-copy、间接调用及其他能力，保留写入/分配/错误通道函数边界。
先按原顺序将全部参数存入新增局部，再清零被展开函数的非参数局部，最后复制
原函数体并偏移local/set/initialize索引。保留字段/span、内存访问、分支、
写入、除法和trap原顺序；不把读取当纯值、不删无用参数、不传播别名。
每遍每个函数最多新增256个局部（两遍共512），保持函数/导出/表索引及原函数体可被外部调用；
递归、间接/host调用和大函数保留。原program不被修改。

| 项目 | 施工 | 验收 |
| --- | --- | --- |
| A110：当前链、完整变更和语义边界 | [x] | 不适用 |
| B110：写齐参数快照、未读参数副作用、分支短路、局部重复调用、递归保留和越界首错测试 | [x] | [ ] |
| C110：实现展开并在已验证的内存lowerer接线，两后端共用 | [x] | [ ] |
| D110：集中运行新增合同与受影响集成，再比较同一深树诊断；无实质改善不长跑 | 不适用 | [ ] |

C110第一种全面小叶展开候选失败：require加载同一完整测试文件后18/22通过，
4/22失败；其中新增用例误把u32零当假，已改明确比较（测试编写错误1次），
其余3项为跨调用宿主身份/重入及项目私有regex准备，均为ELI-RT0003。
对照只在私有backend生成时关闭默认展开、同一源码/参数/输入22/22通过，
36.398s、峰5387354112字节、exit0/cleanup=true。新增展开合同仍显式启用，
也通过，因此不能把全面优化安全性从小合同外推。保留首次候选行为修复失败
1次、实际集中验证失败1轮（4项）；未将该候选用于原570或完整自举。
直接Bun entry在进入beforeAll前无错误退出累计6次（各有不同加载诊断），
require同一文件能完整运行；这6次记加载诊断失败，非目标语义断言失败。
Node/Bun独立全runtime及完整normal源码发射/校验/初始化均通过，非原例验收。

本次集中收窄只读展开，不猜测全面写入展开的完整错误机制；写入/分配/错误
通道暂保原调用边界，不以通过小测试宣布它们安全。新增写入/grow保持call
的IR断言及实际运行，旧3项完整断言不改。全部代码写齐后才复验。
两个额外加载对照（smol及先预载真实runtime）仍在beforeAll前退出，直接入口
诊断失败累计8次；停止重复调flag。已证明require原完整文件能真实执行全部
22项，因此维护一个8行Eli入口同步require同一份cases；bootstrap.el将原源
生成native-managed-runtime-cases.mjs，薄入口仍生成原native-managed-runtime.test.mjs。
Makefile原命令及所有断言保留；不把ignored诊断入口充当CI接线完成。

### C109：先定位实际层数，再做一次官方优化器对照

源码阶段已对应：旧暂停的managed_534为managed-runtime-vector.eli/persistentVector，
managed_476为managed-literals.eli/literal-vector-from，managed_469为literal-each，
并非可直接断言为down。C107最终定位到工具误用了二进制lowerer未支持的
console/log；改用既有print，无新增语言语法或生产实现。错误输出那次原编译
再次失败1次，故C107构建/接线失败累计4次，不充当目标语义失败。

修正后诊断构建3.607s通过、峰1137383856字节。冻结原12000输入的独立诊断
副本只追加阶段/每128层print，6秒显式诊断预算后停止：已越过浅树操作，
构建层数5728，尚未create-complete/descended。初始化1155.865ms，整树6.233s、
峰7976452096字节、exit124/cleanup=true；这是按定位预算取消1次，不是
功能通过或断言失败。depth-six-second.log与depth-driver-lifecycle.jsonl保留。
原输入和黄金不改，不能把这个副本算作原570验收。

下一步只做一次Binaryen 133保语义优化对照：复用原始WASM及诊断WASM，
采用默认-O3及全局副作用分析，不启用low-memory-unused、traps-never-happen、
ignore-implicit-traps、fast-math或closed-world假设；保零地址控制记录、首错、
外部可调用函数和所有导出。先比较相同6秒诊断阶段/层数，只有确有实质改善
才继续完整原输入；不把外部工具加入自举必需条件，也不提前宣称native受益。
依据为官方Optimizer Cookbook的Global effects、Traps Never Happen及Low memory
unused说明；优化前后均保存独立产物，原失败不覆写。
本轮生产修改前必须先有该对照结论；避免对6.8%叶热点逐个局部打磨。

### C107：短时定位12000层的实际阶段及推进数

上一轮算进展：已完成C106直接调用和38项回归，并取得真实CPU与暂停现场；
原始可用性仍失败。本段只补齐根因定位，暂不凭6.8%的叶热点追加微优化。
复用冻结candidate、原请求和原12000输入，单独生成明确标识的诊断副本：
仅在原fixture入口、浅树操作完成、构建/向下每128层、两次root开始、重建
完成和最终检查阶段追加Eli console/log；原循环条件、步长、结果运算不变。
诊断副本不是原始验收证据，原fixture、原黄金及正式产物不改。每个替换必须
命中唯一原文，否则停止构建；不编写任何JS实现。源树只增加ignored证据目录
的Eli诊断工具/变体与编译产物，生产源码保持C106冻结。

前：原fixture→编译→长跑无阶段信息；后：独立诊断副本→同一冻结编译器→
短时运行→阶段/层数日志→停止己方进程→对照热点完整链→确定集中修复。
构建与实际用例耗时分开；运行数秒仍异常即结束该诊断，不等12000完成。

| 项目 | 施工 | 验收 |
| --- | --- | --- |
| A107：明确诊断与原始验收边界、逐阶段日志及不变输入 | [x] | 不适用 |
| B107：每个原文唯一命中、原12000/循环条件保留，复用原预期且不将日志冒充断言 | [x] | [ ] |
| C107：Eli工具加载冻结请求/资源，构建诊断副本和独立运行配置 | [x] | [ ] |
| D107：生成后仅一次数秒诊断，报告实际阶段/层数、热点及终态；定位后再集中修复 | 不适用 | [ ] |

C107诊断构建未成功，未启动新的12000层运行：工具首次导入错误、冻结资源
寻址错误、compiler session返回的原始对象异常各失败1次（共3次构建/接线
失败，0次目标执行），进程均exit1/cleanup=true。保留depth-build*.log；
不将这些记为原程序再次断言失败。已补错误输出，但按用户最新指示先转另一组
FIX07，不继续重试或打磨此辅助工具。C107不作为新发布门槛，原FIX23仍失败。

### C108：先收敛另一组FIX07跨调用根与列表/值程序

已实现的源码根因包括每节点闭包/codec、跨调用临时根、foreign身份回收和
静态属性字符串重复分配；C89已通过百万节点原604 WASM（完整105303.933ms
含编译/准备/原程序/Seed比较），C106又有38项当前调用/根释放集成通过。
仍缺原604 native及原601 WASM/native完整功能证据，不能把已有WASM结果
说成这一组全过。先只运行原604 native收取最新具体结果，不让zipper原570
排在前面阻止它启动；无新源码也不重复原570。随后基于这一组实际失败成批
修复，再验证601两个输出。当前仍7/9，原FIX03/FIX12容量验收继续保留失败。

C108原604 native已完整通过：attempt-fRGZa9保留完整百万节点源/输入、
所有原断言及独立Emacs Seed比较，1/1通过、0失败/取消，exit0/cleanup=true；
comparison必须equivalent，不能以退出码代替。原生实际ARM64动态库由Bun
直接FFI运行。host阶段143124.869ms、初始化2337.854ms、关闭7056.068ms，
整轮177.238s（含编译、准备、原程序和Seed比较）；峰14760258104字节。
这是预自举功能候选通过，原性能/容量延期记录和门槛不变，不宣称生产性能。
日志fix07-original-604-native.log。已补一个此前无通过证据的完整原例，新增
该项断言失败0、修复后失败0；在采样前进程已正常结束，sample无目标并非
目标用例失败。下一项同组原601 WASM/native串行收齐；FIX07仍未关闭。

C108原601 WASM/native完整两项2/2通过、0失败/跳过/取消，attempt-7Kxzl5
两份comparison.status均equivalent。原2000轮跨族、约52000次调用和独立Seed
黄金完整保留。WASM用例28026.931ms（实际host16801.236ms），native用例
67660.426ms（实际host48544.258ms）；整树96.287s、峰12298551296字节、
exit0/cleanup=true，日志fix07-original-601-both.log。新增断言失败0/修后失败0。
FIX07当前候选3/4通过（75%）、1/4无当前通过证据（按失败计）；旧604 WASM
C89通过保留，不能跨C90..C106重大运行时修改直接借给当前候选。只补原604
WASM当前产物，其余三个已通过不重跑。九组仍暂7/9，等第四项后才关组。

C108第四项原604 WASM已完整通过：attempt-b38L6v，1/1通过、0失败/
取消，comparison.status=equivalent，整树76.420s、峰10322509184字节、
exit0/cleanup=true；实际host59336.572ms，关闭6330.341ms。日志
fix07-original-604-wasm.log。全部原输入和独立黄金保留，非缩规模替代。

| FIX07当前候选原例 | WASM | native | 独立Seed比较 |
| --- | --- | --- | --- |
| 原601：2000轮跨族值语义、约52000次调用 | 通过 | 通过 | 两份equivalent |
| 原604：百万节点共享后缀、完整遍历/求和/身份 | 通过 | 通过 | 两份equivalent |

FIX07为4/4通过（100%）、0/4失败（0%）；本次接续新增功能断言失败0、
修复后失败0，原容量/资源失败及其计数保留不重置。这关闭功能组FIX07，
不关闭已授权延期的性能和容量门槛。固定修复清单推进为8/9关闭（88.9%）、
1/9未关闭（11.1%），只剩FIX23。所有本轮执行树已确认退出并清理。
下一项返回原570/631/649深树族，先定位/消除重复协议验证链；没有修复
或新诊断目的前不重跑12000。C107辅助工具不作为额外发布门槛，不继续为
它的接线反复消耗主线。正式stage3和固定点验收仍必须在剩余功能修齐后执行。

### C106：模块内不可变函数使用已有直接调用 ABI

C105 原570 attempt-NoijzA仍未完成；整树254.819s、峰9466227424字节后
因明显可用性异常取消，exit130/cleanup=true，无最终输出。这是C105新增
可用性取消1次，不是断言失败；与之前两次native取消分别保留，不重置历史。
原输入、12000层和黄金未改，九组仍7/9，FIX07/FIX23未关闭。

A106 基线fb98a509的当前工作区：managed.eli/lower-managed-call约1584行
把所有module命名调用排除direct；reference解析却明确按local→global→function
选择，assignment只允许mutable local/global，顶层同步函数不会被重新赋值。
结果固定参数纯函数仍创建反射函数、kind7参数tuple、通用invoke及wrapper。
现有直接ABI已保存/恢复this和首错，函数入口仍检查module生命周期。
参考已在本地阅读的ClojureScript emit* :invoke：静态非dynamic函数可直接调用；
不照搬其语言合同，资格仍以本语言绑定和尾调用标注为准。

```text
源码树（前后相同，无新模块）
bootstrap/backends/managed.eli                  lower-managed-call
tests/eliscript/native-managed-runtime.eli     模块调用语义及typed IR证明
docs/bootstrap-0.0.2-plan.md                    唯一进度与原始失败记录
```

```mermaid
flowchart LR
  A[模块命名调用] --> B{不可变同步函数且无local/global遮蔽}
  B -->|否| G[原函数值与通用调用]
  B -->|是| C{required精确参数且无尾调用标注}
  C -->|否| G
  C -->|是| D[原参数顺序求值并建立根]
  D --> E[已有直接ABI保存this并调用真实函数]
  E --> F[恢复this和原首错]
```

原图为A无条件进入G；其余动态/错误/生命周期路径不改。精确修改为
function候选去掉state.module排除，增加managed-global遮蔽检查；direct候选
增加state.tailCalls.has(node)排除。无新字段、签名或公开ABI。

| 项目 | 施工 | 验收 |
| --- | --- | --- |
| A106：完整调用/绑定/生命周期现状、目标及差异 | [x] | 不适用 |
| B106：同一Eli源码JS/WASM/native语义，精确typed调用目标与动态回退，保auto1和清理断言 | [x] | [x] |
| C106：lower-managed-call资格接线，复用已有直接调用首错/this ABI | [x] | [x] |
| D106：全部源码写齐后统一生成及受影响调用测试；通过后原完整570；不得缩小原输入或重复未变失败 | 不适用 | [ ] |

C106首次生成30.222s通过；测试fixture的report绑定列表缺一个闭括号，编译失败
1次（static-calls-affected.log），尚未执行后端行为断言。已补齐括号，保持
同源输入、预期及全部断言；此接线错误独立计数，不计为语义修复再次失败。
C106第二次fixture编译失败1次：this不是可直接引用的语言符号。移除错误
拼写，保留纯Eli的异常/身份用例；this上下文复用既有ABI，并直接断言typed IR
有current-this及两处restore，既有control调用测试保留。累计fixture编译失败2，
后端行为失败0；日志static-calls-fixture-affected.log。
C106纠正后的完整新增回归1/1通过、0失败，用例1879.11ms（包含实际
JS/WASM/native和IR断言），整组11.535s、峰2177974272字节、exit0/
cleanup=true，证据static-calls-context-affected.log。两处fixture编译失败保留；
不能据补充测试关组。随后复测整个native-managed-runtime及managed-control
调用集成文件，再验证完整原570，阶段未提前进入正式自举。
C106两个完整集成文件38/38通过、0失败，含原调用快照/this、异常首错、
闭包/GC、原生ABI和模块初始化；整组59.102s、峰6479593472字节、exit0/
cleanup=true，证据static-calls-integration.log。原570验收尚未通过。

C106完整原570 attempt-lZz5QK因明显异常取消：整轮239.943s（含构建），
峰10023461536字节、exit130/cleanup=true，无完整输出；此候选原用例0/1
通过，新增可用性取消1次，后端断言失败仍0。最新明确边界是“不超时”只适用
于合理、仍有有效进展的工作；亚秒JS基准的该用例不能等数分钟或按内存稳定
继续等。后续数秒仍异常即结束正常验收，转入有明确问题的短诊断，不变重试禁止。

随后只复用同一产物和原输入取3秒CPU样本，再暂停保存调用现场，不等待
12000层完成；诊断整树12.004s（含初始化、调试暂停准备和清理），峰8328036352
字节、exit130/cleanup=true。Profiler采样先于Debugger.enable；这不是无调试
正式性能或功能通过证据。static-calls-wasm.cpuprofile及.frames.json保留现场。
用冻结candidate/runtime.eli实际lower-memory-program，再从WASM export段读取
index校验offset=1，确定2431个样本中heap-gc-free-blocks165（6.8%）、heap-block
114（4.7%）、heap-value-valid106（4.4%）、standardProtocolReference92（3.8%）；
没有证据支持把某一个叶函数说成全部耗时来源。映射及分析见
static-calls-wasm-map.json、static-calls-wasm-analysis-scopes.log。
已暂停现场只有当前WASM顶帧可见locals，其余优化帧仅module scope，故不能从
私有局部编号猜测层数。下一项先取得可定位到原循环的层数/阶段与完整热点调用链，
再集中修复；不得再以长跑或逐个微小热点优化替代定位。

本轮新增fixture编译失败2次（均已改正）、受影响完整集成38/38通过、原570
可用性取消1次；额外短诊断取消1次单列，不充作测试断言失败。诊断工具接线
另有5次编译失败、2次随后的缺产物启动失败及1次guard admission拒绝，均不
混入语言行为修复计数。只读分析退出0，所有本轮目标进程已清理。
每轮后续报告必须包含修改/依据、真实测试比例、取消原因与重复次数，不只报
最终通过；总修复分母仍9组，7/9关闭，FIX07/FIX23仍未关闭。

### C105：三产物交叉定位与真实 Reflect 方法整族接线

本次交付按最新明确范围保留 ARM64 原生动态库＋宿主，不将它冒充独立
可执行程序。独立可执行文件仍是后续 native 方向，不是本次收尾前置。
同一原570继续保留12000层、完整操作和黄金；JS基准231.807ms。

新增对照复用了完整原输入。Node/native在attempt-u6aAgl实际发射Mach-O
ARM64动态库，初始化阶段28198.883ms；源码native-node-memory.mjs将调用和
内存小块经worker、JSON和独立Bun进程传输。停止异常链，guard exit130/
cleanup=true，整轮186.342s、峰13603952744字节；非完整用例耗时。
随后复用同一二进制和原配置，由Bun直接FFI加载，初始化1060.726ms，
仍未通过完整可用性；189.766s整轮后停止，exit130/cleanup=true、峰
11034034176字节。两次取消分别记一次，不充当断言失败或完整通过。
对照输出、分阶段生命周期、两份原生采样均在c102-source-publication。
初始化差约26.6倍是这两次观测，不宣称稳定性能比。

直接原生采样确认实际机器码执行链：managed_728→705(down)→699(branch?)
→698(end?)→689(require-location)→696(zipper?)→650(isVector)→579(dispatch)
→15(protocol dispatch)→13(direct-method)→1608(protocol-property-present)。
该链的运行时分配触发GC；705/706分别110/123个根槽，静态IR有26/31处
string分配调用，但其中含条件执行的反射初始化，不能误当动态分配次数。
既有原生IR只读提取native-ir-summary.json给出源码span、调用和根槽；不再
凭私有局部编号把旧C103/C104快照断言为某个精确循环阶段。

关键可施工差异：protocol-property-present明确调用实际Reflect.has(Object(value),key)。
Object身份路线已接，真实Reflect方法却未登记，仍经普通host codec；lowerer
自有Reflect调用已使用value-reflect-builtin，完整13项算法已存在。一次把
真实Reflect整族接到该同一ABI，防止逐方法来回修。仅认证实际具名native
函数，且输入目标为owned普通对象/数组/函数、参数齐备；外来Proxy、替换
方法、缺参及不支持形状保持原路线。参数求值已完成，不复制整个对象图。

| 项目 | 施工 | 验收 |
| --- | --- | --- |
| A105：对照JS/WASM/native及宿主边界，锁定共享分配/协议链；独立native后置 | [x] | 不适用 |
| B105：managed-host.eli补真实13项Reflect同源行为、源对象反射/身份/访问器/转换/异常/替换及Proxy，保原小堆/auto1/全部旧断言 | [x] | [ ] |
| C105-P：provider捕获Reflect原始13项方法和对应0..12操作/最少参数，导出readHostReflectIntrinsics | [x] | [ ] |
| C105-R：realm登记完整族及真实ABI gate；认证owned目标后复制原参数tuple，调用4参数value-reflect-builtin，保首错/帧清理 | [x] | [ ] |
| C105-H：memory.eli/heap-source-reflection-has对同borrowed Get的普通对象/已封存字符串或symbol键，直接查询表的存在性；避免制造完整descriptor及字段名。原型选择、惰性native初始化、对象键转换及其它形状沿原路；同源回归增加Has不得执行getter | [x] | [ ] |
| D105：全部源码写齐后生成并集中验证；通过后才以原完整输入验证阻塞，不变重试禁止 | 不适用 | [ ] |

外部资料对照：V8说明调试会降级优化代码，带调试暂停的旧耗时不作正式
基准；WasmGC能消除部分手写GC/根栈成本，但需更换对象表示，当前不扩展。
Binaryen可做内联、局部合并和直接化，可作后续独立对照，不能假设能修复
算法性多余工作。AssemblyScript曾因数组精确扩容导致80倍异常，修复增长
算法后恢复；当前source array已倍增，不能照搬或断言同一根因。
来源：https://v8.dev/docs/wasm-compilation-pipeline ，
https://v8.dev/blog/wasm-gc-porting ，https://github.com/WebAssembly/binaryen ，
https://www.assemblyscript.org/runtime.html ，
https://github.com/AssemblyScript/assemblyscript/issues/1798 。
九组仍7/9关闭；本批新增断言失败0、可用性取消2，历史记录不重置。

C105第一次集中验证在JS参考先失败1次：新增getter错误使用词法this的lambda，
返回undefined而非19。源fixture与宿主getter已一并改为使用动态this的defun；
原期望19/31不变。此为测试接线错误，尚无后端修复后行为失败证据；完整
原570未重跑。生成28.823s通过，失败日志reflect-affected.log保留。

C105第二次JS参考失败1次：新增宿主测试的Symbol.toPrimitive键误用静态
字段拼写，未建立真正的Symbol属性；已改为显式Object.defineProperty，
原17及一次string转换预期不变。累计2次测试接线失败，均在后端验证前。
同时补齐源码确认的Has内部冗余：原每级原型都调用own-descriptor并创建
完整描述符；现在普通键只查表存在性，非普通形状保持完整原路径。全部
相关修改完成后再集中生成和验证；不重跑未修改原深树。

C105整批源码生成28.842s通过；完整受影响native-inspection用例1/1通过、
0失败/跳过，91928.26575ms用例耗时（含构建、原有循环、全部新断言及
JS/WASM/native），整树峰1285114656字节、exit0/cleanup=true。
证据reflect-presence-affected.log。两处测试接线错误累计失败2次，纠正后
新增失败0次；原570仍须包含新Has实现的真实产物，不据补充测试关组。

本轮采用用户明确的可用性边界：JS 基准只用于发现异常，不要求其它输出追平
或超过它；可接受的差距后置，优先完成功能和版本交付。近一小时的量级差距
属于阻塞，不把当前工作扩大为全面性能优化。

### C104：分析空闲块切分路径，保留索引拓扑

C103原570再次可用性未通过，已停止并确认exit130/cleanup=true；总146.860s
含最后只读调试暂停，峰值9112256512字节，不当完整性能结果。观测depth0、
向下遍历剩10217；宿主sourceCache仅609、foreign102，已经不再是C102的
14865项深树发布。control[7]实际存活219136；control[5]238613224是字节
bump，不是存活对象数。不得混淆两者或再归因于同一个已修的发布入口。

本批先做源码分析，不启动新程序。暂停栈的前六层是空闲AVL索引操作；
`memory.eli:heap-allocate-block`（基线590附近）无条件remove(found)，切分
时再insert(remaining)，每次分别向根更新/旋转。残余块从found移动到
found+size，仍严格位于原前驱与后继之间；节点数、左右子树和高度均未改变。
因此切分无需删除/重新插入，只需搬移同一个索引节点并更新沿途maximum。
整块消费仍删除并平衡；释放、合并、GC排序、FIFO/代际和first-fit规则不变。
这消除已定位的重复索引维护，不把它宣称为全部异常的唯一根因。

```text
当前：first-fit(found) → AVL删除/平衡 → 残块新插入/平衡 → 原地址链更新
目标：first-fit(found) → 残块接管同一节点/父子链接/高度 → maximum向上刷新
      maximum不变即停止；无残块时仍走原删除；地址链更新完全保留
```

| 精确施工项 | 施工 | 验收 |
| --- | --- | --- |
| B104：memory-allocator.eli扩展既有Eli源码仪器100/104为AVL删除/插入计数；新增首/中/尾大空洞连续切分，独立first-fit模型、完整父子/高度/maximum/双向链、固定节点数及切分零删除/插入断言；保留原35项 | [x] | [ ] |
| C104：memory.eli在heap-free-tree-replace之后增加heap-free-tree-relocate，复制左右/父/高度并更新子节点parent，刷新maximum到不再变化；heap-allocate-block仅残块>=32分支采用它，整块消费仍remove | [x] | [ ] |
| D104：全部代码完成后生成，集中运行完整内存文件，再重新编译原570，使真正二进制包含C104；原源码/输入/黄金不变；不得原样复用旧二进制声称新runtime通过 | 不适用 | [ ] |

九组仍7/9；C103补充测试失败0次，原程序新增1次可用性取消，独立保留。

C104全部源码写齐后，括号检查、生成及源diff空白检查通过。完整内存文件
36/36通过、0失败，7.64s（含三份测试runtime构建），整树峰值1354891264
字节，exit0/cleanup=true。新增4种位置的连续切分均符合独立模型、树/链
完整不变量及零删除/插入断言；原35项未删除。证据
c102-source-publication/allocator.log。C104验证失败0次，原570仍未关闭。

C104真正重新构建的原570位于attempt-DLQjP6，原入口/zipper模块及
runtimeOptions保持原输入；新WASM函数序号因新增relocate移动1位，现场模块
标识0271ce02（旧0271c3ae）。完整执行仍未通过可用性，已停止并确认整树
exit130/cleanup=true，总281.759s含最后调试暂停，峰值9967658736字节。
取消不冒充断言失败，也不据36项通过关闭原完整用例。

本次新的关键观测：原12000层构建完成，向下遍历剩7840（完成4160/12000）；
sourceCache237、foreign102，宿主深树发布已退出主要问题。实际GC计数778、
存活427805、bump238682672字节、分配债务16764752，auto仍16777216。
因此不能继续只改桥接或笼统调GC参数：需要追踪生成代码/运行时的短期对象
分配来源。源码已确认lower-managed-literal每次求值为数字调用value-number、
为字符串调用value-string/写入/seal，没有静态字面量复用；尚不能仅凭此认定
它是全部分配的根因，下一次修改前要先对齐具体函数与分配调用链。
当前无目标测试仍运行；禁止原样重跑原570、泛化增加优化或提前完整自举。
C104补充验证失败0次、原可用性取消1次；所有历史失败计数保留。

### C103：Array.isArray只检查类型，不转换持久化内容

C102原570在约50秒执行后的只读观测中已完成原12000层构建，depth为0；
向下遍历剩11290，sourceCache14865。相同根帧此前C100只构建181层。
这证明Object路由推进了实际执行位置，但完整可用性仍失败，不能关闭FIX23。
随后同一进程抓到decodePersistentTree的源调用：source-operation8，真实
`function isArray() { [native code] }`，this为真实Array，参数kind13。
该调用仅需判定kind，不应解码深树。已停止整树exit130/cleanup=true；
总198.473s包含调试暂停，峰值8870805504字节，不能当作完整性能结果。

```text
当前：真实Array.isArray(源值) → codec.decodePersistentTree → host判型
目标：认证真实isArray → 现有value-builtin-primitive(heap,input,count,5)
      源数组直接true、其它源类型false；foreign仍走该ABI原有host16，保留Proxy错误
```

| 精确施工项 | 施工 | 验收 |
| --- | --- | --- |
| B103：managed-host.eli原native-inspection-source/exercise补isArray缺参/基本值/源对象与数组/2048次新对象/host Proxy及撤销Proxy/替换函数断言，原1024 slots/auto1不变 | [x] | [ ] |
| C103-P：provider array-intrinsics捕获完整认证的实际Array.isArray，runtime=value-builtin-primitive、operation5 | [x] | [ ] |
| C103-R：realm native-intrinsic-operation在operation8识别该ABI，只传首参及有无参数；call-native-object-operation正确调用4参数ABI；注册新增真实导出gate | [x] | [ ] |
| D103：全部完成后统一生成并集中验证完整受影响用例，随后原570完整执行/黄金比较；异常则定位并结束，禁止不变重试 | 不适用 | [ ] |

C103暂无验证失败；C102原完整可用性未通过新增1次，属于取消而非断言失败。

C103集中验证完整native-inspection 1/1通过、0失败/跳过：同源码JS参考及
实际WASM/native包含全部旧/新断言，原1024 slots/auto1，未增加预算。
整组94148.459833ms（含构建及循环），整树峰值1245008304字节，exit0/
cleanup=true。证据c102-source-publication/affected-predicate.log。C103验证失败0次；
原570仍需独立执行与黄金比较，不据补充测试关组。

### C102：Object(value)保持源对象身份，避免深层持久化值转换

原570的只读断点捕获了实际发布入口：source-operation 8，callee为真实宿主
`function Object() { [native code] }`，this为undefined，唯一参数kind13；
解码该参数进入decodePersistentTree，raw8760234，sourceCache520。调用本应
直接返回该源对象，不应先遍历其整棵持久化结构。native-data-definition-p
另一次捕获parent/canonical均8388992，不据猜测放宽原型条件。
两次诊断都已停止、exit130/cleanup=true，分别保留diagnostic/publication日志，
不是通过或重跑断言；调试暂停耗时不作为性能基准。

```text
当前：真实Object(源对象) → codec.decode → 完整持久化树 → host Object → encode
目标：认证真实Object → value-native-constructor-call(operation76) → 原源句柄
文件保持：provider.eli → realm.eli → 原memory.eli ABI；不重写运行时/标准库
基本值装箱、替换函数、Proxy及不同newTarget仍保留原宿主行为。
```

| 位置与精确施工项 | 施工 | 验收 |
| --- | --- | --- |
| B102：tests/eliscript/managed-host.eli的native-inspection-source/exercise增加Object调用/构造的身份、空值/额外参数、装箱、替换/Proxy/newTarget和2048次新源对象的小堆回收断言，同源码JS/WASM/native | [x] | [ ] |
| C102-P：managed-host-object-provider.eli在readHostObjectIntrinsics中登记认证真实Object，operation76，使用现有constructor ABI | [x] | [ ] |
| C102-R：managed-host-object-realm.eli的native-array-operation泛化为native-intrinsic-operation；真实Object仅无参数/nullish/对象输入分流，8/9/19参数偏移和相同newTarget规则不变；注册ABI过滤覆盖两个constructor，原方法过滤保持 | [x] | [ ] |
| D102：全部代码写齐后统一生成，运行完整受影响native-inspection，再执行原570完整源码/输入并与独立Seed黄金比较；仍有量级异常就停止并保留失败，不等待或原样重试 | 不适用 | [ ] |

九组仍7/9关闭；C102尚无验证失败或修复后失败，不重置C101历史3次失败。

C102首次集中验证在JS参考执行中失败1次：新增测试把new Proxy(Object)(value)
误写为返回value；Proxy是不同newTarget，原生行为应创建空对象。已一次补齐
非同一身份、真实Object.prototype和无自有字段三项断言，Proxy trap计数保留。
此为测试预期错误，WASM/native尚未执行，不能称为后端修复再次失败。
生成通过、源diff无空白错误；证据c102-source-publication/affected.log。

纠正Proxy预期后，完整受影响native-inspection用例1/1通过、0失败/跳过，
包含同源码JS参考及实际WASM/native的全部旧/新断言，原1024 slots/auto1；
整组74279.709959ms（含构建），guard exit0/cleanup=true，整树峰值1327302280
字节。证据affected-proxy.log。C102累计验证失败1次（JS预期），修正后失败0次；
尚不能关闭原570或FIX23。接下来复用同原二进制与冻结输入，仅换已生成的
host桥；独立输出另与Seed stdout逐字节比较，不复用旧通过状态。

### C101：真实默认Array构造器应产生内部数组

C100二进制的一次只读定位已结束并清理，不是新增验收重跑。源根帧1154槽，
深度计数11819，即原12000层构建仅完成181层；已GC19次、历史slot3736603、
存活61265、分配bump220389584字节、sourceCache3285、foreign451。
阈值仍16777216；不是被改成auto1，也不是最后向上遍历或死循环。
栈含value-array-prototype-call→value-source-define-descriptor→host-reflection。
源码的slice species最终调用真实foreign Array构造器，结果成为宿主数组，
随后每个深层元素都跨边界。C97只分流slice入口，没有分流此默认构造步骤。

```text
当前：实际slice → 原species查询 → 实际Array构造 → host数组 → 深层值跨边界
目标：实际slice → 同样species查询 → 认证实际Array → 已有owned构造operation75
      自定义species、Proxy、不同newTarget仍走原路，公开函数身份不替换
修改源码：managed-host-object-provider.eli / managed-host-object-realm.eli
测试源码：tests/eliscript/managed-host.eli；沿用同源码JS/WASM/native及原小堆
```

| 文件/符号与精确变更 | 施工 | 验收 |
| --- | --- | --- |
| B101：native-inspection-source增加constructorResult/constructorOwned/constructorNewTarget及empty/pair/call；同一exercise覆盖实际Array构造及调用、参数/holes/prototype/身份/不同newTarget；每个真实runtime另断言原始结果kind14，2048次原1024 slots/auto1 | [x] | [ ] |
| C101-P：provider array-intrinsics新增通过既有authentic-native-method确认的实际Array记录，runtime=value-native-constructor-call、operation75、自有constructArray=true | [x] | [ ] |
| C101-R：native-array-operation接收opcode，operation8参数从3、operation9从2复制；仅认证构造器可走9，value指向真实构造器；call-native-object-operation复用tuple/frame/首错恢复并调用既有6参数ABI；新增ABI gate，默认方法不变 | [x] | [ ] |
| D101：所有代码写齐后生成，先集中验证完整的native-inspection受影响用例（全部旧/新断言），再用同一原570检查构建是否消除跨边界放大；主阻塞解除后全文件及全量门禁，不用新样例代替原程序，不降低任何黄金 | 不适用 | [ ] |

C101首次集中验证失败1次：ELI-RT0003。代码中的constructor标记读取了普通
记录继承的Object.prototype.constructor，导致其它操作误入Array构造分支。
已改为自有constructArray===true，provider、注册过滤、分流及实际调用一起
修齐；旧有freeze/slice/iterator断言全部保留。证据 `c101-array-constructor/affected.log`。
该批失败轮数1，修正后结果仍待实际证据，不重置计数，不重新跑原完整程序。

标记修正后所有该用例的语言行为断言已完成，但新增底层ownership断言失败
35!=14；这是C101第2次验证失败。反射构造显式携带newTarget，前次错误地
把其入口认作34，修后ownership断言再次失败（第3次验证失败）。现已直接
读取value-source-construct-target源码：实际调用heap-host-request-flat 19，
34是另一项反射操作。删除错误34路由，按真实19且仅newTarget与认证Array
相同时分流；不同newTarget保留原路。分别覆盖new及Reflect.construct的
真实kind14，断言附具体函数名；不降低断言，也不原样重跑完整程序。

纠正为源码实际operation19后，完整受影响用例1/1通过，0失败/跳过，
69805.841792ms（含构建及JS/WASM/native各组循环）；包括new和Reflect构造
真实kind14、全部旧slice/species/Proxy/newTarget/错误及小堆回收断言。
证据 `c101-array-constructor/affected-opcode.log`，exit0/cleanup=true。
C101验证失败历史3次，最后修正后新增失败0次；不据此关闭原程序阻塞。
仅host桥代码改变，复用C100已构建原完整WASM及输入，不重复编译；入口和
zipper模块的两份存档源码已逐字节cmp匹配旧独立Seed JS，旧WASM/Seed完整
stdout也cmp匹配。新实际输出必须另与该Seed黄金比较，不能借用旧通过状态。
本次独立执行/资源日志为 `c101-array-constructor/original-*`，time -l记录
独立运行的墙钟、CPU和maxRSS；不含原编译耗时，不附加调试影响计时。

该次原程序仍明显异常，已停止并确认guard/time/node都退出。整轮90.645s、
峰值8371830784字节、exit130/cleanup=true，没有host-end或完整输出；取消
未得到time最终资源行，不能伪造逐例CPU值。原程序仍未通过，不把构造器
ownership通过或低层35项通过提升成主线通过。C101可用性复验未通过1次，
其补充用例历史失败3次仍保留；当前没有本任务重进程继续运行。

下一接续点：只读核对原完整构建中native-data-definition-p的parent/canonical
条件及actual Array方法分流是否实际命中，定位剩余深值被发布的具体入口；
该条件是否误拒绝真实宿主Object.prototype尚未证实，禁止凭此假设改代码。
保留已有C99/C100/C101代码与证据，不原样重跑原程序、不继续泛化回收优化。

### C100：以占用位图跳过已释放的历史槽位

C99原570仍未通过，整链已停止并确认回收；guard `70e243bd8d5648c883291d0e27de4e71`
exit130/cleanup=true、整轮103.884s（含编译、17.861s采样及调试暂停），不能
作为完整性能结果。18秒采样138313个样本集中在GC/sweep、空闲树、Error原型
恢复和named-cache重建，完整样本保留 `c99-ephemeron/original-570.cpuprofile`。
代码仍按历史highwater扫描空槽；本批处理同一剩余系统性瓶颈，不增加其它优化。

```text
修改前/后源码树不扩展：
bootstrap/runtime/memory.eli         占用位图维护、稀疏遍历、5个热点调用者
tests/eliscript/memory-allocator.eli  原仪器及跨位边界/FIFO/回收/重用/搬移用例
当前：highwater 8388607 → GC/缓存/liveness逐槽检查（含已释放槽位）
目标：control尾部每32槽一个u32 → 跳过零字 → 仅枚举置位槽，仍按slot递增
      分配成功置位、sweep清位 → 原FIFO/代际/容量/首次适配顺序完全保留
```

位图从control[552]开始，字数`(slots+32)>>5`，控制记录总长552+字数；
最大档增加约1MiB，不增加管理对象、不改变24字节slot结构及外部导出。
control[551]仍为C99临时弱表链。heap-check与heap-new-layout同步计算长度。
新函数heap-next-allocated-slot(heap,after):u32返回严格大于after的最小占用
slot或0；空字直接跳过，非零字用16/8/4/2/1位判定找到最低置位，无新后端指令。
它不分配/不移动内存/不清除错误。高水位/自由队列/退休代际保持原定义。

| 位置及精确变更 | 施工 | 验收 |
| --- | --- | --- |
| B100：memory-allocator beforeAll仪器计数96；文件末新增8192高水位、仅8个存活槽的位边界31/32/63/64/127/128/8191/8192、FIFO复用、外部token枚举、搬移后GC；用计数约束稀疏遍历，同时复用完整原34项 | [x] | [ ] |
| C100-L：memory.eli heap-check/heap-new-layout计算可变控制记录长度并清零位图；heap-next-allocated-slot放在heap-entry之后；heap-try-object成功提交时置位，失败不改位图 | [x] | [ ] |
| C100-G：heap-collect显式realm扫描及sweep改用稀疏迭代，保留slot升序以保持FIFO；回收前清除当前位，其余标记/计数/空闲树不变 | [x] | [ ] |
| C100-C：heap-error-aggregate-existing、heap-named-cache-rebuild、两个foreign-live-tokens接口改用同一迭代器；保留token顺序、溢出时不改输出和全部既有语义 | [x] | [ ] |
| D100：全部写齐后统一生成，先验证完整内存/回收文件，再验证含新runtime和独立黄金的原570；可用性解除后集中验证弱集合及宿主受影响范围，避免在主阻塞未解除时重复长套件；未解除异常不得完整自举 | 不适用 | [ ] |

修复可用性后的验证尚未通过，九组仍为7/9关闭；C99原用例未通关另计1次，
不把用户取消或诊断取消冒充断言失败，也不再把补充测试通过当作原程序通过。

C100完整内存文件35/35通过、0失败：12000深链7.53ms，稀疏槽/FIFO/token/
搬移1.75ms；保持原first-fit、容量、退休、负零及GC测试。原8192高水位不变，
稀疏用例确实满足少量占用槽的遍历计数上限。证据 `c100-sparse-slots/allocator.log`。
当前C100修正后验证失败0次；此结果仍不证明完整原程序可用性或最终stage3。

C100原570仍未通过可用性，已停止并核对全树退出。guard
`02e90b47bbb4479ca6162c2740fc35d2` cancelled/exit130/cleanup=true，
整轮71.961s（含构建），峰值9125846032字节；无host-end、无本轮通过。
证据 `c100-sparse-slots/original-570.log` 与 `attempt-TEvLtJ`，不降低深度或黄金。
因此暂停扩大通用回收优化；下一步定位原程序的具体执行位置、存活对象及
分配量来源。九组仍7/9，C99、C100各一次可用性验证未通过，和断言失败分开。

### C99：把弱映射的全表反复求解改为随标记工作的关联传播

本批仅修复阻塞原12000层程序的系统性回收开销，不增加性能目标。
基线仍为当前 master/fb98a50 的未提交候选及 C98 已通过的补充用例；
原程序仍失败验收，九组为7/9。上一轮属于进展：实际修正两个桥接的u32
边界并取得同源码三输出证明，随后原程序异常被证实，已停止而非原样等待。

当前与目标源码树均只有下列两处变更，生成物不提交：
```text
bootstrap/runtime/memory.eli        修改：heap-new-layout/heap-mark-work/heap-collect
tests/eliscript/memory-allocator.eli 修改：既有带计数的真实WASM运行时及原测试文件
```
源码证据：heap-collect:805-885 在每轮弱关联传播后扫描全部slots，直到
没有新增存活对象；嵌套对象的私有状态通过WeakMap关联时，深度可放大轮数。
这是一项确定的算法缺陷，不据此提前声称解释全部实际耗时。

```text
当前：根 → 强引用标记 → 全槽/全弱表扫描 → 再标记 → 重复直到无变化 → 清理/回收
目标：根 → 同一灰色工作栈
            ├ 新到达弱表：登记，并仅播种其已经存活的键
            └ 新到达合法键：对已经登记的弱表做哈希查找，将关联值加入同一工作栈
      → 原有realm根补齐 → 同样传播 → 只清理登记的存活弱表 → 原有回收
```

数据与边界：control[551]:u32 为本次GC的弱表raw offset链头，默认0，每次
GC开始/结束清零；heap-new-layout的控制记录从551词扩为552词。kind25弱表
header+16:u32 是临时next offset，现有容量/计数/占用在+4/+8/+12，不改变；
不把此链作为GC强引用，不分配额外管理对象，不新增导出或更改handle布局。
每个弱表仅在其第一次从灰栈弹出时登记；GC中不分配、不调用源代码，offset
在本次标记中稳定，移动之后下一次GC重新登记。值指回死键不能自救；键必须
已由真实根/强边或合法弱关联到达。全部代际、符号键及原错误语义保留。

| 变更/符号及基线位置 | 精确施工 | 施工 | 验收 |
| --- | --- | --- | --- |
| B99，memory-allocator.eli:24 beforeAll及文件末尾 | 既有仪器插入heap-weak-mark-table/heap-weak-mark-key计数88/92；增加测试私有的weak key/table/set/get/count导出；12000反向深链、迟到弱表/键、无根循环、重定位后二次GC，断言完整代际身份、回收及线性传播计数，不运行 | [x] | [ ] |
| C99-L，memory.eli:325 heap-check/340 heap-new-layout | control扩至552词且校验同样更新，551初始化为0；现有其它偏移不变 | [x] | [ ] |
| C99-M，memory.eli:692 heap-mark-work之前 | 新增heap-weak-mark-table(base,control,p,old-color)：p+16链接、扫描已有存活键一次；heap-weak-mark-key(base,control,key,old-color)：逐登记表按原hash/探测查键，标记值，不递归 | [x] | [ ] |
| C99-W，memory.eli:692 heap-mark-work | 弹出kind25时登记表；弹出13..18/21..24/26/35/36的合法对象或符号候选时传播其弱值；沿用同一灰栈与已有强边 | [x] | [ ] |
| C99-G，memory.eli:776 heap-collect | 开始清空551；移除changed全槽固定点循环；原realm条件和显式根保留，随后再drain工作栈；只沿551链清理死键，清空551后执行原sweep及缓存重建 | [x] | [ ] |
| D99 | 全部代码写齐后生成；集中运行新回收测试及受影响内存/弱集合测试，再用完整原程序及原黄金判断异常是否解除。未解除不得开展完整自举或抬高门槛 | 不适用 | [ ] |

C99首轮集中用例0/2通过、2/2失败，同一原因：控制记录扩为552词后，
heap-check仍要求551词，使实际GC在入口被拒绝，尚未执行新标记算法。
已同步校验并补上测试初始化的frame/table有效性断言；C99验证失败轮数1，
修正后仍失败次数尚无证据，不记为0次通过。原C97/C98累计4次失败保留。
首轮括号静态检查错误1次另记，已经修正；不是源程序语义失败。

校验同步后，完整内存分配/GC文件34/34通过，含深链7.69ms及跨表/循环0.29ms；
原输入、计数约束及compaction未减。证据 `c99-ephemeron/affected.log`。
该命令另选的集合文件因直接Bun多文件入口没有提供原套件注册坐标而报启动
错误1次，没有执行断言；改用项目既有final-functional-scope入口，不修改
原套件字节/哈希/断言。C99实际用例失败历史保留2项（1轮、同一初始化校验
遗漏），修正后这两项均通过；启动错误独立记录。

既有集合入口集中验证17+11项通过、各1项原已授权后置容量压力，0断言失败；
受影响完整宿主文件45通过、1既有跳过、0失败（含WASM/native真实调用）。
本批当前共107项通过、3项跳过；跳过不算通过，不证明原完整程序或最终stage3。
证据 `c99-ephemeron/{collections,host-native}.log`，均exit0/cleanup=true。
host-native命令的第二个文件参数未匹配实际文件，实际只执行了上述宿主文件，
不能宣称覆盖了独立native-managed-runtime套件；该套件仍在最终全量门禁。
接下来重新生成含C99运行时的完整原570，保留原独立Seed oracle和所有输入，
证据 `c99-ephemeron/original-570.log`。不复用不含该源码修复的旧WASM二进制。

### C97：原生 Array.slice 的源数组调用不应先发布宿主代理

#### C98：收齐同类原生数组迭代入口

C97 原 570 未取得本轮通过：异常仍存在，已停止并确认清理。现有进程直接
定位到下一入口 operation8/count3/index2，receiver kind14、真实 callee 等于
宿主 `Array.prototype.values`，sourceCache=130366；不是原样等待或失败重试。
本次用例检查包含只读调试，不能作为纯性能基准。相同根因的剩余迭代入口
按一批修齐：`values/keys/entries` 使用既有 operation225/224/223；真实
ArrayIterator.next 使用既有 `value-collection-prototype-iterator-builtin` 328。
真实函数身份保留，源数组/源迭代器在解码前分流，其余 receiver、替换函数和
Proxy 保留原路。不会增加数组其它方法或无关优化。

```text
当前：C97 provider 只认证 slice → owned Array 的 values 仍进入普通 decode
目标：同一 provider 认证 slice/values/keys/entries/ArrayIterator.next
      同一 realm token 表 → kind14 + array ABI / kind17 + iterator ABI
      原有参数 tuple、frame、首错恢复、dispose 统一复用
```

| 位置、符号与精确变更 | 施工 | 验收 |
| --- | --- | --- |
| B98：同一 native-inspection-source 新增传入真实 values/keys/entries/next 的循环、迭代终止断言；复用同一 JS/WASM/native golden 与 1024 slots/auto1 | [x] | [ ] |
| C98-P：provider 的 slice 记录扩为认证原生方法数组，记录 `runtime:string/operation:number`；next 仅从已认证 values 创建的真实空数组迭代器获取，不调用用户替代函数 | [x] | [ ] |
| C98-R：realm 的 native-array-operation 按真实 token 和 kind14/17 路由；复用 call-native-object-operation 的参数、首错与回收路径，ABI 缺失不注册相应方法 | [x] | [ ] |
| D98：全部代码写齐后生成并集中复验唯一受影响用例；不重跑未变的 44 项，原完整程序须另有实际通过证据 | 不适用 | [ ] |

C97 原 570 的检查按未通过可用性记录，实际断言失败 0；取消另记 1 次，
不抹去 C96 功能通过。C97 已知验收失败 1 次（测试 API 接线），其修正后
再失败 0 次；C98 的集中验证结果如下，不能把代码完成当作问题关闭。

C98 首次集中验证失败 1 次：ELI-RT0002。查对真实
`managed-array-native-name` 表后确认 values/entries 的路由编号写反，
原编号实际依次为 entries223、keys224、values225；不是需要增加堆预算。
已纠正两个编号，保留原 1024 slots/auto1 和全部循环/黄金，再复验受影响用例。
编号修正后的集中验证仍失败 1 次：实际原生 Array Iterator.next 收到源对象
代理后抛出 incompatible receiver。该用例在 2048 次 values/next 循环内
进入一般 operation8，不能声称循环已完成。只读现场确认 receiver 仍为 kind17/subtype6、
callee 仍为宿主真实 next，继续调查认证 token 未命中的原因，不追加堆预算。
本轮实际验证失败累计 3 次（C97 接线 1、C98 编号 1、C98 next 路由 1），
编号修正后仍失败 1 次；诊断运行另记，不重置或重复计算验收失败。
证据：`c97-profile/c98-array-opcodes-concentrated.log`；原始功能验收不据此通过。

C98 next 的只读现场已找到确定根因：`checked(value-get)` 返回
opcode=-2146434793；按 u32 解释为 2148532503，实际指向 kind4、数值8。
因此 operation 被误读成 -1，尚未尝试认证分流。token13 正确登记为
array-iterator-next/328，receiver kind17/subtype6 也正确，并非登记丢失。
`managed-host-runtime.eli:218 call` 已将同一 i32 ABI 结果正规化为 u32，
但两个外层包装的 checked 没有这样做。

| 同一根因补齐项 | 施工 | 验收 |
| --- | --- | --- |
| B98-U：保留现有 2048 次 values/next、1024 slots/auto1，同一代码 JS/WASM/native；该循环已真实触发高位为1的句柄，无需增加压力输入 | [x] | [ ] |
| C98-U：`managed-host-object-realm.eli:297 raw` 和 `managed-foreign-binding.eli:68 raw` 将全部原始 i32 返回按既有 u32 ABI 正规化；覆盖 checked 读取及直接返回 capability 的结果，错误码及异常恢复不变 | [x] | [ ] |
| D98-U：生成后集中验证该用例，通过后再运行原完整程序；调试观察不计为新的验收尝试 | 不适用 | [ ] |

首次仅修 checked 读取后仍失败：`host capability returned an invalid managed word`。
同一符号问题还影响直接返回的 raw 结果；因此将转换收敛到两个包装的 raw
唯一入口，checked 和直接 capability 返回都覆盖。累计实际验证失败 4 次，
其中该符号边界问题修后仍失败 1 次；保留 `c98-array-unsigned-concentrated.log`。
不新增压力、门槛、平台兼容范围或诊断工具；现有循环继续覆盖读写两个方向。

raw 入口统一转换后集中验证通过 1/1、0 失败、0 跳过，包含同一源码的
JS/WASM/native、2048 次循环及全部 slice/holes/species/Proxy/抛出身份。
证据 `c97-profile/c98-array-raw-unsigned-concentrated.log`，guard exit0、
cleanup=true，整树峰值 1295302768 字节。累计验证失败仍为 4 次，不重置；
最近修正后新增失败 0 次。原 570 复用已构建 WASM、全部原输入和黄金，
只替换生命周期输出路径，由 time -l 记录独立进程资源，证据 `c98-wasm570/`；
结果未出前不关闭原始程序阻塞或冒充最终 stage3 验收。

该次原 570 检查仍明显异常，已停止而不是等待自然结束。guard
`ff467e8867944ff0a966d97f37c25eed`：cancelled/exit130/cleanup=true，
elapsed=136.574s，整树记账峰值 9399844864 字节；guard/time/node 全部确认退出。
没有 host-end，没有本轮通过，不能把补充用例通过说成主线问题已解决。
运行中曾附加只读调试，因此该时间仅为异常诊断，不是完整性能测量。
现场 sourceCache=47890、foreignEntries=13160、slot highwater=8388607；
现有 foreign liveness 在每次 GC 后对该高水位做两遍全槽扫描，但旧 CPU
采样中该函数自身约占3%，不能声称它解释全部异常，也不据此只改扫描函数
再跑完整用例。下一步须针对剩余系统性开销形成完整修复，不再只增加单个
数组方法；内存稳定不是继续等待的理由。九组仍为7/9关闭，原程序阻塞未关闭。

基线为 C96 工作区、HEAD `fb98a50`。一次 15.736 秒采样已停止并完整回收，
不是重跑验收；V8 日志和分析保留在 `c97-profile/`。随后现场在原生调用解码前
确认：operation=8、count=4、receiver kind14/length1、callee foreign token16297；
该 token 的真实函数身份等于宿主 `Array.prototype.slice`。已有源码提供完整
`value-array-prototype-call(...,202)`，包含 species、空洞及原始错误语义。
这确认一条不必要的数组代理发布路径，尚不证明它解释全部异常。

```text
现状：managed-host-object-provider.eli → 只登记 Object 静态方法
      managed-host-object-realm.eli → Array.slice 落入一般 capability codec
      managed-host-runtime.eli → decode source Array → WeakRef/保根 → host slice
目标：provider 认证并登记真实 Array.slice 的函数身份
      realm 在解码前匹配真实函数 + owned Array receiver
      已有 value-array-prototype-call(heap,receiver,args,count,202)
      其它函数、用户替换方法、外部数组和 Proxy 仍走原 capability codec
```

| 施工位置和精确改动 | 施工 | 验收 |
| --- | --- | --- |
| B97：`tests/eliscript/managed-host.eli:1426 native-inspection-source` 增加传入实际 slice 的 2048 次源数组复制、稀疏数组、参数转换/species、替换方法与 foreign Proxy 断言；复用 JS/WASM/native 和原 1024 slots/auto1 | [x] | [ ] |
| C97-P：`managed-host-object-provider.eli:26` 新增 `readHostArraySliceIntrinsic()`；只认证实际捕获的具名原生 slice，返回 `{name:"array-slice",method}`，不替换公开函数 | [x] | [ ] |
| C97-R：`managed-host-object-realm.eli:58/92/148/198` 新增 raw slice 路由与注册；receiver 从 tuple[2] 读取、参数从 tuple[3] 复制，调用既有 operation202；继承现有 frame/首错恢复和 disposer，缺少 ABI 时不启用 | [x] | [ ] |
| D97：B/C 全部完成后统一生成，集中验证完整受影响文件；依据原 JS 基准检查异常是否收敛，再恢复原功能验收 | 不适用 | [ ] |

不降低原始深度、黄金、内存/语义门槛，不用此探针代替原程序验收；不新增
第三方语言基准。采样启动配置错误 2 次、调试表达式触发代理重入错误 1 次、
断点设置冲突 1 次均独立记为诊断错误；受影响探针已停止，不冒充程序失败。
当前根因修复后失败新增 0 次；C97 尚未运行修复验证，不据此关闭问题。

C97 第一次完整受影响文件验证：46 项、44 通过、1 失败、1 既有跳过，
136369.987667ms。失败为测试适配器遗漏新导出，`api.sliceOwned is not a function`；
同一源码的 JS 参考分支已先完成，WASM/native 测试 API 尚未接入新函数。
已将适配器改为遍历同一参考模块的实际导出，避免手工列表漏项，同时补齐
零参数、负边界及 owned 参数转换抛出身份。生产路由不变；只复验这个受影响
用例，保留同版其余 44 项通过证据，不重新跑整文件。新增验收失败 1 次
（测试接线），实际源程序语义失败尚无证据；修正后是否通过仍以日志为准。
执行器 exit1/cleanup=true，整树峰值 4035638512 字节；未触发内存中断。

测试接线修正后的集中复验通过：1/1、0 失败、0 跳过，20143.077ms；内部
实际覆盖同一源码的 JS 参考、WASM 和本机 native，含上述 2048 次复制及
稀疏/边界/species/替换方法/Proxy/抛出身份，原 1024 slots/auto1 不变。
证据 `c97-profile/slice-wiring-concentrated.log`，guard exit0/cleanup=true。
结合未受测试适配修改影响的 44 项通过证据，本文件为 45 项通过、1 项原有
跳过；不把既有跳过冒充通过。不额外重跑 44 项，不重置首次接线失败计数。
这证明新路由的语义与小堆回收，不证明原完整 zipper 耗时已经收敛。
原 570 的已构建 WASM 和全部原输入保持不变，复用新 host 路由直接运行；
只替换本轮生命周期输出路径，单独记录用例墙钟/CPU/maxRSS，证据
`c97-wasm570/`，不重复生成原产物，也不声称最终 stage3 验收已完成。

用户明确要求停止，不再等待异常慢的原始程序。已向本轮执行器发送中断，
`51397c6052a94f59912bee7add060eb7` 返回 cancelled/exit130/cleanup_complete=true；
执行器、runner、631 的驱动和 Bun 子进程均已确认退出。整棵进程树记账峰值
17520727080 字节，不能冒充某个用例的内存峰值。保留原 570 通过证据，
631 记本次用户取消，其余未取得通过证据；不把取消新增为断言失败或失败修复。

按用户最新要求，只采用此前已使用并验证的 JavaScript 输出作为性能基准；
不新增手写 JS 或第三方语言 benchmark。原 570 的独立 Emacs seed JS 产物与
WASM 所用入口、zipper 模块的存档 Eli 源码均已用 `cmp` 确认逐字节一致。
以各自生命周期单调时钟的 child-spawn → child-exit 为相同计时边界：

| 同一完整原始用例（12000 层） | 执行耗时 | 结果与限制 |
| --- | --- | --- |
| 既有编译器的 JavaScript 输出 | 231.807083 ms | 功能通过；不含编译时间 |
| C96 WASM 输出 | 3401220.092833 ms（56 分 41 秒） | 功能通过，但严重不可用；期间有只读调试检查，不能冒充正式性能测量 |
| C96 native 输出 | 无本次可比数据 | 不用历史不同程序或较小输入替代 |

机器可读汇总为 `_worktree/evidence/goal-0.0.2/c97-reference/comparison.json`，
原始生命周期和源码仍保留在 `attempt-GEHKv4`。逐例 CPU 时间和完整内存峰值
尚无统一记录，明确留空，不能从执行器整组峰值推算。仅有最终输出一致不足以
关闭这种可用性阻塞；先定位并修复异常开销，不原样重跑耗时链或继续完整自举。
本次原十项验收仍为通过 1/10、未通过 9/10（包含取消和未执行），九组修复
仍为关闭 7/9；原有实际失败计数不重置。可选参考探针曾有启动编译错误 1 次，
未执行，已按最新要求撤去，不计作主线编译器修复失败或新增验收结果。

## C96：修复私有 zipper 路径的持久集合展开与槽位耗尽

C95 原 570 WASM 实际失败 1 次，exit1、signal=null、ELI-RT0002；不是超时、
Node 堆 OOM 或外层资源中断。失败时 used=756199168/capacity=1073741824 字节，
live=8181305，highwater=maxSlots=8388607，freeSlotHead=0，collections=4759。
字节池尚未耗尽，槽位已经没有可分配项。后继链已立即停止，guard
exit130/cleanup=true，峰值 16743727104 字节；不再提高任何预算。实际程序
失败新增 1 次，后继取消独立记录；九组仍 7/9 关闭、FIX07/FIX23 未关闭。
原始证据 `c95-original-ten.log` 和该轮原 570 的 process-outcome.json 保留。

基线：C95 工作区、HEAD `fb98a50`。源码树与现状流程：
```text
stdlib/core/zipper.eli:24 zipper-slot / :50 zipper-path / :100 zipper-mark-changed
  down → PersistentVector(单父节点) → PersistentVector(6 槽私有路径)
  sibling/edit/up → Collection.assoc 私有路径 → 新持久 Vector 包装与传输
tools/backends/eliscript/managed-host-runtime.eli
  decodePersistentFrame/Tree → 展开持久集合子项并绑定宿主实例
  decodeOrdinary(Array)      → 发布延迟读取的视图，不展开其子图
tests/eliscript/persistent-zipper-path.eli:39–120 → 既有完整路径/旧格式/12000 深度
```
公开 location 和公开 path 必须仍为不可变持久 Vector；私有路径格式没有公开
Vector 类型合同。已压缩的单父链接仍使用公共持久 Vector 表示，跨宿主边界
会走持久集合物化；这使不需要对外展开的内部工作状态也参与大量分配与保根。
本批只把新建私有路径及单父 holder 改为冻结的普通数组，利用已有延迟视图；
不改变公开集合、节点、原始规模、黄金、槽位格式/上限及任何内存预算。

目标源码树和调用流（相对基线的差异）：
```text
stdlib/core/zipper.eli                 修改：私有 tuple WeakSet、构造/索引/更新
tests/eliscript/persistent-zipper-path.eli  修改：冻结与复制/跨实例格式兼容
specs/0174-persistent-zipper-navigation.md  修改：仅补私有表示说明
down → frozen Array[父节点] → frozen Array[左,右,父路径,holder,changed,true]
edit/sibling/up → zipper-path-assoc → 固定 6 槽复制，不调用公共 Vector assoc
public path → 原有祖先物化 + holder 弱缓存 → 同一公开持久 Vector
```
私有 `zipper-private-tuples:WeakSet<Array>` 仅认证本模块新建数组；
`zipper-private-array(&rest values)` 冻结并登记新数组。
`zipper-slot(values,index)` 对已登记数组和识别出的 6 槽紧凑数组副本直接索引
并检查边界，其他输入仍用原 Vector indexed/reducible 路径及原错误。跨实例
单父数组由 parent helper 直接读取 0 槽并保留空 holder 错误。
`zipper-single-parent?` 同时识别原
6 槽 Vector、新数组及跨实例复制的 6 槽数组标记；5 槽 Vector/List 原样兼容。
`zipper-path-assoc(path,index,value)` 对已登记路径及识别出的跨实例紧凑数组
副本以固定槽位复制，其他输入仍调用原 Collection.assoc。所有路径更新点（mark/right/left/extreme/
insert/remove）统一接线。共享 holder 及 public path 缓存键保持不变。

| 项目 | 施工 | 验收 |
| --- | --- | --- |
| B96：复用原 12000 深度和全部旧 Vector/List 测试；新增私有状态不可写、普通数组副本/旧 6 槽 Vector 的路径身份、兄弟/修改/移除、公开 Vector 类型和旧根不变测试 | [x] | [x] |
| C96：上述 zipper 私有数组构造/读取/固定槽更新和全部调用点；down 单父 holder 接线 | [x] | [ ] |
| C96-S：0174 仅修改内部表示与直接读取说明，PZN-01..09 原门槛和全部公开 API 不变 | [x] | [ ] |
| C96-G：忽略由 persistent-zipper-path.eli 生成的测试 MJS；仅 Eli 测试源码进入提交 | [x] | [x] |
| D96：全部实现完成后一次生成并集中验证路径完整文件、原完整 JS zipper、原十项；通过后完整自举、正式三输出与原全门禁 | 不适用 | [ ] |

本批 B/C 已全部写齐后进入集中 D。生成成功，guard exit0/cleanup=true，
峰值 242925568 字节（`c96-generate.log`）。完整路径契约 4/4 通过，
含原 12000 深度、公开路径身份、旧 Vector/List 和新增不可写/副本兼容；
guard exit0/cleanup=true，峰值 413761536 字节（`c96-zipper-path.log`）。
原完整 JS zipper 2/2 通过，包含 Seed/自举编译与 Bun/Node 原完整程序、
索引回溯及零 reduce 访问约束；guard exit0/cleanup=true，峰值 455917568
字节（`c96-original-js-zipper.log`）。本批当前编译失败 0、断言失败 0。

上述 6/6 只证明受影响 JS 行为，不关闭 WASM/native 阻塞或正式 stage3。
已开始同一原始十项的串行集中验证（`c96-original-ten.log`），保留完整输入、
黄金和既有预算，仅一个受控进程树；不恢复 C95 失败链，不启动完整自举。
FIX07/FIX23 仍未关闭，九组维持 7/9；通过原十项后才推进完整自举。

C96 原 570 的一次有界只读现场检查：sourceCache=1134229，foreignEntries=50733；
heap live=1958251、used=348988792、maxSlots/highwater=8388607，空闲链头非零。
原 1154 槽根帧的建树倒计数槽 396 为数值 0；向下遍历倒计数槽 454/456
为数值 4518，即原 12000 层已走过 7482 层（该子阶段 62.35%）。没有改变
原始循环、输入、黄金、预算或调用运行时写入/收集 API。断点已清除、程序
恢复、调试客户端正常退出；当前仍在运行，不把此检查计为用例通过或失败。

后续同一进程检查：根帧 396/454/456 均为数值 0，原 12000 层建树和向下
导航全部完成；实际调用帧含 root(code711) → up(code706)，正进行回溯。
此时 sourceCache=2119626、live=3620081、used=460861800，freeHead=4339829
非零，未重现槽位耗尽。只据此确认阶段推进，不推断修改后重建或独立比较
已完成。一次诊断读取早于断点停稳，产生客户端上下文 ReferenceError；
已清除断点并恢复，确认停稳后取得上述只读结果。此诊断失败单独计 1 次，
不是程序、编译或修复验证失败；全部调试客户端均正常退出，目标继续运行。

生成物归属收口：另外六个已经完整迁移到 Eli、已注册生成且已有精确忽略规则
的 MJS 仍被旧 Git 索引跟踪。现仅从索引移除，磁盘产物原样保留供正在运行
的验证使用；对应 Eli 源码纳入暂存，不新写或提交生成 JS。路径为
`tests/compiler-corpus-f64-replay.test.mjs`、`tests/compiler-ir-session-ingress.test.mjs`、
`tests/compiler-parity-corpus.test.mjs`、`tests/stable-compatibility-corpus.test.mjs`、
`tools/runtime/unicode-property-aliases.mjs`、`tools/testing/resource-supervisor.mjs`。
此项属于生成物不入库的交付约束，不增加功能通过数量，不重跑已有测试。

C96 原 570 WASM 已完整通过：进程 `status=passed/exit0/signal=null`，独立
`comparison.json` 为 `status=equivalent`，不是仅有 host-end 或计数快照。
完整单项 TAP 耗时 3414792.419834ms；原 12000 层、全部输出、独立 Seed
oracle 均保留。证据为 `attempt-GEHKv4/wasm/570/{execution,comparison}.json`、
其 original-process/process-outcome.json 与 `c96-original-ten.log`。该项仍很慢，
不因此声称性能达标，也不关闭尚未完整验证的 FIX23。

本次原十项已有通过 1/10：WASM 1/5（20%）、native 0/5；其余九项尚无
本次通过证据，实际运行原因分别保留，不伪造为九次断言失败。当前已顺序
进入原 631 WASM，仍只有一个完整受控进程树。九组仍 7/9 关闭；当前 C96
编译失败 0、程序/断言失败 0，C95 原 570 实际失败 1 次的历史记录不重置。
末尾排障断点解析失败 3 次另记诊断失败，调试连接已退出；原程序结束后
曾等待调试连接断开，不把这段等待当作 WASM 计算进度或程序失败。

## C95：先修复原型读取时不必要的接收者发布，再集中验证

C94 原十项已按当前指令停止，未取得通过证据；执行器
`141653e9fb484663b2b1f4603a1ffee4` cancelled/exit130/cleanup=true，
峰值 10817175552 字节。这是执行顺序纠正取消 1 次，独立于此前四次定位取消、
一次启动配置取消、两次外层资源中断和一次程序内 OOM；不记成新断言失败。
修复组仍为 7/9 关闭、2/9 未关闭，不把已写代码当作通过。

源码快照为 C94 工作区，基线 HEAD `fb98a50`。现状树和数据流：
`managed-host-runtime.eli:1732 capabilityBridge` → `decode` 所有操作参数
（含接收者）→ `withHostCallback` → `Reflect.get`。
`memory.eli/value-source-get-with-receiver` 在原型链到达 foreign Object.prototype
时传四项操作参数，即使真实属性缺失，接收者也先进入 `decodeOrdinary` →
`rememberSource` → WeakRef/consoleRoots。已有 canonicalInheritedSet 在同一入口
避免类似写入发布，但读取尚无对应处理。这里只据源码确认不必要发布，尚不
声称它解释全部规模开销；不得再以扩大 Node 堆代替修复。

目标树及差异：
```text
tools/backends/eliscript/managed-host-runtime.eli  修改：新增 canonicalInheritedGet
tests/eliscript/managed-host.eli                  修改：原型读取与小堆回收回归
docs/bootstrap-0.0.2-plan.md                      修改：本节施工与验收分离
```
目标流程：capabilityBridge → 新 canonicalInheritedGet → 确认真实宿主原型/
原始字符串或 Symbol 等原始键 → 真实 own descriptor；缺失且原型为空返回 raw3，
真实数据属性直接 encode(value)，无 getter 的访问器返回 raw3；存在 getter 或
不满足精确条件则完整保留原 decode/Reflect.get。接收者只有确需读取时才发布。
不缓存描述符或否定结果，不改变新增属性、删除、getter 首错、receiver 身份、
其他 foreign Proxy 的陷阱或观察顺序。已有 Set 路径保持原样。

| ID | 文件与符号/精确动作 | 施工 | 验收 |
| --- | --- | --- | --- |
| B95 | managed-host.eli：复用 shared-backend，新增同一 Eli 源的 JS/WASM/native 回归；缺失字符串/Symbol、继承数据、getter receiver/false/undefined、foreign Proxy 陷阱；原 1024-slot/auto1 下同步创建 2048 个临时数组后 collect，不能借助 job yield 回收 | [x] | [x] |
| C95 | managed-host-runtime.eli：canonicalInheritedSet 前新增 canonicalInheritedGet(name,arguments,codec)，返回 raw Number 或 nullish；桥接先取 Get 结果、未命中再走原 Set 和完整解码；不读接收者、不增加根/预算 | [x] | [x] |
| D95 | 全部剩余实现写齐后一次生成，集中验证受影响完整文件和原十项；通过后完整自举与正式三输出 | 不适用 | [ ] |

本批 B95/C95 已写齐，新增实现和测试都只用 Eli；尚未生成或测试。下一步为
集中验证；原完整输入、独立黄金、性能/容量历史记录及两组延期均保留。
首次集中生成失败 1 次：新增 canonicalInheritedGet 缺少一个闭合括号，工具
编译报 unexpected end of input；已补齐。属于本批编译失败，实际行为测试
尚未开始，不混入原十项的运行失败或已经关闭组的次数。

集中生成修正后成功。三个受影响完整文件共注册 59 项：57 通过、1 实际失败、
1 为既有隔离父进程跳过（子进程按原合同实际执行）。新增 Get 回归在真实
1024-slot 堆报容量耗尽；其他既有项目通过，guard exit1/cleanup=true，峰值
3884502896 字节。证据 `c95-host-concentrated.log`，本批实际验证失败累计
1、修后仍失败 1、编译失败 1；不混入历史资源中断。

源码对照已确认本次实现遗漏同一族路径：`managed.eli:5078` 的 foreignEntry
同时启用宿主 Array.prototype 身份，数组缺失读取直接向宿主 Array.prototype
发起一次 Reflect.get，内部才走 Object.prototype，不会再次进入桥接的 Object
优化。因此只处理 Object 不能避免数组发布。本批已补齐：仅当 target 为真实
Array.prototype，且 parent 为真实 Object.prototype，才在同一次读取中依次读
两个真实 own descriptor；数据、无 getter 和终端缺失均不发布 receiver。
用户替换 parent 时保留原完整路径；任一 getter 都保留实际 receiver/原始异常。
测试已同时补齐 Array own 数据遮蔽、删除恢复、继承 Object 数据和 getter 身份，
仍用同一 2048/1024/auto1 输入；未增大堆、未 yield、未修改原十项。全部相关
代码已补齐后才重新生成、集中验证，不启动原十项或完整自举。

补齐 Array 路径后的集中终态：59 项注册，58 通过、0 失败、1 既有隔离父项
跳过（真实隔离 Node 子进程测试通过），未取消，guard exit0/cleanup=true，
峰值 3328488232 字节。新增 Get 测试的 JS/WASM/native 均执行并通过原
2048/1024/auto1 输入；完整原对象/数组身份、descriptor、getter、集合边界、
关闭及 20,000 节点刷新测试保持通过。证据 `c95-host-array-concentrated.log`；
不重置本批 1 次实际失败、1 次修后仍失败、1 次编译失败记录。
B95/C95 的对应集中验收已通过；D95 的完整原十项和正式固定点仍不勾选。
本次源代码改变了真实 Get 的发布路径，才允许使用 `c95-original-ten.log`
重新验证原十项；只运行一条受控树，绝不并发复制。本批没有未写的已知修复。

原 570 的后续只读计数核对：真实根帧长度仍为 1154，原建树和向下遍历的
396/454/456 槽均为 kind4 数值 0；完整 12,000 层向下遍历已走完，不再沿用
C93 的 7810/12000 旧快照描述当前运行。此时 sourceCache=2616398、
foreignEntries=117823。只读检查未调用运行时写入或收集 API；断点已清除，
程序已继续，调试客户端正常退出。后继上溯、报告、进程退出和独立比较仍需
真实终态，因此这条计数证据不关闭 FIX23，不增加通过数量。常规日志缺少
循环进度才补此次核对，不能把 CPU 占用本身当作进度或验收证据。

后续只读调用帧核对进一步确认当前链为 `zipper_report → root(708) → up(703)
→ zipper_rebuild_children(683)`，处于修改后树的重建。原未修改树的 root 调用
已经返回；不是仍在向下遍历或卡在未修改树的回溯。此时
sourceCache=3563909、foreignEntries=109635，断点再次清除、程序恢复、客户端
正常退出。仅以原始内存读取名称、函数码及帧数据，未调用 managed 收集或
写入 API。当前还没有完整进程退出/比较结果，原十项与 7/9 组数不作提升。

## C94：把 Node 内部堆预算接入既有进程树保护

C93 的 24GiB 轮原 570 WASM 实际失败 1 次：子进程 stderr 的两次末尾 GC
均为约 4010→3994 MiB，随后 `JavaScript heap out of memory`。这是 Node
默认约 4GiB JavaScript 堆耗尽，不是外层 24GiB 触发，也不是原断言失败。
外层最高实际计量 14360985600 字节，未达硬上限。此前漏核对这个内部默认值，
导致无效长跑；不把它归因于机器忙或外层额度不足。完整失败日志保留在
`c93-original-ten-24g.log` 和原进程 stderr。随后已关闭并完整回收整条旧链，
guard cancelled/exit130/cleanup=true；原 631 在运行中取消，另外八项未启动。
当前十项仍均无通过证据，原 570 的 C93 修后验收两次未通过：一次外层
12GiB 中断、一次程序内 4GiB 堆 OOM。定位取消 4 次、启动配置取消 1 次、
外层资源中断 2 次、程序内 OOM 1 次分别保留。

现状：Makefile 第 3 行 NODE 选择引擎，但未给 V8 堆预算；原进程执行器
`compiler-corpus-process.eli/runOriginalCorpusProcess:266` 已原样合并继承环境，
没有另设 max-old-space-size。目标只补 Node 内部预算，不再提高外层额度。
Makefile 新增 `ELISCRIPT_NODE_HEAP_MIB ?= 12288`，用 `export NODE_OPTIONS ?=`
传递给本次及所有子进程；保留调用者已有 NODE_OPTIONS 和显式覆盖能力。
重型命令仍由同一对话 24GiB 总树上限与系统压力监测保护，12GiB 不是整树
预算，也不预分配内存。直接运行原十项时显式传同一 NODE_OPTIONS，以便
人工复现；源输入、内部托管堆、黄金、超时合同和历史性能门槛均不修改。

| 项目 | 施工 | 验收 |
| --- | --- | --- |
| B：复用已失败的原十项完整输入/黄金；核对 Node 实际 V8 参数及 Bun 对继承参数的启动兼容性 | [x] | [x] |
| C：Makefile 的可覆盖 Node 堆预算和环境继承；原执行器不改结果/哈希/源码 | [x] | [x] |
| D：参数核对后，同一 24GiB 单树保护重新完整原十项，通过后完整自举及三输出 | 不适用 | [ ] |

实际配置核对通过：经 Makefile 导出的 Node `--v8-options` 显示
max-old-space-size=12288（`c94-node-budget.log`）；同一环境 Bun 正常启动并
返回 1.4.0。此核对不分配大堆、不执行目标程序，不替代原功能验收。旧链
全部 PID 已退出。接下来只跑原十项，不重跑未受影响的已通过文件。
原 570 的 process-outcome.json 确认为 failed/SIGABRT，严格 deadline 与有效
deadline 均为 null，排除超时。当前集中运行日志为 `c94-original-ten.log`，
Node 内部堆 12GiB、外层整树 24GiB；不附加调试器，等待完整原始终态。

## C93：消除三个原 zipper 样例跨边界重复转换整条祖先列表

C92 的读取修复已通过全部受影响文件，但不能据此关闭原树样例。对原 570
进程的只读快照仍看到深层遍历剩余 11817，建树已完成。继续源码追踪确认：
`stdlib/core/zipper.eli/down:193` 每层 conj 一份不断变长的 parent-nodes Vector；
运行时 encodeLiteralValue 的 vector values 与 decodePersistent 的完整 transport
使新祖先 Vector 在源/宿主间逐项转换。12,000 层累加为平方数量的元素转换；
同一 FIX23 的 570、631、649 都走此链。C92 已修的 descriptor 重复分配是真实
问题，但只是常数开销。collectionEntries=0，排除 Map/Set 同步。原运行已按
归属结束并完整回收，exit130/cleanup=true，峰值 10098027512 字节；诊断取消
再计 1（累计四次，另有一次资源中断），新增断言/编译失败均为 0。

现状路径 `[lefts,rights,parentPath,allParents,changed]`；目标为私有路径
`[lefts,rights,parentPath,[parentNode],changed,true]`，每层只新增直接父节点。
`zipper-parent-node(path)` 对六槽标记路径读 slot3 的唯一元素；对原五槽 Vector/List
仍用原 indexed/reducible 最后祖先读取。up/remove 共用此 helper，兄弟/编辑的
assoc 原样保留新标记。`path(location)` 只在公开请求时迭代恢复根到父的原
Vector；私有 WeakMap 以共享的单元素父 Vector 为键，保持同一位置以及兄弟/
编辑位置的 path 身份，旧五槽路径仍直接
返回原 allParents。下潜新路径接旧路径时以旧祖先 Vector 为前缀；所有节点
包括 nil/false/undefined 均不作哨兵。公开 28 个导出和所有原黄金不变。

源码树：zipper.eli 增加两个私有 helper 与一个 WeakMap；下潜→直接父引用→
上溯直接读取；公开 path→迭代祖先链→缓存 Vector。仅修改规格的内部表示说明，
不改 PZN-01..09、原 12,000/512 层、原时限、原 reduce-visits=0 或资源历史。
新 `.eli` 测试经原 Emacs bootstrap 生成；测试独立编译真实 zipper 源码，覆盖
path 顺序/重复身份、分支编辑、不变根、旧 Vector/List 路径、混合路径及深树。
完整原 570/631/649 与 FIX07 的 601/604 仍为最终功能证明，不以新测试替代。

| 项目及锚点 | 施工 | 验收 |
| --- | --- | --- |
| B：persistent-zipper-path.eli 完整公开 path/旧格式/深树测试，bootstrap.el 注册并接入 Makefile | [x] | [x] |
| C：zipper.eli 的压缩私有路径、兼容 parent helper、公开 path 弱缓存；up/remove 同步接线 | [x] | [x] |
| C：0174 仅补充私有表示与延迟 path 物化，不更改原验收条款 | [x] | [x] |
| B/C：复用 managed-runtime-extended 的完整真实快照/损坏拒绝断言，修正 snapshot 读取器的旧 294-word 为当前 551-word，检查完整末字边界 | [x] | [x] |
| C：最终 stage3 三目标和 Makefile Node 全文件入口串行，保留原调度测试及完整输入；原十项结束后生成并统一验证 | [x] | [x] |
| D：全部实现后集中生成、新测试及原 zipper 完整门禁/原双输出十项，再完整自举 | 不适用 | [ ] |

C93 新 `.eli` 测试动态加载接线累计编译失败 2 次：误用静态 import，以及
误把局部工具函数 import-module 当作内建。现已复用原 loadManagedHostModules
加载真实生成模块；未改编译器语法，也未修改任何既有黄金。
首次新测试加载的声明 referrer 错传 URL，导致共享 before 失败，3 项均失败验收；
接线失败计 1，实际行为断言失败仍为 0。已按原声明格式传模块相对 ID。同次源码
核对还发现 allocator snapshot 读取器保留 C90 前的 294-word 断言，与 C91 的
551-word 不符，属于最终门禁的真实接线缺口；本批同时修正，不放宽旧检测，
复用原完整 managed-runtime-extended 测试检查当前布局和损坏拒绝。

集中验证终态：新 path 完整文件 3/3、原 persistent-zipper 完整文件 2/2、
原 managed-runtime-extended 完整文件 19/19，合计 24/24 通过，均正常退出并
完整回收。原 JS 门禁保留四个 seed/self-hosted × Node/Bun 的 12,000 层运行、
完整源码/Source Map 相等和 indexed-ascent 的 reduce-visits=0。新测试同时
验证旧 List/Vector 路径混用、兄弟/编辑 path 共享身份、12,000 个祖先逐项
真实引用，以及原根和修改根。snapshot 原损坏拒绝/21..23bit/八百万边界也
全部通过。证据 `c93-path-contract-integrated.log`、`c93-original-js-zipper.log`、
`c93-runtime-extended.log`；峰值分别 472596480、317816832、1027871392 字节。
当前原双输出十项及正式固定点尚不计通过；修复组仍 7/9 关闭、2/9 未关闭。
原十项已使用此源码重新生成并进入同一次顺序运行，证据
`c93-original-ten.log`。原 570 的只读根帧快照确认：建树结束，向下遍历已从
完成 1222/12000、4251/12000 推进到 7810/12000；这是循环进度，不是通过证明。其源码
归档包含新的 single-parent 实现，未复用旧 zipper 产物。随后同一轮触及外层
12GiB 保护：reason=memory_limit/exit137/cleanup=true，峰值 12931928864 字节，
运行 1795.422 秒；不是断言失败或定时结束。十项均未取得通过证据，首项实际
资源中断，其余九项未启动。资源中断累计 2 次，瓶颈定位取消仍为 4 次。

追加源码调查：sourceCache 从 980203 项增至 1724116 项；对前者每 128 项
抽样中 kind14 为 7361、kind13 为 261、kind18 为 36。跨界参数容器
本身为 kind7，只逐项 decode，不被包装为视图；decodePersistentFrame/Value
也直接读取 raw values 并构建普通宿主数组。尚不能宣称永久泄漏；真实源数组
视图的 WeakRef/FinalizationRegistry 会在长同步调用中暂留。没有修改身份、
实时变更或释放语义来规避此结果。按用户已有有限扩容授权，主机实测 64GiB、
available 34.29GiB、内核压力级别 1，下一次只允许一树并使用外层 24GiB 硬
上限（含本对话合计/footprint/压力保护）；不改变原程序、内部堆配置、黄金或
历史容量门槛。再次达到该有限边界则回到源码修复，不继续提高外层上限。

最终门禁执行的既有内存控制项同时补齐：`stage3-targets.eli/runStage3Targets`
原来固定 parallelTargets=true，现固定 false，完整三个目标依次执行；公开
拒绝覆盖 producer/corpus/callback 等保护不变，原并行调度 seam 及其完整测试
仍保留。Makefile 四处 Node 全文件入口显式 --test-concurrency=1，保留全部
文件、参数、断言和门槛。不是新增功能修复组，不改变 9 组分母。原 stage3-
targets 全文件与最终 make test 验证这一执行项。C93 原十项已资源中断并完整
回收，随后一次生成调度修改，先验证受影响 stage3-targets 全文件，再以有限
24GiB 上限恢复原十项；不重复已经通过且未受影响的 24 项。
调度生成已一次通过；stage3-targets 完整文件 17/17 通过，包括同一 Eli 程序
实际发射并运行 JS/WASM/native、完整原语料冻结、不可注入 producer/oracle/
比较器、取消和 false/undefined 首错，以及保留的并行 seam 测试。guard
exit0/cleanup=true，峰值 2864267264 字节，证据 `c93-serial-stage3-gates.log`。
这不是正式 stage3 全语料验收；固定点和最终三输出仍未通过。
原十项的有限 24GiB 单树运行已启动，当前日志为
`c93-original-ten-24g.log`；保留 12GiB 中断的原日志，不覆盖、不原额重试。
输入、内部堆配置与源码保持同一 C93 版本，等待完整终态后再接续自举。
此 24GiB 轮不附加调试器、不暂停读取循环计数，只使用原程序生命周期日志、
原比较结果和外部受控执行器观察，避免为百分比汇报干扰执行。旧轮调试快照
只用于定位和当时循环进度，不作为性能或容量通过证据。

## C92：修复原深层遍历中普通 Get 的描述符分配链

C91 原字段完整 B 再次通过；原 570 仍阻塞完整运行。原进程只读根帧显示建树
倒计数已为 0，后继深层遍历剩余从 11861 到 11822，不能误报为建树循环。
同一进程实际 CPU 样本中 heap-collect 自身 11.71%、foreign 活枚举自身
5.90%；GC 调用链为普通 Get → own-descriptor → descriptor-object → 分配。
宿主 sourceCache 已有 164754 个视图，collectionEntries 为 0，排除可变 Map/Set
同步为本次热点。原运行已结束并完整回收，exit130/cleanup=true，峰值
12625903616 字节；新增诊断取消 1 次（累计三次瓶颈定位取消，另一次资源中断），
不新增断言失败。证据 `c91-zipper-570-running.cpuprofile`、`c91-original-ten.log`。

现状：`managed-source-view.eli/decoded-source-get:332` 每个 Get 先完整读描述符，
再执行真实 Get；`memory.eli/value-source-get-with-receiver:26628` 的 Array own
Get 再创建完整公开描述符，仅为提取其 value/get。目标只去掉这两处内部重复
转换，保留所有公开描述符、getter、receiver、异常、冻结和原型链行为。

源码树不变：宿主工厂 → 私有 decoder → Get → 真实源 Get；Array own Get →
现有原始数组槽/访问器记录。公开 descriptor/keys/define/preventExtensions 仍
完整镜像。新增私有配置 `directGet`（布尔，默认 false），仅真实运行时工厂
置 true：私有 shadow 上已发布的不可配置属性由原 descriptor/define/integrity
路径保持；普通 Get 不需要预先把尚未发布的源属性复制到 shadow。默认共享
工厂和公共工厂继续原 descriptor-before-get 合同，不修改既有顺序断言。
Array 仅在原 own-presence 为真时直接读取；访问器用原 helper 和真实 receiver，
data 的 length/索引/命名值用当前源值；缺项、继承和其他类型保留原路径。

| 项目及符号 | 施工 | 验收 |
| --- | --- | --- |
| B：decoder 新增 directGet 读取、不可配置/冻结/访问器/receiver/首错及默认路径隔离用例；真实 WASM/native 共用原程序增加数组读取和完整反射断言 | [x] | [x] |
| B：allocator 仅在测试镜像统计真实 descriptor-object 入口，验证 own 索引/length/undefined Get 不创建描述符，公开 descriptor 仍创建 | [x] | [x] |
| C：managed-source-view.eli 的私有 directGet 开关与实际 host 工厂接线，默认不变 | [x] | [x] |
| C：memory.eli 的 Array own Get 原值/原 getter 读取，不创建公开 descriptor | [x] | [x] |
| D：本批全实现后集中生成、运行受影响完整文件；通过后原完整样例，再完整自举和三输出 | 不适用 | [ ] |

C92 全源生成一次通过；allocator/native 完整文件 52/52 通过，真实入口计数
证明 Get 为 0 次描述符创建、显式 own-descriptor 为 1 次。宿主对象/decode/
refresh 完整文件 58 项注册、57 通过、0 失败、1 项父进程隔离跳过；隔离真实
WASM/native 子进程均由父测试硬验 tests=1/pass=1/fail=0。真实两输出新增数组
读取、长度更新、hole/undefined/-0、冻结及公开反射断言也通过。全部 guard
exit0/cleanup=true，峰值分别 6327746560、3206816280 字节。证据为
`c92-generate.log`、`c92-allocator-and-native.log`、`c92-node-host-and-views.log`。
本批新增编译失败 0、断言失败 0；原 FIX07/FIX23 尚未以此源码关闭，接下来
一次顺序执行原 570/631/649/601/604 的 WASM/native 十项完整输入与独立黄金。

## C91：集中修复阻塞原深层程序的另外两处重复全表查找

当前仍只关闭 FIX07/FIX23 主线。C90 新 token 查找已真实改善，但原 570 的
读取快照显示 events 数组长度 6，已离开小树遍历；根帧倒计数从 11770 到
11759，实际进入有限深层循环。不是死循环，也不能再只凭 CPU 活跃说进度。
该速度阻塞完整功能验收；本批集中处理实际采样中的两个全表调用，不增加
泛化优化项目。原 C90 输入/断言/49 项通过和字段 B 通过证据全部保留；原
九项运行因开始此根因修复结束并回收，取消单列，不新增语义失败轮数。

现状：memory.eli/value-function-named 在正常弱桶未命中后仍全槽扫描；
managed-host-runtime.eli/reserveForeignBuffer 在没有新 GC 时仍可能重复枚举
全堆存活 foreign token。目标：弱桶保存非托管成员数量以证明完整未命中；
只有损坏/截断/环/错误桶仍用原扫描并重建。foreign 注册表按实际 GC 计数
去重枚举，epoch 只在枚举与删除成功后发布；出现新 GC 后必须重验。

控制块保留 C90 水位 control[294]，增加 256 个 raw count（295..550），总长
551；计数不是 GC 根、不占托管槽。GC 重建 heads 和 counts；新 named 创建
成功后按最新 GC 状态入桶计数。链遍历按成员数量加一有界，完整未命中才可
分配；损坏保留原 canonical scan、原异常/容量/捕获函数保护并重建弱索引。
共享源码同时用于 WASM/native，不改变 JS 源语义、原输入或任何验收门槛。

| 项目 | 施工 | 验收 |
| --- | --- | --- |
| B：allocator 原碰撞、错误桶、捕获、陈旧、环、GC、最大 highwater 用例全保留；新增正常首次未命中零扫描及截断/清空索引恢复 | [x] | [x] |
| B：native-managed-runtime 以真实零 import 镜像计数 foreign 枚举，验证同 GC epoch 仅枚举一次、新 GC 重验、存活身份和释放 | [x] | [x] |
| C：memory.eli 的完整弱桶成员计数、GC 重建与损坏后原扫描恢复 | [x] | [x] |
| C：managed-host-runtime.eli 的 foreignPruneEpoch 成功提交与重复枚举抑制 | [x] | [x] |
| D：全批生成、两个受影响完整文件集中验证，再原完整样例、完整自举和三输出 | 不适用 | [ ] |

C91 全源生成一次通过；allocator/native 两个完整文件 51/51 通过
（`c91-allocator-and-native.log`），guard exit0/cleanup=true，计量峰值
6362431488 字节；新增编译失败 0、断言失败 0。所有原缓存损坏与容量断言
保留且通过。宿主对象/decode/refresh 三个完整文件也已集中完成：56 项注册，
55 项通过、0 失败、1 项仅供隔离子进程执行的父进程跳过；父测试已分别核验
真实 WASM/native 隔离子进程 tests=1/pass=1/fail=0。证据为
`c91-node-host-and-views.log`，guard exit0/cleanup=true，峰值 3868042632 字节。
本批全部已知阻塞修改已经落到源码；接下来直接验证原完整输入，不重复这批
已经通过的回归，也不将其通过冒充原深层程序完成。C90 原树 reason=cancelled/exit130/
cleanup=true，峰值 11983421440 字节；这是第二次实际瓶颈定位后的取消，
与 C89 那次 memory_limit 资源中断以及原语义失败分别保留。

## C90：新宿主身份不再扫描整个值表

接续 C89 已通过的原 604 WASM，不扩大范围。九项接续验证的首项 570 WASM
长期停在 host-start。对该同一存活进程采集实际 CPU profile 后，导出表确认
wasm-function[1506] 是 `value-foreign-new`，其自身占 48.3% 样本；下层热函数
也在同一线性查找链。宿主已缓存重复对象，实际浪费是每个首次出现的新 token
仍扫描全部 live/highwater 槽。原 12,000 层输入会不断产生新宿主描述符等对象，
累计变成全表扫描。不是死循环或机器内存不足；不以延长时限/增加内存解决。

该运行已按归属结束并完整回收，guard cancelled/exit130/cleanup=true，
峰值 10570645504 字节；仅首项实际进入原程序，其余未启动。新增根因定位
取消 1 次，语义断言失败 0 次；不把九项未通过改写成九次修复失败。

现状：`bootstrap/runtime/memory.eli:24440 value-foreign-new` 对所有 token
执行槽 1..highwater 查找；`heap-new-layout:340` 的 294-word 私有控制块。
目标：控制块增加一个 raw u32 `foreignTokenHighwater`（control[294]），
长度变为 295；只有 token 大于本堆成功创建过的最大 token 才跳过旧扫描。
重复/乱序 token 保留原扫描、同一 raw 身份和原 subtype；GC 后旧 token 重建
仍走原路径。水位仅成功创建后更新，非法输入/容量失败不更新；它不是 GC 根，
不新增值槽或托管对象，不改变公开语义/门槛。所有平台共用同一 `.eli` 实现。

流程：新 token → 比较水位 → 直接原分配；旧 token → 原身份查找 → 原分配。
保持 heap 检查、首错、GC/整理/代际、32 位 token 上界及按堆隔离。

| 项目 | 施工 | 验收 |
| --- | --- | --- |
| B：memory-allocator.eli 在现有测试镜像中计数原 foreign 扫描；新增单调/乱序/重复/最高 u32/GC 重建/容量失败/堆隔离/retire 回归，先写不运行 | [x] | [x] |
| B：native-managed-runtime.eli 补真实 WASM/native 新宿主对象、函数、别名及回收再传入回归，先写不运行 | [x] | [x] |
| C：memory.eli 的 heap-check/heap-new-layout 维护 295-word 布局与 raw 水位；value-foreign-new 仅对已出现范围扫描，成功后更新 | [x] | [x] |
| D：全部实现后生成受影响测试；集中运行两个完整文件，再恢复原完整九项及字段 WASM，之后完整自举和三输出验收 | 不适用 | [ ] |

本批全源生成一次通过；受影响 allocator/native 两个完整文件 49/49 通过，
新增两项 raw 水位回归及真实双输出身份回归全部通过。测试镜像计数确认递增
新 token 在已有 512 个普通对象的堆中逐次创建时，原全表扫描循环执行 0 次；
不是依靠放宽耗时或缩小原样例。`c90-allocator-and-native.log` 为 guard
exit0/cleanup=true，计量峰值 6219218944 字节。C90 新增编译失败 0 次、
断言失败 0 次；原取消保留。后继一次顺序执行字段 WASM 和原九项，共十项；
仍不是正式 stage3 或固定点证据。

接续字段 WASM 完整 B 已 1/1 通过（`c90-original-ten.log`），包括原十项
观察、非法输入及 finally 中 live=0/frameDepth=0/关闭断言。其 Node 测试文件
已结束，随后进入原九项；诊断中的 lastError=11 是测试刻意捕获的负向异常，
不得据此虚报新失败。结合 C88 对应 native 完整 B 的 1/1 证据，字段组关闭。
当前固定九组修复清单为 7/9 关闭（77.8%）、2/9 未关闭（22.2%）：FIX07、
FIX23。这些是针对性修复证据，不是当前正式 stage3 三输出通过比例。

实际原 570 产物已确认含 C90 新逻辑：value-foreign-new 的真实 WASM 函数体
由 407 字节变为 445 字节，非旧产物复用。原同一进程的后继采样
`c90-zipper-570-running.cpuprofile` 中该函数已退出主要热点；当前热点为
value-function-named（自身 34.9%）、GC 和分散的调用/编解码。这不是新的断言
失败；按功能优先原则保留当前运行，不为进一步性能优化取消重跑，不修改原
12,000 层输入。只有完整断言、关闭和 comparison 取得终态后才计通过。

## C89：关闭宿主对象对调用编解码环境的长期引用

本节接续 C88 的最终缺陷修复，不重启已完成工作。原九组中六组关闭；字段组的
新增 native B 已真实通过，WASM 原运行已有观测通过但缺少终态，暂不关闭该组。
FIX07 新增三项 B 已通过；C88 原 604 WASM 只有 host-end、runtime-close-end，
当时缺少进程退出和 comparison，不算通过；C89 后继共享实现已补齐完整通过
证据，见本节末。FIX07/FIX23 的其他取消不算断言失败，保留原失败、失败修复
次数和取消证据。当前仅串行执行本节末列出的九项原完整输入验证。

源码确认：`decodeOrdinary` 的每个视图操作闭包捕获当次 `withHostValues` 的
`using/nativeReflect/decode` 等整个调用环境；百万个宿主返回对象因此保留百万份
调用环境。`rememberSource` 另外为每条缓存记录创建四个访问器闭包。关闭时原
代码释放 token、清空缓存，却未注销仍注册的 finalizer。这些均属于 FIX07 主线
规模运行的内存阻塞；不以扩大上限或强制 process.exit 绕过。

现状源码树：`managed-host-runtime.eli/{withHostValues/decodeOrdinary,rememberSource,dispose}`。
目标源码树不变，增加私有 `ordinarySourceView(raw,type,target)`、
`sourceCallbacks(entry)`；测试使用既有 `native-managed-runtime.eli`。

现状流程：返回对象 → 操作闭包 → 原调用 codec/缓存/根列表；关闭 → 清缓存。
目标流程：返回对象 → 仅持有 runtime/raw/自身视图的操作 → 新临时 codec → 释放；
缓存 → WeakRef → WeakMap 中的回调；关闭 → 注销 finalizer → 释放 token/清缓存。
每次源操作仍保留原读取、转换、首错、重入、身份、Proxy 不变量和关闭检查。

| 项目及基线符号 | 施工 | 验收 |
| --- | --- | --- |
| `tests/eliscript/native-managed-runtime.eli`，新增 ordinary host views 回归：跨调用保留链、别名、宿主回调重入、负零、描述符冻结、关闭拒绝、WASM/native 相同硬黄金；先写不运行 | [x] | [x] |
| `tools/backends/eliscript/managed-host-runtime.eli:272 rememberSource`，缓存仅保留 reference/token/refreshing；回调通过 sourceViewOperations WeakMap 查询，更新所有读写点 | [x] | [x] |
| 同文件 `decodeOrdinary:1181`，将普通视图创建移到运行时级 ordinarySourceView，操作以临时 withHostValues 执行；codec 仅增加内部 descriptor/keys/nativeReflect/prototype/apply/construct 入口 | [x] | [x] |
| 同文件 `lifecycle.dispose:1423`，关闭时逐条注销 sourceFinalizers 注册，再清 sourceCache；保留释放和首错 | [x] | [x] |
| 生成当前 Eli 产物，集中复测新增回归及受影响既有普通对象、集合、异常、字段回归，再串行原 FIX07/FIX23 | 不适用 | [ ] |

截图中的三棵大 Bun 树均属本任务。此前同时启动九棵重树且只控单树，是执行错误；
已全部回收。后续未知重任务先串行，使用更新后的 controlled-run，将 macOS
压缩 footprint 及本对话合计占用纳入控制，不停止其他会话进程、不设总时限。
死机没有崩溃日志，不能断言其唯一原因。

C89 首轮新增 B 编译缺两个右括号，编译失败 1 次后修正；新增回调 B 首次缺少
foreign-entry 桥接而拒绝宿主回调，配置修正后通过。native 文件首轮 15/17 通过，
另一个失败是遗漏 fixture preload；两项复验 2/2 通过。另有 Bun preload 参数位置、
错误文件名各 1 次启动错误，均未执行断言，不冒充行为修复失败。

普通对象及所有权四文件集中验证共 49 通过、4 失败、1 跳过。失败中 1 项是
bun:test 文件误用 Node 启动；1 项是原诊断在新增 heap counters 后重复读取 view，
应复用同一快照并保留观察失败后的原始 report。另两项原 1024slots 失败在 C88
修复前对照也 0/2，排除 C89 临时 codec 变化；静态键池原实现提前为未调用函数
分配全部字符串，改变原小堆开销。作为同一 FIX07 修复补充，改用 nil 初始化
私有 readonly cell，首次属性使用时才分配字符串并通过内部一次性初始化写入；
后续直接读缓存。用户绑定 TDZ、const 初始化、可写检查和公开反射不变。

| 追加阻塞修复 | 施工 | 验收 |
| --- | --- | --- |
| `managed-host.eli/managedHostInvokeDiagnosticExports` 每次失败只读取一次 memory.view；现有 reads=1/首错恢复及新增 heap counters 硬断言 | [x] | [x] |
| `tests/eliscript/native-managed-runtime.eli` 新增 128 未调用属性名、128slots/32 节点、auto1 的双输出回归；复用原共享键及循环早期初始化 B，不改门槛 | [x] | [x] |
| `bootstrap/backends/managed.eli/managed-object-literal-key-cells,lower-managed-object` 私有键 cell 初始化 nil；新增 lower-managed-static-key，只有首次读取 nil 才执行字符串 literal 与内部 init | [x] | [x] |
| `bootstrap/runtime/memory.eli/value-module-literal-key-init` 仅接收已初始化 readonly nil cell 和真实字符串，检查 heap/声明/边界/模式，成功后写一次；原 value-module-init/set 不变 | [x] | [x] |

追加实现首次生成出现 lower-managed-static-key 缺括号及 put 参数层级错误，
编译失败再计 2 次，修正后四个受影响产物一次生成成功；本节新增代码累计编译
失败 3 次，未抹去旧历史。新回调 B 的桥接配置失败 1 次、启动错误 3 次单列。
`native-and-root-lifetimes-corrected.log` 两个完整文件 24/24 通过（100%），
包含原 literal keys、循环早期调用、新 128 未用键/128slots、跨调用对象/重入及
原 64slots 根释放等断言。guard exit0/cleanup=true，合计计量峰值 6051037184 字节。
这不是百万节点或最终 stage3 通过；原 FIX07/FIX23 仍待原完整输入验证。

普通对象文件复验为 43 通过、1 失败、1 个由独立子进程执行的隔离入口；隔离
入口的 WASM/native 子进程均 exit0，由父测试硬断言。原诊断重复读取和跨 owner
关闭两项已通过。剩余 FIX43 在原 1024slots、auto0 下无 GC 耗尽值槽，实际
heapUsed=161104、capacity=262144、live=highwater=1024；不是机器内存不足。
lazy key 修复未消除此项，记该容量问题修复后仍失败 1 次；诊断复跑不增加次数。
测试 helper canonical-api 原先为所有独立场景提前取得并解码 47 个导出，当前
prototype 场景只使用 ordinary/prototypeOf。改为同一完整编译图、同一 47 名称
API 按首次实际调用缓存视图；保留全部原调用、输入、黄金、1024slots/auto0、
异常身份/Proxy 陷阱次数及关闭断言，不再预先为未用的其他场景建立宿主视图。
这是测试准备阶段的根占用修正，不把该小堆场景改成大堆或容量延期。


C89 当前针对性结果：native 与根释放完整文件 24/24 通过；普通对象完整文件
44 项通过，1 个隔离入口不在父进程执行；强化后的隔离父测试 1/1 通过，内部
WASM/native 分别硬断言 TAP tests=1/pass=1/fail=0，非仅 exit0。原源码视图
decode/refresh 八项在首轮均已通过，后继修改未触及其行为。原 FIX43 通过
canonical-api 按需取导出后已通过，不增加 heap 上限、不改变 auto0、不删除断言。
隔离父测试旧实现只有退出码证据，因此不能单凭旧运行的短耗时宣称场景已执行；
新的实际子进程验证证据为 isolated-integrity-execution-proof.log。

| 测试准备/执行证据补强 | 施工 | 验收 |
| --- | --- | --- |
| canonical-api 保持完整源图和 API 名称，首次使用取得并缓存真实导出，关闭仍释放全部已取根 | [x] | [x] |
| 隔离 Node 子进程清除继承 NODE_TEST_CONTEXT，并硬验证实际 TAP 单项执行与通过数量 | [x] | [x] |
| 修复后原 604 百万节点 WASM 完整输入、独立 Seed oracle、退出/关闭/comparison 证据 | [x] | [x] |

后续原始验收在主目录串行执行。原 original-604-wasm.log 对应的未知重树已终止并回收（见后文），
使用同一对话固定标识和新版整树/合计/footprint 控制，12 GiB 单树硬上限；不设置
总时限。其余原 601/native 及 570/631/649 等按该树结果接续，不同时启动。

C89 原 604 WASM 实际在 64.081 秒达到整树 12 GiB 上限，峰值计量
12898909736 字节，guard memory_limit/exit137/cleanup=true。此次只有一棵
重树，未触发主机压力；未到 host-end，不能算功能通过。新增资源中断 1 次，
不是新语义断言失败。该树已退出，不原样重试、不扩大上限。

后继施工直接消除每节点函数数：当前 source view 每实例仍有约 13 个 runtime
operation、13 个边界包装和 14 个 legacy handler 闭包；百万对象仍会放大这部分。
目标：私有 decoder 的 fresh target → WeakMap 私有 record → 模块共享 Proxy
handler → runtime 共享 dispatchOrdinarySourceOperation(state,name,args) → 临时
codec。每实例只保留 raw/type/value 与 observer/realm，refresh 允许一个小函数。
公共 createManagedSourceView 的任意 caller target、可观察 getter 和 refresh 合同
保持原实现，非 private decode 的直接调用使用原适配路径；不依赖 this/原始 JS。

| 后继共享操作施工 | 施工 | 验收 |
| --- | --- | --- |
| managed-source-view.eli：内部 createManagedDecodedSourceView({target,state,invoke})、私有 WeakMap 和共享 traps；保原 mirror/首错/receiver/边界/realm/registry | [x] | [x] |
| managed-source-view-decode.eli：先补共享 decoder getter/descriptor/ownKeys/integrity/receiver/首错与 registry 回归，不运行 | [x] | [x] |
| managed-host-runtime.eli/ordinarySourceView：仅建立 raw/type/value，复用 runtime 级 dispatchOrdinarySourceOperation；删除每对象 13 个操作闭包 | [x] | [x] |
| 双方全部实现后集中生成、受影响回归，再原完整百万节点输入；整个过程未知重任务仍串行 | [x] | [ ] |

共享实现集中验证：`shared-decoder-node-complete.log` 三文件注册 56 项，父进程
55 通过、0 失败，1 个隔离入口由子进程执行；父测试另硬断言 WASM/native
子进程各 TAP tests=1/pass=1/fail=0。guard exit0/cleanup=true，计量峰值
3282597032 字节。`shared-decoder-native-and-roots.log` 两文件 24/24 通过，
guard exit0/cleanup=true，计量峰值 5235277824 字节。此修复新增编译失败和
断言失败均为 0；这两次回归不覆盖百万节点，原资源中断记录不变，不冒充正式 stage3。

后继原 604 WASM 已真实通过：`original-604-wasm-shared-decoder.log` 为 1/1，
exit0/cleanup=true；对应完整原程序的 comparison 为 equivalent，driver 记录
host-end、runtime-close-end，整树计量峰值 10304781096 字节，未提高 12 GiB
硬上限。仍保留原输入和独立 Seed 黄金，原容量门槛 resourceAcceptance=deferred
不改；这是预自举功能候选，不是最终 stage3 验收。共享实现目前新增语义失败
0 次，之前资源中断 1 次保留。接续原 601/570/631/649 双输出及 604 native
共九项，单树、顺序执行；字段组的新增 WASM 回归另行收齐终态。
## 当前强制执行步骤（2026-10-20 最新用户指令）

最新范围：当前使用6.1 Sol处理FIX-07、FIX-23、FIX-35三组功能阻塞；
FIX-03与FIX-12两组原容量压力按用户明确授权后置，失败记录及原严格门槛保留，
不再把这两组阻塞本次功能修复与集中验证。功能修齐后集中验证，通过后完整自举。

FIX-35施工：在既有source-operation中增加内部operation36，接收真实foreign对象，
一次Reflect.ownKeys后仅对字符串键逐个Reflect.getOwnPropertyDescriptor并过滤enumerable，
不读取属性值；只编码最终source key array。memory.heap-foreign-own-keys的mode0调用该操作，
mode1/2保持原完整键/符号语义。原逐项descriptor跨边界装箱路径不再参与Object.keys。
复用完整原591及已有三操作/auto1/65536/Proxy顺序B，补枚举首错及失败恢复。
原始输入、独立Object.keys黄金、负容量/首错/释放断言不减少；全部源码写完后才运行。

1. **先修复全部已经发现的问题。** 现在只做完整根因调查、回归代码编写和实现；诊断日志不算修复，未闭合问题不能划掉。不得启动构建、测试、探针、自举或旧轮续跑。
2. **修齐后集中验证，解决全部验证失败，直到验证通过。** 必要的当前代码生成属于这一阶段；不提前做完整三段式自举，不保留旧候选后台验证。
3. **验证通过后，再做完整三段式自举。** 程序化逐字节比较 stage2/stage3，随后完成最终交付要求；不倒置步骤。

旧 C72 验收进程树已按用户指令关闭：原执行 PID 13017、监控 PID 2699 均已消失，`c72-continuation-adopted-monitor.log` 终态为 `closed`、`cleanup=true`。保留既有结果，不补跑、不等待其完成。当前完整自举未启动。本批三个并行实现任务均使用 6.1 Sol，全部源码修齐前不运行验证。

下方旧轮“继续收集”“自举后复验”等表述仅为历史记录，全部由本节取代，不能据此再次运行。

## 当前问题数量与失败次数（2026-10-20，以本节覆盖历史状态）

2026-10-21针对性结果补充：C87原regex边界WASM/native两项均通过，新增真实native
私有provider回归1/1通过；native加载显式Map被覆盖的后继根因已修，和先前Bun
query模块身份问题分开计数。C87独立Object检查及原canonical close/initializer/FIX43
四项4/4通过；共享fixture新增函数已移至独立小图，原1024slots门槛不改。
FIX-35原591同完整输入、独立Seed oracle：WASM/native共2/2功能通过，两个comparison
均equivalent；保deferred/small资源状态，不能当原容量、性能或正式stage3通过。

有序集合截至C87已验证失败3轮、实际行为修复后失败2次；C88两次有改诊断的
单项执行仅作定位，不增加行为修复次数。C88继承Set首次实现另有nil/undefined
分派错误，属于真实修复后失败第3次；纠正后原WASM/native仍各失败，累计
验证失败5轮、修复后失败4次。新的具体首错是`incompatible sorted iterator receiver`，
不能继续把它写成旧instanceof断言。首错观测是诊断执行，不另计行为修复。
实际日志已证明首次ordinary发布发生在
构造未完成时canonical Object.prototype的继承Set(op20)解码receiver；不是先前
猜测的isFrozen或getOwnPropertyDescriptor首调用。C88只复用原raw OrdinarySet
receiver-data规则绕开这一次提前解码，原setter/只读/Proxy/自定义原型仍走原路径，
新增独立同源receiver规则5/5已通过。后继迭代器根因是source两级Object.create
被无谓转成foreign对象：两次next之间raw foreign key被回收后，源码WeakMap状态
消失。现仅对真实认证Object.create的一参数、source普通非namespace原型复用既有
raw对象创建；foreign/Proxy原型、双参、用户override保持原路径。独立真实WeakMap/
auto1/collect/完整Array.from回归1/1已通过，原WASM/native sorted完整两项2/2通过
（`c88-sorted-owned-prototype-space-restored.log`，guard exit0/cleanup=true）。中间一次
beforeAll落盘ENOSPC未执行断言，单独保留，不加行为修复失败次数。有序集合组关闭。

C86 Node直接启动五文件漏fixture preload导致5项模块定位失败，C87正确入口对应
8项已通过；错误启动不算语言修复失败。C86新foreign-array回归人为180秒期限取消
1项，C87去期限仍把全部标准库初始化纳入auto1而拖慢无关准备，已按源码边界改为
初始化后、16个真实观测操作前开启同一auto1，源图、输入、黄金、拒绝及清理全部
保留。旧C87这一个新回归树明确取消(exit143/cleanup=true)，不是产品断言失败，
原有任何初始化/性能/容量压力测试均未缩减。C88首次nil错误失败保留；纠正nil后
新增B出现无CPU进展、无子任务/请求且case目录已清理的等待，已记录sample并回收
该独立树(exit143/cleanup=true)，不是伪造断言失败。修正同族迭代器后只重验新增B，
显式诊断开关记录目标加载/观测阶段，原全部字段/迭代/拒绝断言不改。后续完整
观测已通过WASM构造、排序遍历和身份，失败在新增B错误使用另一realm的host
TypeError matcher。既定source Error合同保原live prototype与throw identity，不能
改codec迎合错误测试。现在源码导出自身真实TypeError constructor，仍用严格
constructor matcher校验原六个非法输入；独立Error matcher B补class/prototype/
message/cause/非Error同名lookalike拒绝/throw identity，新增B首次编译缺括号失败
1次已修，错误旧输出零匹配执行明确不计验收。实际新B与字段完整B正在针对验证。

原631 W/N完整程序最新均首RT0002，已与旧RT0003分开；实际仍small131072slots/
8MiBinitial/64MiBmax/auto65536，未命中现有full-compiler选择。后续按真实原ID、SHA
和完整输入认证复用现有大输入配置，保small失败；原570已实际full-compiler，
不能归为这次选择缺口或借机重跑。C88配置认证针对回归4/4通过；631/649各自
WASM/native四个原完整样例已独立启动，实际落盘均full-compiler，未伪称通过。

FIX07原604的C88 WASM完整功能验证仍失败：实际full-compiler配置下ELI-RT0002，
guard峰值5987680256字节，exit1/cleanup=true，非启动、时限或进程RSS超限。
该实际失败本批1次，尚无针对该容量首错的行为修复；保留原输入和黄金调查回收/
分配路径，不原样重试、不将已有大配置误报成功。601 WASM已独立运行，尚无通过证据。

C86实际针对性验证：数学完整24/24通过，含原3个构造失败；Emacs对应精确发射
1/1通过。持久化WASM的关闭、独立regex及type/protocol原失败均通过，但原sorted
map的instanceof仍失败。sorted实际验证失败累计2轮，实际修复后仍失败1次；
之前仅凭源码把isFrozen作为完整根因的结论不成立，保留其真实失败。
继续利用同一已生成完整产物定位首次提前物化路径，不原样重编整套后端。

C87承接C86冻结源码；仅两个新补回归删除人为添加的180000/300000ms总deadline，
遵照用户长期工作只受控内存、不按总时间丢弃进展的要求。这不是放宽任何原有
性能门槛：两个都是本批新回归，原性能失败记录和严格输入/黄金完整保留。

上述固定9组中，已有针对性通过证据关闭6组（66.7%）：构造调用、关闭后的转换、
正则独立身份、有序集合、native/Node宿主功能期限、FIX35原完整样例；其余3组（33.3%）
尚未关闭：类型字段新增完整B、FIX07、FIX23。此比例仅指这9组
修复清单，不代表正式stage3或整个0.0.2完成度。原字段/protocol失败断言虽已通过，
新增完整B未有通过证据前不把该组关闭。
历史Unicode修复确有1次编译失败，随后对应认证回归已通过，该次数不清零。

最新执行顺序按用户明确指示：针对上述失败项及同根回归直接测试并修复，
先使针对性验证通过，再进行完整功能复验和完整三段式自举。不会仅等待旧长用例
而阻止当前代码的针对性测试；旧进程保留真实归属和独立证据，不能借给新候选。
FIX-03/FIX-12仍按授权后置。原容量及性能门槛、输入规模、黄金和完整最终验收不变。

### C86-new：构造表达式的 callee 结合顺序

C85 Math 完整文件已终态 24 项中 21 通过、3 失败。三条失败分别由 Bun/WASM、
native、独立 Node/WASM 观察到同一 `sqrt-construct/2`：二进制正确拒绝为
`["TypeError",[]]`，JS reference 错误返回 `[9,[]]`。原完整 source 的三种构造
模式均有 TypeError 硬黄金，不能改黄金或令不可构造的 Math.sqrt 接受 new。
该新根因验证失败 1 轮、失败修复 0 次；C85 cosh/公开 exp 修复保持冻结。

A：源码路径为 `new(callee,args) → JS emitter 拼接未括号 callee → new 绑定到
callee 内部的调用 helper → 返回 bound sqrt 后普通调用 81`，故错误得到 9。
`projectMathSqrtSource` 严格保留 sqrt-throw 以后的完整后缀，没有改构造族；managed
端按原 callee 值检查构造能力，拒绝正确。目标为 `callee 完整求值一次 → new 对
该值构造 → 保原参数顺序和首错`。仅修现有三个发射分支，不加语言、API 或兼容层。

| ID | 基线位置/符号 | 精确施工 | 施工 | 验收 |
| --- | --- | --- | --- | --- |
| C86-new-AST | compiler/eliscript-emitter.el:1923，new | 原 callee 发射片段整体括号，保原参数发射及其顺序 | [x] | 待集中验证 |
| C86-new-IR | compiler/eliscript-ir-emitter.el:1653，constructor-call | 同一 callee 边界，保 source span/参数及 IR 不变 | [x] | 待集中验证 |
| C86-new-JS | bootstrap/compiler/emitter.eli:1759，constructor-call | combine 中 callee 外补括号，与两个 Emacs emitter 一致 | [x] | 待集中验证 |
| C86-new-B | tests/eliscript/math-oracle-fixture.eli；tests/eliscript/managed-host.eli；tests/eliscript-tests.el:1953 | 原完整 sqrt source/projection 的三构造模式加入独立 Emacs、JS/WASM/native 原黄金；同源 factory/非构造器、literal/非literal bind、单次求值/参数顺序/任意首错和 GC/root 清理回归。既有 condp 精确发射断言只同步 callee 括号，保完整 TypeError/message | [x] | 待集中验证 |

现有/目标源码树均为以上三个 compiler 文件、两个既有 Eli 测试、既有 Emacs
精确语法断言及本计划；只改变
构造发射的 callee 语法边界。B 全部写齐但不运行后才实施 C，最后父级统一生成
和验收；上述 B/C 已全部写齐且未运行。C85 及更早候选不再修改，不提前解析、
探针、测试、预审、暂存或提交。

### C85：收集 C84 独立结果并修正新增导入反射断言

当前执行调整：C85全部已知五组根因的设计、完整回归和实现已写齐，立即进入
同一批统一生成与10份受影响完整文件复验。仍在运行、尚无新增失败结果的C84
长用例不再阻塞这一批复验；各候选保持冻结，旧结果单独保留且不冒充C85通过。
若旧候选随后暴露新的独立根因，收齐后另成完整修复批，不修改已启动候选。
原完整三段式自举仍在本批功能验证通过后启动，原严格语义和性能记录不变。

C84 两份受影响完整文件已实际通过：persistent投影5/5，project-entry17/17，
新增绑定根因已关闭。C83完整Node组已终态372项：366通过、1失败、5容量延期，
0取消；严格366/372通过（98.4%），其余6/372未通过（1.6%）。
1259.519秒、峰值4,247,633,920字节、exit1、cleanup=true，不重复原整组。
C83 Node的fixture-environment完整注册回归随后暴露同一个`lowered`未绑定错误，
此为旧冻结候选相同根因的第6个断言，不增加修复失败轮次；C85复验库存必须包含
完整`tests/fixture-environment-selfhosted.test.mjs`，不能仅凭投影5项通过省略它。
C84核心181文件继续运行，不因一个普通断言失败取消其他文件。
原WASM/native570长程序仍在各自监控内运行，均不计通过。

目前新失败第一处：完整persistent宿主在新激活式检查imports时，Bun1.4.0返回
`{module,name,kind,type:{parameters:["i32","i32"],results:["i32"]}}`，
原新增断言只期望三字段，真实额外签名导致deepEqual失败。
这不是语言程序输出错误；完整宿主被这个准备断言阻断，不能计为语义通过。
同一反射根因验证失败1轮、失败修复0次；C84绑定根因失败轮数仍为1，现已关闭。

当前/目标源码树包括`tools/testing/persistent-literal-fixture.eli`激活式的imports断言、
`tests/eliscript/managed-container-cases.eli`完整输入、Math oracle工具及其既有测试、
`bootstrap/runtime/memory.eli`数学内核与`tests/eliscript/managed-host.eli`
既有真实宿主回归及本节计划，复用现有全部Eli测试。
C84完整冻结源码作为C85索引基线。
现状：`真实Module.imports → 全记录三字段deepEqual → 拒绝新增type字段`。
目标：`真实Module.imports读取一次 → 完整列表module/name/kind精确比较 →
若entry有own type则完整签名精确比较 → 保留原真实宿主与黄金`。

第二处新失败来自原完整builtins拒绝组中的coercive-predicates输入：
`fallback`初始化对象的lambda引用了仍在求值的自身let*绑定，分析器正确报
`ELI-A0001 / unbound symbol: fallback`，尚未执行到后续真实拒绝断言。
完整builtins文件10通过、1失败、1容量延期，其他转换/身份/阴影及跨Node行为已通过。
已完整核对同一组其余局部绑定：仅此self-init缺口，不修改analyzer或放宽分析。
该具体根因验证失败1轮、失败修复0次，属于当前新发现输入错误，不与已关闭的
投影宿主局部绑定根因合并计数。

C84继续收齐库存时新增两处独立失败，均为该具体根因首次得到本轮失败证据，
各计验证失败1轮、失败修复0次，当前四组功能根因不能只报前两组：

- C85-03：完整wasm-managed-math文件在准备独立oracle时，
  `math-oracle-fixture`拒绝`runtime/unicode-case-data`：实际runtime不等于其维护源码发射。
  需查明维护El生成数据、Eli发射及独立oracle构建的完整身份路径；禁止略过认证。
- C85-04：完整math-transcendental首项`cosh/fixed 0x1.0p0`在golden阶段
  actual=`3ff8b07551d9f550`、expected=`3ff8b07551d9f551`。先确认实际值来自
  宿主oracle还是编译产物，再按Eliscript统一语义处理全部同源路径；不能改黄金、
  放宽binary64逐位比较或将宿主差异冒充已通过。其余独立结果继续收集。

C85-03调查已确定为映射产物比较路径错误：正式bootstrap先由维护El准备runtime，
再由JS编译器CLI对同一Eli源码生成完整mapped模块；oracle工具却以compile_string
裸模块作期望。仅修改oracle认证为与正式CLI相同compile_string_with_source_map
调用及相同绝对输入/相对输出坐标，完整比较module+唯一规范sourceMappingURL和map，
不改Unicode数据、共享生成器、suite SHA、三runtime顺序或黄金。

C85-04完整文件结果为3通过、2失败，两个失败均来自生成WASM的cosh黄金，
独立Node项的JS部分不是失败来源。memory内核混入公开exp(1)近似捷径导致cosh
所需fdlibm组合舍入变化。保既有公开exp(1)行为：仅把x=1捷径移到公开operation423，
内部heap-math-kernel-exp恢复原计算路径；全部内部调用仅cosh三处、sinh两处。
原exp远端黄金、sinh路径、其余route/随机/首错/容量/根释放标准不改。

C84后续新增C85-05：stdlib-bit维护测试仍要求已被真实transport删除的
execution.hostSource。执行链改为物理stdlib-bit-corpus-host.mjs，完整生成字节与
Eli源码证明仍绑定于evidence/sourceAssets/maintainedTransport；实际bit主执行已通过。
该问题与超时无关，timeoutMs=30000、metadata.originalTimeoutMs及30001拒绝全部保留。
新增具体根因验证失败1轮、失败修复0次，当前共5组功能根因、6个失败断言。

| ID | 基线位置及接口 | 精确施工 | 施工 | 验收 |
| --- | --- | --- | --- | --- |
| C85-01 | tools/testing/persistent-literal-fixture.eli，persistentLiteralHostArtifactSource imports断言 | 内层lambda(imports)绑定单次真实结果；map完整列表三字段并严格等于唯一source-operation/function；forEach(lambda(entry))仅Object.hasOwn(entry,"type")时严格等于二i32参数/一i32返回的完整type对象。imports/entry是本地形参，沿原10个外层绑定分析，不删签名或添加外部后端 | [x] | 待集中验证 |
| C85-02 | tests/eliscript/managed-container-cases.eli:539，coercive-predicates完整输入 | let*先绑定fallback=nil，再setq为原完整js-object，保两原hook/body/property顺序及全部输入。先补完整独立报告黄金核对，保真实JS/WASM结果一致及全部后续bad IR、拒绝诊断、输入不变断言 | [x] | 待集中验证 |
| C85-03 | tools/testing/math-oracle-fixture.eli:105，prepareMathOracleCompiler；tests/eliscript/math-oracle-fixture.eli | 用真实compiler映射接口重发射三runtime，完整比较module bytes/trailer与map bytes及version/file/sources/sourcesContent；补真实源码正例及module篡改、缺map、内容/坐标篡改拒绝，旧错误compiler负例必须提供mapped接口避免因缺方法误通过 | [x] | 待集中验证 |
| C85-04 | bootstrap/runtime/memory.eli:18900，heap-math-kernel-exp与heap-math-call-kernel operation423；tests/eliscript/managed-host.eli | 内部exp删除x=1常量捷径，公开423保该分支。先补复用完整transcendental fixture的十route回归，核cosh±1及原大边界两符号、公开exp±1、sinh±1、特殊值与auto1/held/frame/live释放；不改黄金或宿主Math | [x] | 待集中验证 |
| C85-05 | tests/eliscript/stdlib-bit.eli:66，完整bit transport身份回归 | 用hasOwn(hostSource)=false及准确物理host替代旧内嵌字段假设，保所有输入/record/baseline/deadline全比较；核真实host完整Buffer/base64/bytes/SHA及Eli source proof、transport source/generated字段；补自洽伪造host内容/bytes/SHA拒绝。生产transport、13modules、双compiler×双host、黄金及时限不改 | [x] | 待集中验证 |

依据为现有`tests/eliscript/wasm-managed-language-intrinsics.eli`的
assert-source-imports以及literal-runtime中的同一严格契约，不新设计兼容层。
完整原pure空导入证明、descriptor唯一capabilities、原host/四engine、黄金及资源门槛
均保留。已有用例直接复用，不用仅检查实现字符串的测试替代真实宿主。

- [x] C85-01/02的A/B：具体根因、准确修法与现有真实回归已明确，复用测试不提前运行。
- [x] C85-03/04的A：源码调查已确定完整方案，准确路径及逐处修改如上。
- [x] C85-03/04的B/C：先写齐用例不运行，再一次实现；未提前生成或复验C85。
- [x] C85-05：上述完整身份回归与篡改拒绝已写齐，未提前运行。
- [x] C85-01实现完成，未提前生成、解析或测试；其他独立失败收齐后一并纳入本批。
- [x] C85-02完整输入修正与独立黄金已写齐；未提前生成或运行该输入。
- [ ] D：全批实现已完成，立即集中生成并运行下列10份受影响完整文件；保留旧长用例监控及独立结果，不提前完整自举。

C85第一轮统一生成42.886秒后exit1、cleanup=true、峰值133,562,368字节。
全部注册模块继续生成，仅新增math-oracle-fixture回归在198:95有多余右括号而失败。
这是C85-03首次修复后的编译失败，修复失败计1次，不能记作启动器错误或冒称构建通过。
在未开始测试的C85中一次修正该完整模块结构后，只补生成失败模块及库存/browser，
不重复其余已完成的工具构建。

C85复验库存已运行至终态：8份完整核心文件为persistent-literal-fixture、
compiler-corpus-project-entry、math-oracle-fixture、stdlib-bit、wasm-managed-builtins、
wasm-managed-math、wasm-managed-math-transcendental及wasm-managed-persistent-literals；
Node另跑完整fixture-environment、managed-host两文件。这10份覆盖本批5组具体根因、
新独立黄金和真实WASM/native执行；其余C84已通过且不受影响的文件不原样重跑。
正式stage3全量门禁仍必须在真正完整自举后执行，不把上述定向库存替代最终全量。

C85集中结果：核心8文件6通过、2失败；Node两文件均通过（46通过、0断言失败、
1容量项仍未验收）。按本批10文件分母，8/10通过（80%）、2/10失败（20%）。
原5组修复的断言均已越过：imports、fallback、Unicode源码/映射认证、cosh和bit；
Unicode修复过程中1次编译失败的历史计数保留，不能把它解释为当前剩余问题总数。
完整math文件21通过、3失败；完整persistent文件12通过、8失败、另1个跨测试错误。
原失败不抹去，新增根因不与已经闭合的具体根因混计。新失败合入C86整批修复，
全部实现完成后集中生成和复验；不重复已通过且不受影响的文件。

### C86：收齐构造调用与持久化边界失败后集中修复

本批源快照承接C85冻结源码，C85测试终态不修改。三个JS emitter的new调用需整体
括起callee，否则绑定函数表达式会错误地先构造helper再普通调用其返回函数。
持久化文件另外包含关闭后错误类型、独立regex模块品牌、sorted物化类、type字段解码
及native/Node固定总时限失败；按源码根因完成后分别记录具体修复，而非笼统归为环境。
这些具体问题首次在C85暴露，各验证失败1轮、失败修复0次；sqrt同根3断言只计1轮。

父级生命周期施工：`tools/backends/eliscript/managed-host-runtime.eli:366`
`withHostValues(operation, ...sourceErrorsOptions)`的关闭入口现调用failManagedRuntime(3)，
得到泛化bounds错误，和同codec闭包`using`的确定关闭错误不一致。统一为在访问任何
handle或host输入前抛出`Error("managed host value is closed")`；其他诊断及清理顺序不动。
`tests/eliscript/managed-host.eli`现有真实owner关闭回归先增加fromHostValue/toHostValue
关闭拒绝、原对象不受影响、另一owner仍可用的断言，再实施该单一入口修正。

- [x] C86-close A：入口、关闭状态capabilityOpen与原独立关闭黄金已确认。
- [x] C86-close B：补齐真实关闭owner的双向转换拒绝回归，不运行。
- [x] C86-close C：修正withHostValues关闭诊断；验收留到全批D。
- [ ] C86 D：全批B/C完成后统一生成、受影响完整文件复验，再推进完整自举。

C84原完整transient-state第二项（每次分配都GC、完整原checkAll输入）现已实际通过，
634,851.62ms；第一项普通GC也通过。原30,000/120,000ms性能验收仍按已授权范围
记DEFERRED / NOT ACCEPTED，不把功能通过计为性能达标。同源native对照项继续
执行，当前174/181文件的整轮未终态，不能重复启动或称为全量通过。

### C84：一次补齐 persistent 投影激活式的全部真实局部绑定

C83 集中核心组已终态：80个实际断言中75通过、5失败（93.75%/6.25%），
失败全部同根：`persistent-literal-host-boundary.eli:2:8: unbound symbol: lowered`。
其后 persistent 文件在准备投影时遇到同一错误，整个执行器退出1，
峰值6,467,796,992字节、cleanup=true；未启动文件不计通过。
已实际关闭原directory/metadata/callables六个失败：project-entry现在16/17通过，
仅persistent投影失败；Seed identity与exports完整文件通过，response-events完整25项通过。
其中真实owned native完整构建、全部产品比较、执行、缓存隔离与首错恢复均已通过。
Node原51文件仍在执行，本批不重复启动。原WASM/native完整程序仍保留受控执行。

这是C83新增激活式首次编译失败，计该具体绑定根因验证失败1轮、
失败行为修复0次；原外部prototype身份修复首次被此编译错误阻断，
不能宣称身份行为已经通过。FIX03/FIX12两组容量失败仍按授权后置。

基线为C83完整冻结源码，C84索引保存相同基线，修改不进入运行中的C83。
本批只修改以下源码树，不新增模块或另一个验收系统：

```text
tools/testing/persistent-literal-fixture.eli  # 修改：persistentLiteralHostArtifactSource
tests/eliscript/persistent-literal-fixture.eli # 修改：原完整投影回归
docs/bootstrap-0.0.2-plan.md                # 修改：本节施工及证据
```

当前流程：`projectPersistentLiteralSuite → persistentLiteralHostArtifactSource →
compile-ir-string(独立激活表达式) → setq lowered 未绑定 → 投影失败`。
目标流程：`原完整激活式 → 仅分析的真实参数函数 → 取合法body IR →
emit-top-level(expression-statement) → 插回原宿主词法作用域`。
分析函数不进入输出，原pure证明、源图、黄金、四宿主、资源断言与显式foreign模式不改。

| ID | 文件及C83基线锚点 | 精确施工与验收映射 | 施工 |
| --- | --- | --- | --- |
| C84-01 | tools/testing/persistent-literal-fixture.eli:12，persistentLiteralHostArtifactSource | 分析上下文声明10个真实参数`lowered wasmBytes backend modules runtime literalModules memory originalModules originalLibrary assert`。参数由既有analyzer标为可变，完整激活式保持原样；核function-declaration、parameterCount=10及唯一body后只取表达式，使用既有IR expression-statement与emit-top-level发射。WebAssembly/Uint8Array/JSON/globalThis保持真正全局，managed/wasm保持属性键。不得补假变量或绕过分析 | [x] |
| C84-02 | tests/eliscript/persistent-literal-fixture.eli，原projection/foreign测试 | 先补helper直接编译、输出不泄漏分析函数及参数声明；复用完整pure前缀、原后缀、唯一插入与完整投影合法模块测试，不另写简化替代样例 | [x] |

- [x] A：完整绑定缺口与既有analyzer/lower/emit接口已一次调查明确。
- [x] B：上述原测试补齐，编写阶段未运行。
- [x] C：上述完整实现写齐，施工阶段未运行。
- [ ] D：当前独立结果收齐后统一生成；运行受影响完整文件及此前未启动库存，记录每份真实终态，不把跨候选局部证据称为正式stage3全量验收。

C84 原注册源码统一生成已完成；后接命令误用Node直接加载bun:test测试模块作
`--generate`，在导入阶段报`ERR_UNSUPPORTED_ESM_URL_SCHEME`，整链exit1、
cleanup=true、峰值130,318,336字节。保留该启动错误，不计为语言行为修复失败。
仅更正库存命令为已有`bun tools/compatibility/corpus.mjs --generate`及
`bun tools/parity/check.mjs --generate`并补browser，不重复已完成的整批编译。

### C83：收齐当前集中结果后的七处具体接线修正

C82 三份受影响核心文件已完整结束：51项中45通过、6失败（88.2%/11.8%），
其中 Seed identity 19/19、exports 15/15 通过；原缺 process 依赖的7个入口中，
这两份文件的3个入口已得到实际执行证明；其余4个仍被directory前置错误阻断，
不计已通过。project-entry 为11/17，六个失败归为下表前三处根因。
Node 原51文件已终态370项：362通过、3失败、5延期（97.8%通过，2.2%未通过），
取消0，峰值4,924,637,184字节、exit1、cleanup=true；三项分别为native项目加载、
sequence请求期望和directory前置，均已纳入本批。先前strings新回归实际通过。
C80 原完整核心库存已终态：128/306文件完成，123通过、5失败，178未启动；
外层24GiB监控峰值16,594,829,312字节并未触顶，exit1、cleanup=true。
除原三文件外，新增response-identities依赖失败和persistent-literals语义/内部8GiB
资源失败均列入本批，不能笼统归因系统负载。原 WASM/native 程序仍受控执行。

| 修正与源码锚点 | 本批施工及保持的验收 | 状态 |
| --- | --- | --- |
| original-program 的 directory/path 惰性选择 | originalProgramSidecars 的 fallback 是普通函数，提前求值 resolve(artifact.path)；改为真正 if/nullish 分支，directory存在时不读path。保4个真实directory部署，补抛错getter不读和path-only旧路径回归 | A/B/C完成，待集中验证 |
| 新依赖 marker/hostSources 的精确期望 | 先独立读真实process Eli/MJS并核完整bytes/SHA，验证相邻hostSources恰1项及完整源，再将独立构造 marker 及新增依赖加入原 metadata/request 精确期望；保全原请求与来源字段，不盲删除新增字段。Node完整组暴露的sequence比较纳入同根因 | A/B/C完成，待集中验证 |
| callables 直接fixture使用正确ABI | 原有ordered-values名称正确，但control ABI没有module.exports，getExport按合同拒绝；现有plan明确required ABI并将完整fixture发射为managed-module-v1，其他family默认ABI保留。复用全部原callables断言，补control与未知名拒绝、真实module导出/GC/根释放 | A/B/C完成，待集中验证 |
| native B 使用实际归档的项目入口 | facades原已真实归档；从archive.directory/path/entry设置部署URL和同owner moduleGraph，完成默认prepare/registry/entry初始化，使用真实namespace公开negative_zero验证结果。保全部位编码/bytes/typed DAG/debug/归档和wire检查，不跳初始化 | A/B/C完成，待集中验证 |
| response identities 的真实依赖目录 | 原serializer单元保留全部production imports，却将scratch/backends链接到不存在的dist/backends；复用buildBackends并明确现有frontend生成真实闭包，核bootstrap/backends及完整依赖普通文件，保全部原小segments/identity/cycle/getter/取消断言 | A/B/C完成，待集中验证 |
| persistent literals 的执行调度 | 该文件整树8,602,025,984字节触发内部8GiB；仅精确文件沿既有sequence/direct路径使用外层24GiB受控执行，保原全部body、时限、内部OOM/容量/性能断言；补顺序/近名/失败/取消回归 | A/B/C完成，待集中验证 |
| persistent 完整host的显式跨界身份模式 | 原pure lower明确capabilities/imports为空，source Object.prototype应保持owned身份；完整外部host却需真实host Object.prototype。保原完整pure lower和零导入断言，然后相同不可变modules/runtime/literalModules以既有foreignEntry:true二次lower用于真实host交互；精确唯一source-operation，不改memory/codec/pure默认、原完整host或报告黄金；新增桥接仅由Eli发射。真实matrix原已认证并传foreignEntry，不新增字段 | A/B/C完成，待集中验证 |

当前新 native B 失败共2轮：C81错误要求typed里保留原生数字-0，C82一次修正后
首次暴露真实项目加载缺参数。两个具体根因各出现一次，不能虚报同一根因已反复
修了两次。C82位编码检查实际已通过，不能因此宣称完整执行负零验证通过。
C83全部七项设计、回归及实现现已写齐，已启动组的独立结果也已收齐，进入统一生成；
不改运行中的C80/C81/C82源码，不重复启动已有任务，不提前正式自举。
已保存C80真实失败5文件及未启动178文件的原顺序，另加本批修改的persistent工具
完整B文件；统一验证这184文件，
不重复启动已完成且未受影响的123文件，也不把跨候选的局部证据冒称正式全量通过。
取消的36个旧binary compiler-host用例不是通过项，也不恢复已取消的宿主目标。

### C82：收齐 C81 定向结果及 C80 核心新增失败后集中修正

C81 统一生成真实 exit0、cleanup=true，峰值136,855,552字节。两份受影响 Node
文件完整42项：41通过、1失败（97.6%/2.4%，0延期）。混合字面量真实 WASM/native
深层回归及缺失/篡改依赖拒绝全部通过，耗时321.167秒；原 registry 缺失已关闭。
native 原570已在默认引擎堆完成真实二进制及完整 typed/descriptor/debug 产品归档，
完成 runtime-open 并进入 host-start；未结束，不能计行为通过。没有再增加引擎堆。

C80 核心继续收集独立原库存，当前实际新增9个断言失败，归为下面前三个根因；
第四项是 C81 唯一新增回归失败。C80/C81 均冻结，所有修正只写 C82。

| 根因与维护源码锚点 | 完整施工与回归 | 本批状态 |
| --- | --- | --- |
| 7项宿主部署缺依赖：project-entry-host/identity-host 的 process 静态导入在换目录后缺文件 | 将真实 compiler-corpus-process 模块加入相邻 hostSources 及维护/生成来源证明；所有 observer、renamed physical host、standard-main、token replay 使用同一完整依赖闭包，补两宿主实际执行及缺失/篡改/冲突拒绝；保原宿主字节和黄金 | A/B/C已完成，待集中验证 |
| 1项 raw strings：raw-language-fixtures 的 ignored 调用传4参，原 ignored(s,trace)只收2参 | helper 与独立 oracle 均改为(text,trace)，保原函数内部 charAt 多余参数的 first/second 副作用、全部7文本及严格 raw ABI；补实参长度2、首错和根释放；原首错与清理次错同时存在时保原首错身份 | A/B/C已完成，待集中验证 |
| 1项 receipt：project-entry 测试遗漏真实原 replay suite 的执行选择 | 用原迁移记录和 reader.file 证明补真实 locators；legacy 与维护 adapter 同一 options，全7 caller 的14个双宿主记录与原源码/黄金不变；缺失/改动选择继续拒绝 | A/B/C已完成，待集中验证 |
| 1项新 native B：负零已合法降低为 low=0/high=2147483648，错误要求 typed 中仍有原生数字-0 | 保 ordinary/owned 全部bytes、typed DAG、descriptor/debug和归档对比；精确核对 value-number 的位对，library真实执行导出函数并 Object.is(result,-0)，独立 wire 的[-0,NaN]完整检查不变 | A/B/C已完成，待集中验证 |

以上新增失败各为首次取得本轮具体错误，不能算作已做过修复又失败的重试；native
先前4GiB、8GiB两次 OOM 仍单独保留。新增负零 B 是错误表示前提，不是生产发射器
丢负零；不能借机修改正确的 lowering 或 runtime。先全部写齐，再集中生成并按
受影响完整文件验证；未受影响且已通过的组不原样重复。C80 的原核心运行不与
C82 重复启动，WASM/native 原完整程序的未结束结果也不计为通过。

C82 首次统一生成仅 original-regression-product.eli 缺源码而失败，其他模块完成；
该新维护 helper 在 C81 为未跟踪文件，交接的 Git patch 漏带，源码并未丢失。
已原字节补入 C82 并修正 C81 完整快照/本批基线，只补生这一模块及原库存、browser。
保留原 exit1、cleanup=true、峰值128,368,640字节记录；这是交接失败1次，
不能算语言行为修复失败或冒称第一次统一生成通过。

### C81：C80 实际结果与本批两项接线修正

C80 原 JavaScript 六项已实际全部通过；Node 原51文件共365项，359通过、1失败、
5项明确延期（359/365，98.4%）。新增裸函数 Symbol 回归通过；唯一失败在混合
字面量新回归的 WASM 模块安装阶段，缺实际 facade registry，尚未比较二进制结果。
同源 JavaScript oracle 及独立黄金已先通过，不能把它误称为 JS import 失败。
原 WASM 和核心库存仍在使用冻结 C80 源码运行，未结束部分不记通过。

| 本批施工项 | 具体根因、实现和完整回归 | 状态 |
| --- | --- | --- |
| 混合字面量真实依赖 | 复用 createManagedProjectFacades 为 WASM/native 各自部署真实 facade 和 registry；保完整10元素、64层、同源 oracle 和原黄金，绑定全部依赖字节，补缺失及篡改拒绝 | 已写，待集中验证 |
| native 产品传输 | 原六记录执行器遗漏主 matrix 已有的非 JS u16le-chunks 配置，并直接 session.request 而未走现有私有 owned 构建入口；补共享请求/产品 helper，保完整 typed DAG、descriptor、debug 和归档，补真实编译器普通/owned 完整字节及共享结构对比、fallback 与首错身份 | 已写，待集中验证 |

native 本批默认4GiB与显式8GiB引擎堆两次均实际 OOM；后者整树峰值
8,976,482,304字节，监控 exit1、cleanup=true。两次失败记录保留，不继续增加
引擎堆或据此删 typed 字段。具体 OOM 阶段尚无 phase 证据；已确认上述两处
传输接线缺口，不能把静态根因候选冒称为运行修复通过。下一次在代码全部写齐后
以默认引擎堆集中验证原完整输入，不原样重试8GiB。

C80 独立17/17合同、248/248 Emacs、3/3 Org、24/24应用文件、严格字节编译及
原CLI均通过。核心执行链已通过此前 archive/ingress 资源中断位置，继续收集
原306文件，不据局部通过宣称全量通过。FIX03/FIX12仍按授权后置且保留失败。
C81 只在自己的工作区修改；不改运行中的 C80，不复跑已经通过且未受影响的组。
当前正式313产品三段式自举、最终 stage3 三输出和0.0.2签名交付均尚未完成。

### C80 当前两项定向功能修复（C79源码及运行保持冻结）

C79原程序截至本次状态核对：JS六项全部通过；WASM591通过，570/631/649失败，
601仍在执行、604及native尚未产出结果。即已出结果十项中七通过、三失败；
原十八项仍有八项没有通过证据。不能把未结束部分记为通过，也不提前正式自举。
三项实际失败归并为下面两个已经取得具体参数及源码证据的根因，不再重复盲查。

| 修复项 | 精确生产根因及施工 | 回归与验收 |
| --- | --- | --- |
| 570/631裸函数Symbol属性 | value-function-own-descriptor对真实函数及已转换Symbol键，若p24元数据为0则其尚无own-symbol属性，应返回undefined(3)，而非调用heap-function-info报RT0003；已安装metadata仍走原完整descriptor路径 | 先写真实namespace懒函数、source回调/方法、fresh/registered Symbol、已有data/accessor及identity、auto1/根/帧回归；保持原name等未实现拒绝和完整原程序黄金 |
| 649混合字面量 | managed-host-runtime的selected预编码条件不成立时，when给nil(null)，后续只排undefined并访问selected.kind；改为明确if分支返回undefined哨兵 | 先写真实持久vector/map深层混合nil/false/undefined/-0/text/callable/object回归，与同源JS独立oracle比较WASM/native；不删元素、不放宽根释放 |
| 完整archive内部内存门禁 | C79完整archive真实RSS8,742,633,472超过内部8GiB，而外层24GiB受控运行峰值8,891,006,976并未触顶；55文件通过、该1文件资源失败，250文件未启动 | 精确该文件走已有sequence/direct路径，保外层24GiB监控及原完整body/黄金，其他文件限额不改；先写调度顺序、失败及取消回归 |

功能两项及archive调度在C80并行写回归和实现，新增实现仍仅Eli；全部写齐前不生成或测试。
本次针对唯一根因的定向补丁尚未验收，修后失败轮数为0；C78与C79已有失败日志
全部保留。C78的570已有同descriptor出口失败记录，但无当时receiver/key，不能
将历史相同错误码全部断言为同一裸函数Symbol根因。

601原完整输入固定2000步、52000次顶层managed调用、22000个断言，JS同源已过；
实际auto为16MiB分配阈值。GC slots读取control[3]实际分配高水位，不是control[2]
配置maxSlots；“每次扫描全部8m槽”结论不成立。本批不据此猜改GC或削减输入。
C79 Node及原核心库存继续实际收集；独立17合同/248Emacs/3Org/24应用及严格字节
编译/CLI再次全部通过。Node原51文件本轮已终态357通过、0失败、5明确延期，
严格357/362（98.6%）通过，其余不计通过。FIX03/FIX12仍按授权后置、保留失败。
原18项保持六份完整程序及全部输入/黄金，只把52,000调用的601排在各target最后，
下一集中组按三个target互斥分配并行执行，避免一份长程序遮住其他target的真实结果。

### C79：C78 原完整程序结果及同批纠正

C78 原六份完整程序真实进入执行：JavaScript为5/6通过（83.3%），570失败；
WASM为0/6通过、6/6失败；native六项因Node工作进程4GiB堆上限终止而没有运行，
按本轮未通过保留，不能当作native语义已失败或已通过。原18项严格计5通过、
13未通过（27.8%/72.2%）；实际框架终态12项、5通过7失败，其余六项没有行为证据。
整树峰值9,979,215,872字节、exit1、cleanup=true，未触及12GiB整树上限。
失败证据保留在C78的c78-original-eighteen.log及attempt-vVFAXc，不原样重试。

| 本轮根因批 | 已证实的现象 | C79施工 |
| --- | --- | --- |
| 570资源认证 | JS独立Seed oracle先拒绝完整正向程序资源输入认证，尚未比较到程序结果 | 对照原完整档与实际有效字段修接线，保严格认证及黄金 |
| binary宿主模块来源 | WASM五项明确拒绝resolver未返回真实module namespace；JS对应五项已通过 | 用原实际namespace加载接口修复，不删检查、不伪造namespace |
| 570二进制反射 | WASM真实source-view descriptor路径报RT0003，不能凭同错误码判为已修 | 沿完整源码的own descriptor路径闭合根因，保独立原程序 |
| case间内存生命周期 | 整个18项原共用session，最后project/runtime/literal状态在下一case构建前仍存活；当前没有证明生产session泄漏 | 每case创建同一真实compiler artifact的session、初始化相同runtime并finally关闭；不加heap额度，不改生产复用语义 |

C78独立门禁已终结：17/17合同、248/248 Emacs、3/3 Org、24/24应用文件通过，
browser bundle、application CLI、strict bytecompile及四原CLI均exit0；整树峰值约793MiB，
cleanup=true。Node51及核心两分片保持C78冻结源码收集独立结果，C79不得改它们。
本批仍先全部修齐、再集中验证，功能通过后完整自举；FIX03/FIX12保失败并后置。

C78 Node最终361项：355通过、1失败、5延期，严格比例98.3%通过/1.7%未通过；
原有Error/typeof/Math/回收/词法this及真实raw-special回归已通过。唯一wire新增回归
在原默认auto0下耗尽槽：C79保默认容量，改auto1并去除无观察的临时constructor数组，
增加显式收集后重复分类及frame0断言，不改生产运行时或原错误黄金。
来源两项失败现分别修为真实原vector完整13边界值认证，以及删除误入有效库存的
逐字重复reader负fixture；真正tools/testing/fixtures副本及全部使用者保留。
namespace、私有扩图资源证明、每case会话关闭及上述来源/wire代码与回归已全部写齐。
570反射的唯一内部receiver/key尚无证据，不猜改运行时；下一集中原18项保留现有
诊断开关以取得首错上下文，不能将该项提前划为通过。

C78核心第一路因整树18,412,044,288字节超过本轮人为16GiB上限而exit137，
cleanup=true；不能静态断言来自同driver第二worker，因为ingress已是sequence。
另一路monitor因真实磁盘ENOSPC退出125，原monitor及root PID均已消失，缺终态
cleanup收据，不能编造cleanup=true。已清理本任务停止C76的未跟踪可重建dist，
逻辑约964MiB；df变化含APFS及并行系统活动，不能把全部释放量归于本任务。
这些是保留的基础设施失败，不计为原语言黄金比较失败或授权后置两项已通过。

### C78 当前批次：原完整程序启动及集中验证阻塞

C77 源码保持冻结，C78 只在项目 `_worktree/c78-fixes/` 写修正；不在运行中改写
C77 代码，不提前运行 C78 探针、生成或测试。下方 C77“未验证”表是历史施工记录，
以下实际结果优先；未通过不能被已写代码替代。

| 已终结的 C77 集中组 | 通过 | 失败或明确延期 | 真实结果与边界 |
| --- | --- | --- | --- |
| Node 原51文件 | 342/356（96.1%） | 9失败、5延期；合计14/356（3.9%） | 模块执行顺序独立 Emacs/三输出、词法 this、严格 log10 新回归已通过；其余失败纳入本批 |
| 六份原完整程序的三输出 | 0/18（0%） | 18/18（100%） | JS六项在大环境变量 spawn E2BIG 失败，WASM/native十二项在 runtime 未初始化失败；尚未运行原行为断言，两项启动根因不能误记为18种语义缺陷 |
| 原应用文件 | 19/24（79.2%） | 5/24（20.8%） | 四项缺真实 dist/runtime 数学依赖，一项缺浏览器 bundle；新工作区暴露构建前置缺失，不复制旧产物掩盖 |
| 独立门禁 | Emacs248/248、Org3/3、合同17/17 | 以上各组0失败 | 严格字节编译及四个原CLI通过；不能推论核心全部通过 |

C77 核心306文件的两路原库存收集已停止；已发现的来源断言、原语言观察及 package
CLI 超时全部纳入 C78，不继续在已替换的旧源码上消耗资源。两路均exit143、
cleanup_complete=true，峰值15,136,325,632及11,685,003,264字节；取消不是OOM或
断言失败，未运行部分不能计为通过。原日志及已经获得的结果保留，全部写齐后才能验证。
Make 收集模式的退出0不代表全部通过，以实际文件及断言结果为准。

| C78 施工项 | 具体代码与完整回归 | 施工状态 |
| --- | --- | --- |
| 原程序启动 | 相同完整执行上下文改为独占文件及短路径/字节数/SHA引用，七处消费者统一解码；保原argv、正文、maps和黄金，补多MiB/篡改/缺失回归；原程序 session 显式初始化真实 memory runtime | 已写，验收未运行 |
| 真实构建依赖 | 原 Emacs bootstrap 同源生成 dist/runtime 三模块及maps；应用测试依赖既有浏览器构建；补完整source-map来源断言 | 已写，验收未运行 |
| 新回归的错误前提 | CI读取两条test依赖的合并集合；matrix恢复原HEAD有效归档合同；Error同源分类和原型身份，修零参数调用；Math保Number及caller frame两个实际堆值 | 已写，验收未运行 |
| 原始来源与原Math fixture | 完整归档保持所有原字段，正向资源证明缺失时拒绝静默fallback；Math提取限定到认证的原mode4/5/6 hook块，不误匹配另一合法Symbol表单 | 已写，验收未运行 |
| 完整raw-special | nativeReflect定义属性的第三实参复用既有encodeDescriptor，不将内部descriptor误装箱为foreign35；完整16组及data/accessor/freeze/首错身份回归 | 已写，验收未运行 |
| package CLI完整功能路径 | 仅双功能标志、完整原suite SHA、精确两个Node/JS用例及原120000实参认证后取消外层总期限；每个实际子进程仍保原120秒，全部body/ABI/bytes/拒绝/恢复断言保留，原性能明确未通过 | 已写，验收未运行 |
| fixture/f64来源及原语言Error名 | 完整原档迁移按实际执行顺序绑定来源、全部原suite及独立execution locators；typeof-member的nullish路径补heap-language-fail的TypeError class2，保RT0003；完整原typeof源码独立JS/WASM/native、恢复及零根回归 | 已写，验收未运行 |

本轮原18项启动验收失败记录一次；E2BIG和缺runtime各为一个已确认启动根因，
本批修正后尚无新执行结果，不增加“修复后再次失败”次数。C77 Node、应用及核心
实际失败均保留原日志；同一轮同根因的多个断言不重复计算修复尝试。
FIX-03/FIX-12仍是授权后置的两组容量压力，保留失败记录及原门槛，不计通过。
待以上全部施工完成，统一生成和验证；功能验证通过后才正式完整三段式自举。

C78 所有已知施工与回归现已写齐并冻结，进入统一生成与集中验证。没有运行局部
探针或提前测试；全部实现仅使用维护Eli/El，生成MJS及maps仍是ignored产物。

### C77 当前集中修复（覆盖下方 C74–C76 进行中叙述）

C76 工具和用例生成、真实 stable/parity 库存生成已完成；独立门禁链收齐：
Emacs 248/248、Org 3/3、应用 24/24 文件、严格字节编译及四个原 CLI 通过。
Node 原51文件为351项，337通过、9失败、5延期：验收337/351（96.0%），
14/351（4.0%）不通过。其后六份完整原记录的三输出18项均因同一个
`initializer-array-fixture.mjs.map` 缺失在 beforeAll 失败，尚未证明实际三输出通过。
核心两分片继续收集本轮原完整库存，未重复启动；IR ingress 原完整5/5已通过。
这些是功能候选证据，不是当前正式三段式自举或0.0.2交付证明。

C76 源码与运行产物冻结。C77 统一修复写在项目 `_worktree/c77-fixes/`，
其 Git index 是冻结 C76 源码；仅未暂存差异是本批修复。不得修改仍在运行的
C76 代码，也不得在 C77 全部已知实现写齐之前运行生成、探针或测试。

| 施工项 | 本批代码与保留的验收 | 施工状态 |
| --- | --- | --- |
| 源码归档与生成 | 所有已注册工具统一生成真实 map；103对完整来源及损坏 map 拒绝回归；原有效源码和黄金不变 | 已写，未验证 |
| package 与 wire 接线 | 原完整产品子程序迁为 Eli；仅测试适配 WASM closeModule；真实 Error 身份、cause、重复解码和释放回归 | 已写，未验证 |
| Error 宿主镜像 | 私有真实 Error 标记决定宿主类型与默认原型，自定义原型和 live 属性保留；普通对象不能冒充 Error | 已写，未验证 |
| 选定入口与 FIX32 | 保留 portable roots 修复，撤回错误新增的 JS eager roots 行为；同一副作用源码以 Emacs 独立产物确立原行为，再比较三输出及两个 build-root 顺序 | 已写，未验证 |
| 完整原语料执行 | 真实 namespace 加载、空 Map/Set 真实构造、参数/归档解析/Seed identity 原拒绝边界；完整 module header 单次编译避免重复声明 | 已写，未验证 |
| 原 raw language 失败 | 全局 isFinite/isNaN 的 op8/9 误用仅接收 primitive 的 value-to-number，改用现有 heap-source-number；保严格 Number predicates、完整原输入和首错；补容器及转换 hook 顺序回归 | 已写，未验证 |
| Unicode alias 生成合同 | 正则实现已用 value-type，原生成器仍输出旧写法导致精确 provenance 门禁失败；仅迁移受影响 alias 生成器为 Eli 并保原完整数据、API/CLI和原九项回归 | 已写，未验证 |
| 完整 Math 功能与回收 | C76 原24项18通过、6失败，本轮整组验收失败计1；无globals的模块关闭补清控制根30/31/32；原完整lambda源码保留独立Emacs三输出回归，原普通函数测试意图另以认证的普通defun投影验证，原硬黄金保留 | 已写，未验证 |
| lambda 词法 this | 原sqrt源码的lambda在两个JS emitter中是箭头，WASM/native却使用动态receiver；补原完整源码的独立Emacs对照、嵌套lambda/call/apply/bind/GC回归，二进制端仅为实际使用this的lambda捕获现有cell | 已写，未验证 |
| 数组完整维护观察 | C76 原24项22通过、2失败，本轮整组验收失败计1；恢复原不支持关键字索引的严格负例，正向长度使用原支持接口；原型视图保真实身份，补空数组/空对象区别，保其他完整原输入与黄金 | 已写，未验证 |
| 完整 bit transport | C76 原3项2通过、1失败，本轮整组验收失败计1；维护入口替换已正确执行，回归精确守历史入口→维护入口的唯一允许变换，其余compiler输入、结果、原时限逐项保持 | 已写，未验证 |
| log10 严格内核 | C76 原transcendental 5项3通过、2失败，本轮整组验收失败计1；恢复原固定黄金约定的fdlibm归一化与求值顺序，保原许可，补原bit向量、特殊值和十进制幂、多route及WASM/native回归 | 已写，未验证 |
| Node 子进程启动配置 | C76 number-text及typed Number原验证漏传NODE导致子进程启动失败，分别保留启动失败证据，不能计为数学行为修复失败；C77明确传入选定Node24可执行文件，原输入与断言不改 | 配置已修，未验证 |
| portable compiler 总期限 | C76已完成274断言后到完整库并行阶段触及原30秒总期限；仅双功能标志、精确用例与原整suite认证后取消功能运行总期限，原30秒仍记未通过，完整13模块两轮mjs/maps字节比较与其他全部body不减 | 已写，未验证 |

C77 已发现的完整修复批代码与回归现已写齐并冻结，进入统一整合与生成。
先集中验证原六记录的18个三输出组合与本轮全部受影响项，集中收齐所有独立失败；
未有新源码或新失败证据不重复运行。仍在收集的C76进程只使用冻结C76源码，
C77使用独立Git worktree及独立受控运行，不混用旧候选产物或将旧通过冒称新通过。

C77 首轮统一生成已终态：仅新维护 alias 工具出现一个括号遗漏导致 EOF，
其余注册工具与测试均已执行生成。该编译失败计1次，不计为语言行为修复失败；
原日志 `c77-unified-source-generation.log` 保留，监控exit1、cleanup=true，
峰值124,321,792字节。已源修正外层forEach闭合；统一复生前同时收齐
新增this回归的原fixture表单认证接线，不运行局部测试或局部编译。

C76旧候选收集现已受控结束，避免继续把资源用于已由C77替换的源码：
两路均exit143、cleanup=true，峰值分别10,560,094,208与11,811,176,448字节；
不是OOM终止或断言失败。已经获得的通过与失败保留，取消和未运行项没有通过证据，
不得称原304文件全量通过。C77所有已发现修正和生成接线已收齐，再次统一生成后
只运行新候选的集中验证；必须明确NODE24，不混用C76运行产物。

FIX32 特别纠正：C75 的12/21预期由实现者错误新增，并非独立黄金。
原 `session-javascript-project` 仅返回 entry/modules；规范的多入口是编译图，
managed 初始化从 selected entry 遍历 imports。无导入关系的另一 build root
不应强制执行。C75 JS失败及 C76 WASM实际2/预期12的原结果保留，不能靠
向其他后端扩散新语义去“修复”。新回归独立构建 Emacs 产物断言2，然后在
相同源码、完整模块库存与请求不可变条件下比较 JS/WASM/native。
这纠正错误前提，不删除原 portable pruning、缺失入口拒绝或已有有效黄金。

FIX-03与FIX-12继续后置、保留原失败次数和严格容量/性能门槛；不记为通过。
全部上述实现收齐后一次合并、生成与集中验证，通过后才完整自举。

本次执行增量（优先于下方历史计数）：C74集中验证已结束，正在集中修复其暴露的问题，
尚未通过，不原样重跑。三个Sol任务分别负责运行时、原始用例及归档、测试执行接线；
主任务负责项目图与模块生成注册。当前属于整批源码修复阶段，全部完成后才集中验证。
FIX-35以operation36完成一次真实外部自有可枚举键操作，
不再将每个中间descriptor往返装箱；FIX-07为经原matrix认证、无显式预算的完整标准库
正向程序选择既有full-compiler（8,388,607槽、最多1GiB），原容量证据记deferred，
显式预算/OOM/恢复负例不变；FIX-23的own data descriptor直接读取其自有存储，
避免[[Get]]重新进入属性查找，namespace保原live binding/TDZ，accessor保原get/set。
补齐同一源视图在GC后的presence/descriptor/首错身份回归，完整原zipper黄金不变。
这些是可执行候选修复，不是仅新增诊断；旧错误的唯一机制仍以集中运行的结果判定。
当前源码统一生成与stable/parity原生成器均已通过；完整功能门禁与严格字节编译
已统一启动（c74-unified-functional-verification.log），尚不运行完整三段式自举。
该收集链在第70/303个Bun文件compiler-ir-session-ingress的第三个JS宿主用例处，
整树RSS达17,233,297,408字节，触发16GiB硬上限，exit137、cleanup=true；
前两例真实WASM/native输出已通过，项目图例未通过，不能借前两例关闭整文件。
作为FIX-32项目图的本批容量失败记录1次；根因未确认，不计为已确认行为修复失败。
已停止的链不原样重试：按Makefile原303文件清单切出其后233个未启动文件，
另将原53个Node文件、24个应用文件/字节编译/CLI独立启动并行收集；
证据分别为c74-unified-functional-pending.log、c74-unified-node-verification.log、
c74-unified-applications-byte-cli.log。已完成69文件不重跑，第70文件保原失败。
Emacs核心本轮248/248通过。上述分链只补收未运行部分，不替代最终严格门禁。
首轮生成发现FIX-56与FIX-32的回归源码各有一个多余右括号，已一次修齐，
第二轮完整生成通过；两项各记录本批编译失败1次，不冒充行为验收失败。
完整门禁使用make -k -i收集所有可独立失败；其退出码不能作为全套通过证据，
必须逐项读取真实结果。Node文件并发设为1，Bun沿既有两文件调度；整树16GiB硬上限。
FIX-03、FIX-12依最新授权后置且保原失败次数和严格body，不计通过。

集中收集状态：Node原53文件已完整结束，351项中324通过、22断言失败、5延期，
验收口径324/351通过（92.3%）、27/351不通过（7.7%）；
进程树峰值3,116,826,624字节，exit1、cleanup=true。
FIX-35三操作顺序/Proxy/首错回归已通过，但不能替代原case591完整验收。
应用原24文件已跑完23通过1失败（docs-site构建的site.js输出路径）；
严格字节编译与四个原CLI脚本通过。make -i的总退出0不能覆盖该应用失败。
待收集Bun链c74-unified-functional-pending.log在第三文件package-session
触发内部8GiB资源上限，退出且回收；原233清单其后230文件已从第四文件开始
单独启动c74-unified-functional-pending-2.log，未重跑前面结果。
该230文件链现已终止；完整Value/JSON与Vector浏览器用例已通过。
本轮新增失败收齐后一次调查、修正，不提前完整自举。两条资源失败均保留独立证据。

收集派发调整：230文件链已执行至第53个wasm-managed-transient-state，
第一项通过，auto(1)完整第二项仍在运行。只对原Bun分发器PID59895发SIGSTOP，
其controlled-run PID59892及工作PID52202保持运行与监控，不取消当前长用例。
当前及之前53个文件不重跑；其后177文件按原顺序奇偶分成89/88两个互斥清单，
每文件独立controlled-run（硬上限12GiB），失败也继续下个文件，避免资源失败截断整队。
新证据位于c74-lane-1/、c74-lane-2/及对应results.tsv；原链日志仍保留。
长用例全部完成后必须关闭原受控树并核对回收，不能恢复它继续派发这177个已移交文件。
以上调度仅为已经结束的C74收集历史，不授权恢复旧队列。
进一步移交：lane1首个core-modules的WASM两项已通过（auto1约416秒），
其native项继续；只暂停lane1的Bash派发器PID40044，监控PID40052继续保护当前文件。
其后88个未启动文件移交lane3/lane4各44文件，逐文件8GiB上限，保留原完整清单。
lane2继续自己的88文件，与新两路完全互斥。core-modules文件结束、监控退出且
cleanup=true后清理已暂停Bash，不能恢复派发已移交文件；当前日志在lane1目录。
原transient-state的auto1 WASM项已实际通过（816秒），native项因下述磁盘故障未完成；
不再将它归为可能死循环，也不以CPU运行本身替代结果。旧分发器已全部清理。
wasm-managed-persistent-literals的unnamed失败实际是旧源码expect片段定位断言，
约30秒是耗时，不是超时；前次口头超时归因已纠正，归FIX-47源归档迁移回归。

C74收集终态：同卷归档退休生成物的清理操作占满磁盘，造成后段日志创建、
测试启动及监控状态落盘失败。该操作失误单独计1次，不算语言行为修复失败。
不完整归档已删除，已确认当前测试、监控及暂停的派发器全部退出；不得恢复旧队列。
原始日志保留，必须区分真实断言失败与ENOSPC启动失败，不能由shell退出0推导通过。
已确认原core-modules的两项WASM通过，native项未通过验收；未生成的结果不补造。

### C74失败后的集中源码修正批

本批仅修复既有功能失败，沿用原63组问题清单，不另加性能或兼容目标。

| 施工责任 | 已定位的源码变更与原回归 | 当前施工状态 |
| --- | --- | --- |
| 运行时 | `memory.eli`的Error自有presence、foreign Array JSON；`managed.eli`独立Array宿主identity；`managed-host-runtime.eli`原始初始化throw handle及协议Array读取；对应host/prepare回归 | 候选代码已齐，未验收 |
| 用例与归档 | 完整原managed adapter使用emitter片段的text；Math边界提取；真实标准库资源指纹；JS归档保存有序显式roots且执行每个root；原591/570/631/649/601/604稳定ID完整回归 | 候选代码已齐，未验收 |
| 测试执行接线 | docs共享构建目录隔离；persistent原oracle迁移；IR ingress迁移Eli；完整严格比较保原算法并限制失败diff；所有新增Eli生成注册 | 候选代码已齐，未验收 |
| 项目图 | `session-javascript-project`保显式entries顺序并验证真实module库存，portable只保选中roots；同一fixture在JS/WASM/native验证12及反序21 | 候选代码已齐，未验收 |

Node26.8.2原生Function restricted getter的名字、身份及flags与原严格标准模型不同，
该失败记录保留。本次依用户最低平台要求，统一使用已安装Node24 LTS进行正式验证，
不改Function全局原型、不改原断言、不为额外宿主扩兼容范围。
所有代码齐后先集中验证不依赖正式stage3产物的功能；CLI投影、archive-debug、
browser/package正式artifact鉴权等依赖最终stage3的验收必须在完整自举之后运行，
不伪造manifest提前通过，也不从最终全量门禁移除。

施工接线：`tools/backends/bootstrap.el`统一注册project-entry-host及所有新Eli工具/测试，
产物和map保持ignored。`Makefile`的`test-pre-bootstrap`包含全部前置功能与应用门禁；
`test-bootstrap-artifacts`保留依赖正式产物的package-surface、browser-session、
archive-debug、tools-cli，并增加六个原稳定ID在三个输出的18项完整回归。
`test`仍包括这两个阶段，不删除任何原验收。正式流程为：全部源码完成→统一生成→
`test-pre-bootstrap`与严格byte-compile→完整stage0/1/2/3及逐字节比较→
`test-bootstrap-artifacts`与最终全语料三输出；前置失败时不启动自举。

六个原阻塞record的18项完整回归同时属于前置验证：
`test-pre-bootstrap-originals`显式以`ELISCRIPT_PRE_BOOTSTRAP_FUNCTIONAL=1`
创建当前源码的真实独立JS候选，保留完整程序、输入和独立Seed黄金；证据明确标候选。
后置任务强制值0，只接受真实最终stage3鉴权，两种模式共用同一份断言。
前置模式不伪造bootstrap receipt，也不能替代后置正式编译器的相同回归。

本批源码及回归、全部生成接线已齐，进入C75集中验证。
先统一生成；生成错误完整收齐后一次修正，不提前运行旧生成物。
本机验证Node24.21.0 LTS，生成/测试使用同一PATH，沿原功能/语义门槛。

C75生成证据：第一轮完整生成收齐4个编译错误（bounded null?、package top-level await、
FIX32回归括号、IR ingress括号），第二轮仍有IR ingress完整作用域错误1项。
该文件记录编译失败2次，其中一次修后仍失败；其余三处各编译失败1次。
整文件作用域修正后第三轮完整生成通过，run `63439a11cf0e4981b995e2e94163b245`，
exit0、cleanup=true，峰值123,863,040字节。前两轮失败仍保原日志，不记为行为通过。
stable/parity两个原库存生成器随后通过，未手改测量值或伪造哈希。

C75集中验收现已并行启动：原Make清单的303个前置Bun文件、51个前置Node文件，
独立的24个应用文件/Org/CLI/严格字节编译，以及六个完整原record×三输出的18项。
Node与原record链在`c75-unified-node-and-originals-verification.log`，
核心链在`c75-unified-core-verification.log`，应用链在
`c75-unified-applications-byte-verification.log`；每条链独立controlled-run。
核心Make的Node配方仅在该派发调用设为true，因为51文件已完整移交独立Node链；
不从实际验收清单删除Node门禁。make -i只收集结果，总退出码不能当作全套通过。
实现源码冻结，收齐结果后才集中修正；完整三段式自举仍未启动。

C75已结束的独立应用链：24/24应用文件通过、0失败；Org 3/3、应用CLI、
严格byte-compile通过；run `be46dcf2123a4b5fa3f526f63f98a027`，
峰值1,391,050,752字节，cleanup=true。docs-site/pages-assembly构建冲突本轮未再出现。
核心Emacs亦已248/248通过。核心Bun与Node/18原样例链尚未结束，不能借这些通过
关闭三组原阻塞。已出现Make test聚合的字面合同失败，收齐后恢复直接依赖接线，
不修改或放宽原检查；FIX32本轮仍失败，待完整错误证据收齐后统一处理。

C75 Node原51个前置文件已结束：345项中326通过（94.5%）、14断言失败、5延期，
严格口径19/345（5.5%）不通过；不能与原53文件351项分母直接相减当作修复率。
Error自有反射及真实JS/WASM/native协议JSON往返回归本轮通过，完整原阻塞仍未关闭。
随后六原record×三输出18项全部验收失败，共同原因是before初始化编译
`original-fixture-receipt.eli`时未绑定`finishOriginalFixtureObservation`；
18项未进入各自用户程序执行，不记作18次独立语义失败或18次修复失败。
该公共初始化编译失败本轮计1次，保留完整各项失败记录；不得用附近helper通过替代。
该受控链exit1、cleanup=true，峰值3,199,680,512字节，内存没有触发上限。
核心303文件链仍在进展，未启动新修复或重复测试；待该链收齐后合并上述失败集中修正。

C75核心链后续终态：完成75/303文件，其中12文件失败；第75文件package-session
再次触发内部8GiB树上限，rss=8,600,911,872字节，因resource-limit截断队列。
外层24GiB硬上限未触发，整树峰值14,755,102,720字节，cleanup=true；
make -i的exit0不能覆盖真实scope exit1。package资源终止本轮加1，保留C74原次数，
不将它当成已确认语言行为失败或盲目原样重试。
原75文件不重跑；从真实scope.unstarted提取228文件，互斥分为lane1/lane2各114，
分别在`c75-core-lane-1.log`、`c75-core-lane-2.log`继续收集，每文件结果附入各自tsv。
每路独立controlled-run硬上限16GiB；单文件原执行器资源失败记失败后继续后续文件。
旧核心/Node/应用链均已终止并回收；只有这两路当前候选的未启动文件正在运行。
实现源码仍冻结，尚未进入下一次修复、自举、版本变更或提交。

最近一次核心文件进度快照：原75文件为63通过/12失败，续跑30文件为25通过/5失败，
合计105/303已记录，88/303通过（29.0%）；17项为已运行失败，198项当时无通过证据。
只将88项计通过，其余215/303仍不通过验收；这是进行中的文件统计，不是三输出样例通过率。

C75续跑新增已确认用例：core-modules的普通WASM标准库检查通过，
每次分配均GC的完整标准库检查亦通过（原日志318,880.37ms）；对应native用例仍运行。
direct-wasm原完整suite继续新增通过浏览器JSON、替换模板、数组转换、链接模块、
模块初始化与数组回调等实际Chromium检查，不能用这些局部通过关闭整个文件。
两路工具句柄与所属监控均已重新核实存活，没有重启或新增重复测试。

续跑最新快照43文件为35通过/8失败；合并原75文件，118/303有结果，
98/303通过（32.3%），20文件已运行失败，185文件尚无通过证据。
response-events的25项及seed-native-fresh文件本轮完成；源码核对其native构建
只生成并运行普通`answer`小程序，生产编译器仍在JavaScript运行，不属于已取消的编译器宿主。
不将日志中native产品字样误判为另开native编译器工作，也不取消有效的三输出检查。

C75最新派发：原lane1/2各完成25文件，正在各自第26文件transient-state/core-modules。
已核验Bash stdin文件偏移恰好为当前行末1157/1230字节，短暂停止的仅是派发Bash，
其当前用例和监控一直运行。保存原完整114行清单后，在原inode上将输入保留至第26行，
并立即恢复两个Bash；当前用例结束后追加真实结果并读到EOF正常退出，不丢退出状态。
各自余下88个未启动文件移交lane3/4，合计176，清单互斥且不含已完成或当前用例。
新证据为`c75-core-lane-3/4.log`及各自results.tsv，每文件独立16GiB受控树，
外层24GiB受控循环保留8GiB回收余量；单文件资源终止后继续下一个文件。
只有执行计划调整，编译器/工具/测试实现源码与本轮产物保持冻结，未重跑旧文件。

C75完整core-modules文件已4/4功能通过，包括真实native与Node/Bun一致及根清理；
native原用例实测1,033,768.97ms，功能通过不能当成原时间预算通过。
对应原lane2已正常EOF退出，cleanup=true，峰值12,777,111,552字节。
继续将wire/sorted两条长文件各自保留在原lane3/4的第一行；核验stdin在当前行末46/42字节，
保存完整原清单后同inode截至当前行并立即恢复派发Bash，活动测试及监控始终保留。
其余174文件中，sequence-data单独作为lane6，另外173文件按原Make顺序作为lane5。
lane6已越过初始化并新增通过多个完整WASM原始库用例，RSS观测约3.2GiB后启动lane5。
lane5普通Shell只负责派发，实际每个Bun文件分别经16GiB controlled-run保护，无重复外层监控；
收到取消或监控不可用则停止派发，独立文件断言/资源失败保留结果后继续。
上述收集使用C75已生成产物，原清单总数303不变，不重跑已有结果。

### C75失败后的整批源码修复

按最新指令，三个Sol任务已开始集中修复现有失败，不等待慢压力用例才写代码。
C75旧队列现已全部关闭，不再与源码修复同时派发验证。lane3/4/5/6取消均为143，
各独立监控确认cleanup=true；保留原通过、失败和取消原因，不把取消记成真实断言失败。
lane1在关闭动作前自然完成：transient-state原完整4/4功能通过，native完整项
2,074,504.30ms，held-state项6,023.65ms，监控exit0/cleanup=true。
该通过属于C75原产物，不能冒充本批新源码验收；原时间门槛仍未通过。
全部实现完成后才统一生成和验证。
FIX-03、FIX-12继续后置，原容量及性能失败记录不改。

- [x] 原完整语料源码：修复receipt分离编译丢导入绑定、原host装载完成顺序、同源投影及身份接线。
  原始builtins操作数使用Object.is区分正负零；完整独立黄金及20×20组合保留。
- [x] 执行接线源码：修复Bun生成模块加载、原package比较及异常边界、Make直接依赖合同、
  fixture argv及map来源路径。只认证已维护的完整原用例，不放宽黄金或依赖白名单。
  wire仅在HTTP调用桥认证runtime.pin所有权后解码并释放原抛出根，覆盖真实kind13和
  foreign kind35、伪造token、首错与最终零根；公共raw invoke合同不改。
  tools-source身份使用真实物理namespace及原loader第二Map，保完整原身份断言。
- [x] 运行时源码：恢复raw Error stack拒绝边界；host反射只省略不可表示的stack；
  native清理保留原首错，关闭后的真实业务操作仍拒绝。补js-nth属性键位置，避免
  属性名误引入完整持久库；Array继承toLocaleString的自有写入与不支持读取分别判定。
- [x] ingress生成物索引：原完整手写文件与HEAD SHA完全相等，移动为legacy数据；
  Git停止跟踪新生成test.mjs，已有ignore接管。修复误把生成TDZ依赖当作手写源码审计，
  emitter和依赖边界标准不变。
- [x] FIX-32源码（C76历史）：phased/entries的JS exports sequence接入维护执行器。
  当时把额外build roots当作初始化顺序并新增12/21预期，已由C77纠正，不能作为现行合同。
- [x] 正则源码：唯一raw typeof改为Eliscript value-type，原无raw算法门禁保留。
- [ ] 全部上述源码完成后集中验证；通过后再完整三段式自举。

C76整批实现与回归现已冻结，开始统一生成。所有旧C75进程已确认终态，
新生成不与旧队列混用。先生成本批工具及测试、再由原生成器更新真实稳定/parity库存，
集中验收原功能用例及受影响门禁；本步骤不是完整三段式自举，不更新版本号。

C76首轮完整生成仅收齐1个编译错误：managed-adapters回归的同步forEach回调内
放置await。已将真实host源码读取与编译一次提升到外层async测试，原逐项完整比较不变。
记本批编译失败1次；未执行行为，不计为语言行为修复失败。监控exit1/cleanup=true，
峰值123,535,360字节，原日志`c76-unified-source-generation.log`保留。

统计单位为问题组，不是失败测试数、调查次数或文件数。原 FIX-01–44 共44组；
将原已发现但未编号的19组逐项登记为 FIX-45–63，总数固定为63组。
一组影响多个目标/样例不重复计修复轮数；仅加日志不计修复。
本批集中验证失败已保留，以下“源码已写”不能称为验收通过。

| 当前状态 | 数量 | 占63组 | 编号 |
| --- | ---: | ---: | --- |
| 有历史功能通过证据 | 9 | 14.3% | 01、02、05、06、09、10、11、13、14 |
| 候选及回归已写，整组验收仍未通过 | 52 | 82.5% | 04、07、08、15–63 |
| 原容量压力失败，依授权后置 | 2 | 3.2% | 03、12 |

源码施工已有对应实现61/63组（96.8%）；当前61组功能范围的候选代码全部补齐，
其余2/63组（3.2%）为明确后置的原容量压力。三组新候选是否修复成立由集中结果判定。
9组历史功能通过不能借给新候选；52组已有局部通过与失败，完整整组证据仍须
在收齐后逐组核对，不能将任一局部通过扩大为整组通过。上述351项及文件比例
单列实际观测，不因整组尚未通过而抹去已完成验证。
FIX-06等原性能未通过的事实继续保留，历史功能通过不等于资源/性能通过。
最终三输出的样例通过率沿原固定分母另行报告，不用本表的问题组比例替代。

### 五组剩余问题

| 编号 | 具体阻塞 | 已确认验收未通过轮数 | 已确认修复后失败次数 |
| --- | --- | ---: | ---: |
| FIX-35 | case591的keys(inherited)在源码调用内首先报RT0001，早于返回值解码；后续foreign copy修复不能解释该首错。现有记录缺首个非法raw/frame，静态追踪尚未找到被破坏的不变量。 | 1 | 0；针对该旧首错的新修复尚未复验 |
| FIX-23 | zipper的570、631、649均在own descriptor/Object.hasOwn路径报RT0003；不能凭相同错误码认定同根。631旧RT0001汇总已纠正。仍须明确原对象类型、属性键及对应反射分支。 | 至少1轮，涉及3个原样例 | 0；针对这三条旧首错的修后复验尚未执行 |
| FIX-07 | 大规模interop及关联容量样例仍有未闭合首错；后序编解码/临时根释放已写，不足以证明覆盖全部14项容量失败。601/604已证为RT0002并精确配置有界full-compiler，不能由此关闭其余容量问题。 | 至少2 | 0次可归因于已正确选择full-runtime的容量修复失败；旧完整interop共至少7次运行另列 |
| FIX-03 | 原builtin容量耗尽及恢复门槛没有通过，原组11/12；延期登记不是容量实现修复。属于允许后置的资源验收，仍记未通过。 | 3 | 2 |
| FIX-12 | 原64-slot原型压力门槛没有通过，原组10/11；本批cold-own64是另一个测试，不能借它关闭此项。属于允许后置的资源验收，仍记未通过。 | 至少1 | 0；已有1次行为修复尝试，原压力项延期未验收 |

FIX-07的至少7次原完整运行：4次自然失败（2次RangeError、2次RT0002）、
2次因源码替代取消、1次ENOSPC中断。不能把它们全算成同一个问题的7次修复失败。
FIX-23与FIX-35多轮源码调查没有执行修后程序，不增加修复失败次数；
0次复验不代表问题容易，也不代表已经修好。现存材料不完整时只报下界，不补造总数。
本节列出的3组功能阻塞和2组资源门槛都保留；未经用户进一步改变范围不删除。
两个原库存生成器（stable/parity）已实际运行通过，证据为
c74-stable-inventory-generate.log与c74-parity-inventory-generate.log；
它们只证明库存与当前源码同步，不替代运行语义验收。

### 已写源码的新增19组（全部尚未运行）

| 编号 | 已发现问题及本批源码对应 |
| --- | --- |
| FIX-45 | 新host codec五处optional默认nil与undefined合同混淆；改rest读取原缺省。只解释C73新回归。 |
| FIX-46 | admission回归缺真实artifact.entry，提前在resolve失败；补完整上下文并保原首错断言。 |
| FIX-47 | 原nested-observation回归读取错误legacy来源边界；恢复认证完整归档suite。 |
| FIX-48 | raw observer回归未closeModule即断言live=0；按真实生命周期关闭后收集。 |
| FIX-49 | Math模型将statement传给expression emitter并漏取text；按正式IR和片段接口接线。 |
| FIX-50 | 三个Node测试入口静态载入bun:test；使用node:test并限定Bun专属注册入口。 |
| FIX-51 | array-text data URL中的number-radix相对依赖不可解析；认证原源并运输真实坐标。 |
| FIX-52 | regexp Unicode生成块typeof拼写偏离原生成器；恢复维护源表达式。 |
| FIX-53 | arrays支持容器测试缺literalModules依赖图；补真实原模块闭包。 |
| FIX-54 | array named Get缺延迟发布且__proto__被默认owner截断；走真实观察/receiver路径。 |
| FIX-55 | cold-own64遮蔽未发布iterator前发布整组方法耗尽；增加保原型/覆盖语义的窄路径。 |
| FIX-56 | operand128的8KiB setup先耗尽；保原setup失败/清理，并以同128槽有界arena执行完整耗尽恢复断言。 |
| FIX-57 | initializer结构检查硬编码旧27方法；认证原suite后按实际表长度验证完整循环。 |
| FIX-58 | 已支持Symbol.split却仍期待不支持；原认证投影验证真实raw符号身份。 |
| FIX-59 | raw own谓词在检查无效句柄前初始化原型并trap；先校验receiver/key。 |
| FIX-60 | own-predicate trap探针写入现已占用的随机seed偏移；认证投影保真实trap/首错/恢复。 |
| FIX-61 | Math独立oracle拒绝正式Unicode/math依赖；认证完整维护闭包并运输同一字节。 |
| FIX-62 | hypot最小正数输入跨宿主下溢差异；采用同一scaled compensated算法及转换顺序。 |
| FIX-63 | pow独立Node与binary结果差一ULP；迁完整canonical算法，不特判样本或放宽误差。 |

已有FIX-34新增显式interop Array原型/constructor身份实现，保zero-import自有realm及原wire黄金；
FIX-37新增活动Promise强持resolver和取消清理不阻塞结算/不覆盖首错。
二者已写源码但尚未验收，不据旧日志宣称已证明历史唯一根因。
FIX-32清单排序修正保留三个输出真实初始化副作用=12。
本批仍严格执行：全部已知修复齐备 → 集中验证通过 → 完整三段式自举 → 最终交付。

## 历史阶段记录

### 当前整批修复补项：FIX32 图清单与初始化顺序

C73 原门禁中 `compiler-session-protocol` 的 FIX32 首错是计划清单顺序。
`bootstrap/compiler/project.eli:project-plan` 使用 `normalize-strings` 与
`sorted-set-values` 生成排序后的 entries/modules；该清单不是执行顺序。
`session-binary-project` 已将原 request.entries 传入真实初始化，二者不能混淆。

- [x] B（历史前提已由C77纠正）：库存断言按现有规范要求 `main.mjs, unused.mjs`；
  原 request 的 `unused.mjs, main.mjs` 不改。旧12/21断言并非原语言合同，
  由C77独立Emacs原初编译器对照所确立的selected-entry行为替代；原失败证据保留。
  同步 request 的缺失入口异常用 assert.throws 验证，不交给异步 rejects。
- [ ] D：集中执行 FIX32 三个真实产物与源输入不变断言；尚未运行。

### 当前整批修复补项：活动异步任务的持有关系

- 原位置：`tools/backends/eliscript/managed-host-runtime.eli:pendingPromise`。
  当前任务集合强持 `pending/advance`，但后者只有 Promise 的 WeakRef；
  resolve/reject 在以该 Promise 为键的 WeakMap 中。垃圾回收可使分支
  `if (not continuation)` 静默结束轮询，却未兑现调用方已注册的等待。
  等待一个 Promise 不等于从外层 Promise 反向强持它。
- 变更：活动任务直接持有其 `{resolve,reject}`；在兑现、拒绝或关闭时先标记终态、
  移除任务并清除定时器，再调用原 resolver，并清空持有字段。
  普通值和源视图缓存仍使用原 WeakRef，不修改其生命周期合同。
- B：在现有 `managed-project-zero-imports` 的同一份源码添加可显式兑现/拒绝的
  deferred 导出；三个输出使用同一驱动，在多次宿主 GC 和事件循环切换后，
  原等待仍能兑现/保持 false 拒绝身份；已有 closeModule 拒绝和 live=0 断言保留。
- [x] B/C：上述同源回归与任务持有实现已写入维护 Eli；未生成、未运行。
- [ ] D：集中验证活动等待、原 HTTP 完整合同和清理。
  这是确定的生命周期缺陷，旧 HTTP 挂起尚无阶段坐标，不能据此宣称其唯一原因已证明。


> 更新：2026-10-20。
> 本文件是本次交付的唯一有效施工计划，替代旧 3×3 计划。
> 用户已明确启动本 Goal。C72 三输出结果已收齐，原文件续验仍在推进。
> 当前候选 C73 已完成本批全部 A/B/C、全源生成及三段式自举；独立复核 313 产品一致。
> 当前阶段为统一 D 内的整批修复：C73 原门禁已收齐，C74 自举尚未启动。用户明确要求全部已知问题修复后才重新自举；仅加诊断、容量延期推断或相关补丁都不能关闭未明根因。
> 时限来源接线已修；当前三输出入口仍被动态生成 host 的异步作用域阻塞。原 Makefile 全量门禁已收齐独立失败，进入统一修复；固定点通过证据保留。
> C72 文件续验独立继续；两候选来源和结果分开，新增失败收齐后再成批修复，不边测边改冻结源。
> 禁止逐项修复后逐项试跑；既有成果保留，不重启仍在推进的原任务。
> 失败处理必须先对照同一个原始样例在 JS/WASM/native 的成功与失败，再沿真实源码深入调查。
> 不以“重跑也许能过”替代根因；完成全轮对照和根因证据后一次修齐，再完整验收。
> 当前补充：由 Astra 并行收集整轮失败、调查运行时根因及验收接线根因。
> 三组已完成同一 C72 的成功／失败与源码调查及整批实现，当前源冻结，不局部试跑或预审。
> 已确认问题的整批 A 已汇合；隔离工作树先并行补齐同批 B，全部用例仅编写、不运行。
> 原 C72 剩余结果继续收集，新增问题仍合入同一批；全部已知 B 已齐备后，在隔离树一次完成全部 C。
> 主目录原轮与隔离候选独立推进；C72 三输出已收齐，C73 全批实现及接线齐备后已进入统一验收。
> 主目录冻结源码、原样例和原结果不变；模型切换本身不算进展。
> 本批已定义的 B/C 与主目录较新基线已集中合并；开始统一生成，完整收集所有编译错误。
> 原文件功能轮仍独立收尾，新的功能差异继续如实登记；统一生成不计功能通过。
> 用户已批准结束阻塞后续样例的 native formatter 执行链，并授权后续主线工程决定直接执行。
> 三目标共享调度进程；现先暂停该 native 计算及其 RPC 子进程，保留仍在推进的 WASM。
> WASM 已收齐，所属共享进程树已回收；监督回执 `cleanup_complete=true`，核对原进程均已消失。
> 未取得通过的 native 项保留实际授权中断原因，不写成断言失败。
> 此决定不改变冻结输入、黄金、失败记录或签名交付要求；集中修齐后再做完整验收。
> 后续按已授权工程决定结束原 sorted-core 的单一 auto1 计算进程，保留原执行器和监控。
> 首个完整案例已经通过；该文件因中断仍未通过，不宣称死循环、断言失败或功能验收完成。
> 已核对旧 PID 消失并观察原执行器进入 sequence-data，未重启或重复原已执行文件。

本轮 Astra 源码调查汇合（C72 原整轮尚未终结，仍不得启动修复后的验收）：

三输出终态：JS 787 个有效功能项中 782 通过、5 失败；WASM 754 项中 617 通过、137 失败；
native 754 项中 402 通过、352 失败，后者没有终态结果，原因是授权中断。
原库存严格分母每列 795：JS 782/13、WASM 617/178、native 402/393（通过/失败）。
已取消编译器宿主、性能延期及无结果的实际分类保留；不把有效功能比例冒称全部原门禁通过。
696 之后的全部 92 个 WASM 结果（32 通过、60 失败）已对照相同 ID 的 JS 与完整 sourceIdentity。
多样例同根因仍只计一次失败轮；本修复批次尚未运行，失败修复次数仍为 0。

- [x] A / P04–P07：同一 case ID 对照三目标结果及 sourceIdentity；原 795 库存与冻结有效功能范围分别统计。12:07 快照为 JS 782/795、WASM 569/795、native 402/795 通过；实际已返回非 equivalent 的记录分别为 5、46、0，其余验收失败保留取消、延期或没有有效结果的实际原因。
- [x] A / P04–P07：随后已将全部 795 个 ID 的三目标逐项对照汇入同一调查报告。WASM 已返回 652 项：580 通过、72 实际失败；严格分母为 580/795 通过、215/795 未通过，有效功能分母为 580/754 通过、174/754 未通过。JS 782/795、native 402/795 通过不变。新增失败包括 wire 四模式首例 RT0003、四模式外部对象字段丢失，以及 Bun transducer 安装顺序；不把同错误码自动合并为同根因。
- [x] A / P04–P07：六类接线根因已由源码确认：JS sequence 的参数和预期未解码；tools 三个 data URL 调用点缺依赖坐标；Seed oracle 混用两套协议模块实例；matrix execution context 丢失 literalSources/literalSourceIdentity；project-plan 将已声明 host provider 按 managed-only 模块查找；portable 裁剪后仍使用裁剪前的 evaluation roots。各项原断言与来源认证保留，不能只修首个出现位置。
- [x] A / P05：native formatter 的集合同步存在确定的调用放大：416 个全活格的一次快照至少产生 2,502 次同步内存 RPC，宿主回调前后均可能触发。已有全局和单集合重入保护，不能据耗时或 CPU 占用宣称死循环。原进程两次只读观察后均立即恢复，没有重启。
- [ ] A / P05：继续闭合 wire 返回对象内容丢失、foreign-object keys 的无效句柄、zipper 首个异常，以及 record 实际原型关联。不能把终态堆栈或静态疑点冒充已证明的同一根因，也不能宣称此前集合补丁覆盖所有新失败。
- [ ] B/C / P04–P07：整轮结果收齐后，把六类接线、上述运行时问题与已有 FIX 清单一次合并补齐；测试先全部写齐不运行，再一次完成实现。新一轮功能执行统一使用已授权的受控无总 deadline 模式，以真实阶段进展识别停滞；原性能、容量和本轮 timeout 失败记录继续保留，不改黄金或数据规模。
- [ ] D / P03–P07：全批实现齐备后统一生成、完整固定点比较、原测试与三输出全量验收，汇报固定分母比例及重复失败次数。

调查依据分别保存在本机持久证据 `astra-failure-inventory.md`、
`astra-harness-root-causes.md`、`astra-runtime-root-causes.md`；
native 现场只读观察为 `c72-native-formatter-live-observation.md`。
现有 CLI 没有安全的按未启动 ID 续跑入口；再次启动会重复前 402 项，当前没有这样做。
原 258 续验的外层监控意外退出后，按原 PID、创建时间及命令核验接管了同一进程树，
继续使用 24 GiB 独立硬上限及所属进程回收，没有重新启动测试；
证据 `c72-continuation-adopted-monitor.log`。原监控退出原因尚未证实，不归咎于语言代码。

本轮新增问题的固定编号（所有失败修复次数当前均为 0，尚未运行新修复）：

| 编号 | 主线问题 | 本轮已终结的验证失败轮数 | 调查状态 |
|---|---|---:|---|
| FIX-27 | JS sequence 特殊值参数及预期未解码 | 1 | 源码根因已确认 |
| FIX-28 | tools 三处 data URL 的依赖坐标 | 1 | 源码根因已确认，覆盖两类入口 |
| FIX-29 | 独立 Seed oracle 协议模块实例混用 | 1 | 源码根因已确认，保 Node/Bun 原身份断言 |
| FIX-30 | execution context 丢失 literal 来源字段 | 1 | 源码根因已确认，多样例不重复计修复轮数 |
| FIX-31 | 已声明 host provider 被 managed-only 计划拒绝 | 1 | 源码根因已确认，不放宽未知导入 |
| FIX-32 | 裁剪后的模块与原 evaluation roots 不一致 | 1 | 源码根因已确认 |
| FIX-33 | native 集合同步逐字读取的 RPC 放大 | 0 | 现场与源码机制确认；原 formatter 尚无终态 |
| FIX-34 | wire 外部对象 roundtrip 丢失可见字段 | 1 | 第一差异已定位，首个错误机制尚未闭合 |
| FIX-35 | foreign object 枚举及复制路径不一致 | 1 | 当前 keys 无效句柄继续调查；后续 copy 不支持 kind35 已由源码确认 |
| FIX-36 | 原 host 总时限提前终止功能及诊断丢失 | 1 | 下一批统一功能进展策略；原性能失败保留 |
| FIX-37 | 原 wire 纯语料完成后的异步挂起 | 1 | 253 项纯语料已执行，后续等待点未定；按无有效进展中断当前套件，保留原结果并继续后续文件 |
| FIX-38 | Bun transducer 在 managed graph 安装前访问模块 | 1 | 静态 import 先于同模块动态安装执行；Node 另有启动预载屏障，Bun 缺失。维护入口须先安装再动态装载完整原 body |
| FIX-39 | wire 原源码导出名与实际 descriptor 名未适配 | 1 | 四模式首例调用 original-codec-report，descriptor 为 original_codec_report，入口检查即 RT0003，未进入 codec |
| FIX-40 | 原 host 的异步入口未等待完成便关闭 graph | 1 | 四项已闭合为维护入口末尾未 await；同批补生命周期用例与实现 |
| FIX-41 | function-properties adapter 丢失原 Node oracle 与标准 Error shape 分支 | 1 | 原测试明确 mode3 标准 shape、其他模式固定 Node；恢复原分支，不改语言语义或弱化键顺序比较 |
| FIX-42 | 零导入 fixture 将原控制接口的读值比较改成跨运行时对象直接比较 | 1 | 原 suite 通过实际 raw 读值形成观察结果；adapter 直接严格比较带自有原型的 source view 与宿主对象。恢复各原 suite 的观察合同，保 zeroImports、原输入、黄金与严格比较 |
| FIX-43 | 原 data-text 的 PersistentHashMap 打印协议匹配失败 | 1 | 原 Node/Bun 均抛 IPrint/print missing；实际存在同词法构造器的注册，不能冒称遗漏注册或被 record alias 修复。仍需原全量中的阶段、receiver/prototype 与注册 key 证据；尚无已证明的生产修复，失败修复次数 0 |

wire 四模式 codec 的首例 RT0003 已确认属于 FIX-39 的入口命名，不能归入 zipper，
也不能与 FIX-34 的外部对象字段丢失合并。以上新增问题均尚未运行行为修复，
失败修复次数为 0；同一批的多个模式只增加样例观测，不增加修复轮数。

本批新增施工接口已收敛，不另造运行框架或扩大旧语言迁移：

- FIX-33：`managed-host-runtime.eli/readSourceWords` 复用 runtime 已有 `readBytes`，先读取表地址与 header，再按最多 65,520 字节读取 cell 块；保完整代际句柄、同步边界、首错和 callback 可见性，不永久缓存。416 全活格从每次 2,502 次 Node RPC 改为 3 次读取、6 次 RPC，这是源码推导，尚非性能验收。无需修改 legacy transport；B 保原 formatter 与 Map 覆盖/delete/reinsert/reentry，并补读取次数及跨块边界。
- FIX-35：`memory.eli` 的 foreign 对象复制使用私有 `heap-foreign-object-copy`，7 个根槽保护输入、输出、键快照及当前键/descriptor/value。一次 op4 完整 ownKeys 后逐键 op5 enumerable 判定、op1 Get、mode2 CreateDataProperty；保 symbol、getter/Proxy 顺序、浅层身份和首错，不将复制缺口冒称 keys 首错已修复。
- FIX-36：统一 corpus 功能执行策略，复用现有监督框架；legacy `executeOriginalProgram` 的 child IO/driver 与受影响 Seed/工具入口迁至 Eli。完整输入、输出及阶段独立保留，首错锁定、清理错误另记，功能模式不设总 deadline；HTTP 的 10ms 等业务超时语义不能取消，原性能失败不改记通过。
- FIX-38：维护 `compiler-corpus-managed-adapters.eli` 的原 host-body transport，复用已有 Eli `load-body`/`loadManagedProjectGraph` 顺序：安装成功后动态加载独立完整原 body。覆盖六个 host 家族 Node/Bun，不向含静态 import 的同一模块继续塞前缀，也不放宽 graph 未安装拒绝；B 保原身份与黄金，增加延迟安装、安装失败先传播及图隔离断言。
- FIX-39：复用现有标准 runtime facade 的源码名适配，将 wire 的同步、异步和 HTTP 原调用入口与实际 descriptor 对齐，并保留 transient-state 现有适配。源名映射来自实际声明，未知名仍拒绝、歧义不能静默合并；不 hardcode 首个 codec 名字，不修改原源码、黄金或 descriptor。四模式完整原 wire 测试与既有 facade 否例同批验收。

以上接口由 Astra 对真实冻结源逐项定位；完整基线位置与来源接线在对应调查报告。
原 C72 与全部既有修复的证据分开；隔离树全部已知 B 齐备后，一次完成本批 C，
原轮后续新增根因仍须补齐 A/B/C 并汇入同一候选，期间不做局部验证。B 分工沿既有三个 Astra 任务：
接线组负责 FIX-27–32/38/39；运行时组负责 FIX-33/35 与现有外层能力适配合同；
执行组负责 FIX-36 的功能策略、输出和首错生命周期。已有完整原用例直接复用。
op32–35 已由实际 ForeignBinding/ObjectRealm 外层改写至底层 op8，不是底层 handler 漏接；
只补实际依赖闭包来源证明和组合入口用例，不重复扩写底层白名单。

- [x] B / FIX-33、35：隔离树 `tests/eliscript/managed-host.eli` 已写真实 runtime 的分块读取、增长后地址、Map/Set 身份与回调同步、foreign copy 及 keys/entries/values 对照。原 formatter/object 黄金保留；新增 auto1/65536、跨块及 descriptor/Get 首错恢复，未运行。
- [x] B / 外层能力合同：隔离树 `tests/eliscript/managed-foreign-binding.eli` 已补 op33 原生原型精确分类和自定义 Proxy 不被额外观察的断言，未运行。
- [x] B / FIX-27–32、38、39：接线组已写齐 6 个 Eli 测试文件，原 project-entry 有效用例直接复用；覆盖真实 matrix context、四工具 ID 认证、安装时序、独立 Seed、portable/非 portable 评价根及 facade 源名，未运行。
- [x] B / FIX-36：隔离树 `tests/eliscript/compiler-corpus-process.eli` 已写齐 11 条执行策略及输出生命周期测试，未运行；覆盖功能/严格期限、流式完整输出、事件隔离、竞态、冻结首错与非 Error 收尾、证据失败和后继继续。真实原程序整轮仍是集成验收依据。

FIX-36 的维护接口固定为 `originalCorpusExecutionPolicy(context)` 与
`runOriginalCorpusProcess(command,args,options)`，同一维护模块负责策略和 IO，
不新增全局预算或另一套内存监控。策略读取真实 execution context 的显式功能声明，
不因 record 私带 `small` 就放宽；业务 HTTP 时限保持。stdout/stderr 先流式落盘，
结算时按原比较合同读取完整文本；`process-outcome.json` 为独立权威回执，
冻结 Error 仍保原对象身份，cleanup 的 false/undefined 等真实失败保留在 secondaryFailures。
新源码生成/测试登记/来源依赖接线归同批 C，不在 B 阶段提前构建或测试。

- [ ] C / 本批整合：三个 Astra 与主线程在隔离树按不重叠文件并行实现；主线程统一接线和来源登记。保留已完成旧补丁，不按单项提前生成、运行或审核；当前原轮的新失败继续归并，不另起零碎重试。
- [x] C / FIX-31、32：`compiler-session.eli` 已实现声明 host provider 的计划外部依赖、别名冲突及原输入保护；二进制生成从 portable plan 取得实际执行根，普通多入口顺序保持。验收未执行。
- [x] C / FIX-27：JS 特殊值 exports 进入维护的 Eliscript 执行路径；隔离进程先传原始编码，再在实际执行进程解码，保原请求、黄金和产物身份比较。验收未执行。
- [x] C / FIX-33、35：集合快照改用既有分块读取；foreign 对象复制按 ownKeys/descriptor/Get 的原时序实现并保护活引用。验收未执行；不冒称解决尚未定位的 keys 首错。
- [x] C / FIX-28 接线：四工具记录的参考模块、Unicode 依赖及冻结 host 身份已纳入来源证明；独立证明文件接入 Node/Bun 参考解析模块，CLI 原证明仍分开维护。验收未执行。
- [ ] C / FIX-36、38、39 收尾：维护执行器的完整调用链、所有受影响的内层原程序调用、生成入口与来源证明继续集中接线；下一候选只在整批齐备后启动。
- [x] B/C / FIX-36、39 identity 收尾：独立 identity oracle 迁统一 process helper；真实上下文控制功能总期限，严格30000ms保留。维护 identity-host 同时承担 JS/binary，保原标量、collect、两heap隔离、错误及完整身份断言；freshRuntime按实际descriptor经既有context facade映射原导出名。adapter保原来源并发布两目标维护host；新增身份入口B未运行。
- [x] B/C / FIX-37 最小采证：尚未证明本次HTTP停点或Promise丢完成根因，不作推测性调度修复。原wire installer接入维护的HTTP调用/业务timer观察，独立JSONL保callsite、原Promise完成/拒绝、原delay及timer实际触发；保业务10ms和原完整fixture/黄金。新增观察B未运行，轮询计数不算业务进展。
- [x] C / 本批新增源登记：隔离树bootstrap映射、Make测试列表与生成忽略项登记identity-host/wire-http-progress两B，以及raw-special-fixtures生产/B、raw-language-fixtures生产；既有raw-fixture-observer登记保留。没有执行生成、结构检查、测试或预审。
- [x] B/C / FIX-42 Math：新增raw-math-fixture生产/B并登记生成与测试入口，完整迁移原mathBody观察配方；binary16与精确求和模型按完整原suite SHA认证后复用原源码，结果对象经既有Eli emitter生成。原seed、边界、转换顺序、held方法、30种iterator异常和namespace状态断言保留；新增模型独立见证B及完整原Math集成B均未运行。
- [x] A / FIX-42 接口边界：原零导入测试使用盒装标量、源对象和源闭包；新增适配器中的任意宿主回调输入不能凭借普通 raw 句柄表达。恢复原测试实际观察，保持可表达输入、黄金与对象身份断言；宿主互操作断言单列到明确声明互操作的测试，不能伪称零导入通过。不得用完整编译器图的 WASM/native 重放替代本项，那会重启本次已取消的编译器宿主。
- [x] B/C / FIX-42 特殊族：维护 Eli 观察器覆盖 symbols、regexp、module-bindings 和两个 persistent-vector 自动收集模式；沿原 recipe 全部输入和观察组执行。符号在所属堆比较身份；模块闭包仅通过已有源函数桥接接受数字，不注入宿主函数。补向量全部边界、失败释放和未知族拒绝用例；未生成、未运行。
- [x] B/C / FIX-42 对象属性：特殊族再覆盖原 16 个可移植观察组（身份 1、keys/hasOwn 8、assign 5、冻结 1、原型赋值 1）；Map/Set 原条目、稀疏数组、Symbol、UTF16、原首错和目标身份保持。另两组任意宿主 getter/键转换回调由原 JS 全部执行，并关联原 suite 中以源闭包验证的对应测试，不宣称它们通过零导入 ingress。补实际零导入产物的 auto1/65536 与释放测试，未运行。
- [x] C / FIX-42 全族收口：普通 7 族、特殊 6 族、数学与语言 11 族及主运行器接线写齐；原独立模型认证、逐观察组计数、宿主边界独立证据及伪造回执拒绝测试均纳入。新源统一登记；尚未取得验收通过。
- [x] C / 基线整合：按隔离 index、隔离当前源、主目录晚更新三方合并，保全部 runtime/fixture 修复和原测试。资产归档合为 21 套件、57 资产；全部源码及测试冲突已集中解入隔离树，主目录运行源保持冻结。
- [ ] D / 统一生成：一次 `make bootstrap-backends` 生成全部维护工具与测试；收齐编译失败后成批修正，禁止逐文件重试。进程树独立受控，无任务总期限。
- [x] D / 统一生成第 1 轮收齐：23 个维护源文件编译失败，未进入本批功能复验；监督正常结束且所属进程回收完成。错误包含括号、非法 catch 绑定、非异步 await、未声明全局引用、动态 import 语法及内建名称遮蔽。完整日志 `c73-unified-bootstrap.log`，不得把生成了部分文件记为整轮通过。
- [ ] C / 编译失败批次 1：四方按互不重叠文件一次修齐上述 23 个文件，再统一生成。此为本候选第 1 次修复编译失败；本批功能修复失败次数尚为 0。每文件原始错误保留在同一日志，后续相同问题再失败才增加其重复次数。
- [x] D / 统一生成第 2 轮收齐：原 23 个失败文件中 16 个已生成，7 个仍失败；全部错误见 `c73-unified-bootstrap-2.log`。其中 supervisor 的条件内顶层 await、wire 的第二处全局引用和 managed-host 测试闭合为重复未解决；其余为前轮语法错误之后显露的 null/NaN 常量及 NUL 转义。生成监督正常回收，功能修复尚未复验。
- [ ] C / 编译失败批次 2 与原轮新增阻塞：集中修齐剩余 7 文件；sequence 原功能用例的 child/测试两层 60000ms 仍截断 native/node，统一接入显式功能模式的无总期限执行，严格模式原时限保留。原通过的 native/Bun、WASM 同样例作为对照，输入和断言不变。
- [x] B/C / FIX-43：源码已闭合原型身份分叉：认证的原生 Object.getPrototypeOf 未走现有 raw reflection，持久 Map 被物化到宿主后返回宿主原型，IPrint 注册键却是源构造器原型。已补源 Map/read-restored Map 原型身份、print/read 稳定性及动态替换/foreign/Proxy 首错断言；object-provider/object-realm 对认证原生函数及 owned13/14 接现有 value-object-reflection operation0，namespace/foreign/用户函数原路。不添加通用宿主类别名，不改变原型内容。待整批验收。
- [x] C / 编译批次 2 与 sequence 接线：剩余 7 文件已集中修正；sequence 已复用统一 process helper 并补 strict60000/functional 无总期限、完整输出、冻结首错和后继运行断言。开始第 3 轮全源统一生成，不以生成代替功能验收。
- [x] D / 统一生成第 3 轮收齐：剩余 4 文件失败（supervisor 顶层 await、special 的 typeof 名称、language 的函数形式名称冲突、managed-host 测试模块 EOF），日志 `c73-unified-bootstrap-3.log`。supervisor/managed-host 的原编译问题已出现 3 轮、失败修复 2 次；其余新显露错误单独记，不伪算功能修复失败。监督正常结束并完成回收。
- [x] C / 编译批次 3 与首错采证：上述四文件统一修齐；对未闭合 wire/keys/zipper，追加原全量同次失败的可见内容与 raw/kind 阶段上下文，保原断言和首错，不二次调用原程序、不另跑探针。wire helper 认证真实 context 与完整原 host SHA，关闭 runtime 前记录 actual；op4/5 仅保每个 memory owner 最近 32 次上下文，失败报告才输出，查询恢复原错误寄存器。已补失败不掩盖/不调用 getter/窗口滚动等 B，依赖来源已登记；第 4 轮统一生成开始。
- [x] D / 统一生成第 4 轮收齐：前轮四个错误均消失；唯一新错误在新增 wire 诊断测试 helper 的 withManagedSourceDecode 调用闭合，已在准确边界修正，原断言保持。日志 `c73-unified-bootstrap-4.log`。
- [ ] D / C73 三段式自举：启动 `make bootstrap-release BOOTSTRAP_RELEASE_OUT=dist/bootstrap-candidate73`，先执行第 5 轮全源生成，通过才生成 stage0→1→2→3；同一受控进程树无总期限。后续独立 verify-bootstrap 仍必需，原 C72 文件续验独立继续；不把启动或部分生成记为通过。
- [x] D / C73 全源生成、三段式与独立复核通过：`c73-bootstrap-release.log` 退出 0；`c73-independent-verify.log` 独立重读 stage2/stage3 全部 313 产品，逐字节一致。正式源码 SHA256 `bdb109fb5d1325e3951ea3d78ef209aadf442d8774cfb77871e8f626da82dbab`，两阶段产品 SHA256 均为 `7b6db86e4757b1377635a03284b71250e9a2a942e3f03a6bb699020e9acb6eb1`。生成峰值约 2.82 GiB，监督退出并回收完成；版本未更新，三输出功能尚未复验。
- [x] D / C73 正式包准备：stage3 安装与浏览器包构建通过，证据 `c73-prepare-release-package.log`。
- [ ] D / C73 三输出整轮：C72 三输出已收齐，全部本批代码生成与固定点通过后，启动同一 stage3 的三输出全量功能验收，保原 small profile 明示容量延期及所有原输入/黄金。启用已有 allocator diagnostic 与有限首错窗口，受控进程树 8 GiB 起步/24 GiB 硬上限、无总期限。原 C72 文件续验另树继续，不等待其结束才生成新三输出；不重启原已完成文件、不合并两个候选的通过数。证据 `c73-final-three-outputs.log`。
- [x] D / C73 三输出入口失败收齐：库存构造抛 `original case deadline is no longer a numeric literal`，尚未执行任何输出样例，监督退出 1 且回收完成。原因是 sequence 功能时限改用表达式，但原来源定位器要求正数字字面量；本问题验证失败 1 次、失败修复 0 次，不记为运行时行为失败。修复须保原 60000 来源字段，在明确的功能测试注册边界转换实际期限，不放宽 locator。
- [x] B/C / C73 库存入口与已知来源断言集中修齐：sequence 原调用均恢复字面量 60000，仅注册包装在显式功能模式向实际 Bun registrar 传 0，并补 callback/name/return identity 与 strict deadline B；末尾原负例保 60000。FIX19 project-entry 完整 metadata 比较保所有原字段及 assertionSource，仅明确已迁移的 legacy suite/原完整源码 SHA；28 资产验证保持，未混淆 managed repair 的 21 套件/57 资产。只变两测试源，不改定位器、正式编译器源或黄金；统一重生成工具/测试并重新准备 stage3 公开运行文件，已通过的固定点不重建。
- [x] D/C / C73 第二个入口失败及整批修复：`c73-final-three-outputs-2.log` 在动态 host 编译时发现 project-entry-host 的未绑定 aset，仍无目标样例执行。已改为现有 put，并一次修齐同组动态生成片段对 originalFixtureCompare/observations/originalFixtureGroups 的标识符桥接。该新问题失败 1 次，不沿用前一 deadline 问题计数；统一源生成与 stage3 包准备再通过，日志 `c73-generated-host-repair-build.log`，正式编译器产品未改变。
- [ ] D / C73 第三次入口：以相同 stage3 启动完整三输出，独立保留 `targets-round3` 及 `c73-final-three-outputs-3.log`；前两次入口失败证据不覆盖。期间冻结实现，继续完整收集可独立执行的原门禁。
- [x] D / C73 第三次入口失败：同一动态 host 在第 240 行暴露非 async 作用域的 await，尚未执行目标样例。动态 host 编译这一问题组累计失败 2 次、修复后仍失败 1 次（先 aset、后 await）；禁止再逐条重试，先调查完整生成程序及异步生命周期，不移除等待掩盖 FIX40。
- [ ] D / C73 原 Makefile 完整收集：`c73-full-make-test.log` 运行原 test 与 byte-compile，保 stage3 与显式功能 profile；顶层 Make 用继续执行模式逐条收集失败，`MAKEFLAGS=` 避免此模式传播进测试自己的子 Make。任何 ignored Error、断言失败、跳过的必需项和无通过证据仍判失败；不得凭 Make 最终退出 0 判通过。当前源码冻结，所有可独立结果收齐后一次修齐。

FIX-35 必须覆盖原完整样例：仅修 keys 后，紧接的 `assoc` 仍经
`value-object-copy-ordinary` 拒绝 kind35，不能把这一已知缺口留给下一轮。
FIX-23 的 zipper 首错和 FIX-24 的 record 原型关联继续归原问题；没有终态或
没有行为修复的项目不增加失败修复次数。采集命令、入口故障与修复执行失败分别记录。

FIX-37 的处理不是按运行总时长杀掉活动计算：源码确认纯语料之后只有固定负零检查、
有限 HTTP/网络操作和清理；现存进程采样为事件循环等待，无 TCP，且未进入下一组。
`pendingPromise` 的状态为 0 时可持续零延迟轮询，因此 CPU 增长不能证明有效推进；
当前具体 promise 与首个等待点仍未知。核对 PID 94776 的创建时间、父进程和精确入口、
确认无子进程后发送 SIGTERM，原 258 文件执行器已继续 sorted-core，未重跑前面文件。
证据 `c72-wire-live-stack.txt`、`c72-wire-stall-termination.json` 与原续验日志保留；
这次套件是中断失败，不能把内部纯语料完成冒充整套通过。

当前施工自查（沿 P01–P08 唯一工作量，不新增目标）：

- [x] P05：BigInt 转换与长度、原型/迭代维护用例、畸形 IR 来源拒绝、source-array/异常观察、协议 wrapper 弱缓存、Error 反射和 HTTP 传递相关实现已齐。
- [x] P04/P06：全部对应 Eli 回归及真实来源/Make/bootstrap/fixture 接线已写齐；新增类型阶段仍为 10 项，生成 JS/map 均忽略。
- [x] P01：已逐项对照上述实际源文件、负责范围与原输入/黄金，失败计数保留；不把源码完成当作验收通过。
- [ ] P03/P07：统一生成、真实派生来源合同、新固定点及独立复核、完整门禁和平台运行。最终验收只列通过/失败；无通过证据即失败。
- [ ] P05：同一最终 stage3、同一冻结源码与输入的 JS/WASM/native 实际完整输出验收。
- [ ] P08：功能验收通过后统一更新 0.0.2、最终固定点与包安装、签名推送及对应 SHA CI。

旧 transient、sorted、interop 三个受控长运行的基础设施失败终态保留，
与新统一候选的来源身份分开，不伪称仍在运行。除统一验收揭示的新阻塞之外，不再扩展修复或优化。

本批统一验收 C72 的真实跟踪：

- 自举通过：Emacs 原初入口至 JS stage3，独立复核 stage2/stage3 全部 313 产品字节一致；正式源码摘要 `e8a1d09e6d53e4eb2a5acffff0d9bbb4a3ca126c3ec0403b0b7cb19e22f06e33`，完整产品摘要 `c6530e97a8a99db7f525317bff67eb44825010fac87cb53fba10b16734ece770`。证据 `c72-main-bootstrap.log`、`c72-independent-verify.log`。
- 通过：严格字节编译；来源归档 30/30、原来源门禁 9/9、登记器 5/5、标准库设施 6/6，共 50/50；类型构造原语义与弱缓存回归 10/10。均来自当前实际源，不借用旧候选数字。
- 失败：新增 Error 回归 0/1，直接定义尚未表示的 stack 及期望 fresh-stack hasOwn=false 与既有明确拒绝合同冲突；下一批只纠正维护用例的这两处错误前提，不扩生产功能、不改变原 HTTP 黄金。原 wire 完整入口本次 0/5，未取得通过证据，保留 Bun 启动错误；最终以同轮完整 Make 的既有正确入口收齐，不额外反复试跑。
- 失败记录新增 FIX-15/FIX-16：compiler-parity 与 stable-compatibility 的原测试仍写死旧库存数字，实际派生库存校验本身通过。各记录首次失败 1 次、失败修复 0 次；原测试断言应按真实完整库存更新，受影响手写外语言能力依既定规则迁至 Eli，不回退真实来源或手改哈希。
- 三输出完整执行及完整 Make 门禁正在同一冻结实现上收集结果，分别保留 `c72-final-three-outputs.log`、`c72-full-make-test.log`；收齐全部可独立失败后一次修齐，之后才统一复验，不逐项循环。
- C72 中途快照（2026-10-20 10:58 +0800，不是最终验收）：每种输出固定 795 项，实际 outcome 逐文件读取去重；JavaScript 通过 680/795（85.5%）、验收失败 115/795（14.5%）；WASM 通过 545/795（68.6%）、验收失败 250/795（31.4%）；native 通过 402/795（50.6%）、验收失败 393/795（49.4%）。已获得实际 outcome 分别为 680、557、402，WASM 其中 12 个实际失败；其余没有有效通过证据的必验项计入验收失败，不伪造产品断言失败。机械读取结果保留于 `c72-progress-snapshot.log`。后续结果继续由同一运行追加，不挪用旧候选或重跑。
- 随后 JavaScript 列已完整终结：795 项中 782 通过（98.4%）、13 验收失败（1.6%），最终 `sourceUnchanged=true`、`originalCorpusUnchanged=true`。13 项为 2 个已取消旧范围、6 个延期容量项、2 个独立 Seed oracle 失败、3 个实际比较/执行失败；这些原因保留，不能一概称为断言错误。完整清单见 `c72-javascript-final-counts.log`，不将这一列结果借给其余两个目标或下一候选。
- 旧 transient、sorted、interop 三个运行均已因磁盘 ENOSPC 导致监控失败关闭；各记基础设施中断 1 次，已完成真实通过证据保留，整组验收失败，不增加代码修复失败数、不假称仍存活。清理确认闲置的旧 stage 生成物，保留源码、收据及日志；实际可用空间已恢复，后续定期观察。上述清理清单见 `obsolete-stage-products-cleanup.log`。

本轮完整 Make 已真实返回失败：合同门禁通过，Emacs 248 项及 Org 3 项合计
251/251 通过；原 325 个测试文件中，首轮 62 通过、263 验收失败（5 个实际失败，
258 个因内层监控中断没有通过证据）。原未启动 258 文件已从原 scope 机械提取并
核对与已执行集合无交集，使用已有 Eli 执行器及独立外层受控进程树继续收齐；
保原 fixture 环境、精确 Node 路由、smol 例外及原取消范围，不重复已执行 43 个
核心文件和 24 个应用文件。证据 `c72-original-unstarted258-continuation.log`。
这仅续完同一冻结候选的验收，不能把首次完整 Make 的失败改记为通过。

下一整批已知修复全部先写 B，再写 C，均位于主目录下已有 `_worktree/parallel-fixes`，
不修改 C72 的冻结实现或输入；各项均属 P04–P07，不另扩目标：

- [x] B/C：FIX-15/FIX-16 两库存套件原 3+3 项及全部否例迁 Eli，真实库存基线、原字节归档、两精确生成证据入口与 module/map 防伪接线一次写齐。
- [x] B/C：FIX-18 原 CI exact argv 增加实际 str 维护 installer 的明确预期，保未知路由与缺 installer 的拒绝。
- [x] B/C：FIX-19 发布包补齐真实 `managed-host-runtime.mjs` 及 map，保原完整 Worker 依赖和全字节 manifest 验收。
- [x] B/C：FIX-08 新 Error B 的两处 stack 合同前提已纠正，保五类 Error、全部原黄金、同一拒绝值和清理；仅两 hunk 补丁，不扩生产功能。
- [x] B：FIX-17 监控器保原 11 项，另补 3 项有限瞬态采集失败恢复、持续失败及坏 snapshot 的严格测试；全部先写齐未运行。
- [x] C：FIX-17 旧监控器全部能力迁 Eli；保原 RSS 上限、PID/birth/token 归属、IPC 及所属子树回收。仅对明确短暂采集超时有限容错，完整保 code/signal/killed/attempts，持续不能测量仍关闭并回收；不对有进展程序设置总时限。
- [ ] D：所有 C 齐备且 C72 验收收齐后一次接回主目录、一次生成与真实派生、集中复验；本批不提前生成、局部测试或审核。前三项补丁为隔离树持久证据目录 `c72-infrastructure-batch.patch`，Error B 为 `next-batch-error-b-contract.patch`。

FIX-15 至 FIX-19 首次验证失败各 1 次，失败修复均 0 次；新的整批验收后按真实结果
更新，不因尚未接入或未运行虚增失败修复数。FIX-17 的首次失败是原内层 ps 采集退出，
不是 reader 语义失败；错误细节缺失也纳入同一修复，不靠猜测追加程序内存。

同轮续验新增的独立失败也归入这一整批，不先运行上面已写齐的小部分：

- [x] B/C：FIX-20 / P04–P07：CLI 原独立产物的测试 transport 必须同时覆盖 Bun 的具名 child_process 导出和精确 bin 入口；正式 stage3 指定身份拒绝继续保留。先补全原三套正负例的接线 B，再修现有 `independent-cli-fixture.eli`；不放宽 production CLI。
- [x] B/C：FIX-21 / P04/P06：`compiler-corpus-f64-replay` 原两例完整迁至 `tests/eliscript/compiler-corpus-f64-replay.eli`，原 JS 逐字节归档，canonical JS/map 忽略并经 bootstrap 生成。原 static-data 的 canonical 已是 installer/归档导入器，不得伪造它含有测试登记；通过现有 `readOriginalStaticDataFixtureMigration(options)` 的真实 19 条 archive case、来源摘要、完整 executable suite 和 maps 证明原断言保留。原全部 f64、unary、regexp、native 原始套件和无保留 locator 的拒绝边界全部保留。
- [x] B/C：FIX-19 扩展 / P04–P07：archive relocation 与 Pages 同缺 host-runtime 依赖，按实际生成 graph 补齐 module/map；source-archive 对新增加的真实 assertionSource 字段作完整精确断言，保原 metadata 字段和所有伪造拒绝。
- [x] B/C：FIX-22 / P04/P06：prepare 的两项实际失败发生在导入自造 bare `value-alias.mjs`，尚未进入容量/首错断言。将 alias 放入普通 managed modules 并相对导入，保真实 canonical value 源唯一、全部 24×48 初始化、1024 slots、first false 和 roots 黄金；新增 B 验证未知 bare 名仍作为 host 声明拒绝，不扩大 production 白名单。
- [x] B/C：FIX-23 / P05：`managed-host-runtime.eli` 的 `decodePersistent`（C72 L800）和 `encodeLiteral`（L353）递归处理集合树并把临时根保留到整个边界结束。将标准 materializer 的普通不可变集合 children/metadata 改为显式后序栈，复用同一 provider.read/create 与原材料校验；每个已完成节点及时回收其临时根，保发布给宿主的源值根、共享身份和首个异常。自定义 provider 保既有调用合同。B 复用原 `persistent-tree-walk` depth=12000、`map-patterns`、完整 interop 及 `persistent-zipper` 全源和独立 JS 黄金，不缩小数据、不删失败行为，不因迭代实现冒称容量/性能通过。
- [x] B/C：FIX-24 / P05：declarative-record 的 IDescribe/describe 精确类型分派缺失，以及 core-stdlib/core-language-api 的原始 source throw。保 constructor.prototype 与实例真实原型的身份语义；initialize/project.prepare/run 的异常边界复用现有 sourceThrown 解码及首错/根释放，不能把真实异常藏成 kind13 handle。B 直接复用原三个完整项目及独立黄金，不按名称替代精确类型。
- [x] B/C：FIX-25 / P04/P07：compiler-browser-session 的 `./program.mjs` 依赖缺失使用原完整 browser session 失败用例收口，同批修真实模块闭包，不增加老平台义务。
- [x] B/C：FIX-26 / P05/P06：同一续验的 persistent-literals 在 beforeAll 失败：原零 hostCapabilities 断言与实际 source-operation 声明不一致，尚未进入后续行为用例。保原纯 WASM 零导入要求；先核对真实源及 lowering 参数/fixture 接线，不将原空数组黄金改成接受新能力。复用原全组 B，定位后与这一整批一起修，不局部试跑。

FIX-26 已完成本批 A/B/C：原八条 extensionless canonical import 未命中真实提供的 `.mjs`
模块身份，被正常 linker 当成外部模块；仅在 exact SHA 原 suite 的现有 fixture 接线中规范
这八个坐标，`compile_ir_string` 与 `compile_string` 使用同一源规范，未知 bare、其它文件、
重复/缺失坐标仍拒绝或保持原样。原 archive、完整输入及两个空导入黄金不改；共享来源
inventory 和实际路由也已接齐。原全组 B 与新增八项/源文件隔离否例全部先齐后 C，未运行。

FIX-23 精确接线：保原节点 materializer 为 `encodeLiteralValue(value,type,preparedRecord)`、
`decodePersistentValue(raw,brand,token,preparedRecord)`；新增 `encodeValue(value,deferLiteral)`
仅供私有显式栈选择 raw 结果或已经分类的 literal，不重复观察用户 provider；公开 codec
仍经 `encode(value)`。标准不可变 list/vector/map/set/queue/subvector/reduced 的帧为
`{value/raw,type,record,children,cursor,start}`，先按原序处理 values、最后 metadata，再物化父节点。
`releaseCodecRoots(start,failed)` 仅清该完成帧的临时 roots，跳过真实 console/source roots，
首错优先；custom provider 与其余类型保原路径。B 直接复用上述四个完整真实程序，
不以较浅树或较少 entries 代替。record-type 的唯一附加身份修复是认证真实 own data
prototype 与 materialized class 的 frozen prototype/constructor 回指，并登记 hostProto→rawProto
编码别名；不按名字合并、不替换 rawProto 已有宿主可见视图。其它 type/protocol 创建语义不变。
同一 C72 又收齐 core/protocol、multimethod、json、result、data-text 五个容量失败，均列入 FIX-23，
不另开预算循环。标准 decoder 完成节点统一经 `decodeValue`→`releaseCodecRoots` 清理
已完成 scalar/ordinary/protocol 的临时 field-key/argv/export-record 根，仍保已发布 source 根、
自定义 provider 原合同和首错；不只给 collection 树回收。B 直接复用这五个原完整项目与
独立黄金，原负容量/恢复用例、预算与 auto 参数保持；目前不提高 profile 或声称性能通过。

FIX-20 本轮三个原文件的入口相关失败分别保存，不把多个断言误算多个修复尝试；
FIX-21 首轮两例均失败，行为修复失败 0 次；FIX-22 原三例中 1 通过、2 失败；
FIX-23 九个原项目本轮均失败，FIX-24 三个原项目本轮均失败，各新根因的行为修复失败
暂为 0 次，不能因同一次修复前存在多个断言就增加修复尝试。当前新增条目全部 A/B/C 齐备后才能
进入这整批的 D；当前 C72 原三输出与续验继续冻结收集，不启动局部修复试跑。

上述 FIX-20–26 及 FIX-19 扩展的本批 A/B/C 现均写齐；FIX-26 定位和同源规范也已同批完成，
不把它排除后声称全编码完成。原有效完整用例直接复用，
新增必要 B 已先写齐，父确认全局 B 屏障后才放行所有生产 C。代码自查与整合 D
已集中开始：全部补丁在主目录上下文 `git apply --check` 成功；括号自查发现监控器
两个新源的顶层括号错误，集中交原负责人修齐，不启动单测或生成。修前失败证据保留。
随后对本批 22 个源统一检查，21 个通过、browser-session 一处多余括号失败；
已集中修正该处，并复核其完整 module 结构通过。本批三个源文件的结构自查失败各保留真实记录，
不把静态结构通过冒充任何行为验收。监控器修正后的两源亦通过完整 module 读取。
追加 FIX-26 后统一源码结构检查为 29/29 通过。新增来源片段另出现一次补丁上下文失败，
已按主目录最新基线重新提取窄 delta，保原 sourceAssets 56 项后真实追加为 57 项，
不回退旧 53 项基线；同轮套件 20→21，完整 module 结构及最新补丁上下文复核通过。
所有整合补丁均可作用于主目录当前实现；因 C72 及原续验仍使用其冻结源码，本批尚未
在主目录应用或生成，没有提前运行这批行为测试。精确 delta 位于隔离工作树持久证据目录。
FIX-23 显式后序集合编解码、完成帧临时根释放、record 原型编码别名已写齐；
FIX-24 初始化和 prepare/run 的真实异常解码边界已写齐，尚不以写完声称原项目通过。

本批编码收口后的统一自查：29 个 `.eli`/`.el` 源完整结构读取通过，八份精确 delta
对主目录当前基线的补丁上下文检查通过；没有执行本批行为测试、生成或局部重试。
集合子节点分类和解码品牌探测的临时根亦纳入同一帧回收；父数组先拥有元素才释放
该元素临时根，已发布 source 根保留；完整自定义 provider 继续使用原合同。
初次自查命令本身一处括号错误已纠正，命令失败单列，不增加产品行为修复失败数。
下一可测增量是收齐现有冻结 D 后，一次应用完整 delta、统一生成和验收。

JavaScript 列尾部新揭示的真实失败仍并入同一整批，不能因之前写齐就漏掉：

- [ ] B/C / P05–P07：原 `managed-language-intrinsics-source` 完整 sequence 比较失败；保原输入与预期，先从保留 observation 定位首次拒绝，不先试跑。
- [ ] B/C / P05–P07：原 compiler-session-tools 两条 Node 入口均在 `eliscript/runtime/unicode-case.mjs` 的 data-URL 模块解析失败；修真实依赖路由，不更改原工具协议、结果或放宽任意外部模块。
- [ ] B/C / P05–P07：原 sequence-data-standard-identities 的 Node/Bun 独立 Emacs Seed oracle 均在 IPrint/print 对 object:Object 分派失败；原 stage3 程序执行不能替代独立 oracle，保同源输入及协议身份断言，定位来源和模块身份接线后同批收口。

上述三个根因各记本轮验证失败 1 次、失败修复 0 次；同轮两个 Node 入口或两种 oracle
宿主不重复计算同一修复尝试。A/B 未齐前不写这些新增项的 C；全部新 C 齐前不启动本批测试。
截至暂停追加修复的边界：oracle 同产物协议路径窄 delta 已写保留；新
`compiler-corpus-tools-reference.eli` 仅已写 helper、尚未接入。JS sequence expected
artifact 解码、Node host 模块坐标、五个资产认证及必要共享接线尚未写，不宣称两项已修。
原 resource/CLI/throw 及此前整批窄 delta 均保留；整个 C72 及 258 原续验仍用冻结主目录，
继续同一受控进程，不重启、不提高时限来丢弃工作。下一次施工必须等全轮结果及比例汇报。

两条 JS 尾部失败的源码链已核实，尚未据此追加修复：intrinsics-source 的原两轮都
实际返回 `0n`，却与未解码的 BigInt 标记对象比较。维护源码
`compiler-corpus-managed-fixtures.eli` 编码合同；`compiler-corpus-execution.eli` 的
`exports-sequence-p` 只让二进制目标进入会解码的执行器，JS 转旧执行器后直接比较编码对象。
原 42 次调用、重复编译、全部特殊值及非法标记拒绝保留，不能改 `0n` 结果或原预期。
compiler-session-tools 的 Node 失败发生于原测试编译后直接 import 完整 data URL，
文件包的 exports 无法提供这个 data parent 的 Unicode bare specifier 解析；业务尚未开始。
同 ID 在 WASM/native 的原目标选择中明确为已取消的编译器二进制宿主范围，
不能列成尚待实现的 native/WASM 用户程序或编造其断言失败。

整轮最终统计必须同时保留原库存与已声明范围，不暗改分母：当前原库存每列 795；
`targets/stage3-targets.json` 的 targetSelections 已固定 JS 的 effectiveIds=787、
cancelled=2、resourceDeferred=6，WASM/native 各 effectiveIds=754、cancelled=35、
resourceDeferred=6。原库存严格统计中取消/延期仍不算通过；有效功能清单的通过/失败
须另外按这些冻结 ID 机械汇合，明确列出范围差额，不把取消的编译器宿主恢复为本次工作，
也不把明确延期容量标成已通过。不得拿 active scope 比例掩盖原库存未通过比例。

C72 新增完整通过证据：原 core-modules 4/4，加 type-construction 10/10，共
14/14，两个受控运行均 exit0、cleanup=true；原 native 完整 core 项自然结束，
不因运行较长重启。日志 `c72-core-modules-complete.log`、
`c72-type-construction-complete.log`；原性能与小容量验收仍失败，不冒称通过。

资源处置仅因主线磁盘风险：确认旧候选没有活进程和文件占用后，删除闲置旧目标的
生成 JS/map/WASM/native 文件，以及保留工作树 dist 下 67 个 stage 产物目录
（分配空间 3,947,532 KiB）；保原源码、sources、JSON 证据、固定点收据和全部日志。
清理清单为 `idle-target-generated-artifacts.nul`、`idle-retained-stage-products.nul`、
`idle-retained-stage-products-cleanup.log`。清理后系统可用约 12 GiB 是当时观测，
不把并行系统空间变化全部算作本任务释放量；当前 C72 和续验产物没有删除。
后续资源清理发生范围错误：另一已授权个人项目的 target 含历史验收资料，仍被整目录
处理，历史资料完整性无法保证。已停止其他项目清理并通过本人私聊反馈；详细事实只保留
在本机持久证据 `cleanup-scope-incident.md`，不伪称已恢复，也不将这次清理算作功能进展。

后续磁盘保护改为保留全部字节的透明压缩：仅对无活跃占用的旧候选 C65 共 217 个
闲置文件（包含首个单独处理的文件）先复制压缩、逐字节 `cmp` 后原路径原子替换，
源码快照、IR、JSON 收据与其它证据内容均保留，C72 当前目录未动。
文件分配空间合计减少 3,478,614,016 bytes，Git status 清理前后相同；当时系统可用
空间约 4.8 GiB 只是全机快照，不等同于本操作释放量。NUL 清单、每文件比较和块数
记录在 `c72-idle-compression-files.nul`、`c72-idle-compression.log`，未新做功能试跑。

其后磁盘再次降至约 1.7 GiB，进行了同样的保字节压缩而非删除：C61/C62 的
2,993 个闲置文件分配空间减少 772,812,800 bytes；C72 中已经有终态 outcome、
逐文件无打开句柄的 290 个文件分配空间减少 14,767,337,472 bytes。
每个文件均先压缩副本、逐字节 `cmp` 相同后原路径替换，当前无终态的运行样例未动；
冻结来源和产物的内容、路径及摘要保持不变，仅文件系统分配方式改变。
两次操作均 exit0，清单与比较记录为 `c72-idle-small-compression-*` 和
`c72-completed-case-compression-*`。随后全机可用约 14 GiB 仅为当时观测，
不把全部空间变化归因于本操作；没有重新生成或运行任何测试。

当前集中修复清单（施工与验收分开）：

- [x] 施工：原宿主 factory/codec 迁至 Eli，修复同一符号跨调用身份；旧归档字节不变。
- [x] 施工：命名空间改读真实 binding 布局；Error 原生 constructor 分类已补齐首轮实现。
- [x] 验收：修复 Error 认证依赖可消失缓存的问题，原五种 Error 与新增分层观察全组 11/11 通过。
- [x] 施工：已知未实现集合成员在真实原型链终点拒绝、空 constructor IR 的来源诊断、动态 Number 方法的隐式原型初始化。
- [x] 验收：集合原整组 17 项通过、1 项原压力明确延期；协议自举原业务与六次宿主执行通过；响应身份修复项通过，保留其余 24 项已有通过证据。
- [x] 验收：最新 Node LTS 上静态数据 19 项、便携性检查 5 项、原生内存接口 9 项完整通过；来源与实际执行入口联合 38 项通过。
- [x] 施工：宿主返回值跨清理阶段临时根、带符号句柄身份及集合同步接线已收口。wire 的非法操作路径异常是原预期负例，不能误改为成功。
- [x] 施工：修复宿主桥注册 Symbol 的保留字属性调用，补真实 JS/WASM/native 身份及 GC 回归。
- [x] 施工：原 64 slots 压力项保留严格默认；明确延期时才记录未验收，普通功能继续运行。
- [x] 施工收口：原测试私有接口、公共 IR 验证、当前已支持能力、独立 Node 引用解析及 CLI 原初启动依赖已汇合至主目录。
- [ ] 验收：冻结本批源码后，集中复验上述受影响原用例、来源闭包和正常门禁。
- [ ] 验收：使用修复后的同一 stage3 完成 JS/WASM/native 实际输出验证。
- [ ] 交付：全部功能验收成立后升 0.0.2，最终固定点与包验证，签名提交、推送和 CI。

最新固定点证据：隔离候选 C66 已从 Emacs 原初入口完成全部自举，完整
313 个 stage2/stage3 产品逐字节相同，独立 `verify-bootstrap` 亦通过。
正式源码身份为 `1fd01532f6ddd3e7baf57f13b27e52843856e0b7de44c9ac53fd838812658696`，
完整产品摘要为 `3cf3ce074eb65a7d726b152c7800b56c47af18547384007e6e891648ef688d9c`。
原候选 C65 的三输出已确认失败并被后续修复取代，已精确取消并确认进程清理；
完整保留已完成产物和失败日志，不把取消的尾部记为通过，也不能把其结果算到 C66。
C66 之后的正式源码如再修复，也必须重新建立最终固定点，不能挪用旧身份。
主目录 C67 已完成 313 个完整产品的逐字节固定点和独立验证，正式源码
摘要 `fe7b162d84bf18f07c493ac969021c5846eb3558c9fe8fed8b5ee2995b43f275`，
产品摘要 `3b03042a339a0faf06951ea07f1d9cb4a90dd3781ef4c25581f1b9470b451365`。
其后新增的运行时与畸形对象 IR 修复仍需最终重新自举，不把 C67 当作发布验收。

本轮集中验收的新增阻塞修复清单：

- [x] 施工：`managed-program-source-texts` 在源码文本捕获前拒绝畸形对象子节点，保留原 IR、来源与后端诊断；复用原对象整组的两种畸形输入验收。
- [x] 施工：原 primitive properties 维护用例对已实现成员执行真实属性读取与方法调用；`Array.from(null)` 保留当前规范明确的运行时参数错误，普通空值属性读取仍保原句柄错误。
- [x] 施工：对象退休用例使用未投影至宿主的真实退休对象；已有宿主视图继续保留对象直到关闭，不把活对象冒充退休对象。
- [x] 施工：功能延期模式下的 builtin 容量恢复用例将实际 WASM 内存上限与已声明的 64 MiB 堆预算接齐；严格原预算与原转换输入保持。
- [ ] 验收：上述原完整对象、primitive properties、builtins 三组，以及真实来源与相应三输出记录。
- [ ] 验收：原 core/sorted 源数组输入适配与集合同步回调重入、保守 `js-cons` 快路径的集中修复结果。
平台选择不以兼容或不兼容为目标；以最快、最简单
获得当前稳定版或最新 LTS 上完整通过的版本为准，不增加历史平台义务。

### 当前逐例比例与重复失败账本

进度报告给出每个 target 的固定分母，只列通过、失败两种验收结果及比例。
全部必验项中没有有效通过证据的均计验收失败，包括没有 outcome、未比较 oracle、
未执行、取消和延期；底层如实保留原因，不冒称都发生过产品断言失败。
不同候选的局部修复证据不混进同一候选的全量比例。预期拒绝且实际一致算通过。
运行中的日志仅为执行信息，不发布为最终验收结论。所有已知修复代码先齐备，再统一验收。

C65 保留的逐例 `outcome.json` 与其真实 `completeIds`（每 target 795）统计：

| target | 通过 | 失败 |
| --- | ---: | ---: |
| JavaScript | 714 / 89.8% | 81 / 10.2% |
| WASM | 536 / 67.4% | 259 / 32.6% |
| native | 521 / 65.5% | 274 / 34.5% |
| 合计 | 1771 / 74.3% | 614 / 25.7% |

上表是已停止旧候选的历史验收快照，不代表后续修复后的最终通过率。失败 614 项
包含实际失败记录 20 项及缺乏有效通过证据 594 项；后者中 JavaScript 2 项
`executed/unverified`、77 项没有 outcome，其余两组共 515 项没有终态 outcome。

同一问题按原始用例与根因记账。完整收齐失败后，每一批实际行为修复算一次修复尝试；
修复后对应验收仍失败，失败修复数加一。单纯增加诊断、未改源码的重跑不算新修复；
修复代码编译失败也计一次失败修复，并注明未进入运行验收。取消、未运行与入口配置错误
单列，不能冒充产品断言失败；入口错误也必须报告，不能隐去。没有核实的历史轮次
只写至少值，不补造次数。以下为当前可直接核实的起始账本，后续结果更新本表：

| ID | 原问题 | 已确认验收失败轮数 | 已确认修复后失败批次 | 当前状态与证据 |
| --- | --- | ---: | ---: | --- |
| FIX-01 | primitive 原型成员读取/调用 | 4 | 2 | 第三批行为修复成功，原完整 11/11 通过。保留原未实现 locale 方法的显式拒绝，其余成员真实调用；历史含编译失败 1 次、功能修复失败 1 次及两次未改行为的定位失败；`c71-primitive-exact-boundaries-complete.log` |
| FIX-02 | primitive 继承迭代的错误类型/代码 | 4 | 2 | 第三批行为修复成功，与 FIX-01 同一原整组 11/11 通过，不重复累计通过数。按真实求值区分空值读取 RT0001 与非法迭代方法 RT0003，保原输入/独立 TypeError 断言及清理 |
| FIX-03 | builtin 容量失败后的恢复 | 3 | 2 | 原预期 OOM 仍未实现；最新原组验收 11/12 通过、1/12 失败，失败原因是原容量项延期未验收。延期登记成功不算容量通过；严格原 body 保留；`c70-primitive-builtin-corrective-complete.log` |
| FIX-04 | sorted 原始完整功能用例 | 2 | 1 | 第二批行为修复后首项完整随机流、独立 golden、首错与清理已通过；其余当前没有通过证据，整组仍验收失败。同一运行继续，不重启，不发布为最终结论；`c69-sorted-original-source-fixed-complete.log` |
| FIX-05 | core 原始完整功能用例中的 types | 3 | 1 | C72 原 core 4/4 与 types 10/10 共 14/14 完整通过；原 native 完整功能自然结束，未缩输入。保留第一次局部 defun 修复编译失败、第三次诊断的 Type.defineType 首错及两次诊断启动错误；`c72-core-modules-complete.log`、`c72-type-construction-complete.log` |
| FIX-06 | transient 每次分配收集下的完整功能 | 至少 1 | 至少 1 | C72 同一原续验完整 4/4 功能场景自然通过：WASM65536、WASMauto1、nativeauto1、跨调用状态与 root。WASMauto1 819899.87ms、native1730124.43ms，整组2573.60秒；原时间性能仍未通过，不改门槛。此前 auto1 909161.84ms 功能通过及性能失败、向量编译失败、两次取消、一次多 file 入口错误均保留；`c72-original-unstarted258-continuation.log` |
| FIX-07 | 大规模 interop 的 managed 容量 | 至少 2 | 0 | 原 small 资源真实 RT0002；C72 同样例 JS equivalent，WASM 实际仍为 small 131072 slots 并 RT0002，不能称为 full-runtime 修复失败。原先误记的失败修复 1 次已按真实配置纠正为 0；启动/接线未选到 full-runtime 单列。旧一次 full-runtime 因 ENOSPC 中断，不冒充语义结果；原规模、auto 和 strict/small 原容量标准不变 |
| FIX-08 | wire HTTP 异步阶段无法结算 | 1 | 0 | HTTP 独立定位第 4 次实际进入原业务，发现/权限/HEAD/OPTIONS 通过，在 body.limit 收到 RT0003 而非原预期 limit 异常；真实首错已定位，不再只笼统记挂住。前三次准备错误及原一次取消单列，复用真实 WASM/native/ABI 不重编 |

大规模 interop 完整程序另保留总运行计数：已核实至少 7 次尝试，4 次自然失败
（2 次 RangeError，其中 1 次仅增加深栈诊断；2 次真实 RT0002）、2 次被新修复替代而取消、
1 次旧 full-runtime 因 ENOSPC 中断。这些不同根因的运行不能全部记作同一个容量修复失败。

本轮同样例对照新纠正的资源前提（不启动重跑）：`stable-compatibility:program:stdlib/interop/js.eli`
的 JS 与 WASM 来源摘要同为 `af5ad408e7689c9261de9250060f852dd8f815a4e6c59912d4129fe368f174fa`，
七个模块摘要及原 record 摘要相同；JS 完整执行 equivalent，WASM actual RT0002。
WASM 的 outcome 与实际 driver 配置均为 maxSlots=131072、initialBytes=8388608、
maxBytes=67108864、auto=65536，失败 stderr 没有 full-runtime 选择日志。
`compiler-corpus.eli` 的 `compilerCorpusFunctionalResources` 与
`compiler-corpus-host-context.eli` 的 `selectOriginalInteropRuntimeOptions` 同时要求
性能延期标志及 `ELISCRIPT_SEQUENCE_FUNCTIONAL_RUNTIME_PROFILE=small`，才选择已认证
原 interop 的 full-runtime；当前 stage3 Make 入口只将 small 作为 CLI 参数传递，
未传这个额外环境标志。本轮不能证明 1048575 slots full-runtime 也失败；
不能拿错误前提继续追加内存或把修复未实际被选中计作容量行为修复失败。
该入口与显式配置之间的接线缺口并入 P06/P07 同一修复批，等全轮对照完成后统一处理；
保原 small 容量失败及功能资源延期状态，不降低验收。native 同样例尚无通过证据，
不能编造其运行断言或借 WASM 的失败替它结算。

同一轮 zipper 的成功/失败对照边界：JS 的原完整 `zipper_report` 输出与独立预期
一致，包含原 12000 层输入和七个负例的原 TypeError 消息；WASM 的两模块来源 SHA
与 JS 相同，但没有导出 report 或 `execution.json`，仅有失败 stderr。
最终可见栈是 `managed-host-runtime.eli` 的 `propertyDescriptor` → source-view 的
descriptor → `memory.eli` 的 `value-source-own-descriptor` 返回 RT0003。
该 descriptor 同时参与正常 Get、getOwnPropertyDescriptor 和 synchronize，
因此日志既不能证明具体 zipper 业务分支，也不能证明错误打印遮盖了第一次 throw。
目前缺少首个 source 异常，以及失败时 descriptor 的 raw/key/kind；已有 debug 映射
没有对应 WASM PC，不能从最后一帧猜出首次源码行。不能把这个 RT0003 当作已证明的
容量或递归问题，也不能声称现有根回收代码已解决它。native 同样例暂无通过证据。
后续先结合全轮同例证据补足首错，仍不能定位时需在同批完整验收中保留首错诊断，
而不是盲改 descriptor、删除原负例或缩小 12000 层输入后反复重试。

同轮 declarative-record 的对照进一步限定了 FIX-24：JS 原完整 report 的 protocol 为
`Ada:36`，record/map/value 等原断言全部通过；WASM 在完成 report 前报 IDescribe/describe
missing object:Person。注册和分派发生于编译进程序的 `stdlib/core/protocol.eli`：
`extend-protocol-type` 以 constructor.prototype 作精确 Map key，`external-method` 用
Object.getPrototypeOf(receiver) 查同一注册表，查找失败才构造 imported ProtocolDispatchError。
descriptor 只有该错误类的宿主协议依赖，最终 host Reflect.construct 栈不能证明宿主注册表丢扩展。
需比较的对象为注册时的 Person.prototype 与分派 ada 时的实例原型；源码存在 codec
材料化独立 constructor 后未额外绑定 prototype 编码别名的机制，但当前没有真实对象 ID
或品牌事件，不能排除 Map/注册状态因素，不能把可疑路径当作本例已证明的具体根因。
父批次已写的 alias 代码保留，尚无行为通过证据；不因名称同为 Person 就断言身份一致，
也不把 native 尚无该 case 结果冒写成实际分派失败。原三个模块和所有独立预期不变。

新一轮原始功能文件还发现以下首次失败项，均已纳入本次主线修复，不另增目标：

| ID | 新发现问题 | 行为修复尝试 / 修复后失败 | 最新完整原组结果 |
| --- | --- | ---: | --- |
| FIX-09 | BigInt radix 转换、首错及方法 length | 1 / 0 | 与 FIX-10 同一原 native-prototype 文件 30/30 通过，含实际 native、全部 9 模式及独立 Node oracle |
| FIX-10 | Promise 内部槽与普通 thenable、真实 capability 接线 | 1 / 0 | 同一原 native-prototype 30/30 通过，不能与 FIX-09 重复加进通过总数 |
| FIX-11 | strings 登记 skipIf 的接收者 | 1 / 0 | 原 strings 18/18 通过 |
| FIX-12 | 原 64-slot 原型观察压力 | 1 / 0 | 原 realm 10/11 通过、1/11 失败；失败原因为原容量项延期而没有通过证据，延期登记完成不等于容量验收通过 |
| FIX-13 | 畸形 raw literal 来源诊断 | 1 / 0 | 原 typeof 10/10 通过，原三个畸形输入、IR 及诊断位置保留 |
| FIX-14 | splice 自有 constructor 属性观察 | 2 / 1 | 第二次通过真实源码 Get 修正维护观察器，原 11/11 通过；第一次误用仅支持普通对象的 ABI，另一次仅增加首错诊断不算新行为修复 |

上述六个原文件共 85 项：80 通过（94.1%）、5 失败（5.9%）。其中 5 项验收失败的
原因是 4 项没有最终通过证据、1 项原压力延期未验收，不伪称发生过 5 个产品断言失败。
这是已有修复证据快照，不能冒充最终三输出全量比例；全部修复齐备后才发布统一最终结论。
该批另有一次 realm 维护登记器错误阻止四个文件进入业务执行，修正后入口第二次成功；
此启动接线失败单列，不虚增 BigInt、Promise、strings、typeof 的行为修复失败数。

本表日志名均相对于主目录持久证据目录 `_worktree/evidence/goal-0.0.2/`。
每次重复失败须报告：ID、尝试数、失败修复数、实际失败项、是否同一根因、下一次具体改变；
没有新代码或新诊断依据，不重新执行同一失败配置。通过后保留历史计数并标已关闭。

全轮失败调查和批次修复的固定合同：

1. 先按同一个原始 case ID 汇合 JS/WASM/native 的 outcome、observation、comparison、
   sourceIdentity 和 stageIdentity；不拿名字相似或缩小输入的另一个样例充当成功对照。
   逐目标只报通过/失败；缺少有效通过证据仍计失败，同时记录真实原因。
2. 检查三个目标确实来自同一冻结 Eli 源和输入、同一最终 stage3、同一独立预期。
   分开记录生成程序实际失败、独立 Emacs Seed oracle 失败、宿主/模块接线失败、
   已明确取消或延期的原因；不能把测试入口错误误写为语言语义差异。
3. 从成功目标与失败目标的首次可观察分歧反向追踪维护源码：前端/共享 IR、
   后端发射、运行时/GC、宿主桥、验证入口分别检查。读取真实生成产物帮助定位，
   但只修改维护中的 `.eli`/`.el`；相同症状未证明同根时不合并原因。
4. 每个根因在原 FIX 账本下记录：成功证据、失败证据、首次分歧、精确源码锚点、
   解释这一差异的机制、已确认与尚不能证明的边界，以及本次要一次修改的完整范围。
   不用猜测、运行时长或增加资源代替根因，不把调查次数记作失败修复次数。
5. 全轮结果与比例统一汇报后，先补齐所有必要 B 且不运行，再一次完成全部 C。
   所有已知修复和接线完成后再完整验收；没有明确改变，不重复原配置。
   完整保留每轮原始结果及同一问题的验证失败轮数、修复失败批次数。

最新完成：FIX-01 与 FIX-02 第三批行为修复对应原完整 11 项已全部通过，
`c71-primitive-exact-boundaries-complete.log` 真实 exit0、清理完整，峰值约 2.32GB。
FIX-05 的精确首错定位另有两次诊断入口错误（mock live binding 递归、准备后 export
坐标未接齐），均未进入原业务，分别记录，不算新产品失败或行为修复失败。

## 1. 最终目标和边界

交付以 JavaScript 运行的 Eliscript 正式编译器。它由维护中的 Emacs Lisp
原初编译器引导，依次生成 stage0、stage1、stage2、stage3；stage2 和 stage3
的编译器产物逐字节相同。只使用最终 stage3，对同一套 Eliscript 测试源码
生成 JavaScript、WASM、native 产物，并实际执行、验证结果一致。

**取消本次编译器的 WASM/native 运行形式，取消九格、三条宿主自举链，以及
由此产生的完整编译器二进制初始化和性能验收。** 这不取消 WASM/native
代码生成器，也不取消这两种用户程序产物的运行时、语义和执行验收。
既有取消项的源码和真实证据保留，不为清理旧设计重新开发，不计当前工作量。
`native-wasm-feasibility.md` 此后仅保留历史分析和证据，不再驱动施工。

### 1.1 用户要求逐项落实

| ID | 要求及本计划的确定含义 | 验收 |
| --- | --- | --- |
| R01 | 一份 Emacs Lisp 原初编译器源码，只要求将 Eliscript 编译到 JavaScript | A02 |
| R02 | 一份 Eliscript 正式编译器源码，可输出 JS/WASM/native；编译器自身只要求以 JS 运行 | A03、A05 |
| R03 | bootstrap 由 Emacs 驱动，生成 JavaScript stage0，称原初编译器产物 | A02 |
| R04 | stage0 编译正式编译器的 Eliscript 源码，生成 JS stage1 | A03 |
| R05 | stage1 编译同一份正式源码，生成 JS stage2 | A03 |
| R06 | stage2 编译同一份正式源码，生成 JS stage3；最终发布的是 0.0.2 stage3 | A03、A08 |
| R07 | 严格比较 stage2 与 stage3，编译器产物不得有区别，完成三段式自举 | A04 |
| R08 | 只使用最终 stage3，生成并实际执行三种目标产物，验证输出一致 | A05 |
| R09 | stage1、stage2 与 stage3 使用同一份正式源码；不对 stage1/2 增加 WASM/native 输出验收 | A03、A05 |
| R10 | 采用常见三段式 bootstrap 的原理：原初引导，随后两次自编译并检查固定点 | A02–A04 |
| R11 | 两份维护实现：Emacs Lisp 原初编译器、Eliscript 正式编译器；不增加第三套手写编译器 | A02、A07 |
| R12 | 三个输出目标使用同一份测试代码和输入，不分别维护简化版或替代算法 | A05、A06 |
| R13 | 自举产物对比由程序完整执行，并提供人工可独立运行的只读复核入口；缺失、额外或篡改产品不能通过 | A04、A08 |

这里的 stage0 是 Emacs Lisp 编译器**编译正式编译器的 Eliscript 源码后得到的
JavaScript 产物**。不要求把 Emacs Lisp 编译器自身转译成 JavaScript，也不
引入 Emacs Lisp 解释器。stage0 可能包含随正式源码生成的后端模块，但只承担
JS 引导；不把它的 WASM/native 输出能力列为验收条件。

### 1.2 语义决定：优先保证 Eliscript 统一性

Eliscript 的已定义行为优先于各 JS 宿主的偶然差异；该决定同样适用于
数学方法缺失或实现错误、Unicode 数据版本及其他同类问题。编译器和运行时
应通过自身兼容实现与转换保持 JS/WASM/native 同源程序结果一致，不能以
“宿主原生行为”为由放行 Eliscript 的差异、跳过断言或更改独立黄金。
适配须保留用户显式覆盖及原求值、转换、异常、副作用和身份合同。

这项决定替代旧九格记录中尚待选择“保留原生还是统一”的悬而未决事项；
不恢复旧编译器宿主或九格工作。现有 Math/Unicode 的 Eli 兼容实现继续复用，
仅修复最终三种产物验收所需的缺口，不重做已通过的无关能力。
需要直接暴露 JS 宿主特有行为时，可增加明确命名和文档说明的 JS 专用互操作
接口，并与可移植 Eliscript 接口分开；本次不为可选接口扩大工作范围。

- [x] 决策已纳入唯一计划及 Agent 规则。
- [ ] A05/A06：最终 stage3 实际三输出的原 Math/Unicode 及其他受影响语料一致；兼容 helper 的单独通过不能替代。

### 1.3 阶段定义

| 阶段 | 生成者 | 输入 | 编译器产物的运行形式 | 本次必须证明的行为 |
| --- | --- | --- | --- | --- |
| 原初源码 | 维护中的 Emacs Lisp | 正式编译器 `.eli` | Emacs 内运行 | 能从源码生成 stage0 JS |
| stage0 | Emacs Lisp 原初编译器 | 冻结的正式 `.eli` | JavaScript | 真实生成 stage1 JS |
| stage1 | stage0 | 同一份正式 `.eli` | JavaScript | 真实生成 stage2 JS |
| stage2 | stage1 | 同一份正式 `.eli` | JavaScript | 真实生成 stage3 JS；参与固定点比较 |
| stage3 | stage2 | 同一份正式 `.eli` | JavaScript | 与 stage2 产物相同；最终三输出与发布验收 |

stage1/2 不运行各自的一整套三目标语料，也不生成 WASM/native 编译器。
它们的必要执行就是参与自举链。固定点不额外要求 stage0==stage1 或
stage1==stage2；不能因此给本次目标增加一条不必要的失败门槛。

## 2. 当前基线与真实缺口

基线分支为 `feat/managed-project-linking`，HEAD 为
`678a52c79bc133d09a0c973b97b9b1b0141ef4a7`。本计划建立时有 316 个
未提交路径，包含既有源码、测试、生成物迁移和其他未交付内容；这只是
工作区快照，不能拿文件数计算完成率。提交本计划不能顺带提交这些代码。

已有成果可以复用，不能从头重写：

- Emacs Lisp 原初前端、Eliscript 正式前端、优化层、JS/WASM/native 发射器、
  托管运行时、项目/宏/诊断/源码映射和大量测试已有实现。
- 旧源码曾实际通过 JS 三代固定点；这是路线可行性的历史证据，不能替代
  当前源码和新 stage0–stage3 定义的正式验收。
- 当前正式源码图基线为 27 个模块；已有 53 份 literal 依赖声明和 794 条
  原始语料。数量来自当前清单，新增必要源码和用例后必须重新冻结，不能把
  这些数字写成阻止正常新增的常量。
- 当前已有完整 JS 项目生成、IR 保存、认证载入和单 producer/单 target
  语料执行器；可以复用，不能再用旧九格入口包装新流程。
- 已取消并回收本对话的 WASM/native 编译器宿主进程，保留原始成功、失败
  和取消证据；取消不能改写为编译成功。

仍会影响新范围的已知缺口：

| 缺口 | 当前证据 | 本次如何处理 |
| --- | --- | --- |
| stage0 还不是新定义的完整正式源码引导 | `bootstrap.el` 目前只由 Emacs 直接编前端，再借后续工具编其他模块 | D01、D02：Emacs 直接生成完整 stage0，移除该新链对旧产物的依赖 |
| 旧自举调度含三个宿主及额外固定点条件 | 旧 `bootstrapCompilerChain` 接受旧 seed，要求每相邻代相同；旧 grid 会构建二进制编译器 | D03、D04：新增薄层纯 Eli JS 自举及最终三输出调度 |
| 完整目标程序仍有容量/初始化失败 | 最新六文件集中结果中，raw runtime 16/16、native adapter 11/11、原初始化 4 项通过；完整 sequence 仍未通过；新增低槽压力也失败 | D05：保留原输入和预算，一次定位并修复真正阻塞三输出的缺陷，不能把此前 slab 代码写成已解决 |
| Math/Unicode 一致性仍有真实失败 | 原整轮中四个相关记录未通过，不能修改模型或结果 hash 冒充通过 | D05：按 1.2 已确定的 Eliscript 统一语义，通过自身兼容实现解决，保原同源语料和预期；最终三输出仍须实际验收 |
| 最终门禁和发布尚未闭合 | 当前源码无新定义的 stage2==stage3、stage3 三输出、全门禁及签名发布证据 | D06–D08：统一最后验收和交付 |

历史数值性能通过报告保留；困难性能和新的吞吐优化不阻塞本次功能交付，
也不改写为已通过。取消编译器二进制宿主后，不再为其初始化、GC 或吞吐
另开优化任务。新语法、0.1.0、外部代码生成后端不属于本次目标。

### 2.1 本次读到的源文件快照

下面是本计划的行号基线；实际施工后更新新位置，不能照旧行号盲改。

| 文件 | 基线锚点 | SHA-256 |
| --- | --- | --- |
| `tools/backends/bootstrap.el` | L10 `eliscript-backend-bootstrap`，L98 前端直接编译循环 | `2d764e113a0b89bacef1258b8d7cf0a46625632766b126501d7c9a1c43d7da6a` |
| `tools/backends/compiler-build.eli` | L117 `loadCompilerSources`，`buildIndependentCompiler` | `080f6b1ef8afc2999d459788fdb80c69030d57dbea30c9a48d9c0185c7a0763d` |
| `tools/backends/eliscript/compiler-matrix.eli` | L321 `archiveProduct`，L708 `runCompilerMatrixCell` | `e179c88cee4ada08177f12a2e1eed489d26980e0d30f9d264cfac6b08b567666` |
| `bootstrap/runtime/memory.eli` | `value-module-begin`、`heap-module-cell-read`、namespace reader | `5c8ae63f9af2f4b5dcb8e1ccab47df60a3c0aba445a6c8a5e89446c1c80aa56b` |

### 2.2 当前源码树和调用流程

```text
compiler/*.el                              原初读入/展开/分析/降低/JS 发射
compiler/eliscript.el                      编译及 Source Map 入口
bootstrap/compiler/*.eli                   正式编译器前端
bootstrap/backends/*.eli                   共享层、JS 所需支持、WASM/native 发射
bootstrap/host/compiler-session.eli        正式编译器请求协议
bootstrap/host/compiler-tools.eli          结构化工具协议
bootstrap/runtime/memory.eli               目标程序的共同运行时
stdlib/*.eli                              标准库与托管 literal 源码
tools/backends/bootstrap.el                现有引导入口
tools/backends/compiler-build.eli           源图、编译、IR/产物保存
tools/backends/compiler-bootstrap.mjs       现有认证/归档及旧三宿主调度
tools/backends/eliscript/compiler-matrix.eli 单 producer/target 执行器及旧矩阵
tools/backends/eliscript/compiler-corpus*.eli 原语料、执行/宿主适配
tests/eliscript/*.eli                      维护中的工具及运行时测试
tests/*.el                                原初编译器和 Emacs 测试
Makefile                                  当前统一门禁
.github/workflows/*.yml                    已有平台、浏览器 CI
```

生成 JS、编译阶段目录、依赖缓存未列为源码；均不得作为编译器维护源。

```mermaid
flowchart LR
  E["compiler/*.el"] --> B["bootstrap.el：先编前端"]
  B --> O["现有 JS 引导与 compiler-build.eli"]
  O --> G["旧 bootstrapCompilerChain / record-grid"]
  G --> H["JS、WASM、native 编译器宿主"]
  H --> M["九格与完整原语料"]
  M --> F["当前：有真实失败，未验收发布"]
```

## 3. 确定的目标结构与接口

### 3.1 固定输入和产物边界

1. `bootstrap.el` 从当前维护中的 `.el` 启动，枚举正式 Eli 源图并生成 stage0；
   不允许拿发行版、旧 JS artifact、Bun 打包结果或 wasm/native 编译器代替。
2. stage0 的正式源码清单与 `loadCompilerSources` 一致。JS 驱动开始时只捕获
   一次完整图、runtime/literal 源和构建配置，核对 stage0 已编模块的源码身份，
   调用既有归档能力冻结输入；stage1/2/3 不再各自读一遍可变工作区。
3. 全链 `host=target="javascript"`，固定 JS 引擎、编译选项、模块 ID 和诊断
   文件名。WASM/native 只出现在最终用户程序的 `outputTargets` 中。
4. JS 及 Source Map 的逻辑文件名固定为 canonical module ID / 原相对源码名。
   不把 `stage2`/`stage3` 的物理目录名写入代码或 map；不能事后删除路径、
   时间或差异字段来获得“相同”。
5. 固定点比较所有编译器可执行模块、maps、宏来源、必需运行数据及声明资产的
   完整文件集合和原始字节；另外核对正式源图、保留的 IR/canonicalIR。
   同 SHA 只作索引，仍核对完整路径集合、长度和实际文件。
6. 控制收据中的阶段号、生成者、存放目录和日志是构建过程信息，与编译器
   产物分开存储，事先定义边界；它们可以不同，但不能用这个例外排除编译器
   模块、Source Map 或运行所需数据。
7. 最终三输出比较实际行为，不比较 JS 文本、WASM 字节与机器码是否相同。
   Number 使用精确约定，保留 NaN、正负零、无穷和次正规数；错误类型、
   位置、求值/副作用次序、集合、Unicode、宏、项目及资源恢复按原合同检查。

### 3.2 新接口及记录结构

所有新增实现仅为 `.el` / `.eli`。下面名称、字段和默认值是施工合同，
新增文件尚不存在，不得将计划接口当作已有 API 使用。

| 位置 / 新接口 | 参数与返回 | 责任、状态和错误 |
| --- | --- | --- |
| `bootstrap.el`：`eliscript-backend-bootstrap-stage0` | `output-root`；返回 stage0 manifest 相对路径 | Emacs 直接编正式源码图；写 JS/map 和源码/产物 SHA；任一失败使 stage0 非成功，不调用旧 seed artifact |
| 新 `bootstrap-js-stages.eli`：`bootstrapJsStages` | `{stage0ManifestPath, sourceRoot, outputRoot, signal}` → `{manifestPath, stage3MetadataPath}` | 认证 stage0，捕获/冻结输入，顺序生成三代；每代只开一个 JS producer，保存后关闭；错误原值保留、当代标 failed |
| 同文件：`compareJsFixedPoint` | `{stage2, stage3, sourceIdentity}` → 固定点收据 | 预先定义的全部产品文件及 IR 逐项精确比较；缺文件、额外文件、篡改、输入变化均失败 |
| 新 `stage3-targets.eli`：`runStage3Targets` | `{stage3MetadataPath, bootstrapManifestPath, corpusRecordsPath, outputRoot, nativeTarget, signal}` → 三目标汇总路径 | 先认证固定点与 stage3；固定 `host="javascript"`，只对三 target 调既有 `runCompilerMatrixCell`；独立 session、同一语料，完整收集可独立得到的失败 |

局部状态不得隐藏在全局变量中：`sources` 是本批唯一冻结图；`previousArtifact`
初值为认证 stage0；`stageIndex` 顺序为 1/2/3；`stages` 只保小记录/路径；
`producer` 打开后在 finally 关闭，关闭失败另记且不得覆盖 false/undefined
等原始异常。每代完成后不保留上一代的大型 IR/debug 对象图。

引导收据格式为 `eliscript-js-bootstrap` v1，包含：

```text
status: created | building | failed | cancelled | accepted
seedSourceIdentity: 原初 .el 与引导源的 SHA 清单
formalSourceIdentity: 冻结正式源码、runtime/literal 与配置身份
stages[]:
  stage: 0 | 1 | 2 | 3
  host: javascript
  target: javascript
  producer: emacs-lisp | stage0 | stage1 | stage2
  status: pending | building | built | failed | cancelled
  metadataPath, inputIdentity, productIdentity, error
fixedPoint:
  from: 2
  to: 3
  status: pending | identical | different | failed
  comparisonPath
finalAcceptance:
  status: pending | running | passed | failed
  targets: javascript, wasm, native
  reportPath
```

路径存仓库/批目录相对路径，身份来自真实文件和实际 producer，不能手填。
已有 IR 检查点和归档能力继续使用；失败只记录事实，不修改测量、源码 SHA、
产物 SHA、golden 或原错误。有效的已完成阶段可在同一冻结输入内复用，
源码/选项/必需文件身份改变即判失效，不盲目重新运行未变失败。

stage0 每个模块的发射调用固定为以下形态；变量来自已冻结的模块记录，
不从输出目录拼出逻辑文件名：

```elisp
(eliscript-compile-string-with-source-map
 source relative-filename module-id relative-filename)
```

### 3.3 目标源码树和数据流

```text
compiler/*.el                                   保留：原初源码，只要求 JS
bootstrap/compiler/*.eli                        保留：唯一正式前端源码
bootstrap/backends/*.eli                        保留：正式三目标后端
bootstrap/host/*.eli                            保留/必要迁移：正式协议与 CLI
bootstrap/runtime/memory.eli                     D05：只修真实目标程序阻塞
tools/backends/bootstrap.el                     D01：直接 stage0 与新入口
tools/backends/eliscript/bootstrap-js-stages.eli  D02/D03：新增 JS 三段自举
tools/backends/eliscript/stage3-targets.eli       D04：新增最终三输出薄调度
tools/backends/eliscript/compiler-matrix.eli      复用 runCompilerMatrixCell
tests/eliscript/bootstrap-js-stages.eli          D02/D03：完整引导/固定点 B
tests/eliscript/stage3-targets.eli                D04：同源三输出 B
tests/eliscript/managed-*.eli                    D05：保留/补齐必要运行时 B
tests/eliscript/compiler-*.eli                   D05：保留原语言/项目/工具 B
AGENTS.md                                       D00：当前目标与唯一入口
Makefile、现有 CI 配置、契约与发布配置             D06–D08：统一接线
dist/bootstrap-release/                         生成/忽略，不提交 Git
  stage0/ stage1/ stage2/ stage3/
  sources/ bootstrap.json fixed-point.json targets/
```

```mermaid
flowchart LR
  E["保留：维护 Emacs Lisp 原初源码"] --> S0["D01：直接生成 JS stage0"]
  F["同一份冻结正式 Eli 源码"] --> S0
  S0 --> S1["D03：JS stage1"]
  S1 --> S2["D03：JS stage2"]
  S2 --> S3["D03：JS stage3"]
  F --> S1
  F --> S2
  F --> S3
  S2 --> EQ["stage2 与 stage3 完整产物相同"]
  S3 --> EQ
  EQ --> T["D04：仅最终 stage3"]
  C["一份冻结测试源码与输入"] --> T
  T --> J["JS 产物实际执行"]
  T --> W["WASM 产物实际执行"]
  T --> N["native 产物实际执行"]
  J --> A["同源结果一致与全部必要门禁"]
  W --> A
  N --> A
  A --> R["D08：0.0.2 stage3 正式交付"]
```

## 4. 精确施工差异与接线

| ID | 文件与基线锚点 | 具体变化 | 依赖 / 验收 |
| --- | --- | --- | --- |
| D00 | `AGENTS.md`；本文件新建 | 把当前目标改成 JS stage0–3 + 最终三输出；旧九格只作历史，不能被旧 Goal 自动恢复 | R01–R12 / A01 |
| D01 | `tools/backends/bootstrap.el` L10、L98；`compiler/eliscript.el` L60 | 增加直接 stage0 入口；枚举与 `loadCompilerSources` 相同的 compiler/backends/host `.eli`。按 `(source, relativeFilename, moduleId, relativeFilename)` 调 `eliscript-compile-string-with-source-map`，保存原 emission；不用输出目录相关的 compile-file map 路径。生成 stage0 manifest；不调用旧 seed-product 替代 Emacs | D00 / A02 |
| D02 | 新 `tools/backends/eliscript/bootstrap-js-stages.eli`；`bootstrap.el` 现有 tools 映射 | 定义上述输入、manifest 和认证；捕获同一源码图；先写完全部 B；工具由现有语言系统引导，不新增手写 JS launcher。将生成 CLI 映射到 `tools/backends/dist/bootstrap-js-stages.mjs` 并忽略 | D01 / A02–A04 |
| D03 | 同新文件；`compiler-build.eli` 的 `buildIndependentCompiler`；旧 `compiler-bootstrap.mjs` L202/238/453/504/694/827 仅作能力定位 | 调既有认证/归档能力及真实 JS session 三次，输出 stage1/2/3；本轮不走旧 `bootstrapCompilerChain` 或任意旧 seedArtifact 分支。只检查 stage2==stage3 必要固定点；输入/产物错立即记失败，无 seed fallback。若必须改旧外语言能力，把被改能力迁到 Eli，不扩写旧 JS | D02 / A03、A04 |
| D04 | 新 `tools/backends/eliscript/stage3-targets.eli`；`compiler-matrix.eli` L708；`compiler-corpus.eli` L311 | 固定 JS stage3 metadata，冻结一份 corpus，三个 target 直接调用 `runCompilerMatrixCell`；汇总原执行/IR/诊断/map/来源证据。不得调用会先构建二进制编译器的 `record-grid --cell` 或默认九格 `buildCompilerMatrix` | D03 / A05 |
| D05 | `bootstrap/runtime/memory.eli` module/namespace helpers；对应 `managed-project-*`、`wasm-managed-sequence-data`、literal、Math/Unicode 测试及相关 `.eli`/`.el` | 以现存真实失败为输入，成批解决 stage3 三目标实际阻塞。已有初始化拆帧、slab 和源码身份修复仅是实现，不默认验收；保原低槽、首错、GC、完整标准库/项目/宏和随机差分。不得因新范围缩小而把仍失败的目标程序语义丢掉 | D04 / A05、A06 |
| D06 | `Makefile` L8/10/359/391；`bootstrap.el` tests 映射；`.gitignore`；现有 compatibility/browser CI 与其生成源 | 增加 `bootstrap-release` 和 `check-stage3-targets` 入口，接新 Eli 测试。默认验收编译器宿主只有 JS。旧宿主专用测试列明取消，不跳过同文件里的产品语义；YAML 若为生成物，改其维护源，不手改生成结果。需要改外语言工作流生成器时迁移受影响能力到 Eli/El | D02–D05 / A06、A07 |
| D07 | 现有 CLI、Worker、虚拟项目/浏览器入口及包内入口，正式 compiler graph 的 host 模块 | 正式使用和测试都明确指向 stage3。保原 CLI/Worker/虚拟项目协议；涉及手写 `bootstrap/host/eliscript-cli.mjs` 等入口修改时迁对应 `.eli`，旧实现只作字节不变历史兼容，不新增 JS。浏览器仍加载 JS stage3，能生成和执行 JS/WASM，不需要 WASM 编译器 | D03、D06 / A06、A07 |
| D08 | `package.json`、版本维护源、现有打包/发布入口；本文件交付清单 | 功能候选闭合后更新 0.0.2；重新冻结受版本改动影响的正式输入，重建 stage0–3 并验证最终固定点/包/安装。stage3 为正式产物；npm 包可包含生成 JS，Git 不可提交中间产物。签名提交、签名标签、推送、CI、发布和读回逐项完成 | A02–A07 真实成立 / A08 |

D05 本轮 Unicode 显式 JS 运行档位（不增加原语料分母）：

- [x] A：原 JS 15.1/16 profile 调用宿主 17 数据，实际全 scalar hash 不同；保持原 fixture、版本、hash 与 sigma 预期。默认 JS 全局互操作不改。
- [x] B：`tests/eliscript/unicode-case.eli` 写齐默认不安装、真实 String identity/name/length/不可构造/descriptor、generic receiver 与 Symbol 拒绝、ToString 首错、UTF16/三码点展开/FinalSigma、真实用户覆盖/delete、三版本全 scalar 原 hash，以及错误 selected 程序必须拒绝。尚未运行。
- [x] C：公开 `runtime/unicode-case.eli` 的 `installUnicodeCaseProfile(version, realm)`；纯 Eli host 在独立进程显式安装后加载实际 selected JS 用户程序。数据由维护中的 `.el` 生成器从 `memory.eli` 唯一 Unicode 区抽出 24 个纯版本函数，忽略的 `.eli/.mjs` 数据不是另一份维护表；binary Unicode 路线不变。
- [ ] D：统一生成后验证上述 B，再以最终 stage3 原同源三目标语料执行实际 profile 记录；独立进程的成功必须来自选定产物调用 String 方法，不能用 helper 输出代替。原 full-scalar 与 sigma hash 任一不同仍失败，未经实际执行不得填写 A05/A06 通过。

以上新入口的最终命令约定为：

```text
make bootstrap-release
make check-stage3-targets
make byte-compile
ELISCRIPT_SEQUENCE_FUNCTIONAL_RUNTIME_PROFILE=small ELISCRIPT_DEFER_PERFORMANCE_ACCEPTANCE=1 make --assume-old=bootstrap-backends test
make check-browsers
```

这些入口已实现；D 阶段按当前冻结批次统一执行。`--assume-old` 仅复用
首条命令已完成的工具生成，不跳过测试。独立 `make test` 仍保留原构建步骤。
Emacs/Node/Bun 的位置由现有变量和环境确定，文档和代码不硬编码本机绝对路径。
CLI 配置只接受 JS compiler host；三目标的 target 参数仍保持原来三种取值。

## 5. 大开大合的施工顺序、并行和工作量

严格 A→B→C→D：全部精确设计完成；全部测试和 BDD 用例写齐但不运行；
全部生产实现及接线完成；最后才统一构建、测试、审核、验收。
不能把“每切片 TDD”解释成中途 Red/Green 试跑，也不能在每完成一个文件后
重复局部验收。最终收集完整可独立得到的失败，再合成修复批次；仅实际改变
或受影响的内容复验，不重跑已通过且未受影响的能力。

### 5.1 完整工作量表

此表覆盖新目标全部工作；旧 1220 分母和九格百分比不再适用。
这是本次收尾目标的清单，不是把整个语言项目过去的成果归零。

| 项目 | 权重 | 施工内容 | 当前起点 | 验收 |
| --- | ---: | --- | --- | --- |
| P01 | 5 | D00：最终规格、施工手册、Goal 和当前入口 | 本次编写；不启动新 Goal | A01 |
| P02 | 15 | D01/D02：Emacs 直接 stage0、来源身份与入口 | 原初编译器已存在，新 stage0 接线待做 | A02 |
| P03 | 15 | D03：JS stage1/2/3、完整固定点与失败恢复 | 可复用旧 JS 固定点能力，新阶段调度待做 | A03、A04 |
| P04 | 10 | 全范围 B：引导/调度/篡改/取消/资源/BDD 用例一次写齐 | 大量语义测试已存在；新阶段用例待补 | A02–A06 |
| P05 | 20 | D04/D05：仅 stage3 的同源三输出及真实阻塞修复 | 三后端/语料/执行器已有；当前仍有真实失败 | A05 |
| P06 | 10 | D06/D07：默认入口、CLI/浏览器/包与生成物接线 | 已有功能复用，最终 stage3 身份接线待做 | A06、A07 |
| P07 | 10 | 最后集中本地、严格字节编译、浏览器和对应提交 CI | 现有门禁保留，不能用历史绿代替本轮 | A06、A07 |
| P08 | 15 | D08：0.0.2 正式 stage3、签名交付、发布和善后 | 未完成，不提前升级/打标签/发布 | A08 |
| 合计 | 100 | 所有本次必要工作 | 取消的编译器二进制宿主不在分母内 | |

汇报各项的实现 I、用例写齐 B、正式验收 A、交付 D 四个独立状态。

当前执行索引（C72 证据与下一修复批严格分开；此表替代上表的“当前起点”历史文字）：

| 项目 | 施工与用例 | 验收结果及下一增量 |
| --- | --- | --- |
| P01 | 当前范围、精确施工、原语义、失败计数和 bulk 顺序已落实 | 通过：旧编译器二进制宿主未恢复，仍按本计划推进 |
| P02 | Emacs 完整 stage0、来源冻结和引导接线已实现，用例已写齐 | C72 通过：真实 Emacs 入口已完成；下一候选仍重验对应来源 |
| P03 | JS stage1/2/3、完整产品比较、人工复核入口已实现，用例已写齐 | C72 通过：完整 313 产品固定点与独立复核；不能借给改动后的新候选 |
| P04 | 原有效 B 全部保留复用；新阻塞对应 B 先补齐，随后才写其 C | 验收失败：全量原门禁首轮失败保留，258 文件继续原续验 |
| P05 | 三输出接线和已知运行时修复已写；JS 列尾新暴露的来源、依赖、oracle 接线并入同一批 | 验收失败：JS 782/795 通过，13/795 失败；其余两列继续按固定分母和真实 outcome 记录 |
| P06 | CLI、包、Pages、来源归档、测试本语言迁移已写；新增 exact Unicode/oracle 路由仍归本项 | 验收失败：受影响原完整入口须在全部新 C 后统一通过 |
| P07 | 原门禁、平台入口、受控监控和新回归已接线 | 验收失败：C72 严格字节编译及 50 项来源设施、251 项 Emacs/Org 已通过，完整 Make 仍失败；不能以部分绿替代 |
| P08 | 发布构建和签名交付流程已有；版本写入明确等待完整功能门槛 | 验收失败：尚无 0.0.2 最终固定点、包安装、签名推送和对应 SHA CI 证据 |

这些权重用于完整验收单元，而不是代码量。当前 C72 已完整通过 P01/P02/P03，
按既有固定权重为 35/100（35%）；其余 65/100 验收失败，部分通过细节须同步报告，
不能把它们误称为 65% 代码尚未编写。下一批尚未验收，不用 C72 通过比例冒充其通过比例。

#### P05 / A05 / A06：显式功能资源档与原容量证据

candidate4 的完整 WASM 采样进一步确认正常 original-program/stdlib
项目未声明 runtime budget 时，host 原默认是 1024 槽、65536 initialBytes、
16777216 maxBytes、auto=0；不能把这一隐式档的容量失败当成功。本合批仅在
显式 `functionalRuntimeProfile=small` 下，对绑定 stable-compatibility 的
正常 seed-program/oracleRequired 项目补现有 small 功能档，逐条保存原默认、
effectiveRuntimeOptions 与 deferred。已有 sequence 的显式延期边界保留；
其它显式低槽、负向/OOM/越界/恢复和 compiler-runtime 档不覆盖。
原始 records/源码/期望/独立 oracle 不变，strict baseline 仍可原命令复现。
二进制发射时同步采用已存在 small 的 memory 声明，避免加载后才扩大预算。

同批 source-map companion 先以原完整认证 sourceAssets/虚拟布局向同一
selected session 请求原 `project-plan`，仅把真实 reachable 源传给原 map
归档流程；不把所有输入标准库强行作为 root，不根据输出倒推期望。
原 module/map SHA、独立原 suite 地图断言和完整 raw source archive 均保留。
本批 B/C 写齐，统一生成/行为验收尚未执行。

同源三输出 Math 兼容能力：原 Node 记录在 `method_description` 读取
不存在的 `f16round`/`sumPrecise` descriptor；Bun 原记录在精确求和
golden 的 `Object.is` 比较失败。原测试的可选 host oracle 有 typeof
guard，完整 corpus 仍要求这两项标准能力，不跳过或改变 golden。
维护源 `runtime/math.eli` 用直接 binary64→binary16 ties-even 和独立
base-2^16 正/负 superaccumulator 实现；后者 135 limbs 覆盖规范最多
2^53−1 个 Number 的完整指数域，最后相减并舍入一次，保留 -0、NaN、
无穷和 IteratorStepValue/IteratorClose 的首错规则。首次模块初始化只在
原 Math 对象定义两个标准 named、length=1、非构造函数，之后真实
getter/赋值/delete 不自动重装，其他 Math 方法不替换。

- [x] B：纯 Eli 数学运行时测试保留独立 BigInt 精确模型、binary16
  边界/双舍入、固定与种子 f64 抵消、30 个 iterator 模式，以及两方法
  getter/receiver/参数次序/删除/重复导入；相同测试也由独立 Bun 执行。
- [x] C：维护 Emacs 两发射器与正式 Eli emitter 同步生成生产 Math
  初始化 import；bootstrap 先直接生成无自依赖的 runtime；其 Eli 源
  作为 `runtime/math.mjs` 正式模块纳入 stage0→3 源/产物完整身份，发布
  runtime 使用认证 stage3 实际模块，原53 literal 闭包不扩大。
- [ ] D：统一生成、固定点、新运行时回归和原完整 Math 记录待验收。

P05 三目标调度接线：正式 `runStage3Targets` 认证并冻结同一 stage3/
完整语料后，在同一父进程中立即启动 JavaScript、WASM、native 三个原
cell，使用 `Promise.all` 等待全部独立结果，不等 JavaScript 全部记录完成
才启动另两目标。父级 `controlled-run` 保持整树 24 GiB 硬限额，不为调度
创建额外 worker/进程；各 cell 原有实际执行、证据和取消能力不变。
`targets` 汇总始终按 JavaScript/WASM/native 排序，原始首错按实际发生
顺序保存（包括 `false`/`undefined`），全部独立结果保存后才抛出首错。
私有、未认证的调度测试接缝可选 `parallelTargets`，缺省串行；正式入口
不接受 caller 替换调度或 cell，固定启用三目标并行。每次从 observer
返回后再次检查取消，尚未实际进入的 cell 不启动，observer 错误不覆盖
执行错误。原 `functionalRuntimeProfile` 透传及 deferred 汇总不变。

- [x] B：新增同时启动/逆序完成仍固定结果顺序、同进程无新增 worker/
  process、全部独立错误与首个 false/undefined、开始前/observer/首 cell
  取消以及 observer 抛错隔离的完整 Eli 回归；原串行与资源回归保留。
- [x] C：提取单目标私有执行函数，正式入口固定并行三个实际 cell。
- [ ] D：统一生成及全部受影响门禁、正式三输出实际验收待执行。

P05 candidate4 checkpoint 的 managed 输入作用域修复：请求中的显式
`entries` 必须传到真实二进制链接器；为 host ESM 保留的其他源模块仍
经过原编译、缓存和 JavaScript 输出流程，但不因此成为 managed 执行根。
`managed-literal-user-import` 在真实 `module-declaration` 容器内递归，
把 canonical runtime 导入连到既有私有 literal 图；普通外部 HTTP provider
与真实 host 能力不删除，原 core/sorted 的 `zeroImports` 断言不变。
HTTP 源的 `instance?` 使用现有 Eli Get/Reflect.apply/Boolean 操作，保留
右值对象/可调用拒绝、`@@hasInstance` 一次读取和结果布尔转换；不增加
任意 raw JavaScript 支持。语言 equality/type 正例的 NaN、负零及 frozen
观察改用已有 Eli 字面量/调用；protocol fixture 的 Box 只迁移该用例实际
构造数据的方式，保持命名、原 prototype 可见描述符及协议身份/分派，
不声明新增 JS class、非 new 调用或 subclass 语义。

- [x] B：补真实完整 compiler session 的 entries/显式不可达拒绝/恢复及
  原 JavaScript 模块输出保留；补 wrapped/unwrapped canonical 导入的
  真实 literal 图、不变 IR 和零 host 声明；直接使用实际 HTTP 私有函数
  节点对照独立 JS、WASM/native、auto1/零根与原型异常的回归。
- [x] C：entries 透传、module 容器递归、HTTP 实现及三个正例源迁移。
- [ ] D：尚未生成或运行；原 checkpoint 失败证据不改判。

P08 本轮独立包/浏览器运输补全：`transport/` 自己声明私有 `eliscript`
scope 与真实 Math/maps，保外层自定义包名。既有 Bun browser bundler 从
真实运输入口和已经校验复制的 JS 编译器入口生成单独 browser bundle/maps；
`browserArtifact` 的实际文件 SHA 与原 source/artifact/product provenance
分开记录，原认证 stage3 目录、源码、maps 和原 artifactIdentity 不改。
纯 Eli 浏览器入口仅在省略 manifestURL 时选同目录 derived metadata，显式
URL/取消/原 Worker 操作仍交原 API；Pages 发布的工具 Worker/Browser 也由
同一既有 bundler 形成无 document import map 依赖的运输闭包。

- [x] B/C：原包测试保留全部字节/身份/CLI/原错误，增加 transport scope、
  derived 真 SHA/provenance 与自定义包的真实 Chromium module Worker
  （纯 Eli probe、无 import map、取消 false、坏显式 manifest 拒绝）。
- [ ] D：统一生成与包/Pages/原浏览器门禁待执行；打包派生物不计作
  stage2==stage3 原字节固定点证据。

同批原生互操作修复：`original-program:core-project-{core,utility,
persistent-values,value-text,public}` 的 JavaScript 原 host 从 canonical
sourceRoot 创建原生集合；所选 stdlib 仍须使用同一 provider URL 的协议
Symbol。原测试以 runtime symlink 达到此身份，运输后的完整 hostSources
不应复制出第二份注册表。`prepareCompilerCorpusNativeProviders` 仅对此五项
验证完整 runtime 声明与 sourceRoot 实际文件的逐文件字节/SHA，一旦产物
已经发射 runtime 模块、存在非 canonical runtime 目录或同名本地 package
则拒绝；验证后只过滤执行私有副本的 runtime sidecars，原记录、归档、
23 模块、host 和 expected 不变。既有 aliases/package 路由复用 canonical
provider，execution/outcome 保存真实 provider 来源和逐文件哈希。

- [x] B：原 core-project corpus 回归追加真实 selected transient 与 canonical
  PersistentVector 互操作、原声明不变、provider 真 SHA、篡改/缺项/重复/
  emitted-provider 冲突拒绝、非该五项及非 JS 路径不改变。
- [x] C：execution 私有路由和 matrix 成功/失败 outcome 证据接线；不改
  legacy 运输实现或生产库算法。
- [ ] D：统一生成并运行受影响回归与完整原记录，尚未验收。

同轮 sequence 运输阻塞：relational-set 的两个 host 在独立参考中将原生
literal vector 交给另一份 portable protocol；standard-identities 的 Node
host 在 data URL 中导入绝对文件路径；project-entry 的 Bun host 未向
namespace loader 第二参数提供已加载的真实 namespace。仅四条明确
sequence native-interop 记录沿原 suite 的 Reader import span 将真实
canonical runtime 相对引用运输为 `eliscript/runtime/*`，其 runtime 源由
原 literal graph 提供，不再作为第二份项目模块发射。raw records/fixtures
和哈希不变，request/outcome 保存源码与运输源码 SHA 及真实 import 边。
JS 复用已认证 canonical provider；独立 Seed 仍编译同一运输图。

- [x] B：真实 namespace 第二参/身份回归、四条原 sequence source/SHA/
  导入边/原始记录不变回归；原所有协议 Symbol 方向与 relational-set
  完整 host 观察断言保留。
- [x] C：project-entry 真实 namespace + Map；standard-identities 的原完整
  断言迁入已绑定 Eli host，选中模块与 native providers 均通过真实
  namespace 取值；sequence 请求/私有执行图按原 import 路由，保原门槛。
- [ ] D：尚未统一生成/运行，不把旧四个真实失败记为修复通过。

literal nth 的 small 档真实功能失败继续 OPEN：现有原日志已证明失败在
`runtime.project.prepare()`，尚未执行 nth，live 5364/131072，不是原
1024 容量失败。`value-module-abort` 会清除 active slab 根；仅凭返回的
ELI3/TypeError 不足以认定 nth 或 GC 语义错误。本批不猜改该生产语义。

- [x] B：existing allocator detail helper 的可选 descriptor 回归覆盖无 slab、
  唯一真实七字段 refs slab、多个匹配不归因、坏 descriptor/访问器拒绝、
  默认输出形状和原快照/GC/managed 状态不变。
- [x] C：`readManagedAllocatorValueCounts(runtime, descriptor)` 在已有扫描中
  检查 live kind8 的完整声明标志；仅唯一匹配时给出有界 first-uninitialized
  prepared binding index/name。原 nth helper 仅在实际 TypeError 后、原诊断
  collect 前读取，诊断失败不替换原首错。默认 snapshot/counts API 不变。
- [ ] D：统一生成后以现有 `ELISCRIPT_PROJECT_ALLOCATOR_DIAGNOSTIC=1` 的
  原 small 输入一次取得 initializer；nth 功能尚未通过，不冒称已修复。

原完整 sequence 用户程序的 1024 槽记录、预算、源字节、ID、独立 Seed
oracle 及失败收据全部保留，不把它们改写成容量通过。按功能优先决定，
最终 stage3 调度可显式传 `functionalRuntimeProfile: "small"`（CLI 为
`targets --functional-runtime-profile small`）。只有精确绑定原 sequence
suite/fixture、`original-managed:sequence-data*` 的正常完整程序使用已有
`independentCompilerResources({profile:"small"})` 预算；缺省仍运行严格基线。
诊断、负例、OOM、容量恢复和其他程序不覆盖预算。JS/WASM/native 使用
同一显式策略，保原 auto、内存声明、源码、输入、断言及 oracle。
原正向 suite 的功能专用命令显式设置
`ELISCRIPT_SEQUENCE_FUNCTIONAL_RUNTIME_PROFILE=small`；不设置时原
1024 baseline 不变，独立负例/OOM/恢复测试不消费此开关。每次正常
执行的私有 `run.json` 保存两组资源和延期状态，不改 fixture 或原 corpus。

流程为冻结原 corpus 字节 → 按原 record 归档/编译 → 仅私有执行副本选择
功能预算 → 原真实执行及独立 oracle 比较 → 分别保存功能与资源状态。
执行 observation、每条 outcome 和 stage3 汇总记录
`originalRuntimeOptions` / `effectiveRuntimeOptions`，容量状态明确为
`resourceAcceptance: "deferred"`，原 1024 容量仍未验收；功能等价不代表
容量或性能通过。不得修改原 corpus records 文件或它的 SHA。

- [x] B：纯 Eli 回归覆盖显式/缺省配置、三目标同档、原字节/IEEE/ID不变、
  非正常程序不覆盖、未知档拒绝及报告中功能/容量分离。
- [x] C：execution 私有资源包装、matrix outcome、stage3 调度/汇总及 CLI
  接线完整；不改 legacy 实现、原输入或模型。
- [ ] D：先保留严格基线终态，再用显式 small 跑原完整功能；只按实际
  功能结果填写 A05/A06，1024 容量仍标 DEFERRED / NOT ACCEPTED。
每个状态只按对应清单的完成项比例计，不按文件数、代码行数或隐藏计算量计。
收尾完成度统一计算为 `Σ 权重 × (0.5I + 0.2B + 0.2A + 0.1D)`；同时展示
stage0–3 的实际状态和 stage3 三目标通过数。启动施工时根据当前证据登记
初始值，不把“已有实现”冒充“已验收”，也不把旧 0/9 当新目标的全部进度。
列不进本表的工作不得擅自开展；真实新增主线缺口必须先补原表及验收映射。

### 5.2 施工清单：代码写完才勾，不能当作验收通过

本次执行接线补充（沿 D06/D07，不增加交付范围）：

包命令分发入口也使用 Eli：`tools/backends/eliscript/package-cli-entry.eli`
生成 `bootstrap/host/eliscript-cli.mjs`，原入口原样保存在 legacy 文件。
保留全部七个命令、基于入口位置定位包、调用名称、现有环境变量优先级、
参数及异步错误退出；新 `eliscript-compiler` 路由仍使用认证 stage3。
Emacs 引导器只为这个可执行产物添加 shebang、相应 Source Map 行偏移和
可执行权限。生成入口 ignored/untracked，不作为第三份维护实现。
现有 package-surface 七命令实际执行和 package-install 三输出用例作为 B；
本条 C 完成后与全批统一 D，不单独启动包构建或测试。

同一 Emacs 前置步骤从维护中的 `stdlib/core/{protocol,text,object}.eli`
生成 `runtime/core/*-impl.mjs` 及 maps，替代对 Git 中生成物的依赖；
源与输出显式配对，并在首次启动 JS 工具前全部生成。这三项生成物
ignored/untracked，原 runtime 手写外壳和未受影响的 legacy 实现保留。
B 复用现有 source-only 引导及严格逐字节、逐 map 的生成一致性用例，
不得靠保留编译生成物于 Git 中满足干净 checkout。

统一功能门禁复用本轮已经真实执行并通过引导的生成批次：完成
`bootstrap-release`、发布准备及三输出后，执行原 `make test` 的全部测试
与契约，仅以 `--assume-old=bootstrap-backends` 禁止重复生成前置工具。
这不跳过任何测试或改动默认独立 `make test`；避免再次用早期 Emacs
产物覆盖刚安装的 stage3 runtime，以及在验收中混合两个生成批次。
门禁前后保留相同 source/product 身份；源码改变时不能使用旧冻结批次。

同批 Math 运行时引入真实 package import 后，原 numeric reference helper
须保留实际发射文件的 URL。`wasm-managed-numeric-shared.eli:loadReference`
先写原字节，再以 canonical path 取得真实 namespace，作为 loader 第二参
Map 提供；不再把这份程序改为无法解析 package 的 data URL。B 增加真实
Math import、namespace identity、原文件字节及两项精确运算结果回归。
此 B/C 已写，随全批统一 D，原独立参考程序及算法断言不变。

同批原 sequence 在公开 small 档的 `ELI-RT0001` 已定位为 host 解码 ABI
错配：`decodeLiteralProtocol` 对已确认 kind18 的协议方法读取真实 `slot`，
却调用仅接收 kind13 的 raw `value-object-get`。这不是句柄已失效的证据。
新增 `managed-host.eli` 生成原 host 入口，原字节实现保留为
`managed-host-legacy.mjs`。只向 legacy host 传入私有 exports descriptors
副本：kind18 的该读取调用既有 `value-property-get(heap, value, key, 0)`，
其他 kind 仍调用原 Object ABI；真实 WASM/native exports 与其拒绝合同不变。
三个未改导出保持原函数 identity，factory 用三个 required 参数及 rest
逐项转发，保省略、显式 undefined 与 null 的原默认/拒绝行为。

- [x] B：真实发射函数的 Symbol slot、独立 JS 参考、WASM/native 读取、
  GC 身份、getter 抛 false、caller frame 和完全释放回归已写；raw Object
  Get 对真实函数仍拒绝，原完整 sequence 继续检验实际协议初始化。
- [x] C：纯 Eli bridge、原字节 legacy、生成映射/ignore，以及 sequence 和
  project-entry 的 bridge 源/生成入口/legacy 三份真实 SHA sourceAssets 已写。
  包与页面运输沿原清单携带 legacy，不另造 ABI 或错误放行规则。
- [ ] D：统一生成后执行上述新回归及原完整 sequence；当前不宣称功能已过。

Math 支持作为正式普通模块 `{id:"runtime/math.mjs",
filename:"runtime/math.eli"}` 纳入 Emacs stage0 与 `loadCompilerSources`
同一源码清单；沿现有 modules 产品归档、maps/IR 及固定点比较，不扩展
原 53 项 literal 图。准备发布包时，既复制到公开 `dist/runtime` 视图，也
将真实 stage3 math 模块复制到 package runtime 路径，不能继续发布 Emacs
早期引导产物。`check-stage3-targets` 先完成包准备，再启动新的 Node 验收
进程并捕获完整资产；CLI 执行入口检查该运行时确为选定 stage3 的原字节。
干净包安装共享程序增加直接 binary16 舍入、精确抵消和三目标相同模型；
准备阶段逐字节检查真实 runtime 与 stage3 产品。B/C 已写，D 尚未运行。

- 新 `tools/backends/eliscript/release-cli.eli` 生成
  `tools/backends/dist/release-cli.mjs`，导出
  `runReleaseCLI(args, io)`、`resolveReleaseCompiler(options)`、
  `renderReleaseCLIError(error, options)`；最终编译器认证复用
  `authenticateStage3Targets`，不为 CLI 加载整份语料。
- 新 `compiler-cli-entry.eli` 生成原公共 CLI 路径，转发上述入口；旧 CLI
  未改能力保留原字节在 `compiler-cli-legacy.mjs`，只用于既有编译/项目/包传输。
  新默认入口认证 JS stage3，旧九格及二进制宿主命令明确拒绝。
- 新 `tools/ci/release-workflow.eli` 生成
  `tools/ci/dist/compiler-release.mjs`，导出 `renderCompilerReleaseWorkflow(matrix)`；
  新工作流 `.github/workflows/compiler-release.yml` 在声明的两个 ARM64 平台
  执行本次 JS 自举和最终三输出，保留现有通用/浏览器工作流及其原门禁。
- 新 `tests/eliscript/bootstrap-release-integration.eli` 覆盖上述 CLI、CI 和包接线。
  这些测试已编写，尚未执行；B 全部写齐后才统一转 C。

- [x] C00：本文件明确 R01–R12、新旧范围与 A/B/C/D，建立唯一入口。
- [x] C01：D01 的 Emacs 直接 stage0、manifest 和固定逻辑路径全部写完。
- [x] C02：D02/D03 引导、认证、stage1–3、固定点和错误清理代码全部写完。
- [x] C03：T01–T09 及 BDD/阴性/真实执行用例写齐，未运行。
- [x] C04：D04 的 stage3 三目标同源调度与汇总全部写完。
- [x] C05：D05 当前最窄运行时方案已落盘，原语义及资源测试均保留；实际容量失败是否解除待 D 验证，不能宣称已修复。
- [x] C06：D06/D07 的 Make/CI/契约/CLI/浏览器/包/ignore 接线全部完成。
- [ ] C07：A/B/C 全部完成后统一验收；完整收集失败，按根因成批修正。
- [ ] C08：A02–A07 成立后完成版本冻结、最终重建、A08 发布和善后。

新阶段 A 的源码定位已完成；本文档的交付不表示 C01–C08 已实施或验收。
并行只分独立所有权：一组负责 stage0/JS 链，一组负责最终三输出调度，一组
负责共用测试和必要 runtime 缺陷；主协调负责入口/计划/最后统一整合。
阶段有依赖时前向推进，禁止任一协作者提前跑局部测试或旧宿主任务。

#### P06 / A06 / A07：deterministic 生成物的真实 Git 存储合同

本轮 D 发现 `tools/integrity/check.mjs:checkGeneratedMarkerCoverage`
只从 tracked MJS 搜集 marker，再与四个 deterministic 输出精确比较；
这会强迫生成物进入 Git，与本次只维护 Eli/El 源码的交付规则冲突。
原始 dependency、benchmark source/history、derived workflow/API 与逐字节
再生校验仍全部保留，不能用虚构 tracked 列表绕过。

本批源码树与调用差异：

```text
tools/integrity/eliscript/check.eli -> tools/integrity/check.mjs (ignored)
  -> check-legacy.mjs (原实现字节不变：依赖/benchmark/错误类型)
tests/eliscript/repository-integrity.eli -> tests/repository-integrity.test.mjs (ignored)
  -> repository-integrity-test-legacy.mjs (原八个用例字节不变并实际注册)
```

原流程 `tracked MJS -> marker inventory -> deterministic bytes/maps`
改为 `真实 tracked 集合 + runtime/core、tests/snapshots 的直接文件 inventory
-> marker 与 registry 精确比较 -> source tracked / output+map ignored 且 untracked
-> 同原编译器逐字节再生 JS/maps -> 原 derived / benchmark 校验`。
不扫描 dist，不把 bootstrap 工具生成物混入原四项 deterministic registry。
公开错误类、依赖和历史校验函数仍是原函数身份；仅迁移 generated-artifact
编排、必要私有校验和 CLI，避免旧模块词法调用绕过新 marker 规则。

- [x] A：限定上述函数及原 registry 的两个输出目录；保真实 tracked 集合和原错误。
- [x] B：原八例仍运行；新增四例涵盖真实 Git ignored/untracked 输出、漏登记或缺 marker、
  tracked output/map、未跟踪源码、缺失 ignore，以及 stale JS/map 和缺文件精确拒绝。
- [x] C：纯 Eli facade/CLI 与同名测试入口完成；原两份 MJS 仅按字节改名，
  snapshot 由维护中的 Eli fixture 生成，映射/ignore 由根代理统一接线。
- [ ] D：统一生成与受影响完整测试待执行；源码完成不等于这些门禁已通过。

#### P06 / A06：混合测试套件的精确最终功能 scope

原 `tools/testing/file-workers.mjs` 只按文件分片/运行，不能在两个混合文件
保留用户程序测试的同时排除已取消的编译器二进制宿主任务。原文件及其所有
测试正文保持原字节，增加纯 Eli `tools/testing/final-functional-scope.eli`
生成同目录 MJS，作为 Make 的统一 Bun 测试驱动：

```text
原 CLI 文件参数 -> parseTestFileArgs / partitionTestFiles
  -> 两个 mixed suite 的完整真实 SHA 与精确 title 展开绑定
  -> 普通连续文件组：原 runTestFiles（原 monitor 与并发）
  -> mixed suite：原 supervisor + Bun --smol test + 精确负向 title pattern
  -> 完整 sequence：独立 Bun --smol test（外层受控 build 24GiB，原用例时限）
  -> 实际退出/未启动文件 + 逐条 cancelled 证据归档
```

取消名单固定为 28 项：`compiler-package-session` 的 `packagedWasm` 五项，
`encodedCompiler` 中仅 wasm/native 两宿主的 `2 + 4 + 16` 个精确展开 title，
以及 `compiler-session-tools` 的完整 managed compiler AggregateError 一项。
每条保存原文件 SHA、title、原展开参数、宿主、取消理由与 `status=cancelled`；
不记录 passed。文件任意字节变化均在启动子进程前拒绝，不能按宽泛名字扩大取消。
JS 编译器组、小型 sourceObserverPackage WASM/native、实际用户程序发射与
所有正常功能仍执行。driver 继承现有正式 stage3 package/session 环境参数，
不新增 JS fixture，也不更改原 setup、输入、断言或用例时限。

- [x] A：上述 exact 28 项、原 SHA/展开组、原 runner/supervisor 接口与独立
  sequence 的外层资源边界已列清；不移植资源监控框架。
- [x] B：新增五项纯 Eli 回归，覆盖精确取消及 small WASM 不匹配、同名篡改拒绝、
  原分片/顺序/环境/失败与 cancelled 分离，以及真实小 Eli 子进程输出/退出。
  其中延迟 supervisor ready 的取消回归保留原 SIGINT/SIGTERM 退出码，断言
  suite 未启动、仅关闭所属 guard，并将该文件如实保留在 unstarted。
- [x] C：新 driver/test 源已写齐；两份原混合 MJS 无字节修改，根代理接
  Bootstrap/ignore/Make。信号只转发当前子进程或原 supervisor，整树回收归
  原受控执行器，不新建 detached 任务或全局杀进程操作。
- [ ] D：本批统一生成与回归尚未执行；仍须实际完整功能门禁和原始 scope 归档。

## 6. 测试、BDD 和最后逐条验收

### 6.1 B 阶段先写齐的用例

| ID | 给定 / 当 / 则（含拒绝和边界） |
| --- | --- |
| T01 原初来源 | 给定只含 `.el` / `.eli` 源码和声明依赖的检出，执行 Emacs 引导，则真实生成 stage0；没有旧 compiler artifact 仍可引导；替换 seed 来源、缺模块、源/产物 SHA 变化均明确失败 |
| T02 三次自编译 | 给定同一冻结图，stage0→1→2→3 每一条边均使用真实上一 JS 编译器；篡改 stage 编号/producer/输入、伪称成功或缺产物不能被接受；不调用二进制 compiler host |
| T03 固定点 | stage2/3 原始产品文件集、JS/map/宏来源/IR/必需数据全部相等；单字节、额外/缺失文件、负零、孤立代理码元、不同逻辑路径和源身份变化均可被发现；不靠过滤差异通过 |
| T04 失败和资源 | 编译抛对象/false/undefined、取消、文件写失败、坏 manifest、关闭异常时保首错与已完成阶段；取消后无本任务遗留进程；不把取消/未运行写为成功 |
| T05 同源三输出 | 同一个 stage3、同一个语料清单/SHA、同一源码/输入逐 target 生成真实产物并执行；拒绝替换某个 target 的算法/fixture、旧 JS 对照或预计算结果；源码、目标及执行证据完整绑定 |
| T06 语义和运行时 | 完整既有语言/标准库/宏/项目/异常/async/诊断语料，IEEE 精确值、Unicode/非法编码、别名/求值次序、递归/ABI、随机差分、GC/越界/寿命/原容量失败恢复；保留当前真实失败样本 |
| T07 唯一正式入口 | CLI/Worker/浏览器和发布包加载的确是 stage3；Node/Bun 和声明平台运行；浏览器实际编译和执行 JS/WASM；不把下载/加载 WASM 编译器作为前提 |
| T08 共用测试与门禁 | 三目标消费同一份代码；目标特有部分只为真实执行/IO/ABI适配，不复制语言算法。原初 `.el` 的 JS 回归保留；stage1/2 不增加三目标重复验收；仅取消宿主专用项，不删除仍有效的语言/产物用例 |
| T09 发布 | 从最终 0.0.2 冻结源引导得到 stage3，stage2==3；包文件/运行依赖/摘要/平台标记和干净目录安装正确；不可把 stage0/1/2 或旧产物发布为正式 stage3 |

语料只维护一套。当前 794 条作为清单盘点起点，新的必要回归并入同一份
有效清单；只因用户明确取消的 compiler host 专用条目可记“取消”，须列出
ID 和理由，不能因为某个目标失败就减少正向语义覆盖。冻结后的三个目标
必须使用相同有效用例 ID 集及源字节；独立 oracle 保留实际原实现/模型。
跨目标错误的比较使用原语义/结构化诊断合同，不比较引擎自己的 stack 文本。

#### D06 旧编译器宿主门禁取消映射

本批精确修正 A05 的一项重复执行范围：
`original-program:compiler-cli-bootstrap-generations` 原 recipe 声明
`execution.compilerGenerations`，构建三个完整 selected-target successor，
再打开其实际编译器宿主。原分类已在 WASM/native 输出目标排除此能力；
遗漏的是 JavaScript 输出目标仍重复执行旧完整三代。现将同一完整 recipe
在三个输出目标中一致移往 `make test` 保留的
`tests/bootstrap-compiler.test.mjs` 原 JS 功能门禁，不作为 stage3 用户程序
输出验收的一条。新正式 stage0→1→2→3 与 stage2==stage3 门槛保持不变。

移动只匹配该 exact ID、原 suite/fixture/host、十三模块、原覆盖声明、
setup 来源与全部原 generation 合同（count/producer/target/sourceMaps/
manifest/companions/fixedPoint）。原记录、源码、coverage 和 corpus hash
不改；selection 保留 raw ID、来源 SHA、原 coverage、原 gate 文件及
`gateVerification: pending`，不把移动记为通过。仅撞名、改合同或普通
用户程序不匹配；其他原 binary-host cancellation 规则不变。

- [x] B：真实原 recipe 三目标分类、原 JS gate 仍在、来源/coverage 不变，
  各合同字段伪造与同名普通用户程序不误迁的 Eli 用例已写，尚未运行。
- [x] C：`compiler-matrix.eli:stage3-original-js-generations-p`、
  `stage3-compiler-host-reason`、`classifyStage3Corpus` 精确接线已完成。
- [ ] D：统一生成与原 stage3-targets 文件验收待执行；原完整输出 run 的
  中断与已保存前缀证据保持原状，本条不恢复或改写旧 outcome。

仅下表的宿主专用文件从 `Makefile test-core` 的执行清单移除。原文件、
全部断言、原超时与历史证据保留；取消不是通过。用户程序的 WASM/native
发射、执行、运行时、ABI 和恢复门禁继续保留。

| 取消 ID / 原文件或标题 | 精确原因 |
| --- | --- |
| `tests/wasm-compiler-modules.test.mjs` 全文件（完整 symbol/syntax 编为 WASM 的三项） | 验证正式编译器模块作为 WASM 宿主运行 |
| `tests/wasm-compiler-candidate-smoke.test.mjs`：`candidate whole 13-module zero-import WASM compiler compiles and executes one small add program within its fixed budget` | 完整 WASM 编译器初始化及其输出候选 |
| `tests/wasm-compiler-backends.test.mjs` 全文件（WASM output backend、optimizer、native output backend 三项） | 将编译器后端本身编为 WASM，并由该二进制后端发射产品 |
| `tests/wasm-managed-compiler.test.mjs` 全文件（完整 managed backend/linker 两项） | managed 编译器后端及链接器本身在 WASM 内执行 |
| `tests/compiler-producer-stages.test.mjs` 全文件（五项阶段根/错误/observer 及 native 子进程） | beforeAll 仅接受 WASM/native producer；操作其托管 Reader/expand/analyze/lower/IR 根 |
| `tests/wasm-compiler-ir-json-errors.test.mjs`：`malformed canonical IR JSON has a stable outer diagnostic and preserves the actual parse error as a non-enumerable cause` | 调用 WASM 宿主内完整 IR 编译器的 deserialize API；JS IR/JSON 诊断与用户程序异常门禁保留 |
| `tests/native-compiler-modules.test.mjs` 全文件 | 完整 Reader/formatter/symbol/syntax 模块的 native 宿主及对应 WASM 对照 |
| `tests/native-compiler-ir-lower-source-map.test.mjs` 全文件 | 完整 IR/lower/SourceMap 模块的 native 宿主、容量、陷阱及二进制固定点 |
| `tests/native-compiler-runtime.test.mjs` 全文件 | 整个编译器以 native/WASM 运行，包括最后一项同时比较两种编译器二进制的代际对照 |

下列是混合文件。旧文件和原 locator 保留，旧入口从 Make 清单移除；原有效
能力迁入 `tests/eliscript/compiler-host-scope.eli`，生成的 Node 门禁为
`tests/compiler-host-scope-selfhosted.test.mjs`。这是真实源码迁移，尚待集中
生成和行为验收，不是旧用例已经通过。新 before 仅加载 JS 前端及目标程序
运行时；不通过标题筛选去触发原来的二进制编译器 beforeAll。

| 混合文件 | 必须保留的具体非宿主能力 |
| --- | --- |
| `tests/independent-compiler-producers.test.mjs` | `producer IR wire preserves negative zero and the original JSON object omissions array holes and source property order`、`producer profiles keep the original default budget distinct from the explicit full-runtime candidate`、`compiler teardown closes a native adapter on success and every cleanup failure`；其余 numeric/managed/runtime-ir/runtime-stages 候选仅为二进制编译器宿主 |
| `tests/wasm-compiler-reader.test.mjs` | `reader diagnostics preserve original template ToString hint and ordered reads independently of mutable Array.join`、`reader diagnostics capture the live Error constructor before converting message fields and preserve thrown identity`，以及公共 Seed/JS 代际 JS/maps 原断言 |
| `tests/wasm-compiler-analyzer.test.mjs` | 三项原 JS diagnostic helper 的 getter/转换顺序、arrow/constructor/原值身份；公共 Seed/JS 代际中不依赖二进制宿主的原断言 |
| `tests/wasm-compiler-formatter.test.mjs`、`wasm-compiler-expander.test.mjs`、`wasm-compiler-project.test.mjs`、`wasm-compiler-entry.test.mjs` | 真实 JS portable diagnostic helper、Error 捕获/转换/原异常、原请求/源码位置及 Seed/JS 对照；只取消完整模块作为 WASM 宿主的部分 |
| `tests/wasm-compiler-source-map.test.mjs` | 原 JS cursor 的 iterator/getter/close/强制转换、无额外可变 global lookup，以及公共 Seed/JS 的原 maps/源码对照 |
| `tests/wasm-compiler-emitter.test.mjs` | `generic array prefix spread primitive accepts arbitrary head identity and iterable tail without imports` 及所有 `prefix ...` 用户程序的 UTF16/求值次序/冻结原型/OOM/陷阱/raw ABI 断言；portable locate/boolean helper 和 Seed JS 输出对照 |
| `tests/wasm-compiler-ir-lower.test.mjs` | portable IR schema/JSON/constructor/proxy/IEEE 规则；独立用户程序 Object/Array reflection、realm roots、原型/holes/callbacks、raw ABI/陷阱与 caller 根恢复；只取消整个 IR/lower 作为二进制编译器模块的部分 |
| `tests/wasm-compiler-runtime.test.mjs` | 最后一项 `Seed and three JavaScript compiler-entry generations retain the added small corpus IR maps and diagnostics` 中原 JS/Seed 对照；其余完整 WASM 编译器 API/初始化部分取消 |

迁移保留原用户程序的 prefix 六项与 Object/Array/realm/reflection 八项，
仍使用原零 imports、64/128/256 等容量输入、负零 caller 根、真实 raw ABI、
陷阱和恢复断言。fixture 来自原文件的确切 Eli 输入；独立 Node 执行同一真实
JS 发射文件，冻结原型用独立 VM，未写 JS 模板或替换算法。纯 JS helper
保留 getter、ToPrimitive/Symbol、Error/constructor/setter、arrow、源错误、
JSON/schema、IEEE、Proxy、cursor iterator/close 和可变 global 的原边界。
原混合测试中的二进制编译器字节比较取消；其额外相邻代全相等条件不加入
新链。完整正式源图的 Emacs 引导、JS/maps/IR 和 stage2==stage3 由新 T01–T03
门禁验证，原小程序 Seed JS/map 对照及其余独立 JS 前端回归继续执行。

现有 `compiler-portable-*`、`compiler-source-map-cursor`、
`compiler-fragment-combine`、全部 `wasm-managed-*` 用户程序与 native runtime
门禁未因文件名含 compiler 或 WASM 而删除。新 stage0–stage3 和 stage3 三目标
门禁仍按 T01–T09/A02–A08 完整验收。

### 6.2 D 阶段最终验收清单

下面全部初始为待验；只有逐项实际通过才能勾选。

| ID | 通过 | 输入与操作 | 预期与必须保留的证据 |
| --- | --- | --- | --- |
| A01 | [x] | 读取本文件、AGENTS 和现有入口，核对 R01–R12/任务/用例映射 | 当前 CLI/调度测试实际拒绝旧宿主和九格命令，按唯一新目标执行；旧证据保留 |
| A02 | [x] | D 阶段执行 `make bootstrap-release` 的 stage0 部分 | 当前候选真实通过，见 `dist/bootstrap-candidate7/bootstrap.json`；0.0.2 最终版本冻结仍按 A08 重建 |
| A03 | [x] | 同一次冻结输入依次实际生成 stage1/2/3 | 当前候选三代 JS 全部通过，producer 分别 stage0/1/2，来源与完整产物在同批收据 |
| A04 | [x] | 执行 `compareJsFixedPoint` 及 T03 阴性案例 | 候选 7 的 302 个产品文件逐字节相同；候选 4 完整引导/篡改/失败恢复测试 7/7 已通过；后续源码修复和最终版本冻结仍须重建 |
| A05 | [ ] | 最终 stage3 执行 `make check-stage3-targets STAGE3_FUNCTIONAL_RUNTIME_PROFILE=small`，消费同一冻结有效语料；原预算基线另存 | JS/WASM/native 三项目功能均 actual passed；所有有效用例完整覆盖、执行结果按原模型一致；原 sequence 容量按 P05 明确 deferred，不冒称通过；不能以编译成功/库加载成功代替执行 |
| A06 | [ ] | 同批引导和发布准备完成后，显式 `ELISCRIPT_SEQUENCE_FUNCTIONAL_RUNTIME_PROFILE=small ELISCRIPT_DEFER_PERFORMANCE_ACCEPTANCE=1 make --assume-old=bootstrap-backends test`、严格 `make byte-compile` 及新增 Elisp 工具字节编译，按 T06/T08 检查全部主线用例 | 本轮有效功能全通过，原负向容量/越界/恢复断言和历史报告防伪仍保留；只复用已完成生成，不跳测试；困难性能/完整 sequence 原容量延期明确为 DEFERRED/NOT ACCEPTED，不伪造性能通过 |
| A07 | [ ] | 实际浏览器与声明原生平台 CI，核验 CLI/Worker/包入口和生成物规则 | Chromium/Firefox/WebKit 使用 JS stage3；ARM64 macOS/Linux 声明产物分别在对应执行环境验证。不能在 x64 跳过 native 后汇总成通过；仅发射未执行须标明未验收 |
| A08 | [ ] | 版本更新后最终冻结/固定点/包安装，签名提交、推送和对应 SHA CI 验证 | 正式 stage3 0.0.2；可发布包、摘要、远端提交签名和安装身份正确；无中间产物进 Git；实际 npm 发布或 release tag 不作为新增的隐含前置 |

所有三目标验证由 stage3 执行；先前用其他 producer 得到的局部结果仅用于
定位和避免重复开发，不计 A05。既有独立语义测试继续复用，不能只新增一个
“三目标成功”空壳或小数值样例替代完整有效覆盖。

### 6.3 native 和浏览器的明确范围

native 输出沿已有后端声明的 ARM64 macOS / ARM64 Linux 目标及 ABI 验收。
可以由 JS stage3 交叉生成，但对应平台的实际运行证据不可缺。native 库
经既有 ABI/FFI 调用时必须执行真正生成的机器码，不能用 Bun 打包 JS 冒充。
本次不新增 x86/Windows 后端。浏览器无需执行 native 机器码，也无需加载
WASM 形式的 compiler；已有在线 Worker/虚拟项目协议由 JS stage3 保持。

## 7. 资源、交付和恢复约束

### 当前 D 证据

- 候选 8 隔离源整合本批 29 份维护文件，保候选 7 在途输入不变。
  首次工具生成 run `e78f322bc5cb4feb8078c0f15b8cd736` 因 Pages 新测试
  EOF 失败；修正真实闭合后，全工具生成 run
  `396789f063dd4c488b588c82e7d1759b` exit 0、cleanup complete。
  原 stable/parity generator 分别 run `261066b276fc40a0a62ae818bf57ec7c`
  / `81237f73ee4445a3a6a47e306e4e87b9` exit 0，均从真实源生成身份。
  四阶段 run `fda02f5dc93b4b7baa9ca8f77a497883` exit 2、cleanup complete：
  Emacs stage0 成功，但正式 analyzer 拒绝新增恢复函数的保留前缀。
  保留此严格拒绝；函数改为合法的 raw ABI 名 value-error-restore，下一
  次使用全新输出根，不覆盖失败收据，不放宽 binding-name 规则。

- 候选 7 四阶段引导 run `2126652f0491468b82d66359335b808b`，
  exit 0、cleanup complete，峰值 3767189504 字节；stage0–3 实际完成，
  stage2/3 全部 302 文件原字节相同，产品 SHA 均为
  `0b818729442bd4731e66a79c62b744b9c5069765515af05e8226dc4738fcbbfd`。
  发布视图准备 run `c0cf63a58afb4f3dbe1d918f72675b67` exit 0。
  本轮完整工具生成 run `3230c3badfef40bb8eb939ae766574bf` exit 0。
- 原完整 Emacs ERT run `6038ef0706444de0ae6b231db6459fa4`：
  245/245 passed，exit 0、cleanup complete，峰值 461422592 字节；
  保留独立临时目录、自举 Math 包及所有数字拼写的原精确比较。
  原严格字节编译 run `886b9238fb3b4c52874c6482f8db3acb`，新增五个
  Elisp 工具严格编译 run `bc538c047737498693d2873240961683` 均 exit 0。
- 候选 7 Node 统一批次 run `e80dc398c2e947e382408b161503115a`：
  197 项，190 passed、6 failed、1 skipped，exit 1、cleanup complete。
  失败为独立 compiler-build 产品缺少自身 Math 包解析、包 Worker 新测试
  server 的异步返回接线、外来值读取的普通对象和 Symbol 身份、真实 WASM
  lifecycle 新测试 imports 字段、source-view false 首错用例漏显式启用。
  新增资源认证、产品本地 literal provider、完整包前置三例、原 Math/Unicode、
  20,000 节点镜像及循环与 undefined 首错重试已通过。
- 候选 7 Bun 其他统一批次 run `75d2b339345945809c9ac738a04b29ce`：
  41 项，35 passed、6 failed，exit 1、cleanup complete。保留具体失败：
  foreign nth 与 wire 调用 ELI3、foreignEntry opcode 32 未接入真实运行桥、
  10,000/10,001 深递归 ELI2、Pages Worker IR 字节不一致、新 fuzz 回归的
  Bun 默认 5 秒用例时限。不能把测试适配故障当作语义通过。
- 候选 7 Chromium 实际 stage3 run `287be922e87c4936b0c8128273b017a6`：
  12 passed、19 个已取消 compiler-host 项 skipped、3 failed；其中三目标
  describe 的 beforeAll 失败，后续八个有效目标测试未执行，不能计通过。
  峰值 7231094784 字节，exit 1、cleanup complete。独立 Node 参考产物
  已真实发射，读取回归使用动态 keyword 访问普通对象导致丢失属性；另两个
  competition 回归因 Eli cond 的括号位置把默认分支放入成功分支而抛错。
  维护源修复先写入下一候选，不手改生成页面；同一缺陷不重复启动其它引擎。
- 候选 7 原完整 sequence run `b7cdf4506c7e4d7a8bf50f2ecd36380e`：
  56 项，4 passed、52 failed，exit 1、cleanup complete，峰值
  21876588544 字节，241.52 秒。仍有实际 prepare 的 ELI1，不能将已通过
  的通知队列假对象用例替代真实 WASM/native 准备期执行；进入同批根因修复。
  完整三输出尚在执行，保留冻结输入；后续修复先写独立候选目录，待终态合入。
  A05–A08 仍未通过，版本保持 0.0.1，不宣称正式交付。

- 候选 5 四阶段引导 run `9a6adbf76d5a40fca5cd46be9656c4f2`，
  exit 0/cleanup complete，峰值 3544940544 字节；stage2/3 完整 302 文件
  原字节相同，产品 SHA 均为
  `a0939ef834e54a2b0edeed2200435972dbcd6a2c86e6c6f9a1232f6642e1c47d`。
  stage3 发布视图准备 run `468bd026c2f742cc9bd4ceda5ccd7497` exit 0。
  工具总生成此前因 browser page 源码闭合与 helper 命名停止，不能将
  该总生成写成通过；修正后 page 实际单文件生成 run
  `29b9411343f448f8b918053c49ae979b` exit 0，未替换前端或固定点产物。
- 候选 5 Node 统一批次 run `32821a42729a4320a59fcf6184e66061`：
  179 项，167 passed、11 failed、1 skipped。原有本批 Math、Unicode、
  模块接线、JS stage3 调度及新增精确取消范围用例已通过；失败集中于
  Bun bundle 外置 map 参数、新测试漏 entry/Math 模块清单、provenance
  精确期望未同步，以及 Bun-only fuzz 测试误入 Node 组。
  正确显式路径 Bun 四文件 run `d0365ab8026145c1a6d0726065be34f9`：
  28 项，25 passed、3 failed（同一 bundle 参数、nth prepare ELI1、wire
  新测试未携带 descriptor section）。此前无 `./` 的两次 Bun 调用误作
  名称过滤扫描历史构建目录，只保留失败日志，不算有效语义验收。
- 候选 5 原完整 sequence run `b8f514df1b754b03a45bce0fb782e3ad`：
  56 项，4 passed、52 failed，exit 1/cleanup complete，峰值
  20484407296 字节。WASM/native 均在真实 prepare 中报 ELI1；不是内存
  上限终止，也未到 graph 成功后通知重放。继续定位准备期通知的提前
  解码/重入；不能将错误笼统归因环境或再次原样重试。
  同候选完整三输出随后因 Node 默认约 4 GiB 的 V8 heap limit 终止；
  run `12e91f6a7b824aedbb58394c56125a93`，exit 125，reason
  `descendants_left`、cleanup complete，进程树峰值 17251008512 字节，
  未触及外层 24 GiB 上限。已回收所有所属子进程；不是环境波动或
  主动取消。终态前缀 native 363/363 equivalent；JS 共 607 条中
  604 equivalent、1 different、1 cancelled、1 unverified；WASM 共
  587 条中 528 equivalent、35 different、24 cancelled。
  三项均未完成，不计 A05 通过；完整失败与未执行范围保留。
  下一轮须先合入已确认缺陷，再显式配置受外层硬限额约束的 Node
  堆空间，不能原参数盲重跑或无限追加进程预算。
- 候选 5 原严格 `make byte-compile` run
  `3e833fdf8bd54cd28388f3627df7ba6c` exit 0/cleanup complete，
  峰值 128876544 字节；A06 仍待完整功能门禁。
  两个新增 Elisp 工具严格编译 run `774846bac5c14fcf82366dd691acab75`
  同样 exit 0/cleanup complete，峰值 42663936 字节。
- 候选 5 原完整 ERT run `f9034ee8375f4e55a6f81df5ba8208a2`：
  245 项中 244 passed，唯一失败为独立临时目录的数字拼写自举测试；
  exit 1/cleanup complete，峰值 492224512 字节。原公共 bootstrap 只
  生成前端，临时目录缺少前端实际导入的 Math 包作用域与产物。不能
  通过改到仓库目录执行或删掉数字/生成 JS 的精确比较来掩盖。

#### 本轮 D 的合批修复清单（P05/P06/P07）

本轮下一候选的修复先保存为独立 overlay；当前三输出执行的源/工具保持冻结，
只有整合后正常生成的新产物才能计入下一轮验收。已确认修复范围如下：

- B/C：真实 runtime 增加私有 `value-error-restore(code)` 包装原 fail，
  两适配层 required/restore 使用该真实导出，保留 class→code 恢复顺序。
  上一候选要求未导出的 fail，导致真实桥静默退回旧路径；假对象通过不能
  证明启用。真实 WASM/native 回归明确产生 source-operation 通知并检查启用。
- B/C：独立 JS compiler-build 产品自带实际 Math 模块的私有 package scope，
  连同 scope 的原字节和 SHA 进入产品身份；不借仓库依赖补空缺。
  包浏览器测试真实调用 async 闭包；完整浏览器迁移回归修正动态 key 与 cond。
- B/C：Pages 保留全部原 published bytes，另发布有真实源/产物/map 身份的
  browser bundle；playground 消费新派生路径，不冒充 compiler 固定点产物。
- B/C：Git ignored 校验改真实 `--stdin -z` 与 NUL 终止输入，拒绝内含 NUL
  路径；新增真实特殊文件名/缺 ignore 回归。原 integrity 测试独立执行一次，
  新测试只保新增覆盖；conformance locator 指向真实执行文件而不是注释。
- B/C：AC-24 绑定维护中的 Eli 工具源，真实 generated CLI 仍由原 Make 执行。
  原初入口改为调用维护中的 Emacs 执行函数，内部 Emacs 参数不列为公开选项。
  stable/parity 身份只能在整合完成后由原 generator 按真实源生成。
- 新增 nth 外来输入回归显式使用 foreignEntry；原五例和原 foreign 对象保留。
  深递归新回归按既有资源档真实调用 auto，不只声明未启用的配置；预算不改。
  fuzz 长任务取消新增 Bun 默认 5 秒限制，不减原输入，不另设总截止时间。
  source-view false 首错用例显式启用故障，保留 false 原值和重试断言。
- 原完整合同检查首项 conformance 失败；后续 16 项独立收集为 8 passed /
  8 failed，全部 cleanup complete。失败根因已合并，不按单个门禁反复重跑；
  matrix 的历史合同 mismatch 保留，正式功能门禁沿原计划显式 deferred 且
  仍由既有 historicalMatrixContract 严格验证，禁止手改旧收据或测量哈希。


- [x] B/C：包 bundle 参数改为 `--outdir` 与固定 `--entry-naming`；
  28 个正式模块 ID 的完整有序断言、真实 completion entry、wire
  descriptor custom section、新 fuzz 的 Bun runner 与 page map ignore。
  只改维护源，尚未统一生成/复验，不计验收通过。
- [ ] B/C：准备期 source-operation 18 的参数推迟解码。新
  `managed-host-lifecycle.eli` 通过既有私有 capability bridge 接线，
  原 heap/错误 ABI 保留；真实 prepare wrapper 只在原调用成功后按
  FIFO 回放，按实际 pin 数释放，首错优先。旧外语言实现保持原字节。
  新 helper/回归先写齐；现有 host facade 的接线待冻结批次终结再合入。
- [ ] B/C：真实外来入口的显式 `foreignEntry` 布尔选项，沿 session
  project→managed lowering 接入现有 source-operation，缺省/false
  保持原纯托管零导入；同时补 foreign 值的解构读取。严格保留真实
  宿主对象、getter、迭代和身份，不能通过复制宿主输入规避。原有
  完整语料中的其它实际失败一并按根因归入这轮，不按错误文本加额。
- [x] B/C：正向原 program 的功能资源配置认证漏接；只接明确真实
  fixture/suite、原 seed oracle 和无显式资源预算的正向合同，原容量
  负向/诊断/恢复输入不变，资源与性能验收继续明确 deferred。
  三个精确原 recipe 为 formatter-node 与 macro-generated-names-bun/node；
  保留 suite/fixture/host、源 SHA/regions、入口模块的来源约束，显式
  runtimeOptions 容量不覆盖。新增 implicit-resources Eli 回归及原门禁
  接线已写，尚未生成或运行；不能据此认定本轮其它容量失败已解决。
- [x] C：独立原初 bootstrap 的完整运行依赖。新增
  `tools/bootstrap-runtime.el::eliscript-bootstrap-prepare-runtime(root,output)`
  从真实 `runtime/math.eli` 发射 Math/module map 并建立私有 package scope；
  `tools/bootstrap-command.el` 是公共 bin 相对链接的 Emacs Lisp 入口，
  保留输出目录和显式 EMACS 覆盖，复用原 `bootstrap-seed.el`。当前
  helper/launcher 与 seed 接线已写，冻结批次终结后公共 bin 已替换为
  相对链接；显式 EMACS/输出目录的空字符串仍按原默认处理。
  B 保留三类数字源与所有精确生成 JS 比较，执行 driver 从内嵌 JS
  迁到 `tests/fixtures/number-spelling-selfhost-driver.eli`，并严格核实
  临时包中的 Math/module map 和实际自引用；尚未运行。
- [x] B/C：source-view 深链镜像改为有去重的迭代队列，外层返回前仍
  完整镜像所有已发现 view，保留原 Proxy/描述符和对象身份；20,000
  节点、循环、false/undefined 首错与修正后重试四例已写，尚未运行。
  closed-value 的日志可能由源错误在 teardown 后才被格式化产生，
  尚无证据要求开放已关闭 runtime，不提前改其生命周期语义。
- [ ] D：上述完整修复合入后统一生成，按影响范围重新验收；候选 5
  冻结已解除，正在合入下一候选的完整代码；不覆盖真实失败证据。
- 候选 5 首次统一工具生成 run `9537e04092ee493d831c97868769e4d3`，
  exit 2/cleanup complete，峰值 229064704 字节。生成器一次收集到
  fuzz 的未限定宿主 timer 和一处新增测试的 let* 作用域错误，均已在
  维护源修正；尚未进入四阶段或三输出执行，不能算候选通过。
  本轮最后收口同时处理两项实际交付阻塞：独立浏览器运输中的裸 Math
  依赖和原门禁重复构建已取消的 WASM compiler host。正式产品字节
  不改，浏览器派生 bundle 单独记录真实身份，不冒充原产品固定点。
- P06/P07 的生成物规则收口：原 deterministic marker 检查依赖提交
  生成的四个模块，现迁受影响完整性检查到 Eli，实际比较重生成 JS/map
  字节，保留真实 Git 源文件集合；产物必须 ignored 且 untracked。
  `bootstrap.el` 从已有 core.eli 夹具生成 snapshot，不提交快照或运行时
  impl 的中间 MJS。旧检查实现和测试原字节保留用于迁移证据；依赖、
  历史报告、缺项/篡改等有效拒绝标准均保留，新增验证尚待统一执行。
  源码检出的 `bin/eliscript-compiler` 改成指向同一 Eli 生成包入口的
  相对符号链接，不新增 Shell 实现；新增用例核对链接、包 bin 身份并
  实际执行帮助命令。P06 的原混合工具/包测试还将按精确的原测试标题
  取消完整二进制 compiler host 项，保留所有小程序 ABI、JS producer
  和三种用户输出。普通文件沿用原隔离 runner；完整 sequence 在外层
  受控进程中独立执行，避免原较小文件限额覆盖已确认的实际资源需求。
- 候选 4 引导 run `7ee4c35765a44333ab71496a44e26f22` exit 0、
  cleanup complete，峰值 3681370112 字节。stage0–3 均由声明的前代真实
  生成，302 个完整产品文件 stage2/3 原字节相同，产品 SHA 同为
  `c39cebe5cdaeae971bf3d54659730895a65acdcdf438569ffe3bd1ed19803275`。
  已准备该 stage3 发布视图；后续真实源码修复后须重建，不能将这份
  固定点当作新源码的认证。
- 候选 4 完整引导测试 run `a72c550dbcdd4753bd8f20846d3e0407`，
  7/7 passed，exit 0/cleanup complete，峰值 3617964032 字节。
  两个新增 Elisp 构建工具严格字节编译 run
  `c39ade79a8504e85ae417dd6c582c69a` exit 0/cleanup complete。
- 候选 4 三输出 run `7ac28a9839084bd1b6be8b41818485eb` 被协调者
  误判旧代重复项后主动中断，exit 130/cleanup complete，峰值
  8185528320 字节，不能当作完整通过。既有过滤本来已排除二进制
  compiler host；实际遗漏是 JS 输出仍重复旧完整多代门禁，现按 D06
  精确身份迁入原最终功能门禁。已保存的 native 前 312 条中，200 条
  实际运行一致、112 条预期编译诊断一致；这些仅是历史前缀证据。
  WASM/JS 的实际失败已按入口传播、导入重写、资源配置、源码映射和
  测试运输根因合批修复，不改原独立模型和 golden。编译器源码已变化，
  下一候选须重新发射，旧产物不冒称由新 producer 生成。
- P06 本批包接线保留实际 frontend 和运行时原字节：独立包补齐 13 个
  正式前端模块及 maps、实际 Math 依赖和私有 ESM 包作用域，更新真实
  清单文件摘要；原编译器 artifact/source identity 保持不变。Pages
  发布视图携带同一静态图及包解析元数据。新增包断言验证实际字节、
  身份、完整清单、loader/worker/browser 入口；真实浏览器验收仍待执行，
  不能用 Node 的包解析成功替代浏览器证明。Make 采用对应 Node 测试
  驱动，runtime-scan 与受影响 fuzz 引导能力迁至 Eli 后接入统一门禁。
- 候选 4 Node 批次 run `c75645d6e9de48e6a701d24b4a229689`，
  127 项中 117 passed、10 failed，exit 1/cleanup complete。新宿主桥接
  四项、Math 的数值/元数据/异常主体、Unicode 全标量及 sigma 均已通过。
  失败中六项来自新测试误注册到未 prepare 的独立 VM 子进程，两项来自
  reverse 新夹具平行 let 误引用 sibling，一项来自测试重导入的 Bun
  namespace 路径，一项来自测试未递归 module children 找 import。
  这些根因成批修源码，当前冻结的生成文件尚未替换。
- 候选 4 Bun 其他批次 run `5b9cc09515834e5187cfa626f85f3954`，
  27 项中 25 passed、2 failed，exit 1/cleanup complete；nth 的完整项目
  prepare 已成功且 18 项返回原值正确，失败是 managed realm Array 与
  宿主 Array 的 prototype 不同，不可为通过断言修改生产 decoder；须以
  原型无关但完整 ownKeys/描述符/Object.is 观察验证该平坦值数组。
  另 Pages 缺失新 graph adapter 实际导入的正式前端，已补齐整个 13 模块
  图、maps 和 stage3 Math 支持文件的运输源码，待下一统一生成复验。
- 候选 4 原完整 sequence run `9d8eb8d4c30945459a5f21ac46c42323`，
  56 项中 4 passed、52 failed，exit 1/cleanup complete，峰值
  22613262336 字节。原错误 ABI 已解除，当前唯一共因是 prepare 内的
  bindingChanged 被 graph 的未 prepared 检查提前拒绝；真实槽和 bytes
  充足。修 prepare 通知生命周期，外部未 prepare 的调用仍应严格拒绝，
  不改原程序、预算、oracle 和错误优先级。
- Math/Unicode/模块运输修复后的候选 3：run
  `a5349170c0df4c71886f11ff628fb25f`，exit 0/cleanup complete，
  峰值 3492446208 字节。`dist/bootstrap-candidate3/bootstrap.json` 四阶段
  JS built；`fixed-point.json` 实际比较 302 个产品文件，stage2/3 同为
  `2e58cc8ce0e7d94540c54ad5cd79832629f0da3296137bb89b82e866239e3862`。
  真实 stage3 发布视图准备 run `0a63ed7fc5ac42f5a2af9da94f72a329`
  exit 0，包含该代 Math runtime 原字节。后续修复改变正式源码，须重新
  生成候选，不把这份历史固定点冒称最新源码已验收。
- 候选 3 统一 Node 批次 run `5f63c67cfd7642908c6c4f1265aa8be5`，
  122 个 runner 项中 105 passed、17 failed：其中 1 项误将既有
  `bun:test` 文件交给 Node，不能算语义失败或跳过，其余失败按根因
  合批修复。数学直接舍入、独立精确累加与 30 iterator 模式已实际通过；
  方法不可构造元数据、Unicode 默认参数、新 Seed host 顶层 await、
  运输 span/包基准和 VM 原参考依赖均有明确修复，待下一统一批次。
- 候选 3 原完整 Bun 功能批次 run `b39ee0ea15f2494094f9130ee4746e1a`，
  70 项中 16 passed、54 failed，正常退出失败并完成清理；峰值
  21647245312 字节，未触发 24 GiB 硬上限。完整 sequence 在 prepare
  发生 ELI1，新增 nth 在 prepare 发生 ELI3，均未到实际 nth 运算。
  nth 唯一 slab 定位到 binding 190 / `$eliscript_link_0_139`，真实源图
  映射为 `managed-runtime-queue.eli` 的 `EMPTY_QUEUE=(literal-queue)`。
  空闲槽与字节充足，不能继续将此判成容量不足或给资源加额来掩盖。
  此批两处阻塞已有确定根因与合批修复：EMPTY_QUEUE 需要未实现的
  `Array.prototype.reverse`，已补实际方法发布和通用反转算法；协议解码
  对 kind18 函数读取 `slot` 时错误调用仅接受 kind13 对象的原始接口，
  由新的 Eli 宿主桥接按真实类型分流到属性接口，原始 ABI 的错误种类
  和负向用例保持。对应通用反转及真实 WASM/native 宿主桥接测试先写齐，
  再统一生成与执行，不继续增加预算或原样重试。
- 原严格字节编译 run `3ff67945f4f14acda2522b7c8fdefac2` exit 0。
  新 Elisp 工具单独严格编译发现 `bootstrap.el` 的 `lsh` 风格警告；
  已对非负 UTF16 单元改为同值 `ash`，本批严格复验 run
  `c39ade79a8504e85ae417dd6c582c69a` exit 0/cleanup complete，
  `bootstrap.el` 与 `unicode-case-runtime.el` 无 warning/error。
  候选 4 初次生成在新增宿主桥接测试的 async 回调缺闭合括号处停止，
  run `75bdf709277b4c70bc85b1ad70f4d582` exit 2，未生成自举阶段；
  已修真正闭合点，原失败日志保留，四项测试及其断言未删改。

- 真实 `make bootstrap-release`：run `482e9ea467b44348afef41e0feea0d46`，
  exit 0、cleanup complete，49.392 秒、峰值 3611394048 字节。
  四阶段 JS 均 built，固定点 identical；原始文件、maps、IR 与运行资产共
  297 个产品文件，产品 SHA `1f006f19a9c52c4028d98b85414f1b1d7c935bf5f5ffc0f6786957d8bc7d8666`。
- 新完整自举测试：run `bef8a19b10d04c50b898cb565cdec6e7`，7/7 passed，
  exit 0/cleanup complete。集成接线测试 6/6 passed，run
  `9fdf1b77971b4a4cb2ba914ec936da3d`。
- 原严格 `make byte-compile`：run `47d24b1fe68c42af877d62fe9a4f4ad9`，
  exit 0/cleanup complete，无 warning/error。A06 仍待完整功能门禁。
- 原六文件运行时批次 `9b0a69221030464d962ed1e126f7793d` 仍失败，
  不能宣称容量已修复：完整 sequence/初始化等存在 ELI2。extended 使用
  `node:test`，Bun 默认 5 秒 hook 超时后清理目录造成次生 ENOENT；迁到
  正确 Node runner，其他使用 `bun:test` 的原文件不改运行器或断言。
- 新 stage3 调度测试由实际 stage3 生成后，run
  `8dc40f4c2ac4401898f0a064f561eb80`，8/8 passed，exit 0/cleanup complete。
  其小样例真实执行三个用户程序目标，但不能代替完整三输出语料验收。
- 初始化诊断批次 `62dacc97177041d88bc170a5c77d5d1b` 保留真实失败。
  新测试曾只在 options 中填 auto，而原 factory 没有该选项；现按原接口
  显式调用 runtime.auto，未改变 auto=0 或 GC 合同。prepare 夹具把普通
  对象错误标成 persistent literal 品牌，已改为原无品牌 sentinel。
  namespace 缺失真实 Symbol.toStringTag，已补源码与描述符、空 namespace
  和同 heap Array.prototype 身份回归，等待本批统一验收。
- 新增 nth 测试自行选择的 1024 槽不构成额外发布合同。原 sequence
  用户程序及共享语料本来明确要求 1024 槽，继续按其原预算诊断真实
  初始化失败；不通过增大原预算、关闭断言或无限重试取得通过。
- 版本仍为 0.0.1；上述均为功能候选证据，不是最终 0.0.2 发布证明。

### 候选 9 集中验收与下一修复批次（D 内继续）

- 四阶段实际构建 run `9483d4c38d2b4eb3ae0f1f4fe6640e08` exit 0、
  cleanup complete；stage2/3 完整比较 303 个产品文件 identical，产品 SHA
  `098daa79f5826aee43267dd4e6b24c106287af020e3927de65133478911dc29b`。
  正式发布视图准备 run `ce791fdf836e4a6b8753cf6bc6fa6a38` exit 0。
  后续运行时修改仍须重建新候选，不能沿用此证据认证改后的源码。
- Node 22 文件批次 198 项：191 passed、6 failed、1 项明确性能延期；
  Bun 两批合计 56 项：53 passed、3 failed。原 sequence 56 项：
  4 passed、52 failed。三种浏览器各 41 项：14 passed、8 failed、
  19 项按旧 compiler host 取消。这些均保留为失败证据，不计完整三输出通过。
- 原 ERT 245/245 passed，run `c79fe6056d234eafbefb3dce71373c63`；
  原严格字节编译及五个新增 Elisp 工具严格编译均 exit 0，分别为
  `63ce377882e240ebb2a10094c0cf6cb7`、`8fc12ecbb7eb458bb0e75fec992d0f74`。
  没有后续 Elisp 变更时不重复运行这些未受影响门禁。
- 候选 7 完整三输出长任务已终止失败：run
  `30526b4d26284d719b5627f81a4b0044`，Node 8 GiB 堆耗尽，进程树峰值
  19243909120 字节，全部所属进程已回收。终态前缀为 JS 639 equivalent、
  WASM 530 equivalent、native 512 equivalent；均不是完整语料通过。
  失败点是 native 完整 Reader 请求在输出前进行共享 IR 树展开及 JSON
  保留；不能笼统归因机器负载，也不通过盲目增加堆上限重试。

本批沿 P05/P06/P07，一次补齐以下阻塞的 B/C，再统一生成下一候选：

| 位置与符号 | 必要修复及保持条件 | 验收 |
| --- | --- | --- |
| `compiler-build.eli` 包作用域创建 | 首次 seed/session 导入前建立实际包边界；实际 bare Math 解析到本轮完整产物，保 maps/来源与文件清单 | 原完整 28/53 模块构建及实际 load |
| `compiler-corpus.eli` runtime-scan recipe | 保原 ID、13 模块、原区域与新源码定位，恢复被迁移文件名漏掉的原完整用例 | 原语料最低 794 不下降；原 provenance 断言 |
| `managed.eli` / `memory.eli` Function prototype | 发布真实默认 `Symbol.hasInstance`、普通原型链与 bound 委派，保覆盖、首错、属性描述符与冷观察 | 原 wire 同源 WASM/native 和新增独立对照 |
| `managed-host-lifecycle.eli` | 克隆 envelope 的 dispose 必须转发原后安装的关闭钩子；有无 prepare 均适用；补全真实 WASM B adapter 的 bytes 接口 | 原关闭快照拒绝、嵌套克隆与实时钩子 |
| `compiler-matrix.eli` traced-session | 真正 sequence 私有请求继承本 cell 协商的 graph-events-v1；显式模式优先，保持原 signal/错误和完整字节/IR | 原完整 Reader 与真实私有 sequence 路径 B；不截断响应 |
| `compiler-browser-session*.eli` | 单 IR 的 target 取提交请求而非不存在的返回字段；完整元数据接收保有界大请求；Node/browser 首次项目使用相同实际 runtime revision；debug 从最深真实 range 精确映射 | 原 22 个有效浏览器条目，三引擎及真实 native 产品运行；不删字段或改 golden |
| 原 sequence prepare / nth 外来值 | 首错诊断已证明 prepare 首次错误为 `undefined.call`，不是槽/字节容量；现有 literal/collection 初始化正调用尚缺默认方法的 `constructor[Symbol.hasInstance].call`，同批补齐真实默认方法及原形冷调用 B，最终以原完整序列复验而非诊断代替验收。nth 保 caller/result identity、负零、GC 和 caller roots | 原完整 sequence、原 nth 输入及独立参考，不改资源或语义预期 |
| `memory.eli` `value-source-length` | nth 的第一处差异确为外来数组 index 0；原路径对 foreign kind35 不读取真实 length，导致边界判断错误并返回 nil。增加真实属性 Get，不改变 raw `value-length` ABI，保 length getter/原抛值及元素身份 | 原完整 nth，以及 foreign length 的 getter/错误用例 |
| native 原 `original-sequence:esm-imports` | 历史终态实际 report 末项为 2，原预期为 1；原 `isolated=true` 只在 JS 分支生效，二进制分支错误地共用 parent global。仅对已声明 isolated 的二进制 exports 在独立子进程执行原实际断言与清理；不重置用户 global，不改原 fixture/reference | 原 import sequence 的单次副作用、namespace/default/named 身份 |

隔离实现位置：`tools/backends/eliscript/compiler-corpus-execution.eli`
`execute-exports` 在建立 adapter 前路由，现有 child runner 负责取消与回收；
新 `compiler-corpus-isolated-exports.eli` 接收真实 artifact 的已验证 compact ABI、
原 contract/resources/options，直接调用同一实际 local executor 防递归，
不改原 contract。父进程接收原观察与诊断，不伪造通过。
回归追加原 `tests/eliscript/compiler-corpus-exports.eli`：两份真实 provider 图、
WASM/native、父 global 不变、原副作用次数、false/undefined 首错和清理。
新增 helper 的源/生成映射加入 `bootstrap.el`，输出及 map ignored；
没有新增手写外语言或新测试框架。

候选 10 首次统一工具生成 run `bc60b24fc2824049b9f73f07bd9ea5c6`
exit 2、cleanup complete，尚未进入四阶段：完整收集到新隔离 executor
模块尾多余括号、matrix 新首例缺闭合及隔离 B 的裸 globalThis 不合法三处
源码问题，按同批修正；不更换编译器、不跳用例，不把生成失败报成验收通过。
后续 run `442b99a3ca4940069b94e559aa171627` 已解除两处，仍保留 matrix
文件 EOF；只针对该文件作一次 Reader 的完整边界定位，不靠猜测补括号重试。

候选 10 四阶段最终 run `f9ac2a85f3834a85962cb8088702016f` exit 0、
cleanup complete，57.689 秒、峰值 3420012544 字节；303 文件固定点 identical，
stage2/3 产品 SHA `9691261684fc91e112ede5f177b11188f6592bc0a806cd31f94b2287e423a289`。
发布视图准备 run `4ac56719fba84ba294824c228ef1655b` exit 0。五工具严格
独立字节编译发现 public launcher 缺外部函数声明，补 `declare-function` 后
run `1079090f000042959f92b13b0f9e404d` exit 0，产出的五个 elc 已精确移除。

本轮 D 的终态与缺口：

- 完整三输出 run `c5d9cb0e5af1459b959f36d2e8860fd6` 在语料捕获前退出：
  新恢复逻辑错误地要求同 file/title 的稳定特性引用只有一条；没有执行用户
  程序，不能报告任何目标通过。下一批保每个原 coverage ID，按 ID 唯一
  绑定到同一个完整 runtime-scan recipe，不降低 794 门槛。
- Node 批 run `76d8f967ea2f45cb9e15980b120d030e`：200 项中 183 passed、
  16 failed、1 明确性能延期。其中误送一个 Bun 文件给 Node（runner 错误），
  同时漏跑原 managed-adapters；遗漏文件已原样补收 13/13 passed，run
  `3302012b59674db38418f0f222d591e7`。原 28/53 模块构建及实际 load 通过。
  余失败为同一语料定位守卫、两项新运输 B 缺原比较器必需的 suite 来源字段、
  原小 gate fixture 缺新增正式 Math 源，均按原 contract 补齐而非删除断言。
- Bun 八文件 run `6664e04977154f2283706d661aea81cc`：55 passed、3 failed；
  原 wire、foreign 数组逐元素 identity/负零/GC、10000/10001 深树均已通过。
  nth 后续 RangeError 报告仍失败；新增 hasInstance B 把 `true` 写成不合法
  Eli 标识；另一项是未设置既定性能延期环境引起的旧 hash 校验。遗漏的
  Bun 文件与正确延期环境下的原 legacy integrity 已一次补收 16/16 passed，
  run `43143b30b3a34829a90b0a5c4d572e0a`，不修改任何历史报告。
- 完整原 sequence run `9802b66ebfde4f53b9110adb321bb235`：先完成
  16 项中的 9 passed、7 failed，随后在首个 WASM/Node 子程序阶段触及
  24 GiB 独立进程树硬上限，45.935 秒、峰值 25789448192 字节，exit 137、
  cleanup complete。其余 40 项未执行；不是全 56 项终态验收。原准备阶段
  统一 ELI1 已解除。owned throw 的小对象和 JSON 普通 diff 不能证明内存
  增长由代理递归造成；先保固定阶段记录与原错误，不以增加限额重试。
- 三浏览器顺序批 run `8e57b142ee3c43fbab5afee38f237264`：各 16 passed、
  6 failed、19 项原 compiler host 取消，cleanup complete。完整 JS fixture
  和 raw memory IR 已通过；余六项共同缺 managed 用户指令 span。实际独立
  Node metadata 也只有 runtime 指令 span，不能靠改变浏览器预期消除失败。

下一批仍沿 P05/P06/P07，全部 B/C 补齐后统一复验，不重建未受影响资产：

| 精确源码入口 | 确定根因与最窄修复 | 原验收保持 |
| --- | --- | --- |
| `compiler-corpus.eli` `restore-runtime-scan-recipe` | 同一源码可以有多个特性引用；每个覆盖 ID 原顺序保留且只归属该完整 recipe | 原 13 模块、区域/hash、全部 coverage、794 guard |
| `tests/eliscript/compiler-matrix.eli` | 新 B 补完整原比较器来源；gate 小 fixture 带真实正式 Math 源 | 原执行与 source-bound gate，不伪造 comparator 结果 |
| `stdlib/managed-value-state.eli` `hashString` | omitted optional 被 Eli 置 nil，而迁移代码只对 undefined 补 STRING_TAG；用 rest 区分 omitted/undefined/显式 null | 原所有字符串 hash、路径别名/碰撞原严格 hash |
| `stdlib/managed-runtime-order.eli` IComparable 发布 | 缺已有 protocol role 注册，宿主解码变成同 description 的另一 Symbol | 原 Symbol 身份和 compare 断言 |
| `stdlib/managed-runtime-collection.eli` `indexedValue` | 同一 omitted optional 问题把 nil 当显式 not-found，越界不再抛原 RangeError | 原 nth 全部输入、RangeError、显式 fallback 边界 |
| `bootstrap/backends/managed.eli` typed lowering | 真实用户 IR span 没有进入 typed steps/result/body；保共享纯 guard，按真实来源复制必要 root，生成节点仍无 span | 三浏览器原精确位置、maps/debug/二进制原字节与运行 |
| 原 sequence helper 的失败运输 | 对尚未处理的真实 owned throw 作有界字段与阶段记录，再重抛原值；现有 objectGet 是源 Get，次生读取错误不得替代原首错，不新增内存解析器 | 正常 stdout、原输入、第一错误、pin/release 与清理不变 |

实现与用例写完仍不等于验收通过；最终三输出、完整门禁、0.0.2 最终冻结、
包安装、签名推送和对应 CI 仍开放。版本保持 0.0.1，性能延期不冒称通过。

### 当前统一验收 C12（功能候选，仍未交付）

C11 工具生成已完成，但随后 stage0 发现新增调度包装器与原有
`lower-managed-expression-core` 重名；仅将新增包装器改为唯一的
`lower-managed-expression-dispatch`，原 core 保留。该失败 run
`dac86e9979fe4d218209d222ea29ff00` exit 2、cleanup complete，不能算自举通过。

修复后的全新 C12 由维护中的 Emacs Lisp 实际生成 stage0，再真实生成
stage1、stage2、stage3。run `c855e3fc24924204826fcbebaa84171e`：44.123 秒，
峰值 3776249856 字节、exit 0、cleanup complete。完整 303 文件固定点通过，
stage2/3 产品 SHA 为
`643076a561746e96d0fbeb1853ffbcd371ea56ad1a5f94a8bb1c233dd7f58815`。
发布视图实际准备 run `720b2c060e564aa88003877e26e3dbae` exit 0。

- 正确的 Node24 二十四文件统一批：215 项注册，214 passed、0 failed、
  1 项原性能报告明确延期，不记通过。run `5fe861adfa724169afa3ab794683a753`，
  30.592 秒、峰值 9020096512 字节、exit 0、cleanup complete。包含真实
  stage3 WASM/native 用户指令范围、新恢复语料全部 coverage、私有 graph
  运输和原 28 模块/53 literal 完整构建与实际 IR 执行。
- Bun 九文件统一批：67 项，65 passed、2 failed。run
  `ff155691c12b4235ab92cc26f4d4ac52`，104.424 秒、峰值 5243060224 字节，
  exit 1、cleanup complete。原 nth imported-report 值仍有差异；新增
  hash B 缺编译 report 前的声明，生产函数未执行。hasInstance、wire、
  foreign、10000/10001 深树、exports、Seed 和延期模式下 integrity 均通过。
- 完整原 sequence 57 项与最终 stage3 三输出正在运行；三输出已实际进入
  三个目标，不再被 runtime-scan 定位守卫阻断。运行前缀不能算整项目标通过。
  序列诊断已将原 owned throw 解为 IReduce/reduce 与 IAssociative/assoc
  的非可调用 direct slot；原 value-hash 已通过。当前冻结 C12，后续修复
  写入下一候选，待本批独立失败收齐后合并，不改变运行中的源码。

C12 后续统一验收已收两个完整终态：

- 原序列 56 项加新增诊断 1 项全部执行，23 passed、34 failed；run
  `b761d8243e1c46baac5dfd35977b531b`，176.879 秒、峰值 24675368960 字节，
  exit 1、cleanup complete。WASM 两引擎各 9/13 passed，原哈希、内部
  观察和 IComparable 均已通过。8 个 WASM 失败聚合为 Array reduce 与
  Object assoc 协议查找；后续源码证实 reason 缺省本身也存在迁移错误，
  当前“non-callable”文字不能证明实际槽位存在。native 26 个失败是在
  prepare 前被新诊断包装改变 runtime.project 身份阻断，不能判作原生算法
  失败，也不能放松原严格 transport 身份检查。
- 三浏览器统一顺序批 run `a4e9a9c4b61a493f9aae35e2a85a4665`：330.442 秒、
  峰值 14517796864 字节，exit 0、cleanup complete。Chromium、Firefox、
  WebKit 均 22 passed、0 failed，另各 19 项取消的二进制编译器宿主，不记
  通过。真实 stage3 的浏览器/Worker 三种输出、实际 native 库、精确
  maps/debug/source span 与原同源对照均通过。

下一修复批仍沿 P05/P07，当前 C12 运行中的源码不变：

| 源码入口 | 下一候选的必要 B/C | 原标准 |
| --- | --- | --- |
| 协议 private exact lookup / memory / foreign bridge | 仅私有协议键将真实宿主 canonical Array/Object prototype 对应至本堆注册键，custom/null 原样，公共 Reflect 身份不变；reason 用 rest 恢复 omitted/undefined 默认 | 原完整 sequence、getter/首错/非法 direct slot 与 foreign identity |
| sequence 诊断 helper | 包 graph.prepare/invoke 保 runtime/project 原身份，不克隆 runtime.project | native 已 attach 真产物再次 attach，另 transport 仍拒绝 |
| managed-runtime-sorted | 省略/undefined 恢复原 ascending=true、comparator=compareValues；显式 null/false 不变 | 原省略调用与全部显式边界 |
| zero-imports / nth helper | hash 新测试预声明删除后拼真实函数；nth 原失败先附有界真实值证据，不猜改预期 | 原字段 Object.is 和独立参考不变 |
| compiler-corpus request | API 原 Node host 还会导入 entry 未引用的 seq；发射原声明的完整 library entries | 源码/输入/host 未改，缺失依赖不能伪造 |
| original host context | 异步导入尚未完成时 beforeExit 提前关闭 graph；受影响生命周期迁 Eli，关闭仍检查 live/frame/首错 | 原 host/body 与动态加载、实际退出清理 |

C12 完整三输出后续暴露原百万 persistent-core-exit 输入的共同阻塞，仍属
P05，不能作为可选性能打磨忽略。原 host 的 `valueCount=1_000_000` 及
全部共享结构/更新/碰撞断言保留。向量树的路径复制算法本身有界；问题是
宿主 decoder 每次返回都强制完整镜像共享树，使百万次 host 调用累计
平方级传输。默认功能 small 的 131072 槽也确定不足以保留百万个不同值。
当前没有证明无限循环或 GC 泄漏，不能把持续 CPU 本身当成该结论。

已核实 PID、父进程及唯一产物路径，仅终止 C12 的三个 WASM 百万 vector、
map、set 子进程，父三输出调度继续；这些记录仍是失败，不计通过。没有改
原程序、测量结果或哈希。下一批 B/C：

- 仅 decoder 私有视图取消强制递归 eager mirror；保留公共 source view
  refresh 和全部 Proxy 实时读取/反射/非可配置约束。不能猜节点 immutable、
  缓存陈旧子对象或用全局 realm 脏标冒充普通对象写入追踪。
- B 保留公共完整镜像原用例，补实际 WASM/native 稀疏解码、共享身份、
  嵌套修改、descriptor/prototype/freeze、首错 false/undefined 和 GC。
- 原明确容量/负例预算不动。仅准确绑定的三个原百万正例，在已启用功能
  资源延期时使用现有 full-compiler 的 8388607 槽、256 MiB 初始/1 GiB 池
  及匹配发射内存；不是增加进程树硬限，也不声称原 1024 槽容量通过。
  其余默认功能用例仍 small，明确预算优先。报告同时保留原/实际两组参数。
- 三项 ELI-RT0003 的现有外部堆栈不足以判定真实 arity 错误。仅在既有
  allocator 诊断环境下记录实际 callee/args kind、length/count 和原错误码；
  必须恢复原错误状态，次生诊断失败不改首错。没有证据前不改 arity 语义。

### C13 修复候选与下一批精确收口

C13 初次全工具生成 run `6b1bf3bf58a74b8ab6283224e6abcb64` 一次收齐
两处新增测试编译错误：launcher B 的括号，以及 sequence B 的非法
`async-lambda`。随后 run `c9e66a02f6544e7b8561c78ff65e388d` 暴露同一
launcher B 的 try/finally 归属错误；均保留失败，不冒充通过。修正后
run `c0ce1c8440bd41628aae60ab0e992390` 63.800 秒、峰值 3604873216 字节，
exit 0、cleanup complete；工具、Emacs stage0 和真实三次自编译完成。
303 文件固定点一致，产品 SHA
`c30c1137db9977ba5d3bd5c36852a24dc9c3e554a30a8e536cd81c07dc9bbbf7`。
prepare run `aaf0f380c7ca401e8ea8c869b3c02668` exit 0。

- Node26：227 项，220 passed、6 failed、1 原性能延期。run
  `3de7712a31714570ad95e51d06c41802`，31.758 秒、峰值 9468100608 字节，
  exit 1、cleanup complete。所有原用例及公共完整 source refresh 通过。
  新协议 constructor B 缺预声明，阻断其三项；新 lazy WASM B 使用未 attach
  的低层 factory，真实 native 同体已通过。另 exitCode=0 的旧 JS false
  判断未保，以及 wrong-host 负例错误期待 small（原合同应拒绝）。
- Bun9：69 项，66 passed、3 failed。run
  `e833ead03fca425aadbf75dc400c788c`，110.593 秒、峰值 4810326016 字节，
  exit 1、cleanup complete。实际 hash 默认/碰撞、hasInstance、wire、foreign、
  深树及 exports/Seed/Pages/integrity 通过。nth 原字段证据终于确认实际
  `ProtocolDispatchError`，原期望仍 `RangeError`。sorted/matcher 新 B 分别
  被已有 symlink、嵌入 `true` 这两处 fixture 接线阻断，尚未验证生产函数。
- 原序列 57 项加真实 exact dispatch 4 项已完整执行：61 项中
  41 passed、20 failed；run `cdebf5474087406d8ca5e68c255c3291`，230.341 秒，
  峰值 22489481216 字节，exit 1、cleanup complete。native 原 transport
  身份阻断已消除，四个组合均实际 prepare 成功且各 9/13 原例通过。
  原 16 个 body 失败仍是同一协议查找缺口；新增 4 项在独立 reference
  namespace 引入 managed 私有额外 export 时失败，须只导入真正需要的
  公共命名项，原 57 输入不变。完整 C12 三输出继续原源码收齐。

C14 已准备的 B/C 沿原 P04/P05/P07：真实 canonical protocol helper 实际
为 `defconst` 的 function-expression initializer，标记须只浅拷贝此真实
initializer，保原声明/名/span/IR 不变；原正例 foreign exact 与全部拒绝
保持。其它确定接线一批修正：constructor stub 后接真实节点、WASM 真带
模块 factory、原 JS Boolean(exitCode) 语义、wrong-host 仍拒绝、symlink
严格 realpath 复用、fixture 布尔写合法 `t`。无一改动原 golden、用户输入
或容量负例；当前 C13 源码冻结，终态后才整批合入下一候选。

### C14 实际验收与 C15 主线修复批

C14 run `c67c258b44484009a2ab895979a0323b` 完成 Emacs stage0 和三次真实
JS 自编译，61.505 秒、峰值 3566583808 字节、exit 0、cleanup complete。
303 文件固定点一致，产品 SHA
`1ea0d3d329297f92270575e070eac5e93e01bc3b86b172066cc2738495dd5439`。
prepare run `ce975715d6a74d0cafaf80c26f3249c7` exit 0。

- Node26：228 项，227 passed、0 failed、1 原性能延期；run
  `d807302570414ccb8b5dd7d97d7a3f73`，33.020 秒、峰值 9577480192 字节，
  exit 0、cleanup complete。真实 canonical defconst protocol 桥、私有 lazy
  decoder 的 WASM/native、原公开完整 refresh 与首错/清理合同全部通过。
- Bun9：69 项，66 passed、3 failed；run
  `7164bdaf0dac4970860aac33df22918a`，159.850 秒、峰值 5700681728 字节，
  exit 1、cleanup complete。nth 原 60 秒总测试时限终止独立 Node child；
  无证据证明语言循环错误，不能提高时限冒充修复。sorted 新 B 在 factory
  初始化前未启用原 auto1，尚未进入用户调用即 ELI-RT0002。matcher 新 B 的
  全部实际字段 Object.is、数组长度/值与全部描述符均通过，只有原 Bun
  toMatchObject 失败；需要区分宿主比较器问题和语言输出，禁止改黄金。
- Sequence61：49 passed、12 failed；原 57 项为 49 passed、8 failed，
  新协议 4 项因观察 helper 对已解码 host Error 调用 raw pin 而失败。
  run `50f2c70d4fed4062a818bd84cf59af6d`，256.600 秒、峰值
  25695879168 字节，exit 1、cleanup complete。四个目标/引擎组合各
  11/13 原例通过；transducer、indexed-sequence 全部通过。剩原例只含
  core-stdlib 与 core text/object，仍需取得真实首错，不以空打印推断原因。

C15 仅沿 P05/P06/P07 修复上述主线和原完整三输出暴露的 Seed 对照接线：

- `tests/eliscript/literal-runtime.eli` 的独立 Node 请求在原 WASM/reference
  文件落盘后即启动，与原 Bun 两目标重叠；原六 case、全部断言、auto1
  和 60 秒时限不变。无论成功或首错，finally 必须等待原 child 及双流
  回收，再清理目录；既有诊断开关标明开始/完成，禁止盲目提高资源。
- `tests/eliscript/managed-project-zero-imports.eli` 的 sorted B 保持原
  8192 slots/字节，factory 仅关闭自动初始化，随后先 auto1 再真实
  initializeModule；补实际初始化前状态和 GC 已运行断言。
- `tools/backends/eliscript/compiler-corpus-execution.eli` 的 Seed 来源
  闭包仅对显式 `.mjs` 依赖优先采用已认证声明 host provider；显式 `.eli`
  和入口不变。保持 configure-local-runtime 原冲突拒绝。补原 provider
  身份、显式冲突及篡改拒绝 B，原完整 20000 输入/四 host/maps 字节模型
  不变。完整原记录另外暴露 sorted 构造身份和声明 platform self-reference
  接线，须同批收齐，不能把这些记录取消或改成成功。
- `tests/eliscript/wasm-managed-sequence-data.eli` 与相应 helper 区分
  raw-owned 与真实已解码 host Error；观察不能创造无效句柄或替换首错，
  原四组合与全部原正文继续完整执行。matcher 保持原独立黄金与原匹配
  条件，只允许已证实宿主差异所需的正确运输适配，不弱化语义。

C15 matcher 运输采用 `tools/backends/eliscript/compiler-corpus-matchers.eli`，
使用 `managed-source-view.eli` 的真实 WeakMap 认证；只给认证的 owned
record/array 建实际公开反射快照，保存 holes/undefined/-0/symbol、全部
own descriptor flags、alias/cycle；访问器保持延迟及原 receiver/首错。
普通值、外来 Proxy、其它 matcher 均走真实原 Bun matcher/receiver。
原两条 core-stdlib 记录只替换第一行唯一 `bun:test` 依赖说明符，原
host 正文和 golden 字节不动；归档四份 Eli/生成工具的真实来源哈希和
运输前后 host 哈希，冲突拒绝。新增运输 B 保留完整正文、拒绝不完整/重复
来源和变动导入边界；原实际 view 的逐字段/数组/descriptor 断言继续执行。
这个适配解决宿主比较器的内部数组长度读取问题，不改变生产对象或放宽
原标准库断言。原序列两个 stdout host 没有 matcher，不能混归此根因。

C12 完整三输出仍在原冻结源码上收齐，不能用 C14 局部结果覆盖其失败。
旧 result 的 50000 次 vectorConj 被 C12 每次完整 eager 镜像重复解码，
与 C13 已修私有 decoder 同根；仅结束核实归属的该旧 child，让父调度
继续，保留失败，不把静态定位计为新候选运行通过。

### C15 实际验收与 C16 根因批

C15 第一次生成 run `6f12920162474af1b592054a6741d098` 退出 2：一次收齐
三处新测试编译错误（Seed 多余括号、matcher 裸 true、诊断 B 需顺序绑定）。
同批修正后 run `1bf9d51c222941e0b5e533ec047874d4` 61.631 秒、峰值
3596124160 字节、exit 0、cleanup complete；303 文件固定点一致，
SHA 仍为 `1ea0d3d329297f92270575e070eac5e93e01bc3b86b172066cc2738495dd5439`。
本批仅工具/测试变化，正式编译器产品未变。prepare run
`8e07e225e8b741bc967f29f2a51661c3` exit 0、cleanup complete。
完整 `make byte-compile` 加新增五份 Elisp 工具严格编译 run
`3b2d7f184366417bb7efe9201b8628ed` 2.406 秒、峰值 135446528 字节，
exit 0、cleanup complete，新增 elc 已回收。

- Node26：229 项，227 passed、1 failed、1 原性能延期；run
  `5b15e5fd8c844dadb1e75eb9c869dd96`，33.081 秒、峰值 9751019520 字节，
  exit 1、cleanup complete。唯一失败是完整 legacy 文档对照的独立 expected
  未计新增两条 matcher 依赖运输及四份真实来源，须补精确预期并继续完整
  deep equality，不能忽略这些记录或字段。运输专用新增 B 已通过。
- Bun10：79 项，76 passed、3 failed；run
  `cb56f732aa8f4fee91859c45caaef7cb`，187.437 秒、峰值 10801790976 字节，
  exit 1、cleanup complete。nth 原六 case 与三实际路径在原 60000ms 内
  57298.83ms 全通过；Seed 新五项和原八项全部通过。手工 matcher 四 B
  通过，真实 WASM/native 两 B 仍失败：快照仍挂着认证 prototype Proxy，
  未完全运输原型链。sorted 新 B 在 auto1 真初始化阶段仍 ELI-RT0002；
  不再把其临时 8192 自限当成原验收门槛，也不据此优化整库资源。
- Sequence61：本批未完成；run `e8f08d1e46094e35bfc731351005290e`，
  42.884 秒、峰值 25945505792 字节，memory_limit、exit 137、cleanup
  complete。只完成 18 项，16 passed、2 failed，43 项未完成。四个通用 B
  和 WASM/Bun 12/14 通过（新增协议 B 已通过）。两原标准库 host 的首错
  均已真实解析为 `ProtocolDispatchError`、`IReduce/reduce` 对 `object:Set`
  缺失、reason missing；不能再归为空打印或笼统归 matcher。原 24GiB
  独立树限额已保住并清理，未盲目提高限额或重复未变运行。

C12 老候选的三输出调度已确定失败，且继续反复经过已修 eager decoder
路径；本批主动退役，未作为通过。完成记录：JS 696（679 equivalent、
1 different、1 cancelled、15 unverified），WASM 586（537 equivalent、
25 different、24 cancelled），native 566（531 equivalent、11 different、
24 cancelled）。run `7ea6f5f4d6ec433ab43ebef8e54fb5ae` 3545.517 秒，
峰值 17853661184 字节，cancelled/exit 130、cleanup complete；原日志/
请求/产物/失败报告保留，不让已知旧失败继续重复消耗。

C16 沿 P05/P06/P07 的整批 B/C：

- 完整语料 expected 独立认证四份新增工具来源，仅给原两个精确记录补
  第一行说明符运输、前后 SHA 及来源证明，原全部其它文档值继续完整比较。
- 新增 sorted optional-argument 功能 B 使用既定 public small 的真实
  budget/memory，并保 auto1、初始化顺序、全部原功能断言；原独立容量
  负例、原 1024 性能/资源基线继续保持原值且不冒称已验收。
- matcher 的认证 prototype 边按同 WeakMap/队列复制，不硬换 host 原型，
  不改原 view 或 foreign identity。B 严格观察原型节点、alias、array
  prototype brand/length、own keys/descriptor flags 和原 constructor
  identity，再调用原 matcher/golden。
- Set 缺实现沿既有私有 exact-prototype 桥补真实 canonical Map/Set，复用
  实际原型注册与根管理；公共 GetPrototypeOf、custom/foreign 拒绝保持。
- 本机 Node24 元数据明示 WASM 编译并行任务默认 128。原 sequence Node
  child 仅限制 `--wasm-num-compilation-tasks=2`，以减少同时编译占用；不
  改 image、算法、优化层级、host/input/auto/60000ms 或 24GiB 硬额。
  Bun child 参数不变；加真实命令数组 B，不能把这项功能调度计作性能通过。

### C16 实际结果与 C17 收尾批次（P05/P07）

C16 四阶段实际完成，303 项 stage2/stage3 原始产物一致；构建 run
`2be6ac1d3a9c41fdb2abeacdd1372298`，56.291 秒、峰值 3695788032 字节，
exit 0、cleanup complete。Node26 为 230 项：228 passed、1 failed、
1 原性能延期；新增 Map/Set 用例的 foreign entry 接线仍 ELI-RT0003。
Bun10 为 79 项：77 passed、2 failed；nth 原三路径 50526ms 通过，
sorted optional 原功能断言通过；两失败均为真实视图的外部 matcher。
Sequence61 实际仅完成 18 项（17 passed、1 failed），原 core-stdlib
已通过，core text/object 的 safePrototype 为 false。余 43 项未执行；
run `a41b2aeb96884df9887e869b1169d3b9` 峰值 25881870336 字节触限，
exit 137、cleanup complete。限制 V8 编译并发没有解决该内存问题。

C17 在 D 内一次合并这些根因，不改变输入、原预期或验收门槛：

- `bootstrap/backends/managed.eli` 的 `managed-literal-dependency` 仅标记
  真实 `runtime/core/collection.mjs` 的 `cloneObject`；
  `lower-managed-function` 把原 source 参数登记到该函数自己的 state。
  `lower-managed-object` 仅对这个函数的空对象分配调用
  `value-collection-clone-new(heap, source)`，原复制循环、descriptor、
  getter 次序和异常逻辑原封不动。其它对象表达式不变。
- `bootstrap/runtime/memory.eli` 新 helper：foreign kind35 的输入经私有
  host operation34 分配宿主普通空对象；owned 输入仍走原 `value-object-new`
  默认分配。既有 host request 根与首错回收复用，不增加公共反射归一化。
- `managed-foreign-binding.eli` 的既有私有桥接入 operation34，调用
  `createManagedForeignPlainObject(source)`；它仅返回新对象，不读取 source
  的 constructor、原型、键或 getter。B 先补无观察、独立分配、精确原型与
  安全 __proto__ descriptor 检查；原 sequence golden 继续验证真实三目标。
- matcher 的真实失败由原有快照与 matcher 文件成批解决；保留所有原字段、
  descriptor、原型观察及原 Bun matcher/golden，不更改程序输出。
- 新 Map/Set B 补真实 foreign-entry/factory 接线；sequence 在构建临时值
  已出作用域后、同步 child 启动前回收死垃圾，保留活 IR、原末尾负例和
  全部 61 项。无新 watchdog，无内存硬上限提高或未变化运行的反复重试。

上述 B/C 全部写齐后才整合、重建受影响四阶段并集中复验；本段是施工位置
与签名约定，尚不是修复通过证据。

- [x] B：空对象分配无 source 观察、独立身份、精确宿主原型及安全
  `__proto__` descriptor；原 sequence 协议用例追加实际返回对象三项独立检查。
- [x] C：canonical clone 空分配的 compiler/runtime/host 三处接线完成。
- [x] B/C：Map/Set foreign-entry 接线与原 sequence 垃圾回收/活输入身份
  检查完成；仍保留全部 61 项。
- [ ] B/C：matcher 真实快照逐字段证据及对应确定修复。
- [ ] D：整批生成、固定点、受影响 Node/Bun/sequence 和完整三输出验收。

### C17 实测及 C18 根因修复（P05/P07）

C17 新四阶段构建 run `dc0e8c56e2624afe8009bb728301925d`，
56.757 秒、峰值 3556868096 字节，exit 0、cleanup complete，固定点相同。
Node26：231 注册、229 passed、1 failed、1 原性能延期；Map/Set 实际
reduce 已为 6，剩下真实 Proxy 原型 trap 读取 10 次而 JS 仅 1 次。
Sequence61 已完成的 18 项全部 passed，包括原 core text/object 的
safePrototype；随后 Node 路径仍触 24GiB 上限，43 项未完成。
full GC 没有解决这一阻塞，不再原样重试或提高硬限额。
matcher 真实逐字段结果：标量全部相同，数组 public length/own keys/
逐项值及 descriptor 全相同，但原 Bun matcher 单独比较该数组仍失败。

C18 一次处理余下三根因：

- 真实 matcher 快照先完成 data/descriptor 队列，再从父到子发布同一份
  认证 prototype 图；原 view、最终图及原 matcher/golden 不变。
- foreign literal provider 的旧 kind 对未知 Proxy 先后执行九次
  instanceof，这是额外九个原型 trap 的来源。仅使用实际 host 原生
  Proxy 身份分类能力绕过未知 Proxy 的 literal 试探；持久对象原始
  provider 的 materialize/read/协议身份保留，不能换成 symbol 伪品牌或
  新增 foreign Proxy 的 descriptor/Get 观察。浏览器不新增 Node 静态依赖。
- 序列构建与运行分开生命周期，避免同一进程保留重型发射器/JIT 后再
  同时承载 Node 子进程：新增 `.eli` helper
  `tests/eliscript/managed-sequence-build.eli`，把原 beforeAll 完整构建、
  所有源码身份/IR不变/原imports断言及辅助遍历原样迁入
  `buildSequenceArtifacts(directory)`；以本语言生成的 helper 在受控树内
  独立子进程执行，结束后才运行原 61 项。
- helper 保存完整真实资产与 canonical runtime/literal IR（复用现有
  `serialize-program` / `deserialize-program`，严格 round trip）、原始
  host source 和 public-module IDs；最后写完成清单。父进程校验子进程
  退出和清单后载入同样实际输入，保留末尾原缺依赖负例；负例需要的
  backend 在执行该原用例时加载。不是替代构建、预计算输出或删减语料。
- `bootstrap.el` 增加 helper 的真实生成映射，`.gitignore` 忽略其 MJS/map。
  原原型/GC/输出黄金/61项与 60s 用例时限不变，不增加总超时、watchdog
  或内存硬限额。构建进程的退出实现完整内存回收，不再依赖 GC 会降低 RSS
  的猜测；效果仍须由原整套的真实 guard 与结果判定。

- [x] B：构建清单/完整 IR round trip、失败退出与实际资产接线，matcher
  最终图回归、Proxy 无额外观察与持久对象身份回归全部写齐。
- [x] C：完整构建生命周期抽取、两处边界与映射全部完成。
- [ ] D：仅在上述全齐后整合工具、恢复已认证 stage3 并统一复验。

构建生命周期的 B/C 已落在上述 `.eli` helper、原 sequence 套件及
`bootstrap.el` / ignore 中：完整构建函数与遍历原样迁移，canonical IR
逐份严格 round trip；完成清单最后发布，父进程验证真实不同 producer PID、
原 entry/host source/数量及子进程成功。测试仍 61 项。此轮不更改正式
compiler/runtime 源码，沿用 C17 已认证四阶段与固定点；只重新生成受影响
工具和测试并恢复 C17 stage3，避免重建未变的四代。
Proxy helper 的 matcher 来源闭包必须完整为六项（原四项加新 helper 的
Eli 源与真实生成 MJS），各自认证来源与执行字节；不是只增加一份文件。

C18 真实统一结果：Node26 共 232 项，231 passed、0 failed、1 原性能延期；
run `2e3523bf56bd4aceb741ae9836334a47`，28.817 秒、峰值 9994698752 字节，
exit 0、cleanup complete。原完整 Sequence61 **61 passed / 0 failed**：
同一套真实 WASM/native，在 Bun/Node 四条运行路径全通过；run
`b3d413d1285343369ad0cfa594cab3a4`，256.367 秒、峰值 23393648640 字节，
保持原 24GiB 硬限额、exit 0、cleanup complete。原末尾缺依赖负例也通过。
构建进程退出后，实际父进程 RSS 约 2.8GiB、Node 子进程约 18GiB；
生命周期分离解决了此前同时保留构建内存的阻断，无新增内存额度。
严格 `make byte-compile` 与五份相关 Elisp 工具均通过：run
`b91cf116908d4af49acf2f24d35dd6de`，1.784 秒、峰值 127877120 字节，
exit 0、cleanup complete，五份新增 elc 已回收。

matcher 仍 5 passed / 2 failed，不冒称 C18 已解决。C19 原真实 B 的
原生存储诊断确认快照及 golden 的数组 public length/vector length 都是
3/3，原 source Proxy 为 0/0；因此既不能继续把快照失败归咎于 Proxy，
也不能声称仅延后 prototype 发布已修好。仍保原 matcher、原所有字段、
descriptor、holes、负零与原型断言，后续只调整等义的数组构造路径并
补相应有界实际存储证据，不修改公共对象或 golden。

C20 等义空数组构造已整合且真实验证，仍为 5 passed / 2 failed；run
`233f2aa787d44ed9b4466933d3fbcd92`，9.968 秒、峰值 977600512 字节，
exit 1、cleanup complete。真实数组最终 storage 有索引和正确长度，
对称原型链无 enumerable 差异，失败不能归类为缺少数据或未修复的 Proxy。
保留两项失败；无进一步确定证据之前不反复重试同一程序。

C20 当前源码已冻结，正式 `stage3 targets` 完整同源三输出已启动；
沿用未变的 C17 自举正式编译器，使用原完整语料和显式 small 功能资源档。
JS/WASM/native 三条输出同时执行，原失败/延期/取消分别记录，不能把此前
61 项通过冒称完整三输出通过。新修复仅写隔离 overlay，不能修改该运行
正在读取的源码或资产；此轮记录全收齐后才合并下一确定根因修复。

### 执行边界

- 普通 Git/搜索/文件操作直接执行；重型构建/测试按当前 controlled-run
  独立监控本任务进程树，结合实际系统余量动态调整。无跨对话共享配额，
  不以旧小额度反复阻断，不设置会杀掉仍有进展长构建的总超时。
  确认失控/停滞才处理，并核实归属，绝不停止其他任务或系统服务。
- 全部实现前不运行测试、预审或验证性构建。必要源读取、正常实现生成和
  依赖准备不夹带验证。全量实现后失败成批修，不反复重试不变错误。
- 新增/修改的编译器、工具、测试、驱动必须 `.eli` / `.el`。现有外语言
  实现只作未修改迁移债；本次需改变的能力迁移，不能为赶工新增 JS 模板。
- 所有生成 JS/MJS、IR 中间件、四个阶段和可执行文件放 ignored 构建目录；
  不提交 Git。npm/release 包可以包含由 stage3 产生、运行所需的生成文件。
- 施工期间保持当前版本；功能候选验收闭合后才统一更新 0.0.2。版本变化
  影响真实构建输入，必须对最终 0.0.2 源重新生成四阶段和固定点，并做受
  影响的包/安装验证；不能只给旧 0.0.1 产物贴 0.0.2 标签。
- 本次完成 0.0.2 源码与可发布包、签名提交推送及 CI 交付。实际 npm
  发布或 release tag 按用户明确的发布指令执行，不追加为本次完成条件。
  发布之前须具备打包、内容/依赖检查、干净目录安装及版本身份的真实
  证据；发布有问题不继续递增版本制造垃圾，不掩盖已经发布的版本。
- 代码批次必须检查 status/diff/真实验证证据后签名提交并立即推送对应
  分支；签名失败立即停止报告。保留不相关 WIP 和原作者，不夹带生成物。
  文档检查不能宣称代码门禁已过；交付以对应源码的实际执行证据为准。
- 后续新语法独立立项，不属于本次收尾；本计划不启动或唤起其他对话。

恢复时先读 AGENTS 和本文件，再核实工作区、阶段、活进程及已有证据；
不恢复取消的宿主目标，不重建未变且已认证的阶段，不把旧 Goal 文本看得
比当前范围更优先。仅交付文档不等于创建或同步运行目标。
用户随后已明确授权执行，现已创建对应的活跃目标；
当前从 D 阶段继续，不恢复旧九格目标。

## 8. 可直接使用的完整 Goal 文案

下面代码块是可完整复制的目标正文，含全部十二条要求、施工步骤和完成条件。
在 Eliscript 的 `feat/managed-project-linking` 授权工作树中使用；通过
`git worktree list` 定位该工作树，不覆盖其他检出或无关修改。

```text
/goal 持续完成 Eliscript 0.0.2 的 JavaScript 三段式自举与三种输出验收，直到全部功能、固定点、统一测试及签名发布条件真实成立。唯一施工计划为 docs/bootstrap-0.0.2-plan.md；开始和恢复时读取当前 AGENTS、该计划、工作区状态及原始证据，保留无关 WIP。

本次目标完整定义：
1. 维护一份 Emacs Lisp 原初编译器源码，只要求编译 Eliscript 到 JavaScript。
2. 维护一份 Eliscript 正式编译器源码，可以生成 JavaScript、WASM、native；此编译器本身只要求以 JavaScript 运行。
3. 由 Emacs 驱动原初编译器，从源码生成 JavaScript stage0，称为原初编译器产物；不使用旧发行版或旧生成物替代。
4. stage0 编译正式编译器的 Eliscript 源码，得到 JavaScript stage1。
5. stage1 再编译同一份正式源码，得到 JavaScript stage2。
6. stage2 再编译同一份正式源码，得到 JavaScript stage3；最后正式交付的是 0.0.2 的 stage3。
7. 固定输入、模块ID、配置和逻辑文件名，严格比较 stage2 与 stage3 全部编译器产物原始字节、文件集合、maps、宏来源、IR和必需运行资产，二者应完全相同；不得事后过滤差异。这就是本次三段式自举，不额外要求 stage1==stage2。
8. 只使用最终 stage3 编译同一套 Eliscript 测试代码和输入，分别生成 JavaScript、WASM、native，实际执行并按原严格模型验证结果一致。
9. stage1、stage2、stage3 来自同一份正式源码；不对 stage1/2 增加 WASM/native 输出测试和重复的完整语料验收。
10. 按三段式 bootstrap 的原理实施：原初引导、随后两次自编译和固定点证明。
11. 只有两份维护实现：Emacs Lisp 原初源码和 Eliscript 正式源码；不新增另一套手写编译器。
12. 三个输出目标共用同一份测试源码、有效用例清单、golden和输入；目标特有代码只负责实际执行/IO/ABI适配，不重写语言算法或缩小样例。

取消编译器的 WASM/native 运行形式、九格和三个宿主的自举/初始化/性能工作；保留它们的历史源码与真实证据，不恢复、不计本次完成度。WASM/native 用户程序的代码生成、运行时和实际执行仍是必需交付，不能混淆。新语法、0.1.0、外部后端和困难性能优化不在本次施工范围；困难性能真实记录为延期，不冒充通过。

当前起点：维护中的两种语言源码、三目标后端、JS 自举和完整语料/执行器已有可复用实现；当前新定义的 stage0–stage3 尚未验收。完整目标程序还有容量/初始化、部分 Math/Unicode 等真实失败，详见唯一计划；不得据历史通过或已写代码虚报完成。只修阻碍本次主线的缺陷，不重写无关遗留。

严格按 construction-goal 和 bulk-development 执行以下完整施工顺序。施工清单写完即勾；验收清单只有最后实测通过才勾。不得把两种状态混为完成。

[ ] A：一次补齐全部设计。
核对现有工作树、规则、源码和证据，沿用本文的真实基线、当前/目标源码树、流程图、D00–D08接口与数据，不另起一套重复设计。列清旧宿主任务的取消范围，以及仍必须保留的语言、运行时和三输出用例。冻结原初源码、正式源码、运行库、配置、模块ID和测试清单的身份。把剩余全部工作归入P01–P08，不擅自增加任务。

[ ] B：一次写齐全部测试和验收用例，禁止运行。
T01：Emacs 从源码引导，无旧生成物仍能生成stage0。
T02：三次自编译的实际生成者和源码身份正确，不能替换成预存产物。
T03：stage2/3完整文件和字节比较；额外、缺失、单字节差异和坏来源都能检出。
T04：错误、取消、写盘失败、关闭失败和恢复保留首错及已完成成果。
T05：stage3对同一测试源码生成三种真实产物并执行；拒绝替代算法和预计算结果。
T06：保留并补全原语义、标准库、宏、项目、诊断、数值、Unicode、GC和资源边界用例。
T07：CLI、Worker、浏览器和安装包实际加载stage3。
T08：三输出共用测试，旧宿主专用项明确取消，不借此删除有效语言测试。
T09：最终0.0.2源码、固定点、正式包和安装产物身份一致。
已有有效用例直接复用；新增测试、测试驱动和适配实现只用Eli/Emacs Lisp。这个阶段不运行测试、不试编译、不预审。

[ ] C：一次完成全部生产实现和接线。
C01 / D01：在tools/backends/bootstrap.el增加eliscript-backend-bootstrap-stage0，由维护中的Emacs Lisp编译器直接编完整正式Eli源码图，生成stage0 JS、源码映射和来源清单。逻辑文件名固定，不嵌入物理阶段目录，不借旧seed产物替代。
C02 / D02–D03：新增tools/backends/eliscript/bootstrap-js-stages.eli，实现bootstrapJsStages和compareJsFixedPoint。一次冻结输入，真实打开上一阶段JS编译器，顺序生成stage1、stage2、stage3；每代保存完整产物后关闭，保留有效检查点。精确比较stage2/3，不额外要求stage1==stage2。
C03：完成上述全部测试源码及统一测试入口；仍不运行。
C04 / D04：新增tools/backends/eliscript/stage3-targets.eli，实现runStage3Targets；固定使用JS stage3，复用runCompilerMatrixCell，分别发射和实际运行JS/WASM/native用户程序，共用同一测试清单和输入。不得调用会构建WASM/native编译器的旧九格入口。
C05 / D05：成批修复阻碍三输出的现存容量/初始化和Math/Unicode等真实缺陷。已有代码直接复用，不围绕非阻塞性能、旧编译器二进制宿主或其他细节继续优化；不修改有效预期来掩盖失败。
C06 / D06–D07：完成Make、CI、CLI、Worker、浏览器、打包和ignore接线。增加make bootstrap-release与make check-stage3-targets；两者当前是计划入口，不能冒充已经存在。正式入口指向stage3，涉及修改的旧外语言能力迁到Eli/Emacs Lisp，生成物不进Git。
可按独立文件所有权并行：原初与JS自举链、最终三输出调度、共用测试与主线运行时修复；协调者整合入口和计划。每个协作者都必须遵守A/B/C/D，不能提前运行局部测试或审核。

[ ] D：全部设计、测试编写和生产实现完成后，统一整合验收。
依次实际生成stage0→stage1→stage2→stage3，检查stage2/3完整产物逐字节相同；只用最终stage3执行完整同源三输出验收。运行原必要功能门禁、严格字节编译、CLI/Worker、真实浏览器及声明native平台执行。逐条记录A01–A08的真实结果与证据。独立项可并行，但同一自举链的前后阶段不能跳过依赖并行伪造。
一次收集所有能独立获得的失败，按根因合并修复，随后只复验受影响项；没有源码或环境变化时不反复重试同一失败。困难性能保留原结果并延期，不降低功能或语义标准。

统一验收清单：
[ ] A01：十二条要求、源码/流程/施工/用例映射一致，旧九格不再是前置条件。
[ ] A02：Emacs从维护源实际生成完整stage0，来源和输出均可复核。
[ ] A03：stage0→1→2→3实际依赖和生成记录正确，所有编译器均以JS运行。
[ ] A04：stage2与stage3全部编译器产品文件及原始字节相同，差异检测用例有效。
[ ] A05：只有stage3执行三输出验收，同一份测试代码的JS/WASM/native实际结果按原语义模型一致。
[ ] A06：原必要功能测试和严格字节编译通过；性能延期如实记录，不伪称已通过。
[ ] A07：CLI/Worker/浏览器/安装入口确为stage3；声明native平台有真实机器码执行证据；生成物不提交Git。
[ ] A08：统一更新0.0.2后的最终源码、固定点、包、签名提交、推送及对应CI身份一致，完成当前授权范围内的正式交付。

工作量统一使用P01–P08：规格5%、Emacs stage0 15%、JS三代与固定点15%、测试写齐10%、stage3三输出和主线缺陷20%、入口与包接线10%、统一验收10%、0.0.2交付15%。每项分别记录实现、用例、验收和交付状态；不得把既有实现算成已验收，也不得把已有成果全部归零。汇报必须同时列出stage0/1/2/3状态、最终三输出通过数和下一项，不能再只报0/9。

必须真实满足：Emacs 来源 stage0；正确 producer 的 stage1/2/3；stage2==stage3；最终 stage3 对全部有效共用语料的 JS/WASM/native 三项实际执行一致；原必要功能门禁、严格字节编译、CLI/Worker与真实浏览器、声明 ARM64 原生平台验证；认证的来源、IR、产物、诊断、maps及运行证据完整。仅因用户明确取消的 compiler host 专用条目可以列明ID和理由取消；不能因目标失败就删用例或改golden。不要调用仍会构建 WASM/native compiler 的旧 record-grid 九格入口，用固定JS stage3的单producer三目标调度。

新增或修改的实现、工具、测试、驱动只用 Eliscript/Emacs Lisp；本次改变的旧外语言能力逐步迁移，不新增手写JS/MJS/其他语言，也不把JS藏进模板。生成物只存 ignored 构建目录和发布包，禁止提交中间MJS。首次引导只从维护中的 Emacs Lisp 开始，不依赖外部编译器/优化器/在线服务。

本对话自行受控管理自己的进程树，结合真实余量动态调整内存，不使用共享配额，不因旧小限额停滞，不设置杀掉仍有进展长任务的总超时。确认失控或停滞后仅回收已核实归属的进程；不停止其他开发工作或系统服务。

施工期间保持当前版本。功能候选全部成立后统一更新0.0.2，冻结最终输入并重建受影响的四阶段、固定点及包安装验证；正式包必须来自该stage3。核实npm打包内容、依赖、干净环境实际安装和可发布条件，以A08定义的0.0.2可发布包收口。按项目规则检查status、diff和真实测试证据，签名提交、立即推送、验证签名与远端、通过对应SHA的CI，并完成声明native平台的实际执行验收；签名失败立即停止报告，不绕过。

只依据P01–P08清单和实际证据汇报实现/用例/验收/交付进度、stage0–3状态与最终三输出通过数；不再用旧九格分母，不以代码行数/等待时间作完成度。所有工作必须归清单，禁止无关优化、重复审核、临时工具堆积及碎片测试循环。后续新语法独立立项，不属于本目标；不启动或唤起其他对话。

本目标只有全部上述必要条件真实成立才完成；否则保存具体失败、已有成果、下一步和解除条件继续推进，不以阶段提交或局部测试通过冒充交付完成。
```


### C22 / P05、P07：仅 matcher 使用的认证 Array realm projection

A：C21 八个真实 Bun 对照已证明两种构造下 standard prototype 均通过，
null/完整克隆 Array.prototype/仅删除其非枚举 @@unscopables 均拒绝。
Bun 原 deepMatch 使用 StringsAndSymbols 与 DontEnum Exclude；JSC 对
string、symbol 两轮都过滤 DontEnum。因此不把缺少非枚举 Array API 认作
数据缺失，不再猜构造优化。C20 完整三输出仍在原冻结工作树执行。

源码位置与接口：
- managed-foreign-binding.createManagedForeignBindingRuntime：现 owner/raw ABI
  私有 classifier，先 isManagedSourceViewForRuntime(view, realm) 认证同 owner；
  再原 fromHostValue/frameSet/raw frame-get 与
  value-standard-prototype-existing(heap, 0/1) 作 exact raw ID 比较。
  不读 constructor/name；unknown、跨 heap 不编码。保存并恢复 raw error/class，
  平衡 token/frame；不分配 managed 值、触发主动 GC 或全局 pin。
- managed-source-view：私有 decode-realms WeakMap；registerManagedSourceDecodeRuntime
  绑定 owner/runtime 到同一 opaque realm；withManagedSourceDecode(operation, runtime?)
  和 record 保存/恢复 realm。新 projectManagedSourceViewForMatcher 独立于原
  snapshotManagedSourceView；后者所有公开原型及 descriptor 保持原样。
- managed-host.host-decode-runtime：已有 decode wrapper 仅增加 runtime 上下文；
  project 对象身份及原 descriptor/function 形状不变。
- compiler-corpus-matchers.branch-matcher：仅 toMatchObject 使用新 projection；
  原 Bun matcher、原 golden、其他 expect 方法与未知 foreign 仍原样。

projection 复用现 copies/pending 与完整 descriptor/accessor 复制。只有真实
array 的直接原型及其父层分别认证为同 owner canonical Array/Object.prototype、
原尾为 null 时，才建立专用 Array prototype 分支并在其尾加入 host Array.prototype
锚点。此分支另用独立 copies/pending，不得更改和普通记录共享的 Object.prototype
副本；普通记录不能因此 instanceof Array。源 canonical 层的 own descriptor、
继承 enumerable、holes、undefined、-0、alias/cycle 和 accessor receiver 都保留。
host 标准链有 enumerable 污染时 fail closed；custom/null/foreign/spoof 不认证。

B（先写，不运行）：保留原整体 matcher expected true 与全部 exact 断言；C21
native baseline 明确标准通过、另外三种原型拒绝（仅新诊断，不削原语义）。
真实 WASM/native factory 验证公开 snapshot 不变与 matcher 专用分支隔离；canonical
原型 mutation/data/accessor/enum、holes/readonly/symbol/-0/alias/cycle、custom/null/
foreign/spoof、两 heap、closeModule 后 held view、host enumerable 污染 failclosed、
getter false/undefined 首错及 frame/root/raw error 平衡。禁止单独 probe/局部测试。

施工状态：A 已写；B/C 在本批 overlay 完成后统一整合；D 未执行。

C20 contracts 独立 D 证据（不等于 A06 已通过）：guard
212b4140586f4ddc80af5ae859c31e89 exit2/cleanup true，前六 check passed，
retained m13-01 criteria/inventory/corpus stale 阻断，finalize 同源阻断，
compatibility matrix 两 matrixSha stale。其余独立 verify 实测 passed：
repeat 20/20、surface、API、workflow、documentation、onboarding 6/6、
rehearse 4/4。integrity 显式 ELISCRIPT_DEFER_PERFORMANCE_ACCEPTANCE=1
passed，14 benchmark bindings 明确 DEFERRED / NOT ACCEPTED；无该环境的
原 integrity stale 失败仍保留，没有手改报告。各原日志：
eliscript-candidate20-contract-<name>.log。A06 仍未勾选。

C22 补齐现有 graph decode 接缝：managed-module-graph.attachRuntime 将原
runtime realm 别名登记给 graph facade；原 prepare/read/invoke 动态边界把
facade 交给 withManagedSourceDecode。observeManagedProjectRuntime 只按真实
已认证 toHostValue 函数身份传播 native 外层 API 别名；不改 project transport
身份。真实 B 从同 lowered descriptor 找 report/makeReport cells，通过实际
图 read/invoke 验证上下文，不手造来源记录。

C20 WASM row541（core-stdlib-usage）的原 failure 位于原 expect(api.report).
toMatchObject，完整 diff 只有 Received 额外项（Expected removed 为 0），
observed=[1,2,3] 也打印相同；与现已证实的数组 matcher 边界一致，目前没有
独立 source-value 错误证据。C22 仍保该原完整 golden，是否解除由统一 D 判断，
不能依据本次只读归类标通过。

C22 施工：B/C 源码已写齐到隔离 overlay；D 未执行、未生成、未检查。保留
C20 正式验收运行及全部原失败，不提前覆盖 actual/generated/source assets。

最终精确 alias 接线以此为准：native-managed-runtime 会为所有方法创建新 guarded
closure，因此不能按方法名称或无法溯源的函数推断 realm。其既有 api 变量是
确切来源，原 Object.freeze(methods) 发布表达式仅经私有 WeakMap 登记为 api
的 alias，再交原 observeManagedProjectRuntime；所有方法、project、运行时
对象身份保持原样。graph 只传播已经登记的 runtime alias，不猜函数来源。
registerManagedSourceDecodeRuntime(runtime, owner, classifier?) 只有 factory 的
显式第三参数能创建 realm；普通两参数 alias 查不到 owner 时不登记。

最终 C22 overlay 施工文件：六份生产 Eli（source-view、foreign-binding、
managed-host、managed-module-graph、native-managed-runtime、corpus-matchers），
同一 matcher Eli B，以及本唯一计划。均未生成、未执行、未验证。


### C24 原 macro Node host 的进程生命周期接线（P05/P07）

- A：C20 WASM `original-program:macro-generated-names-node` 的真实原 host
  发起 `import(...).then(...)` 后立即结束模块评价。通用 driver 的
  `await import(host)` 随即进入 `finally context.close()`，晚到的函数
  facade 才访问 graph，得到 `managed graph is closed`。原 Node 子进程
  本来等待事件循环中的导入及全部断言；不是新的初始化或容量失败。
- B：保留原 host/fixture/expected/hash 全字节，补精确 record/host policy
  边界、普通 host 立即 close、false/undefined 第一错误、幂等清理；用实际
  Eli 编译的 Node fire-and-forget 模块导入验证断言执行先于最终 exit 清理。
- C：仅 binary 原 macro Node record 的私有 runtimeOptions 增加
  `originalHostLifetime: process`；host-context 对该精确运输 host 才让
  driver close 等待既有真实 `exit` hook 的同步 close-now。普通 host 不变，
  非该 host 不接受此 policy，不修改原 raw corpus 或用户程序语义。
- D：全部 B/C 写齐后统一生成及受影响批次验证；当前保持 actual 输入冻结，
  overlay 实现不冒称已通过，完整三输出与其余真实失败证据继续保留。

### C23/C25：同批统一验收的真实诊断与独立 Seed 运行库身份

C23 的原 `managedHostInvokeDiagnosticExports` 必需 ABI 包含从未公开导出的
`value-function-code`，真实镜像静默跳过诊断。仅将该项改为可选 own data
callable，不触碰 accessor，保留原状态/class、false/undefined 首错及回收。
对应真实导出与缺少私有导出 B 已写齐；不凭未知 tuple 改 arity 或 GC。

C25：JS record `original-program:compiler-literal-runtime-complete` 的独立
Seed oracle 在原第五 codec 用例抛出 `unsupported object`，不能计等价。
原 host 在 sourceRoot 真实生成的 portable 模块使用 sourceRoot runtime，
而 replay host codec 使用产物目录 runtime 副本，导致集合构造器身份分裂。
只在 `execute-seed-program` 的私有 context 增加 `independentSeedProgram`，
按原完整 suite/fixture/host/runtimeProfile/setup/reference/expected 合同
认证此来源，再复用 `prepareCompilerCorpusNativeProviders` 的完整声明、
字节、realpath 与冲突检查。selected/未知 host 不进入；原独立编译、
全部五项、JS/map 字节比较和 codec 黄金保持。

- [x] B：实际两份 Emacs portable 编译与 JS/map 原字节、完整 codec
  类型/参数身份；缺失声明、被改 runtime 字节拒绝；诊断可选私有 ABI。
- [x] C：C22–C25 所有 overlay 完成，合并进 ignored 隔离工具副本；
  C23/C22 的 managed-host 与 C24/C25 的 execution 独立 hunk 合并。
- [ ] D：隔离整批生成及受影响用例；C20 活源码仍冻结，原完整运行继续。
  所有真实结果收齐后才替换正式候选并统一复验，不将诊断等同修复通过。

### C27：真实持久化解构与普通对象同名数组方法

- A：C26 原三份产品重放确认 map `persistent_shortcuts` code531/count0、
  multi `report` code532/count0、queue `persistent_queue_pop` code542/count1；
  callee kind18、captures0、参数 kind7/count/length 全部合法。
  前两份的持久化 map 被 `value-binding-lookup-exact` 的 kind13/custom
  prototype 拒绝；拒绝消息观察 constructor 时进一步变成 raw bounds。
  queue 的真实 `pop` 尚未 Get 就被 `value-array-method-check` 当非数组拒绝。
- B：复用原 map/multi/queue 源与独立 JS 发射输出，WASM/native 验原报告；
  追加 keyword/symbol/string 区分、缺省与存在 undefined/null、默认值惰性，
  普通对象自身/继承 push/pop/slice 的 getter、receiver、参数、首错顺序，
  原数组原生快路径及 zero imports、清理/live0/frame0。
- C：`managed-literals` 的真实 WeakMap 品牌与 ILookup 协议返回私有 lookup
  tuple；仅已有 literal 上下文的用户 map pattern 调用，未命中品牌返回 nil
  并走原 raw lookup。canonical helper 通过原 namespace/linker 解析，保留
  标签 key 身份，不加 host import。kind13 普通方法进入既有 Get/invoke。
- [x] B：上述完整原 fixture 与独立 JS/Binary 回归源码已写齐，未运行。
- [x] C：上述 lookup/source-method 接线已写齐于 C27 overlay，actual 保持冻结。
- [ ] D：统一生成并完整复验原程序和新增 B；未运行，不计通过。


### C28 / P05、P07：已证 Bun smol 静默退出的精确 runner 路由

A：相同当前源码在 bun --smol test 中 matcher/Seed 两文件约四秒静默 exit1；
标准无 preload 的 bun test 真实收齐22项，Seed15通过，matcher唯一新的 graph
setup 错已纳同批修复。smol 为此分支新增 RSS 策略，不是原 HEAD 执行语义。
只取消 compiler-seed-runtime-identity.test.mjs 与
compiler-corpus-matchers-selfhosted.test.mjs 两个精确 basename 的 smol 参数；
不过滤文件、不改变原用例/child host flags/时限/资源限制，其余文件仍用原
['--smol','test',file]，包括原 ci-contract synthetic fixtures。

源码位置：完整迁 tools/testing/file-workers.mjs 到维护
 tools/testing/file-workers.eli，生成仍原入口（不新增legacy wrapper）；复用
resource-supervisor.mjs 的原 IO，保 FILE_WORKERS=2、exclusive barriers、原序结果、
SIGINT/SIGTERM取消及未启动尾部、严格 shard parsing、所有 outcome/archive 与关闭。
私有 worker-test-arguments(file) 是唯一 mode 分支；主入口仍实际执行整个清单。
不迁移 supervisor，不新增替代监控。编译生成映射/ignore/Make 显式新 B 同批接齐。

B：新增 tests/eliscript/file-workers.eli，测试 scheduleTestFiles 的真实私有参数
选择：两个精确 basename standard；相近名/大小写/未知仍 smol；所有原文件都调用。
复用原 ci-contract 全部 B，原源码不变；新 B 另外核两worker、exclusive/精确两例
顺序、取消、false/undefined run rejection的完整结果、不丢原 failure/resource/message、
listener归还、shard/API严格拒绝。原实际CLI/archive/worker isolation/首错用原
ci-contract 全套集中验收，不复制其 JS synthetic 程序模板。

C28 A/B/C施工完成后冻结；D尚未执行，不因源码迁移或先前standard通过标本批通过。

C28 施工已写齐：维护 Eli runner完整迁移，原六项公开exports及原两worker/
exclusive/取消/分片/outcome/archive流程保留；新增五个B注册，原ci-contract
所有既有B未改。bootstrap两条生成映射、Make原Bun清单单项、ignore四条仅在
本批overlay；旧mjs不手写、不加legacy wrapper，合批生成后才作为ignored产物。
本批未生成/编译/检查/运行，最终D须同时收新B与原ci-contract完整回归。

### C29 / P05、P07：matcher 新 B 的真实 host descriptor capability

- [x] A：C26 部署后六项旧 matcher 用例通过，第七项新增真实图 B 在
  `check-matcher-realm` 的首次 `Object.defineProperty` 报 ELI-RT0003。
  source-view 的 `define` 原样进入 `nativeReflect(10, [source, key, entry])`；
  真实宿主 descriptor 经既有 codec 编码为 foreign 值，运行时按真实 Has/Get
  读取 descriptor 字段，要求已声明的 `source-operation`。原 B 仅开启
  `phased`，未声明 `foreignEntry`，故在真实 managed accessor 之前失败。
- [x] B：保同一原始 program 的 owned lowering 和真实 WASM `imports=[]`
  独立断言；新 host descriptor/Symbol/prototype mutation 路径对同一 IR
  声明 `foreignEntry:true`，严格断言唯一 `eliscript.host/source-operation`
  function、arity=2、ABI=`managed-host-call-v1`，可用 type 信息严格匹配
  `(i32,i32)->i32`。保所有原字段、原型、descriptor、getter 首错、matcher、
  IR 不变及 WASM/native 清理断言。
- [x] C：仅改 `tests/eliscript/compiler-corpus-matchers.eli` 新 B 的两份
  lowering/image 和真实 capability 断言；不改六份 C22 生产实现、raw ABI、
  原 matcher/golden 或当前冻结 generated 文件。
- [ ] D：由统一生成和集中部署验收执行原完整七项；本 overlay 未生成、未运行。


### C30 / P05、P07：source Array 显式 null 原型保真

- [x] A：原 setter 对 source Array 写 parent=0 并置显式 bit8192；
  `heap-reflection-prototype` 与 `heap-source-inherited-prototype` 却在该
  bit 分支把 0 当默认 Object.prototype，`heap-standard-link(type0)` 又会
  将显式 0 回填为 realm Object root。legacy public view 原样读取 raw
  prototype，faithful snapshot/private projection 原样运输该结果，故真实
  缺陷首先位于 raw runtime，而非 matcher 特例。canonical Array.prototype
  创建时 Object root 已存在，`value-array-new` 原本存非零父链。
- [x] B：原真实 WASM/native matcher B 在 custom→null 后先严格验 raw
  public prototype=null、继承 Has/Get 无 toString，再独立验 faithful
  snapshot 与 private projection 均 null；GC 后重复三层断言并验 canonical
  Array.prototype→Object.prototype 未变、own descriptors/alias/self 保留，
  finally 恢复原同 heap Array.prototype。原零-import/capability/golden、
  全字段与所有既有断言保持。
- [x] C：仅两 reader 的 kind14+bit8192 分支直接返回已存 parent；
  `heap-standard-link(type0)` 仅在未设 bit8192 时回填 parent0。其余默认
  懒链、构造器/其他 bit 含义、setter、GC、C27 hunk 和 matcher 生产不变。
- [ ] D：统一生成后执行原完整七项；本 overlay 未生成、未运行、未检查。

### C29 / P05、P07：matcher 新 B 的真实 host descriptor capability

- [x] A：C26 部署后六项旧 matcher 用例通过，第七项新增真实图 B 在
  `check-matcher-realm` 的首次 `Object.defineProperty` 报 ELI-RT0003。
  source-view 的 `define` 原样进入 `nativeReflect(10, [source, key, entry])`；
  真实宿主 descriptor 经既有 codec 编码为 foreign 值，运行时按真实 Has/Get
  读取 descriptor 字段，要求已声明的 `source-operation`。原 B 仅开启
  `phased`，未声明 `foreignEntry`，故在真实 managed accessor 之前失败。
- [x] B：保同一原始 program 的 owned lowering 和真实 WASM `imports=[]`
  独立断言；新 host descriptor/Symbol/prototype mutation 路径对同一 IR
  声明 `foreignEntry:true`，严格断言唯一 `eliscript.host/source-operation`
  function、arity=2、ABI=`managed-host-call-v1`，可用 type 信息严格匹配
  `(i32,i32)->i32`。保所有原字段、原型、descriptor、getter 首错、matcher、
  IR 不变及 WASM/native 清理断言。
- [x] C：仅改 `tests/eliscript/compiler-corpus-matchers.eli` 新 B 的两份
  lowering/image 和真实 capability 断言；不改六份 C22 生产实现、raw ABI、
  原 matcher/golden 或当前冻结 generated 文件。
- [ ] D：由统一生成和集中部署验收执行原完整七项；本 overlay 未生成、未运行。


#### C26–C29 已取得的真实 D 证据

- C26 managed-host 原完整七项通过；run `7db085a4891948f888a5061947e63732`，
  8.928秒、峰值904593408字节、exit0/cleanup complete。三原 product 的
  只读回放已给出内部函数 code531/532/542，首错/原输入完整保留。
- C25 Seed 原完整15项在标准 Bun（无诊断 preload）全部通过；同批 matcher
  新B setup/null失败保留，不能把21/22汇总说成全通过。run
  `bd39276b380b4a7dab9593881e1318f0`，17.681秒、峰值1022279680字节。
- C28 新五项及原CI调度完整30项共35/35通过；run
  `a465828f6c2e4f6fa7b4beee22387525`，7.828秒、峰值343080960字节，
  exit0/cleanup complete。未改任何原CI用例。
- C27 原zero-imports十五项全部通过，包括两目标的原owned report matcher；
  新第十六项在独立JS reference揭示测试lambda的词法this前提错误，
  已改真实普通defun并保receiver断言。run `d103c4ea8c0a4043b6726c75cc6cd287`，
  234.406秒、峰值5360582656字节、exit1/cleanup complete。此前runtime补丁
  错落callback函数的unbound method也已明确移回真正method-check，未盲改
  arity/GC。本轮与C30一起重新冻结，尚无新整批通过结论。
- C20 JS portable-persistent-vector-1 的独立Seed超原30秒；两份实际可执行
  JS逐字一致，原host/flags相同，未找到运输或容量缺陷。本项仍unverified，
  保存原失败，不提时限、不借selected代替独立oracle，最终原参数验收。

- C31 / P05：C20 JS 四条 `original-managed:sorted-core:{node,bun}:auto-{65536,1}`
  均在 provider prelaunch 首次声明数组校验失败。原始 record.request 无 hostSources，
  实际 request.json 已由完整 corpus evidence 补齐；产物只有三个真实 stdlib/tests
  模块，没有 runtime module 冲突。执行路径误读 raw 声明，尚未进入字节冲突检查。
  仅精确四 ID 且原请求无 own hostSources 时复用 sequence 已有 sourceAssets 路径；
  完整 canonical base64、SHA、UTF8、逐文件真实 bytes/realpath、全部 runtime 覆盖及
  runtime alias/product scope 冲突校验不变。显式 hostSources（包括 undefined/null/空）
  不回退到 assets；原 record/request/source/host/golden/auto 与 target 选择均不变。
  B 覆盖四实际 recipe 成功、原数据不变、完整 proof、缺项/重复/伪 base64/SHA/真实字节
  篡改、显式坏声明、runtime 产物冲突、错误现有目录和非精确 ID 不进入。
  施工：新增测试写齐后完成 execution 单独 hunk；验收待根统一 D，不在 overlay 运行。

### C32 / P05、P07：matcher B 服从原 host capability 关闭合同

- [x] A：C30 原七项中六项通过；新增真实图 B 的 null/custom/GC 断言已过，
  末尾 `closeModule`、graph.close、collect 后继续 matcher 失败。
  原 `closeModule -> lifecycle.dispose` 明确置 capabilityOpen=false，所有
  public view 操作进入既有 `using` 后拒绝 `managed host value is closed`。
  外部 raw handle 保 heap root，不等于保留已关闭的 host codec capability。
- [x] B：保关闭前全部原 golden、字段、原型、descriptor、双 heap、GC 和
  matcher 断言；关闭后分别严格断言 public Get、faithful snapshot、private
  projection、原包装 matcher 与原 Bun matcher 均抛 Error，精确 message
  `managed host value is closed`。原 raw root release/live0/帧清理保持。
- [x] C：仅修 `tests/eliscript/compiler-corpus-matchers.eli` 末尾新增 B 的
  错误关闭后读取前提，不改 runtime/legacy、关闭合同、golden 或生产六文件。
- [ ] D：统一生成后执行原完整七项；本 overlay 未生成、未运行、未检查。

### C30 / P05、P07：source Array 显式 null 原型保真

- [x] A：原 setter 对 source Array 写 parent=0 并置显式 bit8192；
  `heap-reflection-prototype` 与 `heap-source-inherited-prototype` 却在该
  bit 分支把 0 当默认 Object.prototype，`heap-standard-link(type0)` 又会
  将显式 0 回填为 realm Object root。legacy public view 原样读取 raw
  prototype，faithful snapshot/private projection 原样运输该结果，故真实
  缺陷首先位于 raw runtime，而非 matcher 特例。canonical Array.prototype
  创建时 Object root 已存在，`value-array-new` 原本存非零父链。
- [x] B：原真实 WASM/native matcher B 在 custom→null 后先严格验 raw
  public prototype=null、继承 Has/Get 无 toString，再独立验 faithful
  snapshot 与 private projection 均 null；GC 后重复三层断言并验 canonical
  Array.prototype→Object.prototype 未变、own descriptors/alias/self 保留，
  finally 恢复原同 heap Array.prototype。原零-import/capability/golden、
  全字段与所有既有断言保持。
- [x] C：仅两 reader 的 kind14+bit8192 分支直接返回已存 parent；
  `heap-standard-link(type0)` 仅在未设 bit8192 时回填 parent0。其余默认
  懒链、构造器/其他 bit 含义、setter、GC、C27 hunk 和 matcher 生产不变。
- [ ] D：统一生成后执行原完整七项；本 overlay 未生成、未运行、未检查。

### C29 / P05、P07：matcher 新 B 的真实 host descriptor capability

- [x] A：C26 部署后六项旧 matcher 用例通过，第七项新增真实图 B 在
  `check-matcher-realm` 的首次 `Object.defineProperty` 报 ELI-RT0003。
  source-view 的 `define` 原样进入 `nativeReflect(10, [source, key, entry])`；
  真实宿主 descriptor 经既有 codec 编码为 foreign 值，运行时按真实 Has/Get
  读取 descriptor 字段，要求已声明的 `source-operation`。原 B 仅开启
  `phased`，未声明 `foreignEntry`，故在真实 managed accessor 之前失败。
- [x] B：保同一原始 program 的 owned lowering 和真实 WASM `imports=[]`
  独立断言；新 host descriptor/Symbol/prototype mutation 路径对同一 IR
  声明 `foreignEntry:true`，严格断言唯一 `eliscript.host/source-operation`
  function、arity=2、ABI=`managed-host-call-v1`，可用 type 信息严格匹配
  `(i32,i32)->i32`。保所有原字段、原型、descriptor、getter 首错、matcher、
  IR 不变及 WASM/native 清理断言。
- [x] C：仅改 `tests/eliscript/compiler-corpus-matchers.eli` 新 B 的两份
  lowering/image 和真实 capability 断言；不改六份 C22 生产实现、raw ABI、
  原 matcher/golden 或当前冻结 generated 文件。
- [ ] D：由统一生成和集中部署验收执行原完整七项；本 overlay 未生成、未运行。

### C33：原完整异步 fixture 的实际能力与纯图零导入

- A：C30 完整 zero-imports 的旧 15 项全部通过；新增第 16 项独立 JS 的
  tagged/queue/ordinary 断言已过，但错误地对含原 multi-arity 异步函数的
  全图断言 imports=[]。`managed-await-host-capability-p` 对真实
  `await (async-choice ...)` 与 `await (Multi/async-report)` 的结果不能证明
  是本地 Promise，按既有互操作合同需要唯一 source-operation，不是
  C27 literal lookup 引入宿主调用。生产能力推导保持不变。
- [x] B/C：由相同 Eli 公共源码片段派生 pure entry，明确 phased roots
  排除未用 multi 模块；独立 JS、WASM/native 仍执行 map/queue/ordinary，
  descriptor 与实际 imports 严格为空。原三份完整 fixture/main/async
  继续真实执行；descriptor 严格唯一 module/name/arity2/ABI，实际 WASM
  二进制 type/import section 关联严格验证 (i32,i32)->i32，不依赖可选的
  引擎类型反射。所有原报告、receiver、getter、golden、资源、live/frame
  断言保留，未运行或生成；不重跑已过 matcher 组。
- [ ] D：统一生成并完整复验受影响 zero-imports；actual 保持冻结。

#### C30–C32 已取得的真实 D 证据

- matcher 原完整七项 7/7 通过，真实 WASM/native 原型、descriptor、跨 heap、GC、关闭后拒绝及原 Bun matcher 均执行；run `d2f5d65389cf4d37a15740fd785e96d1`，9.917 秒、峰值 1510129664 字节、exit0/cleanup complete。
- core-project 原完整七项 7/7 通过，含四条 sorted 归档 provider 认证与所有阴性用例；run `50d03a15e1e341c2a9935d353af0438d`，3.559 秒、峰值 848773120 字节、exit0/cleanup complete。实际四条完整语料仍待重新验收。
- C30 zero-imports 原十五项通过；新第十六项因完整异步 fixture 的零导入前提错误失败。run `1534872541914ca0a4c21007b738f56c`，240.839 秒、峰值 5073551360 字节、exit1/cleanup complete。C33 只修该新增用例的能力边界，不能将旧十五项通过标成整文件通过。
- C20 全量三输出仍在执行；已知失败保留，与修复后的集中验收分开。正式编译器新增 C27/C30 修复后，最终固定点、全门禁、版本与交付仍未完成。

- C34 / P05：C20 native 原百万 vector/map/set 三项在 heap-new 即 ELI-RT0002，
  尚未 initialize 或进入百万循环；不能归因于运行百万的 live 需求或泄漏。
  原发射 request.memory=4096..65535，functional 收据槽数8388607、初始256MiB、
  池上限1GiB/auto16MiB均已正确。执行层仅转发 budget，未将同 profile.memory
  转发原program JSON；native loader于是用缺省 maximumPages256（16MiB），
  256MiB初始池在构造阶段确定不能容纳。抽出原配置函数
  prepareCompilerCorpusRuntimeContext(context,acceptance)，同一路径复制 budget 和
  matching memory，record.memory显式声明优先；不改原百万输入/黄金/auto/负向容量。
  B：三recipe请求memory与真实prelaunch context精确一致；small/显式memory/
  无admission/原数据不变与deferred状态保持。B写齐后C接唯一执行路径，统一D待验。
  WASM同index562仍运行，不能用native构造首错推断它；原同步循环sourceview
  weakref/pin终结时机及全cache同步具有成本风险，未获得实例快照，不据时长停止。

- C37 / P05：C33新增第十六项真实D失败为 phased project 未 prepare，非业务或runtime
  缺陷；原15项已通过不重复。保持同一pure/complete原IR、完整fixture、严格imports/
  ABI/golden/null与IR不变断言。新增B的四个variant/target组合各自创建真实graph、
  唯一deployment目录，createManagedProjectFacades逐文件写入后，以同graph/initfalse
  加既定small budget及memory实例化，loadManagedProjectGraph用真实entry和目录URL
  执行prepare/steps，再原raw report及async观察。所有清理逐项尝试，原首错包括false/
  undefined不被清理覆盖；closeModule/graph.close/collect/live0/frame0/owner.close保留。
  只修测试接线，不改生产或预算。A/B/C完成，待根统一生成与必要D，不提前运行。


- C34 implicit-resources 原完整五项 5/5 通过，run `364ca7af32914c91ae9d484d21a2a1bf`，0.448 秒、峰值 49872896 字节、exit0/cleanup complete。这是实际请求/执行配置及拒绝路径回归，不替代原百万运行。
- C33 新第十六项原 runtime 定向验收失败：实际 phased graph 未 prepare，run `5fbc9d3db42641e095726ab07bc36c46`，17.955 秒、峰值 5053857792 字节。C37 只修新增 B 的真实部署接线，原十五项上轮通过不重跑；新 B 仍待验。此前以非原 Bun 参数启动的一次未形成结果，exit1，保留为失败，不能标通过。

### C35 / P05、P07：语言 object-keys 的真实 foreign options

- [x] A：C20 native atom record565 的原配置诊断保原产物与输入；追加
  Node stack-trace-limit=80 的独立观测定位到原 atom-host.mjs:83，
  `atom(2,{validator:nonnegative})`。实际 callee kind18、argument tuple
  kind7/count2 均有效；原 atom-option-validator 首先调用 object-keys。
  managed lower 把语言 intrinsic 发到 raw value-object-keys，其 ordinary
  路径对 foreign kind35 执行 kind13 guard，精确产生 ELI-RT0001。
  此前基本 atom/reset/swap/compare 已执行，不归因 GC、容量或十万循环。
- [x] B：复用真实 backend/runtime fixture，保独立 JS 发射对照；同一
  intrinsic program 在真实 WASM/native 验 owned/foreign enumerable keys、
  非枚举/继承/Symbol own presence、nullish 空对象语义、primitive、真实
  validator 回调、Proxy ownKeys/descriptor 次序与 false/undefined 首错、
  auto1/帧和最终 live0。保 raw objectKeys(foreign) 原 ELI1 拒绝。
- [x] C：仅 lower-managed-object-operation 的 keys 分支调用新语言私有
  runtime entry value-source-object-keys；该 entry 保根并复用已有
  heap-object-properties-keys，nil/undefined 返回空 array。原 raw keys
  ABI 不变。object-has? 的现有 foreign 分支已正确，保实现并以同族 B
  认证；无 atom/library/host/golden/budget 改动，不扩 object-assoc。
- [ ] D：统一生成后执行新增同族 B 与原完整 atom host；本 overlay 未生成
  或运行。既有失败诊断日志独立保留，不算功能验收通过。

> 更新：2026-10-19。
> 本文件是本次交付的唯一有效施工计划，替代旧 3×3 计划。
> 用户已明确启动本 Goal。A/B/C 已写齐，当前 D：统一整合与实际验收。

## 1. 最终目标和边界

交付以 JavaScript 运行的 Eliscript 正式编译器。它由维护中的 Emacs Lisp
原初编译器引导，依次生成 stage0、stage1、stage2、stage3；stage2 和 stage3
的编译器产物逐字节相同。只使用最终 stage3，对同一套 Eliscript 测试源码
生成 JavaScript、WASM、native 产物，并实际执行、验证结果一致。

**取消本次编译器的 WASM/native 运行形式，取消九格、三条宿主自举链，以及
由此产生的完整编译器二进制初始化和性能验收。** 这不取消 WASM/native
代码生成器，也不取消这两种用户程序产物的运行时、语义和执行验收。
既有取消项的源码和真实证据保留，不为清理旧设计重新开发，不计当前工作量。
`native-wasm-feasibility.md` 此后仅保留历史分析和证据，不再驱动施工。

### 1.1 用户要求逐项落实

| ID | 要求及本计划的确定含义 | 验收 |
| --- | --- | --- |
| R01 | 一份 Emacs Lisp 原初编译器源码，只要求将 Eliscript 编译到 JavaScript | A02 |
| R02 | 一份 Eliscript 正式编译器源码，可输出 JS/WASM/native；编译器自身只要求以 JS 运行 | A03、A05 |
| R03 | bootstrap 由 Emacs 驱动，生成 JavaScript stage0，称原初编译器产物 | A02 |
| R04 | stage0 编译正式编译器的 Eliscript 源码，生成 JS stage1 | A03 |
| R05 | stage1 编译同一份正式源码，生成 JS stage2 | A03 |
| R06 | stage2 编译同一份正式源码，生成 JS stage3；最终发布的是 0.0.2 stage3 | A03、A08 |
| R07 | 严格比较 stage2 与 stage3，编译器产物不得有区别，完成三段式自举 | A04 |
| R08 | 只使用最终 stage3，生成并实际执行三种目标产物，验证输出一致 | A05 |
| R09 | stage1、stage2 与 stage3 使用同一份正式源码；不对 stage1/2 增加 WASM/native 输出验收 | A03、A05 |
| R10 | 采用常见三段式 bootstrap 的原理：原初引导，随后两次自编译并检查固定点 | A02–A04 |
| R11 | 两份维护实现：Emacs Lisp 原初编译器、Eliscript 正式编译器；不增加第三套手写编译器 | A02、A07 |
| R12 | 三个输出目标使用同一份测试代码和输入，不分别维护简化版或替代算法 | A05、A06 |

这里的 stage0 是 Emacs Lisp 编译器**编译正式编译器的 Eliscript 源码后得到的
JavaScript 产物**。不要求把 Emacs Lisp 编译器自身转译成 JavaScript，也不
引入 Emacs Lisp 解释器。stage0 可能包含随正式源码生成的后端模块，但只承担
JS 引导；不把它的 WASM/native 输出能力列为验收条件。

### 1.2 阶段定义

| 阶段 | 生成者 | 输入 | 编译器产物的运行形式 | 本次必须证明的行为 |
| --- | --- | --- | --- | --- |
| 原初源码 | 维护中的 Emacs Lisp | 正式编译器 `.eli` | Emacs 内运行 | 能从源码生成 stage0 JS |
| stage0 | Emacs Lisp 原初编译器 | 冻结的正式 `.eli` | JavaScript | 真实生成 stage1 JS |
| stage1 | stage0 | 同一份正式 `.eli` | JavaScript | 真实生成 stage2 JS |
| stage2 | stage1 | 同一份正式 `.eli` | JavaScript | 真实生成 stage3 JS；参与固定点比较 |
| stage3 | stage2 | 同一份正式 `.eli` | JavaScript | 与 stage2 产物相同；最终三输出与发布验收 |

stage1/2 不运行各自的一整套三目标语料，也不生成 WASM/native 编译器。
它们的必要执行就是参与自举链。固定点不额外要求 stage0==stage1 或
stage1==stage2；不能因此给本次目标增加一条不必要的失败门槛。

## 2. 当前基线与真实缺口

基线分支为 `feat/managed-project-linking`，HEAD 为
`678a52c79bc133d09a0c973b97b9b1b0141ef4a7`。本计划建立时有 316 个
未提交路径，包含既有源码、测试、生成物迁移和其他未交付内容；这只是
工作区快照，不能拿文件数计算完成率。提交本计划不能顺带提交这些代码。

已有成果可以复用，不能从头重写：

- Emacs Lisp 原初前端、Eliscript 正式前端、优化层、JS/WASM/native 发射器、
  托管运行时、项目/宏/诊断/源码映射和大量测试已有实现。
- 旧源码曾实际通过 JS 三代固定点；这是路线可行性的历史证据，不能替代
  当前源码和新 stage0–stage3 定义的正式验收。
- 当前正式源码图基线为 27 个模块；已有 53 份 literal 依赖声明和 794 条
  原始语料。数量来自当前清单，新增必要源码和用例后必须重新冻结，不能把
  这些数字写成阻止正常新增的常量。
- 当前已有完整 JS 项目生成、IR 保存、认证载入和单 producer/单 target
  语料执行器；可以复用，不能再用旧九格入口包装新流程。
- 已取消并回收本对话的 WASM/native 编译器宿主进程，保留原始成功、失败
  和取消证据；取消不能改写为编译成功。

仍会影响新范围的已知缺口：

| 缺口 | 当前证据 | 本次如何处理 |
| --- | --- | --- |
| stage0 还不是新定义的完整正式源码引导 | `bootstrap.el` 目前只由 Emacs 直接编前端，再借后续工具编其他模块 | D01、D02：Emacs 直接生成完整 stage0，移除该新链对旧产物的依赖 |
| 旧自举调度含三个宿主及额外固定点条件 | 旧 `bootstrapCompilerChain` 接受旧 seed，要求每相邻代相同；旧 grid 会构建二进制编译器 | D03、D04：新增薄层纯 Eli JS 自举及最终三输出调度 |
| 完整目标程序仍有容量/初始化失败 | 最新六文件集中结果中，raw runtime 16/16、native adapter 11/11、原初始化 4 项通过；完整 sequence 仍未通过；新增低槽压力也失败 | D05：保留原输入和预算，一次定位并修复真正阻塞三输出的缺陷，不能把此前 slab 代码写成已解决 |
| Math/Unicode 一致性仍有真实失败 | 原整轮中四个相关记录未通过，不能修改模型或结果 hash 冒充通过 | D05：按现有语言合同解决；若涉及不可自行确定的可见语义，保留具体冲突并请求决定，先推进其他工作 |
| 最终门禁和发布尚未闭合 | 当前源码无新定义的 stage2==stage3、stage3 三输出、全门禁及签名发布证据 | D06–D08：统一最后验收和交付 |

历史数值性能通过报告保留；困难性能和新的吞吐优化不阻塞本次功能交付，
也不改写为已通过。取消编译器二进制宿主后，不再为其初始化、GC 或吞吐
另开优化任务。新语法、0.1.0、外部代码生成后端不属于本次目标。

### 2.1 本次读到的源文件快照

下面是本计划的行号基线；实际施工后更新新位置，不能照旧行号盲改。

| 文件 | 基线锚点 | SHA-256 |
| --- | --- | --- |
| `tools/backends/bootstrap.el` | L10 `eliscript-backend-bootstrap`，L98 前端直接编译循环 | `2d764e113a0b89bacef1258b8d7cf0a46625632766b126501d7c9a1c43d7da6a` |
| `tools/backends/compiler-build.eli` | L117 `loadCompilerSources`，`buildIndependentCompiler` | `080f6b1ef8afc2999d459788fdb80c69030d57dbea30c9a48d9c0185c7a0763d` |
| `tools/backends/eliscript/compiler-matrix.eli` | L321 `archiveProduct`，L708 `runCompilerMatrixCell` | `e179c88cee4ada08177f12a2e1eed489d26980e0d30f9d264cfac6b08b567666` |
| `bootstrap/runtime/memory.eli` | `value-module-begin`、`heap-module-cell-read`、namespace reader | `5c8ae63f9af2f4b5dcb8e1ccab47df60a3c0aba445a6c8a5e89446c1c80aa56b` |

### 2.2 当前源码树和调用流程

```text
compiler/*.el                              原初读入/展开/分析/降低/JS 发射
compiler/eliscript.el                      编译及 Source Map 入口
bootstrap/compiler/*.eli                   正式编译器前端
bootstrap/backends/*.eli                   共享层、JS 所需支持、WASM/native 发射
bootstrap/host/compiler-session.eli        正式编译器请求协议
bootstrap/host/compiler-tools.eli          结构化工具协议
bootstrap/runtime/memory.eli               目标程序的共同运行时
stdlib/*.eli                              标准库与托管 literal 源码
tools/backends/bootstrap.el                现有引导入口
tools/backends/compiler-build.eli           源图、编译、IR/产物保存
tools/backends/compiler-bootstrap.mjs       现有认证/归档及旧三宿主调度
tools/backends/eliscript/compiler-matrix.eli 单 producer/target 执行器及旧矩阵
tools/backends/eliscript/compiler-corpus*.eli 原语料、执行/宿主适配
tests/eliscript/*.eli                      维护中的工具及运行时测试
tests/*.el                                原初编译器和 Emacs 测试
Makefile                                  当前统一门禁
.github/workflows/*.yml                    已有平台、浏览器 CI
```

生成 JS、编译阶段目录、依赖缓存未列为源码；均不得作为编译器维护源。

```mermaid
flowchart LR
  E["compiler/*.el"] --> B["bootstrap.el：先编前端"]
  B --> O["现有 JS 引导与 compiler-build.eli"]
  O --> G["旧 bootstrapCompilerChain / record-grid"]
  G --> H["JS、WASM、native 编译器宿主"]
  H --> M["九格与完整原语料"]
  M --> F["当前：有真实失败，未验收发布"]
```

## 3. 确定的目标结构与接口

### 3.1 固定输入和产物边界

1. `bootstrap.el` 从当前维护中的 `.el` 启动，枚举正式 Eli 源图并生成 stage0；
   不允许拿发行版、旧 JS artifact、Bun 打包结果或 wasm/native 编译器代替。
2. stage0 的正式源码清单与 `loadCompilerSources` 一致。JS 驱动开始时只捕获
   一次完整图、runtime/literal 源和构建配置，核对 stage0 已编模块的源码身份，
   调用既有归档能力冻结输入；stage1/2/3 不再各自读一遍可变工作区。
3. 全链 `host=target="javascript"`，固定 JS 引擎、编译选项、模块 ID 和诊断
   文件名。WASM/native 只出现在最终用户程序的 `outputTargets` 中。
4. JS 及 Source Map 的逻辑文件名固定为 canonical module ID / 原相对源码名。
   不把 `stage2`/`stage3` 的物理目录名写入代码或 map；不能事后删除路径、
   时间或差异字段来获得“相同”。
5. 固定点比较所有编译器可执行模块、maps、宏来源、必需运行数据及声明资产的
   完整文件集合和原始字节；另外核对正式源图、保留的 IR/canonicalIR。
   同 SHA 只作索引，仍核对完整路径集合、长度和实际文件。
6. 控制收据中的阶段号、生成者、存放目录和日志是构建过程信息，与编译器
   产物分开存储，事先定义边界；它们可以不同，但不能用这个例外排除编译器
   模块、Source Map 或运行所需数据。
7. 最终三输出比较实际行为，不比较 JS 文本、WASM 字节与机器码是否相同。
   Number 使用精确约定，保留 NaN、正负零、无穷和次正规数；错误类型、
   位置、求值/副作用次序、集合、Unicode、宏、项目及资源恢复按原合同检查。

### 3.2 新接口及记录结构

所有新增实现仅为 `.el` / `.eli`。下面名称、字段和默认值是施工合同，
新增文件尚不存在，不得将计划接口当作已有 API 使用。

| 位置 / 新接口 | 参数与返回 | 责任、状态和错误 |
| --- | --- | --- |
| `bootstrap.el`：`eliscript-backend-bootstrap-stage0` | `output-root`；返回 stage0 manifest 相对路径 | Emacs 直接编正式源码图；写 JS/map 和源码/产物 SHA；任一失败使 stage0 非成功，不调用旧 seed artifact |
| 新 `bootstrap-js-stages.eli`：`bootstrapJsStages` | `{stage0ManifestPath, sourceRoot, outputRoot, signal}` → `{manifestPath, stage3MetadataPath}` | 认证 stage0，捕获/冻结输入，顺序生成三代；每代只开一个 JS producer，保存后关闭；错误原值保留、当代标 failed |
| 同文件：`compareJsFixedPoint` | `{stage2, stage3, sourceIdentity}` → 固定点收据 | 预先定义的全部产品文件及 IR 逐项精确比较；缺文件、额外文件、篡改、输入变化均失败 |
| 新 `stage3-targets.eli`：`runStage3Targets` | `{stage3MetadataPath, bootstrapManifestPath, corpusRecordsPath, outputRoot, nativeTarget, signal}` → 三目标汇总路径 | 先认证固定点与 stage3；固定 `host="javascript"`，只对三 target 调既有 `runCompilerMatrixCell`；独立 session、同一语料，完整收集可独立得到的失败 |

局部状态不得隐藏在全局变量中：`sources` 是本批唯一冻结图；`previousArtifact`
初值为认证 stage0；`stageIndex` 顺序为 1/2/3；`stages` 只保小记录/路径；
`producer` 打开后在 finally 关闭，关闭失败另记且不得覆盖 false/undefined
等原始异常。每代完成后不保留上一代的大型 IR/debug 对象图。

引导收据格式为 `eliscript-js-bootstrap` v1，包含：

```text
status: created | building | failed | cancelled | accepted
seedSourceIdentity: 原初 .el 与引导源的 SHA 清单
formalSourceIdentity: 冻结正式源码、runtime/literal 与配置身份
stages[]:
  stage: 0 | 1 | 2 | 3
  host: javascript
  target: javascript
  producer: emacs-lisp | stage0 | stage1 | stage2
  status: pending | building | built | failed | cancelled
  metadataPath, inputIdentity, productIdentity, error
fixedPoint:
  from: 2
  to: 3
  status: pending | identical | different | failed
  comparisonPath
finalAcceptance:
  status: pending | running | passed | failed
  targets: javascript, wasm, native
  reportPath
```

路径存仓库/批目录相对路径，身份来自真实文件和实际 producer，不能手填。
已有 IR 检查点和归档能力继续使用；失败只记录事实，不修改测量、源码 SHA、
产物 SHA、golden 或原错误。有效的已完成阶段可在同一冻结输入内复用，
源码/选项/必需文件身份改变即判失效，不盲目重新运行未变失败。

stage0 每个模块的发射调用固定为以下形态；变量来自已冻结的模块记录，
不从输出目录拼出逻辑文件名：

```elisp
(eliscript-compile-string-with-source-map
 source relative-filename module-id relative-filename)
```

### 3.3 目标源码树和数据流

```text
compiler/*.el                                   保留：原初源码，只要求 JS
bootstrap/compiler/*.eli                        保留：唯一正式前端源码
bootstrap/backends/*.eli                        保留：正式三目标后端
bootstrap/host/*.eli                            保留/必要迁移：正式协议与 CLI
bootstrap/runtime/memory.eli                     D05：只修真实目标程序阻塞
tools/backends/bootstrap.el                     D01：直接 stage0 与新入口
tools/backends/eliscript/bootstrap-js-stages.eli  D02/D03：新增 JS 三段自举
tools/backends/eliscript/stage3-targets.eli       D04：新增最终三输出薄调度
tools/backends/eliscript/compiler-matrix.eli      复用 runCompilerMatrixCell
tests/eliscript/bootstrap-js-stages.eli          D02/D03：完整引导/固定点 B
tests/eliscript/stage3-targets.eli                D04：同源三输出 B
tests/eliscript/managed-*.eli                    D05：保留/补齐必要运行时 B
tests/eliscript/compiler-*.eli                   D05：保留原语言/项目/工具 B
AGENTS.md                                       D00：当前目标与唯一入口
Makefile、现有 CI 配置、契约与发布配置             D06–D08：统一接线
dist/bootstrap-release/                         生成/忽略，不提交 Git
  stage0/ stage1/ stage2/ stage3/
  sources/ bootstrap.json fixed-point.json targets/
```

```mermaid
flowchart LR
  E["保留：维护 Emacs Lisp 原初源码"] --> S0["D01：直接生成 JS stage0"]
  F["同一份冻结正式 Eli 源码"] --> S0
  S0 --> S1["D03：JS stage1"]
  S1 --> S2["D03：JS stage2"]
  S2 --> S3["D03：JS stage3"]
  F --> S1
  F --> S2
  F --> S3
  S2 --> EQ["stage2 与 stage3 完整产物相同"]
  S3 --> EQ
  EQ --> T["D04：仅最终 stage3"]
  C["一份冻结测试源码与输入"] --> T
  T --> J["JS 产物实际执行"]
  T --> W["WASM 产物实际执行"]
  T --> N["native 产物实际执行"]
  J --> A["同源结果一致与全部必要门禁"]
  W --> A
  N --> A
  A --> R["D08：0.0.2 stage3 正式交付"]
```

## 4. 精确施工差异与接线

| ID | 文件与基线锚点 | 具体变化 | 依赖 / 验收 |
| --- | --- | --- | --- |
| D00 | `AGENTS.md`；本文件新建 | 把当前目标改成 JS stage0–3 + 最终三输出；旧九格只作历史，不能被旧 Goal 自动恢复 | R01–R12 / A01 |
| D01 | `tools/backends/bootstrap.el` L10、L98；`compiler/eliscript.el` L60 | 增加直接 stage0 入口；枚举与 `loadCompilerSources` 相同的 compiler/backends/host `.eli`。按 `(source, relativeFilename, moduleId, relativeFilename)` 调 `eliscript-compile-string-with-source-map`，保存原 emission；不用输出目录相关的 compile-file map 路径。生成 stage0 manifest；不调用旧 seed-product 替代 Emacs | D00 / A02 |
| D02 | 新 `tools/backends/eliscript/bootstrap-js-stages.eli`；`bootstrap.el` 现有 tools 映射 | 定义上述输入、manifest 和认证；捕获同一源码图；先写完全部 B；工具由现有语言系统引导，不新增手写 JS launcher。将生成 CLI 映射到 `tools/backends/dist/bootstrap-js-stages.mjs` 并忽略 | D01 / A02–A04 |
| D03 | 同新文件；`compiler-build.eli` 的 `buildIndependentCompiler`；旧 `compiler-bootstrap.mjs` L202/238/453/504/694/827 仅作能力定位 | 调既有认证/归档能力及真实 JS session 三次，输出 stage1/2/3；本轮不走旧 `bootstrapCompilerChain` 或任意旧 seedArtifact 分支。只检查 stage2==stage3 必要固定点；输入/产物错立即记失败，无 seed fallback。若必须改旧外语言能力，把被改能力迁到 Eli，不扩写旧 JS | D02 / A03、A04 |
| D04 | 新 `tools/backends/eliscript/stage3-targets.eli`；`compiler-matrix.eli` L708；`compiler-corpus.eli` L311 | 固定 JS stage3 metadata，冻结一份 corpus，三个 target 直接调用 `runCompilerMatrixCell`；汇总原执行/IR/诊断/map/来源证据。不得调用会先构建二进制编译器的 `record-grid --cell` 或默认九格 `buildCompilerMatrix` | D03 / A05 |
| D05 | `bootstrap/runtime/memory.eli` module/namespace helpers；对应 `managed-project-*`、`wasm-managed-sequence-data`、literal、Math/Unicode 测试及相关 `.eli`/`.el` | 以现存真实失败为输入，成批解决 stage3 三目标实际阻塞。已有初始化拆帧、slab 和源码身份修复仅是实现，不默认验收；保原低槽、首错、GC、完整标准库/项目/宏和随机差分。不得因新范围缩小而把仍失败的目标程序语义丢掉 | D04 / A05、A06 |
| D06 | `Makefile` L8/10/359/391；`bootstrap.el` tests 映射；`.gitignore`；现有 compatibility/browser CI 与其生成源 | 增加 `bootstrap-release` 和 `check-stage3-targets` 入口，接新 Eli 测试。默认验收编译器宿主只有 JS。旧宿主专用测试列明取消，不跳过同文件里的产品语义；YAML 若为生成物，改其维护源，不手改生成结果。需要改外语言工作流生成器时迁移受影响能力到 Eli/El | D02–D05 / A06、A07 |
| D07 | 现有 CLI、Worker、虚拟项目/浏览器入口及包内入口，正式 compiler graph 的 host 模块 | 正式使用和测试都明确指向 stage3。保原 CLI/Worker/虚拟项目协议；涉及手写 `bootstrap/host/eliscript-cli.mjs` 等入口修改时迁对应 `.eli`，旧实现只作字节不变历史兼容，不新增 JS。浏览器仍加载 JS stage3，能生成和执行 JS/WASM，不需要 WASM 编译器 | D03、D06 / A06、A07 |
| D08 | `package.json`、版本维护源、现有打包/发布入口；本文件交付清单 | 功能候选闭合后更新 0.0.2；重新冻结受版本改动影响的正式输入，重建 stage0–3 并验证最终固定点/包/安装。stage3 为正式产物；npm 包可包含生成 JS，Git 不可提交中间产物。签名提交、签名标签、推送、CI、发布和读回逐项完成 | A02–A07 真实成立 / A08 |

D05 本轮 Unicode 显式 JS 运行档位（不增加原语料分母）：

- [x] A：原 JS 15.1/16 profile 调用宿主 17 数据，实际全 scalar hash 不同；保持原 fixture、版本、hash 与 sigma 预期。默认 JS 全局互操作不改。
- [x] B：`tests/eliscript/unicode-case.eli` 写齐默认不安装、真实 String identity/name/length/不可构造/descriptor、generic receiver 与 Symbol 拒绝、ToString 首错、UTF16/三码点展开/FinalSigma、真实用户覆盖/delete、三版本全 scalar 原 hash，以及错误 selected 程序必须拒绝。尚未运行。
- [x] C：公开 `runtime/unicode-case.eli` 的 `installUnicodeCaseProfile(version, realm)`；纯 Eli host 在独立进程显式安装后加载实际 selected JS 用户程序。数据由维护中的 `.el` 生成器从 `memory.eli` 唯一 Unicode 区抽出 24 个纯版本函数，忽略的 `.eli/.mjs` 数据不是另一份维护表；binary Unicode 路线不变。
- [ ] D：统一生成后验证上述 B，再以最终 stage3 原同源三目标语料执行实际 profile 记录；独立进程的成功必须来自选定产物调用 String 方法，不能用 helper 输出代替。原 full-scalar 与 sigma hash 任一不同仍失败，未经实际执行不得填写 A05/A06 通过。

以上新入口的最终命令约定为：

```text
make bootstrap-release
make check-stage3-targets
make byte-compile
ELISCRIPT_SEQUENCE_FUNCTIONAL_RUNTIME_PROFILE=small ELISCRIPT_DEFER_PERFORMANCE_ACCEPTANCE=1 make --assume-old=bootstrap-backends test
make check-browsers
```

这些入口已实现；D 阶段按当前冻结批次统一执行。`--assume-old` 仅复用
首条命令已完成的工具生成，不跳过测试。独立 `make test` 仍保留原构建步骤。
Emacs/Node/Bun 的位置由现有变量和环境确定，文档和代码不硬编码本机绝对路径。
CLI 配置只接受 JS compiler host；三目标的 target 参数仍保持原来三种取值。

## 5. 大开大合的施工顺序、并行和工作量

严格 A→B→C→D：全部精确设计完成；全部测试和 BDD 用例写齐但不运行；
全部生产实现及接线完成；最后才统一构建、测试、审核、验收。
不能把“每切片 TDD”解释成中途 Red/Green 试跑，也不能在每完成一个文件后
重复局部验收。最终收集完整可独立得到的失败，再合成修复批次；仅实际改变
或受影响的内容复验，不重跑已通过且未受影响的能力。

### 5.1 完整工作量表

此表覆盖新目标全部工作；旧 1220 分母和九格百分比不再适用。
这是本次收尾目标的清单，不是把整个语言项目过去的成果归零。

| 项目 | 权重 | 施工内容 | 当前起点 | 验收 |
| --- | ---: | --- | --- | --- |
| P01 | 5 | D00：最终规格、施工手册、Goal 和当前入口 | 本次编写；不启动新 Goal | A01 |
| P02 | 15 | D01/D02：Emacs 直接 stage0、来源身份与入口 | 原初编译器已存在，新 stage0 接线待做 | A02 |
| P03 | 15 | D03：JS stage1/2/3、完整固定点与失败恢复 | 可复用旧 JS 固定点能力，新阶段调度待做 | A03、A04 |
| P04 | 10 | 全范围 B：引导/调度/篡改/取消/资源/BDD 用例一次写齐 | 大量语义测试已存在；新阶段用例待补 | A02–A06 |
| P05 | 20 | D04/D05：仅 stage3 的同源三输出及真实阻塞修复 | 三后端/语料/执行器已有；当前仍有真实失败 | A05 |
| P06 | 10 | D06/D07：默认入口、CLI/浏览器/包与生成物接线 | 已有功能复用，最终 stage3 身份接线待做 | A06、A07 |
| P07 | 10 | 最后集中本地、严格字节编译、浏览器和对应提交 CI | 现有门禁保留，不能用历史绿代替本轮 | A06、A07 |
| P08 | 15 | D08：0.0.2 正式 stage3、签名交付、发布和善后 | 未完成，不提前升级/打标签/发布 | A08 |
| 合计 | 100 | 所有本次必要工作 | 取消的编译器二进制宿主不在分母内 | |

汇报各项的实现 I、用例写齐 B、正式验收 A、交付 D 四个独立状态。

#### P05 / A05 / A06：显式功能资源档与原容量证据

candidate4 的完整 WASM 采样进一步确认正常 original-program/stdlib
项目未声明 runtime budget 时，host 原默认是 1024 槽、65536 initialBytes、
16777216 maxBytes、auto=0；不能把这一隐式档的容量失败当成功。本合批仅在
显式 `functionalRuntimeProfile=small` 下，对绑定 stable-compatibility 的
正常 seed-program/oracleRequired 项目补现有 small 功能档，逐条保存原默认、
effectiveRuntimeOptions 与 deferred。已有 sequence 的显式延期边界保留；
其它显式低槽、负向/OOM/越界/恢复和 compiler-runtime 档不覆盖。
原始 records/源码/期望/独立 oracle 不变，strict baseline 仍可原命令复现。
二进制发射时同步采用已存在 small 的 memory 声明，避免加载后才扩大预算。

同批 source-map companion 先以原完整认证 sourceAssets/虚拟布局向同一
selected session 请求原 `project-plan`，仅把真实 reachable 源传给原 map
归档流程；不把所有输入标准库强行作为 root，不根据输出倒推期望。
原 module/map SHA、独立原 suite 地图断言和完整 raw source archive 均保留。
本批 B/C 写齐，统一生成/行为验收尚未执行。

同源三输出 Math 兼容能力：原 Node 记录在 `method_description` 读取
不存在的 `f16round`/`sumPrecise` descriptor；Bun 原记录在精确求和
golden 的 `Object.is` 比较失败。原测试的可选 host oracle 有 typeof
guard，完整 corpus 仍要求这两项标准能力，不跳过或改变 golden。
维护源 `runtime/math.eli` 用直接 binary64→binary16 ties-even 和独立
base-2^16 正/负 superaccumulator 实现；后者 135 limbs 覆盖规范最多
2^53−1 个 Number 的完整指数域，最后相减并舍入一次，保留 -0、NaN、
无穷和 IteratorStepValue/IteratorClose 的首错规则。首次模块初始化只在
原 Math 对象定义两个标准 named、length=1、非构造函数，之后真实
getter/赋值/delete 不自动重装，其他 Math 方法不替换。

- [x] B：纯 Eli 数学运行时测试保留独立 BigInt 精确模型、binary16
  边界/双舍入、固定与种子 f64 抵消、30 个 iterator 模式，以及两方法
  getter/receiver/参数次序/删除/重复导入；相同测试也由独立 Bun 执行。
- [x] C：维护 Emacs 两发射器与正式 Eli emitter 同步生成生产 Math
  初始化 import；bootstrap 先直接生成无自依赖的 runtime；其 Eli 源
  作为 `runtime/math.mjs` 正式模块纳入 stage0→3 源/产物完整身份，发布
  runtime 使用认证 stage3 实际模块，原53 literal 闭包不扩大。
- [ ] D：统一生成、固定点、新运行时回归和原完整 Math 记录待验收。

P05 三目标调度接线：正式 `runStage3Targets` 认证并冻结同一 stage3/
完整语料后，在同一父进程中立即启动 JavaScript、WASM、native 三个原
cell，使用 `Promise.all` 等待全部独立结果，不等 JavaScript 全部记录完成
才启动另两目标。父级 `controlled-run` 保持整树 24 GiB 硬限额，不为调度
创建额外 worker/进程；各 cell 原有实际执行、证据和取消能力不变。
`targets` 汇总始终按 JavaScript/WASM/native 排序，原始首错按实际发生
顺序保存（包括 `false`/`undefined`），全部独立结果保存后才抛出首错。
私有、未认证的调度测试接缝可选 `parallelTargets`，缺省串行；正式入口
不接受 caller 替换调度或 cell，固定启用三目标并行。每次从 observer
返回后再次检查取消，尚未实际进入的 cell 不启动，observer 错误不覆盖
执行错误。原 `functionalRuntimeProfile` 透传及 deferred 汇总不变。

- [x] B：新增同时启动/逆序完成仍固定结果顺序、同进程无新增 worker/
  process、全部独立错误与首个 false/undefined、开始前/observer/首 cell
  取消以及 observer 抛错隔离的完整 Eli 回归；原串行与资源回归保留。
- [x] C：提取单目标私有执行函数，正式入口固定并行三个实际 cell。
- [ ] D：统一生成及全部受影响门禁、正式三输出实际验收待执行。

P05 candidate4 checkpoint 的 managed 输入作用域修复：请求中的显式
`entries` 必须传到真实二进制链接器；为 host ESM 保留的其他源模块仍
经过原编译、缓存和 JavaScript 输出流程，但不因此成为 managed 执行根。
`managed-literal-user-import` 在真实 `module-declaration` 容器内递归，
把 canonical runtime 导入连到既有私有 literal 图；普通外部 HTTP provider
与真实 host 能力不删除，原 core/sorted 的 `zeroImports` 断言不变。
HTTP 源的 `instance?` 使用现有 Eli Get/Reflect.apply/Boolean 操作，保留
右值对象/可调用拒绝、`@@hasInstance` 一次读取和结果布尔转换；不增加
任意 raw JavaScript 支持。语言 equality/type 正例的 NaN、负零及 frozen
观察改用已有 Eli 字面量/调用；protocol fixture 的 Box 只迁移该用例实际
构造数据的方式，保持命名、原 prototype 可见描述符及协议身份/分派，
不声明新增 JS class、非 new 调用或 subclass 语义。

- [x] B：补真实完整 compiler session 的 entries/显式不可达拒绝/恢复及
  原 JavaScript 模块输出保留；补 wrapped/unwrapped canonical 导入的
  真实 literal 图、不变 IR 和零 host 声明；直接使用实际 HTTP 私有函数
  节点对照独立 JS、WASM/native、auto1/零根与原型异常的回归。
- [x] C：entries 透传、module 容器递归、HTTP 实现及三个正例源迁移。
- [ ] D：尚未生成或运行；原 checkpoint 失败证据不改判。

P08 本轮独立包/浏览器运输补全：`transport/` 自己声明私有 `eliscript`
scope 与真实 Math/maps，保外层自定义包名。既有 Bun browser bundler 从
真实运输入口和已经校验复制的 JS 编译器入口生成单独 browser bundle/maps；
`browserArtifact` 的实际文件 SHA 与原 source/artifact/product provenance
分开记录，原认证 stage3 目录、源码、maps 和原 artifactIdentity 不改。
纯 Eli 浏览器入口仅在省略 manifestURL 时选同目录 derived metadata，显式
URL/取消/原 Worker 操作仍交原 API；Pages 发布的工具 Worker/Browser 也由
同一既有 bundler 形成无 document import map 依赖的运输闭包。

- [x] B/C：原包测试保留全部字节/身份/CLI/原错误，增加 transport scope、
  derived 真 SHA/provenance 与自定义包的真实 Chromium module Worker
  （纯 Eli probe、无 import map、取消 false、坏显式 manifest 拒绝）。
- [ ] D：统一生成与包/Pages/原浏览器门禁待执行；打包派生物不计作
  stage2==stage3 原字节固定点证据。

同批原生互操作修复：`original-program:core-project-{core,utility,
persistent-values,value-text,public}` 的 JavaScript 原 host 从 canonical
sourceRoot 创建原生集合；所选 stdlib 仍须使用同一 provider URL 的协议
Symbol。原测试以 runtime symlink 达到此身份，运输后的完整 hostSources
不应复制出第二份注册表。`prepareCompilerCorpusNativeProviders` 仅对此五项
验证完整 runtime 声明与 sourceRoot 实际文件的逐文件字节/SHA，一旦产物
已经发射 runtime 模块、存在非 canonical runtime 目录或同名本地 package
则拒绝；验证后只过滤执行私有副本的 runtime sidecars，原记录、归档、
23 模块、host 和 expected 不变。既有 aliases/package 路由复用 canonical
provider，execution/outcome 保存真实 provider 来源和逐文件哈希。

- [x] B：原 core-project corpus 回归追加真实 selected transient 与 canonical
  PersistentVector 互操作、原声明不变、provider 真 SHA、篡改/缺项/重复/
  emitted-provider 冲突拒绝、非该五项及非 JS 路径不改变。
- [x] C：execution 私有路由和 matrix 成功/失败 outcome 证据接线；不改
  legacy 运输实现或生产库算法。
- [ ] D：统一生成并运行受影响回归与完整原记录，尚未验收。

同轮 sequence 运输阻塞：relational-set 的两个 host 在独立参考中将原生
literal vector 交给另一份 portable protocol；standard-identities 的 Node
host 在 data URL 中导入绝对文件路径；project-entry 的 Bun host 未向
namespace loader 第二参数提供已加载的真实 namespace。仅四条明确
sequence native-interop 记录沿原 suite 的 Reader import span 将真实
canonical runtime 相对引用运输为 `eliscript/runtime/*`，其 runtime 源由
原 literal graph 提供，不再作为第二份项目模块发射。raw records/fixtures
和哈希不变，request/outcome 保存源码与运输源码 SHA 及真实 import 边。
JS 复用已认证 canonical provider；独立 Seed 仍编译同一运输图。

- [x] B：真实 namespace 第二参/身份回归、四条原 sequence source/SHA/
  导入边/原始记录不变回归；原所有协议 Symbol 方向与 relational-set
  完整 host 观察断言保留。
- [x] C：project-entry 真实 namespace + Map；standard-identities 的原完整
  断言迁入已绑定 Eli host，选中模块与 native providers 均通过真实
  namespace 取值；sequence 请求/私有执行图按原 import 路由，保原门槛。
- [ ] D：尚未统一生成/运行，不把旧四个真实失败记为修复通过。

literal nth 的 small 档真实功能失败继续 OPEN：现有原日志已证明失败在
`runtime.project.prepare()`，尚未执行 nth，live 5364/131072，不是原
1024 容量失败。`value-module-abort` 会清除 active slab 根；仅凭返回的
ELI3/TypeError 不足以认定 nth 或 GC 语义错误。本批不猜改该生产语义。

- [x] B：existing allocator detail helper 的可选 descriptor 回归覆盖无 slab、
  唯一真实七字段 refs slab、多个匹配不归因、坏 descriptor/访问器拒绝、
  默认输出形状和原快照/GC/managed 状态不变。
- [x] C：`readManagedAllocatorValueCounts(runtime, descriptor)` 在已有扫描中
  检查 live kind8 的完整声明标志；仅唯一匹配时给出有界 first-uninitialized
  prepared binding index/name。原 nth helper 仅在实际 TypeError 后、原诊断
  collect 前读取，诊断失败不替换原首错。默认 snapshot/counts API 不变。
- [ ] D：统一生成后以现有 `ELISCRIPT_PROJECT_ALLOCATOR_DIAGNOSTIC=1` 的
  原 small 输入一次取得 initializer；nth 功能尚未通过，不冒称已修复。

原完整 sequence 用户程序的 1024 槽记录、预算、源字节、ID、独立 Seed
oracle 及失败收据全部保留，不把它们改写成容量通过。按功能优先决定，
最终 stage3 调度可显式传 `functionalRuntimeProfile: "small"`（CLI 为
`targets --functional-runtime-profile small`）。只有精确绑定原 sequence
suite/fixture、`original-managed:sequence-data*` 的正常完整程序使用已有
`independentCompilerResources({profile:"small"})` 预算；缺省仍运行严格基线。
诊断、负例、OOM、容量恢复和其他程序不覆盖预算。JS/WASM/native 使用
同一显式策略，保原 auto、内存声明、源码、输入、断言及 oracle。
原正向 suite 的功能专用命令显式设置
`ELISCRIPT_SEQUENCE_FUNCTIONAL_RUNTIME_PROFILE=small`；不设置时原
1024 baseline 不变，独立负例/OOM/恢复测试不消费此开关。每次正常
执行的私有 `run.json` 保存两组资源和延期状态，不改 fixture 或原 corpus。

流程为冻结原 corpus 字节 → 按原 record 归档/编译 → 仅私有执行副本选择
功能预算 → 原真实执行及独立 oracle 比较 → 分别保存功能与资源状态。
执行 observation、每条 outcome 和 stage3 汇总记录
`originalRuntimeOptions` / `effectiveRuntimeOptions`，容量状态明确为
`resourceAcceptance: "deferred"`，原 1024 容量仍未验收；功能等价不代表
容量或性能通过。不得修改原 corpus records 文件或它的 SHA。

- [x] B：纯 Eli 回归覆盖显式/缺省配置、三目标同档、原字节/IEEE/ID不变、
  非正常程序不覆盖、未知档拒绝及报告中功能/容量分离。
- [x] C：execution 私有资源包装、matrix outcome、stage3 调度/汇总及 CLI
  接线完整；不改 legacy 实现、原输入或模型。
- [ ] D：先保留严格基线终态，再用显式 small 跑原完整功能；只按实际
  功能结果填写 A05/A06，1024 容量仍标 DEFERRED / NOT ACCEPTED。
每个状态只按对应清单的完成项比例计，不按文件数、代码行数或隐藏计算量计。
收尾完成度统一计算为 `Σ 权重 × (0.5I + 0.2B + 0.2A + 0.1D)`；同时展示
stage0–3 的实际状态和 stage3 三目标通过数。启动施工时根据当前证据登记
初始值，不把“已有实现”冒充“已验收”，也不把旧 0/9 当新目标的全部进度。
列不进本表的工作不得擅自开展；真实新增主线缺口必须先补原表及验收映射。

### 5.2 施工清单：代码写完才勾，不能当作验收通过

本次执行接线补充（沿 D06/D07，不增加交付范围）：

包命令分发入口也使用 Eli：`tools/backends/eliscript/package-cli-entry.eli`
生成 `bootstrap/host/eliscript-cli.mjs`，原入口原样保存在 legacy 文件。
保留全部七个命令、基于入口位置定位包、调用名称、现有环境变量优先级、
参数及异步错误退出；新 `eliscript-compiler` 路由仍使用认证 stage3。
Emacs 引导器只为这个可执行产物添加 shebang、相应 Source Map 行偏移和
可执行权限。生成入口 ignored/untracked，不作为第三份维护实现。
现有 package-surface 七命令实际执行和 package-install 三输出用例作为 B；
本条 C 完成后与全批统一 D，不单独启动包构建或测试。

同一 Emacs 前置步骤从维护中的 `stdlib/core/{protocol,text,object}.eli`
生成 `runtime/core/*-impl.mjs` 及 maps，替代对 Git 中生成物的依赖；
源与输出显式配对，并在首次启动 JS 工具前全部生成。这三项生成物
ignored/untracked，原 runtime 手写外壳和未受影响的 legacy 实现保留。
B 复用现有 source-only 引导及严格逐字节、逐 map 的生成一致性用例，
不得靠保留编译生成物于 Git 中满足干净 checkout。

统一功能门禁复用本轮已经真实执行并通过引导的生成批次：完成
`bootstrap-release`、发布准备及三输出后，执行原 `make test` 的全部测试
与契约，仅以 `--assume-old=bootstrap-backends` 禁止重复生成前置工具。
这不跳过任何测试或改动默认独立 `make test`；避免再次用早期 Emacs
产物覆盖刚安装的 stage3 runtime，以及在验收中混合两个生成批次。
门禁前后保留相同 source/product 身份；源码改变时不能使用旧冻结批次。

同批 Math 运行时引入真实 package import 后，原 numeric reference helper
须保留实际发射文件的 URL。`wasm-managed-numeric-shared.eli:loadReference`
先写原字节，再以 canonical path 取得真实 namespace，作为 loader 第二参
Map 提供；不再把这份程序改为无法解析 package 的 data URL。B 增加真实
Math import、namespace identity、原文件字节及两项精确运算结果回归。
此 B/C 已写，随全批统一 D，原独立参考程序及算法断言不变。

同批原 sequence 在公开 small 档的 `ELI-RT0001` 已定位为 host 解码 ABI
错配：`decodeLiteralProtocol` 对已确认 kind18 的协议方法读取真实 `slot`，
却调用仅接收 kind13 的 raw `value-object-get`。这不是句柄已失效的证据。
新增 `managed-host.eli` 生成原 host 入口，原字节实现保留为
`managed-host-legacy.mjs`。只向 legacy host 传入私有 exports descriptors
副本：kind18 的该读取调用既有 `value-property-get(heap, value, key, 0)`，
其他 kind 仍调用原 Object ABI；真实 WASM/native exports 与其拒绝合同不变。
三个未改导出保持原函数 identity，factory 用三个 required 参数及 rest
逐项转发，保省略、显式 undefined 与 null 的原默认/拒绝行为。

- [x] B：真实发射函数的 Symbol slot、独立 JS 参考、WASM/native 读取、
  GC 身份、getter 抛 false、caller frame 和完全释放回归已写；raw Object
  Get 对真实函数仍拒绝，原完整 sequence 继续检验实际协议初始化。
- [x] C：纯 Eli bridge、原字节 legacy、生成映射/ignore，以及 sequence 和
  project-entry 的 bridge 源/生成入口/legacy 三份真实 SHA sourceAssets 已写。
  包与页面运输沿原清单携带 legacy，不另造 ABI 或错误放行规则。
- [ ] D：统一生成后执行上述新回归及原完整 sequence；当前不宣称功能已过。

Math 支持作为正式普通模块 `{id:"runtime/math.mjs",
filename:"runtime/math.eli"}` 纳入 Emacs stage0 与 `loadCompilerSources`
同一源码清单；沿现有 modules 产品归档、maps/IR 及固定点比较，不扩展
原 53 项 literal 图。准备发布包时，既复制到公开 `dist/runtime` 视图，也
将真实 stage3 math 模块复制到 package runtime 路径，不能继续发布 Emacs
早期引导产物。`check-stage3-targets` 先完成包准备，再启动新的 Node 验收
进程并捕获完整资产；CLI 执行入口检查该运行时确为选定 stage3 的原字节。
干净包安装共享程序增加直接 binary16 舍入、精确抵消和三目标相同模型；
准备阶段逐字节检查真实 runtime 与 stage3 产品。B/C 已写，D 尚未运行。

- 新 `tools/backends/eliscript/release-cli.eli` 生成
  `tools/backends/dist/release-cli.mjs`，导出
  `runReleaseCLI(args, io)`、`resolveReleaseCompiler(options)`、
  `renderReleaseCLIError(error, options)`；最终编译器认证复用
  `authenticateStage3Targets`，不为 CLI 加载整份语料。
- 新 `compiler-cli-entry.eli` 生成原公共 CLI 路径，转发上述入口；旧 CLI
  未改能力保留原字节在 `compiler-cli-legacy.mjs`，只用于既有编译/项目/包传输。
  新默认入口认证 JS stage3，旧九格及二进制宿主命令明确拒绝。
- 新 `tools/ci/release-workflow.eli` 生成
  `tools/ci/dist/compiler-release.mjs`，导出 `renderCompilerReleaseWorkflow(matrix)`；
  新工作流 `.github/workflows/compiler-release.yml` 在声明的两个 ARM64 平台
  执行本次 JS 自举和最终三输出，保留现有通用/浏览器工作流及其原门禁。
- 新 `tests/eliscript/bootstrap-release-integration.eli` 覆盖上述 CLI、CI 和包接线。
  这些测试已编写，尚未执行；B 全部写齐后才统一转 C。

- [x] C00：本文件明确 R01–R12、新旧范围与 A/B/C/D，建立唯一入口。
- [x] C01：D01 的 Emacs 直接 stage0、manifest 和固定逻辑路径全部写完。
- [x] C02：D02/D03 引导、认证、stage1–3、固定点和错误清理代码全部写完。
- [x] C03：T01–T09 及 BDD/阴性/真实执行用例写齐，未运行。
- [x] C04：D04 的 stage3 三目标同源调度与汇总全部写完。
- [x] C05：D05 当前最窄运行时方案已落盘，原语义及资源测试均保留；实际容量失败是否解除待 D 验证，不能宣称已修复。
- [x] C06：D06/D07 的 Make/CI/契约/CLI/浏览器/包/ignore 接线全部完成。
- [ ] C07：A/B/C 全部完成后统一验收；完整收集失败，按根因成批修正。
- [ ] C08：A02–A07 成立后完成版本冻结、最终重建、A08 发布和善后。

新阶段 A 的源码定位已完成；本文档的交付不表示 C01–C08 已实施或验收。
并行只分独立所有权：一组负责 stage0/JS 链，一组负责最终三输出调度，一组
负责共用测试和必要 runtime 缺陷；主协调负责入口/计划/最后统一整合。
阶段有依赖时前向推进，禁止任一协作者提前跑局部测试或旧宿主任务。

#### P06 / A06 / A07：deterministic 生成物的真实 Git 存储合同

本轮 D 发现 `tools/integrity/check.mjs:checkGeneratedMarkerCoverage`
只从 tracked MJS 搜集 marker，再与四个 deterministic 输出精确比较；
这会强迫生成物进入 Git，与本次只维护 Eli/El 源码的交付规则冲突。
原始 dependency、benchmark source/history、derived workflow/API 与逐字节
再生校验仍全部保留，不能用虚构 tracked 列表绕过。

本批源码树与调用差异：

```text
tools/integrity/eliscript/check.eli -> tools/integrity/check.mjs (ignored)
  -> check-legacy.mjs (原实现字节不变：依赖/benchmark/错误类型)
tests/eliscript/repository-integrity.eli -> tests/repository-integrity.test.mjs (ignored)
  -> repository-integrity-test-legacy.mjs (原八个用例字节不变并实际注册)
```

原流程 `tracked MJS -> marker inventory -> deterministic bytes/maps`
改为 `真实 tracked 集合 + runtime/core、tests/snapshots 的直接文件 inventory
-> marker 与 registry 精确比较 -> source tracked / output+map ignored 且 untracked
-> 同原编译器逐字节再生 JS/maps -> 原 derived / benchmark 校验`。
不扫描 dist，不把 bootstrap 工具生成物混入原四项 deterministic registry。
公开错误类、依赖和历史校验函数仍是原函数身份；仅迁移 generated-artifact
编排、必要私有校验和 CLI，避免旧模块词法调用绕过新 marker 规则。

- [x] A：限定上述函数及原 registry 的两个输出目录；保真实 tracked 集合和原错误。
- [x] B：原八例仍运行；新增四例涵盖真实 Git ignored/untracked 输出、漏登记或缺 marker、
  tracked output/map、未跟踪源码、缺失 ignore，以及 stale JS/map 和缺文件精确拒绝。
- [x] C：纯 Eli facade/CLI 与同名测试入口完成；原两份 MJS 仅按字节改名，
  snapshot 由维护中的 Eli fixture 生成，映射/ignore 由根代理统一接线。
- [ ] D：统一生成与受影响完整测试待执行；源码完成不等于这些门禁已通过。

#### P06 / A06：混合测试套件的精确最终功能 scope

原 `tools/testing/file-workers.mjs` 只按文件分片/运行，不能在两个混合文件
保留用户程序测试的同时排除已取消的编译器二进制宿主任务。原文件及其所有
测试正文保持原字节，增加纯 Eli `tools/testing/final-functional-scope.eli`
生成同目录 MJS，作为 Make 的统一 Bun 测试驱动：

```text
原 CLI 文件参数 -> parseTestFileArgs / partitionTestFiles
  -> 两个 mixed suite 的完整真实 SHA 与精确 title 展开绑定
  -> 普通连续文件组：原 runTestFiles（原 monitor 与并发）
  -> mixed suite：原 supervisor + Bun --smol test + 精确负向 title pattern
  -> 完整 sequence：独立 Bun --smol test（外层受控 build 24GiB，原用例时限）
  -> 实际退出/未启动文件 + 逐条 cancelled 证据归档
```

取消名单固定为 28 项：`compiler-package-session` 的 `packagedWasm` 五项，
`encodedCompiler` 中仅 wasm/native 两宿主的 `2 + 4 + 16` 个精确展开 title，
以及 `compiler-session-tools` 的完整 managed compiler AggregateError 一项。
每条保存原文件 SHA、title、原展开参数、宿主、取消理由与 `status=cancelled`；
不记录 passed。文件任意字节变化均在启动子进程前拒绝，不能按宽泛名字扩大取消。
JS 编译器组、小型 sourceObserverPackage WASM/native、实际用户程序发射与
所有正常功能仍执行。driver 继承现有正式 stage3 package/session 环境参数，
不新增 JS fixture，也不更改原 setup、输入、断言或用例时限。

- [x] A：上述 exact 28 项、原 SHA/展开组、原 runner/supervisor 接口与独立
  sequence 的外层资源边界已列清；不移植资源监控框架。
- [x] B：新增五项纯 Eli 回归，覆盖精确取消及 small WASM 不匹配、同名篡改拒绝、
  原分片/顺序/环境/失败与 cancelled 分离，以及真实小 Eli 子进程输出/退出。
  其中延迟 supervisor ready 的取消回归保留原 SIGINT/SIGTERM 退出码，断言
  suite 未启动、仅关闭所属 guard，并将该文件如实保留在 unstarted。
- [x] C：新 driver/test 源已写齐；两份原混合 MJS 无字节修改，根代理接
  Bootstrap/ignore/Make。信号只转发当前子进程或原 supervisor，整树回收归
  原受控执行器，不新建 detached 任务或全局杀进程操作。
- [ ] D：本批统一生成与回归尚未执行；仍须实际完整功能门禁和原始 scope 归档。

## 6. 测试、BDD 和最后逐条验收

### 6.1 B 阶段先写齐的用例

| ID | 给定 / 当 / 则（含拒绝和边界） |
| --- | --- |
| T01 原初来源 | 给定只含 `.el` / `.eli` 源码和声明依赖的检出，执行 Emacs 引导，则真实生成 stage0；没有旧 compiler artifact 仍可引导；替换 seed 来源、缺模块、源/产物 SHA 变化均明确失败 |
| T02 三次自编译 | 给定同一冻结图，stage0→1→2→3 每一条边均使用真实上一 JS 编译器；篡改 stage 编号/producer/输入、伪称成功或缺产物不能被接受；不调用二进制 compiler host |
| T03 固定点 | stage2/3 原始产品文件集、JS/map/宏来源/IR/必需数据全部相等；单字节、额外/缺失文件、负零、孤立代理码元、不同逻辑路径和源身份变化均可被发现；不靠过滤差异通过 |
| T04 失败和资源 | 编译抛对象/false/undefined、取消、文件写失败、坏 manifest、关闭异常时保首错与已完成阶段；取消后无本任务遗留进程；不把取消/未运行写为成功 |
| T05 同源三输出 | 同一个 stage3、同一个语料清单/SHA、同一源码/输入逐 target 生成真实产物并执行；拒绝替换某个 target 的算法/fixture、旧 JS 对照或预计算结果；源码、目标及执行证据完整绑定 |
| T06 语义和运行时 | 完整既有语言/标准库/宏/项目/异常/async/诊断语料，IEEE 精确值、Unicode/非法编码、别名/求值次序、递归/ABI、随机差分、GC/越界/寿命/原容量失败恢复；保留当前真实失败样本 |
| T07 唯一正式入口 | CLI/Worker/浏览器和发布包加载的确是 stage3；Node/Bun 和声明平台运行；浏览器实际编译和执行 JS/WASM；不把下载/加载 WASM 编译器作为前提 |
| T08 共用测试与门禁 | 三目标消费同一份代码；目标特有部分只为真实执行/IO/ABI适配，不复制语言算法。原初 `.el` 的 JS 回归保留；stage1/2 不增加三目标重复验收；仅取消宿主专用项，不删除仍有效的语言/产物用例 |
| T09 发布 | 从最终 0.0.2 冻结源引导得到 stage3，stage2==3；包文件/运行依赖/摘要/平台标记和干净目录安装正确；不可把 stage0/1/2 或旧产物发布为正式 stage3 |

语料只维护一套。当前 794 条作为清单盘点起点，新的必要回归并入同一份
有效清单；只因用户明确取消的 compiler host 专用条目可记“取消”，须列出
ID 和理由，不能因为某个目标失败就减少正向语义覆盖。冻结后的三个目标
必须使用相同有效用例 ID 集及源字节；独立 oracle 保留实际原实现/模型。
跨目标错误的比较使用原语义/结构化诊断合同，不比较引擎自己的 stack 文本。

#### D06 旧编译器宿主门禁取消映射

本批精确修正 A05 的一项重复执行范围：
`original-program:compiler-cli-bootstrap-generations` 原 recipe 声明
`execution.compilerGenerations`，构建三个完整 selected-target successor，
再打开其实际编译器宿主。原分类已在 WASM/native 输出目标排除此能力；
遗漏的是 JavaScript 输出目标仍重复执行旧完整三代。现将同一完整 recipe
在三个输出目标中一致移往 `make test` 保留的
`tests/bootstrap-compiler.test.mjs` 原 JS 功能门禁，不作为 stage3 用户程序
输出验收的一条。新正式 stage0→1→2→3 与 stage2==stage3 门槛保持不变。

移动只匹配该 exact ID、原 suite/fixture/host、十三模块、原覆盖声明、
setup 来源与全部原 generation 合同（count/producer/target/sourceMaps/
manifest/companions/fixedPoint）。原记录、源码、coverage 和 corpus hash
不改；selection 保留 raw ID、来源 SHA、原 coverage、原 gate 文件及
`gateVerification: pending`，不把移动记为通过。仅撞名、改合同或普通
用户程序不匹配；其他原 binary-host cancellation 规则不变。

- [x] B：真实原 recipe 三目标分类、原 JS gate 仍在、来源/coverage 不变，
  各合同字段伪造与同名普通用户程序不误迁的 Eli 用例已写，尚未运行。
- [x] C：`compiler-matrix.eli:stage3-original-js-generations-p`、
  `stage3-compiler-host-reason`、`classifyStage3Corpus` 精确接线已完成。
- [ ] D：统一生成与原 stage3-targets 文件验收待执行；原完整输出 run 的
  中断与已保存前缀证据保持原状，本条不恢复或改写旧 outcome。

仅下表的宿主专用文件从 `Makefile test-core` 的执行清单移除。原文件、
全部断言、原超时与历史证据保留；取消不是通过。用户程序的 WASM/native
发射、执行、运行时、ABI 和恢复门禁继续保留。

| 取消 ID / 原文件或标题 | 精确原因 |
| --- | --- |
| `tests/wasm-compiler-modules.test.mjs` 全文件（完整 symbol/syntax 编为 WASM 的三项） | 验证正式编译器模块作为 WASM 宿主运行 |
| `tests/wasm-compiler-candidate-smoke.test.mjs`：`candidate whole 13-module zero-import WASM compiler compiles and executes one small add program within its fixed budget` | 完整 WASM 编译器初始化及其输出候选 |
| `tests/wasm-compiler-backends.test.mjs` 全文件（WASM output backend、optimizer、native output backend 三项） | 将编译器后端本身编为 WASM，并由该二进制后端发射产品 |
| `tests/wasm-managed-compiler.test.mjs` 全文件（完整 managed backend/linker 两项） | managed 编译器后端及链接器本身在 WASM 内执行 |
| `tests/compiler-producer-stages.test.mjs` 全文件（五项阶段根/错误/observer 及 native 子进程） | beforeAll 仅接受 WASM/native producer；操作其托管 Reader/expand/analyze/lower/IR 根 |
| `tests/wasm-compiler-ir-json-errors.test.mjs`：`malformed canonical IR JSON has a stable outer diagnostic and preserves the actual parse error as a non-enumerable cause` | 调用 WASM 宿主内完整 IR 编译器的 deserialize API；JS IR/JSON 诊断与用户程序异常门禁保留 |
| `tests/native-compiler-modules.test.mjs` 全文件 | 完整 Reader/formatter/symbol/syntax 模块的 native 宿主及对应 WASM 对照 |
| `tests/native-compiler-ir-lower-source-map.test.mjs` 全文件 | 完整 IR/lower/SourceMap 模块的 native 宿主、容量、陷阱及二进制固定点 |
| `tests/native-compiler-runtime.test.mjs` 全文件 | 整个编译器以 native/WASM 运行，包括最后一项同时比较两种编译器二进制的代际对照 |

下列是混合文件。旧文件和原 locator 保留，旧入口从 Make 清单移除；原有效
能力迁入 `tests/eliscript/compiler-host-scope.eli`，生成的 Node 门禁为
`tests/compiler-host-scope-selfhosted.test.mjs`。这是真实源码迁移，尚待集中
生成和行为验收，不是旧用例已经通过。新 before 仅加载 JS 前端及目标程序
运行时；不通过标题筛选去触发原来的二进制编译器 beforeAll。

| 混合文件 | 必须保留的具体非宿主能力 |
| --- | --- |
| `tests/independent-compiler-producers.test.mjs` | `producer IR wire preserves negative zero and the original JSON object omissions array holes and source property order`、`producer profiles keep the original default budget distinct from the explicit full-runtime candidate`、`compiler teardown closes a native adapter on success and every cleanup failure`；其余 numeric/managed/runtime-ir/runtime-stages 候选仅为二进制编译器宿主 |
| `tests/wasm-compiler-reader.test.mjs` | `reader diagnostics preserve original template ToString hint and ordered reads independently of mutable Array.join`、`reader diagnostics capture the live Error constructor before converting message fields and preserve thrown identity`，以及公共 Seed/JS 代际 JS/maps 原断言 |
| `tests/wasm-compiler-analyzer.test.mjs` | 三项原 JS diagnostic helper 的 getter/转换顺序、arrow/constructor/原值身份；公共 Seed/JS 代际中不依赖二进制宿主的原断言 |
| `tests/wasm-compiler-formatter.test.mjs`、`wasm-compiler-expander.test.mjs`、`wasm-compiler-project.test.mjs`、`wasm-compiler-entry.test.mjs` | 真实 JS portable diagnostic helper、Error 捕获/转换/原异常、原请求/源码位置及 Seed/JS 对照；只取消完整模块作为 WASM 宿主的部分 |
| `tests/wasm-compiler-source-map.test.mjs` | 原 JS cursor 的 iterator/getter/close/强制转换、无额外可变 global lookup，以及公共 Seed/JS 的原 maps/源码对照 |
| `tests/wasm-compiler-emitter.test.mjs` | `generic array prefix spread primitive accepts arbitrary head identity and iterable tail without imports` 及所有 `prefix ...` 用户程序的 UTF16/求值次序/冻结原型/OOM/陷阱/raw ABI 断言；portable locate/boolean helper 和 Seed JS 输出对照 |
| `tests/wasm-compiler-ir-lower.test.mjs` | portable IR schema/JSON/constructor/proxy/IEEE 规则；独立用户程序 Object/Array reflection、realm roots、原型/holes/callbacks、raw ABI/陷阱与 caller 根恢复；只取消整个 IR/lower 作为二进制编译器模块的部分 |
| `tests/wasm-compiler-runtime.test.mjs` | 最后一项 `Seed and three JavaScript compiler-entry generations retain the added small corpus IR maps and diagnostics` 中原 JS/Seed 对照；其余完整 WASM 编译器 API/初始化部分取消 |

迁移保留原用户程序的 prefix 六项与 Object/Array/realm/reflection 八项，
仍使用原零 imports、64/128/256 等容量输入、负零 caller 根、真实 raw ABI、
陷阱和恢复断言。fixture 来自原文件的确切 Eli 输入；独立 Node 执行同一真实
JS 发射文件，冻结原型用独立 VM，未写 JS 模板或替换算法。纯 JS helper
保留 getter、ToPrimitive/Symbol、Error/constructor/setter、arrow、源错误、
JSON/schema、IEEE、Proxy、cursor iterator/close 和可变 global 的原边界。
原混合测试中的二进制编译器字节比较取消；其额外相邻代全相等条件不加入
新链。完整正式源图的 Emacs 引导、JS/maps/IR 和 stage2==stage3 由新 T01–T03
门禁验证，原小程序 Seed JS/map 对照及其余独立 JS 前端回归继续执行。

现有 `compiler-portable-*`、`compiler-source-map-cursor`、
`compiler-fragment-combine`、全部 `wasm-managed-*` 用户程序与 native runtime
门禁未因文件名含 compiler 或 WASM 而删除。新 stage0–stage3 和 stage3 三目标
门禁仍按 T01–T09/A02–A08 完整验收。

### 6.2 D 阶段最终验收清单

下面全部初始为待验；只有逐项实际通过才能勾选。

| ID | 通过 | 输入与操作 | 预期与必须保留的证据 |
| --- | --- | --- | --- |
| A01 | [x] | 读取本文件、AGENTS 和现有入口，核对 R01–R12/任务/用例映射 | 当前 CLI/调度测试实际拒绝旧宿主和九格命令，按唯一新目标执行；旧证据保留 |
| A02 | [x] | D 阶段执行 `make bootstrap-release` 的 stage0 部分 | 当前候选真实通过，见 `dist/bootstrap-candidate7/bootstrap.json`；0.0.2 最终版本冻结仍按 A08 重建 |
| A03 | [x] | 同一次冻结输入依次实际生成 stage1/2/3 | 当前候选三代 JS 全部通过，producer 分别 stage0/1/2，来源与完整产物在同批收据 |
| A04 | [x] | 执行 `compareJsFixedPoint` 及 T03 阴性案例 | 候选 7 的 302 个产品文件逐字节相同；候选 4 完整引导/篡改/失败恢复测试 7/7 已通过；后续源码修复和最终版本冻结仍须重建 |
| A05 | [ ] | 最终 stage3 执行 `make check-stage3-targets STAGE3_FUNCTIONAL_RUNTIME_PROFILE=small`，消费同一冻结有效语料；原预算基线另存 | JS/WASM/native 三项目功能均 actual passed；所有有效用例完整覆盖、执行结果按原模型一致；原 sequence 容量按 P05 明确 deferred，不冒称通过；不能以编译成功/库加载成功代替执行 |
| A06 | [ ] | 同批引导和发布准备完成后，显式 `ELISCRIPT_SEQUENCE_FUNCTIONAL_RUNTIME_PROFILE=small ELISCRIPT_DEFER_PERFORMANCE_ACCEPTANCE=1 make --assume-old=bootstrap-backends test`、严格 `make byte-compile` 及新增 Elisp 工具字节编译，按 T06/T08 检查全部主线用例 | 本轮有效功能全通过，原负向容量/越界/恢复断言和历史报告防伪仍保留；只复用已完成生成，不跳测试；困难性能/完整 sequence 原容量延期明确为 DEFERRED/NOT ACCEPTED，不伪造性能通过 |
| A07 | [ ] | 实际浏览器与声明原生平台 CI，核验 CLI/Worker/包入口和生成物规则 | Chromium/Firefox/WebKit 使用 JS stage3；ARM64 macOS/Linux 声明产物分别在对应执行环境验证。不能在 x64 跳过 native 后汇总成通过；仅发射未执行须标明未验收 |
| A08 | [ ] | 版本更新后最终冻结/固定点/包安装，签名提交、推送和对应 SHA CI 验证 | 正式 stage3 0.0.2；可发布包、摘要、远端提交签名和安装身份正确；无中间产物进 Git；实际 npm 发布或 release tag 不作为新增的隐含前置 |

所有三目标验证由 stage3 执行；先前用其他 producer 得到的局部结果仅用于
定位和避免重复开发，不计 A05。既有独立语义测试继续复用，不能只新增一个
“三目标成功”空壳或小数值样例替代完整有效覆盖。

### 6.3 native 和浏览器的明确范围

native 输出沿已有后端声明的 ARM64 macOS / ARM64 Linux 目标及 ABI 验收。
可以由 JS stage3 交叉生成，但对应平台的实际运行证据不可缺。native 库
经既有 ABI/FFI 调用时必须执行真正生成的机器码，不能用 Bun 打包 JS 冒充。
本次不新增 x86/Windows 后端。浏览器无需执行 native 机器码，也无需加载
WASM 形式的 compiler；已有在线 Worker/虚拟项目协议由 JS stage3 保持。

## 7. 资源、交付和恢复约束

### 当前 D 证据

- 候选 8 隔离源整合本批 29 份维护文件，保候选 7 在途输入不变。
  首次工具生成 run `e78f322bc5cb4feb8078c0f15b8cd736` 因 Pages 新测试
  EOF 失败；修正真实闭合后，全工具生成 run
  `396789f063dd4c488b588c82e7d1759b` exit 0、cleanup complete。
  原 stable/parity generator 分别 run `261066b276fc40a0a62ae818bf57ec7c`
  / `81237f73ee4445a3a6a47e306e4e87b9` exit 0，均从真实源生成身份。
  四阶段 run `fda02f5dc93b4b7baa9ca8f77a497883` exit 2、cleanup complete：
  Emacs stage0 成功，但正式 analyzer 拒绝新增恢复函数的保留前缀。
  保留此严格拒绝；函数改为合法的 raw ABI 名 value-error-restore，下一
  次使用全新输出根，不覆盖失败收据，不放宽 binding-name 规则。

- 候选 7 四阶段引导 run `2126652f0491468b82d66359335b808b`，
  exit 0、cleanup complete，峰值 3767189504 字节；stage0–3 实际完成，
  stage2/3 全部 302 文件原字节相同，产品 SHA 均为
  `0b818729442bd4731e66a79c62b744b9c5069765515af05e8226dc4738fcbbfd`。
  发布视图准备 run `c0cf63a58afb4f3dbe1d918f72675b67` exit 0。
  本轮完整工具生成 run `3230c3badfef40bb8eb939ae766574bf` exit 0。
- 原完整 Emacs ERT run `6038ef0706444de0ae6b231db6459fa4`：
  245/245 passed，exit 0、cleanup complete，峰值 461422592 字节；
  保留独立临时目录、自举 Math 包及所有数字拼写的原精确比较。
  原严格字节编译 run `886b9238fb3b4c52874c6482f8db3acb`，新增五个
  Elisp 工具严格编译 run `bc538c047737498693d2873240961683` 均 exit 0。
- 候选 7 Node 统一批次 run `e80dc398c2e947e382408b161503115a`：
  197 项，190 passed、6 failed、1 skipped，exit 1、cleanup complete。
  失败为独立 compiler-build 产品缺少自身 Math 包解析、包 Worker 新测试
  server 的异步返回接线、外来值读取的普通对象和 Symbol 身份、真实 WASM
  lifecycle 新测试 imports 字段、source-view false 首错用例漏显式启用。
  新增资源认证、产品本地 literal provider、完整包前置三例、原 Math/Unicode、
  20,000 节点镜像及循环与 undefined 首错重试已通过。
- 候选 7 Bun 其他统一批次 run `75d2b339345945809c9ac738a04b29ce`：
  41 项，35 passed、6 failed，exit 1、cleanup complete。保留具体失败：
  foreign nth 与 wire 调用 ELI3、foreignEntry opcode 32 未接入真实运行桥、
  10,000/10,001 深递归 ELI2、Pages Worker IR 字节不一致、新 fuzz 回归的
  Bun 默认 5 秒用例时限。不能把测试适配故障当作语义通过。
- 候选 7 Chromium 实际 stage3 run `287be922e87c4936b0c8128273b017a6`：
  12 passed、19 个已取消 compiler-host 项 skipped、3 failed；其中三目标
  describe 的 beforeAll 失败，后续八个有效目标测试未执行，不能计通过。
  峰值 7231094784 字节，exit 1、cleanup complete。独立 Node 参考产物
  已真实发射，读取回归使用动态 keyword 访问普通对象导致丢失属性；另两个
  competition 回归因 Eli cond 的括号位置把默认分支放入成功分支而抛错。
  维护源修复先写入下一候选，不手改生成页面；同一缺陷不重复启动其它引擎。
- 候选 7 原完整 sequence run `b7cdf4506c7e4d7a8bf50f2ecd36380e`：
  56 项，4 passed、52 failed，exit 1、cleanup complete，峰值
  21876588544 字节，241.52 秒。仍有实际 prepare 的 ELI1，不能将已通过
  的通知队列假对象用例替代真实 WASM/native 准备期执行；进入同批根因修复。
  完整三输出尚在执行，保留冻结输入；后续修复先写独立候选目录，待终态合入。
  A05–A08 仍未通过，版本保持 0.0.1，不宣称正式交付。

- 候选 5 四阶段引导 run `9a6adbf76d5a40fca5cd46be9656c4f2`，
  exit 0/cleanup complete，峰值 3544940544 字节；stage2/3 完整 302 文件
  原字节相同，产品 SHA 均为
  `a0939ef834e54a2b0edeed2200435972dbcd6a2c86e6c6f9a1232f6642e1c47d`。
  stage3 发布视图准备 run `468bd026c2f742cc9bd4ceda5ccd7497` exit 0。
  工具总生成此前因 browser page 源码闭合与 helper 命名停止，不能将
  该总生成写成通过；修正后 page 实际单文件生成 run
  `29b9411343f448f8b918053c49ae979b` exit 0，未替换前端或固定点产物。
- 候选 5 Node 统一批次 run `32821a42729a4320a59fcf6184e66061`：
  179 项，167 passed、11 failed、1 skipped。原有本批 Math、Unicode、
  模块接线、JS stage3 调度及新增精确取消范围用例已通过；失败集中于
  Bun bundle 外置 map 参数、新测试漏 entry/Math 模块清单、provenance
  精确期望未同步，以及 Bun-only fuzz 测试误入 Node 组。
  正确显式路径 Bun 四文件 run `d0365ab8026145c1a6d0726065be34f9`：
  28 项，25 passed、3 failed（同一 bundle 参数、nth prepare ELI1、wire
  新测试未携带 descriptor section）。此前无 `./` 的两次 Bun 调用误作
  名称过滤扫描历史构建目录，只保留失败日志，不算有效语义验收。
- 候选 5 原完整 sequence run `b8f514df1b754b03a45bce0fb782e3ad`：
  56 项，4 passed、52 failed，exit 1/cleanup complete，峰值
  20484407296 字节。WASM/native 均在真实 prepare 中报 ELI1；不是内存
  上限终止，也未到 graph 成功后通知重放。继续定位准备期通知的提前
  解码/重入；不能将错误笼统归因环境或再次原样重试。
  同候选完整三输出随后因 Node 默认约 4 GiB 的 V8 heap limit 终止；
  run `12e91f6a7b824aedbb58394c56125a93`，exit 125，reason
  `descendants_left`、cleanup complete，进程树峰值 17251008512 字节，
  未触及外层 24 GiB 上限。已回收所有所属子进程；不是环境波动或
  主动取消。终态前缀 native 363/363 equivalent；JS 共 607 条中
  604 equivalent、1 different、1 cancelled、1 unverified；WASM 共
  587 条中 528 equivalent、35 different、24 cancelled。
  三项均未完成，不计 A05 通过；完整失败与未执行范围保留。
  下一轮须先合入已确认缺陷，再显式配置受外层硬限额约束的 Node
  堆空间，不能原参数盲重跑或无限追加进程预算。
- 候选 5 原严格 `make byte-compile` run
  `3e833fdf8bd54cd28388f3627df7ba6c` exit 0/cleanup complete，
  峰值 128876544 字节；A06 仍待完整功能门禁。
  两个新增 Elisp 工具严格编译 run `774846bac5c14fcf82366dd691acab75`
  同样 exit 0/cleanup complete，峰值 42663936 字节。
- 候选 5 原完整 ERT run `f9034ee8375f4e55a6f81df5ba8208a2`：
  245 项中 244 passed，唯一失败为独立临时目录的数字拼写自举测试；
  exit 1/cleanup complete，峰值 492224512 字节。原公共 bootstrap 只
  生成前端，临时目录缺少前端实际导入的 Math 包作用域与产物。不能
  通过改到仓库目录执行或删掉数字/生成 JS 的精确比较来掩盖。

#### 本轮 D 的合批修复清单（P05/P06/P07）

本轮下一候选的修复先保存为独立 overlay；当前三输出执行的源/工具保持冻结，
只有整合后正常生成的新产物才能计入下一轮验收。已确认修复范围如下：

- B/C：真实 runtime 增加私有 `value-error-restore(code)` 包装原 fail，
  两适配层 required/restore 使用该真实导出，保留 class→code 恢复顺序。
  上一候选要求未导出的 fail，导致真实桥静默退回旧路径；假对象通过不能
  证明启用。真实 WASM/native 回归明确产生 source-operation 通知并检查启用。
- B/C：独立 JS compiler-build 产品自带实际 Math 模块的私有 package scope，
  连同 scope 的原字节和 SHA 进入产品身份；不借仓库依赖补空缺。
  包浏览器测试真实调用 async 闭包；完整浏览器迁移回归修正动态 key 与 cond。
- B/C：Pages 保留全部原 published bytes，另发布有真实源/产物/map 身份的
  browser bundle；playground 消费新派生路径，不冒充 compiler 固定点产物。
- B/C：Git ignored 校验改真实 `--stdin -z` 与 NUL 终止输入，拒绝内含 NUL
  路径；新增真实特殊文件名/缺 ignore 回归。原 integrity 测试独立执行一次，
  新测试只保新增覆盖；conformance locator 指向真实执行文件而不是注释。
- B/C：AC-24 绑定维护中的 Eli 工具源，真实 generated CLI 仍由原 Make 执行。
  原初入口改为调用维护中的 Emacs 执行函数，内部 Emacs 参数不列为公开选项。
  stable/parity 身份只能在整合完成后由原 generator 按真实源生成。
- 新增 nth 外来输入回归显式使用 foreignEntry；原五例和原 foreign 对象保留。
  深递归新回归按既有资源档真实调用 auto，不只声明未启用的配置；预算不改。
  fuzz 长任务取消新增 Bun 默认 5 秒限制，不减原输入，不另设总截止时间。
  source-view false 首错用例显式启用故障，保留 false 原值和重试断言。
- 原完整合同检查首项 conformance 失败；后续 16 项独立收集为 8 passed /
  8 failed，全部 cleanup complete。失败根因已合并，不按单个门禁反复重跑；
  matrix 的历史合同 mismatch 保留，正式功能门禁沿原计划显式 deferred 且
  仍由既有 historicalMatrixContract 严格验证，禁止手改旧收据或测量哈希。


- [x] B/C：包 bundle 参数改为 `--outdir` 与固定 `--entry-naming`；
  28 个正式模块 ID 的完整有序断言、真实 completion entry、wire
  descriptor custom section、新 fuzz 的 Bun runner 与 page map ignore。
  只改维护源，尚未统一生成/复验，不计验收通过。
- [ ] B/C：准备期 source-operation 18 的参数推迟解码。新
  `managed-host-lifecycle.eli` 通过既有私有 capability bridge 接线，
  原 heap/错误 ABI 保留；真实 prepare wrapper 只在原调用成功后按
  FIFO 回放，按实际 pin 数释放，首错优先。旧外语言实现保持原字节。
  新 helper/回归先写齐；现有 host facade 的接线待冻结批次终结再合入。
- [ ] B/C：真实外来入口的显式 `foreignEntry` 布尔选项，沿 session
  project→managed lowering 接入现有 source-operation，缺省/false
  保持原纯托管零导入；同时补 foreign 值的解构读取。严格保留真实
  宿主对象、getter、迭代和身份，不能通过复制宿主输入规避。原有
  完整语料中的其它实际失败一并按根因归入这轮，不按错误文本加额。
- [x] B/C：正向原 program 的功能资源配置认证漏接；只接明确真实
  fixture/suite、原 seed oracle 和无显式资源预算的正向合同，原容量
  负向/诊断/恢复输入不变，资源与性能验收继续明确 deferred。
  三个精确原 recipe 为 formatter-node 与 macro-generated-names-bun/node；
  保留 suite/fixture/host、源 SHA/regions、入口模块的来源约束，显式
  runtimeOptions 容量不覆盖。新增 implicit-resources Eli 回归及原门禁
  接线已写，尚未生成或运行；不能据此认定本轮其它容量失败已解决。
- [x] C：独立原初 bootstrap 的完整运行依赖。新增
  `tools/bootstrap-runtime.el::eliscript-bootstrap-prepare-runtime(root,output)`
  从真实 `runtime/math.eli` 发射 Math/module map 并建立私有 package scope；
  `tools/bootstrap-command.el` 是公共 bin 相对链接的 Emacs Lisp 入口，
  保留输出目录和显式 EMACS 覆盖，复用原 `bootstrap-seed.el`。当前
  helper/launcher 与 seed 接线已写，冻结批次终结后公共 bin 已替换为
  相对链接；显式 EMACS/输出目录的空字符串仍按原默认处理。
  B 保留三类数字源与所有精确生成 JS 比较，执行 driver 从内嵌 JS
  迁到 `tests/fixtures/number-spelling-selfhost-driver.eli`，并严格核实
  临时包中的 Math/module map 和实际自引用；尚未运行。
- [x] B/C：source-view 深链镜像改为有去重的迭代队列，外层返回前仍
  完整镜像所有已发现 view，保留原 Proxy/描述符和对象身份；20,000
  节点、循环、false/undefined 首错与修正后重试四例已写，尚未运行。
  closed-value 的日志可能由源错误在 teardown 后才被格式化产生，
  尚无证据要求开放已关闭 runtime，不提前改其生命周期语义。
- [ ] D：上述完整修复合入后统一生成，按影响范围重新验收；候选 5
  冻结已解除，正在合入下一候选的完整代码；不覆盖真实失败证据。
- 候选 5 首次统一工具生成 run `9537e04092ee493d831c97868769e4d3`，
  exit 2/cleanup complete，峰值 229064704 字节。生成器一次收集到
  fuzz 的未限定宿主 timer 和一处新增测试的 let* 作用域错误，均已在
  维护源修正；尚未进入四阶段或三输出执行，不能算候选通过。
  本轮最后收口同时处理两项实际交付阻塞：独立浏览器运输中的裸 Math
  依赖和原门禁重复构建已取消的 WASM compiler host。正式产品字节
  不改，浏览器派生 bundle 单独记录真实身份，不冒充原产品固定点。
- P06/P07 的生成物规则收口：原 deterministic marker 检查依赖提交
  生成的四个模块，现迁受影响完整性检查到 Eli，实际比较重生成 JS/map
  字节，保留真实 Git 源文件集合；产物必须 ignored 且 untracked。
  `bootstrap.el` 从已有 core.eli 夹具生成 snapshot，不提交快照或运行时
  impl 的中间 MJS。旧检查实现和测试原字节保留用于迁移证据；依赖、
  历史报告、缺项/篡改等有效拒绝标准均保留，新增验证尚待统一执行。
  源码检出的 `bin/eliscript-compiler` 改成指向同一 Eli 生成包入口的
  相对符号链接，不新增 Shell 实现；新增用例核对链接、包 bin 身份并
  实际执行帮助命令。P06 的原混合工具/包测试还将按精确的原测试标题
  取消完整二进制 compiler host 项，保留所有小程序 ABI、JS producer
  和三种用户输出。普通文件沿用原隔离 runner；完整 sequence 在外层
  受控进程中独立执行，避免原较小文件限额覆盖已确认的实际资源需求。
- 候选 4 引导 run `7ee4c35765a44333ab71496a44e26f22` exit 0、
  cleanup complete，峰值 3681370112 字节。stage0–3 均由声明的前代真实
  生成，302 个完整产品文件 stage2/3 原字节相同，产品 SHA 同为
  `c39cebe5cdaeae971bf3d54659730895a65acdcdf438569ffe3bd1ed19803275`。
  已准备该 stage3 发布视图；后续真实源码修复后须重建，不能将这份
  固定点当作新源码的认证。
- 候选 4 完整引导测试 run `a72c550dbcdd4753bd8f20846d3e0407`，
  7/7 passed，exit 0/cleanup complete，峰值 3617964032 字节。
  两个新增 Elisp 构建工具严格字节编译 run
  `c39ade79a8504e85ae417dd6c582c69a` exit 0/cleanup complete。
- 候选 4 三输出 run `7ac28a9839084bd1b6be8b41818485eb` 被协调者
  误判旧代重复项后主动中断，exit 130/cleanup complete，峰值
  8185528320 字节，不能当作完整通过。既有过滤本来已排除二进制
  compiler host；实际遗漏是 JS 输出仍重复旧完整多代门禁，现按 D06
  精确身份迁入原最终功能门禁。已保存的 native 前 312 条中，200 条
  实际运行一致、112 条预期编译诊断一致；这些仅是历史前缀证据。
  WASM/JS 的实际失败已按入口传播、导入重写、资源配置、源码映射和
  测试运输根因合批修复，不改原独立模型和 golden。编译器源码已变化，
  下一候选须重新发射，旧产物不冒称由新 producer 生成。
- P06 本批包接线保留实际 frontend 和运行时原字节：独立包补齐 13 个
  正式前端模块及 maps、实际 Math 依赖和私有 ESM 包作用域，更新真实
  清单文件摘要；原编译器 artifact/source identity 保持不变。Pages
  发布视图携带同一静态图及包解析元数据。新增包断言验证实际字节、
  身份、完整清单、loader/worker/browser 入口；真实浏览器验收仍待执行，
  不能用 Node 的包解析成功替代浏览器证明。Make 采用对应 Node 测试
  驱动，runtime-scan 与受影响 fuzz 引导能力迁至 Eli 后接入统一门禁。
- 候选 4 Node 批次 run `c75645d6e9de48e6a701d24b4a229689`，
  127 项中 117 passed、10 failed，exit 1/cleanup complete。新宿主桥接
  四项、Math 的数值/元数据/异常主体、Unicode 全标量及 sigma 均已通过。
  失败中六项来自新测试误注册到未 prepare 的独立 VM 子进程，两项来自
  reverse 新夹具平行 let 误引用 sibling，一项来自测试重导入的 Bun
  namespace 路径，一项来自测试未递归 module children 找 import。
  这些根因成批修源码，当前冻结的生成文件尚未替换。
- 候选 4 Bun 其他批次 run `5b9cc09515834e5187cfa626f85f3954`，
  27 项中 25 passed、2 failed，exit 1/cleanup complete；nth 的完整项目
  prepare 已成功且 18 项返回原值正确，失败是 managed realm Array 与
  宿主 Array 的 prototype 不同，不可为通过断言修改生产 decoder；须以
  原型无关但完整 ownKeys/描述符/Object.is 观察验证该平坦值数组。
  另 Pages 缺失新 graph adapter 实际导入的正式前端，已补齐整个 13 模块
  图、maps 和 stage3 Math 支持文件的运输源码，待下一统一生成复验。
- 候选 4 原完整 sequence run `9d8eb8d4c30945459a5f21ac46c42323`，
  56 项中 4 passed、52 failed，exit 1/cleanup complete，峰值
  22613262336 字节。原错误 ABI 已解除，当前唯一共因是 prepare 内的
  bindingChanged 被 graph 的未 prepared 检查提前拒绝；真实槽和 bytes
  充足。修 prepare 通知生命周期，外部未 prepare 的调用仍应严格拒绝，
  不改原程序、预算、oracle 和错误优先级。
- Math/Unicode/模块运输修复后的候选 3：run
  `a5349170c0df4c71886f11ff628fb25f`，exit 0/cleanup complete，
  峰值 3492446208 字节。`dist/bootstrap-candidate3/bootstrap.json` 四阶段
  JS built；`fixed-point.json` 实际比较 302 个产品文件，stage2/3 同为
  `2e58cc8ce0e7d94540c54ad5cd79832629f0da3296137bb89b82e866239e3862`。
  真实 stage3 发布视图准备 run `0a63ed7fc5ac42f5a2af9da94f72a329`
  exit 0，包含该代 Math runtime 原字节。后续修复改变正式源码，须重新
  生成候选，不把这份历史固定点冒称最新源码已验收。
- 候选 3 统一 Node 批次 run `5f63c67cfd7642908c6c4f1265aa8be5`，
  122 个 runner 项中 105 passed、17 failed：其中 1 项误将既有
  `bun:test` 文件交给 Node，不能算语义失败或跳过，其余失败按根因
  合批修复。数学直接舍入、独立精确累加与 30 iterator 模式已实际通过；
  方法不可构造元数据、Unicode 默认参数、新 Seed host 顶层 await、
  运输 span/包基准和 VM 原参考依赖均有明确修复，待下一统一批次。
- 候选 3 原完整 Bun 功能批次 run `b39ee0ea15f2494094f9130ee4746e1a`，
  70 项中 16 passed、54 failed，正常退出失败并完成清理；峰值
  21647245312 字节，未触发 24 GiB 硬上限。完整 sequence 在 prepare
  发生 ELI1，新增 nth 在 prepare 发生 ELI3，均未到实际 nth 运算。
  nth 唯一 slab 定位到 binding 190 / `$eliscript_link_0_139`，真实源图
  映射为 `managed-runtime-queue.eli` 的 `EMPTY_QUEUE=(literal-queue)`。
  空闲槽与字节充足，不能继续将此判成容量不足或给资源加额来掩盖。
  此批两处阻塞已有确定根因与合批修复：EMPTY_QUEUE 需要未实现的
  `Array.prototype.reverse`，已补实际方法发布和通用反转算法；协议解码
  对 kind18 函数读取 `slot` 时错误调用仅接受 kind13 对象的原始接口，
  由新的 Eli 宿主桥接按真实类型分流到属性接口，原始 ABI 的错误种类
  和负向用例保持。对应通用反转及真实 WASM/native 宿主桥接测试先写齐，
  再统一生成与执行，不继续增加预算或原样重试。
- 原严格字节编译 run `3ff67945f4f14acda2522b7c8fdefac2` exit 0。
  新 Elisp 工具单独严格编译发现 `bootstrap.el` 的 `lsh` 风格警告；
  已对非负 UTF16 单元改为同值 `ash`，本批严格复验 run
  `c39ade79a8504e85ae417dd6c582c69a` exit 0/cleanup complete，
  `bootstrap.el` 与 `unicode-case-runtime.el` 无 warning/error。
  候选 4 初次生成在新增宿主桥接测试的 async 回调缺闭合括号处停止，
  run `75bdf709277b4c70bc85b1ad70f4d582` exit 2，未生成自举阶段；
  已修真正闭合点，原失败日志保留，四项测试及其断言未删改。

- 真实 `make bootstrap-release`：run `482e9ea467b44348afef41e0feea0d46`，
  exit 0、cleanup complete，49.392 秒、峰值 3611394048 字节。
  四阶段 JS 均 built，固定点 identical；原始文件、maps、IR 与运行资产共
  297 个产品文件，产品 SHA `1f006f19a9c52c4028d98b85414f1b1d7c935bf5f5ffc0f6786957d8bc7d8666`。
- 新完整自举测试：run `bef8a19b10d04c50b898cb565cdec6e7`，7/7 passed，
  exit 0/cleanup complete。集成接线测试 6/6 passed，run
  `9fdf1b77971b4a4cb2ba914ec936da3d`。
- 原严格 `make byte-compile`：run `47d24b1fe68c42af877d62fe9a4f4ad9`，
  exit 0/cleanup complete，无 warning/error。A06 仍待完整功能门禁。
- 原六文件运行时批次 `9b0a69221030464d962ed1e126f7793d` 仍失败，
  不能宣称容量已修复：完整 sequence/初始化等存在 ELI2。extended 使用
  `node:test`，Bun 默认 5 秒 hook 超时后清理目录造成次生 ENOENT；迁到
  正确 Node runner，其他使用 `bun:test` 的原文件不改运行器或断言。
- 新 stage3 调度测试由实际 stage3 生成后，run
  `8dc40f4c2ac4401898f0a064f561eb80`，8/8 passed，exit 0/cleanup complete。
  其小样例真实执行三个用户程序目标，但不能代替完整三输出语料验收。
- 初始化诊断批次 `62dacc97177041d88bc170a5c77d5d1b` 保留真实失败。
  新测试曾只在 options 中填 auto，而原 factory 没有该选项；现按原接口
  显式调用 runtime.auto，未改变 auto=0 或 GC 合同。prepare 夹具把普通
  对象错误标成 persistent literal 品牌，已改为原无品牌 sentinel。
  namespace 缺失真实 Symbol.toStringTag，已补源码与描述符、空 namespace
  和同 heap Array.prototype 身份回归，等待本批统一验收。
- 新增 nth 测试自行选择的 1024 槽不构成额外发布合同。原 sequence
  用户程序及共享语料本来明确要求 1024 槽，继续按其原预算诊断真实
  初始化失败；不通过增大原预算、关闭断言或无限重试取得通过。
- 版本仍为 0.0.1；上述均为功能候选证据，不是最终 0.0.2 发布证明。

### 候选 9 集中验收与下一修复批次（D 内继续）

- 四阶段实际构建 run `9483d4c38d2b4eb3ae0f1f4fe6640e08` exit 0、
  cleanup complete；stage2/3 完整比较 303 个产品文件 identical，产品 SHA
  `098daa79f5826aee43267dd4e6b24c106287af020e3927de65133478911dc29b`。
  正式发布视图准备 run `ce791fdf836e4a6b8753cf6bc6fa6a38` exit 0。
  后续运行时修改仍须重建新候选，不能沿用此证据认证改后的源码。
- Node 22 文件批次 198 项：191 passed、6 failed、1 项明确性能延期；
  Bun 两批合计 56 项：53 passed、3 failed。原 sequence 56 项：
  4 passed、52 failed。三种浏览器各 41 项：14 passed、8 failed、
  19 项按旧 compiler host 取消。这些均保留为失败证据，不计完整三输出通过。
- 原 ERT 245/245 passed，run `c79fe6056d234eafbefb3dce71373c63`；
  原严格字节编译及五个新增 Elisp 工具严格编译均 exit 0，分别为
  `63ce377882e240ebb2a10094c0cf6cb7`、`8fc12ecbb7eb458bb0e75fec992d0f74`。
  没有后续 Elisp 变更时不重复运行这些未受影响门禁。
- 候选 7 完整三输出长任务已终止失败：run
  `30526b4d26284d719b5627f81a4b0044`，Node 8 GiB 堆耗尽，进程树峰值
  19243909120 字节，全部所属进程已回收。终态前缀为 JS 639 equivalent、
  WASM 530 equivalent、native 512 equivalent；均不是完整语料通过。
  失败点是 native 完整 Reader 请求在输出前进行共享 IR 树展开及 JSON
  保留；不能笼统归因机器负载，也不通过盲目增加堆上限重试。

本批沿 P05/P06/P07，一次补齐以下阻塞的 B/C，再统一生成下一候选：

| 位置与符号 | 必要修复及保持条件 | 验收 |
| --- | --- | --- |
| `compiler-build.eli` 包作用域创建 | 首次 seed/session 导入前建立实际包边界；实际 bare Math 解析到本轮完整产物，保 maps/来源与文件清单 | 原完整 28/53 模块构建及实际 load |
| `compiler-corpus.eli` runtime-scan recipe | 保原 ID、13 模块、原区域与新源码定位，恢复被迁移文件名漏掉的原完整用例 | 原语料最低 794 不下降；原 provenance 断言 |
| `managed.eli` / `memory.eli` Function prototype | 发布真实默认 `Symbol.hasInstance`、普通原型链与 bound 委派，保覆盖、首错、属性描述符与冷观察 | 原 wire 同源 WASM/native 和新增独立对照 |
| `managed-host-lifecycle.eli` | 克隆 envelope 的 dispose 必须转发原后安装的关闭钩子；有无 prepare 均适用；补全真实 WASM B adapter 的 bytes 接口 | 原关闭快照拒绝、嵌套克隆与实时钩子 |
| `compiler-matrix.eli` traced-session | 真正 sequence 私有请求继承本 cell 协商的 graph-events-v1；显式模式优先，保持原 signal/错误和完整字节/IR | 原完整 Reader 与真实私有 sequence 路径 B；不截断响应 |
| `compiler-browser-session*.eli` | 单 IR 的 target 取提交请求而非不存在的返回字段；完整元数据接收保有界大请求；Node/browser 首次项目使用相同实际 runtime revision；debug 从最深真实 range 精确映射 | 原 22 个有效浏览器条目，三引擎及真实 native 产品运行；不删字段或改 golden |
| 原 sequence prepare / nth 外来值 | 首错诊断已证明 prepare 首次错误为 `undefined.call`，不是槽/字节容量；现有 literal/collection 初始化正调用尚缺默认方法的 `constructor[Symbol.hasInstance].call`，同批补齐真实默认方法及原形冷调用 B，最终以原完整序列复验而非诊断代替验收。nth 保 caller/result identity、负零、GC 和 caller roots | 原完整 sequence、原 nth 输入及独立参考，不改资源或语义预期 |
| `memory.eli` `value-source-length` | nth 的第一处差异确为外来数组 index 0；原路径对 foreign kind35 不读取真实 length，导致边界判断错误并返回 nil。增加真实属性 Get，不改变 raw `value-length` ABI，保 length getter/原抛值及元素身份 | 原完整 nth，以及 foreign length 的 getter/错误用例 |
| native 原 `original-sequence:esm-imports` | 历史终态实际 report 末项为 2，原预期为 1；原 `isolated=true` 只在 JS 分支生效，二进制分支错误地共用 parent global。仅对已声明 isolated 的二进制 exports 在独立子进程执行原实际断言与清理；不重置用户 global，不改原 fixture/reference | 原 import sequence 的单次副作用、namespace/default/named 身份 |

隔离实现位置：`tools/backends/eliscript/compiler-corpus-execution.eli`
`execute-exports` 在建立 adapter 前路由，现有 child runner 负责取消与回收；
新 `compiler-corpus-isolated-exports.eli` 接收真实 artifact 的已验证 compact ABI、
原 contract/resources/options，直接调用同一实际 local executor 防递归，
不改原 contract。父进程接收原观察与诊断，不伪造通过。
回归追加原 `tests/eliscript/compiler-corpus-exports.eli`：两份真实 provider 图、
WASM/native、父 global 不变、原副作用次数、false/undefined 首错和清理。
新增 helper 的源/生成映射加入 `bootstrap.el`，输出及 map ignored；
没有新增手写外语言或新测试框架。

候选 10 首次统一工具生成 run `bc60b24fc2824049b9f73f07bd9ea5c6`
exit 2、cleanup complete，尚未进入四阶段：完整收集到新隔离 executor
模块尾多余括号、matrix 新首例缺闭合及隔离 B 的裸 globalThis 不合法三处
源码问题，按同批修正；不更换编译器、不跳用例，不把生成失败报成验收通过。
后续 run `442b99a3ca4940069b94e559aa171627` 已解除两处，仍保留 matrix
文件 EOF；只针对该文件作一次 Reader 的完整边界定位，不靠猜测补括号重试。

候选 10 四阶段最终 run `f9ac2a85f3834a85962cb8088702016f` exit 0、
cleanup complete，57.689 秒、峰值 3420012544 字节；303 文件固定点 identical，
stage2/3 产品 SHA `9691261684fc91e112ede5f177b11188f6592bc0a806cd31f94b2287e423a289`。
发布视图准备 run `4ac56719fba84ba294824c228ef1655b` exit 0。五工具严格
独立字节编译发现 public launcher 缺外部函数声明，补 `declare-function` 后
run `1079090f000042959f92b13b0f9e404d` exit 0，产出的五个 elc 已精确移除。

本轮 D 的终态与缺口：

- 完整三输出 run `c5d9cb0e5af1459b959f36d2e8860fd6` 在语料捕获前退出：
  新恢复逻辑错误地要求同 file/title 的稳定特性引用只有一条；没有执行用户
  程序，不能报告任何目标通过。下一批保每个原 coverage ID，按 ID 唯一
  绑定到同一个完整 runtime-scan recipe，不降低 794 门槛。
- Node 批 run `76d8f967ea2f45cb9e15980b120d030e`：200 项中 183 passed、
  16 failed、1 明确性能延期。其中误送一个 Bun 文件给 Node（runner 错误），
  同时漏跑原 managed-adapters；遗漏文件已原样补收 13/13 passed，run
  `3302012b59674db38418f0f222d591e7`。原 28/53 模块构建及实际 load 通过。
  余失败为同一语料定位守卫、两项新运输 B 缺原比较器必需的 suite 来源字段、
  原小 gate fixture 缺新增正式 Math 源，均按原 contract 补齐而非删除断言。
- Bun 八文件 run `6664e04977154f2283706d661aea81cc`：55 passed、3 failed；
  原 wire、foreign 数组逐元素 identity/负零/GC、10000/10001 深树均已通过。
  nth 后续 RangeError 报告仍失败；新增 hasInstance B 把 `true` 写成不合法
  Eli 标识；另一项是未设置既定性能延期环境引起的旧 hash 校验。遗漏的
  Bun 文件与正确延期环境下的原 legacy integrity 已一次补收 16/16 passed，
  run `43143b30b3a34829a90b0a5c4d572e0a`，不修改任何历史报告。
- 完整原 sequence run `9802b66ebfde4f53b9110adb321bb235`：先完成
  16 项中的 9 passed、7 failed，随后在首个 WASM/Node 子程序阶段触及
  24 GiB 独立进程树硬上限，45.935 秒、峰值 25789448192 字节，exit 137、
  cleanup complete。其余 40 项未执行；不是全 56 项终态验收。原准备阶段
  统一 ELI1 已解除。owned throw 的小对象和 JSON 普通 diff 不能证明内存
  增长由代理递归造成；先保固定阶段记录与原错误，不以增加限额重试。
- 三浏览器顺序批 run `8e57b142ee3c43fbab5afee38f237264`：各 16 passed、
  6 failed、19 项原 compiler host 取消，cleanup complete。完整 JS fixture
  和 raw memory IR 已通过；余六项共同缺 managed 用户指令 span。实际独立
  Node metadata 也只有 runtime 指令 span，不能靠改变浏览器预期消除失败。

下一批仍沿 P05/P06/P07，全部 B/C 补齐后统一复验，不重建未受影响资产：

| 精确源码入口 | 确定根因与最窄修复 | 原验收保持 |
| --- | --- | --- |
| `compiler-corpus.eli` `restore-runtime-scan-recipe` | 同一源码可以有多个特性引用；每个覆盖 ID 原顺序保留且只归属该完整 recipe | 原 13 模块、区域/hash、全部 coverage、794 guard |
| `tests/eliscript/compiler-matrix.eli` | 新 B 补完整原比较器来源；gate 小 fixture 带真实正式 Math 源 | 原执行与 source-bound gate，不伪造 comparator 结果 |
| `stdlib/managed-value-state.eli` `hashString` | omitted optional 被 Eli 置 nil，而迁移代码只对 undefined 补 STRING_TAG；用 rest 区分 omitted/undefined/显式 null | 原所有字符串 hash、路径别名/碰撞原严格 hash |
| `stdlib/managed-runtime-order.eli` IComparable 发布 | 缺已有 protocol role 注册，宿主解码变成同 description 的另一 Symbol | 原 Symbol 身份和 compare 断言 |
| `stdlib/managed-runtime-collection.eli` `indexedValue` | 同一 omitted optional 问题把 nil 当显式 not-found，越界不再抛原 RangeError | 原 nth 全部输入、RangeError、显式 fallback 边界 |
| `bootstrap/backends/managed.eli` typed lowering | 真实用户 IR span 没有进入 typed steps/result/body；保共享纯 guard，按真实来源复制必要 root，生成节点仍无 span | 三浏览器原精确位置、maps/debug/二进制原字节与运行 |
| 原 sequence helper 的失败运输 | 对尚未处理的真实 owned throw 作有界字段与阶段记录，再重抛原值；现有 objectGet 是源 Get，次生读取错误不得替代原首错，不新增内存解析器 | 正常 stdout、原输入、第一错误、pin/release 与清理不变 |

实现与用例写完仍不等于验收通过；最终三输出、完整门禁、0.0.2 最终冻结、
包安装、签名推送和对应 CI 仍开放。版本保持 0.0.1，性能延期不冒称通过。

### 当前统一验收 C12（功能候选，仍未交付）

C11 工具生成已完成，但随后 stage0 发现新增调度包装器与原有
`lower-managed-expression-core` 重名；仅将新增包装器改为唯一的
`lower-managed-expression-dispatch`，原 core 保留。该失败 run
`dac86e9979fe4d218209d222ea29ff00` exit 2、cleanup complete，不能算自举通过。

修复后的全新 C12 由维护中的 Emacs Lisp 实际生成 stage0，再真实生成
stage1、stage2、stage3。run `c855e3fc24924204826fcbebaa84171e`：44.123 秒，
峰值 3776249856 字节、exit 0、cleanup complete。完整 303 文件固定点通过，
stage2/3 产品 SHA 为
`643076a561746e96d0fbeb1853ffbcd371ea56ad1a5f94a8bb1c233dd7f58815`。
发布视图实际准备 run `720b2c060e564aa88003877e26e3dbae` exit 0。

- 正确的 Node24 二十四文件统一批：215 项注册，214 passed、0 failed、
  1 项原性能报告明确延期，不记通过。run `5fe861adfa724169afa3ab794683a753`，
  30.592 秒、峰值 9020096512 字节、exit 0、cleanup complete。包含真实
  stage3 WASM/native 用户指令范围、新恢复语料全部 coverage、私有 graph
  运输和原 28 模块/53 literal 完整构建与实际 IR 执行。
- Bun 九文件统一批：67 项，65 passed、2 failed。run
  `ff155691c12b4235ab92cc26f4d4ac52`，104.424 秒、峰值 5243060224 字节，
  exit 1、cleanup complete。原 nth imported-report 值仍有差异；新增
  hash B 缺编译 report 前的声明，生产函数未执行。hasInstance、wire、
  foreign、10000/10001 深树、exports、Seed 和延期模式下 integrity 均通过。
- 完整原 sequence 57 项与最终 stage3 三输出正在运行；三输出已实际进入
  三个目标，不再被 runtime-scan 定位守卫阻断。运行前缀不能算整项目标通过。
  序列诊断已将原 owned throw 解为 IReduce/reduce 与 IAssociative/assoc
  的非可调用 direct slot；原 value-hash 已通过。当前冻结 C12，后续修复
  写入下一候选，待本批独立失败收齐后合并，不改变运行中的源码。

C12 后续统一验收已收两个完整终态：

- 原序列 56 项加新增诊断 1 项全部执行，23 passed、34 failed；run
  `b761d8243e1c46baac5dfd35977b531b`，176.879 秒、峰值 24675368960 字节，
  exit 1、cleanup complete。WASM 两引擎各 9/13 passed，原哈希、内部
  观察和 IComparable 均已通过。8 个 WASM 失败聚合为 Array reduce 与
  Object assoc 协议查找；后续源码证实 reason 缺省本身也存在迁移错误，
  当前“non-callable”文字不能证明实际槽位存在。native 26 个失败是在
  prepare 前被新诊断包装改变 runtime.project 身份阻断，不能判作原生算法
  失败，也不能放松原严格 transport 身份检查。
- 三浏览器统一顺序批 run `a4e9a9c4b61a493f9aae35e2a85a4665`：330.442 秒、
  峰值 14517796864 字节，exit 0、cleanup complete。Chromium、Firefox、
  WebKit 均 22 passed、0 failed，另各 19 项取消的二进制编译器宿主，不记
  通过。真实 stage3 的浏览器/Worker 三种输出、实际 native 库、精确
  maps/debug/source span 与原同源对照均通过。

下一修复批仍沿 P05/P07，当前 C12 运行中的源码不变：

| 源码入口 | 下一候选的必要 B/C | 原标准 |
| --- | --- | --- |
| 协议 private exact lookup / memory / foreign bridge | 仅私有协议键将真实宿主 canonical Array/Object prototype 对应至本堆注册键，custom/null 原样，公共 Reflect 身份不变；reason 用 rest 恢复 omitted/undefined 默认 | 原完整 sequence、getter/首错/非法 direct slot 与 foreign identity |
| sequence 诊断 helper | 包 graph.prepare/invoke 保 runtime/project 原身份，不克隆 runtime.project | native 已 attach 真产物再次 attach，另 transport 仍拒绝 |
| managed-runtime-sorted | 省略/undefined 恢复原 ascending=true、comparator=compareValues；显式 null/false 不变 | 原省略调用与全部显式边界 |
| zero-imports / nth helper | hash 新测试预声明删除后拼真实函数；nth 原失败先附有界真实值证据，不猜改预期 | 原字段 Object.is 和独立参考不变 |
| compiler-corpus request | API 原 Node host 还会导入 entry 未引用的 seq；发射原声明的完整 library entries | 源码/输入/host 未改，缺失依赖不能伪造 |
| original host context | 异步导入尚未完成时 beforeExit 提前关闭 graph；受影响生命周期迁 Eli，关闭仍检查 live/frame/首错 | 原 host/body 与动态加载、实际退出清理 |

C12 完整三输出后续暴露原百万 persistent-core-exit 输入的共同阻塞，仍属
P05，不能作为可选性能打磨忽略。原 host 的 `valueCount=1_000_000` 及
全部共享结构/更新/碰撞断言保留。向量树的路径复制算法本身有界；问题是
宿主 decoder 每次返回都强制完整镜像共享树，使百万次 host 调用累计
平方级传输。默认功能 small 的 131072 槽也确定不足以保留百万个不同值。
当前没有证明无限循环或 GC 泄漏，不能把持续 CPU 本身当成该结论。

已核实 PID、父进程及唯一产物路径，仅终止 C12 的三个 WASM 百万 vector、
map、set 子进程，父三输出调度继续；这些记录仍是失败，不计通过。没有改
原程序、测量结果或哈希。下一批 B/C：

- 仅 decoder 私有视图取消强制递归 eager mirror；保留公共 source view
  refresh 和全部 Proxy 实时读取/反射/非可配置约束。不能猜节点 immutable、
  缓存陈旧子对象或用全局 realm 脏标冒充普通对象写入追踪。
- B 保留公共完整镜像原用例，补实际 WASM/native 稀疏解码、共享身份、
  嵌套修改、descriptor/prototype/freeze、首错 false/undefined 和 GC。
- 原明确容量/负例预算不动。仅准确绑定的三个原百万正例，在已启用功能
  资源延期时使用现有 full-compiler 的 8388607 槽、256 MiB 初始/1 GiB 池
  及匹配发射内存；不是增加进程树硬限，也不声称原 1024 槽容量通过。
  其余默认功能用例仍 small，明确预算优先。报告同时保留原/实际两组参数。
- 三项 ELI-RT0003 的现有外部堆栈不足以判定真实 arity 错误。仅在既有
  allocator 诊断环境下记录实际 callee/args kind、length/count 和原错误码；
  必须恢复原错误状态，次生诊断失败不改首错。没有证据前不改 arity 语义。

### C13 修复候选与下一批精确收口

C13 初次全工具生成 run `6b1bf3bf58a74b8ab6283224e6abcb64` 一次收齐
两处新增测试编译错误：launcher B 的括号，以及 sequence B 的非法
`async-lambda`。随后 run `c9e66a02f6544e7b8561c78ff65e388d` 暴露同一
launcher B 的 try/finally 归属错误；均保留失败，不冒充通过。修正后
run `c0ce1c8440bd41628aae60ab0e992390` 63.800 秒、峰值 3604873216 字节，
exit 0、cleanup complete；工具、Emacs stage0 和真实三次自编译完成。
303 文件固定点一致，产品 SHA
`c30c1137db9977ba5d3bd5c36852a24dc9c3e554a30a8e536cd81c07dc9bbbf7`。
prepare run `aaf0f380c7ca401e8ea8c869b3c02668` exit 0。

- Node26：227 项，220 passed、6 failed、1 原性能延期。run
  `3de7712a31714570ad95e51d06c41802`，31.758 秒、峰值 9468100608 字节，
  exit 1、cleanup complete。所有原用例及公共完整 source refresh 通过。
  新协议 constructor B 缺预声明，阻断其三项；新 lazy WASM B 使用未 attach
  的低层 factory，真实 native 同体已通过。另 exitCode=0 的旧 JS false
  判断未保，以及 wrong-host 负例错误期待 small（原合同应拒绝）。
- Bun9：69 项，66 passed、3 failed。run
  `e833ead03fca425aadbf75dc400c788c`，110.593 秒、峰值 4810326016 字节，
  exit 1、cleanup complete。实际 hash 默认/碰撞、hasInstance、wire、foreign、
  深树及 exports/Seed/Pages/integrity 通过。nth 原字段证据终于确认实际
  `ProtocolDispatchError`，原期望仍 `RangeError`。sorted/matcher 新 B 分别
  被已有 symlink、嵌入 `true` 这两处 fixture 接线阻断，尚未验证生产函数。
- 原序列 57 项加真实 exact dispatch 4 项已完整执行：61 项中
  41 passed、20 failed；run `cdebf5474087406d8ca5e68c255c3291`，230.341 秒，
  峰值 22489481216 字节，exit 1、cleanup complete。native 原 transport
  身份阻断已消除，四个组合均实际 prepare 成功且各 9/13 原例通过。
  原 16 个 body 失败仍是同一协议查找缺口；新增 4 项在独立 reference
  namespace 引入 managed 私有额外 export 时失败，须只导入真正需要的
  公共命名项，原 57 输入不变。完整 C12 三输出继续原源码收齐。

C14 已准备的 B/C 沿原 P04/P05/P07：真实 canonical protocol helper 实际
为 `defconst` 的 function-expression initializer，标记须只浅拷贝此真实
initializer，保原声明/名/span/IR 不变；原正例 foreign exact 与全部拒绝
保持。其它确定接线一批修正：constructor stub 后接真实节点、WASM 真带
模块 factory、原 JS Boolean(exitCode) 语义、wrong-host 仍拒绝、symlink
严格 realpath 复用、fixture 布尔写合法 `t`。无一改动原 golden、用户输入
或容量负例；当前 C13 源码冻结，终态后才整批合入下一候选。

### C14 实际验收与 C15 主线修复批

C14 run `c67c258b44484009a2ab895979a0323b` 完成 Emacs stage0 和三次真实
JS 自编译，61.505 秒、峰值 3566583808 字节、exit 0、cleanup complete。
303 文件固定点一致，产品 SHA
`1ea0d3d329297f92270575e070eac5e93e01bc3b86b172066cc2738495dd5439`。
prepare run `ce975715d6a74d0cafaf80c26f3249c7` exit 0。

- Node26：228 项，227 passed、0 failed、1 原性能延期；run
  `d807302570414ccb8b5dd7d97d7a3f73`，33.020 秒、峰值 9577480192 字节，
  exit 0、cleanup complete。真实 canonical defconst protocol 桥、私有 lazy
  decoder 的 WASM/native、原公开完整 refresh 与首错/清理合同全部通过。
- Bun9：69 项，66 passed、3 failed；run
  `7164bdaf0dac4970860aac33df22918a`，159.850 秒、峰值 5700681728 字节，
  exit 1、cleanup complete。nth 原 60 秒总测试时限终止独立 Node child；
  无证据证明语言循环错误，不能提高时限冒充修复。sorted 新 B 在 factory
  初始化前未启用原 auto1，尚未进入用户调用即 ELI-RT0002。matcher 新 B 的
  全部实际字段 Object.is、数组长度/值与全部描述符均通过，只有原 Bun
  toMatchObject 失败；需要区分宿主比较器问题和语言输出，禁止改黄金。
- Sequence61：49 passed、12 failed；原 57 项为 49 passed、8 failed，
  新协议 4 项因观察 helper 对已解码 host Error 调用 raw pin 而失败。
  run `50f2c70d4fed4062a818bd84cf59af6d`，256.600 秒、峰值
  25695879168 字节，exit 1、cleanup complete。四个目标/引擎组合各
  11/13 原例通过；transducer、indexed-sequence 全部通过。剩原例只含
  core-stdlib 与 core text/object，仍需取得真实首错，不以空打印推断原因。

C15 仅沿 P05/P06/P07 修复上述主线和原完整三输出暴露的 Seed 对照接线：

- `tests/eliscript/literal-runtime.eli` 的独立 Node 请求在原 WASM/reference
  文件落盘后即启动，与原 Bun 两目标重叠；原六 case、全部断言、auto1
  和 60 秒时限不变。无论成功或首错，finally 必须等待原 child 及双流
  回收，再清理目录；既有诊断开关标明开始/完成，禁止盲目提高资源。
- `tests/eliscript/managed-project-zero-imports.eli` 的 sorted B 保持原
  8192 slots/字节，factory 仅关闭自动初始化，随后先 auto1 再真实
  initializeModule；补实际初始化前状态和 GC 已运行断言。
- `tools/backends/eliscript/compiler-corpus-execution.eli` 的 Seed 来源
  闭包仅对显式 `.mjs` 依赖优先采用已认证声明 host provider；显式 `.eli`
  和入口不变。保持 configure-local-runtime 原冲突拒绝。补原 provider
  身份、显式冲突及篡改拒绝 B，原完整 20000 输入/四 host/maps 字节模型
  不变。完整原记录另外暴露 sorted 构造身份和声明 platform self-reference
  接线，须同批收齐，不能把这些记录取消或改成成功。
- `tests/eliscript/wasm-managed-sequence-data.eli` 与相应 helper 区分
  raw-owned 与真实已解码 host Error；观察不能创造无效句柄或替换首错，
  原四组合与全部原正文继续完整执行。matcher 保持原独立黄金与原匹配
  条件，只允许已证实宿主差异所需的正确运输适配，不弱化语义。

C15 matcher 运输采用 `tools/backends/eliscript/compiler-corpus-matchers.eli`，
使用 `managed-source-view.eli` 的真实 WeakMap 认证；只给认证的 owned
record/array 建实际公开反射快照，保存 holes/undefined/-0/symbol、全部
own descriptor flags、alias/cycle；访问器保持延迟及原 receiver/首错。
普通值、外来 Proxy、其它 matcher 均走真实原 Bun matcher/receiver。
原两条 core-stdlib 记录只替换第一行唯一 `bun:test` 依赖说明符，原
host 正文和 golden 字节不动；归档四份 Eli/生成工具的真实来源哈希和
运输前后 host 哈希，冲突拒绝。新增运输 B 保留完整正文、拒绝不完整/重复
来源和变动导入边界；原实际 view 的逐字段/数组/descriptor 断言继续执行。
这个适配解决宿主比较器的内部数组长度读取问题，不改变生产对象或放宽
原标准库断言。原序列两个 stdout host 没有 matcher，不能混归此根因。

C12 完整三输出仍在原冻结源码上收齐，不能用 C14 局部结果覆盖其失败。
旧 result 的 50000 次 vectorConj 被 C12 每次完整 eager 镜像重复解码，
与 C13 已修私有 decoder 同根；仅结束核实归属的该旧 child，让父调度
继续，保留失败，不把静态定位计为新候选运行通过。

### C15 实际验收与 C16 根因批

C15 第一次生成 run `6f12920162474af1b592054a6741d098` 退出 2：一次收齐
三处新测试编译错误（Seed 多余括号、matcher 裸 true、诊断 B 需顺序绑定）。
同批修正后 run `1bf9d51c222941e0b5e533ec047874d4` 61.631 秒、峰值
3596124160 字节、exit 0、cleanup complete；303 文件固定点一致，
SHA 仍为 `1ea0d3d329297f92270575e070eac5e93e01bc3b86b172066cc2738495dd5439`。
本批仅工具/测试变化，正式编译器产品未变。prepare run
`8e07e225e8b741bc967f29f2a51661c3` exit 0、cleanup complete。
完整 `make byte-compile` 加新增五份 Elisp 工具严格编译 run
`3b2d7f184366417bb7efe9201b8628ed` 2.406 秒、峰值 135446528 字节，
exit 0、cleanup complete，新增 elc 已回收。

- Node26：229 项，227 passed、1 failed、1 原性能延期；run
  `5b15e5fd8c844dadb1e75eb9c869dd96`，33.081 秒、峰值 9751019520 字节，
  exit 1、cleanup complete。唯一失败是完整 legacy 文档对照的独立 expected
  未计新增两条 matcher 依赖运输及四份真实来源，须补精确预期并继续完整
  deep equality，不能忽略这些记录或字段。运输专用新增 B 已通过。
- Bun10：79 项，76 passed、3 failed；run
  `cb56f732aa8f4fee91859c45caaef7cb`，187.437 秒、峰值 10801790976 字节，
  exit 1、cleanup complete。nth 原六 case 与三实际路径在原 60000ms 内
  57298.83ms 全通过；Seed 新五项和原八项全部通过。手工 matcher 四 B
  通过，真实 WASM/native 两 B 仍失败：快照仍挂着认证 prototype Proxy，
  未完全运输原型链。sorted 新 B 在 auto1 真初始化阶段仍 ELI-RT0002；
  不再把其临时 8192 自限当成原验收门槛，也不据此优化整库资源。
- Sequence61：本批未完成；run `e8f08d1e46094e35bfc731351005290e`，
  42.884 秒、峰值 25945505792 字节，memory_limit、exit 137、cleanup
  complete。只完成 18 项，16 passed、2 failed，43 项未完成。四个通用 B
  和 WASM/Bun 12/14 通过（新增协议 B 已通过）。两原标准库 host 的首错
  均已真实解析为 `ProtocolDispatchError`、`IReduce/reduce` 对 `object:Set`
  缺失、reason missing；不能再归为空打印或笼统归 matcher。原 24GiB
  独立树限额已保住并清理，未盲目提高限额或重复未变运行。

C12 老候选的三输出调度已确定失败，且继续反复经过已修 eager decoder
路径；本批主动退役，未作为通过。完成记录：JS 696（679 equivalent、
1 different、1 cancelled、15 unverified），WASM 586（537 equivalent、
25 different、24 cancelled），native 566（531 equivalent、11 different、
24 cancelled）。run `7ea6f5f4d6ec433ab43ebef8e54fb5ae` 3545.517 秒，
峰值 17853661184 字节，cancelled/exit 130、cleanup complete；原日志/
请求/产物/失败报告保留，不让已知旧失败继续重复消耗。

C16 沿 P05/P06/P07 的整批 B/C：

- 完整语料 expected 独立认证四份新增工具来源，仅给原两个精确记录补
  第一行说明符运输、前后 SHA 及来源证明，原全部其它文档值继续完整比较。
- 新增 sorted optional-argument 功能 B 使用既定 public small 的真实
  budget/memory，并保 auto1、初始化顺序、全部原功能断言；原独立容量
  负例、原 1024 性能/资源基线继续保持原值且不冒称已验收。
- matcher 的认证 prototype 边按同 WeakMap/队列复制，不硬换 host 原型，
  不改原 view 或 foreign identity。B 严格观察原型节点、alias、array
  prototype brand/length、own keys/descriptor flags 和原 constructor
  identity，再调用原 matcher/golden。
- Set 缺实现沿既有私有 exact-prototype 桥补真实 canonical Map/Set，复用
  实际原型注册与根管理；公共 GetPrototypeOf、custom/foreign 拒绝保持。
- 本机 Node24 元数据明示 WASM 编译并行任务默认 128。原 sequence Node
  child 仅限制 `--wasm-num-compilation-tasks=2`，以减少同时编译占用；不
  改 image、算法、优化层级、host/input/auto/60000ms 或 24GiB 硬额。
  Bun child 参数不变；加真实命令数组 B，不能把这项功能调度计作性能通过。

### C16 实际结果与 C17 收尾批次（P05/P07）

C16 四阶段实际完成，303 项 stage2/stage3 原始产物一致；构建 run
`2be6ac1d3a9c41fdb2abeacdd1372298`，56.291 秒、峰值 3695788032 字节，
exit 0、cleanup complete。Node26 为 230 项：228 passed、1 failed、
1 原性能延期；新增 Map/Set 用例的 foreign entry 接线仍 ELI-RT0003。
Bun10 为 79 项：77 passed、2 failed；nth 原三路径 50526ms 通过，
sorted optional 原功能断言通过；两失败均为真实视图的外部 matcher。
Sequence61 实际仅完成 18 项（17 passed、1 failed），原 core-stdlib
已通过，core text/object 的 safePrototype 为 false。余 43 项未执行；
run `a41b2aeb96884df9887e869b1169d3b9` 峰值 25881870336 字节触限，
exit 137、cleanup complete。限制 V8 编译并发没有解决该内存问题。

C17 在 D 内一次合并这些根因，不改变输入、原预期或验收门槛：

- `bootstrap/backends/managed.eli` 的 `managed-literal-dependency` 仅标记
  真实 `runtime/core/collection.mjs` 的 `cloneObject`；
  `lower-managed-function` 把原 source 参数登记到该函数自己的 state。
  `lower-managed-object` 仅对这个函数的空对象分配调用
  `value-collection-clone-new(heap, source)`，原复制循环、descriptor、
  getter 次序和异常逻辑原封不动。其它对象表达式不变。
- `bootstrap/runtime/memory.eli` 新 helper：foreign kind35 的输入经私有
  host operation34 分配宿主普通空对象；owned 输入仍走原 `value-object-new`
  默认分配。既有 host request 根与首错回收复用，不增加公共反射归一化。
- `managed-foreign-binding.eli` 的既有私有桥接入 operation34，调用
  `createManagedForeignPlainObject(source)`；它仅返回新对象，不读取 source
  的 constructor、原型、键或 getter。B 先补无观察、独立分配、精确原型与
  安全 __proto__ descriptor 检查；原 sequence golden 继续验证真实三目标。
- matcher 的真实失败由原有快照与 matcher 文件成批解决；保留所有原字段、
  descriptor、原型观察及原 Bun matcher/golden，不更改程序输出。
- 新 Map/Set B 补真实 foreign-entry/factory 接线；sequence 在构建临时值
  已出作用域后、同步 child 启动前回收死垃圾，保留活 IR、原末尾负例和
  全部 61 项。无新 watchdog，无内存硬上限提高或未变化运行的反复重试。

上述 B/C 全部写齐后才整合、重建受影响四阶段并集中复验；本段是施工位置
与签名约定，尚不是修复通过证据。

- [x] B：空对象分配无 source 观察、独立身份、精确宿主原型及安全
  `__proto__` descriptor；原 sequence 协议用例追加实际返回对象三项独立检查。
- [x] C：canonical clone 空分配的 compiler/runtime/host 三处接线完成。
- [x] B/C：Map/Set foreign-entry 接线与原 sequence 垃圾回收/活输入身份
  检查完成；仍保留全部 61 项。
- [ ] B/C：matcher 真实快照逐字段证据及对应确定修复。
- [ ] D：整批生成、固定点、受影响 Node/Bun/sequence 和完整三输出验收。

### C17 实测及 C18 根因修复（P05/P07）

C17 新四阶段构建 run `dc0e8c56e2624afe8009bb728301925d`，
56.757 秒、峰值 3556868096 字节，exit 0、cleanup complete，固定点相同。
Node26：231 注册、229 passed、1 failed、1 原性能延期；Map/Set 实际
reduce 已为 6，剩下真实 Proxy 原型 trap 读取 10 次而 JS 仅 1 次。
Sequence61 已完成的 18 项全部 passed，包括原 core text/object 的
safePrototype；随后 Node 路径仍触 24GiB 上限，43 项未完成。
full GC 没有解决这一阻塞，不再原样重试或提高硬限额。
matcher 真实逐字段结果：标量全部相同，数组 public length/own keys/
逐项值及 descriptor 全相同，但原 Bun matcher 单独比较该数组仍失败。

C18 一次处理余下三根因：

- 真实 matcher 快照先完成 data/descriptor 队列，再从父到子发布同一份
  认证 prototype 图；原 view、最终图及原 matcher/golden 不变。
- foreign literal provider 的旧 kind 对未知 Proxy 先后执行九次
  instanceof，这是额外九个原型 trap 的来源。仅使用实际 host 原生
  Proxy 身份分类能力绕过未知 Proxy 的 literal 试探；持久对象原始
  provider 的 materialize/read/协议身份保留，不能换成 symbol 伪品牌或
  新增 foreign Proxy 的 descriptor/Get 观察。浏览器不新增 Node 静态依赖。
- 序列构建与运行分开生命周期，避免同一进程保留重型发射器/JIT 后再
  同时承载 Node 子进程：新增 `.eli` helper
  `tests/eliscript/managed-sequence-build.eli`，把原 beforeAll 完整构建、
  所有源码身份/IR不变/原imports断言及辅助遍历原样迁入
  `buildSequenceArtifacts(directory)`；以本语言生成的 helper 在受控树内
  独立子进程执行，结束后才运行原 61 项。
- helper 保存完整真实资产与 canonical runtime/literal IR（复用现有
  `serialize-program` / `deserialize-program`，严格 round trip）、原始
  host source 和 public-module IDs；最后写完成清单。父进程校验子进程
  退出和清单后载入同样实际输入，保留末尾原缺依赖负例；负例需要的
  backend 在执行该原用例时加载。不是替代构建、预计算输出或删减语料。
- `bootstrap.el` 增加 helper 的真实生成映射，`.gitignore` 忽略其 MJS/map。
  原原型/GC/输出黄金/61项与 60s 用例时限不变，不增加总超时、watchdog
  或内存硬限额。构建进程的退出实现完整内存回收，不再依赖 GC 会降低 RSS
  的猜测；效果仍须由原整套的真实 guard 与结果判定。

- [x] B：构建清单/完整 IR round trip、失败退出与实际资产接线，matcher
  最终图回归、Proxy 无额外观察与持久对象身份回归全部写齐。
- [x] C：完整构建生命周期抽取、两处边界与映射全部完成。
- [ ] D：仅在上述全齐后整合工具、恢复已认证 stage3 并统一复验。

构建生命周期的 B/C 已落在上述 `.eli` helper、原 sequence 套件及
`bootstrap.el` / ignore 中：完整构建函数与遍历原样迁移，canonical IR
逐份严格 round trip；完成清单最后发布，父进程验证真实不同 producer PID、
原 entry/host source/数量及子进程成功。测试仍 61 项。此轮不更改正式
compiler/runtime 源码，沿用 C17 已认证四阶段与固定点；只重新生成受影响
工具和测试并恢复 C17 stage3，避免重建未变的四代。
Proxy helper 的 matcher 来源闭包必须完整为六项（原四项加新 helper 的
Eli 源与真实生成 MJS），各自认证来源与执行字节；不是只增加一份文件。

C18 真实统一结果：Node26 共 232 项，231 passed、0 failed、1 原性能延期；
run `2e3523bf56bd4aceb741ae9836334a47`，28.817 秒、峰值 9994698752 字节，
exit 0、cleanup complete。原完整 Sequence61 **61 passed / 0 failed**：
同一套真实 WASM/native，在 Bun/Node 四条运行路径全通过；run
`b3d413d1285343369ad0cfa594cab3a4`，256.367 秒、峰值 23393648640 字节，
保持原 24GiB 硬限额、exit 0、cleanup complete。原末尾缺依赖负例也通过。
构建进程退出后，实际父进程 RSS 约 2.8GiB、Node 子进程约 18GiB；
生命周期分离解决了此前同时保留构建内存的阻断，无新增内存额度。
严格 `make byte-compile` 与五份相关 Elisp 工具均通过：run
`b91cf116908d4af49acf2f24d35dd6de`，1.784 秒、峰值 127877120 字节，
exit 0、cleanup complete，五份新增 elc 已回收。

matcher 仍 5 passed / 2 failed，不冒称 C18 已解决。C19 原真实 B 的
原生存储诊断确认快照及 golden 的数组 public length/vector length 都是
3/3，原 source Proxy 为 0/0；因此既不能继续把快照失败归咎于 Proxy，
也不能声称仅延后 prototype 发布已修好。仍保原 matcher、原所有字段、
descriptor、holes、负零与原型断言，后续只调整等义的数组构造路径并
补相应有界实际存储证据，不修改公共对象或 golden。

C20 等义空数组构造已整合且真实验证，仍为 5 passed / 2 failed；run
`233f2aa787d44ed9b4466933d3fbcd92`，9.968 秒、峰值 977600512 字节，
exit 1、cleanup complete。真实数组最终 storage 有索引和正确长度，
对称原型链无 enumerable 差异，失败不能归类为缺少数据或未修复的 Proxy。
保留两项失败；无进一步确定证据之前不反复重试同一程序。

C20 当前源码已冻结，正式 `stage3 targets` 完整同源三输出已启动；
沿用未变的 C17 自举正式编译器，使用原完整语料和显式 small 功能资源档。
JS/WASM/native 三条输出同时执行，原失败/延期/取消分别记录，不能把此前
61 项通过冒称完整三输出通过。新修复仅写隔离 overlay，不能修改该运行
正在读取的源码或资产；此轮记录全收齐后才合并下一确定根因修复。

### 执行边界

- 普通 Git/搜索/文件操作直接执行；重型构建/测试按当前 controlled-run
  独立监控本任务进程树，结合实际系统余量动态调整。无跨对话共享配额，
  不以旧小额度反复阻断，不设置会杀掉仍有进展长构建的总超时。
  确认失控/停滞才处理，并核实归属，绝不停止其他任务或系统服务。
- 全部实现前不运行测试、预审或验证性构建。必要源读取、正常实现生成和
  依赖准备不夹带验证。全量实现后失败成批修，不反复重试不变错误。
- 新增/修改的编译器、工具、测试、驱动必须 `.eli` / `.el`。现有外语言
  实现只作未修改迁移债；本次需改变的能力迁移，不能为赶工新增 JS 模板。
- 所有生成 JS/MJS、IR 中间件、四个阶段和可执行文件放 ignored 构建目录；
  不提交 Git。npm/release 包可以包含由 stage3 产生、运行所需的生成文件。
- 施工期间保持当前版本；功能候选验收闭合后才统一更新 0.0.2。版本变化
  影响真实构建输入，必须对最终 0.0.2 源重新生成四阶段和固定点，并做受
  影响的包/安装验证；不能只给旧 0.0.1 产物贴 0.0.2 标签。
- 本次完成 0.0.2 源码与可发布包、签名提交推送及 CI 交付。实际 npm
  发布或 release tag 按用户明确的发布指令执行，不追加为本次完成条件。
  发布之前须具备打包、内容/依赖检查、干净目录安装及版本身份的真实
  证据；发布有问题不继续递增版本制造垃圾，不掩盖已经发布的版本。
- 代码批次必须检查 status/diff/真实验证证据后签名提交并立即推送对应
  分支；签名失败立即停止报告。保留不相关 WIP 和原作者，不夹带生成物。
  文档检查不能宣称代码门禁已过；交付以对应源码的实际执行证据为准。
- 后续新语法独立立项，不属于本次收尾；本计划不启动或唤起其他对话。

恢复时先读 AGENTS 和本文件，再核实工作区、阶段、活进程及已有证据；
不恢复取消的宿主目标，不重建未变且已认证的阶段，不把旧 Goal 文本看得
比当前范围更优先。仅交付文档不等于创建或同步运行目标。
用户随后已明确授权执行，现已创建对应的活跃目标；
当前从 D 阶段继续，不恢复旧九格目标。

## 8. 可直接使用的完整 Goal 文案

下面代码块是可完整复制的目标正文，含全部十二条要求、施工步骤和完成条件。
在 Eliscript 的 `feat/managed-project-linking` 授权工作树中使用；通过
`git worktree list` 定位该工作树，不覆盖其他检出或无关修改。

```text
/goal 持续完成 Eliscript 0.0.2 的 JavaScript 三段式自举与三种输出验收，直到全部功能、固定点、统一测试及签名发布条件真实成立。唯一施工计划为 docs/bootstrap-0.0.2-plan.md；开始和恢复时读取当前 AGENTS、该计划、工作区状态及原始证据，保留无关 WIP。

本次目标完整定义：
1. 维护一份 Emacs Lisp 原初编译器源码，只要求编译 Eliscript 到 JavaScript。
2. 维护一份 Eliscript 正式编译器源码，可以生成 JavaScript、WASM、native；此编译器本身只要求以 JavaScript 运行。
3. 由 Emacs 驱动原初编译器，从源码生成 JavaScript stage0，称为原初编译器产物；不使用旧发行版或旧生成物替代。
4. stage0 编译正式编译器的 Eliscript 源码，得到 JavaScript stage1。
5. stage1 再编译同一份正式源码，得到 JavaScript stage2。
6. stage2 再编译同一份正式源码，得到 JavaScript stage3；最后正式交付的是 0.0.2 的 stage3。
7. 固定输入、模块ID、配置和逻辑文件名，严格比较 stage2 与 stage3 全部编译器产物原始字节、文件集合、maps、宏来源、IR和必需运行资产，二者应完全相同；不得事后过滤差异。这就是本次三段式自举，不额外要求 stage1==stage2。
8. 只使用最终 stage3 编译同一套 Eliscript 测试代码和输入，分别生成 JavaScript、WASM、native，实际执行并按原严格模型验证结果一致。
9. stage1、stage2、stage3 来自同一份正式源码；不对 stage1/2 增加 WASM/native 输出测试和重复的完整语料验收。
10. 按三段式 bootstrap 的原理实施：原初引导、随后两次自编译和固定点证明。
11. 只有两份维护实现：Emacs Lisp 原初源码和 Eliscript 正式源码；不新增另一套手写编译器。
12. 三个输出目标共用同一份测试源码、有效用例清单、golden和输入；目标特有代码只负责实际执行/IO/ABI适配，不重写语言算法或缩小样例。

取消编译器的 WASM/native 运行形式、九格和三个宿主的自举/初始化/性能工作；保留它们的历史源码与真实证据，不恢复、不计本次完成度。WASM/native 用户程序的代码生成、运行时和实际执行仍是必需交付，不能混淆。新语法、0.1.0、外部后端和困难性能优化不在本次施工范围；困难性能真实记录为延期，不冒充通过。

当前起点：维护中的两种语言源码、三目标后端、JS 自举和完整语料/执行器已有可复用实现；当前新定义的 stage0–stage3 尚未验收。完整目标程序还有容量/初始化、部分 Math/Unicode 等真实失败，详见唯一计划；不得据历史通过或已写代码虚报完成。只修阻碍本次主线的缺陷，不重写无关遗留。

严格按 construction-goal 和 bulk-development 执行以下完整施工顺序。施工清单写完即勾；验收清单只有最后实测通过才勾。不得把两种状态混为完成。

[ ] A：一次补齐全部设计。
核对现有工作树、规则、源码和证据，沿用本文的真实基线、当前/目标源码树、流程图、D00–D08接口与数据，不另起一套重复设计。列清旧宿主任务的取消范围，以及仍必须保留的语言、运行时和三输出用例。冻结原初源码、正式源码、运行库、配置、模块ID和测试清单的身份。把剩余全部工作归入P01–P08，不擅自增加任务。

[ ] B：一次写齐全部测试和验收用例，禁止运行。
T01：Emacs 从源码引导，无旧生成物仍能生成stage0。
T02：三次自编译的实际生成者和源码身份正确，不能替换成预存产物。
T03：stage2/3完整文件和字节比较；额外、缺失、单字节差异和坏来源都能检出。
T04：错误、取消、写盘失败、关闭失败和恢复保留首错及已完成成果。
T05：stage3对同一测试源码生成三种真实产物并执行；拒绝替代算法和预计算结果。
T06：保留并补全原语义、标准库、宏、项目、诊断、数值、Unicode、GC和资源边界用例。
T07：CLI、Worker、浏览器和安装包实际加载stage3。
T08：三输出共用测试，旧宿主专用项明确取消，不借此删除有效语言测试。
T09：最终0.0.2源码、固定点、正式包和安装产物身份一致。
已有有效用例直接复用；新增测试、测试驱动和适配实现只用Eli/Emacs Lisp。这个阶段不运行测试、不试编译、不预审。

[ ] C：一次完成全部生产实现和接线。
C01 / D01：在tools/backends/bootstrap.el增加eliscript-backend-bootstrap-stage0，由维护中的Emacs Lisp编译器直接编完整正式Eli源码图，生成stage0 JS、源码映射和来源清单。逻辑文件名固定，不嵌入物理阶段目录，不借旧seed产物替代。
C02 / D02–D03：新增tools/backends/eliscript/bootstrap-js-stages.eli，实现bootstrapJsStages和compareJsFixedPoint。一次冻结输入，真实打开上一阶段JS编译器，顺序生成stage1、stage2、stage3；每代保存完整产物后关闭，保留有效检查点。精确比较stage2/3，不额外要求stage1==stage2。
C03：完成上述全部测试源码及统一测试入口；仍不运行。
C04 / D04：新增tools/backends/eliscript/stage3-targets.eli，实现runStage3Targets；固定使用JS stage3，复用runCompilerMatrixCell，分别发射和实际运行JS/WASM/native用户程序，共用同一测试清单和输入。不得调用会构建WASM/native编译器的旧九格入口。
C05 / D05：成批修复阻碍三输出的现存容量/初始化和Math/Unicode等真实缺陷。已有代码直接复用，不围绕非阻塞性能、旧编译器二进制宿主或其他细节继续优化；不修改有效预期来掩盖失败。
C06 / D06–D07：完成Make、CI、CLI、Worker、浏览器、打包和ignore接线。增加make bootstrap-release与make check-stage3-targets；两者当前是计划入口，不能冒充已经存在。正式入口指向stage3，涉及修改的旧外语言能力迁到Eli/Emacs Lisp，生成物不进Git。
可按独立文件所有权并行：原初与JS自举链、最终三输出调度、共用测试与主线运行时修复；协调者整合入口和计划。每个协作者都必须遵守A/B/C/D，不能提前运行局部测试或审核。

[ ] D：全部设计、测试编写和生产实现完成后，统一整合验收。
依次实际生成stage0→stage1→stage2→stage3，检查stage2/3完整产物逐字节相同；只用最终stage3执行完整同源三输出验收。运行原必要功能门禁、严格字节编译、CLI/Worker、真实浏览器及声明native平台执行。逐条记录A01–A08的真实结果与证据。独立项可并行，但同一自举链的前后阶段不能跳过依赖并行伪造。
一次收集所有能独立获得的失败，按根因合并修复，随后只复验受影响项；没有源码或环境变化时不反复重试同一失败。困难性能保留原结果并延期，不降低功能或语义标准。

统一验收清单：
[ ] A01：十二条要求、源码/流程/施工/用例映射一致，旧九格不再是前置条件。
[ ] A02：Emacs从维护源实际生成完整stage0，来源和输出均可复核。
[ ] A03：stage0→1→2→3实际依赖和生成记录正确，所有编译器均以JS运行。
[ ] A04：stage2与stage3全部编译器产品文件及原始字节相同，差异检测用例有效。
[ ] A05：只有stage3执行三输出验收，同一份测试代码的JS/WASM/native实际结果按原语义模型一致。
[ ] A06：原必要功能测试和严格字节编译通过；性能延期如实记录，不伪称已通过。
[ ] A07：CLI/Worker/浏览器/安装入口确为stage3；声明native平台有真实机器码执行证据；生成物不提交Git。
[ ] A08：统一更新0.0.2后的最终源码、固定点、包、签名提交、推送及对应CI身份一致，完成当前授权范围内的正式交付。

工作量统一使用P01–P08：规格5%、Emacs stage0 15%、JS三代与固定点15%、测试写齐10%、stage3三输出和主线缺陷20%、入口与包接线10%、统一验收10%、0.0.2交付15%。每项分别记录实现、用例、验收和交付状态；不得把既有实现算成已验收，也不得把已有成果全部归零。汇报必须同时列出stage0/1/2/3状态、最终三输出通过数和下一项，不能再只报0/9。

必须真实满足：Emacs 来源 stage0；正确 producer 的 stage1/2/3；stage2==stage3；最终 stage3 对全部有效共用语料的 JS/WASM/native 三项实际执行一致；原必要功能门禁、严格字节编译、CLI/Worker与真实浏览器、声明 ARM64 原生平台验证；认证的来源、IR、产物、诊断、maps及运行证据完整。仅因用户明确取消的 compiler host 专用条目可以列明ID和理由取消；不能因目标失败就删用例或改golden。不要调用仍会构建 WASM/native compiler 的旧 record-grid 九格入口，用固定JS stage3的单producer三目标调度。

新增或修改的实现、工具、测试、驱动只用 Eliscript/Emacs Lisp；本次改变的旧外语言能力逐步迁移，不新增手写JS/MJS/其他语言，也不把JS藏进模板。生成物只存 ignored 构建目录和发布包，禁止提交中间MJS。首次引导只从维护中的 Emacs Lisp 开始，不依赖外部编译器/优化器/在线服务。

本对话自行受控管理自己的进程树，结合真实余量动态调整内存，不使用共享配额，不因旧小限额停滞，不设置杀掉仍有进展长任务的总超时。确认失控或停滞后仅回收已核实归属的进程；不停止其他开发工作或系统服务。

施工期间保持当前版本。功能候选全部成立后统一更新0.0.2，冻结最终输入并重建受影响的四阶段、固定点及包安装验证；正式包必须来自该stage3。核实npm打包内容、依赖、干净环境实际安装和可发布条件，以A08定义的0.0.2可发布包收口。按项目规则检查status、diff和真实测试证据，签名提交、立即推送、验证签名与远端、通过对应SHA的CI，并完成声明native平台的实际执行验收；签名失败立即停止报告，不绕过。

只依据P01–P08清单和实际证据汇报实现/用例/验收/交付进度、stage0–3状态与最终三输出通过数；不再用旧九格分母，不以代码行数/等待时间作完成度。所有工作必须归清单，禁止无关优化、重复审核、临时工具堆积及碎片测试循环。后续新语法独立立项，不属于本目标；不启动或唤起其他对话。

本目标只有全部上述必要条件真实成立才完成；否则保存具体失败、已有成果、下一步和解除条件继续推进，不以阶段提交或局部测试通过冒充交付完成。
```


### C22 / P05、P07：仅 matcher 使用的认证 Array realm projection

A：C21 八个真实 Bun 对照已证明两种构造下 standard prototype 均通过，
null/完整克隆 Array.prototype/仅删除其非枚举 @@unscopables 均拒绝。
Bun 原 deepMatch 使用 StringsAndSymbols 与 DontEnum Exclude；JSC 对
string、symbol 两轮都过滤 DontEnum。因此不把缺少非枚举 Array API 认作
数据缺失，不再猜构造优化。C20 完整三输出仍在原冻结工作树执行。

源码位置与接口：
- managed-foreign-binding.createManagedForeignBindingRuntime：现 owner/raw ABI
  私有 classifier，先 isManagedSourceViewForRuntime(view, realm) 认证同 owner；
  再原 fromHostValue/frameSet/raw frame-get 与
  value-standard-prototype-existing(heap, 0/1) 作 exact raw ID 比较。
  不读 constructor/name；unknown、跨 heap 不编码。保存并恢复 raw error/class，
  平衡 token/frame；不分配 managed 值、触发主动 GC 或全局 pin。
- managed-source-view：私有 decode-realms WeakMap；registerManagedSourceDecodeRuntime
  绑定 owner/runtime 到同一 opaque realm；withManagedSourceDecode(operation, runtime?)
  和 record 保存/恢复 realm。新 projectManagedSourceViewForMatcher 独立于原
  snapshotManagedSourceView；后者所有公开原型及 descriptor 保持原样。
- managed-host.host-decode-runtime：已有 decode wrapper 仅增加 runtime 上下文；
  project 对象身份及原 descriptor/function 形状不变。
- compiler-corpus-matchers.branch-matcher：仅 toMatchObject 使用新 projection；
  原 Bun matcher、原 golden、其他 expect 方法与未知 foreign 仍原样。

projection 复用现 copies/pending 与完整 descriptor/accessor 复制。只有真实
array 的直接原型及其父层分别认证为同 owner canonical Array/Object.prototype、
原尾为 null 时，才建立专用 Array prototype 分支并在其尾加入 host Array.prototype
锚点。此分支另用独立 copies/pending，不得更改和普通记录共享的 Object.prototype
副本；普通记录不能因此 instanceof Array。源 canonical 层的 own descriptor、
继承 enumerable、holes、undefined、-0、alias/cycle 和 accessor receiver 都保留。
host 标准链有 enumerable 污染时 fail closed；custom/null/foreign/spoof 不认证。

B（先写，不运行）：保留原整体 matcher expected true 与全部 exact 断言；C21
native baseline 明确标准通过、另外三种原型拒绝（仅新诊断，不削原语义）。
真实 WASM/native factory 验证公开 snapshot 不变与 matcher 专用分支隔离；canonical
原型 mutation/data/accessor/enum、holes/readonly/symbol/-0/alias/cycle、custom/null/
foreign/spoof、两 heap、closeModule 后 held view、host enumerable 污染 failclosed、
getter false/undefined 首错及 frame/root/raw error 平衡。禁止单独 probe/局部测试。

施工状态：A 已写；B/C 在本批 overlay 完成后统一整合；D 未执行。

C20 contracts 独立 D 证据（不等于 A06 已通过）：guard
212b4140586f4ddc80af5ae859c31e89 exit2/cleanup true，前六 check passed，
retained m13-01 criteria/inventory/corpus stale 阻断，finalize 同源阻断，
compatibility matrix 两 matrixSha stale。其余独立 verify 实测 passed：
repeat 20/20、surface、API、workflow、documentation、onboarding 6/6、
rehearse 4/4。integrity 显式 ELISCRIPT_DEFER_PERFORMANCE_ACCEPTANCE=1
passed，14 benchmark bindings 明确 DEFERRED / NOT ACCEPTED；无该环境的
原 integrity stale 失败仍保留，没有手改报告。各原日志：
eliscript-candidate20-contract-<name>.log。A06 仍未勾选。

C22 补齐现有 graph decode 接缝：managed-module-graph.attachRuntime 将原
runtime realm 别名登记给 graph facade；原 prepare/read/invoke 动态边界把
facade 交给 withManagedSourceDecode。observeManagedProjectRuntime 只按真实
已认证 toHostValue 函数身份传播 native 外层 API 别名；不改 project transport
身份。真实 B 从同 lowered descriptor 找 report/makeReport cells，通过实际
图 read/invoke 验证上下文，不手造来源记录。

C20 WASM row541（core-stdlib-usage）的原 failure 位于原 expect(api.report).
toMatchObject，完整 diff 只有 Received 额外项（Expected removed 为 0），
observed=[1,2,3] 也打印相同；与现已证实的数组 matcher 边界一致，目前没有
独立 source-value 错误证据。C22 仍保该原完整 golden，是否解除由统一 D 判断，
不能依据本次只读归类标通过。

C22 施工：B/C 源码已写齐到隔离 overlay；D 未执行、未生成、未检查。保留
C20 正式验收运行及全部原失败，不提前覆盖 actual/generated/source assets。

最终精确 alias 接线以此为准：native-managed-runtime 会为所有方法创建新 guarded
closure，因此不能按方法名称或无法溯源的函数推断 realm。其既有 api 变量是
确切来源，原 Object.freeze(methods) 发布表达式仅经私有 WeakMap 登记为 api
的 alias，再交原 observeManagedProjectRuntime；所有方法、project、运行时
对象身份保持原样。graph 只传播已经登记的 runtime alias，不猜函数来源。
registerManagedSourceDecodeRuntime(runtime, owner, classifier?) 只有 factory 的
显式第三参数能创建 realm；普通两参数 alias 查不到 owner 时不登记。

最终 C22 overlay 施工文件：六份生产 Eli（source-view、foreign-binding、
managed-host、managed-module-graph、native-managed-runtime、corpus-matchers），
同一 matcher Eli B，以及本唯一计划。均未生成、未执行、未验证。


### C24 原 macro Node host 的进程生命周期接线（P05/P07）

- A：C20 WASM `original-program:macro-generated-names-node` 的真实原 host
  发起 `import(...).then(...)` 后立即结束模块评价。通用 driver 的
  `await import(host)` 随即进入 `finally context.close()`，晚到的函数
  facade 才访问 graph，得到 `managed graph is closed`。原 Node 子进程
  本来等待事件循环中的导入及全部断言；不是新的初始化或容量失败。
- B：保留原 host/fixture/expected/hash 全字节，补精确 record/host policy
  边界、普通 host 立即 close、false/undefined 第一错误、幂等清理；用实际
  Eli 编译的 Node fire-and-forget 模块导入验证断言执行先于最终 exit 清理。
- C：仅 binary 原 macro Node record 的私有 runtimeOptions 增加
  `originalHostLifetime: process`；host-context 对该精确运输 host 才让
  driver close 等待既有真实 `exit` hook 的同步 close-now。普通 host 不变，
  非该 host 不接受此 policy，不修改原 raw corpus 或用户程序语义。
- D：全部 B/C 写齐后统一生成及受影响批次验证；当前保持 actual 输入冻结，
  overlay 实现不冒称已通过，完整三输出与其余真实失败证据继续保留。

### C23/C25：同批统一验收的真实诊断与独立 Seed 运行库身份

C23 的原 `managedHostInvokeDiagnosticExports` 必需 ABI 包含从未公开导出的
`value-function-code`，真实镜像静默跳过诊断。仅将该项改为可选 own data
callable，不触碰 accessor，保留原状态/class、false/undefined 首错及回收。
对应真实导出与缺少私有导出 B 已写齐；不凭未知 tuple 改 arity 或 GC。

C25：JS record `original-program:compiler-literal-runtime-complete` 的独立
Seed oracle 在原第五 codec 用例抛出 `unsupported object`，不能计等价。
原 host 在 sourceRoot 真实生成的 portable 模块使用 sourceRoot runtime，
而 replay host codec 使用产物目录 runtime 副本，导致集合构造器身份分裂。
只在 `execute-seed-program` 的私有 context 增加 `independentSeedProgram`，
按原完整 suite/fixture/host/runtimeProfile/setup/reference/expected 合同
认证此来源，再复用 `prepareCompilerCorpusNativeProviders` 的完整声明、
字节、realpath 与冲突检查。selected/未知 host 不进入；原独立编译、
全部五项、JS/map 字节比较和 codec 黄金保持。

- [x] B：实际两份 Emacs portable 编译与 JS/map 原字节、完整 codec
  类型/参数身份；缺失声明、被改 runtime 字节拒绝；诊断可选私有 ABI。
- [x] C：C22–C25 所有 overlay 完成，合并进 ignored 隔离工具副本；
  C23/C22 的 managed-host 与 C24/C25 的 execution 独立 hunk 合并。
- [ ] D：隔离整批生成及受影响用例；C20 活源码仍冻结，原完整运行继续。
  所有真实结果收齐后才替换正式候选并统一复验，不将诊断等同修复通过。

### C27：真实持久化解构与普通对象同名数组方法

- A：C26 原三份产品重放确认 map `persistent_shortcuts` code531/count0、
  multi `report` code532/count0、queue `persistent_queue_pop` code542/count1；
  callee kind18、captures0、参数 kind7/count/length 全部合法。
  前两份的持久化 map 被 `value-binding-lookup-exact` 的 kind13/custom
  prototype 拒绝；拒绝消息观察 constructor 时进一步变成 raw bounds。
  queue 的真实 `pop` 尚未 Get 就被 `value-array-method-check` 当非数组拒绝。
- B：复用原 map/multi/queue 源与独立 JS 发射输出，WASM/native 验原报告；
  追加 keyword/symbol/string 区分、缺省与存在 undefined/null、默认值惰性，
  普通对象自身/继承 push/pop/slice 的 getter、receiver、参数、首错顺序，
  原数组原生快路径及 zero imports、清理/live0/frame0。
- C：`managed-literals` 的真实 WeakMap 品牌与 ILookup 协议返回私有 lookup
  tuple；仅已有 literal 上下文的用户 map pattern 调用，未命中品牌返回 nil
  并走原 raw lookup。canonical helper 通过原 namespace/linker 解析，保留
  标签 key 身份，不加 host import。kind13 普通方法进入既有 Get/invoke。
- [x] B：上述完整原 fixture 与独立 JS/Binary 回归源码已写齐，未运行。
- [x] C：上述 lookup/source-method 接线已写齐于 C27 overlay，actual 保持冻结。
- [ ] D：统一生成并完整复验原程序和新增 B；未运行，不计通过。


### C28 / P05、P07：已证 Bun smol 静默退出的精确 runner 路由

A：相同当前源码在 bun --smol test 中 matcher/Seed 两文件约四秒静默 exit1；
标准无 preload 的 bun test 真实收齐22项，Seed15通过，matcher唯一新的 graph
setup 错已纳同批修复。smol 为此分支新增 RSS 策略，不是原 HEAD 执行语义。
只取消 compiler-seed-runtime-identity.test.mjs 与
compiler-corpus-matchers-selfhosted.test.mjs 两个精确 basename 的 smol 参数；
不过滤文件、不改变原用例/child host flags/时限/资源限制，其余文件仍用原
['--smol','test',file]，包括原 ci-contract synthetic fixtures。

源码位置：完整迁 tools/testing/file-workers.mjs 到维护
 tools/testing/file-workers.eli，生成仍原入口（不新增legacy wrapper）；复用
resource-supervisor.mjs 的原 IO，保 FILE_WORKERS=2、exclusive barriers、原序结果、
SIGINT/SIGTERM取消及未启动尾部、严格 shard parsing、所有 outcome/archive 与关闭。
私有 worker-test-arguments(file) 是唯一 mode 分支；主入口仍实际执行整个清单。
不迁移 supervisor，不新增替代监控。编译生成映射/ignore/Make 显式新 B 同批接齐。

B：新增 tests/eliscript/file-workers.eli，测试 scheduleTestFiles 的真实私有参数
选择：两个精确 basename standard；相近名/大小写/未知仍 smol；所有原文件都调用。
复用原 ci-contract 全部 B，原源码不变；新 B 另外核两worker、exclusive/精确两例
顺序、取消、false/undefined run rejection的完整结果、不丢原 failure/resource/message、
listener归还、shard/API严格拒绝。原实际CLI/archive/worker isolation/首错用原
ci-contract 全套集中验收，不复制其 JS synthetic 程序模板。

C28 A/B/C施工完成后冻结；D尚未执行，不因源码迁移或先前standard通过标本批通过。

C28 施工已写齐：维护 Eli runner完整迁移，原六项公开exports及原两worker/
exclusive/取消/分片/outcome/archive流程保留；新增五个B注册，原ci-contract
所有既有B未改。bootstrap两条生成映射、Make原Bun清单单项、ignore四条仅在
本批overlay；旧mjs不手写、不加legacy wrapper，合批生成后才作为ignored产物。
本批未生成/编译/检查/运行，最终D须同时收新B与原ci-contract完整回归。

### C29 / P05、P07：matcher 新 B 的真实 host descriptor capability

- [x] A：C26 部署后六项旧 matcher 用例通过，第七项新增真实图 B 在
  `check-matcher-realm` 的首次 `Object.defineProperty` 报 ELI-RT0003。
  source-view 的 `define` 原样进入 `nativeReflect(10, [source, key, entry])`；
  真实宿主 descriptor 经既有 codec 编码为 foreign 值，运行时按真实 Has/Get
  读取 descriptor 字段，要求已声明的 `source-operation`。原 B 仅开启
  `phased`，未声明 `foreignEntry`，故在真实 managed accessor 之前失败。
- [x] B：保同一原始 program 的 owned lowering 和真实 WASM `imports=[]`
  独立断言；新 host descriptor/Symbol/prototype mutation 路径对同一 IR
  声明 `foreignEntry:true`，严格断言唯一 `eliscript.host/source-operation`
  function、arity=2、ABI=`managed-host-call-v1`，可用 type 信息严格匹配
  `(i32,i32)->i32`。保所有原字段、原型、descriptor、getter 首错、matcher、
  IR 不变及 WASM/native 清理断言。
- [x] C：仅改 `tests/eliscript/compiler-corpus-matchers.eli` 新 B 的两份
  lowering/image 和真实 capability 断言；不改六份 C22 生产实现、raw ABI、
  原 matcher/golden 或当前冻结 generated 文件。
- [ ] D：由统一生成和集中部署验收执行原完整七项；本 overlay 未生成、未运行。


### C30 / P05、P07：source Array 显式 null 原型保真

- [x] A：原 setter 对 source Array 写 parent=0 并置显式 bit8192；
  `heap-reflection-prototype` 与 `heap-source-inherited-prototype` 却在该
  bit 分支把 0 当默认 Object.prototype，`heap-standard-link(type0)` 又会
  将显式 0 回填为 realm Object root。legacy public view 原样读取 raw
  prototype，faithful snapshot/private projection 原样运输该结果，故真实
  缺陷首先位于 raw runtime，而非 matcher 特例。canonical Array.prototype
  创建时 Object root 已存在，`value-array-new` 原本存非零父链。
- [x] B：原真实 WASM/native matcher B 在 custom→null 后先严格验 raw
  public prototype=null、继承 Has/Get 无 toString，再独立验 faithful
  snapshot 与 private projection 均 null；GC 后重复三层断言并验 canonical
  Array.prototype→Object.prototype 未变、own descriptors/alias/self 保留，
  finally 恢复原同 heap Array.prototype。原零-import/capability/golden、
  全字段与所有既有断言保持。
- [x] C：仅两 reader 的 kind14+bit8192 分支直接返回已存 parent；
  `heap-standard-link(type0)` 仅在未设 bit8192 时回填 parent0。其余默认
  懒链、构造器/其他 bit 含义、setter、GC、C27 hunk 和 matcher 生产不变。
- [ ] D：统一生成后执行原完整七项；本 overlay 未生成、未运行、未检查。

### C29 / P05、P07：matcher 新 B 的真实 host descriptor capability

- [x] A：C26 部署后六项旧 matcher 用例通过，第七项新增真实图 B 在
  `check-matcher-realm` 的首次 `Object.defineProperty` 报 ELI-RT0003。
  source-view 的 `define` 原样进入 `nativeReflect(10, [source, key, entry])`；
  真实宿主 descriptor 经既有 codec 编码为 foreign 值，运行时按真实 Has/Get
  读取 descriptor 字段，要求已声明的 `source-operation`。原 B 仅开启
  `phased`，未声明 `foreignEntry`，故在真实 managed accessor 之前失败。
- [x] B：保同一原始 program 的 owned lowering 和真实 WASM `imports=[]`
  独立断言；新 host descriptor/Symbol/prototype mutation 路径对同一 IR
  声明 `foreignEntry:true`，严格断言唯一 `eliscript.host/source-operation`
  function、arity=2、ABI=`managed-host-call-v1`，可用 type 信息严格匹配
  `(i32,i32)->i32`。保所有原字段、原型、descriptor、getter 首错、matcher、
  IR 不变及 WASM/native 清理断言。
- [x] C：仅改 `tests/eliscript/compiler-corpus-matchers.eli` 新 B 的两份
  lowering/image 和真实 capability 断言；不改六份 C22 生产实现、raw ABI、
  原 matcher/golden 或当前冻结 generated 文件。
- [ ] D：由统一生成和集中部署验收执行原完整七项；本 overlay 未生成、未运行。


#### C26–C29 已取得的真实 D 证据

- C26 managed-host 原完整七项通过；run `7db085a4891948f888a5061947e63732`，
  8.928秒、峰值904593408字节、exit0/cleanup complete。三原 product 的
  只读回放已给出内部函数 code531/532/542，首错/原输入完整保留。
- C25 Seed 原完整15项在标准 Bun（无诊断 preload）全部通过；同批 matcher
  新B setup/null失败保留，不能把21/22汇总说成全通过。run
  `bd39276b380b4a7dab9593881e1318f0`，17.681秒、峰值1022279680字节。
- C28 新五项及原CI调度完整30项共35/35通过；run
  `a465828f6c2e4f6fa7b4beee22387525`，7.828秒、峰值343080960字节，
  exit0/cleanup complete。未改任何原CI用例。
- C27 原zero-imports十五项全部通过，包括两目标的原owned report matcher；
  新第十六项在独立JS reference揭示测试lambda的词法this前提错误，
  已改真实普通defun并保receiver断言。run `d103c4ea8c0a4043b6726c75cc6cd287`，
  234.406秒、峰值5360582656字节、exit1/cleanup complete。此前runtime补丁
  错落callback函数的unbound method也已明确移回真正method-check，未盲改
  arity/GC。本轮与C30一起重新冻结，尚无新整批通过结论。
- C20 JS portable-persistent-vector-1 的独立Seed超原30秒；两份实际可执行
  JS逐字一致，原host/flags相同，未找到运输或容量缺陷。本项仍unverified，
  保存原失败，不提时限、不借selected代替独立oracle，最终原参数验收。

- C31 / P05：C20 JS 四条 `original-managed:sorted-core:{node,bun}:auto-{65536,1}`
  均在 provider prelaunch 首次声明数组校验失败。原始 record.request 无 hostSources，
  实际 request.json 已由完整 corpus evidence 补齐；产物只有三个真实 stdlib/tests
  模块，没有 runtime module 冲突。执行路径误读 raw 声明，尚未进入字节冲突检查。
  仅精确四 ID 且原请求无 own hostSources 时复用 sequence 已有 sourceAssets 路径；
  完整 canonical base64、SHA、UTF8、逐文件真实 bytes/realpath、全部 runtime 覆盖及
  runtime alias/product scope 冲突校验不变。显式 hostSources（包括 undefined/null/空）
  不回退到 assets；原 record/request/source/host/golden/auto 与 target 选择均不变。
  B 覆盖四实际 recipe 成功、原数据不变、完整 proof、缺项/重复/伪 base64/SHA/真实字节
  篡改、显式坏声明、runtime 产物冲突、错误现有目录和非精确 ID 不进入。
  施工：新增测试写齐后完成 execution 单独 hunk；验收待根统一 D，不在 overlay 运行。

### C32 / P05、P07：matcher B 服从原 host capability 关闭合同

- [x] A：C30 原七项中六项通过；新增真实图 B 的 null/custom/GC 断言已过，
  末尾 `closeModule`、graph.close、collect 后继续 matcher 失败。
  原 `closeModule -> lifecycle.dispose` 明确置 capabilityOpen=false，所有
  public view 操作进入既有 `using` 后拒绝 `managed host value is closed`。
  外部 raw handle 保 heap root，不等于保留已关闭的 host codec capability。
- [x] B：保关闭前全部原 golden、字段、原型、descriptor、双 heap、GC 和
  matcher 断言；关闭后分别严格断言 public Get、faithful snapshot、private
  projection、原包装 matcher 与原 Bun matcher 均抛 Error，精确 message
  `managed host value is closed`。原 raw root release/live0/帧清理保持。
- [x] C：仅修 `tests/eliscript/compiler-corpus-matchers.eli` 末尾新增 B 的
  错误关闭后读取前提，不改 runtime/legacy、关闭合同、golden 或生产六文件。
- [ ] D：统一生成后执行原完整七项；本 overlay 未生成、未运行、未检查。

### C30 / P05、P07：source Array 显式 null 原型保真

- [x] A：原 setter 对 source Array 写 parent=0 并置显式 bit8192；
  `heap-reflection-prototype` 与 `heap-source-inherited-prototype` 却在该
  bit 分支把 0 当默认 Object.prototype，`heap-standard-link(type0)` 又会
  将显式 0 回填为 realm Object root。legacy public view 原样读取 raw
  prototype，faithful snapshot/private projection 原样运输该结果，故真实
  缺陷首先位于 raw runtime，而非 matcher 特例。canonical Array.prototype
  创建时 Object root 已存在，`value-array-new` 原本存非零父链。
- [x] B：原真实 WASM/native matcher B 在 custom→null 后先严格验 raw
  public prototype=null、继承 Has/Get 无 toString，再独立验 faithful
  snapshot 与 private projection 均 null；GC 后重复三层断言并验 canonical
  Array.prototype→Object.prototype 未变、own descriptors/alias/self 保留，
  finally 恢复原同 heap Array.prototype。原零-import/capability/golden、
  全字段与所有既有断言保持。
- [x] C：仅两 reader 的 kind14+bit8192 分支直接返回已存 parent；
  `heap-standard-link(type0)` 仅在未设 bit8192 时回填 parent0。其余默认
  懒链、构造器/其他 bit 含义、setter、GC、C27 hunk 和 matcher 生产不变。
- [ ] D：统一生成后执行原完整七项；本 overlay 未生成、未运行、未检查。

### C29 / P05、P07：matcher 新 B 的真实 host descriptor capability

- [x] A：C26 部署后六项旧 matcher 用例通过，第七项新增真实图 B 在
  `check-matcher-realm` 的首次 `Object.defineProperty` 报 ELI-RT0003。
  source-view 的 `define` 原样进入 `nativeReflect(10, [source, key, entry])`；
  真实宿主 descriptor 经既有 codec 编码为 foreign 值，运行时按真实 Has/Get
  读取 descriptor 字段，要求已声明的 `source-operation`。原 B 仅开启
  `phased`，未声明 `foreignEntry`，故在真实 managed accessor 之前失败。
- [x] B：保同一原始 program 的 owned lowering 和真实 WASM `imports=[]`
  独立断言；新 host descriptor/Symbol/prototype mutation 路径对同一 IR
  声明 `foreignEntry:true`，严格断言唯一 `eliscript.host/source-operation`
  function、arity=2、ABI=`managed-host-call-v1`，可用 type 信息严格匹配
  `(i32,i32)->i32`。保所有原字段、原型、descriptor、getter 首错、matcher、
  IR 不变及 WASM/native 清理断言。
- [x] C：仅改 `tests/eliscript/compiler-corpus-matchers.eli` 新 B 的两份
  lowering/image 和真实 capability 断言；不改六份 C22 生产实现、raw ABI、
  原 matcher/golden 或当前冻结 generated 文件。
- [ ] D：由统一生成和集中部署验收执行原完整七项；本 overlay 未生成、未运行。

### C33：原完整异步 fixture 的实际能力与纯图零导入

- A：C30 完整 zero-imports 的旧 15 项全部通过；新增第 16 项独立 JS 的
  tagged/queue/ordinary 断言已过，但错误地对含原 multi-arity 异步函数的
  全图断言 imports=[]。`managed-await-host-capability-p` 对真实
  `await (async-choice ...)` 与 `await (Multi/async-report)` 的结果不能证明
  是本地 Promise，按既有互操作合同需要唯一 source-operation，不是
  C27 literal lookup 引入宿主调用。生产能力推导保持不变。
- [x] B/C：由相同 Eli 公共源码片段派生 pure entry，明确 phased roots
  排除未用 multi 模块；独立 JS、WASM/native 仍执行 map/queue/ordinary，
  descriptor 与实际 imports 严格为空。原三份完整 fixture/main/async
  继续真实执行；descriptor 严格唯一 module/name/arity2/ABI，实际 WASM
  二进制 type/import section 关联严格验证 (i32,i32)->i32，不依赖可选的
  引擎类型反射。所有原报告、receiver、getter、golden、资源、live/frame
  断言保留，未运行或生成；不重跑已过 matcher 组。
- [ ] D：统一生成并完整复验受影响 zero-imports；actual 保持冻结。

#### C30–C32 已取得的真实 D 证据

- matcher 原完整七项 7/7 通过，真实 WASM/native 原型、descriptor、跨 heap、GC、关闭后拒绝及原 Bun matcher 均执行；run `d2f5d65389cf4d37a15740fd785e96d1`，9.917 秒、峰值 1510129664 字节、exit0/cleanup complete。
- core-project 原完整七项 7/7 通过，含四条 sorted 归档 provider 认证与所有阴性用例；run `50d03a15e1e341c2a9935d353af0438d`，3.559 秒、峰值 848773120 字节、exit0/cleanup complete。实际四条完整语料仍待重新验收。
- C30 zero-imports 原十五项通过；新第十六项因完整异步 fixture 的零导入前提错误失败。run `1534872541914ca0a4c21007b738f56c`，240.839 秒、峰值 5073551360 字节、exit1/cleanup complete。C33 只修该新增用例的能力边界，不能将旧十五项通过标成整文件通过。
- C20 全量三输出仍在执行；已知失败保留，与修复后的集中验收分开。正式编译器新增 C27/C30 修复后，最终固定点、全门禁、版本与交付仍未完成。

- C34 / P05：C20 native 原百万 vector/map/set 三项在 heap-new 即 ELI-RT0002，
  尚未 initialize 或进入百万循环；不能归因于运行百万的 live 需求或泄漏。
  原发射 request.memory=4096..65535，functional 收据槽数8388607、初始256MiB、
  池上限1GiB/auto16MiB均已正确。执行层仅转发 budget，未将同 profile.memory
  转发原program JSON；native loader于是用缺省 maximumPages256（16MiB），
  256MiB初始池在构造阶段确定不能容纳。抽出原配置函数
  prepareCompilerCorpusRuntimeContext(context,acceptance)，同一路径复制 budget 和
  matching memory，record.memory显式声明优先；不改原百万输入/黄金/auto/负向容量。
  B：三recipe请求memory与真实prelaunch context精确一致；small/显式memory/
  无admission/原数据不变与deferred状态保持。B写齐后C接唯一执行路径，统一D待验。
  WASM同index562仍运行，不能用native构造首错推断它；原同步循环sourceview
  weakref/pin终结时机及全cache同步具有成本风险，未获得实例快照，不据时长停止。

### C36：明确百万规模容量/性能延期，不记为功能通过

- A：同步 host 的每个新 source view 由 WeakRef/cache/consoleRoots 保根至
  当前 job 结束；每个 host/source 操作前后又扫描全部 sourceCache。
  百万旧版同步更新至少产生平方级扫描。portable vector/map 每版本的
  record/table/key/count 等至少 10 个 managed 值；set 连同其独有 map
  至少 17 个。各自超现 8,388,607 槽，不据耗时声称死循环，不提前释放
  逃逸 view，不提高预算或迁移整份 legacy 工厂。
- B：完整 source/host/SHA/region 认证以下六个实际百万 recipe；显式
  small 时 JS/WASM/native 使用同一延期集合，原 complete-hosts 保持有效。
  原无 profile/显式负向预算/篡改/缺失证据保持原严格门槛或拒绝。
  `stable-compatibility:program:persistent-core-exit-{vector,map,set}`；
  `original-program:portable-persistent-vector-1`、`portable-persistent-map-2`、
  `portable-persistent-set-2`（后三项均带原 original-program 前缀）。原
  complete-hosts 只包装 compiles/agrees host，不冒充其独立百万 case；
  JS 也使用同一延期集合，保留既有 Seed timeout 为未验收历史证据。
- C：resourceDeferred 与 cancelled/passed 独立，保 raw corpus/全部源身份，
  原 record 写 resource-deferred/deferred、原 ID/target/来源及原因；仅有效
  功能集合继续真实执行。完整 corpus 验证仍 unverified，功能汇总明确
  passed-effective-scope。旧百万失败/停止/Seed timeout 全部保留，不改黄金。
- [x] B：六项精确分类、三目标同集合、原完整 host 有效、无 profile 与
  显式预算/错误/缺失及篡改来源的永久 Eli 回归已写，未运行。
- [x] C：精确分类/record 循环/汇总接线已写齐。延期 record 仍归档完整原
  来源并落独立 resource-deferred.json；不编译/执行、不计 pass/cancel，
  小档正向集合继续按原三目标运行，fullCorpusVerification 保持 unverified。
- [ ] D：统一生成与完整受影响门禁；不重跑原规模失败冒充通过。

### C33：原完整异步 fixture 的实际能力与纯图零导入

- A：C30 完整 zero-imports 的旧 15 项全部通过；新增第 16 项独立 JS 的
  tagged/queue/ordinary 断言已过，但错误地对含原 multi-arity 异步函数的
  全图断言 imports=[]。`managed-await-host-capability-p` 对真实
  `await (async-choice ...)` 与 `await (Multi/async-report)` 的结果不能证明
  是本地 Promise，按既有互操作合同需要唯一 source-operation，不是
  C27 literal lookup 引入宿主调用。生产能力推导保持不变。
- [x] B/C：由相同 Eli 公共源码片段派生 pure entry，明确 phased roots
  排除未用 multi 模块；独立 JS、WASM/native 仍执行 map/queue/ordinary，
  descriptor 与实际 imports 严格为空。原三份完整 fixture/main/async
  继续真实执行；descriptor 严格唯一 module/name/arity2/ABI，实际 WASM
  二进制 type/import section 关联严格验证 (i32,i32)->i32，不依赖可选的
  引擎类型反射。所有原报告、receiver、getter、golden、资源、live/frame
  断言保留，未运行或生成；不重跑已过 matcher 组。
- [ ] D：统一生成并完整复验受影响 zero-imports；actual 保持冻结。

### C23/C25：同批统一验收的真实诊断与独立 Seed 运行库身份

C23 的原 `managedHostInvokeDiagnosticExports` 必需 ABI 包含从未公开导出的
`value-function-code`，真实镜像静默跳过诊断。仅将该项改为可选 own data
callable，不触碰 accessor，保留原状态/class、false/undefined 首错及回收。
对应真实导出与缺少私有导出 B 已写齐；不凭未知 tuple 改 arity 或 GC。

C25：JS record `original-program:compiler-literal-runtime-complete` 的独立
Seed oracle 在原第五 codec 用例抛出 `unsupported object`，不能计等价。
原 host 在 sourceRoot 真实生成的 portable 模块使用 sourceRoot runtime，
而 replay host codec 使用产物目录 runtime 副本，导致集合构造器身份分裂。
只在 `execute-seed-program` 的私有 context 增加 `independentSeedProgram`，
按原完整 suite/fixture/host/runtimeProfile/setup/reference/expected 合同
认证此来源，再复用 `prepareCompilerCorpusNativeProviders` 的完整声明、
字节、realpath 与冲突检查。selected/未知 host 不进入；原独立编译、
全部五项、JS/map 字节比较和 codec 黄金保持。

- [x] B：实际两份 Emacs portable 编译与 JS/map 原字节、完整 codec
  类型/参数身份；缺失声明、被改 runtime 字节拒绝；诊断可选私有 ABI。
- [x] C：C22–C25 所有 overlay 完成，合并进 ignored 隔离工具副本；
  C23/C22 的 managed-host 与 C24/C25 的 execution 独立 hunk 合并。
- [ ] D：隔离整批生成及受影响用例；C20 活源码仍冻结，原完整运行继续。
  所有真实结果收齐后才替换正式候选并统一复验，不将诊断等同修复通过。

### C27：真实持久化解构与普通对象同名数组方法

- A：C26 原三份产品重放确认 map `persistent_shortcuts` code531/count0、
  multi `report` code532/count0、queue `persistent_queue_pop` code542/count1；
  callee kind18、captures0、参数 kind7/count/length 全部合法。
  前两份的持久化 map 被 `value-binding-lookup-exact` 的 kind13/custom
  prototype 拒绝；拒绝消息观察 constructor 时进一步变成 raw bounds。
  queue 的真实 `pop` 尚未 Get 就被 `value-array-method-check` 当非数组拒绝。
- B：复用原 map/multi/queue 源与独立 JS 发射输出，WASM/native 验原报告；
  追加 keyword/symbol/string 区分、缺省与存在 undefined/null、默认值惰性，
  普通对象自身/继承 push/pop/slice 的 getter、receiver、参数、首错顺序，
  原数组原生快路径及 zero imports、清理/live0/frame0。
- C：`managed-literals` 的真实 WeakMap 品牌与 ILookup 协议返回私有 lookup
  tuple；仅已有 literal 上下文的用户 map pattern 调用，未命中品牌返回 nil
  并走原 raw lookup。canonical helper 通过原 namespace/linker 解析，保留
  标签 key 身份，不加 host import。kind13 普通方法进入既有 Get/invoke。
- [x] B：上述完整原 fixture 与独立 JS/Binary 回归源码已写齐，未运行。
- [x] C：上述 lookup/source-method 接线已写齐于 C27 overlay，actual 保持冻结。
- [ ] D：统一生成并完整复验原程序和新增 B；未运行，不计通过。


### C28 / P05、P07：已证 Bun smol 静默退出的精确 runner 路由

A：相同当前源码在 bun --smol test 中 matcher/Seed 两文件约四秒静默 exit1；
标准无 preload 的 bun test 真实收齐22项，Seed15通过，matcher唯一新的 graph
setup 错已纳同批修复。smol 为此分支新增 RSS 策略，不是原 HEAD 执行语义。
只取消 compiler-seed-runtime-identity.test.mjs 与
compiler-corpus-matchers-selfhosted.test.mjs 两个精确 basename 的 smol 参数；
不过滤文件、不改变原用例/child host flags/时限/资源限制，其余文件仍用原
['--smol','test',file]，包括原 ci-contract synthetic fixtures。

源码位置：完整迁 tools/testing/file-workers.mjs 到维护
 tools/testing/file-workers.eli，生成仍原入口（不新增legacy wrapper）；复用
resource-supervisor.mjs 的原 IO，保 FILE_WORKERS=2、exclusive barriers、原序结果、
SIGINT/SIGTERM取消及未启动尾部、严格 shard parsing、所有 outcome/archive 与关闭。
私有 worker-test-arguments(file) 是唯一 mode 分支；主入口仍实际执行整个清单。
不迁移 supervisor，不新增替代监控。编译生成映射/ignore/Make 显式新 B 同批接齐。

B：新增 tests/eliscript/file-workers.eli，测试 scheduleTestFiles 的真实私有参数
选择：两个精确 basename standard；相近名/大小写/未知仍 smol；所有原文件都调用。
复用原 ci-contract 全部 B，原源码不变；新 B 另外核两worker、exclusive/精确两例
顺序、取消、false/undefined run rejection的完整结果、不丢原 failure/resource/message、
listener归还、shard/API严格拒绝。原实际CLI/archive/worker isolation/首错用原
ci-contract 全套集中验收，不复制其 JS synthetic 程序模板。

C28 A/B/C施工完成后冻结；D尚未执行，不因源码迁移或先前standard通过标本批通过。

C28 施工已写齐：维护 Eli runner完整迁移，原六项公开exports及原两worker/
exclusive/取消/分片/outcome/archive流程保留；新增五个B注册，原ci-contract
所有既有B未改。bootstrap两条生成映射、Make原Bun清单单项、ignore四条仅在
本批overlay；旧mjs不手写、不加legacy wrapper，合批生成后才作为ignored产物。
本批未生成/编译/检查/运行，最终D须同时收新B与原ci-contract完整回归。

### C29 / P05、P07：matcher 新 B 的真实 host descriptor capability

- [x] A：C26 部署后六项旧 matcher 用例通过，第七项新增真实图 B 在
  `check-matcher-realm` 的首次 `Object.defineProperty` 报 ELI-RT0003。
  source-view 的 `define` 原样进入 `nativeReflect(10, [source, key, entry])`；
  真实宿主 descriptor 经既有 codec 编码为 foreign 值，运行时按真实 Has/Get
  读取 descriptor 字段，要求已声明的 `source-operation`。原 B 仅开启
  `phased`，未声明 `foreignEntry`，故在真实 managed accessor 之前失败。
- [x] B：保同一原始 program 的 owned lowering 和真实 WASM `imports=[]`
  独立断言；新 host descriptor/Symbol/prototype mutation 路径对同一 IR
  声明 `foreignEntry:true`，严格断言唯一 `eliscript.host/source-operation`
  function、arity=2、ABI=`managed-host-call-v1`，可用 type 信息严格匹配
  `(i32,i32)->i32`。保所有原字段、原型、descriptor、getter 首错、matcher、
  IR 不变及 WASM/native 清理断言。
- [x] C：仅改 `tests/eliscript/compiler-corpus-matchers.eli` 新 B 的两份
  lowering/image 和真实 capability 断言；不改六份 C22 生产实现、raw ABI、
  原 matcher/golden 或当前冻结 generated 文件。
- [ ] D：由统一生成和集中部署验收执行原完整七项；本 overlay 未生成、未运行。


### C30 / P05、P07：source Array 显式 null 原型保真

- [x] A：原 setter 对 source Array 写 parent=0 并置显式 bit8192；
  `heap-reflection-prototype` 与 `heap-source-inherited-prototype` 却在该
  bit 分支把 0 当默认 Object.prototype，`heap-standard-link(type0)` 又会
  将显式 0 回填为 realm Object root。legacy public view 原样读取 raw
  prototype，faithful snapshot/private projection 原样运输该结果，故真实
  缺陷首先位于 raw runtime，而非 matcher 特例。canonical Array.prototype
  创建时 Object root 已存在，`value-array-new` 原本存非零父链。
- [x] B：原真实 WASM/native matcher B 在 custom→null 后先严格验 raw
  public prototype=null、继承 Has/Get 无 toString，再独立验 faithful
  snapshot 与 private projection 均 null；GC 后重复三层断言并验 canonical
  Array.prototype→Object.prototype 未变、own descriptors/alias/self 保留，
  finally 恢复原同 heap Array.prototype。原零-import/capability/golden、
  全字段与所有既有断言保持。
- [x] C：仅两 reader 的 kind14+bit8192 分支直接返回已存 parent；
  `heap-standard-link(type0)` 仅在未设 bit8192 时回填 parent0。其余默认
  懒链、构造器/其他 bit 含义、setter、GC、C27 hunk 和 matcher 生产不变。
- [ ] D：统一生成后执行原完整七项；本 overlay 未生成、未运行、未检查。

### C29 / P05、P07：matcher 新 B 的真实 host descriptor capability

- [x] A：C26 部署后六项旧 matcher 用例通过，第七项新增真实图 B 在
  `check-matcher-realm` 的首次 `Object.defineProperty` 报 ELI-RT0003。
  source-view 的 `define` 原样进入 `nativeReflect(10, [source, key, entry])`；
  真实宿主 descriptor 经既有 codec 编码为 foreign 值，运行时按真实 Has/Get
  读取 descriptor 字段，要求已声明的 `source-operation`。原 B 仅开启
  `phased`，未声明 `foreignEntry`，故在真实 managed accessor 之前失败。
- [x] B：保同一原始 program 的 owned lowering 和真实 WASM `imports=[]`
  独立断言；新 host descriptor/Symbol/prototype mutation 路径对同一 IR
  声明 `foreignEntry:true`，严格断言唯一 `eliscript.host/source-operation`
  function、arity=2、ABI=`managed-host-call-v1`，可用 type 信息严格匹配
  `(i32,i32)->i32`。保所有原字段、原型、descriptor、getter 首错、matcher、
  IR 不变及 WASM/native 清理断言。
- [x] C：仅改 `tests/eliscript/compiler-corpus-matchers.eli` 新 B 的两份
  lowering/image 和真实 capability 断言；不改六份 C22 生产实现、raw ABI、
  原 matcher/golden 或当前冻结 generated 文件。
- [ ] D：由统一生成和集中部署验收执行原完整七项；本 overlay 未生成、未运行。


#### C26–C29 已取得的真实 D 证据

- C26 managed-host 原完整七项通过；run `7db085a4891948f888a5061947e63732`，
  8.928秒、峰值904593408字节、exit0/cleanup complete。三原 product 的
  只读回放已给出内部函数 code531/532/542，首错/原输入完整保留。
- C25 Seed 原完整15项在标准 Bun（无诊断 preload）全部通过；同批 matcher
  新B setup/null失败保留，不能把21/22汇总说成全通过。run
  `bd39276b380b4a7dab9593881e1318f0`，17.681秒、峰值1022279680字节。
- C28 新五项及原CI调度完整30项共35/35通过；run
  `a465828f6c2e4f6fa7b4beee22387525`，7.828秒、峰值343080960字节，
  exit0/cleanup complete。未改任何原CI用例。
- C27 原zero-imports十五项全部通过，包括两目标的原owned report matcher；
  新第十六项在独立JS reference揭示测试lambda的词法this前提错误，
  已改真实普通defun并保receiver断言。run `d103c4ea8c0a4043b6726c75cc6cd287`，
  234.406秒、峰值5360582656字节、exit1/cleanup complete。此前runtime补丁
  错落callback函数的unbound method也已明确移回真正method-check，未盲改
  arity/GC。本轮与C30一起重新冻结，尚无新整批通过结论。
- C20 JS portable-persistent-vector-1 的独立Seed超原30秒；两份实际可执行
  JS逐字一致，原host/flags相同，未找到运输或容量缺陷。本项仍unverified，
  保存原失败，不提时限、不借selected代替独立oracle，最终原参数验收。

- C31 / P05：C20 JS 四条 `original-managed:sorted-core:{node,bun}:auto-{65536,1}`
  均在 provider prelaunch 首次声明数组校验失败。原始 record.request 无 hostSources，
  实际 request.json 已由完整 corpus evidence 补齐；产物只有三个真实 stdlib/tests
  模块，没有 runtime module 冲突。执行路径误读 raw 声明，尚未进入字节冲突检查。
  仅精确四 ID 且原请求无 own hostSources 时复用 sequence 已有 sourceAssets 路径；
  完整 canonical base64、SHA、UTF8、逐文件真实 bytes/realpath、全部 runtime 覆盖及
  runtime alias/product scope 冲突校验不变。显式 hostSources（包括 undefined/null/空）
  不回退到 assets；原 record/request/source/host/golden/auto 与 target 选择均不变。
  B 覆盖四实际 recipe 成功、原数据不变、完整 proof、缺项/重复/伪 base64/SHA/真实字节
  篡改、显式坏声明、runtime 产物冲突、错误现有目录和非精确 ID 不进入。
  施工：新增测试写齐后完成 execution 单独 hunk；验收待根统一 D，不在 overlay 运行。

### C32 / P05、P07：matcher B 服从原 host capability 关闭合同

- [x] A：C30 原七项中六项通过；新增真实图 B 的 null/custom/GC 断言已过，
  末尾 `closeModule`、graph.close、collect 后继续 matcher 失败。
  原 `closeModule -> lifecycle.dispose` 明确置 capabilityOpen=false，所有
  public view 操作进入既有 `using` 后拒绝 `managed host value is closed`。
  外部 raw handle 保 heap root，不等于保留已关闭的 host codec capability。
- [x] B：保关闭前全部原 golden、字段、原型、descriptor、双 heap、GC 和
  matcher 断言；关闭后分别严格断言 public Get、faithful snapshot、private
  projection、原包装 matcher 与原 Bun matcher 均抛 Error，精确 message
  `managed host value is closed`。原 raw root release/live0/帧清理保持。
- [x] C：仅修 `tests/eliscript/compiler-corpus-matchers.eli` 末尾新增 B 的
  错误关闭后读取前提，不改 runtime/legacy、关闭合同、golden 或生产六文件。
- [ ] D：统一生成后执行原完整七项；本 overlay 未生成、未运行、未检查。

### C30 / P05、P07：source Array 显式 null 原型保真

- [x] A：原 setter 对 source Array 写 parent=0 并置显式 bit8192；
  `heap-reflection-prototype` 与 `heap-source-inherited-prototype` 却在该
  bit 分支把 0 当默认 Object.prototype，`heap-standard-link(type0)` 又会
  将显式 0 回填为 realm Object root。legacy public view 原样读取 raw
  prototype，faithful snapshot/private projection 原样运输该结果，故真实
  缺陷首先位于 raw runtime，而非 matcher 特例。canonical Array.prototype
  创建时 Object root 已存在，`value-array-new` 原本存非零父链。
- [x] B：原真实 WASM/native matcher B 在 custom→null 后先严格验 raw
  public prototype=null、继承 Has/Get 无 toString，再独立验 faithful
  snapshot 与 private projection 均 null；GC 后重复三层断言并验 canonical
  Array.prototype→Object.prototype 未变、own descriptors/alias/self 保留，
  finally 恢复原同 heap Array.prototype。原零-import/capability/golden、
  全字段与所有既有断言保持。
- [x] C：仅两 reader 的 kind14+bit8192 分支直接返回已存 parent；
  `heap-standard-link(type0)` 仅在未设 bit8192 时回填 parent0。其余默认
  懒链、构造器/其他 bit 含义、setter、GC、C27 hunk 和 matcher 生产不变。
- [ ] D：统一生成后执行原完整七项；本 overlay 未生成、未运行、未检查。

### C29 / P05、P07：matcher 新 B 的真实 host descriptor capability

- [x] A：C26 部署后六项旧 matcher 用例通过，第七项新增真实图 B 在
  `check-matcher-realm` 的首次 `Object.defineProperty` 报 ELI-RT0003。
  source-view 的 `define` 原样进入 `nativeReflect(10, [source, key, entry])`；
  真实宿主 descriptor 经既有 codec 编码为 foreign 值，运行时按真实 Has/Get
  读取 descriptor 字段，要求已声明的 `source-operation`。原 B 仅开启
  `phased`，未声明 `foreignEntry`，故在真实 managed accessor 之前失败。
- [x] B：保同一原始 program 的 owned lowering 和真实 WASM `imports=[]`
  独立断言；新 host descriptor/Symbol/prototype mutation 路径对同一 IR
  声明 `foreignEntry:true`，严格断言唯一 `eliscript.host/source-operation`
  function、arity=2、ABI=`managed-host-call-v1`，可用 type 信息严格匹配
  `(i32,i32)->i32`。保所有原字段、原型、descriptor、getter 首错、matcher、
  IR 不变及 WASM/native 清理断言。
- [x] C：仅改 `tests/eliscript/compiler-corpus-matchers.eli` 新 B 的两份
  lowering/image 和真实 capability 断言；不改六份 C22 生产实现、raw ABI、
  原 matcher/golden 或当前冻结 generated 文件。
- [ ] D：由统一生成和集中部署验收执行原完整七项；本 overlay 未生成、未运行。


C36 整合时同时将相同 profile 和冻结 sourceAssets 传入 summary.targetSelections，保证预声明有效集合与实际各 cell 分类一致。

### C40 / P05、P07：独立 Seed 的完整 runtime 归档传递

- A：C20 JS 702–705 的 relational-set / standard-identities 两 host 均已
  实际执行 selected，但 independent Seed 在 canonical native provider 验证
  失败，verification 保持 unverified。`execute-seed-program` 已用冻结
  configuration 完成真实源图，却创建 context 时遗漏 sourceAssets；四条
  sequence 的 archived-providers 分支明确只读 context.sourceAssets，不能
  用 request.hostSources 替代，也不是原程序或黄金模型失败。
- [x] B：原 Seed identity Eli 套件追加两项完整回归：四条运输分支在真实
  原源归档往返后，用完整 runtime + literal 源声明经独立 Emacs 编译执行，
  校验真实构造器、协议、原型、stdout 及 canonical provider 的每份 SHA /
  bytes / realpath；缺失、内容已自洽改写、重复的 provider 声明保持拒绝，
  即使 request.hostSources 仍真实完整也不绕过。原 recipe 全文保持不变。
- [x] C：仅 execute-seed-program 的 context 加入冻结 configuration.sourceAssets；
  原 C24/C25/C31/C34 运输、真实 Seed 编译、provider 全量验证不变。写入
  next-candidate40 overlay，未改 actual、原四条 record、source 或 expected。
- [ ] D：父级统一生成及完整 Seed identity / 原四条 oracle 验收；不把新增
  小运输 fixture 的通过冒充原完整语料已通过。

- C35 protocol 原完整七项 7/7 通过，run `1312c74f64a14dc49a75681296ffd085`，29.058 秒、峰值 1166426112 字节，exit0/cleanup complete；原 atom 完整 host 仍由最终新产物验收，不以这七项代替。
- C36 implicit-resources 原完整六项 6/6 通过，run `d9a973ce5fd14621884fa7da15158c48`，1.639 秒、峰值 1130987520 字节，exit0/cleanup complete；真实完整 corpus 的六项来源认证、三目标相同延期集合、未显式启用仍严格执行及阴性防伪均已执行。最终 matrix 延期持久化和 stage3 汇总仍待整合验收。

### C41 / P05、P07：显式 foreignEntry 的 mutable 初始化通知

- A：C20 WASM575 literal-runtime 已真实执行而语义不同。与 C20 同条 JS575
  已获真实独立 Seed equivalent 的 stdout 逐字段比较，仅三处不同：
  set.evaluationOrder / queue.evaluationOrder 预期 "12" 而 actual ""；
  host.object 预期 true 而 actual false。vector.values 的 [1,2,{}] 两边
  完全一致，不能将其误当 JSON 丢值而修 decoder。
- A：lower-program-core 的 source-operation stub 已允许 foreignEntry=true，
  但 binding-changed stub 仍只允许 external；这使只有显式 foreignEntry
  的图带真实 host capability，却保留空通知，同时 host graph 因非 pure
  而不会启用无导入图 polling。初始化中 source value-module-set 已写真实
  槽，ESM mutable binding 却仍停留初值，不是错误求值顺序。
- [x] B：现有 zero-imports Eli 全套追加独立同源 JS/WASM/native case：
  两组初始化内部写入均 "12"、跨模块再导出同 cell、后续真实调用和 false
  throw 后仍即时更新；严格唯一 source-operation descriptor/真实 WASM
  import、原预算、frame0/live0 和原 source 文本不变。旧 pure 零导入
  cases 全保留。未运行。
- [x] C：仅 project binding-changed stub 条件允许实际 foreignEntry=true；
  默认 / false / 无外部 pure graph 原行为不变。写 next-candidate41，
  正式 compiler/source/host/golden 保持冻结；无新导出或额外接线。
- [ ] D：统一生成并实际复验受影响全套与原 literal-runtime；本项源码完成
  不冒称旧 575 的三个差异都已通过。
- [ ] OPEN：host.object 是原真实宿主 Object.prototype 身份观测，不能改成
  selected-realm prototype 断言来冒充通过。新增零导入 deep-tail case 曾为
  跨 realm deepStrictEqual 比较而加了 ordinary prototype !==host 的前提，
  它不是该原 host 的替代标准。需核该新增前提与公开 js-object 宿主互操作
  合同；本批不改其期望、不全局映射/克隆 source views。

- C40 原完整 Seed runtime identity 17/17 通过，run `c02240825ed24a7798758959ffbcd3ac`，14.445 秒、峰值 468008960 字节，exit0/cleanup complete；四条原独立 oracle 的最终全记录验收仍待新产物。
- C35/C37 新原完整 zero-imports suite 原十五项全部通过，新第十六项真实 report 调用内部 ELI-RT0003，run `4c3e6032d9c1489ba8f72be583890340`，241.912 秒、峰值 5495783424 字节，exit1/cleanup complete。不再重复原十五项，C42 获取这条新增用例的精确内部观察，保持原完整黄金和小资源预算。

### C43 / P05、P07：原 12000 层遍历的必要功能容量

- A：原 stable tree-walk 首错为 managed ELI-RT0002；原源码真实构造并保留 12000 层 persistentVector 深链，再完整 postwalk 和逐层 nth。每层同时保底层持久化数据、包装器及其状态，最终图的必要槽位已超过 small 的 131072；这不同于 C36 的同步百万宿主旧版本累积，不列为延期，不改变深度或算法。
- B：在既有 implicit-resources 测试增加真实完整 corpus 的两条 tree-walk recipe（stable 与 complete-hosts）：仅显式功能档选择现有 full-compiler，发射和 prelaunch memory/预算一致；原源码、auto、原小容量证据及阴性/显式预算不变，未知 ID/改变深度不进入这个额外容量选择。
- C：只扩现有正向资源选择 helper 的精确两 ID/fixture/host/源模块/12000 常量条件，复用已存在 full-compiler 的 8388607 槽、256MiB 初始池、1GiB 池上限以及 C34 一致内存运输；不增加宿主 RSS 硬上限，不全局提升档位。普通/未显式启用/原负向容量门槛保持。
- D：B/C 写齐后统一生成，执行既有资源整文件及原完整 tree-walk 实际输出；仅配置回归通过不能标原程序通过。

### C38 / P05、P07：原 WASM 五项首错归并与 direct protocol 私有 realm 桥

- [x] A：仅对原 566/570/573/576/578 的真实配置各作一次 Node24、stack80
  回放，原 binary、source、host、预算及 expected 不变，全部 guard clean。
  日志为 `eliscript-candidate38-{566,570,573,576,578}-original-diagnostic.log`。
  566 的业务停点为 interop-js-host:205 的 `from_js(source,{deep:true})`、
  callable code714、ELI1；不是已证 atom object-keys 同因，不据此猜 GC。
  570 zipper_report/code722、576 codec_report/code591 均 ELI3；573 在
  `__eliscript_project_step_28` 初始化 Box 时 ELI3。这三项与 C27 普通
  object 的 pop/push/slice 和 literal map 绑定修复存在实际调用路径重合，
  暂不为旧 C20 binary 再补重复实现，须用统一新产物保原 host 验证。
- [x] A：578 的 code17 为 define_protocol_from_definition，lastError11
  是原源 throw；host:59–62 传 JSON.parse(JSON.stringify(definition))。
  direct `stdlib/core/protocol-impl.mjs` 未触发 literal context，原 canonical
  `protocol-get-prototype=Object.getPrototypeOf` 结果为真实 host prototype，
  与 source Object.prototype 不等而按原规范抛 plain-object TypeError。
  最后 closed view 是原错误跨 close 后观察的次生现象，不使用 process
  lifetime 或公开反射归一化掩盖。
- [x] B：保原七项，原 private canonical 标记断言同时覆盖既有 registry
  helper 与新增私有 alias wrapper；追加 direct 完整 canonical IR 独立
  编译认证、同名/改写 IR 不授予能力、所有输入 IR 不变；真实 JS 先执行，
  同源 WASM/native 再执行 host JSON/null-prototype 定义 roundtrip、custom
  prototype 拒绝、公开 prototype 同 identity、Proxy 单次 prototype trap、
  false/undefined 原首错、GC 后重复及 live/frame0。实际 host module namespace
  按 descriptor 的真实 host IDs 显式提供，不用替身 protocol 算法。
- [x] C：仅 managed.eli 三段：共用 private declaration/program 标记；
  direct canonical ID 的完整 provided source IR 数据相等认证（Object.is
  保留 signed zero、data descriptor 逐字段、无 getter）；原 linker 在
  source-text 捕获前接认证，原 private dependency 路径复用同标记。
  `protocol-get-prototype` wrapper 在原模块初始化时捕获原 callable 一次，
  完整执行原 GetPrototypeOf 后才经过既有 value-protocol-exact-prototype；
  不改公共 Object/Reflect、原 source/golden、raw ABI 或 runtime memory。
- [ ] D：父统一生成并运行原 protocol 套件与原 578 完整 host。566 根因
  尚未证实，570/573/576 的 C27 覆盖仍待新产物原用例验证；不得将此 B
  或旧 binary 回放计作这五项已通过。本 overlay 未生成、未编译、未运行。

- C39 / P05：C20 JS原tools-artifact两条在原CLI诊断前落默认bootstrap-release
  ENOENT；standard-selected元数据路径不是正式stage3，即使只补manifest也会被公共
  CLI正确拒绝。83个完整选中声明与正式303声明并不等量，不能冒称完整固定点相同。
  私有Eli tools CLI运输从真实stage3 schedule/context接显式manifest，严格认证原
  bootstrap/fixedpoint；核选中sourceIdentity、session/javascript完整provenance、
  28模块/全部runtime/literal/package及已有map声明、每文件原bytes/SHA和productIdentity，
  只在完整选中可执行边界与指定stage3逐文件一致后，把原请求交公共release CLI。
  原host只运输唯一cliPath字串token，其余body/argv/golden/原异常字段不变；路径
  不同与原selectedProductIdentity均保存在真实projection收据，公共认证不变。
  改动：新compiler-corpus-tools-cli.eli及Node B；execution精确两ID私有prelaunch；
  corpus仅两ID绑定真实helper维护源/生成byte；stage3 schedule→cell显式传manifest。
  B覆盖真实session build标准产物、原syntax/stream/恢复的公共CLI请求、源/来源/
  module/文件/map/hash/配置与wrongpath拒绝、无关记录不运输。B/C完成后统一D待验。

### C42 / P05、P07：已物化普通 Object.prototype 的 map 绑定

- A：原全套旧 15 项真通过，新第 16 的完整 report 仍 ELI-RT0003。
  唯一授权同源分段观测 run f695e5f978554be8829a39b070cb29f3，19.434s、
  峰 5,410,996,224 B、exit1/cleanuptrue；旧 15 与 C41 第 17 均未运行。
  pure 的 WASM/native 原 report 均过，complete WASM 的 persistent pattern、
  queue、tagged、ordinary 四段均过，只有完整 namespace/raw report 报 code574、
  count0、argv kind7/length0/status3。日志及各段真实值保留在历史证据中。
- A：raw value-binding-lookup-exact 的 kind13 仅接受未物化 parent=3；
  普通对象在真实 realm Object.prototype 已发布后 parent>3，被误送到协议
  错误路径（constructor 观测又暴露 ELI3）。JS binding helper 明确接受
  Object.prototype/null，并对普通对象使用 tagged key 的 qualifiedName。
  C27 只覆盖真正 persistent brand，不覆盖该普通对象根因。
- [x] B：保第 16 的原完整 report 黄金及三原 fixture、纯图 imports=[] /完整
  async 唯一 source-operation、真实 JS/WASM/native、预算与清理。新增同源
  plain-binding-report，覆盖冷/已发布根、null parent、真实 own getter、
  undefined/null/false/default、string/symbol/keyword 及 alias、custom parent
  拒绝、getter throw false 首错和后续恢复；精确比独立 JS 全值。原 report
  保持首个必需调用。C41 第 17 保留；移除所有临时分段导出、JSONL/表观测。
- [x] C：仅 kind13 接受真实同 heap canonical Object.prototype 与原 lazy/null
  parent，普通对象 key 使用已规范的字符串 payload；custom parent 仍走原
  协议拒绝。foreign、persistent、arity/GC/ABI 不变；以当前 C35 memory 为底，
  不覆盖 C38/C41 managed 独立修改。正式源码不改，写 next-candidate42。
- [ ] D：父级统一生成/自举及受影响完整回归，未提前复测源码修复。

### C45 / A02–A04：合批修复后的真实四阶段自举

- [x] 隔离副本的 compiler/runtime/package 输入改为同字节的真实文件，保留 stage0 的 regular-file 来源认证；未放宽验证器。C44 非普通文件失败收据原样保留。
- [x] 新 C45 从 Emacs 重新生成 stage0，真实顺序生成 stage1/2/3；完整 303 个 stage2/stage3 产品字节相同，bootstrap accepted。run `afa7bade6a4640dbb327b2dc0e84e47d`，44.426 秒，峰值 3448242176 字节，exit0、cleanup complete；收据 `dist/bootstrap-candidate45/bootstrap.json`、`fixed-point.json`，日志 `eliscript-candidate45-bootstrap-chain.log`。
- [x] C43 资源回归修正新增测试中 JS 不具有 binary memory 声明的错误前提；WASM/native 同一 memory 严格比较保留。整文件 7/7，run `0d88fc35431844b0a038b8fa8853a42d`，2.367 秒，峰值 1336901632 字节，exit0、cleanup complete。配置回归不等于 12000 层原程序已通过。
- [ ] C45 对应的最终三输出、全量功能门禁与发布仍待闭合；不以固定点或资源测试代替 A05–A08。


C45 集中 C41/C42 D：当前维护源实际已含 17 项，C41 原 helper/case 完整，
无需恢复或再次插入；此前遗漏判断不成立。使用显式 ISO release-cli 和 C45
manifest 生成后只选两新增项，run `ce581695465e4ceaa98ebdf8cf9056d8`，
5.238 秒、峰值 602243072 字节、exit1/cleanup complete：0 pass、2 fail、
15 filtered。C41 新 imports 断言未考虑 Bun 实际返回的完整 function type
(i32,i32)->i32；C42 新独立 JS plain-binding-report 在 ILookup/get 对
object:anonymous 的既有拒绝前提失败。两项的 binary 正文尚未验收；不改
黄金、不计通过，待统一修复这两个新增 B 的错误前提及相应窄实现合同。
日志 `eliscript-candidate45-c41-c42-two-cases-explicit.log`。此前 bin 分派的
生成前置因 prepared-runtime identity 拒绝，run `b932ffa54360423eb7f04e78ab512545`，
0.95 秒、峰值 99549184 字节、exit1/cleanup complete，没有执行任何 case；
显式 ISO 入口生成成功，前置失败日志另行保留。


### C47 / P05、P07：C38 direct protocol 回归补齐真实 host 依赖

- [x] A：C45 新四阶段固定点已通过。统一 protocol9 + tools3 的 run
  `783305b2fca241b1b9bdc628bc9f36e3` 为 12 项 9P/3F，40.221 秒、
  peak1158103040 字节、exit1/cleanup complete；日志
  `eliscript-candidate45-protocol-tools-unified.log`。原 protocol7
  均通过，新增两项在 linker 先报 `missing managed project module:
  runtime/core/protocol-error.mjs`，尚未验证 C38 私有 prototype 桥；
  tools 的 prepare-release-package 前置失败由独立责任项处理。
- [x] A：真实 `stdlib/core/protocol.eli:2` 导入
  `../../runtime/core/protocol-error.mjs`。原 578 request 只含 canonical
  protocol-impl 源，`resolveImports:true` 与完整 hostSources 由原
  `session-project-host-modules` 生成该依赖的真实外部声明。原产物
  descriptor 的唯一 host 为 id=`runtime/core/protocol-error.mjs`、
  referrer=`stdlib/core/protocol-impl.mjs`、原相对 specifier、
  allowedExports=`[ProtocolDispatchError]`、namespace=false，且保原 edge。
  直接 link/lower API 没有源码 resolver，必须由调用者显式提供该边；
  C38 B 只给运行时实际 namespace，遗漏了编译期 hostModules 声明。
- [x] B：两条新增原 B 保全部 source、golden、原型 identity、custom 拒绝、
  首错、GC 和清理断言；追加 canonical 原 import 严格断言，缺声明仍按
  原 ELI-B0001/managed-link/完整 missing 文本拒绝。正向 link/lower 显式
  提供原唯一 host edge；rename 阴性用同深度用户 module ID 并匹配真实
  referrer，保证检验认证拒绝而不是缺依赖。真实执行严格比较 descriptor
  完整 host/edge，factory 提供原实际 ESM namespace，独立 JS 保同一真实
  runtime 文件。既有九项不删除、不降低 expected。
- [x] C：仅 `tests/eliscript/managed-protocol-dispatch.eli` 的
  `direct-protocol-host-declarations`、两个 C38 B 调用点及 descriptor
  断言；写入 next-candidate47。生产 managed.eli 的现有外部声明解析合同
  正确，无需修改，不覆盖 C38/C41/C42 或任何 ISO 当前生产/生成物。
- [ ] D：父统一生成及原完整 protocol9 验收，原 578 完整 corpus 仍须
  使用统一新产物实际执行；本 overlay 未编译、未测试、未诊断，不将
  修齐依赖声明冒充 prototype 桥或原完整 578 已通过。

C45 工具验收的前置与结果：实际 prepare-release-package run `7b073f02e07d49ac93c88a4a56559541` 成功，0.933 秒、peak97648640 字节、exit0/cleanup complete；随后仅复验原失败的 CLI argv/结构化诊断/流式恢复项，run `2ce1d9785ced452d85e1f95ee50a8ce8`，1/1 通过，5.805 秒、peak917667840 字节、exit0/cleanup complete。其余两项已有 C45 同源通过证据，未重复执行。此为工具原断言通过，不等于原 corpus 两条或 A05 全部通过。


### C48 / P05、A05、A06：C41/C42 新 B 的实际引擎与协议合同

- A：C45 只选两新增项的实际 D 为 0/2（旧 15 filtered），并非两个生产
  修复已通过。C41 的严格 imports 比较遗漏 Bun 暴露的真实 function type；
  C42 新 null-prototype row 在独立 JS 中尚无 ILookup/get 实现，不能期待
  属性读取成功。保留原 run `ce581695465e4ceaa98ebdf8cf9056d8` / 首错。
- A：逐函数核 next27 和 next35：旧 value-binding-lookup-exact kind13 使用
  parent!=3 的协议拒绝，null parent0 原先并未准入。C42 接真实 canonical
  root 时另加 parent0，确是本次错误放行；恢复这条原拒绝。JS emitter 的
  key normalization 接受 null parent，不等于后续 ILookup 类型注册支持它；
  collection 只注册 Object.prototype 的 exact type，null/custom 未注册。
- [x] B：C41/C42 共用原实际 WASM 字节 parser 精确验证 import type index
  (i32,i32)->i32；反射的 module/name/kind 精确不变，有 own type 时完整精确
  比 parameters/results，无 type 时仍校验实际字节。原 descriptor ABI 仍
  独立核对。C42 null/custom 改为真实独立 JS 的完整协议错误观测（name/
  code/protocol/operation/observedType/reason/message），null row 的 own getter
  不执行；getter throw false、后续恢复、普通 canonical/lazy、alias/default
  与原全部 report 黄金/三 fixture/资源/清理仍保留。17 项完整未缩减。
- [x] C：仅 owned kind13 私有 binding 入口准入 lazy3 或真实同 heap canonical
  root>3；null/custom 保原拒绝，不改通用 Object/反射/foreign 协议。以 ISO
  C45 memory 含 C35/C42 为底叠此单 hunk；正式 ISO 不改，写 overlay48。
- [ ] D：所有本批新生产齐后由父级统一生成和受影响集中验收；不提前运行。

### C49 接线补充 / P05、P07：私有宿主对象桥的真实资产

- A：在 `tools/backends/bootstrap.el` 的 managed-host 工具映射前增加维护中的 `managed-host-object-provider.eli` 与 `managed-host-object-realm.eli` 两条生成映射；生成 MJS/maps 忽略。两个既有 corpus host-bridge/source-assets 列表（managed-fixtures 的 `host-bridge-files` 与 managed-adapters 的 sequence `files`）各绑定两份维护源与两份真实生成文件，沿既有 reader 计算实际 SHA，不手写摘要、不重写原 host/算法/黄金。包和 Pages 运输由 C46 同批接线。
- B：既有完整 sequence 资产测试要求新增四个真实文件每个恰一条且 SHA 等于实际文件；新增各文件缺失时保留原失败且不得添加记录的阴性用例。测试只编写，不运行。
- C：补映射、忽略规则及两个列表；不扩展宿主能力，不使用来源证明代替生产语义。
- D：等待 C46/C49/C50 全部源码写齐后统一生成与验收；本接线不单独启动验证。


### C50 / R13、A04、A08：可独立执行的只读自举固定点复核

- A：现 compareJsFixedPoint 已认证完整产品清单、源码/IR/地图/声明资产并逐
  文件逐字节比较；authenticateStage3Targets 已重读真实 stage2/stage3 和
  receipt。复用这条能力，不能把 accepted/status/摘要或整个 stage 目录
  diff 当证明。公开 CLI 缺独立只读入口，本批补齐而不运行编译器。
- [x] B：复用现真实固定点小协议 fixture；验证产品带顶层 throw 仍可复核
  （不得加载/执行产品），报告精确字段/身份/fileCount，完整文件 bytes /
  mtime 不变。真实子 CLI 成功0、拒绝1/结构错误stderr、不得输出假成功。
  覆盖缺失清单/产品文件、恰改一byte、额外文件、篡改 receipt、源码身份、
  原 JS/map/IR 文件；写入参数拒绝。Make target 无构建/准备依赖及两步
  文档命令均有永久 Eli B；未运行。
- [x] C：authenticate 既有成功返回只增加 stage2MetadataPath、完整
  stage2ProductIdentity、实际比较 fixedPointFileCount，不改认证/比较算法。
  release CLI 新 verify-bootstrap 仅认证并输出精简 JSON；拒绝写入/编译
  参数。Make verify-bootstrap 无 prerequisite，仅运行既有认证工具。
  compiler-release-ci 保留 bootstrap-release 前置，并以 verify-bootstrap
  为首条后续 recipe；独立复核 target 不反向触发重建。
  README 给出首次构建和独立复核、其他输出目录、拒绝判据及证明边界。
- [ ] D：统一生成和完整受影响 B；实际正式候选再运行 make verify-bootstrap
  保存 JSON/退出码。源写齐不冒称通过或最终三输出验收完成。

人工独立复核（完整构建只做第一步，第二步不重建任何产物）：

```sh
make bootstrap-release
make verify-bootstrap
```

自定义布局两步均传同一变量：

```sh
make bootstrap-release BOOTSTRAP_RELEASE_OUT=dist/bootstrap-local
make verify-bootstrap BOOTSTRAP_RELEASE_OUT=dist/bootstrap-local
```

也可直接执行 `node tools/backends/dist/release-cli.mjs verify-bootstrap
--bootstrap-manifest dist/bootstrap-local/bootstrap.json`。成功只有一个 JSON，
scope=stage2-stage3-complete-products、verification=identical、fileCount 为该
真实完整产品清单数量，stage2/3 产品摘要相同并有源码身份摘要，退出0。
文件缺失、改一byte、额外产品文件或 receipt 被改均非0，不更写收据。
这项证据只证明同源固定点，不代替 stage3 用户程序三输出功能验收；不建议
`diff -r stage2 stage3`，因为控制元数据的路径和 producer 原本不同。


### C46 / P05、A05、A06：默认 JS Unicode 17 统一运行时

- A 真实快照：`runtime/unicode-case.eli:4,70` 只有显式 profile installer；普通发射物没有 casing 前置依赖。`memory.eli:16` 的独立默认是 Unicode 17，故普通 Node/Bun JS 字符串仍可能随宿主 Unicode 版本漂移。C45 固定点只是本批前基线，不是此缺口已过证据。额外确认 host adapter 原缺省为 host（按当前方法探测后缓存，非直接读取 process 版本），故维护 managed-host.eli 最外创建入口复制 options 后仅省略/undefined 补17，显式 host/15.1/16/17 和非法值沿原校验；不改 caller。
- 当前树/流程：`compiler/{eliscript-emitter,eliscript-ir-emitter}.el`、`bootstrap/compiler/emitter.eli` → 普通 JS → 宿主 String；显式 profile → `unicode-case.eli` → 唯一 memory 区生成的 24 表函数。正式 sources 目前只额外归档 Math。
- 目标树/流程：三发射入口统一 side-effect import `eliscript/runtime/unicode-case.mjs` → 模块首次安装 17 → 原 String.prototype 方法；动态 key/Get/Reflect 调用同样覆盖。显式 15.1/16/17 继续沿原 installer 选择；ESM 已初始化后的 override/delete 不被后续程序 import 重装。两维护胶囊只在 filename 完整 `runtime/unicode-case[-data].eli` 路径与 exact module-declaration 同时匹配时免除前置 import，不按 basename 或 casing 方法名猜测。
- 精确 C：`unicode-case.eli` 保算法/24 表/ToString/首错，末尾首次调用既有 installer(17)；三 emitter 增统一 import，IR 与 AST 共同使用精确胶囊身份谓词。`bootstrap.el` 提前先生成 data/helper，再生成其他运行时；stage0 sources 与 `compiler-build.loadCompilerSources` 同序新增 helper/data 两条正式记录，保原 53 literal 闭包。private compiler scope、release prepare/ready、独立包与 Pages 显式运输这两个真实产物和 maps；完整 source/product/fixed-point 与派生 bundle provenance 由既有归档真实重算，不手改 hash/认证字节。
- B：现 Unicode 四组显式用例保留，补普通生成 JS 默认 17 的 Node/Bun 同源运行、动态 key/Reflect、UTF16/上下文 sigma、ToString/false/undefined 首错、callee-before-args、override/delete/cache、不误豁免 basename/spoof module；完整 compiler B 精确保 30 模块 ID、53 literals 和三 support exports/实字节；真实 WASM/native 原共享 fixture 增默认/undefined及全部显式版本、非法值、原 caller descriptor/清理回归，预算不变；复制 descriptor 的延迟 options 视图保读取次序/接收者/false 首错与冻结 undefined，不读取无关 getter。旧 ABI 无 case selector 已固定17，保原路径。胶囊自己没有前置自导入。原 script-only test 的事实变动留集中 D 收集，不提前改未受影响外语用例。
- [x] A：方案与逐文件接线已明确；只在 next-candidate46 写入，不污染冻结 C45/ISO。
- [x] B：以上全部 Eli/El 测试源码已写齐，未运行。新增 unicode-default 三例保持原显式 profile 四例；原完整 compiler 测试精确更新 30 ID/53 literal 和三个支持 exports；ERT 同时覆盖两维护发射入口和精确胶囊拒绝。
- [x] C：默认初始化、三发射器精确胶囊免导入、stage0/formal30模块、private scope、prepare/ready、package/Pages/helper数据与maps运输已写齐；C49两真实bridge依赖一并保运输闭包。未生成或验证。浏览器原22有效用例的既有 Bun.build 增精确Unicode模块URL resolver；每份上传原JS落盘/原SHA独立保留，derived transport另SHA，runner共享同一已认证包helper/data URL，避免重复安装或裸specifier；原golden与原产物/map证明不改。公开 Emacs seed 的 `tools/bootstrap-runtime.el` 同样从真实源生成 data/helper/Math 三支持模块与maps/private scope；clean checkout 缺 derived Eli 才调用唯一维护生成器，发布源可携已生成的真实 data Eli。package.files 显式运输三个公开 bootstrap El 与数据生成器；Reflection接原两公开seed用例纯Eli迁移，保无旧dist/无其余开发tools、真实file ESM执行。源映射原第一用户segment因唯一前置import由generated line3精确更新4，source/column断言不变。formal stage0 实际 load 的 Unicode El 生成器加入 seedSourceIdentity 与 verify-seed 相同确定清单（compiler/*.el + tools/backends/bootstrap.el + tools/runtime/unicode-case-runtime.el），B 精确 inventory/缺失/改SHA 拒绝；公开 seed 专用 bootstrap-runtime/seed El 不在 formal stage0 启动链，故不虚加清单。
- D 首轮真实失败：合入 C46–C51 后完整工具生成在 `tools/backends/bootstrap.el:224:47` Reader 多余闭括号停止（run `00cbfb4fd3534f1f874d4b75577c1672`，0.693s、57MB、exit2、cleanup true）。父级随后统一读取 40 份 El/Eli，仅此文件与独立负责的 `bootstrap-compiler.eli` 两份语法失败（run `a7d65ebd8faa45c1a4db242d74be6337`，0.695s、70MB、cleanup true）。本文件根因是第149行 runtime 支持记录的 `mapcar` 尾部多一个闭括号，提前结束 `setq`；本次只移除该闭括号，使后续 `literals`、`runtime` 仍在原赋值作用域。保留合入的全部映射、formal seed inventory 和校验，未执行局部 read/check、生成或测试；待父级完整统一复验。
- [ ] D：父级统一生成、四阶段固定点、原所有受影响门禁与同源三输出；未通过前不勾 A05/A06。



### C49 / P05、A05、A06：能力图 canonical Object 的真实双向宿主身份

- [x] A：原 literal host.object 必须为 true，源/黄金不改。旧 codec 对
  source Object.prototype 创建另一 Proxy，只有反射别名不能保持后续
  Get/Set/descriptor/ownkeys/define/delete/prototype/integrity。限定真实
  source-operation 图，使用既有 kind35/foreign token codec 的完整同 owner
  身份映射，使 canonical Object.prototype 和 Object 构造器本身成为真实
  宿主能力；其余 prototype、任意 foreign、自定义对象不归一。
- [x] A：新增两个 Eli 模块：managed-host-object-provider 导出真实捕获的
  ObjectConstructor/ObjectPrototype 和两个零参数 selector；
  managed-host-object-realm 在私有 factory exports/options/lifecycle 描述符
  副本中严格同 heap 解码 opcode35，0/1仅选原型/构造器，再翻为既有
  opcode8 Call。selector 由真实 runtime.fromHostValue 装箱，原 hostModules、
  imports、descriptor/project 对象和原 Get 顺序不增加私有 namespace。
  旧 managed-host-legacy 字节保持，完整已有 foreign codec/first-error/roots
  复用，不迁移无关 API。默认参数和 creator 三 required + rest 保持。
  原 initializeModule 的 undefined/boolean 在 legacy 原读取处暂不初始化；
  非法值仍交原 validator，所有原 lifecycle/foreign/sourceDecode 已建立后、
  public factory 返回前完成同一原 initializer；显式 false 保持延迟。
- [x] A：memory 的 host-object-identity-enabled 原 stub 为0；managed 仅在
  原 source-operation capability 确实开启时替换为1。Object root仍存原
  control20、构造器仍存原 native table28，原 GC/close清理位置不变。
  builtin Object=76 在能力开启时取真实 foreign constructor，跳过 source
  kind18 publication；pure分支保原所有描述/初始化与零 import。
  value-standard-prototype(0)返回真实 foreign root；Array默认边/继承 Get、
  原 binding plain-object判断、native prototype reader仅补该真实边，不
  把 kind35 送进原 kind13-only ABI。显式 null/custom、Array原型不改。
- [x] B：原 managed-host 全部回归保持；同源独立 JS 与实际 WASM/native
  校验 raw↔actual identity、constructor、普通对象继承、双向数据/accessor/
  descriptor/Symbol/ownkeys/delete、严格首错和 getter 次数、GC/两个 owner/
  close隔离；pure图独立 imports=[] 与自有原型不变。不可逆 integrity 在
  同一实际测试入口的隔离 child 执行，原 assert/输入不替代，非模板代码。
  新增默认/显式延迟初始化、真实 raw ObjectSet 普通 owned receiver、
  raw ObjectGet(foreign)原拒绝；constructor 同样覆盖 Symbol/descriptor/
  keys/define/delete/Set。不可逆 Object/prototype prevent/freeze 在 WASM、
  native 各自独立真实 Node child 中验证，不污染父宿主。
- [x] C：按上述原符号族和新桥接实现，完整依赖运输由 C46 同步接入；
  memory基线含 C48，managed含 C38/C41，仅独立hunks合并，不覆盖同批修复。
  memory 基线 SHA `19e86447c4656c317260be4dc3fc698e6494ab6516f4cdbb531a919002271b39`；
  managed 基线 SHA `1ebf7efea10fa2d399ef9db95dbb7c758867d59c3b57ecfef491ee11759a62c8`。
  新增 provider/realm 两个 Eli→同名 tools/backends/*.mjs 运输资产与维护源
  必须完整 sourceAssets 绑定；C46 已接包与 Pages 真实生成资产，父统一登记。
  managed-host 仅新增 import、最内 creator 委托和 completion 队列；
  C46 最外层 unicodeVersion 私有 Get/default17 hunk 独立合入，不覆盖。
- [ ] D：父统一生成、四阶段与原 literal 完整 host/新增全套真实目标验收。
  A/B/C期间禁止编译、测试、探针和静态检查；本项未通过前保持 OPEN。


### C51 / P06、P07 / A06、A07：原 JS 自举门禁承载迁移

- A：原 `tests/bootstrap-compiler.test.mjs` 单项完整 653 行门禁在生命周期
  观察用 data:URL 加载真实生成模块；`bootstrap-seed-batch.test.mjs` 五项
  完整门禁在 packaged probe 使用内嵌 JS eval/dataURL。显式 runtime import
  需要真实 ESM package 位置，dataURL 不提供该位置。测试中的 proxy 也不
  应继续维护 JS 模板。两文件均为有效 JS/Seed 行为，无取消 compiler
  WASM/native host 专属项；本次取消数 0。原时限、完整输入、byte/map
  精确比较、失败恢复、宏 origins 与原独立 Seed 保持。
- 原树：两份手写 `.test.mjs` → dataURL/JS proxy/eval → 临时13模块；
  小 published tree 缺真实 public bootstrap 依赖和 runtime 源。
- 目标树：两份 `tests/eliscript/bootstrap-{compiler,seed-batch}.eli`
  → 原 canonical generated `.test.mjs`；旧源原字节保留为
  `tests/bootstrap-{compiler,seed-batch}-test-legacy.mjs`。两个小 Eli helper
  `bootstrap-seed-proxy.eli` / `bootstrap-published-probe.eli` 分别维护
  EMACS spawn 计数/失败和实际 packaged compiler 用户程序运行，不内嵌 JS。
- [x] B：原 1+5 tests 全迁移，所有 parseArguments、三代13模块/26文件、
  宏生命周期与全部失败诊断、全 libraryCases 字符串、portable pruning/
  imports/map/public Node/Bun/automatic-bootstrap 比较均保留。batch 的13次
  独立 per-file Seed 对照、两种批调用各单 Emacs、strict bytecompile、
  malformed 无副作用、两种 stale-failure 拒绝均保留。新增必需 runtime
  输出严格六文件+package.exports 认证，批次间逐 bytes 比较；不是用删除
  metadata 或放宽 compiler 文件集合迁就新依赖。未运行。
- [x] C：file ESM 原生成 bytes 写临时文件，同树 node_modules/eliscript
  指向真实 runtime package，再加载真实 namespace；不改算法/输出。
  published 用例只复制 bin（解引用公开 launcher）、compiler 源、原13
  bootstrap/compiler 源、两个公开 bootstrap .el 依赖、三个 runtime Eli
  源；不含 backend/dev tools 或旧 dist。从源码真 bootstrap、再用该
  compiler 编译维护 Eli probe，实际 square(7)==49。公开启动器的真实
  runtime 生成/发布依赖由 C46 同批实现；malformed 在任何输出前拒绝。
- [x] 接线：`tools/backends/bootstrap.el` include-tests 表新增两 test + 两
  helper 映射；`.gitignore` 仅四生成路径及 maps。Make 原98/284两个入口
  不变，仍原 Bun file-workers 执行，不新增另一份测试清单。根整合时仅
  摘本批映射/ignore/文档 hunk，不覆盖并行 C46/C49。
- D 统一生成第二轮真实失败：`bootstrap-published-probe.eli:13:3` 的顶层 `await` 被编译器拒绝（run `d729dd944f3c4af08740a43b7c0805c0`，13.161s、203440128B、exit2、cleanup true；日志 `eliscript-candidate52-unified-generation2.log`）。本批将原参数解析、真实 compiler 加载、square 源编译、写文件与 `square(7)==49` 原断言按原顺序置入合法 `defasync main`，末尾真实 Promise catch 报原错误并设非零退出；没有 JS 实现、未执行局部 reader/编译/测试。
- [ ] D：全部源齐后统一生成，原两个完整文件集中运行；尚未声称通过。

```mermaid
flowchart LR
  E[真实 Emacs per-file / batch] --> S[13 compiler modules + maps]
  R[维护 runtime Eli 源] --> P[真实 package runtime + self-reference]
  S --> G[JS generations 1/2/3 exact bytes]
  P --> G
  G --> L[真实 file ESM lifecycle + diagnostic / macro / CLI]
  E --> Q[独立 published source-only public bootstrap]
  Q --> U[该 compiler 编译 Eli probe 并运行用户程序]
```

C51 同根 corpus 来源闭合（仍 P06/P07、A06/A07）：

- A：原 CLI legacy adapter 对 canonical bootstrap-compiler suite 按唯一 JS
  边界构建历史 recipe；canonical 迁生成后不可再把其新 bytes 当旧断言。
  该 generations recipe 在 stage3 scope 已精确移交 make 最终 JS 门禁，
  保全部原 record/coverage/13 modules 身份，不复活旧 selected-target
  compiler successor 执行。源归档与真实当前门禁必须双重绑定。
- [x] B：CLI corpus 维护 Eli suite 新增原完整 generation recipe 对真实
  archive baseline 的全记录比较（仅列明新 provenance 字段）、完整三源
  SHA/byte/物理路径、唯一原 case 30000ms/region、原 expected/setup/body/
  coverage/ID/13modules 原样；缺失、错 SHA、错 physical label、缺 locator
  保失败且零发布。原 shell stdout 和 source negative 两项不变，未运行。
- [x] C：compiler-corpus-cli-adapters.eli 仅在 legacy 真正读取该逻辑 suite
  后懒认证三个真实源：byte-preserving archive、维护 Eli、当前 generated。
  原 source-reader 分别读取真实路径，按 text SHA + UTF8 byte count + file
  label 严格核对；给历史运输的是 archive 原文及其真实 identity。source
  assets 记录三者真实 SHA；original.assertionSource / cases / regions 都
  显式指 archive 实际坐标；maintainedGate 绑定 Eli 与当前 generated SHA
  以及 make test 门禁。logical suite/fixture/host、legacy host transport、
  原 independent Seed oracle/source/input/golden 不改，不伪装 canonical
  仍有旧断言 bytes。无新映射/Make 改动，使用既有 adapter/test 生成入口。
- [ ] D：与全部 C46/C49/C50/C51 完整源统一生成、集中验收；不可把源码
  写齐当实际 full corpus 或 make test 通过。

### C52 / A04、A06：最新统一生成与严格字节编译

- 原统一生成 run `d729dd944f3c4af08740a43b7c0805c0`，13.161s、峰值
  203440128 bytes、exit2、cleanup complete；完整收集两处编译阻断：
  realm 的 `true` 改为本语言 `t`，published probe 改合法 `defasync main`
  并保留原 square(7)==49 与真实文件加载。未改预期结果或测试时限。
- 原严格字节编译 run `a5c68395674643d1a3154512aece96b6`，exit1、
  cleanup complete；唯一失败是 emitter 文档字符串超过80列，已缩短该
  文档字符串，无行为变更。五个新增 Elisp 工具严格字节编译 run
  `b10555e4cb34429f88228445e2d3225e` 全通过（exit0、cleanup complete）。
- 最新统一生成正在集中复验；最新固定点、独立只读复核、完整三输出和
  最终全量门禁仍未验收，不以此前303文件固定点代替最新源码证据。
- 最新工具生成 run `2d02fc007ec640bcbb8bda419209055e` exit0；最新四阶段
  run `172a9919796542dbbe702b17e7f88829`，47.31s、峰值3586949120 bytes，
  exit0、cleanup complete。`dist/bootstrap-candidate52/bootstrap.json` 真实
  accepted，完整 stage2/stage3 **313文件逐字节相同**。
- 独立 `make verify-bootstrap BOOTSTRAP_RELEASE_OUT=dist/bootstrap-candidate52`
  run `89bb8c518bfc4867bcf152dc61da85fb`，exit0、cleanup complete，scope
  `stage2-stage3-complete-products`、verification `identical`、fileCount313；
  两代完整产品SHA相同 `22afcd4a112001278450ef7e579adafefd34aff48d05f982008a1ec833e73b03`。
- C50对应两文件集中25项：23通过、2失败，run
  `a5fb77161ba24444afe1f06894fe37a7`，exit1、cleanup complete。stage3
  认证/只读重算/篡改拒绝及共同源三目标fixture通过；未据此声称完整语料通过。
  两失败分别为ISO bin目录alias选择上层源码、B正则误把verify-bootstrap
  后缀当真实bootstrap命令。已物化本候选bin并保留仓库原相对链接；B改用
  独立命令token边界，保留全部禁止重建项和原bin断言，待下一批统一复验。
- 原严格字节编译完整组修复后一次通过：run
  `3a5df8b1d78e4b9da456f0fee91dcf62`，1.610s、峰值127696896 bytes，
  exit0、cleanup complete；原EXIT trap已回收所有本次ISO .elc。
- C50 integration受影响完整文件一次复验9/9通过、零跳过：run
  `f93a5ad4783647dc95a468c63bb826b6`，0.701s、峰值126877696 bytes、exit0、
  cleanup complete。未重跑未变已通过的stage3-targets认证文件。结合本轮
  原16项认证/只读防篡改通过，C50的25项均有本轮实际通过证据。
- C46/C47 Unicode/protocol与C49/C48 managed-host/zero-imports完整组正在
  独立受控并行验收；不据开始运行提前勾选A05/A06或完整三输出通过。
- C52 protocol D 真实收集：`eliscript-candidate52-unicode-protocol.log`
  中原 protocol 七项通过，新增两项分别在 linker 前报
  `ELI-I0001: IR program has unknown or missing fields`，以及 runtime loader
  报 `mixed project requires deployed ESM facades and projectModuleBaseURL`。
  这不是已有私有 prototype 桥语义已通过的证据。
- [x] C52 protocol A：`bootstrap/compiler/ir.eli` 的 program schema 只允许
  `body/filename`；新 B 加 `source` 字段使 changed 阴性先被 schema 拒绝，
  并未检验 canonical 完整树认证。roundtrip 的真实 descriptor.project
  要求实际部署 facade、独立 moduleGraph 和 base URL，原 B 只传 namespace。
  所指定 `managed-host-protocol-dispatch.eli` 路径实际不存在；现有 linker、
  graph 与 factory 合同正确，本批无生产代码变更。
- [x] C52 protocol B/C：仅修九项原套件的这两处接线。changed 阴性在原树
  `protocol-definition-version` 的现有 literal 将1改2，严格确认唯一修改和
  program 字段集合不变；rename、原树不变、两处私有标记等原断言保持。
  roundtrip 为 WASM/native 分别创建真实 graph、写实际 facade、将原
  protocol-error 外部边链接到 canonical 实文件并核 realpath；initfalse
  后按真实 URL load、显式 auto1，再运行全部原深值/七字段/原型、false/
  undefined 首错与 GC 断言。原 small 预算、独立 JS golden 不变，新增
  graph 与原 runtime 均逐项回收，清理不覆盖原首错。未执行 reader、
  编译、测试、探针或独立审核。
- [ ] C52 protocol D：待父级统一生成及完整九项复验，未将源码接线完成
  记作实际通过或完整三输出验收。
- C52 corpus provenance D：两原文件完整26项为24通过/2失败/零跳过，run
  `70e52cef27424342ab42e395c67ec79f`，Node24.21.0、3.929s、峰值545570816B、
  exit1、cleanup complete；日志 `eliscript-candidate52-corpus-provenance.log`。
  C51归档三源认证及sequence实际provider资产证明通过；两个真实Node
  生命周期用例均在临时原模块加载默认Unicode运行时前因缺少Eliscript
  package报ERR_MODULE_NOT_FOUND，尚未到原beforeExit/fire-and-forget断言。
- [x] C52 lifecycle B/C：仅在原临时fixture部署中为两用例挂载真实root的
  `node_modules/eliscript`；创建时只允许EEXIST走已有路径，随后严格比较
  链接与真实root的realpath。原同步/异步Eli输入、模块图、Node预加载、
  beforeExit、退出码、时限与全部golden不改；无空package、无删除默认
  Unicode依赖、无生产launcher或legacy/generated JS变更。未局部生成、
  reader、测试或审核；本次仅修维护Eli fixture。
- [ ] C52 lifecycle D：父级统一生成后复验原完整文件，未将部署修正当作
  生命周期行为已经通过，也未声称最新两bootstrap suite源码已验收。

### C53 / P05、A05、A06：C46 Unicode 新回归的真实调用与错误运输

- [x] A：C52 Unicode/protocol 集中 run
  `630ffe63fdd14c20b37e7b30e4d22632`，16项12P/4F，33.017s、峰值
  1751351296 bytes、exit1、cleanup complete。Unicode case 原4项全过；
  default 的 Node/Bun 两项都在生成 `first.mjs` 的实际
  `value.toLowerCase()` 失败：新B把没有该方法的普通对象当成 String
  方法接收者。语言 Method Call 必须保真实动态 Get，不能替它隐式转换。
  同一 selected 程序已有 `reflect(value,key)`，真实执行
  `Reflect.apply(String.prototype[key],value,[])`；通用接收者断言应沿此
  既有入口，保原对象、ToPrimitive(string)、原黄金和 false/undefined 首错。
- [x] A：managed-host 新 Unicode 三项失败已完整收集于
  `eliscript-candidate52-managed-host.log`。两 invalid-profile 误把稳定
  `ELI-RT0003` 当作 message 子串；原 API 明确用完整六字段
  `eliscriptDiagnostic` 运输 code，message 为 `managed argument or bounds error`。
  Get-order 新B的 fake selector 缺原 raw call 必需 `last-error`，因此在
  selector 返回后抛宿主 TypeError，尚未触发它声称观察的 runtime error。
- [x] B/C：仅维护 `tests/eliscript/unicode-default.eli` 与
  `tests/eliscript/managed-host.eli` 的对应 Unicode hunks。普通对象的
  direct Method Call 仍严格 TypeError且不转换；同原对象的 generic
  Reflect.apply 保原 aς、hint、抛值。invalid-profile 全部原输入不变，
  严格比较真实 Error 原型/name/message 与 diagnostic 全字段。
  最小 fake raw selector 记录实际170并置code3，补只读 last-error，
  从原 raw call 产生真实 runtime error；原 Get 顺序、caller 全描述符、
  冻结 undefined 和 unrelated getter 不读的断言全部保留。
  原 unicode-case4、default3、managed-host 全部用例不删、不跳过；无需
  改已通过独立逐scalar/sigma黄金的 `runtime/unicode-case.eli`。
- [ ] D：父统一生成后完整复验受影响文件。本批未执行编译、测试、
  reader、静态检查或探针；原 C52 失败日志保持，不把B接线修正计为通过。

### C54 / P05、P07、A06：原完整 package/build 的默认运行时部署闭包

- [x] A：C52 Node package 完整5项为1P/4F，run
  `147bfb9d43844ff3b4be4adc85ca64be`，0.476s、峰值49856512 bytes、exit1、
  cleanup complete。4项同在 `protocol-artifact` 首次真实加载临时
  `input/driver.mjs` 时报 `ERR_MODULE_NOT_FOUND: eliscript`，未进入原
  package/Worker/browser正文：普通 fixture 生成物现在真实依赖默认
  `eliscript/runtime/unicode-case.mjs`，临时输入却缺真实包解析基准。
- [x] A：随后 Bun compiler-build 完整17项为16P/1F，run
  `98f74a80a77549ba8ce2b30b0510f38c`，8.425s、峰值1592426496 bytes、exit1、
  cleanup complete。完整30module/53literal真实build已完成，唯一失败在
  后续原 private response-segments 完整源码 fixture 新写文件的动态
  createRequire边界：`Cannot find module .../response-segments.mjs from ''`。
  原完整产品已具有真实 Math/Unicode package scope，不改产品source或
  生成物；该新文件沿既有 realpath+createRequire namespace 边界加载。
- [x] B/C：仅 `tests/eliscript/compiler-package.eli` 与
  `tests/eliscript/compiler-build.eli`；生产 builder/loader/legacy 不变。
  package 临时input用已有 `node_modules/eliscript` 实际目录链接绑定真实
  root，并严格 realpath 对照；原driver字节及fixture sourceIdentity、
  artifactIdentity不变，明确保其默认runtime import，不伪装bootstrap capsule。
  原5项和包内完整copy/hash/缺依赖拒绝/worker/browser/CLI断言全保。
- [x] B/C：原浏览器私有probe正文、HTML、请求期望及原黄金完全不变。
  该普通Eli生成probe同样真实依赖Unicode，使用现有Bun browser build
  把实际package artifact内的默认runtime闭包打入probe；仅原部署好的
  `./browser/compiler-browser.mjs` 外部模块边界保留，防止改变其
  import.meta位置、Worker实现与HTTP请求。实际bundle退出/信号严格
  验证，不写JS模板、不改生成文本、不新增import map。
- [x] B/C：response-segments保原真实函数form/span提取、全部graph事件/
  身份/分段/循环拒绝/首错/清理断言；新写文件canonical真实路径加载，
  独立对照磁盘完整字节等于本次selected compiler输出。不改原17项、
  30module/53literal完整输入、所有资源/180s时限或产品身份。
- [ ] D：父统一生成后完整复验5+17项。失败日志
  `eliscript-candidate52-compiler-package.log` 与
  `eliscript-candidate52-compiler-build.log` 保留；本批无编译、reader、测试、
  静态检查或探针，不把部署接线写齐当作worker/browser或完整build通过。

C52/C53 同批原自举测试入口修正（C51，A06）：

- 两份原自举文件首次实际加载失败（0 case执行），run
  `7bcb54def93647a0ab05c60eb441d82a`，exit1、cleanup complete；生成结果把
  不属于本语言保留表单的 `import.meta.dir` 编译成普通 `import$.meta.dir`。
- 维护 Eli 改为导入既有真实 `tools/backends/build.mjs` 的 `root` 常量。
  该常量按实际模块URL计算仓库根，不依赖调用者cwd，不内嵌JS或新模板。
  bootstrap-compiler的project-directory保持相同真实目录；batch复用同一
  root导入，不另声明错误符号。原1+5测试、输入、预算和断言原样保留。
- D：全部同批源冻结后统一生成，重新运行原两个完整文件，保留首次失败。

### C53 / P05、A05、A06：内部 literal brand 探测与实际能力图原型

- D 原证据：C52 managed-host 15项=11pass/3fail/1skip，run
  73d5ff7b31564258a1a22ccd2759f25b，14.728s/1905000448B/exit1/clean；
  Unicode三项另由其owner处理。zero-imports 完整17项=15pass/2fail，run
  c99a90bb0a924abfbd4e2f0953411376，237.109s/6620725248B/exit1/clean；
  原sorted完整205184ms已通过，无超时/预算修改。原日志均保留。
- A：完整 local-recursive fixture 真实 await source call 会声明唯一
  source-operation；其Object根按C49合同必须是actual host intrinsic，
  旧无条件notStrictEqual前提错误。真正imports[]图仍拥有自己实际根。
  第二失败为legacy自动decode/type13或18提前调用literal-kind；该原函数
  先读取literal-records，普通值还读literal-protocol-runtime与
  literal-transports，真实registry cell未初始化时会产生ELI-RT0008。
  不改变公开Get/TDZ，不catch并吞8，不删除literalRuntime descriptor。
- [x] B：原完整17用例与所有原报告黄金保留；完整recursive严格验证唯一
  source-operation真实WASM type/descriptor并核host根，原10000/10001和
  async12双目标不变。原真实零imports图补actual普通对象ownroot与同owner
  callable prototype严格身份，不把能力图冒充pure。原owned三fixture
  增同bytes新rawinstance：registry declared前/declared未init自动probe无
  brand且last-error0，原helper/公开Get仍真实8，恢复后probe仍0，根/帧清零。
  ready后的真实PersistentQueue原型/三值及ordinary对象根逐目标严格验。
- [x] C：仅内部heap-module-binding-initialized直接读真实7ref slab initialized
  位，absent/undeclared/uninitialized返回0，既有last-error不变；不导出ABI。
  linker从实际adapter三个registry声明解析canonical cells，经私有WeakMap
  传给lowerer（无新增program IR字段/无外部marker）。编译一个私有callable
  仅用于descriptor.literalRuntime.bindings.literal-kind：三cell未ready时不
  Get任何registry值/用户predicate，ready才调用原literal-kind并原样保留
  异常。原语言函数/真实TDZ/transport注册算法不变，不声称ready意味着全部
  transport注册完成；不迁移或改legacyJS。descriptor另记录原binding和真实
  三cell供固定B反证，所有function/table index由真实lowerer分配。
- [ ] D：父统一生成/新四阶段/完整受影响组及最终三输出；本批源写齐未执行。

### C54 / A06、A07：实际公开引导错误通道与测试驱动修正

- C53全部源统一生成 `bbb2a1718e4c4008887eee445990599c` exit0；四阶段
  `1962fe57c052421aa157f4cf27ece29b`，46.881s、峰值3592454144 bytes、
  exit0、cleanup complete；313文件完整固定点再次成立。只读复核
  `ba9a87d08b2d4e52ac594bed511d9a2d` exit0，产品SHA两代均为
  `5e4737e4fd21d7112520f6efd3ed8b598232f68a4e3d3fde17037156514f6d36`。
- 原1+5完整自举门禁实际6项4P/2F，run
  `908ba1f84136431eba441cbc40318642`，48.128s、峰值574898176 bytes、
  exit1、cleanup complete。独立per-file/batch全部字节与map、语义失败
  旧产物拒绝及三代13module固定点已通过；剩失败分别为公开override的
  stderr丢失，以及迁移新增scaffolding误把shell launcher当Bun模块执行。
- [x] C：`tools/bootstrap-runtime.el` 新私有同步call helper保留stdout和
  stderr独立通道。只用本次临时stderr文件并在unwind-protect删除，转发
  完成后才按真实退出码退出；不把被捕获的stderr留在未输出的Emacs buffer。
  无需修改任何shell/JS launcher。`bootstrap-seed-proxy.eli` 用真实fd2
  writeSync确保exit17前诊断已写出，不改原消息/退出码或拒绝旧产物断言。
- [x] B/C：published原case复用维护Eli产生的真实probe driver完整字节，
  写入该case新生成的output并逐字节核对。该driver仍实际加载package
  内本次Emacs新构建compiler，编译原square(7)源码并真实执行49。原历史
  case仅要求这一行为，不要求额外调用portable CLI编译测试driver；移除
  C51迁移新增且不属于原case的portable编译步骤。未给package注入旧编译器、
  backend/dev tools或旧dist；1+5用例、原源码/时限/golden均保留。
- [ ] D：全批源齐后统一生成、原6项与受影响Elisp严格字节编译集中复验。

### C55 / P05、P07、A06：独立 package runtime 作用域与 Worker 模块边界

- [x] A：C53 四Node文件真实21项18P/3F，run
  `626118907c824db99081557b64e517c3`，43.495s、峰值1779105792 bytes、exit1、
  cleanup complete；Unicode7、protocol9均全过。三失败只在package：两项
  packaged `runtime/core/protocol-impl.mjs` 的默认Unicode裸import无
  `eliscript` 解析，另一项实际Chromium module Worker报
  `installBrowserCompilerWorker is not a function`。完整Bun build另run
  `762ce8f374914758b8543c11ee7f523b` 已17/17通过，本批不动其源码或重跑。
- [x] A：生产包外层名称由caller决定，transport/dist/artifact虽有私有
  self-scope，transport同时真实导入包根runtime/core provider；该runtime
  不在上述私有scope下，继承外层自定义包名后无法解析自己的Unicode import。
  必须给实际包根 `runtime/package.json` 配真实 self-scope，不能靠测试
  目录链接代替交付闭包；原metadata/source/artifact identities仍不变。
- [x] A：真实legacy `compiler-browser.mjs` 明确导出
  `installBrowserCompilerWorker`，内部才调用低层 `installCompilerWorker`；
  当前Eli facade公开导出/委托同名正确，不做猜测式API改名。
  该legacy的真实Blob Worker以 `import(import.meta.url)`重新读取当前
  browser模块namespace；测试probe若把它inline进无此export的probe
  entry便破坏原模块自import边界。原HTTP browser模块必须独立部署/加载，
  不能用main-thread回退或重写legacy Worker模板修饰错误。
- [x] B/C：`compiler-package.eli` 给真实root runtime增加私有
  name=eliscript/type=module作用域，三个实际exports分别路由本目录
  math/unicode-case/unicode-case-data；外层包名/原公开exports不变。
  新文件记录实际bytes/SHA进原manifest；已有certified scope逐字认证并
  验其真实路由后保留原bytes，缺失但原artifact identity已声明的scope
  只允许写出与其既有bytes/SHA完全相同的内容，冲突严格拒绝。
  不覆盖或重签原artifact代码/地图/已认证package文件。
- [x] B/C：原5case全部保留。新增scope用独立完整expected对象对照、实际
  SHA/bytes核对；原entry完整复制字节/manifest identity再次严格比较。
  缺依赖case仍必须实际静态import拒绝目标legacy文件，不接受其它错误。
  Worker probe保原全部业务/abort false/显式404/HTTP请求断言，仅运输
  specifier使用本次真实监听server的绝对browser模块URL，并将该精确URL
  设为bundler external，避免相对文件specifier被inline进probe。
  无import map、JS模板、生成文本替换或main-thread降级。
- [x] B/C：最小protocol fixture原来只回显operation/value42，完整browser
  公共入口还依法核对capabilities.host。新增该fixture真实javascript
  host声明并明确independentCompiler=false，独立请求核对；原fixture
  请求/42黄金不变，真实fixture sourceIdentity/artifact SHA由原算法生成，
  不能把此transport fixture称为完整编译器。Worker实际函数namespace
  同时明确断言存在原公开installBrowserCompilerWorker。
- [ ] D：父统一生成后原完整package5case集中复验。原C53日志完整保留，
  本批仅维护Eli源码/测试/此唯一计划，未编译、测试、reader或额外检查；
  Worker/包闭包仍待真实D，不提前宣称通过。

### C54 D / P07、A06：全部 capsule 的真实 module/map 配对来源

- [x] A：package 原5项 run `99671aa66c7b416384489e860618c91f`，4P/1F，
  1.594s、峰值272809984 bytes、exit1、cleanup complete。真实Chromium
  Worker/原请求/缺依赖/CLI已过，唯一firstcase停在support map独立expected：
  输出Math map来自root runtime生成物，file=math.mjs/source=math.eli；
  新B错误读取dist/runtime的另一真实生成物，其file=runtime/math.mjs、
  source=runtime/math.eli。两者source坐标不同，不能删字段或重写map来比较。
- [x] A：真实 `complete-frontend-support` 对各prefix的无认证支持资产
  原本都取sourceRoot/runtime，而不是sourceRoot/dist/runtime；frontend
  dist/bootstrap仍取同名dist实际原文件。已认证artifact模块和其原map
  必须留原bytes；逐文件独立fallback还可能给无map的认证module补入
  不同generator的map，故生产也须按module/map真实配对边界运输。
- [x] B/C：只维护 `compiler-package.eli` 与原package Eli suite：三capsule
  math/unicode-case/unicode-case-data × dist/root/artifact/transport 四位置
  × module/map 两文件，完整字节与实际SHA/bytes全部独立对照真实输入。
  无认证时expected明确取root/runtime原支持产物；dist/bootstrap原全部
  原件/map比较不变。新增同原case的认证fixture实际复制dist/runtime
  三套真实producer module/map，并绑定各维护Eli源及实际文件SHA，
  artifact前缀expected明确取该独立producer输入，其余前缀仍root支持。
  不用包输出metadata反推expected，不改map/sourceIdentity来让比较相等。
- [x] B/C：认证fixture的sourceIdentity/artifactIdentity在packaging前后
  全量严格比较，artifact私有scope与原input完整字节相同；三个真实map
  各自同长度篡改后，都须在原copy哈希校验处精确拒绝对应原路径且不重签
  原身份。原legacy依赖缺失/篡改/公开scope/hash/Browser原断言完整保留，
  原5case不删不跳，fixture明确independentCompiler=false。
- [x] C：生产按pair处理：无module/map才取同root producer两文件；
  已认证module+map留其原bytes；已有module未声明map则不附其它生成物；
  孤立map严格拒绝。没有修改legacy、生成JS/map文本、已认证sourceIdentity
  或正式编译器/黄金/预算，不新增额外映射或公开API。
- [ ] D：父统一生成后完整原5case复验。本次仅源码实现，未运行测试、
  编译、reader、探针或静态审核；保留原map失败收据，不提前计通过。

### C55 D / P05–P07：当前集中验收收据与剩余主线

- [x] 独立 package 原完整 5 项全过，包括全部 capsule/module/map 原字节、
  来源认证与篡改拒绝，以及真实 Chromium module Worker。run
  `eb06f6737c694bd3a196ae8e22fd940e`，1.884s，峰值 321126400 bytes，
  exit 0，cleanup complete。对应 C54/C55 package D 已实际完成。
- [x] 发布包源码重新引导的原用例真实通过，run
  `239bf4ffa0ef4d9eb29c53bbbf210678`，5.996s，峰值 154976256 bytes，
  exit 0，cleanup complete。结合 C54 原六项中的其余五项，原六项均有
  本轮实际成功证据；不把分批结果冒充最终全量门禁已通过。
- [x] C53 完整 stage2/stage3 固定点 313 文件逐字节一致；C54 只读
  `verify-bootstrap` 复核 run `4883f431ea034ce68b8d2e60afb5a701` 成功。
  独立命令、阴性测试、README 和 R13 已落实。后续正式源码变更及版本
  冻结仍须生成并验证对应新固定点，不复用旧收据冒充新产物。
- [ ] 原 owned-binding 用例仍真实失败：run
  `5908b8d5d3c54d4e89e029b902ea1a30`，18.431s，峰值 4209131520 bytes，
  exit 1，cleanup complete。完整图 WASM load-project 的 Symbol
  自动协议角色探测过早读取注册表，实际 ELI-RT0008；纯图 WASM/native
  在该失败前已执行通过，但完整 native 和末尾新增 raw 反证尚未执行。
  按同族自动 kind/role 探测的真实读依赖成批修复，再冻结下一候选。
- [ ] A05 完整同源三输出、A06 原全量门禁、A07 浏览器/声明平台、A08
  0.0.2 最终冻结/包安装/签名推送/CI 均未关闭。A01–A04 当前候选
  已有证据，共 4/8 总验收项；这是验收项计数 50%，不是工作量估算。

### C56 / P05、A05、A06：自动 kind/role 探测的真实初始化边界

- [x] A：C55 首错为完整图 WASM 的 `load-project`，自动 Symbol 解码
  调用 `literal-protocol-for-role` 时触发原 ELI-RT0008。原 decoder 的
  自动入口是 object/function 的 `literal-kind`、Symbol 解码及宿主
  标准协议引用编码的 `literal-protocol-for-role`；显式真实值导入
  `literal-import-value` 和 kind 已确认后的 `literal-export-value`
  保持原真实调用，不套用无品牌或无协议的缺省结果。
- [x] A：kind helper 的真实只读 admission 检查三个 canonical global
  cell：`literal-records`、`literal-protocol-runtime`、`literal-transports`。
  role 原 helper 还直接读取其定义模块的 `role-protocols` Map，不能用
  同名声明或三个 adapter cell 冒充该真实依赖。链接器按解析后的 helper
  binding 对象身份找到同 owner record，再取其原 Map cell。
- [x] B：原第17完整 case 的后置 rawguard 同时验证 kind/role：复用
  同一真实 pure WASM image、公有 project prepare/get/close 和现有
  heap/value API；保存四个实际 cell 各28字节及其真实引用根，显式
  构造未声明和声明未初始化两状态。kind 必须返回0、role 必须返回3，
  每次 last-error 仍0；原公开 Get、kind helper 和 role helper 保留
  真 TDZ8，恢复错误后自动探测仍返回相应缺省值。finally 逐字节还原
  原 cell 并完整对照，平衡原 pin，保 live0、frame0 和第一错误。
  不再假定真实 prepare 未初始化 registry。
- [x] C：`bootstrap/backends/managed.eli` 复用原只读 initialized 检查和
  私有 table 编译路径：kind guard 未 ready 返回0；新增私有 role guard
  检查上述三 cell 加真实 role Map cell，未 ready 返回3；ready 后调用
  原 helper，原异常和动态注册保持。只由内部 WeakMap 记录真实链接事实，
  descriptor 绑定私有入口并保原 helper/registry 位置供反证；不新增
  公共 raw ABI 或外部 IR schema 字段，不改 memory/legacy JS。
- [x] C：`tests/eliscript/managed-project-zero-imports.eli` 保原完整
  fixture、全部黄金、纯/能力两 variant、WASM/native 两 target、原预算
  和时限；原报告、普通绑定、真实 queue/ordinary codec、async 及清理
  全部先执行，后置 rawguard 仍实际执行且任何失败令整个 case 失败。
- [ ] D：待父统一生成、新四阶段固定点及完整第17 case 实际验收。
  当前仅 A/B/C 源码完成，未运行 reader、编译、测试或额外审核；保留
  C55 原失败收据，不能提前记 ELI8 已修、完整图已通过或全门禁完成。

### C57 / P05、A05、A06：自动 literal 探测的同 heap 重入边界

- [x] A：C56 新固定点和只读313文件已通过，原第17完整 case 仍失败，
  run `6e09451561724b5d98f175ba43706dc8`，18.207s，峰值4813635584
  bytes，exit1、cleanup complete。ready kind helper 调用宿主协议时，
  capability bridge 解码其参数，再次对同一 receiver 自动探测 kind，
  实际 RangeError/调用栈溢出；不是继续放宽 TDZ 或显式持久值操作。
- [x] B：原 `tests/eliscript/managed-host.eli` 补齐真实 module getter
  识别私有 probe 的边界模型：kind/role 共享同 heap 动态范围，互相
  重入分别返回0/3；不同 heap 继续实际调用；公开原 helper、无 probe
  旧 descriptor、原 exports 身份/描述符及非法调用原错误保持；抛 false、
  undefined 或返回真实错误后 finally 恢复，下一次原调用正常执行。
  原第17完整 fixture、双 variant/双 target、真实黄金和后置 raw 反证不变。
- [x] C：仅维护 Eli `managed-host.eli` 的私有 exports 视图，包原
  module getter 与原 invoke。仅 getter 成功取到 descriptor 明确私有
  table binding 时记录实际 callee 句柄，不探测伪 kind、读 code、pin
  或提前释放根；factory 私有状态按 heap 隔离。原 invoke 的成功、
  错误或抛值均由 finally 清范围；只对实际嵌套自动 probe 的有效 ABI
  返回无品牌/无协议，非法参数仍交原 validator。公开 helper、显式
  import/export 不被替换；不改 legacy JS、memory ABI 或原 helper。
- [ ] D：父统一生成后集中验证原完整第17 case及受影响 host/protocol
  门禁。本批未运行生成、测试、reader或审核；C56原 protocol9已有
  run `2386dd9a0dea431ab7d76847c095455c`、9/9、43.663s、1780809728
  bytes、exit0/cleanup complete，不冒充新重入代码的实际验收证据。

### C56 D / P05、P07：新固定点成功，完整图的真实重入阻塞

- [x] 统一生成成功，run `4a012d41ee814b319a94f2c21f81df70`，13.193s，
  峰值 192364544 bytes，exit0/cleanup complete。Emacs→stage0→1→2→3
  全链成功，run `adf8ef5f01834bca9ecbf5c88f506285`，49.690s，峰值
  3342385152 bytes，exit0/cleanup complete。
- [x] 独立 `make verify-bootstrap` 实际只读复核 313 个完整产品一致，run
  `e0c61114d9eb481c9d01fe80fa4268b4`，0.981s，峰值 99893248 bytes，
  exit0/cleanup complete。两代完整 product SHA-256 同为
  `be5cd83ccd9b232a7c210e50c4297829289766fc021bff84e1c198f9d0f46890`；
  source identity SHA-256 为
  `b954ea77c4515b2acc654a5d7088a0bde11daf07a39fa40294746c9a6dcccc52`。
- [x] 受影响原 protocol-dispatch 完整9项全部真实通过，run
  `2386dd9a0dea431ab7d76847c095455c`，43.663s，峰值 1780809728 bytes，
  exit0/cleanup complete，包括真实 JS/WASM/native 项目与协议身份。
- [ ] 原 owned-binding 完整第17仍未通过：run
  `6e09451561724b5d98f175ba43706dc8`，18.207s，峰值 4813635584 bytes，
  exit1/cleanup complete。越过此前过早读取后，自动 literal-kind 调用
  原 helper 的宿主协议操作，桥接又 decode 同一对象并再次自动探测，
  产生实际 Maximum call stack exceeded。这是代码重入缺陷，不归因
  系统负载/内存不足；按同族 kind/role 自动探测整体修复，保显式操作、
  public helper、真实错误及全部原黄金，不宣称完整三输出已过。

### C57 D / P05–P08：当前固定点、实际桥接回归与三输出运行

- [x] 统一生成 run `c4917be286a54123882f4fd6de2e9bad` 成功，13.136s、
  峰值205111296 bytes、exit0/cleanup complete。新四阶段真实成功，run
  `e5ebe5fe4a1c4457a99f1e8ec46c63d0`，49.807s、峰值3445669888 bytes、
  exit0/cleanup complete。独立只读复核 run
  `4b4d9b0649a54b7dbb24bde74e758c97`，0.990s、峰值99844096 bytes、
  exit0/cleanup complete，完整313文件一致，product/source SHA 与 C56
  相同；本批修改的是宿主桥接工具，不改变正式编译器产品。
- [x] 原 managed-host 加新增重入反证整文件实际15P/0F/1原有skip，run
  `4248c26f44cb405ba5482c4fd29268cd`，15.680s、峰值1808728064 bytes、
  exit0/cleanup complete。公开原helper、不同heap及真实异常后恢复有实际
  证据；不能代替完整 owned-binding 第17或完整三输出的成功。
- [ ] 完整第17保原输入/黄金/120000原参数正在运行；Bun同步body没有按
  该测试参数中断。实际CPU持续工作、RSS约4GiB，无终态；一次系统sample
  为未符号化JIT/WASM地址，静态也未证明无限循环，不能仅据耗时杀掉有
  可能正常进展的任务，不新增时限/探针或并行重复此case。
- [ ] 正式 `targets` 已启动：只用 C57 stage3，同一冻结有效corpus，
  javascript/wasm/native三路同时实际编译执行，native=arm64-macos，
  原显式 `functional-runtime-profile small`。日志
  `eliscript-stage3-complete-targets-candidate57.log`；targets收据仍
  running/unverified，等整路终态，不能拿中途record数量冒充通过。
- [x] P08源码整合已把本轮维护源/接线同步交付worktree，保无关WIP；
  三个已迁移canonical生成入口已untrack，维护Eli源保留，原有两份实际
  使用的bootstrap legacy字节档案保全。最后kind/role/backend/runtime/
  host与其测试族已在 C57冻结后同步。尚未暂存/签名提交/推送或升级版本；
  最终原全量门禁、浏览器/平台、0.0.2冻结/包安装及对应CI仍待关闭。

### C58 / P05、A05、A06：原生 Object 消费短命 owned 值的边界

- [x] A：C57 原第17完整 case 已终态，不再归为未知慢跑：run
  `0d85acee365c4f1cb8a4f33ef96f548c`，381.41s、峰值4653236224
  bytes、exit1/cleanup complete。完整图 WASM 已完成 load-project，
  在 complete-original-report 内实际 ELI-RT0002；不是 RSS 护栏失败。
  原 report 含未缩减的 Patterns/countdown10000，逐轮构造持久 map。
- [x] A：真实放大路径为原 native Object 静态方法的 capability 参数
  decode → rememberSource → sourceCache/consoleRoots。即使只由同步
  原生方法读取，短命 owned 值也被包装成同 job WeakRef 保活的 view；
  withHostValues 清理有意跳过 consoleRoots。literal-kind 的 reduced
  检查调用 Object.hasOwn；持久 map/node 的构造反复 Object.freeze，
  literal-own-data 用 Object.defineProperty。不能通用提前 release，
  因为用户 override、getter 或 predicate 可以真实保留传入 view。
- [x] B：原第17同源 fixture 增补这三操作的 owned 原生观察，并取真实
  emitted JS oracle；保属性 flags、getter读取顺序、false首错、返回
  同 receiver。能力图另验真实 foreign Proxy、对象键 ToPrimitive 顺序、
  抛 undefined、调用者 override 保留 owned receiver、foreign freeze
  的返回身份。原完整 report/10000/双 variant/双 target/原容量/时限和
  后置 rawguard 全保，不拿新增小观察代替原黄金。
- [x] C：仅交付树维护 Eli host-object-provider/host-object-realm 两能力。
  捕获并核实真实 native hasOwn/freeze/defineProperty identity，通过原
  foreign codec 在对应 heap 注册固定三个函数根；原 dispose 前平衡释放，
  登记异常也清理且保首错。实际 source-operation Call 仅在目标函数
  身份精确相同且参数是可证明 owned ordinary record/array 时复用已有
  raw ABI，不解码发布其 receiver；无新增 runtime ABI/legacy JS。
- [x] C：defineProperty 进一步仅限可扩展目标的新增属性、primitive key、
  无自定义原型/污染继承的普通 data-only descriptor。已有属性、不可
  扩展、accessor/inherited descriptor、namespace/function、对象键、
  foreign/Proxy 和用户方法替换保原 handler；不猜测或改写其错误消息、
  getter/coercion/首错顺序。raw 执行保真实 source exception/class 并在
  finally 平衡 frame，公开 helper、探测 guard 和持久值算法均不改。
- [ ] D：本批仅 delivery A/B/C 源码完成，未生成、编译、reader、测试、
  额外探针或审核。父合入后统一新候选及受影响完整门禁，不能提前判定
  原第17、原完整三输出或容量已通过；保 C57 原失败证据。

### C58 / P05–P08：C57 原完整验收终态与本批精确阻塞

- [x] 已确认 C57 三输出进程终态 exit125，run
  `5b7dd831231049f3a9e2f71af713f1be`。执行器保存自己的状态时发生
  ENOSPC 并回收进程树；不是RAM超限，也不是新设时间限制。原收据仍
  running/constructing，不能仅据该旧字段推断活跃或改成成功；原结果/
  日志/哈希完整保留，不手工修改测量或验收状态。
- [x] 最终保留的部分记录实际计数：JS535条（498 equivalent、37
  different）；WASM549条（491 equivalent、34 different、24原范围
  cancelled）；native290条（261 equivalent、29 different）。三目标
  均未完整通过，这些数量不能当作整路通过或最终完成率。
- [x] 完整 owned-binding 原第17也已独立终止：run
  `0d85acee365c4f1cb8a4f33ef96f548c`，381.410s，峰值4653236224 bytes，
  exit1/cleanup complete。真实 complete/WASM 已越过 load-project，
  在 complete-original-report 报 ELI-RT0002；不是OS内存限额或磁盘错误。
  原countdown10000/原capacity和黄金不变，短命owned对象被真实原生Object
  调用升级为长期host view的持有链归同族 C58 功能修复，不加预算。
- [x] 29个三目标共有 emitter 差异的来源已定位：独立 Seed oracle 的
  `tests/bootstrap-emitter-oracle.el` 是指向旧候选的源分发别名，其
  load-file-name 把旧 compiler 放到搜索路径首位。旧 compiler 缺
  Unicode import，而当前正式compiler含该import，完全对应JS差一行/
  map少一行的现场。不得改正确发射器、删import或改黄金来掩盖。
- [x] 同族分发别名已整体处理：仅将 source-relative 坐标恰与旧源根
  相同的351个入口用APFS clone保原字节物理化，包括上述oracle、原
  tests入口、fixtures及tools目录；dist、依赖目录和合法相对bin链接
  未动，不改真实fixture源码/黄金/隔离validator。evaluation根逃逸及
  原literal-runtime的双根协议身份错误待同批统一D，不提前计通过。
- [ ] 真实 virtual sourceOverrides 项目临时输出仍缺默认Unicode运行
  依赖；按原完整bootstrap-project用例的Node/Bun输出43补独立部署
  闭包。新增维护Eli facade/支持资产和B先齐，旧API/manifest/cache/
  report与源输入保留，不改原测试来绕过真实输出执行。
- [ ] 同批还保留WASM formatter-node边界错误、core-set关闭视图及
  core-stdlib递归三处原现场；先归因物理分发/持有链，只有仍真实阻断
  主线的同族问题修复。全部B/C齐后统一生成和D，不碎片测试。

### C58 / P06、A06–A07：普通项目输出的默认 runtime 闭包

A（已确定）：C57 原 `tests/bootstrap-project.test.mjs:731–789` 的 virtual-bun 两模块项目经真实 buildProject 发射 main.mjs 后缺 `eliscript/runtime/unicode-case.mjs`，原输出 43 尚未得到。C46 默认 Unicode import 是语言交付要求，不删除该 import，也不更改原 sourceOverrides、maps、独立 Node/Bun 和 cache 断言。`bootstrap/host/project.mjs:874–1081` 原实现完整处理校验、图隔离、IR 发射、缓存、manifest 和 report，但成功返回前后从不部署默认 runtime。原模块只有 checkProject/buildProject 两个公开导出。

施工边界：将此旧模块原字节保留 `bootstrap/host/project-legacy.mjs`；维护源 `tools/project/project.eli` 生成回原 `bootstrap/host/project.mjs`。checkProject 保原函数 identity；buildProject 仅以原 options 单次转交真实 legacy 构建，成功后读取其真实 outDir/result，不改变原验证/Get 顺序、module 输入/产物、manifest/cache/report/digest 或 frozen result。独立的输出内 `node_modules/eliscript` scope 声明三个真实 exports，复制 root/runtime 的 math、unicode-case、unicode-case-data 三对 mjs/map 原始 bytes，不混用 dist/runtime 的另一套 generator 坐标。逐份 map.sourcesContent 必须等于实际维护 Eli 源；私有 eliscript-runtime.json 保存相同真实 source/module/map 的 bytes/SHA256，不重写任何已认证原产物身份。

部署前先读取认证全部源、预检全部已有目标及目录；拒绝非目录、symlink、不同 bytes、源/输出 alias。只允许相同 bytes 复用或 wx 新建，race 下 EEXIST 仍比较相同 bytes；不改调用方 package.json，不写出 outDir，不覆盖用户文件。缺真实源/map 或 source/map 不匹配必须原样拒绝，不能偷偷改用另一生成器。

B（源码写齐、未运行）：新增 `tests/eliscript/bootstrap-project-runtime.eli`，5 项保留真实两模块 sourceOverrides 输入/43，独立 legacy manifest 与每个 module/map 全 bytes、原源不变与 sourceDigest；Node/Bun 真执行；原 disk/cache 复用/42、调用方 package scope 原字节；3 capsules×module/map 及 scope 每项冲突严格拒绝且原 bytes 保留；symlink 不可逃逸、删除真实依赖后执行必须失败、重新部署恢复；checkProject 原 identity、option getter 原首错与 Get 顺序。原 bootstrap-project 全套不删不换。生成入口 `tests/bootstrap-project-runtime-selfhosted.test.mjs`，加入既有 Node 门禁。

C（源码已齐，验收待执行）：纯 Eli facade＋原字节 legacy、Emacs tools bootstrap 源/输出映射、generated canonical/maps ignore/untrack、B 映射与 Make 既有 Node 组均已落实。无手写 JS/模板，无新增正式 compiler module。

D（待父统一）：本批不生成/编译/reader/测试；父在全部 C 齐后统一生成，完整原 bootstrap-project 套件和新 5 项一起验证，再按当前正式 stage3 三输出验收。此前 C57 ENOSPC 中止和原缺依赖失败保留，不补写历史通过。

### C58 D：主目录干净引导的项目模块前置

- [x] A：主目录首次 `make bootstrap-backends` 在启动各个 JS 工具时全部失败，原因为 `bootstrap/host/build.mjs` 静态导入尚未生成的 `project.mjs`。原初 runtime 准备函数只生成 Unicode、Math 和三个 core 实现，而 project facade 仅列于后续 JS 工具队列，形成引导依赖环。
- [x] B：复用 `bootstrap-js-stages.eli` 的无编译器产物 checkout；额外复制维护 project Eli 及原字节 host 支持源。由 Emacs 单独构建 stage0 后，检查 facade/module map 的源字节，真实加载并比较原 checker identity、公开 build 函数。全阶段及原输入断言保留。
- [x] C：`tools/backends/bootstrap.el` 的 `eliscript-backend-bootstrap-runtimes` 将 project facade 放在三个 runtime 与 core 准备项后、任何 JS 调用前，仍经维护 Emacs 编译器直接发射；后续同一 Eli 自举队列保持不变。最小正式源码 checkout 缺少可选 project 源时沿原存在性判断跳过，不扩大正式 compiler 源图。
- [ ] D：统一重建与实际四阶段固定点、上述原完整用例及 C58 其他受影响门禁；首次失败日志保留为 `c58-main-bootstrap-backends.log`，不将生成成功提前算作最终三输出通过。
- [x] 同批公开入口：Pages CI 在 `bin/eliscript-bootstrap` 后加载 build host 时证实同一缺失。`tools/bootstrap-runtime.el` 新增 `eliscript-bootstrap-prepare-project-host(root)`，`tools/bootstrap-seed.el` 完整参数校验与 runtime 准备后调用；B 新增第二个独立无产物源码树，实际运行公开 seed 脚本，再经真实 build host 编译 `(print 43)` 并执行。后端内部入口与公开入口均覆盖，不修改旧 JS。
- [x] D 原 reader 还发现两处缺括号，已各补一个闭括号：`compiler-corpus.eli` 的 project-runtime-assets records/filter 初始化、`bootstrap-project-runtime.eli` 最后一项测试。未改变原条件或断言；随后整批工具生成成功。

### C58 D：主目录实测进展

- [x] 阶段源码提交 `fe21886` 签名核验成功，主目录 master fast-forward 并推送，远端提交一致；版本仍为0.0.1，不是0.0.2发布完成。
- [x] 主目录真实完整四阶段：run `aafc6122b83f43b9a6b027884f822356`，71.974s，峰值3709976576 bytes，exit0/cleanup complete。独立只读复核 run `97a02ef2fce342c1bc3e77d338025dea`，313文件逐字节一致，stage2/stage3产品SHA均为 `be5cd83ccd9b232a7c210e50c4297829289766fc021bff84e1c198f9d0f46890`；用户可从主目录执行 `make verify-bootstrap BOOTSTRAP_RELEASE_OUT=dist/bootstrap-candidate58` 自行复核。
- [x] 原 strict byte-compile exit0；额外 bootstrap-runtime、bootstrap-seed、backends/bootstrap 三个维护Elisp工具严格字节编译也exit0。整批工具生成 run `2f2247bd05d544dda9bc2256d871afc3` exit0。
- [x] Node test有效部分23项通过：完整stage链/异常与篡改拒绝9项、项目runtime5项、release integration9项。误将两个bun:test文件交给Node产生协议拒绝，未算功能失败或通过；这两个文件仍需原Bun入口验收。Browser workflow新2项实际通过。Unicode默认3项与host原回归15通过/1原skip。
- [ ] 原完整make test在stable corpus身份检查停止。随后独立收集原其余contract CLI：12通过，4失败（当前stable/parity派生身份两项；两项retained门禁被已迁移生成测试的tracked路径前置阻断）。保留历史合同/报告/性能失败，不能重跟踪生成物或手改报告哈希。
- [ ] 完整同源三输出已并行实际运行；WASM formatter原现场仍有真实ELI-RT0003，不能据固定点或部分记录提前勾A05。原Bun测试入口存在无诊断exit1，正在按真实依赖路径定位，未用放宽容量或更换断言绕过。
- [x] Bun 无诊断退出已证实为手动命令路径问题：未带 `./` 的路径触发名称匹配及保留目录扫描，不是语言或Unicode缺陷。原Make已用显式路径，生产源码无需改变；正确原入口执行原完整 bootstrap-project、file-workers、ci-contract 三文件，37/37通过，661原expect断言，run `fc38fa1804664963abf7d9e1560a4446`，exit0/cleanup complete。完整owned第17用例已按显式原路径启动，尚未计通过。
- [x] 随后 Pages CI `fb98a50` 越过 project module 缺失，证实该生成 host 位于 root，不能借 compiler output 的私有runtime作用域：公开 seed 现同时生成 root 三个真实runtime module/map，保留 root package.json。B 的无产物源码树复制真实 package.json，使自引用指向自身，不能借外部 checkout 的 runtime 掩盖缺项；Pages 构建入口改为完整 `make bootstrap-backends`，使后续已迁移 assemble 工具也有真实生成前置。本增量未据旧证据提前判通过。
- [x] 同族根目录产物稳定性：原独立测试seed使用异地 OUTPUT 时，不再覆盖已安装的root stage3 host/runtime；只补缺失的真实module-map对。默认root引导仍重新生成这些能力，正式stage0完整源码发射不变。B扩上述公开入口用例：真实独立seed完成后，四个root支持module的全bytes与mtime必须不变，防止后台fixture构建改变正式编译器依赖。此增量待统一D。

### C58 A07：Browser CI 全新 checkout 的生成工具前置

- [x] A：真实 Browser compatibility CI 在未生成迁移后的 runtime/tools 时直接导入原 browser tests，出现 `managed-runtime.mjs` 等模块缺失。保持原系统×浏览器矩阵、完整六文件命令、断言、预算和证据上传，只在依赖安装后、浏览器安装及测试前新增无条件 `make bootstrap-backends`。工具源 `tools/ci/render-browser-workflow.eli` 发射 canonical renderer；原 renderer 原字节保留为 `render-browser-workflow-legacy.mjs`，SHA256 `a2beec03e9a61946097e57a11638f47e6a52f3b69fce1afdfabca2bad226d684`。
- [x] B：新增维护 Eli `tests/eliscript/browser-workflow.eli`，接既有 Node 完整组。断言 bootstrap 严格位于依赖与浏览器/原测试之间；去掉新增步骤后与原 renderer 输出逐字节一致，原验证函数及 Error 类身份保留；checker 拒绝缺失或 `if: false` 跳过 bootstrap。原 `ci-contract.test.mjs` 未改，继续覆盖原六文件命令、不可删减/过滤测试和全部矩阵行。
- [x] C：Eli facade 保留四个公开导出、完整 contract/workflow checker 与 `--write`/默认验证 CLI；仅在原 browser 安装锚点前插入 bootstrap 步骤。`tools/backends/bootstrap.el` 补工具与测试源/输出映射，canonical renderer/map、新测试/map 全部 ignored，Make 既有 Node 门禁接入新测试。无新增手写 JS 或 JS 模板，未覆盖同批 runtime 前置修改。
- [ ] D：父任务统一生成 canonical renderer/test、执行 renderer `--write` 与 checker、新 Eli 回归及原 CI contract/browser 完整门禁；验证全新 checkout 构建路径与真实 CI 后才判 A07 完成。本子任务未编译、未测试、未提交。

### C58 / P06、A06–A07：原 acceptance checker 的生成证据来源

A：原 `tools/acceptance/check.mjs` 的 validateAcceptanceCorpus 只接纳 git ls-files
结果，原 AC-04/05/07 合同仍指向已迁移的 bootstrap-compiler.test.mjs。因此
保持原合同、m13-01 JSON/Markdown、全部历史 hash 原字节不变，将原 checker
原字节归档为 check-legacy.mjs。维护 tools/acceptance/check.eli，迁移完整
validate/check/run/verify 与 CLI；仅错误类与纯报告格式函数继续引用 legacy。
不代理旧内部 validator，不伪造 Git/index/root，不投影修改报告。

唯一例外为 tests/bootstrap-compiler.test.mjs：维护源
`tests/eliscript/bootstrap-compiler.eli` 必须真实 tracked；原 bootstrap 入口为
该测试生成真实 source map。`tools/acceptance/compile-evidence.el` 直接加载
维护 Emacs Lisp 编译器，将真实源按原 absolute input、generated basename、
relative sourceName 重编译至内存 JSON。validator 比较 canonical module（含
原 sourceMappingURL）及 map 的完整 bytes；不能只信 sourcesContent 或 marker。
全部其它 untracked evidence 原样拒绝。每次 validator 读取真实源及真实生成物，
不得用缓存掩盖变更；Emacs 失败、缺源、缺 map、不同 bytes 均严格拒绝。

B：新 tests/eliscript/acceptance-generated-evidence.eli 复用原 checker 用例的
35 条规范派生、未知 probe/path、缺 criterion/title/application、历史 report 与
伪造 summary 断言；独立临时 Git fixture 覆盖同一维护源/真实 module-map 的
正例，源/module/map/合同 manifest 篡改、遗漏 tracked 源、未知 untracked
路径及 compiler failure 否例。原 tests/core-acceptance-corpus.test.mjs 全部
保留且仍执行。CLI/公开 API 不删除；run 的真实 probe、clean tree、环境记录、
artifact inventory、原 timeout 与 requirePass 判定迁移保留。

C：原字节 archive、Eli checker、Emacs 内存编译工具、B、bootstrap 两映射、
canonical module/map ignore/untrack、Make 原 Node 组入口、package files 一次
接齐；实现/用例写齐前不生成、不 reader、不测试。D 由父统一执行原 retained
两个 CLI、原 suite 与新否定组；当前 corpus/parity identity 由父真实生成器更新。

本族 A/B/C 已写齐（D 待父统一）：新增纯 Eli checker 与 5 项完整新 B、
Emacs 内存重编译器；原 checker 归档为 check-legacy.mjs，canonical 已从
index 移除并 ignored。原导出全部保留，validate/check/run/verify 与 CLI 均
走维护 Eli 内部 validator；只有原 error class 与三个纯 formatter 引用 legacy。
默认 bootstrap 仅为原 bootstrap-compiler 测试增加真实 --source-map，其它
工具生成选项不变。bootstrap 两映射、Make Node 组、package files 和 ignore
均已接齐。不生成、不运行测试或构建，不修改 core acceptance 合同和历史
report/markdown、corpus/parity 派生 identity。源/模块/map 使用 Buffer 原字节
比较，额外拒绝独立编译期间源变更；新 B 包含真实合同文件空白篡改 SHA 拒绝。

### C58 P05：真实 native defineProperty 的 owned 函数与已有属性

- [x] A：完整 WASM `core-stdlib-usage` 的真实原产物诊断中，prepare 在实际 `Object.defineProperty` 给 owned kind18 函数（code179）重设已有 `length` 时进入 legacy host codec，触发 brandProbe1110 后产生约4900次嵌套 descriptor has/get，原 effective 131072 slots / 8 MiB initial / 64 MiB max / auto65536 下容量耗尽；原完整重放也报告递归溢出。`native-object-operation` 原规则仅接 kind13/14 且 `native-data-definition-p` 要求目标 own 属性不存在，因此该调用被排除。已有 raw `value-object-meta-builtin(0)` 经 `value-source-define-descriptor` → descriptor normalize/merge → kind18 `heap-function-data-put` 明确支持函数、已有属性、不可配置字段拒绝及 flags 保留，不需要新增 runtime ABI。
- [x] A 范围：仅扩展真实 native `Object.defineProperty` 的 owned kind18 目标，以及 owned 对象/数组/函数已有属性；仍认证原 native callee，仍拒绝 namespace、foreign Proxy、对象键及非纯 data descriptor 的优化分支，保持原 getter/用户覆盖/继承污染 fallback。目标 extensibility 与已有属性合法性由同一个原 raw 实现判定，避免错误拒绝非扩展对象对已有可配置字段的合法重定义。不扩其它 Object 方法，不变原输入、容量或黄金。
- [ ] B：在既有 owned-binding 原完整 source fixture 加函数 length/普通已有字段重定义、flags 保留、不可配置不同值拒绝，独立固定预期与 JS 原输出一致；pure 与真实 source-operation complete 两图的 WASM/native 共用原回归接线。保留原 getter次序、false异常、Proxy、override、10000循环与全部原输出。
- [ ] C：`tools/backends/eliscript/managed-host-object-realm.eli` 原 `native-object-operation` 仅为 defineProperty 接受 kind18；`native-data-definition-p` 保留 descriptor prototype/纯own data字段检查，去掉 target 可扩展/own缺失两个不必要前置。其余原 raw 转发、frame/error恢复不变。
- [ ] D：父在同批全部源齐后集中生成与原完整三输出/受影响回归验收；诊断不是通过证据，不将此前失败改写为通过。unsigned handle 提示未在本轮现场成立，不做无关修复。

C58 P05 本项施工收口：
- [x] B：`managed-project-zero-imports.eli` 的原完整 source fixture 新增 `owned-native-function-report` 并纳入原 pure/complete、WASM/native 循环。独立固定预期 `[true,2,7,7,false,false,true,2,true,true,true,false,"TypeError"]` 检查已有函数 length、原参数调用、长度属性 flags、原已有普通字段 flags、不允许改变不可配置字段；独立 JS 参考与两图比较均已接线。原所有 source/golden/负预算不变。
- [x] C：defineProperty 分支允许 kind18，纯 data descriptor 检查保留，目标已有属性/可扩展性原前置移除，交原 raw descriptor normalize/merge 与 kind18 写入路径。未改 managed-host.eli/其它方法/legacy JS，未改另一协作者的 managed-host 回归。
- [ ] D：本修复源码全部写齐，父统一生成后验收。独立诊断的 stderr/峰值与原失败均保留，未将诊断截断或 narrow case 作为正式三输出通过。

### C58 P05：数组方法选择及稀疏读取越过真实 foreign 原型

- [x] A 真实基线：`fb98a50` 的原完整 `original-program:formatter-node`，原三模块源码、原 hostEval/参数、131072 slots/8 MiB initial/64 MiB max/auto65536 与黄金保持不变。原失败及最小 ABI 重放均为 `ELI-RT0003`；callee kind18/code66、tuple kind7/length2/count2 合法。只读 inspector 在原 WASM `fail(code)` 断点取得首次 bounds 栈：`heap-array-prototype-owner` → `heap-legacy-array-callback-builtin` → `value-array-callback-builtin`。当前祖先 `1048649` 的实际 kind=35，不是无效句柄。持久原收据见 `_worktree/evidence/goal-0.0.2/c58-formatter-{original-abi-diagnostic,fail-local-values}.log`；无产物改写或黄金变更。
- [x] A 当前/目标源码树（只有标记处施工）：`bootstrap/runtime/memory.eli` L2093 `heap-array-inherited-index`、L2108 `heap-array-prototype-owner`、L2147 `heap-source-array-read`；`tests/eliscript/managed-host.eli` L508 `canonical-source`、L562 `canonical-api`、L575 `exercise-canonical`。不修改宿主原型替身、legacy JS、ABI 或声明字段。

```mermaid
flowchart LR
  A["formatter array includes"] --> B["value-array-callback-builtin"]
  B --> C["旧 owner 只接 kind13/14 → foreign35 fail3"]
  B --> D["改：遇 foreign35 返回真实边界"]
  D --> E["原通用 Get / Call 保 receiver、getter、参数及异常顺序"]
  F["稀疏索引读取"] --> G["改：foreign 边界按读值 Get 或存在性 Has 分流"]
```

- [x] A 精确施工：owner 保 `(heap value key) -> word`，普通对象沿原 `heap-object-get-owner` 找实际 exotic/foreign 边界，kind35 停止且保原句柄；非法其它 kind 仍 fail3。named array Get 对 owner 使用已有 `value-source-get-with-receiver(heap,owner,name,value)`，不偷换为祖先 receiver。inherited-index 保 `(heap prototype index read receiver) -> word` 和私有缺项哨兵4；遇 kind35 才新建4槽借用 frame 根住 current/receiver/key。`read=1` 只执行原 Get，禁止额外 Has；存在性分支只执行原 `heap-source-reflection-has`，真返回3、假保4；原首错经 `heap-frame-result` 恢复。owned 快路径不新增分配，闲置 splice helper 不改。
- [x] B：沿原 canonical fixture 增数组 includes/concat/join 和 foreign 自定义原型方法、named getter、借用 owned join/map 的稀疏索引场景。现有独立 JS 参考、真实 WASM/native、auto1、二次 GC、原 close/live/frameDepth 门禁共用同一份 Eli。固定结果、getter receiver 身份、Get→参数→Call 次序、false/undefined 原抛值、非 callable 在参数之后拒绝，以及 map Has/holes 与 join 无多余 Has 均显式断言；未运行。
- [x] C：已完成上述 memory 三处及 B 的维护 Eli 接线；不重编正式产物、不跑修复测试、不提交，交父同批统一 D。`heap-array-inherited-index` 的 foreign 分支只在实际越界时借4槽frame；读值直达 Get，存在性才 Has，最后原首错恢复。`heap-array-prototype-owner` 保实际foreign边界，named Get 保原array receiver。其余原型身份与公开参数验证保留；闲置 splice helper 不改。
- [ ] D：新四阶段固定点、原完整 formatter source/host/golden 三输出及上述 canonical 原整例均真实通过才关闭；本次断点和局部诊断不是验收通过。

### C58 P05/A07：fuzz 当前发射字节、独立全发射与历史摘要分开证明

A 现状与施工位置：`tests/reader-program-fuzz.test.mjs` 保留100000输入/50000 program、原320000ms测试与300000ms子进程、四个合法/运行时结构和不可变写入否例，但 compiler.resultDigest 历史固定值 b31… 与新增默认Unicode import后的真实输出摘要不同。`tools/fuzz/reader-program-fuzz.eli` 继续复用原完整reader verifier及确定性generator，不修改其 resultDigest 定义。legacy corpus adapter以旧test marker抽原helper/body，需要保旧字节archive并明确迁入新维护host，不能修改旧JS模板。

施工树与流程：原 test JS → 原字节 `reader-program-fuzz-test-legacy.mjs`（历史断言/regions保留）；新 `tests/eliscript/reader-program-fuzz.eli` → ignored canonical test。新 `tools/fuzz/program-emission-proof.eli` 与 `tools/fuzz/program-emission-oracle.el`：同完整program输入 → 独立Emacs逐项真实输出/结构化错误NDJSON → selected compiler逐项全bytes/错误比较 → 当前原义摘要与精确移除单行Unicode import的历史摘要。新 `tools/fuzz/reader-program-acceptance.eli` 维护原全部断言与四结构证明；固定Eli Node helper读取JSON数据并实际执行两个编译器的产物，不写JS模板。新Eli corpus host复用同一验收入口，选最终实际compiler directory；corpus维护接线保原archive/regions/coverage并记录新源/输出/El oracle资产。

- [x] A：结果层严格分开：真实 compiler.resultDigest保持完整当前JS字节语义；独立Emacs每条完整输出必须相同、全部拒绝诊断必须相同；历史摘要只允许恰好撤销一行 `import "eliscript/runtime/unicode-case.mjs";`，其余字节和全部error摘要不变，完整固定语料仍要求原 b31c1f4546e42b3501fcc8a97403b171a6d3bb0ba8976bbe8bf305a235db7024。不把fcaef测量值直接写入golden。
- [ ] B：迁移原100000全部reader断言/50000完整program计数与否例/所有摘要/原timeout；保原四结构Seed全JS/maps与Node运行的独立预期，新增完整program逐项独立发射证明与历史b31摘要；保archive来源和原coverage。
- [ ] C：维护Eli/El实现与所有tool/test/helper mapping、ignore及corpus唯一hook一次写齐。无手写JS，无改旧archive，不缩原语料、不吞Unicode行后冒称原resultDigest。
- [ ] D：父同批集中生成并执行原完整100000验收、corpus真实最终编译器与三输出门禁；若精确单行撤销不能恢复b31，保失败并调查其它字节变化，不改golden。

C58 fuzz 接线澄清（以此为准）：父确认 corpus post-hook ownership 后，原 JS test 按原坐标、原字节只读保留为历史断言输入（SHA256 d53a6fab62d6ca7f9a58ae56265149d1a8b51ce4b53080da018724a29ce52b6d）；不执行它的旧固定当前摘要断言，不搬旧文本，避免legacy抽取在post-hook前失败。新维护测试命名 `tests/eliscript/reader-program-fuzz-acceptance.eli` → `tests/reader-program-fuzz-acceptance-selfhosted.test.mjs`，替换Make原执行位置，全部旧行为与golden在Eli中真实保持/区分。新增 `transportOriginalFuzzCorpus(document, options)` 仅替换唯一fuzz record执行host，父负责主corpus唯一import/调用，原metadata/coverage/regions不动并追加维护资产证据。

### C59 / P06、A06–A07：项目 runtime scope 不遮蔽真实会话依赖

A：C58 三输出实际 `original-program:compiler-persistent-evaluation` 与
`compiler-source-debugging` 在 EvaluationSession.compileProject 后载入失败。
原 session.create 已在 session.directory/node_modules/eliscript 链接真实
完整源码包；但 C58 facade 又在 namespace outDir 放只导出 3 capsules 的新包，
遮蔽父 scope。原 main.eli 的持久向量经真实 emitter 注入
eliscript/runtime/literals.mjs（以及 collection/value 边界），这些不在窄包
exports 中。原项目 5 B 仅覆盖数字项目，未覆盖该输入；不重写 EvaluationSession，
不复制完整 runtime 造成协议/构造器身份分裂，不删除默认 Unicode import。

改动限定 tools/project/project.eli：先认证既有全部 runtime source/module/map
并保留原目录 symlink/冲突预检；只有 outDir/node_modules/eliscript 不存在时，
使用真实 createRequire(outDir 内位置).resolve 对 3 capsules 的 module/map
逐项解析，要求实际 realpath 与本 compiler source-root 同一真实文件，才复用
原已有包路由而不创建遮蔽包。无该原包或任一坐标不符，仍执行 C58 原严格
独立部署，不能凭相同内容的另一 URL 或 package name 复用。已有本地 symlink
仍拒绝，不用此路由分支放行。

B：保留原 5 项与全部原套件；新增同会话父完整包＋持久向量 count=2 的
独立 Node/Bun 真执行、父包原字节及无子遮蔽包；新增原真实
EvaluationSession.load main.eli 的 [1 1]→bump 2→[2 1] 与清理；新增另一
实体 URL 即使 3 对文件字节完全相同也不可复用、仍须独立部署的否例。
C：源码与 B 一次齐，不生成/运行；D 由父集中验证并重放原两个 complete
records，不以此新增短用例替代原输入/黄金/全部阶段。

C59 本族 A/B/C 已齐，D 待统一：唯一生产 hunk 是上述真实父 package
坐标复用，不改 EvaluationSession/旧 adapter 或原 complete records。
bootstrap-project-runtime 新增 3 项，原 5 项和原 suite 全部保留。
同一输出已有局部 package、symlink、冲突及硬链接仍走原严格拒绝/部署，
父路径复用要求 6 个实际 module/map realpath 均为本源码包，绝不按字节相等
推断协议身份。未生成、未执行测试或构建，当前三输出现场不改写。

### C59 A07：完整浏览器 search/symbol 回归的真实运行时部署

- [x] A：原 CI 的 search/symbol suite 将正式 emitter 字节直接放入 data/blob URL，缺少默认 Unicode import 的解析环境；原 JavaScript 字节不删除依赖、不替换黄金。保留旧 suite 原字节 archive，完整测试迁 Eli，canonical 原路径只作 ignored 生成产物。
- [x] A：共享 `tests/eliscript/managed-browser-transport.eli` 只提供真实文件 Node reference 和 HTTP browser page/oracle/Unicode module。search 的主 suite、原 Node 循环、原浏览器循环分别维护为 `managed-array-search.eli`、`managed-array-search-node.eli`、`managed-array-search-page.eli`；静态 page 通过 alias 连接当前真实 compiler/managed backend，Playwright 调固定全局入口，不写 JS 模板。保留原11项标题、所有稀疏随机输入/种子、异常/资源否例、全部三代IR/descriptor/binary相等与30/120秒门槛。
- [ ] B/C：上述完整维护源码及 bootstrap/ignore 接线全部写齐；Node/browser 引用真实 runtime，不将 bundle 当 emitter 原字节证据。
- [ ] D：父在所有同批 C 齐后集中生成、原全部 suites 和原六文件 browser/platform 矩阵验收；历史 CI 失败原样保留。

C58 fuzz 本批源码施工收口（D待执行）：
- [x] B：新维护 fuzz acceptance 测试保原100000/50000原计数、全部reader摘要/语料摘要/格式及容量断言、原320000ms测试和300000ms子命令限制；历史b31只验证单独兼容摘要，当前摘要必须等于全部program独立Emacs完整字节/诊断摘要。新增精确单行撤销的缺失/重复/不同引号拒绝、真实资产corpus迁移正例/篡改原hash拒绝，保其它record/module/coverage/regions/expected身份。四结构的原Seed完整JS/maps、immutable写入否例精确diagnostic、Node实际值/NaN/-0/活绑定预期全部迁入Eli维护入口。
- [x] C：新增5个维护Eli fuzz工具（完整发射proof、Node执行、完整acceptance、fuzz child host、corpus host）和一个独立Emacs流式oracle；原fuzz facade仍用原完整generator/reader/formatter/diagnostics verifier，追加独立program proof且不改真实resultDigest。新corpus adapter仅替换一个record真实host字节，绑定所有新增源/产物/oracle真实assets，检查原只读test SHA与原region；父已接主corpus唯一hook。bootstrap mapping、generated ignore与Make原位置的新维护测试已接，不生成、不跑测试。
- [ ] D：父统一生成后先集中语法/接线，再原完整100000验收与原corpus/final stage3三输出；当前仍没有新历史摘要通过证据，不能声称变化只有Unicode行。

### C59 P05：构造器品牌登记前的 native defineProperties/freeze 不得发布普通缓存身份

A 基线与真实现场：`fb98a50` 加当前未提交 C58 修复；C58 原完整 WASM
tree-walk/declarative-record 在 legacy `decode`→provider.create(record) 报
invalid persistent record type。`stdlib/managed-runtime-record.eli:153–165`
依次对 RecordValue 执行 Object.defineProperties、Object.freeze，最后才
record-types.add；`managed-runtime-type.eli:184–189` 同样最后才写 type-states。
legacy decode 在 literal-kind 前先读 sourceCache，故品牌登记前被 Object
物化的普通 SourceView 后来不能冒充已登记的主机 RecordType。不得改黄金、
从缓存猜品牌、替换已公开函数身份或接受假的 record/type。

当前/目标源码树：`tools/backends/eliscript/managed-host-object-provider.eli`
L10 的3方法原生身份表扩为4方法，新增真实 defineProperties；同目录
`managed-host-object-realm.eli:58 native-object-operation` 保真实 callee-token、
owner 和完整参数数，freeze/defineProperties 对 owned kind18 与原 ordinary
13/14 接通原 raw 语义；defineProperties 第二参数只接 ordinary owned 13/14
属性包，foreign/Proxy/namespace 保旧 handler。原 defineProperty 数据描述符
guard 和前批已有字段支持原样保留。`call-native-object-operation:86` 将原
两参数 tuple 直接交 `value-object-meta-builtin(heap,tuple,2,1)`；freeze 仍为
`value-object-integrity(heap,value,0)`。原 frame 及 first error/class 恢复不变。

```mermaid
flowchart LR
  A["record/type 构造中的 owned 函数"] --> B["真实 Object.defineProperties / freeze"]
  B --> C["旧：host decode → 普通 SourceView cache → 晚登记品牌失配"]
  B --> D["改：认证原生callee → 原raw描述符收集/规范化/应用或freeze"]
  D --> E["原代码最后登记品牌 → 首次外部decode得到真实materialized类型"]
```

- [x] A：先复用原 raw DefineProperties 的全部描述符预收集与顺序应用，
  不把“只读数据描述符”条件套到新方法，否则 record 原 accessor 声明
  仍回旧递归编码路径。owned 属性包自身的 getter、描述符 getter 与
  false/undefined 首错均由原 raw 算法执行；外部Proxy完整保留原fallback。
- [x] B：扩既有 managed-host canonical 同源 JS/WASM/native 用例（只编写，未运行）：
  构造 owned 函数的 data/accessor 批量定义、读取顺序、返回身份、freeze
  flags/原参数调用；第二描述符 getter 抛 false/undefined 时前属性尚未应用；
  后续不可配置属性拒绝时前属性已真实应用；用户覆盖仍调用真实覆盖函数。
  保原auto1、GC、close/live/frame门槛；原 tree/declarative完整程序仍需重放。
- [x] C：上述2维护生产模块与维护Eli回归已全部写齐，未运行构建、测试或新探针。
  4方法的原native callee身份仍为实际token，freeze/defineProperties新增owned
  function分支，其它foreign/namespace/Proxy继续fallback。原defineProperty
  的前批字段与getterguard未回滚。新增preparedFunction、两阶段失败、原生
  函数Proxy覆盖用例共用原canonical全部target与清理，未降低原资源门槛。
- [ ] D：父统一生成、完整固定点及原完整三输出。map-patterns、zipper、
  interop/js、wire 的原失败各自保留；无原raw位置证据不猜改memory或关闭
  规则，不因本修复存在就提前声称上述原程序全部已修复。

### C59 / P05、A07：原 nth phased 用例接入实际 module graph

A 现状：`tests/eliscript/managed-literal-nth-node.eli` 的 `main`（基线247）
与 `tests/eliscript/literal-runtime.eli` 的原 nth case（基线380–494）直接
实例化 phased 项目并调用 raw `runtime.project.prepare/run`。真实 source-operation
绑定通知需要 `options.moduleGraph`，此接线遗漏使原例在 prepare 报图不可用。
生产加载器已有真实 graph 合同，不改 runtime 或编译器。

源码树保持两文件：nth helper 新增 `createNthRuntimeOptions(descriptor)`，返回
原冻结 small budget 的逐字段副本及每实例独立的 `moduleGraph`、其真实
`hostModules`；`exerciseNth(runtime, reference, descriptor, graph)` 经实际
`graph.prepare/step` 顺序执行原 descriptor 全部步骤；
`finishNth(runtime, primaryFailed, graph)` 在原 closeModule 后关闭图，再保留
collect/live=0/frameDepth=0/close 清理及首错优先。Node、Bun WASM、native
分别创建配置；WASM 显式 attach，native 沿现有 loader attach 合同。

前后流程：原 fixture→lower phased→无图 runtime→raw prepare（失败）；
目标为同 fixture→同 lower/预算/bytes→独立 graph+runtime→attach→graph prepare
及全部原 steps→全部原 nth 输出、异常、身份和 GC 断言→关闭 runtime 与 graph。

- [x] A：范围限定上述两文件与本段，不改原 fixture、黄金、容量、timeout、Node/Bun/native 平台或原五个 literal cases。
- [x] B：在原 nth 完整例增加真实 graph 的 descriptor/attached/closed 合同断言，配置逐字段保持原预算，清理后必须 closed；原所有行为断言完整保留，不运行。
- [x] C：统一接齐三实例的配置、prepare/step 与失败清理；构造失败也关闭已创建 graph，不用模拟图或吞异常。两维护 Eli 源已齐，未生成、未运行测试，父统一 D。
- [ ] D：父同批生成后统一运行原完整 literal suite 与 final stage3 原三输出；源码施工完成不代表此项已通过。

### C59 / A07：Symbol 与 array-search 原完整 browser suite 的真实 runtime 路由

A：真实 Browser CI 的 Symbol 冷 Node oracle 使用 data URL、两个 browser
用例使用 blob URL，缺少默认 Unicode runtime 的真实 package/importmap 基址。
不能删除默认 import 或只保 WASM。原两 JS suite 按原字节归档只读；维护
`managed-symbols.eli`、`managed-array-search.eli` 生成原 canonical 测试名，
Make/CI 原六文件名及 renderer 合同不变。两 suite 分工仅共享实际 transport。

目标源码树：两维护 suite＋各自维护 Node/page Eli helper；共享
`managed-browser-transport.eli`→`tests/helpers/managed-browser-transport.mjs`。
Node oracle 的原完整 emitter 字节写入项目 owned 目录，真实完整源码包 symlink
提供 package 依赖；维护 Node helper 读取实际文件，不再手写 JS 脚本。
browser 静态维护 Eli page 经 Bun bundle，真实 HTTP `/oracle.mjs` 原完整 emitter
字节和两份 `/runtime/unicode-case*.mjs` 实际模块，HTML importmap 定位依赖。
bundle/compiler/backend 的选择坐标单独传输，原 Seed 字节及三代产物比较不变。

Symbol 基线：原322行、全部原 case 标题/参数/独立黄金/全部 raw ABI 否例、
三代 compiler/map 文件、Node 与三种 browser 选择及 timeout 均迁维护 Eli。
只读 archive 是原 fixture 字符串及标题的真实输入来源，绑定完整原 SHA，
绝不执行旧 JS 或从旧 JS 复制执行模板。

- [x] A：精确范围为两个真实 CI 失败同族 suite、维护 Node/page、最小真实 transport、mapping/ignore；不变语义和容量。
- [x] B：Symbol 原35项以原完整 literal 标题直接注册，全部参数、黄金、raw ABI/容量拒绝与恢复、三代完整 compiler/maps、独立 Node 和真实 browser 测试已写入维护 Eli；静态 Node/page helper 保原执行逻辑与10000/30000/120000ms等原 timeout。array-search 同批独立迁入，不减少原用例。
- [x] C：共享真实 file/package/HTTP transport、Symbol 维护 suite/Node/page 与窄 mapping/ignore 已齐；原 Symbol JS 原字节 archive SHA256 fe0fd09cd43e80b01617570dc7913d3a0bd006f8c0a7f0a945de3072a3efdbc6。archive 只读绑定并提供原 Eliscript fixture 字符串，不执行旧JS。默认 Unicode import 完整保留；原当前 emitter bytes 单独相等证明后再通过实际文件/HTTP运行，不混淆 transport 与发射字节。array-search 由并行施工同步写齐；本分工未生成或运行。
- [ ] D：父统一构建后原两完整 suite、Node 与 browser CI 三宿主真实运行全部通过才关闭，迁移不替代原验收。

C59 统一 D 首次生成后的本族集中语法修复：保留首次失败日志，不重启同源。
修复 fuzz acceptance 的 compiler-directory let / finally 归属、fuzz corpus hook
外层闭合、shared file transport 的 writeReference 闭合及 Symbol 两个测试循环
多余闭合。授权的一次受控四文件编译收集见
`_worktree/evidence/goal-0.0.2/c59-host-owned-syntax.log`：corpus hook、transport、
Symbol 三份成功生成；acceptance 报 finally 归属后已按其真实 let 层级修正，
未再局部复编或跑行为测试，交父统一重建。全部原断言及失败证据保留。

### C59 D 同批：browser 诊断宿主缺失与独立 fuzz 原初 reader 定位

A：原 Symbol 35项34通过，唯一 browser 在 `managed-host.eli` 的
`managedHostInvokeDiagnosticExports`（基线83）直接读 `process.env` 时失败；
共享HTTP/Unicode路由已实际载入。仅将诊断开关对缺少process/env短路，
不开启诊断时保原 exports 身份及不读任何 export，启用分支完全保留。

完整 fuzz 的50022输入揭示原初reader真实缺陷：
`compiler/eliscript-reader.el` 的 located reader先调用Emacs整顶层
`read-from-string`，嵌套非法dispatch导致仍在顶层point，报告1:1及Emacs私有
radix消息；正式reader准确报告实际`#x`位置。旧100000 verifier 对reader
失败只比较status，并未证明错误全文一致，不能以其 seedAgreements 当作
忽略差异的依据。利用现有递归location scanner，仅在原初reader已产生
invalid-read-syntax时探测真实非法dispatch起点；普通成功读取/接受集合不改。
同一既有诊断函数在真实起点生成前缀消息和一字符span，独立oracle继续
直接调用实际Emacs编译器，逐条完整错误/结构化诊断比较不变，不在报告层改写。

- [x] A：最小变更为诊断开关短路、原初reader失败定位及相邻维护Eli/ERT回归；不降黄金、语料、容量、时限。
- [x] B：新增process/env缺失与首错/身份回归；新增顶层/多层/字符串与注释中伪`#x`跳过、Unicode字符坐标、前置正常`#x2a`、多个非法dispatch首错及既有成功radix读取不变的ERT。旧35项、完整50000独立发射与100000reader原断言保留，不运行。
- [x] C：上述生产能力全部写齐并冻结。仅已发生invalid-read-syntax时复用原递归location scanner定位实际非法dispatch，先前正常numeric dispatch仍按真实Emacs读取跳过；正常解析分支无新拒绝。browser诊断安全短路保显式启用分支和原exports身份。交父同批集中D，不局部行为测试。
- [ ] D：父统一重建后两原完整browser suite及原100000/50000独立完整验收真实通过才关闭。

同批完整差异收集：原 full-emission proof 遇首个比较assert立即退出，不能用于
一次收齐所有原初reader差异。现保原每条strict message/full diagnostic/full JS
字节断言，将比较失败逐条流式记录并继续剩余原50000输入；最终任一差异仍
严格失败。仅首次差异时创建 ignored evidence 下唯一NDJSON，记录每条index、
filename、原source、两侧完整结果/diagnostic；stdout至多8个索引样本及真实
完整证据路径。实际、独立oracle摘要各自用自身完整结果计算，历史兼容摘要
仍仅撤销精确Unicode行；其合同失效也记录并使最终失败，不伪造可用摘要。
成功路径不创建差异文件，不缩原输入或改变任何时限/黄金。该收集机制已写齐，
行为验收仍等待父统一D；未运行新的full proof。

### C60 D 原完整 suite：RegExp split 循环边界与 Array.from 默认字符串迭代

A：原 text 固定点实际split结果夹入每轮剩余suffix且超过8项。
`bootstrap/runtime/memory.eli:heap-regexp-split-fill` 的while和其内部when在
末尾残片append之前未关闭；尾片和结果赋值被误放循环体。只将两闭合移到
循环末尾，尾片按原done/last-error条件仅处理一次，空输入/limit0也返回实际array。

原Array.from Unicode/fixedseed/Node失败走新版 `value-array-prototype-static`，
无条件读取字符串@@iterator，而未观察String构造器时 `value-text-get` 明确拒绝
该尚未暴露的默认成员；旧共享iterator已有type3字符串codepoint实现。
新版static仅在没有真实String构造器和暴露iterator key时选择此已有默认路径，
仍保GetMethod→构造结果→调用/获取iterator的可观察顺序；实际原型覆盖/异常不绕过。
两个shadow nullish receiver失败来自源Get走own-descriptor的raw invalidhandle；
源Get边界对合法nullish接收者遵循既有language TypeError1合同，非法raw handle
仍按1拒绝但没有language TypeError类别；原Symbol同一合同断言保留。

源码树新增维护 `wasm-managed-regexp-split.eli` 与
`wasm-managed-array-construction-regressions.eli`，各生成selfhosted测试；
只补bootstrap/ignore/Make窄接线。生产只改本段三个已证实memory函数，不改后端。
原128slots module_init提前耗尽已由真实原资源诊断证明是Array静态取值提前
注册六个iterator callable；由后端负责人移除该无关提前注册，按需路径保留。
证据为 `c60-construction-init-diagnostic-arity.log`，不是增大容量；
旧trap注入只命中不再被新版静态Array.from调用的legacy ABI，归原测试迁移接线，
不能倒退生产到旧ABI。完整原case/黄金均保留。

- [x] A：以上真实根因和最小函数范围已明确；其余已收集失败分交对应所有者。
- [x] B：写齐原8项capture独立黄金、无匹配/末尾/空输入/limit0/零宽Unicode共18行，真实WASM/native分别执行；写齐默认字符串codepoint/孤立代理、先前String.prototype iterator覆盖及nullish覆盖、nullish callee先于参数效果、raw非法handle优先及caller GC根4个回归测试，不运行。
- [x] C：memory三个对应实现及新增测试生成接线一次写齐，未编译、未运行修复测试；与后端小资源修复同批冻结交父统一D。
- [ ] D：父统一重建并验收新增用例与原完整text/Array.from/Object suite；未解决128slots和其他原失败前不声称整套通过。

### C59 / P06、A06–A07：完整 bit 验收的运行依赖与 Eli 承载

A：C58 原 `compiler-stdlib-bit-complete` 在真正 Seed bit-usage.mjs 执行时
因默认 Unicode import 没有 package scope 失败。原 tests/stdlib-bit.test.mjs
为完整只读历史断言源，SHA256 为
c550405d71455b5ce694c929b63b6a0843ea637f5b35ccf221afd5780ce16771。
保持旧源码原字节，让 legacy recipe 仍按原 markers/regions/原身份生成；维护
`tools/testing/stdlib-bit.eli` 实现原整例，正常 Bun 测试与 corpus host 共用，
只在自己 mkdtemp 创建的新根下链接真实源码包。原 Seed/portable 两编译路径、
bit+usage 原输入、完整 JS/maps 字节相等、2 compiler×Node/Bun 四次原 host
黄金、sourcesContent/mappings 断言及原 30000ms 不变。

施工树：新 tests/eliscript/stdlib-bit.eli → ignored
`tests/stdlib-bit-selfhosted.test.mjs`，替换 Make 原执行位置；新
`tools/testing/stdlib-bit.eli` → `tools/testing/stdlib-bit.mjs`；新
`tools/testing/stdlib-bit-corpus-host.eli` → 对应真实 host；新
`tools/backends/eliscript/compiler-corpus-bit.eli` → compiler-corpus-bit.mjs。
新 corpus post-hook 只替换唯一 bit record 的 hostSource，保 modules/request/
coverage/original source hash/regions/expected/timeout 全部原义；绑定维护源、
真实生成 host/入口、原 bit 源/usage/host/seed helper、package 与 Unicode/math
真实 source/module/map 的资产。父拥有 compiler-corpus.eli 唯一 import/call。
corpus setup 只将已有真正 selected 与 independent-reference compiler directory
交给共同入口，不重新构建 target、不写 JS forwarding 模板，不把 selected
替代 reference；普通套件仍运行原 seedCompilerFixture。

B：原 30s 全整例用维护 Eli 直接调用同一个共享入口；补 post-hook 来源 SHA、
完整 region、所有原字段/其它 record 保持的正例，以及原 SHA/region/timeout/
重复 record/实际资产冲突否例。原 suite 只读保留，不把旧当前编译缺依赖当
被降低的输入。C 全部源/映射/ignore/Make/包与父 hook 齐后统一 D；本代理
不生成、不跑修复测试、不提交。sorted-core 原 JS Bun auto1 30s 暂仅静态归因，
不放宽时限，不把无直接调用关系的 managed runtime 修复宣称覆盖。

bit 本族 A/B/C 已齐、D待父统一：原 JS suite 字节未改；新增 4 份维护 Eli
（完整原整例 B＋两个来源否定组、共享验收、真实 corpus host、窄 transport），
对应 bootstrap 映射、generated ignore、Make 原 bit 执行位置与包文件已接。
父负责主 corpus 唯一 hook。新 host 不写 JS forwarding，直接使用执行器已
真实构建的 selected/reference 13模块目录；原普通测试仍调用真实 Emacs
seedCompilerFixture。不会因缺依赖缩减任何原编译/主机/源映射/黄金断言。

sorted-core 静态结论：C58 JS 四个 auto/host 变体产品身份完全相同，均为
`dc1a53298b94c9e33aebfc9e40d6aca07db5dd4bac1209090a63e763d6cd24a6`。
Bun auto65536（通过）与 auto1（外部原 30000ms 超时）的完整实际 host 文件
SHA256 也均为 `410ab25d578cdc5139d73679f492663690824d4f354a92f26f3a7da5945d636d`。
JS 分支直接调用真实 m 导出，没有 managed runtime，也不调用 auto；本批
managed prototype/brand 修复不能静态证明覆盖此超时。现存现场没有细阶段
时序，不能从同字节一个通过推断另一个应标通过。保留原失败、原 30s；
父统一最终同参数验收再判，不新增补丁、不重复运行本原 host。

### C59 / P06、A06–A07：array-search 维护源生成入口

本族 B/C 接线（未生成、未验收）：原主 suite 路径继续为
`tests/wasm-managed-array-search.test.mjs`，原字节历史源保留为
`tests/wasm-managed-array-search-test-legacy.mjs`，其取消 tracked 由父已完成。
维护 `tests/eliscript/managed-array-search.eli` 发射回原主 suite；独立
`managed-array-search-{node,page,abi}.eli` 各发射至
`tests/helpers/managed-array-search-{node,page,abi}.mjs`，四项均已加入
`bootstrap.el` 原 tests 组。四个 canonical module/map 及项目根
`.eliscript-array-search-*/` 已 ignored，不提交任何生成物。
主 suite/Node/page 由父实现、独立 ABI 由协作者实现；本代理只完成接口接线，
不把 mapping 完成记为实现/验收通过。symbols 与共享 browser transport 的
源码/入口由其负责人维护，本族不修改。原全部断言、真实两浏览器、Node 和
ABI 用例待全批 C 齐后父统一生成与 D，不提前局部执行。

### C59 / P06、A06–A07：array-search 原 ABI 两项边界用例迁 Eli

A：只读原 `wasm-managed-array-search-test-legacy.mjs:38–46` 两项完整测试，
迁到 `tests/eliscript/managed-array-search-abi.eli`，生成位置为已接线、已
ignored 的 `tests/helpers/managed-array-search-abi.mjs`。唯一导出
`registerOriginalArraySearchAbi(context)` 在注册时保存 context 函数；每项
异步用例执行时调用 context 获取 `{compiled,array,run,finish,fixture,b}`，
保持 beforeAll 完成后才读取当前 backend。主 suite 及其它 helper 不修改。

B：第一项保留 fixture("invalid") 全源、四个 null/undefined/false/true
receiver、JS 独立 TypeError 黄金、visited 副作用、ELI-RT0003、caller frame
深度 1 和完整释放；原 memory 源唯一 heap-array-search 函数替换为相同 Eli
load-u32 trap，保真实 WebAssembly.RuntimeError、visited 与 caller root。
第二项保留原 heap-new(32,8192,8192)、九组 raw 否例全部参数/首错码，frame
身份、最多 64 次 pin 至槽耗尽、空数组跳过转换、ELI-RT0002、释放后恢复、
稀疏 hole 原值 4、最终 frame pop/collect/live 0。无输入/容量/黄金缩减。

- [x] A：精确文件、接口、生成接线和全部原断言范围已列明。
- [x] B：两项原测试完整迁入维护 Eli，不运行。
- [x] C：helper 独立导出与 context 接口写齐，不生成。
- [ ] D：父统一生成与原完整 array-search suite 验收；本项不提前运行。

### C59 D 接续：C58 完整三输出的实际中止与同批修复

- [x] C58 `check-stage3-targets` 的原执行日志末尾明确为执行器写自身状态时 `Errno 28`，不是新增总时限或 RSS 超额。原会话已不存在，当前进程表无该任务；保留日志和全部原收据，不手工把 still-constructing 收据改成终态或通过。
- [x] 中止时 JS 留存700条、WASM578条、native549条；不同结果分别6、10、3条。这些是部分记录，均不代表整路验收。新增仍需真实复验的族包括 record/type 构造器过早物化、nth phased graph 接线、bit 独立单文件 runtime 部署，以及原JS sorted-core Bun auto1的30秒超时。
- [x] 旧取消任务中归属明确的可重建生成缓存已清理，源码、Eli输入、历史失败与身份收据保留；那些旧目录不再可独立重放旧产品。当前C58和正式源码未删，不把空间回收当作功能验收。
- [ ] C59 同批 C 全部写齐后统一生成与受影响验收，保留上述未证明解决的失败；完整三输出必须使用新冻结stage3与完整有效原语料，不能拼接旧候选的部分成功结果。

C59 search 主实现已写齐（D未运行）：原11项中9项在维护主suite、2项在独立ABI helper。
主suite保原三代正式源码全IR/lowered/bytes与Seed JS比较，原Node128组与浏览器64组固定随机种子、
全部fromIndex/holes/NaN/-0/Unicode/identity输入与断言。五个原内嵌Eli场景迁为真实 .eli fixtures。
浏览器page静态导入HTTP /oracle.mjs，在执行前断言浏览器现场 emit_ir_string 与服务器原始JS完整字节相同；
不通过JS模板/字符串回调构造宿主代码，不把Bun bundle或HTTP运输字节冒称compiler产物。
原suite原字节保留 -test-legacy，canonical已untrack；四维护源映射和ignore完成。

C59 原CI失败范围保持：Browser compatibility 的失败不止两个缺依赖入口；原完整日志还报告
array-construction/object-properties 的资源、callee及trap断言，以及 direct-wasm/backend
多个固定点与browser入口。以上原六文件完整门禁仍需执行，不能用本批search/symbol绿例替代。
当前先完整实现已确认的同族修复，统一D收集剩余实证；未证实修复的条目均保持未验收。

### C59 / P06、A06–A07：完整 browser suites 的真实迁移来源接线

A（实际入口与范围）：`compiler-corpus-managed-fixtures-legacy.mjs` 的 plans
约 L686/L693 只给 search/symbols 既有 fixture 添加静态观察；L639 replaySuites
及 L834 selectedSuites 仍直接执行两个 canonical 完整 Bun suite。matrix 的
originalManagedSuites 只有原六族，runtime/identity families 也没有这两族；
故不增加 matrix additionalLocators、requiredCoverage 或稳定 fixture ID。
旧 archive 不作为可执行 suite，不更换 sourceRoot、不冒充 canonical bytes。

在维护 `compiler-corpus-managed-fixtures.eli` 增加
`readOriginalManagedSuiteMigrations(options)`：通过同一 options.text/file 读取
两个明确的 -test-legacy 原字节文件，固定 SHA 并由原 registration reader
解析 search 11 项、symbols 35 项，原注册顺序、完整 span/byteSpan、case SHA、
标题和每项 deadline 全保留，显式 sourceFile 指向 archive。分别绑定实际
canonical main、维护 Eli、Node/page/ABI helper、共享 browser helper、对应
map 及 search 五个 Eli fixture；每份 proof 使用真实路径/bytes/SHA，map 的
sourcesContent 必须匹配实际维护源。绝不把历史 SHA 或 span 贴到新 main。

维护 wrapper 仅在 `original-managed-suite:complete-fixture-suites` 的 original
增加 `maintainedSuiteSources` 和合并 sourceAssets；其 modules/request/
execution/coverage/expected、完整 replay 的 suite 列表、时限和原 fixture IDs
原样保留。原 project-entry host 替换照常叠加，其他 records 不变。
bootstrap 原 source-map 参数条件仅额外包含这九个新维护测试输出，保证 map
是实际编译生成物。测试接入既有 source-archive 维护 suite，无新 JS。

B（先写不运行）：新增真实 source reader 正例，核对 archive 全 11/35 项各自
原 span/bytes/deadline，验证所有当前资产路径与 SHA、source/map 配对；新增
archive 改动、file/text 冲突、map 源错配、缺失 helper 的拒绝用例，实际 wrapper
完整 record 保持原 execution/coverage/suites。旧全部 source-archive 测试保留。

C 清单：维护 reader＋wrapper、B 用例、九个实际 source-map 参数接线；不改
legacy、matrix、compiler-corpus、原合同/报告、任何历史 hash 或生成物。
D 由父在全批 C 齐后统一生成及原完整 corpus / suites 验收，当前仍待执行。

C59 同族维护用例依赖闭包（A/B/C齐、D待执行）：`compiler-corpus-host-completion.eli`
的原真实ESM registry由当前compiler生成，默认Unicode import需要实际包解析。
其可丢弃fixture改在root下新建独立ignored目录，保原两次同URL真实import、异步门控、
false原异常、清理/重试及所有原断言，不伪造namespace或跳过实际ESM loader。

本窄批已完成 A/B/C，D 待父统一：reader 绑定真实 archive 全 11/35 项原坐标与
当前 8 份维护源/生成 module/map（共享 helper 在两条记录均有真实 proof），
并绑定 search 五个静态 Eli 场景及原两个基底 fixture。生成物 registrations
的标题/deadline 必须逐项匹配原档，任何缺项/重复均拒绝；完整 replay 的
execution、coverage、expected 不改。source-archive 原套件追加来源正例和
四类否例，不运行。bootstrap --source-map 增补的是 8 个输出（上述“九个”
包括已有 bootstrap-compiler 项，非 9 个新增输出）。matrix/requiredCoverage/
compiler-corpus/legacy 未修改，原稳定分母未增加。未生成、未测试、未审查。

C59 统一 D 首轮源修复（本族）：`check.eli` 的 Git NUL 分隔符改用真实
String.fromCharCode(0)，避免 JSON 字符串 reader 不接受 `\0`；保相同实际
分隔字符。source-archive 新来源正例补齐 await/调用闭合，否例补齐 test
闭合，原全部断言保留。一次受控收集本族十份维护源的编译结果，8 份通过，
另收集 checker 缺 node:timers 与 source-archive 缺真实 reader import，均已
补齐。日志 `c59-runtime-finish-source-compile.log`（独立进程树峰值约61MiB，
exit1，cleanup_complete=true）；未运行任何行为测试。补齐两 import 后交父
全批统一重建，不能把该日志写作最终通过。

C59 集中生成结果与真实来源接线：首次收集的括号、布尔值、NUL转义、缺import及
测试循环语法错误已成批修正，不删除断言。完整bootstrap随后exit0，所有stage及固定点成立，
仍需独立verify和实际三输出。原strict byte-compile与新增5个维护Elisp工具strict编译均exit0。
当前stable corpus生成准确拒绝fuzz/bit旧测试未被Make执行：manifest将这两份原字节文件明确
保为fixture来源，并追加实际执行的新维护Eli生成测试bun-test证据。原证据位置/标题/输入保留，
不把旧source声称为已执行；全部新要求加入实际门禁，历史acceptance合同/报告及hash不改。

### C59 / P06：canonical 原生 matcher 必须观察真实 Array own descriptors

统一 D 的 `c59-main-node-affected.log:375` 首错为 canonical 新增 arrayMethods
报告 `[<3 empty items>]`，独立 JS reference 已先通过，WASM exercise 在
首个报告比较处失败。生产 source-view 私有 decode 已明确采用 deferred：
`createManagedSourceView` target 为 `new Array(length)`，`refresh` 在私有
上下文不预读字段；每次 Proxy Get/own descriptor 仍读取实际 source。Node
原生 Array matcher 可绕过这些 trap 查看尚未镜像的 target slots。本批不
恢复递归 eager decode，也不把这个显示结果宣称为生成程序运算失败。

A：只改 `tests/eliscript/managed-host.eli` 新 canonical 报告断言。新增
`canonical-array-report(value)` 只接受/递归 Array 报告，完整取得真实
`Object.getOwnPropertyDescriptors`，保 length、所有 own keys、hole、flags、
accessor descriptor；把确实存在的 Array data child 递归搬到普通 Array
供原 Node matcher 观察。非 Array 值直接保持 identity；外部 receiver、
getter、首错、真实调用全部保留原 view。独立黄金内容不改，不过滤字段。

- [x] A：精确故障与承载边界静态归因，生产 runtime 不修改。
- [x] B：补同样 deferred source Array 的报告观察回归，含嵌套值、hole、own key、flags；原 JS/WASM/native 全黄金保留，不运行。
- [x] C：报告观察函数及新增 canonical arrayMethods/preparedFunction/collection-failure/application-failure/inheritedMap 同族接线齐全。
- [ ] D：父统一生成并重跑完整 Node 组与原真实三输出；本代理不局部行为试跑。

C59 D 同批根因修复：checker 动态 field 调用统一使用实际 JS 字符串键，缺省
fallback 为 undefined，capture 省略环境使用真实 process.env；bit 入口以
&rest 区分省略/undefined 和显式 null，不让 omitted 变为 Eli nil。独立
Emacs 认证保完整 module/map 字节比较：真实 stdout 中首处非ASCII“虚拟😀”
在 offset22796 出现非法 UTF8，源于最外层 json-serialize 的 unibyte UTF8
直接 princ；按现有 source-map codec 在输出前解码，生成坐标不改。

migrations 原档固定 SHA 与全部 case spans 仍用原 reader；当前实现登记从
真实维护 Eli reader 的 test forms 读取 title/deadline，再与原11/35项匹配，
不拿生成JS结构作源语言。实际 canonical/module/map 仍逐份绑定。完整replay
产生后再附加此元数据，保持原 malformed-template 首个 TypeError，不提前
读取 mock 未声明资产。原 fixture/完整suite/时限/coverage 均不改。
项目 runtime 正例使用语言实际支持的 length 检查持久向量长度，保 count=2
预期及真实 Node/Bun、父包不被遮蔽的全部断言。新增B保 helper 自身漏tracked
必须拒绝，现有 Unicode fixture 的完整字节正例仍是认证主断言。

本族该修复批次 B/C 已齐：field 实参字符串化、默认值修正、Emacs UTF8 stdout
解码、bit omitted 参数、project 持久向量 length、真实 Eli registration reader
及完整 replay 成功后才附 provenance 全部写齐。新增 compiler helper 漏tracked
拒绝用例保严格来源；source archive 原 negative 首错恢复。历史 JS、合同、
报告、黄金和既有 deadline 均未修改。接下来仅做已授权真实全bytes首差异
诊断，然后交父统一生成/行为验收，不提前运行行为测试。

### C60 / P06：array-search mutation 原清理顺序与独立注册修复

D 的 `c60-main-browser-repairs.log` 原 11 项中 10 项通过，真实 browser
已通过；mutation 首调用 ELI-RT0003。生成主 suite:516 显示源括号把
`finish(a)` 放成外层 `forEach` 的 thisArg，因调用参数先求值，在任何
callback 前关闭整个模块；后续三项 test 也因同处未闭合成为 test 参数。
不是 search 算法证据，不修改 runtime。原 mutations fixture 仍含相同
length snapshot、push、index mutation、valueOf 与独立 JS reference。

- [x] A：从 mutation 到尾部四项 test 完整修正词法边界；每个 finish 只在该项全部循环结束后执行，所有 test 独立注册；identity lone-surrogate 保原输入而非双转义文本。
- [x] B：保原 legacy:20–36 全部 method×mode×needle（3×3×2）、empty/captured、identity/ordinary、String 3×5×8×3、random128×8×3 原参数、黄金、固定 seed、GC 和 live/frame 清理断言，不缩减。
- [x] C：维护 Eli 尾部四项按同一根因写齐，fixture/runtime 无需猜测修改。
- [ ] D：父统一生成并执行原完整 11 项及真实 browser；本代理不局部执行/编译。

### C60 D 同批修复：原验收合同与准确登记来源

A：真实历史 report 绑定的 core-acceptance-corpus SHA 为146a17…；fe21886
把 AC24 唯一证据 tools/integrity/check.mjs 改成维护 Eli 路径，导致当前合同
SHA0f6f8a…，原 checker 本就应同时拒绝 criterion/asset inventory/contractSHA。
按明确授权恢复 fe21886^ 该合同原始完整 bytes，不改任何历史报告或 hash；
原 integrity canonical 路径也必须走维护 Eli＋独立 Emacs 完整 module/map
重编、tracked 源和 helper、源执行期间不变的严格证明。允许的生成证据
严格只有 bootstrap-compiler 与 integrity 两个固定映射，未知 untracked
路径继续拒绝。bootstrap 为 integrity 增加实际 source-map 参数和 ignore。

B：两入口均覆盖 source/module/map 修改、源漏tracked、map缺失、helper
漏tracked、编译器真实失败及未知 untracked 拒绝；正例继续原35项及未修改
历史 run/Markdown/summary/hash。登记 reader 新 B 保完整9+2/35题名及时限，
并拒绝 C60 原真实6元素误嵌套登记，不放宽为前三个参数有效即可。

真实只读诊断：一次 stage3 reader 读取当前46项，全部3/4元素/literal标题，
缺省5000与显式120000/30000合法。C60 frozen map 源第6项实际6元素，后三
个test吞成多余参数，原 validator 正确拒绝；当前源已由其负责人修正。
保当前严格判定，不重写 reader，不替源，不重复跑；只补维护测试接口和
准确反例。相关日志 c60-browser-reader-fields.log / old-source-fields.log。

### C60 / P06：原完整测试子进程与浏览器的真实 runtime 解析环境

当前树/流程：final-functional-scope → file-workers → 原 Bun suite → os.tmpdir
产物 → Node 裸名导入；浏览器 BrowserType.launch → newContext → data URL ESM。
原 direct 2320 行及其它五份完整 suite 不改。真实 D 的 ERR_MODULE_NOT_FOUND
来自仓外产物没有 root package scope，browser 的相同裸名缺 importmap。

目标树新增 tools/testing/fixture-environment.eli → ignored 同名 mjs，及对应
维护 Eli 测试。prepareFixtureEnvironment(root,env) 验证真实 package.name 与
Unicode/math exports、在 root/.eliscript-cache/test-fixtures/session-* 建独占
scratch，clone 原 env，仅设置该子进程 TMPDIR/TMP/TEMP、preload 位置/根与
scratch identity。close 只删本次 own scratch，不能改系统 tmp/父 env。
fixtureChildArguments(args,env) 只在认证 preload 配置下前缀 --preload；原
file-workers 的 scheduleTestFiles/runTestFiles 增可选 env/cwd，默认不变。
final scope 的 ordinary/mixed/sequence 三条分发统一传 clone，finally 清理。

维护 preload 同步完成准备，再包装本次真实 Playwright 三 BrowserType.launch
与新 browser.newContext；保原参数/receiver/异常/返回 browser 身份。context
返回前 addInitScript 运行纯 Eli DOM 函数安装 Unicode/math 默认 importmap；
私有 HTTP origin 的三个真实 runtime 路径由 context.route 直接读取 root
生成模块并 fulfill，relative Unicode data 导入沿真实路径。无 shim、无复制
旧 JS、无替换 compiler/evaluate/golden；context.close 收回该路由。已有
fixture 自有 importmap/实际 HTTP 服务继续执行。renderer 给原6file命令增
--preload 与唯一 env 开关，bootstrap 步骤/原 cases/deadlines 不变。

- [x] A：上述现状、目标、API/变更文件与根因写齐；bootstrap 两mapping由其独占协作者接入。
- [x] B：写齐独占 scratch/环境不变/cleanup/错误包/越界拒绝、原 supervisor env参数与 browser launch/context/路由/DOM 安装正反例，全部不运行。
- [x] C：helper/preload、final scope、file-workers、renderer、mapping/ignore 与原 CI 6file 接线全齐，不生成。
- [ ] D：父统一生成及原完整 suite/三 browser CI 验收，原失败保留；不把环境准备记为语义通过。

本族该批 A/B/C 已齐：原合同使用 git 原对象恢复完整bytes；generated evidence
严格固定两对 source/canonical，独立 Emacs helper 同样只接受这两对，原全
module/map/source不变校验与未知路径拒绝保留。integrity实际map生成参数与
ignore已接。B 扩两入口全 source/module/map/漏tracked/缺map/编译失败否例，
旧完整35项及历史报告正例仍保原；另补真实登记46项及误嵌套/动态题名/动态
或负deadline拒绝。登记能力只导出维护测试接口，现有正确严格AST条件未改。
协作者请求的 fixture-environment Eli工具/B两条bootstrap mapping同批补齐。
未运行编译、suite或验收；唯一已授权只读reader诊断不执行任何suite，D待父。

### C61 / P06、A06–A07：原 object-properties 完整20项维护 Eli 迁移

A：原 tests/wasm-managed-object-properties.test.mjs 全44行/25019B 原样归档
为 -test-legacy.mjs，canonical 同名改由 tests/eliscript/managed-object-properties.eli
生成。主套件保持原20登记、题名/默认5000与显式30000 deadline，beforeAll
120000、Seed与三代compiler/module-map/JS/WASM全字节、原128-slot容量、
8192/65536预算、256轮固定随机、全部raw ABI/frame/trap/UTF16/GC输入及黄金。
Node脚本与browser页面分别迁独立 Eli helper，复用真实runtime包/reference
加载与HTTP oracle共享helper，无新JS字符串或手写生成物。

B：全部20项维护测试先完整写入且不运行。原第16项仅陈旧能力拒绝修正：
保primitive assign真实拒绝；函数own length/keys改真实JS等价正例；原合法
getter descriptor改真实正例，再补非法receiver/descriptor参数 TypeError与
同一实际runtime错误码拒绝。原capacity/shadow-call生产缺陷由负责人修，
本族不增加预算。静态Eli输入从原档原字符串数据提取为独立.eli，不执行JS。

C：主source、Node/page helper、静态fixtures、原canonical映射/ignore及完整
corpus browser-suite-plans 追加本族与construction的实际archive原SHA、case
坐标、维护源/实际module/map/fixture资产。fixture分母不改。construction
由协作者维护，本族只接其来源证明。D父在全批C齐后统一生成完整验收。

### C60 集中验收结果与同一根因修复批（D）

- 独立 `verify-bootstrap` 与发布准备真实 exit0：stage2/stage3 完整313文件逐字节一致，产品SHA为 `2fcd3a5e3165a41db5253a446097bd5d4ba0a5a34ad9c950ef23b1954e5aa636`；记录 `c60-main-verify-prepare.log`。这是0.0.1功能候选，不是0.0.2发布验收。
- 原初编译器完整主ERT 130/130通过；原100000 reader/program模糊测试含50000独立完整发射/诊断证明通过，历史摘要断言未修改。无需无故重复这些未受影响项。
- Node修复组27通过/3失败/1原跳过；Bun组26通过/2失败；search/symbol组45通过/1失败；其余原4浏览器套件70通过/51失败。失败全部保留，不能用局部通过替代三输出全量验收。
- 三输出入口在共同语料构造前严格拒绝search错误登记，未开始本轮目标执行。实际旧源的尾部括号把后续test嵌成前项参数；当前维护Eli已修，validator不放宽。历史合同证据路径漂移恢复原bytes，由维护checker独立认证精确生成入口；不重写历史报告或摘要。
- 本修复批包括默认Unicode模块在真实Node与浏览器fixture环境的解析接线、正则split尾片循环边界、Array.from字符串默认迭代、源调用失败与小资源初始化根因，以及受影响旧拒绝用例按当前真实能力迁移到维护Eli。保全部有效输入、独立黄金、原负向资源及恢复断言；过时故障注入改为实际生产路径，不能伪造旧路径仍被执行。
- 原后端禁止raw-javascript的既有用例发现5处宿主取值表达式。施工将binary/native三处加一处String.fromCharCode取值改为普通Eli属性读取，regexp的typeof判断改为value-type；不改变字节算法和预期，复用原严格后端IR遍历及完整三代字节用例验收。
- [x] 上述5处后端表达式全部施工完成；既有用例保留。
- [ ] 本批全部来源与测试迁移完成后统一重建新候选、独立复核、集中复验所有受影响项及原三输出完整共同语料。
- [ ] 原完整功能门禁、声明浏览器/原生平台实际运行、版本冻结及最终签名推送仍待验收；本节不提前勾选A05–A08。

C60/C61 同批生成物接线：原 Symbol 手写测试保留为未改字节的
`tests/wasm-managed-symbols-test-legacy.mjs`；canonical同名测试从维护Eli生成，
已移出Git索引并保持ignored，不能把本轮实际生成的JS误作为源码提交。

### C60 / P06：Array construction 完整原 20 项迁维护 Eli

A：原 `tests/wasm-managed-array-construction.test.mjs` 共20项，完整源SHA为
456846a3f8356e9fa7cedd60561e2080e07895127b30c39d6266cef1e361b646，原字节
保留到 `wasm-managed-array-construction-test-legacy.mjs`，不执行旧 JS。
新增 tests/eliscript/managed-array-construction.eli 发射回原canonical入口，
node/page 同名前缀维护 Eli 发射 helpers，复用已维护真实 reference/file/HTTP
transport。源 fixture、Seed、三代 compiler+source maps、独立 JS 黄金、
真实 Node/browser、20原标题及30000/120000ms先完整保留，不跳过任何项。

B/C差异仅已确认陈旧前提：手工 export/reference IR用实际 node.span；
Array.from函数输入/constructor.call 已真实支持，原负例改成运行同输入并
严格对照实际JS输出，补普通构造器与非构造器 this 的结果/原型观察，同时
继续以真实不支持 WeakRef 源验证 ELI-B0001+原location；trap 改当前真实
heap-source-array-prototype-static-new 分配入口注入，仍先坏mapper后真正
RuntimeError及caller roots。128slots/8192/65536容量与256轮固定seed完全
保留，不因初始化失败加额度；实际生产问题由同批 runtime 负责人修复。

- [x] A：文件/接口、完整原case与改正前提、真实生产分工写齐。
- [x] B：20项完整主体/独立 Node/page/能力正反例写齐但不运行。
- [x] C：维护Eli、原archive、3mapping/ignore、case/资产来源绑定接齐，不生成。
- [ ] D：父统一构建后原20项与Node/browser/三代固定点全验收，未通过不冒充完成。

C61 小资源初始化根因已真实定位（原128 slots/8192 initial/65536 max不变）：
`c60-construction-init-diagnostic-arity.log` 证明读取顶层Array.from时尚未发布from/of，
却已创建完整六个iterator registry callable，slots达128而bytes仅使用12760。
不是宿主物理内存不足。复用原capacity测试作为B，移除
`lower-managed-native-initialization` 中 Array构造器的提前iterator注册：
观察构造器的静态方法不观察iterator。实际Array.prototype entries/keys/values/
Symbol.iterator原有按成员发布路径仍调用相同iterator注册，反射及身份标准不变。
只改该现有条件，String/RegExp/Map/Set原初始化不动；统一D检验原小资源、
完整Array构造/对象属性/迭代协议、固定点与三输出，不局部试跑。

C61 object-properties 本族 A/B/C 已齐（D未执行）：主维护源原20登记均在同一
模块，独立Node/page源码齐；原10段静态Eli输入原字符串数据迁到case-*-*.eli，
仅额外descriptor-probes.eli用于新支持能力正例及真实非法参数拒绝。原档
SHA为56ed33c421d2aa7912c94fa50d807f1a40b4798418d0154779bd991bee057653，
canonical已取消tracked，main与两helpers module/map/root临时目录均ignored。
原Make canonical测试入口原样继续，三项mapping与真实source-map已接。
256轮种子原0x743c125a=1950093914，128槽/8192/65536未改，Node原30000与
browser/三代原30000未改，beforeAll原120000未改；原全suite不拆减。

完整replay来源计划增 object-properties 20 与 construction 20，后者负责人
提供原SHA456846a3f8356e9fa7cedd60561e2080e07895127b30c39d6266cef1e361b646、
原family及三维护源/三产物；加各自共享transport module/map真实身份。保持
原fixture IDs/固定分母、原完整case坐标/时限，实际执行新Eli canonical。
B扩大4suite原11/35/20/20全题名/时限/资产正例，新增两archive即使伪造自洽
text/file proof也必须被原固定SHA拒绝。construction三mapping与source-map
同批补齐，其源码/归档/ignore由负责人维护。未编译、测试、生成或审核；
静态括号定位为本次写源的语法接线，不把它记为语义验收。全部待父统一D。

### C61 D：普通 data Get 保留既有无分配借用合同

A：原 direct named objects 的1024轮 sealed-string inherited Get 断言真实失败；
`value-object-get-with-receiver` 在已验证参数后仍无条件分配7槽frame。
仅 sealed-string/symbol 非native观察键、普通非namespace对象链的纯data或
明确结束的缺失读取允许直接借用；现有table/data-flags查询不分配或执行用户代码。
getter、外来/exotic原型、host默认原型及native初始化条件仍用原完整慢路径。
全部raw参数检查先行，原错误码、trap/GC与receiver语义不改，不新增运行时API。

- [x] B：原browser1024轮黄金保留；维护Eli补同样1024轮own/inherited/absent/symbol、signed0及collections/usedBytes/frameDepth不变，GC清理仍严格。
- [x] C：以上单函数最小借用分支写齐，所有未证明安全情况保原慢路径。新迁移Array/Object的nullish method断言统一既有TypeError1并保参数未执行及caller frame，非callable依旧3；原Symbol合同不改。
- [ ] D：当前旧候选不能证明新修复；父统一新冻结后验收，不局部试跑。

C61 原128资源独立诊断 `c61-construction-init-diagnostic-complete.log` 已证明
提前iterator注册移除后仍因slot耗尽失败：live128/used12736，六registry函数
确实不在现场；当前6函数为Array/Function.prototype/isArray/from/of/species。
62个kind9 frame全部parent0/pins0且activeFrameDepth0，说明实际已退栈临时
对象占据slots；close+collect归0。该证据交父继续定位分配重试边界，不增加容量。
该诊断不等于修复验收；首个读取runtime括号EOF的失败日志亦保留，未作容量依据。

### C62：初始化分配压力回收与 js-nth nullish 专用合同

A：128槽诊断中的62个已退栈frame不能直接free；分配失败重试现被auto阈值0
禁用，而宿主设置auto发生在module_init之后。仅既有module phase=1允许一次
分配失败后完整GC/重试，复用现有根追踪和自由槽重选；phase2或raw默认auto0
不隐式回收。对象与resize字节分配两入口同修，不增加原128/8192/65536预算。
原browser数组首错仅js-nth("length",nil)：通用Get对nullish模式落入sourceGet，
恢复该精确分支到既有value-array-get(...,1)，保length0、缺失nil和对象key拒绝1。

- [x] B：原128资源用例不变；维护Eli补初始化中槽压力及resize字节压力回收、module与caller根及resize内容存活、初始化后auto0仍严格耗尽；补null/undefined的length/缺失/非法对象key和caller根。
- [x] C：两分配入口仅phase1压力重试与精确js-nth分支写齐，不新增状态/API。frame-pop仍仅清空退栈，不立即free；沿用原collector及完整一次失败后重试。
- [ ] D：父统一新冻结验收，本批不局部运行。

C62 formatter 原产物精准诊断另定位真实独立GC根缺口：code66/argc2入口正常，
首次非弱缓存探测invalid来自 `heap-source-receiver-data`，getter标签1051218
在第二个writable标签分配期间被回收，随后frame-set校验子值失败1；该函数
frame1051200本身有效。保留原输入/预算及 `c62-formatter-receiver-frame-invalid.log`。
同一let并列两个分配改为getter分配后立即入frame5，再分配writable入frame6；
原两个标签分配先后和实际descriptor读取次序保留，失败仍清同一私有frame。
- [x] B：维护Eli补auto1下Reflect.set不同receiver且已有own data、Array显式length描述符后push/pop两条真实路径，signed0/caller roots/回收清理不减。
- [x] C：仅该双标签分配点顺序入根，不改访问器/flags/foreign能力或错误身份；维护回归已齐，未局部运行修复测试。
- [ ] D：父统一候选重建后验证原formatter与新增GC回归；不将诊断当修复通过。

C62 原完整 Value/JSON browser case 的120000ms终止不能视为性能根因。
维护页面 `direct-wasm-value-json-page.eli` 保原完整stdlib graph、所有输入、
parse/encode边界、两个阈值65536/1、8192槽/262144 initial/16MiB max、
零imports/Seed JS/immutable IR/真实oracle比较/清理及最后三代完整bytes比较。
仅公开有限阶段及每个实际invoke输入序号的开始/完成记录，准确区分编译、
链接、初始化和用户算法；诊断driver复用同页及同套准备，受控运行且不设置
杀死仍有进展任务的总deadline。不删除输入、不增加测试预算，不新JS模板。
- [x] A/B/C：页面真实执行与原完整断言全部写齐，静态模块/HTTP oracle接共享准备；没有局部运行。
- [ ] D：共享准备源码齐后仅执行已授权原完整单case定位，首次明确卡死再取精确循环栈，修复后统一验收。

C62 Value/JSON 独立完整单case真实通过：`c62-direct-value-json-diagnostic.log`，
受控run `7d175c471b634920bd82801a8b12687c` exit0/cleanup_complete，峰值
2753396736B，含准备总225.059s，页面170.488s。两个原阈值各完整104次invoke：
4报告、77 JSON输入、12 parse边界、11 encode边界，共208次均与独立Seed oracle
相等；原三代JS字节、immutable IR、零imports、最终4066336B WASM与第三代
完整bytes及两轮live0/frameDepth0全部通过。threshold65536约1.42s、threshold1
约167.44s且输入序号持续递增，证实原120s总deadline导致终止与后续cascade，
不是卡死。该单case功能通过不冒充原120s套件门槛通过；未改时限、资源或runtime。

### C62 原CLI/ERT stdin：维护入口与 Node fd0 兼容

A：原project CLI及unsaved-buffer ERT共同失败于fs/promises.readFile(0,"utf8")，
该API不接受数字fd。原295行完整JS按字节归档project-cli-legacy.mjs，SHA256
79980b2a6e38e4ab9daca31b04cb366bd749b66e3b384fbd04e696ddc465cd82。
tools/project/project-cli.eli生成原canonical入口，复用原parser/config/execute；
仅存在stdinFile且stdinSource nullish时由node:fs readFileSync读取真实fd0并传入。
显式空串不读stdin；公开main保原完整usage、JSON/human报告、诊断、退出状态。
归档isMain自然false，不执行旧入口；不改正式compiler或新写JS。

- [x] B：维护Node测试与Node helper覆盖真实UTF8 stdin、nullish source、传入source、空串和普通file，fd0读取计数分别1/1/0/0/0；真实执行生成模块并保原磁盘source不变，原CLI shell全部断言保留。
- [x] C：维护入口与原字节archive、canonical/map ignore、bootstrap-runtime首次项目host生成及backend两mapping、Node测试/helper mapping与Make接线齐；来源绑定由对应负责人补真实维护source/archive/map，未测试或生成。
- [ ] D：父统一生成后原Node CLI、unsaved-buffer ERT及新Node stdin测试集中复验；不能以新增用例替代原门禁。

### C62 应用门禁：早期DOM、真实Worker探针依赖与经典脚本边界

A：docs-site六例和pages-runtime同一pageerror源于Playwright init script早于
document.head创建。fixture环境只用MutationObserver等待真实parser head，
安装一次importmap后断开，不新建/替换文档。原pages-derived Worker bundle
已自包含，但其两个新编译probe也带默认Unicode依赖；将这两个实际Eli探针
按既有生产bundle步骤完整打包，不删依赖、不用环境importmap假装Worker自包含。

dogfood-browser原全文件“不含eliscript/”误把合法namespace数据当未解析导入。
维护Eli改以Bun.Transpiler.scan(actualBundle).imports为空认证真实经典IIFE；
原shape/DOM契约/collection排除全部保留。64KiB尺寸默认严格保原断言，只有
已有显式ELISCRIPT_DEFER_PERFORMANCE_ACCEPTANCE=1经currentPerformanceTest
登记DEFERRED / NOT ACCEPTED且skip，不算性能通过；另增始终执行的collection
排除用例，功能不随尺寸延期被跳过。不展开Unicode或正式compiler优化。

- [x] B：早期head-null/多次观察/只安装一次及断开回归齐；原docs/runtime全部功能断言不变，原Worker真实执行和UTF16身份仍严格。dogfood六原title与原静态字符串黄金全迁维护Eli，额外功能case不减覆盖。
- [x] C：fixture observer及两个实际probe bundle接线、tests/eliscript/dogfood-browser.eli→原canonical映射/ignore齐；原JS原字节归档dogfood-browser-test-legacy.mjs，SHA66888ccd1e50564c8e92fc49eda8b4585e8a5378f82b52fb89a1db2c1f8693aa。未局部生成或运行。
- [ ] D：父统一生成后只复验受影响应用文件及fixture回归；尺寸延期不能冒充64KiB达标。Action产物源码构建与归档另由对应负责人同批收敛。

当前平台边界补充：只面向最新稳定版平台、Node/Bun及浏览器，不新增旧平台
fallback、polyfill或降级分支。“旧页面/旧设施”仅指本项目原测试实现，按当前
能力直接更新；历史平台记录不产生继续支持义务。以完成当前三段自举、完整
有效三输出和必要交付门禁的最小完整改动为准，不扩功能、不为旧实现约束
做额外设计或优化。有效语义断言与独立验证仍保留；新平台能力直接使用。

平台决定以用户最后澄清为准：最低交付要求是在当前稳定版或最新长期支持版
中有一个完整通过的版本。沿用已经可工作的验收环境，保留现成兼容性；不把
增加兼容或故意不兼容作为目标。遇到真实阻塞选最简单、最快完成当前交付的
方案，不额外升级依赖或扩大平台矩阵；全部有效功能验收仍须真实通过。

C61 D 原命令接线修正：Bun 的 preload 只能插入明确 `test` 子命令之后，
`fixtureChildArguments` 保所有前置 `--smol`，发射
`["--smol","test","--preload",path,...originalFiles]`，缺显式 test 则准确
拒绝，避免误当 package script 递归 make。browser renderer 同用
`bun test --preload ...`；B补有/无smol两种完整argv及缺子命令拒绝。
仅此最小接线与期望修正，不扩展环境设计，不局部运行。

### C62：finalizer 的唯一 fuzz 历史证据分层（A，D待执行）

现状基线：C61 `tools/acceptance/finalize.mjs` L76
`validateFinalAcceptanceContract` 只对两份性能报告提供显式延期；L231
`buildFinalAcceptance`、L414 `verifyFinalAcceptance`、L467 `main` 均调用该
词法函数。原验收8d9483c中的fuzz测试SHA为f6446a66…，当前已增加完整独立
发射证明的原测试SHA为d53a6fab…；不能声称两者字节相等。C60已有真实
100000输入/50000program完整通过。无独立retained-source-snapshot.eli，
复用现有retained-performance-snapshot.mjs的只读、不可变SHA Git reader。

当前树/流程：`finalize.mjs` → 当前合同/当前artifact bytes → 原run SHA；
性能文件另走retained-{transient,soak}.mjs；fuzz漂移一律拒绝。
目标树/流程：原入口`finalize.mjs`为ignored生成物 ← 新`finalize.eli`；
原完整JS逐字保留`finalize-legacy.mjs`；新Eli负责validator/build/verify/
generate/CLI，复用原typed error、defect validator、manifest validator及全部
公开formatter。显式`deferPerformanceAcceptance:true`是既有功能验收模式；
仅该模式下且唯一精确`tests/reader-program-fuzz.test.mjs`发生漂移，读取
`run.source.commit:path`真实Git bytes，校验40位commit/tree、tree归属、
唯一run artifact、64位SHA且bytes SHA完全一致；记录独立
`historicalSourceEvidence`（artifact/sourceCommit/sourceTree/artifactSha256/
historicalSourcesVerified/currentSourceAcceptance="not-asserted"/
currentSourceClaim=false）。此记录不进入原manifest、不改历史接受结论；
CLI明确仅历史，当前fuzz由另一个真实完整功能验收提供。本工具不执行fuzz。
未知artifact、缺文件、伪造SHA/tree/commit、重复artifact均拒绝。默认/false
模式不进入此分支；不读取环境作为API默认。延期模式禁止generate与require-pass。

| ID | 精确位置/动作 | 施工 | 验收 |
|---|---|---|---|
| C62.1 | 新tests/eliscript/final-acceptance-history.eli：严格默认/false/外层env不自动放行；显式历史正例、真假tree/commit/hash/唯一绑定/路径，完整manifest/markdown/缺证据/伪通过/缺陷/生成与晋级拒绝 | [x] | [ ] |
| C62.2 | finalize.mjs原字节copy到finalize-legacy.mjs；git rm --cached原canonical，不改旧字节；新增finalize.eli维护上述全部词法调用，formatter与原typederror复用 | [x] | [ ] |
| C62.3 | bootstrap.el tools组增加finalize.eli→原canonical，tests组增加新B；ignore canonical及map，Make Bun组加入B；package files包含两维护源码/原档，不改version | [x] | [ ] |
| C62.4 | 父统一D生成、原final suite+retained deferral完整否例+新增B+正确env check-contracts；默认strict额外负例仍拒绝；历史JSON/MD/hash无修改；不重跑fuzz/性能 | 待D | [ ] |

不扩原matrix分母、不改正式编译器/runtime、不碰父正在跑的冻结三目标及浏览器。
当前验收数据流：历史run→真实Git对象认证→原manifest全等；当前fuzz与三输出
继续各自独立收据；两层不互相代替。C齐后一次交父集中D，不局部生成或测试。

### C61 / P06：完整 browser exceptions 14 场景迁维护 Eli 与功能截止

当前原93行 `wasm-managed-exceptions-browser.test.mjs` 唯一整例包含14共享场景，
真实两次集中D约50–52秒且持续推进，却被原显式30000ms回收。按用户最新
授权，功能测试给300000ms总截止，不改任何性能报告/预算，也不做14场景的
性能优化。原全文SHA6bb42e4b3078fa769209dd6c0a44d78f3afd6b63e086469e5e630e835e716fd4
归档 `wasm-managed-exceptions-browser-test-legacy.mjs`。

维护源码树为 tests/eliscript/managed-exceptions-browser.eli → 原canonical
入口，managed-exceptions-browser-page.eli → helpers同名mjs。beforeAll仍
120000ms、实际buildBackends、原behavior.json筛选三feature并严格14；
逐case原 source/filename、actual reference JavaScript原字节、真实Bun依赖
bundle保留。当前语言无动态import源码形式，page用静态 `/oracle.mjs`，主
复用同一实际browser/page，逐场景导航独占短期HTTP服务加载该真实bundle，
每份服务finally停止。无JS字符串模板/无新语言实现。每次page运行真实
compiler→IR saved→zero-import WASM→auto1→实际JS expected→WASM expected
→close/collect/live0/frame0，保留id+完整bytes并与宿主同IR重新发射逐字节
比较。目录位于ignored项目根scratch，afterAll完整清理。

- [x] A：根因、完整原场景与前后源码/运输流程、截止授权、绑定接口写齐。
- [x] B：14场景完整原字节/IR/语义/roots/宿主bytes黄金及场景数量编写，不运行。
- [x] C：两维护Eli、原archive、ignore与原Make canonical保持；两mapping/provenance由其独占协作者接入，不生成。
- [ ] D：父统一构建后全部14原场景真实browser通过；不以test进程未超时替代逐场景证据。

C62 本族 A/B/C 齐，D待父集中执行：C62.1 新维护B六组全写但未运行；C62.2
完整受影响validator/build/generate/verify/CLI迁Eli，原formatter/defects/
manifest validator及typederror逐字归档复用；唯一fuzz读取原run SHA/tree/
真实Git对象认证，不给当前fuzz通过声明，所有其他artifact原拒绝保留。
C62.3 bootstrap/ignored canonical/Make/package均接齐，未改version或历史
report/hash，未生成、编译、测试。辅助同期只按另一负责人明确文件名增加
exceptions-browser主/page两mapping，其实现/ignore由该负责人拥有。

### C62 source-archive：完整 bit/fuzz 的旧断言来源与维护执行分开

A：C61 log777真实失败定位到`original-program:compiler-stdlib-bit-complete`，
`compiler-corpus-source-archive.eli` L627仍要求新Eli生成host包含原JS完整test。
仅bit/fuzz两项已明确迁维护Eli，不能伪装host仍逐字含旧JS。源树保持
compiler-corpus-{bit,fuzz}.eli原两个精确record transport；只补original中
`assertionSource:{file,sourceSha256,regions}`真实原档身份，和
`maintainedAssertions:{sourceFile,sourceSha256,generatedFile,generatedSha256}`
真实完整维护实现/产物身份。sourceAssets/evidence仍读真实文件全bytes。
B：原verbatim断言转在认证后的原source asset全bytes/原span上验证；bit
新执行host必须等于实际generated文件、维护全部断言源和产物必须等于实际
asset bytes并保持SHA；增加同样fuzz来源观察。loop-recur等所有未迁记录
仍严格hostSource包含原断言原文，不改旧断言文本、不减原覆盖或时限。
C：只两transport新增准确metadata+维护B观察，不改实际执行/期望、rawsource、
历史report、matrix分母。不运行、不生成，合并交父集中D。

C62 source-archive A/B/C齐、待集中D：真实失败record已明确为bit；原loop-recur
hostverbatim检查原样保留，bit改认证sourceasset全bytes、原region及旧完整test
文本，同时认证维护Eli全源/真实生成物全bytes/host入口调用和2×2执行合同。
同样补fuzz原断言source/regions与维护全源资产观察；两精确transport补对应
metadata，均直接取已有真实reader proof，不另读取假root、不改实际输入和
执行host、不重跑任何100k/50k。其余records绝无迁移例外。未触碰properties
断言；无编译、测试、生成，交父同批统一D。

C61 D arrays 首错诊断经父授权一次运行：ignored维护Eli page/driver使用冻结
C61 stage3 compiler/backend/runtime.eli，原 arrays fixture、512/32768/1048576、
auto1、全部原输入/独立JS黄金/GC/cycle条件保留。原独立值和后续独立场景
分组，以同source新实例隔离首错后继续收齐，不替代原整例验收。每个公共
ABI调用记录原export/参数kind与原步骤，完整日志有限于该单例原有限循环，
不启WASM全calls trace；有失败仍清自己roots/browser/HTTP服务。编译和
唯一诊断由controlled-run各自受控，无总时限杀有进展任务；生产源码不改。

C61 arrays 一次有效真实Chromium诊断完成：冻结C61 bytes=1964757，trace2107条
约436KiB。17独立组完成原全部断言；唯一 nullish-keys 组在原
`nth-value("length", null)` 首错 ELI-RT0003（serial1518）。该组后续undefined
和objectKey否例未运行通过，只按同族源码归因。冻结runtime.eli:17166仅拒
nullish0，nullish1+object0/3最终17179落通用source Get而该入口拒绝nullish；
原value-array-get(...,1)保留empty fallback length0及object key code1合同。
根因/修复接口已交memory拥有者，不擅改。有效guard cd7eee61cd9a45b487fbbf1bc840329a，
1.881s、peak997113856、exit0、cleanup_complete=true。首轮仅日志承载Proxy
被冻结facade不变量拒绝，未进入原ABI；已保留setup-failed证据后改独立
转发facade。所有证据在ignored _worktree，不能计为原整例最终验收通过。

C62 环境/exception施工接线静态收口：两exception维护源→原canonical/page
mapping、ignored模块/maps、原Make canonical、完整14场景与300000功能截止
均齐。fixture工具自身维护测试原已生成接线但漏完整Make显式列表，已只补
`tests/fixture-environment-selfhosted.test.mjs` 一项，不重跑已通过Node组。
相关代码只依赖当前标准Playwright/importmap与真实runtime资产，不新增旧
浏览器fallback/polyfill。不启动任何诊断或测试，留父集中D验收。

### C62：直接 iterator 方法补齐真实原型发布（A/B/C 齐，待统一 D）

现状 `bootstrap/backends/managed.eli` 的
`lower-managed-collection-method`（基线3141起）可通过原生快速分支直接执行
`value-source-method`，未经过 Array prototype member publication。
C61移除 Array 静态方法的无关 iterator eager 初始化后，直接 `values()`
产出的 iterator 没有真实 registry；随后的 `Array.from` 对 own `next`
覆盖无法按原完整协议执行，原两例已实际失败。

保留 Array 静态初始化不发布 iterator 的修复；仅 methods 索引6–8
(entries/keys/values) 已选中的原生分支，在实际调用前复用现有
`lower-managed-collection-iterator-initialization(state,functions)`。
普通 own 方法分支、callee 捕获和所有参数求值顺序不变；不添加新 runtime
API、不在仅观察 Array.from/of 时分配 registry。前后流程差异：
直接原生方法→未发布 iterator→Array.from；改为直接原生方法→现有 registry
幂等发布→iterator→Array.from 读取真实 own next。

- [x] A：原两失败、精确符号、调用位置与注册时机明确。
- [x] B：复用完整 construction 原案例“caches an own next method once”与
  “iterator next failures do not close”，保留其缓存、close、原异常、GC断言；
  同批已有128slot初始化及raw容量否例约束不得恢复 eager 发布。
- [x] C：仅上述原生分支的 result.steps 前插现有初始化，不运行局部测试。
- [ ] D：统一构建后完整 construction/properties、原 browser 全组和三输出验收。

### C62 / P06：最终功能入口持久设置默认单例300秒

C61真实 direct browser represented type query 达到Bun默认5000ms后清理仍共享
的浏览器，造成后续18项TargetClosed级联。用户已明确允许调整这类功能
deadline；只给每个功能test默认300000ms，不给长任务设总超时，也不改
显式性能预算/历史性能门槛。精确入口：file-workers worker-test-arguments
standard/smol均在test后加 `--timeout 300000`；final-functional-scope原mixed
与sequence调用同样追加，原file/pattern/monitor/env不变；browser renderer
完整6file命令同样有默认300秒，仍先test后preload。

- [x] A：真实回收原因、用户授权与三条最终入口/默认单例和性能边界写齐。
- [x] B：对应worker完整argv、mixed分发参数和browser缺timeout拒绝断言齐，fixtureChildArguments通用输入测试不改。
- [x] C：三份工具及对应维护Eli测试全部接线写齐，不生成、不运行。
- [ ] D：父统一生成/真实功能验收确认，不重跑无影响的已通过项。

### C62 同批实际D缺陷：异步ESM fuzz入口及debugging真实子错误

A：C61 fuzz实际Bun错误为require异步ESM，改唯一host维护Eli静态导入相邻
acceptance；原执行器已有hostSource缺省→sourceRoot/host真实入口能力，唯一
fuzz transport使用该路径，不复制到产品tests后破坏相对坐标。B更新精确入口
与无createRequire/无hostSource，所有原输入、deadline、sourceSHA不改。
C62编译两错误同批修：finalizer新增既有nullish helper；history B括号闭合修齐。

A：debugging原5case中的第四项实际子exit1但旧run返回stderr未呈现、finally
删临时目录，现有outcome无法恢复真实stderr，不冒称根因。按明确授权迁原
完整5case到维护Eli，复用原host fixture与source-map/CLI/Session全部断言；
新run仅在exit非零附带真实stderr/stdout，保原exit/empty-stderr判定。新编译
输入输出使用现成prepareFixtureEnvironment创建的实际root包scope；不猜改
语言行为。原suite完整JS逐字archive保持原SHA/regions/coverage，维护新test
与corpus-host/acceptance实现实际source/module全部绑定；保每case5000及
原整record30000，不改历史report/hash/matrix分母。B原5literal titles及完整
原golden全部迁入、另补真实错误呈现否例。A/B/C齐后一次集中D，不试跑。

### C62 D：literal 完整功能程序不再因旧总时限中断

C61 真实落盘 `original-program:compiler-literal-runtime-complete` 在新增完整
js-nth 场景60000ms时限中断，已有输入/独立黄金不变，不是性能验收。
按用户长任务保持实际推进的指令，维护 `literal-runtime.eli` 的 selected
执行分支直接逐个 await 完整 case，取消内部 Promise.race；普通 Bun 测试
仅该已确认超时的完整 nth 注册改300000。原五项历史CaseTimeouts保留。
`compiler-corpus-project-adapters.eli:literal-record` 的外层245000总时限
同样移至 setupReplacement.originalTotalTimeoutMs 历史说明，实际execution
不传 timeoutMs；现有 controlled-run 管内存并由进程/记录推进判断停滞，
不创建另一套监控。源码树不增加文件；调用流程仅从定时中断改等待原完整
函数结束，其余原程序、独立编译器、IR不变、三目标结果及根清理断言全保。

- [x] A：精确函数、历史/有效deadline分离和前后流程明确。
- [x] B：compiler-literal-corpus 保原五项deadline身份，新增历史总deadline
  身份与execution无总timeout断言；原全部语义/产物断言保留，不运行。
- [ ] C：维护runner/nth注册和literal transport两处最小接线完成。
- [ ] D：与其余本批源统一构建后完成原全部literal程序，不拿无超时替代通过。

C62 literal C已写齐：仅原selected完整case执行去除时限竞争，普通nth300000，
原245000保留为历史metadata；其余输入/断言/5项历史deadline不变，未局部运行。

C62 同批本族施工完成：fuzz host静态导入，唯一record直接走执行器已有真实
sourceRoot host路径（无hostSource）；B认证该路径和全部原proof。debugging
新增tools/testing/source-debugging.eli完整原5case与真实子stderr/stdout呈现、
source-debugging-corpus-host.eli、tests/eliscript/source-debugging.eli原5literal
case+错误呈现/transport反例；原tests/source-debugging.test.mjs原字节继续只读
原断言身份，不复制、不编辑JS。新compiler-corpus-debugging.eli唯一hook及
compiler-corpus.eli import/call已齐；sourcearchive专门确认该第三个明确迁移
record的原sourceasset/regions与维护源/输出全bytes，未动literal hunk。
bootstrap四mapping、Make新实际suite、ignore/package维护源已齐。原5000×5/
record30000、empty stderr、CLI诊断/Session映射/Node+Bun双执行及合同拒绝
全部保留。C62 finalizer nullish helper和history括号修正同批齐；尚未生成或
运行任何修复测试/100k/性能，统一D由父执行。

### C62 / P05：认证 literal codec 入口补齐同 heap 自动探测重入范围

真实C61 core-set完整原程序原WASM/product/host/131072slots/auto65536唯一重放，
仅NODE_OPTIONS stack-trace-limit=100；c61-core-set-stack100.log给出重复周期：
managed-host-legacy decode(Symbol):963 → literalOperation(role) → decode(protocol):979
→ literalOperation("literal-export-value") → WASM内部直接brand → host能力 →
再次decode(Symbol)。managed-host.mjs:189是unknown callee原直通路径；冻结
literal bindings exporter525/importer526，而现guard只认证brand780/role781，
所以codec真实执行时active已经退出。Object realm416仅fallback，不额外扩
Object reflection。受控run a367c6550cdd4bbba41342742973ae14退出1、cleanup完整，
峰8089927680；不增栈、不改原数据/黄金/产物，不全suite重跑。

现状入口树：managedHostLiteralProbeExports→真实module getter认证brand/role
handle→invoke scoped active；codec handle未知→无scope。目标仅该维护Eli
函数：bindings内存在的 literal-export-value/literal-import-value index必须
kind1、有效整数、functionCount内、与probe/彼此不重复，标scope-only；仍
只由真实module getter登记generation handle。scope-only每次都调用原ABI，
绝不返回probe占位；其同步scope期间仅原已认证brand/role且receiver3、
count1、kind7、length≥1完整原validator条件才按原合同返回0/3。外层记录
entered，只有真正建立active的调用finally删除；嵌套codec不得提前撤销，
source false/undefined、status8和普通callee/跨heap原路径均保留。

- [x] A：真实根因、精确函数/新增scope-only模式/校验和finally责任写齐。
- [x] B：两codec真实返回、混合嵌套/跨heap/普通callee、坏ABI透传、false/undefined/status8恢复、伪binding拒绝及原完整程序回归保留；新增维护Eli用例写齐，未运行。
- [x] C：仅managed-host.eli该函数与对应managed-host维护测试实现齐，不改legacy/Object反射/memory；源码冻结交统一D。
- [ ] D：父统一生成/受影响原完整程序验收，不能以重放或mock代替通过。

D期间按既有编译产物清理授权，仅回收旧候选58/59/60的stage1–3/ir可再生
中间目录（1521文件，逻辑2041560690字节）；已确认ignored且无lsof使用者。
其冻结源码、JS/maps、manifests与原验收日志保留，当前61及并行retained工作
未动。旧58–60闭包此后缺IR，不再宣称可直接完整复核；当前交付将以新完整
候选为准。清理收据位于ignored c62-obsolete-ir-cleanup.txt，不算功能验收。

C62 D整批编译漏项修正：finalize.eli原L265模块入口的await不在defasync内；
改为调用既有defasync main的Promise并catch呈现原完整错误/exitCode1，与
已维护checker同形。其余await逐处读回均在defasync read-json/regular-file/
verifyHistoricalFuzzArtifact/validator/build/generate/verify/main范围，没有
同步lambda夹入await。新debug/fuzz本轮父集中编译已成功；此处未局部编译
或运行，交父与另一族true修复一次统一重建。

D磁盘主阻碍已无损缓解：仅C61已存在outcome.json的完成记录，其native
product/typed.json用系统ditto透明压缩；每份替换前cmp逐字节一致，无更改
路径/逻辑文件内容/产品SHA/输入或验收结果。81份文件实际占用从
11557363712降至1429848064字节，回收10127515648字节；另单份相同方法样本
保独立原始终端证据。当前正在写的record不触碰，无运行目录整体删除。
文件系统可直接正常读取，现有验收/身份算法不加压缩特例。原始结果保留，
此存储处理不计功能通过。ignored逐份收据c62-completed-native-ir-storage.log。

### C62 统一 D 已完成：当前源码四阶段自举与独立完整比较

当前runtime包含初始化压力GC、nullish nth、receiver-data标签入根；backend含
直接iterator延迟发布。由Emacs原初引导完整stage0→1→2→3实际通过；run
7d9175a5e17c41b68aeec330790eddfa，89.035秒，峰值3735470080字节、exit0、
cleanup完整。独立 `make verify-bootstrap BOOTSTRAP_RELEASE_OUT=dist/bootstrap-candidate62`
再次完整比较313文件 identical，run16b05bbf8c494427bd1b81091d764cdf、exit0。
stage2/stage3产品SHA同为
b45d700df68076e85ff2f2578887d03f5c928d5fef3e8282cdec9573738578bc；
sourceIdentity=2c1c9f640866c2fe30d86a56f18dffea14964b948e11aa40bca407983fbdfd85。
完整真实日志c62-main-bootstrap-release-complete.log、c62-main-verify-bootstrap.log
保存在ignored evidence目录。该结论仅四阶段/固定点，修复项和最终三输出仍
待统一D，不能算0.0.2发布通过；当前版本未升。两次前置tool bootstrap
编译错误日志完整保留，未冒充成功；本轮是修齐全部已收集错误后的成功构建。

### C62 source-debugging 实际执行证据路径接线

A：集中parity/stable生成器明确拒绝原tests/source-debugging.test.mjs已不在
Make实际执行组。四个现行evidence（parity source-maps第1，conformance
runtime.source-level-failure-mapping第0/1/2）改指真实新selfhosted入口，标题
不变。原source archive继续真实原字节构建，不修改源身份或旧断言。

B：新增完整builder路径用例：四个真实新locator传入adapter仍只产生一个
original-program:compiler-source-debugging，原13模块、完整原SHA/regions/
全部新locator IDs、原30000/5000×5保持；mapped suite同时明确新实际入口。
新旧映射元数据绑定新入口实际file SHA与旧断言真实路径，不伪造file哈希。
sourcearchive完整用例按新真实locatorfile观察coverage，原sourceasset仍旧档。

C：仅compiler-corpus-project-adapters.eli唯一debug入口作私有明确映射：
actual new locator.file→old assertion suite给原builder，id/contains不变；在
原record.original增加locatorSourceMigration记录actualEvidenceFile及真实SHA、
assertionSourceFile及实际IDs。只此一条精确映射；非debug/raw输入原样保留。
mapped suites纳入新入口防止原corpus后续误判unmapped；不新增record/分母。
四处JSON源evidence更新，源接齐后交父统一生成当前派生identity，不局部运行。

C62 evidence接线A/B/C齐：四JSON locator已指实际selfhosted suite，原标题不改。
project-adapters新增明确唯一file映射wrapper，原函数/literal族内容原样保留；
新locator IDs/contains原样给原档builder并必须产生恰一完整debug record，
映射元数据用actualFile真实SHA，不把它冒称原档SHA；mapped同时纳入实际
入口以保原coverage路由。B补完整13模块/oldSHA+完整span/四新ID/时限/
映射实际SHA正例；sourcearchive原完整用例同步按新实际路径观察。原raw
source/历史report/分母不改，未运行生成器、编译或测试，交父统一D。

### C62 D 收口：真实功能子进程用例的 package scope 接线

当前 Node 集中组唯一失败位于 tests/eliscript/final-functional-scope.eli
“argument rejection and a real child…”：原用例把编译生成模块写到系统 tmpdir，
绕开已有 fixture environment，因实际 runtime package 无法解析而使应成功
的第一个子进程 exit1。只修改该维护用例：导入现有 prepareFixtureEnvironment，
以 root/process.env 创建自有 package-scoped scratch，directory 使用其
directory；runFunctionalChild 显式传 sourceRoot=root 与其 environment，
仍由生产入口按原参数添加 preload；finally 调 fixture.close 完整回收。
保留两次真实子进程、原 Eliscript 输入、stdout/stderr、exit0/exit1 和错误
全文断言，exitCode 断言补实际 out/err 上下文。生产默认语义不变。

- [x] A：唯一失败根因、既有接口与精确用例修改位置写齐。
- [x] B/C：用例环境和清理接线完成，原全部断言保留，未局部运行；源码冻结。
- [ ] D：父统一重生成并验收受影响 Node 组，其他在跑组不重复启动。

### C62 D 收口：原 direct browser 两用例的维护语言迁移

原 tests/direct-wasm-backend.test.mjs SHA256 为
f0fa57d2aae13f0bef9f7afa04ee51d1d3386c4a3e011ad231ad2577c99876c2。
2000起 function properties 用例仍把已实现的 builtin reflection 全部当作拒绝；
2030起 complete Value/JSON 旧总截止提前关闭浏览器，需保完整原语义并收集
有限阶段证据。原文件全字节归档 direct-wasm-backend-test-legacy.mjs，
canonical由 direct-wasm-backend.eli生成。该独占测试进程先复制真实bun:test
全部导出，SHA认证原档，mock.module只转发注册接口：仅两个完整精确标题
各恰一次替换为维护Eli callback，其他注册/describe/hooks逐一交真实框架。
import完成后显式mock.module恢复原快照，不用skip/filter、不改runtime。

新增 direct-wasm-registration.eli负责真实注册转发/计数，独立维护B覆盖
未知标题原callback/timeout/this/返回、精确替换、重复/缺项拒绝。新增
direct-wasm-affected.eli负责共享一次原算法三代编译：Emacs seed g1，前代
逐个compile_string_with_source_map全部compiler模块→g2/g3→buildBackends；
公有seed CLI独立oracle，保源IR/zeroimports/WASM bytes三代对比与GC资源。
两页面复用既有managed-browser-transport真实HTTP和纯Eli页面模块，无JS串。
reflection页面保5mode×原完整字段read/has/descriptor/keys/names/symbols/
prototype观察、普通缺失/身份/调用/effects/GC黄金；函数/描述符/原型在源
fixture内作实际身份与flags的独立直接观察，新增真正不支持WeakRef反例。
涉及fixture旧js*逐一改纯Eli globalThis访问。ValueJSON页面由并行负责人
完整保原数据/两GC阈值/8192slots/16MiB/IR/byte对比，并只记有限phase/index。

目标源码树：tests/eliscript/direct-wasm-{backend,registration,registration-tests,
affected,reflection-page,value-json-page}.eli；对应canonical/helper生成物与
maps保持ignored，原档真实字节保留；bootstrap映射由并行负责人接入，
Make新增registration独立B但保canonical全组入口。旧source locator绑定原档，
实际执行仍canonical，不能将生成代码SHA冒称原档。

- [x] A：两个原失败边界、转发责任/恢复、共享准备/页面接口和完整黄金设计齐。
- [x] B：注册转发独立回归及真实reflection正/负例写齐，未运行。
- [x] C：六份维护Eli、原档/生成映射、ignore/Make全部写齐；原public-source来源由并行负责人接真实archive绑定，源码冻结。
- [ ] D：父统一生成与完整原group，所有原注册真实执行；诊断不替代验收。

该批统一生成首次只有 shared helper 的两处 letfn binding 多余右括号导致
read syntax 失败，其他20映射已完成。两处括号同批修齐后，受控仅重生成该
helper+map，冻结C62 stage3编译成功，run98d4d526a3004baa98300e5fe9dcf9be、
exit0、cleanup完整，日志c62-direct-affected-brackets-generate.log。此为生成
接线证据，两个实际browser case仍待统一D/已授权单例诊断，未冒称行为通过。

统一D真实canonical导入发现同步require不能加载build.mjs顶层await的原档
依赖图。修复仅新增第7维护模块direct-wasm-registration-install.eli：把既有
真实framework快照、archive SHA认证、两精确标题注册转发放依赖安装层；
canonical静态先import安装层，再sideeffect import完整原档，最后调用
completeDirectWasmRegistration→finally显式restore。afterAll亦幂等restore并
清理共享scratch，避免原档注册异常残留。已有B的普通注册/精确替换/缺失与
重复拒绝/真实callback与timeout保留不变；无新JS串/动态import/语言功能。
安装层source→helper及map加入映射/ignore与source闭包，不改archive bytes。
此修复A/B/C齐，接下来仅生成2映射并按授权执行原canonical完整组一次，
不再试跑反射子例；ValueJSON先前208次invoke真实225秒通过独立保存。

该静态ESM安装方案两映射生成成功；首次完整canonical启动已进入原档注册，
但performance wrapper调用真实test.skip前暴露转发器Object.assign漏掉Bun
非枚举修饰方法，尚未执行case就退出1。原日志c62-direct-canonical-static-full.log，
run2ea0c17a3a14463bb285766ab71a6be4、cleanup完整。同批最小修正转发器
使用真实test全部own-property descriptors（仅排除函数自身name/length/
prototype/caller/arguments intrinsic），保持skip/only/each等真实方法及flags。
B新增非枚举skip身份/真实调用/descriptor完整对照。A/B/C齐，不将首次启动
失败算验收通过；后续完整组统一执行，不能把性能延期冒称通过。

父完整canonical第二次仍在注册前报test.skip undefined，证明Bun宿主修饰接口
不能用own descriptors枚举复制；假对象B通过不足以证明该能力。最小统一修复
forward改Proxy(actual-test)：apply保原receiver/arguments，仅精确两标题改body/
deadline；get无枚举、无方法猜测，Reflect.get(target,key,target)。原descriptor
B保留；新增真正bun:test宿主skip可调用/身份相等B及实际skip能力fixture，
其明确跳过的唯一body仅验证框架skip本身，不是语言用例/性能通过。新B显式
依赖Bun，仅由Bun执行。A/B/C齐后只生成两映射并执行该真实注册B一次，
完整canonical统一组交父，禁止再次盲目整组重试。

上述两映射实际受控生成exit0；唯一真实Bun注册B执行3pass/1明确框架skip
fixture/0fail，run e0057e5d513342c184b6d28775436355、cleanup完整，完整日志
c62-direct-registration-proxy-real-bun.log。实际宿主skip可调用且身份相等，
假对象非枚举descriptor与原注册转发/缺失/重复断言均通过；未重跑canonical。

父完整组实证静态archive的已链接bun:test绑定早于安装层mock，counts0而
complete明确拒绝；不继续依赖静态求值顺序。最终接线使用Bun既有CLI
--preload，在entry链接前安装维护注册桥；canonical复用已安装模块再完整
import原档。fixtureChildArguments对3个精确canonical（direct、action、
workflow）加各自维护install preload，保原--smol/test/timeout/files与顺序，
generic fixture preload保持先行并幂等不重复；非canonical原档/普通文件不加。
CI renderer同样给原6file命令加direct真实preload，所有原输入/性能延期不变。
B补三路argv原字节、环境开启/普通环境、幂等、ordinary拒绝误接；workflow
新增缺注册preload负例。A/B/C整批齐后生成相关工具/B与canonical，再依授权
以显式两preload标准命令完整运行canonical一次，保存全部真实case结果。

该5映射生成与workflow写入exit0；按上述双CLI preload启动完整canonical
一次，仍在模块body complete时counts0→missing精确标题，0case执行，
run3422381ca24447519dfb5fb50a43bf73、cleanup完整。失败日志
c62-direct-canonical-cli-preload-full.log保留，不算语言通过，不再原样重试。
两目标原注册均在browser describe callback内；body校验是否早于Bun实际
describe收集仍需区分，不能把counts0单独冒称mock有效或无效的证明。

父确认正确框架边界：deferred describe注册尚未完成时不得立即complete/
restore。最终维护registerDirectWasmCompletion只在真实beforeAll做严格每标题
恰1校验与finally恢复；afterAll只幂等恢复并清理。canonical仅静态import，
不在body校验。B新增延后注册前不校验/不恢复、实际注册后beforeAll成功与
缺少标题beforeAll失败仍恢复，两路径保严格计数。此批A/B/C齐后生成4映射，
依授权接续完整原canonical一次，不改原档/不跳case/不改输入黄金与资源。

### C62 D 收口：复用原有明确 Error 标准反射合同

正确完整direct组82pass/2明确skip/1fail；唯一mode3 Error keys差异已经由
ignored同fixture/公有Seed/真实WASM五mode诊断确定，其余4mode完整相等。
现有tests/wasm-managed-function-properties.test.mjs:10–13/385–407明确要求
managed Error keys=[]、names=[length,name,prototype]，host原生extensions
完整单独保留，descriptor.errorReflection不声明isError或栈API。新direct页面
错误地把宿主Error额外字段当标准面比较；不改compiler/runtime补宿主私有面。

目标只维护测试：新增direct-wasm-error-profile.eli导出严格
assertDirectReflectionProfile(mode,actualKeys,actualNames,hostKeys,hostNames)，
mode3仅以原独立标准面断言，其余mode仍原顺序/完整字段严格host对比；返回
完整host原names/keys副本及分类extension名，不丢宿主事实。页面逐项比较原
oracle全部host keys/names与真实global Error，对每个extension保原read与
descriptor/flags/identity完整观察并打印明确interop记录；symbols/prototype、
所有原五字段、4轮GC后身份/调用/effects、bytes/IR/roots/goldens不改。
新增纯node:test维护B以实际当前宿主Error观察验证：三项标准面严格、host
完整观察不变、Node24真实stackTraceLimit/captureStackTrace/isError差异明确
归于未声明host面，错误标准Error面或任意非Error差异仍拒绝，绝不广泛filter。

- [x] A：原已验收合同、真实唯一差异、精确5参数helper/页面/B边界写齐。
- [x] B：真实宿主Node反射分类/不可变快照/错误标准面与其它mode拒绝写齐，未运行。
- [x] C：仅测试helper/page/B、ignore/Make写齐并冻结；2映射/maps由并行负责人接线，corpus资产待父安排。
- [ ] D：父协调原受影响组；正在运行的正式源快照不变，不把新测试修复冒称旧C62通过。

首次beforeAll完整命令漏ELISCRIPT_TEST_FIXTURE_PRELOAD=1，虽显式preload模块
却未启用其真实环境，原temp程序出现package解析错误；该次环境无效，不算
功能验收。确认自有guard PID/start后取消，仅本树回收cleanup完整，run
b7dc7024bb2541008631408120d14e19，原日志c62-direct-canonical-beforeall-full.log
保留。按父指令补完整CI flag后执行一次正确环境组，日志另存
c62-direct-canonical-beforeall-environment-full.log，不能用旧局部pass代替。

### C62 集中证据组根因收尾（保持原门禁）

A：真实AC24新finalizer canonical ignored，需要沿既有独立Emacs全module/map
机制增加第三个精确source/output pair；原core合同canonical不改。B扩fixture
tracked源与全部source/module/map篡改、源未tracked、map缺失、未知路径及
编译失败否例到第三pair。stack原黄金拼写迁移错把输入坐标尾缀放进generated
file，按原rawsuite的#loaded恢复，非改生产映射。sourcearchive新稳定资产
21缺口必须真实绑定已执行record，不允许把零缺口断言改21；literal全对象
模型需纳入同批明确维护transport并逐资产真实认证，不忽略未知差异。
C所有本批源齐后交父统一源工具生成；不重跑完整bootstrap或100k/性能。

D新增语料覆盖漏线集中处理：number-spelling-selfhost-driver实际仅ERT调用的
JS宿主驱动（stdin compiler requests），不是用户语言fixture；源原样移入
`tools/testing/number-spelling-selfhost-driver.eli`，ERT唯一编译路径同改，
完整独立Emacs/selfhost输出比较不变、不删除测试。真实可移植的managed
language-intrinsics fixture仍保留并补准确共享recipe；另外16 browser
source fixture和3个维护suite证据绑定原实际完整record，不放宽零缺口断言。
root驱动位置迁移A/B/C齐，D待最终ERT；其余recipe接线由其原负责人完成。

C62新增两项回归自身接线错误已按同批D真实日志修齐：borrowed Get的Symbol
构造改当前合法globalThis.Symbol引用，1024轮直接调用原公开objectGet，
不经本来就会分配调用帧/argv的source invoke来伪测“无分配”；原四类黄金、
signed0、GC和统计断言不变。模块压力测试所需module-begin等原实现本来不
公开，测试image在同一runtime完整Eli源码模块末尾只追加这些既有函数的
export，保所有原实现/生产export列表不改；raw helper新增明确function断言。
原32槽/96退栈frame/40000字节resize/phase2 auto0容量否例/roots均保持。
此批A/B/C齐，不局部运行，随下一次受影响集中D生成/验收。

C62 missing coverage 真实归属收口：16个browser静态输入从已认证migration plan
绑定现有完整replay的实际suite/fixture SHA，未新增执行或缩原断言；fuzz/bit
新实际入口的两个locator只补到原完整record，原source/hash/regions/时限不动。
runtime-scan原freshness title不改，独立source-bound-performance-report-case
绑定维护Eli实际form/报告/生成入口等5份真实字节，default仍required-by-original-
gate，显式功能模式明确DEFERRED / NOT ACCEPTED、performanceAccepted=false；
不作为语义record通过。宿主number-spelling driver由负责人移到tools/testing，
原ERT全证明保留。真实language-intrinsics完整原fixture新增共享sequence，
42次公开调用覆盖原24个BigInt输入、8个nullish输入及原choose/conversion/
qualified公开黄金，重复完整项目必须同产物；原raw ABI/非法IR/异常完整suite
仍独立保留，没有伪称共享输入record覆盖全部raw suite。
B增加fixture全bytes/42黄金/重复产物及性能报告gate不冒称通过；literal全对象
比较纳入明确列出的真实工具/runtime资产与三完整维护suite迁移，未知原reader
record篡改仍必须失败。原完整corpus的零缺口断言未改、未运行。第三finalizer
alias沿独立Emacs全mjs+map，并扩全正负；stack期望恢复原#loaded，非改映射。
另按负责人清单只补direct-wasm六mapping+source-map，其迁移实际源归属待齐
后只收必要project-entry原断言档案身份，不扩browser suite计划。

C62 direct-wasm同族真实来源接齐：负责人确认原档SHA f0fa57…876c2、全部6组
维护Eli/canonical/helper/map及注册转发真实关系后，project-entry public-source
recipe的original.suite/sourceSha切为原archive真实身份，assertionSource给完整
原档region；directWasmSourceMigration另列实际canonical执行suite和6组真实
维护/生成/maps全部19资产，原public-input host/原fixture/record/coverage不变。
全套replay实际执行canonical不改。B补原档固定SHA、完整实际资产逐bytes证明
与即使自洽伪造新原档hash也必须拒绝的负例；不把当前canonical当原raw档。
全部C交父统一源工具生成，不改正式compiler/runtime，不运行局部测试。

### C62 D：本批已取得的原门禁证据

- [x] 最终冻结编译器完整 bootstrap 与独立 verify-bootstrap 成功：313 个
  stage2/stage3 产品逐字节一致，产品 SHA256
  `b45d700df68076e85ff2f2578887d03f5c928d5fef3e8282cdec9573738578bc`。
  原日志 `c62-main-bootstrap-release-complete.log`、`c62-main-verify-bootstrap.log`；
  后续仅测试/宿主工具修改不冒称已复核新的正式编译器源码。
- [x] 原正常 `check-contracts` 全部成功，未跳过 retained acceptance：
  `c62-main-contracts-final.log`，受控退出0、完整清理。历史 final/matrix
  来源认证通过，14 项当前性能来源仍明确 DEFERRED / NOT ACCEPTED。
- [x] 修复批次受影响运行时回归与注册转发共9项全部成功：
  `c62-final-runtime-regressions.log`，受控退出0、峰值约1.32GiB、完整清理。
  保留原资源否例、1024次无分配Get、初始化压力与调用者根断言。
- [ ] 证据测试组仍需修复其真实框架/特殊值传输/包作用域接线；正常CLI门禁
  通过不能替代这组未通过的测试。直接浏览器原档的异步依赖仍需纯Eli接线。
- [ ] 完整Value/JSON同一真实页面正在按原输入和原资源运行，已有有限索引
  持续前进；未完成前不宣称通过，也不因为旧120秒总截止去重复启动。
- [ ] C61旧候选完整三输出继续收集诊断；其旧来源结果不认证C62当前来源。

C62 证据组14个失败按四个真实根因集中收敛：A保持普通IR拒绝BigInt，
仅language-intrinsics共享recipe的exports合同显式标注观察值编码，沿既有
$eliscriptObservation恢复BigInt/undefined/IEEE特殊值；B补完整JSON回放和
未知标记/错误decimal拒绝。来源认证仅缓存实际成功且全部维护源、生成module/
map、helper及compiler目录字节相同的证明，每次重读并保Git tracked检查；
不缓存失败，B补同进程compiler/helper篡改否例。维护Eli的证据用例采用明确
300000ms功能截止，原语义/性能断言不变。两个已有维护测试的临时输入统一
放在prepareFixtureEnvironment真实包作用域，子进程原命令/输入/黄金保留。
literal模型只扣除已明示fuzz/bit locator，未知差异仍全对象比较。全C后
统一生成受影响源、刷新parity→stable并复验7族与正常check-contracts。

C62证据修复统一D：7个受影响工具/测试源全部生成成功，日志
`c62-evidence-final-repair-generate.log`；7族76/76用例全部通过，零失败，
日志`c62-main-evidence-repair-final.log`，受控退出0、峰值约3.1GiB、完整清理。
包括原IR非法BigInt、完整零缺口corpus逐字节回放、完整来源模型比较、全部
独立Emacs源/module/map/helper/compiler篡改否例及原独立Seed/CLI结果。
尚待其它已确认修复冻结后的最终派生刷新及当前候选完整三输出验收；本证据
组通过不替代这两项，也不认证后续新改动。

项目CLI真实stdin修复的来源闭包：仅原project/evaluation记录与原含project
资产的记录，追加project-cli维护Eli、实际canonical/map和原字节archive；
archive固定SHA79980b…5cd82独立拒绝改写，canonical保实际当前SHA。
bootstrap-project-runtime原全证明增加这4个真实依赖的逐bytes/hash检查，
不改记录/覆盖分母/黄金。与负责人的CLI新B一同最后集中生成验收。

C62 Action源码发布收敛：原应用失败来自6个tracked生成产品和两个过时
indexed-artifact断言。原打包Eli→builder/browser→Node24 bundle流程保留；
原action/workflow两个完整测试档逐字节归档，canonical由维护Eli登记桥接，
只替换action两个过时case与workflow一个remote-artifact假设，其余全部
原hooks/输入/黄金/扫描/Node消费者真实执行。新增dogfood-action-source.eli
校验实际源码Git index全bytes+manifest SHA、ignored/untracked准确产品库存、
两次6产品逐字节一致；负例完整保留产物篡改/缺失/额外文件，并增加缺tracked
源、staged源漂移、误tracked产品。两个install维护模块固定原档SHA并要求
每个替换登记恰好一次；B未通过不能宣称完成。去除dist的ignore例外及6产品
index，保本地实际生成物。consumer模板改固定SHA取源码→安装Emacs/Bun/
Node24→原bootstrap+package→local action；发布/部署未授权，不执行外部发布。
补5个source映射/ignore，更新当前源码发布合同。全C齐后一次生成并集中运行
原两个完整应用suite及新来源负例，最后刷新派生身份，不重跑其它19个应用。

C62 Action D：注册完整性检查放在真实beforeAll，原两个完整suite按原
functional runner及精确preload执行，27/27通过（action15、workflow12），
没有取消或遗漏case；日志`c62-main-action-source-repairs.log`，受控退出0、
峰值约559MiB、完整清理。全部6产品重复构建逐bytes比较及源码/产品所有否例
通过。6份生成产品仅移出index并忽略，未删除本地产品，未发布/部署。

最后来源B D收齐：sourcearchive/literal50项已通过；deployment专项4项因
fixture preload将TMPDIR改为源包内而误跳过消费者部署。只修维护B的disposable
workspace：同步保存/清除/恢复TMPDIR/TMP/TEMP，以宿主临时根保持真实外部
consumer作用域，原全部产品/篡改/包身份断言保留。surface命令库存只将
eliscript-build的implementation指向真实原parser archive，实际bin/canonical
入口不动；新增B认证维护Eli确实直接委托该parser，原严格9选项扫描不删减。
不修改正在三输出运行中的corpus/production源。二项集中复验后继续原正常
contracts，待验收不把上轮source-only结果冒称本轮全部完成。

deployment专项与surface真实来源连接的集中D：20/20通过（部署6项、surface
14项），日志`c62-project-runtime-surface-final.log`，受控退出0、峰值约1.49GiB、
完整清理。仅`contracts/public-surface.json`的eliscript-build implementation
一字段改为实际parser archive，原9选项严格扫描及全部否例通过；该字段属于
stable聚合身份输入，因此`c62-final-complete-contracts.log`准确保留identity
stale失败。按负责人要求，活动三输出保启动时实际snapshot/manifest，不中途
刷新stable、不拼接伪通过。此纯来源元数据的真实派生刷新和正常contracts仍
待活动运行结束后统一处理，20/20证据不能替代该未完成项。

C62 原门禁剩余批：A固定五族根因和修改边界。repository-integrity现有
Eli shim认证真实原archive固定SHA及5原title，再static import原全部assert；
5个manifest locator指真正Make执行shim，原断言/门槛不删。package-surface
将明确选定的bootstrap receipt环境转给prepack Make，不寻找旧候选/重bootstrap；
prepack复制真实stage3的D等负责人许可，避免活动run读取产物漂移。onboarding
ELI-A0001原期望保持，check-cli按project-cli相同仅fd0同步读取迁移Eli，原
parser全API引用archive。retained两族各5case完整原档不改，仅两个fresh阳性
在真实Git measured-source工作区执行，证明对应报告来源而非当前root性能。
CI维护Eli修复5实际失败case，fake transport由真实args最后file定位并完整
校验--smol/test/300000时限，原ordinary2并行/exclusive/取消/全序结果不变；
browser原9jobs/3engines/all suites保留，补真实preload/timeout期望。
原raw仅只读归档，所有新逻辑Eli；registration真实beforeAll检查、实际CLI
preload专属三新入口，未知旧case/hook全部原样执行。全B/C齐后集中D，不改
formal compiler/runtime/corpus工具，不刷新活动stable/parity。

CI最终窄实现保持原所有scheduler回调/信号/结果断言：仅维护spy fixture的
mockImplementation适配器在调用原四字段fake之前独立校验完整真实argv
（含fixture preload和原300000时限），新增deadline/filter/file变造否例。
唯一被替换的browser case保原9jobs/3engines/全部6suite及所有架构/保全断言。
retained与CI各原全档固定SHA认证，真实beforeAll注册完整性与结束恢复；
source-only checkout另携带project/check两个维护CLI源，不改变包版本。

C62 原始 Emacs/CLI 全量集中D已收齐新失败：ERT248项中246通过、2失败；
原4个CLI脚本3通过、project CLI失败。两处未保存buffer/stdin失败同源：旧
project-cli用fs/promises.readFile(0)，最新LTS Node不接受数字fd；由宿主
负责人维护Eli包装真实stdin，保原parser/config/execute与全部原CLI断言。
另emitted-name-shadowing原8组Seed/selfhost黄金生成在仓外临时目录，编译器
当前真实默认Unicode runtime import无法解析。根因是测试程序包作用域，非
名字语义；只将一次性生成目录放到被忽略的项目_worktree，仍用Node加载并
执行原8组全部assert，最终清理目录，测试生成JS从不进Git。
- [x] A/B/C：上述两个根因和完整原测试期望确定；root的alias目录修复已写齐。
- [ ] D：与stdin宿主本批实现齐后，统一复验受影响原ERT/CLI；原失败日志不删。

C62 该批原门禁收敛证据：
- [x] 来源/保留报告/历史来源/生成证据/完整语料归档/严格字面量模型/源码调试
  7文件共76/76全部通过，`c62-main-evidence-repair-final.log`，退出0、完整清理。
- [x] 严格字节编译原命令成功：`c62-main-strict-byte-compile.log`，退出0。
  后续新Elisp接线仍纳入最终受影响编译检查，不能拿旧结果覆盖新修改。
- [x] 原ERT两失败均已真实复验通过，原4个CLI全部通过：
  `c62-main-cli-ert-repairs.log`。该日志整体退出1来自新增B接线，非原6项失败。
- [x] 新stdin回归在helper补明确测试root后2/2通过，五种实际Node stdin模式
  全部运行/计数正确：`c62-project-cli-stdin-final.log`，退出0、完整清理。
  原始stdinSource空串与UTF8、磁盘源码不变、真实产品执行均保留。
- [ ] 原应用门禁24文件完整收齐，19文件成功、5文件失败。
  `c62-main-original-applications.log`；同根修复分工为测试注入head时机、
  真正的页面/Worker探针依赖、经典脚本自包含证明、尺寸性能显式延期及
  action源码构建/生成产物发布边界。只修原门禁阻塞，不改正式编译器语义。

C61旧候选诊断已因来源被C62修复批次取代而主动结束，并非以运行时长或CPU
阈值中断：保留完整已写记录、失败、源档和所有日志；最后完成索引JS695、
WASM581、native541，其余未完成，不能算任何完整三输出验收通过。受控运行
`79effd29198f41d09a1bece9608802d5` 明确退出125（主动结束主任务后回收其后代），
cleanup_complete=true；现场所属PID已核对全部退出。旧multimethod负载自然
结束于真实capacity错误，未被当死循环杀掉。最终必须使用冻结当前源的新
候选完整运行，旧部分结果不拼接、不冒充新来源通过。

### C62 Node 原门禁：真实 runtime 图与 fixture 包作用域

- [x] A：原242项收齐211通过、28失败、3跳过，保留
  `c62-main-original-core-node.log`。本批只修测试设施：
  `compiler-host-scope.eli/run-node` 现VM linker仅math和capsule，改为相同
  context内缓存真实math/unicode-case/unicode-case-data模块并递归链接其真实
  import；capsule仍原实际命名空间，未知依赖仍拒绝。流程为原程序→真实依赖
  图→原冻结/覆写语义断言，不stub、不删除默认Unicode。
  `emitter-tdz-seed-parity.eli`、`wire-error-report.eli`与
  `managed-module-graph.eli`三类仓外scratch改为现有
  `prepareFixtureEnvironment(root,process.env)`的真实包作用域目录，原文件名、
  Node加载、throws/TDZ/identity黄金和finally清理保持。
  `compiler-matrix.eli/original-gate-fixture`复制真实math、Unicode实现及数据
  三源并逐字节断言，保持隔离fixture而非替换为root生产语料。
- [x] B：直接复用原8项host-scope、8项Seed执行、3项graph、3项wire与原
  matrix identity否例，完整断言不删不改。原3项toolsCLI及1项archiveDebug
  已支持 `ELISCRIPT_BOOTSTRAP_MANIFEST`，使用实际冻结candidate62 manifest
  并执行原认证/篡改否例，不增加默认选择猜测或放宽认证。
- [x] C：五份维护测试一次写齐，正式compiler/runtime/corpus生产源不动。
- [x] D：父统一生成并运行上述受影响Node组；显式指定真实候选manifest。
  活动三输出仍按其启动snapshot记录，本批设施源不冒充已经验收。

该批集中D已完成：七个受影响Node文件82/82通过，真实指定C62 manifest，
`c62-main-node-facility-repairs.log`，受控退出0、峰值约2.60GiB且完整清理。
原Bun库存297文件的首组在完成68文件后被内部8GiB监督器终止；
`c62-main-original-core-files.log`保留14个失败文件及未启动项，绝不记为通过。
已按原Make库存扣除真实已完成68文件，继续剩余229文件收集独立失败，
`c62-main-original-core-remaining.log`，不重复已通过文件。

IR ingress原文件混有已取消的二进制编译器运行形式。直接受控运行中，
JavaScript编译器四项原始用例均实际通过（单IR、错误恢复、完整项目图、
原始/typed memory ABI）；日志`c62-main-original-ir-ingress-controlled-complete.log`。
随后主动终止以避免进入已取消host，退出143、cleanup_complete=true，
峰值约21.12GiB；本次整体退出不是成功，不能冒称完整文件通过。
后续将该文件纳入原字节SHA绑定的混合库存，保JavaScript四项真实执行，
WASM/native八项明确取消；不扩大runner、不为8GiB旧额度反复调试。

平台选择以最快、最简单、最利于完整交付为准：一个当前稳定版或最新LTS
完整通过即满足当前基线；既不主动追求不兼容，也不引入额外旧平台兼容工作。

C62输出收集新增根因批次（当前产品保留原来源，以下改动待新来源验收）：
- [x] A/B/C：源码调试原5项在投射产品中必须继续使用已认证原source root
  读取fixture、包和合同；`source-debugging.eli`从真实运行环境取原root，
  不再把build模块的投射产品目录当成源码包，selected compilerDirectory不变。
  复用原5项完整正例及已有child错误/asset篡改否例，无新语言设计。
- [x] A/B/C：literal-runtime child失败必须展示完整command、exitCode、
  stdout和stderr。Eli的空字符串为真，不能用`or`模拟JS的空字符串回退；
  改明确错误记录，原全部child输入、返回码检查、黄金和清理不变。
- [ ] D：集中生成本批工具，并以新源实际运行原测试/selected产品；
  C62旧失败日志保留，不手改既有产物、结果、来源或哈希。

Error反射的既有标准合同与宿主扩展记录已分开完整验收：
`c62-main-error-profile-repairs.log` 2/2通过（包括真实Node24全部宿主字段
记录、标准面/顺序/其它构造器差异拒绝）；原浏览器失败项真实Chromium完整
执行通过，`c62-main-browser-error-profile-repairs.log` 1通过、79按名称未选择，
退出0且完整清理。此前全浏览器组的其余82通过证据仍保留；本次未选择项
不是新增通过数。未改正式编译器、运行时或全局Error/Object/Reflect。

### C62 主线协议失败：原生 Object.create(null) 创建真实 owned 对象

原000540 core-set完整program唯一断点重放证明：namesRaw24120793 kind14、
definitionRaw23072265/record30411907/protocol3146470均kind13，仅
operationsRaw1050165 kind35；role=collection.ICounted。run
7c229896d9944f398d23949609b0501c原输入/产物/有效资源不变、exit1、cleanup
完整，有限原日志c62-protocol-definition-inspector-original.log。源头是
stdlib/core/protocol.eli:22–23 captured真实Object.create(null)返回host对象，
而decoder严格要求owned13。不是GC或brand scope问题。原私有闭包decoder无
注入memo/identity接缝，不迁整个legacy factory，也不伪35为13或克隆operation。

父选定最小合法实现：managed-host-object-provider.eli固定native intrinsics
加入create，仍以捕获真实身份与native source校验；realm.native-object-operation
仅name=create、原source-operation Call count=4、唯一operand raw null0匹配。
call-native-object-operation对该匹配调用既有raw value-object-new(heap,0)，
得到真正新owned13、null prototype、唯一identity。其余create（非null/
2参数/用户Proxy或替换）原handler原路径；不改正式compiler/runtime/legacy。
原异常/帧/首错finally不变，必需exports完整校验加入value-object-new。

B在现canonical真实源fixture/API补createNullObject/createWithPrototype/
createWithProperties/createThrough/freezeValue，原reference/hostWASM/native
exercise共同覆盖null原型、新建不同identity、真实own定义/flags/冻结；原
target rawtoken.kind=13独立断言。非null真实host prototype identity、2参数
真实descriptor getter一次/flags、用户Proxy replacement返回同一sentinel并
保receiver/参数均走原路径。父统一重放所有同族原完整program（core-set、
core-language、persistent-tree-walk/zipper/sorted、lazy-sequence、interop/js、
vector/map-patterns、multi-arity、macro-generated-names、stable-core-values、
persistent-queue、language-equality、value-dispatch等实际收齐项），原golden/
输入/资源/身份全部不改；不重跑冻结C62冒充新源。

- [x] A：实际kind35根因、唯一创建快路径、精确provider/realm接线和严格范围写齐。
- [x] B：canonical全source正例/原路否例、raw13真实创建及非null/2参数原foreign35断言写齐，未运行。
- [x] C：provider/realm最小实现写齐并冻结，parent统一D；不改decoder品牌/GC。
- [ ] D：真实WASM/native canonical与全部同族原program，新source新候选统一证明。

### C62 原Bun门禁设施与冷字面量IR完整字节

- [x] A：完整原68文件结果保留，新增失败按现有真实合同收敛；原剩余文件
  单独继续收集，不重复已通过文件。取消resource-supervisor扩范围迁移：原
  8GiB内层门槛不变，IR ingress原JS路径直接由外部controlled-run硬24GiB
  保护，不在同源8GiB上反复重试。
- [x] A/B：IR ingress原13项完整源SHA
  `510213d89769be93ce574f11de72061e2f7ff5605cfb792d79388aa419807183`
  加入final-functional-scope唯一库存；仅精确取消WASM/native编译器运行
  8项，保JS编译器4项三输出以及Worker身份1项，cancelled永不计passed。
- [x] A/B：独立parser旧合同3原suite保全字节和SHA，专用维护Eli preload
  仅替换spawnSync argv中的准确CLI路径或旧eval的唯一准确CLI fileURL。
  参数、stdin、原脚本其它字节和所有原断言保持；未知坐标原样，重复坐标
  拒绝。此证据属于独立parser合同，不冒称现公开releaseCLI验收；后者仍
  要求真实stage3认证。新B覆盖只换1处、输入不变、未知/重复/未声明拒绝。
- [x] A/B：原完整artifact独立IR比较发现冷literal canonical序列化再恢复
  改变Object.keys顺序。私有packing改为原完整schema/value验证后存原wire，
  私有恢复JSON.parse保顺序及-0，公共canonical协议不变。既有冷事务B增加
  cold/warm rawIR完整bytes及原独立frontend比对；原所有literal大图独立
  比较及失败恢复仍严格。当前C62冻结产品不变，新source须新候选证明。
- [x] C：测试设施全部源、原档与生成映射一次写齐；不新写JS实现。
- [ ] D：父统一生成受影响设施，集中原失败组与新B；未通过不计验收。

C62 原门禁五族整批 C 已齐并冻结：check-cli 原档 SHA、维护 fd0 读取、
project-host 初始生成/正式 tool 映射与 ignore；conformance 五项真实执行
shim 及固定原档 SHA/title 认证；CI 三维护源与 retained 五维护源的完整
原 suite 重放、专属 preload、maps/ignore 全接齐；package prepack 显式
receipt 环境传递与维护 CLI 源发布清单完成。原 archive 全字节保持，
未重测历史性能，未改历史 hash/report，未刷新活动 stable/parity。

source-debugging 原完整 13 模块 record 当前确有 runtimeProfile=compiler，
transport 保留该字段，现 classifier 已仅取消 binary compiler host，JS 五项
仍保留；不增加取消规则。新增单项 B 证明实际完整 graph/原五项与 JS 保留，
以及相同 ID 的普通 user graph 不被取消。project-entry 旧 D map 失败属于
当时生成物未同步维护源；现七组 map 坐标及 sourcesContent 实际相符，
严格生产校验保持。集中 D 必须真实重验，不能用此来源观察代替通过。

- [x] A/B/C：五族根因、全旧有效断言复用、必要新否例与全部实现/接线齐。
- [ ] D：负责人集中生成、原受影响 suites 与正常合同；package prepack
  写入 root dist/bootstrap 的实际执行须与活动三输出协调，避免产品漂移。

本批设施C收口：
- [x] 完整bootstrap emitter原197行断言迁维护Eli共享能力
  `tools/testing/bootstrap-emitter.eli`；普通selfhosted测试与selected-artifact
  host可共用`runBootstrapEmitterAcceptance({compilerDirectory})`。提供目录时
  不另建编译器、不删除调用方目录；只把原basic产物原字节写包scope目录实际
  运行，保完整Seed输出、map、IR否例、VLQ及30秒原注册时限。
- [x] artifact原3项、metadata原3项、original-gates原7项设施能力迁维护Eli，
  其余旧case通过原档原注册继续执行；精确title替换只换callback，保所有
  原注册参数/时限，完整原档SHA与缺失/重复title都严格检查。私有测试单元
  由维护Eli读取production Eli原函数体并自举，词法注入原IO，禁止JS模板。
- [x] original-gates隔离根补真实三runtime源及逐字节断言；fixture资产服务
  显式base64编码，完整原hash/bytes与真实源一致。sequence当前真实公共导出
  cell用requiredManagedImports验证，不再错误声称零import；原1024/内存/
  timeout/auto合同不变。历史case locator读保字节原档，独立新增回归不冒充
  历史selected case；其全部历史case仍逐项要求selected-session记录。
- [x] 四旧canonical源码保原字节只读历史用途，新生成入口均使用selfhosted
  文件名，Make在原位置运行维护入口。原档SHA依次为bootstrap-emitter
  `1fb3dc7ac20d64c2b6cd392fa6980451d01269f4dbd3f2c91483bb3e6fda6ed0`、
  artifact`e423e56f00966d7239a4e54884827dc94a5f69813d3fae303ce743d2e0680705`、
  metadata`ca4ea14ad091edd2be8404e739b1aa54e19c48b3a257df526db5f8a609c3803d`、
  original-gates`1835d53f92a916f31adaee5898e2c76efd6a8dfe772f1dff9016a11c281a301c`。
  全部生成路径和map已ignore，原bootstrap-emitter语料record明确另接维护
  能力而不伪造原source/hash。独立CLI preload接现有fixture argv流程。
- [x] C：本负责人上述全部源/回归/映射/Make接线写齐；没有行为试跑或局部
  编译。明显括号及顶层层级已一次静态收口。D交统一生成/验收，不能把本段
  C勾选当作功能通过。

C62 bootstrap-emitter 真实主线接线：原 SHA
`1fb3dc7ac20d64c2b6cd392fa6980451d01269f4dbd3f2c91483bb3e6fda6ed0`
和原 helpers/body 两完整 span 保留。原 compiler-module-bootstrap-emitter
record 的 selected 13 模块/请求/黄金/coverage 不变；真实执行改为同一维护
runBootstrapEmitterAcceptance，提供 selected bootstrap/compiler 后不重建、
不删除 caller 产品。它保完整原 fixture、独立 Emacs ESM/map 对比、IR非法
输入、VLQ、真实 basic 运行输出与 map源码名断言。独立 corpushost 仅传真实
已认证 sourceRoot/selected 产品，所有新源/生成物/map 均归档真实 bytes；
map 必须 bind 实际维护源全文与相对坐标，未知 record 不适配。新B覆盖原源
SHA/span、同一执行函数/selected目录及源map/原identity篡改拒绝。原档不改，
实际Make/conformance入口指维护suite，parity保原有效原档输入且新执行绑定
原标题。A/B/C 全齐后由负责人集中生成验收；不刷新活动stable身份。
- [x] A/B/C：emitter 单 record transport、原两 span 固定身份、四组维护
  source/module/map 认证、真实同函数 selected host、完整来源B及map/source/
  region篡改拒绝已写齐；实际conformance六处指维护执行入口，parity仍保原
  两项 raw assertion 输入，coverage经精确标题绑定原record，无分母删减。
- [ ] D：本批统一生成全部四pair/maps与transport，并集中来源模型/原完整
  emitter；不新启重建正式compiler，不改旧cohort产物或结果。
- [x] C补最后接线：bootstrap emitter共享能力显式接受sourceRoot，case源码、
  fixture、独立Emacs oracle、普通bootstrap路径、全部子进程cwd和Node helper
  均从该已认证根解析；普通测试默认真实build.root。compilerDirectory始终
  只供应selected编译器模块，提供后绝不重bootstrap。失败保完整stdout与
  stderr，避免空字符串真值差异隐藏首错。未另跑测试，随本批统一D。

### C62 完整 owned-map 报告：功能预算与原 small 容量分开

现状：`tests/eliscript/managed-project-zero-imports.eli` 最后一项完整原始
report（Patterns/countdown 10000、完整 Multi 模块和真实 async-report）在
complete/wasm/complete-original-report 自然结束为 ELI-RT0002；原 small
为 131072 slots、8 MiB 初始、64 MiB 最大、auto=65536。其余 16 项通过。
保留原失败日志 `c62-main-original-core-remaining.log`，不把容量困难继续
扩大为本次 GC/codec 设计或反复长时间重试。

唯一变更树：同一维护 suite 新增私有
`owned-report-functional-resources(profile, deferred, variant)` 和纯配置 B；
不加生产 runtime、工具、映射或新的环境开关。流程从固定 small 变为
`既有 profile=small + DEFER_PERFORMANCE=1 + variant=complete` 才选现有
full-runtime（1048575 slots、64 MiB 初始、256 MiB 最大、auto=4194304）；
其它情况仍 small/auto=65536。原自动GC压力不冒称通过；较大功能heap采用
现有full-runtime的默认阈值，避免每64 KiB扫描百万槽。既有 Make 功能入口已经传递
`ELISCRIPT_SEQUENCE_FUNCTIONAL_RUNTIME_PROFILE=small` 和
`ELISCRIPT_DEFER_PERFORMANCE_ACCEPTANCE=1`，直接复用。

完整 report 的每个 variant 在发射 WASM 前选择其预算和线性内存配置；
pure 对照始终 small。仅显式延期的 complete 打印原/实际预算、实际
profile 和 `smallCapacityAcceptance: DEFERRED / NOT ACCEPTED`，不宣称
原容量通过。所有原输入、10000、输出/identity/throws/roots和显式collect
黄金和真实 WASM/native 执行不变。不开 catch 放行、不跳过用例。

- [x] A：真实终态、唯一选择接口、双显式开关、两套预算与作用范围已确定。
- [x] B：默认/单开关/pure 保 small/65536、双开关 complete 选有界 full-runtime
  /4194304、原预算证据保持、未知 profile 拒绝的纯配置断言写齐，未运行。
- [x] C：同 suite 私有选择与实际 variant 发射/实例化接线、显式日志写齐。
- [ ] D：父统一生成并运行完整原正例和配置 B；功能通过与原容量未验收分别记录。

本项真实D补充：full-runtime旧job持续计算但启动于native方法认证修复前，
VM缓存旧provider，不能作为当前源码验收。负责人核PID归属后取消原guard，
run a5c9583041154ff9bd6be6a55af8626b exit130/cancelled/cleanup_complete，
peak4.62GiB；不是OOM或按时限终止。完整原compiler/backends/reference/
facades及原test源码保在c63-owned-report-retained，未丢失输入。

唯一小n诊断复用该真实compiler/backends，保原四完整模块、53 literal
模块、完整main source及原source-operation ABI，仅另加诊断exports，使用
当前provider和同full-runtime。有限一步n0/1/2分别为[0,-1]/[1,0]/[2,1]；
原Patterns/countdown(0/1/2)全部返回0，不是首轮missing/NaN无限循环。
实际liveValues从20471→20509（n0）→25319（n1）→34898（n2），即n1
新增4810槽、n2新增9579槽；frameDepth始终0，关闭模块并collect后live0。
这证明该同步跨host压力存在显著资源膨胀，不能靠盲增预算/重跑10000收敛。
保留c63-owned-report-small-diagnostic-complete.log与实际WASM/descriptor/
main；run3b3ff8434bd641eb9305bd4b8b6ea3af exit0/cleanup_complete，4.202s，
peak2645491712bytes。小n仅诊断，不替代原10000验收；原容量仍未验收。

### C63 canonical create 真实路由与独立 Node 接线

集中 D 的 canonical raw13 断言实际得到35。生成 provider 已含create，且
register循环确实遍历全部捕获项；真正遗漏为 realm:290 把整个nativeTokens
注册限制为 literalRuntime.brandProbe。canonical真实Object fixture没有
持久字面量库，故此表未建立。去除此不相干前置，仅保现有真实所需exports
完整校验；仅已启用canonical hostObject/source-operation的realm会到达该处，
固定intrinsic roots仍由原dispose逐个释放。真实native identity/native源码
认证、create单null精确路由、非null/2参数/用户替换原路、原raw13断言不变。

同组独立Node完整性回归在Bun父进程误用process.execPath，实际执行Bun而
拒绝Node argv。原spawnSync argv/子测试标题/每target/独立进程及所有黄金
保留，只选择现有NODE_BINARY→NODE→node；子测试明确拒绝Bun身份。

- [x] A：两个真实D根因和唯一注册/启动接口差异已确定，不涉及GC或黄金。
- [x] B：真实provider create认证、canonical无literal仍raw13、Node选择优先级
  和真实Node子身份断言写齐，未运行。
- [x] C：移除无关brandProbe前置、真实Node选择与子进程接线写齐。
- [ ] D：父统一生成后重验完整managed-host组；活动完整owned报告不重启。

### C63 同批最终D：现代宿主 native 源格式与 isolated 完整功能配置

原真实provider捕获B仍拒绝Object.create，而原方法调用语义有效：逐字比较
`function create() { [native code] }`把宿主合法空白格式当成方法身份条件。
provider改为对原捕获Function.prototype.toString的全文做锚定native语法
认证：准确固定方法名、空参数、唯一`[native code]`方法体；仅空白可变，
不接受任意包含native字样、匿名Proxy或用户源码。仍以捕获的实际Object
own data value做token身份认证；B核对全部五个真实intrinsic精确身份，失败
消息保实际native源码；已有Proxy/user override完整用例与raw13保持。

真实Node隔离已正确启动，新增实际失败在canonical-api逐个物化完整导出，
1024 slots/64 KiB初始/1 MiB最大不足。只给该完整不可逆Object完整性正例
增加与上述owned报告相同双显式开关的功能配置，选择已有small profile
（131072 slots/8 MiB初始/64 MiB最大/auto65536及匹配memory）。默认仍
原budget/auto0/16–1024pages；其它压力/否例不改。日志明确原小容量
DEFERRED / NOT ACCEPTED，功能通过不计容量达标。冻结、identity、真实
Node、父intrinsic不变、close后live0/frame0等全部原黄金继续执行。

- [x] A：三项D失败、精确provider认证与唯一隔离正例资源差异已确定。
- [x] B：五个真实方法身份、默认/单开关/双开关配置与原容量未验收断言齐。
- [x] C：锚定native格式认证、isolated预算/memory/日志接线齐。
- [x] D准备：以冻结candidate63 stage3实际生成provider与managed-host两映射，
  c63-host-capture-integrity-generate.log，exit0/cleanup_complete；未运行行为测试。
- [ ] D：本负责人只生成受影响映射；父与其它修复集中复测，未运行不计通过。

### C63 原 raw managed runtime 四项私有布局验收迁移

原 `tests/wasm-managed-runtime.test.mjs` 完整 SHA
`0b240d3dff9164f23edf534b5a79598948b80f001e9316fa0f37e55a40f0fed2`
保为同目录 `wasm-managed-runtime-test-legacy.mjs`。当前 control 中独立
256 个弱bucket已取代未分配slot尾部；碰撞链命中不替换head，small511
同样有独立bucket。原四失败只来自这三项私有布局预设及free-slot分配次序，
不修改正式runtime。

目标树新增维护 canonical `tests/eliscript/wasm-managed-runtime.eli` 与
`managed-runtime-{cases,install}.eli` 两helper。install认证完整原SHA，
仅精确四原标题替换callback，缺失/重复拒绝，其余原case/hooks/参数真实
注册执行；复用既有beforeAll完成注册/恢复真实bun:test阶段。CLI专属
preload由fixtureChildArguments一窄行接入。新case准备仍完整读取memory.eli，
保原gc-named/gc-unnamed/gc-defragment三helpers，并加只读/写实际
heap-named-cache-entry的Eli测试观察helper，不更改任何生产函数。

四项逐一保原512/511/2 slots、字节预算、原GC和16次碰撞访问、非法hint、
stale代际、unnamed同code拒绝、pool真实移动/defragment、负零caller root、
跨heap/retire、tail边界512满槽容量拒绝与清理。bucket观察使用实际helper；
slot尾root counter另作独立不覆盖断言。free-slot测试要求两个新值恰好
重用原两slot集合、互不相同、byte读写不别名、原两旧handle失效，保原
collections=2/live=2，不强制私有分配先后。

- [x] A：真实四失败、完整原档、三维护源/生成map/preload/来源闭包及全部差异确定。
- [x] B：四维护callback完整原参数/有效语义与严格注册身份写齐，未运行。
- [x] C：实际source准备/观察helpers、三维护源、preload路由/B和ignore齐。
  mapping及对应record十资产来源闭包由project负责人同批接入。
- [x] D准备：candidate63 stage3实际生成三个新pair/maps及fixture环境两pair，
  `c63-managed-runtime-migration-generate.log` exit0/cleanup_complete；没有行为试跑。
- [ ] D：只生成；父集中执行完整原suite及其它同批，不能以四case替代原全量。

### C63 response identity 私有默认值检查迁移

原 response 完整25项实际24通过，唯一graph identity segments案例仍要求
私有limit=8388608，而生产session-response-identity-segment-size已经固定
1048576。保原完整1750行到compiler-response-events-test-legacy.mjs，SHA
`dbf2cc1022dd98c05266c32c2e43b596865382713a50f2e4444a7106052154ab`。
新增compiler-response-events/response-identities-install/response-identities
三维护Eli，canonical+两个helpers各自生成map；仅精确原标题callback换成
维护版本，其余24及原hooks真实执行，preload和十资产闭包均完整接入。

维护callback逐项保原limit2/3、300独立index对象+共享getter对象及独立
negative-zero对象、全部303constructor IDs、跨segmentalias、精确-0、getter
一次、cycle/getter throw同一identity/cancel、cursor和segment清理、非法size
及真实consumer重建。唯一合同更新为显式1048576成功/default1048576，
1048577和原8388608均严格拒绝，不把返回值伪造成期望。

真实unit由维护Eli读取完整生产bootstrap/host/compiler-session.eli，保原
全文，仅在原module末尾附加5私有export；通过当前dist/bootstrap compiler
实际编译到owned fixture/host，symlink真实dist/bootstrap、dist/backends与
dist/host/compiler-tools.mjs满足原imports。原正式compiler和source不改，
不复制私有JS body，不另建compiler。fixture结束由原统一afterAll释放。

- [x] A：唯一私有默认根因、三source/map/preload/十资产范围确定。
- [x] B：完整原callback全部有效行为迁Eli，新增当前上限/旧值拒绝断言，未运行。
- [x] C：实际production unit准备、原全档认证注册转发、三pair/maps/ignore与
  fixture专属preload/B写齐；project负责人接来源声明十资产。原corpus没有
  此suite的target record，故不凭空伪造record或分母。
- [x] D准备：实际candidate63 stage3生成全部三个pair/maps与fixture环境两pair，
  c63-response-identities-migration-generate-complete.log exit0/cleanup_complete；
  初次生成的裸NaN引用已改显式globalThis属性，原失败生成日志保留，不计验收。
- [ ] D：仅生成，父统一复验唯一受影响callback；其它24原通过证据保留。

### C63 三份标准库原suite：真实factory的测试入口和功能资源接线

原transient4项ELI-RT0003在旧source名`vector-case/held-state`入口调用时
发生。当前project linker由binding-name导出`vector_case/held_state`，raw
runtime严格按实际descriptor查表；独立JS oracle已使用公开名。core4/sorted5
完整图的旧8192slots/256KiB初始/16MiB最大不足，之后其hyphen入口亦须
按同一metadata正名。不改正式compiler/runtime，不整迁三份700行原oracle。

三原suite保原字节和SHA：transient
`cef9524c8f9e95420ba13b0ce4189ac7e171ea662a92275b89c01c828f4f1f19`，
core`0925889b35d1a8c2f2d0142a0bfe9ff9f2e249d87221ca09afd50f4730673140`，
sorted`84fd970f85e0df39b2efad23a8aa445106954fd9fa8df41d7c5978a70f70f303`。
新增standard-library-fixture/-install/-tests三Eli→两helpers及独立B/maps。
唯一CLI preload先认证恰一原suite/SHA，捕获并转发真实WASM/native factory。
WASM从真实customSection读取descriptor，native用真实lowered.descriptor。
调用facade仅在原name不存在且binding-name结果真实存在时正名；未知/非法
保持原调用与原错误。复制实际api完整descriptors只替invoke.value，保其它
函数/属性实际identity、原receiver及不可扩展/冻结约束，避免readonly Proxy。

只有core/sorted且两个既有显式开关同启、三个原budget精确相等时，选现有
small功能档131072slots/8MiB/64MiB；其余属性/实际WASM bytes/IR/memory
不改，原auto(1)和65536均由原callback原样设置。transient预算不变。每次
显式切换日志记录原/实际预算以及DEFERRED / NOT ACCEPTED，默认/单开关
严格旧容量。所有原case/hooks/独立Node/Bun oracle、GC、identity、throws、
provider真实品牌与close后的live0/frame0完整执行，不catch放行/跳用例。

- [x] A：真实入口名根因、严格factory转发及唯一资源选择作用范围确定。
- [x] B：默认/单开关/精确预算/未知suite不提升，实际descriptor/unknown
  拒绝、冻结api其它identity/原receiver及真实编译小模块metadata回归齐。
- [x] C：三维护源、三个preload路由及独立B、ignore/Make接入；project负责人
  接三mapping/map flags与各suite真实十资产来源闭包。三原suite字节不变。
- [x] D准备：candidate63 stage3实际生成三pair/maps与fixture环境两pair，
  c63-standard-library-fixture-generate.log exit0/cleanup_complete；原三SHA复核
  保持，未运行任何行为测试。
- [ ] D：只必要生成，父集中真实13原注册与新B验收，不把大功能档计旧容量通过。

C63 原剩余门禁资源设施：record-grid完整原文件第二项JS session reuse在
旧内层8GiB终止，保留真实24文件结果与8失败；该项不是已取消的二进制
编译器host，不取消。最小接线将完整`record-grid-selfhosted.test.mjs`与
sequence/ingress一样交现有runFunctionalChild，仅外controlled-run硬24GiB
保护，原全部case/argv/时限/断言不变，supervisor源码及8GiB旧合同不改。
- [x] A/B/C：仅runner文件分类与既有scope回归扩充；证明完整file无pattern/
  无cancelled，实际child首错/环境不变、预取消不启动、监控启动失败保持首错。
- [ ] D：父统一生成runner/B，使用原完整record-grid实际执行并保真实RSS证据；
  没有局部运行或原样小内存重试。

C63集中D的设施剩余1项：original-gates 8/9通过，sequence项目为保原相对
模块图，实际模块filename采用entry的虚拟`.eli`坐标，原fixture物理路径保在
original.fixture；旧测试错误地用物理路径直接比虚拟filename。
- [x] A/B/C：维护断言按实际entry stem对照filename，并保原some存在性断言；
  另严格比entry id、original.fixture及完整entry source与真实fixture全文，
  不删除用例或改变字节、预算和否例。其它14个新private callback及完整
  bootstrap emitter均已通过，不重复其D。
- [ ] D：父只补生成该helper并运行受影响原9case；仍不能以C修复称该项通过。

C63集中D来源根因一批收敛：parity原两emitter evidence已不被Make执行，
必须指实际selfhosted入口；prepareOriginalBootstrapEmitterOptions只将两
准确原标题的构造输入指回原断言档，保原coverage id/13模块/span；transport
恢复当前真实locator并认证原档与实际维护执行资产，防静默漏record。CI原
fake callbacks的spyOn是live import，beforeAll仅complete、afterAll才restore，
保所有原fake完整argv认证在实际callback运行期间生效。conformance旧686
golden落后3条实际新增证据：完整9项suite迁Eli，严格整对象黄金689及三个
域37/139/83，原8类全部负例文字/操作保留；原raw SHA
`ceb5808d9f6e060d2f38606ba9a7d94658d5c79c857bd868432a6017094907c8`
只读归档，实际canonical由维护源生成且ignored，不写JS。
- [x] A/B/C：精确两locator归一/恢复、CI生命周期、conformance全9项已齐。
- [ ] D：统一生成受影响工具/测试后集中同族复验；原retained两套各5/5与
  onboarding4/4真通过保留，不无变化重跑；正常contracts仍必须真实通过。

C63正常合同真实执行已通过conformance689、stable、progress、diagnostics、
parity及debugging；AC-03/AC-21随后准确拒绝已迁移canonical为untracked。
只给conformance与CI两个精确入口增加既有独立Emacs完整module/map重编译
认证（合计五alias）；原source/helper/compiler tracked要求、全部bytes、
成功缓存失效检查与未知untracked拒绝不变。原来源B扩两alias的source/
module/map篡改、map缺失、maintained未tracked及完整原负例；不改合同或
历史report/hash。direct Error profile九pair28真实资产已从此前冻结状态
补入严格闭包，原archive SHA/执行case全部不变，已集中生成。

C63本轮真实派生/正常合同D：parity生成身份
`2f6ef50441d7a9cd2ced71b363a48496ac04a4eb02f2990250cda8bcb6efaab2`，
stable生成身份
`5ab5077cf29fcae7d35f09b5b969e18705d3f68b5c9de072d8a223a3edf4b265`。
日志`c63-source-parity-current-generate.log`与`c63-source-stable-generate.log`
均真实退出0。完整正常`make --assume-old=bootstrap-backends check-contracts`
使用显式small/defer且未skip retained，`c63-source-normal-contracts-final.log`
真实退出0/cleanup_complete，35/35历史criteria、全部其它原门禁通过。
当前性能/历史matrix freshness明确DEFERRED / NOT ACCEPTED，绝不计作当前
性能已过；本合同结果也不代替尚在进行的三输出与新来源否例。

C63最后来源与调度集中D真实69/69通过：acceptance-generated-evidence、
compiler-corpus-source-archive、compiler-literal-corpus、stage3-targets四文件，
`c63-source-binding-evidence-final.log`退出0且完整回收，峰值约4.79GiB、
51.7秒，自动扩容一次仍受独立硬上限控制。新五alias的source/module/map/
漏tracked/helper/compiler篡改否例、emitter原固定SHA/两完整span/实际selected
执行/map篡改、direct九pair28资产、完整当前corpus构造/IR序列化和普通user
不误取消全部真实通过；同一Eli三输出的小程序真实执行通过，仅作接线B，
不代替全量正式目标。原source-debugging五JS case保留/binary取消B真实通过。
- [x] D：本族最新来源及调度69项全部通过；完整正常contracts也真实通过。
- [ ] 本次正式完整stage3三输出仍由主验收负责，不把小程序或C62旧cohort
  的局部结果计作当前版本全量验收。

C63该项下一轮D已证实fixture坐标、完整source、预算及全部标准库记录均通过，
当前唯一首错推进到tools host库存为空：测试只调用标准库adapter，却要求由
独立tools/artifact adapter注册的原Node/Bun语义工具记录。已补该真实注册
调用，保后续原两个host、完整模块/入口/13个compiler源码及host断言不变。
只受控生成该维护helper与map，日志
`c63-original-gates-tools-registration-generate.log`，退出0、完整清理；未运行
测试，待父同其它C一起集中复测。

C63 集中修复批次：CI 保留原 native spy 的只读方法及身份，另用设置入口适配完整
worker argv；新增只读不可配置方法回归用例，原调度/取消/真实进程断言保留。
已完成 B/C，等待与 host 原生方法捕获和 tools adapter 漏接一并集中复测。
当前平台选择以最快、最简单完成工作版本为准；已有兼容无需主动破坏，也不增加
历史平台义务，至少在当前稳定版或最新 LTS 建立完整可复验基线。

C63原wasm-memory-static-data套件阻塞：私有9函数snapshot fixture通过真实
生产Eli函数片段装配，require-wasm-expression-node新增两个实际依赖
memory-f64-unary-opcode/require-memory-f64-unary，原fixture漏绑定。保原19项
完整source/黄金/typed图/65536容量/120000时限/运行与所有独立比对，原全档
SHA `8265218c316f48bd22ef4eefaff5303ec5fa1208387ca9fb22afadcd85c2ef5a`
只读归档。维护Eli负责完整snapshot source装配：先严格复构原9函数source
验证调用输入，再从相同真实生产源加入上述两完整原定义；其它compile调用
原样。仅本suite的build fixture返回compiler facade，无正式compiler修改，
raw callbacks/私有状态/hooks全原样执行。unknown snapshot输入拒绝，非该
filename的compiler方法/参数/receiver/错误保留。新B写完整装配/每个原定义
及普通调用/篡改输入/原methods identity，不运行。Eli install仅mock该fixture
调用的buildBackends入口直到afterAll，规范Make canonical生成/ignore接齐。

C63 原库存继续验收：202个未执行文件中14个完成，11个通过；browser缺显式
stage3 artifact环境、static-data原fixture漏新依赖、response-events legacy协商
在内层8GiB终止（8.64GB），均保留真实失败。最后一项沿已有完整文件入口使用
外层24GiB受控构建预算，原四mode、输入、断言和deadline不改，补调度回归；
未执行188项继续扣除已完成库存，不重复前14项。该资源结果不记作原8GiB通过。

静态fixture的最终施工仅适配真实fixture build返回的compiler facade；维护
staticSnapshotSource完整构造原9函数/新11函数模块，先逐byte比较原完整Eli
输入，再只对filename wasm-snapshot.eli加入上述两实际定义。任何其它compile
调用逐参数转交真实原compiler/receiver；原IR等全部方法保持引用身份，原
对象不变。install保存原build namespace的真实快照，直到afterAll才还原，
不会递归调用被mock的live binding；全部19原case/hooks直接原档注册执行。
- [x] A/B/C：维护装配、unknown/tamper/ordinary/identity否例、原档固定SHA、
  four映射/maps/ignore与Node B入口全部齐；正式compiler/runtime源未改。
- [ ] D：仅集中生成本族4源；原19项和新B等负责人本批统一复验。

C63该原case已再次推进到最后旧JS格式断言：真实semantic host调用
openSelected，旧测试要求不存在的open且固定空白。已集中替换该尾部两项
格式假设为真实selected factory/open/try-finally close操作检查，并增加原
完整sourceIdentity、suite/region字节哈希及唯一setup replacement的真实
before/after语句哈希绑定；没有删除原完整fixture、工具两host、13compiler
源、预算或反例。只补生成helper，日志
`c63-original-gates-selected-session-proof-generate.log`退出0、完整清理，
未单独测试，交父集中D。

static迁移必要来源闭包已完成：仅原complete-fixture-suites聚合record增加
staticDataFixtureMigration，真实原SHA+19原case坐标/时限+4pair maps共13资产，
canonical执行SHA继续用真实当前生成物，不以archive假冒。完整来源B核13
真实资产、原19项与来源；新否例在伪造一致hash/bytes/content后仍拒绝原档
漂移和map来源篡改。未新增有效target record/缩小分母，聚合record继续按
已明确范围移到最终Make门禁。工具生成与B生成成功（B初次少一闭合括号
已修正，失败日志保留）。parity真实派生为
`134bda9ecd6e484a6814b8d7e036a109f96425f7f15ecf010a60e85d271d41e7`。
按本批剩余实际迁移收齐要求，stable暂不重复生成；runtime/source-collections/
foreach等必要来源迁移齐后统一生成来源工具和最终stable，不把旧identity当
新source通过。不单独测试或启动新全target。

### C63 原source collection/forEach设施同族

- [x] A/B：原source-collections17项12通过/5失败、forEach11项10通过/1失败
  已完整收齐，原输入/黄金/容量保留。新迁移只替换4个陈旧设施callback，
  其余原档callback完整执行；两容量目标沿既有显式性能延期入口在功能模式
  DEFERRED/NOT ACCEPTED，严格默认仍执行原192/256slots与原字节预算。
  增加正常预算下同128输入/512写入的完整功能、帧与清理证明，不称容量过。
- [x] A/B：shadow receiver逐项构造，nullish property Get既有code1，其余
  nonconstructor仍code3；原JS effects独立对比、TypeError/首错/根保留。
  真trap仍5条路径，改注入实际native prototype dispatch及direct-query
  guard，其余时序/marker/真实WASM trap/外层frame/完全清理断言不变。
  malformed constructor按kind定位真正constructor-call，保原B0001/file；
  手工不完整IR先要求与独立public schema validator完整诊断一致。
  getOrInsert与Computed改真调用/身份/参数副作用证明，其余方法和原捕获/
  脱离调用/品牌/undefined/Node运行断言保留。
- [x] C：维护Eli、原字节archive、installer、四映射、ignore及两精确preload
  写齐；来源闭包交统一来源负责人按实际资产接线，forEach只计原Make门禁。
  四映射C63 stage3受控生成exit0、cleanup complete，run
  `3450b84fd9d44f0b93afa33209b0b077`，证据
  `c63-managed-collections-fixed-generate.log`。首轮keyword字符串语法失败
  日志保留，合法字符串key写入后全生成成功，没有运行行为测试。
- [ ] D：父集中原2suite与新增功能B；两原容量目标若功能模式延期，明确
  DEFERRED/NOT ACCEPTED，不计通过，不改变严格默认原断言及原容量。

### C63 sequence真实slot桥接首错

- [x] A/B：复用原完整native/bun protocols与protocol-exact产物和配置，
  仅复制到ignored证据目录并在诊断副本搬迁路径；原IR、预算、输入、黄金
  不变，无重新编译。真实host Reflect观察证明IPrint的Has采用canonical
  Symbol，随后Get却采用同description的另一Symbol并返回undefined；IReduce
  的Has同样未命中实际host direct slot，故仍得到6而不是原19。
- [x] A/B：第二层原raw tuple观察确定IPrint两次key均为同一raw1060829，
  provenance0/id0，排除目标换key及foreign对象快照。原codec先普通解码的
  Symbol别名与稍后认证的canonical slot可同时留在sourceSymbols；当前memo
  返回canonical，但下次boundary清memo后反向遍历先命中旧别名。应按真实
  role认证保永久raw→canonical映射，绝不按description合并自定义同名slot。
  两层诊断均受控终态、cleanup complete，原失败完整保留；证据分别为
  `c63-sequence-symbol-bridge-diagnostic.log`及
  `c63-sequence-raw-symbol-bridge-diagnostic.log`。
- [x] A/B：必要迁移范围固定为原host factory及真实闭包依赖；新唯一维护源
  `tools/backends/eliscript/managed-host-runtime.eli`，原legacy1181行字节只读。
  初始化/描述符验证/Unicode/随机种子/所有公开API/Promise/foreign/roots/
  cleanup/override按原算法机械保留，fail/validate/bridge原公共导出身份
  不变。共享factory内词法名原camelCase，临时翻译片段合并后删除，不新增
  运行模块框架。现facade只切换creator，bootstrap+来源资产追加唯一真实源。
- [x] C：按真实角色认证建立raw→canonical Symbol永久映射并覆盖旧别名，
  decode先于短期memo查已认证映射；自定义同description Symbol不合并。
  原19/23、getter恰一次、两向身份和原六host/engine组完整保留；补最小
  同名独立Symbol跨调用/GC反例。全部源码与B齐后四映射受控生成exit0、
  cleanup complete，证据`c63-managed-host-runtime-migration-ready-generate.log`；
  初次集中生成所收语言接口/语法遗漏已修，失败日志完整保留，没有行为测试。
- [ ] D：C齐后集中原受影响六host/engine组，不能把诊断重放算验收通过。

### C64 原数组与malformed IR门禁设施收口

- [x] A/B：原callback19项中的64slots/8192–32768bytes压力目标严格默认
  保原body和预算；功能模式仅此标题显式DEFERRED/NOT ACCEPTED。新增正常
  预算下原128true输入完整map/每个callback三参数/receiver身份、输出、
  caller frame保留7及最终live0/frame0，不能把延期容量算作通过。
- [x] A/B：原splice11项仅替换旧unsupported case的维护callback。冻结与
  非法constructor两mode的原结果和转换trace全保；原species/accessor两源
  现在真实编译执行，通过独立JS观察原TypeError和输入状态，保IR全字节
  不变、zeroimports及runtime清理，不用已实现能力继续断言emit拒绝。
- [x] C：`tools/testing/managed-array-repairs.eli`与4个纯Eli splice fixture
  已写齐并受控生成exit0、cleanup complete；证据
  `c63-managed-array-repairs-generate.log`。两原完整archive字节保留，原
  canonical仍原字节；共享installer只接明确标题，不减其它原case。
- [ ] C：集中variadic/typeof/value-type等原malformed callbacks的精确
  public schema对照、有效schema后原B/file/span及immutable合同，以及
  两数组suite的共享installer/来源闭包接线，由同批负责人统一收齐。
- [ ] D：C齐后父集中本批受影响完整原suite，不单测、不重复已通过库存。

### C64 原独立CLI完整5项fixture依赖

- [x] A/B：`backend-cli-isolation`原4pass/1fail的最后一项要在加载真实
  compiler后遇到缺package.json的ENOENT。当前公共Emacs launcher在seed
  前先require维护`bootstrap-runtime.el`，旧fixture只链接seed，故提前
  bootstrap失败为RepositoryIntegrityError、没有预期.code；不是改ENOENT
  黄金或生产loader。原5项CLI/JS/WASM/IEEE含负零、cache字节及cleanup保留。
- [x] C：完整suite迁`tests/eliscript/backend-cli-isolation.eli`，fixture
  同时链接真实seed/runtime两个Elisp依赖并断言realpath及源码全文相同；
  原JS归档SHA为`fa389b5fa4c92bcb80611132397a29c58d6403952eef6bae69ee302619895a72`。
  维护suite受控生成exit0、cleanup complete，证据
  `c64-backend-cli-isolation-generate.log`；没有运行行为测试。
- [ ] D：父统一执行原完整5项，确认真实后置ENOENT/package.json与原缓存
  字节不变，CLI失败不留下输出或私有构建目录；生成物不得入库。

C63 剩余原库存集中收集后新增同批阻断接线：wire完整5用例复用真实部署facades，
新增Eli fixture与2项B，旧raw canonical保持原SHA供原语料读取；仅新selfhosted
入口实际执行，不重写原HTTP/130roundtrip黄金。sequence终端失败原只在诊断开关
开启时于close前保存错误，默认路径关闭后console读取source-view掩盖原错；复用
既有真实错误保持/图诊断B，默认仅保存错误，详细allocator日志仍需显式开关。
已写C，后续集中复测只看已失败source-bound项目，不重复成功host用例。

C63 本批来源闭包最后接线（施工完成，验收待父集中D）：
- [x] 原runtime64、wire5、source-collections17、forEach11、response25，
  以及保持原文件不改的transient4/core4/sorted5，均绑定固定原SHA、完整登记
  坐标/原时限和真实维护Eli/module/map资产。每组资产分别10/13/10/10/10/
  10/10/10；标准库共用三pair只合并实际重复文件，不伪造新target记录。
- [x] wire仍用原raw路径提供旧parser真实输入，仅selfhosted入口实际执行；
  forEach和response仅原Make门禁。标准库原3suite直接执行，真实sourceName
  接线由其descriptor证明，auto(1)不变；transient资源不变，core/sorted
  仅双显式功能profile才选既有small预算，容量验收明确延期且默认严格不变。
- [x] sourcearchive新增8原档逐个篡改和维护map篡改否例，完整recipe逐个核
  实际source资产哈希/登记数/真实执行入口；bootstrap相关mapping与map flags齐。
- [ ] 来源工具/B统一生成；待所有本批source冻结后才运行真实派生生成器，
  不用旧来源identity冒充当前验收，不重启正式三段自举。

本批8组最终来源工具和B已受控生成成功，未执行行为测试：
`c63-final-fixture-source-closure-generate.log`两源exit0，
`c63-final-fixture-source-closure-canonical-generate.log`记录sourcearchive按原
canonical映射实际生成exit0/cleanup complete；首次误选的自有selfhosted
输出及map已删除，不改变映射或登记。当前生成module/map均ignored，不入Git。
最后parity/stable实际派生与全部来源B仍待父确认统一source冻结后执行。

C63 集中D新增真实通过：原Emacs全248/248、strict byte compile退出0；完整
record-grid12/12，IR ingress五个JS功能case通过、八个已取消binary host明确
单列。response原25项24通过，唯一旧私有默认值已维护迁移待复验。
旧complete report作业05:38启动且缓存旧intrinsic provider，不能充当当前源验收；
保原完整输入/产物到`c63-owned-report-retained`后按归属回收，不改变10000输入
或宣称通过，后续复用作业产物诊断小n真实进展。旧C62已取消且全部回收，保全部
原日志/结果，现仅做逐文件字节cmp的透明无损压缩，非新验收或结果改写。

C63 最后主线收敛决定（功能优先，原压力未通过）：复用真实原4模块/53 literal
和当前provider的小n诊断自然终止，0/1/2均返回0、frameDepth0；每一步约新增
4800个保留slot，最终close/collect归零。原10000输入属于资源压力阻断，不再
扩大预算盲试。原完整断言体提为同一个维护函数：strict默认仍以10000运行，
仅已有显式performance deferral将该原压力项记DEFERRED/NOT ACCEPTED；新常规
功能项以2作为map输入，其余完整4模块/async Multi、queue、普通方法/identity、
异常、原期望输出及raw admission断言全部复用，参考与真实WASM/native同输入。
工作负载reference/deployment按iterations隔离，避免VM import/dlopen复用旧产物。
该功能项不能冒充原10000/原资源验收。

同时sequence双层真实诊断排除对象缓存/函数kind，证实同一raw Symbol跨boundary
被旧host codec解为不同host Symbol：后角色认证未清掉旧别名，下一轮私有memo
清空后首先命中旧Symbol。因私有闭包无法在维护facade安全访问，且禁止继续修改
JS，当前必要C为原factory/codec机械迁至维护Eli并修真实raw→canonical身份索引；
不按description合并、不改原19/23及getter次数/identity黄金，不改正式compiler。
原fail/validate/capability bridge公共导出身份保持；全原有效fixture继续作为B。

C63 最后原catch-binding主线阻断：
- [x] A：原missing ILookup完整case的TypeError对象分支，真实Error.prototype
  已拥有native constructor，观察标签旧逻辑见kind18直接报ABI3，覆盖应返回的
  ProtocolDispatchError。仅修`heap-binding-object-observed-label`，不改原黄金。
- [x] B：维护protocol-dispatch补Error/TypeError/RangeError/SyntaxError/
  ReferenceError五项，独立JS结果先严格检查完整name/code/ILookup/get/
  observedType/reason、枚举顺序与描述符，再同真实WASM对照；auto1、frame0、
  close/collect live0保留。
- [x] C：仅认证flags256、原error-kind1..5和实际已有native constructor身份
  三者一致后复用已有观察标签；任意function/user override不伪装成intrinsic。
- [ ] D：正式runtime变动后由下一候选重新固定点，统一原受影响组验收；本次
  未局部运行，不把旧候选结果算新源通过。

C63 原primitive-properties剩余两项fixture收口：
- [x] A/B：原raw整体固定SHA归档并保全11项真实注册，仅两个精确callback
  维护迁移；其余9项/hooks仍直接执行原档。fixture preload与实际来源闭包
  继续认证原档/维护Eli/生成module/map，不改正式runtime。
- [x] C：raw标准prototype是借用返回的弱缓存，原auto1下未pin即分配可使
  它被回收；明确临时pin→创建持有真实prototype的object→释放临时pin，
  保原全部128slot/字节/close/GC弱缓存与最终live0/frame0断言。
  iteration仅nullish分支遵循既有TypeError+RT0001；非callable仍RT0003。
  所有原method/value/name组合、String/Array优先、独立JS、trace、原型恢复
  和清理保留。原fixture模板直接从认证原档读取，不新写JS源码串。
- [ ] D：仅生成维护接线，行为由父在全部C齐后集中验收。

C63 原objects/arrays库存最终callback迁移：
- [x] A/B：原objects23项6失败、arrays24项3失败已完整一次收齐，原完整档
  固定SHA保留；两canonical只替精确6/3 callback，其余真实注册/hooks不变。
  当前已支持Object构造/hasOwnProperty、动态调用/flatMap、prototype/function
  属性必须真实运行对独立JS；仍用WeakRef等实际未支持能力作source-bound拒绝。
  非法手工IR直接与同一公共validator比较首错，保源码/IR不变证明。
- [x] C：copy OOM明确用原64slot/4096字节堆的剩余额度全部实际占用后要求
  失败，保原失败写入原子性/完整原属性与caller frame；direct-reader trap
  注入现真实`value-object-get-with-receiver(heap,object,key,receiver)`路径，
  不再注入旧未执行wrapper。nullish key转换按真实JS执行，不保过时拒绝。
  原128/16次运行与全部输出/根合同保留；usedBytes/collection次数仍默认严格，
  只有显式performance延期时记录原值/实测值及DEFERRED/NOT ACCEPTED，绝不
  把这些性能项宣称达标。不修改正式runtime或提高这些测试资源。
- [ ] D：全源码齐后仅生成，统一行为验收由父执行。

C64 原builtins/identity最后同族fixture收口：
- [x] A/B/C：原builtins12项4callback、identity10项2callback精确迁移到同一
  维护container入口，原完整SHA/其余hooks与登记保全；nullish按真实JS抑制
  参数转换且TypeError+RT0001，非callable保RT0003。standalone/project两
  产物都真实运行，原visited与函数捕获/alias/全部参数和根清理保留。
  已支持Number构造/parseInt/修改属性及Object.seal执行独立JS正例，raw注释/
  可执行源码仍严格拒绝，malformed IR对真正公共validator保持原首错。
  trap仅在原Number("42")调用时触发，初始化走完整原函数；原callerframe/
  -0根/文本均保留。原128/4096/16384资源默认严格，双显式功能延期才选
  既有small，原2000位输入/实际pressure→OOM→恢复算法完整且记录原资源
  DEFERRED/NOT ACCEPTED，不把功能档冒充原容量通过。
- [ ] D：源码齐后仅生成，父在最后统一环境与source身份下验收。

### C63 最后原fixture设施阻断（5完整原suite，源码不改）

- [x] A/B：empty-bindings原9项只1 malformed断言错误，将原5种mutation全部
  保留，先用公开严格IR validator判schema，无效schema与backend拒绝的
  name/message/完整diagnostic JSON逐bytes一致；有效schema仍必须B0001/
  managed-backend/Unicode file+line+column，原program JSON保持不变。
- [x] A/B：callables、realm-lifetime、str独立Node原oracle通过dataURL加载
  新带默认runtime的产物，缺真实模块base。维护Eli Node resolve hook仅将
  实际dataURL中生成bytes按SHA落自有包scope文件，落盘复核相同SHA，再交
  Node标准模块解析。原child脚本、argv/时限/黄金、生成body全部保持原字节，
  仅这3个固定原SHA suite的dataURL child增加真实--import hook坐标。
- [x] A/B：native-prototype原模板唯一(js* "NaN")落managed raw regexp拒绝，
  保实际模板其它字节，仅在原filename/单命中认证下替换当前等价Eli
  (get globalThis/Number :NaN)；全部动态登记、boxed步骤/this/Promise保持。
- [x] C：维护managed-fixture-repairs工具、专属installer、Node file hook和B
  四pair，bootstrap/maps/ignore/Make、fixture环境五精确preload及原B接线齐。
  原5raw suite完全不改，以各自固定完整SHA认证；聚合来源仅增加真实5raw+
  四pair共17资产与实际Make门禁元数据，不创造target record或减少原case。
  来源B补5raw自洽伪造hash/content篡改、map篡改拒绝及17真实资产核验。
- [ ] D准备：同本批其它source完整冻结后只生成上述映射与来源工具，父集中D。
- [ ] D：原5完整suite/新3个设施B/来源B；未运行不计通过。

catch-destructuring的mode4另有正式runtime真实阻断：原Error原型的constructor
在heap-binding-object-observed-label被无条件kind18→fail3覆盖，原期望完整
ProtocolDispatchError不可改。父已授权独立负责人仅修该函数/补B，正式源变化
须新固定点，当前本族不改正式runtime、不用旧compiler证据冒充新源通过。

### C64 原正则完整门禁与压力子项分离

- [x] A：原 `wasm-managed-regexp`、`regexp-indices` 两个复合回调把正常语义和原小堆压力混在一起；初始化/冷元数据压力失败不能代替对真实转换异常、匹配 trap、caller roots 和恢复的验证。原压力 callback、128 slots/原字节预算及严格默认保持，通过既有 `currentPerformanceTest` 在功能交付模式明确列为 DEFERRED / NOT ACCEPTED；不报告压力通过。
- [x] B：`tools/testing/managed-regexp-repairs.eli` 提供 `runRegexpBacktrackingSemantics(backend,runtime)`、`runRegexpIndicesSemantics(backend,runtime)`，接原真实 fixture、注入的原匹配 trap、完整错误身份、原负零/帧/字符串/清理；indices 在原 2048 slots、65536 initialBytes、1048576 maxBytes、32 pages 的 WASM/native 两种实际执行中分别验证转换失败与新实例完整恢复。empty Object 的转换能力已实现，保原 `{}` 输入和独立 JS 转换证明，加入不可调用的转换方法验证原 RT0003，实际匹配仍验证真正 WASM trap。
- [x] B：原 property-outlining 完整别名、大小写、偏移、UTF16、全部无效 source/start/length 不减；生成表达式局部变量拼写不属于 native TypeError 合同，改为严格 constructor/name 比较。用户 getter 和 charCodeAt 自身错误仍按同一错误对象、完整 message 和真实读取顺序验证，不能用 native message 比较变化吞用户异常。
- [x] C：完整维护 helper `managed-regexp-repairs.eli`→同名 `.mjs`/map；原 JS suite 原字节保留，由现有固定 SHA 的 fixture installer 只接精确标题及新增正常语义回调。其它原回调、非法 regex/精确重复的原输入、预算、黄金保留；后两项 schema/已实现能力的维护回调由同批 fixture-repairs 接入。
- [ ] D：父批统一生成后集中执行受影响完整 suites，分别记录正常功能结果和原压力未验收项；本节源码完成不构成行为通过。

### C64 最后同族设施批次来源冻结前收口

- [x] A/B/C：沿已收集原失败扩同一Eli fixture adapter：variadic全部4+1
  malformed输入、typeof原4unsupported表达式+3mutations、4个null谓词各
  3mutations、value-type原3mutations，均先公开IR schema逐bytes认证，
  有效schema保持原backend拒绝/file/span/immutable，未减少任何有效输入。
- [x] A/B/C：namespace实际两module生成JS+真实namespace descriptor/同源
  label/update，与WASM逐次比symbol/keyword；原64slots/8192bytes压力、
  128分配尝试、保留负零/frame1/恢复number/完整清理都保。namespace-copy
  trap只匹配当前完整(heap cell index)签名，原2module/手保根/实际trap保。
- [x] A/B/C：strings保原整套及全部child脚本、UTF16/Function源bytes，
  仅Node实际dataURL产物改同bytes实文件解析；3malformed方法继续完整schema
  拒绝。text-constructors保原5源，现支持能力以独立生成JS和standalone/
  linked WASM实际调用/错误类型证明，全部旧malformed输入继续严格拒绝。
- [x] A/B/C：regexp原4非法literal保Node--check SyntaxError与backend拒绝，
  缺失IR子节点按公开schema完整认证；exact原13patterns保留，前2已支持
  模式以真实WASM14样本和纯Eli Node oracle独立比较，其余11仍原regexp
  B0001/phase/file/immutable。原压力title严格默认原body，功能profile
  明确延期；新正常预算语义B保真实trap/首错/-0/恢复/cleanup。property
  outlining的完整trie/aliases/输入/自定义throw身份及trace由维护Eli保留。
- [x] C：cold的primitive/objects/arrays/builtins/identity、原CLI依赖与sharing
  迁移映射/maps/真实原档登记接齐。finalGateSuiteMigrations共15组；另原
  Make依赖声明19原raw+9维护pair+4静态splice Eli+2原档=52真实资产。
  原raw全字节固定SHA、metadata明确非新target record；全部新maps只生成
  ignored/untracked。来源B覆盖新增原档/map篡改和全部真实资产哈希。
- [ ] D准备：以上全部源码齐后只一次集中生成；收齐语法错误同批修正。
  最后source冻结后才真实parity/stable派生与父最终固定点/三输出，未运行
  的行为、性能或当前source整体验收不得以历史通过替代。

### C64 function-properties 实际宿主能力隔离与压力边界

- [x] A：原手工填充 1024 slots 后依赖默认槽预算恰为 1024 的初始化拒绝不再成立；保原严格压力 callback、输入、预算和所有断言，功能模式按既有 `currentPerformanceTest` 明确 DEFERRED / NOT ACCEPTED。独立正常语义仍保原无压力 initialize/collections0/cached，填入原 1024 个垃圾值后 collecting initialize/cached/帧/回收和完整清理。原 Node24 严格 restricted accessor 独立黄金完全不改。
- [x] B：原缺 dispose/asyncDispose 用例直接改生成 JS 的旧模板已失效。新 `managed-function-properties-repairs.eli` 在真实维护 `managed-host-runtime.eli` 的唯一 host symbol table 将最后两个值定点改为 undefined，交真实编译器生成隔离宿主；同样生成现有完整 facade 并只重定位 IR imports 到原真实依赖/隔离 runtime。无手写 JS、无新增生产测试 API、无修改全局 Symbol。
- [x] B：原完整 program 通过同一 `lower_managed_program`/`emit_managed_wasm` 产生真实零 imports bytes，metadata 必须逐字段等于完整原 descriptor，IR 不变；保 dispose 与 asyncDispose 两个 TypeError 类型及精确 message、两 description、caller frame/负零、GC，以及原 iterator 跨宿主身份。
- [x] C：独立 helper `tools/testing/managed-function-properties-repairs.eli` 和 exact-SHA 注册器 `tests/eliscript/managed-function-properties-install.eli` 写齐。原 suite SHA `dc63fc65ca9a84ff6faac3f7666774e162bef2d4375140e40a17480673c90ce7` 不变；只有精确两个标题接线，其余原 Node/WASM/native 六组 body 全保。当前冻结窗口不改 bootstrap、来源工具或既有 installer；接线待父统一窗口。
- [ ] D：窗口结束后接两 source/output/map、exact preload/source closure，统一生成并集中验收；本节未执行行为测试，原压力未通过。

### C65 Node host/lifecycle 既有门禁的真实基座

- [x] A：`managed-host.eli` 的 omitted/undefined/null B 用无 heap-new 的 fake exports 比较宿主引擎报错局部表达式拼写；Eli 生成调用与旧 JS 局部表达式不同，实际均为 TypeError。独立 `managed-host-default-contract.eli` 保原三种参数失败的真实构造器/name/无结构诊断，并用 caller 提供 heap-new sentinel 证明 omitted/undefined/空 options 的 1024/65536/16777216 默认、显式六字段 Getter 顺序/参数和 user getter 首错对象身份，不能仅删 message 断言。
- [x] A：`managed-host-lifecycle.eli` real WASM prepare 的 creator 直接选已归档 legacy factory，它只识别 host opcode 0–24、28–31；当前真实 image 通过 canonical Object identity 的 opcode 35，旧 test 基座无法运行。窗口结束后该 creator 选现公开维护 `createManagedHostRuntime`，外层生命周期传下的 `dispose` descriptor 使内层 exact-one-property 私有生命周期条件自然 passthrough，不产生第二次 deferred notification。原 graph/prepare/ready/function+Symbol/真实日志/负零/收集/零 live 全保，不改生产实现。
- [x] B/C：默认合同独立 Eli helper 已写齐；受 C65 完整 targets 末尾 source verify 约束，现绑定 host/lifecycle test、bootstrap、来源、preload 一律保持不变。
- [ ] C 接线：C65 来源验证结束后再将 helper 接原同标题 B，并将真实 lifecycle 单 creator/import 切到维护公开工厂；统一两源生成。
- [ ] D：集中复验受影响 Node host/lifecycle 两 suite；本节没有启动新测试，不将原失败标为通过。

### C65 隔离修复：function-properties、默认合同与 static-data

- [x] A/B/C：仅持久隔离工作树落地默认 host helper 接原同标题 B，real lifecycle creator 接现维护公开工厂；原 Node24 oracle/完整 graph/ready/通知/负零/清理不变。function-properties 注册器在首个原 test 注册时仅一次注册正常语义 B，避免 preload 顶层 test 禁止；原 pressure strict default 完整保留，功能延期明确。
- [x] A：static-data 原 19 项的 2 个设施失败：未导入 `copy-static-u16` 必须由正式分析器先以 A0001/analysis/unimported.eli:1:23 拒绝；已导入但参数/遮蔽 malformed 的原五输入仍分别在 WASM/两 native target 被 B0001 拒绝。宽图 kind getter 6 次来自真实两个 capability guards×三 incoming edges；不得恢复旧单 guard 或更改 backend 满足陈旧 3 次私有计数。
- [x] B/C：`wasm-static-repairs.eli` 保原五输入和 65543 unique/三共享边/65536 memo/4096 tombstones/全部回收深度断言；增加实际单 leaf 的两个 kind 读取和独立 children 计数，严格固定宽图 6/5，并补第二 kind getter 首错身份及读取顺序、同 workspace 恢复。未导入错误完整对照正式 JS 公共发射器的真实 name/message/diagnostic，再严格断言 A0001/phase/原位置及 IR 不变。原完整 JS suite 原 SHA 不改，既有 `wasm-static-snapshot-install.eli` 仅替这两个精确标题，其余 17 原 body 继续实际执行。
- [ ] D：隔离树补齐共享接线后统一必要生成与集中复验；主目录 C65 来源和活跃产物完全不修改，未执行局部行为测试。

### C65 隔离收口：真实 metadata 包络与 preload 注册时机

- [x] A：共享 `managed-runtime.eli` 的 `module-metadata(module,name)` 已先读取最长五字节 u32 LEB128 payload 长度、核对完整边界，再执行 fatal UTF8/JSON/null 拒绝。标准库和 wire 设施此前错误地把长度前缀当作 JSON；只新增该现有函数的 `readManagedModuleMetadata` 导出，两设施在保留 exactly-one-section 预检后委托，不复制或放宽 decoder。
- [x] B：wire 的真实 WASM custom section 正例补原格式的 payload 长度前缀；新增空包络、截断 LEB、第五字节溢出、长度不足、多余字节、非法 UTF8、非法 JSON 和 null 八种否例，逐项比较现有生产 decoder 的真实 constructor/name/code/message。原标准库编译项目的 descriptor 全字段相等和真实运行 B 保留。
- [x] C：collection 与 managed-fixture-repairs 的新增正常预算 B 不再在 Bun preload 顶层调用 test；仅在原 suite 首次真实 test 注册的 Proxy apply 内通过原 target/receiver 注册一次，beforeAll 严格确认已登记。原全部 callback、标题、资源、时限及严格压力 body/明确功能延期规则不变。function-properties 的同根 normal 注册由其维护源作相同调整。
- [x] C：独立 object-integrity 三 pair、function-properties 两 pair、host 默认参数合同 helper 和 static-repairs helper 接 bootstrap/maps/ignored 产物；原 Make 同名入口完整保留，新增两个 exact preload route 及原参数/route B。object-integrity 只保原字节 archive，canonical 改为 ignored 生成物。真实来源声明新增原 integrity 21 项、function-properties 9 项，分别绑定 10/7 资产；static 原 19 项只新增真实 helper/source/map 三资产，共 16。不新增 target record、不改变共同语料分母、不修改历史 hash。
- [ ] D：隔离树全部本批 C 冻结后由父统一生成与集中复验。当前主目录 C65 活跃三输出的物理来源资产不改；本节没有执行任何编译或测试，未把旧失败标记为通过。source-archive 是原 Bun suite，Node 误调用产生 bun: 协议拒绝，应按既有 Make 的 Bun 入口验收。

### C65 隔离统一 D 的实际结果与同批必要修复

- [x] D：21 个受影响源一次全部生成成功，`c65-isolated-repair-generate.log`，exit 0 / cleanup true；未重建正式编译器。
- [x] D收集：metadata/fixture/sourcearchive 四文件 43 项 = 41 pass / 2 provenance fail；source-collections 18 项 = 15 pass / 2 fail / 1 明确 DEFERRED；foreach 12 项 = 11 pass / 1 明确 DEFERRED；完整 wire 5 项 = 2 pass / 3 fixture fail。四组共 78 项，69 pass、7 fail、2 DEFERRED，不宣称整体通过。完整 wire 受控峰值约 9 GiB，自动从 8 GiB 提示扩到 12 GiB，在 24 GiB 独立硬上限内正常终态。
- [x] C：wire 原三失败均为调用 `createManagedProjectFacades` 时漏其真实 entry 参数；改传明确 caller projectEntry 或 descriptor.project.entry，同时保 privateDirectory 与显式部署设置。metadata 正例/全部新增坏包络已经真实通过。
- [x] C：integrity 原四个 `scenario.id/given/when/then` 登记不属于旧 scalar title parser 能力。只对 exact 原 archive SHA 使用显式 adapter：保原 17 literal 登记，四个动态登记继续绑定实际完整 callback span/hash，真实原 scenario 行的 input span/bytes/hash 及四个实际 title 字段；其他所有 suite 仍走原 reader。原档追加/篡改否例继续严格拒绝。新增 sourcearchive B逐字段核对这四个原输入/登记来源，不改历史 SHA 或原输入。
- [x] C：真实 C65 bit record 的相对 import 在旧 relocated hostSource 坐标失效；与既有 fuzz/debug 路线一致，执行真实已认证 `tools/testing/stdlib-bit-corpus-host.mjs` 文件而不搬移它的正文。原全部 suite bytes/Seed+selected/Node+Bun/timeout/golden保留，来源B认证真实运行路径和原断言档案。
- [x] C接线：原完整 protocol suite 的维护 Eli 与 byte archive 接同名 canonical、map和 ignored 产物；finalGate 新增原1 case / 4 assets，不增加共同 target record。finalGate 总计18组。sourcecollections 两失败由父独占恢复原 unsupported 合同与真实 malformed error 分层，不由 fixture 扩新 API。
- [ ] D复验：以上真实失败修复与父/其他 agent 的同批根因全部 C 齐后统一生成和复验；此时尚未复验，前次失败证据完整保留。

### C65 隔离统一 D 收齐与下一集中修复

- [x] D 收集：Node host/lifecycle 29 项实际 27 pass、1 原 skip、1 新默认选项 fixture 失败；生命周期真实 WASM/native 原两组已通过。新默认 fixture 显式 Unicode/seed 需要提供其真实 ABI，补入 fake exports 的 case-version/seed/last-error，并严格保原显式参数及调用顺序；不改变生产默认值。
- [x] D 收集：function-properties 原 suite 在注册 skipIf 时被 native receiver 拒绝，尚未运行行为；Proxy 的可调用属性绑定到真实原 test target。static-data 完整 19 项 17 pass、2 个新 fixture 失败：compile_ir_string 已抛 A0001，必须 catch 完整原 compile+emit；Bun 的 createRequire 载入动态生成模块失败，改为现有 `loadManagedHostModules` 真实异步 importer，保持原实际字节和所有包依赖。首次 Bun 参数误把 test 当 package script 的运行已取消并 cleanup complete，不计任何验收。
- [x] C：上列真实 fixture 根因在隔离树集中修齐，未改主目录、formal compiler 或原黄金。Node 已通过的 lifecycle 不重复跑；默认 helper/host 新 B、function-properties 和 static-data 留待同批复验。

### C65 portable guard / predicate / reader 维护 fixture

- [x] A/B：原 predicates 17 项与 reader 20 项的人工 export/ref `span:null` 违反正式 schema。维护 `compiler-portable-fixtures.eli` 克隆原 IR，只为人工 export/ref 从实际 compiler 编译对应 export source 取得真实 span，调用正式 validator 后再交原 managed emitter。原输入 JSON、完整算法/随机/host否例/压力/字节/独立 Node/13-source fixedpoint 全断言不变，不放宽 schema。
- [x] C：两 suite 原始 canonical 与 byte archive 完整保留，exact SHA preload 仅运输该 fixture；其它调用和方法身份保留。guards 原完整 byte archive 保留；expander 实际 guard 的原 3 标题、所有 this/arrow/arity/promise/异常/getter/WASM identity 黄金完整迁维护 Eli。analyzer 已没有 generic guard，绝不伪造该生产来源；改用真实 `guarded-binding-name`、`guarded-reference-name` 及原 diagnostic dependencies 复制到独立实际模块，新增真实 cache、原 symbol oracle、精确 structured error、单 message 读取及失败不入 cache 两组 B。
- [ ] D：3 新维护 pair 和精确来源闭包汇合后统一生成/集中运行；源码写齐不构成这些原失败已通过。

### C65 隔离第二批来源闭包冻结

- [x] C：完整 fragment-combine 原3项只新增 exact-SHA 的既有 Node dataURL→同bytes实文件 hook 接线，原子脚本、stdin、Function.toString、独立oracle与时限全保；fixtureRepairs 共20原raw、53真实资产。
- [x] C：portable guards 原3项与新增2项维护B、predicates原11参数化+6fixed、reader原20项接真实source/module/map；guards原档固定，predicates/reader原canonical字节不变。predicates 原复杂解构标题只按其 exactSHA 的11条真实数据行/同一完整登记与后6个fixed原坐标准确取证，不扩原JS parser、不执行来源JS、不删variant。
- [x] C：Emacs 原benchmark唯一项通过既有功能profile明确延期，原strict benchmark全部hash/30samples/2倍门槛及报告字节保留；原soak功能仍必须实际运行。exact preload及反例、原2case真实闭包接齐。最终finalGate22组，不新增共同target record。
- [ ] D：父、host、cold的本批真实错误修复源已齐；只生成实际改变的映射后，集中复验失败与新增项，已通过的完整foreach及metadata正例不无变化重跑。正式memory/backend变更另须新的C66固定点和三输出证明，C65仅保其真实历史候选证据。

### C65 最终集中 fixture 修复收齐

- [x] D 第二批证据：host 21 项 20 pass/1 原 skip，默认合同与 registry B 实际通过；reader 20 项 19 pass、仅原 256 slots 压力后的恢复失败；predicates 17 项 15 pass，两项直跑漏 Make 原 `--timeout 300000` 而以 Bun 默认 5000ms 报超时。后续严格复用原正常命令参数，不修改测试时限或为错误命令增加优化。function-properties 原 7 组通过、1 原压力明确延期，2 个新增 helper 误读 binary metadata；static 18 pass、1 fixture loader 错；guards beforeAll 同 loader 错，尚未完成行为。
- [x] C：共用 `generated-fixture-module.eli` 通过真实 bootstrap host `loadCompiler` 的既有异步 module import 入口加载完整生成 JS；owned `compiler.mjs` 仅是同字节 fixture 的 symlink 加载坐标，绝不作为正式编译器产物认证。function/static/guard 使用该纯 Eli 入口，保真实模块 namespace、全部原源码和依赖，不改生产 loader。metadata 复用现有严格 `readManagedModuleMetadata` 的原 LEB/fatalUTF8/JSON 解析，不重复实现 decoder。
- [x] B/C：reader 原严格压力 body/256 slots/8192–16384 bytes 和所有断言保留，功能模式明确 DEFERRED / NOT ACCEPTED；新增普通 2048 slots/65536–1048576 bytes 的真实 callback 抛 false，验证参数 effects、同一首错、负零/caller frame、scanner 状态不写回、真实后续扫描恢复及零 live/frames。此前通过的实际 WASM trap、Node 对照、全 scalar/UTF16/random/13-source fixedpoint 均继续执行。
- [x] B/C：`native-node-memory` 原完整 source 固定 SHA，只有 filename `native-node-memory.eli` 且源全文精确相同才将唯一 `(while true ` 改为合法 `(while t ` 交真实编译器。原 Node/native ABI、原 child 脚本字节、capability、进程取消和资源断言全部保留，无 JS 修改/无语言新语义。
- [ ] D：本批源码与所有新资产汇合后统一生成；使用 Node24、原 Bun `test --smol --timeout 300000`、固定 SHA preload、DEFER1/small，集中复验变更文件。未过与明确延期项目不能计 passed。

### C65 Number 文本与 Number-only 发射原门禁设施

- [x] A/B/C：`wasm-managed-number-text` 两个 Node dataURL 执行缺真实默认 Unicode 依赖；exact SHA 维护 preload 只给真实 Node eval 的原参数添加既有 `managed-reference-node.mjs --import`，保持原 eval/stdin 脚本、生成 JS 字节、全部原功能黄金不变。Bun named spawnSync 通过实际 module export 透传，不 stub 执行结果。真实 managed radix RT0003 由运行时修复批次处理，不修改其预期。
- [x] A/B/C：primitive-operators 唯一 typed Number-only 发射以陈旧生成文本 hash 代替当前输出证明。保历史报告及原 SHA，维护回调只撤销唯一已声明的默认 Unicode import，历史兼容摘要必须仍与原 SHA 完全相同；当前完整 code 与独立 Emacs 编译实际 numeric.eli 模块后运行同原 IR 的发射结果严格逐字节比较，保输入不变及原三个 invalid source/原文件诊断。若还有其它未声明差异，保持失败，不能更新旧黄金伪造通过。
- [x] C：两原 suite 完整字节 archive 保留、canonical 不改、exact SHA 注册器只改一原 callback 与真实 Node hook；共用现维护 loader，不写 JS。Number bound native Function.toString 的宿主打印函数名差异保留原失败，未擅改 public reflection 黄金。
- [ ] D：与其余真实修复统一生成/完整受影响 suite 验收，Node24 与原 `bun test --smol --timeout 300000`；无本节局部测试。

### C65 隔离第三批最终工具接线

- [x] C：protocol 原canonical从真实archive逐bytes恢复，维护输出为 `eliscript-protocol-selfhosted.test.mjs`；Make/三条conformance evidence运行该维护入口，唯一原record的locator显式归一到真实旧source并记录新执行file/hash/IDs，原source parser无需改写。fragment精确原suite的named child_process导出通过Bun modulemock接同一个真实Node hook，default/其他导出/原argv/stdin/脚本bytes/cleanup不变。
- [x] B/C：wire原失败进入invoke前名称表miss，复用真实descriptor授权的source binding-name facade，同时处理invoke/invokeAsync，返回值/Promise/throw/receiver和所有属性描述符保留；标准库现有B增加异步对称证明。wire/fullgolden与HTTP原case不删，复验未执行。
- [x] C：真实异步generated-module loader、portable-reader正常首错回收fixture/native-node唯一source拼写、numeric两个exact原suite适配接真实source/module/map及preload。原压力严格默认仍完整执行，功能延期单独记录非通过；number-text只接既有Node hook，primitive control bytes只认证实际Unicodeimport差异和独立Emacs全bytes对比。最终finalGate25组，fixtureRepairs20raw/53assets；所有档案、case和历史黄金保持，generated输出只ignored。
- [ ] D：全部源冻结后只生成本批18个实际改变的映射；集中复验失败与新增B，先前已绿且无变化的foreach/integrity不重复。正式源的C66独立自举固定点与最终同源三输出仍必须另有真实通过证据。

### C65 Number text 完整 Node24 LTS 基线

- [x] A：正式选择 Node24 LTS 作为本次完整 Number text 运行基线。Bun 自身 bound native Function.toString 的实现打印名称差异不扩成新兼容项目；原 9 case、所有生成 source/child scripts、反射与数值黄金一字不改，不能仅跳过 Bun 的一条断言冒称通过。
- [x] B/C：维护 `number-text-node.eli` 只运输原 test/beforeAll/afterAll 的标题、同一 callback 与 numeric timeout；显式值精确保留，缺省沿原正常 CLI 300000ms。Node `registerHooks` 只将 exact 原 suite fileURL 的 `bun:test` 映射到维护 Node bridge，其他 specifier/parent 全原路传给实际 resolver。完整 suite 源 SHA 固定，桥 after 明确断言原 9 项注册。
- [x] B/C：同一 Node24 进程执行全部原 body；生成模块保原字节并部署真实默认 runtime，child 原 eval/stdin 只添加既有实际 module hook。独立 3 组桥 B 检查完整源 SHA、timeout/callback identity/参数不变、exact 路由和不接受被改变的调用协议。源及映射、Make/runner 来源闭包由本批接线统一维护。
- [ ] D：`node --import ./tests/helpers/number-text-node-install.mjs --test ./tests/wasm-managed-number-text.test.mjs` 完整原 9 项加桥自身 3 项须真实运行；本节仅源码完成，不能计通过。

- [x] C65 最终宿主基线接线：原 Number text 完整9项只在所选 Node24 LTS执行；file-workers仅对精确源路径选择真实 Node命令和两层实际import，普通Bun文件/副本仍原命令、原inventory与监控。纯Eli桥只为该原fileURL映射bun:test到node:test，保原callback/数值deadline，after严格要求9登记；另3项桥B和独立调度B认证全source SHA、argv、env、普通文件不受影响。Make继续同一file库存由真实调度选择宿主，新增桥B进入Node原组；未删原断言或接受Bun内部display差异。

### C65 第三批 D 收齐后的同族修复

- [x] D：Number Node 桥3项通过；原 Number9项中独立JS边界1项通过，另8项、predicates15项、reader12项、static最后2项及function/primitive前置均被同一runtime调用参数错误阻断，不能计实际功能通过。父已修复多余的frame参数，后续统一复验。
- [x] A/B/C：native memory fixture 的唯一旧 `(while true (store-u32 64 1))` 改为 `(while 1 (store-u32 64 1)) 0`。数值1保原无限循环，末尾不可达0满足memory-u32函数返回类型；loop自身的既有i32返回不能直接作为u32函数返回。仍绑定原完整源与SHA，原实际child bytes和全部9项断言不变。
- [x] A/B/C：fresh module loader 三个真实入口在smol下均报同类找不到文件；先保持现loader源码不动，以普通Bun执行function-properties/static-data/guards完整组，保原300000ms、黄金、源和预算。只在实证为smol差异后给这3个精确文件登记普通Bun，禁止新增猜测性loader。
- [ ] D：以上完整受影响组与native memory在源写齐并生成后集中执行；失败与明确延期继续单列，不能当通过。
- [x] D收集：普通Bun下function-properties完整10项9 pass/1原压力明确延期，missing disposal与normal初始化真实通过；static19项18 pass/1 fresh module加载失败，guards前置同加载失败。普通Bun未消除这两项错误，不给runner添加猜测性standard名单。native仅改while1仍在前置因loop结果i32拒绝，新增不可达u32尾值后待同批复验。整组受控exit1/cleanup true，峰约7.26GB，日志`c65-standard-bun-loader-group.log`及各完整子日志。

- [x] C65 隔离来源批次收口：完整原 replay 的原 runtime archive 仍实际读取 `wasm-managed-text.eli`，维护 splice helper 实际读取四个静态 Eli 输入；为这五个精确输入保留真实源字节 SHA、执行源 SHA、已有 suite 成员及 coverage 绑定，缺实际完整 replay/来源读取即拒绝，不增 target record、不删 zero-missing 断言。人工 browser provenance B 使用真实原 locator 库存选择所需原 suite，不把空 locator 子集冒作完整 replay。新增 B 逐一核五输入、执行源 hash 与既有 suite/coverage；统一生成和受影响 D 待执行。
- [x] C65 原 splice 完整执行补线：四个维护输入成为 stable fixture 后，精确选择真实原 SHA/11case 的完整 splice suite 进入既有 selected-compiler replay；该选择元数据无 case ID/contains，不能发明 coverage/改变分母，原 runner 实际执行全部原 case。B 核实际 suite 成员、原 hash、host 运行入口、11case 数与无虚构 coverage；五输入严格从实际 replay 认领。
- [x] C65 wire 真实 D 已完整收齐 2P/3F，WASM auto65536/1/native 都被原 finally 的 live116 清理失败遮住首错；原全5case/所有黄金/cleanup断言保留。只在维护 fixture facade 观察并打印首个真实调用异常，原抛出对象、返回值、Promise身份、receiver及描述符不变；新增 B 证明首错只记一次且 reporter 不可替换原错。尚未重新运行完整wire，不以诊断包装宣称修复。
- [x] D（隔离工具，非正式最终三输出）：来源归档完整30/30通过、five-input覆盖缺口0；标准库真实编译metadata与同步/异步包装3/3通过；fragment原完整3/3通过；wire维护decoder/首错透明观察4/4通过。日志分别 `c65-isolated-source-batch5-functional.log`、`c65-isolated-source-batch4-functional.log`、`c65-isolated-fragment-batch3-functional.log`、`c65-isolated-wire-observation-contract.log`。原wire完整5项实际2P3F，首错为第一条original-codec-report调用抛kind13，原finally还报live116；保持失败，不把辅助B或单case诊断当完整wire验收。

### C65 真实 fresh module 宿主诊断与最后三组收口

- [x] D：一次忽略目录纯Eli诊断在原失败边界保存文件realpath/stat/完整bytes/SHA与真实错误；两个实体分别28949、1636 bytes，Bun普通模式均ResolveMessage；Node24当场使用同一真实入口、同一实体和完整依赖加载成功。原错误仍重抛，诊断没有替代任何语义结果。日志`c65-fresh-module-diagnostic.ndjson`及两份实际emitter bytes；受控exit1/cleanup true。
- [x] A/B/C：不再增加Bun loader回退；static原19 case完整字节archive和guards维护5 case在Node24执行。纯Eli桥复用已验收的原numeric timeout/同callback转换，exact source SHA认证、精确父模块的bun:test路由、static唯一build依赖路由、末尾严格19/5注册计数。static仅原两陈旧fixture callback使用已有完整维护实现，其余17原body、独立JS/原runtime/immutable/bytes全执行。Node hook部署实际默认runtime，不stub任何生产导出。
- [x] D：native原9项执行7 pass/2旧fixture失败。真实Node/native两入口write(input,offset=0)约定undefined与省略等效；旧test错误要求undefined拒绝。真实u32 store返回0，原独立native-memory-backend已严格认证0；旧packet错误要求null。
- [x] B/C：原完整9 case原档SHA、源与child scripts保留；两个完整callback迁Eli，保全部原非法输入/错arity/原trap恢复/不存在runtime异常/5packet顺序和真实native loader。新增省略、undefined、0三种write默认同义的独立字节断言，以及真正write32的u32返回0与随后read42。write的其它非法offset和read(undefined,1)仍RangeError；没有改生产行为满足陈旧null。
- [ ] D：6份新维护源与现installer一次生成后，在Node24执行static19+guards5，在原Bun执行native9，集中收齐结果。已通过function整组不重跑；所有原压力延期维持明确NOT ACCEPTED。

- [x] D：Node24 guards完整5/5通过；native原完整9/9通过（含原真实native子进程、取消、truncated/UTF8/BOM、hostthrowidentity与GC边界），不再重复这两组。集中guard exit1/cleanup true/峰约2.17GB，static18/19通过，唯一新fixture源码把宿主Set.prototype.delete写成语言标识符导致发射delete$，实际调用undefined。
- [x] C：仅改成显式 `(get globalThis.Set.prototype "delete")`，继续调用真实原生方法，不改memo65536/active4096/65543节点或getter/GC/immutable断言。
- [ ] D：只生成该实际改变helper后，复验static完整19项；其余本批已绿组不重跑。

- [x] C65 Node24 完整静态/guard实际入口接线：新增6维护pair统一bootstrap/maps/ignore；file-workers只对精确 static-data/guards 逻辑file选择portable Node桥，静态实际执行完整原archive19项，guards执行维护5项，逻辑结果库存仍原file；同名副本仍原Bun，新增B核argv/env/cwd/库存/非目标不受影响。来源保原archive SHA，静态34真实资产、guards28、native-node13；response原25case维护fixture另准确保真实session/tools两个source资产（12总）。这属于final gate执行，不冒称旧selected-compiler Bun replay也已切换Node。当前原canonical/黄金/预算不修改。

- [x] D：最后三组真实完成：Node24 static完整19/19、Node24 guards完整5/5、原Bun native-node完整9/9，共33/33通过；各完整file真实执行原输入、真实emitter/native/WASM与清理断言。static最后一次受控exit0/cleanup true，峰约2.98GB；`c65-node24-static-real-delete-final.log`。guards/native完整证据分别`c65-node24-portable-guards-final.log`、`c65-native-node-memory-contract-final.log`。
- [ ] D：共同runtime arity修复后，Number原9与primitive-operators整suite尚缺最新真实证明，按既有Node24/原Bun参数集中补验；桥自身3B和已绿function/33项不重复运行。

### C65 最终真实宿主 raw 返回值在同步清理前后的所有权

- [x] A：原完整 formatter 的保留 WASM/input/auto65536 实证：`source-operation 1` 读取真实 `Object.is`，回调返回 raw3148354 已 `allocated=false`，随后 `syntax-position` 的 `frame-set` root24 报 RT0001。`withHostValues` 的 codec 临时 roots 在内层 finally 释放，外层 `withCollectionBoundary` 的最终 collection 同步仍会分配并收集；尚未交还 WASM 的 raw 返回值缺少这段边界保护。诊断代理成功值曾误返回 null，已修正；该误接线产生的 RT0003/false 日志不属于生产缺陷证据。
- [x] A：仅扩展维护 `managed-host-runtime.eli` 内部 `withHostValues(operation, sourceErrors=false, rawResult=false)`；实际 capability 回调明确启用 `rawResult`。成功得到真实 raw 后，在 codec roots 清理前临时 pin，跨全部 call/collection 结束同步，在最外 finally 归还该临时根。普通 JS decode 返回不解释为 raw；原 throw、caller roots 和 ownership 均保留。正式编译器、WASM bytes、输入、资源和关闭保护不变。
- [x] B/C：真实 canonical fixture 新增公开 Map 暴露/foreign `Object.is` 读取并立即调用与身份对比；WASM/native auto1、宿主 Map 同步、显式 collect、原 caller frame/最终 live0 保留。`withHostValues` 仅 raw capability 显式 opt-in，真实 raw 在 codec roots 释放前 pin，最外同步后的 finally 释放，原先失败时不以 cleanup 错误覆盖首错；普通 host 返回不变。待统一生成和集中复验，不将源码写齐当作通过。
- [x] D：两映射真实生成成功。新完整回归 1/1 通过，其中真实 WASM/native 与独立 JS oracle、auto1、24 项 Map 同步 8 轮、`Object.is` 即读即用/方法身份/-0/NaN、caller frame 与最终 live0 全部实际检查；`c65-host-return-new-regression.log`，exit0 / cleanup true，峰值约1.43GB。没有重复执行已经通过的 Error 11 项和 integrity 21 项。
- [x] D：原 C65 完整 formatter retained WASM 原字节/848 字符输入/原 hostEval/131072 slots/auto65536，以隔离树真实当前宿主执行成功，`c65-original-formatter-host-return-repaired.log`，exit0 / cleanup true，峰值约666MB。仅将 backend 模块解析到隔离树，无观察代理、无重编原程序；这证明该真实宿主缺陷修复，不替代新正式候选的来源/固定点/三输出验收。
- [x] D 收集：原完整 interop retained 输入在同一真实新宿主继续到自然 `RangeError: Maximum call stack size exceeded`，`c65-original-interop-host-return-repaired.log`，exit1 / cleanup true，峰值约8.45GB，非 OOM/超时；原2000生成样例和100000元素scale均未删改。短栈含 `literalOperation → decode → source-operation`，未凭此猜改 reentry 或增加栈限。该完整原程序仍未通过，不能记作 raw pin 修复后的完整三输出通过。
- [ ] D：待本批真实受影响行为验收，不将静态修复或诊断替代正式验收。

### C65 原 interop 真实高位 i32 probe 身份收口

- [x] A：原完整 interop 只加 Node `--stack-trace-limit=100` 重放，保全部原输入/100000 元素/原堆/auto 参数，95s 自然栈溢出、exit1/cleanup true，`c65-original-interop-deep-stack.log`。完整栈重复 `literalOperation→decode→source-operation→WASM literal-kind→managedHostLiteralProbeExports.invoke unknown-function`；自动 probe 未识别而重新进入真实品牌函数。实际 getter 返回 signed i32，而既有登记要求 `value>3`；高位 handle 因负值漏登记，factory 的 uint32 同位调用无法命中认证。
- [x] B/C：仅维护 `managed-host.eli` 的已认证 module getter/实际 invoke 身份 lookup：合法 signed i32/uint32 的同32位模式作为 Map key，getter与原 invoke 的实际返回/参数完全原样转发。未知、非整数和越界 callee 不加入认证、不增加隐式转换。新增负 i32 getter/无符号 transport 同身份、同 owner 重入、跨 owner、未知 callee、不合法 count、false/undefined 首错与恢复、原 descriptors 不变 B；原正位 scope B 保留。
- [x] D：两映射生成成功；新增 signed identity 与原 automatic probe B 共2/2，以及原 authenticated codec-scope B 1/1 实际通过；`c65-signed-probe-regressions.log`、`c65-signed-probe-codec-scope.log` 均 exit0 / cleanup true。原完整 interop 仍在独立受控执行，尚未标记通过。
- [ ] D：仅生成实际两映射；集中运行新增 signed 身份及既有 probe scope B，再执行原完整 retained interop。已绿 formatter/raw pin/Error/integrity 不重复。不提高栈、不修改正式 compiler/runtime/literal、不删 scale。

### C65 最后 Number 与 typed emitter 原门禁

- [x] D收齐：共同arity修复后原Number完整9项8 pass/1 oracle前提错误；primitive原17项16 pass/1同Bun fresh独立Seed模块加载失败，先前历史hash检查已越过。证据`c65-number-text-node24-arity-fixed.log`、`c65-primitive-operators-arity-fixed.log`，集中guard exit1/cleanup true。
- [x] A/B/C：按当前真实统一合同修完整错误前提，而非只特判首个MAX_VALUE：memory的heap-number-radix与JS内部numberRadixText都规定十进制走Number短文本、非十进制整数完整精确展开；后者主动避开宿主私有nondecimal表示。规格0069也规定有限Number十进制最短文本。故十进制全域用独立原生Number.toString oracle，所有非十进制整数（含超大整数）仍保BigInt完整oracle。
- [x] B/C：完整原callback迁维护Eli，原18固定值+64个LCG(0x711c4a39) binary64、全部82×35基数、同一IR/zeroimports、每步IEEE/动态方法/JS严格相等/实际回收全保；独立Node child使用同一完整发射字节及原全部words/texts逐项执行，实际输出82/35。原9 case登记和原120000ms/child30000ms不改；其余8原body仍真实执行，原档SHA不改。
- [x] C：primitive原17完整body切既有Node24 exact桥；只原typed emitter callback继续历史原SHA+唯一Unicodeimport撤销兼容摘要，并实际独立Emacs numeric发射完整bytes对比和3个原拒绝反例。未新增加载器回退、未更新golden。
- [ ] D：这两个完整file在所有新源生成后一次补验；33个已绿static/guards/native及function不重复。

- [x] D收齐：Number原9/9实际通过，包括完整82×35语义与独立Node；primitive在Node24的typed原历史摘要/独立Emacs完整code已通过，但完整原17中的真实Bun.build用例不能在Node执行（16 pass/1 Bun未定义）。保该真实构建断言，不伪造Bun对象、不删除此项。
- [x] C最终方案：撤primitive整file Node路由，继续原Bun完整17项（含实际Bun.build）。仅将独立Emacs生成的numeric参考模块交Node24子进程，实际加载同一Emacs产物、发射同一完整原IR，回传完整文本由父逐字节比较；原Unicode-only历史摘要/原immutable/3反例继续原Bun执行。不新增泛化加载器。
- [ ] D：只生成实际改变映射后运行primitive原完整17项；Number9与已绿33项不重复。

- [x] D最终：Number原完整9/9通过（`c65-number-text-oracle-final.log`）；primitive原Bun完整17/17通过，包括真实Bun.build与历史SHA、唯一Unicodeimport兼容摘要、独立Emacs完整发射文本及3反例（`c65-primitive-complete-seed-node-final.log`，exit0/cleanup true/峰约1.05GB）。与static19+guards5+native9合计本族最后59/59实际通过；不替代其它仍未补验的门禁，也不把此前明确延期压力项记通过。

- [x] D最终补齐：原portable-predicates完整17/17通过；portable-reader完整21项20 pass/1原压力明确DEFERRED（不是通过），新增普通预算首错/状态不提交/后续恢复/零根回收真实通过。保原300000ms CLI、完整13源Seed+三代fixedpoint、Node/UTF16/GC/effects/真实trap全部原断言。证据`c65-portable-predicates-arity-fixed-final.log`与`c65-portable-reader-arity-fixed-final.log`，集中guard exit0/cleanup true。此前共同arity阻断的本族两个文件现已闭合，不再追加无关工作。

### C65 wire 真实默认参数根因修复

- [x] A/B/C：原wire第一调用实际TypeError消息为“Expected a canonical public operation path”。生产HTTP literal的9个API/闭包把缺参&optional nil与JavaScript undefined默认混用；直接schema的check-row同根。仅这些边界改&rest实际取参数，缺参与显式undefined沿原默认，显式nil/false值保留交原业务校验，compiler &optional语言语义不变。原HTTP业务主体/MDP/MDS/GEPO黄金/原5case/容量时限不变。
- [x] B/C：新增纯Eli Node辅助入口，从这10个实际源AST提取原参数与真实默认绑定/初始化前缀，由当前编译器生成独立模块，在Node24实际调用缺参/undefined/nil/false共40组，独立expected核默认与显式值边界；该B只证明实际绑定前缀，完整API/三后端仍由原wire5和既有标准库完整断言验收，不能相互替代。真实源和helper/map进入wire闭包21资产。
- [ ] D：本批全C冻结后统一生成维护B/共享接线，再一次原wire完整5、对应B、来源门禁；冷agent raw host result pin修复已生成将同时纳入。未运行前不计通过。
- [x] C65 最终numeric门禁接线按真实宿主收敛：primitive原17保Bun完整body（含真正Bun.build），只独立Emacs seed生成物的加载在Node24子进程，原fullbytes/旧hash/否例不弱化；Number原9保Node24完整callback与82×35覆盖，decimal独立标准number oracle、非decimal原BigInt全文。补3pair源码/maps/ignore及真实source闭包，不残留primitive Node整file路由。
- [x] wire 新完整5项收齐仍2P3F，但原codec调用与零roots清理已通过，三后端唯一首业务故障一致移至 MDP roundtrip0（nested/array/table/mixed原完整输入）RT0003。按明确诊断授权，维护Eli仅在显式 `ELISCRIPT_WIRE_BRANCH_DIAGNOSTIC=1` 时用同一实际runtime/完整graph，从该真实失败输入派生各顶层/User子分支和累积前缀，一次收集返回/首错；普通运行不执行诊断，不将拆分输入当验收或改变原case/黄金。C66正式源码暂不因猜测改动。

- [x] wire 分支诊断真实确认：标量、嵌套对象、标量数组均返回正确；对象数组rows与mixed在内部key收集唯一新分支失败。公开Array.flatMap当前无真实后端实现，先前迁移B的“已支持”文字只有未验收前提，不能冒称已通过。本次仅MDP库内部改为已支持Eli循环的单层key收集：捕获源/映射数组length、依次HasProperty/Get跳holes、保持Object.keys执行顺序与非数组映射值、完整收集后才构造Set去重；原表格/混合递归/键与行顺序、130完整roundtrip及所有既有黄金不改，不新增公共Array API。该正式literal源变更位于C66固定点之后，最终候选需如实重新捕获。
- [ ] D：默认参数族后原wire已完整收齐2P3F且codec+cleanup0已过；新的内部key收集修复需对原完整5和原测试黄金集中重新验收，不以分支诊断或辅助B当通过。

### C73 monitor snapshot 主线阻断（C72产物冻结后的隔离施工）

- [x] A：基线 `tools/testing/resource-supervisor.mjs` 的 snapshot(101)、startSampling(151)、launcherMain(165)、supervisorMain(217)、startResourceSupervisor(312) 为完整迁移边界。原实现逐字节归档 `resource-supervisor-legacy.mjs`，维护源改 `.eli`；原8GiB tree/本批aggregate、75ms采样、150ms回收宽限、PID birth+private token+独立pgid认证、已知脱离后代、IPC确认/失联回收/首错均保留。
- [x] A：单个ps采集上限3000ms；仅code ETIMEDOUT或本次限时触发的killed+SIGTERM执行失败可重试，总共最多3次、间隔75ms。坏行/空数据/自身不可见/非瞬态执行错误立即失败。最终错误保code/signal/killed/attempts/cause并在fatal/result传播；不把最后snapshot当当前有效数据。独立75ms IPC heartbeat不依赖ps成功；失联12s覆盖有限采集窗口，不设置任务总时限，不关闭RSS保护。
- [ ] B：原 `tests/test-resource-supervisor.test.mjs` 完整11项和原输入不改；新增维护Eli覆盖一次timeout恢复、三次timeout停止、非瞬态/坏数据首错、完整diagnostic与fatal cleanup，编写不运行。
- [ ] C：新增 `.eli` 实现全部原公开入口和私有IPC入口；共享mapping/ignore/来源资产由独立负责人统一接线。
- [ ] D：全部本批源码冻结后统一生成并执行原11+新增B，未运行前不标通过。
- [x] B已写齐未运行：新维护测试3项，覆盖timeout一次恢复、持续3次失败完整身份、4类非法snapshot/非瞬态错误立即失败。真实fatal cleanup复用原11中的one-byte RSS、SIGINT/SIGTERM/guard-killed后代回收、runner异常失联回收、缺外部Node运行时四完整原用例；不改其child输入/4s等待/10s或20s时限。原11加新3固定14项，不把复用另造重复用例计数。新采集能力固定超时及有限重试由新B逐次校验；未执行。
- [x] C：完整维护 `resource-supervisor.eli` 已写齐原所有公开函数、launcher/supervisor IPC入口、ACK后启动与已知脱离后代回收。readProcessSnapshot默认调用真实execFile，只B传确定性执行器/自身pid；生产监控路径不接受此覆盖。snapshot失败通过fatal/result保code/signal/killed/attempts；不记录ps stdout/环境/其它进程命令。独立heartbeat只证明IPC存活，不能替代RSS测量，持续采集失败仍触发原stopAll回收。原JS archive不改，新B3+原11未执行；共享接线由统一负责人完成，D等待全批冻结。

### C73 历史独立CLI门禁与正式stage3的真实入口分离

- [x] A：现状链为原3个SHA绑定suite→`fixtureChildArguments`→`independent-cli-fixture`→原child_process.spawnSync；原独立artifact应由已有`compiler-cli-legacy.mjs` parser执行。当前仅default对象/syncBuiltinESMExports，Bun named spawnSync仍可进入正式release；package还直接spawn `bin/eliscript-compiler`，未在现argv替换边界。这导致help文本和独立artifact错误被正式stage3身份拒绝遮住。图索引无Eliscript coverage，按具体源码/原完整失败栈定位，无推断改变authenticator。
- [x] A：只改维护 `tools/testing/independent-cli-fixture.eli`。保原3个SHA/原source/所有argv/timeout/structured errors。新增`rewriteIndependentCLIInvocation(command, arguments, options)`：精确绝对bin坐标作command时以原options.env.BUN或当前runtime执行同独立parser，bin在argv中则单点替换；原tools CLI坐标及唯一eval URL沿旧算法，最多一处，不识别的路径原样，多个坐标拒绝。Bun安装时用现成mock.module显式转发真实child_process named spawnSync，恢复原全部exports；Node继续syncBuiltinESMExports。没有新CLI实现或JS脚本，正式release/stage3指定校验完全不动。
- [ ] B：现Node维护入口新增精确bin/engine/options/模糊路径/重复坐标反例；新增Bun维护入口真实named spawnSync调用原独立parserhelp与未知参数structured error（Node24和Bun各一次），不伪造输出。原三个完整suite所有正负例/UTF8/structured diagnostics/body原字节保留；已有stage3完整拒绝stage2/伪造固定点B复用不改。
- [ ] C：全批B齐后一次实现，新增pair统一交共享负责人接线；不写正式compiler/runtime、不改stage3认证。
- [ ] D：全批C齐后统一生成，再执行真实受影响完整suite和新增B，不局部重试。
- [x] B齐未运行：保原Node维护B1完全不改，新增Node invocation B1（精确bin/engine/options/argv不可变/未知路径/双替换拒绝）及Bun named入口B1（两个真实宿主原parser help/structured unknown-option）。新增维护文件 `independent-cli-invocation.eli`、`independent-cli-named.eli`，都用真实parser不增加JS脚本。B总新增2，原三个完整suite不减，正式stage3否例复用。

### C73 C72 三个原协议/record失败项目（静态证据与验收边界）

- [x] B：直接复用 C72 原 `core-stdlib-usage.eli`、`core-language-api-usage.eli`、`declarative-record.eli` 三个完整项目/原host/原golden/functional-small参数，保全源模块与独立JS结果，不为流程重写或缩小输入。旧失败各1次，尚无本批行为修复/复验。
- [x] A事实：declarative-record 的实际错误是编译后的 `core.protocol.dispatch→external-method` 未命中 Person exact prototype registration，抛原 `IDescribe/describe` missing object:Person；自定义协议与同description的canonical标准Symbol无合并关系，不得按名称重新绑定或绕过缺失分派。
- [x] A事实：另两项目只保留 `{kind:13}`。`managed-host-runtime.eli` 的 `call` 异常分支取WASM exception后`throw(wrap value)`；project.prepare/run及initialize直接调用call，不经过withHostValues内部sourceThrown解码。该证据不足以把它们强归同一协议原因，不能按同族猜改record/provider。
- [ ] C：确认实际constructor/prototype身份在编译侧注册与宿主materialization的分歧后，仅修真实必要边界；不得改decodePersistent整体、预算、语言合同或golden。当前未证明具体身份分歧，保持生产源码不动；正式验收中须保留可解码首错，未解决不能记通过。
- [x] C（CLI）：已仅在现SHA绑定adapter补完整Bun named builtin转发及精确bin坐标，命令/原options对象/原metadata/参数和脚本其余字节保留；恢复原default/named namespace，原3suite不改。正式release和stage3认证没有改动。
- [x] C（真实throw）：只initializeModuleInstance、project.prepare/run三调用点改用现withHostValues(lambda codec ...)，sourceErrors/rawResult保持默认false；原call.wrap已pin异常，sourceThrown成功解码后释放同handle，统一finally清roots，falsy/undefined原抛值不改变。不是只改日志，不加pin/预算/解码fallback新设计。record原型别名由父在其owned codec本批接入，本子任务不改父decodePersistent区。

### C73 C72 最后两个JS原完整记录入口修复

- [x] A：`original-sequence:managed-language-intrinsics-source`（000771）保留execution两步都因实际0n与JSON bigint marker对象比较失败；request/project均真实返回。现解码器只由binary execute-exports调用，JS明确转legacy，故只在exact JS记录私有context副本解码原artifact contract，原42calls/两个完整project/同产物byte证据不变，不改bigint语义或golden。
- [x] A：`original-tools-artifact:compiler-session-tools:node`（000788）原AggregateError oracle编译dataURL包含真实默认Unicode bare import；Node24以dataURL不能解析package，未到Aggregate业务。最小源transport为纯Eli helper真实导出node:child_process.spawnSync，注册仅data父模块下精确Unicode specifier→真实包内runtime URL。现prepareOriginalToolsCLIContext只将该原host唯一child_process import坐标替换为真实helperURL，完整oracle原bytes、原host其余body、CLI认证、Aggregate共享cause/undefined/false/-0、UTF8全部原assert不动。Bun/非exact记录保持原入口。
- [x] B：直接复用这两个原完整record+原独立黄金/时限；sourcearchive既有原42calls/完整BigInt精确值/非法marker拒绝/编码往返B复用，不为流程缩输入或重复造用例。旧失败各1次，当前尚未修后验证。
- [ ] C：仅维护execution exact context预处理和Node host模块坐标，新helper .eli/真实mapping与资产闭包由共享负责人接；父持有主runtime，完全不改其源码。
- [ ] D：全部C齐后集中原记录+现B验收，当前禁止生成/功能测试。
### Wire 完整功能资源与原容量验收分离

- [x] A：内部key收集修复后的原完整运行，WASM auto65536/1均在原case8（MDP roundtrip7）报RT0002；此轮没有采集heap统计，不能推算live或bytes。只为已认证原wire SHA和原8192/256KiB/16MiB选项，在同时显式small与DEFER1时采用既有small131072/8MiB/64MiB；不改auto、输入、黄金、strict默认及未知选项。原小容量验收明确DEFERRED / NOT ACCEPTED。
- [x] B/C：维护纯Eli适配、完整缺flag/未知source/逐项不同资源否例、选项不可变与真实stats快照断言；安装入口先认证原档，再用实际options/heap统计记录初始化与原首错。不猜测峰值，不把辅助B替代完整5项。
- [ ] D：整批源码齐后统一生成并运行完整原wire5与受影响来源/辅助B，保全部真实失败；只采用上述一次现有功能profile，不逐层猜加内存。
- [x] D已收齐：旧8192容量的auto65536/1均同case8真实RT0002；经明确授权取消已被新功能profile替代的后续native，native为CANCELLED / NOT PASSED，guard reason=cancelled、exit130、cleanup true，原日志保留。primary三映射生成3/3通过；新资源/既有wire辅助B共8/8真实Node24通过；正确Bun来源完整30/30通过。最初把Bun来源文件交Node造成bun:协议拒绝的诊断日志保留，不当语言失败或通过；当前功能profile原完整5仍独立受控执行。
- [x] D首轮功能资源收集：auto65536推进到HTTP后被原整case120000ms判超时（实际约652s让出事件循环时才报告）；其后捕获的canonical-path异常对应原HTTP故意拒绝非法路径的有效负例，不能据此修改HTTP语义。中断后发现原guard消失、本任务bash/Bun成为孤儿；核精确PID/出生时间/参数后仅终止本树，余下auto1/native为CANCELLED / NOT PASSED，不冒称整5通过。初始化实际live57382/used8559344、首次异常时live92787/used10325288/frame0，未触small容量。
- [x] A：仅同一原SHA、双显式功能profile和原三个完整后端case的原120000ms登记参数，采用Bun正式支持的timeout0取消整用例总耗时判定；strict默认保持原deadline，时间与8192容量均明确DEFERRED / NOT ACCEPTED。真实逐case成功断言后的collect返回才记录有限完成ordinal/函数名，不给预期HTTP负例发送失败通知；原HTTP单请求超时/中止业务断言仍保留。
- [x] B/C：补登记callback/参数/skipIf与未知case/错误source/缺flag否例、真实成功collect进度/首错/返回身份不变B；维护installer只精确改变原三case总deadline0，注册源SHA实际认证，其余body/时间原样，原6类portable调用在真实collect成功后给出有限原ordinal。一次与宿主修复统一后才完整原5，不扩HTTP源码、不增加巨大常量超时。
- [ ] D：本批维护生成、全部新B与原完整5待统一执行；已有8B/30来源证明保留，但不是本批新登记B/完整wire通过。

### 原 interop 完整规模的真实 collection 同步阻塞

- [x] A：signed probe 修复后的原完整 interop 在原输入/资源下继续执行；只读 live inspector 记录原 host 第205行 `index=62/2000`、`generatedAgreement=true`，100000 元素 scale 尚未初始化，且 finally 明确 resume/断开，未把 CPU 活动当作验收通过。真实栈位于 `synchronizeCollection→readSource→decode cachedEntry.refresh`。现有同步每次扫描包含普通对象/函数的全部 sourceCache；对完全未变的 Map/Set 又深 decode 全部成员，嵌套 collection 重复刷新。
- [x] A：只改维护 `tools/backends/eliscript/managed-host-runtime.eli`。保留每个真实边界的双向同步，不用 outer-depth 跳过 host 可见修改。维护按 sourceCache 原顺序的 raw→collection-entry Map，attach 时登记、替换保序、真实 finalizer/close 时移除；每个 collection 读取真实 host entries 与 source table 完整 raw key/value 顺序快照。只在任一侧变化时调用原 importHost/exportSource，双方变化仍原 host 优先。原始表 handle/成员 handle 含 generation，未改变的快照不需深 decode；其内 shared plain object/array 仍由原 live source-view 读取，nested Map/Set 仍独立参与每次边界检查。不增加 formal epoch、ABI 或资源。
- [x] B：补真实 WASM/native auto1：host 同长度 overwrite、delete/reinsert 顺序、source 同长度更新、nested shared Map、值内共享 plain object/array 原句柄不变但源内容改变仍可见、host getter 修改后抛首错的身份与后续恢复、caller frame/最终 live0。原 raw pin/probe/formatter通过证据保留。
- [x] C：全部维护实现和 B 已写齐：保持所有实际边界，按真实完整 raw 表成员判定变化，原 import/export 与首错规则不变；登记只持原 weak entry、不保留 view，替换保序、finalizer/close 同步移除。仅维护宿主源码变化，无 formal ABI/epoch 改动。
- [x] D前置：两映射真实生成2/2通过（`c66-collection-sync-generate.log`）；新独立 B 在真实 WASM/native auto1 完整通过，frame/live 最终0（`c66-collection-sync-regression.log`，1项、内部两目标，exit0、cleanup true）。旧 interop 已在该新证据成立后按归属取消，原 guard 收据 reason=cancelled、exit130、cleanup true，原运行 NOT PASSED，不是 OOM/时间截止。
- [ ] D：新窄 B 与原完整 interop 按同一真实新宿主集中验证，未执行前不计通过。
- [x] A补充：新原输入一次进度为第136/2000、agreement=true；真实栈仍在每次 codec 内部嵌套边界的 readHost 全扫描，不是无进展/容量失败。宿主维护层增加 collectionBoundaryDepth；只抑制同一受控 codec 的嵌套检查，真实 capability dispatch 与 literal-provider 方法通过 withHostCallback 强制前后同步，外部 JS 执行期间暂置 depth0，确保回调重入仍完整同步，finally 还原并保首错。保持全部原字段/快照和 formal 源码。
- [x] B/C补充：真实 WASM/native auto1 的 host callback 修改→重入 source Get/Set→立即观察→首错→恢复完整回归与该最小深度接线已一次写齐；capability dispatch 和 provider 的 read/kind/create/标准协议引用方法保持真实 host 边界。待统一生成/验收；现运行绑定旧宿主，不充作新源码验收。
- [x] D补充独立回归：两映射再次生成2/2通过（`c66-collection-reentry-generate.log`），扩展后的完整 B 在真实 WASM/native auto1 通过（`c66-collection-reentry-regression.log`，exit0、cleanup true）。此前无 depth 的原完整运行因新源码取代而取消（`c66-original-interop-collection-sync.log`，reason=cancelled、exit130、cleanup true），不计原完整规模通过；最终同输入复验记录 `c66-original-interop-collection-reentry.log`。
- [x] D真实失败已收齐：该最终原规模一次运行自然以 ELI-RT0002 结束（run `2923ee9635ce4e90beb5cdf5cbe42633`，exit1、cleanup true），进程峰值8.32GB，非进程 OOM/时间截止。该次实际 small 为131072 slots/64MiB、auto65536，未得完整原JSON；完整2000/100000功能仍 NOT PASSED，原小容量继续 DEFERRED / NOT ACCEPTED，不能以独立 B 代替。
- [x] A功能资源收口：仅该实际原interop记录，在 DEFER1 与 SEQUENCE_FUNCTIONAL_RUNTIME_PROFILE=small 同时显式启用时，认证原manifest/id/entry、main Eli SHA3304e489…、完整host SHA c82823f3…后选择既有full-runtime（1048575 slots/256MiB），auto65536不变。formal资源选择与retained host-context共用认证；retained只读原product及相邻sources，不手改生成物。缺flag/未知source/异预算保原路，strict和small容量明确NOT ACCEPTED；全部2000/100000与完整JSON不变。
- [x] B/C功能资源收口：维护选择与实际host文件认证、默认/双flag/篡改/预算否例及不可变性已全齐，覆盖formal同预算、未知source原路和实际host篡改严格拒绝，无生成物手改。
- [ ] D功能资源收口：三映射生成一次并验证资源B；最后只用新配置运行原完整程序，16GiB进程树独立上限，若触限保失败不原样重试。

### 原 wire HTTP 异步边界定位

- [x] A：已有原253个portable场景完成，HTTP后半段只有预期canonical-path拒绝日志，无具体await证据；旧完整运行被取消，HTTP NOT PASSED。保留的旧native只有dylib，没有其实际typed/descriptor，不能用新IR假配旧库。只把原httpContracts79行完整迁至既有维护Eli fixture helper，全部请求/黄金/timeout10ms/abort不变；每个原异步公共调用只有限记录start/resolve/reject，返回同一真实promise，观察错误不能改首错。
- [x] B/C：HTTP观察器透明性回归、原HTTP完整合同、仅显式诊断模式执行的既有测试入口与一次真实原图准备已写齐；从同一实际lowered生成WASM/native及其真实ABI快照持久保存，不将旧IR代入旧dylib，不运行253个portable场景。诊断结果不能替代原完整五项验收。
- [ ] D：整批两映射生成后，一次原HTTP有限phase诊断定位实际await；证实根因才修主线桥，最后原完整5项正式验收。

#### HTTP 拒绝值的真实 Error 反射阻断

- [x] A：HTTP-only 第4次启动首次实际执行HTTP合同，发现/权限/HEAD/OPTIONS等均完成；`body.limit` 应拒绝原 `RangeError("HTTP response byte limit")`，实际在宿主 `decodeOrdinary` 的 source-view refresh → `value-source-own-keys(mode1)` → `heap-reflection-names` 收 ELI-RT0003。该函数旧 `kind13 flags & 8191` 拒绝同时拒绝正式 `value-error-new` 的合法 Error 标签1–7及message/cause标志。仅修该旧拒绝条件，允许已存在的Error标签；其余特殊对象拒绝和未生成stack合同不动，descriptor/symbol路径继续既有真实字段逻辑。
- [x] B：同一真实Eli模块构造5种Error及cause/own descriptor/显式stack，JS独立oracle与WASM/native auto1比较；同步throw与Promise拒绝必须保同一Error身份、消息与原正则，清理后frame/live0。保原HTTP全部请求/10ms/abort及独立黄金。只写齐，不运行。
- [x] C：仅正式 `heap-reflection-names` 小hunk，和该真实回归；不更改HTTP算法、宿主首错或容量。维护B映射已生成，Emacs exit0/cleanup true；未启动行为验收，本批冻结等待全部C齐后统一D。
- [ ] D：新正式runtime须重新发射真实wire产物及其同源ABI快照后验HTTP，旧snapshot不冒充新源。原完整5项仍待正式验收。前三次启动失败分别是Bun入口、另一修复的类型源码编译、缺少Eli loader；它们不计HTTP生产修复失败。当前HTTP实际语义失败1次、生产修复尝试0次。

### 原完整 transient auto1 的已证实 js-cons 主线阻塞

- [x] A：原完整 transient state 首auto65536通过，auto1原30s项实际长跑后失败，后续native旧计算不构成新源码证明。原输入最大1057，伪count2147483647在conj前严格拒绝，不改变原counts/资源/30s、120s门槛。静态链persistent-vector-to-array/reverse重复js-cons，后者通用迭代逐元素分配，auto1每次完整GC，形成确定高开销。
- [x] A/B：只优化value-source-js-cons；快路认证使用真实既有realm状态：host-object-identity-enabled=0、heap-control25=0（原始control偏移100的pristine标记）、kind14、无own property/descriptor table、无显式null/custom原型标志8192、direct parent为真实标准Array.prototype或其未物理化时默认Object.prototype、每slot不是hole4。任何不满足（含所有realm mutation、own iterator/getter、iterator.next覆盖、proxy/foreign、hole、nullish）均原完整路径，无提前Get及重复getter。原realm note覆盖所有真实原型/iterator修改；不新增公共API或框架。
- [x] B：新纯Eli用例保auto1/caller负零根、input identity与完整输出、1024 vs8长短dense复制的GC次数不随元素增长；9种完整fallback覆盖own属性/holes/custom proto/iterator getter首错/非callable iterator/realm mutation/next覆盖/inherited index getter；另foreign/stale拒绝与恢复。原js-cons全部真实输入/协议/异常/原始容量与native/Node断言直接复用，不改预算或黄金。
- [x] C：头尾先由原frame持有，fresh结果先root；保既有heap-text-array-append一次真实头append以维持原人工实际trap边界，再整体resize并value-set复制tail。每次重新取得heap-block，不跨GC保留offset；nullish完整原路径保早期容量否例。原10+用例不必迁移其trap注入点，不修改stdlib算法。
- [ ] D：全C齐后由父统一生成新B/正式runtime并执行原完整transient4项、原js-cons完整suite及新B；旧失败证据保留，不用超时扩展替代通过。

### 完整 transient 向量复制的同族线性实现

- [x] D收齐：新js-cons快路B修正fixture括号后3/3通过；原js-cons完整11/11通过，含真实append trap/raw容量/Node/native；但完整transient的auto1仍未形成通过，因完整stdlib的合法realm修改使保守快路回退。经授权核对所属guard79293（创建09:00:05/完整args）SIGINT结束旧计算，guard exit130并保原NOT PASSED，不重复旧计算。
- [x] A：persistent-vector-to-array先reduce(js-cons)再array-reverse，私有array-copy-assoc/drop-last/reverse也反复js-cons；在合法realm修改后这些全回通用iterator，auto1每分配完整GC。只改to-array不足以关闭from-array每步的旧复制，故同族4处一次处理，不增加realm追踪或公共API。
- [x] B：新纯Eli回归编译实际完整persistent-vector模块，只在其真实module中附加独立测试exports；原stdlib函数源码不投射/不mock。保0/1/31/32/33/1057边界、auto1/原8192slots与262144–16MiB、源不变、metadata身份、fresh结果、own writable/enumerable/configurable data属性；private helper getters顺序/替换位置不读取/首throw身份与禁止继承numeric setter全部严格断言。原完整transient4项同counts/语义/30s/120s/资源继续验收。
- [x] C：一私有array-append-own复用既有Object.defineProperty创建新结果own data。array-reverse仍按原ascending顺序读取源一次，再只交换自己的own data；copy-assoc/drop-last按原索引顺序直接创建结果；to-array按原persistent-vector-reduce遍历顺序直接构建fresh数组。消除临时数组被重复迭代/复制，不改变vector trie、共享、metadata或输入，不引入push覆盖/继承setter副作用。
- [ ] D：本批全部源齐后生成唯一新B并实际执行新B3及原transient完整4；不重跑已绿js-cons14或原96。

### 向量复制准入失败后的同族收窄

- [x] D：新vector B和原transient在beforeAll均被既有portable准入正确拒绝：`array-append-own`使用`Object/defineProperty`；本轮未执行行为，不计通过。完整失败见`c66-vector-copy-full-B.log`、`c66-transient-linear-vector-full.log`，受控运行exit1、cleanup true。
- [x] A/C：上述4函数及append-own完整撤回本批前源，spec0021、两编译器portable准入和原纯函数合同完全不改。只在既有runtime js-cons快路替换过宽的dirty拒绝：无关原型修改后，以现有私有Array methods[25]及iterator registry[6][1]认证当前@@iterator与own next为原数据方法；accessor、删除、其他方法值或自定义原型全部回原慢路，不执行额外getter/初始化。其余hostidentity0/noholes/默认原型/无own表和原root/append trap边界全部保留。
- [x] B：在原dense测试加入合法Object/Array无关原型mutation后8/1024完整值、身份和GC成本断言；原iterator/getter/next覆盖与首错用例不减。vector新3功能B保留，以原stdlib实际源码验证边界、读取顺序、fresh own data和metadata。
- [ ] D：两维护B统一生成后集中运行新vector3、扩展js-cons3和原transient4；不重跑未变的原js-cons11与原96。
- [x] D已收齐：两维护B完整6/6通过（`c66-certified-iterator-vector-B-full.log`，guard exit0/cleanup true，峰1.28GiB）；原transient首auto65536完整通过7.41s，但auto1已超原30s且未返回，不能计性能通过。该旧版本因本批同族copy实现替代，经核对guard99216及child99221同创建09:12:57/完整args后SIGINT，终态exit130/cleanup true；其余项CANCELLED / NOT PASSED，原证据`c66-certified-iterator-transient-full.log`保留。
- [x] C：仅fresh结果copy循环把`value-set`换为直接`store-u32`。原guard先认证tail同heap/noholes，head/tail/result均在原frame持有；fresh结果已resize、无descriptor/own表，循环无allocation/callback，只复制已有引用，不需要逐元素公开Set及全部realm constructor扫描。一次原head append及其真实trap边界保持，公开raw ABI/错误、portable规则、stdlib均不改。
- [ ] D：strict默认原30s/120s保持，时间明确DEFERRED / NOT ACCEPTED；仅已认证原suite且双显式功能flags时把整case总deadline延期，再以原完整4项验证全部输入/输出/roots/cleanup，不能将功能通过冒称时间达标。新copy受影响B全6项同批执行。

### 原 native prototype callable 的 BigInt radix 阻塞

- [x] A：原完整用例确认BigInt radix对象在`heap-boxed-radix`直接进入只接受primitive的`value-to-number`，跳过现有number-hint ToPrimitive，导致valueOf未调用、sentinel首错身份丢失；原mode3/4/5为真实生产失败。原mode0的BigInt.toString.length=1是元数据及独立旧oracle的错误前提，当前基线真实length=0。
- [x] B/C：复用原全部mode0–8（含wrong-brand先拒绝、radix/receiver/extra参数顺序、替换方法与恢复、null/NaN/超界/BigInt参数拒绝），不改原raw输入或其余黄金。runtime仅把该转换改为已用于Number radix的`heap-source-number`，原frame/first-error保留；managed backend只把operation157长度由1改0，Number.toString及Symbol.toPrimitive原长度不动。维护Eli callback/Node真实oracle及来源接线由同批工具任务完成。
- [ ] D：修复批次第1次，尚未验收；该原完整30项由工具任务统一执行，本任务不重复跑。正在执行的原transient完整4继续使用其已冻结runtime，不宣称包含本次BigInt修复。

### FIX-05 原 core types 首错边界

- [x] A：原首错诊断第3次已进入实际业务，有限phase确认第一次`Type.defineType`（Box）内部即RT0003，尚未到slot读取和Reflect.construct。现有485普通wrapper本来就有constructible1/own prototype，482仅用于原不可构造getter等，不按错误前提更改factory。真实诊断产物/descriptor/ABI保存在ignored evidence；前2次mock live-binding递归和准备后export坐标错误均为诊断启动失败，未进入产品，单独计数。
- [x] B：新增10个独立完整阶段，用实际Type源仅在测试copy追加private exports；覆盖name/fields、冻结protocol metadata/implementation identity/plans、无plans class及name重定义、完整type/reify、482保持不可构造和485真实construct/prototype/descriptor。IR与全部literal源未变性、zero imports、同core功能资源和最终roots0全部保留。仅写齐未运行，统一接线由同批工具任务完成。
- [x] C：静态确认485的`value-function-wrapper`重复查询可空native Function缓存，而此前`heap-function-method-new`成功时可只走弱realm prototype fallback，不填该缓存，导致首个protocol wrapper仍fail3。仅复用刚成功result.info.p40中已经认证且被result持有的同realm prototype，再由原frame持有；不改482/485的构造、prototype、this或首错语义，不新增factory/公开API。原10B最后一项另补未显式读取Function时首次wrapper及held wrapper跨3轮auto1/collect后的真实调用/构造/prototype身份，全部源码写齐未生成未运行。
- [ ] D：该真实行为修复批次第1次，等待全批C冻结后统一验收；前述诊断业务失败1次及启动失败2次单独记录，不能当修复后失败或通过。


### C73 全量门禁后的统一修复（2026-10-20）

本轮原 Make 命令全部结束，继续执行模式退出 0 不代表通过。Emacs 248/248、Org 3/3 通过；Node 330 项为 279 通过、46 失败、5 跳过（严格通过 84.55%）。文件执行器因握手失败没有启动 core 303 与 applications 24；这些必需项全部仍判验收失败。合同有三个失败命令：稳定库存、parity 身份、监管器被错误跟踪的生成物依赖。CLI、应用构建及严格字节编译完成。完整日志为 `c73-full-make-test.log`；固定点 313/313 的既有证据未受工具修改影响。

当前 → 目标调用链：
```text
tools/testing/resource-supervisor.eli optional-field(message, :type)
  → JS message[keyword] → 握手未识别 → 327 文件未启动
修改：optional-field(message, "type")
  → message.type → ready/owned/ack/started/result/close → 原文件完整调度
```

本批修改树（源码位置绑定 C73 全量日志；先写 B、后全量 C，最后统一 D）：
```text
tools/testing/resource-supervisor.eli              # FIX-44: 16 个消息类型读取参数改字符串
tests/eliscript/resource-supervisor.eli             # FIX-44: 真实监管器连续两个 Node --version 作业及关闭
tools/testing/resource-supervisor-legacy.mjs        # 原完整源码原字节保留
tools/testing/resource-supervisor.mjs               # 删除 Git 跟踪；仍为忽略的自动生成物
tools/backends/eliscript/compiler-corpus-*          # 动态入口 async 完成、原来源边界、身份/math 观察接线
tools/backends/eliscript/managed-host-runtime.eli    # 可选参数缺省 nil 与 undefined 的合同混淆
contracts/stable-compatibility-corpus.json          # 最终源码确定后原生成器重算真实清单
contracts/compiler-parity-corpus.json              # 原生成器重算真实源码身份
```

FIX-44 精确边界：`optional-field` 基线 L19 保持动态字段函数；全部调用把 `:type` 改为 `"type"`，不改变普通静态 `(get value :type)`。`startResourceSupervisor` L286 返回现有 `{run,cancel,close,pid,failure}`，新增测试 await ready 后顺序发两个不同 id，要求各结果 id 原样、exitCode=0、两次 onStart、failure=nil，finally await close。保原内存上限与独立进程树，无新增运行期限。生成物完整 legacy SHA256 为 `428b33c2875c8dea174fcd2cec6a8d74c15c299fdb5b521f395615cb5b6064bb`；正常迁移索引即可修来源检查，不放宽依赖白名单、不引入新编译器模式。

其他失败已经一次分配给三个 Astra 任务：异步生成入口/来源断言，原始 identity/math/Node 测试入口，以及 runtime 缺参/真实源值/provider 计划。所有失败的原名、坐标、分组与回归项在 `astra-failure-inventory.md`、对应 root-causes 文件，仍归本批，不单项试跑。

- [x] A / 全量失败分组与监管器根因：FIX-44 验证失败 1 轮（两个执行器启动均失败），修复失败 0；动态 host 编译累计失败 2、失败修复 1，继续保留前轮记录。
- [x] B/C / FIX-44：真实 IPC 连续作业与关闭回归已写，全部 16 处字段读取已改字符串，legacy/生成物索引迁移已完成。未运行。
- [ ] B/C / 全部其他已知失败：依照完整源码调查一次写齐回归与实现，保持首错、来源认证、原始输入及黄金。
- [ ] D / 本批全部实现完成后：统一源生成、stage3 包准备、现有 source inventory 生成器；同一 stage3 三种输出全量与原门禁统一运行。正式编译器若无改动不重建已通过固定点。


#### C74 同批新增 Math 主线修复

原 C72 `wasm-managed-math-transcendental` 的 fixed hypot 三个最小正 binary64 输入：WASM 返回位型 2，Bun 自带 Math.hypot 返回位型 0。现有 `memory.eli:value-math-hypot` 的先除最大值、补偿平方和、最后乘回算法可避免平方下溢；生产 `runtime/math.eli` 目前只统一 f16round/sumPrecise，hypot 仍委托不一致宿主。所有 Math 引用的 compiler/seed runtime 注入已经存在，不改 emitter。

- D45/B：`tests/eliscript/math-runtime.eli` 的 all-checks 前新增 `check-hypot`；固定输入含空、负零、3/4/12、最大值、三个最小正数、NaN/Infinity 优先级。对象参数逐个单次 number-hint 转换、后置 Symbol/BigInt/原首错、name/length/不可构造和持有函数在 namespace 替换后继续有效。独立预期由精确固定值给出，不能用被测函数生成黄金；Node 与现有独立 Bun 入口都执行。
- D45/C：`runtime/math.eli` 捕获原生 sqrt 和 Float64Array，新增非构造 `hypot(...inputs)`；先用现有捕获 DataView setter 完成每个 ToNumber、存 f64 并取 maximum，完整转换后处理 Infinity/NaN，finite 使用与既有 WASM/native 一致的 Kahan 平方和后 sqrt*maximum。保持实际 Math 对象、name=hypot、length=2 与标准 writable/nonenumerable/configurable；仅初始化安装一次，后续用户覆盖/删除不恢复。无需新增公共导出。
- D46：原 basic Math suite 的只准 data URL 假设早于正式 math/Unicode 依赖，按维护 Eli 认证真实依赖闭包及相同原始文件字节；不移除比较、不允许任意模块。
- [x] B/C D45：完整统一 hypot 与原错误/动态调用行为已写齐；沿用已存在的 Math 自动注入，无新导出。未运行。
- [x] B/C D46：原 Math oracle 的完整真实依赖验证和运输已写入维护 Eli，并登记同源 B；未运行。
- [ ] D：同批全量固定点、三输出及 Make 回归。regexp 维护生成块也发生真实正式源码改动，因此下一候选为 C74，不能复用 C73 产品身份。


#### 本批自举启动约束（用户最新明确要求）

- [ ] 先收齐并逐项闭合 C72/C73 已知失败。未知根因不得用“已加诊断，下一轮再看”替代修复；不能把普通功能的 OOM 默认改列性能延期。
- [ ] `astra-failure-inventory.md` 完整清单中每个问题须绑定确切源码原因、修复位置与已写回归，再由当前源码进入统一生成。
- [ ] 仍需闭合：数组 inherited-key RT3、cold-own/operand 小堆耗尽、原 wire/foreign keys/zipper 及已列相似 RT1、pow 宿主一 ULP 分歧与 Math held-route 总期限。不同首错保持独立，C73 新迁移的五处缺参错误不能倒推解释 C72。
- [ ] 源码完整后执行原稳定库存/parity生成器，再启动 C74 自举与独立完整比较；所有当轮实现写齐前不启动编译或新的测试。

已确认施工完成但尚未验收：监管器所有 16 处消息字段字符串、实际 IPC 两作业与关闭回归、测试产物正确导入坐标；原监管器完整 legacy 字节保留，生成物 Git 跟踪迁移完成。未扩大依赖白名单。退役候选 58/61/62/65 的 targets 已压缩保存在本机持久证据目录，压缩校验通过后删除原可再生展开目录；当前 72/73、源码与原始测试日志保留，避免磁盘不足阻塞后续正式构建。

### C86-persistent-host：完整持久化宿主的身份与功能期限

C85 完整持久化文件终态 20 项中 12 通过、8 失败，并有 1 个测试间错误。
本段只负责投影加载及期限；类型字段、sorted 解码和 closed 诊断由各自维护模块处理。
原 regex query 测试在创建 managed runtime 前即观察到两个命名空间共用私有品牌，
不是 managed decode 导致。原 regex 文件自身拥有 WeakMap；项目投影保留了原 query，
没有源码证据可推断 Bun 内部缓存实现。原 native/Node 宿主同时触发 spawnSync 和
用例的两个 60000ms 期限，性能失败记录保留，不作为功能已通过。

现有链：认证原 suite → canonical root 的投影 → query URL 加载 regex → 完整四宿主
原断言；hostScript 与宿主 case 各有 60 秒期限。目标链仅改变独立 provider 的物理
URL 和双标志功能期限：认证 SHA 的原 regex 全字节副本位于现有 session-owned
临时树，collection/vector 依赖 symlink 到真实 canonical 文件；每次副本物理文件不同，
原 query 后缀、所有 private-brand true/false、输入和断言逐字保留。原 afterAll 删除
宿主目录，现有 fixture owner 删除整个 session，不复制全 runtime，不增全局 brand。

源码树及接线不增加模块：tools/testing/persistent-literal-fixture.eli 内新增
persistentLiteralPrivateRegexURL/Expression、persistentLiteralHostOptions 和
persistentLiteralFunctionalHostScript；tests/eliscript/persistent-literal-fixture.eli
复用现有生成/运行登记补回归。投影 header 仍只 compile-string 一次；URL 表达式及
零 deadline 由 Eli IR emitter 发射，不引入手写 JS 或重复 compiler prelude。

| ID | 源码锚点与精确变更 | 施工 | 验收 |
| --- | --- | --- | --- |
| C86-persistent-host-B | 既有测试增加完整原 tail 逆投影逐字检查；strict/单标志保 60 秒、双标志去两期限；真实 Eli 生成子进程 argv/cwd/env/JSON 与 exit7 首错；真实双物理 regex 副本完整 bytes/SHA、canonical 依赖及独立 WeakMap 品牌 | [x] | 待统一生成/验证 |
| C86-persistent-host-C-identity | session 路径认证后只复制 SHA9594a0cd…7308b9 的原 regex 字节，独立子目录由既有 session owner 清理；仅替换原 dynamic import URL 主体，保 query 和完整原 case | [x] | 待统一生成/验证 |
| C86-persistent-host-C-time | 仅两个既有显式 flags 同时命中时，认证原 hostScript 改由 Eli 实现，去 spawnSync timeout 及四宿主 case 的总 deadline；完整结果/错误断言不变；strict 原 60 秒及容量门槛保留，两类原性能失败分别记录 NOT ACCEPTED | [x] | 待统一生成/验证 |

本段 B 先写齐，C 随后完成；没有运行解析、生成、测试、探针、审查或暂存提交。

### C87-native-private-provider：显式 namespace 在 native 项目加载时保留

C86 完整持久化文件 20 项中 17 通过、3 失败。物理隔离后的 WASM private-regex
原 case 已完整通过；native 同一 case 的输入私有品牌、echo 身份及返回两别名相等
也已通过，首次新后继错误在原第381行：新生成 regex 解码后不属于 alternative
私有 registry。此为新根因首次失败 1 轮；不把它混记为旧 query 身份根因再次失败。
两个 sorted 失败由其 provider 维护模块另修，不在本段范围。

旧链：options.hostModules 显式 Map → native loader 为 project 覆盖为 graph Map →
loadManagedHostModules 返回 graph Map → decoder 找不到 alternative namespace →
使用默认 provider。同步 WASM 没有这次 Map 覆盖，故同一原 case 已通过。
目标链保留 graph 的 NamespaceBindings 实例及全部正式 declaration ID 的迟绑定/
验证，仅把显式 Map 中不占正式 ID 的辅助 namespace 合入该实例；用户 literal
namespace 精确优先，原用户 Map 不改，不改 FFI/解码算法/物理副本/原品牌黄金。

| ID | 文件与符号锚点 | 施工 | 验收 |
| --- | --- | --- | --- |
| C87-native-private-B | tests/eliscript/native-managed-runtime.eli 新增真实小 native project：原全部 literalModules、真实库/facades/graph 初始化；alternative 新 regex 品牌 true、canonical false、别名、匹配值、echo/predicate、原用户 Map 不变及 live/frame 清理；复用完整原 persistent case | [x] | 待统一生成/验证 |
| C87-native-private-C | tools/backends/eliscript/native-managed-runtime.eli instantiateNativeManagedRuntime 的 loadManagedHostModules 后合入非 declaration-ID namespace，configuration 保同一 graph Map，无新增模块/映射 | [x] | 待统一生成/验证 |

先写 B 后完成 C。本段未运行编译、生成、测试或探针；C86 冻结源码不改。
