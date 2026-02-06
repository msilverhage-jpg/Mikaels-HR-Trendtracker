const CATEGORY_RULES = [
  { id: "ai", label: "AI & produktivitet", keywords: ["ai","genai","copilot","automation","productivity"] },
  { id: "hybrid", label: "Hybrid & kultur", keywords: ["hybrid","remote","flex","culture","engagement","belonging"] },
  { id: "skills", label: "Skills & reskilling", keywords: ["skills","reskill","upskill","learning","capability"] },
  { id: "rewards", label: "Comp & rewards", keywords: ["compensation","pay","salary","rewards","benefits","total rewards"] },
  { id: "leadership", label: "Ledarskap", keywords: ["leadership","manager","leading","executive","management"] }
];

function inferCategory(item) {
  const hay = `${item.title || ""} ${item.snippet || ""} ${item.sourceName || ""}`.toLowerCase();
  for (const c of CATEGORY_RULES) {
    if (c.keywords.some(k => hay.includes(k))) return c.id;
  }
  return "other";
}
function catLabel(id) {
  const c = CATEGORY_RULES.find(x => x.id === id);
  return c ? c.label : "Övrigt";
}
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}
function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("sv-SE");
}
function scoreItem(item) {
  const ts = item.publishedAt ? Date.parse(item.publishedAt) : 0;
  return Number.isNaN(ts) ? 0 : ts;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function showFatal(msg) {
  const listEl = document.getElementById("list");
  if (listEl) {
    listEl.innerHTML = `
      <div style="padding:14px;border:1px solid #e7eaf2;border-radius:16px;background:#fff;color:#0f172a;">
        <strong>Kan inte ladda data</strong>
        <div style="margin-top:6px;color:#64748b;">${escapeHtml(msg)}</div>
        <div style="margin-top:10px;color:#64748b;font-size:13px;">
          Testa att öppna <code>/data/reports.json</code> i ny flik och kontrollera att den finns.
        </div>
      </div>
    `;
  }
}

function getBasePath() {
  // Om Pages ligger på /Mikaels-HR-Trendtracker/ så tar vi det från location.pathname
  // Ex: /Mikaels-HR-Trendtracker/ -> base = /Mikaels-HR-Trendtracker/
  const p = window.location.pathname;
  const parts = p.split("/").filter(Boolean);
  if (parts.length >= 1) return `/${parts[0]}/`;
  return "/";
}

async function load() {
  const qEl = document.getElementById("q");
  const catEl = document.getElementById("category");
  const srcEl = document.getElementById("source");
  const highlightsEl = document.getElementById("highlights");
  const listEl = document.getElementById("list");
  const sourcesEl = document.getElementById("sources");

  // Sätt placeholders
  setText("updatedAt", "—");
  setText("count", "—");
  setText("sourcesCount", "—");

  const base = getBasePath();
  const url = `${base}data/reports.json?nocache=${Date.now()}`;

  let data;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} när jag hämtar ${url}`);
    data = await res.json();
  } catch (e) {
    console.error(e);
    showFatal(String(e?.message || e));
    return;
  }

  const sources = [{ id: "all", name: "Alla källor" }, ...(data.sources || [])];
  if (srcEl) {
    srcEl.innerHTML = sources.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");
  }

  setText("updatedAt", data.updatedAt ? new Date(data.updatedAt).toLocaleString("sv-SE") : "—");
  setText("count", String((data.items || []).length));
  setText("sourcesCount", String((data.sources || []).length));

  if (sourcesEl) {
    sourcesEl.innerHTML = (data.sources || []).map(s => `<span class="badge">${escapeHtml(s.name)}</span>`).join("");
  }

  const enriched = (data.items || []).map(it => ({ ...it, category: inferCategory(it) }));

  function applyFilters(items) {
    const q = (qEl?.value || "").toLowerCase().trim();
    const cat = catEl?.value || "all";
    const src = srcEl?.value || "all";

    return items.filter(it => {
      if (src !== "all" && it.sourceId !== src) return false;
      if (cat !== "all" && it.category !== cat) return false;
      if (!q) return true;
      const hay = `${it.title || ""} ${it.snippet || ""} ${it.sourceName || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }

  function render() {
    const filtered = applyFilters(enriched);

    // highlights: top 5 by recency
    const hlPool = filtered.length ? filtered : enriched;
    const highlights = [...hlPool].sort((a,b) => scoreItem(b) - scoreItem(a)).slice(0, 5);

    if (highlightsEl) {
      highlightsEl.innerHTML = highlights.map(it => `
        <a class="hcard" href="${it.url}" target="_blank" rel="noopener noreferrer">
          <div class="hcard__top">
            <span>${escapeHtml(it.sourceName)} • ${escapeHtml(catLabel(it.category))}</span>
            <span>${formatDate(it.publishedAt)}</span>
          </div>
          <h3 class="hcard__title">${escapeHtml(it.title)}</h3>
          ${it.snippet ? `<p class="hcard__snip">${escapeHtml(it.snippet)}</p>` : ""}
        </a>
      `).join("");
    }

    const listItems = [...filtered].sort((a,b) => scoreItem(b) - scoreItem(a));
    if (listEl) {
      listEl.innerHTML = listItems.map(it => `
        <a class="row" href="${it.url}" target="_blank" rel="noopener noreferrer">
          <div class="row__meta">
            <span class="tag"><span class="dot"></span>${escapeHtml(catLabel(it.category))}</span>
            <span class="tag"><span class="dot dot2"></span>${escapeHtml(it.sourceName)}</span>
            <span class="tag">${formatDate(it.publishedAt)}</span>
          </div>
          <div style="margin-top:10px;font-weight:950;letter-spacing:-.01em">${escapeHtml(it.title)}</div>
          ${it.snippet ? `<div class="muted" style="margin-top:8px;font-size:13px;line-height:1.55">${escapeHtml(it.snippet)}</div>` : ""}
        </a>
      `).join("");

      if (!listItems.length) {
        listEl.innerHTML = `<div class="muted">Inga träffar för valda filter.</div>`;
      }
    }
  }

  qEl?.addEventListener("input", render);
  catEl?.addEventListener("change", render);
  srcEl?.addEventListener("change", render);
  render();
}

load();
