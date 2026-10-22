// Every simulated person is one GPU instance: a 1.6–1.8 m low-poly figure with
// a procedural walk cycle (legs/arms swing with speed). One draw call for all
// people, one for umbrellas. Per instance: x, z, heading, speed+gait phase.
import * as THREE from '../vendor/three.module.min.js';
import {shared,common} from './shaders.mjs';

function add(geo,part,list){const g=geo.toNonIndexed();const p=g.getAttribute('position').array,n=g.getAttribute('normal').array;
 // Drop downward faces (never seen) to save triangles.
 for(let i=0;i<p.length;i+=9){if(n[i+1]+n[i+4]+n[i+7]<-2.4)continue;for(let k=0;k<9;k++){list.p.push(p[i+k]);list.n.push(n[i+k]);}for(let k=0;k<3;k++)list.part.push(part);}}
const limb=(rt,rb,h,x,y,z,sz=1)=>new THREE.CylinderGeometry(rt,rb,h,6,1).scale(1,1,sz).translate(x,y,z);
function personGeometry(){const l={p:[],n:[],part:[]};
 add(limb(.075,.055,.86,-.09,.43,0,1.1),1,l);add(limb(.075,.055,.86,.09,.43,0,1.1),2,l);// legs (hip at .86)
 add(limb(.2,.16,.62,0,1.14,0,.58),0,l);// torso, shoulders wider than waist
 add(limb(.045,.038,.6,-.23,1.12,0),3,l);add(limb(.045,.038,.6,.23,1.12,0),4,l);// arms (shoulder at 1.42)
 add(new THREE.CylinderGeometry(.05,.06,.08,6).translate(0,1.48,0),5,l);// neck
 add(new THREE.IcosahedronGeometry(.11,0).scale(.95,1.08,1).translate(0,1.6,.01),5,l);// head
 add(new THREE.SphereGeometry(.118,6,3,0,Math.PI*2,0,Math.PI*.45).translate(0,1.62,-.012),6,l);// hair
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(l.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(l.n,3));g.setAttribute('aPart',new THREE.Float32BufferAttribute(l.part,1));return g;}
function umbrellaGeometry(){const seg=10,R=.5,p=[],n=[],part=[];
 for(let k=0;k<seg;k++){const a0=k/seg*Math.PI*2,a1=(k+1)/seg*Math.PI*2;const v=[[0,2.12,0],[Math.sin(a1)*R,1.9,Math.cos(a1)*R],[Math.sin(a0)*R,1.9,Math.cos(a0)*R]];for(const q of v){p.push(...q);n.push(Math.sin((a0+a1)/2)*.4,1,Math.cos((a0+a1)/2)*.4);part.push(7);}}
 // Handle
 const h=new THREE.CylinderGeometry(.012,.012,.65,4).translate(.12,1.62,.12).toNonIndexed();const hp=h.getAttribute('position').array;for(let i=0;i<hp.length;i+=3){p.push(hp[i],hp[i+1],hp[i+2]);n.push(0,1,0);part.push(8);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));g.setAttribute('aPart',new THREE.Float32BufferAttribute(part,1));return g;}

