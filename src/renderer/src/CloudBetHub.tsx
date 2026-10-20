import {useEffect,useMemo,useRef,useState} from 'react'
import {listAllCloudWagers} from './liveMigrationUpload'
import {type CloudWagerRow} from './liveMigrationPreflight'

type WagerLeg={player?:string;qty?:number;stat?:string;team?:string;kind?:string;side?:string;voided?:boolean}
type Wager={id:string;date:string;legs:WagerLeg[];book?:string;units?:number;unitSize?:number;payout?:number;odds?:number;status?:string}
const money=(n:number)=>'$'+n.toFixed(2)
const validPrice=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)
const hasSettledPricing=(w:Wager)=>{
 const units=w.units,unitSize=w.unitSize,payout=w.payout,odds=w.odds
 if(!validPrice(units)||!validPrice(unitSize))return false
 if(Number(units)<0||Number(unitSize)<=0)return false
 if(w.status!=='WON')return true
 return (validPrice(payout)&&Number(payout)>=0)||(validPrice(odds)&&odds!==0)
}
const net=(w:Wager)=>{
 const stake=(w as Wager & {bonusBet?:boolean}).bonusBet?0:Number(w.units||0)*Number(w.unitSize||0)
 if(w.status==='VOID')return 0
 if(w.status==='LOST')return -stake
 if(w.status==='WON'){
  const fullStake=Number(w.units||0)*Number(w.unitSize||0)
  const gross=w.payout!==undefined?Number(w.payout):w.odds!==undefined?fullStake*(1+(w.odds>0?w.odds/100:100/Math.abs(w.odds))):0
  const adjustedGross=(w as Wager & {bonusBet?:boolean}).bonusBet?Math.max(0,gross-fullStake):gross
  return adjustedGross-stake
 }
 return -stake
}
export default function CloudBetHub({username}:{username:string}){
 const [rows,setRows]=useState<CloudWagerRow[]>([])
 const [loading,setLoading]=useState(false)
 const [error,setError]=useState('')
 const [loaded,setLoaded]=useState(false)
 const [date,setDate]=useState('')
 const [status,setStatus]=useState('ALL')
 const [expanded,setExpanded]=useState<string|null>(null)
 const [accountLoaded,setAccountLoaded]=useState('')
 const [editing,setEditing]=useState<CloudWagerRow|null>(null)
 const [draft,setDraft]=useState('')
 const [saving,setSaving]=useState(false)
 const [notice,setNotice]=useState('')
 const requestGeneration=useRef(0)
 const refresh=async()=>{
  const generation=++requestGeneration.current
  setLoading(true);setError('');setLoaded(false);setRows([]);setExpanded(null)
  try{
   const cloud=await listAllCloudWagers((window.nhlTracker as any).liveWagersRequest)
   if(generation===requestGeneration.current){setRows(cloud);setAccountLoaded(username);setLoaded(true)}
  }catch(e:unknown){if(generation===requestGeneration.current){setRows([]);setError(String(e instanceof Error?e.message:e))}}
  finally{if(generation===requestGeneration.current)setLoading(false)}
 }
 useEffect(()=>{setEditing(null);setDraft('');setNotice('');void refresh();return ()=>{requestGeneration.current++}},[username])
 const submitDraft=async()=>{
  if(saving||loading||!loaded||accountLoaded!==username)return
  const generation=requestGeneration.current
  let wager:Wager
  try{wager=JSON.parse(draft);if(!wager||typeof wager!=='object'||Array.isArray(wager)||typeof wager.id!=='string'||!/^\\d{4}-\\d{2}-\\d{2}$/.test(wager.date)||!Array.isArray(wager.legs)||wager.legs.length<1||wager.legs.length>12)throw Error('A wager needs an ID, YYYY-MM-DD date and 1–12 legs')}
  catch(e){setError('Invalid wager JSON: '+String(e instanceof Error?e.message:e));return}
  if(editing&&wager.id!==editing.wager_id){setError('Editing cannot change a wager ID');return}
  if(editing&&!editing.updated_at){setError('This wager has no revision timestamp; refresh before editing');return}
  setSaving(true);setError('');setNotice('')
  try{
   const payload=editing?{method:'PATCH',id:editing.wager_id,expectedUpdatedAt:editing.updated_at,wager}:{method:'POST',source:'manual',wager}
   const response=await (window.nhlTracker as any).liveWagersRequest(payload)
   if(generation!==requestGeneration.current)return
   if(response?.error||response?.ok!==true||response?.id!==wager.id)throw Error(response?.error||'Cloud did not confirm the wager')
   setEditing(null);setDraft('');setNotice('Cloud confirmed '+(editing?'updated':'created')+' wager '+wager.id)
   await refresh()
  }catch(e){if(generation===requestGeneration.current)setError(String(e instanceof Error?e.message:e)+'. Your draft remains available; refresh before retrying a conflict.')}
  finally{setSaving(false)}
 }
 const deleteWager=async(row:CloudWagerRow)=>{
  if(saving||loading||!loaded||accountLoaded!==username)return
  if(!row.updated_at){setError('Wager revision unavailable; refresh before deleting');return}
  if(!window.confirm('Permanently delete cloud wager '+row.wager_id+'? This cannot be undone.'))return
  const generation=requestGeneration.current
  setSaving(true);setError('');setNotice('')
  try{
   const response=await (window.nhlTracker as any).liveWagersRequest({method:'DELETE',id:row.wager_id,expectedUpdatedAt:row.updated_at})
   if(generation!==requestGeneration.current)return
   if(response?.error||response?.ok!==true||response?.deleted!==true)throw Error(response?.error||'Cloud did not confirm deletion')
   setEditing(null);setDraft('');setNotice('Cloud confirmed deletion of '+row.wager_id)
   await refresh()
  }catch(e){if(generation===requestGeneration.current)setError(String(e instanceof Error?e.message:e)+'. Refresh before retrying a conflict.')}
  finally{setSaving(false)}
 }
 const wagers=useMemo(()=>rows.map(r=>r.wager as Wager),[rows])
 const dates=useMemo(()=>[...new Set(wagers.map(w=>w.date))].sort().reverse(),[wagers])
 const visible=useMemo(()=>wagers.filter(w=>(!date||w.date===date)&&(status==='ALL'||(w.status||'PENDING')===status)).sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id)),[wagers,date,status])
 const settled=useMemo(()=>wagers.filter(w=>w.status==='WON'||w.status==='LOST'||w.status==='VOID'),[wagers])
 const pnl=useMemo(()=>settled.reduce((sum,w)=>sum+net(w),0),[settled])
 const financialComplete=settled.every(hasSettledPricing)
 return <section style={{background:'#0c192a',color:'#e3efff',minHeight:'100vh',padding:24}}>
  <header style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:16,flexWrap:'wrap'}}>
   <div><h1 style={{margin:0}}>NHL Tracker · Cloud Bet Hub</h1><p style={{color:'#a8c6df'}}>LIVE account: <strong>{username}</strong> · Account-specific Neon wagers</p></div>
   <button disabled={loading} onClick={()=>void refresh()}>{loading?'SYNCING…':'REFRESH MY CLOUD WAGERS'}</button>
  </header>
  {notice&&<p role="status" style={{color:'#a9e9b9'}}>{notice}</p>}
  {error&&<p role="alert" style={{color:'#ffb6b6'}}>{error}</p>}
  {(!loaded||accountLoaded!==username)&&!error&&<p role="status">Loading private cloud wagers…</p>}
  {loaded&&accountLoaded===username&&<>
   <div style={{display:'flex',gap:20,flexWrap:'wrap',padding:'12px 0',borderTop:'1px solid #38546b',borderBottom:'1px solid #38546b'}}>
    <span>Total: <strong>{wagers.length}</strong></span>
    <span>Pending: <strong>{wagers.filter(w=>!w.status||w.status==='PENDING').length}</strong></span>
    <span>Settled: <strong>{settled.length}</strong></span>
    <span>Settled P/L: <strong>{financialComplete?money(pnl):'Unavailable — missing wager pricing'}</strong></span>
   </div>
   <div style={{display:'flex',gap:12,margin:'18px 0',flexWrap:'wrap'}}>
    <label>Slate <select value={date} onChange={e=>setDate(e.target.value)}><option value="">All dates</option>{dates.map(d=><option key={d} value={d}>{d}</option>)}</select></label>
    <label>Result <select value={status} onChange={e=>setStatus(e.target.value)}>{['ALL','PENDING','WON','LOST','VOID'].map(s=><option key={s} value={s}>{s}</option>)}</select></label>
   </div>
   <p>{visible.length} wager{visible.length===1?'':'s'} shown · Changes require confirmation from the LIVE cloud service; server-side writes remain disabled until separately approved.</p>
   <div style={{border:'1px solid #36556d',padding:14,borderRadius:8,maxWidth:1000,marginBottom:14}}>
    <button type="button" disabled={saving||loading} onClick={()=>{setEditing(null);setDraft(JSON.stringify({id:crypto.randomUUID(),date:new Date().toLocaleDateString('en-CA'),legs:[{player:'',stat:'P',qty:1}],units:1,unitSize:2.5,status:'PENDING'},null,2));setError('')}}>NEW CLOUD WAGER</button>
    {draft&&<div style={{display:'grid',gap:8,marginTop:12}}><strong>{editing?'Edit cloud wager '+editing.wager_id:'Create cloud wager'} · JSON draft</strong><textarea aria-label="Cloud wager JSON draft" value={draft} onChange={e=>setDraft(e.target.value)} rows={12} style={{width:'100%',boxSizing:'border-box',fontFamily:'monospace',background:'#071321',color:'#e3efff'}}/><div style={{display:'flex',gap:8}}><button disabled={saving||loading} onClick={()=>void submitDraft()}>{saving?'WAITING FOR CLOUD…':editing?'SAVE CLOUD EDIT':'CREATE CLOUD WAGER'}</button><button disabled={saving} onClick={()=>{setEditing(null);setDraft('');setError('')}}>CANCEL</button></div></div>}
   </div>
   <div style={{display:'grid',gap:8,maxWidth:1000}}>
    {visible.map(w=><article key={w.id} style={{border:'1px solid #36556d',borderRadius:8,padding:12,background:'#15263b'}}>
     <button style={{width:'100%',textAlign:'left',background:'transparent',color:'inherit',border:0,cursor:'pointer'}} onClick={()=>setExpanded(x=>x===w.id?null:w.id)}>
      <strong>{w.date} · {w.book||'Sportsbook'} · {w.status||'PENDING'}</strong>
      <span style={{float:'right'}}>{w.units??0}u · {w.legs.length} legs {expanded===w.id?'▲':'▼'}</span>
     </button>
     {expanded===w.id&&<div style={{marginTop:10,borderTop:'1px solid #36556d',paddingTop:10}}>
      <div>Wager ID: {w.id} · Unit value: {money(Number(w.unitSize||0))} · {w.odds!=null?'Odds: '+w.odds:w.payout!=null?'Total return: '+money(w.payout):'Price unavailable'}</div>
      <div style={{display:'flex',gap:8,margin:'10px 0'}}><button disabled={saving||loading} onClick={()=>{const row=rows.find(r=>r.wager_id===w.id);if(row){setEditing(row);setDraft(JSON.stringify(row.wager,null,2));setError('')}}}>EDIT</button><button disabled={saving||loading} onClick={()=>{const row=rows.find(r=>r.wager_id===w.id);if(row)void deleteWager(row)}}>DELETE</button></div>
      <ol>{w.legs.map((leg,i)=><li key={i}>{leg.player||leg.team||'Team'} · {leg.qty??1} {leg.stat||leg.kind||'prop'}{leg.side?' · '+leg.side:''}{leg.voided?' · VOID':''}</li>)}</ol>
     </div>}
    </article>)}
   </div>
  </>}
 </section>
}
