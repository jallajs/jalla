var getAllRoutes = require('wayfarer/get-all-routes')
var Koa = require('koa')

module.exports = class App extends Koa {
  listen (port, callback) {
    var self = this
    super.listen(port, function () {
      self.emit('start', port)
      self.on('bundle:script', function onbundle (file) {
        if (file !== self.entry) return
        self.removeListener('bundle:script', onbundle)
        callback()
      })
    })
  }

  getAllRoutes () {
    return getAllRoutes(require(this.entry).router.router)
  }
}
