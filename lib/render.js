var document = require('./document')
var concat = require('concat-stream')

module.exports = render

function render (entry) {
  return async function render (ctx, next) {
    try {
      await next()
      if (!ctx.body && ctx.accepts('html')) {
        let app = require(entry)

        // first render pass, collect prefetch operations
        app.toString(ctx.path, Object.assign({
          prefetch: [],
          req: ctx.req,
          res: ctx.res
        }, ctx.state))

        let state = Object.assign({}, app.state)
        await Promise.all(state.prefetch).catch(function (err) {
          if (err.fatal) throw err
          ctx.status = err.status || 500
        })
        delete state.prefetch
        delete app.state.prefetch
        delete state.req
        delete state.res
        delete app.state.req
        delete app.state.req
        Object.assign(state, app.state)

        // second render pass
        let html = app.toString(ctx.path, state)

        ctx.body = await new Promise(function (resolve, reject) {
          var stream = document(html, app.state, ctx.app)
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
