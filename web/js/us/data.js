// Loading the data files, the elections each race has, map shapes and projection.
import { site } from "../site.js";
import { state } from "../state.js";
import { failed } from "../components.js";

export const W = 975, H = 610;
const files = Promise.all([
  d3.json(`${site.data}/geo.json`),
  d3.json(`${site.data}/results.json`),
  d3.json("/img/candidates/photos.json").catch(() => []), // made by pipeline/us/photos/build_photos.py
  d3.json("/img/parties/parties.json").catch(() => ({})), // same script: {"D": "D.svg", ...}
  d3.json("/img/congress/congress.json").catch(() => []), // same script: Congress IDs with a portrait
  d3.json("/img/people/people.json").catch(() => ({})), // same script: Commons photos and their credits
]);
export const [geo, data, photoList, partyIcons, congressList, peoplePhotos] = await files.catch(err => { failed(err); throw err; });
export const congressPhotos = new Set(congressList);
export const photos = new Set(photoList);

// Senate and House data (and each year's district shapes) load the first time they are shown
export const extra = { senate: null, house: null, live: null, districts: {}, plans: null, planFiles: {} };
// election night: web/data/us/live/<office>.json (senate, governor, house), written every minute
// by pipeline/us/live/importer.py; only the office being viewed is loaded and re-read. Each file carries
// the same "night" summary (any votes yet, Senate calls) for the year ribbon.
export const LIVE_OFFICES = ["senate", "governor", "house"];
export const liveOffice = o => (LIVE_OFFICES.includes(o) ? o : "senate");
export async function loadLive(office) {
  office = liveOffice(office);
  let d = null;
  try { d = await d3.json(`${site.data}/live/${office}.json?t=${Date.now()}`); } catch (e) { /* not there yet: empty map */ }
  extra.live = extra.live || {};
  extra.live[office] = { races: d?.races || {}, notUp: d?.not_up || null, updated: d?.updated || null, trailUpdated: d?.trail_updated || null };
  if (office === "house") for (const [id, r] of Object.entries(extra.live.house.races)) r.id = id;  // the seat rule needs the district
  if (d?.night) extra.live.night = d.night;
}
export const liveFile = (o = state.office) => extra.live?.[liveOffice(o)];
export async function ensureData(office, year) {
  if (+year === LIVE_YEAR) {
    if (!liveFile(office)) await loadLive(office);
    if (office !== "house") return;
  }
  if (office === "senate" && !extra.senate) extra.senate = await d3.json(`${site.data}/senate.json`);
  if (office === "house" && !extra.house) {
    [extra.house, extra.plans] = await Promise.all([d3.json(`${site.data}/house.json`), extra.plans || d3.json(`${site.data}/house/plans.json`)]);
    markHouseHeld();
  }
  if (office === "house" && year && !extra.districts[year]) {
    // each state's map is stored once, in the file of the year it first appeared;
    // plans.json says which file each state uses in each election
    extra.plans = extra.plans || await d3.json(`${site.data}/house/plans.json`);
    const use = extra.plans[String(year)];
    const need = [...new Set(Object.values(use))];
    await Promise.all(need.filter(py => !extra.planFiles[py]).map(async py => {
      const t = await d3.json(`${site.data}/house/plans-${py}.json`);
      extra.planFiles[py] = topojson.feature(t, t.objects.districts).features;
    }));
    extra.districts[year] = need.flatMap(py => extra.planFiles[py].filter(f => use[f.properties.st] === py));
  }
}
// Who held a House seat before this election (past years and tonight, one rule):
// 1. exactly one incumbent running: their party (they may have moved district on a new map);
// 2. otherwise (no incumbent, or two thrown together by a new map): the last winner of the
//    same district number, which on a redrawn map is approximate (noted under the legend);
// 3. a district number that did not exist last time: a new seat, no earlier holder.
// null when there is no earlier year (2020).
export const redrawn = (st, y) => !!extra.plans?.[String(+y - 2)] && extra.plans[String(y)]?.[st] !== extra.plans[String(+y - 2)][st];
export function houseHolder(id, cands, y) {
  const prevY = +y - 2, before = extra.house?.races[String(prevY)];
  if (!before) return null;
  const inc = cands.filter(c => c.inc);
  if (inc.length === 1) {
    // the party they held the seat with: their last win (Congress ID, else name), not this
    // year's label (Kevin Kiley ran without a party in 2026, after winning as a Republican)
    const c = inc[0], same = w => (c.bio && w.bio ? c.bio === w.bio : w.name === c.name);
    const last = Object.values(before).map(b => b.cands[0]).find(same);
    return { caucus: last?.caucus || c.caucus, name: c.name, how: "incumbent" };
  }
  const w = before[id]?.cands[0];
  if (!w) return { newSeat: true };
  return { caucus: w.caucus, name: w.name, year: prevY, how: redrawn(id.slice(0, 2), y) ? "number" : "same" };
}
// past years: r.held (the caucus) and r.holder (the details) on every race
export function markHouseHeld() {
  for (const [y, races] of Object.entries(extra.house.races)) {
    for (const [id, r] of Object.entries(races)) {
      r.holder = houseHolder(id, r.cands, y);
      r.held = r.holder?.caucus;
    }
  }
}
// The race first, then the year: the ribbon lists the years the race in view has.
// 2026 is election night: Senate and governor races from the live results file.
export const OFFICES = ["president", "senate", "house", "governor"];
export const years = data.years; // presidential years
export const CONGRESS_YEARS = [2020, 2022, 2024], LIVE_YEAR = 2026;
export const ALL_YEARS = [...new Set([...years, ...CONGRESS_YEARS, LIVE_YEAR])].sort((a, b) => a - b);
export const HAS = {
  president: y => years.includes(y),
  senate: y => CONGRESS_YEARS.includes(y) || y === LIVE_YEAR,
  house: y => CONGRESS_YEARS.includes(y) || y === LIVE_YEAR,
  governor: y => y === LIVE_YEAR,
};
export const WHY_NOT = {
  president: y => `No presidential election in ${y}`,
  senate: () => "Senate results start in 2020",
  house: () => "House results start in 2020",
  governor: () => "Governor results so far: 2026 only (live)",
};
// the race to show for a year: the one picked if that year has it, else president or Senate
export const officeFor = (y, o) => (HAS[o](y) ? o : ["president", "senate"].find(x => HAS[x](y)));
export const curYears = () => ALL_YEARS.filter(y => HAS[state.office](y));
// a race picked in a year without it: the nearest earlier year that has it, else the latest
export const yearFor = (o, y) => [...ALL_YEARS].reverse().find(x => HAS[o](x) && x <= y) ?? [...ALL_YEARS].reverse().find(x => HAS[o](x));
export const counties = topojson.feature(geo, geo.objects.counties).features;
export const ct2023 = topojson.feature(geo, geo.objects.ct2023).features;
export const states = topojson.feature(geo, geo.objects.states).features;
export const stateMesh = topojson.mesh(geo, geo.objects.states, (a, b) => a !== b);
export const nationOutline = topojson.mesh(geo, geo.objects.states, (a, b) => a === b);
export const stateById = new Map(states.map(f => [f.properties.st, f]));
export const shapeById = new Map([...counties, ...ct2023].map(f => [f.properties.id, f]));

export const projection = d3.geoIdentity().reflectY(true).fitSize([W, H], { type: "FeatureCollection", features: states });
export const path = d3.geoPath(projection);
