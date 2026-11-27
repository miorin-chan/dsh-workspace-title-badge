# 项目文档

- [产品设计](../DESIGN.md)：用户问题、交互体验、降级边界与成功标准。
- [英文说明](../README.md) · [中文说明](../README.zh.md)：使用范围与安装方式。
- [工作区菜单的桥接设计](workspace-menu.md)：`workspace` 目标族桥接、
  `workspace.delete/` 过滤与 `useContextMenu` 退化边界。
- [实现约束与验证步骤](../AGENTS.local.md)

## 分组读取边界

插件每秒轮询 `ui-workspace` 的持久化存储键 `dsh.workspace.view.v5` 以判断当前列表分组模式；
当该键无法读取时按 **失效打开** 策略继续显示标签，而非隐藏功能。
