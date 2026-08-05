# 变更日志 — insTools

> 所有显著的功能变更、修复、改进记录于此。

---

## 2026-08-05

- Added the MakeXRank Supabase bridge (`inspire_sync`) with authenticated shared cloud storage.
- Retained localStorage as the offline and standalone fallback.
- Added cloud initialization before page rendering and a visible sync-status indicator.
- Repaired malformed strings that prevented `training.js` from parsing.

## 2026-07-31

### 新增
- `docs/admin.html` + `src/admin.html` + `src/js/apps/admin.js` — 新增「📦 数据备份 / 跨设备同步」功能
  - **导出**：遍历 localStorage 全部键，打包为 JSON 备份文件（含 app / type / formatVersion / exportedAt 元数据）并下载
  - **导入**：上传备份文件 → 预览（文件名、导出时间、键数量、数据量、键列表）→ 选择「整体覆盖 / 合并写入」→ 写回 localStorage 并重载数据
  - 若备份源设备处于 IndexedDB 模式（`sts_storage_mode=idb`），导入预览会提示备份不含 STS_DB 数据
  - `docs/` 为内联脚本版，`src/` 为 `apps/admin.js` 拆分版，两份均已同步实现并验证

---

## 2026-07-30

### 新增
- `PLAN.md` — 项目综合管理文档（后拆分为 `docs-dev/` 目录 + `AGENTS.md`）
- `src/` 目录 — Cloudflare Pages 源代码结构
  - `src/pages/` — 6 个 HTML 页面，路径引用更新为 `../js/`、`../css/`
  - `src/js/apps/` — 从 HTML 拆出的 4 个独立业务逻辑文件
  - `src/js/` — 共享库（shared / analysis / schedule / header）
  - `src/css/style.css`
  - `src/tools/db-manager.html`
- `docs/` 目录 — GitHub Pages 发布目录，所有前端文件移入
- `README.md` — 增加目录结构和部署说明
- `AGENTS.md` — 项目级 AI 代理指令
- `docs-dev/` 目录 — 开发者文档集

### 变更
- `index.html` → 改为真正的首页（内容为成绩统计，取消跳转）
- `stats.html` → 改为跳转到 `index.html`（兼容旧链接）
- `header.js` → 导航链接指向 `index.html`
- `ARCHITECTURE-PLAN.md` → 内容合并到 `docs-dev/ARCHITECTURE.md`，旧文件删除

### 修复
- `header.js` 中 `tools/db-manager.html` 路径从 `tools/` 修正为 `../tools/`
