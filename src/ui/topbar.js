// Top bar, after the reference style: small rounded chips on the left (sign
// in, the brand, a stat) and one white capsule on the right with the player's
// avatar and level badge, then icon-only buttons with tooltips. The active
// toggle sits on a light grey square.

import { fillIcons } from './icons.js';
import { loadRecipe } from '../character/recipe.js';
import { loadBest } from '../game/pitstop.js';

export function initTopbar(game) {
  fillIcons();
  document.getElementById('btn-home')?.addEventListener('click', () => game.goHome());

  // Avatar: the saved character's card art and number, or a plain face.
  const saved = loadRecipe();
  const av = document.querySelector('#btn-creator .avatar');
  const badge = document.querySelector('#btn-creator .badge');
  if (saved?.snapshot && av) {
    av.replaceChildren();
    av.style.backgroundImage = `url(${saved.snapshot})`;
    av.classList.add('photo');
  }
  if (saved?.recipe && badge) {
    badge.textContent = String(saved.recipe.number);
    badge.hidden = false;
    document.getElementById('btn-creator').dataset.tip = `${saved.recipe.name} · #${saved.recipe.number}`;
  }

  // Stat pill: best pit stop, kept up to date after each stop.
  const pill = document.getElementById('stat-pit');
  const showBest = () => {
    const best = loadBest();
    if (!pill) return;
    pill.hidden = !best;
    if (best) pill.querySelector('b').textContent = `${best.time.toFixed(2)}s`;
  };
  showBest();
  const prev = game.onPitResult;
  game.onPitResult = (r) => {
    prev?.(r);
    setTimeout(showBest, 50);
  };
}
