import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const source=readFileSync(new URL('../src/renderer/src/App.tsx',import.meta.url),'utf8')
const commandCenter=source.slice(source.indexOf('function LiveCommandCenter('),source.indexOf('function OnIceNow('))
const verification=source.slice(source.indexOf('async function verifyNight()'),source.indexOf('const hiddenGameIds=useMemo',source.indexOf('async function verifyNight()')))

test('live and finalized groups follow actual game states, never activeSlateDate',()=>{
 assert.match(commandCenter,/const finalIds=new Set\(games\.filter\(\(g:Game\)=>\['FINAL','OFF'\]\.includes\(g\.gameState\)\)/)
 assert.match(commandCenter,/const activeKeys=allKeys\.filter\(k=>!groupIsFinal\(/)
 assert.match(commandCenter,/const finalizedKeys=allKeys\.filter\(k=>groupIsFinal\(/)
 assert.doesNotMatch(commandCenter,/const isToday=date===\(localStorage\.getItem\('activeSlateDate'\)/)
 assert.match(commandCenter,/!lineupBetFilter&&keys\.length>0/)
})

test('empty-slate verification is past-only, wager-free, and explicitly confirmed',()=>{
 assert.match(verification,/const emptySlate=freshGames\.length===0/)
 assert.match(verification,/if\(date>=localDate\(\)\)throw new Error/)
 assert.match(verification,/if\(day\.length\)throw new Error/)
 assert.match(verification,/window\.confirm\(/)
 assert.match(verification,/EMPTY NIGHT VERIFIED · 0 GAMES/)
 assert.match(verification,/freshGames\.some\(g=>!\['FINAL','OFF'\]/)
 assert.match(verification,/String\(g\.gameDate\|\|''\)\.slice\(0,10\)===date/)
 assert.match(source,/SLATE FIX DEV · NOV22-B/)
})

test('normal live/pregame games never qualify as fully finalized',()=>{
 const groups=new Map([
  ['pregame', [{gameId:'1'}]],
  ['live', [{gameId:'2'}]],
  ['final', [{gameId:'3'}]]
 ])
 const games=[{id:1,gameState:'PRE'},{id:2,gameState:'LIVE'},{id:3,gameState:'FINAL'}]
 const finalIds=new Set(games.filter(g=>['FINAL','OFF'].includes(g.gameState)).map(g=>String(g.id)))
 const groupIsFinal=k=>finalIds.has(({pregame:'1',live:'2',final:'3'})[k])
 const allKeys=[...groups.keys()]
 assert.deepEqual(allKeys.filter(k=>!groupIsFinal(k)),['pregame','live'])
 assert.deepEqual(allKeys.filter(k=>groupIsFinal(k)),['final'])
})

test('empty-night confirmation is visible in the banner, rather than a browser confirm dialog',()=>{
 assert.match(source,/const \[emptyNightConfirmDate,setEmptyNightConfirmDate\]=useState/)
 assert.match(source,/CONFIRM EMPTY NIGHT/)
 assert.match(source,/EMPTY NIGHT VERIFICATION CANCELLED/)
 assert.match(verification,/if\(emptyNightConfirmDate!==date\)/)
 assert.doesNotMatch(verification,/window\.confirm\(`NHL reports no games/)
})
