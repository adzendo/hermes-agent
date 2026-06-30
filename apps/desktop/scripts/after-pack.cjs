/**
 * after-pack.cjs — electron-builder afterPack hook.
 *
 * Restores source files that before-pack temporarily mutates for packaging and
 * stamps the Hermes icon + identity onto the packed Windows Hermes.exe via
 * rcedit (delegated to set-exe-identity.cjs).
 */

const path = require('node:path')

const { restoreElectronMainAfterPack } = require('./before-pack.cjs')
const { stampExeIdentity } = require('./set-exe-identity.cjs')

exports.default = async function afterPack(context) {
  const desktopRoot = context?.desktopRoot || path.resolve(__dirname, '..')
  if (restoreElectronMainAfterPack(desktopRoot)) {
    console.log('[after-pack] restored source electron/main.cjs after packaging')
  }

  if (context.electronPlatformName !== 'win32') {
    return
  }

  const productName = context.packager?.appInfo?.productFilename || 'Hermes'
  const exe = path.join(context.appOutDir, `${productName}.exe`)

  try {
    await stampExeIdentity(exe, desktopRoot)
  } catch (err) {
    // Never fail the build over a cosmetic stamp.
    console.warn(`[after-pack] exe identity stamp failed (${err.message}); Hermes.exe keeps the stock Electron icon`)
  }
}
