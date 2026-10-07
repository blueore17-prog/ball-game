// ball. accounts API: email + password login, profiles, ranked runs and the global leaderboard.
// Data lives in D1 (env.DB). Ranked runs are re-simulated here with the same engine the game uses,
// so a score on the leaderboard is always one the server played itself.
import { createEngine, rankFor } from "../public/js/engine.mjs";
import DATA from "../public/data/nba.json";

let engine = null;
const E = () => engine || (engine = createEngine(DATA));

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const fail = (error, status = 400) => json({ error }, status);
const now = () => Date.now();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
const randomHex = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const randomInt = () => crypto.getRandomValues(new Uint32Array(1))[0] >>> 1;
const sha256 = async s => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
const ID_CHARS = "abcdefghijkmnpqrstuvwxyz23456789";
const uid = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => ID_CHARS[b % 32]).join("");

// PBKDF2 stays light because the free Workers plan allows ~10 ms of CPU per request;
// the iteration count is stored per user so it can be raised later.
const PASS_ITER = 20000;
async function hashPassword(password, salt, iter) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: iter }, key, 256));
}
function sameString(a, b) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const NAME = /^[\p{L}\p{N}][\p{L}\p{N} _.-]{1,17}$/u;
const COLOR = /^#[0-9A-Fa-f]{6}$/;
const PID = /^[a-z0-9]{6,16}$/;
const SESSION_DAYS = 180;
const MAX_FAILS = 10, FAIL_WINDOW = 15 * 60 * 1000;

async function body(req) {
  const text = await req.text();
  if (text.length > 20000) throw new Error("too big");
  try { return JSON.parse(text || "{}"); } catch (e) { return {}; }
}

async function currentUser(req, db) {
  const m = (req.headers.get("authorization") || "").match(/^Bearer ([a-f0-9]{64})$/);
  if (!m) return null;
  return db.prepare("SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires > ?").bind(await sha256(m[1]), now()).first();
}
async function newSession(db, userId) {
  const token = randomHex(32);
  await db.prepare("INSERT INTO sessions (token_hash, user_id, created, expires) VALUES (?, ?, ?, ?)").bind(await sha256(token), userId, now(), now() + SESSION_DAYS * 864e5).run();
  return token;
}
async function position(db, total) {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM users WHERE runs > 0 AND total > ?").bind(total).first();
  return r.n + 1;
}
const publicStats = u => ({ name: u.name, color: u.color, total: u.total, runs: u.runs, best: u.best, bestW: u.best_w, titles: u.titles, perfect: u.perfect, created: u.created, rank: rankFor(u.total).name });
async function me(db, u) {
  return { ...publicStats(u), email: u.email, pid: u.pid, position: u.runs ? await position(db, u.total) : null };
}
const runOut = r => ({ id: r.id, score: r.score, w: r.w, poW: r.po_w, poL: r.po_l, title: !!r.title, team: JSON.parse(r.team || "[]"), finished: r.finished });

