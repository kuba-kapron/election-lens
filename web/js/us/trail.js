// The race through the night chart.
import { site } from "../site.js";
import { state } from "../state.js";
import { liveFile, liveOffice } from "./data.js";
import { clock, fmtInt, possessive } from "../format.js";
import { candFill } from "../colors.js";
import { svg, tip } from "../map.js";
import { panel } from "../panel.js";

// the race through the night (web/data/us/live/trail-<office>.json)
// Loaded only when a race panel is open, and again only when the office file says the chart
// file changed. Points are the source's updates as reported: a step line, no smoothing and
// no projection; a change of source is marked.
export const trails = {};
export async function fillTrail() {
  const el = panel.querySelector(".trail[data-trail]");
  if (!el) return;
  const office = liveOffice(state.office), want = liveFile(office)?.trailUpdated;
  if (!want) return;
  if (trails[office]?.updated !== want) {
    try { trails[office] = await d3.json(`${site.data}/live/trail-${office}.json?t=${encodeURIComponent(want)}`); } catch (e) { return; }
  }
  const now = panel.querySelector(`.trail[data-trail="${el.dataset.trail}"]`);  // the panel may have been redrawn meanwhile
  const tr = trails[office]?.races?.[el.dataset.trail];
  if (now && tr && tr.pts.length) {
    now.innerHTML = trailChart(tr, el.dataset.trail);
    trailHover(now);
  }
}
// hover (or touch): a marker on the nearest update and a small box with its numbers
export let trailInfo = null;
export function trailHover(el) {
  const info = trailInfo, svg = el.querySelector("svg"), tip = el.querySelector(".trail-tip"), mark = el.querySelector(".mark");
  if (!info || !svg || !tip || !mark) return;
  const hide = () => { tip.hidden = true; mark.setAttribute("visibility", "hidden"); };
  svg.addEventListener("pointerleave", hide);
  svg.addEventListener("pointermove", ev => {
    const box = svg.getBoundingClientRect(), k = info.w / box.width;
    // the update nearest the pointer along the count (totals can dip at a change of source)
    const at = (ev.clientX - box.left) * k, p = d3.least(info.pts, q => Math.abs(info.x(q.v) - at));
    const px = info.x(p.v), py = info.y(Math.max(-info.M, Math.min(info.M, p.m)));
    mark.setAttribute("visibility", "visible");
    mark.querySelector("line").setAttribute("x1", px);
    mark.querySelector("line").setAttribute("x2", px);
    mark.querySelector("circle").setAttribute("cx", px);
    mark.querySelector("circle").setAttribute("cy", py);
    const lead = p.m >= 0 ? info.ca : info.cb;
    tip.innerHTML = `<strong>${clock(new Date(p.t).toISOString())}</strong>
      <span><span style="color:${candFill(lead)};font-weight:700">${lead.last || lead.name}</span> +${Math.abs(p.m).toFixed(1)}</span>
      <span class="tip-note">${p.pct != null ? `${Math.round(p.pct)}% counted · ` : ""}${fmtInt(p.total)} votes</span>
      <span class="tip-note">${info.srcs[p.src]}</span>`;
    tip.hidden = false;
    tip.style.top = `${svg.offsetTop + svg.offsetHeight + 2}px`;  // under the chart, not over the line
    // keep the box inside the chart: left of the marker on the right half
    const left = px / k, right = px / k > box.width / 2;
    tip.style.left = right ? "" : `${left + 10}px`;
    tip.style.right = right ? `${box.width - left + 10}px` : "";
  });
}
// the chart's x axis: votes counted (every US source gives it, it only grows, it means the same
// in every race). "pct" suits a country with one national source whose share counted is consistent
export const TRAIL_X = "total";
export const TRAIL_AXIS = {
  total: { value: p => p.total, tick: d3.format("~s") },             // 0, 500k, 1M
  pct: { value: p => p.pct, max: 100, tick: v => `${v}%` },          // 0%, 50%, 100%
};
export function trailChart(tr, id) {
  const race = Object.values(liveFile()?.races || {}).find(x => x.id === id) || liveFile()?.races?.[id];
  const last = tr.pts[tr.pts.length - 1], n = tr.cands.length;
  const vote = (p, i) => p[4 + i] || 0;
  // the two candidates ahead in the latest count: the line is the first one's lead over the second
  const [a, b] = d3.range(n).sort((i, j) => vote(last, j) - vote(last, i));
  if (b == null) return "";
  const person = name => race?.cands.find(c => c.name === name) || { name, party: "O", caucus: "I" };
  const ca = person(tr.cands[a]), cb = person(tr.cands[b]);
  const ax = TRAIL_AXIS[TRAIL_X];
  const pts = tr.pts.map(p => ({ t: p[0] * 1000, m: p[2] ? 100 * (vote(p, a) - vote(p, b)) / p[2] : 0, src: p[3], total: p[2], pct: p[1] }))
    .map(p => ({ ...p, v: ax.value(p) })).filter(p => p.v != null);
  if (!pts.length) return "";
  const w = 300, h = 150, left = 4, right = 34, top = 14, bottom = 20;
  // x: how much is counted, from nothing to the latest count
  const x = d3.scaleLinear().domain([0, Math.max(ax.max ?? 0, d3.max(pts, p => p.v)) || 1]).range([left, w - right]);
  // scale to the count once 5% of the latest total is in: the first few counties are often
  // lopsided and would flatten the rest of the night; earlier points run off the chart (clipped)
  const settled = pts.filter(p => p.total >= 0.05 * pts[pts.length - 1].total);
  const M = Math.max(2, Math.ceil(d3.max(settled.length ? settled : pts, p => Math.abs(p.m)) * 1.15));
  const y = d3.scaleLinear().domain([-M, M]).range([h - bottom, top]);
  // straight from one update to the next: the votes in between came in with that batch
  const line = d3.line().x(p => x(p.v)).y(p => y(p.m))(pts);
  const area = d3.area().x(p => x(p.v)).y0(y(0)).y1(p => y(p.m))(pts);
  // dots where updates are, only where there is room (at least 9 units from the last dot);
  // the first, the last and each change of source always get one. Hover snaps to every update
  const at = p => [x(p.v), y(Math.max(-M, Math.min(M, p.m)))];
  const dots = [];
  pts.forEach((p, i) => {
    if (Math.abs(p.m) > M) return;  // early lopsided counts run off the chart: no dot at its edge
    const [px, py] = at(p), prev = dots[dots.length - 1];
    const must = i === 0 || i === pts.length - 1 || p.src !== pts[i - 1].src;
    if (must || !prev || Math.hypot(px - prev[0], py - prev[1]) >= 9) {
      if (i === pts.length - 1 && prev && Math.hypot(px - prev[0], py - prev[1]) < 9) dots.pop();  // the last one wins its spot
      dots.push([px, py]);
    }
  });
  const cid = `tc-${id}`.replace(/[^\w-]/g, "");
  const switches = pts.filter((p, i) => i && p.src !== pts[i - 1].src).map(p =>
    `<line class="src" x1="${x(p.v)}" x2="${x(p.v)}" y1="${top - 4}" y2="${h - bottom}"><title>From here: ${tr.srcs[p.src]}</title></line>`).join("");
  const ticks = x.ticks(4).map(t => `<text x="${x(t)}" y="${h - 5}" text-anchor="middle">${ax.tick(t)}</text>`).join("");
  trailInfo = { pts, x, y, M, w, ca, cb, srcs: tr.srcs };
  const last2 = (s, c) => `<tspan fill="${candFill(c)}" font-weight="700">${c.last || c.name}</tspan>${s}`;
  return `<h3>Through the night</h3>
    <svg class="history trail-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${possessive(ca.name)} lead over ${cb.name} as the votes were counted">
      <defs><clipPath id="${cid}-up"><rect x="0" y="${top}" width="${w}" height="${y(0) - top}"/></clipPath>
        <clipPath id="${cid}-dn"><rect x="0" y="${y(0)}" width="${w}" height="${h - bottom - y(0)}"/></clipPath>
        <clipPath id="${cid}-in"><rect x="0" y="${top}" width="${w}" height="${h - bottom - top}"/></clipPath></defs>
      <path d="${area}" fill="${candFill(ca)}" opacity="0.18" clip-path="url(#${cid}-up)"/>
      <path d="${area}" fill="${candFill(cb)}" opacity="0.18" clip-path="url(#${cid}-dn)"/>
      <line class="zero" x1="${left}" x2="${w - right}" y1="${y(0)}" y2="${y(0)}"/>
      ${switches}
      <path d="${line}" fill="none" stroke="var(--ink)" stroke-width="1.6" clip-path="url(#${cid}-in)"/>
      <g class="dots" clip-path="url(#${cid}-in)">${dots.map(([px, py]) => `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="2"/>`).join("")}</g>
      <text x="${left}" y="${top - 3}">${last2(" ahead", ca)}</text>
      <text x="${left}" y="${h - bottom - 4}">${last2(" ahead", cb)}</text>
      <text x="${w - right + 4}" y="${y(M) + 8}">+${M}</text><text x="${w - right + 4}" y="${y(0) + 4}">0</text><text x="${w - right + 4}" y="${y(-M)}">+${M}</text>
      ${ticks}
      <g class="mark" visibility="hidden"><line y1="${top}" y2="${h - bottom}"/><circle r="3.5"/></g>
      <rect x="${left}" y="0" width="${w - left - right}" height="${h}" fill="transparent"/>
    </svg><div class="tip trail-tip" hidden></div>
    ${switches || trails[liveOffice(state.office)]?.test ? `<p class="note">${switches ? "Dashed line: a change of source." : ""}${trails[liveOffice(state.office)]?.test ? " Test data." : ""}</p>` : ""}`;
}
