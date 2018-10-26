# jalla
[![stability experimental][stability-badge]][stability-link]
[![npm version][version-badge]][npm-link]
[![build status][travis-badge]][travis-link]
[![downloads][downloads-badge]][npm-link]
[![js-standard-style][standard-badge]][standard-link]

Jalla is an *opinionated* web compiler and server in one, intended for both
development and production use. Jalla puts together popular tools and frameworks
that make web development fun and performant.

Jalla is intended to be used when static files doesn't cut it and you need to
dynamically render your views, HTTP/2 push dynamic assets or integrate with
other back end services. The stack consists of a [Koa][koa] server, a
[Browserify][browserify] bundler for scripts and [PostCSS][postcss] for styles.
Documents are compiled using [Documentify][documentify]. Jalla is built with
[Choo][choo] in mind and is **heavily** inspired by [Bankai][bankai]. In fact,
if static bundling and CSS-in-JS is your thing, you'll probably have a better
time using Bankai.

## Usage
```bash
$ jalla index.js
```

## API
Middleware can be added by creating an instance of the server. The application
is an instance of [Koa][koa] and supports all [Koa middleware][koa-middleware].

```javascript
var mount = require('koa-mount')
var jalla = require('jalla')
var app = jalla('index.js')

// deny robots access unless in production
app.use(mount('/robots.txt', function (ctx, next) {
  if (process.env.NODE_ENV === 'production') return next()
  ctx.type = 'text/plain'
  ctx.body = `
    User-agent: *
    Disallow: /
  `
}))

app.listen(8080)
```

### `ctx.assets`
Compiled assets (js, css) are exposed on the koa `ctx` object as an object with
the properties `file`, `map`, `buffer` and `url`.

### Options
Options can be supplied as the second argument (`jalla('index.js', opts)`).

- __base__ (*default: '/'*): pathname under which to serve application assets.
- __quiet__ (*default: false*): prevent logging through the console.
- __compile__ (*default: true*): wether to compile the application files using
babel during SSR. Used to transform dynamic imports (`import()`) to
[split-require][split-require]. Will also respect `.bavelrc` config files.

### Events
Most of the internal workings are exposed as events on the application (Koa)
instance.

#### `app.on('error', callback(err))`
When an internal error occurs or a route could not be served. If an HTTP error
was encountered, the status code is available on the error object.

#### `app.on('warning', callback(warning))`
When a non-critical error was encountered, e.g. a postcss plugin failed to parse
a rule.

#### `app.on('update', callback(file))`
When a file has been changed.

#### `app.on('progress', callback(file, uri))`
When an entry file is being bundled.

#### `app.on('bundle:script', callback(file, uri, buff)`
When a script file finishes bundling.

#### `app.on('bundle:style', callback(file, uri, buff)`
When a css file finishes bundling.

#### `app.on('bundle:file', callback(file))`
When a file is being included in a bundle.

#### `app.on('timing', callback(time, ctx))`
When a HTTP response has been sent.

#### `app.on('start', callback(port))`
When the server has started and in listening.

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
