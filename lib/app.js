var Koa = require('koa')
var crypto = require('crypto')
var ui = require('./ui')
var compile = require('./compile')

module.exports = class App extends Koa {
  constructor (entry, opts) {
    super()
    this.entry = entry
    this.silent = true
    this.base = opts.base || ''
    this.context.assets = {}

    if (!opts.quiet) ui(this)
    if (opts.compile === undefined || opts.compile) compile(entry, this)

    this.on('progress', onprogress)
    this.on('bundle:script', onbundle)
    this.on('bundle:style', onbundle)

    var self = this

    // add to context asset directory
    function onprogress (file, uri, progress) {
      self.context.assets[uri] = { file }
    }

    // add bundle output to context asset directory
    function onbundle (file, uri, buff) {
      var hash = crypto.createHash('sha512').update(buff).digest('buffer')
      var dir = self.base
      if (file !== opts.sw) {
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
