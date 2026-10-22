// SUMO vehicle trajectories (replayed on the shared signal clock) as instanced
// cars with headlights, tail/brake lights and a few taxis with roof lamps.
import * as THREE from '../vendor/three.module.min.js';
import {shared,common} from './shaders.mjs';
import {vehiclePoses} from './traffic.mjs';

function carGeometry(){const parts=[];const add=(w,h,d,x,y,z)=>parts.push(new THREE.BoxGeometry(w,h,d).translate(x,y,z).toNonIndexed());
 add(1.74,.62,4.4,0,.56,0);// body
 add(1.56,.5,2.3,0,1.1,-.25);// cabin
 add(1.6,.06,4.0,0,.25,0);// sill shadow
 const p=[],n=[];for(const g of parts){p.push(...g.getAttribute('position').array);n.push(...g.getAttribute('normal').array);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));return g;}

export class Vehicles{
 constructor(scene,traffic){
  this.traffic=traffic;const max=traffic.tracks.length;this.max=max;
  this.data=new Float32Array(Math.max(1,max)*4);this.attr=new THREE.InstancedBufferAttribute(this.data,4).setUsage(THREE.DynamicDrawUsage);
  const geo=new THREE.InstancedBufferGeometry().copy(carGeometry());geo.setAttribute('aCar',this.attr);geo.instanceCount=0;this.geo=geo;
  const mat=new THREE.ShaderMaterial({uniforms:{...shared},vertexShader:/* glsl */`attribute vec4 aCar;varying vec3 vLocal,vWorld,vN;varying float vId,vBrake;
   void main(){vLocal=position;vId=aCar.w;vBrake=aCar.z>10.?1.:0.;float hd=mod(aCar.z,10.)-5.;float c=cos(hd),s=sin(hd);vec3 p=position;vec3 w=vec3(aCar.x+p.x*c+p.z*s,p.y,aCar.y-p.x*s+p.z*c);vN=vec3(normal.x*c+normal.z*s,normal.y,-normal.x*s+normal.z*c);vWorld=w;gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`,
   fragmentShader:/* glsl */`${common}varying vec3 vLocal,vWorld,vN;varying float vId,vBrake;
   void main(){float h=hash11(vId*.37+.11),h2=hash11(vId*1.7);
    bool taxi=h2<.22;
    vec3 paint=taxi?vec3(.012,.014,.03):h<.32?vec3(.42,.43,.42):h<.58?vec3(.012):h<.78?vec3(.3,.31,.33):h<.88?vec3(.05,.07,.16):vec3(.35,.03,.04);
    vec3 N=normalize(vN),V=normalize(cameraPosition-vWorld);vec3 l=vLocal;
    bool glass=l.y>.88&&l.y<1.33&&abs(l.z+.25)<1.1;
    vec3 alb=glass?vec3(.01,.012,.016):paint;if(l.y<.3)alb=vec3(.008);
    vec3 street=streetLight(vWorld.xz);
    vec3 amb=mix(vec3(.02,.022,.035),vec3(.5),uDaylight);
    vec3 col=alb*(amb+street*(.25+.2*N.y));
    // Clear coat / glass reflection of the sky and street glow.
    float fres=.04+.96*pow(1.-max(dot(N,V),0.),5.);col+=(skyColor(reflect(-V,N))*.6+street*.25)*fres*(glass?1.:.55);
    // Lamps: headlights on the front face, tail/brake lights at the rear.
    float front=step(2.18,l.z),rear=step(l.z,-2.18);
    float lamp=step(.5,abs(l.x))*step(abs(l.x),.82)*step(.6,l.y)*step(l.y,.8);
    col+=front*lamp*vec3(3.6,3.4,3.)*6.*(1.-.8*uDaylight);
    col+=rear*lamp*vec3(2.5,.08,.05)*(vBrake>.5?6.:2.2);
    if(taxi&&l.y>1.34&&abs(l.z+.25)<.2&&abs(l.x)<.25)col=vec3(4.,2.4,.6);
    gl_FragColor=vec4(applyFog(col,vWorld,cameraPosition),1.);}`});
  this.mesh=new THREE.Mesh(geo,mat);this.mesh.frustumCulled=false;scene.add(this.mesh);
  // Taxi roof lamp (small box), shares instance data.
  const lampGeo=new THREE.InstancedBufferGeometry().copy(new THREE.BoxGeometry(.45,.16,.22).translate(0,1.43,-.25));lampGeo.setAttribute('aCar',this.attr);lampGeo.instanceCount=0;this.lampGeo=lampGeo;
  const lamp=new THREE.Mesh(lampGeo,new THREE.ShaderMaterial({uniforms:{...shared},vertexShader:/* glsl */`attribute vec4 aCar;varying float vTaxi;varying vec3 vWorld;void main(){vTaxi=step(hash11(aCar.w*1.7),.22);float hd=mod(aCar.z,10.)-5.;float c=cos(hd),s=sin(hd);vec3 p=position;vec3 w=vec3(aCar.x+p.x*c+p.z*s,p.y,aCar.y-p.x*s+p.z*c);vWorld=w;gl_Position=vTaxi>.5?projectionMatrix*viewMatrix*vec4(w,1.):vec4(2.,2.,2.,1.);}`.replace('void main','float hash11(float p){p=fract(p*.1031);p*=p+33.33;p*=p+p;return fract(p);}\nvoid main'),
   fragmentShader:/* glsl */`${common}varying vec3 vWorld;void main(){gl_FragColor=vec4(applyFog(vec3(4.,2.3,.5),vWorld,cameraPosition),1.);}`}));lamp.frustumCulled=false;scene.add(lamp);
  this.poses=[];this.prevClock=null;
 }
 // clock: interpolated signal clock; returns poses with speed for other passes.
 update(clock){const now=vehiclePoses(this.traffic,clock),before=new Map(vehiclePoses(this.traffic,clock-.5).map(p=>[p.id,p]));
  let k=0;const d=this.data;
  for(const p of now){const b=before.get(p.id);p.speed=b?Math.hypot(p.x-b.x,p.z-b.z)/.5:0;p.brake=p.speed<1.2;
   const id=Number(String(p.id).replace(/\D/g,''))||k;p.uid=id;
   d[4*k]=p.x;d[4*k+1]=p.z;d[4*k+2]=((p.angle+5)%10+10)%10+(p.brake?10:0);d[4*k+3]=id;k++;}
  this.geo.instanceCount=this.lampGeo.instanceCount=k;this.attr.needsUpdate=true;this.poses=now;return now;}
}
