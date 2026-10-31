// Static city: PLATEAU footprints + heights, OSM roads/shops, baked street light.
// Everything is generated procedurally from the bundled data at load time; no
// external textures, models or fonts are shipped (system fonts draw signage).
import * as THREE from '../vendor/three.module.min.js';
import {shared,common} from './shaders.mjs';
import {CORNERS,roadHalfWidth} from './simulation.mjs';

const FONT='"Noto Sans CJK JP","Noto Sans JP","Hiragino Sans","Yu Gothic",sans-serif';
const FOOT=['footway','pedestrian','path','steps','living_street','elevator','cycleway'];
const surface=r=>Number(r.tags.layer||0)>=0&&r.tags.tunnel!=='yes'&&r.tags.indoor!=='yes';
function mulberry(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function inside(x,z,ring){let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}

// Generic shop-category words for signage (no names, logos or trademarks).
const WORDS={restaurant:['食堂','ラーメン','焼肉','寿司','中華','定食','そば'],cafe:['珈琲','喫茶','CAFE'],bar:['BAR','酒場'],pub:['居酒屋','酒場','立呑'],fast_food:['牛丼','軽食','餃子'],clothes:['古着','FASHION','洋服'],chemist:['薬','くすり'],books:['書店'],convenience:['24時間'],shoes:['靴'],optician:['眼鏡'],music:['音楽','CD'],video_games:['ゲーム'],games:['ゲーム'],mobile_phone:['携帯'],cosmetics:['化粧品'],jewelry:['宝飾'],sports:['SPORTS'],karaoke:['カラオケ'],default:['営業中','雑貨','カラオケ','OPEN','渋谷']};
const NEON=[0xff2d75,0x29e6ff,0xffb627,0x9d4bff,0x3dff8b,0xff5a1f,0xffffff,0xff3df5,0x4d7cff];

// v11.1: the EN edition of the series (page body.lang-en) paints the same signs with English words (same atlas slots, same
// random draws; no CJK in the EN output). JP pages are unchanged.
const WORDS_EN={'食堂':'DINER','ラーメン':'RAMEN','焼肉':'BBQ','寿司':'SUSHI','中華':'CHINESE','定食':'MEALS','そば':'SOBA','珈琲':'COFFEE','喫茶':'CAFE',
 '酒場':'TAVERN','居酒屋':'IZAKAYA','立呑':'DRINKS','牛丼':'GYUDON','軽食':'SNACKS','餃子':'GYOZA','古着':'VINTAGE','洋服':'CLOTHES','薬':'PHARMACY',
 'くすり':'DRUGS','書店':'BOOKS','24時間':'24H','靴':'SHOES','眼鏡':'GLASSES','音楽':'MUSIC','ゲーム':'GAMES','携帯':'MOBILE','化粧品':'BEAUTY',
 '宝飾':'JEWELRY','カラオケ':'KARAOKE','営業中':'OPEN','雑貨':'GOODS','渋谷':'SHIBUYA'};
const EN_PAGE=()=>typeof document!=='undefined'&&!!document.body?.classList.contains('lang-en');
// theme (optional): {words, share, neon} adds themed sign words; omitted in the normal mode.
// science-sim: fillText replacement that paints each character as a hollow block (signage stays colourful but unreadable).
function illegible(c){return (str,x,y)=>{const px=+/(\d+)px/.exec(c.font)[1],chars=[...String(str)],w=c.measureText(String(str)).width,left=c.textAlign==='center'?x-w/2:x,bw=w/Math.max(1,chars.length);
 chars.forEach((_,i)=>{const bx=left+i*bw+bw*.1,by=y-px*.36,ww=bw*.8,hh=px*.72;c.fillRect(bx,by,ww,hh);c.clearRect(bx+ww*.28,by+hh*.2,ww*.44,hh*.18);c.clearRect(bx+ww*.28,by+hh*.6,ww*.44,hh*.18);});};}
export function buildCity({scene,osm,plateau,config,theme=null}){
 const rnd=mulberry(1234);
 const group=new THREE.Group();scene.add(group);
 const reflective=[];// objects also drawn in the wet-road reflection pass
 // ---------- Building geometry with facade coordinates ----------
 const pos=[],nor=[],fac=[],idx=[];const edges=[];const meta=[];
 plateau.buildings.forEach((b,bi)=>{
  const ring=b.ring.slice();if(ring.length>2&&ring[0][0]===ring.at(-1)[0]&&ring[0][1]===ring.at(-1)[1])ring.pop();if(ring.length<3)return;
  const h=Math.max(3,b.height),seed=rnd();let cx=0,cz=0;ring.forEach(p=>{cx+=p[0];cz+=p[1];});cx/=ring.length;cz/=ring.length;
  // Outward side test on the longest edge.
  let longest=0,sign=1;for(let k=0;k<ring.length;k++){const a=ring[k],c=ring[(k+1)%ring.length],l=Math.hypot(c[0]-a[0],c[1]-a[1]);if(l>longest){longest=l;const mx=(a[0]+c[0])/2,mz=(a[1]+c[1])/2,nx=-(c[1]-a[1])/l,nz=(c[0]-a[0])/l;sign=inside(mx+nx*.05,mz+nz*.05,ring)?-1:1;}}
  const dist=Math.hypot(cx,cz);meta.push({ring,h,seed,cx,cz,dist,sign,id:bi});
  let u=0;
  for(let k=0;k<ring.length;k++){const a=ring[k],c=ring[(k+1)%ring.length],l=Math.hypot(c[0]-a[0],c[1]-a[1]);if(l<.05)continue;const nx=-(c[1]-a[1])/l*sign,nz=(c[0]-a[0])/l*sign;
   edges.push({a,b:c,len:l,nx,nz,h,building:meta.length-1});
   const base=pos.length/3;pos.push(a[0],0,a[1],c[0],0,c[1],c[0],h,c[1],a[0],h,a[1]);for(let q=0;q<4;q++)nor.push(nx,0,nz);
   fac.push(u,h,seed,0,u+l,h,seed,0,u+l,h,seed,0,u,h,seed,0);u+=l;
   // Winding: (a0,b0,b1) faces (-ez,ex); flip when that is inward.
   const tn=-(c[1]-a[1])*nx+(c[0]-a[0])*nz>0;if(tn)idx.push(base,base+1,base+2,base,base+2,base+3);else idx.push(base+1,base,base+3,base+1,base+3,base+2);}
  const contour=ring.map(p=>new THREE.Vector2(p[0],p[1]));let tris;try{tris=THREE.ShapeUtils.triangulateShape(contour,[]);}catch{tris=[];}
  const base=pos.length/3;ring.forEach(p=>{pos.push(p[0],h,p[1]);nor.push(0,1,0);fac.push(0,h,seed,1);});
  for(const [i0,i1,i2] of tris){const p0=ring[i0],p1=ring[i1],p2=ring[i2],ny=(p1[1]-p0[1])*(p2[0]-p0[0])-(p1[0]-p0[0])*(p2[1]-p0[1]);if(ny>0)idx.push(base+i0,base+i1,base+i2);else idx.push(base+i0,base+i2,base+i1);}
 });
 const bgeo=new THREE.BufferGeometry();bgeo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));bgeo.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));bgeo.setAttribute('aFacade',new THREE.Float32BufferAttribute(fac,4));bgeo.setIndex(idx);
 // uCap (m) caps every building at that height and uMap (0..1) fades the facades to flat map blocks
 // (the Halloween escape map: readable footprints, no towers between the camera and the street).
 const buildingMat=new THREE.ShaderMaterial({uniforms:{...shared,uCap:{value:1e5},uMap:{value:0}},vertexShader:/* glsl */`
  uniform float uCap;attribute vec4 aFacade;varying vec3 vWorld,vNormal;varying vec4 vFacade;
  void main(){vec3 p=position;p.y=min(p.y,uCap);vec4 w=modelMatrix*vec4(p,1.);vWorld=w.xyz;vNormal=normal;vFacade=aFacade;vFacade.y=min(vFacade.y,uCap);gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader:/* glsl */`${common}
  uniform float uMap;varying vec3 vWorld,vNormal;varying vec4 vFacade;
  vec3 windowTint(float r){return r<.55?vec3(1.,.78,.5):r<.8?vec3(.85,.92,1.):r<.92?vec3(1.,.95,.85):vec3(.55,.8,1.);}
  void main(){
   float seed=vFacade.z,H=vFacade.y;vec3 N=normalize(vNormal);vec3 V=normalize(cameraPosition-vWorld);
   vec3 tint=mix(vec3(.11,.11,.13),vec3(.17,.15,.14),hash11(seed*91.))*mix(.7,1.2,hash11(seed*13.));
   vec3 col;
   if(vFacade.w>.5){// roof
    float g=fbm(vWorld.xz*.3);col=tint*.55*(.6+.5*g)*(.035+.9*uDaylight)+streetLight(vWorld.xz)*.015;
   }else{
    float y=vWorld.y,u=vFacade.x;
    bool tower=H>70.;
    float floorH=tower?3.9:3.4+hash11(seed*7.)*.6,colW=tower?1.6:2.2+hash11(seed*3.)*1.6;
    float fy=(y-4.2)/floorH,fx=u/colW;float fl=floor(fy),cl=floor(fx);
    vec2 cell=fract(vec2(fx,fy));
    vec2 aa=max(fwidth(vec2(fx,fy)),vec2(1e-4));
    float ww=tower?.92:.7,wh=tower?.62:.55;
    float mx=smoothstep(.5-ww*.5-aa.x,.5-ww*.5+aa.x,cell.x)*smoothstep(.5+ww*.5+aa.x,.5+ww*.5-aa.x,cell.x);
    float my=smoothstep(.5-wh*.5-aa.y,.5-wh*.5+aa.y,cell.y)*smoothstep(.5+wh*.5+aa.y,.5+wh*.5-aa.y,cell.y);
    float win=mx*my*step(4.2,y)*step(y,H-1.2);
    float occ=mix(.12,.62,hash11(seed*5.3))*(tower?1.15:1.);
    float floorOn=step(hash21(vec2(seed*31.,fl)),tower?.8:.6);
    float lit=step(hash21(vec2(seed*97.+cl*1.7,fl*3.1)),occ)*floorOn;
    vec3 wcol=windowTint(hash21(vec2(seed*11.,fl+cl*.31)))*(.55+1.1*hash21(vec2(cl,fl+seed)));
    if(tower)wcol=mix(wcol,vec3(.75,.9,1.1),.6);
    // Varied interiors (uFacade): per-window dimmer, drawn blinds, a ceiling-lit gradient.
    float wv=hash21(vec2(cl*3.7+seed,fl*1.3));
    float blind=mix(1.,.35+.65*step(.45,fract(cell.y*7.+wv*3.)),step(.62,wv));
    wcol*=mix(1.,(.18+.7*wv*wv)*blind*(.6+.55*smoothstep(.15,.95,cell.y)),uFacade);
    // Far LOD: average the window grid once cells are smaller than ~2 px.
    float lod=smoothstep(.25,.6,max(aa.x,aa.y));
    float avgLit=occ*(tower?.85:.7)*ww*wh;
    vec3 emit=mix(wcol*lit*win,windowTint(hash11(seed*17.))*avgLit*.9*step(4.2,y)*step(y,H-1.2),lod);
    emit*=(1.-.92*uDaylight)*1.6;
    vec3 refl=skyColor(reflect(-V,N))*.35;
    vec3 glass=mix(vec3(.01,.012,.02),refl,.5)*win*(1.-lit)*(1.-lod);
    // Light from the street on the lower floors, reflected sky above.
    vec3 street=streetLight(vWorld.xz+N.xz*1.6);
    float low=exp(-max(0.,y-1.)/7.);
    vec3 amb=mix(vec3(.02,.022,.035),vec3(.55,.58,.62),uDaylight)*(.6+.4*N.z*.5+.2);
    float sun=max(0.,dot(N,uSunDir))*uDaylight*1.4;
    col=tint*(amb+street*low*.9+sun)+emit+glass;
    // Floor slabs catch a little street light (uFacade).
    float band=smoothstep(.06+aa.y,.06,cell.y)+smoothstep(.94-aa.y,.94,cell.y);
    col+=uFacade*(1.-lod)*(1.-win)*(tint*.5+street*low*.2)*.3*band*step(4.2,y)*step(y,H-1.2);
    // Shopfront band: lit glass at street level where the street is bright.
    float shop=step(y,3.9)*step(.4,y);
    vec3 storefront=street*(1.2+1.6*hash11(seed*23.))*smoothstep(.05,.3,length(street));
    storefront*=1.-.6*uFacade;// (Halloween look: no blown-out white shopfront walls)
    col=mix(col,storefront+tint*.05,shop*.85*(1.-.7*uDaylight));
    // Fascia line above storefronts.
    col+=street*smoothstep(4.25,4.05,y)*smoothstep(3.85,4.05,y)*2.5;
   }
   // Map mode: dark purple blocks with lighter roofs (footprints read like a game map).
   if(uMap>0.){vec3 blk=vFacade.w>.5?vec3(.20,.13,.30)+.04*hash11(seed*29.):vec3(.07,.045,.11);col=mix(col,blk,uMap);}
   col=applyFog(col,vWorld,cameraPosition);
   gl_FragColor=vec4(col,1.);
  }`});
 buildingMat.extensions={derivatives:true};
 const buildings=new THREE.Mesh(bgeo,buildingMat);group.add(buildings);reflective.push(buildings);

 // ---------- Light field & surface maps (top-down canvases) ----------
 const LM=2048,lrect=shared.uLightRect.value,lsc=LM/lrect.z;
 const lightCanvas=document.createElement('canvas');lightCanvas.width=lightCanvas.height=LM;const L=lightCanvas.getContext('2d');
 const toL=(x,z)=>[(x-lrect.x)*lsc,(z-lrect.y)*lsc];
 const glow=document.createElement('canvas');glow.width=glow.height=LM;const G=glow.getContext('2d');
 G.fillStyle='#000';G.fillRect(0,0,LM,LM);G.globalCompositeOperation='lighter';G.lineCap='round';
 const css=(hex,a)=>{const c=new THREE.Color(hex);return `rgba(${c.r*255|0},${c.g*255|0},${c.b*255|0},${a})`;};
 // Shopfronts: commercial frontage glows, denser near the station.
 for(const e of edges){const m=meta[e.building];const core=Math.exp(-m.dist/230);if(rnd()>.25+.75*core)continue;
  const warm=rnd();const col=warm<.62?0xffc98a:warm<.84?0xd9ecff:NEON[Math.floor(rnd()*NEON.length)];
  const a=(.18+.4*core)*(.6+.6*rnd());G.strokeStyle=css(col,Math.min(1,a));G.lineWidth=Math.max(1,2.2*lsc);
  const [x0,y0]=toL(e.a[0]+e.nx*1.2,e.a[1]+e.nz*1.2),[x1,y1]=toL(e.b[0]+e.nx*1.2,e.b[1]+e.nz*1.2);G.beginPath();G.moveTo(x0,y0);G.lineTo(x1,y1);G.stroke();}
 // Street lamps along carriageways (white LED) — also instanced as poles below.
 const lamps=[];
 for(const r of osm.roads){if(FOOT.includes(r.kind)||!surface(r)||['service','motorway','motorway_link'].includes(r.kind))continue;const hw=roadHalfWidth(r);let carry=rnd()*24;
  for(let k=1;k<r.points.length;k++){const a=r.points[k-1],b=r.points[k],l=Math.hypot(b[0]-a[0],b[1]-a[1]);if(l<.1)continue;const nx=-(b[1]-a[1])/l,nz=(b[0]-a[0])/l;
   for(;carry<l;carry+=26){const t=carry/l,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t,side=(lamps.length%2?1:-1);lamps.push([x+nx*(hw+.6)*side,z+nz*(hw+.6)*side,-nx*side,-nz*side]);}carry-=l;}}
 for(const [x,z] of lamps){const [px,py]=toL(x,z),g=G.createRadialGradient(px,py,0,px,py,11*lsc);g.addColorStop(0,'rgba(220,226,255,.35)');g.addColorStop(1,'rgba(220,226,255,0)');G.fillStyle=g;G.fillRect(px-11*lsc,py-11*lsc,22*lsc,22*lsc);}
 // Shops: coloured spill under their signs.
 const shops=osm.shops.filter(s=>Math.hypot(...s.position)<330);
 // The scramble itself is lit by screens and frontage from all sides.
 {const [px,py]=toL(0,0),g=G.createRadialGradient(px,py,0,px,py,70*lsc);g.addColorStop(0,'rgba(255,236,220,.28)');g.addColorStop(.6,'rgba(200,190,255,.12)');g.addColorStop(1,'rgba(0,0,0,0)');G.fillStyle=g;G.fillRect(px-70*lsc,py-70*lsc,140*lsc,140*lsc);}

 // ---------- Neon signs from OSM shop positions ----------
 const edgeHash=new Map();edges.forEach((e,i)=>{for(let t=0;t<=1;t+=Math.min(1,6/e.len)){const x=e.a[0]+(e.b[0]-e.a[0])*t,z=e.a[1]+(e.b[1]-e.a[1])*t,k=`${Math.floor(x/10)},${Math.floor(z/10)}`;if(!edgeHash.has(k))edgeHash.set(k,new Set());edgeHash.get(k).add(i);}});
 const nearestEdge=(x,z)=>{let best=null,bd=14;const cx=Math.floor(x/10),cz=Math.floor(z/10);for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){const set=edgeHash.get(`${cx+dx},${cz+dz}`);if(!set)continue;for(const i of set){const e=edges[i],ux=(e.b[0]-e.a[0])/e.len,uz=(e.b[1]-e.a[1])/e.len,t=Math.max(.6,Math.min(e.len-.6,(x-e.a[0])*ux+(z-e.a[1])*uz)),px=e.a[0]+ux*t,pz=e.a[1]+uz*t,d=Math.hypot(px-x,pz-z);if(d<bd&&e.len>3){bd=d;best={e,px,pz,ux,uz};}}}return best;};
 const words=[...new Set([...Object.values(WORDS).flat(),...(theme?.words??[])])];
 const atlasV=document.createElement('canvas');atlasV.width=words.length*96;atlasV.height=512;const AV=atlasV.getContext('2d');
 const atlasH=document.createElement('canvas');atlasH.width=512;atlasH.height=words.length*96;const AH=atlasH.getContext('2d');
 AV.fillStyle=AH.fillStyle='#fff';AV.textAlign=AH.textAlign='center';AV.textBaseline=AH.textBaseline='middle';
 if(globalThis.__NO_SIGN_TEXT)for(const c of [AV,AH])c.fillText=illegible(c);// science-sim: render signs as unreadable glyph blocks
 const EN=EN_PAGE();words.forEach((w0,i)=>{const w=EN?WORDS_EN[w0]??w0:w0;const chars=[...w];const latin=/^[A-Z0-9]+$/.test(w);
  // vertical: stacked characters (latin rotated)
  if(latin){AV.save();AV.translate(i*96+48,256);AV.rotate(Math.PI/2);AV.font=`900 ${Math.min(80,440/chars.length*1.4)}px ${FONT}`;AV.fillText(w,0,4);AV.restore();}
  else{const size=Math.min(84,470/chars.length);AV.font=`900 ${size}px ${FONT}`;chars.forEach((ch,k)=>AV.fillText(ch,i*96+48,256+(k-(chars.length-1)/2)*size*1.02));}
  AH.font=`900 ${Math.min(80,470/Math.max(2,chars.length)*(latin?1.5:1))}px ${FONT}`;AH.fillText(w,256,i*96+50);});
 const texV=new THREE.CanvasTexture(atlasV),texH=new THREE.CanvasTexture(atlasH);for(const t of [texV,texH]){t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;}
 const signsV=[],signsH=[];
 for(const s of shops){const hit=nearestEdge(...s.position);if(!hit)continue;const m=meta[hit.e.building];if(m.h<7)continue;
  const list=WORDS[s.kind]||WORDS.default;let word=list[Math.floor(rnd()*list.length)],color=NEON[Math.floor(rnd()*NEON.length)];
  if(theme&&rnd()<theme.share){word=theme.words[Math.floor(rnd()*theme.words.length)];color=theme.neon[Math.floor(rnd()*theme.neon.length)];}
  const w=words.indexOf(word);
  const vertical=rnd()<.6&&m.h>10;
  if(vertical){const height=Math.min(m.h-3,3+rnd()*6),y0=3.6+rnd()*Math.max(0,Math.min(10,m.h-4-height));signsV.push({x:hit.px+hit.e.nx*.85,z:hit.pz+hit.e.nz*.85,y:y0+height/2,height,angle:Math.atan2(hit.e.nx,hit.e.nz),w,color,flicker:rnd()});}
  else signsH.push({x:hit.px+hit.e.nx*.12,z:hit.pz+hit.e.nz*.12,y:4.7+rnd()*.4,width:Math.min(hit.e.len*.8,2.4+rnd()*3),angle:Math.atan2(hit.e.nx,hit.e.nz),w,color,flicker:rnd()});
  const [px,py]=toL(hit.px+hit.e.nx*2,hit.pz+hit.e.nz*2),g=G.createRadialGradient(px,py,0,px,py,7*lsc);g.addColorStop(0,css(color,.42));g.addColorStop(1,css(color,0));G.fillStyle=g;G.fillRect(px-7*lsc,py-7*lsc,14*lsc,14*lsc);}
 const signMaterial=(tex,vertical)=>new THREE.ShaderMaterial({uniforms:{...shared,uAtlas:{value:tex},uCount:{value:words.length}},vertexShader:/* glsl */`
  attribute vec4 aSign;varying vec2 vUv;varying vec3 vWorld,vColor;varying float vFace,vFlicker;varying float vWord;
  void main(){vUv=uv;vWord=aSign.x;vColor=vec3(aSign.y,aSign.z,fract(aSign.w));vFlicker=floor(aSign.w)/1000.;vFace=abs(normal.${vertical?'x':'z'});vec4 w=modelMatrix*instanceMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader:/* glsl */`${common}uniform sampler2D uAtlas;uniform float uCount;varying vec2 vUv;varying vec3 vWorld,vColor;varying float vFace,vFlicker,vWord;
  void main(){
   vec3 tint=vColor;
   ${vertical?'vec2 uv=vec2((vWord+vUv.x)/uCount,vUv.y);':'vec2 uv=vec2(vUv.x,1.-(vWord+1.-vUv.y)/uCount);'}
   float text=texture2D(uAtlas,uv).a;
   float edge=1.-smoothstep(.0,.06,min(min(vUv.x,1.-vUv.x),min(vUv.y,1.-vUv.y)));
   float on=1.;float f=vFlicker;if(f>.93)on=step(.25,fract(sin(floor(uTime*9.+f*50.)*43.1)*913.));
   vec3 back=tint*.05+vec3(.01);
   vec3 col=mix(back,mix(tint,vec3(1.),.35)*3.2,text)+tint*edge*2.2;
   col=mix(back*2.,col,vFace)*on*(1.-.8*uDaylight)+back*uDaylight*6.;
   gl_FragColor=vec4(applyFog(col,vWorld,cameraPosition),1.);}`});
 const makeSigns=(list,vertical)=>{if(!list.length)return null;const geo=vertical?new THREE.BoxGeometry(.28,1,1):new THREE.BoxGeometry(1,.95,.18);const mesh=new THREE.InstancedMesh(geo,signMaterial(vertical?texV:texH,vertical),list.length);const attr=new Float32Array(list.length*4),dummy=new THREE.Object3D(),c=new THREE.Color();
  list.forEach((s,i)=>{dummy.position.set(s.x,s.y,s.z);dummy.rotation.set(0,s.angle+(vertical?Math.PI/2:0),0);if(vertical)dummy.rotation.set(0,s.angle,0);dummy.scale.set(1,vertical?s.height:1,vertical?1.05:1);if(!vertical)dummy.scale.set(s.width,1,1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);c.setHex(s.color);attr.set([s.w,c.r,c.g,Math.min(.999,c.b)+Math.floor(s.flicker*999)],i*4);});
  geo.setAttribute('aSign',new THREE.InstancedBufferAttribute(attr,4));mesh.frustumCulled=false;group.add(mesh);reflective.push(mesh);return mesh;};
 const signMeshes=[makeSigns(signsV,true),makeSigns(signsH,false)].filter(Boolean);

 // ---------- Giant screens on facades facing the scramble ----------
 const screenCandidates=edges.filter(e=>{const m=meta[e.building],mx=(e.a[0]+e.b[0])/2,mz=(e.a[1]+e.b[1])/2,d=Math.hypot(mx,mz);return d>22&&d<140&&m.h>18&&e.len>9&&(-mx*e.nx-mz*e.nz)/d>.55;}).map(e=>{const mx=(e.a[0]+e.b[0])/2,mz=(e.a[1]+e.b[1])/2;return {e,score:Math.min(e.len,30)*Math.min(meta[e.building].h,60)/Math.hypot(mx,mz)};}).sort((a,b)=>b.score-a.score);
 const screens=[];const usedB=new Set();
 for(const {e} of screenCandidates){if(usedB.has(e.building)||screens.length>=6)continue;usedB.add(e.building);const m=meta[e.building];const w=Math.min(e.len*.82,32),h=Math.min(m.h*.42,w*.62,22),y=Math.min(m.h-h/2-1.5,6+h/2+m.h*.15);
  screens.push({x:(e.a[0]+e.b[0])/2+e.nx*.35,z:(e.a[1]+e.b[1])/2+e.nz*.35,y,w,h,angle:Math.atan2(e.nx,e.nz),kind:screens.length%4});
  const [px,py]=toL((e.a[0]+e.b[0])/2+e.nx*14,(e.a[1]+e.b[1])/2+e.nz*14),g=G.createRadialGradient(px,py,0,px,py,26*lsc);g.addColorStop(0,'rgba(170,160,255,.4)');g.addColorStop(1,'rgba(0,0,0,0)');G.fillStyle=g;G.fillRect(px-26*lsc,py-26*lsc,52*lsc,52*lsc);}
 // Screen content: kinetic type, colour fields and a live view of the trails.
 const typeCanvas=document.createElement('canvas');typeCanvas.width=1024;typeCanvas.height=256;const T=typeCanvas.getContext('2d');if(globalThis.__NO_SIGN_TEXT)T.fillText=illegible(T);
 T.fillStyle='#fff';T.textBaseline='middle';const [line1,line2]=theme?.screenText??(EN_PAGE()?['SHIBUYA','TYO']:['SHIBUYA','渋谷']);T.font=`900 ${line1.length>7?118:150}px ${FONT}`;T.fillText(line1,20,128);T.font=`900 ${line2.length>2?120:170}px ${FONT}`;T.fillText(line2,line1.length>7?650:700,132);
 const typeTex=new THREE.CanvasTexture(typeCanvas);typeTex.colorSpace=THREE.SRGBColorSpace;typeTex.wrapS=THREE.RepeatWrapping;
 const screenMat=kind=>new THREE.ShaderMaterial({uniforms:{...shared,uType:{value:typeTex},uKind:{value:kind},uAspect:{value:1},uTheme:{value:theme?1:0}},vertexShader:/* glsl */`varying vec2 vUv;varying vec3 vWorld;void main(){vUv=uv;vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader:/* glsl */`${common}uniform sampler2D uType;uniform float uKind,uAspect,uTheme;varying vec2 vUv;varying vec3 vWorld;
  vec3 pal(float t){return uTheme>.5?mix(vec3(1.,.38,.04),vec3(.5,.12,1.),.5+.5*sin(6.2832*t)):.5+.5*cos(6.2832*(t+vec3(0.,.33,.67)));}
  // Halloween art (theme): full moon, flying bats and a grinning jack-o'-lantern.
  vec3 halloween(vec2 uv,float t){vec2 p=(uv-.5)*vec2(uAspect,1.);vec3 c=mix(vec3(.12,.02,.2),vec3(.01,.0,.03),uv.y);
   vec2 m=p-vec2(uAspect*.22,.18);float moon=smoothstep(.27,.26,length(m));c=mix(c,vec3(1.,.86,.5)*(1.-.25*fbm(m*9.)),moon);c+=vec3(.5,.3,.1)*exp(-length(m)*5.)*.4;
   for(int k=0;k<5;k++){float fk=float(k);vec2 b=p-vec2(fract(t*.05*(1.+fk*.3)+fk*.37)*uAspect*1.4-uAspect*.7,.25-fk*.07+.04*sin(t*2.+fk));float flap=abs(sin(t*9.+fk*2.));
    float wing=step(abs(b.y+abs(b.x)*(.7*flap-.2)),.018)*step(abs(b.x),.09)+step(length(b),.02);c=mix(c,vec3(0.),clamp(wing,0.,1.));}
   vec2 q=p-vec2(-uAspect*.2,-.12);float body=smoothstep(.3,.29,length(q*vec2(.85,1.1)));vec3 pump=vec3(1.,.4,.03)*(.65+.35*cos(atan(q.x,q.y)*0.+q.x*22.));
   float eye=smoothstep(.06,.05,length(vec2(abs(q.x)-.1,q.y-.06)*vec2(1.,1.4)));float grin=step(abs(q.y+.09+.05*cos(q.x*14.)),.025)*step(abs(q.x),.17);
   c=mix(c,pump,body);c=mix(c,vec3(3.,1.6,.3)*(.8+.2*sin(t*8.)),body*clamp(eye+grin,0.,1.));return c;}
  void main(){vec2 uv=vUv;float t=uTime;vec3 c;
   if(uTheme>.5&&(uKind>.5&&uKind<1.5||uKind>2.5))c=halloween(uv,t+uKind*3.);
   else if(uKind<.5){float s=fract(uv.x*uAspect*.35-t*.12);float a=texture2D(uType,vec2(s,uv.y*1.15-.07)).a;c=mix(vec3(.02,.0,.08)+pal(uv.y*.3+t*.05)*.25,mix(vec3(1.,.25,.6),vec3(.2,.9,1.),uv.y),a)*1.;}
   else if(uKind<1.5){vec2 p=uv*vec2(uAspect,1.)*2.;float n=fbm(p+vec2(t*.15,-t*.1)+fbm(p*1.7-t*.2)*1.5);c=pal(n*1.2+t*.04)*smoothstep(.2,.8,n)*1.1;}
   else if(uKind<2.5){vec3 tr=texture2D(uTrail,vec2(uv.x,1.-uv.y)*.6+.2).rgb;c=tr*1.6+vec3(.01,.02,.05);c+=vec3(.0,.6,.9)*step(.985,fract(uv.y*30.))*.1;float a=texture2D(uType,vec2(fract(uv.x*.6+t*.03),clamp((uv.y-.04)*6.,0.,1.))).a*step(uv.y,.2);c+=vec3(1.)*a*.8;}
   else{float bars=floor(uv.x*24.);float hgt=.5+.45*sin(t*2.1+bars*.7)*sin(t*.7+bars*.23);c=pal(bars/24.+t*.1)*step(uv.y,hgt)*1.1+vec3(.02);c*=step(.12,fract(uv.x*24.));}
   // LED pixel structure when close.
   vec2 px=uv*vec2(uAspect,1.)*90.;float fw=max(fwidth(px.x),fwidth(px.y));float dots=mix(smoothstep(.55,.25,length(fract(px)-.5)),.6,smoothstep(.3,.8,fw));
   c*=dots*3.2*(1.-.75*uDaylight);
   gl_FragColor=vec4(applyFog(c,vWorld,cameraPosition),1.);}`,extensions:{derivatives:true}});
 const screenMeshes=screens.map(s=>{const mat=screenMat(s.kind);mat.uniforms.uAspect.value=s.w/s.h;const mesh=new THREE.Mesh(new THREE.PlaneGeometry(s.w,s.h),mat);mesh.position.set(s.x,s.y,s.z);mesh.rotation.y=s.angle;group.add(mesh);reflective.push(mesh);
  // Frame around the screen.
  const frame=new THREE.Mesh(new THREE.BoxGeometry(s.w+.8,s.h+.8,.3),new THREE.MeshBasicMaterial({color:0x050507}));frame.position.set(s.x-Math.sin(s.angle)*.2,s.y,s.z-Math.cos(s.angle)*.2);frame.rotation.y=s.angle;group.add(frame);mesh.userData.frame=frame;return mesh;});

 // Mask building interiors out of the light field and finish blur layers.
 G.globalCompositeOperation='source-over';G.fillStyle='#000';for(const m of meta){G.beginPath();m.ring.forEach((p,k)=>{const [x,y]=toL(...p);k?G.lineTo(x,y):G.moveTo(x,y);});G.closePath();G.fill();}
 L.fillStyle='#000';L.fillRect(0,0,LM,LM);L.globalCompositeOperation='lighter';
 L.filter=`blur(${(2.2*lsc).toFixed(1)}px)`;L.drawImage(glow,0,0);L.filter=`blur(${(7*lsc).toFixed(1)}px)`;L.globalAlpha=.9;L.drawImage(glow,0,0);L.filter=`blur(${(18*lsc).toFixed(1)}px)`;L.globalAlpha=.8;L.drawImage(glow,0,0);L.filter='none';L.globalAlpha=1;
 const lightTex=new THREE.CanvasTexture(lightCanvas);lightTex.colorSpace=THREE.NoColorSpace;lightTex.minFilter=THREE.LinearFilter;lightTex.generateMipmaps=false;shared.uLightmap.value=lightTex;

 // ---------- Ground surface maps ----------
 const surfaceMap=(size,x0,z0,extent,detail)=>{const c=document.createElement('canvas');c.width=c.height=size;const S=c.getContext('2d'),sc=size/extent,to=(x,z)=>[(x-x0)*sc,(z-z0)*sc];
  // R: asphalt, G: paint, B: kerb/sidewalk paving (default)
  S.fillStyle='rgb(0,0,255)';S.fillRect(0,0,size,size);S.lineCap='round';S.lineJoin='round';
  for(const r of osm.roads){if(FOOT.includes(r.kind)||!surface(r)||r.tags.footway==='crossing')continue;const hw=roadHalfWidth(r)-.5;S.strokeStyle='rgb(255,0,0)';S.lineWidth=hw*2*sc;S.beginPath();r.points.forEach((p,k)=>{const [x,y]=to(...p);k?S.lineTo(x,y):S.moveTo(x,y);});S.stroke();}
  // The junction itself is one open asphalt square.
  S.fillStyle='rgb(255,0,0)';S.beginPath();CORNERS.forEach((p,k)=>{const [x,y]=to(p[0]*.86,p[1]*.86);k?S.lineTo(x,y):S.moveTo(x,y);});S.closePath();S.fill();
  S.globalCompositeOperation='lighter';
  // Lane lines on wide roads.
  if(detail){S.setLineDash([3*sc,5*sc]);for(const r of osm.roads){if(FOOT.includes(r.kind)||!surface(r)||Number(r.tags.lanes||1)<2)continue;S.strokeStyle='rgb(0,150,0)';S.lineWidth=.15*sc;S.beginPath();r.points.forEach((p,k)=>{const [x,y]=to(...p);k?S.lineTo(x,y):S.moveTo(x,y);});S.stroke();}S.setLineDash([]);}
  // Zebra crossings: signalised OSM crossings near the junction + the two diagonals.
  const zebra=(a,b,width)=>{const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),ux=dx/len,uz=dz/len;S.strokeStyle='rgb(0,255,0)';S.lineWidth=.5*sc;S.lineCap='butt';for(let s=.6;s<len-.4;s+=1){for(let w=-width/2;w<=width/2;w+=.25){}const cx=a[0]+ux*s,cz=a[1]+uz*s,[x0,y0]=to(cx-uz*width/2,cz+ux*width/2),[x1,y1]=to(cx+uz*width/2,cz-ux*width/2);S.beginPath();S.moveTo(x0,y0);S.lineTo(x1,y1);S.stroke();}S.lineCap='round';};
  for(const r of osm.roads){if(r.tags.footway!=='crossing'||!surface(r))continue;const a=r.points[0],b=r.points.at(-1);if(Math.hypot(...a)>160&&Math.hypot(...b)>160)continue;const near=Math.hypot(...a)<55&&Math.hypot(...b)<55;zebra(a,b,near?6:3.5);}
  zebra(CORNERS[0],CORNERS[3],5);zebra(CORNERS[5],CORNERS[2],5);
  return c;};
 const wideMap=surfaceMap(2048,-450,-450,900,false),nearMap=surfaceMap(2048,-80,-80,160,true);
 const mapTex=c=>{const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.NoColorSpace;t.anisotropy=8;return t;};
 const reflectTarget=new THREE.WebGLRenderTarget(640,360,{type:THREE.HalfFloatType});
 const groundMat=new THREE.ShaderMaterial({uniforms:{...shared,uWide:{value:mapTex(wideMap)},uNear:{value:mapTex(nearMap)},uReflect:{value:reflectTarget.texture},uReflectMatrix:{value:new THREE.Matrix4()},uDyn:{value:null},uReflectOn:{value:1}},
  vertexShader:/* glsl */`uniform mat4 uReflectMatrix;varying vec3 vWorld;varying vec4 vReflect;void main(){vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;vReflect=uReflectMatrix*w;gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader:/* glsl */`${common}uniform sampler2D uWide,uNear,uReflect,uDyn;uniform float uReflectOn;varying vec3 vWorld;varying vec4 vReflect;
  void main(){vec2 xz=vWorld.xz;vec4 m;vec2 nuv=(xz+80.)/160.;
   if(all(greaterThan(nuv,vec2(0)))&&all(lessThan(nuv,vec2(1))))m=texture2D(uNear,nuv);else m=texture2D(uWide,(xz+450.)/900.);
   float road=m.r,paint=m.g,walk=1.-road;
   float n=fbm(xz*.7),n2=fbm(xz*.08+3.1);
   // Puddles: low spots on asphalt hold water, paving is damp.
   float puddle=smoothstep(.48,.62,n2+n*.18)*uWet;
   vec3 asphalt=vec3(.035,.036,.04)*(.75+.5*n);
   vec2 tile=abs(fract(xz/vec2(.6,.3)+vec2(floor(xz.y/.3)*.5,0.))-.5);float joint=smoothstep(.47,.5,max(tile.x,tile.y))*(1.-smoothstep(.0,.08,fwidth(xz.x)));
   vec3 paving=vec3(.09,.085,.08)*(.8+.35*n)*(1.-joint*.35);
   vec3 albedo=mix(paving,asphalt,road);albedo=mix(albedo,vec3(.42,.41,.38)*(.8+.2*n),paint*.9);
   float wet=clamp(mix(.45,1.,puddle)*uWet*(1.-paint*.5)*(road*.9+.35),0.,1.);
   albedo*=1.-.45*wet;
   vec3 dyn=texture2D(uDyn,(xz-uTrailRect.xy)/uTrailRect.zw).rgb;
   vec3 amb=mix(vec3(.018,.02,.032),vec3(.5,.52,.55),uDaylight);
   vec3 light=amb+streetLight(xz)+dyn*2.2+uSunDir.y*uDaylight*.6;
   vec3 col=albedo*light;
   // Wet reflection: projective lookup, streaked vertically like real rain-wet asphalt.
   vec3 V=normalize(cameraPosition-vWorld);float fres=.04+.96*pow(1.-max(V.y,0.),5.);
   vec2 ruv=vReflect.xy/vReflect.w;vec2 wob=(vec2(noise2(xz*1.7),noise2(xz*1.7+9.))-.5)*.006*(1.+puddle);
   vec3 refl=vec3(0);float wsum=0.;for(int k=-3;k<=3;k++){float wk=1.-abs(float(k))/4.;refl+=texture2D(uReflect,ruv+wob+vec2(0.,float(k)*.006*(1.3-puddle))).rgb*wk;wsum+=wk;}refl/=wsum;
   float rs=wet*mix(.25,.9,puddle)*mix(.35,1.,fres)*uReflectOn;col+=refl*rs;
   col+=trailAt(xz)*uTrailGain;
   col=applyFog(col,vWorld,cameraPosition);gl_FragColor=vec4(col,1.);}`,extensions:{derivatives:true}});
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(2400,2400).rotateX(-Math.PI/2),groundMat);group.add(ground);

 // ---------- Kerbs: thin raised edges along carriageways near the junction ----------
 // (omitted: the surface map carries the kerb line)

 // ---------- Street lamps (instanced) ----------
 const lampMat=new THREE.ShaderMaterial({uniforms:{...shared},vertexShader:/* glsl */`varying vec3 vWorld;varying float vHead;void main(){vHead=step(5.6,position.y);vec4 w=modelMatrix*instanceMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader:/* glsl */`${common}varying vec3 vWorld;varying float vHead;void main(){vec3 c=mix(vec3(.025)+streetLight(vWorld.xz)*.05,vec3(2.6,2.7,3.),vHead*(1.-.9*uDaylight));gl_FragColor=vec4(applyFog(c,vWorld,cameraPosition),1.);}`});
 const lampGeo=(()=>{const pole=new THREE.CylinderGeometry(.08,.11,6,5).translate(0,3,0),arm=new THREE.BoxGeometry(.08,.08,1.3).translate(0,6,.6),head=new THREE.BoxGeometry(.32,.12,.6).translate(0,5.95,1.2);const geos=[pole,arm,head].map(g=>g.toNonIndexed());const p=[];geos.forEach(g=>p.push(...g.getAttribute('position').array));const out=new THREE.BufferGeometry();out.setAttribute('position',new THREE.Float32BufferAttribute(p,3));out.computeVertexNormals();return out;})();
 const lampMesh=new THREE.InstancedMesh(lampGeo,lampMat,lamps.length);{const d=new THREE.Object3D();lamps.forEach(([x,z,nx,nz],i)=>{d.position.set(x,0,z);d.rotation.set(0,Math.atan2(nx,nz),0);d.updateMatrix();lampMesh.setMatrixAt(i,d.matrix);});}group.add(lampMesh);reflective.push(lampMesh);

 // ---------- Traffic signals at each corner ----------
 // Pedestrian heads (green/red) face across the junction; vehicle heads
 // (Japanese horizontal 3-lamp) face approaching traffic.
 const sigMat=new THREE.ShaderMaterial({uniforms:{...shared,uPed:{value:new THREE.Color(1,0,0)},uCar:{value:new THREE.Color(1,0,0)}},vertexShader:/* glsl */`attribute float aLamp;varying float vLamp;varying vec3 vWorld;void main(){vLamp=aLamp;vec4 w=modelMatrix*instanceMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader:/* glsl */`${common}uniform vec3 uPed,uCar;varying float vLamp;varying vec3 vWorld;void main(){vec3 c=vec3(.03);if(vLamp>.5&&vLamp<1.5)c=uPed*6.;if(vLamp>1.5)c=uCar*7.;gl_FragColor=vec4(applyFog(c,vWorld,cameraPosition),1.);}`});
 const sigGeo=(()=>{const parts=[[new THREE.CylinderGeometry(.07,.09,4.6,6).translate(0,2.3,0),0],[new THREE.BoxGeometry(.5,.9,.3).translate(0,2.8,.2),0],[new THREE.PlaneGeometry(.38,.36).translate(0,2.98,.36),1],[new THREE.BoxGeometry(1.5,.5,.35).translate(.5,4.4,-.05),0],[new THREE.CircleGeometry(.16,10).translate(.95,4.4,.13),2]];const p=[],l=[];for(const [g,lamp] of parts){const ng=g.toNonIndexed(),a=ng.getAttribute('position').array;p.push(...a);for(let i=0;i<a.length/3;i++)l.push(lamp);}const out=new THREE.BufferGeometry();out.setAttribute('position',new THREE.Float32BufferAttribute(p,3));out.setAttribute('aLamp',new THREE.Float32BufferAttribute(l,1));out.computeVertexNormals();return out;})();
 const signals=new THREE.InstancedMesh(sigGeo,sigMat,CORNERS.length);{const d=new THREE.Object3D();CORNERS.forEach(([x,z],i)=>{const r=Math.hypot(x,z);d.position.set(x*1.02,0,z*1.02);d.rotation.set(0,Math.atan2(-x/r,-z/r),0);d.updateMatrix();signals.setMatrixAt(i,d.matrix);});}group.add(signals);reflective.push(signals);

 // ---------- Hachiko: authored symbolic sculpture (not a scan) ----------
 const bronze=new THREE.MeshBasicMaterial({color:0x2a2116});const dog=new THREE.Group();
 for(const [x,y,z,w,h,d] of [[0,.5,0,1.6,1,1.6],[0,1.35,0,.42,.6,.95],[0,1.85,-.38,.32,.42,.36],[-.12,2.08,-.4,.08,.18,.1],[.12,2.08,-.4,.08,.18,.1],[0,1.75,-.62,.18,.16,.2]]){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),bronze);mesh.position.set(x,y,z);dog.add(mesh);}
 dog.position.set(1,0,48);dog.rotation.y=.5;group.add(dog);

 return {group,reflective,buildings,signs:signMeshes,ground,groundMat,reflectTarget,screens:screenMeshes,signalMaterial:sigMat,lightCanvas,meta,shops:shops.length,signCount:signsV.length+signsH.length,lampCount:lamps.length};
}
