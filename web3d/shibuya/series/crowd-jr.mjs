// 「ハロウィンの渋谷を脱出せよ！ JR編」 crowd scenario (series pilot). SIMULATION ONLY.
// Runs on the existing Halloween solver (halloween.mjs: social force, 1 m² occupancy limit of 4 people,
// SUMO-coupled scramble signal, police pens/lanes/props). On top of it this module adds:
//  • station-bound crowd: ordinary members of the Halloween crowd who decide to go home by JR walk
//    (on foot, never relocated) to a JR gate front and queue there for entry metering (assumption);
//  • route walkers: a group per JR route (the first walker of the example route A is the PLAYER) from
//    Hachiko Square to ハチ公改札 (with the one-way U-turn, JR-GATE-03) / 南改札 / 新南改札, plus the in-sim
//    leg of the walk to 原宿 (別駅脱出, ALT-HARA-H); legs follow $L/alt-routes.json;
//  • alighting passengers coming OUT of each gate (counter-flow) from a pool of extra agents;
//  • an interior gate-queue model (ConcourseModel) for the concourse shot: 14 ticket-gate lanes, stairs and an
//    escalator to the Yamanote platform (station-jr.mjs geometry), fed by the outdoor admissions.
// Every number this module reports is a count of agents, or agents per m² of standable area, in this
// simulation → label it 「シミュレーション」 on screen. Every rate in JR_CROWD is an ASSUMPTION of this toy
// model (not a JR / police figure; JR's 2026 measures are unannounced, NA-JR-2026). Gate names and what they
// lead to come only from the fact ids listed per item ($L/facts-series.json); positions are approximate
// (「位置・構造は概略」): gate points from $L/alt-routes.json (same as station-jr.mjs JR_GATES).
// 2D model simplifications (documented, approximate): pedestrian decks over buildings are walkable
// (openDecks), the passage in front of the Hachiko gate gets a central divider (JR_DIVIDERS), the paid
// concourse behind it is not outdoor network (JR_INTERIOR), at-grade tracks outside the station box are not
// walkable for route walkers. Densities never exceed 4 p/m² (the solver's hard occupancy limit); a 3 m cell
// at 4.0 means the model is at its limit, not a measured crush.
//
// ─── DATA CONTRACT ────────────────────────────────────────────────────────────
// Coordinates: sim metres, x = east, z = south, scramble = origin (same as escape.mjs).
// configureJR(config, jr?) → sets the episode crowd (48,000 people at 21:00, Halloween quota) like halloween-app configure().
// new JRCrowdSimulation(config, osm, plateau, traffic)
//   config = shibuya_config.json (+ configureJR) + {agents?: base crowd, hour?, jr?: {…JR_CROWD overrides}}
//   Indices: [0, baseN) Halloween crowd; then route walkers (JR_ROUTES × jr.walkers); then the alighting pool
//   (size = scheduled exits). Extra agents are hidden (x = z = HIDDEN, |x| > 5000 → CostumeCrowd hides them)
//   until spawned and after they finish; admitted crowd members are hidden too (INSIDE). Motion codes: JMOTION
//   (≥ 16, handled by extraAgent()). Same config → same positions (deterministic).
// sim.jrRoutes  → static [{key:'A'…'D', gate|null, kind:'gate'|'walk-alt', recommended, color, label:{ja,en}, sources,
//                  start:{x,z,label,sources}, path:[[x,z]…] (walkable, ≤ 2 m vertex spacing, ends in the zone),
//                  zone:{x,z,radius}, length (m), freeFlow (s), simLimit (s), offsim:[[x,z],[x,z]]|null, offsimLabel|null, edgeBearing}]
// sim.jrGates   → static [{key:'hachiko'|'south'|'shinminami', label:{ja,en}, floor, leadsTo:{ja,en}, sources, x, z (gate point),
//                  front:{x,z,radius,gap (m from the gate point)}, block, capacity (p/s, assumption), approx:true}]
// sim.runJR({onKeyframe?}) → jr.warmup s of crowd, then all routes; stops when every walker is done or after
//                  jr.tmax s. Keyframes every jr.keyframe s (simTime t = 0 at the first spawn = absolute time warmup).
// sim.jrState({camera?:{x,z}, radius?}) → live per-frame stats (also snapshot().jr):
//   {label:'simulation', simTime, time, counts:{modelled, outside, enteredStation, alighted, alighting, bound, pending,
//    walkersDone, inside, nearCamera}, density:{camera:{max,mean,cells} (3 m cells within radius), player (p/m², densest
//    cell ≤ 6 m), peakArea:{value,x,z} (densest cell around plaza/Scramble/JR approaches now), peakRun},
//    player:{route,x,z,walking,queued,reachedAt,admittedAt,denseSeconds,maxDensity,outcome,reason},
//    routes:[{key,spawned,pending,walking,queued,done,medianTime,outcome,reason}],
//    gates:[{key,queue,admitted,perMin,frontDensity,tokens}]}
// jrFrameFrom(run, simTime, {camera?, radius?}) → the same shape from precomputed keyframes (numbers are those of
//   the keyframe at or before simTime, never interpolated; nearCamera/density.camera from the keyframe's 3 m count
//   grid at cell resolution; walker positions interpolated for motion only).
// precomputeJR(config, osm, plateau, traffic, opts?) → plain clone-safe data (worker: crowd-jr-worker.mjs):
//   {routes, gates, summary, keyframes, keyframe, warmup, grid:{x0,z0,cell,w,h,area}, assumptions, approx,
//    concourse:{gate, layout, run}, admitLog, ms}. ≈ 300 s at 48,000 people / tmax 600 in node (one thread).
// ConcourseModel / runConcourse(gate, admitLog, {layout?}) / concourseFrame(run, t) → interior queue model in sim metres
//   (x,y,z per person; t = absolute sim time = warmup + simTime); concourseLayoutFrom(st) adopts station-jr.mjs's
//   gateRow/anchors. A resumed render segment re-steps the live solver from t = 0 (≈ 0.4 s per sim s at 48,000).
import {HalloweenSimulation,HALLOWEEN,EXTRA_MOTION} from '../halloween.mjs';

export const JMOTION=Object.freeze({PENDING:EXTRA_MOTION,WALK:EXTRA_MOTION+1,DONE:EXTRA_MOTION+2,BOUND:EXTRA_MOTION+3,INSIDE:EXTRA_MOTION+4,OUT:EXTRA_MOTION+5});
const {PENDING,WALK,DONE,BOUND,INSIDE,OUT}=JMOTION;
export const HIDDEN=-9999;

// Model assumptions (all of them; none is a published figure).
export const JR_CROWD=Object.freeze({
 RE:380,            // route grid half-size (m), same as escape.mjs
 walkers:24,        // walkers per route (the first walker of the example route is the player)
 spawnGap:2,        // s between spawns on a route
 startRadius:6,     // start zone radius (m)
 corridor:7, offCost:6,// route corridor (m) and cost multiplier outside it
 warmup:150,        // s of Halloween crowd before the first spawn (queues and pens build up)
 tmax:600,          // s of route time at most
 keyframe:1,        // s between keyframes
 freeSpeed:1.35,    // m/s for free-flow times
 boundRate:2.4,     // people per second of the crowd who head for a JR gate (assumption, ≈8,600/h)
 boundReach:260,    // m on foot: only people this close to a gate are recruited
 frontRadius:2.5,   // m: admission zone at each gate front
 queueReach:22,     // m on foot from the admission zone that counts as "queue"
 queueStop:3,       // people per m² ahead at which a queuing walker stops (spacing in the queue)
 tokenMax:2,        // admission bucket depth (people)
 headway:150,       // s between alighting bursts at a gate (assumption)
 dense:3, crush:4,  // p/m² thresholds (as escape.mjs)
 rule:{denseMax:30,limitFactor:2,limitSlack:60},// ESCAPED rule (assumption, as escape.mjs)
 grid:{x0:-59,z0:-377,x1:241,z1:271},// keyframe count-grid window (3 m cells, aligned with the solver's cells)
 cameraRadius:12,   // m around the camera for nearCamera / density.camera
 playerReach:6,     // m around the player for density.player
 crosswalk:{cycle:120,walk:30,cutoff:5},// assumed signal of non-scramble crosswalks (as escape.mjs)
});
// Page/worker config for the episode (as halloween-app.mjs configure(): 48,000 people at 21:00, Halloween quota).
export function configureJR(config,jr={}){config.mode='jr';config.agents=HALLOWEEN.agents;config.hour=HALLOWEEN.hour;config.quota=HALLOWEEN.quota;config.promotion=false;config.jr={...config.jr,...jr};return config;}
export const JR_ASSUMPTIONS=Object.freeze({
 ja:'シミュレーション（仮定）：JRへ向かう人 毎秒約2.4人、改札前の入場整理 1.0〜1.4人/秒、降車の波 150秒ごと。実際の人数・規制ではありません',
 en:'Simulation (assumptions): ~2.4 people/s head for JR, entry metering 1.0–1.4 people/s at each gate front, alighting waves every 150 s. Not real counts or measures.'});

