# Eliscript 0.1.0 正式语法规范（Emacs Lisp 完全兼容与现代扩展）

状态：已确认（目标版本：`0.1.0`）。本文定义 Eliscript 以 100% 标准 Emacs Lisp 语义为内核的正式语言规范，以及通过标准 S 表达式显式启用的现代生产级扩展、多后端（JavaScript / WebAssembly / Native）ABI 契约与 AI-Native 结构化能力。

设计以**零心智负担、局部显式性与多后端确定性**为最高准则：
1. **100% Emacs Lisp 兼容内核**：任何未使用扩展的合法 Emacs Lisp 程序，在 Eliscript 中无需修改即为合法且语义等价的程序；`.el` 与 `.eli` 共享同一语言语义，文件后缀不切换方言。
2. **100% 标准 Emacs Reader 语法**：所有扩展均采用标准 Emacs Reader 可直接读取的 S 表达式，不引入自定义 reader macro（无 `{...}`、`#{...}`、`#queue` 字面量），不篡改原生 `'()` 与 `[]` 语义。
3. **按定义身份显式启用扩展**：扩展能力通过 `(require 'eliscript)` 或按职责划分的子库显式加载；未加载对应扩展时，同名用户符号仍为普通 Emacs 函数或变量。
4. **局部自解释与 AI-Native 契约**：异步暂停（`await`）、不可变持久集合（`persistent-*`）、原地状态变更（`!` 后缀）、宿主互操作（`js-*`）、跨引擎调用（`engine-*`）以及静态类型/前后端契约（`declare`）均在局部源码位置 100% 显式可见。

---

## 一、 默认语义（100% Emacs Lisp 兼容内核）

未使用扩展的形式与所支持 Emacs 版本保持完全一致，涵盖 reader、求值、宏展开、动态加载、符号身份、函数槽替换、可变容器与条件错误系统。既有标准库及已加载库定义的形式不得被编译器按名字重新解释。

| 语义维度 | 默认行为（与 Emacs Lisp 完全一致） |
| --- | --- |
| **作用域与绑定** | 遵循源码的 `lexical-binding` 设置和 `defvar` / `defconst` 特殊变量（special variable）声明；词法绑定不取消特殊变量的动态绑定。 |
| **双命名空间（Lisp-2）** | 保持函数槽（`symbol-function`）与值槽（`symbol-value`）两个独立命名空间；符号属性表（`symbol-plist`）完整保留 Emacs 行为。 |
| **顶层声明** | `defvar`、`defconst` 的初始化条件、重新求值语义与可变性与 Emacs 一致。 |
| **真假值与空列表** | **只有 `nil` 为假**；`nil`、`()`、`'nil`、`'()`、`(list)` 是同一个值；数字 `0`、空字符串 `""`、空向量 `[]` 及所有扩展对象均为真。 |
| **原生可变集合** | `list`、`cons`、`vector`、`[]`、哈希表（`make-hash-table`）及其原地可变操作（`setcar`、`setcdr`、`aset`、`puthash`）保持原义。 |
| **数字与字符串** | 保持整数、浮点数、整数 `/` 截断整除、`mod` 与 `%` 余数语义、字符索引和文本属性行为。 |
| **函数调用** | 普通 `defun` / `lambda` 的参数数量检查、`&optional`、`&rest`、`funcall`、`apply` 保持原义。 |
| **控制流与条件系统** | `catch`、`throw`、`condition-case`、`unwind-protect`、`signal`、`error` 保持 Emacs 非局部退出与条件分层语义。 |
| **宏与反射** | 普通 `defmacro`、`eval`、`intern`、`fset`、`advice-add` 不进入受限子集，保留完整元编程能力。 |

普通 `defun` 不隐式异步、不静默捕获任务上下文、不自动缓存结果，也不因编译到另一引擎而改变动态函数查找。

**语言语义一致与宿主专属对象边界**：使用 Emacs 专属宿主对象（如 `buffer`、`window`、`frame`、`process`）时需要真实 Emacs 宿主。在 JS / WASM / Native 引擎中运行的代码必须通过显式跨引擎接口（`engine-call`）请求 Emacs 宿主执行，保留对象句柄身份、目标世代、返回值和条件错误；没有 Emacs 宿主时绝不伪造对应能力。

---

## 二、 扩展库体系与启用规则（“1 + 5 + 2” 架构）

改变定义或求值方式的新形式采用 **Emacs 标准形式 + 明确语义后缀**（如 `defun-async`、`lambda-async`、`let-bind`、`defun-case`、`cl-defstruct-persistent`）。构造和处理新数据使用普通函数与协议。静态检查、类型特化与前后置契约统一使用标准 `(declare (eliscript ...))`。

### 2.1 扩展库分层

1. **标准可移植总入口（推荐常规生产代码与 AI 生成代码使用）**：
   ```elisp
   (require 'eliscript)
   ```
   一键加载下列 5 个核心可移植扩展子库（不包含任何特定宿主或底层硬件指令）：
2. **5 个核心可移植子库（可按需单独 `require`）**：
   ```elisp
   (require 'eliscript-data)      ; 持久集合、值协议、结构体+Schema、开放协议、状态单元、惰性序列、Transducer、Result/Option
   (require 'eliscript-bind)      ; 统一 pcase 解构、多参分支、尾递归 recur、流水线宏、let-const、高阶函数组合器
   (require 'eliscript-async)     ; Future、defun-async/await、结构化并发作用域、超时、异步通道 Channel、跨引擎调用
   (require 'eliscript-module)    ; defmodule、双命名空间导入导出、模块私有词法定义、受限确定性宏
   (require 'eliscript-contract)  ; declare 静态契约（纯度、可移植、依赖检查、类型签名、前置/后置断言）
   ```
