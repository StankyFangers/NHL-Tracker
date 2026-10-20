'use strict'
// Phase 2C: account-scoped, per-wager API. No renderer integration or automatic import.
const {getLivePool,reply,session,handler}=require('../lib/live-auth')
const MAX_BYTES=256*1024
const validId=id=>typeof id==='string'&&id.length>=1&&id.length<=150
const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d
const validWager=w=>w&&typeof w==='object'&&!Array.isArray(w)&&validId(w.id)&&validDate(w.date)&&Array.isArray(w.legs)&&w.legs.length>0&&w.legs.length<=12
module.exports=handler(async(req,res)=>{
 const account=await session(req)
 if(!account)return reply(res,401,{error:'LIVE session required'})
 if(!['GET','POST','PATCH','DELETE'].includes(req.method))return reply(res,405,{error:'Method not allowed'})
 // Phase 2K: LIVE authentication does NOT activate cloud wager mutations.
 // A separate explicit production approval is required for POST/PATCH/DELETE.
 if(req.method!=='GET' && process.env.NHL_LIVE_WAGER_WRITES_ENABLED!=='YES_WAGER_WRITES_SEPARATELY_APPROVED')return reply(res,403,{error:'LIVE cloud wager writes are disabled'})
 const pool=getLivePool()
 if(req.method==='GET'){
  const rawLimit=req.query?.limit
  if(rawLimit!==undefined&&(!/^\d+$/.test(String(rawLimit))||Number(rawLimit)<1||Number(rawLimit)>200))return reply(res,400,{error:'Invalid page limit'})
  const limit=rawLimit===undefined?100:Number(rawLimit)
  const rawCursor=req.query?.cursor
  if(rawCursor!==undefined&&(typeof rawCursor!=='string'||rawCursor.length>150))return reply(res,400,{error:'Invalid cursor'})
  const cursor=rawCursor||''
  const r=await pool.query('SELECT wager_id,wager,source,source_external_id,updated_at FROM public.nhl_live_wagers WHERE account_id=$1 AND ($2::text=\'\' OR wager_id>$2) ORDER BY wager_id LIMIT $3',[account.id,cursor,limit+1])
  const more=r.rows.length>limit,rows=r.rows.slice(0,limit)
  return reply(res,200,{wagers:rows,nextCursor:more?rows[rows.length-1].wager_id:null})
 }
 if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||Buffer.byteLength(JSON.stringify(req.body))>MAX_BYTES)return reply(res,413,{error:'Invalid or oversized request'})
 // Mutations require the exact previously-read updatedAt value; concurrent edits
 // cannot overwrite each other. An ID cannot be reassigned to another wager.
 if(req.method==='PATCH'||req.method==='DELETE'){
  const {id,expectedUpdatedAt}=req.body
  if(!validId(id)||typeof expectedUpdatedAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(expectedUpdatedAt)||!Number.isFinite(Date.parse(expectedUpdatedAt)))return reply(res,400,{error:'id and expectedUpdatedAt required'})
  if(req.method==='PATCH'){
   const {wager}=req.body
   if(!validWager(wager)||wager.id!==id)return reply(res,400,{error:'Invalid wager or wager ID changed'})
   const r=await pool.query(`UPDATE public.nhl_live_wagers SET wager=$3::jsonb,updated_at=GREATEST(date_trunc('milliseconds',clock_timestamp())+interval '1 millisecond',date_trunc('milliseconds',updated_at)+interval '1 millisecond') WHERE account_id=$1 AND wager_id=$2 AND updated_at >= date_trunc('milliseconds',$4::timestamptz) AND updated_at < date_trunc('milliseconds',$4::timestamptz)+interval '1 millisecond' RETURNING wager_id,updated_at`,[account.id,id,JSON.stringify(wager),expectedUpdatedAt])
   if(r.rowCount)return reply(res,200,{ok:true,id,updatedAt:r.rows[0].updated_at})
  }else{
   const r=await pool.query(`DELETE FROM public.nhl_live_wagers WHERE account_id=$1 AND wager_id=$2 AND updated_at >= date_trunc('milliseconds',$3::timestamptz) AND updated_at < date_trunc('milliseconds',$3::timestamptz)+interval '1 millisecond' RETURNING wager_id,updated_at`,[account.id,id,expectedUpdatedAt])
   if(r.rowCount)return reply(res,200,{ok:true,id,deleted:true})
  }
  const found=await pool.query('SELECT 1 FROM public.nhl_live_wagers WHERE account_id=$1 AND wager_id=$2',[account.id,id])
  return reply(res,found.rowCount?409:404,{error:found.rowCount?'Wager changed since last read; refresh and retry':'Wager not found'})
 }
 const {wager,source='manual',sourceExternalId=null}=req.body
 if(!validWager(wager)||!['manual','kalshi','import'].includes(source)||!(sourceExternalId===null||(typeof sourceExternalId==='string'&&sourceExternalId.length>0&&sourceExternalId.length<=250)))return reply(res,400,{error:'Invalid wager'})
 // Create-only. An existing wager is never silently overwritten, including across devices.
 try{
  const r=await pool.query('INSERT INTO public.nhl_live_wagers(account_id,wager_id,wager,source,source_external_id) VALUES($1,$2,$3::jsonb,$4,$5) ON CONFLICT DO NOTHING RETURNING wager_id,updated_at',[account.id,wager.id,JSON.stringify(wager),source,sourceExternalId])
  if(r.rowCount===1)return reply(res,201,{ok:true,id:wager.id,created:true,updatedAt:r.rows[0].updated_at})
  return reply(res,409,{error:'Wager ID or external source identity already exists; no changes made'})
 }catch(e){if(e.code==='23505')return reply(res,409,{error:'Duplicate wager; no changes made'});throw e}
})
