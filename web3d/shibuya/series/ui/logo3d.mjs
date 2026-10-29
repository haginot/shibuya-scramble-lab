// Original 3D logotype of the series: 「ハロウィンの渋谷を脱出せよ！」 + ticket badge 「JR編」 + subtitle bar
// 「10/31 渋谷からどう帰る？」 + 「※パロディ」 tag (+ optional PRESS START line). Extruded, beveled glyphs built from
// web3d/data/logo_glyphs.json (tools/build_logo_glyphs.py; fonts SIL OFL 1.1 in web3d/fonts/), procedural materials
// (aged bone paint with chipped edges + scratches + rust streaks over steel, copper bevels, dark hammered iron backing
// slab with an ember-orange glowing rim, worn green enamel ticket, black lacquer bar), view-space key/rim/env lighting
// (warm key, violet + sickly-green rims, fire bounce from below, moving light sweep), and its own particles (sparks,
// dust, embers, shockwave). Everything is a pure function of time — deterministic per frame, no wall clock, no Math.random.
// Original design: nothing traces or imitates an existing game / film logo.
//
// The logo lives in its OWN scene + camera (units: em of the title glyphs) and is drawn over the frame inside the
// host's HDR pass, so the host's bloom / tonemap / grain apply to it (glow > 1.4 blooms):
//   const logo=new Logo3D({data:await loadLogoGlyphs(), sdf:await loadLogoSdf(), aspect:W/H});
//   logo.attach(scene, camera)   // scene.onAfterRender hook: when `camera` renders `scene` (not the reflection pass)
//                                // and logo.visible, clears depth and renders the logo scene into the same target
//   logo.setTime(tl)             // tl = seconds since the logo sequence began (LOGO_TIMELINE); < 0 hides it
//   logo.state                   // {shake:{x,y,roll}, flash, impact, phase} → host camera shake / exposure flash
//   logo.setPress(on, k)         // PRESS START line (3D) on/off, k = 0..1 extra "pressed" pulse
//   logo.renderOver(renderer)    // manual alternative to attach(): draw over whatever target is bound
// Options: {aspect=9/16, press=true (3D PRESS START line), tag=false (「※パロディ」 plate; off since the 2026-10-26 steering), backdrop=1 (darkening plate behind the lockup, 0..1),
//           frame:{y=-.32 (lockup centre offset, em, + = up), width=.9 (fraction of the view width)}, particles=true}
import * as THREE from '../../../vendor/three.module.min.js';

export const LOGO_TIMELINE=Object.freeze({
 burnIn:[0,.85],      // backing slabs burn in from the centre (ember edge), glyphs fly in hot from the camera side
 slam:.9,             // title lands: overshoot, shake, flash, shockwave, sparks, dust
 badge:1.32,          // 「JR編」 ticket drops in (small shake + sparks)
 tag:1.0,             // 「※パロディ」 tag (visible from the slam on; the HUD sticker covers every frame anyway)
 subtitle:[1.55,2.05],// subtitle bar wipes in left → right with a hot leading edge
 sweep:[2.05,3.0],    // light sweep across the title
 settle:3.0,          // from here: idle (embers, breathing glow, slow parallax drift)
});
const T=LOGO_TIMELINE;

const here=u=>new URL(u,import.meta.url);
// v11-en: the variant page with lang=en (body.lang-en) gets the English lockup (tools/build_logo_glyphs.py --lang en)
const SFX=()=>globalThis.document?.body?.classList.contains('lang-en')?'_en':'';
export async function loadLogoGlyphs(url=here(`../../../data/logo_glyphs${SFX()}.json`)){const r=await fetch(url);if(!r.ok)throw Error(`logo glyphs ${r.status}`);return r.json();}
const loadField=url=>new Promise((res,rej)=>new THREE.TextureLoader().load(String(url),t=>{t.colorSpace=THREE.NoColorSpace;t.minFilter=THREE.LinearFilter;t.magFilter=THREE.LinearFilter;t.generateMipmaps=false;t.flipY=true;res(t);},undefined,rej));
// logo_sdf.png + (optional) logo_halo.png: the hole-filled backing field the backdrop halo reads (fixer 2026-10-26: no
// glow rings in the glyph counters); the halo texture rides on sdf.userData.halo (missing file → the backing channel)
export async function loadLogoSdf(url=here(`../../../data/logo_sdf${SFX()}.png`),haloUrl=here(`../../../data/logo_halo${SFX()}.png`)){const t=await loadField(url);
 try{t.userData.halo=await loadField(haloUrl);}catch{t.userData.halo=null;}return t;}

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const sat=v=>clamp(v);
const easeOut=t=>1-Math.pow(1-sat(t),3);
const easeIn=t=>Math.pow(sat(t),2.2);
const hash=n=>{let t=(n*2654435761+1013904223)>>>0;t^=t>>>15;t=Math.imul(t,2246822519)>>>0;t^=t>>>13;t=Math.imul(t,3266489917)>>>0;t^=t>>>16;return (t>>>0)/4294967296;};
// smooth deterministic noise for shake
const vnoise=x=>{const i=Math.floor(x),f=x-i,u=f*f*(3-2*f);return (hash(i)*(1-u)+hash(i+1)*u)*2-1;};
const spring=(t,k=14,z=.32)=>t<=0?0:1-Math.exp(-z*k*t)*Math.cos(k*Math.sqrt(1-z*z)*t);// 0 → 1 with overshoot

// kinds (uKind)
const KIND={title:0,backing:1,badge:2,badgeText:3,subtitle:4,subtitleText:5,parody:6,parodyText:7,pressText:8,pressSub:8,ornament:9};
// z layout (front face z, extrusion depth, bevel thickness, bevel size)
const LAYER={
 title:{front:.24,depth:.15,bt:.035,bs:.018,seg:3},
 backing:{front:.0,depth:.09,bt:.03,bs:.022,seg:2},
 badge:{front:.17,depth:.1,bt:.025,bs:.02,seg:2},
 badgeText:{front:.215,depth:.03,bt:.012,bs:.008,seg:2},
 subtitle:{front:.07,depth:.06,bt:.018,bs:.016,seg:2},
 subtitleText:{front:.1,depth:.02,bt:.008,bs:.005,seg:1},
 parody:{front:.06,depth:.04,bt:.012,bs:.01,seg:1},
 parodyText:{front:.075,depth:.01,bt:.004,bs:.003,seg:1},
 pressText:{front:.05,depth:.03,bt:.008,bs:.005,seg:1},
 pressSub:{front:.05,depth:.02,bt:.005,bs:.003,seg:1},
 ornament:{front:.04,depth:.02,bt:.006,bs:.004,seg:1},
};

