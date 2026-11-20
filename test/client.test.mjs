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
}
/** Marker standing in for the shared folder icon component. */
const FOLDER_ICON = function IconFolderCloseRegular() { return null }
const PRIMITIVES = { IconFolderCloseRegular: FOLDER_ICON }
const load = ({ primitives = PRIMITIVES } = {}) => registration.factory(moduleName => {
  if (moduleName === 'react') return React
  if (moduleName === '@deepseek-ai/dsh-client-ui-primitives') {
    if (primitives === undefined || primitives === null) throw new Error('missing shared icon module')
    return primitives
  }
  throw new Error('unexpected module ' + moduleName)
})

assert.equal(registration.id, 'dsh-session-workspace-label')

/** A minimal host: recorded effects, locale namespaces, and slot entries. */
function fakeContext() {
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
  }
  return { ctx, effects, namespaces, entries }
}

const FLAT_STORE = JSON.stringify({ groupBy: 'flat', orderBy: 'updated', sessionOrderByAccount: {} })

/**
 * Apply one plugin instance over a seeded storage.
 * @param seed - localStorage entries visible to the plugin.
 * @param modules - browser modules the bundle may require.
 */
function mount(seed = {}, modules) {
  globalThis.window.localStorage = fakeStorage(seed)
  const fake = fakeContext()
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
 * @param options - mode, Workspaces snapshot, and Session to render.
 */
function render(fake, { mode = 'workspace', workspaces = [], sessionId = 'session-1', t } = {}) {
  const { descriptor, Component } = fake.entries[0]
  const injected = descriptor.inject(sessionId)
  return Component({
    ...injected,
    useWorkspaces: selector => selector({ items: workspaces }),
    useFlatSidebar: selector => selector(mode),
    t: t ?? ((key, params) => key === 'workspace.defaultName'
      ? '默认工作区'
      : `${key}:${params?.workspace}`),
  })
}

/** The text span is always the last child, with or without the folder glyph. */
const labelText = node => node.children[node.children.length - 1].children[0]

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
  assert.equal(node.props.title, 'hint:默认工作区')
  // Cancels the breadcrumb's 8px trailing padding so the label sits one
  // cluster gap from the title instead of a padding plus a gap away.
  assert.equal(node.props.style.marginInlineStart, '-8px')
  unmount(fake)
})

test('keeps a user-chosen Workspace title verbatim', () => {
  const fake = mount({ 'dsh.workspace.view.v5': FLAT_STORE })
  const node = render(fake, { mode: 'flat', workspaces: [{ ...WORKSPACE, title: 'My Project' }] })
  assert.equal(labelText(node), 'My Project')
  assert.equal(node.props.title, 'hint:My Project')
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
