---
id: notes/welcome
title: 从 Markdown 到站点
date: 2026-09-15
description: 这个页面由 GitHub Action 的可执行产物在本地构建，配置来自身边的 dogfood.config.eli。
tags: [eliscript, build]
slug: welcome
pinned: 1
---

这一版站点完全由 **打包后的 Action 产物** 生成，它不依赖 Emacs，也不依赖 Bun。

## 链路

1. `dogfood.config.eli` 由运行时读取器解析，从不执行。
2. `content/posts/` 里的 Markdown 变成规范化文章模型。
3. 渲染器只接收规范化模型，输出静态文档。
4. 输出目录先写暂存区，再原子替换。

> 配置是数据，不是代码。

下面是渲染器边界：

```elisp
(defun render-site (site posts)
  (let* ((sorted (sort-posts posts))
         (tags (collect-tags sorted)))
    ...))
```

草稿不会出现在任何投影里。
