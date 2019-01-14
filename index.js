var path = require('path')
var mime = require('mime')
var assert = require('assert')
var serve = require('koa-static')
var { get } = require('koa-route')
var App = require('./lib/app')
var defer = require('./lib/defer')
var style = require('./lib/style')
var script = require('./lib/script')
var render = require('./lib/render')
var manifest = require('./lib/manifest')
var serviceWorker = require('./lib/service-worker')

module.exports = start

function start (entry, opts = {}) {
  assert(typeof entry === 'string', 'jalla: entry should be type string')
  entry = absolute(entry)

  var dir = path.dirname(entry)
  var sw = opts.sw && absolute(opts.sw, dir)
  var css = opts.css && absolute(opts.css, dir)
  var dist = typeof opts.serve === 'string' ? absolute(opts.serve) : 'dist'
  var app = new App(entry, Object.assign({}, opts, { sw, css }))
  var served = new Set()

  app.use(async function (ctx, next) {
    var start = Date.now()
    await next()
    app.emit('timing', Date.now() - start, ctx)
  })

  app.use(require('koa-conditional-get')())
  app.use(require('koa-etag')())

  if (opts.serve) {
    let serve = typeof opts.serve === 'string' ? opts.serve : 'dist'
    try {
      Object.assign(app.context.assets, require(absolute('.map.json', serve)))
    } catch (err) {
      app.emit('error', Error('Could not find build map in serve directory'))
    }
  } else {
    app.on('bundle:asset', onasset)
    if (app.env !== 'development') app.use(defer(app, (ctx, next) => next()))
    if (sw) app.use(serviceWorker(sw, path.basename(sw, '.js'), app))
    app.use(style(css, 'bundle', app))
    app.use(script(entry, 'bundle', app))
  }

  var maxage = (app.env === 'development') ? 0 : 1000 * 60 * 60 * 24 * 365
  if (app.env === 'development') app.use(serve(dir, { maxage: 0 }))
  app.use(serve(path.resolve(dir, 'assets'), { maxage }))
  app.use(serve(path.resolve(dir, dist), { maxage, setHeaders }))

  app.use(render(entry, app))
  app.use(get('/manifest.json', manifest(app)))

  return app

  // serve assets from memory
  // (str, str, Buffer) -> void
  function onasset (file, uri, buff) {
    if (!served.has(uri)) {
      served.add(uri)
      app.use(get(uri, function (ctx, next) {
        ctx.type = mime.getType(uri)
        ctx.body = app.context.assets[uri].buffer
      }))
    }
  }
}

// set custom cache headers for built files
function setHeaders (res, path) {
  if (/bundle.*\.map$/.test(path)) res.setHeaders('Cache-Control', 'max-age=0')
}

// resolve file path (relative to dir) to absolute path
// (str, str?) -> str
function absolute (file, dir = '') {
  if (path.isAbsolute(file)) return file
  return path.resolve(dir, file)
}
