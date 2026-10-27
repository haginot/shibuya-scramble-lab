// Shot registry for the JR編 branching variants: SHOTS[key](ctx, params) → (tLocal) → shot.
// Every shot is a pure function of the beat-local time tLocal (seconds, 0 = beat start): deterministic, no wall clock.
// A shot = camera.mjs shot {pos, look, up, fov, fade, name, far?} + `env` (what the page shows for it):
//   env = {aerial, eye, interior, map (0 3D … 1 flat route map), exposure, dim (multiplies the post fade), detail
//          ('aerial'|'street'), sets:[sets-variants keys], routes:{ids, progress, highlight}|null, wideRoutes:{ids,progress,
//          highlight}|null, redZone 0..1, keepCity (false: hide the outdoor city while interior — enclosed halls), crowd (bool: draw the outdoor crowd), vehicles, landmarks, station, nearHide (m:
//          hide sim people closer than this to an eye camera), focus:[x,z] (ground point of interest), approx (bool: the
//          HUD should show 「位置・構造は概略」)}
//   applyEnv(shot, parts, tLocal) applies env + camera to the shared scene parts (see below) — use it so the page and
//   the preview harness agree.
//
// ctx (built once by the page): {osm, st (station-jr), wide (wide-area api|null), wideData (series_wide_osm.json|null),
//   insideBuilding (realism R.insideBuilding), sets (sets-variants createSets), routes? {id:{points:[[x,z]]}} extra
//   research routes (detours …), aspect (W/H, default 9/16)}
//
// Keys and params (all optional; defaults in brackets):
//  'op-flythrough'  cinematic game-OP move over night Shibuya: low rush across the Scramble (≈1.5 m) → swoop up the
//                   lit west face of the Scramble-Square-class tower → reveal of the city + sky glow, ending on a calm
//                   high pose whose upper screen (OP_LOGO.clear) is open sky for the 3D logo slam.
//                   {dur=6.5 (move length, s; after it the pose holds with a slow push), push=1.6 (m/s after dur),
//                    shake:[{t, amp=.35, decay=.5, freq=9}] (logo-slam camera shake, deterministic), roll=1 (bank amount)}
//                   Logo anchor: OP_LOGO (static) and opLogoAnchor(ctx, params, t) → {pos, quaternion, fov, point, normal,
//                   up, right, distance, worldWidth (width of the clear rect at `point`), screen:{x,y}, clear:{x0,x1,y0,y1}}.
//  'aerial'         high orbit. {center=[40,0,70], radius=440, height=300, yaw0=-.9, yawSpeed=.045, fov=40, lookY=0}
//  'topdown'        close top-down. {center=[16,0,26], height=78, rot0=-.32, rotSpeed=.012, drift=[.25,.6], fov=44, tilt=.1}
//  'eye-walk'       pedestrian eye level along a path. Path from (first match): points:[[x,z]] | route:'<id>' (ctx.routes,
//                   wide-area routes, pilot routes JR-A-hachiko/JR-B-south/JR-C-newsouth-*) | walk:'hachiko'|'hachikoShort'|
//                   'scramble' (camera.mjs JR_WALKS) | from:[x,z],to:[x,z] (Dijkstra on OSM). {speed=1.35, s0=0 (m) or
//                   wp:n (start at research waypoint n of the walk, minus lead m), lead=0, fov=58, bob=.03, lookAhead=7,
//                   looks:[{s0,s1,at:[x,y,z],w=.7}] (blend the view toward a landmark while s0<s<s1), nearHide=4.5,
//                    crowd=true (false: no solver crowd — only the beat's crowd state, e.g. a light detour street)}
//  'gate-queue'     eye level INSIDE the one-way queue in the passage under the tracks: shuffles west along the south
//                   lane toward the Hachiko gate after the U-turn (JR-GATE-03), with stop-and-go.
//                   {mode='uturn'|'lane'|'gate'|'approach' (start at the U-turn / mid lane / last 14 m / `back` m before the
//                    gate, looking at the gate line from the start), speed=.45, stopGo=.7 (0 smooth … 1 strong stop-and-go),
//                    fov=60, lookGate=.35, eyeY=1.58 (camera height; ≈2.3 = phone held up over the heads), nearHide=1.1,
//                    back=30, lookY=1.6}
//  'gate-newsouth'  calm passage through the New South (3F) or South (1F) gate hall (概略; v6: dressed from the photos, hall
//                   orientation from station-jr HALL_ROT — New South free side = south since v6). v6 framing params:
//                   start=-6.2 (local z of the first camera key), lookY0=1.25 (first look height); v6 re-shoot {start:-10,lookY0:2.3}.
//                   {gate='newSouth'|'south', mode='hall'|'approach' (low drone chase on the pilot route, `approachM` m ending
//                    `stopShort` m before its end, ribbon on), approachM=60, stopShort=14, dur=5, fov=56}
//  'zone-edge'      eye level at the police vehicle-closure line (sets 'closure') in the crowd, handheld drift.
//                   {side='open', back=7, drift=.35, fov=54, lookUp=0, height=1.62 (≈2.7 = over the heads), lookY=1.3,
//                    far=6 (look target behind the line, m), nearHide=1.6}
//  'detour'         low drone chase along a detour route (same path sources as eye-walk; default the pilot route
//                   JR-C-newsouth-west). {height=16, back=20, speed=7, s0=0, fov=50, mode='chase'|'eye', ribbon=true,
//                   color='#4FE3C1'}
//  'routemap'       wide route map. {routes:[ids] (wide-area or ctx.routes/pilot ids), highlight, points|bounds (framing),
//                   azimuth=-8, pitch=66, fov=40, push=.05, dur=6, rect, mapIn=0 (s to blend from 3D to map; 0 = map at
//                   once), drawOn=[t0,t1] (s, ribbon draw-on), redZone=1, colors:{routeId:'#hex'} (fixed colours so a
//                   legend / pins can name them; wide routes via wide.setRouteStyle), routeWidth (m, wide routes; ×1.4 highlighted)}
//  'alt-platform'   generic platform at an alternative station + departure board (sets 'alt-platform'); the board text
//                   comes from params.board {title, rows:[{note:'終電', time, dest}], status, foot} (SOURCED by the
//                   scenario config). {station='harajuku'|'ebisu'|… (the set is re-placed there: sets.setAltStation),
//                   mode='board'|'train'|'empty', trainLeaveAt=1.2, fov=52,
//                   board mode framing: dist=10.5 (m in front of the board at t=0), push=.3 (m/s toward it), side=-1.2 (m,
//                   lateral offset, + = toward the train track), pan=.55 (0 = hold on the board … 1 = full tilt/pan down to
//                   the track; the pan lifts the board + the canopy light strip into the header), lookDy=0 (m, look target
//                   above(+)/below(−) the board centre: + puts the board lower in frame)}
//                   alt-clear FIX (combined alt clear-result / clear-stamp beats, both with the same params; stamp t0:4):
//                   {"station":"ebisu","mode":"board","trainLeaveAt":9,"pan":0,"side":3,"dist":7.5,"push":0.05,"fov":56,
//                    "lookDy":-0.6} → the camera stands just past the pillar at local z +2 (behind it, out of view), 3 m to
//                   the side, and holds on the board: board at screen y≈.32–.52, x≈.03–.90 (fully below the header + clock,
//                   y<.17, above the caption box, y>.62; stills 2026-10-26), canopy light strips out of the frame (they sat
//                   behind the header lockup in the original pan), the pillar at local z −4 falls on the board's empty
//                   right part (canvas x > 402 px: never over 「終電 0:50」「大崎」 or the foot line).
//  'taxi-west'      suspended West-Exit stand (sets 'taxi-west'). {mode='front'|'queue', dur=4, fov=52, height=3.2 (front),
//                   lookY=1.2 (lower = signs sit higher in the frame, above the captions), lookSign=0 (queue: 0..1 toward the pole sign)}
//  'taxi-sakura'    渋谷SAKURAテラス前 stand with moving taxis (sets 'taxi-sakura'). {mode='front'|'queue'|'hero' (kerb view of the
//                   waiting cab: lit lamp, door open), dur=4, fov=52}
//  'interior'       Hachiko concourse dolly (station-jr dolly keys): {part='gates'|'stairs'|'platform'|'all' or
//                   from/to (dolly key time, s), dur (beat length the move is stretched over, default = to-from)}
//  'card-bg'        dim slow orbit behind cards. {center=[40,0,70], radius=430, height=300, yaw0=.6, yawSpeed=.03, dim=.3, fov=40,
//                   tone=null|'warm'|'dark' (v6 CARD_TONES: grade + dim preset)}
//  'true-end-bg'    v6 TRUE END bg: calm, warm, no crowd — distant Shibuya skyline from ~1 km west, slow drift.
//                   {from=[-700,40,-300], look=[60,90,60], drift=[-.3,0,.6], fov=36, dim=.72, tone='warm'}
// Combined episodes (GAME OVER → CONTINUE? → CLEAR → kaiju gag):
//  'caught-pov'     movie-style caught POV (beat `caught`, 2.5 s): the pair's over-result base shot frozen at baseT0, forced to
//                   eye level, the crowd presses in, a decelerating push, violent handheld shake ramping up, red flash, hard
//                   cut to black (stays black). {base='gate-queue' (shot key), baseParams={} (the over config's result-beat
//                   params), baseT0=4 (s into the base shot = end of the 4 s result beat), dur=2.5, eyeY=1.55 (m above the
//                   base's floor: 0, alt-platform = platform top ≈1.1), floorY=null (auto), push=.6 (m forward, eased out
//                   until flashAt), lookPitch=-3 (deg), fov=null (base fov), zoom=-8 (deg over the press: tunnel),
//                   hand=[.25,2.2] (deg handheld noise amplitude at t=0 → flashAt, 7 Hz value noise, yaw/pitch/roll),
//                   shake=[{t:.5,amp:.7},{t:.95,amp:1.2},{t:1.35,amp:1.9},{t:1.75,amp:3.4,decay:.22,freq:13}] (impacts:
//                   deg, damped decay=.3 s, freq=11 Hz), flashAt=1.75, blackAt=2.15 (s), nearHide=.45 (m), hands={} (passed
//                   to vfx-caught), seed=7, board (alt-platform base only: the over board text → baseParams.board; frameSpec
//                   merges beat.board only for the 'alt-platform' key)}.
//                   env.caught = {t, dur, intensity 0..1 (smooth to flashAt), press 0..1 (ease-out to .9·flashAt), flash
//                   (1 at flashAt, e^(−Δt/.12 s), 0 after blackAt), black 0|1 (t ≥ blackAt), seed, hands, flashAt, blackAt,
//                   at:[x,z], dir:[dx,dz], floorY}; after blackAt env.dim=0 + env.blank (nothing drawn → fast).
//                   Pair bases: CAUGHT_BASES {gate: gate-queue approach, taxi: taxi-west queue, zone: zone-edge, alt:
//                   alt-platform harajuku train} (= the over configs' result beats). caughtPovAnchor(ctx, params) → the
//                   frozen player spot {pos, dir, at, floorY, heading} (app-variant feeds it to 'caught-press').
//  'kaiju-skyline'  absurd gag (beat `kaiju`, 4 s): low view (1.7 m) from Meiji-dori ≈260 m north of the station looking
//                   south down the neon street canyon at the real PLATEAU Scramble-Square-class tower (229 m, x113–193
//                   z80–164) with the open sky above; the kaiju rises ≈1.26 km behind it (behind every tower: nothing
//                   intersects it), the tower + the canyon walls hide its lower body, its open mouth clears the tower top
//                   at the roar, eyes + party hat high in the sky (stills 2026-10-26). {from=[155,1.7,-262], look=[160,128,
//                   100], fov=60, dur=4, rise=[.2,2.1] (s, smoothstep 0→1), roarAt=2.35, roarDur=1.05 (s: .22 attack, .3
//                   release), push=.35 (m/s slow push in), kaiju={pos:[160,1000], scale:700 (kaiju.mjs: body height m),
//                   ground:430 (base y: lifted — the base stays hidden behind the tower, the face clears it)}, shake={amp:.9
//                   (deg), decay:.45, freq:9} (at the roar), seed=3, crowd=true, nearHide=3}.
//                   env.kaiju = {...params.kaiju, t, rise, eyes (lights over [rise1−.35, rise1+.1]), roar 0..1, shake 0..1
//                   (roar shake envelope), pos, scale, seed, roarAt, riseT:[t0,t1], riseEnd}. sh.far = 2950.
//  'black'          pure black frame (GAME OVER stamp on black): env.blank + dim 0 → no scene parts drawn, no solver step.
//  'continue-bg'    CONTINUE? background: darker card-bg orbit {yaw0=2.1, yawSpeed=.05, dim=.2, radius=380, height=260,
//                   saturation=.35, alertVig=.55 (red edge vignette)} → env.grade.
// env.grade {saturation, alertVig, vignette} (post uniforms, per frame; other shots get the page's first-seen defaults back);
// env.blank (bool) hides every scene part (applyEnv returns {flat, crowdVisible, blank}).
// Exports: SHOTS, SHOT_KEYS, SHOT_PARAMS (documented defaults), OP_LOGO, opLogoAnchor, applyEnv, resolvePath, withShake,
//          CAUGHT_DEFAULT, CAUGHT_BASES, caughtPovAnchor, KAIJU_DEFAULT.
import * as THREE from '../../vendor/three.module.min.js';
import {aerialOrbit,closeTopDown,eyeLevel,interiorDolly,routeMap,makeShot,applyShot,jrWalkPath,walkRoute,smoothPath,JR_WALKS} from './camera.mjs';
import {JR_GATES,APPROX_LABEL,HALL_ROT} from './station-jr.mjs';

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=t=>t*t*(3-2*t),ease=t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2,easeOut=t=>1-Math.pow(1-t,3),easeInOut3=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
const V3=a=>new THREE.Vector3(a[0],a[1],a[2]);
const cum=p=>{const c=[0];for(let i=1;i<p.length;i++)c.push(c[i-1]+Math.hypot(p[i][0]-p[i-1][0],p[i][1]-p[i-1][1]));return c;};
function at(path,c,s){s=clamp(s,0,c.at(-1));let lo=0,hi=c.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(c[m]<=s)lo=m;else hi=m;}const u=(s-c[lo])/((c[hi]-c[lo])||1);return [path[lo][0]+(path[hi][0]-path[lo][0])*u,path[lo][1]+(path[hi][1]-path[lo][1])*u];}
function env(o){return {aerial:false,eye:false,interior:false,map:0,exposure:null,dim:1,detail:'street',sets:[],routes:null,wideRoutes:null,redZone:0,crowd:true,vehicles:true,landmarks:true,station:true,nearHide:.9,focus:null,approx:false,...o};}
const tag=(sh,e,name)=>{sh.env=env(e);if(name)sh.name=name;return sh;};