// ---------------------------------------------------------------- GLSL
const NOISE=/* glsl */`
float h21(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<6;i++){v+=a*vn(p);p=mat2(1.6,1.2,-1.2,1.6)*p+7.3;a*=.5;}return v;}
`;
// Baked once (2048², RGBA8) over the SDF rect: R grime, G scratches, B rust / blotches, A fine height.
const BAKE_FS=/* glsl */`varying vec2 vUv;${NOISE}
float scratches(vec2 uv,float ang,float dens,float seed){vec2 d=vec2(cos(ang),sin(ang));vec2 q=vec2(dot(uv,d),dot(uv,vec2(-d.y,d.x)));
 float row=floor(q.y*dens);float r=h21(vec2(row,seed));float len=fract(r*7.1);
 float along=fract(q.x*.6+r*3.7);float on=step(along,len*.5)*step(.62,r);
 float w=abs(fract(q.y*dens)-.5);return on*smoothstep(.08+.1*fract(r*13.),0.,w)*smoothstep(0.,.05,along)*smoothstep(len*.5,len*.5-.05,along);}
void main(){vec2 uv=vUv*vec2(4.6,4.7);
 float grime=fbm(uv*1.7);grime=smoothstep(.3,.78,grime+.25*(fbm(uv*7.)-.5));
 float s=0.;s=max(s,scratches(uv*2.,.35,90.,1.));s=max(s,scratches(uv*2.3+3.1,-.5,70.,2.)*.8);s=max(s,scratches(uv*1.4+7.,1.25,120.,3.)*.6);s=max(s,scratches(uv*3.+1.7,.05,160.,4.)*.7);
 s*=smoothstep(.25,.6,fbm(uv*1.3+11.));
 float rust=smoothstep(.55,.8,fbm(uv*vec2(1.2,.35)*2.+5.)+.2*(vn(uv*30.)-.5));rust=max(rust,smoothstep(.83,.95,fbm(uv*5.+19.))*.8);
 float h=fbm(uv*9.)*.6+vn(uv*60.)*.25+vn(uv*140.)*.15;
 gl_FragColor=vec4(grime,s,rust,h);}`;

// Baked once (1024², over the SDF rect): R = crack lines (Voronoi cell borders, jagged), G = where cracks may appear.
const CRACK_FS=/* glsl */`varying vec2 vUv;${NOISE}
vec2 h22(vec2 p){return vec2(h21(p),h21(p+17.3));}
float edges(vec2 p){vec2 i=floor(p),f=fract(p);float d1=8.,d2=8.;for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 o=vec2(x,y),r=o+h22(i+o)-f;float d=dot(r,r);if(d<d1){d2=d1;d1=d;}else if(d<d2)d2=d;}return sqrt(d2)-sqrt(d1);}
void main(){vec2 uv=vUv*vec2(4.6,4.7);vec2 w=uv*2.6+vec2(fbm(uv*3.),fbm(uv*3.+5.))*.55;
 float e=edges(w);float line=smoothstep(.045,.0,e)*(.5+.5*vn(uv*40.));float fine=smoothstep(.05,0.,edges(w*2.3+9.))*.6;
 float mask=smoothstep(.4,.62,fbm(uv*1.1+3.3));gl_FragColor=vec4(max(line,fine*smoothstep(.6,.8,fbm(uv*1.7+1.))),mask,0.,1.);}`;

const VS=/* glsl */`varying vec3 vP,vN,vON,vV;
void main(){vP=position;vON=normal;vN=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.);vV=mv.xyz;gl_Position=projectionMatrix*mv;}`;

