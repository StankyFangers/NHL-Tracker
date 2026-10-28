import {useEffect,useState} from 'react'
import './sectionColors.css'
export type SectionName='games'|'events'|'bets'
export type SectionProperty='accent'|'background'|'rail'
export type SectionColors=Record<SectionName,Record<SectionProperty,string>>
export const DEFAULT_SECTION_COLORS:SectionColors={
 games:{accent:'#44b4ed',background:'#0b151e',rail:'#123147'},
 events:{accent:'#44b4ed',background:'#0b151e',rail:'#123147'},
 bets:{accent:'#44b4ed',background:'#0b151e',rail:'#123147'}
}
const STORAGE_KEY='nhlTracker:sectionColors:v2'
const LEGACY_KEY='nhlTracker:sectionColors:v1'
const isHex=(v:unknown):v is string=>typeof v==='string'&&/^#[0-9a-fA-F]{6}$/.test(v)
const names:SectionName[]=['games','events','bets']
const load=():SectionColors=>{let newer:any={},old:any={};try{newer=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')}catch{}try{old=JSON.parse(localStorage.getItem(LEGACY_KEY)||'{}')}catch{}
 const result={} as SectionColors;for(const n of names){result[n]={...DEFAULT_SECTION_COLORS[n]};for(const k of ['accent','background','rail'] as SectionProperty[]){const v=newer?.[n]?.[k]??(k==='accent'?old?.[n]:undefined);if(isHex(v))result[n][k]=v}}return result}
export function useSectionColors(){
 const [colors,setColors]=useState<SectionColors>(load)
 useEffect(()=>{const sync=()=>setColors(load());window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync)},[])
 const update=(name:SectionName,property:SectionProperty,color:string)=>{if(!isHex(color))return;setColors(prev=>{const next={...prev,[name]:{...prev[name],[property]:color}};localStorage.setItem(STORAGE_KEY,JSON.stringify(next));return next})}
 const reset=()=>{setColors({...DEFAULT_SECTION_COLORS});localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(LEGACY_KEY)}
 return {colors,update,reset}
}
const segments:[SectionName,string][]=[['games',"Today's Games / Scoreboard"],['bets','Bet Tracker'],['events','Live Event Tracker']]
const controls:[SectionProperty,string][]=[['background','Panel background'],['accent','Highlight border'],['rail','Collapsed tab / rail']]
export function SectionColorSettings({colors,update,reset}:{colors:SectionColors;update:(name:SectionName,property:SectionProperty,color:string)=>void;reset:()=>void}){return <section className="sectionColorSettings"><div className="sectionColorHeading"><div><h2>Section Colors</h2><p>Choose separate panel background, highlight border and collapsed-tab colors for each section.</p></div><button type="button" className="sectionColorReset" onClick={reset}>RESET COLORS</button></div><div className="sectionColorGrid">{segments.map(([name,label])=><div key={name} className="sectionColorGroup"><strong>{label}</strong>{controls.map(([property,caption])=><label key={property} className="sectionColorOption"><input type="color" value={colors[name][property]} onChange={e=>update(name,property,e.target.value)} aria-label={label+' '+caption}/><span>{caption}</span><code>{colors[name][property].toUpperCase()}</code></label>)}</div>)}</div><p className="sectionColorNote">Changes apply immediately and are saved on this computer. Existing accent selections are preserved.</p></section>}
