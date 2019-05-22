var path = require('path')
var assert = require('assert')
var App = require('./lib/app')
var render = require('./lib/render')

module.exports = start

function start (entry, opts = {}) {
  assert(typeof entry === 'string', 'jalla: entry should be type string')
  entry = absolute(entry)

  var dir = path.dirname(entry)
  var sw = opts.sw && absolute(opts.sw, dir)
  var css = opts.css && absolute(opts.css, dir)
  var dist = opts.serve && absolute(typeof opts.serve === 'string' ? opts.serve : 'dist', dir)
  var app = new App(entry, Object.assign({}, opts, { sw, css, dist }))

  app.use(async function (ctx, next) {
    var start = Date.now()
    await next()
    app.emit('timing', Date.now() - start, ctx)
  })

  app.use(require('koa-conditional-get')())
  app.use(require('koa-etag')())

  if (opts.serve) {
    try {
      // pick up stat of existing build
      let stat = require(path.resolve(dist, '__stat__.json'))
      for (let asset of stat.assets) {
        app.pipeline.assets.set(asset.id, asset)
      }
      // use bundled entry file for rendering
      // TODO: compile node bundle
      entry = path.resolve(dist, app.pipeline.assets.get('bundle.js'))
    } catch (err) {
      this.emit('error', Error('Failed to load stat from serve directory'))
    }
  }

  app.use(render(entry, app))

  return app
}

// resolve file path (relative to dir) to absolute path
// (str, str?) -> str
function absolute (file, dir = '') {
  if (path.isAbsolute(file)) return file
  return path.resolve(dir, file)
}
