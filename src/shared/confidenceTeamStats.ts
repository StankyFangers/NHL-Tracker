export type CoreTeam={team:string;games:number;gf:number;ga:number;sf:number;sa:number;pp:number;pk:number}
export type CoreFeed={date:string;checkedAt:string;source:string;teams:CoreTeam[]}
const ids:Record<number,string>={1:'NJD',2:'NYI',3:'NYR',4:'PHI',5:'PIT',6:'BOS',7:'BUF',8:'MTL',9:'OTT',10:'TOR',12:'CAR',13:'FLA',14:'TBL',15:'WSH',16:'CHI',17:'DET',18:'NSH',19:'STL',20:'CGY',21:'COL',22:'EDM',23:'VAN',24:'ANA',25:'DAL',26:'LAK',28:'SJS',29:'CBJ',30:'MIN',52:'WPG',54:'VGK',55:'SEA',59:'UTA'}
const teamNames:Record<string,string>={ANA:'Anaheim Ducks',BOS:'Boston Bruins',BUF:'Buffalo Sabres',CAR:'Carolina Hurricanes',CBJ:'Columbus Blue Jackets',CGY:'Calgary Flames',CHI:'Chicago Blackhawks',COL:'Colorado Avalanche',DAL:'Dallas Stars',DET:'Detroit Red Wings',EDM:'Edmonton Oilers',FLA:'Florida Panthers',LAK:'Los Angeles Kings',MIN:'Minnesota Wild',MTL:'Montréal Canadiens',NJD:'New Jersey Devils',NSH:'Nashville Predators',NYI:'New York Islanders',NYR:'New York Rangers',OTT:'Ottawa Senators',PHI:'Philadelphia Flyers',PIT:'Pittsburgh Penguins',SEA:'Seattle Kraken',SJS:'San Jose Sharks',STL:'St. Louis Blues',TBL:'Tampa Bay Lightning',TOR:'Toronto Maple Leafs',UTA:'Utah Mammoth',VAN:'Vancouver Canucks',VGK:'Vegas Golden Knights',WPG:'Winnipeg Jets',WSH:'Washington Capitals'}
const normalizeName=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'')
const names=new Map(Object.entries(teamNames).map(([team,name])=>[normalizeName(name),team]));names.set(normalizeName('Utah Hockey Club'),'UTA')
const finiteNumber=(value:unknown)=>((typeof value==='number'||typeof value==='string'&&value.trim()!=='')&&Number.isFinite(Number(value)))?Number(value):undefined
export function parseCoreTeam(row:any):CoreTeam{
 if(!row||typeof row!=='object')throw Error('NHL team summary contains a non-object row')
 const name=typeof row.teamFullName==='string'?row.teamFullName:typeof row.franchiseName==='string'?row.franchiseName:undefined,abbrev=typeof row.teamAbbrev==='string'?row.teamAbbrev:undefined
 const labels=[ids[Number(row.teamId)],name?names.get(normalizeName(name)):undefined,abbrev&&teamNames[abbrev]?abbrev:undefined].filter((v):v is string=>!!v)
 const identities=new Set(labels),available=Object.keys(row).join(', ')
 if(identities.size!==1)throw Error(`NHL team identity is ${identities.size?'conflicting':'unrecognized'} (teamId=${String(row.teamId)}, teamFullName/franchiseName=${String(name)}; fields: ${available})`)
 const team=labels[0],games=finiteNumber(row.gamesPlayed)
 if(games==null||!Number.isInteger(games)||games<1)throw Error(`${team}: invalid gamesPlayed (${String(row.gamesPlayed)})`)
 const rate=(field:string,total?:string)=>{let value=finiteNumber(row[field]);if(value==null&&total){const n=finiteNumber(row[total]);if(n!=null)value=n/games}if(value==null||value<0)throw Error(`${team}: missing or invalid ${field}; available fields: ${available}`);return value}
 const gf=rate('goalsForPerGame','goalsFor'),ga=rate('goalsAgainstPerGame','goalsAgainst'),sf=rate('shotsForPerGame'),sa=rate('shotsAgainstPerGame')
 const percentage=(field:string)=>{const value=rate(field);if(value>100)throw Error(`${team}: invalid ${field} (${value})`);return value<=1?value*100:value}
 return{team,games,gf,ga,sf,sa,pp:percentage('powerPlayPct'),pk:percentage('penaltyKillPct')}
}
export function parseCoreStats(payload:any,date:string):CoreFeed{
 if(!Array.isArray(payload?.data))throw Error('NHL team summary is missing its data array')
 const teams:CoreTeam[]=payload.data.map(parseCoreTeam)
 const seen=new Set(teams.map(t=>t.team)),missing=Object.keys(teamNames).filter(t=>!seen.has(t))
 if(teams.length!==32||seen.size!==32)throw Error(`Need a complete 32-team NHL summary; received ${teams.length} rows / ${seen.size} unique teams. Missing: ${missing.join(', ')||'none; check duplicate rows'}`)
 return {date,checkedAt:new Date().toISOString(),source:'NHL team summary · regular season · games before slate date',teams}
}
export function refreshCoreRating(base:Record<string,number>,team:string,feed:CoreFeed|undefined,league:Record<string,Record<string,number>>){
 const result={...base},own=feed?.teams.find(t=>t.team===team);if(!own||!feed)return result
 for(const [field,prefix,ascending] of [['gf','off_gf',false],['ga','def_ga',false],['sf','off_sf',false],['sa','def_sa',false],['pp','off_pp',false],['pk','def_pk',true]] as const){
  const rank=1+feed.teams.filter(t=>ascending?t[field]<own[field]:t[field]>own[field]).length
  // Keep the existing model's rank-to-points weights; only refresh input values/ranks.
  const bands=Object.values(league).map(r=>({rank:r[prefix+'_rank'],points:r[prefix+'_pts']})).filter(r=>Number.isFinite(r.rank)&&Number.isFinite(r.points)).sort((a,b)=>Math.abs(a.rank-rank)-Math.abs(b.rank-rank)||a.rank-b.rank)
  if(!bands.length)continue
  const points=bands[0].points,side=prefix.startsWith('off_')?'off_score':'def_score'
  result[side]+=points-base[prefix+'_pts'];result[field]=own[field];result[prefix+'_rank']=rank;result[prefix+'_pts']=points
 }
 return result
}
