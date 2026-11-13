// Statewide races, Senate and governors: states colored by the race, counties by its county
// figures; past years and tonight.
import { state } from "../../state.js";
import { LIVE_YEAR, counties, data, extra, liveFile, path, stateById } from "../data.js";
import { possessive } from "../../format.js";
import { SINGLE, byStateSeat, countyLean, isLive, lean, liveHouseTally, liveRaces, pastGains, pastMark, raceLean, roundOf, sYear, senateBalance, senateControl, senatePopular, senateRace, senateRaces, senateSecured, stateOf, tieBreaker } from "../rules.js";
import { colors, leanColor, raceFill } from "../colors.js";
import { raceRow } from "../../components.js";
import { CAUCUS_NAME, SENATE_POP_NOTE, countyName, flipLine, headline, leanLabel, liveWhen, personCell, placeName, popSection, seatLabel, seatSpan, senateNeed, tugBar, wonLeadParts } from "../components.js";
import { badgeMarks } from "../../map.js";
import { countyPaths, countyTarget, statePaths } from "../map.js";
import { liveTip, raceTip } from "../tooltip.js";
import { flipNote, raceLegend } from "../legend.js";
import { countyBody, raceBody } from "../panel.js";
import { liveCountyBody, liveRaceBody } from "../live.js";
import { byName, countyItem, marginBar, popBar, raceItem, seatBar, withLive } from "../cards.js";

