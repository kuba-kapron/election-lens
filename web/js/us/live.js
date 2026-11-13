// The panel on election night.
import { fmtInt } from "../format.js";
import { counted, isCalled, isNewSeat, liveRaces, raceLean, roundOf, runoffOf } from "./rules.js";
import { liveSource, liveStatus, pctShort, peopleRows, personRow, pickupText } from "../components.js";

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
