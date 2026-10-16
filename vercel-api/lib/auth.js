'use strict'
const { randomBytes, scrypt: scryptCallback, timingSafeEqual, createHash } = require('node:crypto')
const { promisify } = require('node:util')
const { Pool } = require('pg')
const { reply } = require('./security')
const scrypt = promisify(scryptCallback)
let pool
function db() {
 const raw = process.env.NHL_DEV_AUTH_DATABASE_URL
 if (!raw) throw new Error('DEV authentication database not configured')
 const u = new URL(raw)
 const h = u.hostname.toLowerCase()
 if (!['postgres:','postgresql:'].includes(u.protocol) || u.pathname !== '/neondb' || ![
 'ep-twilight-term-b4fxjrkm.c-6.us-east-2.aws.neon.tech',
 'ep-twilight-term-b4fxjrkm-pooler.c-6.us-east-2.aws.neon.tech'
 ].includes(h)) throw new Error('Authentication database DEV safety lock failed')
 if (!pool) pool = new Pool({connectionString:raw,ssl:{rejectUnauthorized:true},max:2,connectionTimeoutMillis:5000,query_timeout:7000})
 return pool
}
const digest = value => createHash('sha256').update(value).digest('hex')
async function hashPassword(password) {
 const salt=randomBytes(16).toString('hex')
 const hash=await scrypt(password,salt,64)
 return `scrypt:${salt}:${hash.toString('hex')}`
}
async function checkPassword(password,stored) {
 const parts=String(stored).split(':')
 if(parts.length!==3||parts[0]!=='scrypt')return false
 const actual=await scrypt(password,parts[1],64)
 const expected=Buffer.from(parts[2],'hex')
 return expected.length===actual.length && timingSafeEqual(expected,actual)
}
function body(req) {
 if (!req.body || typeof req.body!=='object' || Array.isArray(req.body)) throw Object.assign(new Error('Invalid JSON body'),{status:400})
 if(Buffer.byteLength(JSON.stringify(req.body))>4096)throw Object.assign(new Error('Request too large'),{status:413})
 return req.body
}
async function issueSession(account) {
 const token=randomBytes(32).toString('base64url')
 await db().query('INSERT INTO public.nhl_dev_sessions(token_hash,account_id,expires_at) VALUES ($1,$2,now()+interval \'12 hours\')',[digest(token),account.id])
 return {token,account:{username:account.username,role:account.role},expiresInHours:12}
}
async function session(req) {
 const match=/^Bearer ([A-Za-z0-9_-]{40,100})$/.exec(String(req.headers.authorization||''))
 if(!match)return null
 const result=await db().query(`SELECT a.id,a.username,a.role FROM public.nhl_dev_sessions s JOIN public.nhl_dev_accounts a ON a.id=s.account_id WHERE s.token_hash=$1 AND s.expires_at>now()`,[digest(match[1])])
 return result.rows[0]||null
}
function handler(fn) {return async(req,res)=>{
 res.setHeader('Access-Control-Allow-Origin','null') // Electron requests use main-process fetch; no browser credentials.
 try {await fn(req,res)} catch(e) {console.error('DEV auth failure:',e.message);reply(res,e.status||503,{error:e.status?e.message:'DEV account service unavailable'})}
}}
module.exports={db,reply,body,hashPassword,checkPassword,issueSession,session,handler,digest}
