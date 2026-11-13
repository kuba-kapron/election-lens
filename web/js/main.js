// Start-up: read the address, load the country (its data, views and rules), draw the page.
import { site } from "./site.js";
import { applyTexts } from "./texts.js";
import { state } from "./state.js";
import { country, setCountry } from "./country.js";
import { failed } from "./components.js";
import { initMap } from "./map.js";
import { initFinder } from "./finder.js";
import { render, select } from "./actions.js";
import "./theme.js";  // the light / dark switch

applyTexts();  // the page frame in the page's language
try {
  // the country's own code, in web/js/<code>/: loading it loads its data too
  setCountry((await import(`./${site.code}/country.js`)).default);
  initMap();
  initFinder();
  await country.start();  // reads the link, loads what the first view needs
  // ← → step through the years of the race in view; Escape goes back to the whole country
  document.addEventListener("keydown", e => {
    if (e.target.closest("select, input, textarea")) return;
    const ys = country.years(), i = ys.indexOf(state.year);
    if (e.key === "ArrowRight" && i < ys.length - 1) country.setYear(ys[i + 1]);
    if (e.key === "ArrowLeft" && i > 0) country.setYear(ys[i - 1]);
    if (e.key === "Escape") select({ type: "nation" }, true);
  });
  render({ toggles: true, headline: true, years: true, map: true });
  select(state.sel, state.sel.type !== "nation");
} catch (err) {
  failed(err);
}
