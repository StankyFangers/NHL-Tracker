import * as XLSX from 'xlsx'
import type {ResearchCombo} from './comboResearchModel'

// Private, client-side price overlay. Full wager rows and sportsbook balances never leave the desktop.
const keyName=(s:string)=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z]/gi,'').toLowerCase()
const comboKey=(date:string,players:string[])=>date+'|'+players.map(keyName).sort().join('|')
export async function overlaySettledWagerOdds(file:File,rows:ResearchCombo[]){
 const data=await file.arrayBuffer()
 const workbook=XLSX.read(data,{type:'array',cellDates:false})
 const sheet=workbook.Sheets['Settled Wagers']
 if(!sheet)throw Error('Expected an XLSX sheet named "Settled Wagers".')
 const bets=XLSX.utils.sheet_to_json<Record<string,unknown>>(sheet,{defval:null})
 const eligible=new Map<string,ResearchCombo[]>()
 for(const row of rows){const key=comboKey(row.date,row.players),list=eligible.get(key)||[];list.push(row);eligible.set(key,list)}
 const prices=new Map<string,Set<number>>()
 let rowsInspected=0,invalid=0,ambiguous=0
 for(const bet of bets){
  if(String(bet['Category']).toUpperCase()!=='COMBOS'||!['WON','LOST'].includes(String(bet['Status']).toUpperCase()))continue
  rowsInspected++
  const date=String(bet['Date']||'')
  const players=Array.from({length:6},(_,i)=>bet['Player '+(i+1)]).filter((v):v is string=>typeof v==='string'&&v.trim().length>0)
  if(players.length<2||players.length>3){invalid++;continue}
  // Research combos are all 1+ POINT per member; do not attach odds from unrelated markets.
  const onePoint=players.every((_,i)=>String(bet['Market '+(i+1)]||'').toLowerCase()==='point'&&Number(bet['Target '+(i+1)])===1)
  if(!onePoint){invalid++;continue}
  const matched=eligible.get(comboKey(date,players))||[]
  const odds=Number(bet['American Odds'])
  if(matched.length!==1||!Number.isFinite(odds)||Math.abs(odds)<100){invalid++;continue}
  const expected=String(bet['Status']).toUpperCase()==='WON'?'HIT':'MISS'
  if(matched[0].result!=='UNVERIFIED'&&matched[0].result!==expected){invalid++;continue}
  const id=matched[0].id,list=prices.get(id)||new Set<number>()
  list.add(odds);prices.set(id,list)
 }
 let matchedCount=0
 const updated=rows.map(row=>{
  const list=prices.get(row.id)
  if(!list)return row
  if(list.size!==1){ambiguous++;return row}
  matchedCount++
  return {...row,odds:[...list][0],source:row.source?row.source+' + LOCAL wager price':'LOCAL wager price'}
 })
 return {rows:updated,matchedCount,invalid,ambiguous,rowsInspected}
}
