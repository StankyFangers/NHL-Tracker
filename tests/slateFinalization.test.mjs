import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const source=readFileSync(new URL('../src/renderer/src/App.tsx',import.meta.url),'utf8')
const commandCenter=source.slice(source.indexOf('function LiveCommandCenter('),source.indexOf('function OnIceNow('))
const verification=source.slice(source.indexOf('async function verifyNight()'),source.indexOf('const hiddenGameIds=useMemo',source.indexOf('async function verifyNight()')))

test('live and finalized matchup groups follow actual NHL states, not stored date',()=>{
 assert.match(commandCenter,/const finalIds=new Set\(games\.filter\(\(g:Game\)=>\['FINAL','OFF'\]\.includes\(g\.gameState\)\)/)
 assert.match(commandCenter,/const activeKeys=allKeys\.filter\(k=>!groupIsFinal\(/)
 assert.match(commandCenter,/const finalizedKeys=allKeys\.filter\(k=>groupIsFinal\(/)
 assert.doesNotMatch(commandCenter,/const isToday=date===\(localStorage\.getItem\('activeSlateDate'\)/)
 assert.match(commandCenter,/!lineupBetFilter&&keys\.length>0/)
})

test('zero NHL games means no verification reminder, button, or verified-night entry',()=>{
 assert.match(source,/const nightReminderEligible=games\.length>0&&/)
 assert.match(verification,/if\(freshGames\.length===0\)\{setVerifyStatus\('NO NHL GAMES ON THIS DATE · NOTHING TO VERIFY'\);return\}/)
 assert.doesNotMatch(verification,/EMPTY NIGHT VERIFIED/)
 assert.doesNotMatch(source,/CONFIRM EMPTY NIGHT/)
 assert.match(commandCenter,/disabled=\{games\.length===0\|\|verifyStatus/)
 assert.match(commandCenter,/games\.length===0\?'NO GAMES'/)
})

test('verification checks only NHL games belonging to the selected gameDate',()=>{
 assert.match(verification,/String\(g\.gameDate\|\|''\)\.slice\(0,10\)===date/)
 assert.match(verification,/freshGames\.some\(g=>!\['FINAL','OFF'\]/)
})

test('startup does not reopen stale game-free activeSlateDate without wagers',()=>{
 assert.match(source,/if\(held&&!verifiedDates\.has\(held\)&&storedBets\.some\(b=>b\.date===held\)\)return held/)
})

test('pregame and live groups remain pending even alongside final games',()=>{
 const games=[{id:1,gameState:'PRE'},{id:2,gameState:'LIVE'},{id:3,gameState:'FINAL'}]
 const finalIds=new Set(games.filter(g=>['FINAL','OFF'].includes(g.gameState)).map(g=>String(g.id)))
 const allKeys=['1','2','3']
 assert.deepEqual(allKeys.filter(k=>!finalIds.has(k)),['1','2'])
 assert.deepEqual(allKeys.filter(k=>finalIds.has(k)),['3'])
})
