// City names on the map.
import { site } from "./site.js";
import { state } from "./state.js";
import { H, W, projection } from "./data.js";
import { stateOf } from "./rules.js";
import { gPlaces, sizeStripes, svg } from "./map.js";

// Which cities get a name depends on the zoom: the largest metros for the whole country,
// more as you zoom in. Largest first; a name that would overlap one already placed is left
// out. Sizes are in screen pixels: the map's own units are scaled down on narrow screens.
// Three sizes by metro population (name and dot), and capitals marked as in an atlas: a star
// for Washington, a ring for state capitals (a selected state's capital always shows).
export const placeTier = pop => (pop >= 3e6 ? 0 : pop >= 5e5 ? 1 : 2);
export const PLACE_FS = [13, 11, 10], PLACE_R = [3.2, 2.4, 1.9];
export let places = [];
export const placeScale = () => W / (svg.node().getBoundingClientRect().width || W);  // map units per screen pixel
export function drawPlaces() {
  if (!places.length) return;
  const t = d3.zoomTransform(svg.node()), s = placeScale();
  gPlaces.style("--inv", s / t.k);
  const minPop = t.k < 1.5 ? 2.5e6 : t.k < 3 ? 4e5 : t.k < 8 ? 6e4 : 0;
  const max = t.k < 1.5 ? 10 : 18, placed = [], shown = [];
  // the selected state's cities first; neighbors after, in a quieter grey; Alaska and Hawaii
  // are insets that sit near other states, so their cities show only for themselves or the country
  const st = state.sel.type === "nation" ? null : stateOf(state.sel);
  const order = st ? places.filter(c => c.st === st).concat(places.filter(c => c.st !== st)) : places;
  // candidates in view, then names: a name may not cover another candidate's dot
  const cands = [];
  for (const c of order) {
    if (cands.length >= 60) break;
    const own = c.st === st;
    if (c.pop < minPop && !(own && (c.pop >= minPop / 4 || c.cap))) continue;
    if ((c.st === "02" || c.st === "15") && st && !own) continue;
    const [sx, sy] = t.apply(c.p);
    if (sx < 0 || sy < 0 || sx > W || sy > H) continue;
    cands.push({ c, sx, sy, own });
  }
  const dot = 3 * s;
  const hits = (b, o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1];
  for (const { c, sx, sy, own } of cands) {
    if (shown.length >= max) break;
    // label boxes in map-view units (screen pixels times s): right of the dot, else left, below, above
    const fs = PLACE_FS[c.tier], tw = (c.name.length * fs * (c.tier ? 0.58 : 0.62) + 5) * s, bh = (fs + 3) * s, d = (PLACE_R[c.tier] + 1) * s;
    const sides = [
      ["r", [sx - d, sy - bh / 2, sx + tw + d, sy + bh / 2]],
      ["l", [sx - tw - d, sy - bh / 2, sx + d, sy + bh / 2]],
      ["b", [sx - tw / 2, sy - d, sx + tw / 2, sy + bh + d]],
      ["t", [sx - tw / 2, sy - bh - d, sx + tw / 2, sy + d]]];
    // a city whose dot is already under a bigger city's name is left out
    if (placed.some(o => hits([sx - dot, sy - dot, sx + dot, sy + dot], o))) continue;
    const free = sides.filter(([, b]) => b[0] >= 0 && b[1] >= 0 && b[2] <= W && b[3] <= H && !placed.some(o => hits(b, o)));
    // best: a side that covers no other city's dot; else any free side
    const fit = free.find(([, b]) => !cands.some(o => o.c !== c && hits(b, [o.sx - dot, o.sy - dot, o.sx + dot, o.sy + dot]))) || free[0];
    if (!fit) continue;
    placed.push(fit[1]);
    shown.push({ ...c, side: fit[0], other: !!st && !own });
  }
  gPlaces.selectAll("g.place").data(shown, c => c.name + c.st)
    .join(enter => {
      const e = enter.append("g").attr("class", "place").attr("transform", c => `translate(${c.p[0]},${c.p[1]})`);
      const inner = e.append("g").attr("class", "place-in");
      // Washington: a star; a state capital: a ring; other cities: a dot sized by population
      inner.append("path").attr("class", c => (c.cap === 2 ? "mark star" : c.cap ? "mark ring" : "mark"))
        .attr("d", c => (c.cap === 2 ? starPath(4.6) : circlePath(c.cap ? 3 : PLACE_R[c.tier])));
      inner.append("text").attr("class", c => `t${c.tier}`).text(c => c.name);
      return e;
    })
    .classed("other", c => c.other)
    .call(sel => sel.select("text")
      .attr("x", c => { const g = PLACE_R[c.tier] + 3; return c.side === "r" ? g : c.side === "l" ? -g : 0; })
      .attr("y", c => { const g = PLACE_FS[c.tier] / 2 + PLACE_R[c.tier] + 2; return c.side === "b" ? g : c.side === "t" ? -g : 0; })
      .attr("dy", "0.35em")
      .attr("text-anchor", c => (c.side === "r" ? "start" : c.side === "l" ? "end" : "middle")));
}
export const circlePath = r => `M${-r},0a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`;
export function starPath(r) {
  const pts = d3.range(10).map(k => { const a = -Math.PI / 2 + k * Math.PI / 5, q = k % 2 ? r * 0.42 : r; return `${(q * Math.cos(a)).toFixed(2)},${(q * Math.sin(a)).toFixed(2)}`; });
  return `M${pts.join("L")}Z`;
}
// fetched once the page has started (the names are drawn on the first map)
export function initPlaces() {
  d3.json(`${site.data}/places.json?v=2`).then(d => { places = d.map(([name, st, pop, x, y, cap]) => ({ name, st, pop, cap: cap || 0, tier: placeTier(pop), p: projection([x, y]) })); drawPlaces(); })
    .catch(() => { /* no labels */ });
  window.addEventListener("resize", () => { drawPlaces(); sizeStripes(); });
}
