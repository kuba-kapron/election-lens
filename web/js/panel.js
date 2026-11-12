// The results panel and the breadcrumb.
import { state, ui } from "./state.js";
import { data, extra } from "./data.js";
import { fmtInt } from "./format.js";
import { SINGLE, atLarge, byCount, countyLean, ec, evOf, hRaces, houseMajority, houseNet, houseVotes, isLive, isNewSeat, lean, pastGains, pastMark, prevYear, record, sYear, senateControl, senatePopular, senateRace, senateRaces, shift, shownRound, stateDistricts, stateOf, tieBreaker, wonBy } from "./rules.js";
import { colors } from "./colors.js";
import { CAUCUS_NAME, COUNTRY, SENATE_POP_NOTE, candRow, countyName, districtName, drawPhotoCredits, evRow, fitNames, flagBox, fullName, headline, noDataReason, notesList, partyTag, peopleRows, personRow, popSection, senateNeed, tugBar, wonParts } from "./components.js";
import { drawLivePanel } from "./live.js";
import { filterList, historyCard, listView, racesCard } from "./cards.js";
import { render, select, setYear } from "./actions.js";

// where the map is: "United States › Ohio › Franklin County"; each level above is a link
export const crumbsEl = document.getElementById("crumbs");
export function drawCrumbs() {
  const sel = state.sel, st = stateOf(sel), parts = [[{ type: "nation" }, `${flagBox()}${COUNTRY.name}`]];
  if (st) parts.push([{ type: "state", id: st }, data.states[st].name]);
  if (sel.type === "county" && !SINGLE.has(st)) parts.push([sel, countyName(sel.id)]);
  if (sel.type === "district" && !atLarge(st)) parts.push([sel, `${districtName(sel.id, true)} district`]);
  crumbsEl.innerHTML = parts.map(([, label], i) => i < parts.length - 1
    ? `<button type="button" class="quiet" data-crumb="${i}">${label}</button><span class="sep" aria-hidden="true">›</span>`
    : `<span aria-current="location">${label}</span>`).join("");
  crumbsEl.querySelectorAll("[data-crumb]").forEach(b => b.addEventListener("click", () => select(parts[+b.dataset.crumb][0], true)));
}

