// Drag to reorder. A grip button with data-drag="<item selector>" starts a drag of the item that
// contains it. The items are siblings in one container. While dragging, the container has the
// class "reordering" (the stylesheet collapses the items to one line each) and the item has the
// class "dragging". The item follows the pointer by moving in the document, and a drop reports
// the old and new index among the items.

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
  const home = item.nextSibling;
  const items = () => [...box.children].filter((x) => x.matches(selector));
  const from = items().indexOf(item);
  let y = event.clientY;
  let live = true;

  event.preventDefault();
  box.classList.add("reordering");
  item.classList.add("dragging");
  // Collapsing the items moved the grip; bring the item back under the pointer.
  const r = item.getBoundingClientRect();
  window.scrollBy(0, r.top + r.height / 2 - y);

  const place = () => {
    const others = items().filter((x) => x !== item);
    const before = others.find((x) => y < x.getBoundingClientRect().top + x.offsetHeight / 2);
    if (before) box.insertBefore(item, before);
    else others.at(-1)?.after(item);
  };
  const frame = () => {
    if (!live) return;
    if (y < EDGE) window.scrollBy(0, -SPEED);
    else if (y > window.innerHeight - EDGE) window.scrollBy(0, SPEED);
    place();
    requestAnimationFrame(frame);
  };
  const move = (e) => { y = e.clientY; };
  const end = (e) => {
    live = false;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    box.classList.remove("reordering");
    item.classList.remove("dragging");
    if (e.type === "pointercancel") box.insertBefore(item, home);
    else onDrop(from, items().indexOf(item));
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
  requestAnimationFrame(frame);
}