// ---------- deterministic camera shake (logo slam etc.) ----------
export function withShake(sh,t,shakes=[]){if(!shakes?.length)return sh;let ox=0,oy=0,rz=0;
 for(const s of shakes){const d=t-s.t;if(d<0)continue;const a=(s.amp??.35)*Math.exp(-d/(s.decay??.5)),f=(s.freq??9)*6.2832;
  ox+=a*(Math.sin(d*f)*.6+Math.sin(d*f*1.73+1.3)*.4);oy+=a*(Math.sin(d*f*1.21+.7)*.6+Math.sin(d*f*2.11+2.1)*.4);rz+=a*.02*Math.sin(d*f*.83+.4);}
 if(!ox&&!oy)return sh;const fwd=sh.look.clone().sub(sh.pos).normalize(),right=new THREE.Vector3().crossVectors(fwd,sh.up).normalize(),up=new THREE.Vector3().crossVectors(right,fwd).normalize();
 const off=right.multiplyScalar(ox).addScaledVector(up,oy);sh.pos.add(off);sh.look.add(off.multiplyScalar(.6));sh.up=up.applyAxisAngle(fwd,rz);return sh;}

// ---------- spline rig (centripetal-ish Catmull-Rom over keys with per-key time, fov, roll) ----------
function splineRig(keys){const P=keys.map(k=>V3(k.pos)),L=keys.map(k=>V3(k.look));
 const cr=(arr,i,u)=>{const p0=arr[Math.max(0,i-1)],p1=arr[i],p2=arr[Math.min(arr.length-1,i+1)],p3=arr[Math.min(arr.length-1,i+2)];const u2=u*u,u3=u2*u;
  return new THREE.Vector3().addScaledVector(p0,-.5*u3+u2-.5*u).addScaledVector(p1,1.5*u3-2.5*u2+1).addScaledVector(p2,-1.5*u3+2*u2+.5*u).addScaledVector(p3,.5*u3-.5*u2);};
 const T=keys.map(k=>k.t),n=keys.length-1;
 return (t,timeWarp=x=>x)=>{const tt=timeWarp(t);let i=0;while(i<n-1&&tt>T[i+1])i++;const u=clamp((tt-T[i])/(T[i+1]-T[i]));
  const pos=cr(P,i,u),look=cr(L,i,u);const k0=keys[i],k1=keys[i+1],s=smooth(u);const fov=k0.fov+(k1.fov-k0.fov)*s,roll=(k0.roll||0)+((k1.roll||0)-(k0.roll||0))*s;return {pos,look,fov,roll};};}
