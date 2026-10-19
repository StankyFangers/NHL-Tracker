# NHL Tracker 1.7.6 — Confidence feature audit (source inspection)

Status: **Implementation present; end-to-end validation outstanding.** This document records observed code, not a release approval.

## Verified in source

- `src/renderer/src/confidenceOptimizer.ts` defines SKIP/FADE/NEUTRAL/BOOST cutoffs (60/65/85), 0×/0.5×/1×/1.5× unit multipliers, local opportunity persistence, and threshold optimization.
- `src/renderer/src/confidenceProfiles.ts` implements SAFE, BALANCED, AGGRESSIVE, and MAX_RETURN profiles; training and validation split by complete dates; net units, exposure, drawdown, losing streak, and missed SKIP profit.
- `src/renderer/src/confidencePerformance.ts` captures pregame team predictions, freezes each prediction ID, finalizes scores, links eligible wagers, and computes actual versus shadow net units.
- `src/renderer/src/App.tsx` imports and renders the Confidence Strategy Lab and trio-versus-split-duos reporting.

## Release blockers / verification still needed

1. **Source of eligible opportunities:** trace every producer of `nhlTrackerConfidenceOpportunities:v1`; confirm both placed and unplaced qualifying forward-line + PP combinations are recorded with real priced, settled outcomes. An optimizer cannot reliably grade missing or estimated-only prices.
2. **Profile validation:** test SAFE/BALANCED/AGGRESSIVE/MAX_RETURN on fixed historical fixtures, including insufficient samples, all-negative outcomes, and game/date boundary splits. MAX_RETURN must remain retrospective and non-applicable.
3. **Wager shadow P/L:** verify `wagerGrades` against the actual payout representation for each sportsbook, partial voids, and multi-leg bets. Confirm the shadow ledger never changes real daily P/L.
4. **Trio comparison:** inspect persistence of trio reference odds and the three linked pair wagers. Verify 1u trio versus 1.5u combined pairs and equal-exposure normalization, without fabricated prices.
5. **Persistence:** verify TEST and LIVE localStorage/cloud boundaries so historical predictions and optimizer profiles cannot cross account modes unexpectedly.
6. **Build:** execute manual validation workflow, then verify a real Windows 1.7.6 installer and core tracker/Bet Hub regressions.

## Safety boundary

No database write, production activation, migration, release, or merge is authorized by this audit.
