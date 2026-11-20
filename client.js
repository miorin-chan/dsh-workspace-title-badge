/**
 * Browser half of `dsh-session-workspace-label`.
 *
 * The sidebar's "in one list" grouping mixes sessions from every Workspace and
 * draws no Workspace header; the grouped modes name each Workspace instead.
 * This module puts the open Session's Workspace name immediately after the
 * Session title in the conversation header, and only while the sidebar lists
 * sessions flat.
 *
 * Seam: the conversation header declares the public
 * `conversation.session.header.actions` list. An entry there receives the
 * Session scope id as the first argument of its `inject` factory, and the
 * renderer binds the standard `useWorkspaces` selector hook at the render
 * position (ui-workspace provides it), so the workspace lookup and the rename
 * follow-up need no private access. The list renders ascending by `order`,
 * right after the title, so the entry holds a leading negative order: it must
 * precede the preset label (-10), which otherwise takes the spot beside the
 * title.
 *
 * The label reuses the sidebar's presentation: the first-use Workspace's
 * stored title (`default-workspace`) becomes the shared localized default name
 * from the common locale dictionary (`workspace.defaultName`), every other
 * title stays verbatim, and the shared icon set supplies the closed folder
 * glyph. Both are optional and degrade to the plain title.
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
     * shell without it loses the glyph, not the label.
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

    const LABELS = {
      en: { hint: 'Workspace: {workspace}' },
      zh: { hint: '工作区：{workspace}' },
      ja: { hint: 'ワークスペース：{workspace}' },
      de: { hint: 'Arbeitsbereich: {workspace}' },
      es: { hint: 'Espacio de trabajo: {workspace}' },
      fr: { hint: 'Espace de travail : {workspace}' },
      pt: { hint: 'Espaço de trabalho: {workspace}' },
      ru: { hint: 'Рабочая область: {workspace}' },
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
      maxWidth: '18em',
      minWidth: 0,
      verticalAlign: 'middle',
      fontSize: '12px',
      lineHeight: '1.4',
      opacity: '0.6',
      marginInlineStart: '-8px',
      cursor: 'default',
    }

    const ICON_STYLE = {
      display: 'inline-flex',
      alignItems: 'center',
      flex: 'none',
    }

    const TEXT_STYLE = {
      minWidth: 0,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
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

    /**
     * The label itself. Both hooks are bound by the renderer at the slot
     * position; the component never subscribes on its own.
     * @param props - Session scope id, the standard hooks, and the bound locale.
     */
    function WorkspaceLabel({ sessionId, useWorkspaces, useFlatSidebar, t }) {
      const items = useWorkspaces(snapshot => snapshot?.items ?? STABLE_EMPTY_ITEMS)
      const visible = useFlatSidebar(groupBy => groupBy === 'flat' || groupBy === 'unknown')
      if (visible !== true) return null
      const label = workspaceLabel(findWorkspace(items, sessionId), resolveDefaultName(t))
      if (label === '') return null
      const children = []
      if (FolderIcon !== undefined) {
        children.push(h('span', {
          key: 'folder',
          style: ICON_STYLE,
          'aria-hidden': 'true',
        }, h(FolderIcon, { size: 14 })))
      }
      children.push(h('span', { key: 'text', style: TEXT_STYLE }, label))
      return h('span', {
        'data-session-workspace-label': '',
        title: t('hint', { workspace: label }),
        style: STYLE,
      }, ...children)
    }

    return {
      inject: ['locale', 'slots'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, LABELS), `${NS}: locale`)

        const storage = readStorage()
        const flatSidebar = createSignal(readGroupBy(storage))

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

        ctx.effect(() => ctx.slots.inject(SLOT, () => ctx.slots.register({
          name: SLOT,
          id: ENTRY_ID,
          order: LEADING_ORDER,
          locale: NS,
          inject: sessionId => ({ sessionId, hooks: { flatSidebar } }),
        }, WorkspaceLabel)), `${NS}: header entry`)
      },
    }
  },
})
