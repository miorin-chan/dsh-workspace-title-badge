# AGENTS.local

本文件补充 [通用规则](AGENTS.md)。
项目专属规则在其适用范围内优先。

## 范围与项目文档

在侧栏采用单列表时，于会话标题旁显示所属工作区。
本项目仍保持独立安装和启停，同时参与 `dsh-workspace-family` 聚合包；两者使用同一行 id，不能同时安装。

[README.md](README.md) 为英文用户说明，[README.zh.md](README.zh.md) 为中文版本。
[项目文档索引](docs/README.md) 指向行为说明、维护约束和验证入口。
设计与开发说明优先用中文。修改文案时同步维护八种 locale（`en zh ja de es fr pt ru`）。
新增设计记录放在 `docs/` 并登记到索引，发布时通过 `CHANGELOG.md` 记录变化。

## 工作区聚合

本插件属于 `dsh-workspace-family` 聚合包。
新增工作区相关能力时，同步更新聚合包的 `aggregate.yml` 与文档，并保持本插件的行 id 稳定。
聚合包与本插件不能同时安装。

## 结构

- `client.js` 是浏览器半：手写的 module-loader 产物，不经构建。
  改之前先读它顶部的机制说明（每个取数的来源与失效方式都写在那里）。
- `client.js` 的工作区菜单部分只为侧栏的 `workspace` 目标族做桥接：
  自己的目标族 + 一条贡献 + 一个省略号按钮与标签右键手势，没有第二份条目清单。
- `index.js` 是 Host 半，保持无副作用，只用于让 bundle 行被加载。
- `locale/*.json` 只放 Plugin Manager 读取的 `meta.title` / `meta.description`；
  悬停提示文案在 `client.js` 的 `LABELS` 里。
- `test/client.test.mjs` 用假的 `ctx` 与假窗口固定：注册的槽位与条目、分组/单列表两种显示判定、
  持久化 store 的两种包装与损坏值、无工作区/无标题的出口、默认工作区本地化名与文件夹图标、图标模块缺失时的退化、
  轮询跟随与卸载清理；菜单桥接的目标族与贡献注册、删除过滤、选择委托、嵌套动作、关闭时释放、按钮显示条件与锚点、
  无障碍属性；按钮默认收起、悬停/焦点/菜单打开时的展开规则、无 hover 设备常驻；右键手势与按钮绑定同一目标、
  `tabIndex: -1`、以及缺少菜单服务或 `useContextMenu` 时的退化。

## 实现

- 本项目独立成包、独立启用/停用；通过 `dsh-workspace-family` 聚合包组合时只插入同一行 id，不复制代码，
  也不要让别的插件 import 本包的 `client.js`。
- 显示位置只用公开面：`conversation.session.header.actions` 列表槽 + 标准 hook `useWorkspaces`；
  条目通过 `inject(sessionId)` 拿会话身份。
  列表按 `order` 升序紧跟标题渲染，条目必须用领先的负 `order`（快于 preset 标签的 `-10`）才能占住标题后第一位。
  不要读会话正文、不要猜 DOM。
- 名称与图标沿用侧栏的公开呈现：标题为 `default-workspace` 时取公共 locale 词条 `workspace.defaultName`，
  其余标题原样；文件夹图标取 `@deepseek-ai/dsh-client-ui-primitives` 的 `IconFolderCloseRegular`。
  两者都不可用时退化为纯标题文字，不报错、不隐藏。
  省略号图标优先用同一模块的 `IconEllipsisOutlineRegular`，缺失时用内联 SVG 三点。
- 分组方式不是公开 API：只读 `dsh.workspace.view.v5`（ui-workspace 的持久化视图 store），
  绝不写入；读不到时按“未知”处理并**失效打开**（显示），不要因为 DSH 改名而让功能静默消失。
- 所有访问都要 fail-safe：没有 hook、没有匹配工作区、没有标题、没有 `localStorage`、
  没有词典词条或图标模块时都保持可用或原样；不要为了显示而在控制台刷错误。
