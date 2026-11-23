import {useEffect,useMemo,useState} from 'react'
import {officialLegEvidence,officialWagerBoxscore,type OfficialGameRecords,type WagerStatLeg} from './wagerLegEvidence'
import './playerWagerAnalytics.css'

type SearchBet={
 id:string;date:string;legs:WagerStatLeg[];book:string;units:number;unitSize:number;
 status?:string;odds?:number;payout?:number;bonusBet?:boolean;category?:string
}
type PlayerChoice={key:string;player:string;playerId?:number;team?:string;count:number}
const normalize=(s:string)=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'')
const legIdentity=(l:WagerStatLeg)=>l.playerId?'id:'+l.playerId:'name:'+normalize(l.player)+'|'+String(l.team||'')
const money=(v:number)=>`${v>=0?'+':'-'}$${Math.abs(v).toFixed(2)}`
const unit=(v:number)=>`${v>=0?'+':''}${v.toFixed(2)}u`
const settled=(b:SearchBet)=>['WON','LOST','VOID'].includes(String(b.status||'PENDING'))
const stake=(b:SearchBet)=>Number(b.units||0)*Number(b.unitSize||0)
const net=(b:SearchBet)=>{
 const risk=b.bonusBet?0:stake(b)
 if(b.status==='VOID')return 0
 if(b.status!=='WON')return -risk
 const full=Number.isFinite(b.payout)?Number(b.payout):b.odds!=null?stake(b)*(1+(b.odds>0?b.odds/100:100/Math.abs(b.odds))):stake(b)
 return full-risk
}
const matches=(leg:WagerStatLeg,player:PlayerChoice)=>{
 if(leg.kind==='TEAM')return false
 if(leg.playerId&&player.playerId)return Number(leg.playerId)===Number(player.playerId)
 if(leg.playerId||player.playerId)return false // Don't merge a missing/ambiguous historical ID.
 return legIdentity(leg)===player.key
}
function summarize(bets:SearchBet[]){
 const settledBets=bets.filter(settled)
 const cash=settledBets.reduce((n,b)=>n+net(b),0)
 return {cash, units:settledBets.reduce((n,b)=>n+(b.unitSize>0?net(b)/b.unitSize:0),0),
  wagerCount:bets.length,settled: settledBets.length,
  wins:settledBets.filter(b=>b.status==='WON').length,
  losses:settledBets.filter(b=>b.status==='LOST').length,
  voids:settledBets.filter(b=>b.status==='VOID').length,
  risk:settledBets.reduce((n,b)=>n+stake(b),0)}
}
export default function PlayerWagerAnalytics({bets}:{bets:SearchBet[]}){
 const [query,setQuery]=useState('')
 const [chosen,setChosen]=useState<string|null>(null)
 const [from,setFrom]=useState('')
 const [to,setTo]=useState('')
 const [boxes,setBoxes]=useState<Record<string,OfficialGameRecords>>({})
 const [loading,setLoading]=useState(false)
 const [failed,setFailed]=useState<number[]>([])
 const [progress,setProgress]=useState({done:0,total:0})
 const choices=useMemo(()=>{
  const byKey=new Map<string,PlayerChoice>()
  for(const bet of bets)for(const leg of bet.legs){
   if(leg.kind==='TEAM'||!leg.player.trim())continue
   const key=legIdentity(leg),old=byKey.get(key)
   if(old){old.count++;continue}
   byKey.set(key,{key,player:leg.player,playerId:leg.playerId,team:leg.team,count:1})
  }
  return [...byKey.values()].sort((a,b)=>b.count-a.count||a.player.localeCompare(b.player))
 },[bets])
 const player=choices.find(p=>p.key===chosen)
 const options=choices.filter(p=>normalize(p.player).includes(normalize(query))||(p.playerId&&String(p.playerId).includes(query))).slice(0,25)
 const matchesAll=useMemo(()=>player?bets.filter(b=>b.legs.some(l=>matches(l,player))):[],[bets,player])
 const history=useMemo(()=>matchesAll.filter(b=>(!from||b.date>=from)&&(!to||b.date<=to)).sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id)),[matchesAll,from,to])
 const gameIds=useMemo(()=>[...new Set(history.filter(settled).flatMap(b=>b.legs.filter(l=>player&&matches(l,player)&&l.gameId).map(l=>Number(l.gameId)).filter(n=>Number.isInteger(n)&&n>0)))],[history,player])
 const gamesKey=gameIds.slice().sort((a,b)=>a-b).join(',')
 useEffect(()=>{
  let alive=true
  setBoxes({});setFailed([]);setProgress({done:0,total:gameIds.length})
  if(!gameIds.length){setLoading(false);return()=>{alive=false}}
  setLoading(true)
  void Promise.allSettled(gameIds.map(async id=>{
   try{
    const data=await officialWagerBoxscore(id)
    if(alive)setBoxes(old=>({...old,[id]:data}))
   }catch{
    if(alive)setFailed(old=>[...old,id])
   }finally{if(alive)setProgress(old=>({...old,done:old.done+1}))}
  })).then(()=>{if(alive)setLoading(false)})
  return()=>{alive=false}
 },[chosen,gamesKey])
 const counts=summarize(history)
 const appearances=history.flatMap(b=>b.legs.filter(l=>player&&matches(l,player)).map(l=>({b,l,e:officialLegEvidence(l,boxes[String(l.gameId||'')])})))
 const evaluated=appearances.filter(x=>settled(x.b)&&!x.l.voided)
 const hit=evaluated.filter(x=>x.e.result==='HIT').length
 const miss=evaluated.filter(x=>x.e.result==='MISS').length
 const unverified=evaluated.filter(x=>x.e.result==='UNVERIFIED').length
 const markets=new Map<string,{name:string;wagers:number;hit:number;miss:number;unverified:number}>()
 for(const x of evaluated){
  const name=`${x.l.side==='UNDER'?'UNDER':'OVER'} ${x.l.stat}`
  const v=markets.get(name)||{name,wagers:0,hit:0,miss:0,unverified:0}
  v.wagers++;if(x.e.result==='HIT')v.hit++;else if(x.e.result==='MISS')v.miss++;else v.unverified++
  markets.set(name,v)
 }
 const partners=new Map<string,{name:string;count:number;wins:number;losses:number;cash:number}>()
 for(const b of history){
  const seen=new Set<string>()
  for(const l of b.legs.filter(l=>l.kind!=='TEAM'&&!l.voided&&player&&!matches(l,player))){
   const key=legIdentity(l);if(seen.has(key))continue;seen.add(key)
   const v=partners.get(key)||{name:l.player,count:0,wins:0,losses:0,cash:0}
   v.count++;if(b.status==='WON')v.wins++;if(b.status==='LOST')v.losses++
   if(settled(b))v.cash+=net(b)
   partners.set(key,v)
  }
 }
 const books=new Map<string,{book:string,count:number,wins:number,cash:number}>()
 const categories=new Map<string,{category:string,count:number,wins:number,cash:number}>()
 for(const b of history){
  const book=b.book||'Unspecified',category=b.category||'COMBOS'
  const v=books.get(book)||{book,count:0,wins:0,cash:0};v.count++;if(b.status==='WON')v.wins++;if(settled(b))v.cash+=net(b);books.set(book,v)
  const c=categories.get(category)||{category,count:0,wins:0,cash:0};c.count++;if(b.status==='WON')c.wins++;if(settled(b))c.cash+=net(b);categories.set(category,c)
 }
 const byMonth=new Map<string,SearchBet[]>()
 for(const b of history){const month=b.date.slice(0,7);byMonth.set(month,[...(byMonth.get(month)||[]),b])}
 return <section className="playerSearchAnalytics">
  <header className="playerSearchHead"><div><small>DEEP BET ANALYTICS</small><h2>PLAYER SEARCH</h2><p>Find every recorded wager involving a player, review settled returns and verify historical leg outcomes against NHL boxscores.</p></div><strong>{choices.length} player identities</strong></header>
  <div className="playerSearchToolbar">
   <label>SEARCH NHL PLAYER<input value={query} onChange={e=>{setQuery(e.target.value);setChosen(null)}} placeholder="Player name or NHL ID..." autoComplete="off"/></label>
   <label>FROM<input type="date" value={from} max={to||undefined} onChange={e=>setFrom(e.target.value)}/></label>
   <label>THROUGH<input type="date" value={to} min={from||undefined} onChange={e=>setTo(e.target.value)}/></label>
   <button type="button" onClick={()=>{setFrom('');setTo('')}}>ALL DATES</button>
  </div>
  {query.trim()&&!chosen&&<div className="playerSearchResults">{options.length?options.map(choice=><button type="button" key={choice.key} onClick={()=>{setChosen(choice.key);setQuery(choice.player)}}><b>{choice.player}</b><small>{choice.team||'Team unknown'} · {choice.playerId?'NHL ID '+choice.playerId:'Name-only (unverified ID)'}</small><span>{choice.count} legs</span></button>):<p>No matching players in recorded wagers.</p>}</div>}
  {!player?<p className="playerSearchEmpty">Choose a player to see wager history, net returns, official leg hit rate, partner combinations, markets, sportsbooks, and monthly results.</p>:<>
   <div className="playerSearchIdentity"><h3>{player.player}</h3><span>{player.team||'Team not recorded'} · {player.playerId?'NHL ID '+player.playerId:'Historical name-only identity'}</span></div>
   <div className="playerSearchKpis">
    <div><small>WAGERS INVOLVING PLAYER</small><strong>{counts.wagerCount}</strong><span>{counts.settled} settled · {counts.wagerCount-counts.settled} pending</span></div>
    <div><small>ASSOCIATED WAGER P/L</small><strong className={counts.cash>=0?'positive':'negative'}>{money(counts.cash)}</strong><span>{unit(counts.units)} · full-slip exposure</span></div>
    <div><small>SETTLED SLIP RECORD</small><strong>{counts.wins}W / {counts.losses}L</strong><span>{counts.voids} void · {(counts.wins+counts.losses)>0?Math.round(counts.wins/(counts.wins+counts.losses)*100)+'% won':'No decisions'}</span></div>
    <div><small>OFFICIAL PLAYER LEG HITS</small><strong>{hit} / {hit+miss}</strong><span>{hit+miss?Math.round(hit/(hit+miss)*100)+'% verified hit rate':'No verified results'} · {unverified} awaiting evidence</span></div>
    <div><small>SETTLED STAKES INVOLVING PLAYER</small><strong>{money(counts.risk).replace('+','')}</strong><span>Across associated slips</span></div>
   </div>
   <p className="playerSearchMethod">P/L represents the <b>full net result of wagers containing this player</b>, not an independently attributable player profit. Shared combo wagers appear in every involved player's analysis. Player leg hit rates use verified NHL game boxscores, not the whole slip result. Missing boxscores, player IDs, and unavailable records stay unverified.</p>
   {loading&&<p className="playerSearchLoading">Verifying historical NHL boxscores: {progress.done}/{progress.total} games checked…</p>}
   {!loading&&failed.length>0&&<p className="playerSearchLoading">{failed.length} game boxscores were unavailable. Their player leg results remain unverified.</p>}
   <div className="playerSearchGrid">
    <section><h3>STAT MARKET PERFORMANCE</h3><table><thead><tr><th>Market</th><th>Legs</th><th>Hits</th><th>Misses</th><th>Unverified</th></tr></thead><tbody>{[...markets.values()].sort((a,b)=>b.wagers-a.wagers).map(m=><tr key={m.name}><td>{m.name}</td><td>{m.wagers}</td><td className="positive">{m.hit}</td><td>{m.miss}</td><td>{m.unverified}</td></tr>)}</tbody></table></section>
    <section><h3>TOP COMBO PARTNERS</h3><table><thead><tr><th>Player</th><th>Together</th><th>Slip W–L</th><th>Associated P/L</th></tr></thead><tbody>{[...partners.values()].sort((a,b)=>b.count-a.count).slice(0,30).map(p=><tr key={p.name}><td>{p.name}</td><td>{p.count}</td><td>{p.wins}–{p.losses}</td><td className={p.cash>=0?'positive':'negative'}>{money(p.cash)}</td></tr>)}</tbody></table></section>
    <section><h3>BY SPORTSBOOK</h3><table><thead><tr><th>Book</th><th>Wagers</th><th>Wins</th><th>P/L</th></tr></thead><tbody>{[...books.values()].sort((a,b)=>b.count-a.count).map(p=><tr key={p.book}><td>{p.book}</td><td>{p.count}</td><td>{p.wins}</td><td className={p.cash>=0?'positive':'negative'}>{money(p.cash)}</td></tr>)}</tbody></table></section>
    <section><h3>BY CATEGORY</h3><table><thead><tr><th>Category</th><th>Wagers</th><th>Wins</th><th>P/L</th></tr></thead><tbody>{[...categories.values()].sort((a,b)=>b.count-a.count).map(p=><tr key={p.category}><td>{p.category}</td><td>{p.count}</td><td>{p.wins}</td><td className={p.cash>=0?'positive':'negative'}>{money(p.cash)}</td></tr>)}</tbody></table></section>
    <section><h3>MONTHLY TREND</h3><table><thead><tr><th>Month</th><th>Wagers</th><th>W–L</th><th>P/L</th></tr></thead><tbody>{[...byMonth].sort((a,b)=>b[0].localeCompare(a[0])).map(([month,bs])=>{const p=summarize(bs);return <tr key={month}><td>{month}</td><td>{p.wagerCount}</td><td>{p.wins}–{p.losses}</td><td className={p.cash>=0?'positive':'negative'}>{money(p.cash)}</td></tr>})}</tbody></table></section>
   </div>
   <section className="playerSearchHistory"><h3>COMPLETE PLAYER WAGER HISTORY · {history.length} SLIPS</h3><div className="playerSearchHistoryScroll"><table><thead><tr><th>Date</th><th>Sportsbook</th><th>Player Market</th><th>Official Result</th><th>Partner(s)</th><th>Slip Status</th><th>Odds</th><th>Stake</th><th>Slip P/L</th></tr></thead><tbody>{history.map(b=>{
    const legs=appearances.filter(x=>x.b.id===b.id)
    const result=legs.map(x=>x.l.voided?'VOID':!settled(b)?'PENDING':x.e.result).join(', ')
    const partners=b.legs.filter(l=>l.kind!=='TEAM'&&player&&!matches(l,player)).map(l=>l.player).join(' + ')
    return <tr key={b.id} title={b.id}><td>{b.date}</td><td>{b.book}</td><td>{legs.map(x=>`${x.l.side==='UNDER'?'U':'O'} ${x.l.qty} ${x.l.stat}`).join(' + ')}</td><td>{result}</td><td>{partners||'Solo'}</td><td>{b.status||'PENDING'}</td><td>{b.odds==null?'—':b.odds>0?'+'+b.odds:b.odds}</td><td>${stake(b).toFixed(2)}</td><td className={settled(b)?net(b)>=0?'positive':'negative':''}>{settled(b)?money(net(b)):'Pending'}</td></tr>
   })}</tbody></table></div></section>
  </>}
 </section>
}
