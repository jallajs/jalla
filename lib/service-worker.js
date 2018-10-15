var util = require('util')
var path = require('path')
var tinyify = require('tinyify')
var { get } = require('koa-route')
var exorcist = require('exorcist')
var babelify = require('babelify')
var envify = require('envify/custom')
var concat = require('concat-stream')
var browserify = require('browserify')
var browserslist = require('browserslist')
var watchify = require('watchify-middleware')
var babelPresetEnv = require('babel-preset-env')

var DEFAULT_BROWSERS = [
  'last 2 Chrome versions',
  'last 2 Firefox versions',
  'last 2 Safari versions',
  'last 2 Edge versions',
  '> 1%' // Cover all other browsers that are widely used.
]

module.exports = script

function script (entry, uri, app) {
  var cache = {}
  var watch = app.env === 'development'
  var env = Object.assign(appEnv(app), process.env)

  // b.transform(require('brfs'))

  app.emit('progress', entry, `${uri}.js`, 0)

  var b = bundle()
  app.on('bundle:style', rebundle)
  app.on('bundle:script', function (file) {
    if (file === app.entry) rebundle()
  })

  //               ↓ uri       ↓ type
  var route = `^\\/${uri}.*\\.(?=(js|map))[^.]*$`
  return get(new RegExp(route), function middleware (ctx, type) {
    ctx.type = `application/${type === 'map' ? 'json' : 'javascript'}`
    ctx.set('Cache-Control', `max-age=${watch ? 0 : 60 * 60 * 24 * 365}`)

    if (watch) {
      return new Promise(function (resolve, reject) {
        b.middleware(ctx.req, ctx.res)
        ctx.res.on('error', reject)
        ctx.res.on('end', resolve)
      })
    }

    if (app.context.assets[uri + '.js'].buffer) respond()
    else return util.promisify(b.once.bind(b, 'bundle'))().then(respond)

    function respond () {
      if (type === 'map') ctx.body = app.context.assets[uri + '.js'].map
      else ctx.body = app.context.assets[uri + '.js'].buffer
    }
  })

  // remove entry from cache and rerun bundle with latest env vars
  // () -> void
  function rebundle () {
    delete cache[entry]
    // bundle will trigger a watchify `pending` event, no need to overdo it
    if (!watch) app.emit('progress', entry, `${uri}.js`, 0)
    Object.assign(env, appEnv(app), process.env)
    b.bundle()
  }

  // create browserify bundle
  // () -> Browserify
  function bundle () {
    var b = browserify(entry, {
      debug: true,
      cache: cache,
      fullPaths: false, // FIXME: true on inspect
      packageCache: {}
    })

    // run envify regardless due to tinyify loosing the reference to env
    b.transform(envify(env))

    if (watch) {
      b.add(require.resolve('source-map-support/register'))
      b = watchify.emitter(b, { initialBundle: false })
      b.on('update', function (buff) {
        app.emit('bundle:script', entry, `${uri}.js`, buff)
      })
      b.on('pending', function (files) {
        files.forEach(app.emit.bind(app, 'update'))
        app.emit('progress', entry, `${uri}.js`, 0)
      })
      return b
    }

    var dir = path.dirname(entry)
    var browsers = browserslist(null, { path: dir })
    if (!browsers.length) browsers = DEFAULT_BROWSERS
    b.transform(babelify.configure({
      presets: [
        [babelPresetEnv, {
          targets: { browsers: browsers }
        }]
      ]
    }))

    b.plugin(tinyify, { env: env })

    b.on('bundle', function (bundle) {
      bundle.pipe(exorcist(concat({ encoding: 'buffer' }, function (buff) {
        app.context.assets[uri + '.js'].map = buff
      }), uri + '.js.map')).pipe(concat({ encoding: 'buffer' }, function (buff) {
        app.emit('bundle:script', entry, `${uri}.js`, buff)
      }))
    })

    return b
  }

  // compose env vars for bundle
  // App -> obj
  function appEnv (app) {
    var env = { NODE_ENV: app.env }
    env.ASSET_LIST = []
    for (let { url, file } of Object.values(app.context.assets)) {
      if (url && file !== entry) env.ASSET_LIST.push(url)
    }
    return env
  }
}
