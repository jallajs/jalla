# jalla
[![stability experimental][stability-badge]][stability-link]
[![npm version][version-badge]][npm-link]
[![build status][travis-badge]][travis-link]
[![downloads][downloads-badge]][npm-link]
[![js-standard-style][standard-badge]][standard-link]

Jalla is an *opinionated* web compiler and server in one, intended for both development and production use. Jalla puts together popular tools and frameworks that makes web development fun and performant.

The stack consists of a [Koa][koa] server, a [Browserify][browserify] bundler for scripts and [PostCSS][postcss] for styles. Documents are compiled using [documentify][documentify]. It's intended for use with [Choo][choo] and **heavily** inspired by [Bankai][bankai]. In fact, if static bundling and CSS in JS is your thing, you'll probably have a better time using Bankai.

## Usage
```bash
$ jalla index.js
```

## API
Middleware can be added by creating an instance of the server. The application is an instance of [Koa][koa] and supports all [Koa middleware][koa-middleware].

```javascript
var jalla = require('jalla')
var app = jalla('index.js')

// enable gzip
app.use(require('koa-compress')())

app.use(function (ctx, next) {
  // only allow robots on production website
  if (ctx.path === '/robots.txt' && process.env.NODE_ENV !== 'production') {
    ctx.type = 'text/plain'
    ctx.body = `
      User-agent: *
      Disallow: /
    `
  }
  return next()
})

app.listen(8080)
```

### Events
Most of the internal workings are exposed as events on the application (Koa) instance.

#### `app.on('error', callback(err))`
When an internal error occurs or a route could not be served. If an HTTP error was encountered, the status code is availible on the error object.

#### `app.on('warning', callback(warning))`
When a non-critical error was encountered, e.g. a postcss plugin failed to parse a rule.

#### `app.on('progress', callback(file))`
When a change is detected to an entry file and processing begins.

#### `app.on('bundle:script', callback(file, buff)`
When a script file finishes bundling.

#### `app.on('bundle:style', callback(file, buff)`
When a css file finishes bundling.

#### `app.on('bundle:file', callback(file))`
When a file is being included in a bundle.

#### `app.on('timing', callback(time, ctx))`
When a HTTP response has been sent.

#### `app.on('start', callback(port))`
When the server starts.

## Todo
- [ ] Add bundle splitting for CSS
- [ ] Document configuration and options
- [ ] Document middleware
- [ ] Document SSR
- [ ] Document meta tags
- [ ] Export compiled files to disc
- [ ] Export compiled HTML to disc
- [ ] Resolve dynamic routes on export

[choo]: https://github.com/choojs/choo
[bankai]: https://github.com/choojs/bankai
[koa]: https://github.com/koajs/koa
[koa-middleware]: https://github.com/koajs/koa/wiki
[postcss]: https://github.com/postcss/postcss
[documentify]: https://github.com/stackhtml/documentify
[browserify]: https://github.com/substack/node-browserify
[split-require]: https://github.com/goto-bus-stop/split-require

[stability-badge]: https://img.shields.io/badge/stability-experimental-orange.svg?style=flat-square
[stability-link]: https://nodejs.org/api/documentation.html#documentation_stability_index
[version-badge]: https://img.shields.io/npm/v/jalla.svg?style=flat-square
[npm-link]: https://npmjs.org/package/jalla
[travis-badge]: https://img.shields.io/travis/jallajs/jalla/master.svg?style=flat-square
[travis-link]: https://travis-ci.org/jallajs/jalla
[downloads-badge]: http://img.shields.io/npm/dm/jalla.svg?style=flat-square
[standard-badge]: https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat-square
[standard-link]: https://github.com/feross/standard
