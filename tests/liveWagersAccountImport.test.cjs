'use strict'
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path')
const code=fs.readFileSync(path.join(__dirname,'../vercel-api/api/live-wagers.js'),'utf8')
const wager=(extras={})=>({id:'shared-local-id',date:'2026-10-19',legs:[{player:'Sidney Crosby',qty:1,stat:'Point'}],units:1,...extras})
function fixture(){
 let account={id:'friend-a',username:'friend',role:'USER'},enabled=true
 const rows=new Map(),calls=[]
 const pool={query:async(sql,args)=>{
  calls.push({sql,args})
  const [owner,id,json]=args,key=owner+':'+id
  if(sql.startsWith('INSERT')){
   if(rows.has(key))return {rows:[],rowCount:0}
   const w=JSON.parse(json);rows.set(key,w)
   return {rows:[{wager_id:id,updated_at:'2026-10-20T18:00:00.123456Z'}],rowCount:1}
  }
  if(sql.startsWith('SELECT wager_id'))return {rows:[...rows].filter(([k])=>k.startsWith(owner+':')).map(([,w])=>({wager_id:w.id,wager:w,updated_at:'2026-10-20T18:00:00.123456Z'})),rowCount:1}
  throw Error('Unexpected query')
 }}
 const env={};Object.defineProperty(env,'NHL_LIVE_WAGER_WRITES_ENABLED',{get:()=>enabled?'YES_WAGER_WRITES_SEPARATELY_APPROVED':''})
 const sandbox={module:{exports:{}},process:{env},Buffer,require:()=>({getLivePool:()=>pool,session:async()=>account,reply:(_r,status,body)=>({status,body}),handler:f=>f})}
 vm.runInNewContext(code,sandbox)
 return {rows,calls,account:x=>{account=x},disable:()=>{enabled=false},run:(body)=>sandbox.module.exports({method:'POST',body},{}),list:()=>sandbox.module.exports({method:'GET',query:{}},{})}
}
test('ordinary LIVE user imports into the session account despite supplied account IDs',async()=>{
 const f=fixture(),r=await f.run({source:'import',accountId:'victim',username:'StankyFangers',wager:wager({account_id:'victim'})})
 assert.equal(r.status,201);assert.equal(f.calls[0].args[0],'friend-a');assert.equal(f.rows.has('victim:shared-local-id'),false)
})
test('two users can import the same local wager ID without seeing or overwriting each other',async()=>{
 const f=fixture();assert.equal((await f.run({source:'import',wager:wager()})).status,201)
 f.account({id:'friend-b',username:'friend-b',role:'USER'})
 assert.equal((await f.run({source:'import',wager:wager({units:2})})).status,201)
 const listed=await f.list();assert.equal(listed.body.wagers.length,1);assert.equal(listed.body.wagers[0].wager.units,2)
 assert.equal(f.rows.get('friend-a:shared-local-id').units,1)
})
test('duplicate or conflicting ID in same account cannot overwrite existing wager',async()=>{
 const f=fixture();await f.run({source:'import',wager:wager()})
 for(const w of [wager(),wager({units:9})])assert.equal((await f.run({source:'import',wager:w})).status,409)
 assert.equal(f.rows.size,1);assert.equal(f.rows.get('friend-a:shared-local-id').units,1)
})
test('signed-out users cannot import',async()=>{
 const f=fixture();f.account(null);assert.equal((await f.run({source:'import',wager:wager()})).status,401);assert.equal(f.calls.length,0)
})
test('global write gate still blocks imports',async()=>{
 const f=fixture();f.disable();assert.equal((await f.run({source:'import',wager:wager()})).status,403);assert.equal(f.calls.length,0)
})
test('invalid dates, empty legs, invalid source and oversized payload are rejected',async()=>{
 const f=fixture()
 for(const body of [{source:'import',wager:wager({date:'2026-02-30'})},{source:'import',wager:wager({legs:[]})},{source:'bad',wager:wager()}])assert.equal((await f.run(body)).status,400)
 assert.equal((await f.run({source:'import',wager:wager({notes:'a'.repeat(256*1024)})})).status,413);assert.equal(f.calls.length,0)
})
