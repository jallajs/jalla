var sourcemap = require('convert-source-map')
var Nanobus = require('nanobus')
var assert = require('assert')
var crypto = require('crypto')
var mime = require('mime')
var path = require('path')
var util = require('util')
var fs = require('fs')

var readFile = util.promisify(fs.readFile)

module.exports = class Pipeline extends Nanobus {
  constructor (graph, assets = []) {
    assert(Array.isArray(graph), 'Pipeline: graph should be type array')
    assets = Array.isArray(assets) ? assets : Object.entries(assets)

    super('pipeline')

    var self = this
    var assets = new Map(assets)

    this.assets = assets
    this.graph = graph.map(function ([label, ...hooks]) {
      var emitter = new Nanobus()

      return { label, start, hooks, emitter }

      // initialize pipeline node
      // (obj, fn) -> fn
      function start (state, cb) {
        var deps = new Set()
        var busy = new Set()

        emitter.removeAllListeners()

        emitter.on('*', function (name, ...args) {
          self.emit(`${label}:${name}`, ...args)
        })
        emitter.on('error', cb)
        emitter.on('dep', function (dep) {
          deps.add(dep)
          state.deps.add(dep)
        })
        emitter.on('reset', function () {
          for (let dep of deps) state.deps.delete(dep)
        })
        emitter.on('remove', function (id) {
          assets.delete(id)
        })
        emitter.on('progress', function (id) {
          busy.add(id)
          if (!assets.has(id)) {
            assets.set(id, Object.create({ read }))
          }
        })
        emitter.on('asset', function add (id, buff, meta) {
          var asset = assets.get(id)
          var hash = createHash(buff)
          var base = state.base + '/'

          if (!asset) {
            asset = Object.create({ read })
            assets.set(id, asset)
          }

          if (!meta.immutable && !state.watch) {
            asset.url = base + hash.slice(0, 16) + '.' + path.basename(id)
          } else {
            asset.url = base + id
          }
          if (meta.mime) asset.mime = meta.mime
          asset.size = Buffer.byteLength(buff)
          asset.hash = hash
          asset.id = id

          if (meta.map) {
            // create an asset for the source map, relative to source file
            let mapAsset = add(id + '.map', meta.map, {
              mime: 'application/json'
            })

            // add buffer with source map comment to asset
            let map = sourcemap.generateMapFileComment(mapAsset.url, {
              multiline: /\.css$/.test(id)
            })
            asset.buffer = Buffer.from(asset.buffer.toString() + '\n' + map)
          } else {
            asset.buffer = buff
          }

          busy.delete(id)
          return asset
        })

        // create hook execution series ending in cb
        var emit = emitter.emit.bind(emitter)
        var queue = hooks.map((hook) => hook(state, emit)).reverse()
        var bundle = queue.reduce(function (next, bundle) {
          return function (err) {
            if (err) return cb(err)
            bundle(next)
          }
        }, cb)

        // run initial bundle
        bundle()

        // rebundle on updates
        emitter.on('update', function (files) {
          bundle()
        })

        return bundle

        // utility for reading asset buffer regardless of environment
        // () -> Promise
        async function read () {
          if (busy.has(this.id)) {
            // wait for bundling to finish
            await new Promise((resolve, reject) => {
              var onasset = (id) => {
                if (busy.has(this.id)) return
                emitter.removeListener('asset', onasset)
                resolve()
              }
              emitter.on('asset', onasset)
            })
          }

          if (this.buffer) {
            return this.buffer
          } else if (state.serve) {
            let file = path.resolve(state.dist, this.url.replace(/^\//, ''))
            return readFile(file)
          } else {
            throw new Error('asset.read: cannot resolve buffer')
          }
        }
      }
    })
  }

  get (label) {
    var step = this.graph.find((step) => step.label === label)
    if (step) return step.hooks
  }

  middleware () {
    var self = this

    return async function (ctx, next) {
      if (ctx.body) return next()

      for (let asset of self.assets.values()) {
        if (asset.url === ctx.path) {
          ctx.body = await asset.read()
          ctx.type = asset.mime || mime.getType(asset.url)
          break
        }
      }

      return next()
    }
  }

  bundle (entry, state, cb = Function.prototype) {
    state.entry = entry
    state.assets = this.assets
    state.deps = new Set([entry])

    var order = this.graph.slice().reverse()
    var start = order.reduce(function (next, node) {
      var rebundle
      return function (err) {
        if (err) return cb(err)
        if (!rebundle) rebundle = node.start(state, next)
        else rebundle()
      }
    }, cb)

    start()
  }

  * [Symbol.iterator] () {
    for (let asset of this.assets.values()) {
      yield asset
    }
  }
}

function createHash (buff) {
  var hash = crypto.createHash('sha512')
  hash.update(buff)
  return hash.digest('buffer').toString('hex')
}
