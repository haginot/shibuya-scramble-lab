// "Escape Shibuya on Halloween!" — five practical start points, each with 2–3 escape
// routes (branches) to a station gate, a taxi stand or a walk to another station.
// SIMULATION: the walkers are ordinary agents of the Halloween crowd solver
// (halloween.mjs: same social force, 1 m² occupancy limit, scramble signal, police
// pens, props and density cells). Every number this module reports is a count of
// agents or agents per m² of walkable area in that simulation; label it
// シミュレーション / "simulation" on screen. Places, gates, stands and walking times
// come only from the fact ids listed per item (research-practical.md, verified list
// in ESCAPE_FACTS). Positions on the map are approximate (see `approx` notes).
//
// ─── DATA CONTRACT ────────────────────────────────────────────────────────────
// Coordinates: sim metres, x = east, z = south (x=(lon-139.70055)*90400,
// z=-(lat-35.65948)*111000; the scramble is the origin).
//
// new EscapeSimulation(config, osm, plateau, traffic)
//   config = shibuya_config.json + {agents?: base crowd (default 48000), hour?: 21,
//            escape?: {walkers, spawnGap, warmup, tmax, keyframe}}   (defaults in ESCAPE)
//   The base crowd is the Halloween crowd (HalloweenSimulation). Escape walkers are
//   extra agents appended at indices ≥ sim.baseN (roles/motion codes ≥ 16).
//
// sim.escapeLevels  → static, one entry per level, order centergai, miyashita, hikarie, stream, dogenzaka:
//   {key, n, color, start:{x,z,label:{en,ja},sources:[]},
//    branches:[{key:'A'|'B'|'C', recommended:bool (the level's example route = copy's `example`; NOT a sourced
//               ranking — say "example route", never "best"), basis:{en,ja}, kind:'gate'|'taxi'|'walk-alt',
//               target:{x,z,label:{en,ja},sources:[ids]}  (objective icon: the place, or the sim-edge arrow of a walk-alt),
//               zone:{x,z,radius}  (in-grid arrival zone; agents finish here), sources:[ids] (all ids of the branch),
//               path:[[x,z],...]  (walkable chain the agents follow, ≤ 2 m vertex spacing, ends in the arrival zone),
//               length:m, freeFlow:s (length / 1.35 m/s), simLimit:s (rule time-out),
//               offsim:[[x,z],[x,z]]|null (straight dashed continuation from the zone to the station / place outside the sim area; no agents),
//               offsimLabel:{en,ja,sources}|null, edgeBearing:deg (0 = north, clockwise)|null}],
//    speed: sim s per video s (player travel / 2.8, clamped 20–120; uses the run once available),
//    simLimit: max branch simLimit, approx:{en,ja}}
// sim.runEscape({onKeyframe?}) → steps the solver: ESCAPE.warmup s of crowd first, then all levels
//   at once (walkers spawn at their start every spawnGap s) until every walker arrived or tmax.
//   Keyframes are recorded every ESCAPE.keyframe s of escape time (t = 0 at the first spawn).
// sim.escapeState(levelKey) → live per-frame state (also in snapshot().escape for all levels):
//   {level, simTime, player:{branch,x,z,walking,arrived,arriveAt,denseSeconds,crushSeconds},
//    branches:[{key, spawned, pending, walking, arrived, corridorNow, corridorPeak, medianArrive,
//               outcome:null|'escaped'|'caught', reason:null|'dense'|'timeout'}],
//    danger:{value (p/m², densest 3 m cell within 6 m of the player / start), level:0..4},
//    heat:{x,z,w,h,cell:3,data:Uint8Array (p/m² × 50)}, walkers:{branch:Int8Array, x:Float32Array, z:Float32Array}}
// sim.escapeFrame(levelKey, simTime) / escapeFrameFrom(keyframes, levelKey, simTime, keyframeDt) → the same
//   shape from the recorded keyframes (playback for the video; simTime = s since the first spawn):
//   numbers are those of the keyframe at or before simTime (never interpolated); walker positions
//   are interpolated between keyframes for smooth motion only.
// frameLog(state) → {level, simTime, danger, dangerLevel, player:{branch,arrived,arriveAt,denseSeconds},
//   branches:[[key,walking,arrived,outcome,reason]]} for frames.jsonl.
// sim.escapeSummary() / escapeSummary(sim) → static export (JSON-safe), see summarize().
// precomputeEscape(config,osm,plateau,traffic) → {levels, summary, keyframes, keyframe} (one call at warmup,
//   in the worker; ~4.5 min for 48,000 people + 360 walkers × 750 s; plain data, clone-safe).
//
// Outcome rule (ESCAPE.rule, assumptions): a walker ESCAPED iff it reached its target zone
// within simLimit = freeFlow × limitFactor + limitSlack AND spent less than denseMax s in
// 3 m cells ≥ dense p/m²; otherwise CAUGHT IN THE CROWD (reason 'timeout' or 'dense').
// A branch's outcome is its player's (the first walker spawned on it); escapedShare is
// the share of all its walkers that met the rule.
// Crosswalks other than the scramble: OSM footway=crossing ways. Signalised ones (OSM
// crossing=traffic_signals/pedestrian_signals) get an assumed 120 s cycle with 30 s walk
// (ESCAPE.crosswalk; real timings are not public data); unsignalised ones and footbridges are
// always open (cars are not modelled there).
// Rail embankments (OSM embankment=yes) are not walkable.
import {HalloweenSimulation,HALLOWEEN,EXTRA_MOTION} from './halloween.mjs';

export const EMOTION=Object.freeze({PENDING:EXTRA_MOTION,WALK:EXTRA_MOTION+1,DONE:EXTRA_MOTION+2});
const {PENDING,WALK,DONE}=EMOTION;
export const HIDDEN=-9999;

export const ESCAPE=Object.freeze({
 RE:380,             // route grid half-size (m); 380−170 is a multiple of 3 so density cells align with the base solver
 walkers:24,         // walkers per branch (the first is the tracked "player")
 spawnGap:2,         // s between spawns on a branch (all branches of a level spawn together)
 startRadius:6,      // start zone: walkable cells within this radius of the start point
 corridor:7,         // m either side of the route where walking costs nothing extra
 offCost:6,          // cost multiplier outside the corridor (walkers pushed off it come back)
 warmup:150,         // s of Halloween crowd before the first spawn (one signal cycle: pens and queues built up)
 tmax:900,           // s of escape time at most
 keyframe:1,         // s between recorded keyframes
 freeSpeed:1.35,     // m/s used for the free-flow time (median desired speed of the solver)
 dense:3,            // p/m²: "dense" for DANGER and denseSeconds
 crush:4,            // p/m²: reported share of time at ≥ 4 p/m²
 dangerLevels:[1,2,3,4],// p/m² thresholds for DANGER 1..4 (0 below 1)
 dangerReach:6,      // m around the player for the DANGER value
 corridorReach:4,    // m around the path for corridorNow
 crosswalk:{cycle:120,walk:30,cutoff:5},// assumed signal for non-scramble crosswalks (not public data)
 rule:{denseMax:30,limitFactor:2,limitSlack:60},
 heatMargin:24,      // m around a level's routes for its heat window
});

