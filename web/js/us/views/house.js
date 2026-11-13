// The House: 435 districts on each year's district map; past years and tonight.
import { state } from "../../state.js";
import { LIVE_YEAR, data, extra, loadLive, path, redrawn } from "../data.js";
import { possessive } from "../../format.js";
import { atLarge, counted, hRaces, houseMajority, houseNet, houseRaces, houseVotes, isLive, isNewSeat, liveHouseTally, pastMark, raceLean, roundOf, samePlan, stateDistricts, stateOf } from "../rules.js";
import { raceFill } from "../../colors.js";
import { CAUCUS_NAME, districtLabel, districtName, flipLine, headline, leanLabel, liveWhen, notesList, personCell, popSection, seatSpan, tugBar, wonLeadParts, wonParts } from "../../components.js";
import { badgeMarks, gDistricts, mapHandlers, withNewConnecticut } from "../../map.js";
import { liveTip, raceTip } from "../../tooltip.js";
import { raceLegend } from "../../legend.js";
import { drawYears } from "../../nav.js";
import { raceBody } from "../../panel.js";
import { liveRaceBody } from "../live.js";
import { marginBar, popBar, raceItem, seatBar, withLive } from "../../cards.js";

let houseAsked = false;  // tonight's House file, fetched once for the ribbon
export const houseView = {
  districts: true,
  shift: false,
  countyShapes: y => withNewConnecticut(y),
  // at the country level a click picks the state; inside it, a district (a state with one seat: the state)
  target(f) {
    const st = f.properties.st;
    if (stateOf(state.sel) !== st || atLarge(st)) return { type: "state", id: st };
    return { type: "district", id: f.properties.id };
  },
  drawShapes() {
    const races = hRaces();
    gDistricts.selectAll("path.district")
      .data(extra.districts[state.year], f => f.properties.id)
      .join(enter => mapHandlers(enter.append("path").attr("class", "district")))
      .attr("d", path) // district lines change from year to year
      .attr("fill", f => raceFill(races[f.properties.id]));
  },
  // the hover box: a district, a state's one seat, or a state's seats won
  tip(f, target) {
    const st = f.properties.st, sname = data.states[st].name;
    let label, body, extraLine = "", hint = "";
    const races = hRaces();
    if (target.type === "state") {
      if (atLarge(st)) {
        const r = races[`${st}-00`];
        label = `${sname} <span class="ev">At large, 1 seat</span>`;
        body = isLive() ? liveTip(r) : raceTip(r, roundOf(r)?.votes, roundOf(r)?.total, raceLean(r), pastMark(r));
        if (!isLive()) extraLine = flipLine(r);
      } else {
        const ds = stateDistricts(races, st);
        const won = { D: 0, R: 0, I: 0 };
        const live = isLive(), shown = live ? ds.filter(([, r]) => counted(r)) : ds;
        shown.forEach(([, r]) => won[raceLean(r)?.caucus ?? r.cands[0].caucus]++);
        label = `${sname} <span class="ev">${ds.length} districts</span>`;
        body = live && !shown.length ? `<span class="tip-note">No votes counted yet</span>`
          : `<span class="tip-note">${live ? "Leading: " : ""}${["D", "R", "I"].filter(c => won[c]).map(c => `${CAUCUS_NAME[c]} ${won[c]}`).join(", ")}</span>`;
        hint = `<span class="hint">Click to see ${possessive(sname)} districts</span>`;
      }
    } else {
      const r = races[f.properties.id];
      label = districtName(f.properties.id);
      body = !r ? "No result" : isLive() ? liveTip(r) : raceTip(r, roundOf(r)?.votes, roundOf(r)?.total, raceLean(r), pastMark(r));
      if (r && !isLive()) extraLine = flipLine(r);
    }
    return `<strong>${label}</strong>${body}${extraLine}${hint}`;
  },
  // the year ribbon: the House majority (tonight: won or leading)
  yearResult(y) {
    const seats = (D, R) => (D > R ? "D" : R > D ? "R" : null);
    if (y === LIVE_YEAR) {
      // tonight's House file loads with its page; for the bar, fetch it once and draw again
      if (!extra.live?.house && !houseAsked) { houseAsked = true; loadLive("house").then(drawYears); }
      const { D, R } = liveHouseTally(Object.values(houseRaces(y)));
      const p = seats(D, R);
      return { party: p, light: true, text: `${y} so far: ${CAUCUS_NAME[p] ?? "Even"} ${Math.max(D, R)}–${Math.min(D, R)} (won or leading)` };
    }
    const c = extra.house.seats[y];
    if (!c) return { party: null, text: String(y) };
    const p = seats(c.D, c.R);
    return { party: p, text: `${y}: ${CAUCUS_NAME[p] ?? "Even"} ${Math.max(c.D, c.R)}–${Math.min(c.D, c.R)} seats` };
  },
  roundRaces: () => Object.values(hRaces()),
  redrawOnSelect: true,
  headline: () => (isLive()
    ? ["Election night, <span class=\"nowrap\">November 3, 2026</span>",
      "All 435 seats, on this year's district maps (nine states drew new ones). Results from state election offices and civicAPI. Times are in your time zone.",
      "Election night 2026 · Election Lens"]
    : ["How America voted for the House, <span class=\"nowrap\">2020 to 2024</span>",
      "All 435 seats in 2020, 2022 and 2024, district by district.",
      "House results · Election Lens"]),
  // the legend: seats won, leading or changed party; the note names redrawn states and new seats
  legend: () => raceLegend({ shown: Object.values(hRaces()), noRace: false, note: () => houseNote(state.year) }),
  // the panel: a district, a state's delegation, or the country's seats; past years or tonight
  panel: () => (isLive() ? livePanel() : pastPanel()),
  // the races card: every district, or a state's districts
  list(sel) {
    const y = String(state.year), st = stateOf(sel);
    const ids = Object.keys(hRaces()).filter(id => !st || id.startsWith(st + "-")).sort((a, b) =>
      data.states[a.slice(0, 2)].abbr.localeCompare(data.states[b.slice(0, 2)].abbr) || a.localeCompare(b));
    if (st && ids.length < 2) return null;
    const label = id => (st ? districtLabel(id, hRaces()[id])
      : `${data.states[id.slice(0, 2)].abbr} ${+id.slice(3) || "AL"}${isNewSeat(hRaces()[id]) ? ` <span class="new" title="New seat: no earlier holder">new</span>` : ""}`);
    return { title: st ? `Districts in ${data.states[st].name}` : "Districts", first: st ? "1st–" : "A–Z",
      items: ids.map(id => raceItem(hRaces()[id], label(id), `data-go="district:${id}"`)) };
  },
  mapSeats: () => state.cmap === "winner",
  seatsLabel: "Seats",
  // the history card: this district, the state's delegation, or the House after each election
  history(seatsChart) {
    const s = state.sel, st = stateOf(s), pts = [];
    let title = "", note = "";
    if (s.type === "nation") {
      title = "House after each election";
      for (const y of withLive(extra.house.years)) {
        // tonight: seats won or led so far
        const live = y === LIVE_YEAR;
        const t = live ? liveHouseTally(Object.values(houseRaces(y))) : extra.house.seats[y];
        const c = live ? { D: t.D, R: t.R } : t;
        const pop = live ? houseVotes(Object.values(houseRaces(y))) : extra.house.popular[y];
        const ctl = houseMajority(c) ?? (c.D > c.R ? "D" : c.R > c.D ? "R" : null);
        pts.push({ y, live, who: CAUCUS_NAME[ctl] ?? "No majority", lean: seatSpan(c, ctl),
          ...(seatsChart ? seatBar(c, ctl, 435) : popBar(pop)) });
      }
    } else if (s.type === "district" || atLarge(st)) {
      const id = s.type === "district" ? s.id : `${st}-00`;
      title = districtName(id);
      for (const y of withLive(extra.house.years)) {
        const r = houseRaces(y)[id], l = r && (y !== LIVE_YEAR || counted(r)) ? raceLean(r) : null;
        if (!l) continue;
        const faded = !samePlan(st, y, state.year);
        pts.push({ y, faded, live: y === LIVE_YEAR, label: String(y), rowLabel: `${y}${faded ? ` <span class="old" title="Drawn differently from the ${state.year} map">old map</span>` : ""}`,
          who: personCell(r.cands[l.lead ?? 0]), lean: leanLabel(l), ...(l.unopposed ? { m: null, text: "" } : marginBar(l)) });
      }
    } else {
      title = `${possessive(data.states[st].name)} House delegation`;
      for (const y of withLive(extra.house.years)) {
        const mine = stateDistricts(houseRaces(y), st).map(([, r]) => r);
        const won = y === LIVE_YEAR ? liveHouseTally(mine) : { D: 0, R: 0, I: 0 };
        if (y !== LIVE_YEAR) for (const r of mine) won[r.cands[0].caucus]++;
        const n = won.D + won.R + won.I, ctl = won.D > won.R ? "D" : won.R > won.D ? "R" : null;
        pts.push({ y, live: y === LIVE_YEAR, who: CAUCUS_NAME[ctl] ?? "Even", lean: seatSpan({ D: won.D, R: won.R, I: won.I }, ctl), ...seatBar(won, ctl, n) });
      }
    }
    return { title, pts, note };
  },
  badges: () => badgeMarks([]),
};

