async function load() {
  const res = await fetch("./data/reports.json", { cache: "no-store" });
  const data = await res.json();

  const qEl = document.getElementById("q");
  const sEl = document.getElementById("source");
  const metaEl = document.getElementById("meta");
  const listEl = document.getElementById("list");

  const sources = [{ id: "all", name: "Alla källor" }, ...(data.sources || [])];
  sEl.innerHTML = sources.map(s => `<option value="${s.id}">${s.name}</option>`).join("");

  metaEl.textContent = `Senast uppdaterad: ${new Date(data.updatedAt).toLocaleString("sv-SE")}`;

  function render() {
    const q = (qEl.value || "").toLowerCase().trim();
    const src = sEl.value;

    const items = (data.items || []).filter(it => {
      if (src !== "all" && it.sourceId !== src) return false;
      if (!q) return true;
      return (
        (it.title || "").toLowerCase().includes(q) ||
        (it.snippet || "").toLowerCase().includes(q) ||
        (it.sourceName || "").toLowerCase().includes(q)
      );
    });

    listEl.innerHTML = items.map(it => {
      const dt = it.publishedAt
        ? new Date(it.publishedAt).toLocaleDateString("sv-SE")
        : "—";

      return `
        <article class="card">
          <div class="kicker">
            <span>${escapeHtml(it.sourceName)}</span>
            <span>${dt}</span>
          </div>
          <h3 class="title">
            <a href="${it.url}" target="_blank" rel="noopener noreferrer">
              ${escapeHtml(it.title)}
            </a>
          </h3>
          ${it.snippet ? `<p class="snip">${escapeHtml(it.snippet)}</p>` : ""}
        </article>
      `;
    }).join("");

    if (!items.length) {
      listEl.innerHTML = `<div class="muted">Inga träffar.</div>`;
    }
  }

  qEl.addEventListener("input", render);
  sEl.addEventListener("change", render);
  render();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    "\"":"&quot;",
    "'":"&#039;"
  }[c]));
}

load().catch(err => {
  console.error(err);
  const meta = document.getElementById("meta");
  if (meta) meta.textContent = "Kunde inte ladda data (reports.json saknas?).";
});
