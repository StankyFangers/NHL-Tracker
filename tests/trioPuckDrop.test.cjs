const fs=require('fs'),path=require('path'),assert=require('assert'),os=require('os');
const project=process.cwd(),esbuild=require(path.join(project,'node_modules/esbuild'));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'trio-lock-tests-'));

function load(name){const out=path.join(tmp,name+'.cjs');esbuild.buildSync({entryPoints:[path.join(project,'src/renderer/src',name+'.ts')],bundle:true,platform:'node',format:'cjs',outfile:out});return require(out)}
const store=new Map();global.localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),key:i=>[...store.keys()][i],get length(){return store.size}};global.window={dispatchEvent:()=>{},addEventListener:()=>{},removeEventListener:()=>{}};
const {recordTrioGameLocks,readTrioGameLocks}=load('trioGameLocks'),{officialGameDate}=load('nhlGameDate'),{recordDailyCombos}=load('automaticCombos'),{partitionTrioFamilies,saveTrioExclusions,readTrioExclusions}=load('trioExclusions'),{discoverFamilies,evaluateFamily,optimizeTrios}=load('trioComparison');
const date='2026-10-23',players=['Player A','Player B','Player C'],abbr=t=>t.abbrev;
const game={id:123,gameDate:date,startTimeUTC:'2026-10-23T23:00:00Z',gameState:'PRE',awayTeam:{abbrev:'BUF'},homeTeam:{abbrev:'MTL'}};
const lineup=(ps,confirmed=false)=>({date,team:'BUF',observedAt:'2026-10-23T22:30:00Z',confirmed,forwardLines:[ps],pp1:ps,pp2:[],defensePairs:[['Def A','Def B']]});
function observe(ps,confirmed=false){const latest=lineup(ps,confirmed);store.set('nhlTracker:dfoSnapshots:v1:'+date+':BUF',JSON.stringify({latest,...(confirmed?{confirmed:latest}:{})}))}
observe(players);recordTrioGameLocks(date,[game],{},abbr);assert.equal(readTrioGameLocks()[0].state,'PROVISIONAL');assert.equal(readTrioGameLocks()[0].status,'PROJECTED');
// A broken provisional trio disappears before puck drop, even when there are zero replacement trios.
observe(players.slice(0,2));recordTrioGameLocks(date,[game],{},abbr);assert.equal(readTrioGameLocks()[0].players.length,0);
observe(['Player D','Player E','Player F'],true);recordTrioGameLocks(date,[game],{},abbr);assert.equal(readTrioGameLocks()[0].status,'CONFIRMED');assert.equal(readTrioGameLocks()[0].players[0][0],'Player D');
recordTrioGameLocks(date,[{...game,gameState:'LIVE'}],{},abbr);const locked=JSON.stringify(readTrioGameLocks()[0]);assert.equal(readTrioGameLocks()[0].state,'LOCKED');
observe(players,true);recordTrioGameLocks(date,[{...game,gameState:'LIVE'}],{},abbr);assert.equal(JSON.stringify(readTrioGameLocks()[0]),locked);
recordTrioGameLocks(date,[{...game,gameState:'PRE'}],{},abbr);assert.equal(JSON.stringify(readTrioGameLocks()[0]),locked);
// A fresh process reads the same immutable lock. No module-memory-only state.
assert.equal(JSON.stringify(load('trioGameLocks').readTrioGameLocks()[0]),locked);
store.clear();observe(players);recordTrioGameLocks(date,[game],{},abbr);recordTrioGameLocks(date,[{...game,gameState:'CRIT'}],{},abbr);assert.equal(readTrioGameLocks()[0].status,'PROJECTED');assert.equal(readTrioGameLocks()[0].state,'LOCKED');
// Wrong selected date cannot create a lock or daily snapshot.
store.clear();observe(players);assert.equal(recordTrioGameLocks('2026-10-22',[game],{},abbr),false);assert.equal(readTrioGameLocks().length,0);assert.equal(recordDailyCombos('2026-10-22',[game],{},abbr,()=>false),false);
assert.equal(officialGameDate({startTimeUTC:'2026-10-24T02:00:00Z'}),'2026-10-23');
// Opening after puck drop cannot use freshly fetched post-start DFO data.
store.clear();const late=lineup(players,true);late.observedAt='2026-10-24T00:00:00Z';store.set('nhlTracker:dfoSnapshots:v1:'+date+':BUF',JSON.stringify({latest:late,confirmed:late}));recordTrioGameLocks(date,[{...game,gameState:'FINAL'}],{},abbr);assert.equal(readTrioGameLocks().length,0);
// Existing, genuinely pregame observations can be recovered when opening during intermission.
observe(players,true);recordTrioGameLocks(date,[{...game,gameState:'LIVE'}],{},abbr);assert.equal(readTrioGameLocks()[0].state,'LOCKED');assert.equal(readTrioGameLocks()[0].status,'CONFIRMED');
// Locks with zero trios stay empty after subsequent changes.
store.clear();observe(players.slice(0,2));recordTrioGameLocks(date,[game],{},abbr);recordTrioGameLocks(date,[{...game,gameState:'LIVE'}],{},abbr);observe(players,true);recordTrioGameLocks(date,[{...game,gameState:'FINAL'}],{},abbr);assert.equal(readTrioGameLocks()[0].players.length,0);
// Reference odds entered after the game attach to the locked identity; removed families never enter sums or optimizer input.
const snapshots=[];for(let n=21;n<=24;n++){const d='2026-10-'+n;for(const ps of [players,players.slice(0,2),[players[0],players[2]],players.slice(1)])snapshots.push({date:d,gameId:String(n),team:'BUF',players:ps,result:'HIT',odds:200,book:'Test'})}
const families=discoverFamilies([],snapshots),refs=families.map(f=>({key:f.key,familyKey:f.key,players:f.players,odds:400,book:'Test',note:'After game',enteredAt:'2026-10-25T12:00:00Z'}));const before=families.map(f=>evaluateFamily(f,[],snapshots,refs));assert.equal(before.reduce((n,r)=>n+r.trio,0),16);assert(optimizeTrios(before));
saveTrioExclusions(families.slice(1).map(f=>f.key));const remaining=partitionTrioFamilies(families,readTrioExclusions());assert.equal(remaining.included.length,1);const after=remaining.included.map(f=>evaluateFamily(f,[],snapshots,refs));assert.equal(after.reduce((n,r)=>n+r.trio,0),4);assert.equal(optimizeTrios(after),undefined);saveTrioExclusions([]);assert.equal(partitionTrioFamilies(families,readTrioExclusions()).included.length,4);
fs.rmSync(tmp,{recursive:true});console.log('PASS: pregame changes, zero trios, confirmed/projected locks, immutable restart recovery, date/UTC guards, late-data rejection, recovery, late quotes, exclusion totals/optimizer/restore.');
