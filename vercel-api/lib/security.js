'use strict'
const { timingSafeEqual } = require('node:crypto')
const { Pool } = require('pg')

// Intentionally pinned to the confirmed Neon DEVELOPMENT endpoint.
const DEVELOPMENT_ENDPOINT = 'ep-twilight-term-b4fxjrkm'
let pool

function getPool() {
  const raw = process.env.DATABASE_URL
  if (!raw) throw new Error('DATABASE_URL is not configured')
  let url
  try { url = new URL(raw) } catch { throw new Error('Invalid DATABASE_URL') }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Invalid database protocol')
  const host = url.hostname.toLowerCase()
  const valid = host === `${DEVELOPMENT_ENDPOINT}.c-6.us-east-2.aws.neon.tech` ||
    host === `${DEVELOPMENT_ENDPOINT}-pooler.c-6.us-east-2.aws.neon.tech`
  if (!valid) throw new Error('Database safety lock: hostname is not the approved Neon DEVELOPMENT endpoint')
  if (url.pathname !== '/neondb') throw new Error('Database safety lock: unexpected database')
  if (!pool) pool = new Pool({ connectionString: raw, ssl: { rejectUnauthorized: true }, max: 2,
    connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000,
    options: '-c default_transaction_read_only=on -c statement_timeout=7000' })
  return pool
}
function authorized(req) {
  const expected = process.env.NHL_READ_TOKEN
  if (!expected || expected.length < 32) return false
  const match = /^Bearer (\S+)$/i.exec(String(req.headers.authorization || ''))
  if (!match) return false
  const a = Buffer.from(match[1]), b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
function reply(res, status, body) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.status(status).end(JSON.stringify(body))
}
async function withAuth(req, res, callback) {
  if (req.method !== 'GET') return reply(res, 405, { error: 'Method not allowed' })
  if (!authorized(req)) return reply(res, 401, { error: 'Unauthorized' })
  try { return await callback() } catch (error) {
    console.error('Read-only API failure:', error.message)
    return reply(res, 503, { error: 'History service unavailable' })
  }
}
module.exports = { getPool, reply, withAuth }
