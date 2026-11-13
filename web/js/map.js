// The map every country shares: the SVG, zoom, the hover box and clicks, the selected outline,
// and badges, arrows and labels over the country's own layers (country.mapLayers).
import { country, view } from "./country.js";
import { showTip } from "./tooltip.js";
import { drawLegend } from "./legend.js";
import { select } from "./actions.js";

export const svg = d3.select("#map");
export const defs = svg.append("defs");
export const g = svg.append("g");
export const hoverPath = g.append("path").attr("class", "hover-state");
export const selPath = g.append("path").attr("class", "selected");
// round badges inside places (US: the electoral votes Maine and Nebraska split)
export const gBadges = g.append("g").attr("class", "ev-badges");
// shift arrows: drawn in map coordinates, then scaled by 1/zoom so they keep their screen size
export const gArrows = g.append("g").attr("class", "arrows");
// city names: on top, never catching clicks
export const gPlaces = g.append("g").attr("class", "places");

export const zoom = d3.zoom().scaleExtent([1, 32])
  .on("zoom", e => {
    g.attr("transform", e.transform);
    country.onZoom?.(e.transform.k);
    if (e.sourceEvent) hideTip();
  })
  .on("end", () => country.onZoomEnd?.());
// once the country is known: the map's size, and its layers under the overlays above
export function initMap() {
  const { W, H } = country;
  svg.attr("viewBox", `0 0 ${W} ${H}`);
  zoom.translateExtent([[0, 0], [W, H]]);
  country.mapLayers(g, ".hover-state");
  svg.call(zoom).on("dblclick.zoom", null);
}

// fill = share of the map the shape should take up (a county gets less, so its neighbors stay visible)
export function zoomTo(feature, fill = 0.85) {
  if (!feature) {
    svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity);
    return;
  }
  const { W, H, path } = country;
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

// the view colors the shapes (after the country's own preparation); the country draws the
// selection and any arrows
export function drawMap() {
  country.beforeDraw?.();
  view().drawShapes();
  drawMapExtras();
}
// everything drawn over the colored shapes
export function drawMapExtras() {
  country.drawSelection();
  drawLegend();
  drawBadges();
  country.drawArrows?.();
}

export const drawBadges = () => view().badges();
// round badges inside places, one per item ({ st, xy }): the caller fills in color and text
export const badgeMarks = items => gBadges.selectAll("g.ev-badge").data(items, d => d.st)
  .join(enter => {
    const e = enter.append("g").attr("class", "ev-badge");
    e.append("circle").attr("r", 9);
    e.append("text").attr("text-anchor", "middle").attr("dy", 4);
    return e;
  })
  .attr("transform", d => `translate(${d.xy[0]},${d.xy[1]})`);
// what a click on a shape picks (each view decides: see its views/)
export const clickTarget = f => view().target(f);