3. **2 个显式宿主与多后端底层子库（按目标按需加载，不纳入 `'eliscript` 总入口）**：
   ```elisp
   (require 'eliscript-js)        ; 显式 JavaScript 宿主互操作、保真哨兵值、UTF-16 运算与 JS 正则
   (require 'eliscript-abi)       ; 面向 WASM 与 Native 的零分配数值内核 (:numeric-f64) 与受控线性内存 (:memory-u32)
   ```

### 2.2 符号定义身份与冲突保护

编译器与原生 Emacs 扩展库按**定义身份（definition identity）**识别扩展：
- 未加载 `eliscript-async` 时，用户自己定义的 `await` 仍是普通 Emacs 函数；
- 加载扩展时绝不静默覆盖不属于该扩展的同名已有定义；若检测到符号冲突，立即报出带源码位置的明确冲突错误，用户可通过模块导入的 `:only` / `:rename` 选择性导入或显式别名解决。

---

## 三、 完整扩展能力清单

| 所属库 | 扩展能力 | 规范形式或接口 | 对应 Emacs 形式 | 语义与使用边界 |
| --- | --- | --- | --- | --- |
| `eliscript-async` | 异步函数与等待 | `defun-async`、`lambda-async`、`await` | `defun`、`lambda` | 定义处显式返回 Future，等待处显式暂停任务 |
| `eliscript-async` | 结构化并发与超时 | `with-async-scope`、`with-async-timeout`、`future-cancel`、`future-then` | 无直接对应 | 子任务归属与超时取消由词法作用域自动管理 |
| `eliscript-async` | 显式异步动态绑定 | `with-async-bindings`、`bind-async` | `let`、回调函数 | 显式声明跨异步边界携带的特殊变量，普通 `let` 不隐式渗透 |
| `eliscript-async` | 背压异步通道 | `make-async-channel`、`channel-put!`、`channel-take!`、`channel-close!` | 无直接对应 | 支持流式生成（如 AI Token 流）与生产者-消费者协程通信 |
| `eliscript-async` | 跨引擎远程调用 | `engine-call`、`engine-bind`、`engine-revoke!`、`engine-handle-p` | `funcall`、函数对象 | 远程调用返回 Future，闭包句柄带 owner 与 generation 撤销保护 |
| `eliscript-bind` | 多参数数量分支 | `defun-case`、`lambda-case` | `defun`、`lambda` | 按参数数量精确分派，禁止重叠区间与隐式 Lisp-1 调用 |
| `eliscript-bind` | 统一模式解构 | `let-bind`、`let*-bind`、`defun-bind`、`lambda-bind`、`pcase-value`、`cond-predicate` | `let`、`let*`、`pcase`、`cond` | 解构模式与扩展后的 Emacs `pcase` 100% 统一 |
| `eliscript-bind` | 不可重赋值局部绑定 | `let-const`、`let*-const` | `let`、`let*` | 禁止对局部绑定变量执行 `setq`，不隐式冻结对象内部内容 |
| `eliscript-bind` | 栈安全显式尾递归 | `let-loop`、`defun-tail`、`lambda-tail`、`recur`、`trampoline` | `named-let`、`defun` | 仅在显式尾位置编译为循环跳转，正确恢复动态绑定与 `unwind-protect` |
| `eliscript-bind` | 流水线组合宏 | `thread-first`、`thread-last`、`thread-as`、`thread-cond-first`、`thread-cond-last`、`thread-some-first`、`thread-some-last` | `thread-first`、`thread-last` | 复用标准管道，补齐显式占位、条件步进与 `nil` 短路管道 |
| `eliscript-bind` | 高阶函数组合器 | `fn-compose`、`fn-partial`、`fn-juxt`、`fn-complement` | `apply-partially` | 统一 `fn-` 前缀，不抢占全局无前缀 `compose` / `partial` |
| `eliscript-module` | 显式模块组织 | `defmodule`、`export-functions`、`export-values`、`import-functions`、`import-values` | `provide`、`require` | 显式分离函数与值两个命名空间的导入导出，支持 `:as` / `:only` / `:rename` |
| `eliscript-module` | 模块私有词法定义 | `defun-lexical`、`defvar-lexical`、`defconst-lexical` | `defun`、`defvar`、`defconst` | 绑定于模块词法闭包空间，不受全局 `fset` / `set` 篡改 |
| `eliscript-module` | 受限可重现宏 | `defmacro-checked`、`macro-gensym`、`macro-read-file` | `defmacro`、`gensym` | 确定性宏展开，外部文件读取须经 `:inputs` 声明并纳入构建哈希 |
| `eliscript-contract` | 静态检查与 AI 契约 | `(declare (eliscript :pure :portable :checked :params :returns :requires :ensures ...))` | `declare` | 在 Emacs 加载/编译期与多后端编译器中统一强制检验，绝不静默忽略 |
| `eliscript-data` | 持久不可变集合 | `persistent-list`、`persistent-vector`、`persistent-map`、`persistent-set`、`persistent-queue`、`persistent-sorted-map`、`persistent-sorted-set` 及 `*-p` 谓词 | `list`、`vector`、`make-hash-table` | 结构共享不可变集合，自动实现 Emacs `seq.el` 与 `map.el` 泛型协议 |
| `eliscript-data` | 泛集合值操作 | `value-get`、`value-nth`、`value-put` (`value-assoc`)、`value-remove` (`value-dissoc`)、`value-conj`、`value-count`、`value-empty-p`、`value-into` | `aref`、`gethash`、`seq-*` | 纯函数更新返回新持久值；不篡改 `car`/`cdr`/`length`/`assoc` 原义 |
| `eliscript-data` | 值相等、哈希与元数据 | `value-equal-p`、`value-hash`、`value-compare`、`value-meta`、`value-with-meta` | `equal`、`sxhash-equal` | 深度结构值相等与确定性哈希；不改变原生 `eq`、`equal` |
| `eliscript-data` | 持久结构体与 Schema | `cl-defstruct-persistent`、`struct-validate`、`struct-json-schema`、`struct-to-json`、`struct-from-json` | `cl-defstruct` | 生成 `make-X`、`X-p`、`X-field`、`X-with`，支持字段类型校验与 JSON Schema 导出 |
| `eliscript-data` | 开放协议与值多方法 | `defprotocol`、`extend-protocol`、`defclass-protocol`、`reify-protocol`、`cl-defgeneric-value`、`cl-defmethod-value` | `cl-defgeneric`、`defclass` | 协议表达操作族，value generic 表达任意值/层级/偏好分派 |
| `eliscript-data` | 可观察状态单元 | `state-cell`、`cell-value`、`cell-update!`、`cell-reset!`、`cell-watch` | 无直接对应 | 替代旧名 `atom`（保留 Emacs `atom` 谓词），同步校验与观察通知 |
| `eliscript-data` | 延迟求值与惰性序列 | `delay`、`force`、`memoize`、`realized-p`、`lazy-seq`、`lazy-map`、`lazy-filter`、`lazy-take`、`lazy-range` | 序列操作 | 显式惰性求值，不把普通 `mapcar` 改成惰性 |
| `eliscript-data` | Transducer 与瞬态构建 | `map-transducer`、`filter-transducer`、`take-transducer`、`seq-transduce`、`with-transient`、`conj!`、`assoc!`、`dissoc!` | 原位集合操作 | 零中间集合分配的组合归约与作用域受控的瞬态批量构建器 |
| `eliscript-data` | Result、Option 与数据符号 | `result-ok`、`result-error`、`result-ok-p`、`result-error-p`、`result-bind`、`option-some`、`option-none`、`option-some-p`、`option-value`、`data-symbol` | 条件与符号 | 遵循唯一 `nil` 假值规则：失败 Result 与 `option-none` 均为非 `nil` 对象 |
| `eliscript-js` | 显式 JS 宿主互操作 | `js-import`、`js-array`、`js-object`、`js-get`、`js-put`、`js-call`、`js-new`、`js-expr`、`js-divide`、`js-remainder`、`js-length`、`js-substring`、`js-regexp*` | 无直接对应 | `js-` 前缀明确标识宿主语义，保真路径使用 `js-call-raw`/`js-get-raw` 与 `js-false`/`js-null`/`js-undefined` |
| `eliscript-abi` | WASM/Native 零分配内核 | `(declare (eliscript :abi :numeric-f64 :export "..."))`、`(declare (eliscript :abi :memory-u32))`、`mem-load-*`、`mem-store-*`、`word-*` | 无直接对应 | 编译期验证无装箱数值与线性内存子集，直接发射 WASM 或 ARM64 机器码 |

