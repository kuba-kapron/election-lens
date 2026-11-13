// US rows for the Races and History cards: races, counties, tonight's status, History bars.
// tonight: who is shown (the called winner, else the leader) and the status column
import { t } from "../texts.js";
import { LIVE_YEAR, data } from "./data.js";
import { ARROW, CHECK, attr, markSpan } from "../format.js";
import { advancedOf, counted, countyLean, isCalled, isClosed, isLive, margin, raceLean, roundOf, runoffOf, signedMargin } from "./rules.js";
import { raceRow } from "../components.js";
import { leanLabel, liveStatus, mlabel, pctText, personCell, runoffText } from "./components.js";

export function liveRowParts(r) {
  const l = counted(r) ? raceLean(r) : null, called = isCalled(r), ro = runoffOf(r);
  // a runoff: both people, one per line (each shortens to fit, with the party), → in the status column
  const who = called ? personCell(r.cands[r.call.winner]) : ro ? ro.map(c => `<span class="who-line">${personCell(c)}</span>`).join("")
    : l ? personCell(r.cands[l.lead]) : `<span class="muted">${liveStatus(r)}</span>`;
  const status = called ? markSpan(CHECK, t("srWon"))
    : ro ? markSpan(ARROW, "runoff", attr(runoffText(r)))
    : l ? `<span class="muted">${pctText(r).replace(/ of .*| counted/, "")}</span>` : "";
  return { who, status, lean: l ? leanLabel(l) : "" };
}
// tonight: counted races first (in the chosen order), then closed polls with no votes yet,
// then open polls by closing time; within a closing time, A–Z
export const liveGroup = r => (counted(r) ? 0 : !r.polls_close || isClosed(r) ? 1 : 2);
export function raceItem(r, label, go, cur) {
  // past years: the shown round's leader (the winner, or at the November round of a race that
  // went to a runoff the leader then, with → in the status column)
  const pl = !isLive() && raceLean(r), adv = !isLive() && advancedOf(r), early = !!adv;
  const both = adv && [...adv.advanced].sort((a, b) => roundOf(r).votes[b] - roundOf(r).votes[a]).map(i => `<span class="who-line">${personCell(r.cands[i])}</span>`).join("");
  const live = isLive(), x = live ? liveRowParts(r) : { who: both || personCell(r.cands[pl?.lead ?? 0]),
    status: early ? markSpan(ARROW, "runoff", `Went to a ${r.rounds[r.rounds.length - 1].kind === "runoff" ? "runoff" : "ranked-choice count"}`) : "", lean: leanLabel(pl) };
  return { m: !live || counted(r) ? signedMargin(raceLean(r)) : null, group: live ? liveGroup(r) : 0, close: r.polls_close,
    html: raceRow(`${go}${cur ? ' aria-current="true"' : ""}`, label, x.who, x.status, x.lean) };
}
// one county of a race: its leader and margin; tonight also the share counted
export function countyItem(r, fips) {
  const n = r.cands.length, v = r.counties[fips], l = v && v[n + 1] ? countyLean(r, fips) : null, cp = r.county_pct?.[fips];
  const who = l ? personCell(r.cands[l.lead]) : `<span class="muted">${t("noVotesYet")}</span>`;
  const status = isLive() && l && cp != null ? `<span class="muted">${Math.round(cp)}%</span>` : "";
  return { m: l ? signedMargin(l) : null, group: l ? 0 : 1, fips,
    html: raceRow(`data-go="county:${fips}"`, countyLabel(fips), who, status, l ? leanLabel(l) : "") };
}
export const countyLabel = f => (data.counties[f]?.name ?? f).replace(/ (County|Parish)$/, "");
export const byName = (a, b) => (data.counties[a]?.name ?? a).localeCompare(data.counties[b]?.name ?? b);
// History card bars: a margin (up for Democrats), seats or electoral votes (the majority's count,
// up for Democrats, down for Republicans), the popular-vote margin
const signed = l => (l.caucus === "D" ? l.m : l.caucus === "R" ? -l.m : 0);
export const marginBar = l => ({ m: signed(l), text: mlabel(signed(l)) });
export const seatBar = (c, ctl, total) => ({ m: ctl === "R" ? -c.R / total : ctl === "D" ? c.D / total : 0, text: ctl === "R" ? `${c.R}` : `${c.D}` });
export const popBar = v => ({ m: margin(v), text: mlabel(margin(v)) });
// tonight's year is included: counted so far (won or leading), marked as such on hover
export const withLive = list => (isLive() ? [...list, LIVE_YEAR] : list);
