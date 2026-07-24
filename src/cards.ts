// The cards. Real content — this doubles as a link hub.

export interface CardDef {
  id: string;
  mono: string;
  title: string;
  line: string;
  href?: string;
  linkLabel?: string;
  note: string; // shown on the flipped back face
  live?: boolean; // the interactive proof-of-DOM card
}

export const CARDS: CardDef[] = [
  {
    id: 'xsaved',
    mono: 'XS',
    title: 'XSaved',
    line: 'A real bookmark manager for X. Search, tag, and actually find your saves.',
    href: 'https://xsaved.com',
    linkLabel: 'xsaved.com',
    note: 'The one I actually ship. Turns the black hole of X bookmarks into something searchable.',
  },
  {
    id: 'tabknight',
    mono: 'TK',
    title: 'TabKnight',
    line: 'Tab hoarder rehab. A browser extension that tames the sprawl.',
    href: 'https://github.com/AitorGallardo/tabknight',
    linkLabel: 'github.com/AitorGallardo/tabknight',
    note: 'Session and tab manager. Built it because I had 200 tabs open and no plan.',
  },
  {
    id: 'typefall',
    mono: 'tf',
    title: 'typefall',
    line: 'A typing toy where the words fall. Small, fast, a little addictive.',
    href: 'https://aitorgallardo.github.io/typefall/',
    linkLabel: 'aitorgallardo.github.io/typefall',
    note: 'A lab piece. Type the falling words before they land. Pure canvas + keyboard.',
  },
  {
    id: 'primordia',
    mono: 'pr',
    title: 'primordia',
    line: 'Generative life in the browser. Little cells, big emergent behaviour.',
    href: 'https://aitorgallardo.github.io/primordia/',
    linkLabel: 'aitorgallardo.github.io/primordia',
    note: 'An artificial-life sandbox. I like watching simple rules make complicated things.',
  },
  {
    id: 'x',
    mono: '𝕏',
    title: '@gmsudo',
    line: 'Where I think out loud about building, AI, and the web platform.',
    href: 'https://x.com/gmsudo',
    linkLabel: 'x.com/gmsudo',
    note: 'Full-stack & AI engineer. I post the process, not just the wins.',
  },
  {
    id: 'site',
    mono: 'ag',
    title: 'aitorgallardo',
    line: 'The portfolio. Case pages for every lab piece, this one included.',
    href: 'https://aitorgallardo.github.io/gmsudo/',
    linkLabel: 'aitorgallardo.github.io/gmsudo',
    note: 'Home base. If you found a card, you can find the whole set here.',
  },
  {
    id: 'live',
    mono: '<>',
    title: 'live DOM',
    line: 'This card is real HTML. The button and input below actually work.',
    note: 'Proof the physics is moving live DOM, not a screenshot. Rename it. Spawn one.',
    live: true,
  },
];

// Builds one card element. Returns the outer .card node.
export function buildCard(def: CardDef, onSpawn: (el: HTMLElement) => void): HTMLElement {
  const card = document.createElement('div');
  card.className = 'card';
  if (def.live) card.classList.add('card--live');
  card.dataset.cardId = def.id;

  const inner = document.createElement('div');
  inner.className = 'card__inner';

  // ----- Front face -----
  const front = document.createElement('div');
  front.className = 'card__face card__face--front';

  const top = document.createElement('div');
  top.className = 'card__top';
  top.innerHTML = `
    <div class="card__mono">${def.mono}</div>
    <h2 class="card__title"><span class="card__dot"></span><span class="js-title">${def.title}</span></h2>
  `;
  front.appendChild(top);

  const line = document.createElement('p');
  line.className = 'card__line';
  line.textContent = def.line;
  front.appendChild(line);

  if (def.live) {
    front.appendChild(buildLiveControls(card, onSpawn));
  } else {
    const meta = document.createElement('div');
    meta.className = 'card__meta';
    const link = document.createElement('a');
    link.className = 'card__link';
    link.href = def.href ?? '#';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = def.linkLabel ?? def.href ?? '';
    meta.appendChild(link);
    front.appendChild(meta);
  }

  // ----- Back face -----
  const back = document.createElement('div');
  back.className = 'card__face card__face--back';
  const note = document.createElement('p');
  note.className = 'card__note';
  note.innerHTML = `<strong>${def.title}.</strong> ${def.note}`;
  back.appendChild(note);
  const hint = document.createElement('span');
  hint.className = 'card__flip-hint';
  hint.textContent = 'double-tap to flip back';
  back.appendChild(hint);

  inner.appendChild(front);
  inner.appendChild(back);
  card.appendChild(inner);
  return card;
}

// The interactive controls that prove the DOM is live.
function buildLiveControls(card: HTMLElement, onSpawn: (el: HTMLElement) => void): HTMLElement {
  const wrap = document.createElement('div');

  const row = document.createElement('div');
  row.className = 'live-row';

  const input = document.createElement('input');
  input.className = 'live-input';
  input.type = 'text';
  input.placeholder = 'rename this card…';
  input.setAttribute('aria-label', 'rename this card');

  const titleEl = card.querySelector<HTMLElement>('.js-title');
  input.addEventListener('input', () => {
    if (titleEl) titleEl.textContent = input.value.trim() || 'live DOM';
  });
  // Keep clicks/typing from starting a drag.
  stopDrag(input);

  const spawnBtn = document.createElement('button');
  spawnBtn.className = 'live-btn';
  spawnBtn.type = 'button';
  spawnBtn.textContent = 'spawn';
  stopDrag(spawnBtn);

  const count = document.createElement('div');
  count.className = 'live-count';
  count.textContent = 'cards in play: —';

  let spawned = 0;
  spawnBtn.addEventListener('click', () => {
    spawned += 1;
    const el = buildSpawnedCard(spawned);
    onSpawn(el);
  });

  // main.ts updates this after each spawn/init
  card.addEventListener('cardstock:count', (e) => {
    const n = (e as CustomEvent<number>).detail;
    count.textContent = `cards in play: ${n}`;
  });

  row.appendChild(input);
  row.appendChild(spawnBtn);
  wrap.appendChild(row);
  wrap.appendChild(count);
  return wrap;
}

let spawnSeq = 0;
function buildSpawnedCard(n: number): HTMLElement {
  spawnSeq += 1;
  const card = document.createElement('div');
  card.className = 'card card--spawned';
  card.dataset.cardId = `spawned-${spawnSeq}`;

  const inner = document.createElement('div');
  inner.className = 'card__inner';

  const front = document.createElement('div');
  front.className = 'card__face card__face--front';
  front.innerHTML = `
    <div class="card__top">
      <div class="card__mono">+${n}</div>
      <h2 class="card__title"><span class="card__dot"></span><span class="js-title">fresh card</span></h2>
    </div>
    <p class="card__line">Spawned at runtime from the live card. Same physics, same weight.</p>
    <div class="card__meta"><span class="card__link">created by you · #${n}</span></div>
  `;

  const back = document.createElement('div');
  back.className = 'card__face card__face--back';
  back.innerHTML = `
    <p class="card__note"><strong>Just DOM.</strong> This node did not exist a second ago. Throw it around.</p>
    <span class="card__flip-hint">double-tap to flip back</span>
  `;

  inner.appendChild(front);
  inner.appendChild(back);
  card.appendChild(inner);
  return card;
}

// Prevent an interactive control from being captured by the drag layer.
function stopDrag(el: HTMLElement) {
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
}
