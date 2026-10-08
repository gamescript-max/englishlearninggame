import * as THREE from "three";
import { cameraForWorld, type AdventureWorld } from "@/lib/adventure-engine";
import { getOceanSpecies } from "@/lib/adventure-catalog";
import { createVolumeFish, disposeFishVolumeGeometry, lightFishScene } from "@/lib/three-volume-fish";

type Volume = ReturnType<typeof createVolumeFish>;
type Model = { volume: Volume; species: string; x: number; y: number; at: number; speed: number; seed: number };

/** A single transparent GPU layer is composited between the sea and readable cards.
 * Physics remains in world XY. Models have actual depth, lit normals and moving fins. */
export class OceanVolumeLayer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2000);
  private models = new Map<string, Model>();
  private element: HTMLCanvasElement;
  private skinAtlas?: THREE.Texture;
  private width = 0;
  private height = 0;
  private disposed = false;
  available = true;

  constructor() {
    this.element = document.createElement("canvas");
    this.renderer = new THREE.WebGLRenderer({ canvas: this.element, alpha: true, antialias: true, powerPreference: "low-power" });
    this.renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.camera.position.set(0, 0, 800);
    this.camera.lookAt(0, 0, 0);
    lightFishScene(this.scene);
    this.element.addEventListener("webglcontextlost", this.lost);
  }
  private lost = (event: Event) => { event.preventDefault(); this.available = false; };

  setSkinImage(image: HTMLImageElement) {
    if(this.disposed || this.skinAtlas?.image === image)return;
    for(const model of this.models.values()){this.scene.remove(model.volume.group);model.volume.dispose();}
    this.models.clear();this.skinAtlas?.dispose();
    const texture=new THREE.Texture(image);
    texture.colorSpace=THREE.SRGBColorSpace;
    texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;
    // No atlas-wide mipmaps: small distant fish must not borrow a neighbouring skin.
    texture.generateMipmaps=false;texture.needsUpdate=true;this.skinAtlas=texture;
  }

  paint(ctx: CanvasRenderingContext2D, world: AdventureWorld, width: number, height: number, reducedMotion: boolean) {
    if (!this.available || this.disposed || !this.skinAtlas) return false;
    const camera = cameraForWorld(world, width, height), vw = width / camera.zoom, vh = height / camera.zoom;
    if (width !== this.width || height !== this.height) {
      this.width = width; this.height = height; this.renderer.setSize(Math.ceil(width), Math.ceil(height), false);
    }
    this.camera.left = -vw / 2; this.camera.right = vw / 2;
    this.camera.top = vh / 2; this.camera.bottom = -vh / 2; this.camera.updateProjectionMatrix();
    const living = new Set<string>();
    const creatures = world.actors.filter(a => !a.consumed && !a.wordId).map(a => ({ ...a, player: false }));
    creatures.push({ ...world.player, id: "player", kind: "bot", color: "blue", player: true });
    for (const actor of creatures) {
      const reach = actor.radius * 2.2;
      if (actor.x + reach < camera.x || actor.x - reach > camera.x + vw || actor.y + reach < camera.y || actor.y - reach > camera.y + vh) continue;
      const species = getOceanSpecies(actor.speciesId ?? "fish-fry")!;
      // Colour/count mission fish remain recognisable while sharing the volume renderer.
      const key = actor.kind === "mission" ? `mission-${actor.color}` : species.id;
      let model = this.models.get(actor.id);
      if (!model || model.species !== key) {
        if (model) { this.scene.remove(model.volume.group); model.volume.dispose(); }
        const volume = createVolumeFish(key, species.artIndex,this.skinAtlas);
        model = { volume, species: key, x: actor.x, y: actor.y, at: world.elapsed, speed: 0, seed: [...actor.id].reduce((sum, char) => sum + char.charCodeAt(0) * .17, 0) };
        this.models.set(actor.id, model); this.scene.add(volume.group);
      }
      living.add(actor.id);
      const dt = world.elapsed - model.at;
      if (dt > 0) { const velocity = Math.hypot(actor.x - model.x, actor.y - model.y) / dt; model.speed += (Math.min(250, velocity) - model.speed) * (1 - Math.exp(-dt / .12)); }
      model.at = world.elapsed; model.x = actor.x; model.y = actor.y;
      const scale = actor.radius * (actor.player ? 1.7 : 1.42);
      model.volume.group.scale.setScalar(scale);
      model.volume.setMotion(world.elapsed, actor.heading, reducedMotion, model.speed, model.seed);
      const bob = reducedMotion ? 0 : Math.sin(world.elapsed * 1.7 + model.seed) * Math.min(3, actor.radius * .065);
      model.volume.group.position.set(actor.x - camera.x - vw / 2, -(actor.y - camera.y - vh / 2) + bob, 0);
    }
    // Only visible life consumes GPU resources; geometry itself is cached by species.
    for (const [id, model] of this.models) if (!living.has(id)) { this.scene.remove(model.volume.group); model.volume.dispose(); this.models.delete(id); }
    try {
      this.renderer.render(this.scene, this.camera);
      ctx.drawImage(this.element, camera.x, camera.y, vw, vh);
      return true;
    } catch { this.available = false; return false; }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.available = false;
    for (const model of this.models.values()) model.volume.dispose();
    this.models.clear(); this.scene.clear(); disposeFishVolumeGeometry();
    this.skinAtlas?.dispose();this.skinAtlas=undefined;
    this.element.removeEventListener("webglcontextlost", this.lost);
    this.renderer.dispose(); this.renderer.forceContextLoss();
  }
}

export function createOceanVolumeLayer(): OceanVolumeLayer | null {
  try { return new OceanVolumeLayer(); } catch { return null; }
}
