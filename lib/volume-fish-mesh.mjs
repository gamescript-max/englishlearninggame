/** Pure geometry draft: actual solid meshes, not billboards. Coordinates: +x head, +y dorsal, +z toward viewer.
 * Per vertex: position xyz, normal xyz, linear color rgb, skin uv + material mask.
 * Meshes are deliberately shared by body family, with species colors/traits; do not rebuild every frame. */
export function createVolumeFishMesh(speciesId = 'fish-fry', artIndex = 0) {
  const vertices=[];
  const family=familyFor(speciesId), color=paletteFor(speciesId,artIndex);
  const pale=color.map(c=>Math.min(1,c*.6+.38)), dark=color.map(c=>c*.6);
  const linear = c => c <= .04045 ? c/12.92 : Math.pow((c+.055)/1.055,2.4);
  function push(p,n,c,skin=[0,0,0]) { vertices.push(...p,...n,...c.map(linear),Math.max(0,Math.min(1,skin[0])),Math.max(0,Math.min(1,skin[1])),skin[2]); }
  function triangle(a,b,c,paint,skins) {
    const ab=b.map((v,i)=>v-a[i]),ac=c.map((v,i)=>v-a[i]);
    let n=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
    const span=Math.hypot(...n)||1;n=n.map(v=>v/span);[a,b,c].forEach((p,i)=>push(p,n,paint,skins?.[i]));
  }
  function ellipsoid(center,scale,paint,rows=10,cols=16,skin=paint===color) {
    const point=(row,col)=>{const a=row/rows*Math.PI,b=col/cols*Math.PI*2;
      const p=[Math.cos(a)*scale[0],Math.sin(a)*Math.cos(b)*scale[1],Math.sin(a)*Math.sin(b)*scale[2]];
      let n=p.map((v,i)=>v/(scale[i]*scale[i]));const length=Math.hypot(...n)||1;n=n.map(v=>v/length);
      return {p:p.map((v,i)=>v+center[i]),n};};
    for(let row=0;row<rows;row++)for(let col=0;col<cols;col++) {
      const a=point(row,col),b=point(row+1,col),c=point(row+1,col+1),d=point(row,col+1);
      for(const v of [a,b,c,a,c,d]) {
        const shade=v.p[1]<center[1] ? pale : paint;
        push(v.p,v.n,paint===color?shade:paint,skin?[(v.p[0]-center[0])/scale[0]/2+.5,(v.p[1]-center[1])/scale[1]/2+.5,1]:undefined);
      }
    }
  }
  function fishBody(length,height,depth,profile='fish',rows=20,cols=16) {
    const points=[];
    for(let row=0;row<=rows;row++) {
      const u=row/rows,x=(u-.5)*length;
      // Narrow peduncle, fuller shoulder/head, smoothly closed nose; not a scaled sphere.
      const fullness=profile==='eel' ? Math.pow(Math.sin(Math.PI*u),.38) : Math.pow(Math.sin(Math.PI*u),.72)*(.55+.65*u);
      const axisY=profile==='shark' ? .045*Math.sin(u*Math.PI) : -.035*Math.sin(u*Math.PI);
      for(let col=0;col<=cols;col++){const a=col/cols*Math.PI*2;
        points.push([x,Math.cos(a)*height*fullness+axisY,Math.sin(a)*depth*fullness]);}
    }
    const normals=points.map(()=>[0,0,0]),tri=[];
    for(let row=0;row<rows;row++)for(let col=0;col<cols;col++) {
      const a=row*(cols+1)+col,b=a+cols+1,c=b+1,d=a+1;
      tri.push([a,c,b],[a,d,c]);
    }
    for(const [a,b,c] of tri){const ab=points[b].map((v,i)=>v-points[a][i]),ac=points[c].map((v,i)=>v-points[a][i]);const n=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];for(const index of [a,b,c])for(let i=0;i<3;i++)normals[index][i]+=n[i];}
    for(const indexes of tri)for(const index of indexes) {
      const p=points[index],len=Math.hypot(...normals[index])||1,n=normals[index].map(v=>v/len);
      const u=(p[0]/length+.5),belly=Math.max(0,Math.min(1,(-p[1]/height+.22)/.7));
      let paint=color.map((v,i)=>v*(1-belly)+pale[i]*belly);
      // Species variation is painted onto a volume, never a flat atlas plane.
      const stripes=/zebrafish|tiger|perch/.test(speciesId),spots=/grouper|gourami|catfish|mandarin|puffer/.test(speciesId);
      if(stripes&&Math.sin(u*35+p[1]*4)>.55)paint=paint.map(v=>v*.45);
      if(spots&&Math.sin(u*43)*Math.cos(p[1]*27+p[2]*17)>.68)paint=paint.map(v=>v*.43);
      if(/tetra/.test(speciesId)&&Math.abs(p[1])<height*.17)paint=u>.5?[.95,.19,.22]:[.19,.92,1];
      if(speciesId==='orca')paint=p[1]<-.06?[.92,.96,.96]:[.025,.09,.13];
      push(p,n,paint,[u,(p[1]+.035*Math.sin(u*Math.PI))/Math.max(.001,height*Math.pow(Math.sin(Math.PI*u),.72)*(.55+.65*u))/2+.5,1].map((v,i)=>i===1?Math.max(0,Math.min(1,v)):v));
    }
  }
  // Triangular prism: real fin thickness catches highlights and remains visible while banking.
  function fin(a,b,c,paint=dark,thickness=.025) {
    const front=[a,b,c].map(p=>[p[0],p[1],p[2]+thickness]);
    const back=[a,b,c].map(p=>[p[0],p[1],p[2]-thickness]);
    triangle(front[0],front[1],front[2],paint);triangle(back[2],back[1],back[0],paint);
    for(let i=0;i<3;i++){const j=(i+1)%3;triangle(front[i],back[i],back[j],paint);triangle(front[i],back[j],front[j],paint);}
  }
  // Curved fin membrane with a soft raised middle; closed thickness around the rim.
  function leafFin(root,tip,end,paint=dark,thickness=.009) {
    const boundary=[],center=root.map((v,i)=>(v+tip[i]+end[i])/3);
    for(const [from,to,bulge] of [[root,tip,.07],[tip,end,.045],[end,root,-.025]])for(let step=0;step<6;step++) {
      const t=step/6,point=from.map((v,i)=>v*(1-t)+to[i]*t);
      point[1]+=Math.sin(t*Math.PI)*bulge;boundary.push(point);
    }
    if(boundary.reduce((sum,p,i)=>{const q=boundary[(i+1)%boundary.length];return sum+p[0]*q[1]-q[0]*p[1];},0)<0)boundary.reverse();
    const count=boundary.length;
    for(let i=0;i<count;i++) {
      const j=(i+1)%count,a=boundary[i],b=boundary[j];
      const frontA=[a[0],a[1],a[2]+thickness*.2],frontB=[b[0],b[1],b[2]+thickness*.2],frontC=[center[0],center[1],center[2]+thickness];
      const backA=[a[0],a[1],a[2]-thickness*.2],backB=[b[0],b[1],b[2]-thickness*.2],backC=[center[0],center[1],center[2]-thickness];
      const rayA=[i/count,1,-1],rayB=[(i+1)/count,1,-1],rayC=[(i+.5)/count,0,-1];
      triangle(frontC,frontA,frontB,paint,[rayC,rayA,rayB]);triangle(backC,backB,backA,paint,[rayC,rayB,rayA]);
      triangle(frontA,backA,backB,paint);triangle(frontA,backB,frontB,paint);
    }
  }
  function fanTail(base,height,paint) {
    const root=[base+.04,0,0],count=24;
    for(let step=0;step<count;step++) {
      const edge=i=>{const a=i/count*Math.PI;return [base-.55*Math.pow(Math.sin(a),.8),Math.cos(a)*height,Math.sin(a)*.014];};
      const a=edge(step),b=edge(step+1),shade=paint.map((v,i)=>v*(.85+.15*Math.sin(step/count*Math.PI))+(i===0?.12:0));
      const front=p=>[p[0],p[1],p[2]+.009],back=p=>[p[0],p[1],p[2]-.009];
      const rayA=[step/count,1,-1],rayB=[(step+1)/count,1,-1],rayC=[(step+.5)/count,0,-1];
      triangle(front(root),front(a),front(b),shade,[rayC,rayA,rayB]);triangle(back(root),back(b),back(a),shade,[rayC,rayB,rayA]);
      triangle(front(a),back(a),back(b),shade);triangle(front(a),back(b),front(b),shade);
    }
  }
  function eye(x,y,z,size=.045) {
    ellipsoid([x,y,z],[size,size,size*.62],[.55,.43,.15],6,10,false);
    ellipsoid([x+.007,y,z+Math.sign(z)*size*.48],[size*.8,size*.8,size*.42],[.018,.028,.025],6,10,false);
    ellipsoid([x+.014,y+size*.26,z+Math.sign(z)*size*.8],[size*.16,size*.16,size*.1],[.8,.92,.93],4,6,false);
  }
  function pairedEyes(x=.36,y=.1,z=.25,size=.09){eye(x,y,z,size);eye(x,y,-z,size);}
  function chain(points,radius,paint=color) { for(const p of points)ellipsoid(p,[radius,radius,radius],paint,5,8); }
  if(family==='ray') {
    ellipsoid([0,0,0],[.55,.18,.48],color);
    fin([.18,0,.23],[-.42,.015,.22],[-.08,.025,.95],color,.03);
    fin([.18,0,-.23],[-.42,.015,-.22],[-.08,.025,-.95],color,.03);
    ellipsoid([-.74,0,0],[.42,.05,.05],dark);pairedEyes(.29,.13,.14,.055);
  } else if(family==='turtle') {
    ellipsoid([-.08,0,0],[.6,.31,.46],dark,12,18,true);ellipsoid([.55,-.02,0],[.24,.17,.2],color);
    for(const side of [-1,1]) for(const x of [-.37,.25])ellipsoid([x,-.08,side*.48],[.22,.09,.24],color,6,10);
    pairedEyes(.62,.065,.17,.065);
  } else if(family==='octopus') {
    ellipsoid([0,.24,0],[.33,.46,.31],color);pairedEyes(.12,.13,.24,.075);
    for(let arm=0;arm<8;arm++){const angle=arm/8*Math.PI*2;
      const points=Array.from({length:7},(_,i)=>[Math.cos(angle)*(.15+i*.075),-.03-i*.09,Math.sin(angle)*(.15+i*.075)]);
      chain(points,.065,color);}
  } else if(family==='jelly') {
    ellipsoid([0,.24,0],[.4,.3,.36],color);pairedEyes(.12,.18,.31,.045);
    for(let arm=0;arm<7;arm++){const angle=arm/7*Math.PI*2;chain(Array.from({length:7},(_,i)=>[Math.cos(angle)*.22,-i*.09,Math.sin(angle)*.22]),.025,pale);}
  } else if(family==='crab'||family==='shrimp') {
    ellipsoid([0,0,0],family==='crab'?[.32,.2,.36]:[.62,.15,.18],color);
    for(const side of [-1,1])for(let leg=0;leg<4;leg++)chain([[-.3+leg*.2,-.03,side*.14],[-.32+leg*.2,-.18,side*.34],[-.26+leg*.2,-.22,side*.47]],.027,dark);
    if(family==='crab')for(const side of [-1,1]){ellipsoid([.3,.03,side*.43],[.21,.1,.14],color,6,10);}
    pairedEyes(family==='crab'?.25:.52,.16,.11,.055);
  } else if(family==='star') {
    ellipsoid([0,0,0],[.23,.08,.23],color,6,10);
    for(let arm=0;arm<5;arm++){const a=arm/5*Math.PI*2;chain(Array.from({length:6},(_,i)=>[Math.cos(a)*i*.1,0,Math.sin(a)*i*.1]),.065,color);}
  } else if(family==='frog') {
    ellipsoid([-.1,0,0],[.45,.22,.33],color);ellipsoid([.3,.04,0],[.3,.23,.29],color);
    for(const side of [-1,1]){ellipsoid([-.36,-.13,side*.31],[.25,.11,.21],dark);ellipsoid([.24,-.2,side*.32],[.13,.08,.2],color);}
    pairedEyes(.34,.23,.22,.085);
  } else if(family==='seahorse') {
    chain(Array.from({length:10},(_,i)=>[Math.sin(i*.16)*.25,-.42+i*.08,0]),.12,color);
    ellipsoid([.1,.45,0],[.19,.18,.14],color,8,12);ellipsoid([.3,.43,0],[.19,.055,.06],color,6,10);
    pairedEyes(.17,.51,.13,.05);
    const curl=Array.from({length:13},(_,i)=>{const a=i/12*Math.PI*1.9,r=.2-i*.008;return [-.08+Math.cos(a)*r,-.42+Math.sin(a)*r,0];});chain(curl,.035,color);
    leafFin([-.05,.1,0],[-.36,.12,0],[-.04,-.12,0],dark,.018);
  } else if(family==='squid') {
    fishBody(1.15,.22,.22,'eel');
    for(const side of [-1,1])leafFin([.05,side*.16,0],[.5,side*.36,0],[.52,0,0],color,.018);
    for(let arm=0;arm<8;arm++){const a=arm/8*Math.PI*2;chain(Array.from({length:7},(_,i)=>[-.46-i*.07,Math.cos(a)*(.1+i*.035),Math.sin(a)*(.1+i*.035)]),.025,pale);}
    pairedEyes(-.27,.07,.21,.06);
  } else if(family==='eggs') {
    for(const p of [[0,.13,0],[-.25,-.1,.02],[.25,-.1,0],[0,-.1,-.17]]){ellipsoid(p,[.19,.19,.19],pale);ellipsoid(p,[.075,.075,.075],color,6,10);}
  } else {
    const long=family==='eel',round=speciesId==='pufferfish'||speciesId==='ocean-sunfish';
    const shark=family==='shark',mammal=family==='mammal',flounder=speciesId==='flounder';
    if(round)ellipsoid([.02,0,0],[.42,.4,.35],color,12,18);
    else fishBody(long?1.64:speciesId==='goldfish'?1.2:1.28,long?.13:flounder?.11:shark?.25:speciesId==='goldfish'?.34:/fry|guppy|tetra|minnow|medaka|sardine|anchovy/.test(speciesId)?.19:.29,long?.15:flounder?.4:shark?.29:.23,long?'eel':shark?'shark':'fish',28,24);
    const base=long?-.71:-.53,tip=long?-1.04:-1.02;
    if(speciesId==='betta')fanTail(base,.48,color);
    else if(mammal){for(const side of [-1,1])leafFin([base,0,0],[tip,.015,side*.37],[tip+.19,.015,side*.05],dark,.012);}
    else{for(const side of [-1,1])leafFin([base,0,0],[tip,side*.37,0],[tip+.22,side*.06,0],dark,.035);}
    if(!long&&!round){leafFin([-.27,.17,0],[.03,shark?.59:.46,0],[.24,.17,0],dark,.025);}
    for(const side of [-1,1]){leafFin([.08,-.02,side*.12],[-.2,-.21,side*.48],[.21,-.12,side*.24],color,.02);}
    pairedEyes(long?.61:round?.28:.43,round?.12:.055,long?.1:round?.3:.16,long?.035:.044);
    // Operculum/gill slit follows both sides of the shoulder, rather than a printed facial sticker.
    const gillHeight=speciesId==='goldfish'?.27:/fry|guppy|tetra|sardine|anchovy/.test(speciesId)?.14:.22;
    if(!long&&!round&&!mammal)for(const side of [-1,1]) {
      const count=shark?4:1;
      for(let slit=0;slit<count;slit++)for(let step=0;step<10;step++) {
        const a=(-.7+step/9*1.4),x=.21-slit*.055-.025*Math.cos(a);
        ellipsoid([x,Math.sin(a)*gillHeight-.02,side*(.215*Math.cos(a))],[.007,.014,.007],dark,3,6,false);
      }
    }
    ellipsoid([long?.81:round?.42:speciesId==='goldfish'?.59:.63,-.032,0],[.012,round?.038:.023,.036],[.14,.08,.07],5,10,false);
    if(speciesId==='swordfish'||speciesId==='sailfish'||speciesId==='alligator-gar')ellipsoid([.85,.015,0],[.42,.035,.04],dark,6,10);
    if(speciesId==='goldfish'){for(const side of [-1,1])leafFin([base,0,0],[-1.1,side*.49,0],[-1.02,side*.05,0],color,.012);}
  }
  return {family,vertices:new Float32Array(vertices),stride:12,vertexCount:vertices.length/12};
}

