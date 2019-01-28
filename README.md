# jalla
[![stability experimental][stability-badge]][stability-link]
[![npm version][version-badge]][npm-link]
[![build status][travis-badge]][travis-link]
[![downloads][downloads-badge]][npm-link]
[![js-standard-style][standard-badge]][standard-link]

Jalla is an *opinionated* compiler and server in one. It makes web development
fast, fun and exceptionally performant.

Jalla is an excellent choice **when static files just don't cut it**. Perhaps
you need to render views dynamically, push (HTTP/2) assets or integrate with
back-end services.

In short: a [Koa][koa] server, a [Browserify][browserify] bundler
for scripts and a [PostCSS][postcss] for styles. Documents are compiled
using [Documentify][documentify]. Jalla is built with [Choo][choo] in mind and
is heavily inspired by [Bankai][bankai].

## Working with Jalla
Jalla has a *watch mode* and a *production mode*. Setting the environment
variable `NODE_ENV` to anything but `development` will cause jalla to perform
more expensive compilation and optimizations on your code.

```bash
$ jalla index.js
```

If the environment variable `NODE_ENV` is missing, jalla assumes you are in
development and will default to *watch mode* which observes files for changes
and recompiles them on the fly.

```bash
$ NODE_ENV=production jalla index.js
```

### JavaScript
Scripts are compiled using [Browserify][browserify]. Custom transforms can be
added using the [`browserify.transform`][browserify-transform] field in your
`package.json` file.

<details>
<summary>Example browserify config</summary>

```javascript
// package.json
"browserify": {
  "transform": [
    "some-browserify-transform"
  ]
}
```

</details>

<details>
<summary>Included Browserify optimizations</summary>

##### [split-require][split-require]
Lazily load parts of your codebase. Jalla will transform dynamic imports into
calls to split-require automatically (using a
[babel plugin][babel-dynamic-import]), meaning you only have to call
`import('./some-file')` to get bundle splitting right out of the box without any
tooling footprint in your source code.

##### [babelify][babelify]
Run [babel][babel] on your sourcecode. Will respect local `.babelrc` files for
configuring the babel transform.

The following babel plugins are added by default:
- __[babel-plugin-dynamic-import-split-require][babel-dynamic-import]__
transform dynamic import calls to split-require.
- __[babel-preset-env][babel-preset-env]__: read [`.browserlist`][browserslist]
file to configure which babel plugins to support the browsers listed therein.
*Not used in watch mode*.

##### [brfs][brfs]
Inline static assets in your application using the Node.js `fs` module.

##### [envify][envify]
Use environment variables in your code.

##### [nanohtml][nanohtml] *(not used in watch mode)*
Choo-specific optimization which transpiles html templates for increased browser
performance.

##### [tinyify][tinyify] *(not used in watch mode)*
A while suite of optimizations and minifications removing unused code,
significantly reducing file size.

</details>

### CSS
CSS files are located and included automaticly. Whenever a JavaScript module is
used in your application, jalla will try and find an adjacent `index.css` file
in the same location. Jalla will also respect the `style` field in a modules
`package.json` to determine which CSS file to include.

All CSS files are transpiled using [PostCSS][PostCSS]. To add PostCSS plugins,
either add a `postcss` field to your `package.json` or, if you need to
conditionally configure PostCSS, create a `.postcssrc.js` in the root of your
project. See [postcss-load-config][postcss-load-config] for details.

<details>
<summary>Example PostCSS config</summary>

```javascript
// package.json
"postcss": {
  "plugins": {
    "some-postcss-plugin": {}
  }
}
```

```javascript
// .postcssrc.js
module.exports = config

function config (ctx) {
  var plugins = []
  if (ctx.env === 'production') {
    plugins.push(require('some-postcss-plugin'))
  }
  return { plugins }
}
```

</details>

<details>
<summary>The included PostCSS plugins</summary>

##### [postcss-url][postcss-url]
Rewrite URLs and copy assets from their source location. This means you can
reference e.g. background images and the like using relative URLs and it'll just
work™.

##### [postcss-import][postcss-import]
Inline files imported with `@import`. Works for both local files as well as for
files in `node_modules`, just like it does in Node.js.

