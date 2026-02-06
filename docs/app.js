const CATEGORY_RULES = [
  { id: "ai", label: "AI & produktivitet", keywords: ["ai","artificial","automation","copilot","genai","productivity"] },
  { id: "hybrid", label: "Hybrid & kultur", keywords: ["hybrid","remote","flex","culture","engagement","belonging"] },
  { id: "skills", label: "Skills & reskilling", keywords: ["skills","reskill","upskill","learning","capability","talent marketplace"] },
  { id: "rewards", label: "Comp & rewards", keywords: ["comp","compensation","pay","salary","rewards","benefits","total rewards"] },
  { id: "leadership", label: "Ledarskap", keywords: ["leadership","manager","leaders","leading","executive","management"] }
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
  return String(s).replace(/[&<>"']/g, (c) => ({
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
  return ts;
}

async function load() {
  const res = await fetch("./data/reports.json", { cache: "no-store" });
  const data = await res.json();

  const qEl = document.getElementById("q");
  const catEl = document.getElementById("category");
  const srcEl = document.getElementById("source");

  const updatedAtEl = document.getElementById("updatedAt");
  const countEl = document.getElementById("count");
  const sourcesCountEl = document.getElementById("sourcesCount");

  const highlightsEl = document.getElementById("highlights");
  const listEl = document.getElementById("list");
  const sourcesEl = document.getElementById("sources");

  updatedAtEl.textContent = new Date(data.updatedAt).toLocaleString("sv-SE");
  countEl.textContent = String((data.items || []).length);
  sourcesCountEl.textContent = String((data.sources || []).length);

  const sources = [{ id: "all", name: "Alla källor" }, ...(data.sources || [])];
  srcEl.innerHTML = sources.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");

  sourcesEl.innerHTML = (data.sources || [])
    .map(s => `<span class="badge">${escapeHtml(s.name)}</span>`)
    .join("");

  const enriched = (data.items || []).map(it => ({ ...it, category: inferCategory(it) }));

  function applyFilters(items) {
    const q = (qEl.value || "").toLowerCase().trim();
    const cat = catEl.value;
    const src = srcEl.value;

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

    const hlPool = filtered.length ? filtered : enriched;
    const highlights = [...hlPool].sort((a,b) => scoreItem(b) - scoreItem(a)).slice(0, 5);

    highlightsEl.innerHTML = highlights.map(it => `
      <a class="hcard" href="${it.url}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(it.title)}">
        <div class="hcard__top">
          <span>${escapeHtml(it.sourceName)} • ${escapeHtml(catLabel(it.category))}</span>
          <span>${formatDate(it.publishedAt)}</span>
        </div>
        <h3 class="hcard__title">${escapeHtml(it.title)}</h3>
        ${it.snippet ? `<p class="hcard__snip">${escapeHtml(it.snippet)}</p>` : ""}
      </a>
    `).join("");

    const listItems = [...filtered].sort((a,b) => scoreItem(b) - scoreItem(a));

    listEl.innerHTML = listItems.map(it => `
      <a class="row" href="${it.url}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(it.title)}">
        <div class="row__main">
          <div class="row__meta">
            <span class="tag"><span class="dot"></span>${escapeHtml(catLabel(it.category))}</span>
            <span class="tag"><span class="dot dot2"></span>${escapeHtml(it.sourceName)}</span>
            <span class="tag">${formatDate(it.publishedAt)}</span>
          </div>
          <div style="margin-top:10px;font-weight:900;letter-spacing:-.01em">
            ${escapeHtml(it.title)}
          </div>
          ${it.snippet ? `<div class="muted" style="margin-top:8px;font-size:13px;line-height:1.55">${escapeHtml(it.snippet)}</div>` : ""}
        </div>
      </a>
    `).join("");

    if (!listItems.length) {
      listEl.innerHTML = `<div class="muted">Inga träffar för valda filter.</div>`;
    }
  }

  qEl.addEventListener("input", render);
  catEl.addEventListener("change", render);
  srcEl.addEventListener("change", render);
  render();
}

load().catch(err => {
  console.error(err);
  const listEl = document.getElementById("list");
  if (listEl) listEl.innerHTML = `<div class="muted">Kunde inte ladda data.</div>`;
});
