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
  const result = await firecrawlScrape(env.FIRECRAWL_API_KEY, SITE_INDEX_URL);

  if (!result.success || !result.data?.markdown) {
    throw new Error(`Failed to scrape index page: ${result.error}`);
  }

  // Extract Farsi-only links from markdown: [text](url)
  // Farsi posts always end with the "-fa" slug suffix (e.g. /some-post-fa or /some-post-fa/)
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/25mordad\.com\/PanorAIma\/[^)]*-fa\/?)\)/g;
  const matches = [...result.data.markdown.matchAll(linkRegex)];

  if (matches.length === 0) {
    throw new Error("No Farsi post links found on the index page (expected URLs ending in -fa)");
  }

  // The index page lists posts newest-first — the first match is the latest Farsi post
  const latestUrl = matches[0][2];

  // Normalise: ensure trailing slash
  return latestUrl.endsWith("/") ? latestUrl : `${latestUrl}/`;
}

/**
 * Scrapes the full content of a post URL.
 * Returns title + markdown body ready to be stored and fed to Claude.
 */
export async function scrapePostContent(
  env: Env,
  url: string
): Promise<{ title: string; content: string }> {
  const result = await firecrawlScrape(env.FIRECRAWL_API_KEY, url);

  if (!result.success || !result.data?.markdown) {
    throw new Error(`Failed to scrape post ${url}: ${result.error}`);
  }

  const title =
    result.data.metadata.ogTitle ??
    result.data.metadata.title ??
    "بدون عنوان";

  return {
    title,
    content: result.data.markdown,
  };
}
