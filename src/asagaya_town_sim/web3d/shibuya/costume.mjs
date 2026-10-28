// Halloween costumes for the simulated people: one instanced draw for every
// body (shared low-poly figure from crowd.mjs, recoloured and reshaped per
// costume in the shader) plus one instanced draw per accessory layer (hats,
// ears/horns, capes, skirts/sheets, hand props, phone screens and glow sticks)
// that lists only the people wearing it. Costumes are assigned by agent index
// (deterministic); they do not change the simulation.
// Ordinary-people mode (series episodes): costumeOf(i,{ordinary:true}) / ordinaryStyle /
// new CostumeCrowd(scene,n,{ordinary:true}) draw everyone in normal clothes (everyday palette)
// with at most small cat ears or a small hat; no monster bodies, no pale/green/orange skin.
// Police (POLICE) and staff (STAFF) keep their normal uniforms. The default (v4) assignment is unchanged.
// v9 Halloween costumes (series/costumes-v9.mjs v9Style): flags ≥ 4 carry a palette slot → the body is recoloured with the
// slot colours (uniform uV9) and the hat / ears / cape / skirt / prop layers follow the class features. Without such flags
// nothing changes.
// Series-only look uniforms (defaults keep the v4 look): crowd.uniforms.uStride (leg/arm swing scale, 1),
// uKey (soft key light on body faces, 0), uFill (indoor fill light, 0), uNearDim (darkening of figures within ~9 m of the camera, 0).
import * as THREE from '../vendor/three.module.min.js';
import {shared,common} from './shaders.mjs';
import {personGeometry} from './crowd.mjs';
// v9 costume hook (series/costumes-v9.mjs calls setV9Costumes at import; nothing here imports the series code):
// {slots:[{colors:[4 hex]}], lin(hex)→[r,g,b], hasFeature(flags, feature)}. Without it v9 flags are never produced.
let V9=null;
export function setV9Costumes(h){V9=h;}
const v9HasFeature=(f,feat)=>!!V9&&V9.hasFeature(f,feat);
const v9N=()=>4*Math.max(1,V9?V9.slots.length:1);

