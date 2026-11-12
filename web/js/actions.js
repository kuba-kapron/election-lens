// Changing what is on screen and redrawing it.
import { state, ui } from "./state.js";
import { HAS, WHY_NOT, ensureData, officeFor, shapeById, stateById, yearFor, years } from "./data.js";
import { districtShape, hRaces, houseRaces, isLive, sYear, stateOf } from "./rules.js";
import { headline } from "./components.js";
import { drawArrows, drawMap, drawMapExtras, zoomTo } from "./map.js";
import { drawYears } from "./nav.js";
import { drawCrumbs, drawPanel, panel } from "./panel.js";
import { syncFinder } from "./finder.js";
import { writeHash } from "./hash.js";

// Redraw what a change affects, always in the same order: the map tools, the page headline,
// the year ribbon, the map, the panel and its cards, then the link in the address bar
export function render({ toggles, headline, years, map, panel, hash } = {}) {
  if (toggles) syncToggles();
  if (headline) drawHeadline();
  if (years) drawYears();
  if (map) drawMap();
  if (panel) drawPanel();
  if (hash) writeHash();
}
export function select(sel, zoomIt = false) {
  if (stateOf(sel) !== stateOf(state.sel)) state.seat = "regular";
  state.sel = sel;
  if (zoomIt || sel.type === "nation") {
    const st = stateOf(sel);
    if (sel.type === "county") zoomTo(shapeById.get(sel.id), 0.3);
    else if (sel.type === "district") zoomTo(districtShape(sel.id), 0.5);
    else zoomTo(st ? stateById.get(st) : null);
  }
  syncFinder();
  drawCrumbs();
  if (state.office !== "president") drawMap(); // a Senate state's counties follow the race chosen in the panel
  else drawMapExtras();
  render({ panel: true, hash: true });
}
// a new year keeps the race type when that year has it (else president, else Senate)
export async function setYear(y) {
  const o = officeFor(y, state.office);
  await ensureData(o, y);
  const officeChanged = o !== state.office;
  state.year = y;
  state.office = o;
  if (o !== "president") { state.mode = "margin"; state.arrows = false; }
  if (o === "house" && state.level === "counties") state.level = "states";
  // a district number means a different place after redistricting: go back to its state
  if (state.sel.type === "district" && (o !== "house" || !houseRaces(y)[state.sel.id])) state.sel = { type: "state", id: stateOf(state.sel) };
  if (state.sel.type === "county" && o === "house") state.sel = { type: "state", id: stateOf(state.sel) };
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
  if (o !== "president") { state.mode = "margin"; state.arrows = false; }
  // keep the chosen state; a county or district only makes sense in its own office
  const st = stateOf(state.sel);
  state.sel = st ? { type: "state", id: st } : { type: "nation" };
  if (o === "house" && state.level === "counties") state.level = "states";
  render({ toggles: true, headline: true, years: true, map: true });
  select(state.sel, true);
}
export const arrowsBtn = document.getElementById("arrows");
export function syncToggles() {
  const pres = state.office === "president";
  document.querySelectorAll("[data-office]").forEach(b => {
    // every race can be picked: one without this year opens its nearest year
    const o = b.dataset.office, ok = HAS[o](state.year);
    b.setAttribute("aria-checked", String(o === state.office));
    b.title = ok ? "" : `${WHY_NOT[o](state.year)}: opens ${yearFor(o, state.year)}`;
  });
  // November | Final: only in a year where some race went to a runoff or a ranked-choice count
  const roundsHere = !isLive() && (state.office === "senate" ? sYear() : state.office === "house" ? Object.values(hRaces()) : []).some(r => r.rounds?.length > 1);
  document.getElementById("round-toggle").hidden = !roundsHere;
  document.querySelectorAll("[data-round]").forEach(b => b.setAttribute("aria-checked", String((b.dataset.round === "november") === !!state.firstRound)));
  const shown = state.mode === "shift" ? "shift" : state.level === "counties" ? "margin" : state.cmap;
  document.querySelectorAll("[data-mode]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.mode === shown)));
  document.querySelectorAll("[data-level]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.level === state.level)));
  // Senate and House show the margin only (no Shift yet); the House map is by district
  document.querySelector("[data-mode]").parentElement.hidden = !pres;
  document.getElementById("level-toggle").hidden = state.office === "house";
  document.querySelectorAll("[data-cmap]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.cmap === state.cmap)));
  // Winner | Margin: Senate, House and governor maps of races (not county figures)
  document.getElementById("cmap-toggle").hidden = pres || (state.office !== "house" && state.level === "counties");
  arrowsBtn.hidden = !pres || state.mode !== "shift";
  // footer: only the sources of what is on screen (plus the lines every view needs)
  const view = isLive() ? "live" : state.office;
  document.querySelectorAll(".colophon [data-src]").forEach(el => { el.hidden = !el.dataset.src.split(" ").includes(view); });
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
export function drawHeadline() {
  const h = document.getElementById("headline"), dek = document.getElementById("dek");
  if (state.office === "president") {
    h.innerHTML = `How America voted, <span class="nowrap">2000 to 2024</span>`;
    dek.textContent = "Every presidential election since 2000, from the Electoral College down to the county. Click a state to see its counties, and a county to see how it has voted over time.";
  } else if (state.office === "senate" && !isLive()) {
    h.innerHTML = `How America voted for the Senate, <span class="nowrap">2020 to 2024</span>`;
    dek.textContent = "Every Senate race in 2020, 2022 and 2024, by state and county. About a third of the Senate is elected every two years.";
  } else if (state.office === "house" && !isLive()) {
    h.innerHTML = `How America voted for the House, <span class="nowrap">2020 to 2024</span>`;
    dek.textContent = "All 435 seats in 2020, 2022 and 2024, district by district.";
  } else {
    h.innerHTML = `Election night, <span class="nowrap">November 3, 2026</span>`;
    dek.textContent = (state.office === "governor" ? "36 states elect a governor."
      : state.office === "house" ? "All 435 seats, on this year's district maps (nine states drew new ones)."
      : "35 Senate seats are on the ballot, including special elections in Florida and Ohio.")
      + " Results from state election offices and civicAPI. Times are in your time zone.";
  }
  document.title = state.office === "president" ? "Election Lens"
    : isLive() ? "Election night 2026 · Election Lens" : `${state.office === "senate" ? "Senate" : "House"} results · Election Lens`;
}