// Fact ids verified by the fact-checker (2026-10-23). MEAS-14 was dropped and must not be cited.
export const ESCAPE_FACTS=Object.freeze(['CROWD-01','CROWD-02','MEAS-01','MEAS-02','MEAS-03','MEAS-04','MEAS-05','MEAS-06','MEAS-07','MEAS-08','MEAS-09','MEAS-10','MEAS-11','MEAS-12','MEAS-13','MEAS-15','MEAS-16','MEAS-17','MEAS-18',
 'EXIT-01','EXIT-02','EXIT-03','EXIT-04','EXIT-05','EXIT-06','EXIT-07','EXIT-08','EXIT-09','EXIT-10','EXIT-11','ALT-01','ALT-02','ALT-03','ALT-04','ALT-05','ALT-06','ALT-07','ALT-08','TAXI-01','TAXI-02','TAXI-03','TAXI-04','TAXI-05','TAXI-06','TAXI-07']);
export const DROPPED_FACTS=Object.freeze(['MEAS-14']);

// Station coordinates for the off-sim arrows (OSM Nominatim, 2026-10-23), sim metres.
const STATIONS={harajuku:[169,-1223],meijijingumae:[402,-1035],omotesando:[1084,-631],ebisu:[752,1347],daikanyama:[241,1261],shinsen:[-630,263]};
const APPROX={en:'Map positions are approximate (model map, not a station plan).',ja:'地図上の位置は概略（駅構内図ではありません）'};
const SIM_BASIS={en:'Example route (no source ranks the routes); how it fares is the simulation result.',ja:'ルート例（出典は優劣を示していません）。結果はシミュレーション'};
const ALT_BASIS={en:'Alternative (sourced place; simulation result shown).',ja:'別ルート（出典付きの場所・結果はシミュレーション）'};

// Levels in video order (clockwise around the station). `via` points force the route
// (e.g. through the scramble); `edge` is where a walk to another station leaves the sim
// area. Positions marked approx are placed from the cited descriptions, not a station plan.
export const ESCAPE_LEVELS=Object.freeze([
 {key:'centergai',n:1,color:'#FF8A1F',start:{at:[-55,-57],label:{en:'Center Gai',ja:'センター街'},sources:['CROWD-02']},
  branches:[
   {key:'A',recommended:true,kind:'gate',via:[],target:{at:[-96,-22],radius:8,label:{en:'Den-en-toshi/Hanzomon Dogenzaka gate (exits A0–A4, approx.)',ja:'田園都市線・半蔵門線 道玄坂方面改札（A0–A4出口・概略）'},sources:['EXIT-09','EXIT-01']}},
   {key:'B',kind:'gate',via:[[-27,-22],[12,8]],target:{at:[42,50],radius:8,label:{en:'JR Hachiko gate (across the Scramble)',ja:'JRハチ公改札（スクランブル交差点経由）'},sources:['EXIT-04','EXIT-03','MEAS-15','MEAS-16']}},
   {key:'C',kind:'walk-alt',via:[[-150,30]],edge:[-372,180],station:'shinsen',target:{label:{en:'Walk to Shinsen (Keio Inokashira)',ja:'神泉駅まで歩く（京王井の頭線）'},sources:['ALT-01']},
    offsimLabel:{en:'Shinsen: ~768 m / ~10 min walk from the Scramble (approx., computed from OpenStreetMap)',ja:'神泉駅：スクランブル交差点から約770m・徒歩約10分（OSM地図から概算）',sources:['ALT-01']}},
  ]},
 {key:'miyashita',n:2,color:'#B57BFF',start:{at:[104,-191],label:{en:'MIYASHITA PARK',ja:'宮下公園'},sources:['EXIT-09']},
  branches:[
   {key:'A',recommended:true,kind:'gate',via:[],target:{at:[150,-120],radius:8,label:{en:'Den-en-toshi/Hanzomon exit B1 (Miyashita Park side, approx.)',ja:'田園都市線・半蔵門線 B1出口（宮下公園方面・概略）'},sources:['EXIT-09']}},
   {key:'B',kind:'gate',via:[[150,-60]],target:{at:[92,10],radius:8,label:{en:'JR Hachiko gate via the Miyamasuzaka exit (approx.)',ja:'JRハチ公改札（宮益坂口側・概略）'},sources:['EXIT-03','EXIT-04','MEAS-15']}},
   {key:'C',kind:'walk-alt',via:[],edge:[150,-372],station:'meijijingumae',target:{label:{en:'Walk to Meiji-jingumae (Chiyoda/Fukutoshin)',ja:'明治神宮前駅まで歩く（千代田線・副都心線）'},sources:['ALT-03']},
    offsimLabel:{en:'Meiji-jingumae: ~1.14 km / ~15 min walk from Miyashita Park (approx., computed from OpenStreetMap)',ja:'明治神宮前駅：宮下公園から約1.1km・徒歩約15分（OSM地図から概算）',sources:['ALT-03']}},
  ]},
 {key:'hikarie',n:3,color:'#5AB8FF',start:{at:[222,100],label:{en:'Hikarie side (Meiji-dori)',ja:'ヒカリエ側（明治通り）'},sources:['EXIT-04']},
  branches:[
   {key:'A',recommended:true,kind:'gate',via:[],target:{at:[228,58],radius:8,label:{en:'Hikarie: Ginza Hikarie gate, Fukutoshin/Toyoko exit B5 (approx.)',ja:'ヒカリエ：銀座線ヒカリエ方面改札・副都心線/東横線B5（概略）'},sources:['EXIT-08','EXIT-02','EXIT-10','EXIT-06']}},
   {key:'B',kind:'taxi',via:[],target:{at:[196,48],radius:8,label:{en:'East Exit taxi stand on Meiji-dori (exit B6; approx.)',ja:'東口タクシーのりば（明治通り・B6出口・概略）'},sources:['TAXI-03','TAXI-04','TAXI-06']}},
   {key:'C',kind:'walk-alt',via:[],edge:[372,-50],station:'omotesando',target:{label:{en:'Walk to Omotesando (Ginza/Hanzomon/Chiyoda)',ja:'表参道駅まで歩く（銀座線・半蔵門線・千代田線）'},sources:['ALT-02']},
    offsimLabel:{en:'Omotesando: ~1.2–1.3 km / ~15–17 min walk from Hikarie (approx., computed from OpenStreetMap)',ja:'表参道駅：ヒカリエから約1.2〜1.3km・徒歩約15〜17分（OSM地図から概算）',sources:['ALT-02']}},
  ]},
 {key:'stream',n:4,color:'#FFD23F',start:{at:[226,212],label:{en:'Shibuya Stream',ja:'渋谷ストリーム'},sources:['EXIT-05']},
  branches:[
   {key:'A',recommended:true,kind:'gate',via:[],target:{at:[150,240],radius:8,label:{en:'Toward the JR New South gate (3F, between Stream and Sakura Stage; approx.)',ja:'JR新南改札方面（3階・ストリームとサクラステージの間・概略）'},sources:['EXIT-05','EXIT-04']}},
   {key:'B',kind:'taxi',via:[],edge:[212,316],offTo:[148,326],target:{label:{en:'Taxi: SAKURA Terrace stand (Sakuragaoka-cho 3-4; outside the red zone)',ja:'タクシー：SAKURAテラス前のりば（桜丘町3-4・規制範囲外）'},sources:['TAXI-01','TAXI-02','TAXI-07']},
    offsimLabel:{en:'Last stretch to the stand: outside the sim area (no agents)',ja:'のりばまでの最後の区間はシミュレーション範囲外',sources:['TAXI-01']}},
   {key:'C',kind:'walk-alt',via:[],edge:[230,372],station:'daikanyama',target:{label:{en:'Walk to Daikanyama (Tokyu Toyoko)',ja:'代官山駅まで歩く（東急東横線）'},sources:['ALT-06']},
    offsimLabel:{en:'Daikanyama: ~1.28 km / ~16 min walk from Shibuya Stream (approx., computed from OpenStreetMap)',ja:'代官山駅：渋谷ストリームから約1.3km・徒歩約16分（OSM地図から概算）',sources:['ALT-06']}},
  ]},
 {key:'dogenzaka',n:5,color:'#4FE3C1',start:{at:[-150,30],label:{en:'Dogenzaka / Mark City',ja:'道玄坂・マークシティ'},sources:['EXIT-11']},
  branches:[
   {key:'A',recommended:true,kind:'gate',via:[],target:{at:[-215,62],radius:8,label:{en:'Keio Inokashira West gate (Mark City WEST 1F; approx.)',ja:'京王井の頭線 西口（マークシティWEST 1階・概略）'},sources:['EXIT-11']}},
   {key:'B',kind:'gate',via:[],target:{at:[-98,-12],radius:8,label:{en:'Den-en-toshi/Hanzomon Dogenzaka gate (exits A0–A4, approx.)',ja:'田園都市線・半蔵門線 道玄坂方面改札（A0–A4出口・概略）'},sources:['EXIT-09','MEAS-02']}},
   {key:'C',kind:'walk-alt',via:[[-260,60]],edge:[-372,180],station:'shinsen',target:{label:{en:'Walk to Shinsen (Keio Inokashira)',ja:'神泉駅まで歩く（京王井の頭線）'},sources:['ALT-01']},
    offsimLabel:{en:'Shinsen: ~723 m / ~10 min walk from Mark City (approx., computed from OpenStreetMap)',ja:'神泉駅：マークシティから約720m・徒歩約10分（OSM地図から概算）',sources:['ALT-01']}},
  ]},
]);

