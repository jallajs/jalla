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

    var self = this
    var immutable = new Set()
    if (opts.sw) immutable.add(path.basename(opts.sw))

    this.on('progress', onprogress)
    this.on('bundle:script', onbundle)
    this.on('bundle:style', onbundle)
    this.on('bundle:asset', onbundle)
    this.on('register:asset', onregister)
    this.on('remove:asset', onremove)

    // add to context asset directory
    // (str, str, num) -> void
    function onprogress (file, uri, progress) {
      self.queue.add(uri)
      self.context.assets[uri] = { file }
    }

    // add bundle output to context asset directory
    // (str, str, Buffer) -> void
    function onbundle (file, uri, buff) {
      self.queue.delete(uri)

      var hash = crypto.createHash('sha512').update(buff).digest('buffer').toString('hex')
      var asset = self.context.assets[uri]
      var base = self.base + '/'
      if (!asset) asset = self.context.assets[uri] = { file }
      if (!immutable.has(uri) && self.env !== 'development') {
        // bust cache of source maps with hashed pathname
        let separator = asset.map ? '/' : '.'
        asset.url = base + hash.slice(0, 16) + separator + path.basename(uri)
      } else {
        // use faux hash for assets with source maps
        asset.url = base + (immutable.has(uri) ? '' : '__hash__/') + uri
      }
      asset.size = Buffer.byteLength(buff)
      asset.buffer = buff
      asset.hash = hash
    }

    // add registered asset to list of immutable (non-hashable) assets
    // (str, str, Buffer) -> void
    function onregister (file, uri, buff) {
      immutable.add(uri)
      onbundle(file, uri, buff)
    }

    // remove asset from context asset directory
    // (str, str) -> void
    function onremove (file, uri) {
      delete self.context.assets[uri]
    }
  }

  // write assets to disk
  // (str, fn) -> void
  build (dir, callback) {
    assert(typeof dir === 'string', 'jalla:build dir should be type string')

    var self = this
    var files = new Set()

    this.on('bundle:style', onbundle)
    this.on('bundle:script', onbundle)
    this.on('bundle:asset', onbundle)
    this.on('register:asset', onbundle)
    this.on('bundle:file', files.add.bind(files))
    this.emit('build')

    // build bundled asset
    // (str, str, Buffer) -> void
    function onbundle (file, uri, buff) {
      build(uri, self.context.assets[uri]).then(async function () {
        if (!self.queue.size) {
          self.removeListener('bundle:style', onbundle)
          self.removeListener('bundle:script', onbundle)
          self.removeListener('bundle:asset', onbundle)
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