const FS=/* glsl */`
uniform sampler2D tSdf,tGrunge,tCrack,tHalo;uniform float uHaloOwn;uniform vec4 uRect,uBox;uniform vec2 uZ;uniform float uAccent,uRange,uKind,uTime,uHeat,uReveal,uRevealMode,uSweep,uGlow,uFlash,uDissolve,uPulse;
varying vec3 vP,vN,vON,vV;
${NOISE}
vec3 env(vec3 R){float y=R.y;
 vec3 c=mix(vec3(.018,.012,.03),vec3(.09,.055,.14),smoothstep(-.3,.7,y));
 c+=vec3(1.,.88,.74)*1.7*smoothstep(.42,.62,y)*smoothstep(.95,.7,y)*smoothstep(.95,.2,abs(R.x+.15));// softbox strip
 c+=vec3(1.,.36,.06)*1.3*smoothstep(-.05,-.65,y);// fire bounce from below
 c+=vec3(.5,.26,1.)*.45*smoothstep(.45,.95,R.x);// violet right
 c+=vec3(.42,1.,.28)*.12*smoothstep(-.4,-.92,R.x)*smoothstep(-.6,.2,y);// sickly green left
 return c;}
vec3 lit(vec3 alb,float metal,float rough,vec3 N,vec3 V,float rimK){
 vec3 L1=normalize(vec3(-5.5,6.5,-9.)-vV),L2=normalize(vec3(.65,-.25,.55));float fall=1.6/(1.+dot(vec3(-5.5,6.5,-9.)-vV,vec3(-5.5,6.5,-9.)-vV)*.012);
 float nl1=max(dot(N,L1),0.),nl2=max(dot(N,L2),0.),nv=max(dot(N,V),0.);
 vec3 key=vec3(1.,.82,.6)*1.5*fall,fill=vec3(.42,.24,.75)*.3;
 vec3 diff=alb*(1.-metal)*(nl1*key+nl2*fill+vec3(.05,.035,.07));
 vec3 F0=mix(vec3(.04),alb,metal);vec3 F=F0+(1.-F0)*pow(1.-nv,5.);
 vec3 H=normalize(L1+V);float sp=pow(max(dot(N,H),0.),mix(8.,180.,1.-rough))*(1.-rough*.85)*1.6;
 vec3 R=reflect(-V,N);vec3 e=env(R)*mix(1.,.25,rough);
 float rim=pow(1.-nv,4.)*rimK;vec3 rimC=mix(vec3(1.,.32,.05),vec3(.55,.3,1.),smoothstep(-.3,.4,N.y))*.9;
 return diff+(sp*key+e)*F+rim*rimC;}
void main(){
 vec2 suv=(vP.xy-uRect.xy)/(uRect.zw-uRect.xy);
 vec3 sd=(texture2D(tSdf,suv).rgb-.5)*2.*uRange;// em, > 0 inside: r title, g backing, b plates
 vec4 g=texture2D(tGrunge,suv);vec4 gf=texture2D(tGrunge,fract(suv*5.3+.31));
 float face=smoothstep(.7,.96,vON.z),side=1.-smoothstep(.12,.5,abs(vON.z)),bev=clamp(1.-face-side,0.,1.);
 float zt=clamp((vP.z-uZ.y)/(uZ.x-uZ.y),0.,1.);// 0 back, 1 front
 int k=int(uKind+.5);
 // ---- reveal / dissolve (burn-in edges) ----
 float glowEdge=0.;
 if(uReveal<1.){float v;
  if(uRevealMode<.5){vec2 c=(uBox.xy+uBox.zw)*.5;v=length((vP.xy-c)/max(uBox.zw-uBox.xy,vec2(.01)))*1.25+(g.r-.5)*.35;}
  else v=(vP.x-uBox.x)/max(uBox.z-uBox.x,.01)+(g.r-.5)*.12;
  float th=uReveal*1.35-.1;if(v>th)discard;glowEdge=smoothstep(.07,0.,th-v);}
 float dEdge=0.;if(uDissolve>0.){float v=g.r*.6+gf.a*.25+gf.g*.15;float th=uDissolve*1.15-.05;if(v<th)discard;dEdge=smoothstep(.018,0.,v-th);}
 // ---- normal: fine bump on faces ----
 vec3 V=normalize(-vV);vec3 N=normalize(vN);
 {float e=1./2048.;float h0=texture2D(tGrunge,suv).a-g.g*.8,hx=texture2D(tGrunge,suv+vec2(e,0)).a-texture2D(tGrunge,suv+vec2(e,0)).g*.8,hy=texture2D(tGrunge,suv+vec2(0,e)).a-texture2D(tGrunge,suv+vec2(0,e)).g*.8;
  float bk=k==1?.9:k==4?.25:.35;N=normalize(N+(face+bev*.5)*bk*vec3(h0-hx,h0-hy,0.)*6.);}
 vec3 col=vec3(0),em=vec3(0);
 vec3 ORANGE=vec3(1.,.45,.08),EMBER=vec3(1.,.3,.04);
 float sweep=exp(-pow((vP.x+vP.y*.42-uSweep)/.2,2.));
 if(k==0){// ---- title glyphs ----
  float ty=clamp((vP.y-uBox.y)/max(uBox.w-uBox.y,.01),0.,1.);
  vec3 bone=mix(vec3(.62,.45,.3),vec3(.95,.88,.72),smoothstep(.1,.95,ty));
  bone=mix(bone,vec3(.9,.3,.06),pow(1.-ty,1.6)*.75);// infernal underlight on the lower strokes
  bone*=1.+.35*smoothstep(.03,.0,sd.r-.004);// crisp inline highlight just inside the edge// infernal underlight on the lower strokes
  float grime=g.r*.55+smoothstep(.06,0.,sd.r)*.35;bone*=1.-grime*.55;
  float rust=g.b*smoothstep(.2,.9,1.-ty)*.6;bone=mix(bone,vec3(.42,.16,.05),rust*.55);
  float chip=smoothstep(.0,.01,.022+(g.r-.55)*.07+(gf.a-.5)*.03-sd.r);// chipped paint near the edges
  chip=max(chip,smoothstep(.5,.9,g.g)*.55);
  vec3 steel=vec3(.42,.4,.4)*(.7+.4*gf.a);
  vec3 cFace=mix(lit(bone,0.,.62,N,V,.35),lit(steel,1.,.32,N,V,.5),chip);
  vec3 copper=mix(vec3(.95,.5,.16),vec3(.6,.22,.06),g.r*.8);
  vec3 cBev=lit(copper,1.,.22+g.r*.25,N,V,.35);
  vec3 bronze=mix(vec3(.11,.05,.03),vec3(.32,.14,.06),zt);
  vec3 cSide=lit(bronze,.85,.45,N,V,.6);
  em+=side*EMBER*(2.4*smoothstep(.3,0.,zt)+.08)*(.75+.5*gf.a)*uGlow;// ember glow at the back of the extrusion
  vec4 cr=texture2D(tCrack,suv);float crack=cr.r*cr.g*smoothstep(.012,.035,sd.r)*face;
  cFace*=1.-crack*.85;em+=crack*vec3(1.,.24,.02)*(1.3+.7*sin(uTime*2.3+vP.x*2.)+uHeat*5.)*uGlow;
  col=cFace*face+cBev*bev+cSide*side;
  col+=(cFace*face+cBev*bev)*sweep*1.6*vec3(1.,.9,.8);
  em+=uHeat*(ORANGE*2.2*(bev+side)+vec3(1.,.3,.06)*1.3*face*(1.-chip*.5));
 }else if(k==1){// ---- backing slab: dark hammered iron, glowing rim, inlay line, contact shadow + glyph halo ----
  vec3 iron=mix(vec3(.03,.022,.04),vec3(.075,.05,.085),g.r)*(.75+.5*gf.a);
  float dOut=max(-sd.r,0.);
  float sh=1.-.78*smoothstep(-.065,.01,(texture2D(tSdf,suv+vec2(.028,-.038)/(uRect.zw-uRect.xy)).r-.5)*2.*uRange);
  vec3 cFace=lit(iron,.55,.6,N,V,.15)*sh;
  em+=face*EMBER*.35*exp(-dOut/.018)*uGlow;// warm spill around the glyph bases
  float sdg=mix(sd.g,(texture2D(tHalo,suv).r-.5)*2.*uRange,uHaloOwn);// filled field: no inlay ring inside the counters
  float inlay=smoothstep(.007,.0,abs(sdg-.028))*face;em+=inlay*ORANGE*1.6*uGlow*(.7+.3*g.r);
  vec3 cBev=lit(vec3(.4,.3,.45),1.,.28,N,V,.6);
  vec3 cSide=lit(vec3(.06,.03,.05),.6,.5,N,V,.8);
  em+=side*ORANGE*2.8*uGlow*smoothstep(.0,.6,zt)*(.85+.15*sin(vP.x*3.+uTime*1.7));
  col=cFace*face+cBev*bev+cSide*side;
 }else if(k==2){// ---- ticket badge: worn JR-green enamel over steel, printed border, perforations ----
  float ty=clamp((vP.y-uBox.y)/max(uBox.w-uBox.y,.01),0.,1.);
  vec3 green=mix(vec3(0.,.42,.22),vec3(.05,.75,.42),ty)*(1.-g.r*.45);
  float wear=smoothstep(0.,.01,.02+(g.r-.5)*.05-sd.b)+smoothstep(.45,.8,g.g)*.8;
  float border=smoothstep(.006,0.,abs(sd.b-.045));
  float px=min(abs(vP.x-(uBox.x+.17)),abs(vP.x-(uBox.z-.17)));float perf=smoothstep(.012,.004,px)*step(.45,fract(vP.y*24.));
  vec3 a=mix(green,vec3(.92,.96,.9),border*.9);a=mix(a,vec3(.02,.06,.04),perf);
  vec3 cFace=mix(lit(a,0.,.35,N,V,.3),lit(vec3(.7,.72,.72),1.,.3,N,V,.5),clamp(wear,0.,1.));
  vec3 cBev=lit(vec3(.8,.85,.82),1.,.18,N,V,1.);vec3 cSide=lit(vec3(.02,.2,.1),.6,.4,N,V,1.);
  col=cFace*face+cBev*bev+cSide*side+(cFace*face+cBev*bev)*sweep*.8;
  em+=uHeat*ORANGE*1.5*(bev+side);
 }else if(k==3){// ---- JR編 letters: chrome ----
  vec3 chrome=vec3(.93,.95,.97)*(.85+.2*gf.a);
  col=lit(chrome,0.,.4,N,V,.4)*face*.85+lit(chrome,1.,.12,N,V,1.)*(bev+side)+lit(vec3(.7),1.,.2,N,V,.6)*face*.35;
  col+=face*vec3(.9,1.,.95)*.18;
 }else if(k==4){// ---- subtitle bar: black lacquer, ember border line ----
  vec3 lac=vec3(.025,.02,.032)*(.8+.5*g.r);
  float border=smoothstep(.008,0.,abs(sd.b-.032))*face;
  col=lit(lac,.3,.28,N,V,.4)*face+lit(vec3(.5,.35,.6),1.,.25,N,V,1.)*bev+lit(vec3(.05),.5,.4,N,V,.6)*side;
  em+=border*ORANGE*2.4*uGlow+side*ORANGE*1.5*uGlow;
 }else if(k==5){// ---- subtitle letters: warm ivory with gold edge ----
  vec3 iv=mix(vec3(1.,.93,.8),vec3(1.,.55,.15),uAccent)*(1.-g.r*.25);em+=face*uAccent*vec3(1.,.4,.08)*.9*uGlow;
  col=lit(iv,0.,.5,N,V,.3)*face+lit(vec3(1.,.62,.25),1.,.25,N,V,1.)*(bev+side);
  col+=face*vec3(1.,.7,.4)*.22;
 }else if(k==6){// ---- ※パロディ tag: candle-yellow enamel ----
  vec3 y=vec3(1.,.78,.16)*(1.-g.r*.3);float wear=smoothstep(0.,.01,.012+(g.r-.5)*.03-sd.b);
  col=mix(lit(y,0.,.4,N,V,.3),lit(vec3(.6),1.,.3,N,V,.4),wear)*face+lit(vec3(.9,.7,.2),1.,.3,N,V,1.)*bev+lit(vec3(.3,.2,.02),.5,.4,N,V,.5)*side;
  col+=face*vec3(1.,.8,.3)*.25;
 }else if(k==7){col=lit(vec3(.03,.02,.04),.2,.5,N,V,.2);
 }else if(k==8){// ---- PRESS START: hot white, pulsing ----
  col=lit(vec3(.9),0.,.4,N,V,.3)*face+lit(vec3(1.,.6,.3),1.,.25,N,V,1.)*(bev+side);
  em+=(face*vec3(1.,.93,.82)*1.3+(bev+side)*ORANGE*2.)*uPulse;
 }else{// ornament
  col=lit(vec3(1.,.55,.2),1.,.3,N,V,1.);em+=ORANGE*2.6*uGlow;}
 em+=glowEdge*vec3(1.,.55,.15)*7.+dEdge*vec3(1.,.5,.12)*4.;
 col+=em+uFlash*vec3(1.,.82,.62);
 gl_FragColor=vec4(col,1.);}`;

