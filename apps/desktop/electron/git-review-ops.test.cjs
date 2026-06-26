'use strict'

const assert = require('node:assert/strict')
const Module = require('node:module')
const test = require('node:test')

const modulePath = require.resolve('./git-review-ops.cjs')
const { resolveRenamePath } = require('./git-review-ops.cjs')

test('module loads even when simple-git is absent from packaged app', async t => {
  delete require.cache[modulePath]

  const originalLoad = Module._load
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'simple-git' || String(request).includes('/simple-git')) {
      const err = new Error("Cannot find module 'simple-git'")
      err.code = 'MODULE_NOT_FOUND'
      throw err
    }

    return originalLoad.apply(this, arguments)
  }

  t.after(() => {
    Module._load = originalLoad
    delete require.cache[modulePath]
    require('./git-review-ops.cjs')
  })

  const ops = require('./git-review-ops.cjs')

  assert.equal(ops.resolveRenamePath('old.ts => new.ts'), 'new.ts')
  assert.equal(await ops.repoStatus('/definitely/not/a/repo'), null)
})

test('resolveRenamePath: plain path is unchanged', () => {
  assert.equal(resolveRenamePath('src/a.ts'), 'src/a.ts')
})

test('resolveRenamePath: simple rename resolves to the new path', () => {
  assert.equal(resolveRenamePath('old.ts => new.ts'), 'new.ts')
})

test('resolveRenamePath: brace rename resolves to the new path', () => {
  assert.equal(resolveRenamePath('src/{old => new}/file.ts'), 'src/new/file.ts')
})

test('resolveRenamePath: brace rename collapsing a segment', () => {
  assert.equal(resolveRenamePath('src/{lib => }/file.ts'), 'src/file.ts')
})
