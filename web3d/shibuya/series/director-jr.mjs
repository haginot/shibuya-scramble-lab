// Shot list of the series pilot 「🧙ハロウィンの渋谷を脱出せよ！🎃 JR編」 (JP, 9:16, 30 fps, 58 s).
// Pure functions of video time t (seconds); the camera rigs come from camera.mjs and need the scene
// context (walk path on OSM, station dolly keys, wide-area routes), so makeDirector(ctx) builds them once.
//
// Sections (t0–t1 s):      camera                                         overlay (overlay-jr.mjs)
//  cold    0.0– 2.0  aerial orbit (high)                       fictional game-HQ notice (※パロディ)
//  title   2.0– 5.0  aerial orbit, descending                  title card (most prominent), subtitle
//  rules   5.0– 7.2  aerial low orbit                          rules = real safety tips
//  facts   7.2– 9.0  aerial low orbit                          announced for 2026 / not announced
//  mission 9.0–13.5  close top-down over Hachiko Sq./Scramble  GAME START, PLAYER START, density (sim)
//  walk   13.5–23.5  eye level, 5 clips × 2 s along route JR-A  landmark captions WALK_A.steps (wp 1,3,4,6,9; wp 6 carries
//                    the U-turn + 「仕切りの反対側を改札へ」 of wp 7), per-clip look targets on the named landmarks
//  inside 23.5–31.0  interior dolly: passage → gates | stairs → platform   INTERIOR captions (概略)
//  gates  31.0–34.5  aerial oblique over the station, routes A/B/C          BRANCHES.gates (A–D)
//  alt    34.5–40.0  aerial route map (wide OSM), Harajuku/Yoyogi/Ebisu     BRANCHES.alt + last trains
//  taxi   40.0–43.0  route map pushed in on the south side                 TAXI
//  fall   43.0–46.0  same, dimmed                                          FALLBACK (last trains, info)
//  tally  46.0–49.0  aerial orbit, dimmed                                  GAME OVER tally (sim)
//  cheat  49.0–53.0  aerial orbit, dark                                    cheat sheet card (held 4 s)
//  ask    53.0–55.5  aerial orbit                                          closing question
//  end    55.5–58.0  aerial orbit, dark                                    sources end card
// The simulation clock: simAt(t) = JR time (s after the first route walker spawns, = crowd-jr jrTime; negative
// = Halloween crowd warm-up). It is monotonic: 1× everywhere except the walk clips (2×, both camera and crowd,
// shown as 「×2」) and the cuts between walk clips (the crowd jumps ahead to where the player would be).
import * as THREE from '../../vendor/three.module.min.js';
import {aerialOrbit,closeTopDown,eyeLevel,interiorDolly,routeMap,fitView,makeShot,blend} from './camera.mjs';

export const FPS=30;
export const SECTIONS=Object.freeze([
 ['cold',0,2],['title',2,5],['rules',5,7.2],['facts',7.2,9],['mission',9,13.5],['walk',13.5,23.5],['inside',23.5,31],
 ['gates',31,34.5],['alt',34.5,40],['taxi',40,43],['fall',43,46],['tally',46,49],['cheat',49,53],['ask',53,55.5],['end',55.5,58]]);
