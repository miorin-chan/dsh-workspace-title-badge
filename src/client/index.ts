/**
 * Browser half of `dsh-workspace-title-badge`, built from this source by
 * `node scripts/build.mjs` into the committed `client.js`.
 *
 * The sidebar's "in one list" grouping mixes sessions from every Workspace and
 * draws no Workspace header; the grouped modes name each Workspace instead.
 * This module puts the open Session's Workspace name immediately after the
 * Session title in the conversation header, and only while the sidebar lists
 * sessions flat. An ellipsis button beside that name opens the sidebar
 * Workspace's own "More" menu without its delete action; right-clicking the
 * name opens the very same menu.
 *
 * Seam: the conversation header declares the public
 * `conversation.session.header.actions` list. An entry there receives the
 * Session scope id as the first argument of its `inject` factory, and the
 * renderer binds the standard `useWorkspaces` selector hook at the render
 * position (ui-workspace provides it), so the workspace lookup and the rename
 * follow-up need no private access. The renderer also binds the standard
 * `useContextMenu` gesture factory (ui-context-menu provides it): its
 * `getTriggerProps` returns the same pointer and keyboard binding the sidebar
 * workspace row spreads, so right-clicking the name reuses the official
 * trigger instead of a local `onContextMenu`. The list renders ascending by
 * `order`, right after the title, so the entry holds a leading negative order:
 * it must precede the preset label (-10), which otherwise takes the spot
 * beside the title.
 *
 * The label reuses the sidebar's presentation: the first-use Workspace's
 * stored title (`default-workspace`) becomes the shared localized default name
 * from the common locale dictionary (`workspace.defaultName`), every other
 * title stays verbatim, and the shared icon set supplies the closed folder
 * glyph. Both are optional and degrade to the plain title. The ellipsis button
 * stays collapsed until the label is hovered, the button has keyboard focus, or
 * its menu is open; devices without hover keep it visible, so the only pointer
 * entry does not disappear there.
 *
 * The menu is not a component of the sidebar: ui-workspace declares it as
 * structured contributions to the shared context-menu target family
 * `workspace`, so the entries, their order, icons, separators, permission
 * checks, dialogs and failure toasts all belong to the contributing plugins.
 * Copying that list here would rot. Instead this plugin declares its own target
 * family and contributes one bridge entry: opening from the header (button or
 * right-click) resolves the sidebar's `workspace` target through
 * `ctx.contextMenus.resolve()`, forwards every action except the
 * `workspace.delete` contribution, and delegates selection back to that
 * occurrence. The shared popup then draws the rows itself, so the menu stays
 * official and dynamically gains contributions from any other plugin. The
 * bridge is read-only: it never registers, mutates or dismisses the sidebar's
 * own entries.
 *
 * The grouping mode is the one exception: ui-workspace keeps it in a browser
 * store persisted as `dsh.workspace.view.v5`, and no client service exposes
 * it. This module reads that key read-only — never writes it — and watches it
 * with a slow poll plus the cross-document `storage` event, so an in-page
 * toggle takes at most one poll to reach the label.
 *
 * Fail-safety, in this order:
 * - A missing key is the shipped default (`workspace`, grouped): the label
 *   stays hidden on a fresh browser that never changed the mode.
 * - An unreadable value (storage denied, a renamed store, unexpected JSON)
 *   is `unknown` and fails open: the label shows rather than silently
 *   disappearing, so the context survives a DSH upgrade.
 * - No standard hook, no matching Workspace, no title, or an empty path
 *   renders nothing at all and leaves the header exactly as DSH draws it.
 * - No context-menu service leaves the label a plain display label: the button
 *   is omitted rather than opening a broken popup. An empty resolved menu still
 *   opens the shared popup empty, matching how the sidebar treats a provider
 *   that offers no action.
 * - A shell that binds no `useContextMenu` factory keeps the button working
 *   but leaves right-click to the browser; the gesture is additive, not a
 *   second menu implementation.
 *
 * Every listener and the poll are registered inside `ctx.effect` and removed
 * on unload with the slot entry.
 */

