import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import ts from 'typescript'

const source=readFileSync(resolve('src/renderer/src/kalshiImport.ts'),'utf8')
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const {parseKalshiParentLegs,prepareKalshiImports}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))

const names=[
 ['Mark Jankowski','Seth Jarvis'],
 ['Jackson Blake','Nikolaj Ehlers'],
 ['Gabriel Vilardi','Kyle Connor'],
 ['Cole Perfetti','Mark Scheifele'],
 ['Andrei Svechnikov','Sebastian Aho']
]
for(const [index,pair] of names.entries()){
 test('Kalshi comma-separated combo '+pair.join(' + '),()=>{
  const title=pair.map(n=>'yes '+n+': 1+').join(',')
  const repeated=title+' | '+title
  assert.deepEqual(parseKalshiParentLegs(repeated),pair.map(player=>({player,qty:1})))
  for(const separator of [' ', ', ', ' , ', ',']){
   const variant=pair.map(n=>'yes '+n+': 1+').join(separator)
   assert.deepEqual(parseKalshiParentLegs(variant),pair.map(player=>({player,qty:1})),separator)
  }
  const fills=[{
   id:'fill-'+index,fillId:'fill-'+index,orderId:'order-'+index,
   date:'2026-11-01',createdAt:'2026-11-01T18:00:00Z',
   ticker:'KXMVECROSSCATEGORY-SAMPLE-'+index,title:repeated,
   side:'yes',action:'buy',count:'2',price:'0.40',fee:'0',
   isNhl:true,review:'NHL_COMBO_TICKERS_CONFIRMED',
   legs:pair.map((_,i)=>({ticker:'KXNHLPTS-SAMPLE-'+i,side:'yes',title:'KXNHLPTS-SAMPLE-'+i,resolved:false,source:'TICKER_ONLY',nhlTicker:true}))
  }]
  const team=index===0?'CAR':index===2||index===3?'WPG':'CAR'
  const rosterPlayers={[team]:pair}
  const games=[{id:100+index,awayTeam:{abbrev:team},homeTeam:{abbrev:'BOS'}}]
  const r=prepareKalshiImports(fills,[],{},games,1,[],'2026-11-01',rosterPlayers)
  assert.equal(r.skipped.length,0,JSON.stringify(r.skipped))
  assert.equal(r.candidates.length,1)
  assert.deepEqual(r.candidates[0].legs.map(l=>l.player),pair)
  assert.deepEqual(r.candidates[0].legs.map(l=>l.qty),[1,1])
  assert.equal(r.candidates[0].category,'COMBOS')
 })
}
test('refuse mismatched component counts',()=>{
 const title='yes Mark Jankowski: 1+,yes Seth Jarvis: 1+'
 const row={id:'fill',fillId:'fill',orderId:'order',date:'2026-11-01',ticker:'KXMVECROSSCATEGORY-SAMPLE',title,side:'yes',action:'buy',count:'2',price:'0.4',fee:'0',isNhl:true,review:'NHL_COMBO_TICKERS_CONFIRMED',legs:[{ticker:'KXNHLPTS-SAMPLE',side:'yes',title:'missing metadata',resolved:false,source:'TICKER_ONLY',nhlTicker:true}]}
 const result=prepareKalshiImports([row],[],{},[],1,[],'2026-11-01',{})
 assert.equal(result.candidates.length,0)
})

test('reject incomplete or ambiguous parent descriptions',()=>{
 assert.deepEqual(parseKalshiParentLegs('yes Mark Jankowski: 1+ nonsense yes Seth Jarvis: 1+'),[])
 assert.deepEqual(parseKalshiParentLegs('yes Mark Jankowski: 1+,yes Mark Jankowski: 1+'),[])
})

test('Kalshi parent titles preserve two thresholds for each player',()=>{
 const raw='yes Connor McDavid: 1+,yes Leon Draisaitl: 1+,yes Connor McDavid: 2+,yes Leon Draisaitl: 2+'
 assert.deepEqual(parseKalshiParentLegs(raw),[
  {player:'Connor McDavid',qty:1},{player:'Leon Draisaitl',qty:1},
  {player:'Connor McDavid',qty:2},{player:'Leon Draisaitl',qty:2}
 ])
})
test('Kalshi jersey-number note does not break player identification',()=>{
 const raw='yes Elias Pettersson (#40): 1+,yes Jake DeBrusk: 1+'
 assert.deepEqual(parseKalshiParentLegs(raw),[
  {player:'Elias Pettersson (#40)',qty:1},{player:'Jake DeBrusk',qty:1}
 ])
})