function rolled(pos,look,roll){const fwd=look.clone().sub(pos).normalize();return new THREE.Vector3(0,1,0).applyAxisAngle(fwd,roll);}

// ---------- OP flythrough ----------
// Keys (sim metres): Center-gai mouth → low over the Scramble stripes toward the station → bank right, climb the west
// face of the 220 m tower (PLATEAU, x 113–193, z 80–164) → crest, look back NW across Dogenzaka/Center-gai with the
// horizon at ≈44 % from the top: sky glow fills the top for the logo. Times are the move's own seconds (dur 6.5).
const OP_KEYS=[
 {t:0,   pos:[-46,5.6,-30], look:[10,5.2,6],    fov:66,roll:0},   // fixer: 5.6 m, near-level view (3.6 m still showed a pumpkin / cone / barrier at 2–4 m on frame 0 = thumbnail) (stills 2026-10-26: clean frame 0)
 {t:1.25,pos:[-10,3.4,-4],  look:[48,4.5,30],   fov:64,roll:-.03},
 {t:2.4, pos:[22,12,20],     look:[96,58,96],    fov:60,roll:-.10},
 {t:3.5, pos:[66,64,70],     look:[124,96,112],  fov:56,roll:-.07},
 {t:4.6, pos:[92,158,104],   look:[128,150,128], fov:52,roll:.03},
 {t:5.6, pos:[104,236,140], look:[-60,190,-120],fov:44,roll:.03},
 {t:6.5, pos:[108,262,152], look:[-140,220,-188],fov:42,roll:0},
];
export const OP_LOGO=Object.freeze({
 // where the 3D logo should sit at the end of the move (screen fractions of the 9:16 frame; HUD safe areas respected)
 clear:{x0:.07,x1:.93,y0:.13,y1:.40},screen:{x:.5,y:.27},distance:60,
 note:'At t ≥ dur the camera holds the end pose with a slow push (params.push m/s along view). Put the logo at opLogoAnchor(...).point, facing the camera (normal), scaled to worldWidth; use params.shake for the slam.'});
const OP_DEFAULT={dur:6.5,push:1.6,shake:[],roll:1};
function opShot(ctx,p={}){const o={...OP_DEFAULT,...p};const rig=splineRig(OP_KEYS),D=OP_KEYS.at(-1).t;
 // time warp: fast low rush, slight hang at the crest, settle
 const warp=u=>{const x=clamp(u/o.dur)*D;return x;};
 return t=>{const tm=Math.min(t,o.dur);const r=rig(tm,warp);let pos=r.pos,look=r.look;
  if(t>o.dur){const fwd=look.clone().sub(pos).normalize();const d=(t-o.dur)*o.push;pos=pos.clone().addScaledVector(fwd,d);look=look.clone().addScaledVector(fwd,d);}
  const sh=makeShot(pos,look,{fov:r.fov,name:'op-flythrough'});sh.up=rolled(pos,look,r.roll*o.roll);
  withShake(sh,t,o.shake);
  const u=clamp(t/o.dur);sh.far=2950;// clip the wide-area ground beyond the 3 km sky dome (else a hard fogged band above the skyline)
  // exposure lifts as we leave the street (aerial city reads brighter), bloom handled by the page's look
  return tag(sh,{aerial:u>.55,eye:u<.3,detail:u>.6?'aerial':'street',exposure:1.05+.17*smooth(clamp((u-.4)/.5)),nearHide:u<.35?2.5:.9,focus:[look.x,look.z],vehicles:true},'op-flythrough');};}
export function opLogoAnchor(ctx,params={},t=null){const o={...OP_DEFAULT,...params};const sh=opShot(ctx,{...o,shake:[]})(t??o.dur);const asp=ctx?.aspect??9/16;
 const cam=new THREE.PerspectiveCamera(sh.fov,asp,.3,9000);applyShot(cam,sh);
 const C=OP_LOGO,d=C.distance,ndc=new THREE.Vector3(C.screen.x*2-1,1-C.screen.y*2,.5).unproject(cam).sub(cam.position).normalize();
 const point=cam.position.clone().addScaledVector(ndc,d/ndc.dot(cam.getWorldDirection(new THREE.Vector3())));
 const hH=2*d*Math.tan(THREE.MathUtils.degToRad(sh.fov)/2),worldWidth=hH*asp*(C.clear.x1-C.clear.x0);
 const right=new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld,0),up=new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld,1),normal=new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld,2);
 return {pos:cam.position.clone(),quaternion:cam.quaternion.clone(),fov:sh.fov,point,normal,up,right,distance:d,worldWidth,worldHeight:hH*(C.clear.y1-C.clear.y0),screen:{...C.screen},clear:{...C.clear}};}

// ---------- path sources ----------
export function resolvePath(ctx,p={}){
 if(p.points)return {points:smoothPath(p.points,{insideBuilding:ctx.insideBuilding}),waypoints:[]};
 const id=p.route;if(id){const r=ctx.routes?.[id]??ctx.wideData?.pilotRoutes?.[id]??ctx.wide?.routes?.[id]?.data??ctx.wideData?.routes?.[id];
  if(r?.points)return {points:smoothPath(r.points,{radius:5,insideBuilding:ctx.insideBuilding}),waypoints:[],id};
  console.warn('shots-variants: unknown route',id);}
 if(p.walk&&JR_WALKS[p.walk])return jrWalkPath(ctx.osm,p.walk,{insideBuilding:ctx.insideBuilding});
 if(p.from&&p.to)return walkRoute(ctx.osm,p.from,p.to,{insideBuilding:ctx.insideBuilding});
 return jrWalkPath(ctx.osm,'hachiko',{insideBuilding:ctx.insideBuilding});}
