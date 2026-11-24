#!/usr/bin/env node
// One-time import of a Combo Logger v0.1.0 export to the shared research Worker.
// Auth token is read from an environment variable, not written to Git or logs.
import {readFile} from 'node:fs/promises'
const [filepath,apiBase]=process.argv.slice(2)
if(!filepath||!apiBase||!process.env.RESEARCH_INGEST_TOKEN){
 console.error('Usage: RESEARCH_INGEST_TOKEN=<secret> node scripts/import-logger.mjs <combo-logger-export.json> <worker-url>')
 process.exitCode=2
}else{
 const data=JSON.parse(await readFile(filepath,'utf8'))
 if(!data||!Array.isArray(data.rows))throw Error('Expected Combo Logger v0.1.0 JSON with rows[]')
 const norm=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/gi,'').toLowerCase()
 const combos=[]
 for(const row of data.rows){
  const players=row?.combo?.players
  if(!Array.isArray(players)||players.length<2||players.length>3)continue
  const team=String(row.team||'').toUpperCase()
  const names=players.map(p=>String(p?.name||'')).filter(Boolean)
  if(names.length!==players.length)continue
  combos.push({
   id:[row.date,row.gameId,team,...names.map(norm).sort()].join(':'),
   date:row.date,gameId:String(row.gameId),team,opponent:row.opponent,
   matchup:team+' vs '+String(row.opponent||''),players:names,playerIds:players.map(p=>p.id),
   forwardLine:row.combo.fl,ppUnit:row.combo.pp,
   result:['HIT','MISS'].includes(row.result?.status)?row.result.status:'UNVERIFIED',
   odds:null,venue:row.context?.home===true?'HOME':row.context?.home===false?'AWAY':null,
   goalieGaa:row.context?.gaa??null,goalieDifferential:row.context?.goalieDifferential??null,context:row.context,
   snapshotAt:row.lineupObservedAt||row.at,source:'Combo Logger 0.1.0'
  })
 }
 const endpoint=new URL('/research/combos',apiBase).toString()
 let accepted=0,rejected=0
 for(let i=0;i<combos.length;i+=250){
  const response=await fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEARCH_INGEST_TOKEN,'content-type':'application/json'},body:JSON.stringify({combos:combos.slice(i,i+250)})})
  const body=await response.json().catch(()=>({}))
  if(!response.ok)throw Error('Research import failed at batch '+(Math.floor(i/250)+1)+' (HTTP '+response.status+'): '+String(body.error||'unknown'))
  accepted+=Number(body.accepted||0);rejected+=Number(body.rejected||0)
  console.log('Imported '+Math.min(i+250,combos.length)+' / '+combos.length+' rows')
 }
 console.log(JSON.stringify({sourceRows:data.rows.length,processed:combos.length,accepted,rejected,notice:'Existing research records are never overwritten by this importer.'},null,2))
}
