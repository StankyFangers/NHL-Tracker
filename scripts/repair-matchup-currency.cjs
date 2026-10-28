// One-time recovery for a corrupted matchup accordion heading.
const fs=require('node:fs');
const path=require('node:path');
const file=path.join(__dirname,'../src/renderer/src/App.tsx');
const source=fs.readFileSync(file,'utf8');
const start=source.indexOf('function MatchupAccordionHeading(');
const end=source.indexOf('function LiveBetGameAccordion(',start+1);
if(start<0||end<0||source.indexOf('function MatchupAccordionHeading(',start+1)!==-1)throw new Error('Unexpected function boundaries; no changes made.');
const replacement="function MatchupAccordionHeading({groupKey,label,wagers}:{groupKey:string;label:string;wagers:Bet[]}){\n const match=label.match(/\\b([A-Z]{2,3})\\s*@\\s*([A-Z]{2,3})\\b/)\n const dollars=wagers.reduce((n,b)=>n+cashNet(b),0)\n const units=wagers.reduce((n,b)=>n+cashNetUnits(b),0)\n const pnlColor=dollars>0?'#4ade80':dollars<0?'#fb7185':'#cbd5e1'\n const money=(n:number)=>(n<0?'-$':'+$')+Math.abs(n).toFixed(2)\n const unitLabel=(n:number)=>(n>=0?'+':'')+n.toFixed(2)+'u'\n return <span className=\"matchupHeading\" style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,width:'100%',flexWrap:'wrap'}}>\n  <span style={{display:'inline-flex',alignItems:'center',gap:8,fontWeight:800}}>\n   {match?<>{scoreboardLogo[match[1]]&&<img src={scoreboardLogo[match[1]]} alt=\"\" style={{height:26,width:26,objectFit:'contain'}}/>}<span>{match[1]}</span><span style={{opacity:.7}}>@</span><span>{match[2]}</span>{scoreboardLogo[match[2]]&&<img src={scoreboardLogo[match[2]]} alt=\"\" style={{height:26,width:26,objectFit:'contain'}}/>}</>:<span>{label||groupKey}</span>}\n  </span>\n  <span style={{display:'inline-flex',alignItems:'center',gap:12}}>\n   <strong style={{color:pnlColor,whiteSpace:'nowrap'}} title=\"Running P/L including pending stakes\">{money(dollars)} ({unitLabel(units)})</strong>\n   <small style={{whiteSpace:'nowrap'}}>{wagers.length} bet{wagers.length===1?'':'s'}</small>\n  </span>\n </span>\n}\n";
const revised=source.slice(0,start)+replacement+source.slice(end);
fs.writeFileSync(file,revised);
console.log('Full matchup heading restored.');
