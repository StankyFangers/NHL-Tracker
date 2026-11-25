'use strict'
const {handler,session,getLivePool,reply}=require('../lib/live-auth')
module.exports=handler(async(req,res)=>{
 const user=await session(req)
 if(!user)return reply(res,401,{error:'Sign in to LIVE to use chat'})
 res.setHeader('Cache-Control','private, no-store')
 const pool=getLivePool()
 if(req.method==='GET'){
  if(req.query.head==='1'){
   const result=await pool.query('SELECT max(id) AS latest FROM public.nhl_live_chat WHERE username<>$1',[user.username])
   return reply(res,200,result.rows[0])
  }
  const after=String(req.query.after||'0')
  if(!/^\d{1,18}$/.test(after))return reply(res,400,{error:'Invalid message cursor'})
  const result=await pool.query('SELECT id,username,body,created_at FROM public.nhl_live_chat WHERE id>$1 ORDER BY id LIMIT 1000',[after])
  return reply(res,200,{messages:result.rows})
 }
 if(req.method!=='POST')return reply(res,405,{error:'Method not allowed'})
 const {body,nonce}=req.body||{}
 if(typeof body!=='string'||!body.trim()||body.length>2000||typeof nonce!=='string'||!/^\w{8}-(?:\w{4}-){3}\w{12}$/.test(nonce))return reply(res,400,{error:'Invalid chat message'})
 const client=await pool.connect()
 try{
  await client.query('BEGIN')
  await client.query('SELECT pg_advisory_xact_lock(7132026)')
  await client.query('INSERT INTO public.nhl_live_chat(username,body,nonce) VALUES($1,$2,$3) ON CONFLICT(username,nonce) DO NOTHING',[user.username,body.trim(),nonce])
  await client.query('DELETE FROM public.nhl_live_chat WHERE id <= (SELECT id FROM public.nhl_live_chat ORDER BY id DESC OFFSET 1000 LIMIT 1)')
  await client.query('COMMIT')
 }catch(err){await client.query('ROLLBACK');throw err}
 finally{client.release()}
 return reply(res,200,{sent:true})
})
