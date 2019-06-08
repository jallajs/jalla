var path = require('path')
var document = require('./document')

module.exports = render

function render (app) {
  return async function render (ctx, next) {
    try {
      await next()
      if (!ctx.body && ctx.accepts('html') && !ctx.response.get('Location')) {
        let href = path.join(app.base, ctx.url).replace(/\/$/, '') || '/'
        let client = require(app.entry)
        let state = Object.assign({
          prefetch: [],
          req: ctx.req,
          res: ctx.res
        }, ctx.state)

        // first render pass, collect prefetch operations
        client.toString(href, state)

        await Promise.all(state.prefetch)
        delete state.prefetch
        delete state.req
        delete state.res

        // second render pass
        let html = client.toString(href, state)

        ctx.type = 'text/html'
        ctx.status = isNaN(+state.status) ? 200 : state.status
        ctx.body = await new Promise(function (resolve, reject) {
          document(html, state, app, function (err, stream) {
            if (err) return reject(err)
            resolve(stream)
          })
        })

        if (app.env !== 'development') {
          ctx.append('Link', [
            `<${ctx.assets.get('bundle.js').url}>; rel=preload; as=script`,
            `<${ctx.assets.get('bundle.css').url}>; rel=preload; as=style`
          ])
        }
      }
    } catch (err) {
      ctx.throw(err.status || 404, err)
    }
  }
}
