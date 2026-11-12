// Election rules: results, margins, rounds and runoffs, calls, pickups, seat totals.
import { state } from "./state.js";
import { LIVE_YEAR, data, extra, houseHolder, liveFile, years } from "./data.js";

export function record(sel, year) {
  if (sel.type === "nation") return data.nation[year];
  if (sel.type === "state") return data.states[sel.id]?.r[year];
  return data.counties[sel.id]?.r[year];
}
export function margin(v) { return v && v[2] ? (v[0] - v[1]) / v[2] : null; }
// Party that won this place: most votes, or for the whole country the Electoral College
export function wonBy(sel, y, v) {
  if (sel.type === "nation") return data.candidates[y].won;
  return v ? (v[0] >= v[1] ? "dem" : "gop") : null;
}
export const ec = y => data.electoral[String(y)];
// ["gop", "dem"] or ["dem", "gop"]: the party with the larger count first
export const byCount = (d, r) => (d >= r ? ["dem", "gop"] : ["gop", "dem"]);
export function evOf(st, y) { const e = ec(y).states[st]; return e[0] + e[1]; }
export function prevYear(y) { const i = years.indexOf(+y); return i > 0 ? years[i - 1] : null; }
export function shift(sel, y) {
  const p = prevYear(y);
  if (!p) return null;
  const a = margin(record(sel, y)), b = margin(record(sel, p));
  return a == null || b == null ? null : a - b;
}
export function stateOf(sel) { return sel.type === "county" || sel.type === "district" ? sel.id.slice(0, 2) : sel.type === "state" ? sel.id : null; }
export function stateWinner(st, y) {
  const e = data.electoral[String(y)]?.states[st];
  return e ? (e[0] > e[1] ? "dem" : "gop") : null;
}
export function flippedFrom(st, y) {
  const p = prevYear(y), now = stateWinner(st, y), before = p && stateWinner(st, p);
  return before && before !== now ? before : null;
}

// Alaska and DC are one unit each, so they never drill down further
export const SINGLE = new Set(["02", "11"]);
// a year's House races: the live file for 2026, house.json for 2020-2024
export function houseRaces(y) { return (+y === LIVE_YEAR ? liveFile("house")?.races : extra.house?.races[String(y)]) || {}; }
export const hRaces = () => houseRaces(state.year);
// the live page (election night 2026) reuses the Senate views: same race shape, one "year"
export const isLive = () => state.year === LIVE_YEAR;
export const liveRaces = (o = state.office) => Object.values(liveFile(o)?.races || {});
export const sYear = (y = state.year) => (+y === LIVE_YEAR
  ? liveRaces(state.office === "governor" ? "governor" : "senate")
  : (extra.senate?.races[String(y)] || []));
export const SEAT_ORDER = { regular: 0, special: 1, governor: 2 };
export const byStateSeat = (a, b) => data.states[a.st].abbr.localeCompare(data.states[b.st].abbr) || SEAT_ORDER[a.seat] - SEAT_ORDER[b.seat];
export function senateRaces(st, y = state.year) {
  return sYear(y).filter(r => r.st === st).sort((a, b) => SEAT_ORDER[a.seat] - SEAT_ORDER[b.seat]);
}
// the race a state shows: the one picked in the panel when the state is selected, else the regular one
export function senateRace(st, y = state.year) {
  const rs = senateRaces(st, y);
  const want = stateOf(state.sel) === st ? state.seat : "regular";
  return rs.find(r => r.seat === want) || rs[0] || null;
}
export function atLarge(st) { return state.office === "house" && !!hRaces()?.[`${st}-00`]; }
export function districtShape(id) { return (extra.districts[state.year] || []).find(f => f.properties.id === id); }
// a state's districts in a year's races: [[id, race], ...]
export const stateDistricts = (races, st) => Object.entries(races).filter(([id]) => id.startsWith(st + "-"));