import * as React from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { WorkspaceId, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { BuiltInLocaleId, LocaleId } from '@deepseek-ai/dsh-client-locale/client'
import type {
  ContextMenus,
  ContextMenuTarget,
  ContextMenuTargetMap,
  ContextMenuTriggerProps,
  MenuAction,
  MenuActionView,
  MenuPoint,
  MenuResolution,
} from '@deepseek-ai/dsh-client-ui-context-menu/client'
import type { ConversationHeaderActionOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { IconProps } from '@deepseek-ai/dsh-client-ui-primitives'
// Side-effect type imports: they load the declaration merges behind the
// renderer's `ctx.slots` service and ui-workspace's `workspace` menu target.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { ComposedProps, LocaleDictOf, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** The locale namespace this entry owns. Declared here so its dictionary keys are typed. */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'dsh-workspace-title-badge': 'hint' | 'menu'
  }
}

/**
 * This plugin's private context-menu target family: the shared popup captures
 * it, then re-resolves the sidebar's `workspace` family from it.
 */
declare module '@deepseek-ai/dsh-client-ui-context-menu/client' {
  interface ContextMenuTargetMap {
    'dsh-workspace-title-badge.workspace': {
      readonly workspaceId: WorkspaceId
      readonly path: string
      readonly displayTitle: string
    }
  }
}

const NS = 'dsh-workspace-title-badge' as const
const SLOT = 'conversation.session.header.actions' as const
const ENTRY_ID = 'workspace-label'
/** ui-workspace's browser store for the session-list grouping mode. */
const VIEW_STORE_KEY = 'dsh.workspace.view.v5'
/** The store's shipped default; a missing key means the mode was never changed. */
const DEFAULT_GROUP_BY = 'workspace' as const
/**
 * The directory name the first-use Workspace keeps on disk and in its
 * stored title; the sidebar labels that title as the default Workspace.
 */
const DEFAULT_WORKSPACE_TITLE = 'default-workspace'
/** Common locale key behind the sidebar's localized default name. */
const DEFAULT_WORKSPACE_NAME_KEY = 'workspace.defaultName' as const
/** Grouping modes ui-workspace persists, plus the fail-open `unknown` read. */
const GROUP_BY_VALUES = ['flat', 'workspace', 'workspace-tree'] as const
type GroupBy = (typeof GROUP_BY_VALUES)[number] | 'unknown'
/** Read-only, so a slow cadence is enough; the label is decoration, not state. */
const POLL_MS = 1000
const STABLE_EMPTY_ITEMS: readonly WorkspaceView[] = []
/**
 * The actions list sorts ascending and renders right after the title. The
 * preset label holds -10 as the first static context, so a lower order is
 * what keeps the workspace name literally next to the title.
 */
const LEADING_ORDER = -20
/** The context-menu target family the sidebar's Workspace entries use. */
const WORKSPACE_TARGET = 'workspace' as const
/** Our own family: every activation bridges the Workspace family through it. */
const MENU_TARGET = 'dsh-workspace-title-badge.workspace' as const
/**
 * Contribution prefix of the sidebar's destructive entry. Action view ids
 * are `workspace.delete/<action id>`; the contribution stays the stable
 * unit, so a rename of its single action does not leak it through.
 */
const DELETE_CONTRIBUTION = 'workspace.delete/'
/**
 * The shared popup waits for every contribution before opening; the menu
 * budget is 1000ms. Return what has resolved shortly before that deadline
 * so a slow provider cannot turn our bridge into a timeout notice.
 */
const MENU_READY_BUDGET_MS = 900

