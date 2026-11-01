import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'

const src=readFileSync('src/renderer/src/kalshiImport.ts','utf8')
const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const {isTwoPointOnePoint,prepareKalshiImports}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))
const leg=(player,qty,stat='Point')=>({player,qty,stat,kind:'PLAYER',side:'OVER'})
test('2P - 1P categorizes a mixed two-player point combo',()=>{
 assert.equal(isTwoPointOnePoint([leg('Sidney Crosby',2),leg('Rickard Rakell',1)]),true)
})
test('2P - 1P categorizes a three-player combo with one 2+',()=>{
 assert.equal(isTwoPointOnePoint([leg('Sidney Crosby',2),leg('Rickard Rakell',1),leg('Thomas Novak',1)]),true)
})
test('2P - 1P excludes standard combos, 2+2+, duplicates, assists, and unders',()=>{
 assert.equal(isTwoPointOnePoint([leg('Sidney Crosby',1),leg('Rickard Rakell',1)]),false)
 assert.equal(isTwoPointOnePoint([leg('Sidney Crosby',2),leg('Rickard Rakell',2)]),false)
 assert.equal(isTwoPointOnePoint([leg('Sidney Crosby',2),leg('Sidney Crosby',1)]),false)
 assert.equal(isTwoPointOnePoint([leg('Sidney Crosby',2),leg('Rickard Rakell',1,'Assist')]),false)
 assert.equal(isTwoPointOnePoint([{...leg('Sidney Crosby',2),side:'UNDER'},leg('Rickard Rakell',1)]),false)
})
test('automatic Kalshi import classifies mixed thresholds before standard combo rules',()=>{
 const fill={id:'fill',fillId:'fill',orderId:'order',date:'2026-11-01',createdAt:'2026-11-01T20:00:00Z',
 ticker:'KXMVECROSSCATEGORY-MIXED',title:'yes Rickard Rakell: 2+,yes Sidney Crosby: 1+,yes Thomas Novak: 1+',
 side:'yes',action:'buy',count:'2',price:'0.4',fee:'0',isNhl:true,review:'NHL_COMBO_TICKERS_CONFIRMED',
 legs:[['Rickard Rakell',2],['Sidney Crosby',1],['Thomas Novak',1]].map(([player,qty],i)=>({
  ticker:'KXNHLPTS-'+i,side:'yes',title:player+': '+qty+'+',resolved:true,source:'MARKET_METADATA',nhlTicker:true
 }))
 }
 const slate={date:'2026-11-01',dfo:{},games:[{id:1,awayTeam:{abbrev:'PIT'},homeTeam:{abbrev:'BOS'}}]}
 const r=prepareKalshiImports([fill],[],slate.dfo,slate.games,1,[],'2026-11-01',{PIT:['Rickard Rakell','Sidney Crosby','Thomas Novak']})
 assert.equal(r.skipped.length,0,JSON.stringify(r.skipped))
 assert.equal(r.candidates[0].category,'2P - 1P')
})
