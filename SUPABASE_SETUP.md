# Supabase Setup

这套站点现在分成两部分：

1. 比赛数据同步
2. 用户名密码登录与管理员分配账号

## 1. 基础环境变量

先按 [.env.example](/D:/Codex/competitive-ranking-board/.env.example) 配置：

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_COMPETITIONS_TABLE`
- `VITE_SUPABASE_PROFILE_TABLE`
- `VITE_AUTH_USERNAME_DOMAIN`
- `VITE_SUPABASE_AUTH_FUNCTION`

默认用户名会映射成内部邮箱：

- 用户名 `supergary`
- 实际登录邮箱 `supergary@makexrank.app`

用户前台永远只看到用户名，不需要输入邮箱。

## 2. 执行数据库 SQL

在 Supabase SQL Editor 里依次运行：

1. [supabase/schema.sql](/D:/Codex/competitive-ranking-board/supabase/schema.sql)
2. [supabase/auth_profiles.sql](/D:/Codex/competitive-ranking-board/supabase/auth_profiles.sql)

## 3. 关闭邮箱确认

到：

- `Authentication -> Providers -> Email`

确认：

- `Enable Email provider` 已开启
- `Confirm Email` 已关闭

这样用户名账号就不会再依赖邮箱确认。

## 4. 部署 Edge Function

这个函数负责：

- 创建首个管理员
- 由管理员继续分配用户名账号

函数目录：

- [supabase/functions/manage-users/index.ts](/D:/Codex/competitive-ranking-board/supabase/functions/manage-users/index.ts)

因为首个管理员初始化是匿名调用，所以这个函数配置了：

- [supabase/config.toml](/D:/Codex/competitive-ranking-board/supabase/config.toml)

部署命令：

```bash
supabase functions deploy manage-users
```

如果你的 CLI 没有自动带上项目里的 `config.toml`，也可以显式部署为：

```bash
supabase functions deploy manage-users --no-verify-jwt
```

## 5. 配置函数环境变量

在 Supabase 项目里给 Edge Function 配置这些环境变量：

- `PROFILE_TABLE=user_profiles`
- `AUTH_USERNAME_DOMAIN=makexrank.app`

`SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY` 由 Supabase Functions 运行环境提供。

## 6. 重启前端

改完 `.env` 后，重启本地前端预览或重新构建：

```bash
npm run build
```

## 7. 成功后的效果

完成以上步骤后：

- 首个管理员可以在网页里直接创建
- 管理员可以继续分配用户名和密码
- 用户登录时只输入用户名和密码
- 不需要邮箱验证
- 用户资料保存在 `user_profiles`
