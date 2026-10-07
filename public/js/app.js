import { createEngine } from './engine.mjs';

const NBA_DATA = await fetch(new URL('../data/nba.json', import.meta.url)).then(r => r.json());
const E = createEngine(NBA_DATA);
const $ = id => document.getElementById(id);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const SLOT_XY = { PG: [250, 92], SG: [438, 196], SF: [62, 196], PF: [364, 318], C: [144, 332] };
const SLOT_NAME = { PG: 'point guard', SG: 'shooting guard', SF: 'small forward', PF: 'power forward', C: 'center' };
const CELL = 80;
const teamOf = id => E.TEAMS.find(t => t.id === id);
const ini = n => n.split(' ').filter(Boolean).map(s => s[0]).join('').slice(0, 3);
const cap = s => s[0].toUpperCase() + s.slice(1);
const randOf = a => a[Math.floor(Math.random() * a.length)];
const pid = p => p.id.split('-')[0];
let OPPS = E.league(42);
const POOL = []; E.TEAMS.forEach(t => E.DECADES.forEach(d => POOL.push(...E.roster(t.id, d.id))));

// ---------- points engine: player rating and team rating ----------
const pts = x => x / E.PER_POINT;                      // game margin -> team rating points
// rating tiers: red = the very best, then yellow, purple, blue, green, grey
const TIERS_C = [[97, 't-red', '#E5383B'], [93, 't-yel', '#E3A008'], [90, 't-pur', '#8B5CF6'], [86, 't-blu', '#2563EB'], [82, 't-grn', '#16A34A'], [0, 't-gry', '#64748B']];
const ovrCls = o => TIERS_C.find(t => o >= t[0])[1];
const ovrCol = o => TIERS_C.find(t => o >= t[0])[2];
const AS_TIP = '<b>All-Star</b><br>Made the All-Star team with this franchise in this decade. A badge of honour: it is already part of his rating.';
const asStar = p => p.allstar ? `<span class="asb" tabindex="0" role="button" data-tip="${AS_TIP}" aria-label="All-Star">★</span>` : '';
const ovrBadge = p => `<span class="ovr ${ovrCls(p.ovr)}" title="Player rating">${p.ovr}</span>`;
const shootGrade = (ts, lg) => { const d = (ts - lg) * 100; return d >= 6 ? 'A+' : d >= 4 ? 'A' : d >= 1.5 ? 'B' : d >= -1.5 ? 'C' : d >= -4 ? 'D' : 'F'; };
const defGrade = p => p.def >= 9 ? 'A' : p.def >= 7 ? 'B' : p.def >= 5 ? 'C' : p.def >= 3 ? 'D' : 'F';
const gradeHTML = g => `<span class="grade g-${g[0]}">${g}</span>`;
const rtg = r => r >= 99.5 ? '99+' : String(Math.max(0, Math.round(r)));
const signed = x => { const v = Math.round(x); return (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v); };
const chanceWords = p => p >= .7 ? 'Very likely' : p >= .35 ? 'Good chance' : p >= .1 ? 'Real chance' : p >= .01 ? 'Long shot' : p > .0005 ? 'Tiny' : 'Almost none';
const favWords = p => p >= .9 ? 'Big favorite' : p >= .7 ? 'Favorite' : p >= .55 ? 'Slight favorite' : p >= .45 ? 'Toss-up' : p >= .3 ? 'Underdog' : 'Big underdog';
const chemWords = c => c >= 3 ? 'Great fit' : c >= 0 ? 'Good fit' : c >= -3 ? 'Some issues' : 'Poor fit';
const perkPill = k => { const P = E.PERKS[k]; return `<span class="perk ${P.cat}" data-tip="<b>${P.name}</b><br>${P.desc.replace(/"/g, '&quot;')}">${P.tag}</span>`; };
const oppRating = o => rtg(E.BASELINE + o.net / E.PER_POINT);

const fresh = () => ({ mGroup: 'all', sel: null, started: S ? S.started : false, picks: {}, rounds: [], spin: null, skips: { team: 1, era: 1 }, pending: null, spinning: false, view: null, sort: S ? S.sort : 'ovr', fitsOnly: S ? S.fitsOnly : false });
let S = null; S = fresh();
let STAGE = 'draft'; // draft | season | seasonDone | playoffs | done
const nPicked = () => Object.keys(S.picks).length;
const draftDone = () => nPicked() === 5;
const openSlots = () => E.SLOTS.filter(s => !S.picks[s]);
const havePid = p => Object.values(S.picks).some(q => pid(q) === pid(p));
const halfs = x => String(x).replace(/^0\.5$/, '½').replace(/\.5$/, '½');
const chemFmt = x => { const v = Math.round(x * 2) / 2; return (v > 0 ? '+' : v < 0 ? '−' : '±') + halfs(Math.abs(v)); };
function chemDelta(p) {
  const picked = Object.values(S.picks); const open = openSlots().length;
  const b = E.rate(picked.map(E.derive), open).parts, a = E.rate(picked.concat(p).map(E.derive), Math.max(0, open - 1)).parts;
  const why = []; const add = (k, txtUp, txtDown) => { const d = a[k] - b[k]; if (d > 0 && txtUp) why.push(`${txtUp} +${halfs(d)}`); if (d < 0 && txtDown) why.push(`${txtDown} −${halfs(-d)}`); };
  add('ball', null, 'third ball-dominant scorer');
  add('shooting', 'fixes your shooting', 'leaves fewer than two shooters');
  add('size', 'gives you a big man', 'leaves no big man');
  add('mates', 'teammate of one of your picks', null);
  add('spacingB', 'third shooter: spacing bonus', 'loses the spacing bonus');
  add('passer', 'gives you a passer', null);
  add('rimP', 'gives you a rim protector', null);
  const d = ['ball', 'shooting', 'size', 'mates', 'spacingB', 'passer', 'rimP'].reduce((s, k) => s + (a[k] - b[k]), 0);
  return { d, why };
}
const chemChip = p => { if (!S.spin || havePid(p)) return ''; const c = chemDelta(p); return c.d ? `<span class="chem ${c.d > 0 ? 'up' : 'down'}" tabindex="0" role="button" data-tip="<b>Chemistry ${c.d > 0 ? '+' : '−'}${halfs(Math.abs(c.d))} if you add him</b><br>${c.why.join('<br>')}">Chem ${c.d > 0 ? '+' : '−'}${halfs(Math.abs(c.d))} <i class="qi">?</i></span>` : ''; };
const ROLE_INFO = {
  shooter: ['Shooter', 'Counts toward the shooting check: two are needed, three earn the spacing bonus.'],
  big: ['Big man', 'Rebounds or blocks shots. Every team needs one.'],
  passer: ['Passer', 'Sets up teammates. Having a passer gives +1 chemistry.'],
  rim: ['Rim protector', 'Protects the basket. Having a rim protector gives +1 chemistry.'],
  bd: ['Ball-dominant', 'Uses 27%+ of his team\'s plays. Three or more of them cost 3 chemistry.'],
};
const injTag = p => (!p.perks.includes('iron') && p.gp <= 62) ? `<span class="role inj" tabindex="0" role="button" data-tip="<b>Injury-prone</b><br>Played only ${p.gp} of 82 games that season, so he misses about that many in the sim. A bench player covers for him.">Injury-prone</span>` : '';
const roleTags = p => injTag(p) + (() => { const r = E.roles(p); return Object.keys(ROLE_INFO).filter(k => r[k]).map(k => `<span class="role ${k === 'bd' ? 'bdr' : ''}" tabindex="0" role="button" data-tip="<b>${ROLE_INFO[k][0]}</b><br>${ROLE_INFO[k][1]}">${ROLE_INFO[k][0]}</span>`).join(''); })();
const BD_TIP = '<b>Ball-dominant scorer</b><br>Uses 27%+ of his team\'s plays. Three or more of them cost 3 chemistry.';
const bdTag = p => p.usg >= 27 ? `<span class="bd" tabindex="0" role="button" data-tip="${BD_TIP}">Ball-dominant</span>` : '';
const mateOf = p => Object.values(S.picks).find(q => q.team === p.team && q.decade === p.decade && pid(q) !== pid(p));
const mateTag = p => { const m = mateOf(p); return m ? `<span class="perk team" title="Played with ${m.name}: +1 chemistry">Teammate +1</span>` : ''; };
const canTake = p => !havePid(p) && p.pos.some(s => !S.picks[s]);

// ---------- team numbers ----------
function lineupArr() { return E.SLOTS.map(s => S.picks[s] || { repl: true, name: 'Open spot', gp: 82, perks: [] }); }
function tableFor(players) {
  const ds = players.map(p => p.repl ? E.REPL : E.derive(p)); const table = [];
  for (let m = 0; m < 32; m++) table.push(E.rate(ds.map((d, i) => (m >> i) & 1 ? d : E.REPL)));
  return { ds, table };
}
function projection(players, lt) {
  const av = players.map(p => p.repl ? 1 : E.avail(p));
  const w = []; for (let m = 0; m < 32; m++) { let pr = 1; for (let i = 0; i < 5; i++) pr *= (m >> i) & 1 ? av[i] : 1 - av[i]; w.push(pr); }
  let ew = 0, logp = 0;
  for (let g = 0; g < 82; g++) {
    const opp = OPPS[g % 29], home = g % 2 === 0; let p = 0;
    for (let m = 0; m < 32; m++) if (w[m] > 1e-9) {
      const mo = lt.table[m].moments; let ex = lt.table[m].net - opp.net + (home ? E.HOME : -E.HOME);
      let pw = E.Phi(ex / E.SD);
      if (mo.clutch.length) pw += (E.Phi(ex / E.SD) - E.Phi((ex - 4) / E.SD)) * (1 - Math.pow(.7, mo.clutch.length));
      p += w[m] * pw;
    }
    ew += p; logp += Math.log(Math.max(p, 1e-300));
  }
  return { wins: ew, p82: Math.exp(logp) };
}
let TN_KEY = null, TN_VAL = null;
function teamNumbers() {
  const key = E.SLOTS.map(s => S.picks[s] ? S.picks[s].id : '-').join(',') + '|' + OPPS.length + OPPS[0].label;
  if (key === TN_KEY) return TN_VAL; TN_KEY = key; TN_VAL = teamNumbers0(); return TN_VAL;
}
function teamNumbers0() {
  const pl = lineupArr(); const lt = tableFor(pl); const full = lt.table[31]; const pr = projection(pl, lt);
  return { rating: full.team, talent: full.players, chem: full.chem, perks: full.perks, wins: pr.wins, p82: pr.p82, full };
}
function chemText(rt) {
  const P = rt.parts; const iss = [];
  if (P.ball < 0) iss.push('three or more ball-dominant scorers (−3)');
  if (P.shooting < 0) iss.push('fewer than two Shooters (−3)');
  if (P.size < 0) iss.push('no big man (−3)');
  const pos = []; if (P.spacingB) pos.push('spacing +1'); if (P.passer) pos.push('passer +1'); if (P.rimP) pos.push('rim protector +1'); if (P.mates) pos.push(`teammates +${halfs(P.mates)}`);
  return (iss.length ? 'Chemistry issues: ' + iss.join(', ') + '.' : 'No chemistry issues.') + (pos.length ? ` Chemistry bonuses: ${pos.join(', ')}.` : '');
}
// one row per chemistry rule: what you have, and exactly what it does to the rating
function chemNote(rt) {
  const P = rt.parts; const picked = Object.values(S.picks); if (!picked.length) return '';
  const rr = picked.map(E.roles); const cnt = k => rr.filter(x => x[k]).length;
  const nS = cnt('shooter'), nB = cnt('big'), nP = cnt('passer'), nR = cnt('rim'), nD = cnt('bd');
  const ICON = { good: '✓', bad: '!', ok: '✓', open: '' };
  const row = (state, label, detail, val, tip) => `<div class="crow ${state}" tabindex="0" role="button" data-tip="${tip}"><span class="ci">${ICON[state]}</span><span class="cl">${label}${detail ? `<span class="cd">${detail}</span>` : ''}</span><span class="cv">${val}</span></div>`;
  const shoot = P.shooting < 0 ? row('bad', 'Shooters', `${nS} of 2 needed`, '−3', '<b>Shooters</b><br>Fewer than two costs 3 chemistry. Three or more earn +1 spacing.')
    : P.spacingB ? row('good', 'Shooters', `${nS}, spacing`, '+1', '<b>Shooters</b><br>Three or more: +1 spacing bonus.')
    : row('ok', 'Shooters', `${nS}, a 3rd adds +1`, '±0', '<b>Shooters</b><br>You have the two you need. A third earns +1 spacing.');
  const big = P.size < 0 ? row('bad', 'Big man', 'need one', '−3', '<b>Big man</b><br>A team with no big man loses 3 chemistry.')
    : row('ok', 'Big man', nB > 1 ? `${nB}` : '', '±0', '<b>Big man</b><br>Covered. Without one you would lose 3 chemistry.');
  const bd = P.ball < 0 ? row('bad', 'Ball-dominant', `${nD}, max 2`, '−3', '<b>Ball-dominant scorers</b><br>Three or more fight over the ball: −3 chemistry.')
    : row('ok', 'Ball-dominant', `${nD} of max 2`, '±0', '<b>Ball-dominant scorers</b><br>Up to two is fine. A third costs 3 chemistry.');
  const pass = nP ? row('good', 'Passer', '', '+1', '<b>Passer</b><br>Someone who sets up teammates: +1 chemistry.')
    : row('open', 'Passer', 'none yet', '+1', '<b>Passer</b><br>Add a player tagged Passer for +1 chemistry.');
  const rim = nR ? row('good', 'Rim protector', '', '+1', '<b>Rim protector</b><br>Someone who protects the basket: +1 chemistry.')
    : row('open', 'Rim protector', 'none yet', '+1', '<b>Rim protector</b><br>Add a player tagged Rim protector for +1 chemistry.');
  const pairs = P.mates;
  const mates = P.mates ? row('good', 'Teammates', `${pairs} pair${pairs > 1 ? 's' : ''}`, '+' + halfs(P.mates), '<b>Teammates</b><br>Players from the same team and decade: +1 per pair (max +2).')
    : row('open', 'Teammates', 'same team + decade', '+1', '<b>Teammates</b><br>Two players from the same team and decade: +1 per pair (max +2).');
  return `<div class="chemlist">${shoot}${big}${bd}${pass}${rim}${mates}</div>`;
}
function drawTeamScore() {
  drawTeamScore0();
  if (!nPicked()) { $('miniScore').innerHTML = '<span class="pmeta">Your court fills up as you pick. Each spin gives you one new player.</span>'; return; }
  const t = teamNumbers(); const w = Math.round(t.wins);
  $('miniScore').innerHTML = `<div class="minis"><span><small>Team rating</small><b>${rtg(t.rating)}</b></span><span><small>Projected</small><b>${w}–${82 - w}</b></span><span><small>Chemistry</small><b>${chemFmt(t.chem)}</b></span><span><small>Perks</small><b>${signed(t.perks)}</b></span></div>${chemNote(t.full)}`;
}
function drawTeamScore0() {
  const n = nPicked();
  if (!n) {
    $('teamscore').innerHTML = `<div class="ovr-big" style="color:var(--muted)">—</div><div><div class="ts-k">Team rating</div><div class="pmeta">Grows with every pick. About 85 is an average NBA team. Around 98 or higher is perfect-season territory.</div></div>`;
    $('courtHint').textContent = ''; return;
  }
  const t = teamNumbers(); const w = Math.round(t.wins);
  const col = t.rating >= 98 ? '#E3A008' : t.rating >= 93 ? 'var(--win)' : t.rating >= 85 ? 'var(--ink)' : 'var(--muted)';
  $('teamscore').innerHTML = `<div class="ovr-big" style="color:${col}">${rtg(t.rating)}</div>
    <div><div class="ts-k" style="margin-bottom:6px">Team rating</div><div class="ts-rows">
      <span><span class="ts-k">Projected record</span><b>${w}–${82 - w}</b></span>
      <span><span class="ts-k">Perfect season</span><b>${chanceWords(t.p82)}</b></span>
      <span><span class="ts-k">Your five</span><b>${rtg(t.talent)}</b></span>
      <span><span class="ts-k">Chemistry</span><b>${chemFmt(t.chem)} · ${chemWords(t.chem)}</b></span>
      <span><span class="ts-k">Perks</span><b>${signed(t.perks)}</b></span>
    </div>${chemNote(t.full)}</div>`;
  $('courtHint').textContent = `${n} of 5 picked`;
}

