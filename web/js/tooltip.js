// The hover box over the map.
import { country, view } from "./country.js";
import { clickTarget, hoverPath, lastPointer, tip, wrap } from "./map.js";

// the hover box: the outline of what a click would pick (when the country gives one), and what
// the view says about it
export function showTip(e, f) {
  const target = clickTarget(f);
  const outline = country.hoverShape?.(target);
  hoverPath.attr("d", outline ? country.path(outline) : null);
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

