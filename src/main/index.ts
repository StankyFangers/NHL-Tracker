import { app, BrowserWindow, ipcMain, Notification, shell } from 'electron'
import { join } from 'path'
import { homedir } from 'os'
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
 const injuriesText=section(html,'>Injuries<|Injuries','Badges:|Team Sites'),injuries:[string,string][]=[]
 for(const status of ['out','dtd','ir']){const rx=new RegExp(status+'[\\\\s\\\\S]{0,700}?<a[^>]+href="[^"]*/players/[^"]*"[^>]*>([\\\\s\\\\S]*?)</a>','ig');for(const m of injuriesText.matchAll(rx))injuries.push([htmlText(m[1]),status.toUpperCase()])}
 const rows=<T>(xs:T[],n:number)=>Array.from({length:Math.ceil(xs.length/n)},(_,i)=>xs.slice(i*n,(i+1)*n))
 return {team,url,updatedAt:updated,source,sourceUrl,checkedAt:new Date().toISOString(),forwardLines:rows(forwards,3),defensePairs:rows(defense,2),pp1,pp2,injuries}
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
 await Promise.all((names||[]).map(async display=>{const p=byName.get(playerNameKey(display));const id=Number(p?.id||p?.playerId||0);if(!id)return;const season=seasonById.get(id)||{};let log:any={};try{log=await nhlJson('/player/'+id+'/game-log/now')}catch{}const games=(log?.gameLog||log?.games||[]).slice(0,10);const sum=(k:string,alts:string[]=[])=>games.reduce((n:number,g:any)=>n+Number(g?.[k]??alts.map(x=>g?.[x]).find(v=>v!=null)??0),0);const g=sum('goals'),aa=sum('assists'),sog=sum('shots',['shotsOnGoal','sog']);out[String(display).toLowerCase()]={playerId:id,l10:{g,a:aa,p:g+aa,sog},season:{g:Number(season?.goals||0),a:Number(season?.assists||0),p:Number(season?.points??Number(season?.goals||0)+Number(season?.assists||0)),sog:Number(season?.shots??season?.shotsOnGoal??season?.sog??0)}}}))
 return out
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
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId(is.dev ? 'com.nhltracker.app.dev' : 'com.nhltracker.app')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  ipcMain.handle('nhl:score', async (_e, date?: string) => nhlJson(date ? `/score/${date}` : '/score/now'))
  ipcMain.handle('nhl:pbp', async (_e, gameId: number) => nhlJson(`/gamecenter/${gameId}/play-by-play`))
  ipcMain.handle('nhl:landing', async (_e, gameId: number) => nhlJson(`/gamecenter/${gameId}/landing`))
  ipcMain.handle('nhl:boxscore', async (_e, gameId: number) => nhlJson(`/gamecenter/${gameId}/boxscore`))
  ipcMain.handle('nhl:roster', async (_e, team: string) => nhlJson(`/roster/${encodeURIComponent(team)}/current`))
  ipcMain.handle('nhl:standings', async () => nhlJson('/standings/now'))
  ipcMain.handle('nhl:clubStats', async (_e, team: string) => nhlJson(`/club-stats/${encodeURIComponent(team)}/now`))
  ipcMain.handle('dfo:lines', async (_e, team: string) => dfoLines(team))
  ipcMain.handle('dfo:playerStats', async (_e, team: string, names: string[]) => dfoPlayerStats(team,names))
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
