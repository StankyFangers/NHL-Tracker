'use strict'
// Isolated LIVE identity implementation. No DEV credentials or database fallback.
const {randomBytes, scrypt: callback, timingSafeEqual, createHash}=require('node:crypto')
const {promisify}=require('node:util')
const {getLivePool}=require('./live-db')
const {reply}=require('./security')
const scrypt=promisify(callback)
const digest=v=>createHash('sha256').update(v).digest('hex')
const validName=v=>/^[a-z0-9_]{3,24}$/.test(v)
const validEmail=v=>v.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
async function hashPassword(p){const salt=randomBytes(16).toString('hex');return `scrypt:${salt}:${(await scrypt(p,salt,64)).toString('hex')}`}
async function checkPassword(p,stored){const parts=String(stored||'').split(':');if(parts.length!==3||parts[0]!=='scrypt'||!/^[a-f0-9]{32}$/.test(parts[1])||!/^[a-f0-9]{128}$/.test(parts[2]))return false;const actual=await scrypt(p,parts[1],64);return timingSafeEqual(actual,Buffer.from(parts[2],'hex'))}
async function session(req){const match=/^Bearer ([A-Za-z0-9_-]{40,100})$/.exec(String(req.headers.authorization||''));if(!match)return null;const r=await getLivePool().query('SELECT a.id,a.username,a.role FROM public.nhl_live_sessions s JOIN public.nhl_live_accounts a ON a.id=s.account_id WHERE s.token_hash=$1 AND s.expires_at>now()',[digest(match[1])]);return r.rows[0]||null}
async function issueSession(a){const token=randomBytes(32).toString('base64url');await getLivePool().query("INSERT INTO public.nhl_live_sessions(token_hash,account_id,expires_at) VALUES($1,$2,now()+interval '12 hours')",[digest(token),a.id]);return {token,account:{username:a.username,role:a.role},expiresInHours:12}}
function handler(fn){return async(req,res)=>{try{if(process.env.NHL_LIVE_CLOUD_ENABLED!=='YES_PRODUCTION_APPROVED')return reply(res,503,{error:'LIVE accounts not activated'});await fn(req,res)}catch(e){console.error('LIVE account failure:', {code:e.code||null,name:e.name||null,reason:typeof e.message==='string'&&/^(LIVE database|LIVE cloud)/.test(e.message)?e.message:null});reply(res,e.status||503,{error:e.status?e.message:'LIVE account service unavailable'})}}}
module.exports={getLivePool,reply,digest,validName,validEmail,hashPassword,checkPassword,session,issueSession,handler}
