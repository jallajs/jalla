var stream = require('stream')

module.exports = transform

// create browserify transform which imports source-map-support in entry file
// str -> fn
function transform (entry) {
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
    this.push('require(\'source-map-support/register\')\n' + data)
    callback()
  }
}
