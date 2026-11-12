// HTML pieces shared by the panel and the cards: names, candidate rows, totals bars.
import { state } from "./state.js";
import { congressPhotos, data, extra, liveFile, partyIcons, peoplePhotos, photos } from "./data.js";
import { WIN_MARK, advancedMark, attr, clock, fmtInt, ordinal, pct, points, possessive } from "./format.js";
import { advancedOf, counted, gains, isCalled, isClosed, isLive, isNewSeat, lean, pickup, runoffOf } from "./rules.js";
import { candFill, ckey, colors } from "./colors.js";

export const countyName = id => data.counties[id]?.name ?? "Unknown";
export function mlabel(m) {
  if (m == null) return "";
  return (m >= 0 ? "D+" : "R+") + points(Math.abs(m * 100));
}
export function name(sel) {
  if (sel.type === "nation") return "United States";
  if (sel.type === "state") return data.states[sel.id].name;
  return countyName(sel.id);
}
// Panel headlines: the office in a small line above the place ("U.S. Senate" over "Georgia",
// "Governor" over "Fulton County, GA"), so a screenshot carries its context.
export const OFFICE_HEAD = { president: "President", senate: "U.S. Senate", house: "U.S. House", governor: "Governor" };
export function placeName(sel) {
  if (sel.type === "county") return `${countyName(sel.id)}, ${data.states[sel.id.slice(0, 2)].abbr}`;
  if (sel.type === "district") return districtName(sel.id);
  return name(sel);
}
// the country in view: its flag in the panel's corner and at the start of the breadcrumb
export const COUNTRY = { name: "United States", flag: "img/flags/us.svg?v=2" };
export const flagBox = () => `<span class="flag-box"><span class="flag-frame"><img class="flag" src="${COUNTRY.flag}" alt=""></span></span>`;
export function headline(office, sel, where, special = false) {
  const k = sel.type === "nation" && office === "governor" ? "Governors" : OFFICE_HEAD[office];
  // the country's flag sits in the card's top-right corner, level with this line
  return `<p class="kicker"><span>${k}${special ? " · special election" : ""}</span><span class="kicker-flag" title="${COUNTRY.name}">${flagBox()}</span></p><h2>${placeName(sel)}</h2><p class="where">${where}</p>`;
}
export const liveWhen = () => { const u = liveFile()?.updated; return `2026 · live${u ? `, updated ${clock(u)}` : ""}`; };

// One candidate row, the same layout everywhere (president, Senate, House, tonight):
// portrait | name, mark | big number, then the bar and the grey line under it
export function candRowHtml({ pic, label, mark = "", big, bar = "", small, winner = false }) {
  return `<div class="cand-row${winner ? " is-winner" : ""}">${pic}<div class="cand-main"><span class="name">${label}${mark}</span><span class="pct">${big}</span>
    ${bar ? `${bar}\n      ` : ""}<span class="votes">${small}</span></div></div>`;
}
export const shareBar = (share, fill, cls = "", extra = "") => `<div class="bar${cls}"><span style="width:${share * 100}%;background:${fill}"></span>${extra}</div>`;
export function evRow(label, ev, fill, winner, last) {
  return candRowHtml({ pic: avatar(last, fill), label, mark: winner ? ` ${WIN_MARK}` : "", big: ev, winner,
    bar: shareBar(ev / 538, fill, " ev-bar", `<i class="need" title="270 to win"></i>`),
    small: ev === 1 ? "1 electoral vote" : ev + " electoral votes" });
}

// full name for the side panel's candidate rows ("Donald Trump"); last name elsewhere
export const fullName = last => data.people[last.toLowerCase()]?.name ?? last;
// a round portrait: initials in the party color, with the photo over them when there is one
export const circle = (fill, ini, img = "", attrs = "") =>
  `<span class="avatar" style="background:${fill}" aria-hidden="true"${attrs}><span class="ini">${ini}</span>${img}</span>`;
// presidential candidates: the year's photo (bush-2004), else the general one (bush), else
// initials. Which photos exist comes from img/candidates/photos.json
export function avatar(last, fill) {
  if (!last) return `<span class="avatar empty" aria-hidden="true"></span>`;
  const key = last.toLowerCase(), who = data.people[key];
  const file = [`${key}-${state.year}`, key].find(f => photos.has(f));
  return circle(fill, who?.initials ?? last[0], file ? `<img src="img/candidates/${file}.jpg" alt="">` : "");
}