const cache=new WeakMap();
function cachedPath(ctx,p){let m=cache.get(ctx);if(!m){m=new Map();cache.set(ctx,m);}const k=JSON.stringify([p.points?.length,p.points?.[0],p.route,p.walk,p.from,p.to]);if(!m.has(k))m.set(k,resolvePath(ctx,p));return m.get(k);}

// ---------- eye walk ----------
function eyeWalk(ctx,p={}){const o={speed:1.35,s0:0,lead:0,fov:58,bob:.03,lookAhead:7,looks:[],nearHide:4.5,...p};const path=cachedPath(ctx,o);
 let s0=o.s0;if(o.wp!=null){const w=path.waypoints?.find(w=>w.n===o.wp);if(w)s0=Math.max(0,w.s-o.lead);}
 const eye=eyeLevel({path:path.points,speed:o.speed,fov:o.fov,bob:o.bob,lookAhead:o.lookAhead});
 return t=>{const sh=eye(t+s0/o.speed);for(const L of o.looks){if(sh.s<L.s0||sh.s>L.s1)continue;const k=(L.w??.7)*smooth(clamp((sh.s-L.s0)/2))*smooth(clamp((L.s1-sh.s)/2));
   const d0=sh.look.clone().sub(sh.pos).normalize(),d1=V3(L.at).sub(sh.pos).normalize();sh.look=sh.pos.clone().addScaledVector(d0.lerp(d1,k).normalize(),8);}
  return tag(sh,{eye:true,nearHide:o.nearHide,focus:sh.at,approx:true,crowd:o.crowd??true},'eye-walk');};}

// ---------- gate queue (one-way passage, U-turn, Hachiko gate) ----------
function gateQueue(ctx,p={}){const o={mode:'lane',speed:.45,stopGo:.7,fov:60,lookGate:.35,eyeY:1.58,nearHide:1.1,back:30,lookY:1.6,...p};
 // south lane of the passage after the U-turn (x 146 → 86, z ≈ 8.5 → 14.6), then the gate approach
 const lane=[[147,3],[145.2,7.6],[138,9.2],[120,10.4],[104,11.6],[94,13.2],[88,15.2],[86.2,17.6]];
 const pts=smoothPath(lane,{radius:4});const c=cum(pts),total=c.at(-1);const s0={uturn:0,lane:24,gate:Math.max(0,total-14),approach:Math.max(0,total-o.back)}[o.mode]??0;
 const g=JR_GATES.hachiko;
 return t=>{// stop-and-go: progress = speed·t + amplitude·sin (never backwards)
  const w=2*Math.PI/3.2,A=o.stopGo*o.speed/w*.95;const s=Math.min(total,s0+o.speed*t-A*Math.sin(w*t));const v=o.speed*(1-o.stopGo*.95*Math.cos(w*t));
  const q=at(pts,c,s),a=at(pts,c,s+5);let dx=a[0]-q[0],dz=a[1]-q[1];const l=Math.hypot(dx,dz)||1;dx/=l;dz/=l;
  const bob=.02*clamp(v/o.speed)*Math.sin(t*2*Math.PI*1.6),sway=.03*Math.sin(t*.9)+.015*Math.sin(t*2.3);
  const pos=[q[0]-dz*sway,o.eyeY+bob,q[1]+dx*sway];const fwd=[pos[0]+dx*8,o.eyeY-.13,pos[2]+dz*8];
  // mode 'approach' (fixer): raised phone-height view over the heads, gate line + its sign in view from the start
  const gk=o.mode==='approach'?o.lookGate:o.lookGate*smooth(clamp((s-(total-30))/16));const look=V3(fwd).lerp(V3([g.x,o.lookY,g.z+2]),gk);
  const sh=makeShot(pos,look,{fov:o.fov,name:'gate-queue'});sh.at=[q[0],q[1]];sh.s=s;sh.total=total;
  return tag(sh,{eye:true,nearHide:o.nearHide,sets:['gate-queue'],vehicles:false,focus:[q[0],q[1]],approx:true,hideShell:true},'gate-queue');};}// hideShell (QA v6): the PLATEAU station-shell mass sat inside the paid concourse → a black void behind the gates

// ---------- New South / South gate hall ----------
function gateNewSouth(ctx,p={}){const o={gate:'newSouth',mode:'hall',approachM:60,stopShort:14,dur:5,fov:56,...p};const G=JR_GATES[o.gate]||JR_GATES.newSouth;
 if(o.mode==='approach'){const id=o.gate==='south'?'JR-B-south':'JR-C-newsouth-west';const path=cachedPath(ctx,{route:id});const total=cum(path.points).at(-1);
  // low chase (the 1F/3F approaches run under the viaduct / through buildings: an eye walk would be black)
  return detour(ctx,{route:id,s0:Math.max(0,total-o.approachM-o.stopShort),speed:o.approachM/Math.max(1,o.dur),height:48,back:30,fov:o.fov,color:'#FFD23F'});}
 const rot=HALL_ROT[o.gate]??HALL_ROT.newSouth,c=Math.cos(rot),s=Math.sin(rot);const P=(lx,ly,lz)=>[G.x+lx*c+lz*s,G.y+ly,G.z-lx*s+lz*c];
 // dolly through the middle aisle: from the free side (local −z) through the gates into the paid side
 const ax=-.3;// middle aisle centre (between the cabinets at local x −0.72 and +0.12)
 // v6: start (local z of the first key, default −6.2) and lookY0 (first look height, default 1.25) — the v6 re-shoot uses
 // {start:-10,lookY0:2.3} so the JR-style gate band sits below the HUD header with the gates under it
 const st0=o.start??-6.2,ly0=o.lookY0??1.25;
 const keys=[{t:0,pos:P(ax+1.4,1.6,st0),look:P(ax,ly0,2),fov:o.fov},{t:o.dur*.55,pos:P(ax,1.6,-1.8),look:P(ax,1.4,5),fov:o.fov},{t:o.dur,pos:P(ax,1.6,2.6),look:P(ax-1,1.6,8),fov:o.fov+2}];
 const d=interiorDolly(keys);
 return t=>tag(d(t),{interior:true,keepCity:false,eye:true,crowd:false,vehicles:false,landmarks:false,nearHide:1.2,focus:[G.x,G.z],exposure:.8,approx:true},'gate-newsouth');}

// ---------- closure edge ----------
function zoneEdge(ctx,p={}){const o={side:'open',back:7,drift:.35,fov:54,lookUp:0,height:1.62,lookY:1.3,far:6,nearHide:1.6,...p};const A=ctx.sets?.anchors||{};
 const C=A['closure.center']||{x:141,y:1,z:62},N=A['closure.normal']||{x:1,z:0},a=A['closure.a']||{x:C.x-5,z:C.z},b=A['closure.b']||{x:C.x+5,z:C.z};
 const sd=o.side==='closed'?-1:1;const ux=b.x-a.x,uz=b.z-a.z,ul=Math.hypot(ux,uz)||1;
 return t=>{const lat=(t*o.drift)-1,hb=.025*Math.sin(t*1.7)+.012*Math.sin(t*4.1);
  // fixer: height ≈2.7 m (raised over the heads) so the barrier line, tape, cones and the patrol van read behind the crowd
  const pos=[C.x+N.x*sd*o.back+ux/ul*lat,o.height+hb,C.z+N.z*sd*o.back+uz/ul*lat];const look=[C.x-N.x*sd*o.far+ux/ul*lat*.4,o.lookY+o.lookUp+.02*Math.sin(t*1.3),C.z-N.z*sd*o.far+uz/ul*lat*.4];
  const sh=makeShot(pos,look,{fov:o.fov,name:'zone-edge'});sh.at=[pos[0],pos[2]];
  return tag(sh,{eye:true,nearHide:o.nearHide,sets:['closure'],redZone:0,focus:[C.x,C.z],approx:true},'zone-edge');};}

