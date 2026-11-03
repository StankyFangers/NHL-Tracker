import {setTimeout as sleep} from 'node:timers/promises'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {join} from 'node:path'
import {homedir} from 'node:os'
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
  if(x==='ID')return{type:'ID'}
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
const HELP='🏒 NHL Tracker Telegram DEV\n\nAlerts on — subscribe to automatic confirmations\nAlerts off — pause automatic confirmations\nAlerts test — send a sample alert\nAlerts status — check subscription\n\nStatus — today’s confirmed team totals\nNext — next upcoming puck-drop group\nRemaining — unconfirmed and unavailable teams\n7:00 — start-time status (Eastern)\nCAR — team status\nPing — bot connectivity test\nHelp — this menu\n\nAutomatic confirmations run only while this DEV bot is running.'
export async function answer(raw,now=new Date()){
  const c=command(raw)
  if(c.type==='HELP')return HELP
  if(c.type==='PING')return '🏒 NHL Tracker bot is online. Try Status or Next.'
  if(c.type==='ID')return 'To see your chat ID, send /id to the running bot; the bot replies with the ID from your Telegram message.'
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


async function checkCompleteStartGroups(state,games,call,save,now){
 const future=[...new Set(games.filter(g=>g.time>now).map(g=>g.time.toISOString()))]
 for(const start of future){
  const group=games.filter(g=>g.time.toISOString()===start),teams=[...new Set(group.flatMap(g=>g.teams))];
  if(!teams.length||!teams.every(t=>state.observed[state.date+':'+t]==='CONFIRMED'))continue;
  const key=state.date+':GROUP:'+start;if(state.delivered[key])continue;
  const text='✅ '+timeET(new Date(start))+' ET — ALL LINES CONFIRMED!\n'+teams.length+'/'+teams.length+' teams confirmed\n'+teams.join(', ');
  let done=true;for(const chat of state.subscribers){try{await call('sendMessage',{chat_id:chat,text})}catch(e){done=false;console.error('Group notification failed:',e.message)}}
  if(done){state.delivered[key]=true;await save();console.log('Completed puck-drop group:',start)}
 }
}

const ALERT_FILE=join(homedir(),'.nhl-tracker','telegram-dev-alerts.json')
async function loadAlertState(){
 try{const x=JSON.parse(await readFile(ALERT_FILE,'utf8'));return {
   date:typeof x.date==='string'?x.date:'',
   subscribers:Array.isArray(x.subscribers)?x.subscribers.map(String):[],
   observed:x.observed&&typeof x.observed==='object'?x.observed:{},
   delivered:x.delivered&&typeof x.delivered==='object'?x.delivered:{}
 }}catch(e){if(e.code!=='ENOENT')console.error('Alert state reset:',e.message);return {date:'',subscribers:[],observed:{},delivered:{}}}
}
async function startAlertMonitor(call){
 const state=await loadAlertState()
 let queue=Promise.resolve()
 const save=()=>{queue=queue.catch(()=>{}).then(async()=>{await mkdir(join(homedir(),'.nhl-tracker'),{recursive:true});await writeFile(ALERT_FILE+'.tmp',JSON.stringify(state,null,2));const {rename}=await import('node:fs/promises');await rename(ALERT_FILE+'.tmp',ALERT_FILE)});return queue}
 const setSubscription=async(id,on)=>{
   const key=String(id);state.subscribers=state.subscribers.filter(x=>x!==key)
   if(on)state.subscribers.push(key)
   await save()
 }
 const intervalFor=mins=>mins<=15?60000:mins<=60?300000:1800000
 const lastCheck=new Map()
 const check=async()=>{
   if(!state.subscribers.length)return
   const now=new Date(),date=dateET(now)
   if(state.date!==date){state.date=date;state.observed={};state.delivered={};lastCheck.clear();await save()}
   const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',hourCycle:'h23'}).format(now))
   if(hour<10)return
   const games=(await slate(date)).filter(g=>g.time>now)
   if(!games.length)return
   const due=[]
   for(const g of games){
     const mins=(g.time-now)/60000,interval=intervalFor(mins)
     for(const t of g.teams){
       const key=date+':'+t,last=lastCheck.get(key)||0
       if(state.delivered[key]||state.observed[key]==='CONFIRMED')continue
       if(now.getTime()-last>=interval&&!due.includes(t)){due.push(t);lastCheck.set(key,now.getTime())}
     }
   }
   if(!due.length){await checkCompleteStartGroups(state,games,call,save,now);return}
   const toCheck=games.filter(g=>g.teams.some(t=>due.includes(t)))
   const results=await statuses(toCheck,date)
   const events=[]
   for(const team of due){
     const current=results[team]?.status||'UNKNOWN',key=date+':'+team,previous=state.observed[key]
     // Only a directly observed PROJECTED -> CONFIRMED transition produces an alert.
     // An initial CONFIRMED observation is baseline, not a newly detected event.
     if(previous==='PROJECTED'&&current==='CONFIRMED'&&!state.delivered[key])events.push({team,key})
     if(current==='PROJECTED'||current==='CONFIRMED')state.observed[key]=current
   }
   await save()
   await checkCompleteStartGroups(state,games,call,save,now)
   for(const event of events){
     const game=games.find(g=>g.teams.includes(event.team))
     const next=gameGroups(games)[0]||[]
     const nextTeams=[...new Set(next.flatMap(g=>g.teams))]
     const confirmed=nextTeams.filter(t=>state.observed[date+':'+t]==='CONFIRMED').length
     const footer=next.length?'\n\n🏒 Next puck drop '+timeET(next[0].time)+' ET — '+confirmed+'/'+nextTeams.length+' teams confirmed':''
     const text='✅ '+event.team+' — Lines Confirmed\nDaily Faceoff has published a same-day named-source lineup.'+footer
     // Save delivery only after Telegram accepts it; failed sends retry next pass.
     let delivered=true
     for(const chatId of state.subscribers){
       try{await call('sendMessage',{chat_id:chatId,text})}catch(e){delivered=false;console.error('Alert delivery to',chatId,'failed:',e.message)}
     }
     if(delivered){state.delivered[event.key]=true;await save();console.log('Line confirmation alert:',event.team)}
     else{state.observed[event.key]='PROJECTED';lastCheck.delete(event.key);await save()}
   }
 }
 let running=true
 const watchLoop=(async()=>{while(running){try{await check()}catch(e){console.error('Monitor:',e.message)}await sleep(30000)}})()
 return {
   async handle(chatId,input){
     const x=String(input||'').trim().replace(/^\//,'').toLowerCase()
     if(!['alerts on','alerts off','alerts status','alerts test'].includes(x))return null
     const id=String(chatId)
     if(x==='alerts status')return state.subscribers.includes(id)?'🔔 Automatic team confirmation alerts are ON.':'🔕 Automatic alerts are OFF. Send Alerts on to subscribe.'
     if(x==='alerts off'){await setSubscription(id,false);return '🔕 Automatic lineup alerts turned OFF.'}
     if(x==='alerts on'){await setSubscription(id,true);return '🔔 Automatic lineup alerts are ON for this Telegram chat. The monitor will check today’s remaining games and notify on observed projected-to-confirmed transitions. Your computer and this terminal must stay running in DEV mode.'}
     if(x==='alerts test')return '✅ TEST ONLY — CAR Lines Confirmed\n🏒 Next puck drop: 7:00 PM ET — 3/4 teams confirmed\n\nThis is a sample alert, not real lineup information.'
     return null
   },
   stop:async()=>{running=false;await watchLoop}
 }
}

async function main(){
  const token=process.env.TELEGRAM_BOT_TOKEN
  if(!token)throw Error('Missing TELEGRAM_BOT_TOKEN; see TELEGRAM_DEV_SETUP.md')
  const url='https://api.telegram.org/bot'+token
  const call=async(method,body)=>{const r=await fetch(url+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(40000)});const x=await r.json();if(!x.ok)throw Error(x.description||'Telegram request failed');return x.result}
  const bot=await call('getMe',{})
  console.log('Telegram local DEV bot online: @'+bot.username+'. Press Ctrl+C to stop.')
  const alerts=await startAlertMonitor(call)
  console.log('Automatic alert monitor enabled. In Telegram send: Alerts on')
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
      try{reply=command(msg.text).type==='ID'?'Your Telegram chat ID: '+msg.chat.id:(await alerts.handle(msg.chat.id,msg.text) ?? await answer(msg.text))}catch(e){console.error('Status request failed:',e.message);reply='Lineup data is unavailable right now. Please try again.'}
      await call('sendMessage',{chat_id:msg.chat.id,text:reply.slice(0,4000)})
    }
  }catch(e){console.error('Polling error:',e.message);await sleep(3000)}
}
if(process.argv[1]&&import.meta.url.endsWith('/'+process.argv[1].replaceAll('\\','/').split('/').pop()))main().catch(e=>{console.error(e.message);process.exitCode=1})
