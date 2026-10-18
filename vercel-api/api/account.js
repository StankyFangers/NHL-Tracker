'use strict'
const {timingSafeEqual,createHash}=require('node:crypto')
const {db,reply,body,hashPassword,checkPassword,issueSession,session,handler,digest}=require('../lib/auth')
const validName = v => /^[a-z0-9_]{3,24}$/.test(v)
const validEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length<=254
module.exports=handler(async(req,res)=>{
 if(req.method==='GET') {
  const account=await session(req)
  return account?reply(res,200,{account:{username:account.username,role:account.role}}):reply(res,401,{error:'Session expired'})
 }
 if(req.method!=='POST')return reply(res,405,{error:'Method not allowed'})
 const data=body(req),action=data.action
 if(action==='bootstrap_dev') {
  // Explicit, one-time admin bootstrap. Requires a server-held 256-bit secret.
  const configured=String(process.env.NHL_DEV_BOOTSTRAP_SECRET||'')
  const provided=String(data.setupKey||'')
  if(!/^[a-f0-9]{64}$/.test(configured)||!/^[a-f0-9]{64}$/.test(provided))return reply(res,403,{error:'DEV setup unavailable or invalid key'})
  if(!timingSafeEqual(Buffer.from(configured,'hex'),Buffer.from(provided,'hex')))return reply(res,403,{error:'DEV setup unavailable or invalid key'})
  const email=String(data.email||'').trim().toLowerCase(),password=String(data.password||'')
  if(!validEmail(email)||password.length<12||password.length>128)return reply(res,400,{error:'Valid email and a 12–128 character password required'})
  const hash=await hashPassword(password)
  try {
   const result=await db().query('SELECT id,username,role FROM public.nhl_bootstrap_first_dev($1,$2)',[email,hash])
   return reply(res,201,await issueSession(result.rows[0]))
  }catch(e){if(e.code==='P0001'||e.code==='23505')return reply(res,409,{error:'DEV administrator already exists or email is taken'});throw e}
 }
 if(action==='register') {
  if(process.env.NHL_DEV_SIGNUP_ENABLED!=='YES_DEV_ONLY')return reply(res,403,{error:'DEV registration disabled'})
  const username=String(data.username||'').trim().toLowerCase(),email=String(data.email||'').trim().toLowerCase(),password=String(data.password||'')
  if(!validName(username)||!validEmail(email)||password.length<12||password.length>128)return reply(res,400,{error:'Use a 3–24 character username, valid email, and 12–128 character password'})
  const passwordHash=await hashPassword(password)
  try {
   const result=await db().query('INSERT INTO public.nhl_dev_accounts(username,email,password_hash) VALUES($1,$2,$3) RETURNING id,username,role',[username,email,passwordHash])
   return reply(res,201,await issueSession(result.rows[0]))
  }catch(e){if(e.code==='23505')return reply(res,409,{error:'Username or email already registered'});throw e}
 }
 if(action==='login') {
  const login=String(data.login||'').trim().toLowerCase(),password=String(data.password||'')
  if(login.length>254||password.length>128)return reply(res,401,{error:'Invalid credentials'})
  const attempts=await db().query('SELECT attempts FROM public.nhl_auth_limit_login($1)',[digest(login)])
  if(Number(attempts.rows[0]?.attempts||0)>8)return reply(res,429,{error:'Too many login attempts. Try again in 15 minutes.'})
  const result=await db().query('SELECT id,username,role,password_hash FROM public.nhl_dev_accounts WHERE username=$1 OR email=$1 LIMIT 1',[login])
  const a=result.rows[0]
  // Perform a password KDF even for unknown accounts, reducing username enumeration.
  const fallback='scrypt:00000000000000000000000000000000:'+('00'.repeat(64))
  if(!await checkPassword(password,a?.password_hash||fallback)||!a)return reply(res,401,{error:'Invalid credentials'})
  return reply(res,200,await issueSession(a))
 }
 if(action==='rename_self') {
  const current=await session(req)
  if(!current||current.role!=='DEV')return reply(res,403,{error:'Authenticated TEST DEV session required'})
  const username=String(data.username||'').trim().toLowerCase()
  if(username!=='stankyfangerstest'||current.username!=='stankyfangers')return reply(res,403,{error:'This one-time TEST rename is not available for this account'})
  const client=await db().connect()
  try {
   await client.query('BEGIN')
   const result=await client.query('UPDATE public.nhl_dev_accounts SET username=$1 WHERE id=$2 AND username=$3 RETURNING id,username,role',[username,current.id,'stankyfangers'])
   if(!result.rowCount){await client.query('ROLLBACK');return reply(res,409,{error:'TEST account changed; please log in again'})}
   await client.query('COMMIT')
   return reply(res,200,{account:{username:result.rows[0].username,role:result.rows[0].role}})
  }catch(e){await client.query('ROLLBACK').catch(()=>{});if(e.code==='23505')return reply(res,409,{error:'TEST username already exists'});throw e}finally{client.release()}
 }
 if(action==='logout') {
  const match=/^Bearer ([A-Za-z0-9_-]{40,100})$/.exec(String(req.headers.authorization||''))
  if(match)await db().query('DELETE FROM public.nhl_dev_sessions WHERE token_hash=$1',[digest(match[1])])
  return reply(res,200,{ok:true})
 }
 return reply(res,400,{error:'Unknown action'})
})
