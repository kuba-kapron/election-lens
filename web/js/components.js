// HTML pieces every country's page uses: candidate rows, bars, portraits, race-list rows, names
// that shorten to fit, the country's flag.
import { t } from "./texts.js";
import { country } from "./country.js";
import { attr } from "./format.js";

// the country in view: its flag in the panel's corner and at the start of the breadcrumb
export const flagBox = () => `<span class="flag-box"><span class="flag-frame"><img class="flag" src="${country.flag}" alt=""></span></span>`;
// the page cannot work without its data: say how to open it
export function failed(err) {
  console.error(err);
  document.getElementById("panel").innerHTML = `<p class="empty">${t("noData")}</p>`;
}

// One candidate row, the same layout everywhere (president, Senate, House, tonight):
// portrait | name, mark | big number, then the bar and the grey line under it
export function candRowHtml({ pic, label, mark = "", big, bar = "", small, winner = false }) {
  return `<div class="cand-row${winner ? " is-winner" : ""}">${pic}<div class="cand-main"><span class="name">${label}${mark}</span><span class="pct">${big}</span>
    ${bar ? `${bar}\n      ` : ""}<span class="votes">${small}</span></div></div>`;
}
export const shareBar = (share, fill, cls = "", extra = "") => `<div class="bar${cls}"><span style="width:${share * 100}%;background:${fill}"></span>${extra}</div>`;

// a round portrait: initials in the party color, with the photo over them when there is one
export const circle = (fill, ini, img = "", attrs = "") =>
  `<span class="avatar" style="background:${fill}" aria-hidden="true"${attrs}><span class="ini">${ini}</span>${img}</span>`;

// Names that switch to a shorter form when the full one does not fit (full form on hover).
// data-forms lists the forms, longest first, split by "|": party names in a totals bar
// ("Democrats|Dems", both sides take the same step) and people in race lists
// ("Shelley Moore Capito|Shelley M. Capito|S. Capito|Capito"); data-title is hover text kept at every step
export function fitNames() {
  const forms = n => n.dataset.forms.split("|");
  const show = (n, i) => {
    const f = forms(n);
    n.textContent = f[Math.min(i, f.length - 1)];
    n.title = [i ? f[0] : "", n.dataset.title || ""].filter(Boolean).join(" · ");
  };
  // content wider than its box, to the fraction of a pixel (the browser cuts it with "…" even
  // when it is only half a pixel over; scrollWidth rounds that away). Measures the row's own
  // pieces: an element's box leaves out hidden screen-reader text placed elsewhere on the page
  const over = el => {
    const box = el.getBoundingClientRect(), range = document.createRange();
    let right = box.left;
    for (const n of el.childNodes) {
      let r;
      if (n.nodeType === 3) { range.selectNodeContents(n); r = range.getBoundingClientRect(); }
      else if (n.nodeType === 1 && getComputedStyle(n).position !== "absolute") r = n.getBoundingClientRect();
      if (r && r.width) right = Math.max(right, r.right);
    }
    return right > box.left + el.clientWidth + 0.01;
  };
  // groups of names that take the same step (both party names in a bar; one person in a row).
  // Every group is set to a form, then all are measured: a long list costs a few layouts, not one per row
  let groups = [
    ...[...document.querySelectorAll(".tug-head")].map(h => ({ names: [...h.querySelectorAll(".pname")], box: n => n })),
    ...[...document.querySelectorAll(".who .fit")].map(n => ({ names: [n], box: m => m.closest(".who-line, .who") })),
  ].filter(g => g.names.length);
  for (let i = 0; groups.length; i++) {
    groups.forEach(g => g.names.forEach(n => show(n, i)));
    groups = groups.filter(g => g.names.some(n => forms(n).length > i + 1) && g.names.some(n => over(g.box(n))));
  }
}
// measure again whenever the cards change width (window, phone rotation, columns) and once the
// page font has loaded: measured with the narrower fallback font, everything seems to fit
{
  const widths = new WeakMap();
  const ro = new ResizeObserver(entries => {
    if (entries.some(e => widths.get(e.target) !== e.contentRect.width && (widths.set(e.target, e.contentRect.width), true))) fitNames();
  });
  [document.body, document.getElementById("races")].forEach(el => ro.observe(el));  // the panel has no box of its own on phones
  document.fonts?.ready.then(fitNames);
  document.fonts?.addEventListener("loadingdone", fitNames);  // "ready" can come before loading starts
}
// a person's name for a race list: full, middle names as initials, first initial, last name
export const SUFFIX = /^(jr|sr|ii|iii|iv)\.?$/i;
export const PARTICLE = /^(van|von|de|del|della|der|den|da|di|du|la|le|st\.?)$/i;
export function fitName(c) {
  const words = c.name.split(" ").filter(w => !SUFFIX.test(w));
  let last = c.last && c.name.includes(c.last) ? c.last : words[words.length - 1];
  // particles belong to the surname: "Van Epps", "De La Cruz"
  for (let i = words.indexOf(last.split(" ")[0]) - 1; i > 0 && PARTICLE.test(words[i]); i--) last = `${words[i]} ${last}`;
  const given = words.join(" ").slice(0, words.join(" ").lastIndexOf(last)).trim().split(" ").filter(Boolean);
  const mid = given.length > 1 ? [given[0], ...given.slice(1).map(w => (w.endsWith(".") ? w : w[0] + ".")), last].join(" ") : null;
  const initial = given.length ? `${given[0][0]}. ${last}` : null;  // "S. Capito"
  const list = [c.name, mid, initial, last].filter((f, i, a) => f && a.indexOf(f) === i);
  return `<span class="fit" data-forms="${attr(list.join("|"))}">${c.name}</span>`;
}

