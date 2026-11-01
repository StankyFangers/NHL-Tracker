import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'

const src=readFileSync('src/renderer/src/kalshiImport.ts','utf8')
const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const {reconcileAlreadyLoggedKalshi}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))

const day='2026-11-01'
const pair=(a,b)=>[{player:a,qty:1,stat:'Point',side:'OVER',gameId:'2026020199'},{player:b,qty:1,stat:'Point',side:'OVER',gameId:'2026020199'}]
const entry=(id,legs,risk,odds)=>({id,date:day,legs,risk,odds})
const manual=(id,legs,risk,odds)=>({id,date:day,legs,book:'Kalshi',units:risk/6,unitSize:6,odds,status:'PENDING'})
const rows=[
 ['Mark Jankowski','Seth Jarvis',6,236],
 ['Jackson Blake','Nikolaj Ehlers',9,112],
 ['Gabriel Vilardi','Kyle Connor',8.99,170],
 ['Cole Perfetti','Mark Scheifele',9,143],
 ['Andrei Svechnikov','Sebastian Aho',9,112]
]
test('all five manually logged November 1 Kalshi wagers are excluded from daily import',()=>{
 const candidates=rows.map(([a,b,c,d],i)=>entry('KALSHI-'+i,pair(a,b),c,d))
 const recorded=rows.map(([a,b,c,d],i)=>manual('BET-LEGACY-'+i,pair(b,a),c,d))
 const result=reconcileAlreadyLoggedKalshi(candidates,recorded)
 assert.equal(result.available.length,0)
 assert.equal(result.matched.length,5)
 assert.ok(result.matched.every(x=>x.reason.includes('Already recorded')))
})
test('a second genuinely distinct Kalshi purchase with identical legs stays importable',()=>{
 const legs=pair('Mark Jankowski','Seth Jarvis')
 const result=reconcileAlreadyLoggedKalshi([entry('KALSHI-A',legs,6,236),entry('KALSHI-B',legs,6,236)],[manual('LEGACY-A',legs,6,236)])
 assert.equal(result.matched.length,1)
 assert.deepEqual(result.available.map(x=>x.id),['KALSHI-B'])
})
test('distinct Kalshi order IDs are not merged with one another',()=>{
 const legs=pair('Mark Jankowski','Seth Jarvis')
 const result=reconcileAlreadyLoggedKalshi([entry('KALSHI-NEW',legs,6,236)],[manual('KALSHI-OLD',legs,6,236)])
 assert.equal(result.matched.length,0)
 assert.equal(result.available.length,1)
})
test('different wager amount odds or date never match',()=>{
 const legs=pair('Mark Jankowski','Seth Jarvis')
 const candidate=entry('KALSHI-NEW',legs,6,236)
 const different=[manual('A',legs,9,236),manual('B',legs,6,170),{...manual('C',legs,6,236),date:'2026-10-31'}, {...manual('D',legs,6,236),book:'Fanatics'}]
 const result=reconcileAlreadyLoggedKalshi([candidate],different)
 assert.equal(result.matched.length,0)
 assert.equal(result.available.length,1)
})
