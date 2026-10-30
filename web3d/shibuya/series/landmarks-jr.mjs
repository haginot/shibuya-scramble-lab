// Street-level landmark proxies for the JR編 eye-level walk (route JR-A, alt-routes.json waypoints 1–9), so the
// shot shows what the captions name (QA M5). Generic, signage-free shapes at approximate positions
// (「位置・ルートは概略」 is on screen during the walk):
//   • koban     — small police box beside waypoint 3 (OSM police node 1420789223, research waypoint 3
//                 「渋谷駅前交番の横」): pale walls, lit windows, the red lamp over the door. No text, no emblem.
//   • girder    — light steel fascia girders on both faces of the JR bridge over the passage (OSM 山手線 /
//                 山手貨物線 bridge ways, x≈54–80, z −14…18) + lit underside strips: the 「ガード」 seen from the Scramble.
//   • divider   — white temporary panels down the middle of the east-west passage (the reported one-way divider,
//                 JR-GATE-03; research waypoints 4–8: north lane east, south lane west), x 58–139 at z≈1.5.
//   • road sign — a public street-name plate 「明治通り / Meiji-dori」 at the Miyamasuzaka-shita end (waypoint 6).
// Coordinates: sim metres (x east, z south, y up). One draw call for the solids + one for the street-name plate.
// API: const L = createLandmarks(scene, {shared}); L.group; L.visible = bool; L.anchors {koban, girder, sign}
import * as THREE from '../../vendor/three.module.min.js';
import {common} from '../shaders.mjs';

export const LANDMARKS=Object.freeze({
 koban:{x:37.5,z:12.5,w:5.6,d:4.6,h:3.9,rot:0},
 girder:{z0:-14.5,z1:18.5,y0:4.7,y1:6.5,west:[[54.69,-13.49],[56.58,18.07]],east:[[75.32,-14.39],[79.18,15.63]]},
 divider:{x0:58,x1:139,z:1.5,h:1.0},
 sign:{x:157,z:-12,h:4.6,face:-Math.PI/2},
});

