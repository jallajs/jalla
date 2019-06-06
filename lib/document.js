var minifier = require('posthtml-minifier')
var posthtmlify = require('posthtmlify')
var documentify = require('documentify')
var { Readable } = require('stream')
var hyperstream = require('hstream')
var through = require('through2')
var dropcss = require('dropcss')

module.exports = document

function document (html, state, app) {
  var selector = require(app.entry).selector || 'body'
  var d = documentify(`
    <!doctype html>
    <html>
    <head></head>
    <body></body>
    </html>
  `)

  d.transform(function () {
    return hyperstream({
      html: { lang: state.language || 'en' },
      [selector]: { _replaceHtml: html }
    })
  })

  d.transform(addToHead, `
    <meta charset="utf-8">
    <meta http-equiv="x-ua-compatible" content="ie=edge">
  `)

  if (state.title) {
    let title = state.title.trim().replace(/\n/g, '')
    d.transform(addToHead, `<title>${title}</title>`)
  }

  d.transform(addToHead, `
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="manifest" href="${app.base}/manifest.json">
  `)

  if (state.meta) {
    let keys = Object.keys(state.meta)
    if (keys.length) {
      let tags = keys.map(function (key) {
        if (key === 'title') return
        var type = key.indexOf('og:') !== -1 ? 'property' : 'name'
        var value = state.meta[key]
        if (typeof value === 'string') value = value.replace(/"/g, '&quot;')
        return `<meta ${type}="${key}" content="${value}">`
      })
      if (!keys.includes('theme-color')) {
        tags.push('<meta name="theme-color" content="#fff">')
      }
      d.transform(addToHead, tags.join('\n'))
    }
  }

  d.transform(function (str) {
    return hyperstream({ body: { _appendHtml: str } })
  }, `<script>window.initialState = ${stringify(state)}</script>`)

  if (app.env === 'development') {
    d.transform(addToHead, `
      <script src="${app.context.assets.get('bundle.js').url}" defer></script>
      <link rel="stylesheet" href="${app.context.assets.get('bundle.css').url}">
    `)
  } else {
    let script = app.context.assets.get('bundle.js')
    let styles = app.context.assets.get('bundle.css')
    d.transform(inlineCriticalCSS(styles.read.bind(styles)))

    let features = process.env.POLYFILL_FEATURES
    d.transform(addToHead, `
      <script src="https://polyfill.io/v3/polyfill.min.js${features ? `?features=${features}` : ''}"></script>
      <script src="${script.url}" defer></script>
      <link rel="preload" as="style" href="${styles.url}" onload="this.rel='stylesheet'">
    `)
  }

  d.transform(posthtmlify, {
    order: 'end',
    use: [[minifier, {
      collapseBooleanAttributes: true,
      collapseWhitespace: true,
      removeEmptyAttributes: true,
      removeComments: app.env !== 'development'
    }]]
  })

  return d.bundle()
}

// stringify with JSON encoded with JavaScript safe unicode characters
// see: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify#Issue_with_plain_JSON.stringify_for_use_as_JavaScript
// obj -> str
function stringify (obj) {
  return JSON.stringify(obj)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

// create documentify transform adding content to `head`
// str -> Stream
function addToHead (str) {
  return hyperstream({ head: { _appendHtml: str } })
}

// create documentify transform inlining critical CSS
// str -> Stream
function inlineCriticalCSS (getStyles) {
  var html = ''

  return function () {
    return through(collect, compose)
  }

  // collect html but push nothing
  // (str, str, fn) -> void
  function collect (chunk, enc, cb) {
    html += chunk
    cb(null)
  }

  // compose middleman stream for inlining the CSS
  // fn -> void
  function compose (cb) {
    var res = ''
    var self = this

    getStyles().then(function (css) {
      var critical = dropcss({ html: html, css: css.toString() })
      var append = hyperstream({
        head: {
          _appendHtml: `<style>${critical.css}</style>`
        }
      })
      var stream = new Readable()
      stream._read = Function.prototype

      // pipe the collected html through hyperstream forwarding to self
      stream.pipe(append).pipe(through(write, end))
      stream.push(html)
      stream.push(null)
    }, cb)

    // collect the resulting html with inlined CSS
    // (str, str, fn) -> void
    function write (chunk, enc, cb) {
      res += chunk
      cb(null, chunk)
    }

    // resolve self with the complete HTML (with inlined CSS)
    // fn -> void
    function end (done) {
      self.push(res)
      done()
      cb()
    }
  }
}
