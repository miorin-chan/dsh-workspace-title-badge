# 工作区菜单的桥接设计

## 问题

工作区名旁的省略号需要给出侧栏工作区「更多」里的全部操作，但不要删除，并且条目要随侧栏菜单变化。
直接把条目抄进插件会立刻过时：侧栏菜单由多个包各自贡献，还会随权限与桌面能力出现或消失。

## 侧栏菜单是什么

`@deepseek-ai/dsh-client-ui-workspace` 不渲染菜单条目，
它把工作区菜单声明为 `@deepseek-ai/dsh-client-ui-context-menu` 目标族 `workspace` 的结构化贡献：

| 贡献 | order | 来源 | 条目 |
| --- | --- | --- | --- |
| `workspace.rename` | 100 | ui-workspace | 重命名 |
| `open-in-app.workspace` | 200 | ui-open-in-app | 在文件管理器中显示（随桌面能力出现） |
| `workspace.delete` | 300 | ui-workspace | 删除工作区（danger，前置分隔线） |

客户端服务 `contextMenus.resolve({ kind: 'workspace', value })` 返回一个独立的 occurrence：
只读的 `MenuActionView[]`、`ready`、`select(id)` 与 `dispose()`。
视图 id 形如 `贡献 id/动作 id`（如 `workspace.delete/delete`），展示字段包括 label、
icon key、disabled、danger、separatorBefore、afterContent 与 children。
权限判断发生在各贡献的 `resolve()` 内，因此解析结果已经反映当前 peer 能做什么。

共享弹出层 `contextMenus.open()` 也会解析同一组贡献，但它没有排除单条贡献的参数。
自己照着数据渲染菜单是一途，但那会立刻偏离官方外观、键盘与焦点行为；更合适的做法是换一个目标族再委托回 `workspace`，
让共享层继续渲染，见下节。

## 桥接

插件声明自己的目标族 `dsh-session-workspace-label.workspace`，值为 `{ workspaceId, path, displayTitle }`（与侧栏一致），
并注册唯一一条贡献：

1. 省略号把该目标交给 `contextMenus.open()`。
2. 贡献的 `resolve()` 调 `contextMenus.resolve({ kind: 'workspace', value })`，等待 `ready`（预算 900ms，
   早于共享层 1000ms 的贡献超时），然后按贡献前缀 `workspace.delete/` 过滤，把其余视图原样转成菜单动作。
3. 每个叶子动作的 `run` 调内层 `select(id)`。
   重命名对话框、原生显示、子菜单、图标槽、快捷键、danger 样式与失败 toast 都由官方实现执行，桥接不复制任何一项。
4. 内层 occurrence 在菜单关闭或插件卸载时释放。
   共享层先释放外层 occurrence 再调用动作回调，所以释放放到微任务里，并用“已选择”标记避免在选择路径上提前释放。

结果：条目完全动态，另一个插件只要向 `workspace` 族注册贡献就会出现在这里；插件自己只维护一个过滤器和一个按钮。

删除是有意拿掉的：单列表模式没有工作区行，因此删除工作区要先切到「按工作区 / 按工作区树」，再用该行自己的菜单。
这样头部只保留非破坏性操作，删除仍在原本可见的位置。

## 触发按钮

按钮用 24px 命中区（与侧栏工作区行一致）和 16px 省略号图标，颜色取 `label-tertiary`，
悬停变 `label-primary` 并加 `interactive-bg-hover` 背景。
名字用 `label-secondary`，不再整体降透明度：12px 文字叠 60% 透明度在浅色底上低于 4.5:1。
名字与按钮之间放一条 1px 竖线，避免长名字的截断省略号与按钮图标被读成同一个“展开名字”手势。
名字上限 14em，窄窗口里先截断名字，而不是让按钮落进标题区的裁剪范围。

## 退化与升级复验点

- 没有 `contextMenus` 服务时只显示标签，不显示按钮。
- 解析失败、没有可用条目或 `ready` 超时：菜单为空或只剩已解析的条目，不报错、不刷控制台。
  900ms 预算晚于绝大多数贡献；更晚解析出的动作不会补进已打开的菜单，下次打开时出现。
- 侧栏若重命名 `workspace.delete` 贡献，删除条目会重新出现。
  这是升级复验点：检查 `dsh-client-ui-workspace` 的 `contextMenus.register` 调用，更新 `DELETE_CONTRIBUTION`。
- 若共享层把删除并入其他贡献，需要按动作 id 或展示字段收窄过滤器；不要按可见文字匹配（会随语言变化）。
- 若目标值增加字段（例如 `sessionId`），桥接原样透传，无需改动。

## 验证

夹具测试固定：目标族与贡献注册、删除过滤、选择委托、嵌套动作、关闭时释放、按钮显示条件、无障碍属性与锚点位置。
实机需要确认菜单与侧栏菜单外观一致、重命名对话框可打开、删除不出现，以及卸载后按钮与贡献一并消失。
