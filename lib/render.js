var path = require('path')
var document = require('./document')

var FONT = /\.(woff2?|eot|ttf)$/

module.exports = render

function render (app) {
  return async function render (ctx, next) {
    try {
      await next()

      if (ctx.body || !ctx.accepts('html') || ctx.response.get('Location')) {
        return
      }

      const href = path.join(app.base, ctx.url).replace(/\/$/, '') || '/'
      const client = require(app.entry)
      const state = Object.assign({
        prefetch: [],
        req: ctx.req,
        res: ctx.res
      }, ctx.state)

      // first render pass, collect prefetch operations
      client.toString(href, state)

      await Promise.all(state.prefetch.map(function (p) {
        return p.catch(function (err) {
          if (err.status) state.status = err.status
        })
      }))
      delete state.prefetch
      delete state.req
      delete state.res

      // second render pass
      const html = client.toString(href, state)

      if (app.env !== 'development') {
        const fonts = []
        for (const [id, asset] of ctx.assets) {
          if (FONT.test(id)) {
            fonts.push(`<${asset.url}>; rel=preload; crossorigin=anonymous; as=font`)
          }
        }

        // push primary bundles and font files
        ctx.append('Link', [
          `<${ctx.assets.get('bundle.js').url}>; rel=preload; as=script`,
          `<${ctx.assets.get('bundle.css').url}>; rel=preload; as=style`
        ].concat(fonts))
      }

      var stream = await new Promise(function (resolve, reject) {
        document(html, state, app, function (err, stream) {
          if (err) return reject(err)
          return resolve(stream)
        })
      })

      ctx.type = 'text/html'
      ctx.status = isNaN(+state.status) ? 200 : state.status
      ctx.body = stream
    } catch (err) {
      ctx.throw(err.status || 500, err)
    }
  }
}
