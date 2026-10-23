// Individual agents in metre coordinates (x east, z south). No density/fluid solver:
// every person integrates its own velocity, social force and random stream.
//
// Life cycle of a crossing trip (motion codes):
//   BACKGROUND → APPROACH (sidewalk route to a corner) → WAIT (curbside queue)
//   → CROSS (only while the all-pedestrian phase is green) → LEAVE → BACKGROUND
// Arrivals are recruited from nearby background walkers at the demand rate of
// the configured hour, so queues build during the vehicle phase and release as
// one scramble wave.
export const CORNERS=[[-28,-14],[-5,-22],[21,-7],[18,12],[5,20],[-23,14]];
export const MOTION=Object.freeze({WAIT:0,CROSS:1,LEAVE:2,BACKGROUND:3,TRAIN:4,STORE:5,VISIT:6,APPROACH:7});
const {WAIT,CROSS,LEAVE,BACKGROUND,TRAIN,STORE,VISIT,APPROACH}=MOTION;

export function phaseAt(t,c){const p=((t%c.cycle_s)+c.cycle_s)%c.cycle_s;return p<c.walk_s?'walk':p<c.walk_s+c.clearance_s?'clearance':p<c.cycle_s-c.all_red_s?'vehicles':'all-red';}
const weightAt=(hour,w)=>{const h=((hour%24)+24)%24,i=Math.floor(h);return w[i]*(1-h%1)+w[(i+1)%24]*(h%1);};
const sum=w=>w.reduce((a,b)=>a+b,0);
export function demandAt(hour,c,peak=false){const w=c.hourly_weights;let rate=c.station_event_proxy*c.street_capture_assumption*weightAt(hour,w)/sum(w)*c.signal.cycle_s/3600;if(peak)rate*=c.peak_phase_target/(c.station_event_proxy*c.street_capture_assumption*Math.max(...w)/sum(w)*c.signal.cycle_s/3600);return rate;}
// Little's law: station events per hour × assumed outdoor dwell per event.
export function populationAt(hour,c){return Math.round(c.station_event_proxy*weightAt(hour,c.hourly_weights)/sum(c.hourly_weights)*(c.presence?.street_dwell_min??15)/60);}
export function trainPhaseAt(t,line){const q=((t-line.offset_s)%line.headway_s+line.headway_s)%line.headway_s;return {visible:q<55||q>line.headway_s-22,travel:q<20?0:q<55?-(q-20)*12:(line.headway_s-q)/22*400};}

