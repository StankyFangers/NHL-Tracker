/** NHL-confirmed leg evidence. A settled wager is NOT evidence that each leg hit.
 * Fetch official boxscores and never infer a player result from the parent bet status.
 */
export type WagerStatLeg = {
 player:string; playerId?:number; team?:string; gameId?:string;
 stat:string; qty:number; side?:'OVER'|'UNDER'; kind?:'PLAYER'|'TEAM'; voided?:boolean
}
export type OfficialPlayerRecord = {
 id:number; name:string; goals:number; assists:number; points:number; shots:number
}
export type OfficialGameRecords = {byId:Map<number,OfficialPlayerRecord>; byName:Map<string,OfficialPlayerRecord[]>; isFinal:boolean}
export type LegEvidence = {result:'HIT'|'MISS'|'UNVERIFIED'|'VOID'; actual?:number}
const keyName=(n:string)=>String(n||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'')
const fullName=(item:any)=>[item?.firstName,item?.lastName].map(v=>typeof v==='string'?v:v?.default||'').filter(Boolean).join(' ')||String(item?.name?.default||item?.name||item?.playerName?.default||item?.playerName||'')
const cache=new Map<number,Promise<OfficialGameRecords>>()
const queue:Array<()=>void>=[]
let active=0
function limit<T>(job:()=>Promise<T>):Promise<T>{
 return new Promise((resolve,reject)=>{
  const launch=()=>{
   active++
   job().then(resolve,reject).finally(()=>{active--;queue.shift()?.()})
  }
  if(active<4)launch();else queue.push(launch)
 })
}
export function officialWagerBoxscore(gameId:number):Promise<OfficialGameRecords>{
 if(!Number.isInteger(gameId)||gameId<=0)return Promise.reject(Error('Missing NHL game ID'))
 const cached=cache.get(gameId)
 if(cached)return cached
 const promise=limit(async()=>{
  const box=await (window as any).nhlTracker.boxscore(gameId)
  const root=box?.playerByGameStats||box?.boxscore?.playerByGameStats||{}
  const byId=new Map<number,OfficialPlayerRecord>()
  const byName=new Map<string,OfficialPlayerRecord[]>()
  const walk=(value:any):void=>{
   if(Array.isArray(value)){value.forEach(walk);return}
   if(!value||typeof value!=='object')return
   const id=Number(value.playerId||0)
   if(id>0&&!byId.has(id)){
    const goals=Number(value.goals||0),assists=Number(value.assists||0)
    const rec={id,name:fullName(value),goals,assists,points:Number(value.points??goals+assists),shots:Number(value.sog??value.shots??value.shotsOnGoal??0)}
    byId.set(id,rec)
    if(keyName(rec.name)){
     const key=keyName(rec.name)
     byName.set(key,[...(byName.get(key)||[]),rec])
    }
   }
   for(const v of Object.values(value))if(v&&typeof v==='object')walk(v)
  }
  walk(root)
  if(!byId.size)throw Error('Official player boxscore is not available')
  return {byId,byName,isFinal:['FINAL','OFF'].includes(String(box?.gameState||box?.boxscore?.gameState||''))}
 }).catch(error=>{cache.delete(gameId);throw error})
 cache.set(gameId,promise)
 return promise
}
export function officialLegEvidence(leg:WagerStatLeg,box?:OfficialGameRecords):LegEvidence{
 if(leg.voided)return{result:'VOID'}
 if(leg.kind==='TEAM'||!box)return{result:'UNVERIFIED'}
 let player=leg.playerId?box.byId.get(Number(leg.playerId)):undefined
 if(!player){
  // Name fallback is permitted only for exactly one unambiguous NHL player.
  const found=box.byName.get(keyName(leg.player))||[]
  if(found.length===1)player=found[0]
 }
 if(!player)return{result:'UNVERIFIED'}
 const market=String(leg.stat||'').toLowerCase()
 const value=market.startsWith('goal')?player.goals:market.startsWith('assist')?player.assists:market.startsWith('shot')?player.shots:market.startsWith('point')?player.points:undefined
 if(value===undefined||!Number.isFinite(leg.qty))return{result:'UNVERIFIED'}
 if(leg.side==='UNDER'&&!box.isFinal)return{result:'UNVERIFIED',actual:value}
 const hit=leg.side==='UNDER'?value<leg.qty:value>=leg.qty
 return{result:hit?'HIT':'MISS',actual:value}
}
