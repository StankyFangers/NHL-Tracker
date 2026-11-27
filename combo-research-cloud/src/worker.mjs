import {collectPregame} from './collector.mjs'
// Shared Combo Research service: intentionally separate from private wager and Telegram databases.
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*'}})
const allowed=(req,env)=>Boolean(env.RESEARCH_INGEST_TOKEN)&&req.headers.get('Authorization')==='Bearer '+env.RESEARCH_INGEST_TOKEN
const nameKey=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/gi,'').toLowerCase()
const dateOK=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''))
function normalized(raw){
 if(!raw||typeof raw!=='object')return null
 const date=raw.date||raw.game_date,team=String(raw.team||'').toUpperCase()
 const players=Array.isArray(raw.players)?raw.players.filter(x=>typeof x==='string'&&x.trim()):[]
 const gameId=String(raw.gameId||raw.game_id||'')
 if(!dateOK(date)||!/^([A-Z]{2,3})$/.test(team)||!gameId||players.length<2||players.length>3)return null
 const numeric=v=>v===undefined||v===null||v===''?null:Number.isFinite(Number(v))?Number(v):null
 const odds=numeric(raw.odds),pp=numeric(raw.ppUnit),fl=numeric(raw.forwardLine)
 const ids=Array.isArray(raw.playerIds)&&raw.playerIds.length===players.length&&raw.playerIds.every(x=>Number.isInteger(Number(x))&&Number(x)>0)?raw.playerIds.map(Number):null
 const id=String(raw.id||[date,gameId,team,...players.map(nameKey).sort()].join(':'))
 const context=raw.context&&typeof raw.context==='object'?Object.fromEntries(['goalsForPerGame','powerPlayPct','opponentGoalsAllowedPerGame','opponentXGAllowedPerGame','opponentPKPct','restDays','opponentRestDays','backToBack'].map(key=>[key,key==='backToBack'?raw.context[key]===true:Number.isFinite(Number(raw.context[key]))?Number(raw.context[key]):null])):{}
 const result=['HIT','MISS','UNVERIFIED'].includes(String(raw.result))?String(raw.result):'UNVERIFIED'
 return {id,date,gameId,team,result,context,opponent:String(raw.opponent||''),matchup:String(raw.matchup||''),players,playerIds:ids,forwardLine:fl,ppUnit:pp,odds:odds!==null&&Math.abs(odds)>=100?odds:null,venue:raw.venue==='HOME'||raw.venue==='AWAY'?raw.venue:null,goalieGaa:numeric(raw.goalieGaa),goalieDifferential:numeric(raw.goalieDifferential),snapshotAt:String(raw.snapshotAt||''),source:String(raw.source||'import').slice(0,80)}
}
async function list(req,env){
 const u=new URL(req.url),limit=Math.min(10000,Math.max(1,Number(u.searchParams.get('limit'))||1000))
 const after=u.searchParams.get('after')||'',start=u.searchParams.get('start')||'0000-01-01',end=u.searchParams.get('end')||'9999-12-31'
 const result=await env.DB.prepare('SELECT * FROM research_combos WHERE game_date >= ? AND game_date <= ? AND id > ? ORDER BY id LIMIT ?').bind(start,end,after,limit).all()
 const combos=(result.results||[]).map(r=>({id:r.id,date:r.game_date,gameId:r.game_id,team:r.team,opponent:r.opponent,matchup:r.matchup,players:JSON.parse(r.players_json),playerIds:r.player_ids_json?JSON.parse(r.player_ids_json):null,forwardLine:r.forward_line,ppUnit:r.pp_unit,odds:r.odds,result:r.result,venue:r.venue,goalieGaa:r.goalie_gaa,goalieDifferential:r.goalie_differential,snapshotAt:r.snapshot_at,source:r.source,context:r.context_json?JSON.parse(r.context_json):{}}))
 return json({combos,nextCursor:combos.length===limit?combos.at(-1).id:null})
}
async function importRows(req,env){
 if(!allowed(req,env))return json({error:'Unauthorized'},401)
 const body=await req.json().catch(()=>null),raw=Array.isArray(body)?body:Array.isArray(body?.combos)?body.combos:null
 if(!raw||raw.length>500)return json({error:'Expected combos array with 1–500 items'},400)
 let accepted=0,rejected=0
 for(const input of raw){
  const r=normalized(input);if(!r){rejected++;continue}
  // Existing snapshots are immutable here: importer cannot silently rewrite pregame odds or lineup conditions.
  await env.DB.prepare(`INSERT OR IGNORE INTO research_combos
  (id,game_date,game_id,team,opponent,matchup,players_json,player_ids_json,forward_line,pp_unit,odds,venue,goalie_gaa,goalie_differential,snapshot_at,source,result,context_json)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(r.id,r.date,r.gameId,r.team,r.opponent,r.matchup,JSON.stringify(r.players),r.playerIds?JSON.stringify(r.playerIds):null,r.forwardLine,r.ppUnit,r.odds,r.venue,r.goalieGaa,r.goalieDifferential,r.snapshotAt,r.source,r.result,JSON.stringify(r.context)).run()
  accepted++
 }
 return json({accepted,rejected,duplicatesPossible:true})
}
export function finalPoints(box,roster){
 const teams=new Map()
 for(const side of ['homeTeam','awayTeam']){
  const team=box[side]
  if(!team?.abbrev || !team.id)continue
  const points=new Map(),names=new Map()
  for(const group of ['forwards','defense']){
   for(const skater of box.playerByGameStats?.[side]?.[group]||[]){
    if(Number.isInteger(skater.points) && skater.points>=0)points.set(skater.playerId,skater.points)
   }
  }
  for(const player of roster){
   if(player.teamId!==team.id || !player.firstName?.default || !player.lastName?.default)continue
   const key=nameKey(player.firstName.default+' '+player.lastName.default)
   if(!names.has(key))names.set(key,new Set())
   names.get(key).add(player.playerId)
  }
  teams.set(team.abbrev,{points,names})
 }
 return (team,name,id)=>{
  const stats=teams.get(team)
  if(!stats)return null
  const matches=stats.names.get(nameKey(name))
  // DFO lists Gabriel while NHL rosters use Gabe for player 8484210.
  const alias=nameKey(name)==='gabrielperreault' && stats.names.get('gabeperreault')?.has(8484210)?8484210:null
  const playerId=id?Number(id):matches?.size===1?[...matches][0]:matches?null:alias
  return stats.points.get(playerId)??null
 }
}
async function gradePending(env){
 const now=Date.now()
 const pending=await env.DB.prepare("SELECT DISTINCT c.game_id FROM research_combos c LEFT JOIN research_grade_attempts a ON a.game_id=c.game_id WHERE c.result='UNVERIFIED' AND c.game_date <= ? AND c.game_id <> '' AND c.game_id NOT GLOB '*[^0-9]*' AND (a.game_id IS NULL OR a.checked_ms < ? OR (a.attempts < 12 AND a.checked_ms < ?)) ORDER BY COALESCE(a.checked_ms,0),c.game_id LIMIT 3").bind(new Date(now).toISOString().slice(0,10),now-24*3600000,now-4*3600000).all()
 let checked=0,graded=0
 for(const row of pending.results||[]){
  if(!/^\d+$/.test(row.game_id))continue
  try{
   await env.DB.prepare("INSERT INTO research_grade_attempts(game_id,checked_ms,attempts,last_status) VALUES(?,?,1,'CHECKING') ON CONFLICT(game_id) DO UPDATE SET checked_ms=excluded.checked_ms,attempts=research_grade_attempts.attempts+1,last_status='CHECKING'").bind(row.game_id,now).run()
   const response=await fetch('https://api-web.nhle.com/v1/gamecenter/'+row.game_id+'/boxscore',{signal:AbortSignal.timeout(12000)})
   if(!response.ok)continue
   const box=await response.json()
   if(!['FINAL','OFF'].includes(String(box.gameState)))continue
   const rosterResponse=await fetch('https://api-web.nhle.com/v1/gamecenter/'+row.game_id+'/play-by-play',{signal:AbortSignal.timeout(12000)})
   const roster=rosterResponse.ok?await rosterResponse.json():null
   const points=finalPoints(box,roster?.rosterSpots||[])
   const entries=await env.DB.prepare("SELECT id,team,players_json,player_ids_json FROM research_combos WHERE game_id=? AND result='UNVERIFIED'").bind(row.game_id).all()
   const updates=[]
   for(const combo of entries.results||[]){
    const players=JSON.parse(combo.players_json),ids=combo.player_ids_json?JSON.parse(combo.player_ids_json):null
    const values=players.map((name,i)=>points(combo.team,name,ids?.[i]))
    // Ambiguous/missing players remain UNVERIFIED; never turn data gaps into misses.
    if(values.some(x=>x===null||x===undefined))continue
    updates.push(env.DB.prepare("UPDATE research_combos SET result=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND result='UNVERIFIED'").bind(values.every(x=>x>=1)?'HIT':'MISS',combo.id))
   }
   if(updates.length){await env.DB.batch(updates);graded+=updates.length}
   checked++
  }catch(e){console.error('Research grade error',row.game_id,String(e))}
 }
 await env.DB.prepare('INSERT INTO research_checks(kind,games_checked,combos_graded) VALUES(?,?,?)').bind('NHL_BOX_SCORE',checked,graded).run()
 return {checked,graded}
}
export default {
 async fetch(req,env,ctx){
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'authorization,content-type'}})
  const p=new URL(req.url).pathname
  try{
   if(p==='/health')return json({ok:true,service:'nhl-combo-research',database:!!env.DB})
   if(p==='/research/combos'&&req.method==='GET')return list(req,env)
   if(p==='/research/combos'&&req.method==='POST')return importRows(req,env)
   if(p==='/research/collect'&&req.method==='POST'){if(!allowed(req,env))return json({error:'Unauthorized'},401);return json(await collectPregame(env))}
   if(p==='/research/grade'&&req.method==='POST'){if(!allowed(req,env))return json({error:'Unauthorized'},401);return json(await gradePending(env))}
   if(p==='/research/status'&&req.method==='GET'){
    const counts=await env.DB.prepare("SELECT COUNT(*) total,SUM(CASE WHEN result!='UNVERIFIED' THEN 1 ELSE 0 END) graded,COUNT(DISTINCT game_id) games FROM research_combos").first()
    const check=await env.DB.prepare('SELECT * FROM research_checks ORDER BY id DESC LIMIT 1').first()
    const captures=await env.DB.prepare('SELECT game_date,team,capture_status,lineup_status,combo_count,captured_at,error FROM research_capture_state ORDER BY checked_ms DESC LIMIT 60').all()
    return json({counts,check,captures:captures.results||[]})
   }
   return json({error:'Not Found'},404)
  }catch(e){console.error('Research API error',String(e));return json({error:'Research service failure'},500)}
 },
 async scheduled(_event,env,ctx){
  ctx.waitUntil((async()=>{
   try{await collectPregame(env)}catch(e){console.error('Research capture failed',String(e))}
   // Restrict NHL boxscore grading to occasional ticks to avoid repeated API calls.
   if(new Date().getUTCMinutes()%15===0)try{await gradePending(env)}catch(e){console.error('Research grading failed',String(e))}
  })())
 }
}
