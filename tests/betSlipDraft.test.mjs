import test from 'node:test'
import assert from 'node:assert/strict'
import {appendSlipLegs,MAX_SLIP_LEGS} from '../src/renderer/src/betSlipDraft.ts'
const leg=(player,gameId='1001',extras={})=>({player,gameId,qty:1,stat:'Point',...extras})
test('trio stays intact and later single/cross-game additions append to one slip',()=>{
 let slip=appendSlipLegs([],[leg('A'),leg('B'),leg('C')]).legs
 slip=appendSlipLegs(slip,[leg('D','1002')]).legs
 assert.deepEqual(slip.map(l=>l.player),['A','B','C','D']);assert.equal(slip[3].gameId,'1002')
})
test('readding a combo preserves edited targets and never duplicates markets',()=>{
 const edited=leg('A','1001',{qty:2})
 const result=appendSlipLegs([edited],[leg('A'),leg('B')])
 assert.equal(result.added,1);assert.equal(result.duplicates,1);assert.equal(result.legs[0].qty,2)
})
test('different markets or game identities are distinct legs',()=>{
 const result=appendSlipLegs([leg('A')],[leg('A','1001',{stat:'Goal'}),leg('A','1002')]);assert.equal(result.legs.length,3)
})
test('leg limit rejects a whole combo atomically without changing the draft',()=>{
 const draft=Array.from({length:MAX_SLIP_LEGS-1},(_,i)=>leg('P'+i)),before=JSON.stringify(draft)
 assert.throws(()=>appendSlipLegs(draft,[leg('A'),leg('B')]),/up to 12/)
 assert.equal(JSON.stringify(draft),before)
})
test('appending never mutates its source combo',()=>{
 const incoming=[leg('A')],draft=appendSlipLegs([],incoming).legs;draft[0].qty=3;assert.equal(incoming[0].qty,1)
})