export function createLandmarks(scene,{shared}){
 const group=new THREE.Group();group.name='jr-landmarks';scene.add(group);
 const P=[],N=[],C=[],E=[],I=[];
 const quad=(a,b,c,d,n,col,emit=[0,0,0])=>{const k=P.length/3;for(const v of [a,b,c,d]){P.push(...v);N.push(...n);C.push(...col);E.push(...emit);}I.push(k,k+1,k+2,k,k+2,k+3);};
 // box centred at (cx,cy,cz), size (sx,sy,sz), rotated ry about y
 const box=(cx,cy,cz,sx,sy,sz,col,ry=0,emit,skip={})=>{const c=Math.cos(ry),s=Math.sin(ry),hx=sx/2,hy=sy/2,hz=sz/2;
  const T=(x,y,z)=>[cx+x*c+z*s,cy+y,cz-x*s+z*c],R=(x,y,z)=>[x*c+z*s,y,-x*s+z*c];
  const F={front:[[-hx,-hy,hz],[hx,-hy,hz],[hx,hy,hz],[-hx,hy,hz],[0,0,1]],back:[[hx,-hy,-hz],[-hx,-hy,-hz],[-hx,hy,-hz],[hx,hy,-hz],[0,0,-1]],
   right:[[hx,-hy,hz],[hx,-hy,-hz],[hx,hy,-hz],[hx,hy,hz],[1,0,0]],left:[[-hx,-hy,-hz],[-hx,-hy,hz],[-hx,hy,hz],[-hx,hy,-hz],[-1,0,0]],
   top:[[-hx,hy,hz],[hx,hy,hz],[hx,hy,-hz],[-hx,hy,-hz],[0,1,0]],bottom:[[-hx,-hy,-hz],[hx,-hy,-hz],[hx,-hy,hz],[-hx,-hy,hz],[0,-1,0]]};
  for(const [k,[a,b,cc,d,n]] of Object.entries(F)){if(skip[k])continue;quad(T(...a),T(...b),T(...cc),T(...d),R(...n),col,emit&&emit[k]?emit[k]:emit&&emit.all?emit.all:[0,0,0]);}};
 const anchors={};
 // ---------- koban ----------
 {const K=LANDMARKS.koban,wall=[.4,.39,.37],roof=[.2,.2,.22],win=[.05,.05,.06];
  box(K.x,K.h/2,K.z,K.w,K.h,K.d,wall,K.rot);
  box(K.x,K.h+.15,K.z,K.w+.6,.3,K.d+.6,roof,K.rot);// flat roof slab with eaves
  // lit windows + glass door on the east (path side) and north faces; warm interior light
  const warm=[1.15,1.0,.78];
  box(K.x+K.w/2+.02,1.55,K.z-.9,.04,1.3,1.8,win,0,{all:warm});box(K.x+K.w/2+.02,1.15,K.z+1.05,.04,2.2,1.1,win,0,{all:[.9,.8,.62]});
  box(K.x-.8,1.55,K.z-K.d/2-.02,2.2,1.3,.04,win,0,{all:warm});box(K.x-K.w/2-.02,1.55,K.z,.04,1.3,2.0,win,0,{all:warm});
  // red lamp over the door (box + glow sprite below)
  box(K.x+K.w/2+.25,K.h-.35,K.z+1.05,.36,.36,.36,[.3,0,0],0,{all:[3.6,.18,.12]});
  box(K.x-K.w/2-.25,K.h-.35,K.z-1.2,.36,.36,.36,[.3,0,0],0,{all:[3.6,.18,.12]});
  anchors.koban={x:K.x+K.w/2+.25,y:K.h-.35,z:K.z+1.05};anchors.kobanWest={x:K.x-K.w/2-.25,y:K.h-.35,z:K.z-1.2};}
 // ---------- JR bridge fascia girders ("ガード") + lit underside ----------
 {const G=LANDMARKS.girder,steel=[.36,.37,.4],dark=[.16,.17,.18];
  const xAt=(line,z)=>line[0][0]+(line[1][0]-line[0][0])*(z-line[0][1])/(line[1][1]-line[0][1]);
  for(const [line,off,nx] of [[G.west,-2.6,-1],[G.east,2.6,1]]){const a=[xAt(line,G.z0)+off,G.z0],b=[xAt(line,G.z1)+off,G.z1];
   // fascia plate (web) + bottom flange + rivet/stiffener bands
   quad(...(nx<0?[[a[0],G.y0,a[1]],[b[0],G.y0,b[1]],[b[0],G.y1,b[1]],[a[0],G.y1,a[1]]]:[[b[0],G.y0,b[1]],[a[0],G.y0,a[1]],[a[0],G.y1,a[1]],[b[0],G.y1,b[1]]]),[nx,0,0],steel);
   quad([a[0],G.y0,a[1]],[b[0],G.y0,b[1]],[b[0]-nx*1.2,G.y0,b[1]],[a[0]-nx*1.2,G.y0,a[1]],[0,-1,0],dark);
   const n=Math.round((G.z1-G.z0)/2.4);for(let k=1;k<n;k++){const t=k/n,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t;box(x+nx*.06,(G.y0+G.y1)/2,z,.12,G.y1-G.y0,.16,[.42,.44,.47]);}}
  // underside: dark soffit with warm lamp strips across the passage (lit "tunnel" seen from the Scramble)
  const zs=[-11,-6,-1,4,9,14];for(const z of zs){const xa=xAt(G.west,z)-2.4,xb=xAt(G.east,z)+2.4;
   box((xa+xb)/2,G.y0-.06,z,xb-xa,.08,.2,[.05,.05,.05],0,{bottom:[.85,.78,.62]});}}
 // ---------- passage divider (white panels on feet, small gaps) ----------
 {const D=LANDMARKS.divider,white=[.82,.82,.8],stripe=[.15,.42,.85];
  for(let x=D.x0;x<D.x1-1;x+=2.05){box(x+.95,D.h/2+.12,D.z,1.9,D.h,.06,white);box(x+.95,.82,D.z,1.9,.08,.07,stripe);// blue stripe, no text
   box(x+.1,.06,D.z,.12,.12,.6,[.3,.3,.3]);}
  anchors.divider={x:(D.x0+D.x1)/2,y:1,z:D.z};}
 // ---------- street-name sign pole ----------
 const S=LANDMARKS.sign;box(S.x,S.h/2,S.z,.12,S.h,.12,[.45,.46,.48]);box(S.x,S.h-.25,S.z+.95,.08,.08,1.9,[.45,.46,.48]);
 anchors.sign={x:S.x-.04,y:S.h-.72,z:S.z+1.0};
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(N,3));
 g.setAttribute('aCol',new THREE.Float32BufferAttribute(C,3));g.setAttribute('aEmit',new THREE.Float32BufferAttribute(E,3));g.setIndex(I);
 const mat=new THREE.ShaderMaterial({uniforms:{...shared},side:THREE.DoubleSide,
  vertexShader:/* glsl */`attribute vec3 aCol,aEmit;varying vec3 vWorld,vN,vCol,vEmit;void main(){vN=normal;vCol=aCol;vEmit=aEmit;vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader:/* glsl */`${common}varying vec3 vWorld,vN,vCol,vEmit;void main(){vec3 N=normalize(vN);
   vec3 up=streetLight(vWorld.xz)*exp(-max(0.,vWorld.y-1.)*.22)*(.55+.45*(1.-abs(N.y))+.3*max(0.,N.y));/* lamp light falls off with height */vec3 col=vCol*(vec3(.03,.032,.045)*(1.+.5*N.y)+up)+vEmit;
   gl_FragColor=vec4(applyFog(col,vWorld,cameraPosition),1.);}`});
 const mesh=new THREE.Mesh(g,mat);mesh.frustumCulled=false;group.add(mesh);
 // red-lamp glow (additive sprite) and the street-name plate (public road sign: white words on blue, generated canvas)
 const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture(),color:0xff3020,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));
 glow.position.set(anchors.koban.x,anchors.koban.y,anchors.koban.z);glow.scale.set(2.4,2.4,1);group.add(glow);
 const glow2=glow.clone();glow2.position.set(anchors.kobanWest.x,anchors.kobanWest.y,anchors.kobanWest.z);group.add(glow2);
 const plate=new THREE.Mesh(new THREE.PlaneGeometry(1.8,.62),new THREE.MeshBasicMaterial({map:plateTexture(),color:0x9aa4b0,toneMapped:false}));
 plate.position.set(anchors.sign.x,anchors.sign.y,anchors.sign.z);plate.rotation.y=S.face;group.add(plate);
 return {group,anchors,mesh,set visible(v){group.visible=v;},get visible(){return group.visible;}};
}

function glowTexture(){const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');const g=x.createRadialGradient(32,32,0,32,32,32);
 g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.25,'rgba(255,255,255,.55)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,64,64);return new THREE.CanvasTexture(c);}
function plateTexture(){const c=document.createElement('canvas');c.width=360;c.height=124;const x=c.getContext('2d');
 x.fillStyle='#0d3d9a';x.fillRect(0,0,360,124);x.strokeStyle='#fff';x.lineWidth=5;x.strokeRect(6,6,348,112);
 x.fillStyle='#fff';x.textAlign='center';x.font='700 54px "Noto Sans CJK JP",sans-serif';if(document.body?.classList.contains('lang-en'))x.fillText('Meiji-dori',180,80);// v11.1 EN: English only
 else{x.fillText('明治通り',180,68);x.font='600 26px "Noto Sans CJK JP",sans-serif';x.fillText('Meiji-dori',180,104);}
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;// dim it to street level (unlit plate in the dark)
 return t;}
