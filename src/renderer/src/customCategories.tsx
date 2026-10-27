import {useEffect,useState} from 'react'
import './customCategories.css'
export type SportCategory='NHL'|'NFL'|'MLB'|'NBA'|'UFC'
export const DEFAULT_CATEGORIES:Record<SportCategory,string[]>={NHL:['COMBOS','ASSISTS','OTHER'],NFL:['PLAYER PROPS','GAME BETS','PARLAYS','OTHER'],MLB:['PLAYER PROPS','GAME BETS','OTHER'],NBA:['PLAYER PROPS','GAME BETS','OTHER'],UFC:['FIGHT PROPS','MONEYLINE','OTHER']}
const PREFIX='multiSport:categories:v1:'
export function getCategories(sport:SportCategory):string[]{
 try{const raw=JSON.parse(localStorage.getItem(PREFIX+sport)||'null');if(Array.isArray(raw)){const result=raw.filter((x:unknown):x is string=>typeof x==='string'&&x.trim().length>0).map(x=>x.trim().toUpperCase());if(result.length)return [...new Set(result)]}}
 catch{}
 return [...DEFAULT_CATEGORIES[sport]]
}
export function setCategories(sport:SportCategory,items:string[]){localStorage.setItem(PREFIX+sport,JSON.stringify(items));window.dispatchEvent(new CustomEvent('multiSport-categories-changed',{detail:{sport}}))}
export function useCategories(sport:SportCategory){
 const [items,setItems]=useState<string[]>(()=>getCategories(sport))
 useEffect(()=>{const onChange=()=>setItems(getCategories(sport));window.addEventListener('multiSport-categories-changed',onChange);window.addEventListener('storage',onChange);return()=>{window.removeEventListener('multiSport-categories-changed',onChange);window.removeEventListener('storage',onChange)}},[sport])
 return items
}
export function CategorySettings(){
 const [sport,setSport]=useState<SportCategory>('NHL')
 const categories=useCategories(sport)
 const [draft,setDraft]=useState('')
 const [feedback,setFeedback]=useState('')
 const [applyAll,setApplyAll]=useState(false)
 const sports=Object.keys(DEFAULT_CATEGORIES) as SportCategory[]
 const add=()=>{const name=draft.trim().toUpperCase();if(!name||name.length>32||!/^[- &A-Z0-9/]+$/.test(name)){setFeedback('Use 1–32 letters, numbers, spaces, /, - or &.');return}
 const targets=applyAll?sports:[sport];let added=0
 for(const target of targets){const existing=getCategories(target);if(existing.includes(name))continue;setCategories(target,[...existing,name]);added++}
 setDraft('');setFeedback(added?name+' added to '+(applyAll?added+' sports':sport):'Category already exists in the selected scope.')}
 return <section className="category-settings"><h2>Custom Bet Categories</h2><p>Customize the category dropdown for each sport. Existing wagers retain their saved category.</p>
 <label>Sport <select value={sport} onChange={e=>{setSport(e.target.value as SportCategory);setFeedback('')}}>{sports.map(s=><option key={s}>{s}</option>)}</select></label>
 <label className="category-apply-all"><input type="checkbox" checked={applyAll} onChange={e=>setApplyAll(e.target.checked)}/> Apply to All Sports <small>Adding or removing a category affects every sport when enabled.</small></label>
 <div className="category-list">{categories.map(c=><div key={c}><strong>{c}</strong><button type="button" disabled={categories.length===1} onClick={()=>{if(applyAll&&!window.confirm('Remove '+c+' from category choices in all sports? Existing bets are unchanged.'))return;for(const target of (applyAll?sports:[sport])){const current=getCategories(target);if(current.includes(c)&&current.length>1)setCategories(target,current.filter(x=>x!==c))}setFeedback(c+' removed from future choices where possible')}}>Remove</button></div>)}</div>
 <div className="category-add"><input placeholder="New category" value={draft} maxLength={32} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();add()}}}/><button onClick={add}>+ Add Category</button></div>
 <button className="category-reset" onClick={()=>{setCategories(sport,[...DEFAULT_CATEGORIES[sport]]);setFeedback('Defaults restored for '+sport)}}>Restore {sport} Defaults</button>
 {feedback&&<small role="status">{feedback}</small>}
 </section>
}
