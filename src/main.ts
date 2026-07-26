import './style.css';
import Matter from 'matter-js';
import { CARDS, buildCard } from './cards';
import { detectHtmlInCanvas, engineLabel } from './htmlCanvas';
import { CanvasMirror } from './canvasMirror';

const { Engine, Bodies, Body, Composite, Constraint, Common } = Matter;

// A phone is a narrow (portrait) OR short (landscape) viewport.
const PHONE_MQ = '(max-width: 560px), (max-height: 480px)';

// ------------------------------------------------------------------ setup ---
const scene = document.getElementById('scene') as HTMLElement;
const hud = document.getElementById('hud') as HTMLElement;
const engineLineEl = document.getElementById('engine-line') as HTMLElement;
const gravityToggle = document.getElementById('gravity-toggle') as HTMLButtonElement;

const support = detectHtmlInCanvas();
const mirror = new CanvasMirror(support, scene);

const engine = Engine.create();
engine.gravity.x = 0;
engine.gravity.y = 0; // start in gentle zero-g drift
engine.gravity.scale = 0.0011;

const world = engine.world;

// Each physical card we track.
interface Card {
  el: HTMLElement;
  body: Matter.Body;
  w: number;
  h: number;
  lift: number; // 0..1 eased "lifted" amount for scale/tilt
  grabbed: boolean;
}
const cards: Card[] = [];
const byBodyId = new Map<number, Card>();

// ------------------------------------------------------------------ walls ---
let walls: Matter.Body[] = [];
function buildWalls() {
  if (walls.length) Composite.remove(world, walls);
  const t = 200; // thick, sits just off-screen
  const w = window.innerWidth;
  const h = window.innerHeight;
  const opts = { isStatic: true, restitution: 0.6, friction: 0.05 };
  walls = [
    Bodies.rectangle(w / 2, -t / 2, w + t * 2, t, opts), // top
    Bodies.rectangle(w / 2, h + t / 2, w + t * 2, t, opts), // bottom
    Bodies.rectangle(-t / 2, h / 2, t, h + t * 2, opts), // left
    Bodies.rectangle(w + t / 2, h / 2, t, h + t * 2, opts), // right
  ];
  Composite.add(world, walls);
}
buildWalls();

// ------------------------------------------------------------------ cards ---
function spawnBody(el: HTMLElement, x: number, y: number, drift = true) {
  scene.appendChild(el);
  // Measure real rendered size.
  const rect = el.getBoundingClientRect();
  const w = rect.width || 244;
  const h = rect.height || 132;

  const body = Bodies.rectangle(x, y, w, h, {
    restitution: 0.55,
    friction: 0.08,
    frictionAir: 0.014,
    frictionStatic: 0.4,
    density: 0.0016,
    chamfer: { radius: 12 },
  });
  Body.setAngle(body, Common.random(-0.14, 0.14));
  if (drift) {
    Body.setVelocity(body, { x: Common.random(-1.6, 1.6), y: Common.random(-1.2, 1.2) });
    Body.setAngularVelocity(body, Common.random(-0.02, 0.02));
  }
  Composite.add(world, body);

  const card: Card = { el, body, w, h, lift: 0, grabbed: false };
  cards.push(card);
  byBodyId.set(body.id, card);
  mirror.register(el);
  broadcastCount();
  // Place it immediately so it's on-screen even before the first animation
  // frame (e.g. if the page loads in a background tab where rAF is paused).
  el.style.transform =
    `translate3d(${(x - w / 2).toFixed(2)}px, ${(y - h / 2).toFixed(2)}px, 0) ` +
    `rotateZ(${(body.angle * 180) / Math.PI}deg)`;
  return card;
}

// Choose a column count that keeps every card fully on-screen for the current
// viewport (2 on a phone, more as it gets wider / shorter in landscape).
function gridCols(): number {
  const w = window.innerWidth;
  if (w < 520) return 2;
  if (w < 1000) return 3;
  return 4;
}

// Build the seven content cards, then lay them out in a viewport-fitting grid.
function initCards() {
  CARDS.forEach((def) => {
    const el = buildCard(def, (spawned) => {
      // Spawn from a point near the live card, with a little pop.
      const from = cards.find((c) => c.el.dataset.cardId === 'live');
      const px = from ? from.body.position.x : window.innerWidth / 2;
      const py = from ? from.body.position.y - 90 : window.innerHeight / 2;
      const c = spawnBody(spawned, px, py, false);
      Body.setVelocity(c.body, { x: Common.random(-4, 4), y: -7 });
      Body.setAngularVelocity(c.body, Common.random(-0.05, 0.05));
    });
    // temporary spawn point; layoutCards() places them properly below
    spawnBody(el, window.innerWidth / 2, window.innerHeight / 2, false);
  });
  layoutCards();
}

