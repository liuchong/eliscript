# Eliscript 新语法草案

状态：待确认。本文提出以完整 Emacs Lisp 语义为基础的语言方向，以及可显式使用的扩展。本文不替换现行规格、公共接口或兼容合同；所有新增形式和改名均为设计提案，尚未实现。

设计以使用体验为主要判断标准。普通代码按 Emacs Lisp 理解；额外的控制流、数据类型和检查约束在使用位置明确出现。`.el` 与 `.eli` 不选择不同方言，后缀不改变语义。

## 默认语义

未使用扩展的形式与所支持 Emacs 版本保持一致，包括 reader、求值、宏、动态加载、符号身份、函数替换、对象修改和错误行为。既有标准库及已加载库定义的形式同样不得被编译器按名字重新解释。

| 范围 | 默认行为 |
| --- | --- |
| 作用域 | 遵循源码的 `lexical-binding` 设置和特殊变量声明；词法绑定不取消特殊变量的动态绑定 |
| 名称 | 保持函数、变量两个命名空间；符号及其值槽、函数槽、属性表保留 Emacs 行为 |
| 声明 | `defvar`、`defconst` 的初始化、重新求值、可变性与 Emacs 一致 |
| 假与空列表 | 只有 `nil` 为假；`nil`、`()`、`'nil`、`'()`、`(list)` 是同一个值 |
| 原生集合 | `list`、`cons`、`vector`、`[]`、哈希表及其可变性保持原义 |
| 数字与字符串 | 保持整数、浮点数、除法、取模、字符索引和文本属性语义 |
| 调用 | 普通 `defun` 的参数数量检查、`&optional`、`&rest`、`funcall`、`apply` 保持原义 |
| 控制流 | `catch`、`throw`、`condition-case`、`unwind-protect` 保持原义 |
| 宏和反射 | 普通 `defmacro`、`eval`、`intern`、`fset`、advice 不进入受限语言子集 |

普通 `defun` 不隐式异步、不静默捕获任务上下文、不自动缓存结果，也不因编译到另一引擎而改变动态函数查找。

完整语言一致与宿主能力可用是不同问题。使用 buffer 等对象时需要真实 Emacs 宿主。另一引擎必须通过明确接口请求宿主执行，保留对象身份、目标版本、返回值和错误；没有宿主时不能伪造对应能力。

## 命名和启用

改变定义或求值方式的新形式优先采用 Emacs 形式加含义明确的后缀，如 `defun-async`、`lambda-async`、`let-bind`。构造和处理新数据使用普通函数。检查约束使用 `declare`，不靠它隐藏返回 Promise 等显著行为变化。

扩展必须由扩展库显式提供。编译器识别扩展的定义身份，不将同名的用户函数自动当成扩展关键字。例如，未加载异步扩展时，用户自己定义的 `await` 仍是普通 Emacs 函数。加载扩展时不得覆盖不属于该扩展的同名已有定义；冲突应明确报出，可通过选择性导入及显式别名解决。

新形式使用 Emacs reader 可读取的 S 表达式。第一套草案不增加 `{...}`、`#{...}`、`#queue` 等 reader 语法，不将原生 `[]` 改成持久 Vector。原来的 quote、反引号和字符语法全部保持 Emacs 原义。

扩展库暂按以下职责组织；库名也是提案：

```elisp
(require 'eliscript-async)
(require 'eliscript-bind)
(require 'eliscript-data)
(require 'eliscript-module)
```

检查、惰性序列、协议、状态引用和 JS 互操作按需加载，不因启动基础语言而全部激活。

## 保留能力清单

下列名字是推荐方案。函数族只列代表操作，普通算法不因本次语言设计逐个增加关键字。

