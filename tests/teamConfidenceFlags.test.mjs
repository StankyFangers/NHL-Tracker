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
