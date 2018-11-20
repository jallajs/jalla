var getAllRoutes = require('wayfarer/get-all-routes')
var Koa = require('koa')
var defer = require('./defer')

module.exports = class App extends Koa {
  listen (port, callback) {
    var self = this
    super.listen(port, function () {
      self.emit('start', port)
      self.on('bundle:script', function onbundle (file) {
        if (file !== self.entry) return
        self.removeListener('bundle:script', onbundle)
        if (typeof callback === 'function') callback()
      })
    })
  }

  // defer middleware while assets are compiling
  // fn -> fn
  defer (fn) {
    return defer(this, fn)
  }

  getAllRoutes () {
    return getAllRoutes(require(this.entry).router.router)
  }
}
