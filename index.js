var path = require('path')
var assert = require('assert')
var crypto = require('crypto')
var {get} = require('koa-route')
var serve = require('koa-static')
var ui = require('./lib/ui')
var App = require('./lib/app')
var style = require('./lib/style')
var script = require('./lib/script')
var render = require('./lib/render')
var manifest = require('./lib/manifest')

module.exports = start

function start (entry, opts = {}) {
  assert(typeof entry === 'string', 'jalla: entry should be a string')
  entry = absolute(entry)

  var dir = path.dirname(entry)
  var sw = opts.sw && absolute(opts.sw, dir)
  var css = opts.css && absolute(opts.css, dir)
  var app = new App()
  app.entry = entry
  app.silent = true

  if (!opts.quiet) ui(app)

  app.on('bundle:script', function (file, buf) {
    if (file !== entry) return
    app.context.script = {
      buffer: buf,
      hash: crypto.createHash('sha512').update(buf).digest('buffer')
    }
  })
  app.on('bundle:style', function (file, buf) {
    app.context.style = {
      buffer: buf,
      hash: crypto.createHash('sha512').update(buf).digest('buffer')
    }
  })

  app.use(async function (ctx, next) {
    var start = Date.now()
    await next()
    app.emit('timing', Date.now() - start, ctx)
  })

  app.use(require('koa-conditional-get')())
  app.use(require('koa-etag')())

  if (process.env.NODE_ENV !== 'development') {
    app.use(require('./lib/queue')(app))
  }

  if (sw) app.use(get(/^\/(sw|service-worker)\.js(\.map)?$/, script(sw, app)))
  app.use(get(/^\/(\w+\/)?bundle\.js(\.map)?$/, script(entry, app)))
  app.use(get(/^\/(\w+\/)?bundle\.css(\.map)?$/, style(css, app)))

  if (app.env === 'development') app.use(serve(dir, {maxage: 0}))
  app.use(serve(path.resolve(dir, 'assets'), {maxage: 1000 * 60 * 60 * 24 * 365}))
  app.use(get('/manifest.json', manifest(app)))

  app.use(render(entry))

  return app
}

function absolute (file, dir = '') {
  if (path.isAbsolute(file)) return file
  return path.resolve(dir, file)
}
