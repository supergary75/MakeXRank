# 月度课程编辑

部署前端构建与 server、shared 两个目录，重启现有 API 服务。服务使用现有 DATABASE_URL 和 JWT_SECRET；启动时幂等创建 curriculum_months 与 curriculum_month_versions。先备份数据库，保留原有认证和反向代理配置。代理 /api/curriculum 到现有 Express 服务。可用 VITE_CURRICULUM_API_URL 指定另一 API 根路径，默认 /api。

没有数据库/API 时仍展示初始大纲，并明确提示未同步；不会模拟保存成功。

权限以服务器 user_profiles 的有效账号为准：BrookY/JasonZ 编辑 U9/U12B/U12A，VincentC 编辑 U15B；有效 admin 账号 supergary 可编辑、发布、退回及恢复所有级别；其他账号只读。显示名不会授予权限。当前分配为固定规则，尚未接入后台动态授权。

教练保存草稿后提交，Gary 在对应级别查看待审核月份并发布。草稿不影响公开内容。恢复仅允许真实历史发布版本，未结束的草稿会阻止恢复。每次更新使用事务、行锁和版本号，过期编辑返回冲突而非覆盖。

这是无年份的级别标准大纲，不是班级实授课记录。若需按学年归档，应另加学年维度，不要复用来记录每班进度。

本地检查：node --test server/curriculum.check.mjs。HTTP测试使用模拟数据库，不能代替部署后真实PostgreSQL持久化、跨设备和反向代理验收。
