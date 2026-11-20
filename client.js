/**
 * Browser half of `dsh-session-workspace-label`.
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
 * glyph. Both are optional and degrade to the plain title.
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
window.__ModuleLoader__.load({
  id: 'dsh-session-workspace-label',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /**
     * The sidebar's folder glyph comes from the shared product icon set, so the
     * row and this label stay optically identical. The module is optional: a
     * shell without it loses the glyph, not the label. The ellipsis glyph uses
     * the same module and falls back to a local one when it is missing.
     */
    let primitives
    try {
      primitives = require('@deepseek-ai/dsh-client-ui-primitives')
    } catch {
      primitives = undefined
    }
    const FolderIcon = typeof primitives?.IconFolderCloseRegular === 'function'
      ? primitives.IconFolderCloseRegular
      : undefined
    const EllipsisIcon = typeof primitives?.IconEllipsisOutlineRegular === 'function'
      ? primitives.IconEllipsisOutlineRegular
      : undefined

    const NS = 'dsh-session-workspace-label'
    const SLOT = 'conversation.session.header.actions'
    const ENTRY_ID = 'workspace-label'
    /** ui-workspace's browser store for the session-list grouping mode. */
    const VIEW_STORE_KEY = 'dsh.workspace.view.v5'
    /** The store's shipped default; a missing key means the mode was never changed. */
    const DEFAULT_GROUP_BY = 'workspace'
    /**
     * The directory name the first-use Workspace keeps on disk and in its
     * stored title; the sidebar labels that title as the default Workspace.
     */
    const DEFAULT_WORKSPACE_TITLE = 'default-workspace'
    /** Common locale key behind the sidebar's localized default name. */
    const DEFAULT_WORKSPACE_NAME_KEY = 'workspace.defaultName'
    const GROUP_BY_VALUES = new Set(['flat', 'workspace', 'workspace-tree'])
    /** Read-only, so a slow cadence is enough; the label is decoration, not state. */
    const POLL_MS = 1000
    const STABLE_EMPTY_ITEMS = []
    /**
     * The actions list sorts ascending and renders right after the title. The
     * preset label holds -10 as the first static context, so a lower order is
     * what keeps the workspace name literally next to the title.
     */
    const LEADING_ORDER = -20
    /** The context-menu target family the sidebar's Workspace entries use. */
    const WORKSPACE_TARGET = 'workspace'
    /** Our own family: every activation bridges the Workspace family through it. */
    const MENU_TARGET = 'dsh-session-workspace-label.workspace'
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

    const LABELS = {
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
    const STYLE = {
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

    const ICON_STYLE = {
      display: 'inline-flex',
      alignItems: 'center',
      flex: 'none',
    }

    const TEXT_STYLE = {
      minWidth: 0,
      // The title row clips trailing actions on a narrow window; a shorter cap
      // lets the name truncate before the menu button reaches that edge.
      maxWidth: '14em',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    }

    /**
     * A hairline rule keeps the actions button from reading as a second
     * truncation ellipsis on a long Workspace name.
     */
    const DIVIDER_STYLE = {
      flex: 'none',
      width: '1px',
      height: '12px',
      background: 'var(--dsw-alias-border-l1)',
      marginInline: '2px',
    }

    /**
     * 24px matches the sidebar's Workspace action target. The glyph is one size
     * smaller than the row's so the control still sits inside the header's
     * title band; the hit box does not shrink with it.
     */
    const MENU_BUTTON_STYLE = {
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
    }

    const MENU_BUTTON_HOVER_STYLE = {
      ...MENU_BUTTON_STYLE,
      background: 'var(--dsw-alias-interactive-bg-hover)',
      color: 'var(--dsw-alias-label-primary)',
    }

    const browserWindow = () => (typeof window === 'undefined' ? undefined : window)

    /** Last path segment, for a Workspace whose title is empty. */
    const basename = path => {
      if (typeof path !== 'string') return ''
      const parts = path.split(/[\\/]/).filter(part => part !== '')
      return parts.length === 0 ? '' : parts[parts.length - 1]
    }

    /** Find the grouping mode in the persisted store, whatever wrapper it uses. */
    const findGroupBy = root => {
      const queue = [{ value: root, depth: 0 }]
      while (queue.length > 0) {
        const { value, depth } = queue.shift()
        if (value === null || typeof value !== 'object' || depth > 4) continue
        if (typeof value.groupBy === 'string' && GROUP_BY_VALUES.has(value.groupBy)) return value.groupBy
        for (const child of Object.values(value)) queue.push({ value: child, depth: depth + 1 })
      }
      return undefined
    }

    /**
     * Read the sidebar's grouping mode.
     * @param storage - the page's Storage, or undefined when it cannot be read.
     * @returns the mode, or `unknown` when the persisted state cannot be read.
     */
    const readGroupBy = storage => {
      if (storage === null || storage === undefined) return 'unknown'
      let raw
      try {
        raw = storage.getItem(VIEW_STORE_KEY)
      } catch {
        return 'unknown'
      }
      // No key yet: the browser never changed the shipped default.
      if (raw === null) return DEFAULT_GROUP_BY
      let parsed
      try {
        parsed = JSON.parse(raw)
      } catch {
        return 'unknown'
      }
      return findGroupBy(parsed) ?? 'unknown'
    }

    const readStorage = () => {
      try {
        return browserWindow()?.localStorage ?? undefined
      } catch {
        return undefined
      }
    }

    /** A minimal observable: the renderer binds it into a selector hook. */
    const createSignal = initial => {
      let value = initial
      const listeners = new Set()
      return {
        getSnapshot: () => value,
        subscribe: listener => {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
        set: next => {
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
    const findWorkspace = (items, sessionId) => {
      if (!Array.isArray(items)) return undefined
      return items.find(item => item !== null && typeof item === 'object'
        && Array.isArray(item.sessionIds) && item.sessionIds.includes(sessionId))
    }

    /**
     * The name the sidebar shows for a Workspace: the localized default name
     * for the first-use Workspace, its own title otherwise, and the directory
     * basename when the title is empty. A missing dictionary entry leaves the
     * stored title in place rather than showing a raw locale key.
     */
    const workspaceLabel = (workspace, defaultName) => {
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
    const resolveDefaultName = t => {
      const translated = t(DEFAULT_WORKSPACE_NAME_KEY)
      return typeof translated === 'string' && translated !== DEFAULT_WORKSPACE_NAME_KEY
        ? translated
        : ''
    }

    /** Is this resolved view the sidebar's destructive Workspace entry? */
    const isDeleteView = view => typeof view?.id === 'string'
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
    const bridgeAction = (view, state) => {
      const action = { id: view.id, label: view.label }
      if (view.commandId !== undefined) action.commandId = view.commandId
      if (view.disabled !== undefined) action.disabled = view.disabled
      if (view.icon !== undefined) action.icon = { ...view.icon }
      if (view.danger !== undefined) action.danger = view.danger
      if (view.separatorBefore !== undefined) action.separatorBefore = view.separatorBefore
      if (view.afterContent !== undefined) action.afterContent = view.afterContent
      if (Array.isArray(view.children)) {
        action.children = view.children.map(child => bridgeAction(child, state))
      } else {
        action.run = () => {
          state.selected = true
          state.inner.select(view.id)
        }
      }
      return action
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
    const resolveWorkspaceMenu = async (menus, target, signal) => {
      let inner
      try {
        inner = menus.resolve({ kind: WORKSPACE_TARGET, value: target })
      } catch {
        return []
      }
      const state = { inner, selected: false }
      let released = false
      const release = () => {
        if (released) return
        released = true
        try { inner.dispose() } catch { /* an already released occurrence is fine */ }
      }
      signal.addEventListener('abort', () => {
        queueMicrotask(() => { if (!state.selected) release() })
      }, { once: true })
      const aborted = new Promise(resolve => {
        if (signal.aborted) resolve()
        else signal.addEventListener('abort', resolve, { once: true })
      })
      let budget
      const settled = new Promise(resolve => { budget = setTimeout(resolve, MENU_READY_BUDGET_MS) })
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
        return inner.source.getSnapshot().filter(view => !isDeleteView(view)).map(view => bridgeAction(view, state))
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
    function WorkspaceLabel({ sessionId, useWorkspaces, useFlatSidebar, useMenuReady, useMenuActive, useContextMenu, requestMenu, closeMenu, t }) {
      const [menuHovered, setMenuHovered] = React.useState(false)
      const items = useWorkspaces(snapshot => snapshot?.items ?? STABLE_EMPTY_ITEMS)
      const visible = useFlatSidebar(groupBy => groupBy === 'flat' || groupBy === 'unknown')
      // An older renderer may not bind the menu hooks; keep the label intact.
      const readMenuReady = typeof useMenuReady === 'function' ? useMenuReady : () => false
      const readMenuActive = typeof useMenuActive === 'function' ? useMenuActive : () => null
      const menuReady = readMenuReady(value => value === true)
      const activeTarget = readMenuActive(value => value)
      // ui-context-menu binds this factory into every Slot scope. Its bindings
      // own the official right-click and keyboard gesture; the plugin only
      // supplies the target, so the two activation paths cannot drift.
      const contextMenu = typeof useContextMenu === 'function' ? useContextMenu() : undefined
      if (visible !== true) return null
      const workspace = findWorkspace(items, sessionId)
      const label = workspaceLabel(workspace, resolveDefaultName(t))
      if (label === '') return null
      // The sidebar draws a Workspace menu only when the row has a path; the
      // native reveal entry needs it, so both header gestures follow that rule.
      const menuPath = typeof workspace.path === 'string' && workspace.path !== ''
        ? workspace.path
        : undefined
      const menuTarget = menuReady && typeof requestMenu === 'function' && menuPath !== undefined
        ? {
          kind: MENU_TARGET,
          value: { workspaceId: workspace.workspaceId, path: menuPath, displayTitle: label },
        }
        : undefined
      // Off by default in the tab order: this is a decoration beside the
      // button, which remains the keyboard entry for the same menu.
      const gestureProps = menuTarget !== undefined && typeof contextMenu?.getTriggerProps === 'function'
        ? contextMenu.getTriggerProps(menuTarget, { tabIndex: -1 })
        : undefined
      const children = []
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
        const expanded = activeTarget?.kind === MENU_TARGET
          && activeTarget.value?.workspaceId === workspace.workspaceId
        children.push(h('span', { key: 'divider', 'aria-hidden': 'true', style: DIVIDER_STYLE }))
        children.push(h('button', {
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
          style: menuHovered ? MENU_BUTTON_HOVER_STYLE : MENU_BUTTON_STYLE,
          onPointerDown: event => { event.stopPropagation() },
          onPointerEnter: () => { setMenuHovered(true) },
          onPointerLeave: () => { setMenuHovered(false) },
          onClick: event => {
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
        }, EllipsisIcon !== undefined ? h(EllipsisIcon, { size: 16 }) : inlineEllipsis()))
      }
      return h('span', {
        'data-session-workspace-label': '',
        style: STYLE,
        ...gestureProps,
      }, ...children)
    }

    /** Local three-dot fallback for shells without the shared ellipsis glyph. */
    const inlineEllipsis = () => h('svg', {
      width: 16,
      height: 16,
      viewBox: '0 0 16 16',
      fill: 'currentColor',
      'aria-hidden': 'true',
    },
    h('circle', { cx: 3, cy: 8, r: 1.4 }),
    h('circle', { cx: 8, cy: 8, r: 1.4 }),
    h('circle', { cx: 13, cy: 8, r: 1.4 }))

    return {
      inject: ['locale', 'slots'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, LABELS), `${NS}: locale`)

        const storage = readStorage()
        const flatSidebar = createSignal(readGroupBy(storage))
        const menuReady = createSignal(false)
        const menuActive = createSignal(null)
        let menuService

        ctx.effect(() => {
          const read = () => { flatSidebar.set(readGroupBy(storage)) }
          const timer = browserWindow()?.setInterval(read, POLL_MS)
          const onStorage = event => {
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

        ctx.inject(['contextMenus'], child => {
          child.effect(() => {
            menuService = child.contextMenus
            menuReady.set(true)
            const active = child.contextMenus.active
            const publish = () => { menuActive.set(active.getSnapshot()) }
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

        const requestMenu = (target, point) => {
          if (menuService === undefined) return
          try {
            menuService.open(target, point)
          } catch (error) {
            console.error(`${NS}: could not open the workspace menu`, error)
          }
        }
        const closeMenu = () => {
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
          inject: sessionId => ({ sessionId, requestMenu, closeMenu, hooks: { flatSidebar, menuReady, menuActive } }),
        }, WorkspaceLabel)), `${NS}: header entry`)
      },
    }
  },
})
