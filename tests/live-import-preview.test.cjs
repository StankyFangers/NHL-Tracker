'use strict'
const test=require('node:test');const assert=require('node:assert/strict');const {preview,hash}=require('../tools/live-import-preview.cjs');
const wager=(id,units=1)=>({id,date:'2026-10-18',legs:[],units,unitSize:2.5,book:'Kalshi',odds:120});
test('classifies new, identical, conflicting and server-only wagers',()=>{const r=preview([wager('a'),wager('b'),wager('c',2)],[wager('b'),wager('c',1),wager('d')]);assert.deepEqual(r.newWagers.map(x=>x.id),['a']);assert.deepEqual(r.alreadyPresent,['b']);assert.deepEqual(r.conflicts.map(x=>x.id),['c']);assert.deepEqual(r.serverOnly,['d'])});
test('key order does not affect equality',()=>{assert.equal(hash({a:1,b:2}),hash({b:2,a:1}))});
test('duplicate local IDs fail closed',()=>{assert.throws(()=>preview([wager('a'),wager('a')],[]),/duplicate ID/)});
test('missing wager identity fails closed',()=>{assert.throws(()=>preview([{date:'2026-10-18',legs:[]}],[]),/invalid wager/)});
