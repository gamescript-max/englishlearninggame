/** Integration draft. Copy beside geometry helper, change its .mjs import as needed.
 * One mesh / draw per creature. Share geometry cache, keep per-creature shader uniforms.
 * WebGLRenderer compositor belongs to the parent Canvas renderer, not this model factory. */
import * as THREE from 'three';
import { createVolumeFishMesh, familyFor, skinTileFor } from './volume-fish-mesh.mjs';

const cache = new Map<string, THREE.BufferGeometry>();
export interface FishVolume {
  group: THREE.Group;
  mesh: THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
  phase: {value:number};
  amplitude: {value:number};
  family:string;
  disposed:boolean;
  roll:number;
  lastElapsed:number;
}
export function createFishVolume(speciesId:string,artIndex:number,skinAtlas?:THREE.Texture):FishVolume {
  const key=speciesId+':'+artIndex;
  let geometry=cache.get(key);
  if(!geometry){
    const data=createVolumeFishMesh(speciesId,artIndex);
    const buffer=new THREE.InterleavedBuffer(data.vertices,data.stride);
    geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.InterleavedBufferAttribute(buffer,3,0));
    geometry.setAttribute('normal',new THREE.InterleavedBufferAttribute(buffer,3,3));
    geometry.setAttribute('color',new THREE.InterleavedBufferAttribute(buffer,3,6));
    geometry.setAttribute('skinUv',new THREE.InterleavedBufferAttribute(buffer,3,9));
    geometry.setAttribute('uv',new THREE.InterleavedBufferAttribute(buffer,2,9));
    geometry.computeBoundingSphere();cache.set(key,geometry);
  }
  const family=familyFor(speciesId);
  const tile=skinTileFor(speciesId);
  const material=new THREE.MeshStandardMaterial({vertexColors:true,map:skinAtlas??null,roughness:.57,metalness:0,side:THREE.DoubleSide});
  const phase={value:0},amplitude={value:0};
  material.onBeforeCompile=shader=>{
    shader.uniforms.uSwimPhase=phase;shader.uniforms.uSwimAmplitude=amplitude;
    shader.uniforms.uSkinTile={value:new THREE.Vector2(Math.max(0,tile)%4*.25,(3-Math.floor(Math.max(0,tile)/4))*.25)};
    shader.uniforms.uHasSkin={value:tile>=0?1:0};
    shader.vertexShader='uniform float uSwimPhase;\nuniform float uSwimAmplitude;\nattribute vec3 skinUv;\nvarying vec3 vFishSkin;\n'+shader.vertexShader;
    shader.fragmentShader='uniform vec2 uSkinTile;\nuniform float uHasSkin;\nvarying vec3 vFishSkin;\n'+shader.fragmentShader;
    shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',`
      #include <beginnormal_vertex>
      float swimWeight=clamp((-position.x-.03)/.95,0.0,1.0);
      float swimArgument=uSwimPhase+position.x*3.7;
      float swimDerivative=uSwimAmplitude*(-2.0*swimWeight/.95*sin(swimArgument)+3.7*swimWeight*swimWeight*cos(swimArgument));
      objectNormal.x-=swimDerivative*objectNormal.z;
      objectNormal=normalize(objectNormal);
    `);
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`
      #include <begin_vertex>
      vFishSkin=skinUv;
      float tailWeight=clamp((-position.x-.03)/.95,0.0,1.0);
      float tailBend=uSwimAmplitude*tailWeight*tailWeight*sin(uSwimPhase+position.x*3.7);
      transformed.z+=tailBend;
      transformed.y+=tailBend*.28;
      float pectoral=step(.24,abs(position.z))*step(-.25,position.x)*step(position.x,.3);
      transformed.y+=pectoral*uSwimAmplitude*.45*sin(uSwimPhase+position.z*4.0);
    `);
    // The sRGB texture is decoded by the GPU. Only body vertices use the skin;
    // eyes, mouth, gills and fin rays retain their own correctly-linear colours.
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','').replace('#include <color_fragment>',`
      #include <color_fragment>
      #ifdef USE_MAP
        float skinEdge=2.5/1254.0;
        vec2 atlasUv=uSkinTile+vec2(skinEdge)+clamp(vFishSkin.xy,0.0,1.0)*(.25-2.0*skinEdge);
        vec3 naturalSkin=texture2D(map,atlasUv).rgb;
        diffuseColor.rgb=mix(diffuseColor.rgb,naturalSkin,clamp(vFishSkin.z,0.0,1.0)*uHasSkin);
      #endif
      if(vFishSkin.z<-.5) {
        float finRay=smoothstep(.80,.97,abs(sin(vFishSkin.x*56.55)));
        diffuseColor.rgb*=mix(.92,.48,finRay*vFishSkin.y);
      }
    `);
  };
  material.customProgramCacheKey=()=> 'ocean-natural-skin-v2';
  const mesh=new THREE.Mesh(geometry,material),group=new THREE.Group();group.add(mesh);
  group.rotation.order='ZXY';
  return {group,mesh,phase,amplitude,family,disposed:false,roll:NaN,lastElapsed:0};
}

/** Head/eyes stay stable. Posterior actual xyz vertex volume moves; lighting moves with its normals.
 * elapsed must be world.elapsed, not performance.now, so pause/reduced motion are respected. */
export function animateFishVolume(model:FishVolume,elapsed:number,heading:number,speed:number,seed:number,reducedMotion=false){
  const drive=Math.min(1,Math.max(0,speed)/150),frequency=model.family==='eel'?2.5:model.family==='mammal'?1.4:2.8;
  const phase=seed+elapsed*(.7+frequency*drive)*Math.PI*2;
  model.phase.value=reducedMotion?seed:phase;
  model.amplitude.value=reducedMotion?0:.035+.14*drive;
  const upright=['octopus','jelly','seahorse','star','eggs'].includes(model.family);
  model.group.rotation.z=upright?Math.sin(heading)*.12:-heading;
  const targetRoll=upright?.14:(Math.cos(heading)<0?Math.PI:0)+.35+(!reducedMotion?.18*Math.sin(phase*.5):0);
  const dt=Math.max(0,Math.min(.1,elapsed-model.lastElapsed));
  if(!Number.isFinite(model.roll)||reducedMotion)model.roll=targetRoll;
  else model.roll+=Math.atan2(Math.sin(targetRoll-model.roll),Math.cos(targetRoll-model.roll))*(1-Math.exp(-dt/.18));
  model.lastElapsed=elapsed;model.group.rotation.x=model.roll;
  if(model.family==='jelly')model.mesh.scale.set(reducedMotion?1:1+Math.sin(phase)*.06,reducedMotion?1:1-Math.sin(phase)*.055,reducedMotion?1:1+Math.sin(phase)*.06);
}

export function disposeFishVolume(model:FishVolume){if(model.disposed)return;model.disposed=true;model.mesh.material.dispose();}
export function disposeFishVolumeGeometry(){for(const geometry of cache.values())geometry.dispose();cache.clear();}

/** Requested small factory facade. Layer positions/scales group itself in orthographic screen space. */
export function createVolumeFish(speciesId:string,artIndex:number,skinAtlas?:THREE.Texture){
  const model=createFishVolume(speciesId,artIndex,skinAtlas);
  return {
    group:model.group,
    family:model.family,
    setMotion:(time:number,heading=0,reduced=false,speed=150,seed=0)=>animateFishVolume(model,time,heading,speed,seed,reduced),
    dispose:()=>disposeFishVolume(model),
  };
}

/** Scene recipe: orthographic camera (left=0,right=width,top=0,bottom=-height), fish y=-screenY;
 * keep light world-fixed, which gives a real changing specular highlight while the fish turns.
 * Renderer pixel ratio <=1.5; shadows off; no expensive post processing.
 * Return a clear failure from WebGL creation to show supported-device fallback.
 */
export function lightFishScene(scene:THREE.Scene){
  scene.add(new THREE.HemisphereLight(0xc8efff,0x1b637c,1));
  const key=new THREE.DirectionalLight(0xffedce,2.2);key.position.set(-250,350,700);scene.add(key);
  const rim=new THREE.DirectionalLight(0x75d4ff,.4);rim.position.set(350,-220,-120);scene.add(rim);
}
