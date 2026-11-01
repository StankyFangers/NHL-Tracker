// Conservative Kalshi -> NHL Tracker wager reconstruction.
// Never invent player legs or treat fills as independently placed wagers.
export type KalshiFill={id:string;fillId:string;orderId:string;date:string;createdAt?:string;ticker:string;title:string;side:string;action:string;count:string;price:string;fee:string;isNhl:boolean;review:string;legs:{ticker:string;side:string;title:string;resolved:boolean;source:string;nhlTicker:boolean}[]}
type ParsedLeg={player:string;qty:number;stat:string;side:'OVER';kind:'PLAYER';team?:string;gameId?:string;opponent?:string}
export type KalshiImport={id:string;date:string;legs:ParsedLeg[];book:string;units:number;unitSize:number;odds:number;createdAt:string;groupKey?:string;status:'PENDING';category:string;source:'LIVE'}
export type Candidate={id:string;date:string;ticker:string;legs:ParsedLeg[];risk:number;units:number;odds:number;category:string;description:string;bet:KalshiImport}
const normalized=(s:string)=>s.replace(/\s*\(#\d+\)\s*/g,' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'')
const num=(v:string)=>v.trim()===''?NaN:Number(v)
const parseTitle=(raw:string,ticker=''):ParsedLeg|null=>{
 // Component metadata may be "yes Player: 1+ | Player points".
 const segments=raw.split(/\s*\|\s*/).map(x=>x.trim()).filter(Boolean)
 const clause=segments.find(x=>/^(?:yes\s+)?[^,:|]+:\s*\d+\+\s*(?:points?|assists?|goals?)?$/i.test(x))
 const short=clause||segments[0]||''
 const s=short.replace(/^\s*(?:yes|if)\s+/i,'').trim()
 const colon=s.match(/^(.+?):\s*(\d+)\+\s*(points?|assists?|goals?)?\s*$/i)
 const long=s.match(/^(.+?)\s+(\d+)\+\s+(points?|assists?|goals?)\b/i)
 const m=colon||long
 if(!m)return null
 const player=m[1].trim().replace(/\s*\(#\d+\)\s*/g,' ').trim()
 if(!/^[\p{L}\p{M}.' -]{3,70}$/u.test(player)||!player.includes(' '))return null
 const qty=Number(m[2])
 if(!Number.isInteger(qty)||qty<1||qty>10)return null
 const market=ticker.toUpperCase()
 const explicit=String(m[3]||'')
 const hint=[explicit,...segments.slice(1)].join(' ').toLowerCase()
 const stat=/^KXNHLAST(?:-|$)/.test(market)||/\bassists?\b/.test(hint)?'Assist':/^KXNHLGOAL/.test(market)||/\bgoals?\b/.test(hint)?'Goal':'Point'
 return {player,qty,stat,side:'OVER',kind:'PLAYER'}
}
/** Parse repeated Kalshi multi-view event descriptions, without confusing
    duplicate title/subtitle copies with additional player legs. */
export function parseKalshiParentLegs(raw:string):{player:string;qty:number}[] {
 // Kalshi has used comma separators, spaces, and mixed ", yes" between legs.
 // Parent descriptions can be repeated after "|"; take one complete copy.
 for(const part of raw.split(/\s*\|\s*/)){
  const pattern=/\byes\s+([\p{L}\p{M}.' #()\d-]+?):\s*(\d+)\+(?=\s*(?:,|\byes\b|$))/giu
  const matches=[...part.matchAll(pattern)]
  if(matches.length<2)continue
  // Reject descriptions with stray unparsed content rather than silently
  // dropping an unknown third leg or accepting a truncated player name.
  if(part.replace(pattern,'').replace(/[\s,]+/g,'')!=='')continue
  const parsed=matches.map(m=>({player:m[1].trim(),qty:Number(m[2])}))
  if(parsed.every(v=>v.player.includes(' ')&&v.qty>=1&&v.qty<=10)&&
     new Set(parsed.map(v=>normalized(v.player)+':'+v.qty)).size===parsed.length)return parsed
 }
 return []
}
function extractLegs(row:KalshiFill):ParsedLeg[]|null{
 const byMarket=row.legs||[]
 if(byMarket.length){
  if(byMarket.some(l=>l.side.toLowerCase()!=='yes'||!l.nhlTicker))return null
  const output=byMarket.map(l=>parseTitle(l.title,l.ticker))
  if(output.every(Boolean)&&new Set(output.map(x=>normalized(x!.player)+':'+x!.qty+':'+x!.stat)).size===output.length)return output as ParsedLeg[]
  // Kalshi sometimes omits leg names in component metadata and only
  // provides them in the combined title. Require an exact leg count.
  const parent=parseKalshiParentLegs(row.title)
  if(parent.length!==byMarket.length)return null
  const parsed=parent.map((leg,i)=>parseTitle('yes '+leg.player+': '+leg.qty+'+',byMarket[i].ticker))
  return parsed.every(Boolean)&&new Set(parsed.map(x=>normalized(x!.player)+':'+x!.qty+':'+x!.stat)).size===parsed.length?parsed as ParsedLeg[]:null
 }
 // A combined market without component tickers cannot safely establish the
 // number and types of independent leg contracts.
 if(parseKalshiParentLegs(row.title).length>1)return null
 return parseTitle(row.title,row.ticker)?[parseTitle(row.title,row.ticker)!]:null
}
function attachNhlMatch(legs:ParsedLeg[],dfo:Record<string,any>,games:any[],rosterPlayers:Record<string,string[]>={}):boolean{
 const teamOf=(g:any,side:'away'|'home')=>String(g?.[side+'Team']?.abbrev?.default||g?.[side+'Team']?.abbrev||g?.[side+'Team']?.triCode||'').toUpperCase()
 for(const leg of legs){
  const player=normalized(leg.player)
  // The game roster is the identity source. DFO lineup coverage is optional and used for classification.
  const matchingTeams=Object.entries(rosterPlayers).filter(([_,names])=>names.some(name=>normalized(name)===player)).map(([team])=>team)
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
 if(legs.length&&legs.every(l=>l.stat==='Assist'))return 'ASSISTS'
 // Correlated forward combos are multiple 1+ point legs for one NHL team.
 // When DFO lines exist, retain the strict forward-line + PP relationship rule.
 if(legs.length<2||legs.some(l=>l.stat!=='Point'||l.qty!==1))return 'OTHER'
 const team=legs[0].team
 if(!team||!legs.every(l=>l.team===team))return 'OTHER'
 const names=legs.map(l=>normalized(l.player))
 const info=dfo[team]
 const forwards=Array.isArray(info?.forwardLines)?info.forwardLines as string[][]:[]
 const ppUnits=[info?.pp1,info?.pp2].filter(Array.isArray) as string[][]
 const together=(unit:string[])=>names.every(n=>unit.some(p=>normalized(p)===n))
 if(forwards.length&&ppUnits.length)return forwards.some(together)&&ppUnits.some(together)?'COMBOS':'OTHER'
 // DFO is sometimes unavailable on the current slate. A same-team 1+ points
 // combination is still a player-combo wager; do not silently relabel it OTHER
 // solely because the optional correlation metadata is missing.
 return 'COMBOS'
}

export function classifyExistingKalshiBet(bet:any,dfo:Record<string,any>):string{
 if(!Array.isArray(bet?.legs)||!bet.legs.length)return 'OTHER'
 return classify(bet.legs as ParsedLeg[],dfo,[])
}

export type KalshiSlate={date:string;dfo:Record<string,any>;games:any[]}
export function prepareKalshiImports(fills:KalshiFill[],existing:any[],dfo:Record<string,any>,games:any[],unitSize:number,overnight:KalshiSlate[]=[],currentSlateDate:string='',rosterPlayers:Record<string,string[]>={}){
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
 const candidates:Candidate[]=[]
 for(const [key,fs] of groups){
  const id='KALSHI-'+key
  if(existingIds.has(id)){skipped.push({id,reason:'Already imported'});continue}
  if(fs.some(f=>f.ticker!==fs[0].ticker||f.date!==fs[0].date)){skipped.push({id,reason:'Inconsistent fills'});continue}
  const legs=extractLegs(fs[0])
  if(!legs){skipped.push({id,reason:'Cannot verify exact player thresholds'});continue}
  // Same-day combo rule: the Kalshi purchase date IS the NHL game date.
  // Never move a wager onto another slate just because the players match.
  const matchingSlate=[{date:currentSlateDate||fs[0].date,dfo,games},...overnight].find(slate=>slate.date===fs[0].date)
  if(!matchingSlate){skipped.push({id,reason:'No NHL slate loaded for Kalshi bet placement date '+fs[0].date});continue}
  if(!attachNhlMatch(legs,matchingSlate.dfo,matchingSlate.games,rosterPlayers)){
   skipped.push({id,reason:'Players could not be uniquely matched to NHL teams playing on '+fs[0].date});continue
  }
  const gameDate=fs[0].date
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
  // Only the Kalshi order + ticker is a reliable duplicate identity.
  // Repeated purchases with identical player legs must remain independent wagers.
  const odds=Math.round(((count/risk)-1)*100)
  const category=classify(legs,matchingSlate.dfo,matchingSlate.games)
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
