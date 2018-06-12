var path = require('path')
var resolve = require('resolve')
var postcss = require('postcss')
var Watcher = require('postcss-watcher')
var postcssrc = require('postcss-load-config')

module.exports = style

function style (_entry, app) {
  var basedir = path.dirname(_entry || app.entry)
  var watch = app.env === 'development'
  var watcher = watch && new Watcher()

  var files = []
  if (_entry) files.push(_entry)

  var entry = _entry || path.resolve(basedir, 'index.css')

  var plugins = [
    require('postcss-import'),
    require('postcss-url')({
      assetsPath: path.resolve(basedir, 'assets'),
      url: watch ? 'rebase' : 'inline'
    })
  ]
  if (app.env !== 'development') {
    plugins.push(require('autoprefixer'), require('postcss-clean'))
  }

  var ctx = {
    from: entry,
    map: app.env === 'development' ? 'inline' : false
  }
  var config = postcssrc(ctx, basedir)
    .then(function (result) {
      result.plugins.unshift(...plugins)
      return result
    })
    .catch(() => ({plugins: plugins, options: ctx}))
    .then(function (result) {
      if (watch) result.plugins.push(watcher.plugin())
      return result
    })

  var bundle = config.then(({plugins}) => postcss(plugins))
  var processing = _entry
    ? config.then(({options}) => process(options))
    : Promise.resolve({css: '', map: {}})

  var deps = new Set()
  app.on('bundle:file', function (file) {
    if (!/\.js$/.test(file)) return

    const opts = {
      basedir: basedir,
      extensions: ['.css'],
      preserveSymlinks: false,
      packageFilter (pkg) {
        if (pkg.style) pkg.main = pkg.style
        else if (!pkg.main || !/\.css$/.test(pkg.main)) pkg.main = 'index.css'
        return pkg
      }
    }

    resolve(path.dirname(file), opts, function (err, result) {
      if (!err) deps.add(result)
    })
  })

  app.on('progress', function (file) {
    if (file === app.entry) deps.clear()
  })

  app.on('bundle:script', function (file) {
    if (!difference(deps, new Set(files))) return
    files = [...deps]
    processing = config.then(({options}) => process(options))
  })

  if (watch) {
    watcher.on('change', function () {
      processing = config.then(({options}) => process(options))
    })
  }

  return async function (ctx, next) {
    var {css, map} = await processing
    if (/\.map$/.test(ctx.path)) {
      ctx.body = map.mappings
    } else {
      ctx.type = 'text/css'
      ctx.set('Cache-Control', `max-age=${watch ? 0 : 60 * 60 * 24 * 365}`)
      ctx.body = css
    }
  }

  // process file with bundle
  // str -> Promise
  async function process (options) {
    app.emit('progress', entry, 0)
    try {
      let processor = await bundle
      let content = files.map(file => `@import "${file}";`).join('\n')
      let result = await processor.process(content, options)

      app.emit('bundle:style', entry, Buffer.from(result.css))
      result.messages.forEach(function (message) {
        if (message.type === 'dependency') {
          if (!/node_modules/.test(message.file)) {
            app.emit('bundle:file', message.file)
          }
        } else if (message.type === 'warning') {
          app.emit('warning', message.text)
        } else {
          app.emit('message', message)
        }
      })

      return result
    } catch (err) {
      app.emit('error', err)
    }
  }
}

// compare two sets
// (Set, Set) -> boolean
function difference (setA, setB) {
  var diff = new Set(setA)
  for (var elem of setB) {
    diff.delete(elem)
  }
  return diff.size !== 0
}
