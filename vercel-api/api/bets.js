'use strict'
const { getPool, reply, withAuth } = require('../lib/security')
module.exports = async (req, res) => withAuth(req, res, async () => {
  const parsed = new URL(req.url, 'https://localhost')
  const limitRaw = parsed.searchParams.get('limit') || '25'
  const offsetRaw = parsed.searchParams.get('offset') || '0'
  if (!/^\d{1,3}$/.test(limitRaw) || !/^\d{1,6}$/.test(offsetRaw)) return reply(res, 400, { error: 'Invalid pagination' })
  const limit = Number(limitRaw), offset = Number(offsetRaw)
  if (limit < 1 || limit > 100 || offset > 100000) return reply(res, 400, { error: 'Pagination out of range' })
  const result = await getPool().query(`
    SELECT b.id, b.legacy_bet_id, b.bet_date, b.sportsbook, b.stake_units,
      b.unit_value_at_placement, b.american_odds, b.total_return_units,
      b.status, b.settled_return_units, b.original_placed_at, b.original_settled_at,
      b.category, b.group_key,
      coalesce((SELECT jsonb_agg(jsonb_build_object(
        'leg_order',l.leg_order,'leg_type',l.leg_type,'player_id',l.player_id,
        'player_name',l.player_name,'team_abbr',l.team_abbr,'game_id',l.game_id,
        'stat_type',l.stat_type,'target_value',l.target_value,'status',l.status)
        ORDER BY l.leg_order) FROM public.bet_legs l WHERE l.bet_id=b.id), '[]'::jsonb) AS legs
    FROM public.bets b JOIN public.user_profiles u ON u.id=b.user_id
    WHERE u.username='stankyfangers' AND b.source_system='localStorage'
    ORDER BY b.bet_date DESC, b.original_placed_at DESC NULLS LAST, b.id
    LIMIT $1 OFFSET $2`, [limit, offset])
  return reply(res, 200, { environment: 'development', readOnly: true, limit, offset, bets: result.rows })
})
