'use strict'
// Scheduled additive DEV-only roster synchronization. Never removes players or edits wagers.
const { Pool } = require('pg')
const TEAMS = 'ANA BOS BUF CAR CBJ CGY CHI COL DAL DET EDM FLA LAK MIN MTL NJD NSH NYI NYR OTT PHI PIT SEA SJS STL TBL TOR UTA VAN VGK WPG WSH'.split(' ')
const ENDPOINT = 'ep-twilight-term-b4fxjrkm'
const norm = s => String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ')
const display = v => typeof v === 'string' ? v : (v && (v.default || v.en || Object.values(v)[0])) || ''
const sleep = ms => new Promise(resolve => setTimeout(resolve,ms))
function checkedUrl() {
  const raw = process.env.NHL_DEV_REGISTRY_DATABASE_URL
  if (!raw) throw new Error('NHL_DEV_REGISTRY_DATABASE_URL missing')
  const u = new URL(raw)
  if (!['postgres:','postgresql:'].includes(u.protocol) ||
    ![`${ENDPOINT}.c-6.us-east-2.aws.neon.tech`, `${ENDPOINT}-pooler.c-6.us-east-2.aws.neon.tech`].includes(u.hostname.toLowerCase()) ||
    u.pathname !== '/neondb' ||
    decodeURIComponent(u.username) !== 'nhl_tracker_registry_writer') throw new Error('SAFETY LOCK: destination is not the approved Neon DEV endpoint')
  return raw
}
async function roster(team) {
  let error
  for (let attempt=1; attempt<=3; attempt++) {
    try {
      const r = await fetch(`https://api-web.nhle.com/v1/roster/${team}/current`, {
        headers:{Accept:'application/json','User-Agent':'NHLTracker-RegistrySync/1.7.6'},
        signal:AbortSignal.timeout(15000)
      })
      if (!r.ok) throw new Error(`${team}: HTTP ${r.status}`)
      const j = await r.json()
      if (!Array.isArray(j.forwards)||!Array.isArray(j.defensemen)||!Array.isArray(j.goalies)) throw new Error(`${team}: malformed roster`)
      return [...j.forwards,...j.defensemen,...j.goalies]
    } catch(e) { error=e; if(attempt<3) await sleep(1000*attempt) }
  }
  throw error
}
async function main() {
  const players = new Map(), teams = new Set()
  for (const team of TEAMS) {
    const entries = await roster(team)
    for (const p of entries) {
      const id=Number(p.id), name=`${display(p.firstName).trim()} ${display(p.lastName).trim()}`.trim(), pos=String(p.positionCode||'').toUpperCase()
      if (!Number.isSafeInteger(id)||id<=0||!name.includes(' ')||!['C','L','R','D','G','LW','RW'].includes(pos)) throw new Error(`${team}: invalid player identity; abort`)
      const prior=players.get(id)
      if (prior && prior.name!==name) throw new Error(`NHL ID ${id} has conflicting names; abort`)
      if (prior && prior.team!==team) throw new Error(`NHL ID ${id} is on two team rosters; abort`)
      players.set(id,{id,name,team,pos})
      teams.add(`${id}|${team}`)
    }
    console.log(`${team}: ${entries.length} roster players`)
  }
  if(players.size<500||teams.size<500) throw new Error(`Incomplete roster snapshot (${players.size}); abort`)
  const records=[...players.values()].sort((a,b)=>a.id-b.id)
  console.log(`Validated ${records.length} unique players across 32 teams`)
  if (process.env.NHL_REGISTRY_APPLY !== 'YES_DEV_ONLY') {
    console.log('DRY RUN: no database connection or writes. To apply, set NHL_REGISTRY_APPLY=YES_DEV_ONLY and DEV database URL.')
    return
  }
  const pool=new Pool({connectionString:checkedUrl(),ssl:{rejectUnauthorized:true},max:1,connectionTimeoutMillis:7000})
  let client, began=false
  try {
    client=await pool.connect()
    const identity=await client.query('SELECT current_user AS role, current_database() AS db')
    if (identity.rows[0].role !== 'nhl_tracker_registry_writer' || identity.rows[0].db !== 'neondb')
      throw new Error('SAFETY LOCK: connected database identity mismatch')
    await client.query('BEGIN'); began=true
    await client.query("SET LOCAL statement_timeout = '90s'")
    for(const p of records) {
      await client.query(`INSERT INTO public.nhl_players
        (nhl_player_id,official_name,current_team_abbr,position_code,active,source,last_verified_at)
        VALUES ($1,$2,$3,$4,TRUE,'nhl',now())
        ON CONFLICT (nhl_player_id) DO UPDATE SET official_name=EXCLUDED.official_name,
        current_team_abbr=EXCLUDED.current_team_abbr,position_code=EXCLUDED.position_code,
        active=TRUE,source='nhl',last_verified_at=now(),updated_at=now()`,[p.id,p.name,p.team,p.pos])
      await client.query(`INSERT INTO public.nhl_player_aliases (nhl_player_id,alias,normalized_alias,source)
        VALUES ($1,$2,$3,'nhl') ON CONFLICT (nhl_player_id,normalized_alias) DO NOTHING`,[p.id,p.name,norm(p.name)])
      await client.query(`INSERT INTO public.nhl_player_team_history (nhl_player_id,team_abbr)
        VALUES ($1,$2) ON CONFLICT (nhl_player_id,team_abbr) DO UPDATE SET last_seen_at=now()`,[p.id,p.team])
    }
    await client.query('COMMIT'); began=false
    console.log(`DEV sync committed: ${records.length} identities observed; zero deletes; zero wager changes.`)
  } catch(e) {if(began && client) await client.query('ROLLBACK'); throw e}
  finally {if(client) client.release();await pool.end()}
}
main().catch(e=>{console.error('DEV registry sync failed:',e.message);process.exitCode=1})
