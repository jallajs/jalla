var path = require('path')
var readPkgUp = require('read-pkg-up')

module.exports = assets

function assets (state, emit) {
  return async function (cb) {
    if (state.assets.get('manifest.json')) return cb()

    try {
      emit('progress', 'manifest.json', 0)

      var { pkg } = await readPkgUp(path.dirname(state.entry))
      var name = pkg.name.split('-').map(function (str) {
        return str[0].toUpperCase() + str.substr(1)
      }).join(' ')

      var buff = Buffer.from(JSON.stringify({
        name: name,
        short_name: name.length > 12 ? name.replace(/[^A-Z]+/g, '') : name,
        start_url: '/',
        display: 'minimal-ui',
        background_color: '#fff',
        theme_color: '#fff'
      }))

      emit('asset', 'manifest.json', buff, {
        mime: 'application/json'
      })
      cb()
    } catch (err) {
      cb(err)
    }
  }
}
