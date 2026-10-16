'use strict'
const { readOnlyQuery, reply, withAuth } = require('../lib/security')

// Read-only, bounded snapshot of the canonical DEV player registry.
// No user information, wagers or credentials are returned.
module.exports = async (req, res) => withAuth(req, res, async () => {
  const result = await readOnlyQuery(`
    SELECT p.nhl_player_id::text AS id, p.official_name AS name,
      p.current_team_abbr AS team,
      COALESCE((SELECT jsonb_agg(DISTINCT h.team_abbr)
        FROM public.nhl_player_team_history h
        WHERE h.nhl_player_id = p.nhl_player_id), '[]'::jsonb) AS teams
    FROM public.nhl_players p
    ORDER BY p.nhl_player_id
    LIMIT 3000`)
  return reply(res, 200, {
    environment: 'development', readOnly: true,
    count: result.rows.length, players: result.rows
  })
})
