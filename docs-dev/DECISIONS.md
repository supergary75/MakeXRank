# 决策记录 — insTools

> 重要决策及其理由。格式：日期 | 类别 | 决策 | 理由

---

| 日期 | 类别 | 决策 | 理由 |
|------|------|------|------|
| 2026-08-05 | Integration | Use an authenticated Supabase whole-document bridge when embedded in MakeXRank, while retaining localStorage fallback | Enables immediate cross-user sharing without blocking the standalone Cloudflare roadmap or rewriting the existing data model |
| 2026-07-30 | 部署 | GitHub Pages 从 `/docs` 发布 | 保持 GitHub Pages 可用性，逐步迁移到 Cloudflare |
| 2026-07-30 | 架构 | `index.html` 作为首页，取代 stats.html 跳转 | 更符合直觉，`/` 直接显示内容 |
| 2026-07-30 | 架构 | 存储抽象层采用 StorageAdapter 模式，Phase 4 实施 | 需要等 Workers API 就绪后统一做 |
| 2026-07-30 | 部署 | Cloudflare 部署采用 Git 集成方式 | Dashboard 连接 GitHub 自动部署，无需 wrangler CLI |
| 2026-07-30 | 约定 | 项目计划拆分为 `docs-dev/` 目录 + `AGENTS.md`，替代单文件 PLAN.md | 多文件结构清晰，减少 token 浪费，AI 代理可自动加载 |
