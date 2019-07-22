var Koa = require('koa')
var path = require('path')
var assert = require('assert')
var mkdirp = require('mkdirp')
var browserslist = require('browserslist')
var ui = require('./ui')
var build = require('./build')
var style = require('./style')
var script = require('./script')
var assets = require('./assets')
var compile = require('./compile')
var manifest = require('./manifest')
var Pipeline = require('./pipeline')
var serviceWorker = require('./service-worker')

var DEFAULT_BROWSERS = [
  'last 2 Chrome versions',
  'last 2 Firefox versions',
  'last 2 Safari versions',
  'last 2 Edge versions',
  '> 1%'
]

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
        entry = path.resolve(opts.dist, stat.entry)
        this.browsers = stat.browsers
      } catch (err) {
        this.emit('error', Error('Failed to load stat from serve directory'))
      }
    } else {
      let dir = path.dirname(entry)
      let browsers = browserslist.loadConfig({ path: dir, env: this.env })
      this.browsers = browsers || DEFAULT_BROWSERS
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

  get state () {
    return Object.assign({
      browsers: this.browsers,
      base: this.base,
      env: this.env
    }, this._opts)
  }

  // write assets to disk
  // (str, fn) -> void
  build (dir, state) {
    assert(typeof dir === 'string', 'jalla:build dir should be type string')

    state = Object.assign({ dist: dir, watch: false }, this.state, state)

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
