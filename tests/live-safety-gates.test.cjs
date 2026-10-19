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

test('LIVE registration stays disabled until explicitly activated', async () => {
  const previous = process.env.NHL_LIVE_SIGNUP_ENABLED
  delete process.env.NHL_LIVE_SIGNUP_ENABLED
  const endpoint = loadEndpoint('live-account.js', {
    handler: fn => fn, reply,
    getLivePool: () => { throw Error('Database must not be called') },
    validName: () => true, validEmail: () => true,
    hashPassword: async () => 'hash',
    issueSession: async () => ({})
  })
  try {
    const res = response()
    await endpoint({method:'POST',body:{action:'register',username:'newfriend',email:'friend@example.com',password:'long-enough-password'}},res)
    assert.equal(res.status,403)
    assert.match(res.body.error,/disabled/i)
  } finally {
    if(previous === undefined) delete process.env.NHL_LIVE_SIGNUP_ENABLED
    else process.env.NHL_LIVE_SIGNUP_ENABLED=previous
  }
})

test('LIVE public signup normalizes usernames and enforces database duplicate errors', async () => {
  const previous = process.env.NHL_LIVE_SIGNUP_ENABLED
  process.env.NHL_LIVE_SIGNUP_ENABLED='YES_LIVE_SIGNUP_APPROVED'
  const users = new Set()
  const endpoint = loadEndpoint('live-account.js', {
    handler: fn => fn, reply,
    validName: v => /^[a-z0-9_]{3,24}$/.test(v),
    validEmail: v => /^[^@]+@[^@]+\\.[^@]+$/.test(v),
    hashPassword: async () => 'hashed',
    getLivePool: () => ({query: async (sql,params) => {
      assert.match(sql,/INSERT INTO public\\.nhl_live_accounts/)
      assert.match(sql,/VALUES\\(\\$1,\\$2,\\$3,'USER'\\)/)
      if(users.has(params[0])) {const err=new Error('unique constraint');err.code='23505';throw err}
      users.add(params[0])
      return {rows:[{id:users.size,username:params[0],role:'USER'}]}
    }}),
    issueSession: async a => ({account:{username:a.username,role:a.role},token:'mock-token'})
  })
  const register=async username => {
    const res=response()
    await endpoint({method:'POST',body:{action:'register',username,email:username.toLowerCase()+'@example.com',password:'long-enough-password'}},res)
    return res
  }
  try {
    const first=await register('StankyFangers')
    assert.equal(first.status,201)
    assert.deepEqual(first.body.account,{username:'stankyfangers',role:'USER'})
    const duplicate=await register('stankyfangers')
    assert.equal(duplicate.status,409)
    assert.match(duplicate.body.error,/already registered/i)
    const friend=await register('AnotherFriend')
    assert.equal(friend.status,201)
    assert.equal(friend.body.account.username,'anotherfriend')
    assert.equal(users.size,2)
  } finally {
    if(previous === undefined) delete process.env.NHL_LIVE_SIGNUP_ENABLED
    else process.env.NHL_LIVE_SIGNUP_ENABLED=previous
  }
})

test('LIVE wager reads use authenticated account ID, never client-supplied account ID', async () => {
  const calls=[]
  const endpoint=loadEndpoint('live-wagers.js',{
    handler: fn=>fn, reply,
    session: async()=>({id:42,username:'owner'}),
    getLivePool:()=>({query:async(sql,params)=>{
      calls.push({sql,params})
      return {rows:[{wager_id:'one',wager:{id:'one',date:'2026-10-19',legs:[]}}]}
    }})
  })
  const res=response()
  await endpoint({method:'GET',query:{limit:'100',accountId:'999'},headers:{}},res)
  assert.equal(res.status,200)
  assert.equal(calls.length,1)
  assert.ok(calls[0].sql.includes('WHERE account_id=$1'))
  assert.equal(calls[0].params[0],42)
  assert.equal(res.body.wagers.length,1)
})

test('LIVE wager reads reject unauthenticated callers without database access', async () => {
  let accessed=false
  const endpoint=loadEndpoint('live-wagers.js',{
    handler: fn=>fn, reply,
    session: async()=>null,
    getLivePool:()=>{accessed=true;throw Error('Unauthorized DB access')}
  })
  const res=response()
  await endpoint({method:'GET',query:{}},res)
  assert.equal(res.status,401)
  assert.equal(accessed,false)
})

test('LIVE wager create is scoped to authenticated owner and never overwrites a duplicate', async () => {
  const prior=process.env.NHL_LIVE_WAGER_WRITES_ENABLED
  process.env.NHL_LIVE_WAGER_WRITES_ENABLED='YES_WAGER_WRITES_SEPARATELY_APPROVED'
  const calls=[]
  const endpoint=loadEndpoint('live-wagers.js',{
    handler:fn=>fn,reply,
    session:async()=>({id:17}),
    getLivePool:()=>({query:async(sql,params)=>{
      calls.push({sql,params})
      return {rowCount:0,rows:[]}
    }})
  })
  try{
    const res=response()
    await endpoint({method:'POST',body:{wager:{id:'w-123',date:'2026-10-19',legs:[]},accountId:999}},res)
    assert.equal(res.status,409)
    assert.equal(calls.length,1)
    assert.ok(calls[0].sql.includes('ON CONFLICT DO NOTHING'))
    assert.equal(calls[0].params[0],17)
    assert.equal(calls[0].params[1],'w-123')
  }finally{
    if(prior===undefined)delete process.env.NHL_LIVE_WAGER_WRITES_ENABLED
    else process.env.NHL_LIVE_WAGER_WRITES_ENABLED=prior
  }
})
