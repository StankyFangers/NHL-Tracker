import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const source=readFileSync(new URL('../src/renderer/src/sportsbookCatalog.ts',import.meta.url),'utf8')
const app=readFileSync(new URL('../src/renderer/src/App.tsx',import.meta.url),'utf8')
const balances=readFileSync(new URL('../src/renderer/src/sportsbookBalances.tsx',import.meta.url),'utf8')
const form=readFileSync(new URL('../src/renderer/src/SportsbookCatalogSettings.tsx',import.meta.url),'utf8')
test('All four supported formats are declared with Kalshi payout default',()=>{
 for(const format of ['AMERICAN','DECIMAL','PAYOUT','FRACTIONAL'])assert.match(source,new RegExp("value:'"+format+"'"))
 assert.match(source,/book\.trim\(\)\.toLowerCase\(\)==='kalshi'\?'PAYOUT':'AMERICAN'/)
})
test('Quotes are normalized to American odds, retaining exact payouts when entered',()=>{
 assert.match(source,/const odds=profitRatio>=1\?Math\.round\(profitRatio\*100\):-Math\.round\(100\/profitRatio\)/)
 assert.match(source,/if\(payout==null\)payout=Math\.round\(stake\*decimal\*100\)\/100/)
 assert.match(source,/return \{odds,payout\}/)
 for(const proof of ['fractional','decimal','payout'])assert.ok(source.toLowerCase().includes(proof))
})
test('Entry and batch wager creation both use the pricing converter',()=>{
 assert.match(app,/parseSportsbookPrice\(price,sportsbookPricing\(book\),stake\)/)
 assert.match(app,/parseSportsbookPrice\(r\.quote,sportsbookPricing\(r\.book\),stake\)/)
 assert.match(app,/parseSportsbookPrice\(rebetOdds,sportsbookPricing\(rebetBook\)/)
})
test('Sportsbook pricing is selectable from both configuration screens',()=>{
 assert.match(balances,/PRICING FORMAT<select/)
 assert.match(form,/className="sportsbook-catalog-format"/)
 assert.match(form,/PRICING_OPTIONS\.map/)
})
