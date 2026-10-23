export const CONFIDENCE_TRACKING_START='2026-10-21'
export const CONFIDENCE_TRACKING_LABEL='10/21/2026'
/** Retire earlier confidence records once, keeping an exact local backup first. */
export function trackedConfidenceRows<T extends {date:string}>(key:string,rows:T[]):T[]{
 const kept=rows.filter(r=>r.date>=CONFIDENCE_TRACKING_START)
 if(kept.length!==rows.length){try{
  const backup=key+':archive-before-'+CONFIDENCE_TRACKING_START
  if(localStorage.getItem(backup)==null)localStorage.setItem(backup,JSON.stringify(rows))
  localStorage.setItem(key,JSON.stringify(kept))
 }catch{/* Keep the analytics cutoff even if storage cannot be updated. */}}
 return kept
}
