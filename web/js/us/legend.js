// The legend of US race maps (Senate, House, governors; past years and tonight).
// the asterisk note under the map legend: seats left out of flips and pickups
import { state } from "../state.js";
import { counted, heldBy, isLive, pickup, raceLean, runoffOf, seatParty } from "./rules.js";
import { BINS, colors, congressCategorical, pastFill } from "./colors.js";

export function flipNote(unknown, any, what, why) {
  if (!unknown || !any) return "";
  return `<span class="legend-note">* Leaves out ${unknown} ${unknown === 1 ? what.replace(/s$/, "") : what} with no earlier result to compare${why ? ` (${why})` : ""}.</span>`;
}
// One legend for Senate, House and governor maps, past years and tonight. Differences: "Pickup"
// tonight vs "Flipped" for past years, and tonight's own keys (leading, no votes yet).
// The view gives: shown (the races on the map), noRace (a key for states without one) and
// note(shown, heldOf) (the asterisk note: seats left out of the pickups)
export function raceLegend({ shown, noRace: hasNoRace, note }) {
  const live = isLive();
  const winnerOf = r => (live ? (seatParty(r) ?? (runoffOf(r) ? null : counted(r) ? raceLean(r).caucus : null)) : r.cands[0]?.caucus);
  const heldOf = r => (live ? heldBy(r)?.caucus : r.held);
  const box = fill => `<svg class="sw" viewBox="0 0 26 10" aria-hidden="true"><rect width="26" height="10" fill="${fill}"/></svg>`;
  const key = (fills, text, title = "") => `<span class="key"${title ? ` title="${title}"` : ""}>${fills.map(box).join("")}${text}</span>`;
  const noRace = hasNoRace ? key([colors.nodata], state.level === "counties" ? "No race or no county figures" : "No race") : "";
  const pending = live ? key([colors.pending], "No votes counted yet") : "";
  const winnerView = live ? state.cmap === "winner" : congressCategorical();
  if (winnerView) {
    // the colors say the party; the keys say won, leading or changed party
    const ind = shown.some(r => winnerOf(r) === "I");
    const items = [key([colors.demSolid, colors.gopSolid].concat(ind ? [colors.indSolid] : []), "Won", live ? "Called by a news organization" : "")];
    if (live) items.push(key([colors.dem[1], colors.gop[1]].concat(ind ? [colors.ind[1]] : []), "Leading", "Not called yet: ahead in the votes counted so far"));
    const flipped = shown.some(r => live ? pickup(r) : r.held && r.held !== r.cands[0].caucus);
    const star = note(shown, heldOf);
    if (flipped) items.push(key(["url(#flip-dem)", "url(#flip-gop)"], `${live ? "Pickup" : "Flipped"}${star ? "*" : ""}`,
      live ? "Called, and the seat changes party" : "The seat changed party"));
    // tonight: a runoff called between parties; past years: races at their November round
    const pastRunoff = !live && state.firstRound && shown.some(r => r.rounds.length > 1 && pastFill(r) === colors.runoff);
    if (pastRunoff || (live && shown.some(r => runoffOf(r) && !seatParty(r)))) items.push(key([colors.runoff], "Runoff", "Went to a runoff between candidates of different parties"));
    return items.join("") + pending + noRace + (flipped ? star : "");
  }
  const b = BINS.margin;
  const swatch = arr => arr.map(c => `<span style="background:${c}"></span>`).join("");
  let html = `<span>Republican +50</span><span class="ramp">${swatch([...colors.gop].reverse()) + swatch(colors.dem)}</span><span>Democratic +50</span>`;
  if (shown.some(r => r.cands.slice(0, 2).some(c => c.caucus === "I"))) html += `<span class="key"><span class="ramp">${swatch(colors.ind)}</span>Independent</span>`;
  html += `<span>Lead over the runner-up; steps at ${b.map(x => x * 100).join(", ")} points</span>`;
  return html + pending + noRace;
}
