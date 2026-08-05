# 当前推进

> 当前阶段和正在进行的任务。完成后更新此文件并推进到下一项。

---

## MakeXRank integration (2026-08-05)

The independent module now supports shared Supabase synchronization when hosted by MakeXRank. Standalone use still defaults to local storage. The planned Cloudflare Workers work remains a separate future deployment path.

## 阶段：Phase 1 — 结构调整 + 内联脚本拆分 ✅ 已完成

- [x] `docs/` 目录创建，前端文件移入
- [x] `src/` 目录创建，Cloudflare 项目结构
- [x] 内联脚本拆分为 `apps/*.js`
- [x] `index.html` 改为首页
- [x] 项目文档重构（PLAN.md → docs-dev/ + AGENTS.md）
- [x] `docs/admin.html` 数据备份 / 跨设备同步（localStorage 导出/导入）

---

## 阶段：Phase 2 — Cloudflare Workers API ⏳

### 当前任务

- [ ] 创建 `workers/` 目录结构并初始化项目
- [ ] 实现 D1 Schema（11 张表）
- [ ] JWT 认证（登录/登出/验证）
- [ ] CRUD Routes（students / groups / tasks / trainings / scores）
- [ ] 权限校验（admin / coach / student）
- [ ] `wrangler dev` 本地测试

### 阻塞

无

### 下一步

创建 workers/ 目录并初始化项目
