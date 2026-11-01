import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'

const src=readFileSync('src/renderer/src/kalshiImport.ts','utf8')
const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const {prepareKalshiImports}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))
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
