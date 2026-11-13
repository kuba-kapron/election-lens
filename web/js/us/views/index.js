// The view for each race: everything that differs between offices (map colors, hover box,
// legend, panel, race lists) is one object per kind of race, with the same parts:
//   districts       true when the map shows districts instead of counties and states
//   shift           true when the race has a Shift view (with arrows) and the one Winner |
//                   Margin | Shift control
//   countyShapes(y) the county shapes for a year's map
//   target(f)       what a click on a shape picks
//   drawShapes()    colors the map's shapes
//   badges()        the round badges inside states
//   tip(f, target)  the hover box's HTML for a shape (target: what a click on it picks)
//   legend()        the legend's HTML
//   panel()         the results panel's HTML
//   list(sel)       the Races card's rows at this level (or null: the level above is shown)
//   mapSeats()      whether the map's coloring makes the History chart show seats
//   seatsLabel      the History chart's seats button
//   history(seatsChart) the History card's points, or its own HTML
//   yearResult(y)   a year in the ribbon: { party, light, text }
//   roundRaces()    the races that may have had more rounds (November | Final)
//   redrawOnSelect  whether picking a place recolors the map
//   headline()      [page headline HTML, the line under it, the tab title]
// A new office or country adds its own view; the rest of the page asks view().
import { state } from "../../state.js";
import { presidentView } from "./president.js";
import { statewideView } from "./statewide.js";
import { houseView } from "./house.js";

// looked up on each call: the view modules and the map import each other, so the objects may not
// exist yet while the modules load
export const view = (office = state.office) =>
  ({ president: presidentView, senate: statewideView, governor: statewideView, house: houseView })[office];
