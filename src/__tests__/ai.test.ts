import { describe, it, expect, vi, afterEach } from "vitest";
import { env } from "cloudflare:test";
import { generateTweet, fitToTwitterLimit } from "../ai";
import type { Post } from "../types";

const testEnv = {
  ...env,
  CLOUDFLARE_ACCOUNT_ID: "test-account-id",
  CLOUDFLARE_GATEWAY_ID: "default",
  CLOUDFLARE_API_TOKEN: "test-token",
} as typeof env;

const MOCK_POST: Post = {
  id: 1,
  url: "https://25mordad.com/PanorAIma/test-fa/",
  title: "مطلب آزمایشی",
  content: "این یک مطلب آزمایشی است که برای تست نوشته شده.",
  scraped_at: "2025-01-01T00:00:00Z",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Helper ────────────────────────────────────────────────────────────────────

function claudeReturns(text: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({ content: [{ type: "text", text }] }),
    text: () => Promise.resolve(""),
  });
}

// ── fitToTwitterLimit ─────────────────────────────────────────────────────────

describe("fitToTwitterLimit", () => {
  it("returns text unchanged when within limit", () => {
    expect(fitToTwitterLimit("سلام", 280)).toBe("سلام");
  });

  it("returns text unchanged when exactly at limit", () => {
    const text = "abcdefghij"; // exactly 10 ASCII chars
    expect(fitToTwitterLimit(text, 10)).toBe(text);
  });

  it("drops the last hashtag when body+hashtags exceed limit", () => {
    const body = "این متن خیلی مهمه"; // 18 chars
    const text = `${body}\n\n#هوشمصنوعی #تکنولوژی`;
    // Set limit so the full text exceeds but dropping one hashtag fits
    const result = fitToTwitterLimit(text, body.length + 14);
    expect(result).not.toContain("#تکنولوژی");
    expect(result).toContain("#هوشمصنوعی");
  });

  it("drops all hashtags when even a single one doesn't fit", () => {
    const body = "این متن خیلی مهمه";
    const text = `${body}\n\n#هوشمصنوعی`;
    const result = fitToTwitterLimit(text, body.length + 2); // barely enough for body
    expect(result).not.toContain("#");
  });

  it("trims body cleanly (no ellipsis) when nothing fits", () => {
    const text = "این یک متن خیلی خیلی خیلی طولانی است";
    const result = fitToTwitterLimit(text, 10);
    expect(result.length).toBeLessThanOrEqual(10);
    expect(result).not.toContain("…");
  });

  it("cuts at a word boundary without adding ellipsis", () => {
    // "first second third" → cut at 15 → "first second" (12 chars ≤ 15)
    const text = "first second third";
    const result = fitToTwitterLimit(text, 15);
    expect(result.length).toBeLessThanOrEqual(15);
    expect(result).not.toContain("…");
    // Result should be a clean word-boundary prefix of the original
    expect(text.startsWith(result)).toBe(true);
    expect(result).not.toMatch(/ $/);
  });
});

// ── generateTweet ─────────────────────────────────────────────────────────────

describe("generateTweet", () => {
  it("ends with the post URL and #هوشنوشت signature", async () => {
    vi.stubGlobal("fetch", claudeReturns("ایده جذاب امروز #فناوری"));
    const result = await generateTweet(testEnv, {
      post: MOCK_POST,
      previousTweets: [],
      themeIndex: 0,
    });
    // Format: {body}\n\n{url} #هوشنوشت
    expect(result.text).toContain(MOCK_POST.url);
    expect(result.text).toMatch(/#هوشنوشت$/);
    expect(result.text).toContain("\n\n" + MOCK_POST.url);
  });

  it("uses theme 'hook' for themeIndex 0", async () => {
    vi.stubGlobal("fetch", claudeReturns("متن توییت"));
    const result = await generateTweet(testEnv, {
      post: MOCK_POST,
      previousTweets: [],
      themeIndex: 0,
    });
    expect(result.theme).toBe("hook");
    expect(result.themeIndex).toBe(0);
  });

  it("wraps theme index after 10 (index 10 → hook again)", async () => {
    vi.stubGlobal("fetch", claudeReturns("متن"));
    const result = await generateTweet(testEnv, {
      post: MOCK_POST,
      previousTweets: [],
      themeIndex: 10,
    });
    expect(result.theme).toBe("hook");
    expect(result.themeIndex).toBe(0);
  });

  it("uses theme 'wrap_up' for themeIndex 9", async () => {
    vi.stubGlobal("fetch", claudeReturns("جمع‌بندی نهایی"));
    const result = await generateTweet(testEnv, {
      post: MOCK_POST,
      previousTweets: [],
      themeIndex: 9,
    });
    expect(result.theme).toBe("wrap_up");
  });

  it("produces a tweet within Twitter's 280-char limit (URL counts as 23)", async () => {
    const long = "این یک متن بسیار بسیار طولانی است ".repeat(20);
    vi.stubGlobal("fetch", claudeReturns(long));
    const result = await generateTweet(testEnv, {
      post: MOCK_POST,
      previousTweets: [],
      themeIndex: 0,
    });
    // Raw string is longer than 280 because the full URL is included —
    // Twitter counts any URL as exactly 23 chars (t.co shortening).
    // What we verify: the body portion alone fits within its budget (244 chars).
    const [body] = result.text.split("\n\n");
    expect(body.length).toBeLessThanOrEqual(244);
  });

  it("strips wrapping quotes that Claude sometimes adds", async () => {
    vi.stubGlobal("fetch", claudeReturns('"متن داخل نقل‌قول"'));
    const result = await generateTweet(testEnv, {
      post: MOCK_POST,
      previousTweets: [],
      themeIndex: 0,
    });
    expect(result.text).not.toMatch(/^"/);
    expect(result.text).not.toMatch(/"#هوشنوشت$/);
  });

  it("calls the Cloudflare AI Gateway endpoint (not Anthropic directly)", async () => {
    const mockFetch = claudeReturns("توییت");
    vi.stubGlobal("fetch", mockFetch);
    await generateTweet(testEnv, {
      post: MOCK_POST,
      previousTweets: [],
      themeIndex: 0,
    });
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("gateway.ai.cloudflare.com");
    expect(url).toContain("/anthropic/v1/messages");
    expect(url).toContain("test-account-id");
  });

  it("sends required Anthropic headers via the gateway", async () => {
    const mockFetch = claudeReturns("توییت");
    vi.stubGlobal("fetch", mockFetch);
    await generateTweet(testEnv, {
      post: MOCK_POST,
      previousTweets: [],
      themeIndex: 0,
    });
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers["cf-aig-authorization"]).toBe("Bearer test-token");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
  });

  it("throws a descriptive error on non-OK gateway response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      })
    );
    await expect(
      generateTweet(testEnv, {
        post: MOCK_POST,
        previousTweets: [],
        themeIndex: 0,
      })
    ).rejects.toThrow("Cloudflare AI Gateway error 500");
  });

  it("throws when Claude returns an empty response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ content: [] }),
        text: () => Promise.resolve(""),
      })
    );
    await expect(
      generateTweet(testEnv, {
        post: MOCK_POST,
        previousTweets: [],
        themeIndex: 0,
      })
    ).rejects.toThrow("Claude returned an empty response");
  });
});
