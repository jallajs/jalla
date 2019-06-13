var fs = require('fs')
var path = require('path')
var chokidar = require('chokidar')

module.exports = assets

function assets (state, emit) {
  var watcher
  var dir = path.resolve(path.dirname(state.entry), 'assets')

  return function (cb) {
    if (watcher) return cb()
    watcher = chokidar.watch(dir)
    watcher.on('add', handler)
    watcher.on('change', function (file) {
      handler(file)
      emit('update')
    })
    watcher.on('unlink', remove)
    watcher.on('error', cb)
    watcher.on('ready', function () {
      if (!state.watch) watcher.close()
      cb()
    })
  }

  // register assets with jalla
  // str -> void
  function handler (file) {
    var uri = path.relative(dir, file)
    emit('progress', uri, 0)
    fs.readFile(file, function (err, buff) {
      if (err) return emit('error', err)
      emit('asset', uri, buff, { static: true })
    })
  }

  // unregister asset with jalla
  // str -> void
  function remove (file) {
    var uri = path.relative(dir, file)
    emit('remove', uri)
  }
}