const LABELS: Record<BuiltInLocaleId, LocaleDictOf<typeof NS>> & Record<LocaleId, LocaleDictOf<typeof NS>> = {
  en: { hint: 'Workspace: {workspace}', menu: 'Workspace actions for {workspace}' },
  zh: { hint: '工作区：{workspace}', menu: '工作区操作：{workspace}' },
  ja: { hint: 'ワークスペース：{workspace}', menu: 'ワークスペースの操作：{workspace}' },
  de: { hint: 'Arbeitsbereich: {workspace}', menu: 'Aktionen für {workspace}' },
  es: { hint: 'Espacio de trabajo: {workspace}', menu: 'Acciones de {workspace}' },
  fr: { hint: 'Espace de travail : {workspace}', menu: 'Actions de {workspace}' },
  pt: { hint: 'Espaço de trabalho: {workspace}', menu: 'Ações de {workspace}' },
  ru: { hint: 'Рабочая область: {workspace}', menu: 'Действия с {workspace}' },
}

/**
 * One line with the folder glyph and a clipped name, mirroring the
 * sidebar's Workspace row but staying quiet in the title-adjacent band.
 * The breadcrumb title carries 8px of trailing padding before the cluster
 * gap, so the label pulls back by that same 8px: it then sits one cluster
 * gap (~10px) from the title text, close to the gap between actions,
 * instead of reading as a separate block 18px away.
 */
const STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  minWidth: 0,
  verticalAlign: 'middle',
  fontSize: '12px',
  lineHeight: '1.4',
  color: 'var(--dsw-alias-label-secondary)',
  marginInlineStart: '-8px',
}

const ICON_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  flex: 'none',
}

const TEXT_STYLE: React.CSSProperties = {
  minWidth: 0,
  // The title row clips trailing actions on a narrow window; a shorter cap
  // lets the name truncate before the menu button reaches that edge.
  maxWidth: '14em',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

/**
 * The button's slot collapses to nothing at rest, then reveals itself over
 * the header's free space: the actions strip follows the title, so the
 * reveal consumes the row's slack instead of moving the title. The width
 * and the start margin animate together so the gap after the name closes
 * with the button; `overflow: clip` cuts the button mid-slide.
 */
const MENU_SLOT_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  flex: 'none',
  // `clip` (not `hidden`) keeps the wrapper from becoming a scroll
  // container that focusing the collapsed button could scroll.
  overflow: 'clip',
  height: '24px',
  width: 0,
  marginInlineStart: '-4px',
  transition: 'width 160ms ease, margin-inline-start 160ms ease',
}

const MENU_SLOT_REVEALED_STYLE: React.CSSProperties = {
  ...MENU_SLOT_STYLE,
  width: '24px',
  marginInlineStart: 0,
}

/**
 * 24px matches the sidebar's Workspace action target. The glyph is one size
 * smaller than the row's so the control still sits inside the header's
 * title band; the hit box does not shrink with it. The button slides out
 * from under the name rather than fading in place.
 */
const MENU_BUTTON_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: 'none',
  width: '24px',
  height: '24px',
  padding: 0,
  border: 0,
  borderRadius: 'var(--dsw-radius-md)',
  background: 'transparent',
  color: 'var(--dsw-alias-label-tertiary)',
  cursor: 'pointer',
  opacity: 0,
  transform: 'translateX(-10px)',
  pointerEvents: 'none',
  transition: 'opacity 120ms ease, transform 160ms ease, background-color 120ms ease, color 120ms ease',
}

const MENU_BUTTON_REVEALED_STYLE: React.CSSProperties = {
  ...MENU_BUTTON_STYLE,
  opacity: 1,
  transform: 'none',
  pointerEvents: 'auto',
}

const MENU_BUTTON_HOVER_ACCENTS: React.CSSProperties = {
  background: 'var(--dsw-alias-interactive-bg-hover)',
  color: 'var(--dsw-alias-label-primary)',
}

/** The shared icon component shape used by the label and its button. */
type IconComponent = React.FunctionComponent<IconProps>

/**
 * The module-table icon set, as this module reads it. The package is optional
 * in the shell, so every lookup degrades to text or to the inline glyph.
 * Internal shape, verified against 0.2.2-rc.5.
 */
interface SharedIconSet {
  readonly IconFolderCloseRegular?: unknown
  readonly IconEllipsisOutlineRegular?: unknown
}

