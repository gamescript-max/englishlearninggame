/** Simulation time freezes an open mouth on pause; reduced motion keeps it closed. */
export function feedingOpen(elapsed: number, ateAt?: number, reducedMotion = false) {
  if (reducedMotion || ateAt === undefined || elapsed < ateAt) return 0;
  const t = elapsed - ateAt, smooth = (v:number) => v*v*(3-2*v);
  if (t >= .42) return 0;
  if (t < .10) return smooth(t/.10);
  if (t < .18) return 1-.08*Math.sin(Math.PI*(t-.10)/.08);
  return 1-smooth((t-.18)/.24);
}
export interface MouthProfile { hinge: [number,number]; lip: [number,number]; bottom: number; gapScale?:number }
// Original photograph coordinates: u=0 tail, u=1 head, v=0 top.
// The stationary face and moving jaw share the actual mouth seam.
const mouths: Record<string,MouthProfile> = Object.fromEntries([
  ["fish-fry",.90,.48,.99,.42,.62], ["guppy",.92,.30,.99,.25,.45],
  ["goldfish",.91,.61,.99,.53,.76], ["betta",.93,.48,.99,.44,.64],
  ["sardine",.92,.47,.99,.42,.61], ["carp",.92,.72,.99,.70,.88],
  ["bass",.86,.60,.98,.62,.80], ["small-grouper",.89,.63,.99,.59,.80],
  ["tuna",.90,.65,.99,.60,.80], ["swordfish",.70,.64,.83,.65,.76],
  ["shark",.75,.70,.91,.67,.83], ["manta-ray",.79,.62,.91,.62,.72],
  ["great-white-shark",.76,.66,.96,.63,.81], ["orca",.80,.67,.99,.67,.84],
  ["blue-whale",.78,.69,.99,.60,.82], ["megalodon",.79,.56,.94,.66,.86],
  ["basilosaurus",.79,.74,.98,.80,.94], ["kraken",.49,.45,.62,.45,.53],
  ["leviathan",.75,.65,.975,.68,.88], ["kun",.84,.72,.99,.73,.90],
  ["mosasaurus",.80,.38,.985,.40,.51], ["giant-pliosaur",.80,.39,.985,.41,.55],
  ["abyssal-giant-turtle",.90,.33,.985,.33,.42], ["azure-sea-dragon",.90,.36,.985,.36,.46],
].map(([id,hx,hy,lx,ly,bottom])=>[id,{hinge:[hx,hy],lip:[lx,ly],bottom}])) as Record<string,MouthProfile>;
Object.assign(mouths, {
  "sea-dragon":{hinge:[.89,.29],lip:[.975,.305],bottom:.37,gapScale:.40},
  "poseidon":{hinge:[.635,.235],lip:[.675,.25],bottom:.36,gapScale:.12},
  "sea-guardian":{hinge:[.88,.44],lip:[.985,.53],bottom:.61,gapScale:.50},
  "devourer":{hinge:[.66,.68],lip:[.955,.865],bottom:.97,gapScale:.40},
});
export function mouthProfile(species:string): MouthProfile { return mouths[species] ?? mouths["fish-fry"]; }
/** Move the original jaw down from its fixed rear edge; eyes, bill and neck stay put. */
export function mouthGeometry(species:string,width:number,height:number,open:number,zoom=1) {
  const profile=mouthProfile(species),point=(u:number,v:number)=>({x:(u-.5)*width,y:(v-.5)*height});
  const hinge=point(...profile.hinge),lip=point(...profile.lip);
  const gap=Math.min(width*.07,Math.max(width*.052,4/Math.max(.1,zoom)))*Math.max(0,Math.min(1,open))*(profile.gapScale??1);
  const shear=gap/Math.max(1,lip.x-hinge.x);
  const shift=(p:{x:number;y:number})=>({x:p.x,y:p.y+shear*(p.x-hinge.x)});
  const polygon=[hinge,lip,point(profile.lip[0],profile.bottom),point(profile.hinge[0],profile.bottom)];
  return {hinge,lip,shear,polygon,openedLip:shift(lip),openedPolygon:polygon.map(shift)};
}
