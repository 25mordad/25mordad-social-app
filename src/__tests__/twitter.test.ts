import { describe, it, expect, vi, afterEach } from "vitest";
import { env } from "cloudflare:test";
import { postTweet } from "../twitter";

// OAuth 1.0a test credentials (fake values — never real tokens)
const testEnv = {
  ...env,
  TWITTER_API_KEY: "test-consumer-key",
  TWITTER_API_SECRET: "test-consumer-secret",
  TWITTER_ACCESS_TOKEN: "test-access-token",
  TWITTER_ACCESS_TOKEN_SECRET: "test-access-token-secret",
} as typeof env;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("postTweet", () => {
  it("returns the tweet id on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ data: { id: "1234567890", text: "test tweet" } }),
      })
    );
    const id = await postTweet(testEnv, "Hello from test");
    expect(id).toBe("1234567890");
  });

  it("throws with the status code on a non-OK response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve("Unauthorized"),
      })
    );
    await expect(postTweet(testEnv, "test")).rejects.toThrow("X API error 401");
  });

  it("throws with 402 when account has no credits", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 402,
        text: () => Promise.resolve(JSON.stringify({ title: "CreditsDepleted" })),
      })
    );
    await expect(postTweet(testEnv, "test")).rejects.toThrow("X API error 402");
  });

  it("POSTs to the correct X API v2 endpoint", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { id: "1", text: "t" } }),
    });
    vi.stubGlobal("fetch", mockFetch);
    await postTweet(testEnv, "test");
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.twitter.com/2/tweets");
  });

  it("sends the tweet text in the JSON body", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { id: "1", text: "t" } }),
    });
    vi.stubGlobal("fetch", mockFetch);
    await postTweet(testEnv, "My tweet text");
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(options.body as string)).toEqual({ text: "My tweet text" });
  });

  it("sends an OAuth 1.0a Authorization header", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { id: "1", text: "t" } }),
    });
    vi.stubGlobal("fetch", mockFetch);
    await postTweet(testEnv, "test");
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    // OAuth 1.0a headers start with "OAuth " and contain the consumer key
    expect(headers["Authorization"]).toMatch(/^OAuth /);
    expect(headers["Authorization"]).toContain('oauth_consumer_key="test-consumer-key"');
    expect(headers["Authorization"]).toContain('oauth_token="test-access-token"');
    expect(headers["Authorization"]).toContain("oauth_signature=");
  });
});
