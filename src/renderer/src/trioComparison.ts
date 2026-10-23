export type Outcome='HIT'|'MISS'|'UNKNOWN'
export type Family={key:string;date:string;gameId:string;team:string;players:string[];origin:string}
export type Quote={decimal:number;book:string;source:string;enteredAt?:string}
export type Ref={key:string;familyKey:string;players:string[];odds:number;book:string;note:string;enteredAt:string}
const norm=(v:string)=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/gi,'').toLowerCase()
export const playerSet=(p:string[])=>p.map(norm).sort().join('|')
export const familyKey=(date:string,gameId:string,team:string,p:string[])=>`${date}:${gameId}:${team}:${playerSet(p)}`
export const americanDecimal=(odds:number)=>Number.isFinite(odds)&&Math.abs(odds)>=100?1+(odds>0?odds/100:100/Math.abs(odds)):undefined
const validLegs=(b:any)=>b.category==='COMBOS'&&!b.bonusBet&&Array.isArray(b.legs)&&[2,3].includes(b.legs.length)&&b.legs.every((l:any)=>!l.voided&&l.kind!=='TEAM'&&['Point','Points'].includes(l.stat)&&Number(l.qty)===1&&l.team&&l.gameId&&l.player)&&new Set(b.legs.map((l:any)=>l.team)).size===1&&new Set(b.legs.map((l:any)=>String(l.gameId))).size===1&&new Set(b.legs.map((l:any)=>norm(l.player))).size===b.legs.length
const belongs=(b:any,f:Family)=>validLegs(b)&&b.date===f.date&&String(b.legs[0].gameId)===f.gameId&&b.legs[0].team===f.team
export function discoverFamilies(bets:any[],snapshots:any[]):Family[]{
 const found=new Map<string,Family>();const add=(date:string,gameId:string,team:string,players:string[],origin:string)=>{if(!date||!gameId||!team||players.length!==3||new Set(players.map(norm)).size!==3)return;const key=familyKey(date,gameId,team,players);if(!found.has(key))found.set(key,{key,date,gameId,team,players:[...players].sort((a,b)=>norm(a).localeCompare(norm(b))),origin})}
 for(const s of snapshots)if(Array.isArray(s.players)&&s.players.length===3)add(s.date,String(s.gameId),s.team,s.players,'Saved lineup trio')
 for(const b of bets)if(validLegs(b)&&b.legs.length===3)add(b.date,String(b.legs[0].gameId),b.legs[0].team,b.legs.map((l:any)=>l.player),'Placed trio · eligibility not verified here')
 const groups=new Map<string,any[]>();for(const b of bets)if(validLegs(b)&&b.legs.length===2){const k=`${b.date}:${b.legs[0].gameId}:${b.legs[0].team}`;groups.set(k,[...(groups.get(k)||[]),b])}
 for(const bs of groups.values()){
  const edges=new Set(bs.map(b=>playerSet(b.legs.map((l:any)=>l.player)))),names=new Map<string,string>();for(const b of bs)for(const l of b.legs)names.set(norm(l.player),l.player)
  const ps=[...names.values()];for(let a=0;a<ps.length;a++)for(let b=a+1;b<ps.length;b++)for(let c=b+1;c<ps.length;c++)if([[a,b],[a,c],[b,c]].every(ix=>edges.has(playerSet(ix.map(i=>ps[i])))))add(bs[0].date,String(bs[0].legs[0].gameId),bs[0].legs[0].team,[ps[a],ps[b],ps[c]],'Three placed pairs · inferred family; eligibility unverified')
 }
 return [...found.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.key.localeCompare(b.key))
}
export const markets=(f:Family)=>[f.players,[f.players[0],f.players[1]],[f.players[0],f.players[2]],[f.players[1],f.players[2]]]
export function evaluateFamily(f:Family,bets:any[],snapshots:any[],refs:Ref[],book='ALL'){
 const same=bets.filter(b=>belongs(b,f)),sets=markets(f)
 const outcome=(ps:string[]):{result:Outcome;conflict:boolean}=>{const flags=new Set<string>();for(const b of same)if(playerSet(b.legs.map((l:any)=>l.player))===playerSet(ps)&&['WON','LOST'].includes(b.status))flags.add(b.status==='WON'?'HIT':'MISS');for(const s of snapshots)if(s.date===f.date&&String(s.gameId)===f.gameId&&s.team===f.team&&playerSet(s.players||[])===playerSet(ps)&&['HIT','MISS'].includes(s.result))flags.add(s.result);return {result:flags.size===1?[...flags][0] as Outcome:'UNKNOWN',conflict:flags.size>1}}
 const states=sets.map(outcome)
 if(!states.some(s=>s.conflict)){
  if(states[0].result==='HIT')for(const s of states.slice(1)){if(s.result==='MISS'){s.conflict=true;states[0].conflict=true}else s.result='HIT'}
  const pairStates=states.slice(1);const derived=pairStates.some(s=>s.result==='MISS')?'MISS':pairStates.every(s=>s.result==='HIT')?'HIT':'UNKNOWN';if(derived!=='UNKNOWN'){if(states[0].result!=='UNKNOWN'&&states[0].result!==derived)states[0].conflict=true;else states[0].result=derived}
 }
 const quote=(ps:string[])=>{
  const manual=refs.filter(r=>r.familyKey===f.key&&playerSet(r.players)===playerSet(ps)&&(book==='ALL'||r.book===book));const candidates:Quote[]=[]
  for(const r of manual){const decimal=americanDecimal(r.odds);if(decimal)candidates.push({decimal,book:r.book,source:'Reference · '+r.note,enteredAt:r.enteredAt})}
  if(!manual.length){for(const b of same){if(playerSet(b.legs.map((l:any)=>l.player))!==playerSet(ps)||book!=='ALL'&&b.book!==book||b.status==='VOID')continue;const decimal=b.payout!=null&&Number(b.units)>0&&Number(b.unitSize)>0?Number(b.payout)/(Number(b.units)*Number(b.unitSize)):americanDecimal(Number(b.odds));if(decimal&&Number.isFinite(decimal)&&decimal>1)candidates.push({decimal,book:b.book||'Unknown',source:'Wager '+b.id})}
   for(const s of snapshots)if(s.date===f.date&&String(s.gameId)===f.gameId&&s.team===f.team&&playerSet(s.players||[])===playerSet(ps)&&s.marketAvailability!=='NOT_OFFERED'&&(book==='ALL'||s.book===book)){const decimal=americanDecimal(Number(s.odds));if(decimal)candidates.push({decimal,book:s.book||'Unknown',source:'Saved combo quote'})}
  }
  const unique=[...new Map(candidates.map(q=>[`${q.book}:${q.decimal.toFixed(6)}`,q])).values()];return {value:unique.length===1?unique[0]:undefined,ambiguous:unique.length>1}
 }
 const quotes=sets.map(quote),issues:string[]=[]
 if(states.some(s=>s.conflict))issues.push('Conflicting outcomes')
 if(states.some(s=>s.result==='UNKNOWN'))issues.push('Missing settled outcomes')
 if(quotes.some(q=>q.ambiguous))issues.push('Multiple prices; select book or record reference')
 if(quotes.some(q=>!q.value))issues.push('Missing prices')
 const complete=!issues.length,returns=sets.map((_,i)=>states[i].result==='HIT'?(quotes[i].value?.decimal??0)-1:-1)
 return {family:f,states,quotes,issues,complete,trio:complete?returns[0]:undefined,split:complete?.5*(returns[1]+returns[2]+returns[3]):undefined,equalSplit:complete?(returns[1]+returns[2]+returns[3])/3:undefined}
}
export const TRIO_REFS_KEY='nhlTracker:trioComparison:references:v1'
function read(key:string):any[]{try{const d=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(d)?d:[]}catch{return []}}
export function readComparisonData(){const rows:any[]=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i)||'';if(k.startsWith('nhlTracker:dailyComboSnapshot:v1:'))rows.push(...read(k));if(k.startsWith('nhlTracker:comboResults:day:v1:')){try{const d=JSON.parse(localStorage.getItem(k)||'null');if(Array.isArray(d?.rows))rows.push(...d.rows)}catch{}}}return{snapshots:rows,refs:read(TRIO_REFS_KEY) as Ref[]}}

