// Post stack: hover outline (2 px rim in the team accent, 150 ms fade), a light
// tilt-shift blur at the frame edges and a touch of saturation for the
// miniature look.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { HorizontalTiltShiftShader } from 'three/addons/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/addons/shaders/VerticalTiltShiftShader.js';

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, saturation: { value: 1.02 }, vignette: { value: 0.22 }, fade: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float saturation; uniform float vignette; uniform float fade;
    varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, saturation);
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - vignette * dot(d, d) * 2.0;
      c.rgb = mix(c.rgb, vec3(0.93, 0.96, 0.98), fade);
      gl_FragColor = c;
    }`,
};

export function createPost(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const outline = new OutlinePass(size.clone(), scene, camera);
  outline.edgeStrength = 0;
  outline.edgeGlow = 0;
  outline.edgeThickness = 1;
  outline.pulsePeriod = 0;
  outline.hiddenEdgeColor.set('#000000');
  composer.addPass(outline);

  const hBlur = new ShaderPass(HorizontalTiltShiftShader);
  const vBlur = new ShaderPass(VerticalTiltShiftShader);
  hBlur.uniforms.r.value = vBlur.uniforms.r.value = 0.5;
  composer.addPass(hBlur);
  composer.addPass(vBlur);

  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  let tilt = 1;
  const setSize = (w, h) => {
    composer.setSize(w, h); // CSS pixels; the composer applies the pixel ratio to every pass
    hBlur.uniforms.h.value = (2.2 * tilt) / w;
    vBlur.uniforms.v.value = (2.2 * tilt) / h;
  };

  // Outline hover state with a 150 ms fade.
  let target = 0;
  const hover = (objects, color) => {
    if (objects && objects.length) {
      outline.selectedObjects = objects;
      if (color) outline.visibleEdgeColor.set(color);
      target = 4;
    } else {
      target = 0;
    }
  };
  const update = (dt) => {
    const step = (4 / 0.15) * dt;
    outline.edgeStrength += Math.sign(target - outline.edgeStrength) * Math.min(step, Math.abs(target - outline.edgeStrength));
    if (outline.edgeStrength <= 0.001 && target === 0) outline.selectedObjects = [];
    outline.enabled = outline.selectedObjects.length > 0;
  };

  return {
    composer,
    outline,
    grade,
    setSize,
    hover,
    update,
    setTilt(v) {
      tilt = v;
      const s = renderer.getSize(new THREE.Vector2());
      setSize(s.x, s.y);
    },
    render: () => composer.render(),
  };
}
