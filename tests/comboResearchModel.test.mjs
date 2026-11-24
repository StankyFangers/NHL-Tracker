import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'

const content=readFileSync(new URL('../src/renderer/src/comboResearchModel.ts',import.meta.url),'utf8')
const compiled=ts.transpileModule(content,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const model=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'))
test('includes all 300u to 600u quarter-unit research profiles',()=>{
 assert.deepEqual([...model.RESEARCH_PROFILES],['300','350','400','450','500','550','600'])
 assert.equal(model.RULES.PP1_DUO_101_150['450'],1.25)
 assert.equal(model.RULES.PP2_DUO_FL2_HIGH['450'],1.5)
 assert.equal(model.RULES.PP2_DUO_OTHER_HIGH['450'],.75)
 assert.equal(model.RULES.PP2_TRIO['450'],0)
})
test('imports original Combo Logger 0.1.0 source rows without inventing prices',()=>{
 const rows=[{date:'2026-11-24',gameId:'2026020333',team:'PIT',opponent:'BOS',context:{home:true,gaa:3.1,goalsForPerGame:3.5,opponentXGAllowedPerGame:2.9},combo:{pp:1,fl:2,signature:'123-456',players:[{id:123,name:'First Forward'},{id:456,name:'Second Forward'}]},result:{status:'HIT'}}]
 const r=model.parseResearchImport({schemaVersion:1,rows})
 assert.equal(r.invalid,0)
 assert.equal(r.rows.length,1)
 assert.equal(r.rows[0].odds,null)
 assert.equal(r.rows[0].result,'HIT')
 assert.equal(r.rows[0].ppUnit,1)
 assert.equal(r.rows[0].forwardLine,2)
 assert.deepEqual(r.rows[0].playerIds,[123,456])
 assert.equal(r.rows[0].context.goalsForPerGame,3.5)
 assert.equal(r.rows[0].venue,'HOME')
})
test('only fully priced and verified records contribute to simulated P/L',()=>{
 const base={id:'a',date:'2026-11-24',gameId:'2026020333',team:'PIT',players:['First Forward','Second Forward'],forwardLine:2,ppUnit:2,odds:350,result:'HIT'}
 const d=[base,{...base,id:'b',result:'MISS'},{...base,id:'c',odds:null},{...base,id:'d',result:'UNVERIFIED'}]
 const stats=model.analyzeProfile(d,'450')
 assert.equal(stats.placed,2)
 assert.equal(stats.unpriced,2)
 assert.equal(stats.exposure,3)
 assert.equal(stats.net,3.75)
 assert.equal(stats.roi,125)
})
test('PP1 short-priced duos are skipped, PP2 trios skipped even when priced',()=>{
 const row={id:'a',date:'2026-11-24',gameId:'1',team:'PIT',players:['One','Two'],ppUnit:1,forwardLine:1,odds:-115,result:'MISS'}
 assert.equal(model.classifyResearch(row),'PP1_DUO_LOW')
 assert.equal(model.analyzeProfile([row],'450').exposure,0)
 const trio={...row,players:['One','Two','Three'],ppUnit:2,odds:400}
 assert.equal(model.classifyResearch(trio),'PP2_TRIO')
 assert.equal(model.analyzeProfile([trio],'450').exposure,0)
})