// JR gates (names, what they lead to: JR-GATE-01/02/03/08/09/10/13 in $L/facts-series.json). `at`: gate point from
// $L/alt-routes.json jr_gates (lat/lon → sim metres; the same points as station-jr.mjs JR_GATES). `front`: the
// walkable cell of the 2D model nearest to it where the outdoor queue is admitted (South / New South: the gate
// itself is inside the station building / on the 3F deck, ~18–21 m away, not modelled outdoors).
// `block` [x0,z0,x1,z1]: cells the inbound queue may not use (JR-GATE-03: the passage in front of the Hachiko
// gate is one-way with a central divider; from the Hachiko side you walk through to the East exit side and U-turn).
export const JR_GATES=Object.freeze([
 {key:'hachiko',label:{ja:'ハチ公改札',en:'Hachiko gate'},floor:'1F',leadsTo:{ja:'出て左がハチ公口、右が宮益坂口',en:'Left: Hachiko exit; right: Miyamasuzaka exit'},
  sources:['JR-GATE-01','JR-GATE-02','JR-GATE-03','JR-GATE-10'],at:[85.9,18.9],front:[85.5,16.5],frontRadius:2.6,block:[40,15,82,18.5],capacity:1.0,burst:46,offset:20},
 {key:'south',label:{ja:'南改札',en:'South gate'},floor:'1F',leadsTo:{ja:'出て左が西口、右が東口',en:'Left: West exit; right: East exit'},
  sources:['JR-GATE-01','JR-GATE-13'],at:[96.6,161.5],front:[78.5,159.5],frontRadius:3,block:null,capacity:1.4,burst:36,offset:70},
 {key:'shinminami',label:{ja:'新南改札',en:'New South gate'},floor:'3F',leadsTo:{ja:'出て右がサクラステージ、左がストリーム（3F）',en:'Right: Sakura Stage; left: Shibuya Stream (3F)'},
  sources:['JR-GATE-01','JR-GATE-08','JR-GATE-09'],at:[159.7,259.3],front:[118,228],frontRadius:3,block:null,capacity:1.4,burst:36,offset:110},
]);
// Routes from the start (alt-routes.json start point H, Hachiko Square koban side). `via` forces legs along the
// research routes (alt-routes.json pilot_routes / alt_routes polylines → sim metres); walk-alt ends at the sim edge.
// JR-GATE-03 central divider of the passage in front of the Hachiko gate (solid for everyone; position approximate:
// the passage is the walkable strip z ≈ 11–18 under the tracks): north half eastbound, south half westbound.
export const JR_DIVIDERS=Object.freeze([[82,14,138,15]]);
// The paid concourse behind the Hachiko gate line (station-jr.mjs walls: x 54–97, z 19.5–52.5) is solid for the
// outdoor model (the interior model covers it); people placed there at t = 0 start outside instead.
export const JR_INTERIOR=Object.freeze([[54,19,97.5,53]]);
export const JR_START=Object.freeze({at:[22.6,36.6],label:{ja:'ハチ公前広場（交番側）',en:'Hachiko Square (koban side)'},sources:['JR-A-hachiko']});
const PASSAGE_EAST=[[59,12.5],[124,11.5]];// north half of the passage under the tracks, eastbound (JR-GATE-03)
export const JR_ROUTES=Object.freeze([
 {key:'A',gate:'hachiko',kind:'gate',recommended:true,color:'#FF8A1F',via:[...PASSAGE_EAST,[139,12.5],[139,16.5],[108,16.5]],sources:['JR-A-hachiko','JR-GATE-03']},
 {key:'B',gate:'south',kind:'gate',color:'#5AB8FF',via:[[-5,65],[3,109],[16,127]],sources:['JR-B-south']},
 {key:'C',gate:'shinminami',kind:'gate',color:'#FFD23F',via:[[-5,65],[3,109],[16,127],[24,157],[23,183]],sources:['JR-C-newsouth-west']},
 {key:'D',gate:null,kind:'walk-alt',color:'#4FE3C1',via:[...PASSAGE_EAST,[145,4],[157,-18]],edge:[161,-368],station:[169,-1223],
  label:{ja:'原宿駅まで歩く（JR山手線）',en:'Walk to Harajuku (JR Yamanote)'},sources:['ALT-HARA-H'],
  offsimLabel:{ja:'原宿駅：ハチ公前広場（交番側）から約1.6km・徒歩約20分（OSMから概算）',en:'Harajuku: ~1.6 km / ~20 min walk from Hachiko Square (approx., computed from OpenStreetMap)',sources:['ALT-HARA-H']}},
]);
// Concourse model layout facts (14 automatic gates; stairs + escalator to the Yamanote platform).
export const CONCOURSE_FACTS=Object.freeze(['JR-GATE-02','JR-GATE-04']);
export const JR_FACTS=Object.freeze([...new Set([...JR_GATES.flatMap(G=>G.sources),...JR_ROUTES.flatMap(R=>R.sources),...JR_START.sources,...CONCOURSE_FACTS])]);
export const JR_APPROX=Object.freeze({ja:'位置・構造は概略（駅構内図ではありません）',en:'Positions and layout are approximate (not a station plan).'});

// ─── helpers ─────────────────────────────────────────────────────────────────
const segDist=(x,z,a,b)=>{const dx=b[0]-a[0],dz=b[1]-a[1],l=dx*dx+dz*dz||1,t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/l));return Math.hypot(a[0]+dx*t-x,a[1]+dz*t-z);};
const NB=[[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,Math.SQRT2],[1,-1,Math.SQRT2],[-1,1,Math.SQRT2],[-1,-1,Math.SQRT2]];
function dijkstra(w,h,sources,pass,cost=null){const N=w*h,d=new Float32Array(N).fill(Infinity),buckets=[];const push=(r,v)=>{const b=Math.floor(v*4);(buckets[b]||(buckets[b]=[])).push(r);};
 for(const r of sources){d[r]=0;push(r,0);}
 for(let b=0;b<buckets.length;b++){const list=buckets[b];if(!list)continue;for(let q=0;q<list.length;q++){const r=list[q],v=d[r];if(Math.floor(v*4)!==b)continue;const x=r%w,z=(r-x)/w;
  for(const [dx,dz,l] of NB){const nx=x+dx,nz=z+dz;if(nx<0||nz<0||nx>=w||nz>=h)continue;const j=nz*w+nx;if(!pass[j])continue;if(dx&&dz&&(!pass[z*w+nx]||!pass[nz*w+x]))continue;const nv=v+l*(cost?cost[j]:1);if(nv<d[j]){d[j]=nv;push(j,nv);}}}buckets[b]=null;}
 return d;}