export async function handleAccounts(req, env, parts) {
  const db = env.DB; if (!db) return fail("storage not set up", 500);
  const method = req.method;
  try {
    // ---- sign up / log in / log out ----
    if (parts[0] === "auth" && method === "POST") {
      const b = await body(req);
      if (parts[1] === "signup") {
        const email = String(b.email || "").trim().toLowerCase(), password = String(b.password || ""), name = String(b.name || "").trim();
        if (!EMAIL.test(email)) return fail("Enter a valid email address.");
        if (password.length < 8 || password.length > 200) return fail("Use a password with at least 8 characters.");
        if (!NAME.test(name)) return fail("Names are 2–18 letters, numbers, spaces, dots, dashes or underscores.");
        const color = COLOR.test(b.color || "") ? b.color : "#FF5A1F";
        if (await db.prepare("SELECT 1 FROM users WHERE email = ?").bind(email).first()) return fail("There's already an account with that email. Log in instead.", 409);
        if (await db.prepare("SELECT 1 FROM users WHERE name = ?").bind(name).first()) return fail("That name is taken. Try another one.", 409);
        // keep the player id from this device's guest profile, so existing challenges stay linked
        let pid = PID.test(b.pid || "") ? b.pid : uid(10);
        if (await db.prepare("SELECT 1 FROM users WHERE pid = ?").bind(pid).first()) pid = uid(10);
        const id = uid(12), salt = randomHex(16);
        await db.prepare("INSERT INTO users (id, email, name, color, pid, pass_hash, pass_salt, pass_iter, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(id, email, name, color, pid, await hashPassword(password, salt, PASS_ITER), salt, PASS_ITER, now()).run();
        const u = await db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
        return json({ ok: true, token: await newSession(db, id), me: await me(db, u) });
      }
      if (parts[1] === "login") {
        const email = String(b.email || "").trim().toLowerCase(), password = String(b.password || "");
        const f = await db.prepare("SELECT n, since FROM login_fails WHERE email = ?").bind(email).first();
        if (f && f.n >= MAX_FAILS && now() - f.since < FAIL_WINDOW) return fail("Too many tries. Wait 15 minutes and try again.", 429);
        const u = email && await db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
        const ok = u && sameString(await hashPassword(password, u.pass_salt, u.pass_iter), u.pass_hash);
        if (!ok) {
          if (email) await db.prepare("INSERT INTO login_fails (email, n, since) VALUES (?1, 1, ?2) ON CONFLICT(email) DO UPDATE SET n = CASE WHEN ?2 - since > ?3 THEN 1 ELSE n + 1 END, since = CASE WHEN ?2 - since > ?3 THEN ?2 ELSE since END")
            .bind(email, now(), FAIL_WINDOW).run();
          return fail("Wrong email or password.", 401);
        }
        await db.prepare("DELETE FROM login_fails WHERE email = ?").bind(email).run();
        return json({ ok: true, token: await newSession(db, u.id), me: await me(db, u) });
      }
      if (parts[1] === "logout") {
        const m = (req.headers.get("authorization") || "").match(/^Bearer ([a-f0-9]{64})$/);
        if (m) await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(m[1])).run();
        return json({ ok: true });
      }
    }

    // ---- public: leaderboard and profiles ----
    if (parts[0] === "leaderboard" && method === "GET") {
      const rows = await db.prepare("SELECT name, color, total, runs, best, titles, perfect FROM users WHERE runs > 0 ORDER BY total DESC, created ASC LIMIT 100").all();
      const u = await currentUser(req, db);
      return json({ ok: true, rows: rows.results.map((r, i) => ({ pos: i + 1, ...r, rank: rankFor(r.total).name })), me: u && u.runs ? { name: u.name, position: await position(db, u.total), total: u.total } : null });
    }
    if (parts[0] === "users" && parts[1] && method === "GET") {
      const u = await db.prepare("SELECT * FROM users WHERE name = ?").bind(decodeURIComponent(parts[1])).first();
      if (!u) return fail("No player with that name.", 404);
      const runs = await db.prepare("SELECT * FROM runs WHERE user_id = ? AND finished IS NOT NULL ORDER BY finished DESC LIMIT 10").bind(u.id).all();
      return json({ ok: true, profile: { ...publicStats(u), position: u.runs ? await position(db, u.total) : null }, runs: runs.results.map(runOut) });
    }

    // ---- everything below needs a logged-in player ----
    const u = await currentUser(req, db);
    if (!u) return fail("Log in first.", 401);

    if (parts[0] === "me" && parts.length === 1) {
      if (method === "GET") {
        const runs = await db.prepare("SELECT * FROM runs WHERE user_id = ? AND finished IS NOT NULL ORDER BY finished DESC LIMIT 10").bind(u.id).all();
        return json({ ok: true, me: await me(db, u), runs: runs.results.map(runOut) });
      }
      if (method === "POST") {
        const b = await body(req);
        const name = b.name === undefined ? u.name : String(b.name).trim(), color = b.color === undefined ? u.color : b.color;
        if (!NAME.test(name)) return fail("Names are 2–18 letters, numbers, spaces, dots, dashes or underscores.");
        if (!COLOR.test(color)) return fail("Pick a colour.");
        if (name.toLowerCase() !== u.name.toLowerCase() && await db.prepare("SELECT 1 FROM users WHERE name = ?").bind(name).first()) return fail("That name is taken. Try another one.", 409);
        await db.prepare("UPDATE users SET name = ?, color = ? WHERE id = ?").bind(name, color, u.id).run();
        return json({ ok: true, me: await me(db, { ...u, name, color }) });
      }
    }
    if (parts[0] === "me" && parts[1] === "password" && method === "POST") {
      const b = await body(req); const next = String(b.next || "");
      if (!sameString(await hashPassword(String(b.current || ""), u.pass_salt, u.pass_iter), u.pass_hash)) return fail("Your current password is wrong.", 401);
      if (next.length < 8 || next.length > 200) return fail("Use a password with at least 8 characters.");
      const salt = randomHex(16);
      await db.batch([
        db.prepare("UPDATE users SET pass_hash = ?, pass_salt = ?, pass_iter = ? WHERE id = ?").bind(await hashPassword(next, salt, PASS_ITER), salt, PASS_ITER, u.id),
        db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(u.id),
      ]);
      return json({ ok: true, token: await newSession(db, u.id) });
    }

    // ---- ranked runs: start (get the draft seed), then lock the team (the server plays the season) ----
    if (parts[0] === "runs" && parts.length === 1 && method === "POST") {
      const id = uid(10), seed = randomInt();
      await db.prepare("INSERT INTO runs (id, user_id, seed, created) VALUES (?, ?, ?, ?)").bind(id, u.id, seed, now()).run();
      return json({ ok: true, id, seed });
    }
    if (parts[0] === "runs" && parts.length === 3 && parts[2] === "lock" && method === "POST") {
      const run = await db.prepare("SELECT * FROM runs WHERE id = ? AND user_id = ?").bind(parts[1], u.id).first();
      if (!run) return fail("Run not found.", 404);
      if (run.finished) return json({ ok: true, sim: run.sim, score: run.score, already: true });
      let players;
      try { players = E().replayDraft(run.seed, (await body(req)).rounds); } catch (e) { return fail("That draft doesn't match the spins: " + e.message); }
      const sim = randomInt(); const out = E().playRun(players, sim); const sc = out.score;
      const done = await db.prepare("UPDATE runs SET sim = ?, finished = ?, score = ?, w = ?, po_w = ?, po_l = ?, title = ?, team = ? WHERE id = ? AND finished IS NULL")
        .bind(sim, now(), sc.total, out.res.w, sc.poW, sc.poL, sc.title ? 1 : 0, JSON.stringify(players.map(p => p.id)), run.id).run();
      if (done.meta.changes !== 1) return fail("This run was already locked.", 409);
      await db.prepare("UPDATE users SET total = total + ?, runs = runs + 1, best = MAX(best, ?), best_w = MAX(best_w, ?), titles = titles + ?, perfect = perfect + ? WHERE id = ?")
        .bind(sc.total, sc.total, out.res.w, sc.title ? 1 : 0, sc.perfectRS ? 1 : 0, u.id).run();
      const total = u.total + sc.total;
      return json({ ok: true, sim, score: sc.total, w: out.res.w, total, rankBefore: rankFor(u.total).name, rank: rankFor(total).name, position: await position(db, total) });
    }
    return fail("not found", 404);
  } catch (e) {
    return fail("server error", 500);
  }
}