/**
 * One node of ui-workspace's persisted view store (`dsh.workspace.view.v5`),
 * whatever wrapper the browser stored it in; only `groupBy` is read.
 * Internal shape, verified against 0.2.2-rc.5.
 */
interface PersistedViewNode {
  readonly groupBy?: unknown
}

/** The menu target this plugin contributes: the sidebar Workspace identity. */
type MenuTarget = Extract<ContextMenuTarget, { kind: typeof MENU_TARGET }>

/** The injected share of one header entry, before the renderer binds its hooks. */
interface LabelInjected {
  readonly sessionId: string
  readonly requestMenu: (target: MenuTarget, point: MenuPoint) => void
  readonly closeMenu: () => void
  readonly menuAlwaysVisible: boolean
  readonly hooks: {
    readonly flatSidebar: Signal<GroupBy>
    readonly menuReady: Signal<boolean>
    readonly menuActive: Signal<ContextMenuTarget | null>
  }
}

/** Complete props of the header entry: framework shares, this entry's inject, and locale. */
type LabelProps = ComposedProps<
  typeof SLOT,
  string,
  never,
  undefined,
  LabelInjected,
  never,
  typeof NS
> & ConversationHeaderActionOwnerProps

/** A minimal observable: the renderer binds it into a selector hook. */
interface Signal<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
  set(next: T): void
}

/** Selection bookkeeping shared by one bridged menu occurrence. */
interface BridgeState {
  readonly inner: MenuResolution
  selected: boolean
}

const browserWindow = (): Window | undefined => (typeof window === 'undefined' ? undefined : window)

/** Last path segment, for a Workspace whose title is empty. */
const basename = (path: unknown): string => {
  if (typeof path !== 'string') return ''
  const parts = path.split(/[\\/]/).filter((part) => part !== '')
  return parts.length === 0 ? '' : parts[parts.length - 1]
}

/** Is this value one of the grouping modes ui-workspace persists? */
const isGroupBy = (value: unknown): value is GroupBy => GROUP_BY_VALUES.some((mode) => mode === value)

/** Narrow one JSON value to the persisted store node shape this module reads. */
const isPersistedViewNode = (value: object): value is PersistedViewNode => 'groupBy' in value

/** Is this value a shared icon component? */
const isIconComponent = (value: unknown): value is IconComponent => typeof value === 'function'

/** Find the grouping mode in the persisted store, whatever wrapper it uses. */
const findGroupBy = (root: unknown): GroupBy | undefined => {
  const queue: { readonly value: unknown; readonly depth: number }[] = [{ value: root, depth: 0 }]
  while (queue.length > 0) {
    const head = queue.shift()
    if (head === undefined) break
    const { value, depth } = head
    if (value === null || typeof value !== 'object' || depth > 4) continue
    if (isPersistedViewNode(value) && isGroupBy(value.groupBy)) return value.groupBy
    // Any stored wrapper (a zustand persist envelope, a versioned state) is
    // walked until the mode shows up; only a recognized mode is ever read.
    for (const child of Object.values(value as Readonly<Record<string, unknown>>)) {
      queue.push({ value: child, depth: depth + 1 })
    }
  }
  return undefined
}

/**
 * Read the sidebar's grouping mode.
 * @param storage - the page's Storage, or undefined when it cannot be read.
 * @returns the mode, or `unknown` when the persisted state cannot be read.
 */
const readGroupBy = (storage: Storage | undefined): GroupBy => {
  if (storage === null || storage === undefined) return 'unknown'
  let raw: string | null
  try {
    raw = storage.getItem(VIEW_STORE_KEY)
  } catch {
    return 'unknown'
  }
  // No key yet: the browser never changed the shipped default.
  if (raw === null) return DEFAULT_GROUP_BY
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return 'unknown'
  }
  return findGroupBy(parsed) ?? 'unknown'
}

const readStorage = (): Storage | undefined => {
  try {
    return browserWindow()?.localStorage ?? undefined
  } catch {
    return undefined
  }
}

