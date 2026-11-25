import {RESEARCH_PROFILES, RULE_NAMES, RULES, type ResearchClass, type ResearchProfile} from './comboResearchModel'

export const PROFILE_CHANGED = 'nhlTracker:research:profileChanged'
const payoutCurrency = new Intl.NumberFormat('en-US', {style:'currency', currency:'USD'})
const kalshiPayoutRange=(category:ResearchClass,cost:number,stake:number)=>{
 if(!stake)return '—'
 const payout = (odds: number) => payoutCurrency.format(cost * (100 + odds) / 100)
 if(category==='PP1_DUO_101_150')return payout(101)+'–'+payout(150)
 if(category==='PP1_DUO_151_200')return payout(151)+'–'+payout(200)
 if(category==='PP1_DUO_HIGH'||category==='PP1_TRIO_HIGH')return payout(201)+'+'
 if(category==='PP1_TRIO_101_200')return payout(101)+'–'+payout(200)
 if(category==='PP2_DUO_LOW')return 'Up to '+payout(300)
 if(category==='PP2_DUO_FL2_HIGH'||category==='PP2_DUO_OTHER_HIGH')return payout(301)+'+'
 return '—'
}
export function savedResearchProfile(accountKey:string):ResearchProfile {
 const value=localStorage.getItem('nhlTracker:research:profile:'+accountKey)
 return RESEARCH_PROFILES.find(profile=>profile===value)??'450'
}

export function StrategyReference({profile,unitSize}:{profile:ResearchProfile;unitSize:number}) {
 return <div className="researchCard"><h2>{profile}u · Betting reference</h2><p>Unit size: <strong>${unitSize.toFixed(2)}</strong>. Kalshi Payout includes the position cost plus profit on a winning wager, before fees.</p><div className="researchTable"><table><thead><tr><th>Combo</th><th>American odds</th><th>Units</th><th>Position cost</th><th>Kalshi Payout</th></tr></thead><tbody>{RULE_NAMES.map(x=>{const units=RULES[x.key][profile],cost=units*unitSize;return <tr key={x.key}><td>{x.title}</td><td>{x.odds}</td><td>{units?units.toFixed(2)+'u':'SKIP'}</td><td>{units?'$'+cost.toFixed(2):'—'}</td><td>{kalshiPayoutRange(x.key,cost,units)}</td></tr>})}</tbody></table></div><p className="researchFootnote">All seven profiles (300u–600u) use fixed version 1 historical-fit rules, not future profit guarantees.</p></div>
}
