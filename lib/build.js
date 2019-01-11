var fs = require('fs')
var path = require('path')
var util = require('util')
var assert = require('assert')
var mkdirp = require('mkdirp')

var makefolder = util.promisify(mkdirp)
var writeFile = util.promisify(fs.writeFile)

module.exports = build

function build (app, dir) {
  assert(typeof dir === 'string', 'jalla:build dir sohuld be type string')

  app.on('bundle:script', onbundle)
  app.on('bundle:style', onbundle)

  async function onbundle (file, uri, buff) {
    var asset = app.context[uri]
    var reg = new RegExp(`^(?:${app.base.replace(/\//g, '\\/')})?\\/`)
    var dest = asset.url.replace(reg, '')
    await makefolder(path.dirname(dest))
    await writeFile(path.resolve(dir, dest), buff)
  }
}