##### [autoprefixer][autoprefixer] *(not used in watch mode)*
Automatically add vendor prefixes. Respects [`.browserlist`][browserslist] to
determine which browsers to support.

##### [postcss-csso][postcss-csso] *(not used in watch mode)*
Cleans, compresses and restructures CSS for optimal performance and file size.

</details>

### HTML
Jalla uses [Documentify][documentify] to compile server-rendered markup.
Documentify can be configured in the `package.json` (see Documentify
documentation). By default, jalla only applies HTML minification using
[posthtml-minifier][posthtml-minifier].

<details>
<summary>Example Documentify config</summary>

```javascript
// package.json
"documentify": {
  "transform": [
    [
      "./my-document.js",
      {
        "order": "end"
      }
    ]
  ]
}
```

```javascript
// my-document.js
var hyperstream = require('hstream')

module.exports = document

function document () {
  return hyperstream({
    'html': {
      // add a class to the root html element
      class: 'Root'
    },
    'meta[name="viewport"]': {
      // instruct Mobile Safari to expand under the iPhone X notch
      content: 'width=device-width, initial-scale=1, viewport-fit=cover'
    },
    head: {
      // add some tracking script to the header
      _appendHtml: `
        <script async src="https://www.tracking-service.com/tracker.js?id=abc123"></script>
        <script>
          window.dataLayer = window.dataLayer || [];
          function track () { dataLayer.push(arguments); }
          track('js', new Date());
          track('config', 'abc123');
        </script>
      `
    }
  })
}
```

</details>

### Assets
All files located in the root folder `./assets` are automatically being served
under the webpage root.

### CLI Options
- __`--service-worker, --sw`__ entry point for a service worker, uses a subset
of the optimization used for the entry file.
- __`--css`__ explicitly include a css file in the build
- __`--quiet, -q`__ disable printing to console
- __`--build, -b`__ write assets to disc and exit
- __`--serve, -s`__ serve built files from disk
- __`--debug, -d`__ enable the node inspector, accepts a port as value
- __`--base, -b`__ base path where app will be served
- __`--port, -p`__ port to use for server

### Service Workers
By supplying the path to a service worker entry file with the `sw` option, jalla
will build and serve it's bundle from that path.

Registering a service worker with a Choo app is easily done using
[choo-service-worker][choo-service-worker].

```javascript
app.use(require('choo-service-worker')('/sw.js'))
```

And then starting jalla with the `sw` option.

```bash
$ jalla index.js --sw sw.js
```

Information about application bundles and assets are exposed to the service
worker during its build and can be accessed as environment variables.

- __`process.env.ASSET_LIST`__ a list of URLs to all included assets


<details>
<summary>Example service worker</summary>

```javascript
// index.json
var choo = require('choo')
var app = choo()

app.route('/', require('./views/home'))
app.use(require('choo-service-worker')('/sw.js'))

module.exports = app.mount('body')
```

```javascript
// sw.js
// use package.json version field as cache key
var CACHE_KEY = process.env.npm_package_version
var FILES = [
  '/',
  '/manifest.json'
].concat(process.env.ASSET_LIST)

self.addEventListener('install', function oninstall (event) {
  // cache landing page and all assets once service worker is installed
  event.waitUntil(
    caches
      .open(CACHE_KEY)
      .then((cache) => cache.addAll(FILES))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', function onactivate (event) {
  // clear old caches on activate
  event.waitUntil(clear().then(() => self.clients.claim()))
})

self.addEventListener('fetch', function onfetch (event) {
  event.respondWith(
    caches.open(CACHE_KEY).then(function (cache) {
      return cache.match(req).then(function (cached) {
        if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') {
          return cached
        }

        // try and fetch response and fallback to cache
        return self.fetch(event.request).then(function (response) {
          if (!response.ok) {
            if (fallback) return fallback
            else return response
          }
          cache.put(req, response.clone())
          return response
        }, function (err) {
          if (fallback) return fallback
          return err
        })
      })
    })
  )
})

// clear application cache
// () -> Promise
function clear () {
  return caches.keys().then(function (keys) {
    var caches = keys.filter((key) => key !== CACHE_KEY)
    return Promise.all(keys.map((key) => caches.delete(key)))
  })
}
```

