var path = require('path')
var dedent = require('dedent')
var { get } = require('koa-route')
var resolve = require('resolve')
var postcss = require('postcss')
var Watcher = require('postcss-watcher')
var postcssrc = require('postcss-load-config')

module.exports = style

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

function style (entry, uri, app) {
  var basedir = path.dirname(entry || app.entry)
  var watch = app.env === 'development'
  var watcher = watch && new Watcher({
    // circumvent app entry being used as faux css entry file
    ignored: entry ? /node_modules/ : new RegExp(`node_modules|${app.entry}`)
  })

  var files = []
  if (entry) files.push(entry)

  var plugins = [
    require('postcss-import'),
    require('postcss-url')({
      assetsPath: path.resolve(basedir, 'assets'),
      url: watch ? 'rebase' : 'inline'
    })
  ]

  var ctx = {
    to: `${uri}.css`,
    env: app.env,
    from: path.basename(entry || app.entry),
    map: watch ? 'inline' : { inline: false }
  }
  var config = postcssrc(ctx, basedir)
    .then(function (result) {
      result.plugins.unshift(...plugins)
      result.options = Object.assign({}, ctx, result.options)
      return result
    })
    .catch(() => ({ plugins: plugins, options: ctx }))
    .then(function (result) {
      if (watch) {
        result.plugins.push(watcher.plugin())
      } else {
        result.plugins.push(require('autoprefixer'), require('postcss-csso'))
      }
      return result
    })

  var bundle = config.then(({ plugins }) => postcss(plugins))
  var processing = entry
    ? config.then(({ options }) => process(options))
    : new Promise(function (resolve, reject) {
      // defer to bundle event if no entry file was provided
      app.on('bundle:style', function onbundle (file, key) {
        if (key !== `${uri}.css`) return
        app.removeListener('bundle:style', onbundle)
        resolve({
          buffer: app.context.assets[key].buffer,
          map: app.context.assets[key].map
        })
      })
    })

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
    if (file !== app.entry) return
    if (!difference(deps, new Set(files))) {
      if (!deps.size && !files.length) {
        // emit an empty bundle if no files were found
        app.emit('bundle:style', app.entry, `${uri}.css`, Buffer.from(NO_CONTENT))
      }
      return
    }
    files = [...deps]
    processing = config.then(({ options }) => process(options))
  })

  if (watch) {
    watcher.on('change', function (file) {
      app.emit('update', file)
      processing = config.then(({ options }) => process(options))
    })
  }

  //                ↓ hashed uri           ↓ type
  var route = `^\\/(?:\\w+\\/${uri})\\.css(?:\\.(map))?$`
  return get(new RegExp(route), async function middleware (ctx, type = 'css') {
    ctx.type = type === 'map' ? 'application/json' : 'text/css'
    ctx.set('Cache-Control', `max-age=${watch ? 0 : 60 * 60 * 24 * 365}`)

    if (watch) {
      ctx.body = await processing.then((result) => result.buffer)
    } else {
      await processing
      if (type === 'map') ctx.body = ctx.assets[uri + '.css'].map
      else ctx.body = ctx.assets[uri + '.css'].buffer
    }
  })

  // process file with bundle
  // str -> Promise
  async function process (options) {
    app.emit('progress', app.entry, `${uri}.css`, 0)
    try {
      let processor = await bundle
      let content = files.map((file) => `@import "${file}";`).join('\n')
      let result = await processor.process(content, options)
      let buffer = Buffer.from(result.css)
      let map = result.map && Buffer.from(JSON.stringify(result.map, null, 2))

      app.emit('bundle:style', app.entry, `${uri}.css`, buffer)
      if (map) app.context.assets[`${uri}.css`].map = map

      result.messages.forEach(function (message) {
        if (message.type === 'dependency') {
          if (!/node_modules/.test(message.file)) {
            app.emit('bundle:file', message.file)
          }
        } else {
          app.emit(message.type, message.text)
        }
      })

      return { buffer, map }
    } catch (err) {
      app.emit('error', err)
      throw err
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
