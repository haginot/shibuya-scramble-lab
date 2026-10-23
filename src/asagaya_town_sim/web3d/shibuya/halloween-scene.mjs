// Halloween night dressing for the 3D view, placed from the solver's own
// Halloween layout (worker init reply): police officers with lit batons, the
// "DJ police" command vehicle with a megaphone, crowd barriers and cone bars,
// one-way arrows, jack-o'-lanterns, costume photo spots, street performers,
// trash/recycling stations, extra coloured light in the baked street-light
// field, and the density heat map used by the dispersal comparison.
// Everything is procedural; no brand names, logos or external assets.
import * as THREE from '../vendor/three.module.min.js';
import {shared,common} from './shaders.mjs';
import {CostumeCrowd,POLICE,STAFF,PERFORMER} from './costume.mjs';

const DECK=2.3;// platform deck height of the DJ police vehicle (m)
const FONT='"Noto Sans CJK JP","Noto Sans JP","Hiragino Sans",sans-serif';
export const THEME=Object.freeze({
 words:['ハロウィン','かぼちゃ','おばけ','仮装','魔女','TRICK','TREAT','BOO!','HALLOWEEN','月夜'],share:.42,
 neon:[0xff7a1a,0x9d4bff,0x3dff8b,0xff3df5,0xffb627,0xff5a1f],
 screenText:['HALLOWEEN','ハロウィン'],
});

// Merged geometry with a per-vertex colour (rgb) and emission (a).
function parts(list){const p=[],n=[],c=[];for(const [geo,rgb,emit=0] of list){const g=geo.index?geo.toNonIndexed():geo;g.computeVertexNormals();const a=g.getAttribute('position').array,b=g.getAttribute('normal').array;for(let i=0;i<a.length;i++){p.push(a[i]);n.push(b[i]);}for(let i=0;i<a.length/3;i++)c.push(rgb[0],rgb[1],rgb[2],emit);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));g.setAttribute('aCol',new THREE.Float32BufferAttribute(c,4));return g;}
const propMaterial=(extra='')=>new THREE.ShaderMaterial({uniforms:{...shared},vertexShader:/* glsl */`${common}attribute vec4 aCol;attribute vec4 aTint;varying vec3 vColor,vWorld;varying float vEmit;varying vec3 vLocal;
 void main(){vec4 w=modelMatrix*instanceMatrix*vec4(position,1.);vWorld=w.xyz;vLocal=position;vec3 N=normalize(mat3(modelMatrix*instanceMatrix)*normal);
  float blink=aTint.a>0.?(.55+.45*sin(uTime*aTint.a+w.x*.7+w.z*.3)):1.;
  vec3 alb=aCol.rgb*aTint.rgb;vec3 amb=vec3(.03,.026,.045)*(.6+.4*N.y);vec3 street=streetLight(w.xz)*(.75+.25*(1.-abs(N.y)));
  vColor=aCol.a>0.?alb*aCol.a*blink:alb*(amb+street);vEmit=aCol.a;gl_Position=projectionMatrix*viewMatrix*w;}`,
 fragmentShader:/* glsl */`${common}varying vec3 vColor,vWorld,vLocal;varying float vEmit;${extra}void main(){vec3 c=vColor;
  #ifdef FACE
  c=face(c);
  #endif
  gl_FragColor=vec4(applyFog(c,vWorld,cameraPosition),1.);}`});
function instanced(group,geo,list,place,{material=propMaterial(),tint=()=>[1,1,1,0]}={}){if(!list.length)return null;const mesh=new THREE.InstancedMesh(geo,material,list.length),d=new THREE.Object3D(),t=new Float32Array(list.length*4);
 list.forEach((o,i)=>{place(d,o,i);d.updateMatrix();mesh.setMatrixAt(i,d.matrix);t.set(tint(o,i),4*i);});geo.setAttribute('aTint',new THREE.InstancedBufferAttribute(t,4));mesh.frustumCulled=false;group.add(mesh);return mesh;}
