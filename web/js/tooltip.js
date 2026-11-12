// The hover box over the map.
import { state } from "./state.js";
import { data, path, stateById } from "./data.js";
import { WIN_MARK, advancedMark, pct, possessive } from "./format.js";
import { SINGLE, atLarge, byCount, counted, countyLean, ec, evOf, flippedFrom, hRaces, isCalled, isLive, margin, pastMark, prevYear, raceLean, record, roundOf, senLike, senateRace, senateRaces, shift, stateDistricts, wonBy } from "./rules.js";
import { candFill, categorical, colors } from "./colors.js";
import { CAUCUS_NAME, countyName, districtName, flipLine, leanLabel, liveStatus, mlabel, partyTag, seatLabel } from "./components.js";
import { clickTarget, hoverPath, lastPointer, tip, wrap } from "./map.js";

export function showTip(e, f) {
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
    const mark = p => (w === p ? WIN_MARK : "");
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
    : `${countyName(id)}, ${st.abbr}`;
  const from = target.type === "state" && categorical() ? flippedFrom(target.id, state.year) : null;
  const split = target.type === "state" && ec(state.year).states[target.id].every(n => n > 0)
    ? (() => { const [ed, er] = ec(state.year).states[target.id]; return `<span class="flip">Split: ${c.gop} ${er}, ${c.dem} ${ed} electoral votes</span>`; })()
    : "";
  const flip = from ? `<span class="flip">Flipped from ${from === "dem" ? "Democrats" : "Republicans"} since ${prevYear(state.year)}</span>` : "";
  const hint = target.type === "state" && !SINGLE.has(target.id) ? `<span class="hint">Click to see ${possessive(st.name)} counties</span>` : "";
  tip.innerHTML = `<strong>${label}</strong>${body}${split}${flip}${hint}`;
  placeTip(e);
}

export function placeTip(e) {
  if (lastPointer === "touch") tip.querySelectorAll(".hint").forEach(h => { h.textContent = h.textContent.replace(/^Click/, "Tap again"); });
  tip.hidden = false;
  const r = wrap.getBoundingClientRect();
  let x = e.clientX - r.left + 14, yy = e.clientY - r.top + 14;
  if (x + tip.offsetWidth > r.width) x = e.clientX - r.left - tip.offsetWidth - 14;
  tip.style.left = x + "px";
  tip.style.top = yy + "px";
}

export function tipRows(cands, votes, total, winner) {
  return votes.map((v, i) => i).sort((a, b) => votes[b] - votes[a]).slice(0, 2).map(i => {
    const adv = winner?.advanced, on = adv ? adv.has(i) : i === winner;
    const c = cands[i], share = total ? votes[i] / total : 0, w = on ? " is-winner" : "";
    const mark = !on ? "" : adv ? advancedMark(winner.to) : WIN_MARK;
    return `<span class="tip-name${w}">${c.last}${partyTag(c)}${mark}</span><span class="tip-pct${w}">${pct(share)}</span>
      <span class="tip-bar"><span style="width:${share * 100}%;background:${candFill(c)}"></span></span>`;
  }).join("");
}
export function raceTip(r, votes, total, l, winner) {
  if (!r.rounds.length) return `<span class="tip-note">${r.cands[0].name}${partyTag(r.cands[0])} won unopposed</span>`;
  return `<span class="tip-rows">${tipRows(r.cands, votes, total, winner)}</span>${leanLabel(l)}`;
}
export function showCongressTip(e, f) {
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
        body = raceTip(r, roundOf(r).votes, roundOf(r).total, raceLean(r), pastMark(r));
        extraLine = flipLine(r);
        if (r.rounds.length > 1) extraLine += `<span class="hint">${roundOf(r).label}</span>`;
      }
      if (!SINGLE.has(st)) hint = `<span class="hint">Click to see ${possessive(sname)} counties</span>`;
    } else {
      hoverPath.attr("d", null);
      label = `${countyName(f.properties.id)}, ${data.states[st].abbr}`;
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
        body = isLive() ? liveTip(r) : raceTip(r, roundOf(r)?.votes, roundOf(r)?.total, raceLean(r), pastMark(r));
        if (!isLive()) extraLine = flipLine(r);
      } else {
        const ds = stateDistricts(races, st);
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
      body = !r ? "No result" : isLive() ? liveTip(r) : raceTip(r, roundOf(r)?.votes, roundOf(r)?.total, raceLean(r), pastMark(r));
      if (r && !isLive()) extraLine = flipLine(r);
    }
  }
  tip.innerHTML = `<strong>${label}</strong>${body}${extraLine}${hint}`;
  placeTip(e);
}
export function liveTip(r) {
  if (!counted(r)) return `<span class="tip-note">${liveStatus(r)}</span>`;
  const rd = roundOf(r), winner = isCalled(r) ? 0 : -1;
  return `<span class="tip-rows">${tipRows(r.cands, rd.votes, rd.total, winner)}</span>${leanLabel(raceLean(r))}
    <span class="hint">${liveStatus(r)}${r.test ? " · TEST DATA" : ""}</span>`;
}