const vertex=/* glsl */`${common}
attribute vec4 aAgent;attribute float aPart;
uniform float uRain,uUmbrella;
varying vec3 vColor,vWorld;varying float vAlpha;
vec3 pick4(float r,vec3 a,vec3 b,vec3 c,vec3 d){return r<.25?a:r<.5?b:r<.75?c:d;}
void main(){
 float id=float(gl_InstanceID);
 float h1=hash11(id*.731+1.3),h2=hash11(id*1.917+7.1),h3=hash11(id*3.31+2.9),h4=hash11(id*5.77+.3);
 float spd=floor(aAgent.w/8.)/20.,ph=mod(aAgent.w,8.);
 float part=aPart;vec3 p=position,nrm=normal;
 float amp=clamp(spd/1.35,0.,1.);
 float sw=sin(ph)*.48*amp;
 if(part>.5&&part<2.5){float s=part<1.5?sw:-sw;float yy=p.y-.86;p=vec3(p.x,.86+yy*cos(s)-p.z*sin(s),yy*sin(s)+p.z*cos(s));}
 if(part>2.5&&part<4.5){float s=(part<3.5?-sw:sw)*.75;float yy=p.y-1.42;p=vec3(p.x,1.42+yy*cos(s)-p.z*sin(s),yy*sin(s)+p.z*cos(s));}
 float scale=mix(.92,1.07,h1);
 bool umbrella=h2<uUmbrella;
 if(part>6.5&&!umbrella){gl_Position=vec4(2.,2.,2.,1.);return;}
 if(umbrella&&part>2.5&&part<3.5){p.z+=.12;p.y+=.25;} // left arm raised to hold the umbrella
 p.y+=abs(sin(ph))*.035*amp;
 // Idle weight shift for people standing in a queue.
 float idle=1.-amp;p.x+=sin(uTime*.7+id)*.02*idle*step(.86,p.y);
 p*=scale;
 float hd=aAgent.z,c=cos(hd),s=sin(hd);
 vec3 w=vec3(aAgent.x+p.x*c+p.z*s,p.y,aAgent.y-p.x*s+p.z*c);
 vec3 N=normalize(vec3(nrm.x*c+nrm.z*s,nrm.y,-nrm.x*s+nrm.z*c));
 // Clothing: mostly dark, some light and a few saturated colours.
 vec3 top=h3<.55?pick4(h4,vec3(.035,.035,.04),vec3(.06,.065,.09),vec3(.12,.11,.1),vec3(.025,.03,.05)):h3<.82?pick4(h4,vec3(.55,.52,.47),vec3(.75,.74,.72),vec3(.32,.28,.22),vec3(.45,.47,.5)):pick4(h4,vec3(.6,.08,.1),vec3(.1,.22,.5),vec3(.62,.45,.12),vec3(.15,.4,.32));
 vec3 bottom=pick4(fract(h4*7.3),vec3(.03),vec3(.06,.07,.11),vec3(.2,.19,.18),vec3(.38,.35,.3));
 vec3 skin=mix(vec3(.32,.22,.16),vec3(.5,.37,.28),h1);
 vec3 hair=mix(vec3(.02,.015,.01),vec3(.2,.13,.08),step(.85,h2));
 vec3 alb=part<.5?top:part<2.5?bottom:part<4.5?top:part<5.5?skin:hair;
 vAlpha=1.;
 if(part>6.5){float u=fract(h2*13.7);alb=u<.55?vec3(.3,.33,.36):u<.85?vec3(.02,.02,.025):pick4(fract(u*9.),vec3(.7,.05,.1),vec3(.05,.2,.6),vec3(.8,.6,.05),vec3(.6,.1,.5));vAlpha=u<.55?.38:1.;if(part>7.5)alb=vec3(.1);}
 // Light: sky ambient + street light field (shopfronts are beside/below) + screen rim.
 vec3 street=streetLight(w.xz);
 vec3 amb=mix(vec3(.02,.025,.04),vec3(.45,.48,.52),uDaylight)*(.65+.35*N.y);
 float side=.75+.25*(1.-abs(N.y));
 vec3 rim=uScreenGlow*.35*max(0.,dot(N,normalize(vec3(-w.x,8.,-w.z))))*exp(-length(w.xz)/70.);
 float sun=max(0.,dot(N,uSunDir))*uDaylight;
 vColor=alb*(amb+street*side+rim+sun)+(part>6.5&&vAlpha<1.?street*.25:vec3(0));
 vWorld=w;
 gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);
}`;
const fragment=/* glsl */`${common}varying vec3 vColor,vWorld;varying float vAlpha;void main(){gl_FragColor=vec4(applyFog(vColor,vWorld,cameraPosition),vAlpha);}`;

export class Crowd{
 constructor(scene,n){
  this.n=n;this.data=new Float32Array(Math.max(1,n)*4);this.phase=new Float32Array(Math.max(1,n));
  this.attr=new THREE.InstancedBufferAttribute(this.data,4).setUsage(THREE.DynamicDrawUsage);
  this.uniforms={...shared,uRain:{value:0},uUmbrella:{value:0}};
  const make=(geo,transparent)=>{const g=new THREE.InstancedBufferGeometry().copy(geo);g.setAttribute('aAgent',this.attr);g.instanceCount=n;const m=new THREE.Mesh(g,new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:vertex,fragmentShader:fragment,transparent,depthWrite:!transparent}));m.frustumCulled=false;scene.add(m);return m;};
  this.people=make(personGeometry(),false);this.umbrellas=make(umbrellaGeometry(),true);this.umbrellas.renderOrder=2;
  this.triangles=(this.people.geometry.getAttribute('position').count/3)*n;
 }
 // positions/previous: Float32 [x,z]*n; motion: [heading,speed]*n; roles: Uint8 per agent.
 update(snap,alpha,dtSim){const n=this.n,d=this.data,P=snap.positions,Q=snap.previous,M=snap.motion,R=snap.roles,ph=this.phase,TWO_PI=6.283185307;
  for(let i=0;i<n;i++){const x=Q[2*i]+(P[2*i]-Q[2*i])*alpha,z=Q[2*i+1]+(P[2*i+1]-Q[2*i+1])*alpha,spd=Math.min(2.4,M[2*i+1]);
   let p=ph[i]+spd*dtSim/1.45*TWO_PI;if(p>TWO_PI)p-=TWO_PI;if(spd<.12)p*=Math.max(0,1-dtSim*4);ph[i]=p;
   const hidden=R[i]===6;d[4*i]=x;d[4*i+1]=hidden?-9999:z;d[4*i+2]=M[2*i];d[4*i+3]=Math.floor(spd*20)*8+Math.min(7.99,p);}
  this.attr.needsUpdate=true;}
}
