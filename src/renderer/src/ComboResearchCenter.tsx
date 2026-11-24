import {useEffect,useMemo,useState} from 'react'
import {RESEARCH_PROFILES,RULES,RULE_NAMES,analyzeProfile,parseResearchImport,validResearchCombo,type ResearchCombo,type ResearchProfile} from './comboResearchModel'
import './comboResearch.css'
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
 const [gaa,setGaa]=useState('ALL'),[view,setView]=useState('HIT'),[message,setMessage]=useState('')
 const [apiUrl,setApiUrl]=useState(()=>localStorage.getItem(API_KEY)||String(import.meta.env.VITE_COMBO_RESEARCH_URL||''))
 const [loading,setLoading]=useState(false)
 const teams=useMemo(()=>[...new Set(rows.map(r=>r.team))].sort(),[rows])
 const filtered=useMemo(()=>rows.filter(r=>(!start||r.date>=start)&&(!end||r.date<=end)&&(team==='ALL'||r.team===team)&&(pp==='ALL'||r.ppUnit===Number(pp))&&(fl==='ALL'||r.forwardLine===Number(fl))&&(size==='ALL'||r.players.length===Number(size))&&(venue==='ALL'||r.venue===venue)&&(gaa==='ALL'||(r.goalieGaa!==null&&(gaa==='LOW'?r.goalieGaa!<2.5:gaa==='MID'?r.goalieGaa!>=2.5&&r.goalieGaa!<=3.25:r.goalieGaa!>3.25)))),[rows,start,end,team,pp,fl,size,venue,gaa])
 const graded=filtered.filter(r=>r.result!=='UNVERIFIED'),wins=graded.filter(r=>r.result==='HIT').length
 const summary=RESEARCH_PROFILES.map(p=>({profile:p,...analyzeProfile(filtered,p)}))
 const totalGames=new Set(filtered.map(r=>r.gameId||r.date+':'+r.matchup)).size
 const sync=async()=>{
  if(!apiUrl.trim()){setMessage('Set a research API URL in Collection Status first.');setSection('STATUS');return}
  setLoading(true);setMessage('')
  try{
   const url=new URL('/research/combos',apiUrl);url.searchParams.set('limit','10000')
   const res=await fetch(url.toString());if(!res.ok)throw new Error('Cloud API HTTP '+res.status)
   const json=await res.json();const imported=parseResearchImport(json)
   setRows(old=>{const next=unique([...old,...imported.rows]);localStorage.setItem(STORE,JSON.stringify(next));return next})
   setMessage(`Cloud sync: ${imported.rows.length} rows received; ${imported.invalid} invalid rows excluded.`)
  }catch(e){setMessage('Cloud sync unavailable: '+String(e))}
  finally{setLoading(false)}
 }
 const importFile=async(e:React.ChangeEvent<HTMLInputElement>)=>{
  const file=e.target.files?.[0];if(!file)return
  try{
   const parsed=parseResearchImport(JSON.parse(await file.text()))
   if(!parsed.rows.length)throw new Error('No valid normalized research rows found.')
   const next=unique([...rows,...parsed.rows]);setRows(next);localStorage.setItem(STORE,JSON.stringify(next))
   setMessage(`Imported ${parsed.rows.length} records (${parsed.invalid} invalid). ${next.length} distinct records in local DEV preview.`)
  }catch(err){setMessage('Import failed: '+String(err))}
  e.currentTarget.value=''
 }
 useEffect(()=>{if(apiUrl.trim())localStorage.setItem(API_KEY,apiUrl.trim());else localStorage.removeItem(API_KEY)},[apiUrl])
 const header=<div className="researchHeader"><div><small>COMBO RESEARCH · CLOUD PREVIEW</small><h1>Combo History & Strategy Center</h1><p>Pregame lineup snapshots → intact combos → verified results. Shared research stays separate from private bets.</p></div><button onClick={()=>void sync()} disabled={loading}>{loading?'SYNCING…':'↻ SYNC CLOUD'}</button></div>
 return <main className="researchRoot">{header}
  <div className="researchNav">{(['EXPLORER','STRATEGIES','STATUS'] as const).map(x=><button key={x} className={section===x?'on':''} onClick={()=>setSection(x)}>{x==='EXPLORER'?'HIT RATE EXPLORER':x==='STRATEGIES'?'STRATEGY PERFORMANCE':'COLLECTION STATUS'}</button>)}</div>
  {message&&<p className="researchNotice" role="status">{message}</p>}
  <div className="researchMetrics"><div><small>COMBOS FILTERED</small><strong>{filtered.length}</strong></div><div><small>GRADED</small><strong>{graded.length}</strong></div><div><small>HIT RATE</small><strong>{graded.length?(wins/graded.length*100).toFixed(1)+'%':'—'}</strong></div><div><small>DISTINCT GAMES</small><strong>{totalGames}</strong></div></div>
  {section==='STATUS'?<div className="researchCard"><h2>Research collection status</h2><p>This DEV screen accepts normalized Combo Research records and can query the standalone research Worker. An empty screen means no research data has been imported or synced yet; no example results are invented.</p><label>RESEARCH CLOUD URL<input placeholder="https://your-research-worker.workers.dev" value={apiUrl} onChange={e=>setApiUrl(e.target.value)}/></label><p>Current preview: <strong>{rows.length}</strong> distinct local records. The production research database is not deployed by this branch.</p><label className="researchImport">IMPORT NORMALIZED RESEARCH JSON<input type="file" accept=".json,application/json" onChange={e=>void importFile(e)}/></label><p>Accepted JSON: an array or an object with <code>combos</code> containing date, gameId, team, players, ppUnit, forwardLine, odds, and result. Records must have valid identifiers; unverifiable combinations are not silently graded.</p><button onClick={()=>{if(window.confirm('Clear only the locally cached research preview? Your Bet Hub wagers will not be changed.')){setRows([]);localStorage.removeItem(STORE);setMessage('Local research preview cleared.')}}}>CLEAR LOCAL RESEARCH PREVIEW</button></div>:<>
   <div className="researchFilters">
    <label>FROM<input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label><label>THROUGH<input type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label>
    <label>TEAM<select value={team} onChange={e=>setTeam(e.target.value)}><option value="ALL">All teams</option>{teams.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
    <label>PP UNIT<select value={pp} onChange={e=>setPp(e.target.value)}><option value="ALL">All</option><option value="1">PP1</option><option value="2">PP2</option></select></label>
    <label>FORWARD LINE<select value={fl} onChange={e=>setFl(e.target.value)}><option value="ALL">All</option>{[1,2,3,4].map(x=><option key={x} value={x}>FL{x}</option>)}</select></label>
    <label>COMBO SIZE<select value={size} onChange={e=>setSize(e.target.value)}><option value="ALL">All</option><option value="2">Duo</option><option value="3">Trio</option></select></label>
    <label>VENUE<select value={venue} onChange={e=>setVenue(e.target.value)}><option value="ALL">All</option><option value="HOME">Home</option><option value="AWAY">Away</option></select></label>
    <label>GOALIE GAA<select value={gaa} onChange={e=>setGaa(e.target.value)}><option value="ALL">All / unknown</option><option value="LOW">Below 2.50</option><option value="MID">2.50–3.25</option><option value="HIGH">Above 3.25</option></select></label>
    <button type="button" onClick={()=>{setStart('');setEnd('');setTeam('ALL');setPp('ALL');setFl('ALL');setSize('ALL');setVenue('ALL');setGaa('ALL')}}>RESET</button>
   </div>
   {section==='EXPLORER'?<div className="researchCard"><div className="researchCardTop"><h2>Combo outcomes</h2><select aria-label="Research view" value={view} onChange={e=>setView(e.target.value)}><option value="HIT">Combo hit rate</option><option value="LIST">Individual records</option></select></div>{!rows.length?<p className="researchEmpty">No shared research records yet. Open Collection Status to import research JSON or connect the cloud API.</p>:view==='HIT'?<div className="researchTable"><table><thead><tr><th>Class</th><th>Graded</th><th>Hits</th><th>Hit %</th></tr></thead><tbody>{[1,2].flatMap(p=>[2,3].map(n=>{const x=graded.filter(r=>r.ppUnit===p&&r.players.length===n),hit=x.filter(r=>r.result==='HIT').length;return <tr key={p+'-'+n}><td>PP{p} {n===2?'Duo':'Trio'}</td><td>{x.length}</td><td>{hit}</td><td>{x.length?(100*hit/x.length).toFixed(1)+'%':'—'}</td></tr>}))}</tbody></table></div>:<div className="researchTable"><table><thead><tr><th>Game</th><th>Team</th><th>Players</th><th>FL / PP</th><th>Odds</th><th>Grade</th></tr></thead><tbody>{filtered.slice(0,250).map(r=><tr key={r.id}><td>{r.date} {r.matchup}</td><td>{r.team}</td><td>{r.players.join(' + ')}</td><td>FL{r.forwardLine??'?'} / PP{r.ppUnit??'?'}</td><td>{r.odds===null?'—':r.odds>0?'+'+r.odds:r.odds}</td><td>{r.result}</td></tr>)}</tbody></table>{filtered.length>250&&<p>Showing the first 250 records. Narrow the filters to inspect more.</p>}</div>}</div>:<>
    <div className="researchCard"><div className="researchCardTop"><div><h2>Strategy performance · date range</h2><p>Hypothetical net returns at captured pregame odds. Skipped, unpriced, and ungraded combinations never contribute invented returns.</p></div><label>PROFILE<select value={profile} onChange={e=>setProfile(e.target.value as ResearchProfile)}>{RESEARCH_PROFILES.map(x=><option key={x} value={x}>{x}u</option>)}</select></label></div><div className="researchTable"><table><thead><tr><th>Profile</th><th>Bet</th><th>Skipped</th><th>Unpriced / ungraded</th><th>Exposure</th><th>Net P/L</th><th>ROI</th><th>Daily-close DD</th></tr></thead><tbody>{summary.map(x=><tr key={x.profile} className={profile===x.profile?'researchSelected':''} onClick={()=>setProfile(x.profile)}><td>{x.profile}u</td><td>{x.placed}</td><td>{x.skipped}</td><td>{x.unpriced}</td><td>{x.exposure.toFixed(2)}u</td><td className={x.net>=0?'researchWin':'researchLoss'}>{money(x.net)}</td><td>{x.exposure?x.roi.toFixed(2)+'%':'—'}</td><td>{x.drawdown.toFixed(2)}u</td></tr>)}</tbody></table></div></div>
    <div className="researchCard"><h2>{profile}u · Betting reference</h2><p>Unit size: <strong>${unitSize.toFixed(2)}</strong>. Kalshi profit thresholds are calculated from the actual position cost, not just the unit size. The range below assumes the displayed stake is the position cost, before fees.</p><div className="researchTable"><table><thead><tr><th>Combo</th><th>American odds</th><th>Units</th><th>Position cost</th><th>Potential Kalshi net profit</th></tr></thead><tbody>{RULE_NAMES.map(x=>{const units=RULES[x.key][profile],cost=units*unitSize,lower=x.key.includes('101_150')?1.01:x.key.includes('151_200')?1.51:x.key.includes('101_200')?1.01:x.key.includes('HIGH')?x.key==='PP2_DUO_FL2_HIGH'||x.key==='PP2_DUO_OTHER_HIGH'?3:2:0;const upper=x.key==='PP1_DUO_101_150'?1.5:x.key==='PP1_DUO_151_200'?2:x.key==='PP1_TRIO_101_200'?2:x.key==='PP2_DUO_LOW'?3:Infinity;return <tr key={x.key}><td>{x.title}</td><td>{x.odds}</td><td>{units?units.toFixed(2)+'u':'SKIP'}</td><td>{units?'$'+cost.toFixed(2):'—'}</td><td>{!units?'—':lower>0?'$'+(cost*lower).toFixed(2)+(Number.isFinite(upper)?' – $'+(cost*upper).toFixed(2):'+'):'See actual price / cost'}</td></tr>})}</tbody></table></div><p className="researchFootnote">The 300u profile is not included until its historical stakes are verified. Profiles are version 1 historical-fit rules, not future profit guarantees.</p></div>
   </>}
  </>}
 </main>
}
