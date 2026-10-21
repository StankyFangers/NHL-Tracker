export const STRATEGY={skip:67.5,fade:72.5,boost:85}
export type Bands={skip:number;fade:number;boost:number}
export type Result={id:string;date:string;team:string;opponent:string;gameId:string;net:number;score?:number;units:number;status:string;olderInputs:boolean}
export type GamePoint={key:string;date:string;gameId:string;team:string;opponent:string;score?:number;net:number;adjusted:number;count:number;missing:number;olderInputs:boolean}
export const multiplier=(score:number,b:Bands=STRATEGY)=>score<b.skip?0:score<b.fade?.5:score<b.boost?1:1.5
export function netUnits(b:any):number|undefined{
 const units=Number(b.units);if(!Number.isFinite(units)||units<=0)return
 if(b.status==='VOID')return 0
 if(b.status==='LOST')return b.bonusBet?0:-units
 if(b.status!=='WON')return
 const risk=b.bonusBet?0:units
 if(b.payout!=null&&Number(b.unitSize)>0){const n=Number(b.payout)/Number(b.unitSize)-risk;return Number.isFinite(n)?n:undefined}
 const odds=Number(b.odds);if(!Number.isFinite(odds)||odds===0)return
 return units*(odds>0?odds/100:100/Math.abs(odds))
}
export function buildResults(bets:any[],snapshots:any[],seasonStart:string){
 const results:Result[]=[],excluded={unassigned:0,unpriced:0,pending:0};const seen=new Set<string>()
 for(const b of bets){if(b.category!=='COMBOS'||b.date<seasonStart||seen.has(b.id))continue;seen.add(b.id)
  if(!['WON','LOST','VOID'].includes(b.status)){excluded.pending++;continue}
  const legs=(b.legs||[]).filter((l:any)=>!l.voided);const teams=[...new Set(legs.map((l:any)=>l.team).filter(Boolean))],games=[...new Set(legs.map((l:any)=>String(l.gameId||'')).filter(Boolean))]
  // Cross-team or cross-game combos have no single team matchup score.
  const net=netUnits(b);if(net==null){excluded.unpriced++;continue}
  if(!legs.length||teams.length!==1||games.length!==1||legs.some((l:any)=>l.kind==='TEAM'||!l.team||!l.gameId)){excluded.unassigned++;results.push({id:b.id,date:b.date,team:'MULTI',opponent:'',gameId:'UNASSIGNED:'+b.id,net,units:Number(b.units),status:b.status,olderInputs:false});continue}
  const snapshot=snapshots.find(p=>p.date===b.date&&p.team===teams[0]&&String(p.gameId)===games[0]);const n=snapshot?.score
  results.push({id:b.id,date:b.date,team:String(teams[0]),opponent:snapshot?.opponent||legs[0].opponent||'',gameId:String(games[0]),net,score:typeof n==='number'&&Number.isFinite(n)?n:undefined,units:Number(b.units),status:b.status,olderInputs:!!snapshot&&String(snapshot.modelAsOf).slice(0,10)<b.date})
 }
 return {results,excluded}
}
export function gamePoints(rows:Result[],snapshots:any[],seasonStart:string):GamePoint[]{
 const map=new Map<string,GamePoint>();const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
 for(const s of snapshots){if(s.date<seasonStart||(!s.finalAt&&s.goals==null&&s.date>=today))continue;const key=`${s.gameId}:${s.team}`;if(map.has(key))continue;map.set(key,{key,date:s.date,team:s.team,opponent:s.opponent,gameId:String(s.gameId),score:s.score,net:0,adjusted:0,count:0,missing:0,olderInputs:String(s.modelAsOf).slice(0,10)<s.date})}
 for(const r of rows){if(r.team==='MULTI')continue;if(r.date>=today&&!snapshots.some(s=>String(s.gameId)===r.gameId&&s.team===r.team&&(s.finalAt||s.goals!=null)))continue;const key=`${r.gameId}:${r.team}`;let p=map.get(key);if(!p){p={key,date:r.date,team:r.team,opponent:r.opponent,gameId:r.gameId,score:r.score,net:0,adjusted:0,count:0,missing:0,olderInputs:r.olderInputs};map.set(key,p)}p.net+=r.net;p.count++;if(r.score!=null)p.adjusted+=r.net*multiplier(r.score);else p.missing++}
 return [...map.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.gameId.localeCompare(b.gameId))
}
export function optimizeThresholds(rows:Result[]){
 const eligible=rows.filter(r=>r.score!=null);if(!eligible.length)return null
 // Exhaustive 0.5-point grid. Prefix sums make each candidate constant time.
 const prefix=new Array(202).fill(0);for(const r of eligible)prefix[Math.min(200,Math.max(0,Math.floor(r.score!*2)))+1]+=r.net
 for(let i=1;i<prefix.length;i++)prefix[i]+=prefix[i-1]
 const total=prefix[201];let best=-Infinity,bands={...STRATEGY},tested=0
 for(let s=0;s<=198;s++)for(let f=s+1;f<=199;f++)for(let b=f+1;b<=200;b++){
  const value=.5*(prefix[f]-prefix[s])+(prefix[b]-prefix[f])+1.5*(total-prefix[b]);tested++
  const candidate={skip:s/2,fade:f/2,boost:b/2};const distance=(x:Bands)=>Math.abs(x.skip-STRATEGY.skip)+Math.abs(x.fade-STRATEGY.fade)+Math.abs(x.boost-STRATEGY.boost)
  if(value>best+1e-9||(Math.abs(value-best)<1e-9&&distance(candidate)<distance(bands))){best=value;bands=candidate}
 }
 return {bands,net:best,tested,count:eligible.length,standard:eligible.reduce((n,r)=>n+r.net,0),current:eligible.reduce((n,r)=>n+r.net*multiplier(r.score!),0)}
}
