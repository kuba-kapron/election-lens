// Number and text formatting, the winner and runoff marks (no page state).
import { t } from "./texts.js";

// numbers in the page's language: 1,234 and 45.3% in English
const num = d3.formatLocale({ thousands: t("thousands"), decimal: t("decimal"), grouping: [3], currency: ["", ""] });
export const fmtInt = num.format(",");
const dec = s => s.replace(".", t("decimal"));
export const pct = v => dec((v * 100).toFixed(1)) + "%";
export const ARROW = `<svg class="check" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9.5M8.8 4.3L12.5 8l-3.7 3.7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
export const CHECK = `<svg class="check" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
// the mark after a name or in a list's status column: ✓ for a winner, → for who advanced
export const markSpan = (icon, sr, title = "") => `<span class="won"${title ? ` title="${title}"` : ""}>${icon}<span class="sr">${sr}</span></span>`;
export const WIN_MARK = markSpan(CHECK, t("srWinner"));
export const advancedMark = to => markSpan(ARROW, `advanced to the ${to}`, `Advanced to the ${to}`);
// a margin in points to one decimal, never "-0.0": 0.04 -> "0.0"
export const points = pts => dec(pts < 0.05 ? "0.0" : pts.toFixed(1));
// which color step a margin falls in: 0 (closest) to bins.length (widest)
export const stepOf = (a, bins) => { const i = bins.findIndex(x => a < x); return i < 0 ? bins.length : i; };
export const attr = t => String(t).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
export const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
// AP style: a name ending in "s" takes only the apostrophe ("Texas' 13th district", "Ohio's")
export const possessive = name => (name.endsWith("s") ? `${name}'` : `${name}'s`);
// a row's words for the filter: place, names, without accents ("sanchez" finds Sánchez)
export const fold = t => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// election night 2026 (live)
export const clock = iso => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "");
