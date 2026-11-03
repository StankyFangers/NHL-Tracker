const SLUGS={ANA:'anaheim-ducks',BOS:'boston-bruins',BUF:'buffalo-sabres',CAR:'carolina-hurricanes',CBJ:'columbus-blue-jackets',CGY:'calgary-flames',CHI:'chicago-blackhawks',COL:'colorado-avalanche',DAL:'dallas-stars',DET:'detroit-red-wings',EDM:'edmonton-oilers',FLA:'florida-panthers',LAK:'los-angeles-kings',MIN:'minnesota-wild',MTL:'montreal-canadiens',NJD:'new-jersey-devils',NSH:'nashville-predators',NYI:'new-york-islanders',NYR:'new-york-rangers',OTT:'ottawa-senators',PHI:'philadelphia-flyers',PIT:'pittsburgh-penguins',SEA:'seattle-kraken',SJS:'san-jose-sharks',STL:'st-louis-blues',TBL:'tampa-bay-lightning',TOR:'toronto-maple-leafs',UTA:'utah-mammoth',VAN:'vancouver-canucks',VGK:'vegas-golden-knights',WPG:'winnipeg-jets',WSH:'washington-capitals'};
function dateET(d=new Date()){const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d).filter(x=>['year','month','day'].includes(x.type)).map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day}
function timeET(d){return new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'}).format(d)}
function hourET(d){return Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',hourCycle:'h23'}).format(d))}
function clean(s){return String(s||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/&#39;|&#x27;/g,"'").replace(/\s+/g,' ').trim()}
export function parseLineStatus(html,gameDate){
 const text=clean(html),m=html.match(/Source:[\s\S]{0,500}?<a[^>]+href=["'][^"']+["'][^>]*>([\s\S]*?)<\/a>/i);
 const source=(m?clean(m[1]):(text.match(/Source:\s*(.+?)(?:Team News|Show Jerseys|Last 10 Games Stats|Season Stats|Cap|Share)/i)?.[1]||'')).trim();
 const raw=(text.match(/Last updated:\s*(.+?)\s+Source:/i)?.[1]||'').trim(),stamp=Date.parse(raw);
 const valid=raw&&Number.isFinite(stamp)&&dateET(new Date(stamp))===gameDate;
 const projection=!source||/^(?:DFO\s*Projections?|Last\s*Game)(?:\b|\s*\()/i.test(source)||/^Daily Faceoff$/i.test(source);
 return {status:valid&&!projection?'CONFIRMED':raw&&projection?'PROJECTED':'UNKNOWN',source:source||'Unattributed'};
}
export function pollingInterval(ms){return ms<=0?Infinity:ms<=900000?60000:ms<=3600000?300000:1800000}
const keyTeam=(date,team)=>date+':team:'+team;
const keyGroup=(date,start)=>date+':group:'+start;
async function getText(url){const r=await fetch(url,{headers:{'User-Agent':'NHL-Tracker-Telegram/1.0'},signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('HTTP '+r.status);return r.text()}
async function getGames(date){const result=JSON.parse(await getText('https://api-web.nhle.com/v1/score/'+date));return (result.games||[]).map(g=>({start:Date.parse(g.startTimeUTC),away:g.awayTeam?.abbrev,home:g.homeTeam?.abbrev})).filter(g=>Number.isFinite(g.start)&&SLUGS[g.away]&&SLUGS[g.home]).sort((a,b)=>a.start-b.start)}
async function rows(env,date){return (await env.DB.prepare('SELECT team,status,last_checked_at FROM line_status WHERE game_date=?').bind(date).all()).results||[]}
const chats=env=>String(env.TELEGRAM_CHAT_IDS||'').split(',').map(x=>x.trim()).filter(x=>/^\d+$/.test(x));
export function progress(g){return g.confirmed.length+'/'+g.teams.length+' teams confirmed ('+g.remaining.length+' remaining)'}
function groups(games,items,now){const states=new Map(items.map(x=>[x.team,x.status]));return [...new Set(games.map(g=>g.start))].filter(t=>t>now).map(start=>{const teams=[...new Set(games.filter(g=>g.start===start).flatMap(g=>[g.away,g.home]))],confirmed=teams.filter(t=>states.get(t)==='CONFIRMED');return {start,teams,confirmed,remaining:teams.filter(t=>!confirmed.includes(t))}})}
async function telegram(env,chat,text){const r=await fetch('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chat,text}),signal:AbortSignal.timeout(10000)});const result=await r.json();if(!result.ok)throw Error('Telegram: '+(result.description||r.status))}
async function queue(env,key,kind,message){for(const chat of chats(env))await env.DB.prepare('INSERT OR IGNORE INTO delivery(event_key,chat_id,kind,message,created_at) VALUES(?,?,?,?,?)').bind(key,chat,kind,message,Date.now()).run()}
async function deliver(env){const pending=(await env.DB.prepare('SELECT event_key,chat_id,message FROM delivery WHERE delivered_at IS NULL ORDER BY created_at LIMIT 10').all()).results||[];
 for(const p of pending)try{await telegram(env,p.chat_id,p.message);await env.DB.prepare('UPDATE delivery SET delivered_at=? WHERE event_key=? AND chat_id=? AND delivered_at IS NULL').bind(Date.now(),p.event_key,p.chat_id).run()}catch(e){console.error('Delivery failed',p.event_key,String(e))}
}
export async function tick(env,now=new Date()){
 const date=dateET(now),at=now.getTime();if(hourET(now)<10)return {date,checked:0,note:'Before 10 AM ET'};
 const games=(await getGames(date)).filter(g=>g.start>at);if(!games.length){await deliver(env);return{date,checked:0,note:'No remaining games'};}
 const existing=await rows(env,date),known=new Map(existing.map(x=>[x.team,x])),starts=new Map();
 for(const g of games)for(const t of [g.away,g.home])starts.set(t,Math.min(starts.get(t)||Infinity,g.start));
 const due=[];for(const [team,start] of starts){const prev=known.get(team);if(prev?.status==='CONFIRMED')continue;if(!prev||at-Number(prev.last_checked_at)>=pollingInterval(start-at))due.push(team)}
 const changed=[];
 for(let i=0;i<due.length;i+=5){
  const results=await Promise.all(due.slice(i,i+5).map(async team=>{try{return {team,...parseLineStatus(await getText('https://www.dailyfaceoff.com/teams/'+SLUGS[team]+'/line-combinations'),date)}}catch(e){console.error('DFO unavailable',team,String(e));return{team,status:'UNKNOWN',source:'Unavailable'}}}));
  for(const fresh of results){
   const old=known.get(fresh.team),next=fresh.status==='UNKNOWN'&&old?old.status:fresh.status;
   if(old?.status==='PROJECTED'&&fresh.status==='CONFIRMED')changed.push(fresh.team);
   await env.DB.prepare('INSERT INTO line_status(game_date,team,status,last_checked_at,source) VALUES(?,?,?,?,?) ON CONFLICT(game_date,team) DO UPDATE SET status=excluded.status,last_checked_at=excluded.last_checked_at,source=excluded.source').bind(date,fresh.team,next,at,fresh.source).run();
   known.set(fresh.team,{team:fresh.team,status:next,last_checked_at:at});
  }
 }
 const list=groups(games,[...known.values()],at),next=list[0];
 // Count baseline confirmations as soon as observed, even before any new transition.
 for(const g of list)if(g.remaining.length===0)await queue(env,keyGroup(date,g.start),'GROUP','✅ '+timeET(new Date(g.start))+' ET — ALL LINES CONFIRMED!\n'+progress(g)+'\n'+g.teams.join(', '));
 for(const team of changed){
  const start=games.find(g=>[g.away,g.home].includes(team))?.start,own=list.find(g=>g.start===start);
  const footer=next?'\n\n🏒 Next puck drop '+timeET(new Date(next.start))+' ET — '+progress(next):'';
  await queue(env,keyTeam(date,team),'TEAM','✅ '+team+' — Lines Confirmed\nDaily Faceoff has a same-day named-source lineup.\n'+(own?timeET(new Date(own.start))+' ET group: '+progress(own):'')+footer);
 }
 await deliver(env);return {date,checked:due.length,newConfirmations:changed.length,upcomingGroups:list.length};
}
function parseCmd(raw){const x=String(raw||'').trim().replace(/^\//,'').replace(/@\w+$/,'').toUpperCase(),m=x.match(/^(\d{1,2}):([0-5]\d)(?:\s*(AM|PM))?$/);if(['STATUS','SLATE','NEXT','REMAINING','HELP','START','PING','ID'].includes(x))return{type:x};if(SLUGS[x])return{type:'TEAM',team:x};if(m&&+m[1]>0&&+m[1]<=12)return{type:'TIME',h:+m[1],m:+m[2],ampm:m[3]||''};return{type:'HELP'}}
async function answer(env,message,chat){
 const cmd=parseCmd(message);if(cmd.type==='PING')return '🏒 NHL Tracker cloud bot is online.';
 if(cmd.type==='ID')return 'Your Telegram chat ID is '+chat;
 if(['START','HELP'].includes(cmd.type))return '🏒 NHL Tracker Cloud\nStatus — daily confirmations\nNext — next puck drop\nRemaining — not yet confirmed\n7:00 — start-time status ET\nCAR — team lookup\nPing — bot test';
 const date=dateET(new Date()),all=await getGames(date),existing=await rows(env,date),now=Date.now(),g=groups(all,existing,now),states=new Map(existing.map(x=>[x.team,x.status]));
 let games=all;if(cmd.type==='NEXT')games=all.filter(x=>x.start===g[0]?.start);
 if(cmd.type==='TEAM')games=all.filter(x=>[x.away,x.home].includes(cmd.team));
 if(cmd.type==='TIME'){const starts=[...new Set(all.map(x=>x.start))],found=starts.find(x=>{const m=timeET(new Date(x)).match(/^(\d+):(\d+)\s*(AM|PM)$/i);return m&&+m[1]===cmd.h&&+m[2]===cmd.m&&(!cmd.ampm||m[3].toUpperCase()===cmd.ampm)});games=all.filter(x=>x.start===found)}
 if(!games.length)return '🏒 No matching games today.';
 const teams=[...new Set(games.flatMap(x=>[x.away,x.home]))],confirmed=teams.filter(t=>states.get(t)==='CONFIRMED');
 const selected=cmd.type==='REMAINING'?teams.filter(x=>!confirmed.includes(x)):teams;
 return '🏒 '+(cmd.type==='NEXT'?'Next puck drop':cmd.type==='TEAM'?cmd.team:cmd.type==='TIME'?'Puck-drop group':'Today')+': '+confirmed.length+'/'+teams.length+' confirmed\n'+(selected.map(t=>(states.get(t)==='CONFIRMED'?'✅':states.get(t)==='PROJECTED'?'⏳':'❔')+' '+t+' — '+(states.get(t)||'UNKNOWN')).join('\n')||'All confirmed')+'\n\nLast monitored snapshot (not a live recheck).';
}
export default {
 async scheduled(_event,env,ctx){ctx.waitUntil(tick(env).catch(e=>console.error('Monitor failed',String(e))))},
 async fetch(req,env,ctx){const u=new URL(req.url);
  if(u.pathname==='/health')return Response.json({ok:true,service:'NHL Telegram DEV'});
  if(u.pathname==='/telegram'&&req.method==='POST'){
   if(!env.TELEGRAM_WEBHOOK_SECRET||req.headers.get('X-Telegram-Bot-Api-Secret-Token')!==env.TELEGRAM_WEBHOOK_SECRET)return new Response('Unauthorized',{status:401});
   let update;try{update=await req.json()}catch{return new Response('Bad JSON',{status:400})}
   const m=update?.message;if(m?.chat?.type!=='private'||typeof m.text!=='string')return new Response('OK');
   const chat=String(m.chat.id);if(!chats(env).includes(chat))return new Response('OK');
   ctx.waitUntil((async()=>{try{await telegram(env,chat,await answer(env,m.text,chat))}catch(e){console.error('Command error',String(e))}})());
   return new Response('OK');
  }
  if(u.pathname==='/admin/tick'&&req.method==='POST'){
   if(!env.ADMIN_SECRET||req.headers.get('Authorization')!=='Bearer '+env.ADMIN_SECRET)return new Response('Unauthorized',{status:401});
   try{return Response.json(await tick(env))}catch(e){return Response.json({error:String(e)},{status:500})}
  }
  return new Response('Not Found',{status:404});
 }
};
