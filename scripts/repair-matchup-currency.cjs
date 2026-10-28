// One-time targeted repair for the corrupted matchup currency formatter.
const fs=require('node:fs');
const path=require('node:path');
const file=path.join(__dirname,'../src/renderer/src/App.tsx');
const src=fs.readFileSync(file,'utf8');
const start=src.indexOf('function MatchupAccordionHeading(');
const finish=src.indexOf('function LiveBetGameAccordion(',start);
if(start<0||finish<start)throw new Error('Matchup function not found; nothing changed.');
const old=src.slice(start,finish);
const pattern=/^[ \t]*const money=\(n:number\)=>[\s\S]*?(?=^[ \t]*return <span className="matchupHeading")/m;
const matches=old.match(new RegExp(pattern.source,'gm'));
if(!matches||matches.length!==1)throw new Error('Expected one malformed formatting block; nothing changed.');
const replacement=" const money=(n:number)=>`${n<0?'-$':'+$'}${Math.abs(n).toFixed(2)}`\n const unitLabel=(n:number)=>`${n>=0?'+':''}${n.toFixed(2)}u`\n";
const fixed=old.replace(pattern,()=>replacement);
if(!fixed.includes('const unitLabel=')||!fixed.includes('const money=(n:number)'))throw new Error('Validation failed');
fs.writeFileSync(file,src.slice(0,start)+fixed+src.slice(finish));
console.log('Matchup currency formatter repaired.');
