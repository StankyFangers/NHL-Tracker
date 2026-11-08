// NHL Tracker v1.7.5: persistent, local-first NHL player identity index.
// No network calls are needed for an already resolved player ID.
export type PlayerIdentity = { id:number; name:string; teams:string[]; position?:string; sweaterNumber?:number };
const KEY='nhlTracker:playerIdentityDb:v1';
const META='nhlTracker:playerIdentityDb:lastFullSync';
export const identityKey=(v:string)=>String(v||'').normalize('NFKD').toLowerCase()
 .replace(/[\u0300-\u036f]/g,'').replace(/ø/g,'o').replace(/æ/g,'ae').replace(/ß/g,'ss')
 .replace(/[^a-z0-9]/g,'');
// Verified whole-name variants only. Never infer an identity from surname alone.
const VERIFIED_ALIASES:Record<string,string>={
 tomnovak:'tommynovak',tommynovak:'tommynovak',
 maxshabanov:'maximshabanov',maximshabanov:'maximshabanov'
}
export const playerAliasKey=(v:string)=>VERIFIED_ALIASES[identityKey(v)]||identityKey(v);
const valid=(id:any)=>Number.isSafeInteger(Number(id))&&Number(id)>0;
export function readPlayerDb():PlayerIdentity[]{
 try{const data=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(data)?data.filter(p=>valid(p?.id)&&typeof p.name==='string'):[]}catch{return []}
}
export function savePlayerDb(rows:PlayerIdentity[]){
 try{localStorage.setItem(KEY,JSON.stringify(rows))}catch(e){console.warn('Player identity database could not be saved',e)}
}
export function addPlayerIdentities(entries:{id:number;name:string;team?:string;position?:string;sweaterNumber?:number}[]):number{
 const rows=readPlayerDb(), byId=new Map(rows.map(p=>[p.id,p]));let changed=0;
 for(const e of entries){if(!valid(e.id)||!identityKey(e.name))continue;
  const id=Number(e.id), old=byId.get(id),team=String(e.team||'').toUpperCase();
  const position=String(e.position||'').toUpperCase()
  const sweaterNumber=Number(e.sweaterNumber||0)
  if(!old){byId.set(id,{id,name:e.name,teams:team?[team]:[],...(position?{position}:{}),...(sweaterNumber>0?{sweaterNumber}:{})});changed++;continue}
  const teams=team&&!old.teams.includes(team)?[...old.teams,team]:old.teams;
  const next={...old,teams,position:position||old.position,sweaterNumber:sweaterNumber>0?sweaterNumber:old.sweaterNumber}
  if(teams!==old.teams||next.position!==old.position||next.sweaterNumber!==old.sweaterNumber){byId.set(id,next);changed++}
 }
 if(changed)savePlayerDb([...byId.values()]);return changed;
}
export function resolvePlayerId(name:string,team?:string,position?:string,sweaterNumber?:number):number|undefined{
 const key=playerAliasKey(name);if(!key)return undefined;
 const matches=readPlayerDb().filter(p=>playerAliasKey(p.name)===key);
 if(!matches.length)return undefined;
 // The same name may belong to two players on the SAME team (VAN's Elias Petterssons).
 // Never silently select either NHL player ID without distinguishing evidence.
 const narrowed=matches.filter(p=>!team||p.teams.includes(team.toUpperCase()));
 const byPosition=position?narrowed.filter(p=>p.position&&p.position.toUpperCase()===position.toUpperCase()):narrowed;
 const byNumber=sweaterNumber?byPosition.filter(p=>p.sweaterNumber===sweaterNumber):byPosition;
 const ids=[...new Set(byNumber.map(p=>p.id))];
 return ids.length===1?ids[0]:undefined;
}
export function rosterEntries(roster:any,team:string){
 const out:{id:number;name:string;team:string;position?:string;sweaterNumber?:number}[]=[];
 for(const section of ['forwards','defensemen','goalies'])for(const p of roster?.[section]||[]){
  const n=(v:any)=>typeof v==='string'?v:v?.default||'';
  const full=[n(p.firstName),n(p.lastName)].filter(Boolean).join(' ')||n(p.name);
  if(valid(p.id||p.playerId)&&full)out.push({id:Number(p.id||p.playerId),name:full,team,position:String(p.positionCode||''),sweaterNumber:Number(p.sweaterNumber||0)||undefined});
 }
 return out;
}
export async function syncPlayerDb(roster:(team:string)=>Promise<any>,teams:string[],force=false){
 const last=Number(localStorage.getItem(META)||0);
 if(!force&&Date.now()-last<24*60*60*1000)return;
 let failures=0,successes=0;
 // Four concurrent roster calls, never 32 simultaneous requests.
 for(let i=0;i<teams.length;i+=4){
  const results=await Promise.all(teams.slice(i,i+4).map(async team=>{
   try{const entries=rosterEntries(await roster(team),team);if(!entries.length)throw Error('empty roster');return entries}
   catch{return null}
  }));
  for(const entries of results){if(!entries){failures++;continue}successes++;addPlayerIdentities(entries)}
 }
 // An incomplete sync must retry next launch; keep all successfully cached players.
 if(!failures&&successes===teams.length)localStorage.setItem(META,String(Date.now()));
}
