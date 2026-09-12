/* OS-021 project page — loads src/wp/instance.json when served from repo, or file:// fetch may fail (shows empty state). */

const TABS = ["overview", "plugins", "themes", "settings", "acf"];

function $(id) { return document.getElementById(id); }

function activateTab(name) {
  TABS.forEach((tab) => {
    const btn = $(`tab-${tab}`);
    const panel = $(`panel-${tab}`);
    const on = tab === name;
    if (btn) btn.setAttribute("aria-selected", on ? "true" : "false");
    if (panel) panel.hidden = !on;
  });
  history.replaceState(null, "", `#${name}`);
}

document.querySelectorAll(".tabs [role=tab]").forEach((btn) => {
  btn.addEventListener("click", () => activateTab(btn.dataset.tab));
});

function statusBadge(status) {
  const s = String(status || "").toLowerCase();
  if (s === "active") return '<span class="badge active">active</span>';
  if (s === "inactive") return '<span class="badge inactive">inactive</span>';
  return `<span class="badge inactive">${escapeHtml(status || "—")}</span>`;
}

function updateBadge(update) {
  if (!update || update === "none" || update === "available" && false) {
    /* fall through */
  }
  const u = String(update || "none").toLowerCase();
  if (u === "available") return '<span class="badge available">update available</span>';
  return '<span class="badge none">—</span>';
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderPlugins(plugins) {
  const body = $("plugins-body");
  if (!plugins || !plugins.length) {
    body.innerHTML = '<tr class="empty"><td colspan="5">No plugin data yet — link a WordPress instance or load a snapshot.</td></tr>';
    return;
  }
  body.innerHTML = plugins.map((p) => `
    <tr>
      <td>${escapeHtml(p.name || p.title || p.slug || "—")}</td>
      <td><code>${escapeHtml(p.slug || p.name || "—")}</code></td>
      <td>${escapeHtml(p.version || "—")}</td>
      <td>${statusBadge(p.status)}</td>
      <td>${updateBadge(p.update)}</td>
    </tr>
  `).join("");
}

function renderSettings(settings) {
  const root = $("settings-list");
  if (!settings || !Object.keys(settings).length) return;
  root.innerHTML = Object.entries(settings).map(([k, v]) => `
    <div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v ?? "—")}</dd></div>
  `).join("");
}

function renderThemes(themes) {
  const list = $("themes-list");
  if (!themes || !themes.length) {
    list.innerHTML = '<li class="muted">—</li>';
    return;
  }
  list.innerHTML = themes.map((t) => {
    const mark = t.status === "active" ? " (active)" : "";
    return `<li>${escapeHtml(t.name || t.stylesheet)}${mark} · ${escapeHtml(t.version || "")}</li>`;
  }).join("");
}

function applyInstance(data) {
  const site = data.site || {};
  const siteUrl = site.url || data.site_url || "";
  const adminUrl = site.admin_url || (siteUrl ? siteUrl.replace(/\/?$/, "/") + "wp-admin/" : "");

  $("site-url").textContent = siteUrl || "— not linked yet —";
  $("admin-url").textContent = adminUrl || "— not linked yet —";
  $("wp-version").textContent = site.wp_version || data.wp_version || "—";
  $("php-version").textContent = site.php_version || data.php_version || "—";
  $("environment").textContent = site.environment || data.environment || "local / Studio";
  $("last-sync").textContent = data.synced_at || "never";

  const admin = $("wp-admin-link");
  if (adminUrl) {
    admin.href = adminUrl;
    admin.classList.remove("is-disabled");
    admin.removeAttribute("aria-disabled");
  } else {
    admin.href = "#";
    admin.classList.add("is-disabled");
    admin.setAttribute("aria-disabled", "true");
  }

  $("connection-status").textContent = JSON.stringify({
    site_url: siteUrl || null,
    admin_url: adminUrl || null,
    source: data.source || "src/wp/instance.json",
    synced_at: data.synced_at || null,
  }, null, 2);

  renderPlugins(data.plugins || []);
  renderThemes(data.themes || []);
  renderSettings(data.settings || {});
  if (data.acf) {
    $("acf-status").textContent = JSON.stringify(data.acf, null, 2);
  }
}

async function loadInstance() {
  // Prefer sibling snapshot paths depending on how the page is opened.
  const candidates = [
    "../../src/wp/instance.json",
    "../src/wp/instance.json",
    "./instance.json",
  ];
  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const data = await res.json();
      applyInstance(data);
      return;
    } catch (_) { /* try next */ }
  }
  applyInstance({});
}

$("refresh-btn").addEventListener("click", () => loadInstance());

const initial = (location.hash || "#overview").slice(1);
activateTab(TABS.includes(initial) ? initial : "overview");
loadInstance();
