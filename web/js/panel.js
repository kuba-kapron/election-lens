// The results panel and the breadcrumb.
import { t } from "./texts.js";
import { state, ui } from "./state.js";
import { country, view } from "./country.js";
import { fitNames } from "./components.js";
import { filterList, historyCard, listView, racesCard } from "./cards.js";
import { render, select } from "./actions.js";

// where the map is: "United States › Ohio › Franklin County" (the country lists the levels);
// each level above is a link
export const crumbsEl = document.getElementById("crumbs");
export function drawCrumbs() {
  const parts = country.crumbs(state.sel);
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
    e.target.textContent = listView.open ? t("showFewer") : t("showAll", e.target.dataset.n);
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
    country.setYear(+b.dataset.hist);
  }));
  splitPanel();
  fitNames();
  country.afterCards?.();
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
// the panel: the view's HTML (see its views/) and seat tabs, with the country's extra work before
// and after (US tonight: the footer's sources, the race chart)
export function drawPanelBody() {
  country.beforePanel?.();
  panel.innerHTML = view().panel();
  bindSeatTabs();
  country.afterPanel?.();
}

// a state with two races (regular and special Senate, or tonight's Senate and governor): its tabs
export function chooseSeat(seat) {
  state.seat = seat;
  render({ map: true, panel: true, hash: true });
}
export const bindSeatTabs = () => panel.querySelectorAll(".tabs [data-seat]").forEach(b => b.addEventListener("click", () => chooseSeat(b.dataset.seat)));
