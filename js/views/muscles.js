// Recovery view: for each muscle, how long ago it was trained and its weekly working sets.

import { state } from "../state.js";
import { muscleStats } from "../history.js";
import { MUSCLES, MINOR_MUSCLES } from "../library.js";
import { esc, fmtKg, since } from "../ui.js";

/** Weekly working sets at which the meter is full. Growth rises with weekly sets per muscle,
 *  and 10 or more sets outperform fewer (Schoenfeld, Ogborn & Krieger 2017). */
export const WEEKLY_SETS_GUIDE = 10;

export function musclesView() {
  const stats = muscleStats(state.sessions, state.library, new Date());
  const tile = (m) => {
    const s = stats.get(m);
    const sets7 = s?.sets7 ?? 0;
    const status = !s ? ["", "Not trained"]
      : s.daysSince <= 1 ? ["fresh", "Recovering"]
      : s.daysSince <= 6 ? ["ready", "Ready"]
      : ["due", "Due"];
    return `
      <div class="muscle">
        <div class="head"><span class="name">${esc(m)}</span><span class="status ${status[0]}">${status[1]}</span></div>
        <div class="meter"><div style="width:${Math.min(100, (sets7 / WEEKLY_SETS_GUIDE) * 100)}%"></div></div>
        <div class="small num">${fmtKg(sets7)} ${sets7 === 1 ? "set" : "sets"} this week</div>
        <div class="small muted num">avg ${((s?.sets28 ?? 0) / 4).toFixed(1)}/wk${s ? ` · last ${s.daysSince === 0 ? "today" : `${since(s.last)} ago`}` : ""}</div>
      </div>`;
  };
  const body = `
    <p class="small muted" style="margin:4px 4px 0">Working sets in the last 7 days. Indirect work, such as the biceps in a row,
    counts half. The bar fills at ${WEEKLY_SETS_GUIDE} sets.</p>
    <div class="muscles">${[...MUSCLES, ...MINOR_MUSCLES].map(tile).join("")}</div>`;
  return { title: "Muscles", tab: "muscles", body };
}
