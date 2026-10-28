// JR v8 「シミュレーションで最適ルート」 — route sets, scenarios and the scoring rule of the v8 sim segment
// (logs/ssl-claude-halloween/v8/STEERING-sim-core.md). Pure module (node + page): no DOM, no three.js.
//
// The solver is the JR crowd model (crowd-jr.mjs JRCrowdSimulation on halloween.mjs: social force, ≤ 4 people per m²,
// scramble signal, gate metering). v8 runs it with its own route set (V8_ROUTES: every route of the four pairs walks in
// the same crowd at once, 24 walkers each) via config.jr.routeDefs, under two scenarios (V8_SCENARIOS):
//   plan   the prediction shown right after the first choice (the crowd after `warmup` s at the peak);
//   retry  the recomputation after GAME OVER: the same crowd model, started later (the failing moment of the GAME OVER
//          run, `warmup` + the elapsed game time), i.e. "re-run the sim with the crowd as it is now".
// tools/v8_sim.mjs runs both (deterministic, cached by a hash of the solver sources + scenario) and writes
//   web3d/shibuya/series/variants/jr/v8/sim/<scenario>.json   (summary: every number the video shows; committed)
//   $V8_SIM_CACHE/<scenario>-frames.json                        (per-second keyframes for the heat map / dots; not committed)
// Every on-screen number of the sim segment comes from those files; scoreRoutes() is the ONE rule that picks the
// highlighted route (tests: tests/test_v8.py).
//
// Off-sim legs: routes that leave the modelled area (≈ 380 m around the Scramble) end at the sim edge; the rest of the
// walk is the OSM research route (web3d/data/series_wide_osm.json routes, OSRM foot on OpenStreetMap) at 80 m/min
// (「OSMから概算」), added to the simulated leg and labelled as such on screen.

export const V8_SIM_LABEL='シミュレーション';
// assumptions shown on screen (small text) — none is a published figure
export const V8_ASSUMPTIONS=Object.freeze({
 ja:'シミュレーション（仮定）：人出48,000人・ピーク時（22時ごろ想定）／ハチ公改札前は入場規制を仮定／歩行80m/分（OSM区間）。2026年のJRの対策は未発表',
 short:'仮定：48,000人・ピーク時・入場規制は仮定',
 en:'Simulation (assumptions): 48,000 people at the peak (~22:00); entry metering assumed at the Hachiko gate front; 80 m/min on the OSM legs. JR 2026 measures unannounced.'});
// scoring rule (the same for every pair). Lower is better; a route ruled out by a sourced fact (✕) is not ranked.
export const V8_RULE=Object.freeze({
 peakFree:2,               // p/m²: no penalty up to this peak density (median walker's densest 3 m cell on the way)
 perUnit:60,               // s of penalty per p/m² above peakFree
 tmax:900,                 // s: a route whose median walker is not through within the run is ✕ (not ranked)
 risk:[[3,'高'],[2,'中'],[0,'低']],// peak density (p/m², median walker of the route) → 低/中/高
 osmSpeed:80,              // m/min on the off-sim leg (OSM research routes: minutes_80m)
 ja:'判定：スコア（予測時間＋混雑ペナルティ）が最小のルート。ペナルティ＝最大密度が2人/m²を超えた分×1分',
 short:'スコア＝予測時間＋1分×（最大密度−2人/m²）　小さいほど良い',
 en:'Pick: the lowest score = predicted time + 1 min per person/m² of peak density above 2.'});

const H=[22.6,36.6],SCR=[1.8,0];
const START={H:{at:H,label:{ja:'ハチ公前広場（交番側）',en:'Hachiko Square (koban side)'},sources:['JR-A-hachiko']},
 SCR:{at:SCR,label:{ja:'スクランブル交差点（駅側たもと）',en:'Scramble crossing (station side)'},sources:[]}};