export function mulberry(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const BRIDGE=32000;
const bearing=(a,b)=>((Math.atan2(b[0]-a[0],-(b[1]-a[1]))*180/Math.PI)+360)%360;
const q=(list,f)=>list.length?list[Math.min(list.length-1,Math.floor(f*(list.length-1)+.5))]:null;

// ─── static geometry (per city geometry) ─────────────────────────────────────
const cache=new WeakMap();
function build(sim,E){
 const g=sim.g,RE=E.RE,W=2*RE,N=W*W,X=r=>r%W-RE+.5,Z=r=>Math.floor(r/W)-RE+.5;
 const ek=(x,z)=>{const a=Math.floor(x+RE),b=Math.floor(z+RE);return a<0||b<0||a>=W||b>=W?-1:b*W+a;};
 const paint=(pts,rad,fn)=>{for(let k=1;k<pts.length;k++){const a=pts[k-1],b=pts[k],x0=Math.floor(Math.min(a[0],b[0])-rad-1),x1=Math.ceil(Math.max(a[0],b[0])+rad+1),z0=Math.floor(Math.min(a[1],b[1])-rad-1),z1=Math.ceil(Math.max(a[1],b[1])+rad+1);
  for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++)if(segDist(x+.5,z+.5,a,b)<=rad)fn(x+.5,z+.5);}};
 // pass: 1 sidewalk, 2 scramble, 3 other crosswalk / footbridge, 0 blocked.
 const pass=new Uint8Array(N);for(let r=0;r<N;r++){const k=g.key(X(r),Z(r));if(k<0||sim.solid[k])continue;pass[r]=!g.carriageway[k]?1:g.crossable[k]?2:0;}
 const xwalk=new Int16Array(g.size*g.size).fill(-1);
 const ext=(pts,e)=>{if(pts.length<2)return pts;const a=pts[0],b=pts[1],c=pts.at(-2),d=pts.at(-1),la=Math.hypot(b[0]-a[0],b[1]-a[1])||1,ld=Math.hypot(d[0]-c[0],d[1]-c[1])||1;return [[a[0]-(b[0]-a[0])/la*e,a[1]-(b[1]-a[1])/la*e],...pts,[d[0]+(d[0]-c[0])/ld*e,d[1]+(d[1]-c[1])/ld*e]];};
 const mark=id=>(x,z)=>{const k=g.key(x,z);if(k<0||sim.solid[k]||!g.carriageway[k]||g.crossable[k])return;xwalk[k]=id;const r=ek(x,z);if(r>=0)pass[r]=3;};
 const roads=sim.osm?.roads||[],crossings=roads.filter(w=>w.tags?.footway==='crossing');
 const bridges=roads.filter(w=>['footway','pedestrian','steps','path'].includes(w.kind)&&w.tags?.footway!=='crossing'&&(w.tags?.bridge==='yes'||Number(w.tags?.layer)>=1)&&w.tags?.indoor!=='yes');
 bridges.forEach(w=>paint(ext(w.points,3),Math.min(3,Math.max(1.5,(Number(w.tags?.width)||3)/2)),mark(BRIDGE)));
 crossings.forEach((w,id)=>paint(ext(w.points,4),1.6,mark(id)));
 const signalled=Uint8Array.from(crossings,w=>/signals/.test(w.tags?.crossing||'')||w.tags?.crossing_ref==='pelican'?1:0);
 // At-grade rail tracks (and embankments) are not walkable for route walkers: 3 m either side
 // (elevated sections, OSM bridge=yes or layer ≥ 1, can be walked under; the station box x 40–200, z −20–300 is
 // skipped: the platforms are on 2F above the 1F concourse/passages although OSM tags those tracks layer 0).
 const railCells=new Set();
 for(const w of sim.osm?.railways||[]){const layer=Number(w.tags?.layer||0);if(layer!==0||w.tags?.tunnel==='yes'||w.tags?.bridge==='yes')continue;paint(w.points,w.tags?.embankment==='yes'?5:3,(x,z)=>{if(x>40&&x<200&&z>-20&&z<300)return;const r=ek(x,z);if(r>=0){pass[r]=0;railCells.add(r);}const k=g.key(x,z);if(k>=0)xwalk[k]=-1;});}
 for(const [x0,z0,x1,z1] of JR_INTERIOR)for(let z=Math.floor(z0);z<Math.ceil(z1);z++)for(let x=Math.floor(x0);x<Math.ceil(x1);x++){const r=ek(x+.5,z+.5);if(r>=0)pass[r]=0;}
 // 3 m density cells aligned with the base solver's cells (offset 170 m; 380 − 170 = 210 = 70 × 3). Area = square
 // metres where people can stand in this model: not solid (props, dividers, opened decks included), sidewalk,
 // scramble or crosswalk / footbridge cells.
 const DC=HALLOWEEN.densityCell,DN=Math.ceil(W/DC),darea=new Float32Array(DN*DN);
 for(let r=0;r<N;r++){const k=g.key(X(r),Z(r));if(k<0)continue;if(!sim.solid[k]&&(!g.carriageway[k]||g.crossable[k]||xwalk[k]>=0))darea[Math.floor((Z(r)+RE)/DC)*DN+Math.floor((X(r)+RE)/DC)]++;}
 // Main walkable component.
 const comp=new Int32Array(N).fill(-1);{let id=0;const st=[];for(let r0=0;r0<N;r0++){if(!pass[r0]||comp[r0]>=0)continue;comp[r0]=id;st.push(r0);while(st.length){const r=st.pop(),x=r%W;for(const j of [x>0?r-1:-1,x<W-1?r+1:-1,r-W,r+W])if(j>=0&&j<N&&pass[j]&&comp[j]<0){comp[j]=id;st.push(j);}}id++;}}
 const sizes=new Map();for(let r=0;r<N;r++)if(comp[r]>=0)sizes.set(comp[r],(sizes.get(comp[r])||0)+1);
 // The walkable network is the component of the start point (Hachiko plaza).
 const r00=ek(...JR_START.at);let main=-1;for(let rad=0;rad<=8&&main<0;rad++)for(let dz=-rad;dz<=rad&&main<0;dz++)for(let dx=-rad;dx<=rad;dx++){const r=ek(JR_START.at[0]+dx,JR_START.at[1]+dz);if(r>=0&&pass[r]===1){main=comp[r];break;}}
 if(main<0||!r00)throw Error('crowd-jr: start not walkable');
 const mainPass=new Uint8Array(N);for(let r=0;r<N;r++)if(comp[r]===main)mainPass[r]=pass[r];
 if(E._debug)E._debug({pass,comp,main,ek,X,Z,W});
 const snap=(x,z)=>{for(let rad=0;rad<=30;rad++){let bd=Infinity,br=-1;for(let dz=-rad;dz<=rad;dz++)for(let dx=-rad;dx<=rad;dx++){if(Math.max(Math.abs(dx),Math.abs(dz))!==rad)continue;const r=ek(x+dx,z+dz);if(r<0||pass[r]!==1||comp[r]!==main)continue;const d=Math.hypot(X(r)-x,Z(r)-z);if(d<bd){bd=d;br=r;}}if(br>=0)return br;}throw Error(`crowd-jr: no walkable cell near ${x},${z}`);};
 const disc=(r0,rad)=>{const out=[],cx=X(r0),cz=Z(r0);for(let dz=-Math.ceil(rad);dz<=Math.ceil(rad);dz++)for(let dx=-Math.ceil(rad);dx<=Math.ceil(rad);dx++){if(dx*dx+dz*dz>rad*rad)continue;const r=ek(cx+dx,cz+dz);if(r>=0&&pass[r]===1&&comp[r]===main)out.push(r);}return out;};
 const trace=(d,r,mp=mainPass)=>{const out=[r];let guard=0;while(d[r]>0&&guard++<20000){const x=r%W,z=(r-x)/W;let bj=-1,bv=d[r];for(const [dx,dz] of NB){const nx=x+dx,nz=z+dz;if(nx<0||nz<0||nx>=W||nz>=W)continue;const j=nz*W+nx;if(!mp[j]||d[j]>=bv)continue;if(dx&&dz&&(!mp[z*W+nx]||!mp[nz*W+x]))continue;bv=d[j];bj=j;}if(bj<0)throw Error('crowd-jr: route trace stuck');r=bj;out.push(r);}return out;};
 // Gates: admission zone at the front, whole-grid walking distance map to it (station-bound crowd).
 const gates=JR_GATES.map(G=>{const rad=G.frontRadius??E.frontRadius,f0=snap(...G.front),front=disc(f0,rad);if(front.length<6)throw Error(`crowd-jr: gate ${G.key} front too small`);
  // Inbound network: the start's network minus the gate's `block` (one-way rule), outbound: the whole network.
  let gpass=mainPass;if(G.block){gpass=mainPass.slice();const [x0,z0,x1,z1]=G.block,fs=new Set(front);for(let z=Math.floor(z0);z<Math.ceil(z1);z++)for(let x=Math.floor(x0);x<Math.ceil(x1);x++){const r=ek(x+.5,z+.5);if(r>=0&&!fs.has(r))gpass[r]=0;}}
  const map=dijkstra(W,W,front,gpass),mapAll=G.block?dijkstra(W,W,front,mainPass):map;
  return {key:G.key,label:G.label,floor:G.floor,leadsTo:G.leadsTo,sources:G.sources,x:G.at[0],z:G.at[1],front:{x:X(f0),z:Z(f0),radius:rad,gap:Math.round(Math.hypot(X(f0)-G.at[0],Z(f0)-G.at[1]))},block:G.block,capacity:E.gateCapacity?.[G.key]??G.capacity,burst:G.burst,offset:G.offset,approx:true,
   _:{front,frontSet:new Set(front),map,mapAll,gpass}};});
 const gi=Object.fromEntries(gates.map((G,k)=>[G.key,k]));
 // Routes.
 const s0=snap(...JR_START.at),startCells=disc(s0,E.startRadius);
 // v8: E.routeDefs replaces JR_ROUTES (same schema + optional start:{at,label,sources} per route); default unchanged
 const routes=(E.routeDefs||JR_ROUTES).map(Rt=>{const G=Rt.gate?gates[gi[Rt.gate]]:null,alt=Rt.kind==='walk-alt',rpass=G?G._.gpass:mainPass;
  const S0=Rt.start?snap(...Rt.start.at):s0,SC=Rt.start?disc(S0,E.startRadius):startCells,ST=Rt.start||JR_START;
  const targetCells=G?G._.front:disc(snap(...Rt.edge),8);if(targetCells.length<6)throw Error(`crowd-jr ${Rt.key}: target zone too small`);
  const stops=[...Rt.via.map(p=>[snap(...p)]),targetCells];let cur=S0;const cells=[S0];
  for(const goal of stops){const d=goal===targetCells&&G?G._.map:dijkstra(W,W,goal,rpass);if(d[cur]===Infinity)throw Error(`crowd-jr ${Rt.key}: leg unreachable`);const leg=trace(d,cur,rpass);cells.push(...leg.slice(1));cur=leg.at(-1);}
  const lineOk=(a,b)=>{const ax=X(a),az=Z(a),bx=X(b),bz=Z(b);for(let u=0;u<=1;u+=.05){const r=ek(ax+(bx-ax)*u,az+(bz-az)*u);if(r<0||!rpass[r])return false;}return true;};
  const keep=[cells[0]];for(let k=1;k<cells.length;k++){const last=keep.at(-1),nx=cells[k+1];if(nx!==undefined&&Math.hypot(X(nx)-X(last),Z(nx)-Z(last))<=2&&lineOk(last,nx))continue;keep.push(cells[k]);}
  const path=keep.map(r=>[X(r),Z(r)]);let length=0;for(let k=1;k<cells.length;k++)length+=Math.hypot(X(cells[k])-X(cells[k-1]),Z(cells[k])-Z(cells[k-1]));
  let x0=Infinity,z0=Infinity,x1=-Infinity,z1=-Infinity;for(const r of [...cells,...targetCells,...SC]){x0=Math.min(x0,X(r));x1=Math.max(x1,X(r));z0=Math.min(z0,Z(r));z1=Math.max(z1,Z(r));}
  const M=30,bx=Math.floor(x0-M),bz=Math.floor(z0-M),bw=Math.ceil(x1+M)-bx,bh=Math.ceil(z1+M)-bz,lk=(x,z)=>{const a=Math.floor(x)-bx,b=Math.floor(z)-bz;return a<0||b<0||a>=bw||b>=bh?-1:b*bw+a;};
  const lpass=new Uint8Array(bw*bh),cost=new Float32Array(bw*bh).fill(E.offCost);
  for(let b=0;b<bh;b++)for(let a=0;a<bw;a++){const r=ek(bx+a+.5,bz+b+.5);if(r>=0)lpass[b*bw+a]=rpass[r];}
  const C=E.corridor;for(const r of cells){const cx=X(r),cz=Z(r);for(let dz=-C;dz<=C;dz++)for(let dx=-C;dx<=C;dx++){if(dx*dx+dz*dz>C*C)continue;const j=lk(cx+dx,cz+dz);if(j>=0)cost[j]=1;}}
  const map=dijkstra(bw,bh,targetCells.map(r=>lk(X(r),Z(r))),lpass,cost);
  const tr=cells.at(-1),zx=alt?X(snap(...Rt.edge)):G.front.x,zz=alt?Z(snap(...Rt.edge)):G.front.z;
  const freeFlow=length/E.freeSpeed,simLimit=Math.round(freeFlow*E.rule.limitFactor+E.rule.limitSlack);
  return {key:Rt.key,gate:Rt.gate,kind:Rt.kind,recommended:!!Rt.recommended,color:Rt.color,label:G?G.label:Rt.label,sources:[...new Set([...Rt.sources,...(G?G.sources:[])])],
   start:{x:X(S0),z:Z(S0),label:ST.label,sources:ST.sources},path,zone:{x:zx,z:zz,radius:alt?8:E.frontRadius},length,freeFlow,simLimit,
   offsim:alt?[[zx,zz],Rt.station??Rt.edge]:null,offsimLabel:Rt.offsimLabel||null,edgeBearing:alt?bearing([zx,zz],Rt.station??Rt.edge):null,
   _:{cells,targetCells,targetSet:new Set(targetCells),map,bx,bz,bw,bh,gate:G?gi[Rt.gate]:-1,tr,startCells:SC}};});
 return {RE,W,N,pass,mainPass,xwalk,signalled,railCells:railCells.size,crossings:crossings.length,bridges:bridges.length,DC,DN,darea,gates,routes,startCells,ek,X,Z};
}

