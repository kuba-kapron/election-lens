// The US map's own layers: counties, House districts and states, flip stripes, shift arrows,
// and what a click picks and how the selection shows (the shared part is web/js/map.js).
import { state } from "../state.js";
import { view } from "../country.js";
import { counties, ct2023, nationOutline, path, shapeById, stateById, stateMesh, states } from "./data.js";
import { SINGLE, atLarge, districtShape, shift, stateOf } from "./rules.js";
import { colors } from "./colors.js";
import { defs, gArrows, gPlaces, mapHandlers, selPath, svg } from "../map.js";
import { placeScale } from "./places.js";

// the county shapes of a year's map (each view picks: see views/)
export const visibleShapes = y => view().countyShapes(y);
// from 2024 Connecticut reports by planning region, not county
export const withNewConnecticut = y => (y === 2024 ? counties.filter(f => f.properties.st !== "09").concat(ct2023) : counties);

export function drawPatterns() {
  for (const p of ["dem", "gop", "ind"]) {
    const pat = defs.selectAll(`pattern#flip-${p}`).data([p]).join(enter => {
      const e = enter.append("pattern").attr("id", `flip-${p}`).attr("patternUnits", "userSpaceOnUse")
        .attr("width", 6).attr("height", 6).attr("patternTransform", "rotate(45)");
      e.append("rect").attr("width", 6).attr("height", 6);
      e.append("rect").attr("class", "stripe").attr("width", 3).attr("height", 6);
      return e;
    });
    pat.select("rect").attr("fill", colors[p][0]);
    pat.select("rect.stripe").attr("fill", colors[p + "Solid"]);
  }
  sizeStripes();
}
// flip stripes keep one screen size (6px per stripe pair) at every zoom and screen width,
// like the city names; without this they shrink with the map on phones
export function sizeStripes(k = d3.zoomTransform(svg.node()).k) {
  defs.selectAll("pattern").attr("patternTransform", `rotate(45) scale(${placeScale() / k})`);
}
// the layers under the shared overlays: counties, House districts, states (used when the map is
// colored by state), then the state lines and the country's outline
export let gCounties, gDistricts, gStates;
export function usLayers(g, before) {
  gCounties = g.insert("g", before);
  gDistricts = g.insert("g", before);
  gStates = g.insert("g", before);
  g.insert("path", before).attr("class", "states").attr("d", path(stateMesh));
  g.insert("path", before).attr("class", "states").attr("d", path(nationOutline)).style("stroke", "none");
}
// while zooming: arrows, city names and stripes keep their screen size
export function usZoom(k) {
  gArrows.style("--inv", 1 / k);
  gPlaces.style("--inv", placeScale() / k);
  sizeStripes(k);
}
// before a view colors the map: the stripes in this theme's colors, districts or counties shown
export function usBeforeDraw() {
  const v = view();
  drawPatterns();
  gDistricts.style("display", v.districts ? null : "none");
  gCounties.style("display", v.districts ? "none" : null);
}
// the map's shapes, made once (county and state outlines do not change between years)
export const countyPaths = () => gCounties.selectAll("path.county").data(visibleShapes(state.year), f => f.properties.id)
  .join(enter => enter.append("path").attr("class", "county").attr("d", path).call(mapHandlers));
export const statePaths = () => gStates.selectAll("path.state-fill").data(states, f => f.properties.st)
  .join(enter => enter.append("path").attr("class", "state-fill").attr("d", path).call(mapHandlers));

// One arrow per area: left and up = toward Democrats, right and up = toward Republicans,
// longer = bigger shift. Shown in Shift view when the Arrows toggle is on.
export const centroids = new Map();
export const centroidOf = f => {
  const key = f.properties.id ?? "st" + f.properties.st;
  if (!centroids.has(key)) centroids.set(key, path.centroid(f));
  return centroids.get(key);
};
export function drawArrows() {
  const on = view().shift && state.mode === "shift" && state.arrows;
  gArrows.style("display", on ? null : "none");
  d3.select("#map").classed("arrows-on", on).classed("by-states", state.level === "states");
  if (!on) { gArrows.selectAll("*").remove(); return; }
  const y = String(state.year), st = stateOf(state.sel), open = st && !SINGLE.has(st);
  // arrows follow what the map colors: states, or the counties of the opened state
  let items;
  if (state.level === "states" && !open) items = states.map(f => ({ f, v: shift({ type: "state", id: f.properties.st }, y) }));
  else items = visibleShapes(state.year)
    .filter(f => !st || f.properties.st === st)
    .map(f => ({ f, v: shift({ type: "county", id: f.properties.id }, y) }));
  items = items.filter(d => d.v != null && Math.abs(d.v) >= 0.001);
  // states get longer arrows; thousands of county arrows need to be shorter to stay readable
  const bigArrows = state.level === "states" && !open;
  const perPoint = bigArrows ? 2.2 : 1.2, maxLen = bigArrows ? 40 : 22;
  const len = v => Math.min(maxLen, Math.abs(v) * 100 * perPoint);
  gArrows.classed("fine", !bigArrows);
  gArrows.selectAll("g.arrow").data(items, d => d.f.properties.id ?? d.f.properties.st)
    .join(enter => {
      const a = enter.append("g").attr("class", "arrow");
      a.append("path");
      return a;
    })
    .attr("transform", d => { const [x, yy] = centroidOf(d.f); return `translate(${x},${yy})`; })
    .select("path")
    .attr("stroke", d => (d.v > 0 ? colors.demSolid : colors.gopSolid))
    .attr("d", d => {
      const L = len(d.v), dir = d.v > 0 ? -1 : 1; // Democrats left, Republicans right
      const dx = dir * L * 0.82, dy = -L * 0.57;           // about 35 degrees above level
      const ux = dx / L, uy = dy / L, h = Math.min(5, 2 + L * 0.15); // arrowhead
      const bx = dx - ux * h, by = dy - uy * h, px = -uy * h * 0.6, py = ux * h * 0.6;
      return `M0,0L${dx},${dy}M${bx + px},${by + py}L${dx},${dy}L${bx - px},${by - py}`;
    });
}

// At country level a click picks the state; inside the chosen state it picks a county
export function countyTarget(f) {
  const st = f.properties.st;
  const inState = stateOf(state.sel) === st;
  if (!inState || SINGLE.has(st)) return { type: "state", id: st };
  return { type: "county", id: f.properties.id };
}

export function drawSelection() {
  const s = state.sel;
  const f = s.type === "county" ? shapeById.get(s.id) : s.type === "state" ? stateById.get(s.id)
    : s.type === "district" ? districtShape(s.id) : null;
  selPath.attr("d", f ? path(f) : null);
  const st = stateOf(s);
  gDistricts.selectAll("path.district")
    .classed("dim", d => !!st && d.properties.st !== st)
    .classed("pickable", d => d.properties.st === st && !atLarge(st));
  gCounties.selectAll("path.county")
    .classed("dim", d => !!st && d.properties.st !== st)
    // only counties a click would pick get a county outline on hover
    .classed("pickable", d => d.properties.st === st && !SINGLE.has(st));
  // States view: the chosen state opens up to show its counties
  gStates.style("display", state.level === "states" && !view().districts ? null : "none")
    .selectAll("path.state-fill")
    .style("display", d => (d.properties.st === st && !SINGLE.has(st) ? "none" : null))
    .classed("dim", d => !!st && d.properties.st !== st);
}
