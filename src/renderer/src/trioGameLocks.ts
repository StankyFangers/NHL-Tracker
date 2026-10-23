import {officialGameDate} from './nhlGameDate'
import {useEffect,useState} from 'react'
import {comboGroups} from './automaticCombos'
const PREFIX='nhlTracker:trioGameLock:v1:'
const EVENT='nhlTracker:trioLocksUpdated'
export type TrioLock={date:string;gameId:string;team:string;state:'PROVISIONAL'|'LOCKED';status:'CONFIRMED'|'PROJECTED'|'MISSING';players:string[][];observedAt:string;lockedAt?:string;gameDate:string}
const read=(key:string,fallback:any)=>{try{return JSON.parse(localStorage.getItem(key)||'null')||fallback}catch{return fallback}}
export function readTrioGameLocks():TrioLock[]{const rows:TrioLock[]=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i)||'';if(key.startsWith(PREFIX)){const row=read(key,null);if(row?.gameId&&row?.team&&Array.isArray(row.players))rows.push(row)}}return rows}
export function recordTrioGameLocks(date:string,games:any[],_lineups:Record<string,any>,abbr:(team:any)=>string){
 let changed=false
 for(const game of games){
  if(!game.id||officialGameDate(game)!==date)continue
  const pregame=['PRE','FUT'].includes(String(game.gameState)),started=['LIVE','CRIT','FINAL','OFF'].includes(String(game.gameState))
  if(!pregame&&!started)continue
  const cutoff=Date.parse(game.startTimeUTC||'')
  for(const team of [abbr(game.awayTeam),abbr(game.homeTeam)]){
   if(!team||team==='???')continue
   const key=PREFIX+game.id+':'+team,prior=read(key,null) as TrioLock|null
   if(prior?.state==='LOCKED')continue
   const record=read(`nhlTracker:dfoSnapshots:v1:${date}:${team}`,null)
   // Live startup may recover only observations made before scheduled puck drop.
   const usable=(s:any)=>s&&s.date===date&&s.team===team&&Number.isFinite(Date.parse(s.observedAt))&&(!Number.isFinite(cutoff)||Date.parse(s.observedAt)<cutoff)
   const saved=[record?.confirmed,record?.latest,record?.firstProjected].find(usable)
   let players:string[][]|undefined,status:TrioLock['status']='MISSING',observedAt=''
   if(pregame&&record?.latest?.date===date&&record.latest.team===team){
    const current=record.confirmed||record.latest
    players=comboGroups(current).filter(ps=>ps.length===3);status=current.confirmed?'CONFIRMED':'PROJECTED';observedAt=current.observedAt
   }else if(started&&prior?.state==='PROVISIONAL'){
    const newerSaved=saved&&(saved.confirmed&&prior.status!=='CONFIRMED'||(!!saved.confirmed===(prior.status==='CONFIRMED')&&Date.parse(saved.observedAt)>Date.parse(prior.observedAt)))
    players=newerSaved?comboGroups(saved).filter(ps=>ps.length===3):prior.players;status=newerSaved?(saved.confirmed?'CONFIRMED':'PROJECTED'):prior.status;observedAt=newerSaved?saved.observedAt:prior.observedAt
   }else if(saved){players=comboGroups(saved).filter(ps=>ps.length===3);status=saved.confirmed?'CONFIRMED':'PROJECTED';observedAt=saved.observedAt}
   // Recover existing historical snapshots only if their observation predates this game.
   if(players===undefined&&started){
    const old=read(`nhlTracker:dailyComboSnapshot:v1:${date}`,[])
    const eligible=(Array.isArray(old)?old:[]).filter((row:any)=>row.date===date&&String(row.gameId)===String(game.id)&&row.team===team&&Array.isArray(row.players)&&Number.isFinite(cutoff)&&Date.parse(row.capturedAt)<cutoff)
    if(eligible.length){players=eligible.filter((r:any)=>r.players.length===3).map((r:any)=>r.players);status=eligible.every((r:any)=>r.status==='CONFIRMED')?'CONFIRMED':'PROJECTED';observedAt=eligible.map((r:any)=>r.capturedAt).sort().at(-1)||''}
   }
   if(players===undefined&&pregame)continue // Await a dated DFO observation; never reuse arbitrary team data.
   if(players===undefined){
    // Final-only startup cannot invent the pregame lineup. Keep this explicitly unavailable.
    continue
   }
   const next:TrioLock={date,gameDate:date,gameId:String(game.id),team,state:started?'LOCKED':'PROVISIONAL',status,players,observedAt,...(started?{lockedAt:new Date().toISOString()}:{})}
   if(JSON.stringify(next)!==JSON.stringify(prior)){localStorage.setItem(key,JSON.stringify(next));changed=true}
  }
 }
 if(changed)window.dispatchEvent(new Event(EVENT))
 return changed
}
export function useTrioGameLocks(dates:string[]){
 const [revision,setRevision]=useState(0),[verified,setVerified]=useState<Record<string,boolean>>({}),[error,setError]=useState('')
 const signature=[...new Set(dates)].sort().join(',')
 useEffect(()=>{const update=()=>setRevision(n=>n+1);window.addEventListener(EVENT,update);return()=>window.removeEventListener(EVENT,update)},[])
 useEffect(()=>{let alive=true,busy=false;const finished=new Map<string,any>()
  const run=async()=>{if(busy)return;busy=true;let failed=0;const next:Record<string,boolean>={}
   for(const date of signature.split(',').filter(Boolean)){
    try{const result=finished.get(date)||await window.nhlTracker.score(date);if(!alive)return
     if(!Array.isArray(result?.games))throw Error('No schedule')
     if(result.games.length&&result.games.every((g:any)=>['FINAL','OFF'].includes(String(g.gameState))))finished.set(date,result)
     for(const game of result.games){const actual=officialGameDate(game);if(actual!==date)continue;next[date+':'+game.id]=true}
     recordTrioGameLocks(date,result.games,{},t=>String(t?.abbrev||t?.triCode||''))
    }catch{failed++}
   }
   if(alive){setVerified(next);setRevision(n=>n+1);setError(failed?'Could not verify '+failed+' game dates. Unverified entries stay out of totals.':'')};busy=false
  };void run();const timer=setInterval(()=>void run(),60000);return()=>{alive=false;clearInterval(timer)}
 },[signature])
 return {locks:readTrioGameLocks(),verified,error,revision}
}
