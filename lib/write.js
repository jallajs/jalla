var fs = require('fs')
var util = require('util')
var path = require('path')
var brfs = require('brfs')
var mkdirp = require('mkdirp')
var tfilter = require('tfilter')
var through = require('through2')
var babelify = require('babelify')
var exorcist = require('exorcist')
var uglifyify = require('uglifyify')
var minify = require('minify-stream')
var browserify = require('browserify')
var unassertify = require('unassertify')
var shakeify = require('common-shakeify')
var babelPresetEnv = require('@babel/preset-env')
var sourceMapSupport = require('./source-map-support')

var createDir = util.promisify(mkdirp)
var writeFile = util.promisify(fs.writeFile)

module.exports = ssr

function ssr (state, emit) {
  var name = path.basename(state.entry)
  var b = browserify(state.entry, {
    node: true,
    debug: true
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
    // FIXME: https://github.com/choojs/nanohtml/issues/141
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
        // FIXME: https://github.com/choojs/nanohtml/issues/141
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
    ]).then(() => cb(), cb)
  }
}

// JSON.stringify replacer
// (str, any) -> str|undefined
function stringify (key, value) {
  if (key === 'buffer' || key === 'map') return
  return value
}
