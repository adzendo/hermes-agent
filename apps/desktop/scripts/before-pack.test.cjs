const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const {
  MAIN_BACKUP_BASENAME,
  bundleElectronMainForPack,
  cleanStaleAppOutDir,
  restoreElectronMainAfterPack
} = require('../scripts/before-pack.cjs')

function withTempDesktopRoot(fn) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-before-pack-root-'))
  const cleanup = () => fs.rmSync(tempRoot, { recursive: true, force: true })
  try {
    const electronDir = path.join(tempRoot, 'electron')
    const scriptsDir = path.join(tempRoot, 'scripts')
    fs.mkdirSync(electronDir, { recursive: true })
    fs.mkdirSync(scriptsDir, { recursive: true })
    fs.writeFileSync(path.join(electronDir, 'main.cjs'), "module.exports = 'source'\n", 'utf8')
    fs.writeFileSync(
      path.join(scriptsDir, 'bundle-electron-main.mjs'),
      [
        "import fs from 'node:fs'",
        "import path from 'node:path'",
        "const main = path.resolve(process.cwd(), 'electron/main.cjs')",
        "fs.writeFileSync(main, \"module.exports = 'bundled'\\n\", 'utf8')"
      ].join('\n'),
      'utf8'
    )
    const result = fn(tempRoot)
    if (result && typeof result.then === 'function') {
      return result.finally(cleanup)
    }
    cleanup()
    return result
  } catch (err) {
    cleanup()
    throw err
  }
}

test('cleanStaleAppOutDir removes a populated unpacked directory', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-before-pack-'))
  try {
    const appOutDir = path.join(tempRoot, 'linux-unpacked')
    fs.mkdirSync(appOutDir, { recursive: true })
    // Reproduce the corrupted partial state: license + payload present,
    // electron binary missing — exactly what trips the ENOENT rename.
    fs.writeFileSync(path.join(appOutDir, 'LICENSE.electron.txt'), 'x', 'utf8')
    fs.writeFileSync(path.join(appOutDir, 'resources.pak'), 'x', 'utf8')
    fs.mkdirSync(path.join(appOutDir, 'resources'), { recursive: true })
    fs.writeFileSync(path.join(appOutDir, 'resources', 'app.asar'), 'x', 'utf8')

    const removed = cleanStaleAppOutDir(appOutDir)

    assert.equal(removed, true)
    assert.equal(fs.existsSync(appOutDir), false)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
})

test('cleanStaleAppOutDir is a no-op when the directory is absent', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-before-pack-'))
  try {
    const missing = path.join(tempRoot, 'does-not-exist')
    assert.equal(cleanStaleAppOutDir(missing), false)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
})

test('cleanStaleAppOutDir ignores empty or invalid input', () => {
  assert.equal(cleanStaleAppOutDir(''), false)
  assert.equal(cleanStaleAppOutDir(undefined), false)
  assert.equal(cleanStaleAppOutDir(null), false)
  assert.equal(cleanStaleAppOutDir(42), false)
})

test('bundleElectronMainForPack backs up source and runs the bundler', () => {
  withTempDesktopRoot(root => {
    const main = path.join(root, 'electron', 'main.cjs')
    const backup = path.join(root, 'electron', MAIN_BACKUP_BASENAME)

    assert.equal(bundleElectronMainForPack(root), true)

    assert.match(fs.readFileSync(main, 'utf8'), /bundled/)
    assert.match(fs.readFileSync(backup, 'utf8'), /source/)
  })
})

test('restoreElectronMainAfterPack restores the source main and removes backup', () => {
  withTempDesktopRoot(root => {
    const main = path.join(root, 'electron', 'main.cjs')
    const backup = path.join(root, 'electron', MAIN_BACKUP_BASENAME)

    assert.equal(bundleElectronMainForPack(root), true)
    assert.equal(restoreElectronMainAfterPack(root), true)

    assert.match(fs.readFileSync(main, 'utf8'), /source/)
    assert.equal(fs.existsSync(backup), false)
  })
})

test('beforePack default export resolves with a temp desktop root', async () => {
  const { default: beforePack } = require('../scripts/before-pack.cjs')
  await withTempDesktopRoot(async root => {
    await assert.doesNotReject(beforePack({ appOutDir: '', desktopRoot: root, electronPlatformName: 'linux' }))
    assert.match(fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8'), /bundled/)
  })
})
