var minifier = require('posthtml-minifier')
var posthtmlify = require('posthtmlify')
var documentify = require('documentify')
var hyperstream = require('hstream')

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
    d.transform(addToHead, `
      <title>${title}</title>
      <meta property="og:title" content="${title.replace(/"/g, '&quot;')}">
    `)
  }

  d.transform(addToHead, `
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#fff" property="theme">
    <link rel="manifest" href="${app.base}/manifest.json">
  `)

  if (state.meta) {
    let keys = Object.keys(state.meta)
    let tags = keys.map(function (key) {
      var type = key.indexOf('og:') !== -1 ? 'property' : 'name'
      var value = state.meta[key]
      if (typeof value === 'string') value = value.replace(/"/g, '&quot;')
      return `<meta ${type}="${key}" content="${value}">`
    })
    d.transform(addToHead, tags.join('\n'))
  }

  d.transform(addToHead, `<script>window.initialState = ${stringify(state)}</script>`)

  if (app.env === 'development') {
    d.transform(addToHead, `
      <script src="/dev/bundle.js" defer></script>
      <link rel="stylesheet" href="/dev/bundle.css">
    `)
  } else {
    if (app.context.style) {
      // TODO: Add inline critical css
      // TODO: submit PR with custom filter to https://github.com/stackcss/inline-critical-css
    }

    d.transform(addToHead, `
      <script src="https://cdn.polyfill.io/v2/polyfill.min.js?features=${process.env.POLYFILL_FEATURES || 'default-3.3'}"></script>
      <script src="${app.context.assets['bundle.js'].url}" defer></script>
      <link rel="stylesheet" href="${app.context.assets['bundle.css'].url}">
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

function stringify (obj) {
  return JSON.stringify(obj)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

function addToHead (str) {
  return hyperstream({ head: { _appendHtml: str } })
}
