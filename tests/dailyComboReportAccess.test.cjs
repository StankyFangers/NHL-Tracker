const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(path.join(__dirname, '../src/renderer/src/App.tsx'), 'utf8')
const handler = source.split('const generateDailyComboReport = async ()=>{')[1]
assert.ok(handler, 'daily report handler exists')
const guard = handler.split('setReportBusy(true)')[0]
const authorize = new Function('liveAccount', 'account', 'window', guard + 'return true;')

for (const [label, live, account, allowed] of [
  ['LIVE DEV', {role:'DEV'}, null, true],
  ['TEST DEV', null, {role:'DEV'}, true],
  ['LIVE USER', {role:'USER'}, null, false],
  ['LIVE role takes precedence over TEST cache', {role:'USER'}, {role:'DEV'}, false],
  ['signed out', null, null, false],
]) {
  test('daily PDF authorization: ' + label, () => {
    const messages = []
    assert.equal(authorize(live, account, {alert: message => messages.push(message)}) === true, allowed)
    assert.equal(messages.length, allowed ? 0 : 1)
  })
}
