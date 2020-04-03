var path = require('path')
var readPkgUp = require('read-pkg-up')

module.exports = manifest

function manifest (state, emit) {
  return async function (cb) {
    if (state.assets.get('manifest.json')) return cb()

    try {
      emit('progress', 'manifest.json', 0)

      var { packageJson: pkg } = await readPkgUp(path.dirname(state.entry))

      var buff = Buffer.from(JSON.stringify({
        name: pkg.name,
        short_name: pkg.name.length > 12 ? pkg.name.substr(0, 12) + '…' : pkg.name,
        start_url: '/',
        display: 'minimal-ui',
        background_color: '#fff',
        theme_color: '#fff'
      }))

      emit('asset', 'manifest.json', buff, {
        static: true,
        mime: 'application/json'
      })
      cb()
    } catch (err) {
      cb(err)
    }
  }
}
