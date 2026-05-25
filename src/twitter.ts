/**
 * twitter.ts — Post a tweet via X API v2 with OAuth 2.0 Bearer token
 *
 * Uses a user-context OAuth 2.0 access token (generated in the X Developer
 * Portal under Keys & Tokens → Access Token). Simple Bearer auth — no signing.
 *
 * Token expiry: OAuth 2.0 user-context tokens expire after ~2 hours.
 * When expired, regenerate in the X Developer Portal and update TWITTER_ACCESS_TOKEN.
 */

import type { Env } from "./types";

const X_API_BASE = "https://api.twitter.com/2";

/**
 * Posts a tweet via X API v2.
 * Returns the tweet id assigned by X (stored in our DB for future reference).
 */
export async function postTweet(env: Env, text: string): Promise<string> {
  const endpoint = `${X_API_BASE}/tweets`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.TWITTER_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`X API error ${response.status}: ${body}`);
  }

  const data = await response.json<{ data: { id: string; text: string } }>();
  return data.data.id;
}
