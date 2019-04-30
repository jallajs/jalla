var path = require('path')
var assert = require('assert')
var serve = require('koa-static')
var App = require('./lib/app')
var defer = require('./lib/defer')
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
      // pick up build map of existing build
      let map = require(absolute('__stat__.json', dist))
      Object.assign(app.context.assets, map.assets)
      // emit bundle event for all files in build
      map.files.forEach((file) => app.emit('bundle:file', file))
    } catch (err) {
      app.emit('error', Error('Failed to load build map from serve directory'))
    }
    // serve build dir
    app.use(serve(dist, { maxage: 60 * 60 * 24 * 365 }))
  } else {
    // spare serverless platforms from having to import build modules
    let style = require('./lib/style')
    let assets = require('./lib/assets')
    let script = require('./lib/script')
    let serviceWorker = require('./lib/service-worker')

    // defer any response until everything is bundled (non-watch mode)
    if (app.env !== 'development') app.use(defer(app, (ctx, next) => next()))

    // compile and serve bundles and assets
    if (sw) app.use(serviceWorker(sw, path.basename(sw, '.js'), app))
    app.use(style(css, 'bundle', app))
    app.use(script(entry, 'bundle', app))
    app.use(assets(app))
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
