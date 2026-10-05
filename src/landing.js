// Landing screen: the live circuit turns slowly behind a frosted sign-in card.
// Signing in keeps a player profile (name and favourite team) on this device;
// "Play as guest" skips it. Afterwards a profile chip in the top bar shows who
// is playing and signs out (which brings the landing screen back).

import { GRID as TEAMS } from './data.js';
import { h } from './ui/ui.js';
import { icon } from './ui/icons.js';
import { loadRecipe } from './character/recipe.js';
import { track } from './analytics.js';
import { LandingMusic } from './music.js';

const PLAYER_KEY = 'skycircuit.player';
const ENTERED_KEY = 'skycircuit.entered'; // set once per browser session

export function loadPlayer() {
  try {
    const p = JSON.parse(localStorage.getItem(PLAYER_KEY) || 'null');
    return p && p.name ? p : null;
  } catch {
    return null;
  }
}
function savePlayer(p) {
  try {
    if (p) localStorage.setItem(PLAYER_KEY, JSON.stringify(p));
    else localStorage.removeItem(PLAYER_KEY);
  } catch {
    /* storage unavailable: the profile lasts for this visit only */
  }
}
function entered() {
  try {
    return sessionStorage.getItem(ENTERED_KEY) === '1';
  } catch {
    return false;
  }
}
function setEntered(on) {
  try {
    if (on) sessionStorage.setItem(ENTERED_KEY, '1');
    else sessionStorage.removeItem(ENTERED_KEY);
  } catch {
    /* ignore */
  }
}

