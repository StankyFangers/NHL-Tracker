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
let authenticated=true
let handler
const pool={query:async(sql,args)=>{queries.push({sql,args});return {rows:[],rowCount:0}}}
const mock={
 getLivePool:()=>pool,
 reply:(res,status,body)=>{res.status=status;res.body=body;return body},
 session:async()=>authenticated?account:null,
 handler:fn=>fn
}
test('non-owner cannot import even when global wager writes are enabled',async()=>{
 Module._load=function(request,parent,isMain){
  if(parent?.filename===apiPath&&request==='../lib/live-auth')return mock
  return original.apply(this,arguments)
 }
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
  for(const invalid of [
   {id:'w2',date:'2026-02-30',legs:[{player:'Crosby'}]},
   {id:'w3',date:'2026-10-19',legs:[]},
   {id:'w4',date:'2026-13-01',legs:[{player:'Crosby'}]}
  ]){
   const count=queries.length,res={}
   await handler({method:'POST',body:{source:'import',wager:invalid}},res)
   assert.equal(res.status,400)
   assert.equal(queries.length,count)
  }
 }finally{
  if(old===undefined)delete process.env.NHL_LIVE_WAGER_WRITES_ENABLED
  else process.env.NHL_LIVE_WAGER_WRITES_ENABLED=old
 }
})

test('every LIVE wager operation is scoped to authenticated account, never client account input',async()=>{
 const previous=process.env.NHL_LIVE_WAGER_WRITES_ENABLED
 process.env.NHL_LIVE_WAGER_WRITES_ENABLED='YES_WAGER_WRITES_SEPARATELY_APPROVED'
 account.id='account-a';account.username='otheruser'
 try{
  const cases=[
   {method:'GET',query:{accountId:'account-b',limit:'10'}},
   {method:'POST',body:{accountId:'account-b',wager:{id:'w1',date:'2026-10-19',legs:[{player:'Crosby'}]}}},
   {method:'PATCH',body:{accountId:'account-b',id:'w1',expectedUpdatedAt:'2026-10-19T12:00:00Z',wager:{id:'w1',date:'2026-10-19',legs:[{player:'Crosby'}]}}},
   {method:'DELETE',body:{accountId:'account-b',id:'w1',expectedUpdatedAt:'2026-10-19T12:00:00Z'}}
  ]
  for(const req of cases){
   queries=[];const res={};await handler(req,res)
   assert.ok(queries.length>0,req.method+' must query account-scoped data')
   for(const q of queries){assert.equal(q.args[0],'account-a');assert.match(q.sql,/account_id=\$1|account_id,wager_id/)}
  }
  account.id='account-b';queries=[]
  await handler({method:'GET',query:{}},{})
  assert.equal(queries[0].args[0],'account-b')
 }finally{
  account.id='account-a'
  if(previous===undefined)delete process.env.NHL_LIVE_WAGER_WRITES_ENABLED
  else process.env.NHL_LIVE_WAGER_WRITES_ENABLED=previous
 }
})

test('unauthenticated requests cannot list or mutate private wagers',async()=>{
 authenticated=false
 const previous=process.env.NHL_LIVE_WAGER_WRITES_ENABLED
 process.env.NHL_LIVE_WAGER_WRITES_ENABLED='YES_WAGER_WRITES_SEPARATELY_APPROVED'
 try{
  for(const method of ['GET','POST','PATCH','DELETE']){
   queries=[];const res={}
   await handler({method,query:{},body:{wager:{id:'w1',date:'2026-10-19',legs:[{}]}}},res)
   assert.equal(res.status,401)
   assert.equal(queries.length,0)
  }
 }finally{
  authenticated=true
  if(previous===undefined)delete process.env.NHL_LIVE_WAGER_WRITES_ENABLED
  else process.env.NHL_LIVE_WAGER_WRITES_ENABLED=previous
 }
})
