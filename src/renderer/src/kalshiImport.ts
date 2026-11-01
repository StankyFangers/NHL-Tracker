// Conservative Kalshi -> NHL Tracker wager reconstruction.
// Never invent player legs or treat fills as independently placed wagers.
export type KalshiFill={id:string;fillId:string;orderId:string;date:string;createdAt?:string;ticker:string;title:string;side:string;action:string;count:string;price:string;fee:string;isNhl:boolean;review:string;legs:{ticker:string;side:string;title:string;resolved:boolean;source:string;nhlTicker:boolean}[]}
type ParsedLeg={player:string;qty:number;stat:string;side:'OVER';kind:'PLAYER';team?:string;gameId?:string;opponent?:string}
export type KalshiImport={id:string;date:string;legs:ParsedLeg[];book:string;units:number;unitSize:number;odds:number;createdAt:string;groupKey?:string;status:'PENDING';category:string;source:'LIVE'}
export type Candidate={id:string;date:string;ticker:string;legs:ParsedLeg[];risk:number;units:number;odds:number;category:string;description:string;bet:KalshiImport}
const normalized=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'')
const num=(v:string)=>Number(v)
const parseTitle=(raw:string):ParsedLeg|null=>{
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
 const stat=/assist/.test(statHint)?'Assist':/goal/.test(statHint)?'Goal':'Point'
 return {player,qty,stat,side:'OVER',kind:'PLAYER'}
}
function extractLegs(row:KalshiFill):ParsedLeg[]|null{
 const byMarket=row.legs||[]
 if(byMarket.length){
  if(byMarket.some(l=>l.side.toLowerCase()!=='yes'||!l.nhlTicker))return null
  const output=byMarket.map(l=>parseTitle(l.title))
  if(output.every(Boolean)&&new Set(output.map(x=>normalized(x!.player))).size===output.length)return output as ParsedLeg[]
  // Parent title can contain matching repeated "yes Name: N+" clauses.
  const chunks=[...row.title.matchAll(/\byes\s+([\p{L}\p{M}.' -]+?:\s*\d+\+)(?=\s+yes\s+|\s*\||$)/giu)].map(m=>m[1])
  const distinctChunks=[...new Map(chunks.map(x=>[normalized(x),x])).values()]
  if(distinctChunks.length===byMarket.length){
   const parsed=distinctChunks.map(x=>parseTitle(x))
   if(parsed.every(Boolean)&&new Set(parsed.map(x=>normalized(x!.player))).size===parsed.length)return parsed as ParsedLeg[]
  }
  return null
 }
 // Single market title must explicitly indicate the player and target.
 const p=parseTitle(row.title)
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
 if(legs.length<2||legs.some(l=>l.stat!=='Point'||l.qty!==1))return 'OTHER'
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
export function prepareKalshiImports(fills:KalshiFill[],existing:any[],dfo:Record<string,any>,games:any[],unitSize:number){
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
  if(!attachNhlMatch(legs,dfo,games)){skipped.push({id,reason:'Cannot unambiguously identify player team and NHL game from current slate'});continue}
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
  const signature=fs[0].date+'|'+legs.map(l=>normalized(l.player)+':'+l.qty+':'+l.stat).sort().join(';')
  if(existingSignatures.has(signature)){skipped.push({id,reason:'Potential existing manual Kalshi bet — needs review'});continue}
  const odds=Math.round(((count/risk)-1)*100)
  const category=classify(legs,dfo,games)
  const bet:KalshiImport={id,date:fs[0].date,legs,book:'Kalshi',units:risk/unitSize,unitSize,odds,createdAt:fs[0].createdAt||new Date().toISOString(),status:'PENDING',category,source:'LIVE'}
  candidates.push({id,date:fs[0].date,ticker:fs[0].ticker,legs,risk,units:bet.units,odds,category,description:fs[0].title,bet})
 }
 return {candidates,skipped,totalGroups:groups.size,days:day}
}
