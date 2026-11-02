import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const src=readFileSync('src/renderer/src/kalshiImport.ts','utf8')
const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const {prepareKalshiImports,verifyKalshiIdentity,matchHistoricalBoxscores,reconcileAlreadyLoggedKalshi,kalshiNhlPlayerNameKey}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))
const date='2026-11-01'
const names=['Quinn Hughes','Kirill Kaprizov','Max Shabanov']
const legs=names.map((player,i)=>({ticker:'KXNHLPTS-'+i,side:'yes',title:player+': '+(i===1?'2':'1')+'+',resolved:true,source:'MARKET_METADATA',nhlTicker:true}))
const fill={id:'fill-shabanov',fillId:'fill-shabanov',orderId:'01a198ce-95b0-7fc6-858e-e834faee2517',date,createdAt:date+'T16:30:00Z',ticker:'KXMVECROSSCATEGORY-S2026PJU3SDDB74DVDLXH-NIJ4MFKHA',title:'yes Quinn Hughes: 1+,yes Kirill Kaprizov: 2+,yes Max Shabanov: 1+',side:'yes',action:'buy',count:'10',price:'0.45',fee:'0',isNhl:true,review:'NHL_COMBO_TICKERS_CONFIRMED',legs}
const games=[{id:2026020199,awayTeam:{abbrev:'MIN'},homeTeam:{abbrev:'WSH'}}]
const rosterPlayers={MIN:['Quinn Hughes','Kirill Kaprizov','Maxim Shabanov'],WSH:[]}
const roster={players:[{id:8477495,firstName:{default:'Quinn'},lastName:{default:'Hughes'}},{id:8478864,firstName:{default:'Kirill'},lastName:{default:'Kaprizov'}},{id:8485702,firstName:{default:'Maxim'},lastName:{default:'Shabanov'}}]}
test('aliases are player-specific, not surname guessing',()=>{
 assert.equal(kalshiNhlPlayerNameKey('Max Shabanov'),kalshiNhlPlayerNameKey('Maxim Shabanov'))
 assert.equal(kalshiNhlPlayerNameKey('Thomas Novak'),kalshiNhlPlayerNameKey('Tommy Novak'))
 assert.notEqual(kalshiNhlPlayerNameKey('Max Smith'),kalshiNhlPlayerNameKey('Maxim Smith'))
})
test('November 1 Quinn Hughes / Kaprizov / Max Shabanov resolves to MIN at WSH',async()=>{
 const {candidates,skipped}=prepareKalshiImports([fill],[],{},games,6,[],date,rosterPlayers)
 assert.equal(skipped.length,0,JSON.stringify(skipped))
 assert.equal(candidates.length,1)
 assert.equal(candidates[0].legs[2].team,'MIN')
 assert.equal(candidates[0].category,'2P - 1P')
 const verified=await verifyKalshiIdentity(candidates,async team=>{assert.equal(team,'MIN');return roster})
 assert.equal(verified.rejected.length,0,JSON.stringify(verified.rejected))
 assert.deepEqual(verified.accepted[0].legs.map(l=>l.playerId),[8477495,8478864,8485702])
})
test('historical boxscore accepts Max Shabanov with verified Maxim Shabanov identity',()=>{
 const players=[{gameId:'2026020199',team:'MIN',player:'Quinn Hughes',playerId:8477495},{gameId:'2026020199',team:'MIN',player:'Kirill Kaprizov',playerId:8478864},{gameId:'2026020199',team:'MIN',player:'Maxim Shabanov',playerId:8485702}]
 const {candidates,skipped}=prepareKalshiImports([fill],[],{},games,6,[],date,{},players)
 assert.equal(skipped.length,0)
 assert.equal(candidates[0].legs[2].playerId,8485702)
})
test('manual bet with Maxim Shabanov matches Kalshi Max Shabanov without duplicates',()=>{
 const {candidates}=prepareKalshiImports([fill],[],{},games,6,[],date,rosterPlayers)
 const existing={id:'MANUAL-1',date,book:'Kalshi',units:candidates[0].risk/6,unitSize:6,odds:candidates[0].odds,legs:candidates[0].legs.map(l=>({...l,player:l.player==='Max Shabanov'?'Maxim Shabanov':l.player}))}
 const result=reconcileAlreadyLoggedKalshi(candidates,[existing])
 assert.equal(result.available.length,0)
 assert.equal(result.matched.length,1)
})
test('ambiguous roster identity stays blocked even with verified name alias',async()=>{
 const {candidates}=prepareKalshiImports([fill],[],{},games,6,[],date,rosterPlayers)
 const duplicated={players:[...roster.players,{id:9999999,firstName:{default:'Max'},lastName:{default:'Shabanov'}}]}
 const checked=await verifyKalshiIdentity(candidates,async()=>duplicated)
 assert.equal(checked.accepted.length,0)
 assert.match(checked.rejected[0].reason,/cannot be verified/)
})