// ---------- court ----------
function drawCourt() {
  const floor = `<rect width="500" height="420" fill="var(--court)"/>` + Array.from({ length: 12 }, (_, i) => `<rect x="${i * 44}" y="0" width="22" height="420" fill="var(--court-2)"/>`).join('');
  let html = `${floor}<g fill="none" stroke="var(--court-line)" stroke-width="2.5">
    <rect x="190" y="232" width="120" height="186" fill="var(--accent)" fill-opacity=".22"/><circle cx="250" cy="232" r="60"/>
    <path d="M30 418 L30 322 A228 228 0 0 1 470 322 L470 418"/><path d="M210 380 A40 40 0 0 0 290 380"/>
    <line x1="0" y1="2" x2="500" y2="2"/><path d="M190 2 A60 60 0 0 0 310 2"/><line x1="222" y1="394" x2="278" y2="394" stroke-width="4"/></g>
    <circle cx="250" cy="382" r="9" fill="none" stroke="var(--accent)" stroke-width="3"/>`;
  E.SLOTS.forEach(s => {
    const [x, y] = SLOT_XY[s]; const p = S.picks[s];
    if (!p) html += `<g class="slot-empty ${S.pending && S.pending.open.includes(s) ? 'slot-open-pulse' : ''}" id="slot-${s}" ${S.pending && S.pending.open.includes(s) ? `data-slot="${s}" style="cursor:pointer"` : ''}><circle cx="${x}" cy="${y}" r="30"/><text x="${x}" y="${y + 6}" text-anchor="middle">${s}</text></g>`;
    else {
      const t = teamOf(p.team); const w = Math.max(70, (p.name.length + 5) * 7 + 14); const lx = Math.min(500 - w / 2 - 4, Math.max(w / 2 + 4, x));
      html += `<g id="slot-${s}"><circle cx="${x}" cy="${y}" r="31" fill="${t.c1}" stroke="var(--surface)" stroke-width="3"/>
      <text class="token-ini" x="${x}" y="${y + 7}" text-anchor="middle">${ini(p.name)}</text>
      <rect x="${x + 14}" y="${y - 36}" width="30" height="20" rx="6" fill="${ovrCol(p.ovr)}"/>
      <text x="${x + 29}" y="${y - 21.5}" text-anchor="middle" style="font-family:var(--display);font-weight:700;font-size:12px;fill:#fff">${p.ovr}</text>
      <rect x="${lx - w / 2}" y="${y + 37}" width="${w}" height="23" rx="11.5" fill="var(--surface)"/>
      <text class="token-name" x="${lx}" y="${y + 52.5}" text-anchor="middle" fill="var(--ink)">${s} · ${p.name}</text>
      <title>${p.name}, ${E.teamName(p.team, p.decade)} ${p.season}. Rating ${p.ovr}.</title></g>`;
    }
  });
  $('court').innerHTML = html;
  $('courtMini').innerHTML = html.replace(/ id="slot-[A-Z]+"/g, '').replace(/ data-slot="[A-Z]+"/g, '');
  mCourt();
}
$('court').addEventListener('click', e => { const g = e.target.closest('[data-slot]'); if (g && S.pending) commit(S.pending.p, g.dataset.slot); });

// ---------- reels ----------
const splitName = n => { const m = n.match(/^(.*) (Trail Blazers|\S+)$/); return m ? [m[1], m[2]] : [n, '']; };
const teamCell = (t, decId) => { const [city, nick] = splitName(E.teamName(t.id, decId || randOf(Object.keys(t.names)))); return `<span style="display:flex;align-items:center;gap:10px;overflow:hidden;text-overflow:ellipsis;padding:4px 0 4px 4px;margin-left:-4px"><i style="flex:none;width:12px;height:12px;border-radius:50%;background:${t.c1};border:2px solid ${t.c2}"></i>${city}</span><small style="padding-left:20px">${nick}</small>`; };
const decCell = d => `${d.id}<small>Decade</small>`;
function setReels(team, dec) {
  ['mReelTeam', 'mReelDec'].forEach(id => { const el = $(id); if (el) { el.style.transition = 'none'; el.style.transform = ''; } });
  if ($('mReelTeam')) { $('mReelTeam').innerHTML = `<div class="cell">${team ? mTeamCell(team, dec && dec.id) : '?'}</div>`; $('mReelDec').innerHTML = `<div class="cell">${dec ? mDecCell(dec) : '?'}</div>`; }
  ['reelTeam', 'reelDec'].forEach(id => { $(id).style.transition = 'none'; $(id).style.transform = ''; });
  $('reelTeam').innerHTML = `<div class="cell">${team ? teamCell(team, dec && dec.id) : 'Team<small>Spin to draw</small>'}</div>`;
  $('reelDec').innerHTML = `<div class="cell">${dec ? decCell(dec) : 'Decade<small>&nbsp;</small>'}</div>`;
}
function animateReel(el, items, finalHTML, dur, cellH) {
  cellH = cellH || CELL;
  el.style.transition = 'none'; el.style.transform = 'translateY(0)';
  el.innerHTML = items.map(h => `<div class="cell">${h}</div>`).join('') + `<div class="cell">${finalHTML}</div>`;
  const shift = -items.length * cellH;
  if (reduce) { el.style.transform = `translateY(${shift}px)`; return Promise.resolve(); }
  void el.offsetHeight; el.style.transition = `transform ${dur}ms cubic-bezier(.12,.75,.22,1.04)`; el.style.transform = `translateY(${shift}px)`;
  return new Promise(r => setTimeout(r, dur + 30));
}
const eligible = (team, dec) => E.roster(team.id, dec.id).some(canTake);
async function spin(which = 'both') {
  if (!S.started || S.spinning || draftDone() || STAGE !== 'draft' || VIEW !== 'draft') return;
  if (which === 'both' && S.spin) return;
  S.spinning = true; S.view = null; S.openId = null; S.sel = null; refresh();
  let team = S.spin?.team, dec = S.spin?.dec, tries = 0;
  if (MODE === 'challenge' && CH) ({ team, dec } = seededSpin(which, team, dec));
  else do { if (which !== 'era') team = randOf(E.TEAMS); if (which !== 'team') dec = randOf(E.DECADES); tries++; } while (!eligible(team, dec) && tries < 200);
  S.spin = { team, dec };
  const jobs = [];
  if (which !== 'era') jobs.push(animateReel($('reelTeam'), Array.from({ length: 16 }, () => teamCell(randOf(E.TEAMS))), teamCell(team, dec.id), 1100));
  else $('reelTeam').innerHTML = `<div class="cell">${teamCell(team, dec.id)}</div>`;
  if (which !== 'team') jobs.push(animateReel($('reelDec'), Array.from({ length: 12 }, () => decCell(randOf(E.DECADES))), decCell(dec), which === 'both' ? 1450 : 1100));
  if (which !== 'era') jobs.push(animateReel($('mReelTeam'), Array.from({ length: 16 }, () => mTeamCell(randOf(E.TEAMS))), mTeamCell(team, dec.id), 1100, MCELL));
  else $('mReelTeam').innerHTML = `<div class="cell">${mTeamCell(team, dec.id)}</div>`;
  if (which !== 'team') jobs.push(animateReel($('mReelDec'), Array.from({ length: 12 }, () => mDecCell(randOf(E.DECADES))), mDecCell(dec), which === 'both' ? 1450 : 1100, MCELL));
  await Promise.all(jobs);
  S.spinning = false; S.reveal = true; S.enterAnim = true; refresh(); scrollStage();
  setTimeout(() => { S.enterAnim = false; }, 1000);
  // phones: after showing what was rolled, slide the list up. Computers already show the list, so nothing is redrawn (no blink).
  setTimeout(() => { S.reveal = false; if (!S.spin || S.spinning || !matchMedia('(max-width:900px)').matches) return; S.enterAnim = true; mRender('pick'); setTimeout(() => { S.enterAnim = false; }, 1000); }, reduce ? 0 : 900);
}

// ---------- picks board (right column) ----------
function drawBoard() {
  let h = '';
  for (let i = 0; i < 5; i++) {
    const r = S.rounds[i];
    if (r) {
      const t = teamOf(r.team), p = POOL.find(x => x.id === r.pickId);
      h += `<li><button data-round="${i}" class="${S.view === i ? 'viewing' : ''}" aria-label="Round ${i + 1}: ${p.name}. Look at that roster again."><span class="top"><span class="rnum">${i + 1}</span>${ovrBadge(p)}</span><span class="nm">${p.name.split(' ').slice(1).join(' ') || p.name}</span><span class="pmeta">${r.slot} · ${t.id} ’${r.dec.slice(2, 4)}s</span></button></li>`;
    } else if (i === S.rounds.length && !draftDone()) {
      h += `<li><button disabled class="cur" aria-label="Round ${i + 1}, now"><span class="top"><span class="rnum" style="color:var(--accent)">${i + 1}</span></span><span class="nm">${S.spin ? S.spin.team.id + ' ’' + S.spin.dec.id.slice(2, 4) + 's' : 'Now'}</span></button></li>`;
    } else h += `<li><button disabled aria-label="Round ${i + 1}, not drafted yet"><span class="rnum">${i + 1}</span></button></li>`;
  }
  $('boardList').innerHTML = h;
}
$('boardList').addEventListener('click', e => { const b = e.target.closest('button[data-round]'); if (!b) return; S.view = +b.dataset.round; closeSheet(); refresh(); scrollStage(); });

// ---------- roster: every row says exactly what you can do ----------
const SORTS = { ovr: p => p.ovr, pts: p => p.pts, reb: p => p.reb, ast: p => p.ast, def: p => p.def * 10 + p.stl + p.blk };
const sc = (label, v, est) => `<span><b class="${est ? 'est' : ''}">${v}</b>${label}</span>`;
function rowHTML(p, opts) {
  const team = teamOf(p.team);
  const open = !opts.readonly && !havePid(p) ? p.pos.filter(s => !S.picks[s]) : [];
  const why = opts.readonly ? '' : havePid(p) ? 'Already on your team' : !open.length ? `Plays ${p.pos.join('/')}: those spots are filled` : '';
  const action = opts.readonly ? (opts.chosen ? '<span class="crown">Your pick</span>' : '')
    : open.length ? `<div class="adds"><span class="addlbl">Add as</span>${open.map(s => `<button class="btn ball addpos" data-id="${p.id}" data-slot="${s}" aria-label="Add ${p.name} as ${s}">${s}</button>`).join('')}</div>`
    : `<span class="pmeta">${why}</span>`;
  const isOpen = S.openId === p.id;
  const dots = p.perks.map(k => `<i class="pdot ${E.PERKS[k].cat}" title="${E.PERKS[k].name}"></i>`).join('');
  return `<div style="--i:${opts.i || 0}" class="prow2 ${!opts.readonly && !open.length ? 'off' : ''} ${opts.chosen ? 'chosen' : ''} ${isOpen ? 'open' : ''}" data-id="${p.id}" role="button" tabindex="0" aria-expanded="${isOpen}">
    <span class="chip-ini" style="background:${team.c1}">${ini(p.name)}</span>
    <div class="pmain"><div class="pname">${p.name} ${ovrBadge(p)}${asStar(p)}</div>
      <div class="pshort num">${p.season} · ${p.pts} pts · ${p.reb} reb · ${p.ast} ast</div>
      <div class="pmeta pfull">${p.season} · ${p.archLabel}</div>
      <div class="pline num">${p.pts} pts · ${p.reb} reb · ${p.ast} ast · <span class="${p.defEst ? 'est' : ''}">${p.stl} stl · ${p.blk} blk</span> </div><div class="proles">${roleTags(p)}${opts.readonly ? '' : chemChip(p)}</div>
      ${p.perks.length ? `<div class="pperks">${p.perks.map(perkPill).join('')}</div>` : ''}
    </div>
    <span class="pchev" aria-hidden="true">${!opts.readonly && open.length ? (isOpen ? 'Close' : 'Pick') : ''}</span>
    <div class="pact">${action}</div>
  </div>`;
}
function drawRoster() {
  const tools = $('rosterTools'), ros = $('roster');
  if (S.view !== null) {
    const r = S.rounds[S.view];
    tools.classList.add('hidden');
    ros.innerHTML = E.roster(r.team, r.dec).slice().sort((a, b) => b.ovr - a.ovr).map(p => rowHTML(p, { readonly: true, chosen: p.id === r.pickId })).join('');
    return;
  }
  if (draftDone() || S.spinning || !S.spin) { tools.classList.add('hidden'); ros.innerHTML = ''; return; }
  tools.classList.remove('hidden');
  const { team, dec } = S.spin;
  const ro = E.roster(team.id, dec.id).slice().sort((a, b) => (canTake(b) - canTake(a)) || (SORTS[S.sort](b) - SORTS[S.sort](a)));
  ros.classList.toggle('enter', !!S.enterAnim); $('drawBar').classList.toggle('enter', !!S.enterAnim);
  ros.innerHTML = ro.map((p, i) => rowHTML(p, { i })).join('') + (ro.some(p => p.defEst) ? '<p class="hint" style="margin:4px 2px 0">Numbers in italics are estimates: steals and blocks weren\'t counted before 1973–74.</p>' : '');
}
$('sortChips').addEventListener('click', e => { const b = e.target.closest('[data-sort]'); if (!b) return; S.sort = b.dataset.sort; document.querySelectorAll('#sortChips .chip').forEach(c => c.setAttribute('aria-pressed', c === b)); drawRoster(); });
$('roster').addEventListener('click', e => {
  const b = e.target.closest('.addpos');
  if (b && S.view === null) { commit(POOL.find(x => x.id === b.dataset.id), b.dataset.slot); return; }
  const row = e.target.closest('.prow2'); if (!row) return;   // tap a player to open him (mobile shows positions only then)
  S.openId = S.openId === row.dataset.id ? null : row.dataset.id;
  const keep = $('stageScroll').scrollTop; drawRoster(); $('stageScroll').scrollTop = keep;
});
$('roster').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('prow2')) { e.preventDefault(); e.target.click(); } });
function scrollStage() { requestAnimationFrame(() => { const el = PHONE.matches ? $('mList') : $('stageScroll'); if (el && el.scrollTop) el.scrollTop = 0; }); }
// mobile: the team lives in a slide-up sheet, with a compact strip always on screen
function drawStrip() {
  const t = nPicked() ? teamNumbers() : null;
  $('mstrip').innerHTML = E.SLOTS.map(s => { const p = S.picks[s]; return p ? `<span class="ms" style="background:${teamOf(p.team).c1}"><b>${ini(p.name)}</b><small>${p.ovr}</small></span>` : `<span class="ms empty"><b>${s}</b><small>&nbsp;</small></span>`; }).join('')
    + `<span class="ms-rt"><small>Team</small><b>${t ? rtg(t.rating) : '—'}</b></span>`;
}
function openSheet() { document.body.classList.add('sheet-open'); drawBoard(); drawCourt(); drawTeamScore(); }
function closeSheet() { document.body.classList.remove('sheet-open'); }
$('mstrip').onclick = openSheet; $('sheetClose').onclick = closeSheet; $('sheetDim').onclick = closeSheet; $('sheetDim').onclick = closeSheet;

