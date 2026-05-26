# 25mordad Social App — Claude Code Guide

## What this is
A **Cloudflare Worker** that runs once a day (05:30 UTC = 09:00 Tehran):
1. Scrapes the latest **Farsi** post from `https://25mordad.com/PanorAIma/` via Firecrawl
2. Generates a **Farsi tweet** using Claude via Cloudflare AI Gateway (BYOK)
3. Posts it to **X (Twitter)** via OAuth 1.0a (permanent credentials, never expire)

Each post gets a 10-tweet arc over 10 days, one theme per day (`hook → key_insight → … → wrap_up`). Every tweet ends with `#هوشنوشت` and the post URL.

---

## Commands

```bash
npm run dev:remote      # run Worker locally against remote D1 + AI Gateway
npm test                # run the full test suite (Vitest + Workers runtime)
npm run test:watch      # watch mode
npm run type-check      # TypeScript check only (no emit)
npm run deploy          # deploy to Cloudflare Workers

# Database
npm run db:migrate              # apply schema.sql to local D1
npm run db:migrate:remote       # apply schema.sql to remote D1
```

### Manual trigger (while `dev:remote` is running)
```bash
curl http://localhost:8787/health   # liveness check
curl http://localhost:8787/run      # trigger the full daily job (posts a real tweet)
```

---

## Architecture

```
src/
  index.ts    — Worker entry: cron handler + /health + /run HTTP routes
  config.ts   — SITE_INDEX_URL, CLAUDE_MODEL, TWEET_THEMES (10-theme array)
  scraper.ts  — Firecrawl: find latest -fa URL, scrape full content
  ai.ts       — Claude tweet generation via Cloudflare AI Gateway
  twitter.ts  — X API v2 posting with OAuth 1.0a (HMAC-SHA1 via Web Crypto)
  db.ts       — D1 helpers: posts + tweets CRUD
  types.ts    — Env, Post, Tweet, TweetGenerationInput, etc.
```

### Key data flow in `runDailyJob` (index.ts)
1. `getLatestPostUrl` → first `-fa` link from Firecrawl index scrape
2. `getPostByUrl` / `savePost` → deduplicate in D1
3. `getTweetsForPost` → count **sent** tweets → `themeIndex`
4. `getAllTweetsForPost` → **all** tweets (sent + failed) → Claude's history (avoids repeating even failed drafts)
5. `generateTweet` → Claude via AI Gateway
6. `saveTweetDraft` → save to D1 **before** posting
7. `postTweet` → X API → `markTweetSent` or `markTweetFailed` (never throws)

---

## Critical gotchas

### Cloudflare AI Gateway (ai.ts)
- Endpoint: `https://gateway.ai.cloudflare.com/v1/{ACCOUNT_ID}/{GATEWAY_ID}/anthropic/v1/messages`
- Auth header: **`cf-aig-authorization: Bearer <CLOUDFLARE_API_TOKEN>`** — NOT `Authorization`
- Must also send: **`anthropic-version: 2023-06-01`**
- Model ID must be the real Anthropic format: `claude-sonnet-4-5` (not `anthropic/claude-sonnet-4`)
- The Anthropic key is added via Cloudflare Dashboard → AI Gateway → Provider Keys (BYOK)
- `env.AI.run()` binding does NOT work for Anthropic models — use `fetch()` to the REST endpoint

### Tweet character budget (ai.ts)
- Twitter limit = 280 chars
- Post URL and `#هوشنوشت` are appended in code — Claude never adds them
- Body budget: `279 - 2(\n\n) - 23(URL, Twitter counts all URLs as 23) - 10( #هوشنوشت) = 244 chars`
- `fitToTwitterLimit()` is exported; it drops hashtags one-by-one then trims at word boundary
- Claude is instructed never to end with `…` — also stripped in code as a safety net
- Tweet cost on X Pay Per Use: **$0.200** (tweet with URL) vs $0.015 (no URL)

### X API auth (twitter.ts)
- Uses **OAuth 1.0a** — credentials never expire (unlike OAuth 2.0 bearer tokens which die in ~2h)
- Signing: HMAC-SHA1 via Web Crypto (`crypto.subtle`) — no external libs needed
- JSON request bodies are **not** included in the OAuth signature base string (only the oauth_* params + URL are signed — this is correct per RFC 5849 §3.4.1)
- In X Developer Portal → your app → Keys and Tokens, generate:
  - **Consumer Key / Secret** → `TWITTER_API_KEY` / `TWITTER_API_SECRET`  
  - **Access Token / Secret** (under "Authentication Tokens", for your own account) → `TWITTER_ACCESS_TOKEN` / `TWITTER_ACCESS_TOKEN_SECRET`

### Farsi-only filter (scraper.ts)
- Only posts whose URL ends in `-fa` or `-fa/` are considered
- Regex: `/\[([^\]]+)\]\((https?:\/\/25mordad\.com\/PanorAIma\/[^)]*-fa\/?)\)/g`

### D1 tweet status (db.ts)
| State | `tweet_id` | `error` |
|---|---|---|
| Draft (just generated) | NULL | NULL |
| Sent successfully | set | NULL |
| Failed to post | NULL | error message |

`getTweetsForPost` = sent only (drives theme index)
`getAllTweetsForPost` = sent + failed (drives Claude's history)

---

## Environment variables

Set via `wrangler secret put <KEY>` in production; `.dev.vars` locally (gitignored).

| Variable | Description |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `CLOUDFLARE_GATEWAY_ID` | AI Gateway slug (e.g. `default`) |
| `CLOUDFLARE_API_TOKEN` | Cloudflare token with AI Gateway permission |
| `FIRECRAWL_API_KEY` | Firecrawl API key |
| `TWITTER_API_KEY` | OAuth 1.0a Consumer Key (X Dev Portal → app → Keys and Tokens) |
| `TWITTER_API_SECRET` | OAuth 1.0a Consumer Secret |
| `TWITTER_ACCESS_TOKEN` | OAuth 1.0a Access Token (for your account) |
| `TWITTER_ACCESS_TOKEN_SECRET` | OAuth 1.0a Access Token Secret |

---

## Tests

- Framework: **Vitest 4** + **`@cloudflare/vitest-pool-workers`** (runs in real Workers miniflare)
- Config: `vitest.config.mts` (must be `.mts`, not `.ts` — the package is ESM-only)
- D1 in tests: `env.DB.exec()` requires **single-line SQL** (miniflare rejects multi-line)
- `fitToTwitterLimit` is exported for unit testing
- Test files live in `src/__tests__/`
- **Pre-push hook** runs `npm test` automatically — push is blocked if tests fail

---

## TODO

- **Thread mode** — tweet 1 (hook, `theme_index=0`) includes the post URL ($0.20) and starts a thread. tweets 2–10 reply to tweet 1 via `reply.in_reply_to_tweet_id` ($0.015 each, no URL). This keeps the link card on the first tweet while cutting subsequent tweet costs from $0.20 → $0.015. Requires storing the first tweet's `tweet_id` per post in D1 (already have it in the `tweets` table) and passing it to the X API `POST /2/tweets` body as `{ text, reply: { in_reply_to_tweet_id } }`.

- **Short URL in tweets** — currently the full post URL is appended (e.g. `https://25mordad.com/PanorAIma/iran-lahzeye-feshordeh-tarikh-fa/`). Twitter counts any URL as 23 chars so it doesn't hurt the budget, but visually it's long. Options: Bitly API, custom short domain (e.g. `25m.ir`) via Cloudflare Worker redirect, or shorten the slug on the blog itself.
