// NHL Tracker v1.7.5: persistent, local-first NHL player identity index.
// No network calls are needed for an already resolved player ID.
export type PlayerIdentity = { id:number; name:string; teams:string[] };
const KEY='nhlTracker:playerIdentityDb:v1';
const META='nhlTracker:playerIdentityDb:lastFullSync';
export const identityKey=(v:string)=>String(v||'').normalize('NFKD').toLowerCase()
 .replace(/[\u0300-\u036f]/g,'').replace(/ø/g,'o').replace(/æ/g,'ae').replace(/ß/g,'ss')
 .replace(/[^a-z0-9]/g,'');
const valid=(id:any)=>Number.isSafeInteger(Number(id))&&Number(id)>0;
export function readPlayerDb():PlayerIdentity[]{
 try{const data=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(data)?data.filter(p=>valid(p?.id)&&typeof p.name==='string'):[]}catch{return []}
}
export function savePlayerDb(rows:PlayerIdentity[]){
 try{localStorage.setItem(KEY,JSON.stringify(rows))}catch(e){console.warn('Player identity database could not be saved',e)}
}
export function addPlayerIdentities(entries:{id:number;name:string;team?:string}[]):number{
 const rows=readPlayerDb(), byId=new Map(rows.map(p=>[p.id,p]));let changed=0;
 for(const e of entries){if(!valid(e.id)||!identityKey(e.name))continue;
  const id=Number(e.id), old=byId.get(id),team=String(e.team||'').toUpperCase();
  if(!old){byId.set(id,{id,name:e.name,teams:team?[team]:[]});changed++;continue}
  const teams=team&&!old.teams.includes(team)?[...old.teams,team]:old.teams;
  if(teams!==old.teams){byId.set(id,{...old,teams});changed++}
 }
 if(changed)savePlayerDb([...byId.values()]);return changed;
}
export function resolvePlayerId(name:string,team?:string):number|undefined{
 const key=identityKey(name);if(!key)return undefined;
 const matches=readPlayerDb().filter(p=>identityKey(p.name)===key);
 if(!matches.length)return undefined;
 const ids=[...new Set(matches.map(p=>p.id))];
 if(ids.length===1)return ids[0];
 if(team){const filtered=[...new Set(matches.filter(p=>p.teams.includes(team.toUpperCase())).map(p=>p.id))];if(filtered.length===1)return filtered[0]}
 return undefined;
}
export function rosterEntries(roster:any,team:string){
 const out:{id:number;name:string;team:string}[]=[];
 for(const section of ['forwards','defensemen','goalies'])for(const p of roster?.[section]||[]){
  const n=(v:any)=>typeof v==='string'?v:v?.default||'';
  const full=[n(p.firstName),n(p.lastName)].filter(Boolean).join(' ')||n(p.name);
  if(valid(p.id||p.playerId)&&full)out.push({id:Number(p.id||p.playerId),name:full,team});
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