function commit(p, slot) {
  const row = document.querySelector(`.prow2[data-id="${p.id}"]`);
  const from = row ? row.querySelector('.chip-ini').getBoundingClientRect() : null;
  S.picks[slot] = p; S.rounds.push({ team: S.spin.team.id, dec: S.spin.dec.id, pickId: p.id, slot }); S.spin = null;
  S.lastPick = { p, slot }; S.sel = null; S.popSlot = slot;
  setReels(null, null); refresh();
  const svg = $('court').getBoundingClientRect(); const k = svg.width / 500;
  const tx = svg.left + SLOT_XY[slot][0] * k, ty = svg.top + SLOT_XY[slot][1] * k;
  if (!reduce && from && svg.width && ty > -50 && ty < innerHeight + 50) {
    const fly = document.createElement('div'); fly.className = 'fly'; fly.textContent = ini(p.name); fly.style.background = teamOf(p.team).c1;
    fly.style.left = from.left + 'px'; fly.style.top = from.top + 'px'; document.body.appendChild(fly);
    const g = $('slot-' + slot); if (g) g.style.opacity = 0;
    const s = (62 * k) / 42; // land exactly the size of the token on the court
    const dx = tx - from.left - 21, dy = ty - from.top - 21;
    fly.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${dx * .55}px,${dy * .55 - 40}px) scale(${(1 + s) / 2 * 1.08})`, offset: .6 },
      { transform: `translate(${dx}px,${dy}px) scale(${s})`, opacity: 1 }], { duration: 520, easing: 'cubic-bezier(.25,.8,.3,1)' })
      .onfinish = () => { fly.remove(); const g2 = $('slot-' + slot); if (g2) { g2.style.opacity = 1; g2.animate([{ transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' }); g2.style.transformOrigin = `${SLOT_XY[slot][0]}px ${SLOT_XY[slot][1]}px`; } };
  }
  scrollStage();
}

// ---------- guidance: the stage always shows one next step ----------
function suggestion() {
  const picked = Object.values(S.picks); if (!picked.length) return '';
  const ds = picked.map(E.derive); const open = openSlots();
  const scorers = ds.filter(d => d.u >= .27).length, shooters = ds.filter(d => d.shooter).length;
  if (scorers >= 2 && open.length) return 'Tip: you have two ball-dominant scorers. A third costs 3 points, so a role player or defender may fit better.';
  if (!ds.some(d => d.big) && open.length <= 2 && (open.includes('C') || open.includes('PF'))) return 'Tip: you still need a big man (a center or power forward who rebounds or blocks), or you lose 3 points.';
  if (shooters < 2 && open.length <= 3) return `Tip: you have ${shooters} shooter${shooters === 1 ? '' : 's'}. You need two, or you lose 3 points. Look for the Shooter tag.`;
  return Math.random() < .5 ? 'Tip: perks add a little (up to +4 in total), but a better player usually adds more.' : 'Tip: two players from the same team and decade earn a Teammates +1 bonus. Re-rolls can help you find one.';
}
function refresh() {
  const full = draftDone(), rnd = Math.min(5, S.rounds.length + 1);
  const state = S.view !== null ? 'view' : full ? 'ready' : S.spinning ? 'spinning' : S.spin ? 'pick' : 'spin';
  document.body.dataset.state = state;
  $('spinPreview').classList.toggle('hidden', !(state === 'spin' || state === 'spinning'));
  $('spinBox').classList.toggle('hidden', !(state === 'spin' || state === 'spinning'));
  $('drawBar').classList.toggle('hidden', state !== 'pick' && state !== 'view');
  $('readyBox').classList.toggle('hidden', state !== 'ready');
  $('spinBtn').disabled = state !== 'spin';
  $('spinBtn').innerHTML = state === 'spinning' ? 'Spinning…' : `Spin<kbd>S</kbd>`;
  const last = S.lastPick;
  if (state === 'spin') {
    $('stageStep').textContent = MODE === 'challenge' && CH ? `Challenge · round ${rnd} of 5` : `Round ${rnd} of 5`;
    $('stageTitle').textContent = rnd === 1 ? 'Spin for your first team' : 'Spin for your next team';
    $('stageSub').textContent = (last ? `${last.p.name} joined at ${last.slot}. ` : 'You get a random team and decade, then pick one player from it. ') + suggestion();
  } else if (state === 'spinning') {
    $('stageStep').textContent = `Round ${rnd} of 5`; $('stageTitle').textContent = 'Spinning…'; $('stageSub').textContent = '';
  } else if (state === 'pick') {
    const { team, dec } = S.spin;
    $('stageStep').textContent = `Round ${rnd} of 5`;
    $('stageTitle').textContent = 'Pick one player';
    $('stageSub').textContent = `Open spots: ${openSlots().join(', ')}. Tap an orange position button to add a player.`;
    $('drawBar').innerHTML = `<span class="dot2" style="background:${team.c1};box-shadow:0 0 0 2px ${team.c2}"></span><div style="flex:1;min-width:0"><b>${E.teamName(team.id, dec.id)}</b><span class="pmeta"> · ${dec.id}</span></div>
      <button class="btn" id="skipTeam" ${S.skips.team < 1 ? 'disabled' : ''}>${S.skips.team ? 'New team<span class="cnt"> (1)</span>' : 'Team used'}</button>
      <button class="btn" id="skipEra" ${S.skips.era < 1 ? 'disabled' : ''}>${S.skips.era ? 'New decade<span class="cnt"> (1)</span>' : 'Decade used'}</button>`;
    $('skipTeam').onclick = () => { S.skips.team--; spin('team'); };
    $('skipEra').onclick = () => { S.skips.era--; spin('era'); };
  } else if (state === 'view') {
    const r = S.rounds[S.view];
    $('stageStep').textContent = `Looking back · round ${S.view + 1}`;
    $('stageTitle').textContent = `${E.teamName(r.team, r.dec)}, ${r.dec}`;
    $('stageSub').textContent = 'This is the roster you picked from.';
    $('drawBar').innerHTML = `<div style="flex:1"></div><button class="btn ball" id="backCur">${full ? 'Back to my team' : `Back to round ${rnd}`}</button>`;
    $('backCur').onclick = () => { S.view = null; refresh(); };
  } else if (MODE === 'challenge' && CH) {
    $('stageStep').textContent = CH.role === 'create' ? 'Challenge' : `Challenge from ${CH.opp.name}`;
    $('stageTitle').textContent = 'Your team is ready'; $('stageSub').textContent = '';
    $('readyBox').innerHTML = chReadyHTML();
  } else {
    const t = teamNumbers(); const w = Math.round(t.wins);
    $('stageStep').textContent = 'Draft complete';
    $('stageTitle').textContent = 'Your team is ready';
    $('stageSub').textContent = '';
    $('readyBox').innerHTML = `<div class="readycard"><div><div class="pmeta">Team rating</div><div class="ovr-big">${rtg(t.rating)}</div></div>
      <div style="flex:1;min-width:180px"><div><b>Projected record ${w}–${82 - w}</b></div><div class="pmeta">Perfect season: ${chanceWords(t.p82)}. ${chemText(t.full)}</div></div></div>
      <button class="btn ball cta" id="playBtn2" style="width:100%;margin-top:14px">Play the season</button><button class="btn mobile-only" id="seeTeam" style="width:100%;margin-top:8px">See your team on the court</button><button class="btn" id="redraftReady" style="width:100%;margin-top:8px">Not happy? Start a new draft</button>`;
    $('redraftReady').onclick = playAgain;
    $('seeTeam').onclick = openSheet;
    $('playBtn2').onclick = startSeason;
  }
  $('pips').innerHTML = Array.from({ length: 5 }, (_, i) => { const r = S.rounds[i]; return `<span class="pip ${!r && i === S.rounds.length && !full && S.started ? 'now' : ''}" style="${r ? `background:${teamOf(r.team).c1}` : ''}" title="Round ${i + 1}"></span>`; }).join('');
  if (PHONE.matches) { drawStrip(); mRender(state); mCourt(); if (document.body.classList.contains('sheet-open')) { drawBoard(); drawCourt(); drawTeamScore(); } }
  else { drawBoard(); drawRoster(); drawCourt(); drawTeamScore(); }
  stepbar();
}
const PHONE = matchMedia('(max-width:900px)');
window.addEventListener('resize', () => { S.sheetTopSet = false; });
PHONE.addEventListener ? PHONE.addEventListener('change', () => { if (S.started) refresh(); }) : PHONE.addListener(() => { if (S.started) refresh(); });
const VIEWS = { intro: 'intro', draft: 'game', season: 'season', playoffs: 'playoffs', challenge: 'chView' };
let VIEW = 'intro';
function showView(v) {
  VIEW = v; Object.entries(VIEWS).forEach(([k, id]) => $(id).classList.toggle('hidden', k !== v));
  document.body.dataset.view = v; $('scroller').scrollTop = 0; closeSheet(); stepbar();
}
function stepbar() {
  const order = ['draft', 'season', 'playoffs', 'score'];
  const cur = STAGE === 'done' ? 'score' : VIEW === 'intro' ? null : VIEW;
  const ci = order.indexOf(cur);
  document.querySelectorAll('#stepper li').forEach((li, i) => { li.className = i < ci ? 'done' : i === ci ? 'on' : ''; });
}
function startGame() { S.started = true; showView('draft'); refresh(); }
if ($('startBtn')) $('startBtn').onclick = startGame;
$('spinBtn').onclick = () => spin('both');
document.addEventListener('keydown', e => {
  if (e.key.toLowerCase() !== 's' || e.metaKey || e.ctrlKey || e.altKey) return;
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
  if (VIEW !== 'draft') return; e.preventDefault(); spin('both');
});
$('hideStats').onchange = e => document.body.classList.toggle('hide-stats', e.target.checked);
const RATING_HELP = `<p style="margin:8px 0 6px"><b>Player rating</b> comes from one box-score formula (<b>1.5 × points + rebounds + 1.2 × assists + 2.5 × steals + 2.5 × blocks − 0.6 × missed shots</b>, adjusted for pace), then ranked against every regular that season. The scale follows NBA 2K: the league's best player is about 97, a top-10 player about 94, each team's best player about 88, a solid starter about 80. 99 is reserved for a league-best season by a wide margin. A season needs 1,500 minutes to count.</p><p style="margin:0 0 6px"><b>Colours:</b> <span class="ovr t-red">97+</span> <span class="ovr t-yel">93</span> <span class="ovr t-pur">90</span> <span class="ovr t-blu">86</span> <span class="ovr t-grn">82</span> <span class="ovr t-gry">81−</span> &nbsp;red is the very best, then yellow, purple, blue, green and grey. A gold ★ marks an All-Star.</p><p style="margin:0 0 6px"><b>Team rating</b> = your five (best player counts most) + chemistry + perks. Talent matters most: chemistry bonuses and perks are each capped at +4.</p><p style="margin:0 0 6px"><b>Roles</b> (grey tags) are what a player brings to chemistry: Shooter, Big man, Passer, Rim protector, Ball-dominant.</p><p style="margin:0 0 6px"><b>Chemistry.</b> Penalties: three or more Ball-dominant players (−3), fewer than two Shooters (−3), no Big man (−3). Bonuses (up to +4 together): three or more Shooters (+1), a Passer (+1), a Rim protector (+1), teammates from the same franchise and decade (+1 per pair, max +2).</p><p class="pmeta" style="margin:0">About 85 is an average NBA team. Around 98 or higher can go 82–0.</p>`;
const CATS = [['team', 'Team'], ['offense', 'Offense'], ['defense', 'Defense and size'], ['moment', 'Big moments'], ['health', 'Health']];
$('ratingHelp').innerHTML = RATING_HELP;
$('guide').innerHTML = '<p class="pmeta" style="margin:0">Perks come from each player\'s real career and stats. Each player has at most one: his biggest. The number on a perk is what it adds to your team rating.</p>' + CATS.map(([c, label]) => `<div><h5>${label}</h5><div class="row">${Object.entries(E.PERKS).filter(([, P]) => P.cat === c).map(([k, P]) => `<span>${perkPill(k)}</span><span>${P.desc}</span>`).join('')}</div></div>`).join('');
function resetDraft() { stopPlay(); stopPO(); S = fresh(); S.started = true; STAGE = 'draft'; setReels(null, null); refresh(); }
$('reset').onclick = () => resetDraft();
function playAgain() { resetDraft(); showView('draft'); }
$('againBtn').onclick = playAgain;

// ---------- season ----------
let PLAY = { timer: null, speed: 45, i: 0, res: null, paused: false };
function stopPlay() { clearTimeout(PLAY.timer); PLAY.timer = null; }
function startSeason() {
  stopPO();
  OPPS = E.league(Math.floor(Math.random() * 1e9)); // a new set of 29 historical opponents every season
  const players = E.SLOTS.map(s => S.picks[s]); const lt = E.lineupTable(players);
  const res = E.simSeason(players, lt, Math.floor(Math.random() * 1e9), OPPS, true);
  PLAY = { ...PLAY, i: 0, res, players, lt, paused: false };
  STAGE = 'season'; showView('season'); $('season').classList.remove('done'); $('seasonEnd').classList.add('hidden'); $('seasonCTA').classList.add('hidden'); $('statsBox').open = false;
  $('pauseBtn').textContent = 'Pause'; $('pauseBtn').disabled = false; $('season').querySelector('.ctrl').classList.remove('hidden');
  initSeis(); setRecord(0, 0, 0); $('ticker').innerHTML = '<div class="row1"><span>Tip-off…</span></div>';
  stopPlay(); PLAY.timer = setTimeout(step, 500);
}
$('pauseBtn').onclick = () => { if (PLAY.i >= 82) return; PLAY.paused = !PLAY.paused; $('pauseBtn').textContent = PLAY.paused ? 'Resume' : 'Pause'; if (!PLAY.paused) step(); else stopPlay(); };
function skipSeason() { if (!PLAY.res || PLAY.i >= 82) return; stopPlay(); while (PLAY.i < 82) drawGame(PLAY.res.log[PLAY.i++]); finish(); }
document.querySelectorAll('#seasonSeg button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#seasonSeg button').forEach(x => x.setAttribute('aria-pressed', x === b)); PLAY.speed = +b.dataset.speed;
  if (PLAY.speed === 0 && STAGE === 'season') skipSeason();
});
function step() {
  if (PLAY.paused) return;
  if (PLAY.speed === 0 || reduce) { skipSeason(); return; }
  drawGame(PLAY.res.log[PLAY.i++], true);
  if (PLAY.i >= 82) { PLAY.timer = setTimeout(finish, 300); return; }
  const g = PLAY.res.log[PLAY.i - 1];
  PLAY.timer = setTimeout(step, PLAY.speed + (!g.win || g.hero ? PLAY.speed * 4 : 0));
}
function setRecord(w, l, g) {
  $('record').innerHTML = `${w}–<span class="l">${l}</span>`;
  $('recordSub').textContent = !g ? 'Game 0 of 82' : l === 0 ? `Game ${g} of 82 · still unbeaten` : `Game ${g} of 82 · ${l} ${l === 1 ? 'loss' : 'losses'}`;
}
const SX = i => 30 + i * (950 / 82), MID = 130, SCL = 2.6;
function initSeis() {
  let h = `<line x1="24" y1="${MID}" x2="986" y2="${MID}" stroke="var(--line)" stroke-width="1.5"/>`;
  [20, 40].forEach(v => { h += `<line x1="24" x2="986" y1="${MID - v * SCL}" y2="${MID - v * SCL}" stroke="var(--line)" stroke-dasharray="2 5"/><text x="20" y="${MID - v * SCL + 4}" text-anchor="end" font-size="11" fill="var(--muted)">+${v}</text><line x1="24" x2="986" y1="${MID + v * SCL}" y2="${MID + v * SCL}" stroke="var(--line)" stroke-dasharray="2 5"/><text x="20" y="${MID + v * SCL + 4}" text-anchor="end" font-size="11" fill="var(--muted)">−${v}</text>`; });
  [0, 20, 41, 61].forEach(i => h += `<text x="${SX(i)}" y="252" font-size="11" fill="var(--muted)">Game ${i + 1}</text>`);
  h += `<text x="986" y="${MID - 44 * SCL}" text-anchor="end" font-size="11" fill="var(--muted)">won by</text><text x="986" y="${MID + 46 * SCL}" text-anchor="end" font-size="11" fill="var(--muted)">lost by</text><g id="seisBars"></g>`;
  $('seis').innerHTML = h;
}
function drawGame(g, animate) {
  const x = SX(g.g - 1), m = Math.max(-46, Math.min(46, g.margin)), hgt = Math.max(2, Math.abs(m) * SCL);
  const y = m >= 0 ? MID - hgt : MID; const col = g.hero ? '#DB2777' : g.win ? 'var(--win)' : 'var(--loss)';
  const NS = 'http://www.w3.org/2000/svg'; const r = document.createElementNS(NS, 'rect');
  r.setAttribute('x', x); r.setAttribute('width', 8.6); r.setAttribute('rx', 1.5); r.setAttribute('fill', col); r.setAttribute('y', y); r.setAttribute('height', hgt); r.dataset.g = g.g - 1; r.style.cursor = 'pointer';
  if (animate && !reduce && PLAY.speed >= 150) { r.style.transformOrigin = `${x}px ${MID}px`; r.style.transformBox = 'view-box'; r.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: 220, easing: 'ease-out' }); }
  $('seisBars').appendChild(r);
  setRecord(g.wins, g.losses, g.g);
  $('ticker').innerHTML = gameCard(g, g.g === 82 ? '' : '');
  if (animate) stepbar(`Game ${g.g} of 82 · ${g.wins}–${g.losses}`);
}
function gameNotes(g) {
  const n = [favWords(g.p) + ' before tip-off'];
  if (g.top) n.push(`Top scorer: ${g.top.name} (${g.top.pts})`);
  if (g.hero) n.push(`${g.hero} won it at the buzzer`);
  if (g.out.length) n.push(`Out: ${g.out.join(', ')}`);
  return n.join(' · ');
}
function gameCard(g, prefix) {
  return `<div class="row1"><span>${prefix || ''}Game ${g.gameNo || g.g} · ${g.home ? 'vs' : 'at'} ${g.opp.label}</span><span style="color:${g.hero ? '#DB2777' : g.win ? 'var(--win)' : 'var(--loss)'};font-weight:700;flex:none">${g.hero ? 'Clutch win' : g.win ? 'Win' : 'Loss'}</span></div>
    <div class="score num">${g.us}–${g.them}</div><div class="wp" title="How favored you were"><i style="width:${(g.p * 100).toFixed(1)}%"></i></div><div class="note">${gameNotes(g)}</div>`;
}
const tip = $('tip');
let tipFor = null; let tipByClick = false;
function showTip(el) { tip.innerHTML = el.dataset.tip; tip.style.opacity = 1; tipFor = el; const r = el.getBoundingClientRect(); const w = Math.min(280, innerWidth - 16); tip.style.maxWidth = w + 'px';
  const left = Math.max(8, Math.min(innerWidth - w - 8, r.left)); tip.style.left = left + 'px'; const th = tip.offsetHeight; tip.style.top = (r.top - th - 8 > 8 ? r.top - th - 8 : r.bottom + 8) + 'px'; }
function hideTip() { tip.style.opacity = 0; tipFor = null; }
document.addEventListener('mouseover', e => { const el = e.target.closest('[data-tip]'); if (el && matchMedia('(hover:hover)').matches && tipFor !== el && !tipByClick) { showTip(el); } });
document.addEventListener('mouseout', e => { const el = e.target.closest('[data-tip]'); if (el && el === tipFor && !tipByClick && !el.contains(e.relatedTarget)) hideTip(); });
document.addEventListener('click', e => { const el = e.target.closest('[data-tip]'); if (el) { e.stopPropagation(); e.preventDefault(); if (tipFor === el && tipByClick) { hideTip(); tipByClick = false; } else { showTip(el); tipByClick = true; } } else if (tipFor) { hideTip(); tipByClick = false; } }, true);
document.addEventListener('keydown', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); showTip(el); } if (e.key === 'Escape') hideTip(); });
document.addEventListener('scroll', () => tipFor && hideTip(), true);
$('seis').addEventListener('pointermove', e => {
  const r = e.target.closest('rect[data-g]'); if (!r || !PLAY.res) { tip.style.opacity = 0; return; }
  const g = PLAY.res.log[+r.dataset.g];
  tip.innerHTML = `<b>Game ${g.g}: ${g.home ? 'vs' : 'at'} ${g.opp.label}</b><br>${g.hero ? 'Clutch win' : g.win ? 'Won' : 'Lost'} ${g.us}–${g.them}<br>${favWords(g.p)} before tip-off${g.top ? `<br>Top scorer: ${g.top.name} (${g.top.pts})` : ''}${!g.win ? `<br>Why: ${lossWhy(g).join(', ')}` : ''}`;
  tip.style.opacity = 1; tip.style.left = Math.min(innerWidth - 280, e.clientX + 14) + 'px'; tip.style.top = (e.clientY + 14) + 'px';
});
$('seis').addEventListener('pointerleave', () => tip.style.opacity = 0);

// ---------- season results ----------

// ---------- league-wide stats: the best players on every other team count too ----------
const decOfSeason = s => `${Math.floor((s - 1) / 10) * 10}s`;
const jit = (x, s) => x * (1 + (Math.random() * 2 - 1) * s);
function teamStars(t, n) {
  if (!t || !t.fr) return [];
  const mine = new Set(PLAY.players.map(pid));
  const end = p => +p.season.slice(0, 4) + 1; // only players who were really on that team around that season
  return E.roster(t.fr, decOfSeason(t.season)).concat(E.roster(t.fr, decOfSeason(t.season + 2)), E.roster(t.fr, decOfSeason(t.season - 2)))
    .filter((p, i, arr) => arr.findIndex(q => q.id === p.id) === i && Math.abs(end(p) - t.season) <= 1 && !mine.has(pid(p))).sort((x, y) => y.ovr - x.ovr).slice(0, n || 2);
}
function starLine(p, games, bump) { // same per-game scale as your players' simulated numbers
  const d = E.derive(p); const f = Math.min(p.mpg, 38) / 48 * (bump || 1);
  return { gp: games, pts: jit(d.pts * f, .07), reb: jit(d.reb * f, .08), ast: jit(d.ast * f, .08), stl: jit(d.stl * f, .12), blk: jit(d.blk * f, .12), ts: p.ts + (Math.random() - .5) * .02, clutch: 0 };
}
const mvpScore = s => s.impact * (s.gp / 82) + s.pts * .75 + s.reb * .3 + s.ast * .5 + (s.stl + s.blk) * .6 + (s.ts - s.p.lgTS) * 25 + (s.clutch || 0) * .6 + (s.wins - 41) * .2;
const dpoyScore = s => (s.stl * 2.2 + s.blk * 2.4 + s.reb * .15 + s.p.def * .7 + (s.p.perks.includes('defender') ? 1.5 : 0)) * (s.gp / 82);
function leagueSeason(mine, myWins) {
  const W = [1.3, 1.1, 1.0, .9, .7]; const order = mine.slice().sort((x, y) => y.p.ovr - x.p.ovr);
  // same value-to-team estimate for everyone: rating above bench level, weighted by his rank on his team
  const all = mine.map(s => ({ ...s, mine: true, teamLabel: 'Your team', wins: myWins, impact: W[order.indexOf(s)] * (s.p.ovr - 60) / 5 * E.PER_POINT }));
  OPPS.forEach(o => teamStars(o, 2).forEach((p, i) => {
    const gp = Math.round(Math.min(82, 82 * E.avail(p) * (.9 + Math.random() * .12)));
    all.push({ p, ...starLine(p, gp), teamLabel: o.label, wins: o.w, mine: false, impact: (i ? 1.1 : 1.3) * (p.ovr - 60) / 5 * E.PER_POINT });
  }));
  all.forEach(s => { s.mvp = mvpScore(s); s.dpoy = dpoyScore(s); });
  return all;
}
function leadersHTML(all, title, minGp) {
  const pool = all.filter(s => s.gp >= (minGp || 1));
  const col = (k, label) => `<div class="lcol"><h5>${label}</h5>${pool.slice().sort((x, y) => y[k] - x[k]).slice(0, 5).map((s, i) => `<div class="lrow ${s.mine ? 'me' : ''}"><span>${i + 1}. ${s.p.name}<small>${s.mine ? 'Your team' : s.teamLabel}</small></span><b class="num">${s[k].toFixed(1)}</b></div>`).join('')}</div>`;
  return `<h3 class="sec-h" style="font-size:19px">${title}</h3><div class="leaders">${col('pts', 'Points')}${col('reb', 'Rebounds')}${col('ast', 'Assists')}</div>`;
}
// ---------- why a game was lost: varied, specific reasons ----------
function lossWhy(g) {
  const r = E.rng(g.g * 7919 + g.us * 31 + g.them); const pick = arr => arr[Math.floor(r() * arr.length)];
  const star = teamStars(g.opp, 1)[0]; const bits = [];
  if (g.out.length) bits.push(pick([`${g.out[0]} sat out`, `played without ${g.out[0]}`, `${g.out[0]} was injured`]));
  if (star && r() < .65) bits.push(pick([`${star.name} scored ${Math.round(28 + r() * 16)}`, `${star.name} took over late`, `couldn't stop ${star.name}`, `${star.name} had a big night`]));
  if (g.them - g.us <= 4) bits.push(pick([`lost a close one by ${g.them - g.us}`, 'missed a shot at the buzzer', 'fell short in overtime', 'a late turnover cost the game']));
  else if (g.noise < -12) bits.push(pick(['cold shooting night', 'went ice-cold from three', 'too many turnovers', 'the bench got outplayed', 'gave up 20 second-chance points']));
  if (g.opp.net >= 5 && r() < .7) bits.push(pick([`${g.opp.label} were one of the best teams around`, 'ran into a great team', 'a much stronger opponent than usual']));
  if (!g.home && bits.length < 3 && r() < .6) bits.push(pick(['on the road', 'a tough road game', 'second night of a back-to-back']));
  if (!bits.length) bits.push(pick(['just an off night', 'flat from the start', 'never found a rhythm', 'lost the battle on the boards']));
  return bits.slice(0, 3);
}

