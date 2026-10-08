import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { oceanSpecies } from "../lib/adventure-catalog";
import { createVolumeFishMesh, paletteFor, skinTileFor } from "../lib/volume-fish-mesh.mjs";
import { animateFishVolume, createFishVolume, disposeFishVolume, disposeFishVolumeGeometry } from "../lib/three-volume-fish";

test("all ocean models are finite lit volumes rather than flat image planes", () => {
  const families = new Set<string>();
  for (const species of oceanSpecies) {
    const geometry = createVolumeFishMesh(species.id, species.artIndex); families.add(geometry.family);
    assert.equal(geometry.vertices.length, geometry.vertexCount * geometry.stride);
    let near = Infinity, far = -Infinity;
    for (let i = 0; i < geometry.vertices.length; i += geometry.stride) {
      for (const value of geometry.vertices.slice(i, i + geometry.stride)) assert.ok(Number.isFinite(value));
      near = Math.min(near, geometry.vertices[i + 2]); far = Math.max(far, geometry.vertices[i + 2]);
      for (const color of geometry.vertices.slice(i + 6, i + 9)) assert.ok(color >= 0 && color <= 1);
      for (const uv of geometry.vertices.slice(i + 9, i + 11)) assert.ok(uv >= 0 && uv <= 1);
    }
    assert.ok(far - near > .1, `${species.en} has actual depth`);
  }
  assert.ok(families.size >= 13);
  assert.notDeepEqual(paletteFor("mission-blue", 2), paletteFor("mission-red", 2));
});

test("volume swimming deforms XYZ and normals, preserves pause and smooths vertical turns", () => {
  const fish = createFishVolume("goldfish", 15);
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader } as Parameters<typeof fish.mesh.material.onBeforeCompile>[0];
  fish.mesh.material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  assert.ok(shader.vertexShader.includes("transformed.z+=tailBend"));
  assert.ok(shader.vertexShader.includes("objectNormal.x-=swimDerivative"));
  animateFishVolume(fish, 1, Math.PI / 2 - .02, 140, .5);
  const roll = fish.roll; animateFishVolume(fish, 1.016, Math.PI / 2 + .02, 140, .5);
  assert.ok(Math.abs(fish.roll - roll) < .4, "no sudden half-turn when passing vertical");
  const phase = fish.phase.value, pausedRoll = fish.roll;
  animateFishVolume(fish, 1.016, Math.PI / 2 + .02, 140, .5);
  assert.equal(fish.phase.value, phase); assert.equal(fish.roll, pausedRoll);
  animateFishVolume(fish, 2, 0, 140, .5, true); assert.equal(fish.amplitude.value, 0);
  disposeFishVolume(fish); disposeFishVolume(fish); assert.equal(fish.disposed, true); disposeFishVolumeGeometry();
});

test("natural skin colours are applied to solid bodies while eyes and mission colours stay separate",()=>{
  const texture=new THREE.Texture(),fish=createFishVolume("goldfish",15,texture),mission=createFishVolume("mission-red",15,texture);
  assert.equal(fish.mesh.material.map,texture);assert.equal(mission.mesh.material.map,texture,"one atlas shared, not duplicated per fish");
  const geometry=fish.mesh.geometry,mask=geometry.getAttribute("skinUv");
  assert.ok(Array.from({length:mask.count},(_,i)=>mask.getZ(i)).includes(1));
  assert.ok(Array.from({length:mask.count},(_,i)=>mask.getZ(i)).includes(0),"eyes, mouth and gills have separate material colour");
  assert.ok(Array.from({length:mask.count},(_,i)=>mask.getZ(i)).includes(-1),"thin fins retain their own rays");
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader} as Parameters<typeof fish.mesh.material.onBeforeCompile>[0];
  fish.mesh.material.onBeforeCompile(shader,{} as THREE.WebGLRenderer);
  assert.ok(shader.fragmentShader.includes("mix(diffuseColor.rgb,naturalSkin"));
  assert.equal(shader.uniforms.uHasSkin.value,1);
  mission.mesh.material.onBeforeCompile(shader,{} as THREE.WebGLRenderer);assert.equal(shader.uniforms.uHasSkin.value,0);
  assert.equal(skinTileFor("goldfish"),0);assert.equal(skinTileFor("zebrafish"),2);assert.equal(skinTileFor("orca"),11);assert.equal(skinTileFor("mission-red"),-1);
  disposeFishVolume(fish);disposeFishVolume(mission);texture.dispose();disposeFishVolumeGeometry();
});
