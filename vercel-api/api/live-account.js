'use strict'
// Phase 2B server API only: no renderer wiring and no LIVE wager migration.
const {getLivePool,reply,digest,validName,validEmail,hashPassword,checkPassword,session,issueSession,handler}=require('../lib/live-auth')
const {createHash,timingSafeEqual}=require('node:crypto')
const FALLBACK='scrypt:00000000000000000000000000000000:'+('00'.repeat(64))
module.exports=handler(async(req,res)=>{
 if(req.method==='GET'){const a=await session(req);return a?reply(res,200,{account:{username:a.username,role:a.role}}):reply(res,401,{error:'Session expired'})}
 if(req.method!=='POST')return reply(res,405,{error:'Method not allowed'})
 if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||Buffer.byteLength(JSON.stringify(req.body))>4096)return reply(res,400,{error:'Invalid request'})
 const {action}=req.body
 if(action==='register'){
  if(process.env.NHL_LIVE_SIGNUP_ENABLED!=='YES_LIVE_SIGNUP_APPROVED')return reply(res,403,{error:'LIVE registration disabled'})
  const username=String(req.body.username||'').trim().toLowerCase(),email=String(req.body.email||'').trim().toLowerCase(),password=String(req.body.password||'')
  // Phase 2M: first-registration window is limited to the specifically approved username.
  // Missing/mismatched allowlist fails closed; registration still creates USER only.
  if(process.env.NHL_LIVE_SIGNUP_ALLOWED_USERNAME!=='stankyfangers'||username!=='stankyfangers')return reply(res,403,{error:'LIVE registration not authorized for this username'})
  if(!validName(username)||!validEmail(email)||password.length<12||password.length>128)return reply(res,400,{error:'Invalid registration fields'})
  // Compare SHA-256 digests in constant time; invitation secret is configured only on Vercel.
  const invite=typeof req.body.invitationCode==='string'?req.body.invitationCode:''
  const expected=String(process.env.NHL_LIVE_SIGNUP_INVITE_SHA256||'').toLowerCase()
  if(!/^[a-f0-9]{64}$/.test(expected)||invite.length<24||invite.length>256)return reply(res,403,{error:'Invalid registration invitation'})
  const actual=createHash('sha256').update(invite,'utf8').digest()
  if(!timingSafeEqual(actual,Buffer.from(expected,'hex')))return reply(res,403,{error:'Invalid registration invitation'})
  const hash=await hashPassword(password)
  try{const r=await getLivePool().query("INSERT INTO public.nhl_live_accounts(username,email,password_hash,role) VALUES($1,$2,$3,'USER') RETURNING id,username,role",[username,email,hash]);return reply(res,201,await issueSession(r.rows[0]))}
  catch(e){if(e.code==='23505')return reply(res,409,{error:'Username or email already registered'});throw e}
 }
 if(action==='login'){
  const login=String(req.body.login||'').trim().toLowerCase(),password=String(req.body.password||'')
  if(!login||login.length>254||password.length>128)return reply(res,401,{error:'Invalid credentials'})
  // Durable DB-backed limit per normalized login identity; no in-memory counter.
  const key=digest(login),pool=getLivePool()
  const limit=await pool.query('SELECT attempts,locked_until FROM public.nhl_live_login_limits WHERE login_hash=$1',[key])
  if(limit.rows[0]?.locked_until && new Date(limit.rows[0].locked_until)>new Date())return reply(res,429,{error:'Too many attempts; try later'})
  const r=await pool.query('SELECT id,username,role,password_hash FROM public.nhl_live_accounts WHERE username=$1 OR email=$1 LIMIT 1',[login]);const a=r.rows[0]
  const ok=await checkPassword(password,a?.password_hash||FALLBACK)
  if(!ok||!a){await pool.query(`INSERT INTO public.nhl_live_login_limits(login_hash,attempts,locked_until) VALUES($1,1,NULL) ON CONFLICT(login_hash) DO UPDATE SET attempts=CASE WHEN nhl_live_login_limits.updated_at<now()-interval '15 minutes' THEN 1 ELSE nhl_live_login_limits.attempts+1 END, locked_until=CASE WHEN nhl_live_login_limits.updated_at>=now()-interval '15 minutes' AND nhl_live_login_limits.attempts>=7 THEN now()+interval '15 minutes' ELSE NULL END,updated_at=now()`,[key]);return reply(res,401,{error:'Invalid credentials'})}
  await pool.query('DELETE FROM public.nhl_live_login_limits WHERE login_hash=$1',[key]);return reply(res,200,await issueSession(a))
 }
 if(action==='logout'){const m=/^Bearer ([A-Za-z0-9_-]{40,100})$/.exec(String(req.headers.authorization||''));if(m)await getLivePool().query('DELETE FROM public.nhl_live_sessions WHERE token_hash=$1',[digest(m[1])]);return reply(res,200,{ok:true})}
 return reply(res,400,{error:'Unknown action'})
})