// ─── outdoor simulation ──────────────────────────────────────────────────────
export class JRCrowdSimulation extends HalloweenSimulation{
 constructor(config,osm,plateau,traffic){
  const E={...JR_CROWD,...config.jr},base=config.agents??HALLOWEEN.agents,per=E.walkers,nr=(E.routeDefs||JR_ROUTES).length;
  // Alighting schedule (assumption): per gate, a burst every headway s leaves the concourse model and
  // appears at the gate front at the concourse model's exit time. Fixed before the run.
  const horizon=E.warmup+E.tmax,schedule=JR_GATES.map(G=>outboundExits(G,E,horizon));
  const nOut=schedule.reduce((s,l)=>s+l.length,0);
  super({...config,mode:'halloween',hour:config.hour??HALLOWEEN.hour,agents:base+per*nr+nOut},osm,plateau,traffic);
  this.mode='jr';this.E=E;this.baseN=base;this.walkN=per*nr;this.outN=nOut;
  this.decks=this.openDecks();
  for(const [x0,z0,x1,z1] of [...JR_DIVIDERS,...JR_INTERIOR])for(let z=Math.floor(z0);z<Math.ceil(z1);z++)for(let x=Math.floor(x0);x<Math.ceil(x1);x++){const k=this.g.key(x+.5,z+.5);if(k>=0)this.solid[k]=1;}
  // Initial placement only (before t = 0, not a teleport): anyone standing in a now-solid cell starts elsewhere.
  {const was=this.constructed;this.constructed=false;let moved=0;for(let i=0;i<base;i++){if(!this.blocked(this.x[i],this.z[i]))continue;
    if(this.motion[i]===1){this.active--;this.admitted--;}const k0=this.g.key(this.x[i],this.z[i]);if(k0>=0&&this.occ[k0])this.occ[k0]--;
    let k=-1;for(let t=0;t<50;t++){this.placeBackground(i);k=this.g.key(this.x[i],this.z[i]);if(k>=0&&this.occ[k]<HALLOWEEN.occupancy)break;}if(k>=0)this.occ[k]++;
    this.px[i]=this.x[i];this.pz[i]=this.z[i];this.vx[i]=this.vz[i]=0;moved++;}
   this.constructed=was;this.startMoved=moved;}
  const key=JSON.stringify([E.RE,E.frontRadius,E.startRadius,E.corridor,E.offCost,...(E.routeDefs||E.gateCapacity?[E.routeDefs||null,E.gateCapacity||null]:[])]);let byG=cache.get(this.g);if(!byG){byG=new Map();cache.set(this.g,byG);}
  let s=byG.get(key);if(!s){s=build(this,E);byG.set(key,s);}this.e=s;
  const n=this.n;
  this.jRoute=new Int8Array(n).fill(-1);this.jGate=new Int8Array(n).fill(-1);this.jRank=new Int16Array(n);this.jSpawnAt=new Float32Array(n).fill(Infinity);
  this.jBorn=new Float32Array(n).fill(NaN);this.jReach=new Float32Array(n).fill(NaN);this.jDone=new Float32Array(n).fill(NaN);this.jDense=new Float32Array(n);this.jCrush=new Float32Array(n);this.jMax=new Float32Array(n);
  this.routeList=[];let i=base;
  s.routes.forEach((R,r)=>{const ids=[];for(let j=0;j<per;j++,i++){ids.push(i);this.jRoute[i]=r;this.jGate[i]=R._.gate;this.jRank[i]=j;this.jSpawnAt[i]=E.warmup+j*E.spawnGap;}this.routeList.push({r,ids,player:ids[0]});});
  this.outStart=i;this.outList=schedule.map(()=>[]);
  schedule.forEach((list,k)=>{for(const t of list){this.jGate[i]=k;this.jSpawnAt[i]=t;this.outList[k].push(i);i++;}});
  let crossers=0;for(let j=base;j<n;j++){if(this.motion[j]===1)crossers++;const k=this.g.key(this.x[j],this.z[j]);if(k>=0&&this.occ[k])this.occ[k]--;
   this.motion[j]=PENDING;this.x[j]=this.px[j]=HIDDEN;this.z[j]=this.pz[j]=HIDDEN;this.vx[j]=this.vz[j]=0;}
  this.active-=crossers;this.admitted-=crossers;
  this.jrng=mulberry((this.seed^0x1a2b)>>>0);this.ecount=new Uint16Array(s.DN*s.DN);this.edens=new Float64Array(s.DN*s.DN);this.eSampledAt=-1;
  this.tokens=new Float64Array(s.gates.length);this.admitLog=s.gates.map(()=>[]);this.boundDebt=0;this.boundPool=null;this.boundPoolTime=-1;this.recruitedBound=0;this.boundDeferred=0;this.boundGaveUp=0;
  this.alighted=0;this.alightRetries=0;this.spawnRetries=0;this.offCorridor=0;this._esc=false;
  this.eStart=E.warmup;this.keyframes=[];this.nextKey=E.warmup;this.peak={value:0,x:0,z:0,t:0};this.peakSeries=[];
  const gw=E.grid;this.gridSpec={x0:gw.x0,z0:gw.z0,cell:s.DC,w:Math.round((gw.x1-gw.x0)/s.DC),h:Math.round((gw.z1-gw.z0)/s.DC)};
  {const G=this.gridSpec,a0=(G.x0+s.RE)/s.DC,b0=(G.z0+s.RE)/s.DC;if(a0%1||b0%1)throw Error('crowd-jr: grid window not aligned with the 3 m cells');G._a0=a0;G._b0=b0;G.area=new Uint8Array(G.w*G.h);for(let b=0;b<G.h;b++)for(let a=0;a<G.w;a++)G.area[b*G.w+a]=Math.min(255,s.darea[(b0+b)*s.DN+a0+a]);}
  this.sampleJR();
 }
 // 2D simplification: pedestrian decks (OSM bridge footways, layer ≥ 1, outdoors, ≤ 320 m from the scramble)
 // are walkable where a building footprint lies under them (e.g. しぶにしデッキ to the West Exit side);
 // where they pass over a road they are footbridges (escape.mjs rule). Returns the number of opened cells.
 openDecks(){const g=this.g;let opened=0;
  for(const w of this.osm?.roads||[]){const t=w.tags||{};if(!['footway','pedestrian','steps'].includes(w.kind)||t.bridge!=='yes'||Number(t.layer||0)<1||t.indoor==='yes'||t.footway==='crossing')continue;
   const P=w.points;if(!P.some(p=>Math.hypot(...p)<320))continue;const rad=Math.min(3,Math.max(1.2,(Number(t.width)||3)/2));
   for(let k=1;k<P.length;k++){const a=P[k-1],b=P[k],x0=Math.floor(Math.min(a[0],b[0])-rad-1),x1=Math.ceil(Math.max(a[0],b[0])+rad+1),z0=Math.floor(Math.min(a[1],b[1])-rad-1),z1=Math.ceil(Math.max(a[1],b[1])+rad+1);
    for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++){if(segDist(x+.5,z+.5,a,b)>rad)continue;const kk=g.key(x+.5,z+.5);if(kk>=0&&this.solid[kk]){this.solid[kk]=0;opened++;}}}}
  return opened;}
 get jrTime(){return Math.max(0,this.time-this.eStart);}
 crosswalkGreen(id){if(id===BRIDGE||!this.e.signalled[id])return true;const c=this.E.crosswalk,p=((this.time+id*37)%c.cycle+c.cycle)%c.cycle;return p<c.walk-c.cutoff;}
 crossBlocked(x,z){const k=this.g.key(x,z);if(k<0||this.solid[k]===1)return true;if(this.carriageway[k]!==1)return false;return this.g.crossable[k]!==1&&!(this._esc&&this.e.xwalk[k]>=0);}
 // Signal holds count people on the scramble only (hidden agents and other crosswalks excluded).
 conflictCount(){let c=0;for(let i=0;i<this.n;i++){const m=this.motion[i];if(m===PENDING||m===DONE||m===INSIDE)continue;const k=this.g.key(this.x[i],this.z[i]);if(k<0||this.carriageway[k]!==1)continue;if(m<EXTRA_MOTION||this.g.crossable[k]===1)c++;}return c;}
 efield(map,x,z){const r=this.e.ek(x,z);return r<0?Infinity:map[r];}
 rfield(R,x,z){const q=R._,a=Math.floor(x)-q.bx,b=Math.floor(z)-q.bz;return a<0||b<0||a>=q.bw||b>=q.bh?Infinity:q.map[b*q.bw+a];}
 // Steepest descent on a route map (sign −1: ascent). local=true: route box map, else the whole grid.
 descendOn(map,w,h,a,b,sign=1){if(a<1||b<1||a>=w-1||b>=h-1)return null;const r=b*w+a,v=map[r];if(v===Infinity)return null;
  const at=j=>map[j]<Infinity?map[j]:v+sign*1.5;let gx=(at(r+1)-at(r-1))/2,gz=(at(r+w)-at(r-w))/2;const len=Math.hypot(gx,gz);if(len>.2)return [-sign*gx/len,-sign*gz/len];
  let bv=v,bd=null;for(const [dx,dz,l] of NB){const u=map[r+dz*w+dx];if(u<Infinity&&(sign>0?u<bv:u>bv)){bv=u;bd=[dx/l,dz/l];}}return bd;}
 dirRoute(R,x,z){const q=R._;return this.descendOn(q.map,q.bw,q.bh,Math.floor(x)-q.bx,Math.floor(z)-q.bz);}
 dirGate(G,x,z,sign=1,all=false){const s=this.e;return this.descendOn(all?G._.mapAll:G._.map,s.W,s.W,Math.floor(x+s.RE),Math.floor(z+s.RE),sign);}
 // Station-bound recruits: background walkers within boundReach on foot of a gate, at boundRate.
 recruitBound(dt){const E=this.E,s=this.e;this.boundDebt+=E.boundRate*dt;
  if(!this.boundPool||this.time>=this.boundPoolTime+2-1e-9){this.boundPoolTime=this.time;this.boundPool=[];for(let i=0;i<this.baseN;i++){if(this.motion[i]!==3)continue;const r=s.ek(this.x[i],this.z[i]);if(r<0)continue;let near=Infinity;for(const G of s.gates)near=Math.min(near,G._.map[r]);if(near<=E.boundReach&&near>4)this.boundPool.push(i);}
   this.queueNow=s.gates.map((G,k)=>this.gateQueue(k));}
  while(this.boundDebt>=1&&this.boundPool.length){this.boundDebt-=1;const pick=Math.floor(this.random()*this.boundPool.length),i=this.boundPool[pick];this.boundPool[pick]=this.boundPool.at(-1);this.boundPool.pop();
   if(this.motion[i]!==3){this.boundDebt+=1;continue;}
   const r=s.ek(this.x[i],this.z[i]);let best=-1,bv=Infinity;s.gates.forEach((G,k)=>{const d=G._.map[r];if(d>E.boundReach)return;const v=d+(this.queueNow?.[k]??0)*.6;if(v<bv){bv=v;best=k;}});
   if(best<0){this.boundDeferred++;continue;}
   this.motion[i]=BOUND;this.jGate[i]=best;this.jBorn[i]=this.time;this.recruitedBound++;this.poi[i]=-1;if(this.queueNow)this.queueNow[best]++;}
  this.boundDebt=Math.min(this.boundDebt,20);}
 // Station-bound people (crowd + route walkers) within queueReach of gate k's admission zone.
 gateQueue(k){const G=this.e.gates[k],m=G._.map,lim=this.E.queueReach;let c=0;for(let i=0;i<this.n;i++){const mo=this.motion[i];if((mo!==BOUND&&mo!==WALK)||this.jGate[i]!==k)continue;if(this.efield(m,this.x[i],this.z[i])<=lim)c++;}return c;}
 admit(i,k,kind){const G=this.e.gates[k];this.tokens[k]-=1;this.admitLog[k].push([Math.round(this.time*1e3)/1e3,kind,i]);
  const key=this.g.key(this.x[i],this.z[i]);if(key>=0&&this.occ[key])this.occ[key]--;this.jDone[i]=this.time;
  this.motion[i]=kind===1?DONE:INSIDE;this.x[i]=this.px[i]=HIDDEN;this.z[i]=this.pz[i]=HIDDEN;this.vx[i]=this.vz[i]=0;}
 extraAgent(i,x,z,dt,phase,walkLeft){const m=this.motion[i],s=this.e,E=this.E;if(m===PENDING||m===DONE||m===INSIDE)return;
  let dir=null,v=Infinity,k=this.jGate[i],R=null,G=k>=0?s.gates[k]:null,speed=this.speed[i];
  if(m===OUT){// Alighting passenger: away from the gate front until `timer` m on foot, then an ordinary walker.
   // Never handed to the base crowd on a carriageway cell (the signal waits for the road to be clear).
   // A distance map has ridges, so anyone slowed for 2 s also joins the crowd (or, on the road, steps back to the curb).
   const road=this.roadBlocked(x,z);v=this.efield(G._.mapAll,x,z);this.delay[i]=this.vx[i]**2+this.vz[i]**2<.09?this.delay[i]+dt:0;
   if(!road&&(v>=this.timer[i]||v===Infinity||this.delay[i]>2)){this.attachSegment(i);this.alighted++;return;}
   dir=this.dirGate(G,x,z,road&&this.delay[i]>2?1:-1,true);
   if(!dir&&v<=.5){const ox=x-G.x,oz=z-G.z,l=Math.hypot(ox,oz)||1;dir=[ox/l,oz/l];}// flat admission zone: away from the gate
   if(!dir){if(!road){this.attachSegment(i);this.alighted++;return;}dir=[Math.sin(this.heading[i]),Math.cos(this.heading[i])];}speed*=.95;}
  else{if(m===WALK){R=s.routes[this.jRoute[i]];v=this.rfield(R,x,z);dir=this.dirRoute(R,x,z);if(!dir){this.offCorridor++;let bd=Infinity,bp=null;for(const p of R.path){const d=(p[0]-x)**2+(p[1]-z)**2;if(d<bd){bd=d;bp=p;}}const l=Math.sqrt(bd)||1;dir=[(bp[0]-x)/l,(bp[1]-z)/l];}}
   else{v=this.efield(G._.map,x,z);dir=this.dirGate(G,x,z);if(!dir){if(!this.roadBlocked(x,z)){this.attachSegment(i);this.boundGaveUp++;return;}dir=[Math.sin(this.heading[i]),Math.cos(this.heading[i])];}}// BOUND
   if(G){const r=s.ek(x,z);
    if(r>=0&&G._.frontSet.has(r)){// Admission zone: through the metering when a slot is free, else wait.
     if(this.tokens[k]>=1){this.admit(i,k,m===WALK?1:0);return;}
     this.move(i,x,z,G.front.x-x,G.front.z-z,1,0,true,false,false,false);this.heading[i]=Math.atan2(G.x-x,G.z-z);return;}
    if(v<=E.queueReach&&!this.roadBlocked(x,z)){// In the queue (never on the road): stop when the square metre ahead is packed.
     const ak=this.g.key(x+dir[0]*1.1,z+dir[1]*1.1);if(ak>=0&&this.occ[ak]>=E.queueStop){this.move(i,x,z,dir[0],dir[1],1,0,true,false,false,false);this.heading[i]=Math.atan2(dir[0],dir[1]);return;}
     speed=Math.min(speed,.9);}}}
  const onRoad=this.roadBlocked(x,z);let mayCross=onRoad,hurry=false;
  if(!onRoad){const kk=this.g.key(x+dir[0]*1.2,z+dir[1]*1.2);if(kk>=0&&this.carriageway[kk]===1){
   if(this.g.crossable[kk]===1)mayCross=phase==='walk'&&walkLeft>HALLOWEEN.cutoff;
   else if(s.xwalk[kk]>=0)mayCross=this.crosswalkGreen(s.xwalk[kk]);}}
  else{const kk=this.g.key(x,z),green=this.g.crossable[kk]===1?phase==='walk':s.xwalk[kk]>=0?this.crosswalkGreen(s.xwalk[kk]):false;if(!green){hurry=true;speed=Math.max(speed,1.55);}}
  this._esc=true;this.move(i,x,z,dir[0],dir[1],1,speed,false,true,mayCross,hurry);this._esc=false;
  if(m===WALK&&R&&!G){const r=s.ek(this.x[i],this.z[i]);if(r>=0&&R._.targetSet.has(r)){// walk-alt: reached the sim edge
   const key=this.g.key(this.x[i],this.z[i]);if(key>=0&&this.occ[key])this.occ[key]--;this.jDone[i]=this.jReach[i]=this.time;this.motion[i]=DONE;this.x[i]=this.px[i]=HIDDEN;this.z[i]=this.pz[i]=HIDDEN;this.vx[i]=this.vz[i]=0;}}}
 step(dt){const s=this.e,E=this.E,occ=this.occ,key=this.g.key;
  for(let k=0;k<s.gates.length;k++)this.tokens[k]=Math.min(E.tokenMax,this.tokens[k]+s.gates[k].capacity*dt);
  // Route walkers spawn on a free start cell (≤ 2 per m²), in order per route.
  if(this.time+1e-9>=this.eStart)for(const br of this.routeList)for(const i of br.ids){if(this.motion[i]!==PENDING)continue;if(this.jSpawnAt[i]>this.time+1e-9)break;
   let ok=false;for(let t=0;t<12&&!ok;t++){const SC=s.routes[br.r]._.startCells,r=SC[Math.floor(this.jrng()*SC.length)],x=Math.fround(s.X(r)-.3+this.jrng()*.6),z=Math.fround(s.Z(r)-.3+this.jrng()*.6),kk=key(x,z);
    if(kk<0||occ[kk]>=2||this.sidewalkBlocked(x,z))continue;occ[kk]++;this.x[i]=this.px[i]=x;this.z[i]=this.pz[i]=z;this.vx[i]=this.vz[i]=0;this.motion[i]=WALK;this.jBorn[i]=this.time;ok=true;}
   if(!ok){this.spawnRetries++;break;}}
  // Alighting passengers appear in their gate's admission zone at the scheduled time (≤ 3 per m²).
  this.outList.forEach((ids,k)=>{const G=s.gates[k];for(const i of ids){if(this.motion[i]!==PENDING)continue;if(this.jSpawnAt[i]>this.time+1e-9)break;
   let ok=false;for(let t=0;t<12&&!ok;t++){const r=G._.front[Math.floor(this.jrng()*G._.front.length)],x=Math.fround(s.X(r)-.3+this.jrng()*.6),z=Math.fround(s.Z(r)-.3+this.jrng()*.6),kk=key(x,z);
    if(kk<0||occ[kk]>=3||this.sidewalkBlocked(x,z))continue;occ[kk]++;this.x[i]=this.px[i]=x;this.z[i]=this.pz[i]=z;this.vx[i]=this.vz[i]=0;this.motion[i]=OUT;this.jBorn[i]=this.time;this.timer[i]=8+this.jrng()*14;this.delay[i]=0;this.speed[i]=1.1+this.jrng()*.5;ok=true;}
   if(!ok){this.alightRetries++;break;}}});
  this.recruitBound(dt);
  super.step(dt);
  // Gate route walkers: reaching the admission zone is recorded (they then queue for admission).
  for(const br of this.routeList)for(const i of br.ids){if(this.motion[i]!==WALK||!Number.isNaN(this.jReach[i]))continue;const R=s.routes[br.r];if(R.kind!=='gate')continue;const r=s.ek(this.x[i],this.z[i]);if(r>=0&&R._.targetSet.has(r))this.jReach[i]=this.time;}
  if(this.stepCount%10===0)this.sampleJR();
  if(this.time+1e-6>=this.nextKey){this.keyframes.push(this.capture());this.nextKey+=E.keyframe;}
 }
 // 3 m density cells over the route grid (standable area, see build()), once per sim second.
 sampleJR(){const s=this.e,DC=s.DC,DN=s.DN,RE=s.RE,cnt=this.ecount,den=this.edens;cnt.fill(0);
  for(let i=0;i<this.n;i++){if(this.x[i]===HIDDEN)continue;const a=Math.floor((this.x[i]+RE)/DC),b=Math.floor((this.z[i]+RE)/DC);if(a<0||b<0||a>=DN||b>=DN)continue;const k=b*DN+a;if(cnt[k]<65535)cnt[k]++;}
  for(let k=0;k<cnt.length;k++)den[k]=s.darea[k]>=4?cnt[k]/s.darea[k]:0;
  const dtS=this.eSampledAt<0?0:this.time-this.eSampledAt;this.eSampledAt=this.time;
  for(const br of this.routeList)for(const i of br.ids){if(this.motion[i]!==WALK)continue;const v=this.densityAt(this.x[i],this.z[i]);if(v>this.jMax[i])this.jMax[i]=v;if(v>=this.E.dense)this.jDense[i]+=dtS;if(v>=this.E.crush)this.jCrush[i]+=dtS;}
  // Peak over the JR area (Hachiko plaza, Scramble, JR gate approaches): the grid window minus the walk-alt strip north of z = -60.
  const G=this.gridSpec;let pv=0,pk=-1;for(let b=0;b<G.h;b++){const z=G.z0+(b+.5)*DC;if(z<-60)continue;for(let a=0;a<G.w;a++){const k=(G._b0+b)*DN+G._a0+a,v=den[k];if(v>pv){pv=v;pk=k;}}}
  this.areaPeak=pk<0?{value:0,x:0,z:0}:{value:pv,x:(pk%DN+.5)*DC-RE,z:(Math.floor(pk/DN)+.5)*DC-RE};
  if(this.time>=this.eStart&&pv>this.peak.value)this.peak={...this.areaPeak,t:this.jrTime};}
 densityAt(x,z){const s=this.e,a=Math.floor((x+s.RE)/s.DC),b=Math.floor((z+s.RE)/s.DC);return a<0||b<0||a>=s.DN||b>=s.DN?0:this.edens[b*s.DN+a];}
 // Densest / mean 3 m cell (≥ 4 m² walkable) within reach of (x,z).
 densityNear(x,z,reach){const s=this.e;let mx=0,sum=0,c=0;for(let dz=-reach;dz<=reach;dz+=s.DC)for(let dx=-reach;dx<=reach;dx+=s.DC){if(dx*dx+dz*dz>reach*reach)continue;const a=Math.floor((x+dx+s.RE)/s.DC),b=Math.floor((z+dz+s.RE)/s.DC);if(a<0||b<0||a>=s.DN||b>=s.DN)continue;const k=b*s.DN+a;if(s.darea[k]<4)continue;const v=this.edens[k];mx=Math.max(mx,v);sum+=v;c++;}return {max:mx,mean:c?sum/c:0,cells:c};}
 countNear(x,z,r){let c=0;const r2=r*r;for(let i=0;i<this.n;i++){const dx=this.x[i]-x,dz=this.z[i]-z;if(dx*dx+dz*dz<=r2)c++;}return c;}
 judge(i){const R=this.e.routes[this.jRoute[i]],m=this.motion[i],ru=this.E.rule;if(this.jDense[i]>=ru.denseMax)return {outcome:'caught',reason:'dense'};
  const age=Number.isNaN(this.jBorn[i])?0:(m===DONE?this.jDone[i]:this.time)-this.jBorn[i];
  if(m===DONE)return age<=R.simLimit?{outcome:'escaped',reason:null}:{outcome:'caught',reason:'timeout'};
  if(m===WALK&&age>R.simLimit)return {outcome:'caught',reason:'timeout'};return {outcome:null,reason:null};}
 routeState(br){const R=this.e.routes[br.r];let pending=0,walking=0,queued=0,done=0;const times=[];
  for(const i of br.ids){const m=this.motion[i];if(m===PENDING)pending++;else if(m===WALK){walking++;if(!Number.isNaN(this.jReach[i])||(R._.gate>=0&&this.efield(this.e.gates[R._.gate]._.map,this.x[i],this.z[i])<=this.E.queueReach))queued++;}else if(m===DONE){done++;times.push(this.jDone[i]-this.jBorn[i]);}}
  times.sort((a,b)=>a-b);const J=this.judge(br.player);
  return {key:R.key,spawned:walking+done,pending,walking,queued,done,medianTime:times.length*2>br.ids.length?times[Math.floor((br.ids.length-1)/2)]:null,outcome:J.outcome,reason:J.reason};}
 counts(){let outside=0,inside=0,bound=0,pending=0,done=0,out=0;for(let i=0;i<this.n;i++){const m=this.motion[i];if(m===PENDING)pending++;else if(m===INSIDE)inside++;else if(m===DONE)done++;else{outside++;if(m===BOUND)bound++;else if(m===OUT)out++;}}
  return {modelled:this.n,outside,enteredStation:inside+this.admitLog.reduce((s,l)=>s+l.filter(e=>e[1]===1).length,0),alighted:this.alighted,alighting:out,bound,pending,walkersDone:done,inside};}
 gateStats(){const t=this.time;return this.e.gates.map((G,k)=>{const log=this.admitLog[k];let last=0;for(let j=log.length-1;j>=0&&log[j][0]>t-60;j--)last++;
  return {key:G.key,queue:this.gateQueue(k),admitted:log.length,perMin:last,frontDensity:this.densityNear(G.front.x,G.front.z,6).max,tokens:Math.round(this.tokens[k]*1e3)/1e3};});}
 player(){const br=this.routeList.find(b=>this.e.routes[b.r].recommended),p=br.player,R=this.e.routes[br.r],m=this.motion[p],J=this.judge(p);
  const x=m===WALK?this.x[p]:m===DONE?R.zone.x:R.start.x,z=m===WALK?this.z[p]:m===DONE?R.zone.z:R.start.z;
  return {route:R.key,x,z,walking:m===WALK,queued:m===WALK&&!Number.isNaN(this.jReach[p]),reachedAt:Number.isNaN(this.jReach[p])?null:this.jReach[p]-this.jBorn[p],admittedAt:m===DONE?this.jDone[p]-this.jBorn[p]:null,denseSeconds:this.jDense[p],maxDensity:this.jMax[p],outcome:J.outcome,reason:J.reason};}
 // Live per-frame stats for the overlay (numbers straight from the agents).
 jrState({camera=null,radius=this.E.cameraRadius}={}){const P=this.player(),cam=camera||{x:P.x,z:P.z},c=this.counts();
  return {label:'simulation',simTime:this.jrTime,time:this.time,counts:{...c,nearCamera:this.countNear(cam.x,cam.z,radius)},
   density:{camera:this.densityNear(cam.x,cam.z,radius),player:this.densityNear(P.x,P.z,this.E.playerReach).max,peakArea:{...this.areaPeak},peakRun:{...this.peak}},
   player:P,routes:this.routeList.map(br=>this.routeState(br)),gates:this.gateStats()};}
 // Keyframe: the stats + the 3 m count grid of the window (for density near any camera) + walker positions.
 capture(){const s=this.e,G=this.gridSpec,grid=new Uint8Array(G.w*G.h);for(let b=0;b<G.h;b++)for(let a=0;a<G.w;a++)grid[b*G.w+a]=Math.min(255,this.ecount[(G._b0+b)*s.DN+G._a0+a]);
  const ids=this.routeList.flatMap(br=>br.ids),wr=new Int8Array(ids.length),wx=new Float32Array(ids.length),wz=new Float32Array(ids.length);ids.forEach((i,k)=>{wr[k]=this.motion[i]===WALK?this.jRoute[i]:-1;wx[k]=this.x[i];wz[k]=this.z[i];});
  const st=this.jrState();return {t:Math.round(this.jrTime*1e6)/1e6,time:this.time,counts:st.counts,player:st.player,routes:st.routes,gates:st.gates,peakArea:st.density.peakArea,grid,walkers:{route:wr,x:wx,z:wz}};}
 runJR({onKeyframe=null,dt=this.dt}={}){const end=this.eStart+this.E.tmax;let seen=0;
  while(this.time<end-1e-9){this.step(dt);if(onKeyframe)while(seen<this.keyframes.length)onKeyframe(this.keyframes[seen++]);if(this.time>this.eStart&&this.routeList.every(br=>br.ids.every(i=>this.motion[i]===DONE)))break;}
  if(this.keyframes.at(-1)?.t!==Math.round(this.jrTime*1e6)/1e6)this.keyframes.push(this.capture());
  return this.jrSummary();}
 get jrRoutes(){return this.e.routes.map(({_,...R})=>({...R,path:R.path.map(p=>p.slice()),start:{...R.start},zone:{...R.zone}}));}
 get jrGates(){return this.e.gates.map(({_,burst,offset,...G})=>({...G,front:{...G.front},block:G.block?G.block.slice():null}));}
 get grid(){const {_a0,_b0,...G}=this.gridSpec;return {...G,area:G.area.slice()};}
 jrSummary(){const E=this.E,frames=this.keyframes;
  const peaks=frames.map(f=>f.peakArea.value).sort((a,b)=>a-b);
  return {label:'simulation',assumptions:JR_ASSUMPTIONS,time:this.jrTime,warmup:E.warmup,baseAgents:this.baseN,walkersPerRoute:E.walkers,alightPool:this.outN,
   rule:{...E.rule,dense:E.dense,crush:E.crush,freeSpeed:E.freeSpeed,text:`ESCAPED = admitted at the gate (or reached the sim edge) within free-flow time × ${E.rule.limitFactor} + ${E.rule.limitSlack} s and < ${E.rule.denseMax} s in ≥ ${E.dense} p/m² (assumptions)`},
   density:{peakRun:{...this.peak},peakP50:q(peaks,.5),peakP90:q(peaks,.9),note:'densest 3 m cell (≥ 4 m² walkable) around Hachiko plaza / Scramble / JR gate approaches, per keyframe; occupancy limit 4 p/m² per square metre'},
   counts:this.counts(),recruitedBound:this.recruitedBound,boundDeferred:this.boundDeferred,boundGaveUp:this.boundGaveUp,spawnRetries:this.spawnRetries,alightRetries:this.alightRetries,offCorridor:this.offCorridor,teleports:this.teleports,rescued:this.rescued,startMoved:this.startMoved,decksOpened:this.decks,
   gates:this.e.gates.map((G,k)=>{const log=this.admitLog[k],fd=frames.map(f=>f.gates[k].frontDensity).sort((a,b)=>a-b),qu=frames.map(f=>f.gates[k].queue).sort((a,b)=>a-b);return {key:G.key,capacity:G.capacity,admitted:log.length,admittedWalkers:log.filter(e=>e[1]===1).length,queueP50:q(qu,.5),queueMax:qu.at(-1)??0,frontDensityP50:q(fd,.5),frontDensityMax:fd.at(-1)??0};}),
   routes:this.routeList.map(br=>{const R=this.e.routes[br.r],st=this.routeState(br),times=[],reach=[];let walkSec=0,denseSec=0,crushSec=0,maxD=0,escaped=0;
    for(const i of br.ids){if(this.motion[i]===DONE)times.push(this.jDone[i]-this.jBorn[i]);if(!Number.isNaN(this.jReach[i]))reach.push(this.jReach[i]-this.jBorn[i]);if(this.motion[i]!==PENDING){walkSec+=(this.motion[i]===DONE?this.jDone[i]:this.time)-this.jBorn[i];denseSec+=this.jDense[i];crushSec+=this.jCrush[i];maxD=Math.max(maxD,this.jMax[i]);}if(this.judge(i).outcome==='escaped')escaped++;}
    times.sort((a,b)=>a-b);reach.sort((a,b)=>a-b);const p=br.player,J=this.judge(p);
    return {key:R.key,gate:R.gate,kind:R.kind,recommended:R.recommended,sources:R.sources,length:Math.round(R.length),freeFlow:Math.round(R.freeFlow),simLimit:R.simLimit,
     spawned:st.spawned,done:st.done,enRoute:st.walking,pending:st.pending,timeP50:q(times,.5),timeP90:q(times,.9),reachP50:q(reach,.5),maxDensity:maxD,shareDense:walkSec?denseSec/walkSec:0,shareCrush:walkSec?crushSec/walkSec:0,escapedShare:escaped/br.ids.length,
     player:{doneAt:this.motion[p]===DONE?this.jDone[p]-this.jBorn[p]:null,reachedAt:Number.isNaN(this.jReach[p])?null:this.jReach[p]-this.jBorn[p],denseSeconds:this.jDense[p],maxDensity:this.jMax[p]},outcome:J.outcome,reason:J.reason};})};}
 snapshot(){const s=super.snapshot();return {...s,mode:'jr',jr:this.jrState()};}
}

