import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const app=readFileSync(new URL('../src/renderer/src/App.tsx',import.meta.url),'utf8')
const css=readFileSync(new URL('../src/renderer/src/styles.css',import.meta.url),'utf8')
const start=app.indexOf('function ConfidenceBreakdown(')
const end=app.indexOf('function MatchupAnalysis(',start)
const component=app.slice(start,end)

test('confidence card has independent wager-status controls for each team',()=>{
 assert.match(component,/TEAM_CONFIDENCE_FLAGS\.map\(choice=>/)
 assert.match(component,/setTeamFlag\(team,choice\)/)
 assert.match(component,/aria-pressed=\{flags\[team\]===choice\}/)
 assert.match(component,/flag\|\|<>/)
 assert.match(component,/onClick=\{\(\)=>setExpanded\(/)
})
test('team-status markers are stored by slate date and can be toggled off',()=>{
 assert.match(app,/nhl\.teamConfidenceFlags:'\+slateDate/)
 assert.match(component,/if\(next\[team\]===flag\)delete next\[team\]/)
 assert.match(component,/useEffect\(\(\)=>\{setFlags\(readTeamConfidenceFlags\(slateDate\)\)\},\[slateDate\]\)/)
 assert.match(app,/<ConfidenceBreakdown away=\{away\} home=\{home\} slateDate=\{slateDate\}\/>/)
})
test('confidence flag appearance is styled independently of underlying scores',()=>{
 assert.match(css,/\.confidenceFlagControls/)
 assert.match(css,/\.confidenceTeamFlag-boost/)
 assert.match(css,/\.confidenceTeamFlag-fade/)
 assert.match(css,/\.confidenceTeamFlag-bets-entered/)
})

test('pregame scoreboard displays saved team status immediately and keeps live goals numeric',()=>{
 const slot=app.slice(app.indexOf('function ConfidenceScoreSlot('),app.indexOf('type TeamConfidenceFlag='))
 assert.match(slot,/readTeamConfidenceFlags\(slateDate\)\[team\]/)
 assert.match(slot,/window\.addEventListener\('nhl:team-confidence-flag',onChange\)/)
 assert.match(slot,/if\(!pre\) return <strong>\{goals\?\?'-'\}<\/strong>/)
 assert.match(slot,/if\(flag\)return <strong className=\{/)
 assert.match(slot,/scoreboardTeamFlag/)
 assert.match(app,/window\.dispatchEvent\(new CustomEvent\('nhl:team-confidence-flag'/)
 assert.match(app,/<ConfidenceScoreSlot team=\{abbr\(g\.awayTeam\)\}[^>]*slateDate=\{date\}/)
 assert.match(app,/<ConfidenceScoreSlot team=\{abbr\(g\.homeTeam\)\}[^>]*slateDate=\{date\}/)
 assert.match(css,/\.scoreboardTeamFlag-bets-entered/)
 assert.match(css,/\.scoreboardTeamFlag-fade/)
 assert.match(css,/\.scoreboardTeamFlag-boost/)
})