// ---------- detour chase ----------
function detour(ctx,p={}){const o={route:'JR-C-newsouth-west',height:16,back:20,speed:7,s0:0,fov:50,mode:'chase',ribbon:true,color:'#4FE3C1',...p};
 if(o.mode==='eye')return eyeWalk(ctx,{...o,speed:Math.min(o.speed,2.2)});
 const path=cachedPath(ctx,o),pts=path.points,c=cum(pts),total=c.at(-1);const rid='detour:'+(o.route||'points');
 if(o.ribbon&&ctx.sets&&!ctx.sets.routes[rid])ctx.sets.addRoute(rid,pts,{color:o.color,width:3.2,y:.6});
 return t=>{const s=Math.min(total,o.s0+o.speed*t),q=at(pts,c,s),a=at(pts,c,s+14),b0=at(pts,c,Math.max(0,s-o.back));
  let dx=a[0]-b0[0],dz=a[1]-b0[1];const l=Math.hypot(dx,dz)||1;dx/=l;dz/=l;
  const pos=[q[0]-dx*o.back,o.height+1.5*Math.sin(t*.6),q[1]-dz*o.back],look=[q[0]+dx*10,0,q[1]+dz*10];
  const sh=makeShot(pos,look,{fov:o.fov,name:'detour'});sh.at=q;sh.s=s;sh.total=total;
  return tag(sh,{aerial:false,nearHide:.9,routes:o.ribbon?{ids:[rid],progress:1,highlight:rid}:null,focus:q,approx:true},'detour');};}

// ---------- route map ----------
function routemapShot(ctx,p={}){const o={routes:[],highlight:null,azimuth:-8,pitch:66,fov:40,push:.05,dur:6,mapIn:0,drawOn:[.3,1.8],redZone:1,...p};const asp=ctx.aspect??9/16;
 const wideIds=o.routes.filter(id=>ctx.wide?.routes?.[id]),ownIds=o.routes.filter(id=>!ctx.wide?.routes?.[id]);
 for(const id of ownIds){const r=ctx.routes?.[id]??ctx.wideData?.pilotRoutes?.[id];if(r?.points&&ctx.sets&&!ctx.sets.routes['map:'+id])ctx.sets.addRoute('map:'+id,r.points,{color:o.colors?.[id]??(id===o.highlight?'#FFD23F':'#4FE3C1'),width:14,y:2});}
 let pts=o.points;if(!pts&&o.bounds)pts=[[o.bounds[0],o.bounds[1]],[o.bounds[2],o.bounds[3]]];
 if(!pts){pts=[];for(const id of wideIds)pts.push(...ctx.wide.routes[id].data.points.filter((_,i)=>i%3===0));for(const id of ownIds){const r=ctx.routes?.[id]??ctx.wideData?.pilotRoutes?.[id];if(r)pts.push(...r.points);}}
 if(!pts.length)pts=[[-350,-400],[400,400]];
 const rm=routeMap({points:pts,azimuth:o.azimuth,pitch:o.pitch,fov:o.fov,aspect:asp,push:o.push,dur:o.dur,rect:o.rect??{x0:.08,x1:.92,y0:.2,y1:.74},span:!!o.span});
 return t=>{const sh=rm(t);const k=o.mapIn>0?smooth(clamp(t/o.mapIn)):1;const pr=clamp((t-o.drawOn[0])/Math.max(.01,o.drawOn[1]-o.drawOn[0]));
  return tag(sh,{map:k,aerial:true,detail:'aerial',crowd:k<.5,vehicles:k<.5,landmarks:false,exposure:1,wideRoutes:wideIds.length?{ids:wideIds,progress:pr,highlight:o.highlight,colors:o.colors||null,width:o.routeWidth??null}:null,
   routes:ownIds.length?{ids:ownIds.map(i=>'map:'+i),progress:pr,highlight:o.highlight?'map:'+o.highlight:null}:null,redZone:o.redZone*k,focus:[sh.look.x,sh.look.z]},'routemap');};}

// ---------- alternative-station platform ----------
function altPlatform(ctx,p={}){const o={station:'harajuku',mode:'board',trainLeaveAt:1.2,fov:52,...p};const S=ctx.sets;
 if(S?.setAltStation)S.setAltStation(o.station);// fixer: the platform set is re-placed at params.station (alt-clear = 恵比寿)
 const A=S?.anchors||{};
 if(S){if(o.board)S.setBoard(o.board);S.setTrainLeave(o.mode==='empty'?-1e3:o.trainLeaveAt);}
 const C=A['alt-platform.center']||{x:209.8,y:1.1,z:-1211.2},D=A['alt-platform.dir']||{x:0,z:1},Bd=A['alt-platform.board']||{x:C.x,y:4,z:C.z-6},E=A['alt-platform.edge']||C;
 const rx=-D.z,rz=D.x;// right of the platform direction (toward +local x = the train track)
 return t=>{let pos,look;
  if(o.mode==='train'){// stand near the edge, watch the train pull away down the platform
   pos=[C.x+rx*2.4+D.x*14,C.y+1.6,C.z+rz*2.4+D.z*14];const k=smooth(clamp((t-o.trainLeaveAt)/3));look=[E.x+rx*2-D.x*(10+30*k),C.y+1.7,E.z+rz*2-D.z*(10+30*k)];}
  else{// board: start under the board, tilt down/pan to the empty track as the train leaves
   const k=smooth(clamp((t-.6)/2.4))*(o.pan??.55),dd=(o.dist??10.5)-(o.push??.3)*t,sd=o.side??-1.2;pos=[Bd.x+rx*sd+D.x*dd,C.y+1.62,Bd.z+rz*sd+D.z*dd];// fixer: 13 m → 10.5 m (board readable, never cropped)
   const lb=[Bd.x,Bd.y+(o.lookDy??0),Bd.z],lt=[E.x+rx*3-D.x*6,C.y+1.4,E.z+rz*3-D.z*6];look=[lb[0]+(lt[0]-lb[0])*k,lb[1]+(lt[1]-lb[1])*k,lb[2]+(lt[2]-lb[2])*k];}
  const sh=makeShot(pos,look,{fov:o.fov,name:'alt-platform'});
  return tag(sh,{eye:true,sets:['alt-platform'],crowd:false,vehicles:false,landmarks:false,station:false,nearHide:1.2,focus:[C.x,C.z],exposure:.95,approx:true},'alt-platform');};}

// ---------- clear camera spot: first candidate around `target` (fan from the preferred direction) with no PLATEAU
// footprint within `margin` of the camera and a free line of sight to the target ----------
export function pickClear(ctx,target,pref,{dist=11,margin=1.4,step=.26,tries=12}={}){const ib=ctx.insideBuilding;const base=Math.atan2(pref[0],pref[1]);
 if(!ib)return [target.x+Math.sin(base)*dist,target.z+Math.cos(base)*dist];
 for(let k=0;k<=tries;k++){for(const sg of k?[1,-1]:[1]){const a=base+sg*k*step;for(const d of [dist,dist*.75,dist*1.3]){const x=target.x+Math.sin(a)*d,z=target.z+Math.cos(a)*d;if(ib(x,z,margin))continue;
   let ok=true;for(let u=Math.min(.5,2.5/d);u<.95;u+=1/Math.max(4,d)){if(ib(target.x+(x-target.x)*u,target.z+(z-target.z)*u,.15)){ok=false;break;}}if(ok)return [x,z];}}}
 return [target.x+Math.sin(base)*dist,target.z+Math.cos(base)*dist];}

