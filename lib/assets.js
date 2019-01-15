var fs = require('fs')
var path = require('path')
var chokidar = require('chokidar')

module.exports = assets

function assets (app) {
  var dir = path.resolve(path.dirname(app.entry), 'assets')
  var watcher = chokidar.watch(dir)

  watcher.on('add', update)
  watcher.on('change', update)
  watcher.on('unlink', remove)

  function update (file) {
    var uri = path.relative(dir, file)
    app.emit('progress', file, uri, 0)
    fs.readFile(file, function (err, buff) {
      if (err) app.emit('error', err)
      else app.emit('register:asset', file, uri, buff)
    })
  }

  function remove (file) {
    app.emit('unlink:asset', file, path.relative(dir, file))
  }
}
