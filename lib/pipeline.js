var sourcemap = require('convert-source-map')
var Nanobus = require('nanobus')
var assert = require('assert')
var crypto = require('crypto')
var mime = require('mime')
var path = require('path')
var util = require('util')
var fs = require('fs')

module.exports = class Pipeline extends Nanobus {
  constructor (graph, assets = []) {
    assert(Array.isArray(graph), 'Pipeline: graph should be type array')
    assets = Array.isArray(assets) ? assets : Object.entries(assets)

    super('pipeline')

    var self = this

    this.assets = new Map(assets)
    this.graph = graph.map(function ([label, ...hooks]) {
      var emitter = new Nanobus()

      return { label, start, hooks, emitter }

      // initialize pipeline node
      // (obj, fn) -> fn
      function start (state, cb) {
        var deps = new Set()

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
          self.assets.delete(id)
        })
        emitter.on('asset', function add (id, buff, meta) {
          var asset = self.assets.get(id)
          var hash = createHash(buff)
          var base = state.base + '/'

          if (!asset) {
            // keep utils on a prototype
            asset = Object.create({ read })
            asset.label = label
            self.assets.set(id, asset)
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
        // fn -> void
        function read (cb) {
          if (this.buffer) {
            cb(this.buffer)
          } else if (state.serve) {
            let file = path.resolve(state.dist, this.url.replace(/^\//, ''))
            fs.readFile(file, cb)
          } else {
            cb(new Error('asset.read: cannot resolve buffer'))
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
          let node = self.graph.find((node) => node.label === asset.label)
          if (node.busy) { // TODO: fix busy
            let defer = util.promisify(node.emitter.once.bind(node.emitter))
            await defer('idle')
          }
          ctx.body = asset.buffer
          ctx.type = asset.mime || mime.getType(asset.url)
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
