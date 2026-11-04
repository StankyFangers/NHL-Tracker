# NHL Tracker Telegram Cloud (staging)

Cloudflare Worker + D1 for automatic NHL lineup confirmations and Telegram alerts.

## Updating an existing installation

```bash
cd "/g/NHL-Tracker-Current"
git pull --ff-only origin feature/telegram-notifications
cd telegram-cloud
npx wrangler d1 execute nhl-telegram-dev --remote --file=./schema.sql
npm test
npx wrangler deploy
```

The D1 schema uses `CREATE TABLE IF NOT EXISTS`; applying it to the existing database does not delete previously saved line statuses or delivery history. Existing Wrangler secrets and the Telegram webhook are preserved across deployments.

In the desktop app, sign in to the intended LIVE account (or TEST account under `npm run dev`), then go to **Settings → Phone Notification Setup → Setup**. Click **Connect Telegram**, open the deep link, press **Start** in the Telegram bot, and return to **Refresh Connection**. This link is one-time and expires in ten minutes. Set **Enable phone notifications**, choose options, and click **Save Notification Preferences to Cloud**. Verify **Send Test Notification**.

- All-team notifications use Daily Faceoff's scheduled monitor.
- Pending-wager-only delivery relies on the signed-in desktop app periodically uploading just the date and team abbreviations of pending NHL wagers; no wager prices, stakes or personal wager details go to Telegram. If the desktop has never synced a recent pending-team snapshot, pending-only alerts will not be delivered.
- Optional confirmed-lineup changes compare known forward lines, defensive pairs, PP1 and PP2. A complete valid lineup is required; a first observation sets the baseline without a false change alert.
- Progress **FOOTER** adds next-puck-drop counts to individual confirmation alerts. **SEPARATE** sends a separate update after newly observed progress.
- A separate **ALL LINES CONFIRMED** message is sent for an upcoming start-time group when all its teams are confirmed.
- No automatic polling or alert delivery before **10:00 AM Eastern**. Puck-drop-relative polling: 9 hours hourly, 7 hours every 30 minutes, 4 hours every 15 minutes, 1 hour every 5 minutes, final 15 minutes every minute. No automatic monitoring after puck drop.
- TEST and LIVE have separate account identities. To attach the same Telegram chat to a different account, disconnect it first.
- The original `TELEGRAM_CHAT_IDS` allowlist can still use legacy read-only bot commands. Automatic alerts require linking and explicitly enabling the account in Settings.

## Architecture and security

The Electron main process holds the existing LIVE/TEST account session token, and sends authenticated HTTPS requests to the Worker. The renderer never sees login tokens, Cloudflare administrator secrets, or the BotFather bot token. The Worker verifies the token against the existing Vercel account service before modifying an account's settings. A random, single-use code links one private Telegram chat to one NHL Tracker account.

### Live verification before distribution

```bash
cd "/g/NHL-Tracker-Current"
node --test tests/kalshiCategoryPreservation.test.mjs
npm run build
npm run dev

cd telegram-cloud
npm test
npx wrangler tail nhl-tracker-telegram-dev --format pretty
```

In the desktop app, test linking, a test Telegram message, preference save/reload, pending-wager team updates, disconnect, and a real projected-to-confirmed transition. Tests and a successful local build are required before packaging this staging branch for testers.
