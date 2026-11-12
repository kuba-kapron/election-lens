// The light / dark switch.
import { readColors } from "./colors.js";
import { render } from "./actions.js";

// light / dark switch (starts from the system setting, then remembers the choice)
export const themeBtn = document.getElementById("theme");
export const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
export const SUN = `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3" fill="currentColor"/><g stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3 3l1.1 1.1M11.9 11.9L13 13M3 13l1.1-1.1M11.9 4.1L13 3"/></g></svg>`;
export const MOON = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 10.2A6 6 0 0 1 5.8 2.5a6 6 0 1 0 7.7 7.7z" fill="currentColor"/></svg>`;
export const currentTheme = () => document.documentElement.dataset.theme || (systemDark.matches ? "dark" : "light");
// one button that looks like the States / Counties control: sun = light, moon = dark; a click flips it
themeBtn.innerHTML = `<span class="thumb"></span><span class="seg sun">${SUN}</span><span class="seg moon">${MOON}</span>`;
export function drawThemeButton() {
  const dark = currentTheme() === "dark";
  themeBtn.setAttribute("aria-checked", String(dark));
  themeBtn.title = dark ? "Switch to light mode" : "Switch to dark mode";
}
export function refreshColors() { readColors(); render({ map: true, panel: true }); drawThemeButton(); }
themeBtn.addEventListener("click", () => {
  const next = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("theme", next); } catch (e) { /* private mode: still switches for this visit */ }
  refreshColors();
});
systemDark.addEventListener("change", refreshColors);
drawThemeButton();