// ─── geometry ────────────────────────────────────────────────────────────────
const segDist=(x,z,a,b)=>{const dx=b[0]-a[0],dz=b[1]-a[1],l=dx*dx+dz*dz||1,t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/l));return Math.hypot(a[0]+dx*t-x,a[1]+dz*t-z);};
const NB=[[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,Math.SQRT2],[1,-1,Math.SQRT2],[-1,1,Math.SQRT2],[-1,-1,Math.SQRT2]];
// Bucket Dijkstra on a w×h raster: pass[r] > 0 walkable, cost[r] (optional) multiplies step length.
function dijkstra(w,h,sources,pass,cost=null){const N=w*h,d=new Float32Array(N).fill(Infinity),buckets=[];const push=(r,v)=>{const b=Math.floor(v*4);(buckets[b]||(buckets[b]=[])).push(r);};
 for(const r of sources){d[r]=0;push(r,0);}
 for(let b=0;b<buckets.length;b++){const list=buckets[b];if(!list)continue;for(let q=0;q<list.length;q++){const r=list[q],v=d[r];if(Math.floor(v*4)!==b)continue;const x=r%w,z=(r-x)/w;
  for(const [dx,dz,l] of NB){const nx=x+dx,nz=z+dz;if(nx<0||nz<0||nx>=w||nz>=h)continue;const j=nz*w+nx;if(!pass[j])continue;if(dx&&dz&&(!pass[z*w+nx]||!pass[nz*w+x]))continue;const nv=v+l*(cost?cost[j]:1);if(nv<d[j]){d[j]=nv;push(j,nv);}}}buckets[b]=null;}
 return d;}
