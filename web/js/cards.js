// The Races and History cards under the map.
import { state, ui } from "./state.js";
import { LIVE_YEAR, data, extra, years } from "./data.js";
import { ARROW, CHECK, attr, fold, markSpan, possessive } from "./format.js";
import { SINGLE, advancedOf, atLarge, byStateSeat, counted, countyLean, ec, hRaces, houseMajority, houseRaces, houseVotes, isCalled, isClosed, isLive, isNewSeat, lean, liveHouseTally, margin, raceLean, record, roundOf, runoffOf, sYear, samePlan, senateBalance, senateControl, senatePopular, senateRace, senateRaces, signedMargin, stateDistricts, stateOf } from "./rules.js";
import { categorical } from "./colors.js";
import { CAUCUS_NAME, barChart, districtLabel, districtName, fullName, leanLabel, liveStatus, mlabel, pctText, personCell, placeName, raceRow, runoffText, seatSpan } from "./components.js";
import { racesEl } from "./panel.js";

// tonight: who is shown (the called winner, else the leader) and the status column
export function liveRowParts(r) {
  const l = counted(r) ? raceLean(r) : null, called = isCalled(r), ro = runoffOf(r);
  // a runoff: both people, one per line (each shortens to fit, with the party), → in the status column
  const who = called ? personCell(r.cands[r.call.winner]) : ro ? ro.map(c => `<span class="who-line">${personCell(c)}</span>`).join("")
    : l ? personCell(r.cands[l.lead]) : `<span class="muted">${liveStatus(r)}</span>`;
  const status = called ? markSpan(CHECK, "won")
    : ro ? markSpan(ARROW, "runoff", attr(runoffText(r)))
    : l ? `<span class="muted">${pctText(r).replace(/ of .*| counted/, "")}</span>` : "";
  return { who, status, lean: l ? leanLabel(l) : "" };
}
try { ui.raceSort = localStorage.getItem("raceSort") || "az"; } catch (e) { /* private mode: default order */ }
// tonight: counted races first (in the chosen order), then closed polls with no votes yet,
// then open polls by closing time; within a closing time, A–Z
export const liveGroup = r => (counted(r) ? 0 : !r.polls_close || isClosed(r) ? 1 : 2);
// items: { html, m (signed margin or null), group, close } given in A–Z order
export function raceList(title, items, firstLabel = "A–Z", cls = "") {
  // six orders: A–Z / Z–A, closest / widest first, most Democratic / most Republican first
  const [base, rev] = [ui.raceSort.replace(/-r$/, ""), ui.raceSort.endsWith("-r")];
  const cmp = {
    az: (a, b) => a.i - b.i,
    close: (a, b) => Math.abs(a.m) - Math.abs(b.m),
    spectrum: (a, b) => b.m - a.m,
  }[base] || ((a, b) => a.i - b.i);
  const by = (a, b) => (rev ? -1 : 1) * cmp(a, b);
  const grp = x => (x.m == null ? Math.max(1, x.group ?? 1) : x.group ?? 0);
  const sorted = items.map((x, i) => ({ ...x, i })).sort((a, b) => grp(a) - grp(b)
    || (grp(a) === 0 ? by(a, b) : grp(a) === 2 ? Date.parse(a.close) - Date.parse(b.close) : 0) || a.i - b.i);
  // every order spelled out in one dropdown (the phone's own picker on phones)
  const districts = firstLabel === "1st–";
  const opts = [["az", districts ? "1st–last" : "A–Z"], ["az-r", districts ? "Last–1st" : "Z–A"], ["close", "Closest first"], ["close-r", "Widest first"],
    ["spectrum", "Most Democratic first"], ["spectrum-r", "Most Republican first"]];
  const sw = `<label class="list-sort">Sort <select data-sort>${opts.map(([k, label]) =>
    `<option value="${k}"${k === ui.raceSort || (k === "az" && !opts.some(o => o[0] === ui.raceSort)) ? " selected" : ""}>${label}</option>`).join("")}</select></label>`;
  // long lists: the first LIST_CAP rows and "Show all"; opened when the place in view is further
  // down, so its marked row is never hidden. A filter field searches the whole list
  const long = sorted.length > LIST_CAP, key = `${state.office}|${title}`;
  if (listView.key !== key) Object.assign(listView, { key, open: false, q: "" });
  const curAt = sorted.findIndex(x => x.html.includes('aria-current="true"'));
  const open = listView.open || curAt >= LIST_CAP;
  const rows = sorted.map((x, i) => x.html.replace("<li>", `<li data-q="${attr(searchText(x.html))}"${i >= LIST_CAP ? ' class="more"' : ""}>`)).join("");
  const search = long ? `<input type="search" class="list-search" placeholder="Filter" aria-label="Filter ${attr(title)}" value="${attr(listView.q)}">` : "";
  const more = long ? `<button type="button" class="quiet list-more" aria-expanded="${open}" data-n="${sorted.length}">${open ? "Show fewer" : `Show all ${sorted.length}`}</button>` : "";
  return `<div class="races-head"><h3>${title}</h3>${search}${sw}</div><ul class="race-list${cls ? ` ${cls}` : ""}${open ? " open" : ""}">${rows}</ul><p class="empty list-none" hidden>No matches.</p>${more}`;
}
export const LIST_CAP = 40;
export const listView = { key: null, open: false, q: "" };  // per list: opened, filter text; reset when the list changes
export const searchText = html => fold(html.replace(/data-forms="([^"]*)"/g, " $1 ").replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ")).replace(/\s+/g, " ").trim();
export function filterList() {
  const ul = racesEl.querySelector(".race-list"), q = fold(listView.q.trim());
  if (!ul) return;
  let n = 0;
  for (const li of ul.children) { const hit = !q || q.split(" ").every(w => li.dataset.q.includes(w)); li.classList.toggle("match", hit); n += hit; }
  ul.classList.toggle("searching", !!q);
  racesEl.querySelector(".list-none").hidden = !q || n > 0;
  const more = racesEl.querySelector(".list-more");
  if (more) more.hidden = !!q;
}
// The races card: every race at the map's level (the country: all races; a state: its
// districts, or the counties of its one race), else, at the lowest level, the level above
// with this place marked. Same rows for every office, past years and tonight.
export const selKey = sel => `${sel.type}:${sel.id ?? ""}`;
export function raceItem(r, label, go, cur) {
  // past years: the shown round's leader (the winner, or at the November round of a race that
  // went to a runoff the leader then, with → in the status column)
  const pl = !isLive() && raceLean(r), adv = !isLive() && advancedOf(r), early = !!adv;
  const both = adv && [...adv.advanced].sort((a, b) => roundOf(r).votes[b] - roundOf(r).votes[a]).map(i => `<span class="who-line">${personCell(r.cands[i])}</span>`).join("");
  const live = isLive(), x = live ? liveRowParts(r) : { who: both || personCell(r.cands[pl?.lead ?? 0]),
    status: early ? markSpan(ARROW, "runoff", `Went to a ${r.rounds[r.rounds.length - 1].kind === "runoff" ? "runoff" : "ranked-choice count"}`) : "", lean: leanLabel(pl) };
  return { m: !live || counted(r) ? signedMargin(raceLean(r)) : null, group: live ? liveGroup(r) : 0, close: r.polls_close,
    html: raceRow(`${go}${cur ? ' aria-current="true"' : ""}`, label, x.who, x.status, x.lean) };
}
// one county of a race: its leader and margin; tonight also the share counted
export function countyItem(r, fips) {
  const n = r.cands.length, v = r.counties[fips], l = v && v[n + 1] ? countyLean(r, fips) : null, cp = r.county_pct?.[fips];
  const who = l ? personCell(r.cands[l.lead]) : `<span class="muted">No votes yet</span>`;
  const status = isLive() && l && cp != null ? `<span class="muted">${Math.round(cp)}%</span>` : "";
  return { m: l ? signedMargin(l) : null, group: l ? 0 : 1, fips,
    html: raceRow(`data-go="county:${fips}"`, countyLabel(fips), who, status, l ? leanLabel(l) : "") };
}
export const countyLabel = f => (data.counties[f]?.name ?? f).replace(/ (County|Parish)$/, "");
export const byName = (a, b) => (data.counties[a]?.name ?? a).localeCompare(data.counties[b]?.name ?? b);
export function levelList(sel) {
  const o = state.office, y = String(state.year), st = stateOf(sel);
  if (sel.type === "county" || sel.type === "district") return null;
  if (o === "president") {
    const c = data.candidates[y];
    const row = (s, label, go) => {
      const v = record(s, y), m = margin(v);
      if (m == null) return null;
      const p = m >= 0 ? "dem" : "gop", l = { caucus: p === "dem" ? "D" : "R", m: Math.abs(m) };
      return { m: signedMargin(l), html: raceRow(go, label, personCell({ name: fullName(c[p]), last: c[p], party: l.caucus }), "", leanLabel(l)) };
    };
    if (sel.type === "nation") {
      const sts = Object.keys(data.states).sort((a, b) => data.states[a].abbr.localeCompare(data.states[b].abbr));
      return { title: "States", items: sts.map(s => row({ type: "state", id: s }, data.states[s].abbr, `data-go="state:${s}"`)).filter(Boolean) };
    }
    if (SINGLE.has(st)) return null;
    const fs = Object.keys(data.counties).filter(f => f.startsWith(st) && data.counties[f].r[y]).sort(byName);
    return fs.length > 1 ? { title: `Counties in ${data.states[st].name}`, items: fs.map(f => row({ type: "county", id: f }, countyLabel(f), `data-go="county:${f}"`)).filter(Boolean), cls: "places" } : null;
  }
  if (o === "house") {
    const ids = Object.keys(hRaces()).filter(id => !st || id.startsWith(st + "-")).sort((a, b) =>
      data.states[a.slice(0, 2)].abbr.localeCompare(data.states[b.slice(0, 2)].abbr) || a.localeCompare(b));
    if (st && ids.length < 2) return null;
    const label = id => (st ? districtLabel(id, hRaces()[id])
      : `${data.states[id.slice(0, 2)].abbr} ${+id.slice(3) || "AL"}${isNewSeat(hRaces()[id]) ? ` <span class="new" title="New seat: no earlier holder">new</span>` : ""}`);
    return { title: st ? `Districts in ${data.states[st].name}` : "Districts", first: st ? "1st–" : "A–Z",
      items: ids.map(id => raceItem(hRaces()[id], label(id), `data-go="district:${id}"`)) };
  }
  // Senate and governors
  if (sel.type === "nation") {
    const rs = [...sYear()].sort(byStateSeat);
    const here = stateOf(state.sel);
    return rs.length ? { title: "Races", items: rs.map(r => raceItem(r, `${data.states[r.st].abbr}${r.seat === "special" ? " sp." : ""}`,
      `data-race-st="${r.st}" data-race-seat="${r.seat}"`, r.st === here && r === senateRace(here))) } : null;
  }
  const r = senateRace(st), fs = Object.keys(r?.counties || {}).filter(f => data.counties[f]).sort(byName);
  return fs.length > 1 ? { title: `Counties in ${data.states[st].name}`, items: fs.map(f => countyItem(r, f)), cls: "places" } : null;
}
export function racesCard() {
  let sel = state.sel, spec = levelList(sel);
  while (!spec && sel.type !== "nation") {
    sel = sel.type === "state" ? { type: "nation" } : { type: "state", id: stateOf(sel) };
    spec = levelList(sel);
  }
  if (!spec || !spec.items.length) return "";
  const st = stateOf(state.sel);
  const cur = `data-go="${state.office === "house" && state.sel.type === "state" && atLarge(st) ? `district:${st}-00` : selKey(state.sel)}"`;
  for (const x of spec.items) if (x.html.includes(cur + ">")) x.html = x.html.replace(cur, `${cur} aria-current="true"`);
  return raceList(spec.title, spec.items, spec.first, spec.cls);
}
export const histRow = (y, seat, label, who, lean, cur = y === state.year) =>
  raceRow(`data-hist="${y}"${seat ? ` data-hist-seat="${seat}"` : ""}${cur ? ' aria-current="true"' : ""}`, label, who, "", lean);