| 扩展能力 | 推荐形式或接口 | 对应的 Emacs 形式 | 使用判断 |
| --- | --- | --- | --- |
| 异步函数 | `defun-async`、`lambda-async`、`await` | `defun`、`lambda` | 定义处能看到返回 Future，等待处能看到暂停 |
| 异步任务控制 | `with-async-scope`、`future-cancel`、`future-then` | 无直接对应 | 取消和子任务归属由作用域表达，不用全局开关 |
| 显式异步绑定继承 | `with-async-bindings`、`bind-async` | `let`、回调函数 | 保留跨回调携带上下文的收益，普通 `let` 不自动继承 |
| 多参数数量分支 | `defun-case`、`lambda-case` | `defun`、`lambda` | 定义完整覆盖的调用形状，分支按参数数量选择 |
| 数据解构 | `let-bind`、`let*-bind`、`defun-bind`、`lambda-bind` | `let`、`let*`、`defun`、`lambda` | 在需要解构的位置出现，普通参数表不改变 |
| 纯度检查 | `(declare (eliscript :pure t))` | `declare` | 承诺可检查；不授权改变返回对象身份或动态查找 |
| 可移出宿主执行的函数 | `(declare (eliscript :portable t))` | `declare` | 同一函数可提交给 worker，限制隐式宿主依赖 |
| 严格依赖检查 | `(declare (eliscript :checked t))` | `declare`、`declare-function` | 尽早发现未声明依赖；不把全部普通代码改成闭合语言 |
| 模块组织 | `defmodule`、`export-functions`、`export-values`、`import-functions`、`import-values` | `provide`、`require` | 明确函数与值两个出口，保留两个命名空间 |
| 模块私有词法定义 | `defun-lexical`、`defvar-lexical`、`defconst-lexical` | `defun`、`defvar`、`defconst` | 名字指出不使用普通全局符号槽；限定于模块内部 |
| 严格不可重新赋值的局部绑定 | `let-const`、`let*-const` | `let`、`let*` | 只保护绑定；对象内容是否可变由类型决定 |
| 持久 List | `persistent-list`、`persistent-list-p` | `list`、`listp` | 与可变 cons 明确分开，不使用易与 property list 混淆的 `plist` 简写 |
| 持久 Vector | `persistent-vector`、`persistent-vector-p` | `vector`、`vectorp` | 不抢占 `[]`；共享源码无需另一个 reader |
| 持久 Map、Set、Queue | `persistent-map`、`persistent-set`、`persistent-queue` | 哈希表及相关容器 | 普通构造函数即可表达类型，不增加控制流语法 |
| 有序持久集合 | `persistent-sorted-map`、`persistent-sorted-set` | 无统一直接对应 | 比较器显式传入；保留范围遍历和稳定次序 |
| 泛集合值操作 | `value-get`、`value-assoc`、`value-dissoc`、`value-conj`、`value-count`、`value-empty-p` | `aref`、`gethash`、序列操作 | 表达新值协议，不重新解释 `put`、`get`、`car`、`length` |
| 值相等与哈希 | `value-equal-p`、`value-hash`、`value-compare` | `equal`、`sxhash-equal` | 支持新持久值；不改变 `eq`、`equal` 的基础语义 |
| 不可变元数据 | `value-meta`、`value-with-meta` | 属性表、文本属性 | 保留空集合独立元数据，不冒充原生 nil |
| 不可变领域记录 | `cl-defstruct-persistent` | `cl-defstruct` | 复用结构体的字段、构造器和谓词命名习惯 |
| 开放协议 | `defprotocol`、`extend-protocol` | 与 `cl-defgeneric` 接近，但不是同一机制 | 按一组操作表达能力，不刻意伪装成单个 generic function |
| 协议身份对象及匿名实现 | `defclass-protocol`、`reify-protocol` | `defclass`、匿名对象实现 | 对象冻结但按身份比较；与持久 Record 的值比较分开 |
| 任意值分派及层级、偏好 | `cl-defgeneric-value`、`cl-defmethod-value` | `cl-defgeneric`、`cl-defmethod` | 后缀提示分派依据不同，普通 generic function 保持原义 |
| 可观察状态引用 | `state-cell`、`cell-value`、`cell-update!`、`cell-reset!`、`cell-watch` | 无直接对应 | 不抢占 Emacs 的 `atom` 谓词；不隐含跨 worker 原子性 |
| 延迟求值与显式缓存 | `delay`、`force`、`memoize`、`realized-p` | 无统一直接对应 | 延迟值与异步 Future 区分；缓存复用是调用者的显式选择 |
| 惰性序列 | `lazy-seq`、`lazy-map`、`lazy-filter`、`lazy-take` | 序列操作 | 名字可见惰性，不把普通 `mapcar` 改成延迟执行 |
| Transducer 和可归约源 | `map-transducer`、`filter-transducer`、`take-transducer`、`transduce`、`into` | 序列操作 | 保留组合能力，但作为普通库函数，不提供另一套普通算术或真假规则 |
| 临时可变构建器 | `with-transient`、`conj!`、`assoc!`、`dissoc!` | 原位集合操作 | 作用域内更新，离开时产生持久值；`!` 明确表示修改 |
| 栈安全显式递归 | `let-loop`、`defun-tail`、`lambda-tail`、`recur`、`trampoline` | `let`、`defun`、`lambda`、`named-let` | 保留已有 `named-let`，额外递归能力不进入普通函数体 |
| 函数组合 | `compose`、`partial`、`juxt`、`trampoline` 等普通函数 | 高阶函数、`apply-partially` | 按功能组织库，不新增基础求值规则 |
| 流水线组合 | 已有 `thread-first`、`thread-last`，新增 `thread-as`、`thread-cond-first`、`thread-cond-last` | 同名已有宏 | 复用已有形式，减少箭头别名；条件仍按 Emacs 判断 |
| 值分派表达式 | `pcase-value`、`cond-predicate` | `pcase`、`cond` | 普通 `pcase` 不变；新的值比较和谓词分派明确命名 |
| 可重现、受限的宏 | `defmacro-checked`、`macro-gensym`、`macro-read-file` | `defmacro`、`gensym`、文件读取 | 在明确选择的宏中限制环境，不限制普通 Emacs 宏 |
| 成功与失败数据 | `result-ok`、`result-error`、`result-ok-p`、`result-error-p`、`result-bind` | 普通记录与条件 | 业务失败作为值，不吞掉程序异常 |
| 存在与缺失数据 | `option-some`、`option-none`、`option-some-p`、`option-value` | 常见 nil 缺省习惯 | 在确需区分 present nil 与缺失时显式使用；这是新增补充 |
| 不可变数据标识 | `data-symbol`、`data-symbol-name`、`data-symbol-namespace` | `symbol-name` 等，但对象类别不同 | 保留名称与命名空间的可传输值；原生 Symbol、Keyword 不改变 |
| 显式宿主互操作 | `js-import`、`js-array`、`js-object`、`js-get`、`js-put`、`js-call`、`js-new`、`js-expr` | 无直接对应 | `js-` 前缀说明宿主语义，不挤占普通 Lisp 名称 |
| 宿主保真值 | `js-call-raw`、`js-get-raw`、`js-false`、`js-null`、`js-undefined` 及对应谓词 | 无直接对应 | 默认使用 Lisp 布尔值，保真路径明确区分宿主状态 |
| 宿主运算与 UTF-16 偏移 | `js-divide`、`js-remainder`、`js-length`、`js-substring`，32 位运算函数 | `/`、`mod`、`length`、`substring` | 对接 JS 的需要留在显式接口中，不改变普通运算 |
| 冻结正则与显式匹配结果 | `js-regexp`、`js-regexp-find`、`js-regexp-matches`、`js-regexp-seq`、`js-regexp-replace` | `string-match`、替换等 | 名字同时说明正则方言，结果不修改 Emacs match data |
| 异步跨引擎调用 | `engine-call`、`engine-bind`、`engine-handle-p` | `funcall`、函数对象 | 远程调用返回 Future，回调与句柄有明确生命周期 |
| JSON、文本协议及 HTTP RPC | 既有协议函数和普通库模块 | 标准库及外部库 | 保留库能力，不引入新 reader 或编译器关键字 |