function mulberry(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const BRIDGE=32000;// crosswalk id of footbridges/decks (no signal)
const bearing=(a,b)=>((Math.atan2(b[0]-a[0],-(b[1]-a[1]))*180/Math.PI)+360)%360;

const cache=new WeakMap();
// Static escape geometry (per city geometry): walkable raster on the extended route grid,
// crosswalks, 3 m density cells, and every level's resolved routes.
function build(sim){
 const g=sim.g,E=ESCAPE,RE=E.RE,W=2*RE,N=W*W,X=r=>r%W-RE+.5,Z=r=>Math.floor(r/W)-RE+.5;
 const ek=(x,z)=>{const a=Math.floor(x+RE),b=Math.floor(z+RE);return a<0||b<0||a>=W||b>=W?-1:b*W+a;};
 const paint=(pts,rad,fn)=>{for(let k=1;k<pts.length;k++){const a=pts[k-1],b=pts[k],x0=Math.floor(Math.min(a[0],b[0])-rad-1),x1=Math.ceil(Math.max(a[0],b[0])+rad+1),z0=Math.floor(Math.min(a[1],b[1])-rad-1),z1=Math.ceil(Math.max(a[1],b[1])+rad+1);
  for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++)if(segDist(x+.5,z+.5,a,b)<=rad)fn(x+.5,z+.5);}};
 // pass: 1 sidewalk (not solid, not carriageway), 2 scramble (signal), 3 other crosswalk (assumed signal), 0 blocked.
 const pass=new Uint8Array(N);for(let r=0;r<N;r++){const k=g.key(X(r),Z(r));if(k<0||sim.solid[k])continue;pass[r]=!g.carriageway[k]?1:g.crossable[k]?2:0;}
 // Crosswalks (OSM footway=crossing, extended 4 m at both ends because the carriageway raster is
 // drawn wider than the road) get an id with an assumed signal; footbridges/decks over a road
 // (OSM bridge=yes or layer ≥ 1) get id BRIDGE (always open, grade-separated).
 const xwalk=new Int16Array(g.size*g.size).fill(-1);// global 1 m grid → crosswalk id
 const ext=(pts,e)=>{if(pts.length<2)return pts;const a=pts[0],b=pts[1],c=pts.at(-2),d=pts.at(-1),la=Math.hypot(b[0]-a[0],b[1]-a[1])||1,ld=Math.hypot(d[0]-c[0],d[1]-c[1])||1;return [[a[0]-(b[0]-a[0])/la*e,a[1]-(b[1]-a[1])/la*e],...pts,[d[0]+(d[0]-c[0])/ld*e,d[1]+(d[1]-c[1])/ld*e]];};
 const mark=id=>(x,z)=>{const k=g.key(x,z);if(k<0||sim.solid[k]||!g.carriageway[k]||g.crossable[k])return;xwalk[k]=id;const r=ek(x,z);if(r>=0)pass[r]=3;};
 const roads=sim.osm?.roads||[],crossings=roads.filter(w=>w.tags?.footway==='crossing');
 const bridges=roads.filter(w=>['footway','pedestrian','steps','path'].includes(w.kind)&&w.tags?.footway!=='crossing'&&(w.tags?.bridge==='yes'||Number(w.tags?.layer)>=1));
 bridges.forEach(w=>paint(ext(w.points,3),1.5,mark(BRIDGE)));
 crossings.forEach((w,id)=>paint(ext(w.points,4),1.6,mark(id)));
 const signalled=Uint8Array.from(crossings,w=>/signals/.test(w.tags?.crossing||'')||w.tags?.crossing_ref==='pelican'?1:0);
 for(const w of sim.osm?.railways||[])if(w.tags?.embankment==='yes')paint(w.points,5,(x,z)=>{const r=ek(x,z);if(r>=0)pass[r]=0;const k=g.key(x,z);if(k>=0)xwalk[k]=-1;});
 // Density cells: 3 m, aligned with the base solver's cells; area = sidewalk + scramble square metres (same definition).
 const DC=HALLOWEEN.densityCell,DN=Math.ceil(W/DC),darea=new Float32Array(DN*DN);
 for(let r=0;r<N;r++){const k=g.key(X(r),Z(r));if(k<0)continue;if((!g.solid[k]&&!g.carriageway[k])||g.crossable[k])darea[Math.floor((Z(r)+RE)/DC)*DN+Math.floor((X(r)+RE)/DC)]++;}
 // Main walkable component (from the scramble's start cells) so that snapped points are reachable.
 const comp=new Int32Array(N).fill(-1);{let id=0;const st=[];for(let r0=0;r0<N;r0++){if(!pass[r0]||comp[r0]>=0)continue;comp[r0]=id;st.push(r0);while(st.length){const r=st.pop(),x=r%W;for(const j of [x>0?r-1:-1,x<W-1?r+1:-1,r-W,r+W])if(j>=0&&j<N&&pass[j]&&comp[j]<0){comp[j]=id;st.push(j);}}id++;}}
 const sizes=new Map();for(let r=0;r<N;r++)if(comp[r]>=0)sizes.set(comp[r],(sizes.get(comp[r])||0)+1);
 let main=-1,best=0;for(const [c,s] of sizes)if(s>best){best=s;main=c;}
 const snap=(x,z,need=1)=>{for(let rad=0;rad<=30;rad++){let bd=Infinity,br=-1;for(let dz=-rad;dz<=rad;dz++)for(let dx=-rad;dx<=rad;dx++){if(Math.max(Math.abs(dx),Math.abs(dz))!==rad)continue;const r=ek(x+dx,z+dz);if(r<0||pass[r]!==need||comp[r]!==main)continue;const d=Math.hypot(X(r)-x,Z(r)-z);if(d<bd){bd=d;br=r;}}if(br>=0)return br;}throw Error(`escape: no walkable cell near ${x},${z}`);};
 const disc=(r0,rad)=>{const out=[],cx=X(r0),cz=Z(r0);for(let dz=-Math.ceil(rad);dz<=Math.ceil(rad);dz++)for(let dx=-Math.ceil(rad);dx<=Math.ceil(rad);dx++){if(dx*dx+dz*dz>rad*rad)continue;const r=ek(cx+dx,cz+dz);if(r>=0&&pass[r]===1&&comp[r]===main)out.push(r);}return out;};
 // Trace the steepest descent on a distance map (no corner cutting) from r until d=0.
 const trace=(d,r)=>{const out=[r];let guard=0;while(d[r]>0&&guard++<20000){const x=r%W,z=(r-x)/W;let bj=-1,bv=d[r];for(const [dx,dz] of NB){const nx=x+dx,nz=z+dz;if(nx<0||nz<0||nx>=W||nz>=W)continue;const j=nz*W+nx;if(!pass[j]||d[j]>=bv)continue;if(dx&&dz&&(!pass[z*W+nx]||!pass[nz*W+x]))continue;bv=d[j];bj=j;}if(bj<0)throw Error('escape: route trace stuck');r=bj;out.push(r);}return out;};
 const levels=ESCAPE_LEVELS.map(L=>{
  const s0=snap(...L.start.at),startCells=disc(s0,E.startRadius);
  const branches=L.branches.map(B=>{
   const alt=B.kind==='walk-alt',edge=!!B.edge,tr0=edge?snap(...B.edge):snap(...B.target.at),radius=edge?8:B.target.radius,targetCells=disc(tr0,radius);
   if(targetCells.length<6)throw Error(`escape ${L.key}/${B.key}: target zone too small`);
   // Legs: start → via… → target zone (each leg a shortest walk on the escape grid).
   const stops=[...B.via.map(p=>[snap(...p)]),targetCells];let cur=s0;const cells=[s0];
   for(const goal of stops){const d=dijkstra(W,W,goal,pass);if(d[cur]===Infinity)throw Error(`escape ${L.key}/${B.key}: leg unreachable`);const leg=trace(d,cur);cells.push(...leg.slice(1));cur=leg.at(-1);}
   // Polyline: cell centres, dropping a cell when its neighbours are ≤ 2 m apart and the straight
   // line between them stays on walkable cells (so every vertex and chord is walkable).
   const lineOk=(a,b)=>{const ax=X(a),az=Z(a),bx=X(b),bz=Z(b);for(let u=0;u<=1;u+=.05){const r=ek(ax+(bx-ax)*u,az+(bz-az)*u);if(r<0||!pass[r])return false;}return true;};
   const keep=[cells[0]];for(let k=1;k<cells.length;k++){const last=keep.at(-1),nx=cells[k+1];if(nx!==undefined&&Math.hypot(X(nx)-X(last),Z(nx)-Z(last))<=2&&lineOk(last,nx))continue;keep.push(cells[k]);}
   const path=keep.map(r=>[X(r),Z(r)]);
   let length=0;for(let k=1;k<cells.length;k++)length+=Math.hypot(X(cells[k])-X(cells[k-1]),Z(cells[k])-Z(cells[k-1]));
   // Corridor map on the branch's bounding box: distance to the target zone, free within
   // `corridor` m of the route, ×offCost elsewhere (so anyone pushed aside comes back).
   let x0=Infinity,z0=Infinity,x1=-Infinity,z1=-Infinity;for(const r of [...cells,...targetCells,...startCells]){x0=Math.min(x0,X(r));x1=Math.max(x1,X(r));z0=Math.min(z0,Z(r));z1=Math.max(z1,Z(r));}
   const M=30,bx=Math.floor(x0-M),bz=Math.floor(z0-M),bw=Math.ceil(x1+M)-bx,bh=Math.ceil(z1+M)-bz,lk=(x,z)=>{const a=Math.floor(x)-bx,b=Math.floor(z)-bz;return a<0||b<0||a>=bw||b>=bh?-1:b*bw+a;};
   const lpass=new Uint8Array(bw*bh),cost=new Float32Array(bw*bh).fill(E.offCost);
   for(let b=0;b<bh;b++)for(let a=0;a<bw;a++){const r=ek(bx+a+.5,bz+b+.5);if(r>=0&&pass[r]&&comp[r]===main)lpass[b*bw+a]=pass[r];}
   const C=E.corridor;for(const r of cells){const cx=X(r),cz=Z(r);for(let dz=-C;dz<=C;dz++)for(let dx=-C;dx<=C;dx++){if(dx*dx+dz*dz>C*C)continue;const j=lk(cx+dx,cz+dz);if(j>=0)cost[j]=1;}}
   const map=dijkstra(bw,bh,targetCells.map(r=>lk(X(r),Z(r))),lpass,cost);
   // 3 m density cells along the route (for corridorNow).
   const ccells=new Set();for(const r of cells){const cx=X(r),cz=Z(r),R4=E.corridorReach;for(let dz=-R4;dz<=R4;dz+=1)for(let dx=-R4;dx<=R4;dx+=1){if(dx*dx+dz*dz>R4*R4)continue;const a=Math.floor((cx+dx+RE)/DC),b=Math.floor((cz+dz+RE)/DC);if(a<0||b<0||a>=DN||b>=DN)continue;const q=b*DN+a;if(darea[q]>=4)ccells.add(q);}}
   // Objective icon: the arrival zone, or (off-sim end) the place itself / the edge arrow of a walk to another station.
   const zx=X(tr0),zz=Z(tr0),st=alt?STATIONS[B.station]:B.offTo||null,tx=B.offTo?B.offTo[0]:zx,tz=B.offTo?B.offTo[1]:zz;
   const freeFlow=length/E.freeSpeed,simLimit=Math.round(freeFlow*E.rule.limitFactor+E.rule.limitSlack);
   return {key:B.key,recommended:!!B.recommended,basis:B.recommended?SIM_BASIS:ALT_BASIS,kind:B.kind,
    target:{x:tx,z:tz,label:B.target.label,sources:B.target.sources},zone:{x:zx,z:zz,radius},sources:[...new Set([...B.target.sources,...(B.offsimLabel?.sources||[])])],
    path,length,freeFlow,simLimit,offsim:st?[[zx,zz],st]:null,offsimLabel:B.offsimLabel||null,edgeBearing:st?bearing([zx,zz],st):null,
    _:{cells,targetCells,targetSet:new Set(targetCells),map,bx,bz,bw,bh,ccells:Int32Array.from(ccells)}};});
  return {key:L.key,n:L.n,color:L.color,start:{x:X(s0),z:Z(s0),label:L.start.label,sources:L.start.sources},branches,approx:APPROX,_:{startCells}};});
 return {RE,W,N,pass,xwalk,signalled,crossings:crossings.length,bridges:bridges.length,DC,DN,darea,levels,ek,X,Z};
}

