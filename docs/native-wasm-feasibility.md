# Eliscript Native / WASM 可行性与最小实验

> 日期：2026-10-13；性质：评估与独立实验，不是完整后端交付
> 证据：[实验源码与复现步骤](../tools/experiments/native-wasm/README.md)、
> [原始采样报告](../benchmarks/native-wasm-probe-macos-arm64.json)

## 结论

**可以增加 native 与 WASM 后端，但目前最值得验证的是数值内核的受限后端，
并优先改善现有 JS 发射质量。** 已完成同一份 `.eli` 源码经过 canonical IR
生成原生二进制和 WASM 的最小实验；两个批量数值内核中 WASM 与 native 接近。
相比当前生成 JS 有明显收益，相比直接写法 JS 的收益则大幅缩小，部分场景更慢。
这支持继续实验，尚不支持用完整 native/WASM 运行时替代 JS。

本次没有新增公开 `eliscript-native` 命令，没有修改默认编译目标、规格状态、
1.0 验收范围或版本号。现有 [0040](../specs/0040-maturity-roadmap.md) 将 native
emission 排除在 1.0 范围之外；本实验单独评估可行性，不把它计入既有成熟度。

## 三种不同的“编译到二进制”

| 路线 | 产物与执行方式 | 价值与成本 |
| --- | --- | --- |
| `.eli → JS → Bun executable` | 单文件内包含生成 JS 和 Bun 运行时 | 可先解决 CLI 分发；仍经 JS 引擎执行，不预设数值吞吐提升 |
| `.eli → IR → 受限数值后端 → native/WASM` | 明确 f64 ABI 的机器码或 WASM 内核，外围可保留 JS | 最小验证路径；适合批量计算，需类型与边界证明 |
| 完整 Eliscript native/WASM 后端 | 运行整个语言和 stdlib 的新执行路径 | 可研究独立部署、启动与计算收益；必须承担动态值、内存、闭包、异常和宿主协议 |

