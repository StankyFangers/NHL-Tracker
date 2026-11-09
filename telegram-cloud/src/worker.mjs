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

function sectionHtml(html,start,end){
 const a=html.search(new RegExp(start,'i'));
 if(a<0)return '';
 const rest=html.slice(a),b=rest.search(new RegExp(end,'i'));
 return b>0?rest.slice(0,b):rest;
}
function namesIn(html){
 return [...html.matchAll(/<a[^>]+href=["'][^"']*\/players\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/gi)]
  .map(m=>clean(m[1])).filter(Boolean);
}
export function parseLineSnapshot(html){
 const f=namesIn(sectionHtml(html,'>Forwards<|Forwards','Defensive Pairings')).slice(0,12);
 const d=namesIn(sectionHtml(html,'Defensive Pairings','1st Powerplay Unit|1st Power Play Unit')).slice(0,6);
 const p1=namesIn(sectionHtml(html,'1st Powerplay Unit|1st Power Play Unit','2nd Powerplay Unit|2nd Power Play Unit')).slice(0,5);
 const p2=namesIn(sectionHtml(html,'2nd Powerplay Unit|2nd Power Play Unit','1st Penalty Kill Unit')).slice(0,5);
 if(f.length!==12||d.length!==6||p1.length!==5||p2.length!==5)return null;
 const rows=(xs,n)=>Array.from({length:Math.ceil(xs.length/n)},(_,i)=>xs.slice(i*n,(i+1)*n).join(', '));
 return {'Forward lines':rows(f,3),'Defensive pairs':rows(d,2),'PP1':[p1.join(', ')],'PP2':[p2.join(', ')]};
}
/** NHL Tracker combo rule: shared forward line AND shared power-play unit.
 * Keep three-player combos as trios, not duplicate pairs.
 */
export function qualifyingForwardCombos(snapshot){
 if(!snapshot)return [];
 const forward=Array.isArray(snapshot['Forward lines'])?snapshot['Forward lines']:[];
 const units=[['PP1',snapshot.PP1?.[0]],['PP2',snapshot.PP2?.[0]]];
 const names=value=>String(value||'').split(',').map(n=>n.trim()).filter(Boolean);
 const combos=[];
 for(let i=0;i<forward.length;i++){
  const line=names(forward[i]);
  for(const [unit,players] of units){
   const onPP=new Set(names(players).map(n=>n.toLowerCase()));
   const shared=line.filter(n=>onPP.has(n.toLowerCase()));
   if(shared.length>=2)combos.push({line:'FL'+(i+1),unit,players:shared});
  }
 }
 return combos;
}
function teamStatusText(team,item){
 const status=item?.status||'UNKNOWN';
 const symbol=status==='CONFIRMED'?'✅':status==='PROJECTED'?'⏳':'❔';
 return symbol+' '+team+' — '+status+(item?.success?'':' (source unavailable)');
}
function teamComboText(team,item){
 if(!item?.success||!item?.lineup)return '🏒 '+team+' — Combos unavailable. Daily Faceoff lineup could not be read completely.';
 const combos=qualifyingForwardCombos(item.lineup),status=item.status==='CONFIRMED'?'CONFIRMED':item.status==='PROJECTED'?'PROJECTED':'UNVERIFIED';
 return '🏒 '+team+' — '+status+' COMBOS\n'+
  (combos.length?combos.map(c=>'• '+c.line+' / '+c.unit+': '+c.players.join(' + ')).join('\n'):'No qualifying forward-line + power-play combos in the current lineup.');
}

export function lineupChanges(oldValue,newValue){
 const before=JSON.parse(oldValue),out=[];
 for(const label of Object.keys(newValue)){
  const prev=before[label]||[],next=newValue[label]||[];
  for(let i=0;i<next.length;i++)if(prev[i]!==next[i])out.push(label+(next.length>1?' '+(i+1):'')+':\nBefore: '+(prev[i]||'Unknown')+'\nNow: '+next[i]);
 }
 return out;
}
export function pollingInterval(ms){return ms<=0||ms>9*3600000?Infinity:ms<=15*60000?60000:ms<=3600000?300000:ms<=4*3600000?900000:ms<=7*3600000?1800000:3600000}
const keyTeam=(date,team)=>date+':team:'+team;
const keyGroup=(date,start)=>date+':group:'+start;
async function getText(url){const r=await fetch(url,{headers:{'User-Agent':'NHL-Tracker-Telegram/1.0'},signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('HTTP '+r.status);return r.text()}
async function getGames(date){const result=JSON.parse(await getText('https://api-web.nhle.com/v1/score/'+date));return (result.games||[]).map(g=>({start:Date.parse(g.startTimeUTC),away:g.awayTeam?.abbrev,home:g.homeTeam?.abbrev})).filter(g=>Number.isFinite(g.start)&&SLUGS[g.away]&&SLUGS[g.home]).sort((a,b)=>a.start-b.start)}
async function rows(env,date){return (await env.DB.prepare('SELECT team,status,last_checked_at FROM line_status WHERE game_date=?').bind(date).all()).results||[]}

const chats=env=>String(env.TELEGRAM_CHAT_IDS||'').split(',').map(x=>x.trim()).filter(x=>/^\d+$/.test(x));
const noCache={'Cache-Control':'no-store'};
const json=(data,status=200)=>Response.json(data,{status,headers:noCache});
async function accountIdentity(req){
 const token=(req.headers.get('Authorization')||'').match(/^Bearer\s+(.+)$/i)?.[1];
 if(!token||token.length<16)return null;
 const mode=req.headers.get('X-NHL-Environment')==='TEST'?'TEST':'LIVE';
 const endpoint=mode==='TEST'?'https://nhl-tracker-vercel-api.vercel.app/api/account':'https://nhl-tracker-vercel-api.vercel.app/api/live-account';
 const result=await fetch(endpoint,{method:'GET',headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal:AbortSignal.timeout(10000),cache:'no-store'});
 if(!result.ok)return null;
 const data=await result.json();
 const name=String(data?.account?.username||'');
 if(!/^[A-Za-z0-9_.-]{2,80}$/.test(name))return null;
 return mode+':'+name.toLowerCase();
}
async function linkedRecipients(env,date,teams,changesOnly=false){
 const rows=(await env.DB.prepare("SELECT account_key,chat_id,scope,progress_mode,lineup_changes FROM telegram_accounts WHERE enabled=1 AND chat_id IS NOT NULL").all()).results||[];
 const selected=[];
 for(const row of rows){
  if(changesOnly&&row.lineup_changes!==1)continue;
  if(row.scope!=='WAGERED'){selected.push(row);continue}
  if(!teams.length)continue;
  const pending=(await env.DB.prepare("SELECT team FROM telegram_pending_teams WHERE account_key=? AND game_date=?").bind(row.account_key,date).all()).results||[];
  if(pending.some(x=>teams.includes(x.team)))selected.push(row);
 }
 return selected;
}
async function linkChat(env,chat,code){
 if(!/^[a-f0-9]{32}$/i.test(code))return 'Invalid or expired link code. Open NHL Tracker → Phone Notification Setup to generate a new one.';
 const now=Date.now();
 const row=await env.DB.prepare('SELECT account_key,expires_at FROM telegram_link_codes WHERE code=?').bind(code.toLowerCase()).first();
 if(!row||Number(row.expires_at)<=now)return 'Link expired or already used. Generate a new code in NHL Tracker.';
 const used=await env.DB.prepare('SELECT account_key FROM telegram_accounts WHERE chat_id=?').bind(chat).first();
 if(used&&used.account_key!==row.account_key)return 'This Telegram chat is already linked to another NHL Tracker account. Disconnect that account first.';
 await env.DB.batch([
  env.DB.prepare('INSERT INTO telegram_accounts(account_key,chat_id,enabled,scope,lineup_changes,progress_mode,created_at,updated_at) VALUES(?,?,0,\'ALL\',0,\'OFF\',?,?) ON CONFLICT(account_key) DO UPDATE SET chat_id=excluded.chat_id,updated_at=excluded.updated_at').bind(row.account_key,chat,now,now),
  env.DB.prepare('DELETE FROM telegram_link_codes WHERE account_key=?').bind(row.account_key)
 ]);
 return '✅ Telegram linked to NHL Tracker. Set your notification preferences in the desktop app. Send Ping, Status, or Alerts here to test commands.';
}
async function accountAPI(req,env,path){
 let key;
 try{key=await accountIdentity(req)}catch(e){console.error('Telegram account authentication unavailable',String(e));return json({error:'Account verification temporarily unavailable'},503)}
 if(!key)return json({error:'Sign in to your NHL Tracker account first'},401);
 const now=Date.now();
 const existing=await env.DB.prepare('SELECT * FROM telegram_accounts WHERE account_key=?').bind(key).first();
 if(path==='/account/status'&&req.method==='GET')return json({connected:!!existing?.chat_id,enabled:existing?.enabled===1,scope:existing?.scope||'ALL',lineupChanges:existing?.lineup_changes===1,confirmationProgress:existing?.progress_mode||'OFF'});
 if(path==='/account/link/start'&&req.method==='POST'){
  if(existing?.chat_id)return json({error:'Already connected. Disconnect before linking another chat.'},409);
  const code=[...crypto.getRandomValues(new Uint8Array(16))].map(b=>b.toString(16).padStart(2,'0')).join('');
  const bot=await (await fetch('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/getMe')).json();
  if(!bot.ok||!bot.result?.username)return json({error:'Telegram bot unavailable'},503);
  await env.DB.prepare('DELETE FROM telegram_link_codes WHERE account_key=?').bind(key).run();
  await env.DB.prepare('INSERT INTO telegram_link_codes(code,account_key,expires_at,created_at) VALUES(?,?,?,?)').bind(code,key,now+10*60000,now).run();
  return json({code,url:'https://t.me/'+bot.result.username+'?start='+code,expiresInMinutes:10});
 }
 if(path==='/account/preferences'&&req.method==='PUT'){
  if(!existing?.chat_id)return json({error:'Link Telegram before enabling notifications'},409);
  const prefs=await req.json().catch(()=>null);
  if(!prefs||typeof prefs.enabled!=='boolean'||typeof prefs.lineupChanges!=='boolean'||!['ALL','WAGERED'].includes(prefs.scope)||!['OFF','FOOTER','SEPARATE'].includes(prefs.confirmationProgress))return json({error:'Invalid preferences'},400);
  await env.DB.prepare('UPDATE telegram_accounts SET enabled=?,scope=?,lineup_changes=?,progress_mode=?,updated_at=? WHERE account_key=?').bind(+prefs.enabled,prefs.scope,+prefs.lineupChanges,prefs.confirmationProgress,now,key).run();
  return json({ok:true});
 }
 if(path==='/account/test'&&req.method==='POST'){
  if(!existing?.chat_id)return json({error:'Link Telegram first'},409);
  await telegram(env,existing.chat_id,'🏒 NHL Tracker — Test notification\n✅ Your Telegram account is connected and messages are working.');
  return json({ok:true});
 }
 if(path==='/account/disconnect'&&req.method==='POST'){
  await env.DB.batch([
   env.DB.prepare('DELETE FROM telegram_accounts WHERE account_key=?').bind(key),
   env.DB.prepare('DELETE FROM telegram_link_codes WHERE account_key=?').bind(key),
   env.DB.prepare('DELETE FROM telegram_pending_teams WHERE account_key=?').bind(key)
  ]);
  if(existing?.chat_id)await env.DB.prepare('DELETE FROM delivery WHERE chat_id=? AND delivered_at IS NULL').bind(existing.chat_id).run();
  return json({ok:true});
 }
 if(path==='/account/pending'&&req.method==='PUT'){
  const data=await req.json().catch(()=>null);
  if(!data||!/^\d{4}-\d{2}-\d{2}$/.test(data.date)||!Array.isArray(data.teams)||data.teams.length>32||data.teams.some(x=>typeof x!=='string'||!SLUGS[x]))return json({error:'Invalid pending teams'},400);
  const teams=[...new Set(data.teams)];
  await env.DB.batch([
   env.DB.prepare('DELETE FROM telegram_pending_teams WHERE account_key=? AND game_date=?').bind(key,data.date),
   ...teams.map(team=>env.DB.prepare('INSERT INTO telegram_pending_teams(account_key,game_date,team,updated_at) VALUES(?,?,?,?)').bind(key,data.date,team,now))
  ]);
  return json({ok:true,count:teams.length});
 }
 return json({error:'Not found'},404);
}

export function progress(g){return g.confirmed.length+'/'+g.teams.length+' teams confirmed ('+g.remaining.length+' remaining)'}
function groups(games,items,now){const states=new Map(items.map(x=>[x.team,x.status]));return [...new Set(games.map(g=>g.start))].filter(t=>t>now).map(start=>{const teams=[...new Set(games.filter(g=>g.start===start).flatMap(g=>[g.away,g.home]))],confirmed=teams.filter(t=>states.get(t)==='CONFIRMED');return {start,teams,confirmed,remaining:teams.filter(t=>!confirmed.includes(t))}})}
async function telegram(env,chat,text){const r=await fetch('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chat,text}),signal:AbortSignal.timeout(10000)});const result=await r.json();if(!result.ok)throw Error('Telegram: '+(result.description||r.status))}
async function queue(env,key,kind,message,teams=[],footer='',progressKey='',changesOnly=false){
 const date=key.slice(0,10);
 const recipients=await linkedRecipients(env,date,teams,changesOnly);
 for(const row of recipients){
  const final=message+(row.progress_mode==='FOOTER'?footer:'');
  await env.DB.prepare('INSERT OR IGNORE INTO delivery(event_key,chat_id,kind,message,created_at) VALUES(?,?,?,?,?)').bind(key,row.chat_id,kind,final,Date.now()).run();
  if(progressKey&&row.progress_mode==='SEPARATE')await env.DB.prepare('INSERT OR IGNORE INTO delivery(event_key,chat_id,kind,message,created_at) VALUES(?,?,?,?,?)').bind(progressKey,row.chat_id,'PROGRESS',footer.trim(),Date.now()).run();
 }
}
async function deliver(env){const pending=(await env.DB.prepare('SELECT event_key,chat_id,message FROM delivery WHERE delivered_at IS NULL ORDER BY created_at LIMIT 10').all()).results||[];
 for(const p of pending)try{await telegram(env,p.chat_id,p.message);await env.DB.prepare('UPDATE delivery SET delivered_at=? WHERE event_key=? AND chat_id=? AND delivered_at IS NULL').bind(Date.now(),p.event_key,p.chat_id).run()}catch(e){console.error('Delivery failed',p.event_key,String(e))}
}
export async function tick(env,now=new Date()){
 const date=dateET(now),at=now.getTime();if(hourET(now)<10)return {date,checked:0,note:'Before 10 AM ET'};
 const games=(await getGames(date)).filter(g=>g.start>at);if(!games.length){await deliver(env);return{date,checked:0,note:'No remaining games'};}
 const existing=await rows(env,date),known=new Map(existing.map(x=>[x.team,x])),starts=new Map();
 for(const g of games)for(const t of [g.away,g.home])starts.set(t,Math.min(starts.get(t)||Infinity,g.start));
 const watchingChanges=!!(await env.DB.prepare('SELECT 1 AS enabled FROM telegram_accounts WHERE enabled=1 AND lineup_changes=1 LIMIT 1').first());
 const due=[];for(const [team,start] of starts){const prev=known.get(team);if(prev?.status==='CONFIRMED'&&!watchingChanges)continue;const interval=pollingInterval(start-at);if(Number.isFinite(interval)&&(!prev||at-Number(prev.last_checked_at)>=interval))due.push(team)}
 const changed=[];
 for(let i=0;i<due.length;i+=5){
  const results=await Promise.all(due.slice(i,i+5).map(async team=>{try{const html=await getText('https://www.dailyfaceoff.com/teams/'+SLUGS[team]+'/line-combinations');return {team,...parseLineStatus(html,date),lineup:parseLineSnapshot(html)}}catch(e){console.error('DFO unavailable',team,String(e));return{team,status:'UNKNOWN',source:'Unavailable'}}}));
  for(const fresh of results){
   const old=known.get(fresh.team),next=fresh.status==='UNKNOWN'&&old?old.status:fresh.status;
   // A team may be confirmed before our first successful scheduled poll. Treat
   // the first observed CONFIRMED state as an event as well, not only
   // PROJECTED -> CONFIRMED. The deterministic event key prevents duplicates.
   if(fresh.status==='CONFIRMED'&&old?.status!=='CONFIRMED')changed.push(fresh.team);
   if(fresh.status==='CONFIRMED'&&fresh.lineup){
    const snapshot=JSON.stringify(fresh.lineup),prevLineup=await env.DB.prepare('SELECT snapshot FROM confirmed_lineups WHERE game_date=? AND team=?').bind(date,fresh.team).first();
    if(prevLineup&&prevLineup.snapshot!==snapshot&&old?.status==='CONFIRMED'){
     const changes=lineupChanges(prevLineup.snapshot,fresh.lineup);
     if(changes.length)await queue(env,date+':lineup-change:'+fresh.team+':'+at,'CHANGE','🔁 '+fresh.team+' — Confirmed Lines Changed\n'+changes.join('\n\n'),[fresh.team],'','',true);
    }
    await env.DB.prepare('INSERT INTO confirmed_lineups(game_date,team,snapshot,checked_at) VALUES(?,?,?,?) ON CONFLICT(game_date,team) DO UPDATE SET snapshot=excluded.snapshot,checked_at=excluded.checked_at').bind(date,fresh.team,snapshot,at).run();
   }

   await env.DB.prepare('INSERT INTO line_status(game_date,team,status,last_checked_at,source) VALUES(?,?,?,?,?) ON CONFLICT(game_date,team) DO UPDATE SET status=excluded.status,last_checked_at=excluded.last_checked_at,source=excluded.source').bind(date,fresh.team,next,at,fresh.source).run();
   known.set(fresh.team,{team:fresh.team,status:next,last_checked_at:at});
  }
 }
 const list=groups(games,[...known.values()],at),next=list[0];
 // Count baseline confirmations as soon as observed, even before any new transition.
 for(const g of list)if(g.remaining.length===0)await queue(env,keyGroup(date,g.start),'GROUP','✅ '+timeET(new Date(g.start))+' ET — ALL LINES CONFIRMED!\n'+progress(g)+'\n'+g.teams.join(', '),g.teams);
 for(const team of changed){
  const start=games.find(g=>[g.away,g.home].includes(team))?.start,own=list.find(g=>g.start===start);
  const footer=next?'\n\n🏒 Next puck drop '+timeET(new Date(next.start))+' ET — '+progress(next):'';
  await queue(env,keyTeam(date,team),'TEAM','✅ '+team+' — Lines Confirmed\nDaily Faceoff has a same-day named-source lineup.\n'+(own?timeET(new Date(own.start))+' ET group: '+progress(own):''),[team],footer,next?date+':progress:'+next.start+':'+next.confirmed.length:'');
 }
 await deliver(env);return {date,checked:due.length,newConfirmations:changed.length,upcomingGroups:list.length};
}

function checkedTimeET(d){return new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit',hour12:true}).format(d).replace(/\u202f/g,' ')}
// Commands read fresh Daily Faceoff data without modifying the scheduled monitor's
// stored baseline. Otherwise a manual Status/Combos query can consume the
// PROJECTED -> CONFIRMED transition before the cron can notify subscribers.
async function refreshOnDemand(_env,date,teams){
 const checkedAt=new Date(),results=new Map();
 for(let i=0;i<teams.length;i+=6){
  const batch=await Promise.all(teams.slice(i,i+6).map(async team=>{
   try{
    const html=await getText('https://www.dailyfaceoff.com/teams/'+SLUGS[team]+'/line-combinations');
    return {team,...parseLineStatus(html,date),lineup:parseLineSnapshot(html),success:true};
   }catch(e){
    console.error('On-demand source failed',team,String(e));
    return {team,status:'UNKNOWN',source:'Unavailable',success:false};
   }
  }));
  for(const item of batch)results.set(item.team,item);
 }
 return {checkedAt,results};
}
export function parseCmd(raw){
 const x=String(raw||'').trim().replace(/^\//,'').replace(/@\w+$/,'').toUpperCase().replace(/\s+/g,' ');
 const m=x.match(/^(\d{1,2}):([0-5]\d)(?:\s*(AM|PM))?$/);
 if(['STATUS','SLATE','NEXT','REMAINING','HELP','START','PING','ID','ALERTS'].includes(x))return {type:x};
 const team=x.match(/^([A-Z]{2,3})(?: (STATUS|COMBOS))?$/);
 if(team&&SLUGS[team[1]])return {type:'TEAM',team:team[1],detail:team[2]||'BOTH'};
 if(m&&+m[1]>0&&+m[1]<=12)return {type:'TIME',h:+m[1],m:+m[2],ampm:m[3]||''};
 return {type:'HELP'};
}
async function answer(env,message,chat){
 const cmd=parseCmd(message);
 if(cmd.type==='PING')return '🏒 NHL Tracker cloud bot is online.';
 if(cmd.type==='ID')return 'Your Telegram chat ID is '+chat;
 if(cmd.type==='ALERTS'){
  const subscription=await env.DB.prepare('SELECT enabled,scope,lineup_changes,progress_mode FROM telegram_accounts WHERE chat_id=?').bind(chat).first();
  if(!subscription)return '⚠️ Telegram chat is not linked to an NHL Tracker account.';
  const today=dateET(new Date());
  const stored=(await rows(env,today)).filter(x=>x.last_checked_at);
  const last=stored.length?Math.max(...stored.map(x=>Number(x.last_checked_at)||0)):0;
  const pending=await env.DB.prepare('SELECT COUNT(*) AS n FROM delivery WHERE chat_id=? AND delivered_at IS NULL').bind(chat).first();
  return '🏒 NHL Tracker — Automatic Alerts Diagnostics\n'+
   'Push notifications: '+(subscription.enabled===1?'ON ✅':'OFF ❌')+'\n'+
   'Teams: '+(subscription.scope||'ALL')+'\n'+
   'Confirmed lineup changes: '+(subscription.lineup_changes===1?'ON':'OFF')+'\n'+
   'Progress notifications: '+(subscription.progress_mode||'OFF')+'\n'+
   'Last scheduled team check: '+(last?checkedTimeET(new Date(last))+' ET':'none recorded today')+'\n'+
   'Teams checked today: '+stored.length+'\n'+
   'Undelivered messages: '+Number(pending?.n||0)+'\n'+
   (subscription.enabled===1?'Push enabled. Team confirmation alerts are automatic for eligible monitored teams.':'⚠️ Enable automatic notifications and SAVE in NHL Tracker → Settings → Telegram Notifications.');
 }
 if(['START','HELP'].includes(cmd.type))return '🏒 NHL Tracker Cloud\nStatus — live daily confirmations\nNext — live next puck drop\nRemaining — live unconfirmed teams\n7:00 — live start-time status ET\nTBL — team status + qualifying combos\nTBL Status — team status only\nTBL Combos — qualifying combos only\nPing — bot test\nAlerts — push settings and scheduler diagnostics';
 const now=new Date(),date=dateET(now),all=await getGames(date);
 let games=all;
 if(cmd.type==='NEXT'){
  const start=all.find(g=>g.start>now.getTime())?.start;
  games=all.filter(g=>g.start===start);
 }
 if(cmd.type==='TEAM')games=all.filter(g=>[g.away,g.home].includes(cmd.team));
 if(cmd.type==='TIME'){
  const found=[...new Set(all.map(g=>g.start))].find(x=>{
   const m=timeET(new Date(x)).match(/^(\d+):(\d+)\s*(AM|PM)$/i);
   return m&&+m[1]===cmd.h&&+m[2]===cmd.m&&(!cmd.ampm||m[3].toUpperCase()===cmd.ampm)
  });
  games=all.filter(g=>g.start===found);
 }
 if(!games.length)return '🏒 No matching games today.\nLast Checked: '+checkedTimeET(new Date())+' ET (NHL schedule)';
 const teams=[...new Set(games.flatMap(g=>[g.away,g.home]))];
 const {results,checkedAt}=await refreshOnDemand(env,date,teams);
 if(cmd.type==='TEAM'){
  const item=results.get(cmd.team);
  const stamp='\nLast Checked: '+checkedTimeET(checkedAt)+' ET (Daily Faceoff)';
  const status=teamStatusText(cmd.team,item);
  const combos=teamComboText(cmd.team,item);
  if(cmd.detail==='STATUS')return status+stamp;
  if(cmd.detail==='COMBOS')return combos+stamp;
  return status+'\n\n'+combos+stamp;
 }
 const confirmed=teams.filter(t=>results.get(t)?.status==='CONFIRMED');
 const unknown=teams.filter(t=>results.get(t)?.status==='UNKNOWN');
 const selected=cmd.type==='REMAINING'?teams.filter(t=>results.get(t)?.status!=='CONFIRMED'):teams;
 const detail=selected.map(t=>{
  const r=results.get(t),status=r?.status||'UNKNOWN';
  return (status==='CONFIRMED'?'✅':status==='PROJECTED'?'⏳':'❔')+' '+t+' — '+(r?.success?status:'UNAVAILABLE');
 }).join('\n')||'✅ All confirmed';
 const count=confirmed.length+'/'+teams.length+' confirmed'+(unknown.length?' ('+unknown.length+' unknown/unavailable; count incomplete)':'');
 const label=cmd.type==='NEXT'?'Next puck drop':cmd.type==='TEAM'?cmd.team:cmd.type==='TIME'?'Puck-drop group':cmd.type==='REMAINING'?'Remaining':'Today';
 return '🏒 '+label+': '+count+'\n'+detail+'\n\nLast Checked: '+checkedTimeET(checkedAt)+' ET (Daily Faceoff)'+(unknown.length?'\n❔ Unknown or unavailable sources were not counted as confirmed.':'');
}

export default {
 async scheduled(_event,env,ctx){ctx.waitUntil(tick(env).catch(e=>console.error('Monitor failed',String(e))))},
 async fetch(req,env,ctx){const u=new URL(req.url);
  if(u.pathname==='/health')return Response.json({ok:true,service:'NHL Telegram DEV'});
  if(u.pathname.startsWith('/account/'))return accountAPI(req,env,u.pathname);
  if(u.pathname==='/telegram'&&req.method==='POST'){
   if(!env.TELEGRAM_WEBHOOK_SECRET||req.headers.get('X-Telegram-Bot-Api-Secret-Token')!==env.TELEGRAM_WEBHOOK_SECRET)return new Response('Unauthorized',{status:401});
   let update;try{update=await req.json()}catch{return new Response('Bad JSON',{status:400})}
   const m=update?.message;if(m?.chat?.type!=='private'||typeof m.text!=='string')return new Response('OK');
   const chat=String(m.chat.id);
   const link=m.text.trim().match(/^\/?(?:start|link)\s+([a-f0-9]{32})$/i);
   if(link){
    ctx.waitUntil(linkChat(env,chat,link[1]).then(reply=>telegram(env,chat,reply)).catch(e=>console.error('Link failed',String(e))));
    return new Response('OK');
   }
   const linked=await env.DB.prepare('SELECT account_key FROM telegram_accounts WHERE chat_id=?').bind(chat).first();
   if(!linked&&!chats(env).includes(chat))return new Response('OK');
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