// Playback from keyframes (plain data). camera → density/count near it from the keyframe's grid.
export function jrFrameFrom(run,simTime,{camera=null,radius=JR_CROWD.cameraRadius}={}){const K=run.keyframes,dt=run.keyframe;
 const j=Math.max(0,Math.min(K.length-1,Math.floor((simTime+1e-9)/dt))),a=K[j],b=K[Math.min(K.length-1,j+1)],u=Math.max(0,Math.min(1,(simTime-a.t)/dt));
 const wx=a.walkers.x.slice(),wz=a.walkers.z.slice();for(let k=0;k<wx.length;k++)if(a.walkers.route[k]>=0&&b.walkers.route[k]>=0){wx[k]+=(b.walkers.x[k]-wx[k])*u;wz[k]+=(b.walkers.z[k]-wz[k])*u;}
 const cam=camera||{x:a.player.x,z:a.player.z};
 return {label:'simulation',requested:simTime,simTime:a.t,counts:{...a.counts,nearCamera:gridCount(run.grid,a.grid,cam.x,cam.z,radius)},
  density:{camera:gridDensity(run.grid,a.grid,cam.x,cam.z,radius),player:gridDensity(run.grid,a.grid,a.player.x,a.player.z,JR_CROWD.playerReach).max,peakArea:a.peakArea},
  player:a.player,routes:a.routes,gates:a.gates,walkers:{route:a.walkers.route,x:wx,z:wz}};}
