// Shareable links.
import { state } from "./state.js";
import { HAS, LIVE_YEAR, OFFICES, curYears, data, officeFor } from "./us/data.js";
import { houseRaces } from "./us/rules.js";
import { view } from "./us/views/index.js";

// shareable links: #race=senate&year=2024&view=shift&map=counties&vote=popular&place=48201
// defaults (president, margin, states, ec, regular seat) are left out of the link
export function writeHash() {
  const p = new URLSearchParams();
  if (state.office !== "president") p.set("race", state.office);
  p.set("year", state.year);
  if (state.mode !== "margin") p.set("view", state.mode);
  if (state.level !== "states") p.set("map", state.level);
  if (state.cmap !== "winner") p.set("color", state.cmap);
  if (state.arrows) p.set("arrows", "on");
  if (state.sel.type !== "nation") p.set("place", state.sel.id);
  if (state.seat !== "regular") p.set("seat", state.seat);
  if (state.firstRound) p.set("round", "november");
  history.replaceState(null, "", location.pathname + location.search + "#" + p.toString());
}
// early: read only the office and year, so their data can be loaded before the rest is checked
export function readHash(early = false) {
  const h = location.hash.slice(1);
  let y, m, id, lv, vt, race, seat, cm;
  if (h.includes("=")) {
    const p = new URLSearchParams(h);
    [y, m, id, lv, vt, race, seat, cm] = ["year", "view", "place", "map", "vote", "race", "seat", "color"].map(k => p.get(k));
    state.arrows = p.get("arrows") === "on";
    state.firstRound = p.get("round") === "november";
  } else {
    [y, m, id] = h.split("/"); // older links: #2024/margin/48201
  }
  if (race === "live") { race = "senate"; y = y || String(LIVE_YEAR); }
  state.office = OFFICES.includes(race) ? race : "president";
  if (early) {
    if (+y) state.year = +y;
    return;
  }
  const ys = curYears();
  // no year in the link: the latest year that has this race
  state.year = ys.includes(+y) ? +y : [...ys].reverse().find(x => HAS[state.office](x) && x !== LIVE_YEAR) ?? ys[ys.length - 1];
  state.office = officeFor(state.year, state.office);
  const v = view();
  state.mode = v.shift && m === "shift" ? "shift" : "margin";
  if (!v.shift) state.arrows = false;
  state.level = lv === "counties" && !v.districts ? "counties" : "states";
  // older links: vote=popular (the panel's Popular vote tab) also colored the map by margin
  state.cmap = cm === "margin" || vt === "popular" ? "margin" : "winner";
  state.seat = seat === "special" || seat === "governor" ? seat : "regular";
  if (id && id.length === 2 && data.states[id]) state.sel = { type: "state", id };
  else if (id && id.includes("-") && v.districts && houseRaces(state.year)[id]) state.sel = { type: "district", id };
  else if (id && !v.districts && data.counties[id]) state.sel = { type: "county", id };
  else state.sel = { type: "nation" };
}
