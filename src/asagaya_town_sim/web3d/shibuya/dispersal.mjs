// Station-closing dispersal (Halloween night, after the last trains). The same
// individual walkers, occupancy limit, social force, scramble signal and police
// layout as the Halloween mode; only the trip changes: people still inside the
// station leave through finite-capacity gate lines, the crowd already on the
// plaza is asked to move on, and everyone walks to one of the street gateways
// at the edge of the modelled area (~150 m out), where they leave the model.
//
// Two strategies are run from the same initial state (same seed):
//  • none    — every station gate at full capacity, each person uses the gate
//              nearest the platform they came from and their own shortest path,
//              the plaza crowd starts moving at once, crossing on any green.
//  • managed — one-way routing (each destination is assigned the station gate
//              on its side, outbound walkers keep to the outbound half of the
//              managed approach sidewalks), staged release (the plaza crowd is
//              released in rings, nearest the exits first; station gates open in
//              stages only while the density in front of them is low) and a
//              police cut-off before the end of each green.
// Nobody is created, removed or moved by the model: people emerge from a gate
// cell when it has room, and are counted as "left" only when they physically
// reach a gateway cell on foot. Every reported number is a count of agents or of
// agents per square metre of walkable area. All parameters are assumptions.
import {HalloweenSimulation,HALLOWEEN,HMOTION} from './halloween.mjs';
import {phaseAt} from './simulation.mjs';

export const DMOTION=Object.freeze({...HMOTION,INSIDE:10,DISPERSE:11,GONE:12});
const {HOLD,INSIDE,DISPERSE,GONE}=DMOTION;
export const HIDDEN=-9999;

export const DISPERSAL=Object.freeze({
 inside:9000,        // people still inside the station when it closes (assumption)
 plaza:7000,         // people on the plaza and the south-east corners at the start (assumption)
 // Station gate lines on the building faces: box [x0,z0,x1,z1], the side the building is on, people per second at full capacity.
 gates:[
  {name:'Hachiko',ja:'ハチ公口',box:[8,70,32,92],side:[0,1],capacity:9},
  {name:'Miyamasuzaka',ja:'宮益坂口',box:[32,70,62,92],side:[0,1],capacity:8},// (east half of the north face; called "Central" before)
  {name:'South',ja:'南口',box:[5,85,60,112],side:[0,-1],capacity:6},
  {name:'East',ja:'東口',box:[95,40,135,90],side:[-1,0],capacity:4},
 ],
 gateClear:1.5,      // 2 m in front of a gate cell the paving must have this clearance (no 1 m slivers)
 gatewayRing:[60,160],   // a sector's network must reach at least 60 m out to get a gateway; 160 m at most
 gatewayDepth:6,      // gateway = the last 6 m of the sector's connected sidewalk…
 gatewayClear:25,     // …at least 25 m (straight line) from every station gate
 study:{center:[24,40],radius:62,junction:46}, // study area: plaza (circle) ∪ junction (circle) walkable cells
 threshold:.5,       // study-area mean density (p/m²) regarded as cleared
 dense:2,            // "dense crowd cleared": no 3 m cell of the study area above this (p/m²)
 managed:{
  gateShare:.75,     // managed gates run at this share of capacity…
  gateDensity:1.2,   // …and only while the 6 m in front of them holds less than this (p/m²)
  stage:40,          // s between plaza release rings
  rings:5,
  cutoff:20,         // police stop new crossers with this many seconds of green left
  pull:.6,           // outbound keep-left pull on lane-split sidewalks
 },
 tmax:1800,
 // Sensitivity knobs (config.dispersal overrides these; defaults = the shipped scenario).
 // See sweep-dispersal.mjs and docs/HALLOWEEN.md for the sweep over them.
 knobs:{
  capScale:1,        // × every station gate's capacity
  destPower:.5,      // destination weight ∝ (gateway cells)^destPower (0 = uniform, 1 = ∝ width²)
  compliance:1,      // managed: share of people who follow the staging, police line and cut-off
  spillAfter:10,     // no control: s of cars held by people on the road before the crowd ignores the signal (Infinity = never)
 },
 // Exit / route zones for the "which exit?" counters: discs (x, z, radius m) over walkable
 // cells, first match wins (no cell counted twice). An illustrative mapping of the model's
 // geometry (−z ≈ north, +x ≈ east) onto Shibuya Station's exits and the routes away from them.
 exits:[
  {key:'hachiko',name:'Hachiko exit',ja:'ハチ公口',disc:[20,72,13]},
  {key:'miyamasuzaka',name:'Miyamasuzaka',ja:'宮益坂口',disc:[48,72,12]},
  {key:'shinminami',name:'Shin-minami / south',ja:'新南口・南側',disc:[24,106,18]},
  {key:'hikarie',name:'Hikarie / east',ja:'ヒカリエ・東側',disc:[106,52,32]},
  {key:'markcity',name:'Mark City / Inokashira',ja:'マークシティ・井の頭線',disc:[-52,56,26]},
  {key:'scramble',name:'Scramble side',ja:'スクランブル側',disc:[0,0,32]},
 ],
 exitClear:2,        // an exit zone counts as clear once no 3 m cell in it exceeds this (p/m²) for good
});

