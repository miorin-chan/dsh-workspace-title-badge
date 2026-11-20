# dsh-session-workspace-label

Shows the open session's **workspace name** beside its title while the sidebar lists sessions in one flat list.

The sidebar's flat grouping mixes sessions from every workspace and draws no workspace header,
so the name of the workspace a conversation belongs to is not visible anywhere.
This plugin puts it in the conversation header — muted, on one line,
clipped when long — using the sidebar's own presentation: the shared folder glyph and,
for the first-use workspace, the same localized default name.
It leaves the header untouched when the sidebar already names its groups.

| Sidebar grouping | Before | With this plugin |
| --- | --- | --- |
| In one list | header shows the session title only | the workspace name with its folder icon sits immediately after the title |
| By workspace / workspace tree | the sidebar names each workspace | nothing changes |
| Session outside every workspace | — | nothing is added |
| First-use workspace titled `default-workspace` | the raw directory name | the localized default name, e.g. **Default workspace** / **默认工作区** |
| Session in a workspace named by its path | the path is long | the title is used; the directory basename is the fallback |

## Requirements

- DeepSeek Harness 0.2.2-rc.3 or newer.
  The conversation header must declare the `conversation.session.header.actions` slot
  and the workspace UI must provide the `useWorkspaces` standard hook; both ship in the default Web app.
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
- Renaming a workspace updates the label; a session that moves between workspaces follows it.
- Switch the sidebar to **By workspace** or **By workspace tree** and the label disappears,
  because the sidebar shows the name already.

## Limitations

- The sidebar's grouping mode is not exposed to client plugins.
  The plugin reads ui-workspace's persisted view store (`dsh.workspace.view.v5`) read-only and watches it
  with a one-second poll, so a mode switch reaches the label within about a second.
  If a DSH release renames that store or the browser denies storage access, the label **fails open**
  and shows in every grouping mode instead of silently disappearing.
- The label borrows the sidebar's shared icon module and the common locale entry `workspace.defaultName`.
  If a future DSH release removes either, the label falls back to the stored title
  and the text-only form instead of failing.
- The label is decoration: it is not a button, does not open the workspace, and adds no menu entry.
- The flat list itself is untouched; the label never appears in the sidebar list.
- Sessions outside every workspace (the ungrouped bucket) get no label rather than a generic name.

## Unload

Disable the bundle in **Plugins**. The header entry, the poll and the storage listener are removed;
nothing is written to storage or to the workspace view store.