export function historyCard() {
  const s = state.sel, o = state.office, st = stateOf(s);
  // pts: one per election, oldest first; each gives a row (year | who | lean) and a bar
  // (m: signed value, text: its label). Country views chart seats under the Winner map and the
  // popular-vote margin under Margin, like the year ribbon; the rows keep the seats
  const mapSeats = o === "president" ? categorical() : state.cmap === "winner";
  const seatsChart = s.type === "nation" && (ui.histMode ? ui.histMode === "seats" : mapSeats), pts = [];
  const signed = l => (l.caucus === "D" ? l.m : l.caucus === "R" ? -l.m : 0);
  const marginBar = l => ({ m: signed(l), text: mlabel(signed(l)) });
  // seats or electoral votes: the majority's count, up for Democrats, down for Republicans
  const seatBar = (c, ctl, total) => ({ m: ctl === "R" ? -c.R / total : ctl === "D" ? c.D / total : 0, text: ctl === "R" ? `${c.R}` : `${c.D}` });
  const popBar = v => ({ m: margin(v), text: mlabel(margin(v)) });
  // tonight's year is included: counted so far (won or leading), marked as such on hover
  const withLive = list => (isLive() ? [...list, LIVE_YEAR] : list);
  let title = "", note = "";
  if (o === "president") {
    const span = `${years[0]}–${years[years.length - 1]}`;
    title = s.type !== "nation" ? `Margin in ${placeName(s)}, ${span}` : `Every election, ${span}`;
    for (const y of years) {
      const c = data.candidates[y];
      if (s.type === "nation") {
        const [d, r] = ec(y).won, p = c.won, ctl = p === "dem" ? "D" : "R";
        pts.push({ y, who: personCell({ name: fullName(c[p]), last: c[p], party: ctl }),
          lean: `<span class="mg ${ctl.toLowerCase()}">${Math.max(d, r)}–${Math.min(d, r)}</span>`,  // winner first
          ...(seatsChart ? seatBar({ D: d, R: r }, ctl, 538) : popBar(data.nation[y])) });
        continue;
      }
      const m = margin(record(s, String(y)));
      if (m == null) continue;
      const p = m >= 0 ? "dem" : "gop", l = { caucus: p === "dem" ? "D" : "R", m: Math.abs(m) };
      pts.push({ y, who: personCell({ name: fullName(c[p]), last: c[p], party: l.caucus }), lean: leanLabel(l), ...marginBar(l) });
    }
  } else if (o === "governor") {
    // governor history has no page of its own yet: last time only, not a link
    const r = st && senateRace(st), p = r?.prev;
    if (!p) return "";
    const w = p.cands.reduce((a, b) => (b.votes > a.votes ? b : a)), l = lean(p.cands, p.cands.map(c => c.votes), p.total);
    return `<h3>Last time</h3><ul class="race-list">${raceRow(null, String(p.year), personCell(w), "", leanLabel(l))}</ul>
      <p class="note">${p.year} result: MIT Election Data and Science Lab, precinct returns summed to the state.</p>`;
  } else if (s.type === "nation") {
    const sen = o === "senate";
    title = `${sen ? "Senate" : "House"} after each election`;
    for (const y of withLive(sen ? extra.senate.years : extra.house.years)) {
      let c, pop;
      if (y === LIVE_YEAR) {
        // seats won or led so far (Senate: with the seats not up)
        if (sen) { const b = senateBalance(); c = {}; for (const p of ["D", "R", "I"]) c[p] = b[p].notUp + b[p].called + b[p].leading; }
        else c = liveHouseTally(Object.values(houseRaces(y)));
        c = { D: c.D, R: c.R };
        pop = sen ? senatePopular(y) : houseVotes(Object.values(houseRaces(y)));
      } else {
        c = sen ? extra.senate.control[y] : extra.house.seats[y];
        pop = sen ? senatePopular(y) : extra.house.popular[y];
      }
      const ctl = sen ? senateControl(c, y) : houseMajority(c) ?? (c.D > c.R ? "D" : c.R > c.D ? "R" : null);
      pts.push({ y, live: y === LIVE_YEAR, who: CAUCUS_NAME[ctl] ?? (sen ? "Tied" : "No majority"), lean: seatSpan(c, ctl),
        ...(seatsChart ? seatBar(c, ctl, sen ? 100 : 435) : popBar(pop)) });
    }
  } else if (o === "senate") {
    title = s.type === "county" ? `${placeName(s)} in Senate races` : `Senate races in ${data.states[st].name}`;
    for (const y of withLive(extra.senate.years)) {
      const rs = senateRaces(st, y);
      for (const r of rs) {
        const l = s.type === "county" ? countyLean(r, s.id) : raceLean(r);
        if (!l) continue;
        pts.push({ y, seat: r.seat, live: y === LIVE_YEAR, label: `${y}${r.seat === "special" ? " sp." : ""}`, cur: y === state.year && (r.seat === state.seat || rs.length === 1),
          who: personCell(r.cands[l.lead ?? 0]), lean: leanLabel(l), ...(l.unopposed ? { m: null, text: "" } : marginBar(l)) });
      }
    }
    if (!pts.length) note = `No Senate race in ${data.states[st].name} from 2020 to 2024.`;
  } else if (s.type === "district" || atLarge(st)) {
    const id = s.type === "district" ? s.id : `${st}-00`;
    title = districtName(id);
    for (const y of withLive(extra.house.years)) {
      const r = houseRaces(y)[id], l = r && (y !== LIVE_YEAR || counted(r)) ? raceLean(r) : null;
      if (!l) continue;
      const faded = !samePlan(st, y, state.year);
      pts.push({ y, faded, live: y === LIVE_YEAR, label: String(y), rowLabel: `${y}${faded ? ` <span class="old" title="Drawn differently from the ${state.year} map">old map</span>` : ""}`,
        who: personCell(r.cands[l.lead ?? 0]), lean: leanLabel(l), ...(l.unopposed ? { m: null, text: "" } : marginBar(l)) });
    }
  } else {
    title = `${possessive(data.states[st].name)} House delegation`;
    for (const y of withLive(extra.house.years)) {
      const mine = stateDistricts(houseRaces(y), st).map(([, r]) => r);
      const won = y === LIVE_YEAR ? liveHouseTally(mine) : { D: 0, R: 0, I: 0 };
      if (y !== LIVE_YEAR) for (const r of mine) won[r.cands[0].caucus]++;
      const n = won.D + won.R + won.I, ctl = won.D > won.R ? "D" : won.R > won.D ? "R" : null;
      pts.push({ y, live: y === LIVE_YEAR, who: CAUCUS_NAME[ctl] ?? "Even", lean: seatSpan({ D: won.D, R: won.R, I: won.I }, ctl), ...seatBar(won, ctl, n) });
    }
  }
  if (!pts.length) return note ? `<h3>${title}</h3><p class="empty">${note}</p>` : "";
  for (const d of pts) {
    d.label ??= String(d.y);
    d.cur ??= d.y === state.year;
    d.attrs = `data-hist="${d.y}"${d.seat ? ` data-hist-seat="${d.seat}"` : ""}`;
  }
  const rows = [...pts].reverse().map(d => histRow(d.y, d.seat, d.rowLabel ?? d.label, d.who, d.lean, d.cur)).join("");
  const list = `<ul class="race-list">${rows}</ul>`;
  // a chart once there are two elections to compare; country charts switch between seats (or
  // electoral votes) and the popular-vote margin, starting from what the map shows
  const chart = pts.length > 1 ? barChart(pts, title) : "";
  const sw = chart && s.type === "nation" ? `<div class="mode" role="radiogroup" aria-label="Chart">${[["seats", o === "president" ? "Electoral votes" : "Seats"], ["pop", "Popular vote"]].map(([k, label]) =>
    `<button type="button" role="radio" aria-checked="${(k === "seats") === seatsChart}" data-hist-mode="${k}">${label}</button>`).join("")}</div>` : "";
  return `<div class="races-head"><h3>${title}</h3>${sw}</div>${chart ? `<div class="hist-body">${chart}${list}</div>` : list}`;
}