// leader's caucus and lead over the runner-up, as a share of all votes
export function lean(cands, votes, total) {
  if (!votes || !votes.length || !total) return null;
  const order = votes.map((v, i) => i).sort((a, b) => votes[b] - votes[a]);
  const [a, b] = order;
  const gap = votes[a] - (b != null ? votes[b] : 0);
  return { caucus: cands[a].caucus, m: gap / total, gap, lead: a };
}
// The round shown, map-wide (map tools: November | Final): past races with a runoff or a
// ranked-choice count show their November round when "November" is picked, else the final one
export const shownRound = r => (state.firstRound && !isLive() && r.rounds.length > 1 ? 0 : r.rounds.length - 1);
export const roundOf = (r, i = null) => r.rounds[i == null ? shownRound(r) : i];
// at an earlier round: who advanced (those with votes in the next round) and where to; else null
export function advancedOf(r) {
  const ri = r?.rounds?.length ? shownRound(r) : -1, next = r?.rounds?.[ri + 1];
  if (!next) return null;
  return { advanced: new Set(next.votes.map((v, i) => (v > 0 ? i : -1)).filter(i => i >= 0)), to: next.kind === "runoff" ? "runoff" : "next round" };
}
// the winner mark for a past race's rows: the winner (index 0), or who advanced at an earlier round
export const pastMark = r => advancedOf(r) || 0;
export function raceLean(r) {
  if (!r) return null;
  if (!r.rounds.length) return { caucus: r.cands[0].caucus, m: 1, lead: 0, unopposed: true };
  const rd = roundOf(r);
  return lean(r.cands, rd.votes, rd.total);
}
export function countyLean(r, fips) {
  const v = r?.counties?.[fips];
  if (!v) return null;
  const n = r.cands.length;
  return lean(r.cands, v.slice(0, n), v[n + 1]);
}
export function senatePopular(y, races = null) {
  const t = [0, 0, 0];
  for (const r of races || sYear(y)) {
    if (!r.rounds.length) continue;
    const rd = r.rounds[0]; // November vote (first round)
    r.cands.forEach((c, i) => { if (c.party === "D") t[0] += rd.votes[i]; else if (c.party === "R") t[1] += rd.votes[i]; });
    t[2] += rd.total;
  }
  return t;
}
// The party that breaks a 50–50 tie in the Senate elected in year y: the Vice President's.
// A midterm: the sitting VP, from the last presidential election (Vance for 2026). A presidential
// year: the incoming VP, so unknown (null) until that race is decided (Harris for the 2020 Senate)
export const tieBreaker = y => {
  const p = data.candidates[+y % 4 ? +y - (+y % 4) : +y]?.won;
  return p ? (p === "dem" ? "D" : "R") : null;
};
// who holds the Senate on these counts: the larger side; at 50–50 the VP's party (if known)
export const senateControl = (c, y) => (c.D > c.R ? "D" : c.R > c.D ? "R" : c.D === 50 ? tieBreaker(y) : null);
// tonight: control secured by certain seats only (not up or called): 51, or 50 with the VP
export const senateSecured = (s, y) => {
  const vp = tieBreaker(y), has = p => s[p] >= 51 || (s[p] >= 50 && vp === p);
  return has("D") ? "D" : has("R") ? "R" : null;
};
// the House: 218 seats for a majority
export const houseMajority = c => (c.D >= 218 ? "D" : c.R >= 218 ? "R" : null);
// House popular vote: [Democratic, Republican, all] votes over the races given (first round,
// as counted so far tonight); unopposed races not on the ballot add nothing
export function houseVotes(races) {
  const v = [0, 0, 0];
  for (const r of races) {
    const rd = r.rounds?.[0];
    if (!rd || !rd.total) continue;
    r.cands.forEach((c, i) => { if (c.caucus === "D") v[0] += rd.votes[i]; else if (c.caucus === "R") v[1] += rd.votes[i]; });
    v[2] += rd.total;
  }
  return v;
}
// past years: [held before, won] per seat -> the same counts as gains() gives for tonight
export function pastGains(pairs, why = "") {
  const z = () => ({ D: 0, R: 0, I: 0 });
  const g = { won: z(), lost: z(), lead: z(), leadLost: z(), unknown: 0, any: false, why };
  for (const [held, w] of pairs) {
    if (!held) { g.unknown++; continue; }
    g.any = true;
    if (held !== w) { g.won[w]++; g.lost[held]++; }
  }
  return g;
}
// House: one net number per party, for the country or one state (st). Once every race is
// decided (past years; tonight when all are called): seats won now minus seats won last time.
// While counting: called races against each seat's previous holder (the map's pickups).
export function houseNet(y, st = null) {
  const prevY = +y - 2, mine = id => !st || id.startsWith(st + "-");
  const before = extra.house?.races[String(prevY)];
  if (!before) return null;
  const live = +y === LIVE_YEAR;
  const now = Object.entries(houseRaces(y)).filter(([id]) => mine(id)).map(([, r]) => r);
  const winner = r => (live ? seatParty(r) : r.cands[0]?.caucus);
  const net = { D: 0, R: 0, I: 0 };
  const called = now.filter(winner).length;
  const done = now.length > 0 && called === now.length;
  if (done) {
    for (const r of now) net[winner(r)]++;
    for (const [id, r] of Object.entries(before)) if (mine(id)) net[r.cands[0].caucus]--;
  } else {
    for (const r of now) {
      const w = winner(r), h = live ? heldBy(r) : r.holder;
      if (w && h?.caucus && h.caucus !== w) { net[w]++; net[h.caucus]--; }
    }
  }
  return { net, title: done ? `Seats won in ${y} minus seats won in ${prevY}`
    : `Net from the ${called} of ${now.length} races called so far, against each seat's previous holder; final once all are called` };
}
export const signedMargin = l => (!l ? null : l.caucus === "D" ? l.m : l.caucus === "R" ? -l.m : 0);
// "old map" on a district number drawn differently from the year in view
export const samePlan = (st, a, b) => extra.plans?.[String(a)]?.[st] === extra.plans?.[String(b)]?.[st];
export const isClosed = r => Date.now() >= Date.parse(r.polls_close);
export const counted = r => !!(r.rounds && r.rounds.length && r.rounds[0].total);
// who held the seat: Senate and governor races, the winner of the last election for it (r.prev);
// House districts, the rule in houseHolder(). A called race won by the other side is a pickup
export const isHouseRace = r => /^\d\d-\d\d$/.test(r.id || "");
export function heldBy(r) {
  if (isHouseRace(r)) {
    if (r.holder === undefined && extra.house) r.holder = houseHolder(r.id, r.cands, LIVE_YEAR);
    return r.holder?.caucus ? r.holder : null;
  }
  const p = r.prev;
  if (!p || !p.cands || !p.cands.length) return null;
  const w = p.cands.reduce((a, b) => (b.votes > a.votes ? b : a));
  return { caucus: w.caucus, name: w.name, year: p.year };
}
export const isNewSeat = r => !!(isHouseRace(r) ? (heldBy(r), r.holder) : r.holder)?.newSeat;
// a hand call: the winner, or the two who advanced to a runoff (no winner yet)
export const isCalled = r => r?.call?.winner != null;
export const callWinner = r => (r?.call && r.call.winner != null ? r.cands[r.call.winner] : null);
export const runoffOf = r => (r?.call?.advanced?.length ? r.call.advanced.map(i => r.cands[i]) : null);
// the party that holds the seat for certain: a called winner's, or that of a runoff between two
// of its own candidates (Louisiana's all-candidate primary); counted as won in the totals
export function seatParty(r) {
  const w = callWinner(r), ro = runoffOf(r);
  return w ? w.caucus : ro && ro.every(c => c.caucus === ro[0].caucus) ? ro[0].caucus : null;
}
export function pickup(r) {
  const party = seatParty(r), held = party && heldBy(r);
  return held && held.caucus !== party ? { won: callWinner(r) || runoffOf(r)[0], held } : null;
}
// Senate balance tonight: seats not up (won in 2022/2024, current holder) + called + leading
export function senateBalance() {
  const b = { D: { notUp: 0, called: 0, leading: 0 }, R: { notUp: 0, called: 0, leading: 0 }, I: { notUp: 0, called: 0, leading: 0 }, pending: 0 };
  for (const x of liveFile("senate")?.notUp?.seats || []) if (x.party) b[x.party].notUp++;
  for (const r of liveRaces("senate")) {
    const party = seatParty(r);
    if (party) b[party].called++;
    else if (runoffOf(r)) b.pending++;  // a runoff between parties: undecided
    else if (counted(r)) b[raceLean(r).caucus].leading++;
    else b.pending++;
  }
  return b;
}
// Seats changing party: called pickups (won/lost) and leads in seats the other party held last time
export function gains(races) {
  const z = () => ({ D: 0, R: 0, I: 0 });
  const g = { won: z(), lost: z(), lead: z(), leadLost: z(), unknown: 0, any: false };
  for (const r of races) {
    const held = heldBy(r);
    if (!held) { g.unknown++; continue; }
    g.any = true;
    const called = !!seatParty(r);
    const c = called ? seatParty(r) : runoffOf(r) ? null : counted(r) ? raceLean(r).caucus : null;
    if (!c || c === held.caucus) continue;
    (called ? g.won : g.lead)[c]++;
    (called ? g.lost : g.leadLost)[held.caucus]++;
  }
  return g;
}

// live House: 435 races, leaders only (no calls)
// per caucus: seats won (called by hand, with who called them) and seats leading
export function liveHouseTally(races) {
  const t = { D: 0, R: 0, I: 0, none: 0, runoff: 0, won: { D: 0, R: 0, I: 0 } };
  for (const r of races) {
    const party = seatParty(r);
    if (party) { t[party]++; t.won[party]++; continue; }
    if (runoffOf(r)) { t.runoff++; continue; }  // a runoff between parties: undecided
    const l = counted(r) ? raceLean(r) : null;
    if (l) t[l.caucus]++; else t.none++;
  }
  return t;
}
