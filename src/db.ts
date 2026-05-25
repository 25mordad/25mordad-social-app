import type { Env, Post, Tweet } from "./types";

// ── Posts ─────────────────────────────────────────────────────────────────────

/** Returns the post if it's already in the DB, otherwise null. */
export async function getPostByUrl(
  env: Env,
  url: string
): Promise<Post | null> {
  const result = await env.DB.prepare(
    "SELECT * FROM posts WHERE url = ? LIMIT 1"
  )
    .bind(url)
    .first<Post>();

  return result ?? null;
}

/** Persists a new post and returns the inserted row with its generated id. */
export async function savePost(
  env: Env,
  post: Omit<Post, "id" | "scraped_at">
): Promise<Post> {
  const result = await env.DB.prepare(
    `INSERT INTO posts (url, title, content)
     VALUES (?, ?, ?)
     RETURNING *`
  )
    .bind(post.url, post.title, post.content)
    .first<Post>();

  if (!result) throw new Error("Failed to insert post into D1");
  return result;
}

// ── Tweets ────────────────────────────────────────────────────────────────────

/**
 * Returns all successfully sent tweets for a post, oldest first.
 * Used to advance the theme index — only counts real posts.
 */
export async function getTweetsForPost(
  env: Env,
  postId: number
): Promise<Tweet[]> {
  const { results } = await env.DB.prepare(
    "SELECT * FROM tweets WHERE post_id = ? AND tweet_id IS NOT NULL ORDER BY sent_at ASC"
  )
    .bind(postId)
    .all<Tweet>();

  return results;
}

/**
 * Returns ALL tweets for a post (sent + failed), oldest first.
 * Used to build Claude's history — we don't want to repeat content
 * even if the tweet failed to post to Twitter.
 */
export async function getAllTweetsForPost(
  env: Env,
  postId: number
): Promise<Tweet[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM tweets
     WHERE post_id = ? AND (tweet_id IS NOT NULL OR error IS NOT NULL)
     ORDER BY sent_at ASC`
  )
    .bind(postId)
    .all<Tweet>();

  return results;
}

/**
 * Saves a generated tweet as a draft (before posting to X).
 * tweet_id and error are both NULL at this stage.
 */
export async function saveTweetDraft(
  env: Env,
  tweet: Pick<Tweet, "post_id" | "tweet_text" | "theme" | "theme_index">
): Promise<Tweet> {
  const result = await env.DB.prepare(
    `INSERT INTO tweets (post_id, tweet_text, theme, theme_index)
     VALUES (?, ?, ?, ?)
     RETURNING *`
  )
    .bind(tweet.post_id, tweet.tweet_text, tweet.theme, tweet.theme_index)
    .first<Tweet>();

  if (!result) throw new Error("Failed to save tweet draft to D1");
  return result;
}

/**
 * Marks a draft tweet as successfully sent by recording the X tweet_id.
 */
export async function markTweetSent(
  env: Env,
  id: number,
  tweetId: string
): Promise<void> {
  await env.DB.prepare(
    `UPDATE tweets SET tweet_id = ?, error = NULL WHERE id = ?`
  )
    .bind(tweetId, id)
    .run();
}

/**
 * Marks a draft tweet as failed by recording the error message.
 */
export async function markTweetFailed(
  env: Env,
  id: number,
  error: string
): Promise<void> {
  await env.DB.prepare(
    `UPDATE tweets SET error = ?, tweet_id = NULL WHERE id = ?`
  )
    .bind(error, id)
    .run();
}