/** A minimal observable: the renderer binds it into a selector hook. */
const createSignal = <T>(initial: T): Signal<T> => {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => value,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    set: (next) => {
      if (next === value) return
      value = next
      for (const listener of [...listeners]) {
        try {
          listener()
        } catch (error) {
          console.error(`${NS}: a label subscriber failed`, error)
        }
      }
    },
  }
}

/** The Workspace accounting for one Session, if any. */
const findWorkspace = (
  items: readonly WorkspaceView[] | undefined,
  sessionId: SessionId | string,
): WorkspaceView | undefined => {
  if (!Array.isArray(items)) return undefined
  return items.find((item) => {
    if (item === null || typeof item !== 'object') return false
    const sessionIds: readonly SessionId[] = Array.isArray(item.sessionIds) ? item.sessionIds : []
    return sessionIds.some((id) => id === sessionId)
  })
}

/**
 * The name the sidebar shows for a Workspace: the localized default name
 * for the first-use Workspace, its own title otherwise, and the directory
 * basename when the title is empty. A missing dictionary entry leaves the
 * stored title in place rather than showing a raw locale key.
 */
const workspaceLabel = (workspace: WorkspaceView | undefined, defaultName: string): string => {
  if (workspace === undefined) return ''
  if (typeof workspace.title === 'string' && workspace.title.trim() !== '') {
    const title = workspace.title.trim()
    return title === DEFAULT_WORKSPACE_TITLE && defaultName !== ''
      ? defaultName
      : title
  }
  return basename(workspace.path)
}

/** Resolve the shared default name; the key itself means it was not registered. */
const resolveDefaultName = (t: TranslateNS<typeof NS>): string => {
  const translated = t(DEFAULT_WORKSPACE_NAME_KEY)
  return typeof translated === 'string' && translated !== DEFAULT_WORKSPACE_NAME_KEY
    ? translated
    : ''
}

/** Is this resolved view the sidebar's destructive Workspace entry? */
const isDeleteView = (view: MenuActionView): boolean => typeof view?.id === 'string'
  && view.id.startsWith(DELETE_CONTRIBUTION)

/**
 * Project one resolved sidebar view onto the action the shared popup
 * accepts. Every presentation field is forwarded unchanged — the popup's
 * `contextMenu.icon` slot, shortcut catalog, danger and submenu styling
 * then do exactly what they do for the sidebar. Leaf actions delegate
 * selection back to the sidebar occurrence instead of reimplementing it.
 * @param view - one immutable presentation from `resolve()`.
 * @param state - the sidebar occurrence and whether a leaf was chosen.
 */
const bridgeAction = (view: MenuActionView, state: BridgeState): MenuAction => {
  const icon = view.icon !== undefined ? { icon: { ...view.icon } } : {}
  const children = view.children
  const run = Array.isArray(children)
    ? { children: children.map((child) => bridgeAction(child, state)) }
    : {
        run: () => {
          state.selected = true
          state.inner.select(view.id)
        },
      }
  return {
    id: view.id,
    label: view.label,
    ...(view.commandId !== undefined ? { commandId: view.commandId } : {}),
    ...(view.disabled !== undefined ? { disabled: view.disabled } : {}),
    ...icon,
    ...(view.danger !== undefined ? { danger: view.danger } : {}),
    ...(view.separatorBefore !== undefined ? { separatorBefore: view.separatorBefore } : {}),
    ...(view.afterContent !== undefined ? { afterContent: view.afterContent } : {}),
    ...run,
  }
}

/**
 * Resolve the sidebar's Workspace menu for one activation of our target.
 *
 * The shared popup disposes the outer occurrence before it runs the chosen
 * callback, so the inner occurrence is released from a microtask: by then a
 * leaf's `run` has marked the occurrence selected and `select()` has
 * released it itself. Dismissal or unload releases it without running.
 * @param menus - the client context-menu service.
 * @param target - our target value; passed through as the Workspace value.
 * @param signal - aborted on dismissal, unload, or a newer preparation.
 * @returns the bridged actions, or none when the sidebar offers no menu.
 */
