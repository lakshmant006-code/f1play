// Bakes a built character (dozens of small meshes, each with its own
// materials) into one rigidly skinned mesh, so a person in the paddock costs
// one or two draw calls. Every painted face texture is packed into a shared
// atlas; plain colored parts sample a white texel and carry their color as a
// vertex color. Glossy parts (the visor) go in a second material group.

import * as THREE from 'three';

const CELL = 64;
const COLS = 16;
const atlasCache = new Map();

// One atlas per set of face textures; characters in the same kit share it.
function atlasFor(textures) {
  const key = textures.map((t) => t.uuid).join('|');
  if (atlasCache.has(key)) return atlasCache.get(key);
  const n = textures.length + 1; // + one white cell
  const rows = Math.ceil(n / COLS);
  const W = COLS * CELL;
  const H = rows * CELL;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  const rect = new Map();
  textures.forEach((t, i) => {
    const cx = (i % COLS) * CELL;
    const cy = Math.floor(i / COLS) * CELL;
    ctx.drawImage(t.image, cx, cy, CELL, CELL);
    rect.set(t, { cx, cy });
  });
  const wi = textures.length;
  const white = { u: ((wi % COLS) * CELL + CELL / 2) / W, v: 1 - (Math.floor(wi / COLS) * CELL + CELL / 2) / H };
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const materials = [
    new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.6 }),
    new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.08, metalness: 0.6 }),
  ];
  const atlas = { tex, rect, white, W, H, materials };
  atlasCache.set(key, atlas);
  return atlas;
}

// Joints that become bones, in skeleton order.
export const BAKE_BONES = ['body', 'spine', 'chest', 'head', 'shoulderL', 'elbowL', 'handL', 'shoulderR', 'elbowR', 'handR', 'hipL', 'kneeL', 'hipR', 'kneeR'];

export function bakeCharacter(root) {
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.scale.set(1, 1, 1);
  root.updateMatrixWorld(true);
  const J = root.userData.joints;
  const bones = BAKE_BONES.map((k) => J[k]);
  const boneIndex = new Map(bones.map((b, i) => [b, i]));
  const meshes = [];
  root.traverse((o) => o.isMesh && meshes.push(o));
  const matsOf = (m) => (Array.isArray(m.material) ? m.material : [m.material]);
  const textures = [...new Set(meshes.flatMap((m) => matsOf(m).map((x) => x.map).filter(Boolean)))];
  const atlas = atlasFor(textures);

  const out = [0, 1].map(() => ({ pos: [], nor: [], uv: [], col: [], si: [], sw: [] }));
  const col = new THREE.Color();
  for (const m of meshes) {
    let b = m.parent;
    while (b && !boneIndex.has(b)) b = b.parent;
    const bi = b ? boneIndex.get(b) : 0;
    const geo = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrixWorld);
    const P = geo.attributes.position;
    const N = geo.attributes.normal;
    const UV = geo.attributes.uv;
    const mats = matsOf(m);
    const groups = geo.groups.length ? geo.groups : [{ start: 0, count: P.count, materialIndex: 0 }];
    for (const grp of groups) {
      const mat = mats[grp.materialIndex ?? 0] || mats[0];
      const o = out[mat.metalness >= 0.5 ? 1 : 0];
      const flip = mat.side === THREE.BackSide;
      col.copy(mat.color);
      if (mat.map) col.setRGB(1, 1, 1);
      if (mat.emissive && mat.emissiveIntensity) col.add(mat.emissive.clone().multiplyScalar(mat.emissiveIntensity * 0.5));
      const r = mat.map && atlas.rect.get(mat.map);
      const end = Math.min(P.count, grp.start + grp.count);
      for (let t = grp.start; t + 2 < end + 0; t += 3) {
        const tri = flip ? [t, t + 2, t + 1] : [t, t + 1, t + 2];
        for (const v of tri) {
          o.pos.push(P.getX(v), P.getY(v), P.getZ(v));
          const s = flip ? -1 : 1;
          o.nor.push(N.getX(v) * s, N.getY(v) * s, N.getZ(v) * s);
          if (r && UV) {
            const u = Math.min(1, Math.max(0, UV.getX(v)));
            const w = Math.min(1, Math.max(0, UV.getY(v)));
            o.uv.push((r.cx + 1 + u * (CELL - 2)) / atlas.W, 1 - (r.cy + 1 + (1 - w) * (CELL - 2)) / atlas.H);
          } else o.uv.push(atlas.white.u, atlas.white.v);
          o.col.push(col.r, col.g, col.b);
          o.si.push(bi, 0, 0, 0);
          o.sw.push(1, 0, 0, 0);
        }
      }
    }
    geo.dispose();
  }
  // Drop the source meshes (their geometry is ours to free; textures are cached).
  for (const m of meshes) {
    m.parent.remove(m);
    m.geometry.dispose();
  }

  const geo = new THREE.BufferGeometry();
  const cat = (k) => out[0][k].concat(out[1][k]);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(cat('pos'), 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(cat('nor'), 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(cat('uv'), 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cat('col'), 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(cat('si'), 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(cat('sw'), 4));
  const n0 = out[0].pos.length / 3;
  const n1 = out[1].pos.length / 3;
  geo.addGroup(0, n0, 0);
  if (n1) geo.addGroup(n0, n1, 1);
  const skinned = new THREE.SkinnedMesh(geo, atlas.materials);
  skinned.name = 'character_baked';
  skinned.castShadow = true;
  skinned.frustumCulled = false;
  root.add(skinned);
  root.updateMatrixWorld(true);
  skinned.bind(new THREE.Skeleton(bones), skinned.matrixWorld);
  root.userData.baked = skinned;
  return root;
}