// backdrop: darkening plate + smoke + glow card (behind the lockup), all in one fullscreen-ish plane
const BACK_FS=/* glsl */`uniform sampler2D tSdf,tGrunge,tHalo;uniform vec4 uRect;uniform float uRange,uTime,uDark,uGlowAmt,uGlowB,uRing,uRingA,uFlashAll,uHaloOwn;varying vec2 vXY;
${NOISE}
void main(){vec2 suv=(vXY-uRect.xy)/(uRect.zw-uRect.xy);
 float inside=step(0.,suv.x)*step(suv.x,1.)*step(0.,suv.y)*step(suv.y,1.);
 vec3 sd=(texture2D(tSdf,clamp(suv,0.,1.)).rgb-.5)*2.*uRange;
 float hg=mix(sd.g,(texture2D(tHalo,clamp(suv,0.,1.)).r-.5)*2.*uRange,uHaloOwn);
 float dG=inside>.5?max(-hg,0.):9.,dB=inside>.5?max(-sd.b,0.):9.;float fadeG=smoothstep(uRange,uRange*.5,dG),fadeB=smoothstep(uRange,uRange*.5,dB);
 float r=length(vXY*vec2(.62,1.)-vec2(0.,.15));
 float smoke=fbm(vXY*.55+vec2(uTime*.05,-uTime*.11))*fbm(vXY*1.3-vec2(uTime*.08,uTime*.04)+3.);
 float dark=uDark*(.82*exp(-r*r/7.5)+.2*smoke);
 vec3 glow=vec3(1.,.26,.04)*(exp(-dG/.055)*fadeG*.6*smoothstep(0.,.012,dG)+exp(-dB/.05)*fadeB*.08*uGlowB*smoothstep(0.,.012,dB))*uGlowAmt*(.55+.9*smoke);
 glow+=vec3(.45,.2,.9)*.22*uGlowAmt*exp(-r*r/3.)*smoke;
 float rr=length(vXY-vec2(0.,.35));float ring=exp(-pow((rr-uRing)/(.05+.1*uRing/5.5),2.))*uRingA*(.45+.9*smoke);glow+=vec3(1.,.45,.12)*ring*2.;
 glow+=vec3(1.,.72,.45)*uFlashAll;gl_FragColor=vec4(glow,max(dark-uFlashAll*.5,0.));}`;
