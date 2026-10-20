import test from 'node:test'
import assert from 'node:assert/strict'
import {parseMigrationBackup,compareMigration,canonicalJson} from '../src/renderer/src/liveMigrationPreflight.ts'

const wager=(id,extras={})=>({id,date:'2026-10-19',legs:[{player:'Sidney Crosby',stat:'Point',target:1}],units:1,status:'WON',...extras})
const backup=(bets)=>({format:'NHL_TRACKER_LIVE_MIGRATION_BACKUP',version:1,environment:'LIVE',bets})
test('accepts a complete LIVE migration backup',()=>{
 const rows=parseMigrationBackup(backup([wager('a'),wager('b')]))
 assert.equal(rows.length,2)
})
test('rejects duplicate IDs and malformed dates',()=>{
 assert.throws(()=>parseMigrationBackup(backup([wager('a'),wager('a')])),/Duplicate/)
 assert.throws(()=>parseMigrationBackup(backup([wager('a',{date:'invalid'})])),/Invalid/)
})
test('compares semantic JSON rather than property order',()=>{
 const local=wager('a')
 const remote={status:'WON',units:1,legs:[{target:1,stat:'Point',player:'Sidney Crosby'}],date:'2026-10-19',id:'a'}
 assert.equal(canonicalJson(local),canonicalJson(remote))
 const comparison=compareMigration([local],[{wager_id:'a',wager:remote}])
 assert.deepEqual(comparison.identical,['a'])
 assert.equal(comparison.conflicts.length,0)
})
test('never treats conflicting same-ID wager as identical',()=>{
 const local=wager('a')
 const comparison=compareMigration([local],[{wager_id:'a',wager:wager('a',{units:2})}])
 assert.equal(comparison.conflicts.length,1)
 assert.equal(comparison.missing.length,0)
})
test('tracks missing and unrelated cloud wagers',()=>{
 const comparison=compareMigration([wager('a'),wager('b')],[{wager_id:'a',wager:wager('a')},{wager_id:'z',wager:wager('z')}])
 assert.deepEqual(comparison.missing.map(x=>x.id),['b'])
 assert.deepEqual(comparison.cloudOnly,['z'])
})
