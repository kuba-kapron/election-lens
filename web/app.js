/* Election Lens: county map of US presidential results, 2000-2024. */
(async function () {
  "use strict";

  const W = 975, H = 610;
  const [geo, data, photoList] = await Promise.all([
    d3.json("data/geo.json"),
    d3.json("data/results.json"),
    d3.json("img/candidates/photos.json").catch(() => []), // made by pipeline/build_photos.py
  ]);
  const photos = new Set(photoList);

  const years = data.years;
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
  // mode: margin | shift   level: counties | states   vote: popular | ec (national panel)
  const state = { year: 2024, mode: "margin", level: "states", vote: "ec", arrows: false, sel: { type: "nation" } };
  readHash();

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
  function stateOf(sel) { return sel.type === "county" ? sel.id.slice(0, 2) : sel.type === "state" ? sel.id : null; }
  function visibleShapes(y) {
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
    colors = { dem: ramp(dem), gop: ramp(gop), nodata: v("--nodata"), demSolid: dem, gopSolid: gop };
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
    for (const p of ["dem", "gop"]) {
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
    const on = state.mode === "shift" && state.arrows;
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
    const st = f.properties.st;
    const inState = stateOf(state.sel) === st;
    if (!inState || SINGLE.has(st)) return { type: "state", id: st };
    return { type: "county", id: f.properties.id };
  }

  function drawSelection() {
    const s = state.sel;
    const f = s.type === "county" ? shapeById.get(s.id) : s.type === "state" ? stateById.get(s.id) : null;
    selPath.attr("d", f ? path(f) : null);
    const st = stateOf(s);
    gCounties.selectAll("path.county")
      .classed("dim", d => !!st && d.properties.st !== st)
      // only counties a click would pick get a county outline on hover
      .classed("pickable", d => d.properties.st === st && !SINGLE.has(st));
    // States view: the chosen state opens up to show its counties
    gStates.style("display", state.level === "states" ? null : "none")
      .selectAll("path.state-fill")
      .style("display", d => (d.properties.st === st && !SINGLE.has(st) ? "none" : null))
      .classed("dim", d => !!st && d.properties.st !== st);
  }

  function showTip(e, f) {
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
      const rows = { dem: row(c.dem + " (D)", "dem", v[0]), gop: row(c.gop + " (R)", "gop", v[1]) };
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
    yearList.selectAll("li").data(years).join(enter => {
      const li = enter.append("li");
      li.append("button").attr("type", "button").on("click", (e, y) => setYear(y));
      return li;
    }).select("button")
      .attr("aria-current", y => String(y === state.year))
      .html(y => {
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
        return `<span class="yr">${y}</span><span class="who">${score} ${nm(order[0])} vs. ${nm(order[1])}</span>`;
      });
  }

  // ---------- panel ----------
  const panel = document.getElementById("panel");
  function drawPanel() {
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
          ? candRow(fullName(c.dem) + " (D)", v[0], v[2], colors.demSolid, won === "dem", c.dem)
          : candRow(fullName(c.gop) + " (R)", v[1], v[2], colors.gopSolid, won === "gop", c.gop)).join("")}
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
          ? evRow(fullName(c.dem) + " (D)", d, colors.demSolid, won === "dem", c.dem)
          : evRow(fullName(c.gop) + " (R)", r, colors.gopSolid, won === "gop", c.gop)).join("")}
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

  function candRow(label, votes, total, fill, winner = false, last = null) {
    const share = votes / total;
    const mark = winner ? ` <span class="won">${CHECK}<span class="sr">winner</span></span>` : "";
    return `<div class="cand-row${winner ? " is-winner" : ""}">${avatar(last, fill)}<div class="cand-main"><span class="name">${label}${mark}</span><span class="pct">${pct(share)}</span>
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
    state.sel = sel;
    if (zoomIt || sel.type === "nation") {
      const st = stateOf(sel);
      if (sel.type === "county") zoomTo(shapeById.get(sel.id), 0.3);
      else zoomTo(st ? stateById.get(st) : null);
    }
    syncFinder();
    document.getElementById("reset").hidden = sel.type === "nation";
    drawSelection();
    drawLegend();
    drawBadges();
    drawArrows();
    drawPanel();
    writeHash();
  }
  function setYear(y) {
    state.year = y;
    drawYears();
    drawMap();
    drawPanel();
    writeHash();
  }
  const arrowsBtn = document.getElementById("arrows");
  function syncToggles() {
    document.querySelectorAll("[data-mode]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.mode === state.mode)));
    document.querySelectorAll("[data-level]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.level === state.level)));
    arrowsBtn.hidden = state.mode !== "shift";
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

  document.querySelectorAll("[data-mode]").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));
  document.querySelectorAll("[data-level]").forEach(b => b.addEventListener("click", () => setLevel(b.dataset.level)));
  document.getElementById("reset").addEventListener("click", () => select({ type: "nation" }, true));
  document.addEventListener("keydown", e => {
    if (e.target.closest("select, input, textarea")) return;
    const i = years.indexOf(state.year);
    if (e.key === "ArrowRight" && i < years.length - 1) setYear(years[i + 1]);
    if (e.key === "ArrowLeft" && i > 0) setYear(years[i - 1]);
    if (e.key === "Escape") select({ type: "nation" }, true);
  });
  window.addEventListener("hashchange", () => {
    readHash();
    syncToggles();
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

  // ---------- shareable links: #year=2024&view=shift&map=counties&vote=popular&place=48201 ----------
  // defaults (margin, states, ec) are left out of the link
  function writeHash() {
    const p = new URLSearchParams({ year: state.year });
    if (state.mode !== "margin") p.set("view", state.mode);
    if (state.level !== "states") p.set("map", state.level);
    if (state.vote !== "ec") p.set("vote", state.vote);
    if (state.arrows) p.set("arrows", "on");
    if (state.sel.type !== "nation") p.set("place", state.sel.id);
    history.replaceState(null, "", "#" + p.toString());
  }
  function readHash() {
    const h = location.hash.slice(1);
    let y, m, id, lv, vt;
    if (h.includes("=")) {
      const p = new URLSearchParams(h);
      [y, m, id, lv, vt] = [p.get("year"), p.get("view"), p.get("place"), p.get("map"), p.get("vote")];
      state.arrows = p.get("arrows") === "on";
    } else {
      [y, m, id] = h.split("/"); // older links: #2024/margin/48201
    }
    if (years.includes(+y)) state.year = +y;
    state.mode = m === "shift" ? "shift" : "margin";
    state.level = lv === "counties" ? "counties" : "states";
    state.vote = vt === "popular" ? "popular" : "ec";
    if (id && id.length === 2 && data.states[id]) state.sel = { type: "state", id };
    else if (id && data.counties[id]) state.sel = { type: "county", id };
    else state.sel = { type: "nation" };
  }

  // ---------- go ----------
  syncToggles();
  drawYears();
  drawMap();
  select(state.sel, state.sel.type !== "nation");
})().catch(err => {
  console.error(err);
  document.getElementById("panel").innerHTML =
    `<p class="empty">The map data could not be loaded. Serve the web folder over HTTP (for example <code>python3 -m http.server</code>) instead of opening the file directly.</p>`;
});
