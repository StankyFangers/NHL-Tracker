import {useCallback,useEffect,useRef,useState} from 'react'
import {goalieRefreshDue,type DfoGoalieFeed} from '../../shared/dfoStartingGoalies'
export function useDfoStartingGoalies(date:string,games:any[]){
 const activeDate=useRef(date);activeDate.current=date
 const gameRef=useRef(games);gameRef.current=games
 const [state,setState]=useState<{date:string;feed?:DfoGoalieFeed;error:string;loading:boolean}>({date,error:'',loading:false})
 const timing=useRef({date,attempt:0,success:0}),pending=useRef(new Map<string,Promise<void>>())
 const refresh=useCallback((force=true)=>{
  const existing=pending.current.get(date);if(existing)return existing
  if(timing.current.date!==date)timing.current={date,attempt:0,success:0}
  timing.current.attempt=Date.now();setState(old=>({date,feed:old.date===date?old.feed:undefined,error:'',loading:true}))
  const run=(async()=>{try{const feed=await window.nhlTracker.dfoStartingGoalies(date,force);if(activeDate.current!==date)return;timing.current.success=Date.now();setState({date,feed,error:'',loading:false})}catch(e){if(activeDate.current===date)setState(old=>({date,feed:old.date===date?old.feed:undefined,error:String((e as Error)?.message||e),loading:false}))}finally{pending.current.delete(date)}})()
  pending.current.set(date,run);return run
 },[date])
 useEffect(()=>{void refresh(false);const timer=setInterval(()=>{const t=timing.current;if(goalieRefreshDue(gameRef.current,t.attempt,t.success,Date.now()))void refresh(false)},60000);return()=>clearInterval(timer)},[date,refresh])
 return {feed:state.date===date?state.feed:undefined,error:state.date===date?state.error:'',loading:state.date===date?state.loading:true,refresh}
}
