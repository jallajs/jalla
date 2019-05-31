var fs = require('fs')
var util = require('util')
var path = require('path')
var brfs = require('brfs')
var mkdirp = require('mkdirp')
var crypto = require('crypto')
var tfilter = require('tfilter')
var through = require('through2')
var babelify = require('babelify')
var exorcist = require('exorcist')
var uglifyify = require('uglifyify')
var minify = require('minify-stream')
var browserify = require('browserify')
var unassertify = require('unassertify')
var shakeify = require('common-shakeify')
var splitRequire = require('split-require')
var babelPresetEnv = require('@babel/preset-env')
var sourceMapSupport = require('./source-map-support')

var createDir = util.promisify(mkdirp)
var writeFile = util.promisify(fs.writeFile)

module.exports = ssr

function ssr (state, emit) {
  var name = path.basename(state.entry)
  var b = browserify(state.entry, {
    node: true,
    debug: true,
    // preserve paths for split-require to resolve during runtime
    fullPaths: true,
    standalone: name
  })

  b.plugin(splitRequire, {
    public: state.dist,
    filename: dynamicBundleName,
    output: bundleDynamicBundle
  })

  b.transform(tfilter(babelify, { exclude: /node_modules/ }), {
    plugins: ['dynamic-import-split-require'],
    babelrc: false,
    presets: [
      [babelPresetEnv, {
        targets: { node: 'current' }
      }]
    ]
  })

  b.transform(brfs)
  b.transform(sourceMapSupport(state.entry))

  if (state.env !== 'development') {
    b.transform(unassertify, { global: true })
    b.transform(uglifyify, { global: true })
    b.plugin(shakeify)
  }

  b.on('reset', function restart () {
    emit('progress', name, 0)
  })

  return function bundle (cb) {
    var map = path.resolve(state.dist, name + '.map')
    var ssr = new Promise(function (resolve, reject) {
      b.bundle()
        .pipe(state.env !== 'development' ? minify() : through())
        .pipe(state.env !== 'development' ? exorcist(map) : through())
        .pipe(fs.createWriteStream(path.resolve(state.dist, name), 'utf8'))
        .once('close', resolve)
        .once('error', reject)
    })

    var re = new RegExp(`^(?:${state.base.replace(/\//g, '\\/')})?\\/`)

    var assets = Array.from(state.assets.values())

    var stat = JSON.stringify({
      entry: name,
      assets: assets
    }, stringify, 2)

    emit('progress', '__stat__.json')

    Promise.all([
      ssr,
      ...assets.map(async function (asset) {
        var dest = path.resolve(state.dist, 'public', asset.url.replace(re, ''))
        emit('progress', asset.id)
        await createDir(path.dirname(dest))
        return writeFile(dest, asset.buffer)
      }),
      writeFile(path.resolve(state.dist, '__stat__.json'), stat)
    ]).then(cb.bind(undefined, null), cb)
  }

  // generate name for dýnamic bundle
  // obj -> str
  function dynamicBundleName (record) {
    var basename = path.basename(record.sourceFile, '.js')
    var isIndex = basename === 'index'
    var id = basename
    if (isIndex) id = path.dirname(record.sourceFile).split('/').slice(-1)[0]
    var buff = Buffer.from(record.source)
    var hash = crypto.createHash('sha512').update(buff).digest('buffer')
    return `${id}-${hash.toString('hex').slice(0, 16)}.js`
  }

  // handle dynamic bundle
  // str -> stream.Writable
  function bundleDynamicBundle (name) {
    return fs.createWriteStream(path.resolve(state.dist, name), 'utf8')
  }
}

// JSON.stringify replacer
// (str, any) -> str|undefined
function stringify (key, value) {
  if (key === 'buffer' || key === 'map') return
  return value
}
