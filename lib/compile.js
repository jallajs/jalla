var babel = require('@babel/core')
var { addHook } = require('pirates')
var clearModule = require('clear-module')

var SCRIPT = /\.js$/

module.exports = compile

function compile (state, emit) {
  addHook(hook, { matcher })

  return function (cb) {
    for (const dep of state.deps) {
      if (SCRIPT.test(dep)) clearModule(dep)
    }
    cb()
  }

  function matcher (file) {
    if (/node_modules/.test(file)) return false
    return state.deps.has(file)
  }

  function hook (code, file) {
    try {
      var res = babel.transform(code, {
        filename: file,
        sourceMaps: 'inline',
        plugins: ['dynamic-import-split-require']
      })
      return res.code
    } catch (err) {
      emit('error', err)
      return code
    }
  }
}