## 函数与修饰符

`defun-async` 保留普通 `defun` 的参数表、文档字符串与函数命名空间，唯一主要控制流差异是返回 Future 并允许 `await`。普通异步匿名函数用 `lambda-async`。不将 `async` 当成普通 `lambda` 的隐藏属性。

```elisp
(defun-async fetch-title (url)
  "Return a Future for the page title."
  (let ((page (await (fetch-page url))))
    (page-title page)))

(lambda-async (url)
  (await (fetch-title url)))
```

`await` 必须处于异步函数的执行体内。嵌套的普通 `lambda` 建立同步边界，不继承外层的等待权限。它暂停当前执行任务，不阻塞 Emacs 主循环，不自动等待一个普通返回值；非 Future 参数报类型错误。

异步函数的正常返回成为 Future 的结果；如果返回一个 Future，则采纳其结果，不产生需要重复 await 的嵌套 Future。Lisp 条件与非局部退出不能直接交给原生 Promise 任意改写：普通 `condition-case`、`catch` 和 `unwind-protect` 在异步执行体中仍保持原有区分。原生 JS 拒绝值通过 `js-error` 条件携带原始错误和来源信息。取消使用继承 quit 的 `eliscript-cancelled` 条件，避免被普通 error handler 无意吞掉，并执行需要的清理。

