var splitRequire = require('split-require')
var LazyView = require('choo-lazy-view')
var html = require('choo/html')
var choo = require('choo')

var app = choo()

app.route('/', main)
app.route('/a', LazyView.create((callback) => splitRequire('./a', callback)))
app.route('/b', LazyView.create((callback) => splitRequire('./b', callback)))

module.exports = LazyView.mount(app, 'body')

function main () {
  return html`
    <body class="Home">
      <h1>home</h1>
      <a href="/a">a</a><br>
      <a href="/b">b</a>
    </body>
  `
}
