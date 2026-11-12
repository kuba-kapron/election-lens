// The state finder (type to narrow the list).
import { state } from "./state.js";
import { data } from "./data.js";
import { select } from "./actions.js";

// state finder: type to narrow the list (combobox)
export const tools = document.querySelector(".map-tools");
export const combo = document.createElement("div");
combo.className = "combo";
combo.innerHTML = `
  <input id="state-find" type="text" role="combobox" aria-expanded="false" aria-autocomplete="list"
    aria-controls="state-options" aria-label="Find a state" placeholder="Find a state" autocomplete="off" spellcheck="false">
  <ul id="state-options" role="listbox" aria-label="States" hidden></ul>`;
tools.append(combo);
export const finder = combo.querySelector("input");
export const listbox = combo.querySelector("ul");
export const stateList = Object.entries(data.states)
  .map(([id, s]) => ({ id, name: s.name, abbr: s.abbr }))
  .sort((a, b) => a.name.localeCompare(b.name));
export let matches = [], active = -1;

export function filterStates(q) {
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
export function renderOptions() {
  listbox.innerHTML = matches.length
    ? matches.map((s, i) => `<li role="option" id="opt-${s.id}" data-id="${s.id}" aria-selected="${i === active}">${s.name} <span class="abbr">${s.abbr}</span></li>`).join("")
    : `<li class="none" role="presentation">No state matches “${finder.value.replace(/[<&]/g, "")}”</li>`;
  finder.setAttribute("aria-activedescendant", active >= 0 && matches[active] ? `opt-${matches[active].id}` : "");
  listbox.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
}
export function openList() {
  matches = filterStates(finder.value);
  active = finder.value.trim() && matches.length ? 0 : -1;
  listbox.hidden = false;
  finder.setAttribute("aria-expanded", "true");
  renderOptions();
}
export function closeList() {
  listbox.hidden = true;
  finder.setAttribute("aria-expanded", "false");
  finder.removeAttribute("aria-activedescendant");
}
export function chooseState(id) {
  closeList();
  select({ type: "state", id }, true);
  finder.blur();
}
export function syncFinder() {
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