export function familyFor(id) {
  if(id==='fish-eggs'||id==='plankton'||id==='water-flea')return 'eggs';
  if(id.includes('jellyfish'))return 'jelly';
  if(id.includes('seahorse'))return 'seahorse';
  if(/cuttlefish|squid/.test(id))return 'squid';
  if(id.includes('octopus')||id==='kraken')return 'octopus';
  if(id.includes('turtle'))return 'turtle';
  if(id.includes('starfish'))return 'star';
  if(id.includes('crab')||id==='crayfish')return 'crab';
  if(id.includes('shrimp'))return 'shrimp';
  if(id.includes('frog'))return 'frog';
  if(id==='manta-ray')return 'ray';
  if(/eel|hairtail|loach|larva|basilosaurus|leviathan|jiaolong|sea-dragon/.test(id))return 'eel';
  if(/shark|megalodon/.test(id))return 'shark';
  if(/whale|dolphin|orca|seal|sea-lion|kun/.test(id))return 'mammal';
  return 'fish';
}

export function paletteFor(id,index) {
  if(id==='mission-red')return [.93,.14,.09];
  if(id==='mission-blue')return [.04,.4,.94];
  if(id==='mission-yellow')return [1,.73,.035];
  if(id==='mission-green')return [.13,.69,.25];
  if(/shark|dolphin|whale|seal|sea-lion|hairtail|icefish|sardine|anchovy|mackerel|saury|herring|tuna/.test(id))return [.27,.53,.67];
  if(id==='orca')return [.065,.14,.19];
  if(id==='goldfish'||/shrimp|crab|crayfish/.test(id))return [.98,.43,.12];
  if(id==='betta')return [.27,.29,.89];
  if(/carp|gudgeon|bitterling|sturgeon/.test(id))return [.48,.48,.22];
  if(/grouper|mandarin|perch|bass/.test(id))return [.67,.49,.18];
  if(/eel|loach/.test(id))return [.37,.29,.18];
  if(/frog|turtle/.test(id))return [.27,.59,.28];
  if(/tetra|zebrafish|guppy/.test(id))return [.24,.69,.79];
  const palette=[[.29,.7,.82],[.91,.61,.23],[.66,.42,.84],[.36,.68,.47],[.94,.47,.48],[.35,.59,.9]];
  return palette[index%palette.length];
}