const PASSAGE_EAST=[[59,12.5],[124,11.5]];
// route defs (crowd-jr JR_ROUTES schema + start). key = solver route key (unique across pairs).
export const V8_ROUTES=Object.freeze([
 // gate pair: Hachiko gate (one-way U-turn, JR-GATE-03) / South gate / New South gate (as crowd-jr JR_ROUTES A–C)
 {key:'GA',gate:'hachiko',kind:'gate',recommended:true,color:'#FF7A9A',start:START.H,via:[...PASSAGE_EAST,[139,12.5],[139,16.5],[108,16.5]],sources:['JR-A-hachiko','JR-GATE-03']},
 {key:'GB',gate:'south',kind:'gate',color:'#FFD23F',start:START.H,via:[[-5,65],[3,109],[16,127]],sources:['JR-B-south']},
 {key:'GC',gate:'shinminami',kind:'gate',color:'#4FE3C1',start:START.H,via:[[-5,65],[3,109],[16,127],[24,157],[23,183]],sources:['JR-C-newsouth-west']},
 // taxi pair: from the Scramble to the West-exit stand (suspended, TAXI-01) / the 渋谷SAKURAテラス前 stand (TAXI-01, TAXI-07)
 {key:'TA',gate:null,kind:'walk-alt',color:'#FF7A9A',start:START.SCR,via:[],edge:[30,152],label:{ja:'西口の乗り場',en:'West-exit stand'},sources:['TAXI-01']},
 {key:'TB',gate:null,kind:'walk-alt',color:'#4FE3C1',start:START.SCR,via:[[30,152]],edge:[112.1,311.9],label:{ja:'渋谷SAKURAテラス前',en:'Shibuya SAKURA Terrace'},sources:['TAXI-01','TAXI-07']},
 // zone pair: shortest north through the red zone (ZONE-D-H-HARA, in-sim leg) / outer detour (ALT-HARA-H, in-sim leg)
 {key:'ZA',gate:null,kind:'walk-alt',color:'#FFD23F',start:START.H,via:[[16.8,22.2],[19.7,1.4],[19.1,-22.7],[33.4,-91.7],[34.5,-124],[33,-183.6],[34.3,-285.4]],edge:[33.2,-346.1],
  label:{ja:'最短：駅前から北へ',en:'Shortest: straight north'},sources:['ZONE-D-H-HARA'],osm:'ZONE-D-H-HARA'},
 {key:'HA',gate:null,kind:'walk-alt',color:'#4FE3C1',start:START.H,via:[...PASSAGE_EAST,[145,4],[157,-18]],edge:[161,-368],label:{ja:'原宿へ（外側）',en:'To Harajuku (outer)'},sources:['ALT-HARA-H'],osm:'ALT-HARA-H'},
 // alt pair: Harajuku = HA (same walk) / Ebisu (ALT-EBI-H, in-sim leg to the south-east edge)
 // (no via: the OSM route's passage along the station's east side is not walkable in the 2D model → the solver's own
 //  shortest walkable leg to the same sim-edge point, ≈ 810 m instead of ≈ 610 m on OSM; the rest is the OSM remainder)
 {key:'EB',gate:null,kind:'walk-alt',color:'#4FE3C1',start:START.H,via:[],edge:[294.2,342.8],
  label:{ja:'恵比寿へ',en:'To Ebisu'},sources:['ALT-EBI-H'],osm:'ALT-EBI-H'},
]);
// solver config per scenario (merged into config.jr). warmup: s of crowd before the routes start.
export const V8_SCENARIOS=Object.freeze({
 plan:{warmup:150,tmax:900,gateCapacity:{hachiko:.45},boundRate:3.2,grid:{x0:-59,z0:-377,x1:301,z1:349}},
 retry:{warmup:390,tmax:900,gateCapacity:{hachiko:.45},boundRate:3.2,grid:{x0:-59,z0:-377,x1:301,z1:349}},
});
export function scenarioJR(name){const S=V8_SCENARIOS[name];if(!S)throw Error(`unknown v8 scenario ${name}`);return {...S,routeDefs:V8_ROUTES.map(r=>({...r}))};}

// per pair: which solver routes are compared, how they are labelled, facts that rule a route out (✕), extra off-sim
// constraints (last train), the GAME OVER route and the clock (game time of the sim start, fictional).
export const V8_PAIRS=Object.freeze({
 gate:{routes:[{key:'GA',label:'A ハチ公改札',sub:'目の前',color:'#FF7A9A'},{key:'GB',label:'B 南改札',sub:'1F',color:'#FFD23F'},{key:'GC',label:'B 新南改札',sub:'3F',color:'#4FE3C1'}],
  over:'GA',end:'改札を通るまで',stuck:'15分たっても改札を通れない',start:'H'},
 taxi:{routes:[{key:'TA',label:'A 西口の乗り場',sub:'駅のすぐ前',color:'#FF7A9A',ruledOut:{ja:'乗り場は休止中（2025年3月30日から）',factIds:['TAXI-01']}},
  {key:'TB',label:'B SAKURAテラス前',sub:'桜丘町',color:'#4FE3C1'}],over:'TA',end:'乗り場に着くまで',start:'SCR'},
 zone:{routes:[{key:'ZA',label:'A 最短（北へ直進）',sub:'赤枠内を通る',color:'#FFD23F',ruledOut:{ja:'赤枠内を長く歩く（規制の可能性）',factIds:['MEAS-01']}},{key:'HA',label:'B 外側のルート例',sub:'明治通り東側',color:'#4FE3C1'}],
  over:'ZA',end:'原宿駅まで',start:'H'},
 alt:{routes:[{key:'HA',label:'A 原宿駅（北へ）',sub:'内回り終電 0:45',color:'#4FE3C1',lastTrain:'00:45',factIds:['JR-LAST-08']},
  {key:'EB',label:'B 恵比寿駅（南へ）',sub:'内回り終電 0:50',color:'#FF9A3D',lastTrain:'00:50',factIds:['JR-LAST-14']}],
  over:'EB',end:'駅に着くまで',start:'H',clock:'00:23'},
});

