// The legend under the map.
import { state } from "./state.js";
import { data, extra, redrawn } from "./data.js";
import { counted, hRaces, heldBy, houseRaces, isLive, isNewSeat, liveRaces, pickup, prevYear, raceLean, runoffOf, sYear, seatParty, senLike } from "./rules.js";
import { BINS, categorical, colors, congressCategorical, pastFill } from "./colors.js";

export function drawLegend() {
  if (state.office !== "president") return drawCongressLegend();
  if (categorical() && state.sel.type === "nation") {
    const y = state.year, p = prevYear(y);
    const box = fill => `<svg class="sw" viewBox="0 0 26 10" aria-hidden="true"><rect width="26" height="10" fill="${fill}"/></svg>`;
    const items = [[colors.demSolid, "Democratic"], [colors.gopSolid, "Republican"]];
    if (p) items.push(["url(#flip-dem)", `Flipped to Democratic since ${p}`], ["url(#flip-gop)", `Flipped to Republican since ${p}`]);
    document.getElementById("legend").innerHTML = items.map(([f, t]) => `<span class="key">${box(f)}${t}</span>`).join("");
    return;
  }
  const b = BINS[state.mode];
  const swatch = arr => arr.map(c => `<span style="background:${c}"></span>`).join("");
  const ends = state.mode === "margin"
    ? ["Republican +50", "Democratic +50"]
    : ["Toward Republicans", "Toward Democrats"];
  const note = state.mode === "margin"
    ? `Steps at ${b.map(x => x * 100).join(", ")} points`
    : prevYear(state.year) ? `Change in margin since ${prevYear(state.year)}; steps at ${b.map(x => x * 100).join(", ")} points` : "No earlier election to compare with 2000";
  // Shift view reads like the arrows: Democrats on the left, Republicans on the right
  const ramp = state.mode === "shift"
    ? swatch([...colors.dem].reverse()) + swatch(colors.gop)
    : swatch([...colors.gop].reverse()) + swatch(colors.dem);
  const [left, right] = state.mode === "shift" ? [ends[1], ends[0]] : ends;
  document.getElementById("legend").innerHTML =
    `<span>${left}</span><span class="ramp">${ramp}</span><span>${right}</span><span>${note}</span>`;
}

// the asterisk note under the map legend: seats left out of flips and pickups
export function flipNote(unknown, any, what, why) {
  if (!unknown || !any) return "";
  return `<span class="legend-note">* Leaves out ${unknown} ${unknown === 1 ? what.replace(/s$/, "") : what} with no earlier result to compare${why ? ` (${why})` : ""}.</span>`;
}
// House: the note under the legend names the redrawn states, where the previous holder is
// the incumbent or else the last winner of the district number, and new seats with no holder
export function houseNote(y) {
  const prevY = +y - 2;
  if (!extra.house?.races[String(prevY)]) return "";
  const sts = Object.keys(extra.plans?.[String(y)] || {}).filter(st => redrawn(st, y)).map(st => data.states[st].abbr).sort();
  if (!sts.length) return "";
  const fresh = Object.entries(houseRaces(y)).filter(([, r]) => isNewSeat(r)).map(([id]) => `${data.states[id.slice(0, 2)].abbr}-${+id.slice(3)}`);
  return `<span class="legend-note">* Redrawn since ${prevY} (${sts.length <= 12 ? sts.join(", ") : `${sts.length} states`}): against the incumbent, or else the last winner of the district number.${fresh.length ? ` New seats with no incumbent have no earlier holder: ${fresh.join(", ")}.` : ""}</span>`;
}
export function drawCongressLegend() {
  const el = document.getElementById("legend");
  raceLegend(el, isLive());
}
// One legend for Senate, House and governor maps, past years and tonight. Differences: "Pickup"
// tonight vs "Flipped" for past years, and tonight's own keys (leading, no votes yet).
export function raceLegend(el, live) {
  const sen = senLike(), house = state.office === "house";
  const shown = live ? (house ? Object.values(hRaces()) : liveRaces()) : (sen ? sYear() : Object.values(hRaces()));
  const winnerOf = r => (live ? (seatParty(r) ?? (runoffOf(r) ? null : counted(r) ? raceLean(r).caucus : null)) : r.cands[0]?.caucus);
  const heldOf = r => (live ? heldBy(r)?.caucus : r.held);
  const box = fill => `<svg class="sw" viewBox="0 0 26 10" aria-hidden="true"><rect width="26" height="10" fill="${fill}"/></svg>`;
  const key = (fills, text, title = "") => `<span class="key"${title ? ` title="${title}"` : ""}>${fills.map(box).join("")}${text}</span>`;
  const noRace = sen ? key([colors.nodata], state.level === "counties" ? "No race or no county figures" : "No race") : "";
  const pending = live ? key([colors.pending], "No votes counted yet") : "";
  const winnerView = live ? state.cmap === "winner" : congressCategorical();
  if (winnerView) {
    // the colors say the party; the keys say won, leading or changed party
    const ind = shown.some(r => winnerOf(r) === "I");
    const items = [key([colors.demSolid, colors.gopSolid].concat(ind ? [colors.indSolid] : []), "Won", live ? "Called by a news organization" : "")];
    if (live) items.push(key([colors.dem[1], colors.gop[1]].concat(ind ? [colors.ind[1]] : []), "Leading", "Not called yet: ahead in the votes counted so far"));
    const flipped = shown.some(r => live ? pickup(r) : r.held && r.held !== r.cands[0].caucus);
    const star = house ? houseNote(state.year)
      : flipNote(shown.filter(r => !heldOf(r)).length, shown.some(r => heldOf(r)), state.office === "governor" ? "races" : "seats", "");
    if (flipped) items.push(key(["url(#flip-dem)", "url(#flip-gop)"], `${live ? "Pickup" : "Flipped"}${star ? "*" : ""}`,
      live ? "Called, and the seat changes party" : "The seat changed party"));
    // tonight: a runoff called between parties; past years: races at their November round
    const pastRunoff = !live && state.firstRound && shown.some(r => r.rounds.length > 1 && pastFill(r) === colors.runoff);
    if (pastRunoff || (live && shown.some(r => runoffOf(r) && !seatParty(r)))) items.push(key([colors.runoff], "Runoff", "Went to a runoff between candidates of different parties"));
    el.innerHTML = items.join("") + pending + noRace + (flipped ? star : "");
    return;
  }
  const b = BINS.margin;
  const swatch = arr => arr.map(c => `<span style="background:${c}"></span>`).join("");
  let html = `<span>Republican +50</span><span class="ramp">${swatch([...colors.gop].reverse()) + swatch(colors.dem)}</span><span>Democratic +50</span>`;
  if (shown.some(r => r.cands.slice(0, 2).some(c => c.caucus === "I"))) html += `<span class="key"><span class="ramp">${swatch(colors.ind)}</span>Independent</span>`;
  html += `<span>Lead over the runner-up; steps at ${b.map(x => x * 100).join(", ")} points</span>`;
  el.innerHTML = html + pending + noRace;
}
