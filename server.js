var mount = require('koa-mount')
var jalla = require('./')
var Koa = require('koa')

var app = jalla('example/index.js', {base: '/my/app'})

var server = new Koa()

server.use(mount('/my/app', app))
server.use(function (ctx, next) {
  console.log(ctx.url, ctx.status, ctx.body)
  if (ctx.path !== '/my/app') {
    ctx.status = 301
    return ctx.redirect('/my/app')
  }
  return next()
})

server.listen(process.env.PORT || 8080)
