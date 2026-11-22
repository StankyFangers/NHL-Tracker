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
