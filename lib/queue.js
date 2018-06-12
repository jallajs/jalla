var Emitter = require('events')

module.exports = queue

// queue downstream middleware until all bundles are done
// obj -> void
function queue (app) {
  var files = new Set()
  var emitter = new Emitter()

  app.on('bundle:script', done)
  app.on('bundle:style', done)
  app.on('progress', function (file) {
    files.add(file)
  })

  return async function (ctx, next) {
    if (files.size) {
      await new Promise(function (resolve) {
        emitter.on('done', function next () {
          if (files.size) return
          emitter.removeListener('done', next)
          resolve()
        })
      })
    }
    return next()
  }

  function done (file) {
    files.delete(file)
    emitter.emit('done')
  }
}
