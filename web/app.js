/* Election Lens: maps of US presidential results (2000-2024) and Senate and House results (2020-2024). */
(async function () {
  "use strict";

  const W = 975, H = 610;
  const [geo, data, photoList, partyIcons, congressList, peoplePhotos] = await Promise.all([
    d3.json("data/geo.json"),
    d3.json("data/results.json"),
    d3.json("img/candidates/photos.json").catch(() => []), // made by pipeline/build_photos.py
    d3.json("img/parties/parties.json").catch(() => ({})), // same script: {"D": "D.svg", ...}
    d3.json("img/congress/congress.json").catch(() => []), // same script: Congress IDs with a portrait
    d3.json("img/people/people.json").catch(() => ({})), // same script: Commons photos and their credits
  ]);
  const congressPhotos = new Set(congressList);
  const photos = new Set(photoList);

  // Senate and House data (and each year's district shapes) load the first time they are shown
  const extra = { senate: null, house: null, live: null, districts: {}, plans: null, planFiles: {} };
  // election night: web/data/live/<office>.json (senate, governor, house), written every minute
  // by pipeline/live.py; only the office being viewed is loaded and re-read. Each file carries
  // the same "night" summary (any votes yet, Senate calls) for the year ribbon.
  const LIVE_OFFICES = ["senate", "governor", "house"];
  const liveOffice = o => (LIVE_OFFICES.includes(o) ? o : "senate");
  async function loadLive(office) {
    office = liveOffice(office);
    let d = null;
    try { d = await d3.json(`data/live/${office}.json?t=${Date.now()}`); } catch (e) { /* not there yet: empty map */ }
    extra.live = extra.live || {};
    extra.live[office] = { races: d?.races || {}, notUp: d?.not_up || null, updated: d?.updated || null, trailUpdated: d?.trail_updated || null };
    if (office === "house") for (const [id, r] of Object.entries(extra.live.house.races)) r.id = id;  // the seat rule needs the district
    if (d?.night) extra.live.night = d.night;
  }
  const liveFile = (o = state.office) => extra.live?.[liveOffice(o)];
  async function ensureData(office, year) {
    if (+year === LIVE_YEAR) {
      if (!liveFile(office)) await loadLive(office);
      if (office !== "house") return;
    }
    if (office === "senate" && !extra.senate) extra.senate = await d3.json("data/senate.json");
    if (office === "house" && !extra.house) {
      [extra.house, extra.plans] = await Promise.all([d3.json("data/house.json"), extra.plans || d3.json("data/house/plans.json")]);
      markHouseHeld();
    }
    if (office === "house" && year && !extra.districts[year]) {
      // each state's map is stored once, in the file of the year it first appeared;
      // plans.json says which file each state uses in each election
      extra.plans = extra.plans || await d3.json("data/house/plans.json");
      const use = extra.plans[String(year)];
      const need = [...new Set(Object.values(use))];
      await Promise.all(need.filter(py => !extra.planFiles[py]).map(async py => {
        const t = await d3.json(`data/house/plans-${py}.json`);
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
  const redrawn = (st, y) => !!extra.plans?.[String(+y - 2)] && extra.plans[String(y)]?.[st] !== extra.plans[String(+y - 2)][st];
  function houseHolder(id, cands, y) {
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
  function markHouseHeld() {
    for (const [y, races] of Object.entries(extra.house.races)) {
      for (const [id, r] of Object.entries(races)) {
        r.holder = houseHolder(id, r.cands, y);
        r.held = r.holder?.caucus;
      }
    }
  }
  // Year first, then the race: every year we have, and which races each year has.
  // 2026 is election night: Senate and governor races from the live results file.
  const OFFICES = ["president", "senate", "house", "governor"];
  const years = data.years; // presidential years
  const CONGRESS_YEARS = [2020, 2022, 2024], LIVE_YEAR = 2026;
  const ALL_YEARS = [...new Set([...years, ...CONGRESS_YEARS, LIVE_YEAR])].sort((a, b) => a - b);
  const HAS = {
    president: y => years.includes(y),
    senate: y => CONGRESS_YEARS.includes(y) || y === LIVE_YEAR,
    house: y => CONGRESS_YEARS.includes(y) || y === LIVE_YEAR,
    governor: y => y === LIVE_YEAR,
  };
  const WHY_NOT = {
    president: y => `No presidential election in ${y}`,
    senate: () => "Senate results start in 2020",
    house: () => "House results start in 2020",
    governor: () => "Governor results so far: 2026 only (live)",
  };
  // the race to show for a year: the one picked if that year has it, else president or Senate
  const officeFor = (y, o) => (HAS[o](y) ? o : ["president", "senate"].find(x => HAS[x](y)));
  const curYears = () => ALL_YEARS;
  const counties = topojson.feature(geo, geo.objects.counties).features;
  const ct2023 = topojson.feature(geo, geo.objects.ct2023).features;
  const states = topojson.feature(geo, geo.objects.states).features;
  const stateMesh = topojson.mesh(geo, geo.objects.states, (a, b) => a !== b);
  const nationOutline = topojson.mesh(geo, geo.objects.states, (a, b) => a === b);
  const stateById = new Map(states.map(f => [f.properties.st, f]));
  const shapeById = new Map([...counties, ...ct2023].map(f => [f.properties.id, f]));

  const projection = d3.geoIdentity().reflectY(true).fitSize([W, H], { type: "FeatureCollection", features: states });
  const path = d3.geoPath(projection);

  // ---------- state ----------
  // office: president | senate | house | governor   mode: margin | shift   level: counties | states
  // seat: regular | special (Senate state with two races)   round: index of the election round shown, null = deciding
  // cmap: how state and race maps are colored: "winner" (won or called: solid, flips striped;
  // tonight's leads in one light shade) or "margin" (shaded by margin); the president's
  // Winner | Margin | Shift control sets it together with mode
  const state = { office: "president", year: 2024, mode: "margin", level: "states", cmap: "winner", arrows: false,
    seat: "regular", round: null, sel: { type: "nation" } };
  readHash(true);
  // the Senate file labels midterm years in the ribbon; the live file labels 2026
  await Promise.all([ensureData(state.office), ensureData("senate"), loadLive(+state.year === LIVE_YEAR ? state.office : "senate")]);
  readHash();
  await ensureData(state.office, state.year);

  // ---------- helpers ----------
  const fmtInt = d3.format(",");
  const pct = v => (v * 100).toFixed(1) + "%";

  function record(sel, year) {
    if (sel.type === "nation") return data.nation[year];
    if (sel.type === "state") return data.states[sel.id]?.r[year];
    return data.counties[sel.id]?.r[year];
  }
  function margin(v) { return v && v[2] ? (v[0] - v[1]) / v[2] : null; }
  const ARROW = `<svg class="check" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9.5M8.8 4.3L12.5 8l-3.7 3.7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const CHECK = `<svg class="check" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  // Party that won this place: most votes, or for the whole country the Electoral College
  function wonBy(sel, y, v) {
    if (sel.type === "nation") return data.candidates[y].won;
    return v ? (v[0] >= v[1] ? "dem" : "gop") : null;
  }
  const ec = y => data.electoral[String(y)];
  // ["gop", "dem"] or ["dem", "gop"]: the party with the larger count first
  const byCount = (d, r) => (d >= r ? ["dem", "gop"] : ["gop", "dem"]);
  // nationally the Electoral College winner always comes first, even if they lost the popular vote
  const winnerFirst = y => (data.candidates[y].won === "dem" ? ["dem", "gop"] : ["gop", "dem"]);
  function evOf(st, y) { const e = ec(y).states[st]; return e[0] + e[1]; }
  function prevYear(y) { const i = years.indexOf(+y); return i > 0 ? years[i - 1] : null; }
  function shift(sel, y) {
    const p = prevYear(y);
    if (!p) return null;
    const a = margin(record(sel, y)), b = margin(record(sel, p));
    return a == null || b == null ? null : a - b;
  }
  function mlabel(m) {
    if (m == null) return "";
    const pts = Math.abs(m * 100);
    return (m >= 0 ? "D+" : "R+") + (pts < 0.05 ? "0.0" : pts.toFixed(1));
  }
  function name(sel) {
    if (sel.type === "nation") return "United States";
    if (sel.type === "state") return data.states[sel.id].name;
    return data.counties[sel.id]?.name ?? "Unknown";
  }
  // Panel headlines: the office in a small line above the place ("U.S. Senate" over "Georgia",
  // "Governor" over "Fulton County, GA"), so a screenshot carries its context.
  const OFFICE_HEAD = { president: "President", senate: "U.S. Senate", house: "U.S. House", governor: "Governor" };
  function placeName(sel) {
    if (sel.type === "county") return `${data.counties[sel.id]?.name ?? "Unknown"}, ${data.states[sel.id.slice(0, 2)].abbr}`;
    if (sel.type === "district") return districtName(sel.id);
    return name(sel);
  }
  // where the map is: "United States › Ohio › Franklin County"; each level above is a link
  const crumbsEl = document.getElementById("crumbs");
  function drawCrumbs() {
    const sel = state.sel, st = stateOf(sel), parts = [[{ type: "nation" }, "United States"]];
    if (st) parts.push([{ type: "state", id: st }, data.states[st].name]);
    if (sel.type === "county" && !SINGLE.has(st)) parts.push([sel, data.counties[sel.id]?.name ?? "Unknown"]);
    if (sel.type === "district" && !atLarge(st)) parts.push([sel, `${districtName(sel.id, true)} district`]);
    crumbsEl.innerHTML = parts.map(([, label], i) => i < parts.length - 1
      ? `<button type="button" class="quiet" data-crumb="${i}">${label}</button><span class="sep" aria-hidden="true">›</span>`
      : `<span aria-current="location">${label}</span>`).join("");
    crumbsEl.querySelectorAll("[data-crumb]").forEach(b => b.addEventListener("click", () => select(parts[+b.dataset.crumb][0], true)));
  }
  function headline(office, sel, where, special = false) {
    const k = sel.type === "nation" && office === "governor" ? "Governors" : OFFICE_HEAD[office];
    return `<p class="kicker">${k}${special ? " · special election" : ""}</p><h2>${placeName(sel)}</h2><p class="where">${where}</p>`;
  }
  const liveWhen = () => { const u = liveFile()?.updated; return `2026 · live${u ? `, updated ${clock(u)}` : ""}`; };
  function stateOf(sel) { return sel.type === "county" || sel.type === "district" ? sel.id.slice(0, 2) : sel.type === "state" ? sel.id : null; }
  function visibleShapes(y) {
    if (state.office === "senate" || state.office === "governor") return counties; // Senate county figures use the old Connecticut counties
    return y === 2024 ? counties.filter(f => f.properties.st !== "09").concat(ct2023) : counties;
  }

  // ---------- colors (read from CSS so dark mode follows) ----------
  let colors;
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = n => cs.getPropertyValue(n).trim();
    const neutral = v("--neutral"), dem = v("--dem"), gop = v("--gop");
    const steps = t => d3.interpolateLab(neutral, t);
    // on a dark page the lightest steps would sink into the background, so they start stronger
    const dark = cs.getPropertyValue("color-scheme").trim() === "dark";
    const stops = dark ? [0.4, 0.55, 0.7, 0.85, 1] : [0.22, 0.42, 0.62, 0.82, 1];
    const ramp = c => stops.map(k => steps(c)(k));
    const ind = v("--ind");
    colors = { dem: ramp(dem), gop: ramp(gop), ind: ramp(ind), nodata: v("--nodata"), demSolid: dem, gopSolid: gop, indSolid: ind,
      grnSolid: v("--grn"), libSolid: v("--lib"), pending: v("--pending"), runoff: v("--runoff"),
      ink: v("--ink"), bg: v("--bg") };
  }
  readColors();

  const BINS = {
    margin: [0.05, 0.15, 0.3, 0.5],   // vote-share margin
    shift: [0.02, 0.05, 0.1, 0.2],    // change in margin
  };
  function color(val) {
    if (val == null || Number.isNaN(val)) return colors.nodata;
    const b = BINS[state.mode];
    const a = Math.abs(val);
    const i = a < b[0] ? 0 : a < b[1] ? 1 : a < b[2] ? 2 : a < b[3] ? 3 : 4;
    return (val >= 0 ? colors.dem : colors.gop)[i];
  }
  function value(id, y) {
    const sel = { type: "county", id };
    return state.mode === "margin" ? margin(record(sel, y)) : shift(sel, y);
  }
  // Electoral College + states + winner view: solid = party kept the state, stripes = flipped
  // president map, Winner: states solid for a hold, striped for a flip (states only; counties show the margin)
  const categorical = () => state.cmap === "winner" && state.level === "states" && state.mode === "margin";
  function stateWinner(st, y) {
    const e = data.electoral[String(y)]?.states[st];
    return e ? (e[0] > e[1] ? "dem" : "gop") : null;
  }
  function flippedFrom(st, y) {
    const p = prevYear(y), now = stateWinner(st, y), before = p && stateWinner(st, p);
    return before && before !== now ? before : null;
  }
  function stateFill(st, y) {
    if (!categorical()) return color(stateValue(st, y));
    const w = stateWinner(st, y);
    return flippedFrom(st, y) ? `url(#flip-${w})` : colors[w + "Solid"];
  }
  function stateValue(st, y) {
    const sel = { type: "state", id: st };
    return state.mode === "margin" ? margin(record(sel, y)) : shift(sel, y);
  }

  // ---------- map ----------
  const svg = d3.select("#map").attr("viewBox", `0 0 ${W} ${H}`);
  const defs = svg.append("defs");
  function drawPatterns() {
    for (const p of ["dem", "gop", "ind"]) {
      const pat = defs.selectAll(`pattern#flip-${p}`).data([p]).join(enter => {
        const e = enter.append("pattern").attr("id", `flip-${p}`).attr("patternUnits", "userSpaceOnUse")
          .attr("width", 6).attr("height", 6).attr("patternTransform", "rotate(45)");
        e.append("rect").attr("width", 6).attr("height", 6);
        e.append("rect").attr("class", "stripe").attr("width", 3).attr("height", 6);
        return e;
      });
      pat.select("rect").attr("fill", colors[p][0]);
      pat.select("rect.stripe").attr("fill", colors[p + "Solid"]);
    }
    sizeStripes();
  }
  // flip stripes keep one screen size (6px per stripe pair) at every zoom and screen width,
  // like the city names; without this they shrink with the map on phones
  function sizeStripes(k = d3.zoomTransform(svg.node()).k) {
    defs.selectAll("pattern").attr("patternTransform", `rotate(45) scale(${placeScale() / k})`);
  }
  const g = svg.append("g");
  const gCounties = g.append("g");
  const gDistricts = g.append("g"); // House districts
  const gStates = g.append("g"); // used when the map is colored by state
  g.append("path").attr("class", "states").attr("d", path(stateMesh));
  g.append("path").attr("class", "states").attr("d", path(nationOutline)).style("stroke", "none");
  const hoverPath = g.append("path").attr("class", "hover-state");
  const selPath = g.append("path").attr("class", "selected");
  // badges inside Maine and Nebraska with the electoral votes the second candidate won there
  const gBadges = g.append("g").attr("class", "ev-badges");
  // shift arrows: drawn in map coordinates, then scaled by 1/zoom so they keep their screen size
  const gArrows = g.append("g").attr("class", "arrows");
  // city names (web/data/places.json, Natural Earth): on top, never catching clicks
  const gPlaces = g.append("g").attr("class", "places");

  const zoom = d3.zoom().scaleExtent([1, 32]).translateExtent([[0, 0], [W, H]])
    .on("zoom", e => {
      g.attr("transform", e.transform);
      gArrows.style("--inv", 1 / e.transform.k);
      gPlaces.style("--inv", placeScale() / e.transform.k);
      sizeStripes(e.transform.k);
      if (e.sourceEvent) hideTip();
    })
    .on("end", () => drawPlaces());
  svg.call(zoom).on("dblclick.zoom", null);

  // fill = share of the map the shape should take up (a county gets less, so its neighbors stay visible)
  function zoomTo(feature, fill = 0.85) {
    if (!feature) {
      svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity);
      return;
    }
    const [[x0, y0], [x1, y1]] = path.bounds(feature);
    const k = Math.max(1, Math.min(32, fill / Math.max((x1 - x0) / W, (y1 - y0) / H)));
    const t = d3.zoomIdentity.translate(W / 2, H / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
    svg.transition().duration(700).call(zoom.transform, t);
  }

  const tip = document.getElementById("tip");
  // Map clicks and the tooltip. Mouse: the tooltip follows the pointer, a click opens the place.
  // Touch: the first tap shows the place's tooltip, a second tap on the same place opens it.
  let lastPointer = "mouse", tipKey = null;
  const placeKey = f => { const t = clickTarget(f); return `${t.type}:${t.id}`; };
  function hideTip() {
    tip.hidden = true;
    hoverPath.attr("d", null);
    tipKey = null;
  }
  function mapHandlers(sel) {
    return sel
      .on("click", (e, f) => {
        if (lastPointer === "touch" && tipKey !== placeKey(f)) {
          showTip(e, f);
          tipKey = placeKey(f);
          return;
        }
        hideTip();
        select(clickTarget(f), true);
      })
      .on("mousemove", (e, f) => { if (lastPointer !== "touch") showTip(e, f); })
      .on("mouseleave", () => { if (lastPointer !== "touch") hideTip(); });
  }
  // what kind of pointer the next click comes from; 2: a tap outside the map's shapes closes the tooltip
  window.addEventListener("pointerdown", e => {
    lastPointer = e.pointerType || "mouse";
    if (!e.target.closest?.("#map path")) hideTip();
  }, true);
  const wrap = document.querySelector(".map-wrap");

  // ---------- city names ----------
  // Which cities get a name depends on the zoom: the largest metros for the whole country,
  // more as you zoom in. Largest first; a name that would overlap one already placed is left
  // out. Sizes are in screen pixels: the map's own units are scaled down on narrow screens.
  let places = [];
  d3.json("data/places.json").then(d => { places = d.map(([name, st, pop, x, y]) => ({ name, st, pop, p: projection([x, y]) })); drawPlaces(); })
    .catch(() => { /* no labels */ });
  const placeScale = () => W / (svg.node().getBoundingClientRect().width || W);  // map units per screen pixel
  function drawPlaces() {
    if (!places.length) return;
    const t = d3.zoomTransform(svg.node()), s = placeScale();
    gPlaces.style("--inv", s / t.k);
    const minPop = t.k < 1.5 ? 2.5e6 : t.k < 3 ? 4e5 : t.k < 8 ? 6e4 : 0;
    const max = t.k < 1.5 ? 10 : 18, fs = 11, placed = [], shown = [];
    // the selected state's cities first; neighbors after, in a quieter grey; Alaska and Hawaii
    // are insets that sit near other states, so their cities show only for themselves or the country
    const st = state.sel.type === "nation" ? null : stateOf(state.sel);
    const order = st ? places.filter(c => c.st === st).concat(places.filter(c => c.st !== st)) : places;
    // candidates in view, then names: a name may not cover another candidate's dot
    const cands = [];
    for (const c of order) {
      if (cands.length >= 60) break;
      const own = c.st === st;
      if (c.pop < minPop && !(own && c.pop >= minPop / 4)) continue;
      if ((c.st === "02" || c.st === "15") && st && !own) continue;
      const [sx, sy] = t.apply(c.p);
      if (sx < 0 || sy < 0 || sx > W || sy > H) continue;
      cands.push({ c, sx, sy, own });
    }
    const dot = 3 * s;
    const hits = (b, o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1];
    for (const { c, sx, sy, own } of cands) {
      if (shown.length >= max) break;
      // label boxes in map-view units (screen pixels times s): right of the dot, else left, below, above
      const tw = (c.name.length * fs * 0.58 + 5) * s, bh = (fs + 3) * s, d = 3 * s;
      const sides = [
        ["r", [sx - d, sy - bh / 2, sx + tw + d, sy + bh / 2]],
        ["l", [sx - tw - d, sy - bh / 2, sx + d, sy + bh / 2]],
        ["b", [sx - tw / 2, sy - d, sx + tw / 2, sy + bh + d]],
        ["t", [sx - tw / 2, sy - bh - d, sx + tw / 2, sy + d]]];
      // a city whose dot is already under a bigger city's name is left out
      if (placed.some(o => hits([sx - dot, sy - dot, sx + dot, sy + dot], o))) continue;
      const free = sides.filter(([, b]) => b[0] >= 0 && b[1] >= 0 && b[2] <= W && b[3] <= H && !placed.some(o => hits(b, o)));
      // best: a side that covers no other city's dot; else any free side
      const fit = free.find(([, b]) => !cands.some(o => o.c !== c && hits(b, [o.sx - dot, o.sy - dot, o.sx + dot, o.sy + dot]))) || free[0];
      if (!fit) continue;
      placed.push(fit[1]);
      shown.push({ ...c, side: fit[0], other: !!st && !own });
    }
    gPlaces.selectAll("g.place").data(shown, c => c.name + c.st)
      .join(enter => {
        const e = enter.append("g").attr("class", "place").attr("transform", c => `translate(${c.p[0]},${c.p[1]})`);
        const inner = e.append("g").attr("class", "place-in");
        inner.append("circle").attr("r", 2.4);
        inner.append("text").text(c => c.name);
        return e;
      })
      .classed("other", c => c.other)
      .call(sel => sel.select("text")
        .attr("x", c => (c.side === "r" ? 5 : c.side === "l" ? -5 : 0))
        .attr("y", c => (c.side === "b" ? 9 : c.side === "t" ? -9 : 0))
        .attr("dy", "0.35em")
        .attr("text-anchor", c => (c.side === "r" ? "start" : c.side === "l" ? "end" : "middle")));
  }
  window.addEventListener("resize", () => { drawPlaces(); sizeStripes(); });

  function drawMap() {
    const y = String(state.year);
    drawPatterns();
    gDistricts.style("display", state.office === "house" ? null : "none");
    gCounties.style("display", state.office === "house" ? "none" : null);
    if (state.office !== "president") return drawCongressMap();
    gCounties.selectAll("path.county")
      .data(visibleShapes(state.year), f => f.properties.id)
      .join(enter => enter.append("path").attr("class", "county").attr("d", path).call(mapHandlers))
      .attr("fill", f => color(value(f.properties.id, y)));
    gStates.selectAll("path.state-fill")
      .data(states, f => f.properties.st)
      .join(enter => enter.append("path").attr("class", "state-fill").attr("d", path).call(mapHandlers))
      .attr("fill", f => stateFill(f.properties.st, y));
    drawSelection();
    drawLegend();
    drawBadges();
    drawArrows();
  }

  // One arrow per area: left and up = toward Democrats, right and up = toward Republicans,
  // longer = bigger shift. Shown in Shift view when the Arrows toggle is on.
  const centroids = new Map();
  const centroidOf = f => {
    const key = f.properties.id ?? "st" + f.properties.st;
    if (!centroids.has(key)) centroids.set(key, path.centroid(f));
    return centroids.get(key);
  };
  function drawArrows() {
    const on = state.office === "president" && state.mode === "shift" && state.arrows;
    gArrows.style("display", on ? null : "none");
    d3.select("#map").classed("arrows-on", on).classed("by-states", state.level === "states");
    if (!on) { gArrows.selectAll("*").remove(); return; }
    const y = String(state.year), st = stateOf(state.sel), open = st && !SINGLE.has(st);
    // arrows follow what the map colors: states, or the counties of the opened state
    let items;
    if (state.level === "states" && !open) items = states.map(f => ({ f, v: shift({ type: "state", id: f.properties.st }, y) }));
    else items = visibleShapes(state.year)
      .filter(f => !st || f.properties.st === st)
      .map(f => ({ f, v: shift({ type: "county", id: f.properties.id }, y) }));
    items = items.filter(d => d.v != null && Math.abs(d.v) >= 0.001);
    // states get longer arrows; thousands of county arrows need to be shorter to stay readable
    const bigArrows = state.level === "states" && !open;
    const perPoint = bigArrows ? 2.2 : 1.2, maxLen = bigArrows ? 40 : 22;
    const len = v => Math.min(maxLen, Math.abs(v) * 100 * perPoint);
    gArrows.classed("fine", !bigArrows);
    gArrows.selectAll("g.arrow").data(items, d => d.f.properties.id ?? d.f.properties.st)
      .join(enter => {
        const a = enter.append("g").attr("class", "arrow");
        a.append("path");
        return a;
      })
      .attr("transform", d => { const [x, yy] = centroidOf(d.f); return `translate(${x},${yy})`; })
      .select("path")
      .attr("stroke", d => (d.v > 0 ? colors.demSolid : colors.gopSolid))
      .attr("d", d => {
        const L = len(d.v), dir = d.v > 0 ? -1 : 1; // Democrats left, Republicans right
        const dx = dir * L * 0.82, dy = -L * 0.57;           // about 35 degrees above level
        const ux = dx / L, uy = dy / L, h = Math.min(5, 2 + L * 0.15); // arrowhead
        const bx = dx - ux * h, by = dy - uy * h, px = -uy * h * 0.6, py = ux * h * 0.6;
        return `M0,0L${dx},${dy}M${bx + px},${by + py}L${dx},${dy}L${bx - px},${by - py}`;
      });
  }

  // Maine and Nebraska split their electoral votes by district: in split years a badge inside
  // the state shows how many the second candidate won, in that candidate's color
  function drawBadges() {
    if (state.office !== "president") return drawSenateBadges();
    const y = String(state.year);
    const show = categorical() && state.sel.type === "nation";
    const splits = show
      ? Object.entries(ec(y).states).filter(([, [d, r]]) => d && r).map(([st, [d, r]]) => {
          const minor = d < r ? "dem" : "gop";
          return { st, p: minor, n: Math.min(d, r), xy: path.centroid(stateById.get(st)) };
        })
      : [];
    const b = gBadges.selectAll("g.ev-badge").data(splits, d => d.st)
      .join(enter => {
        const e = enter.append("g").attr("class", "ev-badge");
        e.append("circle").attr("r", 9);
        e.append("text").attr("text-anchor", "middle").attr("dy", 4);
        return e;
      })
      .attr("transform", d => `translate(${d.xy[0]},${d.xy[1]})`);
    b.select("circle").attr("fill", d => colors[d.p + "Solid"]);
    b.select("text").text(d => d.n);
  }

  // Alaska and DC are one unit each, so they never drill down further
  const SINGLE = new Set(["02", "11"]);
  // At country level a click picks the state; inside the chosen state it picks a county
  function clickTarget(f) {
    if (state.office === "house") return houseTarget(f);
    const st = f.properties.st;
    const inState = stateOf(state.sel) === st;
    if (!inState || SINGLE.has(st)) return { type: "state", id: st };
    return { type: "county", id: f.properties.id };
  }

  function drawSelection() {
    const s = state.sel;
    const f = s.type === "county" ? shapeById.get(s.id) : s.type === "state" ? stateById.get(s.id)
      : s.type === "district" ? districtShape(s.id) : null;
    selPath.attr("d", f ? path(f) : null);
    const st = stateOf(s);
    gDistricts.selectAll("path.district")
      .classed("dim", d => !!st && d.properties.st !== st)
      .classed("pickable", d => d.properties.st === st && !atLarge(st));
    gCounties.selectAll("path.county")
      .classed("dim", d => !!st && d.properties.st !== st)
      // only counties a click would pick get a county outline on hover
      .classed("pickable", d => d.properties.st === st && !SINGLE.has(st));
    // States view: the chosen state opens up to show its counties
    gStates.style("display", state.level === "states" && state.office !== "house" ? null : "none")
      .selectAll("path.state-fill")
      .style("display", d => (d.properties.st === st && !SINGLE.has(st) ? "none" : null))
      .classed("dim", d => !!st && d.properties.st !== st);
  }

  function showTip(e, f) {
    if (state.office !== "president") return showCongressTip(e, f);
    const target = clickTarget(f), y = String(state.year);
    const id = f.properties.id;
    const v = record(target, y);
    const st = data.states[f.properties.st];
    const c = data.candidates[y];
    hoverPath.attr("d", target.type === "state" ? path(stateById.get(target.id)) : null);
    let body;
    if (!v) body = "No results for this year";
    else if (state.mode === "shift") {
      const s = shift(target, y), p = prevYear(state.year);
      if (s == null) body = `<span class="tip-note">No ${p ?? "earlier"} result to compare</span>`;
      else {
        const before = margin(record(target, String(p))), now = margin(v);
        const side = s >= 0 ? "d" : "r";
        body = `<span class="tip-shift mg ${side}">${s >= 0 ? "D" : "R"} +${Math.abs(s * 100).toFixed(1)}</span>
          <span class="tip-note">${p} <span class="mg ${before >= 0 ? "d" : "r"}">${mlabel(before)}</span> → ${state.year} <span class="mg ${now >= 0 ? "d" : "r"}">${mlabel(now)}</span></span>`;
      }
    } else {
      const w = wonBy(target, y, v);
      const mark = p => (w === p ? `<span class="won">${CHECK}<span class="sr">winner</span></span>` : "");
      const row = (who, p, votes) => {
        const b = w === p ? " is-winner" : "", share = votes / v[2];
        return `<span class="tip-name${b}">${who}${mark(p)}</span><span class="tip-pct${b}">${pct(share)}</span>
          <span class="tip-bar"><span style="width:${share * 100}%;background:${colors[p + "Solid"]}"></span></span>`;
      };
      const rows = { dem: row(c.dem + partyTag("D"), "dem", v[0]), gop: row(c.gop + partyTag("R"), "gop", v[1]) };
      body = `<span class="tip-rows">${byCount(v[0], v[1]).map(p => rows[p]).join("")}</span><span class="mg ${v[0] >= v[1] ? "d" : "r"}">${mlabel(margin(v))}</span>`;
    }
    const label = target.type === "state"
      ? `${st.name} <span class="ev">${evOf(target.id, y)} electoral votes</span>`
      : `${data.counties[id]?.name ?? "Unknown"}, ${st.abbr}`;
    const from = target.type === "state" && categorical() ? flippedFrom(target.id, state.year) : null;
    const split = target.type === "state" && ec(state.year).states[target.id].every(n => n > 0)
      ? (() => { const [ed, er] = ec(state.year).states[target.id]; return `<span class="flip">Split: ${c.gop} ${er}, ${c.dem} ${ed} electoral votes</span>`; })()
      : "";
    const flip = from ? `<span class="flip">Flipped from ${from === "dem" ? "Democrats" : "Republicans"} since ${prevYear(state.year)}</span>` : "";
    const hint = target.type === "state" && !SINGLE.has(target.id) ? `<span class="hint">Click to see ${possessive(st.name)} counties</span>` : "";
    tip.innerHTML = `<strong>${label}</strong>${body}${split}${flip}${hint}`;
    placeTip(e);
  }

  function placeTip(e) {
    if (lastPointer === "touch") tip.querySelectorAll(".hint").forEach(h => { h.textContent = h.textContent.replace(/^Click/, "Tap again"); });
    tip.hidden = false;
    const r = wrap.getBoundingClientRect();
    let x = e.clientX - r.left + 14, yy = e.clientY - r.top + 14;
    if (x + tip.offsetWidth > r.width) x = e.clientX - r.left - tip.offsetWidth - 14;
    tip.style.left = x + "px";
    tip.style.top = yy + "px";
  }

  function drawLegend() {
    if (state.office !== "president") return drawCongressLegend();
    if (categorical() && state.sel.type === "nation") {
      const y = state.year, p = prevYear(y);
      const box = fill => `<svg class="sw" viewBox="0 0 26 10" aria-hidden="true"><rect width="26" height="10" fill="${fill}"/></svg>`;
      const items = [[colors.demSolid, "Democratic"], [colors.gopSolid, "Republican"]];
      if (p) items.push(["url(#flip-dem)", `Flipped to Democratic since ${p}`], ["url(#flip-gop)", `Flipped to Republican since ${p}`]);
      document.getElementById("legend").innerHTML = items.map(([f, t]) => `<span class="key">${box(f)}${t}</span>`).join("");
      return;
    }
    const b = BINS[state.mode];
    const swatch = arr => arr.map(c => `<span style="background:${c}"></span>`).join("");
    const ends = state.mode === "margin"
      ? ["Republican +50", "Democratic +50"]
      : ["Toward Republicans", "Toward Democrats"];
    const note = state.mode === "margin"
      ? `Steps at ${b.map(x => x * 100).join(", ")} points`
      : prevYear(state.year) ? `Change in margin since ${prevYear(state.year)}; steps at ${b.map(x => x * 100).join(", ")} points` : "No earlier election to compare with 2000";
    // Shift view reads like the arrows: Democrats on the left, Republicans on the right
    const ramp = state.mode === "shift"
      ? swatch([...colors.dem].reverse()) + swatch(colors.gop)
      : swatch([...colors.gop].reverse()) + swatch(colors.dem);
    const [left, right] = state.mode === "shift" ? [ends[1], ends[0]] : ends;
    document.getElementById("legend").innerHTML =
      `<span>${left}</span><span class="ramp">${ramp}</span><span>${right}</span><span>${note}</span>`;
  }

  // ---------- year ribbon ----------
  const yearList = d3.select("#year-list");
  function drawYears() {
    const ys = curYears();
    document.querySelector(".years ol").style.setProperty("--cols", ys.length);
    yearList.selectAll("li").data(ys, y => y).join(enter => {
      const li = enter.append("li");
      li.append("button").attr("type", "button").on("click", (e, y) => setYear(y));
      return li;
    }).select("button")
      .attr("aria-current", y => String(y === state.year))
      .html(y => {
        if (y === LIVE_YEAR) return liveYearLabel();
        const o = officeFor(y, state.office);
        if (o !== "president") return congressYearLabel(y, o);
        const v = data.nation[y], m = margin(v), c = data.candidates[y];
        // bold = Electoral College winner
        const nm = p => (c.won === p ? `<b class="is-winner">${c[p]}</b>` : c[p]);
        const [d, r] = ec(y).won;
        // names: the Electoral College winner first
        const order = winnerFirst(y);
        const ev = { dem: `<span class="mg d">${d}</span>`, gop: `<span class="mg r">${r}</span>` };
        const score = categorical()
          ? order.map(p => ev[p]).join("–")
          : `<span class="mg ${m >= 0 ? "d" : "r"}">${mlabel(m)}</span>`;
        // winner only: nine years share the ribbon
        return `<span class="yr">${y}</span><span class="who" title="${c[order[0]]} vs. ${c[order[1]]}">${score} ${nm(order[0])}</span>`;
      });
  }

  // ---------- panel ----------
  const panel = document.getElementById("panel");
  // the list of races (a state's districts, tonight's races, a state's Senate races) is drawn
  // with the panel, then moved to its own section under the map and the panel
  const racesEl = document.getElementById("races"), historyEl = document.getElementById("history");
  function drawPanel() {
    drawPanelBody();
    // a row in a whole-country race list opens that state's race (past years and tonight)
    racesEl.innerHTML = racesCard();
    racesEl.hidden = !racesEl.innerHTML;
    // a Senate or governor race opens its state with that race chosen; other rows open the place
    racesEl.querySelectorAll("[data-race-st]").forEach(b => b.addEventListener("click", () => {
      select({ type: "state", id: b.dataset.raceSt }, true);
      state.seat = b.dataset.raceSeat;
      drawMap();
      drawPanel();
      writeHash();
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
      raceSort = e.target.value;
      try { localStorage.setItem("raceSort", raceSort); } catch (err) { /* private mode: this visit only */ }
      drawPanel();
    });
    // this race at this level in every election: its own card under the races card
    historyEl.innerHTML = historyCard();
    historyEl.hidden = !historyEl.innerHTML;
    historyEl.querySelectorAll("[data-hist-mode]").forEach(b => b.addEventListener("click", () => {
      histMode = b.dataset.histMode;
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
  function splitPanel() {
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
  function drawPanelBody() {
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
          ? candRow(fullName(c.dem) + partyTag("D"), v[0], v[2], colors.demSolid, won === "dem", c.dem, null, v[0] - v[1])
          : candRow(fullName(c.gop) + partyTag("R"), v[1], v[2], colors.gopSolid, won === "gop", c.gop, null, v[1] - v[0])).join("")}
        ${other > 0 ? candRow("Others", other, v[2], "var(--muted)") : ""}
      </div>
      <p class="note">${facts.join(" · ")}</p>`;
      const note = data.notes?.[`${s.id}-${y}`];
      if (note) html += `<p class="note">${note}</p>`;
    }

    panel.innerHTML = html;
  }

  // National result as the Electoral College counted it (electoral votes won from each state)
  function electoralBody(y, c, v) {
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

  function evRow(label, ev, fill, winner, last) {
    const mark = winner ? ` <span class="won">${CHECK}<span class="sr">winner</span></span>` : "";
    return `<div class="cand-row${winner ? " is-winner" : ""}">${avatar(last, fill)}<div class="cand-main"><span class="name">${label}${mark}</span><span class="pct">${ev}</span>
      <div class="bar ev-bar"><span style="width:${(ev / 538) * 100}%;background:${fill}"></span><i class="need" title="270 to win"></i></div>
      <span class="votes">${ev === 1 ? "1 electoral vote" : ev + " electoral votes"}</span></div></div>`;
  }

  // Round portrait. Looks for img/candidates/<last name>-<year>.jpg, then <last name>.jpg;
  // without either it shows the candidate's initials in their party color
  // full name for the side panel's candidate rows ("Donald Trump"); last name elsewhere
  const fullName = last => data.people[last.toLowerCase()]?.name ?? last;
  // Round portrait: the year's photo (bush-2004), else the general one (bush), else initials.
  // Which photos exist comes from img/candidates/photos.json.
  function avatar(last, fill) {
    if (!last) return `<span class="avatar empty" aria-hidden="true"></span>`;
    const key = last.toLowerCase(), who = data.people[key];
    const file = [`${key}-${state.year}`, key].find(f => photos.has(f));
    const img = file ? `<img src="img/candidates/${file}.jpg" alt="">` : "";
    return `<span class="avatar" style="background:${fill}" aria-hidden="true"><span class="ini">${who?.initials ?? last[0]}</span>${img}</span>`;
  }

  function noDataReason(s, y) {
    const id = s.id || "";
    if (id.startsWith("09") && y === 2024) return "Connecticut reported 2024 results by planning region, not county.";
    if (id.startsWith("091") && y < 2024) return "Connecticut's planning regions only report results from 2024.";
    if (id === "08014" && y === 2000) return "Broomfield County was created in 2001.";
    return "The source has no data for it.";
  }

  // the leader's margin over the runner-up, in votes: " · +585,017" on the leader's row
  const marginText = lead => (lead > 0 ? ` · <span class="lead" title="Margin over the runner-up">+${fmtInt(lead)}</span>` : "");
  function candRow(label, votes, total, fill, winner = false, last = null, pic = null, lead = 0) {
    const share = votes / total;
    const mark = winner ? ` <span class="won">${CHECK}<span class="sr">winner</span></span>` : "";
    return `<div class="cand-row${winner ? " is-winner" : ""}">${pic ?? avatar(last, fill)}<div class="cand-main"><span class="name">${label}${mark}</span><span class="pct">${pct(share)}</span>
      <div class="bar"><span style="width:${share * 100}%;background:${fill}"></span></div>
      <span class="votes">${fmtInt(votes)} votes${marginText(lead)}</span></div></div>`;
  }

  // Bar chart of a race over the years, one for every office: bars up for Democrats, down for
  // Republicans. bars: [{ label, m (signed, -1..1), text, cur, faded, attrs }], oldest first;
  // attrs makes a bar a link (the same data-hist as the rows under it)
  function barChart(bars, aria) {
    const w = 300, h = 184, top = 18, bottom = 22;
    const ms = bars.map(d => d.m ?? 0);
    let lo = Math.min(0, ...ms), hi = Math.max(0, ...ms);
    if (hi - lo < 0.1) { hi = Math.max(hi, 0.05); lo = Math.min(lo, -0.05); }
    // leave 16px above and below the bars for the value labels
    const sy = d3.scaleLinear().domain([lo, hi]).range([h - bottom - 16, top]);
    const mid = sy(0);
    const x = d3.scaleBand().domain(bars.map((d, i) => i)).range([0, w]).padding(0.28);
    const out = bars.map((d, i) => {
      const cx = x(i), bw = x.bandwidth(), cur = d.cur ? " cur" : "";
      const lab = `<text class="${cur}" x="${cx + bw / 2}" y="${h - 6}" text-anchor="middle">${d.label}</text>`;
      const link = d.attrs ? ` ${d.attrs} style="cursor:pointer"` : "";
      if (d.m == null) return `<g${link}>${lab}<text x="${cx + bw / 2}" y="${mid - 4}" text-anchor="middle">n/a</text></g>`;
      const y0 = sy(0), y1 = sy(d.m);
      const fill = d.m >= 0 ? colors.demSolid : colors.gopSolid;
      const vy = d.m >= 0 ? y1 - 5 : y1 + 13;
      return `<g${link}><title>${d.label}: ${d.text}${d.faded ? " (old map)" : ""}${d.live ? " so far (won or leading)" : ""}</title>
        <rect x="${cx}" y="${Math.min(y0, y1)}" width="${bw}" height="${Math.max(1, Math.abs(y1 - y0))}" fill="${fill}" opacity="${d.cur ? 1 : d.faded ? 0.3 : 0.55}" rx="2"/>
        <text class="${cur}" x="${cx + bw / 2}" y="${vy}" text-anchor="middle">${d.text}</text>${lab}</g>`;
    }).join("");
    return `<svg class="history" viewBox="0 0 ${w} ${h}" role="img" aria-label="${attr(aria)}">
      <line class="zero" x1="0" x2="${w}" y1="${mid}" y2="${mid}"/>${out}</svg>`;
  }

  // ---------- Senate and House ----------
  // Seats are colored by caucus: independents who caucus with the Democrats in Democratic blue,
  // other independents in their own color. Margin = winner's lead over the runner-up.
  const CAUCUS_KEY = { D: "dem", R: "gop" };
  const ckey = c => CAUCUS_KEY[c] || "ind";
  // a candidate's color in bars: Greens and Libertarians in their own colors, the rest by caucus
  const candFill = c => (c.party === "G" ? colors.grnSolid : c.party === "L" ? colors.libSolid : colors[ckey(c.caucus) + "Solid"]);
  const CAUCUS_NAME = { D: "Democrats", R: "Republicans", I: "Independents" };
  const SHORT_NAME = { D: "Dems", R: "GOP", I: "Others" };
  // totals bars: full party names, or "Dems" and "GOP" (both together) when either does not fit
  // Names that switch to a shorter form when the full one does not fit (full form on hover).
  // data-forms lists the forms, longest first, split by "|": party names in a totals bar
  // ("Democrats|Dems", both sides take the same step) and people in race lists
  // ("Shelley Moore Capito|Shelley M. Capito|S. Capito|Capito"); data-title is hover text kept at every step
  function fitNames() {
    const forms = n => n.dataset.forms.split("|");
    const show = (n, i) => {
      const f = forms(n);
      n.textContent = f[Math.min(i, f.length - 1)];
      n.title = [i ? f[0] : "", n.dataset.title || ""].filter(Boolean).join(" · ");
    };
    // content wider than its box, to the fraction of a pixel (the browser cuts it with "…" even
    // when it is only half a pixel over; scrollWidth rounds that away). Measures the row's own
    // pieces: an element's box leaves out hidden screen-reader text placed elsewhere on the page
    const over = el => {
      const box = el.getBoundingClientRect(), range = document.createRange();
      let right = box.left;
      for (const n of el.childNodes) {
        let r;
        if (n.nodeType === 3) { range.selectNodeContents(n); r = range.getBoundingClientRect(); }
        else if (n.nodeType === 1 && getComputedStyle(n).position !== "absolute") r = n.getBoundingClientRect();
        if (r && r.width) right = Math.max(right, r.right);
      }
      return right > box.left + el.clientWidth + 0.01;
    };
    // groups of names that take the same step (both party names in a bar; one person in a row).
    // Every group is set to a form, then all are measured: a long list costs a few layouts, not one per row
    let groups = [
      ...[...document.querySelectorAll(".tug-head")].map(h => ({ names: [...h.querySelectorAll(".pname")], box: n => n })),
      ...[...document.querySelectorAll(".who .fit")].map(n => ({ names: [n], box: m => m.closest(".who-line, .who") })),
    ].filter(g => g.names.length);
    for (let i = 0; groups.length; i++) {
      groups.forEach(g => g.names.forEach(n => show(n, i)));
      groups = groups.filter(g => g.names.some(n => forms(n).length > i + 1) && g.names.some(n => over(g.box(n))));
    }
  }
  // measure again whenever the cards change width (window, phone rotation, columns) and once the
  // page font has loaded: measured with the narrower fallback font, everything seems to fit
  {
    const widths = new WeakMap();
    const ro = new ResizeObserver(entries => {
      if (entries.some(e => widths.get(e.target) !== e.contentRect.width && (widths.set(e.target, e.contentRect.width), true))) fitNames();
    });
    [document.body, document.getElementById("races")].forEach(el => ro.observe(el));  // the panel has no box of its own on phones
    document.fonts?.ready.then(fitNames);
    document.fonts?.addEventListener("loadingdone", fitNames);  // "ready" can come before loading starts
  }
  const attr = t => String(t).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  // a person's name for a race list: full, middle names as initials, first initial, last name
  const SUFFIX = /^(jr|sr|ii|iii|iv)\.?$/i;
  const PARTICLE = /^(van|von|de|del|della|der|den|da|di|du|la|le|st\.?)$/i;
  function fitName(c) {
    const words = c.name.split(" ").filter(w => !SUFFIX.test(w));
    let last = c.last && c.name.includes(c.last) ? c.last : words[words.length - 1];
    // particles belong to the surname: "Van Epps", "De La Cruz"
    for (let i = words.indexOf(last.split(" ")[0]) - 1; i > 0 && PARTICLE.test(words[i]); i--) last = `${words[i]} ${last}`;
    const given = words.join(" ").slice(0, words.join(" ").lastIndexOf(last)).trim().split(" ").filter(Boolean);
    const mid = given.length > 1 ? [given[0], ...given.slice(1).map(w => (w.endsWith(".") ? w : w[0] + ".")), last].join(" ") : null;
    const initial = given.length ? `${given[0][0]}. ${last}` : null;  // "S. Capito"
    const list = [c.name, mid, initial, last].filter((f, i, a) => f && a.indexOf(f) === i);
    return `<span class="fit" data-forms="${attr(list.join("|"))}">${c.name}</span>`;
  }
  // Party after a name: the letter, "(D)", then its icon from img/parties/ when there is one.
  // Takes a party code or a candidate.
  const PARTY_NAME = { D: "Democratic Party", R: "Republican Party", L: "Libertarian Party", G: "Green Party", I: "Independent" };
  const partyTag = c => {
    const p = typeof c === "string" ? c : c.party;
    if (!PARTY_NAME[p]) return "";
    const icon = partyIcons[p];
    return ` <span class="party-tag" title="${PARTY_NAME[p]}">(${p})${icon ? `<img class="party" src="img/parties/${icon}" alt="">` : ""}</span>`;
  };
  // Round picture for a whole party (Seats and Popular vote rows): its icon, else its letter
  const partyAvatar = (p, fill) => partyIcons[p]
    ? `<span class="avatar party-pic" aria-hidden="true"><img src="img/parties/${partyIcons[p]}" alt=""></span>`
    : `<span class="avatar" style="background:${fill}" aria-hidden="true"><span class="ini">${p}</span></span>`;
  const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
  // AP style: a name ending in "s" takes only the apostrophe ("Texas' 13th district", "Ohio's")
  const possessive = name => (name.endsWith("s") ? `${name}'` : `${name}'s`);
  function districtName(id, short = false) {
    const n = +id.slice(3), st = data.states[id.slice(0, 2)].name;
    if (short) return n ? ordinal(n) : "At large";
    return n ? `${possessive(st)} ${ordinal(n)} district` : `${st} at large`;
  }
  // a year's House races: the live file for 2026, house.json for 2020-2024
  function houseRaces(y) { return (+y === LIVE_YEAR ? liveFile("house")?.races : extra.house?.races[String(y)]) || {}; }
  const hRaces = () => houseRaces(state.year);
  // the live page (election night 2026) reuses the Senate views: same race shape, one "year"
  const isLive = () => state.year === LIVE_YEAR;
  const senLike = () => state.office === "senate" || state.office === "governor";
  const liveRaces = (o = state.office) => Object.values(liveFile(o)?.races || {});
  const sYear = (y = state.year) => (+y === LIVE_YEAR
    ? liveRaces(state.office === "governor" ? "governor" : "senate")
    : (extra.senate?.races[String(y)] || []));
  const SEAT_ORDER = { regular: 0, special: 1, governor: 2 };
  function senateRaces(st, y = state.year) {
    return sYear(y).filter(r => r.st === st).sort((a, b) => SEAT_ORDER[a.seat] - SEAT_ORDER[b.seat]);
  }
  const seatLabel = r => (isLive()
    ? (r.seat === "governor" ? "Governor" : r.seat === "special" ? "Senate (special)" : "Senate")
    : (r.seat === "special" ? "Special election" : "Regular election"));
  // the race a state shows: the one picked in the panel when the state is selected, else the regular one
  function senateRace(st, y = state.year) {
    const rs = senateRaces(st, y);
    const want = stateOf(state.sel) === st ? state.seat : "regular";
    return rs.find(r => r.seat === want) || rs[0] || null;
  }
  function atLarge(st) { return state.office === "house" && !!hRaces()?.[`${st}-00`]; }
  function districtShape(id) { return (extra.districts[state.year] || []).find(f => f.properties.id === id); }
  function houseTarget(f) {
    const st = f.properties.st;
    if (stateOf(state.sel) !== st || atLarge(st)) return { type: "state", id: st };
    return { type: "district", id: f.properties.id };
  }

  // leader's caucus and lead over the runner-up, as a share of all votes
  function lean(cands, votes, total) {
    if (!votes || !votes.length || !total) return null;
    const order = votes.map((v, i) => i).sort((a, b) => votes[b] - votes[a]);
    const [a, b] = order;
    const gap = votes[a] - (b != null ? votes[b] : 0);
    return { caucus: cands[a].caucus, m: gap / total, gap, lead: a };
  }
  const roundOf = (r, i = null) => r.rounds[i == null ? r.rounds.length - 1 : i];
  function raceLean(r) {
    if (!r) return null;
    if (!r.rounds.length) return { caucus: r.cands[0].caucus, m: 1, lead: 0, unopposed: true };
    const rd = roundOf(r);
    return lean(r.cands, rd.votes, rd.total);
  }
  function countyLean(r, fips) {
    const v = r?.counties?.[fips];
    if (!v) return null;
    const n = r.cands.length;
    return lean(r.cands, v.slice(0, n), v[n + 1]);
  }
  function leanColor(l) {
    if (!l) return colors.nodata;
    const b = BINS.margin, a = l.m;
    const i = a < b[0] ? 0 : a < b[1] ? 1 : a < b[2] ? 2 : a < b[3] ? 3 : 4;
    return colors[ckey(l.caucus)][i];
  }
  function leanLabel(l) {
    if (!l) return "";
    const cls = l.caucus === "D" ? "d" : l.caucus === "R" ? "r" : "i";
    if (l.unopposed) return `<span class="mg ${cls}">Unopposed</span>`;
    const pts = l.m * 100;
    return `<span class="mg ${cls}">${l.caucus}+${pts < 0.05 ? "0.0" : pts.toFixed(1)}</span>`;
  }
  // past years: a line in the tooltip when the seat changed party
  const flipLine = r => (r?.held && r.held !== r.cands[0].caucus ? `<span class="flip">${CAUCUS_NAME[r.cands[0].caucus]} gained the seat</span>` : "");
  // solid winner color; stripes when a seat changed party (Senate seat history; House: same district, same map)
  // past years: the race in the panel, shown at an earlier round (the November tab of a runoff):
  // the map follows the tab. Winner: Runoff grey, or the party when both who advanced share it;
  // Margin: that round's margin
  // id: the House district (past House races do not carry it); Senate races carry their state
  function earlierRound(r, id = null) {
    if (!r || state.round == null || state.round >= r.rounds.length - 1) return null;
    const st = stateOf(state.sel);
    const here = id ? state.sel.id === id || (state.sel.type === "state" && id === `${st}-00`) : st === r.st;
    return here ? state.round : null;
  }
  function pastFill(r, id = null) {
    if (!r) return colors.nodata;
    const ri = earlierRound(r, id);
    if (ri == null) return congressCategorical() ? seatFill(r) : leanColor(raceLean(r));
    const rd = r.rounds[ri];
    if (!congressCategorical()) return leanColor(lean(r.cands, rd.votes, rd.total));
    const adv = r.cands.filter((c, i) => r.rounds[ri + 1].votes[i] > 0);
    return adv.length && adv.every(c => c.caucus === adv[0].caucus) ? colors[ckey(adv[0].caucus) + "Solid"] : colors.runoff;
  }
  function seatFill(r) {
    const w = ckey(r.cands[0].caucus);
    return r.held && r.held !== r.cands[0].caucus ? `url(#flip-${w})` : colors[w + "Solid"];
  }
  const congressCategorical = () => !isLive() && state.cmap === "winner" &&
    (state.office === "house" || (state.level === "states" && state.sel.type === "nation"));

  function drawCongressMap() {

    if (senLike()) {
      gCounties.selectAll("path.county")
        .data(visibleShapes(state.year), f => f.properties.id)
        .join(enter => mapHandlers(enter.append("path").attr("class", "county").attr("d", path)))
        .attr("fill", f => {
          const r = senateRace(f.properties.st), l = countyLean(r, f.properties.id);
          // live: a county of a followed state with no votes yet is "not counted yet", not "no race"
          return isLive() && r && !l ? colors.pending : leanColor(l);
        });
      gStates.selectAll("path.state-fill")
        .data(states, f => f.properties.st)
        .join(enter => mapHandlers(enter.append("path").attr("class", "state-fill").attr("d", path)))
        .attr("fill", f => {
          const r = senateRace(f.properties.st);
          if (isLive()) return liveFill(r);
          return pastFill(r);
        });
    } else {
      const races = hRaces();
      gDistricts.selectAll("path.district")
        .data(extra.districts[state.year], f => f.properties.id)
        .join(enter => mapHandlers(enter.append("path").attr("class", "district")))
        .attr("d", path) // district lines change from year to year
        .attr("fill", f => {
          const r = races[f.properties.id];
          if (isLive()) return liveFill(r);
          return pastFill(r, f.properties.id);
        });
    }
    drawSelection();
    drawLegend();
    drawBadges();
    drawArrows();
  }

  // a "2" on states with two Senate races that year (regular and special)
  function drawSenateBadges() {
    const show = senLike() && state.sel.type === "nation" && state.level === "states";
    const items = show
      ? [...new Set(sYear().map(r => r.st))].filter(st => senateRaces(st).length > 1)
        .map(st => ({ st, xy: path.centroid(stateById.get(st)) }))
      : [];
    const b = gBadges.selectAll("g.ev-badge").data(items, d => d.st)
      .join(enter => {
        const e = enter.append("g").attr("class", "ev-badge");
        e.append("circle").attr("r", 9);
        e.append("text").attr("text-anchor", "middle").attr("dy", 4);
        return e;
      })
      .attr("transform", d => `translate(${d.xy[0]},${d.xy[1]})`);
    b.select("circle").attr("fill", colors.ink);
    b.select("text").text("2").style("fill", colors.bg);
  }

  function tipRows(cands, votes, total, winner) {
    return votes.map((v, i) => i).sort((a, b) => votes[b] - votes[a]).slice(0, 2).map(i => {
      const c = cands[i], share = total ? votes[i] / total : 0, w = i === winner ? " is-winner" : "";
      const mark = i === winner ? `<span class="won">${CHECK}<span class="sr">winner</span></span>` : "";
      return `<span class="tip-name${w}">${c.last}${partyTag(c)}${mark}</span><span class="tip-pct${w}">${pct(share)}</span>
        <span class="tip-bar"><span style="width:${share * 100}%;background:${candFill(c)}"></span></span>`;
    }).join("");
  }
  function raceTip(r, votes, total, l, winner) {
    if (!r.rounds.length) return `<span class="tip-note">${r.cands[0].name}${partyTag(r.cands[0])} won unopposed</span>`;
    return `<span class="tip-rows">${tipRows(r.cands, votes, total, winner)}</span>${leanLabel(l)}`;
  }
  function showCongressTip(e, f) {
    const target = clickTarget(f), st = f.properties.st, sname = data.states[st].name;
    let label, body, extraLine = "", hint = "";
    if (senLike()) {
      const r = senateRace(st), two = senateRaces(st).length > 1;
      if (target.type === "state") {
        hoverPath.attr("d", path(stateById.get(st)));
        label = sname + (r && (two || isLive()) ? ` <span class="ev">${seatLabel(r)}${two ? " (2 races)" : ""}</span>` : "");
        if (!r) body = `<span class="tip-note">${isLive() ? "No race followed tonight" : `No Senate race in ${state.year}`}</span>`;
        else if (isLive()) {
          body = liveTip(r);
        } else {
          body = raceTip(r, roundOf(r).votes, roundOf(r).total, raceLean(r), 0);
          extraLine = flipLine(r);
          if (r.rounds.length > 1) extraLine += `<span class="hint">${roundOf(r).label}</span>`;
        }
        if (!SINGLE.has(st)) hint = `<span class="hint">Click to see ${possessive(sname)} counties</span>`;
      } else {
        hoverPath.attr("d", null);
        label = `${data.counties[f.properties.id]?.name ?? "Unknown"}, ${data.states[st].abbr}`;
        const v = r?.counties?.[f.properties.id];
        if (!r) body = `<span class="tip-note">${isLive() ? "No race followed tonight" : `No Senate race in ${state.year}`}</span>`;
        else if (!v || (isLive() && !v[r.cands.length + 1])) body = `<span class="tip-note">${isLive() ? "No votes counted here yet" : "No county figures for this race"}</span>`;
        else {
          const n = r.cands.length, l = countyLean(r, f.properties.id);
          body = raceTip(r, v.slice(0, n), v[n + 1], l, isLive() ? -1 : l.lead);
          const cp = r.county_pct?.[f.properties.id];
          if (isLive() && cp != null) extraLine = `<span class="hint">${Math.round(cp)}% ${r.pct_of && r.pct_of.startsWith("precincts") ? "of precincts" : ""} reporting</span>`;
        }
      }
    } else {
      const races = hRaces();
      if (target.type === "state") {
        hoverPath.attr("d", path(stateById.get(st)));
        if (atLarge(st)) {
          const r = races[`${st}-00`];
          label = `${sname} <span class="ev">At large, 1 seat</span>`;
          body = isLive() ? liveTip(r) : raceTip(r, roundOf(r)?.votes, roundOf(r)?.total, raceLean(r), 0);
          if (!isLive()) extraLine = flipLine(r);
        } else {
          const ds = Object.entries(races).filter(([id]) => id.startsWith(st + "-"));
          const won = { D: 0, R: 0, I: 0 };
          const live = isLive(), shown = live ? ds.filter(([, r]) => counted(r)) : ds;
          shown.forEach(([, r]) => won[raceLean(r)?.caucus ?? r.cands[0].caucus]++);
          label = `${sname} <span class="ev">${ds.length} districts</span>`;
          body = live && !shown.length ? `<span class="tip-note">No votes counted yet</span>`
            : `<span class="tip-note">${live ? "Leading: " : ""}${["D", "R", "I"].filter(c => won[c]).map(c => `${CAUCUS_NAME[c]} ${won[c]}`).join(", ")}</span>`;
          hint = `<span class="hint">Click to see ${possessive(sname)} districts</span>`;
        }
      } else {
        hoverPath.attr("d", null);
        const r = races[f.properties.id];
        label = districtName(f.properties.id);
        body = !r ? "No result" : isLive() ? liveTip(r) : raceTip(r, roundOf(r)?.votes, roundOf(r)?.total, raceLean(r), 0);
        if (r && !isLive()) extraLine = flipLine(r);
      }
    }
    tip.innerHTML = `<strong>${label}</strong>${body}${extraLine}${hint}`;
    placeTip(e);
  }

  // the asterisk note under the map legend: seats left out of flips and pickups
  function flipNote(unknown, any, what, why) {
    if (!unknown || !any) return "";
    return `<span class="legend-note">* Leaves out ${unknown} ${unknown === 1 ? what.replace(/s$/, "") : what} with no earlier result to compare${why ? ` (${why})` : ""}.</span>`;
  }
  // House: the note under the legend names the redrawn states, where the previous holder is
  // the incumbent or else the last winner of the district number, and new seats with no holder
  function houseNote(y) {
    const prevY = +y - 2;
    if (!extra.house?.races[String(prevY)]) return "";
    const sts = Object.keys(extra.plans?.[String(y)] || {}).filter(st => redrawn(st, y)).map(st => data.states[st].abbr).sort();
    if (!sts.length) return "";
    const fresh = Object.entries(houseRaces(y)).filter(([, r]) => isNewSeat(r)).map(([id]) => `${data.states[id.slice(0, 2)].abbr}-${+id.slice(3)}`);
    return `<span class="legend-note">* Redrawn since ${prevY} (${sts.length <= 12 ? sts.join(", ") : `${sts.length} states`}): against the incumbent, or else the last winner of the district number.${fresh.length ? ` New seats with no incumbent have no earlier holder: ${fresh.join(", ")}.` : ""}</span>`;
  }
  function drawCongressLegend() {
    const el = document.getElementById("legend");
    raceLegend(el, isLive());
  }
  // One legend for Senate, House and governor maps, past years and tonight. Differences: "Pickup"
  // tonight vs "Flipped" for past years, and tonight's own keys (leading, no votes yet).
  function raceLegend(el, live) {
    const sen = senLike(), house = state.office === "house";
    const shown = live ? (house ? Object.values(hRaces()) : liveRaces()) : (sen ? sYear() : Object.values(hRaces()));
    const winnerOf = r => (live ? (seatParty(r) ?? (runoffOf(r) ? null : counted(r) ? raceLean(r).caucus : null)) : r.cands[0]?.caucus);
    const heldOf = r => (live ? heldBy(r)?.caucus : r.held);
    const box = fill => `<svg class="sw" viewBox="0 0 26 10" aria-hidden="true"><rect width="26" height="10" fill="${fill}"/></svg>`;
    const key = (fills, text, title = "") => `<span class="key"${title ? ` title="${title}"` : ""}>${fills.map(box).join("")}${text}</span>`;
    const noRace = sen ? key([colors.nodata], state.level === "counties" ? "No race or no county figures" : "No race") : "";
    const pending = live ? key([colors.pending], "No votes counted yet") : "";
    const winnerView = live ? state.cmap === "winner" : congressCategorical();
    if (winnerView) {
      // the colors say the party; the keys say won, leading or changed party
      const ind = shown.some(r => winnerOf(r) === "I");
      const items = [key([colors.demSolid, colors.gopSolid].concat(ind ? [colors.indSolid] : []), "Won", live ? "Called by a news organization" : "")];
      if (live) items.push(key([colors.dem[1], colors.gop[1]].concat(ind ? [colors.ind[1]] : []), "Leading", "Not called yet: ahead in the votes counted so far"));
      const flipped = shown.some(r => live ? pickup(r) : r.held && r.held !== r.cands[0].caucus);
      const star = house ? houseNote(state.year)
        : flipNote(shown.filter(r => !heldOf(r)).length, shown.some(r => heldOf(r)), state.office === "governor" ? "races" : "seats", "");
      if (flipped) items.push(key(["url(#flip-dem)", "url(#flip-gop)"], `${live ? "Pickup" : "Flipped"}${star ? "*" : ""}`,
        live ? "Called, and the seat changes party" : "The seat changed party"));
      // tonight: a runoff called between parties; past years: the race in the panel at its November round
      const st = stateOf(state.sel), hid = state.sel.type === "district" ? state.sel.id : st && `${st}-00`;
      const inView = sen ? senateRace(st) : hRaces()[hid];
      const pastRunoff = !live && inView && earlierRound(inView, sen ? null : hid) != null && pastFill(inView, sen ? null : hid) === colors.runoff;
      if (pastRunoff || (live && shown.some(r => runoffOf(r) && !seatParty(r)))) items.push(key([colors.runoff], "Runoff", "Went to a runoff between candidates of different parties"));
      el.innerHTML = items.join("") + pending + noRace + (flipped ? star : "");
      return;
    }
    const b = BINS.margin;
    const swatch = arr => arr.map(c => `<span style="background:${c}"></span>`).join("");
    let html = `<span>Republican +50</span><span class="ramp">${swatch([...colors.gop].reverse()) + swatch(colors.dem)}</span><span>Democratic +50</span>`;
    if (shown.some(r => r.cands.slice(0, 2).some(c => c.caucus === "I"))) html += `<span class="key"><span class="ramp">${swatch(colors.ind)}</span>Independent</span>`;
    html += `<span>Lead over the runner-up; steps at ${b.map(x => x * 100).join(", ")} points</span>`;
    el.innerHTML = html + pending + noRace;
  }

  const SENATE_POP_NOTE = "Adds up the November votes in this year's Senate races only: about a third of the states, and some races had no Democrat or no Republican. States with two races count twice.";
  function senatePopular(y, races = null) {
    const t = [0, 0, 0];
    for (const r of races || sYear(y)) {
      if (!r.rounds.length) continue;
      const rd = r.rounds[0]; // November vote (first round)
      r.cands.forEach((c, i) => { if (c.party === "D") t[0] += rd.votes[i]; else if (c.party === "R") t[1] += rd.votes[i]; });
      t[2] += rd.total;
    }
    return t;
  }
  function congressYearLabel(y, office = state.office) {
    const sen = office === "senate";
    if (state.cmap === "margin") {
      const v = sen ? senatePopular(y) : extra.house.popular[y], m = margin(v);
      return `<span class="yr">${y}</span><span class="who"><span class="mg ${m >= 0 ? "d" : "r"}">${mlabel(m)}</span> popular vote</span>`;
    }
    const c = sen ? extra.senate.control[y] : extra.house.seats[y];
    const lead = c.R > c.D ? "R" : c.D > c.R ? "D" : null;
    const order = lead === "R" ? ["R", "D"] : ["D", "R"];
    const score = order.map(p => `<span class="mg ${p === "D" ? "d" : "r"}">${c[p]}</span>`).join("–");
    const who = lead ? `<b class="is-winner">${CAUCUS_NAME[lead]}</b>` : "tied";
    return `<span class="yr">${y}</span><span class="who">${score} ${who}</span>`;
  }

  // ---------- Senate and House panel ----------
  // Official portrait for anyone who has served in Congress (img/congress/<Congress ID>.jpg),
  // else initials in the party color
  // Commons photo credits: the license deed linked (Creative Commons asks for it); shown in the
  // footer only for the photos on screen, and as hover text on each portrait
  function licenseLink(lic) {
    const m = lic.match(/^CC (BY(?:-SA)?) ([\d.]+)$/i);
    return /^public domain$/i.test(lic) ? "public domain"
      : m ? `<a href="https://creativecommons.org/licenses/${m[1].toLowerCase()}/${m[2]}/">${lic}</a>`
      : /^CC0/i.test(lic) ? `<a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</a>` : lic;
  }
  function drawPhotoCredits() {
    const el = document.getElementById("photo-credits");
    const keys = [...new Set([...document.querySelectorAll("[data-photo]")].map(n => n.dataset.photo))].filter(k => peoplePhotos[k]);
    el.hidden = !keys.length;
    el.innerHTML = keys.length ? "Candidate photos from Wikimedia Commons: " + keys.map(k => {
      const c = peoplePhotos[k];
      return `<a href="${c.page}">${c.name}</a> by ${c.author} (${licenseLink(c.license)})`;
    }).join("; ") + "." : "";
  }
  function initialsAvatar(c, fill) {
    const parts = c.name.replace(/[^A-Za-zÀ-ž\s-]/g, "").trim().split(/\s+/);
    const ini = ((parts[0] || "")[0] || "") + ((parts[parts.length - 1] || "")[0] || "");
    const pp = !congressPhotos.has(c.bio) && peoplePhotos[c.photo];
    const img = congressPhotos.has(c.bio) ? `<img src="img/congress/${c.bio}.jpg" alt="" loading="lazy">`
      : pp ? `<img src="img/people/${c.photo}.jpg" alt="" loading="lazy">` : "";
    const credit = pp ? ` data-photo="${c.photo}" title="${attr(`Photo: ${pp.author}, ${/^public domain$/i.test(pp.license) ? "public domain" : pp.license}`)}"` : "";
    return `<span class="avatar" style="background:${fill}" aria-hidden="true"${credit}><span class="ini">${ini.toUpperCase()}</span>${img}</span>`;
  }
  // winner: true (✓, bold), or the round they advanced to ("runoff", "final round": →, bold)
  function personRow(c, votes, total, winner, lead = 0) {
    const fill = candFill(c);
    const mark = typeof winner === "string" ? ` <span class="won" title="Advanced to the ${winner}">${ARROW}<span class="sr">advanced to the ${winner}</span></span>`
      : winner ? ` <span class="won">${CHECK}<span class="sr">winner</span></span>` : "";
    const facts = [];
    if (c.party === "I" && c.caucus === "D") facts.push("caucuses with the Democrats");
    if (c.inc) facts.push("incumbent");
    const factText = facts.length ? ` · <span class="inc">${facts.join(" · ")}</span>` : "";
    if (votes == null) {
      return `<div class="cand-row${winner ? " is-winner" : ""}">${initialsAvatar(c, fill)}<div class="cand-main"><span class="name">${c.name}${partyTag(c)}${mark}</span><span class="pct">Unopposed</span>
        <span class="votes">No votes counted${factText}</span></div></div>`;
    }
    const share = total ? votes / total : 0;
    return `<div class="cand-row${winner ? " is-winner" : ""}">${initialsAvatar(c, fill)}<div class="cand-main"><span class="name">${c.name}${partyTag(c)}${mark}</span><span class="pct">${pct(share)}</span>
      <div class="bar"><span style="width:${share * 100}%;background:${fill}"></span></div>
      <span class="votes">${fmtInt(votes)} votes${marginText(lead)}${factText}</span></div></div>`;
  }
  // candidates with at least 2% (and always the top two), then everyone else as "Others".
  // winner: the winner's index; or { advanced: Set of indices, to: "runoff" } for an earlier round
  function peopleRows(cands, votes, total, other, winner) {
    const order = votes.map((v, i) => i).sort((a, b) => votes[b] - votes[a]);
    const shown = order.filter((i, k) => k < 2 || (total && votes[i] / total >= 0.02));
    const rest = total - shown.reduce((a, i) => a + votes[i], 0);
    const lead = order.length > 1 ? votes[order[0]] - votes[order[1]] : 0;
    const mark = i => (winner?.advanced ? (winner.advanced.has(i) ? winner.to : false) : i === winner);
    let html = shown.map((i, k) => personRow(cands[i], votes[i], total, mark(i), k === 0 ? lead : 0)).join("");
    if (rest > 0) html += candRow("Others", rest, total, "var(--muted)");
    return html;
  }
  const notesList = notes => (notes && notes.length ? `<ul class="notes">${notes.map(n => `<li>${n}</li>`).join("")}</ul>` : "");
  function roundTabs(r, ri) {
    if (r.rounds.length < 2) return "";
    const short = rd => (rd.kind === "general" ? "November" : rd.kind === "runoff" ? "Runoff" : rd.label.replace("Ranked-choice ", "").replace(/^r/, "R"));
    return `<div class="mode tabs" role="radiogroup" aria-label="Election round">${r.rounds.map((rd, i) =>
      `<button type="button" role="radio" aria-checked="${i === ri}" data-round="${i}">${short(rd)}</button>`).join("")}</div>`;
  }
  // a whole race: statewide (Senate) or district (House)
  function raceBody(r) {
    if (!r.rounds.length) {
      return `<div class="cand">${personRow(r.cands[0], null, null, true)}</div>
        <p class="note">Won unopposed${isNewSeat(r) ? " · New seat" : ""}</p>${notesList(r.notes)}`;
    }
    const last = r.rounds.length - 1;
    const ri = state.round != null && state.round <= last ? state.round : last;
    const rd = r.rounds[ri], l = lean(r.cands, rd.votes, rd.total);
    // grey lines, as tonight: what the numbers are, and whether the seat changed party
    const facts = [rd.label, `${fmtInt(rd.total)} votes`];
    if (isNewSeat(r)) facts.push("New seat");
    if (ri !== last) facts.push(`decided in the ${r.rounds[last].kind === "runoff" ? "runoff" : "final round"}`);
    const w = r.cands[0].caucus;
    const flip = r.held && r.held !== w
      ? `<p class="note"><strong>Flipped</strong> · ${CAUCUS_NAME[w]} gained the seat from the ${CAUCUS_NAME[r.held]}</p>` : "";
    // an earlier round: no winner yet; those in the next round advanced (→, bold)
    const next = r.rounds[ri + 1];
    const mark = next ? { advanced: new Set(next.votes.map((v, i) => (v > 0 ? i : -1)).filter(i => i >= 0)), to: next.kind === "runoff" ? "runoff" : "next round" } : 0;
    return `${roundTabs(r, ri)}<div class="cand">${peopleRows(r.cands, rd.votes, rd.total, rd.other, mark)}</div>
      <p class="note">${facts.join(" · ")}</p>${flip}${notesList(r.notes)}`;
  }
  function countyBody(r, fips) {
    const v = r.counties?.[fips];
    if (!v) return `<p class="empty">No county figures for this race.</p>${notesList(r.notes)}`;
    const n = r.cands.length, l = countyLean(r, fips), cr = r.rounds[r.county_round];
    let note = `County figures: ${cr.label}.`;
    if (r.county_round !== r.rounds.length - 1) note += ` The seat was decided in the ${roundOf(r).kind === "runoff" ? "runoff" : "ranked-choice count"}, which has no county figures.`;
    return `<div class="cand">${peopleRows(r.cands, v.slice(0, n), v[n + 1], v[n], l.lead)}</div>
      <p class="note">${fmtInt(v[n + 1])} votes · ${note}</p>${notesList(r.notes)}`;
  }
  // the vice president's party when the new Senate met (breaks 50–50 ties): Harris from
  // January 2021 and 2023, Vance from January 2025
  const SENATE_VP = { 2020: "D", 2022: "D", 2024: "R" };
  const senateControl = (c, y) => (c.D > c.R ? "D" : c.R > c.D ? "R" : SENATE_VP[y] ?? null);
  const senateNeed = vp => `51 for control${vp ? ` (50 for ${{ D: "Democrats", R: "Republicans" }[vp]})` : ""}`;
  function senateSeatsBody(y) {
    const c = extra.senate.control[y], rs = sYear(y);
    const won = { D: 0, R: 0, I: 0 };
    for (const r of rs) won[r.cands[0].caucus]++;
    const t = {}, pg = pastGains(rs.map(r => [r.held, r.cands[0].caucus]));
    for (const p of ["D", "R", "I"]) t[p] = { solid: p === "I" ? 0 : c[p], lead: 0, solidText: "Seats after the election",
      lines: [`${c[p] - won[p]} not up`, `${won[p]} won`] };
    return `${tugBar(t, 100, senateNeed(SENATE_VP[y]), pg, "seats", "", senateControl(c, y))}${popSection(senatePopular(y))}<p class="note">${SENATE_POP_NOTE}</p>`;
  }
  function houseSeatsBody(y) {
    const c = extra.house.seats[y];
    const t = {};
    for (const p of ["D", "R"]) t[p] = { solid: c[p], lead: 0, lines: [`${c[p]} won`] };
    return `${tugBar(t, 435, "218 for a majority", houseNet(y), "districts", "", c.D >= 218 ? "D" : c.R >= 218 ? "R" : null)}${popSection(extra.house.popular[y])}`;
  }
  // House popular vote: [Democratic, Republican, all] votes over the races given (first round,
  // as counted so far tonight); unopposed races not on the ballot add nothing
  function houseVotes(races) {
    const v = [0, 0, 0];
    for (const r of races) {
      const rd = r.rounds?.[0];
      if (!rd || !rd.total) continue;
      r.cands.forEach((c, i) => { if (c.caucus === "D") v[0] += rd.votes[i]; else if (c.caucus === "R") v[1] += rd.votes[i]; });
      v[2] += rd.total;
    }
    return v;
  }
  // Popular vote section under the seats bar: shares on a bar (Democrats from the left,
  // Republicans from the right, others in the middle), with the vote counts; then grey lines,
  // like a single race: others, and the votes counted (share counted in brackets where known)
  function popSection(v, live = false, heading = true, counted = null) {
    if (!v || !v[2]) return "";
    const pc = n => (n / v[2]) * 100, other = v[2] - v[0] - v[1];
    const seg = (n, c, who) => (n ? `<span style="width:${pc(n)}%;background:${c}" title="${who}: ${fmtInt(n)} votes"></span>` : "");
    const side = (p, n) => `<ul class="tug-lines ${p === "D" ? "dem" : "gop"}"><li><b class="mg ${p === "D" ? "d" : "r"} pop-pc">${pc(n).toFixed(1)}%</b></li><li>${fmtInt(n)}</li></ul>`;
    const share = counted != null ? pctShort({ pct: counted, pct_of: "" }) : "";
    return `${heading ? `<h3>Popular vote${live ? " so far" : ""}</h3>` : ""}<div class="tug pop">
      <div class="tug-foot">${side("D", v[0])}${side("R", v[1])}</div>
      <div class="bar ev-bar tug-bar" style="--need:0.5">${seg(v[0], colors.demSolid, CAUCUS_NAME.D)}<i class="gap"></i>${seg(v[1], colors.gopSolid, CAUCUS_NAME.R)}<i class="need" title="Half the vote"></i></div>
      ${other > 0 ? `<p class="note">Others: ${pc(other).toFixed(1)}%, ${fmtInt(other)} votes</p>` : ""}
      <p class="note">${fmtInt(v[2])} votes${live ? " counted" : ""}${share}</p></div>`;
  }
  // past years: [held before, won] per seat -> the same counts as gains() gives for tonight
  function pastGains(pairs, why = "") {
    const z = () => ({ D: 0, R: 0, I: 0 });
    const g = { won: z(), lost: z(), lead: z(), leadLost: z(), unknown: 0, any: false, why };
    for (const [held, w] of pairs) {
      if (!held) { g.unknown++; continue; }
      g.any = true;
      if (held !== w) { g.won[w]++; g.lost[held]++; }
    }
    return g;
  }
  // House: one net number per party, for the country or one state (st). Once every race is
  // decided (past years; tonight when all are called): seats won now minus seats won last time.
  // While counting: called races against each seat's previous holder (the map's pickups).
  function houseNet(y, st = null) {
    const prevY = +y - 2, mine = id => !st || id.startsWith(st + "-");
    const before = extra.house?.races[String(prevY)];
    if (!before) return null;
    const live = +y === LIVE_YEAR;
    const now = Object.entries(houseRaces(y)).filter(([id]) => mine(id)).map(([, r]) => r);
    const winner = r => (live ? seatParty(r) : r.cands[0]?.caucus);
    const net = { D: 0, R: 0, I: 0 };
    const called = now.filter(winner).length;
    const done = now.length > 0 && called === now.length;
    if (done) {
      for (const r of now) net[winner(r)]++;
      for (const [id, r] of Object.entries(before)) if (mine(id)) net[r.cands[0].caucus]--;
    } else {
      for (const r of now) {
        const w = winner(r), h = live ? heldBy(r) : r.holder;
        if (w && h?.caucus && h.caucus !== w) { net[w]++; net[h.caucus]--; }
      }
    }
    return { net, title: done ? `Seats won in ${y} minus seats won in ${prevY}`
      : `Net from the ${called} of ${now.length} races called so far, against each seat's previous holder; final once all are called` };
  }
  // One row of a race list, the same columns everywhere: label | name (shortens to fit) |
  // status (✓ called, or the share counted while leading; empty for past years) | margin.
  // attrs: the button's data attributes; null for a row that is not a link
  function raceRow(attrs, what, who, status, lean) {
    const inner = `<span class="what">${what}</span><span class="who">${who}</span><span class="status">${status}</span>${lean}`;
    return attrs == null ? `<li><div class="prev-row">${inner}</div></li>` : `<li><button type="button" ${attrs}>${inner}</button></li>`;
  }
  const personCell = c => `${fitName(c)}${partyTag(c)}`;
  // a district's label in a list, marked when it is a new seat with no earlier holder
  const districtLabel = (id, r) => `${districtName(id, true)}${isNewSeat(r) ? ` <span class="new" title="New seat: no earlier holder">new</span>` : ""}`;
  // tonight: who is shown (the called winner, else the leader) and the status column
  function liveRowParts(r) {
    const l = counted(r) ? raceLean(r) : null, called = r.call && r.call.winner != null, ro = runoffOf(r);
    // a runoff: both people, one per line (each shortens to fit, with the party), → in the status column
    const who = called ? personCell(r.cands[r.call.winner]) : ro ? ro.map(c => `<span class="who-line">${personCell(c)}</span>`).join("")
      : l ? personCell(r.cands[l.lead]) : `<span class="muted">${liveStatus(r)}</span>`;
    const status = called ? `<span class="won">${CHECK}<span class="sr">won</span></span>`
      : ro ? `<span class="won" title="${attr(runoffText(r))}">${ARROW}<span class="sr">runoff</span></span>`
      : l ? `<span class="muted">${pctText(r).replace(/ of .*| counted/, "")}</span>` : "";
    return { who, status, lean: l ? leanLabel(l) : "" };
  }
  // Order of race lists, remembered per browser: A–Z (by state, or by district number),
  // Closest (smallest margin first) or D → R (biggest Democratic margin to biggest Republican);
  // "-r" at the end reverses it (Z–A, Widest, R → D)
  let raceSort = "az";
  try { raceSort = localStorage.getItem("raceSort") || "az"; } catch (e) { /* private mode: default order */ }
  const signedMargin = l => (!l ? null : l.caucus === "D" ? l.m : l.caucus === "R" ? -l.m : 0);
  // tonight: counted races first (in the chosen order), then closed polls with no votes yet,
  // then open polls by closing time; within a closing time, A–Z
  const liveGroup = r => (counted(r) ? 0 : !r.polls_close || isClosed(r) ? 1 : 2);
  // items: { html, m (signed margin or null), group, close } given in A–Z order
  function raceList(title, items, firstLabel = "A–Z", cls = "") {
    // six orders: A–Z / Z–A, closest / widest first, most Democratic / most Republican first
    const [base, rev] = [raceSort.replace(/-r$/, ""), raceSort.endsWith("-r")];
    const cmp = {
      az: (a, b) => a.i - b.i,
      close: (a, b) => Math.abs(a.m) - Math.abs(b.m),
      spectrum: (a, b) => b.m - a.m,
    }[base] || ((a, b) => a.i - b.i);
    const by = (a, b) => (rev ? -1 : 1) * cmp(a, b);
    const grp = x => (x.m == null ? Math.max(1, x.group ?? 1) : x.group ?? 0);
    const sorted = items.map((x, i) => ({ ...x, i })).sort((a, b) => grp(a) - grp(b)
      || (grp(a) === 0 ? by(a, b) : grp(a) === 2 ? Date.parse(a.close) - Date.parse(b.close) : 0) || a.i - b.i);
    // every order spelled out in one dropdown (the phone's own picker on phones)
    const districts = firstLabel === "1st–";
    const opts = [["az", districts ? "1st–last" : "A–Z"], ["az-r", districts ? "Last–1st" : "Z–A"], ["close", "Closest first"], ["close-r", "Widest first"],
      ["spectrum", "Most Democratic first"], ["spectrum-r", "Most Republican first"]];
    const sw = `<label class="list-sort">Sort <select data-sort>${opts.map(([k, label]) =>
      `<option value="${k}"${k === raceSort || (k === "az" && !opts.some(o => o[0] === raceSort)) ? " selected" : ""}>${label}</option>`).join("")}</select></label>`;
    // long lists: the first LIST_CAP rows and "Show all"; opened when the place in view is further
    // down, so its marked row is never hidden. A filter field searches the whole list
    const long = sorted.length > LIST_CAP, key = `${state.office}|${title}`;
    if (listView.key !== key) Object.assign(listView, { key, open: false, q: "" });
    const curAt = sorted.findIndex(x => x.html.includes('aria-current="true"'));
    const open = listView.open || curAt >= LIST_CAP;
    const rows = sorted.map((x, i) => x.html.replace("<li>", `<li data-q="${attr(searchText(x.html))}"${i >= LIST_CAP ? ' class="more"' : ""}>`)).join("");
    const search = long ? `<input type="search" class="list-search" placeholder="Filter" aria-label="Filter ${attr(title)}" value="${attr(listView.q)}">` : "";
    const more = long ? `<button type="button" class="quiet list-more" aria-expanded="${open}" data-n="${sorted.length}">${open ? "Show fewer" : `Show all ${sorted.length}`}</button>` : "";
    return `<div class="races-head"><h3>${title}</h3>${search}${sw}</div><ul class="race-list${cls ? ` ${cls}` : ""}${open ? " open" : ""}">${rows}</ul><p class="empty list-none" hidden>No matches.</p>${more}`;
  }
  const LIST_CAP = 40;
  const listView = { key: null, open: false, q: "" };  // per list: opened, filter text; reset when the list changes
  // a row's words for the filter: place, names, without accents ("sanchez" finds Sánchez)
  const fold = t => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const searchText = html => fold(html.replace(/data-forms="([^"]*)"/g, " $1 ").replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ")).replace(/\s+/g, " ").trim();
  function filterList() {
    const ul = racesEl.querySelector(".race-list"), q = fold(listView.q.trim());
    if (!ul) return;
    let n = 0;
    for (const li of ul.children) { const hit = !q || q.split(" ").every(w => li.dataset.q.includes(w)); li.classList.toggle("match", hit); n += hit; }
    ul.classList.toggle("searching", !!q);
    racesEl.querySelector(".list-none").hidden = !q || n > 0;
    const more = racesEl.querySelector(".list-more");
    if (more) more.hidden = !!q;
  }
  // The races card: every race at the map's level (the country: all races; a state: its
  // districts, or the counties of its one race), else, at the lowest level, the level above
  // with this place marked. Same rows for every office, past years and tonight.
  const selKey = sel => `${sel.type}:${sel.id ?? ""}`;
  function raceItem(r, label, go, cur) {
    const live = isLive(), x = live ? liveRowParts(r) : { who: personCell(r.cands[0]), status: "", lean: leanLabel(raceLean(r)) };
    return { m: !live || counted(r) ? signedMargin(raceLean(r)) : null, group: live ? liveGroup(r) : 0, close: r.polls_close,
      html: raceRow(`${go}${cur ? ' aria-current="true"' : ""}`, label, x.who, x.status, x.lean) };
  }
  // one county of a race: its leader and margin; tonight also the share counted
  function countyItem(r, fips) {
    const n = r.cands.length, v = r.counties[fips], l = v && v[n + 1] ? countyLean(r, fips) : null, cp = r.county_pct?.[fips];
    const who = l ? personCell(r.cands[l.lead]) : `<span class="muted">No votes yet</span>`;
    const status = isLive() && l && cp != null ? `<span class="muted">${Math.round(cp)}%</span>` : "";
    return { m: l ? signedMargin(l) : null, group: l ? 0 : 1, fips,
      html: raceRow(`data-go="county:${fips}"`, countyLabel(fips), who, status, l ? leanLabel(l) : "") };
  }
  const countyLabel = f => (data.counties[f]?.name ?? f).replace(/ (County|Parish)$/, "");
  const byName = (a, b) => (data.counties[a]?.name ?? a).localeCompare(data.counties[b]?.name ?? b);
  function levelList(sel) {
    const o = state.office, y = String(state.year), st = stateOf(sel);
    if (sel.type === "county" || sel.type === "district") return null;
    if (o === "president") {
      const c = data.candidates[y];
      const row = (s, label, go) => {
        const v = record(s, y), m = margin(v);
        if (m == null) return null;
        const p = m >= 0 ? "dem" : "gop", l = { caucus: p === "dem" ? "D" : "R", m: Math.abs(m) };
        return { m: signedMargin(l), html: raceRow(go, label, personCell({ name: fullName(c[p]), last: c[p], party: l.caucus }), "", leanLabel(l)) };
      };
      if (sel.type === "nation") {
        const sts = Object.keys(data.states).sort((a, b) => data.states[a].abbr.localeCompare(data.states[b].abbr));
        return { title: "States", items: sts.map(s => row({ type: "state", id: s }, data.states[s].abbr, `data-go="state:${s}"`)).filter(Boolean) };
      }
      if (SINGLE.has(st)) return null;
      const fs = Object.keys(data.counties).filter(f => f.startsWith(st) && data.counties[f].r[y]).sort(byName);
      return fs.length > 1 ? { title: `Counties in ${data.states[st].name}`, items: fs.map(f => row({ type: "county", id: f }, countyLabel(f), `data-go="county:${f}"`)).filter(Boolean), cls: "places" } : null;
    }
    if (o === "house") {
      const ids = Object.keys(hRaces()).filter(id => !st || id.startsWith(st + "-")).sort((a, b) =>
        data.states[a.slice(0, 2)].abbr.localeCompare(data.states[b.slice(0, 2)].abbr) || a.localeCompare(b));
      if (st && ids.length < 2) return null;
      const label = id => (st ? districtLabel(id, hRaces()[id])
        : `${data.states[id.slice(0, 2)].abbr} ${+id.slice(3) || "AL"}${isNewSeat(hRaces()[id]) ? ` <span class="new" title="New seat: no earlier holder">new</span>` : ""}`);
      return { title: st ? `Districts in ${data.states[st].name}` : "Districts", first: st ? "1st–" : "A–Z",
        items: ids.map(id => raceItem(hRaces()[id], label(id), `data-go="district:${id}"`)) };
    }
    // Senate and governors
    if (sel.type === "nation") {
      const rs = [...sYear()].sort((a, b) => data.states[a.st].abbr.localeCompare(data.states[b.st].abbr) || SEAT_ORDER[a.seat] - SEAT_ORDER[b.seat]);
      const here = stateOf(state.sel);
      return rs.length ? { title: "Races", items: rs.map(r => raceItem(r, `${data.states[r.st].abbr}${r.seat === "special" ? " sp." : ""}`,
        `data-race-st="${r.st}" data-race-seat="${r.seat}"`, r.st === here && r === senateRace(here))) } : null;
    }
    const r = senateRace(st), fs = Object.keys(r?.counties || {}).filter(f => data.counties[f]).sort(byName);
    return fs.length > 1 ? { title: `Counties in ${data.states[st].name}`, items: fs.map(f => countyItem(r, f)), cls: "places" } : null;
  }
  function racesCard() {
    let sel = state.sel, spec = levelList(sel);
    while (!spec && sel.type !== "nation") {
      sel = sel.type === "state" ? { type: "nation" } : { type: "state", id: stateOf(sel) };
      spec = levelList(sel);
    }
    if (!spec || !spec.items.length) return "";
    const st = stateOf(state.sel);
    const cur = `data-go="${state.office === "house" && state.sel.type === "state" && atLarge(st) ? `district:${st}-00` : selKey(state.sel)}"`;
    for (const x of spec.items) if (x.html.includes(cur + ">")) x.html = x.html.replace(cur, `${cur} aria-current="true"`);
    return raceList(spec.title, spec.items, spec.first, spec.cls);
  }
  // ---------- the history card: this race at this level in every election we have ----------
  // Same rows as the races card (year | winner | margin), newest first; a row opens that year.
  // The year in view is marked; tonight's race is in the panel, so only earlier years are listed.
  let histMode = null;  // country charts: "seats" or "pop" once picked on the card; null = as the map shows
  const histRow = (y, seat, label, who, lean, cur = y === state.year) =>
    raceRow(`data-hist="${y}"${seat ? ` data-hist-seat="${seat}"` : ""}${cur ? ' aria-current="true"' : ""}`, label, who, "", lean);
  // seats, the majority first (as in the year ribbon: "53–47 Republicans"); colored by the majority, plain when tied
  const seatSpan = (c, ctl) => `<span class="mg${ctl === "D" ? " d" : ctl === "R" ? " r" : ""}">${ctl === "R" ? `${c.R}–${c.D}` : `${c.D}–${c.R}`}${c.I ? `–${c.I}` : ""}</span>`;
  // "old map" on a district number drawn differently from the year in view
  const samePlan = (st, a, b) => extra.plans?.[String(a)]?.[st] === extra.plans?.[String(b)]?.[st];
  function historyCard() {
    const s = state.sel, o = state.office, st = stateOf(s);
    // pts: one per election, oldest first; each gives a row (year | who | lean) and a bar
    // (m: signed value, text: its label). Country views chart seats under the Winner map and the
    // popular-vote margin under Margin, like the year ribbon; the rows keep the seats
    const mapSeats = o === "president" ? categorical() : state.cmap === "winner";
    const seatsChart = s.type === "nation" && (histMode ? histMode === "seats" : mapSeats), pts = [];
    const signed = l => (l.caucus === "D" ? l.m : l.caucus === "R" ? -l.m : 0);
    const marginBar = l => ({ m: signed(l), text: mlabel(signed(l)) });
    // seats or electoral votes: the majority's count, up for Democrats, down for Republicans
    const seatBar = (c, ctl, total) => ({ m: ctl === "R" ? -c.R / total : ctl === "D" ? c.D / total : 0, text: ctl === "R" ? `${c.R}` : `${c.D}` });
    const popBar = v => ({ m: margin(v), text: mlabel(margin(v)) });
    // tonight's year is included: counted so far (won or leading), marked as such on hover
    const withLive = list => (isLive() ? [...list, LIVE_YEAR] : list);
    let title = "", note = "";
    if (o === "president") {
      const span = `${years[0]}–${years[years.length - 1]}`;
      title = s.type !== "nation" ? `Margin in ${placeName(s)}, ${span}` : `Every election, ${span}`;
      for (const y of years) {
        const c = data.candidates[y];
        if (s.type === "nation") {
          const [d, r] = ec(y).won, p = c.won, ctl = p === "dem" ? "D" : "R";
          pts.push({ y, who: personCell({ name: fullName(c[p]), last: c[p], party: ctl }),
            lean: `<span class="mg ${ctl.toLowerCase()}">${Math.max(d, r)}–${Math.min(d, r)}</span>`,  // winner first
            ...(seatsChart ? seatBar({ D: d, R: r }, ctl, 538) : popBar(data.nation[y])) });
          continue;
        }
        const m = margin(record(s, String(y)));
        if (m == null) continue;
        const p = m >= 0 ? "dem" : "gop", l = { caucus: p === "dem" ? "D" : "R", m: Math.abs(m) };
        pts.push({ y, who: personCell({ name: fullName(c[p]), last: c[p], party: l.caucus }), lean: leanLabel(l), ...marginBar(l) });
      }
    } else if (o === "governor") {
      // governor history has no page of its own yet: last time only, not a link
      const r = st && senateRace(st), p = r?.prev;
      if (!p) return "";
      const w = p.cands.reduce((a, b) => (b.votes > a.votes ? b : a)), l = lean(p.cands, p.cands.map(c => c.votes), p.total);
      return `<h3>Last time</h3><ul class="race-list">${raceRow(null, String(p.year), personCell(w), "", leanLabel(l))}</ul>
        <p class="note">${p.year} result: MIT Election Data and Science Lab, precinct returns summed to the state.</p>`;
    } else if (s.type === "nation") {
      const sen = o === "senate";
      title = `${sen ? "Senate" : "House"} after each election`;
      for (const y of withLive(sen ? extra.senate.years : extra.house.years)) {
        let c, pop;
        if (y === LIVE_YEAR) {
          // seats won or led so far (Senate: with the seats not up)
          if (sen) { const b = senateBalance(); c = {}; for (const p of ["D", "R", "I"]) c[p] = b[p].notUp + b[p].called + b[p].leading; }
          else c = liveHouseTally(Object.values(houseRaces(y)));
          c = { D: c.D, R: c.R };
          pop = sen ? senatePopular(y) : houseVotes(Object.values(houseRaces(y)));
        } else {
          c = sen ? extra.senate.control[y] : extra.house.seats[y];
          pop = sen ? senatePopular(y) : extra.house.popular[y];
        }
        const ctl = sen ? (y === LIVE_YEAR ? (c.D > c.R ? "D" : c.R >= 50 ? "R" : null) : senateControl(c, y)) : c.D >= 218 ? "D" : c.R >= 218 ? "R" : c.D > c.R ? "D" : c.R > c.D ? "R" : null;
        pts.push({ y, live: y === LIVE_YEAR, who: CAUCUS_NAME[ctl] ?? (sen ? "Tied" : "No majority"), lean: seatSpan(c, ctl),
          ...(seatsChart ? seatBar(c, ctl, sen ? 100 : 435) : popBar(pop)) });
      }
    } else if (o === "senate") {
      title = s.type === "county" ? `${placeName(s)} in Senate races` : `Senate races in ${data.states[st].name}`;
      for (const y of withLive(extra.senate.years)) {
        const rs = senateRaces(st, y);
        for (const r of rs) {
          const l = s.type === "county" ? countyLean(r, s.id) : raceLean(r);
          if (!l) continue;
          pts.push({ y, seat: r.seat, live: y === LIVE_YEAR, label: `${y}${r.seat === "special" ? " sp." : ""}`, cur: y === state.year && (r.seat === state.seat || rs.length === 1),
            who: personCell(r.cands[l.lead ?? 0]), lean: leanLabel(l), ...(l.unopposed ? { m: null, text: "" } : marginBar(l)) });
        }
      }
      if (!pts.length) note = `No Senate race in ${data.states[st].name} from 2020 to 2024.`;
    } else if (s.type === "district" || atLarge(st)) {
      const id = s.type === "district" ? s.id : `${st}-00`;
      title = districtName(id);
      for (const y of withLive(extra.house.years)) {
        const r = houseRaces(y)[id], l = r && (y !== LIVE_YEAR || counted(r)) ? raceLean(r) : null;
        if (!l) continue;
        const faded = !samePlan(st, y, state.year);
        pts.push({ y, faded, live: y === LIVE_YEAR, label: String(y), rowLabel: `${y}${faded ? ` <span class="old" title="Drawn differently from the ${state.year} map">old map</span>` : ""}`,
          who: personCell(r.cands[l.lead ?? 0]), lean: leanLabel(l), ...(l.unopposed ? { m: null, text: "" } : marginBar(l)) });
      }
    } else {
      title = `${possessive(data.states[st].name)} House delegation`;
      for (const y of withLive(extra.house.years)) {
        const mine = Object.entries(houseRaces(y)).filter(([id]) => id.startsWith(st + "-")).map(([, r]) => r);
        const won = y === LIVE_YEAR ? liveHouseTally(mine) : { D: 0, R: 0, I: 0 };
        if (y !== LIVE_YEAR) for (const r of mine) won[r.cands[0].caucus]++;
        const n = won.D + won.R + won.I, ctl = won.D > won.R ? "D" : won.R > won.D ? "R" : null;
        pts.push({ y, live: y === LIVE_YEAR, who: CAUCUS_NAME[ctl] ?? "Even", lean: seatSpan({ D: won.D, R: won.R, I: won.I }, ctl), ...seatBar(won, ctl, n) });
      }
    }
    if (!pts.length) return note ? `<h3>${title}</h3><p class="empty">${note}</p>` : "";
    for (const d of pts) {
      d.label ??= String(d.y);
      d.cur ??= d.y === state.year;
      d.attrs = `data-hist="${d.y}"${d.seat ? ` data-hist-seat="${d.seat}"` : ""}`;
    }
    const rows = [...pts].reverse().map(d => histRow(d.y, d.seat, d.rowLabel ?? d.label, d.who, d.lean, d.cur)).join("");
    const list = `<ul class="race-list">${rows}</ul>`;
    // a chart once there are two elections to compare; country charts switch between seats (or
    // electoral votes) and the popular-vote margin, starting from what the map shows
    const chart = pts.length > 1 ? barChart(pts, title) : "";
    const sw = chart && s.type === "nation" ? `<div class="mode" role="radiogroup" aria-label="Chart">${[["seats", o === "president" ? "Electoral votes" : "Seats"], ["pop", "Popular vote"]].map(([k, label]) =>
      `<button type="button" role="radio" aria-checked="${(k === "seats") === seatsChart}" data-hist-mode="${k}">${label}</button>`).join("")}</div>` : "";
    return `<div class="races-head"><h3>${title}</h3>${sw}</div>${chart ? `<div class="hist-body">${chart}${list}</div>` : list}`;
  }
  function houseStateBody(st) {
    const races = Object.entries(hRaces()).filter(([id]) => id.startsWith(st + "-")).sort();
    const won = { D: 0, R: 0, I: 0 };
    races.forEach(([, r]) => won[r.cands[0].caucus]++);
    // the same bar as the country view: seats won in this state's delegation, and seats that changed party
    const t = {};
    for (const p of ["D", "R", "I"]) t[p] = { solid: won[p], lead: 0, lines: [`${won[p]} won`] };
    return `${tugBar(t, races.length, "", houseNet(state.year, st), "districts")}${popSection(houseVotes(races.map(([, r]) => r)))}`;
  }

  function drawCongressPanel() {
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
      const n = Object.keys(hRaces()).filter(id => id.startsWith(st + "-")).length;
      html = headline("house", s, `${y} · ${n} districts`) + houseStateBody(st);
    }
    panel.innerHTML = html;

    panel.querySelectorAll(".tabs [data-seat]").forEach(b => b.addEventListener("click", () => {
      state.seat = b.dataset.seat;
      state.round = null;
      drawMap();
      drawPanel();
      writeHash();
    }));
    panel.querySelectorAll("[data-round]").forEach(b => b.addEventListener("click", () => {
      state.round = +b.dataset.round;
      drawMap();  // the race's state or district follows the tab
      drawPanel();
    }));
  }

  // ---------- election night 2026 (live) ----------
  const clock = iso => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "");
  const isClosed = r => Date.now() >= Date.parse(r.polls_close);
  const counted = r => !!(r.rounds && r.rounds.length && r.rounds[0].total);
  // who held the seat: Senate and governor races, the winner of the last election for it (r.prev);
  // House districts, the rule in houseHolder(). A called race won by the other side is a pickup
  const isHouseRace = r => /^\d\d-\d\d$/.test(r.id || "");
  function heldBy(r) {
    if (isHouseRace(r)) {
      if (r.holder === undefined && extra.house) r.holder = houseHolder(r.id, r.cands, LIVE_YEAR);
      return r.holder?.caucus ? r.holder : null;
    }
    const p = r.prev;
    if (!p || !p.cands || !p.cands.length) return null;
    const w = p.cands.reduce((a, b) => (b.votes > a.votes ? b : a));
    return { caucus: w.caucus, name: w.name, year: p.year };
  }
  const isNewSeat = r => !!(isHouseRace(r) ? (heldBy(r), r.holder) : r.holder)?.newSeat;
  // a hand call: the winner, or the two who advanced to a runoff (no winner yet)
  const callWinner = r => (r?.call && r.call.winner != null ? r.cands[r.call.winner] : null);
  const runoffOf = r => (r?.call?.advanced?.length ? r.call.advanced.map(i => r.cands[i]) : null);
  // the party that holds the seat for certain: a called winner's, or that of a runoff between two
  // of its own candidates (Louisiana's all-candidate primary); counted as won in the totals
  function seatParty(r) {
    const w = callWinner(r), ro = runoffOf(r);
    return w ? w.caucus : ro && ro.every(c => c.caucus === ro[0].caucus) ? ro[0].caucus : null;
  }
  const runoffText = r => { const ro = runoffOf(r); return ro ? `Runoff: ${ro.map(c => c.name).join(" and ")}` : ""; };
  function pickup(r) {
    const party = seatParty(r), held = party && heldBy(r);
    return held && held.caucus !== party ? { won: callWinner(r) || runoffOf(r)[0], held } : null;
  }
  function liveFill(r) {
    if (!r) return colors.nodata;
    if (state.cmap === "margin") return counted(r) ? leanColor(raceLean(r)) : colors.pending;
    const party = seatParty(r);
    if (party) return pickup(r) ? `url(#flip-${ckey(party)})` : colors[ckey(party) + "Solid"];
    if (runoffOf(r)) return colors.runoff;  // a runoff between parties: undecided
    if (!counted(r)) return colors.pending;
    return colors[ckey(raceLean(r).caucus)][1]; // leading, not called: one light shade
  }
  const pctText = r => (r.pct == null ? "" : `${r.pct < 1 && r.pct > 0 ? "<1" : Math.round(r.pct)}% ${r.pct_of && r.pct_of.startsWith("precincts") ? "of precincts reporting" : r.pct_of && r.pct_of.startsWith("polling") ? "of polling places reporting" : r.pct_of && r.pct_of.startsWith("counties") ? "of counties fully reported" : "counted"}`);
  // " (85%)" after a vote count; the hover says what the share is of (votes, precincts, counties)
  const pctShort = r => (r.pct == null ? "" : ` <span title="${pctText(r)}">(${r.pct < 1 && r.pct > 0 ? "<1" : Math.round(r.pct)}%)</span>`);
  function liveStatus(r) {
    if (r.call && r.call.winner != null) return `Called for ${r.cands[r.call.winner].name} by ${r.call.by}`;
    if (runoffOf(r)) return `${runoffText(r)}, called by ${r.call.by}`;
    if (counted(r)) return pctText(r) || "Counting";
    if (!isClosed(r)) return `Polls close at ${clock(r.polls_close)}`;
    return "Polls closed, no votes counted yet";
  }
  function liveTip(r) {
    if (!counted(r)) return `<span class="tip-note">${liveStatus(r)}</span>`;
    const rd = roundOf(r), winner = r.call && r.call.winner != null ? 0 : -1;
    return `<span class="tip-rows">${tipRows(r.cands, rd.votes, rd.total, winner)}</span>${leanLabel(raceLean(r))}
      <span class="hint">${liveStatus(r)}${r.test ? " · TEST DATA" : ""}</span>`;
  }
  function liveYearLabel() {
    const night = extra.live?.night, called = night?.senate_calls || { D: 0, R: 0, I: 0 };
    const n = called.D + called.R + called.I;
    const upd = liveFile()?.updated || liveFile("senate")?.updated;
    const on = !!night?.counting;
    // right of the year: the Live tag with the update time under it; the calls on the line below
    const time = upd ? `<span class="live-time" title="Results updated at ${clock(upd)}">${clock(upd)}</span>` : "";
    const tag = `<span class="live-stack"><span class="live-tag${on ? " on" : ""}" title="${on ? "Results are coming in" : "Live tonight: no votes counted yet"}"><span class="live-dot"></span>Live</span>${time}</span>`;
    return `<span class="yr">2026${tag}</span><span class="who">${n ? `Senate calls: <span class="mg d">${called.D}</span>–<span class="mg r">${called.R}</span>${called.I ? `–<span class="mg i">${called.I}</span>` : ""}` : "live tonight"}</span>`;
  }
  // "Source: Texas Secretary of State (official results), checked 22:48." The county panel names
  // the county figures' source; the race panel adds it when it differs from the totals' source
  function liveSource(r, county = false) {
    if (!r.source) return "";
    const line = (label, s) => {
      const name = s.url ? `<a href="${s.url}" target="_blank" rel="noopener">${s.name}</a>` : s.name;
      return `${label}: ${name} (${s.official ? "official results" : "unofficial"})${s.fetched ? `, checked ${clock(s.fetched)}` : ""}.`;
    };
    const cs = r.county_source;
    let t = county && cs ? line("Source", cs) : line("Source", r.source) + (cs ? ` ${line("County figures", cs)}` : "");
    if (r.stale) t += ` <strong>Not refreshed for a while; numbers may be behind.</strong>`;
    return `<p class="note">${t}</p>`;
  }
  const PARTY_ADJ = { D: "Democratic", R: "Republican", I: "Independent" };
  function pickupText(r) {
    const k = pickup(r);
    if (!k) return "";
    const h = k.held, when = h.how === "incumbent" ? "incumbent" : h.how === "number" ? `${h.year}, before the new map` : h.year;
    return `<p class="note"><strong>${PARTY_ADJ[k.won.caucus]} pickup</strong> · ${CAUCUS_NAME[h.caucus]} held this seat (${h.name}, ${when})</p>`;
  }
  function liveRaceBody(r, id = r.id) {
    let html = r.test ? `<p class="test-flag">Test data, not real results</p>` : "";
    if (!counted(r)) {
      const called = r.call && r.call.winner != null, adv = new Set(r.call?.advanced || []);
      html += `<div class="cand">${r.cands.map((c, i) => personRow(c, 0, 0, adv.has(i) ? "runoff" : called && i === r.call.winner)).join("")}</div>
        <p class="note">${[called ? `Called by ${r.call.by}` : adv.size ? `Runoff, called by ${r.call.by}` : liveStatus(r), isNewSeat(r) ? "New seat" : ""].filter(Boolean).join(" · ")}</p>${pickupText(r)}`;
    } else {
      const rd = roundOf(r), l = raceLean(r), called = r.call && r.call.winner != null;
      // a runoff call: the two who advanced in bold with →, no winner yet
      const ro = runoffOf(r);
      html += `<div class="cand">${peopleRows(r.cands, rd.votes, rd.total, rd.other, ro ? { advanced: new Set(r.call.advanced), to: "runoff" } : called ? 0 : -1)}</div>`;
      // the bars say who won or leads; the grey lines say who called it and how much is counted
      const facts = [called ? `Called by ${r.call.by}` : ro ? `Runoff, called by ${r.call.by}` : "", `${fmtInt(rd.total)} votes counted${pctShort(r)}`, isNewSeat(r) ? "New seat" : ""].filter(Boolean);
      html += `<p class="note">${facts.join(" · ")}</p>${pickupText(r)}`;
      // the source sits with the numbers it gave, above the chart
      html += liveSource(r) + `<div class="trail" data-trail="${id}"></div>`;
      return html;
    }
    return html + liveSource(r);
  }
  function liveCountyBody(r, fips) {
    const v = r.counties?.[fips], n = r.cands.length;
    if (!v || !v[n + 1]) return `<p class="empty">No votes counted in this county yet.</p>${liveSource(r, true)}`;
    const cp = r.county_pct?.[fips];
    const precincts = !r.county_source && r.pct_of && (r.pct_of.startsWith("precincts") || r.pct_of.startsWith("counties"));
    // same grey line as the race panel: votes counted (share)
    return `<div class="cand">${peopleRows(r.cands, v.slice(0, n), v[n + 1], v[n], -1)}</div>
      <p class="note">${fmtInt(v[n + 1])} votes counted${cp != null ? ` (${Math.round(cp)}%${precincts ? " of precincts reporting" : ""})` : ""}</p>${liveSource(r, true)}`;
  }
  // Senate balance tonight: seats not up (won in 2022/2024, current holder) + called + leading
  function senateBalance() {
    const b = { D: { notUp: 0, called: 0, leading: 0 }, R: { notUp: 0, called: 0, leading: 0 }, I: { notUp: 0, called: 0, leading: 0 }, pending: 0 };
    for (const x of liveFile("senate")?.notUp?.seats || []) if (x.party) b[x.party].notUp++;
    for (const r of liveRaces("senate")) {
      const party = seatParty(r);
      if (party) b[party].called++;
      else if (runoffOf(r)) b.pending++;  // a runoff between parties: undecided
      else if (counted(r)) b[raceLean(r).caucus].leading++;
      else b.pending++;
    }
    return b;
  }
  // One bar per office: Democrats fill from the left, Republicans from the right, solid = won (and,
  // for the Senate, not up), light = leading; others next to the Democrats; grey = no votes yet.
  // t[p] = { solid, lead, lines: [...] }; need = control marker text or null;
  // races = live races for pickups, or a gains object already counted (past years).
  // control = the party that holds the majority (past years) or has secured it tonight: its name in bold
  function tugBar(t, total, needText, races, what, under = "", control = null) {
    const n = p => (t[p] ? t[p].solid + t[p].lead : 0);
    const seg = (k, c, w) => (k ? `<span style="width:${(k / total) * 100}%;background:${c}" title="${w}: ${k}"></span>` : "");
    const segs = p => [seg(t[p]?.solid, colors[ckey(p) + "Solid"], t[p]?.solidText || "Won"), seg(t[p]?.lead, colors[ckey(p)][1], "Leading")];
    const [ds, dl] = segs("D"), [is_, il] = segs("I"), [rs, rl] = segs("R");
    // big number: certain seats only (won, and not up); leads are the light part of the bar and
    // the "leading" line under it
    const num = p => `<span class="tug-num"><b title="${t[p].solidText || "Won"}">${t[p].solid}</b></span>`;
    const g = Array.isArray(races) ? gains(races) : races;
    const EVEN = `<span class="even">= 0</span>`; // no change: in the text color, not green or red
    // House: one net number per party (houseNet); Senate and governors: gained and lost
    const netSide = p => {
      const n = g.net[p];
      return `<ul class="tug-lines tug-gains-side ${p === "D" ? "dem" : "gop"}"><li title="${g.title}">${n > 0 ? `<span class="gain">▲ ${n}</span>` : n < 0 ? `<span class="loss">▼ ${-n}</span>` : EVEN}</li></ul>`;
    };
    const arrows = p => {
      // called races only; leads in the other party's seats go in the hover text
      const lead = k => (k ? ` Not yet called: ahead in ${k} more.` : "");
      if (!g.won[p] && !g.lost[p]) return `<li title="No ${what} changed party.${lead(g.lead[p])}${lead(g.leadLost[p]).replace("ahead", "behind")}">${EVEN}</li>`;
      return `<li class="up" title="Won ${g.won[p]} ${what} the other party held before.${lead(g.lead[p])}"><span class="gain">▲ ${g.won[p]}</span></li>
        <li class="down" title="Lost ${g.lost[p]} ${what} this party held before.${lead(g.leadLost[p]).replace("ahead", "behind")}"><span class="loss">▼ ${g.lost[p]}</span></li>`;
    };
    // one row per kind (won, leading, not up): Democrats' count left, the label once in the
    // middle, Republicans' count right; each count next to its swatch in the bar
    const sw = (p, l) => `<i class="sw" style="background:${l.endsWith("leading") ? colors[ckey(p)][1] : colors[ckey(p) + "Solid"]}"></i>`;
    const split = l => [l.slice(0, l.indexOf(" ")), l.slice(l.indexOf(" ") + 1)];
    // drop a row of zero leads; when all that is left is "won", the big counts already say it
    const rows = t.D.lines.map((l, i) => [l, t.R.lines[i]]).filter(([d, r]) => !(d === "0 leading" && r === "0 leading"));
    const needLines = rows.some(([d]) => !d.endsWith(" won"));
    const lineRows = `<div class="tug-rows">${rows.map(([d, r]) => `<span class="dem">${sw("D", d)}${split(d)[0]}</span><span class="what">${split(d)[1]}</span><span class="gop">${split(r)[0]}${sw("R", r)}</span>`).join("")}</div>`;
    const gainSide = p => `<ul class="tug-lines tug-gains-side ${p === "D" ? "dem" : "gop"}">${arrows(p)}</ul>`;
    const other = n("I") ? `<p class="tug-other">${CAUCUS_NAME.I}: ${n("I")} (${t.I.lines.join(", ")})</p>` : "";
    return `<div class="tug">
      <div class="tug-head"><span class="dem">${partyAvatar("D", colors.demSolid)}<span class="tug-who">${num("D")}<span class="pname${control === "D" ? " has-control" : ""}" data-forms="${CAUCUS_NAME.D}|${SHORT_NAME.D}"${control === "D" ? ' data-title="Majority" title="Majority"' : ""}>${CAUCUS_NAME.D}</span></span></span><span class="gop"><span class="tug-who">${num("R")}<span class="pname${control === "R" ? " has-control" : ""}" data-forms="${CAUCUS_NAME.R}|${SHORT_NAME.R}"${control === "R" ? ' data-title="Majority" title="Majority"' : ""}>${CAUCUS_NAME.R}</span></span>${partyAvatar("R", colors.gopSolid)}</span></div>
      ${g?.net ? `<div class="tug-foot tug-gains">${netSide("D")}${netSide("R")}</div>` : g?.any ? `<div class="tug-foot tug-gains">${gainSide("D")}${gainSide("R")}</div>` : ""}
      <div class="bar ev-bar tug-bar" style="--need:0.5">${ds}${dl}${is_}${il}<i class="gap"></i>${rl}${rs}${needText != null ? `<i class="need" title="${needText || "Half the seats"}"></i>` : ""}</div>
      ${needText ? `<p class="tug-need">${needText}</p>` : ""}
      ${needLines ? lineRows : ""}${under}${other}</div>`;
  }
  // Seats changing party: called pickups (won/lost) and leads in seats the other party held last time
  function gains(races) {
    const z = () => ({ D: 0, R: 0, I: 0 });
    const g = { won: z(), lost: z(), lead: z(), leadLost: z(), unknown: 0, any: false };
    for (const r of races) {
      const held = heldBy(r);
      if (!held) { g.unknown++; continue; }
      g.any = true;
      const called = !!seatParty(r);
      const c = called ? seatParty(r) : runoffOf(r) ? null : counted(r) ? raceLean(r).caucus : null;
      if (!c || c === held.caucus) continue;
      (called ? g.won : g.lead)[c]++;
      (called ? g.lost : g.leadLost)[held.caucus]++;
    }
    return g;
  }
  function senateBalanceBody() {
    const notUp = liveFile("senate")?.notUp;
    if (!notUp) return "";
    const b = senateBalance();
    const t = {};
    // independents who caucus with neither party (e.g. Dan Osborn) sit next to the Democrats
    for (const p of ["D", "R", "I"]) t[p] = { solid: b[p].notUp + b[p].called, lead: b[p].leading, solidText: "Not up or won",
      lines: [`${b[p].notUp} not up`, `${b[p].called} won`, `${b[p].leading} leading`] };
    const changed = (notUp.seats || []).filter(x => x.note);
    return `${tugBar(t, 100, senateNeed("R"), liveRaces("senate"), "seats", "", t.D.solid >= 51 ? "D" : t.R.solid >= 50 ? "R" : null)}
      ${changed.length ? `<ul class="notes"><li>Seats not up held by someone other than that race's winner: ${changed.map(x => x.note).join(" ")}</li></ul>` : ""}
      ${popSection(senatePopular(null, liveRaces("senate")), true)}<p class="note">${SENATE_POP_NOTE.replace("this year's", "tonight's")}</p>`;
  }
  // governors: only tonight's races (we have no list of the governors not up)
  function governorTallyBody(rs) {
    const x = liveHouseTally(rs), t = {};
    for (const p of ["D", "R", "I"]) t[p] = { solid: x.won[p], lead: x[p] - x.won[p], lines: [`${x.won[p]} won`, `${x[p] - x.won[p]} leading`] };
    return tugBar(t, rs.length, null, rs, "seats");
  }
  function liveNationBody() {
    const rs = [...sYear()].sort((a, b) => data.states[a.st].abbr.localeCompare(data.states[b.st].abbr) || SEAT_ORDER[a.seat] - SEAT_ORDER[b.seat]);
    if (!rs.length) return `<p class="empty">No results file yet. Start the importer: <code>uv run pipeline/live.py</code></p>`;
    const test = rs.some(r => r.test) ? `<p class="test-flag">Test data, not real results</p>` : "";
    return `${test}${state.office === "senate" ? senateBalanceBody() : governorTallyBody(rs)}`;
  }
  // footer: name the official sources the live results come from right now
  function drawLiveSources() {
    const el = document.getElementById("live-sources");
    if (!el) return;
    const official = new Map();
    for (const r of liveRaces()) if (r.source && r.source.official) official.set(r.source.name, r.source.url);
    const list = [...official].sort((a, b) => a[0].localeCompare(b[0])).map(([n, u]) => (u ? `<a href="${u}">${n}</a>` : n));
    const joined = list.length > 1 ? list.slice(0, -1).join(", ") + " and " + list[list.length - 1] : list[0];
    el.innerHTML = `2026 results, live: ${list.length ? `official results from ${joined}; ` : ""}unofficial counts from <a href="https://civicapi.org/">civicAPI</a> where states do not publish live data or block scripts, and its county figures where a state gives statewide totals only; entries typed in by hand name their source. Poll closing times: <a href="https://www.cbsnews.com/news/when-polls-open-close-2026-midterm-elections/">CBS News</a>.`;
  }
  function drawLivePanel() {
    drawLiveSources();
    if (state.office === "house") return drawLiveHousePanel();
    const s = state.sel, st = stateOf(s);
    let html;
    if (s.type === "nation") {
      html = headline(state.office, s, liveWhen()) + liveNationBody();
    } else {
      const rs = senateRaces(st), r = senateRace(st);
      html = headline(state.office, s, liveWhen(), r?.seat === "special");
      if (rs.length > 1) {
        html += `<div class="mode tabs" role="radiogroup" aria-label="Race">${rs.map(x =>
          `<button type="button" role="radio" aria-checked="${x === r}" data-seat="${x.seat}">${seatLabel(x)}</button>`).join("")}</div>`;
      }
      if (!r) html += `<p class="empty">No race followed in ${data.states[st].name} tonight.</p>`;
      else html += s.type === "state" ? liveRaceBody(r) : liveCountyBody(r, s.id);
    }
    panel.innerHTML = html;
    panel.querySelectorAll(".tabs [data-seat]").forEach(b => b.addEventListener("click", () => {
      state.seat = b.dataset.seat;
      drawMap();
      drawPanel();
      writeHash();
    }));
    fillTrail();
  }
  // ---------- the race through the night (web/data/live/trail-<office>.json) ----------
  // Loaded only when a race panel is open, and again only when the office file says the chart
  // file changed. Points are the source's updates as reported: a step line, no smoothing and
  // no projection; a change of source is marked.
  const trails = {};
  async function fillTrail() {
    const el = panel.querySelector(".trail[data-trail]");
    if (!el) return;
    const office = liveOffice(state.office), want = liveFile(office)?.trailUpdated;
    if (!want) return;
    if (trails[office]?.updated !== want) {
      try { trails[office] = await d3.json(`data/live/trail-${office}.json?t=${encodeURIComponent(want)}`); } catch (e) { return; }
    }
    const now = panel.querySelector(`.trail[data-trail="${el.dataset.trail}"]`);  // the panel may have been redrawn meanwhile
    const tr = trails[office]?.races?.[el.dataset.trail];
    if (now && tr && tr.pts.length) {
      now.innerHTML = trailChart(tr, el.dataset.trail);
      trailHover(now);
    }
  }
  // hover (or touch): a marker on the nearest update and a small box with its numbers
  let trailInfo = null;
  function trailHover(el) {
    const info = trailInfo, svg = el.querySelector("svg"), tip = el.querySelector(".trail-tip"), mark = el.querySelector(".mark");
    if (!info || !svg || !tip || !mark) return;
    const hide = () => { tip.hidden = true; mark.setAttribute("visibility", "hidden"); };
    svg.addEventListener("pointerleave", hide);
    svg.addEventListener("pointermove", ev => {
      const box = svg.getBoundingClientRect(), k = info.w / box.width;
      // the update nearest the pointer along the count (totals can dip at a change of source)
      const at = (ev.clientX - box.left) * k, p = d3.least(info.pts, q => Math.abs(info.x(q.v) - at));
      const px = info.x(p.v), py = info.y(Math.max(-info.M, Math.min(info.M, p.m)));
      mark.setAttribute("visibility", "visible");
      mark.querySelector("line").setAttribute("x1", px);
      mark.querySelector("line").setAttribute("x2", px);
      mark.querySelector("circle").setAttribute("cx", px);
      mark.querySelector("circle").setAttribute("cy", py);
      const lead = p.m >= 0 ? info.ca : info.cb;
      tip.innerHTML = `<strong>${clock(new Date(p.t).toISOString())}</strong>
        <span><span style="color:${candFill(lead)};font-weight:700">${lead.last || lead.name}</span> +${Math.abs(p.m).toFixed(1)}</span>
        <span class="tip-note">${p.pct != null ? `${Math.round(p.pct)}% counted · ` : ""}${fmtInt(p.total)} votes</span>
        <span class="tip-note">${info.srcs[p.src]}</span>`;
      tip.hidden = false;
      tip.style.top = `${svg.offsetTop + svg.offsetHeight + 2}px`;  // under the chart, not over the line
      // keep the box inside the chart: left of the marker on the right half
      const left = px / k, right = px / k > box.width / 2;
      tip.style.left = right ? "" : `${left + 10}px`;
      tip.style.right = right ? `${box.width - left + 10}px` : "";
    });
  }
  // the chart's x axis: votes counted (every US source gives it, it only grows, it means the same
  // in every race). "pct" suits a country with one national source whose share counted is consistent
  const TRAIL_X = "total";
  const TRAIL_AXIS = {
    total: { value: p => p.total, tick: d3.format("~s") },             // 0, 500k, 1M
    pct: { value: p => p.pct, max: 100, tick: v => `${v}%` },          // 0%, 50%, 100%
  };
  function trailChart(tr, id) {
    const race = Object.values(liveFile()?.races || {}).find(x => x.id === id) || liveFile()?.races?.[id];
    const last = tr.pts[tr.pts.length - 1], n = tr.cands.length;
    const vote = (p, i) => p[4 + i] || 0;
    // the two candidates ahead in the latest count: the line is the first one's lead over the second
    const [a, b] = d3.range(n).sort((i, j) => vote(last, j) - vote(last, i));
    if (b == null) return "";
    const person = name => race?.cands.find(c => c.name === name) || { name, party: "O", caucus: "I" };
    const ca = person(tr.cands[a]), cb = person(tr.cands[b]);
    const ax = TRAIL_AXIS[TRAIL_X];
    const pts = tr.pts.map(p => ({ t: p[0] * 1000, m: p[2] ? 100 * (vote(p, a) - vote(p, b)) / p[2] : 0, src: p[3], total: p[2], pct: p[1] }))
      .map(p => ({ ...p, v: ax.value(p) })).filter(p => p.v != null);
    if (!pts.length) return "";
    const w = 300, h = 150, left = 4, right = 34, top = 14, bottom = 20;
    // x: how much is counted, from nothing to the latest count
    const x = d3.scaleLinear().domain([0, Math.max(ax.max ?? 0, d3.max(pts, p => p.v)) || 1]).range([left, w - right]);
    // scale to the count once 5% of the latest total is in: the first few counties are often
    // lopsided and would flatten the rest of the night; earlier points run off the chart (clipped)
    const settled = pts.filter(p => p.total >= 0.05 * pts[pts.length - 1].total);
    const M = Math.max(2, Math.ceil(d3.max(settled.length ? settled : pts, p => Math.abs(p.m)) * 1.15));
    const y = d3.scaleLinear().domain([-M, M]).range([h - bottom, top]);
    // straight from one update to the next: the votes in between came in with that batch
    const line = d3.line().x(p => x(p.v)).y(p => y(p.m))(pts);
    const area = d3.area().x(p => x(p.v)).y0(y(0)).y1(p => y(p.m))(pts);
    // dots where updates are, only where there is room (at least 9 units from the last dot);
    // the first, the last and each change of source always get one. Hover snaps to every update
    const at = p => [x(p.v), y(Math.max(-M, Math.min(M, p.m)))];
    const dots = [];
    pts.forEach((p, i) => {
      if (Math.abs(p.m) > M) return;  // early lopsided counts run off the chart: no dot at its edge
      const [px, py] = at(p), prev = dots[dots.length - 1];
      const must = i === 0 || i === pts.length - 1 || p.src !== pts[i - 1].src;
      if (must || !prev || Math.hypot(px - prev[0], py - prev[1]) >= 9) {
        if (i === pts.length - 1 && prev && Math.hypot(px - prev[0], py - prev[1]) < 9) dots.pop();  // the last one wins its spot
        dots.push([px, py]);
      }
    });
    const cid = `tc-${id}`.replace(/[^\w-]/g, "");
    const switches = pts.filter((p, i) => i && p.src !== pts[i - 1].src).map(p =>
      `<line class="src" x1="${x(p.v)}" x2="${x(p.v)}" y1="${top - 4}" y2="${h - bottom}"><title>From here: ${tr.srcs[p.src]}</title></line>`).join("");
    const ticks = x.ticks(4).map(t => `<text x="${x(t)}" y="${h - 5}" text-anchor="middle">${ax.tick(t)}</text>`).join("");
    trailInfo = { pts, x, y, M, w, ca, cb, srcs: tr.srcs };
    const last2 = (s, c) => `<tspan fill="${candFill(c)}" font-weight="700">${c.last || c.name}</tspan>${s}`;
    return `<h3>Through the night</h3>
      <svg class="history trail-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${possessive(ca.name)} lead over ${cb.name} as the votes were counted">
        <defs><clipPath id="${cid}-up"><rect x="0" y="${top}" width="${w}" height="${y(0) - top}"/></clipPath>
          <clipPath id="${cid}-dn"><rect x="0" y="${y(0)}" width="${w}" height="${h - bottom - y(0)}"/></clipPath>
          <clipPath id="${cid}-in"><rect x="0" y="${top}" width="${w}" height="${h - bottom - top}"/></clipPath></defs>
        <path d="${area}" fill="${candFill(ca)}" opacity="0.18" clip-path="url(#${cid}-up)"/>
        <path d="${area}" fill="${candFill(cb)}" opacity="0.18" clip-path="url(#${cid}-dn)"/>
        <line class="zero" x1="${left}" x2="${w - right}" y1="${y(0)}" y2="${y(0)}"/>
        ${switches}
        <path d="${line}" fill="none" stroke="var(--ink)" stroke-width="1.6" clip-path="url(#${cid}-in)"/>
        <g class="dots" clip-path="url(#${cid}-in)">${dots.map(([px, py]) => `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="2"/>`).join("")}</g>
        <text x="${left}" y="${top - 3}">${last2(" ahead", ca)}</text>
        <text x="${left}" y="${h - bottom - 4}">${last2(" ahead", cb)}</text>
        <text x="${w - right + 4}" y="${y(M) + 8}">+${M}</text><text x="${w - right + 4}" y="${y(0) + 4}">0</text><text x="${w - right + 4}" y="${y(-M)}">+${M}</text>
        ${ticks}
        <g class="mark" visibility="hidden"><line y1="${top}" y2="${h - bottom}"/><circle r="3.5"/></g>
        <rect x="${left}" y="0" width="${w - left - right}" height="${h}" fill="transparent"/>
      </svg><div class="tip trail-tip" hidden></div>
      ${switches || trails[liveOffice(state.office)]?.test ? `<p class="note">${switches ? "Dashed line: a change of source." : ""}${trails[liveOffice(state.office)]?.test ? " Test data." : ""}</p>` : ""}`;
  }

  // ---------- live House: 435 races, leaders only (no calls) ----------
  // per caucus: seats won (called by hand, with who called them) and seats leading
  function liveHouseTally(races) {
    const t = { D: 0, R: 0, I: 0, none: 0, runoff: 0, won: { D: 0, R: 0, I: 0 } };
    for (const r of races) {
      const party = seatParty(r);
      if (party) { t[party]++; t.won[party]++; continue; }
      if (runoffOf(r)) { t.runoff++; continue; }  // a runoff between parties: undecided
      const l = counted(r) ? raceLean(r) : null;
      if (l) t[l.caucus]++; else t.none++;
    }
    return t;
  }
  function liveHouseNationBody() {
    const rs = Object.values(hRaces());
    if (!rs.length) return `<p class="empty">No House results yet. Start the importer: <code>uv run pipeline/live.py</code></p>`;
    const x = liveHouseTally(rs), t = {};
    for (const p of ["D", "R"]) t[p] = { solid: x.won[p], lead: x[p] - x.won[p], lines: [`${x.won[p]} won`, `${x[p] - x.won[p]} leading`] };
    const test = rs.some(r => r.test) ? `<p class="test-flag">Test data, not real results</p>` : "";
    return `${test}${tugBar(t, 435, "218 for a majority", houseNet(LIVE_YEAR), "districts", "", t.D.solid >= 218 ? "D" : t.R.solid >= 218 ? "R" : null)}${popSection(houseVotes(rs), true)}
`;
  }
  function drawLiveHousePanel() {
    const s = state.sel, st = stateOf(s), races = hRaces();
    let html;
    if (s.type === "nation") {
      html = headline("house", s, liveWhen()) + liveHouseNationBody();
    } else if (s.type === "district" || atLarge(st)) {
      const id = s.type === "district" ? s.id : `${st}-00`, r = races[id];
      html = headline("house", { type: "district", id }, liveWhen()) + (r ? liveRaceBody(r, id) + notesList(r.notes) : `<p class="empty">No result.</p>`);
    } else {
      const ds = Object.entries(races).filter(([id]) => id.startsWith(st + "-")).sort();
      const t = liveHouseTally(ds.map(([, r]) => r));
      const tt = {};
      for (const p of ["D", "R", "I"]) tt[p] = { solid: t.won[p], lead: t[p] - t.won[p], lines: [`${t.won[p]} won`, `${t[p] - t.won[p]} leading`] };
      html = `${headline("house", { type: "state", id: st }, `${liveWhen()} · ${ds.length} districts`)}
        ${tugBar(tt, ds.length, "", houseNet(LIVE_YEAR, st), "districts")}${t.none ? `<p class="tug-other">${t.none} with no votes counted yet.</p>` : ""}${popSection(houseVotes(ds.map(([, r]) => r)), true)}${notesList(ds[0]?.[1].notes)}`;
    }
    panel.innerHTML = html;
    fillTrail();
  }

  // re-read the results file every 30 seconds; redraw only when it changed
  setInterval(async () => {
    if (!isLive()) return;
    const before = liveFile()?.updated;
    await loadLive(state.office);
    if (liveFile()?.updated !== before) { drawYears(); drawMap(); drawPanel(); }
  }, 30000);

  // ---------- state finder: type to narrow the list (combobox) ----------
  const tools = document.querySelector(".map-tools");
  const combo = document.createElement("div");
  combo.className = "combo";
  combo.innerHTML = `
    <input id="state-find" type="text" role="combobox" aria-expanded="false" aria-autocomplete="list"
      aria-controls="state-options" aria-label="Find a state" placeholder="Find a state" autocomplete="off" spellcheck="false">
    <ul id="state-options" role="listbox" aria-label="States" hidden></ul>`;
  tools.append(combo);
  const finder = combo.querySelector("input");
  const listbox = combo.querySelector("ul");
  const stateList = Object.entries(data.states)
    .map(([id, s]) => ({ id, name: s.name, abbr: s.abbr }))
    .sort((a, b) => a.name.localeCompare(b.name));
  let matches = [], active = -1;

  function filterStates(q) {
    q = q.trim().toLowerCase();
    if (!q) return stateList;
    // names starting with the text first, then any word starting with it ("carolina")
    const starts = [], words = [];
    for (const s of stateList) {
      const n = s.name.toLowerCase();
      if (n.startsWith(q) || s.abbr.toLowerCase() === q) starts.push(s);
      else if (n.split(/\s+/).some(w => w.startsWith(q))) words.push(s);
    }
    return [...starts, ...words];
  }
  function renderOptions() {
    listbox.innerHTML = matches.length
      ? matches.map((s, i) => `<li role="option" id="opt-${s.id}" data-id="${s.id}" aria-selected="${i === active}">${s.name} <span class="abbr">${s.abbr}</span></li>`).join("")
      : `<li class="none" role="presentation">No state matches “${finder.value.replace(/[<&]/g, "")}”</li>`;
    finder.setAttribute("aria-activedescendant", active >= 0 && matches[active] ? `opt-${matches[active].id}` : "");
    listbox.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }
  function openList() {
    matches = filterStates(finder.value);
    active = finder.value.trim() && matches.length ? 0 : -1;
    listbox.hidden = false;
    finder.setAttribute("aria-expanded", "true");
    renderOptions();
  }
  function closeList() {
    listbox.hidden = true;
    finder.setAttribute("aria-expanded", "false");
    finder.removeAttribute("aria-activedescendant");
  }
  function chooseState(id) {
    closeList();
    select({ type: "state", id }, true);
    finder.blur();
  }
  function syncFinder() {
    const st = state.sel.type === "state" ? state.sel.id : null;
    finder.value = st ? data.states[st].name : "";
  }
  finder.addEventListener("focus", () => { finder.select(); openList(); });
  finder.addEventListener("input", openList);
  finder.addEventListener("blur", () => setTimeout(() => { closeList(); syncFinder(); }, 120));
  finder.addEventListener("keydown", e => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (listbox.hidden) openList();
      if (!matches.length) return;
      active = e.key === "ArrowDown" ? (active + 1) % matches.length : (active - 1 + matches.length) % matches.length;
      renderOptions();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = matches[active >= 0 ? active : 0];
      if (pick) chooseState(pick.id);
    } else if (e.key === "Escape") {
      e.stopPropagation();
      closeList();
      syncFinder();
      finder.blur();
    }
  });
  listbox.addEventListener("mousedown", e => e.preventDefault()); // keep focus in the input
  listbox.addEventListener("click", e => {
    const li = e.target.closest("li[data-id]");
    if (li) chooseState(li.dataset.id);
  });

  // ---------- actions ----------
  function select(sel, zoomIt = false) {
    if (sel.type !== state.sel.type || sel.id !== state.sel.id) state.round = null;
    if (stateOf(sel) !== stateOf(state.sel)) state.seat = "regular";
    state.sel = sel;
    if (zoomIt || sel.type === "nation") {
      const st = stateOf(sel);
      if (sel.type === "county") zoomTo(shapeById.get(sel.id), 0.3);
      else if (sel.type === "district") zoomTo(districtShape(sel.id), 0.5);
      else zoomTo(st ? stateById.get(st) : null);
    }
    syncFinder();
    drawCrumbs();
    if (state.office !== "president") drawMap(); // a Senate state's counties follow the race chosen in the panel
    drawSelection();
    drawLegend();
    drawBadges();
    drawArrows();
    drawPanel();
    writeHash();
  }
  // a new year keeps the race type when that year has it (else president, else Senate)
  async function setYear(y) {
    const o = officeFor(y, state.office);
    await ensureData(o, y);
    const officeChanged = o !== state.office;
    state.year = y;
    state.office = o;
    state.round = null;
    if (o !== "president") { state.mode = "margin"; state.arrows = false; }
    if (o === "house" && state.level === "counties") state.level = "states";
    // a district number means a different place after redistricting: go back to its state
    if (state.sel.type === "district" && (o !== "house" || !houseRaces(y)[state.sel.id])) state.sel = { type: "state", id: stateOf(state.sel) };
    if (state.sel.type === "county" && o === "house") state.sel = { type: "state", id: stateOf(state.sel) };
    syncToggles();
    drawHeadline();
    drawYears();
    drawMap();
    select(state.sel, officeChanged);
  }
  async function setOffice(o) {
    if (o === state.office || !HAS[o](state.year)) return;
    await ensureData(o, state.year);
    state.office = o;
    state.round = null;
    state.seat = "regular";
    if (o !== "president") { state.mode = "margin"; state.arrows = false; }
    // keep the chosen state; a county or district only makes sense in its own office
    const st = stateOf(state.sel);
    state.sel = st ? { type: "state", id: st } : { type: "nation" };
    if (o === "house" && state.level === "counties") state.level = "states";
    syncToggles();
    drawHeadline();
    drawYears();
    drawMap();
    select(state.sel, true);
  }
  const arrowsBtn = document.getElementById("arrows");
  function syncToggles() {
    const pres = state.office === "president";
    document.querySelectorAll("[data-office]").forEach(b => {
      const o = b.dataset.office, ok = HAS[o](state.year);
      b.setAttribute("aria-checked", String(o === state.office));
      b.setAttribute("aria-disabled", String(!ok));
      b.title = ok ? "" : WHY_NOT[o](state.year);
    });
    const shown = state.mode === "shift" ? "shift" : state.level === "counties" ? "margin" : state.cmap;
    document.querySelectorAll("[data-mode]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.mode === shown)));
    document.querySelectorAll("[data-level]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.level === state.level)));
    // Senate and House show the margin only (no Shift yet); the House map is by district
    document.querySelector("[data-mode]").parentElement.hidden = !pres;
    document.getElementById("level-toggle").hidden = state.office === "house";
    document.querySelectorAll("[data-cmap]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.cmap === state.cmap)));
    // Winner | Margin: Senate, House and governor maps of races (not county figures)
    document.getElementById("cmap-toggle").hidden = pres || (state.office !== "house" && state.level === "counties");
    arrowsBtn.hidden = !pres || state.mode !== "shift";
    // footer: only the sources of what is on screen (plus the lines every view needs)
    const view = isLive() ? "live" : state.office;
    document.querySelectorAll(".colophon [data-src]").forEach(el => { el.hidden = !el.dataset.src.split(" ").includes(view); });
    arrowsBtn.setAttribute("aria-pressed", String(state.arrows));
  }
  arrowsBtn.addEventListener("click", () => {
    state.arrows = !state.arrows;
    syncToggles();
    drawArrows();
    writeHash();
  });
  // president: Winner | Margin | Shift in one control (Winner and Margin share the margin view)
  function setMode(m) {
    histMode = null;
    if (m === "shift") state.mode = "shift";
    else {
      state.mode = "margin";
      state.cmap = m;
      if (m === "winner" && state.level === "counties") state.level = "states"; // Winner colors states
    }
    syncToggles();
    drawMap();
    drawPanel();
    writeHash();
  }
  function setLevel(l) {
    state.level = l;
    syncToggles();
    drawMap();
    writeHash();
  }
  function setCmap(c) {
    state.cmap = c;
    histMode = null;
    syncToggles();
    drawMap();
    drawYears();
    drawPanel();
    writeHash();
  }
  function drawHeadline() {
    const h = document.getElementById("headline"), dek = document.getElementById("dek");
    if (state.office === "president") {
      h.innerHTML = `How America voted, <span class="nowrap">2000 to 2024</span>`;
      dek.textContent = "Every presidential election since 2000, from the Electoral College down to the county. Click a state to see its counties, and a county to see how it has voted over time.";
    } else if (state.office === "senate" && !isLive()) {
      h.innerHTML = `How America voted for the Senate, <span class="nowrap">2020 to 2024</span>`;
      dek.textContent = "Every Senate race in 2020, 2022 and 2024, by state and county. About a third of the Senate is elected every two years.";
    } else if (state.office === "house" && !isLive()) {
      h.innerHTML = `How America voted for the House, <span class="nowrap">2020 to 2024</span>`;
      dek.textContent = "All 435 seats in 2020, 2022 and 2024, district by district.";
    } else {
      h.innerHTML = `Election night, <span class="nowrap">November 3, 2026</span>`;
      dek.textContent = (state.office === "governor" ? "36 states elect a governor."
        : state.office === "house" ? "All 435 seats, on this year's district maps (nine states drew new ones)."
        : "35 Senate seats are on the ballot, including special elections in Florida and Ohio.")
        + " Results from state election offices and civicAPI. Times are in your time zone.";
    }
    document.title = state.office === "president" ? "Election Lens"
      : isLive() ? "Election night 2026 · Election Lens" : `${state.office === "senate" ? "Senate" : "House"} results · Election Lens`;
  }

  document.querySelectorAll("[data-office]").forEach(b => b.addEventListener("click", () => setOffice(b.dataset.office)));
  document.querySelectorAll("[data-mode]").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));
  document.querySelectorAll("[data-level]").forEach(b => b.addEventListener("click", () => setLevel(b.dataset.level)));
  document.querySelectorAll("[data-cmap]").forEach(b => b.addEventListener("click", () => setCmap(b.dataset.cmap)));
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
    syncToggles();
    drawHeadline();
    drawYears();
    drawMap();
    select(state.sel, true);
  });
  // ---------- light / dark switch (starts from the system setting, then remembers the choice) ----------
  const themeBtn = document.getElementById("theme");
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
  const SUN = `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3" fill="currentColor"/><g stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3 3l1.1 1.1M11.9 11.9L13 13M3 13l1.1-1.1M11.9 4.1L13 3"/></g></svg>`;
  const MOON = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 10.2A6 6 0 0 1 5.8 2.5a6 6 0 1 0 7.7 7.7z" fill="currentColor"/></svg>`;
  const currentTheme = () => document.documentElement.dataset.theme || (systemDark.matches ? "dark" : "light");
  // one button that looks like the States / Counties control: sun = light, moon = dark; a click flips it
  themeBtn.innerHTML = `<span class="thumb"></span><span class="seg sun">${SUN}</span><span class="seg moon">${MOON}</span>`;
  function drawThemeButton() {
    const dark = currentTheme() === "dark";
    themeBtn.setAttribute("aria-checked", String(dark));
    themeBtn.title = dark ? "Switch to light mode" : "Switch to dark mode";
  }
  function refreshColors() { readColors(); drawMap(); drawPanel(); drawThemeButton(); }
  themeBtn.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch (e) { /* private mode: still switches for this visit */ }
    refreshColors();
  });
  systemDark.addEventListener("change", refreshColors);
  drawThemeButton();

  // ---------- shareable links: #race=senate&year=2024&view=shift&map=counties&vote=popular&place=48201 ----------
  // defaults (president, margin, states, ec, regular seat) are left out of the link
  function writeHash() {
    const p = new URLSearchParams();
    if (state.office !== "president") p.set("race", state.office);
    p.set("year", state.year);
    if (state.mode !== "margin") p.set("view", state.mode);
    if (state.level !== "states") p.set("map", state.level);
    if (state.cmap !== "winner") p.set("color", state.cmap);
    if (state.arrows) p.set("arrows", "on");
    if (state.sel.type !== "nation") p.set("place", state.sel.id);
    if (state.seat !== "regular") p.set("seat", state.seat);
    history.replaceState(null, "", "#" + p.toString());
  }
  // early: read only the office and year, so their data can be loaded before the rest is checked
  function readHash(early = false) {
    const h = location.hash.slice(1);
    let y, m, id, lv, vt, race, seat, cm;
    if (h.includes("=")) {
      const p = new URLSearchParams(h);
      [y, m, id, lv, vt, race, seat, cm] = ["year", "view", "place", "map", "vote", "race", "seat", "color"].map(k => p.get(k));
      state.arrows = p.get("arrows") === "on";
    } else {
      [y, m, id] = h.split("/"); // older links: #2024/margin/48201
    }
    if (race === "live") { race = "senate"; y = y || String(LIVE_YEAR); }
    state.office = OFFICES.includes(race) ? race : "president";
    if (early) {
      if (+y) state.year = +y;
      return;
    }
    const ys = curYears();
    // no year in the link: the latest year that has this race
    state.year = ys.includes(+y) ? +y : [...ys].reverse().find(x => HAS[state.office](x) && x !== LIVE_YEAR) ?? ys[ys.length - 1];
    state.office = officeFor(state.year, state.office);
    const pres = state.office === "president";
    state.mode = pres && m === "shift" ? "shift" : "margin";
    if (!pres) state.arrows = false;
    state.level = lv === "counties" && state.office !== "house" ? "counties" : "states";
    // older links: vote=popular (the panel's Popular vote tab) also colored the map by margin
    state.cmap = cm === "margin" || vt === "popular" ? "margin" : "winner";
    state.seat = seat === "special" || seat === "governor" ? seat : "regular";
    state.round = null;
    if (id && id.length === 2 && data.states[id]) state.sel = { type: "state", id };
    else if (id && id.includes("-") && state.office === "house" && houseRaces(state.year)[id]) state.sel = { type: "district", id };
    else if (id && state.office !== "house" && data.counties[id]) state.sel = { type: "county", id };
    else state.sel = { type: "nation" };
  }

  // ---------- go ----------
  syncToggles();
  drawHeadline();
  drawYears();
  drawMap();
  select(state.sel, state.sel.type !== "nation");
})().catch(err => {
  console.error(err);
  document.getElementById("panel").innerHTML =
    `<p class="empty">The map data could not be loaded. Serve the web folder over HTTP (for example <code>python3 -m http.server</code>) instead of opening the file directly.</p>`;
});