const BACK_VS=/* glsl */`varying vec2 vXY;void main(){vXY=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;

// ---------------------------------------------------------------- particles
// One quad per particle, all motion closed-form in the vertex shader (deterministic in uTime).
function quadParticles(n,seed){const pos=new Float32Array(n*4*3),corner=new Float32Array(n*4*2),rnd=new Float32Array(n*4*4),idx=[];
 for(let i=0;i<n;i++){const r=[hash(seed*7919+i*4+1),hash(seed*7919+i*4+2),hash(seed*7919+i*4+3),hash(seed*7919+i*4+4)];
  [[0,-1],[1,-1],[1,1],[0,1]].forEach((c,j)=>{corner.set(c,(i*4+j)*2);rnd.set(r,(i*4+j)*4);});const b=i*4;idx.push(b,b+1,b+2,b,b+2,b+3);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('aCorner',new THREE.BufferAttribute(corner,2));g.setAttribute('aRnd',new THREE.BufferAttribute(rnd,4));g.setIndex(idx);
 g.boundingSphere=new THREE.Sphere(new THREE.Vector3(),1e4);return g;}

const SPARK_VS=/* glsl */`attribute vec2 aCorner;attribute vec4 aRnd;uniform float uTime,uT0,uLife;uniform vec4 uEmit;uniform vec2 uSpeed;uniform float uUp;varying float vA;varying vec2 vC;varying float vHot;
vec3 at(float a){vec2 o=mix(uEmit.xy,uEmit.zw,aRnd.xy);float side=o.x<(uEmit.x+uEmit.z)*.5?-1.:1.;float ang=mix(.08,1.25,pow(aRnd.z,.7));ang=side<0.?3.14159-ang:ang;float sp=mix(uSpeed.x,uSpeed.y,pow(fract(aRnd.w*7.31),1.5));
 vec3 v=vec3(cos(ang)*sp,sin(ang)*sp*uUp,(fract(aRnd.y*13.7)-.4)*sp*.5);float k=1.6;vec3 p=vec3(o,mix(-.05,.28,fract(aRnd.x*9.1)))+v*(1.-exp(-k*a))/k;p.y-=2.6*a*a;return p;}
