import {useEffect,useMemo,useState,type ChangeEvent} from 'react'
import {RESEARCH_PROFILES,RULES,RULE_NAMES,analyzeProfile,analyzeFlatOne,parseResearchImport,type ResearchCombo,type ResearchProfile} from './comboResearchModel'
import './comboResearch.css'
import {overlaySettledWagerOdds} from './comboResearchPrices'
const STORE='nhlTracker:research:preview:v1'
const API_KEY='nhlTracker:research:apiUrl:v1'
const money=(n:number)=>`${n>=0?'+':''}${n.toFixed(2)}u`
const readLocal=():ResearchCombo[]=>{try{return JSON.parse(localStorage.getItem(STORE)||'[]')}catch{return[]}}
const unique=(rows:ResearchCombo[])=>[...new Map(rows.map(r=>[r.id,r])).values()]
export default function ComboResearchCenter({unitSize}:{unitSize:number}){
 const [rows,setRows]=useState<ResearchCombo[]>(readLocal)
 const [section,setSection]=useState<'EXPLORER'|'STRATEGIES'|'STATUS'>('EXPLORER')
 const [profile,setProfile]=useState<ResearchProfile>('450')
 const [start,setStart]=useState(''),[end,setEnd]=useState('')
 const [team,setTeam]=useState('ALL'),[pp,setPp]=useState('ALL'),[fl,setFl]=useState('ALL'),[size,setSize]=useState('ALL'),[venue,setVenue]=useState('ALL')
 const [gaa,setGaa]=useState('ALL'),[diff,setDiff]=useState('ALL'),[view,setView]=useState('HIT')
 const [offenseMin,setOffenseMin]=useState(''),[opponentGAMin,setOpponentGAMin]=useState(''),[opponentXGMin,setOpponentXGMin]=useState(''),[opponentPKMax,setOpponentPKMax]=useState(''),[message,setMessage]=useState('')
 const [apiUrl,setApiUrl]=useState(()=>localStorage.getItem(API_KEY)||String(import.meta.env.VITE_COMBO_RESEARCH_URL||''))
 const [loading,setLoading]=useState(false)
 const [cloudStatus,setCloudStatus]=useState<{counts?:{total:number;graded:number;games:number};check?:{checked_at:string;games_checked:number;combos_graded:number};captures?:{game_date:string;team:string;capture_status:string;lineup_status:string;combo_count:number;captured_at:string;error?:string}[]}|null>(null)
 const [statusError,setStatusError]=useState('')
 const refreshCloudStatus=async()=>{
  if(!apiUrl.trim()){setStatusError('Enter the cloud URL before checking status.');return}
  try{
   const res=await fetch(new URL('/research/status',apiUrl).toString())
   if(!res.ok)throw new Error('HTTP '+res.status)
   setCloudStatus(await res.json());setStatusError('')
  }catch(err){setStatusError(String(err));setCloudStatus(null)}
 }
 const teams=useMemo(()=>[...new Set(rows.map(r=>r.team))].sort(),[rows])
 const filtered=useMemo(()=>rows.filter(r=>{
  if(start&&r.date<start||end&&r.date>end)return false
  if(team!=='ALL'&&r.team!==team)return false
  if(pp!=='ALL'&&r.ppUnit!==Number(pp))return false
  if(fl!=='ALL'&&r.forwardLine!==Number(fl))return false
  if(size!=='ALL'&&r.players.length!==Number(size))return false
  if(venue!=='ALL'&&r.venue!==venue)return false
  if(gaa!=='ALL'){
   const n=r.goalieGaa
   if(n==null||!(gaa==='LOW'?n<2.5:gaa==='MID'?n>=2.5&&n<=3.25:n>3.25))return false
  }
  if(diff!=='ALL'){
   const n=r.goalieDifferential
   if(n==null||!(diff==='NEG'?n<0:diff==='EVEN'?n>=0&&n<=.5:n>.5))return false
  }
  const matchMin=(k:string,v:string)=>!v||(typeof r.context?.[k]==='number'&&Number(r.context[k])>=Number(v))
  const matchMax=(k:string,v:string)=>!v||(typeof r.context?.[k]==='number'&&Number(r.context[k])<=Number(v))
  return matchMin('goalsForPerGame',offenseMin)&&matchMin('opponentGoalsAllowedPerGame',opponentGAMin)&&matchMin('opponentXGAllowedPerGame',opponentXGMin)&&matchMax('opponentPKPct',opponentPKMax)
 }),[rows,start,end,team,pp,fl,size,venue,gaa,diff,offenseMin,opponentGAMin,opponentXGMin,opponentPKMax])
 const graded=filtered.filter(r=>r.result!=='UNVERIFIED'),wins=graded.filter(r=>r.result==='HIT').length
 const summary=[{profile:'Flat 1u',...analyzeFlatOne(filtered)},...RESEARCH_PROFILES.map(p=>({profile:p,...analyzeProfile(filtered,p)}))]
 const totalGames=new Set(filtered.map(r=>r.gameId||r.date+':'+r.matchup)).size
 const sync=async()=>{
  if(!apiUrl.trim()){setMessage('Set a research API URL in Collection Status first.');setSection('STATUS');return}
  setLoading(true);setMessage('')
  try{
   const url=new URL('/research/combos',apiUrl);url.searchParams.set('limit','10000')
   const res=await fetch(url.toString());if(!res.ok)throw new Error('Cloud API HTTP '+res.status)
   const json=await res.json();const imported=parseResearchImport(json)
   setRows(old=>{const previous=new Map(old.map(row=>[row.id,row]));const merged=imported.rows.map(row=>({...row,odds:previous.get(row.id)?.odds??row.odds}));return unique([...old,...merged])}) // Cloud grades refresh in memory; local private odds overlays remain intact.
   setMessage(`Cloud sync: ${imported.rows.length} rows received; ${imported.invalid} invalid rows excluded.`)
   void refreshCloudStatus()
  }catch(e){setMessage('Cloud sync unavailable: '+String(e))}
  finally{setLoading(false)}
 }
 const importWagerPrices=async(e:ChangeEvent<HTMLInputElement>)=>{
  const input=e.target,file=input.files?.[0];if(!file)return
  try{
   if(!rows.length)throw Error('Import Combo Logger records first, then overlay wager prices.')
   const result=await overlaySettledWagerOdds(file,rows)
   setRows(result.rows);localStorage.setItem(STORE,JSON.stringify(result.rows))
   setMessage(`Local wager-price overlay: ${result.matchedCount} uniquely priced combos; ${result.ambiguous} ambiguous; ${result.invalid} unmatched or invalid wagers. The XLSX file was never uploaded.`)
  }catch(err){setMessage('Price overlay failed: '+String(err))}
  input.value=''
 }
 const importFile=async(e:ChangeEvent<HTMLInputElement>)=>{
  const input=e.target;const file=input.files?.[0];if(!file)return
  try{
   const parsed=parseResearchImport(JSON.parse(await file.text()))
   if(!parsed.rows.length)throw new Error('No valid normalized research rows found.')
   const next=unique([...rows,...parsed.rows]);setRows(next);localStorage.setItem(STORE,JSON.stringify(next))
   setMessage(`Imported ${parsed.rows.length} records (${parsed.invalid} invalid). ${next.length} distinct records in local DEV preview.`)
  }catch(err){setMessage('Import failed: '+String(err))}
  input.value=''
 }
 useEffect(()=>{if(apiUrl.trim())localStorage.setItem(API_KEY,apiUrl.trim());else localStorage.removeItem(API_KEY)},[apiUrl])
 const header=<div className="researchHeader"><div><small>COMBO RESEARCH · CLOUD PREVIEW</small><h1>Combo History & Strategy Center</h1><p>Pregame lineup snapshots → intact combos → verified results. Shared research stays separate from private bets.</p></div><button onClick={()=>void sync()} disabled={loading}>{loading?'SYNCING…':'↻ SYNC CLOUD'}</button></div>
 return <main className="researchRoot">{header}
  <div className="researchNav">{(['EXPLORER','STRATEGIES','STATUS'] as const).map(x=><button key={x} className={section===x?'on':''} onClick={()=>setSection(x)}>{x==='EXPLORER'?'HIT RATE EXPLORER':x==='STRATEGIES'?'STRATEGY PERFORMANCE':'COLLECTION STATUS'}</button>)}</div>
  {message&&<p className="researchNotice" role="status">{message}</p>}
  <div className="researchMetrics"><div><small>COMBOS FILTERED</small><strong>{filtered.length}</strong></div><div><small>GRADED</small><strong>{graded.length}</strong></div><div><small>HIT RATE</small><strong>{graded.length?(wins/graded.length*100).toFixed(1)+'%':'—'}</strong></div><div><small>DISTINCT GAMES</small><strong>{totalGames}</strong></div></div>
  {section==='STATUS'?<div className="researchCard"><h2>Research collection status</h2><p>This DEV screen accepts normalized Combo Research records and can query the standalone research Worker. An empty screen means no research data has been imported or synced yet; no example results are invented.</p><label>RESEARCH CLOUD URL<input placeholder="https://your-research-worker.workers.dev" value={apiUrl} onChange={e=>setApiUrl(e.target.value)}/></label><p>Current preview: <strong>{rows.length}</strong> distinct research records. The production research database is not deployed by this branch.</p>
  <button type="button" onClick={()=>void refreshCloudStatus()}>CHECK CLOUD COLLECTION STATUS</button>
  {statusError&&<p role="alert" className="researchNotice">Cloud status unavailable: {statusError}</p>}
  {cloudStatus&&<div className="researchStatusPanel"><p><strong>{cloudStatus.counts?.total??0}</strong> stored combos · <strong>{cloudStatus.counts?.graded??0}</strong> graded · <strong>{cloudStatus.counts?.games??0}</strong> distinct games</p><p>Last grading check: {cloudStatus.check?.checked_at||'Not yet run'}</p><div className="researchTable"><table><thead><tr><th>Date</th><th>Team</th><th>Snapshot</th><th>Lineup</th><th>Combos</th><th>Source issue</th></tr></thead><tbody>{(cloudStatus.captures||[]).slice(0,30).map((c,i)=><tr key={c.game_date+c.team+i}><td>{c.game_date}</td><td>{c.team}</td><td>{c.capture_status}</td><td>{c.lineup_status||'UNKNOWN'}</td><td>{c.combo_count}</td><td>{c.error||'—'}</td></tr>)}</tbody></table></div></div>}<label className="researchImport">IMPORT NORMALIZED RESEARCH JSON<input type="file" accept=".json,application/json" onChange={e=>void importFile(e)}/></label><p>Accepts the original Combo Logger 0.1.0 export (rows / combo / context) or normalized research JSON. Standalone logger records include pregame lineups and results but do not contain wager prices.</p><label className="researchImport">OVERLAY ODDS FROM PRIVATE SETTLED XLSX<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e=>void importWagerPrices(e)}/></label><p>The XLSX is read only on this computer. Odds attach only to a uniquely matched game-date / player combination. Private bets and unit sizes are not shared with the research cloud.</p><button onClick={()=>{if(window.confirm('Clear only the locally cached research preview? Your Bet Hub wagers will not be changed.')){setRows([]);localStorage.removeItem(STORE);setMessage('Local research preview cleared.')}}}>CLEAR LOCAL RESEARCH PREVIEW</button></div>:<>
   <div className="researchFilters">
    <label>FROM<input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label><label>THROUGH<input type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label>
    <label>TEAM<select value={team} onChange={e=>setTeam(e.target.value)}><option value="ALL">All teams</option>{teams.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
    <label>PP UNIT<select value={pp} onChange={e=>setPp(e.target.value)}><option value="ALL">All</option><option value="1">PP1</option><option value="2">PP2</option></select></label>
    <label>FORWARD LINE<select value={fl} onChange={e=>setFl(e.target.value)}><option value="ALL">All</option>{[1,2,3,4].map(x=><option key={x} value={x}>FL{x}</option>)}</select></label>
    <label>COMBO SIZE<select value={size} onChange={e=>setSize(e.target.value)}><option value="ALL">All</option><option value="2">Duo</option><option value="3">Trio</option></select></label>
    <label>VENUE<select value={venue} onChange={e=>setVenue(e.target.value)}><option value="ALL">All</option><option value="HOME">Home</option><option value="AWAY">Away</option></select></label>
    <label>GOALIE GAA<select value={gaa} onChange={e=>setGaa(e.target.value)}><option value="ALL">All / unknown</option><option value="LOW">Below 2.50</option><option value="MID">2.50–3.25</option><option value="HIGH">Above 3.25</option></select></label><label>GOALIE DIFFERENTIAL<select value={diff} onChange={e=>setDiff(e.target.value)}><option value="ALL">All / unknown</option><option value="NEG">Below zero</option><option value="EVEN">0 to +0.5</option><option value="HIGH">Above +0.5</option></select></label>
    <button type="button" onClick={()=>{setStart('');setEnd('');setTeam('ALL');setPp('ALL');setFl('ALL');setSize('ALL');setVenue('ALL');setGaa('ALL');setDiff('ALL');setOffenseMin('');setOpponentGAMin('');setOpponentXGMin('');setOpponentPKMax('')}}>RESET</button>
   </div>
   <details className="researchCard researchMoreFilters"><summary>▸ Additional matchup ranges</summary><div className="researchFilters"><label>MIN TEAM GOALS / GAME<input type="number" step="0.1" min="0" value={offenseMin} onChange={e=>setOffenseMin(e.target.value)} placeholder="Any"/></label><label>MIN OPPONENT GOALS ALLOWED / GAME<input type="number" step="0.1" min="0" value={opponentGAMin} onChange={e=>setOpponentGAMin(e.target.value)} placeholder="Any"/></label><label>MIN OPPONENT XG ALLOWED / GAME<input type="number" step="0.1" min="0" value={opponentXGMin} onChange={e=>setOpponentXGMin(e.target.value)} placeholder="Any"/></label><label>MAX OPPONENT PK %<input type="number" step="0.5" min="0" max="100" value={opponentPKMax} onChange={e=>setOpponentPKMax(e.target.value)} placeholder="Any"/></label></div><p>Missing matchup values are excluded only when you activate their filter. Factors must have been recorded before the game.</p></details>
   {section==='EXPLORER'?<div className="researchCard"><div className="researchCardTop"><h2>Combo outcomes</h2><select aria-label="Research view" value={view} onChange={e=>setView(e.target.value)}><option value="HIT">Combo hit rate</option><option value="LIST">Individual records</option></select></div>{!rows.length?<p className="researchEmpty">No shared research records yet. Open Collection Status to import research JSON or connect the cloud API.</p>:view==='HIT'?<div className="researchTable"><table><thead><tr><th>Class</th><th>Graded</th><th>Hits</th><th>Hit %</th></tr></thead><tbody>{[1,2].flatMap(p=>[2,3].map(n=>{const x=graded.filter(r=>r.ppUnit===p&&r.players.length===n),hit=x.filter(r=>r.result==='HIT').length;return <tr key={p+'-'+n}><td>PP{p} {n===2?'Duo':'Trio'}</td><td>{x.length}</td><td>{hit}</td><td>{x.length?(100*hit/x.length).toFixed(1)+'%':'—'}</td></tr>}))}</tbody></table></div>:<div className="researchTable"><table><thead><tr><th>Game</th><th>Team</th><th>Players</th><th>FL / PP</th><th>Odds</th><th>Grade</th></tr></thead><tbody>{filtered.slice(0,250).map(r=><tr key={r.id}><td>{r.date} {r.matchup}</td><td>{r.team}</td><td>{r.players.join(' + ')}</td><td>FL{r.forwardLine??'?'} / PP{r.ppUnit??'?'}</td><td>{r.odds===null?'—':r.odds>0?'+'+r.odds:r.odds}</td><td>{r.result}</td></tr>)}</tbody></table>{filtered.length>250&&<p>Showing the first 250 records. Narrow the filters to inspect more.</p>}</div>}</div>:<>
    <div className="researchCard"><div className="researchCardTop"><div><h2>Strategy performance · date range</h2><p>Hypothetical net returns at captured pregame odds. Skipped, unpriced, and ungraded combinations never contribute invented returns.</p></div><label>PROFILE<select value={profile} onChange={e=>setProfile(e.target.value as ResearchProfile)}>{RESEARCH_PROFILES.map(x=><option key={x} value={x}>{x}u</option>)}</select></label></div><div className="researchTable"><table><thead><tr><th>Profile</th><th>Bet</th><th>Skipped</th><th>Unpriced / ungraded</th><th>Exposure</th><th>Net P/L</th><th>ROI</th><th>Daily-close DD</th></tr></thead><tbody>{summary.map(x=><tr key={x.profile} className={profile===x.profile?'researchSelected':''} onClick={()=>{if(x.profile!=='Flat 1u')setProfile(x.profile as ResearchProfile)}}><td>{x.profile}u</td><td>{x.placed}</td><td>{x.skipped}</td><td>{x.unpriced}</td><td>{x.exposure.toFixed(2)}u</td><td className={x.net>=0?'researchWin':'researchLoss'}>{money(x.net)}</td><td>{x.exposure?x.roi.toFixed(2)+'%':'—'}</td><td>{x.drawdown.toFixed(2)}u</td></tr>)}</tbody></table></div></div>
    <div className="researchCard"><h2>{profile}u · Betting reference</h2><p>Unit size: <strong>${unitSize.toFixed(2)}</strong>. Kalshi profit thresholds are calculated from the actual position cost, not just the unit size. The range below assumes the displayed stake is the position cost, before fees.</p><div className="researchTable"><table><thead><tr><th>Combo</th><th>American odds</th><th>Units</th><th>Position cost</th><th>Potential Kalshi net profit</th></tr></thead><tbody>{RULE_NAMES.map(x=>{const units=RULES[x.key][profile],cost=units*unitSize,lower=x.key.includes('101_150')?1.01:x.key.includes('151_200')?1.51:x.key.includes('101_200')?1.01:x.key.includes('HIGH')?x.key==='PP2_DUO_FL2_HIGH'||x.key==='PP2_DUO_OTHER_HIGH'?3:2:0;const upper=x.key==='PP1_DUO_101_150'?1.5:x.key==='PP1_DUO_151_200'?2:x.key==='PP1_TRIO_101_200'?2:x.key==='PP2_DUO_LOW'?3:Infinity;return <tr key={x.key}><td>{x.title}</td><td>{x.odds}</td><td>{units?units.toFixed(2)+'u':'SKIP'}</td><td>{units?'$'+cost.toFixed(2):'—'}</td><td>{!units?'—':lower>0?'$'+(cost*lower).toFixed(2)+(Number.isFinite(upper)?' – $'+(cost*upper).toFixed(2):'+'):'See actual price / cost'}</td></tr>})}</tbody></table></div><p className="researchFootnote">All seven profiles (300u–600u) use fixed version 1 historical-fit rules, not future profit guarantees.</p></div>
   </>}
  </>}
 </main>
}
