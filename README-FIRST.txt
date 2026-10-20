NHL Tracker v1.7.6 — Phase 3A Historical Player Identity Audit

This is a READ-ONLY audit. It fetches the 787-player DEV registry and ALL paginated
historical bets from your existing authenticated Vercel DEV API, then creates local reports.

Does not:
- change wagers, original dates, odds, returns, or settlement
- modify Neon or production
- write the API token to disk
- assume current roster coverage includes retired/historical players

Install from /g/NHL-Tracker-1.7.6:
  tar -xzf ~/Downloads/NHL-Tracker-1.7.6-Phase3A-Historical-Identity-Audit.tar.gz

Run in Git Bash (enter your existing DEV API token silently):
  read -rsp 'DEV NHL_READ_TOKEN: ' NHL_READ_TOKEN; echo
  export NHL_READ_TOKEN
  node scripts/audit-historical-player-ids.cjs
  unset NHL_READ_TOKEN

Output (local only):
  reports/player-identity-audit/summary.json
  reports/player-identity-audit/leg-audit.csv
  reports/player-identity-audit/needs-review.csv

Share the terminal summary first; it contains counts, not personal bet details.

Status definitions:
  VERIFIED_ID: ID exists and name matches
  NAME_MATCH_CANDIDATE: missing ID; one normalized-name candidate (NOT applied)
  NAME_MATCH_TEAM_CONFLICT: missing ID; name matches but team not in registry
  ID_NAME_MISMATCH: ID exists but player name differs
  ID_NOT_IN_CURRENT_REGISTRY: ID absent from 787-player snapshot
  NAME_NOT_IN_CURRENT_REGISTRY: name absent from current snapshot
  AMBIGUOUS_NAME: normalized name resolves to multiple players
  NON_PLAYER_LEG: team-only/non-player leg

IMPORTANT: The API currently filters user_profiles.username='stankyfangers' and
source_system='localStorage'. This audit only sees bets returned by that endpoint.
If the API pagination changes, update the script after reviewing the endpoint.
