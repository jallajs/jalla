module.exports = ui

function ui (app) {
  console.log('○ Server starting')

  app.on('error', function (err) {
    console.error(`◼︎ ${err.message}`)
  })
  app.on('warning', function (warning) {
    console.warn(`▵ ${warning}`)
  })
  app.on('progress', function (file, uri, progress) {
    console.log(`○ ${uri}`)
  })
  app.on('bundle:script', function (file, uri, buff) {
    console.log(`● ${uri}`)
  })
  app.on('bundle:style', function (file, uri, buff) {
    console.log(`● ${uri}`)
  })
  app.on('timing', function (time, ctx) {
    var url = ctx.url
    var prefix = `◀︎ ${ctx.method} ${ctx.status} `
    var suffix = ` [${time} ms]`

    if (url.length > (80 - (prefix.length + suffix.length))) {
      url = url.split('/').map(function (segment) {
        return segment.length > 24 ? segment.substr(0, 24) + '…' : segment
      }).join('/')
    }

    console.log(prefix + url + suffix)
  })
  app.on('start', function (port) {
    if (app.env === 'development') {
      console.log(`● Server listening at http://localhost:${port}`)
    } else {
      console.log(`● Server listening on port ${port}`)
    }
  })
}
