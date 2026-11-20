# AGENTS.local

本文件补充 [通用规则](AGENTS.md)。项目专属规则在其适用范围内优先。

## 范围与项目文档

在侧栏采用单列表时，于会话标题旁显示所属工作区。本项目保持独立安装和启停。

[README.md](README.md) 为英文用户说明，[README.zh.md](README.zh.md) 为中文版本。
[项目文档索引](docs/README.md) 指向行为说明、维护约束和验证入口。
设计与开发说明优先用中文。修改文案时同步维护八种 locale（`en zh ja de es fr pt ru`）。
新增设计记录放在 `docs/` 并登记到索引，发布时通过 `CHANGELOG.md` 记录变化。

## 结构

- `client.js` 是浏览器半：手写的 module-loader 产物，不经构建。改之前先读它顶部的机制说明（每个取数的来源与失效方式都写在那里）。
- `index.js` 是 Host 半，保持无副作用，只用于让 bundle 行被加载。
- `locale/*.json` 只放 Plugin Manager 读取的 `meta.title` / `meta.description`；悬停提示文案在 `client.js` 的 `LABELS` 里。
- `test/client.test.mjs` 用假的 `ctx` 与假窗口固定：注册的槽位与条目、分组/单列表两种显示判定、持久化 store 的两种包装与损坏值、无工作区/无标题的出口、默认工作区本地化名与文件夹图标、图标模块缺失时的退化、轮询跟随与卸载清理。

## 实现

- 本项目独立成包、独立启用/停用：不要并进别的 bundle，也不要让别的插件 import 本包的 `client.js`。
- 显示位置只用公开面：`conversation.session.header.actions` 列表槽 + 标准 hook `useWorkspaces`；条目通过 `inject(sessionId)` 拿会话身份。列表按 `order` 升序紧跟标题渲染，条目必须用领先的负 `order`（快于 preset 标签的 `-10`）才能占住标题后第一位。不要读会话正文、不要猜 DOM。
- 名称与图标沿用侧栏的公开呈现：标题为 `default-workspace` 时取公共 locale 词条 `workspace.defaultName`，其余标题原样；文件夹图标取 `@deepseek-ai/dsh-client-ui-primitives` 的 `IconFolderCloseRegular`。两者都不可用时退化为纯标题文字，不报错、不隐藏。
- 分组方式不是公开 API：只读 `dsh.workspace.view.v5`（ui-workspace 的持久化视图 store），绝不写入；读不到时按“未知”处理并**失效打开**（显示），不要因为 DSH 改名而让功能静默消失。
- 所有访问都要 fail-safe：没有 hook、没有匹配工作区、没有标题、没有 `localStorage`、没有词典词条或图标模块时都保持可用或原样；不要为了显示而在控制台刷错误。
- 轮询只在 `apply` 的 `ctx.effect` 里注册，卸载时清掉定时器与 `storage` 监听；组件里不得自行订阅。
- 标签是展示物：不加点击、导航或菜单；视觉上保持弱化、单行、可截断，不挤压标题与操作区。
- 图标是原创占位之外的成品图；改图标时保持 36×36、≤256 KiB，并同步 8 个 locale 的标题与描述。

将注册与清理放在 `apply` 的 `ctx.effect` 或 `ctx.on` 中，保持 factory 无副作用。
在客户端入口头部记录对 DSH 内部结构的依赖和退化行为。

## 版本与验证

主版本升级由用户决定，常规迭代沿用当前主版本。

- 在项目根运行 `node --test` 和 `node --check client.js && node --check index.js`。
- 在默认工作区根运行 `node tools/new-dsh-plugin/cli.mjs --check plugins/dsh-session-workspace-label`。
- 安装、卸载及实机验证使用一次性 profile。报告区分夹具测试和实机观察。
- 用 `docs/scripts/reflow md <path>` 重排修改过的英文 Markdown。命令需要 Python 3.11 或更新版本。
- 在项目根运行 `prek install`，之后提交时会自动重排暂存的 Markdown。

### 升级复验

DSH 升级后先跑 `node --test`，再在真实界面确认：

- 单列表模式下标签出现、文字正确；分组方式切回「按工作区 / 按工作区树」后消失。
- 标签紧跟在会话标题之后、其它头部操作（preset 名、任务、终端等）之前，而不是排在它们末尾；标题文字到文件夹图标只隔约一个标题区 gap（约 10px，`marginInlineStart: -8px` 抵消面包屑的 8px 右内边距），不要出现“内边距 + gap”的双重空隙。
- `default-workspace` 显示为当前语言的默认工作区名（如“默认工作区”）并带文件夹图标；改过名的工作区显示原名。
- 工作区改名后标签跟随；不属于工作区的会话没有标签。
- 侧栏切换分组方式后，标签在一个轮询周期（约 1 秒）内更新。
- 若标签在任何分组方式下都出现，先查 `dsh.workspace.view.v5` 是否改名——这是失效打开，不是回归。