function statsFrom(lines) {
  const { players, lt } = PLAY; const full = lt.table[31].net;
  return lines.map((L, i) => {
    const gp = Math.max(1, L.gp); const p = players[i];
    const impact = full - lt.table[31 ^ (1 << i)].net; const value = lt.table[31].team - lt.table[31 ^ (1 << i)].team;
    const s = { value, p, slot: E.SLOTS[i], gp: L.gp, min: L.min / gp, pts: L.pts / gp, reb: L.reb / gp, ast: L.ast / gp, stl: L.stl / gp, blk: L.blk / gp, ts: L.tsa ? L.pts / (2 * L.tsa) : 0, impact, clutch: L.clutch, high: L.high };
    s.mvp = impact * (L.gp / 82) + s.pts * .75 + s.reb * .3 + s.ast * .5 + (s.stl + s.blk) * .6 + (s.ts - .55) * 25 + s.clutch * .6;
    s.dpoy = (s.stl * 2.2 + s.blk * 2.4 + s.reb * .15 + p.def * .7 + (p.perks.includes('defender') ? 1.5 : 0)) * (L.gp / 82);
    return s;
  });
}
function finish() {
  stopPlay(); $('pauseBtn').disabled = true; $('pauseBtn').textContent = 'Pause'; $('season').querySelector('.ctrl').classList.add('hidden');
  const { res, players, lt } = PLAY; const losses = res.log.filter(g => !g.win); const steals = res.log.filter(g => g.hero).length;
  $('ticker').innerHTML = losses.length === 0
    ? `<div class="row1"><span>Final record</span></div><div class="score" style="color:var(--win)">82–0. Perfect season.</div><div class="note">Not a single loss${steals ? `, with ${steals} buzzer-beater ${steals === 1 ? 'win' : 'wins'}` : ''}.</div>`
    : `<div class="row1"><span>Final record</span></div><div class="score num">${res.w}–${82 - res.w}</div><div class="note">First loss in game ${losses[0].g} ${losses[0].home ? 'vs' : 'at'} ${losses[0].opp.label}.${steals ? ` Clutch players stole ${steals} close ${steals === 1 ? 'game' : 'games'}.` : ''}</div>`;
  const st = statsFrom(res.lines); const lg = leagueSeason(st, res.w); PLAY.league = lg;
  drawAwards(lg); $('leaders').innerHTML = leadersHTML(lg, 'League leaders', 40);
  const lgMvp = lg.slice().sort((x, y) => y.mvp - x.mvp)[0];
  drawTable(st, 'statTable', lgMvp.mine ? 'MVP' : 'Team best');
  PLAY.histDone = false;
  const lazyHist = () => { if (PLAY.histDone) return; PLAY.histDone = true; const hist = E.monteCarlo(players, lt, 2000, OPPS);
  let cum = 0, med = 0; for (let w = 0; w <= 82; w++) { cum += hist[w]; if (cum >= 1000) { med = w; break; } }
  $('odds82').textContent = `${hist[82].toLocaleString()} of 2,000`; $('oddsMed').textContent = `${med}–${82 - med}`;
  drawHist(hist, res.w); };
  drawParts(lt.table[31]);
  if ($('statsBox').open) lazyHist(); else $('statsBox').addEventListener('toggle', function h() { if ($('statsBox').open) { lazyHist(); $('statsBox').removeEventListener('toggle', h); } });
  $('lossTitle').textContent = losses.length ? `Every loss (${losses.length})` : 'No losses at all';
  $('losses').innerHTML = losses.map(g => `<li><b>Game ${g.g}: ${g.us}–${g.them} ${g.home ? 'vs' : 'at'} ${g.opp.label}.</b> ${cap(lossWhy(g).join(', '))}.</li>`).join('');
  $('seasonCTA').innerHTML = `<div><div class="pmeta">Season over</div><div style="font-family:var(--display);font-weight:700;font-size:26px;letter-spacing:-.03em">${losses.length ? `${res.w}–${82 - res.w}` : '82–0. Perfect!'}</div><div class="pmeta">${res.w >= 42 ? 'You made the playoffs. Your stats are below.' : 'Under 42 wins: you missed the playoffs, but you can still watch them.'}</div></div><div class="ctabtns"><button class="btn ball cta" id="toPlayoffs">${res.w >= 42 ? 'Sim the playoffs' : 'See the playoffs'}</button><button class="btn" id="redraftSeason">New draft</button></div>`;
  $('toPlayoffs').onclick = startPlayoffs; $('redraftSeason').onclick = playAgain;
  $('season').classList.add('done'); $('seasonCTA').classList.remove('hidden'); $('seasonEnd').classList.remove('hidden'); STAGE = 'seasonDone'; stepbar(); $('scroller').scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
}
function voteBars(st, key) {
  const sorted = st.slice().sort((x, y) => y[key] - x[key]).slice(0, 5); const lo = sorted[sorted.length - 1][key]; const span = Math.max(.01, sorted[0][key] - lo * .8);
  return sorted.map((s, i) => `<div class="vote ${s.mine ? 'me' : ''}" style="grid-template-columns:minmax(0,12em) minmax(0,1fr)"><span>${i + 1}. ${s.p.name}<small>${s.mine ? 'Your team' : s.teamLabel}</small></span><span><i class="${i === 0 ? 'top' : ''}" style="width:${Math.max(6, (s[key] - lo * .8) / span * 100)}%"></i></span></div>`).join('');
}
function drawAwards(lg) {
  const mvp = lg.slice().sort((x, y) => y.mvp - x.mvp)[0]; const dp = lg.slice().sort((x, y) => y.dpoy - x.dpoy)[0];
  const who = s => s.mine ? `Your team · the ${s.p.season} version` : `${s.teamLabel} (${s.wins}–${82 - s.wins})`;
  $('awardCards').innerHTML = `
  <div class="award"><div class="pmeta">Most valuable player · whole league</div><div class="who">${mvp.p.name}</div>
    <div class="line">${mvp.pts.toFixed(1)} points · ${mvp.reb.toFixed(1)} rebounds · ${mvp.ast.toFixed(1)} assists</div>
    <div class="pmeta" style="margin-bottom:10px">${who(mvp)} · ${mvp.gp} games</div>
    ${voteBars(lg, 'mvp')}</div>
  <div class="award"><div class="pmeta">Defensive player of the year</div><div class="who" style="font-size:clamp(26px,4vw,34px)">${dp.p.name}</div>
    <div class="line">${dp.stl.toFixed(1)} steals · ${dp.blk.toFixed(1)} blocks · ${dp.reb.toFixed(1)} rebounds</div>
    <div class="pmeta" style="margin-bottom:10px">${who(dp)}</div>${voteBars(lg, 'dpoy')}</div>`;
}
function drawTable(st, target, crown) {
  const best = st.slice().sort((a, b) => b.mvp - a.mvp)[0];
  const rows = st.slice().sort((a, b) => b.mvp - a.mvp).map(s => `<tr><td><b>${s.p.name}</b>${s === best ? `<span class="crown">${crown}</span>` : ''}<br><span class="pmeta">${s.slot} · ${s.p.season}</span> ${s.p.perks.map(perkPill).join('')}</td>
    <td>${s.gp}</td><td>${s.min.toFixed(0)}</td><td class="pts">${s.pts.toFixed(1)}</td><td>${s.reb.toFixed(1)}</td><td>${s.ast.toFixed(1)}</td><td>${s.stl.toFixed(1)}</td><td>${s.blk.toFixed(1)}</td><td>${gradeHTML(shootGrade(s.ts, s.p.lgTS))}</td>
    <td style="color:${s.value >= 0 ? 'var(--win)' : 'var(--loss)'};font-weight:700">${signed(s.value)}</td><td>${s.clutch || '—'}</td></tr>`).join('');
  $(target).innerHTML = `<thead><tr><th>Player</th><th>Games</th><th>Min</th><th>Pts</th><th>Reb</th><th>Ast</th><th>Stl</th><th>Blk</th><th>Shooting</th><th>Value</th><th>Buzzer-beaters</th></tr></thead><tbody>${rows}</tbody>`;
}
function drawHist(hist, thisW) {
  let lo = hist.findIndex(c => c > 0); lo = Math.max(0, Math.min(lo, 82 - 24)); const max = Math.max(...hist);
  const n = 83 - lo, bw = 500 / n; let h = '';
  for (let w = lo; w <= 82; w++) {
    const bh = hist[w] / max * 150; const x = 10 + (w - lo) * bw;
    const col = w === 82 ? 'var(--accent)' : w === thisW ? 'var(--ink)' : 'var(--line)';
    h += `<rect x="${x + .5}" y="${160 - bh}" width="${Math.max(1, bw - 1.5)}" height="${bh}" rx="1.5" fill="${col}"><title>${w}–${82 - w}: happened ${hist[w]} times</title></rect>`;
    if (w % 5 === 2 || w === 82) h += `<text x="${x + bw / 2}" y="178" text-anchor="middle" font-size="11" fill="var(--muted)">${w}</text>`;
  }
  h += `<text x="10" y="12" font-size="12" fill="var(--muted)">Wins per season · dark = your season · orange = 82–0</text>`;
  $('hist').innerHTML = h;
}
function drawParts(rt) {
  const P = rt.parts; const line = (l, v, strong) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid var(--line)${strong ? ';font-weight:700' : ''}"><span>${l}</span><span class="num">${v}</span></div>`;
  let h = line('Your five (best player counts most)', rtg(P.players));
  h += line('Too many ball-dominant scorers', signed(P.ball)) + line('Shooting', signed(P.shooting)) + line('Big man', signed(P.size)) + line('Spacing: 3+ shooters', signed(P.spacingB)) + line('Passer', signed(P.passer)) + line('Rim protector', signed(P.rimP)) + line('Teammates (same team and decade)', signed(P.mates));
  rt.perkList.forEach(x => { h += line(`${x.name}: ${x.player}`, signed(x.val)); });
  h += line('Team rating', rtg(rt.team), true);
  $('parts').innerHTML = h;
  $('netLine').textContent = `About 85 is an average NBA team. Each point above that adds about 2 points to your average winning margin.`;
  const mo = rt.moments; $('perkLine').textContent = mo.clutch.length ? `Clutch players ready to steal close games: ${mo.clutch.join(', ')}.` : '';
}

