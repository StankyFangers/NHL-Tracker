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

test('Live pricing algorithm computes the same cash payout across formats',()=>{
 const raw=source.slice(source.indexOf('export function parseSportsbookPrice('),source.indexOf('\nexport function priceInputForExisting('))
 const js=raw.replace('export function parseSportsbookPrice(raw:string,format:SportsbookPricingFormat,stake:number):{odds:number;payout?:number}{','function parseSportsbookPrice(raw,format,stake){').replace('let decimal:number','let decimal').replace('let payout:number|undefined','let payout')
 const convert=new Function(js+';return parseSportsbookPrice')()
 assert.deepEqual(convert('-150','AMERICAN',10),{odds:-150,payout:16.67})
 assert.deepEqual(convert('1.6666666667','DECIMAL',10),{odds:-150,payout:16.67})
 assert.deepEqual(convert('2/3','FRACTIONAL',10),{odds:-150,payout:16.67})
 assert.deepEqual(convert('16.67','PAYOUT',10),{odds:-150,payout:16.67})
 assert.deepEqual(convert('+250','AMERICAN',10),{odds:250,payout:35})
 assert.deepEqual(convert('3.50','DECIMAL',10),{odds:250,payout:35})
 assert.deepEqual(convert('5/2','FRACTIONAL',10),{odds:250,payout:35})
 assert.throws(()=>convert('1.0','DECIMAL',10))
 assert.throws(()=>convert('1/0','FRACTIONAL',10))
 assert.throws(()=>convert('9.99','PAYOUT',10))
})