// ---------------------------------------------------------------- numbers
const q=(a,f)=>a.length?a[Math.min(a.length-1,Math.floor(f*(a.length-1)+.5))]:null;
export const median=a=>{const s=[...a].sort((x,y)=>x-y);return q(s,.5);};
export const riskOf=(rho,R=V8_RULE)=>R.risk.find(([v])=>rho>=v)[1];
export const fmtMS=s=>{if(s==null||!isFinite(s))return '—';const t=Math.round(s);return `${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`;};
export const fmtRho=v=>(Math.round(v*10)/10).toFixed(1);
// polyline helpers (sim metres)
const plen=P=>{let L=0;for(let i=1;i<P.length;i++)L+=Math.hypot(P[i][0]-P[i-1][0],P[i][1]-P[i-1][1]);return L;};
// OSM remainder from the sim edge point to the end of the research route (m)
export function osmRemainder(points,edge){let bi=0,bd=Infinity;points.forEach((p,i)=>{const d=Math.hypot(p[0]-edge[0],p[1]-edge[1]);if(d<bd){bd=d;bi=i;}});
 return {metres:Math.round(plen(points.slice(bi))),fromIndex:bi,gap:Math.round(bd),total:Math.round(plen(points))};}

// summary of one route from the solver's per-walker records: walkers = [{born, done|null, dense (s ≥ 3 p/m²), max (p/m²)}]
// time = median walker time to the end (gate admitted / sim edge); penalty = median dense seconds; peak = median of the
// walkers' max density (what a typical walker of the route meets). Medians, so one stuck walker does not decide it.
export function routeNumbers(walkers){const done=walkers.filter(w=>w.done!=null);
 return {walkers:walkers.length,done:done.length,time:median(done.map(w=>w.done-w.born)),dense:median(walkers.map(w=>w.dense)),peak:median(walkers.map(w=>w.max)),
  peakMax:Math.max(0,...walkers.map(w=>w.max))};}

// the rule: score = time (+ off-sim OSM leg) + dense seconds × (densePenalty − 1); ✕ = ruled out by a sourced fact or a
// missed last train; pick = argmin over the routes not ruled out. rows keep the pair's order; rank is by score.
export function scoreRoutes(pair,numbers,{rule=V8_RULE,clockStart=null}={}){const P=V8_PAIRS[pair];
 const rows=P.routes.map(r=>{const n=numbers[r.key];const off=n.offsim?n.offsim.seconds:0;const total=n.time==null?null:n.time+off;
  const score=total==null?null:Math.round(total+rule.perUnit*Math.max(0,n.peak-rule.peakFree));let out=r.ruledOut?{...r.ruledOut}:null;let arrive=null;
  if(total==null&&!out)out={ja:P.stuck??`${Math.round(rule.tmax/60)}分たっても着かない`,factIds:[]};
  if(r.lastTrain&&clockStart&&total!=null){const [h,m]=clockStart.split(':').map(Number),[lh,lm]=r.lastTrain.split(':').map(Number);const t0=h*60+m,last=lh*60+lm,arr=t0+total/60;
   arrive=arr;if(arr>last)out={ja:`着${hmOf(arr)} 終電${r.lastTrain}に間に合わない`,factIds:r.factIds||[]};}
  return {key:r.key,label:r.label,sub:r.sub,color:r.color,time:n.time,offsim:n.offsim||null,total,peak:n.peak,dense:n.dense,risk:riskOf(n.peak,rule),score,ruledOut:out,arrive};});
 const ok=rows.filter(r=>!r.ruledOut&&r.score!=null);const best=ok.length?ok.reduce((a,b)=>b.score<a.score?b:a):null;
 const order=[...rows].sort((a,b)=>(a.ruledOut?1:0)-(b.ruledOut?1:0)||(a.score??1e9)-(b.score??1e9));order.forEach((r,i)=>{r.rank=i+1;});
 return {pair,rows,pick:best?best.key:null,rule:rule.ja};}
