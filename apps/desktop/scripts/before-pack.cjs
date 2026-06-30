'use strict'

/**
 * before-pack.cjs — electron-builder beforePack hook.
 *
 * 1. Removes any stale unpacked app directory (`appOutDir`) before
 *    electron-builder stages the Electron binaries into it.
 * 2. Bundles `electron/main.cjs` in-place for the duration of packaging so the
 *    app.asar is self-contained even though `beforeBuild` returns false and
 *    electron-builder does not collect `node_modules`.
 *
 * WHY THE CLEANUP EXISTS
 * ----------------------
 * electron-builder's final packaging step copies the stock `electron`
 * binary into `release/<platform>-unpacked/` and then renames it to the
 * product name (`Hermes`). If a PREVIOUS `npm run pack` was interrupted
 * (Ctrl-C, OOM kill, crash, full disk) the unpacked directory is left in a
 * corrupted partial state: it keeps the already-renamed `LICENSE.electron.txt`
 * and the Chromium payload (.pak/.so/icudtl.dat/chrome-sandbox) but is MISSING
 * the `electron` binary itself.
 *
 * On the next run, electron-builder sees the destination directory already
 * populated, skips re-copying the binary it thinks is present, then tries to
 * rename a `electron` file that no longer exists. The build dies with:
 *
 *   ENOENT: no such file or directory, rename
 *   '.../release/linux-unpacked/electron' -> '.../release/linux-unpacked/Hermes'
 *
 * The packaging step is not idempotent across an interrupted run, so we make
 * it idempotent ourselves: wipe the target unpacked directory up front so
 * electron-builder always stages into a clean tree. This is safe — the
 * directory is a pure build artifact that electron-builder fully recreates
 * on every pack; nothing else depends on its prior contents.
 *
 * WHY THE BUNDLE EXISTS
 * ---------------------
 * `beforeBuild` intentionally returns false to skip electron-builder's
 * node_modules collector; otherwise the workspace dependency graph explodes
 * and packaging becomes non-deterministic. That means any CommonJS dependency
 * imported by Electron main must either be shipped manually or bundled into
 * main.cjs. Nix already does this with `scripts/bundle-electron-main.mjs`.
 * The electron-builder path must do the same; otherwise packaged Hermes.app
 * starts with runtime errors like:
 *
 *   Error: Cannot find module 'simple-git'
 *   Require stack: electron/git-review-ops.cjs -> electron/main.cjs
 *
 * We back up the source `electron/main.cjs`, run the existing bundler in-place
 * before app.asar is created, then `after-pack.cjs` restores the source file.
 *
 * electron-builder passes a context with:
 *   - appOutDir:            the unpacked app directory about to be staged
 *   - electronPlatformName: 'win32' | 'darwin' | 'linux'
 */

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const MAIN_BACKUP_BASENAME = 'main.cjs.before-pack-source'

function desktopRoot(defaultRoot = path.resolve(__dirname, '..')) {
  return defaultRoot
}

function mainPaths(root = desktopRoot()) {
  const main = path.join(root, 'electron', 'main.cjs')
  return {
    main,
    backup: path.join(path.dirname(main), MAIN_BACKUP_BASENAME),
    bundler: path.join(root, 'scripts', 'bundle-electron-main.mjs')
  }
}

function cleanStaleAppOutDir(appOutDir) {
  if (!appOutDir || typeof appOutDir !== 'string') {
    return false
  }
  if (!fs.existsSync(appOutDir)) {
    return false
  }
  // Recursive + force so a half-written tree (read-only bits, partial files)
  // can't block the wipe. retry/maxRetries rides out transient EBUSY on
  // Windows where an AV/indexer may briefly hold a handle.
  fs.rmSync(appOutDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  return true
}

function bundleElectronMainForPack(root = desktopRoot(), spawn = spawnSync) {
  const { main, backup, bundler } = mainPaths(root)
  if (!fs.existsSync(main)) {
    throw new Error(`Electron main not found: ${main}`)
  }
  if (!fs.existsSync(bundler)) {
    throw new Error(`Electron main bundler not found: ${bundler}`)
  }

  // If a prior interrupted pack left the backup behind, restore it first so we
  // never bundle an already-bundled file into itself.
  if (fs.existsSync(backup)) {
    fs.copyFileSync(backup, main)
  } else {
    fs.copyFileSync(main, backup)
  }

  const result = spawn(process.execPath, [bundler], {
    cwd: root,
    env: process.env,
    stdio: 'inherit'
  })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`Electron main bundler exited ${result.status}`)
  }
  return true
}

function restoreElectronMainAfterPack(root = desktopRoot()) {
  const { main, backup } = mainPaths(root)
  if (!fs.existsSync(backup)) {
    return false
  }
  fs.copyFileSync(backup, main)
  fs.rmSync(backup, { force: true })
  return true
}

exports.cleanStaleAppOutDir = cleanStaleAppOutDir
exports.bundleElectronMainForPack = bundleElectronMainForPack
exports.restoreElectronMainAfterPack = restoreElectronMainAfterPack
exports.MAIN_BACKUP_BASENAME = MAIN_BACKUP_BASENAME

exports.default = async function beforePack(context) {
  const appOutDir = context && context.appOutDir
  const root = context?.desktopRoot || desktopRoot()
  try {
    if (cleanStaleAppOutDir(appOutDir)) {
      console.log(`[before-pack] removed stale unpacked dir before staging: ${appOutDir}`)
    }
  } catch (err) {
    // Never fail the build over cleanup; surface why so a genuinely stuck
    // directory (permissions, mount) is still diagnosable.
    console.warn(`[before-pack] could not clean ${appOutDir} (${err.message}); continuing`)
  }

  try {
    if (bundleElectronMainForPack(root)) {
      console.log('[before-pack] bundled electron/main.cjs for self-contained app.asar')
    }
  } catch (err) {
    console.error(`[before-pack] failed to bundle electron/main.cjs (${err.message})`)
    throw err
  }
}
