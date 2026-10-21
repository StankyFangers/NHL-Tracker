export const MAX_SLIP_LEGS=12
export type SlipLeg={player:string;qty:number;stat:string;playerId?:number;gameId?:string;kind?:string}
const key=(leg:SlipLeg)=>[leg.gameId,leg.kind||'PLAYER',leg.player.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(),leg.stat.toLowerCase()].join('|')
// Append whole combos atomically; an existing leg keeps its edited quantity.
export function appendSlipLegs<T extends SlipLeg>(current:T[],incoming:T[]):{legs:T[];added:number;duplicates:number}{
 const keys=new Set(current.map(key)),added:T[]=[]
 for(const leg of incoming){const k=key(leg);if(keys.has(k))continue;keys.add(k);added.push({...leg})}
 if(current.length+added.length>MAX_SLIP_LEGS)throw Error('This wager supports up to '+MAX_SLIP_LEGS+' legs. Remove a leg or submit it before adding another combo.')
 return {legs:[...current,...added],added:added.length,duplicates:incoming.length-added.length}
}