// ---------- playoffs ----------
let PO = null;
function stopPO() { if (PO) clearTimeout(PO.timer); }
const tName = t => t.me ? 'Your team' : t.label;
function startPlayoffs() {
  stopPO();
  const { players, lt, res } = PLAY;
  const table = E.standings(OPPS, res.w, Math.floor(Math.random() * 1e9));
  const po = E.playoffs(players, lt, table, Math.floor(Math.random() * 1e9), true);
  const me = table.find(t => t.me); const events = [];
  po.rounds.forEach((rd, ri) => { rd.series.forEach((s, si) => { if (s.mine) s.games.forEach((g, gi) => events.push({ ri, si, gi })); }); events.push({ ri, end: true }); });
  PO = { po, table, me, events, i: 0, cur: 0, shown: {}, done: {}, speed: PO ? PO.speed : 220, timer: null };
  STAGE = 'playoffs';
  showView('playoffs'); $('playoffs').classList.remove('done', 'showbr'); $('poSeg').classList.remove('hidden'); $('poEnd').classList.add('hidden'); $('poTop').classList.add('hidden'); $('poBanner').innerHTML = '';
  $('poSub').textContent = me.rank <= 16 ? `You're the number ${me.rank} seed after going ${res.w}–${82 - res.w}. Every round is best of seven.` : `You went ${res.w}–${82 - res.w}. You need 42 wins to make the playoffs.`;
  $('poTicker').innerHTML = po.outcome === 'missed' ? '<div class="row1"><span>Missed the playoffs</span></div><div class="score">Not this year</div><div class="note">The bracket still plays out without you.</div>' : '<div class="row1"><span>First round about to start…</span></div>';
  drawBracket(); stepbar('First round');
  PO.timer = setTimeout(poStep, 600);
}
$('bracketToggle').onclick = () => { const on = $('playoffs').classList.toggle('showbr'); $('bracketToggle').textContent = on ? 'Hide full bracket' : 'Show full bracket'; };
function skipPO() { if (!PO || PO.i >= PO.events.length) return; stopPO(); while (PO.i < PO.events.length) applyEvent(PO.events[PO.i++]); drawBracket(); poFinish(); }
function poStep() {
  if (!PO) return;
  if (PO.speed === 0 || reduce) { skipPO(); return; }
  if (PO.i >= PO.events.length) { poFinish(); return; }
  const ev = PO.events[PO.i++]; applyEvent(ev); drawBracket();
  stepbar(PO.po.rounds[Math.min(3, PO.cur)] ? PO.po.rounds[Math.min(3, PO.cur)].name : '');
  PO.timer = setTimeout(poStep, ev.end ? PO.speed * 2.2 : PO.speed * (PO.po.rounds[ev.ri].series[ev.si].games[ev.gi].win ? 1 : 2));
}
function applyEvent(ev) {
  PO.cur = ev.ri;
  if (ev.end) { PO.done[ev.ri] = true; PO.cur = ev.ri + 1; return; }
  const s = PO.po.rounds[ev.ri].series[ev.si]; PO.shown[ev.ri] = ev.gi + 1;
  const g = s.games[ev.gi];
  const status = g.sw === 4 ? `You win the series ${g.sw}–${g.sl}` : g.sl === 4 ? `Knocked out ${g.sw}–${g.sl}` : g.sw === g.sl ? `Series tied ${g.sw}–${g.sl}` : g.sw > g.sl ? `You lead ${g.sw}–${g.sl}` : `You trail ${g.sw}–${g.sl}`;
  $('poTicker').innerHTML = gameCard(g, g.round + ' · ').replace('</div>\n    <div class="score num">', `</div>\n    <div class="score num">`).replace(/<div class="score num">([^<]*)<\/div>/, `<div class="score num">$1 <span class="note" style="display:inline;font-family:var(--body);font-size:15px;font-weight:600;letter-spacing:0">${status}</span></div>`);
}
function seriesCard(s, ri) {
  const started = ri <= PO.cur || PO.done[ri];
  if (!started) return `<div class="series pending"><div class="srow"><span class="sd"></span><span class="nm pmeta">To be decided</span><span></span></div><div class="srow"><span class="sd"></span><span class="nm pmeta">&nbsp;</span><span></span></div></div>`;
  const final = PO.done[ri]; let wa = s.wa, wb = s.wb, games = s.games;
  if (!final) { if (s.mine) { const n = PO.shown[ri] || 0; games = s.games.slice(0, n); const last = games[n - 1]; if (last) { wa = s.a.me ? last.sw : last.sl; wb = s.a.me ? last.sl : last.sw; } else wa = wb = 0; } else wa = wb = null; }
  const row = (t, w, isW) => `<div class="srow ${final ? (isW ? 'w' : 'l') : ''} ${t.me ? 'me' : ''}"><span class="sd">${t.seed}</span><span class="nm" title="${tName(t)}">${tName(t)}</span><span class="wn num">${w == null ? '' : w}</span></div>`;
  const dots = s.mine ? `<div class="dots" style="min-height:11px">${games.map(g => `<i style="background:${g.win ? 'var(--win)' : 'var(--loss)'}" title="Game ${g.gameNo}: ${g.win ? 'won' : 'lost'} ${g.us}–${g.them}"></i>`).join('')}</div>` : '';
  return `<div class="series ${s.mine ? 'mine' : ''}">${row(s.a, wa, s.winner === s.a)}${row(s.b, wb, s.winner === s.b)}${dots}</div>`;
}
function drawBracket() {
  const names = ['First round', 'Second round', 'Conference finals', 'Finals']; let h = '';
  for (let ri = 0; ri < 4; ri++) h += `<div class="bcol"><h4>${names[ri]}</h4><div class="bstack">${PO.po.rounds[ri].series.map(s => seriesCard(s, ri)).join('')}</div></div>`;
  const allDone = PO.done[3]; const c = PO.po.champ;
  h += `<div class="bcol"><h4>Champion</h4><div class="bstack"><div class="champ ${allDone && c.me ? 'me' : ''}">${allDone ? `<span class="t">${tName(c)}</span><span class="pmeta">${c.me ? 'That’s you!' : `Seed ${c.seed}`}</span>` : '<span class="pmeta">Still to play</span>'}</div></div></div>`;
  $('bracket').innerHTML = h;
  drawRun();
}
function drawRun() {
  const names = ['First round', 'Second round', 'Conference finals', 'Finals']; let h = ''; let out = false;
  for (let ri = 0; ri < 4; ri++) {
    const s = PO.po.rounds[ri].series.find(x => x.mine);
    const reached = s && (ri <= PO.cur || PO.done[ri]);
    if (!s || out) { if (!out && PO.po.outcome !== 'missed') h += `<div class="runrow wait"><span class="rn">${names[ri]}</span><span class="pmeta">Waiting</span></div>`; continue; }
    if (!reached) { h += `<div class="runrow wait"><span class="rn">${names[ri]}</span><span class="pmeta">Waiting</span></div>`; continue; }
    const opp = s.a.me ? s.b : s.a; const n = PO.done[ri] ? s.games.length : (PO.shown[ri] || 0); const games = s.games.slice(0, n); const last = games[n - 1];
    const sw = last ? last.sw : 0, sl = last ? last.sl : 0; const fin = sw === 4 || sl === 4;
    const status = fin ? (sw === 4 ? `Won ${sw}–${sl}` : `Lost ${sw}–${sl}`) : n ? (sw > sl ? `Lead ${sw}–${sl}` : sw < sl ? `Trail ${sw}–${sl}` : `Tied ${sw}–${sl}`) : 'Starting';
    h += `<div class="runrow ${fin ? (sw === 4 ? 'won' : 'lost') : 'live'}"><span class="rn">${names[ri]}</span><span class="ro"><b>${opp.label}</b><small>Seed ${opp.seed}</small></span><span class="rs">${status}<span class="dots">${games.map(g => `<i style="background:${g.win ? 'var(--win)' : 'var(--loss)'}"></i>`).join('')}</span></span></div>`;
    if (fin && sl === 4) out = true;
  }
  if (PO.po.outcome === 'missed') h = '<div class="runrow wait"><span class="rn">Missed the playoffs</span><span class="pmeta">You needed 42 wins.</span></div>';
  $('poRun').innerHTML = h;
}
function poFinish() {
  const { po } = PO; const res = PLAY.res; let banner = '';
  if (po.outcome === 'champion') {
    const lost = po.myGames.filter(g => !g.win).length; const perfect = res.w === 82 && lost === 0;
    PO.headline = perfect ? '98–0. A perfect year!' : 'Champions!';
    banner = `<div class="banner win">${perfect ? '98–0. Perfect.' : 'Champions.'}</div><p class="hint">${perfect ? 'Unbeaten in the regular season and 16–0 in the playoffs.' : `You won the title, going ${po.myGames.length - lost}–${lost} in the playoffs.`}</p>`;
  } else if (po.outcome === 'missed') { PO.headline = 'Missed the playoffs'; banner = `<div class="banner">Missed the playoffs.</div><p class="hint">${tName(po.champ)} won the title.</p>`; }
  else { const o = po.outcome; const rn = { 'Semifinals': 'conference finals' }[o.lostIn] || o.lostIn.toLowerCase(); PO.headline = `Out in the ${rn}`; banner = `<div class="banner">Out in the ${rn}.</div><p class="hint">Lost ${o.wins}–${o.losses} to ${tName(o.to)}. ${tName(po.champ)} went on to win it all.</p>`; }
  $('poBanner').innerHTML = banner;
  drawScoreCard(); saveClassicRun();
  STAGE = 'done'; stepbar(); $('poSeg').classList.add('hidden'); $('playoffs').classList.add('done');
  $('poTop').classList.remove('hidden'); $('poEnd').classList.remove('hidden'); $('scroller').scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  if (po.outcome === 'missed') return;
  const box = document.querySelector('#poEnd details'); let oddsDone = false;
  const lazyOdds = () => { if (oddsDone) return; oddsDone = true; const odds = E.titleOdds(PLAY.players, PLAY.lt, PO.table, 1000); $('oddTitle').textContent = `${Math.round(odds.title * 1000).toLocaleString()} of 1,000`; $('oddSweep').textContent = `${Math.round(odds.perfect * 1000).toLocaleString()} of 1,000`; };
  $('oddTitle').textContent = '…'; $('oddSweep').textContent = '…';
  if (box.open) lazyOdds(); else box.addEventListener('toggle', function h() { if (box.open) { lazyOdds(); box.removeEventListener('toggle', h); } });
  // everyone in the playoffs: your players plus the two best players of every other playoff team
  const games = {}; po.rounds.forEach(rd => rd.series.forEach(s => { [s.a, s.b].forEach(t => { games[t.label] = (games[t.label] || 0) + s.wa + s.wb; }); }));
  const mineP = statsFrom(po.lines).filter(s => s.gp > 0).map(s => ({ ...s, mine: true, teamLabel: 'Your team' }));
  const others = []; po.field.filter(t => !t.me).forEach(t => teamStars(t, 2).forEach(p => others.push({ p, ...starLine(p, games[t.label] || 4, 1.06), teamLabel: t.label, mine: false })));
  $('poLeaders').innerHTML = leadersHTML(mineP.concat(others), 'Playoff leaders', 4);
  const finalsScore = s => s.pts + s.reb * .4 + s.ast * .6 + (s.stl + s.blk) * .8 + (s.clutch || 0);
  let m, useFinals = true;
  if (po.champ.me) { const fl = statsFrom(po.finalsLines).filter(s => s.gp > 0); m = fl.sort((x, y) => finalsScore(y) - finalsScore(x))[0]; if (m) { m.teamLabel = 'Your team'; m.mine = true; } }
  else { const fin = po.rounds[3].series[0]; const n = fin.wa + fin.wb; m = teamStars(po.champ, 2).map(p => ({ p, ...starLine(p, n, 1.08), teamLabel: po.champ.label })).sort((x, y) => finalsScore(y) - finalsScore(x))[0]; }
  $('fmvp').innerHTML = m ? `<div class="award"><div class="pmeta">Finals MVP</div><div class="who">${m.p.name}</div><div class="pmeta">${m.mine ? 'Your team' : m.teamLabel}</div><div class="line">${m.pts.toFixed(1)} points · ${m.reb.toFixed(1)} rebounds · ${m.ast.toFixed(1)} assists</div><div class="pmeta">${m.gp} Finals games${m.high ? ` · best game ${m.high} points` : ''}</div></div>` : '';
  drawTable(statsFrom(po.lines).filter(s => s.gp > 0), 'poTable', 'Playoff MVP');
}
document.querySelectorAll('#poSeg button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#poSeg button').forEach(x => x.setAttribute('aria-pressed', x === b));
  if (!PO) return; PO.speed = +b.dataset.speed; if (PO.speed === 0 && STAGE === 'playoffs') skipPO();
});


// ---------- season score + tiers ----------
const TIERS = [
  { id: 'lottery', name: 'Lottery', min: 0, color: '#94A3B8', note: 'Missed the playoffs or went out early.' },
  { id: 'playoff', name: 'Playoff team', min: 600, color: '#2563EB', note: 'A good season with a playoff run.' },
  { id: 'contender', name: 'Contender', min: 1100, color: '#7C3AED', note: 'Went deep in the playoffs.' },
  { id: 'champion', name: 'Champion', min: 1400, color: '#E3A008', note: 'Won the title.', title: true },
  { id: 'dynasty', name: 'Dynasty', min: 1650, color: '#FF5A1F', note: 'A dominant title run.', title: true },
  { id: 'perfect', name: 'Perfect', min: Infinity, color: '#12151B', note: '82–0 and 16–0.', title: true },
];
function seasonScore() {
  const res = PLAY.res, po = PO.po; const team = PLAY.lt.table[31].team;
  const poW = po.myGames.filter(g => g.win).length, poL = po.myGames.length - poW;
  const title = po.outcome === 'champion', perfectRS = res.w === 82, perfectPO = title && poL === 0;
  const lines = [[`Regular season wins: ${res.w} × 10`, res.w * 10], [`Playoff wins: ${poW} × 25`, poW * 25]];
  if (title) lines.push(['Won the title', 300]);
  if (perfectRS) lines.push(['Perfect 82–0 season', 500]);
  if (perfectPO) lines.push(['Perfect 16–0 playoffs', 300]);
  const base = lines.reduce((s, l) => s + l[1], 0);
  const mult = Math.max(.8, Math.min(1.3, 1 + (96 - team) * .02));
  const total = Math.round(base * mult / 10) * 10;
  let tier = TIERS[0];
  if (perfectRS && perfectPO) tier = TIERS[5];
  else for (const t of TIERS.slice(0, 5)) if (total >= t.min && (!t.title || title)) tier = t;
  if (!title && tier.min >= 1400) tier = TIERS[2];
  if (title && tier.min < 1400) tier = TIERS[3]; // winning the title is always at least Champion
  return { lines, base, mult, team, total, tier };
}
function saveClassicRun() {
  const sc = PO.score; const res = PLAY.res; const lost = PO.po.myGames.filter(g => !g.win).length;
  const run = { at: Date.now(), score: sc.total, tier: sc.tier.name, color: sc.tier.color, w: res.w, poW: PO.po.myGames.length - lost, poL: lost,
    result: PO.headline, team: Math.round(PLAY.lt.table[31].team), five: E.SLOTS.map(s => { const p = S.picks[s]; return { slot: s, name: p.name, season: p.season, ovr: p.ovr, team: E.teamName(p.team, p.decade) }; }) };
  const c = store.get('ball-classic', { runs: [], n: 0, total: 0, best: 0, titles: 0, perfect: 0, bestW: 0 });
  c.runs = [run].concat(c.runs).slice(0, 10); c.n++; c.total += run.score; c.best = Math.max(c.best, run.score);
  if (PO.po.outcome === 'champion') c.titles++; if (res.w === 82) c.perfect++; c.bestW = Math.max(c.bestW, res.w);
  store.set('ball-classic', c);
}
function drawScoreCard() {
  const sc = seasonScore(); PO.score = sc;
  let prev = null, isNew = false;
  try { prev = JSON.parse(localStorage.getItem('ball-best') || 'null'); isNew = !prev || sc.total > prev.total; if (isNew) localStorage.setItem('ball-best', JSON.stringify({ total: sc.total, tier: sc.tier.name })); } catch (e) { prev = null; isNew = false; }
  const bestTxt = isNew && prev ? `New personal best! Previous best: ${prev.total.toLocaleString()} (${prev.tier}).` : isNew ? 'Saved as your personal best.' : prev ? `Your best: ${prev.total.toLocaleString()} (${prev.tier}).` : '';
  const multTxt = sc.mult === 1 ? 'Difficulty: × 1.00' : sc.mult > 1 ? `Underdog bonus (team rating ${rtg(sc.team)}): × ${sc.mult.toFixed(2)}` : `Superteam discount (team rating ${rtg(sc.team)}): × ${sc.mult.toFixed(2)}`;
  const row = (l, v, strong) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid var(--line)${strong ? ';font-weight:700' : ''}"><span>${l}</span><span class="num">${v}</span></div>`;
  $('scoreCard').innerHTML = `<div class="scorecard" style="--tc:${sc.tier.color}">
    <div class="sc-top"><div><div class="pmeta">Season score</div><div class="sc-num num">${sc.total.toLocaleString()}</div>
      <span class="tierpill">${sc.tier.name}</span> <span class="pmeta">${sc.tier.note}</span>
      ${bestTxt ? `<div class="pmeta" style="margin-top:6px">${bestTxt}</div>` : ''}</div>
      <div class="ladder">${TIERS.slice().reverse().map(t => `<span class="${t.id === sc.tier.id ? 'on' : ''}" style="--c:${t.color}">${t.name}<small>${t.id === 'perfect' ? '98–0' : (t.min ? t.min.toLocaleString() + '+' : '') + (t.title ? ' · title' : '')}</small></span>`).join('')}</div></div>
    <div style="margin-top:10px;font-size:14px">${sc.lines.map(l => row(l[0], '+' + l[1])).join('')}${row(multTxt, '')}${row('Season score', sc.total.toLocaleString(), true)}</div>
  </div>`;
}

