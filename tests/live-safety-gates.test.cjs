'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const Module = require('node:module')

// Exercise actual endpoint handlers without connecting to Neon or Vercel.
function loadEndpoint(file, auth) {
  const target = path.resolve(__dirname, '../vercel-api/api', file)
  const originalLoad = Module._load
  Module._load = function(request, parent, isMain) {
    if (request === '../lib/live-auth' && parent?.filename === target) return auth
    return originalLoad.apply(this, arguments)
  }
  try {
    delete require.cache[target]
    return require(target)
  } finally {
    Module._load = originalLoad
    delete require.cache[target]
  }
}
function reply(res, status, body) { res.status = status; res.body = body; return res }
function response() { return {} }

test('LIVE wager mutations fail closed without separate approval', async () => {
  const prior = process.env.NHL_LIVE_WAGER_WRITES_ENABLED
  delete process.env.NHL_LIVE_WAGER_WRITES_ENABLED
  let dbCalls = 0
  const handler = loadEndpoint('live-wagers.js', {
    handler: fn => fn,
    session: async () => ({ id: 123 }),
    getLivePool: () => { dbCalls++; throw Error('Unexpected database access') },
    reply
  })
  try {
    for (const method of ['POST', 'PATCH', 'DELETE']) {
      const res = response()
      await handler({ method, body: {} }, res)
      assert.equal(res.status, 403, method)
      assert.match(res.body.error, /disabled/i)
    }
    assert.equal(dbCalls, 0)
  } finally {
    if (prior === undefined) delete process.env.NHL_LIVE_WAGER_WRITES_ENABLED
    else process.env.NHL_LIVE_WAGER_WRITES_ENABLED = prior
  }
})

test('LIVE registration rejects missing activation and invitation configuration', async () => {
  const keys = ['NHL_LIVE_SIGNUP_ENABLED', 'NHL_LIVE_SIGNUP_ALLOWED_USERNAME', 'NHL_LIVE_SIGNUP_INVITE_SHA256']
  const prior = Object.fromEntries(keys.map(k => [k, process.env[k]]))
  const handler = loadEndpoint('live-account.js', {
    handler: fn => fn,
    reply,
    getLivePool: () => { throw Error('Unexpected database access') },
    digest: () => '', validName: () => true, validEmail: () => true,
    hashPassword: async () => 'unused',
    checkPassword: async () => false,
    session: async () => null,
    issueSession: async () => ({})
  })
  const req = { method: 'POST', body: {
    action: 'register', username: 'stankyfangers', email: 'test@example.com',
    password: 'a-valid-password-123', invitationCode: 'x'.repeat(32)
  }}
  try {
    for (const k of keys) delete process.env[k]
    let res = response()
    await handler(req, res)
    assert.equal(res.status, 403)
    process.env.NHL_LIVE_SIGNUP_ENABLED = 'YES_LIVE_SIGNUP_APPROVED'
    process.env.NHL_LIVE_SIGNUP_ALLOWED_USERNAME = 'stankyfangers'
    res = response()
    await handler(req, res)
    assert.equal(res.status, 403)
    assert.match(res.body.error, /invitation/i)
  } finally {
    for (const k of keys) {
      if (prior[k] === undefined) delete process.env[k]
      else process.env[k] = prior[k]
    }
  }
})
