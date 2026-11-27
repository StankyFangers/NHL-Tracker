import {useMemo} from 'react'
import type {Bet} from './App'

const labels=['Combos','Goals','Assists','Other'] as const
const format=new Intl.NumberFormat(undefined,{maximumFractionDigits:2})

export function DailyUnitsSummary({bets,date}:{bets:Bet[];date:string}){
 const units=useMemo(()=>{
  const sums={Total:0,Combos:0,Goals:0,Assists:0,Other:0}
  for(const bet of bets){
   if(bet.date!==date || bet.status==='VOID' || !Number.isFinite(bet.units))continue
   const category=(bet.category||'COMBOS').trim().toUpperCase()
   const bucket=category==='COMBOS'?'Combos':category==='GOALS'?'Goals':category==='ASSISTS'?'Assists':'Other'
   sums[bucket]+=bet.units
   sums.Total+=bet.units
  }
  return sums
 },[bets,date])
 return <div className="dailyUnitsSummary" aria-label={'Units wagered on '+date} title={'Entire slate · '+date}>
  <strong>Total Units Bet: {format.format(units.Total)}u</strong>
  {labels.filter(label=>units[label]>0).map(label=><span key={label}>{label}: {format.format(units[label])}u</span>)}
 </div>
}