// =================== phone draft: court first, roster in a slide-up sheet (modeled on 82-0) ===================
const MCELL = 52;
const mTeamCell = (t, decId) => `${t.id}<small>${splitName(E.teamName(t.id, decId || randOf(Object.keys(t.names))))[1] || ''}</small>`;
const mDecCell = d => `${d.id.slice(2, 4)}’s<small>${d.id}</small>`;
const GROUPS = { all: () => true, G: p => p.pos.some(s => s === 'PG' || s === 'SG'), F: p => p.pos.some(s => s === 'SF' || s === 'PF'), C: p => p.pos.includes('C') };
S.mGroup = 'all';
function mCourt() {
  const sel = S.sel; const can = sel ? sel.pos.filter(s => !S.picks[s]) : [];
  const floor = `<rect width="500" height="420" fill="var(--court)"/>` + Array.from({ length: 12 }, (_, i) => `<rect x="${i * 44}" y="0" width="22" height="420" fill="var(--court-2)"/>`).join('');
  let h = `${floor}<g fill="none" stroke="var(--court-line)" stroke-width="2.5"><rect x="190" y="232" width="120" height="186" fill="var(--accent)" fill-opacity=".18"/><circle cx="250" cy="232" r="60"/><path d="M30 418 L30 322 A228 228 0 0 1 470 322 L470 418"/><path d="M210 380 A40 40 0 0 0 290 380"/><line x1="0" y1="2" x2="500" y2="2"/><path d="M190 2 A60 60 0 0 0 310 2"/></g><circle cx="250" cy="382" r="9" fill="none" stroke="var(--accent)" stroke-width="3"/>`;
  E.SLOTS.forEach(s => {
    const [x, y] = SLOT_XY[s]; const p = S.picks[s];
    if (p) {
      const t = teamOf(p.team); const last = p.name.split(' ').slice(1).join(' ') || p.name;
      h += `<g class="${S.popSlot === s ? 'mpop' : ''}" style="transform-origin:${x}px ${y}px" opacity="${sel ? .45 : 1}"><circle cx="${x}" cy="${y}" r="34" fill="${t.c1}" stroke="var(--surface)" stroke-width="3"/><text class="token-ini" x="${x}" y="${y + 7}" text-anchor="middle">${ini(p.name)}</text>
        <rect x="${x + 14}" y="${y - 40}" width="34" height="22" rx="7" fill="${ovrCol(p.ovr)}"/><text x="${x + 31}" y="${y - 24}" text-anchor="middle" style="font-family:var(--display);font-weight:700;font-size:13px;fill:#fff">${p.ovr}</text>
        ${(() => { const w = (s.length + last.length + 3) * 8.6 + 16; const lx = Math.min(496 - w / 2, Math.max(4 + w / 2, x)); return `<rect x="${lx - w / 2}" y="${y + 40}" width="${w}" height="24" rx="12" fill="var(--surface)" opacity=".92"/><text x="${lx}" y="${y + 57}" text-anchor="middle" class="mlabel">${s} · ${esc(last)}</text>`; })()}</g>`;
    } else if (can.includes(s)) {
      h += `<g class="mslot-go" data-mslot="${s}" style="cursor:pointer"><circle cx="${x}" cy="${y}" r="38" fill="var(--accent)" stroke="#fff" stroke-width="3" stroke-dasharray="6 5"/><text x="${x}" y="${y + 12}" text-anchor="middle" style="font-family:var(--display);font-weight:800;font-size:34px;fill:#fff">+</text><text x="${x}" y="${y + 58}" text-anchor="middle" class="mlabel" style="fill:var(--accent)">${s}</text></g>`;
    } else {
      h += `<g opacity="${sel ? .35 : .9}"><circle cx="${x}" cy="${y}" r="32" fill="rgba(255,255,255,.18)" stroke="var(--court-line)" stroke-width="2" stroke-dasharray="5 6"/><text x="${x}" y="${y + 7}" text-anchor="middle" style="font-family:var(--display);font-weight:700;font-size:18px;fill:var(--court-line)">${s}</text></g>`;
    }
  });
  $('mCourt').innerHTML = h; S.popSlot = null;
}
$('mCourt').addEventListener('click', e => { const g = e.target.closest('[data-mslot]'); if (g && S.sel) commit(S.sel, g.dataset.mslot); });
function mRow(p, i) {
  const ok = canTake(p); const why = ok ? '' : havePid(p) ? 'On your team' : 'Spot filled';
  const chips = ok ? `${p.perks[0] ? perkPill(p.perks[0]) : ''}${roleTags(p)}${chemChip(p)}` : '';
  return `<button style="--i:${i || 0}" class="mrow ${ok ? '' : 'off'}" data-id="${p.id}" ${ok ? '' : 'aria-disabled="true"'}>
    ${ovrBadge(p)}
    <span class="mname"><b>${asStar(p)}${p.name}</b><small>${why || p.pos.join(' · ')}</small></span>
    <span class="mstats num"><span><small>PTS</small>${p.pts}</span><span><small>REB</small>${p.reb}</span><span><small>AST</small>${p.ast}</span><span class="${p.defEst ? 'est' : ''}"><small>STL</small>${p.stl}</span><span class="${p.defEst ? 'est' : ''}"><small>BLK</small>${p.blk}</span></span>
    ${chips ? `<span class="mchips">${chips}</span>` : ''}
  </button>`;
}
function mRender(state) {
  const rnd = Math.min(5, S.rounds.length + 1), full = draftDone();
  $('mRoundTxt').textContent = full ? 'Team complete' : `Round ${rnd} / 5`;
  $('mDash').innerHTML = Array.from({ length: 5 }, (_, i) => `<i class="${i < S.rounds.length ? 'done' : i === S.rounds.length && !full ? 'on' : ''}"></i>`).join('');
  const t = nPicked() ? teamNumbers() : null;
  $('mRating').innerHTML = `<small>Team</small><b>${t ? rtg(t.rating) : '—'}</b>`;
  const pick = state === 'pick';
  $('mSkipTeam').disabled = !pick || S.skips.team < 1; $('mSkipEra').disabled = !pick || S.skips.era < 1;
  $('mSkipTeam').innerHTML = `↻ New <i>${S.skips.team}</i>`; $('mSkipEra').innerHTML = `↻ New <i>${S.skips.era}</i>`;
  $('mSkipTeam').classList.toggle('invisible', !pick); $('mSkipEra').classList.toggle('invisible', !pick);
  let bottom = '';
  if (state === 'spin') bottom = `<button class="btn ball mbig" id="mSpin">Spin</button>`;
  else if (state === 'spinning') bottom = `<button class="btn ball mbig" disabled>Spinning…</button>`;
  else if (state === 'ready' && MODE === 'challenge' && CH) bottom = chReadyMobile();
  else if (state === 'ready') { const w = Math.round(t.wins); bottom = `<div class="mready"><div><small>Team rating</small><b>${rtg(t.rating)}</b></div><div><small>Projected</small><b>${w}–${82 - w}</b></div><button class="btn mghost" id="mDetails">Details</button></div><button class="btn ball mbig" id="mPlay">Play the season</button><button class="btn mghost mredraft" id="mRedraft">Not happy? Start a new draft</button>`; }
  if ($('mBottom').__html !== bottom) { $('mBottom').innerHTML = bottom; $('mBottom').__html = bottom; }
  if ($('mSpin')) $('mSpin').onclick = () => spin('both');
  if ($('mPlay')) $('mPlay').onclick = startSeason;
  if ($('mRedraft')) $('mRedraft').onclick = playAgain;
  if ($('mDetails')) $('mDetails').onclick = openSheet;
  if (S.sel) {
    const can = S.sel.pos.filter(s => !S.picks[s]);
    $('mPlacing').innerHTML = `<div style="min-width:0;flex:1"><div><b>${S.sel.name}</b> ${ovrBadge(S.sel)}</div><small>Tap a glowing spot: ${can.join(' or ')}</small><div>${S.sel.perks.map(perkPill).join('')}${chemChip(S.sel)}</div>${chemDelta(S.sel).why.length ? `<div class="pmeta" style="font-size:11.5px;margin-top:3px">Chemistry: ${chemDelta(S.sel).why.join(', ')}</div>` : ''}</div><button class="btn mghost" id="mCancel">Back</button>`;
    $('mCancel').onclick = () => { S.sel = null; mRender('pick'); mCourt(); };
  }
  $('mPlacing').classList.toggle('hidden', !S.sel);
  $('mSheet').dataset.state = pick && !S.reveal ? (S.sel ? 'docked' : 'open') : 'closed';
  $('mdraft').classList.toggle('revealing', !!(pick && S.reveal));
  if (pick && !S.sheetTopSet) { S.sheetTopSet = true; requestAnimationFrame(() => { const rr = document.querySelector('.mreels'); if (rr && rr.offsetParent) $('mSheet').style.top = (rr.offsetTop + rr.offsetHeight + 8) + 'px'; }); }
  if (pick) {
    const { team, dec } = S.spin;
    $('mSheetTitle').innerHTML = `<span class="dot2" style="background:${team.c1};box-shadow:0 0 0 2px ${team.c2}"></span>${E.teamName(team.id, dec.id)} · ${dec.id}`;
    $('mSheetHint').textContent = S.sel ? 'Show list ⌃' : 'Pick one';
    let ro = E.roster(team.id, dec.id).filter(GROUPS[S.mGroup]);
    ro.sort((x, y) => (canTake(y) - canTake(x)) || (SORTS[S.sort](y) - SORTS[S.sort](x)));
    const key = [team.id, dec.id, S.mGroup, S.sort, Object.values(S.picks).map(p => p.id).join(','), !!S.enterAnim].join('|');
    if ($('mList').__key !== key) { $('mList').__key = key; $('mList').classList.toggle('enter', !!S.enterAnim);
      $('mList').innerHTML = ro.length ? ro.map((p, i) => mRow(p, i)).join('') : '<div class="empty">Nobody at that position here.</div>'; }
  }
}
$('mList').addEventListener('click', e => {
  const r = e.target.closest('.mrow'); if (!r || r.classList.contains('off')) return;
  S.sel = POOL.find(x => x.id === r.dataset.id); mRender('pick'); mCourt();
});
$('mSheetHandle').onclick = () => { if (S.sel) { S.sel = null; mRender('pick'); mCourt(); } };
$('mGroups').addEventListener('click', e => { const b = e.target.closest('[data-g]'); if (!b) return; S.mGroup = b.dataset.g; document.querySelectorAll('#mGroups [data-g]').forEach(x => x.setAttribute('aria-pressed', x === b)); mRender('pick'); });
$('mSort').onchange = e => { S.sort = e.target.value; mRender('pick'); };
$('mSkipTeam').onclick = () => { S.skips.team--; spin('team'); };
$('mSkipEra').onclick = () => { S.skips.era--; spin('era'); };
$('mRating').onclick = () => { if (nPicked()) openSheet(); };

