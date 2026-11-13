// The Races and History cards under the map.
import { t } from "./texts.js";
import { state, ui } from "./state.js";
import { LIVE_YEAR, data } from "./us/data.js";
import { ARROW, CHECK, attr, fold, markSpan } from "./format.js";
import { advancedOf, atLarge, counted, countyLean, isCalled, isClosed, isLive, lean, margin, raceLean, roundOf, runoffOf, signedMargin, stateOf } from "./us/rules.js";
import { barChart, leanLabel, liveStatus, mlabel, pctText, personCell, raceRow, runoffText } from "./components.js";
import { racesEl } from "./panel.js";
import { view } from "./us/views/index.js";

// tonight: who is shown (the called winner, else the leader) and the status column
export function liveRowParts(r) {
  const l = counted(r) ? raceLean(r) : null, called = isCalled(r), ro = runoffOf(r);
  // a runoff: both people, one per line (each shortens to fit, with the party), → in the status column
  const who = called ? personCell(r.cands[r.call.winner]) : ro ? ro.map(c => `<span class="who-line">${personCell(c)}</span>`).join("")
    : l ? personCell(r.cands[l.lead]) : `<span class="muted">${liveStatus(r)}</span>`;
  const status = called ? markSpan(CHECK, t("srWon"))
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
  const opts = [["az", t(districts ? "firstLast" : "az")], ["az-r", t(districts ? "lastFirst" : "za")], ["close", t("closest")], ["close-r", t("widest")],
    ["spectrum", "Most Democratic first"], ["spectrum-r", "Most Republican first"]];
  const sw = `<label class="list-sort">${t("sort")} <select data-sort>${opts.map(([k, label]) =>
    `<option value="${k}"${k === ui.raceSort || (k === "az" && !opts.some(o => o[0] === ui.raceSort)) ? " selected" : ""}>${label}</option>`).join("")}</select></label>`;
  // long lists: the first LIST_CAP rows and "Show all"; opened when the place in view is further
  // down, so its marked row is never hidden. A filter field searches the whole list
  const long = sorted.length > LIST_CAP, key = `${state.office}|${title}`;
  if (listView.key !== key) Object.assign(listView, { key, open: false, q: "" });
  const curAt = sorted.findIndex(x => x.html.includes('aria-current="true"'));
  const open = listView.open || curAt >= LIST_CAP;
  const rows = sorted.map((x, i) => x.html.replace("<li>", `<li data-q="${attr(searchText(x.html))}"${i >= LIST_CAP ? ' class="more"' : ""}>`)).join("");
  const search = long ? `<input type="search" class="list-search" placeholder="${t("filter")}" aria-label="${attr(t("filterList", title))}" value="${attr(listView.q)}">` : "";
  const more = long ? `<button type="button" class="quiet list-more" aria-expanded="${open}" data-n="${sorted.length}">${open ? t("showFewer") : t("showAll", sorted.length)}</button>` : "";
  return `<div class="races-head"><h3>${title}</h3>${search}${sw}</div><ul class="race-list${cls ? ` ${cls}` : ""}${open ? " open" : ""}">${rows}</ul><p class="empty list-none" hidden>${t("noMatches")}</p>${more}`;
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
  const who = l ? personCell(r.cands[l.lead]) : `<span class="muted">${t("noVotesYet")}</span>`;
  const status = isLive() && l && cp != null ? `<span class="muted">${Math.round(cp)}%</span>` : "";
  return { m: l ? signedMargin(l) : null, group: l ? 0 : 1, fips,
    html: raceRow(`data-go="county:${fips}"`, countyLabel(fips), who, status, l ? leanLabel(l) : "") };
}
export const countyLabel = f => (data.counties[f]?.name ?? f).replace(/ (County|Parish)$/, "");
export const byName = (a, b) => (data.counties[a]?.name ?? a).localeCompare(data.counties[b]?.name ?? b);
// the races card's rows at this level: { title, items, first, cls }, or null (see views/)
export function levelList(sel) {
  if (sel.type === "county" || sel.type === "district") return null;
  return view().list(sel);
}
export function racesCard() {
  let sel = state.sel, spec = levelList(sel);
  while (!spec && sel.type !== "nation") {
    sel = sel.type === "state" ? { type: "nation" } : { type: "state", id: stateOf(sel) };
    spec = levelList(sel);
  }
  if (!spec || !spec.items.length) return "";
  const st = stateOf(state.sel);
  const cur = `data-go="${state.sel.type === "state" && atLarge(st) ? `district:${st}-00` : selKey(state.sel)}"`;
  for (const x of spec.items) if (x.html.includes(cur + ">")) x.html = x.html.replace(cur, `${cur} aria-current="true"`);
  return raceList(spec.title, spec.items, spec.first, spec.cls);
}
export const histRow = (y, seat, label, who, lean, cur = y === state.year) =>
  raceRow(`data-hist="${y}"${seat ? ` data-hist-seat="${seat}"` : ""}${cur ? ' aria-current="true"' : ""}`, label, who, "", lean);
// History card bars: a margin (up for Democrats), seats or electoral votes (the majority's count,
// up for Democrats, down for Republicans), the popular-vote margin
const signed = l => (l.caucus === "D" ? l.m : l.caucus === "R" ? -l.m : 0);
export const marginBar = l => ({ m: signed(l), text: mlabel(signed(l)) });
export const seatBar = (c, ctl, total) => ({ m: ctl === "R" ? -c.R / total : ctl === "D" ? c.D / total : 0, text: ctl === "R" ? `${c.R}` : `${c.D}` });
export const popBar = v => ({ m: margin(v), text: mlabel(margin(v)) });
// tonight's year is included: counted so far (won or leading), marked as such on hover
export const withLive = list => (isLive() ? [...list, LIVE_YEAR] : list);
// The history card: the view gives { title, pts, note } (pts: one per election, oldest first,
// each a row (year | who | lean) and a bar (m: signed value, text: its label)), or its own HTML.
// Country views chart seats under the Winner map and the popular-vote margin under Margin, like
// the year ribbon; the rows keep the seats
export function historyCard() {
  const s = state.sel, v = view();
  const seatsChart = s.type === "nation" && (ui.histMode ? ui.histMode === "seats" : v.mapSeats());
  const out = v.history(seatsChart);
  if (typeof out === "string") return out;
  const { title, pts, note = "" } = out;
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
  const sw = chart && s.type === "nation" ? `<div class="mode" role="radiogroup" aria-label="${t("chart")}">${[["seats", v.seatsLabel], ["pop", t("popularVote")]].map(([k, label]) =>
    `<button type="button" role="radio" aria-checked="${(k === "seats") === seatsChart}" data-hist-mode="${k}">${label}</button>`).join("")}</div>` : "";
  return `<div class="races-head"><h3>${title}</h3>${sw}</div>${chart ? `<div class="hist-body">${chart}${list}</div>` : list}`;
}