</details>

### Manifest
A bare-bones application manifest is generated based on the projects
`package.json`. You could either place a `manifest.json` in the assets folder or
you can generate one using a custom middleware.

## API
After instantiating the jalla server, middleware can be added just like you'd do
with any [Koa][koa] app. The application is an instance of Koa and supports
[all Koa middleware][koa-middleware].

Jalla will await all middleware to finish before trying to render a HTML response.
If the response has been redirected (i.e. calling `ctx.redirect`) or if a value
has been assigned to `ctx.body` jalla will not render any HTML response.

```javascript
var mount = require('koa-mount')
var jalla = require('jalla')
var app = jalla('index.js')

// only allow robots in production
app.use(mount('/robots.txt', function (ctx, next) {
  ctx.type = 'text/plain'
  ctx.body = `
    User-agent: *
    Disallow: ${process.env.NODE_ENV === 'production' ? '' : '/'}
  `
}))

app.listen(8080)
```

### API Options
Options can be supplied as the second argument (`jalla('index.js', opts)`).

- __`sw`__ entry point for a service worker
- __`css`__ explicitly include a css file in the build
- __`quiet`__ disable printing to console
- __`base`__ base path where app will be served
- __`serve`__ serve built files from disk (path or bool)

### SSR (Server side render)
When rendering HTML, jalla will make two render passes; once to allow your views
to fetch the content it needs and once again to generate the resulting HTML. On
the application state there will be an `prefetch` property which is an array for
you to push promises into. Once all promises are resolved, the second render
will commence.

<details>
<summary>Example using state.prefetch</summary>

```javascript
var fetch = require('node-fetch')
var html = require('choo/html')
var choo = require('choo')
var app = choo()

app.route('/', main)
app.use(store)

module.exports = app.mount('body')

function main (state, emit) {
  if (!state.name) {
    emit('fetch')
    return html`<body>Loading…</body>`
  }

  return html`
    <body>
      <h1>Hello ${state.name}!</h1>
    </body>
  `
}

function store (state, emitter) {
  state.name = state.name || null

  emitter.on('fetch', function () {
    var promise = fetch('https://some-api.com')
      .then((res) => res.text())
      .then(function (name) {
        state.name = name
        emitter.emit('render')
      })

    if (state.prefetch) {
      // ask jalla to wait for this promise before rendering the resulting HTML
      state.prefetch.push(promise)
    }
  })
}
```

</details>

#### Caching HTML
Jalla will render HTML for every request, which is excellent for dynamic content
but might not be what you need for all your views and endpoints. You will
probably want to add custom caching middleware or an external caching layer
ontop of your server for optimal performance.

##### Setting up Cloudflare caching with jalla
Cloudflares free tier is an excellent complement to jalla for caching HTML
responses. You'll need to setup Cloudflare to
[cache everything][cloudflare-cache-guide] and to respect existing cache
headers. This means you'll be able to tell Cloudflare which responses to cache
and for how long by setting the `s-maxage` header.

However, when publishing a new version of your webpage or when the cache should
be invalidated due to some external service update, you'll need to purge the
Cloudflare cache. For that purpose, there's [cccpurge][cccpurge].

<details>
<summary>Example purging cache on server startup</summary>

```javascript
var purge = require('cccpurge')
var jalla = require('jalla')
var app = jalla('index.js')

app.use(function (ctx, next) {
  if (ctx.accepts('html')) {
    // cache all html responses on Cloudflare for a week
    ctx.set('Cache-Control', `s-maxage=${60 * 60 * 24 * 7}, max-age=0`)
  }
  return next()
})

if (app.env === 'production') {
  // purge cache before starting production server
  cccpurge(require('./index'), {
    root: 'https://www.my-blog.com',
    email: 'foo@my-blog.com',
    zone: '<CLOUDFLARE_ZONE_ID>',
    key: '<CLOUDFLARE_API_KEY>'
  }, function (err) {
    if (err) process.exit(1)
    app.listen(8080)
  })
} else {
  app.listen(8080)
}
```