export const panel = document.getElementById("panel");
// the list of races (a state's districts, tonight's races, a state's Senate races) is drawn
// with the panel, then moved to its own section under the map and the panel
export const racesEl = document.getElementById("races"), historyEl = document.getElementById("history");
export function drawPanel() {
  drawPanelBody();
  // a row in a whole-country race list opens that state's race (past years and tonight)
  racesEl.innerHTML = racesCard();
  racesEl.hidden = !racesEl.innerHTML;
  // a Senate or governor race opens its state with that race chosen; other rows open the place
  racesEl.querySelectorAll("[data-race-st]").forEach(b => b.addEventListener("click", () => {
    select({ type: "state", id: b.dataset.raceSt }, true);
    chooseSeat(b.dataset.raceSeat);
  }));
  racesEl.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => {
    const [type, id] = b.dataset.go.split(":");
    select({ type, id }, true);
  }));
  const typing = document.activeElement?.classList.contains("list-search");  // a live refresh keeps the cursor in the field
  racesEl.querySelector(".list-more")?.addEventListener("click", e => {
    listView.open = racesEl.querySelector(".race-list").classList.toggle("open");
    e.target.setAttribute("aria-expanded", listView.open);
    e.target.textContent = listView.open ? "Show fewer" : `Show all ${e.target.dataset.n}`;
    // collapsing from far down the list: bring the card's top back into view
    if (!listView.open && racesEl.getBoundingClientRect().top < 0) racesEl.scrollIntoView({ block: "start" });
  });
  const sf = racesEl.querySelector(".list-search");
  sf?.addEventListener("input", () => { listView.q = sf.value; filterList(); });
  if (sf && typing) { sf.focus(); sf.setSelectionRange(sf.value.length, sf.value.length); }
  filterList();
  racesEl.querySelector("select[data-sort]")?.addEventListener("change", e => {
    ui.raceSort = e.target.value;
    try { localStorage.setItem("raceSort", ui.raceSort); } catch (err) { /* private mode: this visit only */ }
    drawPanel();
  });
  // this race at this level in every election: its own card under the races card
  historyEl.innerHTML = historyCard();
  historyEl.hidden = !historyEl.innerHTML;
  historyEl.querySelectorAll("[data-hist-mode]").forEach(b => b.addEventListener("click", () => {
    ui.histMode = b.dataset.histMode;
    drawPanel();
  }));
  historyEl.querySelectorAll("[data-hist]").forEach(b => b.addEventListener("click", () => {
    if (b.dataset.histSeat) state.seat = b.dataset.histSeat;
    setYear(+b.dataset.hist);
  }));
  splitPanel();
  fitNames();
  drawPhotoCredits();
}
// the panel in two parts: the headline with the first numbers (totals bar, or the candidates
// and their grey line), then the rest. One card on wide screens; on narrow ones CSS puts the
// first part above the map and the rest below it
export function splitPanel() {
  const kids = [...panel.children];
  let end = kids.findIndex(e => e.matches(".tug, .cand, .empty"));
  if (end < 0) end = kids.length - 1;
  while (kids[end + 1]?.matches("p.note")) end++;
  const top = document.createElement("div"), rest = document.createElement("div");
  top.className = "panel-top";
  rest.className = "panel-rest";
  top.append(...kids.slice(0, end + 1));
  rest.append(...kids.slice(end + 1));
  panel.replaceChildren(top, rest);
}
export function drawPanelBody() {
  if (state.office !== "president") return drawCongressPanel();
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

  panel.innerHTML = html;
}

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
// a whole race: statewide (Senate) or district (House)
export function raceBody(r) {
  if (!r.rounds.length) {
    return `<div class="cand">${personRow(r.cands[0], null, null, true)}</div>
      <p class="note">Won unopposed${isNewSeat(r) ? " · New seat" : ""}</p>${notesList(r.notes)}`;
  }
  const last = r.rounds.length - 1;
  const ri = shownRound(r);
  const rd = r.rounds[ri], l = lean(r.cands, rd.votes, rd.total);
  // grey lines, as tonight: what the numbers are, and whether the seat changed party
  const facts = [rd.label, `${fmtInt(rd.total)} votes`];
  if (isNewSeat(r)) facts.push("New seat");
  if (ri !== last) facts.push(`decided in the ${r.rounds[last].kind === "runoff" ? "runoff" : "final round"}`);
  const w = r.cands[0].caucus;
  const flip = ri === last && r.held && r.held !== w
    ? `<p class="note"><strong>Flipped</strong> · ${CAUCUS_NAME[w]} gained the seat from the ${CAUCUS_NAME[r.held]}</p>` : "";
  // an earlier round: no winner yet; those in the next round advanced (→, bold)
  const mark = pastMark(r);
  return `<div class="cand">${peopleRows(r.cands, rd.votes, rd.total, rd.other, mark)}</div>
    <p class="note">${facts.join(" · ")}</p>${flip}${notesList(r.notes)}`;
}
export function countyBody(r, fips) {
  const v = r.counties?.[fips];
  if (!v) return `<p class="empty">No county figures for this race.</p>${notesList(r.notes)}`;
  const n = r.cands.length, l = countyLean(r, fips), cr = r.rounds[r.county_round];
  let note = `County figures: ${cr.label}.`;
  if (r.county_round !== r.rounds.length - 1) note += ` The seat was decided in the ${r.rounds[r.rounds.length - 1].kind === "runoff" ? "runoff" : "ranked-choice count"}, which has no county figures.`;
  return `<div class="cand">${peopleRows(r.cands, v.slice(0, n), v[n + 1], v[n], l.lead)}</div>
    <p class="note">${fmtInt(v[n + 1])} votes · ${note}</p>${notesList(r.notes)}`;
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

// a state with two races (regular and special Senate, or tonight's Senate and governor): its tabs
export function chooseSeat(seat) {
  state.seat = seat;
  render({ map: true, panel: true, hash: true });
}
export const bindSeatTabs = () => panel.querySelectorAll(".tabs [data-seat]").forEach(b => b.addEventListener("click", () => chooseSeat(b.dataset.seat)));
export function drawCongressPanel() {
  if (isLive()) return drawLivePanel();
  const s = state.sel, y = String(state.year), sen = state.office === "senate", st = stateOf(s);
  let html;
  if (s.type === "nation") {
    // seats and the popular vote together; the map's Winner | Margin control is separate
    html = headline(sen ? "senate" : "house", s, y) + (sen ? senateSeatsBody(y) : houseSeatsBody(y));
  } else if (sen) {
    const rs = senateRaces(st), r = senateRace(st);
    const kind = r && rs.length > 1 ? (r.seat === "special" ? ", special election" : ", regular election") : r && r.seat === "special" ? ", special election" : "";
    html = headline("senate", s, `${y}${kind}`);
    if (rs.length > 1) {
      html += `<div class="mode tabs" role="radiogroup" aria-label="Race">${rs.map(x =>
        `<button type="button" role="radio" aria-checked="${x === r}" data-seat="${x.seat}">${x.seat === "special" ? "Special election" : "Regular election"}</button>`).join("")}</div>`;
    }
    if (!r) html += `<p class="empty">No Senate race in ${data.states[st].name} in ${y}.</p>`;
    else html += s.type === "state" ? raceBody(r) : countyBody(r, s.id);
  } else if (s.type === "district" || atLarge(st)) {
    const id = s.type === "district" ? s.id : `${st}-00`, r = hRaces()[id];
    html = headline("house", { type: "district", id }, y) + (r ? raceBody(r) : `<p class="empty">No result.</p>`);
  } else {
    const n = stateDistricts(hRaces(), st).length;
    html = headline("house", s, `${y} · ${n} districts`) + houseStateBody(st);
  }
  panel.innerHTML = html;
  bindSeatTabs();
}
