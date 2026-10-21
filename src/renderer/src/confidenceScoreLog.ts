import {comboModelInfo} from './automaticCombos'
import {CONFIDENCE_AS_OF, CONFIDENCE_STATUS, CONFIDENCE_TEAMS, matchupConfidence} from './confidenceEngine'
import {confidenceSignal} from './confidencePerformance'
const KEY='nhlTrackerConfidenceScoreLog:v1'
export type ScoreLog={id:string;date:string;gameId:string;team:string;opponent:string;score:number;signal:string;firstCapturedAt:string;capturedAt:string;modelAsOf:string;modelStatus:string;olderInputs:boolean;frozenAt?:string;goals?:number;finalAt?:string;inputs:unknown}
export function readScoreLog():ScoreLog[]{try{const value=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(value)?value:[]}catch{return []}}
// Record the displayed score separately from performance predictions. Older model
// inputs are disclosed here, never passed off as fresh validation predictions.
export function logDisplayedScores(date:string,games:any[],abbr:(t:any)=>string):boolean{
 captureTeamHistory(date);
 const rows=readScoreLog();let changed=false;const now=new Date().toISOString()
 for(const g of games){
  const pre=['PRE','FUT'].includes(String(g.gameState));const started=['LIVE','CRIT','FINAL','OFF'].includes(String(g.gameState))
  const pastStart=Number.isFinite(Date.parse(g.startTimeUTC))&&Date.parse(g.startTimeUTC)<=Date.now()
  for(const [team,opponent] of [[abbr(g.awayTeam),abbr(g.homeTeam)],[abbr(g.homeTeam),abbr(g.awayTeam)]]){
   const id=`${date}:${g.id}:${team}`,row=rows.find(r=>r.id===id)
   if(row&&['FINAL','OFF'].includes(String(g.gameState))){const side=team===abbr(g.awayTeam)?g.awayTeam:g.homeTeam;if(side?.score!=null&&row.goals!==Number(side.score)){row.goals=Number(side.score);row.finalAt=now;changed=true}}
   if(row&&(started||pastStart)&&!row.frozenAt){row.frozenAt=now;changed=true}
   if(row||!pre||pastStart)continue
   const score=matchupConfidence(team,opponent);if(score==null)continue
   const inputs={offense:{...CONFIDENCE_TEAMS[team]},defense:{...CONFIDENCE_TEAMS[opponent]},comboModel:{...comboModelInfo}}
   const next:ScoreLog={id,date,gameId:String(g.id),team,opponent,score,signal:confidenceSignal(score),firstCapturedAt:now,capturedAt:now,modelAsOf:String(CONFIDENCE_AS_OF),modelStatus:String(CONFIDENCE_STATUS)+(comboModelInfo.updated?' · combo factors automatically refreshed for '+comboModelInfo.calculatedFor:''),olderInputs:String(CONFIDENCE_AS_OF).slice(0,10)<date,inputs}
   rows.push(next);changed=true
  }
 }
 if(changed)localStorage.setItem(KEY,JSON.stringify(rows));return changed
}

export type TeamScoreSnapshot={date:string;team:string;offense:number;defense:number;capturedAt:string;modelAsOf:string;modelStatus:string}
const TEAM_KEY='nhlTrackerTeamConfidenceHistory:v1'
export function readTeamHistory():TeamScoreSnapshot[]{try{const rows=JSON.parse(localStorage.getItem(TEAM_KEY)||'[]');return Array.isArray(rows)?rows:[]}catch{return []}}
function captureTeamHistory(date:string){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const get=(k:string)=>parts.find(p=>p.type===k)?.value;const today=`${get('year')}-${get('month')}-${get('day')}`;
 if(date!==today)return;
 const rows=readTeamHistory();let changed=false;
 for(const [team,ratings] of Object.entries(CONFIDENCE_TEAMS)){
  if(rows.some(r=>r.team===team&&r.date===date)||!Number.isFinite(ratings.off_score)||!Number.isFinite(ratings.def_score))continue;
  rows.push({date,team,offense:ratings.off_score,defense:ratings.def_score,capturedAt:new Date().toISOString(),modelAsOf:String(CONFIDENCE_AS_OF),modelStatus:String(CONFIDENCE_STATUS)+(comboModelInfo.updated?' · combo factors automatically refreshed for '+comboModelInfo.calculatedFor:'')});changed=true
 }
 if(changed){localStorage.setItem(TEAM_KEY,JSON.stringify(rows));window.dispatchEvent(new Event('nhl-confidence-history'))}
}
