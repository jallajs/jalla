var path = require('path')
var tinyify = require('tinyify')
var through = require('through2')
var babelify = require('babelify')
var watchify = require('watchify')
var concat = require('concat-stream')
var envify = require('envify/custom')
var browserify = require('browserify')
var browserslist = require('browserslist')
var sourcemap = require('convert-source-map')
var babelPresetEnv = require('@babel/preset-env')
var sourceMapSupport = require('./source-map-support')

var DEFAULT_BROWSERS = [
  'last 2 Chrome versions',
  'last 2 Firefox versions',
  'last 2 Safari versions',
  'last 2 Edge versions',
  '> 1%' // Cover all other browsers that are widely used.
]

module.exports = serviceWorker

function serviceWorker (state, emit) {
  var cache = {}
  var basedir = path.dirname(state.sw)
  var id = path.relative(basedir, state.sw)
  var env = Object.assign(getEnv(), process.env)

  var b = browserify(state.sw, {
    debug: true,
    cache: cache,
    fullPaths: false, // FIXME: true on inspect
    packageCache: {}
  })

  b.on('error', function (err) {
    emit('error', err)
  })

  capture()
  b.on('reset', capture)

  // run envify regardless due to tinyify loosing the reference to env
  b.transform(envify(env))
  b.transform(require('brfs'))

  if (state.env === 'development') {
    b.transform(sourceMapSupport(state.sw))
  } else {
    var browsers = browserslist(null, { path: basedir })
    if (!browsers.length) browsers = DEFAULT_BROWSERS
    b.transform(babelify, {
      presets: [
        [babelPresetEnv, {
          targets: { browsers: browsers }
        }]
      ]
    })

    b.plugin(tinyify, { env: env })
  }

  if (state.watch) {
    b = watchify(b)
    b.on('update', function (bundle, rows) {
      emit('update', rows)
    })
    b.on('pending', restart)
  }

  b.on('reset', restart)
  return function (cb) {
    b.bundle().pipe(concat({ encoding: 'buffer' }, function (buff) {
      onbundle(buff)
      cb()
    }))
  }

  // emit progress on pipeline reset/pending
  // () -> void
  function restart () {
    emit('progress', 'bundle.js', 0)
  }

  // capture bundle dependencies from pipeline
  // () -> void
  function capture () {
    emit('reset')
    b.pipeline.get('deps').push(through.obj(function (row, enc, next) {
      var file = row.expose ? b._expose[row.id] : row.file
      emit('dep', file)
      this.push(row)
      next()
    }))
  }

  // emit bundled asset
  // (Buffer, str) -> void
  function onbundle (bundle) {
    if (state.env === 'development') {
      emit('asset', id, bundle, {
        static: true,
        mime: 'application/javascript'
      })
    } else {
      let src = bundle.toString()
      let map = sourcemap.fromSource(src)
      let buff = Buffer.from(sourcemap.removeComments(src))
      emit('asset', id, buff, {
        static: true,
        mime: 'application/javascript',
        map: Buffer.from(map.toJSON())
      })
    }
  }

  // compose env vars for bundle
  // App -> obj
  function getEnv () {
    var env = { NODE_ENV: state.env }
    env.ASSET_LIST = []
    for (let { url, file } of state.assets.values()) {
      if (url && file !== state.sw) env.ASSET_LIST.push(url)
    }
    return env
  }
}
