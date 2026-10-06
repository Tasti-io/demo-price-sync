/**
 * What every page shares: the visitor's own state, the calls to the server, and
 * the frame around each page.
 *
 * The state lives in this browser only. It is a list of what this visitor has
 * pushed to which channel, the names they have confirmed, and the changes they
 * have proposed. Every page sends it to the server, which rebuilds the channels
 * from it and answers. Nothing is stored on the server, nobody else sees any of
 * it, and "Reset the demo" puts everything back.
 */

const KEY = "tasti-price-sync.v1";
const blank = () => ({ history: [], confirmed: [], changes: [] });

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    if (s && Array.isArray(s.history) && Array.isArray(s.confirmed) && Array.isArray(s.changes)) return s;
  } catch { /* private window or blocked storage: the demo still runs, it just forgets */ }
  return blank();
}

export const store = load();
export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* see load() */ }
}
export function reset() {
  Object.assign(store, blank());
  save();
}

export const pending = () => store.changes.find((c) => c.status === "pending") ?? null;

export async function api(path, extra = {}) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ history: store.history, confirmed: store.confirmed, ...extra }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `request failed (${res.status})`);
  return json;
}

/* ---------- formatting ---------- */

export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const money = (c) => (c == null ? "" : `${c < 0 ? "-" : ""}$${(Math.abs(c) / 100).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
export const signed = (c) => `${c > 0 ? "+" : c < 0 ? "-" : ""}$${(Math.abs(c) / 100).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const pct = (x) => `${(x * 100).toFixed(1)}%`;
export const clock = (iso) => new Date(iso).toLocaleTimeString("en-CA", { hour12: false });
export const when = (iso) => new Date(iso).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

export const LABEL = { square: "Square POS", website: "Website", doordash: "DoorDash", ubereats: "Uber Eats", skip: "Skip" };
export const ORDER = ["square", "website", "doordash", "ubereats", "skip"];

/* ---------- the frame ---------- */

const PAGES = [
  { href: "/", n: 1, label: "Menu everywhere" },
  { href: "/margins", n: 2, label: "What each sale leaves" },
  { href: "/change", n: 3, label: "Make a change" },
  { href: "/approve", n: 4, label: "Approve" },
  { href: "/log", n: 5, label: "Log" },
];

export function frame({ title, sub }) {
  const here = location.pathname.replace(/\.html$/, "").replace(/\/index$/, "/") || "/";
  const p = pending();
  document.title = `${title} · Price sync · a working demo by Tasti.io`;
  $("top").innerHTML = `
    <div class="eyebrow">A working demo &middot; Tasti.io &middot; Price sync for Harbour &amp; Co</div>
    <h1>${esc(title)}</h1>
    <p class="sub">${sub}</p>`;
  $("nav").innerHTML = PAGES.map((pg) => `
      <a href="${pg.href}" class="${here === pg.href ? "is-on" : ""}" ${here === pg.href ? 'aria-current="page"' : ""}>
        <span class="n">${pg.n}</span>${esc(pg.label)}${pg.href === "/approve" && p ? '<span class="badge">1</span>' : ""}
      </a>`).join("") + `<span class="gap"></span><a href="/how" class="${here === "/how" ? "is-on" : ""}">How it works</a>`;
  $("foot").innerHTML = `
    <span>Built by Yuriy Romanyuk</span>
    <a href="https://www.tasti.io">tasti.io</a>
    <a href="https://demo.tasti.io">all demos</a>
    <a href="mailto:yuriy@tasti.io">yuriy@tasti.io</a>
    <button id="reset" title="Forget every change made in this browser">Reset the demo</button>`;
  $("reset").addEventListener("click", () => {
    if (!confirm("Put every channel back to how Harbour & Co started, and forget the log?")) return;
    reset();
    location.href = "/";
  });
}

export function fail(err) {
  $("main").innerHTML = `<div class="card"><div class="empty">Something went wrong: ${esc(err.message)}.<br>Reload the page, or reset the demo from the footer.</div></div>`;
}

export const newId = () => `CH-${Date.now().toString(36).toUpperCase().slice(-5)}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