export function noDataReason(s, y) {
  const id = s.id || "";
  if (id.startsWith("09") && y === 2024) return "Connecticut reported 2024 results by planning region, not county.";
  if (id.startsWith("091") && y < 2024) return "Connecticut's planning regions only report results from 2024.";
  if (id === "08014" && y === 2000) return "Broomfield County was created in 2001.";
  return "The source has no data for it.";
}

// the leader's margin over the runner-up, in votes: " · +585,017" on the leader's row
export const marginText = lead => (lead > 0 ? ` · <span class="lead" title="Margin over the runner-up">+${fmtInt(lead)}</span>` : "");
export function candRow(label, votes, total, fill, winner = false, last = null, lead = 0) {
  const share = votes / total;
  return candRowHtml({ pic: avatar(last, fill), label, mark: winner ? ` ${WIN_MARK}` : "", big: pct(share), winner,
    bar: shareBar(share, fill), small: `${fmtInt(votes)} votes${marginText(lead)}` });
}

// Bar chart of a race over the years, one for every office: bars up for Democrats, down for
// Republicans. bars: [{ label, m (signed, -1..1), text, cur, faded, attrs }], oldest first;
// attrs makes a bar a link (the same data-hist as the rows under it)
export function barChart(bars, aria) {
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
    const fill = d.m >= 0 ? colors.demSolid : colors.gopSolid;
    const vy = d.m >= 0 ? y1 - 5 : y1 + 13;
    return `<g${link}><title>${d.label}: ${d.text}${d.faded ? " (old map)" : ""}${d.live ? " so far (won or leading)" : ""}</title>
      <rect x="${cx}" y="${Math.min(y0, y1)}" width="${bw}" height="${Math.max(1, Math.abs(y1 - y0))}" fill="${fill}" opacity="${d.cur ? 1 : d.faded ? 0.3 : 0.55}" rx="2"/>
      <text class="${cur}" x="${cx + bw / 2}" y="${vy}" text-anchor="middle">${d.text}</text>${lab}</g>`;
  }).join("");
  return `<svg class="history" viewBox="0 0 ${w} ${h}" role="img" aria-label="${attr(aria)}">
    <line class="zero" x1="0" x2="${w}" y1="${mid}" y2="${mid}"/>${out}</svg>`;
}
export const CAUCUS_NAME = { D: "Democrats", R: "Republicans", I: "Independents" };
export const SHORT_NAME = { D: "Dems", R: "GOP", I: "Others" };
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
// Party after a name: the letter, "(D)", then its icon from img/parties/ when there is one.
// Takes a party code or a candidate.
export const PARTY_NAME = { D: "Democratic Party", R: "Republican Party", L: "Libertarian Party", G: "Green Party", I: "Independent" };
export const partyTag = c => {
  const p = typeof c === "string" ? c : c.party;
  if (!PARTY_NAME[p]) return "";
  const icon = partyIcons[p];
  return ` <span class="party-tag" title="${PARTY_NAME[p]}">(${p})${icon ? `<img class="party" src="img/parties/${icon}" alt="">` : ""}</span>`;
};
// Round picture for a whole party (Seats and Popular vote rows): its icon, else its letter
export const partyAvatar = (p, fill) => partyIcons[p]
  ? `<span class="avatar party-pic" aria-hidden="true"><img src="img/parties/${partyIcons[p]}" alt=""></span>`
  : circle(fill, p);
export function districtName(id, short = false) {
  const n = +id.slice(3), st = data.states[id.slice(0, 2)].name;
  if (short) return n ? ordinal(n) : "At large";
  return n ? `${possessive(st)} ${ordinal(n)} district` : `${st} at large`;
}
export const seatLabel = r => (isLive()
  ? (r.seat === "governor" ? "Governor" : r.seat === "special" ? "Senate (special)" : "Senate")
  : (r.seat === "special" ? "Special election" : "Regular election"));
