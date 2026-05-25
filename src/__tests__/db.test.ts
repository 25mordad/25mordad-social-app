import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import {
  getPostByUrl,
  savePost,
  getTweetsForPost,
  getAllTweetsForPost,
  saveTweetDraft,
  markTweetSent,
  markTweetFailed,
} from "../db";

// ── Setup: apply schema and clear data before each test ───────────────────────
// miniflare's D1 exec() requires single-line SQL (no embedded newlines).

const DDL = [
  "CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT NOT NULL UNIQUE, title TEXT NOT NULL, content TEXT NOT NULL, scraped_at TEXT NOT NULL DEFAULT (datetime('now')))",
  "CREATE TABLE IF NOT EXISTS tweets (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL REFERENCES posts(id), tweet_id TEXT, tweet_text TEXT NOT NULL, theme TEXT NOT NULL, theme_index INTEGER NOT NULL, error TEXT, sent_at TEXT NOT NULL DEFAULT (datetime('now')))",
  "CREATE INDEX IF NOT EXISTS idx_tweets_post_id ON tweets(post_id)",
];

beforeEach(async () => {
  for (const sql of DDL) await env.DB.exec(sql);
  await env.DB.exec("DELETE FROM tweets");
  await env.DB.exec("DELETE FROM posts");
});

// ── Seed helpers ──────────────────────────────────────────────────────────────

async function seedPost(urlSuffix: string) {
  return savePost(env, {
    url: `https://25mordad.com/PanorAIma/${urlSuffix}-fa/`,
    title: `عنوان ${urlSuffix}`,
    content: `محتوای ${urlSuffix}`,
  });
}

async function seedSentTweet(postId: number, themeIndex = 0) {
  const draft = await saveTweetDraft(env, {
    post_id: postId,
    tweet_text: "توییت ارسال شده",
    theme: "hook",
    theme_index: themeIndex,
  });
  await markTweetSent(env, draft.id, `tw_${draft.id}`);
  return draft;
}

async function seedFailedTweet(postId: number, themeIndex = 1) {
  const draft = await saveTweetDraft(env, {
    post_id: postId,
    tweet_text: "توییت ناموفق",
    theme: "key_insight",
    theme_index: themeIndex,
  });
  await markTweetFailed(env, draft.id, "401 Unauthorized");
  return draft;
}

// ── getPostByUrl ──────────────────────────────────────────────────────────────

describe("getPostByUrl", () => {
  it("returns null when the post doesn't exist", async () => {
    const result = await getPostByUrl(env, "https://25mordad.com/PanorAIma/nope-fa/");
    expect(result).toBeNull();
  });

  it("returns the post when it exists", async () => {
    await seedPost("hello");
    const result = await getPostByUrl(env, "https://25mordad.com/PanorAIma/hello-fa/");
    expect(result).not.toBeNull();
    expect(result?.url).toBe("https://25mordad.com/PanorAIma/hello-fa/");
    expect(result?.title).toBe("عنوان hello");
    expect(result?.content).toBe("محتوای hello");
  });

  it("does not confuse two different URLs", async () => {
    await seedPost("post-one");
    await seedPost("post-two");
    const result = await getPostByUrl(env, "https://25mordad.com/PanorAIma/post-one-fa/");
    expect(result?.url).toContain("post-one");
    expect(result?.url).not.toContain("post-two");
  });
});

// ── savePost ──────────────────────────────────────────────────────────────────

describe("savePost", () => {
  it("returns a post with a generated id and scraped_at", async () => {
    const post = await savePost(env, {
      url: "https://25mordad.com/PanorAIma/new-fa/",
      title: "مطلب جدید",
      content: "محتوا",
    });
    expect(post.id).toBeGreaterThan(0);
    expect(post.url).toBe("https://25mordad.com/PanorAIma/new-fa/");
    expect(post.scraped_at).toBeTruthy();
  });

  it("throws on duplicate URL (UNIQUE constraint)", async () => {
    await seedPost("duplicate");
    await expect(
      savePost(env, {
        url: "https://25mordad.com/PanorAIma/duplicate-fa/",
        title: "duplicate 2",
        content: "c",
      })
    ).rejects.toThrow();
  });
});

// ── getTweetsForPost (sent only) ──────────────────────────────────────────────

