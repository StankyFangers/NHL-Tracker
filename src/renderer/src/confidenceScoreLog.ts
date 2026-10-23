import {trackedConfidenceRows,CONFIDENCE_TRACKING_START} from './confidenceTracking'
import {confidenceContextSnapshot,confidenceInputReadiness,MODEL_VERSION} from './confidenceContext'
import {comboModelInfo} from './automaticCombos'
import {CONFIDENCE_STATUS, confidenceTeam, matchupConfidence} from './confidenceEngine'
import {confidenceSignal} from './confidencePerformance'
const KEY='nhlTrackerConfidenceScoreLog:v1'
export type ScoreLog={id:string;date:string;gameId:string;team:string;opponent:string;score:number;signal:string;firstCapturedAt:string;capturedAt:string;modelAsOf:string;modelStatus:string;olderInputs:boolean;frozenAt?:string;goals?:number;finalAt?:string;inputs:unknown}
export function readScoreLog():ScoreLog[]{try{const value=JSON.parse(localStorage.getItem(KEY)||'[]');return trackedConfidenceRows(KEY,Array.isArray(value)?value:[])}catch{return []}}
// Record the displayed score separately from performance predictions. Older model
// inputs are disclosed here, never passed off as fresh validation predictions.
export function logDisplayedScores(date:string,games:any[],abbr:(t:any)=>string,options:{replacePregame?:boolean}={}):boolean{
 if(date<CONFIDENCE_TRACKING_START)return false;
 const rows=readScoreLog();let changed=false;const now=new Date().toISOString();const ready=confidenceInputReadiness(date);let backedUp=false
 const backup=()=>{if(!backedUp){localStorage.setItem(KEY+':before-recalculate:'+Date.now(),JSON.stringify(rows));backedUp=true}}
 for(const g of games){
  const pre=['PRE','FUT'].includes(String(g.gameState));const started=['LIVE','CRIT','FINAL','OFF'].includes(String(g.gameState))
  const pastStart=Number.isFinite(Date.parse(g.startTimeUTC))&&Date.parse(g.startTimeUTC)<=Date.now()
  for(const [team,opponent] of [[abbr(g.awayTeam),abbr(g.homeTeam)],[abbr(g.homeTeam),abbr(g.awayTeam)]]){
   const id=`${date}:${g.id}:${team}`,row=rows.find(r=>r.id===id)
   if(row&&['FINAL','OFF'].includes(String(g.gameState))){const side=team===abbr(g.awayTeam)?g.awayTeam:g.homeTeam;if(side?.score!=null&&row.goals!==Number(side.score)){row.goals=Number(side.score);row.finalAt=now;changed=true}}
   if(row&&(started||pastStart)&&!row.frozenAt){row.frozenAt=now;changed=true}
   if(!pre||pastStart||!ready||row?.frozenAt||row?.finalAt||(row?.inputs as any)?.manual)continue
   if(row&&!options.replacePregame)continue
   const score=matchupConfidence(team,opponent);if(score==null)continue
   const inputs={offense:{...confidenceTeam(team,opponent)},defense:{...confidenceTeam(opponent,team)},comboModel:{...comboModelInfo},context:confidenceContextSnapshot()}
   const next:ScoreLog={id,date,gameId:String(g.id),team,opponent,score,signal:confidenceSignal(score),firstCapturedAt:now,capturedAt:now,modelAsOf:date,modelStatus:MODEL_VERSION+' · '+String(CONFIDENCE_STATUS)+(comboModelInfo.updated?' · combo factors automatically refreshed for '+comboModelInfo.calculatedFor:''),olderInputs:!comboModelInfo.updated,inputs}
   if(row){backup();Object.assign(row,{...next,firstCapturedAt:row.firstCapturedAt})}else rows.push(next);changed=true
  }
 }
 if(changed)localStorage.setItem(KEY,JSON.stringify(rows));return captureTeamHistory(date,games,abbr)||changed
}

export type TeamScoreSnapshot={date:string;gameId:string;team:string;opponent:string;offense:number;defense:number;matchupScore?:number;goals?:number;goalsAgainst?:number;finalAt?:string;capturedAt:string;modelAsOf:string;modelStatus:string;olderInputs?:boolean}
const TEAM_KEY='nhlTrackerTeamConfidenceHistory:games:v2'
function storedTeamHistory():TeamScoreSnapshot[]{try{const rows=JSON.parse(localStorage.getItem(TEAM_KEY)||'[]');return Array.isArray(rows)?rows:[]}catch{return []}}
// Historical inputs come only from the original saved pregame record.
export function readTeamHistory():TeamScoreSnapshot[]{
 const map=new Map<string,TeamScoreSnapshot>();for(const r of storedTeamHistory())if(r.gameId)map.set(`${r.gameId}:${r.team}`,r)
 for(const r of readScoreLog()){
  const ratings=(r.inputs as any)?.offense
  if(!r.gameId||!Number.isFinite(ratings?.off_score)||!Number.isFinite(ratings?.def_score))continue
  const key=`${r.gameId}:${r.team}`,old=map.get(key)
  if(!old||!old.finalAt&&Date.parse(r.capturedAt)>=Date.parse(old.capturedAt))map.set(key,{date:r.date,gameId:r.gameId,team:r.team,opponent:r.opponent,offense:ratings.off_score,defense:ratings.def_score,matchupScore:r.score,goals:r.goals,finalAt:r.finalAt,capturedAt:r.capturedAt||r.firstCapturedAt,modelAsOf:r.modelAsOf,modelStatus:r.modelStatus,olderInputs:r.olderInputs})
  else if(r.finalAt){old.goals=r.goals;old.finalAt=r.finalAt}
 }
 return trackedConfidenceRows(TEAM_KEY,[...map.values()]).sort((a,b)=>a.date.localeCompare(b.date)||a.gameId.localeCompare(b.gameId))
}
function captureTeamHistory(date:string,games:any[],abbr:(t:any)=>string){
 const rows=readTeamHistory();const previous=JSON.stringify(storedTeamHistory())
 // Only records already captured before puck drop are added. No off-day rows.
 for(const g of games){
  if(!['FINAL','OFF'].includes(String(g.gameState)))continue
  for(const [side,other] of [[g.awayTeam,g.homeTeam],[g.homeTeam,g.awayTeam]]){
   const row=rows.find(r=>r.date===date&&r.gameId===String(g.id)&&r.team===abbr(side));if(!row)continue
   if(side?.score!=null&&other?.score!=null){row.goals=Number(side.score);row.goalsAgainst=Number(other.score);row.finalAt=row.finalAt||new Date().toISOString()}
  }
 }
 const next=JSON.stringify(rows);if(previous===next)return false
 localStorage.setItem(TEAM_KEY,next);window.dispatchEvent(new Event('nhl-confidence-history'));return true
}