/** Row-major tiles in the original, unmodified 4x4 imagegen albedo atlas. */
export function skinTileFor(id) {
  if(id.startsWith('mission-'))return -1;
  if(id==='goldfish'||id==='small-yellow-croaker')return 0;
  if(id==='zebrafish')return 2;
  if(id==='guppy')return 3;
  if(/tetra/.test(id))return 4;
  if(id==='betta')return 5;
  if(/carp|gudgeon|bitterling|sturgeon/.test(id))return 6;
  if(/mandarin|grouper|bass|snakehead|puffer/.test(id))return 7;
  if(/shark|megalodon/.test(id))return 8;
  if(/tuna|mackerel|salmon|swordfish|sailfish/.test(id))return 9;
  if(/eel|loach|larva|leviathan|jiaolong|sea-dragon/.test(id))return 10;
  if(id==='orca')return 11;
  if(/whale|dolphin|seal|sea-lion|basilosaurus|kun/.test(id))return 12;
  if(/octopus|squid|cuttlefish|crab|shrimp|crayfish|starfish|kraken/.test(id))return 13;
  if(/turtle|frog|seahorse/.test(id))return 14;
  if(id==='manta-ray')return 15;
  return 1;
}

// Growth-size window; each species is assigned to the nearest transformation anchor.
export function oceanSizeLevel(artIndex,anchors=[2,9,15,16,27,36,42,51,67,69,70,80,81,82,83,84,85,86,87,88]) {
  let level=0;
  for(let i=1;i<anchors.length;i++)if(Math.abs(anchors[i]-artIndex)<Math.abs(anchors[level]-artIndex))level=i;
  return level;
}
