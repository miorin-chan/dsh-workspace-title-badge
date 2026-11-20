# dsh-session-workspace-label

Shows the open session's **workspace name** beside its title while the sidebar lists sessions in one flat list,
with an ellipsis that slides out on hover, or a right-click, opening that workspace's sidebar actions menu —
everything except **Delete**.

The sidebar's flat grouping mixes sessions from every workspace and draws no workspace header,
so the name of the workspace a conversation belongs to is not visible anywhere.
This plugin puts it in the conversation header — muted, on one line,
clipped when long — using the sidebar's own presentation: the shared folder glyph and,
for the first-use workspace, the same localized default name.
The ellipsis beside the name and a right-click on it open the same entries the sidebar's workspace "..." menu offers,
including actions contributed by other plugins, and leave **Delete** out.
The ellipsis stays out of the way until the name is hovered.
It leaves the header untouched when the sidebar already names its groups.

| Sidebar grouping | Before | With this plugin |
| --- | --- | --- |
| In one list | header shows the session title only | the workspace name with its folder icon sits immediately after the title; hovering it slides out an ellipsis |
| By workspace / workspace tree | the sidebar names each workspace | nothing changes |
| Session outside every workspace | — | nothing is added |
| First-use workspace titled `default-workspace` | the raw directory name | the localized default name, e.g. **Default workspace** / **默认工作区** |
| Session in a workspace named by its path | the path is long | the title is used; the directory basename is the fallback |

## Requirements

- DeepSeek Harness 0.2.2-rc.3 or newer.
  The conversation header must declare the `conversation.session.header.actions` slot,
  the workspace UI must provide the `useWorkspaces` standard hook,
  and the context-menu plugin must provide the `workspace` target family
  and the `useContextMenu` gesture factory; all ship in the default Web app.
  Without the gesture factory, the ellipsis still opens the menu and right-click stays with the browser.
- Works in the Desktop window and in the browser page.

## Install

Install this directory as a local bundle: **Plugins** > **Add plugin**,
or let the agent run `install_bundle` on this directory.
The plugin appears in **Plugins** as **Workspace name in the session header** / **会话头部显示工作区名**.

## Use

- Open a conversation whose session belongs to a workspace while the sidebar is in **In one list** mode.
  The workspace name appears immediately after the title, before the other header actions,
  preceded by the same closed-folder glyph the sidebar uses.
- A workspace still titled `default-workspace` is labeled with the same localized default name
  as the sidebar (**Default workspace**, **默认工作区**, …); a renamed workspace keeps its own title.
- Hover the name for the tooltip **Workspace: <name>**.
- Hover the name to slide out the ellipsis, then press it — or right-click the name — to open the workspace's actions.
  The menu is the sidebar's menu, not a copy: **Rename**, the native **Show in Finder** entry
  when the Desktop app offers one, and any workspace action another plugin contributes.
  **Delete workspace** is the one entry this plugin removes: it stays in the sidebar's own workspace menu,
  reachable after switching the sidebar to **By workspace** or **By workspace tree**.
- Renaming a workspace updates the label; a session that moves between workspaces follows it.
- Switch the sidebar to **By workspace** or **By workspace tree** and the label and its menu controls disappear,
  because the sidebar shows the name already.

## How the menu stays official

ui-workspace declares its workspace menu as structured context-menu contributions to the `workspace` target family,
so the entries do not live in a component this plugin could call.
The plugin declares its own target family and contributes one bridge entry.
Opening from the ellipsis or a right-click resolves the sidebar's `workspace` target
through the public `contextMenus.resolve()` API, forwards every action except the `workspace.delete` contribution,
and delegates selection back to that occurrence.
The right-click reuses the renderer's official `useContextMenu` trigger rather
than a local handler, so both gestures bind the same target.
The shared popup renders the rows, icons, shortcut hints, separators, danger styling,
submenus, permission filtering, dialogs, and failure feedback; the plugin never copies or reimplements them.
See [the design note](docs/workspace-menu.md).

## Limitations

- The sidebar's grouping mode is not exposed to client plugins.
  The plugin reads ui-workspace's persisted view store (`dsh.workspace.view.v5`) read-only and watches it
  with a one-second poll, so a mode switch reaches the label within about a second.
  If a DSH release renames that store or the browser denies storage access, the label **fails open**
  and shows in every grouping mode instead of silently disappearing.
- The label borrows the sidebar's shared icon module and the common locale entry `workspace.defaultName`.
  If a future DSH release removes either, the label falls back to the stored title
  and the text-only form instead of failing.
- The menu bridge depends on the sidebar keeping the `workspace` target family
  and calling its destructive contribution `workspace.delete`.
  If a DSH release renames that contribution, **Delete** reappears until the plugin's filter is updated;
  nothing else changes.
- The bridge waits up to 900ms for the sidebar's providers, just under the shared popup's own budget.
  An action that resolves later appears the next time the menu opens.
- The button appears only where the label appears.
  When the current peer may perform no workspace action, the menu opens empty rather than hiding the button.
- The right-click gesture uses the renderer's `useContextMenu` binding.
  If a DSH release stops binding it, right-click falls back to the browser menu while the ellipsis keeps working.
- Devices without hover keep the ellipsis visible, so the menu stays reachable.
- Sessions outside every workspace (the ungrouped bucket) get no label and no menu.

## Unload

Disable the bundle in **Plugins**.
The header entry, the menu bridge, the poll and the storage listener are removed;
nothing is written to storage or to the workspace view store.
