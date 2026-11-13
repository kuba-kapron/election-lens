// Start-up: read the link, load the data, draw the page.
import "./site.js";  // first: the page's address (language and country)
import { state } from "./state.js";
import { LIVE_YEAR, curYears, ensureData, failed, liveFile, loadLive } from "./data.js";
import { isLive } from "./rules.js";
import { initPlaces } from "./places.js";
import { render, select, setCmap, setLevel, setMode, setOffice, setYear } from "./actions.js";
import { readHash } from "./hash.js";
import "./theme.js";  // the light / dark switch
import { applyTexts } from "./texts.js";

applyTexts();  // the page frame in the page's language
try {
  readHash(true);
  // the Senate file labels midterm years in the ribbon; the live file labels 2026
  await Promise.all([ensureData(state.office), ensureData("senate"), loadLive(+state.year === LIVE_YEAR ? state.office : "senate")]);
  readHash();
  await ensureData(state.office, state.year);
  initPlaces();

  // re-read the results file every 30 seconds; redraw only when it changed
  setInterval(async () => {
    if (!isLive()) return;
    const before = liveFile()?.updated;
    await loadLive(state.office);
    if (liveFile()?.updated !== before) render({ years: true, map: true, panel: true });
  }, 30000);

  document.querySelectorAll("[data-office]").forEach(b => b.addEventListener("click", () => setOffice(b.dataset.office)));
  document.querySelectorAll("[data-mode]").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));
  document.querySelectorAll("[data-level]").forEach(b => b.addEventListener("click", () => setLevel(b.dataset.level)));
  document.querySelectorAll("[data-cmap]").forEach(b => b.addEventListener("click", () => setCmap(b.dataset.cmap)));
  document.querySelectorAll("[data-round]").forEach(b => b.addEventListener("click", () => {
    state.firstRound = b.dataset.round === "november";
    render({ toggles: true, map: true, panel: true, hash: true });
  }));
  document.addEventListener("keydown", e => {
    if (e.target.closest("select, input, textarea")) return;
    const ys = curYears(), i = ys.indexOf(state.year);
    if (e.key === "ArrowRight" && i < ys.length - 1) setYear(ys[i + 1]);
    if (e.key === "ArrowLeft" && i > 0) setYear(ys[i - 1]);
    if (e.key === "Escape") select({ type: "nation" }, true);
  });
  window.addEventListener("hashchange", async () => {
    readHash(true);
    await ensureData(state.office);
    readHash();
    await ensureData(state.office, state.year);
    render({ toggles: true, headline: true, years: true, map: true });
    select(state.sel, true);
  });

  render({ toggles: true, headline: true, years: true, map: true });
  select(state.sel, state.sel.type !== "nation");
} catch (err) {
  failed(err);
}
