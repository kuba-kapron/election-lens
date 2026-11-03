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
    if (d?.night) extra.live.night = d.night;
  }
  const liveFile = (o = state.office) => extra.live?.[liveOffice(o)];
  async function ensureData(office, year) {
    if (+year === LIVE_YEAR) {
      if (!liveFile(office)) await loadLive(office);
      if (office !== "house") return;
    }
    if (office === "senate" && !extra.senate) extra.senate = await d3.json("data/senate.json");
    if (office === "house" && !extra.house) extra.house = await d3.json("data/house.json");
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
  // vote: ec | popular (national panel; "ec" means seats for Senate and House)
  // seat: regular | special (Senate state with two races)   round: index of the election round shown, null = deciding
  const state = { office: "president", year: 2024, mode: "margin", level: "states", vote: "ec", arrows: false,
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
  // "by 13.7 points", or the vote count when the race is closer than 0.1 points
  function by(v) {
    const m = margin(v);
    return Math.abs(m) < 0.001 ? `by ${fmtInt(Math.abs(v[0] - v[1]))} votes` : `by ${Math.abs(m * 100).toFixed(1)} points`;
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
      grnSolid: v("--grn"), libSolid: v("--lib"), pending: v("--pending"),
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
  const categorical = () => state.vote === "ec" && state.level === "states" && state.mode === "margin";
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

  const zoom = d3.zoom().scaleExtent([1, 32]).translateExtent([[0, 0], [W, H]])
    .on("zoom", e => {
      g.attr("transform", e.transform);
      gArrows.style("--inv", 1 / e.transform.k);
    });
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
  const wrap = document.querySelector(".map-wrap");

  function drawMap() {
    const y = String(state.year);
    drawPatterns();
    gDistricts.style("display", state.office === "house" ? null : "none");
    gCounties.style("display", state.office === "house" ? "none" : null);
    if (state.office !== "president") return drawCongressMap();
    gCounties.selectAll("path.county")
      .data(visibleShapes(state.year), f => f.properties.id)
      .join(enter => enter.append("path").attr("class", "county").attr("d", path)
        .on("click", (e, f) => select(clickTarget(f), true))
        .on("mousemove", (e, f) => showTip(e, f))
        .on("mouseleave", () => { tip.hidden = true; hoverPath.attr("d", null); }))
      .attr("fill", f => color(value(f.properties.id, y)));
    gStates.selectAll("path.state-fill")
      .data(states, f => f.properties.st)
      .join(enter => enter.append("path").attr("class", "state-fill").attr("d", path)
        .on("click", (e, f) => select(clickTarget(f), true))
        .on("mousemove", (e, f) => showTip(e, f))
        .on("mouseleave", () => { tip.hidden = true; hoverPath.attr("d", null); }))
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
    const hint = target.type === "state" && !SINGLE.has(target.id) ? `<span class="hint">Click to see ${st.name}'s counties</span>` : "";
    tip.innerHTML = `<strong>${label}</strong>${body}${split}${flip}${hint}`;
    placeTip(e);
  }

  function placeTip(e) {
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
        const score = state.vote === "ec"
          ? order.map(p => ev[p]).join("–")
          : `<span class="mg ${m >= 0 ? "d" : "r"}">${mlabel(m)}</span>`;
        // winner only: nine years share the ribbon
        return `<span class="yr">${y}</span><span class="who" title="${c[order[0]]} vs. ${c[order[1]]}">${score} ${nm(order[0])}</span>`;
      });
  }

  // ---------- panel ----------
  const panel = document.getElementById("panel");
  function drawPanel() {
    if (state.office !== "president") return drawCongressPanel();
    const s = state.sel, y = String(state.year), c = data.candidates[y];
    const v = record(s, y);
    const st = stateOf(s);
    const where = s.type === "county" && !SINGLE.has(st) ? data.states[st].name
      : s.type === "nation" ? (state.vote === "ec" ? "Electoral votes won, 270 needed to win" : "Popular vote, all counties")
      : `Statewide, ${evOf(st, y)} electoral votes`;
    let html = `<h2>${name(s)}</h2><p class="where">${where}</p>`;
    if (s.type === "nation") {
      html += `<div class="mode vote-toggle" role="radiogroup" aria-label="National result">
        <button type="button" role="radio" aria-checked="${state.vote === "ec"}" data-vote="ec">Electoral College</button>
        <button type="button" role="radio" aria-checked="${state.vote === "popular"}" data-vote="popular">Popular vote</button></div>`;
    }

    if (s.type === "nation" && state.vote === "ec") {
      html += electoralBody(y, c, v);
    } else if (!v) {
      html += `<p class="empty">No ${y} results for this place. ${noDataReason(s, state.year)}</p>`;
    } else {
      const m = margin(v), sh = shift(s, y), p = prevYear(state.year);
      const won = wonBy(s, y, v);
      const popular = v[0] >= v[1] ? c.dem : c.gop;
      let summary = s.type === "nation"
        ? (c[won] === popular
          ? `${popular} won the election and the popular vote, ${by(v)}.`
          : `${c[won]} won the election in the Electoral College; ${popular} won the popular vote ${by(v)}.`)
        : `${popular} won ${by(v)}.`;
      if (sh != null) summary += ` The margin moved ${Math.abs(sh * 100).toFixed(1)} points toward ${sh >= 0 ? "Democrats" : "Republicans"} since ${p}.`;
      if (s.type === "state") {
        const [ed, er] = ec(y).states[st];
        if (ed && er) summary += ` ${data.states[st].name} splits its electoral votes by district: ${c.gop} ${er}, ${c.dem} ${ed}.`;
      }
      const other = v[2] - v[0] - v[1];
      html += `<div class="cand">
        ${(s.type === "nation" ? winnerFirst(y) : byCount(v[0], v[1])).map(p => p === "dem"
          ? candRow(fullName(c.dem) + partyTag("D"), v[0], v[2], colors.demSolid, won === "dem", c.dem)
          : candRow(fullName(c.gop) + partyTag("R"), v[1], v[2], colors.gopSolid, won === "gop", c.gop)).join("")}
        ${other > 0 ? candRow("Others", other, v[2], "var(--muted)") : ""}
      </div>
      <p class="summary">${summary} ${fmtInt(v[2])} votes cast.</p>`;
      const note = data.notes?.[`${s.id}-${y}`];
      if (note) html += `<p class="note">${note}</p>`;
    }

    const evChart = s.type === "nation" && state.vote === "ec";
    html += `<h3>${evChart ? "Electoral votes in every election" : "Margin in every election"}</h3>${historyChart(s, evChart)}`;

    const actions = [];
    if (s.type === "county" && st !== "02" && st !== "11") actions.push(`<button class="quiet" data-act="state">Show ${data.states[st].name}</button>`);
    if (s.type !== "nation") actions.push(`<button class="quiet" data-act="nation">Show whole country</button>`);
    if (actions.length) html += `<div class="actions">${actions.join("")}</div>`;
    panel.innerHTML = html;
    panel.querySelectorAll("button[data-act]").forEach(b => b.addEventListener("click", () => {
      if (b.dataset.act === "state") select({ type: "state", id: st }, true);
      else select({ type: "nation" }, true);
    }));
    panel.querySelectorAll("[data-year]").forEach(el => el.addEventListener("click", () => setYear(+el.dataset.year)));
    panel.querySelectorAll("[data-vote]").forEach(b => b.addEventListener("click", () => setVote(b.dataset.vote)));
  }

  // National result as the Electoral College counted it (electoral votes won from each state)
  function electoralBody(y, c, v) {
    const e = ec(y), [d, r] = e.won;
    const won = d > r ? "dem" : "gop", lost = won === "dem" ? "gop" : "dem";
    const tally = { dem: { states: 0, dc: false }, gop: { states: 0, dc: false } };
    const splits = [];
    for (const [st, [ed, er]] of Object.entries(e.states)) {
      const p = ed > er ? "dem" : "gop";
      if (st === "11") tally[p].dc = true; else tally[p].states++;
      if (ed && er) splits.push(`${data.states[st].name} gave ${Math.min(ed, er)} to ${ed < er ? c.dem : c.gop}`);
    }
    const carried = p => `${tally[p].states} states${tally[p].dc ? " and DC" : ""}`;
    let text = `${c[won]} won ${e.won[won === "dem" ? 0 : 1]} electoral votes to ${c[lost]}'s ${e.won[lost === "dem" ? 0 : 1]}, carrying ${carried(won)}. ${c[lost]} carried ${carried(lost)}.`;
    if (splits.length) text += ` Maine and Nebraska award some votes by district: ${splits.join("; ")}.`;
    const pop = v[0] >= v[1] ? "dem" : "gop";
    if (pop !== won) text += ` ${c[pop]} won the popular vote but lost the election.`;
    let cast = "";
    if (e.cast) cast = `<p class="note">When the electors met, the official count was ${c[won]} ${e.cast[won]}, ${c[lost]} ${e.cast[lost]}. ${e.cast.note}</p>`;
    return `<div class="cand">
        ${byCount(d, r).map(p => p === "dem"
          ? evRow(fullName(c.dem) + partyTag("D"), d, colors.demSolid, won === "dem", c.dem)
          : evRow(fullName(c.gop) + partyTag("R"), r, colors.gopSolid, won === "gop", c.gop)).join("")}
      </div>
      <p class="summary">${text}</p>${cast}`;
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

  function candRow(label, votes, total, fill, winner = false, last = null, pic = null) {
    const share = votes / total;
    const mark = winner ? ` <span class="won">${CHECK}<span class="sr">winner</span></span>` : "";
    return `<div class="cand-row${winner ? " is-winner" : ""}">${pic ?? avatar(last, fill)}<div class="cand-main"><span class="name">${label}${mark}</span><span class="pct">${pct(share)}</span>
      <div class="bar"><span style="width:${share * 100}%;background:${fill}"></span></div>
      <span class="votes">${fmtInt(votes)} votes</span></div></div>`;
  }

  function historyChart(s, electoralVotes = false) {
    const w = 300, h = 184, top = 18, bottom = 22;
    const vals = years.map(y => {
      if (!electoralVotes) return { y, m: margin(record(s, String(y))) };
      // bar = the winner's electoral votes, up for Democrats, down for Republicans
      const [d, r] = ec(y).won;
      return { y, m: (d > r ? d : -r) / 538, label: `${Math.max(d, r)}` };
    });
    const ms = vals.map(d => d.m ?? 0);
    let lo = Math.min(0, ...ms), hi = Math.max(0, ...ms);
    if (hi - lo < 0.1) { hi = Math.max(hi, 0.05); lo = Math.min(lo, -0.05); }
    // leave 16px above and below the bars for the value labels
    const sy = d3.scaleLinear().domain([lo, hi]).range([h - bottom - 16, top]);
    const mid = sy(0);
    const x = d3.scaleBand().domain(years).range([0, w]).padding(0.28);
    const bars = vals.map(d => {
      const cx = x(d.y), bw = x.bandwidth();
      const cur = d.y === state.year ? " cur" : "";
      const lab = `<text class="${cur}" x="${cx + bw / 2}" y="${h - 6}" text-anchor="middle">${d.y}</text>`;
      if (d.m == null) return `<g data-year="${d.y}" style="cursor:pointer">${lab}<text x="${cx + bw / 2}" y="${mid - 4}" text-anchor="middle">n/a</text></g>`;
      const y0 = sy(0), y1 = sy(d.m);
      const fill = d.m >= 0 ? colors.demSolid : colors.gopSolid;
      const vy = d.m >= 0 ? y1 - 5 : y1 + 13;
      const text = d.label ?? mlabel(d.m);
      return `<g data-year="${d.y}" style="cursor:pointer"><title>${d.y}: ${text}</title>
        <rect x="${cx}" y="${Math.min(y0, y1)}" width="${bw}" height="${Math.max(1, Math.abs(y1 - y0))}" fill="${fill}" opacity="${d.y === state.year ? 1 : 0.55}" rx="2"/>
        <text class="${cur}" x="${cx + bw / 2}" y="${vy}" text-anchor="middle">${text}</text>${lab}</g>`;
    }).join("");
    return `<svg class="history" viewBox="0 0 ${w} ${h}" role="img" aria-label="Margin by election year for ${name(s)}">
      <line class="zero" x1="0" x2="${w}" y1="${sy(0)}" y2="${sy(0)}"/>${bars}</svg>`;
  }

  // ---------- Senate and House ----------
  // Seats are colored by caucus: independents who caucus with the Democrats in Democratic blue,
  // other independents in their own color. Margin = winner's lead over the runner-up.
  const CAUCUS_KEY = { D: "dem", R: "gop" };
  const ckey = c => CAUCUS_KEY[c] || "ind";
  // a candidate's color in bars: Greens and Libertarians in their own colors, the rest by caucus
  const candFill = c => (c.party === "G" ? colors.grnSolid : c.party === "L" ? colors.libSolid : colors[ckey(c.caucus) + "Solid"]);
  const CAUCUS_NAME = { D: "Democrats", R: "Republicans", I: "Independents" };
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
  function districtName(id, short = false) {
    const n = +id.slice(3), st = data.states[id.slice(0, 2)].name;
    if (short) return n ? ordinal(n) : "At large";
    return n ? `${st}'s ${ordinal(n)} district` : `${st} at large`;
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
  const byText = l => (l.m < 0.001 ? `by ${fmtInt(l.gap)} votes` : `by ${(l.m * 100).toFixed(1)} points`);
  // solid winner color; stripes when a Senate seat changed party
  function seatFill(r) {
    const w = ckey(r.cands[0].caucus);
    return r.held && r.held !== r.cands[0].caucus ? `url(#flip-${w})` : colors[w + "Solid"];
  }
  const congressCategorical = () => !isLive() && state.vote === "ec" && state.sel.type === "nation" &&
    (state.office === "house" || state.level === "states");

  function drawCongressMap() {
    const handlers = sel => sel
      .on("click", (e, f) => select(clickTarget(f), true))
      .on("mousemove", (e, f) => showTip(e, f))
      .on("mouseleave", () => { tip.hidden = true; hoverPath.attr("d", null); });
    if (senLike()) {
      gCounties.selectAll("path.county")
        .data(visibleShapes(state.year), f => f.properties.id)
        .join(enter => handlers(enter.append("path").attr("class", "county").attr("d", path)))
        .attr("fill", f => {
          const r = senateRace(f.properties.st), l = countyLean(r, f.properties.id);
          // live: a county of a followed state with no votes yet is "not counted yet", not "no race"
          return isLive() && r && !l ? colors.pending : leanColor(l);
        });
      gStates.selectAll("path.state-fill")
        .data(states, f => f.properties.st)
        .join(enter => handlers(enter.append("path").attr("class", "state-fill").attr("d", path)))
        .attr("fill", f => {
          const r = senateRace(f.properties.st);
          if (isLive()) return liveFill(r);
          return !r ? colors.nodata : congressCategorical() ? seatFill(r) : leanColor(raceLean(r));
        });
    } else {
      const races = hRaces();
      gDistricts.selectAll("path.district")
        .data(extra.districts[state.year], f => f.properties.id)
        .join(enter => handlers(enter.append("path").attr("class", "district")))
        .attr("d", path) // district lines change from year to year
        .attr("fill", f => {
          const r = races[f.properties.id];
          if (isLive()) return liveFill(r);
          return !r ? colors.nodata : congressCategorical() ? colors[ckey(r.cands[0].caucus) + "Solid"] : leanColor(raceLean(r));
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
          const w = r.cands[0].caucus;
          if (r.held && r.held !== w) extraLine = `<span class="flip">${CAUCUS_NAME[w]} gained the seat</span>`;
          if (r.rounds.length > 1) extraLine += `<span class="hint">${roundOf(r).label}</span>`;
        }
        if (!SINGLE.has(st)) hint = `<span class="hint">Click to see ${sname}'s counties</span>`;
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
        } else {
          const ds = Object.entries(races).filter(([id]) => id.startsWith(st + "-"));
          const won = { D: 0, R: 0, I: 0 };
          const live = isLive(), shown = live ? ds.filter(([, r]) => counted(r)) : ds;
          shown.forEach(([, r]) => won[raceLean(r)?.caucus ?? r.cands[0].caucus]++);
          label = `${sname} <span class="ev">${ds.length} districts</span>`;
          body = live && !shown.length ? `<span class="tip-note">No votes counted yet</span>`
            : `<span class="tip-note">${live ? "Leading: " : ""}${["D", "R", "I"].filter(c => won[c]).map(c => `${CAUCUS_NAME[c]} ${won[c]}`).join(", ")}</span>`;
          hint = `<span class="hint">Click to see ${sname}'s districts</span>`;
        }
      } else {
        hoverPath.attr("d", null);
        const r = races[f.properties.id];
        label = districtName(f.properties.id);
        body = !r ? "No result" : isLive() ? liveTip(r) : raceTip(r, roundOf(r)?.votes, roundOf(r)?.total, raceLean(r), 0);
      }
    }
    tip.innerHTML = `<strong>${label}</strong>${body}${extraLine}${hint}`;
    placeTip(e);
  }

  function drawCongressLegend() {
    const el = document.getElementById("legend");
    if (isLive()) return drawLiveLegend(el);
    const sen = state.office === "senate";
    const shown = sen ? sYear() : Object.values(hRaces());
    const box = fill => `<svg class="sw" viewBox="0 0 26 10" aria-hidden="true"><rect width="26" height="10" fill="${fill}"/></svg>`;
    const key = (fill, text) => `<span class="key">${box(fill)}${text}</span>`;
    if (congressCategorical()) {
      const items = [key(colors.demSolid, "Democratic"), key(colors.gopSolid, "Republican")];
      if (shown.some(r => r.cands[0].caucus === "I")) items.push(key(colors.indSolid, "Independent"));
      if (sen) {
        const flips = new Set(shown.filter(r => r.held && r.held !== r.cands[0].caucus).map(r => r.cands[0].caucus));
        if (flips.has("D")) items.push(key("url(#flip-dem)", "Flipped to Democrats"));
        if (flips.has("R")) items.push(key("url(#flip-gop)", "Flipped to Republicans"));
        items.push(key(colors.nodata, "No race this year"));
      }
      el.innerHTML = items.join("");
      return;
    }
    const b = BINS.margin;
    const swatch = arr => arr.map(c => `<span style="background:${c}"></span>`).join("");
    let html = `<span>Republican +50</span><span class="ramp">${swatch([...colors.gop].reverse()) + swatch(colors.dem)}</span><span>Democratic +50</span>`;
    if (shown.some(r => r.cands.slice(0, 2).some(c => c.caucus === "I"))) html += `<span class="key"><span class="ramp">${swatch(colors.ind)}</span>Independent</span>`;
    html += `<span>Winner's lead over the runner-up; steps at ${b.map(x => x * 100).join(", ")} points</span>`;
    if (sen) html += key(colors.nodata, "No race or no county figures");
    el.innerHTML = html;
  }

  function senatePopular(y) {
    const t = [0, 0, 0];
    for (const r of sYear(y)) {
      if (!r.rounds.length) continue;
      const rd = r.rounds[0]; // November vote (first round)
      r.cands.forEach((c, i) => { if (c.party === "D") t[0] += rd.votes[i]; else if (c.party === "R") t[1] += rd.votes[i]; });
      t[2] += rd.total;
    }
    return t;
  }
  function congressYearLabel(y, office = state.office) {
    const sen = office === "senate";
    if (state.vote === "popular") {
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
  function initialsAvatar(c, fill) {
    const parts = c.name.replace(/[^A-Za-zÀ-ž\s-]/g, "").trim().split(/\s+/);
    const ini = ((parts[0] || "")[0] || "") + ((parts[parts.length - 1] || "")[0] || "");
    const img = congressPhotos.has(c.bio) ? `<img src="img/congress/${c.bio}.jpg" alt="" loading="lazy">`
      : peoplePhotos[c.photo] ? `<img src="img/people/${c.photo}.jpg" alt="" loading="lazy">` : "";
    return `<span class="avatar" style="background:${fill}" aria-hidden="true"><span class="ini">${ini.toUpperCase()}</span>${img}</span>`;
  }
  function personRow(c, votes, total, winner) {
    const fill = candFill(c);
    const mark = winner ? ` <span class="won">${CHECK}<span class="sr">winner</span></span>` : "";
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
      <span class="votes">${fmtInt(votes)} votes${factText}</span></div></div>`;
  }
  // candidates with at least 2% (and always the top two), then everyone else as "Others"
  function peopleRows(cands, votes, total, other, winner) {
    const order = votes.map((v, i) => i).sort((a, b) => votes[b] - votes[a]);
    const shown = order.filter((i, k) => k < 2 || (total && votes[i] / total >= 0.02));
    const rest = total - shown.reduce((a, i) => a + votes[i], 0);
    let html = shown.map(i => personRow(cands[i], votes[i], total, i === winner)).join("");
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
        <p class="summary">${r.cands[0].name} won unopposed.</p>${notesList(r.notes)}`;
    }
    const last = r.rounds.length - 1;
    const ri = state.round != null && state.round <= last ? state.round : last;
    const rd = r.rounds[ri], l = lean(r.cands, rd.votes, rd.total);
    let summary = ri === last
      ? `${r.cands[0].name} won ${byText(l)}.`
      : `${r.cands[l.lead].name} led ${byText(l)}; the seat was decided in the ${r.rounds[last].kind === "runoff" ? "runoff" : "final round"}.`;
    if (state.office === "senate" && r.held) {
      const w = r.cands[0].caucus;
      summary += r.held === w ? ` ${CAUCUS_NAME[w]} kept the seat.` : ` ${CAUCUS_NAME[w]} gained the seat from the ${CAUCUS_NAME[r.held]}.`;
    }
    return `${roundTabs(r, ri)}<div class="cand">${peopleRows(r.cands, rd.votes, rd.total, rd.other, 0)}</div>
      <p class="summary">${summary} ${fmtInt(rd.total)} votes.</p>
      <p class="note">${rd.label}.</p>${notesList(r.notes)}`;
  }
  function countyBody(r, fips) {
    const v = r.counties?.[fips];
    if (!v) return `<p class="empty">No county figures for this race.</p>${notesList(r.notes)}`;
    const n = r.cands.length, l = countyLean(r, fips), cr = r.rounds[r.county_round];
    let note = `County figures: ${cr.label}.`;
    if (r.county_round !== r.rounds.length - 1) note += ` The seat was decided in the ${roundOf(r).kind === "runoff" ? "runoff" : "ranked-choice count"}, which has no county figures.`;
    return `<div class="cand">${peopleRows(r.cands, v.slice(0, n), v[n + 1], v[n], l.lead)}</div>
      <p class="summary">${r.cands[l.lead].name} won the county ${byText(l)}. ${fmtInt(v[n + 1])} votes.</p>
      <p class="note">${note}</p>${notesList(r.notes)}`;
  }
  function seatRow(label, n, total, need, fill, winner, caucus) {
    const mark = winner ? ` <span class="won">${CHECK}<span class="sr">majority</span></span>` : "";
    return `<div class="cand-row${winner ? " is-winner" : ""}">${partyAvatar(caucus, fill)}<div class="cand-main"><span class="name">${label}${mark}</span><span class="pct">${n}</span>
      <div class="bar ev-bar" style="--need:${need / total}"><span style="width:${(n / total) * 100}%;background:${fill}"></span><i class="need" title="${need} for a majority"></i></div>
      <span class="votes">${n} of ${total} seats</span></div></div>`;
  }
  function seatRows(c, total, need) {
    const lead = c.R > c.D ? "R" : c.D > c.R ? "D" : null;
    return (lead === "R" ? ["R", "D"] : ["D", "R"]).map(p =>
      seatRow(CAUCUS_NAME[p], c[p], total, need, colors[ckey(p) + "Solid"], lead === p, p)).join("");
  }
  function senateSeatsBody(y) {
    const c = extra.senate.control[y], rs = sYear(y);
    const won = { D: 0, R: 0, I: 0 }, gained = { D: [], R: [], I: [] };
    for (const r of rs) {
      const w = r.cands[0].caucus;
      won[w]++;
      if (r.held && r.held !== w) gained[w].push(data.states[r.st].name + (r.seat === "special" ? " (special)" : ""));
    }
    const specials = rs.filter(r => r.seat === "special").length;
    const lead = c.R > c.D ? "R" : c.D > c.R ? "D" : null;
    let text = lead ? `After the ${y} election, ${CAUCUS_NAME[lead]} held ${Math.max(c.D, c.R)} seats to ${Math.min(c.D, c.R)}.`
      : `After the ${y} election, the Senate was split 50–50.`;
    text += ` ${rs.length} seats were up${specials ? `, ${specials} of them in special elections` : ""}: Democrats won ${won.D}, Republicans ${won.R}${won.I ? `, independents ${won.I}` : ""}.`;
    const list = a => (a.length > 1 ? a.slice(0, -1).join(", ") + " and " + a[a.length - 1] : a[0]);
    const g = ["D", "R"].filter(p => gained[p].length).map(p => `${CAUCUS_NAME[p]} gained ${list(gained[p])}.`);
    text += g.length ? ` ${g.join(" ")}` : " No seat changed party.";
    return `<div class="cand">${seatRows(c, 100, 51)}</div><p class="summary">${text}</p>
      <ul class="notes"><li>Counts independents with the party they caucus with. A majority needs 51 seats, or 50 and the vice president's tie-breaking vote.</li>${c.note ? `<li>${c.note}</li>` : ""}</ul>`;
  }
  function houseSeatsBody(y) {
    const c = extra.house.seats[y], races = Object.values(extra.house.races[y]);
    const lead = c.R > c.D ? "R" : "D";
    const unopposed = races.filter(r => r.unopposed).length;
    let text = `${CAUCUS_NAME[lead]} won ${c[lead]} of 435 seats, ${c[lead] - 217} more than the 218 needed for a majority.`;
    if (unopposed) text += ` ${unopposed} ${unopposed === 1 ? "race was" : "races were"} unopposed and not on the ballot.`;
    return `<div class="cand">${seatRows(c, 435, 218)}</div><p class="summary">${text}</p>`;
  }
  function popularBody(y) {
    const sen = state.office === "senate";
    const v = sen ? senatePopular(y) : extra.house.popular[y];
    const lead = v[0] >= v[1] ? "D" : "R", l = { m: Math.abs(margin(v)), gap: Math.abs(v[0] - v[1]) };
    const row = (p, n) => candRow(CAUCUS_NAME[p], n, v[2], colors[ckey(p) + "Solid"], p === lead, null, partyAvatar(p, colors[ckey(p) + "Solid"]));
    const caveat = sen
      ? "Adds up the November votes in this year's Senate races only: about a third of the states, and some races had no Democrat or no Republican. States with two races count twice."
      : "Adds up the votes in all 435 races. Unopposed races with no votes counted, and districts without a Democrat or a Republican, make it a rough measure of national support.";
    return `<div class="cand">${(lead === "D" ? [["D", v[0]], ["R", v[1]]] : [["R", v[1]], ["D", v[0]]]).map(([p, n]) => row(p, n)).join("")}
      ${v[2] - v[0] - v[1] > 0 ? candRow("Others", v[2] - v[0] - v[1], v[2], "var(--muted)") : ""}</div>
      <p class="summary">${lead === "D" ? "Democratic" : "Republican"} candidates received ${(l.m * 100).toFixed(1)} points more of the vote than ${lead === "D" ? "Republican" : "Democratic"} candidates. ${fmtInt(v[2])} votes.</p>
      <p class="note">${caveat}</p>`;
  }
  function senateHistory(st) {
    const items = [];
    for (const y of [...extra.senate.years].reverse()) { // newest first
      for (const r of senateRaces(st, y)) {
        const l = raceLean(r), w = r.cands[0];
        const cur = y === state.year && (stateOf(state.sel) !== st || r.seat === state.seat || senateRaces(st, y).length === 1);
        items.push(`<li><button type="button" data-year="${y}" data-seat="${r.seat}"${cur ? ' aria-current="true"' : ""}>
          <span class="what">${y}${r.seat === "special" ? " sp." : ""}</span><span class="who">${w.name}${partyTag(w)}</span>${leanLabel(l)}</button></li>`);
      }
    }
    return items.length
      ? `<h3>Senate races in ${data.states[st].name}, 2020–2024</h3><ul class="race-list">${items.join("")}</ul>`
      : `<h3>Senate races in ${data.states[st].name}</h3><p class="empty">No Senate race from 2020 to 2024.</p>`;
  }
  function houseStateBody(st) {
    const races = Object.entries(hRaces()).filter(([id]) => id.startsWith(st + "-")).sort();
    const won = { D: 0, R: 0, I: 0 };
    races.forEach(([, r]) => won[r.cands[0].caucus]++);
    const lead = won.D >= won.R ? "D" : "R", other = lead === "D" ? "R" : "D";
    let text = `${CAUCUS_NAME[lead]} won ${won[lead]} of ${races.length} seats` + (won[other] ? `, ${CAUCUS_NAME[other]} ${won[other]}.` : ".");
    const items = races.map(([id, r]) => `<li><button type="button" data-dist="${id}"><span class="what">${districtName(id, true)}</span>
      <span class="who">${r.cands[0].name}${partyTag(r.cands[0])}</span>${leanLabel(raceLean(r))}</button></li>`);
    return `<p class="summary">${text}</p><h3>Districts</h3><ul class="race-list">${items.join("")}</ul>`;
  }

  function drawCongressPanel() {
    if (isLive()) return drawLivePanel();
    const s = state.sel, y = String(state.year), sen = state.office === "senate", st = stateOf(s);
    const office = sen ? "Senate" : "House";
    let html;
    if (s.type === "nation") {
      html = `<h2>United States</h2><p class="where">${office}, ${y}</p>
        <div class="mode vote-toggle" role="radiogroup" aria-label="National result">
        <button type="button" role="radio" aria-checked="${state.vote === "ec"}" data-vote="ec">Seats</button>
        <button type="button" role="radio" aria-checked="${state.vote === "popular"}" data-vote="popular">Popular vote</button></div>`;
      html += state.vote === "ec" ? (sen ? senateSeatsBody(y) : houseSeatsBody(y)) : popularBody(y);
    } else if (sen) {
      const rs = senateRaces(st), r = senateRace(st);
      const kind = r && rs.length > 1 ? (r.seat === "special" ? ", special election" : ", regular election") : r && r.seat === "special" ? ", special election" : "";
      html = s.type === "state"
        ? `<h2>${data.states[st].name}</h2><p class="where">Senate, ${y}${kind}</p>`
        : `<h2>${data.counties[s.id]?.name ?? "Unknown"}</h2><p class="where">${data.states[st].name} · Senate, ${y}${kind}</p>`;
      if (rs.length > 1) {
        html += `<div class="mode tabs" role="radiogroup" aria-label="Race">${rs.map(x =>
          `<button type="button" role="radio" aria-checked="${x === r}" data-seat="${x.seat}">${x.seat === "special" ? "Special election" : "Regular election"}</button>`).join("")}</div>`;
      }
      if (!r) html += `<p class="empty">No Senate race in ${data.states[st].name} in ${y}.</p>`;
      else html += s.type === "state" ? raceBody(r) : countyBody(r, s.id);
      html += senateHistory(st);
    } else if (s.type === "district" || atLarge(st)) {
      const id = s.type === "district" ? s.id : `${st}-00`, r = hRaces()[id];
      html = `<h2>${districtName(id)}</h2><p class="where">House, ${y}</p>` + (r ? raceBody(r) : `<p class="empty">No result.</p>`);
    } else {
      const n = Object.keys(hRaces()).filter(id => id.startsWith(st + "-")).length;
      html = `<h2>${data.states[st].name}</h2><p class="where">House, ${y} · ${n} districts</p>` + houseStateBody(st);
    }
    const actions = [];
    if ((s.type === "county" && !SINGLE.has(st)) || (s.type === "district" && !atLarge(st))) actions.push(`<button class="quiet" data-act="state">Show ${data.states[st].name}</button>`);
    if (s.type !== "nation") actions.push(`<button class="quiet" data-act="nation">Show whole country</button>`);
    if (actions.length) html += `<div class="actions">${actions.join("")}</div>`;
    panel.innerHTML = html;

    panel.querySelectorAll("button[data-act]").forEach(b => b.addEventListener("click", () =>
      select(b.dataset.act === "state" ? { type: "state", id: st } : { type: "nation" }, true)));
    panel.querySelectorAll("[data-vote]").forEach(b => b.addEventListener("click", () => setVote(b.dataset.vote)));
    panel.querySelectorAll(".tabs [data-seat]").forEach(b => b.addEventListener("click", () => {
      state.seat = b.dataset.seat;
      state.round = null;
      drawMap();
      drawPanel();
      writeHash();
    }));
    panel.querySelectorAll("[data-round]").forEach(b => b.addEventListener("click", () => {
      state.round = +b.dataset.round;
      drawPanel();
    }));
    panel.querySelectorAll("[data-dist]").forEach(b => b.addEventListener("click", () => select({ type: "district", id: b.dataset.dist }, true)));
    panel.querySelectorAll(".race-list [data-year]").forEach(b => b.addEventListener("click", () => {
      state.seat = b.dataset.seat;
      setYear(+b.dataset.year);
    }));
  }

  // ---------- election night 2026 (live) ----------
  const clock = iso => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "");
  const isClosed = r => Date.now() >= Date.parse(r.polls_close);
  const counted = r => !!(r.rounds && r.rounds.length && r.rounds[0].total);
  function liveFill(r) {
    if (!r) return colors.nodata;
    if (r.call && r.call.winner != null) return colors[ckey(r.cands[r.call.winner].caucus) + "Solid"];
    if (!counted(r)) return colors.pending;
    return leanColor(raceLean(r));
  }
  const pctText = r => (r.pct == null ? "" : `${r.pct < 1 && r.pct > 0 ? "<1" : Math.round(r.pct)}% ${r.pct_of && r.pct_of.startsWith("precincts") ? "of precincts reporting" : r.pct_of && r.pct_of.startsWith("polling") ? "of polling places reporting" : "counted"}`);
  function liveStatus(r) {
    if (r.call && r.call.winner != null) return `Called for ${r.cands[r.call.winner].name} by ${r.call.by}`;
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
  function drawLiveLegend(el) {
    const b = BINS.margin;
    const swatch = arr => arr.map(c => `<span style="background:${c}"></span>`).join("");
    const box = fill => `<svg class="sw" viewBox="0 0 26 10" aria-hidden="true"><rect width="26" height="10" fill="${fill}"/></svg>`;
    el.innerHTML = `<span>Republican +50</span><span class="ramp">${swatch([...colors.gop].reverse()) + swatch(colors.dem)}</span><span>Democratic +50</span>
      <span>Leader's margin in the votes counted so far; steps at ${b.map(x => x * 100).join(", ")} points. Solid color once a race is called.</span>
      <span class="key">${box(colors.pending)}No votes counted yet</span><span class="key">${box(colors.nodata)}No race followed</span>`;
  }
  function liveYearLabel() {
    const night = extra.live?.night, called = night?.senate_calls || { D: 0, R: 0, I: 0 };
    const n = called.D + called.R + called.I;
    const upd = liveFile()?.updated || liveFile("senate")?.updated;
    const up = upd ? `updated ${clock(upd)}` : "live tonight";
    const on = !!night?.counting;
    const tag = `<span class="live-tag${on ? " on" : ""}" title="${on ? "Results are coming in" : "Live tonight: no votes counted yet"}"><span class="live-dot"></span>Live</span>`;
    return `<span class="yr">2026${tag}</span><span class="who">${n ? `Senate calls: <span class="mg d">${called.D}</span>–<span class="mg r">${called.R}</span>${called.I ? `–<span class="mg i">${called.I}</span>` : ""} · ` : ""}${up}</span>`;
  }
  function liveSource(r) {
    if (!r.source) return "";
    const s = r.source, name = s.url ? `<a href="${s.url}" target="_blank" rel="noopener">${s.name}</a>` : s.name;
    const kind = s.official ? "official results" : "unofficial";
    let t = `Source: ${name} (${kind})${s.fetched ? `, checked ${clock(s.fetched)}` : ""}.`;
    if (r.stale) t += ` <strong>Not refreshed for a while; numbers may be behind.</strong>`;
    return `<p class="note">${t}</p>`;
  }
  function livePrev(r) {
    const p = r.prev;
    if (!p) return r.office === "governor" ? "" : "";
    const order = p.cands.map((c, i) => i).sort((a, b) => p.cands[b].votes - p.cands[a].votes);
    const w = p.cands[order[0]], l = lean(p.cands, p.cands.map(c => c.votes), p.total);
    return `<h3>Last time for this seat</h3><ul class="race-list"><li><button type="button" data-prev-year="${p.year}" data-prev-seat="${p.seat}">
      <span class="what">${p.year}${p.seat === "special" ? " sp." : ""}</span><span class="who">${w.name}${partyTag(w)}</span>${leanLabel(l)}</button></li></ul>`;
  }
  function liveRaceBody(r, id = r.id) {
    let html = r.test ? `<p class="test-flag">Test data, not real results</p>` : "";
    if (!counted(r)) {
      html += `<div class="cand">${r.cands.map(c => personRow(c, 0, 0, false)).join("")}</div><p class="summary">${liveStatus(r)}.</p>`;
    } else {
      const rd = roundOf(r), l = raceLean(r), called = r.call && r.call.winner != null;
      html += `<div class="cand">${peopleRows(r.cands, rd.votes, rd.total, rd.other, called ? 0 : -1)}</div>`;
      const lead = r.cands[l.lead];
      const sum = called ? `${r.cands[0].name} won. Called by ${r.call.by} at ${clock(r.call.at)}.`
        : `${lead.name} leads ${byText(l)}.`;
      html += `<p class="summary">${sum} ${pctText(r) ? pctText(r) + "." : ""} ${fmtInt(rd.total)} votes counted.</p>`;
      html += `<div class="trail" data-trail="${id}"></div>`;
    }
    return html + liveSource(r) + livePrev(r);
  }
  function liveCountyBody(r, fips) {
    const v = r.counties?.[fips], n = r.cands.length;
    if (!v || !v[n + 1]) return `<p class="empty">No votes counted in this county yet.</p>${liveSource(r)}`;
    const l = countyLean(r, fips), cp = r.county_pct?.[fips];
    return `<div class="cand">${peopleRows(r.cands, v.slice(0, n), v[n + 1], v[n], -1)}</div>
      <p class="summary">${r.cands[l.lead].name} leads the county ${byText(l)}.${cp != null ? ` ${Math.round(cp)}% ${r.pct_of && r.pct_of.startsWith("precincts") ? "of precincts reporting" : "counted"}.` : ""} ${fmtInt(v[n + 1])} votes counted.</p>${liveSource(r)}`;
  }
  // Senate balance tonight: seats not up (won in 2022/2024, current holder) + called + leading
  function senateBalance() {
    const b = { D: { notUp: 0, called: 0, leading: 0 }, R: { notUp: 0, called: 0, leading: 0 }, I: { notUp: 0, called: 0, leading: 0 }, pending: 0 };
    for (const x of liveFile("senate")?.notUp?.seats || []) if (x.party) b[x.party].notUp++;
    for (const r of liveRaces("senate")) {
      if (r.call && r.call.winner != null) b[r.cands[r.call.winner].caucus].called++;
      else if (counted(r)) b[raceLean(r).caucus].leading++;
      else b.pending++;
    }
    return b;
  }
  function senateBalanceBody() {
    const notUp = liveFile("senate")?.notUp;
    if (!notUp) return "";
    const b = senateBalance();
    const tot = p => b[p].notUp + b[p].called + b[p].leading;
    const order = (tot("R") > tot("D") ? ["R", "D"] : ["D", "R"]).concat(tot("I") ? ["I"] : []);
    const row = p => {
      const solid = colors[ckey(p) + "Solid"], light = colors[ckey(p)][1], x = b[p], need = p === "R" ? 50 : p === "D" ? 51 : null;
      const seg = (n, c, t) => (n ? `<span style="width:${n}%;background:${c}" title="${t}: ${n}"></span>` : "");
      // independents who caucus with neither party (e.g. Dan Osborn) get their own row
      return `<div class="cand-row">${partyAvatar(p, solid)}<div class="cand-main"><span class="name">${CAUCUS_NAME[p]}</span><span class="pct">${tot(p)}</span>
        <div class="bar ev-bar stacked" style="--need:${(need || 0) / 100}">${seg(x.notUp + x.called, solid, "Not up or called")}${seg(x.leading, light, "Leading")}${need ? `<i class="need" title="${need} for control"></i>` : ""}</div>
        <span class="votes">${x.notUp} not up · ${x.called} won · ${x.leading} leading</span></div></div>`;
    };
    const before = notUp.before;
    const changed = (notUp.seats || []).filter(x => x.note);
    return `<div class="cand">${order.map(row).join("")}</div>
      <p class="summary">${b.pending ? `${b.pending} of 35 races have no votes counted yet. ` : ""}Before tonight: Republicans ${before.R}, Democrats ${before.D}${before.I ? `, others ${before.I}` : ""}.</p>
      <ul class="notes"><li>Control needs 51 seats, or 50 for Republicans, because the vice president (JD Vance) breaks ties. Light bars are leads in the votes counted so far, not wins; a race counts as won only once a news organization has called it.</li>
      <li>Seats not up: counted by who holds them now (current members of the Senate, congress-legislators), each matched to the race that filled it in 2022 or 2024.${changed.length ? " Changed since that race: " + changed.map(x => x.note).join(" ") : " All are held by the winner of that race."}</li></ul>
      <h3>Races tonight</h3>`;
  }
  function liveNationBody() {
    const rs = [...sYear()].sort((a, b) => Date.parse(a.polls_close) - Date.parse(b.polls_close) || data.states[a.st].name.localeCompare(data.states[b.st].name));
    if (!rs.length) return `<p class="empty">No results file yet. Start the importer: <code>uv run pipeline/live.py</code></p>`;
    const items = rs.map(r => {
      const l = counted(r) ? raceLean(r) : null;
      const who = r.call && r.call.winner != null ? `${r.cands[r.call.winner].name}${partyTag(r.cands[r.call.winner])} <span class="won">${CHECK}</span>`
        : l ? `${r.cands[l.lead].last}${partyTag(r.cands[l.lead])}` : `<span class="muted">${liveStatus(r)}</span>`;
      return `<li><button type="button" data-live-st="${r.st}" data-live-seat="${r.seat}"><span class="what">${data.states[r.st].abbr} ${r.seat === "governor" ? "Gov." : r.seat === "special" ? "Sen. sp." : "Sen."}</span>
        <span class="who">${who}${l && !(r.call && r.call.winner != null) ? ` <span class="muted">· ${pctText(r).replace(/ of .*| counted/, "")}</span>` : ""}</span>${l ? leanLabel(l) : ""}</button></li>`;
    });
    const test = rs.some(r => r.test) ? `<p class="test-flag">Test data, not real results</p>` : "";
    return `${test}${state.office === "senate" ? senateBalanceBody() : ""}<p class="summary">${liveFile()?.updated ? `Updated ${clock(liveFile().updated)}.` : ""} Races are listed by poll closing time. Nobody's call is made here: a race is marked won only when a news organization has called it, and the panel says who.</p>
      <ul class="race-list">${items.join("")}</ul>`;
  }
  // footer: name the official sources the live results come from right now
  function drawLiveSources() {
    const el = document.getElementById("live-sources");
    if (!el) return;
    const official = new Map();
    for (const r of liveRaces()) if (r.source && r.source.official) official.set(r.source.name, r.source.url);
    const list = [...official].sort((a, b) => a[0].localeCompare(b[0])).map(([n, u]) => (u ? `<a href="${u}">${n}</a>` : n));
    const joined = list.length > 1 ? list.slice(0, -1).join(", ") + " and " + list[list.length - 1] : list[0];
    el.innerHTML = `2026 results, live: ${list.length ? `official results from ${joined}; ` : ""}unofficial counts from <a href="https://civicapi.org/">civicAPI</a> where states do not publish live data or block scripts; entries typed in by hand name their source. Poll closing times: <a href="https://www.cbsnews.com/news/when-polls-open-close-2026-midterm-elections/">CBS News</a>.`;
  }
  function drawLivePanel() {
    drawLiveSources();
    if (state.office === "house") return drawLiveHousePanel();
    const s = state.sel, st = stateOf(s);
    let html;
    if (s.type === "nation") {
      html = `<h2>United States</h2><p class="where">Election night, 3 November 2026</p>` + liveNationBody();
    } else {
      const rs = senateRaces(st), r = senateRace(st);
      html = s.type === "state"
        ? `<h2>${data.states[st].name}</h2><p class="where">${r ? seatLabel(r) + ", 2026" : "2026"}</p>`
        : `<h2>${data.counties[s.id]?.name ?? "Unknown"}</h2><p class="where">${data.states[st].name} · ${r ? seatLabel(r) : ""}, 2026</p>`;
      if (rs.length > 1) {
        html += `<div class="mode tabs" role="radiogroup" aria-label="Race">${rs.map(x =>
          `<button type="button" role="radio" aria-checked="${x === r}" data-seat="${x.seat}">${seatLabel(x)}</button>`).join("")}</div>`;
      }
      if (!r) html += `<p class="empty">No race followed in ${data.states[st].name} tonight.</p>`;
      else html += s.type === "state" ? liveRaceBody(r) : liveCountyBody(r, s.id);
    }
    const actions = [];
    if (s.type === "county" && !SINGLE.has(st)) actions.push(`<button class="quiet" data-act="state">Show ${data.states[st].name}</button>`);
    if (s.type !== "nation") actions.push(`<button class="quiet" data-act="nation">Show whole country</button>`);
    if (actions.length) html += `<div class="actions">${actions.join("")}</div>`;
    panel.innerHTML = html;
    panel.querySelectorAll("button[data-act]").forEach(b => b.addEventListener("click", () =>
      select(b.dataset.act === "state" ? { type: "state", id: st } : { type: "nation" }, true)));
    panel.querySelectorAll(".tabs [data-seat]").forEach(b => b.addEventListener("click", () => {
      state.seat = b.dataset.seat;
      drawMap();
      drawPanel();
      writeHash();
    }));
    panel.querySelectorAll("[data-live-st]").forEach(b => b.addEventListener("click", () => {
      select({ type: "state", id: b.dataset.liveSt }, true);
      state.seat = b.dataset.liveSeat;
      drawMap();
      drawPanel();
      writeHash();
    }));
    panel.querySelectorAll("[data-prev-year]").forEach(b => b.addEventListener("click", () => {
      state.seat = b.dataset.prevSeat;
      setYear(+b.dataset.prevYear);
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
      const t = info.x.invert((ev.clientX - box.left) * k);
      const i = Math.max(0, d3.bisector(p => p.t).right(info.pts, +t) - 1), p = info.pts[i];
      const px = info.x(p.t), py = info.y(Math.max(-info.M, Math.min(info.M, p.m)));
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
  function trailChart(tr, id) {
    const race = Object.values(liveFile()?.races || {}).find(x => x.id === id) || liveFile()?.races?.[id];
    const last = tr.pts[tr.pts.length - 1], n = tr.cands.length;
    const vote = (p, i) => p[4 + i] || 0;
    // the two candidates ahead in the latest count: the line is the first one's lead over the second
    const [a, b] = d3.range(n).sort((i, j) => vote(last, j) - vote(last, i));
    if (b == null) return "";
    const person = name => race?.cands.find(c => c.name === name) || { name, party: "O", caucus: "I" };
    const ca = person(tr.cands[a]), cb = person(tr.cands[b]);
    const pts = tr.pts.map(p => ({ t: p[0] * 1000, m: p[2] ? 100 * (vote(p, a) - vote(p, b)) / p[2] : 0, src: p[3], total: p[2], pct: p[1] }));
    const w = 300, h = 150, left = 4, right = 34, top = 14, bottom = 20;
    const t1 = Math.max(pts[pts.length - 1].t, Math.min(Date.now(), pts[pts.length - 1].t + 6 * 3600e3));
    const x = d3.scaleTime().domain([pts[0].t, Math.max(t1, pts[0].t + 30 * 60e3)]).range([left, w - right]);
    // scale to the count once 5% of the latest total is in: the first few counties are often
    // lopsided and would flatten the rest of the night; earlier points run off the chart (clipped)
    const settled = pts.filter(p => p.total >= 0.05 * pts[pts.length - 1].total);
    const M = Math.max(2, Math.ceil(d3.max(settled.length ? settled : pts, p => Math.abs(p.m)) * 1.15));
    const y = d3.scaleLinear().domain([-M, M]).range([h - bottom, top]);
    // hold the last count until now (not into the future)
    const end = Math.min(Date.now(), +x.domain()[1]);
    const steps = end > pts[pts.length - 1].t ? pts.concat([{ ...pts[pts.length - 1], t: end }]) : pts;
    const line = d3.line().x(p => x(p.t)).y(p => y(p.m)).curve(d3.curveStepAfter)(steps);
    const area = d3.area().x(p => x(p.t)).y0(y(0)).y1(p => y(p.m)).curve(d3.curveStepAfter)(steps);
    const cid = `tc-${id}`.replace(/[^\w-]/g, "");
    const switches = pts.filter((p, i) => i && p.src !== pts[i - 1].src).map(p =>
      `<line class="src" x1="${x(p.t)}" x2="${x(p.t)}" y1="${top - 4}" y2="${h - bottom}"><title>From here: ${tr.srcs[p.src]}</title></line>`).join("");
    const ticks = x.ticks(4).map(t => `<text x="${x(t)}" y="${h - 5}" text-anchor="middle">${clock(t.toISOString())}</text>`).join("");
    trailInfo = { pts, x, y, M, w, ca, cb, srcs: tr.srcs };
    const last2 = (s, c) => `<tspan fill="${candFill(c)}" font-weight="700">${c.last || c.name}</tspan>${s}`;
    return `<h3>Through the night</h3>
      <svg class="history trail-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${ca.name}'s lead over ${cb.name} as the votes were counted">
        <defs><clipPath id="${cid}-up"><rect x="0" y="${top}" width="${w}" height="${y(0) - top}"/></clipPath>
          <clipPath id="${cid}-dn"><rect x="0" y="${y(0)}" width="${w}" height="${h - bottom - y(0)}"/></clipPath>
          <clipPath id="${cid}-in"><rect x="0" y="${top}" width="${w}" height="${h - bottom - top}"/></clipPath></defs>
        <path d="${area}" fill="${candFill(ca)}" opacity="0.18" clip-path="url(#${cid}-up)"/>
        <path d="${area}" fill="${candFill(cb)}" opacity="0.18" clip-path="url(#${cid}-dn)"/>
        <line class="zero" x1="${left}" x2="${w - right}" y1="${y(0)}" y2="${y(0)}"/>
        ${switches}
        <path d="${line}" fill="none" stroke="var(--ink)" stroke-width="1.6" clip-path="url(#${cid}-in)"/>
        <text x="${left}" y="${top - 3}">${last2(" ahead", ca)}</text>
        <text x="${left}" y="${h - bottom - 4}">${last2(" ahead", cb)}</text>
        <text x="${w - right + 4}" y="${y(M) + 8}">+${M}</text><text x="${w - right + 4}" y="${y(0) + 4}">0</text><text x="${w - right + 4}" y="${y(-M)}">+${M}</text>
        ${ticks}
        <g class="mark" visibility="hidden"><line y1="${top}" y2="${h - bottom}"/><circle r="3.5"/></g>
        <rect x="${left}" y="0" width="${w - left - right}" height="${h}" fill="transparent"/>
      </svg><div class="tip trail-tip" hidden></div>
      <p class="note">${ca.last || ca.name}'s lead over ${cb.last || cb.name}, in points of the votes counted so far, each time the source updated (your time zone).${switches ? " Dashed line: a change of source." : ""}${trails[liveOffice(state.office)]?.test ? " Test data." : ""}</p>`;
  }

  // ---------- live House: 435 races, leaders only (no calls) ----------
  function liveHouseTally(races) {
    const t = { D: 0, R: 0, I: 0, none: 0 };
    for (const r of races) { const l = counted(r) ? raceLean(r) : null; if (l) t[l.caucus]++; else t.none++; }
    return t;
  }
  function liveHouseNationBody() {
    const rs = Object.values(hRaces());
    if (!rs.length) return `<p class="empty">No House results yet. Start the importer: <code>uv run pipeline/live.py</code></p>`;
    const t = liveHouseTally(rs);
    const row = (p, n) => `<div class="cand-row">${partyAvatar(p, colors[ckey(p) + "Solid"])}<div class="cand-main"><span class="name">${CAUCUS_NAME[p]} leading</span><span class="pct">${n}</span>
      <div class="bar ev-bar" style="--need:${218 / 435}"><span style="width:${(n / 435) * 100}%;background:${colors[ckey(p) + "Solid"]}"></span><i class="need" title="218 for a majority"></i></div>
      <span class="votes">${n} of 435 districts</span></div></div>`;
    const test = rs.some(r => r.test) ? `<p class="test-flag">Test data, not real results</p>` : "";
    return `${test}<div class="cand">${row("D", t.D)}${row("R", t.R)}</div>
      <p class="summary">${t.none ? `${t.none} districts have no votes counted yet. ` : ""}${t.I ? `Other candidates lead in ${t.I}. ` : ""}A majority needs 218 seats.</p>
      <p class="note">Leading means ahead in the votes counted so far, not won. House races are not marked as called here. Counts: official state results where the state publishes them, else civicAPI (unofficial); each district names its source.</p>`;
  }
  function drawLiveHousePanel() {
    const s = state.sel, st = stateOf(s), races = hRaces();
    let html;
    if (s.type === "nation") {
      html = `<h2>United States</h2><p class="where">House, election night, 3 November 2026</p>` + liveHouseNationBody();
    } else if (s.type === "district" || atLarge(st)) {
      const id = s.type === "district" ? s.id : `${st}-00`, r = races[id];
      html = `<h2>${districtName(id)}</h2><p class="where">House, 2026</p>` + (r ? liveRaceBody(r, id) + notesList(r.notes) : `<p class="empty">No result.</p>`);
    } else {
      const ds = Object.entries(races).filter(([id]) => id.startsWith(st + "-")).sort();
      const t = liveHouseTally(ds.map(([, r]) => r));
      const items = ds.map(([id, r]) => {
        const l = counted(r) ? raceLean(r) : null;
        return `<li><button type="button" data-dist="${id}"><span class="what">${districtName(id, true)}</span>
          <span class="who">${l ? `${r.cands[l.lead].name}${partyTag(r.cands[l.lead])}` : `<span class="muted">${liveStatus(r)}</span>`}</span>${l ? leanLabel(l) : ""}</button></li>`;
      });
      const lead = ["D", "R", "I"].filter(c => t[c]).map(c => `${CAUCUS_NAME[c]} ${t[c]}`).join(", ");
      html = `<h2>${data.states[st].name}</h2><p class="where">House, 2026 · ${ds.length} districts</p>
        <p class="summary">${lead ? `Leading: ${lead}.` : "No votes counted yet."}</p>${notesList(ds[0]?.[1].notes)}
        <h3>Districts</h3><ul class="race-list">${items.join("")}</ul>`;
    }
    const actions = [];
    if (s.type === "district" && !atLarge(st)) actions.push(`<button class="quiet" data-act="state">Show ${data.states[st].name}</button>`);
    if (s.type !== "nation") actions.push(`<button class="quiet" data-act="nation">Show whole country</button>`);
    if (actions.length) html += `<div class="actions">${actions.join("")}</div>`;
    panel.innerHTML = html;
    panel.querySelectorAll("button[data-act]").forEach(b => b.addEventListener("click", () =>
      select(b.dataset.act === "state" ? { type: "state", id: st } : { type: "nation" }, true)));
    panel.querySelectorAll("[data-dist]").forEach(b => b.addEventListener("click", () => select({ type: "district", id: b.dataset.dist }, true)));
    panel.querySelectorAll("[data-prev-year]").forEach(b => b.addEventListener("click", () => setYear(+b.dataset.prevYear)));
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
  tools.insertBefore(combo, document.getElementById("reset"));
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
    document.getElementById("reset").hidden = sel.type === "nation";
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
    document.querySelectorAll("[data-mode]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.mode === state.mode)));
    document.querySelectorAll("[data-level]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.level === state.level)));
    // Senate and House show the margin only (no Shift yet); the House map is by district
    document.querySelector("[data-mode]").parentElement.hidden = !pres;
    document.getElementById("level-toggle").hidden = state.office === "house";
    arrowsBtn.hidden = !pres || state.mode !== "shift";
    // footer: only the sources of what is on screen (plus the lines every view needs)
    const view = isLive() ? "live" : state.office;
    const credits = document.getElementById("photo-credits");
    if (credits && !credits.dataset.filled) {
      const keys = Object.keys(peoplePhotos);
      credits.dataset.filled = "1";
      credits.innerHTML = keys.length ? "Candidate photos from Wikimedia Commons: " + keys.map(k => {
        const c = peoplePhotos[k];
        // link the license deed: Creative Commons asks for it
        const m = c.license.match(/^CC (BY(?:-SA)?) ([\d.]+)$/i);
        const lic = /^public domain$/i.test(c.license) ? "public domain"
          : m ? `<a href="https://creativecommons.org/licenses/${m[1].toLowerCase()}/${m[2]}/">${c.license}</a>`
          : /^CC0/i.test(c.license) ? `<a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</a>` : c.license;
        return `<a href="${c.page}">${c.name}</a> by ${c.author} (${lic})`;
      }).join("; ") + "." : "";
    }
    document.querySelectorAll(".colophon [data-src]").forEach(el => { el.hidden = !el.dataset.src.split(" ").includes(view); });
    arrowsBtn.setAttribute("aria-pressed", String(state.arrows));
  }
  arrowsBtn.addEventListener("click", () => {
    state.arrows = !state.arrows;
    syncToggles();
    drawArrows();
    writeHash();
  });
  function setMode(m) {
    state.mode = m;
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
  function setVote(v) {
    state.vote = v;
    drawMap();
    drawYears();
    drawPanel();
    writeHash();
  }
  function drawHeadline() {
    const h = document.getElementById("headline"), dek = document.getElementById("dek");
    if (state.office === "president") {
      h.innerHTML = `How America voted, <span class="nowrap">2000 to 2024</span>`;
      dek.textContent = "Every presidential election since 2000, from the Electoral College down to each county. Pick a year, click a state to see its counties, then click a county to see how it has voted over time.";
    } else if (state.office === "senate" && !isLive()) {
      h.innerHTML = `How America voted for the Senate, <span class="nowrap">2020 to 2024</span>`;
      dek.textContent = "Every Senate race from 2020 to 2024, statewide and by county. About a third of the seats are up in each election. Click a state to see its counties.";
    } else if (state.office === "house" && !isLive()) {
      h.innerHTML = `How America voted for the House, <span class="nowrap">2020 to 2024</span>`;
      dek.textContent = "All 435 House races in 2020, 2022 and 2024, by congressional district. Click a state to zoom in, then click a district.";
    } else {
      h.innerHTML = `Election night, <span class="nowrap">3 November 2026</span>`;
      dek.textContent = (state.office === "governor"
        ? "All 36 governor races as the votes are counted."
        : state.office === "house" ? "All 435 House races as the votes are counted, by district, on the 2026 maps (nine states redrew). Official state results where we read them (each district names its source), unofficial counts from civicAPI elsewhere; House races are shown as leading, not called."
        : "All 35 Senate races as the votes are counted; the 36 governor races are under Governor.")
        + (state.office === "house" ? "" : " Official state results where the state publishes them, otherwise unofficial counts, always labeled.")
        + " Updates every minute; times are in your time zone.";
    }
    document.title = state.office === "president" ? "Election Lens"
      : isLive() ? "Election night 2026 · Election Lens" : `${state.office === "senate" ? "Senate" : "House"} results · Election Lens`;
  }

  document.querySelectorAll("[data-office]").forEach(b => b.addEventListener("click", () => setOffice(b.dataset.office)));
  document.querySelectorAll("[data-mode]").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));
  document.querySelectorAll("[data-level]").forEach(b => b.addEventListener("click", () => setLevel(b.dataset.level)));
  document.getElementById("reset").addEventListener("click", () => select({ type: "nation" }, true));
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
    if (state.vote !== "ec") p.set("vote", state.vote);
    if (state.arrows) p.set("arrows", "on");
    if (state.sel.type !== "nation") p.set("place", state.sel.id);
    if (state.seat !== "regular") p.set("seat", state.seat);
    history.replaceState(null, "", "#" + p.toString());
  }
  // early: read only the office and year, so their data can be loaded before the rest is checked
  function readHash(early = false) {
    const h = location.hash.slice(1);
    let y, m, id, lv, vt, race, seat;
    if (h.includes("=")) {
      const p = new URLSearchParams(h);
      [y, m, id, lv, vt, race, seat] = ["year", "view", "place", "map", "vote", "race", "seat"].map(k => p.get(k));
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
    state.vote = vt === "popular" ? "popular" : "ec";
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
