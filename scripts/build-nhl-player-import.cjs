'use strict'
// Generates a reviewable SQL import; it NEVER connects to Neon.
const fs = require('node:fs')
const path = require('node:path')
const TEAMS = 'ANA BOS BUF CAR CBJ CGY CHI COL DAL DET EDM FLA LAK MIN MTL NJD NSH NYI NYR OTT PHI PIT SEA SJS STL TBL TOR UTA VAN VGK WPG WSH'.split(' ')
const OUT = path.resolve(process.cwd(), 'nhl-player-import-dev.sql')
const sqlQuote = (s) => `'${String(s).replace(/'/g, "''")}'`
const normalize = (s) => String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
const display = (v) => typeof v === 'string' ? v : (v && (v.default || v.en || Object.values(v)[0])) || ''
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
async function getRoster(team) {
  const url = `https://api-web.nhle.com/v1/roster/${team}/current`
  let error
  for (let attempt=1; attempt<=3; attempt++) {
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'NHLTrackerDEV-PlayerRegistry/1.7.6' }, signal: AbortSignal.timeout(12000) })
      if (!response.ok) throw new Error(`${team}: HTTP ${response.status}`)
      const data = await response.json()
      if (!data || !Array.isArray(data.forwards) || !Array.isArray(data.defensemen) || !Array.isArray(data.goalies)) throw new Error(`${team}: unexpected roster format`)
      return [...data.forwards, ...data.defensemen, ...data.goalies]
    } catch (e) { error=e; if (attempt<3) await delay(800*attempt) }
  }
  throw error
}
async function main() {
  const players = new Map(), memberships = new Set()
  for (const team of TEAMS) {
    const roster = await getRoster(team)
    let valid=0
    for (const p of roster) {
      const id = Number(p.id)
      const first = display(p.firstName).trim(), last = display(p.lastName).trim()
      if (!Number.isSafeInteger(id) || id<=0 || !first || !last) throw new Error(`${team}: invalid player ID/name; aborting without writing SQL`)
      const name = `${first} ${last}`
      const position = String(p.positionCode || '').toUpperCase()
      if (!['C','L','R','D','G','LW','RW'].includes(position)) throw new Error(`${team}: unknown position for ${id}: ${position}`)
      const previous = players.get(id)
      if (previous && previous.name !== name) throw new Error(`Conflicting name for player ID ${id}: ${previous.name} / ${name}`)
      players.set(id, {id, name, team, position})
      memberships.add(`${id}|${team}`)
      valid++
    }
    console.log(`${team}: ${valid} players`)
  }
  if (players.size < 500) throw new Error(`Only ${players.size} distinct players; refusing incomplete import`)
  const entries = [...players.values()].sort((a,b)=>a.id-b.id)
  const sql = [
    '-- NHL Tracker v1.7.6 — Generated NHL Player Registry import',
    '-- DEVELOPMENT BRANCH ONLY. Review source and destination before running.',
    `-- Generated: ${new Date().toISOString()} | ${entries.length} distinct player IDs`,
    '-- Uses canonical NHL IDs. Never deletes players or historical wagers.',
    'BEGIN;',
    'SET LOCAL statement_timeout = \'60s\';'
  ]
  for (const p of entries) {
    sql.push(`INSERT INTO public.nhl_players (nhl_player_id, official_name, current_team_abbr, position_code, active, source, last_verified_at) VALUES (${p.id}, ${sqlQuote(p.name)}, ${sqlQuote(p.team)}, ${sqlQuote(p.position)}, TRUE, 'nhl', now()) ON CONFLICT (nhl_player_id) DO UPDATE SET official_name=EXCLUDED.official_name, current_team_abbr=EXCLUDED.current_team_abbr, position_code=EXCLUDED.position_code, active=TRUE, source='nhl', last_verified_at=now(), updated_at=now();`)
    const aliases = new Set([p.name, normalize(p.name)])
    for (const alias of aliases) {
      const normalized = normalize(alias)
      if (normalized) sql.push(`INSERT INTO public.nhl_player_aliases (nhl_player_id, alias, normalized_alias, source) VALUES (${p.id}, ${sqlQuote(alias)}, ${sqlQuote(normalized)}, 'nhl') ON CONFLICT (nhl_player_id, normalized_alias) DO NOTHING;`)
    }
  }
  for (const key of [...memberships].sort()) {
    const [id, team] = key.split('|')
    sql.push(`INSERT INTO public.nhl_player_team_history (nhl_player_id, team_abbr) VALUES (${id}, ${sqlQuote(team)}) ON CONFLICT (nhl_player_id, team_abbr) DO UPDATE SET last_seen_at=now();`)
  }
  sql.push('COMMIT;', '')
  fs.writeFileSync(OUT, sql.join('\n'), {flag:'w',mode:0o600})
  console.log(`\nGenerated ${OUT}\n${entries.length} distinct player IDs. REVIEW SQL before running in Neon DEV.`)
}
main().catch((e) => { console.error(`IMPORT NOT GENERATED: ${e.message}`); process.exitCode=1 })
