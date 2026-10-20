'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const Module=require('node:module')
const path=require('node:path')
const apiPath=path.resolve(__dirname,'../vercel-api/api/live-wagers.js')
const authPath=path.resolve(__dirname,'../vercel-api/lib/live-auth.js')
const original=Module._load
const account={id:'account-a',username:'otheruser',role:'USER'}
let queries=[]
const pool={query:async(sql,args)=>{queries.push({sql,args});return {rows:[],rowCount:0}}}
const mock={
 getLivePool:()=>pool,
 reply:(res,status,body)=>{res.status=status;res.body=body;return body},
 session:async()=>account,
 handler:fn=>fn
}
test('non-owner cannot import even when global wager writes are enabled',async()=>{
 Module._load=function(request,parent,isMain){
  if(parent?.filename===apiPath&&request==='../lib/live-auth')return mock
  return original.apply(this,arguments)
 }
 let handler
 try{delete require.cache[apiPath];handler=require(apiPath)}
 finally{Module._load=original}
 const old=process.env.NHL_LIVE_WAGER_WRITES_ENABLED
 process.env.NHL_LIVE_WAGER_WRITES_ENABLED='YES_WAGER_WRITES_SEPARATELY_APPROVED'
 try{
  queries=[]
  const req={method:'POST',body:{source:'import',wager:{id:'w1',date:'2026-10-19',legs:[{player:'Crosby'}]}}}
  const res={}
  await handler(req,res)
  assert.equal(res.status,403)
  assert.match(res.body.error,/owner account/)
  assert.equal(queries.length,0)
  account.username='StankyFangers'
  const ownerRes={}
  await handler(req,ownerRes)
  assert.equal(queries.length,1)
  assert.equal(ownerRes.status,409)
 }finally{
  if(old===undefined)delete process.env.NHL_LIVE_WAGER_WRITES_ENABLED
  else process.env.NHL_LIVE_WAGER_WRITES_ENABLED=old
 }
})
