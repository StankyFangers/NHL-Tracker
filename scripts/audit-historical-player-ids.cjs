#!/usr/bin/env node
'use strict'
// NHL Tracker Phase 3A: read-only historical bet identity audit.
// Uses the authenticated DEV API. Does not connect to Neon directly or modify any bets.
const fs = require('node:fs')
const path = require('node:path')
const API = 'https://nhl-tracker-vercel-api.vercel.app'
const token = process.env.NHL_READ_TOKEN
if (!token || token.length < 32) {
  console.error('Missing NHL_READ_TOKEN. Supply it as an environment variable; never paste it into chat.')
  process.exit(1)
}
const normalize = s => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/ß/g,'ss').replace(/æ/g,'ae').replace(/œ/g,'oe')
  .replace(/[^a-z0-9]/g,'')
const safeText = s => String(s ?? '').replace(/^[=+\-@\t\r]/, "'$&")
const csv = s => '"' + safeText(s).replace(/"/g,'""') + '"'
const reviewedAliases = new Map([['jtmiller', '8476468']])
const outDir = path.resolve(process.cwd(), 'reports', 'player-identity-audit')
async function get(endpoint) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20000)
  try {
    const response = await fetch(API + endpoint, {
      headers: { Authorization: `Bearer ${token}`, Accept:'application/json' },
      redirect: 'error', signal: controller.signal
    })
    if (!response.ok) throw new Error(`${endpoint}: HTTP ${response.status}`)
    const payload = await response.json()
    if (payload.environment !== 'development' || payload.readOnly !== true)
      throw new Error(`${endpoint}: environment/read-only validation failed`)
    return payload
  } finally { clearTimeout(timeout) }
}
async function main() {
  console.log('Fetching DEV registry...')
  const registry = await get('/api/players')
  if (!Array.isArray(registry.players) || registry.players.length < 700 ||
      registry.count !== registry.players.length) throw new Error('Registry incomplete or malformed')
  const players = registry.players
  const byId = new Map()
  const byName = new Map()
  for (const p of players) {
    const id = String(p.id)
    if (!/^\d+$/.test(id) || !p.name) throw new Error('Malformed player in registry')
    byId.set(id, p)
    const key = normalize(p.name)
    const list = byName.get(key) || []
    list.push(p)
    byName.set(key, list)
  }
  console.log(`Registry players: ${players.length}. Fetching historical wagers...`)
  const bets = []
  for (let offset=0; offset<=100000; offset+=100) {
    const payload = await get(`/api/bets?limit=100&offset=${offset}`)
    if (!Array.isArray(payload.bets)) throw new Error('Invalid bets response')
    bets.push(...payload.bets)
    console.log(`  ${bets.length} wagers received`)
    if (payload.bets.length < 100) break
    if (offset === 100000) throw new Error('Pagination safety limit reached')
  }
  const uniqueBets = new Set(bets.map(b=>String(b.id)))
  if (uniqueBets.size !== bets.length) throw new Error('Duplicate bet IDs across pages')
  const rows = []
  const counts = {}
  const bump = key => { counts[key] = (counts[key] || 0) + 1 }
  for (const b of bets) {
    if (!Array.isArray(b.legs)) throw new Error(`Malformed legs in bet ${b.id}`)
    for (const l of b.legs) {
      const type = String(l.leg_type || '')
      const name = String(l.player_name || '')
      const id = l.player_id == null ? '' : String(l.player_id)
      const team = String(l.team_abbr || '').toUpperCase()
      let status, candidate = null, note = ''
      if (!name && !id) {
        status = 'NON_PLAYER_LEG'
        note = `Leg type: ${type || 'unspecified'}`
      } else if (id) {
        candidate = byId.get(id) || null
        if (!candidate) {
          status = 'ID_NOT_IN_CURRENT_REGISTRY'
          note = 'Historical/retired player or invalid ID; requires separate NHL ID verification'
        } else if (name && normalize(name) !== normalize(candidate.name)) {
          status = 'ID_NAME_MISMATCH'
          note = 'Existing ID resolves to a different current official name; manual review'
        } else {
          status = 'VERIFIED_ID'
          note = 'Existing NHL ID found in DEV registry'
        }
      } else {
        const matches = byName.get(normalize(name)) || []
        const reviewedId = reviewedAliases.get(normalize(name))
        const reviewedPlayer = reviewedId ? byId.get(reviewedId) : null
        if (reviewedPlayer && normalize(reviewedPlayer.name) === normalize('J.T. Miller')) {
          candidate = reviewedPlayer
          status = 'VERIFIED_REVIEWED_ALIAS'
          note = 'Reviewed alias maps to canonical NHL ID; wager remains unchanged'
        } else if (!matches.length) {
          status = 'NAME_NOT_IN_CURRENT_REGISTRY'
          note = 'Could be historical player or alias; do not guess an ID'
        } else if (matches.length > 1) {
          status = 'AMBIGUOUS_NAME'
          note = 'More than one NHL ID has the same normalized name'
        } else {
          candidate = matches[0]
          const teams = new Set([candidate.team, ...(candidate.teams || [])].filter(Boolean).map(x=>String(x).toUpperCase()))
          if (team && teams.size && !teams.has(team)) {
            status = 'NAME_MATCH_TEAM_CONFLICT'
            note = 'Name matches but team not observed in current registry; verify historical team'
          } else {
            status = 'NAME_MATCH_CANDIDATE'
            note = 'Candidate only; historical wager has not been changed'
          }
        }
      }
      bump(status)
      rows.push({
        bet_id:String(b.id), legacy_bet_id:String(b.legacy_bet_id ?? ''),
        bet_date:String(b.bet_date ?? ''), leg_order:String(l.leg_order ?? ''),
        leg_type:type, player_name:name, existing_player_id:id, team_abbr:team,
        status, candidate_player_id:candidate ? String(candidate.id) : '',
        candidate_official_name:candidate ? candidate.name : '', note
      })
    }
  }
  const summary = {
    generated_at:new Date().toISOString(), environment:'development', read_only:true,
    registry_players:players.length, historical_bets:bets.length, legs:rows.length,
    status_counts:counts,
    explanation:'No wagers or database records were modified. NAME_MATCH_CANDIDATE is not an approved automatic correction. Current rosters do not cover all historical NHL players.'
  }
  fs.mkdirSync(outDir,{recursive:true})
  fs.writeFileSync(path.join(outDir,'summary.json'), JSON.stringify(summary,null,2)+'\n')
  const cols = ['bet_id','legacy_bet_id','bet_date','leg_order','leg_type','player_name',
    'existing_player_id','team_abbr','status','candidate_player_id','candidate_official_name','note']
  fs.writeFileSync(path.join(outDir,'leg-audit.csv'),
    cols.map(csv).join(',')+'\n'+rows.map(r=>cols.map(c=>csv(r[c])).join(',')).join('\n')+'\n')
  const unresolved = rows.filter(r=>!['VERIFIED_ID','VERIFIED_REVIEWED_ALIAS','NON_PLAYER_LEG'].includes(r.status))
  fs.writeFileSync(path.join(outDir,'needs-review.csv'),
    cols.map(csv).join(',')+'\n'+unresolved.map(r=>cols.map(c=>csv(r[c])).join(',')).join('\n')+'\n')
  console.log('\nAUDIT COMPLETE — READ ONLY')
  console.log(JSON.stringify(summary,null,2))
  console.log(`\nReports saved in: ${outDir}`)
  console.log('Share summary.json or terminal summary first. Review CSVs for sensitive betting details before sharing.')
}
main().catch(e=>{ console.error('Audit failed:',e.message); process.exitCode=1 })
