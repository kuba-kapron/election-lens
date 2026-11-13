// The US map tools and moving between years and races: Winner | Margin | Shift, Arrows,
// States | Counties, November | Final, the race buttons and the footer's sources.
// map options the race's view does not have: no Shift view, or no county map (districts instead)
import { state, ui } from "../state.js";
import { view } from "../country.js";
import { HAS, WHY_NOT, ensureData, officeFor, shapeById, stateById, yearFor } from "./data.js";
import { districtShape, houseRaces, isLive, stateOf } from "./rules.js";
import { drawArrows } from "./map.js";
import { render, select } from "../actions.js";
import { writeHash } from "./hash.js";

function fitOptions(o) {
  if (!view(o).shift) { state.mode = "margin"; state.arrows = false; }
  if (view(o).districts && state.level === "counties") state.level = "states";
}
// a new year keeps the race type when that year has it (else president, else Senate)
export async function setYear(y) {
  const o = officeFor(y, state.office);
  await ensureData(o, y);
  const officeChanged = o !== state.office;
  state.year = y;
  state.office = o;
  fitOptions(o);
  // a district number means a different place after redistricting: go back to its state
  if (state.sel.type === "district" && (!view(o).districts || !houseRaces(y)[state.sel.id])) state.sel = { type: "state", id: stateOf(state.sel) };
  if (state.sel.type === "county" && view(o).districts) state.sel = { type: "state", id: stateOf(state.sel) };
  render({ toggles: true, headline: true, years: true, map: true });
  select(state.sel, officeChanged);
}
export async function setOffice(o) {
  if (o === state.office) return;
  const y = HAS[o](state.year) ? state.year : yearFor(o, state.year);
  await ensureData(o, y);
  state.year = y;
  state.office = o;
  state.seat = "regular";
  fitOptions(o);
  // keep the chosen state; a county or district only makes sense in its own office
  const st = stateOf(state.sel);
  state.sel = st ? { type: "state", id: st } : { type: "nation" };
  render({ toggles: true, headline: true, years: true, map: true });
  select(state.sel, true);
}
export const arrowsBtn = document.getElementById("arrows");
export function syncToggles() {
  // the president's map has one Winner | Margin | Shift control; the other races Winner | Margin
  const v = view(), pres = v.shift;
  document.querySelectorAll("[data-office]").forEach(b => {
    // every race can be picked: one without this year opens its nearest year
    const o = b.dataset.office, ok = HAS[o](state.year);
    b.setAttribute("aria-checked", String(o === state.office));
    b.title = ok ? "" : `${WHY_NOT[o](state.year)}: opens ${yearFor(o, state.year)}`;
  });
  // November | Final: only in a year where some race went to a runoff or a ranked-choice count
  const roundsHere = !isLive() && v.roundRaces().some(r => r.rounds?.length > 1);
  document.getElementById("round-toggle").hidden = !roundsHere;
  document.querySelectorAll("[data-round]").forEach(b => b.setAttribute("aria-checked", String((b.dataset.round === "november") === !!state.firstRound)));
  const shown = state.mode === "shift" ? "shift" : state.level === "counties" ? "margin" : state.cmap;
  document.querySelectorAll("[data-mode]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.mode === shown)));
  document.querySelectorAll("[data-level]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.level === state.level)));
  // Senate and House show the margin only (no Shift yet); the House map is by district
  document.querySelector("[data-mode]").parentElement.hidden = !pres;
  document.getElementById("level-toggle").hidden = v.districts;
  document.querySelectorAll("[data-cmap]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.cmap === state.cmap)));
  // Winner | Margin: Senate, House and governor maps of races (not county figures)
  document.getElementById("cmap-toggle").hidden = pres || (!v.districts && state.level === "counties");
  arrowsBtn.hidden = !pres || state.mode !== "shift";
  // footer: only the sources of what is on screen (plus the lines every view needs)
  const src = isLive() ? "live" : state.office;
  document.querySelectorAll(".colophon [data-src]").forEach(el => { el.hidden = !el.dataset.src.split(" ").includes(src); });
  arrowsBtn.setAttribute("aria-pressed", String(state.arrows));
}
arrowsBtn.addEventListener("click", () => {
  state.arrows = !state.arrows;
  syncToggles();
  drawArrows();
  writeHash();
});
// president: Winner | Margin | Shift in one control (Winner and Margin share the margin view)
export function setMode(m) {
  ui.histMode = null;
  if (m === "shift") state.mode = "shift";
  else {
    state.mode = "margin";
    state.cmap = m;
    if (m === "winner" && state.level === "counties") state.level = "states"; // Winner colors states
  }
  render({ toggles: true, map: true, panel: true, hash: true });
}
export function setLevel(l) {
  state.level = l;
  render({ toggles: true, map: true, hash: true });
}
export function setCmap(c) {
  state.cmap = c;
  ui.histMode = null;
  render({ toggles: true, years: true, map: true, panel: true, hash: true });
}
// a selection's zoom: a county or district closer than a state (its neighbors stay visible)
export function zoomTarget(sel) {
  const st = stateOf(sel);
  if (sel.type === "county") return [shapeById.get(sel.id), 0.3];
  if (sel.type === "district") return [districtShape(sel.id), 0.5];
  return [st ? stateById.get(st) : null];
}
// another state: back to its regular Senate race
export function usBeforeSelect(sel) {
  if (stateOf(sel) !== stateOf(state.sel)) state.seat = "regular";
}
