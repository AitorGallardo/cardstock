# cardstock

Live HTML cards as physical objects. You grab one, throw it, they bounce off
each other and the walls, stack, and settle with some weight — and the HTML
inside stays live the whole time. Links are clickable, hover states work, and
one card has a real input and button that do real things. It's not a video and
it's not a screenshot: it's actual DOM being physically simulated.

**Live:** https://aitorgallardo.github.io/cardstock/

## What it is

Seven cards float in a dark scene. Each one is a real HTML element — a small
bookmark/tweet-style card linking to something I've built. A 2D rigid-body
engine (matter-js) owns their positions; the DOM just follows. Because the
cards are real DOM the whole time, everything inside them keeps working while
they tumble around.

- Drag to grab (a spring pulls the card to your cursor).
- Throw it — inertia carries, it bounces, it collides.
- Double-tap a card to flip it; the back has a short note.
- `G`, or the HUD toggle, switches from gentle zero-g drift to gravity.
- The last card has a live input (renames the card as you type) and a button
  that spawns brand-new cards into the simulation, so you can watch DOM that
  didn't exist a second ago get thrown around.

## The two-engine bit (and being honest about it)

There are two ways to draw the cards, and the HUD tells you which one is
actually running.

1. **css transforms** — the default, and what ships today everywhere. The
   physics loop writes a `translate3d(...) rotateZ(...)` (plus a small
   velocity-based tilt and lift-scale) onto each real DOM card every frame.
   Input, layout, and hit-testing are all just the DOM doing what it already
   does. This is the path I've actually tuned; it runs at 60fps on desktop and
   touch.

2. **drawElement (html-in-canvas)** — progressive enhancement for Chrome's new
   [HTML-in-canvas API](https://developer.chrome.com/blog/html-in-canvas-origin-trial)
   (developer trial behind `chrome://flags/#canvas-draw-element` in Chrome 138+,
   origin trial from Chrome 148). When present, cardstock re-parents the live
   cards into a `<canvas layoutsubtree>` and paints them each frame via
   `ctx.drawElement()` / `drawElementImage()`. The card nodes still participate
   in layout and hit-testing as canvas children, so the exact same pointer code
   keeps working — pixels go through the canvas, input still goes through the
   DOM.

**What the new API actually buys you, honestly:** it lets you rasterize real,
live DOM into a canvas — something the platform has never allowed. What it does
*not* do today is deliver input events to the rasterized pixels; the spec routes
interactivity back through hit-testing on the canvas' laid-out children, and
you're expected to map coordinates yourself. It's also Chrome-only — no Firefox
or Safari signal — and the method name is still moving (`drawElement` vs
`drawElementImage`). So I treat the canvas path as a live *paint* layer over an
interactive DOM layer, feature-detect it defensively, wrap every canvas call,
and fall straight back to CSS transforms if anything is off. Nothing a visitor
touches ever depends on the flag being on. On a stock browser today, the HUD
reads `engine: css transforms` — that's the honest default, not a downgrade.

## Controls

| Action | What it does |
| --- | --- |
| drag | grab a card (spring-to-cursor) |
| release while moving | throw it, with inertia |
| double-tap / double-click | flip the card |
| `G` or HUD toggle | switch gentle drift ⇄ gravity |
| type in the live card | rename it in real time |
| the `spawn` button | add a fresh card to the sim |

On mobile the cards scale down to fit the viewport (their physics bodies scale
to match), re-laying out on orientation change; drag/throw and double-tap flip
are touch-first, and the HUD stays compact.

## Stack

- Vite + vanilla TypeScript (no framework)
- [matter-js](https://brm.io/matter-js/) for 2D rigid-body physics
- CSS `transform` for rendering; optional Chrome HTML-in-canvas path
- bun for install/dev/build

## Run it

```bash
bun install
bun run dev     # local dev server
bun run build   # type-check + production build to dist/
bun run preview # serve the build
```

## License

MIT — see [LICENSE](./LICENSE).
