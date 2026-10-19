'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8')
const sql=read('vercel-api/migrations/001_live_accounts.sql')
const accounts=read('vercel-api/api/live-account.js')
const wagers=read('vercel-api/api/live-wagers.js')
const db=read('vercel-api/lib/live-db.js')

test('LIVE schema has all API referenced tables',()=>{
 for(const table of ['nhl_live_accounts','nhl_live_sessions','nhl_live_login_limits','nhl_live_wagers']){
  assert.match(sql,new RegExp('CREATE TABLE IF NOT EXISTS public\\.'+table+'\\s*\\('))
 }
})
test('LIVE wager identity is account scoped',()=>{
 assert.match(sql,/PRIMARY KEY\s*\(account_id,wager_id\)/)
 assert.match(sql,/UNIQUE\s*\(account_id,source,source_external_id\)/)
 assert.match(wagers,/WHERE account_id=\$1/)
 assert.match(wagers,/ON CONFLICT DO NOTHING/)
})
test('LIVE registration defaults to regular USER and checks uniqueness',()=>{
 assert.match(sql,/role text NOT NULL DEFAULT 'USER'/)
 assert.match(sql,/username text NOT NULL UNIQUE/)
 assert.match(sql,/email text NOT NULL UNIQUE/)
 assert.match(accounts,/VALUES\(\$1,\$2,\$3,'USER'\)/)
 assert.match(accounts,/23505/)
})
test('LIVE account activation and wager writes remain separate',()=>{
 assert.match(db,/NHL_LIVE_CLOUD_ENABLED/)
 assert.match(accounts,/NHL_LIVE_SIGNUP_ENABLED/)
 assert.match(wagers,/NHL_LIVE_WAGER_WRITES_ENABLED/)
 assert.match(db,/NHL_LIVE_DATABASE_URL/)
 assert.doesNotMatch(db,/process\.env\.DATABASE_URL\b/)
})
test('migration is explicitly approval gated and transactional',()=>{
 assert.match(sql,/Apply ONLY to an independently verified LIVE database/)
 assert.match(sql,/\bBEGIN;/)
 assert.match(sql,/\bCOMMIT;/)
})