export const COSTUMES=['casual','witch','vampire','devil','ears','pumpkin','ghost','zombie','wizard','hero','skeleton'];
const WEIGHTS=[.2,.12,.09,.08,.12,.06,.05,.08,.06,.07,.07];
export const POLICE=100,STAFF=101,PERFORMER=102;
// Ordinary-people mode types (never produced by the default assignment).
export const ORDINARY=20,ORDINARY_EARS=21,ORDINARY_HAT=22;
export const ORDINARY_TYPES=Object.freeze([ORDINARY,ORDINARY_EARS,ORDINARY_HAT]);
// Costume types that read as monsters / non-human bodies (excluded from ordinary mode).
export const MONSTER_TYPES=Object.freeze([2,3,5,6,7,10]);// vampire, devil, pumpkin, ghost, zombie, skeleton
const ORDINARY_WEIGHTS=[.82,.11,.07];
const PHONE=1,GLOW=2;
const hash=i=>{let t=(i+0x6D2B79F5)|0;t=Math.imul(t^t>>>15,1|t);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
// [type, seed, flags] for agent i.
// opts.ordinary → ordinary-people mode (types ORDINARY_TYPES only).
export function costumeOf(i,opts){const u=hash(i*3+1),seed=hash(i*3+2),f=hash(i*3+3);
 if(opts?.ordinary){const k=u<ORDINARY_WEIGHTS[0]?0:u<ORDINARY_WEIGHTS[0]+ORDINARY_WEIGHTS[1]?1:2;return [ORDINARY_TYPES[k],seed,f<.2?PHONE:f<.27?GLOW:0];}
 let k=0,acc=WEIGHTS[0];while(u>acc&&k<WEIGHTS.length-1)acc+=WEIGHTS[++k];return [k,seed,f<.2?PHONE:f<.34?GLOW:0];}
export const ordinaryStyle=i=>costumeOf(i,{ordinary:true});

// Accessory geometry, built in the body's rest frame (forward +z, feet at y=0).
function build(parts){const p=[],n=[],part=[];for(const [geo,id] of parts){const g=geo.index?geo.toNonIndexed():geo;const a=g.getAttribute('position').array,b=g.getAttribute('normal').array;for(let i=0;i<a.length;i++){p.push(a[i]);n.push(b[i]);}for(let i=0;i<a.length/3;i++)part.push(id);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));g.setAttribute('aPart',new THREE.Float32BufferAttribute(part,1));return g;}
const cape=()=>{const g=new THREE.BufferGeometry(),v=[],q=[[-.2,1.42,-.13],[.2,1.42,-.13],[-.34,.5,-.2],[.34,.5,-.2]];for(const [a,b,c] of [[0,2,1],[1,2,3]])v.push(...q[a],...q[b],...q[c]);g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.computeVertexNormals();return g;};
const LAYERS=[
 {name:'hat',has:(t,f)=>f>=4?v9HasFeature(f,'witch-hat'):t===1||t===8||t===POLICE||t===ORDINARY_HAT,geo:()=>build([[new THREE.CylinderGeometry(.27,.27,.02,10).translate(0,1.7,0),7],[new THREE.ConeGeometry(.13,.42,8).translate(0,1.92,-.02),8]])},
 {name:'ears',has:(t,f)=>f>=4?v9HasFeature(f,'round-ears')||v9HasFeature(f,'horns'):t===3||t===4||t===ORDINARY_EARS,geo:()=>build([[new THREE.ConeGeometry(.04,.13,5).rotateZ(.35).translate(-.08,1.74,.01),9],[new THREE.ConeGeometry(.04,.13,5).rotateZ(-.35).translate(.08,1.74,.01),10]])},
 {name:'cape',has:(t,f)=>f>=4?v9HasFeature(f,'cape')||v9HasFeature(f,'wings'):t===2||t===9,geo:()=>build([[cape(),11]]),side:THREE.DoubleSide},
 {name:'skirt',has:(t,f)=>f>=4?v9HasFeature(f,'skirt')||v9HasFeature(f,'sheet'):t===1||t===6||t===8,geo:()=>build([[new THREE.CylinderGeometry(.2,.55,.7,10,1,true).translate(0,.6,0),12]]),side:THREE.DoubleSide},
 {name:'prop',has:(t,f)=>f>=4?v9HasFeature(f,'broom'):t===3||t===8||t===POLICE,geo:()=>build([[new THREE.CylinderGeometry(.016,.016,1.1,4).translate(.23,1.37,.06),13],[new THREE.OctahedronGeometry(.06,0).scale(1.4,1,1).translate(.23,1.95,.06),14]])},
 {name:'light',has:(t,f)=>(Math.round(f)&3)>0&&t<POLICE&&t!==6,geo:()=>build([[new THREE.PlaneGeometry(.075,.14).translate(-.23,.84,.08),15],[new THREE.CylinderGeometry(.018,.018,.26,4).translate(.23,.86,.05),16]]),side:THREE.DoubleSide},
];

