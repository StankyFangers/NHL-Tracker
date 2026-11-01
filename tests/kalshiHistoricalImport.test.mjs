import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'

const src=readFileSync('src/renderer/src/kalshiImport.ts','utf8')
const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const {prepareKalshiImports,matchHistoricalBoxscores,fullNamesFromGameRoster}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))
const make=(date,order,players)=>({
 id:'fill-'+order,fillId:'fill-'+order,orderId:order,date,
 createdAt:date+'T20:00:00Z',ticker:'KXMVECROSSCATEGORY-'+order,
 title:players.map(p=>'yes '+p+': 1+').join(','),
 side:'yes',action:'buy',count:'2',price:'0.4',fee:'0',isNhl:true,review:'NHL_COMBO_TICKERS_CONFIRMED',
 legs:players.map((p,i)=>({ticker:'KXNHLPTS-'+order+'-'+i,side:'yes',title:p+': 1+',resolved:true,source:'MARKET_METADATA',nhlTicker:true}))
})
const a=make('2026-10-30','a',['Mark Jankowski','Seth Jarvis'])
const b=make('2026-10-31','b',['Jackson Blake','Nikolaj Ehlers'])
const slates=[
 {date:'2026-10-30',games:[{id:10,awayTeam:{abbrev:'CAR'},homeTeam:{abbrev:'BOS'}}],dfo:{}},
 {date:'2026-10-31',games:[{id:11,awayTeam:{abbrev:'CAR'},homeTeam:{abbrev:'NYR'}}],dfo:{}}
]
const rosters={CAR:['Mark Jankowski','Seth Jarvis','Jackson Blake','Nikolaj Ehlers']}
test('historical wagers attach to their own purchase-date NHL game',()=>{
 const r=prepareKalshiImports([a,b],[],{},[],1,slates,'__history__',rosters)
 assert.deepEqual(r.skipped,[])
 assert.deepEqual(r.candidates.map(x=>x.date),['2026-10-30','2026-10-31'])
 assert.deepEqual(r.candidates.map(x=>x.bet.groupKey),['10','11'])
})
test('historical imports skip exact Kalshi order but permit fresh identical-leg order',()=>{
 const copy=make('2026-10-30','c',['Mark Jankowski','Seth Jarvis'])
 const r=prepareKalshiImports([a,copy],[{id:'KALSHI-a|KXMVECROSSCATEGORY-a'}],{},[],1,slates,'__history__',rosters)
 assert.equal(r.candidates.length,1)
 assert.equal(r.candidates[0].id,'KALSHI-c|KXMVECROSSCATEGORY-c')
 assert.equal(r.skipped[0].reason,'Already imported')
})

test('matching a different historical day cannot inherit an unrelated current team',()=>{
 const fill=make('2026-10-30','date-scoped',['Mark Jankowski','Seth Jarvis'])
 const slate={date:'2026-10-30',dfo:{},games:[{id:10,awayTeam:{abbrev:'CAR'},homeTeam:{abbrev:'BOS'}}]}
 const failed=prepareKalshiImports([fill],[],slate.dfo,slate.games,1,[],slate.date,{DET:['Mark Jankowski','Seth Jarvis']})
 assert.equal(failed.candidates.length,0)
 assert.match(failed.skipped[0].reason,/NHL game-day player\(s\) not found/)
 const matched=prepareKalshiImports([fill],[],slate.dfo,slate.games,1,[],slate.date,{CAR:['Mark Jankowski','Seth Jarvis']})
 assert.equal(matched.candidates.length,1)
 assert.equal(matched.candidates[0].bet.groupKey,'10')
})

test('October 31 wager matches only October 31 games and original boxscore IDs',()=>{
 const wager=make('2026-10-31','box-match',['Rickard Rakell','Sidney Crosby'])
 const games=[{id:31,awayTeam:{abbrev:'PIT'},homeTeam:{abbrev:'BOS'}}]
 const october31=[
  {gameId:'31',team:'PIT',player:'Rickard Rakell',playerId:8476483},
  {gameId:'31',team:'PIT',player:'Sidney Crosby',playerId:8471675}
 ]
 const result=prepareKalshiImports([wager],[],{},games,1,[],'2026-10-31',{},october31)
 assert.deepEqual(result.skipped,[])
 assert.equal(result.candidates[0].bet.groupKey,'31')
 assert.deepEqual(result.candidates[0].legs.map(l=>l.playerId),[8476483,8471675])
 assert.deepEqual(result.candidates[0].legs.map(l=>l.team),['PIT','PIT'])
 const wrong=prepareKalshiImports([wager],[],{},games,1,[],'2026-10-31',{},october31.map(p=>({...p,gameId:'30'})))
 assert.equal(wrong.candidates.length,0)
 assert.match(wrong.skipped[0].reason,/Player missing from game boxscores/)
})
test('boxscore matcher does not modify partial wagers on a failed leg',()=>{
 const legs=[{player:'Sidney Crosby',qty:1,stat:'Point'},{player:'Missing Player',qty:1,stat:'Point'}]
 const result=matchHistoricalBoxscores(legs,[{id:31,awayTeam:{abbrev:'PIT'},homeTeam:{abbrev:'BOS'}}],[{gameId:'31',team:'PIT',player:'Sidney Crosby',playerId:8471675}])
 assert.equal(result.ok,false)
 assert.equal(legs[0].gameId,undefined)
})

test('same-game play-by-play full names fix abbreviated boxscore player matching',()=>{
 const roster=[
  {playerId:8471675,firstName:{default:'Sidney'},lastName:{default:'Crosby'}},
  {playerId:8476483,firstName:{default:'Rickard'},lastName:{default:'Rakell'}}
 ]
 const fullNames=fullNamesFromGameRoster(roster)
 const boxSkaters=[
  {playerId:8471675,name:{default:'S. Crosby'}},
  {playerId:8476483,name:{default:'R. Rakell'}}
 ]
 const players=boxSkaters.map(x=>({gameId:'31',team:'PIT',player:fullNames.get(x.playerId)||x.name.default,playerId:x.playerId}))
 const wager=make('2026-10-31','abbreviations',['Rickard Rakell','Sidney Crosby'])
 const games=[{id:31,awayTeam:{abbrev:'PIT'},homeTeam:{abbrev:'BOS'}}]
 const resolved=prepareKalshiImports([wager],[],{},games,1,[],'2026-10-31',{},players)
 assert.deepEqual(resolved.skipped,[])
 assert.deepEqual(resolved.candidates[0].legs.map(l=>l.playerId),[8476483,8471675])
})
