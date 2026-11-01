import {addKalshiFlags,clearKalshiFlags} from './KalshiSyncReview'
import {prepareKalshiImports,verifyKalshiIdentity,classifyExistingKalshiBet,type KalshiFill,type Candidate} from './kalshiImport'
import {useEffect,useState,type CSSProperties} from 'react'
type Row={id:string;fillId:string;orderId:string;date:string;ticker:string;title:string;side:string;action:string;count:string;price:string;fee:string;isNhl:boolean;review:string;detectedSport:string;legs:{ticker:string;side:string;title:string;resolved:boolean;source:string;nhlTicker:boolean}[]}
type Result={totalFills:number;nhl:Row[];unknown:Row[];unclassified:number;pages:number;complete:boolean;marketLookups:number;legLookups:number;unresolved:number;distinctNhlOrders:number;combos:number;categoryCounts:{unresolved:number;mixed:number;otherSports:number};comboTickerFallbacks:number;mixedLegs:number;unresolvedCombos:number;otherCombos:number;notice:string}
type API={kalshiSettings:()=>Promise<{configured:boolean;keyId?:string;error?:string}>;kalshiChoosePem:()=>Promise<{cancelled:boolean;path:string}>;kalshiSave:(id:string,p:string)=>Promise<unknown>;kalshiDisconnect:()=>Promise<unknown>;kalshiCheck:()=>Promise<unknown>;kalshiHistory:(date:string)=>Promise<Result>;kalshiSyncPreview:()=>Promise<Result>;kalshiSyncToday:(date:string)=>Promise<Result>}
const api=()=> (window as any).nhlTracker as API
const wrapper:CSSProperties={border:'1px solid #28685a',borderRadius:12,background:'#0c1c25',padding:16,color:'#e5f4f7',margin:'12px auto',maxWidth:1200}
const button:CSSProperties={background:'#096d55',color:'#fff',border:'1px solid #23aa87',borderRadius:7,padding:'9px 14px',fontWeight:700,cursor:'pointer'}
const input:CSSProperties={background:'#101f2b',border:'1px solid #385566',borderRadius:6,padding:9,color:'#fff',minWidth:250}
const scroll:CSSProperties={maxHeight:330,overflow:'auto',overscrollBehavior:'contain',marginTop:12,border:'1px solid #274451',borderRadius:6}
function Results({data}:{data:Result}){
 const [unknownFilter,setUnknownFilter]=useState('REVIEW')
 const filteredUnknown=data.unknown.filter(r=>unknownFilter==='ALL'||unknownFilter==='REVIEW'&&['UNRESOLVED','UNKNOWN','MIXED'].includes(r.detectedSport)||r.detectedSport===unknownFilter)
 const table=(rows:Row[])=><div style={scroll}><table style={{width:'100%',fontSize:12,borderCollapse:'collapse',minWidth:770}}><thead><tr>{['Date','Kalshi market / legs','IDs / Review','Side','Action','Price','Contracts','Fee'].map(x=><th key={x} style={{textAlign:'left',padding:9}}>{x}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={r.id+'-'+i} style={{borderTop:'1px solid #28434f'}}><td style={{padding:9}}>{r.date}</td><td style={{padding:9,maxWidth:580,overflowWrap:'anywhere'}}>{r.title}<div style={{fontSize:10,color:'#8aaebb'}}>{r.ticker}</div>{r.legs?.map((leg,i)=><div key={i} style={{fontSize:11,color:leg.resolved?'#8fe4bc':'#ecc384',padding:'3px 0'}}>Leg {i+1}: {leg.side.toUpperCase()} · {leg.title} {leg.source==='PARENT_TITLE'?'(from combo title)':leg.source==='TICKER_ONLY'?'(ticker only)':''}</div>)}</td><td style={{fontSize:10,overflowWrap:'anywhere',maxWidth:160}}>{r.review}<div>Category: {r.detectedSport}</div><div>Fill: {r.fillId||'not provided'}</div><div>Order: {r.orderId||'not provided'}</div></td><td>{r.side}</td><td>{r.action}</td><td>{r.price}</td><td>{r.count}</td><td>{r.fee}</td></tr>)}</tbody></table></div>
 return <div><p><strong>Fills:</strong> {data.totalFills} · <strong>NHL:</strong> {data.nhl.length} · <strong>Unclassified:</strong> {data.unclassified} · <strong>Combo fills with 2+ legs:</strong> {data.combos} · <strong>NHL combos with ticker-only verification:</strong> {data.comboTickerFallbacks} · <strong>NHL order IDs:</strong> {data.distinctNhlOrders} · <strong>Mixed combos:</strong> {data.mixedLegs} · <strong>Unresolved combos:</strong> {data.unresolvedCombos} · <strong>Pages:</strong> {data.pages}{!data.complete?' · Partial scan':''}</p><h3>NHL Candidates (market vs ticker verification indicated)</h3>{table(data.nhl)}<h3>Other / Mixed / Unresolved Markets</h3><p style={{color:'#efc98c'}}>Unresolved: {data.categoryCounts.unresolved} · Mixed: {data.categoryCounts.mixed} · Clearly other markets: {data.categoryCounts.otherSports}. Categories are informational, not proof that every market has been decoded.</p><div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{['REVIEW','ALL','UFC','NBA','NFL','MLB','CRYPTO','MIXED','UNRESOLVED','UNKNOWN'].map(k=><button key={k} type="button" style={{...button,background:unknownFilter===k?'#096d55':'#193340'}} onClick={()=>setUnknownFilter(k)}>{k==='REVIEW'?'Needs Review':k==='ALL'?'All':k}</button>)}</div>{table(filteredUnknown)}<p style={{fontSize:11,color:'#93b2bc'}}>Showing up to 500 unclassified fills; no bets imported.</p></div>
}
export function KalshiNHLSettings({mode='settings'}:{mode?:'settings'|'history'}){
 const [state,setState]=useState<{configured:boolean;keyId?:string;error?:string}>({configured:false})
 const [id,setId]=useState(''),[pem,setPem]=useState(''),[from,setFrom]=useState('2026-10-01')
 const [busy,setBusy]=useState(false),[msg,setMsg]=useState(''),[result,setResult]=useState<Result|null>(null)
 const refresh=async()=>{const s=await api().kalshiSettings();setState(s)}
 useEffect(()=>{refresh().catch(e=>setMsg(String(e)))},[])
 async function run(fn:()=>Promise<void>){setBusy(true);setMsg('');try{await fn()}catch(e:any){setMsg(String(e?.message||e))}finally{setBusy(false)}}
 return <section style={wrapper}><h2 style={{margin:'0 0 6px'}}>{mode==='history'?'Kalshi Sync Historical Backfill':'Kalshi Sync Settings'}</h2>{mode==='settings'&&<p>Set up your read-only Kalshi connection once. Private key data is encrypted locally on this computer, never stored in the cloud wager account.</p>}
 <p style={{color:state.configured?'#8ee2b8':'#f3c988'}}>{state.configured?'✓ Connection saved ('+state.keyId+')':'No saved Kalshi connection'} {state.error}</p>
 {mode==='settings'&&<div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'end'}}>
 <label style={{display:'grid',gap:5}}>API Key ID<input style={input} value={id} placeholder={state.configured?'Configured — enter ID only to replace':'Key ID, not your private key'} onChange={e=>setId(e.target.value)}/></label>
 <label style={{display:'grid',gap:5}}>Local private key file<span style={{display:'flex',gap:8,alignItems:'center',minHeight:38}}><span>{pem?pem.split(/[\\/]/).pop():'No PEM selected'}</span><button style={button} disabled={busy} onClick={()=>run(async()=>{const r=await api().kalshiChoosePem();if(!r.cancelled)setPem(r.path)})}>Choose PEM</button></span></label>
 <button style={button} disabled={busy||!id||!pem} onClick={()=>run(async()=>{await api().kalshiSave(id,pem);setPem('');setId('');await refresh();setMsg('Key securely saved and test connection succeeded.')})}>Save & Test</button>
 <button style={button} disabled={busy||!state.configured} onClick={()=>run(async()=>{await api().kalshiCheck();setMsg('Kalshi connection verified.')})}>Test Saved Connection</button>
 <button style={{...button,background:'#59303a',borderColor:'#915664'}} disabled={busy||!state.configured} onClick={()=>run(async()=>{await api().kalshiDisconnect();await refresh();setResult(null);setMsg('Saved credentials cleared.')})}>Remove Connection</button>
 </div>}
 {mode==='history'&&<div style={{borderTop:'1px solid #2f5058',marginTop:20,paddingTop:16}}><h3>Historical Backfill & Market Review</h3><p>Review older fills, including unidentified combos. Scanning is read-only until we can safely map individual fills into unique wagers.</p>
 <div style={{display:'flex',gap:10,alignItems:'end',flexWrap:'wrap'}}><label style={{display:'grid',gap:5}}>Backfill from<input type="date" style={input} value={from} onChange={e=>setFrom(e.target.value)}/></label><button style={button} disabled={busy||!state.configured} onClick={()=>run(async()=>{const r=await api().kalshiHistory(from);setResult(r);setMsg(r.notice)})}>{busy?'Scanning…':'Scan Kalshi History'}</button></div>
 {msg&&<p role="status" style={{padding:10,background:'#173441',borderRadius:6}}>{msg}</p>}{result&&<Results data={result}/>}</div>}</section>
}
export function KalshiNHLSync({date,selectedSlate,bets,setBets,unitSize,slateDfo,games,canSave}:{date:string;selectedSlate:string;bets:any[];setBets:any;unitSize:number;slateDfo:Record<string,any>;games:any[];canSave:boolean}){
 const [busy,setBusy]=useState(false),[msg,setMsg]=useState('')
 const [preview,setPreview]=useState<{date:string;items:Candidate[];skipped:number;orders:number}|null>(null)
 const [skipDetails,setSkipDetails]=useState<{id:string;reason:string;description:string}[]>([])
 const sync=async()=>{
  if(busy)return
  setBusy(true);setPreview(null);setSkipDetails([]);setMsg('Contacting Kalshi and reviewing today’s fills…')
  try{
   if(selectedSlate!==date)throw Error('Select today’s NHL slate before importing. Current DFO lineups belong to the selected slate.')
   if(!canSave)throw Error('Wait until account wager synchronization is ready.')
   if(!Number.isFinite(unitSize)||unitSize<=0)throw Error('Set a positive unit size in Settings.')
   const res=await api().kalshiSyncToday(date)
   // Daily Sync is exclusively for the current placement date.
   // Historical Sync handles all older wagers and their original game slates.
   const todayFills=(res.nhl as KalshiFill[]).filter(f=>f.date===date)
   const allSlates=[{date,dfo:slateDfo,games}]
   const teams=[...new Set(allSlates.flatMap(s=>s.games.flatMap(g=>['homeTeam','awayTeam'].map(side=>{
    const t=g?.[side];return String(t?.abbrev?.default||t?.abbrev||t?.triCode||'').toUpperCase()
   }).filter(Boolean))))]
   const rosterCache=new Map<string,any>()
   const roster=async(team:string)=>{
    if(!rosterCache.has(team))rosterCache.set(team,await (window as any).nhlTracker.roster(team))
    return rosterCache.get(team)
   }
   const rosterPlayers:Record<string,string[]>={}
   await Promise.all(teams.map(async team=>{
    try{
     const raw=await roster(team)
     const names=new Set<string>()
     const seen=new WeakSet<object>()
     const walk=(x:any)=>{
      if(Array.isArray(x)){x.forEach(walk);return}
      if(!x||typeof x!=='object'||seen.has(x))return
      seen.add(x)
      const label=(v:any)=>typeof v==='string'?v:typeof v?.default==='string'?v.default:''
      const name=[label(x.firstName),label(x.lastName)].filter(Boolean).join(' ')||label(x.fullName)
      if(name&&Number(x.id||x.playerId)>0)names.add(name)
      Object.values(x).forEach(v=>{if(v&&typeof v==='object')walk(v)})
     }
     walk(raw)
     rosterPlayers[team]=[...names]
    }catch{/* Missing NHL roster is not evidence that the player is absent. */}
   }))
   // Repair categories from earlier versions without creating new wagers.
   // Restrict this to today's identifiable Kalshi imports; leave manually entered
   // OTHER wagers and wagers from historical dates untouched.
   let repaired=0
   setBets((old:any[])=>{
    const next=old.map(b=>{
     if(b.date!==date||b.book!=='Kalshi'||!String(b.id||'').startsWith('KALSHI-')||b.category!=='OTHER')return b
     const category=classifyExistingKalshiBet(b,slateDfo)
     if(category==='OTHER')return b
     repaired++
     return {...b,category}
    })
    return repaired?next:old
   })
   const {candidates,skipped,totalGroups}=prepareKalshiImports(todayFills,bets,slateDfo,games,unitSize,[],date,rosterPlayers)
   const verified=await verifyKalshiIdentity(candidates,roster)
   const ready=verified.accepted
   const skippedCount=skipped.length+verified.rejected.length
   // Expose the actual reason for each skipped order; do not mislabel all failures
   // as duplicates or require the user to edit wagering data blindly.
   const orderById=new Map<string,KalshiFill>()
   for(const fill of todayFills){
    orderById.set(fill.id,fill)
    if(fill.orderId&&fill.ticker)orderById.set('KALSHI-'+fill.orderId+'|'+fill.ticker,fill)
   }
   const diagnosis=[...skipped,...verified.rejected].map(item=>{
    const source=orderById.get(item.id)
    return {id:item.id,reason:item.reason,description:source?.title||source?.ticker||item.id}
   })
   setSkipDetails(diagnosis)

   // Persist actionable import failures for Settings > Kalshi Sync > Sync Review.
   // Already imported IDs and ordinary sells are not errors to repair.
   const source=new Map<string,KalshiFill>()
   for(const f of todayFills){
    source.set(f.id,f)
    if(f.orderId&&f.ticker)source.set('KALSHI-'+f.orderId+'|'+f.ticker,f)
   }
   clearKalshiFlags(skipped.filter(x=>/Already imported|Already recorded as a matching Kalshi bet/i.test(x.reason)).map(x=>x.id))
   const flags=[...skipped,...verified.rejected].filter(x=>!/Already imported|Already recorded as a matching Kalshi bet|Not a YES-side purchase/i.test(x.reason)).map(x=>{
    const f=source.get(x.id)
    return {id:x.id,date:f?.date||date,ticker:f?.ticker||'',description:f?.title||'',reason:x.reason}
   })
   if(flags.length)addKalshiFlags(flags)
   if(!ready.length){
    const already=skipped.filter(x=>x.reason==='Already imported').length
    const reasons=[...new Map(diagnosis.filter(x=>x.reason!=='Already imported').map(x=>[x.reason,true])).keys()]
    setMsg('No new wagers · '+totalGroups+' Kalshi orders scanned · '+already+' exact duplicates · '+(skippedCount-already)+' skipped for other reasons. '+(reasons.length?'See individual reasons below.':''))

    return
   }
   setPreview({date,items:ready,skipped:skippedCount,orders:totalGroups})
   setMsg(ready.length+' new Kalshi wager'+(ready.length===1?'':'s')+' found. Review the batch below, then choose Import All.')
  }catch(e:any){setMsg('Kalshi sync blocked: '+String(e?.message||e))}finally{setBusy(false)}
 }
 const importAll=()=>{
  if(!preview||busy)return
  if(!canSave||selectedSlate!==date||preview.date!==date){setPreview(null);setMsg('Slate or account changed. Run Sync Kalshi Bets again.');return}
  const newBets=preview.items.map(c=>c.bet)
  // Keep the same ID and manually-entered-wager checks in the final React state update.
  setBets((old:any[])=>{
   const ids=new Set(old.map(b=>String(b.id)))
   const additions=newBets.filter(b=>!ids.has(b.id))
   return additions.length?[...old,...additions]:old
  })
  clearKalshiFlags(preview.items.map(c=>c.id))
  setMsg('Import submitted · '+newBets.length+' eligible Kalshi wager'+(newBets.length===1?'':'s')+' · '+preview.skipped+' skipped or already logged. Check Bet Tracker and cloud save status. Imported wagers begin PENDING.')
  setPreview(null)
 }
 return <div style={{padding:'8px 16px',textAlign:'center'}}>
  <button style={button} disabled={busy||!canSave} onClick={sync}>{busy?'↻ Scanning Kalshi…':'↻ Sync Kalshi Bets'}</button>
  {msg&&<p role="status" style={{color:'#b8d4e1',margin:'8px auto',maxWidth:1000}}>{msg}</p>}
  {skipDetails.length>0&&<details style={{...wrapper,textAlign:'left',marginTop:8}} open={!preview}>
   <summary style={{cursor:'pointer',fontWeight:700}}>Kalshi sync diagnostics · {skipDetails.length} skipped item{skipDetails.length===1?'':'s'}</summary>
   <p style={{fontSize:12,color:'#a9c7d3'}}>These are the reasons returned by the importer. No skipped bet was automatically added.</p>
   <div style={{maxHeight:260,overflowY:'auto'}}>
   {skipDetails.map((item,i)=><div key={item.id+'-'+i} style={{padding:'9px 0',borderBottom:'1px solid #294855',fontSize:12}}>
    <strong style={{color:'#efc28f'}}>{item.reason}</strong><div style={{marginTop:3}}>{item.description}</div>
    <div style={{fontSize:10,color:'#86a8b9',overflowWrap:'anywhere'}}>{item.id}</div>
   </div>)}
   </div>
  </details>}
  {preview&&<section aria-label="Kalshi import preview" style={{...wrapper,maxWidth:1050,textAlign:'left',marginTop:12}}>
   <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}>
    <strong style={{fontSize:16}}>Review Kalshi Imports · {preview.items.length} new wager{preview.items.length===1?'':'s'}</strong>
    <span style={{fontSize:12,color:'#afc9d6'}}>{preview.orders} orders reviewed · {preview.skipped} safely skipped</span>
   </div>
   <div style={{maxHeight:320,overflowY:'auto',overscrollBehavior:'contain',margin:'12px 0',borderTop:'1px solid #294855'}}>
    {preview.items.map(c=><div key={c.id} style={{borderBottom:'1px solid #294855',padding:'11px 4px',display:'flex',justifyContent:'space-between',gap:16,flexWrap:'wrap'}}>
     <div><b>{c.legs.map(l=>l.player+' '+l.qty+'+ '+l.stat).join(' + ')}</b><div style={{color:'#9dbacb',fontSize:11,marginTop:4}}>{c.category} · {c.ticker}</div></div>
     <div style={{fontWeight:700,whiteSpace:'nowrap'}}>${c.risk.toFixed(2)} · {c.units.toFixed(2)}u · {c.odds>=0?'+':''}{c.odds}</div>
    </div>)}
   </div>
   <p style={{fontSize:12,color:'#e8bc83'}}>Only fully verified YES purchases are included. All imported wagers begin pending; Kalshi settlement reconciliation is not enabled yet.</p>
   <div style={{display:'flex',gap:10,justifyContent:'flex-end',flexWrap:'wrap'}}>
    <button style={{...button,background:'#193644',borderColor:'#446272'}} onClick={()=>{setPreview(null);setMsg('Import dismissed. No wagers changed.')}}>Cancel</button>
    <button style={button} disabled={!canSave} onClick={importAll}>Import All {preview.items.length} Wager{preview.items.length===1?'':'s'}</button>
   </div>
  </section>}
 </div>
}
