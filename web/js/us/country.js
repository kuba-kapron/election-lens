// The United States for the shared page (see web/js/country.js for what each part does):
// president, Senate, House and governors; states and counties (House districts); the 2026
// election night. Loading this module loads the US data (us/data.js).
import { state } from "../state.js";
import { H, LIVE_YEAR, W, curYears, data, ensureData, liveFile, loadLive, path, stateById } from "./data.js";
import { SINGLE, atLarge, isLive, stateOf } from "./rules.js";
import { ckey, colors, readColors } from "./colors.js";
import { flagBox } from "../components.js";
import { COUNTRY, countyName, districtName, drawPhotoCredits, liveTag } from "./components.js";
import { drawArrows, drawSelection, usBeforeDraw, usLayers, usZoom } from "./map.js";
import { drawPlaces, initPlaces } from "./places.js";
import { drawLiveSources } from "./live.js";
import { fillTrail } from "./trail.js";
import { render, select } from "../actions.js";
import { setCmap, setLevel, setMode, setOffice, setYear, syncToggles, usBeforeSelect, zoomTarget } from "./actions.js";
import { readHash, writeHash } from "./hash.js";
import { usView } from "./views/index.js";

export default {
  name: COUNTRY.name,
  flag: COUNTRY.flag,
  W, H, path,
  view: usView,
  years: curYears,
  setYear,
  async start() {
    readHash(true);
    // the Senate file labels midterm years in the ribbon; the live file labels 2026
    await Promise.all([ensureData(state.office), ensureData("senate"), loadLive(+state.year === LIVE_YEAR ? state.office : "senate")]);
    readHash();
    await ensureData(state.office, state.year);
    initPlaces();

    // re-read the results file every 30 seconds; redraw only when it changed
    setInterval(async () => {
      if (!isLive()) return;
      const before = liveFile()?.updated;
      await loadLive(state.office);
      if (liveFile()?.updated !== before) render({ years: true, map: true, panel: true });
    }, 30000);

    document.querySelectorAll("[data-office]").forEach(b => b.addEventListener("click", () => setOffice(b.dataset.office)));
    document.querySelectorAll("[data-mode]").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));
    document.querySelectorAll("[data-level]").forEach(b => b.addEventListener("click", () => setLevel(b.dataset.level)));
    document.querySelectorAll("[data-cmap]").forEach(b => b.addEventListener("click", () => setCmap(b.dataset.cmap)));
    document.querySelectorAll("[data-round]").forEach(b => b.addEventListener("click", () => {
      state.firstRound = b.dataset.round === "november";
      render({ toggles: true, map: true, panel: true, hash: true });
    }));
    window.addEventListener("hashchange", async () => {
      readHash(true);
      await ensureData(state.office);
      readHash();
      await ensureData(state.office, state.year);
      render({ toggles: true, headline: true, years: true, map: true });
      select(state.sel, true);
    });
  },
  // the year ribbon: the winner's color; "Live" next to 2026
  yearFill: r => colors[ckey(r.party) + "Solid"],
  yearTag: y => (y === LIVE_YEAR ? liveTag() : ""),
  // the map
  mapLayers: usLayers,
  onZoom: usZoom,
  onZoomEnd: drawPlaces,
  beforeDraw: usBeforeDraw,
  drawSelection,
  drawArrows,
  zoomTarget,
  beforeSelect: usBeforeSelect,
  // hovering over a state at country level outlines the whole state
  hoverShape: t => (t.type === "state" ? stateById.get(t.id) : null),
  // "United States › Ohio › Franklin County" (or "› 5th district")
  crumbs(sel) {
    const st = stateOf(sel), parts = [[{ type: "nation" }, `${flagBox()}${COUNTRY.name}`]];
    if (st) parts.push([{ type: "state", id: st }, data.states[st].name]);
    if (sel.type === "county" && !SINGLE.has(st)) parts.push([sel, countyName(sel.id)]);
    if (sel.type === "district" && !atLarge(st)) parts.push([sel, `${districtName(sel.id, true)} district`]);
    return parts;
  },
  // counties and districts are the lowest level: their Races card is their state's
  hasList: sel => sel.type !== "county" && sel.type !== "district",
  parentOf: sel => (sel.type === "state" ? { type: "nation" } : { type: "state", id: stateOf(sel) }),
  // an at-large state is marked by its one district's row
  listKey: sel => (sel.type === "state" && atLarge(sel.id) ? `district:${sel.id}-00` : null),
  // tonight: the footer's sources before the panel, the race chart after it
  beforePanel: () => { if (isLive()) drawLiveSources(); },
  afterPanel: () => { if (isLive()) fillTrail(); },
  afterCards: drawPhotoCredits,
  // History bars: up and blue for Democrats, down and red for Republicans
  barFill: m => (m >= 0 ? colors.demSolid : colors.gopSolid),
  finder: {
    label: "Find a state",
    listLabel: "States",
    none: q => `No state matches “${q}”`,
    items: () => Object.entries(data.states).map(([id, s]) => ({ id, name: s.name, abbr: s.abbr })),
    pick: id => ({ type: "state", id }),
    current: () => (state.sel.type === "state" ? data.states[state.sel.id].name : ""),
  },
  syncToggles,
  writeHash,
  readColors,
};
