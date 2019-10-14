var path = require('path')
var assert = require('assert')
var serve = require('koa-static')
var App = require('./lib/app')
var render = require('./lib/render')

module.exports = start

function start (entry, opts = {}) {
  assert(typeof entry === 'string', 'jalla: entry should be type string')
  entry = absolute(entry)

  var dir = path.dirname(entry)
  var dist = opts.dist
  if (!dist) dist = typeof opts.serve === 'string' ? opts.serve : 'dist'

  opts = Object.assign({}, opts, {
    dist: absolute(dist, dir),
    serve: Boolean(opts.serve),
    sw: opts.sw && absolute(opts.sw, dir),
    css: opts.css && absolute(opts.css, dir)
  })

  var app = new App(entry, opts)

  app.use(async function (ctx, next) {
    var start = Date.now()
    await next()
    app.emit('timing', Date.now() - start, ctx)
  })

  app.use(require('koa-conditional-get')())
  app.use(require('koa-etag')())
  app.use(render(app))

  if (opts.serve) {
    app.use(serve(path.resolve(opts.dist, 'public'), { setHeaders }))
  } else {
    app.use(app.pipeline.middleware(app.state))
  }

  return app
}

// set static asset headers
// (obj, str, obj) -> void
function setHeaders (res, path, stats) {
  res.setHeader('Cache-Control', `public, max-age=${60 * 60 * 24 * 365}`)
}

// resolve file path (relative to dir) to absolute path
// (str, str?) -> str
function absolute (file, dir = '') {
  if (path.isAbsolute(file)) return file
  return path.resolve(dir, file)
}
