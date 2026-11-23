# @miorin/dsh-workspace-title-badge

[English](README.md)

**会话标题旁的工作区名，连同它自己的菜单。**

侧栏用单列表显示会话时，看不出一个会话属于哪个工作区。
本插件把工作区名放进会话头部，沿用侧栏的文件夹图标与默认名本地化，并用省略号或右键打开该工作区的操作，唯独不含**删除**。

需要 DeepSeek Harness 0.2.2-rc.3 或更新版本。

## 使用

- 单列表模式下，名字紧跟标题，排在其他头部操作之前。
- 悬停名字滑出省略号；点它或右键名字，打开该工作区的菜单。
- `default-workspace` 显示本地化默认名；改过名的工作区保留自己的标题。
- 按工作区分组时侧栏已经显示名字，标签自动退场。

## 限制

- 分组方式来自 ui-workspace 的持久化 store（`dsh.workspace.view.v5`），每秒轮询一次；
  读不到时标签**失效打开**，而不是消失。
- 菜单桥接侧栏的 `workspace` 目标族，并过滤掉 `workspace.delete` 贡献。
- 没有 `useContextMenu` 时，右键退回浏览器原生菜单；省略号不受影响。
- 不属于任何工作区的会话不显示标签。

## 安装

在新检出的目录中运行 `pnpm install --frozen-lockfile` 安装依赖并构建插件。
然后在 **插件** > **添加插件** 中选择该目录，或通过 `plugin_manager` 安装。
本插件属于 [`@miorin/dsh-atlas-workspace`](../dsh-atlas-workspace/README.zh.md) 聚合包；两者只能装一个。

[菜单设计](docs/workspace-menu.md) · [项目文档](docs/README.md)
