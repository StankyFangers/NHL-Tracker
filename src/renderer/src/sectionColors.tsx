import {useEffect,useState} from 'react'
import './sectionColors.css'
import {loadSmart,SMART_KEY,SMART_DEFAULTS} from './smartThemes'
import type {SmartMode} from './smartThemes'
export {smartPalette} from './smartThemes'
export function useSmartThemes(){const [smart,setSmart]=useState<SmartMode>(loadSmart);useEffect(()=>{const sync=()=>setSmart(loadSmart());window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync)},[]);const updateSmart=(key:keyof SmartMode,value:boolean)=>setSmart(previous=>{const next={...previous,[key]:value};localStorage.setItem(SMART_KEY,JSON.stringify(next));return next});const resetSmart=()=>{localStorage.removeItem(SMART_KEY);setSmart({...SMART_DEFAULTS})};return{smart,updateSmart,resetSmart}}
export function SmartThemeToggle({label,checked,onChange}:{label:string;checked:boolean;onChange:(v:boolean)=>void}){return <label className="smartThemeToggle"><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/><span>Auto Match Colors — {label}</span></label>}
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
export function SectionColorSettings({colors,update,reset,smart,updateSmart}:{colors:SectionColors;update:(name:SectionName,property:SectionProperty,color:string)=>void;reset:()=>void;smart:SmartMode;updateSmart:(key:keyof SmartMode,value:boolean)=>void}){return <section className="sectionColorSettings"><div className="sectionColorHeading"><div><h2>Section Colors</h2><p>Choose separate panel background, highlight border and collapsed-tab colors for each section.</p></div><button type="button" className="sectionColorReset" onClick={reset}>RESET COLORS</button></div><div className="sectionColorGrid">{segments.map(([name,label])=><div key={name} className="sectionColorGroup"><strong>{label}</strong><SmartThemeToggle label={label} checked={smart[name]} onChange={value=>updateSmart(name,value)}/>{controls.map(([property,caption])=><label key={property} className="sectionColorOption"><input type="color" value={colors[name][property]} onChange={e=>update(name,property,e.target.value)} aria-label={label+' '+caption}/><span>{caption}</span><code>{colors[name][property].toUpperCase()}</code></label>)}</div>)}</div><p className="sectionColorNote">Changes apply immediately and are saved on this computer. Existing accent selections are preserved.</p></section>}

type BetEntryColors={slip:string;research:string}
const ENTRY_KEY='nhlTracker:betEntryColors:v1'
const ENTRY_DEFAULTS:BetEntryColors={slip:'#0b1b29',research:'#0b1b29'}
const loadEntry=():BetEntryColors=>{try{const data=JSON.parse(localStorage.getItem(ENTRY_KEY)||'{}');return{slip:isHex(data.slip)?data.slip:ENTRY_DEFAULTS.slip,research:isHex(data.research)?data.research:ENTRY_DEFAULTS.research}}catch{return{...ENTRY_DEFAULTS}}}
export function useBetEntryColors(){
 const [entryColors,setEntryColors]=useState<BetEntryColors>(loadEntry)
 useEffect(()=>{const sync=()=>setEntryColors(loadEntry());window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync)},[])
 const updateEntryColor=(key:keyof BetEntryColors,color:string)=>{if(!isHex(color))return;setEntryColors(current=>{const next={...current,[key]:color};localStorage.setItem(ENTRY_KEY,JSON.stringify(next));return next})}
 const resetEntryColors=()=>{localStorage.removeItem(ENTRY_KEY);setEntryColors({...ENTRY_DEFAULTS})}
 return {entryColors,updateEntryColor,resetEntryColors}
}
export function BetEntryColorSettings({colors,update,reset,smart,updateSmart}:{colors:BetEntryColors;update:(key:keyof BetEntryColors,color:string)=>void;reset:()=>void;smart:SmartMode;updateSmart:(key:keyof SmartMode,value:boolean)=>void}){return <section className="sectionColorSettings"><div className="sectionColorHeading"><div><h2>Bet Entry Colors</h2><p>Two background pickers for the Bet Slip and the pregame research area.</p></div><button type="button" className="sectionColorReset" onClick={reset}>RESET BET ENTRY</button></div><div className="sectionColorGrid">{([['slip','Bet Slip background'],['research','Pregame Research background']] as const).map(([key,label])=><label key={key} className="sectionColorOption"><input type="color" value={colors[key]} onChange={e=>update(key,e.target.value)} aria-label={label}/><span><strong>{label}</strong><SmartThemeToggle label={label} checked={smart[key]} onChange={value=>updateSmart(key,value)}/></span><code>{colors[key].toUpperCase()}</code></label>)}</div></section>}
