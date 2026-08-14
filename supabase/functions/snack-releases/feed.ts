export type SnackReleaseRow = {
  title: string;
  brand: null;
  summary: string | null;
  article_url: string;
  published_at: string;
};

const allowedArticleOrigin = "https://www.snackandbakery.com";

function decodeXml(value: string) {
  return value
    .replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function tag(item: string, name: string) {
  const match = item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return match ? decodeXml(match[1]).trim() : "";
}

function plainText(value: string) {
  return decodeXml(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

export function parseSnackReleaseFeed(xml: string, limit = 12): SnackReleaseRow[] {
  const releases: SnackReleaseRow[] = [];
  const articleUrls = new Set<string>();
  for (const match of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)) {
    const item = match[1];
    const title = plainText(tag(item, "title")).slice(0, 180);
    const description = plainText(tag(item, "description")).slice(0, 500);
    const published = new Date(tag(item, "pubDate"));
    let articleUrl: URL;
    try {
      articleUrl = new URL(tag(item, "link"));
    } catch {
      continue;
    }
    const normalizedArticleUrl = articleUrl.toString();
    if (
      !title ||
      Number.isNaN(published.valueOf()) ||
      articleUrl.origin !== allowedArticleOrigin ||
      articleUrls.has(normalizedArticleUrl)
    ) continue;
    articleUrls.add(normalizedArticleUrl);
    releases.push({
      title,
      brand: null,
      summary: description || null,
      article_url: normalizedArticleUrl,
      published_at: published.toISOString().slice(0, 10),
    });
    if (releases.length >= limit) break;
  }
  return releases;
}
