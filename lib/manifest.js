var readPkgUp = require('read-pkg-up')

module.exports = manifest

function manifest (app) {
  return async function (ctx, next) {
    // respect upstream and downstream response
    if (ctx.body) return next()
    else await next()
    if (ctx.body) return

    var pkg = (await readPkgUp()).pkg
    var name = pkg.name.split('-').map(function (str) {
      return str[0].toUpperCase() + str.substr(1)
    }).join(' ')

    ctx.type = 'application/json'
    ctx.body = JSON.stringify({
      name: name,
      short_name: name.length > 12 ? name.replace(/[^A-Z]+/g, '') : name,
      start_url: '/',
      display: 'minimal-ui',
      background_color: '#fff',
      theme_color: '#fff'
    })
  }
}
