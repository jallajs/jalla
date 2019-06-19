var Koa = require('koa')
var path = require('path')
var assert = require('assert')
var mkdirp = require('mkdirp')
var ui = require('./ui')
var build = require('./build')
var style = require('./style')
var script = require('./script')
var assets = require('./assets')
var compile = require('./compile')
var manifest = require('./manifest')
var Pipeline = require('./pipeline')
var serviceWorker = require('./service-worker')

module.exports = class App extends Koa {
  constructor (entry, opts) {
    super()

    this.base = opts.base || ''

    var bundled = []
    if (opts.serve) {
      try {
        // pick up stat of existing build
        let stat = require(path.resolve(opts.dist, 'stat.json'))
        bundled = stat.assets.map(function (asset) {
          return Object.assign({}, asset, {
            hash: Buffer.from(asset.hash, 'hex'),
            file: path.resolve(opts.dist, 'public', asset.file)
          })
        })
        // use bundled entry for faster startup time
        entry = path.resolve(opts.dist, path.basename(entry))
      } catch (err) {
        this.emit('error', Error('Failed to load stat from serve directory'))
      }
    }

    var pipeline = new Pipeline([
      ['scripts', script],
      ['styles', style],
      ['assets', assets],
      ['manifest', manifest],
      ['service-worker'],
      ['build']
    ], bundled)

    this.entry = entry
    this._opts = opts
    this.pipeline = pipeline
    this.context.assets = pipeline.assets

    if (opts.sw) {
      pipeline.get('service-worker').push(serviceWorker)
    }

    if (typeof opts.compile === 'undefined' || opts.compile) {
      pipeline.get('scripts').push(compile)
    }

    if (!opts.quiet) ui(this)
    else this.silent = true
  }

  // write assets to disk
  // (str, fn) -> void
  build (dir, state) {
    assert(typeof dir === 'string', 'jalla:build dir should be type string')

    state = Object.assign({
      base: this.base,
      env: this.env,
      watch: false,
      dist: dir
    }, this._opts, state)

    return new Promise((resolve, reject) => {
      mkdirp(dir, (err) => {
        if (err) return reject(err)
        var index = this.pipeline.get('build').push(build)
        this.pipeline.bundle(this.entry, state, (err) => {
          this.pipeline.get('build').splice(index, 1)
          if (err) return reject(err)
          resolve()
        })
      })
    })
  }

  // start server
  // (num, fn) -> void
  listen (port, cb) {
    super.listen(port, () => {
      this.emit('start', port)
      if (typeof cb === 'function') cb()
    })
  }
}