export const notesList = notes => (notes && notes.length ? `<ul class="notes">${notes.map(n => `<li>${n}</li>`).join("")}</ul>` : "");

// One row of a race list, the same columns everywhere: label | name (shortens to fit) |
// status (✓ called, or the share counted while leading; empty for past years) | margin.
// attrs: the button's data attributes; null for a row that is not a link
export function raceRow(attrs, what, who, status, lean) {
  const inner = `<span class="what">${what}</span><span class="who">${who}</span><span class="status">${status}</span>${lean}`;
  return attrs == null ? `<li><div class="prev-row">${inner}</div></li>` : `<li><button type="button" ${attrs}>${inner}</button></li>`;
}
// Bar chart of a race over the years, one for every office and country: bars up or down from zero
// (US: up for Democrats, down for Republicans), colored by fill(m). bars: [{ label, m (signed, -1..1), text, cur, faded, attrs }], oldest first;
// attrs makes a bar a link (the same data-hist as the rows under it)
export function barChart(bars, aria, fill) {
  const w = 300, h = 184, top = 18, bottom = 22;
  const ms = bars.map(d => d.m ?? 0);
  let lo = Math.min(0, ...ms), hi = Math.max(0, ...ms);
  if (hi - lo < 0.1) { hi = Math.max(hi, 0.05); lo = Math.min(lo, -0.05); }
  // leave 16px above and below the bars for the value labels
  const sy = d3.scaleLinear().domain([lo, hi]).range([h - bottom - 16, top]);
  const mid = sy(0);
  const x = d3.scaleBand().domain(bars.map((d, i) => i)).range([0, w]).padding(0.28);
  const out = bars.map((d, i) => {
    const cx = x(i), bw = x.bandwidth(), cur = d.cur ? " cur" : "";
    const lab = `<text class="${cur}" x="${cx + bw / 2}" y="${h - 6}" text-anchor="middle">${d.label}</text>`;
    const link = d.attrs ? ` ${d.attrs} style="cursor:pointer"` : "";
    if (d.m == null) return `<g${link}>${lab}<text x="${cx + bw / 2}" y="${mid - 4}" text-anchor="middle">n/a</text></g>`;
    const y0 = sy(0), y1 = sy(d.m);
    const vy = d.m >= 0 ? y1 - 5 : y1 + 13;
    return `<g${link}><title>${d.label}: ${d.text}${d.faded ? " (old map)" : ""}${d.live ? " so far (won or leading)" : ""}</title>
      <rect x="${cx}" y="${Math.min(y0, y1)}" width="${bw}" height="${Math.max(1, Math.abs(y1 - y0))}" fill="${fill(d.m)}" opacity="${d.cur ? 1 : d.faded ? 0.3 : 0.55}" rx="2"/>
      <text class="${cur}" x="${cx + bw / 2}" y="${vy}" text-anchor="middle">${d.text}</text>${lab}</g>`;
  }).join("");
  return `<svg class="history" viewBox="0 0 ${w} ${h}" role="img" aria-label="${attr(aria)}">
    <line class="zero" x1="0" x2="${w}" y1="${mid}" y2="${mid}"/>${out}</svg>`;
}
