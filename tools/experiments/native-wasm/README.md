# Native / WASM 最小可行性实验

这是用于评估后端的独立实验，不是已交付的 `eliscript-native` 命令，不改变
默认 JS 编译器、公共 API、版本号或 1.0 范围。结论见
[评估文档](../../../docs/native-wasm-feasibility.md)。

同一份 [kernels.eli](kernels.eli) 经现有 self-hosted 编译器生成 canonical IR：

```text
                    ┌─ 现有 JS emitter → .mjs → Node / Bun
.eli → canonical IR ┤
                    └─ 实验 C emitter → C → Clang → 本机二进制
                                         └─ Zig cc → wasm32 → Node / Bun
```

原生二进制执行生成的机器码，不包含 JS 引擎；WASM 是无宿主 imports 的核心
模块，不需要 WASI。编译期仍使用现有 Emacs seed / JS self-hosted 编译器。
使用 C 是为了最小化后端接入成本，不表示正式后端已经选定 C 或 LLVM IR。

仅支持固定 arity、同步、所有参数/返回值为 Number/f64 的函数；有限数字/布尔常量、
局部引用、二元 `+ - * /`、`1+`/`1-`、数值比较、布尔 `and`/`or`、纯表达式
`if`、`let`/`let*`、作为语句的 `setq`/`while`/`progn` 和函数导出。
条件必须是布尔值；没有把 Eliscript 的 0 真值语义改成 C 的 0 假值语义。
浮点禁用 fast-math 和 FMA contraction。其他节点报错，不静默转换或退化。
这不是类型推导完善的通用语言子集，入口 f64 ABI 是实验的显式前提。

不支持持久集合、字符串、通用函数调用、闭包、递归、可选参数、动态类型、
协议、异常、async 或 JS/宿主 interop；宏能力未纳入本次验收。
前端能处理这些不等于后端能发射。
正式支持必须补规格、类型/值表示、运行时与完整兼容性证据。

## 运行

需要 Node、Bun、Emacs、可编译本机 C 的 Clang 和带 wasm32 后端的 Zig；
可用 `NODE`、`BUN`、`EMACS`、`CC`、`ZIG` 指定程序。不安装或修改工具链。

```sh
node tools/experiments/native-wasm/run.mjs
bun test tools/experiments/native-wasm/backend.test.mjs
```

默认产物位于被忽略的 `dist/native-wasm-probe/`，包含 IR、C、JS、WASM、本机
二进制和 `report.json`。`--out DIR` 更改产物目录，`--compiler-dir DIR` 可复用
已生成的 compiler 模块；报告记录实际使用的模块哈希，默认重新 bootstrap。
实验测试单独运行，不增加默认测试或用户安装时的 native 工具链依赖。

## 对照与限制

- 两个内核：百万步浮点递推、160×160 网格逃逸计算；另测两百万次微小调用。
- 对照现有生成 JS、等价直接写法 JS、WASM 和本机二进制。直接写法仅诊断
  当前 codegen 开销，不是新的默认 emitter。
- 每项 5 轮预热、9 个样本，3 个新进程会话轮换执行；消费所有结果、改变调用
  输入，逐项检查结果一致。保存原始样本、每会话中位数、源码和产物哈希。
- 校验 seed/self-hosted JS 字节一致、13 组输入的 native/WASM 结果，以及
  独立 JS 对照。额外测试绑定遮蔽、赋值顺序、分支、NaN、Infinity、负零与拒绝规则。
- 启动指标是 OS 缓存已热时的新进程到首个结果，包含父进程 spawn 开销。
  `loadMs` 是子进程内模块加载/首次 WASM 编译实例化，不等于网页冷启动。
- 原生微小调用在 C 进程内部；WASM 微小调用经过 JS 边界，不能把两者差值
  当成 native FFI 的收益。未测数组传输、序列化、峰值内存、浏览器、Linux/x64
  或真实集合/文本/业务负载。本地采样不是 CI 性能预算。
