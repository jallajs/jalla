var path = require('path')
var brfs = require('brfs')
var tinyify = require('tinyify')
var through = require('through2')
var nanohtml = require('nanohtml')
var babelify = require('babelify')
var watchify = require('watchify')
var caniuse = require('caniuse-api')
var envify = require('envify/custom')
var concat = require('concat-stream')
var browserify = require('browserify')
var browserslist = require('browserslist')
var splitRequire = require('split-require')
var sourcemap = require('convert-source-map')
var babelPresetEnv = require('@babel/preset-env')
var inject = require('./inject')

var DEFAULT_BROWSERS = [
  'last 2 Chrome versions',
  'last 2 Firefox versions',
  'last 2 Safari versions',
  'last 2 Edge versions',
  '> 1%'
]

module.exports = script

function script (state, emit) {
  var b = browserify(state.entry, {
    cache: {},
    debug: true,
    fullPaths: false,
    packageCache: {}
  })

  capture()
  b.on('reset', capture)

  b.plugin(splitRequire, {
    filename: function (record) {
      var basename = path.basename(record.sourceFile, '.js')
      var isIndex = basename === 'index'
      var id = basename
      if (isIndex) id = path.dirname(record.sourceFile).split('/').slice(-1)[0]
      return `bundle-${record.index}-${id}.js`
    },
    public: state.base + '/',
    output: bundleDynamicBundle
  })

  b.on('split.pipeline', function (pipeline, entry, name) {
    emit('progress', name, 0)
  })

  var env = Object.assign({ NODE_ENV: state.env }, process.env)

  if (state.env === 'development') {
    b.transform(babelify, { plugins: ['dynamic-import-split-require'] })
    b.transform(inject('source-map-support/register', state.entry))
    b.transform(brfs)
    b.transform(envify(env))
  } else {
    let dir = path.dirname(state.entry)
    let browsers = browserslist.loadConfig({ path: dir, env: env.NODE_ENV })
    if (!browsers) browsers = DEFAULT_BROWSERS

    // compile dynamic imports but nothing else to preserve template literals
    b.transform(babelify, { plugins: ['dynamic-import-split-require'] })

    // include regenerator runtime to support transpiled async/await
    if (!caniuse.isSupported('async-functions', browsers.join(','))) {
      let regenerator = require.resolve('regenerator-runtime/runtime')
      b.transform(inject(regenerator, state.entry))
    }

    b.transform(nanohtml)
    b.transform(babelify, {
      presets: [
        [babelPresetEnv, {
          targets: { browsers: browsers }
        }]
      ]
    })
    b.transform(brfs)
    b.plugin(tinyify, { env })
  }

  if (state.watch) {
    b = watchify(b)
    b.on('update', function (rows) {
      emit('update', rows)
    })
    b.on('pending', onreset)
  }

  b.on('reset', onreset)
  return function bundle (cb) {
    emit('progress', 'bundle.js', 0)
    var stream = b.bundle()
    stream.on('error', cb)
    stream.pipe(concat({ encoding: 'buffer' }, function (buff) {
      onbundle(buff, 'bundle.js')
      cb()
    }))
  }

  // emit progress on pipeline reset/pending
  // () -> void
  function onreset () {
    emit('reset')
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

  // handle dynamic bundle
  // str -> stream.Writable
  function bundleDynamicBundle (name) {
    let stream = concat({ encoding: 'buffer' }, function (bundle) {
      onbundle(bundle, name)
      var asset = state.assets.get(name)
      stream.emit('name', asset.url)
    })
    return stream
  }

  // emit bundled asset
  // (Buffer, str) -> void
  function onbundle (bundle, name) {
    if (state.env === 'development') {
      emit('asset', name, bundle, {
        mime: 'application/javascript'
      })
    } else {
      let src = bundle.toString()
      let map = sourcemap.fromSource(src)
      let buff = Buffer.from(sourcemap.removeComments(src))
      emit('asset', name, buff, {
        mime: 'application/javascript',
        map: Buffer.from(map.toJSON())
      })
    }
  }
}
