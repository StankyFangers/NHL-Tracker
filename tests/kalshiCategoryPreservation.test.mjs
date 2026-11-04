import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/renderer/src/KalshiNHL.tsx',import.meta.url),'utf8');

test('daily Kalshi sync never reclassifies existing wager categories',()=>{
 const start=source.indexOf("const sync=()=>startKalshiJob('daily'");
 const end=source.indexOf('const importAll=()=>',start);
 assert.ok(start>=0&&end>start,'daily sync boundaries present');
 const sync=source.slice(start,end);
 assert.doesNotMatch(sync,/classifyExistingKalshiBet|repaired\s*\+\+|\.category\s*=|\.\.\.b\s*,\s*category\b/);
 assert.doesNotMatch(sync,/setBets\s*\(/,'scanning Kalshi should not mutate existing wager state');
});
test('import action appends eligible new Kalshi order IDs only',()=>{
 const start=source.indexOf('const importAll=()=>');
 assert.ok(start>=0,'import action exists');
 const action=source.slice(start,source.indexOf('return <div',start));
 assert.match(action,/const ids=new Set\(old\.map\(b=>String\(b\.id\)\)\)/);
 assert.match(action,/!ids\.has\(b\.id\)/);
 assert.match(action,/\[\.\.\.old,\.\.\.additions\]/);
});
