var util = require('util')
var path = require('path')
var assert = require('assert')
var serve = require('koa-static')
var compose = require('koa-compose')
var App = require('./lib/app')
var render = require('./lib/render')

module.exports = start

function start (entry, opts = {}) {
  assert(typeof entry === 'string', 'jalla: entry should be type string')
  entry = absolute(entry)

  var dir = path.dirname(entry)

  opts = Object.assign({}, opts, {
    serve: Boolean(opts.serve),
    sw: opts.sw && absolute(opts.sw, dir),
    css: opts.css && absolute(opts.css, dir),
    dist: absolute(typeof opts.serve === 'string' ? opts.serve : 'dist', dir)
  })

  var app = new App(entry, opts)

  app.use(async function (ctx, next) {
    var start = Date.now()
    await next()
    app.emit('timing', Date.now() - start, ctx)
  })

  if (opts.serve) {
    let pub = path.resolve(opts.dist, 'public')
    app.use(serve(pub, { maxage: 1000 * 60 * 60 * 24 * 365 }))
  } else {
    let state = Object.assign({
      env: app.env,
      base: opts.base || '',
      watch: typeof opts.watch === 'undefined'
        ? app.env === 'development'
        : opts.watch
    }, opts)
    let bundle = util.promisify(app.pipeline.bundle.bind(app.pipeline))
    let init = bundle(entry, state)

    app.use(compose([
      // defer response until initial bundle finishes
      (ctx, next) => init.then(() => next()),
      // serve bundeled assets
      app.pipeline.middleware(),
      // apply cache control
      function (ctx, next) {
        if (ctx.body) {
          let cache = this.env !== 'development' && !opts.watch
          let maxAge = cache ? 60 * 60 * 24 * 365 : 0
          ctx.set('Cache-Control', `public, max-age=${maxAge}`)
        }
        return next()
      }
    ]))
  }

  app.use(require('koa-conditional-get')())
  app.use(require('koa-etag')())
  app.use(render(entry, app))

  return app
}

// resolve file path (relative to dir) to absolute path
// (str, str?) -> str
function absolute (file, dir = '') {
  if (path.isAbsolute(file)) return file
  return path.resolve(dir, file)
}