describe("getTweetsForPost", () => {
  it("returns an empty array when there are no tweets", async () => {
    const post = await seedPost("empty");
    expect(await getTweetsForPost(env, post.id)).toHaveLength(0);
  });

  it("returns only tweets where tweet_id is set (sent)", async () => {
    const post = await seedPost("mixed");
    await seedSentTweet(post.id, 0);
    await seedFailedTweet(post.id, 1);
    // Also leave a pure draft (both NULL)
    await saveTweetDraft(env, {
      post_id: post.id,
      tweet_text: "پیش‌نویس",
      theme: "detail",
      theme_index: 2,
    });

    const tweets = await getTweetsForPost(env, post.id);
    expect(tweets).toHaveLength(1);
    expect(tweets[0].tweet_id).toMatch(/^tw_/);
  });

  it("returns tweets ordered by sent_at ascending", async () => {
    const post = await seedPost("ordered");
    await seedSentTweet(post.id, 0);
    await seedSentTweet(post.id, 1);
    const tweets = await getTweetsForPost(env, post.id);
    expect(tweets[0].theme_index).toBe(0);
    expect(tweets[1].theme_index).toBe(1);
  });
});

// ── getAllTweetsForPost (sent + failed) ───────────────────────────────────────

describe("getAllTweetsForPost", () => {
  it("returns both sent and failed tweets", async () => {
    const post = await seedPost("both");
    await seedSentTweet(post.id, 0);
    await seedFailedTweet(post.id, 1);

    const tweets = await getAllTweetsForPost(env, post.id);
    expect(tweets).toHaveLength(2);
  });

  it("excludes pure drafts (tweet_id=NULL AND error=NULL)", async () => {
    const post = await seedPost("drafts");
    await saveTweetDraft(env, {
      post_id: post.id,
      tweet_text: "پیش‌نویس",
      theme: "hook",
      theme_index: 0,
    });

    const tweets = await getAllTweetsForPost(env, post.id);
    expect(tweets).toHaveLength(0);
  });

  it("is a superset of getTweetsForPost", async () => {
    const post = await seedPost("superset");
    await seedSentTweet(post.id, 0);
    await seedFailedTweet(post.id, 1);

    const sent = await getTweetsForPost(env, post.id);
    const all = await getAllTweetsForPost(env, post.id);
    expect(all.length).toBeGreaterThanOrEqual(sent.length);

    const sentIds = new Set(sent.map((t) => t.id));
    for (const t of all) {
      if (t.tweet_id !== null) expect(sentIds.has(t.id)).toBe(true);
    }
  });
});

// ── saveTweetDraft ────────────────────────────────────────────────────────────

describe("saveTweetDraft", () => {
  it("creates a draft with tweet_id=NULL and error=NULL", async () => {
    const post = await seedPost("draft-test");
    const draft = await saveTweetDraft(env, {
      post_id: post.id,
      tweet_text: "متن توییت آزمایشی",
      theme: "hook",
      theme_index: 0,
    });
    expect(draft.id).toBeGreaterThan(0);
    expect(draft.tweet_id).toBeNull();
    expect(draft.error).toBeNull();
    expect(draft.tweet_text).toBe("متن توییت آزمایشی");
    expect(draft.theme).toBe("hook");
    expect(draft.theme_index).toBe(0);
  });
});

// ── markTweetSent ─────────────────────────────────────────────────────────────

describe("markTweetSent", () => {
  it("sets tweet_id and clears any previous error", async () => {
    const post = await seedPost("sent-test");
    const draft = await saveTweetDraft(env, {
      post_id: post.id,
      tweet_text: "txt",
      theme: "hook",
      theme_index: 0,
    });
    await markTweetSent(env, draft.id, "tw_abc123");

    const row = await env.DB.prepare("SELECT * FROM tweets WHERE id = ?")
      .bind(draft.id)
      .first<{ tweet_id: string; error: string | null }>();
    expect(row?.tweet_id).toBe("tw_abc123");
    expect(row?.error).toBeNull();
  });
});

// ── markTweetFailed ───────────────────────────────────────────────────────────

describe("markTweetFailed", () => {
  it("records the error message and clears tweet_id", async () => {
    const post = await seedPost("fail-test");
    const draft = await saveTweetDraft(env, {
      post_id: post.id,
      tweet_text: "txt",
      theme: "hook",
      theme_index: 0,
    });
    await markTweetFailed(env, draft.id, "X API error 401: Unauthorized");

    const row = await env.DB.prepare("SELECT * FROM tweets WHERE id = ?")
      .bind(draft.id)
      .first<{ tweet_id: string | null; error: string }>();
    expect(row?.error).toBe("X API error 401: Unauthorized");
    expect(row?.tweet_id).toBeNull();
  });

  it("can flip a sent tweet back to failed (edge case)", async () => {
    const post = await seedPost("flip-test");
    const draft = await saveTweetDraft(env, {
      post_id: post.id,
      tweet_text: "txt",
      theme: "hook",
      theme_index: 0,
    });
    await markTweetSent(env, draft.id, "tw_xyz");
    await markTweetFailed(env, draft.id, "retroactive failure");

    const row = await env.DB.prepare("SELECT * FROM tweets WHERE id = ?")
      .bind(draft.id)
      .first<{ tweet_id: string | null; error: string }>();
    expect(row?.tweet_id).toBeNull();
    expect(row?.error).toBe("retroactive failure");
  });
});
