// Cloudflare Worker: serves the game files and the challenges API (/api/*).
// Challenge data lives in Workers KV, bound as CHALLENGES in wrangler.jsonc.
import { handle } from "./api/handle.mjs";

// wrap KV in the small Netlify Blobs-style interface handle() expects
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

export default {
  fetch(request, env) {
    if (new URL(request.url).pathname.startsWith("/api/")) return handle(request, kvStore(env.CHALLENGES));
    return env.ASSETS.fetch(request);
  },
};
