// LIVE migration preflight. Pure, read-only functions: never modify localStorage or Neon.
export type HistoricalWager = {
  id:string
  date:string
  legs:unknown[]
  [key:string]:unknown
}
export type CloudWagerRow = {wager_id:string;wager:HistoricalWager;updated_at?:string}
export type MigrationComparison = {
  sourceCount:number
  cloudCount:number
  missing:HistoricalWager[]
  identical:string[]
  conflicts:Array<{id:string;source:HistoricalWager;cloud:HistoricalWager}>
  cloudOnly:string[]
}
const isRecord=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
export const validHistoricalWager=(v:unknown):v is HistoricalWager=>
  isRecord(v)&&typeof v.id==='string'&&v.id.length>0&&v.id.length<=150&&
  typeof v.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v.date)&&
  Number.isFinite(Date.parse(v.date+'T00:00:00Z'))&&new Date(v.date+'T00:00:00Z').toISOString().slice(0,10)===v.date&&
  Array.isArray(v.legs)&&v.legs.length>0&&v.legs.length<=12

// Compare JSON semantics, not property insertion order. Array order is preserved.
export function canonicalJson(v:unknown):string{
  if(Array.isArray(v))return '['+v.map(canonicalJson).join(',')+']'
  if(isRecord(v))return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonicalJson(v[k])).join(',')+'}'
  return JSON.stringify(v)??'null'
}
export function parseMigrationBackup(value:unknown):HistoricalWager[]{
  if(!isRecord(value)||value.version!==1)throw new Error('Expected a LIVE migration backup or full NHL Tracker backup (version 1)')
  let bets:unknown
  if(value.format==='NHL_TRACKER_LIVE_MIGRATION_BACKUP'&&value.environment==='LIVE')bets=value.bets
  else if(value.format==='NHL_TRACKER_FULL_BACKUP'&&isRecord(value.storage)){
    // Import only legacy LIVE wagers, never TEST caches or other storage keys.
    if(typeof value.storage.bets!=='string')throw new Error('Full backup has no local LIVE wagers in storage.bets')
    try{bets=JSON.parse(value.storage.bets)}catch{throw new Error('Full backup contains invalid wager JSON')}
  }else throw new Error('Expected a LIVE migration backup or full NHL Tracker backup (version 1)')
  if(!Array.isArray(bets))throw new Error('Backup wagers must be an array')
  if(bets.length>20000)throw new Error('Migration exceeds 20,000 wager safety limit')
  const seen=new Set<string>()
  return bets.map((w:unknown,i:number)=>{
    if(!validHistoricalWager(w))throw new Error('Invalid wager at row '+(i+1))
    if(seen.has(w.id))throw new Error('Duplicate wager ID: '+w.id)
    seen.add(w.id)
    return w
  })
}
export function compareMigration(source:HistoricalWager[],cloud:CloudWagerRow[]):MigrationComparison{
  const sourceIds=new Set<string>()
  const cloudById=new Map<string,HistoricalWager>()
  for(const w of source){
    if(!validHistoricalWager(w)||sourceIds.has(w.id))throw new Error('Invalid or duplicate source wager: '+String(w?.id))
    sourceIds.add(w.id)
  }
  for(const row of cloud){
    if(!validHistoricalWager(row.wager)||row.wager_id!==row.wager.id||cloudById.has(row.wager_id))
      throw new Error('Invalid or duplicate cloud wager: '+String(row?.wager_id))
    cloudById.set(row.wager_id,row.wager)
  }
  const missing:HistoricalWager[]=[],identical:string[]=[],conflicts:MigrationComparison['conflicts']=[]
  for(const w of source){
    const remote=cloudById.get(w.id)
    if(!remote)missing.push(w)
    else if(canonicalJson(remote)===canonicalJson(w))identical.push(w.id)
    else conflicts.push({id:w.id,source:w,cloud:remote})
  }
  return {sourceCount:source.length,cloudCount:cloud.length,missing,identical,conflicts,cloudOnly:[...cloudById.keys()].filter(id=>!sourceIds.has(id))}
}