function inside(x,z,ring){let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
const FOOT=['footway','pedestrian','path','living_street'];
// Minor streets without simulated traffic are shared space for pedestrians.
const MINOR=['residential','unclassified','service','living_street'];
const surface=r=>Number(r.tags.layer||0)>=0&&r.tags.tunnel!=='yes'&&r.tags.indoor!=='yes';
export const SCRAMBLE_MARGIN=2.5;
export const QUEUE_DENSITY=2.5;// people per m² at a corner (dense but below crush levels)
export const roadHalfWidth=r=>Math.min(22,Number(r.tags.lanes||1)*3.3+1)/2+.5;

// Static geometry (rasters, route maps, walk graph) depends only on the data,
// so repeated constructions in one process share it.
const geometryCache=new WeakMap();
function buildGeometry(osm,plateau,traffic){
 const g={cell:1,size:900,offset:450};const N=g.size*g.size;
 const key=(x,z)=>{const a=Math.floor(x+g.offset),b=Math.floor(z+g.offset);return a<0||b<0||a>=g.size||b>=g.size?-1:b*g.size+a;};
 g.solid=new Uint8Array(N);
 for(const b of plateau.buildings){const ring=b.ring;let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;for(const [x,z] of ring){x0=Math.min(x0,x);x1=Math.max(x1,x);z0=Math.min(z0,z);z1=Math.max(z1,z);}
  for(let j=Math.max(0,Math.floor(z0+g.offset));j<=Math.min(g.size-1,Math.ceil(z1+g.offset));j++)for(let i=Math.max(0,Math.floor(x0+g.offset));i<=Math.min(g.size-1,Math.ceil(x1+g.offset));i++)if(inside(i+.5-g.offset,j+.5-g.offset,ring))g.solid[j*g.size+i]=1;}
 // Conservative carriageway raster: major roads plus the swept SUMO vehicle
 // envelope (half diagonal + body radius + cell diagonal). Non-crossing people
 // are never allowed to enter it.
 g.carriageway=new Uint8Array(N);
 const mark=(a,b,radius)=>{const length=Math.hypot(b[0]-a[0],b[1]-a[1]),reach=Math.ceil(radius)+1;for(let d=0;d<=Math.ceil(length*2);d++){const u=length?Math.min(1,d/(length*2)):0,x=a[0]+(b[0]-a[0])*u,z=a[1]+(b[1]-a[1])*u,cx=Math.floor(x+g.offset),cz=Math.floor(z+g.offset);for(let j=Math.max(0,cz-reach);j<=Math.min(g.size-1,cz+reach);j++)for(let k=Math.max(0,cx-reach);k<=Math.min(g.size-1,cx+reach);k++)if(Math.hypot(k+.5-g.offset-x,j+.5-g.offset-z)<=radius+.71)g.carriageway[j*g.size+k]=1;}};
 for(const road of osm.roads){if(FOOT.includes(road.kind)||MINOR.includes(road.kind)||['steps','cycleway','elevator'].includes(road.kind)||!surface(road))continue;for(let k=1;k<road.points.length;k++)mark(road.points[k-1],road.points[k],roadHalfWidth(road));}
 for(const track of traffic.tracks)for(let k=1;k<track.frames.length;k++)mark(track.frames[k-1].slice(1,3),track.frames[k].slice(1,3),3.3);
 const walkable=k=>k>=0&&!g.solid[k]&&!g.carriageway[k];
 // Crossing walkers may use only the carriageway within 2.5 m of the scramble
 // polygon; vehicle stop lines are set back beyond that (see export_shibuya_traffic.py).
 g.crossable=new Uint8Array(N);
 {const edge=(x,z)=>Math.min(...CORNERS.map((a,i)=>{const b=CORNERS[(i+1)%6],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));return Math.hypot(a[0]+dx*t-x,a[1]+dz*t-z);}));
  for(let z=-45;z<45;z++)for(let x=-45;x<45;x++){const cx=x+.5,cz=z+.5,k=key(cx,cz);if(k>=0&&g.carriageway[k]&&!g.solid[k]&&(inside(cx,cz,CORNERS)||edge(cx,cz)<=SCRAMBLE_MARGIN))g.crossable[k]=1;}
  // Cars held at the stop lines may reach into that margin with their bodies:
  // every cell a vehicle body (plus 0.6 m) covers while pedestrians may be on
  // the road (walk, clearance and its hold) is removed from the crossable set.
  const pedPhase=traffic.signal?.clearance?.[1]??75;
  for(const track of traffic.tracks){const f=track.frames;for(let k=0;k<f.length;k++){const [t,x,z]=f[k];if(t>pedPhase+1||Math.hypot(x,z)>60)continue;const o=f[Math.min(f.length-1,k+1)],p=f[Math.max(0,k-1)],dx=o[1]-p[1],dz=o[2]-p[2],a=(dx||dz)?Math.atan2(dx,dz):f[k][3]*Math.PI/180,c=Math.cos(a),sn=Math.sin(a);
   for(let j=Math.floor(z-4);j<=Math.ceil(z+4);j++)for(let i=Math.floor(x-4);i<=Math.ceil(x+4);i++){const ex=i+.5-x,ez=j+.5-z;if(Math.abs(ex*c-ez*sn)<1.13+.6+.71&&Math.abs(ex*sn+ez*c)<2.48+.6+.71){const q=key(i+.5,j+.5);if(q>=0)g.crossable[q]=0;}}}}}
 // Background walk graph: outdoor footways and traffic-free minor streets,
 // split wherever a metre is not walkable.
 g.segments=[];
 for(const road of osm.roads){if(!(FOOT.includes(road.kind)||MINOR.includes(road.kind))||!surface(road)||road.tags.footway==='crossing')continue;
  const width=road.kind==='pedestrian'?5:FOOT.includes(road.kind)?2:Math.min(6,roadHalfWidth(road)*2-1);
  for(let k=1;k<road.points.length;k++){const a=road.points[k-1],b=road.points[k],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<4)continue;
   let run=[];const finish=()=>{if(run.length>=5){const a=run[0],b=run.at(-1),len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len>=4)g.segments.push({a,b,len,width});}run=[];};
   const steps=Math.ceil(len);for(let j=0;j<=steps;j++){const u=j/steps,p=[Math.fround(a[0]+(b[0]-a[0])*u),Math.fround(a[1]+(b[1]-a[1])*u)];if(Math.hypot(...p)>=30&&walkable(key(...p)))run.push(p);else finish();}finish();}}
 if(!g.segments.length)throw Error('No outdoor walking segments');
 // Endpoint adjacency (0.6 m snap) lets walkers continue onto the next segment.
 const ends=new Map(),snap=p=>`${Math.round(p[0]/.6)},${Math.round(p[1]/.6)}`;
 g.segments.forEach((s,i)=>{for(const [end,p] of [[0,s.a],[1,s.b]]){const k=snap(p);if(!ends.has(k))ends.set(k,[]);ends.get(k).push(i*2+end);}});
 for(const s of g.segments){s.nextA=ends.get(snap(s.a));s.nextB=ends.get(snap(s.b));}
 // Segment spatial hash (8 m) to re-attach people leaving the junction.
 g.segmentHash=new Map();g.segments.forEach((s,i)=>{for(let u=0;u<=1;u+=4/s.len){const x=s.a[0]+(s.b[0]-s.a[0])*u,z=s.a[1]+(s.b[1]-s.a[1])*u,k=`${Math.floor(x/8)},${Math.floor(z/8)}`;if(!g.segmentHash.has(k))g.segmentHash.set(k,new Set());g.segmentHash.get(k).add(i);}});
 // Junction route maps on a 1 m sub-grid within 170 m: per corner, a sidewalk-only
 // distance (approach/leave) and a distance that may use the carriageway (crossing).
 const R=170;g.R=R;g.rsize=2*R;const RN=g.rsize*g.rsize;
 g.rkey=(x,z)=>{const a=Math.floor(x+R),b=Math.floor(z+R);return a<0||b<0||a>=g.rsize||b>=g.rsize?-1:b*g.rsize+a;};
 const toGlobal=r=>key(r%g.rsize-R+.5,Math.floor(r/g.rsize)-R+.5);
 const side=new Uint8Array(RN),open=new Uint8Array(RN),cross=new Uint8Array(RN);for(let r=0;r<RN;r++){const k=toGlobal(r);side[r]=walkable(k)?1:0;open[r]=k>=0&&!g.solid[k]?1:0;cross[r]=side[r]||(k>=0&&g.crossable[k])?1:0;}
 const dijkstra=(sources,pass)=>{const d=new Float32Array(RN).fill(Infinity);const buckets=[];const push=(r,v)=>{const b=Math.floor(v*4);(buckets[b]||(buckets[b]=[])).push(r);};for(const r of sources){d[r]=0;push(r,0);}
  const W=g.rsize,DIAG=Math.SQRT2;for(let b=0;b<buckets.length;b++){const list=buckets[b];if(!list)continue;for(let q=0;q<list.length;q++){const r=list[q],v=d[r];if(Math.floor(v*4)!==b)continue;const x=r%W,z=(r-x)/W;
   for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dz)continue;const nx=x+dx,nz=z+dz;if(nx<0||nz<0||nx>=W||nz>=W)continue;const j=nz*W+nx;if(!pass[j])continue;if(dx&&dz&&(!pass[z*W+nx]||!pass[nz*W+x]))continue;const nv=v+(dx&&dz?DIAG:1);if(nv<d[j]){d[j]=nv;push(j,nv);}}}buckets[b]=null;}return d;};
 // Curb distance: sidewalk metres to the nearest carriageway cell.
 const curbSources=[];for(let r=0;r<RN;r++)if(open[r]&&!side[r])curbSources.push(r);
 g.curb=dijkstra(curbSources,open);
 // Keep only large sidewalk components: traffic islands are not queue areas.
 const comp=new Int32Array(RN).fill(-1),sizes=[];{const W=g.rsize,stack=new Int32Array(RN);for(let r0=0;r0<RN;r0++){if(!side[r0]||comp[r0]>=0)continue;const id=sizes.length;let top=0,count=0;stack[top++]=r0;comp[r0]=id;while(top){const r=stack[--top];count++;const x=r%W;for(const j of [x>0?r-1:-1,x<W-1?r+1:-1,r-W,r+W])if(j>=0&&j<RN&&side[j]&&comp[j]<0){comp[j]=id;stack[top++]=j;}}sizes.push(count);}}
 const mainland=r=>comp[r]>=0&&sizes[comp[r]]>=600;
 g.zones=CORNERS.map(([cx,cz],k)=>{let cells=[];for(let rad=14;rad<=26&&cells.length<120;rad+=4){cells=[];for(let z=-rad;z<=rad;z++)for(let x=-rad;x<=rad;x++){if(x*x+z*z>rad*rad)continue;const r=g.rkey(cx+x,cz+z);if(r>=0&&side[r]&&mainland(r)&&g.curb[r]<=11)cells.push(r);}}if(cells.length<20)throw Error(`corner ${k} without sidewalk`);cells.sort((a,b)=>g.curb[a]-g.curb[b]);return cells;});
 g.walk=g.zones.map(cells=>dijkstra(cells,side));
 g.cross=g.zones.map(cells=>dijkstra(cells.filter(r=>g.curb[r]<=3),cross));
 // Destinations: corners on another sidewalk (more than 25 m apart on foot).
 // Each pair is listed once per 10 m of straight distance, favouring the long diagonals.
 g.across=CORNERS.map((a,k)=>{const list=[];CORNERS.forEach((b,j)=>{if(j===k)return;const r=g.zones[k][0];if(g.walk[j][r]<=25)return;for(let w=0;w<Math.max(1,Math.round(Math.hypot(b[0]-a[0],b[1]-a[1])/10));w++)list.push(j);});return list;});
 g.side=side;g.open=open;g.key=key;
 return g;
}

