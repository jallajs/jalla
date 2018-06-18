var path = require('path')
var document = require('./document')
var concat = require('concat-stream')

module.exports = render

function render (entry, app) {
  return async function render (ctx, next) {
    try {
      await next()
      if (!ctx.body && ctx.accepts('html')) {
        let href = path.join(app.base, ctx.path).replace(/\/$/, '')
        let client = await Promise.resolve(require(entry))

        // first render pass, collect prefetch operations
        client.toString(href, Object.assign({
          prefetch: [],
          req: ctx.req,
          res: ctx.res
        }, ctx.state))

        let state = Object.assign({}, client.state)
        await Promise.all(state.prefetch).catch(function (err) {
          if (err.fatal) throw err
          ctx.status = err.status || 500
        })
        delete state.prefetch
        delete client.state.prefetch
        delete state.req
        delete state.res
        delete client.state.req
        delete client.state.res
        Object.assign(state, client.state)

        // second render pass
        let html = client.toString(href, state)

        ctx.body = await new Promise(function (resolve, reject) {
          var stream = document(html, client.state, app)
          stream.pipe(concat({encoding: 'buffer'}, resolve))
        })

        ctx.type = 'text/html'

        if (ctx.app.env !== 'development') {
          ctx.append('Link', [
            `</${ctx.script.hash.toString('hex').slice(0, 16)}/bundle.js>; rel=preload; as=script`,
            `</${ctx.style.hash.toString('hex').slice(0, 16)}/bundle.css>; rel=preload; as=style`
          ])
        }
      }
    } catch (err) {
      ctx.throw(err.status || 404, err)
    }
  }
}
