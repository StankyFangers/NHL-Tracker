// Conservative Kalshi -> NHL Tracker wager reconstruction.
// Never invent player legs or treat fills as independently placed wagers.
export type KalshiFill={id:string;fillId:string;orderId:string;date:string;createdAt?:string;ticker:string;title:string;side:string;action:string;count:string;price:string;fee:string;isNhl:boolean;review:string;legs:{ticker:string;side:string;title:string;resolved:boolean;source:string;nhlTicker:boolean}[]}
type ParsedLeg={player:string;qty:number;stat:string;side:'OVER';kind:'PLAYER';team?:string;gameId?:string;opponent?:string}
export type KalshiImport={id:string;date:string;legs:ParsedLeg[];book:string;units:number;unitSize:number;odds:number;createdAt:string;groupKey?:string;status:'PENDING';category:string;source:'LIVE'}
export type Candidate={id:string;date:string;ticker:string;legs:ParsedLeg[];risk:number;units:number;odds:number;category:string;description:string;bet:KalshiImport}
const normalized=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'')
const num=(v:string)=>v.trim()===''?NaN:Number(v)
const parseTitle=(raw:string,ticker=''):ParsedLeg|null=>{
 // Parent descriptions: "yes Owen Power: 1+"; leg metadata often includes NHL point/assist text.
 const s=raw.replace(/\s*\|.*/,'').replace(/^\s*(?:yes|if)\s+/i,'').trim()
 const colon=s.match(/^(.+?):\s*(\d+)\+\s*(?:points?|assists?|goals?)?\s*$/i)
 const long=s.match(/^(.+?)\s+(\d+)\+\s+(points?|assists?|goals?)\b/i)
 const m=colon||long
 if(!m)return null
 const player=m[1].trim().replace(/^(?:yes|if)\s+/i,'')
 if(!/^[\p{L}\p{M}.' -]{3,70}$/u.test(player)||!player.includes(' '))return null
 const qty=Number(m[2])
 if(!Number.isInteger(qty)||qty<1||qty>10)return null
 const statHint=(colon?s:long?.[3]||'').toLowerCase()
 const market=ticker.toUpperCase()
 const stat=/^KXNHLAST(?:-|$)/.test(market)?'Assist':/^KXNHLGOAL/.test(market)?'Goal':/^KXNHLPTS/.test(market)?'Point':/assist/.test(statHint)?'Assist':/goal/.test(statHint)?'Goal':'Point'
 return {player,qty,stat,side:'OVER',kind:'PLAYER'}
}
function extractLegs(row:KalshiFill):ParsedLeg[]|null{
 const byMarket=row.legs||[]
 if(byMarket.length){
  if(byMarket.some(l=>l.side.toLowerCase()!=='yes'||!l.nhlTicker))return null
  const output=byMarket.map(l=>parseTitle(l.title,l.ticker))
  if(output.every(Boolean)&&new Set(output.map(x=>normalized(x!.player))).size===output.length)return output as ParsedLeg[]
  // Parent title can contain matching repeated "yes Name: N+" clauses.
  const chunks=[...row.title.matchAll(/\byes\s+([\p{L}\p{M}.' -]+?:\s*\d+\+)(?=\s+yes\s+|\s*\||$)/giu)].map(m=>m[1])
  const distinctChunks=[...new Map<string,string>(chunks.map(x=>[normalized(x),x] as const)).values()]
  if(distinctChunks.length===byMarket.length){
   const parsed=distinctChunks.map((x,i)=>parseTitle(x,byMarket[i].ticker))
   if(parsed.every(Boolean)&&new Set(parsed.map(x=>normalized(x!.player))).size===parsed.length)return parsed as ParsedLeg[]
  }
  return null
 }
 // Single market title must explicitly indicate the player and target.
 const p=parseTitle(row.title,row.ticker)
 return p?[p]:null
}
function attachNhlMatch(legs:ParsedLeg[],dfo:Record<string,any>,games:any[]):boolean{
 const teamOf=(g:any,side:'away'|'home')=>String(g?.[side+'Team']?.abbrev?.default||g?.[side+'Team']?.abbrev||g?.[side+'Team']?.triCode||'').toUpperCase()
 for(const leg of legs){
  const player=normalized(leg.player)
  const matchingTeams=Object.entries(dfo).filter(([_,info])=>[...(info?.forwardLines||[]).flat(),...(info?.defensePairs||[]).flat(),...(info?.pp1||[]),...(info?.pp2||[])].some((name:any)=>normalized(String(name))===player)).map(([team])=>team)
  if(matchingTeams.length!==1)return false
  const team=matchingTeams[0]
  const matchedGames=games.filter(g=>teamOf(g,'away')===team||teamOf(g,'home')===team)
  if(matchedGames.length!==1)return false
  const game=matchedGames[0]
  const isAway=teamOf(game,'away')===team
  leg.team=team;leg.opponent=teamOf(game,isAway?'home':'away');leg.gameId=String(game.id)
 }
 return true
}
function classify(legs:ParsedLeg[],dfo:Record<string,any>,games:any[]){
 if(legs.every(l=>l.stat==='Assist'))return 'ASSISTS'
 if(legs.length<2||legs.some(l=>l.stat!=='Point'))return 'OTHER'
 // A combo must be in the same forward line AND same power-play unit.
 const names=legs.map(l=>normalized(l.player))
 for(const [team,info] of Object.entries(dfo)){
  if(!info?.forwardLines||!Array.isArray(info.forwardLines))continue
  const ppUnits=[info.pp1,info.pp2].filter(Array.isArray) as string[][]
  const pairs=info.forwardLines as string[][]
  if(pairs.some(line=>names.every(n=>line.some(p=>normalized(p)===n)))&&ppUnits.some(pp=>names.every(n=>pp.some(p=>normalized(p)===n)))){
    return 'COMBOS'
  }
 }
 return 'OTHER'
}
export type KalshiSlate={date:string;dfo:Record<string,any>;games:any[]}
export function prepareKalshiImports(fills:KalshiFill[],existing:any[],dfo:Record<string,any>,games:any[],unitSize:number,overnight:KalshiSlate[]=[],currentSlateDate:string=''){
 const groups=new Map<string,KalshiFill[]>()
 const skipped:{id:string;reason:string}[]=[]
 const day=Array.from(new Set(fills.map(f=>f.date)))
 for(const f of fills){
  if(f.side.toLowerCase()!=='yes'||f.action.toLowerCase()!=='buy'){skipped.push({id:f.id,reason:'Not a YES-side purchase'});continue}
  if(!f.orderId||!f.ticker||!f.fillId){skipped.push({id:f.id,reason:'Missing stable Kalshi IDs'});continue}
  const k=f.orderId+'|'+f.ticker
  groups.set(k,[...(groups.get(k)||[]),f])
 }
 const existingIds=new Set(existing.map(b=>String(b.id)))
 const existingSignatures=new Set(existing.filter(b=>b.book==='Kalshi').map(b=>String(b.date)+'|'+(b.legs||[]).map((l:any)=>normalized(l.player)+':'+l.qty+':'+l.stat).sort().join(';')))
 const candidates:Candidate[]=[]
 for(const [key,fs] of groups){
  const id='KALSHI-'+key
  if(existingIds.has(id)){skipped.push({id,reason:'Already imported'});continue}
  if(fs.some(f=>f.ticker!==fs[0].ticker||f.date!==fs[0].date)){skipped.push({id,reason:'Inconsistent fills'});continue}
  const legs=extractLegs(fs[0])
  if(!legs){skipped.push({id,reason:'Cannot verify exact player thresholds'});continue}
  // Prefer a date-matched historical slate if the players cannot be found today.
  // Work on copies so a failed slate cannot leave partial player/game assignments.
  const slates:KalshiSlate[]=[{date:currentSlateDate||fs[0].date,dfo,games},...overnight]
  const matches=slates.flatMap(slate=>{
   const trial=legs.map(l=>({...l}))
   return attachNhlMatch(trial,slate.dfo,slate.games)?[{slate,legs:trial}]:[]
  })
  const distinct=[...new Map(matches.map(m=>[m.legs.map(l=>l.gameId).join('|'),m])).values()]
  if(distinct.length!==1){skipped.push({id,reason:distinct.length?'Multiple NHL game dates matched; review game assignment':'Player not found on current or overnight NHL lineups; historical lineup review needed'});continue}
  const match=distinct[0]
  legs.splice(0,legs.length,...match.legs)
  const gameDate=match.slate.date
  // An order can contain multiple fills, priced in dollars per contract. Preserve actual fee cost.
  const values=fs.map(f=>({count:num(f.count),price:num(f.price),fee:num(f.fee)}))
  if(values.some(x=>!Number.isFinite(x.count)||x.count<=0||!Number.isFinite(x.price)||x.price<=0||x.price>=1||!Number.isFinite(x.fee)||x.fee<0)){
   skipped.push({id,reason:'Invalid price, size or fee'});continue
  }
  const count=values.reduce((n,x)=>n+x.count,0)
  const risk=values.reduce((n,x)=>n+x.count*x.price+x.fee,0)
  if(!Number.isFinite(risk)||risk<=0||!Number.isFinite(unitSize)||unitSize<=0||risk>=count){
   skipped.push({id,reason:'Unsupported wager cost/return'});continue
  }
  const signature=gameDate+'|'+legs.map(l=>normalized(l.player)+':'+l.qty+':'+l.stat).sort().join(';')
  if(existingSignatures.has(signature)){skipped.push({id,reason:'Potential existing manual Kalshi bet — needs review'});continue}
  const odds=Math.round(((count/risk)-1)*100)
  const category=classify(legs,match.slate.dfo,match.slate.games)
  const gameIds=[...new Set(legs.map(l=>String(l.gameId||'')).filter(Boolean))]
  const bet:KalshiImport={id,date:gameDate,legs,book:'Kalshi',units:risk/unitSize,unitSize,odds,createdAt:fs[0].createdAt||new Date().toISOString(),groupKey:gameIds.length===1?gameIds[0]:'MULTI',status:'PENDING',category,source:'LIVE'}
  candidates.push({id,date:gameDate,ticker:fs[0].ticker,legs,risk,units:bet.units,odds,category,description:fs[0].title,bet})
 }
 return {candidates,skipped,totalGroups:groups.size,days:day}
}

const rosterName=(v:any)=>typeof v==='string'?v:typeof v?.default==='string'?v.default:''
export async function verifyKalshiIdentity(candidates:Candidate[],roster:(team:string)=>Promise<any>){
 const cache=new Map<string,Map<string,number[]>>()
 const accepted:Candidate[]=[]
 const rejected:{id:string;reason:string}[]=[]
 for(const c of candidates){
  let error=''
  for(const l of c.bet.legs){
   if(!l.team){error='Player team not resolved';break}
   if(!cache.has(l.team)){
    try{
     const raw=await roster(l.team),names=new Map<string,number[]>()
     const walk=(x:any)=>{
      if(Array.isArray(x)){x.forEach(walk);return}
      if(!x||typeof x!=='object')return
      const id=Number(x.id||x.playerId||0)
      const name=[rosterName(x.firstName),rosterName(x.lastName)].filter(Boolean).join(' ')||rosterName(x.fullName)
      if(id>0&&name){const k=normalized(name);names.set(k,[...new Set([...(names.get(k)||[]),id])])}
      Object.values(x).forEach(v=>{if(typeof v==='object'&&v!==null)walk(v)})
     }
     walk(raw);cache.set(l.team,names)
    }catch{error='NHL roster could not load for '+l.team;break}
   }
   const ids=cache.get(l.team)?.get(normalized(l.player))||[]
   if(ids.length!==1){error='NHL player identity cannot be verified for '+l.player;break}
   ;(l as any).playerId=ids[0]
  }
  if(error)rejected.push({id:c.id,reason:error});else accepted.push(c)
 }
 return {accepted,rejected}
}
