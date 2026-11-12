// The year ribbon and the country menu.
import { state } from "./state.js";
import { LIVE_YEAR, curYears } from "./data.js";
import { ckey, colors } from "./colors.js";
import { liveTag } from "./components.js";
import { setYear } from "./actions.js";
import { view } from "./views/index.js";

// One row of the race's years, scrolling sideways when they do not fit. Under each year a thin
// bar in the winner's color (the Electoral College winner; the Senate or House majority);
// tonight's bar is light while races are still being called. The result is in the hover text.
export const yearList = d3.select("#year-list"), yearOl = document.getElementById("year-list");
// the hover text and bar color of one year in the ribbon (see views/)
export const yearResult = y => view().yearResult(y);
// how many years are in view: as many whole ones as fit at --year-min (CSS), at most all of them
export function sizeYears() {
  const min = parseFloat(getComputedStyle(yearOl).getPropertyValue("--year-min")) || 100;
  const n = Math.max(1, Math.min(curYears().length, Math.floor(yearOl.clientWidth / min)));
  yearOl.style.setProperty("--years-in-view", n);
}
new ResizeObserver(() => { sizeYears(); }).observe(yearOl.parentElement);
export function drawYears() {
  const ys = curYears();
  sizeYears();
  yearList.selectAll("li").data(ys, y => y).join(enter => {
    const li = enter.append("li");
    li.append("button").attr("type", "button").on("click", (e, y) => setYear(y));
    return li;
  }).select("button")
    .attr("aria-current", y => String(y === state.year))
    .each(function (y) {
      const r = yearResult(y);
      this.title = r.text;
      const bar = r.party ? `<i class="yr-bar${r.light ? " light" : ""}" style="background:${colors[ckey(r.party) + "Solid"]}"></i>` : `<i class="yr-bar none"></i>`;
      this.innerHTML = `<span class="yr">${y}${bar}</span>${y === LIVE_YEAR ? liveTag() : ""}`;
    });
  // ‹ ›: the previous or next year of this race
  const i = ys.indexOf(state.year);
  document.querySelectorAll(".years-step").forEach(b => { b.disabled = +b.dataset.step < 0 ? i <= 0 : i >= ys.length - 1; });
  // keep the chosen year in view
  const cur = yearOl.querySelector('[aria-current="true"]');
  if (cur) {
    const l = cur.offsetLeft - yearOl.offsetLeft, r = l + cur.offsetWidth;
    if (l < yearOl.scrollLeft) yearOl.scrollLeft = l - 8;
    else if (r > yearOl.scrollLeft + yearOl.clientWidth) yearOl.scrollLeft = r - yearOl.clientWidth + 8;
  }
}
document.querySelectorAll(".years-step").forEach(b => b.addEventListener("click", () => {
  const ys = curYears(), y = ys[ys.indexOf(state.year) + +b.dataset.step];
  if (y) setYear(y);
}));
// the country menu: one country for now
{
  const box = document.getElementById("country"), btn = box.querySelector(".country-btn"), menu = box.querySelector(".country-menu");
  const show = on => { menu.hidden = !on; btn.setAttribute("aria-expanded", String(on)); };
  btn.addEventListener("click", () => show(menu.hidden));
  document.addEventListener("click", e => { if (!box.contains(e.target)) show(false); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !menu.hidden) { show(false); btn.focus(); } });
}
