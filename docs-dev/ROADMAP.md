# 路线图 — insTools

> 项目进度总览。每个 Phase 完成后更新进度条和勾选状态。

---

## MakeXRank integration

- [x] Supabase whole-document synchronization bridge
- [x] Shared MakeXRank authentication session
- [x] Local/offline fallback
- [ ] Optional structured-table migration and realtime subscriptions

## 总进度

```
Phase 1 ████████████████████ 100%  结构调整 + 内联脚本拆分
Phase 2 ░░░░░░░░░░░░░░░░░░░░   0%  Cloudflare Workers API
Phase 3 ░░░░░░░░░░░░░░░░░░░░   0%  Cloudflare Pages 配置
Phase 4 ░░░░░░░░░░░░░░░░░░░░   0%  StorageAdapter 抽象层 + 前端对接
Phase 5 ░░░░░░░░░░░░░░░░░░░░   0%  部署 Cloudflare
```

---

## Phase 1 ✅ 已完成

- [x] 创建 `docs/` 目录，前端文件移入
- [x] 创建 `src/` 目录，Cloudflare 项目结构
- [x] 内联脚本拆分为 `apps/*.js`
- [x] `index.html` 改为首页（取代 stats.html 跳转）
- [x] 更新 `README.md`
- [x] `docs/admin.html` 数据备份 / 跨设备同步（localStorage 导出/导入）

## Phase 2 ⏳ 待开始 — Cloudflare Workers API

- [ ] 创建 `workers/` 目录结构
- [ ] 实现 D1 Schema（11 张表）
- [ ] JWT 认证（登录/登出/验证）
- [ ] CRUD Routes（students/groups/tasks/trainings/scores）
- [ ] 权限校验（admin / coach / student）
- [ ] `wrangler dev` 本地测试

## Phase 3 ⏳ 待开始 — Cloudflare Pages 配置

- [ ] 根目录添加 `_headers`（安全头、CORS）
- [ ] 根目录添加 `_routes.json`（路由规则）
- [ ] 根目录添加 `wrangler.toml`（Pages 配置）

## Phase 4 ⏳ 待开始 — 存储抽象层 + 前端对接

- [ ] 定义 `StorageAdapter` 抽象类
- [ ] 提取 `LocalStorageAdapter`（从 `shared.js`）
- [ ] 提取 `IndexedDBAdapter`（从 `shared_indexdb.js`）
- [ ] 实现 `CloudflareAdapter`
- [ ] 实现 `CustomAPIAdapter`
- [ ] admin.html 增加数据源选择 UI
- [ ] 登录 UI（JWT 令牌管理）

## Phase 5 ⏳ 待开始 — 部署 Cloudflare

- [ ] Cloudflare Dashboard 创建 Pages 项目
- [ ] 连接 GitHub 仓库
- [ ] 创建 D1 数据库，执行 `schema.sql`
- [ ] 部署 Workers
- [ ] 端到端验证
- [ ] README 更新入口
