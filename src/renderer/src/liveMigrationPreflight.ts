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
  if(!isRecord(value)||value.format!=='NHL_TRACKER_LIVE_MIGRATION_BACKUP'||value.version!==1||value.environment!=='LIVE'||!Array.isArray(value.bets))
    throw new Error('Expected an NHL Tracker LIVE migration backup (version 1)')
  if(value.bets.length>20000)throw new Error('Migration exceeds 20,000 wager safety limit')
  const seen=new Set<string>()
  return value.bets.map((w:unknown,i:number)=>{
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