const vertexBody=/* glsl */`${common}
attribute vec4 aAgent,aStyle;attribute float aPart;
uniform float uLift,uStride,uNearDim,uKey,uFill;uniform vec3 uV9[V9N];
varying vec3 vColor,vWorld,vLocal,vEmit;varying float vPart,vType,vSeed;
vec3 pick4(float r,vec3 a,vec3 b,vec3 c,vec3 d){return r<.25?a:r<.5?b:r<.75?c:d;}
vec3 rotX(vec3 p,float pivot,float a){float y=p.y-pivot;return vec3(p.x,pivot+y*cos(a)-p.z*sin(a),y*sin(a)+p.z*cos(a));}
void main(){
 float type=aStyle.x,seed=aStyle.y,flags=aStyle.z,id=aStyle.w;
 float spd=floor(aAgent.w/8.)/20.,ph=mod(aAgent.w,8.);
 float part=aPart;vec3 p=position,nrm=normal;
 float amp=clamp(spd/1.35,0.,1.),sw=sin(ph)*.48*amp*uStride;
 bool phone=mod(flags,2.)>.5,glow=mod(floor(flags/2.),2.)>.5;int v9=int(floor(flags/4.+.01))-1;
 bool police=abs(type-100.)<.5,staff=abs(type-101.)<.5,performer=abs(type-102.)<.5;
 bool ghost=abs(type-6.)<.5,pumpkin=abs(type-5.)<.5;
 float h1=hash11(id*.731+1.3),h4=hash11(id*5.77+.3);
 // Parts that do not exist for this costume collapse to a point outside the view.
 bool hide=(ghost&&((part>.5&&part<4.5)||(part>5.5&&part<6.5)))||(pumpkin&&part>5.5&&part<6.5)
  ||(part>14.5&&part<15.5&&!phone)||(part>15.5&&part<16.5&&!glow)||(part>6.5&&part<8.5&&abs(type-1.)<.5&&false);
 if(hide){gl_Position=vec4(2.,2.,2.,1.);return;}
 vLocal=p;vPart=part;vType=type;vSeed=seed;
 // Accessory shapes per costume.
 if(part>6.5&&part<8.5){float tall=abs(type-8.)<.5?1.7:1.;if(police){tall=.22;if(part<7.5)p.xz*=.55;else p.xz*=1.45;}
  if(part>7.5){p.y=1.71+(p.y-1.71)*tall*.85;p.xz*=.85;p.z-=(p.y-1.71)*(abs(type-1.)<.5?.18:.06);}else if(abs(type-8.)<.5)p.xz*=.7;
  if(abs(type-22.)<.5){p.y=1.69+(p.y-1.7)*.42;p.xz*=.42;p.x+=.045;}}// ordinary mode: small hat on a hair clip
 if(part>8.5&&part<10.5){if(abs(type-4.)<.5&&seed>.5){p.y=1.69+(p.y-1.69)*2.8;p.xz=vec2(sign(p.x)*.06,.01)+(p.xz-vec2(sign(p.x)*.08,.01))*.8;}
  if(abs(type-3.)<.5){p.y=1.69+(p.y-1.69)*.9;p.z+=(p.y-1.69)*.6;}
  if(abs(type-21.)<.5){p.y=1.69+(p.y-1.69)*.65;p.xz=vec2(sign(p.x)*.075,.01)+(p.xz-vec2(sign(p.x)*.08,.01))*.8;}}// ordinary mode: small cat-ear headband
 if(part>11.5&&part<12.5){float t=clamp((p.y-.25)/.7,0.,1.);
  if(ghost){float r=mix(.46,.25,t)/mix(.55,.2,t);p.xz*=r;p.y=mix(.03,1.52,t);}
  else if(abs(type-8.)<.5){p.xz*=mix(.72,1.,t);p.y=mix(.05,.95,t);}}
 if(part>12.5&&part<14.5){float len=abs(type-8.)<.5?.32:police?.5:1.;p.y=.82+(p.y-.82)*len;if(part>13.5&&!police&&abs(type-8.)>.5)p.x=.23+(p.x-.23)*2.2;}
 // Legs swing about the hip.
 if(part>.5&&part<2.5){float s=part<1.5?sw:-sw;p=rotX(p,.86,s);}
 // Arms (and what the hands hold): swing, or raised for a phone / an officer's lit baton.
 float arm=part>2.5&&part<4.5?part:(part>12.5&&part<14.5)||(part>15.5&&part<16.5)?4.:(part>14.5&&part<15.5)?3.:0.;
 if(arm>2.5){bool raised=(phone&&arm<3.5)||(police&&arm>3.5)||(performer);
  float a=police?-2.15+.55*sin(uTime*3.7+seed*40.):performer?-2.4+.6*sin(uTime*5.+(arm-3.)*3.14):-1.2;
  p=rotX(p,1.42,raised?a:(arm<3.5?-sw:sw)*.75);}
 // Capes trail behind when walking.
 if(part>10.5&&part<11.5){float drop=1.42-p.y;p.z-=drop*(.18*amp+.04*sin(uTime*2.3+seed*20.));}
 // Pumpkin heads: a big round head (the neck stays).
 if(pumpkin&&part>4.5&&part<5.5&&p.y>1.53){p.xz*=2.3;p.y=1.53+(p.y-1.53)*1.75;}
 if(ghost&&part>4.5&&part<5.5&&p.y>1.5){p.xz*=1.5;p.y=1.5+(p.y-1.5)*1.25;}
 p.y+=abs(sin(ph))*.035*amp;
 float idle=1.-amp;p.x+=sin(uTime*.7+id)*.02*idle*step(.86,p.y);
 float scale=mix(.92,1.07,h1);p*=scale;
 float hd=aAgent.z,c=cos(hd),s=sin(hd);
 vec3 w=vec3(aAgent.x+p.x*c+p.z*s,p.y+uLift,aAgent.y-p.x*s+p.z*c);
 vec3 N=normalize(vec3(nrm.x*c+nrm.z*s,nrm.y,-nrm.x*s+nrm.z*c));
 // Palette: Halloween night (orange / purple / black / green accents).
 vec3 ORANGE=vec3(.95,.32,.04),PURPLE=vec3(.33,.08,.7),GREEN=vec3(.18,.6,.12),BLACK=vec3(.02,.018,.025),WHITE=vec3(.78,.78,.76),RED=vec3(.6,.02,.05);
 vec3 skin=mix(vec3(.32,.22,.16),vec3(.5,.37,.28),h1),hair=mix(vec3(.02,.015,.01),vec3(.2,.13,.08),step(.85,h4));
 vec3 top=pick4(h4,vec3(.035,.035,.04),vec3(.06,.065,.09),vec3(.12,.11,.1),pick4(fract(h4*9.),ORANGE*.6,PURPLE*.8,vec3(.45,.47,.5),GREEN*.7)),bottom=pick4(fract(h4*7.3),vec3(.03),vec3(.06,.07,.11),vec3(.2,.19,.18),vec3(.38,.35,.3));
 vec3 acc=BLACK;vec3 emit=vec3(0);
 int T=int(type+.5);
 if(T==1){top=seed<.6?BLACK:PURPLE*.6;bottom=BLACK;acc=part>7.5&&part<8.5?(seed<.5?BLACK:PURPLE*.55):part>6.5&&part<7.5?BLACK:(seed<.6?BLACK:PURPLE*.5);}
 else if(T==2){top=BLACK;bottom=BLACK;skin=vec3(.78,.74,.72);hair=BLACK;acc=BLACK;}
 else if(T==3){top=seed<.6?RED:BLACK;bottom=seed<.3?RED:BLACK;acc=RED;if(part>8.5&&part<10.5)emit=vec3(2.2,.05,.08)*step(.5,seed);if(part>12.5)acc=RED;}
 else if(T==4){bool bunny=seed>.5;top=bunny?(seed>.75?vec3(.85,.55,.65):WHITE):BLACK;bottom=bunny?WHITE*.8:BLACK;acc=bunny?top:BLACK;}
 else if(T==5){top=seed<.5?GREEN*.6:BLACK;bottom=BLACK;skin=ORANGE;}
 else if(T==6){skin=WHITE;acc=WHITE;}
 else if(T==7){top=vec3(.42,.4,.36);bottom=vec3(.18,.17,.16);skin=vec3(.32,.42,.28);}
 else if(T==8){top=seed<.5?PURPLE*.55:vec3(.05,.08,.3);bottom=top;acc=top;if(part>13.5)emit=vec3(1.6,1.3,3.2);if(part>12.5&&part<13.5)acc=vec3(.25,.15,.06);}
 else if(T==9){vec3 suit=pick4(seed,vec3(.06,.12,.55),RED,GREEN*.8,ORANGE);top=suit;bottom=seed<.5?suit:BLACK;acc=pick4(fract(seed*7.),RED,vec3(.9,.75,.08),PURPLE,BLACK);}
 else if(T==10){top=BLACK;bottom=BLACK;skin=WHITE;hair=BLACK;}
 else if(T==100){top=vec3(.03,.05,.13);bottom=vec3(.025,.035,.08);acc=vec3(.03,.05,.13);hair=BLACK;if(part>12.5&&part<14.5)emit=vec3(3.4,.35,.08)*(.85+.15*sin(uTime*9.+seed*30.));}
 else if(T==101){top=vec3(.25,.8,.15);bottom=vec3(.05);}
 else if(T==102){top=mix(ORANGE,PURPLE,step(.5,seed))*1.2;bottom=BLACK;}
 else if(T>=20&&T<=22){// ordinary mode: everyday clothes (the normal-mode crowd palette), natural skin and hair
  float h3=hash11(id*3.31+2.9);top=h3<.55?pick4(h4,vec3(.035,.035,.04),vec3(.06,.065,.09),vec3(.12,.11,.1),vec3(.025,.03,.05)):h3<.82?pick4(h4,vec3(.42,.44,.48),vec3(.75,.74,.72),vec3(.2,.22,.18),vec3(.45,.47,.5)):pick4(h4,vec3(.6,.08,.1),vec3(.1,.22,.5),vec3(.62,.45,.12),vec3(.15,.4,.32));
  bottom=pick4(fract(h4*7.3),vec3(.03),vec3(.06,.07,.11),vec3(.2,.19,.18),vec3(.1,.14,.24));
  acc=T==21?pick4(fract(seed*5.),BLACK,vec3(.12,.07,.04),vec3(.7,.68,.66),vec3(.35,.2,.25)):pick4(fract(seed*5.),BLACK,vec3(.15,.1,.06),vec3(.2,.2,.24),vec3(.3,.08,.1));}
 if(v9>=0){top=uV9[4*v9];bottom=uV9[4*v9+1];acc=uV9[4*v9+2];skin=uV9[4*v9+3];hair=acc;}// v9 costume palette slot
 if(part>14.5&&part<15.5)emit=vec3(1.7,1.9,2.4);
 if(part>15.5&&part<16.5)emit=pick4(fract(seed*13.),vec3(.3,3.,.5),vec3(2.2,.4,3.2),vec3(3.2,1.,.1),vec3(.4,1.8,3.2));
 vec3 alb=part<.5?top:part<2.5?bottom:part<4.5?top:part<5.5?skin:part<6.5?hair:acc;
 vEmit=emit;
 vec3 street=streetLight(w.xz);
 vec3 amb=mix(vec3(.025,.022,.04),vec3(.45,.48,.52),uDaylight)*(.65+.35*N.y);
 float side=.75+.25*(1.-abs(N.y));
 vec3 rim=uScreenGlow*.35*max(0.,dot(N,normalize(vec3(-w.x,8.,-w.z))))*exp(-length(w.xz)/70.);
 vColor=alb*(amb+street*side+rim);
 // series options (defaults 0 = v4 look unchanged): uKey = soft key light so the faces of a near figure read as
 // rounded, uNearDim = darken figures closer than ~8 m to the camera (eye-level shots: no flat bright mannequins).
 if(uFill>0.)vColor+=alb*uFill*(.55+.45*side);// indoor fill light (station LEDs)
 if(uKey>0.){float k=dot(N,normalize(vec3(.45,.55,.7)));vColor*=1.+uKey*(.55*k-.12);}
 if(uNearDim>0.){float dc=length(w-cameraPosition);vColor*=mix(1.-uNearDim,1.,smoothstep(3.,12.,dc));}
 vWorld=w;
 gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);
}`;
const fragment=/* glsl */`${common}varying vec3 vColor,vWorld,vLocal,vEmit;varying float vPart,vType,vSeed;
void main(){vec3 c=vColor;int T=int(vType+.5);vec3 l=vLocal;
 // Faces: pumpkin lantern eyes and mouth, ghost and skull eye holes, masks, skeleton bones, police vest band.
 if(vPart>4.5&&vPart<5.5&&l.z>.02&&l.y>1.53){vec2 f=vec2(l.x,l.y-1.6);
  float eyes=step(length(vec2(abs(f.x)-.04,f.y-.02)),.022);float mouth=step(abs(f.y+.035),.012)*step(abs(f.x),.05);
  if(T==5)c+=vec3(3.,1.1,.15)*(eyes+mouth)*(.8+.2*sin(uTime*7.+vSeed*20.));
  else if(T==6||T==10)c=mix(c,vec3(.0),eyes);
  else if(T==7)c=vSeed<.5?mix(vec3(.6,.6,.58)*(.25+length(c)),vec3(0.),eyes*.8):c+vec3(.12,0.,0.)*step(.7,fract(sin(dot(l.xy,vec2(91.,37.)))*43758.));}
 if(T==10&&vPart<4.5){float bone=step(.6,fract(l.y*11.))*step(abs(l.x)-(vPart<.5?.0:.2),.06);c+=vec3(.25,.25,.24)*bone*(vPart<.5?step(1.,l.y):1.);}
 if(T==100&&vPart<.5)c+=vec3(.5,.55,.15)*step(abs(l.y-1.08),.03);
 if(T==101&&vPart<.5)c+=vec3(.4,.4,.1)*step(abs(l.y-1.1),.025);
 c+=vEmit;
 gl_FragColor=vec4(applyFog(c,vWorld,cameraPosition),1.);}`;

