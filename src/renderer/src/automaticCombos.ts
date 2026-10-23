import {CONFIDENCE_TEAMS,CONFIDENCE_AS_OF} from './confidenceEngine'
import {netUnits} from './confidenceResults'
import {officialGameDate} from './nhlGameDate'
const INDEX='nhlTracker:dailyComboSnapshot:index:v1',dayKey=(date:string)=>`nhlTracker:dailyComboSnapshot:v1:${date}`
const resultKey=(date:string)=>`nhlTracker:comboResults:day:v1:${date}`
const read=<T,>(key:string,fallback:T):T=>{try{return JSON.parse(localStorage.getItem(key)||'null')||fallback}catch{return fallback}}
export type AutoCombo={key:string;date:string;gameId:number;matchup:string;team:string;players:string[];status:string;capturedAt:string;opponent?:string;odds?:number;book?:string;referenceUnits?:number;[key:string]:any}
export const playerKey=(s:string)=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/gi,'').toLowerCase()
export function comboGroups(info:any):string[][]{
 const out=new Map<string,string[]>();for(const line of info?.forwardLines||[])for(const pp of [info.pp1||[],info.pp2||[]]){
  const names=[...new Map<string,string>((line as string[]).filter(n=>(pp as string[]).some(p=>playerKey(p)===playerKey(n))).map(n=>[playerKey(n),n])).values()].sort((a,b)=>playerKey(a).localeCompare(playerKey(b)))
  if(names.length>=2)out.set(names.map(playerKey).join('|'),names)
 }return [...out.values()]
}
export function recordDailyCombos(date:string,games:any[],lineups:Record<string,any>,abbr:(t:any)=>string,confirmed:(i:any,d:string)=>boolean):boolean{
 const existing=read<AutoCombo[]>(dayKey(date),[]);let changed=false
 for(const g of games){
  if(officialGameDate(g)!==date)continue
  const cutoff=Date.parse(g.startTimeUTC);if(!['PRE','FUT'].includes(String(g.gameState))||(Number.isFinite(cutoff)&&Date.now()>=cutoff))continue
  for(const team of [abbr(g.awayTeam),abbr(g.homeTeam)]){
   const record=read<any>(`nhlTracker:dfoSnapshots:v1:${date}:${team}`,null)
   const beforeStart=(s:any)=>s&&(!Number.isFinite(cutoff)||Date.parse(s.observedAt)<cutoff)
   const saved=beforeStart(record?.confirmed)?record.confirmed:beforeStart(record?.latest)?record.latest:beforeStart(record?.firstProjected)?record.firstProjected:null
   const info=saved||lineups[team];if(!info)continue
   const groups=comboGroups(info);if(!groups.length)continue
   const isConfirmed=saved?!!saved.confirmed:confirmed(info,date),status=isConfirmed?'CONFIRMED':'PROJECTED'
   const prior=existing.filter(c=>c.gameId===Number(g.id)&&c.team===team)
   if(!isConfirmed&&prior.some(c=>c.status==='CONFIRMED'))continue
   const next=groups.map(players=>{const key=`${g.id}:${team}:${players.map(playerKey).sort().join('|')}`,old=prior.find(c=>c.key===key);return {...old,key,date,gameId:Number(g.id),matchup:`${abbr(g.awayTeam)} @ ${abbr(g.homeTeam)}`,opponent:team===abbr(g.awayTeam)?abbr(g.homeTeam):abbr(g.awayTeam),team,players,status,capturedAt:old?.status===status?old.capturedAt:new Date().toISOString()}})
   if(JSON.stringify(prior)!==JSON.stringify(next)){for(let i=existing.length-1;i>=0;i--)if(existing[i].gameId===Number(g.id)&&existing[i].team===team)existing.splice(i,1);existing.push(...next);changed=true}
  }
 }
 if(changed){localStorage.setItem(dayKey(date),JSON.stringify(existing));const dates=read<string[]>(INDEX,[]);if(!dates.includes(date))localStorage.setItem(INDEX,JSON.stringify([...dates,date].sort()))}
 return changed
}
const displayName=(p:any)=>typeof p.name==='string'?p.name:p.name?.default||p.fullName?.default||p.fullName||[p.firstName?.default||p.firstName,p.lastName?.default||p.lastName].filter(Boolean).join(' ')
export function gradeCombo(combo:AutoCombo,box:any,bets:any[]){
 const side=box.awayTeam?.abbrev===combo.team?'awayTeam':box.homeTeam?.abbrev===combo.team?'homeTeam':null
 const sections=side?box.playerByGameStats?.[side]:null
 const players:any[]=sections?Object.values(sections).flatMap(v=>Array.isArray(v)?v:[]):[]
 const points=combo.players.map(name=>{const matches=players.filter(p=>playerKey(displayName(p))===playerKey(name));if(matches.length!==1)return undefined;const p=matches[0];const n=p.points??(p.goals!=null&&p.assists!=null?Number(p.goals)+Number(p.assists):undefined);return n==null||!Number.isFinite(Number(n))?undefined:Number(n)})
 const opponent=combo.opponent||combo.matchup.split('@').map(s=>s.trim()).find(s=>s!==combo.team)||''
 const result=points.some(p=>p==null)?'UNVERIFIED':points.every(p=>p!>=1)?'HIT':'MISS'
 const matching=bets.filter(b=>b.category==='COMBOS'&&b.date===combo.date&&b.legs?.length===combo.players.length&&b.legs.every((l:any)=>!l.voided&&l.kind!=='TEAM'&&l.stat==='Point'&&Number(l.qty)===1&&String(l.gameId)===String(combo.gameId)&&l.team===combo.team&&combo.players.some(p=>playerKey(p)===playerKey(l.player))))
 const priced=matching.filter(b=>b.odds!=null&&Math.abs(Number(b.odds))>=100||b.payout!=null&&Number(b.payout)>0&&Number(b.units)*Number(b.unitSize)>0)
 let odds=combo.odds,source=odds!=null?'REFERENCE':'UNPRICED'
 if(odds==null&&priced.length===1){const b=priced[0],risk=Number(b.units)*Number(b.unitSize);odds=b.odds!=null?Number(b.odds):Number(b.payout)/risk>=2?(Number(b.payout)/risk-1)*100:-100/(Number(b.payout)/risk-1);source=`BET ${b.id}`}
 if(combo.marketAvailability==='NOT_OFFERED'){odds=undefined;source='NOT OFFERED'}
 const net1u=odds!=null&&Number.isFinite(odds)&&Math.abs(odds)>=100&&result!=='UNVERIFIED'?(result==='MISS'?-1:odds>0?odds/100:100/Math.abs(odds)):undefined
 return {key:combo.key,date:combo.date,gameId:combo.gameId,matchup:combo.matchup,team:combo.team,opponent,players:combo.players,status:combo.status,result,odds,book:combo.book,source,referenceUnits:combo.referenceUnits??1,net1u,automatic:true,gradedAt:new Date().toISOString()}
}
export async function gradeSavedDays(bets:any[],api:any,alive:()=>boolean,force=false){
 const discovered=Array.from({length:localStorage.length},(_,i)=>localStorage.key(i)||'').filter(k=>k.startsWith('nhlTracker:dailyComboSnapshot:v1:')).map(k=>k.slice(-10));const dates=[...new Set([...read<string[]>(INDEX,[]),...discovered])].sort();if(discovered.length)localStorage.setItem(INDEX,JSON.stringify(dates));let count=0
 for(const date of dates){if(!alive())break;const previous=read<any>(resultKey(date),null);if(!force&&previous?.automatic&&Date.now()-Date.parse(previous.verifiedAt)<15*60*1000)continue;const combos=read<AutoCombo[]>(dayKey(date),[]);if(!combos.length)continue
  let schedule:any;try{schedule=await api.score(date)}catch(e){if(force)throw Error('Combo history schedule check failed for '+date+': '+String(e));continue}
  const old=read<any>(resultKey(date),{rows:[]}),rows=new Map<string,any>((old.rows||[]).map((r:any)=>[r.key,r]))
  for(const game of schedule?.games||[]){if(!['FINAL','OFF'].includes(String(game.gameState)))continue
   const selected=combos.filter(c=>c.gameId===Number(game.id));if(!selected.length)continue
   let box:any;try{box=await api.boxscore(Number(game.id))}catch(e){if(force)throw Error('Combo history boxscore check failed for '+game.id+': '+String(e));continue}
   if(!['FINAL','OFF'].includes(String(box?.gameState)))continue
   for(const c of selected){rows.set(c.key,gradeCombo(c,box,bets));count++}
  }
  if(!alive())break
  if(rows.size){localStorage.setItem(resultKey(date),JSON.stringify({date,verifiedAt:new Date().toISOString(),rows:[...rows.values()],automatic:true}));const index=read<string[]>('nhlTracker:comboResults:index:v1',[]);if(!index.includes(date))localStorage.setItem('nhlTracker:comboResults:index:v1',JSON.stringify([...index,date].sort()));window.dispatchEvent(new Event('nhlTracker:comboResultsUpdated'))}
 }return count
}
export const comboModelInfo={version:'automatic-combo-factors-v1',calculatedFor:'',updated:false,baselineAsOf:String(CONFIDENCE_AS_OF)}
const base=JSON.parse(JSON.stringify(CONFIDENCE_TEAMS)) as typeof CONFIDENCE_TEAMS
/** Refresh only documented combo-dependent factors, preserving other dated inputs. */
export function refreshComboFactors(date:string,bets:any[]){
 for(const [team,r] of Object.entries(base))Object.assign(CONFIDENCE_TEAMS[team],r);Object.assign(comboModelInfo,{calculatedFor:date,updated:false});
 const year=Number(date.slice(0,4))-(Number(date.slice(5,7))<9?1:0),seasonStart=`${year}-09-01`;
 const days=read<string[]>(INDEX,[]).filter(d=>d>=seasonStart&&d<date),graded=days.flatMap(d=>read<any>(resultKey(d),{rows:[]}).rows||[]).filter((r:any)=>['HIT','MISS'].includes(r.result))
 const combos=days.flatMap(d=>read<AutoCombo[]>(dayKey(d),[]));const netByTeam=new Map<string,number[]>(),allowedByTeam=new Map<string,number[]>()
 for(const b of bets){if(b.category!=='COMBOS'||b.date<seasonStart||b.date>=date||!['WON','LOST'].includes(b.status))continue;const legs=b.legs||[];if(legs.length<2||legs.length>3||legs.some((l:any)=>l.voided||l.kind==='TEAM'||l.stat!=='Point'||Number(l.qty)!==1))continue
  const match=combos.find(c=>c.date===b.date&&legs.every((l:any)=>l.team===c.team&&String(l.gameId)===String(c.gameId)&&c.players.some(p=>playerKey(p)===playerKey(l.player))));const net=netUnits(b);if(!match||net==null||!Number.isFinite(Number(b.units))||Number(b.units)<=0)continue
  netByTeam.set(match.team,[...(netByTeam.get(match.team)||[]),net/Number(b.units)]);const opponent=match.opponent||match.matchup.split('@').map(s=>s.trim()).find(s=>s!==match.team);if(opponent)allowedByTeam.set(opponent,[...(allowedByTeam.get(opponent)||[]),net/Number(b.units)])
 }
 const mean=(xs:number[])=>xs.reduce((a,b)=>a+b,0)/xs.length
 const samples:Record<string,Record<string,number>>={}
 for(const team of Object.keys(base)){
  samples[team]={...base[team]};const own=netByTeam.get(team),against=allowedByTeam.get(team)
  if(own?.length)samples[team].xupc=mean(own);if(against?.length)samples[team].xupca=mean(against)
  for(const [field,filter] of [['off_l5',(r:any)=>r.team===team],['def_l5',(r:any)=>r.opponent===team]] as const){const rs=graded.filter(filter),games=[...new Set<string>(rs.sort((a:any,b:any)=>b.date.localeCompare(a.date)).map((r:any)=>String(r.gameId)))].slice(0,5),last=rs.filter((r:any)=>games.includes(String(r.gameId)));if(last.length)samples[team][field]=last.filter((r:any)=>r.result==='HIT').length/last.length}
 }
 const bands=(rank:number,prefix:string)=>{const points=Object.values(base).map(r=>({rank:r[prefix+'_rank'],points:r[prefix+'_pts']})).filter(x=>Number.isFinite(x.rank)&&Number.isFinite(x.points)).sort((a,b)=>Math.abs(a.rank-rank)-Math.abs(b.rank-rank));return points[0]?.points??0}
 for(const [field,prefix] of [['xupc','off_xupc'],['xupca','def_xupca'],['off_l5','off_off_l5'],['def_l5','def_def_l5']] as const){
  const ranked=Object.keys(samples).sort((a,b)=>samples[b][field]-samples[a][field]);for(const team of ranked){const rank=ranked.findIndex(t=>samples[t][field]===samples[team][field])+1;samples[team][prefix+'_rank']=rank;samples[team][prefix+'_pts']=bands(rank,prefix)}
 }
 // Do not change any model factors until actual eligible observations exist.
 if(!netByTeam.size&&!allowedByTeam.size&&!graded.length)return {updated:false,days:days.length}
 for(const [team,r] of Object.entries(samples)){const old=base[team];r.off_score=old.off_score-old.off_xupc_pts-old.off_off_l5_pts+r.off_xupc_pts+r.off_off_l5_pts;r.def_score=old.def_score-old.def_xupca_pts-old.def_def_l5_pts+r.def_xupca_pts+r.def_def_l5_pts;Object.assign(CONFIDENCE_TEAMS[team],r)}
 comboModelInfo.updated=true;return {updated:true,days:days.length}
}
