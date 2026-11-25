import test from 'node:test'
import assert from 'node:assert/strict'
import {parseResearchLineup,combosFromLineup,collectPregame} from '../src/collector.mjs'
import worker from '../src/worker.mjs'
const a=n=>`<a href="/players/p-${n.toLowerCase().replaceAll(' ','-')}">${n}</a>`
const forwards=['Alpha One','Bravo Two','Charlie Three','Delta Four','Echo Five','Foxtrot Six','Golf Seven','Hotel Eight','India Nine','Juliet Ten','Kilo Eleven','Lima Twelve']
const html=`<h2>Forwards</h2>${forwards.map(a).join(' ')}<h2>Defensive Pairings</h2><h2>1st Powerplay Unit</h2>${['Alpha One','Bravo Two','Charlie Three','Delta Four','Golf Seven'].map(a).join('')}<h2>2nd Powerplay Unit</h2>${['Echo Five','Foxtrot Six','Hotel Eight','India Nine','Juliet Ten'].map(a).join('')}<h2>1st Penalty Kill Unit</h2>`
test('extracts four forward lines and PP membership from HTML',()=>{
 const lineup=parseResearchLineup(html)
 assert.ok(lineup)
 assert.equal(lineup.forwardLines.length,4)
 assert.deepEqual(lineup.forwardLines[0],forwards.slice(0,3))
 assert.equal(lineup.pp1.length,5)
 assert.equal(lineup.pp2.length,5)
})
test('generates pairs and trios only when sharing the same forward line and PP unit',()=>{
 const rows=combosFromLineup(parseResearchLineup(html))
 const pp1fl1=rows.filter(x=>x.ppUnit===1&&x.forwardLine===1)
 assert.equal(pp1fl1.length,4)
 assert.equal(pp1fl1.filter(x=>x.players.length===2).length,3)
 assert.equal(pp1fl1.filter(x=>x.players.length===3).length,1)
 assert.equal(rows.filter(x=>x.forwardLine===4).length,0)
 for(const row of rows)assert.ok(row.players.every(name=>forwards.slice((row.forwardLine-1)*3,row.forwardLine*3).includes(name)))
})
test('incomplete source is rejected rather than producing invented combos',()=>{
 assert.equal(parseResearchLineup('<h2>Forwards</h2>'+a('Only One')),null)
 assert.deepEqual(combosFromLineup(null),[])
})
test('unauthorized importer is blocked and health is readable',async()=>{
 const health=await worker.fetch(new Request('https://research.example/health'),{}, {})
 assert.equal(health.status,200)
 const body=await health.json();assert.equal(body.ok,true)
 const res=await worker.fetch(new Request('https://research.example/research/combos',{method:'POST',headers:{'content-type':'application/json'},body:'{"combos":[]}' }),{}, {})
 assert.equal(res.status,401)
})

test('collector checks teams on the Telegram pregame cadence',async()=>{
 const now=Date.parse('2026-11-24T19:00:00-05:00')
 let start,age
 const db={prepare(sql){return {bind(){return this},async first(){
  if(sql.includes('research_schedule_cache'))return {updated_ms:now,payload:JSON.stringify([{gameId:'1',start,away:'VGK',home:'EDM'}])}
  if(sql.includes('research_capture_state'))return {checked_ms:now-age}
  return {n:0}
 }}},async batch(){}}
 const original=globalThis.fetch
 globalThis.fetch=async()=>new Response(html)
 try{
  for(const [minutes,gap] of [[540,60],[420,30],[240,15],[60,5],[15,1]]){
   start=now+minutes*60000
   age=gap*60000-1
   assert.equal((await collectPregame({DB:db},now)).attempted,0)
   age++
   assert.equal((await collectPregame({DB:db},now)).attempted,2)
  }
  for(const offset of [-60000,0,540*60000+1]){
   start=now+offset
   assert.equal((await collectPregame({DB:db},now)).games,0)
  }
  assert.equal((await collectPregame({},Date.parse('2026-11-24T09:59:00-05:00'))).games,0)
 }finally{globalThis.fetch=original}
})
