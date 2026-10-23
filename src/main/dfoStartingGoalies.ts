import {parseDfoStartingGoalies,type DfoGoalieFeed} from '../shared/dfoStartingGoalies'
const cache=new Map<string,{at:number;feed:DfoGoalieFeed}>(),pending=new Map<string,Promise<DfoGoalieFeed>>()
export async function fetchDfoStartingGoalies(date:string,force=false):Promise<DfoGoalieFeed>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Invalid goalie slate date')
 const saved=cache.get(date);if(!force&&saved&&Date.now()-saved.at<60000)return saved.feed
 const running=pending.get(date);if(running)return running
 const request=(async()=>{
  const response=await fetch('https://www.dailyfaceoff.com/starting-goalies/'+date,{headers:{'User-Agent':'NHL-Tracker/1.7.8','Accept':'text/html'},cache:'no-store',signal:AbortSignal.timeout(15000)})
  if(!response.ok)throw Error('DFO starting-goalie request failed: '+response.status)
  const feed=parseDfoStartingGoalies(await response.text(),date);cache.set(date,{at:Date.now(),feed});return feed
 })();pending.set(date,request)
 try{return await request}finally{pending.delete(date)}
}