// Distribute the initial cards across a grid sized to the viewport, so they
// always start fully visible (portrait AND short landscape).
function layoutCards() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const n = cards.length;
  const cols = gridCols();
  const rows = Math.max(1, Math.ceil(n / cols));
  const cellW = w / cols;
  const cellH = h / rows;
  cards.forEach((c, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    // clamp so even with jitter the whole card stays inside its cell / the view
    const jx = Math.min(cellW / 2 - c.w / 2, 16);
    const jy = Math.min(cellH / 2 - c.h / 2, 14);
    const x = cellW * col + cellW / 2 + (jx > 0 ? Common.random(-jx, jx) : 0);
    const y = cellH * row + cellH / 2 + (jy > 0 ? Common.random(-jy, jy) : 0);
    Body.setPosition(c.body, { x, y });
    Body.setVelocity(c.body, { x: Common.random(-1.3, 1.3), y: Common.random(-1, 1) });
    Body.setAngularVelocity(c.body, Common.random(-0.02, 0.02));
  });
}

let liveCard: HTMLElement | null = null;
function broadcastCount() {
  if (!liveCard) liveCard = scene.querySelector('[data-card-id="live"]');
  liveCard?.dispatchEvent(new CustomEvent('cardstock:count', { detail: cards.length }));
}

// --------------------------------------------------------------- dragging ---
let drag: {
  card: Card;
  constraint: Matter.Constraint;
  pointerId: number;
  startX: number;
  startY: number;
  active: boolean;
} | null = null;

const DRAG_THRESHOLD = 4;

scene.addEventListener('pointerdown', (e) => {
  if (drag) return;
  const el = (e.target as HTMLElement).closest('.card') as HTMLElement | null;
  if (!el) return;
  const card = cards.find((c) => c.el === el);
  if (!card) return;

  const constraint = Constraint.create({
    pointA: { x: e.clientX, y: e.clientY },
    bodyB: card.body,
    pointB: { x: e.clientX - card.body.position.x, y: e.clientY - card.body.position.y },
    stiffness: 0.09,
    damping: 0.14,
    length: 0,
  });

  drag = { card, constraint, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, active: false };
});

window.addEventListener(
  'pointermove',
  (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (!drag.active) {
      const moved = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
      if (moved < DRAG_THRESHOLD) return; // still could be a click/tap
      // Promote to a real drag.
      drag.active = true;
      drag.card.grabbed = true;
      drag.card.el.classList.add('lifted');
      Composite.add(world, drag.constraint);
      try {
        (scene as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* not all targets allow capture */
      }
    }
    drag.constraint.pointA = { x: e.clientX, y: e.clientY };
    e.preventDefault();
  },
  { passive: false },
);

// double-tap (touch) / double-click (mouse) flip detection, pointer-based so it
// works reliably on iOS where a native dblclick is flaky under user-scalable=no.
let lastTap = { t: 0, x: 0, y: 0, el: null as HTMLElement | null };

function endDrag(e: PointerEvent) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const wasDrag = drag.active;
  const card = drag.card;
  if (wasDrag) {
    Composite.remove(world, drag.constraint);
    card.grabbed = false;
    card.el.classList.remove('lifted');
    clampVelocity(card.body, 26);
  }
  drag = null;
  if (e.type === 'pointercancel' || wasDrag) return;

  // A clean tap (not a drag). Treat two quick taps on the same card as a flip.
  const t = e.target as HTMLElement;
  if (t.closest('a, button, input')) return; // don't flip while using controls/links
  const now = performance.now();
  const near = Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 28;
  if (lastTap.el === card.el && now - lastTap.t < 320 && near) {
    card.el.classList.toggle('flipped');
    lastTap = { t: 0, x: 0, y: 0, el: null }; // reset so a third tap starts fresh
  } else {
    lastTap = { t: now, x: e.clientX, y: e.clientY, el: card.el };
  }
}
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);

function clampVelocity(body: Matter.Body, max: number) {
  const v = body.velocity;
  const s = Math.hypot(v.x, v.y);
  if (s > max) Body.setVelocity(body, { x: (v.x / s) * max, y: (v.y / s) * max });
}

// (flip is handled by the pointer-based double-tap detector in endDrag above,
//  which works for both mouse double-click and touch double-tap)

// ---------------------------------------------------------------- gravity ---
let gravityOn = false;
function setGravity(on: boolean) {
  gravityOn = on;
  engine.gravity.y = on ? 1 : 0;
  hud.classList.toggle('gravity-on', on);
  const narrow = window.matchMedia(PHONE_MQ).matches;
  gravityToggle.textContent = on
    ? narrow
      ? 'gravity: on'
      : 'g gravity: on'
    : narrow
      ? 'gravity: off'
      : 'g toggles gravity';
  if (on) {
    // a small nudge so everything wakes up and falls
    for (const c of cards) Body.applyForce(c.body, c.body.position, { x: 0, y: 0.0006 * c.body.mass });
  }
}
gravityToggle.addEventListener('click', () => setGravity(!gravityOn));
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'g' && !isTyping(e)) setGravity(!gravityOn);
});
function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}

