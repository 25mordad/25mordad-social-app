import { describe, it, expect } from "vitest";
import { TWEET_THEMES, SITE_INDEX_URL, CLAUDE_MODEL } from "../config";

describe("TWEET_THEMES", () => {
  it("has exactly 10 themes", () => {
    expect(TWEET_THEMES).toHaveLength(10);
  });

  it("has sequential indices 0–9", () => {
    TWEET_THEMES.forEach((theme, i) => {
      expect(theme.index).toBe(i);
    });
  });

  it("has unique keys", () => {
    const keys = TWEET_THEMES.map((t) => t.key);
    expect(new Set(keys).size).toBe(10);
  });

  it("each theme has a non-empty label and direction", () => {
    for (const theme of TWEET_THEMES) {
      expect(theme.label.length).toBeGreaterThan(0);
      expect(theme.direction.length).toBeGreaterThan(0);
    }
  });

  it("starts with 'hook' and ends with 'wrap_up'", () => {
    expect(TWEET_THEMES[0].key).toBe("hook");
    expect(TWEET_THEMES[9].key).toBe("wrap_up");
  });
});

describe("SITE_INDEX_URL", () => {
  it("points to the PanorAIma index with a trailing slash", () => {
    expect(SITE_INDEX_URL).toBe("https://25mordad.com/PanorAIma/");
  });
});

describe("CLAUDE_MODEL", () => {
  it("is a non-empty string", () => {
    expect(typeof CLAUDE_MODEL).toBe("string");
    expect(CLAUDE_MODEL.length).toBeGreaterThan(0);
  });

  it("looks like an Anthropic model ID (starts with 'claude-')", () => {
    expect(CLAUDE_MODEL).toMatch(/^claude-/);
  });
});
