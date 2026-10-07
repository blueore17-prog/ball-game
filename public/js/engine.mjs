// ===== ball. engine: player data model, team ratings and the season / playoff simulation =====
// Shared by the browser (js/app.js) and the server (worker.mjs) so ranked runs can be re-simulated.
export function createEngine(D) {
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  function gauss(r) { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  const DEC_IDS = ['1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'];
  const DECADES = DEC_IDS.map(id => { const ps = D.players.filter(p => p.decade === id); return { id, pace: Math.round(ps.reduce((s, p) => s + p.pace, 0) / ps.length) }; });
  const TEAMS = D.teams;
  const SLOTS = ['PG', 'SG', 'SF', 'PF', 'C'];
  const PERKS = {
    leader: { name: 'Leader', tag: 'Leader +1.5', cat: 'team', desc: 'Won an MVP or led a title team. +1.5 team rating. Only one Leader counts.' },
    specialist: { name: 'Specialist', tag: 'Specialist +1', cat: 'team', desc: 'Played short minutes but was great in them. +1 team rating. Only one counts.' },
    defender: { name: 'Defender', tag: 'Defender +1', cat: 'defense', desc: 'All-Defensive level stopper. +1 team rating. Up to two count.' },
    shooter: { name: 'Sniper', tag: 'Sniper +½', cat: 'offense', desc: 'An elite long-range shooter. +½ team rating (up to two count). Snipers always count as Shooters.' },
    rebounder: { name: 'Rebounder', tag: 'Rebounder +½', cat: 'defense', desc: 'Owns the glass. +½ team rating, and counts as your big man.' },
    scorer: { name: 'Scorer', tag: 'Scorer +½', cat: 'offense', desc: 'Pours in points (24+ per 36 minutes). +½ team rating. Up to two count.' },
    playmaker: { name: 'Playmaker', tag: 'Playmaker +½', cat: 'offense', desc: 'Racks up assists. +½ team rating. Only one counts.' },
    clutch: { name: 'Clutch', tag: 'Clutch', cat: 'moment', desc: 'Sometimes steals a game you were about to lose by 4 or fewer.' },
    iron: { name: 'Iron man', tag: 'Iron man', cat: 'health', desc: 'Almost never misses a game.' },
  };
  const ARCH_LABEL = { floor: 'Floor general', scorer: 'Scorer', shooter: 'Spot-up shooter', threeD: 'Defensive guard', twoWay: 'Two-way forward', pointFwd: 'Point forward', stretch: 'Stretch big', rim: 'Rim protector', post: 'Post scorer' };
  const BY = {};
  D.players.forEach(p => { p.def = p.defr; p.perks = p.perks || []; p.allstar = !!p.allstar; p.defEst = !!p.defEst; p.big = !!p.big; p.archLabel = ARCH_LABEL[p.arch] || p.arch; (BY[p.team + p.decade] = BY[p.team + p.decade] || []).push(p); });
  function roster(teamId, decId) { return BY[teamId + decId] || []; }
  function teamName(teamId, decId) { const t = TEAMS.find(x => x.id === teamId); return t.names[decId] || Object.values(t.names).slice(-1)[0]; }

  // ---------- rating model ----------
  // ---- roles used by chemistry (shown as tags in the game) ----
  function isShooter(p) { const y = +p.season.slice(0, 4); const need = y < 1979 ? 41 : y < 1990 ? 46 : 55; return p.shoot >= need || (p.perks || []).includes('shooter'); }
  function roles(p) {
    const d = derive(p);
    return { shooter: d.shooter, big: d.big, passer: d.ast >= 8 || d.perks.includes('playmaker'), rim: d.blk >= 2.8 || (d.big && d.perks.includes('defender')), bd: d.u >= .27 };
  }
  // ---- the whole model: team rating = your five (best players count most) + chemistry + perks
  function derive(p) {
    const k = 48 / p.mpg * 100 / p.pace; // per-100 numbers, only used to fill in box scores
    return { team: p.team, decade: p.decade, r: p.ovr, u: p.usg / 100, shooter: isShooter(p), big: (!!p.big && (p.pos.includes('PF') || p.pos.includes('C'))) || (p.perks || []).includes('rebounder'), perks: p.perks || [], name: p.name, tier: p.tier,
      pts: p.pts * k, ast: p.ast * k, reb: p.reb * k, stl: p.stl * k, blk: p.blk * k, def: p.def };
  }
  const REPL = { r: 76, u: .17, shooter: false, big: false, perks: [], name: 'Bench player', repl: true, pts: 14, ast: 3.5, reb: 9, stl: 1.4, blk: .6, def: 3 };
  const WEIGHTS = [1.3, 1.1, 1.0, .9, .7]; // best player counts most, 5th-best least (they still add up to 5)
  const PER_POINT = 2.1;  // each team-rating point = 2.1 points of average game margin
  const BASELINE = 85.3;  // a team rating of about 85 = an average NBA team (tuned so whole-number chemistry keeps 82-0 odds unchanged)
  function rate(ds, open) {
    open = open || 0;
    const rs = ds.map(d => d.r).sort((a, b) => b - a);
    const players = rs.reduce((s, r, i) => s + r * WEIGHTS[i], 0) / 5 - 3; // 2K-style team scale: 99 = an elite team
    const real = ds.filter(d => !d.repl);
    const ball = real.filter(d => d.u >= .27).length >= 3 ? -3 : 0;
    const shooters = real.filter(d => d.shooter).length;
    const shooting = shooters + open < 2 ? -3 : 0;
    const size = !real.some(d => d.big) && open === 0 ? -3 : 0;
    // teammates: two players from the same franchise and decade already know each other (+1 per pair, max +2)
    let pairs = 0; for (let i = 0; i < real.length; i++) for (let j = i + 1; j < real.length; j++) if (real[i].team === real[j].team && real[i].decade === real[j].decade) pairs++;
    const mates = Math.min(2, pairs);
    // bonuses for a good fit
    const spacingB = shooters >= 3 ? 1 : 0;                                            // three or more shooters
    const passer = real.some(d => d.ast >= 8 || d.perks.includes('playmaker')) ? 1 : 0;         // someone who sets up teammates
    const rimP = real.some(d => d.blk >= 2.8 || (d.big && d.perks.includes('defender'))) ? 1 : 0; // someone who protects the basket
    const pk = perkEffects(real);
    const chem = ball + shooting + size + Math.min(4, mates + spacingB + passer + rimP); // bonuses cap at +4
    const team = players + chem + pk.total;
    return { team, players, chem, perks: pk.total, parts: { players, ball, shooting, size, mates, spacingB, passer, rimP, perks: pk.total }, net: (team - BASELINE) * PER_POINT,
      perkList: pk.list, moments: pk.moments, shooters, talent: players };
  }
  function perkEffects(ds) {
    const list = []; const who = k => ds.filter(d => d.perks.includes(k));
    const L = who('leader'); if (L.length) list.push({ key: 'leader', name: 'Leader', player: L[0].name, val: 1.5 });
    who('defender').slice(0, 2).forEach(d => list.push({ key: 'defender', name: 'Defender', player: d.name, val: 1 }));
    who('shooter').slice(0, 2).forEach(d => list.push({ key: 'shooter', name: 'Sniper', player: d.name, val: .5 }));
    who('scorer').slice(0, 2).forEach(d => list.push({ key: 'scorer', name: 'Scorer', player: d.name, val: .5 }));
    const PM = who('playmaker'); if (PM.length) list.push({ key: 'playmaker', name: 'Playmaker', player: PM[0].name, val: .5 });
    const RB = who('rebounder'); if (RB.length) list.push({ key: 'rebounder', name: 'Rebounder', player: RB[0].name, val: .5 });
    who('specialist').slice(0, 1).forEach(d => list.push({ key: 'specialist', name: 'Specialist', player: d.name, val: 1 }));
    return { list, total: Math.min(4, list.reduce((s, x) => s + x.val, 0)), moments: { clutch: who('clutch').map(d => d.name), bigGame: 0, road: 0 } };
  }

  // ratings for all 32 availability masks
  function lineupTable(players) {
    const ds = players.map(derive); const table = [];
    // an injured player is covered by a bench player at his position: same role (shooter / big), bench-level talent, no perks
    const sub = d => ({ ...REPL, shooter: d.shooter, big: d.big, team: null, decade: null, repl: false, name: 'Bench player' });
    for (let m = 0; m < 32; m++) table.push(rate(ds.map((d, i) => (m >> i) & 1 ? d : sub(d))));
    return { ds, table };
  }

  // fictional league of opponents
  function league(seed) {
    const r = rng(seed); const pool = D.opps.slice(); const opps = [];
    for (let i = 0; i < 29; i++) { const o = pool.splice(Math.floor(r() * pool.length), 1)[0]; const t = TEAMS.find(x => x.id === o.fr); opps.push({ label: o.label, short: o.fr, fr: o.fr, season: o.season, w: o.w, c1: t.c1, net: o.net }); }
    return opps.sort((a, b) => b.net - a.net);
  }
  const SD = 12, HOME = 2.5;
  const PO_BOOST = 7, SD_PO = 16; // playoff opponents tighten up, and playoff games are a bit more random
  const Phi = z => { const t = 1 / (1 + .2316419 * Math.abs(z)); const d = .3989423 * Math.exp(-z * z / 2); const p = d * t * (.3193815 + t * (-.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; };

  function schedule(seed, opps) {
    const r = rng(seed); const games = [];
    for (let i = 0; i < 82; i++) games.push({ opp: opps[i % 29], home: i % 2 === 0 });
    for (let i = games.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [games[i], games[j]] = [games[j], games[i]]; }
    return games;
  }

  const avail = p => p.perks && p.perks.includes('iron') ? 81 / 82 : p.gp / 82;
  const newLines = players => players.map(p => ({ name: p.name, gp: 0, min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tsa: 0, clutch: 0, high: 0 }));
  // one game for your five; playoff games count as big games for the Big-game perk
  function simGame(players, lt, opp, home, r, detailed, lines, playoff, extraLines) {
    let mask = 0; const out = [];
    players.forEach((p, i) => { if (r() < avail(p)) mask |= 1 << i; else out.push(p.name); });
    const rt = lt.table[mask]; const mo = rt.moments;
    const exp = rt.net - opp.net - (playoff ? PO_BOOST : 0) + (home ? HOME : -HOME);
    const boosts = [];
    const noise = gauss(r) * (playoff ? SD_PO : SD); let margin = exp + noise; let hero = null;
    if (margin <= 0 && margin > -4 && mo.clutch.length) {
      for (const n of mo.clutch) if (r() < .3) { hero = n; margin = 1 + Math.floor(r() * 3); break; }
    }
    const win = margin > 0;
    if (!detailed) return { win };
    const total = (playoff ? 206 : 214) + gauss(r) * 9;
    let us = Math.round((total + margin) / 2), them = Math.round((total - margin) / 2);
    if (us === them) { if (win) us++; else them++; }
    if (hero) { const i = players.findIndex(p => p.name === hero); lines[i].clutch++; }
    const box = boxScore(players, lt, mask, us, exp, margin, r, playoff);
    if (hero && extraLines) extraLines[players.findIndex(p => p.name === hero)].clutch++;
    [lines, extraLines].filter(Boolean).forEach(LS => box.forEach((b, i) => { if (!b) return; const L = LS[i]; L.gp++; L.min += b.min; L.pts += b.pts; L.reb += b.reb; L.ast += b.ast; L.stl += b.stl; L.blk += b.blk; L.tsa += b.tsa; L.high = Math.max(L.high, b.pts); }));
    const top = box.map((b, i) => b && { name: players[i].name, ...b }).filter(Boolean).sort((a, b) => b.pts - a.pts)[0];
    return { opp, home, exp, noise, margin, win, us, them, out, hero, boosts, top, p: Phi(exp / SD) };
  }
  function simSeason(players, lt, seed, opps, detailed) {
    const r = rng(seed); const sch = schedule(seed * 7 + 3, opps);
    let w = 0; const log = []; const lines = detailed ? newLines(players) : null;
    for (let g = 0; g < 82; g++) {
      const gm = simGame(players, lt, sch[g].opp, sch[g].home, r, detailed, lines, false);
      if (gm.win) w++;
      if (detailed) log.push({ ...gm, g: g + 1, wins: w, losses: g + 1 - w });
    }
    return detailed ? { w, log, lines } : w;
  }

  // ---------- playoffs: 16-team bracket, best of 7, 2-2-1-1-1 ----------
  // the playoff field: 15 real playoff teams from history, plus you if you won 42+ games
  const PO_POOL = D.opps.filter(o => o.po && o.net >= 2);
  function standings(opps, myWins, seed) {
    const r = rng(seed); const pool = PO_POOL.slice(); const teams = [];
    for (let i = 0; i < 15; i++) { const o = pool.splice(Math.floor(r() * pool.length), 1)[0]; const t = TEAMS.find(x => x.id === o.fr); teams.push({ label: o.label, short: o.fr, fr: o.fr, season: o.season, c1: t.c1, net: o.net, w: o.w, me: false, champ: o.champ }); }
    const me = { label: 'Your team', short: 'YOU', c1: 'var(--accent)', net: 0, me: true, w: myWins, missed: myWins < 42 };
    if (!me.missed) teams.push(me); else { const o = pool[Math.floor(r() * pool.length)]; const t = TEAMS.find(x => x.id === o.fr); teams.push({ label: o.label, short: o.fr, fr: o.fr, season: o.season, c1: t.c1, net: o.net, w: o.w, me: false }); }
    teams.sort((a, b) => b.w - a.w || (b.me - a.me) || b.net - a.net);
    teams.forEach((t, i) => t.rank = i + 1);
    if (me.missed) { me.rank = 17; teams.push(me); }
    return teams;
  }
  const HOMES = [true, true, false, false, true, false, true];
  function playoffs(players, lt, table, seed, detailed) {
    const r = rng(seed);
    const field = table.slice(0, 16).map((t, i) => ({ ...t, seed: i + 1 }));
    const lines = detailed ? newLines(players) : null;
    const order = [1, 16, 8, 9, 5, 12, 4, 13, 6, 11, 3, 14, 7, 10, 2, 15];
    let alive = order.map(s => field[s - 1]);
    const rounds = []; let myGames = []; let finalsLines = null; let outcome = field.some(t => t.me) ? null : 'missed';
    const names = ['First round', 'Second round', 'Semifinals', 'Finals'];
    for (let ri = 0; ri < 4 && alive.length > 1; ri++) {
      const series = []; const next = [];
      if (ri === 3 && detailed) finalsLines = newLines(players);
      for (let k = 0; k < alive.length; k += 2) {
        let a = alive[k], b = alive[k + 1]; if (b.seed < a.seed) [a, b] = [b, a]; // a = higher seed, home court
        let wa = 0, wb = 0; const games = [];
        while (wa < 4 && wb < 4) {
          const aHome = HOMES[wa + wb];
          if (a.me || b.me) {
            const meIsA = a.me, opp = meIsA ? b : a, home = meIsA ? aHome : !aHome;
            const gm = simGame(players, lt, opp, home, r, detailed, lines, true, ri === 3 ? finalsLines : null);
            const aWon = meIsA ? gm.win : !gm.win; aWon ? wa++ : wb++;
            if (detailed) { const g = { ...gm, round: names[ri], gameNo: wa + wb, sw: meIsA ? wa : wb, sl: meIsA ? wb : wa }; games.push(g); myGames.push(g); }
          } else {
            const p = Phi((a.net - b.net + (aHome ? HOME : -HOME)) / SD); r() < p ? wa++ : wb++;
          }
        }
        const winner = wa === 4 ? a : b;
        series.push({ a, b, wa, wb, winner, games, mine: a.me || b.me });
        next.push(winner);
        if ((a.me || b.me) && !winner.me) outcome = outcome || { lostIn: names[ri], to: winner, wins: a.me ? wa : wb, losses: a.me ? wb : wa };
      }
      rounds.push({ name: names[ri], series }); alive = next;
    }
    const champ = alive[0];
    if (!outcome) outcome = champ.me ? 'champion' : 'missed';
    return { field, rounds, champ, outcome, myGames, lines, finalsLines, perfect: champ.me && myGames.every(g => g.win) };
  }
  function titleOdds(players, lt, table, n) {
    let titles = 0, sweeps = 0;
    for (let s = 0; s < n; s++) {
      const res = playoffsFast(players, lt, table, 5000 + s * 31);
      if (res.champ) titles++; if (res.perfect) sweeps++;
    }
    return { title: titles / n, perfect: sweeps / n };
  }
  function playoffsFast(players, lt, table, seed) {
    const r = rng(seed); const field = table.slice(0, 16).map((t, i) => ({ ...t, seed: i + 1 }));
    if (!field.some(t => t.me)) return { champ: false, perfect: false };
    const order = [1, 16, 8, 9, 5, 12, 4, 13, 6, 11, 3, 14, 7, 10, 2, 15]; let alive = order.map(s => field[s - 1]); let lost = 0;
    while (alive.length > 1) {
      const next = [];
      for (let k = 0; k < alive.length; k += 2) {
        let a = alive[k], b = alive[k + 1]; if (b.seed < a.seed) [a, b] = [b, a]; let wa = 0, wb = 0;
        while (wa < 4 && wb < 4) {
          const aHome = HOMES[wa + wb];
          if (a.me || b.me) { const meIsA = a.me; const gm = simGame(players, lt, meIsA ? b : a, meIsA ? aHome : !aHome, r, false, null, true); if (!gm.win) lost++; (meIsA ? gm.win : !gm.win) ? wa++ : wb++; }
          else r() < Phi((a.net - b.net + (aHome ? HOME : -HOME)) / SD) ? wa++ : wb++;
        }
        next.push(wa === 4 ? a : b);
      }
      alive = next; if (!alive.some(t => t.me)) return { champ: false, perfect: false };
    }
    return { champ: true, perfect: lost === 0 };
  }

  // per-player box score for one game, shaped by usage sharing and team context
  function boxScore(players, lt, mask, us, exp, margin, r, playoff) {
    const ds = lt.ds.map((d, i) => (mask >> i) & 1 ? d : null);
    const live = ds.map(d => d || REPL);
    const U = live.reduce((s, d) => s + d.u, 0);
    const sum = k => live.reduce((s, d) => s + d[k], 0);
    const sc = { reb: Math.min(1, 46 / sum('reb')), ast: Math.min(1, 26 / sum('ast')), stl: Math.min(1, 10 / sum('stl')), blk: Math.min(1, 8 / sum('blk')) };
    const f = us / ((214 + exp) / 2);
    const blow = Math.abs(margin) > 20 ? .86 : 1;
    const nz = s => Math.max(0, 1 + gauss(r) * s);
    return players.map((p, i) => {
      const d = ds[i]; if (!d) return null;
      const min = Math.max(18, Math.min(46, (Math.min(p.mpg, 38) + (playoff ? 2.5 : 0) + gauss(r) * 2.5) * blow));
      const poss = min / 48;
      const share = U > 1 ? 1 / U : 1;
      const pts = Math.round(d.pts * poss * share * f * nz(.24));
      const ts = p.ts + (U > 1 ? .25 * (d.u - d.u / U) : 0) / 2 + gauss(r) * .05;
      return { min, pts, tsa: pts / (2 * Math.max(.38, ts)), reb: Math.round(d.reb * poss * sc.reb * nz(.3)), ast: Math.round(d.ast * poss * sc.ast * nz(.32)), stl: Math.round(d.stl * poss * sc.stl * nz(.6)), blk: Math.round(d.blk * poss * sc.blk * nz(.6)) };
    });
  }

  function monteCarlo(players, lt, n, opps) {
    const hist = new Array(83).fill(0);
    for (let s = 0; s < n; s++) hist[simSeason(players, lt, 1000 + s * 13, opps, false)]++;
    return hist;
  }

  function lossReason(gm, players, lt) {
    const bits = [];
    if (gm.out.length) bits.push(`${gm.out.join(' and ')} sat out`);
    if (gm.opp.net >= 5) bits.push(`${gm.opp.label} were one of the best teams around`);
    if (gm.margin > -4) bits.push(`lost a close one by ${Math.max(1, Math.round(-gm.margin))}`);
    else if (gm.noise < -SD * .9) bits.push('cold shooting night');
    if (!gm.home && bits.length < 3) bits.push('on the road');
    if (!bits.length) bits.push('just an off night');
    return bits;
  }
  function netOnly(players){return rate(players.map(derive)).net;}
  return { roles, isShooter, simGame, BASELINE, PER_POINT, teamName, standings, playoffs, titleOdds, netOnly, REPL, PERKS, avail, DECADES, TEAMS, SLOTS, roster, derive, rate, lineupTable, league, simSeason, monteCarlo, lossReason, Phi, SD, HOME, rng, hashStr };
}
