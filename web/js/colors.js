// Colors read from the CSS, and the color of each place or race on the map.
import { state } from "./state.js";
import { stepOf } from "./format.js";
import { counted, flippedFrom, isLive, margin, pickup, raceLean, record, runoffOf, seatParty, shift, shownRound, stateWinner } from "./rules.js";

// colors (read from CSS so dark mode follows)
export let colors;
export function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const v = n => cs.getPropertyValue(n).trim();
  const neutral = v("--neutral"), dem = v("--dem"), gop = v("--gop");
  const steps = t => d3.interpolateLab(neutral, t);
  // on a dark page the lightest steps would sink into the background, so they start stronger
  const dark = cs.getPropertyValue("color-scheme").trim() === "dark";
  const stops = dark ? [0.4, 0.55, 0.7, 0.85, 1] : [0.22, 0.42, 0.62, 0.82, 1];
  const ramp = c => stops.map(k => steps(c)(k));
  const ind = v("--ind");
  colors = { dem: ramp(dem), gop: ramp(gop), ind: ramp(ind), nodata: v("--nodata"), demSolid: dem, gopSolid: gop, indSolid: ind,
    grnSolid: v("--grn"), libSolid: v("--lib"), pending: v("--pending"), runoff: v("--runoff"),
    ink: v("--ink"), bg: v("--bg") };
}
readColors();

export const BINS = {
  margin: [0.05, 0.15, 0.3, 0.5],   // vote-share margin
  shift: [0.02, 0.05, 0.1, 0.2],    // change in margin
};
export function color(val) {
  if (val == null || Number.isNaN(val)) return colors.nodata;
  return (val >= 0 ? colors.dem : colors.gop)[stepOf(Math.abs(val), BINS[state.mode])];
}
export function value(id, y) {
  const sel = { type: "county", id };
  return state.mode === "margin" ? margin(record(sel, y)) : shift(sel, y);
}
// president map, Winner: states solid for a hold, striped for a flip (states only; counties show the margin)
export const categorical = () => state.cmap === "winner" && state.level === "states" && state.mode === "margin";
export function stateFill(st, y) {
  if (!categorical()) return color(stateValue(st, y));
  const w = stateWinner(st, y);
  return flippedFrom(st, y) ? `url(#flip-${w})` : colors[w + "Solid"];
}
export function stateValue(st, y) {
  const sel = { type: "state", id: st };
  return state.mode === "margin" ? margin(record(sel, y)) : shift(sel, y);
}

// Seats are colored by caucus: independents who caucus with the Democrats in Democratic blue,
// other independents in their own color. Margin = winner's lead over the runner-up.
export const CAUCUS_KEY = { D: "dem", R: "gop" };
export const ckey = c => CAUCUS_KEY[c] || "ind";
// a candidate's color in bars: Greens and Libertarians in their own colors, the rest by caucus
export const candFill = c => (c.party === "G" ? colors.grnSolid : c.party === "L" ? colors.libSolid : colors[ckey(c.caucus) + "Solid"]);
export function leanColor(l) {
  if (!l) return colors.nodata;
  return colors[ckey(l.caucus)][stepOf(l.m, BINS.margin)];
}
// solid winner color; stripes when a seat changed party (Senate seat history; House: same district, same map)
// past years at the November round: a race that went on to a runoff (or a later ranked-choice
// round) had no winner yet. Winner: Runoff grey, or the party when all who advanced share it
export function pastFill(r) {
  if (!r) return colors.nodata;
  const ri = shownRound(r);
  if (!congressCategorical()) return leanColor(raceLean(r));
  if (ri === r.rounds.length - 1) return seatFill(r);
  const adv = r.cands.filter((c, i) => r.rounds[ri + 1].votes[i] > 0);
  return adv.length && adv.every(c => c.caucus === adv[0].caucus) ? colors[ckey(adv[0].caucus) + "Solid"] : colors.runoff;
}
export function seatFill(r) {
  const w = ckey(r.cands[0].caucus);
  return r.held && r.held !== r.cands[0].caucus ? `url(#flip-${w})` : colors[w + "Solid"];
}
export const congressCategorical = () => !isLive() && state.cmap === "winner" &&
  (state.office === "house" || (state.level === "states" && state.sel.type === "nation"));

// a race's color on the map: tonight's rules, or a past year's
export const raceFill = r => (isLive() ? liveFill(r) : pastFill(r));
export function liveFill(r) {
  if (!r) return colors.nodata;
  if (state.cmap === "margin") return counted(r) ? leanColor(raceLean(r)) : colors.pending;
  const party = seatParty(r);
  if (party) return pickup(r) ? `url(#flip-${ckey(party)})` : colors[ckey(party) + "Solid"];
  if (runoffOf(r)) return colors.runoff;  // a runoff between parties: undecided
  if (!counted(r)) return colors.pending;
  return colors[ckey(raceLean(r).caucus)][1]; // leading, not called: one light shade
}
