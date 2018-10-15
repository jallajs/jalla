var babel = require('babel-core')
var { addHook } = require('pirates')
var sourceMapSupport = require('source-map-support')

var splitRequire = require.resolve('split-require')

module.exports = compile

function compile (entry, app) {
  var maps = new Map()
  var inventory = new Set()

  app.on('bundle:file', function (file) {
    if (!/\.js$/.test(file)) return
    inventory.add(file)
  })

  app.on('update', function (file) {
    if (!/\.js$/.test(file)) return
    clearModuleCache(file)
  })

  addHook(hook, { matcher })

  function matcher (file) {
    return inventory.has(file) || require.cache[file].parent.id === splitRequire
  }

  function hook (code, filename) {
    var res = babel.transform(code, {
      sourceMaps: 'both',
      plugins: ['dynamic-import-split-require']
    })
    if (!maps.size) installSourceMapSupport()
    maps[filename] = res.map
    return res.code
  }

  function installSourceMapSupport () {
    sourceMapSupport.install({
      handleUncaughtExceptions: false,
      environment: 'node',
      retrieveSourceMap (source) {
        var map = maps.get(source)
        if (map) return { url: null, map: map }
        return null
      }
    })
  }
}

// test module name for native faile ending
// str -> bool
function isNotNativeModulePath (file) {
  return /\.node$/.test(file.id) === false
}

// test if file is in node_modules dir
// str -> bool
function isNotInNodeModules (file) {
  return /node_modules/.test(file.id) === false
}

// recursively clear module cache for given module name
// str -> void
function clearModuleCache (key) {
  if (!require.cache[key]) return

  require.cache[key].children
    .filter(isNotNativeModulePath)
    .filter(isNotInNodeModules)
    .forEach(function (child) {
      clearModuleCache(child.id)
    })

  delete require.cache[key]
}
