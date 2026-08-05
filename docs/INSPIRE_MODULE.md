# Inspire 练习赛模块协作说明

入口四使用独立仓库作为 Git 子模块：

- 仓库：`https://github.com/BK-Y/ins_training_tool.git`
- 本地目录：`modules/ins_training_tool`
- 跟踪分支：`master`
- 主站访问路径：`/MakeXRank/inspire/index.html`

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
