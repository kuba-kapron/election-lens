// The panel on election night.
import { state } from "./state.js";
import { LIVE_YEAR, data, liveFile } from "./data.js";
import { fmtInt } from "./format.js";
import { atLarge, byStateSeat, counted, hRaces, houseMajority, houseNet, houseVotes, isCalled, isNewSeat, liveHouseTally, liveRaces, raceLean, roundOf, runoffOf, sYear, senateBalance, senatePopular, senateRace, senateRaces, senateSecured, stateDistricts, stateOf, tieBreaker } from "./rules.js";
import { SENATE_POP_NOTE, headline, liveSource, liveStatus, liveWhen, notesList, pctShort, peopleRows, personRow, pickupText, popSection, seatLabel, senateNeed, tugBar, wonLeadParts } from "./components.js";
import { bindSeatTabs, panel } from "./panel.js";
import { fillTrail } from "./trail.js";

export function liveRaceBody(r, id = r.id) {
  let html = r.test ? `<p class="test-flag">Test data, not real results</p>` : "";
  if (!counted(r)) {
    const called = isCalled(r), adv = new Set(r.call?.advanced || []);
    html += `<div class="cand">${r.cands.map((c, i) => personRow(c, 0, 0, adv.has(i) ? "runoff" : called && i === r.call.winner)).join("")}</div>
      <p class="note">${[called ? `Called by ${r.call.by}` : adv.size ? `Runoff, called by ${r.call.by}` : liveStatus(r), isNewSeat(r) ? "New seat" : ""].filter(Boolean).join(" · ")}</p>${pickupText(r)}`;
  } else {
    const rd = roundOf(r), l = raceLean(r), called = isCalled(r);
    // a runoff call: the two who advanced in bold with →, no winner yet
    const ro = runoffOf(r);
    html += `<div class="cand">${peopleRows(r.cands, rd.votes, rd.total, rd.other, ro ? { advanced: new Set(r.call.advanced), to: "runoff" } : called ? 0 : -1)}</div>`;
    // the bars say who won or leads; the grey lines say who called it and how much is counted
    const facts = [called ? `Called by ${r.call.by}` : ro ? `Runoff, called by ${r.call.by}` : "", `${fmtInt(rd.total)} votes counted${pctShort(r)}`, isNewSeat(r) ? "New seat" : ""].filter(Boolean);
    html += `<p class="note">${facts.join(" · ")}</p>${pickupText(r)}`;
    // the source sits with the numbers it gave, above the chart
    html += liveSource(r) + `<div class="trail" data-trail="${id}"></div>`;
    return html;
  }
  return html + liveSource(r);
}
export function liveCountyBody(r, fips) {
  const v = r.counties?.[fips], n = r.cands.length;
  if (!v || !v[n + 1]) return `<p class="empty">No votes counted in this county yet.</p>${liveSource(r, true)}`;
  const cp = r.county_pct?.[fips];
  const precincts = !r.county_source && r.pct_of && (r.pct_of.startsWith("precincts") || r.pct_of.startsWith("counties"));
  // same grey line as the race panel: votes counted (share)
  return `<div class="cand">${peopleRows(r.cands, v.slice(0, n), v[n + 1], v[n], -1)}</div>
    <p class="note">${fmtInt(v[n + 1])} votes counted${cp != null ? ` (${Math.round(cp)}%${precincts ? " of precincts reporting" : ""})` : ""}</p>${liveSource(r, true)}`;
}
export function senateBalanceBody() {
  const notUp = liveFile("senate")?.notUp;
  if (!notUp) return "";
  const b = senateBalance();
  const t = {};
  // independents who caucus with neither party (e.g. Dan Osborn) sit next to the Democrats
  for (const p of ["D", "R", "I"]) t[p] = { solid: b[p].notUp + b[p].called, lead: b[p].leading, solidText: "Not up or won",
    lines: [`${b[p].notUp} not up`, `${b[p].called} won`, `${b[p].leading} leading`] };
  const changed = (notUp.seats || []).filter(x => x.note);
  return `${tugBar(t, 100, senateNeed(tieBreaker(LIVE_YEAR)), liveRaces("senate"), "seats", "", senateSecured({ D: t.D.solid, R: t.R.solid }, LIVE_YEAR))}
    ${changed.length ? `<ul class="notes"><li>Seats not up held by someone other than that race's winner: ${changed.map(x => x.note).join(" ")}</li></ul>` : ""}
    ${popSection(senatePopular(null, liveRaces("senate")), true)}<p class="note">${SENATE_POP_NOTE.replace("this year's", "tonight's")}</p>`;
}
// governors: only tonight's races (we have no list of the governors not up)
export function governorTallyBody(rs) {
  const x = liveHouseTally(rs), t = wonLeadParts(x, ["D", "R", "I"]);
  return tugBar(t, rs.length, null, rs, "seats");
}
export function liveNationBody() {
  const rs = [...sYear()].sort(byStateSeat);
  if (!rs.length) return `<p class="empty">No results file yet. Start the importer: <code>uv run -m pipeline.us.live.importer</code></p>`;
  const test = rs.some(r => r.test) ? `<p class="test-flag">Test data, not real results</p>` : "";
  return `${test}${state.office === "senate" ? senateBalanceBody() : governorTallyBody(rs)}`;
}
// footer: name the official sources the live results come from right now
export function drawLiveSources() {
  const el = document.getElementById("live-sources");
  if (!el) return;
  const official = new Map();
  for (const r of liveRaces()) if (r.source && r.source.official) official.set(r.source.name, r.source.url);
  const list = [...official].sort((a, b) => a[0].localeCompare(b[0])).map(([n, u]) => (u ? `<a href="${u}">${n}</a>` : n));
  const joined = list.length > 1 ? list.slice(0, -1).join(", ") + " and " + list[list.length - 1] : list[0];
  el.innerHTML = `2026 results, live: ${list.length ? `official results from ${joined}; ` : ""}unofficial counts from <a href="https://civicapi.org/">civicAPI</a> where states do not publish live data or block scripts, and its county figures where a state gives statewide totals only; entries typed in by hand name their source. Poll closing times: <a href="https://www.cbsnews.com/news/when-polls-open-close-2026-midterm-elections/">CBS News</a>.`;
}
export function drawLivePanel() {
  drawLiveSources();
  if (state.office === "house") return drawLiveHousePanel();
  const s = state.sel, st = stateOf(s);
  let html;
  if (s.type === "nation") {
    html = headline(state.office, s, liveWhen()) + liveNationBody();
  } else {
    const rs = senateRaces(st), r = senateRace(st);
    html = headline(state.office, s, liveWhen(), r?.seat === "special");
    if (rs.length > 1) {
      html += `<div class="mode tabs" role="radiogroup" aria-label="Race">${rs.map(x =>
        `<button type="button" role="radio" aria-checked="${x === r}" data-seat="${x.seat}">${seatLabel(x)}</button>`).join("")}</div>`;
    }
    if (!r) html += `<p class="empty">No race followed in ${data.states[st].name} tonight.</p>`;
    else html += s.type === "state" ? liveRaceBody(r) : liveCountyBody(r, s.id);
  }
  panel.innerHTML = html;
  bindSeatTabs();
  fillTrail();
}
export function liveHouseNationBody() {
  const rs = Object.values(hRaces());
  if (!rs.length) return `<p class="empty">No House results yet. Start the importer: <code>uv run -m pipeline.us.live.importer</code></p>`;
  const x = liveHouseTally(rs), t = wonLeadParts(x, ["D", "R"]);
  const test = rs.some(r => r.test) ? `<p class="test-flag">Test data, not real results</p>` : "";
  return `${test}${tugBar(t, 435, "218 for a majority", houseNet(LIVE_YEAR), "districts", "", houseMajority({ D: t.D.solid, R: t.R.solid }))}${popSection(houseVotes(rs), true)}
`;
}
export function drawLiveHousePanel() {
  const s = state.sel, st = stateOf(s), races = hRaces();
  let html;
  if (s.type === "nation") {
    html = headline("house", s, liveWhen()) + liveHouseNationBody();
  } else if (s.type === "district" || atLarge(st)) {
    const id = s.type === "district" ? s.id : `${st}-00`, r = races[id];
    html = headline("house", { type: "district", id }, liveWhen()) + (r ? liveRaceBody(r, id) + notesList(r.notes) : `<p class="empty">No result.</p>`);
  } else {
    const ds = stateDistricts(races, st).sort();
    const t = liveHouseTally(ds.map(([, r]) => r));
    const tt = wonLeadParts(t, ["D", "R", "I"]);
    html = `${headline("house", { type: "state", id: st }, `${liveWhen()} · ${ds.length} districts`)}
      ${tugBar(tt, ds.length, "", houseNet(LIVE_YEAR, st), "districts")}${t.none ? `<p class="tug-other">${t.none} with no votes counted yet.</p>` : ""}${popSection(houseVotes(ds.map(([, r]) => r)), true)}${notesList(ds[0]?.[1].notes)}`;
  }
  panel.innerHTML = html;
  fillTrail();
}
