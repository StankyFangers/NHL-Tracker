'use strict'
// DEV-only account-scoped bet snapshots. Never reads or writes legacy LIVE tables.
const {db,session,reply,handler} = require('../lib/auth')
const MAX_BETS=12000, MAX_BYTES=6*1024*1024
module.exports=handler(async(req,res)=>{
 const account=await session(req)
 if(!account||account.role!=='DEV')return reply(res,403,{error:'DEV administrator session required'})
 if(!['GET','PUT','DELETE'].includes(req.method))return reply(res,405,{error:'Method not allowed'})
 const pool=db()
 if(req.method==='GET'){
  const r=await pool.query('SELECT bets,revision FROM public.nhl_dev_bet_snapshots WHERE account_id=$1',[account.id])
  return reply(res,200,{bets:r.rows[0]?.bets||[],revision:Number(r.rows[0]?.revision||0)})
 }
 if(req.method==='DELETE'){
  if(req.headers['x-dev-confirm']!=='CLEAR DEV')return reply(res,400,{error:'Type CLEAR DEV to confirm'})
  // DELETE is scoped by authenticated session account id, never client-supplied ids.
  const client=await pool.connect()
  try {
   await client.query('BEGIN')
   await client.query('SELECT id FROM public.nhl_dev_accounts WHERE id=$1 FOR UPDATE',[account.id])
   const r=await client.query('DELETE FROM public.nhl_dev_bet_snapshots WHERE account_id=$1 RETURNING account_id',[account.id])
   await client.query('COMMIT')
   return reply(res,200,{ok:true,cleared:r.rowCount>0})
  }catch(e){
   await client.query('ROLLBACK').catch(()=>{})
   throw e
  }finally{
   client.release()
  }
 }
 const bytes=Buffer.byteLength(JSON.stringify(req.body||{}))
 if(bytes>MAX_BYTES)return reply(res,413,{error:'Profile exceeds 6MB limit'})
 const {bets,revision}=req.body||{}
 if(!Array.isArray(bets)||bets.length>MAX_BETS||!Number.isSafeInteger(revision)||revision<0)return reply(res,400,{error:'Invalid bet snapshot'})
 const ids=new Set()
 for(const b of bets){
  if(!b||typeof b!=='object'||Array.isArray(b)||typeof b.id!=='string'||b.id.length>150||ids.has(b.id)||typeof b.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(b.date)||!Array.isArray(b.legs)||b.legs.length>12)return reply(res,400,{error:'Invalid or duplicate bet'})
  ids.add(b.id)
 }
 const client=await pool.connect()
 try{
  await client.query('BEGIN')
  // Serialize concurrent updates for this specific account.
  await client.query('SELECT id FROM public.nhl_dev_accounts WHERE id=$1 FOR UPDATE',[account.id])
  const current=await client.query('SELECT revision FROM public.nhl_dev_bet_snapshots WHERE account_id=$1',[account.id])
  const actual=Number(current.rows[0]?.revision||0)
  if(actual!==revision){await client.query('ROLLBACK');return reply(res,409,{error:'DEV data changed on server; reload before saving',revision:actual})}
  await client.query(`INSERT INTO public.nhl_dev_bet_snapshots(account_id,bets,revision,updated_at) VALUES($1,$2::jsonb,$3,now()) ON CONFLICT(account_id) DO UPDATE SET bets=excluded.bets,revision=excluded.revision,updated_at=now()`,[account.id,JSON.stringify(bets),revision+1])
  await client.query('COMMIT')
  return reply(res,200,{ok:true,revision:revision+1,count:bets.length})
 }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}finally{client.release()}
})
