import {compareMigration, type HistoricalWager, type CloudWagerRow} from './liveMigrationPreflight'

export type CloudRequest = (payload:{
  method:'GET'|'POST';limit?:number;cursor?:string;wager?:HistoricalWager;source?:'import'
})=>Promise<{wagers?:CloudWagerRow[];nextCursor?:string|null;ok?:boolean;id?:string;created?:boolean;error?:string;status?:number}>

export async function listAllCloudWagers(request:CloudRequest):Promise<CloudWagerRow[]>{
  const result:CloudWagerRow[]=[],seen=new Set<string>()
  let cursor=''
  const cursors=new Set<string>()
  for(let page=0;page<100;page++){
    const response=await request({method:'GET',limit:200,...(cursor?{cursor}:{})})
    if(response.error||response.ok===false)throw new Error(response.error||'Cloud listing failed')
    if(!Array.isArray(response.wagers))throw new Error('Invalid cloud response')
    if(response.wagers.length>200)throw new Error('Cloud page exceeds requested limit')
    let lastId=cursor
    for(const row of response.wagers){
      if(!row||typeof row.wager_id!=='string'||seen.has(row.wager_id))throw new Error('Duplicate or invalid cloud ID')
      if(row.wager_id<=lastId)throw new Error('Cloud wager page is not strictly ordered')
      if(!row.wager||row.wager.id!==row.wager_id)throw new Error('Cloud wager identity mismatch')
      lastId=row.wager_id
      seen.add(row.wager_id);result.push(row)
    }
    if(result.length>20000)throw new Error('Cloud listing safety limit exceeded')
    if(response.nextCursor===null)return result
    if(response.wagers.length===0)throw new Error('Empty cloud page with continuation cursor')
    if(typeof response.nextCursor!=='string'||!response.nextCursor||cursors.has(response.nextCursor))throw new Error('Invalid or repeated cloud cursor')
    if(response.nextCursor!==lastId)throw new Error('Cloud cursor does not match last wager ID')
    cursors.add(response.nextCursor)
    cursor=response.nextCursor
  }
  throw new Error('Cloud pagination safety limit exceeded')
}

export type ImportProgress={uploaded:number;remaining:number;message:string}

// Create-only import. Never patches or deletes. Conflicts block upload.
// After each POST the server enforces account ownership and unique wager ID.
// An interrupted run can be restarted; identical existing records are skipped.
export async function importHistoricalWagers(
  source:HistoricalWager[],request:CloudRequest,onProgress:(p:ImportProgress)=>void
):Promise<{uploaded:number;identical:number;cloudOnly:number}>{
  const initial=compareMigration(source,await listAllCloudWagers(request))
  if(initial.conflicts.length)throw new Error(initial.conflicts.length+' same-ID conflicts block migration')
  let uploaded=0
  for(const wager of initial.missing){
    const response=await request({method:'POST',wager,source:'import'})
    if(response.error||response.ok!==true||response.id!==wager.id||response.created!==true){
      throw new Error('Import stopped after '+uploaded+' creates at wager '+wager.id+': '+(response.error||'Unexpected server response')+'. Re-run preview before retrying.')
    }
    uploaded++
    onProgress({uploaded,remaining:initial.missing.length-uploaded,message:'Creating missing cloud wagers'})
  }
  const verified=compareMigration(source,await listAllCloudWagers(request))
  if(verified.conflicts.length||verified.missing.length)throw new Error('Cloud reconciliation failed: '+verified.missing.length+' missing and '+verified.conflicts.length+' conflicting wagers. Source backup is unchanged.')
  return {uploaded,identical:verified.identical.length,cloudOnly:verified.cloudOnly.length}
}
