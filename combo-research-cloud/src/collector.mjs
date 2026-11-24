// Server-side research collection. Shares Daily Faceoff parsing conventions with the Telegram Worker,
// but uses its own database and never sends research records to personal accounts.
const TEAM_SLUGS={ANA:'anaheim-ducks',BOS:'boston-bruins',BUF:'buffalo-sabres',CAR:'carolina-hurricanes',CBJ:'columbus-blue-jackets',CGY:'calgary-flames',CHI:'chicago-blackhawks',COL:'colorado-avalanche',DAL:'dallas-stars',DET:'detroit-red-wings',EDM:'edmonton-oilers',FLA:'florida-panthers',LAK:'los-angeles-kings',MIN:'minnesota-wild',MTL:'montreal-canadiens',NJD:'new-jersey-devils',NSH:'nashville-predators',NYI:'new-york-islanders',NYR:'new-york-rangers',OTT:'ottawa-senators',PHI:'philadelphia-flyers',PIT:'pittsburgh-penguins',SEA:'seattle-kraken',SJS:'san-jose-sharks',STL:'st-louis-blues',TBL:'tampa-bay-lightning',TOR:'toronto-maple-leafs',UTA:'utah-mammoth',VAN:'vancouver-canucks',VGK:'vegas-golden-knights',WPG:'winnipeg-jets',WSH:'washington-capitals'}
const clean=s=>String(s||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/&#39;|&#x27;/g,"'").replace(/\s+/g,' ').trim()
const nameKey=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/gi,'').toLowerCase()
const etDate=d=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d).filter(x=>['year','month','day'].includes(x.type)).map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day}
function sectionHtml(html,start,end){
 const a=html.search(new RegExp(start,'i'))
 if(a<0)return ''
 const body=html.slice(a),b=body.search(new RegExp(end,'i'))
 return b>0?body.slice(0,b):body
}
const namesIn=html=>[...html.matchAll(/<a[^>]+href=["'][^"']*\/players\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m=>clean(m[1])).filter(Boolean)
export function parseResearchLineup(html){
 const f=namesIn(sectionHtml(html,'>Forwards<|Forwards','Defensive Pairings')).slice(0,12)
 const pp1=namesIn(sectionHtml(html,'1st Powerplay Unit|1st Power Play Unit','2nd Powerplay Unit|2nd Power Play Unit')).slice(0,5)
 const pp2=namesIn(sectionHtml(html,'2nd Powerplay Unit|2nd Power Play Unit','1st Penalty Kill Unit')).slice(0,5)
 if(f.length!==12||pp1.length!==5||pp2.length!==5)return null
 const source=(html.match(/Source:[\s\S]{0,500}?<a[^>]+href=["'][^"']+["'][^>]*>([\s\S]*?)<\/a>/i)||[])[1]
 const updated=clean(html).match(/Last updated:\s*(.+?)\s+Source:/i)?.[1]
 const projection=!source||/^(?:DFO\s*Projections?|Last\s*Game)(?:\b|\s*\()/i.test(clean(source))
 return {forwardLines:[f.slice(0,3),f.slice(3,6),f.slice(6,9),f.slice(9,12)],pp1,pp2,lineupStatus:projection?'PROJECTED':'CONFIRMED',lineupUpdatedAt:updated||''}
}
export function combosFromLineup(lineup){
 if(!lineup)return[]
 const out=[]
 for(let index=0;index<lineup.forwardLines.length;index++){
  const forward=lineup.forwardLines[index],line=index+1
  for(const [unit,members] of [[1,lineup.pp1],[2,lineup.pp2]]){
   const set=new Set(members.map(nameKey)),qualified=forward.filter(p=>set.has(nameKey(p)))
   const unique=new Set(qualified.map(nameKey))
   if(qualified.length<2||unique.size!==qualified.length)continue
   for(let i=0;i<qualified.length;i++)for(let j=i+1;j<qualified.length;j++)out.push({forwardLine:line,ppUnit:unit,players:[qualified[i],qualified[j]]})
   if(qualified.length===3)out.push({forwardLine:line,ppUnit:unit,players:qualified})
  }
 }
 return out
}
async function textAt(url){const r=await fetch(url,{headers:{'User-Agent':'NHL-Tracker-Research/0.1'},signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('HTTP '+r.status);return r.text()}
async function schedule(env,day,now){
 const saved=await env.DB.prepare('SELECT payload,updated_ms FROM research_schedule_cache WHERE game_date=?').bind(day).first()
 if(saved&&now-Number(saved.updated_ms)<15*60000)return JSON.parse(saved.payload)
 const info=JSON.parse(await textAt('https://api-web.nhle.com/v1/score/'+day))
 const games=(info.games||[]).map(g=>({gameId:String(g.id),date:etDate(new Date(g.startTimeUTC)),start:Date.parse(g.startTimeUTC),away:String(g.awayTeam?.abbrev||''),home:String(g.homeTeam?.abbrev||'')})).filter(g=>Number.isFinite(g.start)&&TEAM_SLUGS[g.away]&&TEAM_SLUGS[g.home])
 await env.DB.prepare('INSERT INTO research_schedule_cache(game_date,payload,updated_ms) VALUES(?,?,?) ON CONFLICT(game_date) DO UPDATE SET payload=excluded.payload,updated_ms=excluded.updated_ms').bind(day,JSON.stringify(games),now).run()
 return games
}
async function captureTeam(env,game,team,opponent,now){
 const state=await env.DB.prepare('SELECT checked_ms FROM research_capture_state WHERE game_id=? AND team=?').bind(game.gameId,team).first()
 const gap=game.start-now<=5*60000?55000:4*60000
 if(state&&now-Number(state.checked_ms)<gap)return {captured:0,skipped:1}
 try{
  const html=await textAt('https://www.dailyfaceoff.com/teams/'+TEAM_SLUGS[team]+'/line-combinations')
  const lineup=parseResearchLineup(html),combos=combosFromLineup(lineup)
  if(!lineup)throw Error('Daily Faceoff lineup incomplete; keeping prior validated snapshot')
  const iso=new Date(now).toISOString(),existing=await env.DB.prepare("SELECT COUNT(*) AS n FROM research_combos WHERE game_id=? AND team=? AND source='DAILY_FACEOFF_COLLECTOR'").bind(game.gameId,team).first()
  const statements=[env.DB.prepare("DELETE FROM research_combos WHERE game_id=? AND team=? AND result='UNVERIFIED' AND source='DAILY_FACEOFF_COLLECTOR'").bind(game.gameId,team)]
  for(const combo of combos){
   const id=[game.date,game.gameId,team,...combo.players.map(nameKey).sort()].join(':')
   statements.push(env.DB.prepare(`INSERT OR IGNORE INTO research_combos
    (id,game_date,game_id,team,opponent,matchup,players_json,forward_line,pp_unit,result,venue,snapshot_at,source,lineup_status)
    VALUES (?,?,?,?,?,?,?,?,?,'UNVERIFIED',?,?,?,?)`).bind(id,game.date,game.gameId,team,opponent,game.away+' @ '+game.home,JSON.stringify(combo.players),combo.forwardLine,combo.ppUnit,team===game.home?'HOME':'AWAY',iso,'DAILY_FACEOFF_COLLECTOR',lineup.lineupStatus))
  }
  statements.push(env.DB.prepare(`INSERT INTO research_capture_state(game_id,game_date,team,checked_ms,captured_at,capture_status,lineup_status,combo_count,error)
   VALUES (?,?,?,?,?,?,?,?,'') ON CONFLICT(game_id,team) DO UPDATE SET checked_ms=excluded.checked_ms,captured_at=excluded.captured_at,capture_status=excluded.capture_status,lineup_status=excluded.lineup_status,combo_count=excluded.combo_count,error=''`).bind(game.gameId,game.date,team,now,iso,'CAPTURED',lineup.lineupStatus,combos.length))
  await env.DB.batch(statements)
  return {captured:combos.length,skipped:0,replaced:Number(existing?.n||0)}
 }catch(err){
  const error=String(err).slice(0,350)
  await env.DB.prepare(`INSERT INTO research_capture_state(game_id,game_date,team,checked_ms,capture_status,error) VALUES (?,?,?,?,?,?) ON CONFLICT(game_id,team) DO UPDATE SET checked_ms=excluded.checked_ms,capture_status=excluded.capture_status,error=excluded.error`).bind(game.gameId,game.date,team,now,'FAILED',error).run().catch(()=>{})
  console.warn('Research lineup capture failed',game.gameId,team,error)
  return {captured:0,skipped:0,error}
 }
}
export async function collectPregame(env,now=Date.now()){
 const dates=[etDate(new Date(now)),etDate(new Date(now+4*3600000))]
 const all=[]
 for(const d of new Set(dates))try{all.push(...await schedule(env,d,now))}catch(e){console.error('Research schedule unavailable',d,String(e))}
 const games=[...new Map(all.map(g=>[g.gameId,g])).values()].filter(g=>g.start>=now&&g.start-now<=15*60000).sort((a,b)=>a.start-b.start)
 let captured=0,attempted=0
 for(const g of games){for(const [team,opponent] of [[g.away,g.home],[g.home,g.away]]){
  const r=await captureTeam(env,g,team,opponent,now)
  if(!r.skipped){attempted++;captured+=r.captured}
 }}
 return {games:games.length,attempted,captured}
}
