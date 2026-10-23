export type DfoGoalieStatus='CONFIRMED'|'LIKELY'|'PROJECTED'|'UNKNOWN'
export type DfoStartingGoalie={date:string;team:string;opponent:string;gameStartUTC:string;name:string|null;dfoPlayerId:number|null;status:DfoGoalieStatus;rawStatus:string;updatedAt:string|null;source:string;sourceUrl:string;savePct:number|null;gaa:number|null;checkedAt:string}
export type DfoGoalieFeed={date:string;url:string;checkedAt:string;goalies:DfoStartingGoalie[]}
const number=(n:unknown)=>n!==null&&n!==undefined&&n!==''&&Number.isFinite(Number(n))?Number(n):null
export const goalieNameKey=(s:string)=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/gi,'').toLowerCase()
export function parseDfoStartingGoalies(html:string,date:string,checkedAt=new Date().toISOString()):DfoGoalieFeed{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Invalid goalie slate date')
 const script=html.match(/<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)
 if(!script)throw Error('DFO starting-goalie data was not found. Please retry.')
 let page:any;try{page=JSON.parse(script[1])?.props?.pageProps}catch{throw Error('DFO starting-goalie data could not be read. Please retry.')}
 if(page?.date!==date||!Array.isArray(page?.data))throw Error('DFO returned a different slate date or unsupported goalie data')
 const result:DfoStartingGoalie[]=[]
 for(const game of page.data){if(game.date!==date)continue
  for(const side of ['away','home']){
   const other=side==='away'?'home':'away',team=String(game[side+'TeamAbbreviation']||'').toUpperCase(),opponent=String(game[other+'TeamAbbreviation']||'').toUpperCase()
   if(!/^[A-Z]{2,3}$/.test(team)||!/^[A-Z]{2,3}$/.test(opponent))continue
   const rawStatus=String(game[side+'NewsStrengthName']||'Unknown'),normalized=rawStatus.toLowerCase().trim()
   const status:DfoGoalieStatus=normalized==='confirmed'?'CONFIRMED':['likely','probable'].includes(normalized)?'LIKELY':['projected','expected','unconfirmed'].includes(normalized)?'PROJECTED':'UNKNOWN'
   const name=typeof game[side+'GoalieName']==='string'?game[side+'GoalieName'].trim()||null:null
   const stamp=game[side+'NewsCreatedAt'],updatedAt=stamp&&Number.isFinite(Date.parse(stamp))?new Date(stamp).toISOString():null
   const url=String(game[side+'NewsSourceUrl']||'')
   result.push({date,team,opponent,gameStartUTC:String(game.dateGmt||''),name,dfoPlayerId:number(game[side+'GoalieId']),status:name?status:'UNKNOWN',rawStatus,updatedAt,source:String(game[side+'NewsSourceName']||'Daily Faceoff'),sourceUrl:/^https?:\/\//i.test(url)?url:'',savePct:number(game[side+'GoalieSavePercentage']),gaa:number(game[side+'GoalieGoalsAgainstAvg']),checkedAt})
  }
 }
 const keys=result.map(g=>g.team+':'+g.opponent+':'+g.gameStartUTC)
 if(new Set(keys).size!==keys.length)throw Error('DFO returned duplicate goalie matchups')
 return {date,url:'https://www.dailyfaceoff.com/starting-goalies/'+date,checkedAt,goalies:result}
}
export function matchupStarter(feed:DfoGoalieFeed|undefined,date:string,team:string,opponent:string,startUTC?:string):DfoStartingGoalie|null{
 if(!feed||feed.date!==date)return null
 const rows=feed.goalies.filter(g=>g.date===date&&g.team===team&&g.opponent===opponent&&(!startUTC||!g.gameStartUTC||Date.parse(startUTC)===Date.parse(g.gameStartUTC)))
 return rows.length===1?rows[0]:null
}
export function matchingGoalieStats(name:string|null,club:any){
 if(!name)return null;const rows=[...(club?.goalies||club?.goalieSummary||[])]
 const matches=rows.filter((g:any)=>goalieNameKey([g.firstName?.default||g.firstName,g.lastName?.default||g.lastName].filter(Boolean).join(' ')||g.name?.default||g.name||'')===goalieNameKey(name))
 return matches.length===1?matches[0]:null
}
export function goalieRefreshDue(games:any[],lastAttempt:number,lastSuccess:number,now:number){
 if(now-lastAttempt<60000)return false
 const pre=games.filter(g=>['PRE','FUT'].includes(String(g.gameState))&&(!Number.isFinite(Date.parse(g.startTimeUTC))||Date.parse(g.startTimeUTC)>now));if(!pre.length)return false
 if(lastSuccess<lastAttempt)return true
 return pre.some(g=>now-lastSuccess>=(Date.parse(g.startTimeUTC)-now<=3600000?300000:1800000))
}
