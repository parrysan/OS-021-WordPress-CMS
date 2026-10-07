/* Shared WordPress instance snapshot loader for Client Area pages. */
(function (global) {
  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function statusPill(status) {
    const s = String(status || "").toLowerCase();
    if (s === "active") return '<span class="pill active">active</span>';
    if (s === "inactive") return '<span class="pill inactive">inactive</span>';
    return `<span class="pill inactive">${escapeHtml(status || "—")}</span>`;
  }

  function updatePill(update) {
    const u = String(update || "none").toLowerCase();
    if (u === "available") return '<span class="pill available">update available</span>';
    return "—";
  }

  async function loadInstance() {
    const bases = [
      "../../src/wp/",
      "../src/wp/",
      "/src/wp/",
    ];
    const fetchJson = async (url) => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        return res.ok ? await res.json() : null;
      } catch (_) { return null; }
    };
    for (const base of bases) {
      const data = await fetchJson(base + "instance.json");
      if (!data) continue;
      const local = await fetchJson(base + "instance.local.json");
      return local ? { ...data, ...local, site: { ...data.site, ...local.site } } : data;
    }
    return null;
  }

  function siteUrls(data) {
    const site = (data && data.site) || {};
    const siteUrl = site.url || (data && data.site_url) || "";
    const adminUrl = site.admin_url || (siteUrl ? siteUrl.replace(/\/?$/, "/") + "wp-admin/" : "");
    return { siteUrl, adminUrl, site };
  }

  function applyOverview(data) {
    const urls = siteUrls(data || {});
    const { site } = urls;
    const configured = !urls.siteUrl.includes("<") && !urls.adminUrl.includes("<");
    const siteUrl = configured ? urls.siteUrl : "Host not configured";
    const adminUrl = configured ? urls.adminUrl : "Host not configured";
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set("site-url", siteUrl || "— not linked yet —");
    set("admin-url", adminUrl || "— not linked yet —");
    set("wp-version", site.wp_version || "—");
    set("php-version", site.php_version || "—");
    set("environment", site.environment || "local / Studio");
    set("last-sync", (data && data.synced_at) || "never");

    const admin = document.getElementById("wp-admin-link");
    if (admin) {
      const linkable = configured && adminUrl;
      admin.hidden = !linkable;
      if (linkable) {
        admin.href = adminUrl;
        admin.removeAttribute("aria-disabled");
      } else {
        admin.href = "#";
        admin.setAttribute("aria-disabled", "true");
      }
    }
  }

  function renderPluginsTable(data) {
    const body = document.getElementById("plugins-body");
    if (!body) return;
    const plugins = (data && data.plugins) || [];
    if (!plugins.length) {
      body.innerHTML = '<tr><td colspan="5"><div class="dataspace"><div class="lbl">Awaiting instance</div><h3>No plugins listed yet</h3><p>Link a WordPress Studio site and sync <code>src/wp/instance.json</code> from <code>wp plugin list --format=json</code>.</p></div></td></tr>';
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

  function renderSettings(data) {
    const root = document.getElementById("settings-list");
    if (!root) return;
    const settings = (data && data.settings) || {};
    const entries = Object.entries(settings);
    if (!entries.length) {
      root.innerHTML = '<div class="dataspace"><div class="lbl">Awaiting instance</div><h3>No settings yet</h3><p>Core options will appear here after sync.</p></div>';
      return;
    }
    root.innerHTML = `<dl class="meta-grid">${entries.map(([k, v]) => `
      <div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v || "—")}</dd></div>
    `).join("")}</dl>`;
  }

  function renderThemes(data) {
    const root = document.getElementById("themes-list");
    if (!root) return;
    const themes = (data && data.themes) || [];
    if (!themes.length) {
      root.innerHTML = '<div class="dataspace"><div class="lbl">Awaiting instance</div><h3>No themes yet</h3><p>Sync with <code>wp theme list --format=json</code>.</p></div>';
      return;
    }
    root.innerHTML = `<ul>${themes.map((t) => {
      const mark = String(t.status || "").toLowerCase() === "active" ? " · active" : "";
      return `<li><strong>${escapeHtml(t.name || t.stylesheet)}</strong>${mark} — ${escapeHtml(t.version || "")}</li>`;
    }).join("")}</ul>`;
  }

  function renderAcf(data) {
    const root = document.getElementById("acf-status");
    if (!root) return;
    const acf = (data && data.acf) || null;
    if (!acf) {
      root.innerHTML = '<div class="dataspace"><div class="lbl">Awaiting instance</div><h3>ACF not detected</h3><p>Install ACF and enable Local JSON on the linked site.</p></div>';
      return;
    }
    root.innerHTML = `<dl class="meta-grid">
      <div><dt>Active</dt><dd>${acf.active ? "yes" : "no"}</dd></div>
      <div><dt>Local JSON</dt><dd><code>${escapeHtml(acf.local_json_path || "—")}</code></dd></div>
    </dl>`;
  }

  global.WpCms = {
    loadInstance,
    applyOverview,
    renderPluginsTable,
    renderSettings,
    renderThemes,
    renderAcf,
    escapeHtml,
  };
})(window);