`defun-case` 提供多个参数数量分支。分支按数量选择，不按源码顺序尝试重叠类型模式；同一参数数量的重复分支报错。每个分支只使用必需参数及一个最终 `&rest`，不引入 `&optional` 的数量区间歧义。最终 rest 分支可以接收其最低数量及以上的参数，与固定分支发生重叠时报错。rest 值仍是 Emacs List，空 rest 仍是 nil。

```elisp
(defun-case greet
  "Greet with an optional age supplied through separate call shapes."
  ((name)
   (format "Hello %s" name))
  ((name age)
   (format "Hello %s, age %s" name age)))
```

`lambda-case` 是匿名对应形式。它们不采用 Lisp-1 调用规则。存进变量的函数继续通过 `funcall` 调用。

组合能力使用同一个声明入口，避免生成 `defun-case-async-bind-portable` 等组合名字：

```elisp
(defun-case fetch-user
  (declare (eliscript :async t))
  ((id)
   (await (fetch-user-by-id id)))
  ((id cache)
   (or (gethash id cache)
       (await (fetch-user-by-id id)))))
```

专用形式表达常见能力；组合声明只允许在明确的扩展定义中改变调用行为。普通 `defun` 中的 `:async`、`:destructure` 不得悄悄生效。

| 声明项 | 含义 | 可以出现的位置 |
| --- | --- | --- |
| `:pure t` | 检查副作用与隐式可变依赖 | 普通及扩展函数、受限宏 |
| `:portable t` | 检查执行依赖与输入输出的可跨引擎边界 | 普通及扩展函数、受限宏 |
| `:checked t` | 检查显式声明的调用与模块依赖 | 函数、模块 |
| `:async t` | 返回 Future，允许暂停 | 扩展函数；专用异步形式隐含此项 |
| `:destructure t` | 参数位置使用已声明的解构模式 | 扩展函数；专用 bind 形式隐含此项 |
| `:inputs (...)` | 声明宏可读取的构建输入 | `defmacro-checked` |

重复的同值声明允许用于组合；相互矛盾的声明报错。声明是合同，不能在解释执行时无声忽略。具体检查与执行机制仍需验证，尤其是原生 Emacs 装载器如何强制新增约束。

`pure` 与 `portable` 不相互蕴含。portable 可以有局部修改；pure 也不意味着某个宿主调用可以脱离宿主执行。声明不得授权缓存或内联来改变 `eq` 可观察的分配身份、动态绑定和函数替换。依赖被重定义或 advice 改变后，已有检查结论必须重新验证或失效。

## 解构

第一套模式保持 Emacs reader 兼容：

| 模式 | 匹配对象 |
| --- | --- |
| 普通变量名 | 接收整个值 |
| `[name age]` | 固定长度的原生或持久 Vector |
| `(:list name age)` | 固定长度的原生正规 List 或持久 List |
| `(:map (:name name) (:age age))` | 具有这些键的哈希表、持久 Map 或明确支持的记录 |
| `[head &rest tail]` | 接收剩余元素；保留输入集合类别 |