const resolveWorkspaceMenu = async (
  menus: ContextMenus,
  target: ContextMenuTargetMap[typeof WORKSPACE_TARGET],
  signal: AbortSignal,
): Promise<readonly MenuAction[]> => {
  let inner: MenuResolution
  try {
    inner = menus.resolve({ kind: WORKSPACE_TARGET, value: target })
  } catch {
    return []
  }
  const state: BridgeState = { inner, selected: false }
  let released = false
  const release = (): void => {
    if (released) return
    released = true
    try {
      inner.dispose()
    } catch {
      /* an already released occurrence is fine */
    }
  }
  signal.addEventListener('abort', () => {
    queueMicrotask(() => {
      if (!state.selected) release()
    })
  }, { once: true })
  const aborted = new Promise<void>((resolve) => {
    if (signal.aborted) resolve()
    else signal.addEventListener('abort', () => resolve(), { once: true })
  })
  let budget: ReturnType<typeof setTimeout> | undefined
  const settled = new Promise<void>((resolve) => {
    budget = setTimeout(resolve, MENU_READY_BUDGET_MS)
  })
  try {
    try {
      await Promise.race([inner.ready.catch(() => {}), settled, aborted])
    } finally {
      clearTimeout(budget)
    }
    if (signal.aborted) {
      release()
      return []
    }
    return inner.source.getSnapshot().filter((view) => !isDeleteView(view)).map((view) => bridgeAction(view, state))
  } catch {
    release()
    return []
  }
}

/**
 * The label itself. The selector hooks and the gesture factory are bound by
 * the renderer at the slot position; the component never subscribes on its
 * own and never implements the menu popup.
 * @param props - Session scope id, the standard hooks and gesture factory,
 *   the bridge open/close helpers, and the bound locale.
 */
