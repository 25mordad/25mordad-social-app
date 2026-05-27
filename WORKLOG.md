# Worklog

## 2026-05-28

### Teaser tweet feature
Added a second daily tweet on days 8–10 of the article arc, focused on building audience participation before the next article publishes.

**How it works:**
- Days 1–7: one article tweet at 05:30 UTC (unchanged)
- Days 8–10: article tweet at 05:30 UTC + teaser tweet 3 hours later via Cloudflare Queue
- Teaser tweets have no URL — pure engagement, invite replies
- Teaser page scraped fresh each time from `https://25mordad.com/PanorAIma/next/`
- 3 teaser themes: `teaser_hook` → `teaser_question` → `teaser_invite`

**Files changed:**
- `src/config.ts` — `TEASER_URL`, `TEASER_STARTS_AT`, `TEASER_THEMES`
- `src/types.ts` — `TEASER_QUEUE` binding, `TeaserQueueMessage`, `TeaserGenerationInput/Result`
- `src/db.ts` — `isTeaserAlreadySent()` for Queue idempotency
- `src/ai.ts` — `generateTeaserTweet()` with participation-focused system prompt
- `src/index.ts` — Queue enqueue in `runDailyJob`, `runTeaserJob()`, `queue` handler
- `wrangler.toml` — Queue producer + consumer bindings
- `.dev.vars` / `.dev.vars.example` — added `OPENAI_API_KEY`, `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_USER_ID`

**Before deploying:**
```bash
npx wrangler queues create teaser-jobs
```

### Instagram story + image generation (planned, not built)
Agreed stack: `gpt-image-2` → WebP → Cloudflare R2 → Instagram Graph API.
Env var placeholders added to `.dev.vars`. Requires Instagram Professional (Creator/Business) account.
