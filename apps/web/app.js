// YatraAI — India Travel Planner: hash router and app shell.

import { bootstrap, logout, onStateChange, state } from "./js/state.js";
import { escapeHtml, toast } from "./js/ui.js";
import { initAuthModal, openAuthModal } from "./js/views/auth.js";
import { renderDashboard, renderSavedTrip } from "./js/views/dashboard.js";
import { renderDestination } from "./js/views/destination.js";
import { renderHome } from "./js/views/home.js";
import { renderPlan } from "./js/views/plan.js";

const viewHost = document.getElementById("view");
let cleanup = null;
let renderToken = 0;

const routes = [
  { pattern: /^\/?$/, nav: "home", render: (root) => renderHome(root) },
  { pattern: /^\/destination\/([\w-]+)$/, nav: "home", render: (root, match) => renderDestination(root, { key: match[1] }) },
  { pattern: /^\/plan$/, nav: "plan", render: (root, _match, params) => renderPlan(root, params) },
  { pattern: /^\/trips$/, nav: "trips", render: (root) => renderDashboard(root) },
  { pattern: /^\/trip\/([\w-]+)$/, nav: "trips", render: (root, match) => renderSavedTrip(root, { id: match[1] }) },
];

function parseHash() {
  const raw = location.hash.replace(/^#/, "") || "/";
  const [path, query = ""] = raw.split("?");
  return { path, params: new URLSearchParams(query) };
}

async function route() {
  const token = ++renderToken;
  const { path, params } = parseHash();

  // In-page section anchors such as #season are handled by the browser.
  if (!path.startsWith("/")) {
    document.getElementById(path)?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  cleanup?.();
  cleanup = null;

  const match = routes.map((entry) => ({ entry, result: path.match(entry.pattern) })).find(({ result }) => result);
  document.querySelectorAll("[data-nav]").forEach((link) => link.classList.toggle("active", link.dataset.nav === match?.entry.nav));

  // Each view gets a fresh root so listeners never accumulate across navigations.
  const root = document.createElement("div");
  root.className = "view-root";
  viewHost.replaceChildren(root);
  window.scrollTo({ top: 0 });

  if (!match) {
    root.innerHTML = `<div class="empty-state"><h3>Page not found</h3><a class="primary-cta-button compact" href="#/">Go home</a></div>`;
    return;
  }

  try {
    const result = await match.entry.render(root, match.result, params);
    if (token === renderToken) cleanup = typeof result === "function" ? result : null;
    else if (typeof result === "function") result();
  } catch (error) {
    console.error(error);
    root.innerHTML = `<div class="empty-state"><h3>Something went wrong</h3><p>${escapeHtml(error.message)}</p></div>`;
  }
}

function renderAccountArea() {
  const host = document.getElementById("account-area");
  if (state.user) {
    host.innerHTML = `
      <details class="user-menu">
        <summary><span class="avatar" aria-hidden="true">${escapeHtml(state.user.name.charAt(0).toUpperCase())}</span><span class="user-name">${escapeHtml(state.user.name.split(" ")[0])}</span></summary>
        <div class="user-menu-panel">
          <span class="muted small">${escapeHtml(state.user.email)}</span>
          <a href="#/trips">My trips</a>
          <button type="button" id="logout-btn">Log out</button>
        </div>
      </details>`;
    host.querySelector("#logout-btn").addEventListener("click", async () => {
      await logout();
      toast("You're logged out", "info");
      if (location.hash.startsWith("#/trip")) location.hash = "#/";
      else route();
    });
  } else {
    host.innerHTML = `
      <button type="button" class="nav-link-btn ghost" data-auth="login">Log in</button>
      <button type="button" class="nav-link-btn" data-auth="signup">Sign up</button>`;
    host.querySelectorAll("[data-auth]").forEach((button) => button.addEventListener("click", () => openAuthModal(button.dataset.auth)));
  }
}

let lastUserId;
onStateChange(() => {
  renderAccountArea();
  const userId = state.user?.id ?? null;
  // Re-render user-dependent pages when someone logs in or out.
  if (lastUserId !== undefined && userId !== lastUserId) route();
  lastUserId = userId;
});

// Same-page section links (e.g. href="#costs") scroll without touching the route.
document.addEventListener("click", (event) => {
  const link = event.target.closest('a[href^="#"]');
  const href = link?.getAttribute("href") ?? "";
  if (!link || href.startsWith("#/") || href === "#") return;
  const target = document.getElementById(href.slice(1));
  if (!target) return;
  event.preventDefault();
  target.scrollIntoView({ behavior: "smooth", block: "start" });
});

window.addEventListener("hashchange", route);
initAuthModal();
renderAccountArea();
await bootstrap();
lastUserId = state.user?.id ?? null;
route();
