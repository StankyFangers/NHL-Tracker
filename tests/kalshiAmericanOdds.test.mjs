import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const importer=readFileSync(new URL('../src/renderer/src/kalshiImport.ts',import.meta.url),'utf8')
const app=readFileSync(new URL('../src/renderer/src/App.tsx',import.meta.url),'utf8')
const expression=importer.match(/const netRatio=\(count\/risk\)-1\s+const odds=netRatio>=1\?Math\.round\(netRatio\*100\):-Math\.round\(100\/netRatio\)/)?.[0]
assert.ok(expression,'Kalshi importer must convert payout ratio to actual American odds')
const convert=new Function('count','risk',expression+';return odds')

test('Kalshi under-even-money net profit is represented as negative American odds',()=>{
 assert.equal(convert(100,62.89),-169)
 assert.equal(convert(100,60),-150)
 assert.equal(convert(100,50),100)
 assert.equal(convert(100,25),300)
})
test('Previously imported Kalshi prices are normalized without modifying cloud wager records',()=>{
 assert.match(app,/function normalizedAmericanOdds\(/)
 assert.match(app,/odds>0&&odds<100\?-Math\.round\(10000\/odds\):odds/)
 assert.match(app,/displayAmericanOdds\(odds,b\.book\)/)
})
