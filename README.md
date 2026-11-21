# dsh-workspace-title-badge

[简体中文](README.zh.md)

**The Workspace's name beside the session title, with its own menu.**

When the sidebar lists Sessions in one flat list, nothing says which Workspace a conversation belongs to.
This bundle puts the name in the conversation header, using the sidebar's folder glyph and default-name localization,
and opens that Workspace's actions from an ellipsis or a right-click — without **Delete**.

Requires DeepSeek Harness 0.2.2-rc.3 or newer.

## Use

- In flat-list mode the name follows the title, before the other header actions.
- Hover the name to slide out the ellipsis; click it or right-click the name to open the Workspace's menu.
- `default-workspace` gets the localized default name; renamed Workspaces keep their title.
- Grouped modes already name each Workspace, so the label steps aside.

## Limits

- Grouping mode comes from ui-workspace's persisted store (`dsh.workspace.view.v5`), polled once per second;
  if it cannot be read, the label fails open instead of disappearing.
- The menu is a bridge to the sidebar's `workspace` target family, filtered to leave out `workspace.delete`.
- Without `useContextMenu`, right-click falls back to the browser; the ellipsis still works.
- Sessions outside every Workspace get no label.

## Install

**Plugins** > **Add plugin**, or install this directory with `plugin_manager`.
This bundle is part of [`dsh-workspace-atlas`](../dsh-workspace-atlas/README.md); install either one, never both.

[Menu design](docs/workspace-menu.md) · [Project documentation](docs/README.md)
