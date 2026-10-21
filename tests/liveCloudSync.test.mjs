import test from 'node:test'
import assert from 'node:assert/strict'
import {cloudBetsEqual,flushCloudWagers} from '../src/renderer/src/liveCloudSync.ts'
const clone=x=>JSON.parse(JSON.stringify(x))
const wager=id=>({id,date:'2026-10-18',legs:[{player:'Sidney Crosby',qty:1,stat:'Point'}],units:1,unitSize:8,odds:150,status:'PENDING'})
function fixture(bets=[wager('a')]){
 let revision=0
 const rows=new Map(bets.map(w=>[w.id,{wager_id:w.id,wager:clone(w),updated_at:'2026-10-20T18:00:00.123456Z'}]))
 const state={last:JSON.stringify(bets),rows:new Map([...rows].map(([id,r])=>[id,r.updated_at]))}
 let latest=clone(bets)
 const calls=[]
 const request=async p=>{
  calls.push(clone(p))
  if(p.method==='GET')return {wagers:[...rows.values()].sort((a,b)=>a.wager_id.localeCompare(b.wager_id)),nextCursor:null}
  const id=p.id||p.wager.id,old=rows.get(id)
  if(p.method==='POST'&&old)return {status:409,error:'exists'}
  if(p.method!=='POST'&&(!old||old.updated_at!==p.expectedUpdatedAt))return {status:old?409:404,error:'revision conflict'}
  if(p.method==='DELETE'){rows.delete(id);return {ok:true,id,deleted:true}}
  const stamp='2026-10-20T18:00:01.'+String(++revision).padStart(6,'0')+'Z'
  rows.set(id,{wager_id:id,wager:clone(p.wager),updated_at:stamp})
  return {ok:true,id,updatedAt:stamp}
 }
 return {state,rows,calls,request,get:()=>latest,set:x=>{latest=x}}
}
test('viewing previous dates/key reordering sends no writes',async()=>{
 const f=fixture();f.set([{status:'PENDING',odds:150,unitSize:8,units:1,legs:wager('a').legs,date:'2026-10-18',id:'a'}])
 assert.equal(await flushCloudWagers(f.state,f.get,f.request),0);assert.equal(f.calls.length,0)
})
test('edit then delete uses exact updated revision',async()=>{
 const f=fixture();f.set([{...wager('a'),units:2}]);await flushCloudWagers(f.state,f.get,f.request)
 f.set([]);await flushCloudWagers(f.state,f.get,f.request)
 assert.equal(f.rows.size,0);assert.equal(f.calls[0].expectedUpdatedAt,'2026-10-20T18:00:00.123456Z')
 assert.equal(f.calls[1].expectedUpdatedAt,'2026-10-20T18:00:01.000001Z')
})
test('verify historical night persists only affected results, survives readback',async()=>{
 const bets=[wager('a'),wager('b'),{...wager('c'),date:'2026-10-20'}],f=fixture(bets)
 f.set(bets.map(w=>w.date==='2026-10-18'?{...w,status:w.id==='a'?'WON':'LOST',verifiedAt:'2026-10-20T18:00:00Z'}:w))
 assert.equal(await flushCloudWagers(f.state,f.get,f.request),2)
 assert.equal(f.rows.get('a').wager.status,'WON');assert.equal(f.rows.get('b').wager.status,'LOST');assert.equal(f.rows.get('c').wager.status,'PENDING')
 assert.ok(cloudBetsEqual(f.get(),(await f.request({method:'GET'})).wagers.map(r=>r.wager)))
})
test('latest edit/delete during pending request is drained without stale writes',async()=>{
 const f=fixture([wager('a'),wager('b')]);f.set([{...wager('a'),units:2},wager('b')]);let first=true
 await flushCloudWagers(f.state,f.get,async p=>{
  const result=await f.request(p)
  if(first){first=false;f.set([{...wager('a'),units:3}])}
  return result
 })
 assert.equal(f.rows.get('a').wager.units,3);assert.equal(f.rows.has('b'),false);assert.ok(cloudBetsEqual(JSON.parse(f.state.last),f.get()))
})
for(const method of ['POST','PATCH','DELETE'])test(method+' committed but response lost is reconciled without duplicate mutation',async()=>{
 const f=fixture(method==='POST'?[]:[wager('a')]);f.set(method==='DELETE'?[]:[{...wager('a'),units:2}]);let lost=false
 await flushCloudWagers(f.state,f.get,async p=>{const r=await f.request(p);if(p.method===method&&!lost){lost=true;throw Error('response lost')}return r})
 assert.equal(f.calls.filter(p=>p.method===method).length,1);assert.ok(cloudBetsEqual(JSON.parse(f.state.last),f.get()))
})
test('temporary failure before commit retries against unchanged remote evidence',async()=>{
 const f=fixture();f.set([{...wager('a'),units:2}]);let failed=false
 await flushCloudWagers(f.state,f.get,async p=>{if(p.method==='PATCH'&&!failed){failed=true;return {error:'offline'}}return f.request(p)})
 assert.equal(f.rows.get('a').wager.units,2)
})
test('concurrent remote change is retained; local edit stays recoverable',async()=>{
 const f=fixture();f.set([{...wager('a'),units:2}]);f.rows.get('a').wager.units=5;f.rows.get('a').updated_at='2026-10-20T18:00:02.123456Z'
 await assert.rejects(flushCloudWagers(f.state,f.get,f.request),/another session/)
 assert.equal(f.rows.get('a').wager.units,5);assert.equal(f.get()[0].units,2)
})
test('partial batch retry never replays acknowledged edits',async()=>{
 const f=fixture([wager('a'),wager('b')]);f.set(f.get().map(w=>({...w,status:'WON'})))
 await assert.rejects(flushCloudWagers(f.state,f.get,async p=>{if(p.id==='b')return {status:403,error:'blocked'};return f.request(p)}),/blocked/)
 assert.equal(JSON.parse(f.state.last).find(w=>w.id==='a').status,'WON')
 await flushCloudWagers(f.state,f.get,f.request)
 assert.equal(f.calls.filter(p=>p.id==='a').length,1);assert.equal(f.rows.get('b').wager.status,'WON')
})
test('account cancellation stops further writes',async()=>{
 const f=fixture([wager('a'),wager('b')]);f.set(f.get().map(w=>({...w,status:'WON'})));let active=true
 await flushCloudWagers(f.state,f.get,async p=>{const r=await f.request(p);active=false;return r},()=>active)
 assert.equal(f.calls.length,1)
})
