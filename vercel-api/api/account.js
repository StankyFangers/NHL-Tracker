'use strict'
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
  const result=await db().query('SELECT id,username,role,password_hash FROM public.nhl_dev_accounts WHERE username=$1 OR email=$1 LIMIT 1',[login])
  const a=result.rows[0]
  // Perform a password KDF even for unknown accounts, reducing username enumeration.
  const fallback='scrypt:00000000000000000000000000000000:'+('00'.repeat(64))
  if(!await checkPassword(password,a?.password_hash||fallback)||!a)return reply(res,401,{error:'Invalid credentials'})
  return reply(res,200,await issueSession(a))
 }
 if(action==='logout') {
  const match=/^Bearer ([A-Za-z0-9_-]{40,100})$/.exec(String(req.headers.authorization||''))
  if(match)await db().query('DELETE FROM public.nhl_dev_sessions WHERE token_hash=$1',[digest(match[1])])
  return reply(res,200,{ok:true})
 }
 return reply(res,400,{error:'Unknown action'})
})