Bun 的单文件机制确实包含其运行时，不能把可执行文件的存在当成语言 AOT
后端完成；这一路线可以另行实测 CLI 启动和包体积。
[Bun 官方说明](https://bun.com/docs/bundler/executables)

## 现有架构能复用什么

现有链路为 reader → expander → analyzer → lowerer → IR → JS emitter。
[0007](../specs/0007-intermediate-representation.md) 的 IR 表达语义结构与源位置，
[0108](../specs/0108-versioned-canonical-ir.md) 提供版本化序列化边界。
实验直接调用 `compile_ir_string`，再由单独的 `emitNumericC` 消费这份 IR，
证明无需重写 reader 或宏展开就能接入第二个发射路径。

但 IR 不是带有完整类型、对象布局和内存所有权信息的 LLVM IR。通用 arithmetic
和 reference 节点并不证明操作数为数字；函数节点也不直接给出闭包环境、调用
ABI 或动态 arity 的实现。实验将参数/返回值限定为 f64，并拒绝其余表达式。
正式后端需要类型推导/注解或可验证的 specialization，以及动态值运行时。

两种完整后端可以共享类型化 lowering、值表示及部分运行时，再分别生成 LLVM
native/WASM 或 C；本次选择 C 是最小接入实验，并非最终技术选型。WASM 导出、
imports 和函数签名有独立约束，应设计明确的宿主 ABI。
[LLVM WASM linker 文档](https://lld.llvm.org/WebAssembly.html)

## 本次最小测试

输入是 [kernels.eli](../tools/experiments/native-wasm/kernels.eli) 的两个真实函数：

1. `recurrence`：浮点递推并累加，输入一百万步，每样本调用两次。
2. `escape-grid`：160×160 网格，每样本调用两次；迭代阈值分别为 64 和
   64.000000001，对应每点最多 64/65 次迭代。
3. 同一个 `recurrence` 只执行一步，调用两百万次，观察细粒度调用与边界成本。

每次调用改变输入并消费输出，避免无用代码消除。先验证 seed/self-hosted
生成 JS 字节相同，再检查 native/WASM 的 26 个结果及直接写法 JS 的 13 个结果。
所有计时样本校验 checksum 一致。另有两个独立测试，覆盖 64 组绑定、赋值顺序、
分支、大数常量和 IEEE 浮点结果，以及 14 类不支持功能的拒绝规则。

浮点使用 f64，关闭 fast-math 与 FMA contraction；保留运算顺序，检查 NaN、
Infinity 与负零，不用数值近似掩盖语义差异。测试仅证明本次子集与输入，不能
推出任意 Eliscript 程序等价。

## 本机测量结果

环境：macOS arm64 / Apple M5 Max；Node 26.8.2、Bun 1.4.0、Apple Clang 21、
Zig 0.16.0。原生为 ARM64 机器码；WASM 为无 imports 的 wasm32 核心模块。
每项 5 轮预热、9 个计时样本，3 个新进程会话轮换测量，共 27 个热运行样本。
以下为中位数，单位 ms，越小越好；原始样本及会话中位数保存在报告中。

| 执行路径 | 百万步递推 ×2 | 网格计算 ×2 | 微小调用 ×200万 |
| --- | --- | --- | --- |
| 当前生成 JS / Node | 14.403 | 6.373 | 26.008 |
| 直接写法 JS / Node | 2.677 | 1.369 | 10.927 |
| WASM / Node | 2.648 | 1.462 | 13.600 |
| 当前生成 JS / Bun | 4.397 | 6.002 | 20.242 |
| 直接写法 JS / Bun | 2.624 | 1.862 | 5.385 |
| WASM / Bun | 2.640 | 1.420 | 7.208 |
| Native / 本机 C 进程 | 2.639 | 1.446 | 1.756 |

据此可作三点判断：

- 相比当前生成 JS，WASM 在两个批量内核中分别约快 **1.67–5.44 倍**和
  **4.23–4.36 倍**；native 与 WASM 耗时接近。但这是两个数值内核的结果，
  不能外推到持久集合、字符串、协议 dispatch 或 I/O 程序。
- 直接写法 JS 在递推中已接近 native/WASM；Node 的网格 JS 还略快于 WASM。
  Bun 网格中 WASM 比直接 JS 快约 1.31 倍。现有生成代码的多层 IIFE、闭包捕获
  与通用真值检查是调查线索；最小对照尚未隔离每种构造的独立成本。
- 微小调用中 WASM 比直接 JS 慢约 24%（Node）和 34%（Bun）。native 在 C 内
  调用，没有经过 JS FFI；不能把 1.756ms 当作 JS 调原生函数的预期性能。
  新后端应批量调用，避免每元素跨边界。

OS 文件缓存已热时，新进程到首个一步递推结果的中位数为：native 约 1.16ms，
Bun 直接 JS 约 5.31ms、生成 JS 约 8.90ms、WASM 约 7.62ms；Node 三条路径
均约 22ms。该指标包含父进程 spawn、宿主启动、加载与输出，不是纯内核
耗时或机器冷启动。native 的优势证明的是本次极小无对象程序，不包含完整
语言运行时/GC/stdlib 的加载成本。

生成 JS 1,572 字节、WASM 2,459 字节、native 文件 33,872 字节；native 依赖
系统库，以上不含宿主引擎、完整 stdlib 或页面下载。WASM 并没有自动产生更小
的总应用。单次 C 编译约 76ms、WASM 编译约 66ms，前端到 C 发射约 4.99ms，
这些只是缓存状态和工具链相关的构建样本，不是编译速度预算。

没有测浏览器、Linux/x64、数组传输/序列化或峰值内存；Node/Bun 的 WASM
结果不等于浏览器验收。本报告是本地探索证据，不是跨宿主发布门禁。

## 完整后端的主要缺口

| 领域 | 需要解决的设计 | 性能上的含义 |
| --- | --- | --- |
| 动态值与数值 | tagged value、Number/BigInt、truthiness、精确相等与碰撞处理 | 没有类型信息时仍有分派、装箱成本，AOT 不自动优于 JIT |
| 持久集合和协议 | HAMT/trie/cons 布局、结构共享、metadata、transient owner、协议派发 | GC 和分配成本必须用真实集合负载评估 |
| 内存与闭包 | 捕获环境、循环引用、atom、宿主对象、跨边界寿命 | 不能因持久结构就假定引用计数足够；WASM 线性内存或 GC 路线均需设计 |
| 控制流与调试 | 动态 arity、递归/尾调用、异常、async、Source Map/原生调试定位 | 子集内核无法证明整个语言的行为一致 |
| 宿主能力 | JS interop、对象/函数身份、Node/Bun API、浏览器 DOM、I/O | 需要 imports、胶水层或独立宿主包；频繁跨界可抵消计算收益 |
| 工具链 | 跨平台 ABI、链接、缓存键、部署、功能探测与回退 | native 平台矩阵增加；WASM 也必须验证目标特性与宿主矩阵 |

WASM 本身提供数值及引用等类型，不能据此假定已有 JS runtime 会自动搬过去。
完整后端仍要实现语言的动态语义和宿主协议。
[WASM 类型规范](https://webassembly.github.io/spec/core/syntax/types.html)

## 建议的下一步与决策门槛

1. **先隔离并优化 JS codegen 热点**：以本实验为参考，验证语句式 lowering、
   可证明布尔条件的直接发射及闭包消除，保留求值顺序、变量作用域和双编译器
   parity。若 JS 已达到目标，不必为同一个内核启用外部后端。
2. **再验证受限内核模块**：明确类型/纯度/ABI 与 JS 回退，补一个真实字节或数组
   负载，把传输、分配、初始化与计算计入总预算；在浏览器和目标服务端复测。
   WASM/native 可共享这层后端，不先扩展为完整语言 VM。
3. **分别评估产品需求**：CLI 单文件分发可试 Bun executable；需要无 JS 引擎的
   服务/嵌入场景，再评估独立 native；浏览器批量内核评估 WASM。三者采用各自
   端到端目标，不由文件扩展名决定优先级。
4. **满足证据再立完整后端**：真实负载在优化 JS 与受限加速后仍达不到预算，或
   产品确实要求独立宿主时，才设计通用值与运行时。验收必须包含语言/stdlib
   parity、峰值内存、部署成本和故障/回退行为，不能只凭本次内核加速比立项。
