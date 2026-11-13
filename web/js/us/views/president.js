// The presidential view: counties and states shaded by margin or shift, or states by winner.
import { state } from "../../state.js";
import { data, path, stateById, years } from "../data.js";
import { WIN_MARK, fmtInt, pct, possessive } from "../../format.js";
import { SINGLE, byCount, ec, evOf, flippedFrom, margin, prevYear, record, shift, signedMargin, stateOf, wonBy } from "../rules.js";
import { BINS, categorical, color, colors, stateFill, value } from "../../colors.js";
import { candRow, countyName, evRow, fullName, headline, leanLabel, mlabel, noDataReason, partyTag, personCell, placeName, popSection, raceRow } from "../../components.js";
import { badgeMarks, countyPaths, countyTarget, statePaths, withNewConnecticut } from "../../map.js";
import { byName, countyLabel, marginBar, popBar, seatBar } from "../../cards.js";

export const presidentView = {
  districts: false,
  shift: true,
  countyShapes: y => withNewConnecticut(y),
  target: f => countyTarget(f),
  drawShapes() {
    const y = String(state.year);
    countyPaths().attr("fill", f => color(value(f.properties.id, y)));
    statePaths().attr("fill", f => stateFill(f.properties.st, y));
  },
  // the hover box: votes and margin, or the shift since the last election
  tip(f, target) {
    const y = String(state.year);
    const id = f.properties.id;
    const v = record(target, y);
    const st = data.states[f.properties.st];
    const c = data.candidates[y];
    let body;
    if (!v) body = "No results for this year";
    else if (state.mode === "shift") {
      const s = shift(target, y), p = prevYear(state.year);
      if (s == null) body = `<span class="tip-note">No ${p ?? "earlier"} result to compare</span>`;
      else {
        const before = margin(record(target, String(p))), now = margin(v);
        const side = s >= 0 ? "d" : "r";
        body = `<span class="tip-shift mg ${side}">${s >= 0 ? "D" : "R"} +${Math.abs(s * 100).toFixed(1)}</span>
          <span class="tip-note">${p} <span class="mg ${before >= 0 ? "d" : "r"}">${mlabel(before)}</span> → ${state.year} <span class="mg ${now >= 0 ? "d" : "r"}">${mlabel(now)}</span></span>`;
      }
    } else {
      const w = wonBy(target, y, v);
      const mark = p => (w === p ? WIN_MARK : "");
      const row = (who, p, votes) => {
        const b = w === p ? " is-winner" : "", share = votes / v[2];
        return `<span class="tip-name${b}">${who}${mark(p)}</span><span class="tip-pct${b}">${pct(share)}</span>
          <span class="tip-bar"><span style="width:${share * 100}%;background:${colors[p + "Solid"]}"></span></span>`;
      };
      const rows = { dem: row(c.dem + partyTag("D"), "dem", v[0]), gop: row(c.gop + partyTag("R"), "gop", v[1]) };
      body = `<span class="tip-rows">${byCount(v[0], v[1]).map(p => rows[p]).join("")}</span><span class="mg ${v[0] >= v[1] ? "d" : "r"}">${mlabel(margin(v))}</span>`;
    }
    const label = target.type === "state"
      ? `${st.name} <span class="ev">${evOf(target.id, y)} electoral votes</span>`
      : `${countyName(id)}, ${st.abbr}`;
    const from = target.type === "state" && categorical() ? flippedFrom(target.id, state.year) : null;
    const split = target.type === "state" && ec(state.year).states[target.id].every(n => n > 0)
      ? (() => { const [ed, er] = ec(state.year).states[target.id]; return `<span class="flip">Split: ${c.gop} ${er}, ${c.dem} ${ed} electoral votes</span>`; })()
      : "";
    const flip = from ? `<span class="flip">Flipped from ${from === "dem" ? "Democrats" : "Republicans"} since ${prevYear(state.year)}</span>` : "";
    const hint = target.type === "state" && !SINGLE.has(target.id) ? `<span class="hint">Click to see ${possessive(st.name)} counties</span>` : "";
    return `<strong>${label}</strong>${body}${split}${flip}${hint}`;
  },
  // the panel: electoral votes and the popular vote for the country; a state's or county's result
  panel() {
    const s = state.sel, y = String(state.year), c = data.candidates[y];
    const v = record(s, y);
    const st = stateOf(s);
    const where = s.type === "county" && !SINGLE.has(st) ? data.states[st].name
      : s.type === "nation" ? "Electoral votes won, 270 needed to win"
      : `Statewide, ${evOf(st, y)} electoral votes`;
    let html = headline("president", s, `${y} · ${where}`);
    // country: electoral votes, then the popular vote (the same section as Senate and House)
    if (s.type === "nation") {
      html += electoralBody(y, c, v) + popSection(v);
    } else if (!v) {
      html += `<p class="empty">No ${y} results for this place. ${noDataReason(s, state.year)}</p>`;
    } else {
      const sh = shift(s, y), p = prevYear(state.year);
      const won = wonBy(s, y, v);
      // grey facts line, as on Senate and House panels: votes · shift · district split
      const facts = [`${fmtInt(v[2])} votes`];
      if (sh != null) facts.push(`Shift: ${Math.abs(sh * 100).toFixed(1)} points toward ${sh >= 0 ? "Democrats" : "Republicans"} since ${p}`);
      if (s.type === "state") {
        const [ed, er] = ec(y).states[st];
        if (ed && er) facts.push(`Electoral votes: ${c.gop} ${er}, ${c.dem} ${ed}`);
      }
      const other = v[2] - v[0] - v[1];
      html += `<div class="cand">
        ${byCount(v[0], v[1]).map(p => p === "dem"
          ? candRow(fullName(c.dem) + partyTag("D"), v[0], v[2], colors.demSolid, won === "dem", c.dem, v[0] - v[1])
          : candRow(fullName(c.gop) + partyTag("R"), v[1], v[2], colors.gopSolid, won === "gop", c.gop, v[1] - v[0])).join("")}
        ${other > 0 ? candRow("Others", other, v[2], "var(--muted)") : ""}
      </div>
      <p class="note">${facts.join(" · ")}</p>`;
      const note = data.notes?.[`${s.id}-${y}`];
      if (note) html += `<p class="note">${note}</p>`;
    }
    return html;
  },
  // the year ribbon: the Electoral College winner
  yearResult(y) {
    const c = data.candidates[y], [d, r] = ec(y).won, p = c.won === "dem" ? "D" : "R";
    return { party: p, text: `${y}: ${fullName(c[c.won])} won, ${Math.max(d, r)}–${Math.min(d, r)} electoral votes` };
  },
  roundRaces: () => [],
  redrawOnSelect: false,
  headline: () => ["How America voted, <span class=\"nowrap\">2000 to 2024</span>",
    "Every presidential election since 2000, from the Electoral College down to the county. Click a state to see its counties, and a county to see how it has voted over time.",
    "Election Lens"],
  // the legend: party colors and flips (Winner), or the margin or shift steps
  legend() {
    if (categorical() && state.sel.type === "nation") {
      const y = state.year, p = prevYear(y);
      const box = fill => `<svg class="sw" viewBox="0 0 26 10" aria-hidden="true"><rect width="26" height="10" fill="${fill}"/></svg>`;
      const items = [[colors.demSolid, "Democratic"], [colors.gopSolid, "Republican"]];
      if (p) items.push(["url(#flip-dem)", `Flipped to Democratic since ${p}`], ["url(#flip-gop)", `Flipped to Republican since ${p}`]);
      return items.map(([f, t]) => `<span class="key">${box(f)}${t}</span>`).join("");
    }
    const b = BINS[state.mode];
    const swatch = arr => arr.map(c => `<span style="background:${c}"></span>`).join("");
    const ends = state.mode === "margin"
      ? ["Republican +50", "Democratic +50"]
      : ["Toward Republicans", "Toward Democrats"];
    const note = state.mode === "margin"
      ? `Steps at ${b.map(x => x * 100).join(", ")} points`
      : prevYear(state.year) ? `Change in margin since ${prevYear(state.year)}; steps at ${b.map(x => x * 100).join(", ")} points` : "No earlier election to compare with 2000";
    // Shift view reads like the arrows: Democrats on the left, Republicans on the right
    const ramp = state.mode === "shift"
      ? swatch([...colors.dem].reverse()) + swatch(colors.gop)
      : swatch([...colors.gop].reverse()) + swatch(colors.dem);
    const [left, right] = state.mode === "shift" ? [ends[1], ends[0]] : ends;
    return `<span>${left}</span><span class="ramp">${ramp}</span><span>${right}</span><span>${note}</span>`;
  },
  // the races card: states, or a state's counties
  list(sel) {
    const y = String(state.year), st = stateOf(sel);
    const c = data.candidates[y];
    const row = (s, label, go) => {
      const v = record(s, y), m = margin(v);
      if (m == null) return null;
      const p = m >= 0 ? "dem" : "gop", l = { caucus: p === "dem" ? "D" : "R", m: Math.abs(m) };
      return { m: signedMargin(l), html: raceRow(go, label, personCell({ name: fullName(c[p]), last: c[p], party: l.caucus }), "", leanLabel(l)) };
    };
    if (sel.type === "nation") {
      const sts = Object.keys(data.states).sort((a, b) => data.states[a].abbr.localeCompare(data.states[b].abbr));
      return { title: "States", items: sts.map(s => row({ type: "state", id: s }, data.states[s].abbr, `data-go="state:${s}"`)).filter(Boolean) };
    }
    if (SINGLE.has(st)) return null;
    const fs = Object.keys(data.counties).filter(f => f.startsWith(st) && data.counties[f].r[y]).sort(byName);
    return fs.length > 1 ? { title: `Counties in ${data.states[st].name}`, items: fs.map(f => row({ type: "county", id: f }, countyLabel(f), `data-go="county:${f}"`)).filter(Boolean), cls: "places" } : null;
  },
  mapSeats: () => categorical(),
  seatsLabel: "Electoral votes",
  // the history card: every presidential election here
  history(seatsChart) {
    const s = state.sel, st = stateOf(s), pts = [];
    let title = "", note = "";
    const span = `${years[0]}–${years[years.length - 1]}`;
    title = s.type !== "nation" ? `Margin in ${placeName(s)}, ${span}` : `Every election, ${span}`;
    for (const y of years) {
      const c = data.candidates[y];
      if (s.type === "nation") {
        const [d, r] = ec(y).won, p = c.won, ctl = p === "dem" ? "D" : "R";
        pts.push({ y, who: personCell({ name: fullName(c[p]), last: c[p], party: ctl }),
          lean: `<span class="mg ${ctl.toLowerCase()}">${Math.max(d, r)}–${Math.min(d, r)}</span>`,  // winner first
          ...(seatsChart ? seatBar({ D: d, R: r }, ctl, 538) : popBar(data.nation[y])) });
        continue;
      }
      const m = margin(record(s, String(y)));
      if (m == null) continue;
      const p = m >= 0 ? "dem" : "gop", l = { caucus: p === "dem" ? "D" : "R", m: Math.abs(m) };
      pts.push({ y, who: personCell({ name: fullName(c[p]), last: c[p], party: l.caucus }), lean: leanLabel(l), ...marginBar(l) });
    }
    return { title, pts, note };
  },
  // Maine and Nebraska split their electoral votes by district: in split years a badge inside
  // the state shows how many the second candidate won, in that candidate's color
  badges() {
    const y = String(state.year);
    const show = categorical() && state.sel.type === "nation";
    const splits = show
      ? Object.entries(ec(y).states).filter(([, [d, r]]) => d && r).map(([st, [d, r]]) => {
          const minor = d < r ? "dem" : "gop";
          return { st, p: minor, n: Math.min(d, r), xy: path.centroid(stateById.get(st)) };
        })
      : [];
    const b = badgeMarks(splits);
    b.select("circle").attr("fill", d => colors[d.p + "Solid"]);
    b.select("text").text(d => d.n);
  },
};

// National result as the Electoral College counted it (electoral votes won from each state)
export function electoralBody(y, c, v) {
  const e = ec(y), [d, r] = e.won;
  const won = d > r ? "dem" : "gop", lost = won === "dem" ? "gop" : "dem";
  let cast = "";
  if (e.cast) cast = `<p class="note">When the electors met, the official count was ${c[won]} ${e.cast[won]}, ${c[lost]} ${e.cast[lost]}. ${e.cast.note}</p>`;
  return `<div class="cand">
      ${byCount(d, r).map(p => p === "dem"
        ? evRow(fullName(c.dem) + partyTag("D"), d, colors.demSolid, won === "dem", c.dem)
        : evRow(fullName(c.gop) + partyTag("R"), r, colors.gopSolid, won === "gop", c.gop)).join("")}
    </div>
    ${cast}`;
}
