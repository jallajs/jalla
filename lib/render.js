var path = require('path')
var concat = require('concat-stream')
var document = require('./document')

module.exports = render

function render (entry, app) {
  return async function render (ctx, next) {
    try {
      await next()
      if (!ctx.body && ctx.accepts('html') && !ctx.response.get('Location')) {
        let href = path.join(app.base, ctx.url).replace(/\/$/, '') || '/'
        let client = await Promise.resolve(require(entry))

        // first render pass, collect prefetch operations
        client.toString(href, Object.assign({
          prefetch: [],
          req: ctx.req,
          res: ctx.res
        }, ctx.state))

        let state = Object.assign({}, client.state)

        let status = 200
        await Promise.all(state.prefetch.map(function (promise) {
          return promise.catch(function (err) {
            if (err.fatal) throw err
            if (err.status) status = err.status
          })
        }))
        delete state.prefetch
        delete client.state.prefetch
        delete state.req
        delete state.res
        delete client.state.req
        delete client.state.res
        Object.assign(state, client.state)

        // second render pass
        let html = client.toString(href, state)

        ctx.type = 'text/html'
        ctx.status = client.state.status || status
        ctx.body = await new Promise(function (resolve, reject) {
          var stream = document(html, client.state, app)
          stream.pipe(concat({ encoding: 'buffer' }, resolve))
        })

        if (app.env !== 'development') {
          ctx.append('Link', [
            `<${ctx.assets['bundle.js'].url}>; rel=preload; as=script`,
            `<${ctx.assets['bundle.css'].url}>; rel=preload; as=style`
          ])
        }
      }
    } catch (err) {
      ctx.throw(err.status || 404, err)
    }
  }
}
