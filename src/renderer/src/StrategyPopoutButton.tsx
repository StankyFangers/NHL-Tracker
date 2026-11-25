import {useEffect, useRef, useState, useSyncExternalStore} from 'react'
import {createPortal} from 'react-dom'
import {PROFILE_CHANGED, savedResearchProfile, StrategyReference} from './StrategyReference'

import {classifyResearch, RULES, RESEARCH_PROFILES, type ResearchCombo, type ResearchProfile} from './comboResearchModel'

function subscribe(refresh:()=>void) {
 window.addEventListener(PROFILE_CHANGED, refresh)
 window.addEventListener('storage', refresh)
 return () => {
  window.removeEventListener(PROFILE_CHANGED, refresh)
  window.removeEventListener('storage', refresh)
 }
}

const popupStyles = `
 :root { color-scheme:dark; font:14px/1.45 system-ui,sans-serif; color:#e6f1fa; background:#0a1928 }
 body { margin:18px }
 label { display:flex; align-items:center; gap:10px; margin-bottom:14px; flex-wrap:wrap }
 select { padding:5px 8px; font:inherit }
 h2 { margin:0; font-size:20px }
 p { color:#b8cede }
 table { width:100%; border-collapse:collapse; font-variant-numeric:tabular-nums }
 th, td { padding:8px; text-align:left; border-bottom:1px solid #304759 }
 th { background:#142c40 }
 tbody tr:nth-child(even) { background:#102437 }
 .researchTable { overflow-x:auto }
 .researchFootnote { font-size:12px }
`

type Combo = Pick<ResearchCombo,'players'|'forwardLine'|'ppUnit'>

function ComboGuide({combo,profile,unitSize}:{combo:Combo;profile:ResearchProfile;unitSize:number}) {
 const unitCents = Math.round(unitSize * 100)
 const money = (cents:number) => '$' + (cents / 100).toFixed(2)
 const rows:{from:number;through:number|null;units:number}[] = []
 let from = 0
 for (const cap of [100,150,200,300,Infinity]) {
  const category = classifyResearch({...combo,odds:cap===Infinity?301:cap})
  if (category==='UNKNOWN') return <p>No strategy rule for this combo.</p>
  const through = Number.isFinite(cap)?Math.floor(unitCents*(100+cap)/100):null
  const units = RULES[category][profile]
  const previous = rows[rows.length-1]
  if (previous && previous.units===units) previous.through=through
  else rows.push({from,through,units})
  if (through!==null) from=through+1
 }
 function range(from:number,through:number|null) {
  if (!from) return through===null?'Any payout':money(through)+' or less'
  return through===null?money(from)+' or more':money(from)+' – '+money(through)
 }
 return <>
  <h2>{combo.players.join(' + ')}</h2>
  <p>FL{combo.forwardLine} · PP{combo.ppUnit} · {combo.players.length===3?'Trio':'Duo'}</p>
  {unitCents>0?<table><thead><tr><th>Kalshi payout on 1u ({money(unitCents)})</th><th>Wager</th></tr></thead>
   <tbody>{rows.map(row=><tr key={row.from}><td>{range(row.from,row.through)}</td><td><strong>{row.units?row.units+'u ('+money(Math.round(unitCents*row.units))+')':'SKIP'}</strong></td></tr>)}</tbody></table>
   :<p>Set your unit size to see payout ranges.</p>}
 </>
}

export function StrategyPopoutButton({accountKey, unitSize, scope, override, onChange, combo}:{combo?:Combo; accountKey:string; unitSize:number; scope:string; override?:ResearchProfile; onChange:(value:ResearchProfile|undefined)=>void}) {
 const child = useRef<Window|null>(null)
 const [body, setBody] = useState<HTMLElement|null>(null)
 const [blocked, setBlocked] = useState(false)
 const defaultProfile = useSyncExternalStore(subscribe, () => savedResearchProfile(accountKey))
 useEffect(() => () => { child.current?.close() }, [])

 function openStrategy() {
  if (child.current && !child.current.closed) {
   child.current.focus()
   return
  }
  const popup = window.open('about:blank', combo?'_blank':'nhlTrackerBetStrategy', 'popup,width=780,height=620,resizable=yes,scrollbars=yes')
  setBlocked(!popup)
  if (!popup) return
  child.current = popup
  popup.document.title = combo?combo.players.join(' + ')+' · Combo Strategy':'Bet Strategy · NHL Tracker'
  const style = popup.document.createElement('style')
  style.textContent = popupStyles
  popup.document.head.appendChild(style)
  popup.addEventListener('pagehide', () => {
   if (child.current === popup) {
    child.current = null
    setBody(null)
   }
  }, {once:true})
  setBody(popup.document.body)
 }

 return <>
  <button type="button" onClick={openStrategy}>{combo?'Combo Strategy':'POP OUT BET STRATEGY'}</button>
  {blocked && <small role="status">Unable to open the strategy window.</small>}
  {body && createPortal(<>
   <label>Strategy · {scope}
    <select value={override??''} onChange={event=>onChange(RESEARCH_PROFILES.find(value=>value===event.target.value))}>
     <option value="">Account default ({defaultProfile}u)</option>
     {RESEARCH_PROFILES.map(value=><option key={value} value={value}>{value}u</option>)}
    </select>
   </label>
   {combo?<ComboGuide combo={combo} profile={override??defaultProfile} unitSize={unitSize}/>:<StrategyReference profile={override??defaultProfile} unitSize={unitSize}/>}
  </>, body)}
 </>
}
