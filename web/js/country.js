// The country the page shows (decided November 13, 2026): main.js loads web/js/<code>/country.js
// (picked by the address, see site.js) and hands its description here before anything is drawn.
// The shared code asks it for everything that differs between countries; each office within a
// country has a view (view()). A country description has (US: web/js/us/country.js):
//   name, flag              for the breadcrumb and the panel's corner
//   W, H, path              the map's size in its own units, and the d3 path of its projection
//   start()                 reads the link, loads what the first view needs, draws the page
//   view(office)            the view for an office (see web/js/us/views/index.js)
//   years()                 the years the race in view has (the year ribbon)
//   setYear(y)              opens another year of the race in view
//   yearFill(r), yearTag(y) a ribbon year's bar color (r from view().yearResult) and extra HTML
//   mapLayers(g, before)    adds the country's map layers to g, under the `before` overlays
//   onZoom(k), onZoomEnd()  keep marks and labels at their screen size while zooming
//   zoomTarget(sel)         [shape, share of the map it fills] for a selection (null shape: all)
//   beforeSelect(sel)       anything a new selection resets
//   drawSelection()         the selected place's outline and dimming
//   drawArrows()            shift arrows (if the country has them)
//   hoverShape(target)      the shape to outline when hovering what a click would pick
//   crumbs(sel)             the breadcrumb: [[selection, label HTML], ...] from the country down
//   parentOf(sel)           the place one level up (the Races card climbs while a level has none)
//   listKey(sel)            the data-go value marking this place in a race list
//   beforePanel(), afterPanel(), afterCards()   extra work around drawing the panel and cards
//   barFill(m)              a History bar's color for a signed value
//   finder                  { label, none(q), items(), pick(id), current() } for the place finder
//   syncToggles()           shows the map tools that fit the view
//   writeHash()             puts what is on screen in the link
//   readColors()            reads the country's colors from the CSS (light and dark)
import { state } from "./state.js";

export let country = null;
export const setCountry = c => { country = c; };
// the view of the office in view (or another office)
export const view = (office = state.office) => country.view(office);
