var babel = require('babel-core')
var { addHook } = require('pirates')
var clearModule = require('clear-module')
var sourceMapSupport = require('source-map-support')

module.exports = compile

function compile (state, emit) {
  var sourcemaps = new Map()

  addHook(hook, { matcher })

  return function (cb) {
    // files imported by split-require are not cleared with the entry file
    var cached = require.cache[state.entry]
    clearModule(state.entry)
    clearRequireChildren(cached, state.entry)
    cb()
  }

  function matcher (file) {
    if (/node_modules/.test(file)) return false
    return state.deps.has(file)
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
