// One-time targeted repair for the corrupted matchup currency formatter.
const fs=require('node:fs');
const path=require('node:path');
const file=path.join(__dirname,'../src/renderer/src/App.tsx');
const src=fs.readFileSync(file,'utf8');
const start=src.indexOf('function MatchupAccordionHeading(');
const finish=src.indexOf('function LiveBetGameAccordion(',start);
if(start<0||finish<start)throw new Error('Matchup function not found; nothing changed.');
const old=src.slice(start,finish);
const moneyAt=old.indexOf('const money=(n:number)=>');
const returnAt=old.indexOf('return <span className="matchupHeading"',moneyAt);
if(moneyAt<0||returnAt<0||returnAt<=moneyAt)throw new Error('Formatter anchors missing; nothing changed.');
const replacement=["const money=(n:number)=>`${n<0?'-$':'+$'}${Math.abs(n).toFixed(2)}`"," const unitLabel=(n:number)=>`${n>=0?'+':''}${n.toFixed(2)}u`"," "].join(String.fromCharCode(10));
const fixed=old.slice(0,moneyAt)+replacement+old.slice(returnAt);
if(!fixed.includes('const unitLabel=')||!fixed.includes('const money=(n:number)'))throw new Error('Validation failed');
fs.writeFileSync(file,src.slice(0,start)+fixed+src.slice(finish));
console.log('Matchup currency formatter repaired.');