---

## 四、 函数、多参分支与静态契约（`declare`）

### 4.1 异步函数（`defun-async` / `lambda-async` / `await`）

`defun-async` 保留普通 `defun` 的参数表、文档字符串与函数命名空间，唯一控制流差异是返回 Future 并允许在函数体内使用 `await`。匿名异步函数使用 `lambda-async`。

```elisp
(require 'eliscript-async)

(defun-async fetch-title (url)
  "Return a Future for the page title."
  (let ((page (await (fetch-page url))))
    (page-title page)))

(lambda-async (url)
  (await (fetch-title url)))
```

- `await` 必须处于异步函数的直接执行体内；嵌套的普通 `lambda` 建立同步边界，不继承外层的等待权限。
- `await` 暂停当前异步任务，不阻塞 Emacs 主事件循环，也不自动等待非 Future 普通值；对非 Future 值调用 `await` 立即抛出 `wrong-type-argument`（`future-p`）。
- 异步函数若返回一个 Future，自动解包采纳其终态结果，不产生嵌套 Future。
- 在异步执行体中，普通 `condition-case`、`catch` 和 `unwind-protect` 保持完整 Emacs 语义。原生 JS Promise 拒绝值通过 `js-error` 条件携带原始错误与调用栈；任务取消抛出继承自 `quit` 的 `eliscript-cancelled` 条件（超时则抛出其子条件 `eliscript-timeout`），避免被普通 `(condition-case err ... (error ...))` 无意吞掉，同时确保 `unwind-protect` 清理子句完整执行。

### 4.2 多参数数量分支（`defun-case` / `lambda-case`）

`defun-case` 与 `lambda-case` 提供按调用参数数量（arity）精确分派的函数定义：
- 每个分支只允许必需参数及最多一个位于末位的 `&rest`（禁止混用 `&optional` 造成数量区间歧义）；
- 同一固定参数数量重复出现、或固定分支数量落入 `&rest` 分支最低数量及以上区间时，在编译/定义期直接报错；
- `&rest` 参数列表仍为标准 Emacs List（空列表为 `nil`）；
- 存进变量的函数仍遵循 Lisp-2 规则通过 `funcall` / `apply` 调用。

```elisp
(require 'eliscript-bind)

(defun-case greet
  "Greet with one or two arguments."
  ((name)
   (format "Hello %s" name))
  ((name age)
   (format "Hello %s, age %s" name age)))
```

### 4.3 统一声明与 AI 契约系统（`(declare (eliscript ...))`）

组合能力与静态契约统一通过函数、模块或宏顶部的 `(declare (eliscript ...))` 表达，避免拼凑 `defun-case-async-bind-portable` 等爆炸式宏名：