// House: the note under the legend names the redrawn states, where the previous holder is
// the incumbent or else the last winner of the district number, and new seats with no holder
export function houseNote(y) {
  const prevY = +y - 2;
  if (!extra.house?.races[String(prevY)]) return "";
  const sts = Object.keys(extra.plans?.[String(y)] || {}).filter(st => redrawn(st, y)).map(st => data.states[st].abbr).sort();
  if (!sts.length) return "";
  const fresh = Object.entries(houseRaces(y)).filter(([, r]) => isNewSeat(r)).map(([id]) => `${data.states[id.slice(0, 2)].abbr}-${+id.slice(3)}`);
  return `<span class="legend-note">* Redrawn since ${prevY} (${sts.length <= 12 ? sts.join(", ") : `${sts.length} states`}): against the incumbent, or else the last winner of the district number.${fresh.length ? ` New seats with no incumbent have no earlier holder: ${fresh.join(", ")}.` : ""}</span>`;
}

// past years
function pastPanel() {
  const s = state.sel, y = String(state.year), st = stateOf(s);
  // seats and the popular vote together; the map's Winner | Margin control is separate
  if (s.type === "nation") return headline("house", s, y) + houseSeatsBody(y);
  if (s.type === "district" || atLarge(st)) {
    const id = s.type === "district" ? s.id : `${st}-00`, r = hRaces()[id];
    return headline("house", { type: "district", id }, y) + (r ? raceBody(r) : `<p class="empty">No result.</p>`);
  }
  const n = stateDistricts(hRaces(), st).length;
  return headline("house", s, `${y} · ${n} districts`) + houseStateBody(st);
}
export function houseSeatsBody(y) {
  const c = extra.house.seats[y];
  const t = wonParts(c, ["D", "R"]);
  return `${tugBar(t, 435, "218 for a majority", houseNet(y), "districts", "", houseMajority(c))}${popSection(extra.house.popular[y])}`;
}
export function houseStateBody(st) {
  const races = stateDistricts(hRaces(), st).sort();
  const won = { D: 0, R: 0, I: 0 };
  races.forEach(([, r]) => won[r.cands[0].caucus]++);
  // the same bar as the country view: seats won in this state's delegation, and seats that changed party
  const t = wonParts(won, ["D", "R", "I"]);
  return `${tugBar(t, races.length, "", houseNet(state.year, st), "districts")}${popSection(houseVotes(races.map(([, r]) => r)))}`;
}

