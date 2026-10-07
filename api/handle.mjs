// ball. challenges API: a tiny shared store so both players see results automatically.
// The host passes in a store with get / setJSON / set / list (worker.mjs wraps Workers KV).

const ID = /^[a-z0-9]{4,12}$/;
const PID = /^[a-z0-9]{6,16}$/;
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const clean = (s, n) => String(s || "").replace(/[<>]/g, "").slice(0, n);

function side(x) {
  if (!x || !PID.test(x.pid || "") || !Array.isArray(x.team) || x.team.length !== 5) return null;
  return { pid: x.pid, name: clean(x.name, 18) || "Player", color: /^#[0-9A-Fa-f]{6}$/.test(x.color || "") ? x.color : "#FF5A1F",
    team: x.team.map(t => clean(t, 40)), tr: Math.max(0, Math.min(150, Number(x.tr) || 0)) };
}

// the logic takes the store as an argument so it can be tested without Netlify
export async function handle(req, store) {
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  try {
    if (parts[0] === "ping") return json({ ok: true });

    // create: POST /api/c  {id, seed, a}
    if (parts[0] === "c" && parts.length === 1 && req.method === "POST") {
      const body = await req.json(); const a = side(body.a);
      if (!ID.test(body.id || "") || !a || !Number.isInteger(body.seed)) return json({ error: "bad challenge" }, 400);
      const key = `c/${body.id}`;
      const existing = await store.get(key, { type: "json" });
      if (existing) return json({ ok: true, rec: existing });
      const rec = { id: body.id, seed: body.seed, a, b: null, created: Date.now(), played: null };
      await store.setJSON(key, rec);
      await store.set(`p/${a.pid}/${body.id}`, "1");
      return json({ ok: true, rec });
    }

    // read: GET /api/c/:id   (the challenger's players stay hidden until the series is played)
    if (parts[0] === "c" && parts.length === 2 && req.method === "GET") {
      const rec = await store.get(`c/${parts[1]}`, { type: "json" });
      if (!rec) return json({ error: "not found" }, 404);
      return json({ ok: true, rec: rec.b ? rec : { ...rec, a: { ...rec.a, team: null } } });
    }

    // result: POST /api/c/:id/result  {b}
    if (parts[0] === "c" && parts.length === 3 && parts[2] === "result" && req.method === "POST") {
      const key = `c/${parts[1]}`; const rec = await store.get(key, { type: "json" });
      if (!rec) return json({ error: "not found" }, 404);
      const b = side((await req.json()).b);
      if (!b) return json({ error: "bad team" }, 400);
      if (rec.b) return json({ ok: rec.b.pid === b.pid, rec, note: rec.b.pid === b.pid ? "already saved" : "already played by someone else" }, rec.b.pid === b.pid ? 200 : 409);
      if (b.pid === rec.a.pid) return json({ error: "you can't accept your own challenge" }, 400);
      rec.b = b; rec.played = Date.now();
      await store.setJSON(key, rec);
      await store.set(`p/${b.pid}/${rec.id}`, "1");
      return json({ ok: true, rec });
    }

    // mine: GET /api/mine?pid=...   every challenge this player is part of
    if (parts[0] === "mine" && req.method === "GET") {
      const pid = url.searchParams.get("pid") || "";
      if (!PID.test(pid)) return json({ error: "bad player" }, 400);
      const { blobs } = await store.list({ prefix: `p/${pid}/` });
      const ids = blobs.map(x => x.key.split("/")[2]).slice(-100);
      const recs = (await Promise.all(ids.map(id => store.get(`c/${id}`, { type: "json" })))).filter(Boolean)
        .map(r => (r.b || r.a.pid === pid) ? r : { ...r, a: { ...r.a, team: null } });
      return json({ ok: true, recs });
    }
    return json({ error: "not found" }, 404);
  } catch (e) {
    return json({ error: "server error" }, 500);
  }
}
