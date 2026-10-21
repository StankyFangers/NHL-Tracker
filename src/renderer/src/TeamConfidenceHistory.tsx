import {useEffect,useState} from 'react'
import {CONFIDENCE_TEAMS} from './confidenceEngine'
import {readPredictions} from './confidencePerformance'
import {readScoreLog,readTeamHistory} from './confidenceScoreLog'

export function ConfidenceAnalytics({bets,start='',end=''}:{bets:any[];start?:string;end?:string}){
 const [,refresh]=useState(0)
 useEffect(()=>{const onUpdate=()=>refresh(x=>x+1);window.addEventListener('nhl-confidence-history',onUpdate);window.addEventListener('storage',onUpdate);return()=>{window.removeEventListener('nhl-confidence-history',onUpdate);window.removeEventListener('storage',onUpdate)}},[])
 const teams=Object.keys(CONFIDENCE_TEAMS).sort(),[team,setTeam]=useState(teams[0]||'')
 const inRange=(date:string)=>(!start||date>=start)&&(!end||date<=end)
 const predictions=[...readScoreLog(),...readPredictions()]
 const settled=bets.filter(b=>['WON','LOST'].includes(b.status)&&inRange(b.date))
 const groups=['SKIP','FADE','NEUTRAL','BOOST'].map(signal=>({signal,count:0,net:0}))
 let missing=0
 for(const b of settled){
  const legs=(b.legs||[]).filter((l:any)=>!l.voided);const ts=[...new Set(legs.map((l:any)=>l.team))],gs=[...new Set(legs.map((l:any)=>String(l.gameId||'')))];
  const snapshot=ts.length===1&&gs.length===1?predictions.find(p=>p.date===b.date&&p.team===ts[0]&&p.gameId===gs[0]):undefined
  const risk=b.bonusBet?0:Number(b.units);let net:number|undefined
  if(b.status==='LOST')net=-risk
  else if(b.payout!=null&&Number(b.unitSize)>0)net=Number(b.payout)/Number(b.unitSize)-risk
  else if(b.odds!=null&&Number(b.odds)!==0){const profit=Number(b.units)*(Number(b.odds)>0?Number(b.odds)/100:100/Math.abs(Number(b.odds)));net=profit+(b.bonusBet?0:Number(b.units))-risk}
  if(!snapshot||net==null||!Number.isFinite(net)){missing++;continue}
  const group=groups.find(g=>g.signal===snapshot.signal);if(group){group.count++;group.net+=net}
 }
 const max=Math.max(1,...groups.map(g=>Math.abs(g.net)))
 const history=readTeamHistory().filter(r=>r.team===team&&inRange(r.date)).sort((a,b)=>a.date.localeCompare(b.date))
 const x=(i:number)=>55+i/Math.max(1,history.length-1)*720,y=(v:number)=>205-v*1.75
 return <>
  <section className="deepCard"><h3>CONFIDENCE SCORES & ACTUAL PROFIT</h3><p>Actual settled wager returns grouped by the recorded pregame matchup signal. This shows association, not proof the scores caused a profit. Cross-team wagers and missing snapshots are excluded.</p>
   <svg className="deepTrend" viewBox="0 0 800 240" role="img" aria-label="Actual net units by confidence signal"><line x1="45" x2="780" y1="110" y2="110" stroke="#52697b"/>{groups.map((g,i)=>{const h=Math.abs(g.net)/max*75;return <g key={g.signal}><rect x={80+i*180} y={g.net>=0?110-h:110} width="100" height={h} fill={g.net>=0?'#54d69d':'#f27c86'}/><text x={130+i*180} y="215" textAnchor="middle">{g.signal}</text><text x={130+i*180} y="235" textAnchor="middle">{g.count?`${g.net.toFixed(2)}u · ${g.count} bets`:'No matched bets'}</text></g>})}</svg>
   <p>{missing} settled wagers excluded for missing or ambiguous scores or pricing. Historical snapshots are never reconstructed from today's ratings.</p>
  </section>
  <section className="deepCard"><div className="deepCardHead"><h3>TEAM CONFIDENCE HISTORY</h3><label>TEAM <select aria-label="Confidence history team" value={team} onChange={e=>setTeam(e.target.value)}>{teams.map(t=><option key={t}>{t}</option>)}</select></label></div>
   <p>First saved daily offensive score and defensive vulnerability score, on a 0–100 scale. Higher defensive vulnerability favors opposing scorers. History starts when logging is installed and the app is opened; model inputs do not refresh automatically.</p>
   <div style={{display:'flex',gap:24}}><span style={{color:'#68ccff'}}>● Offensive score</span><span style={{color:'#ffc875'}}>● Defensive vulnerability</span></div>
   {history.length?<><svg className="deepTrend" viewBox="0 0 800 245" role="img" aria-label={`${team} offensive and defensive score history`}>{[0,25,50,75,100].map(v=><g key={v}><line x1="55" x2="775" y1={y(v)} y2={y(v)} stroke="#284354"/><text x="8" y={y(v)+4}>{v}</text></g>)}{(['offense','defense'] as const).map((key,k)=><g key={key}><polyline points={history.map((r,i)=>`${x(i)},${y(r[key])}`).join(' ')} fill="none" stroke={k?'#ffc875':'#68ccff'} strokeWidth="3"/>{history.map((r,i)=><circle key={r.date} cx={x(i)} cy={y(r[key])} r="4" fill={k?'#ffc875':'#68ccff'}><title>{r.date}: {key} {r[key].toFixed(1)} · model {r.modelAsOf}</title></circle>)}</g>)}<text x="55" y="235">{history[0].date}</text><text x="775" y="235" textAnchor="end">{history.at(-1)?.date}</text></svg>
   <div style={{overflowX:'auto'}}><table style={{width:'100%',textAlign:'left',borderSpacing:12}}><thead><tr>{['Date','Offense','Change','Defensive vulnerability','Change','Model date'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{history.slice().reverse().map(r=>{const i=history.indexOf(r),prev=history[i-1];const delta=(n:number)=>`${n>=0?'+':''}${n.toFixed(1)}`;return <tr key={r.date}><td>{r.date}</td><td>{r.offense.toFixed(1)}</td><td>{prev?delta(r.offense-prev.offense):'—'}</td><td>{r.defense.toFixed(1)}</td><td>{prev?delta(r.defense-prev.defense):'—'}</td><td>{r.modelAsOf}{r.modelAsOf.slice(0,10)<r.date?' · older inputs':''}</td></tr>})}</tbody></table></div></>:<p className="deepEmpty">No saved scores for {team} in this date range. No historical values have been estimated.</p>}
  </section>
 </>
}
