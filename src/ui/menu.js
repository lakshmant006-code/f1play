// Hamburger menu for narrow screens: the top bar keeps the brand, the player
// chip and a ☰ button; the game actions open as a dropdown panel. Choosing an
// action, tapping outside or pressing Escape closes it. Wide screens show the
// full bar and the button stays hidden (CSS).

export function initMenu() {
  const bar = document.querySelector('.topbar');
  const btn = document.getElementById('btn-menu');
  const nav = document.getElementById('game-nav');
  if (!bar || !btn || !nav) return;
  const set = (open) => {
    bar.classList.toggle('menu-open', open);
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Close menu' : 'Menu');
    if (open) nav.querySelector('button, a')?.focus({ preventScroll: true });
  };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    set(!bar.classList.contains('menu-open'));
  });
  // Any action closes the menu (it still runs).
  nav.addEventListener('click', (e) => {
    if (e.target.closest('button, a')) set(false);
  });
  document.addEventListener('pointerdown', (e) => {
    if (bar.classList.contains('menu-open') && !nav.contains(e.target) && !btn.contains(e.target)) set(false);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && bar.classList.contains('menu-open')) {
      set(false);
      btn.focus();
    }
  });
  // Leaving the narrow layout resets it.
  matchMedia('(max-width: 1000px)').addEventListener?.('change', () => set(false));
}