// ─── simulation ──────────────────────────────────────────────────────────────
export class EscapeSimulation extends HalloweenSimulation{
 constructor(config,osm,plateau,traffic){
  const E={...ESCAPE,...config.escape},base=config.agents??HALLOWEEN.agents,per=E.walkers,nb=ESCAPE_LEVELS.reduce((s,L)=>s+L.branches.length,0);
  super({...config,mode:'halloween',hour:config.hour??HALLOWEEN.hour,agents:base+per*nb},osm,plateau,traffic);
  this.mode='escape';this.E=E;this.baseN=base;this.escN=per*nb;
  let s=cache.get(this.g);if(!s){s=build(this);cache.set(this.g,s);}this.e=s;
  // Escape walkers: the appended agents. They leave the crowd placement (hidden until spawned).
  this.eLevel=new Int8Array(this.n).fill(-1);this.eBranch=new Int8Array(this.n).fill(-1);this.eRank=new Int16Array(this.n);
  this.eSpawnAt=new Float32Array(this.n);this.eBorn=new Float32Array(this.n).fill(NaN);this.eArrive=new Float32Array(this.n).fill(NaN);
  this.eAx=new Float32Array(this.n).fill(NaN);this.eAz=new Float32Array(this.n).fill(NaN);this.eDense=new Float32Array(this.n);this.eCrush=new Float32Array(this.n);this.eSum=new Float64Array(this.n);this.eSamples=new Int32Array(this.n);this.eMax=new Float32Array(this.n);
  this.branchList=[];let i=base;
  s.levels.forEach((L,l)=>L.branches.forEach((B,b)=>{const ids=[];for(let j=0;j<per;j++,i++){ids.push(i);this.eLevel[i]=l;this.eBranch[i]=b;this.eRank[i]=j;this.eSpawnAt[i]=E.warmup+j*E.spawnGap;}this.branchList.push({l,b,ids,player:ids[0]});}));
  let crossers=0;for(let j=base;j<this.n;j++){if(this.motion[j]===1)crossers++;const k=this.g.key(this.x[j],this.z[j]);if(k>=0&&this.occ[k])this.occ[k]--;
   this.motion[j]=PENDING;this.x[j]=this.px[j]=HIDDEN;this.z[j]=this.pz[j]=HIDDEN;this.vx[j]=this.vz[j]=0;}
  this.active-=crossers;this.admitted-=crossers;// appended agents placed on the crossing by the base start are withdrawn
  this.erng=mulberry((this.seed^0x5eed)>>>0);this.ecount=new Uint16Array(s.DN*s.DN);this.edens=new Float64Array(s.DN*s.DN);this.eSampledAt=-1;
  this.eStart=E.warmup;this.keyframes=[];this.nextKey=E.warmup;this.cPeak=this.branchList.map(()=>0);this._esc=false;this.spawnRetries=0;this.offCorridor=0;
  this.sampleEscape();
 }
 get escapeT(){return Math.max(0,this.time-this.eStart);}
 // Scramble cells follow the scramble signal; other crosswalks an assumed signal (ESCAPE.crosswalk).
 crosswalkGreen(id){if(id===BRIDGE||!this.e.signalled[id])return true;const c=this.E.crosswalk,p=((this.time+id*37)%c.cycle+c.cycle)%c.cycle;return p<c.walk-c.cutoff;}
 crossBlocked(x,z){const k=this.g.key(x,z);if(k<0||this.solid[k]===1)return true;if(this.carriageway[k]!==1)return false;return this.g.crossable[k]!==1&&!(this._esc&&this.e.xwalk[k]>=0);}
 // Signal holds count only people on the scramble (not hidden walkers, not other crosswalks).
 conflictCount(){let c=0;for(let i=0;i<this.n;i++){const m=this.motion[i];if(m===PENDING||m===DONE)continue;const k=this.g.key(this.x[i],this.z[i]);if(k<0||this.carriageway[k]!==1)continue;if(m<EXTRA_MOTION||this.g.crossable[k]===1)c++;}return c;}
 branchOf(i){const L=this.e.levels[this.eLevel[i]];return L.branches[this.eBranch[i]];}
 bfield(B,x,z){const q=B._,a=Math.floor(x)-q.bx,b=Math.floor(z)-q.bz;return a<0||b<0||a>=q.bw||b>=q.bh?Infinity:q.map[b*q.bw+a];}
 descendLocal(B,x,z){const q=B._,a=Math.floor(x)-q.bx,b=Math.floor(z)-q.bz;if(a<1||b<1||a>=q.bw-1||b>=q.bh-1)return null;const r=b*q.bw+a,m=q.map,v=m[r];if(v===Infinity)return null;
  const at=j=>m[j]<Infinity?m[j]:v+1.5;let gx=(at(r+1)-at(r-1))/2,gz=(at(r+q.bw)-at(r-q.bw))/2;const len=Math.hypot(gx,gz);if(len>.2)return [-gx/len,-gz/len];
  let bv=v,bd=null;for(const [dx,dz,l] of NB){const u=m[r+dz*q.bw+dx];if(u<bv){bv=u;bd=[dx/l,dz/l];}}return bd;}
 // One escape walker per step (called from the base loop through extraAgent).
 extraAgent(i,x,z,dt,phase,walkLeft){if(this.motion[i]!==WALK)return;const B=this.branchOf(i);
  let dir=this.descendLocal(B,x,z);
  if(!dir){// Pushed off the route grid (should not happen): head for the nearest route vertex.
   this.offCorridor++;let bd=Infinity,bp=null;for(const p of B.path){const d=(p[0]-x)**2+(p[1]-z)**2;if(d<bd){bd=d;bp=p;}}const l=Math.sqrt(bd)||1;dir=[(bp[0]-x)/l,(bp[1]-z)/l];}
  const onRoad=this.roadBlocked(x,z);let mayCross=onRoad,hurry=false,speed=this.speed[i];
  if(!onRoad){const k=this.g.key(x+dir[0]*1.2,z+dir[1]*1.2);if(k>=0&&this.carriageway[k]===1){
   if(this.g.crossable[k]===1)mayCross=phase==='walk'&&walkLeft>HALLOWEEN.cutoff;// police cut-off as for the crowd
   else if(this.e.xwalk[k]>=0)mayCross=this.crosswalkGreen(this.e.xwalk[k]);}}
  else{const k=this.g.key(x,z),green=this.g.crossable[k]===1?phase==='walk':this.e.xwalk[k]>=0?this.crosswalkGreen(this.e.xwalk[k]):false;if(!green){hurry=true;speed=Math.max(speed,1.55);}}
  this._esc=true;this.move(i,x,z,dir[0],dir[1],1,speed,false,true,mayCross,hurry);this._esc=false;}
 step(dt){
  // Spawn: walkers due now appear on a free start cell (≤ 2 people per m² there), else retry next step.
  if(this.time+1e-9>=this.eStart){const occ=this.occ,key=this.g.key,s=this.e;
   for(const br of this.branchList)for(const i of br.ids){if(this.motion[i]!==PENDING)continue;if(this.eSpawnAt[i]>this.time+1e-9)break;
    const cells=s.levels[br.l]._.startCells;let ok=false;
    for(let t=0;t<12&&!ok;t++){const r=cells[Math.floor(this.erng()*cells.length)],x=Math.fround(s.X(r)-.3+this.erng()*.6),z=Math.fround(s.Z(r)-.3+this.erng()*.6),k=key(x,z);
     if(k<0||occ[k]>=2||this.sidewalkBlocked(x,z))continue;occ[k]++;this.x[i]=this.px[i]=x;this.z[i]=this.pz[i]=z;this.vx[i]=this.vz[i]=0;this.motion[i]=WALK;this.eBorn[i]=this.time;ok=true;}
    if(!ok){this.spawnRetries++;break;}}}// keep spawn order per branch
  super.step(dt);
  // Arrivals: inside the branch's target zone, on foot → leaves the map (hidden, counted).
  const s=this.e;for(let i=this.baseN;i<this.n;i++){if(this.motion[i]!==WALK)continue;const B=this.branchOf(i),r=s.ek(this.x[i],this.z[i]);
   if(r>=0&&B._.targetSet.has(r)){this.motion[i]=DONE;this.eArrive[i]=this.time;this.eAx[i]=this.x[i];this.eAz[i]=this.z[i];const k=this.g.key(this.x[i],this.z[i]);if(k>=0&&this.occ[k])this.occ[k]--;this.x[i]=this.px[i]=HIDDEN;this.z[i]=this.pz[i]=HIDDEN;this.vx[i]=this.vz[i]=0;}}
  if(this.stepCount%10===0)this.sampleEscape();
  if(this.time+1e-6>=this.nextKey){this.keyframes.push(this.capture());this.nextKey+=this.E.keyframe;}
 }
 // Density on 3 m cells over the whole route grid (same cells/definition as the base solver),
 // once per simulated second; exposure of each walking escape walker accumulates here.
 sampleEscape(){const s=this.e,DC=s.DC,DN=s.DN,RE=s.RE,cnt=this.ecount,den=this.edens;cnt.fill(0);
  for(let i=0;i<this.n;i++){const m=this.motion[i];if(m===PENDING||m===DONE)continue;const a=Math.floor((this.x[i]+RE)/DC),b=Math.floor((this.z[i]+RE)/DC);if(a<0||b<0||a>=DN||b>=DN)continue;const k=b*DN+a;if(cnt[k]<65535)cnt[k]++;}
  for(let k=0;k<cnt.length;k++)den[k]=s.darea[k]>=2?cnt[k]/Math.max(4,s.darea[k]):0;
  const dtS=this.eSampledAt<0?0:this.time-this.eSampledAt;this.eSampledAt=this.time;
  for(let i=this.baseN;i<this.n;i++){if(this.motion[i]!==WALK)continue;const v=this.densityAt(this.x[i],this.z[i]);this.eSum[i]+=v;this.eSamples[i]++;if(v>this.eMax[i])this.eMax[i]=v;if(v>=this.E.dense)this.eDense[i]+=dtS;if(v>=this.E.crush)this.eCrush[i]+=dtS;}
  this.branchList.forEach((br,j)=>{const v=this.corridorNow(br);if(v>this.cPeak[j])this.cPeak[j]=v;});}
 densityAt(x,z){const s=this.e,a=Math.floor((x+s.RE)/s.DC),b=Math.floor((z+s.RE)/s.DC);return a<0||b<0||a>=s.DN||b>=s.DN?0:this.edens[b*s.DN+a];}
 maxNear(x,z,reach){const s=this.e;let v=0;for(let dz=-reach;dz<=reach;dz+=s.DC)for(let dx=-reach;dx<=reach;dx+=s.DC){if(dx*dx+dz*dz>reach*reach)continue;v=Math.max(v,this.densityAt(x+dx,z+dz));}return v;}
 corridorNow(br){const B=this.e.levels[br.l].branches[br.b];let v=0;for(const q of B._.ccells)if(this.edens[q]>v)v=this.edens[q];return v;}
 // Rule (ESCAPE.rule) for one walker: null while undecided.
 judge(i){const B=this.branchOf(i),m=this.motion[i],R=this.E.rule;
  if(this.eDense[i]>=R.denseMax)return {outcome:'caught',reason:'dense'};
  const age=Number.isNaN(this.eBorn[i])?0:(m===DONE?this.eArrive[i]:this.time)-this.eBorn[i];
  if(m===DONE)return age<=B.simLimit?{outcome:'escaped',reason:null}:{outcome:'caught',reason:'timeout'};
  if(m===WALK&&age>B.simLimit)return {outcome:'caught',reason:'timeout'};
  return {outcome:null,reason:null};}
 branchState(br,j){let pending=0,walking=0,arrived=0;const times=[];for(const i of br.ids){const m=this.motion[i];if(m===PENDING)pending++;else if(m===WALK)walking++;else if(m===DONE){arrived++;times.push(this.eArrive[i]-this.eBorn[i]);}}
  times.sort((a,b)=>a-b);const B=this.e.levels[br.l].branches[br.b],J=this.judge(br.player);
  return {key:B.key,spawned:walking+arrived,pending,walking,arrived,corridorNow:this.corridorNow(br),corridorPeak:this.cPeak[j],medianArrive:times.length*2>br.ids.length?times[Math.floor((br.ids.length-1)/2)]:null,outcome:J.outcome,reason:J.reason};}
 dangerLevel(v){let l=0;for(const t of this.E.dangerLevels)if(v>=t)l++;return l;}
 heatWindow(l){const s=this.e,L=s.levels[l];if(!L._.heat){let x0=Infinity,z0=Infinity,x1=-Infinity,z1=-Infinity;for(const B of L.branches)for(const [x,z] of B.path){x0=Math.min(x0,x);x1=Math.max(x1,x);z0=Math.min(z0,z);z1=Math.max(z1,z);}
   const M=this.E.heatMargin,a0=Math.max(0,Math.floor((x0-M+s.RE)/s.DC)),b0=Math.max(0,Math.floor((z0-M+s.RE)/s.DC)),a1=Math.min(s.DN,Math.ceil((x1+M+s.RE)/s.DC)),b1=Math.min(s.DN,Math.ceil((z1+M+s.RE)/s.DC));L._.heat={a0,b0,w:a1-a0,h:b1-b0};}
  const H=L._.heat,data=new Uint8Array(H.w*H.h);for(let b=0;b<H.h;b++)for(let a=0;a<H.w;a++)data[b*H.w+a]=Math.min(255,Math.round(this.edens[(H.b0+b)*s.DN+H.a0+a]*50));
  return {x:H.a0*s.DC-s.RE,z:H.b0*s.DC-s.RE,w:H.w,h:H.h,cell:s.DC,data};}
 levelIndex(key){const l=this.e.levels.findIndex(L=>L.key===key);if(l<0)throw Error(`escape: unknown level ${key}`);return l;}
 // Live state of one level (numbers straight from the agents; see the contract above).
 escapeState(key,{heat=true}={}){const l=this.levelIndex(key),L=this.e.levels[l];
  const brs=this.branchList.map((br,j)=>[br,j]).filter(([br])=>br.l===l);const branches=brs.map(([br,j])=>this.branchState(br,j));
  const rec=brs.find(([br])=>L.branches[br.b].recommended)[0],p=rec.player,pm=this.motion[p],J=this.judge(p);
  const px=pm===WALK?this.x[p]:pm===DONE?L.branches[rec.b].zone.x:L.start.x,pz=pm===WALK?this.z[p]:pm===DONE?L.branches[rec.b].zone.z:L.start.z;
  const value=this.maxNear(px,pz,this.E.dangerReach);
  const ids=brs.flatMap(([br])=>br.ids),wb=new Int8Array(ids.length),wx=new Float32Array(ids.length),wz=new Float32Array(ids.length);ids.forEach((i,k)=>{wb[k]=this.motion[i]===WALK?this.eBranch[i]:-1;wx[k]=this.x[i];wz[k]=this.z[i];});
  return {level:key,simTime:this.escapeT,label:'simulation',player:{branch:L.branches[rec.b].key,x:px,z:pz,walking:pm===WALK,arrived:pm===DONE,arriveAt:pm===DONE?this.eArrive[p]-this.eBorn[p]:null,denseSeconds:this.eDense[p],crushSeconds:this.eCrush[p],outcome:J.outcome,reason:J.reason},
   branches,danger:{value,level:this.dangerLevel(value)},heat:heat?this.heatWindow(l):null,walkers:{branch:wb,x:wx,z:wz}};}
 capture(){return {t:Math.round(this.escapeT*1e6)/1e6,levels:this.e.levels.map(L=>this.escapeState(L.key))};}
 // Playback from keyframes (see escapeFrameFrom).
 escapeFrame(key,simTime){return this.keyframes.length?escapeFrameFrom(this.keyframes,key,simTime,this.E.keyframe):this.escapeState(key);}
 runEscape({onKeyframe=null,dt=this.dt}={}){const end=this.eStart+this.E.tmax;let seen=0;
  while(this.time<end-1e-9){this.step(dt);if(onKeyframe)while(seen<this.keyframes.length)onKeyframe(this.keyframes[seen++]);if(this.time>this.eStart&&this.branchList.every(br=>br.ids.every(i=>this.motion[i]===DONE)))break;}
  if(this.keyframes.at(-1)?.t!==Math.round(this.escapeT*1e6)/1e6)this.keyframes.push(this.capture());
  return this.escapeSummary();}
 get escapeLevels(){const S=this.keyframes.length?this.escapeSummary():null;
  return this.e.levels.map((L,l)=>{const branches=L.branches.map(({_,...B})=>({...B,path:B.path.map(p=>p.slice())}));const rec=branches.find(B=>B.recommended),done=S?.levels[l].branches.find(b=>b.key===rec.key)?.player.arriveAt;
   const travel=done??rec.freeFlow;return {key:L.key,n:L.n,color:L.color,start:{...L.start},branches,speed:Math.max(20,Math.min(120,travel/2.8)),simLimit:Math.max(...branches.map(B=>B.simLimit)),approx:L.approx};});}
 // Static export of the run (JSON-safe). All numbers: simulation.
 escapeSummary(){const E=this.E,s=this.e;
  const q=(list,f)=>list.length?list[Math.min(list.length-1,Math.floor(f*(list.length-1)+.5))]:null;
  return {label:'simulation',time:this.escapeT,baseAgents:this.baseN,walkersPerBranch:E.walkers,rule:{...E.rule,dense:E.dense,crush:E.crush,freeSpeed:E.freeSpeed,text:`ESCAPED = reached the target within free-flow time × ${E.rule.limitFactor} + ${E.rule.limitSlack} s and < ${E.rule.denseMax} s in ≥ ${E.dense} p/m² (assumptions)`},
   crosswalk:{...E.crosswalk,count:s.crossings,note:'non-scramble crosswalk signals are assumed (not public data)'},spawnRetries:this.spawnRetries,offCorridor:this.offCorridor,
   levels:s.levels.map((L,l)=>({key:L.key,start:[L.start.x,L.start.z],get simBest(){const ok=this.branches.filter(b=>b.outcome==='escaped');return ok.length?ok.reduce((a,b)=>b.player.arriveAt<a.player.arriveAt?b:a).key:null;},branches:L.branches.map((B,b)=>{const j=this.branchList.findIndex(br=>br.l===l&&br.b===b),br=this.branchList[j],st=this.branchState(br,j);
    const times=[],dens=[];let walkSec=0,denseSec=0,crushSec=0,maxD=0,sum=0,ns=0,escaped=0;
    for(const i of br.ids){if(this.motion[i]===DONE)times.push(this.eArrive[i]-this.eBorn[i]);if(this.motion[i]!==PENDING){walkSec+=((this.motion[i]===DONE?this.eArrive[i]:this.time)-this.eBorn[i]);denseSec+=this.eDense[i];crushSec+=this.eCrush[i];maxD=Math.max(maxD,this.eMax[i]);sum+=this.eSum[i];ns+=this.eSamples[i];}if(this.judge(i).outcome==='escaped')escaped++;}
    times.sort((a,b)=>a-b);const p=br.player,J=this.judge(p);
    return {key:B.key,recommended:B.recommended,kind:B.kind,sources:B.sources,length:Math.round(B.length),freeFlow:Math.round(B.freeFlow),simLimit:B.simLimit,
     spawned:st.spawned,arrived:st.arrived,enRoute:st.walking,pending:st.pending,travelP50:q(times,.5),travelP90:q(times,.9),maxDensity:maxD,meanDensity:ns?sum/ns:0,
     shareDense:walkSec?denseSec/walkSec:0,shareCrush:walkSec?crushSec/walkSec:0,corridorPeak:this.cPeak[j],escapedShare:escaped/br.ids.length,
     player:{arriveAt:this.motion[p]===DONE?this.eArrive[p]-this.eBorn[p]:null,denseSeconds:this.eDense[p],crushSeconds:this.eCrush[p],maxDensity:this.eMax[p]},outcome:J.outcome,reason:J.reason};})}))};}
 snapshot(){const s=super.snapshot();return {...s,mode:'escape',escape:{simTime:this.escapeT,levels:this.e.levels.map(L=>this.escapeState(L.key,{heat:false}))}};}
}
export const escapeSummary=sim=>sim.escapeSummary();
// Playback from recorded keyframes (plain data, e.g. after postMessage): the numbers are those of the
// keyframe at or before simTime (never interpolated); walker positions are interpolated for motion only.
export function escapeFrameFrom(keyframes,key,simTime,dt=ESCAPE.keyframe){const K=keyframes,l=K[0].levels.findIndex(L=>L.level===key);if(l<0)throw Error(`escape: unknown level ${key}`);
 const j=Math.max(0,Math.min(K.length-1,Math.floor((simTime+1e-9)/dt))),a=K[j].levels[l],b=K[Math.min(K.length-1,j+1)].levels[l],u=Math.max(0,Math.min(1,(simTime-K[j].t)/dt));
 const wx=a.walkers.x.slice(),wz=a.walkers.z.slice();for(let k=0;k<wx.length;k++)if(a.walkers.branch[k]>=0&&b.walkers.branch[k]>=0){wx[k]+=(b.walkers.x[k]-wx[k])*u;wz[k]+=(b.walkers.z[k]-wz[k])*u;}
 return {...a,requested:simTime,walkers:{branch:a.walkers.branch,x:wx,z:wz}};}
// Compact frame-log record for the recorder/compose (§4 of the motion spec).
export const frameLog=state=>({level:state.level,simTime:state.simTime,danger:state.danger.value,dangerLevel:state.danger.level,
 player:{branch:state.player.branch,arrived:state.player.arrived,arriveAt:state.player.arriveAt,denseSeconds:state.player.denseSeconds},
 branches:state.branches.map(b=>[b.key,b.walking,b.arrived,b.outcome,b.reason])});
// One deterministic run for the video (call once at warmup); returns plain data for playback.
// Returns plain, structured-clone-safe data: post it from the worker and play back with escapeFrameFrom().
export function precomputeEscape(config,osm,plateau,traffic,opts={}){const sim=new EscapeSimulation(config,osm,plateau,traffic);const summary=sim.runEscape(opts);
 return {levels:sim.escapeLevels,summary,keyframes:sim.keyframes,keyframe:sim.E.keyframe};}