export class CostumeCrowd{
 // style(i) -> [type, seed, flags]; accessories=false draws bodies only (aerial views).
 // ordinary=true: ordinary-people mode (ordinaryStyle) unless an explicit style is given.
 constructor(scene,n,{style,accessories=true,ordinary=false}={}){style=style||(ordinary?ordinaryStyle:costumeOf);
  this.n=n;this.data=new Float32Array(Math.max(1,n)*4);this.phase=new Float32Array(Math.max(1,n));
  this.attr=new THREE.InstancedBufferAttribute(this.data,4).setUsage(THREE.DynamicDrawUsage);
  this.uniforms={...shared,uV9:{value:V9?V9.slots.flatMap(sl=>sl.colors.map(h=>new THREE.Vector3(...V9.lin(h)))):[0,1,2,3].map(()=>new THREE.Vector3())},uLift:{value:0},uUmbrella:{value:0},uStride:{value:1},uNearDim:{value:0},uKey:{value:0},uFill:{value:0}};this.group=new THREE.Group();scene.add(this.group);
  const styles=new Float32Array(Math.max(1,n)*4);this.types=new Uint8Array(n);
  for(let i=0;i<n;i++){const [t,s,f]=style(i);styles.set([t,s,f,i],4*i);this.types[i]=Math.min(255,t);}
  const material=side=>new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:`#define V9N ${v9N()}\n`+vertexBody,fragmentShader:fragment,side});
  const mesh=(geo,count,agent,styleAttr,side=THREE.FrontSide)=>{const g=new THREE.InstancedBufferGeometry().copy(geo);g.setAttribute('aAgent',agent);g.setAttribute('aStyle',styleAttr);g.instanceCount=count;const m=new THREE.Mesh(g,material(side));m.frustumCulled=false;this.group.add(m);return m;};
  this.body=mesh(personGeometry(),n,this.attr,new THREE.InstancedBufferAttribute(styles,4));
  this.layers=[];
  if(accessories)for(const L of LAYERS){const idx=[];for(let i=0;i<n;i++)if(L.has(styles[4*i],styles[4*i+2]))idx.push(i);if(!idx.length)continue;
   const data=new Float32Array(idx.length*4),attr=new THREE.InstancedBufferAttribute(data,4).setUsage(THREE.DynamicDrawUsage),st=new Float32Array(idx.length*4);idx.forEach((i,k)=>st.set(styles.subarray(4*i,4*i+4),4*k));
   this.layers.push({name:L.name,idx:Int32Array.from(idx),data,attr,mesh:mesh(L.geo(),idx.length,attr,new THREE.InstancedBufferAttribute(st,4),L.side)});}
  this.triangles=(this.body.geometry.getAttribute('position').count/3)*n+this.layers.reduce((s,l)=>s+l.mesh.geometry.getAttribute('position').count/3*l.idx.length,0);
 }
 set visible(v){this.group.visible=v;}
 get visible(){return this.group.visible;}
 gather(){const d=this.data;for(const L of this.layers){const o=L.data,idx=L.idx;for(let k=0;k<idx.length;k++){const j=4*idx[k];o[4*k]=d[j];o[4*k+1]=d[j+1];o[4*k+2]=d[j+2];o[4*k+3]=d[j+3];}L.attr.needsUpdate=true;}this.attr.needsUpdate=true;}
 // Same interface as Crowd.update (positions/previous/motion from a solver snapshot).
 update(snap,alpha,dtSim){const n=this.n,d=this.data,P=snap.positions,Q=snap.previous,M=snap.motion,R=snap.roles,ph=this.phase,TWO_PI=6.283185307;
  for(let i=0;i<n;i++){const x=Q[2*i]+(P[2*i]-Q[2*i])*alpha,z=Q[2*i+1]+(P[2*i+1]-Q[2*i+1])*alpha,spd=Math.min(2.4,M[2*i+1]);
   let p=ph[i]+spd*dtSim/1.45*TWO_PI;if(p>TWO_PI)p-=TWO_PI;if(spd<.12)p*=Math.max(0,1-dtSim*4);ph[i]=p;
   const hidden=R[i]===6||R[i]===10||R[i]===12||Math.abs(x)>5000;d[4*i]=hidden?-9999:x;d[4*i+1]=hidden?-9999:z;d[4*i+2]=M[2*i];d[4*i+3]=Math.floor(spd*20)*8+Math.min(7.99,p);}
  this.gather();}
 // Static figures (officers, staff, performers): [{x,z,angle}].
 place(list){list.forEach((o,i)=>{this.data.set([o.x,o.z,o.angle,0],4*i);});this.gather();}
}