// =================== CHALLENGE MODE (link-only: everything travels in the URL) ===================
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable: still playable */ } },
};
const PCOLORS = ['#FF5A1F', '#2563EB', '#16A34A', '#7C3AED', '#DB2777', '#0891B2', '#E3A008'];
const uid = n => Array.from({ length: n || 8 }, () => 'abcdefghijkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 32)]).join('');
const getProfile = () => store.get('ball-profile', null);
const chHistory = () => store.get('ball-challenges', []);
const saveHistory = h => store.set('ball-challenges', h.slice(0, 200));
const upsert = rec => { const h = chHistory().filter(x => x.id !== rec.id); h.unshift(rec); saveHistory(h); };
const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const b64e = o => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64d = s => { try { s = s.replace(/-/g, '+').replace(/_/g, '/'); return JSON.parse(decodeURIComponent(escape(atob(s)))); } catch (e) { return null; } };
// links point at whatever site the game is running on
const SITE = location.origin + '/';
const linkFor = (kind, o) => `${SITE}#${kind}=${b64e(o)}`;
const byId = id => POOL.find(p => p.id === id);
const avatar = (p, size) => `<span class="pav" style="background:${p.color || '#FF5A1F'};width:${size || 34}px;height:${size || 34}px;font-size:${(size || 34) * .42}px">${esc((p.name || '?')[0]).toUpperCase()}</span>`;
let MODE = 'classic'; let CH = null; let CHT = null; // active challenge, playback timer

function setMode(m) { MODE = m; document.body.dataset.mode = m; }
function chScreen(html) { stopCH(); $('chBody').innerHTML = html; showView('challenge'); if (typeof drawNav === 'function') drawNav(); }
function stopCH() { if (CHT) clearTimeout(CHT); CHT = null; }


// ---------- online sync (works when the site runs with its /api server; otherwise links still work) ----------
const API = {
  ok: null,
  async up() {
    if (this.ok !== null) return this.ok;
    if (!/^https?:$/.test(location.protocol) || /claude\.ai|claudeusercontent/.test(location.hostname)) return (this.ok = false);
    try { const r = await fetch('/api/ping', { cache: 'no-store' }); this.ok = r.ok && (await r.json()).ok === true; } catch (e) { this.ok = false; }
    return this.ok;
  },
  async call(path, body) {
    if (!(await this.up())) return null;
    try { const r = await fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' }); return await r.json(); } catch (e) { return null; }
  },
};
const sideOf = s => s && { pid: s.pid, name: s.name, color: s.color, team: s.team, tr: s.tr };
function toast(html, onTap) {
  const t = $('toast'); t.innerHTML = html; t.classList.add('on'); t.onclick = () => { t.classList.remove('on'); onTap && onTap(); };
  clearTimeout(toast.tm); toast.tm = setTimeout(() => t.classList.remove('on'), 9000);
}
let syncing = false;
async function syncAll() {
  const pr = getProfile(); if (!pr || syncing) return; syncing = true;
  try {
    const res = await API.call(`/api/mine?pid=${pr.pid}`); if (!res || !res.ok) return;
    const local = chHistory(); const news = [];
    for (const r of res.recs) {
      const mine = r.a.pid === pr.pid ? 'a' : r.b && r.b.pid === pr.pid ? 'b' : null; if (!mine) continue;
      const have = local.find(x => x.id === r.id);
      if (r.b && r.a.team && (!have || have.status !== 'done')) {
        const sr = runSeries(r.seed, r.a.team, r.b.team);
        const rec = finishRecord({ ...(have || {}), id: r.id, seed: r.seed, created: r.created, role: mine === 'a' ? 'sent' : 'received', a: sideOf(r.a), b: sideOf(r.b), synced: true }, sr, mine);
        if (mine === 'a') rec.unseen = true;
        upsert(rec); if (mine === 'a') news.push(rec);
      } else if (!have && mine === 'a') {
        upsert({ id: r.id, seed: r.seed, role: 'sent', status: 'waiting', created: r.created, a: sideOf(r.a), b: null, synced: true }); // started on another device
      }
    }
    drawNav(); if (VIEW === 'intro') drawMenu();
    if (news.length) { const x = news[0]; toast(`<b>${esc(x.b.name)} finished your challenge</b><span>${x.myWin ? 'You won' : 'You lost'} ${x.myGames}–${x.oppGames} · tap to watch</span>`, () => drawDetail(x.id)); }
    if (VIEW === 'challenge' && $('chBody').querySelector('.chlist')) drawHub(document.querySelector('.chtabs [aria-pressed="true"]')?.dataset.tab || 'history');
  } finally { syncing = false; }
}
setInterval(() => { if (document.visibilityState === 'visible' && STAGE !== 'season' && STAGE !== 'playoffs') syncAll(); }, 20000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncAll(); });

// ---------- menu ----------
function drawNav() {
  const pr = getProfile(); const news = chHistory().filter(x => x.unseen).length;
  $('navProf').innerHTML = (pr ? avatar(pr, 32) : '<span class="pav" style="background:var(--surface-2);width:32px;height:32px">?</span>') + (news ? `<span class="nbadge navdot">${news}</span>` : '') + `<span class="navname">${pr ? esc(pr.name) : 'Profile'}</span>`;
}
$('navProf').onclick = () => { stopPlay(); stopPO(); needProfile(() => { drawHub(chHistory().some(x => x.unseen) ? 'history' : 'profile'); syncAll(); }); };
function drawMenu() {
  drawNav();
  const pr = getProfile(); const h = chHistory(); const done = h.filter(x => x.status === 'done'); const won = done.filter(x => x.myWin).length;
  if (!$('menuProfile')) return;
  $('menuProfile').innerHTML = pr ? `${avatar(pr, 30)}<span><b>${esc(pr.name)}</b><small>${done.length ? `Challenges ${won}–${done.length - won}` : 'No challenges yet'}</small></span>` : `<span class="pav" style="background:var(--surface-2)">?</span><span><b>Set up your profile</b><small>Needed for challenges</small></span>`;
}
$('modeClassic').onclick = () => { setMode('classic'); CH = null; resetDraft(); showView('draft'); };
$('modeChallenge').onclick = () => needProfile(() => { CH = { id: uid(6), seed: Math.floor(Math.random() * 2 ** 31), role: 'create' }; setMode('challenge'); resetDraft(); showView('draft'); });
document.querySelector('.brand').addEventListener('click', e => { e.preventDefault(); stopPlay(); stopPO(); stopCH(); drawMenu(); showView('intro'); });

// ---------- profile ----------
function needProfile(next) { if (getProfile()) next(); else drawProfileForm(next); }
function drawProfileForm(next) {
  const pr = getProfile() || { pid: uid(10), name: '', color: PCOLORS[0] };
  chScreen(`<div class="chcard narrow"><h2 class="sec-h">${getProfile() ? 'Your profile' : 'Pick a name'}</h2>
    <p class="hint">Friends see this name on your challenges. It stays on this device.</p>
    <label class="flabel" for="pfName">Name</label><input id="pfName" class="finput" maxlength="18" value="${esc(pr.name)}" placeholder="e.g. Alex" autocomplete="nickname">
    <label class="flabel">Colour</label><div class="swatches">${PCOLORS.map(c => `<button class="sw ${c === pr.color ? 'on' : ''}" data-c="${c}" style="background:${c}" aria-label="Colour ${c}"></button>`).join('')}</div>
    ${getProfile() ? profileStats() : ''}
    <div class="cta-row"><button class="btn ball cta" id="pfSave">Save</button><button class="btn" id="pfBack">Back</button></div></div>`);
  let color = pr.color;
  document.querySelectorAll('.sw').forEach(b => b.onclick = () => { color = b.dataset.c; document.querySelectorAll('.sw').forEach(x => x.classList.toggle('on', x === b)); });
  $('pfSave').onclick = () => { const name = $('pfName').value.trim(); if (!name) { $('pfName').focus(); $('pfName').classList.add('err'); return; } store.set('ball-profile', { pid: pr.pid, name, color }); drawMenu(); next(); };
  $('pfBack').onclick = () => { drawMenu(); showView('intro'); };
  setTimeout(() => $('pfName') && !pr.name && $('pfName').focus(), 50);
}
function profileStats() {
  const done = chHistory().filter(x => x.status === 'done'); const sw = done.filter(x => x.myWin).length;
  const gw = done.reduce((s, x) => s + x.myGames, 0), gl = done.reduce((s, x) => s + x.oppGames, 0);
  const c = store.get('ball-classic', { n: 0, total: 0, best: 0, titles: 0 }); const old = store.get('ball-best', null);
  return `<div class="pstats3 six"><div><small>All-time score</small><b>${c.total.toLocaleString()}</b></div><div><small>Classic runs</small><b>${c.n}</b></div><div><small>Best score</small><b>${Math.max(c.best, old ? old.total : 0).toLocaleString() || '—'}</b></div><div><small>Titles</small><b>${c.titles}</b></div><div><small>Challenge series</small><b>${sw}–${done.length - sw}</b></div><div><small>Challenge games</small><b>${gw}–${gl}</b></div></div>`;
}

// ---------- seeded spins: both players get the same team and decade for each round and re-roll ----------
const hseed = s => E.hashStr(String(s));
function seededSpin(which, team, dec) {
  const r = E.rng(hseed(`${CH.seed}:${S.rounds.length}:${which}`)); let tries = 0;
  do { if (which !== 'era') team = E.TEAMS[Math.floor(r() * E.TEAMS.length)]; if (which !== 'team') dec = E.DECADES[Math.floor(r() * E.DECADES.length)]; tries++; } while (!eligible(team, dec) && tries < 500);
  return { team, dec };
}

// ---------- challenge-ready (after the draft) ----------
const myIds = () => E.SLOTS.map(s => S.picks[s].id);
function chReadyHTML() {
  const t = teamNumbers();
  if (CH.role === 'create') return `<div class="readycard"><div><div class="pmeta">Team rating</div><div class="ovr-big">${rtg(t.rating)}</div></div><div style="flex:1;min-width:180px"><b>Ready to challenge</b><div class="pmeta">Your friend gets the same spins, drafts their own five, then a best-of-seven series decides it. They won't see your players until the series.</div></div></div>
    <button class="btn ball cta chgo" data-act="send" style="width:100%;margin-top:14px">Create challenge link</button><button class="btn chgo" data-act="menu" style="width:100%;margin-top:8px">Back to menu</button>`;
  return `<div class="readycard"><div><div class="pmeta">Your team</div><div class="ovr-big">${rtg(t.rating)}</div></div><div style="flex:1;min-width:180px"><b>vs ${esc(CH.opp.name)} · team rating ${rtg(CH.oppTr)}</b><div class="pmeta">Best of seven. The higher-rated team gets home court.</div></div></div>
    <button class="btn ball cta chgo" data-act="play" style="width:100%;margin-top:14px">Play the series</button>`;
}
function chReadyMobile() {
  const t = teamNumbers();
  return `<div class="mready"><div><small>Team rating</small><b>${rtg(t.rating)}</b></div>${CH.role === 'accept' ? `<div><small>vs ${esc(CH.opp.name)}</small><b>${rtg(CH.oppTr)}</b></div>` : ''}<button class="btn mghost" id="mDetails">Details</button></div>
    <button class="btn ball mbig chgo" data-act="${CH.role === 'create' ? 'send' : 'play'}">${CH.role === 'create' ? 'Create challenge link' : 'Play the series'}</button>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('.chgo'); if (!b || MODE !== 'challenge' || !CH) return;
  if (b.dataset.act === 'menu') { drawMenu(); showView('intro'); }
  if (b.dataset.act === 'send') createChallenge();
  if (b.dataset.act === 'play') playChallenge();
});

function createChallenge() {
  const pr = getProfile(); const t = teamNumbers();
  const rec = { id: CH.id, seed: CH.seed, role: 'sent', status: 'waiting', created: Date.now(), a: { pid: pr.pid, name: pr.name, color: pr.color, team: myIds(), tr: Math.round(t.rating) }, b: null };
  upsert(rec);
  chScreen('<div class="chcard narrow center"><p class="hint">Creating your challenge…</p></div>');
  API.call('/api/c', { id: rec.id, seed: rec.seed, a: rec.a }).then(r => { drawSend(chHistory().find(x => x.id === rec.id) || rec); if (r && r.ok) { upsert({ ...rec, synced: true }); drawSend({ ...rec, synced: true }); const m = $('chSync'); if (m) m.textContent = 'Saved online: you\'ll see the result here automatically when your friend plays.'; const pb = document.querySelector('.pastebox'); if (pb) pb.remove(); } });
}
function chLink(rec) { if (rec.synced) return `${SITE}?c=${rec.id}`; return linkFor('c', { v: 1, id: rec.id, seed: rec.seed, from: { pid: rec.a.pid, name: rec.a.name, color: rec.a.color }, team: rec.a.team, tr: rec.a.tr }); }
const PASTE_HTML = `<div class="pastebox"><b>Got a result link back?</b><p class="pmeta">Your friend's result reaches you only through the link they send after the series. Paste it here (or open it in this browser).</p>
  <div class="pasterow"><input class="finput" id="pasteUrl" placeholder="Paste the result link"><button class="btn ball" id="pasteGo">Open</button></div>
  ${navigator.clipboard && navigator.clipboard.readText ? '<button class="btn" id="pasteClip" style="margin-top:8px">Paste from clipboard</button>' : ''}<p class="pmeta" id="pasteMsg" style="min-height:16px;margin:6px 0 0"></p></div>`;
function wirePaste() {
  const go = txt => { const m = String(txt || '').match(/#(r|c)=([A-Za-z0-9_-]+)/); if (!m) { $('pasteMsg').textContent = 'That doesn\'t look like a ball. result link.'; return; } location.hash = `${m[1]}=${m[2]}`; openFromHash(); };
  if ($('pasteGo')) $('pasteGo').onclick = () => go($('pasteUrl').value);
  if ($('pasteClip')) $('pasteClip').onclick = async () => { try { go(await navigator.clipboard.readText()); } catch (e) { $('pasteMsg').textContent = 'Your browser blocked the clipboard. Paste into the box instead.'; } };
}
function drawSend(rec) {
  const url = chLink(rec);
  chScreen(`<div class="chcard narrow"><span class="step">${rec.created && Date.now() - rec.created > 60000 ? 'Waiting for your friend' : 'Challenge created'}</span><h2 class="sec-h" style="margin-top:8px">Send this link to a friend</h2>
    <p class="hint">They'll get the same spins you had and draft their own five. When they finish, the series plays out and they can send you the result.</p>
    <div class="linkbox"><input class="finput" id="chUrl" readonly value="${esc(url)}"></div>
    <div class="cta-row"><button class="btn ball cta" id="chShare">${navigator.share ? 'Share link' : 'Copy link'}</button>${navigator.share ? '<button class="btn" id="chCopy">Copy</button>' : ''}<button class="btn" id="chHub">Challenges</button></div>
    <p class="pmeta" id="chMsg" style="min-height:18px"></p><p class="pmeta okline" id="chSync">${rec.synced ? 'Saved online: you\'ll see the result here automatically when your friend plays.' : ''}</p>${rec.synced ? '' : PASTE_HTML}</div>`);
  wirePaste();
  const copy = async () => { try { await navigator.clipboard.writeText(url); $('chMsg').textContent = 'Copied. Paste it into any chat.'; } catch (e) { $('chUrl').select(); $('chMsg').textContent = 'Select the link and copy it.'; } };
  $('chShare').onclick = async () => { if (navigator.share) { try { await navigator.share({ title: 'ball. challenge', text: `${rec.a.name} challenged you on ball.`, url }); } catch (e) { /* cancelled */ } } else copy(); };
  if ($('chCopy')) $('chCopy').onclick = copy;
  $('chHub').onclick = () => drawHub('history');
}

// ---------- opening links ----------
function openFromHash() {
  const sid = new URLSearchParams(location.search).get('c');
  if (sid && /^[a-z0-9]{4,12}$/.test(sid)) {
    try { window.history.replaceState(null, '', location.pathname); } catch (e) { /* ignore */ }
    chScreen('<div class="chcard narrow center"><p class="hint">Loading the challenge…</p></div>');
    API.call(`/api/c/${sid}`).then(r => {
      if (!r || !r.ok) { chScreen('<div class="chcard narrow"><h2 class="sec-h">Challenge not found</h2><p class="hint">The link may be mistyped, or it was made before online challenges existed. Ask your friend to send it again.</p><button class="btn ball cta" id="chMenu">Go to menu</button></div>'); $('chMenu').onclick = () => { drawMenu(); showView('intro'); }; return; }
      const rc = r.rec;
      needProfile(() => {
        const pr = getProfile();
        if (rc.b && rc.a.team && (rc.a.pid === pr.pid || rc.b.pid === pr.pid)) { openResult({ v: 1, id: rc.id, seed: rc.seed, a: rc.a, b: rc.b }); return; }
        openInvite({ v: 1, id: rc.id, seed: rc.seed, from: { pid: rc.a.pid, name: rc.a.name, color: rc.a.color }, team: rc.a.team, tr: rc.a.tr, online: true });
      });
    });
    return true;
  }
  const m = location.hash.match(/^#(c|r)=(.+)$/); if (!m) return false;
  const data = b64d(m[2]); try { window.history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
  if (!data || !data.v) { chScreen('<div class="chcard narrow"><h2 class="sec-h">That link didn\'t work</h2><p class="hint">It may have been cut off when it was copied. Ask your friend to send it again.</p><button class="btn ball cta" id="chMenu">Go to menu</button></div>'); $('chMenu').onclick = () => showView('intro'); return true; }
  needProfile(() => (m[1] === 'c' ? openInvite(data) : openResult(data)));
  return true;
}
function openInvite(d) {
  const pr = getProfile();
  API.call(`/api/c/${d.id}`).then(r => { if (r && r.ok && r.rec.b && r.rec.b.pid !== pr.pid && r.rec.a.pid !== pr.pid && VIEW === 'challenge' && $('chAccept')) { $('chAccept').insertAdjacentHTML('beforebegin', `<p class="pmeta" style="color:var(--loss)">${esc(r.rec.b.name)} already played this challenge. You can still play it, but your result won't be sent.</p>`); } }); const done = chHistory().find(x => x.id === d.id && x.status === 'done');
  if (done) { drawDetail(done.id); return; }
  if (d.from.pid === pr.pid) { const rec = chHistory().find(x => x.id === d.id); if (rec) { drawSend(rec); return; } }
  chScreen(`<div class="chcard narrow center">${avatar(d.from, 64)}<h2 class="sec-h" style="margin-top:12px">${esc(d.from.name)} challenged you</h2>
    <p class="hint">Their team rating is <b>${d.tr}</b>. You get the same spins they had. Draft your five, then a best-of-seven series decides it. You'll see their players when the series starts.</p>
    <div class="cta-row" style="justify-content:center"><button class="btn ball cta" id="chAccept">Draft your team</button><button class="btn" id="chLater">Not now</button></div></div>`);
  $('chAccept').onclick = () => { CH = { id: d.id, seed: d.seed, role: 'accept', opp: d.from, oppTeam: d.team, oppTr: d.tr }; setMode('challenge'); resetDraft(); showView('draft'); };
  $('chLater').onclick = () => { drawMenu(); showView('intro'); };
}
function openResult(d) {
  const pr = getProfile(); const mine = d.a.pid === pr.pid ? 'a' : d.b.pid === pr.pid ? 'b' : null;
  const res = runSeries(d.seed, d.a.team, d.b.team);
  if (mine) {
    const old = chHistory().find(x => x.id === d.id) || { id: d.id, seed: d.seed, created: Date.now() };
    upsert(finishRecord({ ...old, role: mine === 'a' ? 'sent' : 'received', a: d.a, b: d.b }, res, mine));
  }
  drawSeries({ id: d.id, seed: d.seed, a: d.a, b: d.b, role: mine === 'a' ? 'sent' : 'received' }, res, mine, true);
}
function finishRecord(rec, res, mine) {
  const myW = mine === 'a' ? res.wa : res.wb, opW = mine === 'a' ? res.wb : res.wa;
  return { ...rec, status: 'done', played: Date.now(), myWin: myW === 4, myGames: myW, oppGames: opW, mySide: mine };
}

// ---------- the series: deterministic from the seed and both lineups, so every device sees the same games ----------
function runSeries(seed, aIds, bIds) {
  const A = aIds.map(byId), B = bIds.map(byId);
  const ltA = E.lineupTable(A), ltB = E.lineupTable(B);
  const r = E.rng(hseed(`${seed}:series:${aIds.join(',')}|${bIds.join(',')}`));
  const g = () => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
  const nl = P => P.map(p => ({ name: p.name, gp: 0, min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tsa: 0, clutch: 0, high: 0 }));
  const linesA = nl(A), linesB = nl(B);
  const aHigh = ltA.table[31].team >= ltB.table[31].team;
  const HOMES = [true, true, false, false, true, false, true];
  const games = []; let wa = 0, wb = 0;
  const bClutch = (m) => B.filter((p, i) => (m >> i) & 1 && p.perks.includes('clutch')).map(p => p.name);
  while (wa < 4 && wb < 4) {
    const n = wa + wb; const aHome = HOMES[n] === aHigh;
    let maskB = 0; const outB = []; B.forEach((p, i) => { if (r() < E.avail(p)) maskB |= 1 << i; else outB.push(p.name); });
    const gm = E.simGame(A, ltA, { label: 'B', net: ltB.table[maskB].net }, aHome, r, true, linesA, false);
    let us = gm.us, them = gm.them, aWin = gm.win, heroB = null;
    const cl = bClutch(maskB);
    if (aWin && us - them <= 4 && cl.length) for (const nm of cl) if (r() < .3) { heroB = nm; them = us + 1 + Math.floor(r() * 3); aWin = false; break; }
    // the other side's box score, scaled to their points
    const live = B.map((p, i) => (maskB >> i) & 1 ? ltB.ds[i] : null); const U = live.reduce((s, d) => s + (d ? d.u : .17), 0); const share = U > 1 ? 1 / U : 1;
    let topB = null; const exp = 107 + ltB.table[maskB].net / 2;
    B.forEach((p, i) => { const d = live[i]; if (!d) return; const L = linesB[i]; const min = Math.max(18, Math.min(44, Math.min(p.mpg, 38) + g() * 2.5)); const f = min / 48;
      const pts = Math.max(0, Math.round(d.pts * f * share * (them / exp) * (1 + g() * .22)));
      L.gp++; L.min += min; L.pts += pts; L.reb += Math.max(0, Math.round(d.reb * f * Math.min(1, 46 / 50) * (1 + g() * .3))); L.ast += Math.max(0, Math.round(d.ast * f * (1 + g() * .32))); L.stl += Math.max(0, Math.round(d.stl * f * (1 + g() * .6))); L.blk += Math.max(0, Math.round(d.blk * f * (1 + g() * .6))); L.high = Math.max(L.high, pts);
      if (!topB || pts > topB.pts) topB = { name: p.name, pts }; });
    if (heroB) linesB[B.findIndex(p => p.name === heroB)].clutch++;
    aWin ? wa++ : wb++;
    games.push({ n: n + 1, aHome, a: us, b: them, aWin, outA: gm.out, outB, heroA: aWin ? gm.hero : null, heroB, topA: gm.top ? { name: gm.top.name, pts: gm.top.pts } : null, topB, wa, wb, pA: gm.p });
  }
  const score = L => L.gp ? (L.pts + L.reb * .4 + L.ast * .6 + (L.stl + L.blk) * .8 + L.clutch) / L.gp : 0;
  const win = wa === 4 ? linesA : linesB; const mvp = win.slice().sort((x, y) => score(y) - score(x))[0];
  return { wa, wb, games, linesA, linesB, mvp, trA: ltA.table[31].team, trB: ltB.table[31].team };
}

const AUTO_SENT = name => `<div class="ctabox okbox" style="margin-top:12px"><div><b>Result sent automatically</b><div class="pmeta">${esc(name)} will see this series in their Challenges.</div></div></div>`;
function playChallenge() {
  const pr = getProfile();
  if (!CH.oppTeam) {
    const b = { pid: pr.pid, name: pr.name, color: pr.color, team: myIds(), tr: Math.round(teamNumbers().rating) };
    chScreen('<div class="chcard narrow center"><p class="hint">Locking in your team…</p></div>');
    API.call(`/api/c/${CH.id}/result`, { b }).then(r => {
      if (r && r.rec && r.rec.a && r.rec.a.team) { CH.oppTeam = r.rec.a.team; CH.synced = !!r.ok; playChallenge(); return; }
      chScreen('<div class="chcard narrow"><h2 class="sec-h">Couldn\'t reach the server</h2><p class="hint">Check your connection and try again. Your team is kept.</p><button class="btn ball cta" id="chRetry">Try again</button></div>'); $('chRetry').onclick = playChallenge;
    });
    return;
  }
  const rec = { id: CH.id, seed: CH.seed, role: 'received', created: Date.now(), a: { ...CH.opp, team: CH.oppTeam, tr: CH.oppTr }, b: { pid: pr.pid, name: pr.name, color: pr.color, team: myIds(), tr: Math.round(teamNumbers().rating) } };
  const res = runSeries(rec.seed, rec.a.team, rec.b.team);
  upsert({ ...finishRecord(rec, res, 'b'), synced: !!CH.synced });
  drawSeries(rec, res, 'b', true);
  if (CH.synced) return;
  API.call(`/api/c/${rec.id}/result`, { b: rec.b }).then(r => { if (r && r.ok) { const cur = chHistory().find(x => x.id === rec.id); if (cur) upsert({ ...cur, synced: true }); const c = $('srCta'); if (c && c.innerHTML) c.innerHTML = AUTO_SENT(rec.a.name); } });
}

// ---------- series screen: plays game by game, then shows the result, MVP and both rosters ----------
function rosterHTML(side, ids, lines, me) {
  return `<div class="chroster"><div class="chrh">${avatar(side, 26)}<b>${esc(side.name)}${me ? ' (you)' : ''}</b><span class="pmeta">Team ${rtg(side.tr)}</span></div>
    ${ids.map((id, i) => { const p = byId(id); if (!p) return ''; const L = lines && lines[i]; return `<div class="chp">${ovrBadge(p)}<span><b>${p.name}</b><small>${E.SLOTS[i]} · ${p.season} ${E.teamName(p.team, p.decade)}${p.perks[0] ? ' · ' + E.PERKS[p.perks[0]].tag : ''}</small></span>${L && L.gp ? `<span class="num chpl">${(L.pts / L.gp).toFixed(1)} pts</span>` : ''}</div>`; }).join('')}</div>`;
}
function drawSeries(rec, res, mine, animate) {
  const A = rec.a, B = rec.b; const meA = mine === 'a', meB = mine === 'b';
  chScreen(`<div class="chcard">
    <div class="vs"><div class="vsside">${avatar(A, 44)}<b>${esc(A.name)}${meA ? ' (you)' : ''}</b><small>Team ${rtg(res.trA)}</small></div>
      <div class="vsscore num" id="srScore">0–0</div>
      <div class="vsside">${avatar(B, 44)}<b>${esc(B.name)}${meB ? ' (you)' : ''}</b><small>Team ${rtg(res.trB)}</small></div></div>
    <div class="ticker" id="srTicker"><div class="row1"><span>Best of seven · tip-off…</span></div></div>
    <div class="ctrl" id="srCtrl"><button class="btn" id="srSkip">Skip to the end</button></div>
    <div id="srCta"></div>
    <div class="srgames" id="srGames"></div>
    <div id="srEnd" class="hidden"></div>
  </div>`);
  let i = 0;
  const show = (gm, live) => {
    $('srScore').textContent = `${gm.wa}–${gm.wb}`;
    const winName = gm.aWin ? A.name : B.name; const hero = gm.heroA || gm.heroB;
    const notes = []; if (gm.topA) notes.push(`${A.name}: ${gm.topA.name} ${gm.topA.pts}`); if (gm.topB) notes.push(`${B.name}: ${gm.topB.name} ${gm.topB.pts}`);
    if (hero) notes.push(`${hero} won it at the buzzer`); if (gm.outA.length) notes.push(`${A.name} without ${gm.outA[0]}`); if (gm.outB.length) notes.push(`${B.name} without ${gm.outB[0]}`);
    if (live) $('srTicker').innerHTML = `<div class="row1"><span>Game ${gm.n} · at ${esc(gm.aHome ? A.name : B.name)}'s court</span><span style="font-weight:700;color:var(--accent);flex:none">${esc(winName)} win${winName === 'You' ? '' : 's'}</span></div><div class="score num">${gm.a}–${gm.b}</div><div class="note">${esc(notes.join(' · '))}</div>`;
    $('srGames').insertAdjacentHTML('beforeend', `<div class="srg ${gm.aWin ? 'wa' : 'wb'}"><span>G${gm.n}</span><span class="num">${gm.a}–${gm.b}</span><span>${esc(winName)}</span><span class="pmeta">${gm.wa}–${gm.wb}</span></div>`);
  };
  const end = () => {
    stopCH(); $('srCtrl').classList.add('hidden');
    const aWon = res.wa === 4; const W = aWon ? A : B; const iWon = (aWon && meA) || (!aWon && meB);
    const mv = res.mvp; const mvSide = res.linesA.includes(mv) ? A : B;
    $('srTicker').innerHTML = `<div class="row1"><span>Series final</span></div><div class="score">${mine ? (iWon ? 'You win' : `${esc(W.name)} wins`) : `${esc(W.name)} wins`} ${aWon ? `${res.wa}–${res.wb}` : `${res.wb}–${res.wa}`}</div><div class="note">Series MVP: ${esc(mv.name)} (${esc(mvSide.name)}) · ${(mv.pts / mv.gp).toFixed(1)} pts, ${(mv.reb / mv.gp).toFixed(1)} reb, ${(mv.ast / mv.gp).toFixed(1)} ast</div>`;
    const resultUrl = linkFor('r', { v: 1, id: rec.id, seed: rec.seed, a: { pid: A.pid, name: A.name, color: A.color, team: A.team, tr: A.tr }, b: { pid: B.pid, name: B.name, color: B.color, team: B.team, tr: B.tr } });
    const opp = meA ? B : A;
    const sentOk = meB && (chHistory().find(x => x.id === rec.id) || {}).synced;
    $('srCta').innerHTML = sentOk ? AUTO_SENT(A.name) : `${meB ? `<div class="ctabox" style="margin-top:12px"><div><b>${esc(A.name)} can't see this yet</b><div class="pmeta">Send the result link so it shows up in their history.</div></div><button class="btn ball cta" id="srSend">Send the result to ${esc(A.name)}</button></div><p class="pmeta" id="srMsg" style="min-height:18px"></p>` : ''}`;
    $('srEnd').innerHTML = `<div class="cta-row"><button class="btn ${meB ? '' : 'ball cta'}" id="srRematch">${mine ? `Rematch ${esc(opp.name)}` : 'Start your own challenge'}</button><button class="btn" id="srHub">Challenges</button></div>
      <div class="chrosters">${rosterHTML({ ...A, tr: res.trA }, A.team, res.linesA, meA)}${rosterHTML({ ...B, tr: res.trB }, B.team, res.linesB, meB)}</div>`;
    $('srEnd').classList.remove('hidden');
    if ($('srSend')) $('srSend').onclick = async () => { if (navigator.share) { try { await navigator.share({ title: 'ball. result', text: `Our series is done: ${W.name} won.`, url: resultUrl }); return; } catch (e) { /* cancelled */ } } try { await navigator.clipboard.writeText(resultUrl); $('srMsg').textContent = 'Result link copied. Paste it into your chat.'; } catch (e) { $('srMsg').textContent = resultUrl; } };
    $('srRematch').onclick = () => { CH = { id: uid(6), seed: Math.floor(Math.random() * 2 ** 31), role: 'create' }; setMode('challenge'); resetDraft(); showView('draft'); };
    $('srHub').onclick = () => drawHub('history');
  };
  $('srSkip').onclick = () => { stopCH(); while (i < res.games.length) show(res.games[i++], i === res.games.length); end(); };
  const step = () => { if (i >= res.games.length) { end(); return; } show(res.games[i++], true); CHT = setTimeout(step, 1100); };
  if (animate && !reduce) CHT = setTimeout(step, 500); else { while (i < res.games.length) show(res.games[i++], i === res.games.length); end(); }
}

// ---------- history, head-to-head, profile ----------
function drawHub(tab) {
  const h = chHistory(); const pr = getProfile();
  const tabs = `<div class="seg chtabs" role="tablist">${[['profile', 'Profile'], ['classic', 'Classic'], ['history', 'Challenges'], ['h2h', '<span class="lg">Head to head</span><span class="sm">H2H</span>']].map(([k, l]) => `<button role="tab" data-tab="${k}" aria-pressed="${k === tab}">${l}</button>`).join('')}</div>`;
  let body = '';
  if (tab === 'history') {
    body = (h.some(x => x.status !== 'done') ? PASTE_HTML : '') + (h.length ? h.map(x => { const opp = x.status === 'done' ? (x.mySide === 'a' ? x.b : x.a) : null;
      const st = x.status === 'done' ? `<b class="${x.myWin ? 'upw' : 'dnl'}">${x.unseen ? '<span class="nbadge">New</span> ' : ''}${x.myWin ? 'Won' : 'Lost'} ${x.myGames}–${x.oppGames}</b>` : '<b class="pmeta">Waiting for a friend</b>';
      return `<button class="chrow" data-id="${x.id}">${opp ? avatar(opp, 32) : '<span class="pav" style="background:var(--surface-2)">…</span>'}<span><b>${opp ? 'vs ' + esc(opp.name) : 'Challenge link sent'}</b><small>${new Date(x.played || x.created).toLocaleDateString()} · ${x.role === 'sent' ? 'You challenged' : 'You were challenged'}</small></span>${st}</button>`; }).join('')
      : '<div class="empty">No challenges yet. Start one from the menu and send the link to a friend.</div>');
  } else if (tab === 'h2h') {
    const map = {}; h.filter(x => x.status === 'done').forEach(x => { const opp = x.mySide === 'a' ? x.b : x.a; const m = map[opp.pid] = map[opp.pid] || { opp, sw: 0, sl: 0, gw: 0, gl: 0, last: 0 }; m.opp = opp; x.myWin ? m.sw++ : m.sl++; m.gw += x.myGames; m.gl += x.oppGames; m.last = Math.max(m.last, x.played || 0); });
    const rows = Object.values(map).sort((x, y) => y.last - x.last);
    body = rows.length ? `<div class="h2h"><div class="h2hh"><span>Opponent</span><span>Series</span><span>Games</span></div>${rows.map(m => `<div class="h2hr">${avatar(m.opp, 28)}<b>${esc(m.opp.name)}</b><span class="num ${m.sw > m.sl ? 'upw' : m.sw < m.sl ? 'dnl' : ''}">${m.sw}–${m.sl}</span><span class="num">${m.gw}–${m.gl}</span></div>`).join('')}</div>` : '<div class="empty">Finish a challenge to start your head-to-head records.</div>';
  } else if (tab === 'classic') {
    const c = store.get('ball-classic', { runs: [], n: 0, total: 0, best: 0, titles: 0, perfect: 0, bestW: 0 });
    body = `<div class="pstats3 six"><div><small>All-time score</small><b>${c.total.toLocaleString()}</b></div><div><small>Runs</small><b>${c.n}</b></div><div><small>Best score</small><b>${c.best ? c.best.toLocaleString() : '—'}</b></div><div><small>Average</small><b>${c.n ? Math.round(c.total / c.n).toLocaleString() : '—'}</b></div><div><small>Titles</small><b>${c.titles}</b></div><div><small>Best record</small><b>${c.n ? `${c.bestW}–${82 - c.bestW}` : '—'}</b></div></div>
      <h3 class="sub-h" style="margin:16px 0 8px">Last ${Math.min(10, c.runs.length) || 10} runs</h3>` + (c.runs.length ? c.runs.map((r, i) => `<details class="runx"><summary><span class="tierdot" style="background:${r.color}"></span><span><b>${r.score.toLocaleString()}</b> · ${esc(r.tier)}<small>${new Date(r.at).toLocaleDateString()} · ${r.w}–${82 - r.w} · playoffs ${r.poW}–${r.poL}</small></span><span class="pmeta">Team ${r.team}</span></summary>
        <div class="runbody"><p class="pmeta" style="margin:0 0 6px">${esc(r.result || '')}</p>${r.five.map(p => `<div class="chp"><span class="ovr ${ovrCls(p.ovr)}">${p.ovr}</span><span><b>${esc(p.name)}</b><small>${p.slot} · ${p.season} ${esc(p.team)}</small></span></div>`).join('')}</div></details>`).join('')
        : '<div class="empty">Play a Classic run and it will show up here.</div>');
  } else {
    body = `<div class="chprof">${avatar(pr, 56)}<div style="min-width:0"><b style="font-size:20px">${esc(pr.name)}</b>${profileStats()}</div></div><div class="cta-row"><button class="btn" id="hubEdit">Edit name and colour</button><button class="btn" id="hubMenu">Back to menu</button></div>`;
  }
  chScreen(`<div class="chcard"><div class="chhub-h"><div class="hubwho">${avatar(pr, 36)}<h2 class="sec-h" style="margin:0">${esc(pr.name)}</h2></div><div class="hubact"><button class="btn" id="hubClassic">Play classic</button><button class="btn ball" id="hubNew">New challenge</button></div></div>${tabs}<div class="chlist">${body}</div></div>`);
  document.querySelectorAll('.chtabs [data-tab]').forEach(b => b.onclick = () => drawHub(b.dataset.tab));
  document.querySelectorAll('.chrow').forEach(b => b.onclick = () => drawDetail(b.dataset.id));
  wirePaste();
  $('hubNew').onclick = () => $('modeChallenge').click();
  $('hubClassic').onclick = () => $('modeClassic').click();
  if ($('hubMenu')) $('hubMenu').onclick = () => { drawMenu(); showView('intro'); };
  if ($('hubEdit')) $('hubEdit').onclick = () => drawProfileForm(() => drawHub('profile'));
}
function drawDetail(id) {
  const x = chHistory().find(r => r.id === id); if (!x) { drawHub('history'); return; }
  if (x.unseen) { upsert({ ...x, unseen: false }); drawNav(); }
  if (x.status !== 'done') { drawSend(x); return; }
  const res = runSeries(x.seed, x.a.team, x.b.team);
  drawSeries(x, res, x.mySide, false);
  // offer to watch it again
  $('srEnd').insertAdjacentHTML('afterbegin', '<div class="cta-row" style="margin-top:0"><button class="btn" id="srReplay">Watch the series again</button></div>');
  $('srReplay').onclick = () => drawSeries(x, res, x.mySide, true);
}

setReels(null, null); document.body.dataset.view = 'intro'; setMode('classic'); refresh(); drawMenu(); openFromHash(); syncAll();
window.addEventListener('hashchange', openFromHash);