// ---------- taxi stands ----------
function taxiShot(key){return (ctx,p={})=>{const o={mode:'front',dur:4,fov:52,lookY:1.2,lookSign:0,...p};const A=ctx.sets?.anchors||{};
 let clear=null;const S=A[key+'.stand']||{x:0,z:0},Q=A[key+'.queueDir']||{x:-1,z:0},K=A[key+'.kerb']||S,F=A[key+'.camFront'];
 return t=>{let pos,look;const u=clamp(t/o.dur);
  if(o.mode==='hero'&&A[key+'.hero']){// fixer: from the kerb behind the waiting cab, rear-quarter view of the open door + lit lamp
   const H=A[key+'.hero'],kl=Math.hypot(K.x-S.x,K.z-S.z)||1,zx=(K.x-S.x)/kl,zz=(K.z-S.z)/kl,b=9.5-1.5*ease(u);
   pos=[H.x+Q.x*b+zx*.6,1.9+.012*Math.sin(t*1.7),H.z+Q.z*b+zz*.6];look=[H.x-Q.x*2,.8,H.z-Q.z*2-0];}
  else if(o.mode==='queue'){// from the back of the (crowd-state) queue, looking along it to the stand
   pos=[S.x+Q.x*13-(K.x-S.x)*.6,1.6+.015*Math.sin(t*1.8),S.z+Q.z*13-(K.z-S.z)*.6];look=[S.x-Q.x*4,o.lookY,S.z-Q.z*4];
   // lookSign (fixer): blend the view toward the stand's pole sign (taxi-west: keep 「休止中」 inside the frame)
   const H=o.lookAnchor&&A[key+'.'+o.lookAnchor];if(H){const w=o.lookAnchorW??.6;look=[look[0]+(H.x-look[0])*w,look[1]+(1-look[1])*w,look[2]+(H.z-look[2])*w];}
   const G=A[key+'.sign'];if(G&&o.lookSign>0){look=[look[0]+(G.x-look[0])*o.lookSign,look[1]+(G.y-.9-look[1])*o.lookSign,look[2]+(G.z-look[2])*o.lookSign];}}
  else{// lookAnchor (fixer): frame another anchor of the piece, e.g. taxi-sakura 'hero' (the cab waiting with its door open)
   const S2=(o.lookAnchor&&A[key+'.'+o.lookAnchor])||S;const f0=F||{x:S.x+(K.x-S.x)*6,z:S.z+(K.z-S.z)*6};const cp=clear||(clear=pickClear(ctx,S2,[f0.x-S.x,f0.z-S.z],{dist:o.dist??Math.hypot(f0.x-S.x,f0.z-S.z)}));const f={x:cp[0],z:cp[1]};const side=[Q.x*(3-6*ease(u)),0,Q.z*(3-6*ease(u))];
   pos=[f.x+side[0],o.height??3.2,f.z+side[2]];look=[S2.x+side[0]*.3,o.lookY,S2.z+side[2]*.3];}
  const sh=makeShot(pos,look,{fov:o.fov,name:key});
  return tag(sh,{eye:true,sets:[key],nearHide:1.4,focus:[S.x,S.z],approx:true},key);};};}

// ---------- interior ----------
const INTERIOR_PARTS={gates:[0,6],stairs:[6,14.2],platform:[12.8,16.5],all:[0,16.5]};
function interiorShot(ctx,p={}){const r=INTERIOR_PARTS[p.part]||null;const from=p.from??(r?r[0]:0),to=p.to??(r?r[1]:6),dur=p.dur??(to-from);const d=interiorDolly(ctx.st.dolly('hachiko'));
 return t=>{const sh=d(from+(to-from)*clamp(t/Math.max(.01,dur)));const y=sh.pos.y;return tag(sh,{interior:true,eye:true,vehicles:false,landmarks:false,nearHide:2.4,exposure:.85-.25*clamp((y-3)/5),focus:[sh.pos.x,sh.pos.z],approx:true},'interior');};}

// ---------- card background ----------
// v6 tone presets (env.grade; shadowTint/highTint = fx.mjs split-tone uniforms): 'warm' (TRUE END: calm, golden) | 'dark'
// (GOODBYE end card: deeper, desaturated). The dim is the preset's unless params.dim is given.
export const CARD_TONES=Object.freeze({
 warm:{dim:.45,grade:{saturation:.95,vignette:.5,shadowTint:[.012,.004,-.012],highTint:[.12,.055,-.05]}},
 dark:{dim:.18,grade:{saturation:.6,vignette:.7}}});
function cardBg(ctx,p={}){const T=CARD_TONES[p.tone]||null;const o={center:[40,0,70],radius:430,height:300,yaw0:.6,yawSpeed:.03,dim:T?.dim??.3,fov:40,...p};const orb=aerialOrbit(o);
 return t=>tag(orb(t),{aerial:true,detail:'aerial',dim:o.dim,exposure:1.1,crowd:o.crowd??false,focus:[o.center[0],o.center[2]],...(T?{grade:T.grade}:{})},'card-bg');}

// ---------- v6 TRUE END background: calm, warm, no crowd — Shibuya seen from far away (you stayed away) ----------
// Camera on the quiet north-west side (~840 m out, 40 m up over the low-rise) looking at the distant Shibuya tower cluster;
// slow lateral drift, warm grade, no crowd / vehicles / sets. {from=[-700,40,-300], look=[60,90,60], drift=[-.3,0,.6]
// (m/s), fov=36, dim=.72, tone='warm'}
function trueEndBg(ctx,p={}){const o={from:[-700,40,-300],look:[60,90,60],drift:[-.3,0,.6],fov:36,dim:.72,tone:'warm',...p};const T=CARD_TONES[o.tone]||CARD_TONES.warm;
 return t=>{const pos=[o.from[0]+o.drift[0]*t,o.from[1]+o.drift[1]*t,o.from[2]+o.drift[2]*t];const sh=makeShot(pos,o.look,{fov:o.fov,name:'true-end-bg'});
  return tag(sh,{aerial:true,detail:'aerial',dim:o.dim,exposure:1.05,crowd:false,vehicles:false,landmarks:false,focus:[o.look[0],o.look[2]],grade:T.grade},'true-end-bg');};}// integrator: crowd off by default (invisible at 300 m under a .3 dim, ≈3 s/frame)


