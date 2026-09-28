// Livery atlas painter. One shared car mesh, one canvas texture per car.
// The atlas has three projections of the car plus a solid swatch strip:
//   top view   v 0.500..1.000   (z along u, x along v)   hero zone seen from above
//   right side v 0.265..0.500   (faces pointing +X)
//   left side  v 0.030..0.265   (faces pointing -X)
//   swatches   v 0.000..0.030   primary | secondary | accent
// Every car is painted through the same eight zone masks, so a new team is a
// palette plus one motif function.

import * as THREE from 'three';

export const LIVERY_SIZE = 1024;
const S = LIVERY_SIZE;
const SW = 0.03;
const SIDE_H = 0.235;

// ---- UV assignment -------------------------------------------------------

const SWATCH_U = { primary: 1 / 6, secondary: 3 / 6, accent: 5 / 6 };

export function swatchUV(g, which) {
  const n = g.attributes.position.count;
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    uv[i * 2] = SWATCH_U[which];
    uv[i * 2 + 1] = SW / 2;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// Projects UVs per face from car-space positions. Geometry must be non-indexed.
export function liveryUV(g) {
  if (g.index) g = g.toNonIndexed();
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let f = 0; f < p.count; f += 3) {
    a.fromBufferAttribute(p, f);
    b.fromBufferAttribute(p, f + 1);
    c.fromBufferAttribute(p, f + 2);
    n.subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b)).normalize();
    const side = Math.abs(n.x) > 0.62 ? Math.sign(n.x) : 0;
    for (let k = 0; k < 3; k++) {
      const x = p.getX(f + k);
      const y = p.getY(f + k);
      const z = p.getZ(f + k);
      let u, v;
      if (side > 0) {
        u = (2.5 - z) / 5;
        v = SW + SIDE_H + clamp01(y) * SIDE_H;
      } else if (side < 0) {
        u = (z + 2.5) / 5;
        v = SW + clamp01(y) * SIDE_H;
      } else {
        u = (z + 2.5) / 5;
        v = 0.5 + ((Math.max(-1, Math.min(1, x)) + 1) / 2) * 0.5;
      }
      uv[(f + k) * 2] = u;
      uv[(f + k) * 2 + 1] = v;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));

// ---- Painting ------------------------------------------------------------

// Canvas transforms from car meters to atlas pixels for each projection.
const VIEWS = {
  top: [S / 5, 0, 0, -S / 4, S / 2, S / 4], // (z, x)
  right: [-S / 5, 0, 0, -SIDE_H * S, S / 2, (1 - SW - SIDE_H) * S], // (z, y)
  left: [S / 5, 0, 0, -SIDE_H * S, S / 2, (1 - SW) * S], // (z, y)
};

function view(ctx, name) {
  ctx.setTransform(...VIEWS[name]);
  ctx.viewName = name;
}

function rect(ctx, x0, x1, y0, y1, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
}

