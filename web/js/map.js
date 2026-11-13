// The map: shapes, zoom, selection, arrows and badges.
import { state } from "./state.js";
import { H, W, counties, ct2023, nationOutline, path, shapeById, stateById, stateMesh, states } from "./us/data.js";
import { SINGLE, atLarge, districtShape, shift, stateOf } from "./us/rules.js";
import { colors } from "./colors.js";
import { drawPlaces, placeScale } from "./us/places.js";
import { showTip } from "./tooltip.js";
import { drawLegend } from "./legend.js";
import { select } from "./actions.js";
import { view } from "./us/views/index.js";

// the county shapes of a year's map (each view picks: see views/)
export const visibleShapes = y => view().countyShapes(y);
// from 2024 Connecticut reports by planning region, not county
export const withNewConnecticut = y => (y === 2024 ? counties.filter(f => f.properties.st !== "09").concat(ct2023) : counties);

export const svg = d3.select("#map").attr("viewBox", `0 0 ${W} ${H}`);
export const defs = svg.append("defs");
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
export const g = svg.append("g");
export const gCounties = g.append("g");
export const gDistricts = g.append("g"); // House districts
export const gStates = g.append("g"); // used when the map is colored by state
g.append("path").attr("class", "states").attr("d", path(stateMesh));
g.append("path").attr("class", "states").attr("d", path(nationOutline)).style("stroke", "none");
export const hoverPath = g.append("path").attr("class", "hover-state");
export const selPath = g.append("path").attr("class", "selected");
// badges inside Maine and Nebraska with the electoral votes the second candidate won there
export const gBadges = g.append("g").attr("class", "ev-badges");
// shift arrows: drawn in map coordinates, then scaled by 1/zoom so they keep their screen size
export const gArrows = g.append("g").attr("class", "arrows");
// city names (web/data/us/places.json, Natural Earth): on top, never catching clicks
export const gPlaces = g.append("g").attr("class", "places");

export const zoom = d3.zoom().scaleExtent([1, 32]).translateExtent([[0, 0], [W, H]])
  .on("zoom", e => {
    g.attr("transform", e.transform);
    gArrows.style("--inv", 1 / e.transform.k);
    gPlaces.style("--inv", placeScale() / e.transform.k);
    sizeStripes(e.transform.k);
    if (e.sourceEvent) hideTip();
  })
  .on("end", () => drawPlaces());
svg.call(zoom).on("dblclick.zoom", null);

// fill = share of the map the shape should take up (a county gets less, so its neighbors stay visible)
export function zoomTo(feature, fill = 0.85) {
  if (!feature) {
    svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity);
    return;
  }
  const [[x0, y0], [x1, y1]] = path.bounds(feature);
  const k = Math.max(1, Math.min(32, fill / Math.max((x1 - x0) / W, (y1 - y0) / H)));
  const t = d3.zoomIdentity.translate(W / 2, H / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
  svg.transition().duration(700).call(zoom.transform, t);
}

export const tip = document.getElementById("tip");
// Map clicks and the tooltip. Mouse: the tooltip follows the pointer, a click opens the place.
// Touch: the first tap shows the place's tooltip, a second tap on the same place opens it.
export let lastPointer = "mouse", tipKey = null;
export const placeKey = f => { const t = clickTarget(f); return `${t.type}:${t.id}`; };
export function hideTip() {
  tip.hidden = true;
  hoverPath.attr("d", null);
  tipKey = null;
}
export function mapHandlers(sel) {
  return sel
    .on("click", (e, f) => {
      if (lastPointer === "touch" && tipKey !== placeKey(f)) {
        showTip(e, f);
        tipKey = placeKey(f);
        return;
      }
      hideTip();
      select(clickTarget(f), true);
    })
    .on("mousemove", (e, f) => { if (lastPointer !== "touch") showTip(e, f); })
    .on("mouseleave", () => { if (lastPointer !== "touch") hideTip(); });
}
// what kind of pointer the next click comes from; 2: a tap outside the map's shapes closes the tooltip
window.addEventListener("pointerdown", e => {
  lastPointer = e.pointerType || "mouse";
  if (!e.target.closest?.("#map path")) hideTip();
}, true);
export const wrap = document.querySelector(".map-wrap");

export function drawMap() {
  const v = view();
  drawPatterns();
  gDistricts.style("display", v.districts ? null : "none");
  gCounties.style("display", v.districts ? "none" : null);
  v.drawShapes();
  drawMapExtras();
}
// the map's shapes, made once (county and state outlines do not change between years)
export const countyPaths = () => gCounties.selectAll("path.county").data(visibleShapes(state.year), f => f.properties.id)
  .join(enter => enter.append("path").attr("class", "county").attr("d", path).call(mapHandlers));
export const statePaths = () => gStates.selectAll("path.state-fill").data(states, f => f.properties.st)
  .join(enter => enter.append("path").attr("class", "state-fill").attr("d", path).call(mapHandlers));
// everything drawn over the colored shapes
export function drawMapExtras() {
  drawSelection();
  drawLegend();
  drawBadges();
  drawArrows();
}

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

export const drawBadges = () => view().badges();
// round badges inside states, one per item ({ st, xy }): the caller fills in color and text
export const badgeMarks = items => gBadges.selectAll("g.ev-badge").data(items, d => d.st)
  .join(enter => {
    const e = enter.append("g").attr("class", "ev-badge");
    e.append("circle").attr("r", 9);
    e.append("text").attr("text-anchor", "middle").attr("dy", 4);
    return e;
  })
  .attr("transform", d => `translate(${d.xy[0]},${d.xy[1]})`);
// what a click on a shape picks (each view decides: see views/)
export const clickTarget = f => view().target(f);
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
