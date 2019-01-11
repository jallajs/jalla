var fs = require('fs')
var Koa = require('koa')
var path = require('path')
var util = require('util')
var assert = require('assert')
var mkdirp = require('mkdirp')
var crypto = require('crypto')
var ui = require('./ui')
var compile = require('./compile')

var makefolder = util.promisify(mkdirp)
var writeFile = util.promisify(fs.writeFile)

module.exports = class App extends Koa {
  constructor (entry, opts) {
    super()
    this.entry = entry
    this.silent = true
    this.base = opts.base || ''
    this.context.assets = {}
    this.queue = new Set()

    if (!opts.quiet) ui(this)
    if (opts.compile === undefined || opts.compile) compile(entry, this)

    this.on('progress', onprogress)
    this.on('bundle:script', onbundle)
    this.on('bundle:style', onbundle)

    var self = this

    // add to context asset directory
    function onprogress (file, uri, progress) {
      self.queue.add(uri)
      self.context.assets[uri] = { file }
    }

    // add bundle output to context asset directory
    function onbundle (file, uri, buff) {
      self.queue.delete(uri)

      var hash = crypto.createHash('sha512').update(buff).digest('buffer')
      var dir = self.base
      if (!opts.sw || file !== opts.sw) {
        if (self.env === 'development') dir += '/dev'
        else dir += `/${hash.toString('hex').slice(0, 16)}`
      }
      var asset = self.context.assets[uri]
      if (!asset) asset = self.context.assets[uri] = { file }
      asset.url = dir + `/${uri}`
      asset.hash = hash
      asset.buffer = buff
    }
  }

  build (dir, callback) {
    assert(typeof dir === 'string', 'jalla:build dir should be type string')

    var self = this

    this.on('bundle:style', onbundle)
    this.on('bundle:script', onbundle)
    this.emit('build')

    function onbundle (file, uri, buff) {
      build(self.context.assets[uri]).then(function () {
        if (!self.queue.size) {
          self.removeListener('bundle:style', onbundle)
          self.removeListener('bundle:script', onbundle)
          callback(null)
        }
      }, callback)
    }

    async function build (asset) {
      var reg = new RegExp(`^(?:${self.base.replace(/\//g, '\\/')})?\\/`)
      var dest = path.resolve(dir, asset.url.replace(reg, ''))
      await makefolder(path.dirname(dest))
      await writeFile(dest, asset.buffer)
      if (asset.map) await writeFile(dest + '.map', asset.map)
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
