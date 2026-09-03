# 面试中心：第一阶段部署说明

已开发预约、改期、开始/结束面试、观察草稿、站内通知、后台提醒、取消/未到场结案归档、权限隔离，以及 U9/U12/U15/U18 模板库。模板目前是可维护的基础栏目框架，尚未接入报告选择与评分标准；AI、正式 PDF/报告归档也尚未接入。API 明确拒绝完成正式报告。不要对用户宣称完整七步已上线。

## 服务及账号

部署须包含 `server/interviews.mjs`、`server/interviews.sql`、`shared/interviewWorkflow.mjs`、`shared/interviewTemplates.mjs`，不能只复制 app.mjs。现有 API 启动时执行可重复运行的面试表建表 SQL；不覆盖赛事表。上线前备份并先在测试库验证。

面试接口使用现有 JWT，并再次查询启用状态。独立 `interview_staff` 表绑定经过核对的真实账号 UUID 和 Lisa/Gary/Brook/Jason/Vincent 标签，不根据登录页显示名自动授权。Lisa 使用 manager，其他使用 coach；Gary 绑定后自动具备发起能力。不要重建账号或修改密码来完成绑定。

管理员核对现有账号后，使用参数化数据库操作写入 `interview_staff(user_id, role, label)`。每个标签只绑定一个账号；不要把未经确认的账号批量授权。本次开发未操作生产库或配置真实成员。

模板库自动初始化四个基础模板。U9/U12 允许 Brook、Jason 编辑，U15 允许 Vincent 编辑，U18 允许 Gary 编辑；Gary 同时可编辑全部模板，Lisa 只读。权限按已核对的 `interview_staff.label` 在后端强制校验，不能只隐藏前端按钮。每次保存使用版本号防止覆盖他人修改，并在 `interview_template_versions` 保留快照。模板内不得写入真实学员资料。

## 前端连接

同源生产部署默认调用 `/api/interviews`，Nginx 必须将 `/api/` 转发到此 API。身份登录也必须使用同一第一方后端（现有 tencent 构建模式）；旧 Supabase JWT 不适用于本地 API。

如需本地联调，用测试数据库启动 API，并配置开发代理及第一方登录地址后再访问。默认本地 Vite 没有该代理；界面会显示未连接，而不会把 HTML 或云端失败当成空列表。`VITE_INTERVIEW_API_URL` 可以指定明确受信任的第一方地址；跨域须另行配置 CORS，不能把旧 Supabase 地址填入。

演示模式是明确启用的内存沙盒，默认 Gary 身份，可切换五个虚构角色；刷新或离开页面重置，不写数据库、不发通知、不持久化真实资料。

## 提醒与归档

API 运行期间每 30 秒处理持久化待发提醒。提醒只生成站内通知，不保证手机离线弹窗。改期及状态变更撤销旧任务；事务及唯一键防止重复。进程停止时不会发送，恢复后已过面试时间的任务取消。

归档是数据库记录分类而不是删除。当前只有带原因的取消/未到场记录可以归档；正式报告归档需以后接入 PDF 文件及交付校验。归档后仍受原权限控制。

## 本地验收

`npx vitest run src/components/interview/InterviewWorkflow.test.ts`

随后验证真实 PostgreSQL 的事务、并发重复提交、两个账号隔离、提醒投递及跨设备归档读取；纯状态机测试和浏览器演示不能替代生产端到端验证。
