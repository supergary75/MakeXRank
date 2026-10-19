# 正式内部版本与运维

唯一正式入口：https://81.70.62.5/MakeXRank/#view=coach-workbench 。GitHub 保存源码和构建产物，不再自动发布另一套使用旧认证服务的 Pages 网站。历史分支、工作树和旧备份均保留；不要将旧包覆盖当前版本。

## 发布与回滚

1. 本地 `npm ci`、`npm test`、`npm run lint`、`npm run sync:inspire`、`npm run build:tencent` 和 `npm audit --omit=dev --audit-level=high`。
2. 审查并提交源码。用该 commit 设置 `VITE_BUILD_ID` 后重新构建，运行 `node scripts/package-release.mjs`。`release.json` 记录 commit、构建模式及所有部署文件 SHA256。发布包不含数据库、名册导出、密码或环境机密。
3. 将包解压到 `/home/ubuntu/makexrank-release-<12位commit>`，以 root 执行其中 `server/ops/deploy.sh <目录>`。只修改 MakeXRank，不覆盖主机其他应用。
4. 部署先做私有全量备份和隔离恢复验证，核对原账号、密码哈希、角色、范围及签名配置未变，再切换代码。失败自动恢复前端/API和代理配置，不回退或清空业务数据库。
5. 成功后检查 HTTPS 健康、公开读取、匿名名册401、工作台、课程/面试保存路径，以及真实教练跨设备验收。`/MakeXRank/release.json` 可核对线上 commit。

目录：API `/opt/makexrank`；前端 `/var/www/html/MakeXRank`；私有环境 `/etc/makexrank.env`；全量发布备份 `/home/ubuntu/makexrank-backups/release`；每日数据库备份 `.../daily`。旧目录、旧依赖和安装包暂不删除。

## 权限与会话

服务器强制 viewer 只读、editor/admin 编辑、admin 删除比赛。比赛写入同时检查既有和拟修改的赛项及比赛范围。admin 与原页面一样不受赛事范围限制。权限配置和教务教练班级映射不变。

旧同步行是多种 JSON 整块快照，不能按范围过滤后覆盖。带非空赛事/比赛范围的非管理员不能替换共享同步快照；需管理员处理。未限范围的编辑账号仍可正常使用后勤、集训和 Inspire 的既有结构。公开比赛/队伍标签保持公开，不承诺它们是保密内容。

会话改为服务器持久保存，可单会话退出撤销；重置密码撤销全部会话。登录、刷新、退出与重置使用同一用户锁，防止并发旧凭证重新发证。升级前不带 session ID 的旧凭证拒绝，需要用原密码重新登录一次。没有修改任何人的密码。

登录有账号/来源15分钟预算、4KB请求体、128字符密码上限、异步scrypt和最多2项KDF并发。Nginx仅本项目代理段覆盖转发来源，不能信任客户端伪造的转发头。

## 备份

根拥有的工具 `/usr/local/lib/makexrank/backup.mjs` 只使用 Node 内置库和 PostgreSQL 官方工具，不加载应用用户可改写的依赖。

`makexrank-backup.timer` 每天服务器北京时间03:15左右运行，错过后补跑；`journalctl -u makexrank-backup.service` 查看结果。备份目录700、文件600，不在网站或 GitHub。失败任务会保留 systemd/journal 错误状态，不声称已经接入微信/短信告警。

完整恢复验证只恢复到随机命名、撤销PUBLIC连接权限的临时数据库，比对账号/比赛/班级/学员/点名计数后删除临时副本；源备份保留，不覆盖生产。

目前保留所有旧备份，无自动删除。长期离机备份应复制到另一台设备或另一区域的私有加密存储；未配置前不能把同机备份当作异地灾备。不得把数据库/机密配置上传到公开GitHub或静态网页。
