export type SmartMode={games:boolean;events:boolean;bets:boolean;slip:boolean;research:boolean}
export const SMART_DEFAULTS:SmartMode={games:true,events:true,bets:true,slip:true,research:true}
export const SMART_KEY='nhlTracker:smartThemes:v1'
export function loadSmart():SmartMode{try{const o=JSON.parse(localStorage.getItem(SMART_KEY)||'{}');return{games:o.games!==false,events:o.events!==false,bets:o.bets!==false,slip:o.slip!==false,research:o.research!==false}}catch{return{...SMART_DEFAULTS}}}
const rgb=(v:string)=>[1,3,5].map(i=>parseInt(v.slice(i,i+2),16))
const hex=(v:number[])=>'#'+v.map(n=>Math.max(0,Math.min(255,Math.round(n))).toString(16).padStart(2,'0')).join('')
const mix=(a:string,b:string,r:number)=>{const x=rgb(a),y=rgb(b);return hex(x.map((n,i)=>n*(1-r)+y[i]*r))}
const luminance=(color:string)=>{const c=rgb(color).map(n=>{const v=n/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return c[0]*.2126+c[1]*.7152+c[2]*.0722}
const contrast=(a:string,b:string)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
export function smartPalette(background:string):Record<string,string>{
 const base=/^#[0-9a-f]{6}$/i.test(background)?background:'#0b1b29'
 // Layered, dark surfaces keep cards readable even when the selected backdrop is light.
 const dark=luminance(base)<.22
 const surface=mix(base,'#071521',dark?.70:.85)
 const field=mix(base,'#061521',dark?.78:.91)
 const button=mix(base,'#16394b',dark?.65:.80)
 const border=mix(base,'#d9ebf5',dark?.40:.48)
 const text='#f3f9ff'
 const muted='#b9d2df'
 return {'--smart-surface':surface,'--smart-field':field,'--smart-button':button,'--smart-border':border,'--smart-text':text,'--smart-button-text':'#f3f9ff','--smart-muted':muted}
}
