var path = require('path')
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

module.exports = middleware

function middleware (entry, app) {
  var map = null
  var bundle = null
  var watch = app.env === 'development'
  var branches = {}

  var b = browserify(entry, {
    cache: {},
    debug: true,
    fullPaths: false, // FIXME: true on inspect
    packageCache: {}
  })

  b.on('file', function (file, id, parent) {
    if (!/node_modules/.test(file)) app.emit('bundle:file', file)
  })

  var env = Object.assign({NODE_ENV: app.env}, process.env)
  b.transform(require('envify/custom')(env))
  // b.transform(require('brfs'))

  // TODO: skip on inspect(?)
  b.plugin(splitRequire, {
    filename: function (record) {
      var basename = path.basename(record.sourceFile, '.js')
      var isIndex = basename === 'index'
      return `bundle-${isIndex ? path.dirname(record.sourceFile) : basename}.js`
    },
    public: '/',
    output: bundleDynamicBundle
  })

  // Run exorcist as part of the split-require pipeline, so that
  // it can generate correct hashes for dynamic bundles.
  b.on('split.pipeline', function (pipeline, entry, name) {
    app.emit('progress', name, 0)
  //   pipeline.get('wrap').push(exorciseDynamicBundle(name))
  })

  if (watch) {
    b.add(require.resolve('source-map-support/register'))
    b = watchify.emitter(b)
    b.on('update', function (buff) {
      clearModuleCache(entry)
      app.emit('bundle:script', entry, buff)
    })
    b.on('pending', function () {
      app.emit('progress', entry, 0)
    })
  } else {
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
    b.plugin(require('tinyify'))

    app.emit('progress', entry, 0)
    b.bundle().pipe(exorcist(concat({encoding: 'buffer'}, function (buff) {
      map = buff
    }), 'bundle.js.map')).pipe(concat({encoding: 'buffer'}, function (buff) {
      bundle = buff
      app.emit('bundle:script', entry, buff)
    }))
  }

  return function (ctx, branch, type = '.js') {
    ctx.type = 'application/javascript'
    ctx.set('Cache-Control', `max-age=${watch ? 0 : 60 * 60 * 24 * 365}`)

    if (branch) {
      ctx.body = branches[`bundle${branch}.js`]
      return
    }

    if (watch) {
      return new Promise(function (resolve, reject) {
        b.middleware(ctx.req, ctx.res)
        ctx.res.on('error', reject)
        ctx.res.on('end', resolve)
      })
    }

    if (type === '.map') ctx.body = map
    else ctx.body = bundle
  }

  function bundleDynamicBundle (bundleName) {
    var stream = concat({encoding: 'buffer'}, function (buff) {
      app.emit('bundle:script', bundleName, buff)
      var hash = watch ? 'dev' : app.context.script.branches[bundleName].hash.toString('hex').slice(0, 16)
      stream.emit('name', `${hash}/${bundleName}`)
      branches[bundleName] = buff
    })
    return stream
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
