import { buildDawnTrack, dawnFeatures } from './src/tracks/dawnLayout.js';
const t = buildDawnTrack();
console.log('length', t.length.toFixed(0));
const f = dawnFeatures(t); console.log(JSON.stringify(f));
// min radius, max grade
let minR = 1e9, minS = 0, maxG = 0;
for (let i = 0; i < t.n; i++) { const r = 1 / Math.abs(t.curv[i]); if (r < minR) { minR = r; minS = i * 0.5; } maxG = Math.max(maxG, Math.abs(t.tan[i].y)); }
console.log('minR', minR.toFixed(1), 'at', minS, 'maxGrade', maxG.toFixed(3));
// lap time from speed profile
let T = 0; for (const v of t.speed) T += 0.5 / v; console.log('ideal lap', T.toFixed(1));
// separation between non-adjacent parts (horizontal) and vertical
let worst = [];
for (let i = 0; i < t.n; i += 4) for (let j = i + 4; j < t.n; j += 4) {
  const ds = Math.min(j - i, t.n - (j - i)) * 0.5; if (ds < 60) continue;
  const a = t.pos[i], b = t.pos[j]; const h = Math.hypot(a.x - b.x, a.z - b.z);
  if (h < 26 && Math.hypot(a.x,a.z) > 40) worst.push([i * 0.5, j * 0.5, h.toFixed(1), (a.y - b.y).toFixed(1)]);
}
console.log(worst.slice(0, 40));
// svg
let d = t.pos.filter((_, i) => i % 4 === 0).map((p, i) => `${i ? 'L' : 'M'}${(p.x + 260).toFixed(1)},${(p.z + 160).toFixed(1)}`).join(' ');
import fs from 'fs';
fs.writeFileSync('/tmp/claude-0/-home-user-f1play/f97b35b9-2c16-5800-b632-f4f154e3138a/scratchpad/dawn.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="400" style="background:#fff"><path d="${d}" fill="none" stroke="#222" stroke-width="3"/>${t.pos.filter((_, i) => i % 40 === 0).map((p) => `<circle cx="${p.x + 260}" cy="${p.z + 160}" r="${1 + p.y / 2}" fill="red"/>`).join('')}<line x1="${260-30}" y1="0" x2="${260-30}" y2="400" stroke="#9cf"/><line x1="${260+30}" y1="0" x2="${260+30}" y2="400" stroke="#9cf"/></svg>`);
