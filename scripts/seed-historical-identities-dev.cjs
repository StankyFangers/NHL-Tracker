#!/usr/bin/env node
'use strict'
// DEV-only, additive seed. No historical wager writes.
const { Pool } = require('pg')
const hosts = ['ep-twilight-term-b4fxjrkm.c-6.us-east-2.aws.neon.tech','ep-twilight-term-b4fxjrkm-pooler.c-6.us-east-2.aws.neon.tech']
const norm = s => String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'')
function checkedUrl() {
  const raw=process.env.NHL_DEV_REGISTRY_DATABASE_URL
  if (!raw) throw Error('NHL_DEV_REGISTRY_DATABASE_URL missing')
  const u=new URL(raw)
  if (!['postgres:','postgresql:'].includes(u.protocol) || !hosts.includes(u.hostname.toLowerCase()) || u.pathname!=='/neondb' || decodeURIComponent(u.username)!=='nhl_tracker_registry_writer') throw Error('SAFETY LOCK: approved DEV registry writer only')
  return raw
}
async function main() {
  console.log('Plan: add Nick Lardis NHL ID 8484185, and reviewed JT Miller alias for 8476468')
  if (process.env.NHL_REGISTRY_APPLY !== 'YES_DEV_ONLY') { console.log('DRY RUN: no database connection or writes'); return }
  const pool=new Pool({connectionString:checkedUrl(),ssl:{rejectUnauthorized:true},max:1,connectionTimeoutMillis:7000})
  let c, began=false
  try {
    c=await pool.connect()
    await c.query('BEGIN'); began=true
    await c.query("SET LOCAL statement_timeout = '30s'")
    const r=await c.query('SELECT nhl_player_id,official_name FROM public.nhl_players WHERE nhl_player_id = ANY($1::bigint[])',[[8484185,8476468]])
    const ids=new Map(r.rows.map(x=>[Number(x.nhl_player_id),x.official_name]))
    if (!ids.has(8476468) || norm(ids.get(8476468))!==norm('J.T. Miller')) throw Error('Canonical J.T. Miller identity missing or unexpected')
    if (ids.has(8484185) && norm(ids.get(8484185))!==norm('Nick Lardis')) throw Error('Nick Lardis ID conflicts with existing player')
    await c.query(`INSERT INTO public.nhl_players (nhl_player_id,official_name,current_team_abbr,position_code,active,source,last_verified_at)
      VALUES (8484185,'Nick Lardis','CHI','R',FALSE,'historical',now()) ON CONFLICT (nhl_player_id) DO NOTHING`)
    for (const [id,alias] of [[8484185,'Nick Lardis'],[8476468,'JT Miller']]) {
      await c.query(`INSERT INTO public.nhl_player_aliases (nhl_player_id,alias,normalized_alias,source)
        VALUES ($1,$2,$3,'historical-reviewed') ON CONFLICT (nhl_player_id,normalized_alias) DO NOTHING`,[id,alias,alias.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()])
    }
    await c.query('COMMIT'); began=false
    console.log('DEV historical identity seed committed; no wagers modified.')
  } catch(e) { if(began) await c.query('ROLLBACK'); throw e }
  finally { if(c) c.release(); await pool.end() }
}
main().catch(e=>{console.error('Seed failed:',e.message);process.exitCode=1})
