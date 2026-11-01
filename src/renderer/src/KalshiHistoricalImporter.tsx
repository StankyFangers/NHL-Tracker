import {useState} from 'react'
import {prepareKalshiImports,type HistoricalGamePlayer,type Candidate,type KalshiFill,type KalshiSlate} from './kalshiImport'
import {addKalshiFlags,clearKalshiFlags} from './KalshiSyncReview'
const eastern=()=>{
 const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
 const x=(k:string)=>p.find(t=>t.type===k)?.value||''
 return x('year')+'-'+x('month')+'-'+x('day')
}
const yesterday=()=>new Date(Date.parse(eastern()+'T12:00:00Z')-86400000).toISOString().slice(0,10)
const team=(g:any,side:string)=>String(g?.[side]?.abbrev?.default||g?.[side]?.abbrev||g?.[side]?.triCode||'').toUpperCase()
const snapshot=(d:string,t:string)=>{try{const x=localStorage.getItem('nhlTracker:dfoSnapshots:v1:'+d+':'+t),v=x?JSON.parse(x):null;return v?.confirmed||v?.latest||v?.baseline||null}catch{return null}}
export function KalshiHistoricalImporter({bets,setBets,unitSize,canSave}:{bets:any[];setBets:any;unitSize:number;canSave:boolean}){
 const [from,setFrom]=useState('2026-10-01'),[to,setTo]=useState(yesterday)
 const [busy,setBusy]=useState(false),[msg,setMsg]=useState('')
 const [preview,setPreview]=useState<{items:Candidate[];from:string;to:string}|null>(null)
 const [failures,setFailures]=useState<{id:string;reason:string;description:string}[]>([])
 const scan=async()=>{
  if(busy)return
  setBusy(true);setPreview(null);setFailures([]);setMsg('Scanning historical Kalshi wagers…')
  try{
   if(!canSave||!(unitSize>0))throw Error('Wait for account sync and configure a positive unit size.')
   if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||! /^\d{4}-\d{2}-\d{2}$/.test(to)||from>to||to>yesterday())throw Error('Select historical dates ending no later than yesterday.')
   const api=(window as any).nhlTracker,history=await api.kalshiHistory(from)
   if(!history.complete)throw Error('Incomplete Kalshi scan: importing partial data is blocked.')
   const fills=(history.nhl as KalshiFill[]).filter(f=>f.date>=from&&f.date<=to)
   const dates=[...new Set(fills.map(f=>f.date))]
   const slates:KalshiSlate[]=[]
   for(const date of dates){
    const response=await api.score(date),games=Array.isArray(response?.games)?response.games:[]
    if(!games.length)throw Error('Cannot load NHL games for '+date)
    const dfo:Record<string,any>={}
    for(const g of games)for(const t of [team(g,'awayTeam'),team(g,'homeTeam')]){
     if(t&&!dfo[t]){const x=snapshot(date,t);if(x?.forwardLines?.length)dfo[t]=x}
    }
    slates.push({date,games,dfo})
   }
   // A player can have appeared for different clubs on different October
   // dates. Build identities separately for EACH slate; never merge rosters
   // across dates, and never use a modern roster as proof of a past game.
   const label=(v:any)=>typeof v==='string'?v:typeof v?.default==='string'?v.default:''
   const extract=(root:any):{playerId:number;fullName:string}[]=>{
    const found=new Map<number,{playerId:number;fullName:string}>()
    const seen=new WeakSet<object>()
    const walk=(v:any)=>{
     if(!v||typeof v!=='object'||seen.has(v))return
     seen.add(v)
     if(Array.isArray(v)){v.forEach(walk);return}
     const id=Number(v.playerId||v.id||0)
     const full=[label(v.firstName),label(v.lastName)].filter(Boolean).join(' ')||label(v.name)||label(v.playerName)||label(v.fullName)
     if(id>0&&full)found.set(id,{playerId:id,fullName:full})
     Object.values(v).forEach(walk)
    }
    walk(root)
    return [...found.values()]
   }
   const accepted:Candidate[]=[]
   const skipped:{id:string;reason:string}[]=[]
   let totalGroups=0
   for(const slate of slates){
    const dayFills=fills.filter(f=>f.date===slate.date)
    const dayPlayers:HistoricalGamePlayer[]=[]
    let boxscoresLoaded=0
    for(const game of slate.games){
     try{
      const [box,pbp]=await Promise.all([api.boxscore(Number(game.id)),api.playByPlay(Number(game.id))])
      const root=box?.playerByGameStats||box?.boxscore?.playerByGameStats
      if(!root)continue
      // Boxscore skaters are usually abbreviated (e.g. "S. Crosby").
      // Same-game play-by-play rosterSpots supplies full legal names keyed
      // by NHL player ID; only use full names from this exact game.
      const fullNames=new Map<number,string>()
      for(const spot of (Array.isArray(pbp?.rosterSpots)?pbp.rosterSpots:[])){
       const id=Number(spot.playerId||0)
       const full=[label(spot.firstName),label(spot.lastName)].filter(Boolean).join(' ')
       if(id>0&&full)fullNames.set(id,full)
      }
      boxscoresLoaded++
      for(const side of ['awayTeam','homeTeam']){
       const abbr=team(game,side)
       if(!abbr)continue
       for(const player of extract(root[side])){
        const fullName=fullNames.get(player.playerId)||player.fullName
        dayPlayers.push({gameId:String(game.id),team:abbr,player:fullName,playerId:player.playerId})
       }
      }
     }catch{/* Failed boxscore stays in review; no guessed identity. */}
    }
    const prepared=prepareKalshiImports(dayFills,bets,slate.dfo,slate.games,unitSize,[],slate.date,{},dayPlayers)
    totalGroups+=prepared.totalGroups
    const verified={accepted:prepared.candidates,rejected:[] as {id:string;reason:string}[]}
    accepted.push(...verified.accepted)
    skipped.push(...prepared.skipped,...verified.rejected)
    if(!boxscoresLoaded&&dayFills.length){
     for(const error of skipped.filter(x=>x.reason.includes('Player missing from game boxscores:')&&x.reason.includes(slate.date))){
      error.reason='NHL boxscore player data unavailable for '+slate.date+' (0 of '+slate.games.length+' games returned player statistics). '+error.reason
     }
    }
   }
   const sources=new Map<string,KalshiFill>()
   for(const f of fills){sources.set(f.id,f);if(f.orderId&&f.ticker)sources.set('KALSHI-'+f.orderId+'|'+f.ticker,f)}
   setFailures(skipped.map(x=>({id:x.id,reason:x.reason,description:sources.get(x.id)?.title||x.id})))
   clearKalshiFlags(skipped.filter(x=>x.reason==='Already imported').map(x=>x.id))
   const flags=skipped.filter(x=>!['Already imported','Not a YES-side purchase'].includes(x.reason)).map(x=>({id:x.id,date:sources.get(x.id)?.date||from,ticker:sources.get(x.id)?.ticker||'',description:sources.get(x.id)?.title||'',reason:x.reason}))
   if(flags.length)addKalshiFlags(flags)
   setPreview({items:accepted,from,to})
   setMsg(accepted.length+' new historical wagers across '+dates.length+' dates; '+skipped.length+' skipped. Review before import.')
  }catch(e:any){setMsg('Historical Sync blocked: '+String(e?.message||e))}
  finally{setBusy(false)}
 }
 const importAll=()=>{
  if(!preview||busy||!canSave||preview.from!==from||preview.to!==to)return
  const incoming=preview.items.map(c=>c.bet)
  setBets((old:any[])=>{
   const ids=new Set(old.map(b=>String(b.id))),additions=incoming.filter(b=>!ids.has(String(b.id)))
   return additions.length?[...old,...additions]:old
  })
  clearKalshiFlags(preview.items.map(c=>c.id))
  setPreview(null);setMsg('Import submitted: '+incoming.length+' historical wagers. Check Bet Tracker and Cloud saved.')
 }
 return <div style={{display:'grid',gap:12,marginTop:14}}>
  <p>Historical wagers only. Matches use their original Eastern placement date and NHL slate, not settlement date.</p>
  <div style={{display:'flex',alignItems:'end',gap:10,flexWrap:'wrap'}}>
   <label>From <input type="date" value={from} max={yesterday()} onChange={e=>{setFrom(e.target.value);setPreview(null)}}/></label>
   <label>Through <input type="date" value={to} max={yesterday()} onChange={e=>{setTo(e.target.value);setPreview(null)}}/></label>
   <button disabled={busy||!canSave} onClick={scan}>{busy?'Scanning…':'Scan Historical Bets'}</button>
  </div>
  {msg&&<p role="status">{msg}</p>}
  {preview&&<section style={{padding:12,border:'1px solid #345664',borderRadius:8}}>
   <strong>Historical Import Preview: {preview.items.length} wagers</strong>
   <div style={{maxHeight:320,overflowY:'auto'}}>
   {preview.items.map(c=><div key={c.id} style={{padding:8,borderTop:'1px solid #345664',fontSize:12}}>
    <b>{c.date} · {c.category} · {c.legs.map(l=>l.player+' '+l.qty+'+ '+l.stat).join(' + ')}</b>
    <div>{c.id} · {'$'+c.risk.toFixed(2)} · {c.units.toFixed(2)}u</div>
   </div>)}
   </div>
   <button disabled={!preview.items.length||!canSave} onClick={importAll}>Import All {preview.items.length}</button>
   <button onClick={()=>setPreview(null)}>Cancel</button>
  </section>}
  {!!failures.length&&<details><summary>Skipped / Needs Review ({failures.length})</summary>
   {failures.map((f,i)=><div key={f.id+'-'+i} style={{padding:6,fontSize:12}}><b>{f.reason}</b> · {f.description}<div>{f.id}</div></div>)}
  </details>}
 </div>
}
