'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const src=fs.readFileSync(path.resolve(__dirname,'../vercel-api/api/live-preflight.js'),'utf8')
test('preflight never mutates database records',()=>{
 assert.match(src,/BEGIN READ ONLY/)
 assert.match(src,/current_user/)
 assert.match(src,/current_database/)
 assert.match(src,/has_table_privilege/)
 assert.doesNotMatch(src,/\b(?:INSERT INTO|UPDATE public|DELETE FROM|CREATE TABLE|ALTER TABLE)\b/i)
})
test('preflight exposes no connection credentials or rows',()=>{
 assert.match(src,/liveConnection:'ready'/)
 assert.match(src,/liveConnection:'not-ready'/)
 assert.match(src,/activation-disabled/)
 assert.doesNotMatch(src,/res\.json\(r\.rows/)
})
