import {useEffect,useState} from 'react'
import './sectionColors.css'
export type SectionColors={games:string;events:string;bets:string}
export const DEFAULT_SECTION_COLORS:SectionColors={games:'#44b4ed',events:'#44b4ed',bets:'#44b4ed'}
const STORAGE_KEY='nhlTracker:sectionColors:v1'
const isHex=(v:unknown):v is string=>typeof v==='string'&&/^#[0-9a-fA-F]{6}$/.test(v)
const load=():SectionColors=>{try{const raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');return{games:isHex(raw.games)?raw.games:DEFAULT_SECTION_COLORS.games,events:isHex(raw.events)?raw.events:DEFAULT_SECTION_COLORS.events,bets:isHex(raw.bets)?raw.bets:DEFAULT_SECTION_COLORS.bets}}catch{return{...DEFAULT_SECTION_COLORS}}}
export function useSectionColors(){
 const [colors,setColors]=useState<SectionColors>(load)
 useEffect(()=>{const sync=()=>setColors(load());window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync)},[])
 const update=(key:keyof SectionColors,color:string)=>{if(!isHex(color))return;const next={...colors,[key]:color};setColors(next);localStorage.setItem(STORAGE_KEY,JSON.stringify(next))}
 const reset=()=>{setColors({...DEFAULT_SECTION_COLORS});localStorage.removeItem(STORAGE_KEY)}
 return {colors,update,reset}
}
const segments:[keyof SectionColors,string,string][]=[['games',"Today's Games / Scoreboard",'Top games strip, selected game and border'],['bets','Bet Tracker','Panel header, border and collapse rail'],['events','Live Event Tracker','Panel header, border and collapse rail']]
export function SectionColorSettings({colors,update,reset}:{colors:SectionColors;update:(key:keyof SectionColors,color:string)=>void;reset:()=>void}){return <section className="sectionColorSettings"><div className="sectionColorHeading"><div><h2>Section Accent Colors</h2><p>Customize each tracker section independently. Your existing dark theme remains unchanged.</p></div><button type="button" className="sectionColorReset" onClick={reset}>RESET TO BLUE</button></div><div className="sectionColorGrid">{segments.map(([key,label,detail])=><label key={key} className="sectionColorOption"><input type="color" value={colors[key]} onChange={e=>update(key,e.target.value)} aria-label={label+' color'}/><span><strong>{label}</strong><small>{detail}</small></span><code>{colors[key].toUpperCase()}</code></label>)}</div><p className="sectionColorNote">Changes apply immediately and are saved on this computer.</p></section>}