export const TRIO_START='2026-10-21'
type Comparison=ReturnType<typeof evaluateFamily>
export type SplitRule={direction:'KEEP_ALL'|'SPLIT_ALL'|'KEEP_HIGH'|'KEEP_LOW';cutoff:number}
export const chooseTrio=(rule:SplitRule,decimal:number)=>rule.direction==='KEEP_ALL'||rule.direction==='KEEP_HIGH'&&decimal>=rule.cutoff||rule.direction==='KEEP_LOW'&&decimal<=rule.cutoff
export function optimizeTrios(input:Comparison[],equal=false){
 const rows=input.filter(r=>r.complete&&r.family.date>=TRIO_START).sort((a,b)=>a.family.date.localeCompare(b.family.date)),dates=[...new Set(rows.map(r=>r.family.date))]
 if(dates.length<3)return undefined
 // Whole dates stay together. Fit on the earlier dates, then freeze the rule.
 const splitDate=dates[Math.min(dates.length-1,Math.max(2,Math.floor(dates.length*.7)))],train=rows.filter(r=>r.family.date<splitDate),test=rows.filter(r=>r.family.date>=splitDate)
 const prices=[...new Set(train.map(r=>r.quotes[0].value!.decimal))].sort((a,b)=>a-b),rules:SplitRule[]=[{direction:'KEEP_ALL',cutoff:0},{direction:'SPLIT_ALL',cutoff:0},...prices.flatMap(cutoff=>[{direction:'KEEP_HIGH' as const,cutoff},{direction:'KEEP_LOW' as const,cutoff}])]
 const pair=(r:Comparison)=>equal?r.equalSplit!:r.split!,score=(rs:Comparison[],rule:SplitRule)=>rs.reduce((n,r)=>n+(chooseTrio(rule,r.quotes[0].value!.decimal)?r.trio!:pair(r)),0)
 let rule=rules[0],best=score(train,rule);for(const candidate of rules.slice(1)){const s=score(train,candidate);if(s>best+1e-9){rule=candidate;best=s}}
 const kept=test.filter(r=>chooseTrio(rule,r.quotes[0].value!.decimal)).length
 return{rule,trainCount:train.length,testCount:test.length,splitDate,trainNet:best,testNet:score(test,rule),testTrio:test.reduce((n,r)=>n+r.trio!,0),testSplit:test.reduce((n,r)=>n+pair(r),0),testRisk:kept+(test.length-kept)*(equal?1:1.5),trainEnd:train.at(-1)!.family.date}
}