function canvasTexture(w,h,draw){const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');draw(g,w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return {canvas:c,ctx:g,texture:t};}
const roundRect=(g,x,y,w,h,r)=>{g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath();};

// Megaphone lines of the DJ police (fictional, in the spirit of the real announcements).
export const DJ_LINES=[
 ['立ち止まらないでください','Please keep moving'],
 ['ゆっくり、前の人に続いて','Slowly — follow the person ahead'],
 ['渡ったら、そのまま進んで','Crossed? Keep walking'],
 ['仮装の皆さん、安全第一で！','Costumes on, safety first!'],
 ['次の青まで、お待ちください','Please wait for the next green'],
];

export class HalloweenScene{
 constructor({scene,layout,city}){
  this.group=new THREE.Group();scene.add(this.group);const G=this.group;this.layout=layout;
  // ---- People with jobs: officers (lit batons), volunteers at the bins, performers, the DJ officer ----
  const officers=layout.officers.filter(o=>o.kind!==3);
  this.officers=new CostumeCrowd(G,officers.length,{style:i=>[POLICE,(i*.618)%1,0]});this.officers.place(officers.map(o=>({...o,angle:o.angle})));
  this.staff=new CostumeCrowd(G,layout.staff.length,{style:i=>[STAFF,(i*.37)%1,0]});this.staff.place(layout.staff);
  const shows=layout.pois.filter(p=>p.kind==='performer');
  this.performers=new CostumeCrowd(G,shows.length,{style:i=>[PERFORMER,i/Math.max(1,shows.length),0]});this.performers.place(shows.map(p=>({x:p.x,z:p.z,angle:p.angle})));
  const dj=layout.dj;
  if(dj){this.djOfficer=new CostumeCrowd(G,1,{style:()=>[POLICE,.5,0]});this.djOfficer.uniforms.uLift.value=DECK;this.djOfficer.place([{x:dj.x,z:dj.z+0,angle:dj.angle}]);}
  // ---- Crowd barriers (curb fences and the police gates), cone bars, lane dividers ----
  const steel=[.32,.33,.36],orange=[1,.4,.06],white=[.85,.85,.82],yellow=[.95,.75,.05],black=[.03,.03,.03];
  const barrierGeo=parts([[new THREE.BoxGeometry(2,.05,.05).translate(0,1.02,0),steel],[new THREE.BoxGeometry(2,.04,.04).translate(0,.18,0),steel],
   ...[-.95,-.57,-.19,.19,.57,.95].map(x=>[new THREE.BoxGeometry(.025,.84,.025).translate(x,.6,0),steel]),
   [new THREE.BoxGeometry(1.2,.22,.012).translate(0,.62,.02),orange,.45],[new THREE.BoxGeometry(.6,.03,.5).translate(-.85,.015,0),steel],[new THREE.BoxGeometry(.6,.03,.5).translate(.85,.015,0),steel]]);
  instanced(G,barrierGeo,layout.barriers,(d,o)=>{d.position.set(o.x,0,o.z);d.rotation.set(0,o.angle,0);d.scale.set(o.len/2,1,1);},{tint:o=>o.kind===1?[1,.85,.3,0]:[1,1,1,0]});
  const coneGeo=parts([[new THREE.ConeGeometry(.16,.7,8).translate(0,.35,0),orange],[new THREE.CylinderGeometry(.105,.125,.12,8).translate(0,.4,0),white,.5],[new THREE.BoxGeometry(.4,.04,.4).translate(0,.02,0),black],[new THREE.SphereGeometry(.05,6,4).translate(0,.72,0),[1,.08,.02],4]]);
  instanced(G,coneGeo,layout.cones,(d,o)=>{d.position.set(o.x,0,o.z);d.rotation.set(0,o.angle,0);},{tint:(o,i)=>[1,1,1,i%2?5:0]});
  const barGeo=parts([[new THREE.BoxGeometry(.05,.05,2.2).translate(0,.62,0),yellow,.25],...[-1.05,1.05].map(z=>[new THREE.ConeGeometry(.13,.66,6).translate(0,.33,z),orange])]);
  instanced(G,barGeo,layout.dividers,(d,o)=>{d.position.set(o.x,0,o.z);d.rotation.set(0,o.angle,0);});
  // Lit cone bars along Center-gai's divider (between consecutive cones).
  const bars=[];for(let k=1;k<layout.cones.length;k++){const a=layout.cones[k-1],b=layout.cones[k],l=Math.hypot(b.x-a.x,b.z-a.z);if(l<3)bars.push({x:(a.x+b.x)/2,z:(a.z+b.z)/2,angle:Math.atan2(b.x-a.x,b.z-a.z),len:l});}
  instanced(G,parts([[new THREE.BoxGeometry(.04,.04,1).translate(0,.62,0),[1,.15,.03],2.2]]),bars,(d,o)=>{d.position.set(o.x,0,o.z);d.rotation.set(0,o.angle,0);d.scale.set(1,1,o.len);},{tint:()=>[1,1,1,3]});
  // ---- One-way arrows painted on the circulation sidewalks ----
  const arrow=new THREE.Shape([[-.35,-1.1],[.35,-1.1],[.35,.2],[.8,.2],[0,1.2],[-.8,.2],[-.35,.2]].map(([x,y])=>new THREE.Vector2(x,y)));
  instanced(G,parts([[new THREE.ShapeGeometry(arrow).rotateX(-Math.PI/2).rotateY(Math.PI),[.95,.85,.4],.55]]),layout.arrows,(d,o)=>{d.position.set(o.x,.03,o.z);d.rotation.set(0,o.angle,0);});
  // ---- Jack-o'-lanterns (carved faces glow) ----
  const face=/* glsl */`vec3 face(vec3 c){vec3 l=vLocal;if(vEmit>0.)return c;vec2 f=vec2(atan(l.x,l.z),l.y);float front=step(abs(f.x),.9);
   float eyes=step(length(vec2(abs(f.x)-.32,(f.y-.33)*1.6)),.12);float mouth=step(abs(f.y-.16+.06*cos(f.x*9.)),.035)*step(abs(f.x),.55);
   return c+vec3(3.4,1.25,.18)*(eyes+mouth)*front*(.85+.15*sin(uTime*6.+l.x*40.));}`;
  const pm=propMaterial(face);pm.defines={FACE:1};
  const pumpkinGeo=parts([[new THREE.SphereGeometry(.3,12,8).scale(1.15,.82,1.15).translate(0,.26,0),[.95,.33,.03]],[new THREE.CylinderGeometry(.025,.035,.12,5).translate(0,.54,0),[.12,.3,.06]]]);
  const piles=[...layout.pumpkins];for(const p of layout.pois)if(p.kind==='photo')for(let k=0;k<7;k++){const a=p.angle+(k-3)*.42,r=p.r0+.3;piles.push({x:p.x+Math.sin(a)*r,z:p.z+Math.cos(a)*r,s:1+(k%3)*.35,angle:a+Math.PI});}
  if(dj)for(let k=0;k<4;k++){const a=dj.angle+Math.PI/2*(k%2?1:-1),r=1.6+(k>1?.9:0);piles.push({x:dj.x+Math.sin(a)*r,z:dj.z+Math.cos(a)*r,s:1.3,angle:dj.angle});}
  instanced(G,pumpkinGeo,piles,(d,o)=>{d.position.set(o.x,0,o.z);d.rotation.set(0,o.angle,0);d.scale.setScalar(o.s);},{material:pm});
  this.pumpkinCount=piles.length;
  // ---- Costume photo spots: arch with string lights and a sign ----
  for(const p of layout.pois.filter(q=>q.kind==='photo')){const g=new THREE.Group();g.position.set(p.x,0,p.z);g.rotation.y=p.angle+Math.PI;G.add(g);
   const w=p.r0*2.2,h=3.2,mat=new THREE.MeshBasicMaterial({color:0x0a0710});
   for(const x of [-w/2,w/2]){const post=new THREE.Mesh(new THREE.BoxGeometry(.18,h,.18),mat);post.position.set(x,h/2,0);g.add(post);}
   const beam=new THREE.Mesh(new THREE.BoxGeometry(w+.2,.22,.18),mat);beam.position.y=h;g.add(beam);
   const bulbs=[];for(let k=0;k<=22;k++){const u=k/22,x=-w/2+u*w,y=u<.15?u/.15*h:u>.85?(1-u)/.15*h:h;bulbs.push({x:u<.15?-w/2:u>.85?w/2:x,y:Math.min(h,y)+.12,c:k%2});}
   instanced(g,parts([[new THREE.SphereGeometry(.07,6,4),[1,1,1],3.2]]),bulbs,(d,o)=>{d.position.set(o.x,o.y,.12);},{tint:o=>o.c?[1,.42,.05,4]:[.55,.15,1,4]});
   const sign=canvasTexture(512,160,(c,W,H)=>{c.fillStyle='#120a1c';roundRect(c,4,4,W-8,H-8,26);c.fill();c.strokeStyle='#ff7a1a';c.lineWidth=8;c.stroke();c.fillStyle='#ffb35a';c.textAlign='center';c.font=`900 64px ${FONT}`;c.fillText('PHOTO SPOT',W/2,78);c.fillStyle='#c89bff';c.font=`700 40px ${FONT}`;c.fillText('仮装フォトスポット',W/2,132);});
   const board=new THREE.Mesh(new THREE.PlaneGeometry(w*.8,w*.25),new THREE.MeshBasicMaterial({map:sign.texture,color:new THREE.Color(1.6,1.6,1.6),side:THREE.DoubleSide}));board.position.set(0,h+.75,0);g.add(board);}
  // ---- Trash / recycling stations ----
  const binGeo=parts([[new THREE.BoxGeometry(.55,.95,.55).translate(-.62,.475,0),[.1,.3,.85]],[new THREE.BoxGeometry(.55,.95,.55).translate(0,.475,0),[.15,.65,.2]],[new THREE.BoxGeometry(.55,.95,.55).translate(.62,.475,0),[.9,.7,.05]],
   [new THREE.BoxGeometry(1.9,.06,.6).translate(0,.98,0),[.9,.9,.9],.2],[new THREE.CylinderGeometry(.03,.03,2.2,5).translate(1.05,1.1,0),[.3,.3,.3]]]);
  const bins=layout.pois.filter(p=>p.kind==='bins');
  instanced(G,binGeo,bins,(d,o)=>{d.position.set(o.x,0,o.z);d.rotation.set(0,o.angle,0);});
  const binSign=canvasTexture(512,200,(c,W,H)=>{c.fillStyle='#f4f1e8';roundRect(c,4,4,W-8,H-8,18);c.fill();c.fillStyle='#1a7a2a';c.textAlign='center';c.font=`900 62px ${FONT}`;c.fillText('ゴミ・分別',W/2,82);c.fillStyle='#222';c.font=`700 40px ${FONT}`;c.fillText('TRASH · RECYCLE',W/2,150);});
  for(const b of bins){const m=new THREE.Mesh(new THREE.PlaneGeometry(1.3,.5),new THREE.MeshBasicMaterial({map:binSign.texture,color:new THREE.Color(1.3,1.3,1.3),side:THREE.DoubleSide}));const ca=Math.cos(b.angle),sa=Math.sin(b.angle);m.position.set(b.x+ca*1.05,2.35,b.z-sa*1.05);m.rotation.y=b.angle;G.add(m);}
  // ---- Performer spots: stage mat + warm spotlight ----
  for(const p of shows){const mat=new THREE.Mesh(new THREE.CircleGeometry(p.r0+.4,24).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:0x2a0612}));mat.position.set(p.x,.02,p.z);G.add(mat);
   const beam=new THREE.Mesh(new THREE.ConeGeometry(p.r0+.6,6.5,20,1,true).translate(0,3.25,0),new THREE.ShaderMaterial({uniforms:{...shared},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,vertexShader:/* glsl */`varying float vY;void main(){vY=position.y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:/* glsl */`varying float vY;void main(){gl_FragColor=vec4(vec3(1.,.62,.3)*.025*(1.-vY/6.5),1.);}`}));beam.position.set(p.x,0,p.z);G.add(beam);}
  // ---- DJ police: command vehicle with a raised platform, light bar, LED sign and megaphone ----
  if(dj){const g=new THREE.Group();g.position.set(dj.x,0,dj.z);g.rotation.y=dj.angle;G.add(g);this.dj=g;
   const navy=[.04,.06,.16],light=[.82,.84,.88];
   const body=parts([[new THREE.BoxGeometry(2.3,1.9,5.4).translate(0,1.25,0),light],[new THREE.BoxGeometry(2.32,.5,5.42).translate(0,.75,0),navy],[new THREE.BoxGeometry(2.1,.7,1.2).translate(0,1.55,2.15),[.02,.03,.05]],
    ...[[-1,-1.8],[1,-1.8],[-1,1.8],[1,1.8]].map(([x,z])=>[new THREE.CylinderGeometry(.42,.42,.3,10).rotateZ(Math.PI/2).translate(x*1.02,.42,z),[.02,.02,.02]]),
    [new THREE.BoxGeometry(2.4,.08,3.2).translate(0,2.24,-.9),[.2,.2,.24]],
    ...[-1.15,1.15].map(x=>[new THREE.BoxGeometry(.05,.05,3.2).translate(x,3.25,-.9),[.7,.7,.72]]),[new THREE.BoxGeometry(2.3,.05,.05).translate(0,3.25,-2.5),[.7,.7,.72]],[new THREE.BoxGeometry(2.3,.05,.05).translate(0,3.25,.7),[.7,.7,.72]],
    ...[[-1.15,-2.5],[1.15,-2.5],[-1.15,.7],[1.15,.7]].map(([x,z])=>[new THREE.BoxGeometry(.05,1.0,.05).translate(x,2.75,z),[.7,.7,.72]])]);
   instanced(g,body,[0],()=>{});
   // Light bar: red lamps, blinking.
   instanced(g,parts([[new THREE.BoxGeometry(.5,.16,.3),[1,.05,.03],5]]),[-.75,-.25,.25,.75],(d,x)=>d.position.set(x,2.42,1.7),{tint:(x,i)=>[1,1,1,i%2?11:13]});
   // LED sign on the crowd-facing side (scrolling).
   this.led=canvasTexture(1024,128,()=>{});this.led.texture.wrapS=THREE.RepeatWrapping;this.drawLed('止まらずに進んでください · PLEASE KEEP MOVING · 前の人に続いて · ');
   const ledMat=new THREE.ShaderMaterial({uniforms:{...shared,uMap:{value:this.led.texture}},vertexShader:/* glsl */`varying vec2 vUv;varying vec3 vWorld;void main(){vUv=uv;vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader:/* glsl */`${common}uniform sampler2D uMap;varying vec2 vUv;varying vec3 vWorld;void main(){vec2 uv=vec2(vUv.x*.42+uTime*.06,vUv.y);float a=texture2D(uMap,uv).r;vec2 px=fract(vec2(vUv.x*180.,vUv.y*24.));float dot_=smoothstep(.5,.2,length(px-.5));vec3 c=vec3(2.6,.9,.12)*a*dot_+vec3(.03,.01,.0);gl_FragColor=vec4(applyFog(c,vWorld,cameraPosition),1.);}`});
   for(const s of [-1,1]){const led=new THREE.Mesh(new THREE.PlaneGeometry(4.2,.6),ledMat);led.position.set(s*1.17,1.55,-.2);led.rotation.y=s*Math.PI/2;g.add(led);}
   // Megaphone in the DJ officer's raised hand.
   const mega=new THREE.Mesh(new THREE.ConeGeometry(.13,.36,10,1,true).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:0xd8d8d0,side:THREE.DoubleSide}));mega.position.set(.12,DECK+1.62,.42);g.add(mega);
   // Speech bubble (sprite) above the platform.
   this.bubbleCanvas=canvasTexture(1024,320,()=>{});this.bubble=new THREE.Sprite(new THREE.SpriteMaterial({map:this.bubbleCanvas.texture,transparent:true,depthTest:false,color:new THREE.Color(1.25,1.25,1.25)}));
   this.bubble.scale.set(4.6,1.44,1);this.bubble.position.set(dj.x,DECK+3.55,dj.z);this.bubble.renderOrder=20;G.add(this.bubble);this.say(0);}
  // ---- Coloured light added to the baked street-light field ----
  {const L=city.lightCanvas.getContext('2d'),rect=shared.uLightRect.value,LM=city.lightCanvas.width,sc=LM/rect.z,to=(x,z)=>[(x-rect.x)*sc,(z-rect.y)*sc];L.save();L.globalCompositeOperation='lighter';
   const glow=(x,z,r,rgba)=>{const [px,py]=to(x,z),g=L.createRadialGradient(px,py,0,px,py,r*sc);g.addColorStop(0,rgba);g.addColorStop(1,'rgba(0,0,0,0)');L.fillStyle=g;L.fillRect(px-r*sc,py-r*sc,2*r*sc,2*r*sc);};
   for(const p of piles)glow(p.x,p.z,2.6,'rgba(255,120,20,.22)');
   for(const p of layout.pois){if(p.kind==='photo')glow(p.x,p.z,9,'rgba(200,90,255,.35)');if(p.kind==='performer')glow(p.x,p.z,6,'rgba(255,200,140,.55)');if(p.kind==='store')glow(p.x,p.z,8,'rgba(230,245,255,.4)');}
   if(dj)glow(dj.x,dj.z,12,'rgba(255,60,40,.35)');
   for(const o of officers)glow(o.x,o.z,1.6,'rgba(255,70,20,.25)');
   for(const b of bars)glow(b.x,b.z,2,'rgba(255,60,20,.18)');
   L.restore();if(shared.uLightmap.value)shared.uLightmap.value.needsUpdate=true;}
 }
 drawLed(text){const {ctx:c,canvas}=this.led;c.fillStyle='#000';c.fillRect(0,0,canvas.width,canvas.height);c.fillStyle='#fff';c.textBaseline='middle';c.font=`900 92px ${FONT}`;c.fillText(text,0,68);this.led.texture.needsUpdate=true;}
 say(k){if(!this.bubble)return;const L=DJ_LINES.length,j=((k%L)+L)%L,[ja,en]=DJ_LINES[j];this.line=j;const {ctx:c,canvas}=this.bubbleCanvas,W=canvas.width,H=canvas.height;c.clearRect(0,0,W,H);
  c.fillStyle='rgba(255,250,240,.96)';roundRect(c,10,10,W-20,H-80,48);c.fill();c.beginPath();c.moveTo(W/2-40,H-72);c.lineTo(W/2,H-6);c.lineTo(W/2+40,H-72);c.closePath();c.fill();
  c.strokeStyle='#ff7a1a';c.lineWidth=10;roundRect(c,10,10,W-20,H-80,48);c.stroke();c.textAlign='center';c.textBaseline='middle';
  c.fillStyle='#16121e';c.font=`900 ${ja.length>12?66:78}px ${FONT}`;c.fillText(ja,W/2,100);c.fillStyle='#7a3cff';c.font=`800 46px ${FONT}`;c.fillText(en,W/2,182);this.bubbleCanvas.texture.needsUpdate=true;}
 // Bubble cycles every 3.2 s of simulated time.
 update(simTime){if(this.bubble){const k=Math.floor(simTime/3.2);if(k!==this.lastLine){this.lastLine=k;this.say(k);}}}
 set visible(v){this.group.visible=v;}
}

