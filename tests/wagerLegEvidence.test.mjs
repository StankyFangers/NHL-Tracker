import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

// Compile the production TypeScript helper and run its actual functions, not copies.
function loadEvidence(){
 const input=readFileSync(new URL('../src/renderer/src/wagerLegEvidence.ts',import.meta.url),'utf8')
 const compiled=ts.transpileModule(input,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const exports={}
 const window={nhlTracker:{boxscore:async()=>({gameState:'OFF',playerByGameStats:{awayTeam:{forwards:[{playerId:42,firstName:{default:'Casey'},lastName:{default:'Example'},goals:1,assists:0,sog:4}]}}})}}
 vm.runInNewContext(compiled,{exports,window,Map,Set,Promise,Number,String,Array,Object,Error,console},{filename:'wagerLegEvidence.js'})
 return {api:exports,window}
}
test('official player statistics, not losing-slip status, determine individual OVER leg hits',()=>{
 const {api}=loadEvidence()
 const player={id:42,name:'Casey Example',goals:1,assists:0,points:1,shots:4}
 const box={byId:new Map([[42,player]]),byName:new Map([['caseyexample',[player]]]),isFinal:true}
 assert.equal(api.officialLegEvidence({player:'Casey Example',playerId:42,gameId:'123',stat:'Goal',qty:1},box).result,'HIT')
 assert.equal(api.officialLegEvidence({player:'Casey Example',playerId:42,gameId:'123',stat:'Assist',qty:1},box).result,'MISS')
 assert.equal(api.officialLegEvidence({player:'Casey Example',playerId:42,gameId:'123',stat:'Shot',qty:3},box).result,'HIT')
})
test('UNDER hits wait for the game to finish; unconfirmed results stay unverified',()=>{
 const {api}=loadEvidence()
 const player={id:42,name:'Casey Example',goals:0,assists:0,points:0,shots:1}
 const box={byId:new Map([[42,player]]),byName:new Map(),isFinal:false}
 const leg={player:'Casey Example',playerId:42,gameId:'123',stat:'Point',qty:1,side:'UNDER'}
 assert.equal(api.officialLegEvidence(leg,box).result,'UNVERIFIED')
 assert.equal(api.officialLegEvidence(leg,{...box,isFinal:true}).result,'HIT')
})
test('explicit NHL player IDs never silently fall back to a same-name record',()=>{
 const {api}=loadEvidence()
 const player={id:42,name:'Casey Example',goals:1,assists:0,points:1,shots:4}
 const box={byId:new Map([[42,player]]),byName:new Map([['caseyexample',[player]]]),isFinal:true}
 assert.equal(api.officialLegEvidence({player:'Casey Example',playerId:999,stat:'Goal',qty:1},box).result,'UNVERIFIED')
 assert.equal(api.officialLegEvidence({player:'Casey Example',stat:'Goal',qty:1},box).result,'HIT')
 assert.equal(api.officialLegEvidence({player:'Casey Example',stat:'Goal',qty:1},{...box,byName:new Map([['caseyexample',[player,player]]])}).result,'UNVERIFIED')
})
test('cached official boxscores support settled-leg lookup without changing wagers',async()=>{
 const {api}=loadEvidence()
 const first=await api.officialWagerBoxscore(772277)
 const second=await api.officialWagerBoxscore(772277)
 assert.equal(first,second)
 assert.equal(first.isFinal,true)
 assert.equal(first.byId.get(42).goals,1)
})