// Text in meters at (px, py) in the current view, upright for its viewer.
function text(ctx, str, px, py, heightM, color, { weight = 800, font = 'Nunito, "Arial Rounded MT Bold", Arial, sans-serif', rotate = 0, align = 'center', stroke = null } = {}) {
  const [ax, , , ay] = VIEWS[ctx.viewName];
  ctx.save();
  ctx.translate(px, py);
  // Back to canvas pixels (x right, y down), which is how the viewer of this
  // projection sees it; then squash x so glyphs keep their aspect in meters.
  ctx.scale(1 / ax, 1 / ay);
  ctx.scale(Math.abs(ax) / Math.abs(ay), 1);
  ctx.rotate(rotate);
  const hpx = heightM * Math.abs(ay);
  ctx.font = `${weight} ${hpx}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (stroke) {
    ctx.lineWidth = hpx * 0.14;
    ctx.strokeStyle = stroke;
    ctx.lineJoin = 'round';
    ctx.strokeText(str, 0, 0);
  }
  ctx.fillStyle = color;
  ctx.fillText(str, 0, 0);
  ctx.restore();
}

function clipRect(ctx, x0, x1, y0, y1) {
  ctx.beginPath();
  ctx.rect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
  ctx.clip();
}

const MOTIFS = {
  // Sun rays fanning back from the nose.
  rays(ctx, t, zone) {
    if (zone !== 'top') return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(-1.4, -0.95, 3.2, 1.9);
    ctx.clip();
    for (let i = -7; i <= 7; i++) {
      const a = i * 0.075;
      ctx.beginPath();
      ctx.moveTo(2.3, 0);
      ctx.lineTo(-1.6, Math.tan(a - 0.018) * 3.9);
      ctx.lineTo(-1.6, Math.tan(a + 0.018) * 3.9);
      ctx.closePath();
      ctx.fillStyle = i % 2 ? t.accent : t.secondary;
      ctx.globalAlpha = 0.85;
      ctx.fill();
    }
    ctx.restore();
  },
  // Aurora wave along the sidepod.
  waves(ctx, t, zone) {
    ctx.save();
    const band = (y0, amp, w, color, alpha) => {
      ctx.beginPath();
      for (let z = -2.2; z <= 2.4; z += 0.05) ctx.lineTo(z, y0 + Math.sin(z * 3.1) * amp);
      for (let z = 2.4; z >= -2.2; z -= 0.05) ctx.lineTo(z, y0 + w + Math.sin(z * 3.1 + 0.6) * amp);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      ctx.fill();
    };
    if (zone === 'top') {
      for (const s of [1, -1]) {
        band(s * 0.55, 0.08, s * 0.12, t.secondary, 0.95);
        band(s * 0.72, 0.06, s * 0.05, t.accent, 0.9);
      }
    } else {
      band(0.25, 0.06, 0.07, t.secondary, 0.95);
      band(0.36, 0.05, 0.03, t.primary, 0.9);
    }
    ctx.restore();
  },
  // Angular feather chevrons.
  chevrons(ctx, t, zone) {
    ctx.save();
    ctx.fillStyle = t.secondary;
    const y0 = zone === 'top' ? 0 : 0.3;
    const reach = zone === 'top' ? 0.8 : 0.14;
    for (let i = 0; i < 5; i++) {
      const z = 0.4 - i * 0.32;
      ctx.beginPath();
      ctx.moveTo(z, y0);
      ctx.lineTo(z - 0.28, y0 + reach);
      ctx.lineTo(z - 0.4, y0 + reach);
      ctx.lineTo(z - 0.12, y0);
      ctx.lineTo(z - 0.4, y0 - reach);
      ctx.lineTo(z - 0.28, y0 - reach);
      ctx.closePath();
      ctx.globalAlpha = 1 - i * 0.13;
      ctx.fill();
    }
    ctx.restore();
  },
  // Vintage pinstripes and a roundel.
  pinstripes(ctx, t, zone, car) {
    ctx.save();
    ctx.strokeStyle = t.accent;
    ctx.lineWidth = 0.012;
    const ys = zone === 'top' ? [-0.62, -0.58, 0.58, 0.62] : [0.4, 0.43];
    for (const y of ys) {
      ctx.beginPath();
      ctx.moveTo(2.4, y);
      ctx.lineTo(-2.3, y);
      ctx.stroke();
    }
    if (zone === 'top') {
      for (const s of [1, -1]) {
        ctx.beginPath();
        ctx.arc(-0.35, s * 0.58, 0.16, 0, Math.PI * 2);
        ctx.fillStyle = t.secondary;
        ctx.fill();
        ctx.lineWidth = 0.025;
        ctx.stroke();
        text(ctx, String(car.number), -0.35, s * 0.58, 0.16, t.primary, { rotate: 0 });
      }
    }
    ctx.restore();
  },
  // Technical grid lines and coordinates.
  grid(ctx, t, zone) {
    ctx.save();
    ctx.strokeStyle = t.secondary;
    ctx.lineWidth = 0.008;
    ctx.globalAlpha = 0.9;
    const [y0, y1] = zone === 'top' ? [-0.95, 0.95] : [0.1, 0.55];
    for (let z = -2.2; z <= 2.2; z += 0.2) {
      ctx.beginPath();
      ctx.moveTo(z, y0);
      ctx.lineTo(z, y1);
      ctx.stroke();
    }
    for (let y = y0; y <= y1; y += 0.1) {
      ctx.beginPath();
      ctx.moveTo(-2.3, y);
      ctx.lineTo(2.4, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (zone === 'top') {
      text(ctx, "45°27'N 09°11'E", -0.3, 0.62, 0.07, t.accent, { weight: 700, font: 'monospace' });
      text(ctx, "45°27'N 09°11'E", -0.3, -0.62, 0.07, t.accent, { weight: 700, font: 'monospace' });
    } else {
      text(ctx, 'X 0.000  Y 0.920', -0.4, 0.2, 0.05, t.accent, { weight: 700, font: 'monospace' });
    }
    ctx.restore();
  },
};

const SPONSORS = { tire: 'TREADLINE', coffee: 'BEANLOFT', watch: 'HALCYON' };

export function paintLivery(team, number) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  const t = team;
  const car = { number };
  const motif = MOTIFS[t.motif];

  // Swatch strip.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = t.primary;
  ctx.fillRect(0, S * (1 - SW), S / 3, S * SW);
  ctx.fillStyle = t.secondary;
  ctx.fillRect(S / 3, S * (1 - SW), S / 3, S * SW);
  ctx.fillStyle = t.accent;
  ctx.fillRect((2 * S) / 3, S * (1 - SW), S / 3 + 1, S * SW);

  // ---- Top view (z, x) ----
  view(ctx, 'top');
  rect(ctx, -2.6, 2.6, -1.05, 1.05, t.primary); // nose and chassis: primary
  ctx.save();
  clipRect(ctx, -1.25, 0.62, -0.95, 0.95); // sidepod tops: hero zone with motif
  motif(ctx, t, 'top', car);
  ctx.restore();
  rect(ctx, -2.05, -0.1, -0.2, 0.2, t.secondary); // engine cover spine
  rect(ctx, 2.2, 2.6, -0.2, 0.2, t.accent); // nose tip
  rect(ctx, 1.95, 2.6, 0.76, 1.05, t.accent); // front wing endplates
  rect(ctx, 1.95, 2.6, -0.76, -1.05, t.accent);
  rect(ctx, -2.5, -1.95, -0.62, 0.62, t.primary); // rear wing top
  text(ctx, String(number), 1.7, 0, 0.2, t.accent, { rotate: 0, stroke: t.secondary }); // nose number
  text(ctx, String(number), -2.2, 0, 0.2, t.secondary, { rotate: 0 }); // rear wing number
  text(ctx, SPONSORS.watch, -2.2, 0.38, 0.07, t.accent, { weight: 700 });
  text(ctx, SPONSORS.watch, -2.2, -0.38, 0.07, t.accent, { weight: 700 });
  text(ctx, SPONSORS.tire, 2.28, 0.5, 0.06, t.secondary, { weight: 800 });
  text(ctx, SPONSORS.tire, 2.28, -0.5, 0.06, t.secondary, { weight: 800 });
  text(ctx, SPONSORS.coffee, -1.1, 0.72, 0.07, t.accent, { weight: 800, stroke: t.secondary });
  text(ctx, SPONSORS.coffee, -1.1, -0.72, 0.07, t.accent, { weight: 800, stroke: t.secondary });

  // ---- Sides (z, y) ----
  for (const side of ['right', 'left']) {
    view(ctx, side);
    rect(ctx, -2.6, 2.6, -0.05, 1.05, t.primary);
    rect(ctx, -1.35, 0.6, 0.1, 0.46, t.secondary); // sidepod flank
    ctx.save();
    clipRect(ctx, -1.35, 0.6, 0.1, 0.46);
    motif(ctx, t, 'side', car);
    ctx.restore();
    rect(ctx, -2.0, -0.1, 0.55, 1.05, t.secondary); // engine cover + shark fin
    text(ctx, String(number), -1.3, 0.76, 0.2, t.accent); // fin number
    rect(ctx, 2.0, 2.6, -0.05, 1.05, t.accent); // nose tip, wing endplates
    rect(ctx, -2.6, -1.95, 0.3, 1.05, t.primary); // rear wing endplates
    text(ctx, t.name.split(' ')[0].toUpperCase(), -2.15, 0.64, 0.11, t.secondary, { weight: 900 });
    text(ctx, SPONSORS.tire, -0.4, 0.2, 0.08, t.accent, { weight: 800 });
    text(ctx, String(number), 1.4, 0.36, 0.14, t.secondary); // nose side number
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  return tex;
}
