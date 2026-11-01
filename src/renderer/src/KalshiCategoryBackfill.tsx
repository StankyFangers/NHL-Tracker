import {useState} from 'react'
import {isTwoPointOnePoint} from './kalshiImport'

type Bet={id:string;date:string;category?:string;book?:string;legs:any[];status?:string}
const TARGET='2P - 1P'
const eligible=(b:Bet)=>['COMBOS','OTHER','2P + 1P','2P - 1P'].includes(String(b.category||'COMBOS').toUpperCase())&&isTwoPointOnePoint(b.legs||[])
const actionStyle={background:'#096d55',color:'#fff',border:'1px solid #23aa87',padding:'9px 14px',borderRadius:7,cursor:'pointer'}
export function KalshiCategoryBackfill({bets,setBets,canSave}:{bets:Bet[];setBets:any;canSave:boolean}){
 const [preview,setPreview]=useState(false)
 const [message,setMessage]=useState('')
 const targets=bets.filter(b=>eligible(b)&&b.category!==TARGET)
 const already=bets.filter(b=>eligible(b)&&b.category===TARGET).length
 const sample=targets.slice(0,100)
 const apply=()=>{
  if(!preview||!canSave)return
  const allowed=new Set(targets.map(b=>b.id))
  setBets((old:Bet[])=>{
   let changed=false
   const next=old.map(b=>{
    if(!allowed.has(b.id)||!eligible(b)||b.category===TARGET)return b
    changed=true
    // Preserve IDs, original bookmaker, odds, stake, results, payout and timestamps.
    return {...b,category:TARGET}
   })
   return changed?next:old
  })
  setPreview(false)
  setMessage('Category-only updates submitted for '+allowed.size+' wagers. Confirm Cloud saved.')
 }
 return <section style={{marginTop:16,padding:14,border:'1px solid #345664',borderRadius:10}}>
  <h3 style={{margin:'0 0 6px'}}>2P - 1P Historical Backfill</h3>
  <p style={{fontSize:13}}>Find previously saved NHL point wagers with exactly one 2+ leg and at least one 1+ leg on distinct players. Existing COMBOS and OTHER wagers qualify; unrelated categories are left alone. Only the category will change.</p>
  <p><strong>{targets.length}</strong> eligible wagers to update · <strong>{already}</strong> already labeled {TARGET}</p>
  <button style={actionStyle} disabled={!canSave||!targets.length} onClick={()=>{setPreview(true);setMessage('')}}>Preview Category Backfill</button>
  {preview&&<div style={{marginTop:12}}>
   <strong>Review category-only changes ({targets.length} wagers)</strong>
   <div style={{maxHeight:280,overflowY:'auto',margin:'10px 0',borderTop:'1px solid #345664'}}>
    {sample.map(b=><div key={b.id} style={{padding:'8px 0',borderBottom:'1px solid #345664',fontSize:12}}>
     <b>{b.date} · {b.category||'COMBOS'} → {TARGET}</b>
     <div>{b.legs.map(l=>String(l.player)+' '+l.qty+'+ '+l.stat).join(' + ')}</div>
     <div style={{color:'#aac4cf'}}>{b.book||''} · {b.status||'PENDING'} · {b.id}</div>
    </div>)}
   </div>
   {targets.length>sample.length&&<p>Showing the first {sample.length} of {targets.length} changes.</p>}
   <div style={{display:'flex',gap:10}}>
    <button style={actionStyle} disabled={!canSave} onClick={apply}>Apply {targets.length} Category Changes</button>
    <button style={{...actionStyle,background:'#193947'}} onClick={()=>setPreview(false)}>Cancel</button>
   </div>
  </div>}
  {!!message&&<p role="status">{message}</p>}
 </section>
}
