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

  capture()
  b.on('reset', capture)

  b.plugin(splitRequire, {
    public: state.dist,
    filename: dynamicBundleName,
    output: bundleDynamicBundle
  })

  b.on('split.pipeline', function (pipeline, entry, name) {
    var map = path.resolve(state.dist, name + '.map')
    pipeline.get('wrap').push(exorcist(map))
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
        // can't run terser in tandem due it generating octal escaped sequences
        // in template strings which it then can't parse
        // .pipe(state.env !== 'development' ? minify() : through())
        .pipe(state.env !== 'development' ? exorcist(map) : through())
        .pipe(fs.createWriteStream(path.resolve(state.dist, name), 'utf8'))
        .once('close', resolve)
        .once('error', reject)
    })

    var re = new RegExp(`^(?:${state.base.replace(/\//g, '\\/')})?\\/`)
    var assets = Array.from(state.assets.values(), function (asset) {
      asset.file = asset.url.replace(re, '')
      return asset
    })

    var stat = JSON.stringify({
      entry: name,
      assets: assets
    }, stringify, 2)

    emit('progress', '__stat__.json', 0)

    Promise.all([
      ssr,
      template(),
      ...assets.map(async function (asset) {
        var dest = path.resolve(state.dist, 'public', asset.file)
        emit('progress', asset.id, 0)
        await createDir(path.dirname(dest))
        return writeFile(dest, asset.buffer)
      }),
      writeFile(path.resolve(state.dist, '__stat__.json'), stat)
    ]).then(cb.bind(undefined, null), cb)
  }

  // copy template file to dist
  // () -> Promise
  function template () {
    return new Promise(function (resolve, reject) {
      var dir = path.join(path.dirname(state.entry), 'index')
      resolve('.', { basedir: dir, extensions: ['.html'] }, function (err, file) {
        if (err) return resolve()
        emit('progress', file, 0)
        fs.readFile(file, function (err, buf) {
          if (err) return reject(err)
          resolve(writeFile(path.resolve(state.dist, 'index.html'), buf))
        })
      })
    })
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
