var util = require('util')
var Emitter = require('events')

module.exports = queue

// queue downstream middleware until all bundles are done
// obj -> void
function queue (app, middleware) {
  var queue = new Set()
  var emitter = new Emitter()

  app.on('bundle:style', onbundle)
  app.on('bundle:asset', onbundle)
  app.on('bundle:script', onbundle)
  app.on('register:asset', onbundle)
  app.on('progress', function (file, uri) {
    queue.add(file)
  })

  function onbundle (file, uri) {
    queue.delete(file)
    if (!queue.size) emitter.emit('done')
  }

  return async function () {
    if (queue.size) await util.promisify(emitter.once.bind(emitter, 'done'))()
    return middleware.apply(this, arguments)
  }
}