// ------------------------------------------------------------------ loop ----
const canvasMode = () => mirror.active;
const positions = new Map<HTMLElement, { x: number; y: number }>();

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(now - last, 1000 / 30); // clamp big gaps (tab switches)
  last = now;

  Engine.update(engine, dt);

  for (const card of cards) {
    // Ease the "lifted" amount for buttery scale/tilt.
    const target = card.grabbed ? 1 : 0;
    card.lift += (target - card.lift) * 0.18;

    const b = card.body;
    // Keep runaway bodies sane even without a grab.
    if (!card.grabbed) clampVelocity(b, 40);

    const angle = b.angle * (180 / Math.PI);
    const inCanvas = canvasMode();

    // Velocity-based tilt for a pseudo-3D feel (stronger while lifted).
    const tiltAmt = 0.35 + card.lift * 0.9;
    const tiltY = clamp(b.velocity.x * tiltAmt, -9, 9);
    const tiltX = clamp(-b.velocity.y * tiltAmt, -9, 9);
    const scale = 1 + card.lift * 0.045;

    const x = b.position.x - card.w / 2;
    const y = b.position.y - card.h / 2;

    if (inCanvas) {
      // Canvas draw handles translation; element keeps only rotation/scale.
      card.el.style.transform =
        `perspective(720px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) ` +
        `rotateZ(${angle}deg) scale(${scale.toFixed(4)})`;
      positions.set(card.el, { x, y });
    } else {
      card.el.style.transform =
        `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) ` +
        `perspective(720px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) ` +
        `rotateZ(${angle}deg) scale(${scale.toFixed(4)})`;
    }
  }

  if (canvasMode()) mirror.draw(positions);

  requestAnimationFrame(frame);
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ------------------------------------------------------------------ boot ----
initCards();

// Try the html-in-canvas path once cards exist. If it works, the HUD flips to
// the drawElement engine; otherwise we stay on css transforms. Either way the
// cards are already interactive.
mirror.tryEnable(cards.map((c) => c.el));
engineLineEl.textContent = mirror.active ? engineLabel(support) : 'css transforms';
if (support.supported && !mirror.active) {
  // API was present but the paint probe failed — be honest about it.
  engineLineEl.textContent = 'css transforms (drawElement present, mirror off)';
}

// When the viewport changes (e.g. an orientation flip crosses a CSS breakpoint),
// the card DOM is re-sized by media queries — so the matter-js bodies must be
// rescaled to keep tracking the real element box, then nudged back on-screen.
function resyncCardBodies() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  for (const c of cards) {
    // offsetWidth/Height give the untransformed CSS box (ignores the physics rotate/scale)
    const nw = c.el.offsetWidth || c.w;
    const nh = c.el.offsetHeight || c.h;
    if (Math.abs(nw - c.w) > 0.5 || Math.abs(nh - c.h) > 0.5) {
      Body.scale(c.body, nw / c.w, nh / c.h);
      c.w = nw;
      c.h = nh;
    }
    // keep the card inside the fresh viewport bounds
    const hw = c.w / 2;
    const hh = c.h / 2;
    const x = Math.max(hw, Math.min(w - hw, c.body.position.x));
    const y = Math.max(hh, Math.min(h - hh, c.body.position.y));
    if (x !== c.body.position.x || y !== c.body.position.y) Body.setPosition(c.body, { x, y });
  }
}

let wasPortrait = window.innerHeight >= window.innerWidth;
window.addEventListener('resize', () => {
  buildWalls();
  resyncCardBodies();
  // On an orientation flip the whole grid geometry changes, so redistribute the
  // cards to a fresh viewport-fitting layout instead of leaving them clamped in a pile.
  const portrait = window.innerHeight >= window.innerWidth;
  if (portrait !== wasPortrait) {
    wasPortrait = portrait;
    layoutCards();
  }
  mirror.resize();
});

// Shorten the HUD hint on narrow screens so it doesn't wrap awkwardly.
const hudHint = document.getElementById('hud-hint');
function applyHudHint() {
  if (!hudHint) return;
  hudHint.innerHTML = window.matchMedia(PHONE_MQ).matches
    ? 'drag · throw · 2-tap flips · '
    : 'drag&nbsp;·&nbsp;throw&nbsp;·&nbsp;double-tap flips&nbsp;·&nbsp;';
}
applyHudHint();
window.addEventListener('resize', applyHudHint);
setGravity(false); // normalise the toggle label for the current viewport width

requestAnimationFrame(frame);

// Expose a tiny bit for debugging in the console.
(window as any).cardstock = { engine, cards, support };
