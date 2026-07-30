# MakeX Inspire 练习赛分析模块

这是 `feature/practice-inspire` 分支中提供给协作者的独立开发目录。

## 允许修改

- `src/features/practice-inspire/**`

## 不应修改

- `src/App.tsx`
- `src/App.module.css`
- `src/components/**`
- `src/services/**`
- `src/utils/**`
- 项目配置、部署配置及其他业务模块

如果模块需要接入主页面、增加共享依赖或调整公共类型，请先在 Pull Request 中说明，由仓库维护者完成接线。

## 开发入口

- 页面组件：`PracticeInspireWorkspace.tsx`
- 页面样式：`PracticeInspireWorkspace.module.css`
- 模块导出：`index.ts`

## 提交要求

1. 只在 `feature/practice-inspire` 分支开发。
2. 每次提交保持单一目的。
3. 提交前运行 `npm run build`。
4. 完成后提交 Pull Request，不直接修改 `main`。
