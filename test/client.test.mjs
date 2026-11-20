import assert from 'node:assert/strict'
import { test } from 'node:test'

/** Capture the module registration the browser module loader would receive. */
let registration
const intervals = new Map()
let nextInterval = 1
const windowListeners = new Map()

/**
 * The page's localStorage, seeded per test.
 * @param seed - initial key/value pairs.
 */
function fakeStorage(seed = {}) {
  const data = new Map(Object.entries(seed))
  return {
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)) },
    removeItem: key => { data.delete(key) },
  }
}

globalThis.window = {
  __ModuleLoader__: {
    load(entry) {
      registration = entry
    },
  },
  localStorage: fakeStorage(),
  setInterval(callback) {
    const id = nextInterval
    nextInterval += 1
    intervals.set(id, callback)
    return id
  },
  clearInterval(id) {
    intervals.delete(id)
  },
  addEventListener(type, listener) {
    const bucket = windowListeners.get(type) ?? new Set()
    bucket.add(listener)
    windowListeners.set(type, bucket)
  },
  removeEventListener(type, listener) {
    windowListeners.get(type)?.delete(listener)
  },
}
await import('../client.js')

const React = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
}
/** Marker standing in for the shared folder icon component. */
const FOLDER_ICON = function IconFolderCloseRegular() { return null }
/** Marker standing in for the shared ellipsis glyph. */
const ELLIPSIS_ICON = function IconEllipsisOutlineRegular() { return null }
const PRIMITIVES = { IconFolderCloseRegular: FOLDER_ICON, IconEllipsisOutlineRegular: ELLIPSIS_ICON }
const load = ({ primitives = PRIMITIVES } = {}) => registration.factory(moduleName => {
  if (moduleName === 'react') return React
  if (moduleName === '@deepseek-ai/dsh-client-ui-primitives') {
    if (primitives === undefined || primitives === null) throw new Error('missing shared icon module')
    return primitives
  }
  throw new Error('unexpected module ' + moduleName)
})

assert.equal(registration.id, 'dsh-session-workspace-label')

/** A minimal observable, matching the shape the renderer binds as a hook. */
function fakeSignal(initial) {
  let value = initial
  const listeners = new Set()
  return {
    getSnapshot: () => value,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set(next) {
      value = next
      for (const listener of [...listeners]) listener()
    },
  }
}

/**
 * A stand-in for the Client context-menu service. Its `resolve()` returns one
 * occurrence view list and records selection and disposal.
 * @param options.views - the resolved action views.
 * @param options.ready - settles when the sidebar providers finish.
 */
function fakeMenus({ views = [], ready = Promise.resolve() } = {}) {
  const calls = { registered: [], resolved: [], opened: [], selected: [], disposed: 0, unregistered: 0, closed: 0 }
  const active = fakeSignal(null)
  const byId = new Map()
  const index = list => {
    for (const view of list) {
      byId.set(view.id, view)
      if (Array.isArray(view.children)) index(view.children)
    }
  }
  index(views)
  const inner = {
    ready,
    source: { getSnapshot: () => views, subscribe: () => () => {} },
    select(id) {
      calls.selected.push(id)
      byId.get(id)?.run?.()
      this.dispose()
    },
    dispose() { calls.disposed += 1 },
  }
  const contextMenus = {
    active,
    registeredKinds: fakeSignal(['workspace']),
    register(contribution) {
      calls.registered.push(contribution)
      return () => { calls.unregistered += 1 }
    },
    resolve(target) {
      calls.resolved.push(target)
      return inner
    },
    open(target, point) {
      calls.opened.push({ target, point })
      active.set(target)
    },
    close() { calls.closed += 1; active.set(null) },
    notify() {},
    calls,
  }
  return contextMenus
}

/**
 * A minimal host: recorded effects, locale namespaces, slot entries, and an
 * optional context-menu service.
 * @param options.menus - the Client context-menu service, or undefined.
 */
