/** Durable, per-slate Daily Faceoff observations. No wagering or notification side effects. */
export type DfoLineupSnapshot = {
 date:string; team:string; observedAt:string; updatedAt:string|null; source:string;
 confirmed:boolean; forwardLines:string[][]; defensePairs:string[][]; pp1:string[]; pp2:string[];
 fingerprint:string;
};
export type DfoSnapshotRecord = {
 baseline:DfoLineupSnapshot; latest:DfoLineupSnapshot;
 confirmed?:DfoLineupSnapshot; firstProjected?:DfoLineupSnapshot;
 revisions:number; changedAt?:string;
};
const PREFIX='nhlTracker:dfoSnapshots:v1:';
const clean=(xs:any):string[]=>Array.isArray(xs)?xs.filter((x:any)=>typeof x==='string'&&x.trim()).map((x:string)=>x.trim()):[];
const groups=(xs:any):string[][]=>Array.isArray(xs)?xs.map(clean).filter((x:string[])=>x.length):[];
const canonical=(xs:string[][])=>xs.map(x=>[...x].sort((a,b)=>a.localeCompare(b))).sort((a,b)=>a.join('|').localeCompare(b.join('|')));
const canonicalUnit=(xs:string[])=>[...xs].sort((a,b)=>a.localeCompare(b));
export function makeDfoSnapshot(date:string,team:string,info:any,confirmed:boolean):DfoLineupSnapshot|null {
 if(!info || !/^\d{4}-\d{2}-\d{2}$/.test(date)||!team)return null;
 const forwardLines=groups(info.forwardLines),defensePairs=groups(info.defensePairs),pp1=clean(info.pp1),pp2=clean(info.pp2);
 // Never replace a good baseline with a blank/partial DFO parse.
 if(!forwardLines.length||!defensePairs.length)return null;
 const fingerprint=JSON.stringify({forwardLines:canonical(forwardLines),defensePairs:canonical(defensePairs),pp1:canonicalUnit(pp1),pp2:canonicalUnit(pp2)});
 return {date,team,observedAt:new Date().toISOString(),updatedAt:info.updatedAt||null,source:String(info.source||''),confirmed,forwardLines,defensePairs,pp1,pp2,fingerprint};
}
export function readDfoSnapshot(date:string,team:string):DfoSnapshotRecord|null {
 try {const raw=localStorage.getItem(PREFIX+date+':'+team);if(!raw)return null;
  const data=JSON.parse(raw);return data?.baseline?.fingerprint&&data?.latest?.fingerprint?data:null;
 }catch{return null}
}
export function captureDfoSnapshot(date:string,team:string,info:any,confirmed:boolean):DfoSnapshotRecord|null {
 const snapshot=makeDfoSnapshot(date,team,info,confirmed);if(!snapshot)return null;
 const old=readDfoSnapshot(date,team);
 // Preserve the earliest observation and earliest projected state across restarts.
 const record:DfoSnapshotRecord=old?{
  ...old,latest:snapshot,firstProjected:old.firstProjected||(!snapshot.confirmed?snapshot:undefined),
  confirmed: snapshot.confirmed?snapshot:old.confirmed,
  revisions:old.revisions+(old.latest.fingerprint!==snapshot.fingerprint?1:0),
  changedAt:old.latest.fingerprint!==snapshot.fingerprint?snapshot.observedAt:old.changedAt
 }:{baseline:snapshot,latest:snapshot,firstProjected:!snapshot.confirmed?snapshot:undefined,confirmed:snapshot.confirmed?snapshot:undefined,revisions:0};
 try{localStorage.setItem(PREFIX+date+':'+team,JSON.stringify(record))}catch{}
 return record;
}
/** Relationship-based comparison; moving together to a different line is not a broken pair. */
export function sharedDfoUnits(snapshot:DfoLineupSnapshot,a:string,b:string):string[] {
 const normalize=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const x=normalize(a),y=normalize(b);if(!x||!y||x===y)return [];
 const together=(xs:string[])=>xs.some(p=>normalize(p)===x)&&xs.some(p=>normalize(p)===y);
 const result:string[]=[];
 if(snapshot.forwardLines.some(together))result.push('FORWARD');
 if(snapshot.defensePairs.some(together))result.push('DEFENSE');
 if(together(snapshot.pp1))result.push('PP1');
 if(together(snapshot.pp2))result.push('PP2');
 return result;
}
export function brokenDfoUnits(projected:DfoLineupSnapshot,confirmed:DfoLineupSnapshot,a:string,b:string):string[] {
 const before=sharedDfoUnits(projected,a,b),after=sharedDfoUnits(confirmed,a,b);
 // Forward/defense relationships are unit-independent; PP1->PP2 together is still a PP pair.
 return before.filter(unit=>unit==='PP1'||unit==='PP2'?!(after.includes('PP1')||after.includes('PP2')):!after.includes(unit));
}