const NAME_RE = /^[\p{L}\p{N} .'-]{2,16}$/u;

export function initLanding(game) {
  const root = document.getElementById('ui');
  let player = loadPlayer();
  const chip = h('button', { class: 'profile-chip', 'aria-haspopup': 'dialog' });
  document.querySelector('.top-left')?.prepend(chip);

  const renderChip = () => {
    const t = TEAMS.find((x) => x.id === player?.team);
    // Signed out: a round sign-in icon; signed in: the player's name and team.
    chip.classList.toggle('icon-only', !player);
    if (player) chip.replaceChildren(h('span', { class: 'dot', style: { background: t?.primary || '#1fb5b0' } }), player.name);
    else chip.innerHTML = `<span class="ico" aria-hidden="true">${icon('personAdd')}</span>`;
    chip.title = player ? `Signed in as ${player.name}. Click to sign out.` : 'Sign in';
    chip.dataset.tip = player ? player.name : 'Sign in';
    chip.setAttribute('aria-label', chip.title);
  };
  chip.addEventListener('click', () => {
    if (player) {
      if (!confirm(`Sign out ${player.name}?`)) return;
      player = null;
      savePlayer(null);
    }
    setEntered(false);
    renderChip();
    show();
  });
  renderChip();

  // On wide screens the card sits on the left, so the circuit is drawn shifted
  // right (a camera view offset) and stays in full view beside it.
  let shifted = false;
  const applyShift = () => {
    const w = window.innerWidth;
    const hgt = window.innerHeight;
    if (shifted && w >= 1000) game.camera.setViewOffset(w, hgt, -Math.min(210, w * 0.13), 0, w, hgt);
    else game.camera.clearViewOffset();
  };
  function shiftView(on) {
    shifted = on;
    applyShift();
  }
  window.addEventListener('resize', () => shifted && requestAnimationFrame(applyShift));

  // Ethereal music while the landing screen is up, with an on/off button.
  const music = new LandingMusic();
  const musicBtn = h('button', { type: 'button', class: 'landing-music' });
  const renderMusic = () => {
    musicBtn.innerHTML = `<span class="ico" aria-hidden="true">${icon(music.on ? 'music' : 'musicOff')}</span>`;
    musicBtn.setAttribute('aria-pressed', String(music.on));
    musicBtn.setAttribute('aria-label', music.on ? 'Music on' : 'Music off');
    musicBtn.title = music.on ? 'Music on' : 'Music off';
  };
  musicBtn.addEventListener('click', () => music.toggle());
  music.onchange = renderMusic;
  renderMusic();

  let el = null;
  function show() {
    if (el) return;
    document.body.classList.add('landing-on');
    music.start();
    game.goHome?.();
    game.rig.setAutoRotate(true);
    shiftView(true);
    const saved = loadRecipe()?.recipe;
    let team = player?.team || TEAMS[0].id;
    const name = h('input', { id: 'landing-name', name: 'name', autocomplete: 'nickname', maxlength: '16', required: true, placeholder: 'Your player name', value: player?.name || saved?.name || '' });
    const hint = h('p', { class: 'landing-hint', 'aria-live': 'polite' });
    const teams = h('div', { class: 'landing-teams', role: 'radiogroup', 'aria-label': 'Favourite team' });
    const renderTeams = () =>
      teams.replaceChildren(
        ...TEAMS.map((t) =>
          h(
            'button',
            { type: 'button', role: 'radio', 'aria-checked': String(team === t.id), onclick: () => ((team = t.id), renderTeams()) },
            h('span', { class: 'dot', style: { background: t.primary } }),
            t.name.split(' ')[0]
          )
        )
      );
    renderTeams();
    const form = h(
      'form',
      {
        class: 'landing-form',
        onsubmit: (e) => {
          e.preventDefault();
          const n = name.value.trim();
          if (!NAME_RE.test(n)) {
            hint.textContent = 'Use 2 to 16 letters or numbers.';
            name.focus();
            return;
          }
          player = { name: n, team, since: player?.since || new Date().toISOString() };
          savePlayer(player);
          track('sign_up', { method: 'player_name' });
          renderChip();
          hide(`Welcome, ${n}!`);
        },
      },
      h('label', { for: 'landing-name' }, 'Player name'),
      name,
      h('span', { class: 'landing-label' }, 'Favourite team'),
      teams,
      hint,
      h('button', { type: 'submit', class: 'primary landing-go' }, 'Sign in and play'),
      h('button', { type: 'button', class: 'landing-guest', onclick: () => hide('Playing as a guest.') }, 'Play as guest')
    );
    // Signed in already: a welcome back with Play, or switch player.
    const welcome = player
      ? h(
          'div',
          { class: 'landing-form' },
          h('p', { class: 'landing-welcome' }, h('span', { class: 'dot', style: { background: TEAMS.find((x) => x.id === player.team)?.primary || '#1fb5b0' } }), `Welcome back, ${player.name}`),
          h('button', { type: 'button', class: 'primary landing-go', onclick: () => hide(`Let's go, ${player.name}!`) }, 'Play'),
          h('button', { type: 'button', class: 'landing-guest', onclick: () => { player = null; savePlayer(null); renderChip(); out(); show(); } }, 'Not you? Sign out')
        )
      : null;
    const out = () => {
      el?.remove();
      el = null;
    };
    el = h(
      'section',
      { class: 'landing', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'landing-title' },
      h(
        'div',
        { class: 'landing-card' },
        h('div', { class: 'landing-brand' }, h('span', { class: 'mark', 'aria-hidden': 'true' }), 'Sky Circuit', musicBtn),
        h('h1', { id: 'landing-title' }, 'Race above the clouds'),
        welcome || form,
      )
    );
    root.append(el);
    requestAnimationFrame(() => {
      el?.classList.add('in');
      if (matchMedia('(pointer: coarse)').matches) return;
      (player ? el?.querySelector('.landing-go') : name)?.focus({ preventScroll: true });
    });
  }

  function hide(msg) {
    if (!el) return;
    const out = el;
    el = null;
    out.classList.remove('in');
    out.classList.add('out');
    setTimeout(() => out.remove(), 450);
    document.body.classList.remove('landing-on');
    music.stop();
    setEntered(true);
    game.rig.setAutoRotate(false);
    shiftView(false);
    if (msg) game.ui.toast(msg, { icon: '🏁', duration: 2200 });
  }

  // Once per browser session, the landing screen greets the player.
  if (!entered()) show();
  return { show, hide, get player() {
    return player;
  } };
}
