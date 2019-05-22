var babel = require('babel-core')
var { addHook } = require('pirates')
var clearModule = require('clear-module')
var sourceMapSupport = require('source-map-support')

module.exports = compile

function compile (state, emitter, cb) {
  var inventory = new Set([state.entry])
  var sourcemaps = new Map()

  emitter.on('dep', function (file) {
    if (/node_modules/.test(file)) return
    if (!/\.js$/.test(file)) return
    inventory.add(file)
  })

  emitter.on('progress', function () {
    // files imported by split-require are not cleared with the entry file
    var cached = require.cache[state.entry]
    clearModule(state.entry)
    clearRequireChildren(cached, state.entry)
  })

  emitter.on('bundle', cb)

  addHook(hook, { matcher })

  function matcher (file) {
    return inventory.has(file)
  }

  function hook (code, file) {
    var res = babel.transform(code, {
      filename: file,
      sourceMaps: 'both',
      plugins: ['dynamic-import-split-require']
    })
    if (!sourcemaps.size) installSourceMapSupport()
    sourcemaps.set(file, res.map)
    return res.code
  }

  // add support for error stack traces in compiled code
  // () -> void
  function installSourceMapSupport () {
    sourceMapSupport.install({
      handleUncaughtExceptions: false,
      environment: 'node',
      retrieveSourceMap (source) {
        var map = sourcemaps.get(source)
        if (map) return { url: null, map: map }
        return null
      }
    })
  }
}

// recursively clear require children
// str -> void
function clearRequireChildren (module, key) {
  if (!module || !module.children) return
  module.children
    .filter((module) => /\.node$/.test(module.id) === false)
    .filter((module) => /node_modules/.test(module.id) === false)
    .forEach(function (child) {
      clearRequireChildren(child, child.id)
    })

  delete require.cache[key]
}