export function gridDensity(G,grid,x,z,reach){let mx=0,sum=0,c=0;for(let dz=-reach;dz<=reach;dz+=G.cell)for(let dx=-reach;dx<=reach;dx+=G.cell){if(dx*dx+dz*dz>reach*reach)continue;const a=Math.floor((x+dx-G.x0)/G.cell),b=Math.floor((z+dz-G.z0)/G.cell);if(a<0||b<0||a>=G.w||b>=G.h)continue;const k=b*G.w+a;if(G.area[k]<4)continue;const v=grid[k]/G.area[k];mx=Math.max(mx,v);sum+=v;c++;}return {max:mx,mean:c?sum/c:0,cells:c};}
// People in the 3 m cells whose centres lie within r (cell resolution; the live API counts exact distances).
export function gridCount(G,grid,x,z,r){let c=0;for(let b=0;b<G.h;b++){const cz=G.z0+(b+.5)*G.cell;if(Math.abs(cz-z)>r+G.cell)continue;for(let a=0;a<G.w;a++){const cx=G.x0+(a+.5)*G.cell;if((cx-x)**2+(cz-z)**2<=r*r)c+=grid[b*G.w+a];}}return c;}

// ─── interior gate-queue model (concourse shot) ───────────────────────────────
// SIMULATION on an approximate layout (「位置・構造は概略」), in sim metres (x east, z south, y up).
// Default = the Hachiko gate of station-jr.mjs: 14 automatic gates in a row along x at z = gateZ facing the
// passage under the tracks, paid concourse to the south (+z), stairs and an escalator up to the north end of
// the Yamanote platform. Pass station-jr's object through concourseLayoutFrom(st) to use its exact aisles.
// Inbound people (the outdoor admissions of that gate, same times) walk from the entrance (z = entranceZ, the
// outdoor admission zone) to the shortest inbound lane queue (single file, `spacing` m), pass one at a time
// (service s per person, assumption), walk to the stairs or the escalator and climb to the platform (vanish
// at the top). Outbound people (alighting bursts every headway s, assumption) come down, queue at the exit
// lanes, pass and leave at the entrance — those exit times are when the outdoor model's alighting agents
// appear in the admission zone. Lanes are one-directional here (a modelling choice; real JR gates are reversible).
export const CONCOURSE=Object.freeze({gateZ:19.5,entranceZ:14.5,cx:85.9,nGates:14,aisle:.6,wideAisle:.9,cabinet:.24,exitLanes:[0,1,2,3],spacing:.75,
 service:{in:[1.1,1.7],out:[.9,1.3],slow:.04,slowExtra:[4,9]},// s per person (IC card), share of slow passes — assumptions
 stairs:[{key:'stairs',x:63.5,z0:36.4,z1:52,width:3.0,share:.62,climb:.45},{key:'escalator',x:66.2,z0:37.8,z1:52,width:1.0,share:.38,climb:.5}],// = station-jr.mjs anchors
 platformY:8.1,speed:[1.0,1.45],dt:.1,sample:.2});
