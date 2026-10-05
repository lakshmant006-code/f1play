// Solid rounded icons (Material Symbols, filled) for the top bar and menus,
// inlined as SVG so they take the text colour and stay crisp at any size.

import home from '@material-symbols/svg-400/rounded/home-fill.svg?raw';
import drive from '@material-symbols/svg-400/rounded/sports_motorsports-fill.svg?raw';
import play from '@material-symbols/svg-400/rounded/sports_esports-fill.svg?raw';
import walk from '@material-symbols/svg-400/rounded/directions_walk-fill.svg?raw';
import pit from '@material-symbols/svg-400/rounded/tire_repair-fill.svg?raw';
import podium from '@material-symbols/svg-400/rounded/leaderboard-fill.svg?raw';
import rain from '@material-symbols/svg-400/rounded/rainy-fill.svg?raw';
import cards from '@material-symbols/svg-400/rounded/style-fill.svg?raw';
import learn from '@material-symbols/svg-400/rounded/menu_book-fill.svg?raw';
import help from '@material-symbols/svg-400/rounded/help-fill.svg?raw';
import menu from '@material-symbols/svg-400/rounded/menu-fill.svg?raw';
import close from '@material-symbols/svg-400/rounded/close-fill.svg?raw';
import personAdd from '@material-symbols/svg-400/rounded/person_add-fill.svg?raw';
import face from '@material-symbols/svg-400/rounded/face-fill.svg?raw';
import timer from '@material-symbols/svg-400/rounded/timer-fill.svg?raw';
import rotateLeft from '@material-symbols/svg-400/rounded/rotate_left-fill.svg?raw';
import rotateRight from '@material-symbols/svg-400/rounded/rotate_right-fill.svg?raw';
import up from '@material-symbols/svg-400/rounded/keyboard_arrow_up-fill.svg?raw';
import down from '@material-symbols/svg-400/rounded/keyboard_arrow_down-fill.svg?raw';
import spin from '@material-symbols/svg-400/rounded/360-fill.svg?raw';
import recenter from '@material-symbols/svg-400/rounded/center_focus_strong-fill.svg?raw';
import music from '@material-symbols/svg-400/rounded/music_note-fill.svg?raw';
import musicOff from '@material-symbols/svg-400/rounded/music_off-fill.svg?raw';

const ICONS = { home, drive, play, walk, pit, podium, rain, cards, learn, help, menu, close, personAdd, face, timer, rotateLeft, rotateRight, up, down, spin, recenter, music, musicOff };

// SVG markup for an icon, sized by CSS (1em square, currentColor).
export function icon(name) {
  const svg = ICONS[name] || '';
  return svg.replace(/width="\d+" height="\d+"/, 'width="1em" height="1em" fill="currentColor" focusable="false"');
}

// Fill every <span data-icon="…"> under root.
export function fillIcons(root = document) {
  for (const el of root.querySelectorAll('[data-icon]')) {
    if (!el.dataset.filled) {
      el.innerHTML = icon(el.dataset.icon);
      el.dataset.filled = '1';
    }
  }
}