function WorkspaceLabel({
  sessionId,
  useWorkspaces,
  useFlatSidebar,
  useMenuReady,
  useMenuActive,
  useContextMenu,
  requestMenu,
  closeMenu,
  menuAlwaysVisible,
  t,
}: LabelProps): React.ReactNode {
  const [labelHovered, setLabelHovered] = React.useState(false)
  const [menuHovered, setMenuHovered] = React.useState(false)
  const [menuFocusVisible, setMenuFocusVisible] = React.useState(false)
  const items = useWorkspaces((snapshot) => snapshot?.items ?? STABLE_EMPTY_ITEMS)
  const visible = useFlatSidebar((groupBy) => groupBy === 'flat' || groupBy === 'unknown')
  // An older renderer may not bind the menu hooks; keep the label intact.
  const readMenuReady = typeof useMenuReady === 'function' ? useMenuReady : (() => false)
  const readMenuActive = typeof useMenuActive === 'function' ? useMenuActive : (() => null)
  const menuReady = readMenuReady((value) => value === true)
  const activeTarget = readMenuActive((value) => value)
  // ui-context-menu binds this factory into every Slot scope. Its bindings
  // own the official right-click and keyboard gesture; the plugin only
  // supplies the target, so the two activation paths cannot drift.
  const contextMenu = typeof useContextMenu === 'function' ? useContextMenu() : undefined
  if (visible !== true) return null
  const workspace = findWorkspace(items, sessionId)
  if (workspace === undefined) return null
  const label = workspaceLabel(workspace, resolveDefaultName(t))
  if (label === '') return null
  // The sidebar draws a Workspace menu only when the row has a path; the
  // native reveal entry needs it, so both header gestures follow that rule.
  const menuPath = typeof workspace.path === 'string' && workspace.path !== ''
    ? workspace.path
    : undefined
  const menuTarget: MenuTarget | undefined = menuReady && typeof requestMenu === 'function' && menuPath !== undefined
    ? {
        kind: MENU_TARGET,
        value: { workspaceId: workspace.workspaceId, path: menuPath, displayTitle: label },
      }
    : undefined
  const expanded = menuTarget !== undefined && activeTarget?.kind === MENU_TARGET
    && activeTarget.value?.workspaceId === workspace.workspaceId
  // The button is out of the way until the pointer, keyboard focus, or its
  // own open menu asks for it; touch shells keep it visible because they
  // have no hover to reveal it later.
  const revealed = menuTarget !== undefined
    && (menuAlwaysVisible === true || labelHovered || menuFocusVisible || expanded)
  // Off by default in the tab order: this is a decoration beside the
  // button, which remains the keyboard entry for the same menu.
  const gestureProps: ContextMenuTriggerProps | undefined = menuTarget !== undefined
    && typeof contextMenu?.getTriggerProps === 'function'
    ? contextMenu.getTriggerProps(menuTarget, { tabIndex: -1 })
    : undefined
  const children: React.ReactNode[] = []
  if (FolderIcon !== undefined) {
    children.push(h('span', {
      key: 'folder',
      style: ICON_STYLE,
      'aria-hidden': 'true',
    }, h(FolderIcon, { size: 14 })))
  }
  children.push(h('span', {
    key: 'text',
    style: TEXT_STYLE,
    title: t('hint', { workspace: label }),
  }, label))
  if (menuTarget !== undefined) {
    children.push(h('span', {
      key: 'menuSlot',
      style: revealed ? MENU_SLOT_REVEALED_STYLE : MENU_SLOT_STYLE,
    }, h('button', {
      key: 'menu',
      type: 'button',
      'data-session-workspace-menu': '',
      // The shared popup exempts explicit triggers from its outside-click
      // dismissal; without this, a second click on the button would close
      // the menu during pointerdown and immediately reopen it on click.
      'data-context-menu-trigger': '',
      'aria-label': t('menu', { workspace: label }),
      'aria-haspopup': 'menu',
      'aria-expanded': expanded,
      title: t('menu', { workspace: label }),
      style: revealed
        ? { ...MENU_BUTTON_REVEALED_STYLE, ...(menuHovered ? MENU_BUTTON_HOVER_ACCENTS : {}) }
        : MENU_BUTTON_STYLE,
      onFocus: (event: React.FocusEvent<HTMLButtonElement>) => {
        setMenuFocusVisible(event.currentTarget.matches(':focus-visible'))
      },
      onBlur: () => { setMenuFocusVisible(false) },
      onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
        // Keyboard use can resume on the same element after a pointer dismissal.
        if (!event.altKey && !event.ctrlKey && !event.metaKey && event.currentTarget.matches(':focus-visible')) {
          setMenuFocusVisible(true)
        }
      },
      onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
        event.stopPropagation()
        // A pointer can take over an already focused button without another focus event.
        setMenuFocusVisible(false)
      },
      onPointerEnter: () => { setMenuHovered(true) },
      onPointerLeave: () => { setMenuHovered(false) },
      onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation()
        event.currentTarget.focus({ preventScroll: true })
        // The shared popup toggles by its own button identity; this button
        // owns the same behaviour through the captured-open target, so a
        // second press closes instead of reopening at a shifted anchor.
        if (expanded) {
          if (typeof closeMenu === 'function') closeMenu()
          return
        }
        const rect = event.currentTarget.getBoundingClientRect()
        requestMenu(menuTarget, { x: rect.left, y: rect.bottom })
      },
    }, EllipsisIcon !== undefined ? h(EllipsisIcon, { size: 16 }) : inlineEllipsis())))
  }
  return h('span', {
    'data-session-workspace-label': '',
    style: STYLE,
    ...(gestureProps ?? {}),
    ...(menuTarget !== undefined ? {
      onPointerEnter: () => { setLabelHovered(true) },
      onPointerLeave: () => { setLabelHovered(false) },
    } : {}),
  }, ...children)
}

/** Local three-dot fallback for shells without the shared ellipsis glyph. */
const inlineEllipsis = (): React.ReactElement => h('svg', {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'currentColor',
  'aria-hidden': 'true',
},
h('circle', { cx: 3, cy: 8, r: 1.4 }),
h('circle', { cx: 8, cy: 8, r: 1.4 }),
h('circle', { cx: 13, cy: 8, r: 1.4 }))

const h = React.createElement

/**
 * The shared product icon set, loaded from the module table. This is the one
 * optional runtime import; the shell may not seed the package, and the module
 * loader is the only party that can resolve it.
 */
