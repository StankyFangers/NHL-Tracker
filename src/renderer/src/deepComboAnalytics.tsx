import {ConfidenceDashboard} from './ConfidenceDashboard'
import {useMemo,useState} from 'react'
import './deepComboAnalytics.css'

export type ComboResultRecord={key:string;date:string;gameId:number;matchup:string;team:string;players:string[];status:string;marketAvailability?:'NOT_OFFERED';comboChanged?:boolean;changeNote?:string;result:'HIT'|'MISS'|'UNVERIFIED';odds?:number;book?:string;source:string;referenceUnits:number;net1u?:number}
const INDEX='nhlTracker:comboResults:index:v1'
const dayKey=(date:string)=>`nhlTracker:comboResults:day:v1:${date}`
export function saveComboDayResults(date:string,rows:ComboResultRecord[]){
 const dates=readDates();if(!dates.includes(date))dates.push(date)
 localStorage.setItem(dayKey(date),JSON.stringify({date,verifiedAt:new Date().toISOString(),rows}))
 localStorage.setItem(INDEX,JSON.stringify(dates.sort()))
 window.dispatchEvent(new Event('nhlTracker:comboResultsUpdated'))
}
function readDates():string[]{try{const x=JSON.parse(localStorage.getItem(INDEX)||'[]');return Array.isArray(x)?x.filter((d:unknown)=>typeof d==='string'):[]}catch{return []}}
function readResults():ComboResultRecord[]{return readDates().flatMap(date=>{try{const data=JSON.parse(localStorage.getItem(dayKey(date))||'null');return Array.isArray(data?.rows)?data.rows:[]}catch{return []}})}
const fmt=(n:number)=>`${n>=0?'+':''}${n.toFixed(2)}u`
const roi=(n:number,risk:number)=>risk?`${(n/risk*100).toFixed(1)}%`:'—'
const bucket=(odds:number)=>{if(odds<0)return 'Negative';if(odds<200)return '+100–199';if(odds<300)return '+200–299';if(odds<400)return '+300–399';if(odds<500)return '+400–499';if(odds<600)return '+500–599';if(odds<800)return '+600–799';return '+800+'}
const bands=['Negative','+100–199','+200–299','+300–399','+400–499','+500–599','+600–799','+800+']
function Trend({rows}:{rows:ComboResultRecord[]}){
 const [mode,setMode]=useState<'CUMULATIVE'|'DAILY'>('CUMULATIVE')
 const days=[...new Set(rows.map(r=>r.date))].sort();let running=0
 const pts=days.map(day=>{const daily=rows.filter(r=>r.date===day).reduce((n,r)=>n+(r.net1u??0),0);running+=daily;return{date:day,value:mode==='CUMULATIVE'?running:daily}})
 const values=pts.map(p=>p.value),min=Math.min(0,...values),max=Math.max(0,...values),span=max-min||1
 const xy=(p:{value:number},i:number)=>`${35+(i/Math.max(pts.length-1,1))*750},${180-((p.value-min)/span)*145}`
 return <section className="deepCard"><div className="deepCardHead"><h3>UNITS P/L OVER TIME</h3><div className="deepTabs"><button className={mode==='CUMULATIVE'?'selected':''} onClick={()=>setMode('CUMULATIVE')}>CUMULATIVE</button><button className={mode==='DAILY'?'selected':''} onClick={()=>setMode('DAILY')}>DAILY</button></div></div>{pts.length?<><svg viewBox="0 0 800 220" role="img" aria-label={`${mode.toLowerCase()} combo profit and loss chart`} className="deepTrend"><line x1="35" x2="785" y1={180-(0-min)/span*145} y2={180-(0-min)/span*145} className="deepZero"/><polyline points={pts.map(xy).join(' ')} fill="none" stroke="#54b8f0" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/>{pts.map((p,i)=><circle key={p.date} cx={35+i/Math.max(pts.length-1,1)*750} cy={180-(p.value-min)/span*145} r="4" fill="#77d8ff"><title>{p.date}: {fmt(p.value)}</title></circle>)}<text x="35" y="18">{fmt(max)}</text><text x="35" y="202">{fmt(min)}</text><text x="785" y="215" textAnchor="end">{pts.at(-1)?.date}</text><text x="35" y="215">{pts[0]?.date}</text></svg></>:<p className="deepEmpty">No priced, verified combo results match these filters.</p>}</section>
}
export function DeepComboAnalytics({bets}:{bets:any[]}){
 const [revision,setRevision]=useState(0)
 const [section,setSection]=useState<'PROFIT'|'DETAIL'|'CONFIDENCE'>('PROFIT')
 const [excluded,setExcluded]=useState<string[]>([])
 const [start,setStart]=useState('')
 const [end,setEnd]=useState('')
 const [kind,setKind]=useState('ALL')
 const [oddsBand,setOddsBand]=useState('ALL')
 const [book,setBook]=useState('ALL')
 const [requirements,setRequirements]=useState('ALL')
 const [stakeFilter,setStakeFilter]=useState('ALL')
 const all=useMemo(()=>readResults(),[revision])
 const teams=[...new Set(all.map(r=>r.team))].sort()
 const priced=all.filter(r=>r.net1u!==undefined&&Number.isFinite(r.net1u))
 const scoped=all.filter(r=>(!start||r.date>=start)&&(!end||r.date<=end)&&!excluded.includes(r.team))
 const filtered=scoped.filter(r=>(kind==='ALL'||(kind==='TRIO'?r.players.length===3:r.players.length===2))&&(oddsBand==='ALL'||(r.odds!=null&&bucket(r.odds)===oddsBand))&&(book==='ALL'||r.book===book)&&(requirements==='ALL'||requirements==='1P')&&(stakeFilter==='ALL'||r.referenceUnits===Number(stakeFilter)))
 // Qualifying Daily Combo snapshots currently only include 1P requirements. Do not claim 2P data exists.
 const complete=filtered.filter(r=>r.net1u!==undefined&&Number.isFinite(r.net1u))
 const total=complete.reduce((n,r)=>n+r.net1u!,0)
 const wins=complete.filter(r=>r.result==='HIT').length
 const coverage=filtered.length?complete.length/filtered.length*100:0
 const books=[...new Set(all.map(r=>r.book).filter((x):x is string=>!!x))].sort()
 const grouped=bands.map(b=>{const x=complete.filter(r=>r.odds!=null&&bucket(r.odds)===b);return{band:b,n:x.length,net:x.reduce((n,r)=>n+r.net1u!,0)}})
 const realSettled=bets.filter(b=>b.status==='WON'||b.status==='LOST').length
 return <div className="deepRoot"><header className="deepHero"><div><span>DEEP BET ANALYTICS · VERIFIED COMBO HISTORY</span><h1>STRATEGY PROFITABILITY</h1><p>Every qualifying saved daily combo at a normalized 1u stake. Separate from your real Bet Hub P/L.</p></div><button onClick={()=>setRevision(v=>v+1)}>↻ REFRESH RESULTS</button></header>
 <nav className="deepNav"><button className={section==='PROFIT'?'active':''} onClick={()=>setSection('PROFIT')}>COMBO PROFITABILITY</button><button className={section==='DETAIL'?'active':''} onClick={()=>setSection('DETAIL')}>DETAILED COMBO PERFORMANCE</button><button disabled title="Scheduled for Phase 2">TRIO VS SPLIT DUOS · NEXT</button><button className={section==='CONFIDENCE'?'active':''} onClick={()=>setSection('CONFIDENCE')}>CONFIDENCE SCORE</button><button disabled title="Scheduled for Phase 4">TEAM ANALYTICS · NEXT</button></nav>
 <section className="deepFilters"><label>FROM<input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label><label>THROUGH<input type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label><button onClick={()=>{setStart('');setEnd('');setExcluded([]);setKind('ALL');setOddsBand('ALL');setBook('ALL');setStakeFilter('ALL')}}>RESET FILTERS</button></section>
 {section!=='CONFIDENCE'&&<> <section className="deepSummary"><div><small>NET · 1u PER COMBO</small><strong className={total>=0?'good':'bad'}>{fmt(total)}</strong></div><div><small>ROI · PRICED COMBOS</small><strong>{roi(total,complete.length)}</strong></div><div><small>PRICED & VERIFIED</small><strong>{complete.length} / {filtered.length}</strong></div><div><small>PRICING COVERAGE</small><strong>{coverage.toFixed(1)}%</strong></div><div><small>HIT RATE</small><strong>{complete.length?(wins/complete.length*100).toFixed(1)+'%':'—'}</strong></div></section></>}
 {section==='CONFIDENCE'?<ConfidenceDashboard bets={bets}/>:section==='PROFIT'?<><section className="deepCard"><div className="deepCardHead"><h3>INCLUDE / EXCLUDE TEAMS</h3><small>Removing a team recalculates all metrics and the graph</small></div><div className="deepTeamGrid">{teams.map(t=><button key={t} className={excluded.includes(t)?'off':''} onClick={()=>setExcluded(xs=>xs.includes(t)?xs.filter(x=>x!==t):[...xs,t])}>{t}</button>)}</div>{!teams.length&&<p className="deepEmpty">No saved End of Day results yet. Generate and save the first verified report in DEV Control Center.</p>}</section><Trend rows={complete}/><section className="deepCard"><h3>DATA COVERAGE</h3><p>{filtered.length-complete.length} combos are unpriced or unverified and excluded from financial totals. {priced.length} priced and verified combos exist across all saved days. This is a strategy simulation, not actual wager returns.</p><p>Actual Bet Hub settled wagers: {realSettled}. These are intentionally not mixed into the strategy total.</p></section></>:<><section className="deepCard"><div className="deepCardHead"><h3>DETAILED FILTERS</h3><small>All metrics reflect the current selection</small></div><div className="deepDetailFilters"><label>COMBO SIZE<select value={kind} onChange={e=>setKind(e.target.value)}><option value="ALL">All sizes</option><option value="DUO">Duos</option><option value="TRIO">Trios</option></select></label><label>ODDS RANGE<select value={oddsBand} onChange={e=>setOddsBand(e.target.value)}><option value="ALL">All odds</option>{bands.map(b=><option key={b}>{b}</option>)}</select></label><label>SPORTSBOOK<select value={book} onChange={e=>setBook(e.target.value)}><option value="ALL">All books</option>{books.map(b=><option key={b}>{b}</option>)}</select></label><label>REFERENCE STAKE<select value={stakeFilter} onChange={e=>setStakeFilter(e.target.value)}><option value="ALL">All stakes</option><option value="0.5">0.5u</option><option value="1">1u</option><option value="1.5">1.5u</option><option value="2">2u</option></select></label><label>POINT REQUIREMENT<select value={requirements} onChange={e=>setRequirements(e.target.value)}><option value="ALL">All (currently 1P)</option><option value="1P">1P combos</option><option value="2P" disabled>2P — not yet captured</option></select></label></div></section><section className="deepCard"><h3>PROFITABILITY BY ODDS RANGE · 1u NORMALIZED</h3><div className="deepBandRows"><div className="deepBandHead"><span>ODDS</span><span>COMBOS</span><span>NET UNITS</span><span>ROI</span></div>{grouped.map(r=><div className="deepBandRow" key={r.band}><span>{r.band}</span><span>{r.n}</span><strong className={r.net>=0?'good':'bad'}>{r.n?fmt(r.net):'—'}</strong><span>{roi(r.net,r.n)}</span></div>)}</div><p className="deepNote">This report uses qualifying 1P combo snapshots. Actual 0.5u wagers and 2P legs require the separate Bet Hub dataset; they are not silently represented as qualifying 1P results.</p></section><Trend rows={complete}/></>}
 </div>
}