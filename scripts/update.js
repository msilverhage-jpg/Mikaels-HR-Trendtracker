import fs from "node:fs";
import path from "node:path";
import Parser from "rss-parser";
import * as cheerio from "cheerio";

const parser = new Parser();

/**
 * SOURCES
 * - rss: bäst stabilitet (datum + riktiga länkar)
 * - html: topic-sidor (enkelt urval av länkar)
 */
const SOURCES = [
  {
    id: "wef_future_of_work",
    name: "World Economic Forum – Future of Work (RSS)",
    kind: "rss",
    url: "https://www.weforum.org/agenda/archive/future-of-work/rss/"
  },
  {
    id: "gartner_newsroom",
    name: "Gartner – Newsroom (RSS)",
    kind: "rss",
    url: "https://www.gartner.com/en/newsroom/rss"
  },
  {
    id: "hbr_hrm",
    name: "HBR – Human Resource Management (topic)",
    kind: "html",
    url: "https://hbr.org/topic/subject/human-resource-management"
  },
  {
    id: "hbr_leadership",
    name: "HBR – Leadership (topic)",
    kind: "html",
    url: "https://hbr.org/topic/subject/leadership"
  },
  {
    id: "hbr_hybrid",
    name: "HBR – Hybrid work (topic)",
    kind: "html",
    url: "https://hbr.org/topic/subject/hybrid-work"
  },
  {
    id: "ms_wti",
    name: "Microsoft Work Trend Index",
    kind: "html",
    url: "https://www.microsoft.com/en-us/worklab/work-trend-index"
  },
  {
    id: "rework",
    name: "Google re:Work",
    kind: "html",
    url: "https://rework.withgoogle.com/"
  }
];

// IMPORTANT: vi hostar från /docs på GitHub Pages
const OUT_DIR = path.join(process.cwd(), "docs", "data");
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
    snippet: snippet ? String(snippet).trim().replace(/\s+/g, " ").slice(0, 260) : null
  };
}

async function fetchRss(src) {
  const feed = await parser.parseURL(src.url);

  return (feed.items || [])
    .slice(0, 25)
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

/**
 * Generic HTML fetcher for "topic pages"
 * - plockar upp artikellänkar
 * - försöker filtrera bort navigationslänkar
 * NOTE: vissa sajter kan blocka eller kräva JS-rendering.
 */
async function fetchHtmlLinks(src) {
  const res = await fetch(src.url, { headers: { "user-agent": "hr-trendtracker/1.0" } });
  const html = await res.text();
  const $ = cheerio.load(html);

  const seen = new Set();
  const items = [];

  // Plocka länkar, filtrera och deduplicera
  $("a").each((_, a) => {
    const href = $(a).attr("href");
    const text = $(a).text()?.trim();

    if (!href || !text) return;
    if (text.length < 14) return; // undvik “Read more”, etc.

    // Gör full URL
    let full = href;
    if (href.startsWith("/")) {
      const u = new URL(src.url);
      full = `${u.protocol}//${u.host}${href}`;
    }

    // Behöver vara http(s)
    if (!full.startsWith("http")) return;

    // Filtrera bort typiska nav-länkar
    const lower = full.toLowerCase();
    if (
      lower.includes("/topic/") ||
      lower.includes("/search") ||
      lower.includes("signup") ||
      lower.includes("login") ||
      lower.includes("subscribe")
    ) {
      return;
    }

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

  return items.filter(Boolean).slice(0, 25);
}

/**
 * Weekly summary (heuristik)
 * - räknar keyword-träffar i senaste items
 * - skapar headline + 3 bullets + themes
 */
function buildWeeklySummary(items) {
  const themes = [
    { id: "AI & produktivitet", keys: ["ai", "genai", "copilot", "automation", "productivity"] },
    { id: "Hybrid & kultur", keys: ["hybrid", "remote", "flex", "culture", "engagement", "belonging"] },
    { id: "Skills & reskilling", keys: ["skills", "reskill", "upskill", "learning", "capability"] },
    { id: "Ledarskap", keys: ["leadership", "manager", "leading", "executive", "management"] },
    { id: "Comp & rewards", keys: ["compensation", "pay", "salary", "rewards", "benefits", "total rewards"] }
  ];

  const text = (it) => `${it.title || ""} ${it.snippet || ""} ${it.sourceName || ""}`.toLowerCase();

  const scored = themes
    .map((t) => ({
      theme: t.id,
      score: items.reduce((acc, it) => acc + (t.keys.some((k) => text(it).includes(k)) ? 1 : 0), 0)
    }))
    .sort((a, b) => b.score - a.score);

  const top = scored.filter((x) => x.score > 0).slice(0, 3).map((x) => x.theme);

  const headline = top.length
    ? `Veckans HR-signalspaning: ${top.join(" + ")}`
    : "Veckans HR-signalspaning";

  const bullets = [
    top[0]
      ? `Störst signal just nu: ${top[0]} — följ utvecklingen i veckans senaste rapporter.`
      : "Fokus: följ veckans nya rapporter och highlights.",
    top[1]
      ? `Nästa tema: ${top[1]} — tydliga implikationer för policy, ledarskap och arbetssätt.`
      : "Notera återkommande teman över flera källor.",
    top[2]
      ? `Tredje tema: ${top[2]} — bra underlag inför dialog med ledning och chefer.`
      : "Välj 1–2 actions att testa kommande vecka."
  ];

  return { headline, bullets, themes: top };
}

function scoreItem(item) {
  // Nyare först
  const ts = item.publishedAt ? Date.parse(item.publishedAt) : 0;
  return Number.isNaN(ts) ? 0 : ts;
}

async function main() {
  const all = [];

  for (const src of SOURCES) {
    try {
      if (src.kind === "rss") all.push(...(await fetchRss(src)));
      if (src.kind === "html") all.push(...(await fetchHtmlLinks(src)));
    } catch (e) {
      // lägg “fel-item” så du kan se att källan misslyckades
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

  // Deduplicera
  const map = new Map(all.map((x) => [x.id, x]));
  const items = Array.from(map.values()).sort((a, b) => scoreItem(b) - scoreItem(a));

  const summary = buildWeeklySummary(items.slice(0, 30));

  const payload = {
    updatedAt: new Date().toISOString(),
    weeklySummary: summary,
    sources: SOURCES.map(({ id, name, url, kind }) => ({ id, name, url, kind })),
    items: items.slice(0, 100)
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2), "utf-8");
  console.log(`Wrote ${OUT_FILE} with ${payload.items.length} items.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
