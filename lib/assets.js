var fs = require('fs')
var path = require('path')
var chokidar = require('chokidar')

module.exports = assets

function assets (state, emitter, cb) {
  var watcher
  var dir = path.resolve(path.dirname(state.entry), 'assets')

  emitter.on('bundle', function () {
    if (watcher) return
    watcher = chokidar.watch(dir)
    watcher.on('add', update)
    watcher.on('change', update)
    watcher.on('unlink', remove)
    watcher.on('error', cb)
    watcher.on('ready', cb)
  })

  // register assets with jalla
  // str -> void
  function update (file) {
    var uri = path.relative(dir, file)
    emitter.emit('progress', uri, 0)
    fs.readFile(file, function (err, buff) {
      if (err) return cb(err)
      emitter.emit('asset', uri, buff, {
        immutable: true
      })
      cb()
    })
  }

  // unregister asset with jalla
  // str -> void
  function remove (file) {
    var uri = path.relative(dir, file)
    emitter.emit('remove', uri)
  }
}
