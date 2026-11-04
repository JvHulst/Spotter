// The favorite star (see favorites in program.js). An exercise's own page has a star that toggles
// it as a favorite, filled for a favorite and hollow otherwise; everywhere else a favorite has a
// filled star next to its name and other exercises have none.

import { favorites, toggleFavorite } from "../program.js";
import { actions } from "../ui.js";

/** The star of exercise id that stars or unstars it when tapped. */
export function star(id) {
  const on = favorites().includes(id);
  return `<span class="star toggle ${on ? "on" : ""}" role="button" tabindex="0" aria-pressed="${on}" aria-label="Favorite"
    data-action="favorite" data-id="${id}">${on ? "★" : "☆"}</span>`;
}

/** A filled star when exercise id is a favorite, else nothing. */
export const starMark = (id) => (favorites().includes(id) ? `<span class="star" aria-label="Favorite">★</span>` : "");

actions.favorite = ({ id }) => toggleFavorite(id);
