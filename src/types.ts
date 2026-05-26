// ── Cloudflare Worker environment bindings ────────────────────────────────────
export interface Env {
  // Cloudflare bindings
  DB: D1Database;

  // Secrets (set via wrangler secret put)
  CLOUDFLARE_ACCOUNT_ID: string;   // Cloudflare account ID
  CLOUDFLARE_GATEWAY_ID: string;   // AI Gateway slug (e.g. "default")
  CLOUDFLARE_API_TOKEN: string;    // Cloudflare API token — sent as cf-aig-authorization
  FIRECRAWL_API_KEY: string;
  // OAuth 1.0a credentials — these never expire (unless revoked in the X Dev Portal)
  TWITTER_API_KEY: string;              // Consumer Key  (App Settings → Keys and Tokens)
  TWITTER_API_SECRET: string;           // Consumer Secret
  TWITTER_ACCESS_TOKEN: string;         // Access Token  (your account, not the app)
  TWITTER_ACCESS_TOKEN_SECRET: string;  // Access Token Secret
}

// ── Database row shapes ───────────────────────────────────────────────────────
export interface Post {
  id: number;
  url: string;
  title: string;
  content: string;
  scraped_at: string;
}

export interface Tweet {
  id: number;
  post_id: number;
  tweet_id: string | null;   // null until successfully posted
  tweet_text: string;
  theme: string;
  theme_index: number;
  error: string | null;      // null on success, error message on failure
  sent_at: string;
}

// ── Firecrawl ─────────────────────────────────────────────────────────────────
export interface FirecrawlScrapeResult {
  success: boolean;
  data?: {
    markdown: string;
    metadata: {
      title?: string;
      description?: string;
      ogTitle?: string;
    };
  };
  error?: string;
}

// ── AI ────────────────────────────────────────────────────────────────────────
export interface TweetGenerationInput {
  post: Post;
  previousTweets: Tweet[];
  themeIndex: number;
}

export interface TweetGenerationResult {
  text: string;
  theme: string;
  themeIndex: number;
}
