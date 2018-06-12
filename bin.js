#!/usr/bin/env node

process.title = 'jalla'

var path = require('path')
var chalk = require('chalk')
var assert = require('assert')
var dedent = require('dedent')
var getPort = require('get-port')
var minimist = require('minimist')
var stack = require('./index')

var argv = minimist(process.argv.slice(2), {
  alias: {
    'service-worker': 'sw',
    'version': 'v',
    'quiet': 'q',
    'debug': 'd',
    'port': 'p',
    'help': 'h'
  },
  default: {
    port: process.env.PORT || 8080
  },
  boolean: [
    'help',
    'quiet',
    'version'
  ]
})

if (argv.help) {
  console.log('\n', dedent`
    ${chalk.dim('usage')}
      ${chalk.cyan.bold('jalla')} [opts] <entry>

    ${chalk.dim('options')}
      --service-worker, --sw  entry point for service worker
      --css                   entry point for CSS
      --version, -v           print version
      --quiet, -q             disable printing to console
      --debug, -d             enable node inspector, accepts port
      --port, -p              server port
      --help, -h              show this help text

    ${chalk.dim('examples')}
      ${chalk.bold('start development server')}
      jalla index.js

      ${chalk.bold('start development server with CSS and service worker entries')}
      jalla index.js --sw sw.js --css index.css

      ${chalk.bold('start production server on port 3000')}
      NODE_ENV=production jalla index.js -p 3000

      ${chalk.bold('debug application on port 9229')}
      jalla index.js --debug 9229
  `)
  process.exit(0)
}

if (argv.version) {
  console.log(require('./package.json').version)
  process.exit(0)
}

var entry = argv._[0]
assert(entry, 'jalla: entry file should be supplied')

if (argv.debug) {
  if (typeof argv.debug === 'number') process.debugPort = argv.debug
  process.kill(process.pid, 'SIGUSR1')
}

var opts = {}
if (argv['css']) opts.css = argv['css']
if (argv['service-worker']) opts.sw = argv['service-worker']

var app = stack(path.resolve(process.cwd(), entry), opts)

getPort({port: argv.port}).then(function (port) {
  app.listen(port)
})
