-- ── Posts ─────────────────────────────────────────────────────────────────────
-- Each scraped blog post is stored once (url is unique).
CREATE TABLE IF NOT EXISTS posts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  url         TEXT    NOT NULL UNIQUE,
  title       TEXT    NOT NULL,
  content     TEXT    NOT NULL,   -- full markdown from Firecrawl
  scraped_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ── Tweets ────────────────────────────────────────────────────────────────────
-- Tweets are saved to DB before posting so we never lose generated content.
-- Status flow: draft (tweet_id NULL, error NULL) → sent (tweet_id set)
--                                                → failed (error set)
CREATE TABLE IF NOT EXISTS tweets (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id      INTEGER NOT NULL REFERENCES posts(id),
  tweet_id     TEXT,                       -- NULL until successfully posted
  tweet_text   TEXT    NOT NULL,
  theme        TEXT    NOT NULL,           -- e.g. "hook", "key_insight" …
  theme_index  INTEGER NOT NULL,           -- 0-9, cycles after 10
  error        TEXT,                       -- NULL on success, error message on failure
  sent_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tweets_post_id ON tweets(post_id);
