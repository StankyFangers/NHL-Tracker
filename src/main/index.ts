import { app, BrowserWindow, ipcMain, Notification, shell, dialog } from 'electron'
import { join } from 'path'
import { writeFile } from 'fs/promises'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

const NHL = 'https://api-web.nhle.com/v1'

const DFO_TEAM_SLUGS:Record<string,string>={
 ANA:'anaheim-ducks',BOS:'boston-bruins',BUF:'buffalo-sabres',CAR:'carolina-hurricanes',CBJ:'columbus-blue-jackets',
 CGY:'calgary-flames',CHI:'chicago-blackhawks',COL:'colorado-avalanche',DAL:'dallas-stars',DET:'detroit-red-wings',
 EDM:'edmonton-oilers',FLA:'florida-panthers',LAK:'los-angeles-kings',MIN:'minnesota-wild',MTL:'montreal-canadiens',
 NJD:'new-jersey-devils',NSH:'nashville-predators',NYI:'new-york-islanders',NYR:'new-york-rangers',OTT:'ottawa-senators',
 PHI:'philadelphia-flyers',PIT:'pittsburgh-penguins',SEA:'seattle-kraken',SJS:'san-jose-sharks',STL:'st-louis-blues',
 TBL:'tampa-bay-lightning',TOR:'toronto-maple-leafs',UTA:'utah-mammoth',VAN:'vancouver-canucks',VGK:'vegas-golden-knights',
 WPG:'winnipeg-jets',WSH:'washington-capitals'
}
const htmlText=(s:string)=>s.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&#x27;|&#39;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim()
const section=(html:string,start:string,end:string)=>{const a=html.search(new RegExp(start,'i'));if(a<0)return'';const rest=html.slice(a);const b=rest.search(new RegExp(end,'i'));return b>0?rest.slice(0,b):rest}
const linkedNames=(html:string)=>[...html.matchAll(/<a[^>]+href=["'][^"']*\/players\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m=>htmlText(m[1])).filter(Boolean)
function parseDfoLinePage(html:string,team:string,url:string){
 const plain=htmlText(html)
 const updated=(plain.match(/Last updated:\s*(.+?)\s+Source:/i)?.[1]||'').trim()
  const sourceMatch=html.match(new RegExp('Source:[\\s\\S]{0,500}?<a[^>]*href=["\\\']([^"\\\']+)["\\\'][^>]*>([\\s\\S]*?)<\\/a>','i'))
 const source=sourceMatch?htmlText(sourceMatch[2]):(plain.match(/Source:\s*([^|]+?)(?:Team News|Show Jerseys|Last 10 Games Stats|Season Stats|Cap|Share)/i)?.[1]||'Daily Faceoff').trim()
  const sourceUrl=sourceMatch?(sourceMatch[1].startsWith('http')?sourceMatch[1]:'https://www.dailyfaceoff.com'+sourceMatch[1]):''
 const forwards=linkedNames(section(html,'>Forwards<|Forwards','Defensive Pairings')).slice(0,12)
 const defense=linkedNames(section(html,'Defensive Pairings','1st Powerplay Unit|1st Power Play Unit')).slice(0,6)
 const pp1=linkedNames(section(html,'1st Powerplay Unit|1st Power Play Unit','2nd Powerplay Unit|2nd Power Play Unit')).slice(0,5)
 const pp2=linkedNames(section(html,'2nd Powerplay Unit|2nd Power Play Unit','1st Penalty Kill Unit')).slice(0,5)
 // Goalies are listed separately from the skater lines. Do not infer 'confirmed' from ordering.
 const goalieSection=section(html,'>Goalies<|Goalies','>Injuries<|Injuries|Badges:|Team Sites')
 const goalieNames=linkedNames(goalieSection).slice(0,4)
 const goalieStatus=/\bconfirmed\b/i.test(htmlText(goalieSection))?'CONFIRMED':/\bprojected|expected\b/i.test(htmlText(goalieSection))?'PROJECTED':'UNKNOWN'
 const injuriesText=section(html,'>Injuries<|Injuries','Badges:|Team Sites'),injuries:[string,string][]=[]
 for(const status of ['out','dtd','ir']){const rx=new RegExp(status+'[\\\\s\\\\S]{0,700}?<a[^>]+href="[^"]*/players/[^"]*"[^>]*>([\\\\s\\\\S]*?)</a>','ig');for(const m of injuriesText.matchAll(rx))injuries.push([htmlText(m[1]),status.toUpperCase()])}
 const rows=<T>(xs:T[],n:number)=>Array.from({length:Math.ceil(xs.length/n)},(_,i)=>xs.slice(i*n,(i+1)*n))
 return {team,url,updatedAt:updated,source,sourceUrl,checkedAt:new Date().toISOString(),forwardLines:rows(forwards,3),defensePairs:rows(defense,2),pp1,pp2,injuries,goalies:goalieNames,goalieStatus}
}
async function dfoLines(team:string){
 const key=String(team||'').toUpperCase(),slug=DFO_TEAM_SLUGS[key];if(!slug)throw new Error('No Daily Faceoff team mapping for '+key)
 const url='https://www.dailyfaceoff.com/teams/'+slug+'/line-combinations',response=await fetch(url,{headers:{'User-Agent':'NHL-Tracker/1.7.2-dev','Accept':'text/html,application/xhtml+xml'},cache:'no-store'})
 if(!response.ok)throw new Error('Daily Faceoff request failed: '+response.status+' '+response.statusText)
 return parseDfoLinePage(await response.text(),key,url)
}
const playerNameKey=(s:string)=>String(s||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'')
async function dfoPlayerStats(team:string,names:string[]){
 const [roster,club]=await Promise.all([nhlJson('/roster/'+encodeURIComponent(team)+'/current'),nhlJson('/club-stats/'+encodeURIComponent(team)+'/now')])
 const rosterPlayers=[...(roster?.forwards||[]),...(roster?.defensemen||[]),...(roster?.goalies||[])];const byName=new Map<string,any>()
 for(const p of rosterPlayers){const full=[p?.firstName?.default,p?.lastName?.default].filter(Boolean).join(' ');if(full)byName.set(playerNameKey(full),p)}
 const skaters=[...(club?.skaters||[]),...(club?.forwards||[]),...(club?.defensemen||[])];const seasonById=new Map<number,any>();for(const p of skaters){const id=Number(p?.playerId||p?.id||0);if(id)seasonById.set(id,p)}
 const out:Record<string,any>={}
 await Promise.all((names||[]).map(async display=>{const p=byName.get(playerNameKey(display));const id=Number(p?.id||p?.playerId||0);if(!id)return;const season=seasonById.get(id)||{};let log:any={};try{log=await nhlJson('/player/'+id+'/game-log/now')}catch{}const allGames=(log?.gameLog||log?.games||[]);const games=allGames.slice(0,10);const sum=(k:string,alts:string[]=[])=>games.reduce((n:number,g:any)=>n+Number(g?.[k]??alts.map(x=>g?.[x]).find(v=>v!=null)??0),0);const g=sum('goals'),aa=sum('assists'),sog=sum('shots',['shotsOnGoal','sog']);const toSeconds=(v:any):number|null=>{
  if(typeof v==='number'&&Number.isFinite(v)&&v>0)return v;
  if(typeof v!=='string'||!/^\d+:\d{2}(?::\d{2})?$/.test(v.trim()))return null;
  const parts=v.trim().split(':').map(Number);
  return parts.length===3?parts[0]*3600+parts[1]*60+parts[2]:parts[0]*60+parts[1];
 };
 const times=allGames.map((g:any)=>toSeconds(g?.toi??g?.timeOnIce??g?.timeOnIcePerGame)).filter((v:any):v is number=>v!=null&&v>0);
 const avgSeconds=times.length?Math.round(times.reduce((a:number,b:number)=>a+b,0)/times.length):null;
 const averageToi=avgSeconds!=null?`${Math.floor(avgSeconds/60)}:${String(avgSeconds%60).padStart(2,'0')}`:null;
 out[String(display).toLowerCase()]={averageToi,playerId:id,l10:{g,a:aa,p:g+aa,sog},season:{g:Number(season?.goals||0),a:Number(season?.assists||0),p:Number(season?.points??Number(season?.goals||0)+Number(season?.assists||0)),sog:Number(season?.shots??season?.shotsOnGoal??season?.sog??0)}}}))
 return out
}
async function goalieAverageToi(team:string,names:string[]){
 const [roster,club]=await Promise.all([nhlJson('/roster/'+encodeURIComponent(team)+'/current'),nhlJson('/club-stats/'+encodeURIComponent(team)+'/now')]);
 const goalies=roster?.goalies||[];const season=club?.goalies||[];
 const result:Record<string,{averageToi:string,games:number}>={};
 for(const display of names){const p=goalies.find((g:any)=>playerNameKey([g?.firstName?.default,g?.lastName?.default].filter(Boolean).join(' '))===playerNameKey(display));if(!p)continue;
 const stats=season.find((g:any)=>Number(g.playerId||g.id)===Number(p.id||p.playerId));if(!stats)continue;
 const games=Number(stats.gamesPlayed||0);
 const raw=stats.timeOnIce||stats.toi||stats.totalTimeOnIce;
 let seconds=NaN;
 if(typeof raw==='number')seconds=raw;
 else if(typeof raw==='string'&&/^\d+:\d{2}(?::\d{2})?$/.test(raw)){
  const parts=raw.split(':').map(Number);seconds=parts.length===3?parts[0]*3600+parts[1]*60+parts[2]:parts[0]*60+parts[1];
 }
 if(!games||!Number.isFinite(seconds)||seconds<=0)continue;
 const avg=Math.round(seconds/games);result[display.toLowerCase()]={averageToi:`${Math.floor(avg/60)}:${String(avg%60).padStart(2,'0')}`,games};
 }
 return result;
}
async function nhlJson(path: string) {
  const response = await fetch(`${NHL}${path}`, {
    headers: { 'User-Agent': 'NHL-Tracker/1.0.0', Accept: 'application/json' },
    cache: 'no-store'
  })
  if (!response.ok) throw new Error(`NHL request failed: ${response.status} ${response.statusText}`)
  return response.json()
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#0b1017',
    title: is.dev ? 'NHL Tracker Dev' : 'NHL Tracker',
    icon: is.dev ? join(process.cwd(), 'resources/money-puck.png') : join(process.resourcesPath, 'money-puck.png'),
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
  })
  mainWindow.setMenuBarVisibility(false)
  mainWindow.maximize()
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId(is.dev ? 'com.nhltracker.app.dev' : 'com.nhltracker.app')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  ipcMain.handle('app:saveLineComboPdf',async (_event,payload:{slateDate?:string;title:string;subtitle:string;lines:string[]})=>{
    const {filePath,canceled}=await dialog.showSaveDialog({title:'Save Daily Line Combo PDF',defaultPath:join(app.getPath('downloads'),`NHL Combos - ${/^\d{4}-\d{2}-\d{2}$/.test(payload?.slateDate||'')?payload.slateDate:new Date().toISOString().slice(0,10)}.pdf`),filters:[{name:'PDF',extensions:['pdf']}]})
    if(canceled||!filePath)return {cancelled:true}
    const escapeHtml=(value:string)=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    const lines=Array.isArray(payload?.lines)?payload.lines.slice(0,300).map(x=>String(x).slice(0,600)):[]
    const html=`<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4;margin:18mm 14mm}body{font:11px Arial,sans-serif;color:#152034}h1{font-size:18px;margin:0 0 7px}h2{font-size:10px;color:#777;margin:0 0 25px}.entry{line-height:1.6;margin:0 0 18px;break-inside:avoid;white-space:nowrap;font-size:11px}.matchupHeading{font-size:13px;font-weight:700;text-align:center;margin:20px 0 12px;break-after:avoid}</style></head><body><h1>${escapeHtml(payload.title)}</h1><h2>${escapeHtml(payload.subtitle)}</h2>${lines.map(line=>/^\s*[A-Z]{2,3}\s+@\s+[A-Z]{2,3}\s+[—-]/.test(line)?`<div class="matchupHeading">${escapeHtml(line)}</div>`:`<div class="entry">${escapeHtml(line)}</div>`).join('')}<script>document.querySelectorAll('.entry').forEach(el=>{let size=11;while(el.scrollWidth>el.clientWidth&&size>5.5){size-=0.25;el.style.fontSize=size+'px'}})</script></body></html>`
    const pdfWindow=new BrowserWindow({show:false,width:1100,height:800,webPreferences:{sandbox:true}})
    try{
      await pdfWindow.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html))
      const pdf=await pdfWindow.webContents.printToPDF({printBackground:true,pageSize:'A4'})
      await writeFile(filePath,pdf)
      return {saved:true}
    }catch(e){return {error:String(e)}}finally{if(!pdfWindow.isDestroyed())pdfWindow.destroy()}
  })
  ipcMain.handle('nhl:score', async (_e, date?: string) => nhlJson(date ? `/score/${date}` : '/score/now'))
  ipcMain.handle('nhl:pbp', async (_e, gameId: number) => nhlJson(`/gamecenter/${gameId}/play-by-play`))
  ipcMain.handle('nhl:landing', async (_e, gameId: number) => nhlJson(`/gamecenter/${gameId}/landing`))
  ipcMain.handle('nhl:shiftcharts', async (_e, gameId: number) => {
    if (!Number.isSafeInteger(gameId) || gameId <= 0) throw new Error('Invalid NHL game ID')
    const url = `https://api.nhle.com/stats/rest/en/shiftcharts?cayenneExp=${encodeURIComponent('gameId='+gameId)}`
    const response = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' })
    if (!response.ok) throw new Error(`NHL shiftcharts failed: ${response.status}`)
    return response.json()
  })
  ipcMain.handle('nhl:boxscore', async (_e, gameId: number) => nhlJson(`/gamecenter/${gameId}/boxscore`))
  ipcMain.handle('nhl:roster', async (_e, team: string) => nhlJson(`/roster/${encodeURIComponent(team)}/current`))
  ipcMain.handle('nhl:playerSearch', async (_e, query: string) => {
    const q=String(query||'').trim()
    if(q.length<3||q.length>80||!/^[\p{L}\p{M} .'-]+$/u.test(q)) throw new Error('Enter a valid player name (3–80 characters)')
    const url=`https://search.d3.nhle.com/api/v1/search/player?culture=en-us&limit=30&q=${encodeURIComponent(q)}`
    const response=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)})
    if(!response.ok)throw new Error(`NHL player search failed: ${response.status}`)
    const data=await response.json()
    return (Array.isArray(data)?data:[]).map((p:any)=>({id:Number(p.playerId||p.id),name:String(p.name||p.nameInEnglish||''),team:String(p.teamAbbrev||p.team||'').toUpperCase()})).filter((p:any)=>Number.isSafeInteger(p.id)&&p.id>0&&p.name).slice(0,30)
  })
  // Optional DEV-only registry snapshot. Token remains in Electron main process,
  // never exposed to renderer/localStorage. No endpoint or token configuration = local fallback.
  // DEV accounts: credentials sent via Electron IPC to this main-process HTTPS client.
  // Tokens are kept in memory only and never written to disk or localStorage.
  // Fail closed: the existing authentication and wager APIs target the TEST Neon branch.
  // Never allow a packaged LIVE executable to access TEST account data.
  const testEnvironment = !app.isPackaged
  let devAccountToken = ''
  ipcMain.handle('dev-account:request', async (_e, payload: {action:string;username?:string;email?:string;login?:string;password?:string;setupKey?:string}) => {
    if (!testEnvironment) return {error:'LIVE cloud accounts are not configured yet. Your LIVE wagers remain local; TEST database access is blocked.'}
    const action=String(payload?.action||'')
    if(!['register','login','logout','me','bootstrap_dev','rename_self'].includes(action))return {error:'Invalid account action'}
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000)
    try {
      const response=await fetch('https://nhl-tracker-vercel-api.vercel.app/api/account',{
        method:action==='me'?'GET':'POST',cache:'no-store',signal:controller.signal,
        headers:{'Content-Type':'application/json',...(devAccountToken?{Authorization:`Bearer ${devAccountToken}`}:{})},
        ...(action==='me'?{}:{body:JSON.stringify(payload)})
      })
      const data:any=await response.json()
      if(!response.ok){if(response.status===401&&action==='me')devAccountToken='';return {error:String(data?.error||`Account service: ${response.status}`)}}
      if(action==='logout')devAccountToken=''
      if((action==='login'||action==='register'||action==='bootstrap_dev')&&typeof data.token==='string')devAccountToken=data.token
      return {account:data.account||null}
    }catch(error:any){return {error:'DEV account service unavailable: '+String(error?.message||error)}}
    finally{clearTimeout(timeout)}
  })
  // LIVE auth is independent from the TEST account endpoint. Tokens stay in main-process memory.
  let liveAccountToken = ''
  ipcMain.handle('live-account:request', async (_e, payload: {action:string;username?:string;email?:string;login?:string;password?:string}) => {
    if (testEnvironment) return {error:'LIVE accounts are unavailable in TEST mode'}
    const action=String(payload?.action||'')
    if (!['login','register','logout','me'].includes(action)) return {error:'Invalid LIVE account action'}
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000)
    try {
      const response=await fetch('https://nhl-tracker-vercel-api.vercel.app/api/live-account',{
        method:action==='me'?'GET':'POST',cache:'no-store',signal:controller.signal,
        headers:{'Content-Type':'application/json',...(liveAccountToken?{Authorization:`Bearer ${liveAccountToken}`}:{})},
        ...(action==='me'?{}:{body:JSON.stringify(payload)})
      })
      const data:any=await response.json()
      if(!response.ok)return {error:String(data?.error||`LIVE account service: ${response.status}`)}
      if(action==='logout')liveAccountToken=''
      if((action==='login'||action==='register')&&typeof data.token==='string')liveAccountToken=data.token
      return {account:data.account||null}
    }catch(e:any){return {error:'LIVE account service unavailable: '+String(e?.message||e)}}
    finally{clearTimeout(timeout)}
  })
  // Phase 2H: LIVE wager transport only. This deliberately does NOT mount cloud
  // wagers into the renderer, migrate local history, or run background sync.
  // Authentication token never leaves Electron's main process.
  // Separate LIVE player registry transport; LIVE auth token stays in main process.
  ipcMain.handle('live-players:request', async (_e, request: {method:'GET'|'POST';id?:number;name?:string;team?:string}) => {
    if(testEnvironment)return {error:'LIVE player registry unavailable in TEST'}
    if(!liveAccountToken)return {error:'Sign in to LIVE first'}
    const method=request?.method
    if(method!=='GET'&&method!=='POST')return {error:'Unsupported player operation'}
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000)
    try{
      const response=await fetch('https://nhl-tracker-vercel-api.vercel.app/api/live-players',{
        method,cache:'no-store',signal:controller.signal,
        headers:{Authorization:`Bearer ${liveAccountToken}`,Accept:'application/json',...(method==='POST'?{'Content-Type':'application/json'}:{})},
        ...(method==='POST'?{body:JSON.stringify({id:request.id,name:request.name,team:request.team})}:{})
      })
      const data:any=await response.json()
      return response.ok?data:{error:String(data.error||`Player service: ${response.status}`)}
    }catch(e:any){return {error:'Player registry unavailable: '+String(e?.message||e)}}
    finally{clearTimeout(timeout)}
  })
  // LIVE wager transport: authenticated, account-scoped requests only.
  // Production mutations remain independently gated by NHL_LIVE_WAGER_WRITES_ENABLED
  // on the server. The renderer must explicitly handle 409 conflicts.
  ipcMain.handle('live-wagers:request', async (_e, request: {method:string;limit?:number;cursor?:string;id?:string;expectedUpdatedAt?:string;wager?:unknown;source?:string;sourceExternalId?:string|null}) => {
    if (testEnvironment) return {error:'LIVE wagers are unavailable in TEST mode'}
    if (!liveAccountToken) return {error:'Sign in to LIVE before requesting cloud wagers'}
    if (!request || typeof request!=='object' || Array.isArray(request)) return {error:'Invalid LIVE wager request'}
    const method=String(request.method||'')
    if (!['GET','POST','PATCH','DELETE'].includes(method)) return {error:'Invalid LIVE wager operation'}
    const allowed=method==='GET'?['method','limit','cursor']:method==='POST'?['method','wager','source','sourceExternalId']:method==='PATCH'?['method','id','expectedUpdatedAt','wager']:['method','id','expectedUpdatedAt']
    if (Object.keys(request).some(k=>!allowed.includes(k))) return {error:'Unsupported LIVE wager request fields'}
    const validId=(v:unknown)=>typeof v==='string'&&v.length>=1&&v.length<=150
    const validWager=(v:unknown):v is {id:string;date:string;legs:unknown[]}=>!!v&&typeof v==='object'&&!Array.isArray(v)&&validId((v as any).id)&&typeof (v as any).date==='string'&&/^\\d{4}-\\d{2}-\\d{2}$/.test((v as any).date)&&Array.isArray((v as any).legs)&&(v as any).legs.length<=12
    const payload:Record<string,unknown>={}
    if (method==='POST'||method==='PATCH') {
      if (!validWager(request.wager)) return {error:'Invalid LIVE wager'}
      payload.wager=request.wager
    }
    if (method==='POST') {
      if (request.source!==undefined&&!['manual','kalshi','import'].includes(request.source)) return {error:'Invalid wager source'}
      if (request.sourceExternalId!==undefined&&request.sourceExternalId!==null&&(typeof request.sourceExternalId!=='string'||request.sourceExternalId.length<1||request.sourceExternalId.length>250)) return {error:'Invalid external wager ID'}
      payload.source=request.source||'manual'
      payload.sourceExternalId=request.sourceExternalId??null
    }
    if (method==='PATCH'||method==='DELETE') {
      if (!validId(request.id)||typeof request.expectedUpdatedAt!=='string'||!/^\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d(?:\\.\\d+)?Z$/.test(request.expectedUpdatedAt)||!Number.isFinite(Date.parse(request.expectedUpdatedAt))) return {error:'Invalid wager revision'}
      if (method==='PATCH'&&request.wager?.['id']!==request.id) return {error:'Cannot change wager ID'}
      payload.id=request.id
      payload.expectedUpdatedAt=request.expectedUpdatedAt
    }
    const limit=Number.isInteger(request.limit)?Math.max(1,Math.min(200,Number(request.limit))):100
    const cursor=typeof request.cursor==='string'?request.cursor:''
    if (method==='GET'&&cursor.length>150) return {error:'Invalid LIVE wager cursor'}
    const body=method==='GET'?undefined:JSON.stringify(payload)
    if (body&&Buffer.byteLength(body)>256*1024) return {error:'LIVE wager request exceeds size limit'}
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000)
    try {
      const url=new URL('https://nhl-tracker-vercel-api.vercel.app/api/live-wagers')
      if (method==='GET') {
        url.searchParams.set('limit',String(limit))
        if (cursor) url.searchParams.set('cursor',cursor)
      }
      const response=await fetch(url.toString(),{
        method,cache:'no-store',signal:controller.signal,
        headers:{Accept:'application/json',Authorization:`Bearer ${liveAccountToken}`,...(body?{'Content-Type':'application/json'}:{})},
        ...(body?{body}:{})
      })
      const data:any=await response.json()
      if (!response.ok) {
        if(response.status===401) liveAccountToken=''
        return {error:String(data?.error||`LIVE wager service: ${response.status}`),status:response.status}
      }
      if(method==='GET') {
        if (!Array.isArray(data?.wagers) || !(data.nextCursor===null || typeof data.nextCursor==='string'))
          return {error:'LIVE wager service returned an invalid response'}
        return {wagers:data.wagers,nextCursor:data.nextCursor}
      }
      if(data?.ok!==true||typeof data.id!=='string') return {error:'LIVE wager service returned an invalid mutation response'}
      return data
    } catch(e:any) {return {error:'LIVE wager service unavailable: '+String(e?.message||e)}}
    finally {clearTimeout(timeout)}
  })
  ipcMain.handle('dev-bets:request', async (_e, request: {method:string;bets?:unknown[];revision?:number;confirm?:string}) => {
    if (!testEnvironment) return {error:'TEST database is unavailable in LIVE mode'}
    if (!devAccountToken) return {error:'Sign in to DEV before syncing bets'}
    const method=String(request?.method||'')
    if(!['GET','PUT','DELETE'].includes(method))return {error:'Invalid DEV bet operation'}
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000)
    try {
      const response=await fetch('https://nhl-tracker-vercel-api.vercel.app/api/dev-bets',{
        method,cache:'no-store',signal:controller.signal,
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${devAccountToken}`,...(method==='DELETE'?{'X-Dev-Confirm':String(request.confirm||'')}:{})},
        ...(method==='PUT'?{body:JSON.stringify({bets:request.bets,revision:request.revision})}:{})
      })
      const data:any=await response.json()
      return response.ok?data:{error:String(data.error||`DEV bet service: ${response.status}`),revision:data.revision}
    }catch(e:any){return {error:'DEV bet server unavailable: '+String(e?.message||e)}}
    finally{clearTimeout(timeout)}
  })
  ipcMain.handle('registry:players', async () => {
    const token = process.env.NHL_READ_TOKEN
    if (!token || token.length < 32) return { available:false, players:[] }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    try {
      const response = await fetch('https://nhl-tracker-vercel-api.vercel.app/api/players', {
        headers: { Authorization: `Bearer ${token}`, Accept:'application/json' },
        signal:controller.signal, cache:'no-store'
      })
      if (!response.ok) throw new Error(`Registry request failed: ${response.status}`)
      const body:any = await response.json()
      if (body?.environment !== 'development' || body?.readOnly !== true ||
          !Array.isArray(body?.players) || body.players.length > 3000)
        throw new Error('Unexpected registry response')
      return { available:true, players:body.players }
    } catch (error:any) {
      console.warn('DEV player registry unavailable; keeping local cache:',error?.message)
      return { available:false, players:[] }
    } finally { clearTimeout(timeout) }
  })

  ipcMain.handle('nhl:standings', async () => nhlJson('/standings/now'))
  ipcMain.handle('nhl:clubStats', async (_e, team: string) => nhlJson(`/club-stats/${encodeURIComponent(team)}/now`))
  ipcMain.handle('dfo:lines', async (_e, team: string) => dfoLines(team))
  ipcMain.handle('dfo:playerStats', async (_e, team: string, names: string[]) => dfoPlayerStats(team,names))
  ipcMain.handle('dfo:goalieToi', async (_e, team: string, names: string[]) => goalieAverageToi(team,names))
  ipcMain.handle('app:notify', async (_e, payload: { title: string; body: string }) => { if (Notification.isSupported()) new Notification({ title: payload.title, body: payload.body, silent: true }).show(); return true })
  ipcMain.handle('app:updateInfo', async () => {
    const installedVersion = app.getVersion()
    try {
      const response = await fetch('https://api.github.com/repos/StankyFangers/NHL-Tracker/releases/latest', {
        headers: { 'User-Agent': `NHL-Tracker/${installedVersion}`, Accept: 'application/vnd.github+json' },
        cache: 'no-store'
      })
      if (response.status === 404) return { status: 'NO_RELEASE', installedVersion }
      if (!response.ok) throw new Error(`GitHub request failed: ${response.status} ${response.statusText}`)
      const release:any = await response.json()
      return { status: 'OK', installedVersion, latestVersion: String(release?.tag_name || '').replace(/^v/i,''), releaseUrl: release?.html_url || 'https://github.com/StankyFangers/NHL-Tracker/releases', releaseName: release?.name || release?.tag_name || '' }
    } catch (error:any) {
      return { status: 'ERROR', installedVersion, message: error?.message || 'Unable to check GitHub releases.' }
    }
  })
  ipcMain.handle('app:openUpdateUrl', async (_e, url: string) => {
    const target = String(url || '')
    if (!/^https:\/\/github\.com\/StankyFangers\/NHL-Tracker(?:\/|$)/i.test(target)) throw new Error('Blocked update URL')
    await shell.openExternal(target)
    return true
  })

  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
