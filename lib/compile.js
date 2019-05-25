var babel = require('babel-core')
var { addHook } = require('pirates')
var clearModule = require('clear-module')
var sourceMapSupport = require('source-map-support')

var SCRIPT = /\.js$/

module.exports = compile

function compile (state, emit) {
  var sourcemaps = new Map()

  addHook(hook, { matcher })

  return function (cb) {
    for (let dep of state.deps) {
      if (SCRIPT.test(dep)) clearModule(dep)
    }
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