- 轮询只在 `apply` 的 `ctx.effect` 里注册，卸载时清掉定时器与 `storage` 监听；组件里不得自行订阅。
- 标签默认保持弱化、单行、可截断，不挤压标题与操作区。
  省略号按钮默认收起，悬停标签、按钮获得焦点或菜单打开时以 160ms 滑出；不再放垂直分割线。
  收起槽位用 `overflow: clip`（不要用 `hidden`，聚焦会把容器滚起来），按钮 `pointer-events: none`；
  没有 hover 能力时按钮常驻，避免菜单不可达。
  交互只有两个入口：名字旁 24px 的省略号按钮，以及标签上的右键手势。
  右键必须复用渲染器提供的 `useContextMenu` 的 `getTriggerProps`，传入与按钮相同的私有目标，
  并保持 `tabIndex: -1`（键盘入口是按钮）；不要手写 `onContextMenu` 或另开一套打开逻辑。
  两者都只打开侧栏工作区菜单的桥接，不导航、不改选中的工作区。
- 工作区菜单条目不在本插件里维护：它们来自 `contextMenus` 的 `workspace` 目标族贡献。
  桥接只做三件事——`resolve()` 该目标、过滤删除贡献、把叶子选择委托回 occurrence；不要复制条目标签、图标、
  权限判断或重命名对话框。
- 过滤删除用贡献前缀 `workspace.delete/`，不要用可见文案或 `danger` 字段（会因语言或未来条目误伤）。
- 菜单桥接的自定义目标族名、删除贡献名和 `contextMenus` 服务都是 DSH 内部依赖：
  变更时更新 `docs/workspace-menu.md` 的复验点，并保持“没有服务就只有标签”的退化。
- 图标是原创占位之外的成品图；改图标时保持 36×36、≤256 KiB，并同步 8 个 locale 的标题与描述。

将注册与清理放在 `apply` 的 `ctx.effect` 或 `ctx.on` 中，保持 factory 无副作用。
在客户端入口头部记录对 DSH 内部结构的依赖和退化行为。

## 版本与验证

主版本升级由用户决定，常规迭代沿用当前主版本。

- 在项目根运行 `node --test` 和 `node --check client.js && node --check index.js`。
- 在默认工作区根运行 `node tools/new-dsh-plugin/cli.mjs --check plugins/dsh-session-workspace-label`。
- 安装、卸载及实机验证使用一次性 profile。
  报告区分夹具测试和实机观察。
- 用 `docs/scripts/reflow md <path>` 重排修改过的英文 Markdown。
  命令需要 Python 3.11 或更新版本。
- 在项目根运行 `prek install`，之后提交时会自动重排暂存的 Markdown。
- 在 DSH 沙箱内提交时，用 `PREK_HOME="${TMPDIR:?}/prek-dsh" git commit -m "<commit message>"`，
  让 reflow 钩子照常运行，并把 `prek` 的缓存和日志写到可写的临时目录。

### 升级复验

DSH 升级后先跑 `node --test`，再在真实界面确认：

- 单列表模式下标签出现、文字正确；分组方式切回「按工作区 / 按工作区树」后消失。
- 标签紧跟在会话标题之后、其它头部操作（preset 名、任务、终端等）之前，而不是排在它们末尾；
  标题文字到文件夹图标只隔约一个标题区 gap（约 10px，`marginInlineStart: -8px` 抵消面包屑的 8px 右内边距），
  不要出现“内边距 + gap”的双重空隙。
- `default-workspace` 显示为当前语言的默认工作区名（如“默认工作区”）并带文件夹图标；改过名的工作区显示原名。
- 工作区改名后标签跟随；不属于工作区的会话没有标签。
- 省略号紧跟在名字之后；点按钮或右键名字打开的是同一个共享菜单（外观、键盘、焦点与侧栏一致），条目包含重命名、
  桌面端的在文件管理器中显示以及其它插件贡献的工作区操作，不包含删除工作区。
- 省略号平时收起，悬停名字或标签时滑出，鼠标离开、失焦且菜单关闭后收回；与名字之间没有分割线。
- 右键不额外制造 Tab 停靠点；标签自身 `tabIndex: -1`，键盘仍从省略号进入。
- 重命名菜单项能打开侧栏同一个重命名对话框；删除条目在任何位置都不出现；菜单关闭或插件卸载后没有残留的菜单 occurrence。
- 侧栏切换分组方式后，标签在一个轮询周期（约 1 秒）内更新，按钮与标签同时出现或消失。
- 若标签在任何分组方式下都出现，先查 `dsh.workspace.view.v5` 是否改名——这是失效打开，不是回归。
- 若删除条目重新出现，查 `dsh-client-ui-workspace` 是否改了 `workspace.delete` 贡献名，而不是放宽过滤条件。
- 若右键失效而省略号正常，查渲染器是否仍把 `useContextMenu` 作为标准 prop 绑定到 Slot 作用域；
  手势签名见 `dsh-client-ui-context-menu/src/client/trigger.ts`。
