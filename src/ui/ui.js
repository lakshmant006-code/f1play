// DOM overlays: hover tag, info card, radio bubble, back button, pit HUD, modal.

const $ = (sel, root = document) => root.querySelector(sel);
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style') Object.assign(el.style, v);
    else if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
};
export { h };

export class UI {
  constructor(root) {
    this.root = root;
    this.tag = h('div', { class: 'tag', role: 'status', 'aria-live': 'polite' });
    this.card = h('section', { class: 'panel card', hidden: true, 'aria-live': 'polite' });
    this.back = h('button', { class: 'back', hidden: true, 'aria-label': 'Back to the island overview' }, '← Back');
    this.toastEl = h('div', { class: 'toast', hidden: true, role: 'status', 'aria-live': 'polite' });
    this.hud = h('div', { class: 'hud', hidden: true });
    this.modal = h('div', { class: 'modal-wrap', hidden: true }, h('div', { class: 'modal panel', role: 'dialog', 'aria-modal': 'true' }));
    this.markers = h('div', { class: 'markers' });
    root.append(this.markers, this.tag, this.card, this.back, this.toastEl, this.hud, this.modal);
    this.toastTimer = null;
  }

  showTag(html, x, y, { accent = '#fff', pulse = false } = {}) {
    this.tag.innerHTML = html;
    this.tag.style.setProperty('--accent', accent);
    this.tag.classList.toggle('pulse', pulse);
    this.tag.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
    this.tag.classList.add('on');
  }

  moveTag(x, y) {
    this.tag.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
  }

  hideTag() {
    this.tag.classList.remove('on');
  }

  showCard({ title, kicker = '', accent = '#F26B1D', body = '', actions = [], extra = null }) {
    this.card.hidden = false;
    this.card.style.setProperty('--accent', accent);
    const kids = [
      h('div', { class: 'kicker' }, kicker),
      h('h2', {}, title),
      typeof body === 'string' ? h('div', { class: 'body' }, ...htmlKids(body)) : body,
      extra,
      actions.length ? h('div', { class: 'actions' }, actions.map((a) => h('button', { class: a.primary ? 'primary' : '', onclick: a.onClick, 'aria-pressed': a.pressed === undefined ? null : String(a.pressed) }, a.label))) : null,
    ];
    this.card.replaceChildren(...kids.filter(Boolean));
  }

  hideCard() {
    this.card.hidden = true;
  }

  toast(html, { icon = '📻', duration = 3200, accent = '#fff' } = {}) {
    this.toastEl.hidden = false;
    this.toastEl.style.setProperty('--accent', accent);
    this.toastEl.replaceChildren(h('span', { class: 'icon', 'aria-hidden': 'true' }, icon), h('span', {}, ...htmlKids(html)));
    this.toastEl.classList.remove('in');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('in');
    clearTimeout(this.toastTimer);
    if (duration) this.toastTimer = setTimeout(() => (this.toastEl.hidden = true), duration);
  }

  openModal(content, { onClose } = {}) {
    const m = $('.modal', this.modal);
    m.replaceChildren(content);
    this.modal.hidden = false;
    this.modalClose = onClose;
    m.querySelector('button')?.focus();
  }

  closeModal() {
    this.modal.hidden = true;
    this.modalClose?.();
    this.modalClose = null;
  }
}

// Tiny trusted-HTML helper for strings we author ourselves.
function htmlKids(html) {
  const t = document.createElement('template');
  t.innerHTML = html;
  return [...t.content.childNodes];
}