function fakeContext({ menus } = {}) {
  const effects = []
  const namespaces = new Map()
  const entries = []
  const ctx = {
    effect(install, label) {
      const dispose = install()
      effects.push({ label, dispose })
      return dispose
    },
    locale: {
      register(namespace, labels) {
        namespaces.set(namespace, labels)
        return () => { namespaces.delete(namespace) }
      },
    },
    slots: {
      inject(name, callback) {
        assert.equal(name, 'conversation.session.header.actions')
        return callback()
      },
      register(descriptor, Component) {
        const entry = { descriptor, Component }
        entries.push(entry)
        return () => {
          const index = entries.indexOf(entry)
          if (index >= 0) entries.splice(index, 1)
        }
      },
    },
    inject(deps, callback) {
      if (deps.some(dep => dep === 'contextMenus' && menus === undefined)) return
      const child = { ...ctx, contextMenus: menus }
      callback(child)
    },
  }
  return { ctx, effects, namespaces, entries }
}

const FLAT_STORE = JSON.stringify({ groupBy: 'flat', orderBy: 'updated', sessionOrderByAccount: {} })

/**
 * Apply one plugin instance over a seeded storage.
 * @param seed - localStorage entries visible to the plugin.
 * @param modules - browser modules the bundle may require.
 * @param options.menus - the Client context-menu service, or undefined.
 */
function mount(seed = {}, modules, { menus } = {}) {
  globalThis.window.localStorage = fakeStorage(seed)
  const fake = fakeContext({ menus })
  load(modules).apply(fake.ctx)
  return fake
}

/** Dispose every registered effect, newest first, like an unload. */
function unmount(fake) {
  for (const effect of [...fake.effects].reverse()) effect.dispose()
}

/**
 * Render the registered entry the way the renderer would: Session id from the
 * inject factory, hooks bound to the current values.
 * @param fake - the mounted context.
 * @param options - mode, Workspaces snapshot, Session, and menu state.
 */
function render(fake, {
  mode = 'workspace', workspaces = [], sessionId = 'session-1', t, active = null,
} = {}) {
  const { descriptor, Component } = fake.entries[0]
  const injected = descriptor.inject(sessionId)
  return Component({
    ...injected,
    useWorkspaces: selector => selector({ items: workspaces }),
    useFlatSidebar: selector => selector(mode),
    useMenuReady: selector => selector(injected.hooks.menuReady.getSnapshot()),
    useMenuActive: selector => selector(injected.hooks.menuActive.getSnapshot() ?? active),
    t: t ?? ((key, params) => {
      if (key === 'workspace.defaultName') return '默认工作区'
      return `${key}:${params?.workspace}`
    }),
  })
}

/** The text span, whichever optional icons surround it. */
const labelText = node => node.children.find(child => child.props?.key === 'text').children[0]
/** The hint tooltip belongs to the name, not to the whole cluster. */
const labelTitle = node => node.children.find(child => child.props?.key === 'text').props.title
/** The optional ellipsis button. */
const menuButton = node => node.children.find(child => child.props?.['data-session-workspace-menu'] !== undefined)

