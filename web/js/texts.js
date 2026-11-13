// The page's texts in each language (decided November 13, 2026). t("key") gives the text in the
// page's language (web/js/site.js), or English where a language has none yet; a function takes
// values (t("showAll", 435)). Only what every country's page shares lives here; each view
// writes its own labels through t() too. The US views' texts stay in English in the code until
// the US pages are translated.
import { site } from "./site.js";

const TEXTS = {
  en: {
    // numbers: 1,234 and 45.3%
    thousands: ",", decimal: ".",
    // page frame (index.html, data-t)
    race: "Race", darkMode: "Dark mode", toLight: "Switch to light mode", toDark: "Switch to dark mode",
    electionYear: "Election year", earlier: "Earlier election", later: "Later election",
    map: "Map", mapShows: "Map shows", colorBy: "Color races by", whereMap: "Where the map is",
    winner: "Winner", margin: "Margin", shift: "Shift",
    races: "Races", earlierElections: "Earlier elections",
    license: "Election Lens is open source under the AGPL-3.0 license.",
    noData: "The map data could not be loaded. Serve the web folder over HTTP (for example <code>python3 -m http.server</code>) instead of opening the file directly.",
    // Races and History cards
    sort: "Sort", az: "A–Z", za: "Z–A", firstLast: "1st–last", lastFirst: "Last–1st",
    closest: "Closest first", widest: "Widest first",
    filter: "Filter", filterList: what => `Filter ${what}`, noMatches: "No matches.",
    showAll: n => `Show all ${n}`, showFewer: "Show fewer",
    noVotesYet: "No votes yet", chart: "Chart", popularVote: "Popular vote",
    // the marks after a winner's name, for screen readers
    srWinner: "winner", srWon: "won",
  },
};

export function t(key, ...values) {
  const s = TEXTS[site.lang]?.[key] ?? TEXTS.en[key];
  if (s === undefined) throw new Error(`no text "${key}"`);
  return typeof s === "function" ? s(...values) : s;
}

// index.html: data-t="key" sets the text, data-t="title:key aria-label:key" attributes
export function applyTexts(root = document) {
  document.documentElement.lang = site.lang;
  for (const el of root.querySelectorAll("[data-t]")) {
    for (const part of el.dataset.t.split(" ")) {
      const [a, k] = part.includes(":") ? part.split(":") : [null, part];
      if (a) el.setAttribute(a, t(k));
      else el.textContent = t(k);
    }
  }
}