</details>

### `ctx.state`
Whatever is stored in the state object after all middleware has run will be used
as state when rendering the HTML response. The resulting application state will
be exposed to the client as `window.initialState` and will be automatically
picked up by Choo. Using `ctx.state` is how you bootstrap your client with
server generated content.

Meta data for the page being rendered can be added to `ctx.state.meta`. A
`<meta>` tag will be added to the header for every property therein.

<details>
<summary>Example decorating ctx.state</summary>

```javascript
var geoip = require('geoip-lite')

app.use(function (ctx, next) {
  if (ctx.accepts('html')) {
    // add meta data
    ctx.state.meta = { 'og:url': 'https://webpage.com' + ctx.url }

    // expose user location on state
    ctx.state.location = geoip.lookup(ctx.ip)
  }
  return next()
})
```

</details>

### `ctx.assets`
Compiled assets (scripts and styles) are exposed on the koa `ctx` object as an
object with the properties `file`, `map`, `buffer` and `url`.

<details>
<summary>Example adding Link headers for all JS assets</summary>

```javascript
app.use(function (ctx, next) {
  if (!ctx.accepts('html')) return next()

  // find all javascript assets
  var bundles = Object.values(ctx.assets)
    .filter((asset) => /\.js$/.test(asset.url))
    .map((asset) => `<${asset.url}>; rel=preload; as=script`)

  // HTTP/2 push all bundles
  ctx.append('Link', bundles)

  return next()
})
```

</details>

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
- [ ] Document build
- [ ] Fix CSS asset handling
- [ ] Add bundle splitting for CSS
- [ ] Pretty UI

[choo]: https://github.com/choojs/choo
[bankai]: https://github.com/choojs/bankai
[koa]: https://github.com/koajs/koa
[koa-middleware]: https://github.com/koajs/koa/wiki
[postcss]: https://github.com/postcss/postcss
[documentify]: https://github.com/stackhtml/documentify
[browserify]: https://github.com/substack/node-browserify
[split-require]: https://github.com/goto-bus-stop/split-require
[babelify]: https://github.com/babel/babelify
[brfs]: https://github.com/browserify/brfs
[envify]: https://github.com/hughsk/envify
[nanohtml]: https://github.com/choojs/nanohtml
[tinyify]: https://github.com/browserify/tinyify
[babel-dynamic-import]: https://github.com/goto-bus-stop/babel-plugin-dynamic-import-split-require
[babel]: https://babeljs.io
[babel-preset-env]: https://github.com/babel/babel-preset-env
[browserslist]: https://github.com/browserslist/browserslist
[postcss-import]: https://github.com/postcss/postcss-import
[postcss-url]: https://github.com/postcss/postcss-url
[autoprefixer]: https://github.com/postcss/autoprefixer
[postcss-csso]: https://github.com/lahmatiy/postcss-csso
[browserify-transform]: https://github.com/browserify/browserify#browserifytransform
[postcss-load-config]: https://github.com/michael-ciniawsky/postcss-load-config#readme
[posthtml-minifier]: https://github.com/Rebelmail/posthtml-minifier
[choo-service-worker]: https://github.com/choojs/choo-service-worker
[cloudflare-cache-guide]: https://support.cloudflare.com/hc/en-us/articles/200172366-How-do-I-cache-everything-on-a-URL-
[cccpurge]: https://github.com/jallajs/cccpurge

[stability-badge]: https://img.shields.io/badge/stability-experimental-orange.svg?style=flat-square
[stability-link]: https://nodejs.org/api/documentation.html#documentation_stability_index
[version-badge]: https://img.shields.io/npm/v/jalla.svg?style=flat-square
[npm-link]: https://npmjs.org/package/jalla
[travis-badge]: https://img.shields.io/travis/jallajs/jalla/master.svg?style=flat-square
[travis-link]: https://travis-ci.org/jallajs/jalla
[downloads-badge]: http://img.shields.io/npm/dm/jalla.svg?style=flat-square
[standard-badge]: https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat-square
[standard-link]: https://github.com/feross/standard
