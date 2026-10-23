import {parseCoreStats,type CoreFeed} from '../shared/confidenceTeamStats'
let saved:CoreFeed|undefined
const pending=new Map<string,Promise<CoreFeed>>()
export async function fetchConfidenceTeamStats(date:string,force=false):Promise<CoreFeed>{
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
 if(date!==today)throw Error('Current NHL inputs are only refreshed for today; historical pregame ratings stay unchanged')
 if(!force&&saved?.date===date&&Date.now()-Date.parse(saved.checkedAt)<30*60*1000)return saved
 const existing=pending.get(date);if(existing)return existing
 const year=Number(date.slice(0,4))-(Number(date.slice(5,7))<9?1:0),season=year*10000+year+1
 const query=new URLSearchParams({isAggregate:'true',isGame:'false',start:'0',limit:'100',cayenneExp:`seasonId=${season} and gameTypeId=2 and gameDate<"${date}"`})
 const run=(async()=>{const response=await fetch('https://api.nhle.com/stats/rest/en/team/summary?'+query,{cache:'no-store',headers:{'User-Agent':'NHL-Tracker/1.7.8'},signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('NHL summary request failed: '+response.status);const feed=parseCoreStats(await response.json(),date);saved=feed;return feed})();pending.set(date,run)
 try{return await run}finally{pending.delete(date)}
}
