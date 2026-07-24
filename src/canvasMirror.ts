// Experimental HTML-in-canvas render path.
//
// When Chrome's html-in-canvas API is present we re-parent the *live* card
// nodes into a <canvas layoutsubtree> and paint them every frame via the
// detected draw method. Because layoutsubtree children still participate in
// layout and hit-testing, the same delegated pointer code keeps working — so
// input flows through the DOM while pixels flow through the canvas.
//
// Every canvas call is wrapped: if the (still-moving) API signature is not what
// we expect and anything throws, we silently move the cards back to plain DOM
// and stay on the CSS-transform path. Nothing the visitor sees ever breaks.

import type { CanvasSupport } from './htmlCanvas';

export class CanvasMirror {
  active = false;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private method: 'drawElement' | 'drawElementImage' = 'drawElement';
  private cards: HTMLElement[] = [];

  constructor(
    private support: CanvasSupport,
    private scene: HTMLElement,
  ) {}

  tryEnable(cards: HTMLElement[]): boolean {
    if (!this.support.supported || !this.support.drawMethod) return false;
    try {
      this.method = this.support.drawMethod;
      const canvas = document.createElement('canvas');
      canvas.id = 'html-canvas';
      canvas.setAttribute('layoutsubtree', '');
      this.scene.insertBefore(canvas, this.scene.firstChild);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      this.canvas = canvas;
      this.ctx = ctx;
      this.resize();

      for (const c of cards) canvas.appendChild(c);
      this.cards = cards;

      if (this.support.layoutMethod && typeof (canvas as any).layoutSubtree === 'function') {
        for (const c of cards) (canvas as any).layoutSubtree(c);
      }

      // Probe the draw signature once. Throws here => bail to CSS.
      const probe = cards[0];
      if (probe) (ctx as any)[this.method](probe, 0, 0);

      this.active = true;
      return true;
    } catch {
      this.disable(cards);
      return false;
    }
  }

  // main.ts passes the top-left position for each card (translation handled by
  // the canvas draw offset; rotation/scale stay on the element transform).
  draw(positions: Map<HTMLElement, { x: number; y: number }>): void {
    if (!this.active || !this.ctx || !this.canvas) return;
    try {
      const ctx = this.ctx as any;
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      for (const c of this.cards) {
        const p = positions.get(c);
        ctx[this.method](c, p ? p.x : 0, p ? p.y : 0);
      }
    } catch {
      this.disable(this.cards);
    }
  }

  register(card: HTMLElement): void {
    if (!this.active || !this.canvas) return;
    try {
      this.canvas.appendChild(card);
      if (this.support.layoutMethod && typeof (this.canvas as any).layoutSubtree === 'function') {
        (this.canvas as any).layoutSubtree(card);
      }
    } catch {
      /* leave it in whatever parent it has */
    }
  }

  resize(): void {
    if (!this.canvas || !this.ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
    this.canvas.style.width = window.innerWidth + 'px';
    this.canvas.style.height = window.innerHeight + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  disable(cards: HTMLElement[]): void {
    this.active = false;
    try {
      for (const c of cards) this.scene.appendChild(c);
      this.canvas?.remove();
    } catch {
      /* nothing else to do */
    }
    this.canvas = null;
    this.ctx = null;
  }
}
