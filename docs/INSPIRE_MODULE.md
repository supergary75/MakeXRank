# Inspire 练习赛模块协作说明

入口四使用独立仓库作为 Git 子模块：

- 仓库：`https://github.com/BK-Y/ins_training_tool.git`
- 本地目录：`modules/ins_training_tool`
- 跟踪分支：`master`
- 主站访问路径：`/MakeXRank/inspire/index.html`

## Supabase 共享同步

嵌入主站的 Inspire 模块会复用 MakeXRank 登录会话，并把完整业务数据保存到 `inspire_sync` 表。首次使用时，需要在 Supabase SQL Editor 执行 `supabase/inspire_sync.sql`。生产构建会自动向模块注入项目地址、公开密钥和表名；缺少主站配置或未登录时，模块会自动保留本地存储模式。

## 教练开发

教练只需要克隆并维护独立仓库：

```bash
git clone https://github.com/BK-Y/ins_training_tool.git
cd ins_training_tool
git checkout master
```

修改完成后提交并推送到该仓库，不需要获得 MakeXRank 主仓库的写入权限。

## MakeXRank 拉取教练的最新版本

在 MakeXRank 根目录执行：

```bash
npm run update:inspire
npm run build
```

然后提交更新后的子模块指针。主站部署时会自动初始化子模块，并把
`modules/ins_training_tool/src` 同步到 `dist/inspire`。

## 首次克隆 MakeXRank

推荐直接包含子模块：

```bash
git clone --recurse-submodules https://github.com/supergary75/MakeXRank.git
```

如果已经克隆过 MakeXRank：

```bash
git submodule update --init --recursive
```
