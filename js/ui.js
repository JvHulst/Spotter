// Rendering helpers shared by the views. Views return HTML strings; user input reaches the
// handlers registered in `actions` through data-action (clicks), data-change and data-input.

export const actions = {};

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const fmtKg = (kg) => (kg == null ? "–" : String(Math.round(kg * 100) / 100));
export const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function ago(date, now = new Date()) {
  const days = Math.round((now - date) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30.4)} months ago`;
}

/** Short form of the time since a date, such as "3 d", "5 wk" or "10 mo". */
export function since(date, now = new Date()) {
  const days = Math.round((now - date) / 86400000);
  if (days < 14) return `${Math.max(0, days)} d`;
  if (days < 60) return `${Math.round(days / 7)} wk`;
  return `${Math.round(days / 30.4)} mo`;
}

export const fmtDate =(d, opts = { weekday: "short", day: "numeric", month: "short" }) => d.toLocaleDateString(undefined, opts);
export const fmtClock = (s) => `${s < 0 ? "+" : ""}${Math.floor(Math.abs(s) / 60)}:${String(Math.floor(Math.abs(s) % 60)).padStart(2, "0")}`;

/** "68 kg × 8, 8, 7" when all sets share a weight, else "68×8, 64×9". */
export function setsText(sets) {
  if (!sets.length) return "";
  const same = sets.every((s) => s.kg === sets[0].kg);
  const body = same ? `${fmtKg(sets[0].kg)} kg × ${sets.map((s) => s.reps).join(", ")}` : sets.map((s) => `${fmtKg(s.kg)}×${s.reps}`).join(", ");
  const rirs = sets.map((s) => s.rir).filter((r) => r != null);
  return rirs.length ? `${body} @ RIR ${rirs.join("/")}` : body;
}

const MODE_LABEL = { up: "▲ Heavier", reps: "+ Reps", down: "▼ Lighter", return: "↺ After break", new: "New" };
export const modeBadge = (mode) => `<span class="badge mode-${mode}">${MODE_LABEL[mode]}</span>`;

const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
export const icon = {
  today: svg("M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12"),
  log: svg("M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"),
  library: svg("M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14zM6.5 17A2.5 2.5 0 0 0 4 19.5 2.5 2.5 0 0 0 6.5 22H20v-5"),
  muscles: svg("M22 12h-4l-3 9L9 3l-3 9H2"),
  settings: svg("M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"),
  check: svg("M20 6 9 17l-5-5"),
  swap: svg("m16 3 4 4-4 4M20 7H4M8 21l-4-4 4-4M4 17h16"),
  link: svg("M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"),
};

/**
 * An in-app dialog in place of confirm() and prompt(), which some embedded pages block.
 * Resolves to true or false, or with `text` given, to the entered text or null.
 */
export function ask(message, { ok = "OK", danger = false, text = null } = {}) {
  return new Promise((resolve) => {
    const bg = document.createElement("div");
    bg.className = "sheet-bg center";
    bg.innerHTML = `
      <div class="dialog" role="dialog" aria-modal="true">
        <p>${esc(message)}</p>
        ${text == null ? "" : `<textarea class="note" rows="3">${esc(text)}</textarea>`}
        <div class="row" style="justify-content:flex-end;margin-top:14px">
          <button class="btn small" data-answer="0">Cancel</button>
          <button class="btn small ${danger ? "danger" : "primary"}" data-answer="1">${esc(ok)}</button>
        </div>
      </div>`;
    bg.addEventListener("click", (event) => {
      const button = event.target.closest("[data-answer]");
      if (!button && event.target !== bg) return;
      event.stopPropagation();
      const yes = button?.dataset.answer === "1";
      bg.remove();
      resolve(text == null ? yes : yes ? bg.querySelector("textarea").value : null);
    });
    document.body.append(bg);
    bg.querySelector("textarea")?.focus();
  });
}

export function toast(message) {
  document.querySelector(".toast")?.remove();
  const el = Object.assign(document.createElement("div"), { className: "toast", textContent: message });
  document.body.append(el);
  setTimeout(() => el.remove(), 2600);
}
