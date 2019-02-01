var fs = require('fs')
var path = require('path')
var mime = require('mime')
var chokidar = require('chokidar')

module.exports = assets

function assets (app) {
  var dir = path.resolve(path.dirname(app.entry), 'assets')
  var watcher = chokidar.watch(dir)

  watcher.on('add', update)
  watcher.on('change', update)
  watcher.on('unlink', remove)
  watcher.on('error', onerror)

  return function middleware (ctx, next) {
    var asset = Object.values(ctx.assets).find((asset) => asset.url === ctx.url)
    if (!asset) return next()
    ctx.type = mime.getType(asset.url)
    ctx.body = asset.buffer
  }

  // forward errors to jalla
  // Error -> void
  function onerror (err) {
    app.emit('error', err)
  }

  // register assets with jalla
  // str -> void
  function update (file) {
    var uri = path.relative(dir, file)
    app.emit('progress', file, uri, 0)
    fs.readFile(file, function (err, buff) {
      if (err) app.emit('error', err)
      else app.emit('register:asset', file, uri, buff)
    })
  }

  // unregister asset with jalla
  // str -> void
  function remove (file) {
    app.emit('remove:asset', file, path.relative(dir, file))
  }
}