```elisp
(defun-case fetch-user
  (declare (eliscript :async t
                      :checked t
                      :params ((id stringp) &optional (cache hash-table-p))
                      :returns user-p))
  ((id)
   (await (fetch-user-by-id id)))
  ((id cache)
   (or (gethash id cache)
       (await (fetch-user-by-id id)))))
```

| 声明键 | 语法示例 | 适用位置 | 规范语义 |
| --- | --- | --- | --- |
| `:pure` | `:pure t` | 普通/扩展函数、`defmacro-checked` | 禁止可观察副作用、I/O、随机数及未声明可变全局读取；不授权改变返回对象的 `eq` 分配身份或跳过动态函数查找。 |
| `:portable` | `:portable t` | 普通/扩展函数、`defmacro-checked` | 验证完整依赖闭包可跨引擎/Worker 独立执行，禁止隐式依赖 Emacs 专属宿主状态（如当前 buffer）。 |
| `:checked` | `:checked t` | 函数、`defmodule` | 强制静态闭合解析：所有被引用的函数与变量必须已在模块内定义、显式导入或经 `declare-function`/`defvar` 声明。 |
| `:async` | `:async t` | 扩展函数（`defun-case`/`defun-bind` 等） | 使扩展函数返回 Future 并允许 `await`；**严禁在普通 `defun` 中静默生效**（普通 `defun` 写 `:async t` 直接报错，须用 `defun-async`）。 |
| `:destructure` | `:destructure t` | 扩展函数（`defun-case`/`defun-async` 等） | 允许参数表使用统一解构模式；普通 `defun` 写 `:destructure t` 直接报错，须用 `defun-bind`。 |
| `:params` | `:params ((x :f64) (s stringp))` | 普通/扩展函数 | 声明参数类型或谓词契约。原生类型关键字（`:f64`、`:i32`、`:u32`、`:bool`、`:string`）指导编译器去装箱特化；谓词符号用于边界契约检验。 |
| `:returns` | `:returns :f64` 或 `:returns person-p` | 普通/扩展函数 | 声明返回值类型关键字或谓词契约。 |
| `:requires` | `:requires ((> x 0) (not (null s)))` | 普通/扩展函数 | 前置条件断言列表；在契约检查模式及测试运行器中入口自动核验。 |
| `:ensures` | `:ensures ((>= result 0))` | 普通/扩展函数 | 后置条件断言列表；作用域内绑定 `result` 代表返回值，供 AI 与测试工具自动核验输出不变量。 |
| `:abi` | `:abi :numeric-f64` 或 `:abi :memory-u32` | 普通/扩展函数 | 指示编译器按零分配 WASM / Native ABI 子集严格验证并直接发射机器码/字节码。 |
| `:export` | `:export "c_symbol_name"` | 含 `:abi` 的函数 | 指定在 WASM 模块导出表或 Native Mach-O / C ABI 动态库中的外部导出符号名。 |
| `:inputs` | `:inputs ("schema.json")` | `defmacro-checked` | 声明受限宏允许在编译期读取的相对文件路径，文件内容 SHA-256 自动纳入增量构建缓存身份。 |

**原生 Emacs 执行新增检查约束的正式规则**：
- 声明是强制合同，**绝不能在原生 Emacs 解释或字节编译时无声忽略**。
- `eliscript-contract.el` 在加载时向 Emacs 的 `defun-declarations-alist` 注册 `eliscript` 声明处理器，并在扩展宏（`defun-*`、`defmodule`、`defmacro-checked`）展开期直接调用共享静态分析器。
- 任何违反 `:pure`、`:portable`、`:checked`、`:abi`、`:inputs` 或矛盾声明的代码，在原生 Emacs `load` / `eval-buffer` / `byte-compile-file` 时立即抛出带精确行列号的 `eliscript-compile-error`；当被依赖函数遭后续重定义或 `advice-add` 修改时，已缓存的静态检查结论自动失效并触发重验。

---

## 五、 统一模式匹配与数据解构（`pcase` 超集与 `*-bind`）

解构语法与 Emacs 内置 `pcase` 完全统一，消除两套模式语言的分裂。加载 `eliscript-bind` 或 `eliscript-data` 后，以下模式同时在原生 `pcase` / `pcase-let` / `pcase-let*` 以及 `let-bind` / `let*-bind` / `defun-bind` / `lambda-bind` / `pcase-value` 中生效：

| 模式语法 | 匹配目标与行为 |
| --- | --- |
| `symbol` | 绑定任意值到词法变量 `symbol`（`_` 忽略值） |
| `[p1 p2 ...]` | 匹配固定长度的原生 Vector 或 `persistent-vector` |
| `[p1 p2 &rest tail]` | 匹配长度 `>= 2` 的原生 Vector 或 `persistent-vector`；`tail` 保留与输入相同的集合类别（原生 Vector 切片或持久子向量） |
| `(:list p1 p2 ...)` / `(:list p1 &rest tail)` | 匹配固定或可变长度的原生正规 List 或 `persistent-list`；`tail` 保留输入集合类别 |
| `(:map (:k1 p1) (:k2 (default p2 expr)))` | 匹配具有对应键的原生 `hash-table`、`persistent-map` 或 `cl-defstruct-persistent` 记录。区分“键缺失”与“键存在且值为 `nil`”：未声明 `default` 时缺失键立即报结构匹配错误 |
| `(:record struct-name (:field1 p1) ...)` | 精确匹配指定 `cl-defstruct-persistent` 记录类型并解构其字段 |
| `(:ok p)` / `(:error p)` | 匹配 `result-ok` 与 `result-error` 值 |
| `(:some p)` / `:none` | 匹配 `option-some` 与 `option-none` 值 |

