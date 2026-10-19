// Login / sign-up modal with optional Google Identity Services button.

import { api } from "../api.js";
import { completeLogin, state } from "../state.js";
import { escapeHtml, toast } from "../ui.js";

let afterLogin = null;
let googleScriptPromise = null;

function loadGoogleScript() {
  googleScriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return googleScriptPromise;
}

async function finish(result) {
  await completeLogin(result);
  closeAuthModal();
  toast(`Welcome, ${result.user.name.split(" ")[0]}!`, "success");
  const callback = afterLogin;
  afterLogin = null;
  callback?.();
}

async function renderGoogleButton(container) {
  const clientId = state.config.googleClientId;
  if (!clientId) return;
  try {
    await loadGoogleScript();
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async ({ credential }) => {
        try {
          await finish(await api("/api/auth/google", { method: "POST", body: { credential } }));
        } catch (error) {
          showError(error.message);
        }
      },
    });
    window.google.accounts.id.renderButton(container, { theme: "filled_black", size: "large", width: 300, text: "continue_with" });
  } catch {
    container.innerHTML = `<p class="muted small">Google sign-in couldn't load.</p>`;
  }
}

function showError(message) {
  const box = document.getElementById("auth-error");
  if (!box) return;
  box.textContent = message;
  box.hidden = !message;
}

function modalHtml(mode, message) {
  const signup = mode === "signup";
  return `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <button type="button" class="modal-close" data-close aria-label="Close">✕</button>
      <h2 id="auth-title">${signup ? "Create your account" : "Welcome back"}</h2>
      <p class="muted">${escapeHtml(message || (signup ? "Save itineraries and pick up where you left off on any device." : "Log in to see your saved trips."))}</p>
      <div class="auth-tabs" role="tablist">
        <button type="button" role="tab" class="${signup ? "" : "active"}" data-mode="login" aria-selected="${!signup}">Log in</button>
        <button type="button" role="tab" class="${signup ? "active" : ""}" data-mode="signup" aria-selected="${signup}">Sign up</button>
      </div>
      <form id="auth-form" novalidate>
        ${
          signup
            ? `<div class="form-group"><label class="field-label" for="auth-name">Name</label><input id="auth-name" name="name" autocomplete="name" required maxlength="80" /></div>`
            : ""
        }
        <div class="form-group"><label class="field-label" for="auth-email">Email</label><input id="auth-email" name="email" type="email" autocomplete="email" required /></div>
        <div class="form-group">
          <label class="field-label" for="auth-password">Password</label>
          <input id="auth-password" name="password" type="password" autocomplete="${signup ? "new-password" : "current-password"}" required minlength="${signup ? 8 : 1}" />
          ${signup ? `<span class="muted small">At least 8 characters.</span>` : ""}
        </div>
        <div id="auth-error" class="alert-box" role="alert" hidden></div>
        <button type="submit" class="primary-cta-button">${signup ? "Create account" : "Log in"}</button>
      </form>
      ${state.config.googleClientId ? `<div class="divider"><span>or</span></div><div id="google-button" class="google-button"></div>` : ""}
    </div>`;
}

export function openAuthModal(mode = "login", message = "", onSuccess = null) {
  afterLogin = onSuccess;
  const overlay = document.getElementById("auth-overlay");
  overlay.innerHTML = modalHtml(mode, message);
  overlay.hidden = false;
  document.body.classList.add("modal-open");
  overlay.querySelector("input")?.focus();

  const googleHost = overlay.querySelector("#google-button");
  if (googleHost) renderGoogleButton(googleHost);

  overlay.querySelectorAll("[data-mode]").forEach((tab) => {
    tab.addEventListener("click", () => openAuthModal(tab.dataset.mode, message, onSuccess));
  });

  overlay.querySelector("#auth-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = { email: String(form.get("email") ?? "").trim(), password: String(form.get("password") ?? "") };
    if (mode === "signup") body.name = String(form.get("name") ?? "").trim();

    if (mode === "signup" && !body.name) return showError("Please enter your name.");
    if (!/^\S+@\S+\.\S+$/.test(body.email)) return showError("Please enter a valid email address.");
    if (mode === "signup" && body.password.length < 8) return showError("Password must be at least 8 characters.");

    const submit = event.currentTarget.querySelector("button[type=submit]");
    submit.disabled = true;
    showError("");
    try {
      await finish(await api(`/api/auth/${mode === "signup" ? "signup" : "login"}`, { method: "POST", body }));
    } catch (error) {
      showError(error.message);
      submit.disabled = false;
    }
  });
}

export function closeAuthModal() {
  const overlay = document.getElementById("auth-overlay");
  overlay.hidden = true;
  overlay.innerHTML = "";
  document.body.classList.remove("modal-open");
}

export function initAuthModal() {
  const overlay = document.getElementById("auth-overlay");
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay || event.target.closest("[data-close]")) {
      afterLogin = null;
      closeAuthModal();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.hidden) {
      afterLogin = null;
      closeAuthModal();
    }
  });
}
