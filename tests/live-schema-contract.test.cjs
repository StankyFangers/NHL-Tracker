'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8')
const accounts=read('vercel-api/api/live-account.js')
const wagers=read('vercel-api/api/live-wagers.js')
const db=read('vercel-api/lib/live-db.js')
const auth=read('vercel-api/lib/live-auth.js')

test('LIVE account and wager APIs reference the existing production tables',()=>{
 for(const table of ['nhl_live_accounts','nhl_live_sessions','nhl_live_login_limits','nhl_live_wagers']){
  assert.match(accounts+auth+wagers,new RegExp('public\\.'+table+'\\b'))
 }
})
test('LIVE wager reads and mutations are scoped to the authenticated account',()=>{
 assert.match(wagers,/WHERE account_id=\$1/)
 assert.match(wagers,/ON CONFLICT DO NOTHING/)
 assert.match(wagers,/NHL_LIVE_WAGER_WRITES_ENABLED/)
})
test('LIVE registration creates USER accounts and handles duplicate identities',()=>{
 assert.match(accounts,/VALUES\(\$1,\$2,\$3,'USER'\)/)
 assert.match(accounts,/23505/)
 assert.match(accounts,/NHL_LIVE_SIGNUP_ENABLED/)
})
test('LIVE connection is pinned to the existing production endpoint and restricted role',()=>{
 assert.match(db,/NHL_LIVE_DATABASE_URL/)
 assert.match(db,/ep-young-rice-b4fxckhk\.c-6\.us-east-2\.aws\.neon\.tech/)
 assert.match(db,/nhl_tracker_live_restricted/)
 assert.match(db,/LIVE_EXPECTED_DATABASE = 'neondb'/)
 assert.match(db,/sslmode/)
 assert.doesNotMatch(db,/process\.env\.DATABASE_URL\b/)
 for(const obsolete of ['NHL_LIVE_APPROVED_HOST','NHL_LIVE_APPROVED_DATABASE','NHL_LIVE_APPROVED_ROLE','NHL_LIVE_PROVISIONING_VERIFIED']){
  assert.doesNotMatch(db,new RegExp(obsolete))
 }
})
test('LIVE activation, signup and wager-write gates remain independent',()=>{
 assert.match(db,/NHL_LIVE_CLOUD_ENABLED/)
 assert.match(accounts,/NHL_LIVE_SIGNUP_ENABLED/)
 assert.match(wagers,/NHL_LIVE_WAGER_WRITES_ENABLED/)
})