// Bucket Dijkstra on the 1 m grid; `cost` (optional) multiplies the step length per cell.
function dijkstra(W,sources,pass,cost=null){const RN=W*W,d=new Float32Array(RN).fill(Infinity),buckets=[];const push=(r,v)=>{const b=Math.floor(v*4);(buckets[b]||(buckets[b]=[])).push(r);};for(const r of sources){d[r]=0;push(r,0);}
 for(let b=0;b<buckets.length;b++){const list=buckets[b];if(!list)continue;for(let q=0;q<list.length;q++){const r=list[q],v=d[r];if(Math.floor(v*4)!==b)continue;const x=r%W,z=(r-x)/W;
  for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dz)continue;const nx=x+dx,nz=z+dz;if(nx<0||nz<0||nx>=W||nz>=W)continue;const j=nz*W+nx;if(!pass[j])continue;if(dx&&dz&&(!pass[z*W+nx]||!pass[nz*W+x]))continue;const nv=v+(dx&&dz?Math.SQRT2:1)*(cost?cost[j]:1);if(nv<d[j]){d[j]=nv;push(j,nv);}}}buckets[b]=null;}return d;}

// Static scenario geometry (gates, gateways, route maps, study area), shared per city.
const cache=new WeakMap();
function build(sim){
 const g=sim.g,D=DISPERSAL,R=g.R,W=g.rsize,RN=W*W,X=r=>r%W-R+.5,Z=r=>Math.floor(r/W)-R+.5;
 const pass=new Uint8Array(RN);for(let r=0;r<RN;r++){const k=g.key(X(r),Z(r));pass[r]=k>=0&&!sim.solid[k]&&(g.side[r]||g.crossable[k])?1:0;}
 const solidAt=(x,z)=>{const k=g.key(x,z);return k<0||sim.solid[k]===1;};
 // Route cost: walkers avoid slivers of paving (clearance < 1 m: ×6, < 2 m: ×2).
 const clear=sim.h.clear,cost=new Float32Array(RN);for(let r=0;r<RN;r++)cost[r]=!g.side[r]?1:clear[r]<1?6:clear[r]<2?2:1;
 const gates=D.gates.map(({box:[x0,z0,x1,z1],side:[sx,sz],...rest})=>{const cells=[];for(let r=0;r<RN;r++){if(!g.side[r]||!pass[r])continue;const x=X(r),z=Z(r);if(x<x0||x>x1||z<z0||z>z1)continue;const f=g.rkey(x-sx*2,z-sz*2);if(solidAt(x+sx*1.2,z+sz*1.2)&&f>=0&&clear[f]>=D.gateClear)cells.push(r);}
  let cx=0,cz=0;for(const r of cells){cx+=X(r);cz+=Z(r);}return {...rest,cells,x:cx/Math.max(1,cells.length),z:cz/Math.max(1,cells.length)};}).filter(q=>q.cells.length>=4);
 // Gateways: in each 45° sector, the outer end of the walkable network connected to the
 // gates (the model's sidewalks are cut where an unmodelled side road crosses them).
 const seen=new Uint8Array(RN),stack=[];for(const q of gates)for(const r of q.cells)if(!seen[r]){seen[r]=1;stack.push(r);}
 while(stack.length){const r=stack.pop(),x=r%W;for(const j of [x>0?r-1:-1,x<W-1?r+1:-1,r-W,r+W])if(j>=0&&j<RN&&pass[j]&&!seen[j]){seen[j]=1;stack.push(j);}}
 const sectors=new Map(),far=new Float32Array(8);for(let r=0;r<RN;r++){if(!seen[r]||!g.side[r])continue;const x=X(r),z=Z(r),d=Math.hypot(x,z);if(d>D.gatewayRing[1])continue;const b=((Math.round(Math.atan2(x,-z)/(Math.PI/4))%8)+8)%8;far[b]=Math.max(far[b],d);if(!sectors.has(b))sectors.set(b,[]);sectors.get(b).push([r,d]);}
 const NAMES=['N','NE','E','SE','S','SW','W','NW'];
 const gateways=[];for(const [b,list] of [...sectors].sort((a,b)=>a[0]-b[0])){if(far[b]<D.gatewayRing[0])continue;const cells=list.filter(([r,d])=>d>=far[b]-D.gatewayDepth&&gates.every(q=>Math.hypot(X(r)-q.x,Z(r)-q.z)>=D.gatewayClear)).map(([r])=>r);if(cells.length<12)continue;const map=dijkstra(W,cells,pass,cost);
  // Walking distance from each gate (Infinity: that gate's side cannot reach this gateway on foot).
  let cx=0,cz=0;for(const r of cells){cx+=X(r);cz+=Z(r);}gateways.push({name:NAMES[b],cells:cells.length,x:cx/cells.length,z:cz/cells.length,map});}
 // Gate cells must connect to some gateway (a gate box can clip a separate sidewalk fragment).
 for(const q of gates){q.cells=q.cells.filter(r=>gateways.some(w=>w.map[r]<Infinity));let cx=0,cz=0;for(const r of q.cells){cx+=X(r);cz+=Z(r);}q.x=cx/Math.max(1,q.cells.length);q.z=cz/Math.max(1,q.cells.length);}
 for(const w of gateways)w.fromGate=gates.map(q=>q.cells.length?Math.min(...q.cells.map(r=>w.map[r])):Infinity);
 // Gate assignment under one-way routing: the gates within 25 m of the shortest walk to the
 // gateway, shared in proportion to their capacity.
 const assigned=gateways.map(q=>{const best=Math.min(...q.fromGate);return gates.map((gt,k)=>q.fromGate[k]<=best+25?gt.capacity:0);});
 // Study area: walkable cells (sidewalk + scramble) in the plaza and junction circles.
 const S=D.study,inStudy=(x,z)=>Math.hypot(x-S.center[0],z-S.center[1])<=S.radius||Math.hypot(x,z)<=S.junction;
 const study=new Uint8Array(RN);let studyArea=0;for(let r=0;r<RN;r++){if(!pass[r])continue;if(inStudy(X(r),Z(r))){study[r]=1;studyArea++;}}
 // Plaza start cells: sidewalk inside the plaza circle, south of the junction road.
 const plazaCells=[];for(let r=0;r<RN;r++){if(!g.side[r]||!study[r])continue;const x=X(r),z=Z(r);if(Math.hypot(x-S.center[0],z-S.center[1])<=S.radius-4&&z>12&&x>-6&&!solidAt(x,z))plazaCells.push(r);}
 // Ring of 1 m cells in front of each gate (≤ 6 m) where the gate's density is measured.
 const front=gates.map(gt=>{const set=new Set();for(const r of gt.cells){const x=X(r),z=Z(r);for(let dz=-6;dz<=6;dz++)for(let dx=-6;dx<=6;dx++){if(dx*dx+dz*dz>36)continue;const j=g.rkey(x+dx,z+dz);if(j>=0&&g.side[j])set.add(j);}}return [...set];});
 // Exit zones: 1-based zone index per 1 m cell, walkable area per zone.
 const zone=new Uint8Array(RN),zoneArea=new Array(D.exits.length).fill(0);
 for(let r=0;r<RN;r++){if(!pass[r])continue;const x=X(r),z=Z(r),k=D.exits.findIndex(({disc:[cx,cz,cr]})=>Math.hypot(x-cx,z-cz)<=cr);if(k>=0){zone[r]=k+1;zoneArea[k]++;}}
 return {gates,gateways,assigned,study,studyArea,plazaCells,front,pass,zone,zoneArea};
}

