var sourcemap = require('convert-source-map')
var Nanobus = require('nanobus')
var assert = require('assert')
var crypto = require('crypto')
var mime = require('mime')
var path = require('path')
var util = require('util')

module.exports = class Pipeline extends Nanobus {
  constructor (graph, assets = []) {
    assert(Array.isArray(graph), 'Pipeline: graph should be type array')
    assets = Array.isArray(assets) ? assets : Object.entries(assets)

    super('pipeline')

    var self = this

    this.assets = new Map(assets)
    this.graph = graph.map(function ([label, ...hooks]) {
      var busy = false
      var emitter = new Nanobus()

      return {
        label,
        start,
        hooks,
        emitter,
        get busy () {
          return busy
        }
      }

      function start (state, cb) {
        var deps = new Set()

        emitter.removeAllListeners()

        emitter.on('*', function (name, ...args) {
          self.emit(`${label}:${name}`, ...args)
        })

        emitter.on('dep', function (dep) {
          deps.add(dep)
          state.deps.add(dep)
        })

        emitter.on('reset', function () {
          for (let dep of deps) state.deps.remove(dep)
        })

        emitter.on('remove', function (id) {
          for (let dep of deps) state.deps.remove(dep)
          self.assets.delete(id)
          emitter.emit('bundle')
        })

        emitter.on('asset', function add (id, buff, meta) {
          var asset = self.assets.get(id)
          var hash = createHash(buff)
          var base = state.base + '/'

          if (!asset) {
            asset = { label }
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

        var count = hooks.length
        emitter.on('bundle', function () {
          busy = true
        })

        if (!count) {
          emitter.emit('idle')
          busy = false
          cb()
        } else {
          for (let hook of hooks) {
            hook(state, emitter, function (err) {
              if (err) return cb(err)
              if (--count === 0) {
                emitter.emit('idle')
                busy = false
                cb()
              }
            })
          }
        }

        emitter.emit('bundle')
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
          if (node.busy) {
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
      var initial = true
      return function (err) {
        if (err) return cb(err)
        if (initial) {
          initial = false
          node.start(state, next)
        } else {
          node.emitter.emit('bundle')
        }
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
