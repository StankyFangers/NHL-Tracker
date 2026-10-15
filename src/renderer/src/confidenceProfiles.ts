import { type Opportunity, type Thresholds, DEFAULT_THRESHOLDS, evaluate, multiplier, valid } from './confidenceOptimizer'

export type ProfileName='SAFE'|'BALANCED'|'AGGRESSIVE'|'MAX_RETURN'
export type RiskStats={baseline:number;adjusted:number;added:number;count:number;games:number;exposure:number;maxDrawdown:number;worstLosingStreak:number;missedProfit:number;skipped:number;faded:number;boosted:number}
export type ProfileResult={name:ProfileName;thresholds?:Thresholds;training?:RiskStats;validation?:RiskStats;status:'READY'|'INSUFFICIENT'|'UNVALIDATED';reason:string}
export type ProfileReport={profiles:ProfileResult[];current:Thresholds;currentValidation?:RiskStats;trainingCount:number;validationCount:number;trainingGames:number;validationGames:number;tested:number;excluded:number}
const key=(x:Opportunity)=>`${x.date}:${x.gameId}`
export function riskStats(rows:Opportunity[],t:Thresholds):RiskStats{
 const sorted=[...rows].sort((a,b)=>a.date.localeCompare(b.date)||a.gameId.localeCompare(b.gameId)||a.id.localeCompare(b.id))
 const base=evaluate(sorted,t),daily=new Map<string,number>();let exposure=0,missedProfit=0
 for(const x of sorted){const m=multiplier(x.score,t);exposure+=m; if(m===0&&x.netUnits>0)missedProfit+=x.netUnits;daily.set(x.date,(daily.get(x.date)||0)+m*x.netUnits)}
 let equity=0,peak=0,maxDrawdown=0,streak=0,worstLosingStreak=0
 for(const amount of daily.values()){equity+=amount;peak=Math.max(peak,equity);maxDrawdown=Math.max(maxDrawdown,peak-equity);streak=amount<0?streak+1:0;worstLosingStreak=Math.max(worstLosingStreak,streak)}
 return {...base,games:new Set(sorted.map(key)).size,exposure,maxDrawdown,worstLosingStreak,missedProfit}
}
export function optimizeProfiles(input:Opportunity[],current:Thresholds=DEFAULT_THRESHOLDS):ProfileReport{
 const rows=input.filter(valid).sort((a,b)=>a.date.localeCompare(b.date)||a.gameId.localeCompare(b.gameId)||a.id.localeCompare(b.id))
 // Split by entire dates to avoid correlated games and wagers leaking into validation.
 const dates=[...new Set(rows.map(x=>x.date))];const cut=Math.floor(dates.length*.7),trainDates=new Set(dates.slice(0,cut));
 const train=rows.filter(x=>trainDates.has(x.date)),test=rows.filter(x=>!trainDates.has(x.date));
 const trainGames=new Set(train.map(key)).size,testGames=new Set(test.map(key)).size
 const report:ProfileReport={profiles:[],current,trainingCount:train.length,validationCount:test.length,trainingGames:trainGames,validationGames:testGames,tested:0,excluded:input.length-rows.length,currentValidation:riskStats(test,current)}
 const sufficient=train.length>=100&&test.length>=40&&trainGames>=20&&testGames>=8&&dates.length>=8
 if(!sufficient){report.profiles=(['SAFE','BALANCED','AGGRESSIVE','MAX_RETURN'] as ProfileName[]).map(name=>({name,status:'INSUFFICIENT',reason:'Need ≥100 priced training combos / 20 games, ≥40 validation combos / 8 games, and ≥8 separate dates.'}));return report}
 const candidates:{t:Thresholds;s:RiskStats}[]=[],allCandidates:{t:Thresholds;s:RiskStats}[]=[]
 for(let skip=50;skip<=70;skip++)for(let fade=skip+1;fade<=78;fade++)for(let boost=Math.max(fade+1,72);boost<=95;boost++){
  report.tested++;const t={skip,fade,boost},s=riskStats(train,t)
  allCandidates.push({t,s})
  if(s.skipped<5||s.faded<5||s.boosted<5||s.exposure<train.length*.25)continue
  candidates.push({t,s})
 }
 const objective=(name:ProfileName,s:RiskStats)=>name==='MAX_RETURN'?s.adjusted:name==='SAFE'?(s.added/s.count)-.6*(s.maxDrawdown/Math.max(1,s.count))-.12*(s.exposure/s.count):name==='BALANCED'?(s.added/s.count)-.25*(s.maxDrawdown/Math.max(1,s.count)):(s.added/s.count)
 for(const name of ['SAFE','BALANCED','AGGRESSIVE','MAX_RETURN'] as ProfileName[]){
  const pool=name==='MAX_RETURN'?allCandidates:candidates
  const ranked=[...pool].sort((a,b)=>objective(name,b.s)-objective(name,a.s)||a.s.maxDrawdown-b.s.maxDrawdown)
  const best=ranked[0];if(!best){report.profiles.push({name,status:'INSUFFICIENT',reason:'Not enough observations in each signal tier.'});continue}
  const validation=riskStats(test,best.t),currentStats=report.currentValidation!
  // Evaluate validation only once after training selection; no threshold tuning on holdout.
  const passes=name!=='MAX_RETURN'&&validation.added>0&&validation.adjusted>currentStats.adjusted
  report.profiles.push({name,thresholds:best.t,training:best.s,validation,status:passes?'READY':'UNVALIDATED',reason:name==='MAX_RETURN'?'Highest training net units across all tested cutoffs; retrospective upper bound only, not eligible for automatic application. Holdout shown to expose overfitting.':passes?'Improved net units over both 1× and current strategy on later unseen dates.':'Did not outperform both 1× and the current strategy on later unseen dates; do not apply.'})
 }
 return report
}
