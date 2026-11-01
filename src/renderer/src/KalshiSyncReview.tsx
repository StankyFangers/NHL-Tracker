import {useEffect,useState,type CSSProperties} from 'react'
export type KalshiFlag={id:string;date:string;ticker:string;description:string;reason:string;category:'COMBOS'|'ASSISTS'|'OTHER'|'UNDETERMINED';notes:string;correctedDescription:string;status:'NEEDS_REVIEW'|'REVIEWED'|'DISMISSED';updatedAt:string}
const KEY='nhl-tracker:kalshi:flagged-review:v1'
export const readKalshiFlags=():KalshiFlag[]=>{try{const x=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(x)?x.filter(v=>v&&typeof v.id==='string'):[]}catch{return []}}
export function addKalshiFlags(items:Pick<KalshiFlag,'id'|'date'|'ticker'|'description'|'reason'>[]){
 const data=readKalshiFlags(), byId=new Map(data.map(x=>[x.id,x]))
 for(const x of items){
  if(!x.id||byId.has(x.id))continue
  byId.set(x.id,{...x,category:'UNDETERMINED',notes:'',correctedDescription:x.description,status:'NEEDS_REVIEW',updatedAt:new Date().toISOString()})
 }
 const result=[...byId.values()]
 localStorage.setItem(KEY,JSON.stringify(result))
 window.dispatchEvent(new Event('kalshi-review-updated'))
 return result
}
export function KalshiSyncReview({betIds=[]}:{betIds?:string[]}){
 const [items,setItems]=useState<KalshiFlag[]>(readKalshiFlags)
 const [filter,setFilter]=useState<'NEEDS_REVIEW'|'REVIEWED'|'DISMISSED'|'ALL'>('NEEDS_REVIEW')
 const [active,setActive]=useState('')
 useEffect(()=>{const cb=()=>setItems(readKalshiFlags());window.addEventListener('kalshi-review-updated',cb);return()=>window.removeEventListener('kalshi-review-updated',cb)},[])
 const update=(id:string,fields:Partial<KalshiFlag>)=>{
  const next=items.map(x=>x.id===id?{...x,...fields,updatedAt:new Date().toISOString()}:x)
  setItems(next);localStorage.setItem(KEY,JSON.stringify(next));window.dispatchEvent(new Event('kalshi-review-updated'))
 }
 const demoPrefix='KALSHI-DEMO-REVIEW-'
 const loadDemo=()=>{
  addKalshiFlags([
   {id:demoPrefix+'PLAYER',date:'2026-11-01',ticker:'DEMO-NHL-PLAYER',description:'Example: Sample Skater 1+ Point + Sample Forward 1+ Point',reason:'TEST SAMPLE: Could not verify the first player identity'},
   {id:demoPrefix+'COMBO',date:'2026-11-01',ticker:'DEMO-NHL-COMBO',description:'Example: Sample Forward A 2+ Points + Sample Forward B 1+ Point',reason:'TEST SAMPLE: Exact combo leg threshold requires review'},
   {id:demoPrefix+'FEE',date:'2026-11-01',ticker:'DEMO-NHL-FEE',description:'Example: Sample Skater 1+ Assist',reason:'TEST SAMPLE: Fill cost or fee could not be verified'}
  ])
  setFilter('NEEDS_REVIEW')
 }
 const clearDemo=()=>{
  const next=readKalshiFlags().filter(x=>!x.id.startsWith(demoPrefix))
  localStorage.setItem(KEY,JSON.stringify(next))
  setItems(next);setActive('')
  window.dispatchEvent(new Event('kalshi-review-updated'))
 }
 const included=new Set(betIds)
 const visible=items.filter(x=>(filter==='ALL'||x.status===filter)&&!included.has(x.id))
 const counts={review:items.filter(x=>x.status==='NEEDS_REVIEW'&&!included.has(x.id)).length,done:items.filter(x=>x.status==='REVIEWED'&&!included.has(x.id)).length}
 const panel:CSSProperties={padding:16,border:'1px solid #345664',background:'#0d2230',borderRadius:10,margin:'12px 0'}
 const field:CSSProperties={background:'#102b38',color:'#e5f5fa',border:'1px solid #456a79',borderRadius:6,padding:'8px 10px',width:'100%'}
 const action:CSSProperties={background:'#146c57',color:'#fff',border:'1px solid #278e75',borderRadius:7,padding:'8px 12px',cursor:'pointer'}
 return <section style={{maxWidth:1180,margin:'12px auto',color:'#e6f5fa'}}>
  <h2>Kalshi Sync Review</h2>
  <p style={{fontSize:13,color:'#a9c7d3'}}>Flagged wagers are held here instead of being added to your Bet Tracker. You can correct descriptions, record the intended category, and add notes. Marking a wager reviewed does not import it; the corrected wager must pass identity, cost and duplicate verification before import is enabled.</p>
  {import.meta.env.DEV&&<div style={{...panel,borderStyle:'dashed',background:'#132d37'}}>
   <b style={{color:'#baf4d8'}}>TEST ONLY · NO REAL KALSHI WAGERS</b>
   <p style={{fontSize:12,color:'#b7d1dd'}}>Try the review queue using three labeled demo flags. This never contacts Kalshi, places bets, or writes anything to Bet Tracker.</p>
   <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button style={action} onClick={loadDemo}>Load Sample Flags</button><button style={{...action,background:'#374456'}} onClick={clearDemo}>Clear Sample Flags</button></div>
  </div>}
  <div style={{display:'flex',gap:8,flexWrap:'wrap',margin:'12px 0'}}>{(['NEEDS_REVIEW','REVIEWED','DISMISSED','ALL'] as const).map(x=><button key={x} style={{...action,background:filter===x?'#177c60':'#193947'}} onClick={()=>setFilter(x)}>{x==='NEEDS_REVIEW'?'Needs Review ('+counts.review+')':x==='REVIEWED'?'Reviewed ('+counts.done+')':x==='DISMISSED'?'Dismissed':'All'}</button>)}</div>
  {visible.length===0?<div style={panel}>No flagged wagers in this view. Newly skipped or ambiguous Kalshi orders will appear here after the next sync.</div>:visible.map(x=><article key={x.id} style={panel}>
   <div style={{display:'flex',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}>
    <div><b>{x.correctedDescription||x.description||x.ticker}</b><div style={{color:'#8eb4c3',fontSize:11,marginTop:4}}>{x.date} · {x.ticker} · ID: {x.id}</div></div>
    <button style={action} onClick={()=>setActive(active===x.id?'':x.id)}>{active===x.id?'Close Review':'Review / Edit'}</button>
   </div>
   <p style={{color:'#efc28f',fontSize:12}}><b>Flag:</b> {x.reason}</p>
   {active===x.id&&<div style={{display:'grid',gap:12,borderTop:'1px solid #294957',paddingTop:12}}>
    <label style={{display:'grid',gap:5}}>Corrected market / player descriptions<textarea rows={2} style={field} value={x.correctedDescription} onChange={e=>update(x.id,{correctedDescription:e.target.value})}/></label>
    <label style={{display:'grid',gap:5}}>Intended category<select style={field} value={x.category} onChange={e=>update(x.id,{category:e.target.value as KalshiFlag['category']})}><option value="UNDETERMINED">Needs verification</option><option value="COMBOS">COMBOS</option><option value="ASSISTS">ASSISTS</option><option value="OTHER">OTHER</option></select></label>
    <label style={{display:'grid',gap:5}}>Review notes<textarea rows={3} style={field} value={x.notes} onChange={e=>update(x.id,{notes:e.target.value})} placeholder="Player corrections, exact market thresholds, Kalshi ticket notes…"/></label>
    <div style={{display:'flex',gap:9,flexWrap:'wrap'}}>
     <button style={action} onClick={()=>update(x.id,{status:'REVIEWED'})}>Save as Reviewed</button>
     <button style={{...action,background:'#4c3642'}} onClick={()=>update(x.id,{status:'DISMISSED'})}>Dismiss Flag</button>
     <button style={{...action,background:'#193947'}} onClick={()=>update(x.id,{status:'NEEDS_REVIEW'})}>Return to Queue</button>
    </div>
   </div>}
  </article>)}
  <p style={{fontSize:11,color:'#93b4c0'}}>Review entries are stored locally in this app profile. They contain wager metadata only, never API credentials. This is a review-and-correction queue, not a settlement or manual-import override.</p>
 </section>
}
