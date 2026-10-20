'use strict'
// Pure, fail-closed reconciliation planner. Never mutates local or cloud records.
// Deliberately no API writes: a separate migration approval is required.
function valid(w) {
 return !!w && typeof w==='object' && !Array.isArray(w) &&
  typeof w.id==='string' && w.id.length>0 && w.id.length<=150 &&
  typeof w.date==='string' && /^\d{4}-\d{2}-\d{2}$/.test(w.date) &&
  Array.isArray(w.legs) && w.legs.length<=12
}
function indexWagers(wagers,label) {
 if(!Array.isArray(wagers))throw new Error(label+' must be an array')
 const indexed=new Map()
 for(const w of wagers){
  if(!valid(w))throw new Error(label+' contains an invalid wager')
  if(indexed.has(w.id))throw new Error(label+' contains duplicate wager ID '+w.id)
  indexed.set(w.id,w)
 }
 return indexed
}
function stable(value) {
 if(Array.isArray(value))return '['+value.map(stable).join(',')+']'
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}'
 return JSON.stringify(value)
}
function planMigration(local,cloudRows) {
 const localIndex=indexWagers(local,'Local')
 if(!Array.isArray(cloudRows))throw new Error('Cloud rows must be an array')
 const cloudIndex=indexWagers(cloudRows.map(row=>{
  if(!row||!valid(row.wager)||row.wager_id!==row.wager.id)throw new Error('Cloud row identity mismatch')
  return row.wager
 }),'Cloud')
 const localOnly=[],identical=[],conflicts=[],cloudOnly=[]
 for(const [id,w] of localIndex){
  if(!cloudIndex.has(id))localOnly.push(id)
  else if(stable(w)===stable(cloudIndex.get(id)))identical.push(id)
  else conflicts.push(id)
 }
 for(const id of cloudIndex.keys())if(!localIndex.has(id))cloudOnly.push(id)
 return {localCount:localIndex.size,cloudCount:cloudIndex.size,localOnly,identical,conflicts,cloudOnly,canAutoMerge:false}
}
module.exports={planMigration}
