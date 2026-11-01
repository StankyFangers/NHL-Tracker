import {useState} from 'react'
import {prepareKalshiImports,verifyKalshiIdentity,type Candidate,type KalshiFill,type KalshiSlate} from './kalshiImport'
import {addKalshiFlags,clearKalshiFlags} from './KalshiSyncReview'
const eastern=()=>{
 const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
 const x=(k:string)=>p.find(t=>t.type===k)?.value||''
 return x('year')+'-'+x('month')+'-'+x('day')
}
const yesterday=()=>new Date(Date.parse(eastern()+'T12:00:00Z')-86400000).toISOString().slice(0,10)
const team=(g:any,side:string)=>String(g?.[side]?.abbrev?.default||g?.[side]?.abbrev||g?.[side]?.triCode||'').toUpperCase()
const snapshot=(d:string,t:string)=>{try{const x=localStorage.getItem('nhlTracker:dfoSnapshots:v1:'+d+':'+t),v=x?JSON.parse(x):null;return v?.confirmed||v?.latest||v?.baseline||null}catch{return null}}
const names=(raw:any)=>{
 const result=new Set<string>(),seen=new WeakSet<object>()
 const word=(v:any)=>typeof v==='string'?v:typeof v?.default==='string'?v.default:''
 const walk=(v:any)=>{
  if(!v||typeof v!=='object'||seen.has(v))return
  seen.add(v)
  if(Array.isArray(v)){v.forEach(walk);return}
  const name=[word(v.firstName),word(v.lastName)].filter(Boolean).join(' ')||word(v.fullName)
  if(Number(v.id||v.playerId)>0&&name)result.add(name)
  Object.values(v).forEach(walk)
 }
 walk(raw);return [...result]
}
export function KalshiHistoricalImporter({bets,setBets,unitSize,canSave}:{bets:any[];setBets:any;unitSize:number;canSave:boolean}){
 const [from,setFrom]=useState('2026-10-01'),[to,setTo]=useState(yesterday)
 const [busy,setBusy]=useState(false),[msg,setMsg]=useState('')
 const [preview,setPreview]=useState<{items:Candidate[];from:string;to:string}|null>(null)
 const [failures,setFailures]=useState<{id:string;reason:string;description:string}[]>([])
 const scan=async()=>{
  if(busy)return
  setBusy(true);setPreview(null);setFailures([]);setMsg('Scanning historical Kalshi wagers…')
  try{
   if(!canSave||!(unitSize>0))throw Error('Wait for account sync and configure a positive unit size.')
   if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||! /^\d{4}-\d{2}-\d{2}$/.test(to)||from>to||to>yesterday())throw Error('Select historical dates ending no later than yesterday.')
   const api=(window as any).nhlTracker,history=await api.kalshiHistory(from)
   if(!history.complete)throw Error('Incomplete Kalshi scan: importing partial data is blocked.')
   const fills=(history.nhl as KalshiFill[]).filter(f=>f.date>=from&&f.date<=to)
   const dates=[...new Set(fills.map(f=>f.date))]
   const slates:KalshiSlate[]=[]
   for(const date of dates){
    const response=await api.score(date),games=Array.isArray(response?.games)?response.games:[]
    if(!games.length)throw Error('Cannot load NHL games for '+date)
    const dfo:Record<string,any>={}
    for(const g of games)for(const t of [team(g,'awayTeam'),team(g,'homeTeam')]){
     if(t&&!dfo[t]){const x=snapshot(date,t);if(x?.forwardLines?.length)dfo[t]=x}
    }
    slates.push({date,games,dfo})
   }
   const teams=[...new Set(slates.flatMap(s=>s.games.flatMap(g=>[team(g,'awayTeam'),team(g,'homeTeam')]).filter(Boolean)))]
   const cache=new Map<string,any>(),roster=async(t:string)=>{
    if(!cache.has(t))cache.set(t,await api.roster(t))
    return cache.get(t)
   }
   const players:Record<string,string[]>={}
   for(let i=0;i<teams.length;i+=5)await Promise.all(teams.slice(i,i+5).map(async t=>{try{players[t]=names(await roster(t))}catch{}}))
   const matched=prepareKalshiImports(fills,bets,{},[],unitSize,slates,'__history__',players)
   const checked=await verifyKalshiIdentity(matched.candidates,roster)
   const sources=new Map<string,KalshiFill>()
   for(const f of fills){sources.set(f.id,f);if(f.orderId&&f.ticker)sources.set('KALSHI-'+f.orderId+'|'+f.ticker,f)}
   const skipped=[...matched.skipped,...checked.rejected]
   setFailures(skipped.map(x=>({id:x.id,reason:x.reason,description:sources.get(x.id)?.title||x.id})))
   clearKalshiFlags(matched.skipped.filter(x=>x.reason==='Already imported').map(x=>x.id))
   const flags=skipped.filter(x=>!['Already imported','Not a YES-side purchase'].includes(x.reason)).map(x=>({id:x.id,date:sources.get(x.id)?.date||from,ticker:sources.get(x.id)?.ticker||'',description:sources.get(x.id)?.title||'',reason:x.reason}))
   if(flags.length)addKalshiFlags(flags)
   setPreview({items:checked.accepted,from,to})
   setMsg(checked.accepted.length+' new historical wagers across '+dates.length+' dates; '+skipped.length+' skipped. Review before import.')
  }catch(e:any){setMsg('Historical Sync blocked: '+String(e?.message||e))}
  finally{setBusy(false)}
 }
 const importAll=()=>{
  if(!preview||busy||!canSave||preview.from!==from||preview.to!==to)return
  const incoming=preview.items.map(c=>c.bet)
  setBets((old:any[])=>{
   const ids=new Set(old.map(b=>String(b.id))),additions=incoming.filter(b=>!ids.has(String(b.id)))
   return additions.length?[...old,...additions]:old
  })
  clearKalshiFlags(preview.items.map(c=>c.id))
  setPreview(null);setMsg('Import submitted: '+incoming.length+' historical wagers. Check Bet Tracker and Cloud saved.')
 }
 return <div style={{display:'grid',gap:12,marginTop:14}}>
  <p>Historical wagers only. Matches use their original Eastern placement date and NHL slate, not settlement date.</p>
  <div style={{display:'flex',alignItems:'end',gap:10,flexWrap:'wrap'}}>
   <label>From <input type="date" value={from} max={yesterday()} onChange={e=>{setFrom(e.target.value);setPreview(null)}}/></label>
   <label>Through <input type="date" value={to} max={yesterday()} onChange={e=>{setTo(e.target.value);setPreview(null)}}/></label>
   <button disabled={busy||!canSave} onClick={scan}>{busy?'Scanning…':'Scan Historical Bets'}</button>
  </div>
  {msg&&<p role="status">{msg}</p>}
  {preview&&<section style={{padding:12,border:'1px solid #345664',borderRadius:8}}>
   <strong>Historical Import Preview: {preview.items.length} wagers</strong>
   <div style={{maxHeight:320,overflowY:'auto'}}>
   {preview.items.map(c=><div key={c.id} style={{padding:8,borderTop:'1px solid #345664',fontSize:12}}>
    <b>{c.date} · {c.category} · {c.legs.map(l=>l.player+' '+l.qty+'+ '+l.stat).join(' + ')}</b>
    <div>{c.id} · {'$'+c.risk.toFixed(2)} · {c.units.toFixed(2)}u</div>
   </div>)}
   </div>
   <button disabled={!preview.items.length||!canSave} onClick={importAll}>Import All {preview.items.length}</button>
   <button onClick={()=>setPreview(null)}>Cancel</button>
  </section>}
  {!!failures.length&&<details><summary>Skipped / Needs Review ({failures.length})</summary>
   {failures.map((f,i)=><div key={f.id+'-'+i} style={{padding:6,fontSize:12}}><b>{f.reason}</b> · {f.description}<div>{f.id}</div></div>)}
  </details>}
 </div>
}
