/**
 * index.ts — Cloudflare Worker entry point
 *
 * Triggers:
 *   • Cron  : every day at 05:30 UTC (09:00 Tehran, UTC+3:30)
 *   • HTTP  : GET /health  — liveness check
 *             GET /run     — manual trigger (useful during dev / testing)
 */

import { generateTweet } from "./ai";
import { getPostByUrl, getTweetsForPost, getAllTweetsForPost, savePost, saveTweetDraft, markTweetSent, markTweetFailed } from "./db";
import { getLatestPostUrl, scrapePostContent } from "./scraper";
import { postTweet } from "./twitter";
import type { Env } from "./types";

// ── Core daily job ────────────────────────────────────────────────────────────

async function runDailyJob(env: Env): Promise<string> {
  // Emit each line immediately so Cloudflare Logs captures it even on crash,
  // and also accumulate for the HTTP /run response body.
  const lines: string[] = [];
  const log = (line: string): void => {
    lines.push(line);
    console.log(line);
  };

  // ── Step 1: discover the latest post ──────────────────────────────────────
  log("🔍 [1/6] Fetching latest Farsi post URL…");
  const latestUrl = await getLatestPostUrl(env);
  log(`   ✓ URL: ${latestUrl}`);

  // ── Step 2: get or create the post record in D1 ───────────────────────────
  log("🗄️  [2/6] Checking D1 for existing post…");
  let post = await getPostByUrl(env, latestUrl);

  if (post) {
    log(`   ✓ Already in DB (id=${post.id}) — skipping scrape`);
  } else {
    log("   → New post — scraping full content via Firecrawl…");
    const { title, content } = await scrapePostContent(env, latestUrl);
    log(`   → Scraped: "${title}" (${content.length} chars)`);
    post = await savePost(env, { url: latestUrl, title, content });
    log(`   ✓ Saved to D1 (id=${post.id})`);
  }

  // ── Step 3: load tweet history for this post ──────────────────────────────
  log("📊 [3/6] Loading tweet history…");
  // Sent-only count drives the theme index (failed tweets don't advance the arc)
  const sentTweets = await getTweetsForPost(env, post.id);
  const themeIndex = sentTweets.length;
  // All tweets (sent + failed) go to Claude so it never repeats content
  const allTweets = await getAllTweetsForPost(env, post.id);
  log(`   ✓ ${sentTweets.length} sent, ${allTweets.length - sentTweets.length} failed — theme index: ${themeIndex % 10}`);

  // ── Step 4: generate a fresh tweet with Claude ────────────────────────────
  log("🤖 [4/6] Generating tweet with Claude AI…");
  log(`   → Model: ${(await import("./config")).CLAUDE_MODEL}`);
  const generated = await generateTweet(env, {
    post,
    previousTweets: allTweets,   // full history so Claude avoids repeating
    themeIndex,                   // based on sent-only count
  });
  log(`   ✓ Theme: ${generated.theme}`);
  log(`   ✓ Length: ${generated.text.length} chars`);
  log(`   ✓ Text: ${generated.text}`);

  // ── Step 5: save tweet draft to D1 (before posting) ──────────────────────
  log("💾 [5/6] Saving tweet draft to D1…");
  const draft = await saveTweetDraft(env, {
    post_id: post.id,
    tweet_text: generated.text,
    theme: generated.theme,
    theme_index: generated.themeIndex,
  });
  log(`   ✓ Draft saved (id=${draft.id})`);

  // ── Step 6: post to X, then update the draft record ──────────────────────
  log("🐦 [6/6] Posting to X (Twitter)…");
  log(`   → Access token prefix: ${env.TWITTER_ACCESS_TOKEN.slice(0, 10)}…`);
  try {
    const tweetId = await postTweet(env, generated.text);
    await markTweetSent(env, draft.id, tweetId);
    log(`   ✓ Posted! tweet_id=${tweetId}`);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await markTweetFailed(env, draft.id, errorMsg);
    log(`   ✗ Failed to post: ${errorMsg}`);
    log(`   → Draft id=${draft.id} marked as failed in DB`);
  }
  log("✅ Done");

  return lines.join("\n");
}

// ── Worker export ─────────────────────────────────────────────────────────────

export default {
  // Called by the Cloudflare cron scheduler
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    console.log("[cron] Daily job starting…");
    ctx.waitUntil(
      runDailyJob(env)
        .then(() => {
          console.log("[cron] Daily job completed.");
        })
        .catch((err) => {
          // Unhandled top-level error (e.g. scraper or DB failure before step 5)
          const message = err instanceof Error ? err.message : String(err);
          const stack = err instanceof Error && err.stack ? `\n${err.stack}` : "";
          console.error(`[cron] ❌ Unhandled error: ${message}${stack}`);
        })
    );
  },

  // HTTP handler for health checks and manual triggers
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === "/health") {
      return Response.json({ status: "ok", ts: new Date().toISOString() });
    }

    if (pathname === "/run") {
      // Simple auth: only allow in dev (no secret required) or pass ?secret=
      // In production add a proper bearer token check.
      console.log("[manual] /run triggered");
      try {
        const summary = await runDailyJob(env);
        return new Response(summary, {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error && err.stack ? `\n\nStack:\n${err.stack}` : "";
        console.error(`[manual] ❌ Unhandled error: ${message}${stack}`);
        return new Response(`❌ Error: ${message}${stack}`, { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
    }

    return new Response("Not found", { status: 404 });
  },
};