Map 模式区分缺失键与存在且值为 nil 的键；缺失键默认报错。匹配只读取，不产生宿主效果。重复绑定名、类型不匹配及不符合长度的输入报明确错误。

可选参数中的解构模式需要显式给出默认值，采用类似 cl-defun 的 `(模式 默认值)` 写法。缺省 nil 不会被偷偷替换成空 Vector 或空 Map；没有有效默认形状时匹配失败。

```elisp
(let-bind (([name age] ["Ada" 36])
           ((:map (:title title))
            (persistent-map :title "Notes")))
  (format "%s %s %s" name age title))

(defun-bind person-label ([name age])
  (format "%s, age %s" name age))
```

`let-bind` 的初始化顺序对应 `let`；`let*-bind` 对应 `let*`。不支持的特殊变量模式不应退化为另一套隐式词法规则：最终绑定仍遵循 Emacs 的特殊变量声明。

## 严格绑定与模块

`let-const`、`let*-const` 只保护绑定不被重新赋值，不自动冻结内部对象。

```elisp
(let-const ((limit 20)
            (cache (make-hash-table)))
  (puthash "answer" 42 cache)
  (gethash "answer" cache))
```

此例允许修改 cache 内容，但不能将 cache 重新赋为另一个对象。常量与动态 special 名称冲突时报错，不允许通过此形式把一个 special 名称偷偷改成词法常量。

模块首先组织接口与依赖。模块体中的普通 `defun`、`defvar` 和被引用的符号保持原有 Emacs 全局名字；模块不会暗中重写 quote 或 intern。需要真正私有绑定时使用显式 lexical 定义。

```elisp
(defmodule sample.math
  (defconst-lexical scale 2)
  (defvar-lexical call-count 0)

  (defun-lexical multiply (value)
    (* value scale))

  (defun sample-double (value)
    (setq call-count (1+ call-count))
    (multiply value))

  (export-functions sample-double))

(import-functions sample.math sample-double)
(sample-double 21)
```

lexical 定义位于模块私有函数或变量空间；普通全局同名 symbol 的 `fset`、`set` 不改写这些私有绑定。`defconst-lexical` 严格禁止重新赋值；它不继承普通 `defconst` 的 advisory 常量语义。

函数和值分别导出、导入。函数导入保留声明的普通函数符号查找，不因 import 自动获得静态内联许可。导出可变值必须读当前绑定，不复制初次导入的值。私有 lexical 函数如需公开，应显式指定出口名字；导出的引用仍具有所声明的更新和身份规则。

完整模块名称解析、装载/重载和私有绑定实现属于待验证的合同，不能据此宣称原生 Emacs 已具备这样的模块系统。

## 持久数据与记录

构造名优先清楚地说明类别，普通代码仍可以使用原生集合。

```elisp
(let*-const ((before (persistent-map
                    :count 0
                    :items (persistent-vector "a" "b")))
            (after (value-assoc before :count 1)))
  (list (value-get before :count)
        (value-get after :count)))
```

`value-assoc` 返回新值。原生 `setq`、`setf`、`puthash` 不因参数来自扩展而被解释成持久更新。`listp`、`vectorp`、`car`、`cdr`、`length` 继续保持基础类型边界；扩展集合通过自己的类型谓词和 value 协议操作。

持久空 List 是独立集合对象，不是 nil，因此在普通 if 中为真。使用 `value-empty-p` 判断为空。空持久集合可以带不可变元数据；无需破坏唯一 nil 的身份。

`value-equal-p` 为持久数据提供结构比较，opaque 宿主对象按身份处理。比较、哈希与排序必须自洽。数据标识按名称与命名空间比较；原生 symbol 仍按 Emacs 身份处理。数字保留 Lisp 整数/浮点类型区分；若扩展对 NaN 采用稳定键规则，则必须同时定义匹配的哈希与排序规则。Map 的可变内容型键按明确的快照规则保存，不能随外部修改而破坏哈希桶；不能静默复制任意宿主对象身份。

