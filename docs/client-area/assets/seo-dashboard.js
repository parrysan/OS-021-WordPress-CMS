/* Built-in OS-021 SEO dashboard — per-instance data file, empty-state when none. */
(function (global) {
  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function tile(value, label) {
    const v = value == null ? "—" : String(value);
    return `<div class="os021-seo__tile"><b>${esc(v)}</b><span>${esc(label)}</span></div>`;
  }

  function aeoClass(state) {
    return "os021-seo__eng os021-seo__s-" + String(state || "").toLowerCase().replace(/\s+/g, "-");
  }

  function aeoShare(aeo) {
    const states = [aeo.chatgpt, aeo.perplexity, aeo.ai_overviews, aeo.claude];
    const answered = states.filter((s) => s && s !== "No AI answer").length;
    const cites = states.filter((s) => s === "Cited").length;
    const share = answered ? Math.round((100 * cites) / answered) : 0;
    return { share, cites, answered };
  }

  function renderEmpty(root, reason) {
    root.innerHTML = `<div class="os021-seo"><div class="os021-seo__empty-state">
      <h3>No SEO data for this instance yet</h3>
      <p>${esc(reason || "The SEO module is built into OS-021 for every instance. Add a per-instance feed at src/wp/instances/<id>.seo.json when data is ready.")}</p>
    </div></div>`;
  }

  function renderDashboard(root, data) {
    const totals = data.totals || {};
    const keywords = Array.isArray(data.keywords) ? data.keywords : [];
    const engines = data.engines || ["ChatGPT", "Perplexity", "Google AI Overviews", "Claude"];
    const nature = data.data_nature || "none";
    const banner = nature === "dummy"
      ? '<div class="os021-seo__banner" role="note">Demonstration values. Nothing is being tracked yet.</div>'
      : "";

    const seoRows = keywords.map((row) => {
      const seo = row.seo || {};
      const pos = seo.position == null ? "–" : String(seo.position);
      const arts = (row.posts || []).map((p) => esc(p.title || p.id)).join("<br>");
      const svc = (row.services || []).map((s) => `<span>${esc(s)}</span>`).join(" ");
      return `<tr>
        <td><span class="os021-seo__kw">${esc(row.phrase)}</span><span class="os021-seo__role">${esc(row.role || "")}</span></td>
        <td>${arts || "—"}</td>
        <td>${svc || "—"}</td>
        <td class="os021-seo__num">${esc(pos)}</td>
        <td class="os021-seo__num">${esc(seo.change ?? "–")}</td>
        <td class="os021-seo__num">${esc(seo.impressions ?? 0)}</td>
        <td class="os021-seo__num">${esc(seo.clicks ?? 0)}</td>
        <td>${esc(seo.status || "—")}</td>
      </tr>`;
    }).join("");

    const aeoRows = keywords.map((row) => {
      const aeo = row.aeo || {};
      const states = [aeo.chatgpt, aeo.perplexity, aeo.ai_overviews, aeo.claude];
      const { share, cites, answered } = aeoShare(aeo);
      const eng = states.map((s, i) =>
        `<td class="${aeoClass(s)}" data-label="${esc(engines[i] || "")}">${esc(s || "—")}</td>`
      ).join("");
      const arts = (row.posts || []).map((p) => esc(p.title || p.id)).join("<br>");
      return `<tr>
        <td><span class="os021-seo__kw">${esc(row.phrase)}</span><span class="os021-seo__role">${esc(row.role || "")}</span></td>
        <td>${arts || "—"}</td>
        ${eng}
        <td class="os021-seo__num">${share}% <small>${cites} of ${answered}</small></td>
      </tr>`;
    }).join("");

    root.innerHTML = `
      <div class="os021-seo">
        ${banner}
        <h3 class="os021-seo__title">SEO tracking</h3>
        <p class="os021-seo__meta">Built into OS-021 · ${esc(data.market ? `Market: ${data.market}` : "Market unset")} · ${esc(data.source || "")}</p>
        <div class="os021-seo__tiles" id="os021-seo-tiles-seo">
          ${tile(totals.keywords, "Keywords tracked")}
          ${tile(totals.ranking, "Showing a position")}
          ${tile(totals.top40, "In the top 40")}
          ${tile(totals.top10, "In the top 10")}
          ${tile(totals.impressions, "Impressions, 7 days")}
          ${tile(totals.clicks, "Clicks, 7 days")}
        </div>
        <div role="tablist" aria-label="Tracking view" class="os021-seo__tablist">
          <button type="button" role="tab" id="os021-seo-tab-seo" aria-selected="true" aria-controls="os021-seo-panel-seo">SEO</button>
          <button type="button" role="tab" id="os021-seo-tab-aeo" aria-selected="false" aria-controls="os021-seo-panel-aeo">AEO</button>
        </div>
        <section role="tabpanel" class="os021-seo__panel" id="os021-seo-panel-seo" aria-labelledby="os021-seo-tab-seo">
          <div class="scroll">
            <table aria-label="SEO keywords">
              <thead><tr>
                <th>Keyword</th><th>Article</th><th>Service</th>
                <th>Position</th><th>Change, 7 days</th><th>Impressions</th><th>Clicks</th><th>Status</th>
              </tr></thead>
              <tbody>${seoRows || `<tr><td colspan="8">No keywords in this feed.</td></tr>`}</tbody>
            </table>
          </div>
          <p class="os021-seo__lede">Where each keyword shows up in Google search results. Position 1 is the top. A dash means no position yet.</p>
        </section>
        <section role="tabpanel" class="os021-seo__panel" id="os021-seo-panel-aeo" aria-labelledby="os021-seo-tab-aeo" hidden>
          <div class="os021-seo__tiles">
            ${tile(totals.keywords, "Keywords tracked")}
            ${tile(totals.cited, "Cited in at least one answer")}
            ${tile(totals.mentioned, "Mentioned, not cited")}
            ${tile(totals.aeo_checks, "AI answers checked")}
          </div>
          <div class="scroll">
            <table aria-label="AEO keywords">
              <thead><tr>
                <th>Keyword</th><th>Article</th>
                ${engines.map((e) => `<th>${esc(e)}</th>`).join("")}
                <th>Answers citing site</th>
              </tr></thead>
              <tbody>${aeoRows || `<tr><td colspan="${2 + engines.length + 1}">No keywords in this feed.</td></tr>`}</tbody>
            </table>
          </div>
          <p class="os021-seo__lede">Whether AI answer engines mention or cite the site for each keyword. Demonstration checks only — no live AEO polling from this module.</p>
        </section>
        <p class="os021-seo__foot">This dashboard is a core OS-021 module. Data comes from <code>src/wp/instances/&lt;id&gt;.seo.json</code>. It does not start rank tracking or call DataForSEO.</p>
      </div>
    `;

    const tabSeo = root.querySelector("#os021-seo-tab-seo");
    const tabAeo = root.querySelector("#os021-seo-tab-aeo");
    const panelSeo = root.querySelector("#os021-seo-panel-seo");
    const panelAeo = root.querySelector("#os021-seo-panel-aeo");
    function select(which) {
      const seo = which === "seo";
      tabSeo.setAttribute("aria-selected", seo ? "true" : "false");
      tabAeo.setAttribute("aria-selected", seo ? "false" : "true");
      panelSeo.hidden = !seo;
      panelAeo.hidden = seo;
    }
    tabSeo.addEventListener("click", () => select("seo"));
    tabAeo.addEventListener("click", () => select("aeo"));
  }

  function mount(root, data) {
    if (!root) return;
    if (!data || data.data_nature === "none" || !Array.isArray(data.keywords) || data.keywords.length === 0) {
      renderEmpty(root, data && data.source);
      return;
    }
    renderDashboard(root, data);
  }

  global.Os021Seo = { mount, renderEmpty, renderDashboard };
})(window);
