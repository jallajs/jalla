var babel = require('babel-core')
var { addHook } = require('pirates')
var clearModule = require('clear-module')
var sourceMapSupport = require('source-map-support')

module.exports = compile

function compile (entry, app) {
  var inventory = new Set()
  var sourcemaps = new Map()

  app.on('bundle:file', function (file) {
    if (!/\.js$/.test(file)) return
    inventory.add(file)
  })

  app.on('update', function (file) {
    if (!/\.js$/.test(file)) return
    // files imported by split-require are not cleared with the entry file
    clearModule(file)
    clearModule(entry)
  })

  addHook(hook, { matcher })

  function matcher (file) {
    return inventory.has(file) && !/node_modules/.test(file)
  }

  function hook (code, file) {
    var res = babel.transform(code, {
      filename: file,
      sourceMaps: 'both',
      plugins: ['dynamic-import-split-require']
    })
    if (!sourcemaps.size) installSourceMapSupport()
    sourcemaps[file] = res.map
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
