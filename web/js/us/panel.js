// The US panel's race bodies: a whole race (statewide or district) and one county's figures.
// a whole race: statewide (Senate) or district (House)
import { fmtInt } from "../format.js";
import { countyLean, isNewSeat, lean, pastMark, shownRound } from "./rules.js";
import { notesList } from "../components.js";
import { CAUCUS_NAME, peopleRows, personRow } from "./components.js";

export function raceBody(r) {
  if (!r.rounds.length) {
    return `<div class="cand">${personRow(r.cands[0], null, null, true)}</div>
      <p class="note">Won unopposed${isNewSeat(r) ? " · New seat" : ""}</p>${notesList(r.notes)}`;
  }
  const last = r.rounds.length - 1;
  const ri = shownRound(r);
  const rd = r.rounds[ri], l = lean(r.cands, rd.votes, rd.total);
  // grey lines, as tonight: what the numbers are, and whether the seat changed party
  const facts = [rd.label, `${fmtInt(rd.total)} votes`];
  if (isNewSeat(r)) facts.push("New seat");
  if (ri !== last) facts.push(`decided in the ${r.rounds[last].kind === "runoff" ? "runoff" : "final round"}`);
  const w = r.cands[0].caucus;
  const flip = ri === last && r.held && r.held !== w
    ? `<p class="note"><strong>Flipped</strong> · ${CAUCUS_NAME[w]} gained the seat from the ${CAUCUS_NAME[r.held]}</p>` : "";
  // an earlier round: no winner yet; those in the next round advanced (→, bold)
  const mark = pastMark(r);
  return `<div class="cand">${peopleRows(r.cands, rd.votes, rd.total, rd.other, mark)}</div>
    <p class="note">${facts.join(" · ")}</p>${flip}${notesList(r.notes)}`;
}
export function countyBody(r, fips) {
  const v = r.counties?.[fips];
  if (!v) return `<p class="empty">No county figures for this race.</p>${notesList(r.notes)}`;
  const n = r.cands.length, l = countyLean(r, fips), cr = r.rounds[r.county_round];
  let note = `County figures: ${cr.label}.`;
  if (r.county_round !== r.rounds.length - 1) note += ` The seat was decided in the ${r.rounds[r.rounds.length - 1].kind === "runoff" ? "runoff" : "ranked-choice count"}, which has no county figures.`;
  return `<div class="cand">${peopleRows(r.cands, v.slice(0, n), v[n + 1], v[n], l.lead)}</div>
    <p class="note">${fmtInt(v[n + 1])} votes · ${note}</p>${notesList(r.notes)}`;
}