// Density heat map on the ground (3 m cells from the solver; 0 transparent → 5 p/m² magenta).
export class Heatmap{
 constructor(scene){this.tex=new THREE.DataTexture(new Uint8Array(80*70),80,70,THREE.RedFormat,THREE.UnsignedByteType);this.tex.magFilter=THREE.LinearFilter;this.tex.minFilter=THREE.LinearFilter;this.tex.needsUpdate=true;
  this.mat=new THREE.ShaderMaterial({uniforms:{uMap:{value:this.tex},uOpacity:{value:1}},transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,
   vertexShader:/* glsl */`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
   fragmentShader:/* glsl */`uniform sampler2D uMap;uniform float uOpacity;varying vec2 vUv;
    vec3 ramp(float d){return d<1.?mix(vec3(.05,.35,1.),vec3(.1,.95,.6),d):d<2.?mix(vec3(.1,.95,.6),vec3(1.,.9,.1),d-1.):d<3.?mix(vec3(1.,.9,.1),vec3(1.,.35,.05),d-2.):d<4.?mix(vec3(1.,.35,.05),vec3(1.,.05,.15),d-3.):mix(vec3(1.,.05,.15),vec3(1.,.2,1.),clamp(d-4.,0.,1.));}
    void main(){float d=texture2D(uMap,vec2(vUv.x,1.-vUv.y)).r*255./50.;float a=smoothstep(.15,.7,d)*uOpacity;gl_FragColor=vec4(ramp(d)*(1.3+.4*step(4.,d)),a*.82);}`});
  this.mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2),this.mat);this.mesh.renderOrder=3;this.mesh.frustumCulled=false;scene.add(this.mesh);}
 set(heat){if(!heat)return;this.tex.image.data.set(heat.data);this.tex.needsUpdate=true;const w=heat.w*heat.cell,h=heat.h*heat.cell;this.mesh.scale.set(w,1,h);this.mesh.position.set(heat.x+w/2,.08,heat.z+h/2);}
 set visible(v){this.mesh.visible=v;}
}
