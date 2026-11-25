import {useEffect, useRef, useState, useSyncExternalStore} from 'react'
import {createPortal} from 'react-dom'
import {PROFILE_CHANGED, savedResearchProfile, StrategyReference} from './StrategyReference'

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
 h2 { margin:0; font-size:20px }
 p { color:#b8cede }
 table { width:100%; border-collapse:collapse; font-variant-numeric:tabular-nums }
 th, td { padding:8px; text-align:left; border-bottom:1px solid #304759 }
 th { background:#142c40 }
 tbody tr:nth-child(even) { background:#102437 }
 .researchTable { overflow-x:auto }
 .researchFootnote { font-size:12px }
`

export function StrategyPopoutButton({accountKey, unitSize}:{accountKey:string; unitSize:number}) {
 const child = useRef<Window|null>(null)
 const [body, setBody] = useState<HTMLElement|null>(null)
 const [blocked, setBlocked] = useState(false)
 const profile = useSyncExternalStore(subscribe, () => savedResearchProfile(accountKey))
 useEffect(() => () => { child.current?.close() }, [])

 function openStrategy() {
  if (child.current && !child.current.closed) {
   child.current.focus()
   return
  }
  const popup = window.open('about:blank', 'nhlTrackerBetStrategy', 'popup,width=780,height=620,resizable=yes,scrollbars=yes')
  setBlocked(!popup)
  if (!popup) return
  child.current = popup
  popup.document.title = 'Bet Strategy · NHL Tracker'
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
  <button type="button" onClick={openStrategy}>POP OUT BET STRATEGY</button>
  {blocked && <small role="status">Unable to open the strategy window.</small>}
  {body && createPortal(<StrategyReference profile={profile} unitSize={unitSize}/>, body)}
 </>
}
