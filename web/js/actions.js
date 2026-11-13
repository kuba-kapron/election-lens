// Changing what is on screen and redrawing it (the US map tools and race switching: us/actions.js).
import { state } from "./state.js";
import { country, view } from "./country.js";
import { drawMap, drawMapExtras, zoomTo } from "./map.js";
import { drawYears } from "./nav.js";
import { drawCrumbs, drawPanel, panel } from "./panel.js";
import { syncFinder } from "./finder.js";

// Redraw what a change affects, always in the same order: the map tools, the page headline,
// the year ribbon, the map, the panel and its cards, then the link in the address bar
export function render({ toggles, headline, years, map, panel, hash } = {}) {
  if (toggles) country.syncToggles();
  if (headline) drawHeadline();
  if (years) drawYears();
  if (map) drawMap();
  if (panel) drawPanel();
  if (hash) country.writeHash();
}
export function select(sel, zoomIt = false) {
  country.beforeSelect?.(sel);
  state.sel = sel;
  if (zoomIt || sel.type === "nation") zoomTo(...country.zoomTarget(sel));
  syncFinder();
  drawCrumbs();
  if (view().redrawOnSelect) drawMap();
  else drawMapExtras();
  render({ panel: true, hash: true });
}
// the page's headline, the line under it and the browser tab's title (see views/)
export function drawHeadline() {
  const [title, dek, tab] = view().headline();
  document.getElementById("headline").innerHTML = title;
  document.getElementById("dek").textContent = dek;
  document.title = tab;
}
