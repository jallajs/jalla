var fs = require('fs')
var path = require('path')
var dedent = require('dedent')
var postcss = require('postcss')
var csso = require('postcss-csso')
var resolvePath = require('resolve')
var postcssUrl = require('postcss-url')
var atImport = require('postcss-import')
var Watcher = require('postcss-watcher')
var autoprefixer = require('autoprefixer')
var postcssrc = require('postcss-load-config')

var NO_CONTENT = dedent`
  /**
   * CSS BUNDLE EMPTY
   *
   * If you were expecting some CSS but instead got this, make sure your CSS
   * files are named "index.css" and are placed adjacent to an included JS file.
   *
   * You can also specify CSS files you'd like included in the bundle by
   * defining a "style" field in a package.json adjacent to any file included
   * in the JS bundle.
   */
`

module.exports = style

function style (state, emitter, cb) {
  var basedir = path.dirname(state.css || state.entry)
  var watcher = state.watch ? new Watcher({
    // circumvent app entry being used as faux css entry file
    ignored: new RegExp(`node_modules${state.css ? `|${state.entry}` : ''}`)
  }) : null
  var config = getConfig()

  emitter.on('bundle', onbundle)

  if (state.watch) {
    watcher.on('change', function (file) {
      emitter.emit('bundle')
    })
  }

  function onbundle () {
    emitter.emit('progress', 'bundle.css', 0)

    var opts = {
      basedir: basedir,
      extensions: ['.css'],
      preserveSymlinks: false,
      packageFilter (pkg) {
        if (pkg.style) pkg.main = pkg.style
        else if (!pkg.main || !/\.css$/.test(pkg.main)) pkg.main = 'index.css'
        return pkg
      }
    }

    var deps = []
    var reg = /\.js$/
    for (let dep of state.deps) {
      if (reg.test(dep)) deps.push(dep)
    }

    Promise.all(deps.map(function (dep) {
      return new Promise(function (resolve, reject) {
        resolvePath(path.dirname(dep), opts, function (err, result) {
          if (!err && result) emitter.emit('dep', result)
          resolve(err ? null : result)
        })
      })
    })).then(function (files) {
      files = files.filter(Boolean)
      if (state.css) files.unshift(state.css)
      if (!files.length) {
        emitter.emit('asset', 'bundle.css', Buffer.from(NO_CONTENT), {
          mime: 'text/css'
        })
        cb()
      } else {
        return config.then(function ({ plugins, options }) {
          return compile(files, plugins, options).then(function (result) {
            emitter.emit('asset', 'bundle.css', result.css, {
              mime: 'text/css',
              map: result.map
            })
            cb()
          })
        })
      }
    }).catch(cb)
  }

  // compile files into css bundle
  // (arr, arr, obj) -> Promise
  async function compile (files, plugins, opts) {
    var content = files.map((file) => `@import "${file}";`).join('\n')
    var result = await postcss(plugins).process(content, opts)
    var css = Buffer.from(result.css)
    var map = result.map && Buffer.from(JSON.stringify(result.map, null, 2))

    result.messages.forEach(function (message) {
      if (message.type === 'dependency') {
        if (!/node_modules/.test(message.file)) {
          emitter.emit('dep', message.file)
        }
      } else {
        emitter.emit(message.type, message.text)
      }
    })

    return { css, map }
  }

  // read local config
  // () -> Promise
  function getConfig () {
    var ctx = {
      env: state.env,
      to: path.resolve(basedir, 'bundle.css'),
      from: path.basename(state.css || state.entry),
      map: state.env === 'development' ? 'inline' : { inline: false }
    }

    return postcssrc(ctx, basedir)
      .then(function (result) {
        result.plugins = [atImport, ...result.plugins, copyAssets()]
        result.options = Object.assign({}, ctx, result.options)
        return result
      })
      .catch(function () {
        // default setup when no custom config can be found
        return { options: ctx, plugins: [atImport, copyAssets()] }
      })
      .then(function (result) {
        // add optimizations
        if (state.env !== 'development') result.plugins.push(autoprefixer, csso)
        // hook up watcher plugin
        if (state.watch) result.plugins.push(watcher.plugin())
        return result
      })
  }

  // create instance of postcss-url capturing bundled assets
  // () -> fn
  function copyAssets () {
    return postcssUrl({ url: onasset })
    function onasset (asset, dir, opts) {
      // only bother with relative urls
      if (!asset.pathname || !/^\.+\//.test(asset.url)) return asset.url
      var id = path.relative(basedir, asset.absolutePath)
      emitter.emit('progress', id, 0)
      var buff = fs.readFileSync(asset.absolutePath)
      emitter.emit('asset', id, buff)
      return state.assets.get(id).url
    }
  }
}
