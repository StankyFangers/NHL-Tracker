'use strict'
const { getPool, reply, withAuth } = require('../lib/security')
module.exports = async (req, res) => withAuth(req, res, async () => {
  const result = await getPool().query(`
    SELECT count(*)::integer AS bets,
      count(*) FILTER (WHERE b.status='WON')::integer AS won,
      count(*) FILTER (WHERE b.status='LOST')::integer AS lost,
      coalesce(sum(b.stake_units * b.unit_value_at_placement),0)::numeric(14,2)::text AS staked_usd,
      coalesce(sum(b.settled_return_units * b.unit_value_at_placement),0)::numeric(14,2)::text AS returned_usd,
      coalesce(sum((b.settled_return_units-b.stake_units) * b.unit_value_at_placement),0)::numeric(14,2)::text AS net_usd,
      (SELECT count(*)::integer FROM public.bet_legs l JOIN public.bets bl ON bl.id=l.bet_id
        WHERE bl.user_id=u.id AND bl.source_system='localStorage') AS legs,
      (SELECT count(*)::integer FROM public.bet_settlements s JOIN public.bets bs ON bs.id=s.bet_id
        WHERE bs.user_id=u.id AND bs.source_system='localStorage') AS settlements
    FROM public.user_profiles u
    LEFT JOIN public.bets b ON b.user_id=u.id AND b.source_system='localStorage'
    WHERE u.username='stankyfangers'
    GROUP BY u.id`)
  return reply(res, 200, { environment: 'development', readOnly: true, summary: result.rows[0] || null })
})
