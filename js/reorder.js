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
