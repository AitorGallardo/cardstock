// Feature detection for the HTML-in-canvas API (Chrome origin trial, 2025-2026).
//
// The API surface is still moving: depending on the Chrome build the draw call
// is either `drawElement` or `drawElementImage`, and layout is opted-in via the
// `layoutsubtree` attribute (with a possible `layoutSubtree()` method form). We
// detect defensively and never assume one exact shape.
//
// Honest note: even when the API is present, it is *view-only* today — the
// rasterised output does not receive input events; you have to forward pointer
// coordinates back to the source DOM yourself (the spec routes this through
// hit-testing on the canvas' laid-out children). So in cardstock the real,
// always-interactive layer is the DOM (CSS transforms). The canvas path, when
// available, is a live paint mirror of that same DOM — it proves the pixels can
// come through drawElement, while input keeps flowing through the DOM.

export type EngineKind = 'drawElement' | 'css-transforms';

export interface CanvasSupport {
  supported: boolean;
  drawMethod: 'drawElement' | 'drawElementImage' | null;
  layoutAttr: boolean;
  layoutMethod: boolean;
}

export function detectHtmlInCanvas(): CanvasSupport {
  const result: CanvasSupport = {
    supported: false,
    drawMethod: null,
    layoutAttr: false,
    layoutMethod: false,
  };

  try {
    const ctxProto = (window as any).CanvasRenderingContext2D?.prototype;
    const canvasProto = (window as any).HTMLCanvasElement?.prototype;
    if (!ctxProto || !canvasProto) return result;

    if ('drawElement' in ctxProto) result.drawMethod = 'drawElement';
    else if ('drawElementImage' in ctxProto) result.drawMethod = 'drawElementImage';

    // `layoutsubtree` reflects as a property/attribute on the canvas element.
    result.layoutAttr =
      'layoutsubtree' in canvasProto ||
      document.createElement('canvas').hasAttribute?.('layoutsubtree') === false; // attr is settable
    // Some builds expose an explicit layout method instead of the attribute.
    result.layoutMethod = typeof canvasProto.layoutSubtree === 'function';

    // We only claim support when we actually have a draw method — that is the
    // load-bearing part. The layout opt-in is applied best-effort at runtime.
    result.supported = result.drawMethod !== null;
  } catch {
    // Any surprise here means we simply fall back. Never throw to the caller.
    return result;
  }

  return result;
}

export function engineLabel(support: CanvasSupport): string {
  if (support.supported && support.drawMethod) {
    return `${support.drawMethod} (html-in-canvas)`;
  }
  return 'css transforms';
}
