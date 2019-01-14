var fs = require('fs')
var Koa = require('koa')
var path = require('path')
var util = require('util')
var assert = require('assert')
var mkdirp = require('mkdirp')
var crypto = require('crypto')
var ui = require('./ui')
var compile = require('./compile')

var createDir = util.promisify(mkdirp)
var writeFile = util.promisify(fs.writeFile)

module.exports = class App extends Koa {
  constructor (entry, opts) {
    super()
    this.entry = entry
    this.silent = true
    this.serve = opts.serve
    this.base = opts.base || ''
    this.context.assets = {}
    this.queue = new Set()

    if (!opts.quiet) ui(this)
    if (opts.compile === undefined || opts.compile) compile(entry, this)

    this.on('progress', onprogress)
    this.on('bundle:script', onbundle)
    this.on('bundle:style', onbundle)
    this.on('bundle:asset', onbundle)

    var self = this

    // add to context asset directory
    function onprogress (file, uri, progress) {
      self.queue.add(uri)
      self.context.assets[uri] = { file }
    }

    // add bundle output to context asset directory
    function onbundle (file, uri, buff) {
      self.queue.delete(uri)

      var hash = crypto.createHash('sha512').update(buff).digest('buffer').toString('hex')
      var prefix = self.base + '/'
      if ((!opts.sw || file !== opts.sw) && self.env !== 'development') {
        prefix += hash.slice(0, 16) + '.'
      }
      var asset = self.context.assets[uri]
      if (!asset) asset = self.context.assets[uri] = { file }
      asset.url = prefix + uri
      asset.buffer = buff
      asset.hash = hash
    }
  }

  build (dir, callback) {
    assert(typeof dir === 'string', 'jalla:build dir should be type string')

    var self = this

    this.on('bundle:style', onbundle)
    this.on('bundle:script', onbundle)
    this.on('bundle:asset', onbundle)
    this.emit('build')

    function onbundle (file, uri, buff) {
      build(uri, self.context.assets[uri]).then(async function () {
        if (!self.queue.size) {
          self.removeListener('bundle:style', onbundle)
          self.removeListener('bundle:script', onbundle)
          self.removeListener('bundle:asset', onbundle)
          var map = JSON.stringify(self.context.assets, stringify, 2)
          await writeFile(path.resolve(dir, '.map.json'), map)
          callback(null)
        }
      }, callback)
    }

    async function build (uri, asset) {
      var re = new RegExp(`^(?:${self.base.replace(/\//g, '\\/')})?\\/`)
      var dest = path.resolve(dir, asset.url.replace(re, ''))
      await createDir(path.dirname(dest))
      var write = [writeFile(dest, asset.buffer)]
      if (asset.map) {
        write.push(writeFile(path.resolve(dir, uri + '.map'), asset.map))
      }
      await Promise.all(write)
    }
  }

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
