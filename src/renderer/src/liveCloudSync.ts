import {listAllCloudWagers} from './liveMigrationUpload'

// Compare JSON values, independent of PostgreSQL jsonb object-key ordering.
export function cloudValue(value:unknown):string {
 const normalize=(x:any):any=>Array.isArray(x)?x.map(normalize):x&&typeof x==='object'
  ?Object.fromEntries(Object.keys(x).sort().filter(k=>x[k]!==undefined).map(k=>[k,normalize(x[k])])):x
 return JSON.stringify(normalize(value))
}
type Wager={id:string;[key:string]:any}
export type CloudSyncState={last:string;rows:Map<string,string>}
const validRevision=(s:unknown):s is string=>typeof s==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(s)&&Number.isFinite(Date.parse(s))
export function cloudBetsEqual(a:Wager[],b:Wager[]):boolean {
 const byId=new Map(a.map(w=>[w.id,cloudValue(w)]))
 return byId.size===a.length&&a.length===b.length&&b.every(w=>byId.get(w.id)===cloudValue(w))
}

// One writer, one acknowledged baseline. Read the latest local intent after EVERY
// await so edits/deletes made during a long Verify Night batch cannot be dropped.
export async function flushCloudWagers(
 state:CloudSyncState,getLatest:()=>Wager[],request:(payload:any)=>Promise<any>,active=()=>true
):Promise<number>{
 let changes=0
 while(active()){
  const previous:Wager[]=JSON.parse(state.last),latest:Wager[]=JSON.parse(JSON.stringify(getLatest()))
  if(new Set(latest.map(w=>w.id)).size!==latest.length)throw Error('Duplicate local wager IDs')
  const prior=new Map(previous.map(w=>[w.id,w])),next=new Map(latest.map(w=>[w.id,w]))
  const desired=latest.find(w=>cloudValue(prior.get(w.id))!==cloudValue(w))
  const removed=previous.find(w=>!next.has(w.id))
  if(!desired&&!removed){state.last=JSON.stringify(latest);return changes}
  const id=(desired||removed)!.id,before=prior.get(id)
  let revision=state.rows.get(id)
  let acknowledged=false
  for(let attempt=0;attempt<3&&!acknowledged&&active();attempt++){
   if(before&&!validRevision(revision))throw Error('Missing cloud revision for '+id+'; reload cloud wagers')
   const payload=desired
    ?before?{method:'PATCH',id,expectedUpdatedAt:revision,wager:desired}:{method:'POST',source:'manual',wager:desired}
    :{method:'DELETE',id,expectedUpdatedAt:revision}
   let result:any
   try{result=await request(payload)}catch(e){result={error:String(e)}}
   if(!active())return changes
   if(result?.ok===true&&result.id===id&&(desired?validRevision(result.updatedAt):result.deleted===true)){
    if(desired)state.rows.set(id,result.updatedAt);else state.rows.delete(id)
    acknowledged=true;break
   }
   // A timeout may occur AFTER the server committed. Read back before retrying
   // any mutation, including POST/DELETE, to avoid duplicates and false conflicts.
   if(result?.status&&![404,409,408,429].includes(result.status)&&result.status<500)throw Error(result.error||'Cloud rejected wager '+id)
   const rows=await listAllCloudWagers(request)
   if(!active())return changes
   const remote=rows.find(r=>r.wager_id===id)
   if(desired&&remote&&cloudValue(remote.wager)===cloudValue(desired)){
    if(!validRevision(remote.updated_at))throw Error('Invalid cloud revision for '+id)
    state.rows.set(id,remote.updated_at);acknowledged=true;break
   }
   if(!desired&&!remote){state.rows.delete(id);acknowledged=true;break}
   if(before&&remote&&cloudValue(remote.wager)===cloudValue(before)){
    revision=String(remote.updated_at)
   }else if(!before&&!remote){ /* Create did not commit; retry. */ }
   else throw Error('Wager '+id+' changed in another session. Local changes are retained; export them before reloading.')
   if(attempt===2)throw Error(result?.error||'Cloud did not confirm wager '+id)
  }
  if(!active())return changes
  if(!acknowledged)throw Error('Cloud did not confirm wager '+id)
  const checkpoint=previous.filter(w=>w.id!==id)
  if(desired)checkpoint.push(desired)
  state.last=JSON.stringify(checkpoint)
  changes++
 }
 return changes
}
