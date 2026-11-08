import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'

function loadTs(filename){
 const source=readFileSync(new URL(filename,import.meta.url),'utf8')
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const module={exports:{}}
 const read=new Function('module','exports',js+';return typeof parseTitle==="function"?parseTitle:null')
 const parseTitle=read(module,module.exports)
 return {api:module.exports,source,parseTitle}
}
const db=loadTs('../src/renderer/src/playerIdentityDb.ts')
const kalshi=loadTs('../src/renderer/src/kalshiImport.ts')
const app=readFileSync(new URL('../src/renderer/src/App.tsx',import.meta.url),'utf8')
const store=new Map()
globalThis.localStorage={
 getItem:k=>store.get(k)||null,
 setItem:(k,v)=>store.set(k,String(v)),
 removeItem:k=>store.delete(k)
}
const roster={forwards:[{id:8478444,firstName:{default:'Elias'},lastName:{default:'Pettersson'},positionCode:'C',sweaterNumber:40}],
 defensemen:[{id:8483678,firstName:{default:'Elias'},lastName:{default:'Pettersson'},positionCode:'D',sweaterNumber:25}]}

test('Both Vancouver Elias Petterssons remain distinct in the local NHL player index',()=>{
 store.clear()
 const entries=db.api.rosterEntries(roster,'VAN')
 assert.equal(entries.length,2)
 assert.deepEqual(entries.map(p=>p.sweaterNumber),[40,25])
 db.api.addPlayerIdentities(entries)
 assert.equal(db.api.readPlayerDb().length,2)
 assert.equal(db.api.resolvePlayerId('Elias Pettersson','VAN'),undefined,'same name and team cannot pick an ID')
 assert.equal(db.api.resolvePlayerId('Elias Pettersson','VAN','C'),8478444)
 assert.equal(db.api.resolvePlayerId('Elias Pettersson','VAN',undefined,40),8478444)
 assert.equal(db.api.resolvePlayerId('Elias Pettersson','VAN','D',25),8483678)
})
test('Bet Entry shows both candidates, with jersey and position, and verifies chosen ID',()=>{
 assert.match(app,/indexed\.filter\(p=>!roster\.some\(r=>r\.id===p\.id\)\)/)
 assert.match(app,/p\.sweaterNumber\?/)
 assert.match(app,/const selectedId=Number\(l\.playerId\)\|\|0/)
 assert.match(app,/ids\.includes\(selectedId\)/)
 assert.match(app,/matches\.length===1\?matches\[0\]:null/)
})
test('Kalshi retains jersey clues rather than stripping their evidence',()=>{
 const parsed=kalshi.parseTitle('yes Elias Pettersson (#40): 1+','KXNHLPOINT')
 assert.deepEqual({player:parsed.player,sweaterNumber:parsed.sweaterNumber},{player:'Elias Pettersson',sweaterNumber:40})
})
test('Kalshi rejects indistinguishable same-team names, resolves explicit #40',async()=>{
 const leg=(sweaterNumber)=>({player:'Elias Pettersson',team:'VAN',kind:'PLAYER',qty:1,stat:'Point',side:'OVER',sweaterNumber})
 const candidate=(id,sweaterNumber)=>({id,bet:{legs:[leg(sweaterNumber)]}})
 const result=await kalshi.api.verifyKalshiIdentity([candidate('ambiguous',undefined),candidate('center',40),candidate('defense',25)],async()=>roster)
 assert.deepEqual(result.accepted.map(c=>[c.id,c.bet.legs[0].playerId]),[['center',8478444],['defense',8483678]])
 assert.deepEqual(result.rejected.map(c=>c.id),['ambiguous'])
 assert.match(result.rejected[0].reason,/Multiple NHL players share/)
})
