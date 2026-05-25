// ── Site config ───────────────────────────────────────────────────────────────
export const SITE_INDEX_URL = "https://25mordad.com/PanorAIma/";

// ── Cloudflare Workers AI model ───────────────────────────────────────────────
export const CLAUDE_MODEL = "claude-sonnet-4-5";

// ── 10-day tweet theme progression ───────────────────────────────────────────
// Each theme tells Claude *what angle* to take when writing the daily tweet.
// After 10 tweets the index wraps around so long-lived posts keep going.
export const TWEET_THEMES = [
  {
    index: 0,
    key: "hook",
    label: "معرفی / هوک",
    direction:
      "یک توییت جذاب بنویس که توجه مخاطب را فوری جلب کند. موضوع اصلی مطلب را معرفی کن اما همه چیز را لو نده — بخواه که کنجکاو شوند.",
  },
  {
    index: 1,
    key: "key_insight",
    label: "نکته کلیدی",
    direction:
      "مهم‌ترین بینش یا ایده اصلی مطلب را در یک توییت فشرده بیان کن. این توییت باید به تنهایی ارزشمند باشد.",
  },
  {
    index: 2,
    key: "detail",
    label: "جزئیات",
    direction:
      "روی یک جنبه خاص و جزئی از مطلب تمرکز کن که در توییت‌های قبلی به آن اشاره نشده. عمق بده.",
  },
  {
    index: 3,
    key: "quote",
    label: "نقل‌قول",
    direction:
      "یک جمله یا عبارت قوی از متن اصلی مطلب را انتخاب کن و آن را به صورت نقل‌قول توییت کن. جمله باید به خودی خود تأثیرگذار باشد.",
  },
  {
    index: 4,
    key: "context",
    label: "زمینه / بستر",
    direction:
      "زمینه تاریخی، فرهنگی یا پس‌زمینه مفهومی مطلب را توضیح بده. این توییت باید درک مخاطب را عمیق‌تر کند.",
  },
  {
    index: 5,
    key: "reflection",
    label: "بازتاب",
    direction:
      "از زاویه‌ای شخصی و تأملی به مطلب نگاه کن. چه احساسی منتقل می‌کند؟ چه تأثیری بر خواننده می‌گذارد؟",
  },
  {
    index: 6,
    key: "surprise",
    label: "نکته غیرمنتظره",
    direction:
      "یک نکته شگفت‌انگیز، خلاف‌انتظار یا کمتر دیده‌شده از مطلب را بیان کن که مخاطب را به فکر وا دارد.",
  },
  {
    index: 7,
    key: "takeaway",
    label: "درس عملی",
    direction:
      "یک درس یا نکته عملی که خواننده می‌تواند از این مطلب بیاموزد یا به زندگی‌اش اعمال کند را بنویس.",
  },
  {
    index: 8,
    key: "question",
    label: "سوال",
    direction:
      "یک سوال تفکربرانگیز مرتبط با موضوع مطلب بپرس که مخاطبان را به تعامل و بازتاب دعوت کند.",
  },
  {
    index: 9,
    key: "wrap_up",
    label: "جمع‌بندی",
    direction:
      "مطلب را به شکلی خلاصه جمع‌بندی کن که مخاطب را به خواندن کامل آن ترغیب کند. این آخرین توییت این دوره است.",
  },
] as const;

export type ThemeKey = (typeof TWEET_THEMES)[number]["key"];