export const statewideView = {
  districts: false,
  shift: false,
  countyShapes: () => counties, // Senate county figures use the old Connecticut counties
  target: f => countyTarget(f),
  drawShapes() {
    countyPaths().attr("fill", f => {
      const r = senateRace(f.properties.st), l = countyLean(r, f.properties.id);
      // live: a county of a followed state with no votes yet is "not counted yet", not "no race"
      return isLive() && r && !l ? colors.pending : leanColor(l);
    });
    statePaths().attr("fill", f => raceFill(senateRace(f.properties.st)));
  },
  // the hover box: a state's race, or a county's figures in it
  tip(f, target) {
    const st = f.properties.st, sname = data.states[st].name;
    let label, body, extraLine = "", hint = "";
    const r = senateRace(st), two = senateRaces(st).length > 1;
    if (target.type === "state") {
      label = sname + (r && (two || isLive()) ? ` <span class="ev">${seatLabel(r)}${two ? " (2 races)" : ""}</span>` : "");
      if (!r) body = `<span class="tip-note">${isLive() ? "No race followed tonight" : `No Senate race in ${state.year}`}</span>`;
      else if (isLive()) {
        body = liveTip(r);
      } else {
        body = raceTip(r, roundOf(r).votes, roundOf(r).total, raceLean(r), pastMark(r));
        extraLine = flipLine(r);
        if (r.rounds.length > 1) extraLine += `<span class="hint">${roundOf(r).label}</span>`;
      }
      if (!SINGLE.has(st)) hint = `<span class="hint">Click to see ${possessive(sname)} counties</span>`;
    } else {
      label = `${countyName(f.properties.id)}, ${data.states[st].abbr}`;
      const v = r?.counties?.[f.properties.id];
      if (!r) body = `<span class="tip-note">${isLive() ? "No race followed tonight" : `No Senate race in ${state.year}`}</span>`;
      else if (!v || (isLive() && !v[r.cands.length + 1])) body = `<span class="tip-note">${isLive() ? "No votes counted here yet" : "No county figures for this race"}</span>`;
      else {
        const n = r.cands.length, l = countyLean(r, f.properties.id);
        body = raceTip(r, v.slice(0, n), v[n + 1], l, isLive() ? -1 : l.lead);
        const cp = r.county_pct?.[f.properties.id];
        if (isLive() && cp != null) extraLine = `<span class="hint">${Math.round(cp)}% ${r.pct_of && r.pct_of.startsWith("precincts") ? "of precincts" : ""} reporting</span>`;
      }
    }
    return `<strong>${label}</strong>${body}${extraLine}${hint}`;
  },
  // the year ribbon: the Senate after the election (tonight: won or leading, with the seats not up)
  yearResult(y) {
    if (y === LIVE_YEAR) {
      if (state.office === "governor") return { party: null, text: `${y}: live` };
      const b = senateBalance(), [D, R] = ["D", "R"].map(p => b[p].notUp + b[p].called + b[p].leading);
      const p = senateControl({ D, R }, y);
      return { party: p, light: true, text: `${y} so far: ${CAUCUS_NAME[p] ?? "Even"} ${Math.max(D, R)}–${Math.min(D, R)} (won or leading, with the seats not up)` };
    }
    const c = extra.senate.control[y];
    if (!c) return { party: null, text: String(y) };
    const p = senateControl(c, y);
    return { party: p, text: `${y}: ${CAUCUS_NAME[p] ?? "Even"} ${Math.max(c.D, c.R)}–${Math.min(c.D, c.R)} seats` };
  },
  // races that may have had more than one round (November | Final)
  roundRaces: () => sYear(),
  // a state's counties follow the race chosen in the panel
  redrawOnSelect: true,
  headline: () => (isLive()
    ? ["Election night, <span class=\"nowrap\">November 3, 2026</span>",
      (state.office === "governor" ? "36 states elect a governor." : "35 Senate seats are on the ballot, including special elections in Florida and Ohio.")
        + " Results from state election offices and civicAPI. Times are in your time zone.",
      "Election night 2026 · Election Lens"]
    : ["How America voted for the Senate, <span class=\"nowrap\">2020 to 2024</span>",
      "Every Senate race in 2020, 2022 and 2024, by state and county. About a third of the Senate is elected every two years.",
      "Senate results · Election Lens"]),
  // the legend: races won, leading or changed party; seats with no earlier result noted
  legend: () => raceLegend({
    shown: isLive() ? liveRaces() : sYear(),
    noRace: true,
    note: (shown, heldOf) => flipNote(shown.filter(r => !heldOf(r)).length, shown.some(r => heldOf(r)), state.office === "governor" ? "races" : "seats", ""),
  }),
  // the panel: a state's race or a county in it, or the country's seats; past years or tonight
  panel: () => (isLive() ? livePanel() : pastPanel()),
  // the races card: every race, or a race's counties
  list(sel) {
    const y = String(state.year), st = stateOf(sel);
    if (sel.type === "nation") {
      const rs = [...sYear()].sort(byStateSeat);
      const here = stateOf(state.sel);
      return rs.length ? { title: "Races", items: rs.map(r => raceItem(r, `${data.states[r.st].abbr}${r.seat === "special" ? " sp." : ""}`,
        `data-race-st="${r.st}" data-race-seat="${r.seat}"`, r.st === here && r === senateRace(here))) } : null;
    }
    const r = senateRace(st), fs = Object.keys(r?.counties || {}).filter(f => data.counties[f]).sort(byName);
    return fs.length > 1 ? { title: `Counties in ${data.states[st].name}`, items: fs.map(f => countyItem(r, f)), cls: "places" } : null;
  },
  mapSeats: () => state.cmap === "winner",
  seatsLabel: "Seats",
  // the history card: this state's races (governors: last time only), or the Senate after each election
  history(seatsChart) {
    const s = state.sel, st = stateOf(s), pts = [];
    let title = "", note = "";
    if (state.office === "governor") {
      // governor history has no page of its own yet: last time only, not a link
      const r = st && senateRace(st), p = r?.prev;
      if (!p) return "";
      const w = p.cands.reduce((a, b) => (b.votes > a.votes ? b : a)), l = lean(p.cands, p.cands.map(c => c.votes), p.total);
      return `<h3>Last time</h3><ul class="race-list">${raceRow(null, String(p.year), personCell(w), "", leanLabel(l))}</ul>
        <p class="note">${p.year} result: MIT Election Data and Science Lab, precinct returns summed to the state.</p>`;
    } else if (s.type === "nation") {
      title = "Senate after each election";
      for (const y of withLive(extra.senate.years)) {
        // tonight: seats won or led so far, with the seats not up
        const live = y === LIVE_YEAR;
        let c = extra.senate.control[y];
        if (live) { const b = senateBalance(); c = { D: b.D.notUp + b.D.called + b.D.leading, R: b.R.notUp + b.R.called + b.R.leading }; }
        const ctl = senateControl(c, y);
        pts.push({ y, live, who: CAUCUS_NAME[ctl] ?? "Tied", lean: seatSpan(c, ctl),
          ...(seatsChart ? seatBar(c, ctl, 100) : popBar(senatePopular(y))) });
      }
    } else {
      title = s.type === "county" ? `${placeName(s)} in Senate races` : `Senate races in ${data.states[st].name}`;
      for (const y of withLive(extra.senate.years)) {
        const rs = senateRaces(st, y);
        for (const r of rs) {
          const l = s.type === "county" ? countyLean(r, s.id) : raceLean(r);
          if (!l) continue;
          pts.push({ y, seat: r.seat, live: y === LIVE_YEAR, label: `${y}${r.seat === "special" ? " sp." : ""}`, cur: y === state.year && (r.seat === state.seat || rs.length === 1),
            who: personCell(r.cands[l.lead ?? 0]), lean: leanLabel(l), ...(l.unopposed ? { m: null, text: "" } : marginBar(l)) });
        }
      }
      if (!pts.length) note = `No Senate race in ${data.states[st].name} from 2020 to 2024.`;
    }
    return { title, pts, note };
  },
  // a "2" on states with two Senate races that year (regular and special)
  badges() {
    const show = state.sel.type === "nation" && state.level === "states";
    const items = show
      ? [...new Set(sYear().map(r => r.st))].filter(st => senateRaces(st).length > 1)
        .map(st => ({ st, xy: path.centroid(stateById.get(st)) }))
      : [];
    const b = badgeMarks(items);
    b.select("circle").attr("fill", colors.ink);
    b.select("text").text("2").style("fill", colors.bg);
  },
};

