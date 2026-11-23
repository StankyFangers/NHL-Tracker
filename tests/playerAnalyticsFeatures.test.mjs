import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const app=readFileSync(new URL('../src/renderer/src/App.tsx',import.meta.url),'utf8')
const analytics=readFileSync(new URL('../src/renderer/src/PlayerWagerAnalytics.tsx',import.meta.url),'utf8')
const evidence=readFileSync(new URL('../src/renderer/src/wagerLegEvidence.ts',import.meta.url),'utf8')

test('player search appears next to team analytics and receives actual wager records',()=>{
 assert.match(app,/\{id:'TEAMS',label:'TEAM ANALYTICS'\},\{id:'PLAYERS',label:'PLAYER SEARCH'\}/)
 assert.match(app,/analyticsSection==='PLAYERS'&&<PlayerWagerAnalytics bets=\{bets\}\/>/)
})
test('player analysis covers historical bets, official hit rates, and partner performance',()=>{
 for(const token of ['officialWagerBoxscore','officialLegEvidence','TOP COMBO PARTNERS','STAT MARKET PERFORMANCE','BY SPORTSBOOK','BY CATEGORY','MONTHLY TREND','COMPLETE PLAYER WAGER HISTORY','ASSOCIATED WAGER P/L']){
  assert.ok(analytics.includes(token),token)
 }
 assert.match(analytics,/playerId\)===Number\(player.playerId\)/)
 assert.match(analytics,/not an independently attributable player profit/)
 assert.match(analytics,/result==='UNVERIFIED'/)
})
test('finalized losing slips do not force all successful legs red',()=>{
 assert.match(app,/function useOfficialSettledLegStats\(/)
 assert.match(app,/const verified=officialLegEvidence\(leg,official\[String\(leg.gameId\|\|''\)\]\)/)
 assert.match(app,/verified.result==='HIT'\?'hit'/)
 assert.doesNotMatch(app,/status==='WON'\?'hit':status==='LOST'\?'miss':leg.side/)
 assert.match(app,/official=\{official\}/)
})
test('official leg outcomes require matching identity, avoid guesses, and only grade under after final',()=>{
 assert.match(evidence,/if\(!player&&!leg.playerId\)/)
 assert.match(evidence,/if\(found.length===1\)player=found\[0\]/)
 assert.match(evidence,/if\(leg.side==='UNDER'&&!box.isFinal\)/)
 assert.match(evidence,/cache=new Map<number,Promise<OfficialGameRecords>>/)
 assert.match(evidence,/active<4/)
})
test('date-range export is inclusive and settled only, with recorded net P\/L',()=>{
 assert.match(app,/function exportSettledRange\(\)/)
 assert.match(app,/b.date>=settledStart&&b.date<=settledEnd/)
 assert.match(app,/\['WON','LOST','VOID'\]\.includes/)
 assert.match(app,/cashNetUnits\(b\)/)
 assert.match(app,/NHL-Tracker-Settled-\$\{settledStart\}-to-\$\{settledEnd\}/)
 assert.match(app,/EXPORT SETTLED DATE RANGE \(XLSX\)/)
})
