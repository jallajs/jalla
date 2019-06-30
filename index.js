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

  if (opts.serve) {
    let pub = path.resolve(opts.dist, 'public')
    app.use(serve(pub, { setHeaders }))
  } else {
    let state = Object.assign({
      watch: typeof opts.watch === 'undefined'
        ? app.env === 'development'
        : opts.watch
    }, app.state)
    let init = new Promise(function (resolve, reject) {
      app.pipeline.bundle(entry, state, resolve)
    })

    app.use((ctx, next) => init.then(next))
    app.use(app.pipeline.middleware())
    app.use(function (ctx, next) {
      if (ctx.body) {
        let cache = state.env !== 'development' && !state.watch
        let maxAge = cache ? 60 * 60 * 24 * 365 : 0
        let value = `${cache ? 'public, ' : ''}max-age=${maxAge}`
        ctx.set('Cache-Control', value)
      }
      return next()
    })
  }

  app.use(require('koa-conditional-get')())
  app.use(require('koa-etag')())
  app.use(render(app))

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