export function leanLabel(l) {
  if (!l) return "";
  const cls = l.caucus === "D" ? "d" : l.caucus === "R" ? "r" : "i";
  if (l.unopposed) return `<span class="mg ${cls}">Unopposed</span>`;
  return `<span class="mg ${cls}">${l.caucus}+${points(l.m * 100)}</span>`;
}
// past years: a line in the tooltip when the seat changed party
export const flipLine = r => (r?.held && !advancedOf(r) && r.held !== r.cands[0].caucus ? `<span class="flip">${CAUCUS_NAME[r.cands[0].caucus]} gained the seat</span>` : "");

export const SENATE_POP_NOTE = "Adds up the November votes in this year's Senate races only: about a third of the states, and some races had no Democrat or no Republican. States with two races count twice.";


// Commons photo credits: the license deed linked (Creative Commons asks for it); shown in the
// footer only for the photos on screen, and as hover text on each portrait
export function licenseLink(lic) {
  const m = lic.match(/^CC (BY(?:-SA)?) ([\d.]+)$/i);
  return /^public domain$/i.test(lic) ? "public domain"
    : m ? `<a href="https://creativecommons.org/licenses/${m[1].toLowerCase()}/${m[2]}/">${lic}</a>`
    : /^CC0/i.test(lic) ? `<a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</a>` : lic;
}
export function drawPhotoCredits() {
  const el = document.getElementById("photo-credits");
  const keys = [...new Set([...document.querySelectorAll("[data-photo]")].map(n => n.dataset.photo))].filter(k => peoplePhotos[k]);
  el.hidden = !keys.length;
  el.innerHTML = keys.length ? "Candidate photos from Wikimedia Commons: " + keys.map(k => {
    const c = peoplePhotos[k];
    return `<a href="${c.page}">${c.name}</a> by ${c.author} (${licenseLink(c.license)})`;
  }).join("; ") + "." : "";
}
// Senate, House and governor candidates: the official portrait for anyone who has served in
// Congress (img/congress/<Congress ID>.jpg), else an approved Commons photo, else initials
export function initialsAvatar(c, fill) {
  const parts = c.name.replace(/[^A-Za-zÀ-ž\s-]/g, "").trim().split(/\s+/);
  const ini = ((parts[0] || "")[0] || "") + ((parts[parts.length - 1] || "")[0] || "");
  const pp = !congressPhotos.has(c.bio) && peoplePhotos[c.photo];
  const img = congressPhotos.has(c.bio) ? `<img src="img/congress/${c.bio}.jpg" alt="" loading="lazy">`
    : pp ? `<img src="img/people/${c.photo}.jpg" alt="" loading="lazy">` : "";
  const credit = pp ? ` data-photo="${c.photo}" title="${attr(`Photo: ${pp.author}, ${/^public domain$/i.test(pp.license) ? "public domain" : pp.license}`)}"` : "";
  return circle(fill, ini.toUpperCase(), img, credit);
}
// winner: true (✓, bold), or the round they advanced to ("runoff", "final round": →, bold)
export function personRow(c, votes, total, winner, lead = 0) {
  const fill = candFill(c);
  const mark = typeof winner === "string" ? ` ${advancedMark(winner)}` : winner ? ` ${WIN_MARK}` : "";
  const facts = [];
  if (c.party === "I" && c.caucus === "D") facts.push("caucuses with the Democrats");
  if (c.inc) facts.push("incumbent");
  const factText = facts.length ? ` · <span class="inc">${facts.join(" · ")}</span>` : "";
  const row = { pic: initialsAvatar(c, fill), label: `${c.name}${partyTag(c)}`, mark, winner };
  if (votes == null) return candRowHtml({ ...row, big: "Unopposed", small: `No votes counted${factText}` });
  const share = total ? votes / total : 0;
  return candRowHtml({ ...row, big: pct(share), bar: shareBar(share, fill), small: `${fmtInt(votes)} votes${marginText(lead)}${factText}` });
}
// candidates with at least 2% (and always the top two), then everyone else as "Others".
// winner: the winner's index; or { advanced: Set of indices, to: "runoff" } for an earlier round
export function peopleRows(cands, votes, total, other, winner) {
  const order = votes.map((v, i) => i).sort((a, b) => votes[b] - votes[a]);
  const shown = order.filter((i, k) => k < 2 || (total && votes[i] / total >= 0.02));
  const rest = total - shown.reduce((a, i) => a + votes[i], 0);
  const lead = order.length > 1 ? votes[order[0]] - votes[order[1]] : 0;
  const mark = i => (winner?.advanced ? (winner.advanced.has(i) ? winner.to : false) : i === winner);
  let html = shown.map((i, k) => personRow(cands[i], votes[i], total, mark(i), k === 0 ? lead : 0)).join("");
  if (rest > 0) html += candRow("Others", rest, total, "var(--muted)");
  return html;
}
export const notesList = notes => (notes && notes.length ? `<ul class="notes">${notes.map(n => `<li>${n}</li>`).join("")}</ul>` : "");
// totals bar input, per party: seats won only ("12 won"), or won and leading tonight
export const wonParts = (won, ps) => Object.fromEntries(ps.map(p => [p, { solid: won[p], lead: 0, lines: [`${won[p]} won`] }]));
export const wonLeadParts = (x, ps) => Object.fromEntries(ps.map(p => [p,
  { solid: x.won[p], lead: x[p] - x.won[p], lines: [`${x.won[p]} won`, `${x[p] - x.won[p]} leading`] }]));
