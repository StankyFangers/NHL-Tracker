'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const {proposeSync}=require('../tools/live-wager-sync-plan.cjs')
const w=id=>({id,date:'2026-10-19',legs:[]})
test('sync requires approval and backup',()=>{const x=proposeSync([w('a')],[]);assert.equal(x.canStartCreateOnly,false);assert.deepEqual(x.creates,[])})
test('sync only proposes missing wager creation',()=>{const x=proposeSync([w('a'),w('b')],[{wager_id:'b',wager:w('b')}],{ownerConfirmed:true,backupConfirmed:true});assert.deepEqual(x.creates,[{method:'POST',id:'a'}]);assert.deepEqual(x.deletes,[]);assert.deepEqual(x.updates,[])})
test('conflicting IDs block creation',()=>{const x=proposeSync([{...w('a'),status:'WON'},w('b')],[{wager_id:'a',wager:{...w('a'),status:'LOST'}}],{ownerConfirmed:true,backupConfirmed:true});assert.equal(x.requiresManualReview,true);assert.deepEqual(x.creates,[])})
