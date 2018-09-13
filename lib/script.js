var util = require('util')
var path = require('path')
var {get} = require('koa-route')
var exorcist = require('exorcist')
var concat = require('concat-stream')
var browserify = require('browserify')
var browserslist = require('browserslist')
var splitRequire = require('split-require')
var watchify = require('watchify-middleware')

var DEFAULT_BROWSERS = [
  'last 2 Chrome versions',
  'last 2 Firefox versions',
  'last 2 Safari versions',
  'last 2 Edge versions',
  '> 1%' // Cover all other browsers that are widely used.
]

module.exports = script

function script (entry, uri, app) {
  var watch = app.env === 'development'

  var b = browserify(entry, {
    cache: {},
    debug: true,
    fullPaths: false, // FIXME: true on inspect
    packageCache: {}
  })

  b.on('file', function (file, id, parent) {
    if (!/node_modules/.test(file)) app.emit('bundle:file', file)
  })

  // b.transform(require('brfs'))

  // TODO: skip on inspect(?)
  b.plugin(splitRequire, {
    filename: function (record) {
      var basename = path.basename(record.sourceFile, '.js')
      var isIndex = basename === 'index'
      var id = basename
      if (isIndex) id = path.dirname(record.sourceFile).split('/').slice(-1)[0]
      return `${uri}-${record.index}-${id}.js`
    },
    public: '/',
    output: bundleDynamicBundle
  })

  b.on('split.pipeline', function (pipeline, entry, name) {
    app.emit('progress', entry.file, name, 0)
  })

  var env = Object.assign({ NODE_ENV: app.env }, process.env)

  if (watch) {
    b.transform(require('envify/custom')(env))
    b.add(require.resolve('source-map-support/register'))
    b = watchify.emitter(b)
    b.on('update', function (buff) {
      clearModuleCache(entry)
      app.emit('bundle:script', entry, `${uri}.js`, buff)
    })
    b.on('pending', function () {
      app.emit('progress', entry, `${uri}.js`, 0)
    })
  } else {
    // run exorcist as part of the split-require pipeline
    b.on('split.pipeline', function (pipeline, entry, name) {
      pipeline.get('wrap').push(exorciseDynamicBundle(name))
    })

    let dir = path.dirname(entry)
    let browsers = browserslist(null, {path: dir})
    if (!browsers.length) browsers = DEFAULT_BROWSERS
    b.transform(require('babelify').configure({
      presets: [
        [require('babel-preset-env'), {
          targets: {browsers: browsers}
        }]
      ]
    }))

    b.transform(require('nanohtml'))
    b.plugin(require('tinyify'), { env: env })

    app.emit('progress', entry, `${uri}.js`, 0)
    b.bundle().pipe(exorcist(concat({encoding: 'buffer'}, function (buff) {
      app.context.assets[uri + '.js'].map = buff
    }), uri + '.js.map')).pipe(concat({encoding: 'buffer'}, function (buff) {
      app.emit('bundle:script', entry, `${uri}.js`, buff)
    }))
  }

  //                ↓ hashed uri     ↓ bundle            ↓ type
  var route = `^\\/(?:\\w+\\/${uri})(?:-([-\\w]+))?\\.js(?:\\.(map))?$`
  return get(new RegExp(route), function middleware (ctx, bundle, type = 'js') {
    ctx.type = `application/${type === 'map' ? 'json' : 'javascript'}`
    ctx.set('Cache-Control', `max-age=${watch ? 0 : 60 * 60 * 24 * 365}`)

    if (bundle) {
      let asset = ctx.assets[`${uri}-${bundle}.js`]
      if (type === 'map') ctx.body = asset.map
      else ctx.body = asset.buffer
      return
    }

    if (watch) {
      return new Promise(function (resolve, reject) {
        b.middleware(ctx.req, ctx.res)
        ctx.res.on('error', reject)
        ctx.res.on('end', resolve)
      })
    }

    if (ctx.assets[uri + '.js'].buffer) respond()
    else return util.promisify(b.once.bind(b, 'bundle'))().then(respond)

    function respond () {
      if (type === 'map') ctx.body = ctx.assets[uri + '.js'].map
      else ctx.body = ctx.assets[uri + '.js'].buffer
    }
  })

  // add hash to dynamic bundle name
  // str -> stream.Writable
  function bundleDynamicBundle (name) {
    var asset = app.context.assets[name]
    var stream = concat({encoding: 'buffer'}, function (buff) {
      app.emit('bundle:script', asset.file, name, buff)
      stream.emit('name', asset.url)
    })
    return stream
  }

  // extract source map from dynamic bundle
  // str -> stream.Writable
  function exorciseDynamicBundle (name) {
    return exorcist(concat({ encoding: 'buffer' }, function (buff) {
      app.context.assets[name].map = buff
    }), name + '.map')
  }
}

// test module name for native faile ending
// str -> bool
function isNotNativeModulePath (file) {
  return /\.node$/.test(file.id) === false
}

// test if file is in node_modules dir
// str -> bool
function isNotInNodeModules (file) {
  return /node_modules/.test(file.id) === false
}

// recursively clear module cache for given module name
// str -> void
function clearModuleCache (key) {
  if (!require.cache[key]) return

  require.cache[key].children
    .filter(isNotNativeModulePath)
    .filter(isNotInNodeModules)
    .forEach(function (child) {
      clearModuleCache(child.id)
    })

  delete require.cache[key]
}
