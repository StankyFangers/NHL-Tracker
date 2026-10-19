'use strict'
// Shared LIVE player index. This endpoint cannot modify wagers.
const {handler,session,getLivePool,reply}=require('../lib/live-auth')
const validId=x=>Number.isSafeInteger(Number(x))&&Number(x)>0
const teams=new Set('ANA BOS BUF CAR CBJ CGY CHI COL DAL DET EDM FLA LAK MIN MTL NJD NSH NYI NYR OTT PHI PIT SEA SJS STL TBL TOR UTA VAN VGK WPG WSH'.split(' '))
module.exports=handler(async(req,res)=>{
 const actor=await session(req)
 if(!actor)return reply(res,401,{error:'LIVE login required'})
 const pool=getLivePool()
 if(req.method==='GET'){
  const r=await pool.query('SELECT player_id AS id,full_name AS name,team_abbrev AS team FROM public.nhl_live_players ORDER BY full_name,player_id LIMIT 10000')
  return reply(res,200,{players:r.rows,environment:'live'})
 }
 if(req.method!=='POST')return reply(res,405,{error:'Method not allowed'})
 if(actor.role!=='DEV')return reply(res,403,{error:'DEV role required'})
 if(process.env.NHL_LIVE_PLAYER_WRITES_ENABLED!=='YES_LIVE_PLAYER_WRITES_APPROVED')return reply(res,403,{error:'LIVE player updates not activated'})
 const body=req.body||{}
 if(typeof body!=='object'||Array.isArray(body)||Buffer.byteLength(JSON.stringify(body))>1000)return reply(res,400,{error:'Invalid player data'})
 const id=Number(body.id),name=String(body.name||'').trim(),team=String(body.team||'').toUpperCase()
 if(!validId(id)||!teams.has(team)||name.length<3||name.length>120||!/^[-\p{L}\p{M}.' ]+$/u.test(name))return reply(res,400,{error:'Invalid player ID, name or team'})
 // Validate NHL player ID, name AND current team against the official player profile.
 // Current roster lists can omit prospects, so use the player landing endpoint.
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9000)
 let profile
 try{
  const response=await fetch(`https://api-web.nhle.com/v1/player/${id}/landing`,{signal:controller.signal,headers:{Accept:'application/json'}})
  if(!response.ok)throw new Error('NHL player profile unavailable')
  profile=await response.json()
 }catch{return reply(res,503,{error:'NHL player profile unavailable; retry later'})}
 finally{clearTimeout(timer)}
 const norm=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'')
 const label=v=>typeof v==='string'?v:String(v?.default||'')
 const officialName=[label(profile?.firstName),label(profile?.lastName)].filter(Boolean).join(' ')
 if(Number(profile?.playerId)!==id||!officialName||norm(officialName)!==norm(name))
  return reply(res,422,{error:'Player ID and name do not match NHL profile'})
 const officialTeam=String(profile?.currentTeamAbbrev||'').toUpperCase()
 if(!teams.has(officialTeam))
  return reply(res,422,{error:'NHL profile has no verified current team; manual review required'})
 if(officialTeam!==team)
  return reply(res,422,{error:`Team mismatch: NHL lists ${officialName} with ${officialTeam}, not ${team}. Select ${officialTeam} and retry.`})
 const existing=await pool.query('SELECT full_name,team_abbrev FROM public.nhl_live_players WHERE player_id=$1',[id])
 if(existing.rows.length&&existing.rows[0].full_name!==name)return reply(res,409,{error:'Existing player ID has a different name; manual review required'})
 const result=await pool.query(`INSERT INTO public.nhl_live_players(player_id,full_name,team_abbrev,updated_by) VALUES($1,$2,$3,$4)
 ON CONFLICT(player_id) DO UPDATE SET team_abbrev=EXCLUDED.team_abbrev,updated_by=EXCLUDED.updated_by,updated_at=now()
 RETURNING player_id AS id,full_name AS name,team_abbrev AS team`,[id,name,team,actor.id])
 return reply(res,200,{player:result.rows[0],saved:true})
})
