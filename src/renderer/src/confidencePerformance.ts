import { CONFIDENCE_AS_OF, CONFIDENCE_STATUS, CONFIDENCE_TEAMS, matchupConfidence } from './confidenceEngine'

export type Signal = 'SKIP'|'FADE'|'NEUTRAL'|'BOOST'
export type Prediction = {id:string;date:string;gameId:string;team:string;opponent:string;score:number;signal:Signal;offense:number;vulnerability:number;components:unknown;modelAsOf:string;modelStatus:string;capturedAt:string;source:'PREGAME';goals?:number;finalAt?:string}
export type WagerGrade = {id:string;date:string;betId:string;predictionId?:string;signal?:Signal;actualUnits:number;shadowUnits:number;status:string;note?:string}
const KEY='nhlTrackerConfidencePredictions:v1'
const BETKEY='nhlTrackerConfidenceWagerLinks:v1'
const safeRead=<T,>(key:string,fallback:T):T=>{try{return JSON.parse(localStorage.getItem(key)||'null')||fallback}catch{return fallback}}
export const confidenceSignal=(n:number):Signal=>n<60?'SKIP':n<65?'FADE':n>=85?'BOOST':'NEUTRAL'
export const readPredictions=():Prediction[]=>safeRead(KEY,[])
export const readWagerLinks=():Record<string,string|null>=>safeRead(BETKEY,{})
export function capturePredictions(date:string,games:any[],abbr:(team:any)=>string):boolean{
 const existing=readPredictions(),known=new Set(existing.map(p=>p.id));let changed=false
 for(const g of games){if(!['PRE','FUT'].includes(String(g.gameState||'')))continue
  const away=abbr(g.awayTeam),home=abbr(g.homeTeam)
  for(const [team,opponent] of [[away,home],[home,away]]){
   const id=`${date}:${g.id}:${team}`;if(known.has(id))continue
   // Never reuse a stale ratings snapshot for a later slate.
   if(String(CONFIDENCE_AS_OF).slice(0,10)!==date)continue
   const score=matchupConfidence(team,opponent),off=CONFIDENCE_TEAMS[team],def=CONFIDENCE_TEAMS[opponent]
   if(score==null||!off||!def)continue
   existing.push({id,date,gameId:String(g.id),team,opponent,score,signal:confidenceSignal(score),offense:off.off_score,vulnerability:def.def_score,components:{offense:{...off},defense:{...def}},modelAsOf:String(CONFIDENCE_AS_OF),modelStatus:String(CONFIDENCE_STATUS),capturedAt:new Date().toISOString(),source:'PREGAME'})
   known.add(id);changed=true
  }
 }
 if(changed)localStorage.setItem(KEY,JSON.stringify(existing))
 return changed
}
export function finalizePredictions(date:string,games:any[],abbr:(team:any)=>string):boolean{
 const rows=readPredictions();let changed=false
 for(const g of games){if(!['FINAL','OFF'].includes(String(g.gameState||'')))continue
  for(const [team,goals] of [[abbr(g.awayTeam),g.awayTeam?.score],[abbr(g.homeTeam),g.homeTeam?.score]] as const){
   const row=rows.find(p=>p.id===`${date}:${g.id}:${team}`)
   if(!row||!Number.isFinite(Number(goals))||goals==null)continue
   if(row.goals!==Number(goals)){row.goals=Number(goals);row.finalAt=new Date().toISOString();changed=true}
  }
 }
 if(changed)localStorage.setItem(KEY,JSON.stringify(rows));return changed
}
export function linkWagers(bets:any[],predictions:Prediction[]):boolean{
 const links=readWagerLinks();let changed=false
 for(const b of bets){if(Object.prototype.hasOwnProperty.call(links,b.id))continue
  if(b.source==='HISTORICAL_REVIEW')continue
  const legs=(b.legs||[]).filter((l:any)=>!l.voided)
  if(!legs.length)continue
  if(!predictions.some(p=>p.date===b.date))continue
  const ids=[...new Set(legs.map((l:any)=>String(l.gameId||'')))];const teams=[...new Set(legs.map((l:any)=>String(l.team||'')))].filter(Boolean)
  const match=ids.length===1&&teams.length===1?predictions.find(p=>p.date===b.date&&p.gameId===ids[0]&&p.team===teams[0]):undefined
  // Explicit null means ambiguous, never silently assign cross-team wagers.
  links[b.id]=match?.id||null;changed=true
 }
 if(changed)localStorage.setItem(BETKEY,JSON.stringify(links));return changed
}
export function wagerGrades(bets:any[],predictions:Prediction[]):WagerGrade[]{
 const links=readWagerLinks(),lookup=new Map(predictions.map(p=>[p.id,p]))
 return bets.filter(b=>['WON','LOST','VOID'].includes(String(b.status||''))).map(b=>{
  const pred=lookup.get(links[b.id]||'');const stake=Number(b.units)||0;const dollars=stake*(Number(b.unitSize)||0)
  const net=b.status==='VOID'?0:b.status==='LOST'?-stake:b.payout!=null&&Number(b.unitSize)>0?(Number(b.payout)-dollars)/Number(b.unitSize):b.odds!=null?(Number(b.odds)>0?stake*Number(b.odds)/100:stake*100/Math.abs(Number(b.odds))):0
  const multiplier=pred?.signal==='SKIP'?0:pred?.signal==='FADE'?0.5:1
  return{id:String(b.id),betId:String(b.id),date:String(b.date),predictionId:pred?.id,signal:pred?.signal,actualUnits:net,shadowUnits:pred?net*multiplier:net,status:b.status,note:pred?undefined:'Unclassified: missing or ambiguous pregame score'}
 })
}
