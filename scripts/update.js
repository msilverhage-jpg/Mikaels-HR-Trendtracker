import fs from "node:fs";
import path from "node:path";
import Parser from "rss-parser";
import * as cheerio from "cheerio";

const parser = new Parser();

const SOURCES = [
  {
    id: "deloitte_hct",
    name: "Deloitte – Human Capital",
    kind: "rss",
    url: "https://action.deloitte.com/rss/topic/154/2025-global-human-capital-trends/feed.xml"
  },
  {
    id: "gartner_press",
    name: "Gartner – Newsroom (RSS)",
    kind: "rss",
    url: "https://www.gartner.com/en/newsroom/rss"
  },
  {
    id: "hbr_hrm",
    name: "HBR – HR Management (topic)",
    kind: "html",
    url: "https://hbr.org/topic/subject/human-resource-management"
  }
];

const OUT_DIR = path.join(process.cwd(), "public", "data");
const OUT_FILE = path.join(OUT_DIR, "reports.json");

function toIsoDate(d) {
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

function normalizeItem({ sourceId, sourceName, title, link, date, snippet }) {
  const t = (title || "").trim();
  const l = (link || "").trim();
  if (!t || !l) return null;

  const url = l.startsWith("http") ? l : `https://${l}`;
  return {
    id: `${sourceId}::${url}`,
    sourceId,
    sourceName,
    title: t,
    url,
    publishedAt: toIsoDate(date) || null,
    snippet: snippet ? String(snippet).trim().replace(/\s+/g, " ").slice(0, 240) : null
  };
}

async function fetchRss(src) {
  const feed = await parser.parseURL(src.url);
  return (feed.items || [])
    .slice(0, 20)
    .map((it) =>
      normalizeItem({
        sourceId: src.id,
        sourceName: src.name,
        title: it.title,
        link: it.link,
        date: it.isoDate || it.pubDate,
        snippet: it.contentSnippet || it.content
      })
    )
    .filter(Boolean);
}

async function fetchHbr(src) {
  const res = await fetch(src.url, { headers: { "user-agent": "hr-trendtracker/1.0" } });
  const html = await res.text();
  const $ = cheerio.load(html);

  const seen = new Set();
  const items = [];

  $("a").each((_, a) => {
    const href = $(a).attr("href");
    const text = $(a).text()?.trim();
    if (!href || !text) return;
    if (!href.startsWith("/")) return;
    if (href.startsWith("/topic/")) return;
    if (text.length < 12) return;

    const full = `https://hbr.org${href}`;
    if (seen.has(full)) return;
    seen.add(full);

    items.push(
      normalizeItem({
        sourceId: src.id,
        sourceName: src.name,
        title: text,
        link: full,
        date: null,
        snippet: null
      })
    );
  });

  return items.filter(Boolean).slice(0, 20);
}

async function main() {
  const all = [];

  for (const src of SOURCES) {
    try {
      if (src.kind === "rss") all.push(...(await fetchRss(src)));
      if (src.kind === "html") all.push(...(await fetchHbr(src)));
    } catch (e) {
      all.push({
        id: `${src.id}::error`,
        sourceId: src.id,
        sourceName: src.name,
        title: "Kunde inte hämta källan",
        url: src.url,
        publishedAt: new Date().toISOString(),
        snippet: String(e)
      });
    }
  }

  const map = new Map(all.map((x) => [x.id, x]));
  const items = Array.from(map.values()).sort((a, b) => {
    const da = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const db = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return db - da;
  });

  const payload = {
    updatedAt: new Date().toISOString(),
    sources: SOURCES.map(({ id, name, url, kind }) => ({ id, name, url, kind })),
    items: items.slice(0, 80)
  };

  fs.mkdirSync(OUT_DIR, { recursive:_