export const senateNeed = vp => `51 for control${vp ? ` (50 for ${{ D: "Democrats", R: "Republicans" }[vp]})` : ""}`;
// Popular vote section under the seats bar: shares on a bar (Democrats from the left,
// Republicans from the right, others in the middle), with the vote counts; then grey lines,
// like a single race: others, and the votes counted (share counted in brackets where known)
export function popSection(v, live = false, heading = true, counted = null) {
  if (!v || !v[2]) return "";
  const pc = n => (n / v[2]) * 100, other = v[2] - v[0] - v[1];
  const seg = (n, c, who) => (n ? `<span style="width:${pc(n)}%;background:${c}" title="${who}: ${fmtInt(n)} votes"></span>` : "");
  const side = (p, n) => `<ul class="tug-lines ${p === "D" ? "dem" : "gop"}"><li><b class="mg ${p === "D" ? "d" : "r"} pop-pc">${pc(n).toFixed(1)}%</b></li><li>${fmtInt(n)}</li></ul>`;
  const share = counted != null ? pctShort({ pct: counted, pct_of: "" }) : "";
  return `${heading ? `<h3>Popular vote${live ? " so far" : ""}</h3>` : ""}<div class="tug pop">
    <div class="tug-foot">${side("D", v[0])}${side("R", v[1])}</div>
    <div class="bar ev-bar tug-bar" style="--need:0.5">${seg(v[0], colors.demSolid, CAUCUS_NAME.D)}<i class="gap"></i>${seg(v[1], colors.gopSolid, CAUCUS_NAME.R)}<i class="need" title="Half the vote"></i></div>
    ${other > 0 ? `<p class="note">Others: ${pc(other).toFixed(1)}%, ${fmtInt(other)} votes</p>` : ""}
    <p class="note">${fmtInt(v[2])} votes${live ? " counted" : ""}${share}</p></div>`;
}
// One row of a race list, the same columns everywhere: label | name (shortens to fit) |
// status (✓ called, or the share counted while leading; empty for past years) | margin.
// attrs: the button's data attributes; null for a row that is not a link
export function raceRow(attrs, what, who, status, lean) {
  const inner = `<span class="what">${what}</span><span class="who">${who}</span><span class="status">${status}</span>${lean}`;
  return attrs == null ? `<li><div class="prev-row">${inner}</div></li>` : `<li><button type="button" ${attrs}>${inner}</button></li>`;
}
export const personCell = c => `${fitName(c)}${partyTag(c)}`;
// a district's label in a list, marked when it is a new seat with no earlier holder
export const districtLabel = (id, r) => `${districtName(id, true)}${isNewSeat(r) ? ` <span class="new" title="New seat: no earlier holder">new</span>` : ""}`;
// seats, the majority first (as in the year ribbon: "53–47 Republicans"); colored by the majority, plain when tied
export const seatSpan = (c, ctl) => `<span class="mg${ctl === "D" ? " d" : ctl === "R" ? " r" : ""}">${ctl === "R" ? `${c.R}–${c.D}` : `${c.D}–${c.R}`}${c.I ? `–${c.I}` : ""}</span>`;
export const runoffText = r => { const ro = runoffOf(r); return ro ? `Runoff: ${ro.map(c => c.name).join(" and ")}` : ""; };
export const pctText = r => (r.pct == null ? "" : `${r.pct < 1 && r.pct > 0 ? "<1" : Math.round(r.pct)}% ${r.pct_of && r.pct_of.startsWith("precincts") ? "of precincts reporting" : r.pct_of && r.pct_of.startsWith("polling") ? "of polling places reporting" : r.pct_of && r.pct_of.startsWith("counties") ? "of counties fully reported" : "counted"}`);
// " (85%)" after a vote count; the hover says what the share is of (votes, precincts, counties)
export const pctShort = r => (r.pct == null ? "" : ` <span title="${pctText(r)}">(${r.pct < 1 && r.pct > 0 ? "<1" : Math.round(r.pct)}%)</span>`);
export function liveStatus(r) {
  if (isCalled(r)) return `Called for ${r.cands[r.call.winner].name} by ${r.call.by}`;
  if (runoffOf(r)) return `${runoffText(r)}, called by ${r.call.by}`;
  if (counted(r)) return pctText(r) || "Counting";
  if (!isClosed(r)) return `Polls close at ${clock(r.polls_close)}`;
  return "Polls closed, no votes counted yet";
}
// "Live" next to 2026, with the time of the last update under it
export function liveTag() {
  const night = extra.live?.night, on = !!night?.counting;
  const upd = liveFile()?.updated || liveFile("senate")?.updated;
  const time = upd ? `<span class="live-time" title="Results updated at ${clock(upd)}">${clock(upd)}</span>` : "";
  return `<span class="live-stack"><span class="live-tag${on ? " on" : ""}" title="${on ? "Results are coming in" : "Live tonight: no votes counted yet"}"><span class="live-dot"></span>Live</span>${time}</span>`;
}
// "Source: Texas Secretary of State (official results), checked 22:48." The county panel names
// the county figures' source; the race panel adds it when it differs from the totals' source
export function liveSource(r, county = false) {
  if (!r.source) return "";
  const line = (label, s) => {
    const name = s.url ? `<a href="${s.url}" target="_blank" rel="noopener">${s.name}</a>` : s.name;
    return `${label}: ${name} (${s.official ? "official results" : "unofficial"})${s.fetched ? `, checked ${clock(s.fetched)}` : ""}.`;
  };
  const cs = r.county_source;
  let t = county && cs ? line("Source", cs) : line("Source", r.source) + (cs ? ` ${line("County figures", cs)}` : "");
  if (r.stale) t += ` <strong>Not refreshed for a while; numbers may be behind.</strong>`;
  return `<p class="note">${t}</p>`;
}
export const PARTY_ADJ = { D: "Democratic", R: "Republican", I: "Independent" };
export function pickupText(r) {
  const k = pickup(r);
  if (!k) return "";
  const h = k.held, when = h.how === "incumbent" ? "incumbent" : h.how === "number" ? `${h.year}, before the new map` : h.year;
  return `<p class="note"><strong>${PARTY_ADJ[k.won.caucus]} pickup</strong> · ${CAUCUS_NAME[h.caucus]} held this seat (${h.name}, ${when})</p>`;
}
// One bar per office: Democrats fill from the left, Republicans from the right, solid = won (and,
// for the Senate, not up), light = leading; others next to the Democrats; grey = no votes yet.
// t[p] = { solid, lead, lines: [...] }; need = control marker text or null;
// races = live races for pickups, or a gains object already counted (past years).
// control = the party that holds the majority (past years) or has secured it tonight: its name in bold
export function tugBar(t, total, needText, races, what, under = "", control = null) {
  const n = p => (t[p] ? t[p].solid + t[p].lead : 0);
  const seg = (k, c, w) => (k ? `<span style="width:${(k / total) * 100}%;background:${c}" title="${w}: ${k}"></span>` : "");
  const segs = p => [seg(t[p]?.solid, colors[ckey(p) + "Solid"], t[p]?.solidText || "Won"), seg(t[p]?.lead, colors[ckey(p)][1], "Leading")];
  const [ds, dl] = segs("D"), [is_, il] = segs("I"), [rs, rl] = segs("R");
  // big number: certain seats only (won, and not up); leads are the light part of the bar and
  // the "leading" line under it
  const num = p => `<span class="tug-num"><b title="${t[p].solidText || "Won"}">${t[p].solid}</b></span>`;
  const g = Array.isArray(races) ? gains(races) : races;
  const EVEN = `<span class="even">= 0</span>`; // no change: in the text color, not green or red
  // House: one net number per party (houseNet); Senate and governors: gained and lost
  const netSide = p => {
    const n = g.net[p];
    return `<ul class="tug-lines tug-gains-side ${p === "D" ? "dem" : "gop"}"><li title="${g.title}">${n > 0 ? `<span class="gain">▲ ${n}</span>` : n < 0 ? `<span class="loss">▼ ${-n}</span>` : EVEN}</li></ul>`;
  };
  const arrows = p => {
    // called races only; leads in the other party's seats go in the hover text
    const lead = k => (k ? ` Not yet called: ahead in ${k} more.` : "");
    if (!g.won[p] && !g.lost[p]) return `<li title="No ${what} changed party.${lead(g.lead[p])}${lead(g.leadLost[p]).replace("ahead", "behind")}">${EVEN}</li>`;
    return `<li class="up" title="Won ${g.won[p]} ${what} the other party held before.${lead(g.lead[p])}"><span class="gain">▲ ${g.won[p]}</span></li>
      <li class="down" title="Lost ${g.lost[p]} ${what} this party held before.${lead(g.leadLost[p]).replace("ahead", "behind")}"><span class="loss">▼ ${g.lost[p]}</span></li>`;
  };
  // one row per kind (won, leading, not up): Democrats' count left, the label once in the
  // middle, Republicans' count right; each count next to its swatch in the bar
  const sw = (p, l) => `<i class="sw" style="background:${l.endsWith("leading") ? colors[ckey(p)][1] : colors[ckey(p) + "Solid"]}"></i>`;
  const split = l => [l.slice(0, l.indexOf(" ")), l.slice(l.indexOf(" ") + 1)];
  // drop a row of zero leads; when all that is left is "won", the big counts already say it
  const rows = t.D.lines.map((l, i) => [l, t.R.lines[i]]).filter(([d, r]) => !(d === "0 leading" && r === "0 leading"));
  const needLines = rows.some(([d]) => !d.endsWith(" won"));
  const lineRows = `<div class="tug-rows">${rows.map(([d, r]) => `<span class="dem">${sw("D", d)}${split(d)[0]}</span><span class="what">${split(d)[1]}</span><span class="gop">${split(r)[0]}${sw("R", r)}</span>`).join("")}</div>`;
  const gainSide = p => `<ul class="tug-lines tug-gains-side ${p === "D" ? "dem" : "gop"}">${arrows(p)}</ul>`;
  const other = n("I") ? `<p class="tug-other">${CAUCUS_NAME.I}: ${n("I")} (${t.I.lines.join(", ")})</p>` : "";
  return `<div class="tug">
    <div class="tug-head"><span class="dem">${partyAvatar("D", colors.demSolid)}<span class="tug-who">${num("D")}<span class="pname${control === "D" ? " has-control" : ""}" data-forms="${CAUCUS_NAME.D}|${SHORT_NAME.D}"${control === "D" ? ' data-title="Majority" title="Majority"' : ""}>${CAUCUS_NAME.D}</span></span></span><span class="gop"><span class="tug-who">${num("R")}<span class="pname${control === "R" ? " has-control" : ""}" data-forms="${CAUCUS_NAME.R}|${SHORT_NAME.R}"${control === "R" ? ' data-title="Majority" title="Majority"' : ""}>${CAUCUS_NAME.R}</span></span>${partyAvatar("R", colors.gopSolid)}</span></div>
    ${g?.net ? `<div class="tug-foot tug-gains">${netSide("D")}${netSide("R")}</div>` : g?.any ? `<div class="tug-foot tug-gains">${gainSide("D")}${gainSide("R")}</div>` : ""}
    <div class="bar ev-bar tug-bar" style="--need:0.5">${ds}${dl}${is_}${il}<i class="gap"></i>${rl}${rs}${needText != null ? `<i class="need" title="${needText || "Half the seats"}"></i>` : ""}</div>
    ${needText ? `<p class="tug-need">${needText}</p>` : ""}
    ${needLines ? lineRows : ""}${under}${other}</div>`;
}