`cl-defstruct-persistent` 优先使用已有结构体的构造器、访问器和谓词习惯：

```elisp
(cl-defstruct-persistent person
  name
  age)

(let* ((before (make-person :name "Ada" :age 36))
       (after (person-with before :age 37)))
  (list (person-age before)
        (person-age after)))
```

自动生成 `make-person`、`person-p`、`person-name`、`person-age` 和功能式更新函数 `person-with`。同名已有定义按声明冲突报错。字段不能用 setf 修改；需要可变结构体时使用普通 `cl-defstruct`。

协议表达一组操作的能力；value generic function 表达任意值分派，两者不重复定义相同目的：

```elisp
(defprotocol Printable
  (render (self)))

(extend-protocol Printable person
  (render (self)
    (person-name self)))

(cl-defgeneric-value render-format (kind value) kind)
(cl-defmethod-value render-format :text (kind value)
  (format "%s" value))
```

一般的类型或 eql 分派先使用已有 `cl-defgeneric`、`cl-defmethod`。只有自定义分派值、层级或偏好确有价值时才使用 value 版本。`defclass-protocol`、`reify-protocol` 保留冻结身份对象及闭包捕获能力，但不冒充类型别名形式 cl-deftype 或持久 Record。前者创建有名的封闭协议实现类型，后者创建匿名实现；它们不默认提供 EIEIO 的继承与可变字段。

## 状态和序列

`state-cell` 替代旧构造名 atom。Emacs 的 `(atom value)` 始终是原生谓词。cell 更新同步执行一次，验证失败保持原状态，通知在提交后发送；默认不跨 worker 共享原子状态，也不暗中重试有副作用的转换函数。

```elisp
(let ((state (state-cell (persistent-map :count 0))))
  (cell-update! state
                (lambda (old)
                  (value-assoc old :count
                               (1+ (value-get old :count)))))
  (cell-value state))
```

`delay` 是延迟 body 的宏；`force` 是同步取值，不等于 await。它按 Emacs 规则捕获词法变量，特殊变量则在实际 force 时读取，不自动捕获创建时的动态绑定。`lazy-seq` 及惰性组合器使用明确名字。`memoize` 接受函数对象并返回缓存函数，缓存结果复用及身份是此包装的显式合同；不能仅凭 pure 声明自动添加缓存。

```elisp
(let ((answer (delay (+ 20 22))))
  (force answer))

(lazy-take 10
           (lazy-filter #'cl-evenp
                        (lazy-range 0)))
```

不将 `mapcar`、`seq-map` 或普通列表构造改成惰性。序列操作保留显式上界和可重复遍历规则；对无限源调用要求穷尽的操作应有明确合同。

transducer 是普通函数组合，谓词返回 t/nil，reduction 初始值和完成行为显式定义。`with-transient` 提供常见的单一 builder 作用域：

```elisp
(with-transient (out (persistent-vector))
  (dolist (value '(1 2 3))
    (conj! out (* value value))))
```

此宏返回 out 完成后的持久值，而非最后一个 body 值。作用域退出后 owner 永久失效；异常不返回半成品。builder 不得逃逸、被重复完成或跨 await。底层显式转换函数可用于高级场景，但采用同一个 owner 合同。

## 栈安全和组合表达式

显式 recur 只属于 `let-loop`、`defun-tail`、`lambda-tail` 的尾位置。普通函数调用、动态替换和 advice 不因出现相似源码而被自动变成跳转。

```elisp
(let-loop ((remaining '(1 2 3))
           (total 0))
  (if remaining
      (recur (cdr remaining)
             (+ total (car remaining)))
    total))

(defun-tail list-total (values total)
  (if values
      (recur (cdr values)
             (+ total (car values)))
    total))
```

recur 的新参数从旧绑定环境中从左到右求值，然后同时进入下一轮；特殊变量和 unwind 行为必须正确恢复，不能用直接赋值模拟全部动态语义。已有 `named-let` 仍保持 Emacs 行为。

