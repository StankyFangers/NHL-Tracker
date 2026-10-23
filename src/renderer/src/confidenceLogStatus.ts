export type LoggedTeam={key:string;team:string;opponent:string;score?:number;capturedAt?:string;started:boolean;inputWarnings:string[]}
export type ConfidenceLogStatus={date:string;expected:number;captured:number;missingStarted:number;firstCapturedAt?:string;lastCapturedAt?:string;incompleteInputs:number;teams:LoggedTeam[]}
export function confidenceLogStatus(date:string,games:any[],rows:any[],abbr:(team:any)=>string,now=Date.now()):ConfidenceLogStatus{
 const teams=new Map<string,LoggedTeam>()
 for(const game of games){
  if(!['PRE','FUT','LIVE','CRIT','FINAL','OFF'].includes(String(game.gameState)))continue
  const gameId=String(game.id||'');if(!gameId)continue
  const started=['LIVE','CRIT','FINAL','OFF'].includes(String(game.gameState))||Number.isFinite(Date.parse(game.startTimeUTC))&&Date.parse(game.startTimeUTC)<=now
  for(const [side,other] of [[game.awayTeam,game.homeTeam],[game.homeTeam,game.awayTeam]]){
   const team=abbr(side),opponent=abbr(other);if(!team||team==='???'||!opponent||opponent==='???')continue
   const key=`${gameId}:${team}`,row=rows.find(r=>r.date===date&&String(r.gameId)===gameId&&r.team===team&&typeof r.score==='number'&&Number.isFinite(r.score)),warnings:string[]=[]
   if(row){const context=row.inputs?.context,own=row.inputs?.offense
    if(context?.core?.date!==date||!context.core.teams?.some((t:any)=>t.team===team))warnings.push('NHL core inputs unavailable at capture')
    if(context?.opportunities?.date!==date||!context.opportunities.teams?.some((t:any)=>t.team===team))warnings.push('Chance inputs unavailable at capture')
    if(context?.goalieScoringEnabled!==false&&!Number.isFinite(own?.goalie_gaa))warnings.push('Starter GAA unavailable in the saved older model')
    if(!row.inputs?.comboModel?.updated)warnings.push('Combo factors retain baseline inputs')
   }
   const stamp=row?.capturedAt||row?.firstCapturedAt
   teams.set(key,{key,team,opponent,score:row?.score,capturedAt:stamp&&Number.isFinite(Date.parse(stamp))?stamp:undefined,started,inputWarnings:warnings})
  }
 }
 const list=[...teams.values()].sort((a,b)=>a.team.localeCompare(b.team)||a.key.localeCompare(b.key)),saved=list.filter(t=>t.score!=null),times=saved.map(t=>t.capturedAt).filter((s):s is string=>!!s).sort((a,b)=>Date.parse(a)-Date.parse(b))
 return{date,expected:list.length,captured:saved.length,missingStarted:list.filter(t=>t.score==null&&t.started).length,firstCapturedAt:times[0],lastCapturedAt:times.at(-1),incompleteInputs:saved.filter(t=>t.inputWarnings.length>0).length,teams:list}
}