// past years
function pastPanel() {
  const s = state.sel, y = String(state.year), st = stateOf(s);
  // seats and the popular vote together; the map's Winner | Margin control is separate
  if (s.type === "nation") return headline("senate", s, y) + senateSeatsBody(y);
  const rs = senateRaces(st), r = senateRace(st);
  const kind = r && rs.length > 1 ? (r.seat === "special" ? ", special election" : ", regular election") : r && r.seat === "special" ? ", special election" : "";
  let html = headline("senate", s, `${y}${kind}`);
  if (rs.length > 1) {
    html += `<div class="mode tabs" role="radiogroup" aria-label="Race">${rs.map(x =>
      `<button type="button" role="radio" aria-checked="${x === r}" data-seat="${x.seat}">${x.seat === "special" ? "Special election" : "Regular election"}</button>`).join("")}</div>`;
  }
  if (!r) html += `<p class="empty">No Senate race in ${data.states[st].name} in ${y}.</p>`;
  else html += s.type === "state" ? raceBody(r) : countyBody(r, s.id);
  return html;
}
export function senateSeatsBody(y) {
  const c = extra.senate.control[y], rs = sYear(y);
  const won = { D: 0, R: 0, I: 0 };
  for (const r of rs) won[r.cands[0].caucus]++;
  const t = {}, pg = pastGains(rs.map(r => [r.held, r.cands[0].caucus]));
  for (const p of ["D", "R", "I"]) t[p] = { solid: p === "I" ? 0 : c[p], lead: 0, solidText: "Seats after the election",
    lines: [`${c[p] - won[p]} not up`, `${won[p]} won`] };
  return `${tugBar(t, 100, senateNeed(tieBreaker(y)), pg, "seats", "", senateControl(c, y))}${popSection(senatePopular(y))}<p class="note">${SENATE_POP_NOTE}</p>`;
}

// tonight
function livePanel() {
  const s = state.sel, st = stateOf(s);
  let html;
  if (s.type === "nation") {
    html = headline(state.office, s, liveWhen()) + liveNationBody();
  } else {
    const rs = senateRaces(st), r = senateRace(st);
    html = headline(state.office, s, liveWhen(), r?.seat === "special");
    if (rs.length > 1) {
      html += `<div class="mode tabs" role="radiogroup" aria-label="Race">${rs.map(x =>
        `<button type="button" role="radio" aria-checked="${x === r}" data-seat="${x.seat}">${seatLabel(x)}</button>`).join("")}</div>`;
    }
    if (!r) html += `<p class="empty">No race followed in ${data.states[st].name} tonight.</p>`;
    else html += s.type === "state" ? liveRaceBody(r) : liveCountyBody(r, s.id);
  }
  return html;
}
export function senateBalanceBody() {
  const notUp = liveFile("senate")?.notUp;
  if (!notUp) return "";
  const b = senateBalance();
  const t = {};
  // independents who caucus with neither party (e.g. Dan Osborn) sit next to the Democrats
  for (const p of ["D", "R", "I"]) t[p] = { solid: b[p].notUp + b[p].called, lead: b[p].leading, solidText: "Not up or won",
    lines: [`${b[p].notUp} not up`, `${b[p].called} won`, `${b[p].leading} leading`] };
  const changed = (notUp.seats || []).filter(x => x.note);
  return `${tugBar(t, 100, senateNeed(tieBreaker(LIVE_YEAR)), liveRaces("senate"), "seats", "", senateSecured({ D: t.D.solid, R: t.R.solid }, LIVE_YEAR))}
    ${changed.length ? `<ul class="notes"><li>Seats not up held by someone other than that race's winner: ${changed.map(x => x.note).join(" ")}</li></ul>` : ""}
    ${popSection(senatePopular(null, liveRaces("senate")), true)}<p class="note">${SENATE_POP_NOTE.replace("this year's", "tonight's")}</p>`;
}
// governors: only tonight's races (we have no list of the governors not up)
export function governorTallyBody(rs) {
  const x = liveHouseTally(rs), t = wonLeadParts(x, ["D", "R", "I"]);
  return tugBar(t, rs.length, null, rs, "seats");
}
export function liveNationBody() {
  const rs = [...sYear()].sort(byStateSeat);
  if (!rs.length) return `<p class="empty">No results file yet. Start the importer: <code>uv run -m pipeline.us.live.importer</code></p>`;
  const test = rs.some(r => r.test) ? `<p class="test-flag">Test data, not real results</p>` : "";
  return `${test}${state.office === "senate" ? senateBalanceBody() : governorTallyBody(rs)}`;
}
