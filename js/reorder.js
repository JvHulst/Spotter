// Drag to reorder. A grip button with data-drag="<item selector>" starts a drag of the item that
// contains it. The items are siblings in one container. While dragging, the container has the
// class "reordering" (the stylesheet collapses the items to one line each), and the item has the
// class "dragging": it is lifted out of the list and follows the pointer, while a gap of its size
// shows where it will land. A drop reports the old and new index among the items.

const EDGE = 80;
const SPEED = 14;

/** Move the element at index `from` of list to index `to`. */
export function moveItem(list, from, to) {
  list.splice(to, 0, ...list.splice(from, 1));
}

// Superset links in a list of exercises: an item with `superset` set pairs with the next item.
// A superset is a pair, so an item takes part in at most one link.

/** Link item i with the next item as a superset, or unlink it. Links touching either item are
 *  removed first. */
export function toggleLink(list, i) {
  const on = !list[i].superset && Boolean(list[i + 1]);
  if (on) {
    if (list[i - 1]) list[i - 1].superset = false;
    list[i + 1].superset = false;
  }
  list[i].superset = on;
}

/** Move an item as moveItem does. Swapping the two exercises of a superset keeps them linked;
 *  any other move removes the links that it would split or tangle. */
export function moveLinked(list, from, to) {
  if (from === to) return;
  const first = Math.min(from, to);
  if (Math.abs(from - to) === 1 && list[first].superset) {
    moveItem(list, from, to);
    list[first].superset = true;
    list[first + 1].superset = false;
    return;
  }
  if (list[from - 1]?.superset) list[from - 1].superset = false;
  list[from].superset = false;
  moveItem(list, from, to);
  if (list[to - 1]) list[to - 1].superset = false;
}

/** Remove item i, together with the link of the item before it. */
export function removeLinked(list, i) {
  if (list[i - 1]?.superset) list[i - 1].superset = false;
  list.splice(i, 1);
}

/**
 * Start dragging the item of grip. onDrop(from, to) runs once the pointer is released, also when
 * the item ended where it began. A cancelled gesture puts the item back and reports nothing.
 */
export function beginReorder(event, grip, onDrop) {
  const selector = grip.dataset.drag;
  const item = grip.closest(selector);
  const box = item.parentElement;
  const items = () => [...box.children].filter((x) => x.matches(selector));
  const from = items().indexOf(item);
  let y = event.clientY;
  let live = true;

  event.preventDefault();
  box.classList.add("reordering");
  // Collapsing the items moved the grip; scroll the item back under the pointer, and where the
  // page is too short for that, hold it centered under the pointer.
  let r = item.getBoundingClientRect();
  window.scrollBy(0, r.top + r.height / 2 - y);
  r = item.getBoundingClientRect();
  const offset = y >= r.top && y <= r.bottom ? y - r.top : r.height / 2;
  const style = getComputedStyle(item);
  const gap = document.createElement("div");
  gap.className = "drop-gap";
  Object.assign(gap.style, { height: `${r.height}px`, marginTop: style.marginTop, marginBottom: style.marginBottom });
  item.before(gap);
  item.classList.add("dragging");
  Object.assign(item.style, { position: "fixed", left: `${r.left}px`, top: `${y - offset}px`, width: `${r.width}px`, margin: "0" });

  // The gap goes before the first other item whose middle lies below the pointer, else after the last.
  const place = () => {
    const others = items().filter((x) => x !== item);
    const before = others.find((x) => y < x.getBoundingClientRect().top + x.offsetHeight / 2);
    if (before) {
      if (gap.nextElementSibling !== before) box.insertBefore(gap, before);
    } else if (others.length && others.at(-1).nextElementSibling !== gap) {
      others.at(-1).after(gap);
    }
  };
  const frame = () => {
    if (!live) return;
    if (y < EDGE) window.scrollBy(0, -SPEED);
    else if (y > window.innerHeight - EDGE) window.scrollBy(0, SPEED);
    item.style.top = `${y - offset}px`;
    place();
    requestAnimationFrame(frame);
  };
  const move = (e) => { y = e.clientY; };
  const end = (e) => {
    live = false;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    for (const key of ["position", "left", "top", "width", "margin"]) item.style.removeProperty(key);
    item.classList.remove("dragging");
    if (e.type === "pointercancel") gap.remove();
    else gap.replaceWith(item);
    box.classList.remove("reordering");
    if (e.type !== "pointercancel") onDrop(from, items().indexOf(item));
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
  requestAnimationFrame(frame);
}
