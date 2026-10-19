'use strict'
// Read-only production connection probe. Never creates accounts, sessions, or wagers.
// Returns no connection details, credentials, role names, or database records.
const {Pool}=require('pg')
const {reply}=require('../lib/security')
const {getLivePool}=require('../lib/live-db')
module.exports=async(req,res)=>{
 if(req.method!=='GET')return reply(res,405,{error:'Method not allowed'})
 if(process.env.NHL_LIVE_CLOUD_ENABLED!=='YES_PRODUCTION_APPROVED')return reply(res,200,{liveConnection:'activation-disabled',writesEnabled:false})
 try {
  const pool=getLivePool()
  const client=await pool.connect()
  try {
   await client.query('BEGIN READ ONLY')
   try {
    const r=await client.query("SELECT current_user = 'nhl_tracker_live_restricted' AS role_ok, current_database() = 'neondb' AS database_ok, has_table_privilege(current_user,'public.nhl_live_wagers','INSERT') AS can_write")
    await client.query('COMMIT')
    const row=r.rows[0]
    if(!row?.role_ok||!row?.database_ok||row?.can_write)return reply(res,503,{liveConnection:'not-ready',writesEnabled:false})
    return reply(res,200,{liveConnection:'ready',writesEnabled:false})
   }catch(e){try{await client.query('ROLLBACK')}catch{}throw e}
  }finally{client.release()}
 }catch(e){console.error('LIVE connection preflight failed:',e.code||e.name);return reply(res,503,{liveConnection:'not-ready',writesEnabled:false})}
}
