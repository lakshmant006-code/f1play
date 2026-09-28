// Orbiting diorama camera. Overview elevation stays within 35-45 degrees; camera
// moves ease in and out over 0.8 s and never cut (reduced motion swaps the glide
// for a fade). A focus can follow a moving object.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const deg = THREE.MathUtils.degToRad;
// Overview can orbit all the way round and from near-level to nearly overhead.
export const OVERVIEW_RANGE = [8, 85];

export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export class CameraRig {
  constructor(camera, dom, post) {
    this.camera = camera;
    this.post = post;
    this.controls = new OrbitControls(camera, dom);
    const c = this.controls;
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.screenSpacePanning = false;
    c.minDistance = 4;
    c.maxDistance = 330;
    c.zoomToCursor = true;
    this.setElevationRange(...OVERVIEW_RANGE);
    this.glide = null;
    this.frozen = false; // walk mode owns the camera
    c.autoRotateSpeed = 0.7;
    // Any drag stops the turntable.
    c.addEventListener('start', () => this.stopAutoRotate());
    this.follow = null;
    this.home = { target: new THREE.Vector3(2, 0, -8), distance: 300, azimuth: deg(20), elevation: deg(40) };
    this.jumpTo(this.home);
  }

  setElevationRange(minDeg, maxDeg) {
    this.controls.minPolarAngle = deg(90 - maxDeg);
    this.controls.maxPolarAngle = deg(90 - minDeg);
  }

  // Current view as {target, distance, azimuth, elevation}.
  view() {
    const off = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
    const sph = new THREE.Spherical().setFromVector3(off);
    return { target: this.controls.target.clone(), distance: sph.radius, azimuth: sph.theta, elevation: Math.PI / 2 - sph.phi };
  }

  jumpTo(v) {
    const sph = new THREE.Spherical(v.distance, Math.PI / 2 - v.elevation, v.azimuth);
    this.controls.target.copy(v.target);
    this.camera.position.copy(v.target).add(new THREE.Vector3().setFromSpherical(sph));
    this.controls.update();
  }

  // Glide to a view. `follow` (Object3D) keeps the target on a moving object afterwards.
  goTo(v, { follow = null, duration = 0.8, onArrive = null } = {}) {
    const from = this.view();
    const to = { target: v.target.clone(), offset: v.offset, distance: v.distance ?? from.distance, azimuth: v.azimuth ?? from.azimuth, elevation: v.elevation ?? from.elevation };
    this.follow = null;
    // Shortest way round.
    let da = to.azimuth - from.azimuth;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    to.azimuth = from.azimuth + da;
    if (reducedMotion()) {
      this.glide = { fade: true, t: 0, duration: 0.5, from, to, followObj: follow, onArrive, swapped: false };
    } else {
      this.glide = { t: 0, duration, from, to, followObj: follow, onArrive };
    }
  }

  // Turn the view around the islands by an angle (radians).
  rotateBy(da) {
    const v = this.view();
    this.goTo({ ...v, azimuth: v.azimuth + da }, { duration: 0.6 });
  }

  tiltBy(de) {
    const v = this.view();
    const [lo, hi] = [Math.PI / 2 - this.controls.maxPolarAngle, Math.PI / 2 - this.controls.minPolarAngle];
    this.goTo({ ...v, elevation: THREE.MathUtils.clamp(v.elevation + de, lo, hi) }, { duration: 0.5 });
  }

  setAutoRotate(on) {
    this.controls.autoRotate = on && !reducedMotion();
    this.onAutoRotate?.(this.controls.autoRotate);
  }

  stopAutoRotate() {
    if (this.controls.autoRotate) this.setAutoRotate(false);
  }

  update(dt) {
    if (this.frozen) return;
    const g = this.glide;
    if (g) {
      g.t += dt;
      const k = Math.min(1, g.t / g.duration);
      if (g.fade) {
        this.post.grade.uniforms.fade.value = k < 0.5 ? k * 2 : (1 - k) * 2;
        if (k >= 0.5 && !g.swapped) {
          g.swapped = true;
          this.jumpTo(this.liveTarget(g.to, g.followObj));
        }
      } else {
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        const to = this.liveTarget(g.to, g.followObj);
        this.jumpTo({
          target: g.from.target.clone().lerp(to.target, e),
          distance: THREE.MathUtils.lerp(g.from.distance, to.distance, e),
          azimuth: THREE.MathUtils.lerp(g.from.azimuth, to.azimuth, e),
          elevation: THREE.MathUtils.lerp(g.from.elevation, to.elevation, e),
        });
      }
      if (k >= 1) {
        this.post.grade.uniforms.fade.value = 0;
        this.glide = null;
        if (g.followObj) this.follow = { obj: g.followObj, last: g.followObj.getWorldPosition(new THREE.Vector3()) };
        g.onArrive?.();
      }
      return;
    }
    if (this.follow) {
      const p = this.follow.obj.getWorldPosition(new THREE.Vector3());
      const delta = p.clone().sub(this.follow.last);
      this.follow.last.copy(p);
      this.controls.target.add(delta);
      this.camera.position.add(delta);
    }
    this.controls.update(dt);
  }

  liveTarget(to, followObj) {
    if (!followObj) return to;
    return { ...to, target: followObj.getWorldPosition(new THREE.Vector3()).add(to.offset || new THREE.Vector3()) };
  }

  back(onArrive) {
    this.setElevationRange(...OVERVIEW_RANGE);
    this.goTo(this.home, { onArrive });
  }
}
