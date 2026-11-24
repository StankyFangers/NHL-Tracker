export type ResearchCombo = {
  id:string; date:string; gameId:string; team:string; opponent?:string; matchup?:string;
  players:string[]; playerIds?:number[]|null; forwardLine:number|null; ppUnit:number|null; odds:number|null;
  result:'HIT'|'MISS'|'UNVERIFIED'; venue?:'HOME'|'AWAY'|null; goalieGaa?:number|null;
  goalieDifferential?:number|null; snapshotAt?:string; source?:string;
  context?:Record<string,number|boolean|null>
}
export const RESEARCH_PROFILES = ['300','350','400','450','500','550','600'] as const
export type ResearchProfile = typeof RESEARCH_PROFILES[number]
export type ResearchClass = 'PP1_DUO_LOW'|'PP1_DUO_101_150'|'PP1_DUO_151_200'|'PP1_DUO_HIGH'|'PP1_TRIO_LOW'|'PP1_TRIO_101_200'|'PP1_TRIO_HIGH'|'PP2_DUO_LOW'|'PP2_DUO_FL2_HIGH'|'PP2_DUO_OTHER_HIGH'|'PP2_TRIO'|'UNKNOWN'
export const RULES: Record<ResearchClass, Record<ResearchProfile,number>> = {
 PP1_DUO_LOW:{'300':0,'350':0,'400':0,'450':0,'500':0,'550':0,'600':0},
 PP1_DUO_101_150:{'300':0.5,'350':.5,'400':1,'450':1.25,'500':1.5,'550':1.5,'600':1.5},
 PP1_DUO_151_200:{'300':0.5,'350':.5,'400':.5,'450':.5,'500':.5,'550':.5,'600':.75},
 PP1_DUO_HIGH:{'300':0.5,'350':1.5,'400':1.25,'450':1.5,'500':1.5,'550':1.5,'600':1.5},
 PP1_TRIO_LOW:{'300':0,'350':0,'400':0,'450':0,'500':0,'550':0,'600':0},
 PP1_TRIO_101_200:{'300':1.5,'350':1.5,'400':1.5,'450':1.5,'500':1.5,'550':1.5,'600':1.5},
 PP1_TRIO_HIGH:{'300':0.5,'350':.5,'400':.5,'450':.5,'500':.5,'550':.5,'600':.5},
 PP2_DUO_LOW:{'300':0.5,'350':.5,'400':.5,'450':.5,'500':.5,'550':1,'600':1.5},
 PP2_DUO_FL2_HIGH:{'300':1.5,'350':1.5,'400':1.5,'450':1.5,'500':1.5,'550':1.5,'600':1.5},
 PP2_DUO_OTHER_HIGH:{'300':0.5,'350':.5,'400':.5,'450':.75,'500':1,'550':1.5,'600':1.5},
 PP2_TRIO:{'300':0,'350':0,'400':0,'450':0,'500':0,'550':0,'600':0},
 UNKNOWN:{'300':0,'350':0,'400':0,'450':0,'500':0,'550':0,'600':0}
}
export const RULE_NAMES: {key:ResearchClass; title:string; odds:string}[] = [
 {key:'PP1_DUO_LOW',title:'PP1 duo',odds:'+100 or shorter'},
 {key:'PP1_DUO_101_150',title:'PP1 duo',odds:'+101 to +150'},
 {key:'PP1_DUO_151_200',title:'PP1 duo',odds:'+151 to +200'},
 {key:'PP1_DUO_HIGH',title:'PP1 duo',odds:'Above +200'},
 {key:'PP1_TRIO_LOW',title:'PP1 trio',odds:'+100 or shorter'},
 {key:'PP1_TRIO_101_200',title:'PP1 trio',odds:'+101 to +200'},
 {key:'PP1_TRIO_HIGH',title:'PP1 trio',odds:'Above +200'},
 {key:'PP2_DUO_LOW',title:'PP2 duo',odds:'+300 or shorter'},
 {key:'PP2_DUO_FL2_HIGH',title:'PP2 duo · FL2',odds:'Above +300'},
 {key:'PP2_DUO_OTHER_HIGH',title:'PP2 duo · other FL',odds:'Above +300'},
 {key:'PP2_TRIO',title:'PP2 trio',odds:'All odds'}
]
export function classifyResearch(row:ResearchCombo):ResearchClass {
 if(row.ppUnit===2 && row.players.length===3)return 'PP2_TRIO'
 if(row.odds===null || !Number.isFinite(row.odds))return 'UNKNOWN'
 // American prices: negative odds are always shorter than +100.
 const o=row.odds
 if(row.ppUnit===1 && row.players.length===2)return o<=100?'PP1_DUO_LOW':o<=150?'PP1_DUO_101_150':o<=200?'PP1_DUO_151_200':'PP1_DUO_HIGH'
 if(row.ppUnit===1 && row.players.length===3)return o<=100?'PP1_TRIO_LOW':o<=200?'PP1_TRIO_101_200':'PP1_TRIO_HIGH'
 if(row.ppUnit===2 && row.players.length===2)return o<=300?'PP2_DUO_LOW':row.forwardLine===2?'PP2_DUO_FL2_HIGH':'PP2_DUO_OTHER_HIGH'
 return 'UNKNOWN'
}
export function netAtOneUnit(row:ResearchCombo):number|null {
 if(row.odds===null||Math.abs(row.odds)<100)return null
 if(row.result==='MISS')return -1
 if(row.result!=='HIT')return null
 return row.odds>0?row.odds/100:100/Math.abs(row.odds)
}
export function analyzeProfile(rows:ResearchCombo[],profile:ResearchProfile) {
 let exposure=0,net=0,placed=0,skipped=0,unpriced=0,wins=0,losses=0
 const day=new Map<string,number>()
 for(const row of rows){
  const stake=RULES[classifyResearch(row)][profile]
  if(!stake){skipped++;continue}
  const unitNet=netAtOneUnit(row)
  if(unitNet===null){unpriced++;continue}
  exposure+=stake;net+=stake*unitNet;placed++
  if(row.result==='HIT')wins++;else losses++
  day.set(row.date,(day.get(row.date)||0)+stake*unitNet)
 }
 let peak=0,run=0,drawdown=0
 for(const date of [...day.keys()].sort()){run+=day.get(date)!;peak=Math.max(peak,run);drawdown=Math.max(drawdown,peak-run)}
 return {exposure,net,roi:exposure?net/exposure*100:0,placed,skipped,unpriced,wins,losses,drawdown}
}
export function validResearchCombo(input:unknown):ResearchCombo|null {
 if(!input||typeof input!=='object')return null
 const x=input as Record<string,unknown>
 const players=Array.isArray(x.players)?x.players.filter((v):v is string=>typeof v==='string'&&v.trim().length>0):[]
 const date=String(x.date||'');const team=String(x.team||'').toUpperCase()
 if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)||!/^([A-Z]{2,3})$/.test(team)||players.length<2||players.length>3)return null
 const num=(v:unknown)=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null
 const pp=num(x.ppUnit),fl=num(x.forwardLine),odds=num(x.odds)
 const status=['HIT','MISS','UNVERIFIED'].includes(String(x.result))?String(x.result) as ResearchCombo['result']:'UNVERIFIED'
 return {id:String(x.id||[date,String(x.gameId||''),team,...players.map(p=>p.toLowerCase()).sort()].join(':')),date,gameId:String(x.gameId||''),team,players,
  playerIds:Array.isArray(x.playerIds)&&x.playerIds.length===players.length&&x.playerIds.every((v:unknown)=>Number.isInteger(Number(v))&&Number(v)>0)?x.playerIds.map(Number):null,
  ppUnit:pp,forwardLine:fl,odds:odds===null||Math.abs(odds)<100?null:odds,result:status,
  matchup:String(x.matchup||''),opponent:String(x.opponent||''),venue:x.venue==='HOME'||x.venue==='AWAY'?x.venue:null,
  goalieGaa:num(x.goalieGaa),goalieDifferential:num(x.goalieDifferential),snapshotAt:String(x.snapshotAt||''),source:String(x.source||''),
  context:typeof x.context==='object'&&x.context!==null?Object.fromEntries(['goalsForPerGame','powerPlayPct','opponentGoalsAllowedPerGame','opponentXGAllowedPerGame','opponentPKPct','restDays','opponentRestDays','backToBack'].map(key=>[key,key==='backToBack'?(x.context as any)[key]===true:num((x.context as any)[key])])):{}}
}
export function parseResearchImport(data:unknown):{rows:ResearchCombo[];invalid:number}{
 const payload=data as any
 const raw=Array.isArray(payload)?payload:Array.isArray(payload?.combos)?payload.combos:Array.isArray(payload?.rows)?payload.rows:null
 if(!raw)throw new Error('Expected an array of research combos, or an object containing combos or rows. No data imported.')
 const rows:ResearchCombo[]=[];let invalid=0
 for(const entry of raw){
  const e=entry as any
  // Native Combo Logger v0.1.0 export: each graded row contains a 'combo' with player IDs,
  // FL / PP assignments and a separate result object. This export DOES NOT contain odds.
  const native=e?.combo&&Array.isArray(e.combo.players)
  const candidate=native?{
   id:[e.date,e.gameId,e.team,e.combo.signature||e.combo.players.map((p:any)=>p.id).sort().join('-')].join(':'),
   date:e.date,gameId:e.gameId,team:e.team,opponent:e.opponent,
   matchup:e.team+' vs '+e.opponent,
   players:e.combo.players.map((p:any)=>p.name),
   playerIds:e.combo.players.map((p:any)=>p.id),
   ppUnit:e.combo.pp,forwardLine:e.combo.fl,
   odds:null,
   result:e.result?.status==='HIT'||e.result?.status==='MISS'?e.result.status:'UNVERIFIED',
   venue:e.context?.home===true?'HOME':e.context?.home===false?'AWAY':null,
   goalieGaa:e.context?.gaa,goalieDifferential:e.context?.goalieDifferential,context:e.context,
   snapshotAt:e.lineupObservedAt||e.at,source:'Combo Logger 0.1.0'
  }:entry
  const r=validResearchCombo(candidate)
  if(r)rows.push(r);else invalid++
 }
 return {rows,invalid}
}
