// What is on screen (office, year, place, map options) and per-visit view settings.
// office: president | senate | house | governor   mode: margin | shift   level: counties | states
// seat: regular | special (Senate state with two races)   round: index of the election round shown, null = deciding
// cmap: how state and race maps are colored: "winner" (won or called: solid, flips striped;
// tonight's leads in one light shade) or "margin" (shaded by margin); the president's
// Winner | Margin | Shift control sets it together with mode
export const state = { office: "president", year: 2024, mode: "margin", level: "states", cmap: "winner", arrows: false,
  seat: "regular", round: null, sel: { type: "nation" } };
// per-visit view settings used by several parts of the page: the History card's chart (seats or
// popular vote, null = as the map shows) and the race lists' order (remembered per browser)
export const ui = { histMode: null, raceSort: "az" };
