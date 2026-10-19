'use strict'
// LIVE database is intentionally disabled until independently provisioned.
// This module must never fall back to DEV DATABASE_URL or DEV authentication.
const { Pool } = require('pg')
let pool
function getLivePool() {
  if (process.env.NHL_LIVE_CLOUD_ENABLED !== 'YES_PRODUCTION_APPROVED') throw new Error('LIVE cloud is not activated')
  const raw = process.env.NHL_LIVE_DATABASE_URL
  const expectedHost = process.env.NHL_LIVE_APPROVED_HOST
  const expectedDatabase = process.env.NHL_LIVE_APPROVED_DATABASE
  const expectedRole = process.env.NHL_LIVE_APPROVED_ROLE
  if (!raw || !expectedHost || !expectedDatabase || !expectedRole) throw new Error('LIVE database configuration incomplete')
  let url
  try { url = new URL(raw) } catch { throw new Error('LIVE database URL invalid') }
  const host = url.hostname.toLowerCase()
  const role = decodeURIComponent(url.username)
  const database = decodeURIComponent(url.pathname.slice(1))
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || host !== expectedHost.toLowerCase() || database !== expectedDatabase || role !== expectedRole) throw new Error('LIVE database safety lock failed')
  if (!host.endsWith('.neon.tech') || host.startsWith('ep-twilight-term-b4fxjrkm.') || host.startsWith('ep-twilight-term-b4fxjrkm-pooler.')) throw new Error('LIVE database must be distinct from DEVELOPMENT')
  if (url.searchParams.has('sslmode') && !['require','verify-full'].includes(url.searchParams.get('sslmode'))) throw new Error('LIVE database TLS configuration invalid')
  if (process.env.NHL_LIVE_PROVISIONING_VERIFIED !== 'YES_BACKUP_AND_GRANTS_VERIFIED') throw new Error('LIVE provisioning not verified')
  if (!pool) pool = new Pool({connectionString:raw,ssl:{rejectUnauthorized:true},max:2,connectionTimeoutMillis:5000,query_timeout:7000})
  return pool
}
module.exports = {getLivePool}
