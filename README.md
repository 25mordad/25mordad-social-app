# 25mordad — Social App (Cloudflare Worker)

A Cloudflare Worker that automatically posts a daily Farsi tweet from the latest
**Farsi** post on [25mordad.com/PanorAIma](https://25mordad.com/PanorAIma/).

> Posts exist in both Farsi (`-fa` URL suffix) and English (`-en`). The worker
> filters to Farsi-only posts by matching URLs that end with `-fa`.

## How it works

```
Cron (09:00 Tehran / 05:30 UTC)
  → Firecrawl   scrapes the index page → finds latest Farsi post URL
  → D1          checks if post already stored; if not, scrapes & saves full content
  → Claude      reads post + tweet history → picks today's theme → writes Farsi tweet
  → D1          saves tweet draft before posting (never lose generated content)
  → X API       posts the tweet (OAuth 2.0)
  → D1          marks tweet sent (or records error if posting failed)
```

### 10-day theme arc

Each post is covered across 10 daily tweets, each from a different angle.
After 10 tweets the cycle repeats with fresh takes until the next post appears.

| # | Theme key | Direction |
|---|-----------|-----------|
| 1 | `hook` | Grab attention — introduce the idea without revealing everything |
| 2 | `key_insight` | The single most important idea, compressed |
| 3 | `detail` | One specific, deep detail not covered before |
| 4 | `quote` | A powerful line from the post, as a quote |
| 5 | `context` | Historical or cultural background |
| 6 | `reflection` | Personal, emotional angle |
| 7 | `surprise` | The unexpected or counterintuitive point |
| 8 | `takeaway` | A practical lesson to apply |
| 9 | `question` | A thought-provoking question for engagement |
| 10 | `wrap_up` | Summary + call to read the full post |

Every tweet ends with the post URL and `#هوشنوشت`.

---

## Setup

### 1 — Configure wrangler

```bash
cp wrangler.toml.example wrangler.toml
# fill in your account_id and database_id
```

### 2 — Install dependencies

```bash
npm install
```

### 3 — Create the D1 database

```bash
npm run db:create
# copy the database_id printed and paste it into wrangler.toml
```

### 4 — Apply the schema

```bash
npm run db:migrate:remote   # production
npm run db:migrate          # local dev
```

### 5 — Set secrets

Copy `.dev.vars.example` → `.dev.vars` and fill in real values:

```bash
cp .dev.vars.example .dev.vars
```

For **production**, set each secret via wrangler:

```bash
wrangler secret put CLOUDFLARE_ACCOUNT_ID
wrangler secret put CLOUDFLARE_API_TOKEN
wrangler secret put CLOUDFLARE_GATEWAY_ID
wrangler secret put FIRECRAWL_API_KEY
wrangler secret put TWITTER_ACCESS_TOKEN
```

#### Cloudflare AI Gateway setup

1. Create an API token at [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
   - Permission: `Account → Workers AI → Edit`
2. Go to **AI → AI Gateway → your gateway → Provider Keys**
3. Add your Anthropic API key there (BYOK — Bring Your Own Key)

#### X / Twitter setup

1. Create an app at [developer.x.com](https://developer.x.com)
2. Set app type to **"Web App, Automated App or Bot"**
3. Set permissions to **"Read and Write"**
4. Go to **Keys & Tokens → Access Token → Generate**
5. Copy the **Access Token** into `TWITTER_ACCESS_TOKEN`

> ⚠️ The OAuth 2.0 access token expires after ~2 hours. Regenerate it in the
> X Developer Portal when it expires and update `TWITTER_ACCESS_TOKEN`.

### 6 — Run locally

> **Important:** Use `--remote` mode — the AI Gateway and D1 resolve against
> your real Cloudflare account, not a local emulator.

```bash
npm run dev:remote
```

#### Health check

```bash
curl http://localhost:8787/health
# → {"status":"ok","ts":"2025-05-25T12:00:00.000Z"}
```

#### Manually trigger the job

```bash
curl http://localhost:8787/run
```

The response is a plain-text log of every step:

```
🔍 [1/6] Fetching latest Farsi post URL…
   ✓ URL: https://25mordad.com/PanorAIma/some-post-fa/
🗄️  [2/6] Checking D1 for existing post…
   → New post — scraping full content via Firecrawl…
   ✓ Saved to D1 (id=1)
📊 [3/6] Loading tweet history…
   ✓ 0 sent, 0 failed — theme index: 0
🤖 [4/6] Generating tweet with Workers AI…
   → Model: claude-sonnet-4-5
   ✓ Theme: hook
   ✓ Length: 278 chars
   ✓ Text: …
💾 [5/6] Saving tweet draft to D1…
   ✓ Draft saved (id=1)
🐦 [6/6] Posting to X (Twitter)…
   ✓ Posted! tweet_id=1234567890123456789
✅ Done
```

> ⚠️ `/run` posts a real tweet. Only call it when you want to publish.

#### Inspect the D1 database

```bash
# list stored posts
npx wrangler d1 execute social-app-db --remote \
  --command "SELECT id, url, scraped_at FROM posts"

# list tweets
npx wrangler d1 execute social-app-db --remote \
  --command "SELECT id, post_id, theme, theme_index, tweet_id, error, sent_at FROM tweets ORDER BY sent_at DESC"
```

### 7 — Deploy

```bash
npm run deploy
```

---

## Testing

```bash
npm test           # single run
npm run test:watch # watch mode
```

Tests run inside a real Cloudflare Workers miniflare environment (D1, Web Crypto, etc.).
A **pre-push git hook** blocks pushes if tests fail.

---

## Tech stack

| Layer | Tool |
|-------|------|
| Runtime | Cloudflare Workers |
| Scheduler | Cloudflare Cron Triggers |
| Database | Cloudflare D1 (SQLite) |
| AI | Claude `claude-sonnet-4-5` via Cloudflare AI Gateway (Anthropic BYOK) |
| Scraping | [Firecrawl](https://firecrawl.dev) |
| Twitter | X API v2, OAuth 2.0 Bearer token |
| Tests | Vitest 4 + `@cloudflare/vitest-pool-workers` |

---

## TODO

- [ ] **Thread mode** — first tweet includes URL ($0.20), replies 2–10 have no URL ($0.015 each), cutting cost per post cycle from $2.00 → $0.335
- [ ] **Short URL** — use a custom short domain or Bitly so the URL is cleaner in the tweet
- [ ] Analyse sent tweet engagement to find the optimal posting time dynamically
- [ ] Add a `?secret=` query-param guard to the `/run` endpoint for production
