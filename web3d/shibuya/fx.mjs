// Post-processing and world-space effects, written for this project:
// HDR scene → soft-knee bloom pyramid → ACES tonemap + grade, vignette, grain;
// long-exposure light trails accumulated in a top-down texture; rain; sky.
import * as THREE from '../vendor/three.module.min.js';
import {shared,common} from './shaders.mjs';

const quadVS=/* glsl */`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
function pass(fragmentShader,uniforms,blending=THREE.NoBlending){const m=new THREE.ShaderMaterial({uniforms,vertexShader:quadVS,fragmentShader,depthTest:false,depthWrite:false,blending});return m;}

export class Post{
 constructor(renderer){
  this.renderer=renderer;this.scene=new THREE.Scene();this.camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2));this.quad.frustumCulled=false;this.scene.add(this.quad);
  const ht={type:THREE.HalfFloatType,depthBuffer:false};
  this.hdr=new THREE.WebGLRenderTarget(4,4,{type:THREE.HalfFloatType,samples:4});
  this.mips=Array.from({length:6},()=>new THREE.WebGLRenderTarget(4,4,ht));
  this.down=pass(/* glsl */`uniform sampler2D tSrc;uniform vec2 uTexel;uniform float uFirst,uThreshold,uKnee;varying vec2 vUv;
   vec3 s(vec2 o){return texture2D(tSrc,vUv+o*uTexel).rgb;}
   void main(){vec3 a=s(vec2(-2,2)),b=s(vec2(0,2)),c=s(vec2(2,2)),d=s(vec2(-2,0)),e=s(vec2(0)),f=s(vec2(2,0)),g=s(vec2(-2,-2)),h=s(vec2(0,-2)),i=s(vec2(2,-2)),j=s(vec2(-1,1)),k=s(vec2(1,1)),l=s(vec2(-1,-1)),m=s(vec2(1,-1));
    vec3 col=e*.125+(a+c+g+i)*.03125+(b+d+f+h)*.0625+(j+k+l+m)*.125;
    if(uFirst>.5){float br=max(col.r,max(col.g,col.b));float soft=clamp(br-uThreshold+uKnee,0.,2.*uKnee);soft=soft*soft/(4.*uKnee+1e-4);col*=max(soft,br-uThreshold)/max(br,1e-4);col=min(col,vec3(60.));}
    gl_FragColor=vec4(col,1.);}`,{tSrc:{value:null},uTexel:{value:new THREE.Vector2()},uFirst:{value:0},uThreshold:{value:1.4},uKnee:{value:.7}});
  this.up=pass(/* glsl */`uniform sampler2D tSrc;uniform vec2 uTexel;uniform float uRadius;varying vec2 vUv;
   void main(){vec2 t=uTexel*uRadius;vec3 c=texture2D(tSrc,vUv).rgb*4.;c+=(texture2D(tSrc,vUv+vec2(t.x,0)).rgb+texture2D(tSrc,vUv-vec2(t.x,0)).rgb+texture2D(tSrc,vUv+vec2(0,t.y)).rgb+texture2D(tSrc,vUv-vec2(0,t.y)).rgb)*2.;
    c+=texture2D(tSrc,vUv+t).rgb+texture2D(tSrc,vUv-t).rgb+texture2D(tSrc,vUv+vec2(t.x,-t.y)).rgb+texture2D(tSrc,vUv+vec2(-t.x,t.y)).rgb;gl_FragColor=vec4(c/16.,1.);}`,{tSrc:{value:null},uTexel:{value:new THREE.Vector2()},uRadius:{value:1}},THREE.AdditiveBlending);
  this.final=pass(/* glsl */`uniform sampler2D tScene,tBloom;uniform float uBloom,uExposure,uTime,uVignette,uGrain,uAberration,uLetterbox,uFade,uSaturation;uniform vec2 uRes;varying vec2 vUv;
   vec3 aces(vec3 x){const float a=2.51,b=.03,c=2.43,d=.59,e=.14;return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.,1.);}
   float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
   void main(){vec2 uv=vUv,cc=uv-.5;float r2=dot(cc,cc);
    vec2 off=cc*r2*uAberration;vec3 col=vec3(texture2D(tScene,uv+off).r,texture2D(tScene,uv).g,texture2D(tScene,uv-off).b);
    col+=texture2D(tBloom,uv).rgb*uBloom;
    col*=uExposure;
    col=aces(col);
    // Grade: cool shadows, warm/magenta highlights, gentle saturation.
    float l=dot(col,vec3(.2126,.7152,.0722));
    col+=vec3(-.012,.004,.03)*(1.-smoothstep(0.,.35,l))+vec3(.03,.0,.02)*smoothstep(.45,1.,l);
    col=mix(vec3(l),col,uSaturation);
    col*=1.-uVignette*smoothstep(.12,.75,r2*1.6);
    col=pow(max(col,0.),vec3(1./2.2));
    col+=(hash(uv*uRes+fract(uTime*7.31)*100.)-.5)*uGrain;
    float bar=step(abs(cc.y),.5-uLetterbox);col*=bar*uFade;
    gl_FragColor=vec4(col,1.);}`,{tScene:{value:null},tBloom:{value:null},uBloom:{value:.32},uExposure:{value:1.0},uTime:{value:0},uVignette:{value:.55},uGrain:{value:.035},uAberration:{value:.012},uLetterbox:{value:0},uFade:{value:1},uSaturation:{value:1.08},uRes:{value:new THREE.Vector2(1,1)}});
  this.width=0;this.height=0;this.settings=this.final.uniforms;
 }
 setSize(w,h){if(w===this.width&&h===this.height)return;this.width=w;this.height=h;this.hdr.setSize(w,h);let mw=w,mh=h;for(const m of this.mips){mw=Math.max(1,mw>>1);mh=Math.max(1,mh>>1);m.setSize(mw,mh);}this.final.uniforms.uRes.value.set(w,h);}
 blit(material,target){this.quad.material=material;this.renderer.setRenderTarget(target);this.renderer.render(this.scene,this.camera);}
 render(scene,camera){const r=this.renderer;r.setRenderTarget(this.hdr);r.clear();r.render(scene,camera);
  let src=this.hdr;this.mips.forEach((m,i)=>{this.down.uniforms.tSrc.value=src.texture;this.down.uniforms.uTexel.value.set(1/src.width,1/src.height);this.down.uniforms.uFirst.value=i===0?1:0;this.blit(this.down,m);src=m;});
  for(let i=this.mips.length-2;i>=0;i--){const s=this.mips[i+1];this.up.uniforms.tSrc.value=s.texture;this.up.uniforms.uTexel.value.set(1/s.width,1/s.height);this.up.uniforms.uRadius.value=1;r.autoClear=false;this.blit(this.up,this.mips[i]);r.autoClear=true;}
  this.final.uniforms.tScene.value=this.hdr.texture;this.final.uniforms.tBloom.value=this.mips[0].texture;this.final.uniforms.uTime.value=shared.uTime.value;this.blit(this.final,null);}
}

// Top-down world-space buffers around the junction: decaying light trails
// (long exposure) and per-frame car light pools on the road.
export class TopDown{
 constructor(renderer,n,maxCars){
  this.renderer=renderer;const rect=shared.uTrailRect.value;this.rect=rect;
  const opts={type:THREE.HalfFloatType,depthBuffer:false};this.size=1024;
  this.trails=[new THREE.WebGLRenderTarget(this.size,this.size,opts),new THREE.WebGLRenderTarget(this.size,this.size,opts)];this.dyn=new THREE.WebGLRenderTarget(512,512,opts);this.flip=0;
  for(const t of this.trails){renderer.setRenderTarget(t);renderer.setClearColor(0,0);renderer.clear();}renderer.setRenderTarget(null);
  // Looking down with up=-z: camera x = world x, camera y = -world z. Bounds map
  // z=rect.y to v=0 so the texture uv equals (xz-rect.xy)/rect.zw.
  this.camera=new THREE.OrthographicCamera(rect.x,rect.x+rect.z,-(rect.y+rect.w),-rect.y,-10,10);this.camera.position.set(0,5,0);this.camera.up.set(0,0,-1);this.camera.lookAt(0,0,0);this.camera.updateMatrixWorld();
  this.scene=new THREE.Scene();this.fadeScene=new THREE.Scene();
  this.fade=new THREE.Mesh(new THREE.PlaneGeometry(2,2),pass(/* glsl */`uniform sampler2D tPrev;uniform float uDecay;varying vec2 vUv;void main(){gl_FragColor=vec4(texture2D(tPrev,vUv).rgb*uDecay,1.);}`,{tPrev:{value:null},uDecay:{value:.95}}));this.fade.frustumCulled=false;this.fadeScene.add(this.fade);this.fadeCam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  // People: one line segment per agent per frame, hue by walking direction.
  this.n=n;this.linePos=new Float32Array(Math.max(1,n)*2*3);this.lineCol=new Float32Array(Math.max(1,n)*2*3);
  const lg=new THREE.BufferGeometry();lg.setAttribute('position',new THREE.BufferAttribute(this.linePos,3).setUsage(THREE.DynamicDrawUsage));lg.setAttribute('color',new THREE.BufferAttribute(this.lineCol,3).setUsage(THREE.DynamicDrawUsage));
  this.lines=new THREE.LineSegments(lg,new THREE.LineBasicMaterial({vertexColors:true,blending:THREE.AdditiveBlending,transparent:true,depthTest:false,toneMapped:false}));this.lines.frustumCulled=false;this.scene.add(this.lines);
  this.carPos=new Float32Array(Math.max(1,maxCars)*8*3);this.carCol=new Float32Array(Math.max(1,maxCars)*8*3);
  const cg=new THREE.BufferGeometry();cg.setAttribute('position',new THREE.BufferAttribute(this.carPos,3).setUsage(THREE.DynamicDrawUsage));cg.setAttribute('color',new THREE.BufferAttribute(this.carCol,3).setUsage(THREE.DynamicDrawUsage));
  this.carLines=new THREE.LineSegments(cg,this.lines.material);this.carLines.frustumCulled=false;this.scene.add(this.carLines);
  // Headlight pools / tail glows: instanced quads drawn into the dynamic light buffer.
  this.dynScene=new THREE.Scene();this.poolData=new Float32Array(Math.max(1,maxCars)*4);this.poolAttr=new THREE.InstancedBufferAttribute(this.poolData,4).setUsage(THREE.DynamicDrawUsage);
  const pg=new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2));pg.setAttribute('aPose',this.poolAttr);pg.instanceCount=0;this.poolGeo=pg;
  const pool=new THREE.Mesh(pg,new THREE.ShaderMaterial({vertexShader:/* glsl */`attribute vec4 aPose;varying vec2 vLocal;varying float vBrake;void main(){vLocal=position.xz;vBrake=aPose.w;vec3 p=vec3(position.x*7.,0.,position.z*26.+8.5);float c=cos(aPose.z),s=sin(aPose.z);vec3 w=vec3(aPose.x+p.x*c+p.z*s,0.,aPose.y-p.x*s+p.z*c);gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`,
   fragmentShader:/* glsl */`varying vec2 vLocal;varying float vBrake;void main(){float z=vLocal.y+.5,x=vLocal.x;// z: 0 rear .. 1 front
    float beam=smoothstep(.36,.42,z)*(1.-smoothstep(.45,1.,z))*exp(-x*x*8./(.08+z*z));
    float tail=exp(-pow((z-.3)*14.,2.)-x*x*30.);
    gl_FragColor=vec4(vec3(1.,.93,.82)*beam*1.4+vec3(1.,.05,.03)*tail*(vBrake>.5?1.6:.7),1.);}`,blending:THREE.AdditiveBlending,transparent:true,depthTest:false,side:THREE.DoubleSide}));pool.frustumCulled=false;this.dynScene.add(pool);
  shared.uTrail.value=this.trails[0].texture;
 }
 update(crowd,cars,dtSim,tau=3){const r=this.renderer,d=crowd.data,n=this.n,P=this.linePos,C=this.lineCol,rect=this.rect;
  // Agent segments from last rendered position to the current one.
  if(!this.last){this.last=new Float32Array(n*2);for(let i=0;i<n;i++){this.last[2*i]=d[4*i];this.last[2*i+1]=d[4*i+1];}}
  const roles=this.roles;
  for(let i=0;i<n;i++){const x=d[4*i],z=d[4*i+1],lx=this.last[2*i],lz=this.last[2*i+1];const dx=x-lx,dz=z-lz,jump=dx*dx+dz*dz>25;
   P[6*i]=jump?x:lx;P[6*i+1]=0;P[6*i+2]=jump?z:lz;P[6*i+3]=x;P[6*i+4]=0;P[6*i+5]=z;
   // Crossing walkers: neon cyan↔magenta by heading (two diagonals read as two
   // colours); everyone else a faint warm streak so the scramble wave dominates.
   const role=roles?roles[i]:3;let rr,gg,bb;
   if(role===1){const v=Math.sin(Math.atan2(dx,dz)+.6),u=Math.min(1,Math.max(0,v*1.6+.5));rr=(.03+1.25*u)*1.3;gg=(.8-.72*u)*1.3;bb=(1.05-.45*u)*1.3;}
   else if(role===0){rr=gg=bb=0;}else{rr=.11;gg=.075;bb=.045;}const k=1;
   for(const o of [0,3]){C[6*i+o]=rr*k;C[6*i+o+1]=gg*k;C[6*i+o+2]=bb*k;}
   this.last[2*i]=x;this.last[2*i+1]=z;}
  this.lines.geometry.attributes.position.needsUpdate=this.lines.geometry.attributes.color.needsUpdate=true;
  // Cars: head (white) and tail (red) light streaks.
  if(!this.lastCars)this.lastCars=new Map();let k=0;const CP=this.carPos,CC=this.carCol,seen=new Map();
  for(const p of cars){const c=Math.cos(p.angle),s=Math.sin(p.angle),prev=this.lastCars.get(p.id);seen.set(p.id,p);let j=0;
   for(const [lx,lz,cr,cg,cb] of [[-.65,2.2,1.4,1.3,1.15],[.65,2.2,1.4,1.3,1.15],[-.65,-2.2,1.6,.06,.03],[.65,-2.2,1.6,.06,.03]]){
    const x=p.x+lx*c+lz*s,z=p.z-lx*s+lz*c;let px=x,pz=z;if(prev){const pc=Math.cos(prev.angle),ps=Math.sin(prev.angle);px=prev.x+lx*pc+lz*ps;pz=prev.z-lx*ps+lz*pc;if((px-x)**2+(pz-z)**2>100){px=x;pz=z;}}
    const o=(k*4+j)*6;CP[o]=px;CP[o+1]=0;CP[o+2]=pz;CP[o+3]=x;CP[o+4]=0;CP[o+5]=z;for(const q of [0,3]){CC[o+q]=cr;CC[o+q+1]=cg;CC[o+q+2]=cb;}j++;}
   const pd=this.poolData;pd[4*k]=p.x;pd[4*k+1]=p.z;pd[4*k+2]=p.angle;pd[4*k+3]=p.brake?1:0;k++;}
  this.lastCars=seen;this.carLines.geometry.setDrawRange(0,k*8);this.carLines.geometry.attributes.position.needsUpdate=this.carLines.geometry.attributes.color.needsUpdate=true;
  this.poolGeo.instanceCount=k;this.poolAttr.needsUpdate=true;
  // Accumulate: prev × exp(-dt/τ) + this frame's segments.
  const src=this.trails[this.flip],dst=this.trails[1-this.flip];this.fade.material.uniforms.tPrev.value=src.texture;this.fade.material.uniforms.uDecay.value=Math.exp(-Math.max(0,dtSim)/tau);
  const clear=r.getClearColor(new THREE.Color()),alpha=r.getClearAlpha();r.setClearColor(0,0);
  r.setRenderTarget(dst);r.render(this.fadeScene,this.fadeCam);r.autoClear=false;if(dtSim>0)r.render(this.scene,this.camera);r.autoClear=true;
  r.setRenderTarget(this.dyn);r.clear();r.render(this.dynScene,this.camera);r.setRenderTarget(null);r.setClearColor(clear,alpha);
  this.flip=1-this.flip;shared.uTrail.value=dst.texture;}
}

export class Rain{
 constructor(scene,count=9000){const g=new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(.012,1));const seeds=new Float32Array(count*3);for(let i=0;i<count*3;i++)seeds[i]=Math.random();g.setAttribute('aSeed',new THREE.InstancedBufferAttribute(seeds,3));g.instanceCount=count;
  this.uniforms={...shared,uAmount:{value:0},uBox:{value:new THREE.Vector3(70,45,70)}};
  this.mesh=new THREE.Mesh(g,new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,vertexShader:/* glsl */`${common}attribute vec3 aSeed;uniform float uAmount;uniform vec3 uBox;varying float vA;varying vec3 vWorld;
   void main(){vec3 cam=cameraPosition;vec3 base=aSeed*uBox;float fall=uTime*9.;vec3 p=base;p.y=mod(base.y-fall,uBox.y);
    vec3 w=cam+mod(p-cam+uBox*.5,uBox)-uBox*.5;w.y=p.y+max(0.,cam.y-uBox.y*.6);
    vec3 toCam=normalize(cam-w);vec3 right=normalize(cross(vec3(.05,1.,0.),toCam));
    w+=right*position.x*(1.+length(cam-w)*.02)+vec3(.05,1.,0.)*position.y*.9;
    vWorld=w;vA=step(aSeed.x*0.+fract(aSeed.z*7.),uAmount)*.32*(1.-smoothstep(10.,45.,length(cam-w)));
    gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`,
   fragmentShader:/* glsl */`${common}varying float vA;varying vec3 vWorld;void main(){vec3 c=(vec3(.6,.65,.75)*.15+streetLight(vWorld.xz)*.6)*vA;gl_FragColor=vec4(c,1.);}`}));
  this.mesh.frustumCulled=false;this.mesh.renderOrder=5;scene.add(this.mesh);}
}

export function makeSky(scene){const m=new THREE.Mesh(new THREE.SphereGeometry(3000,32,16),new THREE.ShaderMaterial({uniforms:{...shared},side:THREE.BackSide,depthWrite:false,vertexShader:/* glsl */`varying vec3 vDir;void main(){vDir=normalize(position);vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}`,
 fragmentShader:/* glsl */`${common}varying vec3 vDir;void main(){vec3 d=normalize(vDir);vec3 c=skyColor(d);
  // Low cloud deck lit orange-pink from below by the city.
  if(d.y>0.){vec2 uv=d.xz/(d.y+.12)*1.4;float cl=fbm(uv+vec2(uTime*.004,0.));float under=smoothstep(.45,.85,cl)*(1.-smoothstep(.0,.65,d.y));c+=vec3(.16,.07,.12)*under*(1.-uDaylight)+vec3(.25)*under*uDaylight;}
  gl_FragColor=vec4(c,1.);}`}));m.frustumCulled=false;m.renderOrder=-10;scene.add(m);return m;}