// Aisle centres of a gate row built like station-jr.mjs (cabinet, aisle, cabinet, …; the last aisle is wide).
export function concourseLayout(C=CONCOURSE,override={}){const rowW=(C.nGates-1)*C.aisle+C.wideAisle+(C.nGates+1)*C.cabinet;let x=C.cx-rowW/2+C.cabinet;const aisles=[];
 for(let k=0;k<C.nGates;k++){const w=k===C.nGates-1?C.wideAisle:C.aisle;aisles.push({x:x+w/2,z:C.gateZ,width:w});x+=w+C.cabinet;}
 const L={label:{ja:'改札内コンコース（概略）',en:'Concourse inside the gates (approximate)'},approx:JR_APPROX,gateZ:C.gateZ,entranceZ:C.entranceZ,paidSide:'+z',
  gates:aisles.map((a,k)=>({lane:k,x:a.x,z:a.z,width:a.width,dir:C.exitLanes.includes(k)?'out':'in'})),
  stairs:C.stairs.map(s=>({...s})),platformY:C.platformY,...override};
 return L;}
// Layout from station-jr.mjs createJRStation(): st.gateRow (aisles) and st.anchors (stairs/escalator bottom/top).
export function concourseLayoutFrom(st,C=CONCOURSE){const g=st.gateRow,A=st.anchors||{},n=g.aisles.length,exits=C.exitLanes.filter(k=>k<n);
 const stairs=[];if(A.stairsBottom&&A.stairsTop)stairs.push({key:'stairs',x:A.stairsBottom.x,z0:A.stairsBottom.z,z1:A.stairsTop.z,width:3.0,share:.62,climb:.45});
 if(A.escBottom&&A.escTop)stairs.push({key:'escalator',x:A.escBottom.x,z0:A.escBottom.z,z1:A.escTop.z,width:1.0,share:.38,climb:.5});
 return concourseLayout(C,{gateZ:g.z,gates:g.aisles.map((a,k)=>({lane:k,x:a.x,z:a.z,width:a.width,dir:exits.includes(k)?'out':'in'})),...(stairs.length===2?{stairs}:{}),platformY:A.stairsTop?.y??C.platformY});}