const shellRequire: (id: string) => unknown = require
let primitives: unknown
try {
  primitives = shellRequire('@deepseek-ai/dsh-client-ui-primitives')
} catch {
  primitives = undefined
}

/** One shared glyph, or undefined when the module or the glyph is absent. */
const iconFrom = (module: unknown, key: keyof SharedIconSet): IconComponent | undefined => {
  if (module === null || typeof module !== 'object') return undefined
  const value: unknown = Reflect.get(module, key)
  return isIconComponent(value) ? value : undefined
}

const FolderIcon: IconComponent | undefined = iconFrom(primitives, 'IconFolderCloseRegular')
const EllipsisIcon: IconComponent | undefined = iconFrom(primitives, 'IconEllipsisOutlineRegular')

export const inject = ['locale', 'slots']

/**
 * Show the Workspace name beside the Session title while the sidebar lists
 * sessions flat, and bridge its Workspace menu into the header. Registration
 * and cleanup stay inside `ctx.effect`.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, LABELS), `${NS}: locale`)

  // Touch shells report no hover, so the ellipsis cannot appear on it;
  // keep it visible there rather than hiding the only pointer entry.
  const hoverCapable = (() => {
    try {
      const media = browserWindow()?.matchMedia?.('(hover: hover)')
      return media === undefined ? true : media.matches === true
    } catch {
      return true
    }
  })()

  const storage = readStorage()
  const flatSidebar = createSignal<GroupBy>(readGroupBy(storage))
  const menuReady = createSignal(false)
  const menuActive = createSignal<ContextMenuTarget | null>(null)
  let menuService: ContextMenus | undefined

  ctx.effect(() => {
    const read = (): void => {
      flatSidebar.set(readGroupBy(storage))
    }
    const timer = browserWindow()?.setInterval(read, POLL_MS)
    const onStorage = (event: StorageEvent): void => {
      // `key === null` is a full clear; either way re-read the one key.
      if (event.key === null || event.key === VIEW_STORE_KEY) read()
    }
    const page = browserWindow()
    page?.addEventListener('storage', onStorage)
    return () => {
      if (timer !== undefined) page?.clearInterval(timer)
      page?.removeEventListener('storage', onStorage)
    }
  }, `${NS}: view store watcher`)

  ctx.inject(['contextMenus'], (child) => {
    child.effect(() => {
      menuService = child.contextMenus
      menuReady.set(true)
      const active = child.contextMenus.active
      const publish = (): void => {
        menuActive.set(active.getSnapshot())
      }
      const unsubscribe = active.subscribe(publish)
      publish()
      return () => {
        unsubscribe()
        menuService = undefined
        menuReady.set(false)
        menuActive.set(null)
      }
    }, `${NS}: menu service`)
    child.effect(() => child.contextMenus.register({
      id: 'workspace.menu',
      target: MENU_TARGET,
      order: 0,
      resolve: (target, signal) => resolveWorkspaceMenu(child.contextMenus, target, signal),
    }), `${NS}: workspace menu bridge`)
  })

  const requestMenu = (target: MenuTarget, point: MenuPoint): void => {
    if (menuService === undefined) return
    try {
      menuService.open(target, point)
    } catch (error) {
      console.error(`${NS}: could not open the workspace menu`, error)
    }
  }
  const closeMenu = (): void => {
    if (menuService === undefined) return
    try {
      menuService.close()
    } catch (error) {
      console.error(`${NS}: could not close the workspace menu`, error)
    }
  }

  ctx.effect(() => ctx.slots.inject(SLOT, () => ctx.slots.register({
    name: SLOT,
    id: ENTRY_ID,
    order: LEADING_ORDER,
    locale: NS,
    inject: (sessionId: string): LabelInjected => ({
      sessionId,
      requestMenu,
      closeMenu,
      menuAlwaysVisible: !hoverCapable,
      hooks: { flatSidebar, menuReady, menuActive },
    }),
  }, WorkspaceLabel)), `${NS}: header entry`)
}
