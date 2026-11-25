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
import { realpathSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(import.meta.url), '../..')

export interface Versions {
  dsh: string
  cordis: string
}

/** Resolve versions for `names` from `installDir`, falling back to `dsh` for unexported subpackages. */
export function installedPackageVersions(
  names: readonly string[],
  installDir: string | undefined = process.env.DSH_INSTALL_DIR,
): Record<string, string> {
  if (!installDir) throw new Error('DSH_INSTALL_DIR is unset; run this inside a DSH shell.')
  try {
    const req = createRequire(resolve(installDir, 'package.json'))
    const dshVersion = (req('./package.json') as { version: string }).version
    const resolved: Record<string, string> = {}
    for (const name of names) {
      try {
        resolved[name] = (req(`${name}/package.json`) as { version: string }).version
      } catch {
        resolved[name] = dshVersion
      }
    }
    return resolved
  } catch (error) {
    const electron = process.env.DSH_NODE_EXECUTABLE
    if (electron === undefined || electron === '') throw error
    const script = `
      const { createRequire } = require('node:module')
      const { resolve } = require('node:path')
      const install = ${JSON.stringify(installDir)}
      const names = ${JSON.stringify([...names])}
      const req = createRequire(resolve(install, 'package.json'))
      const dsh = req('./package.json').version
      const resolved = {}
      for (const name of names) {
        try {
          resolved[name] = req(name + '/package.json').version
        } catch {
          resolved[name] = dsh
        }
      }
      console.log(JSON.stringify(resolved))
    `
    const out = execFileSync(electron, ['-e', script], {
      encoding: 'utf8',
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    })
    return JSON.parse(out.trim()) as Record<string, string>
  }
}

/** The CLI version and the Cordis version the installation carries. */
export function installedVersions(): Versions {
  const installDir = process.env.DSH_INSTALL_DIR
  if (!installDir) throw new Error('DSH_INSTALL_DIR is unset; run this inside a DSH shell.')
  const resolved = installedPackageVersions(['@deepseek-ai/dsh', '@deepseek-ai/cordis'], installDir)
  return { dsh: resolved['@deepseek-ai/dsh'], cordis: resolved['@deepseek-ai/cordis'] }
}

async function main() {
  if (process.argv.includes('--check') && !process.env.DSH_INSTALL_DIR && process.env.CI) {
    console.log('skipping DSH type-pin check in CI (DSH_INSTALL_DIR is unset).')
    return
  }

  const pkg = JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf8')) as { devDependencies?: Record<string, string> }
  const devDependencies = pkg.devDependencies ?? {}
  const pinned = Object.keys(devDependencies).filter((name) => name.startsWith('@deepseek-ai/'))

  if (pinned.length === 0) {
    throw new Error('package.json has no @deepseek-ai devDependencies; add the packages this plugin types against.')
  }

  const resolved = installedPackageVersions(pinned)
  const { dsh: dshVersion, cordis: cordisVersion } = installedVersions()

  let mismatch = false
  for (const name of pinned) {
    const want = resolved[name]
    const have = devDependencies[name]
    if (have !== want) {
      mismatch = true
      console.error(`${name}: package.json has ${have}, installation needs ${want}`)
    }
  }

  if (process.argv.includes('--check')) {
    if (mismatch) {
      console.error(`Run: node scripts/sync-types.mjs  (DSH ${dshVersion}, cordis ${cordisVersion})`)
      process.exitCode = 1
    } else {
      console.log(`type packages match DSH ${dshVersion} / cordis ${cordisVersion}.`)
    }
  } else {
    const installs = pinned.map((name) => `${name}@${resolved[name]}`).join(' ')
    console.log(`pnpm add -D ${installs}`)
    if (mismatch) console.error(`\nDSH ${dshVersion} / cordis ${cordisVersion}; run the command above to repin.`)
  }
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  await main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
