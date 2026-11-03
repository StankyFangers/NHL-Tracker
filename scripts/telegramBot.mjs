import {setTimeout as sleep} from 'node:timers/promises'
const TEAM={ANA:'anaheim-ducks',BOS:'boston-bruins',BUF:'buffalo-sabres',CAR:'carolina-hurricanes',CBJ:'columbus-blue-jackets',CGY:'calgary-flames',CHI:'chicago-blackhawks',COL:'colorado-avalanche',DAL:'dallas-stars',DET:'detroit-red-wings',EDM:'edmonton-oilers',FLA:'florida-panthers',LAK:'los-angeles-kings',MIN:'minnesota-wild',MTL:'montreal-canadiens',NJD:'new-jersey-devils',NSH:'nashville-predators',NYI:'new-york-islanders',NYR:'new-york-rangers',OTT:'ottawa-senators',PHI:'philadelphia-flyers',PIT:'pittsburgh-penguins',SEA:'seattle-kraken',SJS:'san-jose-sharks',STL:'st-louis-blues',TBL:'tampa-bay-lightning',TOR:'toronto-maple-leafs',UTA:'utah-mammoth',VAN:'vancouver-canucks',VGK:'vegas-golden-knights',WPG:'winnipeg-jets',WSH:'washington-capitals'}
const plain=s=>String(s).replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim()
export function dateET(d=new Date()){const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d).filter(x=>['year','month','day'].includes(x.type)).map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day}
export const timeET=d=>new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'}).format(d)
export function parseDfo(html,date){
  const t=plain(html),updated=(t.match(/Last updated:\s*(.+?)\s+Source:/i)?.[1]||'').trim()
  const link=html.match(/Source:[\s\S]{0,500}?<a[^>]*href=["'][^"']+["'][^>]*>([\s\S]*?)<\/a>/i)
  const source=(link?plain(link[1]):(t.match(/Source:\s*([^|]+?)(?:Team News|Show Jerseys|Last 10 Games Stats|Season Stats|Cap|Share)/i)?.[1]||'Daily Faceoff')).trim()
  const projected=/^(?:DFO\s*Projections?|Last\s*Game)(?:\b|\s*\()/i.test(source)||/^Daily Faceoff$/i.test(source)
  // Unattributed and stale lineups are UNKNOWN, never confirmed.
  const updatedDay=updated?dateET(new Date(updated)):null
  const current=updatedDay===date
  return {status:current&&!projected?'CONFIRMED':updated&&projected?'PROJECTED':'UNKNOWN',source}
}
export function command(raw){
  const x=String(raw||'').trim().replace(/^\//,'').replace(/@\w+$/,'').toUpperCase()
  if(['START','HELP',''].includes(x))return{type:'HELP'}
  if(x==='PING')return{type:'PING'}
  if(['STATUS','SLATE'].includes(x))return{type:'STATUS'}
  if(['NEXT','REMAINING'].includes(x))return{type:x}
  if(TEAM[x])return{type:'TEAM',team:x}
  const m=x.match(/^(\d{1,2}):([0-5]\d)(?:\s*(AM|PM))?$/)
  if(m&&Number(m[1])>=1&&Number(m[1])<=12)return{type:'TIME',hour:Number(m[1]),minute:Number(m[2]),ampm:m[3]||'',raw:x}
  return{type:'HELP'}
}
const cache=new Map()
async function cached(key,ttl,fn){const hit=cache.get(key);if(hit&&Date.now()-hit.time<ttl)return hit.value;const value=await fn();cache.set(key,{value,time:Date.now()});return value}
async function fetchText(url){const r=await fetch(url,{signal:AbortSignal.timeout(12000),headers:{'User-Agent':'NHL-Tracker-Dev-Telegram/1.0'}});if(!r.ok)throw Error('HTTP '+r.status);return r.text()}
async function slate(date){
  const data=await cached('slate:'+date,60000,async()=>JSON.parse(await fetchText('https://api-web.nhle.com/v1/score/'+date)))
  return(data.games||[]).map(g=>({time:new Date(g.startTimeUTC),teams:[g.awayTeam?.abbrev,g.homeTeam?.abbrev]})).filter(g=>g.teams.every(t=>TEAM[t])&&!isNaN(g.time.getTime())).sort((a,b)=>a.time-b.time)
}
async function statuses(games,date){
  const teams=[...new Set(games.flatMap(g=>g.teams))],out={}
  for(let i=0;i<teams.length;i+=6)await Promise.all(teams.slice(i,i+6).map(async t=>{
    try{out[t]=await cached('dfo:'+date+':'+t,60000,async()=>parseDfo(await fetchText('https://www.dailyfaceoff.com/teams/'+TEAM[t]+'/line-combinations'),date))}
    catch(e){out[t]={status:'UNKNOWN',source:'Source unavailable'}}
  }))
  return out
}
function gameGroups(games){const map=new Map();for(const g of games){const key=g.time.toISOString();if(!map.has(key))map.set(key,[]);map.get(key).push(g)}return [...map.values()]}
function matchTime(date,c){const text=timeET(date),m=text.match(/^(\d+):(\d+)\s*(AM|PM)$/i);return m&&Number(m[1])===c.hour&&Number(m[2])===c.minute&&(!c.ampm||m[3].toUpperCase()===c.ampm)}
const HELP='🏒 NHL Tracker Telegram DEV\n\nStatus — today’s confirmed team totals\nNext — next upcoming puck-drop group\nRemaining — unconfirmed and unavailable teams\n7:00 — start-time status (Eastern)\nCAR — team status\nPing — bot connectivity test\nHelp — this menu\n\nAutomatic alerts are not enabled in local testing.'
export async function answer(raw,now=new Date()){
  const c=command(raw)
  if(c.type==='HELP')return HELP
  if(c.type==='PING')return '🏒 NHL Tracker bot is online. Try Status or Next.'
  const date=dateET(now),all=await slate(date)
  if(!all.length)return '🏒 No NHL games found for '+date+' ET.'
  let games=all
  if(c.type==='TEAM'){games=all.filter(g=>g.teams.includes(c.team));if(!games.length)return c.team+' is not playing today.'}
  if(c.type==='NEXT'){games=gameGroups(all).find(group=>group[0].time>now)||[];if(!games.length)return '🏒 No further puck drops today.'}
  if(c.type==='TIME'){const matches=gameGroups(all).filter(g=>matchTime(g[0].time,c));if(!matches.length)return '🏒 No games at '+c.raw+' Eastern today.';games=matches.find(g=>g[0].time>now)||matches[0]}
  const s=await statuses(games,date),teams=[...new Set(games.flatMap(g=>g.teams))]
  const confirmed=teams.filter(t=>s[t]?.status==='CONFIRMED'),remaining=teams.filter(t=>s[t]?.status!=='CONFIRMED'),unknown=teams.filter(t=>s[t]?.status==='UNKNOWN')
  const label=c.type==='STATUS'?'Today’s lineup confirmations':c.type==='REMAINING'?'Unconfirmed teams':c.type==='TEAM'?c.team+' lineup':timeET(games[0].time)+' ET puck drop'
  const detail=c.type==='REMAINING'?(remaining.map(t=>(s[t]?.status==='PROJECTED'?'⏳ ':'❔ ')+t+' — '+s[t].status).join('\n')||'✅ All teams confirmed'):games.map(g=>g.teams.map(t=>(s[t]?.status==='CONFIRMED'?'✅':s[t]?.status==='PROJECTED'?'⏳':'❔')+' '+t).join(' vs ')).join('\n')
  return '🏒 '+label+'\n'+confirmed.length+'/'+teams.length+' teams confirmed ('+remaining.length+' remaining'+(unknown.length?', '+unknown.length+' unknown':'')+')\n\n'+detail+'\n\nChecked '+timeET(new Date())+' ET\nUnknown or stale sources are never counted as confirmed.'
}
async function main(){
  const token=process.env.TELEGRAM_BOT_TOKEN
  if(!token)throw Error('Missing TELEGRAM_BOT_TOKEN; see TELEGRAM_DEV_SETUP.md')
  const url='https://api.telegram.org/bot'+token
  const call=async(method,body)=>{const r=await fetch(url+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(40000)});const x=await r.json();if(!x.ok)throw Error(x.description||'Telegram request failed');return x.result}
  const bot=await call('getMe',{})
  console.log('Telegram local DEV bot online: @'+bot.username+'. Press Ctrl+C to stop.')
  let offset=0
  while(true)try{
    const updates=await call('getUpdates',{offset,timeout:25,allowed_updates:['message']})
    for(const u of updates){
      offset=u.update_id+1
      const msg=u.message
      if(msg?.chat?.type!=='private'||typeof msg.text!=='string')continue
      const allowed=(process.env.TELEGRAM_ALLOWED_CHAT_IDS||'').split(',').map(s=>s.trim()).filter(Boolean)
      if(allowed.length&&!allowed.includes(String(msg.chat.id))){await call('sendMessage',{chat_id:msg.chat.id,text:'Not authorized. Your chat ID is '+msg.chat.id+'. Add it to TELEGRAM_ALLOWED_CHAT_IDS locally.'});continue}
      let reply
      try{reply=await answer(msg.text)}catch(e){console.error('Status request failed:',e.message);reply='Lineup data is unavailable right now. Please try again.'}
      await call('sendMessage',{chat_id:msg.chat.id,text:reply.slice(0,4000)})
    }
  }catch(e){console.error('Polling error:',e.message);await sleep(3000)}
}
if(process.argv[1]&&import.meta.url.endsWith('/'+process.argv[1].replaceAll('\\','/').split('/').pop()))main().catch(e=>{console.error(e.message);process.exitCode=1})