// tonight
export function liveHouseNationBody() {
  const rs = Object.values(hRaces());
  if (!rs.length) return `<p class="empty">No House results yet. Start the importer: <code>uv run -m pipeline.us.live.importer</code></p>`;
  const x = liveHouseTally(rs), t = wonLeadParts(x, ["D", "R"]);
  const test = rs.some(r => r.test) ? `<p class="test-flag">Test data, not real results</p>` : "";
  return `${test}${tugBar(t, 435, "218 for a majority", houseNet(LIVE_YEAR), "districts", "", houseMajority({ D: t.D.solid, R: t.R.solid }))}${popSection(houseVotes(rs), true)}
`;
}
function livePanel() {
  const s = state.sel, st = stateOf(s), races = hRaces();
  let html;
  if (s.type === "nation") {
    html = headline("house", s, liveWhen()) + liveHouseNationBody();
  } else if (s.type === "district" || atLarge(st)) {
    const id = s.type === "district" ? s.id : `${st}-00`, r = races[id];
    html = headline("house", { type: "district", id }, liveWhen()) + (r ? liveRaceBody(r, id) + notesList(r.notes) : `<p class="empty">No result.</p>`);
  } else {
    const ds = stateDistricts(races, st).sort();
    const t = liveHouseTally(ds.map(([, r]) => r));
    const tt = wonLeadParts(t, ["D", "R", "I"]);
    html = `${headline("house", { type: "state", id: st }, `${liveWhen()} · ${ds.length} districts`)}
      ${tugBar(tt, ds.length, "", houseNet(LIVE_YEAR, st), "districts")}${t.none ? `<p class="tug-other">${t.none} with no votes counted yet.</p>` : ""}${popSection(houseVotes(ds.map(([, r]) => r)), true)}${notesList(ds[0]?.[1].notes)}`;
  }
  return html;
}