export class Simulation{
 constructor(config,osm,plateau,traffic={tracks:[]}){
  this.config=config;this.osm=osm;this.c=config.calibration;this.n=config.agents;this.seed=config.seed>>>0;this.time=0;this.clock=0;this.accumulator=0;this.dt=this.c.social_force?.step_s??.1;
  this.promo=config.promotion??true;this.admitted=0;this.completed=0;this.totalCompleted=0;this.trainWaves=[0,0];this.lastTrain=[-1,-1];this.cycle=-1;this.active=0;this.recruitDebt=0;this.rescued=0;this.rescuedCycle=0;this.deferred=0;this.deferredCycle=0;this.last={admitted:0,completed:0,rescued:0,deferred:0};this.queueLoad=new Int32Array(6);this.rng=(this.seed^0x9e3779b9)>>>0||1;
  let g=geometryCache.get(plateau)?.get(osm)?.get(traffic);
  if(!g){g=buildGeometry(osm,plateau,traffic);if(!geometryCache.has(plateau))geometryCache.set(plateau,new WeakMap());const m=geometryCache.get(plateau);if(!m.has(osm))m.set(osm,new WeakMap());m.get(osm).set(traffic,g);}
  this.g=g;this.segments=g.segments;this.solid=g.solid;this.carriageway=g.carriageway;
  for(const k of ['x','z','px','pz','vx','vz','gx','gz','speed','lane','heading','delay','timer'])this[k]=new Float32Array(this.n);
  for(const k of ['state','motion','source','destination','entered'])this[k]=new Uint8Array(this.n);
  this.segment=new Int32Array(this.n);this.direction=new Int8Array(this.n);this.randomState=new Uint32Array(this.n);
  this.ncell=1.6;this.nsize=Math.ceil(900/this.ncell);this.head=new Int32Array(this.nsize*this.nsize);this.next=new Int32Array(this.n);
  this.quota=Math.round(demandAt(config.hour,this.c,config.peak));
  for(let i=0;i<this.n;i++){this.randomState[i]=(this.seed+Math.imul(i+1,2654435761))>>>0;this.speed[i]=1.05+this.rand(i)*.60;this.lane[i]=this.rand(i)-.5;this.placeBackground(i);}
  // Start mid-arrival: the queue that built up during the previous red phase.
  const waiting=Math.min(this.n,Math.round(this.quota*(this.c.signal.cycle_s-this.c.signal.walk_s)/this.c.signal.cycle_s));
  for(let j=0;j<waiting;j++){const i=Math.floor(j*this.n/Math.max(1,waiting));this.placeQueue(i,j%6);}
  this.px.set(this.x);this.pz.set(this.z);
  this.beginCycle();
 }
 random(){let s=this.rng;s^=s<<13;s^=s>>>17;s^=s<<5;this.rng=s>>>0;return(s>>>0)/4294967296;}
 rand(i){let s=this.randomState[i];s^=s<<13;s^=s>>>17;s^=s<<5;this.randomState[i]=s>>>0;return(s>>>0)/4294967296;}
 key(x,z){return this.g.key(x,z);}
 blocked(x,z){const k=this.g.key(x,z);return k<0||this.solid[k]===1;}
 roadBlocked(x,z){const k=this.g.key(x,z);return k<0||this.carriageway[k]===1;}
 sidewalkBlocked(x,z){return this.blocked(x,z)||this.roadBlocked(x,z);}
 crossBlocked(x,z){const k=this.g.key(x,z);return k<0||this.solid[k]===1||(this.carriageway[k]===1&&this.g.crossable[k]!==1);}
 conflictCount(){let count=0;for(let i=0;i<this.n;i++)if(this.roadBlocked(this.x[i],this.z[i]))count++;return count;}
 field(map,x,z){const r=this.g.rkey(x,z);return r<0?Infinity:map[r];}
 // Descent direction of a route map from its central difference (falls back to
 // the best 8-neighbour next to walls). Returns [dx,dz] or null.
 descend(map,x,z,sign=1){const r=this.g.rkey(x,z);if(r<0||map[r]===Infinity)return null;const W=this.g.rsize,v=map[r];const at=j=>j>=0&&j<map.length&&map[j]<Infinity?map[j]:v+sign*1.5;
  let gx=(at(r+1)-at(r-1))/2,gz=(at(r+W)-at(r-W))/2;const len=Math.hypot(gx,gz);if(len>.2)return [-sign*gx/len,-sign*gz/len];
  let best=-1,bv=v;for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const j=r+dz*W+dx,u=map[j];if(u<Infinity&&(sign>0?u<bv:u>bv)){bv=u;best=dx+2+(dz+1)*5;}}
  if(best<0)return null;const dx=best%5-2,dz=Math.floor(best/5)-1,l=Math.hypot(dx,dz);return [dx/l,dz/l];}
 placeBackground(i){
  this.motion[i]=BACKGROUND;this.direction[i]=this.rand(i)<.5?1:-1;
  for(let attempt=0;attempt<60;attempt++){const s=this.pickSegment(this.rand(i)),r=this.segments[s],u=this.rand(i),dx=(r.b[0]-r.a[0])/r.len,dz=(r.b[1]-r.a[1])/r.len,off=this.lane[i]*r.width,x=Math.fround(r.a[0]+u*(r.b[0]-r.a[0])-dz*off),z=Math.fround(r.a[1]+u*(r.b[1]-r.a[1])+dx*off);
   if(!this.sidewalkBlocked(x,z)){this.segment[i]=s;this.x[i]=x;this.z[i]=z;this.backgroundGoal(i);return;}}
  // Every segment point was checked while splitting; no unchecked fallback.
  const r=this.segments[0];this.segment[i]=0;this.x[i]=r.a[0];this.z[i]=r.a[1];this.backgroundGoal(i);
 }
 // Placement weight: segment length × a station-proximity factor (busier near
 // the station and crossing). Illustrative, not a measured density map.
 pickSegment(u){const g=this.g;if(!g.cumulative){let total=0;g.cumulative=new Float64Array(g.segments.length);g.segments.forEach((s,k)=>{const mx=(s.a[0]+s.b[0])/2,mz=(s.a[1]+s.b[1])/2;total+=s.len*(.35+2.4*Math.exp(-Math.hypot(mx,mz)/140));g.cumulative[k]=total;});}
  const target=u*g.cumulative.at(-1);let lo=0,hi=g.cumulative.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(g.cumulative[mid]<target)lo=mid+1;else hi=mid;}return lo;}
 backgroundGoal(i){const s=this.segments[this.segment[i]],p=this.direction[i]>0?s.b:s.a,dx=(s.b[0]-s.a[0])/s.len,dz=(s.b[1]-s.a[1])/s.len,off=this.lane[i]*s.width*this.direction[i];let x=p[0]-dz*off,z=p[1]+dx*off;if(this.sidewalkBlocked(x,z)){x=p[0];z=p[1];}this.gx[i]=x;this.gz[i]=z;}
 nextSegment(i){const s=this.segments[this.segment[i]],list=this.direction[i]>0?s.nextB:s.nextA,options=list.filter(e=>(e>>1)!==this.segment[i]);
  if(!options.length){this.direction[i]*=-1;}else{const e=options[Math.floor(this.rand(i)*options.length)];this.segment[i]=e>>1;this.direction[i]=(e&1)?-1:1;}this.backgroundGoal(i);}
 attachSegment(i){const x=this.x[i],z=this.z[i],cx=Math.floor(x/8),cz=Math.floor(z/8);let best=-1,bd=Infinity;
  for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++){const set=this.g.segmentHash.get(`${cx+dx},${cz+dz}`);if(!set)continue;for(const s of set){const r=this.segments[s],ux=(r.b[0]-r.a[0])/r.len,uz=(r.b[1]-r.a[1])/r.len,t=Math.max(0,Math.min(r.len,(x-r.a[0])*ux+(z-r.a[1])*uz)),d=Math.hypot(r.a[0]+ux*t-x,r.a[1]+uz*t-z);if(d<bd){bd=d;best=s;}}}
  if(best<0){this.placeBackground(i);return;}
  const r=this.segments[best];this.segment[i]=best;this.motion[i]=BACKGROUND;this.direction[i]=Math.hypot(...r.b)>Math.hypot(...r.a)?1:-1;this.backgroundGoal(i);}
 waitSpot(i,corner){const cells=this.g.zones[corner],u=this.rand(i),r=cells[Math.floor(u**1.35*cells.length)],W=this.g.rsize,R=this.g.R;return [r%W-R+.2+this.rand(i)*.6,Math.floor(r/W)-R+.2+this.rand(i)*.6];}
 placeQueue(i,corner){const [x,z]=this.waitSpot(i,corner);this.x[i]=x;this.z[i]=z;this.gx[i]=x;this.gz[i]=z;this.vx[i]=this.vz[i]=0;this.motion[i]=WAIT;this.source[i]=corner;this.heading[i]=Math.atan2(-x,-z);}
 chooseDestination(i){const options=this.g.across[this.source[i]],u=this.rand(i);this.destination[i]=options[Math.floor(u*options.length)];
  const [x,z]=this.waitSpot(i,this.destination[i]);this.gx[i]=x;this.gz[i]=z;}
 startCrossing(i,delay){this.motion[i]=CROSS;this.entered[i]=0;this.delay[i]=delay;this.timer[i]=0;this.chooseDestination(i);this.admitted++;this.active++;}
 beginCycle(){const first=this.cycle<0;this.cycle=Math.floor((this.clock+1e-7)/this.c.signal.cycle_s);
  if(!first)this.last={admitted:this.admitted,completed:this.completed,rescued:this.rescuedCycle,deferred:this.deferredCycle};
  this.admitted=0;this.completed=0;this.rescuedCycle=0;this.deferredCycle=0;this.active=0;
  for(let i=0;i<this.n;i++){if(this.motion[i]===CROSS){this.active++;continue;}if(this.motion[i]!==WAIT)continue;
   // Front rows react first; people further back start as space opens.
   const c=this.field(this.g.curb,this.x[i],this.z[i]);this.startCrossing(i,.4+this.rand(i)*1.2+Math.min(8,c)*.35);}}
 // Arrivals: nearby background walkers with a sidewalk route to a corner join
 // at the hourly demand rate. Candidates are re-scanned every 2 s.
 recruit(dt){
  this.recruitDebt+=this.quota*dt/this.c.signal.cycle_s;
  if(!this.pool||this.time>=this.poolTime+2-1e-9){this.poolTime=this.time;this.pool=[];this.queueLoad.fill(0);for(let i=0;i<this.n;i++){const m=this.motion[i];if(m===APPROACH||m===WAIT)this.queueLoad[this.source[i]]++;}for(let i=0;i<this.n;i++){if(this.motion[i]!==BACKGROUND||this.state[i]===2)continue;const x=this.x[i],z=this.z[i],d=x*x+z*z;if(d<900||d>28900)continue;if(this.nearestCorner(x,z)[1]<=200)this.pool.push(i);}}
  while(this.recruitDebt>=1&&this.pool.length){this.recruitDebt-=1;
   const pick=Math.floor(this.random()*this.pool.length),i=this.pool[pick];this.pool[pick]=this.pool.at(-1);this.pool.pop();
   if(this.motion[i]!==BACKGROUND||this.state[i]===2){this.recruitDebt+=1;continue;}
   const best=this.chooseCorner(this.x[i],this.z[i]);
   if(best<0){this.deferred++;this.deferredCycle++;continue;}// every reachable queue is full: the trip waits outside the model's crossing demand
   this.queueLoad[best]++;this.motion[i]=APPROACH;this.source[i]=best;const [wx,wz]=this.waitSpot(i,best);this.gx[i]=wx;this.gz[i]=wz;}
  this.recruitDebt=Math.min(this.recruitDebt,50);}
 // Queue capacity: at most QUEUE_DENSITY people per m² of a corner's waiting
 // area (approaching + waiting). Walkers prefer the nearest corner but accept a
 // detour of up to 1 m per 4 people already queued there; full corners refuse.
 chooseCorner(x,z){let best=-1,bv=Infinity;for(let k=0;k<6;k++){const cap=Math.floor(this.g.zones[k].length*QUEUE_DENSITY);if(this.queueLoad[k]>=cap)continue;const d=this.field(this.g.walk[k],x,z);if(d>200)continue;const v=d+this.queueLoad[k]/4;if(v<bv){bv=v;best=k;}}return best;}
 nearestCorner(x,z){let best=-1,bv=Infinity;for(let k=0;k<6;k++){const v=this.field(this.g.walk[k],x,z);if(v<bv){bv=v;best=k;}}return [best,bv];}
 advance(seconds){if(!Number.isFinite(seconds)||seconds<0||seconds>60)throw Error('advance expects 0..60 seconds');this.accumulator+=seconds;while(this.accumulator>=this.dt-1e-8){this.step(this.dt);this.accumulator-=this.dt;}return this.snapshot();}
 step(dt){
  this.px.set(this.x);this.pz.set(this.z);
  this.time=Math.round((this.time+dt)*1e6)/1e6;const s=this.c.signal,p=this.clock%s.cycle_s;
  // Hold before vehicle release for ALL people in the carriageway, including
  // non-crossing identities. Already crossing walkers can finish on red.
  if(!(p>=s.walk_s+s.clearance_s-dt-1e-4&&p<s.walk_s+s.clearance_s&&(this.active>0||this.conflictCount()>0)))this.clock=Math.round((this.clock+dt)*1e6)/1e6;
  if(Math.floor((this.clock+1e-7)/s.cycle_s)>this.cycle)this.beginCycle();
  const phase=phaseAt(this.clock,s),walkLeft=s.walk_s-(this.clock%s.cycle_s);
  this.recruit(dt);
  this.c.trains.forEach((line,k)=>{const wave=Math.floor((this.time-line.offset_s-line.walk_delay_s)/line.headway_s);if(wave>=0&&wave>this.lastTrain[k]){this.lastTrain[k]=wave;this.trainWaves[k]++;const count=Math.min(line.alight_wave_agents,this.n);for(let j=0;j<count;j++){const i=(wave*197+k*97+j*31)%this.n;
    // Existing identities emerge from the station exit; no extra particles.
    if(this.motion[i]!==BACKGROUND||this.state[i]>=2)continue;for(let attempt=0;attempt<40;attempt++){const x=Math.fround(8+(this.rand(i)-.5)*10),z=Math.fround(46+this.rand(i)*20);if(!this.sidewalkBlocked(x,z)){this.x[i]=this.px[i]=x;this.z[i]=this.pz[i]=z;break;}}this.vx[i]=this.vz[i]=0;this.motion[i]=TRAIN;this.timer[i]=0;this.gx[i]=8+(this.rand(i)-.5)*30;this.gz[i]=30+this.rand(i)*10;}}});
  const n=this.n,cs=this.ncell,ns=this.nsize,head=this.head,next=this.next,X=this.x,Z=this.z;
  head.fill(-1);for(let i=0;i<n;i++){const a=Math.floor((X[i]+450)/cs),b=Math.floor((Z[i]+450)/cs);if(a>=0&&b>=0&&a<ns&&b<ns){const k=b*ns+a;next[i]=head[k];head[k]=i;}else next[i]=-1;}
  for(let i=0;i<n;i++){
   const x=X[i],z=Z[i];let m=this.motion[i],speed=this.speed[i],dx=this.gx[i]-x,dz=this.gz[i]-z,d=Math.sqrt(dx*dx+dz*dz);
   if(m===BACKGROUND){if(d<1.5){this.nextSegment(i);dx=this.gx[i]-x;dz=this.gz[i]-z;d=Math.sqrt(dx*dx+dz*dz);}speed*=.92;}
   else if(m===APPROACH){
    const route=this.g.walk[this.source[i]],v=this.field(route,x,z);
    if(v<=.5&&d<2.5){if(phase==='walk'&&walkLeft>14){this.startCrossing(i,0);m=CROSS;}else{this.motion[i]=m=WAIT;this.gx[i]=x;this.gz[i]=z;}}
    else if(v>.5){const dir=this.descend(route,x,z);if(dir){dx=dir[0];dz=dir[1];d=1;}}
   }
   else if(m===WAIT){speed=d>.6?.6:0;this.heading[i]=Math.atan2(-x,-z);}
   if(m===CROSS){
    this.timer[i]+=dt;
    if(!this.entered[i]&&this.roadBlocked(x,z))this.entered[i]=1;
    if(!this.entered[i]&&phase!=='walk'){// Flashing: stay on the curb for the next green.
     this.motion[i]=m=WAIT;this.active--;this.admitted--;this.gx[i]=x;this.gz[i]=z;speed=0;}
    else if(this.delay[i]>0){this.delay[i]-=dt;speed=0;}
    else if(this.timer[i]>150&&this.entered[i]){// Last-resort safety valve: never hold traffic indefinitely. Reported as
     // `rescued`, never as a completed crossing; the regression test requires zero.
     const [wx,wz]=this.waitSpot(i,this.destination[i]);X[i]=this.px[i]=wx;Z[i]=this.pz[i]=wz;this.vx[i]=this.vz[i]=0;this.rescued++;this.rescuedCycle++;this.motion[i]=m=LEAVE;this.active--;this.timer[i]=20;continue;}
    else{const route=this.g.cross[this.destination[i]],v=this.field(route,x,z);
     if(this.entered[i]&&!this.roadBlocked(x,z)&&(v<=2.5||this.field(this.g.walk[this.destination[i]],x,z)<=6)){this.motion[i]=m=LEAVE;this.active--;this.completed++;this.totalCompleted++;this.timer[i]=10+this.rand(i)*90;}
     else if(v<Infinity&&d>2){// Straight for the far corner when the line is clear, route map otherwise.
      if(!this.clearLine(x,z,this.gx[i],this.gz[i])){const dir=this.descend(route,x,z);if(dir){dx=dir[0];dz=dir[1];d=1;}}}
     else if(v<Infinity){const dir=this.descend(route,x,z);if(dir){dx=dir[0];dz=dir[1];d=1;}}
     // Late walkers hurry once the pedestrian green ends.
     if(phase!=='walk')speed=Math.max(speed,1.55);}
   }
   if(m===LEAVE){const route=this.g.walk[this.destination[i]],v=this.field(route,x,z);
    if(v>=this.timer[i]||v===Infinity){this.attachSegment(i);m=this.motion[i];dx=this.gx[i]-x;dz=this.gz[i]-z;d=Math.sqrt(dx*dx+dz*dz);}
    else{const dir=this.descend(route,x,z,-1);if(dir){// Ascend away from the corner, biased by personal lane.
      const l=this.lane[i]*.8;dx=dir[0]-dir[1]*l;dz=dir[1]+dir[0]*l;d=Math.hypot(dx,dz);}else{this.attachSegment(i);m=this.motion[i];}}}
   if(m===TRAIN){this.timer[i]+=dt;if(d<3||this.timer[i]>40){this.attachSegment(i);m=this.motion[i];}}
   // Promotion funnel: individual hazards near the fictional cafe.
   const sx=x+46,sz=z+42,store=sx*sx+sz*sz;
   if(this.state[i]===2&&m===BACKGROUND&&store<1024){this.motion[i]=m=STORE;this.gx[i]=-46;this.gz[i]=-42;dx=-sx;dz=-sz;d=Math.sqrt(store);}
   if(m===STORE&&d<3){this.state[i]=3;this.motion[i]=m=VISIT;this.timer[i]=30;}
   if(m===VISIT){speed=0;this.timer[i]-=dt;if(this.timer[i]<=0){this.attachSegment(i);m=this.motion[i];}}
   const draw=this.rand(i);
   if(this.state[i]===0&&store<5625&&draw<(this.promo?.04:.002)*dt)this.state[i]=1;
   else if(this.state[i]===1&&draw<(this.promo?.012:.001)*dt)this.state[i]=2;
   // Social force (Helbing–Molnár style, illustrative parameters).
   const ux=d>.05?dx/d*speed:0,uz=d>.05?dz/d*speed:0;let ax=(ux-this.vx[i])/.5,az=(uz-this.vz[i])/.5,rx=0,rz=0,count=0;
   const a=Math.floor((x+450)/cs),b=Math.floor((z+450)/cs),moving=m===CROSS||m===LEAVE;
   for(let zz=Math.max(0,b-1);zz<=Math.min(ns-1,b+1);zz++)for(let xx=Math.max(0,a-1);xx<=Math.min(ns-1,a+1);xx++)for(let j=head[zz*ns+xx];j>=0&&count<20;j=next[j]){if(j===i)continue;const ex=x-X[j],ez=z-Z[j],r2=ex*ex+ez*ez;if(r2>2.56)continue;count++;const r=Math.sqrt(Math.max(1e-4,r2)),f=Math.min(6,2*Math.exp((.5-r)/.3))*(moving&&this.motion[j]===WAIT?.12:m===WAIT&&this.motion[j]!==WAIT?1.6:1);rx+=ex/r*f;rz+=ez/r*f;}
   const limit=m===WAIT?2.2:m===CROSS&&this.entered[i]&&phase!=='walk'?1.2:3.5,rep=Math.sqrt(rx*rx+rz*rz),wgt=rep>limit?limit/rep:1;ax+=rx*wgt;az+=rz*wgt;
   for(const [ox,oz] of [[1,0],[-1,0],[0,1],[0,-1]])if(this.blocked(x+ox*.8,z+oz*.8)){ax-=ox*1.5;az-=oz*1.5;}
   let vx=this.vx[i]+ax*dt,vz=this.vz[i]+az*dt,v=Math.sqrt(vx*vx+vz*vz);const cap=m===WAIT?.7:1.95;if(v>cap){vx*=cap/v;vz*=cap/v;v=cap;}
   const mayCross=m===CROSS&&(phase==='walk'||this.entered[i]);
   const blocked=(p,q)=>mayCross?this.crossBlocked(p,q):this.blocked(p,q)||this.roadBlocked(p,q);
   let nx=Math.fround(x+vx*dt),nz=Math.fround(z+vz*dt);if(blocked(nx,nz)){if(!blocked(nx,z)){nz=z;vz=0;}else if(!blocked(x,nz)){nx=x;vx=0;}else{nx=x;nz=z;vx=vz=0;}}
   X[i]=nx;Z[i]=nz;this.vx[i]=vx;this.vz[i]=vz;if(v>.15&&m!==WAIT)this.heading[i]=Math.atan2(vx,vz);
  }
 }
 clearLine(x0,z0,x1,z1){const len=Math.hypot(x1-x0,z1-z0),steps=Math.ceil(len/.4);for(let k=1;k<steps;k++){const u=k/steps;if(this.crossBlocked(x0+(x1-x0)*u,z0+(z1-z0)*u))return false;}return true;}
 snapshot(){const n=this.n,positions=new Float32Array(n*2),previous=new Float32Array(n*2),motion=new Float32Array(n*2),funnel=[0,0,0,0];
  for(let i=0;i<n;i++){positions[2*i]=this.x[i];positions[2*i+1]=this.z[i];previous[2*i]=this.px[i];previous[2*i+1]=this.pz[i];motion[2*i]=this.heading[i];motion[2*i+1]=Math.hypot(this.vx[i],this.vz[i]);funnel[this.state[i]]++;}
  const s=this.c.signal;
  return {positions,previous,motion,states:this.state.slice(),roles:this.motion.slice(),alpha:this.accumulator/this.dt,dt:this.dt,time:this.time,clock:this.clock,phase:phaseAt(this.clock,s),active:this.active,admitted:this.admitted,completed:this.completed,totalCompleted:this.totalCompleted,rescued:this.rescued,promotion:this.promo,quota:this.quota,funnel,trainWaves:this.trainWaves.slice(),
   waiting:this.motion.reduce((k,m)=>k+(m===WAIT),0),approaching:this.motion.reduce((k,m)=>k+(m===APPROACH),0),rescuedCycle:this.rescuedCycle,deferred:this.deferred,deferredCycle:this.deferredCycle,lastCycle:{...this.last},clearanceHold:(this.active>0||this.conflictCount()>0)&&this.clock%s.cycle_s>=s.walk_s+s.clearance_s-this.dt-1e-4};}
}
