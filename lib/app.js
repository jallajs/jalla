var Koa = require('koa')

module.exports = class App extends Koa {
  listen (port, ...args) {
    this.emit('start', port)
    super.listen(port, ...args)
  }
}
