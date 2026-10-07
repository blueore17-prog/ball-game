// Cloudflare Worker: serves the game files and the API (/api/*).
// Challenges live in Workers KV (CHALLENGES); accounts, ranked runs and the leaderboard live in D1 (DB).
import { handle as handleChallenges } from "./api/handle.mjs";
import { handleAccounts } from "./api/accounts.mjs";
import { rankFor } from "./public/js/engine.mjs";

// wrap KV in the small Netlify Blobs-style interface the challenges API expects
const kvStore = kv => ({
  get: (key, opts) => kv.get(key, opts),
  set: (key, value) => kv.put(key, value),
  setJSON: (key, value) => kv.put(key, JSON.stringify(value)),
  async list({ prefix }) {
    const blobs = []; let cursor;
    do { const r = await kv.list({ prefix, cursor }); r.keys.forEach(k => blobs.push({ key: k.name })); cursor = r.list_complete ? null : r.cursor; } while (cursor);
    return { blobs };
  },
});
const ACCOUNT_ROUTES = new Set(["auth", "me", "runs", "leaderboard", "users"]);

// link previews: chat apps read these tags. Challenge (?c=) and profile (?p=) links get their own title and text.
async function previewFor(url, env) {
  const c = url.searchParams.get("c"), p = url.searchParams.get("p");
  try {
    if (c && /^[a-z0-9]{4,12}$/.test(c) && env.CHALLENGES) {
      const rec = await env.CHALLENGES.get(`c/${c}`, { type: "json" });
      if (rec) return { title: `${rec.a.name} challenged you on ball.`, desc: `Their team rating is ${rec.a.tr}. Draft from the same spins, then a best-of-seven decides it.` };
    }
    if (p && env.DB) {
      const u = await env.DB.prepare("SELECT name, total, runs, titles FROM users WHERE name = ?").bind(p.slice(0, 18)).first();
      if (u) {
        const pos = u.runs ? (await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE runs > 0 AND total > ?").bind(u.total).first()).n + 1 : null;
        return { title: `${u.name} on ball. · ${rankFor(u.total).name}`, desc: `${pos ? `#${pos} worldwide · ` : ""}${u.total.toLocaleString("en-US")} points · ${u.titles} title${u.titles === 1 ? "" : "s"}. Draft five NBA legends and chase 82–0.` };
      }
    }
  } catch (e) { /* fall back to the default preview */ }
  return null;
}
async function page(request, env, url) {
  const res = await env.ASSETS.fetch(request);
  if (!(res.headers.get("content-type") || "").includes("text/html")) return res;
  const pv = await previewFor(url, env);
  const set = v => ({ element: el => el.setAttribute("content", v) });
  let rw = new HTMLRewriter()
    .on('meta[property="og:image"]', set(`${url.origin}/img/og.jpg`))
    .on('meta[property="og:url"]', set(url.origin + url.pathname + url.search));
  if (pv) rw = rw.on('meta[property="og:title"]', set(pv.title)).on('meta[property="og:description"]', set(pv.desc))
    .on("title", { element: el => el.setInnerContent(pv.title) });
  return rw.transform(res);
}

export default {
  fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const parts = url.pathname.slice(5).split("/").filter(Boolean);
      if (ACCOUNT_ROUTES.has(parts[0])) return handleAccounts(request, env, parts);
      return handleChallenges(request, kvStore(env.CHALLENGES));
    }
    if (url.pathname === "/" && request.method === "GET") return page(request, env, url);
    return env.ASSETS.fetch(request);
  },
};
