export async function importManualConfidence1021(){
 const date='2026-10-21',scores={PHI:61.3,OTT:69.5,FLA:70.5,BUF:79.3},key='nhlTrackerConfidenceScoreLog:v1';
 if(!window.nhlTracker?.score)throw Error('NHL schedule connection unavailable.');
 const slate=await window.nhlTracker.score(date),games=slate.games;
 if(!Array.isArray(games))throw Error('Schedule unavailable. No records changed.');
 const abbr=(t:any)=>typeof t?.abbrev==='string'?t.abbrev:t?.abbrev?.default;
 const raw=localStorage.getItem(key),rows=JSON.parse(raw||'[]');if(!Array.isArray(rows))throw Error('Invalid score log. No records changed.');
 const now=new Date().toISOString(),added:any[]=[];
 for(const [team,score] of Object.entries(scores)){
  const matches=games.filter((g:any)=>[abbr(g.awayTeam),abbr(g.homeTeam)].includes(team));if(matches.length!==1)throw Error('Could not uniquely match '+team+'. No records changed.');
  const g=matches[0],id=`${date}:${g.id}:${team}`,existing=rows.find((r:any)=>r.date===date&&String(r.gameId)===String(g.id)&&r.team===team);
  if(existing){if(existing.score!==score)throw Error(team+' already has a different score ('+existing.score+'). No records changed.');continue;}
  const away=abbr(g.awayTeam)===team,opponent=abbr(away?g.homeTeam:g.awayTeam),final=['OFF','FINAL'].includes(g.gameState),side=away?g.awayTeam:g.homeTeam;
  added.push({id,date,gameId:String(g.id),team,opponent,score,signal:score<67.5?'SKIP':score<72.5?'FADE':score>=85?'BOOST':'NEUTRAL',firstCapturedAt:now,capturedAt:now,modelAsOf:date,modelStatus:'MANUAL · user-reported original LIVE pregame score; original model version and capture time unavailable',olderInputs:false,source:'MANUAL_FROM_LIVE',inputs:{manual:true,reportedSource:'User provided original LIVE pregame scores',enteredAt:now,originalCapturedAt:null,originalModelVersion:null},...(final?{finalAt:now,goals:Number(side.score)}:{})});
 }
 if(added.length){const backup=key+':backup-manual-1021-'+Date.now();localStorage.setItem(backup,raw||'[]');localStorage.setItem(key,JSON.stringify([...rows,...added]));window.dispatchEvent(new Event('nhl-confidence-history'));}
 return added.length;
}