```elisp
(require 'eliscript)

(let-bind (([name age] (persistent-vector "Ada" 36))
           ((:map (:title title) (:role (default role "engineer")))
            (persistent-map :title "Notes")))
  (format "%s (%d): %s [%s]" name age title role))

(defun-bind person-label ([name age] &optional ((:map (:prefix prefix)) (persistent-map :prefix "User")))
  (format "%s: %s, age %d" prefix name age))
```

- 可选参数中的解构模式必须采用 `(模式 默认值表达式)` 显式提供默认形状；缺省 `nil` 不会被隐式当成空 Vector 或空 Map。
- `pcase-value` 与标准 `pcase` 分支结构相同，但对字面量常量与持久数据采用 `value-equal-p` 结构相等而非 `equal`。
- `cond-predicate` 先按顺序求值二元谓词与被分派值各一次，再依次尝试分支，支持 `:>>` 将非 `nil` 谓词结果传给接收函数。

---

## 六、 模块系统与词法私有绑定（`eliscript-module`）

### 6.1 模块定义与双命名空间导入导出

`defmodule` 组织接口与依赖，同时尊重 Emacs Lisp 的全局符号传统：
- 模块体内的普通 `defun`、`defvar`、`defconst` 和符号引用保持原有 Emacs 全局符号身份，模块系统绝不暗中改写 `quote` 或 `intern`。
- 需要真正隔离于模块内部、不受外部全局同名符号干扰的私有定义时，显式使用 `defun-lexical`、`defvar-lexical`、`defconst-lexical`。

```elisp
(require 'eliscript-module)

(defmodule sample.math
  (declare (eliscript :checked t))

  (defconst-lexical scale 2)
  (defvar-lexical call-count 0)

  (defun-lexical multiply (value)
    (* value scale))

  (defun sample-double (value)
    (setq call-count (1+ call-count))
    (multiply value))

  (export-functions sample-double))

(import-functions sample.math :only (sample-double))
(sample-double 21) ; => 42
```

### 6.2 模块私有绑定与热重载正式规则

1. **私有词法空间隔离**：
   - `defun-lexical` 位于模块私有函数空间，`defvar-lexical` / `defconst-lexical` 位于模块私有值空间；
   - 对全局同名 symbol 执行 `(fset 'multiply ...)` 或 `(set 'scale ...)` **不会**影响模块内部的 `multiply` 和 `scale`；
   - `defconst-lexical` 与 `let-const` / `let*-const` 强制禁止 `setq` 重新赋值（编译期直接报错），不继承普通 `defconst` 的可覆写语义。
2. **双命名空间导出与实时绑定读取**：
   - `export-functions` 与 `import-functions` 操作函数命名空间；`export-values` 与 `import-values` 操作变量值命名空间；支持 `:only (...)`、`:rename ((old new) ...)` 与 `:as prefix-`；
   - 导入的函数保留动态重定义感知能力，不因 `import-functions` 而非授权静态内联；
   - `export-values` 导出的可变绑定在 JS/WASM 中编译为 ESM live binding / getter，在 Emacs 中编译为符号或闭包访问器转发，读取时始终获取最新值，绝不复制初次导入时的静态快照。
3. **模块重载（Reload）规则**：
   - 当模块被重新加载（`load` / 热重载）时：普通 `defvar` 遵循 Emacs 规则保留已有非 void 值；普通 `defun` 与导出表原地更新；模块私有的 `defvar-lexical` 则随新的模块词法闭包实例重新初始化。

---

## 七、 持久数据结构、Emacs 泛型互通与 AI Schema（`eliscript-data`）

### 7.1 持久集合与原生集合的边界

| 类别 | 构造函数 | 谓词 | 空值行为 |
| --- | --- | --- | --- |
| 持久列表 | `(persistent-list a b ...)` | `persistent-list-p` | 空持久列表 `(persistent-list)` 是独立集合对象，**不是 `nil`**，在 `if` 中为真，用 `value-empty-p` 或 `seq-empty-p` 判空 |
| 持久向量 | `(persistent-vector a b ...)` | `persistent-vector-p` | 32 叉位分区前缀树（带尾缓冲），不抢占原生 `[]` 字面量 |
| 持久哈希表 | `(persistent-map :k1 v1 :k2 v2 ...)` | `persistent-map-p` | 32 叉 HAMT，按 `value-equal-p` 与 `value-hash` 寻址 |
| 持久集合 | `(persistent-set a b ...)` | `persistent-set-p` | 基于持久 HAMT 的集合 |
| 持久队列 | `(persistent-queue a b ...)` | `persistent-queue-p` | 双向量均摊 $O(1)$ FIFO 队列 |
| 持久有序映射/集合 | `(persistent-sorted-map cmp ...)` / `(persistent-sorted-set cmp ...)` | `persistent-sorted-map-p` / `persistent-sorted-set-p` | 结构共享平衡树，比较器显式传入（默认 `value-compare`） |

### 7.2 双向打通 Emacs 标准 `seq.el` / `map.el` 与 `value-*` 操作

1. **无缝兼容 Emacs 标准泛型**：
   所有持久集合默认通过 `cl-defmethod` 实现 Emacs 内置 `seq.el`（`seq-p`、`seq-elt`、`seq-length`、`seq-empty-p`、`seq-do`、`seq-map`、`seq-filter`、`seq-reduce`、`seq-subseq`、`seq-into`）与 `map.el`（`map-p`、`map-elt`、`map-contains-key`、`map-keys`、`map-values`、`map-apply`）。任何接收 `seq` 或 `map` 的现成 Emacs 函数均可直接处理持久集合。
