import {useCallback,useEffect,useRef,useState} from 'react'
import {confidenceRefreshDue,easternRefreshWindow} from './confidenceRefreshSchedule'
type Feed={date:string;checkedAt:string}
function saved<T extends Feed>(key:string,date:string):T|undefined{try{const row=JSON.parse(localStorage.getItem(key)||'null');return row?.date===date&&Number.isFinite(Date.parse(row.checkedAt))?row:undefined}catch{return undefined}}
export function useScheduledConfidenceFeed<T extends Feed>(date:string,key:string,request:(force:boolean)=>Promise<T>){
 const active=useRef(date);active.current=date
 const [state,setState]=useState<{date:string;feed?:T;error:string;ready:boolean}>(()=>{const feed=saved<T>(key,date);return{date,feed,error:'',ready:!!feed&&!confidenceRefreshDue(date,feed.checkedAt)}})
 const memory=useRef(new Map<string,T>()),pending=useRef(new Map<string,Promise<T|undefined>>()),attempts=useRef(new Map<string,number>())
 const refresh=useCallback((force=false)=>{
  const old=pending.current.get(date);if(old)return old
  const feed=memory.current.get(date)||saved<T>(key,date)
  if(!force&&feed&&!confidenceRefreshDue(date,feed.checkedAt)){if(active.current===date)setState({date,feed,error:'',ready:true});return Promise.resolve(feed)}
  if(!force&&easternRefreshWindow().date!==date){if(active.current===date)setState({date,feed,error:'Current inputs are only refreshed for today. Historical game scores stay fixed.',ready:true});return Promise.resolve(feed)}
  attempts.current.set(date,Date.now())
  const run=(async()=>{try{const next=await request(true);if(next.date!==date)throw Error('Source returned a different slate date');if(active.current!==date)return undefined;memory.current.set(date,next);try{localStorage.setItem(key,JSON.stringify(next))}catch{}setState({date,feed:next,error:'',ready:true});return next}catch(e){if(active.current===date)setState(p=>({date,feed:p.date===date?p.feed:feed,error:String((e as Error)?.message||e),ready:true}));return undefined}finally{pending.current.delete(date)}})();pending.current.set(date,run);return run
 },[date,key,request])
 useEffect(()=>{void refresh();const timer=setInterval(()=>{const feed=memory.current.get(date)||saved<T>(key,date),last=attempts.current.get(date)||0,newWindow=easternRefreshWindow(new Date(last)).slot!==easternRefreshWindow().slot;if(confidenceRefreshDue(date,feed?.checkedAt)&&(newWindow||Date.now()-last>=10*60*1000))void refresh()},60000);return()=>clearInterval(timer)},[date,key,refresh])
 return{feed:state.date===date?state.feed:undefined,error:state.date===date?state.error:'',ready:state.date===date&&state.ready,refresh}
}
