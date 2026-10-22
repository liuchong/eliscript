---
name: release-benchmark
description: 执行 Eliscript 常态化四维版本与原生 Emacs Lisp 性能对比（Emacs Lisp 最新版、上一个大版本、上一个最近的小版本、当前最新版），生成 GitHub Release 主页面摘要与详细报告附件文件，并通过 GitHub Actions 自动上传 Release 报告与发布 NPM、完成 Pages 引擎版本号切换。
---

# Eliscript 四维性能对比与自动化发布流程

在评估版本演进或准备发布新版本时启用本 Skill，严格遵守 `AGENTS.md` 中的 `PERF-01`（开发目标）、`PERF-02`（验收门禁）与 `PERF-03`（长远持续优化目标）。

## 1. 四维性能对比矩阵与边界规则

工具入口：`tools/performance/version-comparison.eli`（编译产物 `tools/performance/version-comparison.mjs`，脚本命令 `bun run benchmark:version-comparison`）。

### 四个固定对比维度 (`VERSION_COMPARISON_DIMENSIONS`)
1. **`emacsLisp`（Emacs Lisp）**：只考虑当前宿主最新版 Emacs Lisp（`emacs --batch -Q`），不回溯历史版本。
2. **`previousMajor`（上一个大版本）**：小于当前主版本号（`major < latest.major`）的最高已发布版本（例如当前为 `1.2.0` 时对应 `0.x.y` 的最高版本）。
3. **`previousMinor`（上一个最近的小版本）**：严格小于当前版本（`< latest`）的最近一个已发布版本（例如当前为 `0.0.4` 时对应 `v0.0.3`）。
4. **`latest`（最新版）**：当前工作区版本（`package.json` 的 `version`）。

### 四类边界情况处理
1. **上一个大版本不存在**：当处于 `0.x.y` 系列或尚无更早大版本 tag 时，`previousMajor` 状态为 `absent`（`reason: "no-prior-major-release"`），表格中输出 `N/A`。
2. **上一个小版本仅在首个版本不存在**：仅当没有任何 `< latest` 的已发布 tag（即项目的第一个版本如 `0.0.1`）时，`previousMinor` 状态为 `absent`（`reason: "initial-release"`）；后续所有版本均解析为 `active`。
3. **上一个大版本与上一个最近的小版本相同**：例如从 `0.0.4` 升级到 `1.0.0` 时，`previousMajor` 与 `previousMinor` 均解析为 `v0.0.4`（`sameAsPreviousMinor: true` / `sameAsPreviousMajor: true`）。执行器只对 `v0.0.4` 采样一次并复用结果（`deduplicatedFrom: "previousMinor"`），报告中标注 `同上一小版本`。
4. **Emacs Lisp 只考虑当前最新版**：`emacsLisp` 始终标记 `mode: "current-latest-only"`，使用当前宿主的最新 Emacs 运行。

## 2. 生成 Release 摘要、合并说明与详细报告文件

运行以下命令生成 Release 产物目录（例如 `dist/release-report`）：

```sh
bun tools/performance/version-comparison.mjs \
  --release-dir dist/release-report \
  --merge-notes existing-release-notes.md
```

该命令自动在 `dist/release-report/` 下产出四个文件：
1. **`release-summary.md`**：用于直接放入 GitHub Release 主页面正文的精简摘要，包含四维状态、核心性能加速比摘要表，以及指向详细附件文件的说明。
2. **`release-notes-merged.md`**：将原有 Release Highlights 与最新生成的 `## 测试与四维性能基准摘要` 幂等合并后的完整 Release Notes（供 `gh release edit --notes-file` 使用）。
3. **`eliscript-<version>-benchmark-report.md`**：作为 GitHub Release Asset 上传的完整详细报告文件，包含宿主指纹、四维版本解析矩阵、9 项核心工作负载四维耗时与加速比完整数据。
4. **`eliscript-<version>-benchmark-report.json`**：作为 GitHub Release Asset 上传的结构化原始采样数据。

## 3. GitHub Actions 自动化发布与 Pages 版本切换顺序

1. **发布前保持 Pages 引擎与版本链接为上一已发布版本**：
   - 在新版本尚未正式发布到 GitHub Release 和 npm 之前，`docs/index.html`、`docs/pages/*.html`、`docs/pages/site.eli`、`tools/surface/generate-api.eli`、`README.md`、`docs/getting-started.md` 中的线上 CDN 引擎链接（`https://unpkg.com/eliscript@<prev>/dist/browser/loader.js`）和版本号保持为上一已发布版本，避免 `master` 推送触发 Pages 部署后产生 404。
2. **创建签名 Release 并触发 `.github/workflows/release.yml` 自动完成基准测试上传与 NPM 发布**：
   ```sh
   bun test tests/version-comparison-benchmark.test.mjs tests/package-surface.test.mjs
   bun tools/performance/version-comparison.mjs --release-dir dist/release-report
   npm pack
   git tag -s "v<version>" -m "Release v<version>"
   git push origin "v<version>"
   gh release create "v<version>" \
     --title "v<version>" \
     --notes-file dist/release-report/release-summary.md \
     "eliscript-<version>.tgz" \
     "dist/release-report/eliscript-<version>-benchmark-report.md" \
     "dist/release-report/eliscript-<version>-benchmark-report.json"
   rm -f "eliscript-<version>.tgz"
   gh workflow run release.yml -f version="<version>" -f publish=true
   ```
   - `.github/workflows/release.yml` 会自动：
     1. 校验签名 Tag 与 Release Tarball 版本一致性；
     2. 检出完整历史与标签，运行四维基准测试 (`tools/performance/version-comparison.mjs`)；
     3. 自动将 `eliscript-<version>-benchmark-report.md` 与 `.json` 上传/覆盖到 GitHub Release 附件，并将主页面摘要幂等合并到 Release 正文；
     4. 执行 NPM Provenance 发布（若 npm 2FA 策略要求 Stage 审批则自动回退到 `npm stage publish` 并输出 `stage-id`）。
3. **完成 npm 上线后切换 Pages 引擎与版本号**：
   - 确认 `npm view eliscript@<version>` 可用后，将 Pages 与文档中的 CDN 引擎地址和版本号统一更新为 `<version>`，重新生成 `docs/pages/api.html` 与兼容性契约，签名提交并推送到 `origin/master`。
