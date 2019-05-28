var fs = require('fs')
var util = require('util')
var path = require('path')
var brfs = require('brfs')
var mkdirp = require('mkdirp')
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

  b.transform(babelify, {
    plugins: ['dynamic-import-split-require'],
    presets: [
      [babelPresetEnv, {
        targets: { node: 'current' }
      }]
    ]
  })

  b.transform(brfs)
  b.transform(sourceMapSupport(state.entry))
  b.transform(unassertify, { global: true })
  b.transform(uglifyify, { global: true })
  b.plugin(shakeify)

  b.on('reset', function restart () {
    emit('progress', name, 0)
  })

  return function bundle (cb) {
    var ssr = new Promise(function (resolve, reject) {
      b.bundle()
        .pipe(minify())
        .pipe(exorcist(path.resolve(state.dist, name + '.map')))
        .pipe(fs.createWriteStream(path.resolve(state.dist, name), 'utf8'))
        .once('error', reject)
        .once('end', resolve)
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