// arrivals: [[t, kind]] inbound arrival times (absolute sim s; kind 0 crowd, 1 route walker); bursts: [t] alighting bursts.
export class ConcourseModel{
 constructor({arrivals=[],bursts=[],burstSize=40,seed=7,C=CONCOURSE,layout=null}={}){this.C=C;this.rng=mulberry(seed>>>0);this.layout=layout||concourseLayout(C);
  const L=this.layout,rnd=this.rng,span=a=>a[0]+rnd()*(a[1]-a[0]),share=L.stairs[0].share,half=(L.gates.at(-1).x-L.gates[0].x)/2+1,cx=(L.gates.at(-1).x+L.gates[0].x)/2;
  this.inLanes=L.gates.filter(g=>g.dir==='in').map(g=>g.lane);this.outLanes=L.gates.filter(g=>g.dir==='out').map(g=>g.lane);this.people=[];
  for(const [t,kind] of arrivals)this.people.push({dir:1,t0:t,kind,x0:cx+(rnd()*2-1)*half*.6,speed:span(C.speed),stair:rnd()<share?0:1,service:rnd()<C.service.slow?span(C.service.slowExtra):span(C.service.in),lat:rnd()-.5});
  for(const tb of bursts)for(let k=0;k<burstSize;k++){const st=rnd()<share?0:1;this.people.push({dir:-1,t0:tb+k*(st?1.4:.6)+rnd()*.4,kind:2,stair:st,speed:span(C.speed),service:span(C.service.out),x0:cx+(rnd()*2-1)*half*.6,lat:rnd()-.5});}
  this.people.sort((a,b)=>a.t0-b.t0||a.dir-b.dir);this.people.forEach((p,i)=>p.id=i);}
 // Deterministic run to tEnd: per-person trajectories [x,y,z] every C.sample s, gate/stair event times, stats.
 run(tEnd){const C=this.C,L=this.layout,dt=C.dt,lanes=L.gates,P=this.people,queues=lanes.map(()=>[]),busy=new Float64Array(lanes.length).fill(-1),gz=L.gateZ,ez=L.entranceZ,Y=L.platformY;
  const active=[],traj=new Array(P.length).fill(null);let next=0,t=P.length?Math.floor(P[0].t0/C.sample)*C.sample:0,sampleAt=t;
  const pick=(p,list)=>{let best=-1,bv=Infinity;for(const k of list){const v=queues[k].length*10+Math.abs(lanes[k].x-p.x);if(v<bv){bv=v;best=k;}}return best;};
  for(;t<=tEnd+1e-9;t=Math.round((t+dt)*1e6)/1e6){
   while(next<P.length&&P[next].t0<=t+1e-9){const p=P[next++],S=L.stairs[p.stair];
    if(p.dir>0){p.x=p.x0;p.z=ez;p.y=0;p.lane=pick(p,this.inLanes);}else{p.x=S.x+p.lat*S.width*.7;p.z=S.z1;p.y=Y;p.state='down';p.lane=pick(p,this.outLanes);}
    if(p.dir>0)p.state='walk';queues[p.lane].push(p);traj[p.id]={id:p.id,dir:p.dir,kind:p.kind,t0:Math.round(sampleAt*1e6)/1e6,xyz:[]};p.active=true;active.push(p);}
   lanes.forEach((G,k)=>{const qu=queues[k];if(busy[k]>=0&&t>=busy[k]-1e-9){busy[k]=-1;const p=qu.shift();p.state='after';p.passedAt=t;}
    const h=qu[0];if(!h||busy[k]>=0||h.state!=='walk')return;const hz=gz-(h.dir>0?.9:-.9);if(Math.abs(h.z-hz)<.15&&Math.abs(h.x-G.x)<.15){h.state='pass';h.passEnd=t+h.service;busy[k]=h.passEnd;h.gateAt=t;h.passFrom=h.z;}});
   for(const p of active){if(!p.active)continue;const S=L.stairs[p.stair],G=lanes[p.lane];let tx,tz,sp=p.speed;
    if(p.state==='down'){// riding / walking down to the foot of the stairs
     p.z-=S.climb*dt;p.y=Y*Math.max(0,(p.z-S.z0)/(S.z1-S.z0));if(p.z<=S.z0){p.z=S.z0;p.y=0;p.state='walk';}continue;}
    if(p.state==='walk'){const rank=queues[p.lane].indexOf(p);tx=G.x;tz=gz-(p.dir>0?1:-1)*(.9+rank*C.spacing);if(Math.abs(p.z-tz)<2.5)sp=Math.min(sp,.7);}
    else if(p.state==='pass'){p.x=G.x;p.z=p.passFrom+(p.dir>0?1.8:-1.8)*Math.min(1,(t-p.gateAt)/p.service);continue;}
    else if(p.state==='after'){if(p.dir>0){tx=S.x+p.lat*S.width*.7;tz=S.z0;}else{tx=G.x+p.lat*1.5;tz=ez;}}
    else if(p.state==='up'){p.z+=S.climb*dt;p.y=Y*Math.min(1,(p.z-S.z0)/(S.z1-S.z0));if(p.z>=S.z1){p.active=false;p.doneAt=t;}continue;}
    const dx=tx-p.x,dz=tz-p.z,d=Math.hypot(dx,dz);if(d>1e-6){const st=Math.min(d,sp*dt);p.x+=dx/d*st;p.z+=dz/d*st;}
    if(p.state==='after'&&d<.3){if(p.dir>0){p.state='up';p.stairAt=t;}else{p.active=false;p.doneAt=t;}}}
   if(t+1e-9>=sampleAt){for(const p of active)traj[p.id].xyz.push(Math.round(p.x*100)/100,Math.round(p.y*100)/100,Math.round(p.z*100)/100);sampleAt=Math.round((sampleAt+C.sample)*1e6)/1e6;}
   for(let k=active.length-1;k>=0;k--)if(!active[k].active)active.splice(k,1);}
  const out=P.map(p=>({id:p.id,dir:p.dir,kind:p.kind,t0:p.t0,lane:p.lane??null,gateAt:p.gateAt??null,passedAt:p.passedAt??null,doneAt:p.doneAt??null}));
  const waits=out.filter(p=>p.dir>0&&p.gateAt!==null).map(p=>p.gateAt-p.t0).sort((a,b)=>a-b);
  return {label:'simulation',layout:L,sample:C.sample,tEnd,people:out,traj:traj.filter(Boolean).map(tr=>({...tr,xyz:Float32Array.from(tr.xyz)})),
   stats:{inbound:out.filter(p=>p.dir>0).length,outbound:out.filter(p=>p.dir<0).length,passedIn:out.filter(p=>p.dir>0&&p.passedAt!==null).length,passedOut:out.filter(p=>p.dir<0&&p.passedAt!==null).length,
    upstairs:out.filter(p=>p.dir>0&&p.doneAt!==null).length,waitP50:q(waits,.5),waitP90:q(waits,.9),waitMax:waits.at(-1)??null}};}
}
const burstsOf=(G,E,horizon)=>{const b=[];for(let t=G.offset;t<horizon;t+=E.headway)b.push(t);return b;};
const seedOf=G=>(G.offset*131+G.burst)>>>0;
// Exit times (entrance) of the alighting people of gate G until `horizon`, from the concourse model (outbound only).
export function outboundExits(G,E=JR_CROWD,horizon=E.warmup+E.tmax){const run=new ConcourseModel({bursts:burstsOf(G,E,horizon),burstSize:G.burst,seed:seedOf(G)}).run(horizon);
 return run.people.filter(p=>p.dir<0&&p.doneAt!==null&&p.doneAt<horizon).map(p=>Math.round(p.doneAt*10)/10).sort((a,b)=>a-b);}
// Inbound = the outdoor admissions of the gate ([t, kind] from admitLog); same seed/bursts as outboundExits, so the
// outbound people are the outdoor alighting agents (with the default layout).
export function runConcourse(gateKey,admitLog,{E=JR_CROWD,tEnd=E.warmup+E.tmax,layout=null}={}){const G=JR_GATES.find(g=>g.key===gateKey);
 return new ConcourseModel({arrivals:admitLog.map(([t,kind])=>[t,kind]),bursts:burstsOf(G,E,tEnd),burstSize:G.burst,seed:seedOf(G),layout}).run(tEnd);}
// People in the concourse at absolute sim time t (= warmup + simTime): [{id,dir,kind,x,y,z,heading,speed}] + counts.
export function concourseFrame(run,t){const list=[],s=run.sample,gz=run.layout.gateZ;let queue=0,passing=0,stairs=0;
 for(const tr of run.traj){const n=tr.xyz.length/3;if(n<1||t<tr.t0||t>tr.t0+(n-1)*s)continue;const f=(t-tr.t0)/s,a=Math.min(Math.max(0,n-2),Math.floor(f)),b=Math.min(n-1,a+1),u=Math.min(1,f-a);
  const X=tr.xyz,x=X[3*a]+(X[3*b]-X[3*a])*u,y=X[3*a+1]+(X[3*b+1]-X[3*a+1])*u,z=X[3*a+2]+(X[3*b+2]-X[3*a+2])*u,dx=X[3*b]-X[3*a],dz=X[3*b+2]-X[3*a+2],sp=Math.hypot(dx,dz)/s;
  const p=run.people[tr.id],waiting=p.gateAt===null||t<p.gateAt,during=p.gateAt!==null&&t>=p.gateAt&&(p.passedAt===null||t<p.passedAt);
  if(waiting&&y===0&&Math.abs(z-gz)<6&&sp<.5)queue++;if(during)passing++;if(y>0)stairs++;
  list.push({id:tr.id,dir:tr.dir,kind:tr.kind,x,y,z,heading:sp>.05?Math.atan2(dx,dz):(tr.dir>0?0:Math.PI),speed:sp});}
 return {label:'simulation',t,people:list,counts:{inConcourse:list.length,queueing:queue,passing,onStairs:stairs,inbound:list.filter(p=>p.dir>0).length,outbound:list.filter(p=>p.dir<0).length}};}

// One deterministic run for the video (call once at warm-up, e.g. in a worker); plain clone-safe data.
export function precomputeJR(config,osm,plateau,traffic,opts={}){const t0=Date.now(),sim=new JRCrowdSimulation(config,osm,plateau,traffic),summary=sim.runJR(opts);
 const R=sim.e.routes.find(r=>r.recommended),gate=opts.concourseGate||R.gate,k=sim.e.gates.findIndex(G=>G.key===gate);
 const conc=runConcourse(gate,sim.admitLog[k],{E:sim.E,tEnd:sim.time+30});
 return {routes:sim.jrRoutes,gates:sim.jrGates,summary,keyframes:sim.keyframes,keyframe:sim.E.keyframe,warmup:sim.E.warmup,grid:sim.grid,assumptions:JR_ASSUMPTIONS,approx:JR_APPROX,
  concourse:{gate,layout:conc.layout,run:conc},admitLog:sim.admitLog.map(l=>l.map(e=>e.slice(0,2))),ms:Date.now()-t0};}
