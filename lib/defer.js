var util = require('util')
var Emitter = require('events')

module.exports = queue

// queue downstream middleware until all bundles are done
// obj -> void
function queue (app, middleware) {
  var files = new Set()
  var emitter = new Emitter()

  app.on('bundle:script', onbundle)
  app.on('bundle:style', onbundle)
  app.on('progress', function (file) {
    files.add(file)
  })

  function onbundle (file) {
    files.delete(file)
    if (!files.size) emitter.emit('done')
  }

  return async function () {
    if (files.size) await util.promisify(emitter.once.bind(emitter, 'done'))()
    return middleware.apply(this, arguments)
  }
}
