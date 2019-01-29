var stream = require('stream')
var transform = require('transform-ast')

module.exports = sourceMapSupport

// create browserify transform which imports source-map-support in entry file
// str -> fn
function sourceMapSupport (entry) {
  return function (filename) {
    if (filename !== entry) return stream.PassThrough()
    return new SourceMapSupport()
  }
}

class SourceMapSupport extends stream.Transform {
  constructor () {
    super()
    this.data = []
  }

  _transform (buff, enc, callback) {
    this.data.push(buff)
    callback()
  }

  _flush (callback) {
    var data = Buffer.concat(this.data).toString()
    var content = transform(data, function node (node) {
      if (node.type === 'Program') {
        node.edit.prepend(`require('source-map-support/register');\n`)
      }
    })

    this.push(content.toString())
    callback()
  }
}