// ---------- combined episodes: caught POV / kaiju gag / black / continue ----------
// deterministic hash noise (seeded), smooth value noise in t: handheld shake without a wall clock / RNG state
const hash1=n=>{let t=(n+0x6D2B79F5)|0;t=Math.imul(t^t>>>15,1|t);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
function vnoise(t,seed){const i=Math.floor(t),f=t-i,u=f*f*(3-2*f),a=hash1(i*7919+seed*104729)*2-1,b=hash1((i+1)*7919+seed*104729)*2-1;return a+(b-a)*u;}
// rotate a shot's view: yaw/pitch/roll in degrees about the camera's own axes (keeps the eye position)
function rotView(sh,yaw,pitch,roll){const d=sh.look.clone().sub(sh.pos),len=d.length()||1;const fwd=d.normalize(),up0=sh.up?.clone?.()??new THREE.Vector3(0,1,0);
 const right=new THREE.Vector3().crossVectors(fwd,up0).normalize(),up=new THREE.Vector3().crossVectors(right,fwd).normalize(),r=Math.PI/180;
 fwd.applyAxisAngle(up,-yaw*r).applyAxisAngle(right,pitch*r);up.applyAxisAngle(right,pitch*r);up.applyAxisAngle(fwd,roll*r);sh.look=sh.pos.clone().addScaledVector(fwd,len);sh.up=up;return sh;}
// handheld + impact shake: hand=[amp at t=0, amp at rampTo] (deg, value noise at `freq` Hz), hits=[{t, amp (deg), decay=.3 s,
// freq=11 Hz}] (damped oscillation), pos (m per deg: small positional jolt along the camera's right/up axes)
function povShake(sh,t,{hand=[.2,2],rampTo=1.75,freq=7,hits=[],seed=1,pos=.012}={}){const k=smooth(clamp(t/Math.max(.01,rampTo))),a=hand[0]+(hand[1]-hand[0])*k;
 let yaw=a*vnoise(t*freq,seed),pitch=a*.8*vnoise(t*freq*1.13+31,seed+1),roll=a*1.3*vnoise(t*freq*.71+57,seed+2);
 for(const h of hits){const d=t-h.t;if(d<0)continue;const e=(h.amp??1)*Math.exp(-d/(h.decay??.3)),w=(h.freq??11)*6.2832;yaw+=e*Math.sin(d*w+.3);pitch+=e*.9*Math.sin(d*w*1.31+1.1);roll+=e*1.6*Math.sin(d*w*.77+2.2);}
 const fwd=sh.look.clone().sub(sh.pos).normalize(),right=new THREE.Vector3().crossVectors(fwd,sh.up).normalize(),up=new THREE.Vector3().crossVectors(right,fwd).normalize();
 const off=right.multiplyScalar(yaw*pos).addScaledVector(up,pitch*pos);sh.pos.add(off);sh.look.add(off);return rotView(sh,yaw,pitch,roll);}

export const CAUGHT_DEFAULT=Object.freeze({base:'gate-queue',baseParams:{},baseT0:4,dur:2.5,eyeY:1.55,floorY:null,push:.6,lookPitch:-3,fov:null,zoom:-8,
 shake:[{t:.5,amp:.7},{t:.95,amp:1.2},{t:1.35,amp:1.9},{t:1.75,amp:3.4,decay:.22,freq:13}],hand:[.25,2.2],flashAt:1.75,blackAt:2.15,nearHide:.45,hands:{},seed:7});
// Pair bases (the over-result shots of the GAME OVER configs; eye height is forced to eyeY above the base's floor):
export const CAUGHT_BASES=Object.freeze({
 gate:{base:'gate-queue',baseParams:{mode:'approach',back:17,speed:.3,stopGo:.9,eyeY:2.3,nearHide:2.2,lookGate:.85,lookY:1.9},baseT0:4},
 taxi:{base:'taxi-west',baseParams:{mode:'queue',dur:6.5,lookSign:.8,lookY:.6},baseT0:4},
 zone:{base:'zone-edge',baseParams:{side:'open',back:8,height:4.2,lookY:0,far:3,nearHide:2.5},baseT0:4},
 alt:{base:'alt-platform',baseParams:{station:'harajuku',mode:'train',trainLeaveAt:.4},baseT0:4}});
const floorOf=(ctx,key)=>key==='alt-platform'?(ctx.sets?.anchors?.['alt-platform.center']?.y??1.1):0;
// static player anchor of a caught-pov beat (base shot frozen at baseT0, flattened to eye level): {pos, dir:[dx,dz], at:[x,z],
// floorY, heading (rad, atan2(dx,dz))} — app-variant passes it to the beat's crowd state as params.pov
export function caughtPovAnchor(ctx,p={}){const o={...CAUGHT_DEFAULT,...p};const bk=SHOTS[o.base]?o.base:'gate-queue';const bs=SHOTS[bk](ctx,o.baseParams||{})(o.baseT0);
 const fy=o.floorY??floorOf(ctx,bk);let dx=bs.look.x-bs.pos.x,dz=bs.look.z-bs.pos.z;const l=Math.hypot(dx,dz);if(l<1e-3){dx=0;dz=-1;}else{dx/=l;dz/=l;}
 return {pos:[bs.pos.x,fy+o.eyeY,bs.pos.z],dir:[dx,dz],at:[bs.pos.x,bs.pos.z],floorY:fy,heading:Math.atan2(dx,dz),fov:bs.fov,baseEnv:bs.env,base:bk};}
function caughtPov(ctx,p={}){const o={...CAUGHT_DEFAULT,...p};if(o.board&&(o.base==='alt-platform'))o.baseParams={...(o.baseParams||{}),board:o.board};const A=caughtPovAnchor(ctx,o),fov0=o.fov??A.fov,pr=o.lookPitch*Math.PI/180;
 return t=>{const u=clamp(t/Math.max(.01,o.flashAt));// the press: a decelerating push, then nothing moves but the shake
  const d=o.push*easeOut(u),bob=.012*Math.sin(t*2*Math.PI*1.1)*(1-u);
  const pos=[A.pos[0]+A.dir[0]*d,A.pos[1]+bob,A.pos[2]+A.dir[1]*d],look=[pos[0]+A.dir[0]*8*Math.cos(pr),pos[1]+8*Math.sin(pr),pos[2]+A.dir[1]*8*Math.cos(pr)];
  const sh=makeShot(pos,look,{fov:fov0+o.zoom*smooth(u),name:'caught-pov'});povShake(sh,t,{hand:o.hand,rampTo:o.flashAt,hits:o.shake,seed:o.seed});
  const black=t>=o.blackAt?1:0,flash=black?0:t<o.flashAt?0:Math.exp(-(t-o.flashAt)/.12);
  const caught={t,dur:o.dur,intensity:black?1:smooth(u),press:black?1:easeOut(clamp(t/(o.flashAt*.9))),flash,black,seed:o.seed,hands:o.hands||{},flashAt:o.flashAt,blackAt:o.blackAt,at:A.at,dir:A.dir,floorY:A.floorY};
  const be=A.baseEnv||{};sh.at=A.at;
  return tag(sh,{...be,eye:true,interior:false,nearHide:o.nearHide,focus:A.at,dim:black?0:1,caught,...(black?{blank:true,crowd:false,sets:[],vehicles:false,landmarks:false,station:false}:{})},'caught-pov');};}

// kaiju gag: low street view up at the real PLATEAU towers (Scramble-Square-class 229 m x113–193 z80–164, Hikarie-class 185 m
// x216–347 z−2–91); the kaiju rises far behind them (its lower body hidden by the towers / the wide-area city)
export const KAIJU_DEFAULT=Object.freeze({from:[155,1.7,-262],look:[160,128,100],fov:60,dur:4,rise:[.2,2.1],roarAt:2.35,roarDur:1.05,push:.35,
 kaiju:{pos:[160,1000],scale:700,ground:430},shake:{amp:.9,decay:.45,freq:9},seed:3,crowd:true,nearHide:3});
function kaijuSkyline(ctx,p={}){const o={...KAIJU_DEFAULT,...p,kaiju:{...KAIJU_DEFAULT.kaiju,...(p.kaiju||{})},shake:{...KAIJU_DEFAULT.shake,...(p.shake||{})}};
 const F=V3(o.from),Lk=V3(o.look),fwd=Lk.clone().sub(F).normalize();
 return t=>{const pos=F.clone().addScaledVector(fwd,o.push*t),look=Lk.clone().addScaledVector(fwd,o.push*t);
  const sh=makeShot(pos,look,{fov:o.fov,name:'kaiju-skyline'});sh.far=2950;
  const rise=smooth(clamp((t-o.rise[0])/Math.max(.01,o.rise[1]-o.rise[0]))),eyes=smooth(clamp((t-o.rise[1]+.35)/.45));
  const dr=t-o.roarAt,roar=dr<0?0:dr<.22?smooth(dr/.22):dr<o.roarDur-.3?1:smooth(clamp((o.roarDur-dr)/.3));
  const sk=dr<0?0:Math.exp(-dr/o.shake.decay)*smooth(clamp(dr/.08));// shake envelope 0..1 (the page / kaiju may also bob with it)
  if(sk>0)povShake(sh,dr,{hand:[0,0],hits:[{t:0,amp:o.shake.amp,decay:o.shake.decay,freq:o.shake.freq}],seed:o.seed,pos:.03});
  const kaiju={...o.kaiju,t,rise,eyes,roar,shake:sk,pos:[...o.kaiju.pos],scale:o.kaiju.scale,seed:o.seed,roarAt:o.roarAt,riseT:[...o.rise],riseEnd:o.rise[1]};
  return tag(sh,{eye:true,detail:'street',exposure:1.08,crowd:o.crowd,vehicles:true,nearHide:o.nearHide,focus:[pos.x+fwd.x*30,pos.z+fwd.z*30],kaiju},'kaiju-skyline');};}

// pure black (after the caught cut; GAME OVER stamp on black): nothing drawn, post faded out → fast
function blackShot(){return t=>tag(makeShot([0,-500,0],[0,-500,-10],{fov:50,name:'black'}),{blank:true,dim:0,crowd:false,vehicles:false,landmarks:false,station:false,sets:[],aerial:true,detail:'aerial',exposure:1},'black');}
// CONTINUE? background: a darker, desaturated, red-vignetted card-bg orbit
function continueBg(ctx,p={}){const o={yaw0:2.1,yawSpeed:.05,dim:.2,radius:380,height:260,saturation:.35,alertVig:.55,...p};const f=cardBg(ctx,o);
 return t=>{const sh=f(t);sh.env.grade={saturation:o.saturation,alertVig:o.alertVig};sh.name='continue-bg';return sh;};}

export const SHOTS=Object.freeze({
 'op-flythrough':opShot,
 aerial:(ctx,p={})=>{const f=aerialOrbit({center:[40,0,70],radius:440,height:300,yaw0:-.9,yawSpeed:.045,fov:40,lookY:0,...p});return t=>tag(f(t),{aerial:true,detail:'aerial',exposure:1.22,focus:[(p.center||[40])[0],(p.center||[0,0,70])[2]]},'aerial');},
 topdown:(ctx,p={})=>{const f=closeTopDown({center:[16,0,26],height:78,rot0:-.32,rotSpeed:.012,drift:[.25,.6],fov:44,tilt:.1,...p});return t=>tag(f(t),{aerial:false,detail:'street',exposure:1.05,focus:[(p.center||[16])[0],(p.center||[0,0,26])[2]]},'topdown');},
 'eye-walk':eyeWalk,
 'gate-queue':gateQueue,
 'gate-newsouth':gateNewSouth,
 'zone-edge':zoneEdge,
 detour,
 routemap:routemapShot,
 'alt-platform':altPlatform,
 'taxi-west':taxiShot('taxi-west'),
 'taxi-sakura':taxiShot('taxi-sakura'),
 interior:interiorShot,
 'card-bg':cardBg,
 'true-end-bg':trueEndBg,
 'caught-pov':caughtPov,
 'kaiju-skyline':kaijuSkyline,
 black:blackShot,
 'continue-bg':continueBg,
});
export const SHOT_KEYS=Object.freeze(Object.keys(SHOTS));
export const SHOT_PARAMS=Object.freeze({'op-flythrough':OP_DEFAULT,interiorParts:INTERIOR_PARTS,'caught-pov':CAUGHT_DEFAULT,caughtBases:CAUGHT_BASES,'kaiju-skyline':KAIJU_DEFAULT});
export {APPROX_LABEL};

// ---------- apply a shot to the shared scene ----------
// parts: {camera, sky, R (realism), st (station), LM (landmarks), wide, city, crowd?, hs? (HalloweenScene), vehicles?, post,
//         sets?, extraCrowds?:[CostumeCrowd...]}. Returns {flat, crowdVisible, blank}. Crowd culling / near-hide stays with the page.
export function applyEnv(shot,P,tLocal=0){const e=shot.env||env({});const k=e.map||0,flat=k>.5;
 if(P.wide){P.wide.group.visible=true;P.wide.setMapAmount(k);P.wide.mapCity(P.city,k);
  const W=e.wideRoutes;P.wide.showRoutes(W?W.ids:null,{highlight:W?.highlight??null});if(W)for(const id of W.ids){P.wide.drawOn(id,typeof W.progress==='object'?(W.progress[id]??1):(W.progress??1));if(P.wide.setRouteStyle&&(W.colors?.[id]||W.width))P.wide.setRouteStyle(id,{color:W.colors?.[id]??null,width:W.width?W.width*(id===W.highlight?1.4:1):null});}
  P.wide.showRedZone(e.redZone||0);}
 const blank=!!e.blank;// 'black' / caught-pov after the cut: nothing drawn (the page treats it like a flat frame → fast)
 if(P.sky)P.sky.visible=!flat&&!blank;if(P.R){if(P.R.glow)P.R.glow.visible=!flat;if(P.R.skyline)P.R.skyline.visible=!flat;P.R.group.visible=!flat&&!blank;P.R.setInterior(!!e.interior,{keepCity:e.keepCity!==false});if(P.R.shell)P.R.shell.visible=!e.interior&&!e.hideShell;P.R.setDetail(e.aerial||flat?'aerial':(e.detail||'street'));}
 if(P.st)P.st.group.visible=!flat&&!blank&&e.station!==false;
 if(P.LM)P.LM.visible=!flat&&!blank&&!e.interior&&e.landmarks!==false;
 if(P.hs)P.hs.visible=!flat&&!blank&&!e.interior;
 if(P.vehicles)P.vehicles.mesh.visible=!flat&&!blank&&e.vehicles!==false;
 const crowdVisible=!flat&&!blank&&e.crowd!==false;if(P.crowd)P.crowd.visible=crowdVisible;
 if(P.wide&&blank)P.wide.group.visible=false;
 if(P.sets){P.sets.show(flat||blank?[]:e.sets||[]);P.sets.update(tLocal);const R=e.routes;P.sets.showRoutes(R?R.ids:null,{progress:R?.progress??1,highlight:R?.highlight??null});}
 if(P.post){const U=P.post.settings;U.uExposure.value=e.exposure??(e.aerial&&!flat?1.22:e.interior?.85:1);U.uFade.value=(shot.fade??1)*(e.dim??1);
  // env.grade {saturation, alertVig, vignette}: per frame from the page's first-seen defaults (stateless: other shots get them back)
  const G=P.post.__gradeDefaults??=({saturation:U.uSaturation?.value??1.08,alertVig:U.uAlertVig?.value??0,vignette:U.uVignette?.value??.55,
   shadowTint:U.uShadowTint?.value?.toArray?.()??null,highTint:U.uHighTint?.value?.toArray?.()??null});const g=e.grade||{};
  if(U.uSaturation)U.uSaturation.value=g.saturation??G.saturation;if(U.uAlertVig)U.uAlertVig.value=g.alertVig??G.alertVig;if(U.uVignette)U.uVignette.value=g.vignette??G.vignette;
  // v6: split-tone tints (warm TRUE END); stateless like the rest — other shots get the page defaults back
  for(const k of ['shadowTint','highTint']){const u=U['u'+k[0].toUpperCase()+k.slice(1)];const v=g[k]??G[k];if(u?.value?.set&&v)u.value.set(...v);}}
 if(P.camera){P.camera.far=shot.far||9000;applyShot(P.camera,shot);}
 return {flat,crowdVisible,blank};}
