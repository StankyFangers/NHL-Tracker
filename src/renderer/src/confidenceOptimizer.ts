/** Unit-based strategy optimization. No goal-based proxy, invented odds, or look-ahead. */
export type Thresholds={skip:number;fade:number;boost:number}
export type Opportunity={id:string;date:string;gameId:string;team:string;players:string[];score:number;netUnits:number;priceSource:'ACTUAL'|'ESTIMATED';grade:'HIT'|'MISS';eligible:true;modelVersion:string;settled:true}
export type StrategyStats={baseline:number;adjusted:number;added:number;count:number;skipped:number;faded:number;boosted:number}
export type Optimization={status:'READY'|'INSUFFICIENT';reason:string;trainCount:number;testCount:number;trainGames:number;testGames:number;current:Thresholds;candidate?:Thresholds;training?:StrategyStats;validation?:StrategyStats;baselineValidation?:StrategyStats;tested:number}
export const DEFAULT_THRESHOLDS:Thresholds={skip:60,fade:65,boost:85}
const KEY='nhlTrackerConfidenceOpportunities:v1'
const ACTIVE='nhlTrackerConfidenceActiveStrategy:v1'
export function readOpportunities():Opportunity[]{try{const rows=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(rows)?rows:[]}catch{return []}}
export function appendOpportunities(rows:Opportunity[]):number{
 const existing=readOpportunities(),ids=new Set(existing.map(x=>x.id));let count=0
 for(const row of rows){if(!valid(row)||ids.has(row.id))continue;existing.push(row);ids.add(row.id);count++}
 if(count)localStorage.setItem(KEY,JSON.stringify(existing));return count
}
export function readActiveStrategy():Thresholds{try{const x=JSON.parse(localStorage.getItem(ACTIVE)||'null');return validThresholds(x)?x:DEFAULT_THRESHOLDS}catch{return DEFAULT_THRESHOLDS}}
export function saveActiveStrategy(t:Thresholds){if(!validThresholds(t))throw new Error('Invalid thresholds');localStorage.setItem(ACTIVE,JSON.stringify(t))}
export function validThresholds(t:any):t is Thresholds{return !!t&&Number.isInteger(t.skip)&&Number.isInteger(t.fade)&&Number.isInteger(t.boost)&&t.skip>=40&&t.skip<t.fade&&t.fade<t.boost&&t.boost<=100}
export function valid(o:Opportunity):boolean{return !!o&&o.eligible===true&&o.settled===true&&['HIT','MISS'].includes(o.grade)&&['ACTUAL','ESTIMATED'].includes(o.priceSource)&&Number.isFinite(o.netUnits)&&Number.isFinite(o.score)&&o.score>=0&&o.score<=100&&!!o.id&&!!o.date&&!!o.gameId&&!!o.team&&Array.isArray(o.players)&&o.players.length>=2&&o.players.length<=3&&!!o.modelVersion}
export function multiplier(score:number,t:Thresholds):number{return score<t.skip?0:score<t.fade?.5:score>=t.boost?1.5:1}
export function evaluate(rows:Opportunity[],t:Thresholds):StrategyStats{let baseline=0,adjusted=0,skipped=0,faded=0,boosted=0;for(const x of rows){const m=multiplier(x.score,t);baseline+=x.netUnits;adjusted+=x.netUnits*m;if(m===0)skipped++;if(m===.5)faded++;if(m===1.5)boosted++}return{baseline,adjusted,added:adjusted-baseline,count:rows.length,skipped,faded,boosted}}
const uniqueGames=(xs:Opportunity[])=>new Set(xs.map(x=>`${x.date}:${x.gameId}`)).size
export function optimize(input:Opportunity[],current:Thresholds=DEFAULT_THRESHOLDS):Optimization{
 // Entire games, not individual correlated bets, are kept together across the time split.
 const rows=input.filter(valid).sort((a,b)=>a.date.localeCompare(b.date)||a.gameId.localeCompare(b.gameId)||a.id.localeCompare(b.id))
 const gameKeys=[...new Set(rows.map(x=>`${x.date}:${x.gameId}`))],cut=Math.floor(gameKeys.length*.7)
 const trainKeys=new Set(gameKeys.slice(0,cut)),train=rows.filter(x=>trainKeys.has(`${x.date}:${x.gameId}`)),test=rows.filter(x=>!trainKeys.has(`${x.date}:${x.gameId}`))
 const result:Optimization={status:'INSUFFICIENT',reason:'',trainCount:train.length,testCount:test.length,trainGames:uniqueGames(train),testGames:uniqueGames(test),current,tested:0}
 if(train.length<100||test.length<40||result.trainGames<20||result.testGames<8){result.reason='Need at least 100 priced training opportunities across 20 games and 40 later opportunities across 8 games. No thresholds recommended yet.';return result}
 let best:Thresholds|undefined,bestValue=-Infinity
 // Search whole-number cutoffs; penalize tiny signal groups and prefer simpler/default settings on ties.
 for(let skip=50;skip<=70;skip++)for(let fade=skip+1;fade<=78;fade++)for(let boost=Math.max(fade+1,72);boost<=95;boost++){
  const t={skip,fade,boost};result.tested++
  const s=evaluate(train,t)
  if(s.skipped<5||s.faded<5||s.boosted<5)continue
  const score=s.added/train.length
  const tieDistance=Math.abs(skip-current.skip)+Math.abs(fade-current.fade)+Math.abs(boost-current.boost)
  if(score>bestValue+1e-9||(Math.abs(score-bestValue)<1e-9&&best&&tieDistance<Math.abs(best.skip-current.skip)+Math.abs(best.fade-current.fade)+Math.abs(best.boost-current.boost))){best=t;bestValue=score}
 }
 if(!best){result.reason='Not enough examples in each SKIP, FADE and BOOST band to optimize reliably.';return result}
 result.candidate=best;result.training=evaluate(train,best);result.validation=evaluate(test,best);result.baselineValidation=evaluate(test,current)
 // Holdout must beat both no-adjustment and the existing policy; never optimize against holdout.
 if(result.validation.added<=0||result.validation.adjusted<=result.baselineValidation.adjusted){result.reason='Candidate did not beat the current strategy and normal-unit baseline on later unseen games. Keep current thresholds.';return result}
 result.status='READY';result.reason='Candidate improved net units on later unseen games. Review before applying; historical performance is not a guarantee.';return result
}
