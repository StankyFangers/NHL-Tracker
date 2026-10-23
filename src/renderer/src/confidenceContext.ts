import {refreshCoreRating,type CoreFeed} from '../../shared/confidenceTeamStats'
import {matchupStarter,type DfoGoalieFeed} from '../../shared/dfoStartingGoalies'
import type {OpportunityFeed} from '../../shared/teamOpportunityStats'
export const MODEL_VERSION='1.7.8-team-stats-no-goalie-v2'
export const GOALIE_SCORING_ENABLED=false
export const GOALIE_GAA_REFERENCE=3,GOALIE_DEFENSE_POINTS_PER_GAA=5,GOALIE_MAX_ADJUSTMENT=10
let context:{date:string;goalies?:DfoGoalieFeed;opportunities?:OpportunityFeed;core?:CoreFeed;league?:Record<string,Record<string,number>>}={date:''}
export function setConfidenceContext(next:typeof context){context=next}
export function confidenceInputReadiness(date:string){const core=context.core,opportunities=context.opportunities;return context.date===date&&core?.date===date&&opportunities?.date===date&&core.teams.length===32&&opportunities.teams.length===32&&core.teams.every(t=>opportunities.teams.some(o=>o.team===t.team&&o.games===t.games))}
export function confidenceContextSnapshot(){const {league,...sources}=context;return {...sources,modelVersion:MODEL_VERSION,goalieScoringEnabled:GOALIE_SCORING_ENABLED}}
const clamp=(v:number,min=0,max=100)=>Math.max(min,Math.min(max,v))
// Starter information is collected for display only in this model.
export function gaaDefenseAdjustment(_gaa:number|null|undefined){return 0}
export function contextualTeamRating(team:string,opponent:string|undefined,base:Record<string,number>|undefined){
 if(!base)return undefined
 const result=refreshCoreRating(base,team,context.core?.date===context.date?context.core:undefined,context.league||{});const feed=context.opportunities?.date===context.date?context.opportunities:undefined,own=feed?.teams.find(t=>t.team===team)
 const rankPoints=(key:'xgf'|'xga'|'hdFor'|'hdAgainst')=>{if(!own||!feed||feed.teams.length<2)return undefined;const rank=1+feed.teams.filter(t=>t[key]>own[key]).length;return {rank,points:10*(feed.teams.length-rank)/(feed.teams.length-1)}}
 for(const [key,prefix,old] of [['xgf','off_xgf','off_xgf'],['xga','def_xga','def_xga'],['hdFor','off_hdpergame','off_hdshare'],['hdAgainst','def_hdpergame','def_hdshare']] as const){const value=rankPoints(key);result[prefix+'_pts']=value?.points??NaN;result[prefix+'_rank']=value?.rank??NaN;result[key]=own?.[key]??NaN;result[old+'_oldpts']=base[old+'_pts']}
 const offAdded=[result.off_xgf_pts,result.off_hdpergame_pts].filter(Number.isFinite),defAdded=[result.def_xga_pts,result.def_hdpergame_pts].filter(Number.isFinite)
 result.off_score=clamp((result.off_score-base.off_xgf_pts-base.off_hdshare_pts+offAdded.reduce((a,b)=>a+b,0))*100/(80+offAdded.length*10))
 const defenseBase=clamp((result.def_score-base.def_xga_pts-base.def_hdshare_pts+defAdded.reduce((a,b)=>a+b,0))*100/(80+defAdded.length*10))
 result.off_component_scale=100/(80+offAdded.length*10);result.def_component_scale=100/(80+defAdded.length*10)
 const starter=opponent?matchupStarter(context.goalies,context.date,team,opponent):context.goalies?.date===context.date&&context.goalies.goalies.filter(g=>g.team===team).length===1?context.goalies.goalies.find(g=>g.team===team):null
 result.goalie_gaa=starter?.name&&starter.status!=='UNKNOWN'&&starter.gaa!=null&&starter.gaa>=0?starter.gaa:NaN
 result.goalie_adjustment=gaaDefenseAdjustment(result.goalie_gaa);result.def_score_before_goalie=defenseBase;result.def_score=clamp(defenseBase+result.goalie_adjustment)
 return result
}
