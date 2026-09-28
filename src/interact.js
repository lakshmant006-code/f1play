// Hover, click, keyboard and touch for every interactive asset.
// One outline style for everything hoverable; Tab cycles assets in reading
// order and Enter clicks; touch: tap = click, long press = hover card.

import * as THREE from 'three';

export class Interactions {
  constructor({ camera, dom, post, onHover, onEscape }) {
    this.camera = camera;
    this.dom = dom;
    this.post = post;
    this.onHover = onHover; // (entry | null, screenPos, source)
    this.onEscape = onEscape;
    this.entries = [];
    this.proxies = [];
    this.ray = new THREE.Raycaster();
    this.hovered = null;
    this.focusIndex = -1;
    this.enabled = true;
    this.down = null;
    this.longTimer = null;
    this.bind();
  }

  // entry: { id, kind, hit: Object3D (proxy or mesh group), outline: Object3D[], accent, anchor: Object3D, label: () => string, onClick, onLongPress?, enabled?: () => bool }
  add(entry) {
    entry.hit.traverse((o) => (o.userData.interact = entry));
    this.entries.push(entry);
    this.proxies.push(entry.hit);
    return entry;
  }

  // Invisible capsule used as a click target for people and props.
  static proxy(parent, w, h, d, y = h / 2) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial());
    m.visible = false;
    m.position.y = y;
    parent.add(m);
    return m;
  }

  pick(clientX, clientY) {
    const r = this.dom.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const hits = this.ray.intersectObjects(this.proxies, true);
    for (const h of hits) {
      const e = h.object.userData.interact;
      if (e && (!e.enabled || e.enabled())) return e;
    }
    return null;
  }

  setHover(entry, source = 'pointer') {
    if (entry === this.hovered && source === 'pointer') return;
    this.hovered = entry;
    this.post.hover(entry ? entry.outline : null, entry?.accent);
    this.onHover?.(entry, source);
    this.dom.style.cursor = entry ? 'pointer' : '';
  }

  bind() {
    const el = this.dom;
    el.addEventListener('pointermove', (e) => {
      if (!this.enabled) return;
      if (this.down && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 6) {
        this.down.moved = true;
        clearTimeout(this.longTimer);
      }
      if (e.pointerType === 'touch') return;
      this.setHover(this.pick(e.clientX, e.clientY));
    });
    el.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      this.down = { x: e.clientX, y: e.clientY, moved: false, long: false };
      if (e.pointerType === 'touch') {
        clearTimeout(this.longTimer);
        this.longTimer = setTimeout(() => {
          const hit = this.pick(e.clientX, e.clientY);
          if (hit && this.down && !this.down.moved) {
            this.down.long = true;
            this.setHover(hit, 'long');
            hit.onLongPress?.();
          }
        }, 500);
      }
    });
    el.addEventListener('pointerup', (e) => {
      clearTimeout(this.longTimer);
      const d = this.down;
      this.down = null;
      if (!this.enabled || !d || d.moved || d.long) return;
      const hit = this.pick(e.clientX, e.clientY);
      if (hit) {
        if (e.pointerType === 'touch') this.setHover(hit, 'tap');
        hit.onClick?.();
      }
    });
    el.addEventListener('pointerleave', () => this.setHover(null));

    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      const inUI = e.target instanceof HTMLElement && e.target.closest('.panel, .hud, .modal, button, input, select');
      const onScene = e.target === this.dom || e.target === document.body;
      if (e.key === 'Tab' && onScene) {
        // Cycle 3D assets; past the last one, let focus move on to the page buttons.
        if (this.cycle(e.shiftKey ? -1 : 1)) e.preventDefault();
        else this.setHover(null);
      } else if (e.key === 'Enter' && this.hovered && !inUI) {
        e.preventDefault();
        this.hovered.onClick?.();
      } else if (e.key === 'Escape') {
        this.onEscape?.();
      }
    });
  }

  // Tab through visible assets in reading order (top to bottom, left to right).
  cycle(dir) {
    const v = new THREE.Vector3();
    const visible = this.entries
      .filter((e) => !e.enabled || e.enabled())
      .map((e) => {
        e.anchor.getWorldPosition(v);
        v.project(this.camera);
        return { e, x: v.x, y: -v.y, on: Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && v.z < 1 };
      })
      .filter((o) => o.on)
      .sort((a, b) => Math.round(a.y * 6) - Math.round(b.y * 6) || a.x - b.x)
      .map((o) => o.e);
    if (!visible.length) return false;
    let i = visible.indexOf(this.hovered);
    i = i < 0 ? (dir > 0 ? 0 : visible.length - 1) : i + dir;
    if (i < 0 || i >= visible.length) return false;
    this.setHover(visible[i], 'keyboard');
    return true;
  }
}
