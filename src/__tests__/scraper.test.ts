import { describe, it, expect, vi, afterEach } from "vitest";
import { env } from "cloudflare:test";
import { getLatestPostUrl, scrapePostContent } from "../scraper";

// Minimal Env that satisfies scraper (only needs FIRECRAWL_API_KEY)
const testEnv = { ...env, FIRECRAWL_API_KEY: "test-key" } as typeof env;

// ── Helpers ───────────────────────────────────────────────────────────────────

function firecrawlOk(markdown: string, ogTitle?: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        success: true,
        data: {
          markdown,
          metadata: {
            ogTitle: ogTitle ?? "OG Title",
            title: "Meta Title",
          },
        },
      }),
    text: () => Promise.resolve(""),
  });
}

function firecrawlFail(errorMsg: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({ success: false, error: errorMsg }),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── getLatestPostUrl ──────────────────────────────────────────────────────────

describe("getLatestPostUrl", () => {
  it("extracts the first -fa URL (newest post)", async () => {
    const md = `
[مطلب دوم](https://25mordad.com/PanorAIma/second-post-fa/)
[مطلب اول](https://25mordad.com/PanorAIma/first-post-fa/)
`;
    vi.stubGlobal("fetch", firecrawlOk(md));
    const url = await getLatestPostUrl(testEnv);
    expect(url).toBe("https://25mordad.com/PanorAIma/second-post-fa/");
  });

  it("adds a trailing slash when missing", async () => {
    const md = `[پست](https://25mordad.com/PanorAIma/some-post-fa)`;
    vi.stubGlobal("fetch", firecrawlOk(md));
    const url = await getLatestPostUrl(testEnv);
    expect(url).toMatch(/\/$/);
  });

  it("ignores links that do NOT end in -fa", async () => {
    const md = `
[english](https://25mordad.com/PanorAIma/english-only/)
[farsi](https://25mordad.com/PanorAIma/correct-post-fa/)
`;
    vi.stubGlobal("fetch", firecrawlOk(md));
    const url = await getLatestPostUrl(testEnv);
    expect(url).toBe("https://25mordad.com/PanorAIma/correct-post-fa/");
  });

  it("throws a clear error when no -fa links are found", async () => {
    vi.stubGlobal("fetch", firecrawlOk(`[only english](https://25mordad.com/PanorAIma/en/)`));
    await expect(getLatestPostUrl(testEnv)).rejects.toThrow("No Farsi post links");
  });

  it("throws when firecrawl returns success:false", async () => {
    vi.stubGlobal("fetch", firecrawlFail("rate limited"));
    await expect(getLatestPostUrl(testEnv)).rejects.toThrow("Failed to scrape index page");
  });

  it("throws when fetch itself fails (network error)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
    await expect(getLatestPostUrl(testEnv)).rejects.toThrow("Network error");
  });
});

// ── scrapePostContent ─────────────────────────────────────────────────────────

describe("scrapePostContent", () => {
  const POST_URL = "https://25mordad.com/PanorAIma/test-post-fa/";

  it("returns ogTitle as title when available", async () => {
    vi.stubGlobal("fetch", firecrawlOk("# محتوا\n\nمتن", "عنوان og"));
    const result = await scrapePostContent(testEnv, POST_URL);
    expect(result.title).toBe("عنوان og");
    expect(result.content).toBe("# محتوا\n\nمتن");
  });

  it("falls back to metadata.title when ogTitle is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: { markdown: "content", metadata: { title: "Meta Title" } },
          }),
      })
    );
    const result = await scrapePostContent(testEnv, POST_URL);
    expect(result.title).toBe("Meta Title");
  });

  it("falls back to 'بدون عنوان' when no metadata title", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: { markdown: "content", metadata: {} },
          }),
      })
    );
    const result = await scrapePostContent(testEnv, POST_URL);
    expect(result.title).toBe("بدون عنوان");
  });

  it("throws when firecrawl returns success:false", async () => {
    vi.stubGlobal("fetch", firecrawlFail("not found"));
    await expect(scrapePostContent(testEnv, POST_URL)).rejects.toThrow(
      "Failed to scrape post"
    );
  });
});
