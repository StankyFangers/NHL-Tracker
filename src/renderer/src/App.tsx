import CloudBetHub from './CloudBetHub'
import { importHistoricalWagers, listAllCloudWagers } from './liveMigrationUpload'
import { parseMigrationBackup, compareMigration, type HistoricalWager } from './liveMigrationPreflight'
import { addPlayerIdentities, resolvePlayerId, rosterEntries, syncPlayerDb, readPlayerDb } from './playerIdentityDb'
import { optimizeProfiles, type ProfileReport } from './confidenceProfiles'
import { readOpportunities, readActiveStrategy, saveActiveStrategy, type Thresholds } from './confidenceOptimizer'
import { capturePredictions, finalizePredictions, linkWagers, readPredictions, wagerGrades } from './confidencePerformance'
import { CONFIDENCE_AS_OF, CONFIDENCE_STATUS, CONFIDENCE_TEAMS, CONFIDENCE_METRICS, matchupConfidence, confidenceColor } from './confidenceEngine'
import {captureDfoSnapshot,readDfoSnapshot,brokenDfoUnits} from './dfoSnapshots'
import zamboniDET from './assets/ui/zamboni-DET.png'
import zamboniWSH from './assets/ui/zamboni-WSH.png'
import zamboniCBJ from './assets/ui/zamboni-CBJ.png'
import zamboniWPG from './assets/ui/zamboni-WPG.png'
import { useEffect, useMemo, useRef, useState } from 'react'
import { DeepComboAnalytics, saveComboDayResults, type ComboResultRecord } from './deepComboAnalytics'
import './pregameConfirmedBoard.css'
import { version as installedAppVersion } from '../../../package.json'
import * as XLSX from 'xlsx'
import { HISTORICAL_KALSHI } from './historicalKalshi'
import betHitIcon from './assets/events/bet-hit.png'
import crestSEA from './assets/team-logos/SEA.png'
import crestFLA from './assets/team-logos/FLA.png'
import crestNJD from './assets/team-logos/NJD.png'
import crestDET from './assets/team-logos/DET.png'
import crestNYR from './assets/team-logos/NYR.png'
import crestWSH from './assets/team-logos/WSH.png'
import crestPIT from './assets/team-logos/PIT.png'
import crestCBJ from './assets/team-logos/CBJ.png'
import crestWPG from './assets/team-logos/WPG.png'
import scoreboardCrestCOL from './assets/team-logos/COL.png'
import crestCAR from './assets/team-logos/CAR.png'
import crestCGY from './assets/team-logos/CGY.png'
import crestCHI from './assets/team-logos/CHI.png'
import crestNYI from './assets/team-logos/NYI.png'
import crestOTT from './assets/team-logos/OTT.png'
import crestSJS from './assets/team-logos/SJS.png'
import crestSTL from './assets/team-logos/STL.png'
import crestTOR from './assets/team-logos/TOR.png'
import crestVGK from './assets/team-logos/VGK.png'
import anaTrackerLogo from './assets/team-logos/ANA.png'
import edmTrackerLogo from './assets/team-logos/EDM.png'
import vanTrackerLogo from './assets/team-logos/VAN.png'
import tblTrackerLogo from './assets/team-logos/TBL.png'
import minTrackerLogo from './assets/team-logos/MIN.png'
import phiTrackerLogo from './assets/team-logos/PHI.png'
import mtlTrackerLogo from './assets/team-logos/MTL.png'
import nshTrackerLogo from './assets/team-logos/NSH.png'
import bufTrackerLogo from './assets/team-logos/BUF.png'
import dalTrackerLogo from './assets/team-logos/DAL.png'
import bosTrackerLogo from './assets/team-logos/BOS.png'
import utaTrackerLogo from './assets/team-logos/UTA.png'

const scoreboardLogo:Record<string,string>={ANA:anaTrackerLogo,EDM:edmTrackerLogo,VAN:vanTrackerLogo,TBL:tblTrackerLogo,MIN:minTrackerLogo,PHI:phiTrackerLogo,MTL:mtlTrackerLogo,NSH:nshTrackerLogo,BUF:bufTrackerLogo,DAL:dalTrackerLogo,BOS:bosTrackerLogo,UTA:utaTrackerLogo,CAR:crestCAR,CGY:crestCGY,CHI:crestCHI,NYI:crestNYI,OTT:crestOTT,SJS:crestSJS,STL:crestSTL,TOR:crestTOR,VGK:crestVGK,COL:scoreboardCrestCOL,SEA:crestSEA,DET:crestDET,NYR:crestNYR,WSH:crestWSH,PIT:crestPIT,CBJ:crestCBJ,WPG:crestWPG,FLA:crestFLA,NJD:crestNJD};

// Named, same-slate-day lineup sources count as tracker-confirmed (not official team confirmation).
function dfoConfirmed(info:any, slateDate:string):boolean {
 if(!info?.updatedAt || !info?.source)return false
 const source=String(info.source).trim()
 if(!source || /^(?:DFO\s*Projections?|Last\s*Game)(?:\b|\s*\()/i.test(source) || /^Daily Faceoff$/i.test(source))return false
 const timestamp=new Date(info.updatedAt)
 if(!Number.isFinite(timestamp.getTime()))return false
 // Use formatToParts to avoid locale-specific yyyy-mm-dd rendering differences.
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(timestamp)
 const get=(type:string)=>parts.find(p=>p.type===type)?.value||''
 return `${get('year')}-${get('month')}-${get('day')}`===slateDate
}
function dfoTime(info:any):string {
 if(!info?.updatedAt)return '—'
 const d=new Date(info.updatedAt);if(!Number.isFinite(d.getTime()))return String(info.updatedAt)
 return new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(d)
}
type TrackedCombo = {key:string;date:string;gameId:number;matchup:string;team:string;players:string[];status:string;odds?:number;book?:string;referenceUnits?:number;referencePayout?:number;capturedAt:string;marketAvailability?:'NOT_OFFERED';comboChanged?:boolean;changeNote?:string}
const comboStorageKey=(day:string)=>`nhlTracker:dailyComboSnapshot:v1:${day}`
function readTrackedCombos(day:string):TrackedCombo[]{try{const data=JSON.parse(localStorage.getItem(comboStorageKey(day))||'[]');return Array.isArray(data)?data:[]}catch{return []}}
const comboNameKey=(v:string)=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'')
const comboMoney=(n:number)=>`${n<0?'(':'+'}$${Math.abs(n).toFixed(2)}${n<0?')':''}`
const comboUnits=(n:number)=>`${n>=0?'+':''}${n.toFixed(2)}u`
type Game = any
type FeedEvent = { id:string; gameId:number; team:string; opponent:string; type:'GAME START'|'PERIOD START'|'GOAL'|'POWER PLAY'|'EMPTY NET'|'INTERMISSION'|'FINAL'|'BET HIT'|'STAT CORRECTION'|'NIGHT VERIFIED'; title:string; detail:string; meta:string; sort:number; sequence?:number }
type Leg = { player:string; qty:number; stat:string; playerId?:number; team?:string; opponent?:string; position?:string; gameId?:string; kind?:'PLAYER'|'TEAM'; side?:'OVER'|'UNDER'; voided?:boolean; voidedAt?:string; voidReason?:string }
type BetStatus='PENDING'|'WON'|'LOST'|'VOID'
type BetCategory='COMBOS'|'ASSISTS'|'OTHER'
type VoidAudit={player:string;voidedAt:string;reason:string;originalOdds?:number;originalPayout?:number;adjustedOdds:number;adjustedPayout?:number}
type Bet = { bonusBet?:boolean; id:string; date:string; legs:Leg[]; book:string; units:number; unitSize:number; payout?:number; odds?:number; createdAt:string; groupKey?:string; status?:BetStatus; settledAt?:string; hitAt?:string; verifiedAt?:string; regradeNote?:string; category?:BetCategory; source?:'HISTORICAL_REVIEW'|'LIVE'; voidAudit?:VoidAudit[] }
type TeamGameResult={date:string;gameId:number;team:string;opponent:string;gf:number;ga:number;home:boolean}
type VerifiedDay={date:string;verifiedAt:string;betIds:string[];unitsRisked:number;netUnits:number}
type PlayerLive = { goals:number; assists:number; points:number; shots:number; toi?:string; rostered?:boolean }
type LiveStats = Record<string,PlayerLive>
type OnIcePlayer={playerId:number;name:string;team:string;position?:string;sweaterNumber?:number}
type OnIceSnapshot={away:OnIcePlayer[];home:OnIcePlayer[];updatedAt:number;source?:'NHL LIVE'|'NHL SHIFTS'}
type StatDelta={gameId:number;player:string;stat:string;before:number;after:number;threshold?:number;beforeHit?:boolean;afterHit?:boolean}
type CorrectionReview={betId:string;from:BetStatus;to:BetStatus;deltas:StatDelta[];gameIds:number[];createdAt:string;updatedAt:string}
const ALL_TEAMS=['ANA','BOS','BUF','CAR','CBJ','CGY','CHI','COL','DAL','DET','EDM','FLA','LAK','MIN','MTL','NJD','NSH','NYI','NYR','OTT','PHI','PIT','SEA','SJS','STL','TBL','TOR','UTA','VAN','VGK','WPG','WSH']
const STATS:{[k:string]:string}={p:'Point',point:'Point',points:'Point',g:'Goal',goal:'Goal',goals:'Goal',a:'Assist',assist:'Assist',assists:'Assist',s:'Shot',shot:'Shot',shots:'Shot',sog:'Shot','1st p point':'1st P Point','1st period point':'1st P Point','first period point':'1st P Point','1p point':'1st P Point'}

const FEED_TYPES=['GAME START','PERIOD START','GOAL','POWER PLAY','EMPTY NET','INTERMISSION','FINAL','BET HIT','STAT CORRECTION','NIGHT VERIFIED'] as const
type FeedType=typeof FEED_TYPES[number]
const DEFAULT_FEED_PREFS:Record<FeedType,boolean>={'GAME START':true,'PERIOD START':true,GOAL:true,'POWER PLAY':true,'EMPTY NET':true,INTERMISSION:true,FINAL:true,'BET HIT':true,'STAT CORRECTION':true,'NIGHT VERIFIED':true}
const DEFAULT_DESKTOP_PREFS:Record<FeedType,boolean>={'GAME START':true,'PERIOD START':true,GOAL:true,'POWER PLAY':true,'EMPTY NET':true,INTERMISSION:false,FINAL:true,'BET HIT':true,'STAT CORRECTION':true,'NIGHT VERIFIED':false}
const DEFAULT_SOUND_PREFS:Record<FeedType,boolean>={'GAME START':true,'PERIOD START':false,GOAL:true,'POWER PLAY':true,'EMPTY NET':true,INTERMISSION:false,FINAL:true,'BET HIT':true,'STAT CORRECTION':true,'NIGHT VERIFIED':false}
const cashRisk=(b:Bet)=>b.bonusBet?0:b.units*b.unitSize
const cashReturn=(b:Bet)=>{const stake=b.units*b.unitSize;const gross=b.payout!=null?b.payout:b.odds!=null?stake*(1+(b.odds>0?b.odds/100:100/Math.abs(b.odds))):0;return Math.max(0,gross-(b.bonusBet?stake:0))}
const cashNet=(b:Bet)=>b.status==='VOID'?0:(b.status==='WON'?cashReturn(b):0)-cashRisk(b)
const cashNetUnits=(b:Bet)=>b.unitSize>0?cashNet(b)/b.unitSize:0
const gameShots=(team:any):number|undefined=>{const candidates=[team?.sog,team?.shotsOnGoal,team?.shots];for(const raw of candidates){if(raw!==undefined&&raw!==null&&raw!==''&&Number.isFinite(Number(raw)))return Number(raw)}return undefined}
const BOOKS=['Kalshi','Fanatics','DraftKings','FanDuel','bet365']
function parsePowerPlays(pbp:any,game:Game):FeedEvent[]{
 const out:FeedEvent[]=[]; const plays=pbp?.plays||[]; let previousSituation=''; const pulled:{away:boolean;home:boolean}={away:false,home:false}; (game as any)._trackerEmptyNetTeam='' 
 const rosterName=new Map<number,string>();for(const r of(pbp?.rosterSpots||[])){const id=Number(r?.playerId||r?.player?.id||0);const nm=[name(r?.firstName),name(r?.lastName)].filter(Boolean).join(' ')||name(r?.player?.name)||'';if(id&&nm)rosterName.set(id,nm)}
 const away=abbr(game.awayTeam),home=abbr(game.homeTeam)
 const scoreAt=(play:any)=>({away:Number(play?.details?.awayScore??game.awayTeam?.score??0),home:Number(play?.details?.homeScore??game.homeTeam?.score??0)})
 const isDelayedPenalty=(play:any)=>/delayed[ -]?penalty/i.test(`${play?.typeDescKey||''} ${play?.details?.descKey||''} ${play?.details?.reason||''}`)
 for(let i=0;i<plays.length;i++){
  const play=plays[i]; const sitNow=String(play.situationCode||''); const period=Number(play.periodDescriptor?.number)||0; const clock=play.timeInPeriod||''
  // Tactical goalie pulls are betting-oriented: regulation 3rd period, <=5:00, trailing team only.
  // Delayed-penalty extra attackers are explicitly ignored. Once a valid pull is seen, keep that state
  // latched until the goalie actually returns so polling cannot spam duplicate transitions.
  if(sitNow.length===4&&previousSituation.length===4){
   for(const side of ['away','home'] as const){
    const idx=side==='away'?0:3, team=side==='away'?away:home, opponent=side==='away'?home:away
    const recent=plays.slice(Math.max(0,i-3),Math.min(plays.length,i+3)); const delayed=recent.some(isDelayedPenalty)
    if(!pulled[side]&&previousSituation[idx]==='1'&&sitNow[idx]==='0'&&period===3&&clockToSeconds(clock)<=300&&!delayed){
     const score=scoreAt(play); const trailing=side==='away'?score.away<score.home:score.home<score.away
     if(trailing){pulled[side]=true;out.push({id:`${game.id}-goalie-pulled-${team}-${play.eventId||period+'-'+clock}`,gameId:game.id,team,opponent,type:'EMPTY NET',title:`${team} GOALIE PULLED`,detail:'Late-game goalie pull · extra attacker on',meta:`3rd · ${clock}`,sort:playCompletionMoment(play,game).sort})}
    }else if(pulled[side]&&previousSituation[idx]==='0'&&sitNow[idx]==='1'){
     pulled[side]=false;out.push({id:`${game.id}-goalie-returned-${team}-${play.eventId||period+'-'+clock}`,gameId:game.id,team,opponent,type:'EMPTY NET',title:`${team} GOALIE RETURNED`,detail:'Goalie back on ice · empty net cleared',meta:`3rd · ${clock}`,sort:playCompletionMoment(play,game).sort})
    }
   }
  }
  if(sitNow.length===4)previousSituation=sitNow
  ;(game as any)._trackerEmptyNetTeam=pulled.away?away:pulled.home?home:''
  if(play?.typeDescKey!=='penalty')continue
  const d=play.details||{}; let ppTeam='',penalized=''
  // First use the penalty play's manpower state. If NHL posts the penalty before updating that
  // state, inspect the next few plays in the same period; polling can no longer make a PP vanish.
  const candidateSituations=[sitNow,...plays.slice(i+1,i+5).filter((p:any)=>Number(p?.periodDescriptor?.number)===period).map((p:any)=>String(p?.situationCode||''))]
  for(const situation of candidateSituations){
   if(situation.length!==4)continue
   const awaySkaters=Number(situation[1]),homeSkaters=Number(situation[2])
   if(awaySkaters&&homeSkaters&&awaySkaters!==homeSkaters){ppTeam=homeSkaters>awaySkaters?home:away;penalized=ppTeam===home?away:home;break}
  }
  // Fallback to the penalty owner when the feed has not supplied a usable manpower code yet.
  if(!ppTeam){const owner=Number(d.eventOwnerTeamId??d.teamId??0);const awayId=Number(game.awayTeam?.id||0),homeId=Number(game.homeTeam?.id||0);if(owner&&owner===awayId){penalized=away;ppTeam=home}else if(owner&&owner===homeId){penalized=home;ppTeam=away}}
  if(!ppTeam||!penalized)continue
  const minutes=Number(d.duration||0); const reason=String(d.descKey||d.reason||'Penalty').replaceAll('-',' '); const offenderId=Number(d.committedByPlayerId??d.playerId??d.penaltyCommittedByPlayerId??0); const offender=rosterName.get(offenderId)||''
  // Misconducts and penalty shots do not create a normal PP opportunity by themselves.
  if(/misconduct|penalty[ -]?shot/i.test(reason))continue
  out.push({id:`${game.id}-pp-${play.eventId||period+'-'+clock}`,gameId:game.id,team:ppTeam,opponent:penalized,type:'POWER PLAY',title:`${ppTeam} POWER PLAY`,detail:`${offender?`${offender} (${penalized})`:`${penalized} penalty`} · ${reason}${minutes?` · ${minutes} min`:''}`,meta:`${away} ${d.awayScore??game.awayTeam?.score??'-'} – ${home} ${d.homeScore??game.homeTeam?.score??'-'} · ${period?ordinal(period):''} · ${clock}`,sort:playCompletionMoment(play,game).sort})
 }
 return out
}

function parsePeriodStarts(pbp:any,game:Game):FeedEvent[]{
 const out:FeedEvent[]=[]; const plays=pbp?.plays||[]
 for(const period of [2,3]){
  // A faceoff is the safest signal that play in the new period has actually begun. NHL can expose
  // the period number before intermission has ended, so do not trigger from gameState/period alone.
  const play=plays.find((p:any)=>Number(p?.periodDescriptor?.number)===period&&String(p?.typeDescKey||'')==='faceoff')
  if(!play)continue
  const d=play.details||{};
  out.push({id:`${game.id}-period-start-${period}`,gameId:game.id,team:abbr(game.homeTeam),opponent:abbr(game.awayTeam),type:'PERIOD START',title:`${ordinal(period).toUpperCase()} PERIOD START`,detail:`${abbr(game.awayTeam)} ${d.awayScore??game.awayTeam?.score??'-'} – ${abbr(game.homeTeam)} ${d.homeScore??game.homeTeam?.score??'-'}`,meta:`Puck dropped · ${ordinal(period)} period underway`,sort:playCompletionMoment(play,game).sort})
 }
 return out
}

function parseIntermissions(pbp:any,game:Game):FeedEvent[]{
 const out:FeedEvent[]=[];for(const play of(pbp?.plays||[])){if(!['period-end','period-end-cl'].includes(String(play?.typeDescKey||'')))continue;const period=Number(play.periodDescriptor?.number)||0;if(period<1||period>2)continue;const d=play.details||{};out.push({id:`${game.id}-intermission-${period}`,gameId:game.id,team:abbr(game.homeTeam),opponent:abbr(game.awayTeam),type:'INTERMISSION',title:`END OF ${ordinal(period).toUpperCase()}`,detail:`${abbr(game.awayTeam)} ${d.awayScore??game.awayTeam?.score??'-'} – ${abbr(game.homeTeam)} ${d.homeScore??game.homeTeam?.score??'-'}`,meta:'Intermission · ice resurfacing',sort:playCompletionMoment(play,game).sort})}return out
}

const dateParts=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
const localDate=()=>dateParts(new Date())
const localDateFromISO=(value:string)=>{const d=new Date(value);return Number.isNaN(d.getTime())?String(value||'').slice(0,10):dateParts(d)}
const abbr=(t:any)=>t?.abbrev||t?.triCode||'???'; const name=(n:any)=>typeof n==='string'?n:n?.default||''; const teamFullName=(t:any)=>{const place=name(t?.placeName),common=name(t?.commonName),direct=name(t?.name);return [place,common].filter(Boolean).join(' ')||direct||abbr(t)}
const ordinal=(n:number)=>n===1?'1st':n===2?'2nd':n===3?'3rd':`${n}th`; const clockToSeconds=(c='00:00')=>{const [m,s]=c.split(':').map(Number);return(m||0)*60+(s||0)}
function parseLandingGoals(landing:any,game:Game,pbp?:any):FeedEvent[]{const out:FeedEvent[]=[];let sequence=0;const goalTimes=new Map<string,number>();for(const p of(pbp?.plays||[])){if(String(p?.typeDescKey||'')!=='goal')continue;const pn=Number(p?.periodDescriptor?.number)||0,clock=String(p?.timeInPeriod||'');goalTimes.set(`${pn}|${clock}`,playCompletionMoment(p,game).sort)}for(const pb of(landing?.summary?.scoring||landing?.scoring||[])){const pn=Number(pb?.periodDescriptor?.number)||0;for(const goal of(pb?.goals||[])){sequence++;const team=name(goal.teamAbbrev)||goal.teamAbbrev||'NHL';const opponent=team===abbr(game.homeTeam)?abbr(game.awayTeam):abbr(game.homeTeam);const scorer=name(goal.name)||[name(goal.firstName),name(goal.lastName)].filter(Boolean).join(' ')||'Unknown scorer';const total=goal.goalsToDate;const assists=(goal.assists||[]).map((a:any)=>{const nm=name(a.name)||[name(a.firstName),name(a.lastName)].filter(Boolean).join(' ');return nm?`${nm}${a.assistsToDate!=null?` (${a.assistsToDate})`:''}`:''}).filter(Boolean).join(', ');let badge=String(goal.strength||'').toUpperCase();if(!['PPG','SHG'].includes(badge))badge='';if(String(goal.goalModifier||'').toLowerCase().includes('empty'))badge=badge?`${badge} · EN`:'EN';out.push({id:`${game.id}-goal-${sequence}`,gameId:game.id,team,opponent,type:'GOAL',title:`${scorer}${total!=null?`: ${total}`:''}${badge?` · ${badge}`:''}`,detail:assists?`Assists: ${assists}`:'Unassisted',meta:`${abbr(game.awayTeam)} ${goal.awayScore??'-'} – ${abbr(game.homeTeam)} ${goal.homeScore??'-'} · ${pn?ordinal(pn):''} · ${goal.timeInPeriod||''}`,sort:goalTimes.get(`${pn}|${goal.timeInPeriod||''}`)||playCompletionMoment({periodDescriptor:{number:pn},timeInPeriod:goal.timeInPeriod},game).sort,sequence})}}return out}
const hash=(s:string)=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(16).toUpperCase().padStart(8,'0')}
const normalizeBet=(date:string,legs:Leg[],book:string,units:number,unitSize:number,payout?:number,odds?:number):Bet=>{const clean=legs.map(l=>({player:l.player.trim(),qty:Number(l.qty),stat:STATS[l.stat.toLowerCase()]||l.stat.trim(),playerId:l.playerId,team:l.team,opponent:l.opponent,position:l.position,gameId:l.gameId,kind:l.kind}));const signature=`${date}|${clean.map(l=>`${l.player.toLowerCase()}:${l.qty}:${l.stat.toLowerCase()}`).join('+')}|${book.toLowerCase()}|${units}|${payout??''}|${odds??''}`;return{id:`${date.replaceAll('-','')}-${hash(signature)}`,date,legs:clean,book:book.trim(),units:Number(units),unitSize:Number(unitSize),payout:payout==null?undefined:Number(payout),odds:odds==null?undefined:Number(odds),createdAt:new Date().toISOString(),groupKey:'UNASSIGNED',status:'PENDING'}}
const americanFromReturn=(stake:number,total:number)=>{const profit=total-stake;if(profit<=0)return undefined;return profit>=stake?Math.round((profit/stake)*100):-Math.round((stake/profit)*100)}

function flattenBoxscore(box:any, gameId:number):LiveStats{
 const out:LiveStats={}; const root=box?.playerByGameStats||box?.boxscore?.playerByGameStats||{};
 const walk=(v:any)=>{if(Array.isArray(v)){for(const x of v)walk(x);return} if(!v||typeof v!=='object')return;
  if(v.playerId!=null){const id=Number(v.playerId);if(id){const goals=Number(v.goals||0),assists=Number(v.assists||0);out[`${gameId}:${id}`]={goals,assists,points:Number(v.points??goals+assists),shots:Number(v.sog??v.shots??v.shotsOnGoal??0),toi:String(v.toi??v.timeOnIce??v.timeOnIcePerGame??'0:00'),rostered:true}}}
  for(const x of Object.values(v))if(x&&typeof x==='object')walk(x)
 }; walk(root); return out
}

type LegCompletion = { at:string; label:string; sort:number }
function playCompletionMoment(play:any,game:Game):LegCompletion{
 const direct=play?.timeStamp||play?.timestamp||play?.dateTime||play?.eventDate||play?.details?.timeStamp||play?.details?.timestamp
 if(direct){const ms=Date.parse(String(direct));if(Number.isFinite(ms))return{at:new Date(ms).toISOString(),label:new Date(ms).toLocaleTimeString([],{hour:'numeric',minute:'2-digit',second:'2-digit'}),sort:ms}}
 const period=Math.max(1,Number(play?.periodDescriptor?.number)||1),clock=String(play?.timeInPeriod||'00:00'),elapsed=Math.max(0,1200-clockToSeconds(clock));
 const start=Date.parse(String(game?.startTimeUTC||''));const approx=Number.isFinite(start)?start+(period-1)*(1200+1080)*1000+elapsed*1000:0
 return{at:approx?new Date(approx).toISOString():'',label:`${ordinal(period)} · ${clock}`,sort:approx||period*1000000+elapsed}
}
function playerLegCompletionMap(pbp:any,game:Game){
 const out:Record<string,LegCompletion>={},counts:Record<string,number>={};
 const bump=(playerId:any,stat:'Goal'|'Assist'|'Point'|'Shot',play:any)=>{const id=Number(playerId||0);if(!id)return;const base=`${game.id}:${id}:${stat}`;const n=(counts[base]||0)+1;counts[base]=n;out[`${base}:${n}`]=playCompletionMoment(play,game)}
 for(const play of(pbp?.plays||[])){
  const key=String(play?.typeDescKey||''),d=play?.details||{};
  if(key==='goal'){const scorer=d.scoringPlayerId??d.scorerPlayerId; bump(scorer,'Goal',play);bump(scorer,'Point',play);for(const aid of[d.assist1PlayerId,d.assist2PlayerId]){bump(aid,'Assist',play);bump(aid,'Point',play)}bump(scorer,'Shot',play)}
  else if(['shot-on-goal','shot-on-goal-cl'].includes(key))bump(d.shootingPlayerId??d.shooterPlayerId,'Shot',play)
 }
 return out
}

function legProgress(l:Leg,stats:LiveStats){if(!l.playerId||!l.gameId)return{current:0,hit:false};const x=stats[`${l.gameId}:${l.playerId}`]||{goals:0,assists:0,points:0,shots:0,toi:'0:00',rostered:false};const st=l.stat.toLowerCase();const current=st.startsWith('goal')?x.goals:st.startsWith('assist')?x.assists:st.startsWith('shot')?x.shots:x.points;return{current,hit:current>=l.qty}}
function betHit(b:Bet,stats:LiveStats){const active=b.legs.filter(l=>!l.voided);return active.length>0&&active.every(l=>l.kind==='TEAM'?false:legProgress(l,stats).hit)}
function teamLegHit(l:Leg,games:Game[]){const g=games.find(x=>String(x.id)===String(l.gameId));if(!g||!['FINAL','OFF'].includes(String(g.gameState)))return false;const away=abbr(g.awayTeam),home=abbr(g.homeTeam),as=Number(g.awayTeam?.score),hs=Number(g.homeTeam?.score);if(l.stat==='Moneyline')return l.team===away?as>hs:l.team===home?hs>as:false;if(l.stat==='Spread'){const score=l.team===away?as:l.team===home?hs:NaN;const opp=l.team===away?hs:l.team===home?as:NaN;return Number.isFinite(score)&&score+l.qty>opp}if(l.stat==='Game Total'){const total=as+hs;return l.side==='OVER'?total>l.qty:l.side==='UNDER'?total<l.qty:false}return false}
function gradeBet(b:Bet,stats:LiveStats,games:Game[]){const active=b.legs.filter(l=>!l.voided);return active.length>0&&active.every(l=>l.kind==='TEAM'?teamLegHit(l,games):legProgress(l,stats).hit)}
function authoritativeBetStatus(b:Bet,stats:LiveStats,games:Game[]):BetStatus{
 const active=b.legs.filter(l=>!l.voided);if(!active.length)return 'VOID';
 if(gradeBet(b,stats,games))return 'WON';
 // One confirmed losing leg eliminates the wager immediately, even across games.
 // Missing player statistics are NOT evidence of a loss (DNP/identity review remains manual).
 for(const l of active){
  const g=games.find(x=>String(x.id)===String(l.gameId));
  if(!g||!['FINAL','OFF'].includes(String(g.gameState)))continue;
  if(l.kind==='TEAM'){if(!teamLegHit(l,games))return 'LOST';continue}
  if(!l.playerId||!l.gameId)continue;
  const record=stats[`${l.gameId}:${l.playerId}`];
  if(record?.rostered&& !legProgress(l,stats).hit)return 'LOST';
 }
 return 'PENDING';
}
const playerIdentityKey=(v:string)=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'')
function boxscoreIdentities(box:any,gameId:number){const out:{playerId:number;player:string;gameId:string}[]=[];const seen=new Set<number>();const walk=(v:any)=>{if(Array.isArray(v)){v.forEach(walk);return}if(!v||typeof v!=='object')return;const id=Number(v.playerId||0);const player=[name(v.firstName),name(v.lastName)].filter(Boolean).join(' ')||name(v.name)||name(v.playerName);if(id&&player&&!seen.has(id)){seen.add(id);out.push({playerId:id,player,gameId:String(gameId)})}Object.values(v).forEach(x=>{if(x&&typeof x==='object')walk(x)})};walk(box?.playerByGameStats||box?.boxscore?.playerByGameStats||{});return out}

// Every newly created player leg must resolve to one official NHL identity.
// Never accept a supplied ID solely because it is a positive number.
async function verifiedPlayerLegs(legs:Leg[],games:Game[]):Promise<Leg[]>{
 const byGame=new Map<string,{playerId:number;player:string;gameId:string}[]>();
 for(const l of legs){
  if(l.kind==='TEAM')continue;
  const gameId=String(l.gameId||'');
  const game=games.find(g=>String(g.id)===gameId);
  if(!game)throw Error('Cannot verify '+l.player+': matchup not found on this slate');
  if(!byGame.has(gameId)){
   const players:{playerId:number;player:string;gameId:string}[]=[];
   for(const leg of legs.filter(x=>String(x.gameId||'')===gameId)){
    const known=resolvePlayerId(leg.player,leg.team);
    if(known)players.push({playerId:known,player:leg.player,gameId});
   }
   // NHL verification remains the fallback for players not in the local index.
   if(legs.some(x=>String(x.gameId||'')===gameId&&!resolvePlayerId(x.player,x.team))){
    try{players.push(...boxscoreIdentities(await window.nhlTracker.boxscore(Number(gameId)),Number(gameId)))}catch{}
   }
   if(legs.some(x=>String(x.gameId||'')===gameId&&!resolvePlayerId(x.player,x.team)))for(const team of [abbr(game.awayTeam),abbr(game.homeTeam)]){
    try{
     const roster=await window.nhlTracker.roster(team);
     const walk=(v:any)=>{if(Array.isArray(v)){v.forEach(walk);return}if(!v||typeof v!=='object')return;
      const id=Number(v.playerId||v.id||0);
      const player=[name(v.firstName),name(v.lastName)].filter(Boolean).join(' ')||name(v.name)||name(v.playerName);
      if(id>0&&player)players.push({playerId:id,player,gameId});
      Object.values(v).forEach(x=>{if(x&&typeof x==='object')walk(x)});
     };walk(roster);
    }catch{}
   }
   byGame.set(gameId,players);
  }
 }
 const verified=legs.map(l=>{
  if(l.kind==='TEAM')return l;
  const players=byGame.get(String(l.gameId))||[];
  const byName=players.filter(p=>playerIdentityKey(p.player)===playerIdentityKey(l.player));
  const ids=[...new Set(byName.map(p=>p.playerId))];
  if(ids.length!==1)throw Error('Could not verify NHL identity for '+l.player+'. Bet was not saved.');
  if(Number(l.playerId)>0&&Number(l.playerId)!==ids[0])throw Error('NHL identity mismatch for '+l.player+'. Bet was not saved.');
  return {...l,playerId:ids[0],player:byName[0].player};
 });
 addPlayerIdentities(verified.filter(l=>l.kind!=='TEAM'&&Number(l.playerId)>0).map(l=>({id:Number(l.playerId),name:l.player,team:l.team||''})));
 return verified;
}

// 2026-27 identity recovery. Use saved verified identities first, then official
// game players and season rosters. Never overwrite an existing positive ID.
const BACKFILL_FIRST_DATE='2026-10-01';
function backfillIdentityKey(v:string){return playerIdentityKey(v)}
type Identity={playerId:number;player:string;gameId:string};
function backfillGamePlayers(box:any,gameId:string):Identity[]{return boxscoreIdentities(box,Number(gameId))}
function backfillRosterPlayers(roster:any,gameId:string):Identity[]{
 const players:Identity[]=[];
 for(const p of [...(roster?.forwards||[]),...(roster?.defensemen||[]),...(roster?.goalies||[])]){
  const id=Number(p?.id||p?.playerId||0);
  const full=[name(p?.firstName),name(p?.lastName)].filter(Boolean).join(' ')||name(p?.name)||name(p?.playerName);
  if(Number.isInteger(id)&&id>0&&full)players.push({playerId:id,player:full,gameId});
 }
 return players;
}
function uniqueIdentity(identities:Identity[],player:string):Identity|undefined{
 const found=identities.filter(p=>backfillIdentityKey(p.player)===backfillIdentityKey(player));
 return new Set(found.map(p=>p.playerId)).size===1?found[0]:undefined;
}

function reconcileBetPlayerIds(b:Bet,identities:Map<string,{playerId:number;player:string;gameId:string}[]>){let changed=false;const legs=b.legs.map(l=>{if(l.kind==='TEAM'||!l.gameId)return l;const candidates=identities.get(String(l.gameId))||[];const match=candidates.find(x=>playerIdentityKey(x.player)===playerIdentityKey(l.player));if(l.playerId||!match)return l;changed=true;return{...l,playerId:match.playerId,player:match.player}});return changed?{...b,legs}:b}
function playEventSound(type:FeedType,volume:number){
 try{const Ctx=(window.AudioContext||(window as any).webkitAudioContext);if(!Ctx)return;const ctx=new Ctx();const gain=ctx.createGain();gain.connect(ctx.destination);gain.gain.setValueAtTime(Math.max(0,Math.min(1,volume)),ctx.currentTime);const map:Record<FeedType,number[]>={'GAME START':[1050,1320,1050],'PERIOD START':[660,880],GOAL:[740,990],'POWER PLAY':[440,660],'EMPTY NET':[520,390],INTERMISSION:[330,440],FINAL:[880,660],'BET HIT':[880,1175],'STAT CORRECTION':[320,240,320],'NIGHT VERIFIED':[660,880]};const notes=map[type]||[660];notes.forEach((freq,i)=>{const o=ctx.createOscillator();const g=ctx.createGain();o.type=type==='STAT CORRECTION'?'square':'sine';o.frequency.value=freq;o.connect(g);g.connect(gain);const st=ctx.currentTime+i*.12;g.gain.setValueAtTime(.0001,st);g.gain.exponentialRampToValueAtTime(.22,st+.015);g.gain.exponentialRampToValueAtTime(.0001,st+.105);o.start(st);o.stop(st+.12)});setTimeout(()=>ctx.close(),800)}catch{}
}


function loadDetectedEvents(date:string):Record<string,number>{try{const v=JSON.parse(localStorage.getItem('nhlTrackerObservedEvents:'+date)||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}catch{return{}}}
function liveIcePlayers(landing:any,side:'awayTeam'|'homeTeam',team:string):OnIcePlayer[]{
 const surface=landing?.summary?.iceSurface?.[side];if(!surface)return[];
 const players=[...(surface.forwards||[]),...(surface.defensemen||[]),...(surface.goalies||[])];
 return players.map((p:any)=>({playerId:Number(p.playerId||0),name:name(p.name)||[name(p.firstName),name(p.lastName)].filter(Boolean).join(' ')||`#${p.sweaterNumber||p.playerId}`,team,position:String(p.positionCode||''),sweaterNumber:Number(p.sweaterNumber||0)||undefined})).filter((p:OnIcePlayer)=>p.playerId>0)
}

type ComboDraft = {odds:string;book:string;stake:string;payout:string}
function ComboBookAutocomplete({value,onPick}:{value:string;onPick:(book:string)=>void}){
 const [focused,setFocused]=useState(false)
 const [active,setActive]=useState(0)
 const matches=BOOKS.filter(book=>book.toLowerCase().includes(value.trim().toLowerCase()))
 const show=focused&&value.trim().length>0&&matches.length>0&&!BOOKS.some(book=>book.toLowerCase()===value.trim().toLowerCase())
 const choose=(book:string)=>{onPick(book);setFocused(false);setActive(0)}
 return <div className="comboBookAuto"><input type="text" autoComplete="off" value={value} placeholder="" onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} onChange={e=>{onPick(e.target.value);setFocused(true);setActive(0)}} onKeyDown={e=>{
  if(e.key==='Escape'){setFocused(false);return}
  if(show&&(e.key==='ArrowDown'||e.key==='ArrowUp')){e.preventDefault();setActive(i=>(i+(e.key==='ArrowDown'?1:matches.length-1))%matches.length)}
  if(show&&(e.key==='Enter'||e.key==='Tab')){if(e.key==='Enter')e.preventDefault();choose(matches[Math.min(active,matches.length-1)]);if(e.key==='Enter'){const units=e.currentTarget.closest('.comboDrawerFields')?.querySelector<HTMLInputElement>('input[type=number]');units?.focus();units?.select()}}
 }} />{show&&<div className="comboBookSuggestions" role="listbox">{matches.map((book,i)=><button type="button" role="option" aria-selected={i===active} className={i===active?'active':''} key={book} onMouseDown={e=>{e.preventDefault();choose(book)}}>{book}</button>)}</div>}</div>
}

function SavedComboDrawer({date,combos,bets,unitSize,onSave,onFlag,onClose}:{date:string;combos:TrackedCombo[];bets:Bet[];unitSize:number;onSave:(key:string,draft:ComboDraft)=>boolean;onFlag:(key:string,patch:Partial<TrackedCombo>)=>void;onClose:()=>void}){
 const [drafts,setDrafts]=useState<Record<string,ComboDraft>>({})
 const [opened,setOpened]=useState<Record<string,boolean>>({})
 const [notice,setNotice]=useState('')
 const [hasOpen,setHasOpen]=useState(false)
 const [needsOpen,setNeedsOpen]=useState(true)
 const [notOfferedOpen,setNotOfferedOpen]=useState(true)
 const [dirty,setDirty]=useState<Record<string,boolean>>({})
 const getBet=(c:TrackedCombo)=>{
  const found=bets.filter(b=>b.date===date&&b.category==='COMBOS'&&b.legs.length===c.players.length&&b.legs.every(l=>l.kind!=='TEAM'&&!l.voided&&l.qty===1&&l.stat==='Point'&&String(l.gameId)===String(c.gameId)&&c.players.some(p=>comboNameKey(p)===comboNameKey(l.player)))&&c.players.every(p=>b.legs.some(l=>comboNameKey(p)===comboNameKey(l.player))))
  const priced=found.map(b=>({b,odds:b.odds??(b.payout!=null&&b.units*b.unitSize>0?americanFromReturn(b.units*b.unitSize,b.payout):undefined)})).filter(x=>x.odds!=null&&Number.isFinite(x.odds)&&Math.abs(x.odds)>=100)
  return priced.length===1?priced[0]:null
 }
 const effective=(c:TrackedCombo)=>{
  const linked=getBet(c)
  const manual=c.odds!=null&&Number.isFinite(c.odds)&&Math.abs(c.odds)>=100&&!!c.book?.trim()&&c.referenceUnits!=null&&c.referenceUnits>0
  return {linked,manual,has:manual||!!linked,odds:manual?c.odds:linked?.odds,book:manual?c.book:linked?.b.book,stake:manual?c.referenceUnits:linked?.b.units}
 }
 const startDraft=(c:TrackedCombo):ComboDraft=>{
  const e=effective(c),isKalshi=(e.book||'').trim().toLowerCase()==='kalshi'
  const stake=e.stake==null?'1':String(e.stake)
  const fromBet=e.linked?.b.payout
  const payout=c.referencePayout??fromBet??(isKalshi&&e.odds!=null&&e.stake!=null&&unitSize>0?(e.stake*unitSize)*(Number(e.odds)>0?1+Number(e.odds)/100:1+100/Math.abs(Number(e.odds))):undefined)
  return {odds:e.odds==null?'':String(e.odds),book:e.book||'',stake,payout:isKalshi&&payout!=null?String(Number(payout.toFixed(2))):''}
 }
 const groups=(rows:TrackedCombo[])=>[...new Set(rows.map(c=>c.matchup))].sort().map(matchup=>({matchup,rows:rows.filter(c=>c.matchup===matchup).sort((a,b)=>a.team.localeCompare(b.team)||a.players.join('|').localeCompare(b.players.join('|')))}))
 const needs=combos.filter(c=>c.marketAvailability!=='NOT_OFFERED'&&!c.comboChanged&&!effective(c).has),has=combos.filter(c=>c.marketAvailability!=='NOT_OFFERED'&&effective(c).has),notOffered=combos.filter(c=>c.marketAvailability==='NOT_OFFERED')
 const close=()=>{if(Object.values(dirty).some(Boolean)&&!window.confirm('Discard unsaved odds changes?'))return;onClose()}
 return <div className="comboDrawerBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><aside className="comboDrawer" role="dialog" aria-modal="true" aria-label="Saved combos and odds"><header className="comboDrawerHeader"><div className="comboDrawerHeaderContent"><div className="comboDrawerEyebrow">DEV CONTROL CENTER · ODDS WORKSPACE</div><h2>SAVED COMBOS &amp; ODDS</h2><div className="comboDrawerHeaderMeta"><span>{date}</span><span>{combos.length} qualifying combos</span><span>Report-only prices</span></div></div><button className="comboDrawerClose" onClick={close} aria-label="Close saved combos">✕</button></header><div className="comboDrawerScroll"><div className="comboDrawerStats"><span>NEEDS ODDS <b>{needs.length}</b></span><span>HAS ODDS <b>{has.length}</b></span><span>NOT OFFERED <b>{notOffered.length}</b></span><span>COMBO CHANGED <b>{combos.filter(c=>c.comboChanged).length}</b></span></div>{notice&&<div className="comboDrawerNotice" role="status">{notice}</div>}{([{label:'NEEDS ODDS',rows:needs,expanded:needsOpen,toggle:()=>setNeedsOpen(v=>!v)},{label:'HAS ODDS',rows:has,expanded:hasOpen,toggle:()=>setHasOpen(v=>!v)},{label:'NOT OFFERED',rows:notOffered,expanded:notOfferedOpen,toggle:()=>setNotOfferedOpen(v=>!v)}]).map(section=><section className="comboDrawerSection" key={section.label}><button className="comboDrawerSectionToggle" onClick={section.toggle}>{section.label} <b>{section.rows.length}</b><span>{section.expanded?'▴':'▾'}</span></button>{section.expanded&&(!section.rows.length?<p className="comboDrawerEmpty">No combos in this section.</p>:groups(section.rows).map(group=><div className="comboDrawerGame" key={group.matchup}><h3>{group.matchup}</h3>{group.rows.map(c=>{const e=effective(c),isOpen=opened[c.key]??(!e.has||c.marketAvailability==='NOT_OFFERED'||!!c.comboChanged),d=drafts[c.key]??startDraft(c);return <div className="comboDrawerCombo" key={c.key}><button className="comboDrawerComboToggle" onClick={()=>setOpened(o=>({...o,[c.key]:!isOpen}))}><span><b>{c.team} · {c.players.length===3?'TRIO':'DUO'} · {c.status}</b><small>{c.players.map(p=>p+' 1P').join(' + ')}</small></span><em>{c.marketAvailability==='NOT_OFFERED'?'NOT OFFERED':e.has?`${Number(e.odds)>0?'+':''}${e.odds} · ${e.book}`:'NEEDS ODDS'}</em><strong>{isOpen?'▴':'▾'}</strong></button>{isOpen&&<div className="comboDrawerEditor"><div className="comboReviewFlags"><label><input type="checkbox" checked={c.marketAvailability==='NOT_OFFERED'} onChange={ev=>onFlag(c.key,{marketAvailability:ev.target.checked?'NOT_OFFERED':undefined})}/> NOT OFFERED ON SPORTSBOOK</label><label><input type="checkbox" checked={!!c.comboChanged} onChange={ev=>onFlag(c.key,{comboChanged:ev.target.checked,changeNote:ev.target.checked?c.changeNote:undefined})}/> COMBO CHANGED</label>{c.comboChanged&&<label className="comboChangeNote">CHANGE DETAILS <input value={c.changeNote||''} placeholder="Reason (optional)" onChange={ev=>onFlag(c.key,{changeNote:ev.target.value})}/></label>}</div><div className="comboDrawerFields"><label>SPORTSBOOK<ComboBookAutocomplete value={d.book} onPick={book=>{setDrafts(v=>({...v,[c.key]:{...d,book,odds:book.trim().toLowerCase()==='kalshi'?'':d.odds,payout:book.trim().toLowerCase()==='kalshi'?d.payout:''}}));setDirty(v=>({...v,[c.key]:true}))}}/></label><label>UNITS<input type="number" min="0.01" step="any" value={d.stake} onFocus={ev=>ev.currentTarget.select()} onBlur={()=>{if(!d.stake.trim()){setDrafts(v=>({...v,[c.key]:{...d,stake:"1"}}))}}} onChange={ev=>{setDrafts(v=>({...v,[c.key]:{...d,stake:ev.target.value}}));setDirty(v=>({...v,[c.key]:true}))}}/></label>{d.book.trim().toLowerCase()==='kalshi'?<label>TOTAL PAYOUT ($)<input type="number" min="0" step="any" value={d.payout} onChange={ev=>{setDrafts(v=>({...v,[c.key]:{...d,payout:ev.target.value}}));setDirty(v=>({...v,[c.key]:true}))}}/></label>:<label>AMERICAN ODDS<input type="number" step="1" value={d.odds} onChange={ev=>{setDrafts(v=>({...v,[c.key]:{...d,odds:ev.target.value}}));setDirty(v=>({...v,[c.key]:true}))}}/></label>}</div>{d.book.trim().toLowerCase()==='kalshi'&&d.stake.trim()&&d.payout.trim()&&unitSize>0&&Number(d.payout)>Number(d.stake)*unitSize&&<div className="comboDrawerCalculated">Calculated odds: <b>{(()=>{const v=americanFromReturn(Number(d.stake)*unitSize,Number(d.payout));return v==null?'—':v>0?'+'+v:String(v)})()}</b> · ${unitSize.toFixed(2)} per unit</div>}<div className="comboDrawerActions"><small>{dirty[c.key]?'● UNSAVED CHANGES':e.manual?'MANUAL OVERRIDE':e.linked?'AUTO-LINKED FROM BET HUB':'MANUAL REFERENCE ENTRY'}</small><button onClick={()=>{if(!onSave(c.key,d)){setNotice(d.book.trim().toLowerCase()==='kalshi'?'Enter sportsbook, positive units, and a total payout ($) greater than the stake. Check Unit Size in Settings.':'Enter sportsbook, positive units, and valid American odds (at least +100 or -100).');return}setDirty(v=>({...v,[c.key]:false}));setOpened(v=>({...v,[c.key]:false}));setNotice(`✓ Saved odds for ${c.team}: ${c.players.join(' + ')}`)}}>SAVE ODDS</button></div></div>}</div>})}</div>))}</section>)}</div></aside></div>
}
function TrackerApp({initialTestAccount,onTestLogout,liveAccount,onLiveLogout}:{initialTestAccount?:{username:string;role:string};onTestLogout?:()=>void;liveAccount?:{username:string;role:string};onLiveLogout?:()=>void}){
 const isTestMode=import.meta.env.DEV;

 const[devMode,setDevMode]=useState(false),[reportBusy,setReportBusy]=useState(false),[eodBusy,setEodBusy]=useState(false);const[tab,setTab]=useState('LIVE'),[selectedGame,setSelectedGame]=useState<string>('ALL'),[addBetOpen,setAddBetOpen]=useState(false),[date,setDate]=useState(()=>{const today=localDate();const held=localStorage.getItem('activeSlateDate');const verified:VerifiedDay[]=JSON.parse(localStorage.getItem('verifiedDays')||'[]');const verifiedDates=new Set(verified.map(v=>v.date));const storedBets:Bet[]=JSON.parse(localStorage.getItem('bets')||'[]');const unverifiedBetDates=[...new Set(storedBets.map(b=>b.date).filter(d=>d&&d<=today&&!verifiedDates.has(d)))].sort();const latestUnverified=unverifiedBetDates.at(-1);if(latestUnverified&&(!held||held>latestUnverified||!storedBets.some(b=>b.date===held)))return latestUnverified;if(held&&!verifiedDates.has(held))return held;return today}),[games,setGames]=useState<Game[]>([]),[events,setEvents]=useState<FeedEvent[]>([]),[liveStats,setLiveStats]=useState<LiveStats>({}),[hidden,setHidden]=useState<string[]>(()=>JSON.parse(localStorage.getItem('hiddenTeams')||'["TBL"]')),[status,setStatus]=useState('Connecting to NHL…')
 const [devSync,setDevSync]=useState('Sign in to load TEST bets')
 const [devSyncTick,setDevSyncTick]=useState(0)
 const devPendingRef=useRef(false)
 const devLoadedRef=useRef(false)
 const devAccountSwitchRef=useRef(false)
 const [devClearText,setDevClearText]=useState('')
 const [devClearing,setDevClearing]=useState(false)
 const devSyncRef=useRef<{ready:boolean;revision:number;last:string;busy:boolean;account:string}>({ready:false,revision:0,last:'',busy:false,account:''})
 const [accountOpen,setAccountOpen]=useState(false)
 const [analyticsSection,setAnalyticsSection]=useState<'PROFIT'|'DETAIL'|'TRIOS'|'CONFIDENCE'|'TEAMS'>('PROFIT')
 const [accountMode,setAccountMode]=useState<'login'|'register'>('login')
 const [account,setAccount]=useState<{username:string;role:string}|null>(initialTestAccount||null)
 const [accountName,setAccountName]=useState('')
 const [accountEmail,setAccountEmail]=useState('')
 const [accountPassword,setAccountPassword]=useState('')
 const [accountBusy,setAccountBusy]=useState(false)
 const [accountError,setAccountError]=useState('')
 const submitAccount=async(e:React.FormEvent)=>{
  e.preventDefault();setAccountBusy(true);setAccountError('')
  try {const result=await (window.nhlTracker as any).devAccountRequest(accountMode==='login'?{action:'login',login:accountName,password:accountPassword}:{action:'register',username:accountName,email:accountEmail,password:accountPassword});if(result.error)setAccountError(result.error);else{setAccount(result.account||null);setAccountOpen(false);setAccountPassword('')}}catch{setAccountError('Account service unavailable')}finally{setAccountBusy(false)}
 }
 const renameTestAccount=async()=>{
  if(!isTestMode||account?.username!=='stankyfangers'||account.role!=='DEV')return
  if(devPendingRef.current||devSyncRef.current.busy||!devSyncRef.current.ready){window.alert('Wait until TEST bets show Server saved before renaming.');return}
  if(!window.confirm('Rename this TEST account to StankyFangersTEST? The account ID, password and server wagers will remain unchanged. LIVE will not be touched.'))return
  setAccountBusy(true);setAccountError('')
  try{
   const result=await (window.nhlTracker as any).devAccountRequest({action:'rename_self',username:'StankyFangersTEST'})
   if(result.error){setAccountError(result.error);return}
   const old='stankyfangers',next='stankyfangerstest'
   for(const prefix of ['nhlTracker:devUnitSize:','nhlTracker:devBetsCache:']){
    const value=localStorage.getItem(prefix+old)
    if(value!==null&&localStorage.getItem(prefix+next)===null)localStorage.setItem(prefix+next,value)
   }
   devSyncRef.current.ready=false
   setAccount(result.account)
   setAccountOpen(false)
   window.alert('TEST account renamed. Your existing server wagers remain attached to the same account. Sign in as StankyFangersTEST next time.')
  }catch{setAccountError('TEST rename unavailable; no local data was changed')}
  finally{setAccountBusy(false)}
 }
 const logoutAccount=async()=>{
  if(isTestMode&&account?.role==='DEV'&&(devPendingRef.current||devSyncRef.current.busy||!devSyncRef.current.ready)){window.alert('TEST bets are not confirmed saved. Wait for Server saved before signing out.');return}
  devSyncRef.current.ready=false;devLoadedRef.current=false;devAccountSwitchRef.current=true;setTab('LIVE');
  await (window.nhlTracker as any).devAccountRequest({action:'logout'});setAccount(null);setDevMode(false);
  setBets([]);onTestLogout?.();
  const liveUnit=Number(localStorage.getItem('unitSize')||'0');setUnitSize(Number.isFinite(liveUnit)?liveUnit:0)
 }
  const [devPlayerQuery,setDevPlayerQuery]=useState('')
 const [devPlayerResults,setDevPlayerResults]=useState<{id:number;name:string;team:string}[]>([])
 const [devPlayerSearching,setDevPlayerSearching]=useState(false)
 const [devPlayerSelected,setDevPlayerSelected]=useState('')
 const [devPlayerAdded,setDevPlayerAdded]=useState<Record<number,boolean>>({})
 const [,setSharedPlayerRevision]=useState(0)
 const [devPlayerTeam,setDevPlayerTeam]=useState('ANA')
 const searchDevPlayer=async()=>{
  if((liveAccount||account)?.role!=='DEV'||devPlayerSearching)return
  setDevPlayerSearching(true);setDevPlayerResults([]);setDevRosterMessage('Searching NHL player index…')
  try{const results=await (window.nhlTracker as any).playerSearch(devPlayerQuery);setDevPlayerResults(results);setDevPlayerSelected('');setDevRosterMessage(results.length?`${results.length} NHL player matches. Verify identity before adding.`:'No NHL player matches found; no identities changed.')}
  catch(e){setDevRosterMessage(`Player lookup failed: ${String(e)}`)}finally{setDevPlayerSearching(false)}
 }
 const addDevPlayer=async(p:{id:number;name:string;team:string})=>{
  if((liveAccount||account)?.role!=='DEV')return
  const team=devPlayerTeam.trim().toUpperCase()
  if(!ALL_TEAMS.includes(team))return setDevRosterMessage('Select a valid NHL team')
  if(!liveAccount){setDevRosterMessage('Shared updates require a LIVE DEV account. TEST cannot modify production.');return}
  setDevRosterMessage('Saving player to shared LIVE registry…')
  try{
   const result=await (window.nhlTracker as any).livePlayersRequest({method:'POST',id:p.id,name:p.name,team})
   if(result.error){setDevRosterMessage(result.error);return}
   if(!result.saved||Number(result.player?.id)!==p.id){setDevRosterMessage('Server did not confirm save; please retry.');return}
   addPlayerIdentities([{id:p.id,name:p.name,team}]);setDevPlayerAdded(v=>({...v,[p.id]:true}));setSharedPlayerRevision(v=>v+1);window.dispatchEvent(new Event('nhl-shared-players-updated'))
   setDevRosterMessage(`${p.name} saved to shared LIVE registry for ${team}. Other LIVE users receive the update on refresh or next sign-in.`)
  }catch(e){setDevRosterMessage(`Shared player save failed: ${String(e)}`)}
 }
 // Pull shared players into the existing local identity index without touching wagers.
 useEffect(()=>{if(!liveAccount)return;let active=true
  const load=async()=>{try{const result=await (window.nhlTracker as any).livePlayersRequest({method:'GET'});if(!active||result.error||!Array.isArray(result.players))return
   addPlayerIdentities(result.players.map((p:any)=>({id:Number(p.id),name:String(p.name),team:String(p.team)})))
   setSharedPlayerRevision(v=>v+1);window.dispatchEvent(new Event('nhl-shared-players-updated'))
  }catch{}}
  void load();return()=>{active=false}
 },[liveAccount?.username])

 const [devRosterBusy,setDevRosterBusy]=useState(false)
 const [devRosterMessage,setDevRosterMessage]=useState('')
 const [devRosterLast,setDevRosterLast]=useState(()=>Number(localStorage.getItem('nhlTracker:playerIdentityDb:lastFullSync')||0))
 const refreshDevRosters=async()=>{
  if((liveAccount||account)?.role!=='DEV'||devRosterBusy)return
  setDevRosterBusy(true);setDevRosterMessage('Checking all 32 NHL rosters…')
  const before=readPlayerDb().length
  try{
   await syncPlayerDb(team=>window.nhlTracker.roster(team),ALL_TEAMS,true)
   const after=readPlayerDb().length
   const last=Number(localStorage.getItem('nhlTracker:playerIdentityDb:lastFullSync')||0)
   setDevRosterLast(last)
   setDevRosterMessage(`${Math.max(0,after-before)} new local identities · ${after} cached total. ${last?'All teams refreshed.':'Some team lookups failed; retry later.'} Reopen Add Bet to refresh its player suggestions.`)
  }catch(e){setDevRosterMessage(`Roster check failed: ${String(e)}`)}
  finally{setDevRosterBusy(false)}
 }

 const [trackedCombos,setTrackedCombos]=useState<TrackedCombo[]>(()=>readTrackedCombos(date))
 const [comboReportMessage,setComboReportMessage]=useState('')
 useEffect(()=>{setTrackedCombos(readTrackedCombos(date))},[date])
 const saveTrackedCombos=(next:TrackedCombo[])=>{localStorage.setItem(comboStorageKey(date),JSON.stringify(next));setTrackedCombos(next)}
 const [comboDrawerOpen,setComboDrawerOpen]=useState(false)
 const saveComboOdds=(key:string,draft:ComboDraft)=>{
  const stake=Number(draft.stake),book=draft.book.trim(),kalshi=book.toLowerCase()==='kalshi'
  if(!BOOKS.some(b=>b.toLowerCase()===book.toLowerCase())||!draft.stake.trim()||!Number.isFinite(stake)||stake<=0)return false
  const payout=kalshi?Number(draft.payout):undefined
  if(kalshi&&(!draft.payout.trim()||!Number.isFinite(payout)||!Number.isFinite(unitSize)||unitSize<=0||Number(payout)<=stake*unitSize))return false
  const odds=kalshi?americanFromReturn(stake*unitSize,payout!):Number(draft.odds)
  if(odds==null||!Number.isInteger(odds)||Math.abs(odds)<100||(!kalshi&&!draft.odds.trim()))return false
  saveTrackedCombos(trackedCombos.map(c=>c.key===key?{...c,marketAvailability:undefined,odds,book:BOOKS.find(b=>b.toLowerCase()===book.toLowerCase())||book,referenceUnits:stake,referencePayout:kalshi?payout:undefined}:c));return true
 }

 const flagCombo=(key:string,patch:Partial<TrackedCombo>)=>saveTrackedCombos(trackedCombos.map(c=>c.key===key?{...c,...patch}:c))
 const generateEndOfDayComboReport=async()=>{
  if(account?.role!=='DEV'||eodBusy)return
  setEodBusy(true);setComboReportMessage('Checking final NHL boxscores…')
  try{
   if(!trackedCombos.length)throw new Error('Generate and save the Daily Combo Report first.')
   const ids=[...new Set(trackedCombos.map(c=>c.gameId))]
   const score=await window.nhlTracker.score(date)
   const finalGames=(score?.games||[]) as Game[]
   if(ids.some(id=>!finalGames.some(g=>Number(g.id)===id&&['FINAL','OFF'].includes(String(g.gameState)))))throw new Error('Some tracked games are not final. Report not generated.')
   const boxEntries=await Promise.all(ids.map(async id=>{const box=await window.nhlTracker.boxscore(id);return [id,{stats:flattenBoxscore(box,id),identities:boxscoreIdentities(box,id)}] as const}))
   const boxMap=new Map(boxEntries)
   const rows:{combo:TrackedCombo;result:'HIT'|'MISS'|'UNVERIFIED';details:string;odds?:number;net?:number;units:number;source:string}[]=[]
   for(const c of trackedCombos){
    const box=boxMap.get(c.gameId);if(!box)continue
    const points=c.players.map(player=>{const matches=box.identities.filter(i=>comboNameKey(i.player)===comboNameKey(player));const unique=[...new Set(matches.map(i=>i.playerId))];const id=unique.length===1?unique[0]:0;const st=id?box.stats[`${c.gameId}:${id}`]:undefined;return {player,points:st?.points,valid:!!st&&st.rostered===true}})
    const result=points.some(p=>!p.valid)?'UNVERIFIED':points.every(p=>Number(p.points)>=1)?'HIT':'MISS'
    const matches=bets.filter(b=>b.date===date&&b.category==='COMBOS'&&b.legs.length===c.players.length&&b.legs.every(l=>l.kind!=='TEAM'&&!l.voided&&l.qty===1&&l.stat==='Point'&&c.players.some(p=>comboNameKey(p)===comboNameKey(l.player)))&&c.players.every(p=>b.legs.some(l=>comboNameKey(p)===comboNameKey(l.player))))
    const priced=matches.filter(b=>Number.isFinite(b.odds)||(Number.isFinite(b.payout)&&b.payout!>0&&b.units*b.unitSize>0))
    let odds:number|undefined,source='UNPRICED',units=c.referenceUnits??1
    if(c.marketAvailability==='NOT_OFFERED'){source='NOT OFFERED — EXCLUDED FROM P/L'}
    else if(c.odds!=null&&Number.isFinite(c.odds)&&Math.abs(c.odds)>=100){odds=c.odds;source=`REFERENCE · ${c.book||'Unspecified'}`}
    else if(priced.length===1){const b=priced[0];odds=b.odds??americanFromReturn(b.units*b.unitSize,b.payout!);source=`BET ${b.id} · ${b.book}`;units=b.units}
    else if(priced.length>1)source='MULTIPLE MATCHING PRICES — ENTER REFERENCE ODDS'
    const net=odds!=null&&result!=='UNVERIFIED'?(result==='HIT'?units*(odds>0?odds/100:100/Math.abs(odds)):-units):undefined
    rows.push({combo:c,result,details:points.map(p=>`${p.player} ${p.valid?p.points+'P':'?'}`).join(' + '),odds,net,units,source})
   }
   const lines:string[]=[];let total=0,pricedCount=0,unpriced=0,unverified=0
   for(const matchup of [...new Set(rows.map(r=>r.combo.matchup))]){
    const group=rows.filter(r=>r.combo.matchup===matchup);let subtotal=0
    const details=group.map(r=>{if(r.net!=null){subtotal+=r.net;total+=r.net;pricedCount++}else if(r.result==='UNVERIFIED')unverified++;else unpriced++
     return `${r.combo.team}: ${r.combo.players.map(p=>p+' 1P').join(' + ')} | ${r.result} | ${r.odds!=null?(r.odds>0?'+':'')+r.odds:'UNPRICED'} | ${r.net!=null?comboMoney(r.net*unitSize)+' ('+comboUnits(r.net)+')':'NOT INCLUDED'} | ${r.source} | ${r.combo.comboChanged?'COMBO CHANGED: '+(r.combo.changeNote||'Unspecified')+' | ':''}${r.details}`})
    lines.push(`${matchup} — ${comboMoney(subtotal*unitSize)} (${comboUnits(subtotal)})`,...details)
   }
   lines.push('TRIO VS SPLIT DUOS — HYPOTHETICAL VS ACTUAL (NOT ADDED TO DAILY P/L)')
   for(const row of rows.filter(r=>r.combo.players.length===3)){
    const trio=row.combo;const duos:[string,string][]=[[trio.players[0],trio.players[1]],[trio.players[0],trio.players[2]],[trio.players[1],trio.players[2]]]
    const pairResults=duos.map(pair=>{
     const wagers=bets.filter(b=>b.date===date&&b.category==='COMBOS'&&b.legs.length===2&&b.legs.every(l=>l.kind!=='TEAM'&&!l.voided&&l.qty===1&&l.stat==='Point'&&String(l.gameId)===String(trio.gameId))&&pair.every(p=>b.legs.some(l=>comboNameKey(l.player)===comboNameKey(p))))
     if(wagers.length!==1)return {pair,status:wagers.length?'AMBIGUOUS':'NOT BET',net:null as number|null,stake:0}
     const b=wagers[0],stake=b.units,price=b.odds??(b.payout!=null?americanFromReturn(b.units*b.unitSize,b.payout):undefined)
     if(price==null||!Number.isFinite(price)||Math.abs(price)<100)return {pair,status:'UNPRICED',net:null as number|null,stake}
     const box=boxMap.get(trio.gameId)!,outcome=pair.map(player=>{const matches=box.identities.filter(i=>comboNameKey(i.player)===comboNameKey(player));const ids=[...new Set(matches.map(i=>i.playerId))];return ids.length===1?box.stats[`${trio.gameId}:${ids[0]}`]?.points:undefined})
     if(outcome.some(p=>p==null))return {pair,status:'UNVERIFIED',net:null as number|null,stake}
     const hit=outcome.every(p=>Number(p)>=1),net=hit?stake*(price>0?price/100:100/Math.abs(price)):-stake
     return {pair,status:hit?'HIT':'MISS',net,stake}
    })
    const complete=pairResults.every(p=>p.net!=null)
    const pairNet=pairResults.reduce((n,p)=>n+(p.net??0),0),exposure=pairResults.reduce((n,p)=>n+p.stake,0)
    lines.push(`${trio.matchup} · ${trio.players.join(' + ')} | TRIO: ${row.net!=null?comboUnits(row.net):'UNPRICED / UNVERIFIED'} at ${row.units}u | SPLITS: ${complete?comboUnits(pairNet):'INCOMPLETE'} at ${exposure.toFixed(2)}u | EQUAL 1u SPLITS: ${complete&&exposure>0?comboUnits(pairNet/exposure):'INCOMPLETE'}`)
    for(const p of pairResults)lines.push(`  ${p.pair.join(' + ')} | ${p.status} | ${p.net!=null?comboUnits(p.net):'NOT COUNTED'} | ${p.stake.toFixed(2)}u staked`)
   }
   lines.push(`DAILY NET P/L — ${comboMoney(total*unitSize)} (${comboUnits(total)})`)
   lines.push(`PRICED + VERIFIED: ${pricedCount} | UNPRICED: ${unpriced} | UNVERIFIED: ${unverified}`)
   lines.push('Reference trio results are hypothetical and NEVER included in actual Bet Hub P/L. Multiple wager prices require explicit selection. Split pairs remain actual wagers.')
   if(!(unitSize>0))throw new Error('Set a positive unit size in Settings before printing dollar P/L.')
   const result=await window.nhlTracker.saveLineComboPdf({slateDate:date,title:'NHL TRACKER — END OF DAY COMBO PERFORMANCE',subtitle:`${date} · $${unitSize.toFixed(2)} PER UNIT · ${unpriced||unverified?'PARTIAL FINANCIAL COVERAGE':'ALL COMBOS PRICED AND VERIFIED'}`,lines})
   if(result?.error)throw new Error(result.error)
   if(!result?.cancelled){
    const verifiedRecords:ComboResultRecord[]=rows.map(r=>({key:r.combo.key,date:r.combo.date,gameId:r.combo.gameId,matchup:r.combo.matchup,team:r.combo.team,players:r.combo.players,status:r.combo.status,marketAvailability:r.combo.marketAvailability,comboChanged:r.combo.comboChanged,changeNote:r.combo.changeNote,result:r.result,odds:r.odds,book:r.combo.book||(/ · (.+)$/.exec(r.source)?.[1])||undefined,source:r.source,referenceUnits:r.units,net1u:r.odds!=null&&r.result!=='UNVERIFIED'?(r.result==='HIT'?(r.odds>0?r.odds/100:100/Math.abs(r.odds)):-1):undefined}))
    saveComboDayResults(date,verifiedRecords)
   }
   setComboReportMessage(result?.cancelled?'PDF save cancelled':`Report ready · ${comboUnits(total)} (${comboMoney(total*unitSize)}) · ${unpriced} unpriced · ${unverified} unverified`)
  }catch(e){setComboReportMessage(String(e))}finally{setEodBusy(false)}
 }
 const generateDailyComboReport = async ()=>{if(account?.role!=='DEV')return;setReportBusy(true);try{const orderedGames=[...games].sort((a:Game,b:Game)=>Date.parse(String(a.startTimeUTC||''))-Date.parse(String(b.startTimeUTC||''))||Number(a.id)-Number(b.id));const teams=[...new Set(orderedGames.flatMap((g:Game)=>[abbr(g.awayTeam),abbr(g.homeTeam)]).filter(t=>t&&t!=='???'))];if(!teams.length){window.alert('No games loaded for the selected slate.');return}const fetched=await Promise.allSettled(teams.map(team=>window.nhlTracker.dfoLines(team)));const teamLines=new Map<string,string[]>();let failures=0;for(let i=0;i<teams.length;i++){const r=fetched[i];if(r.status!=='fulfilled'){failures++;continue}const info=r.value;const entries:string[]=[];const ppOf=(n:string)=>info.pp1?.includes(n)?'PP1':info.pp2?.includes(n)?'PP2':'';for(const ln of info.forwardLines||[]){for(const pp of ['PP1','PP2']){const players=[...new Set<string>((ln as string[]).filter((n:string)=>ppOf(n)===pp))].sort((a,b)=>a.localeCompare(b));if(players.length<2)continue;const updated=dfoTime(info);const source=(info.source||'Daily Faceoff').replace(/\bLast Game\s*\([^)]*\)/gi,'Last Game');const confirmation=dfoConfirmed(info,date)?'CONFIRMED':'PROJECTED';entries.push(`${confirmation} - ${teams[i]} - ${players.map((n:string)=>n+' 1P').join(' + ')} - ${updated} - ${source}`)}}teamLines.set(teams[i],entries)}const lines:string[]=[];for(const game of orderedGames){const away=abbr(game.awayTeam),home=abbr(game.homeTeam);const entries=[...(teamLines.get(away)||[]),...(teamLines.get(home)||[])];if(!entries.length)continue;const start=game.startTimeUTC?new Date(game.startTimeUTC).toLocaleTimeString('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit',timeZoneName:'short'}):'Time TBD';lines.push(`${away} @ ${home} — ${start}`,...entries)}if(!lines.length){window.alert(`No qualifying line combos found for ${date}. ${failures} team lookups failed.`);return}const displayDate=new Date(date+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'});const result=await window.nhlTracker.saveLineComboPdf({slateDate:date,title:'NHL TRACKER — DAILY LINE COMBO REPORT',subtitle:displayDate.toUpperCase()+' · LINEUP STATUS BY SOURCE DATE · '+(failures?failures+' TEAM LOOKUPS FAILED':'DAILY FACEOFF'),lines});if(result?.error)window.alert('PDF export failed: '+result.error);else if(!result?.cancelled){const previous=new Map(readTrackedCombos(date).map(c=>[c.key,c]));const snapshot:TrackedCombo[]=[];for(const game of orderedGames){const away=abbr(game.awayTeam),home=abbr(game.homeTeam);for(const team of [away,home])for(const entry of teamLines.get(team)||[]){const match=/^(CONFIRMED|PROJECTED) - [A-Z]{2,3} - (.*?) - /.exec(entry);if(!match)continue;const players=match[2].split(' + ').map(v=>v.replace(/ 1P$/,'').trim());const key=`${game.id}:${team}:${players.map(comboNameKey).sort().join('|')}`;const old=previous.get(key);snapshot.push({key,date,gameId:Number(game.id),matchup:`${away} @ ${home}`,team,players,status:match[1],capturedAt:new Date().toISOString(),odds:old?.odds,book:old?.book,referenceUnits:old?.referenceUnits,referencePayout:old?.referencePayout})}}saveTrackedCombos(snapshot);setComboReportMessage(`Saved ${snapshot.length} qualifying combos for ${date}. Enter trio reference odds below.`)}}catch(err){window.alert('PDF export failed: '+String(err))}finally{setReportBusy(false)}}
 const [confidenceRevision,setConfidenceRevision]=useState(0)
 useEffect(()=>{if(!games.length)return;const captured=capturePredictions(date,games,abbr);const finalized=finalizePredictions(date,games,abbr);if(captured||finalized)setConfidenceRevision(v=>v+1)},[date,games])
 const[leagueStandings,setLeagueStandings]=useState<any[]>([]),[clubStats,setClubStats]=useState<Record<string,any>>({}),[legCompletions,setLegCompletions]=useState<Record<string,LegCompletion>>({});
 const[verificationEvents,setVerificationEvents]=useState<FeedEvent[]>([]),[verifyStatus,setVerifyStatus]=useState(''),[verifyGameStatus,setVerifyGameStatus]=useState<Record<string,string>>({}),[correctionPopup,setCorrectionPopup]=useState(''),[correctionReviews,setCorrectionReviews]=useState<CorrectionReview[]>(()=>JSON.parse(localStorage.getItem('correctionReviews')||'[]')),[correctionReviewOpen,setCorrectionReviewOpen]=useState(false);
 const[teamHistory,setTeamHistory]=useState<TeamGameResult[]>(()=>JSON.parse(localStorage.getItem('teamGameHistory')||'[]')),[verifiedDays,setVerifiedDays]=useState<VerifiedDay[]>(()=>JSON.parse(localStorage.getItem('verifiedDays')||'[]'));
 const [nightReminderDismissed,setNightReminderDismissed]=useState<string[]>([]);
 const nightVerified=verifiedDays.some(v=>v.date===date);
 const nightAllFinal=games.length>0&&games.every(g=>['FINAL','OFF'].includes(String(g.gameState)));
 const nightReminderEligible=!nightVerified&&(nightAllFinal||date<localDate());
 const nightReminderVisible=nightReminderEligible&&!nightReminderDismissed.includes(date);

 const[splitPairUnits,setSplitPairUnits]=useState(()=>{const n=Number(localStorage.getItem('splitPairUnits')??'1');return Number.isFinite(n)&&n>0?n:1}),[unitSize,setUnitSize]=useState(()=>Number(localStorage.getItem('unitSize')??'0')),[bets,setBets]=useState<Bet[]>(()=>{const raw:Bet[]=isTestMode?[]:JSON.parse(localStorage.getItem('bets')||'[]');
 // One-time cleanup explicitly requested by the user. Preserve both September
 // wagers and their historical financial settlement; remove only bad 27 legs.
 // Preserve a full pre-cleanup localStorage snapshot before changing anything.
 const cleanupKey='nhlTracker:identityCleanup:2026-10-15:v1';
 const needsCleanup=raw.some(b=>b.id==='20261012-BF39BD3D'||(['20260929-6FE7465F','20260929-BA24BEDE'].includes(b.id)&&b.legs.some(l=>l.player==='27'&&String(l.stat)==='27')));
 if(needsCleanup&&!localStorage.getItem(cleanupKey)){
  const backupKey='nhlTracker:identityCleanupBackup:2026-10-15';
  if(!localStorage.getItem(backupKey))localStorage.setItem(backupKey,JSON.stringify(raw));
  localStorage.setItem(cleanupKey,'backed-up');
 }
 const cleaned=localStorage.getItem(cleanupKey)?raw.filter(b=>b.id!=='20261012-BF39BD3D').map(b=>
  ['20260929-6FE7465F','20260929-BA24BEDE'].includes(b.id)
   ? {...b,legs:b.legs.filter(l=>!(l.player==='27'&&String(l.stat)==='27'))}
   : b):raw;
 const seen=new Set<string>();return cleaned.filter(b=>{if(seen.has(b.id))return false;seen.add(b.id);return true})}),[feedPrefs,setFeedPrefs]=useState<Record<FeedType,boolean>>(()=>({...DEFAULT_FEED_PREFS,...JSON.parse(localStorage.getItem('feedPrefs')||'{}')})),[desktopPrefs,setDesktopPrefs]=useState<Record<FeedType,boolean>>(()=>({...DEFAULT_DESKTOP_PREFS,...JSON.parse(localStorage.getItem('desktopPrefs')||'{}')})),[soundPrefs,setSoundPrefs]=useState<Record<FeedType,boolean>>(()=>({...DEFAULT_SOUND_PREFS,...JSON.parse(localStorage.getItem('soundPrefs')||'{}')})),[desktopMaster,setDesktopMaster]=useState(()=>localStorage.getItem('desktopMaster')!=='false'),[soundMaster,setSoundMaster]=useState(()=>localStorage.getItem('soundMaster')!=='false'),[soundVolume,setSoundVolume]=useState(()=>Number(localStorage.getItem('soundVolume')||'.35')),[eventVolumes,setEventVolumes]=useState<Record<FeedType,number>>(()=>({...Object.fromEntries(FEED_TYPES.map(t=>[t,1])) as Record<FeedType,number>,...JSON.parse(localStorage.getItem('eventVolumes')||'{}')}))
 useEffect(()=>{if(linkWagers(bets,readPredictions()))setConfidenceRevision(v=>v+1)},[bets,confidenceRevision])
 const [slateDfo,setSlateDfo]=useState<Record<string,any>>({});
 const [lineupSnapshotRevision,setLineupSnapshotRevision]=useState(0);
 const lineupAlerts=useMemo(()=>{
  const output:Record<string,{ids:string[];pairs:{a:string;b:string;units:string[];betId:string}[];projected:any;confirmed:any}>={};
  const teamGames=new Map<string,string>();
  games.forEach((g:Game)=>{teamGames.set(abbr(g.awayTeam),String(g.id));teamGames.set(abbr(g.homeTeam),String(g.id))});
  for(const team of teamGames.keys()){
   const record=readDfoSnapshot(date,team);
   const projected=record?.firstProjected,confirmed=record?.confirmed;
   if(!projected||!confirmed||projected.fingerprint===confirmed.fingerprint)continue;
   const pairs:{a:string;b:string;units:string[];betId:string}[]=[];
   const ids:string[]=[];
   for(const b of bets){
    if(b.date!==date||(b.status||'PENDING')!=='PENDING')continue;
    const legs=b.legs.filter(l=>!l.voided&&l.kind!=='TEAM'&&l.player&&String(l.gameId||'')===teamGames.get(team)&&(!l.team||l.team===team));
    if(legs.length<2)continue;
    let impacted=false;
    for(let i=0;i<legs.length;i++)for(let j=i+1;j<legs.length;j++){
     const units=brokenDfoUnits(projected,confirmed,legs[i].player,legs[j].player);
     if(units.length){pairs.push({a:legs[i].player,b:legs[j].player,units,betId:b.id});impacted=true}
    }
    if(impacted)ids.push(b.id);
   }
   if(ids.length)output[team]={ids,pairs,projected,confirmed};
  }
  return output;
 },[date,games,bets,lineupSnapshotRevision]);
 const [lineCheckBusy,setLineCheckBusy]=useState(false);
 const [lineCheckLast,setLineCheckLast]=useState<string>('');
 const [lineCheckError,setLineCheckError]=useState<string>('');
 const lineCheckRef=useRef(false);
 const checkSlateLines=async()=>{
  if(lineCheckRef.current)return;
  const teams=[...new Set(games.filter(g=>['FUT','PRE'].includes(String(g.gameState||''))).flatMap(g=>[abbr(g.awayTeam),abbr(g.homeTeam)]).filter(t=>t&&t!=='???'))];
  if(!teams.length)return;
  lineCheckRef.current=true;setLineCheckBusy(true);setLineCheckError('');
  try{
   const responses=await Promise.allSettled(teams.map(team=>window.nhlTracker.dfoLines(team)));
   const successes=responses.filter(r=>r.status==='fulfilled').length;
   setSlateDfo(previous=>{
    const next={...previous};
    responses.forEach((r,i)=>{if(r.status==='fulfilled'){next[teams[i]]=r.value;captureDfoSnapshot(date,teams[i],r.value,dfoConfirmed(r.value,date))}});
    return next;
   });
   if(successes)setLineupSnapshotRevision(v=>v+1);
   const failed=responses.length-successes;
   setLineCheckError(failed?`${failed} team${failed===1?'':'s'} could not be checked`:'');
   if(successes)setLineCheckLast(new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}));
  }finally{lineCheckRef.current=false;setLineCheckBusy(false)}
 };

 useEffect(()=>{setLineCheckLast('');setLineCheckError('')},[date]);
 const lineupGamesRef=useRef(games);lineupGamesRef.current=games;
 const pregameTeamKey=games.filter(g=>['FUT','PRE'].includes(String(g.gameState||''))).flatMap(g=>[abbr(g.awayTeam),abbr(g.homeTeam)]).filter(Boolean).sort().join(',');
 useEffect(()=>{let alive=true;let busy=false;setSlateDfo({});const teams=pregameTeamKey.split(',').filter(Boolean);if(!teams.length)return;
 const lastChecked=new Map<string,number>();
 const refresh=async()=>{if(busy||!alive)return;
  const now=Date.now();
  const due=teams.filter(team=>{
   const record=readDfoSnapshot(date,team);
   if(record?.confirmed)return false;
   const game=lineupGamesRef.current.find(g=>abbr(g.awayTeam)===team||abbr(g.homeTeam)===team);
   if(!game||!['FUT','PRE'].includes(String(game.gameState||'')))return false;
   const start=Date.parse(String(game.startTimeUTC||''));
   const cadence=Number.isFinite(start)&&start-now<=3600000?300000:1800000;
   return now-(lastChecked.get(team)||0)>=cadence;
  });
  if(!due.length)return;
  busy=true;due.forEach(t=>lastChecked.set(t,now));
  try{const responses=await Promise.allSettled(due.map(team=>window.nhlTracker.dfoLines(team)));
   if(alive){setSlateDfo(previous=>{const next={...previous};responses.forEach((r,i)=>{if(r.status==='fulfilled'){next[due[i]]=r.value;captureDfoSnapshot(date,due[i],r.value,dfoConfirmed(r.value,date))}});return next});
    if(responses.some(r=>r.status==='fulfilled'))setLineupSnapshotRevision(v=>v+1);
   }
  }finally{busy=false}
 };
 refresh();const interval=window.setInterval(refresh,60000);return()=>{alive=false;window.clearInterval(interval)}
 },[date,pregameTeamKey]);
 const detectedOrderRef=useRef<Record<string,number>>(loadDetectedEvents(date)); const gameStateRef=useRef<Record<string,string>>({}); const hitDetectedRef=useRef<Record<string,number>>({}); const hitSequenceRef=useRef(0); const notifiedRef=useRef<Set<string>>(new Set()); const notificationPrimedRef=useRef(false);
 void hitDetectedRef; void hitSequenceRef;
 const[replayGame,setReplayGame]=useState<Game|null>(null),[replayEvents,setReplayEvents]=useState<FeedEvent[]>([]),[replayIndex,setReplayIndex]=useState(0),[replayRunning,setReplayRunning]=useState(false),[replaySpeed,setReplaySpeed]=useState(1200);const replayTimer=useRef<number|null>(null)
 void setReplaySpeed;

 // Populate a permanent local NHL identity index from all 32 team rosters.
 // Existing verified IDs are never changed, and roster failures leave the cache intact.
 useEffect(()=>{let active=true;
  void syncPlayerDb((team)=>window.nhlTracker.roster(team),ALL_TEAMS).then(()=>{
   if(!active)return;
   setBets(old=>{let changed=false;const next=old.map(b=>{
    if(b.date<BACKFILL_FIRST_DATE)return b;
    let repaired=false;
    const legs=b.legs.map(l=>{
     if(l.kind==='TEAM'||Number(l.playerId)>0)return l;
     const id=resolvePlayerId(l.player,l.team);
     if(!id)return l;
     repaired=true;return {...l,playerId:id};
    });
    if(!repaired)return b;changed=true;return {...b,legs};
   });return changed?next:old});
  }).catch(e=>console.warn('Player database sync deferred',e));
  return()=>{active=false};
 },[]);
 const backfillAttemptRef=useRef<{signature:string;at:number}>({signature:'',at:0});
 // Recover missing player identities quietly. Existing IDs are immutable. A saved
 // same-game identity is sufficient; otherwise use game boxscore and both teams'
 // season rosters. Re-run after imports or later data updates, without network
 // calls for bets whose identities are already resolved.
 useEffect(()=>{
  let cancelled=false;
  async function repair(){
   const targets=bets.filter(b=>b.date>=BACKFILL_FIRST_DATE&&b.legs?.some(l=>l.kind!=='TEAM'&&['Point','Goal','Assist','Shot'].includes(String(l.stat))&&!Number(l.playerId)));
   if(!targets.length)return;
   // Recover trusted player IDs from ALL saved wagers, not just the same game.
   // A unique NHL player identity is stable across teams and game dates.
   const knownIds=new Map<string,Set<number>>();
   for(const bet of bets)for(const leg of bet.legs||[]){
    if(leg.kind==='TEAM'||!Number.isInteger(Number(leg.playerId))||Number(leg.playerId)<=0)continue;
    const key=playerIdentityKey(leg.player);
    if(!key)continue;
    if(!knownIds.has(key))knownIds.set(key,new Set());
    knownIds.get(key)!.add(Number(leg.playerId));
   }
   const locallyRepairable=targets.some(b=>b.legs.some(l=>l.kind!=='TEAM'&&!Number(l.playerId)&&(
    knownIds.get(playerIdentityKey(l.player))?.size===1||!!resolvePlayerId(l.player,l.team))));
   if(locallyRepairable){
    setBets(old=>old.map(b=>{
     if(b.date<BACKFILL_FIRST_DATE)return b;
     let changed=false;
     const legs=b.legs.map(l=>{
      if(l.kind==='TEAM'||Number(l.playerId)>0)return l;
      const ids=knownIds.get(playerIdentityKey(l.player));
      const id=ids?.size===1?[...ids][0]:resolvePlayerId(l.player,l.team);
      if(!id)return l;
      changed=true;return {...l,playerId:id};
     });
     return changed?{...b,legs}:b;
    }));
    return; // Next render handles only the unresolved legs via roster fallback.
   }
   const signature=targets.flatMap(b=>b.legs.filter(l=>l.kind!=='TEAM'&&!Number(l.playerId)).map(l=>`${b.id}:${b.date}:${l.gameId||''}:${backfillIdentityKey(l.player)}`)).sort().join('|');
   const last=backfillAttemptRef.current;
   if(last.signature===signature&&Date.now()-last.at<30*60*1000)return;
   backfillAttemptRef.current={signature,at:Date.now()};
   const saved=new Map<string,Identity[]>();
   for(const b of bets)for(const l of b.legs||[]){
    if(l.kind==='TEAM'||!l.gameId||!Number.isInteger(Number(l.playerId))||Number(l.playerId)<=0)continue;
    const gameId=String(l.gameId),list=saved.get(gameId)||[];
    list.push({playerId:Number(l.playerId),player:l.player,gameId});saved.set(gameId,list);
   }
   const missingDates=[...new Set(targets.filter(b=>b.legs.some(l=>l.kind!=='TEAM'&&!Number(l.playerId)&&!l.gameId)).map(b=>b.date))];
   const dateGames=new Map<string,Game[]>();
   for(const d of missingDates){try{const result=await window.nhlTracker.score(d);dateGames.set(d,(result?.games||[]) as Game[])}catch{}if(cancelled)return}
   const gameIds=new Set<string>();
   for(const b of targets)for(const l of b.legs){if(l.kind==='TEAM'||Number(l.playerId)>0)continue;
    if(l.gameId)gameIds.add(String(l.gameId));else for(const g of dateGames.get(b.date)||[])gameIds.add(String(g.id));
   }
   const identities=new Map(saved);
   // Reuse the normal Add Bet roster cache for this date. This avoids waiting
   // for a FUT game's boxscore and uses the same IDs already offered by search.
   for(const b of targets){
    let cached:any[]=[];
    try{cached=JSON.parse(localStorage.getItem(`roster:${b.date}`)||'[]')}catch{}
    for(const p of cached){
     const gameId=String(p.gameId||'');
     if(!gameId||!Number.isInteger(Number(p.id))||Number(p.id)<=0||!p.name)continue;
     const list=identities.get(gameId)||[];
     list.push({playerId:Number(p.id),player:String(p.name),gameId});
     identities.set(gameId,list);
    }
   }
   // The current slate is useful for resolving FUT/PRE games where the NHL
   // boxscore legitimately contains no playerByGameStats yet.
   const slateById=new Map(games.map(g=>[String(g.id),g]));
   const rosterCache=new Map<string,Identity[]>();
   for(const gameId of gameIds){
    if(cancelled)return;
    let list=[...(identities.get(gameId)||[])];
    try{list.push(...backfillGamePlayers(await window.nhlTracker.boxscore(Number(gameId)),gameId))}catch{}
    let game=slateById.get(gameId);
    if(!game){for(const dayGames of dateGames.values()){game=dayGames.find(g=>String(g.id)===gameId);if(game)break}}
    if(!game){const related=targets.find(b=>b.legs.some(l=>String(l.gameId||'')===gameId));if(related){
     try{const result=await window.nhlTracker.score(related.date);game=(result?.games||[]).find((g:Game)=>String(g.id)===gameId)}catch{}
    }}
    if(game){for(const team of [abbr(game.awayTeam),abbr(game.homeTeam)]){
     if(!team||team==='???')continue;
     if(!rosterCache.has(team)){
      try{const roster=await window.nhlTracker.roster(team);rosterCache.set(team,backfillRosterPlayers(roster,gameId));addPlayerIdentities(rosterEntries(roster,team))}catch{rosterCache.set(team,[])}
     }
     list.push(...(rosterCache.get(team)||[]).map(p=>({...p,gameId})));
    }}
    identities.set(gameId,list);
   }
   if(cancelled)return;
   setBets(old=>{
    let changed=false;
    const next=old.map(b=>{
     if(b.date<BACKFILL_FIRST_DATE)return b;
     let repaired=false;
     const legs=b.legs.map(l=>{
      if(l.kind==='TEAM'||Number(l.playerId)>0)return l;
      const ids=l.gameId?[String(l.gameId)]:(dateGames.get(b.date)||[]).map(g=>String(g.id));
      const matches=ids.map(id=>uniqueIdentity(identities.get(id)||[],l.player)).filter(Boolean) as Identity[];
      if(matches.length!==1)return l;
      repaired=true;return {...l,playerId:matches[0].playerId,gameId:matches[0].gameId};
     });
     if(!repaired)return b;
     changed=true;return {...b,legs};
    });
    return changed?next:old;
   });
  }
  void repair().catch(e=>console.warn('Player ID background recovery deferred',e));
  return()=>{cancelled=true};
 },[bets,games]);
 useEffect(()=>{
  addPlayerIdentities(bets.flatMap(b=>b.legs.filter(l=>l.kind!=='TEAM'&&Number(l.playerId)>0).map(l=>({id:Number(l.playerId),name:l.player,team:l.team||''}))));
 },[bets]);
 // Never implicitly upload a previous account's localStorage data. TEST server is authoritative.
 useEffect(()=>{
  if(account?.role!=='DEV'){devSyncRef.current.ready=false;return}
  let cancelled=false
  devSyncRef.current.ready=false
  devLoadedRef.current=false
  devAccountSwitchRef.current=true
  const devUnitKey='nhlTracker:devUnitSize:'+account.username
  const storedDevUnit=Number(localStorage.getItem(devUnitKey)??'10')
  setUnitSize(Number.isFinite(storedDevUnit)&&storedDevUnit>0?storedDevUnit:10)
  setDevSync('Loading TEST server bets…')
  ;(async()=>{
   const r=await (window.nhlTracker as any).devBetsRequest({method:'GET'})
   if(cancelled)return
   if(r.error){setDevSync(r.error);return}
   const incoming=Array.isArray(r.bets)?r.bets:[]
   devSyncRef.current={ready:true,revision:Number(r.revision||0),last:JSON.stringify(incoming),busy:false,account:account.username}
   devPendingRef.current=false
   devLoadedRef.current=true
   setBets(incoming)
   setDevSync(`Server connected · ${incoming.length} TEST bets`)
  })()
  return ()=>{cancelled=true;devSyncRef.current.ready=false;devLoadedRef.current=false}
 },[account?.username,account?.role])
 useEffect(()=>{
  if(account?.role!=='DEV'||!devLoadedRef.current||!devSyncRef.current.ready||devSyncRef.current.account!==account.username)return
  const snapshot=JSON.stringify(bets)
  if(snapshot===devSyncRef.current.last){devPendingRef.current=false;return}
  devPendingRef.current=true
  // Never discard edits made during an in-flight request; retry after it finishes.
  if(devSyncRef.current.busy)return
  const timer=setTimeout(async()=>{
   const state=devSyncRef.current
   if(!state.ready||state.busy||state.account!==account.username)return
   state.busy=true;setDevSync('Saving TEST bets to server…')
   let result:any
   try{result=await (window.nhlTracker as any).devBetsRequest({method:'PUT',bets,revision:state.revision})}
   catch(e){result={error:String(e)}}
   state.busy=false
   if(result.error){state.ready=false;setDevSync(`Sync stopped: ${result.error}. Your local DEV backup is retained. Do not sign out.`);return}
   state.revision=Number(result.revision);state.last=snapshot
   devPendingRef.current=false
   setDevSync(`Server saved · ${bets.length} TEST bets`)
   setDevSyncTick(v=>v+1)
  },850)
  return ()=>clearTimeout(timer)
 },[bets,account?.username,account?.role,devSyncTick])
 const clearDevBets=async()=>{
  if(account?.role!=='DEV'||devClearText!=='CLEAR DEV'||devClearing)return
  if(devPendingRef.current||devSyncRef.current.busy||!devSyncRef.current.ready){window.alert('Wait until all TEST bets are saved before clearing.');return}
  if(!window.confirm('Permanently delete all DEV wagers from the TEST server? LIVE data is not affected.'))return
  devSyncRef.current.ready=false;setDevClearing(true)
  const r=await (window.nhlTracker as any).devBetsRequest({method:'DELETE',confirm:'CLEAR DEV'})
  if(r.error){setDevSync(`Clear failed: ${r.error}`)}
  else{setBets([]);localStorage.removeItem('nhlTracker:devBetsCache:'+account.username);devSyncRef.current={ready:true,revision:0,last:'[]',busy:false,account:account.username};setDevSync('TEST bets cleared on server · LIVE unchanged');setDevClearText('')}
  setDevClearing(false)
 }


 useEffect(()=>{const verified:VerifiedDay[]=JSON.parse(localStorage.getItem('verifiedDays')||'[]');if(!verified.some(v=>v.date===date))localStorage.setItem('activeSlateDate',date)},[]);useEffect(()=>localStorage.setItem('hiddenTeams',JSON.stringify(hidden)),[hidden]);useEffect(()=>{if(devAccountSwitchRef.current){devAccountSwitchRef.current=false;return}if(account?.role==='DEV'){if(devLoadedRef.current)localStorage.setItem('nhlTracker:devUnitSize:'+account.username,String(unitSize))}else if(!account)localStorage.setItem('unitSize',String(unitSize))},[unitSize,account?.role,account?.username]);useEffect(()=>localStorage.setItem('splitPairUnits',String(splitPairUnits)),[splitPairUnits]);useEffect(()=>{if(account?.role==='DEV'){if(devLoadedRef.current)localStorage.setItem('nhlTracker:devBetsCache:'+account.username,JSON.stringify(bets))}else if(!account)localStorage.setItem('bets',JSON.stringify(bets))},[bets,account?.role,account?.username]);useEffect(()=>localStorage.setItem('feedPrefs',JSON.stringify(feedPrefs)),[feedPrefs]);useEffect(()=>localStorage.setItem('desktopPrefs',JSON.stringify(desktopPrefs)),[desktopPrefs]);useEffect(()=>localStorage.setItem('soundPrefs',JSON.stringify(soundPrefs)),[soundPrefs]);useEffect(()=>localStorage.setItem('desktopMaster',String(desktopMaster)),[desktopMaster]);useEffect(()=>localStorage.setItem('soundMaster',String(soundMaster)),[soundMaster]);useEffect(()=>localStorage.setItem('soundVolume',String(soundVolume)),[soundVolume]);useEffect(()=>localStorage.setItem('eventVolumes',JSON.stringify(eventVolumes)),[eventVolumes]);useEffect(()=>localStorage.setItem('teamGameHistory',JSON.stringify(teamHistory)),[teamHistory]);useEffect(()=>localStorage.setItem('verifiedDays',JSON.stringify(verifiedDays)),[verifiedDays]);useEffect(()=>localStorage.setItem('correctionReviews',JSON.stringify(correctionReviews)),[correctionReviews]);useEffect(()=>{setEvents([]);setReplayGame(null);setReplayEvents([]);setReplayIndex(0);setReplayRunning(false)},[date])
 useEffect(()=>{let alive=true;async function loadLeague(){try{const st=await window.nhlTracker.standings();if(!alive)return;setLeagueStandings(st?.standings||[]);const teams=[...new Set((st?.standings||[]).map((x:any)=>x.teamAbbrev?.default||x.teamAbbrev).filter(Boolean))] as string[];const pairs=await Promise.all(teams.map(async t=>{try{return[t,await window.nhlTracker.clubStats(t)] as const}catch{return[t,null] as const}}));if(alive)setClubStats(Object.fromEntries(pairs))}catch{}}loadLeague();return()=>{alive=false}},[])
 useEffect(()=>{detectedOrderRef.current=loadDetectedEvents(date);gameStateRef.current={}},[date]);
 useEffect(()=>{let alive=true;let primed=false;async function refresh(){try{const data=await window.nhlTracker.score(date);const gs=(data.games||[])as Game[];if(!alive)return;const collected:FeedEvent[]=[];const stats:LiveStats={};const completions:Record<string,LegCompletion>={};await Promise.all(gs.map(async g=>{try{const [landing,box,pbp]=await Promise.all([window.nhlTracker.landing(g.id),window.nhlTracker.boxscore(g.id),window.nhlTracker.playByPlay(g.id)]);const stateCandidates=[String(g?.gameState||''),String(landing?.gameState||landing?.game?.gameState||''),String(box?.gameState||box?.game?.gameState||'')].filter(Boolean);const liveState=stateCandidates.find(x=>['LIVE','CRIT'].includes(x));const finalVotes=stateCandidates.filter(x=>['FINAL','OFF'].includes(x)).length;if(liveState)g.gameState=liveState;else if(['FINAL','OFF'].includes(String(g?.gameState||''))&&finalVotes<2)g.gameState='SYNCING';const liveSituation=[...(pbp?.plays||[])].reverse().map((p:any)=>String(p?.situationCode||'')).find((x:string)=>x.length===4);if(liveSituation)g.situationCode=liveSituation;const pbpPlays=(pbp?.plays||[]) as any[];let trackerIntermissionPeriod=0;for(let pi=pbpPlays.length-1;pi>=0;pi--){const pp=pbpPlays[pi];const pn=Number(pp?.periodDescriptor?.number)||0;const key=String(pp?.typeDescKey||'');if((key==='period-end'||key==='period-end-cl')&&(pn===1||pn===2)){const nextPeriodStarted=pbpPlays.slice(pi+1).some((x:any)=>Number(x?.periodDescriptor?.number)===pn+1&&String(x?.typeDescKey||'')==='faceoff');if(!nextPeriodStarted)trackerIntermissionPeriod=pn;break}if(pn>=3||['FINAL','OFF'].includes(String(g.gameState||'')))break}g._trackerIntermissionPeriod=trackerIntermissionPeriod;if(trackerIntermissionPeriod){const syncSeconds=clockToSeconds(String(g?.clock?.timeRemaining||''));if(syncSeconds>0&&syncSeconds<=25*60)g._trackerIntermissionSyncSeconds=syncSeconds}collected.push(...parseLandingGoals(landing,g,pbp),...parsePowerPlays(pbp,g),...parseIntermissions(pbp,g),...parsePeriodStarts(pbp,g));Object.assign(completions,playerLegCompletionMap(pbp,g));Object.assign(stats,flattenBoxscore(box,g.id));if(['FINAL','OFF'].includes(g.gameState))collected.push({id:`${g.id}-final`,gameId:g.id,team:abbr(g.homeTeam),opponent:abbr(g.awayTeam),type:'FINAL',title:'FINAL',detail:`${abbr(g.awayTeam)} ${g.awayTeam?.score} – ${abbr(g.homeTeam)} ${g.homeTeam?.score}`,meta:'Game complete',sort:999999})}catch{}}));if(alive)setGames(previous=>{const previousById=new Map(previous.map(pg=>[pg.id,pg]));return gs.map(ng=>{const pg=previousById.get(ng.id) as any;if(!pg)return ng;const next:any={...ng};if(!next.situationCode&&pg.situationCode)next.situationCode=pg.situationCode;if(next._trackerIntermissionPeriod==null&&pg._trackerIntermissionPeriod!=null)next._trackerIntermissionPeriod=pg._trackerIntermissionPeriod;return next})});const now=Date.now();const known=detectedOrderRef.current;for(const g of gs){const key=String(g.id),prev=gameStateRef.current[key],next=String(g.gameState||'');if(primed&&['FUT','PRE'].includes(prev)&&['LIVE','CRIT'].includes(next)){collected.push({id:`${g.id}-game-start`,gameId:g.id,team:abbr(g.homeTeam),opponent:abbr(g.awayTeam),type:'GAME START',title:`${abbr(g.awayTeam)} @ ${abbr(g.homeTeam)}`,detail:'Puck dropped · game is live',meta:'Game start',sort:now})}gameStateRef.current[key]=next}const initialSnapshot=!primed;primed=true;let observationChanged=false;for(const e of collected){if(known[e.id]==null){known[e.id]=initialSnapshot?-1:now;observationChanged=true}if(known[e.id]===-1){e.sort=Math.min(999999999999,Math.max(0,e.sort));if(!e.meta.includes('HIST'))e.meta+=' · HIST'}else e.sort=known[e.id]}if(observationChanged){try{localStorage.setItem('nhlTrackerObservedEvents:'+date,JSON.stringify(known))}catch{}}if(alive){setEvents(previous=>{const merged=new Map<string,FeedEvent>();for(const e of previous)merged.set(e.id,e);for(const e of collected)merged.set(e.id,e);return[...merged.values()].sort((a,b)=>(b.sort||0)-(a.sort||0))});setLiveStats(stats);setLegCompletions(completions);setStatus(`LIVE ENGINE · ${gs.length} games`)}}catch(err:any){if(alive)setStatus(`Connection error · ${err?.message||'Unknown error'}`)}}refresh();const timer=setInterval(refresh,3000);return()=>{alive=false;clearInterval(timer)}},[date])
 async function loadReplay(g:Game){setReplayRunning(false);setReplayIndex(0);setReplayGame(g);try{const landing=await window.nhlTracker.landing(g.id);const p=parseLandingGoals(landing,g).sort((a,b)=>a.sort-b.sort);p.forEach((e,i)=>e.sequence=i+1);setReplayEvents(p)}catch{setReplayEvents([])}}
 void loadReplay;
 useEffect(()=>{if(!replayRunning||replayIndex>=replayEvents.length){if(replayIndex>=replayEvents.length)setReplayRunning(false);return}replayTimer.current=window.setTimeout(()=>setReplayIndex(i=>i+1),replaySpeed);return()=>{if(replayTimer.current)window.clearTimeout(replayTimer.current)}},[replayRunning,replayIndex,replayEvents.length,replaySpeed])
 useEffect(()=>{if(!games.length)return;setBets((old:Bet[])=>{let changed=false;const next=old.map(b=>{if(b.date!==date)return b;const nextStatus=authoritativeBetStatus(b,liveStats,games);if(nextStatus==='PENDING'){
  if(b.status!=='WON'&&b.status!=='LOST')return b;
  // A previously settled win can become pending after a live NHL scoring correction.
  // Do not reopen wagers unless every active player leg has fresh, rostered boxscore evidence.
  const playerLegs=b.legs.filter(l=>!l.voided&&l.kind!=='TEAM');
  if(!playerLegs.length||!playerLegs.every(l=>l.playerId&&l.gameId&&liveStats[`${l.gameId}:${l.playerId}`]?.rostered))return b;
  changed=true;
  return {...b,status:'PENDING' as BetStatus,settledAt:undefined,hitAt:undefined,verifiedAt:undefined,regradeNote:`NHL stat correction · ${b.status} → PENDING · payout removed pending regrade`};
 }
 const settledNow=new Date().toISOString();let derivedHit=b.hitAt;if(nextStatus==='WON'&&!derivedHit){const active=b.legs.filter(l=>!l.voided);const moments=active.map(l=>l.kind==='TEAM'?null:(l.playerId&&l.gameId?legCompletions[`${l.gameId}:${l.playerId}:${l.stat}:${l.qty}`]:null)).filter(Boolean) as LegCompletion[];if(moments.length===active.filter(l=>l.kind!=='TEAM').length&&moments.length)derivedHit=moments.reduce((a,m)=>m.sort>a.sort?m:a,moments[0]).at}const sameStatus=(b.status||'PENDING')===nextStatus;if(sameStatus&&(nextStatus!=='WON'||b.hitAt||!derivedHit))return b;changed=true;if(nextStatus==='VOID')return{...b,status:nextStatus,settledAt:b.settledAt||settledNow,payout:b.units*b.unitSize,regradeNote:'FULL WAGER VOID · original stake refunded · 0.00u P/L'};return{...b,status:nextStatus,hitAt:nextStatus==='WON'?(b.hitAt||derivedHit):b.hitAt,settledAt:b.settledAt||settledNow,regradeNote:undefined}});return changed?next:old})},[games,liveStats,legCompletions,date])
 useEffect(()=>{const finals=games.filter(g=>['FINAL','OFF'].includes(g.gameState)&&Number.isFinite(Number(g.awayTeam?.score))&&Number.isFinite(Number(g.homeTeam?.score)));if(!finals.length)return;setTeamHistory(old=>{const seen=new Set(old.map(x=>`${x.gameId}:${x.team}`));const add:TeamGameResult[]=[];for(const g of finals){const away=abbr(g.awayTeam),home=abbr(g.homeTeam),as=Number(g.awayTeam.score),hs=Number(g.homeTeam.score);if(!seen.has(`${g.id}:${away}`))add.push({date,gameId:g.id,team:away,opponent:home,gf:as,ga:hs,home:false});if(!seen.has(`${g.id}:${home}`))add.push({date,gameId:g.id,team:home,opponent:away,gf:hs,ga:as,home:true})}return add.length?[...old,...add]:old})},[games,date])
 async function verifyGame(gameId:number){
  const id=String(gameId);setVerifyGameStatus(x=>({...x,[id]:'VERIFYING…'}));
  try{
   // Preserve the pre-refresh snapshot before touching liveStats. This is the evidence used by VIEW ADJUSTMENT.
   const beforeStats={...liveStats};
   const box=await window.nhlTracker.boxscore(gameId);const fresh=flattenBoxscore(box,gameId);const identities=new Map<string,{playerId:number;player:string;gameId:string}[]>();identities.set(id,boxscoreIdentities(box,gameId));
   const affected=bets.filter(b=>b.legs.some(l=>String(l.gameId||'')===id));const beforeStatuses=new Map(affected.map(b=>[b.id,(b.status||'PENDING') as BetStatus]));
   const compositeStats={...beforeStats,...fresh}; // Refresh ONLY this game; retain verified stats from every other leg/game.
   const score=await window.nhlTracker.score(date).catch(()=>null);const scoreGames=((score?.games||[]) as Game[]);const compositeGames=games.map(g=>scoreGames.find(x=>String(x.id)===String(g.id))||g);
   for(const g of scoreGames)if(!compositeGames.some(x=>String(x.id)===String(g.id)))compositeGames.push(g);
   let changedPlayers=0;for(const [k,v] of Object.entries(fresh)){const old=beforeStats[k];if(!old||old.goals!==v.goals||old.assists!==v.assists||old.points!==v.points||old.shots!==v.shots)changedPlayers++}
   setLiveStats(compositeStats);setGames(compositeGames);
   // Regrade against the newly fetched NHL boxscore immediately, including settled wins.
   // This prevents a stale green win/payout surviving UPDATE STATS.
   setBets(old=>old.map(original=>{
    if(!original.legs.some(l=>String(l.gameId||'')===id))return original;
    const b=reconcileBetPlayerIds(original,identities);
    const next=authoritativeBetStatus(b,compositeStats,compositeGames);
    const previous=b.status||'PENDING';
    if(next===previous)return b;
    if(next==='PENDING'){
     const playerLegs=b.legs.filter(l=>!l.voided&&l.kind!=='TEAM');
     if(!playerLegs.length||!playerLegs.every(l=>l.playerId&&l.gameId&&compositeStats[`${l.gameId}:${l.playerId}`]?.rostered))return b;
    }
    return {...b,status:next,settledAt:next==='PENDING'?undefined:(b.settledAt||new Date().toISOString()),
      hitAt:next==='WON'?b.hitAt:undefined,verifiedAt:undefined,
      regradeNote:`NHL stat re-check · ${previous} → ${next}${next==='PENDING'?' · payout removed':''}`};
   }));
   const refreshedGame=scoreGames.find(x=>String(x.id)===id)||games.find(x=>String(x.id)===id);const isFinalVerification=['FINAL','OFF'].includes(String(refreshedGame?.gameState||''));
   let sportsbookConflicts=0;const reviewUpdates:CorrectionReview[]=[];
   for(const b of affected){const reconciled=reconcileBetPlayerIds(b,identities);const official=authoritativeBetStatus(reconciled,compositeStats,compositeGames);const settled=beforeStatuses.get(b.id)||'PENDING';const deltas:StatDelta[]=[];
    for(const l of reconciled.legs){if(l.kind==='TEAM'||!l.playerId||String(l.gameId||'')!==id)continue;const key=`${id}:${l.playerId}`;const before=beforeStats[key],after=fresh[key];if(!before||!after)continue;const field=l.stat==='Goal'?'goals':l.stat==='Assist'?'assists':l.stat==='Point'?'points':'shots';const a=Number((before as any)[field]||0),z=Number((after as any)[field]||0);if(a!==z)deltas.push({gameId,player:l.player,stat:l.stat,before:a,after:z,threshold:l.qty,beforeHit:a>=l.qty,afterHit:z>=l.qty})}
    if(isFinalVerification){
     if(settled!=='PENDING'&&official!==settled){sportsbookConflicts++;reviewUpdates.push({betId:b.id,from:settled,to:official,deltas,gameIds:[gameId],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()})}
     else if(deltas.length){reviewUpdates.push({betId:b.id,from:settled,to:official,deltas,gameIds:[gameId],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()})}
    }
   }
   const stamp=new Date().toISOString();localStorage.setItem(`gameStatVerified:${id}`,stamp);
   if(reviewUpdates.length){setCorrectionReviews(old=>{const next=[...old] as CorrectionReview[];for(const u of reviewUpdates){const i=next.findIndex(x=>x.betId===u.betId);if(i<0){next.unshift(u);continue}const prior=next[i];const keep=(prior.deltas||[]).filter(d=>d.gameId!==gameId);next[i]={...prior,from:prior.from==='PENDING'?u.from:prior.from,to:u.to,deltas:[...keep,...u.deltas],gameIds:[...new Set([...(prior.gameIds||[]),gameId])],updatedAt:u.updatedAt}}return next});setCorrectionPopup(`OFFICIAL STAT CHANGE · ${reviewUpdates.length} wager${reviewUpdates.length===1?'':'s'} has new before → after evidence. Sportsbook settlement was preserved.`)}
   setVerifyGameStatus(x=>({...x,[id]:isFinalVerification?(reviewUpdates.length?`VERIFIED · ${reviewUpdates.length} ADJUSTMENT${reviewUpdates.length===1?'':'S'}`:`VERIFIED · ${changedPlayers} STAT ${changedPlayers===1?'CHANGE':'CHANGES'}`):`UPDATED · ${changedPlayers} STAT ${changedPlayers===1?'CHANGE':'CHANGES'}`}));
  }catch(e:any){setVerifyGameStatus(x=>({...x,[id]:`VERIFY FAILED · ${e?.message||'Unknown error'}`}))}
 }
 function resolveCorrection(review:CorrectionReview,apply:boolean){if(apply)setBets(old=>old.map(b=>b.id===review.betId?{...b,status:review.to,settledAt:new Date().toISOString(),regradeNote:`${review.from} → ${review.to} · official NHL stat correction applied`}:b));setCorrectionReviews(old=>old.filter(x=>x.betId!==review.betId))}
 async function verifyNight(){setVerifyStatus('VERIFYING…');try{const day=bets.filter(b=>b.date===date);const score=await window.nhlTracker.score(date);const freshGames=(score?.games||[]) as Game[];if(!freshGames.length||freshGames.some(g=>!['FINAL','OFF'].includes(String(g.gameState))))throw new Error('All scheduled games must be final before verifying this night');const ids=[...new Set(day.flatMap(b=>b.legs.map(l=>l.gameId).filter(Boolean) as string[]))];const fresh:LiveStats={};const identities=new Map<string,{playerId:number;player:string;gameId:string}[]>();await Promise.all(ids.map(async id=>{const box=await window.nhlTracker.boxscore(Number(id));Object.assign(fresh,flattenBoxscore(box,Number(id)));identities.set(String(id),boxscoreIdentities(box,Number(id)))}));const now=new Date().toISOString();const reconciled=day.map(b=>reconcileBetPlayerIds(b,identities));const unitsRisked=reconciled.reduce((n,b)=>n+b.units,0);const resultFor=(b:Bet)=>authoritativeBetStatus(b,fresh,freshGames);const verifiedNetUnits=reconciled.reduce((n,b)=>{const status=resultFor(b);const stake=b.units*b.unitSize;if(status==='VOID')return n;if(status==='PENDING')return n-b.units;const profit=status==='WON'?(b.payout!=null?b.payout-stake:b.odds!=null?(b.odds>0?stake*b.odds/100:stake*100/Math.abs(b.odds)):0):-stake;return n+profit/b.unitSize},0);setVerifiedDays(old=>[...old.filter(x=>x.date!==date),{date,verifiedAt:now,betIds:day.map(b=>b.id),unitsRisked,netUnits:verifiedNetUnits}]);if(localStorage.getItem('activeSlateDate')===date||!localStorage.getItem('activeSlateDate'))localStorage.setItem('activeSlateDate',localDate());const changes:{bet:Bet;from:BetStatus;to:BetStatus}[]=[];setGames(freshGames);setLiveStats(fresh);setBets((old:Bet[])=>old.map(original=>{if(original.date!==date)return original;const b=reconcileBetPlayerIds(original,identities);const from=(original.status||'PENDING') as BetStatus;const to=resultFor(b);if(from!==to&&from!=='PENDING')changes.push({bet:b,from,to});return{...b,status:to,settledAt:to==='PENDING'?b.settledAt:(b.settledAt||now),verifiedAt:now,payout:to==='VOID'?b.units*b.unitSize:b.payout,regradeNote:from!==to&&from!=='PENDING'?`${from} → ${to} after NHL stat re-check`:b.regradeNote}}));if(changes.length){const evs=changes.map((c,i)=>({id:`verify-${Date.now()}-${i}`,gameId:Number(c.bet.legs[0]?.gameId||0),team:'BET',opponent:'',type:'STAT CORRECTION' as const,title:c.bet.legs.map(l=>`${l.player} ${l.qty} ${l.stat}`).join(' + '),detail:`Previously ${c.from} · now ${c.to}`,meta:'NHL final-stat verification changed this wager',sort:3000000+i}));setVerificationEvents(v=>[...evs,...v]);const hiddenChange=changes.some(c=>c.bet.legs.some(l=>l.gameId&&hiddenGameIds.has(Number(l.gameId))));setCorrectionPopup(hiddenChange?`STAT CORRECTION DETECTED · ${changes.length} wager${changes.length===1?'':'s'} changed (hidden-game details suppressed).`:`STAT CORRECTION DETECTED · ${changes.length} wager${changes.length===1?'':'s'} changed after final NHL stat verification.`);setVerifyStatus(`${changes.length} CORRECTION${changes.length===1?'':'S'} FOUND`)}else{setVerificationEvents(v=>[{id:`verified-${Date.now()}`,gameId:0,team:'BET',opponent:'',type:'NIGHT VERIFIED',title:'NIGHT VERIFIED',detail:`${day.length} bets checked · player IDs and NHL stats reconciled`,meta:`Verified ${new Date().toLocaleTimeString()}`,sort:2999999},...v]);setVerifyStatus('NIGHT VERIFIED · NO CHANGES')}}catch(e:any){setVerifyStatus(`VERIFY FAILED · ${e?.message||'Unknown error'}`)}}
 const hiddenGameIds=useMemo(()=>new Set(games.filter(g=>hidden.includes(abbr(g.homeTeam))||hidden.includes(abbr(g.awayTeam))).map(g=>g.id)),[games,hidden]);
 const hitEvents:FeedEvent[]=bets.filter(b=>b.date===date&&((b.legs.some(l=>l.kind==='TEAM'))?(b.status==='WON'):betHit(b,liveStats))&&!b.legs.some(l=>l.gameId&&hiddenGameIds.has(Number(l.gameId)))).map(b=>{const stake=b.units*b.unitSize;const odds=b.odds??(b.payout?americanFromReturn(stake,b.payout):undefined);const id=`bet-hit-${b.id}`;const activePlayerLegs=b.legs.filter(l=>!l.voided&&l.kind!=='TEAM');const moments=activePlayerLegs.map(l=>l.playerId&&l.gameId?legCompletions[`${l.gameId}:${l.playerId}:${l.stat}:${l.qty}`]:null).filter(Boolean) as LegCompletion[];const derived=moments.length===activePlayerLegs.length&&moments.length?moments.reduce((a,m)=>m.sort>a.sort?m:a,moments[0]):null;const persistedHit=Date.parse(b.hitAt||'');const sort=Number.isFinite(persistedHit)?persistedHit:(derived?.sort||0);const stamp=Number.isFinite(persistedHit)?new Date(persistedHit).toLocaleTimeString([],{hour:'numeric',minute:'2-digit',second:'2-digit'}):(derived?.label||'Timestamp pending reconstruction');return{id,gameId:Number(b.legs[0]?.gameId||0),team:'BET',opponent:'',type:'BET HIT',title:b.legs.map(l=>`${l.player} ${l.qty} ${l.stat}`).join(' + '),detail:`${b.units.toFixed(2)}u @ ${odds!=null?(odds>0?`+${odds}`:odds):'—'}`,meta:`${(b.status||'PENDING')==='WON'?'Settled WIN · included in tonight P/L':'All legs satisfied · awaiting official settlement'} · ${stamp}`,sort}});
 const notificationEvents=[...verificationEvents.filter(e=>e.gameId===0||!hiddenGameIds.has(e.gameId)),...hitEvents,...events.filter(e=>!hiddenGameIds.has(e.gameId))].sort((a,b)=>b.sort-a.sort);const visibleEvents=notificationEvents.filter(e=>feedPrefs[e.type]!==false),visibleGames=games.filter(g=>!hiddenGameIds.has(g.id));const replayHidden=!!replayGame&&(hidden.includes(abbr(replayGame.homeTeam))||hidden.includes(abbr(replayGame.awayTeam)));const completed=games.filter(g=>['FINAL','OFF'].includes(g.gameState));const dayBets=bets.filter(b=>b.date===date);const won=dayBets.filter(b=>(b.status||'PENDING')==='WON'),lost=dayBets.filter(b=>(b.status||'PENDING')==='LOST'),pending=dayBets.filter(b=>(b.status||'PENDING')==='PENDING');const betReturn=cashReturn;const totalMoneyOut=dayBets.reduce((n,b)=>n+cashRisk(b),0);const voided=dayBets.filter(b=>(b.status||'PENDING')==='VOID');const settledReturns=[...won,...voided].reduce((n,b)=>n+betReturn(b),0);const pendingMaxReturns=pending.reduce((n,b)=>n+betReturn(b),0);const runningPnlDollars=-totalMoneyOut+settledReturns;const maxReturnDollars=runningPnlDollars+pendingMaxReturns;const pnlDollars=runningPnlDollars;const pnlUnits=dayBets.reduce((n,b)=>n+(b.unitSize>0?(-cashRisk(b)+((b.status==='WON'||b.status==='VOID')?betReturn(b):0))/b.unitSize:0),0);const completedIds=new Set(completed.map(g=>String(g.id)));const completedBets=dayBets.filter(b=>b.legs.length>0&&b.legs.every(l=>l.gameId&&completedIds.has(String(l.gameId))));const completedPnlDollars=completedBets.reduce((n,b)=>n+((b.status||'PENDING')==='VOID'?0:(b.status==='WON'?betReturn(b):0)-cashRisk(b)),0);const completedPnlUnits=completedBets.reduce((n,b)=>n+(b.unitSize>0?((b.status==='VOID'?0:(b.status==='WON'?betReturn(b):0)-cashRisk(b))/b.unitSize):0),0)
 void visibleGames; void replayHidden;
 useEffect(()=>{const ids=new Set(notificationEvents.map(e=>e.id));if(date!==(localStorage.getItem('activeSlateDate')||localDate())){notifiedRef.current=ids;notificationPrimedRef.current=true;return}if(!notificationPrimedRef.current){notifiedRef.current=ids;notificationPrimedRef.current=true;return}for(const e of notificationEvents){if(notifiedRef.current.has(e.id))continue;notifiedRef.current.add(e.id);if(desktopMaster&&desktopPrefs[e.type])window.nhlTracker.notify(`NHL Tracker · ${e.type}`,`${e.title} — ${e.detail}`);if(soundMaster&&soundPrefs[e.type])playEventSound(e.type,soundVolume*eventVolumes[e.type])}},[date,notificationEvents.map(e=>e.id).join('|'),desktopMaster,soundMaster,soundVolume,eventVolumes])
 return <div className="app"><div role="status" style={{padding:"6px 18px",background:isTestMode?"#52360f":"#123d2a",color:"#fff",fontWeight:800,fontSize:12,letterSpacing:".08em",borderBottom:"1px solid #45617e"}}>{isTestMode?"TEST MODE · DEVELOPMENT DATABASE · TEST WAGERS":"LIVE MODE · LOCAL WAGERS · CLOUD WAGER SYNC PENDING"}</div>{nightReminderEligible&&<div role="status" style={{padding:'8px 18px',background:'#362b14',color:'#ffdc91',display:'flex',alignItems:'center',gap:12,flexWrap:'wrap',borderBottom:'1px solid #80612c'}}><strong>VERIFY NIGHT PENDING · {date}</strong><span>{nightAllFinal?`All ${games.length} games final`:'Previous NHL day has not been verified'}</span>{nightReminderVisible&&<><button onClick={()=>{setTab('LIVE');void verifyNight()}} disabled={verifyStatus==='VERIFYING…'}>VERIFY NIGHT</button><button onClick={()=>setNightReminderDismissed(old=>[...old,date])}>REMIND ME LATER</button></>}{!nightReminderVisible&&<button onClick={()=>setNightReminderDismissed(old=>old.filter(d=>d!==date))}>REVIEW</button>}</div>}<header><div className="brand"><img className="brandMoneyPuck" src={betHitIcon} alt=""/><div><b>NHL TRACKER</b><small>{hidden.length?`SPOILER SHIELD · ${hidden.join(' · ')}`:'LIVE'}</small></div></div><nav className="primaryNav">{[{label:'LIVE GAME',target:'LIVE'},{label:'BET ENTRY',target:'BET ENTRY'},{label:'DEEP BET ANALYTICS',target:'DEEP BET ANALYTICS'},{label:'SETTINGS',target:'SETTINGS'},...((liveAccount||account)?.role==='DEV'?[{label:'DEV CENTER',target:'DEV'}]:[])].map(x=><button className={(x.target==='BET ENTRY'?tab==='LIVE'&&addBetOpen:x.target==='LIVE'?tab==='LIVE'&&!addBetOpen:tab===x.target)?'active':''} onClick={()=>{if(x.target==='BET ENTRY'){setTab('LIVE');setDevMode(false);setAddBetOpen(true)}else{setTab(x.target);if(x.target==='LIVE')setAddBetOpen(false)}}} key={x.target}>{x.label}</button>)}</nav><div className="engine"><span></span>{status}</div><div className="accountHeader"><span className="accountEnvironment" title={isTestMode?"Development TEST environment":"Production LIVE environment"}><span className="accountEnvironmentDot"/>{isTestMode?"TEST ENV":"LIVE"}</span>{(liveAccount||account)?<><button className="accountIdentity" onClick={()=>{if(!liveAccount)setAccountOpen(true)}} title={liveAccount?"Signed in to LIVE":"Account details"}><span className="accountAvatar">{(liveAccount||account)!.username.slice(0,1).toUpperCase()}</span><span className="accountUsername">{(liveAccount||account)!.username}</span><span className={`accountRole accountRole${(liveAccount||account)!.role}`}>{(liveAccount||account)!.role}</span></button><button className="accountHeaderLogout" onClick={()=>liveAccount?onLiveLogout?.():void logoutAccount()}>LOG OUT</button></>:<button className="accountHeaderLogin" onClick={()=>{setAccountMode('login');setAccountError('');setAccountOpen(true)}}>LOG IN <span>/ CREATE ACCOUNT</span></button>}</div></header>

 <style>{`.devCenter{padding-bottom:28px}.devCenterGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:15px;padding:18px 24px}.devCenterCard{background:linear-gradient(155deg,#14263b,#0e192a);border:1px solid #2d465f;border-radius:12px;padding:20px;display:flex;flex-direction:column;gap:12px;min-height:210px;color:#eaf3ff}.devCenterCardTitle{display:flex;align-items:center;gap:10px}.devCenterCardTitle>span{font-size:23px;color:#69b6ee}.devCenterCard h2{font-size:16px;margin:0}.devCenterCard p{font-size:12px;line-height:1.55;color:#9eb5cd;margin:0}.devCenterCard button{margin-top:auto;align-self:flex-start;background:#1764a4;color:white;border:1px solid #3382c2;border-radius:7px;padding:10px 15px;font-size:11px;font-weight:800;letter-spacing:.045em;cursor:pointer}.devCenterCard button:hover:not(:disabled){background:#237dc4}.devCenterCard button:disabled{opacity:.52;cursor:not-allowed}.devCenterNotice{font-size:11px;line-height:1.5;padding:9px 11px;border:1px solid #574b30;border-radius:7px;background:#32291666;color:#f2d398}.devCenterPill{font-size:10px;color:#81e7b4;border:1px solid #2b7958;border-radius:5px;padding:4px 7px;vertical-align:middle}.devCenterCard .devCenterMeta{font-size:11px;color:#b4c6d9}.devCenterFuture{border-style:dashed}.comboDrawerBackdrop{position:fixed;inset:0;z-index:1200;background:#030b15b8;display:flex;justify-content:flex-end}.comboDrawer{width:min(760px,96vw);height:100%;background:#0d1929;border-left:1px solid #39516d;box-shadow:-20px 0 55px #0008;display:flex;flex-direction:column;color:#eaf3ff;animation:comboDrawerSlide .22s ease-out}@keyframes comboDrawerSlide{from{transform:translateX(100%)}to{transform:translateX(0)}}.comboDrawerHeader{display:flex;justify-content:space-between;align-items:flex-start;padding:22px 24px;border-bottom:1px solid #2d455f}.comboDrawerHeader h2{margin:0;font-size:18px}.comboDrawerHeader p{color:#a7bdd6;font-size:12px}.comboDrawerHeader button{background:#203750;border:1px solid #45617e;color:white;border-radius:7px;padding:8px 12px;cursor:pointer}.comboDrawerScroll{padding:20px 22px;overflow:auto;flex:1}.comboDrawerStats{display:flex;gap:12px;margin-bottom:18px}.comboDrawerStats span{flex:1;background:#172c42;padding:13px;border-radius:8px;font-size:12px;color:#b9cbe0;display:flex;justify-content:space-between}.comboDrawerStats b{font-size:18px;color:white}.comboDrawerNotice{padding:11px;background:#153e32;color:#a3f1d0;border:1px solid #357e62;border-radius:7px;margin-bottom:12px;font-size:12px}.comboDrawerSection{margin-bottom:16px}.comboDrawerSectionToggle{width:100%;padding:13px;background:#23354a;color:#eaf3ff;border:1px solid #46617c;border-radius:8px;text-align:left;font-weight:800;cursor:pointer;display:flex;gap:10px;align-items:center}.comboDrawerSectionToggle span{margin-left:auto}.comboDrawerGame h3{font-size:12px;color:#9eb8d3;margin:18px 0 9px}.comboDrawerCombo{background:#15263a;border:1px solid #2e465f;border-radius:9px;margin:8px 0;overflow:hidden}.comboDrawerComboToggle{background:none;border:0;color:white;width:100%;display:flex;gap:12px;align-items:center;text-align:left;padding:13px;cursor:pointer}.comboDrawerComboToggle span{flex:1;min-width:0}.comboDrawerComboToggle small{display:block;color:#b5c9dc;margin-top:5px;font-size:12px}.comboDrawerComboToggle em{font-size:11px;color:#88ddb8;font-style:normal;white-space:nowrap}.comboDrawerComboToggle strong{color:#a4b9d0}.comboDrawerEditor{padding:12px 14px 15px;border-top:1px solid #304961}.comboDrawerFields{display:grid;grid-template-columns:1fr 1.3fr 1fr;gap:10px}.comboDrawerFields label{font-size:10px;font-weight:800;color:#adc5dc;display:flex;flex-direction:column;gap:7px}.comboDrawerFields input{width:100%;min-width:0;box-sizing:border-box;background:#0e1a2a;color:white;border:1px solid #46607d;border-radius:6px;padding:10px;font-size:13px}.comboDrawerActions{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:12px}.comboDrawerActions small{font-size:10px;color:#f4cb84}.comboDrawerActions button{background:#1769ad;color:white;border:1px solid #3288c9;border-radius:6px;padding:9px 14px;cursor:pointer;font-size:11px;font-weight:800}.comboDrawerEmpty{font-size:12px;color:#a5bad0;padding:12px}/* Odds drawer half-window layout and isolated header */
.comboDrawerBackdrop .comboDrawer{width:50vw;min-width:540px;max-width:100vw;height:100vh;min-height:0;overflow:hidden;box-sizing:border-box}
.comboDrawerBackdrop .comboDrawerHeader{position:relative;z-index:2;flex:0 0 auto;min-height:154px;height:auto;box-sizing:border-box;display:flex;align-items:flex-start;justify-content:space-between;gap:24px;padding:27px 30px 23px;background:#0d1929;border-bottom:1px solid #36516b}
.comboDrawerBackdrop .comboDrawerHeaderContent{flex:1;min-width:0;display:flex;flex-direction:column;align-items:flex-start;gap:12px}
.comboDrawerBackdrop .comboDrawerEyebrow{font-size:11px;line-height:1.4;letter-spacing:.08em;font-weight:750;color:#9cbad4;margin:0}
.comboDrawerBackdrop .comboDrawerHeader h2{font-size:21px;line-height:1.3;letter-spacing:.01em;margin:0;color:#f1f6ff}
.comboDrawerBackdrop .comboDrawerHeaderMeta{display:flex;gap:9px 15px;flex-wrap:wrap;font-size:12px;line-height:1.5;color:#a7bdd6}
.comboDrawerBackdrop .comboDrawerHeaderMeta span+span:before{content:'·';margin-right:15px;color:#63829d}
.comboDrawerBackdrop .comboDrawerClose{flex:0 0 40px;align-self:flex-start;height:40px;width:40px;padding:0;display:grid;place-items:center}
.comboDrawerBackdrop .comboDrawerScroll{flex:1 1 0;min-height:0;overflow-y:auto;overflow-x:hidden;padding:23px 27px}
.comboDrawerBackdrop .comboDrawerFields{grid-template-columns:minmax(0,1.15fr) minmax(0,1fr) minmax(0,1fr);gap:14px}
.comboDrawerBackdrop .comboDrawerFields input{height:38px;width:100%;box-sizing:border-box;background:#0e1a2a;color:#edf5ff;border:1px solid #46607d;border-radius:6px;padding:9px 11px;font:inherit;font-size:13px;outline:none}
.comboDrawerBackdrop .comboDrawerFields input:focus{border-color:#5da7e5;box-shadow:0 0 0 2px #3b8dd329}
.bonusBetFlag{display:flex;align-items:center;gap:8px;margin:9px 0;color:#f1cb79;font-size:12px;font-weight:800;cursor:pointer}.bonusBetFlag input{accent-color:#e6b65c;width:16px;height:16px}.comboReviewFlags{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:14px;padding:12px;background:#15283b;border:1px solid #31475f;border-radius:7px}.comboReviewFlags label{display:flex;align-items:center;gap:7px;color:#e4d4ac;font-size:11px;font-weight:800;cursor:pointer}.comboReviewFlags input[type=checkbox]{accent-color:#e6b65c}.comboReviewFlags .comboChangeNote{width:100%;display:flex;flex-wrap:wrap}.comboReviewFlags .comboChangeNote input{min-width:210px;flex:1;background:#0e1a2a;color:#fff;border:1px solid #45617c;border-radius:5px;padding:7px}.scoreboardSog{display:inline-block;margin-left:7px;font-size:10px;color:#9bc9ed;font-weight:800;white-space:nowrap}.comboBookAuto{position:relative;width:100%;min-width:0}
.comboDrawerBackdrop .comboDrawerFields .comboBookAuto input{display:block}
.comboBookSuggestions{position:absolute;top:calc(100% + 3px);left:0;right:0;z-index:20;background:#11273a;border:1px solid #3b5b76;border-radius:6px;overflow:hidden;box-shadow:0 14px 25px #0008}
.comboBookSuggestions button{display:block;width:100%;padding:11px 13px;background:#11273a;border:0;border-bottom:1px solid #263f54;color:#edf5ff;font-size:12px;text-align:left;cursor:pointer}
.comboBookSuggestions button:last-child{border-bottom:0}
.comboBookSuggestions button:hover,.comboBookSuggestions button.active{background:#204762;color:white}
@media(max-width:850px){.comboDrawerBackdrop .comboDrawer{width:100vw;min-width:0}.comboDrawerBackdrop .comboDrawerHeader{padding:23px 18px;min-height:145px}.comboDrawerBackdrop .comboDrawerScroll{padding:18px}.comboDrawerBackdrop .comboDrawerFields{gap:9px}}
`}
</style><style>{`
.analyticsSubnav{display:flex;flex-wrap:wrap;gap:8px;padding:13px 24px;background:#0c1624;border-bottom:1px solid #283b51}.analyticsSubnav button{background:#14243a;border:1px solid #324a65;border-radius:7px;padding:10px 15px;color:#a6bfd8;font-size:11px;font-weight:800;letter-spacing:.055em;cursor:pointer}.analyticsSubnav button.active{border-color:#e4b55e;color:#fff;background:#20364e}.analyticsSubnav button:hover{color:#fff;border-color:#719ac3}.primaryNav{display:flex;gap:2px;min-width:0;flex-wrap:wrap}.primaryNav button{white-space:nowrap}@media(max-width:1150px){.primaryNav button{font-size:10px;padding-left:10px;padding-right:10px}}.accountHeader{display:flex;align-items:center;gap:9px;margin-right:12px;flex-shrink:0;font-family:inherit}.accountEnvironment{display:inline-flex;align-items:center;gap:6px;color:#e5b968;font-size:10px;font-weight:800;letter-spacing:.09em;white-space:nowrap}.accountEnvironmentDot{height:5px;width:5px;border-radius:50%;background:#e5b968;box-shadow:0 0 7px #e5b96866}.accountHeader button{font:inherit;cursor:pointer}.accountHeaderLogin,.accountHeaderLogout{border:1px solid #34465d!important;background:#132237!important;color:#e8f2ff!important;border-radius:7px!important;padding:9px 12px!important;font-size:10px!important;font-weight:800!important;letter-spacing:.045em;white-space:nowrap}.accountHeaderLogin:hover,.accountHeaderLogout:hover{background:#1d3652!important;border-color:#5683b3!important}.accountHeaderLogin span{color:#91a9c5}.accountIdentity{display:inline-flex;align-items:center;gap:8px;border:1px solid #324b63!important;border-radius:8px!important;background:#112438!important;padding:4px 9px 4px 5px!important;color:#edf5ff!important;max-width:240px}.accountIdentity:hover{border-color:#5b93bb!important}.accountAvatar{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;flex-shrink:0;border-radius:6px;background:#1c5474;color:#a8edff;font-size:12px;font-weight:900}.accountUsername{font-size:11px;font-weight:750;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.accountRole{display:inline-flex;align-items:center;border-radius:5px;padding:3px 6px;background:#26354b;color:#bac9dd;font-size:9px;font-weight:900;letter-spacing:.07em}.accountRoleDEV{background:#174537;color:#76e8b2}.accountRoleMOD{background:#2b3d69;color:#a4bdff}.accountOverlay{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:16px;background:rgba(1,5,12,.82);backdrop-filter:blur(5px)}.accountDialog{box-sizing:border-box;width:min(420px,100%);max-height:calc(100vh - 32px);overflow:auto;background:linear-gradient(155deg,#142338,#0b1523 75%);border:1px solid #344861;border-radius:15px;padding:25px;box-shadow:0 25px 90px #000b;color:#eaf3ff;font-family:inherit}.accountDialog *{box-sizing:border-box}.accountDialogHead{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px}.accountDialogBrand{display:flex;align-items:center;gap:12px}.accountDialogIcon{display:grid;place-items:center;width:39px;height:39px;border-radius:11px;background:#174b49;color:#6ce6b8;font-size:20px}.accountDialogBrand strong{display:block;font-size:16px;letter-spacing:.09em}.accountDialogBrand small{display:block;margin-top:4px;color:#8299b2;font-size:10px;font-weight:750;letter-spacing:.16em}.accountClose{display:grid;place-items:center;width:31px;height:31px;padding:0!important;border:1px solid #34465b!important;border-radius:7px!important;background:#18283c!important;color:#a9bdd2!important;font-size:22px!important;line-height:1!important;cursor:pointer}.accountClose:hover{color:white!important;background:#2a4058!important}.accountTabs{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:4px;margin-bottom:21px;border:1px solid #293b52;border-radius:9px;background:#0c1727}.accountTabs button{border:0!important;border-radius:6px!important;background:transparent!important;color:#90a6be!important;padding:10px 5px!important;font-size:11px!important;font-weight:850!important;letter-spacing:.07em;cursor:pointer}.accountTabs button.selected{background:#294663!important;color:#f3f8ff!important;box-shadow:0 2px 7px #0005}.accountForm{display:grid;gap:16px}.accountForm label{display:grid;gap:7px;margin:0;color:#b6c7d9;font-size:10px;font-weight:850;letter-spacing:.11em}.accountForm input{display:block;width:100%;min-width:0;height:42px;padding:10px 12px;border:1px solid #354b64;border-radius:7px;background:#0a1625;color:#f2f8ff;font-family:inherit;font-size:13px;font-weight:500;letter-spacing:normal;outline:none}.accountForm input::placeholder{color:#687f98}.accountForm input:focus{border-color:#60a8e8;box-shadow:0 0 0 3px #3d8dd92a}.accountPrimary{width:100%;min-height:43px;margin-top:6px;padding:10px 14px!important;border:1px solid #318be0!important;border-radius:8px!important;background:linear-gradient(180deg,#247bcb,#155b9f)!important;color:#fff!important;font-family:inherit;font-size:12px!important;font-weight:900!important;letter-spacing:.09em;cursor:pointer}.accountPrimary:hover:not(:disabled){filter:brightness(1.13)}.accountPrimary:disabled{opacity:.6;cursor:wait}.accountError{margin:0;padding:10px 12px;border:1px solid #934753;border-radius:7px;background:#54252b55;color:#ffb7be;font-size:12px;line-height:1.5}.accountDialogFoot{margin-top:20px;padding-top:17px;border-top:1px solid #2a3c51;text-align:center;color:#829ab2;font-size:10px;line-height:1.6}.accountDialogFoot>span:first-child{color:#5edeb4;font-size:13px}.accountFootDivider{padding:0 4px;color:#566b81}.accountWelcome{color:#8ba2b9;font-size:10px;font-weight:850;letter-spacing:.13em}.accountProfile{display:flex;align-items:center;gap:12px;margin:14px 0 24px;padding:15px;border:1px solid #30455c;border-radius:10px;background:#101f31}.accountAvatarLarge{width:42px;height:42px;font-size:20px}.accountProfile>div{display:flex;flex-direction:column;align-items:flex-start;gap:7px}.accountProfile strong{font-size:15px}.accountLoggedIn .accountPrimary{margin-top:0}@media(max-width:1100px){.accountHeaderLogin span{display:none}.accountEnvironment{font-size:9px}.accountUsername{max-width:95px}}
`}</style>
 {accountOpen&&<div className="accountOverlay" onMouseDown={e=>{if(e.target===e.currentTarget)setAccountOpen(false)}}><section role="dialog" aria-modal="true" aria-label="NHL Tracker account" className="accountDialog"><div className="accountDialogHead"><div className="accountDialogBrand"><span className="accountDialogIcon">◆</span><div><strong>NHL TRACKER</strong><small>ACCOUNT ACCESS</small></div></div><button type="button" className="accountClose" aria-label="Close account window" onClick={()=>setAccountOpen(false)}>×</button></div>{account?<div className="accountLoggedIn"><div className="accountWelcome">SIGNED IN AS</div><div className="accountProfile"><span className="accountAvatar accountAvatarLarge">{account.username.slice(0,1).toUpperCase()}</span><div><strong>{account.username}</strong><span className={`accountRole accountRole${account.role}`}>{account.role}</span></div></div>{isTestMode&&account.username.toLowerCase()==="stankyfangers"&&<button type="button" className="accountPrimary" disabled={accountBusy} onClick={()=>void renameTestAccount()}>RENAME TEST ACCOUNT TO STANKYFANGERSTEST</button>}{accountError&&<p role="alert" className="accountError">{accountError}</p>}<button type="button" className="accountPrimary" onClick={()=>void logoutAccount()}>LOG OUT</button></div>:<><div className="accountTabs" role="tablist" aria-label="Account action"><button type="button" role="tab" aria-selected={accountMode==='login'} className={accountMode==='login'?'selected':''} onClick={()=>{setAccountMode('login');setAccountError('')}}>LOG IN</button><button type="button" role="tab" aria-selected={accountMode==='register'} className={accountMode==='register'?'selected':''} onClick={()=>{setAccountMode('register');setAccountError('')}}>CREATE ACCOUNT</button></div><form className="accountForm" onSubmit={e=>void submitAccount(e)}><label><span>{accountMode==='login'?'EMAIL OR USERNAME':'USERNAME'}</span><input required autoComplete="username" placeholder={accountMode==='login'?'Username or email':'Choose a username'} value={accountName} onChange={e=>setAccountName(e.target.value)}/></label>{accountMode==='register'&&<label><span>EMAIL</span><input required type="email" autoComplete="email" placeholder="you@example.com" value={accountEmail} onChange={e=>setAccountEmail(e.target.value)}/></label>}<label><span>PASSWORD</span><input required type="password" minLength={accountMode==='register'?12:undefined} autoComplete={accountMode==='register'?'new-password':'current-password'} placeholder={accountMode==='register'?'At least 12 characters':'Enter your password'} value={accountPassword} onChange={e=>setAccountPassword(e.target.value)}/></label>{accountError&&<p className="accountError" role="alert">{accountError}</p>}<button type="submit" className="accountPrimary" disabled={accountBusy}>{accountBusy?'PLEASE WAIT…':accountMode==='login'?'LOG IN':'CREATE ACCOUNT'}</button></form><div className="accountDialogFoot"><span>♢</span> Secure authentication <span className="accountFootDivider">·</span> Sessions expire after 12 hours</div></>}</section></div>}
 {tab==='LIVE'&&devMode&&<DevGameSandbox onExit={()=>setDevMode(false)}/>}
 {tab==='LIVE'&&!devMode&&<LiveCommandCenter date={date} setDate={setDate} games={games} events={visibleEvents} bets={bets} setBets={setBets} liveStats={liveStats} hiddenGameIds={hiddenGameIds} selectedGame={selectedGame} setSelectedGame={setSelectedGame} unitSize={unitSize} pnlUnits={pnlUnits} pnlDollars={pnlDollars} maxReturnDollars={maxReturnDollars} completedPnlDollars={completedPnlDollars} completedPnlUnits={completedPnlUnits} won={won.length} lost={lost.length} pending={pending.length} verifyNight={verifyNight} verifyStatus={verifyStatus} correctionPopup={correctionPopup} dismissCorrection={()=>setCorrectionPopup('')} viewCorrection={()=>setCorrectionReviewOpen(true)} correctionReviews={correctionReviews} correctionReviewOpen={correctionReviewOpen} closeCorrectionReview={()=>setCorrectionReviewOpen(false)} resolveCorrection={resolveCorrection} addBetOpen={addBetOpen} setAddBetOpen={setAddBetOpen} teamHistory={teamHistory} leagueStandings={leagueStandings} clubStats={clubStats} slateDfo={slateDfo} checkSlateLines={checkSlateLines} lineCheckBusy={lineCheckBusy} lineCheckLast={lineCheckLast} lineCheckError={lineCheckError} lineupAlerts={lineupAlerts} verifyGame={verifyGame} verifyGameStatus={verifyGameStatus}/>}
 {tab==='DEEP BET ANALYTICS'&&<><div className="analyticsSubnav" role="navigation" aria-label="Deep Bet Analytics sections">{([{id:'PROFIT',label:'COMBO PROFITABILITY'},{id:'DETAIL',label:'DETAILED COMBO PERFORMANCE'},{id:'TRIOS',label:'TRIO VS SPLIT DUOS'},{id:'CONFIDENCE',label:'CONFIDENCE SCORE'},{id:'TEAMS',label:'TEAM ANALYTICS'}] as const).map(item=><button type="button" key={item.id} className={analyticsSection===item.id?'active':''} onClick={()=>setAnalyticsSection(item.id)}>{item.label}</button>)}</div>{analyticsSection==='PROFIT'&&<DeepComboAnalytics bets={bets}/>} {analyticsSection==='DETAIL'&&<HistoryDashboard bets={bets} setBets={setBets} verifiedDays={verifiedDays} unitSize={unitSize} games={games} initialView="HISTORY"/>} {analyticsSection==='TRIOS'&&<main><section className="toolbar"><div><h1>TRIO VS SPLIT DUOS</h1><p>Season-to-date comparison of original 1u trios against the three split 0.5u duos (1.5u total), with equal-exposure normalization.</p></div></section><section className="settingsCard" style={{margin:24,maxWidth:820}}><h2>Comparison engine — upcoming phase</h2><p>This section will compare verified historical trio prices and matching split-duo outcomes. No performance figures will be shown until the underlying records are linked and graded.</p></section></main>} {analyticsSection==='CONFIDENCE'&&<ConfidencePerformanceView bets={bets} revision={confidenceRevision}/>} {analyticsSection==='TEAMS'&&<TeamPerformance bets={bets} unitSize={unitSize} leagueStandings={leagueStandings}/>}</> }
 {tab==='TEAM PERFORMANCE'&&<TeamPerformance bets={bets} unitSize={unitSize} leagueStandings={leagueStandings}/> }
 {tab==='BET PERFORMANCE'&&<HistoryDashboard bets={bets} setBets={setBets} verifiedDays={verifiedDays} unitSize={unitSize} games={games}/>}
 {tab==='CONFIDENCE PERFORMANCE'&&<ConfidencePerformanceView bets={bets} revision={confidenceRevision}/>}
 {tab==='DEV'&&(liveAccount||account)?.role==='DEV'&&<main className="devCenter"><section className="toolbar settingsToolbar"><div><h1>DEV CONTROL CENTER <span className="devCenterPill">{(liveAccount||account)?.username.toUpperCase()} · DEV</span></h1><p>Administrative workspace · DEV privileges · {isTestMode?'TEST environment':'LIVE environment'} · No PINs</p></div></section><div className="devCenterGrid">
 <section className="devCenterCard"><div className="devCenterCardTitle"><span>♙</span><h2>User Management</h2></div><p>Promote trusted users to MOD, restrict chat, and manage account bans.</p><div className="devCenterNotice">Server-side role management and moderation endpoints are not enabled yet. No account changes can be made from this panel until the database migration and authenticated API are installed.</div><button disabled title="Requires DEV-authorized moderation API">MANAGE USERS · COMING NEXT</button></section>
 <section className="devCenterCard"><div className="devCenterCardTitle"><span>▤</span><h2>Daily Combo Report</h2></div><p>Generate a pregame PDF of qualifying forwards who share both a forward line and a power-play unit. Preserves three-player combinations.</p><button disabled={reportBusy} onClick={()=>void generateDailyComboReport()}>{reportBusy?'GENERATING…':'GENERATE DAILY PDF'}</button></section>
 <section className="devCenterCard"><div className="devCenterCardTitle"><span>◷</span><h2>End of Day Combo Report</h2></div><p>Grade the qualifying daily combos against final player stats and compare actual net units.</p><div className="devCenterNotice">Grades the saved pregame snapshot against final NHL boxscores. Unpriced and unverified combos are excluded from financial totals.</div><button disabled={eodBusy||!trackedCombos.length} onClick={()=>void generateEndOfDayComboReport()}>{eodBusy?'CHECKING FINALS…':'GENERATE END OF DAY PDF'}</button></section>
 <section className="devCenterCard"><div className="devCenterCardTitle"><span>♧</span><h2>Saved Combos & Odds</h2></div><p>{trackedCombos.length} qualifying combos for {date}. Open the slide-out workspace to review linked wagers and save missing prices.</p>{comboReportMessage&&<div className="devCenterNotice">{comboReportMessage}</div>}<button onClick={()=>setComboDrawerOpen(true)}>OPEN SAVED COMBOS & ODDS</button></section>
 {isTestMode&&<section className="devCenterCard"><div className="devCenterCardTitle"><span>⚗</span><h2>DEV Simulator</h2></div><p>Run an isolated simulated NHL game without affecting actual league results or bets.</p><button onClick={()=>{setDevMode(true);setTab('LIVE')}}>ENTER DEV MODE</button></section>}
 <section className="devCenterCard"><div className="devCenterCardTitle"><span>↻</span><h2>Player Roster Management</h2></div><p>Refresh the local NHL roster cache across all 32 teams. This does not write to Neon.</p><p className="devCenterMeta">Last full refresh: {devRosterLast?new Date(devRosterLast).toLocaleString():'Not recorded'}</p><button disabled={devRosterBusy} onClick={()=>void refreshDevRosters()}>{devRosterBusy?'CHECKING ALL 32 TEAMS…':'CHECK FOR ROSTER UPDATES'}</button>{devRosterMessage&&<p role="status" className="devCenterMeta">{devRosterMessage}</p>}</section>
 <section className="devCenterCard"><div className="devCenterCardTitle"><span>⌕</span><h2>Missing Player Lookup</h2></div><p>Search NHL players by name. Verify the player and team before adding to the local identity cache. No Neon writes.</p><input aria-label="Player name" value={devPlayerQuery} onChange={e=>setDevPlayerQuery(e.target.value)} placeholder="Roger McQueen"/><select aria-label="Team" value={devPlayerTeam} onChange={e=>setDevPlayerTeam(e.target.value)}>{ALL_TEAMS.map(t=><option key={t} value={t}>{t}</option>)}</select><button disabled={devPlayerSearching||devPlayerQuery.trim().length<3} onClick={()=>void searchDevPlayer()}>{devPlayerSearching?'SEARCHING…':'SEARCH NHL PLAYERS'}</button>{devPlayerResults.length>0&&<><select size={Math.min(7,devPlayerResults.length)} aria-label="NHL player results" value={devPlayerSelected} onChange={e=>setDevPlayerSelected(e.target.value)} style={{maxHeight:185,overflowY:'auto',width:'100%'}}><option value="">Choose a player…</option>{devPlayerResults.map(p=><option key={p.id} value={String(p.id)}>{p.name} · NHL #{p.id} · {p.team||'Team unlisted'}</option>)}</select>{(()=>{const p=devPlayerResults.find(p=>String(p.id)===devPlayerSelected);return p?<button disabled={!!devPlayerAdded[p.id]} onClick={()=>void addDevPlayer(p)}>{devPlayerAdded[p.id]?'✓ ADDED':'ADD TO SHARED LIVE DATABASE'}</button>:null})()}</>}</section>
 {isTestMode&&<section className="devCenterCard"><div className="devCenterCardTitle"><span>▣</span><h2>TEST Bet Database</h2></div><p>Import an exported LIVE betting profile using Bet Entry. Imported wagers are saved only in the TEST database; they never modify LIVE wagers.</p><p className="devCenterMeta" role="status">{devSync}</p><p>Clear TEST Bets permanently deletes only this account's TEST server snapshot. It cannot access LIVE data.</p><label className="devCenterMeta">TYPE CLEAR DEV TO CONFIRM <input value={devClearText} onChange={e=>setDevClearText(e.target.value)} placeholder="CLEAR DEV" style={{display:'block',marginTop:8,padding:9,background:'#091727',border:'1px solid #45617e',color:'white',borderRadius:6}}/></label><button disabled={devClearText!=='CLEAR DEV'||devClearing||!devSyncRef.current.ready} onClick={()=>void clearDevBets()} style={{background:'#8d2534',borderColor:'#bb4254'}}>{devClearing?'CLEARING…':'CLEAR TEST BETS'}</button></section>}
 <section className="devCenterCard devCenterFuture"><div className="devCenterCardTitle"><span>＋</span><h2>More Tools</h2></div><p>Reserved for future DEV-only diagnostics, reports, and administrative actions.</p></section>
 </div></main>}
 {comboDrawerOpen&&tab==='DEV'&&(liveAccount||account)?.role==='DEV'&&<SavedComboDrawer date={date} combos={trackedCombos} bets={bets} unitSize={unitSize} onSave={saveComboOdds} onFlag={flagCombo} onClose={()=>setComboDrawerOpen(false)}/>}
 {tab==='SETTINGS'&&<main><section className="toolbar settingsToolbar"><div><h1>SETTINGS</h1><p>Betting defaults, notifications, spoiler protection and portable data.</p></div></section><div className="settingsDashboard"><div className="settingsCard bettingSettings compactSettingsCard"><h2>Betting</h2><p>New wagers snapshot this unit value when saved.</p><label className="bigField">UNIT SIZE ($)<UnitSizeDollarInput value={unitSize} onChange={setUnitSize}/></label><div className="unitExample">1u = ${unitSize.toFixed(2)} · 0.5u = ${(unitSize*.5).toFixed(2)} · 2u = ${(unitSize*2).toFixed(2)}</div><label className="bigField">DEFAULT UNITS PER SPLIT PAIR<input type="number" min="0.01" step="0.05" value={splitPairUnits} onChange={e=>{const n=Number(e.target.value);if(Number.isFinite(n)&&n>0)setSplitPairUnits(n)}}/></label><small>Only applies to generated pair wagers; normal 1u and 2-point 0.5u defaults are unchanged.</small></div><div className="settingsCard notificationSettings"><h2>Notifications</h2><p>Choose Feed, Windows desktop toast and Sound independently. Spoiler Shield overrides all three.</p><div className="masterControls"><label><input type="checkbox" checked={desktopMaster} onChange={e=>setDesktopMaster(e.target.checked)}/> Desktop notifications</label><label><input type="checkbox" checked={soundMaster} onChange={e=>setSoundMaster(e.target.checked)}/> Notification sounds</label><label>VOLUME <input type="range" min="0" max="1" step="0.05" value={soundVolume} onChange={e=>setSoundVolume(Number(e.target.value))}/></label></div><div className="notifyHeader"><span></span><b>EVENT</b><b>FEED</b><b>DESKTOP</b><b>SOUND</b><b>VOLUME</b><b>TEST</b></div><div className="notificationToggles">{FEED_TYPES.map(t=><div className="notifyRow" key={t}><span className={`miniEventIcon ${t.toLowerCase().replaceAll(' ','-')}`}><EventIcon type={t} mini/></span><b>{t}</b><input type="checkbox" checked={feedPrefs[t]} onChange={e=>setFeedPrefs(p=>({...p,[t]:e.target.checked}))}/><input type="checkbox" checked={desktopPrefs[t]} onChange={e=>setDesktopPrefs(p=>({...p,[t]:e.target.checked}))}/><input type="checkbox" checked={soundPrefs[t]} onChange={e=>setSoundPrefs(p=>({...p,[t]:e.target.checked}))}/><div className="eventVolume"><input type="range" min="0" max="1" step="0.05" value={eventVolumes[t]} onChange={e=>setEventVolumes(v=>({...v,[t]:Number(e.target.value)}))}/><small>{Math.round(eventVolumes[t]*100)}%</small></div><button onClick={()=>{if(desktopMaster&&desktopPrefs[t])window.nhlTracker.notify(`NHL Tracker · ${t}`,'Test notification');if(soundMaster&&soundPrefs[t])playEventSound(t,soundVolume*eventVolumes[t])}}>TEST</button></div>)}</div></div><AppUpdates/><div className="settingsCard spoilerSettings"><h2>Spoiler Shield</h2><p>Hiding a team hides its entire game — opponent goals, power plays, score, desktop notifications and sounds included.</p><TeamChips hidden={hidden} setHidden={setHidden}/></div><DataManagement bets={bets} setBets={setBets} unitSize={unitSize} defaultDate={date} isTestMode={isTestMode}/></div></main>}
 </div>
}

function HistoryDashboard({bets,setBets,verifiedDays,unitSize,games,initialView='DEEP'}:{bets:Bet[],setBets:any,verifiedDays:VerifiedDay[],unitSize:number,games:Game[],initialView?:'DEEP'|'HISTORY'}){
 const [analyticsView,setAnalyticsView]=useState<'DEEP'|'HISTORY'>(initialView)
 const[range,setRange]=useState<'YTD'|'MONTH'|'WEEK'>('YTD');const[category,setCategory]=useState<'ALL'|BetCategory>('ALL');const[book,setBook]=useState('ALL');const[breakdown,setBreakdown]=useState<'CATEGORY'|'SPORTSBOOK'>('CATEGORY');const[comboMode,setComboMode]=useState<'EXACT'|'PAIR'>('EXACT');const[selectedCombo,setSelectedCombo]=useState('');const[rebetSource,setRebetSource]=useState<Bet|null>(null);const[rebetBook,setRebetBook]=useState('Fanatics');const[rebetUnits,setRebetUnits]=useState('1');const[rebetOdds,setRebetOdds]=useState('');const[rebetStatus,setRebetStatus]=useState('');
 const settled=bets.filter(b=>(b.status||'PENDING')!=='PENDING');const latest=settled.map(b=>b.date).sort().at(-1)||localDate();const anchor=new Date(`${latest}T12:00:00`);const monday=new Date(anchor);const dow=(monday.getDay()+6)%7;monday.setDate(monday.getDate()-dow);const start=range==='YTD'?`${anchor.getFullYear()}-01-01`:range==='MONTH'?`${anchor.getFullYear()}-${String(anchor.getMonth()+1).padStart(2,'0')}-01`:`${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,'0')}-${String(monday.getDate()).padStart(2,'0')}`;
 const books=[...new Set(settled.map(b=>b.book).filter(Boolean))].sort();const filtered=settled.filter(b=>b.date>=start&&b.date<=latest&&(category==='ALL'||(b.category||'COMBOS')===category)&&(book==='ALL'||b.book===book)).sort((a,b)=>a.date.localeCompare(b.date)||a.createdAt.localeCompare(b.createdAt));
 const calc=(b:Bet)=>{const size=b.unitSize||unitSize,stake=b.units*size;if((b.status||'PENDING')==='VOID')return{risk:stake,ret:stake,net:0,units:0,betUnits:b.units,wonUnits:b.units};if((b.status||'PENDING')==='LOST')return{risk:stake,ret:0,net:-stake,units:-b.units,betUnits:b.units,wonUnits:0};const ret=b.payout!=null?b.payout:b.odds!=null?stake+(b.odds>0?stake*b.odds/100:stake*100/Math.abs(b.odds)):stake;return{risk:stake,ret,net:ret-stake,units:(ret-stake)/size,betUnits:b.units,wonUnits:ret/size}};
 const summarize=(arr:Bet[])=>arr.reduce((a,b)=>{const x=calc(b);a.risk+=x.risk;a.ret+=x.ret;a.net+=x.net;a.units+=x.units;a.betUnits+=x.betUnits;a.wonUnits+=x.wonUnits;return a},{risk:0,ret:0,net:0,units:0,betUnits:0,wonUnits:0});const totals=summarize(filtered);let running=0;const pts=filtered.map((b,i)=>{running+=calc(b).units;return{x:i,y:running,date:b.date}});const min=Math.min(0,...pts.map(p=>p.y)),max=Math.max(0,...pts.map(p=>p.y)),span=Math.max(1,max-min);const path=pts.map((p,i)=>`${i?'L':'M'} ${pts.length===1?400:(p.x/(pts.length-1))*760+20} ${180-((p.y-min)/span)*150}`).join(' ');const verified=new Set(verifiedDays.map(v=>v.date));const byDay=[...new Set(filtered.map(b=>b.date))].sort().reverse();
 const bucketNames=breakdown==='CATEGORY'?['COMBOS','ASSISTS','OTHER']:[...new Set(filtered.map(b=>b.book).filter(Boolean))].sort();const breakdownRows=bucketNames.map(label=>{const arr=filtered.filter(b=>breakdown==='CATEGORY'?(b.category||'COMBOS')===label:b.book===label);return{label,count:arr.length,...summarize(arr)}}).filter(x=>x.count>0);const dayRows=byDay.map(d=>({d,...summarize(filtered.filter(b=>b.date===d))}));const bestDay=[...dayRows].sort((a,b)=>b.units-a.units)[0],worstDay=[...dayRows].sort((a,b)=>a.units-b.units)[0];const catRows=(['COMBOS','ASSISTS','OTHER'] as BetCategory[]).map(c=>({c,...summarize(filtered.filter(b=>(b.category||'COMBOS')===c))})).filter(x=>filtered.some(b=>(b.category||'COMBOS')===x.c));const bestCategory=[...catRows].sort((a,b)=>b.units-a.units)[0];let streak=0,streakType='—';for(let i=filtered.length-1;i>=0;i--){const st=filtered[i].status;if(st!=='WON'&&st!=='LOST')continue;if(streakType==='—')streakType=st;if(st!==streakType)break;streak++}
 const legKey=(l:Leg)=>`${l.playerId||l.player}|${l.qty}|${l.stat}|${l.kind||'PLAYER'}|${l.side||''}`;const exactKey=(b:Bet)=>b.legs.filter(l=>!l.voided).map(legKey).sort().join(' + ');const playerKey=(l:Leg)=>String(l.playerId||l.player).toLowerCase();const comboBets=settled.filter(b=>b.legs.filter(l=>!l.voided).length>=2);const exactMap=new Map<string,Bet[]>();for(const b of comboBets){const k=exactKey(b);exactMap.set(k,[...(exactMap.get(k)||[]),b])}const pairMap=new Map<string,Bet[]>();for(const b of comboBets){const ls=b.legs.filter(l=>!l.voided&&l.kind!=='TEAM');for(let i=0;i<ls.length;i++)for(let j=i+1;j<ls.length;j++){const k=[playerKey(ls[i]),playerKey(ls[j])].sort().join('|');const arr=pairMap.get(k)||[];if(!arr.some(x=>x.id===b.id))arr.push(b);pairMap.set(k,arr)}}
 const comboRows=[...(comboMode==='EXACT'?exactMap:pairMap).entries()].map(([key,arr])=>{const sum=summarize(arr);const wins=arr.filter(b=>b.status==='WON').length,losses=arr.filter(b=>b.status==='LOST').length;const sample=arr[0];let label='';if(comboMode==='EXACT')label=sample.legs.filter(l=>!l.voided).map(l=>`${l.player} ${l.qty}+ ${l.stat}`).join(' + ');else{const ids=key.split('|');const names=sample.legs.filter(l=>ids.includes(playerKey(l))).map(l=>l.player);label=[...new Set(names)].join(' + ')}return{key,arr,label,wins,losses,sum,roi:sum.betUnits?sum.units/sum.betUnits*100:0}}).sort((a,b)=>b.arr.length-a.arr.length||b.roi-a.roi);const chosen=comboRows.find(r=>r.key===selectedCombo)||comboRows[0];
 const oddsPoints=chosen?[...chosen.arr].sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt))).map(b=>({date:b.date,book:b.book,odds:b.odds,units:b.units,status:b.status,pl:calc(b).units})):[];const normalizedOdds=oddsPoints.filter(x=>x.odds!=null).map(x=>{const o=Number(x.odds);return o>0?100/(o+100):Math.abs(o)/(Math.abs(o)+100)});const avgProb=normalizedOdds.length?normalizedOdds.reduce((a,b)=>a+b,0)/normalizedOdds.length:null;const avgAmerican=avgProb==null?null:(avgProb>=.5?-Math.round(100*avgProb/(1-avgProb)):Math.round(100*(1-avgProb)/avgProb));
 function openRebet(b:Bet){setRebetSource(b);setRebetBook(b.book||'Fanatics');setRebetUnits(String(b.legs.some(l=>l.stat==='Point'&&l.qty>=2)?.5:b.units||1));setRebetOdds('');setRebetStatus('')}
 async function commitRebet(){if(!rebetSource)return;setRebetStatus('RESOLVING TODAY’S NHL SLATE…');try{const resolved:Leg[]=[];const boxes=await Promise.all(games.map(async g=>({g,box:await window.nhlTracker.boxscore(g.id)})));for(const old of rebetSource.legs){if(old.kind==='TEAM'){setRebetStatus('TEAM-BET REBET IS NOT AVAILABLE YET');return}let found:any=null;for(const x of boxes){const ids=boxscoreIdentities(x.box,x.g.id);if(ids.some(i=>old.playerId?i.playerId===old.playerId:i.player.toLowerCase()===old.player.toLowerCase())){const away=abbr(x.g.awayTeam),home=abbr(x.g.homeTeam);const raw=JSON.stringify(x.box?.playerByGameStats?.awayTeam||{});const onAway=old.playerId?raw.includes(`\"playerId\":${old.playerId}`):raw.toLowerCase().includes(old.player.toLowerCase());found={...old,gameId:String(x.g.id),team:onAway?away:home,opponent:onAway?home:away,voided:false};break}}if(!found){setRebetStatus(`${old.player.toUpperCase()} IS NOT ON TODAY’S NHL SLATE`);return}resolved.push(found)}const verified=await verifiedPlayerLegs(resolved,games);const u=Number(rebetUnits);const o=Number(rebetOdds);if(!rebetBook.trim()||!Number.isFinite(u)||u<=0||!Number.isFinite(o)){setRebetStatus('ENTER SPORTSBOOK, UNITS AND AMERICAN ODDS');return}const ids=[...new Set(resolved.map(l=>l.gameId).filter(Boolean))];const now=new Date().toISOString();const nb:Bet={id:`BET-${Date.now()}`,date:localDate(),legs:verified,book:rebetBook.trim(),units:u,unitSize,odds:o,createdAt:now,groupKey:ids.length===1?ids[0]:'MULTI',status:'PENDING',category:rebetSource.category||'COMBOS',source:'LIVE'};setBets((old:Bet[])=>[...old,nb]);setRebetStatus('REBET ADDED ✓');setTimeout(()=>setRebetSource(null),650)}catch(e:any){setRebetStatus(`REBET FAILED · ${e?.message||'NHL lookup failed'}`)}}
 const gameLabel=(bs:Bet[],key:string)=>{if(key==='MULTI')return'MULTI-GAME';const teams=[...new Set(bs.flatMap(b=>b.legs.flatMap(l=>[l.team,l.opponent])).filter(Boolean))] as string[];return teams.length===2?`${teams[0]} vs ${teams[1]}`:teams.join(' / ')||'UNRESOLVED'};
 return <main><div className="deepAnalyticsSwitcher"><button className={analyticsView==='DEEP'?'active':''} onClick={()=>setAnalyticsView('DEEP')}>DEEP BET ANALYTICS</button><button className={analyticsView==='HISTORY'?'active':''} onClick={()=>setAnalyticsView('HISTORY')}>EXISTING BET PERFORMANCE</button></div>{analyticsView==='DEEP'?<DeepComboAnalytics bets={bets}/>:<><section className="toolbar"><div><h1>BET PERFORMANCE</h1><p>Bankroll movement, combo intelligence, odds history and settled wager history.</p></div></section><section className="historyFilters"><div>{(['YTD','MONTH','WEEK'] as const).map(x=><button className={range===x?'selected':''} onClick={()=>setRange(x)} key={x}>{x}</button>)}</div><div>{(['ALL','COMBOS','ASSISTS','OTHER'] as const).map(x=><button className={category===x?'selected':''} onClick={()=>setCategory(x)} key={x}>{x}</button>)}</div><label className="bookFilter">SPORTSBOOK<select value={book} onChange={e=>setBook(e.target.value)}><option value="ALL">ALL</option>{books.map(x=><option key={x}>{x}</option>)}</select></label></section><section className="historySummary"><div><small>UNITS BET</small><b>{totals.betUnits.toFixed(2)}u</b></div><div><small>UNITS WON</small><b>{totals.wonUnits.toFixed(2)}u</b></div><div><small>PROFIT / LOSS</small><b className={totals.net>=0?'good':'bad'}>{totals.net>=0?'+':''}${totals.net.toFixed(2)}</b></div><div><small>NET UNITS</small><b className={totals.units>=0?'good':'bad'}>{totals.units>=0?'+':''}{totals.units.toFixed(2)}u</b></div><div><small>BETS</small><b>{filtered.length}</b></div></section>
 <section className="comboLab"><div className="sectionTitle"><div><b>MATCHUP COMBO ANALYZER</b><span>Historical exact-leg combinations and player pair performance</span></div><div className="breakdownToggle"><button className={comboMode==='EXACT'?'selected':''} onClick={()=>{setComboMode('EXACT');setSelectedCombo('')}}>EXACT COMBOS</button><button className={comboMode==='PAIR'?'selected':''} onClick={()=>{setComboMode('PAIR');setSelectedCombo('')}}>PLAYER PAIRS</button></div></div>{comboRows.length===0?<div className="empty">No settled multi-leg history yet.</div>:<div className="comboLabGrid"><div className="comboRows">{comboRows.slice(0,30).map(r=><button key={r.key} className={`comboRow ${chosen?.key===r.key?'selected':''}`} onClick={()=>setSelectedCombo(r.key)}><span><b>{r.label}</b><small>{r.arr.length} historical bet{r.arr.length===1?'':'s'}</small></span><strong className={r.sum.units>=0?'good':'bad'}>{r.wins}W–{r.losses}L · {r.sum.units>=0?'+':''}{r.sum.units.toFixed(2)}u</strong><em className={r.roi>=0?'good':'bad'}>{r.roi>=0?'+':''}{r.roi.toFixed(1)}% ROI</em></button>)}</div>{chosen&&<div className="comboDetail"><div className="comboHero"><small>{comboMode==='EXACT'?'EXACT LEG CONFIGURATION':'BETS INCLUDING THIS PAIR'}</small><h3>{chosen.label}</h3><div><b>{chosen.wins}W–{chosen.losses}L</b><b className={chosen.sum.units>=0?'good':'bad'}>{chosen.sum.units>=0?'+':''}{chosen.sum.units.toFixed(2)}u</b><b>{chosen.arr.length?((chosen.wins/chosen.arr.length)*100).toFixed(1):'0.0'}% HIT</b><b className={chosen.roi>=0?'good':'bad'}>{chosen.roi>=0?'+':''}{chosen.roi.toFixed(1)}% ROI</b></div></div><div className="oddsHistory"><div className="historySectionTitle"><b>ODDS HISTORY</b><span>{avgAmerican==null?'No priced history':`Normalized average ${avgAmerican>0?'+':''}${avgAmerican}`}</span></div>{oddsPoints.map((x,i)=><div className="oddsPoint" key={`${x.date}-${i}`}><span>{x.date}</span><b>{x.book}</b><span>{x.odds==null?'—':`${x.odds>0?'+':''}${x.odds}`}</span><span>{x.units.toFixed(2)}u</span><strong className={x.pl>=0?'good':'bad'}>{x.status} · {x.pl>=0?'+':''}{x.pl.toFixed(2)}u</strong></div>)}</div>{comboMode==='EXACT'&&<button className="quickRebet" onClick={()=>openRebet(chosen.arr.at(-1)!)}>1-CLICK REBET</button>}</div>}</div>}</section>
 <section className="historyChart"><div className="sectionTitle"><b>CUMULATIVE NET UNITS</b><span>{start} → {latest}</span></div>{pts.length?<svg viewBox="0 0 800 200" role="img" aria-label="Cumulative net units chart"><line x1="20" x2="780" y1={180-((0-min)/span)*150} y2={180-((0-min)/span)*150}/><path d={path}/><text x="20" y="18">{max.toFixed(1)}u</text><text x="20" y="196">{min.toFixed(1)}u</text></svg>:<div className="empty">No settled bets in this filter.</div>}</section><section className="performanceRecords"><div><small>BEST DAY</small><b>{bestDay?`${bestDay.d} · ${bestDay.units>=0?'+':''}${bestDay.units.toFixed(2)}u`:'—'}</b></div><div><small>WORST DAY</small><b>{worstDay?`${worstDay.d} · ${worstDay.units>=0?'+':''}${worstDay.units.toFixed(2)}u`:'—'}</b></div><div><small>BEST CATEGORY</small><b>{bestCategory?`${bestCategory.c} · ${bestCategory.units>=0?'+':''}${bestCategory.units.toFixed(2)}u`:'—'}</b></div><div><small>CURRENT STREAK</small><b>{streak?`${streak}${streakType==='WON'?'W':'L'}`:'—'}</b></div></section><section className="performanceBreakdown"><div className="sectionTitle"><b>PERFORMANCE BREAKDOWN</b><div className="breakdownToggle"><button className={breakdown==='CATEGORY'?'selected':''} onClick={()=>setBreakdown('CATEGORY')}>CATEGORY</button><button className={breakdown==='SPORTSBOOK'?'selected':''} onClick={()=>setBreakdown('SPORTSBOOK')}>SPORTSBOOK</button></div></div><div className="breakdownHead"><span>{breakdown}</span><span>BETS</span><span>UNITS BET</span><span>UNITS WON</span><span>NET UNITS</span></div>{breakdownRows.map(r=><div className="breakdownRow" key={r.label}><b>{r.label}</b><span>{r.count}</span><span>{r.betUnits.toFixed(2)}u</span><span>{r.wonUnits.toFixed(2)}u</span><strong className={r.units>=0?'good':'bad'}>{r.units>=0?'+':''}{r.units.toFixed(2)}u</strong></div>)}</section><section className="historyDays"><div className="historySectionTitle"><b>BET HISTORY</b><span>Day → Game → Wager</span></div>{byDay.map(d=>{const bs=filtered.filter(b=>b.date===d);const net=summarize(bs).units;const groups=[...new Set(bs.map(b=>b.groupKey||'UNRESOLVED'))];return <details key={d}><summary><b>{d}</b><span>{verified.has(d)?'✓ FINALIZED':'HISTORICAL'} · {bs.length} bets · {net>=0?'+':''}{net.toFixed(2)}u</span></summary><div className="historyGames">{groups.map(g=>{const gb=bs.filter(b=>(b.groupKey||'UNRESOLVED')===g),gn=summarize(gb).units;return <details key={g}><summary><b>{gameLabel(gb,g)}</b><span>{gb.length} bet{gb.length===1?'':'s'} · {gn>=0?'+':''}{gn.toFixed(2)}u</span></summary><div>{gb.map(b=><div className="historyBet" key={b.id}><span>{b.book} · {b.category||'COMBOS'}</span><b>{b.legs.map(l=>`${l.player} ${l.qty}${l.stat[0]}`).join(' + ')}</b><span>{b.status} · {calc(b).units>=0?'+':''}{calc(b).units.toFixed(2)}u</span></div>)}</div></details>})}</div></details>})}</section>
 {rebetSource&&<div className="modalShade" onMouseDown={e=>{if(e.target===e.currentTarget)setRebetSource(null)}}><section className="rebetModal"><div className="sectionTitle"><div><b>1-CLICK REBET</b><span>Resolve these players onto today’s NHL slate</span></div><button onClick={()=>setRebetSource(null)}>×</button></div><div className="rebetLegs">{rebetSource.legs.map((l,i)=><div key={i}><b>{l.player}</b><span>{l.qty}+ {l.stat}</span></div>)}</div><div className="rebetFields"><label>SPORTSBOOK<select value={rebetBook} onChange={e=>setRebetBook(e.target.value)}>{BOOKS.map(x=><option key={x}>{x}</option>)}</select></label><label>UNITS<input value={rebetUnits} onChange={e=>setRebetUnits(e.target.value)}/></label><label>AMERICAN ODDS<input value={rebetOdds} onChange={e=>setRebetOdds(e.target.value)} placeholder="+250"/></label></div><button className="quickRebet commit" onClick={commitRebet}>ADD REBET</button>{rebetStatus&&<div className="notice">{rebetStatus}</div>}</section></div>}
 </>}</main>
}
function TeamPerformance({bets,unitSize,leagueStandings}:{bets:Bet[],unitSize:number,leagueStandings:any[]}){
 void unitSize;
 const[sortKey,setSortKey]=useState<'team'|'bet'|'won'|'net'|'againstBet'|'againstWon'|'againstNet'|'gf'|'gfRank'|'ga'|'gaRank'>('net');const[sortDir,setSortDir]=useState<1|-1>(-1)
 const standing=(team:string)=>leagueStandings.find((x:any)=>(x.teamAbbrev?.default||x.teamAbbrev)===team)
 const seasonMetric=(team:string,key:'gf'|'ga')=>{const x=standing(team);const gp=Number(x?.gamesPlayed||0);const total=Number(key==='gf'?(x?.goalFor??x?.goalsFor):(x?.goalAgainst??x?.goalsAgainst));return gp&&Number.isFinite(total)?total/gp:null}
 const rank=(team:string,key:'gf'|'ga')=>{const vals=ALL_TEAMS.map(t=>({t,v:seasonMetric(t,key)})).filter(x=>x.v!=null) as {t:string,v:number}[];vals.sort((a,b)=>b.v-a.v);const i=vals.findIndex(x=>x.t===team);return i<0?null:i+1}
 const perf=(arr:Bet[])=>{const settled=arr.filter(b=>(b.status||'PENDING')!=='PENDING');const bet=settled.reduce((n,b)=>n+b.units,0);const won=settled.reduce((n,b)=>{if((b.status||'PENDING')!=='WON')return n;const stake=b.units*b.unitSize;const returned=b.payout!=null?b.payout:b.odds!=null?stake+(b.odds>0?stake*b.odds/100:stake*100/Math.abs(b.odds)):stake;return n+(b.unitSize?returned/b.unitSize:0)},0);return{bet,won,net:won-bet}}
 const rows=ALL_TEAMS.map(team=>{const own=perf(bets.filter(b=>b.legs.some(l=>l.team===team)));const against=perf(bets.filter(b=>b.legs.some(l=>l.opponent===team)));return{team,own,against,gf:seasonMetric(team,'gf'),ga:seasonMetric(team,'ga'),gfRank:rank(team,'gf'),gaRank:rank(team,'ga')}})
 const value=(r:any,k:typeof sortKey)=>k==='team'?r.team:k==='bet'?r.own.bet:k==='won'?r.own.won:k==='net'?r.own.net:k==='againstBet'?r.against.bet:k==='againstWon'?r.against.won:k==='againstNet'?r.against.net:k==='gf'?r.gf:k==='gfRank'?r.gfRank:k==='ga'?r.ga:r.gaRank
 const sorted=[...rows].sort((a,b)=>{const av=value(a,sortKey),bv=value(b,sortKey);if(typeof av==='string')return av.localeCompare(bv)*sortDir;if(av==null&&bv==null)return 0;if(av==null)return 1;if(bv==null)return-1;return(av-bv)*sortDir})
 const sort=(k:typeof sortKey)=>{if(sortKey===k)setSortDir(d=>(d*-1) as 1|-1);else{setSortKey(k);setSortDir(k==='team'?1:-1)}}
 const fmt=(v:number|null,d=2)=>v==null?'—':v.toFixed(d);const cls=(v:number)=>v>0?'good':v<0?'bad':'';const arrow=(k:typeof sortKey)=>sortKey===k?(sortDir===-1?' ▼':' ▲'):''
 const H=({k,children}:{k:typeof sortKey,children:any})=><button onClick={()=>sort(k)}>{children}{arrow(k)}</button>
 return <main><section className="toolbar"><div><h1>TEAM PERFORMANCE</h1><p>Team-by-team betting results alongside NHL scoring and defensive performance.</p></div></section><section className="teamLeaderboard teamPerformanceTable"><div className="teamLeaderboardHead performanceColumns"><H k="team">TEAM</H><H k="bet">UNITS BET</H><H k="won">UNITS WON</H><H k="net">PROFIT / LOSS</H><H k="againstBet">UNITS BET AGAINST</H><H k="againstWon">UNITS WON AGAINST</H><H k="againstNet">AGAINST P/L</H><H k="gf">G / GAME</H><H k="gfRank">G/G RANK</H><H k="ga">GA / GAME</H><H k="gaRank">GA/G RANK</H></div>{sorted.map(r=><div className="teamPerformanceMain performanceColumns" key={r.team}><b>{r.team}</b><span>{r.own.bet.toFixed(2)}u</span><span>{r.own.won.toFixed(2)}u</span><strong className={cls(r.own.net)}>{r.own.net>=0?'+':''}{r.own.net.toFixed(2)}u</strong><span>{r.against.bet.toFixed(2)}u</span><span>{r.against.won.toFixed(2)}u</span><strong className={cls(r.against.net)}>{r.against.net>=0?'+':''}{r.against.net.toFixed(2)}u</strong><span>{fmt(r.gf)}</span><span className="centerMetric">{r.gfRank?`#${r.gfRank}`:'—'}</span><span>{fmt(r.ga)}</span><span className="centerMetric">{r.gaRank?`#${r.gaRank}`:'—'}</span></div>)}</section><div className="analysisNote teamPerfNote">Units Won is total returned units, including stake. Profit/Loss is Units Won minus Units Bet. A wager is counted once for each team represented in that wager, and once against each opponent represented.</div></main>
}

function versionParts(v:string){return String(v||'').replace(/^v/i,'').split('.').map(x=>Number(x)||0)}
function newerVersion(latest:string,current:string){const a=versionParts(latest),b=versionParts(current);for(let i=0;i<Math.max(a.length,b.length);i++){const d=(a[i]||0)-(b[i]||0);if(d!==0)return d>0}return false}
function AppUpdates(){
 const [state,setState]=useState<any>({kind:'IDLE',installed:installedAppVersion});const [checking,setChecking]=useState(false)
 const check=async()=>{setChecking(true);setState((x:any)=>({...x,kind:'CHECKING'}));try{const r=await window.nhlTracker.updateInfo();const installed=String(r?.installedVersion||installedAppVersion).replace(/^v/i,'');if(r?.status==='NO_RELEASE')setState({kind:'NO_RELEASE',installed});else if(r?.status==='ERROR')setState({kind:'ERROR',installed,message:r?.message});else{const latest=String(r?.latestVersion||'').replace(/^v/i,'');setState({kind:newerVersion(latest,installed)?'UPDATE':'CURRENT',installed,latest,url:r?.releaseUrl})}}catch(e:any){setState({kind:'ERROR',installed:state.installed||installedAppVersion,message:e?.message||'Unable to check for updates.'})}finally{setChecking(false)}}
 return <section className="settingsCard appUpdates"><div className="appUpdatesHead"><div><h2>App Updates</h2><p>Check GitHub manually for a newer NHL Tracker release. Nothing downloads or installs automatically.</p></div><div className="installedVersion"><small>INSTALLED VERSION</small><b>v{state.installed||installedAppVersion}</b></div></div><div className="updateActions"><button onClick={check} disabled={checking}>{checking?'CHECKING…':'CHECK FOR UPDATES'}</button>{state.kind==='UPDATE'&&state.url&&<button className="downloadUpdate" onClick={()=>window.nhlTracker.openUpdateUrl(state.url)}>DOWNLOAD UPDATE</button>}</div>{state.kind==='NO_RELEASE'&&<div className="updateStatus neutral"><b>NO PUBLISHED RELEASE YET</b><span>The repository is connected correctly. Publish the first GitHub Release when v1.7.0 is ready.</span></div>}{state.kind==='CURRENT'&&<div className="updateStatus good"><b>UP TO DATE</b><span>v{state.installed} is the latest published version.</span></div>}{state.kind==='UPDATE'&&<div className="updateStatus available"><b>UPDATE AVAILABLE · v{state.latest}</b><span>Installed: v{state.installed}. Open the GitHub release to download the installer.</span></div>}{state.kind==='ERROR'&&<div className="updateStatus bad"><b>UNABLE TO CHECK FOR UPDATES</b><span>{state.message||'Check your internet connection and try again.'}</span></div>}</section>
}

function DataManagement({bets,setBets,unitSize,defaultDate,isTestMode}:{bets:Bet[],setBets:any,unitSize:number,defaultDate:string,isTestMode:boolean}){
 const[exportDate,setExportDate]=useState(defaultDate),[retroStart,setRetroStart]=useState(defaultDate),[retroEnd,setRetroEnd]=useState(defaultDate),[retroBusy,setRetroBusy]=useState(false),[notice,setNotice]=useState('');const fileRef=useRef<HTMLInputElement>(null),backupFileRef=useRef<HTMLInputElement>(null)
 const portableRow=(b:Bet)=>{const row:any={BetID:b.id,Date:b.date,Category:b.category||'COMBOS',Sportsbook:b.book,Units:b.units,UnitSize:b.unitSize,'American Odds':b.odds??'',Payout:b.payout??'','Bonus Bet':b.bonusBet?'YES':'NO',Status:b.status||'PENDING'};for(let i=0;i<6;i++){const l=b.legs[i];row[`Player ${i+1}`]=l?.player||'';row[`Market ${i+1}`]=l?.stat||'';row[`Target ${i+1}`]=l?.qty??''}return row}
 async function exportRetroComboReport(){
  if(retroStart>retroEnd){setNotice('Retro report: start date must not be after end date.');return}
  setRetroBusy(true);setNotice('Checking historical NHL boxscores for 1P + 1P combos…')
  try{
   const selected=bets.filter(b=>b.date>=retroStart&&b.date<=retroEnd&&b.legs.filter(l=>!l.voided&&l.kind!=='TEAM'&&/^(point|points|p)$/i.test(l.stat.trim())).length>=2)
   const gameIds=[...new Set(selected.flatMap(b=>b.legs.map(l=>String(l.gameId||'')).filter(Boolean)))];
   const boxResults=await Promise.allSettled(gameIds.map(async id=>[id,flattenBoxscore(await window.nhlTracker.boxscore(Number(id)),Number(id))] as const))
   const stats:LiveStats={};const failed=new Set<string>();boxResults.forEach((r,i)=>{if(r.status==='fulfilled')Object.assign(stats,r.value[1]);else failed.add(gameIds[i])})
   const pairs=new Map<string,any>();let missing=0;
   for(const b of selected){
    const eligible=b.legs.filter(l=>!l.voided&&l.kind!=='TEAM'&&/^(point|points|p)$/i.test(l.stat.trim())&&l.gameId)
    for(let i=0;i<eligible.length;i++)for(let j=i+1;j<eligible.length;j++){
     const a=eligible[i],c=eligible[j];if(String(a.gameId)!==String(c.gameId))continue;
     const [first,second]=[a,c].sort((x,y)=>String(x.playerId||x.player).localeCompare(String(y.playerId||y.player)));
     const team=first.team&&first.team===second.team?first.team:'';
     if(!team)continue;
     const key=[b.date,first.gameId,team,first.playerId||first.player,second.playerId||second.player].join('|');
     const s1=first.playerId?stats[`${first.gameId}:${first.playerId}`]:undefined;
     const s2=second.playerId?stats[`${second.gameId}:${second.playerId}`]:undefined;
     const result=s1&&s2?(s1.points>=1&&s2.points>=1?'HIT':'MISSED'):'UNVERIFIED';
     if(!s1||!s2)missing++;
     if(!pairs.has(key))pairs.set(key,{Date:b.date,GameID:first.gameId,Team:team,Opponent:first.opponent||second.opponent||'',PlayerA:first.player,PlayerB:second.player,PlayerAPoints:s1?.points??'',PlayerBPoints:s2?.points??'',NormalizedCombo:'1P + 1P',ComboResult:result,SourceWagerIDs:b.id,SourceWagerStatus:b.status||'PENDING',LineupStatus:'NOT RECORDED',OriginalTargets:`${a.qty}P + ${c.qty}P`,Notes:result==='UNVERIFIED'?'Missing player ID or historical boxscore; not counted as MISSED':''});
     else {const row=pairs.get(key);row.SourceWagerIDs+='; '+b.id}
    }
   }
   const rows=[...pairs.values()].sort((a,b)=>a.Date.localeCompare(b.Date)||a.Team.localeCompare(b.Team)||a.PlayerA.localeCompare(b.PlayerA));
   if(!rows.length){setNotice('No same-team, same-game point pairings with game IDs found for the selected dates.');return}
   const summaryMap=new Map<string,{team:string,opp:string,hit:number,miss:number,unverified:number}>();
   for(const r of rows){const k=r.Team+'|'+r.Opponent;const x=summaryMap.get(k)||{team:r.Team,opp:r.Opponent,hit:0,miss:0,unverified:0};if(r.ComboResult==='HIT')x.hit++;else if(r.ComboResult==='MISSED')x.miss++;else x.unverified++;summaryMap.set(k,x)}
   const summary=[...summaryMap.values()].map(x=>({Team:x.team,Opponent:x.opp,HIT:x.hit,MISSED:x.miss,UNVERIFIED:x.unverified,'Hit Rate %':x.hit+x.miss?Math.round(10000*x.hit/(x.hit+x.miss))/100:'', 'Graded Combos':x.hit+x.miss})).sort((a,b)=>a.Team.localeCompare(b.Team)||a.Opponent.localeCompare(b.Opponent));
   const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(summary),'Team Summary');XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'1P + 1P Pairs');
   XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['RETRO COMBO REPORT'],['Dates',retroStart,retroEnd],['Rule','Both players score at least one point in same NHL game'],['Deduplication','One pair per game, team, date; source wager IDs retained'],['Eligibility','Only same-game, same-team point-leg pairings from saved wagers'],['Unverified','Missing player IDs or historical boxscores are never graded as misses'],['Financial units','Not assigned to normalized 1P + 1P pairs; original wager may have different targets'],['Lineup status','Not inferred retrospectively; NOT RECORDED unless separately stored']]),'Methodology');
   XLSX.writeFile(wb,`NHL-Retro-Combo-1P1P-${retroStart}-to-${retroEnd}.xlsx`);
   setNotice(`Retro report exported: ${rows.length} unique pairings · ${rows.filter(r=>r.ComboResult==='HIT').length} HIT · ${rows.filter(r=>r.ComboResult==='MISSED').length} MISSED · ${rows.filter(r=>r.ComboResult==='UNVERIFIED').length} UNVERIFIED${failed.size?` · ${failed.size} boxscores unavailable`:''}`)
  }catch(e:any){setNotice('Retro report failed: '+String(e?.message||e))}finally{setRetroBusy(false)}
 }
 function exportFullProfile(){if(!bets.length){setNotice('No bets to export');return}const wb=XLSX.utils.book_new(),ws=XLSX.utils.json_to_sheet(bets.map(portableRow));XLSX.utils.book_append_sheet(wb,ws,'Bets');XLSX.writeFile(wb,`NHL-Tracker-Full-Bet-Profile-${localDate()}.xlsx`);setNotice(`Exported full betting profile · ${bets.length} wagers`)}
 function exportXlsx(){const rows=bets.filter(b=>b.date===exportDate).map(portableRow);if(!rows.length){setNotice(`No wagers found for ${exportDate}`);return}const wb=XLSX.utils.book_new(),ws=XLSX.utils.json_to_sheet(rows);ws['!cols']=[{wch:22},{wch:12},{wch:12},{wch:16},{wch:9},{wch:10},{wch:14},{wch:11},{wch:11},...Array.from({length:18},(_,i)=>({wch:i%3===0?24:i%3===1?13:10}))];XLSX.utils.book_append_sheet(wb,ws,'Bets');XLSX.writeFile(wb,`NHL-Tracker-Bets-${exportDate}.xlsx`);setNotice(`Exported ${rows.length} wager${rows.length===1?'':'s'} for ${exportDate}`)}
 function downloadTemplate(){const examples:any[]=[{BetID:'',Date:exportDate,Category:'COMBOS',Sportsbook:'Kalshi',Units:1,UnitSize:unitSize,'American Odds':142,Payout:'',Status:'PENDING','Player 1':'Connor McDavid','Market 1':'Point','Target 1':1,'Player 2':'Leon Draisaitl','Market 2':'Point','Target 2':1},{BetID:'',Date:exportDate,Category:'ASSISTS',Sportsbook:'Fanatics',Units:.5,UnitSize:unitSize,'American Odds':115,Payout:'',Status:'PENDING','Player 1':'Jack Hughes','Market 1':'Assist','Target 1':1}];for(const r of examples)for(let i=1;i<=6;i++){r[`Player ${i}`]??='';r[`Market ${i}`]??='';r[`Target ${i}`]??=''}const wb=XLSX.utils.book_new(),ws=XLSX.utils.json_to_sheet(examples);ws['!cols']=[{wch:22},{wch:12},{wch:12},{wch:16},{wch:9},{wch:10},{wch:14},{wch:11},{wch:11},...Array.from({length:18},(_,i)=>({wch:i%3===0?24:i%3===1?13:10}))];XLSX.utils.book_append_sheet(wb,ws,'Bets');const guide=XLSX.utils.aoa_to_sheet([['NHL TRACKER IMPORT TEMPLATE'],['One row = one wager. Delete the example rows before entering your own bets.'],['Category','COMBOS, ASSISTS, or OTHER'],['Market','Point, Assist, Goal, or Shot'],['Target','Required total for that leg, e.g. 1 or 2'],['BetID','Optional. Exports include it so re-importing the same wager is duplicate-safe.'],['Status','Usually PENDING when sharing a pregame card. WON and LOST are also accepted.'],['Players','Up to six legs per wager. Leave unused Player/Market/Target columns blank.']]);guide['!cols']=[{wch:20},{wch:90}];XLSX.utils.book_append_sheet(wb,guide,'Instructions');XLSX.writeFile(wb,'NHL-Tracker-Import-Template.xlsx');setNotice('Import template downloaded')}
 function importDate(v:any){if(typeof v==='number'&&Number.isFinite(v)){const d=XLSX.SSF.parse_date_code(v);if(d)return `${String(d.y).padStart(4,'0')}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`}if(v instanceof Date&&!Number.isNaN(v.getTime()))return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`;const t=String(v??'').trim();const iso=t.match(/^(\d{4})-(\d{2})-(\d{2})/);if(iso)return `${iso[1]}-${iso[2]}-${iso[3]}`;const d=new Date(t);return Number.isNaN(d.getTime())?exportDate:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
 async function resolveLegs(raw:any[],betDate:string){try{const slate=await window.nhlTracker.score(betDate);const games=(slate?.games||[]) as Game[];const teamGame=new Map<string,string>();for(const g of games){teamGame.set(abbr(g.awayTeam),String(g.id));teamGame.set(abbr(g.homeTeam),String(g.id))}const players:any[]=[];await Promise.all([...teamGame.keys()].map(async team=>{try{const r=await window.nhlTracker.roster(team);for(const section of ['forwards','defensemen','goalies'])for(const p of(r?.[section]||[])){const full=[name(p.firstName),name(p.lastName)].filter(Boolean).join(' ');if(full)players.push({id:Number(p.id),name:full,team,position:p.positionCode||'',gameId:teamGame.get(team)})}}catch{}}));return raw.map(l=>{const p=players.find(x=>x.name.toLowerCase()===String(l.player).toLowerCase());return{...l,player:p?.name||l.player,playerId:p?.id,team:p?.team,position:p?.position,gameId:p?.gameId} as Leg})}catch{return raw.map(l=>({...l} as Leg))}}
 function exportLiveMigrationBackup(){
  try{
   if(isTestMode){setNotice('LIVE migration backup is disabled in TEST mode.');return}
   const raw=localStorage.getItem('bets');
   if(raw===null)throw new Error('No local LIVE bets storage found; no backup was created');
   const live=JSON.parse(raw);
   if(!Array.isArray(live))throw new Error('LIVE bets storage is not an array');
   const ids=new Set<string>();
   for(const [i,b] of live.entries()){
    if(!b||typeof b.id!=='string'||!b.id||typeof b.date!=='string'||!Array.isArray(b.legs))throw new Error(`Invalid LIVE wager at index ${i}; export cancelled`);
    if(ids.has(b.id))throw new Error(`Duplicate LIVE wager ID ${b.id}; export cancelled`);
    ids.add(b.id);
   }
   const payload={format:'NHL_TRACKER_LIVE_MIGRATION_BACKUP',version:1,createdAt:new Date().toISOString(),sourceKey:'bets',environment:'LIVE',bets:live};
   const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
   const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`NHL-Tracker-LIVE-Migration-Backup-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
   setNotice(`LIVE migration backup exported · ${live.length} wagers · no cloud changes`);
  }catch(e:any){setNotice(`LIVE backup failed · ${e?.message||'Unknown error'}`)}
 }
 async function previewLiveMigrationFile(file:File){
  try{
   if(isTestMode)throw new Error('Only available in LIVE mode');
   const raw=JSON.parse(await file.text());
   const server=Array.isArray(raw)?raw:Array.isArray(raw?.bets)?raw.bets:Array.isArray(raw?.wagers)?raw.wagers.map((w:any)=>w?.wager??w):null;
   if(!server)throw new Error('Expected JSON array or bets/wagers array');
   const localRaw=localStorage.getItem('bets');if(localRaw===null)throw new Error('No local LIVE bets storage');
   const local=JSON.parse(localRaw);if(!Array.isArray(local))throw new Error('Invalid local LIVE storage');
   const check=(a:any[],label:string)=>{const m=new Map<string,string>();for(const [i,b] of a.entries()){if(!b||typeof b.id!=='string'||!b.id||typeof b.date!=='string'||!Array.isArray(b.legs))throw new Error(`${label}: invalid wager at ${i}`);if(m.has(b.id))throw new Error(`${label}: duplicate ID ${b.id}`);m.set(b.id,JSON.stringify(b))}return m};
   const l=check(local,'Local'),s=check(server,'Comparison');let fresh=0,identical=0,conflicts=0,serverOnly=0;
   for(const [id,value] of l){if(!s.has(id))fresh++;else if(value===s.get(id))identical++;else conflicts++}for(const id of s.keys())if(!l.has(id))serverOnly++;
   setNotice(`READ-ONLY PREVIEW · local ${l.size} · comparison ${s.size} · local-only ${fresh} · identical ${identical} · same-ID differences ${conflicts} · comparison-only ${serverOnly}. Nothing imported or uploaded.`);
  }catch(e:any){setNotice(`Preview failed · ${e?.message||'Invalid file'}`)}
 }
 const migrationPreviewRef=useRef<HTMLInputElement>(null);
 function backupAllData(){try{const storage:Record<string,string>={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k!=null)storage[k]=localStorage.getItem(k)??''}const payload={format:'NHL_TRACKER_FULL_BACKUP',version:1,createdAt:new Date().toISOString(),storage};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`NHL-Tracker-Full-Backup-${localDate()}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);setNotice(`Full backup created · ${Object.keys(storage).length} data records saved`)}catch(e:any){setNotice(`Backup failed · ${e.message||'Unable to create backup'}`)}}
 async function restoreAllData(file:File){try{const raw=JSON.parse(await file.text());if(raw?.format!=='NHL_TRACKER_FULL_BACKUP'||raw?.version!==1||!raw?.storage||typeof raw.storage!=='object')throw new Error('Not a valid NHL Tracker full backup');const keys=Object.keys(raw.storage);if(!keys.length)throw new Error('Backup contains no data');const ok=window.confirm(`Restore ${keys.length} NHL Tracker data records from this backup?\n\nThis replaces the app's current local data. Create a backup of the current data first if you may need it.`);if(!ok){setNotice('Restore cancelled');return}localStorage.clear();for(const[k,v]of Object.entries(raw.storage))localStorage.setItem(k,String(v));setNotice('Restore complete · restarting NHL Tracker…');setTimeout(()=>window.location.reload(),350)}catch(e:any){setNotice(`Restore failed · ${e.message||'Invalid backup file'}`)}}
 async function importFile(file:File){try{setNotice('Reading wager file…');const wb=XLSX.read(await file.arrayBuffer(),{type:'array'}),ws=wb.Sheets[wb.SheetNames[0]],rows:any[]=XLSX.utils.sheet_to_json(ws,{defval:'',raw:true});let added=0,dupes=0,invalid=0;const incoming:Bet[]=[];for(const r of rows){let raw:any[]=[];for(let i=1;i<=6;i++){const player=String(r[`Player ${i}`]??r[`Player${i}`]??'').trim();if(!player)continue;raw.push({player,qty:Number(r[`Target ${i}`]??r[`Target${i}`]??1)||1,stat:String(r[`Market ${i}`]??r[`Market${i}`]??'Point').trim()||'Point'})}if(!raw.length)raw=String(r.Legs||r.legs||'').split(';').map((x:string)=>{const[p,q,st]=x.split('|');return{player:p?.trim(),qty:Number(q)||1,stat:st?.trim()||'Point'}}).filter((l:any)=>l.player);if(!raw.length){invalid++;continue}const betDate=importDate(r.Date||r.date||exportDate);const legs=await resolveLegs(raw,betDate);const oddsRaw=r['American Odds']!==undefined?r['American Odds']:(r.Odds??r.odds??'');const payoutRaw=r.Payout??r.payout??'';const b=normalizeBet(betDate,legs,String(r.Sportsbook||r.book||'Imported'),Number(r.Units||r.units||1),Number(r.UnitSize||r.unitSize||unitSize),payoutRaw!==''?Number(payoutRaw):undefined,oddsRaw!==''?Number(oddsRaw):undefined);b.legs=legs;b.bonusBet=['YES','TRUE','1','Y'].includes(String(r['Bonus Bet']??r.BonusBet??'').trim().toUpperCase());const ids=[...new Set(legs.map(l=>l.gameId).filter(Boolean).map(String))];b.groupKey=ids.length===1?ids[0]:ids.length>1?'MULTI':'UNRESOLVED';b.category=(['ASSISTS','OTHER'].includes(String(r.Category||'').toUpperCase())?String(r.Category).toUpperCase():'COMBOS') as BetCategory;b.status=(['WON','LOST'].includes(String(r.Status).toUpperCase())?String(r.Status).toUpperCase():'PENDING') as BetStatus;const suppliedId=String(r.BetID||r.betId||'').trim();if(suppliedId)b.id=suppliedId;const duplicate=[...bets,...incoming].some(x=>x.id===b.id||(!suppliedId&&x.date===b.date&&x.book.toLowerCase()===b.book.toLowerCase()&&x.units===b.units&&x.legs.length===b.legs.length&&x.legs.every((l,i)=>l.player.toLowerCase()===b.legs[i].player.toLowerCase()&&l.qty===b.legs[i].qty&&l.stat.toLowerCase()===b.legs[i].stat.toLowerCase())));if(duplicate){dupes++;continue}if(b.legs.some(l=>l.kind!=='TEAM'&&(!Number.isInteger(Number(l.playerId))||Number(l.playerId)<=0||!l.gameId))){invalid++;continue}incoming.push(b);added++}setBets((x:Bet[])=>[...incoming,...x]);const unresolved=incoming.filter(b=>b.groupKey==='UNRESOLVED').length;setNotice(`Import complete · ${added} new · ${dupes} duplicate${dupes===1?'':'s'} skipped${invalid?` · ${invalid} invalid`:''}${unresolved?` · ${unresolved} need resolution`:''}`)}catch(e:any){setNotice(`Import failed · ${e.message||'Invalid workbook'}`)}}
 return <section className="settingsCard dataManagement"><div className="dataManagementHead"><div><h2>Data Management</h2><p>Import, export and share NHL Tracker wagers using one portable workbook format.</p></div><label>EXPORT DATE<input type="date" value={exportDate} onChange={e=>setExportDate(e.target.value)}/></label></div><div style={{border:'1px solid #475569',borderRadius:10,padding:14,margin:'12px 0',display:'grid',gap:10}}><strong>RETRO COMBO REPORT · 1P + 1P</strong><small>Grade historical same-game player pairs against NHL boxscores. HIT / MISSED / UNVERIFIED, team summaries, and source wager IDs.</small><div style={{display:'flex',gap:12,flexWrap:'wrap'}}><label>FROM <input type="date" value={retroStart} onChange={e=>setRetroStart(e.target.value)}/></label><label>TO <input type="date" value={retroEnd} onChange={e=>setRetroEnd(e.target.value)}/></label></div><button disabled={retroBusy} onClick={exportRetroComboReport}>{retroBusy?'GENERATING REPORT…':'GENERATE RETRO COMBO REPORT (XLSX)'}</button></div>{!isTestMode&&<div style={{border:'1px solid #54748c',borderRadius:10,padding:14,margin:'12px 0',display:'grid',gap:9}}><strong>LIVE CLOUD MIGRATION · SAFETY TOOLS</strong><small>Offline only. Export the untouched LIVE localStorage wager records, or compare them against a JSON wager snapshot. No uploads, imports or database writes.</small><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button onClick={exportLiveMigrationBackup}>EXPORT LIVE MIGRATION BACKUP</button><button onClick={()=>migrationPreviewRef.current?.click()}>PREVIEW AGAINST JSON SNAPSHOT</button></div><input ref={migrationPreviewRef} type="file" accept=".json,application/json" hidden onChange={e=>{const f=e.target.files?.[0];if(f)void previewLiveMigrationFile(f);e.currentTarget.value=''}}/></div>}<div className="dataActions"><button onClick={backupAllData}><b>BACK UP ALL DATA</b><span>Save bets, history, settings and local NHL Tracker data</span></button><button onClick={()=>backupFileRef.current?.click()}><b>RESTORE FULL BACKUP</b><span>Restore a complete NHL Tracker backup</span></button><button onClick={()=>fileRef.current?.click()}><b>IMPORT BETS</b><span>Load a shared NHL Tracker workbook</span></button><button onClick={exportFullProfile}><b>EXPORT FULL BET PROFILE</b><span>All dates · all wagers for importing into DEV</span></button><button onClick={exportXlsx}><b>EXPORT DAY</b><span>Share every wager from {exportDate}</span></button><button onClick={downloadTemplate}><b>DOWNLOAD TEMPLATE</b><span>Blank format with examples and instructions</span></button></div><input ref={backupFileRef} type="file" accept=".json,application/json" hidden onChange={e=>{const f=e.target.files?.[0];if(f)restoreAllData(f);e.currentTarget.value=''}}/><input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={e=>{const f=e.target.files?.[0];if(f)importFile(f);e.currentTarget.value=''}}/>{notice&&<div className="notice dataNotice">{notice}</div>}<LegacyHistoricalMaintenance bets={bets} setBets={setBets} unitSize={unitSize}/></section>
}

function LegacyHistoricalMaintenance({bets,setBets,unitSize}:{bets:Bet[],setBets:any,unitSize:number}){
 const[importStatus,setImportStatus]=useState('');const[unresolvedLegs,setUnresolvedLegs]=useState<{player:string;date:string;combo:string}[]>([])
 const installed=bets.filter(b=>b.source==='HISTORICAL_REVIEW');const mapped=installed.reduce((n,b)=>n+b.legs.filter(l=>l.playerId&&l.gameId).length,0);const unresolved=installed.filter(b=>b.legs.some(l=>!l.playerId||!l.gameId)).length
 const playerName=(x:any)=>name(x?.name)||name(x?.fullName)||[name(x?.firstName),name(x?.lastName)].filter(Boolean).join(' ').trim()
 const playerKey=(value:string)=>{const key=String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[’‘`´]/g,"'").replace(/[‐‑‒–—]/g,'-').replace(/[^a-zA-Z0-9' -]/g,'').replace(/\s+/g,' ').trim().toLowerCase();const aliases:Record<string,string>={'max shabanov':'maxim shabanov'};return aliases[key]||key};const loosePlayerKey=(value:string)=>playerKey(value).replace(/[^a-z0-9]/g,'')
 const collectPlayers=(node:any,out:any[])=>{if(Array.isArray(node)){node.forEach(x=>collectPlayers(x,out));return}if(!node||typeof node!=='object')return;const pid=node.playerId??node.id;if(pid&&playerName(node))out.push({...node,playerId:pid});Object.values(node).forEach(v=>{if(v&&typeof v==='object')collectPlayers(v,out)})}
 async function importHistoricalKalshi(){
  setImportStatus('Building historical player resolver…');try{
   const byDate=new Map<string,any[]>();for(const r of HISTORICAL_KALSHI){const d=localDateFromISO(r.placedAt);if(!byDate.has(d))byDate.set(d,[]);byDate.get(d)!.push(r)}
   // Boxscores only contain players who dressed. Build a league-wide roster fallback so scratches,
   // preseason roster players and other non-dressed players can still be attached to their team.
   const rosterLookup=new Map<string,{playerId:number;team:string}>();const looseRoster=new Map<string,{playerId:number;team:string}|null>();
   await Promise.all(ALL_TEAMS.map(async team=>{try{const roster=await window.nhlTracker.roster(team);const players:any[]=[];collectPlayers(roster,players);for(const x of players){const nm=playerKey(playerName(x));if(nm&&!rosterLookup.has(nm))rosterLookup.set(nm,{playerId:Number(x.playerId),team});const lk=loosePlayerKey(playerName(x));if(lk){const prior=looseRoster.get(lk);const candidate={playerId:Number(x.playerId),team};if(prior===undefined)looseRoster.set(lk,candidate);else if(prior&&(prior.playerId!==candidate.playerId||prior.team!==candidate.team))looseRoster.set(lk,null)}}}catch{}}))
   const incoming:Bet[]=[];let invalid=0;const unresolvedRows:{player:string;date:string;combo:string}[]=[];let unresolved=0,resolvedByBox=0,resolvedByRoster=0
   for(const [d,records] of byDate){setImportStatus(`Resolving ${d}…`);const slate=await window.nhlTracker.score(d);const games=slate?.games||[];
    const teamGame=new Map<string,{opponent:string;gameId:string}>();for(const g of games){const away=abbr(g.awayTeam),home=abbr(g.homeTeam);teamGame.set(away,{opponent:home,gameId:String(g.id)});teamGame.set(home,{opponent:away,gameId:String(g.id)})}
    const lookup=new Map<string,{playerId:number;team:string;opponent:string;gameId:string}>();const looseLookup=new Map<string,{playerId:number;team:string;opponent:string;gameId:string}|null>();
    for(const g of games){try{const box=await window.nhlTracker.boxscore(Number(g.id));const away:string=abbr(g.awayTeam),home:string=abbr(g.homeTeam);for(const side of ['awayTeam','homeTeam'] as const){const arr:any[]=[];collectPlayers(box?.playerByGameStats?.[side]||box?.boxscore?.playerByGameStats?.[side],arr);const team=side==='awayTeam'?away:home,opponent=side==='awayTeam'?home:away;for(const x of arr){const nm=playerKey(playerName(x));if(nm)lookup.set(nm,{playerId:Number(x.playerId),team,opponent,gameId:String(g.id)});const lk=loosePlayerKey(playerName(x));if(lk){const candidate={playerId:Number(x.playerId),team,opponent,gameId:String(g.id)};const prior=looseLookup.get(lk);if(prior===undefined)looseLookup.set(lk,candidate);else if(prior&&prior.playerId!==candidate.playerId)looseLookup.set(lk,null)}}}}catch{}}
    for(const r of records){const combo=r.legs.map((leg:any)=>`${leg.player} ${leg.threshold}+ ${String(leg.stat||'points')}`).join(' + ');void combo;const legs:Leg[]=r.legs.map((x:any)=>{const key=playerKey(x.player);let hit=lookup.get(key);if(hit)resolvedByBox++;if(!hit){const loose=looseLookup.get(loosePlayerKey(x.player));if(loose){hit=loose;resolvedByBox++}}if(!hit){const rr=rosterLookup.get(key)||looseRoster.get(loosePlayerKey(x.player))||undefined;const tg=rr&&teamGame.get(rr.team);if(rr&&tg){hit={playerId:rr.playerId,team:rr.team,opponent:tg.opponent,gameId:tg.gameId};resolvedByRoster++}}if(!hit){unresolved++}return{player:x.player,qty:Number(x.threshold),stat:String(x.stat||'points').toLowerCase().startsWith('assist')?'Assist':String(x.stat||'points').toLowerCase().startsWith('goal')?'Goal':'Point',playerId:hit?.playerId,team:hit?.team,opponent:hit?.opponent,gameId:hit?.gameId}});const units=r.stake/unitSize;const b=normalizeBet(d,legs,'Kalshi',units,unitSize,r.result==='YES'?r.payout:0,undefined);b.legs=legs;b.createdAt=r.placedAt;b.status=r.result==='YES'?'WON':r.result==='NO'?'LOST':'PENDING';b.category='COMBOS';b.source='HISTORICAL_REVIEW';const gameIds=[...new Set(legs.map(l=>l.gameId).filter(Boolean))];b.groupKey=gameIds.length===1?String(gameIds[0]):gameIds.length>1?'MULTI':'UNRESOLVED';if(b.legs.some(l=>l.kind!=='TEAM'&&(!Number.isInteger(Number(l.playerId))||Number(l.playerId)<=0||!l.gameId))){invalid++;continue}incoming.push(b)}
   }
   // If the same player/date resolved in one historical wager, reuse that authoritative NHL identity
   // for duplicate wagers on that date. This keeps identical combos from disagreeing because one copy
   // happened to miss the first resolver pass.
   const knownPlayerDate=new Map<string,{playerId:number;team:string;opponent:string;gameId:string}>();
   for(const b of incoming)for(const l of b.legs){if(l.playerId&&l.team&&l.opponent&&l.gameId)knownPlayerDate.set(`${b.date}|${playerKey(l.player)}`,{playerId:l.playerId,team:l.team,opponent:l.opponent,gameId:l.gameId})}
   for(const b of incoming){let changed=false;for(const l of b.legs){if(l.playerId&&l.gameId)continue;const hit=knownPlayerDate.get(`${b.date}|${playerKey(l.player)}`);if(hit){Object.assign(l,hit);changed=true}}if(changed){const ids=[...new Set(b.legs.map(l=>l.gameId).filter(Boolean))];b.groupKey=ids.length===1?String(ids[0]):ids.length>1?'MULTI':'UNRESOLVED'}}
   unresolvedRows.length=0;for(const b of incoming){const failed=b.legs.filter(l=>!l.playerId||!l.gameId);if(!failed.length)continue;const combo=b.legs.map(l=>`${l.player} ${l.qty}+ ${l.stat}`).join(' + ');unresolvedRows.push({player:failed.map(l=>l.player).join(', '),date:b.date,combo})}
   unresolved=unresolvedRows.length;const mapped=incoming.reduce((n,b)=>n+b.legs.filter(l=>l.playerId&&l.gameId).length,0)
   let updated=0;setBets((old:Bet[])=>{const historicalDates=new Set(incoming.map(b=>b.date));const keep=old.filter(b=>!(historicalDates.has(b.date)&&b.book.toLowerCase().includes('kalshi')));updated=old.length-keep.length;return[...incoming,...keep]});
   setUnresolvedLegs(unresolvedRows);setImportStatus(`Reviewed history installed · ${incoming.length} authoritative bets · ${mapped} player legs mapped · ${unresolved} unresolved · ${updated} old historical rows replaced`)
  }catch(e:any){setImportStatus(`Historical import failed · ${e?.message||'Unknown error'}`)}
 }
 return <details className="legacyRecovery"><summary><div><h3>Legacy / Recovery</h3><p>Reinstall the original reviewed historical dataset only if the local historical baseline needs to be rebuilt.</p></div><span>▾</span></summary><div className="maintenanceBody"><div className="maintenanceStatus"><b>INSTALLED BASELINE</b><span>{installed.length} wagers · {mapped} player legs mapped · {unresolved} unresolved</span></div><button className="wideButton" onClick={importHistoricalKalshi}>REINSTALL KALSHI HISTORY</button>{importStatus&&<div className="notice historicalImportNotice">{importStatus}</div>}{unresolvedLegs.length>0&&<details className="unresolvedPanel"><summary>{unresolvedLegs.length} UNRESOLVED WAGER{unresolvedLegs.length===1?'':'S'} · CLICK TO INSPECT</summary><div>{unresolvedLegs.map((x,i)=><div className="unresolvedRow" key={`${x.date}-${x.player}-${i}`}><b>{x.player}</b><span>{x.date}</span><small>{x.combo}</small></div>)}</div></details>}</div></details>
}

function LiveCommandCenter({date,setDate,games,events,bets,setBets,liveStats,hiddenGameIds,selectedGame,setSelectedGame,unitSize,pnlUnits,pnlDollars,maxReturnDollars,completedPnlDollars,completedPnlUnits,won,lost,pending,verifyNight,verifyStatus,verifyGame,verifyGameStatus,correctionPopup,dismissCorrection,viewCorrection,correctionReviews,correctionReviewOpen,closeCorrectionReview,resolveCorrection,addBetOpen,setAddBetOpen,teamHistory,leagueStandings,clubStats,slateDfo,checkSlateLines,lineCheckBusy,lineCheckLast,lineCheckError,lineupAlerts}:any){
 const [lineupReviewTeam,setLineupReviewTeam]=useState<string|null>(null);
 const [lineupBetFilter,setLineupBetFilter]=useState<string[]|null>(null);
 const lineupReview=lineupReviewTeam?lineupAlerts[lineupReviewTeam]:undefined;
 const[rebetSeed,setRebetSeed]=useState<Bet|null>(null);
 const[batchPairSeed,setBatchPairSeed]=useState<Bet[]|null>(null);
 const[eventsCollapsed,setEventsCollapsed]=useState(()=>localStorage.getItem(`nhl.live.manual.${date}`)==='closed'),
 [betsCollapsed,setBetsCollapsed]=useState(()=>localStorage.getItem(`nhl.bets.manual.${date}`)==='closed');
 const [comboCollapsed,setComboCollapsed]=useState(()=>{
  const saved=localStorage.getItem(`nhl.combo.manual.${date}`);
  return saved==='open'?false:saved==='closed'?true:games.some((g:Game)=>['LIVE','CRIT','FINAL','OFF'].includes(String(g.gameState||'')));
 });
 const [comboWidth,setComboWidth]=useState(()=>Number(localStorage.getItem('nhl.panel.comboWidth')||'27'));
 const [betWidth,setBetWidth]=useState(()=>Number(localStorage.getItem('nhl.panel.betWidth')||'32'));
 const hadLiveRef=useRef(games.some((g:Game)=>['LIVE','CRIT','FINAL','OFF'].includes(String(g.gameState||''))));
 const firstGameStarted=games.some((g:Game)=>['LIVE','CRIT','FINAL','OFF'].includes(String(g.gameState||'')));
 useEffect(()=>{
  const manual=localStorage.getItem(`nhl.combo.manual.${date}`);
  if(manual){setComboCollapsed(manual==='closed');hadLiveRef.current=firstGameStarted;return}
  if(firstGameStarted&&!hadLiveRef.current)setComboCollapsed(true);
  hadLiveRef.current=firstGameStarted;
 },[date,firstGameStarted]);
 const toggleCombo=()=>setComboCollapsed(v=>{localStorage.setItem(`nhl.combo.manual.${date}`,v?'open':'closed');return !v});
 useEffect(()=>{localStorage.setItem('nhl.panel.comboWidth',String(comboWidth))},[comboWidth]);
 useEffect(()=>{localStorage.setItem('nhl.panel.betWidth',String(betWidth))},[betWidth]);
 const panelLayout=useMemo(()=>{
  const items:string[]=[];
  const sizes:string[]=[];
  const add=(key:string,size:string)=>{items.push(key);sizes.push(size)};
  if(comboCollapsed)add('comboRail','54px');
  if(eventsCollapsed)add('eventsRail','54px');
  if(betsCollapsed)add('betsRail','54px');
  if(!comboCollapsed){add('comboRail','54px');add('comboPane',`minmax(0,${comboWidth}fr)`);add('comboResize','7px')}
  if(!eventsCollapsed){add('eventsRail','54px');add('livePane',`minmax(0,${Math.max(24,100-comboWidth-betWidth)}fr)`)}
  if(!betsCollapsed){add('betsRail','54px');add('betResize','7px');add('betsPane',`minmax(0,${betWidth}fr)`)}
  if(comboCollapsed&&eventsCollapsed&&betsCollapsed)add('empty','minmax(0,1fr)');
  const columns:Record<string,number>={};
  items.forEach((item,i)=>columns[item]=i+1);
  return {template:sizes.join(' '),columns};
 },[comboCollapsed,eventsCollapsed,betsCollapsed,comboWidth,betWidth]);
 const panelGridStyle={
  '--three-panel-columns':panelLayout.template,
  '--combo-rail-column':panelLayout.columns.comboRail,
  '--combo-pane-column':panelLayout.columns.comboPane||1,
  '--combo-resize-column':panelLayout.columns.comboResize||1,
  '--events-rail-column':panelLayout.columns.eventsRail,
  '--live-pane-column':panelLayout.columns.livePane||1,
  '--bets-rail-column':panelLayout.columns.betsRail,
  '--bet-resize-column':panelLayout.columns.betResize||1,
  '--bets-pane-column':panelLayout.columns.betsPane||1
 } as React.CSSProperties;
 const beginPanelResize=(e:React.MouseEvent<HTMLDivElement>,panel:'combo'|'bets')=>{
  e.preventDefault();
  const container=e.currentTarget.parentElement;if(!container)return;
  const bounds=container.getBoundingClientRect();
  const move=(ev:MouseEvent)=>{
   const pct=panel==='combo'?(ev.clientX-bounds.left)/bounds.width*100:(bounds.right-ev.clientX)/bounds.width*100;
   if(panel==='combo')setComboWidth(Math.max(17,Math.min(43,pct)));
   else setBetWidth(Math.max(20,Math.min(45,pct)));
  };
  const stop=()=>{window.removeEventListener('mousemove',move);window.removeEventListener('mouseup',stop)};
  window.addEventListener('mousemove',move);window.addEventListener('mouseup',stop);
 };
 const[onIce,setOnIce]=useState<Record<string,OnIceSnapshot>>({});
 const[filterOpen,setFilterOpen]=useState(false); const FILTER_GROUPS={Goals:['GOAL'],Bets:['BET HIT'],Penalties:['POWER PLAY'],EmptyNet:['EMPTY NET']} as const; const[trackerFilters,setTrackerFilters]=useState<Record<string,boolean>>(()=>({...Object.fromEntries(Object.keys(FILTER_GROUPS).map(k=>[k,true])),...JSON.parse(localStorage.getItem('liveEventFilters')||'{}')})); useEffect(()=>localStorage.setItem('liveEventFilters',JSON.stringify(trackerFilters)),[trackerFilters]);
 const[testMode,setTestMode]=useState(false),[testScenario,setTestScenario]=useState('LIVE'),[testClockRunning,setTestClockRunning]=useState(true),[testClock,setTestClock]=useState('12:34');
 void setTestMode; void setTestScenario; void setTestClockRunning; void setTestClock;
 const[dnpDismissed,setDnpDismissed]=useState<Set<string>>(()=>new Set()),[dnpReview,setDnpReview]=useState<any>(null),[dnpOdds,setDnpOdds]=useState(''),[dnpPayout,setDnpPayout]=useState(''),[dnpSimAdjusted,setDnpSimAdjusted]=useState<any[]>([]),[dnpSimVoided,setDnpSimVoided]=useState<Set<string>>(()=>new Set());
 const dnpOddsRef=useRef<HTMLInputElement>(null),dnpPayoutRef=useRef<HTMLInputElement>(null),dnpSaveRef=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  setEventsCollapsed(localStorage.getItem(`nhl.live.manual.${date}`)==='closed');
  setBetsCollapsed(localStorage.getItem(`nhl.bets.manual.${date}`)==='closed');
 },[date]);
 const toggleEvents=()=>setEventsCollapsed(v=>{localStorage.setItem(`nhl.live.manual.${date}`,v?'open':'closed');return !v});
 const toggleBets=()=>setBetsCollapsed(v=>{localStorage.setItem(`nhl.bets.manual.${date}`,v?'open':'closed');return !v});

 useEffect(()=>{
  const manual=localStorage.getItem(`nhl.combo.manual.${date}`);
  setComboCollapsed(manual==='open'?false:manual==='closed'?true:firstGameStarted);
  hadLiveRef.current=firstGameStarted;
 },[date]);

 useEffect(()=>{
  const onGlobalTab=(e:KeyboardEvent)=>{
   if(e.key!=='Tab'||e.altKey||e.ctrlKey||e.metaKey||e.shiftKey||addBetOpen||document.querySelector('.pregameCombo'))return;
   const t=e.target as HTMLElement|null;
   const tag=t?.tagName?.toLowerCase();
   if(tag==='input'||tag==='textarea'||tag==='select'||tag==='button'||t?.isContentEditable)return;
   e.preventDefault();setAddBetOpen(true);
  };
  window.addEventListener('keydown',onGlobalTab);return()=>window.removeEventListener('keydown',onGlobalTab);
 },[addBetOpen,setAddBetOpen]);
 useEffect(()=>{
  if(!addBetOpen)return;
  const trap=(e:KeyboardEvent)=>{
   if(e.key!=='Tab')return;
   const drawer=document.querySelector('.betDrawer') as HTMLElement|null;if(!drawer)return;
   const focusable=[...drawer.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(x=>x.offsetParent!==null);
   if(!focusable.length){e.preventDefault();return}
   const active=document.activeElement as HTMLElement|null;const i=focusable.indexOf(active as HTMLElement);
   if(i<0){e.preventDefault();(e.shiftKey?focusable[focusable.length-1]:focusable[0]).focus();return}
   if(!e.shiftKey&&i===focusable.length-1){e.preventDefault();focusable[0].focus()}else if(e.shiftKey&&i===0){e.preventDefault();focusable[focusable.length-1].focus()}
  };
  document.addEventListener('keydown',trap,true);return()=>document.removeEventListener('keydown',trap,true)
 },[addBetOpen]);
 const testPeriod=testScenario==='2ND START'?2:testScenario==='3RD START'||testScenario==='EMPTY NET'?3:1;
 const testIntermission=testScenario==='INTERMISSION'||testScenario==='DNP TEST'||testScenario==='MULTI-VOID TEST';
 const testSituation=testScenario==='POWER PLAY'?'1541':'1551';
 const testGame:Game={id:170000,gameState:testScenario==='FINAL'?'FINAL':'LIVE',startTimeUTC:new Date().toISOString(),awayTeam:{id:1,abbrev:'BOS',score:testScenario==='GOAL'?2:1},homeTeam:{id:2,abbrev:'TBL',score:testScenario==='GOAL'?3:2},periodDescriptor:{number:testPeriod},situationCode:testSituation,intermission:testIntermission,clock:{timeRemaining:testScenario==='EMPTY NET'?'03:42':testIntermission?'00:00':testClock,running:(testScenario==='STOPPAGE'||testIntermission)?false:testClockRunning}};
 const isPeriodStart=testScenario==='2ND START'||testScenario==='3RD START';
 const testEventType:FeedType=isPeriodStart?'PERIOD START':(testScenario==='DNP TEST'||testScenario==='MULTI-VOID TEST')?'INTERMISSION':((testScenario==='STOPPAGE'||testScenario==='LIVE')?'GAME START':testScenario as FeedType);
 const testEvent:FeedEvent={id:`dev-test-${testScenario}`,gameId:170000,team:testEventType==='BET HIT'?'BET':'TBL',opponent:'BOS',type:testEventType,title:isPeriodStart?`${testPeriod===2?'2ND':'3RD'} PERIOD START`:testEventType==='GAME START'?'BOS @ TBL':testEventType==='GOAL'?'Nikita Kucherov: 1':testEventType==='BET HIT'?'Kucherov 1 Point + Point 1 Point':testEventType==='POWER PLAY'?'TBL POWER PLAY':testEventType==='EMPTY NET'?'BOS EMPTY NET':testEventType==='INTERMISSION'?'END OF 1ST':testEventType==='FINAL'?'FINAL':testEventType,detail:isPeriodStart?'BOS 1 – TBL 2':testEventType==='GOAL'?'Brayden Point (1), Victor Hedman (1)':testEventType==='BET HIT'?'1.00u @ +145':testEventType==='POWER PLAY'?'BOS penalty · 2 min · tripping':testEventType==='EMPTY NET'?'Late-game goalie pull · extra attacker on':testEventType==='INTERMISSION'?'BOS 1 – TBL 2':testEventType==='FINAL'?'BOS 1 – TBL 2':'Puck dropped · game is live',meta:isPeriodStart?`Puck dropped · ${testPeriod===2?'2nd':'3rd'} period underway`:testEventType==='BET HIT'?'All legs satisfied · awaiting official settlement':testEventType==='FINAL'?'Game complete':`BOS 1 – TBL 2 · ${testScenario==='EMPTY NET'?'3rd · 03:42':ordinal(testPeriod)+' · '+testClock}`,sort:Date.now()+999999};
 // Keep LIVE games leftmost, upcoming games in the middle, and completed games at the right.
 // Stable sorting preserves NHL slate order within each status group.
 const gameOrder=(g:Game)=>['LIVE','CRIT'].includes(String(g.gameState||''))?0:['FINAL','OFF'].includes(String(g.gameState||''))?2:1;
 const visibleGames=[...(testMode?[testGame]:[]),...games.filter((g:Game)=>!hiddenGameIds.has(g.id))].sort((a:Game,b:Game)=>gameOrder(a)-gameOrder(b));
 // Function keys target the visible scoreboard order; do not intercept wager entry.
 useEffect(()=>{
  const onGameKey=(e:KeyboardEvent)=>{
   if(addBetOpen||e.repeat||e.altKey||e.ctrlKey||e.metaKey)return;
   const target=e.target as HTMLElement|null;
   if(target?.closest('input,textarea,select,[contenteditable="true"],[role="dialog"]'))return;
   const match=/^F(\d{1,2})$/.exec(e.key);if(!match)return;
   const n=Number(match[1]),index=e.shiftKey?n+11:n-1;
   if(n<1||n>12||index>=visibleGames.length)return;
   e.preventDefault();e.stopPropagation();setSelectedGame(String(visibleGames[index].id));
  };
  window.addEventListener('keydown',onGameKey,true);
  return()=>window.removeEventListener('keydown',onGameKey,true);
 },[addBetOpen,visibleGames.map((g:Game)=>g.id).join(','),setSelectedGame]);
 const dayBets=(bets as Bet[]).filter(b=>b.date===date&&!b.legs.some(l=>l.gameId&&hiddenGameIds.has(Number(l.gameId))));
 const selectedId=selectedGame==='ALL'?null:Number(selectedGame);
 useEffect(()=>{if(!selectedId)return;let alive=true;let busy=false;const load=async()=>{
  if(busy)return;const g=(games as Game[]).find(x=>x.id===selectedId);
  if(!g||!['LIVE','CRIT'].includes(String(g.gameState||'')))return;
  busy=true;try{
   const landing=await window.nhlTracker.landing(Number(selectedId));
   const away=liveIcePlayers(landing,'awayTeam',abbr(g.awayTeam));const home=liveIcePlayers(landing,'homeTeam',abbr(g.homeTeam));
   if(away.length&&home.length){if(alive)setOnIce(prev=>({...prev,[String(selectedId)]:{away,home,updatedAt:Date.now(),source:'NHL LIVE'}}));return}
   // Shift charts are a fallback only; requests go through Electron IPC, never browser fetch.
   const j=await window.nhlTracker.shiftcharts(Number(selectedId));const rows=(j?.data||[]) as any[];
   const period=Number(g?.periodDescriptor?.number||0),remaining=clockToSeconds(String(g?.clock?.timeRemaining||''));
   if(!period||!String(g?.clock?.timeRemaining||''))return;
   const elapsed=Math.max(0,(period===4?300:1200)-remaining);
   const active=rows.filter(row=>Number(row.period)===period&&String(row.typeCode||'').toUpperCase()!=='G').filter(row=>{const st=clockToSeconds(String(row.startTime||'0:00')),et=clockToSeconds(String(row.endTime||'0:00'));return st<=elapsed&&et>=elapsed&&et>st});
   const unique=(team:string)=>{const m=new Map<number,OnIcePlayer>();for(const row of active){if(String(row.teamAbbrev||'')!==team)continue;const id=Number(row.playerId||0);if(id)m.set(id,{playerId:id,name:[row.firstName,row.lastName].filter(Boolean).join(' ')||`#${id}`,team,position:row.positionCode||row.position||'',sweaterNumber:Number(row.sweaterNumber||row.jerseyNumber||0)||undefined})}return[...m.values()]};
   const fallbackAway=away.length?away:unique(abbr(g.awayTeam)),fallbackHome=home.length?home:unique(abbr(g.homeTeam));
   if(alive&&fallbackAway.length&&fallbackHome.length)setOnIce(prev=>({...prev,[String(selectedId)]:{away:fallbackAway,home:fallbackHome,updatedAt:Date.now(),source:'NHL SHIFTS'}}));
  }catch(err){console.warn('On-ice NHL data unavailable',err)}finally{busy=false}
 };load();const t=window.setInterval(load,3000);return()=>{alive=false;window.clearInterval(t)}},[selectedId,games]);
 const masterEvents=[...(testMode?[testEvent]:[]),...(events as FeedEvent[])].sort((a,b)=>(b.sort||0)-(a.sort||0));
 const gameFilteredEvents=selectedId?masterEvents.filter((e:FeedEvent)=>e.gameId===selectedId):masterEvents; const enabledTypes=new Set<FeedType>(Object.entries(FILTER_GROUPS).filter(([k])=>trackerFilters[k]!==false).flatMap(([,types])=>[...types])); const filteredEvents=gameFilteredEvents.filter((e:FeedEvent)=>enabledTypes.has(e.type)); const filtersActive=Object.keys(FILTER_GROUPS).some(k=>trackerFilters[k]===false);
 const gameOptions=visibleGames.map((g:Game)=>({key:String(g.id),label:`${abbr(g.awayTeam)} @ ${abbr(g.homeTeam)}`}));
 const labels=new Map(gameOptions.map((x:any)=>[x.key,x.label]));
 const patchBet=(id:string,patch:Partial<Bet>)=>setBets((x:Bet[])=>x.map(b=>b.id===id?{...b,...patch}:b));
 const deleteBet=(id:string)=>setBets((x:Bet[])=>x.filter(b=>b.id!==id));
 const groups=new Map<string,Bet[]>();for(const b of dayBets){const k=b.groupKey||'UNASSIGNED';if(!groups.has(k))groups.set(k,[]);groups.get(k)!.push(b)}
 const finalIds=new Set(games.filter((g:Game)=>['FINAL','OFF'].includes(g.gameState)).map((g:Game)=>String(g.id)));
 const groupIsFinal=(k:string,bs:Bet[])=>{if(k==='UNASSIGNED')return false;if(k==='MULTI'){const ids=[...new Set(bs.flatMap(b=>b.legs.map(l=>l.gameId).filter(Boolean) as string[]))];return ids.length>0&&ids.every(id=>finalIds.has(String(id)))}return finalIds.has(k)};
 const allKeys=[...gameOptions.map((x:any)=>x.key),'MULTI'].filter(k=>groups.has(k));
 const isToday=date===(localStorage.getItem('activeSlateDate')||localDate());const activeKeys=isToday?allKeys.filter(k=>!groupIsFinal(k,groups.get(k)||[])):[];const finalizedKeys=isToday?allKeys.filter(k=>groupIsFinal(k,groups.get(k)||[])):allKeys;
 const keys=selectedId&&isToday?[String(selectedId)].filter(k=>activeKeys.includes(k)):activeKeys; const shownFinalizedKeys=selectedId?[String(selectedId)].filter(k=>finalizedKeys.includes(k)):finalizedKeys;
 const betNetUnits=(bs:Bet[])=>bs.reduce((n,b)=>n+((b.status||'PENDING')==='PENDING'?0:cashNetUnits(b)),0);
 const finalizedNet=shownFinalizedKeys.reduce((n,k)=>n+betNetUnits(groups.get(k)||[]),0);
 // Part 3A — first-intermission DNP guard. Only players on pending wagers are inspected.
 const firstIntermissionGames=new Set((events as FeedEvent[]).filter(e=>e.type==='INTERMISSION'&&/END OF 1ST/i.test(e.title)).map(e=>String(e.gameId)));
 const dnpCandidates=useMemo(()=>{
  const map=new Map<string,any>();
  for(const b of (bets as Bet[])){
   if(b.date!==date||(b.status||'PENDING')!=='PENDING')continue;
   for(const l of b.legs){
    if(l.kind==='TEAM'||!l.playerId||!l.gameId||!firstIntermissionGames.has(String(l.gameId)))continue;
    const stat=liveStats[`${l.gameId}:${l.playerId}`] as PlayerLive|undefined;
    const toi=String(stat?.toi||'0:00');
    const seconds=clockToSeconds(toi);
    if(stat?.rostered&&seconds>0)continue;
    const key=`${l.gameId}:${l.playerId}`;const prior=map.get(key)||{key,player:l.player,gameId:String(l.gameId),toi,reason:stat?.rostered?'0:00 TOI through the 1st period':'Not found on the active game roster',betIds:[] as string[]};
    if(!prior.betIds.includes(b.id))prior.betIds.push(b.id);map.set(key,prior)
   }
  }
  return [...map.values()];
 },[bets,date,liveStats,[...firstIntermissionGames].join('|')]);
 const activeDnp=dnpCandidates.find((x:any)=>!dnpDismissed.has(x.key));
 const simulatorCandidates=testMode&&testScenario==='DNP TEST'?[{key:'SIM:87',player:'Sidney Crosby',gameId:'170000',toi:'0:00',reason:'0:00 TOI through the 1st period',betIds:['SIM-1','SIM-2','SIM-3'],simulator:true}]:testMode&&testScenario==='MULTI-VOID TEST'?[{key:'SIM:CROSBY',player:'Sidney Crosby',gameId:'170000',toi:'0:00',reason:'0:00 TOI through the 1st period',betIds:['SIM-M1','SIM-M2'],simulator:true,multi:true},{key:'SIM:RAKELL',player:'Rickard Rakell',gameId:'170000',toi:'0:00',reason:'0:00 TOI through the 1st period',betIds:['SIM-M1'],simulator:true,multi:true}]:[];
 const simulatorDnp=simulatorCandidates.find((x:any)=>!dnpDismissed.has(x.key));
 const shownDnp=simulatorDnp||activeDnp;
 const beginDnpReview=(c:any)=>{setDnpOdds('');setDnpPayout('');setDnpSimAdjusted([]);setDnpReview({candidate:c,index:0,decision:null})};
 const dnpBetForIndex=(r:any)=>{const id=r?.candidate?.betIds?.[r.index||0];return r?.candidate?.simulator?null:(bets as Bet[]).find(b=>b.id===id)};
 const simulatorSlip=(r:any)=>{const id=r?.candidate?.betIds?.[r.index||0];if(id==='SIM-M1')return['Sidney Crosby','Rickard Rakell'];if(id==='SIM-M2')return['Sidney Crosby','Evgeni Malkin'];return['Sidney Crosby','Rickard Rakell']};
 const dnpCurrentFullVoid=(r:any)=>{if(!r)return false;if(r.candidate?.simulator){const players=simulatorSlip(r);const after=new Set([...dnpSimVoided,r.candidate.player]);return players.every((name:string)=>after.has(name))}const b=dnpBetForIndex(r);const key=String(r.candidate.key.split(':').pop());return !!b&&b.legs.length>0&&b.legs.every((l:Leg)=>l.voided||(l.playerId&&String(l.playerId)===key))};
 const keepDnpActive=(c:any)=>{setDnpDismissed(old=>new Set([...old,c.key]));setDnpReview(null)};
 const saveDnpAdjustment=()=>{if(!dnpReview)return;const i=dnpReview.index||0;const id=dnpReview.candidate.betIds[i];const now=new Date().toISOString();const realBet=dnpReview.candidate.simulator?null:dnpBetForIndex(dnpReview);const playerKey=String(dnpReview.candidate.key.split(':').pop());const projectedLegs=realBet?.legs.map((l:Leg)=>l.playerId&&String(l.playerId)===playerKey?{...l,voided:true,voidedAt:now,voidReason:'Sportsbook-confirmed DNP void'}:l);const fullVoid=dnpReview.candidate.simulator?dnpCurrentFullVoid(dnpReview):(!!projectedLegs?.length&&projectedLegs.every((l:Leg)=>l.voided));const adjustedOdds=Number(dnpOdds);const adjustedPayout=dnpPayout.trim()===''?undefined:Number(dnpPayout);if(!fullVoid&&(!Number.isFinite(adjustedOdds)||adjustedOdds===0))return;if(!fullVoid&&adjustedPayout!==undefined&&!Number.isFinite(adjustedPayout))return;if(dnpReview.candidate.simulator){const full=dnpCurrentFullVoid(dnpReview);const label=dnpReview.candidate.multi?(id==='SIM-M1'?'Crosby 1P + Rakell 1P':'Crosby 1P + Malkin 1P'):(['Crosby 1P + Rakell 1P','Crosby 1A + Letang 1P','Crosby 2P + Rakell 1A'][i]||id);setDnpSimVoided(old=>new Set([...old,dnpReview.candidate.player]));setDnpSimAdjusted((old:any[])=>[...old,{id,label,player:dnpReview.candidate.player,odds:full?0:adjustedOdds,payout:full?'REFUND':adjustedPayout,fullVoid:full}])}else{setBets((old:Bet[])=>old.map(b=>{if(b.id!==id)return b;const legs=b.legs.map(l=>l.playerId&&String(l.playerId)===playerKey?{...l,voided:true,voidedAt:now,voidReason:'Sportsbook-confirmed DNP void'}:l);const allVoided=legs.length>0&&legs.every(l=>l.voided);const audit:VoidAudit={player:dnpReview.candidate.player,voidedAt:now,reason:'Sportsbook-confirmed DNP void',originalOdds:b.odds,originalPayout:b.payout,adjustedOdds:allVoided?0:adjustedOdds,adjustedPayout:allVoided?b.units*b.unitSize:adjustedPayout};if(allVoided)return{...b,legs,status:'VOID' as BetStatus,settledAt:now,payout:b.units*b.unitSize,odds:undefined,voidAudit:[...(b.voidAudit||[]),audit],regradeNote:'FULL WAGER VOID · original stake refunded · 0.00u P/L'};return{...b,legs,odds:adjustedOdds,payout:adjustedPayout,voidAudit:[...(b.voidAudit||[]),audit],regradeNote:`${dnpReview.candidate.player} VOID · adjusted ${adjustedOdds>0?'+':''}${adjustedOdds}`}}))}const next=i+1;if(next<dnpReview.candidate.betIds.length){setDnpOdds('');setDnpPayout('');setDnpReview((r:any)=>({...r,index:next}))}else{setDnpDismissed(old=>new Set([...old,dnpReview.candidate.key]));setDnpReview((r:any)=>({...r,complete:true}))}};
 return <main className="commandCenter">
  {shownDnp&&<div className="dnpAlert"><div><small>POSSIBLE DNP</small><b>{shownDnp.player}</b><p>{shownDnp.reason}. NHL TOI: <strong>{shownDnp.toi}</strong>.</p><span>{shownDnp.betIds.length} pending wager{shownDnp.betIds.length===1?'':'s'} affected. Nothing has been voided.</span></div><div className="dnpActions"><button className="dnpReviewButton" onClick={()=>beginDnpReview(shownDnp)}>REVIEW WAGERS</button><button onClick={()=>keepDnpActive(shownDnp)}>KEEP ACTIVE</button></div></div>}
  {dnpReview&&<div className="dnpModalBackdrop"><div className="dnpModal"><div className="dnpModalHead"><div><small>DNP CHECK · {dnpReview.candidate.simulator?'SIMULATOR':'LIVE'}</small><b>{dnpReview.candidate.player}</b></div><button onClick={()=>setDnpReview(null)}>×</button></div><div className="dnpEvidence"><span>ACTIVE ROSTER / TOI CHECK</span><strong>{dnpReview.candidate.reason}</strong><p>TOI through Period 1: <b>{dnpReview.candidate.toi}</b></p></div><div className="dnpWalkthrough">{!dnpReview.complete&&<><small>STEP 1 OF 2</small><h3>Did the sportsbook void this player's leg?</h3><p>This app will never void or reprice the wager automatically. Confirm the sportsbook result first.</p><div className="dnpChoiceRow"><button onClick={()=>keepDnpActive(dnpReview.candidate)}>NO · KEEP LEG</button><button className="danger" onClick={()=>setDnpReview((x:any)=>({...x,decision:'VOID'}))}>YES · VOID LEG</button></div></>}{dnpReview.decision==='VOID'&&!dnpReview.complete&&<div className="dnpReprice"><small>STEP 2 OF 2 · BET {(dnpReview.index||0)+1} OF {dnpReview.candidate.betIds.length}</small><h3>Enter the sportsbook's adjusted price</h3><p>{(()=>{const full=dnpCurrentFullVoid(dnpReview);return full?'This void removes the final active leg. The wager will be marked VOID / REFUNDED automatically at 0.00u P/L — no replacement odds are required.':'The voided leg is removed from grading. Enter the replacement American odds shown by the sportsbook. Payout is optional; leave it blank to use the manually entered odds for return math.'})()}</p><div className="dnpSlipPreview"><b>{dnpReview.candidate.simulator?(dnpReview.candidate.multi?(dnpReview.candidate.betIds[dnpReview.index||0]==='SIM-M1'?'Crosby 1P + Rakell 1P':'Crosby 1P + Malkin 1P'):['Crosby 1P + Rakell 1P','Crosby 1A + Letang 1P','Crosby 2P + Rakell 1A'][dnpReview.index||0]):(dnpBetForIndex(dnpReview)?.legs||[]).map((l:Leg)=>`${l.player} ${l.qty}${l.stat[0]}`).join(' + ')}</b><span><del>{dnpReview.candidate.player}</del> <strong>VOID</strong></span></div>{(()=>{const full=dnpCurrentFullVoid(dnpReview);return <>{!full&&<div className="dnpPriceFields"><label>NEW AMERICAN ODDS<input ref={dnpOddsRef} autoFocus value={dnpOdds} onChange={e=>setDnpOdds(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();dnpPayoutRef.current?.focus()}}} placeholder="+145" inputMode="numeric"/></label><label>NEW PAYOUT ($) · OPTIONAL<input ref={dnpPayoutRef} value={dnpPayout} onChange={e=>setDnpPayout(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();saveDnpAdjustment()}}} placeholder="Sportsbook return" inputMode="decimal"/></label></div>}<button ref={dnpSaveRef} className="dnpReviewButton" disabled={!full&&(!Number.isFinite(Number(dnpOdds))||Number(dnpOdds)===0)} onClick={saveDnpAdjustment}>{full?'CONFIRM REFUND':`SAVE ADJUSTMENT & ${((dnpReview.index||0)+1<dnpReview.candidate.betIds.length)?'NEXT':'FINISH'}`}</button></>})()}</div>}{dnpReview.complete&&<div className="dnpComplete"><small>VOID REVIEW COMPLETE</small><h3>{dnpReview.candidate.player} review is complete.</h3><p>Voided legs no longer grade as pending, hit, or missed. Partial wagers use the replacement odds you entered; a wager with no active legs is refunded at 0.00u P/L.</p>{dnpReview.candidate.simulator&&<div className="dnpAffected">{dnpSimAdjusted.map((x:any)=><span key={`${x.id}-${x.player}`}>{x.label} · <b>{String(x.player||dnpReview.candidate.player).split(' ').slice(-1)[0].toUpperCase()} VOID</b> · {x.fullVoid?'REFUNDED · 0.00u':`NEW ODDS ${x.odds>0?'+':''}${x.odds}`}</span>)}</div>}<button className="dnpReviewButton" onClick={()=>setDnpReview(null)}>DONE</button></div>}</div></div></div>}
  <section className="scoreboardShell"><div className="scoreboardTop"><div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}><small>TODAY'S GAMES</small><b>{date}</b><button type="button" onClick={checkSlateLines} disabled={lineCheckBusy||!games.some((g:Game)=>['PRE','FUT'].includes(String(g.gameState||'')))} title={lineCheckError||'Fetch current Daily Faceoff sources for all pregame teams'} style={{background:'#16354a',border:'1px solid #32718c',color:'#65d9ff',borderRadius:5,padding:'5px 9px',fontWeight:800,fontSize:10,cursor:lineCheckBusy?'wait':'pointer'}}>{lineCheckBusy?'⟳ CHECKING…':'↻ CHECK LINE UPDATES'}</button><span style={{color:'#22c55e',fontWeight:800,fontSize:11}} title="Confirmed pregame teams">{[...new Set<string>(games.filter((g:Game)=>['PRE','FUT'].includes(String(g.gameState||''))).flatMap((g:Game)=>[abbr(g.awayTeam),abbr(g.homeTeam)]))].filter((team:string)=>dfoConfirmed(slateDfo?.[team],date)).length}/{[...new Set<string>(games.filter((g:Game)=>['PRE','FUT'].includes(String(g.gameState||''))).flatMap((g:Game)=>[abbr(g.awayTeam),abbr(g.homeTeam)]))].length} ✓</span><small title="Saved DFO lineup snapshots for this slate; snapshots persist after restart" style={{fontSize:10}}>SNAPSHOTS {[...new Set<string>(games.filter((g:Game)=>['PRE','FUT'].includes(String(g.gameState||''))).flatMap((g:Game)=>[abbr(g.awayTeam),abbr(g.homeTeam)]))].filter((team:string)=>!!readDfoSnapshot(date,team)).length} saved</small>{lineCheckLast&&<small title="Last manual DFO check" style={{fontSize:10}}>Checked {lineCheckLast}</small>}{lineCheckError&&<small role="alert" style={{color:'#fca5a5',fontSize:10}}>{lineCheckError}</small>}</div><label>SLATE DATE<input type="date" value={date} onChange={e=>{setDate(e.target.value);setSelectedGame('ALL')}}/></label></div><div className="scoreStrip"><button className={`scoreTile allTile ${selectedGame==='ALL'?'selected':''}`} onClick={()=>setSelectedGame('ALL')}><b>ALL GAMES</b><span>{visibleGames.length} games</span></button>{visibleGames.map((g:Game)=>{const id=String(g.id);const gameBets=dayBets.filter((b:Bet)=>String(b.groupKey||'')===id);const finalUnits=gameBets.length?betNetUnits(gameBets):undefined;const ppTeam=scoreboardPowerPlayTeam(g);return <button className={`scoreTile ${selectedGame===id?'selected':''}`} key={g.id} onClick={()=>setSelectedGame(id)}><div className="scoreTeams"><span><b style={{display:'inline-flex',alignItems:'center',gap:6}}>{['PRE','FUT'].includes(String(g.gameState||''))&&dfoConfirmed(slateDfo?.[abbr(g.awayTeam)],date)&&<span className="lineConfirmCheck" style={{color:'#22c55e',fontWeight:900,textShadow:'0 0 5px rgba(34,197,94,.55)'}} title="Lineup confirmed by today's named source">✓</span>}{scoreboardLogo[abbr(g.awayTeam)]&&<img src={scoreboardLogo[abbr(g.awayTeam)]} alt="" aria-hidden="true" style={{width:24,height:24,objectFit:'contain',flexShrink:0}}/>}{abbr(g.awayTeam)}{lineupAlerts[abbr(g.awayTeam)]&&<span role="button" tabIndex={0} className="lineupAlertMark" title="View changed lines affecting your pending bets" onClick={e=>{e.stopPropagation();setLineupReviewTeam(abbr(g.awayTeam))}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();setLineupReviewTeam(abbr(g.awayTeam))}}}>!</span>}{ppTeam==='away'&&<em className="scoreboardPpLabel" style={{color:"#facc15",fontStyle:"italic",fontWeight:800,fontSize:".76em",marginLeft:2,textShadow:"0 0 4px rgba(250,204,21,.3)"}} title="Power play">PP</em>}</b><ConfidenceScoreSlot team={abbr(g.awayTeam)} opponent={abbr(g.homeTeam)} gameState={g.gameState} goals={g.awayTeam?.score}/>{gameShots(g.awayTeam)!=null&&<small className="scoreboardSog" title="Shots on goal">SOG {gameShots(g.awayTeam)}</small>}</span><span><b style={{display:'inline-flex',alignItems:'center',gap:6}}>{['PRE','FUT'].includes(String(g.gameState||''))&&dfoConfirmed(slateDfo?.[abbr(g.homeTeam)],date)&&<span className="lineConfirmCheck" style={{color:'#22c55e',fontWeight:900,textShadow:'0 0 5px rgba(34,197,94,.55)'}} title="Lineup confirmed by today's named source">✓</span>}{scoreboardLogo[abbr(g.homeTeam)]&&<img src={scoreboardLogo[abbr(g.homeTeam)]} alt="" aria-hidden="true" style={{width:24,height:24,objectFit:'contain',flexShrink:0}}/>}{abbr(g.homeTeam)}{lineupAlerts[abbr(g.homeTeam)]&&<span role="button" tabIndex={0} className="lineupAlertMark" title="View changed lines affecting your pending bets" onClick={e=>{e.stopPropagation();setLineupReviewTeam(abbr(g.homeTeam))}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();setLineupReviewTeam(abbr(g.homeTeam))}}}>!</span>}{ppTeam==='home'&&<em className="scoreboardPpLabel" style={{color:"#facc15",fontStyle:"italic",fontWeight:800,fontSize:".76em",marginLeft:2,textShadow:"0 0 4px rgba(250,204,21,.3)"}} title="Power play">PP</em>}</b><ConfidenceScoreSlot team={abbr(g.homeTeam)} opponent={abbr(g.awayTeam)} gameState={g.gameState} goals={g.homeTeam?.score}/>{gameShots(g.homeTeam)!=null&&<small className="scoreboardSog" title="Shots on goal">SOG {gameShots(g.homeTeam)}</small>}</span></div><div className="scoreState"><LiveGameState game={g} finalUnits={finalUnits}/></div></button>})}</div></section>
  <style>{`.onIceNow{margin:10px 0 12px;padding:10px 12px;border:1px solid rgba(255,255,255,.12);border-radius:9px;background:rgba(8,14,20,.72)}.onIceHead{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}.onIceHead small{opacity:.58;font-size:9px;letter-spacing:.08em}.onIceGrid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.onIceTeam>b{display:block;margin-bottom:5px;font-size:12px}.onIceTeam>div{display:flex;flex-wrap:wrap;gap:5px}.onIcePlayer{padding:4px 7px;border:1px solid rgba(255,255,255,.12);border-radius:999px;font-size:11px}.onIcePlayerTracked{border-radius:8px;border-color:rgba(96,177,255,.48);background:rgba(36,98,145,.14)}.onIcePlayer>span{display:block}.onIcePlayerLegs{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}.onIcePlayerLegs small{font-size:10px;padding:2px 4px;border-radius:4px;background:rgba(255,255,255,.08);color:#d5dce8}.onIcePlayerLegs small.onIceLegHit{background:rgba(26,140,79,.22);color:#73e7a3}.onIceTeam em{opacity:.55;font-size:11px;font-style:normal}.onIceGrid{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px}.onIceTeam{min-width:0}.onIceTeam>div{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:7px;align-items:stretch}.onIcePlayer{box-sizing:border-box;min-width:0;min-height:84px;border-radius:9px;padding:11px 8px;font-size:12px;display:flex;flex-direction:column;justify-content:flex-start;gap:7px;background:rgba(255,255,255,.025)}.onIcePlayerTracked{border-radius:9px}.onIcePlayer>span{font-weight:650;white-space:normal;overflow-wrap:anywhere;line-height:1.3}.onIcePlayerLegs{margin-top:auto;gap:4px}.onIcePlayerLegs small{font-size:11px;font-weight:750;padding:4px 6px}.onIceTeam em{grid-column:1/-1}@media(max-width:1400px){.onIceGrid{gap:10px}.onIceTeam>div{gap:4px}.onIcePlayer{padding:9px 5px;font-size:10px;min-height:78px}.onIcePlayerLegs small{font-size:9px;padding:3px 4px}}.eventContent footer time{white-space:nowrap}.eventTrackerTitle{position:relative}.eventFilterControls{display:flex;align-items:center;gap:10px}.mixerButton{width:32px;height:32px;padding:6px;border:1px solid rgba(255,255,255,.18);border-radius:7px;background:rgba(255,255,255,.04);color:inherit;display:grid;place-items:center;cursor:pointer}.mixerButton svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}.mixerButton.active{border-color:#f5a623;background:rgba(245,166,35,.12)}.eventFilterPanel{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;padding:9px 12px;margin:0 0 8px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:rgba(8,14,20,.96)}.eventFilterPanel label{display:flex;align-items:center;gap:6px;font-size:12px;white-space:nowrap}.eventFilterPanel button{margin-left:auto;font-size:10px;padding:5px 8px}.eventSelectable{cursor:pointer}.eventSelectable:focus-visible{outline:2px solid currentColor;outline-offset:-2px}.liveClock.emptyNet{color:#ff9f2f!important;border-color:#ff9f2f!important}.liveClock.emptyNet .clockMotion{background:#ff9f2f!important}.gameVerifyBar{display:flex;align-items:center;gap:10px;padding:8px 12px;border-top:1px solid rgba(255,255,255,.06);border-bottom:1px solid rgba(255,255,255,.06)}.gameVerifyBar small{font-size:10px;opacity:.7}.gameVerifyBar .verifyButton{padding:7px 10px;font-size:10px}.rowVerifyButton{margin-left:10px;padding:6px 10px;border:1px solid #27d995;border-radius:7px;background:rgba(39,217,149,.10);color:#62efb8;font-size:9px;font-weight:900;letter-spacing:.04em;white-space:nowrap;cursor:pointer}.rowVerifyButton:hover{background:rgba(39,217,149,.18)}.rowVerifyButton:disabled{opacity:.6;cursor:wait}.rowVerifyButton.verified{border-color:#27d995;color:#62efb8}.rowVerifyButton.adjustment{border-color:#f0ad35;background:rgba(240,173,53,.12);color:#ffc65c}.correctionActions{display:flex;align-items:center;gap:14px}.correctionActions button.primary{border-color:#27d995!important;background:rgba(39,217,149,.12)!important;color:#62efb8!important}.correctionActions button:not(.primary){border-color:#ff5368!important;background:rgba(255,83,104,.12)!important;color:#ff7182!important}`}</style>
  {lineupReviewTeam&&lineupReview&&<div className="lineupReviewBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setLineupReviewTeam(null)}}><div className="lineupReviewModal" role="dialog" aria-modal="true" aria-label={`${lineupReviewTeam} lineup adjustments`}><header><div><small>DAILY FACEOFF · PROJECTED VS CONFIRMED</small><h2>{lineupReviewTeam} LINEUP ADJUSTMENTS</h2></div><button onClick={()=>setLineupReviewTeam(null)} aria-label="Close lineup adjustments">✕</button></header><div className="lineupReviewColumns">{([{title:'ORIGINAL PROJECTION',data:lineupReview.projected},{title:'CONFIRMED LINEUP',data:lineupReview.confirmed}] as const).map(col=><section key={col.title}><h3>{col.title}</h3>{col.data.forwardLines.map((line:string[],i:number)=><p key={`f${i}`}><b>FL{i+1}</b> {line.join(' · ')}</p>)}{col.data.defensePairs.map((line:string[],i:number)=><p key={`d${i}`}><b>DP{i+1}</b> {line.join(' · ')}</p>)}<p><b>PP1</b> {col.data.pp1.join(' · ')}</p><p><b>PP2</b> {col.data.pp2.join(' · ')}</p></section>)}</div><div className="lineupBrokenPairs"><h3>BROKEN PAIRINGS IN YOUR PENDING WAGERS</h3>{lineupReview.pairs.map((pair,i)=><div key={`${pair.betId}-${i}`}><strong>{pair.a} + {pair.b}</strong><span>{pair.units.join(' / ')} pairing broken</span></div>)}</div><footer><span>{lineupReview.ids.length} affected pending wager{lineupReview.ids.length===1?'':'s'}</span><button onClick={()=>{setLineupBetFilter(lineupReview.ids);setBetsCollapsed(false);setLineupReviewTeam(null)}}>VIEW BETS →</button></footer></div></div>}
  {correctionPopup&&<div className="correctionPopup"><div><b>⚠ STAT CORRECTION</b><p>{correctionPopup}</p></div><div className="correctionActions"><button className="primary" onClick={viewCorrection}>VIEW ADJUSTMENT</button><button onClick={dismissCorrection}>DISMISS</button></div></div>}
  {correctionReviewOpen&&<div className="correctionModalBack"><div className="correctionModal"><div className="correctionModalHead"><div><small>OFFICIAL NHL STAT CORRECTION</small><h2>STAT CORRECTION REVIEW</h2></div><button onClick={closeCorrectionReview}>✕</button></div>{correctionReviews.length===0?<p className="correctionEmpty">No unresolved stat adjustments.</p>:correctionReviews.map((r:any)=>{const b=bets.find((x:any)=>x.id===r.betId);return <div className="correctionCard" key={r.betId}><div className="correctionCaseHead"><div><small>OFFICIAL NHL ADJUSTMENT</small><b>{r.deltas?.length?`${r.deltas.length} recorded stat change${r.deltas.length===1?'':'s'}`:'Legacy adjustment · run VERIFY STATS again to capture exact delta'}</b></div><span>{r.gameIds?.length||1} game{(r.gameIds?.length||1)===1?'':'s'} checked</span></div><div className="correctionDelta">{r.deltas?.length?r.deltas.map((d:any,i:number)=><div className="deltaRow" key={`${d.gameId}:${d.player}:${d.stat}:${i}`}><div><small>GAME {d.gameId}</small><b>{d.player}</b></div><strong>{d.stat}</strong><span className="deltaBefore">{d.before}</span><i>→</i><em>{d.after}</em>{d.threshold!=null&&<small className={d.beforeHit!==d.afterHit?'legFlip':''}>{d.player} {d.threshold}+ {d.stat}: {d.beforeHit?'HIT':'MISS'} → {d.afterHit?'HIT':'MISS'}</small>}</div>):<div className="legacyDelta">This adjustment was detected before detailed snapshots were enabled. Re-run VERIFY STATS on its game(s) to capture the exact before → after stat evidence.</div>}</div><div className="correctionBet"><small>AFFECTED WAGER · {b?.book||'Sportsbook'}</small><strong>{b?.legs?.map((l:any)=>`${l.player} ${l.qty}+ ${l.stat}`).join(' + ')}</strong><p>Sportsbook settlement: <b>{r.from}</b> <span>NHL-corrected grade: <b>{r.to}</b></span></p><small>Last checked: {new Date(r.updatedAt||r.createdAt).toLocaleString()}</small></div><div className="correctionDecision"><button onClick={()=>resolveCorrection(r,false)}>KEEP SPORTSBOOK SETTLEMENT</button><button className="apply" onClick={()=>resolveCorrection(r,true)}>APPLY NHL CORRECTION</button></div></div>})}</div></div>}
  {selectedId&&visibleGames.find((g:Game)=>g.id===selectedId)&&<OnIceNow game={visibleGames.find((g:Game)=>g.id===selectedId)!} snapshot={onIce[String(selectedId)]} bets={bets} liveStats={liveStats} slateDate={date}/>}
  {selectedId&&visibleGames.find((g:Game)=>g.id===selectedId)&&!['LIVE','CRIT','FINAL','OFF'].includes(String(visibleGames.find((g:Game)=>g.id===selectedId)?.gameState||''))&&<MatchupAnalysis game={visibleGames.find((g:Game)=>g.id===selectedId)!} bets={bets} liveStats={liveStats} teamHistory={teamHistory} leagueStandings={leagueStandings} clubStats={clubStats} onIce={onIce[String(selectedId)]} verifyGame={verifyGame} verifyStatus={verifyGameStatus[String(selectedId)]||''}/>}
  <div className={`commandSplit threePanel ${comboCollapsed?'comboCollapsed':''} ${eventsCollapsed?'eventsCollapsed':''} ${betsCollapsed?'betsCollapsed':''}`} style={panelGridStyle}><button className="paneRail comboRail" onClick={toggleCombo} aria-label={comboCollapsed?'Show Combo Analyzer':'Hide Combo Analyzer'}><em>PROJECTED/CONFIRMED COMBOS</em><span>{comboCollapsed?'›':'‹'}</span></button><section className="comboPane"><div className="sectionTitle"><b>PROJECTED/CONFIRMED COMBOS</b></div>{selectedId?<PregameComboAnalyzer game={visibleGames.find((g:Game)=>g.id===selectedId)} bets={bets} onRebet={(b:Bet)=>{setBatchPairSeed(null);setRebetSeed(b);setAddBetOpen(true)}} onBatch={(pairBets:Bet[])=>{setRebetSeed(null);setBatchPairSeed(pairBets);setAddBetOpen(true)}} slateDate={date}/>:!selectedId&&games.length>0?<PregameConfirmedBoard games={games} slateDfo={slateDfo} slateDate={date} bets={bets} onRebet={(b:Bet)=>{setRebetSeed(b);setAddBetOpen(true)}} onDetails={(id:string)=>setSelectedGame(id)}/>:<div className="empty"><b>Select a matchup to inspect line combinations.</b></div>}</section><div className="panelResizeHandle" title="Drag to resize Combo Analyzer" onMouseDown={e=>beginPanelResize(e,"combo")}/><section className="livePane"><div className="sectionTitle eventTrackerTitle"><b>LIVE EVENT TRACKER</b><span className="panelContext">{selectedId?labels.get(String(selectedId))||'GAME':'ALL GAMES'}</span><div className="eventFilterControls"><span>{filteredEvents.length} events</span><button className={`mixerButton ${filtersActive?'active':''}`} onClick={()=>setFilterOpen(v=>!v)} aria-label="Filter live events" title="Filter live events"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6"/></svg></button></div></div>{filterOpen&&<div className="eventFilterPanel">{Object.entries(FILTER_GROUPS).map(([label])=><label key={label}><input type="checkbox" checked={trackerFilters[label]!==false} onChange={e=>setTrackerFilters(x=>({...x,[label]:e.target.checked}))}/><span>{label==='Bets'?'Bets Hit':label==='Penalties'?'Penalties':label==='EmptyNet'?'Empty Net':'Goals'}</span></label>)}<button onClick={()=>setTrackerFilters(Object.fromEntries(Object.keys(FILTER_GROUPS).map(k=>[k,true])))}>SHOW ALL</button></div>}<EventFeed events={filteredEvents} onSelectGame={(gameId:number)=>{if(!gameId)return;setSelectedGame(String(gameId));setBetsCollapsed(false);setEventsCollapsed(false)}}/></section><button className="paneRail eventsRail" onClick={toggleEvents} aria-label={eventsCollapsed?'Show left pane':'Hide left pane'}><em>{selectedId&&!['LIVE','CRIT','FINAL','OFF'].includes(String(visibleGames.find((g:Game)=>g.id===selectedId)?.gameState||''))?'LIVE EVENT TRACKER':'LIVE EVENT TRACKER'}</em><span>{eventsCollapsed?'›':'‹'}</span></button><button className="paneRail betsRail" onClick={toggleBets} aria-label={betsCollapsed?'Show bets':'Hide bets'}><span>{betsCollapsed?'›':'‹'}</span><em>BET TRACKER</em></button><div className="panelResizeHandle betResizeHandle" title="Drag to resize Bet Hub" onMouseDown={e=>beginPanelResize(e,"bets")}/><section className="betsPane"><div className="betsTop"><div className="sectionTitle"><b>BET TRACKER</b></div><div className="sectionTitle"><b>{selectedId?`${labels.get(String(selectedId))||'GAME'} · BETS`:`TODAY'S BETS`}</b><button className="addBetButton" onClick={()=>setAddBetOpen(true)}>+ ADD BET</button></div>{lineupBetFilter&&<div className="lineupAffectedBets"><div className="lineupAffectedHead"><b>LINEUP-IMPACTED PENDING WAGERS</b><button onClick={()=>setLineupBetFilter(null)}>CLEAR FILTER ✕</button></div>{bets.filter(b=>lineupBetFilter.includes(b.id)&&(b.status||'PENDING')==='PENDING').map(b=><div className="lineupAffectedCard" key={b.id}><b>{b.legs.map(l=>`${l.player} ${l.qty}${l.stat.slice(0,1)}`).join(' + ')}</b><small>{b.book} · {b.units}u · PENDING</small></div>)}{!bets.some(b=>lineupBetFilter.includes(b.id)&&(b.status||'PENDING')==='PENDING')&&<p>These wagers are no longer pending.</p>}</div>}<div className="nightBar compact"><div><small>RUNNING P/L</small><b className={pnlDollars>0?'good':pnlDollars<0?'bad':''}>{pnlDollars>=0?'+':''}${pnlDollars.toFixed(2)} ({pnlUnits>=0?'+':''}{Number(pnlUnits.toFixed(2))}u)</b></div><div><small>MAX RETURN</small><b className={maxReturnDollars>0?'good':maxReturnDollars<0?'bad':''}>{maxReturnDollars>=0?'+':''}${maxReturnDollars.toFixed(2)}</b></div><div><small>COMPLETED GAMES P/L</small><b className={completedPnlDollars>0?'good':completedPnlDollars<0?'bad':''}>{completedPnlDollars>=0?'+':''}${completedPnlDollars.toFixed(2)} ({completedPnlUnits>=0?'+':''}{Number(completedPnlUnits.toFixed(2))}u)</b></div><div className="nightRecord"><span><strong>{won}</strong> W</span><span><strong>{lost}</strong> L</span><span><strong>{pending}</strong> P</span></div><div className="verifyBox"><button className="verifyButton" onClick={verifyNight}>VERIFY NIGHT</button><small>{verifyStatus||'Fresh NHL re-check'}</small></div></div></div>{!lineupBetFilter&&isToday&&activeKeys.length>0&&<details className="betMasterAccordion livePending" open><summary><b>LIVE / PENDING</b><span>{activeKeys.reduce((n,k)=>n+(groups.get(k)||[]).length,0)} bets</span></summary><div className="betMasterBody">{(['COMBOS','ASSISTS','OTHER'] as BetCategory[]).map(cat=>{const catKeys=keys.filter(k=>(groups.get(k)||[]).some(b=>(b.category||'COMBOS')===cat));const count=catKeys.reduce((n,k)=>n+(groups.get(k)||[]).filter(b=>(b.category||'COMBOS')===cat).length,0);if(!count)return null;return <details className="betCategoryAccordion" key={`active-${cat}`} open={selectedId?catKeys.includes(String(selectedId)):cat==='COMBOS'}><summary><b>{cat}</b><span>{count} bet{count===1?'':'s'}</span></summary><div>{catKeys.map(k=>{const bs=(groups.get(k)||[]).filter(b=>(b.category||'COMBOS')===cat);return <LiveBetGameAccordion key={`active-${cat}-${k}`} open={selectedId===Number(k)} label={labels.get(k)||(k==='MULTI'?'MULTI-GAME':'UNASSIGNED')} bets={bs} liveStats={liveStats} gameOptions={gameOptions} onPatch={patchBet} onDelete={deleteBet} verifyGameId={k!=='MULTI'?Number(k):undefined} verifyGame={verifyGame} verifyStatus={verifyGameStatus[k]||''} verifyMode="LIVE"/>})}</div></details>})}</div></details>}{!lineupBetFilter&&shownFinalizedKeys.length>0&&<details className="betMasterAccordion finalizedGames" open={!!selectedId||!isToday||activeKeys.length===0}><summary><b>FINALIZED GAMES</b><span>{shownFinalizedKeys.length} game{shownFinalizedKeys.length===1?'':'s'} · {finalizedNet>=0?'+':''}{finalizedNet.toFixed(2)}u Net</span></summary><div className="betMasterBody">{(['COMBOS','ASSISTS','OTHER'] as BetCategory[]).map(cat=>{const catKeys=shownFinalizedKeys.filter(k=>(groups.get(k)||[]).some(b=>(b.category||'COMBOS')===cat));const count=catKeys.reduce((n,k)=>n+(groups.get(k)||[]).filter(b=>(b.category||'COMBOS')===cat).length,0);if(!count)return null;return <details className="betCategoryAccordion" key={`final-${cat}`} open={selectedId?catKeys.includes(String(selectedId)):cat==='COMBOS'}><summary><b>{cat}</b><span>{count} bet{count===1?'':'s'}</span></summary><div>{catKeys.map(k=>{const bs=(groups.get(k)||[]).filter(b=>(b.category||'COMBOS')===cat);return <LiveBetGameAccordion key={`final-${cat}-${k}`} open={selectedId===Number(k)} label={`${labels.get(k)||(k==='MULTI'?'MULTI-GAME':'UNASSIGNED')} · FINAL`} bets={bs} liveStats={liveStats} gameOptions={gameOptions} onPatch={patchBet} onDelete={deleteBet} verifyGameId={k!=='MULTI'?Number(k):undefined} verifyGame={verifyGame} verifyStatus={verifyGameStatus[k]||''} verifyMode="FINAL"/>})}</div></details>})}</div></details>}{!lineupBetFilter&&dayBets.length===0&&<div className="empty"><b>No bets on this date.</b><span>Add a wager or choose another slate date.</span></div>}</section></div>
  {addBetOpen&&<div className="betDrawerBackdrop" onKeyDownCapture={e=>{if(e.key!=='Escape')return;e.preventDefault();e.stopPropagation();setAddBetOpen(false);setRebetSeed(null);setBatchPairSeed(null);requestAnimationFrame(()=>{(document.querySelector('.comboQuickRows button, .comboQuickButton, .pregameComboCard button') as HTMLElement|null)?.focus()})}} onMouseDown={e=>{if(e.target===e.currentTarget)setAddBetOpen(false);setRebetSeed(null)}}><div className="betDrawer"><div className="drawerHead"><div><small>LIVE WORKSPACE</small><b>ADD WAGER</b></div><button onClick={()=>{setAddBetOpen(false);setRebetSeed(null)}}>×</button></div><>{batchPairSeed?<BatchPairEntry seeds={batchPairSeed} date={date} games={games} unitSize={unitSize} setBets={setBets} onDone={()=>{setBatchPairSeed(null);setAddBetOpen(false)}}/>:<BetCenter rebetSeed={rebetSeed} date={date} setDate={setDate} unitSize={unitSize} bets={bets} setBets={setBets} games={games} liveStats={liveStats}/>}</></div></div>}
 </main>
}

function PregameConfirmedBoard({games,slateDfo,slateDate,bets,onRebet,onDetails}:{games:Game[],slateDfo:Record<string,any>,slateDate:string,bets:Bet[],onRebet:(b:Bet)=>void,onDetails:(id:string)=>void}){
 const [expanded,setExpanded]=useState<string>('');
 const norm=(name:string)=>String(name||'').trim().toLowerCase().replace(/\\s+/g,' ');
 const settled=(bets||[]).filter(b=>['WON','LOST'].includes(String(b.status||'')));
 const groups=games.filter(g=>['PRE','FUT'].includes(String(g.gameState||''))).slice().sort((a,b)=>String(a.startTimeUTC||'').localeCompare(String(b.startTimeUTC||''))).map(g=>{
  const teams=[abbr(g.awayTeam),abbr(g.homeTeam)];
  const combos=teams.flatMap(team=>{
   const info=slateDfo?.[team];
   if(!dfoConfirmed(info,slateDate))return[];
   const ppUnits=[info.pp1||[],info.pp2||[]] as string[][];
   const rows:{team:string;players:string[];line:string;pp:string;history:Bet[]}[]=[];
   (info.forwardLines||[]).forEach((line:string[],i:number)=>{
    ppUnits.forEach((pp,j)=>{
     const names=[...new Set(line.filter(name=>pp.some(x=>norm(x)===norm(name))))].sort((a,b)=>a.localeCompare(b));
     if(names.length<2)return;
     const key=names.map(norm).sort().join('|');
     const history=settled.filter(b=>{
      const legs=b.legs.filter(l=>!l.voided&&l.kind!=='TEAM');
      return legs.length===names.length&&legs.every(l=>l.team===team&&Number(l.qty)===1&&String(l.stat).toLowerCase().startsWith('point'))&&legs.map(l=>norm(l.player)).sort().join('|')===key;
     });
     rows.push({team,players:names,line:`L${i+1}`,pp:`PP${j+1}`,history});
    });
   });
   return rows;
  });
  return{g,teams,combos};
 }).filter(group=>group.combos.length>0);
 const total=groups.reduce((n,g)=>n+g.combos.length,0);
 const seed=(group:any,combo:any):Bet=>({
  id:`PREGAME-${String(group.g.id)}-${combo.team}-${combo.players.join('-')}`,date:slateDate,
  legs:combo.players.map((player:string)=>({player,qty:1,stat:'Point',team:combo.team,opponent:group.teams.find((t:string)=>t!==combo.team),gameId:String(group.g.id)})),
  book:'Fanatics',units:1,unitSize:1,createdAt:new Date().toISOString(),groupKey:String(group.g.id),status:'PENDING',category:'COMBOS',source:'LIVE'
 });
 return <div className="confirmedBoard"><div className="confirmedBoardHead"><div><small>PREGAME RESEARCH</small><h2>CONFIRMED LINE COMBOS</h2><span>Same forward line + same power play · Daily Faceoff sources confirmed for this slate</span></div><strong>{total} COMBOS</strong></div>
 {total===0?<div className="comboEmpty"><b>No confirmed line combinations yet.</b><span>Use CHECK LINE UPDATES above. Confirmed teams with overlapping forward-line and power-play players will appear here.</span></div>:groups.map(group=><section className="confirmedMatchup" key={String(group.g.id)}><div className="confirmedMatchupHead"><b>{group.teams[0]} @ {group.teams[1]}</b><span>{group.g.startTimeUTC?new Date(group.g.startTimeUTC).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'PREGAME'}</span></div>
 {group.combos.map((combo:any)=>{
  const key=String(group.g.id)+'|'+combo.team+'|'+combo.players.join('|');
  const won=combo.history.filter((b:Bet)=>b.status==='WON').length;
  const lost=combo.history.filter((b:Bet)=>b.status==='LOST').length;
  const pct=won+lost?Math.round(100*won/(won+lost)):null;
  return <div className="confirmedCombo" key={key}><div className="confirmedComboRow"><span className="confirmedTeam">✓ {combo.team}</span><b>{combo.players.map((p:string)=>p+' 1P').join(' + ')}</b><span className="confirmedDeployment">{combo.line} · {combo.pp}</span><button onClick={()=>setExpanded(v=>v===key?'':key)}>DETAILS</button><button className="confirmedQuickBet" onClick={()=>onRebet(seed(group,combo))}>QUICK BET</button></div>
 {expanded===key&&<div className="confirmedComboDetails"><span>Historical exact 1P combo: {combo.history.length?`${won}W–${lost}L · ${pct}% hit · ${combo.history.length} bets`:'No prior settled bets'}</span><span>DFO: {slateDfo[combo.team]?.source||'—'} · {dfoTime(slateDfo[combo.team])}</span><button onClick={()=>onDetails(String(group.g.id))}>OPEN MATCHUP ANALYZER ›</button></div>}
 </div>})}</section>)}</div>;
}

function PregameComboAnalyzer({game,bets,onRebet,onBatch,slateDate}:{game:Game,bets:Bet[],onRebet:(b:Bet)=>void,onBatch:(b:Bet[])=>void,slateDate:string}){
 const away=abbr(game?.awayTeam),home=abbr(game?.homeTeam)
 const[team,setTeam]=useState(away),[view,setView]=useState<'TODAY'|'PERFORMANCE'>('TODAY'),[todayTab,setTodayTab]=useState<'COMBOS'|'HISTORY'|'FORWARDS'|'DEFENSE'|'PP'>('COMBOS')
 const[pair,setPair]=useState(''),[exact,setExact]=useState(''),[dfo,setDfo]=useState<Record<string,any>>({}),[dfoStatus,setDfoStatus]=useState<Record<string,string>>({}),[dfoStats,setDfoStats]=useState<Record<string,any>>({}),[dfoGoalieToi,setDfoGoalieToi]=useState<Record<string,any>>({})
 void dfoGoalieToi;
 useEffect(()=>{setTeam(away);setPair('');setExact('');setView('TODAY')},[game?.id,away])
 useEffect(()=>{
  const onTeamTab=(e:KeyboardEvent)=>{
   if(e.key!=='Tab'||e.altKey||e.ctrlKey||e.metaKey||e.shiftKey||document.querySelector('.betDrawer'))return;
   const target=e.target as HTMLElement|null;
   if(target?.closest('input,textarea,select,[contenteditable="true"],[role="dialog"]'))return;
   if(target?.closest('button')&&!target.closest('.comboTeamToggle'))return;
   e.preventDefault();e.stopPropagation();
   setTeam(t=>t===away?home:away);setPair('');setExact('');
   (document.activeElement as HTMLElement|null)?.blur();
  };
  window.addEventListener('keydown',onTeamTab,true);
  return()=>window.removeEventListener('keydown',onTeamTab,true);
 },[away,home]);

 const loadDfo=async(t:string,manual=false)=>{if(!t||t==='???')return;setDfoStatus(s=>({...s,[t]:manual?'Checking for line adjustments…':'Loading Daily Faceoff…'}));try{const next=await window.nhlTracker.dfoLines(t);setDfo(old=>({...old,[t]:next}));try{const toi=await (window.nhlTracker as any).dfoGoalieToi(t,next.goalies||[]);setDfoGoalieToi(old=>({...old,[t]:toi}))}catch{}const names=[...(next.forwardLines||[]).flat(),...(next.defensePairs||[]).flat()];try{const stats=await window.nhlTracker.dfoPlayerStats(t,[...new Set(names)]);setDfoStats(old=>({...old,[t]:stats}))}catch{}setDfoStatus(s=>({...s,[t]:manual?'Daily Faceoff check complete.':'Daily Faceoff loaded.'}))}catch(e:any){setDfoStatus(s=>({...s,[t]:'DFO check failed · '+(e?.message||'unavailable')}))}}
 useEffect(()=>{loadDfo(away);if(home!==away)loadDfo(home)},[game?.id,away,home])
 const settled=bets.filter(b=>['WON','LOST','VOID'].includes(String(b.status||''))&&b.legs.filter(l=>!l.voided&&l.kind!=='TEAM').length>=2)
 const calcUnits=(b:Bet)=>{if(b.status==='VOID')return 0;if(b.status==='LOST')return-b.units;const stake=b.units*b.unitSize;const profit=b.payout!=null?b.payout-stake:b.odds!=null?(b.odds>0?stake*b.odds/100:stake*100/Math.abs(b.odds)):0;return b.unitSize?profit/b.unitSize:0}
 const pid=(l:Leg)=>String(l.playerId||l.player).toLowerCase()
 const canonStat=(s:string)=>{const x=String(s||'').trim().toLowerCase();if(['p','point','points'].includes(x))return'POINT';if(['g','goal','goals'].includes(x))return'GOAL';if(['a','assist','assists'].includes(x))return'ASSIST';if(['s','shot','shots','sog'].includes(x))return'SHOT';return x.toUpperCase()}
 const active=(b:Bet)=>b.legs.filter(l=>!l.voided&&l.kind!=='TEAM')
 const pairMap=new Map<string,{names:string[],bets:Bet[]}>();for(const b of settled){const ls=active(b).filter(l=>l.team===team);for(let i=0;i<ls.length;i++)for(let j=i+1;j<ls.length;j++){const two=[ls[i],ls[j]].sort((a,b)=>pid(a).localeCompare(pid(b)));const key=two.map(pid).join('|');const row=pairMap.get(key)||{names:two.map(l=>l.player),bets:[]};if(!row.bets.some(x=>x.id===b.id))row.bets.push(b);pairMap.set(key,row)}}
 const pairs=[...pairMap.entries()].map(([key,v])=>{const wins=v.bets.filter(b=>b.status==='WON').length;const decided=v.bets.filter(b=>b.status==='WON'||b.status==='LOST').length;return{key,...v,wins,decided,units:v.bets.reduce((n,b)=>n+calcUnits(b),0),hit:decided?wins/decided*100:0}}).sort((a,b)=>b.bets.length-a.bets.length||b.units-a.units)
 const chosenPair=pairs.find(x=>x.key===pair);const exactMap=new Map<string,Bet[]>();if(chosenPair)for(const b of chosenPair.bets){const key=active(b).map(l=>pid(l)+':'+canonStat(l.stat)+':'+Number(l.qty)).sort().join('|');exactMap.set(key,[...(exactMap.get(key)||[]),b])}
 const lastKey=(s:string)=>String(s||'').trim().toLowerCase().split(/\s+/).at(-1)||''
 const alphaNames=(a:string[])=>[...a].sort((x,y)=>lastKey(x).localeCompare(lastKey(y))||x.localeCompare(y))
 const alphaLegs=(a:any[])=>[...a].sort((x,y)=>lastKey(x.player).localeCompare(lastKey(y.player))||x.player.localeCompare(y.player))
 const exactRows=[...exactMap.entries()].map(([key,arr])=>{const sample=arr[0],wins=arr.filter(b=>b.status==='WON').length,decided=arr.filter(b=>b.status==='WON'||b.status==='LOST').length;const legs=alphaLegs(active(sample));return{key,arr,label:legs.map(l=>l.player+' '+l.qty+' '+(canonStat(l.stat)==='POINT'?'Point'+(l.qty===1?'':'s'):canonStat(l.stat)==='GOAL'?'Goal'+(l.qty===1?'':'s'):canonStat(l.stat)==='ASSIST'?'Assist'+(l.qty===1?'':'s'):canonStat(l.stat)==='SHOT'?'Shot'+(l.qty===1?'':'s'):l.stat)).join(' + '),wins,decided,units:arr.reduce((n,b)=>n+calcUnits(b),0),hit:decided?wins/decided*100:0}}).sort((a,b)=>b.arr.length-a.arr.length||b.units-a.units)
 const detail=exactRows.find(x=>x.key===exact);
 // Historical Kalshi imports may have zeroed losing payouts for settlement; recover
 // the quoted winning return from the bundled source record, without editing wagers.
 const kalshiQuote=(b:Bet):number|undefined=>{
  if(!b.book.toLowerCase().includes('kalshi'))return undefined;
  const stake=b.units*b.unitSize;
  if(b.payout!=null&&Number.isFinite(Number(b.payout))&&Number(b.payout)>stake)return Number(b.payout);
  if(b.source!=='HISTORICAL_REVIEW')return undefined;
  const matches=HISTORICAL_KALSHI.filter((r:any)=>r.placedAt===b.createdAt&&Math.abs(Number(r.stake)-stake)<.001&&
   r.legs.length===b.legs.length&&r.legs.every((l:any)=>b.legs.some(x=>x.player.trim().toLowerCase()===String(l.player).trim().toLowerCase()&&Number(x.qty)===Number(l.threshold))));
  return matches.length===1&&Number(matches[0].payout)>stake?Number(matches[0].payout):undefined;
 };
 const historicalOdds=(b:Bet):number|undefined=>{
  if(b.odds!=null&&Number.isFinite(Number(b.odds))&&Number(b.odds)!==0)return Number(b.odds);
  const stake=b.units*b.unitSize;
  if(!(stake>0))return undefined;
  const total=b.book.toLowerCase().includes('kalshi')?kalshiQuote(b):b.payout;
  return total!=null&&Number(total)>stake?americanFromReturn(stake,Number(total)):undefined;
 };
 const priced=(detail?.arr||[]).map(b=>({bet:b,american:historicalOdds(b)})).filter((x):x is {bet:Bet,american:number}=>x.american!=null).sort((a,b)=>String(a.bet.date).localeCompare(String(b.bet.date)));
 const probs=priced.map(x=>{const o=x.american;return o>0?100/(o+100):Math.abs(o)/(Math.abs(o)+100)});
 const avgP=probs.length?probs.reduce((a,b)=>a+b,0)/probs.length:null;
 const avgOdds=avgP==null?null:avgP>=.5?-Math.round(100*avgP/(1-avgP)):Math.round(100*(1-avgP)/avgP);
 const ys=priced.map(x=>x.american);const ymin=Math.min(...ys,0),ymax=Math.max(...ys,0),span=Math.max(1,ymax-ymin);
 const path=priced.map((x,i)=>(i?'L':'M')+' '+(priced.length===1?310:20+i*(580/(priced.length-1)))+' '+(160-((x.american-ymin)/span)*125)).join(' ')
 const legRows=detail?active(detail.arr[0]).map(l=>{const related=settled.filter(b=>active(b).some(x=>pid(x)===pid(l)&&Number(x.qty)===Number(l.qty)&&canonStat(x.stat)===canonStat(l.stat)));const wins=related.filter(b=>b.status==='WON').length,decided=related.filter(b=>b.status==='WON'||b.status==='LOST').length;return{label:l.player+' '+l.qty+' '+canonStat(l.stat),bets:related.length,wins,hit:decided?wins/decided*100:0,units:related.reduce((n,b)=>n+calcUnits(b),0)}}):[]
 const info=dfo[team],inj=new Map<string,string>((info?.injuries||[]).map((x:any)=>[String(x[0]).toLowerCase(),x[1]]))
 const deploymentLine=(name:string)=>{const key=String(name||'').trim().toLowerCase();const fl=(info?.forwardLines||[]).findIndex((names:string[])=>names.some(n=>String(n).trim().toLowerCase()===key));if(fl>=0)return 'FL'+(fl+1);const dp=(info?.defensePairs||[]).findIndex((names:string[])=>names.some(n=>String(n).trim().toLowerCase()===key));return dp>=0?'DP'+(dp+1):''};
 const Player=({name,line,pp}:{name:string,line?:string,pp?:string})=>{line=deploymentLine(name)||line;const st=dfoStats[team]?.[name.toLowerCase()];const l10=st?.l10,season=st?.season;const avgToi=st?.averageToi||'—';return <div className="dfoPlayer"><div><b>{name}</b><span>{[line,pp,`TOI: ${avgToi}`,inj.get(name.toLowerCase())].filter(Boolean).join(' - ')}</span></div><div className="dfoStats"><span></span><b>G</b><b>A</b><b>P</b><b>SOG</b><small>L10</small><em>{l10?.g??'—'}</em><em>{l10?.a??'—'}</em><em>{l10?.p??'—'}</em><em>{l10?.sog??'—'}</em><small>SEASON</small><em>{season?.g??'—'}</em><em>{season?.a??'—'}</em><em>{season?.p??'—'}</em><em>{season?.sog??'—'}</em></div></div>}
 const ppOf=(n:string)=>info?.pp1?.includes(n)?'PP1':info?.pp2?.includes(n)?'PP2':''
 const pairsNow=useMemo(()=>{if(!info)return[] as any[];const out:any[]=[];(info.forwardLines||[]).forEach((ln:string[],i:number)=>{for(const pp of ['PP1','PP2']){const players=alphaNames(ln.filter((n:string)=>ppOf(n)===pp));if(players.length>=2)out.push({players,line:'L'+(i+1),pp})}});return out.sort((a,b)=>a.line.localeCompare(b.line)||a.pp.localeCompare(b.pp))},[info])
 const quickSeed=(players:string[]):Bet=>({id:`PREGAME-${game.id}-${team}-${players.join('-')}`,date:slateDate,legs:players.map(player=>({player,qty:1,stat:'Point',team,opponent:team===away?home:away,gameId:String(game.id)})),book:'Fanatics',units:1,unitSize:1,createdAt:new Date().toISOString(),groupKey:String(game.id),status:'PENDING',category:'COMBOS',source:'LIVE'});
 const comboOptions=(players:string[])=>players.length===3?[{players:[players[0],players[1]],qty:[1,1]},{players:[players[0],players[2]],qty:[1,1]},{players:[players[1],players[2]],qty:[1,1]},{players,qty:[1,1,1]}]:[{players,qty:[1,1]},{players,qty:[2,2]},{players,qty:[1,2]},{players,qty:[2,1]}];
 const makeComboSeed=(option:{players:string[],qty:number[]}):Bet=>({...quickSeed(option.players),legs:quickSeed(option.players).legs.map((l,i)=>({...l,qty:option.qty[i]}))});
 const launchCombo=(players:string[])=>onBatch(comboOptions(players).map(makeComboSeed));
 useEffect(()=>{if(view!=='TODAY'||todayTab!=='COMBOS'||!info)return;const onKey=(e:KeyboardEvent)=>{if(document.querySelector('.betDrawer')||e.altKey||e.ctrlKey||e.metaKey||e.shiftKey||e.repeat||!/^\d$/.test(e.key))return;const target=e.target as HTMLElement|null;if(target?.closest('input,textarea,select,[contenteditable="true"],[role="dialog"]'))return;const index=e.key==='0'?9:Number(e.key)-1;if(index>=pairsNow.length)return;e.preventDefault();launchCombo(pairsNow[index].players)};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[view,todayTab,info,pairsNow,onBatch]);

 const nameKey=(s:string)=>String(s||'').trim().toLowerCase()
 const configsFor=(players:string[])=>{const wanted=players.map(nameKey).sort().join('|');const m=new Map<string,Bet>();for(const bet of bets){const ls=active(bet);if(ls.length!==players.length||ls.map(l=>nameKey(l.player)).sort().join('|')!==wanted)continue;const key=ls.map(l=>nameKey(l.player)+':'+Number(l.qty)+':'+canonStat(l.stat)).sort().join('|');m.set(key,bet)}return[...m.values()]}
 void configsFor;
 const historyMap=new Map<string,{arr:Bet[],sample:Bet}>();for(const bet of bets){const ls=active(bet);if(ls.length<2||!ls.every(l=>l.team===team))continue;const key=ls.map(l=>pid(l)+':'+Number(l.qty)+':'+canonStat(l.stat)).sort().join('|');const row=historyMap.get(key)||{arr:[],sample:bet};row.arr.push(bet);historyMap.set(key,row)}
 const historyRows=[...historyMap.entries()].map(([key,row])=>{const wins=row.arr.filter(b=>b.status==='WON').length,losses=row.arr.filter(b=>b.status==='LOST').length,pending=row.arr.filter(b=>!['WON','LOST','VOID'].includes(String(b.status||'PENDING'))).length,decided=wins+losses,hit=decided?wins/decided*100:0,units=row.arr.reduce((n,b)=>n+(['WON','LOST','VOID'].includes(String(b.status||''))?calcUnits(b):0),0);const sample=row.arr.at(-1)||row.sample;return{key,arr:row.arr,sample,label:alphaLegs(active(sample)).map(l=>l.player+' '+Number(l.qty)+(canonStat(l.stat)==='POINT'?'P':canonStat(l.stat)==='ASSIST'?'A':canonStat(l.stat)==='GOAL'?'G':'S')).join(' + '),wins,losses,pending,decided,hit,units}}).sort((a,b)=>b.hit-a.hit||b.decided-a.decided||a.label.localeCompare(b.label))
 const configLabel=(b:Bet)=>active(b).map(l=>Number(l.qty)+(canonStat(l.stat)==='POINT'?'P':canonStat(l.stat)==='ASSIST'?'A':canonStat(l.stat)==='GOAL'?'G':'S')).join(' + ')
 void configLabel;
 const freshness=info?<div className="dfoFresh"><span><small>DFO UPDATED</small><b>{dfoTime(info)}</b></span><span><small>SOURCE · {dfoConfirmed(info,slateDate)?'CONFIRMED':'PROJECTED'}</small>{info.sourceUrl?<a className="dfoSourceLink" href={info.sourceUrl} target="_blank" rel="noreferrer">{info.source||'Daily Faceoff'}</a>:<b>{info.source||'Daily Faceoff'}</b>}</span><span><small>LAST CHECKED</small><b>{info.checkedAt?new Date(info.checkedAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'—'}</b></span><button onClick={()=>loadDfo(team,true)}>CHECK FOR LINE ADJUSTMENTS</button></div>:null
 return <div className="pregameCombo"><div className="pregameComboHead"><div><small>PREGAME RESEARCH · F1–F12 GAMES · TAB TEAMS · 1–9 COMBOS</small><b>MATCHUP COMBO ANALYZER</b><span>Daily Faceoff deployment + your historical combo performance</span></div><div className="comboTeamToggle"><button className={team===away?'selected':''} onClick={()=>{setTeam(away);setPair('');setExact('')}}>{away}</button><button className={team===home?'selected':''} onClick={()=>{setTeam(home);setPair('');setExact('')}}>{home}</button></div></div>
 <div className="comboModeTabs"><button className={view==='TODAY'?'selected':''} onClick={()=>{setView('TODAY');setPair('');setExact('')}}>TODAY'S COMBOS</button><button className={view==='PERFORMANCE'?'selected':''} onClick={()=>setView('PERFORMANCE')}>COMBO PERFORMANCE</button></div>
 {view==='TODAY'?<>{freshness}<div className="comboSubTabs"><button className={todayTab==='COMBOS'?'selected':''} onClick={()=>setTodayTab('COMBOS')}>LINE COMBOS</button><button className={todayTab==='HISTORY'?'selected':''} onClick={()=>setTodayTab('HISTORY')}>BET HISTORY</button><button className={todayTab==='FORWARDS'?'selected':''} onClick={()=>setTodayTab('FORWARDS')}>FORWARD LINES</button><button className={todayTab==='DEFENSE'?'selected':''} onClick={()=>setTodayTab('DEFENSE')}>DEFENSE PAIRS</button><button className={todayTab==='PP'?'selected':''} onClick={()=>setTodayTab('PP')}>POWER PLAYS</button></div>
 {!info?<div className="comboEmpty"><b>Loading {team} from Daily Faceoff…</b><span>{dfoStatus[team]||'Startup check in progress.'}</span></div>:<>
 {dfoStatus[team]&&<div className="dfoStatus">{dfoStatus[team]}</div>}
 {todayTab==='COMBOS'&&<div className="dfoComboGrid">{pairsNow.map((r:any,i:number)=><div className="dfoComboCard" key={r.line+'|'+r.pp}><div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:10}}><div className="comboNameStatus"><b>{r.players.join(' + ')}</b><span className={`comboStatus ${dfoConfirmed(info,slateDate)?'confirmed':'projected'}`} title={dfoConfirmed(info,slateDate)?'DFO confirmed this team lineup':'DFO has not confirmed this team lineup'}>{dfoConfirmed(info,slateDate)?'✓ CONFIRMED':'◷ PROJECTED'}</span></div><kbd style={{fontSize:17,color:'#b6f5ff',border:'1px solid #247c9b',borderRadius:6,padding:'3px 9px'}} title="Keyboard shortcut">{i<9?i+1:i===9?'0':'—'}</kbd></div><div><span>{r.line} ✓</span><span>{r.pp} ✓</span></div><small>SAME FORWARD LINE + SAME POWER PLAY</small><div className="comboQuickRows"><button type="button" onClick={()=>launchCombo(r.players)}>QUICK BET COMBO</button></div></div>)}</div>}
 {todayTab==='HISTORY'&&<div className="betHistoryList">{historyRows.length?historyRows.map(r=><div className="betHistoryRow" key={r.key}><div className="betHistorySummary"><b>{r.label}</b><span>{r.wins}W–{r.losses}L{r.pending?`–${r.pending}P`:''}</span><strong className={r.units>=0?'good':'bad'}>{r.units>=0?'+':''}{r.units.toFixed(2)}u</strong><em>{r.hit.toFixed(0)}% WIN · {r.arr.length} BET{r.arr.length===1?'':'S'}</em></div><button className="inlineRebet" onClick={()=>onRebet(r.sample)}>QUICK BET</button></div>):<div className="comboEmpty"><b>No {team} bet history yet.</b><span>Wagers involving {team} players will appear here, grouped by exact configuration and sorted by win percentage.</span></div>}</div>}
 {todayTab==='FORWARDS'&&<div className="dfoGroups">{(info.forwardLines||[]).map((ln:string[],i:number)=><section key={i}><h3>LINE {i+1}</h3><div className="dfoPlayerGrid">{ln.map(n=><Player key={n} name={n} line={'L'+(i+1)} pp={ppOf(n)}/>)}</div></section>)}</div>}
 {todayTab==='DEFENSE'&&<div className="dfoGroups">{(info.defensePairs||[]).map((ln:string[],i:number)=><section key={i}><h3>PAIR {i+1}</h3><div className="dfoPlayerGrid defense">{ln.map(n=><Player key={n} name={n} line={'D'+(i+1)} pp={ppOf(n)}/>)}</div></section>)}</div>}
 {todayTab==='PP'&&<div className="dfoGroups">{[['PP1',info.pp1||[]],['PP2',info.pp2||[]]].map(([label,ln]:any)=><section key={label}><h3>{label}</h3><div className="dfoPlayerGrid pp">{ln.map((n:string)=><Player key={n} name={n} pp={label}/>)}</div></section>)}</div>}
 </>}</>:!chosenPair?<div className="pregamePairList">{pairs.length?pairs.map(r=><button className="pregamePair" key={r.key} onClick={()=>{setPair(r.key);setExact('')}}><b>{r.names.join(' + ')}</b><span><em>{r.bets.length}</em><small>TIMES BET</small></span><span className={r.units>=0?'good':'bad'}><em>{r.units>=0?'+':''}{r.units.toFixed(2)}u</em><small>UNITS GAINED</small></span><span><em>{r.hit.toFixed(0)}%</em><small>HIT</small></span><i>›</i></button>):<div className="comboEmpty"><b>No historical {team} player pairs yet.</b><span>Pairs appear here after settled combo wagers are mapped to NHL player/team identities.</span></div>}</div>:
 !detail?<><button className="comboBack" onClick={()=>setPair('')}>‹ ALL {team} PAIRS</button><div className="comboPath"><small>PLAYER PAIR</small><b>{chosenPair.names.join(' + ')}</b></div><div className="pregameExactList">{exactRows.map(r=><div className="pregameExact" key={r.key}><button onClick={()=>setExact(r.key)}><b>{r.label}</b><span>{r.arr.length}x</span><strong className={r.units>=0?'good':'bad'}>{r.units>=0?'+':''}{r.units.toFixed(2)}u</strong><em>{r.hit.toFixed(0)}%</em><i>›</i></button><button className="inlineRebet" onClick={()=>onRebet(r.arr.at(-1)!)}>QUICK BET</button></div>)}</div></>:
 <><button className="comboBack" onClick={()=>setExact('')}>‹ {chosenPair.names.join(' + ').toUpperCase()}</button><div className="comboDetailTitle"><div><small>EXACT COMBO</small><h2>{detail.label}</h2></div><button className="detailRebet" onClick={()=>onRebet(detail.arr.at(-1)!)}>QUICK BET</button></div><div className="comboDetailStats"><span><b>{detail.arr.length}</b><small>TIMES BET</small></span><span><b className={detail.units>=0?'good':'bad'}>{detail.units>=0?'+':''}{detail.units.toFixed(2)}u</b><small>UNITS GAINED</small></span><span><b>{detail.hit.toFixed(0)}%</b><small>HIT</small></span><span><b>{avgOdds==null?'—':(avgOdds>0?'+':'')+avgOdds}</b><small>AVG ODDS</small></span></div><div className="comboDetailGrid"><section><div className="miniHead"><b>ODDS HISTORY</b><span>{priced.length} priced wagers</span></div>{priced.length?<><svg className="comboOddsGraph" viewBox="0 0 620 180" preserveAspectRatio="none"><path d={path}/>{priced.map((x,i)=><circle key={x.bet.id} cx={priced.length===1?310:20+i*(580/(priced.length-1))} cy={160-((x.american-ymin)/span)*125} r="4"/>)}</svg><div className="oddsLog">{priced.map(x=><div key={x.bet.id}><span>{x.bet.date}</span><b>{x.bet.book}</b><em>{x.american>0?'+':''}{x.american}</em><strong className={calcUnits(x.bet)>=0?'good':'bad'}>{calcUnits(x.bet)>=0?'+':''}{calcUnits(x.bet).toFixed(2)}u</strong></div>)}</div></>:<div className="comboEmpty"><span>No recoverable American odds or Kalshi quoted return for this exact combo.</span></div>}</section><section><div className="miniHead"><b>INDIVIDUAL LEG HISTORY</b><span>Wager history when each exact leg appeared</span></div><div className="legHistory">{legRows.map(x=><div key={x.label}><b>{x.label}</b><span>{x.bets} bets</span><span>{x.hit.toFixed(0)}% winning wagers</span><strong className={x.units>=0?'good':'bad'}>{x.units>=0?'+':''}{x.units.toFixed(2)}u</strong></div>)}</div></section></div></>}
 </div>
}

function UnitSizeDollarInput({value,onChange}:{value:number,onChange:(value:number)=>void}){
 const [editing,setEditing]=useState(false),[draft,setDraft]=useState('');
 return <input type="text" inputMode="decimal" aria-label="Unit Size in USD" value={editing?`$${draft}`:`$${(Number.isFinite(value)?value:0).toFixed(2)}`} onFocus={()=>{setEditing(true);setDraft(Number.isFinite(value)?value.toFixed(2):'0.00')}} onChange={e=>setDraft(e.target.value.replace(/[^0-9.]/g,''))} onBlur={()=>{const next=Number(draft);if(Number.isFinite(next)&&next>=0)onChange(Math.round(next*100)/100);setEditing(false)}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}}/>;
}

function OnIceNow({game,snapshot,bets,liveStats,slateDate}:{game:Game,snapshot?:OnIceSnapshot,bets:Bet[],liveStats:LiveStats,slateDate:string}){
 if(!['LIVE','CRIT'].includes(String(game?.gameState||'')))return null;
 const gameId=String(game.id),away=abbr(game.awayTeam),home=abbr(game.homeTeam);
 // Show both pending and settled wager requirements. Never show voided legs.
 const wagerLegs=bets.filter(b=>b.date===slateDate&&b.status!=='LOST'&&b.status!=='VOID').flatMap(b=>b.legs)
  .filter(l=>!l.voided&&l.kind!=='TEAM'&&(!l.gameId||String(l.gameId)===gameId||[away,home].includes(String(l.team||'').toUpperCase())));
 const normalized=(v:string)=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
 const parts=(v:string)=>normalized(v).split(' ').filter(Boolean);
 const sameName=(a:string,b:string)=>{
  if(playerIdentityKey(a)===playerIdentityKey(b))return true;
  const x=parts(a),y=parts(b);if(x.length<2||y.length<2)return false;
  // Permit NHL's initial+surname display versus sportsbook full first name, but never surname-only matching.
  return x.at(-1)===y.at(-1)&&x[0][0]===y[0][0];
 };
 const forPlayer=(p:OnIcePlayer,team:string,roster:OnIcePlayer[])=>{
  const matches=wagerLegs.filter(l=>{
   if(l.team&&String(l.team).toUpperCase()!==team)return false;
   if(l.opponent&&String(l.opponent).toUpperCase()!==(team===away?home:away))return false;
   if(l.gameId&&String(l.gameId)!==gameId&&!l.team)return false;
   if(l.playerId&&Number(l.playerId)===p.playerId)return true;
   if(!sameName(l.player,p.name))return false;
   // Ambiguous initials are not enough: don't attribute a wager to two same-name teammates.
   return roster.filter(other=>sameName(l.player,other.name)).length===1;
  });
  const distinct=new Map<string,Leg>();for(const l of matches){
   const key=`${String(l.stat).toLowerCase()}:${Number(l.qty)}:${l.side||''}`;
   // Use the on-ice NHL ID for live-stat lookup even if an imported wager carries an obsolete ID.
   distinct.set(key,{...l,playerId:p.playerId,gameId});
  }
  return [...distinct.values()].sort((a,b)=>a.stat.localeCompare(b.stat)||a.qty-b.qty);
 };
 const shortStat=(stat:string)=>stat.toLowerCase().startsWith('goal')?'G':stat.toLowerCase().startsWith('assist')?'A':stat.toLowerCase().startsWith('shot')?'SOG':stat.toLowerCase().startsWith('save')?'SV':'P';
 const render=(team:string,players:OnIcePlayer[])=><div className="onIceTeam"><b>{team}</b><div>{players.length?players.map(p=>{const legs=forPlayer(p,team,players);return <div className={`onIcePlayer ${legs.length?'onIcePlayerTracked':''}`} key={p.playerId}><span title={p.name}>{p.name}{p.position?` - ${p.position}`:''}{p.sweaterNumber?` - ${p.sweaterNumber}`:''}</span>{legs.length>0&&<div className="onIcePlayerLegs">{legs.map(l=>{const progress=legProgress(l,liveStats);return <small className={progress.hit?'onIceLegHit':''} key={`${l.stat}:${l.qty}:${l.side||''}`}>{progress.current}/{l.qty} {shortStat(l.stat)}{progress.hit?' ✓':''}</small>})}</div>}</div>}):<em>Waiting for confirmed NHL ice data…</em>}</div></div>;
 return <section className="onIceNow"><div className="onIceHead"><b>ON ICE NOW</b><small>{snapshot?.updatedAt?`${snapshot.source||'NHL LIVE'} · ${new Date(snapshot.updatedAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit',second:'2-digit'})}`:'NHL SHIFTS · SYNCING'}</small></div><div className="onIceGrid">{render(away,snapshot?.away||[])}{render(home,snapshot?.home||[])}</div></section>
}

function ConfidenceScoreSlot({team,opponent,gameState,goals}:{team:string,opponent:string,gameState:string,goals:any}) {
 const pre=['PRE','FUT'].includes(String(gameState||''))
 if(!pre) return <strong>{goals??'-'}</strong>
 const score=matchupConfidence(team,opponent)
 const offense=CONFIDENCE_TEAMS[team]?.off_score, defense=CONFIDENCE_TEAMS[opponent]?.def_score
 const title=score==null?'Confidence score unavailable':`${team} offense ${offense.toFixed(1)} + ${opponent} defensive vulnerability ${defense.toFixed(1)} ÷ 2 = ${score.toFixed(2)} / 100 · ${CONFIDENCE_STATUS} · as of ${CONFIDENCE_AS_OF}`
 return <strong className="pregameConfidenceScore" style={{backgroundColor:score==null?'transparent':confidenceColor(score),color:score==null?'#8496a4':'#09151a'}} title={title}>{score==null?'—':score.toFixed(1)}</strong>
}

function ConfidenceBreakdown({away,home}:{away:string,home:string}) {
 const [expanded,setExpanded]=useState<string|null>(null)
 const [metricOpen,setMetricOpen]=useState<Record<string,boolean>>({})
 const sides=[{team:away,opponent:home},{team:home,opponent:away}]
 const fmt=(v:any,d=2)=>Number.isFinite(v)?Number(v).toFixed(d):'—'
 return <section className="confidenceAnalysis">
  <div className="confidenceAnalysisHeading"><b>CONFIDENCE ENGINE</b><small>Pregame matchup ratings · {CONFIDENCE_AS_OF}</small></div>
  <div className="confidenceCards">{sides.map(({team,opponent})=>{const score=matchupConfidence(team,opponent);return <button key={team} type="button" className={`confidenceCard ${expanded===team?'active':''}`} onClick={()=>setExpanded(x=>x===team?null:team)} aria-expanded={expanded===team}>
    <small>{team} ATTACKING {opponent}</small><strong style={{color:confidenceColor(score)}}>{score==null?'—':score.toFixed(1)}<span> / 100</span></strong><span>{expanded===team?'▼ Hide breakdown':'▶ View breakdown'}</span>
  </button>})}</div>
  {sides.filter(({team})=>expanded===team).map(({team,opponent})=>{const offense=CONFIDENCE_TEAMS[team],defense=CONFIDENCE_TEAMS[opponent];if(!offense||!defense)return <p key={team}>Confidence data unavailable.</p>;const score=matchupConfidence(team,opponent)
   return <div className="confidenceDetails" key={team}>
    <div className="confidenceEquation"><b>{team} OFFENSE <em>{fmt(offense.off_score,1)}/100</em></b><b>{opponent} DEFENSIVE VULNERABILITY <em>{fmt(defense.def_score,1)}/100</em></b><strong>= {fmt(score,2)}/100</strong></div>
    <div className="confidenceMetricsHeader"><span>METRIC · click to inspect underlying stats</span><b>{team} OFF</b><b>{opponent} DEF</b></div>
    {CONFIDENCE_METRICS.map(m=>{const key=team+':'+m.name;const isOpen=!!metricOpen[key];const op=offense[m.offPrefix+'_pts'],dp=defense[m.defPrefix+'_pts'];const oval=offense[m.off],dval=defense[m.def];const pct=m.name==='Last 5 Combo Hit %';return <div key={key} className="confidenceMetricBlock">
      <button className="confidenceMetricRow" type="button" aria-expanded={isOpen} onClick={()=>setMetricOpen(old=>({...old,[key]:!old[key]}))}><span>{isOpen?'▼':'▶'} {m.name}</span><b>{fmt(op,1)} / {m.max}</b><b>{fmt(dp,1)} / {m.max}</b></button>
      {isOpen&&<div className="confidenceMetricEvidence"><div><small>{team} · {m.offLabel}</small><strong>{pct?fmt(oval*100,1)+'%':fmt(oval,m.max===20?3:2)}</strong><span>League rank #{offense[m.offPrefix+'_rank']??'—'} · {fmt(op,1)}/{m.max} pts</span></div><div><small>{opponent} · {m.defLabel}</small><strong>{pct?fmt(dval*100,1)+'%':fmt(dval,m.max===20?3:2)}</strong><span>League rank #{defense[m.defPrefix+'_rank']??'—'} · {fmt(dp,1)}/{m.max} pts</span></div></div>}
     </div>})}
   </div>})}
  <p className="confidenceDisclosure">{CONFIDENCE_STATUS}. L5 uses available historical combo observations, not necessarily five fully covered games. Values are a fixed model snapshot, not refreshed by UPDATE STATS. Higher defensive rating means easier to attack. Goalie GAA is not yet included.</p>
 </section>
}

function MatchupAnalysis({game,clubStats,verifyGame,verifyStatus}:{game:Game,bets:Bet[],liveStats:LiveStats,teamHistory:TeamGameResult[],leagueStandings:any[],clubStats:Record<string,any>,onIce?:OnIceSnapshot,verifyGame?:(gameId:number)=>void,verifyStatus?:string}){
 const [open,setOpen]=useState(false)
 if(!game)return null
 const away=abbr(game.awayTeam),home=abbr(game.homeTeam)
 // NHL club stats currently identify the most-used goalie, not necessarily a confirmed starter.
 const goalie=(team:string)=>{const data=clubStats?.[team];const rows=[...(data?.goalies||data?.goalieSummary||[])];rows.sort((a:any,b:any)=>Number(b.gamesStarted??b.gamesPlayed??0)-Number(a.gamesStarted??a.gamesPlayed??0));return rows[0]||null}
 const goalieName=(g:any)=>g?([g.firstName?.default||g.firstName,g.lastName?.default||g.lastName].filter(Boolean).join(' ')||g.name?.default||g.name||'—'):'—'
 const metric=(g:any,keys:string[])=>{if(!g)return null;for(const k of keys){const value=g[k];if(value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value)))return Number(value)}return null}
 const goalieCard=(team:string)=>{const g=goalie(team);const sv=metric(g,['savePctg','savePercentage','svPct']);const gaa=metric(g,['goalsAgainstAverage','gaa']);const starts=metric(g,['gamesStarted','gamesPlayed']);return <div className="matchupGoalieCard" key={team}><div className="matchupGoalieTeam">{team} <span>Projected primary · not confirmed</span></div><strong>{goalieName(g)}</strong><div className="matchupGoalieStats"><div><small>SV%</small><b>{sv==null?'—':sv.toFixed(3)}</b></div><div><small>GAA</small><b>{gaa==null?'—':gaa.toFixed(2)}</b></div><div><small>Starts / games</small><b>{starts==null?'—':String(starts)}</b></div></div></div>}
 return <section className={`matchupAnalysis ${open?'':'collapsed'}`}>
  <button className="matchupHead matchupToggle" onClick={()=>setOpen(x=>!x)}><div><small>MATCHUP ANALYSIS</small><b>{away} @ {home}</b></div><span>Confidence Engine · matchup ratings and underlying evidence</span><i>{open?'▼':'▶'}</i></button>
  <div className="gameVerifyBar"><button className="verifyButton" onClick={()=>verifyGame?.(game.id)}>{['FINAL','OFF'].includes(String(game.gameState||''))?'VERIFY GAME':'UPDATE STATS'}</button><small>{verifyStatus||(['FINAL','OFF'].includes(String(game.gameState||''))?'Re-check official final NHL stats · sportsbook settlement preserved':'Force-refresh current NHL stats')}</small></div>
  {open&&<><ConfidenceBreakdown away={away} home={home}/><section className="matchupGoalies"><div className="matchupGoaliesHeading"><b>GOALIES</b><small>Current club stats · starter confirmation unavailable</small></div><div className="matchupGoaliesGrid">{goalieCard(away)}{goalieCard(home)}</div><p>Goalie GAA is informational and is not yet included in the Confidence Engine score.</p></section></>}
 </section>
}

function LiveBetGameAccordion({label,bets,liveStats,gameOptions,onPatch,onDelete,open=false,verifyGameId,verifyGame,verifyStatus='',verifyMode='FINAL'}:{label:string,bets:Bet[],liveStats:LiveStats,gameOptions:{key:string,label:string}[],onPatch:(id:string,patch:Partial<Bet>)=>void,onDelete:(id:string)=>void,open?:boolean,verifyGameId?:number,verifyGame?:(gameId:number)=>void,verifyStatus?:string,verifyMode?:'LIVE'|'FINAL'}){
 const w=bets.filter(b=>(b.status||'PENDING')==='WON').length,l=bets.filter(b=>(b.status||'PENDING')==='LOST').length,p=bets.length-w-l
 const out=bets.reduce((n,b)=>n+Number(b.units||0),0)
 const returned=bets.reduce((n,b)=>{if((b.status||'PENDING')!=='WON')return n;const stake=b.units*b.unitSize;const dollars=b.payout!=null?b.payout:b.odds!=null?stake+(b.odds>0?stake*b.odds/100:stake*100/Math.abs(b.odds)):stake;return n+(dollars/b.unitSize)},0)
 const net=returned-out
 return <details className="liveBetAccordion" open={open}><summary><b>{label}</b><span>{bets.length} Bet{bets.length===1?'':'s'} · {out.toFixed(2)}u Out · {returned.toFixed(2)}u Returned</span><strong className={net>0?'winText':net<0?'lossText':''}>{net>=0?`+${net.toFixed(2)}u Profit`:`(${Math.abs(net).toFixed(2)}u) Loss`}</strong><small>{w}W–{l}L–{p}P</small>{verifyGameId&&verifyGame&&<button type="button" className={`rowVerifyButton ${verifyStatus.includes('CORRECTION')?'adjustment':verifyStatus.includes('VERIFIED')?'verified':''}`} onClick={e=>{e.preventDefault();e.stopPropagation();verifyGame(verifyGameId)}} disabled={verifyStatus==='VERIFYING…'}>{verifyStatus==='VERIFYING…'?(verifyMode==='LIVE'?'UPDATING…':'VERIFYING…'):verifyStatus.includes('CORRECTION')||verifyStatus.includes('ADJUSTMENT')?'ADJUSTMENT FOUND ⚠':verifyMode==='LIVE'?'UPDATE STATS':'VERIFY GAME'}</button>}</summary><div className="liveBetBody compactBetList">{bets.map(b=><CompactLiveBet key={b.id} b={b} liveStats={liveStats} gameOptions={gameOptions} onPatch={(patch:any)=>onPatch(b.id,patch)} onEdit={(patch:any)=>onPatch(b.id,patch)} onDelete={()=>onDelete(b.id)}/>)}</div></details>
}
function CompactLiveBet({b,liveStats,gameOptions,onPatch,onEdit,onDelete}:{b:Bet,liveStats:LiveStats,gameOptions:{key:string,label:string}[],onPatch:any,onEdit:any,onDelete:any}){
 const stake=b.units*b.unitSize;const odds=b.odds??(b.payout?americanFromReturn(stake,b.payout):undefined);const teamSet=[...new Set(b.legs.map(l=>l.team).filter(Boolean))];const prefix=teamSet.length===1?teamSet[0]:(teamSet.length>1?'MULTI':'BET');const status=b.status||'PENDING'
 return <details className={`compactBet ${status.toLowerCase()}`}><summary><span className="compactBetTeam">{prefix}</span><span className="compactBetLegs">{b.legs.map((leg,i)=>{const pr=legProgress(leg,liveStats);const legState=leg.voided?'voided':status==='WON'?'hit':leg.kind==='TEAM'?'pending':pr.hit?'hit':status==='LOST'?'miss':'pending';return <span key={i} className={`compactLeg ${legState}`}>{leg.voided?`${leg.player} VOID`:leg.kind==='TEAM'?(leg.stat==='Game Total'?`${leg.player} ${leg.side==='OVER'?'O':'U'} ${leg.qty}`:leg.stat==='Spread'?`${leg.team} ${leg.qty>0?'+':''}${leg.qty}`:`${leg.team} ML`):`${leg.player} ${leg.qty}${leg.stat.toLowerCase().startsWith('point')?'P':leg.stat.toLowerCase().startsWith('goal')?'G':leg.stat.toLowerCase().startsWith('assist')?'A':leg.stat.toLowerCase().startsWith('shot')?' SOG':` ${leg.stat}`}`}{i<b.legs.length-1?' + ':''}</span>})}</span><span className="compactBetPrice">{b.units.toFixed(2)}u @ {odds!=null?(odds>0?`+${odds}`:odds):'—'}{b.book?.trim()?` - ${b.book.trim()}`:''}</span></summary><div className="compactBetDetails"><BetCard b={b} liveStats={liveStats} gameOptions={gameOptions} onPatch={onPatch} onEdit={onEdit} onDelete={onDelete}/></div></details>
}


type PairDraft={seed:Bet;book:string;units:string;quote:string;locked:boolean};
function BatchPairEntry({seeds,date,games,unitSize,setBets,onDone}:{seeds:Bet[],date:string,games:Game[],unitSize:number,setBets:any,onDone:()=>void}){
 const [rows,setRows]=useState<PairDraft[]>(()=>seeds.map(seed=>({seed,book:'',units:seed.legs.some(l=>Number(l.qty)>=2)?'0.5':'1',quote:'',locked:false})));
 const [error,setError]=useState('');
 const [saving,setSaving]=useState(false);
 const batchRef=useRef<HTMLElement>(null);
 const finishOnNextEnter=useRef(false);
 useEffect(()=>{batchRef.current?.querySelector('select')?.focus()},[]);
 const patch=(i:number,change:Partial<PairDraft>)=>{finishOnNextEnter.current=false;setRows(prev=>prev.map((r,j)=>j===i?{...r,...change,locked:false}:r))};
 const validate=(r:PairDraft)=>{const u=Number(r.units),q=Number(r.quote),kalshi=r.book.toLowerCase().includes('kalshi');if(!BOOKS.some(b=>b.toLowerCase()===r.book.toLowerCase()))return 'Choose a sportsbook';if(!Number.isFinite(u)||u<=0)return 'Enter valid units';if(!r.quote.trim()||!Number.isFinite(q)||q===0)return 'Enter valid odds or payout';if(kalshi&&q<=u*unitSize)return 'Kalshi return must exceed stake';if(!kalshi&&Math.abs(q)<100)return 'Enter American odds of +100 or greater, or -100 or lower';return ''};
 const locked=rows.filter(r=>r.locked);
 async function finalize(){if(saving||!locked.length)return;setSaving(true);try{if(!(unitSize>0))throw new Error('Set a valid dollar-per-unit value in Settings');const checked=await Promise.all(locked.map(r=>verifiedPlayerLegs(r.seed.legs,games)));const now=Date.now();const output:Bet[]=locked.map((r,i)=>{const legs:Leg[]=checked[i];const stake=Number(r.units)*unitSize;const kalshi=r.book.toLowerCase().includes('kalshi');const payout=kalshi?Number(r.quote):undefined;const odds=kalshi?americanFromReturn(stake,payout!):Number(r.quote);const b=normalizeBet(date,legs,r.book,Number(r.units),unitSize,payout,odds);b.id=`BET-${now}-${i}-${Math.random().toString(36).slice(2,9)}`;b.legs=legs;b.groupKey=String(legs[0].gameId);b.category='COMBOS';b.source='LIVE';return b});setBets((old:Bet[])=>[...output,...old]);onDone()}catch(e:any){setError(e?.message||'Unable to finalize batch')}finally{setSaving(false)}}
 return <section ref={batchRef} className="batchPairEntry" style={{padding:18}} onKeyDownCapture={e=>{if(e.key==='Enter'&&finishOnNextEnter.current&&!e.repeat&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();e.stopPropagation();finishOnNextEnter.current=false;finalize();return}if(e.key!=='Enter'&&!['Shift','Control','Alt','Meta'].includes(e.key))finishOnNextEnter.current=false;if(e.ctrlKey&&e.key==='Enter'){e.preventDefault();finalize()}}}><div className="sectionTitle"><div><b>COMBO BATCH · BET COMBO</b><span>Lock each wager you want, then finalize all locked wagers together</span></div></div>{rows.map((r,i)=>{const validation=validate(r);return <div key={i} style={{border:'1px solid #28495b',borderRadius:10,padding:14,margin:'12px 0',background:'#0c1e29'}}><div style={{display:'flex',justifyContent:'space-between'}}><strong>{r.seed.legs.length===3?'TRIPLE · A + B + C':`PAIR ${i+1}`}</strong><b style={{color:r.locked?'#65e5aa':'#91a6b7'}}>{r.locked?'LOCKED':'UNLOCKED'}</b></div>{r.seed.legs.map((l,j)=><div key={j} style={{padding:'7px 10px',margin:'6px 0',background:'#112c3d',borderRadius:6}}>{l.player} · {l.qty} {l.stat}</div>)}<div className="priceRow wagerMetaRow"><label>SPORTSBOOK<select value={r.book} onChange={e=>patch(i,{book:e.target.value})}><option value="">Choose sportsbook…</option>{BOOKS.map(b=><option key={b} value={b}>{b}</option>)}</select></label><label>UNITS<input value={r.units} onFocus={e=>e.currentTarget.select()} onChange={e=>patch(i,{units:e.target.value})}/></label><label>{r.book.toLowerCase().includes('kalshi')?'TOTAL RETURN ($)':'AMERICAN ODDS'}<input value={r.quote} onChange={e=>patch(i,{quote:e.target.value})} onKeyDown={e=>{if(e.key==='Enter'&&!validation){e.preventDefault();setRows(old=>old.map((x,j)=>j===i?{...x,locked:true}:x));finishOnNextEnter.current=true;const next=batchRef.current?.querySelectorAll<HTMLSelectElement>('select')[i+1];next?.focus()}}} placeholder={r.book.toLowerCase().includes('kalshi')?'Total return in dollars':'+145 or -110'}/></label></div><button type="button" disabled={!r.locked&&!!validation} onClick={()=>setRows(old=>old.map((x,j)=>j===i?{...x,locked:!x.locked}:x))}>{r.locked?'UNLOCK TO EDIT':'LOCK IN BET'}</button>{!r.locked&&r.book&&r.quote&&validation&&<small style={{marginLeft:10}}>{validation}</small>}</div>})}<div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}><button type="button" disabled={saving||locked.length===0} onClick={finalize}>FINALIZE {locked.length} {locked.length===1?'BET':'BETS'}</button><span>{locked.length} of {rows.length} locked · {locked.reduce((n,r)=>n+Number(r.units),0).toFixed(2)}u</span></div>{error&&<div className="notice">{error}</div>}</section>
}

function BetCenter({date,setDate,unitSize,bets,setBets,games,liveStats,rebetSeed=null}:{date:string,setDate:any,unitSize:number,bets:Bet[],setBets:any,games:Game[],liveStats:LiveStats,rebetSeed?:Bet|null}){
 const[legs,setLegs]=useState<Leg[]>([]),[player,setPlayer]=useState(''),[selectedPlayer,setSelectedPlayer]=useState<any|null>(null),[qty,setQty]=useState(''),[stat,setStat]=useState(''),[stage,setStage]=useState<'legs'|'price'>('legs'),[book,setBook]=useState(''),[units,setUnits]=useState('1'),[price,setPrice]=useState(''),[bonusBet,setBonusBet]=useState(false),[notice,setNotice]=useState(''),[roster,setRoster]=useState<any[]>(()=>JSON.parse(localStorage.getItem(`roster:${date}`)||'[]')),[seedApplied,setSeedApplied]=useState(false),[rosterStatus,setRosterStatus]=useState(()=>{const c=JSON.parse(localStorage.getItem(`roster:${date}`)||'[]');return c.length?`${c.length} players · today's slate`:'Slate players'}),[activeSuggestion,setActiveSuggestion]=useState(0),[category,setCategory]=useState<BetCategory>('COMBOS'),[wagerMode,setWagerMode]=useState<'PLAYER'|'TEAM'>('PLAYER'),[modeStage,setModeStage]=useState<'choose'|'entry'>('choose'),[teamChoice,setTeamChoice]=useState(''),[teamMarket,setTeamMarket]=useState<''|'Moneyline'|'Spread'|'Game Total'>(''),[teamSide,setTeamSide]=useState(''),[teamLine,setTeamLine]=useState(''),[teamActive,setTeamActive]=useState(0),[teamCommitted,setTeamCommitted]=useState(false);const modeRef=useRef<HTMLDivElement>(null),playerRef=useRef<HTMLInputElement>(null),qtyRef=useRef<HTMLInputElement>(null),statRef=useRef<HTMLInputElement>(null),teamRef=useRef<HTMLInputElement>(null),marketRef=useRef<HTMLSelectElement>(null),sideRef=useRef<HTMLInputElement>(null),lineRef=useRef<HTMLInputElement>(null),categoryRef=useRef<HTMLSelectElement>(null),bookRef=useRef<HTMLInputElement>(null),unitsRef=useRef<HTMLInputElement>(null),priceRef=useRef<HTMLInputElement>(null),fileRef=useRef<HTMLInputElement>(null)
 void fileRef;
 useEffect(()=>{if(modeStage==='choose')requestAnimationFrame(()=>modeRef.current?.focus())},[modeStage])
 function modeChoiceKey(e:any){if(modeStage!=='choose')return;if(e.key==='Enter'){e.preventDefault();e.stopPropagation();setWagerMode('PLAYER');setModeStage('entry');setLegs([]);setStage('legs');setTimeout(()=>playerRef.current?.focus(),0)}else if(e.key==='Tab'&&!e.shiftKey){e.preventDefault();e.stopPropagation();setWagerMode('TEAM');setModeStage('entry');setLegs([]);setStage('legs');setTeamMarket('');setTimeout(()=>teamRef.current?.focus(),0)}}
 useEffect(()=>{const cached=JSON.parse(localStorage.getItem(`roster:${date}`)||'[]');if(cached.length){setRoster(cached);setRosterStatus(`${cached.length} players · today's slate`) }},[date])
 const today=bets.filter(b=>b.date===date);const statName=STATS[stat.toLowerCase()]||stat
 void statName;
 const gameOptions=games.map(g=>({key:String(g.id),label:`${abbr(g.awayTeam)} @ ${abbr(g.homeTeam)}`}))
 const labels=new Map(gameOptions.map(x=>[x.key,x.label]));labels.set('MULTI','MULTI-GAME');labels.set('UNASSIGNED','UNASSIGNED');labels.set('UNRESOLVED','NEEDS RESOLUTION')
 const teamGame=useMemo(()=>{const m=new Map<string,string>();for(const g of games){m.set(abbr(g.awayTeam),String(g.id));m.set(abbr(g.homeTeam),String(g.id))}return m},[games])
 useEffect(()=>{let alive=true;async function load(){const teams=[...new Set(games.flatMap(g=>[abbr(g.awayTeam),abbr(g.homeTeam)]).filter(t=>t&&t!=='???'))];if(!teams.length){setRoster([]);setRosterStatus('No slate players loaded');return}const all:any[]=[];await Promise.all(teams.map(async team=>{try{const r=await window.nhlTracker.roster(team);for(const section of ['forwards','defensemen','goalies'])for(const p of(r?.[section]||[])){const full=[name(p.firstName),name(p.lastName)].filter(Boolean).join(' ');if(full)all.push({id:Number(p.id),name:full,team,position:p.positionCode||'',gameId:teamGame.get(team)})}}catch{}}));if(alive){addPlayerIdentities(all.map(p=>({id:p.id,name:p.name,team:p.team})));all.sort((a,b)=>a.name.localeCompare(b.name));setRoster(all);localStorage.setItem(`roster:${date}`,JSON.stringify(all));setRosterStatus(`${all.length} players · today's slate`)}}load();return()=>{alive=false}},[games,teamGame,date])
 useEffect(()=>{if(!rebetSeed||seedApplied||!roster.length)return;const mapped:Leg[]=[];for(const old of rebetSeed.legs.filter(l=>!l.voided)){if(old.kind==='TEAM'){setNotice('TEAM-BET REBET IS NOT AVAILABLE YET');return}const hit=roster.find((p:any)=>old.playerId?Number(p.id)===Number(old.playerId):playerIdentityKey(p.name)===playerIdentityKey(old.player));if(!hit){setNotice(`${old.player.toUpperCase()} IS NOT ON TODAY’S NHL SLATE`);return}const g=games.find((x:Game)=>String(x.id)===String(hit.gameId));if(!g){setNotice(`${old.player.toUpperCase()} HAS NO GAME ON TODAY’S SLATE`);return}const team=hit.team,opponent=team===abbr(g.awayTeam)?abbr(g.homeTeam):abbr(g.awayTeam);const rawStat=String(old.stat||'').trim();const statKey=rawStat.toLowerCase().replace(/[^a-z0-9]/g,'');const normalizedStat=statKey==='p'||statKey==='pt'||statKey==='pts'||statKey==='point'||statKey==='points'||rawStat===';'?'Point':statKey==='g'||statKey==='goal'||statKey==='goals'?'Goal':statKey==='a'||statKey==='ast'||statKey==='assist'||statKey==='assists'?'Assist':statKey==='s'||statKey==='sog'||statKey==='shot'||statKey==='shots'?'Shot':rawStat;mapped.push({...old,stat:normalizedStat,player:hit.name,playerId:Number(hit.id),team,opponent,gameId:String(g.id),voided:false})}setLegs(mapped);setWagerMode('PLAYER');setModeStage('entry');setStage('price');setCategory(rebetSeed.category||'COMBOS');setUnits(String(rebetSeed.units||1));setBook('');setPrice('');setNotice(`REBET LOADED · ${mapped.length} LEGS RESOLVED TO TODAY’S NHL SLATE`);setSeedApplied(true);requestAnimationFrame(()=>bookRef.current?.focus())},[rebetSeed,seedApplied,roster,games])
 const playerHistory=useMemo(()=>{const frequency=new Map<string,number>(),recency=new Map<string,number>(),pairs=new Map<string,number>();const market=new Map<string,Map<string,number>>();const ordered=[...bets].sort((a,b)=>String(a.createdAt||a.date).localeCompare(String(b.createdAt||b.date)));ordered.forEach((b,idx)=>{const names=[...new Set(b.legs.filter(l=>l.kind!=='TEAM').map(l=>l.player.trim()).filter(Boolean))];for(const l of b.legs.filter(l=>l.kind!=='TEAM')){const n=l.player.trim().toLowerCase();frequency.set(n,(frequency.get(n)||0)+1);recency.set(n,idx+1);const mm=market.get(n)||new Map<string,number>();mm.set(l.stat,(mm.get(l.stat)||0)+1);market.set(n,mm)}for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++){const a=names[i].toLowerCase(),c=names[j].toLowerCase(),k=[a,c].sort().join('|');pairs.set(k,(pairs.get(k)||0)+1)}});return{frequency,recency,pairs,market}},[bets])
 const pairCount=(candidate:string)=>legs.filter(l=>l.kind!=='TEAM').reduce((n,l)=>n+(playerHistory.pairs.get([candidate.toLowerCase(),l.player.toLowerCase()].sort().join('|'))||0),0)
 const favoriteMarket=(candidate:string)=>{const mm=playerHistory.market.get(candidate.toLowerCase());if(!mm)return'';return[...mm.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||''}
 const [sharedIndexTick,setSharedIndexTick]=useState(0)
 useEffect(()=>{const fn=()=>setSharedIndexTick(v=>v+1);window.addEventListener('nhl-shared-players-updated',fn);return()=>window.removeEventListener('nhl-shared-players-updated',fn)},[])
 const suggestions=useMemo(()=>{if(selectedPlayer)return[];const q=player.trim().toLowerCase();const used=new Set(legs.filter(l=>l.kind!=='TEAM').map(l=>l.player.toLowerCase()));const indexed=readPlayerDb().flatMap(p=>p.teams.filter(t=>teamGame.has(t)).map(t=>({id:p.id,name:p.name,team:t,position:'F',gameId:teamGame.get(t)})));const combined=[...roster,...indexed.filter(p=>!roster.some(r=>r.id===p.id||r.name.toLowerCase()===p.name.toLowerCase()))];const pool=combined.filter(p=>!used.has(p.name.toLowerCase())&&(!q||p.name.toLowerCase().includes(q)));return pool.map(p=>{const al=p.name.toLowerCase(),last=al.split(' ').at(-1)||'',match=q?(last.startsWith(q)?0:al.startsWith(q)?1:2):3;const pair=pairCount(p.name),freq=playerHistory.frequency.get(al)||0,recent=playerHistory.recency.get(al)||0;return{...p,_pair:pair,_freq:freq,_recent:recent,_match:match,_market:favoriteMarket(p.name)}}).filter(p=>q||p._pair>0).sort((a,b)=>q?(a._match-b._match||b._pair-a._pair||b._freq-a._freq||b._recent-a._recent||a.name.localeCompare(b.name)):(b._pair-a._pair||b._freq-a._freq||b._recent-a._recent||a.name.localeCompare(b.name))).slice(0,12)},[player,roster,selectedPlayer,legs,playerHistory,sharedIndexTick])
 useEffect(()=>setActiveSuggestion(0),[player,legs.length])
 const[bookCommitted,setBookCommitted]=useState(false)
 const bookSuggestions=BOOKS.filter(x=>!bookCommitted&&book.trim()&&x.toLowerCase().includes(book.trim().toLowerCase()))
 const groups=useMemo(()=>{const m=new Map<string,Bet[]>();for(const b of today){const k=b.groupKey||'UNASSIGNED';m.set(k,[...(m.get(k)||[]),b])}return m},[today])
 const[open,setOpen]=useState<Record<string,boolean>>({})
 function choosePlayer(p:any){setSelectedPlayer(p);setPlayer(p.name);setActiveSuggestion(0)}
 const slateTeams=[...new Set(games.flatMap(g=>[abbr(g.awayTeam),abbr(g.homeTeam)]).filter(t=>t&&t!=='???'))];
 const teamEntries=useMemo(()=>slateTeams.map(team=>{const g=games.find(x=>abbr(x.awayTeam)===team||abbr(x.homeTeam)===team);const obj=g?(abbr(g.awayTeam)===team?g.awayTeam:g.homeTeam):null;return{value:team,label:`${team} · ${teamFullName(obj)} · ${g?`${abbr(g.awayTeam)} @ ${abbr(g.homeTeam)}`:''}`,gameId:g?String(g.id):''}}),[games,slateTeams.join('|')])
 const selectedTeamEntry=teamEntries.find(x=>x.value.toLowerCase()===teamChoice.trim().toLowerCase())
 const selectedTeamGame=selectedTeamEntry?games.find(x=>String(x.id)===String(selectedTeamEntry.gameId)):null
 const selectedMatchup=selectedTeamGame?`${abbr(selectedTeamGame.awayTeam)} @ ${abbr(selectedTeamGame.homeTeam)}`:''
 const teamSuggestions=useMemo(()=>{const q=teamChoice.trim().toLowerCase();if(!q||teamCommitted)return[];const score=(x:any)=>{const value=x.value.toLowerCase(),label=x.label.toLowerCase(),full=label.split('·')[1]?.trim()||'';if(value===q)return 0;if(value.startsWith(q))return 1;if(full.startsWith(q))return 2;if(label.startsWith(q))return 3;if(value.includes(q))return 4;if(full.includes(q))return 5;return 6};return teamEntries.filter(x=>x.label.toLowerCase().includes(q)||x.value.toLowerCase().includes(q)).sort((a,b)=>score(a)-score(b)||a.value.localeCompare(b.value)).slice(0,12)},[teamChoice,teamEntries,teamCommitted])
 useEffect(()=>setTeamActive(0),[teamChoice,teamMarket])
 function chooseTeamEntry(x:any){setTeamChoice(x.value);setTeamCommitted(true);setTeamActive(0)}
 function teamEntryKey(e:any){if(e.key==='ArrowDown'&&teamSuggestions.length){e.preventDefault();setTeamActive(i=>Math.min(i+1,teamSuggestions.length-1));return}if(e.key==='ArrowUp'&&teamSuggestions.length){e.preventDefault();setTeamActive(i=>Math.max(i-1,0));return}if(e.key==='Enter'&&!teamChoice.trim()&&legs.length){e.preventDefault();setStage('price');setTimeout(()=>categoryRef.current?.focus(),0);return}if((e.key==='Tab'&&!e.shiftKey)||e.key==='Enter'){const exact=teamEntries.find(x=>x.value.toLowerCase()===teamChoice.trim().toLowerCase());const pick=exact||teamSuggestions[teamActive]||teamSuggestions[0];if(pick){e.preventDefault();chooseTeamEntry(pick);setTimeout(()=>marketRef.current?.focus(),0)}}}

 function teamStepBack(e:any,step:'TEAM'|'MARKET'|'SIDE'|'LINE'){if(!(e.ctrlKey&&e.key.toLowerCase()==='z')&&!(e.key==='Backspace'&&(e.currentTarget?.value??'')===''))return false;e.preventDefault();if(step==='LINE'){setTeamLine('');if(teamMarket==='Game Total')setTimeout(()=>sideRef.current?.focus(),0);else setTimeout(()=>marketRef.current?.focus(),0)}else if(step==='SIDE'){setTeamSide('');setTimeout(()=>marketRef.current?.focus(),0)}else if(step==='MARKET'){setTeamMarket('');setTeamSide('');setTeamLine('');setTimeout(()=>teamRef.current?.focus(),0)}else if(legs.length){const prev=legs[legs.length-1];if(prev.kind==='TEAM'){setLegs(x=>x.slice(0,-1));setTeamChoice(prev.stat==='Game Total'?(prev.team||''):prev.team||prev.player);setTeamCommitted(true);setTeamMarket(prev.stat as any);setTeamSide(prev.side==='OVER'?'O':prev.side==='UNDER'?'U':'');setTeamLine(prev.stat==='Moneyline'?'':String(prev.qty));setTimeout(()=>prev.stat==='Moneyline'?marketRef.current?.focus():lineRef.current?.focus(),0)}}return true}
 function addTeamLeg(selected?:any){const exact=selected||teamEntries.find(x=>x.value.toLowerCase()===teamChoice.trim().toLowerCase())||teamSuggestions[0];if(!exact){setNotice(teamMarket==='Game Total'?'Choose a matchup from today\'s slate.':'Choose a team from today\'s slate.');return false}const g=games.find(x=>String(x.id)===String(exact.gameId));if(!g){setNotice('Choose an item from today\'s slate.');return false}const away=abbr(g.awayTeam),home=abbr(g.homeTeam);if(!teamMarket){setNotice('Choose Moneyline, Spread, or O/U.');return false}let next:Leg;if(teamMarket==='Game Total'){const side=teamSide.trim().toUpperCase();const line=Number(teamLine);if(!['O','OVER','U','UNDER'].includes(side)||!Number.isFinite(line)){setNotice('Enter O or U, then the game total.');return false}const normalized=side.startsWith('O')?'OVER':'UNDER';next={player:`${away} @ ${home}`,qty:line,stat:'Game Total',team:home,opponent:away,gameId:String(g.id),kind:'TEAM',side:normalized}}else{const team=exact.value;const opponent=team===away?home:away;if(teamMarket==='Spread'){const line=Number(teamLine);if(!Number.isFinite(line)){setNotice('Enter a spread such as -1.5 or +1.5.');return false}next={player:team,qty:line,stat:'Spread',team,opponent,gameId:String(g.id),kind:'TEAM'}}else next={player:team,qty:1,stat:'Moneyline',team,opponent,gameId:String(g.id),kind:'TEAM'}}setLegs(l=>[...l,next]);setTeamChoice('');setTeamCommitted(false);setTeamMarket('');setTeamSide('');setTeamLine('');setTeamActive(0);setNotice('');setStage('legs');setTimeout(()=>teamRef.current?.focus(),0);return true}
 function addLeg(){const p=selectedPlayer||roster.find(x=>x.name.toLowerCase()===player.trim().toLowerCase());if(!p){setNotice('Choose a player from the slate autocomplete list.');return false}const normalized=STATS[stat.trim().toLowerCase()];if(!normalized){setNotice('Invalid stat. Choose P, G, A, S, or 1st P Point.');return false}const target=Number(qty);if(!Number.isInteger(target)||target<1){setNotice('Enter a whole-number target of at least 1.');return false}setLegs(l=>[...l,{player:p.name,qty:target,stat:normalized,playerId:p.id,team:p.team,position:p.position,gameId:p.gameId} as any]);setPlayer('');setSelectedPlayer(null);setQty('');setStat('');setNotice('');setTimeout(()=>playerRef.current?.focus(),0);return true}
 function beginPriceStage(){setUnits(legs.some(l=>l.kind!=='TEAM'&&l.stat==='Point'&&Number(l.qty)>=2)?'0.5':'1');setStage('price');setTimeout(()=>categoryRef.current?.focus(),0)}
 function playerKey(e:any){if(e.key==='ArrowDown'&&suggestions.length){e.preventDefault();setActiveSuggestion(i=>Math.min(i+1,suggestions.length-1));return}if(e.key==='ArrowUp'&&suggestions.length){e.preventDefault();setActiveSuggestion(i=>Math.max(i-1,0));return}if(e.key==='Enter'&&!player.trim()&&legs.length){e.preventDefault();beginPriceStage();return}if(e.key==='Tab'&&!e.shiftKey&&suggestions.length&&!selectedPlayer){e.preventDefault();choosePlayer(suggestions[activeSuggestion]||suggestions[0]);setTimeout(()=>qtyRef.current?.focus(),0);return}if(e.key==='Tab'&&!e.shiftKey&&selectedPlayer){e.preventDefault();setTimeout(()=>qtyRef.current?.focus(),0);return}if(e.key==='Enter'&&player.trim()){e.preventDefault();if(selectedPlayer)setTimeout(()=>qtyRef.current?.focus(),0);return}}
 function playerStepBack(e:any,step:'PLAYER'|'QTY'|'STAT'){if(!(e.ctrlKey&&e.key.toLowerCase()==='z')&&!(e.key==='Backspace'&&(e.currentTarget?.value??'')===''))return false;e.preventDefault();if(step==='STAT'){setStat('');setTimeout(()=>qtyRef.current?.focus(),0)}else if(step==='QTY'){setQty('');setTimeout(()=>playerRef.current?.focus(),0)}else if(legs.length){const prev=legs[legs.length-1];setLegs(x=>x.slice(0,-1));const p=roster.find(x=>x.id===prev.playerId)||null;setPlayer(prev.player);setSelectedPlayer(p);setQty(String(prev.qty));setStat(prev.stat);setTimeout(()=>statRef.current?.focus(),0)}return true}
 function autoGroup(ls:Leg[]){const ids=[...new Set(ls.map((l:any)=>l.gameId).filter(Boolean).map(String))];return ids.length===1?ids[0]:ids.length>1?'MULTI':'UNASSIGNED'}
 async function saveBet(){if(!legs.length){setNotice('Add at least one leg before saving.');return}for(const leg of legs){if(leg.kind==='TEAM')continue;if(!Object.values(STATS).includes(String(leg.stat))||!Number.isInteger(Number(leg.qty))||Number(leg.qty)<1){setNotice(`Invalid player leg for ${leg.player}. Check stat and target.`);return}}if(!BOOKS.some(x=>x.toLowerCase()===book.trim().toLowerCase())){setNotice('Choose a supported sportsbook.');return}if(!Number.isFinite(Number(units))||Number(units)<=0){setNotice('Units must be greater than zero.');return}if(!price.trim()||!Number.isFinite(Number(price))){setNotice('Enter valid odds or a payout.');return}if(book.toLowerCase().includes('kalshi')){if(Number(price)<=Number(units)*unitSize){setNotice('Kalshi total return must exceed the stake.');return}}else if(!Number.isInteger(Number(price))||Number(price)===0||Math.abs(Number(price))<100){setNotice('Enter valid American odds (for example +150 or -120).');return}if(!Number.isFinite(unitSize)||unitSize<=0){setNotice('Set a Unit Size greater than $0.00 in Settings before saving a wager.');return}const u=Number(units)||1,stake=u*unitSize;let payout:number|undefined,odds:number|undefined;if(book.toLowerCase().includes('kalshi')){payout=Number(price);odds=americanFromReturn(stake,payout)}else odds=Number(price);let verified:Leg[];try{verified=await verifiedPlayerLegs(legs,games)}catch(e:any){setNotice(e?.message||'Unable to verify player identity');return}const b=normalizeBet(date,verified,book,u,unitSize,payout,odds);b.legs=verified;b.groupKey=autoGroup(verified);b.category=category;b.bonusBet=bonusBet;b.source='LIVE';if(bets.some(x=>x.id===b.id)){setNotice(`Duplicate skipped · ${b.id}`);return}setBets((x:Bet[])=>[b,...x]);setNotice(`Saved ${b.id} · ${labels.get(b.groupKey)||b.groupKey}`);setLegs([]);setStage('legs');setBook('');setUnits('1');setPrice('');setBonusBet(false);setCategory('COMBOS');setWagerMode('PLAYER');setModeStage('choose');setTeamChoice('');setTeamMarket('');setTeamSide('');setTeamLine('');setTimeout(()=>modeRef.current?.focus(),0)}
 function resolveImportedLeg(raw:any){const nm=String(raw.player||'').trim();const matches=roster.filter(p=>playerIdentityKey(p.name)===playerIdentityKey(nm));const p=matches.length===1?matches[0]:null;return{...raw,player:p?.name||nm,playerId:p?.id,team:p?.team,position:p?.position,gameId:p?.gameId} as any}
 const portableRow=(b:Bet)=>{const row:any={BetID:b.id,Date:b.date,Category:b.category||'COMBOS',Sportsbook:b.book,Units:b.units,UnitSize:b.unitSize,'American Odds':b.odds??'',Payout:b.payout??'','Bonus Bet':b.bonusBet?'YES':'NO',Status:b.status||'PENDING'};for(let i=0;i<6;i++){const l=b.legs[i];row[`Player ${i+1}`]=l?.player||'';row[`Market ${i+1}`]=l?.stat||'';row[`Target ${i+1}`]=l?.qty??''}return row}
 function exportXlsx(){const rows=today.map(portableRow);const wb=XLSX.utils.book_new(),ws=XLSX.utils.json_to_sheet(rows);ws['!cols']=[{wch:22},{wch:12},{wch:12},{wch:16},{wch:9},{wch:10},{wch:14},{wch:11},{wch:11},...Array.from({length:18},(_,i)=>({wch:i%3===0?24:i%3===1?13:10}))];XLSX.utils.book_append_sheet(wb,ws,'Bets');XLSX.writeFile(wb,`NHL-Tracker-Bets-${date}.xlsx`);setNotice(`Exported ${rows.length} wager${rows.length===1?'':'s'} for ${date}`)}
 void exportXlsx;
 function downloadTemplate(){const examples:any[]=[{BetID:'',Date:date,Category:'COMBOS',Sportsbook:'Kalshi',Units:1,UnitSize:unitSize,'American Odds':142,Payout:'',Status:'PENDING','Player 1':'Connor McDavid','Market 1':'Point','Target 1':1,'Player 2':'Leon Draisaitl','Market 2':'Point','Target 2':1},{BetID:'',Date:date,Category:'ASSISTS',Sportsbook:'Fanatics',Units:.5,UnitSize:unitSize,'American Odds':115,Payout:'',Status:'PENDING','Player 1':'Jack Hughes','Market 1':'Assist','Target 1':1}];for(const r of examples)for(let i=1;i<=6;i++){r[`Player ${i}`]??='';r[`Market ${i}`]??='';r[`Target ${i}`]??=''}const wb=XLSX.utils.book_new(),ws=XLSX.utils.json_to_sheet(examples);ws['!cols']=[{wch:22},{wch:12},{wch:12},{wch:16},{wch:9},{wch:10},{wch:14},{wch:11},{wch:11},...Array.from({length:18},(_,i)=>({wch:i%3===0?24:i%3===1?13:10}))];XLSX.utils.book_append_sheet(wb,ws,'Bets');const guide=XLSX.utils.aoa_to_sheet([['NHL TRACKER IMPORT TEMPLATE'],['One row = one wager. Delete the two example rows before entering your own bets.'],['Category','COMBOS, ASSISTS, or OTHER'],['Market','Point, Assist, Goal, or Shot'],['Target','Required total for that leg, e.g. 1 or 2'],['BetID','Optional. Exports include it so importing the same exported wager twice is duplicate-safe.'],['Status','Usually PENDING when sharing a pregame card. WON and LOST are also accepted.'],['Players','Up to six legs per wager. Leave unused Player/Market/Target columns blank.']]);guide['!cols']=[{wch:20},{wch:90}];XLSX.utils.book_append_sheet(wb,guide,'Instructions');XLSX.writeFile(wb,'NHL-Tracker-Import-Template.xlsx');setNotice('Import template downloaded')}
 void downloadTemplate;
 async function importFile(file:File){try{const wb=XLSX.read(await file.arrayBuffer(),{type:'array'}),ws=wb.Sheets[wb.SheetNames[0]],rows:any[]=XLSX.utils.sheet_to_json(ws,{defval:''});let added=0,dupes=0,invalid=0;const incoming:Bet[]=[];for(const r of rows){let raw:any[]=[];for(let i=1;i<=6;i++){const player=String(r[`Player ${i}`]??r[`Player${i}`]??'').trim();if(!player)continue;raw.push({player,qty:Number(r[`Target ${i}`]??r[`Target${i}`]??1)||1,stat:String(r[`Market ${i}`]??r[`Market${i}`]??'Point').trim()||'Point'})}if(!raw.length)raw=String(r.Legs||r.legs||'').split(';').map((x:string)=>{const[p,q,st]=x.split('|');return{player:p?.trim(),qty:Number(q)||1,stat:st?.trim()||'Point'}}).filter((l:any)=>l.player);if(!raw.length){invalid++;continue}const legs=await verifiedPlayerLegs(raw.map(resolveImportedLeg),games),betDate=String(r.Date||r.date||date).slice(0,10);const oddsRaw=r['American Odds']!==undefined?r['American Odds']:(r.Odds??r.odds??'');const payoutRaw=r.Payout??r.payout??'';const b=normalizeBet(betDate,legs,String(r.Sportsbook||r.book||'Imported'),Number(r.Units||r.units||1),Number(r.UnitSize||r.unitSize||unitSize),payoutRaw!==''?Number(payoutRaw):undefined,oddsRaw!==''?Number(oddsRaw):undefined);b.legs=legs;b.bonusBet=['YES','TRUE','1','Y'].includes(String(r['Bonus Bet']??r.BonusBet??'').trim().toUpperCase());b.groupKey=autoGroup(legs);b.category=(['ASSISTS','OTHER'].includes(String(r.Category||'').toUpperCase())?String(r.Category).toUpperCase():'COMBOS') as BetCategory;b.status=(['WON','LOST'].includes(String(r.Status).toUpperCase())?String(r.Status).toUpperCase():'PENDING') as BetStatus;const suppliedId=String(r.BetID||r.betId||'').trim();if(suppliedId)b.id=suppliedId;const duplicate=[...bets,...incoming].some(x=>x.id===b.id||(!suppliedId&&x.date===b.date&&x.book.toLowerCase()===b.book.toLowerCase()&&x.units===b.units&&x.legs.length===b.legs.length&&x.legs.every((l,i)=>l.player.toLowerCase()===b.legs[i].player.toLowerCase()&&l.qty===b.legs[i].qty&&l.stat.toLowerCase()===b.legs[i].stat.toLowerCase())));if(duplicate){dupes++;continue}if(b.legs.some(l=>l.kind!=='TEAM'&&(!Number.isInteger(Number(l.playerId))||Number(l.playerId)<=0||!l.gameId))){invalid++;continue}incoming.push(b);added++}setBets((x:Bet[])=>[...incoming,...x]);setNotice(`Import complete · ${added} new · ${dupes} duplicate${dupes===1?'':'s'} skipped${invalid?` · ${invalid} invalid row${invalid===1?'':'s'}`:''}`)}catch(e:any){setNotice(`Import failed · ${e.message||'Invalid workbook'}`)}}
 function patchBet(id:string,patch:Partial<Bet>){setBets((x:Bet[])=>x.map(b=>b.id===id?{...b,...patch}:b))}
 const ordered=[...gameOptions.map(x=>x.key),'MULTI','UNASSIGNED'].filter(k=>groups.has(k))
 return <main onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files?.[0];if(f)importFile(f)}}><section className="toolbar"><div><h1>WAGER BUILDER</h1><p>Slate-aware player search automatically sorts wagers into game accordions.</p></div><label>BET DATE<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label></section><div className="betLayout betLayoutSingle"><section><div className="betBuilder" onKeyDownCapture={modeChoiceKey}><div className="sectionTitle"><b>NEW WAGER</b><span>1u = ${unitSize.toFixed(2)} · {rosterStatus}</span></div><div ref={modeRef} tabIndex={0} autoFocus={modeStage==='choose'} className={`wagerMode ${modeStage==='choose'?'modeChoosing':''}`}><button className={wagerMode==='PLAYER'?'selected':''} onClick={()=>{setWagerMode('PLAYER');setModeStage('entry');setLegs([]);setStage('legs');setTimeout(()=>playerRef.current?.focus(),0)}}>PLAYER PROP <small>ENTER</small></button><button className={wagerMode==='TEAM'?'selected':''} onClick={()=>{setWagerMode('TEAM');setModeStage('entry');setLegs([]);setStage('legs');setTeamMarket('');setTimeout(()=>teamRef.current?.focus(),0)}}>TEAM BET <small>TAB</small></button></div>{legs.map((l:any,i)=><div className="savedLeg" key={i}><b>{l.kind==='TEAM'?l.stat==='Game Total'?`${l.player} ${l.side==='OVER'?'O':'U'} ${l.qty}`:l.stat==='Spread'?`${l.team} ${l.qty>0?'+':''}${l.qty}`:`${l.team} ML`:l.player}</b><em>{l.kind==='TEAM'?l.stat==='Game Total'?'GAME TOTAL':`${l.team} vs ${l.opponent||'TBD'}`:`${l.team} · ${l.position}`}</em><span>{l.kind==='TEAM'?'TEAM BET':`${l.qty} ${l.stat}${l.qty!==1?'s':''}`}</span><button onClick={()=>setLegs(x=>x.filter((_,j)=>j!==i))}>×</button></div>)}{modeStage==='choose'?<div className="modePrompt"><b>PLAYER PROP</b><span>Press Enter for Player Prop · Tab for Team Bet</span></div>:stage==='legs'?(wagerMode==='PLAYER'?<div className="entryRow"><label className="playerField">PLAYER<input ref={playerRef} autoFocus value={player} onChange={e=>{setPlayer(e.target.value);setSelectedPlayer(null)}} onKeyDown={e=>{if(!playerStepBack(e,'PLAYER'))playerKey(e)}} placeholder="Start typing player name…" autoComplete="off"/>{suggestions.length>0&&<div className="playerSuggestions">{suggestions.map((p:any,i)=><button type="button" className={i===activeSuggestion?'active':''} key={p.id} onMouseDown={e=>{e.preventDefault();choosePlayer(p);setTimeout(()=>qtyRef.current?.focus(),0)}}><b>{p.name}</b><span>{p._pair>0?`PAIRED ×${p._pair}`:p._freq>0?`BET ×${p._freq}`:`${p.team} · ${p.position}`}{p._market?` · ${p._market}`:''}</span></button>)}</div>}</label><label>QTY<input ref={qtyRef} placeholder="1" value={qty} onChange={e=>setQty(e.target.value)} onKeyDown={e=>{if(playerStepBack(e,'QTY'))return;if(e.key==='Tab'&&!e.shiftKey){e.preventDefault();setTimeout(()=>statRef.current?.focus(),0)}}}/></label><label>STAT<input ref={statRef} value={stat} onChange={e=>setStat(e.target.value)} onKeyDown={e=>{if(playerStepBack(e,'STAT'))return;if((e.key==='Tab'&&!e.shiftKey)||e.key==='Enter'){e.preventDefault();const normalized=STATS[stat.trim().toLowerCase()]||stat.trim();if(normalized)setStat(normalized);addLeg()}}} placeholder="P / G / A / S"/></label></div>:<div className="teamBetEntry"><label className="teamSearchField">TEAM<input ref={teamRef} autoFocus value={teamChoice} onChange={e=>{setTeamChoice(e.target.value);setTeamCommitted(false)}} onKeyDown={e=>{if(!teamStepBack(e,'TEAM'))teamEntryKey(e)}} placeholder="Start typing team…" autoComplete="off"/>{teamCommitted&&selectedMatchup&&<small className="resolvedMatchup">{teamMarket==='Game Total'?`GAME TOTAL · ${selectedMatchup}`:selectedMatchup}</small>}{teamSuggestions.length>0&&<div className="teamSuggestions">{teamSuggestions.map((x,i)=><button type="button" className={i===teamActive?'active':''} key={`${x.gameId}-${x.value}`} onMouseDown={e=>{e.preventDefault();chooseTeamEntry(x);setTimeout(()=>marketRef.current?.focus(),0)}}><b>{x.value}</b><span>{x.label}</span></button>)}</div>}</label><label className="teamMarketField">MARKET<select ref={marketRef} value={teamMarket} onChange={e=>{const m=e.target.value as ''|'Moneyline'|'Spread'|'Game Total';setTeamMarket(m);setTeamSide('');setTeamLine('');if(m==='Spread')setTimeout(()=>lineRef.current?.focus(),0);else if(m==='Game Total')setTimeout(()=>sideRef.current?.focus(),0)}} onKeyDown={e=>{if(e.key==='Enter'&&teamMarket==='Moneyline'){e.preventDefault();addTeamLeg()}else if(e.key==='Enter'&&teamMarket==='Spread'){e.preventDefault();setTimeout(()=>lineRef.current?.focus(),0)}else if(e.key==='Enter'&&teamMarket==='Game Total'){e.preventDefault();setTimeout(()=>sideRef.current?.focus(),0)}}}><option value="" disabled>Choose market…</option><option value="Moneyline">Moneyline</option><option value="Spread">Spread</option><option value="Game Total">O/U · Point Total</option></select></label>{teamMarket==='Moneyline'&&<div className="teamSelectionField"><span>SELECTION</span><b>{teamChoice?`${teamChoice} MONEYLINE`:'MONEYLINE'}</b></div>}{teamMarket==='Game Total'&&<label className="teamSideField">OVER / UNDER<input ref={sideRef} value={teamSide} onChange={e=>setTeamSide(e.target.value.toUpperCase().slice(0,1))} onKeyDown={e=>{if(teamStepBack(e,'SIDE'))return;if(e.key==='Tab'){const side=teamSide.trim().toUpperCase();if(side!=='O'&&side!=='U'){e.preventDefault();setNotice('Enter O or U.');return}e.preventDefault();setTimeout(()=>lineRef.current?.focus(),0)}}} placeholder="O / U"/></label>}{teamMarket!=='Moneyline'&&<label className="teamValueField">{teamMarket==='Spread'?'SPREAD':'TOTAL'}<input ref={lineRef} value={teamLine} onChange={e=>setTeamLine(e.target.value)} onKeyDown={e=>{if(teamStepBack(e,'LINE'))return;if(e.key==='Enter'){e.preventDefault();addTeamLeg()}}} placeholder={teamMarket==='Spread'?'-1.5':'4.5'}/></label>}{teamMarket==='Spread'&&<div className="teamSlotSpacer" aria-hidden="true"/>}<button className="teamCommitButton" onClick={addTeamLeg} disabled={!teamMarket}>ADD LEG</button></div>):<>
<div className="priceRow wagerMetaRow"><label className="categoryField">CATEGORY<select ref={categoryRef} value={category} onChange={e=>setCategory(e.target.value as BetCategory)} onKeyDown={e=>{const k=e.key.toLowerCase();if(k==='c')setCategory('COMBOS');else if(k==='a')setCategory('ASSISTS');else if(k==='o')setCategory('OTHER')}}><option value="COMBOS">Combos</option><option value="ASSISTS">Assists</option><option value="OTHER">Other</option></select></label><label className="bookField">SPORTSBOOK<input ref={bookRef} value={book} onFocus={()=>setBookCommitted(false)} onChange={e=>{setBook(e.target.value);setBookCommitted(false)}} onKeyDown={e=>{if((e.key==='Tab'&&!e.shiftKey)||e.key==='Enter'){const exact=BOOKS.find(x=>x.toLowerCase()===book.trim().toLowerCase());const pick=exact||bookSuggestions[0];if(pick){e.preventDefault();setBook(pick);setBookCommitted(true);setTimeout(()=>{unitsRef.current?.focus();unitsRef.current?.select()},0)}}}} placeholder="Choose sportsbook…" autoComplete="off"/>{bookSuggestions.length>0&&<div className="bookSuggestions">{bookSuggestions.map(x=><button type="button" key={x} onMouseDown={e=>{e.preventDefault();setBook(x);setBookCommitted(true);setTimeout(()=>{unitsRef.current?.focus();unitsRef.current?.select()},0)}}>{x}</button>)}</div>}</label><label>UNITS<input ref={unitsRef} value={units} onFocus={e=>e.currentTarget.select()} onChange={e=>setUnits(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'||e.key==='Tab'){if(e.key==='Enter')e.preventDefault();setTimeout(()=>priceRef.current?.focus(),0)}}}/></label><label>{book.toLowerCase().includes('kalshi')?'PAYS ($)':'AMERICAN ODDS'}<input ref={priceRef} value={price} onChange={e=>setPrice(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')saveBet()}} placeholder={book.toLowerCase().includes('kalshi')?'Enter return':'Enter odds'}/></label></div><label className="bonusBetFlag"><input type="checkbox" checked={bonusBet} onChange={e=>setBonusBet(e.target.checked)}/> BONUS BET (PROMOTIONAL STAKE — NO CASH RISK)</label><div className="saveBetRow"><button className="saveBet" onClick={saveBet}>SAVE BET</button></div></>}<div className="keyHint">Search matches any part of a player's name, but only today's slate players are loaded. Player props: Enter commits/progresses; after a saved leg, Enter again finishes the leg builder. Tab accepts the highlighted Smart Search suggestion. Team search stays closed until you type. Same-game legs auto-sort together; cross-game combos go to MULTI-GAME.</div>{notice&&<div className="notice">{notice}</div>}</div></section></div><section className="betList"><div className="sectionTitle"><b>{date} BETS BY GAME</b><span>{today.length}</span></div>{today.length===0?<div className="empty"><b>No bets entered yet.</b><span>Start typing above or drop an exported workbook.</span></div>:ordered.map(k=>{const bs=groups.get(k)||[];const isOpen=open[k]??false;const w=bs.filter(b=>(b.status||'PENDING')==='WON').length,l=bs.filter(b=>(b.status||'PENDING')==='LOST').length,v=bs.filter(b=>(b.status||'PENDING')==='VOID').length,p=bs.length-w-l-v;const pnl=bs.reduce((n,b)=>n+((b.status||'PENDING')==='PENDING'?0:cashNet(b)),0);return <div className="accordion" key={k}><button className="accordionHead" onClick={()=>setOpen(o=>({...o,[k]:!isOpen}))}><span className="chev">{isOpen?'▼':'▶'}</span><b>{labels.get(k)||k}</b><span>{bs.length} BET{bs.length===1?'':'S'}</span><span>{w}W–{l}L–{p}P{v?`–${v}V`:''}</span><strong className={pnl>0?'winText':pnl<0?'lossText':''}>{pnl>=0?'+':''}${pnl.toFixed(2)}</strong></button>{isOpen&&<div className="accordionBody">{bs.map(b=><BetCard b={b} liveStats={liveStats} gameOptions={gameOptions} onPatch={(patch:any)=>patchBet(b.id,patch)} onEdit={(next:any)=>patchBet(b.id,next)} onDelete={()=>setBets((x:Bet[])=>x.filter(y=>y.id!==b.id))}/>)}</div>}</div>})}</section></main>}

function BetCard({b,onDelete,onPatch,onEdit,gameOptions,liveStats}:{b:Bet,onDelete:any,onPatch:any,onEdit:any,gameOptions:{key:string,label:string}[],liveStats:LiveStats}){
 const stake=b.units*b.unitSize;const hit=b.legs.some(l=>l.kind==='TEAM')?b.status==='WON':betHit(b,liveStats);const odds=b.odds??(b.payout?americanFromReturn(stake,b.payout):undefined);const[editing,setEditing]=useState(false);const[editBook,setEditBook]=useState(b.book);const[editCategory,setEditCategory]=useState<BetCategory>(b.category||'COMBOS');const[editUnits,setEditUnits]=useState(String(b.units));const[editPrice,setEditPrice]=useState(String(b.book.toLowerCase().includes('kalshi')?(b.payout??''):(b.odds??'')));const[editLegs,setEditLegs]=useState(b.legs.map(l=>({...l})));const[editBonus,setEditBonus]=useState(!!b.bonusBet);
 function saveEdit(){const u=Number(editUnits)||b.units;const isKalshi=editBook.toLowerCase().includes('kalshi');const payout=isKalshi&&editPrice!==''?Number(editPrice):undefined;const newOdds=isKalshi?(payout!=null?americanFromReturn(u*b.unitSize,payout):undefined):(editPrice!==''?Number(editPrice):undefined);onEdit({legs:editLegs,book:editBook.trim(),category:editCategory,bonusBet:editBonus,units:u,payout,odds:newOdds,groupKey:(()=>{const ids=[...new Set(editLegs.map(l=>l.gameId).filter(Boolean).map(String))];return ids.length===1?ids[0]:ids.length>1?'MULTI':'UNASSIGNED'})(),status:'PENDING',settledAt:undefined,verifiedAt:undefined,regradeNote:b.status&&b.status!=='PENDING'?'Edited after settlement · re-evaluation required':b.regradeNote});setEditing(false)}
 if(editing)return <article className="betCard editing"><div className="betEdit"><small>EDIT WAGER · {b.id}</small>{editLegs.map((l,i)=><div className="editLeg" key={i}><input value={l.player} onChange={e=>setEditLegs(x=>x.map((v,j)=>j===i?{...v,player:e.target.value}:v))}/><input type="number" min="1" value={l.qty} onChange={e=>setEditLegs(x=>x.map((v,j)=>j===i?{...v,qty:Number(e.target.value)||1}:v))}/><input value={l.stat} onChange={e=>setEditLegs(x=>x.map((v,j)=>j===i?{...v,stat:STATS[e.target.value.toLowerCase()]||e.target.value}:v))}/><button onClick={()=>setEditLegs(x=>x.filter((_,j)=>j!==i))}>×</button></div>)}<label className="bonusBetFlag"><input type="checkbox" checked={editBonus} onChange={e=>setEditBonus(e.target.checked)}/> BONUS BET (PROMOTIONAL STAKE)</label><div className="editPrice"><select value={editCategory} onChange={e=>setEditCategory(e.target.value as BetCategory)}><option value="COMBOS">Combos</option><option value="ASSISTS">Assists</option><option value="OTHER">Other</option></select><input value={editBook} onChange={e=>setEditBook(e.target.value)} placeholder="Sportsbook"/><input type="number" step="0.5" value={editUnits} onChange={e=>setEditUnits(e.target.value)} placeholder="Units"/><input value={editPrice} onChange={e=>setEditPrice(e.target.value)} placeholder={editBook.toLowerCase().includes('kalshi')?'Pays ($)':'American odds'}/></div><div className="editActions"><button onClick={saveEdit}>SAVE CHANGES</button><button onClick={()=>setEditing(false)}>CANCEL</button></div></div></article>;
 return <article className={`betCard ${(b.status||'PENDING').toLowerCase()}`}><div className="betMain"><small>{b.book} · {b.id}{b.bonusBet?" · 🎟 BONUS BET":""}</small><h3>{b.legs.map(l=>l.kind==='TEAM'?`${l.team} ML`:`${l.player} ${l.qty} ${l.stat}${l.qty!==1?'s':''}${l.voided?' · VOID':''}`).join(' + ')}</h3><div className="legProgress">{b.legs.map((l,i)=>{if(l.voided)return <span className="voided" key={i}>{l.player.split(' ').slice(-1)[0]} · VOID</span>;if(l.kind==='TEAM')return <span className={b.status==='WON'?'hit':''} key={i}>{l.team} ML{b.status==='WON'?' ✓':''}</span>;const pr=legProgress(l,liveStats);return <span className={pr.hit?'hit':''} key={i}>{l.player.split(' ').slice(-1)[0]} {Math.min(pr.current,l.qty)}/{l.qty} {l.stat}{pr.hit?' ✓':''}</span>})}{hit&&<strong>BET HIT ✓</strong>}</div><p>{b.units.toFixed(2)}u @ {(b.status||'PENDING')==='VOID'?'REFUNDED':odds!=null?(odds>0?`+${odds}`:odds):'—'}{b.voidAudit?.length?<span className="adjustedOddsTag"> ADJUSTED</span>:null}</p>{b.voidAudit?.length?<small className="voidAuditNote">VOID: {b.voidAudit.map(v=>v.player).join(', ')} · sportsbook-adjusted odds saved</small>:null}{b.regradeNote&&<small className="editNote">{b.regradeNote}</small>}</div><div className="betControls"><select value={b.category||'COMBOS'} onChange={e=>onPatch({category:e.target.value as BetCategory})}><option value="COMBOS">COMBOS</option><option value="ASSISTS">ASSISTS</option><option value="OTHER">OTHER</option></select><select value={b.groupKey||'UNASSIGNED'} onChange={e=>onPatch({groupKey:e.target.value})}><option value="UNASSIGNED">UNASSIGNED</option>{gameOptions.map(g=><option key={g.key} value={g.key}>{g.label}</option>)}<option value="MULTI">MULTI-GAME</option></select><div className="gradeButtons"><button className={(b.status||'PENDING')==='PENDING'?'selected':''} onClick={()=>onPatch({status:'PENDING'})}>P</button><button className={(b.status||'PENDING')==='WON'?'selected win':''} onClick={()=>onPatch({status:'WON'})}>W</button><button className={(b.status||'PENDING')==='LOST'?'selected loss':''} onClick={()=>onPatch({status:'LOST'})}>L</button><button className={(b.status||'PENDING')==='VOID'?'selected voided':''} onClick={()=>onPatch({status:'VOID',payout:b.units*b.unitSize,odds:undefined,settledAt:new Date().toISOString(),regradeNote:'FULL WAGER VOID · original stake refunded · 0.00u P/L'})}>V</button></div><button className="editBet" onClick={()=>setEditing(true)}>EDIT</button><button className="deleteBet" onClick={onDelete}>DELETE</button></div></article>}
const EVENT_ICON:Record<string,string>={
 'BET HIT':new URL('./assets/events/bet-hit.png',import.meta.url).href,
 'GOAL':new URL('./assets/events/goal.png',import.meta.url).href,
 'POWER PLAY':new URL('./assets/events/power-play.png',import.meta.url).href,
 'EMPTY NET':new URL('./assets/events/empty-net.png',import.meta.url).href,
 'INTERMISSION':new URL('./assets/events/intermission.png',import.meta.url).href,
 'FINAL':new URL('./assets/events/final.png',import.meta.url).href,
 'GAME START':new URL('./assets/events/final.png',import.meta.url).href,
 'PERIOD START':new URL('./assets/events/final.png',import.meta.url).href,
 'STAT CORRECTION':new URL('./assets/events/stat-correction.png',import.meta.url).href,
 'NIGHT VERIFIED':new URL('./assets/events/night-verified.png',import.meta.url).href
}
function EventIcon({type,mini=false}:{type:string,mini?:boolean}){const src=EVENT_ICON[type];if(!src)return <span className={`eventGlyph ${mini?'mini':''}`}>NHL</span>;return <img className={mini?'eventAsset mini':'eventAsset'} src={src} alt=""/>}
const GOAL_ART_TEAMS = ['BOS','BUF','CAR','CGY','CHI','COL','DAL','NSH','NYI','OTT','PHI','SJS','TBL','UTA','VAN','MIN','VGK','STL','MTL','TOR'] as const;
const GOAL_ART_FILES=import.meta.glob('./assets/goal-art/*.png',{eager:true,query:'?url',import:'default'}) as Record<string,string>;
const GOAL_ART:Record<string,string>=Object.fromEntries(GOAL_ART_TEAMS.map(team=>[team,GOAL_ART_FILES[`./assets/goal-art/${team}.png`]]));
const GOAL_GLOW:Record<string,string> = {'BOS':'#ffcb35','BUF':'#ffbd36','CAR':'#ed334d','CGY':'#f43b30','CHI':'#e94744','COL':'#8eaccf','DAL':'#40b97b','NSH':'#f9c83b','NYI':'#ff8c38','OTT':'#d83442','PHI':'#fa803a','SJS':'#20c6c5','TBL':'#39bfff','UTA':'#89d9f1','VAN':'#4cbd9c','MIN':'#4fa579','VGK':'#d8af55','STL':'#4a9fff','MTL':'#e44452','TOR':'#57b8ff'};
function goalArtTeam(team:string){const normalized=String(team||'').toUpperCase();return normalized==='UTA'?'UTA':normalized==='UTAH'?'UTA':normalized;}
function EventFeed({events,onSelectGame}:{events:FeedEvent[],onSelectGame?:(gameId:number)=>void}){return <div className="feed">{events.length===0?<div className="empty"><b>No visible events yet.</b><span>Your enabled Live Feed events will appear here chronologically.</span></div>:events.map(e=>{const cls=e.type.toLowerCase().replaceAll(' ','-');const betLegs=e.type==='BET HIT'?e.title.split(' + ').filter(Boolean):[];const selectable=!!e.gameId&&!!onSelectGame;return <article className={`event ${cls} ${e.type==='GOAL'&&GOAL_ART[goalArtTeam(e.team)]?'goalWithArt':''} ${selectable?'eventSelectable':''}`} style={e.type==='GOAL'&&GOAL_ART[goalArtTeam(e.team)]?{'--goal-glow':GOAL_GLOW[goalArtTeam(e.team)]||'#45bfff'} as React.CSSProperties:undefined} key={e.id} role={selectable?'button':undefined} tabIndex={selectable?0:undefined} title={selectable?'Open this game and its bets':undefined} onClick={()=>selectable&&onSelectGame?.(e.gameId)} onKeyDown={ev=>{if(selectable&&(ev.key==='Enter'||ev.key===' ')){ev.preventDefault();onSelectGame?.(e.gameId)}}}>{e.type==='GOAL'&&GOAL_ART[goalArtTeam(e.team)]&&<img className="goalMascotArt" src={GOAL_ART[goalArtTeam(e.team)]} alt="" aria-hidden="true"/>}<div className={`eventIcon ${cls}`}><EventIcon type={e.type}/></div><div className="eventContent"><div className="eventType">{e.type}{e.sequence?<span className="seq">#{e.sequence}</span>:null}</div>{e.type==='BET HIT'?<><h2>WINNING WAGER</h2><div className="eventBetLegs">{betLegs.map((leg,i)=><span key={`${e.id}-leg-${i}`}>{leg}</span>)}</div></>:<h2>{e.title}</h2>}<p>{e.detail}</p><footer>{e.meta}{e.sort>1000000000000?<time> · {new Date(e.sort).toLocaleTimeString([],{hour:'numeric',minute:'2-digit',second:'2-digit'})}</time>:null}</footer></div></article>})}</div>}
function scoreboardPowerPlayTeam(g:Game):'away'|'home'|null{
 if(!['LIVE','CRIT'].includes(String(g.gameState||''))||g._trackerIntermissionPeriod)return null;
 const situation=String(g.situationCode||'');
 if(!/^\d{4}$/.test(situation))return null;
 const away=Number(situation[1]),home=Number(situation[2]);
 if(away<3||home<3||away===home)return null;
 // A goalie pull can create an extra attacker without a power play.
 if(g._trackerEmptyNetTeam)return null;
 return away>home?'away':'home';
}
const teamZambonis:Record<string,string>={DET:zamboniDET,WSH:zamboniWSH,CBJ:zamboniCBJ,WPG:zamboniWPG};
function LiveGameState({game:g,finalUnits}:{game:Game,finalUnits?:number}){
 const authoritative=String(g?.clock?.timeRemaining||'');const running=Boolean(g?.clock?.running);const period=Number(g?.periodDescriptor?.number||0);const intermissionPeriod=Number(g?._trackerIntermissionPeriod||0);const intermission=intermissionPeriod===1||intermissionPeriod===2;const[seconds,setSeconds]=useState(()=>clockToSeconds(authoritative));const[intermissionSeconds,setIntermissionSeconds]=useState(18*60);
 useEffect(()=>setSeconds(clockToSeconds(authoritative)),[authoritative,g?.gameState]);
 useEffect(()=>{if(!running||!['LIVE','CRIT'].includes(String(g?.gameState||''))||intermission)return;const t=window.setInterval(()=>setSeconds(v=>Math.max(0,v-1)),1000);return()=>window.clearInterval(t)},[running,g?.gameState,authoritative,intermission]);
 useEffect(()=>{if(!intermission)return;const key=`nhl-tracker-intermission-end-${g.id}-${intermissionPeriod}`;let endsAt=Number(localStorage.getItem(key)||0);const synced=Number(g?._trackerIntermissionSyncSeconds||0);if(!endsAt){const seed=synced>0&&synced<=25*60?synced:18*60;endsAt=Date.now()+seed*1000;if(g.id!==-1001&&synced>0&&synced<=25*60)localStorage.setItem(key,String(endsAt))}const update=()=>setIntermissionSeconds(Math.max(0,Math.ceil((endsAt-Date.now())/1000)));update();const t=window.setInterval(update,1000);return()=>window.clearInterval(t)},[intermission,g.id,intermissionPeriod,g?._trackerIntermissionSyncSeconds]);
 if(['FUT','PRE'].includes(String(g?.gameState||'')))return <>{new Date(g.startTimeUTC).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</>;
 if(['FINAL','OFF'].includes(String(g?.gameState||'')))return <span className="finalState">FINAL{finalUnits!==undefined&&<b className={finalUnits>0?'finalProfit':finalUnits<0?'finalLoss':'finalPush'}>{finalUnits>0?'+':''}{finalUnits.toFixed(2)}u</b>}</span>;
 if(intermission){const im=String(Math.floor(intermissionSeconds/60)),is=String(intermissionSeconds%60).padStart(2,'0');return <span className="liveClock intermission"><span>{`${intermissionPeriod===1?'1ST':'2ND'} INTERMISSION · ${im}:${is}`}</span><i className="clockMotion"><b className="zamboniPatrol" aria-hidden="true"><img className="zamboniImage" src={teamZambonis[abbr(g.homeTeam)]||new URL('./assets/ui/zamboni-base.png',import.meta.url).href} alt=""/></b></i></span>}
 const mm=String(Math.floor(seconds/60)).padStart(1,'0'),ss=String(seconds%60).padStart(2,'0');const label=period===4?`OT · ${mm}:${ss}`:period>=5?`SO`:period?`${period}P · ${mm}:${ss}`:String(g?.gameState||'LIVE');
 const situation=String(g?.situationCode||'');const awaySkaters=situation.length===4?Number(situation[1]):0,homeSkaters=situation.length===4?Number(situation[2]):0;const powerPlay=awaySkaters>0&&homeSkaters>0&&awaySkaters!==homeSkaters;const emptyNet=Boolean(g?._trackerEmptyNetTeam);const stateLabel=emptyNet?`EMPTY NET · ${mm}:${ss}`:label;
 return <span className={`liveClock ${running?'running':'stopped'} ${emptyNet?'emptyNet':powerPlay?'powerPlay':''}`}><span>{stateLabel}</span><i className="clockMotion"/></span>
}
function GameRow({game:g}:{game:Game}){return <div className="game"><div><b>{abbr(g.awayTeam)}</b><span>{g.awayTeam?.score??''}</span></div><small><LiveGameState game={g}/></small><div><b>{abbr(g.homeTeam)}</b><span>{g.homeTeam?.score??''}</span></div></div>}
void GameRow;
function TeamChips({hidden,setHidden}:{hidden:string[],setHidden:any}){return <div className="chips">{ALL_TEAMS.map(t=><button key={t} className={hidden.includes(t)?'hidden':''} onClick={()=>setHidden((h:string[])=>h.includes(t)?h.filter(x=>x!==t):[...h,t])}>{t}</button>)}</div>}
// Phase 2I: isolated read-only cloud inspector. It never touches TrackerApp bets.
function LiveCloudInspector({username,embedded=false}:{username:string;embedded?:boolean}){
 const [open,setOpen]=useState(false)
 const [showCloudHub,setShowCloudHub]=useState(false)
 const [loading,setLoading]=useState(false)
 const [message,setMessage]=useState('Not checked yet')
 const [rows,setRows]=useState<any[]>([])
 const [checked,setChecked]=useState(false)
 const [comparison,setComparison]=useState('')
 const [importSource,setImportSource]=useState<HistoricalWager[]|null>(null)
 const [importReport,setImportReport]=useState('No backup selected')
 const [importConfirm,setImportConfirm]=useState('')
 const [importing,setImporting]=useState(false)
 const [previewApproved,setPreviewApproved]=useState(false)
 const cloudSummary=useMemo(()=>{
  const counts={pending:0,won:0,lost:0,other:0}
  const dates=new Set<string>()
  for(const row of rows){
   const wager=row.wager
   dates.add(wager.date)
   const status=String(wager.status||'PENDING').toUpperCase()
   if(status==='PENDING')counts.pending++
   else if(status==='WON'||status==='WIN'||status==='HIT')counts.won++
   else if(status==='LOST'||status==='LOSS'||status==='MISS')counts.lost++
   else counts.other++
  }
  return {...counts,slates:dates.size}
 },[rows])
 const compareLegacy=()=>{
  if(!checked||loading||username.toLowerCase()!=='stankyfangers')return
  try{
   const raw=localStorage.getItem('bets')
   if(raw===null)throw new Error('No legacy LIVE wagers found')
   const local=JSON.parse(raw)
   if(!Array.isArray(local))throw new Error('Legacy wager data is invalid')
   const validate=(w:any)=>w&&typeof w.id==='string'&&w.id&&typeof w.date==='string'&&Array.isArray(w.legs)
   const localById=new Map<string,string>()
   for(const w of local){if(!validate(w)||localById.has(w.id))throw new Error('Legacy wager IDs are invalid or duplicated');localById.set(w.id,JSON.stringify(w))}
   const cloudById=new Map<string,string>()
   for(const row of rows){const w=row.wager;if(!validate(w)||cloudById.has(w.id))throw new Error('Cloud wager IDs are invalid or duplicated');cloudById.set(w.id,JSON.stringify(w))}
   let localOnly=0,identical=0,different=0,cloudOnly=0
   for(const [id,payload] of localById){if(!cloudById.has(id))localOnly++;else if(cloudById.get(id)===payload)identical++;else different++}
   for(const id of cloudById.keys())if(!localById.has(id))cloudOnly++
   setComparison('READ-ONLY MIGRATION PREVIEW · Local '+localById.size+' · Cloud '+cloudById.size+' · Local-only '+localOnly+' · Identical '+identical+' · Same-ID differences '+different+' · Cloud-only '+cloudOnly+' · '+(different>0?'CONFLICTS BLOCK MIGRATION.':'No conflicts detected; migration still requires verified backups and separate approval.')+' No changes made.')
  }catch(e:any){setComparison('Comparison stopped: '+String(e?.message||e))}
 }
 const previewImport=(file:File)=>{
  setImportSource(null);setPreviewApproved(false);setImportConfirm('');setImportReport('Validating backup...')
  if(file.size>25*1024*1024){setImportReport('File exceeds 25 MB');return}
  void file.text().then(raw=>{const source=parseMigrationBackup(JSON.parse(raw));setImportSource(source);setImportReport('Validated '+source.length+' unique wagers. Check cloud and compare below.')}).catch((e:unknown)=>setImportReport('Preview failed: '+String(e instanceof Error?e.message:e)))
 }
 const previewAgainstCloud=()=>{
  if(!checked||!importSource)return
  setPreviewApproved(false);setImportConfirm('')
  try{const x=compareMigration(importSource,rows);setPreviewApproved(x.conflicts.length===0);setImportReport('READ ONLY · Source '+x.sourceCount+' · Cloud '+x.cloudCount+' · Missing '+x.missing.length+' · Identical '+x.identical.length+' · Conflicts '+x.conflicts.length+' · Cloud-only '+x.cloudOnly.length+'. NO WRITES PERFORMED.')}
  catch(e:unknown){setImportReport('Comparison failed: '+String(e instanceof Error?e.message:e))}
 }
 const runImport=async()=>{
  if(!checked||!importSource||!previewApproved||importConfirm!=='IMPORT '+username||importing||loading)return
  setImporting(true);setImportReport('Rechecking cloud for conflicts before import...')
  try{
    const result=await importHistoricalWagers(importSource,(window.nhlTracker as any).liveWagersRequest,(progress)=>setImportReport('Uploaded '+progress.uploaded+' · Remaining '+progress.remaining))
    setImportReport('VERIFIED · '+result.identical+' source wagers match cloud exactly · '+result.uploaded+' newly created · '+result.cloudOnly+' other cloud wagers preserved.')
    setPreviewApproved(false);setImportConfirm('')
    const refreshed=await listAllCloudWagers((window.nhlTracker as any).liveWagersRequest)
    setRows(refreshed);setChecked(true);setMessage('Cloud verified: '+refreshed.length+' wagers for '+username)
  }catch(e:unknown){setImportReport('IMPORT STOPPED: '+String(e instanceof Error?e.message:e))}
  finally{setImporting(false)}
 }
 const [showDetails,setShowDetails]=useState(false)
 const [detailId,setDetailId]=useState('')
 const [filterDate,setFilterDate]=useState('')
 const exportSnapshot=()=>{
  if(!checked||loading)return
  const snapshot={format:'nhl-tracker-live-cloud-readonly-backup-v1',username,exportedAt:new Date().toISOString(),wagers:rows}
  const blob=new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'})
  const url=URL.createObjectURL(blob)
  const link=document.createElement('a')
  link.href=url
  link.download='NHL-Tracker-LIVE-'+username+'-Cloud-Backup-'+new Date().toISOString().slice(0,10)+'.json'
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(()=>URL.revokeObjectURL(url),1000)
 }
 const check=async()=>{
  if(loading||importing)return
  setPreviewApproved(false);setImportConfirm('');setComparison('');setChecked(false);setRows([]);setDetailId('');setShowDetails(false)
  setLoading(true);setMessage('Reading LIVE cloud wagers...')
  try{
   const collected:any[]=[]
   const wagerIds=new Set<string>()
   let cursor=''
   const seen=new Set<string>()
   for(let page=0;page<100;page++){
    const result=await (window.nhlTracker as any).liveWagersRequest({method:'GET',limit:200,...(cursor?{cursor}:{})})
    if(result?.error)throw new Error(String(result.error))
    if(!Array.isArray(result?.wagers))throw new Error('Unexpected cloud response')
    for(const row of result.wagers){
     const wager=row?.wager
     if(!wager||typeof wager.id!=='string'||!wager.id||typeof wager.date!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(wager.date)||!Array.isArray(wager.legs)||row.wager_id!==wager.id)throw new Error('Invalid cloud wager record; preview cancelled')
     if(wagerIds.has(row.wager_id))throw new Error('Duplicate cloud wager ID; preview cancelled')
     wagerIds.add(row.wager_id)
     collected.push(row)
    }
    if(collected.length>20000)throw new Error('Cloud listing exceeds safety limit')
    if(result.nextCursor===null){setRows(collected);setChecked(true);setMessage(`Cloud connected: ${collected.length} wagers for ${username}`);return}
    if(typeof result.nextCursor!=='string'||!result.nextCursor||seen.has(result.nextCursor))throw new Error('Invalid cloud pagination cursor')
    seen.add(result.nextCursor);cursor=result.nextCursor
   }
   throw new Error('Cloud listing exceeded page limit')
  }catch(e:any){setChecked(false);setRows([]);setMessage('Cloud check failed: '+String(e?.message||e))}
  finally{setLoading(false)}
 }
 useEffect(()=>{if(embedded)void check()},[embedded,username])
 return <div style={{position:embedded?'relative':'fixed',right:embedded?undefined:16,bottom:embedded?undefined:16,zIndex:embedded?undefined:20001,width:embedded?'100%':open?350:'auto',maxWidth:embedded?'100%':'calc(100vw - 32px)',background:'#10263a',color:'#d8ecff',border:'1px solid #487b9a',borderRadius:10,padding:10,boxShadow:'0 8px 28px #0009',fontSize:12}}>
  {!embedded&&<button type="button" onClick={()=>setOpen(v=>!v)}>{open?'CLOSE CLOUD INSPECTOR':'LIVE CLOUD INSPECTOR'}</button>}
  {!embedded&&open&&<button type="button" onClick={()=>setShowCloudHub(true)} style={{marginLeft:8}}>OPEN MY CLOUD BET HUB</button>}{embedded&&<h3 style={{margin:'0 0 8px'}}>Your cloud wagers · read only</h3>}
  {(open||embedded)&&<div style={{marginTop:10,display:'grid',gap:8}}>
   <strong>READ ONLY - {username}</strong>
   <section style={{border:'1px solid #668ba4',borderRadius:8,padding:8,display:'grid',gap:6}}>
    <strong>HISTORICAL MIGRATION · DRY RUN</strong>
    <label>Choose LIVE migration JSON <input type="file" accept=".json,application/json" onChange={e=>{const f=e.target.files?.[0];if(f)previewImport(f)}}/></label>
    <div role="status">{importReport}</div>
    <button type="button" disabled={!checked||!importSource||loading} onClick={previewAgainstCloud}>COMPARE IMPORT TO MY CLOUD WAGERS</button>
    <small>Preview never uploads. Cloud importing requires explicit confirmation and a separately enabled server-side write gate. No local wager changes are made.</small>
    {previewApproved&&<div style={{borderTop:'1px solid #668ba4',paddingTop:8,display:'grid',gap:6}}>
      <strong>CONTROLLED CLOUD IMPORT</strong>
      <div>Back up your existing cloud wagers before importing. Only missing wager IDs are created; conflicts stop the operation. Source JSON remains unchanged.</div>
      <label>Type IMPORT {username} to authorize cloud writes<input value={importConfirm} onChange={e=>setImportConfirm(e.target.value)} autoComplete="off"/></label>
      <button type="button" disabled={importing||loading||importConfirm!=='IMPORT '+username} onClick={()=>void runImport()}>{importing?'IMPORTING...':'IMPORT MISSING WAGERS AND VERIFY'}</button>
    </div>}
   </section>
   <div>Cloud wagers are not loaded into the Bet Hub. Local wagers are unchanged.</div>
   <button type="button" disabled={loading} onClick={()=>void check()}>{loading?'CHECKING...':'CHECK CLOUD WAGERS'}</button>
   <div role="status">{message}</div>
   {checked&&<><div>Rows retrieved: {rows.length}. No uploads or changes performed.</div><div style={{display:'flex',gap:10,flexWrap:'wrap',fontWeight:700}}><span>Slates: {cloudSummary.slates}</span><span>Pending: {cloudSummary.pending}</span><span>Won: {cloudSummary.won}</span><span>Lost: {cloudSummary.lost}</span>{cloudSummary.other>0&&<span>Other: {cloudSummary.other}</span>}</div><button type="button" disabled={loading} onClick={exportSnapshot}>EXPORT MY CLOUD WAGERS (JSON BACKUP)</button>{username.toLowerCase()==='stankyfangers'&&<><button type="button" disabled={loading} onClick={compareLegacy}>COMPARE LEGACY LIVE VS CLOUD</button>{comparison&&<div role="status">{comparison}</div>}</>}<div style={{maxHeight:260,overflowY:'auto',borderTop:'1px solid #487b9a',paddingTop:6}}>{rows.length===0?'No cloud wagers yet.':rows.slice().sort((a,b)=>String(b.wager.date).localeCompare(String(a.wager.date))).slice(0,100).map(row=><div key={row.wager_id} style={{padding:'6px 0',borderBottom:'1px solid #28455c'}}><strong>{row.wager.date}</strong> · {row.wager.legs.length} leg{row.wager.legs.length===1?'':'s'}<div style={{overflowWrap:'anywhere',color:'#a7c8dd'}}>ID: {row.wager_id}</div></div>)}</div>{rows.length>100&&<small>Showing the latest 100 of {rows.length} cloud wagers.</small>}<label style={{display:'flex',gap:6,alignItems:'center'}}>Date filter <input type="date" value={filterDate} onChange={e=>setFilterDate(e.target.value)}/></label><button type="button" onClick={()=>{setShowDetails(v=>!v);setDetailId('')}}>{showDetails?'HIDE WAGER DETAILS':'VIEW WAGER DETAILS (READ ONLY)'}</button>{showDetails&&<div style={{maxHeight:320,overflowY:'auto',display:'grid',gap:6}}>{rows.filter(row=>!filterDate||row.wager.date===filterDate).slice().sort((a,b)=>String(b.wager.date).localeCompare(String(a.wager.date))).slice(0,100).map(row=><div key={row.wager_id} style={{border:'1px solid #31516b',borderRadius:6,padding:7}}><button type="button" onClick={()=>setDetailId(v=>v===row.wager_id?'':row.wager_id)}>{row.wager.date} · {row.wager.legs.length} legs · {row.wager.status||'PENDING'} {detailId===row.wager_id?'▲':'▼'}</button>{detailId===row.wager_id&&<pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontSize:11}}>{JSON.stringify(row.wager,null,2)}</pre>}</div>)}{rows.filter(row=>!filterDate||row.wager.date===filterDate).length===0&&<div>No wagers for this date.</div>}</div>}</>}
  </div>}
  {showCloudHub&&<div role="dialog" aria-modal="true" aria-label="Private cloud Bet Hub" style={{position:'fixed',inset:0,zIndex:21000,overflowY:'auto',background:'#070e1a'}}>
    <div style={{position:'sticky',top:0,zIndex:1,background:'#10263a',padding:12,textAlign:'right'}}><button type="button" onClick={()=>setShowCloudHub(false)}>RETURN TO LIVE TRACKER</button></div>
    <CloudBetHub key={username} username={username}/>
  </div>}
 </div>
}
// LIVE entry is gated before TrackerApp mounts, so unauthenticated sessions cannot
// render or mutate the legacy localStorage wager collection.
function App(){
 const isTest=import.meta.env.DEV
 const [account,setAccount]=useState<{username:string;role:string}|null>(null)
 const [name,setName]=useState('')
 const [password,setPassword]=useState('')
 const [mode,setMode]=useState<'login'|'register'>('login')
 const [email,setEmail]=useState('')
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const request=(payload:any)=>isTest?(window.nhlTracker as any).devAccountRequest(payload):(window.nhlTracker as any).liveAccountRequest(payload)
 const signIn=async(e:React.FormEvent)=>{
  e.preventDefault();setBusy(true);setError('')
  try{
   const result=await request(mode==='login'?{action:'login',login:name,password}:{action:'register',username:name,email,password})
   if(result.error){setError(!isTest&&/live accounts not activat/i.test(String(result.error))?'LIVE account activation is not enabled yet. Your local wagers are unchanged; registration and login will become available after production activation.':result.error);return}
   const who=result.account
   if(!who?.username){setError('Account service returned no user identity');return}
   if(isTest&&who.role!=='DEV'){await request({action:'logout'});setError('TEST wager synchronization is currently available only for DEV accounts. This account was not opened to avoid unsaved wagers.');return}
   // Every LIVE identity may sign in; only the legacy owner can mount local wagers.
   setAccount(who);setPassword('')
  }catch(e:any){setError(String(e?.message||'Account service unavailable'))}
  finally{setBusy(false)}
 }
 const logout=async()=>{try{await request({action:'logout'})}finally{setAccount(null);setPassword('')}}
 if(account)return isTest
  ? <TrackerApp key={'test:'+account.username} initialTestAccount={account} onTestLogout={()=>{setAccount(null);setPassword('')}}/>
  : <div>{account.username.toLowerCase()==='stankyfangers'?<><TrackerApp liveAccount={account} onLiveLogout={()=>void logout()}/><LiveCloudInspector key={account.username} username={account.username}/></>:<main style={{minHeight:'100vh',background:'#070e1a',color:'#edf6ff',padding:24}}><section style={{maxWidth:1100,margin:'0 auto',background:'#122137',border:'1px solid #3d617b',borderRadius:14,padding:28}}><h2>Private LIVE workspace</h2><p>Signed in as <strong>{account.username}</strong>. Your account is isolated from other users' local wagers.</p><p>Your cloud wager history is isolated to this LIVE account. Editing and new wager placement are not enabled here yet; no legacy local wagers are loaded.</p><CloudBetHub key={account.username} username={account.username}/><LiveCloudInspector key={account.username} username={account.username} embedded/></section></main>}</div>
 return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',background:'#070e1a',color:'#edf6ff',padding:24}}><section style={{width:'min(420px,100%)',background:'#122137',padding:30,borderRadius:16,border:'1px solid #3d617b',boxShadow:'0 20px 65px #0009'}}><h1 style={{marginTop:0}}>🏒 NHL TRACKER</h1><p style={{color:isTest?'#f3c478':'#91b3ce'}}>{isTest?'TEST MODE · DEVELOPMENT DATABASE':'LIVE MODE · ACCOUNT LOGIN REQUIRED'}</p><div role="tablist" aria-label="Account action" style={{display:'flex',gap:8,marginBottom:14}}>{(['login','register'] as const).map(tab=><button key={tab} type="button" role="tab" aria-selected={mode===tab} onClick={()=>{setMode(tab);setError('')}} style={{padding:'9px 14px',borderRadius:6,border:mode===tab?'1px solid #78b9e4':'1px solid #46617a',background:mode===tab?'#dcefff':'#1b3048',color:mode===tab?'#10243b':'#c7d9e9',fontWeight:mode===tab?800:600,cursor:'pointer',opacity:1}}>{tab==='login'?'LOG IN':'CREATE ACCOUNT'}</button>)}</div><form onSubmit={signIn} style={{display:'grid',gap:14}}><label>USERNAME OR EMAIL<input required autoComplete="username" value={name} onChange={e=>setName(e.target.value)} style={{display:'block',width:'100%',padding:12,boxSizing:'border-box'}}/></label>{mode==='register'&&<label>EMAIL<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} style={{display:'block',width:'100%',padding:12,boxSizing:'border-box'}}/></label>}<label>PASSWORD<input required type="password" minLength={mode==='register'?12:undefined} autoComplete={mode==='register'?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)} style={{display:'block',width:'100%',padding:12,boxSizing:'border-box'}}/></label>{error&&<p role="alert" style={{color:'#ffacac'}}>{error}</p>}<button type="submit" disabled={busy} style={{padding:13,cursor:'pointer'}}>{busy?'AUTHENTICATING…':mode==='login'?'LOG IN TO NHL TRACKER':'CREATE ACCOUNT'}</button></form><p style={{fontSize:12,color:'#9ab1c8'}}>{isTest?'Sign in with your existing TEST credentials to retain your TEST history. Changing the TEST username requires a separate server-side account migration.':'Your original LIVE wagers remain on this computer. Cloud wager migration is not active.'}</p></section></main>
}

export default App


/** Isolated interactive game sandbox. Uses the production LiveGameState and EventFeed renderers. */
function DevLineComboReport(){
 const [rows,setRows]=useState<{team:string;players:string[];status:string;updated:string;source:string}[]>([]);
 const [generated,setGenerated]=useState(false);
 const [includeProjected,setIncludeProjected]=useState(true);
 const mockRows=[
  {team:'BOS',players:['David Pastrnak','Pavel Zacha'],status:'CONFIRMED',updated:'Oct 9, 5:42 PM ET',source:'Daily Faceoff'},
  {team:'COL',players:['Nathan MacKinnon','Martin Necas','Cale Makar'],status:'PROJECTED',updated:'Oct 9, 4:15 PM ET',source:'Daily Faceoff'},
  {team:'EDM',players:['Connor McDavid','Leon Draisaitl'],status:'CONFIRMED',updated:'Oct 9, 6:05 PM ET',source:'Team Report'},
 ];
 const report=['NHL TRACKER — DAILY LINE COMBO REPORT','DEV PREVIEW — SAMPLE DATA ONLY',new Date().toLocaleDateString(),'',...rows.map(r=>`${r.team} - ${r.players.map(n=>n+' 1P').join(' + ')} - ${r.status} - ${r.updated} - ${r.source}\n`)].join('\n').trimEnd()+'\n';
 const exportTxt=()=>{const blob=new Blob([report],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='NHL-Line-Combos-DEV-PREVIEW.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
 return <section className="settingsCard" style={{padding:18,marginBottom:14}}>
  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><div><h2>DAILY LINE COMBO REPORT</h2><p>DEV PREVIEW · Sample entries only, not verified NHL lineups. No bets or app data are changed.</p></div><label><input type="checkbox" checked={includeProjected} onChange={e=>setIncludeProjected(e.target.checked)}/> Include projected</label></div>
  <div style={{display:'flex',gap:10,flexWrap:'wrap',margin:'12px 0'}}><button onClick={()=>{setRows(mockRows.filter(r=>includeProjected||r.status==='CONFIRMED'));setGenerated(true)}}>GENERATE SAMPLE REPORT</button><button disabled={!generated} onClick={()=>navigator.clipboard.writeText(report)}>COPY REPORT</button><button disabled={!generated} onClick={exportTxt}>EXPORT TXT</button></div>
  {generated?<pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontFamily:'inherit',fontSize:14,lineHeight:2,padding:16,background:'#111925',border:'1px solid #38465b',borderRadius:8}}>{report}</pre>:<p>Click Generate Sample Report to preview the exact double-spaced two-player and three-player format.</p>}
 </section>
}

function DevGameSandbox({onExit}:{onExit:()=>void}){
 const [awayTeam,setAwayTeam]=useState('PIT'),[homeTeam,setHomeTeam]=useState('WSH');
 const [period,setPeriod]=useState(1),[seconds,setSeconds]=useState(1200),[running,setRunning]=useState(false),[phase,setPhase]=useState<'LIVE'|'STOP'|'INT'|'FINAL'>('LIVE');
 const [away,setAway]=useState(0),[home,setHome]=useState(0),[pp,setPp]=useState<string>(''),[pulled,setPulled]=useState<string>('');
 const [events,setEvents]=useState<FeedEvent[]>([]),[penalties,setPenalties]=useState(0),[testBets,setTestBets]=useState<{id:number;label:string;status:string}[]>([]);
 const [intermissionLeft,setIntermissionLeft]=useState(18*60);
 const stateRef=useRef({period,seconds,running,phase});stateRef.current={period,seconds,running,phase};
 useEffect(()=>{const timer=window.setInterval(()=>{const x=stateRef.current;if(x.phase==='LIVE'&&x.running)setSeconds(v=>{if(v<=1){setRunning(false);setPhase('STOP');return 0}return v-1});if(x.phase==='INT')setIntermissionLeft(v=>Math.max(0,v-1))},1000);return()=>window.clearInterval(timer)},[]);
 const game:Game={id:-1001,gameState:phase==='FINAL'?'FINAL':'LIVE',awayTeam:{abbrev:awayTeam,score:away},homeTeam:{abbrev:homeTeam,score:home},periodDescriptor:{number:period},clock:{running:running&&phase==='LIVE',timeRemaining:`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`},_trackerIntermissionPeriod:phase==='INT'?period:0,_trackerIntermissionSyncSeconds:phase==='INT'?intermissionLeft:undefined,situationCode:pp===awayTeam?'1541':pp===homeTeam?'1451':'1551',_trackerEmptyNetTeam:pulled||undefined};
 const add=(type:FeedEvent['type'],title:string,detail:string,team=awayTeam)=>setEvents(old=>[{id:`dev-${Date.now()}-${Math.random()}`,gameId:-1001,team,opponent:team===awayTeam?homeTeam:awayTeam,type,title,detail,meta:`${period}P · ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')} · ${new Date().toLocaleTimeString()}`,sort:Date.now()},...old]);
 const reset=()=>{setPeriod(1);setSeconds(1200);setRunning(false);setPhase('LIVE');setAway(0);setHome(0);setPp('');setPulled('');setEvents([]);setPenalties(0);setTestBets([]);setIntermissionLeft(1080)};
 const button=(label:string,click:()=>void)=> <button type="button" onClick={click} style={{padding:'9px 10px',minHeight:38}}>{label}</button>;
 return <main className="commandCenter devSandbox" style={{padding:'16px 20px'}}>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}><div><h1>SIMULATED GAME · {awayTeam} @ {homeTeam}</h1><small style={{color:'#ffc65c'}}>DEV MODE · ISOLATED TEST DATA · NOT A REAL NHL GAME</small></div><button onClick={onExit}>EXIT DEV MODE</button></div>
  <DevLineComboReport/>
  <section className="settingsCard" style={{padding:16,marginBottom:14}}><h2>TEAM MATCHUP · GOAL ART & ZAMBONI TEST</h2><div style={{display:'flex',gap:14,flexWrap:'wrap',alignItems:'center'}}><label>AWAY TEAM <select aria-label="Simulator away team" value={awayTeam} onChange={e=>{if(e.target.value===homeTeam)setHomeTeam(awayTeam);setAwayTeam(e.target.value);reset()}}>{ALL_TEAMS.map(t=><option key={t} value={t}>{t}</option>)}</select></label><label>HOME TEAM <select aria-label="Simulator home team" value={homeTeam} onChange={e=>{if(e.target.value===awayTeam)setAwayTeam(homeTeam);setHomeTeam(e.target.value);reset()}}>{ALL_TEAMS.map(t=><option key={t} value={t}>{t}</option>)}</select></label><span style={{color:'#ffc65c'}}>Choose any matchup, then simulate a GOAL or intermission. Reset clears test events only.</span></div></section>
  <section className="settingsCard" style={{padding:20,marginBottom:14}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:20}}><h2 style={{fontSize:25}}>{awayTeam} {away} — {home} {homeTeam}</h2><div style={{minWidth:340,width:'42%',fontSize:20}}><LiveGameState game={game}/></div></div><p style={{marginTop:10}}>Mock game clock and status. Intermission uses the real Zamboni component and CSS.</p></section>
  <section className="settingsCard" style={{padding:16,marginBottom:14}}><h2>SIMULATOR CONTROLS</h2><div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:8}}>
  {button(running?'PAUSE CLOCK':'START / RESUME',()=>{setPhase('LIVE');setRunning(v=>!v)})}
  {button('STOPPAGE',()=>{setRunning(false);setPhase('STOP');add('POWER PLAY','STOPPAGE','Whistle blown')})}
  {button('🚜 INTERMISSION',()=>{setRunning(false);setPhase('INT');setIntermissionLeft(1080);add('INTERMISSION',`END OF ${period}P`,'Zamboni on the ice')})}
  {button('NEXT PERIOD',()=>{setPeriod(v=>Math.min(4,v+1));setSeconds(period>=3?300:1200);setPhase('LIVE');setRunning(false);add('PERIOD START','NEXT PERIOD','Ready for puck drop')})}
  {button(`${awayTeam} PP`,()=>{setPp(awayTeam);add('POWER PLAY',`${awayTeam} POWER PLAY`,`${awayTeam} advantage`)})}
  {button(`${homeTeam} PP`,()=>{setPp(homeTeam);add('POWER PLAY',`${homeTeam} POWER PLAY`,`${homeTeam} advantage`,homeTeam)})}
  {button('END PP',()=>setPp(''))}
  {button('PENALTY',()=>{setPenalties(v=>v+1);add('POWER PLAY','PENALTY',`Penalty #${penalties+1}`)})}
  {button(`${awayTeam} PULL GOALIE`,()=>{setPulled(v=>v===awayTeam?'':awayTeam);add('EMPTY NET',`${awayTeam} GOALIE`,pulled===awayTeam?'Returned':'Pulled')})}
  {button(`${homeTeam} PULL GOALIE`,()=>{setPulled(v=>v===homeTeam?'':homeTeam);add('EMPTY NET',`${homeTeam} GOALIE`,pulled===homeTeam?'Returned':'Pulled',homeTeam)})}
  {button(`${awayTeam} GOAL`,()=>{setAway(v=>v+1);add('GOAL',`${awayTeam} GOAL`,`${awayTeam} ${away+1} – ${homeTeam} ${home}`)})}
  {button(`${homeTeam} GOAL`,()=>{setHome(v=>v+1);add('GOAL',`${homeTeam} GOAL`,`${awayTeam} ${away} – ${homeTeam} ${home+1}`,homeTeam)})}
  {button('STAT CORRECTION',()=>add('STAT CORRECTION','STAT CORRECTION','Simulated goal or assist correction'))}
  {button('BET HIT',()=>{setTestBets(v=>[{id:Date.now(),label:'Mock player prop',status:'WON'},...v]);add('BET HIT','MOCK BET HIT','Simulated wager completed')})}
  {button('FINAL',()=>{setRunning(false);setPhase('FINAL');add('FINAL','FINAL',`${awayTeam} ${away} – ${homeTeam} ${home}`)})}
  {button('RESET ALL',reset)}
  </div><div style={{display:'flex',alignItems:'center',gap:10,marginTop:12}}><label>Set game clock <input type="number" min="0" max="20" value={Math.floor(seconds/60)} onChange={e=>setSeconds(Math.max(0,Math.min(20,Number(e.target.value)||0))*60+seconds%60)} style={{width:65}}/> min</label><input type="number" min="0" max="59" value={seconds%60} onChange={e=>setSeconds(Math.floor(seconds/60)*60+Math.max(0,Math.min(59,Number(e.target.value)||0)))} style={{width:65}}/> sec <span>· Period {period} · {phase} · {running?'RUNNING':'PAUSED'}</span></div></section>
  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}><section className="settingsCard" style={{padding:16}}><h2>SIMULATED LIVE EVENTS</h2><EventFeed events={events}/></section><section className="settingsCard" style={{padding:16}}><h2>MOCK BETS</h2><p>Test wagers are temporary and never saved.</p>{testBets.length?testBets.map(b=><p key={b.id}>{b.label} — {b.status}</p>):<p>No simulated bets yet. Use BET HIT to test an event.</p>}</section></div>
 </main>
}

function ConfidencePerformanceView({bets,revision}:{bets:Bet[];revision:number}){
 const predictions=useMemo(()=>readPredictions(),[revision]);const grades=useMemo(()=>wagerGrades(bets,predictions),[bets,predictions]);
 const [strategy,setStrategy]=useState<Thresholds>(()=>readActiveStrategy());const [profileReport,setProfileReport]=useState<ProfileReport|null>(null);const [opportunities,setOpportunities]=useState(()=>readOpportunities());
 const runOptimize=()=>{const data=readOpportunities();setOpportunities(data);setProfileReport(optimizeProfiles(data,strategy))};
 const total=(xs:number[])=>xs.reduce((a,b)=>a+b,0);const settled=predictions.filter(p=>p.goals!=null)
 return <main style={{padding:24,overflowY:'auto'}}><h1>CONFIDENCE PERFORMANCE</h1><p>Passive shadow testing · historical predictions never overwritten · provisional model</p><section className="settingsCard" style={{marginBottom:18,padding:18}}><h2>CONFIDENCE STRATEGY LAB · NET UNITS</h2><p>One-click SAFE / BALANCED / AGGRESSIVE / MAX RETURN comparison of eligible, priced, settled forward-line + PP combos, including unplaced opportunities. Predictions and odds must be frozen pregame. No goals-based grading.</p><p><b>{opportunities.length}</b> eligible priced opportunities recorded · Active: SKIP &lt;{strategy.skip}, FADE &lt;{strategy.fade} (0.5×), BOOST ≥{strategy.boost} (1.5×)</p><button type="button" onClick={runOptimize} style={{padding:'10px 18px',fontWeight:800}}>✦ OPTIMIZE STRATEGY</button>{profileReport&&<div style={{marginTop:12}}><p><b>PROFILE COMPARISON</b> · Training {profileReport.trainingCount} combos / {profileReport.trainingGames} games · Holdout {profileReport.validationCount} combos / {profileReport.validationGames} games · {profileReport.tested.toLocaleString()} cutoffs evaluated</p><p>Excluded invalid/unpriced opportunities: {profileReport.excluded}. Drawdown and losing streak are measured by chronological slate (date), not individual wager ordering.</p><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:12}}>{profileReport.profiles.map(p=><div className="settingsCard" key={p.name} style={{padding:14}}><h3>{p.name}</h3><p>{p.status==='READY'?'VALIDATED':p.status==='UNVALIDATED'?'NOT VALIDATED':'INSUFFICIENT DATA'}</p><p>{p.reason}</p>{p.thresholds&&<><p>SKIP &lt;{p.thresholds.skip} · FADE &lt;{p.thresholds.fade} · BOOST ≥{p.thresholds.boost}</p>{(['training','validation'] as const).map(phase=>{const st=p[phase];return st?<div key={phase}><b>{phase==='training'?'Historical training':'Later holdout'}</b><p>Net: {st.adjusted.toFixed(2)}u · Added: {st.added.toFixed(2)}u</p><p>Max drawdown: {st.maxDrawdown.toFixed(2)}u · Losing slates: {st.worstLosingStreak}</p><p>Exposure: {st.exposure.toFixed(1)}u · Missed SKIP profit: {st.missedProfit.toFixed(2)}u</p></div>:null})}{p.status==='READY'&&<button type="button" onClick={()=>{saveActiveStrategy(p.thresholds!);setStrategy(p.thresholds!);setProfileReport(null)}}>APPLY {p.name} THRESHOLDS</button>}</>}</div>)}</div></div>}<p style={{opacity:.7,fontSize:12}}>Optimizer only recommends after sufficient priced history and a chronological game-level holdout. Applying changes future recommendations only; it never edits wagers or historical predictions.</p></section><div className="settingsDashboard"><div className="settingsCard"><h2>Team scoring predictions</h2><p>{predictions.length} captured · {settled.length} final · {predictions.length-settled.length} pending</p><table style={{width:'100%',textAlign:'left'}}><thead><tr><th>Signal</th><th>Final teams</th><th>Avg goals</th><th>2+</th><th>3+</th><th>4+</th></tr></thead><tbody>{(['SKIP','FADE','NEUTRAL','BOOST'] as const).map(signal=>{const rows=settled.filter(p=>p.signal===signal),rate=(n:number)=>rows.length?`${Math.round(100*rows.filter(p=>(p.goals||0)>=n).length/rows.length)}%`:'—';return <tr key={signal}><td>{signal}</td><td>{rows.length}</td><td>{rows.length?(total(rows.map(p=>p.goals||0))/rows.length).toFixed(2):'—'}</td><td>{rate(2)}</td><td>{rate(3)}</td><td>{rate(4)}</td></tr>})}</tbody></table></div><div className="settingsCard"><h2>Settled wagers · actual vs shadow</h2><p>Actual {total(grades.map(g=>g.actualUnits)).toFixed(2)}u · Shadow {total(grades.map(g=>g.shadowUnits)).toFixed(2)}u</p><p>{grades.filter(g=>!g.predictionId).length} wagers unclassified (excluded from signal comparison)</p><table style={{width:'100%',textAlign:'left'}}><thead><tr><th>Signal</th><th>Bets</th><th>Actual</th><th>Shadow</th></tr></thead><tbody>{(['SKIP','FADE','NEUTRAL','BOOST'] as const).map(signal=>{const rows=grades.filter(g=>g.signal===signal);return <tr key={signal}><td>{signal}</td><td>{rows.length}</td><td>{total(rows.map(g=>g.actualUnits)).toFixed(2)}u</td><td>{total(rows.map(g=>g.shadowUnits)).toFixed(2)}u</td></tr>})}</tbody></table></div></div><section className="settingsCard" style={{marginTop:18}}><h2>Frozen predictions</h2><table style={{width:'100%',textAlign:'left'}}><thead><tr><th>Date</th><th>Attack</th><th>Defense</th><th>Score</th><th>Signal</th><th>Goals</th></tr></thead><tbody>{[...predictions].reverse().map(p=><tr key={p.id}><td>{p.date}</td><td>{p.team}</td><td>{p.opponent}</td><td>{p.score.toFixed(1)}</td><td>{p.signal}</td><td>{p.goals??'Pending'}</td></tr>)}</tbody></table></section></main>
}