`thread-first`、`thread-last` 复用 Emacs 形式。新增 `thread-as` 处理需要显式中间名字的表达式；`thread-cond-first`、`thread-cond-last` 接收 test/step 对，测试按源码顺序执行。不新增另一套布尔 if。

`pcase-value` 使用与 pcase 相同的分支形状，literal 模式按扩展值相等匹配；没有普通 pcase 名字的行为替换。`cond-predicate` 先求值一个二元谓词和一个被分派值，再按顺序尝试子句。

## 受限宏

普通 `defmacro` 保留完整 Emacs 能力。受限宏主动选择新的定义形式：

```elisp
(defmacro-checked twice (form)
  (declare (eliscript :pure t :portable t))
  (let ((temporary (macro-gensym "value")))
    `(let ((,temporary ,form))
       (+ ,temporary ,temporary))))
```

此例对 form 只求值一次。`macro-gensym` 提供源位置和展开上下文约束下的确定性名字，不改变普通 `gensym` 的语义。生成绑定仍遵守 Emacs 的变量/函数两个命名空间和正常分析规则。

```elisp
(defmacro-checked project-label ()
  (declare (eliscript :inputs ("label.txt")))
  (macro-read-file "label.txt"))
```

读文件需要声明输入，内容参与构建身份。宏不能通过隐式宿主状态绕过限制。源输入声明与 pure 约束冲突时应报错或要求将这些声明输入明确纳入纯度的输入模型，不能只凭名字宣称可重现。

## 异步上下文与跨引擎

Future 是扩展类型。两个引擎对完成、错误、取消和清理采用同一个合同，不允许 Emacs 后端用阻塞等待伪装 await。动态绑定帧在暂停任务中保存，恢复该任务时重建；独立回调不自动继承创建时的全部动态环境。

`with-async-scope` 管理取消及子任务归属。它只能出现在异步执行体中，使用 `(with-async-scope (scope) body...)`。正常退出等待其拥有的全部子任务结束，再返回 body 的最后一个值。提前错误或取消请求取消未完成子任务，并处理它们的终态；取消请求本身不证明效果已经撤销或停止。无法确认的效果保留 unknown，作用域不能把它报告为已完成清理。第一套草案不提供隐式 detach。

`with-async-bindings` 显式携带选定的特殊变量。扩展 Future 链可继承这些绑定，普通 Emacs 的 callback API 必须用 `bind-async` 包装回调：

```elisp
(defvar request-id nil)

(with-async-bindings ((request-id "example"))
  (run-at-time 0 nil
               (bind-async
                (lambda ()
                  (message "%s" request-id)))))
