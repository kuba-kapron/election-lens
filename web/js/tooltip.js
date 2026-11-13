// The hover box over the map.
import { path, stateById } from "./us/data.js";
import { WIN_MARK, advancedMark, pct } from "./format.js";
import { counted, isCalled, raceLean, roundOf } from "./us/rules.js";
import { candFill } from "./colors.js";
import { leanLabel, liveStatus, partyTag } from "./components.js";
import { clickTarget, hoverPath, lastPointer, tip, wrap } from "./map.js";
import { view } from "./us/views/index.js";

// the hover box: the shape's outline when it picks a whole state, and what the view says about it
export function showTip(e, f) {
  const target = clickTarget(f);
  hoverPath.attr("d", target.type === "state" ? path(stateById.get(target.id)) : null);
  tip.innerHTML = view().tip(f, target);
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
export function liveTip(r) {
  if (!counted(r)) return `<span class="tip-note">${liveStatus(r)}</span>`;
  const rd = roundOf(r), winner = isCalled(r) ? 0 : -1;
  return `<span class="tip-rows">${tipRows(r.cands, rd.votes, rd.total, winner)}</span>${leanLabel(raceLean(r))}
    <span class="hint">${liveStatus(r)}${r.test ? " · TEST DATA" : ""}</span>`;
}