export const DURATION=58,FRAMES=DURATION*FPS;
export const sectionAt=t=>{for(const [k,a,b] of SECTIONS)if(t>=a&&t<b)return {key:k,t0:a,t1:b,local:t-a,u:(t-a)/(b-a)};const L=SECTIONS.at(-1);return {key:L[0],t0:L[1],t1:L[2],local:t-L[1],u:1};};
// Walk clips: waypoint n of camera.mjs JR_WALKS.hachiko whose WALK_A step is captioned, clip start (s before the waypoint).
// look: [x,y,z, weight] pans the view toward the landmark the caption names (landmarks-jr.mjs: koban + JR girder for wp 1,
// the passage under the tracks for wp 3, the 明治通り plate for wp 6); weight 0..1 blends with the walking direction.
export const WALK_CLIPS=Object.freeze([{wp:1,lead:1,sim:3,look:[46,2.6,6,.75]},{wp:3,lead:5.5,sim:40,look:[38,2.2,11,.4]},{wp:4,lead:2,sim:75},{wp:6,lead:4.2,sim:115,look:[157,3.4,-10.5,.8]},{wp:9,lead:6.5,sim:150}]);
export const WALK_CLIP=2,WALK_SPEED=1.35*2,WALK_RATE=2;// 2 s per clip; camera and crowd ×2
export const INSIDE_CUTS=Object.freeze([{t0:23.5,t1:27.25,d0:0,d1:6.0},{t0:27.25,t1:31,d0:8.6,d1:16.5}]);
export const ALT_ROUTES=Object.freeze(['ALT-HARA-H','ALT-YOYO-H','ALT-EBI-NS']);
export const PILOT_ROUTES=Object.freeze([['A','JR-A-hachiko','#FF8A1F'],['B','JR-B-south','#5AB8FF'],['C','JR-C-newsouth-east','#FFD23F'],['C','JR-C-newsouth-west','#FFD23F']]);
export const T_SIM0=-12;// JR time at video t = 0 (the page warms the crowd up to here)
// JR time (s) at video time t. insideSim: JR time at the cut to the interior (23.5 s) = just after the player
// (first walker of route A) is admitted at the Hachiko gate in the precomputed run (ESCAPED stamp there).
export const INSIDE_SIM_DEFAULT=192;
export function simAt(t,insideSim=INSIDE_SIM_DEFAULT){
 if(t<13.5)return T_SIM0+t;                    // 1× (player spawns at JR time 0 = video 12 s)
 if(t<23.5){const k=Math.min(4,Math.floor((t-13.5)/WALK_CLIP)),c=WALK_CLIPS[k];return c.sim+(t-13.5-k*WALK_CLIP)*WALK_RATE;}
 return Math.max(insideSim,WALK_CLIPS[4].sim+WALK_CLIP*WALK_RATE)+(t-23.5);// 1× after the walk
}
export const SIM_RATE=t=>t>=13.5&&t<23.5?WALK_RATE:1;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),ease=t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2,smooth=t=>t*t*(3-2*t);
// Cuts (hard cuts get a 3-frame dip to black on each side; continuous camera moves have none).
export const CUTS=Object.freeze([9,13.5,15.5,17.5,19.5,21.5,23.5,27.25,31,46]);
// No fade-in from black at t = 0 (QA: the pilot's first frame was black — a video must open on a real image; the
// recorder's warm-up render takes the shader-compile frame). The end still fades out over the last 0.3 s.
export function fadeAt(t){let f=1;for(const c of CUTS){const d=Math.abs(t-c);if(d<.1)f=Math.min(f,.25+.75*d/.1);}if(t>DURATION-.3)f=Math.min(f,(DURATION-t)/.3);return f;}

