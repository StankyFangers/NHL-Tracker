import {useEffect,useMemo,useRef,useState} from 'react'
import {listAllCloudWagers} from './liveMigrationUpload'
import {validHistoricalWager, type CloudWagerRow} from './liveMigrationPreflight'

type WagerLeg={player?:string;qty?:number;stat?:string;team?:string;kind?:string;side?:string;voided?:boolean}
type Wager={id:string;date:string;legs:WagerLeg[];book?:string;units?:number;unitSize?:number;payout?:number;odds?:number;status?:string}
const isWager=(v:unknown):v is Wager=>validHistoricalWager(v)
const money=(n:number)=>'$'+n.toFixed(2)
const validPrice=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)
const hasSettledPricing=(w:Wager)=>validPrice(w.units)&&w.units!>=0&&validPrice(w.unitSize)&&w.unitSize!>0&&(w.status!=='WON'||(validPrice(w.payout)&&w.payout!>=0)||(validPrice(w.odds)&&w.odds!==0))
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
 const requestGeneration=useRef(0)
 const refresh=async()=>{
  const generation=++requestGeneration.current
  setLoading(true);setError('');setLoaded(false);setRows([]);setExpanded(null)
  try{
   const cloud=await listAllCloudWagers((window.nhlTracker as any).liveWagersRequest)
   if(cloud.some(r=>!isWager(r.wager)))throw new Error('Cloud returned an invalid wager; display stopped')
   if(generation===requestGeneration.current){setRows(cloud);setAccountLoaded(username);setLoaded(true)}
  }catch(e:unknown){if(generation===requestGeneration.current){setRows([]);setError(String(e instanceof Error?e.message:e))}}
  finally{if(generation===requestGeneration.current)setLoading(false)}
 }
 useEffect(()=>{void refresh();return ()=>{requestGeneration.current++}},[username])
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
   <p>{visible.length} wager{visible.length===1?'':'s'} shown · Cloud read-only while full LIVE betting workflow is being integrated</p>
   <div style={{display:'grid',gap:8,maxWidth:1000}}>
    {visible.map(w=><article key={w.id} style={{border:'1px solid #36556d',borderRadius:8,padding:12,background:'#15263b'}}>
     <button style={{width:'100%',textAlign:'left',background:'transparent',color:'inherit',border:0,cursor:'pointer'}} onClick={()=>setExpanded(x=>x===w.id?null:w.id)}>
      <strong>{w.date} · {w.book||'Sportsbook'} · {w.status||'PENDING'}</strong>
      <span style={{float:'right'}}>{w.units??0}u · {w.legs.length} legs {expanded===w.id?'▲':'▼'}</span>
     </button>
     {expanded===w.id&&<div style={{marginTop:10,borderTop:'1px solid #36556d',paddingTop:10}}>
      <div>Wager ID: {w.id} · Unit value: {money(Number(w.unitSize||0))} · {w.odds!=null?'Odds: '+w.odds:w.payout!=null?'Total return: '+money(w.payout):'Price unavailable'}</div>
      <ol>{w.legs.map((leg,i)=><li key={i}>{leg.player||leg.team||'Team'} · {leg.qty??1} {leg.stat||leg.kind||'prop'}{leg.side?' · '+leg.side:''}{leg.voided?' · VOID':''}</li>)}</ol>
     </div>}
    </article>)}
   </div>
  </>}
 </section>
}
