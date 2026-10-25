/* Multi-instance WordPress feed loader for Client Area pages. */
(function (global) {
  const STORAGE_KEY = "os021-instance-id";

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function statusPill(status) {
    const s = String(status || "").toLowerCase();
    if (s === "active" || s === "must-use") return `<span class="pill active">${escapeHtml(s)}</span>`;
    if (s === "inactive") return '<span class="pill inactive">inactive</span>';
    if (s === "connected") return '<span class="pill active">connected</span>';
    if (s === "not_connected" || s === "not connected yet") return '<span class="pill inactive">not connected yet</span>';
    return `<span class="pill inactive">${escapeHtml(status || "—")}</span>`;
  }

  function updatePill(update) {
    const u = String(update || "none").toLowerCase();
    if (u === "available") return '<span class="pill available">update available</span>';
    return "—";
  }

  function feedBases() {
    return ["../../src/wp/", "../src/wp/", "/src/wp/"];
  }

  async function fetchJson(url) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      return res.ok ? await res.json() : null;
    } catch (_) {
      return null;
    }
  }

  async function fetchText(url) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      return res.ok ? await res.text() : null;
    } catch (_) {
      return null;
    }
  }

  async function loadCatalog() {
    for (const base of feedBases()) {
      const data = await fetchJson(base + "instances.json");
      if (data) return { catalog: data, base };
    }
    return null;
  }

  function deepMerge(a, b) {
    if (!b) return a;
    const out = { ...a, ...b };
    if (a && a.site && b.site) out.site = { ...a.site, ...b.site };
    if (a && a.seo && b.seo) out.seo = { ...a.seo, ...b.seo };
    if (a && a.acf && b.acf) out.acf = { ...a.acf, ...b.acf };
    return out;
  }

  function getSelectedId(catalog) {
    const params = new URLSearchParams(global.location.search);
    const fromQuery = params.get("instance");
    if (fromQuery && catalog.instances.some((i) => i.id === fromQuery)) return fromQuery;
    try {
      const stored = global.localStorage.getItem(STORAGE_KEY);
      if (stored && catalog.instances.some((i) => i.id === stored)) return stored;
    } catch (_) { /* ignore */ }
    return catalog.default || (catalog.instances[0] && catalog.instances[0].id);
  }

  function setSelectedId(id) {
    try { global.localStorage.setItem(STORAGE_KEY, id); } catch (_) { /* ignore */ }
  }

  async function loadInstanceFeed(base, entry) {
    const feedPath = entry.feed || (`instances/${entry.id}.json`);
    const data = await fetchJson(base + feedPath);
    if (!data) return null;
    const localName = feedPath.replace(/\.json$/, ".local.json");
    const local = await fetchJson(base + localName);
    return deepMerge(data, local);
  }

  async function loadSeoFeed(base, entry) {
    const id = entry.id;
    const candidates = [
      `instances/${id}.seo.json`,
      (entry.feed || "").replace(/\.json$/, ".seo.json"),
    ].filter(Boolean);
    for (const path of candidates) {
      const data = await fetchJson(base + path);
      if (data) return data;
    }
    return {
      instance_id: id,
      data_nature: "none",
      source: "SEO module present; no per-instance data file yet.",
      totals: null,
      engines: ["ChatGPT", "Perplexity", "Google AI Overviews", "Claude"],
      keywords: [],
    };
  }

  async function loadInstance() {
    const loaded = await loadCatalog();
    if (!loaded) return null;
    const { catalog, base } = loaded;
    const id = getSelectedId(catalog);
    const entry = catalog.instances.find((i) => i.id === id) || catalog.instances[0];
    if (!entry) return null;
    setSelectedId(entry.id);
    const data = await loadInstanceFeed(base, entry);
    const seoData = await loadSeoFeed(base, entry);
    return {
      catalog,
      entry,
      base,
      seoData,
      data: data || {
        id: entry.id,
        name: entry.name,
        status: entry.status,
        site: {},
        plugins: [],
        themes: [],
        settings: {},
        acf: null,
        seo: { module: "built-in", data_nature: "none", notes: "Feed missing." },
      },
    };
  }

  function withInstanceQuery(href, id) {
    try {
      const u = new URL(href, global.location.href);
      u.searchParams.set("instance", id);
      return u.pathname + u.search + u.hash;
    } catch (_) {
      const join = href.includes("?") ? "&" : "?";
      return `${href}${join}instance=${encodeURIComponent(id)}`;
    }
  }

  function mountSwitcher(bundle) {
    const host = document.getElementById("instance-switcher");
    if (!host || !bundle) return;
    const { catalog, entry } = bundle;
    host.innerHTML = `
      <label class="instance-switcher__label" for="instance-select">Instance</label>
      <select id="instance-select" class="instance-switcher__select" aria-label="WordPress instance">
        ${catalog.instances.map((i) => {
          const label = i.status === "not_connected"
            ? `${escapeHtml(i.name)} — not connected yet`
            : escapeHtml(i.name);
          const sel = i.id === entry.id ? " selected" : "";
          return `<option value="${escapeHtml(i.id)}"${sel}>${label}</option>`;
        }).join("")}
      </select>
    `;
    const select = host.querySelector("#instance-select");
    if (select) {
      select.addEventListener("change", () => {
        const id = select.value;
        setSelectedId(id);
        global.location.search = `?instance=${encodeURIComponent(id)}`;
      });
    }
    document.querySelectorAll("nav.og-tab-rail a[href]").forEach((a) => {
      a.href = withInstanceQuery(a.getAttribute("href"), entry.id);
    });
  }

  function siteUrls(data) {
    const site = (data && data.site) || {};
    const siteUrl = site.url || "";
    const adminUrl = site.admin_url || (siteUrl ? siteUrl.replace(/\/?$/, "/") + "wp-admin/" : "");
    return { siteUrl, adminUrl, site };
  }

  function isConfigured(url) {
    return Boolean(url) && !url.includes("<") && !url.includes("not connected");
  }

  function applyOverview(bundle) {
    const data = (bundle && bundle.data) || {};
    const entry = (bundle && bundle.entry) || {};
    const urls = siteUrls(data);
    const configured = isConfigured(urls.siteUrl) && isConfigured(urls.adminUrl);
    const disconnected = (data.status || entry.status) === "not_connected";
    const siteUrl = disconnected ? "Not connected yet" : (configured ? urls.siteUrl : "Host not configured");
    const adminUrl = disconnected ? "Not connected yet" : (configured ? urls.adminUrl : "Host not configured");
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set("instance-name", data.name || entry.name || "—");
    set("instance-status", (data.status || entry.status || "—").replaceAll("_", " "));
    set("instance-project", data.project || entry.project || "—");
    set("site-url", siteUrl || "— not linked yet —");
    set("admin-url", adminUrl || "— not linked yet —");
    set("production-url", (urls.site && urls.site.production_url) || "—");
    set("wp-version", (urls.site && urls.site.wp_version) || "—");
    set("php-version", (urls.site && urls.site.php_version) || "—");
    set("environment", (urls.site && urls.site.environment) || "—");
    set("last-sync", data.synced_at || "never");

    const admin = document.getElementById("wp-admin-link");
    if (admin) {
      const linkable = configured && !disconnected;
      admin.hidden = !linkable;
      if (linkable) {
        admin.href = urls.adminUrl;
        admin.removeAttribute("aria-disabled");
      } else {
        admin.href = "#";
        admin.setAttribute("aria-disabled", "true");
      }
    }

    const statusBox = document.getElementById("where-things-stand");
    if (statusBox) {
      if (disconnected) {
        statusBox.innerHTML = `<b>Not connected yet.</b> ${escapeHtml(data.name || entry.name || "This instance")} (${escapeHtml(data.project || entry.project || "")}) is stubbed for later. Do not touch the live site or DNS until the captain answers hosting/credentials questions.`;
      } else {
        statusBox.innerHTML = `<b>Connected.</b> ${escapeHtml(data.name || "Instance")} feed: <code>src/wp/instances/${escapeHtml(data.id || entry.id || "")}.json</code>. Production: ${escapeHtml((urls.site && urls.site.production_url) || "—")}.`;
      }
    }
  }

  function renderPluginsTable(bundle) {
    const body = document.getElementById("plugins-body");
    if (!body) return;
    const data = (bundle && bundle.data) || {};
    if ((data.status || "") === "not_connected") {
      body.innerHTML = '<tr><td colspan="5"><div class="dataspace"><div class="lbl">Not connected yet</div><h3>No plugins</h3><p>Connect this instance and run <code>./src/wp/sync-instance.sh</code>.</p></div></td></tr>';
      return;
    }
    const plugins = data.plugins || [];
    if (!plugins.length) {
      body.innerHTML = '<tr><td colspan="5"><div class="dataspace"><div class="lbl">Awaiting instance</div><h3>No plugins listed yet</h3><p>Sync with <code>./src/wp/sync-instance.sh &lt;id&gt;</code>.</p></div></td></tr>';
      return;
    }
    body.innerHTML = plugins.map((p) => `
      <tr>
        <td>${escapeHtml(p.name || p.title || p.slug || "—")}</td>
        <td><code>${escapeHtml(p.slug || p.name || "—")}</code></td>
        <td>${escapeHtml(p.version || "—")}</td>
        <td>${statusPill(p.status)}</td>
        <td>${updatePill(p.update)}</td>
      </tr>
    `).join("");
  }

  function renderSettings(bundle) {
    const root = document.getElementById("settings-list");
    if (!root) return;
    const data = (bundle && bundle.data) || {};
    if ((data.status || "") === "not_connected") {
      root.innerHTML = '<div class="dataspace"><div class="lbl">Not connected yet</div><h3>No settings</h3><p>Stub instance — connect before syncing core options.</p></div>';
      return;
    }
    const settings = data.settings || {};
    const entries = Object.entries(settings);
    if (!entries.length) {
      root.innerHTML = '<div class="dataspace"><div class="lbl">Awaiting instance</div><h3>No settings yet</h3><p>Core options will appear here after sync.</p></div>';
      return;
    }
    root.innerHTML = `<dl class="meta-grid">${entries.map(([k, v]) => `
      <div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v || "—")}</dd></div>
    `).join("")}</dl>`;
  }

  function renderThemes(bundle) {
    const root = document.getElementById("themes-list");
    if (!root) return;
    const data = (bundle && bundle.data) || {};
    if ((data.status || "") === "not_connected") {
      root.innerHTML = '<div class="dataspace"><div class="lbl">Not connected yet</div><h3>No themes</h3><p>Stub instance.</p></div>';
      return;
    }
    const themes = data.themes || [];
    if (!themes.length) {
      root.innerHTML = '<div class="dataspace"><div class="lbl">Awaiting instance</div><h3>No themes yet</h3><p>Sync with WP-CLI theme list.</p></div>';
      return;
    }
    root.innerHTML = `<ul>${themes.map((t) => {
      const mark = String(t.status || "").toLowerCase() === "active" ? " · active" : "";
      return `<li><strong>${escapeHtml(t.name || t.stylesheet)}</strong>${mark} — ${escapeHtml(t.version || "")}</li>`;
    }).join("")}</ul>`;
  }

  function renderAcf(bundle) {
    const root = document.getElementById("acf-status");
    if (!root) return;
    const data = (bundle && bundle.data) || {};
    if ((data.status || "") === "not_connected") {
      root.innerHTML = '<div class="dataspace"><div class="lbl">Not connected yet</div><h3>ACF unknown</h3><p>Connect the instance to detect ACF Pro presence (licence never written to feeds).</p></div>';
      return;
    }
    const acf = data.acf;
    if (!acf) {
      root.innerHTML = '<div class="dataspace"><div class="lbl">Awaiting instance</div><h3>ACF not detected</h3><p>Install ACF and enable Local JSON on the linked site.</p></div>';
      return;
    }
    const groups = acf.field_groups || [];
    const blocks = acf.blocks || [];
    root.innerHTML = `
      <dl class="meta-grid">
        <div><dt>Active</dt><dd>${acf.active ? "yes" : "no"}</dd></div>
        <div><dt>ACF Pro</dt><dd>${acf.pro ? "present (licence not shown)" : "no"}</dd></div>
        <div><dt>Version</dt><dd>${escapeHtml(acf.version || "—")}</dd></div>
        <div><dt>Local JSON</dt><dd><code>${escapeHtml(acf.local_json_path || "—")}</code></dd></div>
        <div><dt>Field groups</dt><dd>${groups.length}</dd></div>
        <div><dt>ACF blocks</dt><dd>${blocks.length}</dd></div>
      </dl>
      ${groups.length ? `<h3>Field groups</h3><ul>${groups.map((g) =>
        `<li><strong>${escapeHtml(g.title || g.key)}</strong> — <code>${escapeHtml(g.key || "")}</code>${g.local ? ` · ${escapeHtml(g.local)}` : ""}</li>`
      ).join("")}</ul>` : ""}
      ${blocks.length ? `<h3>Blocks</h3><ul>${blocks.map((b) =>
        `<li><strong>${escapeHtml(b.title || b.name)}</strong> — <code>${escapeHtml(b.name || "")}</code></li>`
      ).join("")}</ul>` : ""}
    `;
  }

  function renderSeo(bundle) {
    const root = document.getElementById("seo-panel");
    if (!root) return;
    const data = (bundle && bundle.data) || {};
    const entry = (bundle && bundle.entry) || {};
    const seoMeta = data.seo || {};
    const seoData = (bundle && bundle.seoData) || {
      data_nature: "none",
      keywords: [],
      source: "SEO module present; no per-instance data file yet.",
    };
    const disconnected = (data.status || entry.status) === "not_connected";
    const wpUrl = seoMeta.wp_admin_dashboard_url || "";
    const configured = isConfigured(wpUrl);

    const meta = document.createElement("div");
    meta.innerHTML = `
      <dl class="meta-grid">
        <div><dt>Instance</dt><dd>${escapeHtml(data.name || entry.name || "—")}</dd></div>
        <div><dt>Module</dt><dd>Built into OS-021 (default for every instance)</dd></div>
        <div><dt>Data file</dt><dd><code>src/wp/instances/${escapeHtml(entry.id || data.id || "")}.seo.json</code></dd></div>
        <div><dt>Data nature</dt><dd>${escapeHtml(seoData.data_nature || "none")}${(seoData.data_nature || "") === "dummy" ? " (demonstration — not live rank tracking)" : ""}</dd></div>
        ${configured ? `<div><dt>WP-admin mirror</dt><dd><a href="${escapeHtml(wpUrl)}" target="_blank" rel="noopener">${escapeHtml(seoMeta.dashboard_label || "Open staging wp-admin SEO")} ↗</a></dd></div>` : ""}
      </dl>
      ${disconnected && Array.isArray(data.connection_needed) ? `
        <h3>To connect this instance</h3>
        <ul>${data.connection_needed.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul>
      ` : ""}
    `;
    const dash = document.createElement("div");
    dash.id = "os021-seo-root";
    root.replaceChildren(meta, dash);
    if (global.Os021Seo && typeof global.Os021Seo.mount === "function") {
      global.Os021Seo.mount(dash, seoData);
    } else {
      dash.innerHTML = '<div class="note">SEO dashboard script missing.</div>';
    }
  }

  function activityPill(status, settled) {
    const s = String(status || "");
    if (s === "applied") return '<span class="pill active">applied</span>';
    if (s === "awaiting_approval" && settled) return '<span class="pill inactive">approval requested</span>';
    if (s === "awaiting_approval") return '<span class="pill available">waiting for approval</span>';
    return `<span class="pill inactive">${escapeHtml(s.replaceAll("_", " ") || "—")}</span>`;
  }

  function parseActivity(text) {
    return String(text || "").split("\n").filter(Boolean).map((line) => {
      try { return JSON.parse(line); } catch (_) { return null; }
    }).filter(Boolean);
  }

  // A write is still waiting when its token has no later applied/failed/rejected entry.
  function settledTokens(entries) {
    return new Set(entries
      .filter((e) => e.approval && e.status !== "awaiting_approval")
      .map((e) => e.approval.token));
  }

  async function renderActivity(bundle) {
    const logRoot = document.getElementById("activity-log");
    const pendingRoot = document.getElementById("activity-pending");
    if (!logRoot || !pendingRoot) return;
    const entry = (bundle && bundle.entry) || {};
    const text = bundle && bundle.base ? await fetchText(`${bundle.base}instances/${entry.id}.log.jsonl`) : null;
    const entries = parseActivity(text);
    const id = escapeHtml(entry.id || "<id>");
    const settled = settledTokens(entries);
    const waiting = entries.filter((e) => e.status === "awaiting_approval" && e.approval && !settled.has(e.approval.token));
    pendingRoot.innerHTML = waiting.length
      ? `<ul>${waiting.map((e) => `
          <li><code>${escapeHtml(e.command || "")}</code> — ${escapeHtml(e.reason || "")}<br>
          Requested by ${escapeHtml(e.actor || "—")} at ${escapeHtml(e.ts || "")}. Approve at a terminal: <code>./src/wp/wp-write.sh ${id} --approve ${escapeHtml(e.approval.token)}</code></li>
        `).join("")}</ul>`
      : '<p>Nothing waiting.</p>';
    if (!entries.length) {
      logRoot.innerHTML = `<div class="dataspace"><div class="lbl">No activity yet</div><h3>No agent writes logged</h3><p>Writes made with <code>./src/wp/wp-write.sh ${id} …</code> on this machine appear here.</p></div>`;
      return;
    }
    const rows = entries.slice(-50).reverse();
    logRoot.innerHTML = `<div class="scroll"><table>
      <thead><tr><th>Time (UTC)</th><th>Actor</th><th>Command</th><th>Status</th><th>Note</th></tr></thead>
      <tbody>${rows.map((e) => {
        const note = [
          e.reason,
          (e.defaults || []).join(", "),
          e.approval && e.approval.approved_by ? `approved by ${e.approval.approved_by}` : "",
          e.approval && e.approval.rejected_by ? `rejected by ${e.approval.rejected_by}` : "",
          e.status === "failed" ? e.output : "",
        ].filter(Boolean).join(" · ");
        return `<tr>
          <td>${escapeHtml(String(e.ts || "—").replace("T", " ").replace("Z", ""))}</td>
          <td>${escapeHtml(e.actor || "—")}</td>
          <td><code>${escapeHtml(e.command || "")}</code></td>
          <td>${activityPill(e.status, e.approval && settled.has(e.approval.token))}</td>
          <td>${escapeHtml(note || "—")}</td>
        </tr>`;
      }).join("")}</tbody>
    </table></div>`;
  }

  async function boot(renderers) {
    const bundle = await loadInstance();
    mountSwitcher(bundle);
    (renderers || []).forEach((fn) => fn(bundle || {}));
    return bundle;
  }

  global.WpCms = {
    loadInstance,
    boot,
    mountSwitcher,
    applyOverview,
    renderPluginsTable,
    renderSettings,
    renderThemes,
    renderAcf,
    renderSeo,
    renderActivity,
    escapeHtml,
    statusPill,
  };
})(window);
