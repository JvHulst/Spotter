// A burst of confetti over the screen, for a new estimated one-rep max on squat, bench press or
// deadlift. It draws on a canvas that ignores taps and removes itself after a few seconds.

const COLORS = ["#e8590c", "#2f6fe4", "#26883f", "#d93d42", "#f2c230", "#ffffff"];
const DURATION_MS = 3200;

export function confetti(count = 150) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const canvas = Object.assign(document.createElement("canvas"), { width: innerWidth, height: innerHeight });
  Object.assign(canvas.style, { position: "fixed", inset: 0, zIndex: 200, pointerEvents: "none" });
  document.body.append(canvas);
  const ctx = canvas.getContext("2d");
  const pieces = Array.from({ length: count }, () => ({
    x: innerWidth / 2, y: innerHeight * 0.35, vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 14 - 4,
    size: 5 + Math.random() * 6, color: COLORS[Math.floor(Math.random() * COLORS.length)],
    angle: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 0.4,
  }));
  const start = performance.now();
  const frame = (now) => {
    const age = now - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = Math.min(1, (DURATION_MS - age) / 800);
    for (const p of pieces) {
      p.vy += 0.35;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.angle += p.spin;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    if (age < DURATION_MS) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