// ctx: {insideSim?, walk:{points, waypoints:[{n,s}]}, dolly:[keys], wide (wide-area api|null), pilot:{id:{points}}, gates:{key:{x,y,z}}, taxi:[x,z]}
export function makeDirector(ctx){
 const sOf=n=>ctx.walk.waypoints.find(w=>w.n===n)?.s??0;
 const eye=eyeLevel({path:ctx.walk.points,speed:WALK_SPEED,fov:60,bob:.032,sway:.02,stepHz:1.9*WALK_RATE*.75,lookAhead:8});
 const high=aerialOrbit({center:[40,0,70],radius:470,height:330,yaw0:-.95,yawSpeed:.045,fov:40,lookY:0});
 const low=aerialOrbit({center:[34,0,48],radius:270,height:175,yaw0:-.62,yawSpeed:.05,fov:42,lookY:12});
 const top=closeTopDown({center:[16,0,26],height:78,rot0:-.32,rotSpeed:.012,drift:[.25,.6],fov:44});
 const inside=interiorDolly(ctx.dolly);
 const pts=[];for(const [,id] of PILOT_ROUTES){const r=ctx.pilot?.[id];if(r)pts.push(...r.points);}
 for(const g of Object.values(ctx.gates||{}))pts.push([g.x,g.z]);
 const gatesShot=routeMap({points:pts.length?pts:[[0,0],[160,260]],azimuth:-25,pitch:48,fov:42,aspect:9/16,push:.08,dur:3.5,rect:{x0:.1,x1:.9,y0:.22,y1:.74}});
 const altPts=ctx.wide?ALT_ROUTES.flatMap(id=>ctx.wide.routes[id]?.data.points.filter((_,i)=>i%3===0)??[]):[[0,-2600],[700,1400]];
 const altShot=routeMap({points:altPts,azimuth:-8,pitch:66,fov:40,aspect:9/16,push:.05,dur:5.5,rect:{x0:.08,x1:.92,y0:.2,y1:.74}});
 const T=ctx.taxi||[112,312];
 const taxiShot=routeMap({points:[[T[0],T[1]],[159.8,260],[1.8,0],[22.6,36.7],[-60,330],[230,330]],azimuth:-8,pitch:62,fov:40,aspect:9/16,push:.06,dur:6,rect:{x0:.1,x1:.9,y0:.22,y1:.72}});
 const endOrbit=aerialOrbit({center:[40,0,70],radius:430,height:300,yaw0:.6,yawSpeed:.04,fov:40,lookY:0});
 // eye-level clip k: camera at s = s(wp) - lead + speed·u
 const clipShot=t=>{const k=Math.min(4,Math.floor((t-13.5)/WALK_CLIP)),c=WALK_CLIPS[k],u=t-13.5-k*WALK_CLIP;const s0=Math.max(0,sOf(c.wp)-c.lead*WALK_SPEED/2);
  const sh=eye(u+s0/WALK_SPEED);sh.clip=k;sh.wp=c.wp;
  if(c.look){const d0=sh.look.clone().sub(sh.pos).normalize(),d1=new THREE.Vector3(c.look[0],c.look[1],c.look[2]).sub(sh.pos).normalize();sh.look=sh.pos.clone().addScaledVector(d0.lerp(d1,c.look[3]).normalize(),8);}
  return sh;};
 function camera(t){const S=sectionAt(t),k=S.key;let sh;
  if(k==='cold'||k==='title'){sh=high(t);if(k==='title'){const e=ease(clamp((t-2)/7));sh=blend(sh,low(t),e*.5);}}
  else if(k==='rules'||k==='facts'){const e=ease(clamp((t-2)/7));sh=blend(high(t),low(t),.5+.5*e);}
  else if(k==='mission')sh=top(t-9);
  else if(k==='walk')sh=clipShot(t);
  else if(k==='inside'){const c=INSIDE_CUTS.find(c=>t<c.t1)??INSIDE_CUTS[1];sh=inside(c.d0+(c.d1-c.d0)*(t-c.t0)/(c.t1-c.t0));sh.name='interior';}
  else if(k==='gates')sh=gatesShot(t-31);
  else if(k==='alt'){const a=altShot(t-34.5),g=gatesShot(3.5);const e=smooth(clamp((t-34.5)/1.1));sh=e<1?arc(g,a,e):a;sh.far=a.far;}
  else if(k==='taxi'||k==='fall'){const a=taxiShot(t-40),b=altShot(5.5);const e=smooth(clamp((t-40)/1));sh=e<1?arc(b,a,e):a;sh.far=Math.max(a.far,b.far);}
  else sh=endOrbit(t-46);
  sh.name=sh.name||k;return sh;}
 // log-distance interpolation for big zooms (map ↔ close): position along the look line scaled geometrically
 function arc(a,b,e){const da=a.pos.distanceTo(a.look),db=b.pos.distanceTo(b.look),d=da*Math.pow(db/da,e);const look=a.look.clone().lerp(b.look,e);
  const dir=a.pos.clone().sub(a.look).normalize().lerp(b.pos.clone().sub(b.look).normalize(),e).normalize();const s=makeShot(look.clone().addScaledVector(dir,d),look,{fov:a.fov+(b.fov-a.fov)*e,name:b.name});s.far=Math.max(a.far||5000,b.far||5000);return s;}
 // Map amount (wide-area map mode / flattened city): 0 = realistic 3D, 1 = map.
 const mapAt=t=>t<34.5?0:t<35.4?smooth(clamp((t-34.5)/.9)):t<46?1:0;
 const insideSim=ctx.insideSim??INSIDE_SIM_DEFAULT,simOf=t=>simAt(t,insideSim);
 return {camera,mapAt,simAt:simOf,insideSim,fadeAt,sectionAt,
  shotAt(t){const S=sectionAt(t),cam=camera(t);
   const dim=S.key==='fall'?.55:S.key==='tally'?.5:S.key==='cheat'?.28:S.key==='ask'?.6:S.key==='end'?.22:S.key==='cold'?.8:1;
   return {t,frame:Math.round(t*FPS),section:S.key,local:S.local,u:S.u,cam,map:mapAt(t),sim:simOf(t),rate:SIM_RATE(t),fade:fadeAt(t)*dim,
    interior:S.key==='inside',eye:S.key==='walk'||S.key==='inside',aerial:['cold','title','rules','facts','tally','cheat','ask','end','gates'].includes(S.key),
    clip:cam.clip??null,wp:cam.wp??null,camAt:cam.at??null};}};
}
