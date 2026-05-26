/**
 * twitter.ts — Post a tweet via X API v2 with OAuth 1.0a
 *
 * OAuth 1.0a user-context tokens never expire (unlike OAuth 2.0 bearer tokens
 * which die after ~2 hours). Perfect for cron jobs with no human in the loop.
 *
 * Signing uses HMAC-SHA1 via the Web Crypto API (available in all CF Workers).
 * JSON bodies are NOT included in the OAuth signature base string — only the
 * oauth_* parameters and the endpoint URL are signed.
 *
 * Required env vars (set via `wrangler secret put`):
 *   TWITTER_API_KEY            — Consumer Key
 *   TWITTER_API_SECRET         — Consumer Secret
 *   TWITTER_ACCESS_TOKEN       — Access Token  (your account)
 *   TWITTER_ACCESS_TOKEN_SECRET — Access Token Secret
 */

import type { Env } from "./types";

const X_API_BASE = "https://api.twitter.com/2";

// ── OAuth 1.0a helpers ────────────────────────────────────────────────────────

/**
 * RFC-3986 percent-encoding (stricter than encodeURIComponent for OAuth).
 * The extra replacements cover chars encodeURIComponent leaves unencoded.
 */
function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

/**
 * HMAC-SHA1 over `data` using `key`, returns Base64-encoded digest.
 * Uses the Web Crypto subtle API — available in all Cloudflare Workers.
 */
async function hmacSha1Base64(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
  // btoa over a Uint8Array → Base64 string
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

/**
 * Builds the `Authorization: OAuth …` header for a given request.
 *
 * @param method  HTTP method (e.g. "POST")
 * @param url     Full endpoint URL without query string
 * @param env     Worker env with OAuth 1.0a credentials
 */
async function buildOAuth1Header(
  method: string,
  url: string,
  env: Env
): Promise<string> {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: env.TWITTER_API_KEY,
    oauth_nonce: crypto.randomUUID().replace(/-/g, ""),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: env.TWITTER_ACCESS_TOKEN,
    oauth_version: "1.0",
  };

  // Build the signature base string:
  //   VERB & percent(url) & percent(sorted_key=value&…)
  // JSON request bodies are intentionally excluded from the base string.
  const paramString = Object.keys(oauthParams)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(oauthParams[k])}`)
    .join("&");

  const baseString = [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(paramString),
  ].join("&");

  // Signing key: percent(consumer_secret)&percent(token_secret)
  const signingKey = `${percentEncode(env.TWITTER_API_SECRET)}&${percentEncode(
    env.TWITTER_ACCESS_TOKEN_SECRET
  )}`;

  oauthParams.oauth_signature = await hmacSha1Base64(signingKey, baseString);

  // Assemble the Authorization header value
  const headerValue =
    "OAuth " +
    Object.keys(oauthParams)
      .sort()
      .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
      .join(", ");

  return headerValue;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Posts a tweet via X API v2 using OAuth 1.0a (permanent credentials).
 * Returns the tweet id assigned by X.
 */
export async function postTweet(env: Env, text: string): Promise<string> {
  const endpoint = `${X_API_BASE}/tweets`;

  const authHeader = await buildOAuth1Header("POST", endpoint, env);

  console.log(`[twitter] Posting tweet (${text.length} chars)…`);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`[twitter] X API error ${response.status}: ${body}`);
    throw new Error(`X API error ${response.status}: ${body}`);
  }

  const data = await response.json<{ data: { id: string; text: string } }>();
  console.log(`[twitter] Tweet posted — id: ${data.data.id}`);
  return data.data.id;
}
