var getAllRoutes = require('wayfarer/get-all-routes')
var Koa = require('koa')

module.exports = class App extends Koa {
  listen (port, ...args) {
    this.emit('start', port)
    super.listen(port, ...args)
  }

  getAllRoutes () {
    return getAllRoutes(require(this.entry).router.router)
  }
}
