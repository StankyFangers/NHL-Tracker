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
 const dark=luminance(base)<.25
 const text=contrast(base,'#ffffff')>=4.5?'#ffffff':'#07131f'
 const surface=mix(base,dark?'#ffffff':'#07131f',dark?.09:.14)
 const field=mix(base,dark?'#061421':'#07131f',dark?.35:.68)
 const button=mix(base,dark?'#ffffff':'#07131f',dark?.20:.60)
 const border=mix(base,dark?'#ffffff':'#07131f',dark?.37:.48)
 const buttonText=contrast(button,'#ffffff')>=4.5?'#ffffff':'#07131f'
 const muted=contrast(base,'#ffffff')>=4.5?mix('#ffffff',base,.20):mix('#07131f',base,.15)
 return {'--smart-surface':surface,'--smart-field':field,'--smart-button':button,'--smart-border':border,'--smart-text':text,'--smart-button-text':buttonText,'--smart-muted':muted}
}
