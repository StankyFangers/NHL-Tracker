'use strict'
// LIVE connection is pinned to the existing production Neon endpoint and least-privilege role.
// Never fall back to DATABASE_URL or development authentication.
const { Pool } = require('pg')
const LIVE_EXPECTED_HOST = 'ep-young-rice-b4fxckhk.c-6.us-east-2.aws.neon.tech'
const LIVE_EXPECTED_DATABASE = 'neondb'
const LIVE_EXPECTED_ROLE = 'nhl_tracker_live_restricted'
let pool
function getLivePool() {
  if (process.env.NHL_LIVE_CLOUD_ENABLED !== 'YES_PRODUCTION_APPROVED') throw new Error('LIVE cloud is not activated')
  const raw = process.env.NHL_LIVE_DATABASE_URL
  if (!raw) throw new Error('LIVE database configuration incomplete')
  let url
  try { url = new URL(raw) } catch { throw new Error('LIVE database URL invalid') }
  const host = url.hostname.toLowerCase()
  let role, database
  try {
    role = decodeURIComponent(url.username)
    database = decodeURIComponent(url.pathname.slice(1))
  } catch { throw new Error('LIVE database URL invalid') }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      host !== LIVE_EXPECTED_HOST ||
      database !== LIVE_EXPECTED_DATABASE ||
      role !== LIVE_EXPECTED_ROLE) throw new Error('LIVE database safety lock failed')
  if (!['require', 'verify-full'].includes(url.searchParams.get('sslmode'))) throw new Error('LIVE database TLS configuration invalid')
  if (!pool) pool = new Pool({connectionString:raw,ssl:{rejectUnauthorized:true},max:2,connectionTimeoutMillis:5000,query_timeout:7000})
  return pool
}
module.exports = {getLivePool}
