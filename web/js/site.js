// Which language and country the page shows, from its address (decided November 13, 2026):
// /en/usa/, later /pl/usa/, /en/poland/, /pl/poland/. Language first; country names in English
// in every language. One index.html serves them all (web/_redirects on Cloudflare,
// tools/serve.py locally); the settings after # stay as they were.
export const LANGS = ["en"];
// each country: its code (its code in web/js/<code>/, its data in web/data/<code>/, written by
// pipeline/<code>/)
export const COUNTRIES = { usa: { code: "us" } };

const [, lang, country] = location.pathname.split("/");
export const site = {
  lang: LANGS.includes(lang) ? lang : "en",
  country: Object.hasOwn(COUNTRIES, country) ? country : "usa",
};
site.code = COUNTRIES[site.country].code;
site.data = `/data/${site.code}`;
// any other address (/, /index.html, old links like /#year=2024&place=48) shows the page's own,
// keeping what follows it
const own = `/${site.lang}/${site.country}/`;
if (location.pathname !== own) history.replaceState(null, "", own + location.search + location.hash);
