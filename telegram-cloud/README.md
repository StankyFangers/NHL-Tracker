# NHL Tracker Telegram Cloud DEV

Standalone Cloudflare Worker + D1 for 24/7 Telegram confirmation alerts. No changes to the production Vercel wager backend.

## Set up once (Git Bash)

Create a free Cloudflare account. Stop the currently running local bot with Ctrl+C before switching Telegram to a webhook.

```bash
cd "/g/NHL-Tracker-Current/telegram-cloud"
npm install
npx wrangler login
npx wrangler d1 create nhl-telegram-dev
```

Copy the returned `database_id` into `wrangler.toml` in place of `REPLACE_WITH_YOUR_D1_DATABASE_ID`.

```bash
npx wrangler d1 execute nhl-telegram-dev --remote --file=./schema.sql
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put TELEGRAM_CHAT_IDS
npx wrangler secret put ADMIN_SECRET
npm test
npm run deploy
```

Use the BotFather token as `TELEGRAM_BOT_TOKEN`. Set `TELEGRAM_WEBHOOK_SECRET` to a fresh random URL-safe secret, `TELEGRAM_CHAT_IDS` to the numeric Telegram chat IDs allowed to use the bot (comma-separated), and `ADMIN_SECRET` to a *different* strong secret. Never commit these values. The local DEV bot understands `/id` after the associated local-code update, so you can discover your chat ID privately.

After Wrangler prints your `https://...workers.dev` URL, enable the webhook (use the same webhook secret as above):

```bash
read -rsp "Bot token: " BOT_TOKEN; echo
read -rsp "Webhook secret: " WEBHOOK_SECRET; echo
read -rp "Workers URL (https://...workers.dev): " WORKER_URL
curl -sS -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" --data-urlencode "url=${WORKER_URL}/telegram" --data-urlencode "secret_token=${WEBHOOK_SECRET}" --data-urlencode 'allowed_updates=["message"]'
unset BOT_TOKEN WEBHOOK_SECRET
```

Now send `Ping` in Telegram. The scheduled trigger runs every minute, but Daily Faceoff requests are only sent when due: 30 minutes (more than 1 hour), 5 minutes (60–15 minutes), 1 minute (final 15 minutes), beginning at 10 AM ET. Team alerts require observed PROJECTED to CONFIRMED. Already-confirmed teams always count toward the start-time totals. A complete puck-drop group creates a separate one-time completion message.

### Development limitations

This is the first cloud staging implementation, **not yet deployed or verified against a live lineup change**. The desktop Settings switches are not yet synced to the cloud. Only explicitly whitelisted chats receive messages. Under Worker termination during send/commit, a Telegram message can be duplicated. Cloudflare Free CPU, subrequest and daily quotas need live validation. Keep this on the feature branch until verified.
