import * as THREE from '../vendor/three.module.min.js';
import {CORNERS} from './simulation.mjs';
import {randomStream,EVENTS,pointOnPath,pathLength,signalAt} from './halloween-model.mjs';
import {witchAt,storyAt,ACTIVATIONS,DURATION} from './halloween-story.mjs';
export function makeNightScene(plateau,osm,nav,region={buildings:[]}){
 const scene=new THREE.Scene(),color=new THREE.Color(),rand=randomStream(31);
 const sky=document.createElement('canvas');sky.width=4;sky.height=512;const sk=sky.getContext('2d'),gradient=sk.createLinearGradient(0,0,0,512);gradient.addColorStop(0,'#080d26');gradient.addColorStop(.6,'#272042');gradient.addColorStop(1,'#654263');sk.fillStyle=gradient;sk.fillRect(0,0,4,512);scene.background=new THREE.CanvasTexture(sky);scene.fog=new THREE.FogExp2(0x29213e,.00016);
 scene.add(new THREE.HemisphereLight(0x9fafff,0x343054,2.0));const moonlight=new THREE.DirectionalLight(0xb5beff,2.6);moonlight.position.set(-140,260,-70);scene.add(moonlight);const amber=new THREE.DirectionalLight(0xffaf64,1.1);amber.position.set(20,60,130);scene.add(amber);
 const standard=(hex,emissive=0,intensity=0)=>new THREE.MeshStandardMaterial({color:hex,emissive,emissiveIntensity:intensity,roughness:.78});
 const basic=(hex,opacity=1)=>new THREE.MeshBasicMaterial({color:hex,transparent:opacity<1,opacity});
 const box=new THREE.BoxGeometry(1,1,1),sphere=new THREE.SphereGeometry(1,16,12);
 const mesh=(g,m,x,y,z,parent=scene)=>{const o=new THREE.Mesh(g,m);o.position.set(x,y,z);parent.add(o);return o;};
 const cube=(x,y,z,w,h,d,m,parent)=>{const o=mesh(box,m,x,y,z,parent);o.scale.set(w,h,d);return o;};
 cube(0,-.8,0,7000,1.5,7000,standard(0x23243a));
 function merge(parts,material,uvs=false){const positions=[],normals=[],colors=[],uv=[];for(const[g,hex]of parts){const a=g.index?g.toNonIndexed():g,p=a.attributes.position,n=a.attributes.normal;color.setHex(hex);for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),ny=n.getY(i);positions.push(x,y,z);normals.push(n.getX(i),ny,n.getZ(i));colors.push(color.r,color.g,color.b);if(uvs)uv.push(Math.abs(ny)>.5?.001:(Math.abs(n.getX(i))>.5?z:x)/21,Math.abs(ny)>.5?.001:y/24);}if(a!==g)a.dispose();g.dispose();}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));if(uvs)g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));return mesh(g,material,0,0,0);}
 // Exactly the day viewer's footprint extrusion: no building vertex is reshaped.
 const parts=[];for(let i=0;i<plateau.buildings.length;i++){const b=plateau.buildings[i],cx=b.ring.reduce((v,p)=>v+p[0],0)/b.ring.length,cz=b.ring.reduce((v,p)=>v+p[1],0)/b.ring.length;if((b.height>65&&cz< -5&&Math.hypot(cx,cz)<180)||Math.hypot(cx,cz)>260||((cx < -35 && cz < -35)||(cz < -27 && cx <40 && cx> -130)))continue;const shape=new THREE.Shape();b.ring.forEach(([x,z],k)=>k?shape.lineTo(x,-z):shape.moveTo(x,-z));const g=new THREE.ExtrudeGeometry(shape,{depth:b.height,bevelEnabled:false,steps:1});g.rotateX(-Math.PI/2);parts.push([g,[0x333351,0x47365e,0x373d60,0x534369,0x343550][i%5]]);}
 // Authored repeat texture; its dark border also masks horizontal roof faces.
 const windows=document.createElement('canvas');windows.width=128;windows.height=128;const ink=windows.getContext('2d');ink.fillStyle='#000';ink.fillRect(0,0,128,128);for(let x=0;x<4;x++)for(let y=0;y<4;y++){ink.fillStyle=rand()<.72?['#ffd57d','#ffe7ac','#ce904e'][Math.floor(rand()*3)]:'#090918';ink.fillRect(x*32+10,y*32+9,14,18);}const windowTexture=new THREE.CanvasTexture(windows);windowTexture.wrapS=windowTexture.wrapT=THREE.RepeatWrapping;
 const buildings=merge(parts,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.85,emissive:0xffde9a,emissiveMap:windowTexture,emissiveIntensity:1.1}),true);
 scene.add(new THREE.LineSegments(new THREE.EdgesGeometry(buildings.geometry,28),new THREE.LineBasicMaterial({color:0xc6c0eb,transparent:true,opacity:.10})));
 const roads=[],stripes=[];
 function ribbon(points,width,y,hex,list=roads){for(let k=1;k<points.length;k++){const a=points[k-1],b=points[k],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<.1)continue;const g=box.clone();g.scale(width,.08,len+.3);g.rotateY(Math.atan2(b[0]-a[0],b[1]-a[1]));g.translate((a[0]+b[0])/2,y,(a[1]+b[1])/2);list.push([g,hex]);}}
 for(const r of osm.roads){if(Number(r.tags.layer||0)<0||r.tags.indoor==='yes'||r.tags.tunnel==='yes')continue;const foot=['footway','path','pedestrian','steps'].includes(r.kind);if(r.tags.footway==='crossing'&&r.tags.crossing==='traffic_signals'){const a=r.points[0],b=r.points.at(-1),dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(Math.hypot(...a)<55&&Math.hypot(...b)<55)for(let s=1;s<len-1;s+=1.9){const g=box.clone();g.scale(5.5,.05,.72);g.rotateY(Math.atan2(dx,dz));g.translate(a[0]+dx*s/len,.24,a[1]+dz*s/len);stripes.push([g,0xf3e5c3]);}continue;}const width=foot?(r.kind==='pedestrian'?7:2.8):Math.min(22,Number(r.tags.lanes||1)*3.3+1);ribbon(r.points,width,foot?.08:.14,foot?0x515166:0x12182d);if(!foot&&width>7)ribbon(r.points,.16,.2,0xa98d5d,stripes);}
 ribbon([CORNERS[0],CORNERS[3]],7,.16,0x262d44);merge(roads,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));merge(stripes,new THREE.MeshStandardMaterial({vertexColors:true,emissive:0x6e5f4b,emissiveIntensity:.3}));
 const rails=[];for(const r of osm.railways){if(Number(r.tags.layer||0)<0)continue;for(const off of[-.75,.75])ribbon(r.points.map(([x,z])=>[x+off,z]),.13,6,0x9692b2,rails);}merge(rails,new THREE.MeshStandardMaterial({vertexColors:true,metalness:.5,roughness:.5}));
 // Authored circular street-light pools use alpha textures, not expensive shadows.
 function glowTexture(hex){const c=document.createElement('canvas');c.width=c.height=64;const k=c.getContext('2d'),g=k.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,hex);g.addColorStop(1,'transparent');k.fillStyle=g;k.fillRect(0,0,64,64);return new THREE.CanvasTexture(c);}
 const warmGlow=glowTexture('#ffc57c'),coolGlow=glowTexture('#55dfff'),purpleGlow=glowTexture('#d99aff');
 const pool=(x,z,size,texture,opacity=.5)=>{const o=mesh(new THREE.PlaneGeometry(size,size),new THREE.MeshBasicMaterial({map:texture,transparent:true,opacity,depthWrite:false}),x,.35,z);o.rotation.x=-Math.PI/2;return o;};
 for(const p of [[-34,-31],[23,-30],[-42,23],[27,25],[-66,-55],[-90,-71],[-62,57],[39,69],[69,-24],[9,62]]){const[x,z]=nav.point(nav.nearest(p,nav.fields[0]));cube(x,4.5,z,.23,9,.23,standard(0x9c8eae));cube(x+1,9,z,2.5,.18,.2,standard(0x9c8eae));const bulb=mesh(sphere,basic(0xffdda3),x+2,8.8,z);bulb.scale.set(.55,.3,.55);pool(x+2,z,18,warmGlow,.6);}
 const treeColors=[0xd96834,0xeb963c,0xaf354c,0xcb4f31];for(let i=0;i<22;i++){const a=i/22*Math.PI*2,p=nav.point(nav.nearest([Math.cos(a)*(48+i%3*19),Math.sin(a)*(48+i%3*19)],nav.fields[0])),[x,z]=p;mesh(new THREE.CylinderGeometry(.4,.6,5,7),standard(0x624453),x,2.5,z);const canopy=mesh(sphere,standard(treeColors[i%4]),x,6,z);canopy.scale.set(3.7,3.4,3.7);}
 function pumpkin(x,z,s){const g=new THREE.Group();g.position.set(x,0,z);g.scale.setScalar(s);scene.add(g);const orange=standard(0xe97a24,0xbb3a08,.3),dark=standard(0x746643);for(let i=0;i<8;i++){const a=i*Math.PI/4,o=mesh(sphere,orange,Math.cos(a)*.45,1.15,Math.sin(a)*.45,g);o.scale.set(.84,1.04,.84);}mesh(new THREE.CylinderGeometry(.13,.23,.65,5),dark,0,2.35,0,g);const face=basic(0xffe69b);for(const x of[-.43,.43]){const o=mesh(new THREE.ConeGeometry(.28,.45,3),face,x,1.45,-1.1,g);o.rotation.x=-.1;}cube(0,.87,-1.23,.9,.16,.04,face,g);pool(x,z,7*s,warmGlow,.3);return g;}
 for(const[x,z,s]of[[-41,-34,2.2],[-46,-34,1.4],[31,-24,1.5],[32,30,1.7],[-73,-66,1.5],[-94,50,1.8]])pumpkin(x,z,s);
 const ghosts=[];for(const[x,y,z]of[[-44,10,-40],[36,11,25],[-83,15,49]]){const group=new THREE.Group();group.position.set(x,y,z);scene.add(group);const sheet=standard(0xdedbff,0xb9b1ef,.35),head=mesh(sphere,sheet,0,1,0,group);head.scale.set(2.1,2.5,1.7);mesh(new THREE.CylinderGeometry(1.8,2.3,2.4,12),sheet,0,-.6,0,group);for(const x of[-.65,.65]){const eye=mesh(sphere,basic(0x25243e),x,1.4,-1.55,group);eye.scale.set(.22,.35,.13);}ghosts.push({group,y});}
 const kettle=new THREE.Group();kettle.position.set(26,0,14);kettle.scale.setScalar(1.25);scene.add(kettle);const pot=mesh(new THREE.SphereGeometry(1,18,14,0,Math.PI*2,.8,Math.PI-.8),standard(0x29293e),0,2,0,kettle);pot.scale.set(2.8,2.3,2.8);const rim=mesh(new THREE.TorusGeometry(2.15,.25,8,24),standard(0x78708e),0,3.6,0,kettle);rim.rotation.x=Math.PI/2;const brew=mesh(new THREE.CircleGeometry(2,24),basic(0x8fffae),0,3.61,0,kettle);brew.rotation.x=-Math.PI/2;for(const x of[-2,2])cube(x,.7,0,.5,1.5,.5,standard(0x25233a),kettle);pool(26,14,18,coolGlow,.65);
 const bubbles=[];for(let i=0;i<9;i++){const m=mesh(sphere,basic(0xb0ffc4,.65),(rand()-.5)*3,4+rand()*8,(rand()-.5)*3,kettle);m.scale.setScalar(.35+rand()*.35);bubbles.push(m);}
 const witch=new THREE.Group();scene.add(witch);const purple=standard(0x8b62ca),hatMat=standard(0x302045),skin=standard(0xffd2b1);
 const dress=mesh(new THREE.ConeGeometry(2,5,10),purple,0,1,0,witch);dress.rotation.z=-.45;mesh(sphere,skin,-1,4.5,0,witch).scale.setScalar(1.55);const brim=mesh(new THREE.CylinderGeometry(2,2,.15,16),hatMat,-1,6,0,witch);brim.rotation.z=.15;mesh(new THREE.ConeGeometry(1.35,3.7,12),hatMat,-1.3,7.7,0,witch).rotation.z=.2;const broom=mesh(new THREE.CylinderGeometry(.13,.13,14,7),standard(0xba8854),0,-.3,0,witch);broom.rotation.z=Math.PI/2;const bristles=mesh(new THREE.ConeGeometry(1.3,4.5,9),standard(0xf3bf58),5,-.3,0,witch);bristles.rotation.z=Math.PI/2;cube(-2,-1,0,4,.55,.6,hatMat,witch);
 // Small facial features and hat trim make the close pass readable on a phone.
 mesh(new THREE.CylinderGeometry(1.39,1.7,.5,12),standard(0xffb95f),-1.1,6.45,0,witch);
 for(const x of[-1.5,-.5])mesh(sphere,basic(0x302045),x,4.8,-1.4,witch).scale.set(.18,.27,.13);
 for(const x of[-1.9,-.1])mesh(sphere,basic(0xf2a3c2),x,4.3,-1.24,witch).scale.set(.27,.16,.1);
 const smile=mesh(new THREE.TorusGeometry(.25,.055,5,12,Math.PI),basic(0x66334e),-1,4.2,-1.52,witch);smile.rotation.z=Math.PI;
 mesh(sphere,standard(0xd39bf2),-2,2,-.5,witch).scale.set(.55,.65,.55);
 const trailCount=110,trailPos=new Float32Array(trailCount*3),trailGeometry=new THREE.BufferGeometry();trailGeometry.setAttribute('position',new THREE.BufferAttribute(trailPos,3));const trail=new THREE.Points(trailGeometry,new THREE.PointsMaterial({map:purpleGlow,color:0xe4a7ff,size:1.5,transparent:true,opacity:.7,depthWrite:false,blending:THREE.AdditiveBlending}));scene.add(trail);
 const moon=mesh(sphere,basic(0xffe5b7),-155,205,120);moon.scale.setScalar(14);
 // Separate regional LOD: one actual source building per 84m tile, tallest wins.
 const far=new THREE.Group();scene.add(far);const tiles=new Map();
 for(const b of region.buildings){const xs=b.ring.map(p=>p[0]),zs=b.ring.map(p=>p[1]),x=(Math.min(...xs)+Math.max(...xs))/2,z=(Math.min(...zs)+Math.max(...zs))/2;if(Math.hypot(x,z)<260)continue;const key=`${Math.floor(x/84)},${Math.floor(z/84)}`;if(!tiles.has(key)||tiles.get(key).b.height<b.height)tiles.set(key,{b,x,z,w:Math.max(...xs)-Math.min(...xs),d:Math.max(...zs)-Math.min(...zs)});}
 const farParts=[];for(const {b,x,z,w,d} of tiles.values()){const g=box.clone();g.scale(Math.max(5,w),b.height,Math.max(5,d));g.translate(x,b.height/2,z);farParts.push([g,[0x33354d,0x443451,0x334354][farParts.length%3]]);}
 if(farParts.length){const m=merge(farParts,new THREE.MeshStandardMaterial({vertexColors:true,emissive:0xffd49b,emissiveMap:windowTexture,emissiveIntensity:.65}),true);far.add(m);}
 // Landmark composition: station, elevated railway, Hachiko meeting square.
 const station=standard(0x5c5278,0x6d408f,.25),steel=standard(0x8b88a5),warm=basic(0xffdc87);
 cube(67,8,63,34,16,90,station);cube(67,17,63,38,2,96,standard(0x9064ae));
 for(let z=28;z<105;z+=12)cube(48.8,7,z,.3,8,7,warm);
 const localTrack=[];ribbon([[57,-310],[57,280]],13,23,0x57536e,localTrack);merge(localTrack,standard(0x57536e));
 for(const off of[-4,4])cube(57+off,23.7,-10,.45,.3,520,basic(0xafb0d1));
 for(let z=-280;z<280;z+=34){cube(57,11,z,1.8,22,2,steel);cube(57,23.5,z,12,.4,1,steel);}
 const square=cube(-11,.2,34,29,.15,18,standard(0x655270));
 const pedestal=cube(-9,1,32,3,2,3,standard(0x8d789a));
 // Original toy dog silhouette: no scanned sculpture or real facility branding.
 mesh(sphere,standard(0xb9986f),-9,2.7,32).scale.set(.8,1.1,.65);mesh(sphere,standard(0xc6a476),-9,3.8,31.8).scale.set(.65,.65,.65);
 for(const x of[-9.5,-8.5])mesh(new THREE.ConeGeometry(.3,.65,5),standard(0xa88665),x,4.4,31.8);
 for(const x of[-9.8,-8.2])cube(x,2,32,.3,1.8,.3,standard(0xb9986f));
 function sign(x,y,z,w,h,text,sub,hex,rotation=0){const c=document.createElement('canvas');c.width=512;c.height=256;const d=c.getContext('2d');d.fillStyle=hex;d.fillRect(0,0,512,256);d.fillStyle='#fff1cb';d.font='bold 66px Noto Sans CJK JP';d.fillText(text,26,98);d.font='28px Noto Sans CJK JP';d.fillText(sub,28,159);d.fillStyle='#f6bf55';for(let i=0;i<7;i++)d.fillRect(27+i*67,205,40,10);const tex=new THREE.CanvasTexture(c),m=mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide}),x,y,z);m.rotation.y=rotation;return m;}
 // Thick authored facade blocks physically carry the original ad screens.
 cube(-48,12,27,5,24,27,standard(0x45395c));
 cube(14,12,-51,31,24,6,standard(0x48405e));
 cube(52,14,-12,6,28,28,standard(0x3c3856));
 sign(-50.8,19,27,23,12,'MOONLIT','BOOKS · NIGHT READ','#7f3fab',-Math.PI/2);
 sign(14,20,-54.1,28,14,'HIDAMARI','PUMPKIN LATTE','#c27037',Math.PI);
 sign(48.8,22,-12,22,19,'AMBER','SWEETS · MOON CAKES','#7059b9',-Math.PI/2);
 sign(48.5,18,34,29,9,'SHIBUYA','STATION', '#293c6a',-Math.PI/2);
 sign(67,18,15,32,10,'SHIBUYA','STATION', '#293c6a',Math.PI);
 sign(-12,6,43,12,4,'HACHIKO','SQUARE','#795b7b',Math.PI);
 const signalHeads=[];for(const[x,z]of[[-26,-17],[20,15],[-20,17],[17,-19]]){cube(x,3,z,.22,6,.22,steel);cube(x,6,z,1.8,3,.8,standard(0x25243d));const red=mesh(sphere,basic(0xff5c8b),x,6.7,z-.5),green=mesh(sphere,basic(0x6dffb9),x,5.4,z-.5);red.scale.set(.8,.8,.65);green.scale.set(.8,.8,.65);signalHeads.push({red,green});}
 // Large crossing-side Halloween pieces, purple/orange pools and festival arch.
 pumpkin(-27,28,3.0);pumpkin(27,-24,2.8);pool(0,0,110,purpleGlow,.35);pool(-24,28,50,warmGlow,.65);
 const greenPools=[[-26,-17],[20,15],[-20,17],[17,-19]].map(([x,z])=>pool(x,z,12,coolGlow,.7));
 const arch=standard(0xa15ce4,0x8e3cd6,.5);for(const x of[-30,-12])cube(x,6,43,1,12,1,arch);cube(-21,12,43,20,1.2,1,arch);
 // Each town has a distinct original miniature attraction, visible from 3km.
 const hubs=EVENTS.map((e,i)=>{
  const g=new THREE.Group();g.position.set(e.position[0],0,e.position[1]);scene.add(g);
  const mat=standard(e.color,e.color,.6),lit=basic(e.color),ground=standard(0x544066),white=basic(0xffe1ab);
  const disk=mesh(new THREE.CylinderGeometry(140,145,8,6),ground,0,4,0,g);
  const ring=mesh(new THREE.TorusGeometry(148,2,5,48),basic(e.color,.5),0,10,0,g);ring.rotation.x=-Math.PI/2;
  const p=pool(e.position[0],e.position[1],760,[warmGlow,purpleGlow,coolGlow,warmGlow,purpleGlow][i],.8);scene.remove(p);p.position.set(0,.4,0);g.add(p);
  if(i===0){ // Costume contest: radiant stage + giant witch hat.
   cube(0,14,0,155,22,95,mat,g);for(const x of[-70,70])cube(x,65,25,10,115,12,lit,g);cube(0,123,25,150,10,12,lit,g);
   mesh(new THREE.CylinderGeometry(64,64,9,16),standard(0x33234b),0,35,0,g);mesh(new THREE.ConeGeometry(49,110,12),mat,0,92,0,g);
  }else if(i===1){ // Parade: a serpentine procession with glowing floats.
   for(let j=0;j<11;j++){const x=-105+j*21,z=Math.sin(j*.7)*60;mesh(sphere,j%2?white:lit,x,22,z,g).scale.set(14,14,14);if(j%3===0)mesh(new THREE.ConeGeometry(18,52,6),mat,x,51,z,g);}
  }else if(i===2){ // Lantern garden: round trees and floating ghost lanterns.
   for(let j=0;j<13;j++){const a=j*2.4,r=45+(j%3)*30;cube(Math.cos(a)*r,25,Math.sin(a)*r,3,45,3,ground,g);mesh(sphere,j%3?lit:white,Math.cos(a)*r,64+j%3*13,Math.sin(a)*r,g).scale.set(19,25,19);}
  }else if(i===3){ // Promenade: a tunnel of gold/purple light arches.
   for(let j=0;j<6;j++){const z=-105+j*42;for(const x of[-43,43])cube(x,35,z,5,70,5,lit,g);const arch=mesh(new THREE.TorusGeometry(43,5,5,20,Math.PI),j%2?white:lit,0,70,z,g);}
  }else{ // Food village: orange tent roofs, counters and a pumpkin centrepiece.
   for(let j=0;j<8;j++){const a=j*Math.PI/4,x=Math.cos(a)*99,z=Math.sin(a)*99;cube(x,18,z,40,28,32,mat,g);const roof=mesh(new THREE.ConeGeometry(33,28,4),white,x,45,z,g);roof.rotation.y=Math.PI/4;cube(x,21,z-17,30,9,2,lit,g);}
   mesh(sphere,standard(0xf69a32,0xff7a22,.8),0,32,0,g).scale.set(36,32,36);cube(0,66,0,7,15,7,ground,g);
  }
  const beacon=mesh(new THREE.CylinderGeometry(8,24,240,8),basic(e.color,.20),0,130,0,g);
  mesh(sphere,lit,0,255,0,g).scale.setScalar(21);
  return g;
 });
 // Gapped amber walking guides, visually distinct from continuous railway rails.
 const flowPaths=EVENTS.map(e=>{const path=[[0,0],...e.corridor],v=[];for(let j=0;j<=100;j++){const p=pointOnPath(path,j/100);v.push(new THREE.Vector3(p[0],47,p[1]));}const curve=new THREE.CatmullRomCurve3(v),source=new THREE.TubeGeometry(curve,100,16,6,false).toNonIndexed(),g=new THREE.BufferGeometry();for(const key of ['position','normal','uv']){const attr=source.attributes[key],values=[];for(let j=0;j<100;j++)if(j%4<2)values.push(...attr.array.subarray(j*36*attr.itemSize,(j+1)*36*attr.itemSize));g.setAttribute(key,new THREE.Float32BufferAttribute(values,attr.itemSize));}return mesh(g,basic(e.color,.88),0,0,0);});
 const railPaths=[[[55,75],[140,-450],[330,-900],[220,-1460],[60,-2150],[140,-2650]],[[55,75],[300,460],[700,900],[1000,1420]],[[55,75],[-300,100],[-510,240],[-700,210]]];
 const regionalRails=railPaths.map((path,i)=>{const a=[];ribbon(path,11,11,0x554d73,a);const obj=merge(a,standard(0x554d73));far.add(obj);const light=[];ribbon(path,1.6,12,i===2?0xe88cff:0x7df3c5,light);const l=merge(light,basic(i===2?0xe88cff:0x7df3c5));far.add(l);return obj;});
 const trains=railPaths.map((path,i)=>{const g=new THREE.Group();scene.add(g);for(let j=0;j<3;j++){cube(0,0,j*15,8,5,13,standard(0xc6c6d9),g);cube(-4.1,0,j*15,.2,1.5,11,basic(i===2?0xe3a0ff:0x80f3cb),g);cube(0,0,j*15-6.6,5,2,.2,warm,g);cube(0,2.6,j*15,6,.25,10,basic(i===2?0xe3a0ff:0x80f3cb),g);}return{g,path};});
 // Enlarged schematic station markers and pulses are driven by real rail stages.
 const stationPulses=[[55,75],...EVENTS.filter(e=>e.line!=='walk').map(e=>e.position)].map(([x,z])=>{const g=new THREE.Group();g.position.set(x,15,z);scene.add(g);const r=mesh(new THREE.TorusGeometry(65,5,5,32),basic(0xc4ffe6,.85),0,0,0,g);r.rotation.x=-Math.PI/2;return g;});
 const stationMarker=cube(55,22,75,120,35,80,standard(0x343b61,0x326a65,.12));
 // Batched low-poly costumes. Bodies, hats, capes, arms and pumpkin heads
 // share eight geometry templates; each individual has a smooth heading/bob.
 const costumeTemplates=[];const skinMat=standard(0xffd2ae),palette=[0xb96ae5,0xf39a45,0x6ed6cf,0xec7fa8,0xcac4ff,0x7b8cf0];
 function costume(kind){const g=new THREE.Group(),mat=standard(palette[kind%6]);
  mesh(new THREE.CylinderGeometry(.28,.43,.85,6),mat,0,.98,0,g);
  mesh(new THREE.SphereGeometry(.29,7,5),kind===1?standard(0xf89332):skinMat,0,1.68,0,g);
  for(const x of[-.17,.17])cube(x,.27,0,.18,.55,.23,standard(0x353650),g);
  for(const x of[-.39,.39]){const arm=cube(x,1.04,0,.17,.65,.18,mat,g);arm.rotation.z=x>0?-.2:.2;}
  // Face is toward +z; the renderer preserves heading toward travel direction.
  for(const x of[-.11,.11])mesh(new THREE.SphereGeometry(.045,4,3),basic(0x25203d),x,1.7,.26,g);
  if(kind===0||kind===4){mesh(new THREE.CylinderGeometry(.49,.49,.07,8),standard(0x3b2857),0,1.97,0,g);mesh(new THREE.ConeGeometry(.33,.75,7),standard(0x65408e),0,2.32,0,g);}
  if(kind===1){cube(0,1.58,.28,.2,.06,.04,basic(0xffda7f),g);mesh(new THREE.CylinderGeometry(.06,.1,.18,4),standard(0x725545),0,2.03,0,g);}
  if(kind===2||kind===5){const cape=mesh(new THREE.ConeGeometry(.53,1.1,5),standard(kind===2?0xb85ad5:0xe96a91),0,.92,-.2,g);cape.scale.z=.35;}
  if(kind===4){cube(0,1.4,.38,.38,.22,.15,standard(0x30334c),g);mesh(new THREE.CylinderGeometry(.08,.08,.08,8),basic(0xb4e8ff),0,1.4,.5,g).rotation.x=Math.PI/2;}
  if(kind===3){cube(.48,1.2,.12,.12,.9,.12,standard(0x9d7c56),g);mesh(new THREE.SphereGeometry(.19,6,4),basic(0xffd485),.48,1.8,.12,g);}
  g.updateMatrixWorld(true);const entries=[];g.traverse(o=>{if(!o.isMesh)return;const geo=o.geometry.index?o.geometry.toNonIndexed():o.geometry,p=geo.attributes.position,n=geo.attributes.normal,c=o.material.color;for(let k=0;k<p.count;k++){const v=new THREE.Vector3().fromBufferAttribute(p,k).applyMatrix4(o.matrixWorld),normal=new THREE.Vector3().fromBufferAttribute(n,k).transformDirection(o.matrixWorld);entries.push(v.x,v.y,v.z,normal.x,normal.y,normal.z,c.r,c.g,c.b);}});return new Float32Array(entries);
 }
 for(let k=0;k<6;k++)costumeTemplates.push(costume(k));
 const bodyMeshes=costumeTemplates.map(template=>{const n=template.length/9,g=new THREE.BufferGeometry();for(const[key,offset]of[['position',0],['normal',3],['color',6]]){const arr=new Float32Array(n*3);for(let i=0;i<n;i++)arr.set(template.subarray(i*9+offset,i*9+offset+3),i*3);g.setAttribute(key,new THREE.BufferAttribute(arr,3));}const m=new THREE.InstancedMesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.8}),160);m.count=0;m.frustumCulled=false;scene.add(m);return m;});
 // The same completed individuals gather around the event, rather than stacking
 // into one invisible point. Their marker offsets are schematic, not new people.
 const partyMeshes=bodyMeshes.map(m=>{const o=new THREE.InstancedMesh(m.geometry,m.material,160);o.count=0;o.frustumCulled=false;scene.add(o);return o;});
 // Hue is the measured running peak disk-average density, matching the result.
 // Opacity follows current local counts; neither colour nor opacity uses the event flag.
 const heatCanvas=document.createElement('canvas');heatCanvas.width=heatCanvas.height=128;const heatInk=heatCanvas.getContext('2d'),heatTexture=new THREE.CanvasTexture(heatCanvas),heat=mesh(new THREE.PlaneGeometry(90,90),new THREE.MeshBasicMaterial({map:heatTexture,transparent:true,opacity:.40,depthWrite:false}),0,.28,0);heat.rotation.x=-Math.PI/2;
 const flowCount=1600,flowPos=new Float32Array(flowCount*3),flowCol=new Float32Array(flowCount*3),flowGeo=new THREE.BufferGeometry();flowGeo.setAttribute('position',new THREE.BufferAttribute(flowPos,3));flowGeo.setAttribute('color',new THREE.BufferAttribute(flowCol,3));const flowDots=new THREE.Points(flowGeo,new THREE.PointsMaterial({size:34,vertexColors:true,transparent:true,opacity:.9}));scene.add(flowDots);
 // Authored blueprint uses the source footprints; it remains flat as the city rises.
 const city=new THREE.Group();for(const child of [...scene.children])if(!child.isLight)city.add(child);scene.add(city);
 const blueprint=new THREE.Group();scene.add(blueprint);const bp=[];
 for(let x=-220;x<=220;x+=20){ribbon([[x,-220],[x,220]],.16,.4,0x29495b,bp);ribbon([[-220,x],[220,x]],.16,.4,0x29495b,bp);}
 for(const b of plateau.buildings){if(b.ring.some(p=>Math.hypot(...p)<230))ribbon([...b.ring,b.ring[0]],.36,.7,0x63bcbf,bp);}
 for(const r of osm.roads)if(r.points.some(p=>Math.hypot(...p)<220))ribbon(r.points,.35,.65,r.tags.footway==='crossing'?0xd5ffef:0x396b82,bp);
 const plan=merge(bp,new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:1}));scene.remove(plan);blueprint.add(plan);
 const scan=mesh(new THREE.PlaneGeometry(10,440),basic(0x9affde,.55),-200,1,0,blueprint);scan.rotation.x=-Math.PI/2;
 const bpPeople=new THREE.Points(new THREE.BufferGeometry(),new THREE.PointsMaterial({color:0xff94bd,size:1.1,transparent:true,opacity:.9,depthWrite:false}));bpPeople.geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(960*3),3));blueprint.add(bpPeople);
 const envMaterials=[];city.traverse(o=>{if(o.material&&!envMaterials.some(m=>m.mat===o.material))envMaterials.push({mat:o.material,emission:o.material.emissiveIntensity??0});});
 const daySky=new THREE.Color(0x85b9ce),nightSky=new THREE.Color(0x14152f),duskSky=new THREE.Color(0xc8776c);
 function update(model,seconds,promo){
  seconds%=DURATION;
  const story=storyAt(seconds);
  city.scale.y=.012+.988*story.extrusion;city.visible=story.extrusion>.01;blueprint.visible=story.blueprint>.01;plan.material.opacity=story.blueprint;scan.material.opacity=story.blueprint*.6;scan.position.x=-210+((seconds/DURATION*12)%1)*420;
  envMaterials.forEach(({mat,emission})=>{if('emissiveIntensity' in mat)mat.emissiveIntensity=emission*(1-story.daylight*.93);});
  scene.background=new THREE.Color(nightSky).lerp(daySky,story.daylight).lerp(duskSky,story.dusk*.6);moonlight.intensity=2.6+story.daylight*1.2;amber.intensity=1.1+story.dusk;
  const nearPeople=model.people.filter(p=>!['waiting','gone','event','rail','regional'].includes(p.stage));
  const bpPos=bpPeople.geometry.attributes.position.array;nearPeople.forEach((p,i)=>bpPos.set([p.x,1.2,p.z],i*3));bpPeople.geometry.setDrawRange(0,nearPeople.length);bpPeople.geometry.attributes.position.needsUpdate=true;bpPeople.material.opacity=story.blueprint;
  const counts=[0,0,0,0,0,0],matrix=new THREE.Matrix4(),quat=new THREE.Quaternion(),axis=new THREE.Vector3(0,1,0);for(const p of nearPeople){const kind=p.id%6,bob=Math.sin(seconds/DURATION*Math.PI*2*32+p.phase)*Math.min(.1,Math.hypot(p.vx,p.vz)*.07);quat.setFromAxisAngle(axis,p.heading);matrix.compose(new THREE.Vector3(p.x+p.vx*story.renderFraction,bob,p.z+p.vz*story.renderFraction),quat,new THREE.Vector3(1,1,1));bodyMeshes[kind].setMatrixAt(counts[kind]++,matrix);}bodyMeshes.forEach((m,i)=>{m.count=counts[i];m.instanceMatrix.needsUpdate=true;});
  const partyCounts=[0,0,0,0,0,0];
  for(const p of model.people){if(p.stage!=='event'||seconds<ACTIVATIONS[p.district])continue;const e=EVENTS[p.district],angle=p.id*2.39996,r=180+Math.sqrt((p.id*37)%83)*20,kind=p.id%6;quat.setFromAxisAngle(axis,angle+Math.PI);matrix.compose(new THREE.Vector3(e.position[0]+Math.cos(angle)*r,24+Math.sin(seconds*5+p.phase)*2,e.position[1]+Math.sin(angle)*r),quat,new THREE.Vector3(24,24,24));partyMeshes[kind].setMatrixAt(partyCounts[kind]++,matrix);}
  partyMeshes.forEach((m,i)=>{m.visible=story.regional;m.count=partyCounts[i];m.instanceMatrix.needsUpdate=true;});
  far.visible=story.regional;stationMarker.visible=story.regional;stationPulses.forEach((g,i)=>{const e=i?EVENTS.filter(e=>e.line!=='walk')[i-1]:null,people=model.people.filter(p=>p.stage==='rail'&&(!e||EVENTS[p.district]===e)),pulse=people.some(p=>i?p.journey/EVENTS[p.district].travel_s>.72:p.journey<45);g.visible=story.regional&&pulse;g.scale.setScalar(1+Math.sin(seconds*10+i)*.18);});hubs.forEach((g,i)=>{g.visible=story.regional&&seconds>=ACTIVATIONS[i];const pop=Math.min(1,Math.max(0,(seconds-ACTIVATIONS[i])/.35));g.scale.setScalar(1.6+.8*Math.sin(pop*Math.PI/2));});
  flowPaths.forEach((p,i)=>{const people=model.people.filter(a=>a.district===i&&a.mode==='walk'&&['regional','event'].includes(a.stage));const extent=Math.max(0,...people.map(a=>a.stage==='event'?1:Math.min(1,Math.hypot(a.x,a.z)/Math.hypot(...EVENTS[i].position))));p.visible=story.regional&&seconds>=ACTIVATIONS[i]&&extent>0;p.geometry.setDrawRange(0,Math.floor(Math.min(extent,Math.max(0,(seconds-ACTIVATIONS[i])/.8))*p.geometry.attributes.position.count/3)*3);});
  const bins=new Float32Array(256);for(const p of nearPeople){const x=Math.floor((p.x+45)/90*16),z=Math.floor((p.z+45)/90*16);if(x>=0&&x<16&&z>=0&&z<16)bins[z*16+x]++;}
  const density=model.snapshot().peak_central_count/(Math.PI*24**2),h=Math.max(0,Math.min(1,(density-.26)/.07)),heatColor=[55+200*h,208-173*h,255-167*h].map(Math.round).join(',');
  heatInk.clearRect(0,0,128,128);for(let z=0;z<16;z++)for(let x=0;x<16;x++){const n=bins[z*16+x];if(!n)continue;const c=heatColor,g=heatInk.createRadialGradient(x*8+4,z*8+4,0,x*8+4,z*8+4,13);g.addColorStop(0,`rgba(${c},${Math.min(.9,.2+n*.12)})`);g.addColorStop(1,`rgba(${c},0)`);heatInk.fillStyle=g;heatInk.fillRect(x*8-10,z*8-10,28,28);}heatTexture.needsUpdate=true;
  heat.visible=!story.regional;
  greenPools.forEach(o=>{o.visible=signalAt(model.time)!=='red';o.material.opacity=.45+.2*Math.sin(seconds*8);});
  signalHeads.forEach(({red,green})=>{const phase=signalAt(model.time);red.visible=phase==='red';green.visible=phase!=='red';});
  trains.forEach(({g,path},i)=>{const district=[2,4,0][i],rider=model.people.find(p=>p.stage==='rail'&&p.district===district),phase=rider?rider.journey/EVENTS[district].travel_s:((seconds*.16+i*.29)%1),route=rider?[[55,75],...EVENTS[district].corridor.slice(1)]:path,p=pointOnPath(route,phase),q=pointOnPath(route,Math.min(1,phase+.002));g.visible=story.regional?!!rider:i===0;g.position.set(story.regional?p[0]:57,story.regional?15:27,story.regional?p[1]:-105+210*Math.sin(seconds/DURATION*Math.PI*2));g.scale.setScalar(story.regional?6:1.7);g.rotation.y=story.regional?Math.atan2(q[0]-p[0],q[1]-p[1]):0;});
  let flow=0;
  for(const p of model.people){
   if(!['regional','rail'].includes(p.stage)||!p.redirected||seconds<ACTIVATIONS[p.district])continue;
   const e=EVENTS[p.district],path=p.stage==='rail'?[[55,75],...e.corridor.slice(1)]:e.corridor,total=p.stage==='rail'?e.travel_s:pathLength(path)/p.speed,u=p.journey/total;
   for(let k=0;k<5&&flow<flowCount;k++){const q=pointOnPath(path,Math.max(0,u-k*.012));flowPos.set([q[0]+Math.sin(p.id)*9,54+k*.2,q[1]+Math.cos(p.id)*9],flow*3);color.setHex(p.mode==='walk'?e.color:p.mode==='Yamanote'?0x80f3cb:0xe3a0ff).multiplyScalar(1-k*.16);flowCol.set(color.toArray(),flow*3);flow++;}
  }
  flowGeo.setDrawRange(0,flow);flowDots.visible=story.regional;flowGeo.attributes.position.needsUpdate=true;flowGeo.attributes.color.needsUpdate=true;
  const w=witchAt(seconds);witch.position.set(...w.position);witch.rotation.x=.5;witch.rotation.y=w.yaw;witch.rotation.z=w.roll;witch.scale.setScalar(w.scale);
  for(let i=0;i<trailCount;i++){const delay=i*.025,p=witchAt(seconds-delay).position;trailPos[i*3]=p[0]+Math.sin(i*2.3)*delay;trailPos[i*3+1]=p[1]+Math.sin(i*1.9)*delay;trailPos[i*3+2]=p[2]+Math.cos(i*1.3)*delay;}trailGeometry.attributes.position.needsUpdate=true;
  const phase=seconds/DURATION*Math.PI*2;
  ghosts.forEach((g,i)=>{g.group.position.y=g.y+Math.sin(phase*4+i)*1.2;g.group.rotation.y=Math.sin(phase)*.2;});bubbles.forEach((b,i)=>b.position.y=4+(seconds*1.8+i*.9)%9);

 }
 return{scene,update,buildings,THREE,bodyMeshes,heatCanvas,heatTexture,nearPeople:()=>[],lodCount:tiles.size};
}