void main(){float a=uTime-uT0-aRnd.w*.07;float life=uLife*mix(.45,1.,fract(aRnd.z*5.3));vA=0.;vC=aCorner;
 if(a<0.||a>life){gl_Position=vec4(2.,2.,2.,1.);return;}
 vec4 P=modelViewMatrix*vec4(at(a),1.),Q=modelViewMatrix*vec4(at(max(0.,a-.028)),1.);
 vec2 d=P.xy-Q.xy;float l=length(d);vec2 dir=l>1e-5?d/l:vec2(1,0);vec2 nrm=vec2(-dir.y,dir.x);float w=.007*(1.-a/life)+.0015;
 vec4 V=mix(Q,P,aCorner.x);V.xy+=nrm*aCorner.y*w;if(aCorner.x>.5)V.xy+=dir*w;
 gl_Position=projectionMatrix*V;vA=1.-a/life;vHot=1.-smoothstep(0.,.5,a/life);}`;
const SPARK_FS=/* glsl */`varying float vA;varying vec2 vC;varying float vHot;void main(){float e=1.-abs(vC.y);vec3 c=mix(vec3(1.,.28,.03),vec3(1.,.72,.3),vHot);gl_FragColor=vec4(c*e*vA*(2.5+3.*vHot),1.);}`;

const EMBER_VS=/* glsl */`attribute vec2 aCorner;attribute vec4 aRnd;uniform float uTime,uAmt;varying vec2 vC;varying float vA;
void main(){float sp=mix(.12,.42,aRnd.z);float u=fract(uTime*sp/6.+aRnd.w);float z=mix(-1.2,2.2,pow(aRnd.y,1.6));
 vec3 p=vec3((aRnd.x-.5)*7.+sin(uTime*.7+aRnd.w*40.)*.25,-4.2+u*8.4,z);p.x+=sin(u*6.28*1.3+aRnd.z*9.)*.35;
 float s=mix(.008,.028,aRnd.z*aRnd.z)*(1.+max(z-1.,0.)*1.5);vec4 V=modelViewMatrix*vec4(p,1.);V.xy+=(aCorner*2.-vec2(1.,0.)-vec2(0.,0.))*vec2(s,s);
 gl_Position=projectionMatrix*V;vC=vec2(aCorner.x*2.-1.,aCorner.y);
 float fl=.55+.45*sin(uTime*(6.+aRnd.x*9.)+aRnd.y*50.);vA=uAmt*smoothstep(0.,.12,u)*smoothstep(1.,.7,u)*fl/(1.+max(z-1.,0.)*2.);}`;
const EMBER_FS=/* glsl */`varying vec2 vC;varying float vA;void main(){float r=length(vC);float e=exp(-r*r*4.);gl_FragColor=vec4(vec3(1.,.42,.08)*e*vA*4.,1.);}`;

const DUST_VS=/* glsl */`attribute vec2 aCorner;attribute vec4 aRnd;uniform float uTime,uT0;uniform vec4 uEmit;varying vec2 vC,vUv;varying float vA;
void main(){float a=uTime-uT0-aRnd.w*.12;vA=0.;vC=vec2(aCorner.x*2.-1.,aCorner.y);if(a<0.||a>2.6){gl_Position=vec4(2.,2.,2.,1.);return;}
 vec2 o=mix(uEmit.xy,uEmit.zw,aRnd.xy);float side=aRnd.x<.5?-1.:1.;vec2 v=vec2(side*mix(.4,1.8,aRnd.z),mix(-.05,.5,aRnd.y));
 vec3 p=vec3(o+v*(1.-exp(-2.*a))/2.,aRnd.z<.6?-.4:.55);float s=mix(.35,.9,aRnd.w)*(1.+a*.9);
 vec4 V=modelViewMatrix*vec4(p,1.);V.xy+=(vec2(aCorner.x*2.-1.,aCorner.y))*s;gl_Position=projectionMatrix*V;vUv=vec2(aCorner.x,aCorner.y*.5+.5)*.35+aRnd.xy;
 vA=smoothstep(0.,.08,a)*(1.-smoothstep(.2,2.2,a))*(aRnd.z<.6?.38:.16);}`;
const DUST_FS=/* glsl */`uniform sampler2D tGrunge;varying vec2 vC,vUv;varying float vA;void main(){float r=length(vC);float n=texture2D(tGrunge,vUv).r;float m=smoothstep(1.,.1,r)*smoothstep(.25,.75,n+.2*(1.-r));vec3 c=mix(vec3(.16,.11,.1),vec3(.55,.3,.16),n*.6);gl_FragColor=vec4(c,m*vA);}`;

// ---------------------------------------------------------------- the logo
export class Logo3D{
 constructor({data,sdf,aspect=9/16,press=true,backdrop=1,frame={},particles=true,tag=false}={}){
  if(!data||!sdf)throw Error('Logo3D needs {data: loadLogoGlyphs(), sdf: loadLogoSdf()}');
  this.data=data;this.aspect=aspect;this.opts={press,backdrop,particles,tag,frameY:frame.y??-.32,frameW:frame.width??.9};
  this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(24,aspect,.5,200);
  this.visible=true;this.t=-1;this._dissolve=0;this.press={on:false,k:0};this._baked=false;
  this.state={shake:{x:0,y:0,roll:0},flash:0,impact:0,phase:'hidden'};
  this.grunge=new THREE.WebGLRenderTarget(2048,2048,{depthBuffer:false,generateMipmaps:true,minFilter:THREE.LinearMipmapLinearFilter,magFilter:THREE.LinearFilter,wrapS:THREE.RepeatWrapping,wrapT:THREE.RepeatWrapping});
  const r=data.sdf.rect;this.rect=new THREE.Vector4(r[0],r[1],r[2],r[3]);
  this.crack=new THREE.WebGLRenderTarget(1024,1024,{depthBuffer:false,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});
  const common={tHalo:{value:sdf.userData?.halo||sdf},uHaloOwn:{value:sdf.userData?.halo?1:0},tSdf:{value:sdf},tGrunge:{value:this.grunge.texture},tCrack:{value:this.crack.texture},uRect:{value:this.rect},uRange:{value:data.sdf.range},uTime:{value:0}};
  this.common=common;
  this.root=new THREE.Group();this.scene.add(this.root);
  // line boxes (gradient extents per title line)
  const lineBox={};for(const it of data.items)if(it.group==='title'){const b=lineBox[it.line]??=[1e9,1e9,-1e9,-1e9];b[0]=Math.min(b[0],it.bbox[0]);b[1]=Math.min(b[1],it.bbox[1]);b[2]=Math.max(b[2],it.bbox[2]);b[3]=Math.max(b[3],it.bbox[3]);}
  this.parts=[];
  for(const it of data.items){const L=LAYER[it.group];if(!L)continue;
   // fixer 2026-10-26: backing slabs without counters when the filled halo field is present (their glowing inner walls
   // read as stray rings inside 谷 / between 渋 and 谷)
   const fillHoles=it.group==='backing'&&!!sdf.userData?.halo;
   const shapes=it.polys.map(p=>{const s=new THREE.Shape(p.o.map(([x,y])=>new THREE.Vector2(x,y)));if(!fillHoles)for(const h of p.h)s.holes.push(new THREE.Path(h.map(([x,y])=>new THREE.Vector2(x,y))));return s;});
   const geo=new THREE.ExtrudeGeometry(shapes,{depth:L.depth,bevelEnabled:true,bevelThickness:L.bt,bevelSize:L.bs,bevelOffset:-L.bs*.55,bevelSegments:L.seg,curveSegments:1,steps:1});
   geo.translate(0,0,L.front-L.depth-L.bt);geo.computeBoundingSphere();
   const box=it.group==='title'?lineBox[it.line]:it.bbox;
   const mat=new THREE.ShaderMaterial({vertexShader:VS,fragmentShader:FS,uniforms:{...common,uBox:{value:new THREE.Vector4(...box)},uZ:{value:new THREE.Vector2(L.front,L.front-L.depth-2*L.bt)},
    uKind:{value:KIND[it.group]},uAccent:{value:it.group==='subtitleText'&&it.index<5?1:0},uHeat:{value:0},uReveal:{value:1},uRevealMode:{value:it.group==='subtitle'?1:0},uSweep:{value:-99},uGlow:{value:1},uFlash:{value:0},uDissolve:{value:0},uPulse:{value:1}}});
   const mesh=new THREE.Mesh(geo,mat);const pivot=new THREE.Group();pivot.position.set(it.center[0],it.center[1],0);mesh.position.set(-it.center[0],-it.center[1],0);pivot.add(mesh);this.root.add(pivot);
   this.parts.push({it,pivot,mesh,mat,seed:hash(this.parts.length*31+7)});}
  this.byGroup=g=>this.parts.filter(p=>p.it.group===g);
  // backdrop plane (behind everything)
  // opaque list (transparent:false) with custom blending, so it draws BEFORE the glyphs (renderOrder -10)
  const bmat=new THREE.ShaderMaterial({vertexShader:BACK_VS,fragmentShader:BACK_FS,transparent:false,depthWrite:false,depthTest:false,
   uniforms:{...common,tHalo:{value:sdf.userData?.halo||sdf},uHaloOwn:{value:sdf.userData?.halo?1:0},uDark:{value:backdrop},uGlowAmt:{value:0},uGlowB:{value:0},uFlashAll:{value:0},uRing:{value:0},uRingA:{value:0}},blending:THREE.CustomBlending,blendSrc:THREE.OneFactor,blendDst:THREE.OneMinusSrcAlphaFactor});
  this.back=new THREE.Mesh(new THREE.PlaneGeometry(26,40),bmat);this.back.position.z=-.6;this.back.renderOrder=-10;this.scene.add(this.back);
  // particles
  const add=(n,seed,vs,fs,u,blend)=>{const m=new THREE.Mesh(quadParticles(n,seed),new THREE.ShaderMaterial({vertexShader:vs,fragmentShader:fs,uniforms:{uTime:{value:0},...u},transparent:true,depthWrite:false,depthTest:true,blending:blend}));m.frustumCulled=false;m.renderOrder=10;this.scene.add(m);return m;};
  const tb=this._bounds('title');const bb=this._bounds('badge');
  this.sparks=[
   add(280,1,SPARK_VS,SPARK_FS,{uT0:{value:T.slam},uLife:{value:1.5},uEmit:{value:new THREE.Vector4(tb[0],tb[1]-.02,tb[2],tb[1]+.12)},uSpeed:{value:new THREE.Vector2(1.2,5.)},uUp:{value:1}},THREE.AdditiveBlending),
   add(110,2,SPARK_VS,SPARK_FS,{uT0:{value:T.badge+.06},uLife:{value:1.1},uEmit:{value:new THREE.Vector4(bb[0],bb[1],bb[2],bb[1]+.05)},uSpeed:{value:new THREE.Vector2(1.,5.)},uUp:{value:1}},THREE.AdditiveBlending),
   add(70,3,SPARK_VS,SPARK_FS,{uT0:{value:T.subtitle[0]},uLife:{value:.9},uEmit:{value:new THREE.Vector4(0,0,0,0)},uSpeed:{value:new THREE.Vector2(.6,3.)},uUp:{value:.8}},THREE.AdditiveBlending)];
  this.embers=add(170,4,EMBER_VS,EMBER_FS,{uAmt:{value:0}},THREE.AdditiveBlending);
  this.dust=add(46,5,DUST_VS,DUST_FS,{uT0:{value:T.slam},tGrunge:common.tGrunge,uEmit:{value:new THREE.Vector4(tb[0],tb[1]-.2,tb[2],tb[1]+.4)}},THREE.NormalBlending);
  this.dust.renderOrder=5;
  for(const m of [...this.sparks,this.embers,this.dust])m.visible=particles;
  this.layout(aspect);
  this._bakeScene=null;
 }
 _bounds(group){const b=[1e9,1e9,-1e9,-1e9];for(const p of this.parts)if(p.it.group===group){const q=p.it.bbox;b[0]=Math.min(b[0],q[0]);b[1]=Math.min(b[1],q[1]);b[2]=Math.max(b[2],q[2]);b[3]=Math.max(b[3],q[3]);}return b;}
 // frame the lockup: width = frameW of the view width (portrait) or fit the height (landscape)
 layout(aspect=this.aspect){this.aspect=aspect;const c=this.camera;c.aspect=aspect;
  const tb=this._bounds('title'),all=this.data.bbox;const w=(all[2]-all[0])+.1,h=(all[3]-all[1])+.3;
  const tan=Math.tan(THREE.MathUtils.degToRad(c.fov/2));
  const dW=w/this.opts.frameW/(2*tan*aspect),dH=h/.82/(2*tan);this.dist=Math.max(dW,dH);
  this.look=new THREE.Vector3(0,(all[1]+all[3])/2-this.opts.frameY,0);c.updateProjectionMatrix();this._placeCamera(0,0,0);}
 _placeCamera(yaw,pitch,roll,push=0){const c=this.camera,d=this.dist*(1-push);
  c.position.set(this.look.x+Math.sin(yaw)*d,this.look.y+Math.sin(pitch)*d,Math.cos(yaw)*Math.cos(pitch)*d);c.up.set(Math.sin(roll),Math.cos(roll),0);c.lookAt(this.look);c.updateMatrixWorld();}
 bake(renderer){if(this._baked)return;const prev=renderer.getRenderTarget(),cam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  for(const [fs,target] of [[BAKE_FS,this.grunge],[CRACK_FS,this.crack]]){const m=new THREE.ShaderMaterial({vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,fragmentShader:fs,depthTest:false,depthWrite:false});
   const s=new THREE.Scene(),q=new THREE.Mesh(new THREE.PlaneGeometry(2,2),m);q.frustumCulled=false;s.add(q);renderer.setRenderTarget(target);renderer.render(s,cam);m.dispose();q.geometry.dispose();}
  renderer.setRenderTarget(prev);this._baked=true;}
 setPress(on,k=0){this.press={on:!!on,k:clamp(k)};}
 // ---- the animation: pure function of tl (seconds since the logo sequence began) ----
 setTime(tl){this.t=tl;const S=this.state;
  if(tl<0){this.root.visible=false;this.back.visible=false;for(const m of [...this.sparks,this.embers,this.dust])m.visible=false;S.phase='hidden';S.flash=0;S.impact=0;S.shake={x:0,y:0,roll:0};return S;}
  this.root.visible=this.back.visible=true;for(const m of [...this.sparks,this.embers,this.dust])m.visible=this.opts.particles;
  const u=v=>{for(const p of this.parts)p.mat.uniforms.uTime.value=v;};u(tl);this.common.uTime.value=tl;
  for(const m of [...this.sparks,this.embers,this.dust])m.material.uniforms.uTime.value=tl;
  const slam=T.slam,ds=tl-slam;
  // title glyphs: fly in from the camera side, staggered, hot; land at the slam
  const titles=this.byGroup('title');const n=titles.length;
  titles.forEach((p,i)=>{const it=p.it;const t0=.08+i*.032,t1=slam-.0;const k=easeIn((tl-t0)/(t1-t0));
   const r1=hash(i*17+3)-.5,r2=hash(i*17+5)-.5,r3=hash(i*17+9)-.5;
   if(tl<t0){p.pivot.visible=false;return;}p.pivot.visible=true;
   const fly=1-k;p.pivot.position.set(it.center[0]+r1*3.2*fly,it.center[1]+r2*2.6*fly+.4*fly,7.5*fly);
   p.pivot.rotation.set(r2*1.4*fly,r1*1.8*fly,r3*1.2*fly);
   const land=ds>0?1:0;const sq=ds>0?Math.exp(-ds*9)*Math.sin(ds*38)*.05:0;p.pivot.scale.setScalar(1+sq);
   p.mat.uniforms.uHeat.value=ds<0?.25+.75*k:Math.max(0,1-ds/1.1)**1.6*.9;
   p.mat.uniforms.uGlow.value=1;});
  // backing slabs burn in from their centres (0..slam), then glow settles
  for(const p of this.byGroup('backing')){const k=sat((tl-.3-p.it.line*.08)/(.62));p.mat.uniforms.uReveal.value=k>=1?1:k;p.pivot.visible=tl>.3;
   p.mat.uniforms.uGlow.value=ds<0?.6:1+Math.exp(-ds*2.2)*1.6;}
  // whole lockup: slam punch (scale + z), then slow breathing drift
  const punch=ds<0?0:(1-spring(ds,16,.35));this.root.scale.setScalar(1+punch*.09);this.root.position.z=punch*.6;
  // badge drop
  const tb=tl-T.badge;
  for(const p of [...this.byGroup('badge'),...this.byGroup('badgeText')]){const it=p.it;const k=easeIn(sat((tl-(T.badge-.32))/.32));p.pivot.visible=tl>T.badge-.32;
   const fly=1-k;p.pivot.position.set(it.center[0]+.8*fly,it.center[1]+2.2*fly,3.*fly);p.pivot.rotation.set(0,0,-.5*fly+(tb>0?Math.exp(-tb*8)*Math.sin(tb*30)*.06:0));
   p.mat.uniforms.uHeat.value=tb<0?.5*k:Math.max(0,.6-tb)*.8;}
  // parody tag
  for(const p of [...this.byGroup('parody'),...this.byGroup('parodyText')]){const k=easeOut(sat((tl-T.tag)/.25));p.pivot.visible=this.opts.tag&&tl>=T.tag;p.pivot.scale.setScalar(.6+.4*k+(k<1?Math.sin(k*Math.PI)*.15:0));}
  // subtitle bar wipe + text
  const [s0,s1]=T.subtitle,ks=sat((tl-s0)/(s1-s0));
  for(const p of this.byGroup('subtitle')){p.pivot.visible=tl>=s0;p.mat.uniforms.uReveal.value=ks>=1?1:ks;}
  const sb=this._bounds('subtitle');this.sparks[2].material.uniforms.uEmit.value.set(sb[0]+(sb[2]-sb[0])*Math.min(ks,.98)-.02,sb[1],sb[0]+(sb[2]-sb[0])*Math.min(ks,.98)+.02,sb[3]);
  this.sparks[2].material.uniforms.uT0.value=s0;
  this.byGroup('subtitleText').forEach((p,i,a)=>{const x=(p.it.center[0]-sb[0])/(sb[2]-sb[0]);const k=easeOut(sat((ks-x*.9-.08)/.12));p.pivot.visible=k>0;p.pivot.position.z=(1-k)*.3;p.pivot.scale.setScalar(.85+.15*k);p.mat.uniforms.uHeat.value=0;});
  // sweep
  const [w0,w1]=T.sweep;const sw=tl>w0&&tl<w1?-4.5+9*((tl-w0)/(w1-w0)):-99;for(const p of this.parts)p.mat.uniforms.uSweep.value=sw;
  // PRESS START
  const pr=this.press;const pulse=.55+.45*Math.cos(tl*Math.PI*2*.9);
  for(const p of [...this.byGroup('pressText'),...this.byGroup('pressSub'),...this.byGroup('ornament')]){p.pivot.visible=this.opts.press&&pr.on;p.mat.uniforms.uPulse.value=pulse+pr.k*2.5;p.mat.uniforms.uGlow.value=.7+.5*pulse+pr.k*2;
   p.pivot.scale.setScalar(1+pr.k*.06);}
  // backdrop + rings + flash
  const B=this.back.material.uniforms;B.uDark.value=this.opts.backdrop*sat(tl/.5)*(1-this._dissolve);B.uGlowAmt.value=(ds<0?sat((tl-.62)/.28)*.3:.6+1.1*Math.exp(-ds*1.6)+.12*Math.sin(tl*2.1))*(1-this._dissolve)**4;
  B.uGlowB.value=sat((tl-T.subtitle[1])/.5);
  B.uRing.value=ds>0?easeOut(ds/.6)*5.5:0;B.uRingA.value=ds>0?Math.max(0,1-ds/.6)**1.5:0;
  this.embers.material.uniforms.uAmt.value=sat(tl/1.2)*(1+.6*Math.exp(-Math.max(ds,0)*1.5)*(ds>0?1:0));
  const flash=ds>=0?Math.exp(-ds*14)*.85:0;const fb=tb>=0?Math.exp(-tb*16)*.35:0;
  for(const p of this.parts)p.mat.uniforms.uFlash.value=(flash+fb)*.35;B.uFlashAll.value=(flash+fb)*.22;
  // camera: drift + shake (logo camera); host reads state.shake
  const amp=(ds>=0?Math.exp(-ds*5.5)*.9:0)+(tb>=0?Math.exp(-tb*8)*.35:0)+(ds<0&&ds>-.5?(.5+ds)*.05:0);
  const sx=vnoise(tl*38+3)*amp,sy=vnoise(tl*41+11)*amp,sr=vnoise(tl*29+23)*amp;
  const yaw=THREE.MathUtils.degToRad(-13+5*easeOut((tl-slam)/3.2))+.012*Math.sin(tl*.6),pitch=THREE.MathUtils.degToRad(-9+2*easeOut((tl-slam)/3))+.008*Math.sin(tl*.45+1);
  this._placeCamera(yaw+sx*.012,pitch+sy*.012,sr*.012,ds<0?-.04*(1-sat(tl/slam)):.02*easeOut(ds/3)-.035*punch);
  S.shake={x:sx,y:sy,roll:sr};S.flash=flash+fb;S.impact=Math.max(ds>=0?Math.exp(-ds*7):0,tb>=0?Math.exp(-tb*9)*.4:0);
  S.phase=tl<slam?'burn-in':tl<T.settle?'slam':'hold';
  return S;}
 // dissolve the whole lockup into embers (0..1), for the cut out of the opening (call before or after setTime)
 setDissolve(k){this._dissolve=clamp(k);for(const p of this.parts)p.mat.uniforms.uDissolve.value=this._dissolve;if(this.t>=0)this.setTime(this.t);}
 renderOver(renderer){if(!this.visible||this.t<0)return;this.bake(renderer);const ac=renderer.autoClear;renderer.autoClear=false;renderer.clearDepth();renderer.render(this.scene,this.camera);renderer.autoClear=ac;}
 attach(scene,camera){this.host={scene,camera};const prev=scene.onAfterRender;
  scene.onAfterRender=(renderer,sc,cam,...rest)=>{prev?.call(scene,renderer,sc,cam,...rest);if(cam===camera&&!this._inside){this._inside=true;try{this.renderOver(renderer);}finally{this._inside=false;}}};
  this.detach=()=>{scene.onAfterRender=prev||(()=>{});};return this;}
 dispose(){this.detach?.();for(const p of this.parts){p.mesh.geometry.dispose();p.mat.dispose();}this.grunge.dispose();this.crack.dispose();}
}
