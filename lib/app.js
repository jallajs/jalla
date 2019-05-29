var Koa = require('koa')
var path = require('path')
var assert = require('assert')
var mkdirp = require('mkdirp')
var ui = require('./ui')
var write = require('./write')
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
        let stat = require(path.resolve(opts.dist, '__stat__.json'))
        bundled = stat.assets.map(function (asset) {
          return Object.assign({}, asset, {
            hash: Buffer.from(asset.hash, 'hex')
          })
        })
        // use bundled entry for faster startup time
        entry = path.resolve(opts.dist, path.basename(entry))
      } catch (err) {
        this.emit('error', Error('Failed to load stat from serve directory'))
      }
    }

    this.entry = entry
    this._opts = opts
    this.pipeline = new Pipeline([
      ['scripts', script],
      ['styles', style],
      ['assets', assets],
      ['manifest', manifest],
      ['service-worker'],
      ['write']
    ], bundled)

    if (opts.sw) {
      this.pipeline.get('service-worker').push(serviceWorker)
    }

    if (typeof opts.compile === 'undefined' || opts.compile) {
      this.pipeline.get('scripts').push(compile)
    }

    if (!opts.quiet) ui(this)
    this.context.assets = this.pipeline.assets
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

    var index = this.pipeline.get('write').push(write)
    return new Promise((resolve, reject) => {
      mkdirp(dir, (err) => {
        if (err) return reject(err)
        this.pipeline.bundle(this.entry, state, (err) => {
          this.pipeline.get('write').splice(index, 1)
          if (err) return reject(err)
          resolve()
        })
      })
    })
  }

  // start server
  // (num, fn) -> void
  listen (port, callback) {
    var self = this
    super.listen(port, function () {
      self.emit('start', port)
      // await babel compilation before calling callback
      self.on('bundle:script', function onbundle (file) {
        if (file !== self.entry) return
        self.removeListener('bundle:script', onbundle)
        if (typeof callback === 'function') callback()
      })
    })
  }
}
