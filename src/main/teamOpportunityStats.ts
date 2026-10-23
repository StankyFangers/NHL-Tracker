import {parseTeamOpportunityStats,type OpportunityFeed} from '../shared/teamOpportunityStats'
let saved:OpportunityFeed|undefined,pending:Promise<OpportunityFeed>|undefined
export async function fetchTeamOpportunityStats(date:string,force=false):Promise<OpportunityFeed>{
 const now=new Date();const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now),get=(k:string)=>parts.find(p=>p.type===k)?.value;const today=`${get('year')}-${get('month')}-${get('day')}`
 if(date!==today)throw Error('No archived all-situations team stats for this slate; current stats are not used for past predictions')
 if(!force&&saved?.date===date&&Date.now()-Date.parse(saved.checkedAt)<30*60*1000)return saved
 if(pending)return pending
 const year=Number(date.slice(0,4))-(Number(date.slice(5,7))<9?1:0)
 const request=(async()=>{const response=await fetch(`https://moneypuck.com/moneypuck/playerData/seasonSummary/${year}/regular/teams.csv`,{headers:{'User-Agent':'NHL-Tracker/1.7.8'},cache:'no-store',signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('MoneyPuck team stats request failed: '+response.status);const result=parseTeamOpportunityStats(await response.text(),date,year);if(result.teams.length!==32)throw Error('MoneyPuck is missing teams; a full league is required to rank confidence inputs');saved=result;return result})();pending=request
 try{return await request}finally{pending=undefined}
}
