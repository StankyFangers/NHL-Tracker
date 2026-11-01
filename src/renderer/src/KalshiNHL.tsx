import {prepareKalshiImports,verifyKalshiIdentity,type KalshiFill} from './kalshiImport'
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
export function KalshiNHLSync({date,bets,setBets,unitSize,slateDfo,games,canSave}:{date:string;bets:any[];setBets:any;unitSize:number;slateDfo:Record<string,any>;games:any[];canSave:boolean}){
 const [busy,setBusy]=useState(false),[msg,setMsg]=useState('')
 const sync=async()=>{
  if(busy)return
  setBusy(true);setMsg('Contacting Kalshi and reviewing today’s fills…')
  try{
   if(!canSave)throw Error('Account wager synchronization is not ready. Sign in and wait for cloud status before importing.')
   if(!Number.isFinite(unitSize)||unitSize<=0)throw Error('Set a positive unit size in Settings before importing.')
   if(!Object.keys(slateDfo).length)throw Error('Load the projected/confirmed lines before importing. Use Update Lines on Bet Entry.')
   const res=await api().kalshiSyncToday(date)
   const {candidates,skipped,totalGroups}=prepareKalshiImports(res.nhl as KalshiFill[],bets,slateDfo,games,unitSize)
   const verified=await verifyKalshiIdentity(candidates,(team:string)=>(window as any).nhlTracker.roster(team))
   const ready=verified.accepted
   const skippedCount=skipped.length+verified.rejected.length
   if(!ready.length){setMsg('No eligible new bets. Reviewed '+totalGroups+' orders; '+skipped.length+' skipped/previously recorded. No wagers changed.');return}
   const preview=ready.slice(0,8).map(x=>x.legs.map(l=>l.player+' '+l.qty+'+ '+l.stat).join(' + ')+' · '+x.category+' · $'+x.risk.toFixed(2)).join('\n')
   const ok=window.confirm('Import '+ready.length+' NEW Kalshi wagers?\n\n'+preview+(ready.length>8?'\n…plus '+(ready.length-8)+' more':'')+'\n\n'+skippedCount+' fills/orders skipped for safety.\n\nOnly verified YES buys are included. Imported wagers start PENDING; settlements are not yet reconciled.\n\nProceed?')
   if(!ok){setMsg('Import cancelled; no wagers changed.');return}
   const newBets=ready.map(c=>c.bet)
   // Repeat the ID guard against the most current React state.
   setBets((old:any[])=>{
    const ids=new Set(old.map(b=>String(b.id)))
    const additions=newBets.filter(b=>!ids.has(b.id))
    return additions.length?[...old,...additions]:old
   })
   setMsg('Submitted '+newBets.length+' Kalshi wagers to Bet Tracker ('+skippedCount+' skipped). Check cloud sync status before closing NHL Tracker. All imported wagers are PENDING.')
  }catch(e:any){setMsg('Kalshi sync blocked: '+String(e?.message||e))}finally{setBusy(false)}
 }
 return <div style={{padding:'8px 16px',textAlign:'center'}}><button style={button} disabled={busy||!canSave} onClick={sync}>{busy?'↻ Syncing Kalshi…':'↻ Sync Kalshi Bets'}</button>{msg&&<p role="status" style={{color:'#b8d4e1',margin:'8px auto',maxWidth:900,whiteSpace:'pre-wrap'}}>{msg}</p>}</div>
}