2. **专用纯函数值接口（`value-*`）**：
   ```elisp
   (require 'eliscript-data)

   (let*-const ((before (persistent-map :count 0 :items (persistent-vector "a" "b")))
                (after  (value-put before :count 1)))
     (list (value-get before :count)
           (value-get after :count))) ; => (0 1)
   ```
   - 读取与统计：`value-get`、`value-nth`、`value-count`、`value-empty-p`
   - 纯函数更新：`value-put`（提供兼容别名 `value-assoc`）、`value-remove`（兼容别名 `value-dissoc`）、`value-conj`、`value-into`
   - 比较与哈希：`value-equal-p`（深度值相等，引用相同 `eq` 时 $O(1)$ 短路）、`value-hash`、`value-compare`
   - 不可变元数据：`value-meta`、`value-with-meta`（空持久集合可独立携带元数据，不破坏 `nil` 身份）

### 7.3 持久领域结构体与 AI-Native JSON Schema（`cl-defstruct-persistent`）

`cl-defstruct-persistent` 复用 `cl-defstruct` 的构造器、访问器与谓词命名习惯，同时原生支持**字段类型契约与 JSON Schema 双向转换**：

```elisp
(require 'eliscript-data)

(cl-defstruct-persistent person
  "Immutable domain record for a person."
  (name :type string  :doc "Full legal name")
  (age  :type integer :min 0 :default 0 :doc "Non-negative age in years")
  tags) ; 无属性简写字段默认接受任意值

(let* ((before (make-person :name "Ada" :age 36 :tags (persistent-vector "math")))
       (after  (person-with before :age 37)))
  (list (person-p after)
        (person-age before)
        (person-age after))) ; => (t 36 37)
```

- 自动生成构造器 `make-<name>`、类型谓词 `<name>-p`、字段访问器 `<name>-<field>` 与纯函数拷贝更新器 `<name>-with`。
- 字段禁止使用 `setf` 原地修改（编译期与运行期均报错）；构造与 `<name>-with` 更新时自动校验 `:type`、`:min`、`:max` 等声明约束。
- **AI 与协议序列化内建支持**：
  - `(struct-validate 'person value)`：校验实例或 Map 是否满足结构体 Schema；
  - `(struct-json-schema 'person)`：导出标准 JSON Schema（可直接用作 LLM Tool Use / Structured Outputs 参数定义）；
  - `(struct-to-json 'person instance)` / `(struct-from-json 'person json-str)`：类型安全的 JSON 往返编解码。

### 7.4 开放协议与值分派多方法

- **开放协议（`defprotocol` / `extend-protocol` / `defclass-protocol` / `reify-protocol`）**：按操作族定义高性能多态接口（JS/WASM/Native 编译为单态属性/方法槽快路径，Emacs 编译为符号/类型表快路径）。
- **值分派多方法（`cl-defgeneric-value` / `cl-defmethod-value`）**：当需要按任意计算值、层级（hierarchy）或偏好（prefer）分派时使用；一般类型或 `eql` 分派优先使用 Emacs 原生 `cl-defgeneric` / `cl-defmethod`。

---

## 八、 状态单元、惰性序列、Transducer 与栈安全尾递归

### 8.1 可观察状态单元（`state-cell`）

使用 `state-cell` 替代旧名 `atom`，确保 `(atom x)` 始终是 100% 纯正的 Emacs 原生谓词：

```elisp
(let ((state (state-cell (persistent-map :count 0) :validator #'persistent-map-p)))
  (cell-update! state
                (lambda (old)
                  (value-put old :count (1+ (value-get old :count)))))
  (cell-value state))
```

- `cell-update!` 与 `cell-reset!` 同步执行转换函数并校验 `:validator`；校验失败保持原状态不变，提交成功后触发 `cell-watch` 注册的观察者。

### 8.2 延迟求值、惰性序列与瞬态批量构建器（`with-transient`）

- `delay` / `force` / `realized-p` / `memoize`：显式延迟计算与函数缓存，绝不仅凭 `:pure t` 暗中注入缓存。
- `lazy-seq` / `lazy-map` / `lazy-filter` / `lazy-take` / `lazy-range`：名字显式标识惰性，普通 `mapcar` 保持严格求值。
- `map-transducer` / `filter-transducer` / `take-transducer` / `seq-transduce`：无中间集合分配的组合转换管道。
- `with-transient`：作用域受控的 owner-token 瞬态构建器，循环内通过 `conj!` / `assoc!` / `dissoc!` 原地批量填充，离开作用域时自动封存并返回持久集合；编译器静态拒绝逃逸、跨 `await` 或重复封存 builder。

```elisp
(with-transient (out (persistent-vector))
  (dolist (value '(1 2 3))
    (conj! out (* value value)))) ; => 返回持久 Vector [1 4 9]
```

### 8.3 栈安全显式尾递归与流水线宏

- `recur` 仅允许出现在 `let-loop`、`defun-tail`、`lambda-tail` 的尾位置。`recur` 参数从旧绑定环境从左到右求值后同时进入下一轮，并正确恢复周期内的动态特殊变量与 `unwind-protect` 栈帧。
- 流水线组合：除复用 Emacs 标准 `thread-first`、`thread-last` 外，提供显式占位绑定的 `thread-as`、按条件步进的 `thread-cond-first` / `thread-cond-last`，以及遇到 `nil` 立即短路返回 `nil` 的 **`thread-some-first` / `thread-some-last`**。

---

## 九、 受限确定性宏（`defmacro-checked`）

普通 `defmacro` 保留完整 Emacs 元编程能力。需要跨编译阶段 100% 可重现、可缓存的宏，显式使用 `defmacro-checked`：

```elisp
(defmacro-checked twice (form)
  (declare (eliscript :pure t :portable t))
  (let ((temporary (macro-gensym "value")))
    `(let ((,temporary ,form))
       (+ ,temporary ,temporary))))

(defmacro-checked project-label ()
  (declare (eliscript :inputs ("label.txt")))
  (macro-read-file "label.txt"))