```

没有显式包装的原生定时器、hook 和 advice 保持 Emacs 的执行时动态环境。继承一组变量不自动继承全部宿主能力或授权。回调跨 worker 时，只能传输明确支持的值或句柄。

`engine-call` 与普通 funcall 明确区分：

```elisp
(defun-async remote-score (engine values)
  (await (engine-call engine 'sample-score values)))
```

目标函数名属于所选引擎的函数命名空间。普通 Lisp 参数与返回值尽量按值传输；对象句柄显式携带 owner 与 generation。不能传输的闭包需要 `engine-bind` 注册成可撤销的远程调用句柄，不自动复制闭包或两边的可变对象身份。远端未捕获的 throw 不能被猜测映射到本地某个同名 catch；独立执行入口通过返回结果或条件结束调用。

## JS 与其他库能力

JS 互操作使用普通函数与明确宿主形式：

```elisp
(js-import "node:path" :as path)
(js-call path "join" "notes" "index.md")
(js-array 1 2 3)
(js-object :name "Ada" :active t)
(js-divide 5 2)
```

普通 `/` 保持 Emacs 整数除法；js-divide 明确表达 Number 除法。`js-length`、`js-substring` 明确使用 UTF-16 单元，普通字符串函数不改变单位。

默认 js-call/js-get 的标量结果进入 Lisp 值：true 为 t，false/null/undefined 为 nil。安全整数 Number 转为整数，其他 Number 为浮点值，BigInt 转为精确整数，字符串转为 Lisp 字符串。不能把不安全的整数 Number 伪装成精确整数。非标量以宿主对象或 Future 句柄返回，不默认深复制整个图。

raw 版本保留宿主类型及 false/null/undefined 的区分，通过显式谓词检查。这些保真宿主值不是第二种 Lisp 假值。Lisp nil 作为 JS 参数默认表示 null；若要发送 false 或 undefined，传入对应宿主值。具体转换的完整边界仍需单独规定，不得靠参数位置猜测。

js-regexp 系列保留冻结 pattern、显式捕获结果、惰性扫描和 Unicode 零宽匹配处理。每个结果是带 match/start/end/groups 字段的持久记录；不依捕获组数量在 string 与 Vector 之间切换，不写入 Emacs match data。pattern 的 JS 方言由名字明确表达。

Result、Option 和数据标识属于普通值库。它们遵循唯一的 nil 真假规则：失败 Result、缺失 Option 都是非 nil 对象，不得用 `(if result ...)` 推断成功。使用明确谓词或值模式。

JSON、数据文本、Markdown wire、schema validation、HTTP RPC、collection protocol、排序和高阶算法继续作为普通库能力。所有谓词返回 t/nil；原生 symbol、函数传参方式和错误需要按新的基础语义校准，而非增加新关键字隐藏差异。

## 不再保留为默认语义的设计

| 旧设计 | 新方向 |
| --- | --- |
| defun/defvar 共享名称空间 | 普通形式回归 Emacs；模块私有函数仍使用独立函数绑定 |
| defvar 表示普通可变 ESM binding | 使用 defvar-lexical 或普通 Emacs defvar，含义分别明确 |
| defconst 强制不可赋值 | 普通 defconst 保持原义；额外约束用 lexical const 或 let-const |
| 所有 list/vector 字面量是持久集合 | 普通形式保持原义，持久构造使用新名字 |
| quote nil 产生空持久 List | quote 保持 Emacs；需要持久数据时显式构造或转换 |
| false/undefined 自动参与普通 Lisp 条件规则 | 普通布尔值只有 t/nil；宿主保真值使用明确接口 |
| 所有用户宏都在受限解释器中运行 | 普通 defmacro 完整兼容；受限宏用 defmacro-checked |
| throw/catch 表示 JS 异常 | 普通形式保持 Emacs；宿主错误保留来源后映射为 Lisp 条件 |
| 普通 +、/、mod、length 等采用 JS 行为 | 保持 Emacs；需要宿主行为时使用 js- 操作 |
| 所有名称必须闭合静态解析 | 普通代码保留晚定义；显式 checked/portable 范围执行约束 |
| defn/fn/do 等重复核心别名 | 优先使用 defun/lambda/progn；不为历史拼写维护另一套核心 |
| if-some 与 if-let 因多个假值而不同 | 普通 Lisp 条件没有这项差异；存在性区分使用 Option 或宿主谓词 |
| atom 表示状态容器 | atom 恢复原生谓词，状态容器改为 state-cell |

## 待确认的设计边界

推荐先确认默认语义与命名家族，再细化边界合同。尚需决定的事项是模块私有绑定及重载规则、跨引擎句柄与撤销协议、宿主保真值的完整转换，以及原生 Emacs 如何执行新增检查约束。

这些事项影响实际使用语义，不能在开发时临时猜测。本草案没有启动开发或 goal，也没有将任何提案登记为已实现能力。

## 现有设计依据

保留能力依据当前仓库的语言与库合同，新增语法不是这些合同的现有公开接口：

- [语言参考](language-reference.md)
- [标准库](../stdlib/README.md)
- [函数参数](../specs/0036-function-parameters.md)
- [异步函数](../specs/0037-async-functions.md)
- [可移植函数](../specs/0021-portable-functions.md)
- [不可变记录](../specs/0168-immutable-record-types.md)
- [受限宏](../specs/0005-compile-time-macros.md)
- [状态引用](../specs/0072-atomic-state-references.md)
- [临时构建器](../specs/0062-owner-token-transient-collections.md)