export const hmOf=m=>{const t=Math.round(m)%1440;return `${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`;};

// ---------------------------------------------------------------- live panel state (page + tests; pure)
// item: {c:'simpanel', pair, scenario, phase:'run'|'pick'|'why'|'recompute', run:[a,b] (beat-local s of the sim playback),
//        simT:[t0,t1] (sim s shown over run), pickAt (beat-local s: the SIM PICK highlight), from? (scenario whose ranking the
//        rows start from, recompute: rows slide from that order to the new one)}
// summary: the scenario's summary JSON (tools/v8_sim.mjs). → props for the HUD component (ui/components.mjs simpanel):
//   {simT, clock, speed, rows:[{key,label,sub,color,final,shown (s),total,offsim,peak,rho,risk,score,ruledOut,rank,rankFrom,bar}],
//    pick (key, once t ≥ pickAt), rule, assume}
const clamp01=v=>Math.max(0,Math.min(1,v));
export function simTimeAt(item,t){const [a,b]=item.run||[0,1],[t0,t1]=item.simT||[0,0];return t0+(t1-t0)*clamp01((t-a)/Math.max(1e-6,b-a));}
export function trackAt(track,simT){const R=track?.rows||[];if(!R.length)return null;let lo=0,hi=R.length-1;if(simT<=R[0][0])return R[0];if(simT>=R[hi][0])return R[hi];
 while(hi-lo>1){const m=(lo+hi)>>1;if(R[m][0]<=simT)lo=m;else hi=m;}return R[lo];}
export function panelState(summary,item,t,{from=null,clockStart=null}={}){const S=summary.scored[item.pair],simT=simTimeAt(item,t);
 const allFinal=item.phase==='pick'||item.phase==='why'||(item.finalAt!=null&&t>=item.finalAt);
 // run: rows in the pair's order (A, B, C) — the ranking is not known yet; pick: slide from that order to the rank order;
 // recompute: slide from the first run's ranking (item.from) to the new one
 const pairOrder=Object.fromEntries(S.rows.map((r,i)=>[r.key,i+1]));
 const rankFrom=from?Object.fromEntries(from.scored[item.pair].rows.map(r=>[r.key,r.rank])):pairOrder;
 const rows=S.rows.map(r=>{const tr=summary.track[r.key],fin=tr?.done??Infinity,final=allFinal||simT>=fin-1e-6,cur=trackAt(tr,Math.min(simT,fin));
  const shown=final?r.total:Math.max(0,simT-(tr?.born??0));
  return {...r,final,shown,rho:final?r.peak:(cur?cur[1]:0),bar:Math.min(1,(final?r.peak:(cur?cur[1]:0))/4),rankFrom:rankFrom[r.key],rank:item.phase==='run'?(from?rankFrom[r.key]:pairOrder[r.key]):r.rank};});
 const pickOn=item.pickAt!=null&&t>=item.pickAt&&rows.every(r=>r.final);
 return {simT,clock:clockStart?hmsOf(clockStart,simT):`SIM +${fmtMS(simT)}`,speed:item.speed||null,rows,pick:pickOn?S.pick:null,rule:item.rule??V8_RULE.short,assume:item.assume??V8_ASSUMPTIONS.short};}
export const hmsOf=(start,simT)=>{const [h,m,s=0]=start.split(':').map(Number);const tot=Math.round(h*3600+m*60+s+simT);return `${String(Math.floor(tot/3600)%24).padStart(2,'0')}:${String(Math.floor(tot/60)%60).padStart(2,'0')}:${String(tot%60).padStart(2,'0')}`;};
// simmeter (plate overlay): the tracked walker of `route` at sim time mapped from the beat → {rho, bar 0..1 (5 segments of
// 0.8 p/m²), eta (s to the end of the in-sim leg + off-sim leg), label}
export function meterState(summary,item,t){const simT=simTimeAt(item,t),tr=summary.track[item.route],cur=trackAt(tr,simT);const n=summary.numbers[item.route];
 const done=tr?.done??null,eta=done==null?null:Math.max(0,done-simT)+(n.offsim?n.offsim.seconds:0);
 return {simT,rho:cur?cur[1]:0,segs:Math.min(5,Math.ceil((cur?cur[1]:0)/.8-1e-9)),eta,route:item.route};}