```

- `macro-gensym` 生成由源码位置与展开上下文唯一决定的确定性无冲突符号，不改变普通 `gensym` 的全局计数器行为。
- `macro-read-file` 只能读取在 `(declare (eliscript :inputs (...)))` 中显式声明的构建输入文件，文件内容哈希自动纳入编译产物身份；未声明的宿主 I/O、时钟、随机数与全局状态修改在受限宏中一律静态拒绝。

---

## 十、 结构化并发、异步通道与跨引擎调用（`eliscript-async`）

### 10.1 结构化并发作用域与超时（`with-async-scope` / `with-async-timeout`）

- `(with-async-scope (scope) body...)` 只能出现在异步执行体中：正常退出前等待其名下所有子任务完成，再返回最后一个表达式的值；若主逻辑或任一子任务抛出异常或被取消，自动向所有未完成子任务发送取消请求并等待清理结束。
- `(with-async-timeout seconds body...)` 建立带超时保护的子作用域：超时到期自动取消作用域内任务并抛出继承自 `eliscript-cancelled` 的 `eliscript-timeout` 条件。

### 10.2 背压异步通道（`async-channel`）

为流式数据（如 AI Agent 增量输出、事件流）提供确定性的协程通信原语：
- `(make-async-channel &optional capacity)`：创建缓冲区容量为 `capacity`（默认 `0` 即无缓冲同步交接）的通道；
- `(await (channel-put! ch value))`：向通道写入值，满时暂停等待；对已关闭通道写入报 `eliscript-channel-closed` 错误；
- `(await (channel-take! ch))`：从通道读取值，返回 `option-some` 包装的值；当通道已关闭且缓冲耗尽时返回 `option-none`；
- `(channel-close! ch)`：幂等关闭通道，唤醒所有挂起的读取者返回 `option-none`。

### 10.3 显式异步动态绑定（`with-async-bindings` / `bind-async`）

- `(with-async-bindings ((var val) ...) body...)` 显式声明在扩展 Future 链中跨暂停点自动保存和恢复的特殊变量（`defvar`）；
- 将回调函数传给原生 Emacs 定时器、process filter 或第三方 callback API 时，使用 `(bind-async (lambda (...) ...))` 显式捕获当前受管异步绑定帧。

### 10.4 跨引擎句柄与撤销协议（`engine-call` / `engine-bind` / `engine-revoke!`）

```elisp
(defun-async remote-score (engine values)
  (await (engine-call engine 'sample-score values)))
```

- **句柄结构与世代保护**：跨引擎句柄为不可伪造对象 `(engine-handle :owner <engine-id> :generation <u32> :slot <u32>)`，通过 `engine-handle-p` 识别。
- **生命周期与撤销**：`(engine-bind fn &optional scope)` 将不可按值序列化的本地函数注册为可远程调用的句柄。若在 `with-async-scope` 内注册且未另行指定外部生命周期，作用域退出时自动撤销该句柄；也可随时调用 `(engine-revoke! handle)` 立即撤销并递增槽位 generation。
- **安全失败语义**：对已撤销、跨 owner 或 generation 不匹配的句柄执行 `engine-call`，立即返回以 `eliscript-engine-handle-error` 拒绝的 Future，绝不串用回收槽位；远端未捕获的 `throw` 不会跨引擎伪装成本地同名 `catch`，而是统一通过结构化条件结束远程 Future。

---

## 十一、 显式宿主互操作与多后端零分配内核（`eliscript-js` & `eliscript-abi`）

### 11.1 JavaScript 互操作与保真值转换规范（`eliscript-js`）

```elisp
(require 'eliscript-js)

(js-import "node:path" :as path)
(js-call path "join" "notes" "index.md")
(js-array 1 2 3)
(js-object :name "Ada" :active t)
(js-divide 5 2) ; => 2.5（普通 (/ 5 2) 保持 Emacs 整数整除 => 2）
```

**Lisp 与 JavaScript 值双向转换的正式边界合同**：

| 转换方向与接口 | 输入值 | 转换结果 |
| --- | --- | --- |
| **Lisp → JS 入参**（`js-call` / `js-put` / `js-new` 等） | `nil` | JS `null` |
| | `t` | JS `true` |
| | `js-false` / `js-null` / `js-undefined` | 拆箱为原生 JS `false` / `null` / `undefined` |
| | Lisp 整数（安全整数范围内） / 浮点数 | JS `Number` |
| | Lisp 整数（超出 $\pm(2^{53}-1)$） | JS `BigInt` |
| | Lisp 字符串 | JS `string` |
| | 宿主对象句柄 / 持久集合 | 原生宿主对象引用（不隐式深拷贝） |
| **JS → Lisp 返回值（默认路径 `js-call` / `js-get`）** | JS `true` | `t` |
| | JS `false` / `null` / `undefined` | `nil` |
| | JS 安全整数 `Number` 或 `BigInt` | Lisp 整数 |
| | JS 非整数或非安全整数 `Number` | Lisp 浮点数 |
| | JS `string` | Lisp 字符串 |
| | 其他 JS 对象 / Promise | 宿主对象句柄 / Future |
| **JS → Lisp 返回值（保真路径 `js-call-raw` / `js-get-raw`）** | JS `false` | `js-false`（非 `nil` 哨兵对象，`(js-false-p x)` 为 `t`） |
| | JS `null` | `js-null`（非 `nil` 哨兵对象，`(js-null-p x)` 为 `t`） |
| | JS `undefined` | `js-undefined`（非 `nil` 哨兵对象，`(js-undefined-p x)` 为 `t`） |

- **铁律**：`js-false`、`js-null`、`js-undefined` 在 Lisp 条件判断（`if` / `cond` / `and` / `or`）中**全部为真**（因为它们不是 `nil`），必须使用 `js-false-p`、`js-null-p`、`js-undefined-p`、`js-nullish-p` 显式判别。
- `js-regexp`、`js-regexp-find`、`js-regexp-matches`、`js-regexp-seq`、`js-regexp-replace` 显式采用 JS 正则方言，返回包含 `match`、`start`、`end`、`groups` 字段的不可变记录，绝不污染 Emacs 全局 `match-data`。

### 11.2 WASM 与 Native 零分配内核（`eliscript-abi`）

为需要极致吞吐量的数值算法、密码学哈希、编码器与运行时内存管理提供跨 Emacs / JS / WASM / Native 四端一致的底层内核表达：

```elisp
(require 'eliscript-abi)

(defun kernel-saxpy (n a x y)
  (declare (eliscript :abi :numeric-f64
                      :export "kernel_saxpy"
                      :params ((n :f64) (a :f64) (x :f64) (y :f64))
                      :returns :f64))
  (let ((i 0.0)
        (acc 0.0))
    (while (< i n)
      (setq acc (+ acc (+ (* a x) y)))
      (setq i (+ i 1.0)))
    acc))
```

- **`:abi :numeric-f64`**：编译期静态验证无装箱 `f64` 数值子集，在 WASM 与 ARM64 Native 后端直接生成纯寄存器/指令级机器码，在 JS 后端生成无装箱标量循环，在 Emacs 中按标准浮点函数执行。
- **`:abi :memory-u32`**：提供受控 32 位线性内存与无符号字指令（`mem-load-u8`、`mem-load-u16`、`mem-load-u32`、`mem-load-f64`、`mem-store-u8`、`mem-store-u16`、`mem-store-u32`、`mem-store-f64`、`mem-size`、`mem-grow`、`word-add`、`word-sub`、`word-mul`、`word-div`、`word-and`、`word-or`、`word-xor`、`word-shl`、`word-shr`），每次内存访问均强制执行无溢出边界检查。

---

## 十二、 从 0.0.4 旧语法到 0.1.0 正式语法的演进对照表

| 0.0.4 旧设计 | 0.1.0 正式规范 |
| --- | --- |
| `defun` / `defvar` 共享单一 Lisp-1 命名空间 | 回归 Emacs Lisp-2 双命名空间；模块私有函数/变量用 `defun-lexical` / `defvar-lexical` |
| 顶层必须包裹 `(module ...)` | 普通文件直接写标准 Emacs Lisp；需要显式模块封装时使用 `(defmodule ...)` |
| `defconst` 强制编译期不可赋值 | 普通 `defconst` 保持 Emacs 原义；严格不可重赋值绑定使用 `defconst-lexical` 或 `let-const` / `let*-const` |
| 所有 `list` / `vector` / `[]` / `'()` 字面量均为持久集合 | 原生形式 100% 保持 Emacs 可变语义；持久集合使用 `persistent-list`、`persistent-vector`、`persistent-map`、`persistent-set`、`persistent-queue` |
| 自定义 `{...}`、`#{...}`、`#queue [...]` reader 语法 | 全部移除，100% 采用标准 Emacs Reader S 表达式构造 |
| `'nil` / `'()` 产生空持久 List | `quote` 保持 Emacs 原义；空持久 List 为独立非 `nil` 对象 `(persistent-list)` |
| `false` / `undefined` 自动作为普通 Lisp 假值 | 唯一假值只有 `nil`；JS 保真值通过 `js-call-raw` 与 `js-false` / `js-null` / `js-undefined` 哨兵显式处理 |
| 所有 `defmacro` 均在受限解释器中运行 | 普通 `defmacro` 完整兼容 Emacs；可重现受限宏显式使用 `defmacro-checked` |
| `throw` / `catch` 表示 JS 异常 | 普通 `catch` / `throw` / `condition-case` 保持 Emacs 语义；JS 异常映射为 `js-error` 条件 |
| 普通 `+`、`/`、`mod`、`length` 采用 JS 行为 | 保持 Emacs 算术与字符语义；JS 运算显式使用 `js-divide`、`js-remainder`、`js-length`、`js-substring` |
| 所有名称必须闭合静态解析 | 普通代码保留 Emacs 晚定义动态查找；显式 `(declare (eliscript :checked t))` 或 `:portable t` 启用静态闭合检查 |
| `defn`、`fn`、`do`、`if-some`、`->`、`->>` 等别名并存 | 统一使用 `defun`、`lambda`、`progn`、`if-let`、`thread-first`、`thread-last`、`thread-some-first`、`thread-some-last` |
| `atom` 表示可变状态容器 | `atom` 恢复 Emacs 原生谓词；状态容器定名为 `state-cell` |
| `defasync` / `async-lambda` / `defportable` / `defrecord` / `defmulti` | 统一规范为 `defun-async` / `lambda-async` / `(declare (eliscript :portable t))` / `cl-defstruct-persistent` / `cl-defgeneric-value` |

---

## 十三、 关联技术规格参考

本规范建立在仓库现有编译器、运行时与持久数据结构的工程积累之上，并将公开语法统一收敛到 100% Emacs 兼容内核与显式扩展体系：

- [语言参考](language-reference.md)
- [标准库](../stdlib/README.md)
- [独立后端与 WASM/Native ABI](../bootstrap/backends/README.md)
- [函数参数](../specs/0036-function-parameters.md)
- [异步函数](../specs/0037-async-functions.md)
- [可移植函数](../specs/0021-portable-functions.md)
- [不可变记录](../specs/0168-immutable-record-types.md)
- [受限宏](../specs/0005-compile-time-macros.md)
- [状态引用](../specs/0072-atomic-state-references.md)
- [临时构建器](../specs/0062-owner-token-transient-collections.md)
