/**
 * Pin this plugin's DSH type packages to the installation that runs here.
 *
 *   node scripts/sync-types.mjs           print the `pnpm add -D` command
 *   node scripts/sync-types.mjs --check   fail when package.json pins another version
 *
 * The declarations come from npm, not from the running app: the Desktop archive
 * ships no `.d.ts`. Pinning the running versions keeps the checked declarations
 * in step with the code that will execute them.
 *
 * The Desktop archive is an ASAR, which an ordinary Node cannot read; when the
 * direct read fails, the versions come from `DSH_NODE_EXECUTABLE`, the Electron
 * binary that carries ASAR support.
 */

import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CHECK = process.argv.includes('--check')

const installDir = process.env.DSH_INSTALL_DIR
if (installDir === undefined || installDir === '') {
  console.error('DSH_INSTALL_DIR is unset; run this inside a DSH shell.')
  process.exit(1)
}

interface Versions {
  dsh: string
  cordis: string
}

/** The CLI version and the Cordis version the installation carries. */
function installedVersions(installDir: string): Versions {
  try {
    const dsh = JSON.parse(require('node:fs').readFileSync(resolve(installDir, 'package.json'), 'utf8'))
    const cordis = JSON.parse(require('node:fs').readFileSync(
      resolve(dirname(require.resolve('@deepseek-ai/cordis/package.json', { paths: [installDir] })), 'package.json'),
      'utf8',
    ))
    return { dsh: dsh.version, cordis: cordis.version }
  } catch (error) {
    const electron = process.env.DSH_NODE_EXECUTABLE
    if (electron === undefined || electron === '') throw error
    const script = `
      const { createRequire } = require('node:module')
      const { resolve, dirname } = require('node:path')
      const install = ${JSON.stringify(installDir)}
      const req = createRequire(resolve(install, 'package.json'))
      const dsh = req('./package.json').version
      const cordis = req('@deepseek-ai/cordis/package.json').version
      console.log(JSON.stringify({ dsh, cordis }))
    `
    const out = execFileSync(electron, ['-e', script], {
      encoding: 'utf8',
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    })
    return JSON.parse(out.trim())
  }
}

const versions = installedVersions(installDir)
const dshVersion = versions.dsh
const cordisVersion = versions.cordis

const expected = (name: string) => (name === '@deepseek-ai/cordis' ? cordisVersion : dshVersion)

const pkg = JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf8')) as { devDependencies?: Record<string, string> }
const devDependencies = pkg.devDependencies ?? {}
const pinned = Object.keys(devDependencies).filter((name) => name.startsWith('@deepseek-ai/'))

if (pinned.length === 0) {
  console.error('package.json has no @deepseek-ai devDependencies; add the packages this plugin types against.')
  process.exit(1)
}

let mismatch = false
for (const name of pinned) {
  const want = expected(name)
  const have = devDependencies[name]
  if (have !== want) {
    mismatch = true
    console.error(`${name}: package.json has ${have}, installation needs ${want}`)
  }
}

if (CHECK) {
  if (mismatch) {
    console.error(`Run: node scripts/sync-types.mjs  (DSH ${dshVersion}, cordis ${cordisVersion})`)
    process.exitCode = 1
  } else {
    console.log(`type packages match DSH ${dshVersion} / cordis ${cordisVersion}.`)
  }
} else {
  const installs = pinned.map((name) => `${name}@${expected(name)}`).join(' ')
  console.log(`pnpm add -D ${installs}`)
  if (mismatch) console.error(`\nDSH ${dshVersion} / cordis ${cordisVersion}; run the command above to repin.`)
}
