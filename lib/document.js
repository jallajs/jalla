var minifier = require('posthtml-minifier')
var posthtmlify = require('posthtmlify')
var documentify = require('documentify')
var hyperstream = require('hstream')

module.exports = document

function document (html, state, app) {
  var selector = require(app.entry).selector || 'body'
  var d = documentify(`
    <!doctype html>
    <html lang="${state.language || 'en'}">
    <head></head>
    <body></body>
    </html>
  `)

  d.transform(function () {
    return hyperstream({[selector]: {_replaceHtml: html}})
  })

  d.transform(addToHead, `
    <meta charset="utf-8">
    <meta http-equiv="x-ua-compatible" content="ie=edge">
  `)

  if (state.title) {
    d.transform(addToHead, `
      <title>${state.title.trim().replace(/\n/g, '')}</title>
      <meta property="og:title" content="${state.title.trim().replace(/\n/g, '')}">
    `)
  }

  d.transform(addToHead, `
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#fff" property="theme">
    <meta rel="manifest" href="${app.base}/manifest.json">
  `)

  if (state.meta) {
    d.transform(addToHead, `
      <meta property="description" content="${state.meta.description}">
      <meta property="og:image" content="${state.meta['og:image']}">
      <meta property="og:url" content="${state.meta['og:url']}">
    `)
  }

  d.transform(addToHead, `<script>window.initialState = ${stringify(state)}</script>`)

  if (app.env === 'development') {
    d.transform(addToHead, `
      <script src="${app.base}/dev/bundle.js" defer></script>
      <link rel="stylesheet" href="${app.base}/dev/bundle.css">
    `)
  } else {
    if (app.context.style) {
      // TODO: Add inline critical css
      // TODO: submit PR with custom filter to https://github.com/stackcss/inline-critical-css
    }

    d.transform(addToHead, `
      <script src="https://cdn.polyfill.io/v2/polyfill.min.js?features=${process.env.POLYFILL_FEATURES || 'default-3.3'}"></script>
      <script src="${app.base}/${app.context.script.hash.toString('hex').slice(0, 16)}/bundle.js" defer></script>
      <link rel="stylesheet" href="${app.base}/${app.context.style.hash.toString('hex').slice(0, 16)}/bundle.css">
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
  return hyperstream({head: {_appendHtml: str}})
}