const WORKSPACE = {
  workspaceId: 'w-1',
  path: '/Users/example/projects/default-workspace',
  title: 'default-workspace',
  sessionIds: ['session-1'],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

test('registers its locale labels and one header entry', () => {
  const fake = mount()
  assert.ok(fake.namespaces.has('dsh-session-workspace-label'))
  assert.equal(Object.keys(fake.namespaces.get('dsh-session-workspace-label')).length, 8)
  assert.equal(fake.entries.length, 1)
  assert.equal(fake.entries[0].descriptor.name, 'conversation.session.header.actions')
  assert.equal(fake.entries[0].descriptor.id, 'workspace-label')
  // The actions list renders after the title in ascending order; the label
  // must lead it to stay immediately beside the title, ahead of the preset
  // label (-10).
  assert.equal(fake.entries[0].descriptor.order, -20)
  assert.equal(typeof fake.entries[0].Component, 'function')
  unmount(fake)
})

test('hides the label while the sidebar groups by workspace', () => {
  const fake = mount()
  assert.equal(render(fake, { workspaces: [WORKSPACE] }), null)
  unmount(fake)
})

test('hides the label when the browser never changed the grouping mode', () => {
  const fake = mount()
  assert.equal(render(fake, { mode: 'workspace', workspaces: [WORKSPACE] }), null)
  unmount(fake)
})

test('shows the sidebar’s display name and folder glyph beside a flat-list Session', () => {
  const fake = mount({ 'dsh.workspace.view.v5': FLAT_STORE })
  const node = render(fake, { mode: 'flat', workspaces: [WORKSPACE] })
  assert.equal(node.type, 'span')
  assert.equal(node.children.length, 2)
  const [folder, text] = node.children
  assert.equal(folder.type, 'span')
  assert.equal(folder.props['aria-hidden'], 'true')
  assert.equal(folder.children[0].type, FOLDER_ICON)
  assert.equal(folder.children[0].props.size, 14)
  assert.deepEqual(text.children, ['默认工作区'])
  assert.equal(labelText(node), '默认工作区')
  assert.equal(labelTitle(node), 'hint:默认工作区')
  // Cancels the breadcrumb's 8px trailing padding so the label sits one
  // cluster gap from the title instead of a padding plus a gap away.
  assert.equal(node.props.style.marginInlineStart, '-8px')
  // No menu service: the label stays a plain display label.
  assert.equal(menuButton(node), undefined)
  unmount(fake)
})

test('keeps a user-chosen Workspace title verbatim', () => {
  const fake = mount({ 'dsh.workspace.view.v5': FLAT_STORE })
  const node = render(fake, { mode: 'flat', workspaces: [{ ...WORKSPACE, title: 'My Project' }] })
  assert.equal(labelText(node), 'My Project')
  assert.equal(labelTitle(node), 'hint:My Project')
  unmount(fake)
})

test('falls back to the stored title when the shared default name is absent', () => {
  const fake = mount({ 'dsh.workspace.view.v5': FLAT_STORE })
  const node = render(fake, {
    mode: 'flat',
    workspaces: [WORKSPACE],
    t: (key, params) => (key === 'workspace.defaultName' ? key : `hint:${params?.workspace}`),
  })
  assert.equal(labelText(node), 'default-workspace')
  unmount(fake)
})

test('keeps the text label when the shared icon module is missing', () => {
  const fake = mount({ 'dsh.workspace.view.v5': FLAT_STORE }, { primitives: null })
  const node = render(fake, { mode: 'flat', workspaces: [WORKSPACE] })
  assert.equal(node.children.length, 1)
  assert.equal(labelText(node), '默认工作区')
  unmount(fake)
})

test('reads the mode out of a wrapped persisted store', () => {
  const fake = mount({ 'dsh.workspace.view.v5': JSON.stringify({ version: 5, state: { groupBy: 'flat' } }) })
  assert.notEqual(render(fake, { mode: 'flat', workspaces: [WORKSPACE] }), null)
  unmount(fake)
})

test('fails open when the stored value is unreadable', () => {
  const fake = mount({ 'dsh.workspace.view.v5': 'not json' })
  assert.notEqual(render(fake, { mode: 'unknown', workspaces: [WORKSPACE] }), null)
  unmount(fake)
})

test('fails open when storage is unavailable', () => {
  globalThis.window.localStorage = undefined
  const fake = fakeContext()
  load().apply(fake.ctx)
  assert.notEqual(render(fake, { mode: 'unknown', workspaces: [WORKSPACE] }), null)
  unmount(fake)
})

test('shows nothing for a Session outside every Workspace', () => {
  const fake = mount({ 'dsh.workspace.view.v5': FLAT_STORE })
  assert.equal(render(fake, { mode: 'flat', workspaces: [WORKSPACE], sessionId: 'session-other' }), null)
  assert.equal(render(fake, { mode: 'flat', workspaces: [] }), null)
  unmount(fake)
})

test('falls back to the directory basename when the Workspace has no title', () => {
  const fake = mount({ 'dsh.workspace.view.v5': FLAT_STORE })
  const node = render(fake, { mode: 'flat', workspaces: [{ ...WORKSPACE, title: '' }] })
  assert.equal(labelText(node), 'default-workspace')
  unmount(fake)
})

test('follows a grouping-mode change through the poll', () => {
  const fake = mount()
  assert.equal(render(fake, { mode: 'workspace', workspaces: [WORKSPACE] }), null)

  globalThis.window.localStorage.setItem('dsh.workspace.view.v5', FLAT_STORE)
  for (const callback of intervals.values()) callback()

  const entry = fake.entries[0]
  const signal = entry.descriptor.inject('session-1').hooks.flatSidebar
  assert.equal(signal.getSnapshot(), 'flat')
  unmount(fake)
})

test('removes the poll, the listener and the entry on unload', () => {
  const fake = mount({ 'dsh.workspace.view.v5': FLAT_STORE })
  assert.equal(intervals.size, 1)
  assert.equal(windowListeners.get('storage')?.size, 1)

  unmount(fake)

  assert.equal(intervals.size, 0)
  assert.equal(windowListeners.get('storage')?.size, 0)
  assert.equal(fake.entries.length, 0)
  assert.equal(fake.namespaces.has('dsh-session-workspace-label'), false)
})

// The sidebar's Workspace menu is a set of context-menu contributions. The
// plugin contributes one bridge target; these tests pin that bridge.

const RENAME_ID = 'workspace.rename/rename'
const REVEAL_ID = 'open-in-app.workspace/reveal'
const DELETE_ID = 'workspace.delete/delete'

/** The shipped-sidebar shape: rename, native reveal, then destructive delete. */
function sidebarViews({ renamed = 0, revealed = 0, deleted = 0 } = {}) {
  const runs = { renamed, revealed, deleted }
  const views = [
    {
      id: RENAME_ID, label: 'Rename', icon: { key: 'workspace.rename' },
      run: () => { runs.renamed += 1 },
    },
    {
      id: REVEAL_ID, label: 'Show in Finder', icon: { key: 'open-in-app.reveal' },
      run: () => { runs.revealed += 1 },
    },
    {
      id: DELETE_ID, label: 'Delete workspace', icon: { key: 'workspace.delete' },
      danger: true, separatorBefore: true, run: () => { runs.deleted += 1 },
    },
  ]
  return { views, runs }
}

const MENU_TARGET = 'dsh-session-workspace-label.workspace'
const WORKSPACE_TARGET = { workspaceId: 'w-1', path: WORKSPACE.path, displayTitle: '默认工作区' }

test('registers one bridge contribution for a target family of its own', () => {
  const menus = fakeMenus()
  const fake = mount({ 'dsh.workspace.view.v5': FLAT_STORE }, undefined, { menus })
  assert.equal(menus.calls.registered.length, 1)
  const contribution = menus.calls.registered[0]
  assert.equal(contribution.target, MENU_TARGET)
  assert.equal(typeof contribution.resolve, 'function')
  unmount(fake)
  assert.equal(menus.calls.unregistered, 1)
})

test('bridges every sidebar workspace action except delete', async () => {
  const { views } = sidebarViews()
  const menus = fakeMenus({ views })
  const fake = mount({ 'dsh.workspace.view.v5': FLAT_STORE }, undefined, { menus })
  const contribution = menus.calls.registered[0]
  const controller = new AbortController()
  const actions = await contribution.resolve(WORKSPACE_TARGET, controller.signal)

  assert.deepEqual(menus.calls.resolved, [{ kind: 'workspace', value: WORKSPACE_TARGET }])
  assert.deepEqual(actions.map(action => action.id), [RENAME_ID, REVEAL_ID])
  assert.equal(actions[0].label, 'Rename')
  assert.equal(actions[0].icon.key, 'workspace.rename')
  assert.equal(actions[1].icon.key, 'open-in-app.reveal')
  // The destructive contribution is dropped with its separator.
  assert.equal(actions.some(action => action.id === DELETE_ID), false)
  unmount(fake)
})

test('delegates the selected action to the sidebar occurrence', async () => {
  const { views, runs } = sidebarViews()
  const menus = fakeMenus({ views })
  const fake = mount({ 'dsh.workspace.view.v5': FLAT_STORE }, undefined, { menus })
  const contribution = menus.calls.registered[0]
  const controller = new AbortController()
  const actions = await contribution.resolve(WORKSPACE_TARGET, controller.signal)

  actions[0].run()
  assert.deepEqual(menus.calls.selected, [RENAME_ID])
  assert.equal(runs.renamed, 1)
  assert.equal(runs.deleted, 0)
  unmount(fake)
})

test('releases the sidebar occurrence when the menu is dismissed', async () => {
  const { views } = sidebarViews()
  const menus = fakeMenus({ views })
  const fake = mount({ 'dsh.workspace.view.v5': FLAT_STORE }, undefined, { menus })
  const contribution = menus.calls.registered[0]
  const controller = new AbortController()
  await contribution.resolve(WORKSPACE_TARGET, controller.signal)
  assert.equal(menus.calls.disposed, 0)

  controller.abort()
  await Promise.resolve()

  assert.equal(menus.calls.disposed, 1)
  unmount(fake)
})

test('runs the chosen action although the shared popup releases the outer occurrence first', async () => {
  const { views, runs } = sidebarViews()
  const menus = fakeMenus({ views })
  const fake = mount({ 'dsh.workspace.view.v5': FLAT_STORE }, undefined, { menus })
  const contribution = menus.calls.registered[0]
  const controller = new AbortController()
  const actions = await contribution.resolve(WORKSPACE_TARGET, controller.signal)

  // The shared popup disposes its occurrence, then invokes the callback. The
  // inner occurrence must still be selectable, and must not be released twice.
  controller.abort()
  actions[0].run()
  await Promise.resolve()

  assert.equal(runs.renamed, 1)
  assert.equal(menus.calls.disposed, 1)
  unmount(fake)
})

test('joins nested actions onto the same sidebar occurrence', async () => {
  const runs = { nested: 0 }
  const views = [{
    id: 'open-in-app.workspace/open', label: 'Open in', children: [
      { id: 'open-in-app.workspace/open/editor', label: 'Editor', run: () => { runs.nested += 1 } },
    ],
  }]
  const menus = fakeMenus({ views })
  const fake = mount({ 'dsh.workspace.view.v5': FLAT_STORE }, undefined, { menus })
  const contribution = menus.calls.registered[0]
  const actions = await contribution.resolve(WORKSPACE_TARGET, new AbortController().signal)
  assert.equal(actions[0].run, undefined)
  actions[0].children[0].run()
  assert.deepEqual(menus.calls.selected, ['open-in-app.workspace/open/editor'])
  assert.equal(runs.nested, 1)
  unmount(fake)
})

test('renders the More button only with a menu service and a visible label', () => {
  const menus = fakeMenus()
  const fake = mount({ 'dsh.workspace.view.v5': FLAT_STORE }, undefined, { menus })
  const node = render(fake, { mode: 'flat', workspaces: [WORKSPACE] })
  const button = menuButton(node)
  assert.ok(button)
  assert.equal(button.type, 'button')
  assert.equal(button.props['aria-haspopup'], 'menu')
  assert.equal(button.props['aria-expanded'], false)
  // The shared popup exempts explicit triggers from outside-click dismissal.
  assert.equal(button.props['data-context-menu-trigger'], '')
  assert.equal(button.props.style.width, '24px')
  assert.equal(button.props.style.height, '24px')
  assert.equal(button.props.style.color, 'var(--dsw-alias-label-tertiary)')
  assert.equal(button.children[0].type, ELLIPSIS_ICON)
  // A hairline divider keeps the button from reading as a second truncation mark.
  assert.ok(node.children.some(child => child.props?.key === 'divider'))

  // Grouped mode keeps the label and its button out of the header.
  assert.equal(render(fake, { workspaces: [WORKSPACE] }), null)
  // A Workspace without a path has no sidebar menu either, so no button.
  assert.equal(menuButton(render(fake, {
    mode: 'flat', workspaces: [{ ...WORKSPACE, path: undefined }],
  })), undefined)
  unmount(fake)
})

test('opens the bridged target at the button’s bottom-left', () => {
  const menus = fakeMenus()
  const fake = mount({ 'dsh.workspace.view.v5': FLAT_STORE }, undefined, { menus })
  const node = render(fake, { mode: 'flat', workspaces: [WORKSPACE] })
  const button = menuButton(node)
  const event = {
    stopped: 0,
    stopPropagation() { this.stopped += 1 },
    currentTarget: {
      focused: 0,
      focus() { this.focused += 1 },
      getBoundingClientRect: () => ({ left: 120, bottom: 48 }),
    },
  }
  button.props.onClick(event)
  assert.equal(event.stopped, 1)
  assert.equal(event.currentTarget.focused, 1)
  assert.deepEqual(menus.calls.opened, [{
    target: {
      kind: 'dsh-session-workspace-label.workspace',
      value: { workspaceId: 'w-1', path: WORKSPACE.path, displayTitle: '默认工作区' },
    },
    point: { x: 120, y: 48 },
  }])
  unmount(fake)
})

test('closes its own menu on a second press', () => {
  const menus = fakeMenus()
  const fake = mount({ 'dsh.workspace.view.v5': FLAT_STORE }, undefined, { menus })
  const open = { kind: MENU_TARGET, value: { workspaceId: 'w-1' } }
  const node = render(fake, { mode: 'flat', workspaces: [WORKSPACE], active: open })
  const button = menuButton(node)
  let focused = 0
  button.props.onClick({
    stopPropagation() {},
    currentTarget: { focus() { focused += 1 }, getBoundingClientRect: () => ({ left: 0, bottom: 0 }) },
  })
  assert.equal(focused, 1)
  assert.equal(menus.calls.closed, 1)
  assert.equal(menus.calls.opened.length, 0)
  unmount(fake)
})

test('marks the button expanded while its own target is open', () => {
  const menus = fakeMenus()
  const fake = mount({ 'dsh.workspace.view.v5': FLAT_STORE }, undefined, { menus })
  const open = { kind: MENU_TARGET, value: { workspaceId: 'w-1' } }
  assert.equal(menuButton(render(fake, { mode: 'flat', workspaces: [WORKSPACE], active: open })).props['aria-expanded'], true)
  const other = { kind: MENU_TARGET, value: { workspaceId: 'w-2' } }
  assert.equal(menuButton(render(fake, { mode: 'flat', workspaces: [WORKSPACE], active: other })).props['aria-expanded'], false)
  unmount(fake)
})

test('falls back to a local ellipsis glyph without the shared icon module', () => {
  const menus = fakeMenus()
  const fake = mount({ 'dsh.workspace.view.v5': FLAT_STORE }, { primitives: null }, { menus })
  const node = render(fake, { mode: 'flat', workspaces: [WORKSPACE] })
  assert.equal(node.children.length, 3)
  const button = menuButton(node)
  assert.equal(button.children[0].type, 'svg')
  assert.equal(button.children[0].props.width, 16)
  assert.equal(button.children[0].children.length, 3)
  unmount(fake)
})
