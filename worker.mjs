// Cloudflare Worker: serves the game files and the API (/api/*).
// Challenges live in Workers KV (CHALLENGES); accounts, ranked runs and the leaderboard live in D1 (DB).
import { handle as handleChallenges } from "./api/handle.mjs";
import { handleAccounts } from "./api/accounts.mjs";

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

export default {
  fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const parts = url.pathname.slice(5).split("/").filter(Boolean);
      if (ACCOUNT_ROUTES.has(parts[0])) return handleAccounts(request, env, parts);
      return handleChallenges(request, kvStore(env.CHALLENGES));
    }
    return env.ASSETS.fetch(request);
  },
};
