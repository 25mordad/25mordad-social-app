import type { Env, FirecrawlScrapeResult } from "./types";
import { SITE_INDEX_URL } from "./config";

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v1";

// ── Internal helper ───────────────────────────────────────────────────────────

async function firecrawlScrape(
  apiKey: string,
  url: string
): Promise<FirecrawlScrapeResult> {
  const response = await fetch(`${FIRECRAWL_BASE}/scrape`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["markdown"],
      onlyMainContent: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Firecrawl error ${response.status}: ${body}`);
  }

  return response.json<FirecrawlScrapeResult>();
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Scrapes the PanorAIma index page and returns the URL of the most recent post.
 *
 * Firecrawl returns the page as markdown; we look for the first internal link
 * that matches the known post URL pattern (/PanorAIma/<slug>/).
 */
export async function getLatestPostUrl(env: Env): Promise<string> {
  console.log(`[scraper] Scraping index page: ${SITE_INDEX_URL}`);
  const result = await firecrawlScrape(env.FIRECRAWL_API_KEY, SITE_INDEX_URL);

  if (!result.success || !result.data?.markdown) {
    console.error(`[scraper] Index scrape failed: ${result.error}`);
    throw new Error(`Failed to scrape index page: ${result.error}`);
  }

  console.log(`[scraper] Index page scraped (${result.data.markdown.length} chars)`);

  // Extract Farsi-only links from markdown: [text](url)
  // Farsi posts always end with the "-fa" slug suffix (e.g. /some-post-fa or /some-post-fa/)
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/25mordad\.com\/PanorAIma\/[^)]*-fa\/?)\)/g;
  const matches = [...result.data.markdown.matchAll(linkRegex)];

  if (matches.length === 0) {
    console.error("[scraper] No Farsi post links found on the index page");
    throw new Error("No Farsi post links found on the index page (expected URLs ending in -fa)");
  }

  console.log(`[scraper] Found ${matches.length} Farsi post link(s)`);

  // The index page lists posts newest-first — the first match is the latest Farsi post
  const latestUrl = matches[0][2];

  // Normalise: ensure trailing slash
  const normalised = latestUrl.endsWith("/") ? latestUrl : `${latestUrl}/`;
  console.log(`[scraper] Latest Farsi post: ${normalised}`);
  return normalised;
}

/**
 * Scrapes the full content of a post URL.
 * Returns title + markdown body ready to be stored and fed to Claude.
 */
export async function scrapePostContent(
  env: Env,
  url: string
): Promise<{ title: string; content: string }> {
  console.log(`[scraper] Scraping post content: ${url}`);
  const result = await firecrawlScrape(env.FIRECRAWL_API_KEY, url);

  if (!result.success || !result.data?.markdown) {
    console.error(`[scraper] Post scrape failed for ${url}: ${result.error}`);
    throw new Error(`Failed to scrape post ${url}: ${result.error}`);
  }

  const title =
    result.data.metadata.ogTitle ??
    result.data.metadata.title ??
    "بدون عنوان";

  console.log(`[scraper] Post scraped — title: "${title}", content: ${result.data.markdown.length} chars`);

  return {
    title,
    content: result.data.markdown,
  };
}
