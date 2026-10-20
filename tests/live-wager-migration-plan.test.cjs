'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const {planMigration}=require('../tools/live-wager-migration-plan.cjs')
const w=(id,extra={})=>({id,date:'2026-10-19',legs:[],...extra})
test('reconciliation identifies local-only, identical, conflicts, cloud-only',()=>{
 const result=planMigration([w('a'),w('b'),w('c',{status:'WON'})],[
  {wager_id:'b',wager:w('b')},
  {wager_id:'c',wager:w('c',{status:'LOST'})},
  {wager_id:'d',wager:w('d')}
 ])
 assert.deepEqual(result,{localCount:3,cloudCount:3,localOnly:['a'],identical:['b'],conflicts:['c'],cloudOnly:['d'],canAutoMerge:false})
})
test('object property order does not produce false conflicts',()=>{
 const result=planMigration([w('a',{book:'DK',status:'WON'})],[{wager_id:'a',wager:{status:'WON',book:'DK',legs:[],date:'2026-10-19',id:'a'}}])
 assert.deepEqual(result.identical,['a'])
})
test('invalid and duplicate local wager IDs fail closed',()=>{
 assert.throws(()=>planMigration([w('a'),w('a')],[]),/duplicate/i)
 assert.throws(()=>planMigration([{id:'',date:'2026-10-19',legs:[]}],[]),/invalid/i)
})
test('cloud ID mismatch and duplicate IDs fail closed',()=>{
 assert.throws(()=>planMigration([],[{wager_id:'other',wager:w('a')}]),/mismatch/i)
 assert.throws(()=>planMigration([],[{wager_id:'a',wager:w('a')},{wager_id:'a',wager:w('a')}]),/duplicate/i)
})
test('planner does not mutate either collection or authorize automatic merge',()=>{
 const local=[w('a')],cloud=[{wager_id:'b',wager:w('b')}]
 const before=JSON.stringify({local,cloud})
 const result=planMigration(local,cloud)
 assert.equal(result.canAutoMerge,false)
 assert.equal(JSON.stringify({local,cloud}),before)
})
