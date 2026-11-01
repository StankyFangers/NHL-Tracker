import {useEffect,useState,type CSSProperties} from 'react'
type Row={id:string;date:string;ticker:string;title:string;side:string;action:string;count:string;price:string;fee:string;isNhl:boolean}
type Result={totalFills:number;nhl:Row[];unknown:Row[];unclassified:number;pages:number;complete:boolean;marketLookups:number;notice:string}
type API={kalshiSettings:()=>Promise<{configured:boolean;keyId?:string;error?:string}>;kalshiChoosePem:()=>Promise<{cancelled:boolean;path:string}>;kalshiSave:(id:string,p:string)=>Promise<unknown>;kalshiDisconnect:()=>Promise<unknown>;kalshiCheck:()=>Promise<unknown>;kalshiHistory:(date:string)=>Promise<Result>;kalshiSyncPreview:()=>Promise<Result>}
const api=()=> (window as any).nhlTracker as API
const wrapper:CSSProperties={border:'1px solid #28685a',borderRadius:12,background:'#0c1c25',padding:16,color:'#e5f4f7',margin:'12px auto',maxWidth:1200}
const button:CSSProperties={background:'#096d55',color:'#fff',border:'1px solid #23aa87',borderRadius:7,padding:'9px 14px',fontWeight:700,cursor:'pointer'}
const input:CSSProperties={background:'#101f2b',border:'1px solid #385566',borderRadius:6,padding:9,color:'#fff',minWidth:250}
const scroll:CSSProperties={maxHeight:330,overflow:'auto',overscrollBehavior:'contain',marginTop:12,border:'1px solid #274451',borderRadius:6}
function Results({data}:{data:Result}){
 const table=(rows:Row[])=><div style={scroll}><table style={{width:'100%',fontSize:12,borderCollapse:'collapse',minWidth:770}}><thead><tr>{['Date','Kalshi market / legs','Side','Action','Price','Contracts','Fee'].map(x=><th key={x} style={{textAlign:'left',padding:9}}>{x}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={r.id+'-'+i} style={{borderTop:'1px solid #28434f'}}><td style={{padding:9}}>{r.date}</td><td style={{padding:9,maxWidth:580,overflowWrap:'anywhere'}}>{r.title}<div style={{fontSize:10,color:'#8aaebb'}}>{r.ticker}</div></td><td>{r.side}</td><td>{r.action}</td><td>{r.price}</td><td>{r.count}</td><td>{r.fee}</td></tr>)}</tbody></table></div>
 return <div><p>{data.notice}</p><p><strong>Fills:</strong> {data.totalFills} · <strong>NHL:</strong> {data.nhl.length} · <strong>Unclassified:</strong> {data.unclassified} · <strong>Pages:</strong> {data.pages}{!data.complete?' · Partial scan':''}</p><h3>NHL Candidates</h3>{table(data.nhl)}<h3>Unclassified Markets (first 300)</h3><p style={{color:'#efc98c'}}>These can include NHL combos that the API doesn't identify by sport. Nothing here is automatically imported.</p>{table(data.unknown)}</div>
}
export function KalshiNHLSettings(){
 const [state,setState]=useState<{configured:boolean;keyId?:string;error?:string}>({configured:false})
 const [id,setId]=useState(''),[pem,setPem]=useState(''),[from,setFrom]=useState('2026-10-01')
 const [busy,setBusy]=useState(false),[msg,setMsg]=useState(''),[result,setResult]=useState<Result|null>(null)
 const refresh=async()=>{const s=await api().kalshiSettings();setState(s)}
 useEffect(()=>{refresh().catch(e=>setMsg(String(e)))},[])
 async function run(fn:()=>Promise<void>){setBusy(true);setMsg('');try{await fn()}catch(e:any){setMsg(String(e?.message||e))}finally{setBusy(false)}}
 return <section style={wrapper}><h2 style={{margin:'0 0 6px'}}>Kalshi Settings</h2><p>Set up your read-only Kalshi connection once. Private key data is encrypted locally on this computer, never stored in the cloud wager account.</p>
 <p style={{color:state.configured?'#8ee2b8':'#f3c988'}}>{state.configured?'✓ Connection saved ('+state.keyId+')':'No saved Kalshi connection'} {state.error}</p>
 <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'end'}}>
 <label style={{display:'grid',gap:5}}>API Key ID<input style={input} value={id} placeholder={state.configured?'Configured — enter ID only to replace':'Key ID, not your private key'} onChange={e=>setId(e.target.value)}/></label>
 <label style={{display:'grid',gap:5}}>Local private key file<span style={{display:'flex',gap:8,alignItems:'center',minHeight:38}}><span>{pem?pem.split(/[\\/]/).pop():'No PEM selected'}</span><button style={button} disabled={busy} onClick={()=>run(async()=>{const r=await api().kalshiChoosePem();if(!r.cancelled)setPem(r.path)})}>Choose PEM</button></span></label>
 <button style={button} disabled={busy||!id||!pem} onClick={()=>run(async()=>{await api().kalshiSave(id,pem);setPem('');setId('');await refresh();setMsg('Key securely saved and test connection succeeded.')})}>Save & Test</button>
 <button style={button} disabled={busy||!state.configured} onClick={()=>run(async()=>{await api().kalshiCheck();setMsg('Kalshi connection verified.')})}>Test Saved Connection</button>
 <button style={{...button,background:'#59303a',borderColor:'#915664'}} disabled={busy||!state.configured} onClick={()=>run(async()=>{await api().kalshiDisconnect();await refresh();setResult(null);setMsg('Saved credentials cleared.')})}>Remove Connection</button>
 </div>
 <div style={{borderTop:'1px solid #2f5058',marginTop:20,paddingTop:16}}><h3>Historical Backfill & Market Review</h3><p>Review older fills, including unidentified combos. Scanning is read-only until we can safely map individual fills into unique wagers.</p>
 <div style={{display:'flex',gap:10,alignItems:'end',flexWrap:'wrap'}}><label style={{display:'grid',gap:5}}>Backfill from<input type="date" style={input} value={from} onChange={e=>setFrom(e.target.value)}/></label><button style={button} disabled={busy||!state.configured} onClick={()=>run(async()=>{const r=await api().kalshiHistory(from);setResult(r);setMsg(r.notice)})}>{busy?'Scanning…':'Scan Kalshi History'}</button></div>
 {msg&&<p role="status" style={{padding:10,background:'#173441',borderRadius:6}}>{msg}</p>}{result&&<Results data={result}/>}</div></section>
}
export function KalshiNHLSync(){
 const [busy,setBusy]=useState(false),[msg,setMsg]=useState('')
 return <div style={{padding:'8px 16px',textAlign:'center'}}><button style={button} disabled={busy} onClick={async()=>{setBusy(true);setMsg('');try{const result=await api().kalshiSyncPreview();setMsg('Scanned '+result.totalFills+' fills: '+result.nhl.length+' NHL candidates; '+result.unclassified+' unclassified. Preview only — no wagers changed. Review full history in Settings → Kalshi Settings.')}catch(e:any){setMsg('Kalshi sync unavailable: '+String(e?.message||e))}finally{setBusy(false)}}}>{busy?'↻ Scanning Kalshi…':'↻ Sync Kalshi Bets'}</button>{msg&&<p role="status" style={{color:'#b8d4e1',margin:'8px auto',maxWidth:900}}>{msg}</p>}</div>
}
