'use strict'
const { reply } = require('../lib/security')
module.exports = (req, res) => {
  if (req.method !== 'GET') return reply(res, 405, { error: 'Method not allowed' })
  return reply(res, 200, { service: 'nhl-tracker-api', stage: 'read-only', status: 'ok' })
}
