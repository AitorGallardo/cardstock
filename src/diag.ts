// On-page error reporter — honest on-device instrumentation.
//
// A single mono line appears at the bottom of the screen ONLY when something
// actually throws (window.onerror / unhandledrejection). It shows the message
// plus the source file:line, and is tappable to dismiss. This turns a report
// from a phone we can't debug locally (e.g. Chrome on iOS / CriOS) into an
// exact diagnosis. It is instrumentation, not debug cruft — it stays silent
// unless the app breaks.

function basename(url: string): string {
  if (!url) return '';
  try {
    const u = url.split(/[?#]/)[0];
    const parts = u.split('/');
    return parts[parts.length - 1] || u;
  } catch {
    return url;
  }
}

let el: HTMLDivElement | null = null;

function ensureEl(): HTMLDivElement {
  if (el) return el;
  const node = document.createElement('div');
  node.className = 'diag-error';
  node.setAttribute('role', 'alert');
  node.title = 'tap to dismiss';
  node.addEventListener('click', () => {
    node.style.display = 'none';
  });
  (document.body || document.documentElement).appendChild(node);
  el = node;
  return node;
}

function show(msg: string): void {
  try {
    const node = ensureEl();
    node.textContent = `⚠ ${msg}`;
    node.style.display = 'block';
    // eslint-disable-next-line no-console
    console.error('[diag]', msg);
  } catch {
    /* if even the reporter fails, there's nothing left to do */
  }
}

let installed = false;

// Wire the global error hooks. Safe to call more than once.
export function installErrorReporter(): void {
  if (installed) return;
  installed = true;

  window.addEventListener('error', (e: ErrorEvent) => {
    const where = e.filename ? ` (${basename(e.filename)}:${e.lineno ?? 0})` : '';
    const message = e.message || (e.error && String(e.error)) || 'script error';
    show(`${message}${where}`);
  });

  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    const r: unknown = e.reason;
    let message = 'unhandled rejection';
    if (r) {
      const withMsg = r as { message?: string };
      message = withMsg.message || String(r);
    }
    show(message);
  });
}

// Let the app report a caught-but-fatal condition through the same channel.
export function reportError(err: unknown): void {
  const withMsg = err as { message?: string; stack?: string } | null;
  show(withMsg?.message || String(err));
}
