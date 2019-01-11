var ora = require('ora')

module.exports = ui

function ui (app) {
  var building = new Set()
  var spinner = ora({
    text: 'Server starting',
    spinner: 'circleHalves',
    color: 'reset'
  }).start()

  app.on('error', function (err) {
    spinner.stopAndPersist({ symbol: '◼︎', text: err.message || err })
  })
  app.on('warning', function (warning) {
    spinner.stopAndPersist({ symbol: '▵', text: warning })
  })
  app.on('progress', function (file, uri, progress) {
    building.add(uri)
    spinner.start(Array.from(building).join(', '))
  })
  app.on('bundle:script', function (file, uri, buff) {
    building.delete(uri)
    spinner.stopAndPersist({ symbol: '●', text: uri })
    if (building.size) spinner.start(Array.from(building).join(', '))
  })
  app.on('bundle:style', function (file, uri, buff) {
    building.delete(uri)
    spinner.stopAndPersist({ symbol: '●', text: uri })
    if (building.size) spinner.start(Array.from(building).join(', '))
  })
  app.on('timing', function (time, ctx) {
    var url = ctx.url
    var prefix = `${ctx.method} ${ctx.status} `
    var suffix = ` [${time} ms]`
    var space = process.stdout.columns - (prefix.length + suffix.length)

    if (url.length > space) {
      // try fit in stdout by trimming each path segment
      url = url.split('/').map(function (segment) {
        return segment.length > 16 ? segment.substr(0, 16) + '…' : segment
      }).join('/')
    }

    if (url.length > space) {
      // just truncate the whole thing if still too long
      url = url.substr(0, space - 3).replace(/\/?…?$/, '…')
    }

    spinner.stopAndPersist({ symbol: '◀︎', text: prefix + url + suffix })
  })
  app.on('start', function (port) {
    if (app.env === 'development') {
      spinner.stopAndPersist({
        symbol: '●',
        text: `Server listening at http://localhost:${port}`
      })
    } else {
      spinner.stopAndPersist({
        symbol: '●',
        text: `Server listening on port ${port}`
      })
    }
    if (building.size) spinner.start(Array.from(building).join(', '))
  })
}