export class DispersalSimulation extends HalloweenSimulation{
 constructor(config,osm,plateau,traffic){
  const D=DISPERSAL,inside=config.inside??D.inside,plaza=config.plaza??D.plaza,knobs={...D.knobs,...config.dispersal};
  super({...config,agents:inside+plaza,quota:0},osm,plateau,traffic);
  this.mode='dispersal';this.strategy=config.strategy==='managed'?'managed':'none';this.managed=this.strategy==='managed';
  let s=this.d;if(!s){s=build(this);cache.set(this.g,s);}
  this.insideN=inside;this.plazaN=plaza;this.knobs=knobs;
  // Destination mix: weight ∝ (gateway cells)^destPower, a soft proxy for street width — assumption.
  {const w=s.gateways.map(q=>knobs.destPower===.5?Math.sqrt(q.cells):Math.pow(q.cells,knobs.destPower)),t=w.reduce((a,b)=>a+b,0);let acc=0;this.cumulative=w.map(v=>(acc+=v/t));}
  // Non-compliant people (managed only): a hash of the index, so the random streams are untouched.
  this.defy=new Uint8Array(this.n);if(this.managed&&knobs.compliance<1)for(let i=0;i<this.n;i++)this.defy[i]=((Math.imul(i+1,2654435761)^Math.imul(this.seed+1,40503))>>>0)/4294967296>=knobs.compliance?1:0;this.quota=0;
  const n=this.n,W=this.g.rsize,R=this.g.R;
  this.gw=new Uint8Array(n);this.gate=new Uint8Array(n);this.stage=new Uint8Array(n);
  this.holdRun=0;this.holdMax=0;this.holdTotal=0;this.spillTime=0;this.held2=0;this.left=0;this.emerged=0;this.lost=0;this.rerouted=0;this.ddx=new Float32Array(n);this.ddz=new Float32Array(n);this.leg.fill(0);this.timer.fill(0);this.turnbacks=0;this.lostFlag=new Uint8Array(n);this.gateDebt=new Float64Array(s.gates.length);this.gateOpen=new Uint8Array(s.gates.length);this.gateQueue=s.gates.map(()=>[]);
  this.series=[];this.summary=null;this.crushSeconds=0;this.denseUntil=null;this.stationEmptyAt=null;this.peakCell=0;this.peakStudy=0;this.peakP95=0;this.lastBelow=null;this.exitClear=DISPERSAL.exits.map(()=>null);this.exitPeak=DISPERSAL.exits.map(()=>0);
  this.still[HOLD]=1;
  // Destinations and gates. Unmanaged: the gate depends on where the person was on the
  // platforms (proportional to gate capacity). Managed: the gate on their destination's side.
  for(let i=0;i<n;i++){const u=this.rand(i);let k=0;while(k<this.cumulative.length-1&&u>this.cumulative[k])k++;this.gw[i]=k;
   // (only gates from which the destination is reachable on foot)
   const best=Math.min(...s.gateways[k].fromGate),ok=this.managed&&!this.defy[i]?s.assigned[k]:s.gates.map((q,j)=>s.gateways[k].fromGate[j]<=best+60?q.capacity:0),sum=ok.reduce((a,b)=>a+b,0);let v=this.rand(i)*sum,q=0;while(q<ok.length-1&&(v>=ok[q]||!ok[q])){v-=ok[q];q++;}this.gate[i]=q;}
  // Start: the first `plaza` agents stand on the plaza (≤ 2 per m²), the rest are inside.
  const occ=this.occ;occ.fill(0);const cells=s.plazaCells,key=this.g.key;let placed=0;
  for(let i=0;i<n;i++){this.vx[i]=this.vz[i]=0;this.poi[i]=-1;this.flag[i]=0;this.entered[i]=0;
   if(i<plaza){let x=0,z=0,ok=false;for(let t=0;t<400&&!ok;t++){const r=cells[Math.floor(this.rand(i)*cells.length)];x=Math.fround(r%W-R+.1+this.rand(i)*.8);z=Math.fround(Math.floor(r/W)-R+.1+this.rand(i)*.8);const k=key(x,z);ok=k>=0&&!this.sidewalkBlocked(x,z)&&occ[k]<2;if(ok)occ[k]++;}
    if(!ok)throw Error('plaza too small for the start crowd');placed++;this.x[i]=this.px[i]=x;this.z[i]=this.pz[i]=z;this.motion[i]=this.managed&&!this.defy[i]?HOLD:DISPERSE;this.heading[i]=Math.atan2(-x,-z);}
   else{this.motion[i]=INSIDE;this.x[i]=this.px[i]=HIDDEN;this.z[i]=this.pz[i]=HIDDEN;this.gateQueue[this.gate[i]].push(i);}}
  // Staged release rings: plaza agents ranked by walking distance to their gateway (front first).
  if(this.managed){const order=[];for(let i=0;i<plaza;i++)order.push([this.field(s.gateways[this.gw[i]].map,this.x[i],this.z[i]),i]);order.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
   const D2=DISPERSAL.managed;order.forEach(([,i],j)=>{this.stage[i]=Math.min(D2.rings-1,Math.floor(j*D2.rings/order.length));});}
  this.time=0;this.clock=0;this.cycle=-1;this.beginCycle();this.measure();
 }
 get d(){return cache.get(this.g);}
 // Start of each signal cycle: the base bookkeeping only (no corner queues in this scenario).
 beginCycle(){this.cycle=Math.floor((this.clock+1e-7)/this.c.signal.cycle_s);this.admitted=0;this.completed=0;this.active=0;}
 recruit(){}
 // People on the carriageway (the signal holds vehicles until they are off it).
 conflictCount(){let count=0;for(let i=0;i<this.n;i++){const m=this.motion[i];if((m===DISPERSE||m===HOLD)&&this.roadBlocked(this.x[i],this.z[i]))count++;}return count;}
 // Gate control, once per simulated second.
 control(){const s=this.d,M=DISPERSAL.managed,occ=this.occ,key=this.g.key,W=this.g.rsize,R=this.g.R;
  s.gates.forEach((gt,k)=>{if(!this.managed){this.gateOpen[k]=1;return;}let people=0;for(const r of s.front[k]){const kk=key(r%W-R+.5,Math.floor(r/W)-R+.5);if(kk>=0)people+=occ[kk];}
   this.gateOpen[k]=people/s.front[k].length<M.gateDensity?1:0;});
  if(this.managed){const ring=Math.floor(this.time/M.stage);for(let i=0;i<this.plazaN;i++)if(this.motion[i]===HOLD&&this.stage[i]<=ring)this.motion[i]=DISPERSE;}}
 step(dt){
  this.stepCount++;this.px.set(this.x);this.pz.set(this.z);
  this.time=Math.round((this.time+dt)*1e6)/1e6;const sg=this.c.signal,p=this.clock%sg.cycle_s,s=this.d,M=DISPERSAL.managed;
  this.held2=0;
  if(!(p>=sg.walk_s+sg.clearance_s-dt-1e-4&&p<sg.walk_s+sg.clearance_s&&this.conflictCount()>0)){this.clock=Math.round((this.clock+dt)*1e6)/1e6;this.holdRun=0;}
  else{this.holdRun+=dt;this.holdTotal+=dt;this.holdMax=Math.max(this.holdMax,this.holdRun);}
  if(Math.floor((this.clock+1e-7)/sg.cycle_s)>this.cycle)this.beginCycle();
  const phase=phaseAt(this.clock,sg),walkLeft=sg.walk_s-(this.clock%sg.cycle_s);
  const n=this.n,X=this.x,Z=this.z,key=this.g.key,occ=this.occ,cs=this.ncell,ns=this.nsize,head=this.head,next=this.next,W=this.g.rsize,R=this.g.R;
  occ.fill(0);for(let i=0;i<n;i++){const k=key(X[i],Z[i]);if(k>=0&&occ[k]<255)occ[k]++;}
  if(Math.floor(this.time+1e-6)!==this.lastManage){this.lastManage=Math.floor(this.time+1e-6);this.control();}
  // Station gates: people step out onto a gate cell that has room (≤ 2 per m²).
  s.gates.forEach((gt,k)=>{const q=this.gateQueue[k];if(!this.gateOpen[k]||!q.length){this.gateDebt[k]=0;return;}
   this.gateDebt[k]+=gt.capacity*this.knobs.capScale*(this.managed?M.gateShare:1)*dt;let tries=0;
   while(this.gateDebt[k]>=1&&q.length&&tries<gt.cells.length){const r=gt.cells[Math.floor(this.random()*gt.cells.length)],x=Math.fround(r%W-R+.2+this.random()*.6),z=Math.fround(Math.floor(r/W)-R+.2+this.random()*.6),kk=key(x,z);tries++;
    if(kk<0||occ[kk]>=2||this.sidewalkBlocked(x,z))continue;const i=q.shift();occ[kk]++;this.gateDebt[k]-=1;this.emerged++;
    this.x[i]=this.px[i]=x;this.z[i]=this.pz[i]=z;this.vx[i]=this.vz[i]=0;this.motion[i]=DISPERSE;this.heading[i]=Math.atan2(gt.x-x,gt.z-z)+Math.PI;}
   this.gateDebt[k]=Math.min(this.gateDebt[k],3);});
  head.fill(-1);for(let i=0;i<n;i++){const a=Math.floor((X[i]+450)/cs),b=Math.floor((Z[i]+450)/cs);if(a>=0&&b>=0&&a<ns&&b<ns){const k=b*ns+a;next[i]=head[k];head[k]=i;}else next[i]=-1;}
  const H=this.h,spill=!this.managed&&this.holdRun>this.knobs.spillAfter;if(spill)this.spillTime+=dt;
  for(let i=0;i<n;i++){const m=this.motion[i];if(m===INSIDE||m===GONE)continue;
   const x=X[i],z=Z[i],route=s.gateways[this.gw[i]].map;
   if(m===HOLD){const dir=this.descend(route,x,z);if(dir)this.heading[i]=Math.atan2(dir[0],dir[1]);this.move(i,x,z,0,0,0,0,true,false,false,false);continue;}
   const v=this.field(route,x,z);
   if(v<=1.5){// Reached the gateway on foot: leaves the modelled area here.
    this.motion[i]=GONE;this.left++;const k=key(x,z);if(k>=0&&occ[k])occ[k]--;X[i]=this.px[i]=HIDDEN;Z[i]=this.pz[i]=HIDDEN;this.vx[i]=this.vz[i]=0;continue;}
   let dx=0,dz=0,d=0,speed=this.speed[i];
   const onRoad=this.roadBlocked(x,z);
   // Still on the carriageway 4 s after the green: step back to the nearest square metre of
   // sidewalk with room (≤ 2 people) within 8 m, then resume the trip from there.
   if(onRoad&&phase!=='walk'&&!spill)this.timer[i]+=dt;else{this.timer[i]=0;this.flag[i]=0;}
   if(onRoad&&!spill&&this.timer[i]>4&&(!this.flag[i]||this.timer[i]%3<dt)){let bx=0,bz=0,bd=Infinity;for(let oz=-8;oz<=8;oz++)for(let ox=-8;ox<=8;ox++){const tx=Math.floor(x)+ox+.5,tz=Math.floor(z)+oz+.5,r=this.g.rkey(tx,tz),dd=ox*ox+oz*oz;if(r<0||!this.g.side[r]||dd>=bd||dd>64)continue;const k=key(tx,tz);if(occ[k]>2||!this.clearLine(x,z,tx,tz))continue;bd=dd;bx=tx;bz=tz;}
    if(bd<Infinity){this.flag[i]=1;this.gx[i]=bx;this.gz[i]=bz;this.turnbacks++;}}
   if(this.flag[i]){dx=this.gx[i]-x;dz=this.gz[i]-z;d=Math.hypot(dx,dz);}
   else if(v===Infinity){// Pushed off the route network (should not happen): pick any reachable gateway.
    const k=s.gateways.findIndex(q=>this.field(q.map,x,z)<Infinity);if(k>=0){this.gw[i]=k;this.rerouted++;}else if(!this.lostFlag[i]){this.lostFlag[i]=1;this.lost++;}}
   else{const dir=this.descend(route,x,z);if(dir){dx=dir[0];dz=dir[1];d=1;
     if(this.managed&&!this.defy[i]){const r=this.g.rkey(x,z),ln=r>=0?H.lane[r]:0;if(ln){const pull=ln===1?M.pull:M.pull*.3;dx-=H.laneN[2*r]*pull;dz-=H.laneN[2*r+1]*pull;d=Math.hypot(dx,dz);}}}}
   // Spill-over (no control only): once cars have been held 10 s by people on the road,
   // the waiting crowd walks into the junction regardless of the signal.
   const obey=this.managed&&!this.defy[i],mayCross=onRoad||(phase==='walk'&&(!obey||walkLeft>M.cutoff))||spill;
   if(onRoad&&phase!=='walk')speed=Math.max(speed,1.55);
   // Police line (managed): while crossing is not allowed, people heading onto the road
   // wait at least `line` metres back from the curb, keeping an arrival strip free.
   if(obey&&!mayCross&&d>0){const c=this.field(this.g.curb,x,z);if(c<=HALLOWEEN.line+.3&&this.roadBlocked(x+dx/d*(c+1),z+dz/d*(c+1))){this.held2++;
     // Inside the line: step back from the curb (officers ask the front rows to move back).
     const back=c<HALLOWEEN.line?this.descend(this.g.curb,x,z,-1):null;
     if(back)this.move(i,x,z,back[0],back[1],1,.5,false,false,false,false);else this.move(i,x,z,0,0,0,0,true,false,false,false);continue;}}
   // Patience: after 25–40 s at a standstill, take the next-best gateway (a detour).
   if(this.vx[i]*this.vx[i]+this.vz[i]*this.vz[i]<.04)this.leg[i]+=dt;else this.leg[i]=Math.max(0,this.leg[i]-dt*2);
   if(this.leg[i]>25+15*((i*0.6180339)%1)&&!onRoad){this.leg[i]=0;let best=-1,bv=Infinity;s.gateways.forEach((q,k)=>{if(k===this.gw[i])return;const w=this.field(q.map,x,z);if(w<bv){bv=w;best=k;}});if(best>=0&&bv<Infinity){this.gw[i]=best;this.rerouted++;}}
   // People clearing the carriageway may squeeze into a square metre holding 4, and anyone may
   // shoulder past a person heading the opposite way (never 5+ either way).
   this.move(i,x,z,dx,dz,d,speed,false,true,mayCross,onRoad&&phase!=='walk',onRoad?HALLOWEEN.occupancy+1:HALLOWEEN.occupancy,!onRoad);}
  if(this.stepCount%10===0)this.measure();
 }
 // Census and density once per simulated second (agents only; hidden agents excluded).
 measure(){const s=this.d,H=this.h,DC=H.DC,DN=H.DN,R=this.g.R,cnt=this.dcount,n=this.n;cnt.fill(0);
  let inside=0,held=0,walking=0,inStudy=0,onRoad=0;const cell=new Int32Array(n).fill(-1);
  for(let i=0;i<n;i++){const m=this.motion[i];if(m===INSIDE){inside++;continue;}if(m===GONE)continue;if(m===HOLD)held++;else walking++;
   const x=this.x[i],z=this.z[i],a=Math.floor((x+R)/DC),b=Math.floor((z+R)/DC);if(a>=0&&b>=0&&a<DN&&b<DN){const k=b*DN+a;cell[i]=k;if(cnt[k]<65535)cnt[k]++;}
   const r=this.g.rkey(x,z);if(r>=0&&s.study[r]){inStudy++;if(this.roadBlocked(x,z))onRoad++;}}
  let peak=0,at=-1;for(let k=0;k<cnt.length;k++){if(!cnt[k]||H.darea[k]<4)continue;const v=cnt[k]/H.darea[k];if(v>peak){peak=v;at=k;}}
  // Person-weighted density in the study area, and crush exposure (people in cells ≥ 4 p/m², per second).
  const ex=DISPERSAL.exits,zc=new Array(ex.length).fill(0),zp=new Array(ex.length).fill(0);
  for(let i=0;i<n;i++){if(cell[i]<0)continue;const r=this.g.rkey(this.x[i],this.z[i]),q=r>=0?s.zone[r]:0;if(!q)continue;zc[q-1]++;const v=cnt[cell[i]]/Math.max(4,H.darea[cell[i]]);if(v>zp[q-1])zp[q-1]=v;}
  const exits=ex.map((e,k)=>{if(zp[k]>DISPERSAL.exitClear)this.exitClear[k]=null;else if(this.exitClear[k]===null)this.exitClear[k]=this.time;this.exitPeak[k]=Math.max(this.exitPeak[k],zp[k]);
   return {key:e.key,people:zc[k],area:s.zoneArea[k],density:zc[k]/s.zoneArea[k],peak:zp[k],peakRun:this.exitPeak[k],clearAt:this.exitClear[k]};});
  const list=[];let crush=0,densePeak=0;for(let i=0;i<n;i++){if(cell[i]<0)continue;const r=this.g.rkey(this.x[i],this.z[i]);if(r<0||!s.study[r])continue;const v=cnt[cell[i]]/Math.max(4,H.darea[cell[i]]);list.push(v);if(v>=4)crush++;if(v>densePeak)densePeak=v;}
  const dtm=this.time-(this.lastMeasure??this.time);this.lastMeasure=this.time;this.crushSeconds+=crush*dtm;
  if(densePeak>DISPERSAL.dense)this.denseUntil=null;else if(this.denseUntil===null)this.denseUntil=this.time;
  if(inside===0&&this.stationEmptyAt===null)this.stationEmptyAt=this.time;
  list.sort((a,b)=>a-b);const p95=list.length?list[Math.min(list.length-1,Math.floor(.95*list.length))]:0;
  const mean=inStudy/s.studyArea,remaining=inside+held+walking;
  this.peakCell=Math.max(this.peakCell,peak);this.peakStudy=Math.max(this.peakStudy,mean);this.peakP95=Math.max(this.peakP95,p95);
  if(mean>=DISPERSAL.threshold)this.lastBelow=null;else if(this.lastBelow===null)this.lastBelow=this.time;
  const row={t:this.time,inside,held,walking,remaining,left:this.left,inStudy,onRoad,studyDensity:mean,peakCell:peak,p95,densePeak,crush,exits};this.now=row;
  if(this.series.length===0||this.time>=this.series.at(-1).t+5-1e-6)this.series.push(row);
  if(!this.summary&&remaining===0)this.summary=this.summarize();
  this.density={peak,p95,median:list.length?list[Math.floor(list.length/2)]:0,mean,peakRun:this.peakCell,cells:0,time:this.time,at:at<0?null:[(at%DN+.5)*DC-R,(Math.floor(at/DN)+.5)*DC-R],sample:list.length};}
 // Below the threshold from `clearedAt` on (null while the study area is still above it).
 summarize(){return {strategy:this.strategy,agents:this.n,inside:this.insideN,plaza:this.plazaN,peakCell:this.peakCell,peakStudy:this.peakStudy,peakP95:this.peakP95,
  clearedAt:this.lastBelow,threshold:DISPERSAL.threshold,denseClearedAt:this.denseUntil,dense:DISPERSAL.dense,crushPersonMinutes:this.crushSeconds/60,stationEmptyAt:this.stationEmptyAt,remaining:this.now.remaining,left:this.left,emerged:this.emerged,lost:this.lost,rerouted:this.rerouted,turnbacks:this.turnbacks,holdMax:this.holdMax,holdTotal:this.holdTotal,spillTime:this.spillTime,blockedMoves:this.blockedMoves,exits:this.now.exits,time:this.time,allLeftAt:this.now.remaining===0?this.time:null};}
 // Density raster for the heat map: 3 m cells over x∈[-90,150), z∈[-75,135), value = p/m² × 50 (≤ 255).
 heat(){const H=this.h,DC=H.DC,DN=H.DN,R=this.g.R,x0=Math.floor((-90+R)/DC),z0=Math.floor((-75+R)/DC),w=80,h=70,out=new Uint8Array(w*h);
  for(let b=0;b<h;b++)for(let a=0;a<w;a++){const k=(z0+b)*DN+x0+a,area=H.darea[k];if(area<2)continue;out[b*w+a]=Math.min(255,Math.round(this.dcount[k]/Math.max(4,area)*50));}
  return {data:out,w,h,x:(x0*DC)-R,z:(z0*DC)-R,cell:DC};}
 snapshot(){const n=this.n,positions=new Float32Array(n*2),previous=new Float32Array(n*2),motion=new Float32Array(n*2);
  for(let i=0;i<n;i++){positions[2*i]=this.x[i];positions[2*i+1]=this.z[i];previous[2*i]=this.px[i];previous[2*i+1]=this.pz[i];motion[2*i]=this.heading[i];motion[2*i+1]=Math.hypot(this.vx[i],this.vz[i]);}
  // Recount from the motion codes so the overlay never drifts from the agents themselves.
  let inside=0,held=0,walking=0,gone=0;for(let i=0;i<n;i++){const m=this.motion[i];if(m===INSIDE)inside++;else if(m===HOLD)held++;else if(m===GONE)gone++;else walking++;}
  const sg=this.c.signal;
  return {positions,previous,motion,states:this.state.slice(),roles:this.motion.slice(),alpha:this.accumulator/this.dt,dt:this.dt,time:this.time,clock:this.clock,phase:phaseAt(this.clock,sg),
   mode:'dispersal',strategy:this.strategy,agents:n,inside,held,walking,left:gone,remaining:inside+held+walking,emerged:this.emerged,lost:this.lost,rerouted:this.rerouted,turnbacks:this.turnbacks,teleports:this.teleports,holdMax:this.holdMax,holdTotal:this.holdTotal,spillTime:this.spillTime,policeLine:this.held2,
   gateOpen:Array.from(this.gateOpen),now:{...this.now},peakCell:this.peakCell,peakStudy:this.peakStudy,peakP95:this.peakP95,clearedAt:this.lastBelow,threshold:DISPERSAL.threshold,denseClearedAt:this.denseUntil,dense:DISPERSAL.dense,crushPersonMinutes:this.crushSeconds/60,stationEmptyAt:this.stationEmptyAt,
   series:this.series.map(r=>[r.t,r.remaining,r.densePeak,r.inStudy,r.crush]),exits:this.now.exits.map(e=>({...e})),exitSeries:this.series.map(r=>[r.t,...r.exits.map(e=>e.people)]),summary:this.summary,heat:this.heat(),active:0,waiting:0,rescued:this.rescued,
   clearanceHold:this.conflictCount()>0&&this.clock%sg.cycle_s>=sg.walk_s+sg.clearance_s-this.dt-1e-4};}
 get scenario(){const s=this.d;return {gates:s.gates.map(({cells,...q})=>({...q,cells:cells.length})),gateways:s.gateways.map(({map,...q})=>q),studyArea:s.studyArea,assigned:s.assigned,exits:DISPERSAL.exits.map((e,k)=>({...e,area:s.zoneArea[k]}))};}
}
