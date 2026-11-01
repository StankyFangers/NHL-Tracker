import {useSyncExternalStore} from 'react'

export type KalshiKind='daily'|'history'
export type KalshiJobState={
 busy:boolean;msg:string;preview:any;skipDetails:any[];failures:any[];phase:'idle'|'running'|'done'|'cancelled'|'error'
}
const initial=():KalshiJobState=>({busy:false,msg:'',preview:null,skipDetails:[],failures:[],phase:'idle'})
const state:Record<KalshiKind,KalshiJobState>={daily:initial(),history:initial()}
const listeners=new Set<()=>void>()
let current:{kind:KalshiKind;id:number}|null=null
let sequence=0
const notify=()=>{
 for(const listener of [...listeners])listener()
}
const subscribe=(fn:()=>void)=>{listeners.add(fn);return()=>listeners.delete(fn)}
export const getKalshiJob=(kind:KalshiKind)=>state[kind]
export const useKalshiJob=(kind:KalshiKind)=>useSyncExternalStore(subscribe,()=>state[kind],()=>state[kind])
const change=(kind:KalshiKind,patch:Partial<KalshiJobState>)=>{
 state[kind]={...state[kind],...patch};notify()
}
const safeNotify=(title:string,body:string)=>{
 try{void (window as any).nhlTracker?.notify?.(title,body)?.catch?.(()=>{})}catch{/* Notifications are optional. */}
}
export type KalshiJobContext={
 assertActive:()=>void
 update:(patch:Partial<KalshiJobState>)=>void
}
export function startKalshiJob(kind:KalshiKind,task:(job:KalshiJobContext)=>Promise<void>){
 if(current||state[kind].busy)return false
 const id=++sequence
 current={kind,id}
 change(kind,{...initial(),busy:true,phase:'running',msg:kind==='history'?'Scanning Kalshi history…':'Scanning today’s Kalshi wagers…'})
 const active=()=>current?.id===id&&current.kind===kind
 const ctx:KalshiJobContext={
  assertActive:()=>{if(!active())throw Error('SYNC_CANCELLED')},
  update:(patch)=>{if(active())change(kind,patch)}
 }
 void (async()=>{
  try{
   await task(ctx)
   if(!active())return
   change(kind,{busy:false,phase:'done'})
   safeNotify('Kalshi '+(kind==='history'?'Historical':'Daily')+' Sync finished',state[kind].msg||'Return to NHL Tracker to review the results.')
  }catch(e:any){
   if(!active())return
   const msg='Kalshi sync failed: '+String(e?.message||e)
   change(kind,{busy:false,phase:'error',msg})
   safeNotify('Kalshi Sync failed',msg)
  }finally{if(active())current=null}
 })()
 return true
}
export function cancelKalshiJob(){
 if(!current)return
 const kind=current.kind
 current=null
 change(kind,{busy:false,phase:'cancelled',preview:null,msg:'Sync cancelled. No scan results were imported. Any in-flight API request may finish, but its results will be ignored.'})
}
export function dismissKalshiPreview(kind:KalshiKind,msg:string){
 if(state[kind].busy)return
 change(kind,{preview:null,msg})
}
export function setKalshiJobStatus(kind:KalshiKind,msg:string,preview?:any){
 if(state[kind].busy)return
 change(kind,preview===undefined?{msg}:{msg,preview})
}
export function KalshiSyncActivity({onOpen}:{onOpen:(kind:KalshiKind)=>void}){
 const daily=useKalshiJob('daily'),history=useKalshiJob('history')
 const active=history.busy?'history':daily.busy?'daily':null
 const kind=active||(['done','error'].includes(history.phase)&&history.preview?'history':null)||(['done','error'].includes(daily.phase)&&daily.preview?'daily':null)
 if(!kind)return null
 const job=kind==='daily'?daily:history
 return <div role="status" style={{margin:'7px 12px',padding:'9px 12px',background:'#133743',border:'1px solid #277a79',borderRadius:8,color:'#e4f7f2',display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
  <strong>{job.busy?'↻ Kalshi '+(kind==='history'?'Historical':'Daily')+' Sync running': '✓ Kalshi '+(kind==='history'?'Historical':'Daily')+' Sync ready'}</strong>
  <span style={{fontSize:12,flex:1}}>{job.busy?'You can navigate the app. The scan will continue while NHL Tracker stays open.':job.msg}</span>
  <button onClick={()=>onOpen(kind)} style={{background:'#126f5b',color:'white',padding:'6px 10px',borderRadius:6,cursor:'pointer'}}>View {kind==='history'?'History':'Daily'} Sync</button>
  {job.busy&&<button onClick={cancelKalshiJob} style={{background:'#6a3441',color:'white',padding:'6px 10px',borderRadius:6,cursor:'pointer'}}>Cancel Sync</button>}
 </div>
}
