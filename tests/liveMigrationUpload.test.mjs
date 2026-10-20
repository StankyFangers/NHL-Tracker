import test from 'node:test'
import assert from 'node:assert/strict'
import {listAllCloudWagers,importHistoricalWagers} from '../src/renderer/src/liveMigrationUpload.ts'
const wager=id=>({id,date:'2026-10-19',legs:[{player:'Sidney Crosby',stat:'Point',qty:1}],units:1,status:'WON'})
const cloud=(...ids)=>ids.map(id=>({wager_id:id,wager:wager(id)}))
test('paginates and preserves cloud rows without mutation',async()=>{
 let calls=0
 const rows=await listAllCloudWagers(async p=>{
  assert.equal(p.method,'GET');calls++
  return calls===1?{wagers:cloud('a'),nextCursor:'a'}:{wagers:cloud('b'),nextCursor:null}
 })
 assert.deepEqual(rows.map(r=>r.wager_id),['a','b'])
})
test('rejects duplicate cloud IDs across pages',async()=>{
 let calls=0
 await assert.rejects(listAllCloudWagers(async()=>{
  calls++;return calls===1?{wagers:cloud('a'),nextCursor:'a'}:{wagers:cloud('a'),nextCursor:null}
 }),/Duplicate/)
})
test('create-only import skips existing wagers and verifies readback',async()=>{
 const store=new Map([['a',wager('a')]])
 let creates=0,progress=0
 const request=async p=>{
  if(p.method==='GET')return {wagers:[...store.entries()].map(([id,w])=>({wager_id:id,wager:w})),nextCursor:null}
  creates++;store.set(p.wager.id,p.wager);return {ok:true,id:p.wager.id,created:true}
 }
 const result=await importHistoricalWagers([wager('a'),wager('b')],request,()=>progress++)
 assert.equal(creates,1);assert.equal(progress,1)
 assert.deepEqual(result,{uploaded:1,identical:2,cloudOnly:0})
})
test('conflicting same-ID wager stops before POST',async()=>{
 let creates=0
 const request=async p=>{
  if(p.method==='POST'){creates++;return {ok:true,id:p.wager.id,created:true}}
  return {wagers:[{wager_id:'a',wager:{...wager('a'),units:2}}],nextCursor:null}
 }
 await assert.rejects(importHistoricalWagers([wager('a')],request,()=>{}),/conflicts block/)
 assert.equal(creates,0)
})
test('interrupted import can be resumed without duplicates',async()=>{
 const store=new Map(),source=[wager('a'),wager('b')]
 let failed=false
 const request=async p=>{
  if(p.method==='GET')return {wagers:[...store.entries()].map(([id,w])=>({wager_id:id,wager:w})),nextCursor:null}
  if(p.wager.id==='b'&&!failed){failed=true;return {error:'simulated network interruption'}}
  store.set(p.wager.id,p.wager);return {ok:true,id:p.wager.id,created:true}
 }
 await assert.rejects(importHistoricalWagers(source,request,()=>{}),/Import stopped/)
 const result=await importHistoricalWagers(source,request,()=>{})
 assert.equal(result.uploaded,1)
 assert.equal(result.identical,2)
})

test('653-wager migration exercises four cloud pages and verifies every ID',async()=>{
 const source=Array.from({length:653},(_,i)=>wager('historic-'+String(i+1).padStart(4,'0')))
 const store=new Map(),progress=[]
 let writes=0
 const request=async p=>{
  if(p.method==='POST'){
   assert.equal(p.source,'import')
   assert.equal(store.has(p.wager.id),false)
   store.set(p.wager.id,p.wager);writes++
   return {ok:true,id:p.wager.id,created:true}
  }
  const ids=[...store.keys()].sort().filter(id=>!p.cursor||id>p.cursor)
  const selected=ids.slice(0,p.limit||200)
  return {wagers:selected.map(id=>({wager_id:id,wager:store.get(id)})),nextCursor:ids.length>selected.length?selected.at(-1):null}
 }
 const result=await importHistoricalWagers(source,request,p=>progress.push(p))
 assert.equal(writes,653)
 assert.equal(result.uploaded,653)
 assert.equal(result.identical,653)
 assert.equal(progress.at(-1).remaining,0)
 const repeat=await importHistoricalWagers(source,request,()=>{throw Error('unexpected upload')})
 assert.equal(repeat.uploaded,0)
 assert.equal(writes,653)
})

test('rejects unsuccessful cloud listings without trusting partial data',async()=>{
 await assert.rejects(listAllCloudWagers(async()=>({ok:false,wagers:[],nextCursor:null})),/Cloud listing failed/)
})
test('rejects empty continuation pages',async()=>{
 await assert.rejects(listAllCloudWagers(async()=>({wagers:[],nextCursor:'next'})),/Empty cloud page/)
})
test('rejects cloud pages larger than requested limit',async()=>{
 const rows=cloud(...Array.from({length:201},(_,i)=>'id-'+i))
 await assert.rejects(listAllCloudWagers(async()=>({wagers:rows,nextCursor:'next'})),/exceeds requested limit/)
})
