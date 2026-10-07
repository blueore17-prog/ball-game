// Cloudflare Pages entry point for the challenges API (/api/*); data lives in Workers KV.
// Needs a KV namespace bound to this Pages project as CHALLENGES.
import { handle } from "../../api/handle.mjs";

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

export const onRequest = ({ request, env }) => env.CHALLENGES
  ? handle(request, kvStore(env.CHALLENGES))
  : new Response(JSON.stringify({ error: "storage not set up" }), { status: 500, headers: { "content-type": "application/json" } });
