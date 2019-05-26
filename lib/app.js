var fs = require('fs')
var Koa = require('koa')
var path = require('path')
var util = require('util')
var assert = require('assert')
var mkdirp = require('mkdirp')
var serve = require('koa-static')
var compose = require('koa-compose')
var ui = require('./ui')
var style = require('./style')
var script = require('./script')
var assets = require('./assets')
var compile = require('./compile')
var manifest = require('./manifest')
var Pipeline = require('./pipeline')
var serviceWorker = require('./service-worker')

var createDir = util.promisify(mkdirp)
var writeFile = util.promisify(fs.writeFile)

module.exports = class App extends Koa {
  constructor (entry, opts) {
    super()
    opts = Object.assign({
      base: '',
      dist: path.resolve(entry, 'dist'),
      watch: !opts.serve && this.env === 'development'
    }, opts)
    this.entry = entry
    this.silent = true
    this.dist = opts.dist
    this.serve = opts.serve
    this.base = opts.base
    this.watch = opts.watch

    var self = this
    var pipeline = this.pipeline = new Pipeline([
      ['scripts', script],
      ['styles', style],
      ['assets', assets],
      ['manifest', manifest],
      ['service-worker']
    ])

    if (opts.sw) {
      pipeline.get('service-worker').push(serviceWorker)
    }

    if (typeof opts.compile === 'undefined' || opts.compile) {
      pipeline.get('scripts').push(compile)
    }

    if (!opts.quiet) ui(this)
    this.context.assets = pipeline.assets

    if (opts.serve) {
      this.use(serve(opts.dist, { maxage: 1000 * 60 * 60 * 24 * 365 }))
    } else {
      let state = Object.assign({
        env: this.env,
        watch: opts.watch || this.env === 'development'
      }, opts)
      let bundle = util.promisify(pipeline.bundle.bind(pipeline))
      let init = bundle(entry, state)

      this.use(compose([
        // defer response until initial bundle finishes
        (ctx, next) => init.then(next),
        // serve bundeled assets
        pipeline.middleware(),
        // apply cache control
        function (ctx, next) {
          if (ctx.body) {
            let cache = self.env !== 'development' && !opts.watch
            ctx.set('Cache-Control', `max-age=${cache ? 60 * 60 * 24 * 365 : 0}`)
          }
          return next()
        }
      ]))
    }
  }

  // write assets to disk
  // (str, fn) -> void
  build (dir, callback) {
    assert(typeof dir === 'string', 'jalla:build dir should be type string')

    // start queue at 2 to account for the mandatory js and css bundles
    var queue = 2
    var self = this
    var files = new Set()

    this.on('progress', onprogress)
    this.on('bundle:style', onbundle)
    this.on('bundle:script', onbundle)
    this.on('bundle:asset', onbundle)
    this.on('register:asset', onbundle)
    this.on('bundle:file', collect)
    this.emit('build')

    // increase counter
    // () -> void
    function onprogress (file, uri) {
      queue++
    }

    // collect all files included in bundle
    // str -> void
    function collect (file) {
      files.add(file)
    }

    // build bundled asset
    // (str, str, Buffer) -> void
    function onbundle (file, uri, buff) {
      // reduce by an extra for the mandatory js and css bundles
      if (/bundle\.(css|js)$/.test(uri)) queue--
      queue--
      build(uri, self.context.assets[uri]).then(async function () {
        if (queue === 0) {
          self.removeListener('progress', onprogress)
          self.removeListener('bundle:style', onbundle)
          self.removeListener('bundle:script', onbundle)
          self.removeListener('bundle:asset', onbundle)
          self.removeListener('register:asset', onbundle)
          self.removeListener('bundle:file', collect)
          var map = JSON.stringify({
            assets: self.context.assets,
            files: Array.from(files)
          }, stringify, 2)
          await writeFile(path.resolve(dir, '__stat__.json'), map)
          callback(null)
        }
      }, callback)
    }

    // write asset to disk
    // (str, obj) -> Promise
    async function build (uri, asset) {
      var re = new RegExp(`^(?:${self.base.replace(/\//g, '\\/')})?\\/`)
      var dest = path.resolve(dir, asset.url.replace(re, ''))
      await createDir(path.dirname(dest))
      var write = [writeFile(dest, asset.buffer)]
      if (asset.map) {
        write.push(writeFile(path.resolve(dest + '.map'), asset.map))
      }
      await Promise.all(write)
    }
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

// JSON.stringify replacer
// (str, any) -> str|undefined
function stringify (key, value) {
  if (key === 'buffer' || key === 'map') return
  return value
}
