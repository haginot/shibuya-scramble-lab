// Halloween night mode. Same individual social-force walkers, route maps and
// SUMO-coupled scramble signal as the normal mode, plus the crowd management
// Shibuya police use on the night. Every number in HALLOWEEN is an assumption
// for this toy model, not a measurement:
//  • holding pens on each corner's approach sidewalks with stop-and-go gates
//    (people are held while the corner queue is at capacity, then released in pulses)
//  • staged release of each corner queue (front rows first) and a police
//    cut-off before the end of the green
//  • one-way circulation on the sidewalks ringing the scramble, keep-left
//    elsewhere (Center-gai is split by a cone-and-bar divider)
//  • peripheral events: costume photo spots, street performers, convenience
//    stores, trash/recycling stations
// HUD numbers are counts of these motion codes. Density is sampled from agent
// positions over walkable area. Nobody is relocated: the train-arrival waves
// of the normal mode (which move existing identities to the station exit) are
// disabled, and the last-resort safety valve is reported, never counted.
import {Simulation,CORNERS,MOTION,phaseAt} from './simulation.mjs';

export const HMOTION=Object.freeze({...MOTION,HOLD:8,ATTEND:9});
export const EXTRA_MOTION=16;// codes ≥ 16 are handled by extraAgent() (escape.mjs); dispersal uses 10–12 with its own step
const {WAIT,CROSS,LEAVE,BACKGROUND,TRAIN,APPROACH,HOLD,ATTEND}=HMOTION;

export const HALLOWEEN=Object.freeze({
 agents:48000,       // people modelled in the ~0.8 km area (assumption, ≈1.4× the 18:00 Little's-law population)
 hour:21,
 quota:3600,         // requested crossings per 150 s cycle; more than the corners hold, so pens fill (assumption)
 cornerDensity:1.7,  // people per m² allowed into a corner queue (room left for arrivals to pass)
 penDensity:1.4,     // held people per m² of pen (passers-by add to the measured density)
 attendDensity:1.2,  // audience per m² around an event
 gate:3,             // police gate: metres upstream of the corner queue area
 line:2.6,          // police line: waiting people stand at least this far back from the curb
 laneReach:95,      // m (on foot) from a corner within which approach sidewalks are split into one-way lanes
 penDepth:70,        // metres of approach sidewalk used for holding
 walkRelease:10,     // people per second through an open gate early in the walk phase
 pulseRelease:9,     // people per second during stop-and-go pulses
 pulse:5,            // s open / s closed
 stageGap:3.5,       // s between released rows (front, middle, back of a corner queue)
 cutoff:20,          // police stop new departures with this many seconds of green left
 goUntil:32,        // gates let people flow straight through only while this much green is left
 maxOnCrossing:2600, // police hold departures while this many people are on the crossing
 ring:[28,80],       // one-way band around the scramble (m from centre)
 keepLeft:190,       // keep-left guidance radius
 densityCell:3,      // m; density sampled on 3 m × 3 m cells of walkable area
 occupancy:4,        // hard limit: nobody steps into a 1 m² cell already holding this many people
});

const cache=new WeakMap();
const SIDESTEP=[[.707,.707],[.707,-.707],[0,1],[0,-1]];// cos/sin of left/right 45° and 90° turns
const segDist=(x,z,a,b)=>{const dx=b[0]-a[0],dz=b[1]-a[1],l=dx*dx+dz*dz||1,t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/l));return Math.hypot(a[0]+dx*t-x,a[1]+dz*t-z);};
// Bucket Dijkstra on the 1 m route grid (8-neighbour, no corner cutting).
function dijkstra(W,sources,pass){const RN=W*W,d=new Float32Array(RN).fill(Infinity),buckets=[];const push=(r,v)=>{const b=Math.floor(v*4);(buckets[b]||(buckets[b]=[])).push(r);};for(const r of sources){d[r]=0;push(r,0);}
 for(let b=0;b<buckets.length;b++){const list=buckets[b];if(!list)continue;for(let q=0;q<list.length;q++){const r=list[q],v=d[r];if(Math.floor(v*4)!==b)continue;const x=r%W,z=(r-x)/W;
  for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dz)continue;const nx=x+dx,nz=z+dz;if(nx<0||nz<0||nx>=W||nz>=W)continue;const j=nz*W+nx;if(!pass[j])continue;if(dx&&dz&&(!pass[z*W+nx]||!pass[nz*W+x]))continue;const nv=v+(dx&&dz?Math.SQRT2:1);if(nv<d[j]){d[j]=nv;push(j,nv);}}}buckets[b]=null;}return d;}
function mulberry(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

// Static Halloween layout derived from the same rasters/route maps as the
// solver: pens, lane rules, officers, barriers, event spots and prop footprints.
// Deterministic; shared with the renderer through the worker's init reply.
function build(sim){
 const g=sim.g,osm=sim.osm||{roads:[],shops:[]},H=HALLOWEEN,R=g.R,W=g.rsize,RN=W*W,rnd=mulberry(31);
 const X=r=>r%W-R+.5,Z=r=>Math.floor(r/W)-R+.5;
 const zoneOf=new Int8Array(RN).fill(-1);g.zones.forEach((cells,k)=>cells.forEach(r=>zoneOf[r]=k));
 // Clearance: chamfer distance (m) from each sidewalk cell to the nearest non-sidewalk cell.
 const clear=new Float32Array(RN);for(let r=0;r<RN;r++)clear[r]=g.side[r]?1e6:0;
 const relax=(r,j,c)=>{if(j>=0&&j<RN&&clear[j]+c<clear[r])clear[r]=clear[j]+c;};
 for(let z=0;z<W;z++)for(let x=0;x<W;x++){const r=z*W+x;if(!clear[r])continue;if(x>0)relax(r,r-1,1);if(z>0){relax(r,r-W,1);if(x>0)relax(r,r-W-1,1.414);if(x<W-1)relax(r,r-W+1,1.414);}}
 for(let z=W-1;z>=0;z--)for(let x=W-1;x>=0;x--){const r=z*W+x;if(!clear[r])continue;if(x<W-1)relax(r,r+1,1);if(z<W-1){relax(r,r+W,1);if(x<W-1)relax(r,r+W+1,1.414);if(x>0)relax(r,r+W-1,1.414);}}
 // Pens: approach sidewalk cells nearest (on foot) to each corner, beyond the gate.
 const nearest=new Int8Array(RN).fill(-1),nv=new Float32Array(RN).fill(Infinity);
 for(let r=0;r<RN;r++){if(!g.side[r]||zoneOf[r]>=0)continue;for(let k=0;k<6;k++){const v=g.walk[k][r];if(v<nv[r]){nv[r]=v;nearest[r]=k;}}}
 // One-way lanes on the approach sidewalks: relative to someone walking towards the
 // nearest corner, the half of the sidewalk on their left (Japan keeps left) is the
 // inbound lane (1) and the other half the outbound lane (2); narrow walks stay shared (0).
 const lane=new Uint8Array(RN),laneN=new Float32Array(RN*2);
 for(let r=0;r<RN;r++){const k=nearest[r];if(k<0||nv[r]>H.laneReach)continue;const map=g.walk[k],at=j=>j>=0&&j<RN&&map[j]<1e5?map[j]:map[r];let tx=-(at(r+1)-at(r-1)),tz=-(at(r+W)-at(r-W));const l=Math.hypot(tx,tz);if(l<.2)continue;tx/=l;tz/=l;
  const nx=tz,nz=-tx,x=X(r),z=Z(r),ray=(sx,sz)=>{let d=0;for(;d<10;d+=.5){const j=g.rkey(x+sx*d,z+sz*d);if(j<0||!g.side[j])break;}return d;};
  const dl=ray(nx,nz),dr=ray(-nx,-nz);laneN[2*r]=nx;laneN[2*r+1]=nz;if(dl+dr<3)continue;lane[r]=dl<dr?1:2;}
 const pens=CORNERS.map(()=>[]);for(let r=0;r<RN;r++){const k=nearest[r];if(k>=0&&nv[r]>=H.gate&&nv[r]<=H.gate+H.penDepth&&lane[r]===1)pens[k].push(r);}
 pens.forEach(list=>list.sort((a,b)=>nv[a]-nv[b]||a-b));
 const penV=pens.map(list=>Float32Array.from(list,r=>nv[r]));
 // Waiting area: corner cells behind the police line; the curb strip in front is for arrivals.
 const waitCells=g.zones.map(cells=>{const behind=cells.filter(r=>g.curb[r]>=H.line);return behind.length>=40?behind:cells.slice(Math.floor(cells.length*.4));});
 // Exit route maps: from the arrival strip out of the corner to the sidewalk 7–9 m beyond it
 // (inside a corner the walk map is flat, so arrivals need their own gradient).
 const exits=g.zones.map((cells,k)=>{const targets=[];for(let r=0;r<RN;r++)if(g.side[r]&&zoneOf[r]<0&&g.walk[k][r]>=7&&g.walk[k][r]<=9)targets.push(r);return dijkstra(W,targets,g.side);});
 const cornerCap=waitCells.map(z=>Math.floor(z.length*H.cornerDensity)),penCap=pens.map(p=>Math.floor(p.length*H.penDensity));
 // Center-gai centreline (OSM ways named センター街), first ~180 m from the junction.
 const gai=[];for(const r of osm.roads){if(!String(r.tags?.name||r.name||'').includes('センター街'))continue;for(let k=1;k<r.points.length;k++){const a=r.points[k-1],b=r.points[k];if(Math.hypot(...a)<200||Math.hypot(...b)<200)gai.push([a,b]);}}
 const gaiDist=(x,z)=>gai.length?Math.min(...gai.map(([a,b])=>segDist(x,z,a,b))):Infinity;
 // Lane rules per walk segment: 0 free, 1 keep-left, 2 one-way a→b, 3 one-way b→a.
 const rule=new Uint8Array(g.segments.length);
 g.segments.forEach((s,i)=>{const mx=(s.a[0]+s.b[0])/2,mz=(s.a[1]+s.b[1])/2,d=Math.hypot(mx,mz),ux=(s.b[0]-s.a[0])/s.len,uz=(s.b[1]-s.a[1])/s.len;
  if(d>=H.ring[0]&&d<=H.ring[1]&&gaiDist(mx,mz)>9){const t=(ux*-mz+uz*mx)/d;if(Math.abs(t)>.6){rule[i]=t>0?2:3;return;}}
  if(d<=H.keepLeft)rule[i]=1;});
 // Density sampling grid (3 m cells of sidewalk + scramble area).
 const DC=H.densityCell,DN=Math.ceil(2*R/DC),darea=new Float32Array(DN*DN);
 for(let r=0;r<RN;r++){const k=g.key(X(r),Z(r));if(g.side[r]||(k>=0&&g.crossable[k]))darea[Math.floor((Z(r)+R)/DC)*DN+Math.floor((X(r)+R)/DC)]++;}
 const near=(x,z)=>g.rkey(x,z);
 const ok=(x,z,c=0)=>{const r=near(x,z);return r>=0&&g.side[r]&&clear[r]>=c;};
 // Pick the cell nearest a target with the required clearance, away from corner queues and pen fronts.
 const used=[];const pick=(tx,tz,c,avoid=12,span=30)=>{let best=null,bd=Infinity;for(let z=-span;z<=span;z++)for(let x=-span;x<=span;x++){const px=Math.round(tx)+x+.5,pz=Math.round(tz)+z+.5,r=near(px,pz);if(r<0||!g.side[r]||clear[r]<c||zoneOf[r]>=0)continue;if(nearest[r]>=0&&nv[r]<avoid)continue;if(used.some(u=>Math.hypot(u[0]-px,u[1]-pz)<u[2]+c+2))continue;const d=Math.hypot(px-tx,pz-tz);if(d<bd){bd=d;best=[px,pz];}}if(best)used.push([...best,c]);return best;};
 const props=[],pois=[],officers=[],barriers=[],cones=[],staff=[],dividers=[];
 {const cand=[];for(let r=0;r<RN;r++){if(lane[r]!==1||nv[r]>H.gate+H.penDepth||nv[r]<H.gate)continue;for(const j of [r+1,r-1,r+W,r-W])if(lane[j]===2){cand.push(r);break;}}
  for(const r of cand){const x=X(r),z=Z(r);if(dividers.every(o=>Math.hypot(o.x-x,o.z-z)>=2.4))dividers.push({x,z,angle:Math.atan2(laneN[2*r],laneN[2*r+1])+Math.PI/2});}}
 // DJ police: command vehicle with a raised platform on the station plaza facing the scramble.
 const djp=pick(15,42,3.6,22,26)||pick(0,45,3,10,40);
 const dj=djp&&{x:djp[0],z:djp[1],angle:Math.atan2(-djp[0],-djp[1]),height:3.1};
 if(dj)props.push({kind:'dj',x:dj.x,z:dj.z,angle:dj.angle,w:2.3,d:5.4});
 // Peripheral events. Targets are approximate; each snaps to open paving.
 const EVENTS=[['photo',38,64,2.2,5.5],['photo',-62,-50,1.6,4.2],['performer',52,-36,1.6,5.2],['performer',-58,22,1.6,5],['performer',-6,78,1.6,5.4],['bins',30,30,1,2.6],['bins',-40,-30,.9,2.4],['bins',60,10,1,2.6],['bins',-24,40,1,2.6]];
 for(const s of osm.shops||[])if(s.kind==='convenience'&&Math.hypot(...s.position)<175)EVENTS.push(['store',s.position[0],s.position[1],.6,4.2]);
 for(const [kind,tx,tz,core,r1] of EVENTS){const p=pick(tx,tz,kind==='store'?2:core+1.8,kind==='store'?6:16,kind==='store'?9:30);if(!p)continue;
  const ring=[];for(let z=-Math.ceil(r1);z<=Math.ceil(r1);z++)for(let x=-Math.ceil(r1);x<=Math.ceil(r1);x++){const px=p[0]+x,pz=p[1]+z,d=Math.hypot(x,z);if(d<core+.6||d>r1)continue;if(ok(px,pz))ring.push([px,pz]);}
  if(ring.length<6)continue;
  const poi={kind,x:p[0],z:p[1],r0:core+.6,r1,ring,cap:Math.floor(ring.length*H.attendDensity*(kind==='bins'?.35:kind==='store'?.8:1)),dwell:kind==='bins'?[6,16]:kind==='store'?[30,110]:kind==='photo'?[25,80]:[40,150],rate:kind==='bins'?.05:kind==='store'?.03:.04,angle:0};
  // Face the open side (towards the most clearance).
  let bx=0,bz=0;for(const [px,pz] of ring){bx+=px-p[0];bz+=pz-p[1];}poi.angle=Math.atan2(bx,bz);
  pois.push(poi);if(kind!=='store')props.push({kind,x:p[0],z:p[1],angle:poi.angle,w:kind==='bins'?2.2:core*2,d:kind==='bins'?.8:core*2});}
 // Officers along each corner's curb frontage (spaced ~3.6 m), facing the queue.
 const spaced=(cells,gap,limit)=>{const out=[];for(const r of cells){const x=X(r),z=Z(r);if(out.every(o=>Math.hypot(o[0]-x,o[1]-z)>=gap))out.push([x,z,r]);if(out.length>=limit)break;}return out;};
 const grad=(map,x,z)=>{const r=near(x,z);if(r<0)return [0,1];const at=j=>map[j]<1e5?map[j]:map[r];const gx=(at(r+1)-at(r-1))/2,gz=(at(r+W)-at(r-W))/2,l=Math.hypot(gx,gz)||1;return [gx/l,gz/l];};
 g.zones.forEach((cells,k)=>{const front=cells.filter(r=>g.curb[r]<=1.01).sort((a,b)=>(X(a)*7.1+Z(a))-(X(b)*7.1+Z(b)));
  for(const [x,z] of spaced(front,3.6,9)){const [gx,gz]=grad(g.curb,x,z);officers.push({x,z,angle:Math.atan2(gx,gz),kind:0,corner:k});}});
 // Gate officers and half-width barriers where each pen meets the corner queue.
 pens.forEach((list,k)=>{const line=list.filter(r=>nv[r]<H.gate+1);for(const [x,z] of spaced(line,4.5,4)){const [gx,gz]=grad(g.walk[k],x,z);officers.push({x,z,angle:Math.atan2(gx,gz),kind:1,corner:k});
   const ax=-gz,az=gx;for(const s of [-1,1]){const bx=x+ax*s*1.6,bz=z+az*s*1.6;if(ok(bx,bz))barriers.push({x:bx,z:bz,angle:Math.atan2(ax,az),len:2,kind:1,corner:k,side:s});}}});
 // Curb fences: sidewalk edges along the carriageway near the junction, except corner frontages.
 {const edge=[];for(let r=0;r<RN;r++){if(!g.side[r]||g.curb[r]>1.01)continue;const x=X(r),z=Z(r),d=Math.hypot(x,z);if(d>95||d<12)continue;let nearZone=false;for(let dz=-3;dz<=3&&!nearZone;dz++)for(let dx=-3;dx<=3;dx++){const j=r+dz*W+dx;if(j>=0&&j<RN&&zoneOf[j]>=0){nearZone=true;break;}}if(nearZone)continue;edge.push(r);}
  for(const [x,z] of spaced(edge,2.05,2000)){let nx=0,nz=0;for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const j=near(x+dx,z+dz);if(j>=0&&g.open[j]&&!g.side[j]){nx+=dx;nz+=dz;}}const l=Math.hypot(nx,nz);if(!l)continue;nx/=l;nz/=l;barriers.push({x:x+nx*.4,z:z+nz*.4,angle:Math.atan2(-nz,nx),len:2,kind:0});}}
 // Center-gai divider (cones + lit bars) and lane officers along it.
 {let run=0;for(const [a,b] of gai){const l=Math.hypot(b[0]-a[0],b[1]-a[1]);for(let s=0;s<l;s+=2.2){const x=a[0]+(b[0]-a[0])*s/l,z=a[1]+(b[1]-a[1])*s/l,d=Math.hypot(x,z);if(d<26||d>190||!ok(x,z))continue;cones.push({x,z,angle:Math.atan2(b[0]-a[0],b[1]-a[1])});run++;if(run%11===5)officers.push({x:x+(rnd()-.5)*.6,z,angle:Math.atan2(-(b[1]-a[1]),b[0]-a[0])*(run%2?1:-1),kind:2,corner:-1});}}}
 if(dj)officers.push({x:dj.x,z:dj.z,angle:dj.angle,kind:3,corner:-1,y:dj.height});
 // Trash/recycling stations are staffed by volunteers in vests.
 for(const p of pois)if(p.kind==='bins')staff.push({x:p.x+Math.sin(p.angle)*1.1,z:p.z+Math.cos(p.angle)*1.1,angle:p.angle+Math.PI});
 // Decorations: jack-o'-lanterns at wall bases (1 m from a building, off the waiting areas),
 // painted one-way arrows on the circulation segments.
 const pumpkins=[],arrows=[];
 {const cand=[];for(let r=0;r<RN;r++){if(!g.side[r]||zoneOf[r]>=0||clear[r]>1.5)continue;const x=X(r),z=Z(r),d=Math.hypot(x,z);if(d>150||d<20)continue;let wall=false;for(const j of [r+1,r-1,r+W,r-W]){const k=g.key(X(j),Z(j));if(k>=0&&g.solid[k]){wall=true;break;}}if(wall)cand.push([x,z,d]);}
  cand.sort((a,b)=>a[2]-b[2]);for(const [x,z] of cand){if(pumpkins.length>=420)break;if(pumpkins.every(p=>Math.hypot(p.x-x,p.z-z)>=(Math.hypot(x,z)<70?4:7)))pumpkins.push({x,z,s:.7+rnd()*.7,angle:rnd()*6.28});}
  g.segments.forEach((sg,i)=>{if(rule[i]<2)return;const dir=rule[i]===2?1:-1,ux=(sg.b[0]-sg.a[0])/sg.len*dir,uz=(sg.b[1]-sg.a[1])/sg.len*dir;for(let t=4;t<sg.len-3;t+=11){const x=sg.a[0]+(sg.b[0]-sg.a[0])*t/sg.len,z=sg.a[1]+(sg.b[1]-sg.a[1])*t/sg.len;if(arrows.every(a=>Math.hypot(a.x-x,a.z-z)>6))arrows.push({x,z,angle:Math.atan2(ux,uz)});}});}
 // Prop footprints become solid for the solver (walkers route around them).
 const propCells=[];for(const p of props){const c=Math.cos(p.angle),s=Math.sin(p.angle),rx=p.w/2+.2,rz=p.d/2+.2,ext=Math.ceil(Math.hypot(rx,rz))+1;
  for(let dz=-ext;dz<=ext;dz++)for(let dx=-ext;dx<=ext;dx++){const x=Math.floor(p.x)+dx+.5,z=Math.floor(p.z)+dz+.5,ex=x-p.x,ez=z-p.z;if(Math.abs(ex*c-ez*s)<=rx+.5&&Math.abs(ex*s+ez*c)<=rz+.5){const k=g.key(x,z);if(k>=0)propCells.push(k);}}}
 const obstacles=[...officers.filter(o=>o.kind!==3).map(o=>[o.x,o.z]),...staff.map(o=>[o.x,o.z])];
 // 2 m bucket grid of obstacles: head per cell, next per obstacle.
 const OG=Math.ceil(2*R/2),obsHead=new Int32Array(OG*OG).fill(-1),obsNext=new Int32Array(obstacles.length);
 obstacles.forEach(([x,z],q)=>{const a=Math.floor((x+R)/2),b=Math.floor((z+R)/2);if(a<0||b<0||a>=OG||b>=OG){obsNext[q]=-1;return;}obsNext[q]=obsHead[b*OG+a];obsHead[b*OG+a]=q;});
 // Walk segments that pass through a corner's waiting area are closed to through traffic.
 const closed=Uint8Array.from(g.segments,s=>{for(let u=0;u<=1;u+=1/Math.ceil(s.len)){const r=g.rkey(s.a[0]+(s.b[0]-s.a[0])*u,s.a[1]+(s.b[1]-s.a[1])*u);if(r>=0&&zoneOf[r]>=0)return 1;}return 0;});
 const pickWeights=new Float64Array(g.segments.length);{let total=0;g.segments.forEach((s,k)=>{const mx=(s.a[0]+s.b[0])/2,mz=(s.a[1]+s.b[1])/2,d=Math.hypot(mx,mz);total+=closed[k]?0:s.len*Math.sqrt(s.width/2)*(.3+1.3*Math.exp(-d/110)+(gaiDist(mx,mz)<8&&d<220?.7:0));pickWeights[k]=total;});}
 const deadA=Uint8Array.from(g.segments,(s,i)=>!s.nextA.some(e=>(e>>1)!==i)),deadB=Uint8Array.from(g.segments,(s,i)=>!s.nextB.some(e=>(e>>1)!==i));
 return {pumpkins,arrows,closed,dividers,lane,laneN,deadA,deadB,waitCells,exits,OG,obsHead,obsNext,pens,penV,nv,nearest,zoneOf,cornerCap,penCap,rule,gai,DC,DN,darea,pois,props,officers,barriers,cones,staff,dj,propCells,obstacles,pickWeights,clear};
}

export class HalloweenSimulation extends Simulation{
 constructor(config,osm,plateau,traffic){
  super({...config,promotion:false},osm,plateau,traffic);
  const n=this.n,H=this.h;this.mode='halloween';this.quota=config.quota??HALLOWEEN.quota;this.promo=false;
  this.solid=this.g.solid.slice();for(const k of H.propCells)this.solid[k]=1;
  this.flag=new Uint8Array(n);this.poi=new Int16Array(n).fill(-1);
  this.held=new Int32Array(6);this.cornerLoad=new Int32Array(6);this.queued=new Int32Array(6);this.gate=new Uint8Array(6);this.poiLoad=new Int32Array(H.pois.length);
  this.leg=new Float32Array(n);this.occ=new Uint8Array(this.g.size*this.g.size);this.blockedMoves=0;this.turnbacks=0;this.transitions=0;
  this.teleports=0;this.laneViolations=0;this.released=0;this.releasedCycle=0;this.heldPeak=0;this.cutoffs=0;this.stepCount=0;this.lastManage=-1;
  this.dcount=new Uint16Array(H.DN*H.DN);this.density={peak:0,p95:0,median:0,mean:0,peakRun:0,cells:0,time:0};
  // Initial placement (before t=0) respects prop footprints and the occupancy limit.
  {const occ=this.occ,key=this.g.key,cap=HALLOWEEN.occupancy;for(let i=0;i<n;i++){let k=key(this.x[i],this.z[i]);
   for(let tries=0;(this.blocked(this.x[i],this.z[i])||k<0||occ[k]>=cap)&&tries<200;tries++){if(this.motion[i]===WAIT||this.motion[i]===CROSS){const [x,z]=this.waitSpot(i,this.source[i]);this.x[i]=x;this.z[i]=z;if(this.motion[i]===WAIT){this.gx[i]=x;this.gz[i]=z;}}else super.placeBackground(i);k=key(this.x[i],this.z[i]);}
   if(k>=0)occ[k]++;this.px[i]=this.x[i];this.pz[i]=this.z[i];}}
  this.still=new Uint8Array(32);this.still[WAIT]=this.still[HOLD]=1;
  this.constructed=true;this.sampleDensity();
 }
 get h(){let h=cache.get(this.g);if(!h){h=build(this);cache.set(this.g,h);}return h;}
 get layout(){const H=this.h;return {pois:H.pois.map(({ring,...p})=>p),props:H.props,officers:H.officers,barriers:H.barriers,cones:H.cones,dividers:H.dividers,pumpkins:H.pumpkins,arrows:H.arrows,staff:H.staff,dj:H.dj,gai:H.gai,cornerCap:H.cornerCap,penCap:H.penCap,pens:H.pens.map(list=>list.filter((_,j)=>j%3===0).map(r=>[r%this.g.rsize-this.g.R+.5,Math.floor(r/this.g.rsize)-this.g.R+.5]))};}
 // Placement concentrates on the junction, Center-gai and the station plaza.
 pickSegment(u){const w=this.h.pickWeights,target=u*w.at(-1);let lo=0,hi=w.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(w[mid]<target)lo=mid+1;else hi=mid;}return lo;}
 allowed(s,dir){const H=this.h;if(H.closed[s])return false;const r=H.rule[s];return r<2||(r===2?dir>0:dir<0);}
 placeBackground(i){if(this.constructed)this.teleports++;super.placeBackground(i);if(!this.allowed(this.segment[i],this.direction[i])){this.direction[i]*=-1;this.backgroundGoal(i);}}
 // Keep left of the direction of travel on managed segments (Japanese keep-left guidance).
 backgroundGoal(i){if(this.leg)this.leg[i]=0;const s=this.segments[this.segment[i]],rule=this.h?.rule[this.segment[i]]??0;if(!rule)return super.backgroundGoal(i);
  const dir=this.direction[i],p=dir>0?s.b:s.a,dx=(s.b[0]-s.a[0])/s.len,dz=(s.b[1]-s.a[1])/s.len,off=-dir*(.1+Math.abs(this.lane[i])*.8)*s.width;
  let x=p[0]-dz*off,z=p[1]+dx*off;if(this.sidewalkBlocked(x,z)||!this.walkLine(this.x[i],this.z[i],x,z)){x=p[0];z=p[1];}this.gx[i]=x;this.gz[i]=z;}
 walkLine(x0,z0,x1,z1){const len=Math.hypot(x1-x0,z1-z0),steps=Math.ceil(len/.5);for(let k=1;k<steps;k++){const u=k/steps;if(this.sidewalkBlocked(x0+(x1-x0)*u,z0+(z1-z0)*u))return false;}return true;}
 nextSegment(i){this.transitions++;const s=this.segments[this.segment[i]],list=this.direction[i]>0?s.nextB:s.nextA,options=list.filter(e=>(e>>1)!==this.segment[i]),legal=options.filter(e=>this.allowed(e>>1,(e&1)?-1:1));
  if(legal.length){const e=legal[Math.floor(this.rand(i)*legal.length)];this.segment[i]=e>>1;this.direction[i]=(e&1)?-1:1;}
  else if(this.allowed(this.segment[i],-this.direction[i]))this.direction[i]*=-1;
  else if(options.length){const e=options[Math.floor(this.rand(i)*options.length)];this.segment[i]=e>>1;this.direction[i]=(e&1)?-1:1;this.laneViolations++;}
  else{this.direction[i]*=-1;this.laneViolations++;}
  this.backgroundGoal(i);}
 // Re-join the walk graph on foot from wherever the person is (never relocates).
 attachSegment(i){const x=this.x[i],z=this.z[i],cx=Math.floor(x/8),cz=Math.floor(z/8);let best=-1,bd=Infinity;
  for(let reach=2;reach<=8&&best<0;reach+=3)for(let dz=-reach;dz<=reach;dz++)for(let dx=-reach;dx<=reach;dx++){const set=this.g.segmentHash.get(`${cx+dx},${cz+dz}`);if(!set)continue;for(const s of set){const r=this.segments[s],ux=(r.b[0]-r.a[0])/r.len,uz=(r.b[1]-r.a[1])/r.len,t=Math.max(0,Math.min(r.len,(x-r.a[0])*ux+(z-r.a[1])*uz)),d=Math.hypot(r.a[0]+ux*t-x,r.a[1]+uz*t-z);if(d<bd){bd=d;best=s;}}}
  if(best<0){for(let s=0;s<this.segments.length;s++){const r=this.segments[s],d=Math.hypot(r.a[0]-x,r.a[1]-z);if(d<bd){bd=d;best=s;}}}
  const r=this.segments[best];this.segment[i]=best;this.motion[i]=BACKGROUND;this.poi[i]=-1;this.direction[i]=Math.hypot(...r.b)>Math.hypot(...r.a)?1:-1;if(!this.allowed(best,this.direction[i]))this.direction[i]*=-1;this.backgroundGoal(i);}
 waitSpot(i,corner){const cells=this.h.waitCells[corner],r=cells[Math.floor(this.rand(i)**1.1*cells.length)],W=this.g.rsize,R=this.g.R;return [r%W-R+.2+this.rand(i)*.6,Math.floor(r/W)-R+.2+this.rand(i)*.6];}
 penSpot(i,k,rank){const H=this.h,list=H.pens[k];if(!list.length)return this.waitSpot(i,k);const j=Math.min(list.length-1,Math.floor(rank/HALLOWEEN.penDensity+(this.rand(i)-.5)*6));const r=list[Math.max(0,j)],W=this.g.rsize,R=this.g.R;return [r%W-R+.2+this.rand(i)*.6,Math.floor(r/W)-R+.2+this.rand(i)*.6];}
 chooseCorner(x,z){const H=this.h;let best=-1,bv=Infinity;for(let k=0;k<6;k++){if(this.queueLoad[k]>=H.cornerCap[k]+H.penCap[k])continue;const d=this.field(this.g.walk[k],x,z);if(d>200)continue;const v=d+this.queueLoad[k]/6;if(v<bv){bv=v;best=k;}}return best;}
 recruit(dt){
  this.recruitDebt+=this.quota*dt/this.c.signal.cycle_s;
  if(!this.pool||this.time>=this.poolTime+2-1e-9){this.poolTime=this.time;this.pool=[];this.queueLoad.fill(0);for(let i=0;i<this.n;i++){const m=this.motion[i];if(m===APPROACH||m===WAIT||m===HOLD)this.queueLoad[this.source[i]]++;}for(let i=0;i<this.n;i++){if(this.motion[i]!==BACKGROUND)continue;const x=this.x[i],z=this.z[i],d=x*x+z*z;if(d<900||d>28900)continue;if(this.nearestCorner(x,z)[1]<=200)this.pool.push(i);}}
  while(this.recruitDebt>=1&&this.pool.length){this.recruitDebt-=1;
   const pick=Math.floor(this.random()*this.pool.length),i=this.pool[pick];this.pool[pick]=this.pool.at(-1);this.pool.pop();
   if(this.motion[i]!==BACKGROUND){this.recruitDebt+=1;continue;}
   const best=this.chooseCorner(this.x[i],this.z[i]);
   if(best<0){this.deferred++;this.deferredCycle++;continue;}// queue and pens full: this trip is not part of the modelled demand
   this.queueLoad[best]++;this.motion[i]=APPROACH;this.flag[i]=0;this.source[i]=best;const [wx,wz]=this.waitSpot(i,best);this.gx[i]=wx;this.gz[i]=wz;}
  this.recruitDebt=Math.min(this.recruitDebt,50);}
 // Staged release: police let the front rows go first, then the middle and back.
 beginCycle(){const first=this.cycle<0;this.cycle=Math.floor((this.clock+1e-7)/this.c.signal.cycle_s);
  if(!first)this.last={admitted:this.admitted,completed:this.completed,rescued:this.rescuedCycle,deferred:this.deferredCycle,released:this.releasedCycle??0,cutoffs:this.cutoffsCycle??0};
  this.admitted=0;this.completed=0;this.rescuedCycle=0;this.deferredCycle=0;this.releasedCycle=0;this.cutoffsCycle=0;this.active=0;
  for(let i=0;i<this.n;i++){if(this.motion[i]===CROSS){this.active++;continue;}if(this.motion[i]!==WAIT)continue;
   const c=this.field(this.g.curb,this.x[i],this.z[i]),stage=Math.min(2,Math.floor(c/3.2));this.startCrossing(i,.4+this.rand(i)*1.2+stage*HALLOWEEN.stageGap+Math.min(3.2,c%3.2)*.3);}}
 // Gate control once per simulated second: count, release, compact the pens.
 manage(phase,walkLeft){const H=this.h,P=HALLOWEEN,lists=[[],[],[],[],[],[]];
  for(let i=0;i<this.n;i++)if(this.motion[i]===HOLD)lists[this.source[i]].push(i);
  const second=Math.floor(this.time+1e-6);
  for(let k=0;k<6;k++){const list=lists[k];for(const i of list)this.timer[i]=this.field(this.g.walk[k],this.x[i],this.z[i]);list.sort((a,b)=>this.timer[a]-this.timer[b]);
   const free=H.cornerCap[k]-this.cornerLoad[k];
   const go=phase==='walk'&&walkLeft>P.goUntil,pulse=!go&&free>0&&Math.floor(this.time/P.pulse)%2===0;
   this.gate[k]=go?2:pulse?1:0;
   const count=Math.min(list.length,go?P.walkRelease:pulse?Math.min(free,P.pulseRelease):0);
   for(let j=0;j<count;j++){const i=list[j];this.motion[i]=APPROACH;this.flag[i]=1;const [wx,wz]=this.waitSpot(i,k);this.gx[i]=wx;this.gz[i]=wz;this.held[k]--;this.cornerLoad[k]++;this.released++;this.releasedCycle++;}
   // Stop-and-go: held people step up into the space ahead every 3 s.
   if(second%3===k%3)for(let j=count;j<list.length;j++){const i=list[j];const [x,z]=this.penSpot(i,k,j-count);this.gx[i]=x;this.gz[i]=z;}}}
 step(dt){
  this.stepCount++;this.px.set(this.x);this.pz.set(this.z);
  this.time=Math.round((this.time+dt)*1e6)/1e6;const s=this.c.signal,p=this.clock%s.cycle_s,H=this.h,P=HALLOWEEN;
  if(!(p>=s.walk_s+s.clearance_s-dt-1e-4&&p<s.walk_s+s.clearance_s&&(this.active>0||this.conflictCount()>0)))this.clock=Math.round((this.clock+dt)*1e6)/1e6;
  if(Math.floor((this.clock+1e-7)/s.cycle_s)>this.cycle)this.beginCycle();
  const phase=phaseAt(this.clock,s),walkLeft=s.walk_s-(this.clock%s.cycle_s);
  // Live counts used by the gates (also what the HUD shows).
  const n=this.n;this.held.fill(0);this.cornerLoad.fill(0);this.queued.fill(0);this.poiLoad.fill(0);
  for(let i=0;i<n;i++){const m=this.motion[i];if(m===HOLD)this.held[this.source[i]]++;else if(m===WAIT){this.queued[this.source[i]]++;this.cornerLoad[this.source[i]]++;}else if(m===APPROACH&&this.flag[i])this.cornerLoad[this.source[i]]++;else if(m===ATTEND)this.poiLoad[this.poi[i]]++;}
  let heldNow=0;for(let k=0;k<6;k++)heldNow+=this.held[k];this.heldPeak=Math.max(this.heldPeak,heldNow);
  this.recruit(dt);
  if(Math.floor(this.time+1e-6)!==this.lastManage){this.lastManage=Math.floor(this.time+1e-6);this.manage(phase,walkLeft);}
  const cs=this.ncell,ns=this.nsize,head=this.head,next=this.next,X=this.x,Z=this.z;
  head.fill(-1);for(let i=0;i<n;i++){const a=Math.floor((X[i]+450)/cs),b=Math.floor((Z[i]+450)/cs);if(a>=0&&b>=0&&a<ns&&b<ns){const k=b*ns+a;next[i]=head[k];head[k]=i;}else next[i]=-1;}
  const occ=this.occ,ocap=P.occupancy,key=this.g.key;occ.fill(0);for(let i=0;i<n;i++){const k=key(X[i],Z[i]);if(k>=0&&occ[k]<255)occ[k]++;}
  const obstacles=H.obstacles,OG=H.OG,obsHead=H.obsHead,obsNext=H.obsNext,R=this.g.R,checkPoi=this.stepCount%10;
  for(let i=0;i<n;i++){
   const x=X[i],z=Z[i];let m=this.motion[i],speed=this.speed[i],dx=this.gx[i]-x,dz=this.gz[i]-z,d=Math.sqrt(dx*dx+dz*dz);
   if(m>=EXTRA_MOTION){this.extraAgent(i,x,z,dt,phase,walkLeft);continue;}// subclass-owned walkers (escape.mjs)
   if(m===BACKGROUND){this.leg[i]+=dt;
    // A segment end is "reached" a little early when it is a dead end or already crowded,
    // so walkers flow past junctions instead of converging on one point.
    const sg=this.segment[i],dead=this.direction[i]>0?H.deadB[sg]:H.deadA[sg],gk=key(this.gx[i],this.gz[i]);
    if(d<1.5||(dead&&d<4)||(d<3.5&&gk>=0&&occ[gk]>=2)){this.nextSegment(i);dx=this.gx[i]-x;dz=this.gz[i]-z;d=Math.sqrt(dx*dx+dz*dz);}
    else if(this.leg[i]>8&&this.vx[i]*this.vx[i]+this.vz[i]*this.vz[i]<.04){// Stalled behind a packed crowd: turn back rather than push.
     this.turnbacks++;this.direction[i]*=-1;this.backgroundGoal(i);dx=this.gx[i]-x;dz=this.gz[i]-z;d=Math.sqrt(dx*dx+dz*dz);}
    speed*=.85;
    // Peripheral events: passers-by may stop to watch, take a photo, shop or drop rubbish.
    if(i%10===checkPoi)for(let q=0;q<H.pois.length;q++){const o=H.pois[q],ex=x-o.x,ez=z-o.z;if(ex*ex+ez*ez>(o.r1+7)**2||this.poiLoad[q]>=o.cap||this.rand(i)>o.rate)continue;
     const spot=o.ring[Math.floor(this.rand(i)*o.ring.length)],sx=spot[0]-.3+this.rand(i)*.6,sz=spot[1]-.3+this.rand(i)*.6,sk=key(sx,sz);if(sk<0||occ[sk]>=2||!this.walkLine(x,z,sx,sz))continue;
     this.motion[i]=m=ATTEND;this.poi[i]=q;this.poiLoad[q]++;this.gx[i]=sx;this.gz[i]=sz;this.timer[i]=o.dwell[0]+this.rand(i)*(o.dwell[1]-o.dwell[0]);dx=sx-x;dz=sz-z;d=Math.hypot(dx,dz);break;}}
   else if(m===APPROACH){const k=this.source[i],route=this.g.walk[k],v=this.field(route,x,z);
    if(!this.flag[i]&&v<P.gate)this.flag[i]=1;// passed the police gate without being stopped
    if(!this.flag[i]){const list=H.penV[k],tail=list.length?list[Math.min(list.length-1,Math.floor(this.held[k]/P.penDensity))]:P.gate;
     if(v<=tail+1.5&&(this.held[k]>0||this.cornerLoad[k]>=H.cornerCap[k]||this.gate[k]===0&&phase!=='walk')){this.motion[i]=m=HOLD;const [hx,hz]=this.penSpot(i,k,this.held[k]);this.held[k]++;this.gx[i]=hx;this.gz[i]=hz;dx=hx-x;dz=hz-z;d=Math.hypot(dx,dz);}}
    if(m===APPROACH){
     if(v<=.5&&d<2.5){this.flag[i]=0;if(phase==='walk'&&walkLeft>P.cutoff+2&&this.active<P.maxOnCrossing){this.startCrossing(i,0);m=CROSS;}else this.motion[i]=m=WAIT;}// walks on to its spot behind the line
     else if(v>.5){const dir=this.descend(route,x,z);if(dir){// Inbound lane: keep left on the way in.
      const r=this.g.rkey(x,z),ln=r>=0?H.lane[r]:0,pull=ln===2?.9:ln===1?.2:0;dx=dir[0]+H.laneN[2*r]*pull;dz=dir[1]+H.laneN[2*r+1]*pull;d=Math.hypot(dx,dz);}}}}
   if(m===HOLD){speed=d>.5?.75:0;if(d<=.5){const dir=this.descend(this.g.walk[this.source[i]],x,z);if(dir)this.heading[i]=Math.atan2(dir[0],dir[1]);}}
   else if(m===WAIT){speed=d>.6?.6:0;this.heading[i]=Math.atan2(-x,-z);}
   else if(m===ATTEND){const o=H.pois[this.poi[i]];this.timer[i]-=dt;if(d>.6&&this.timer[i]>0)speed=Math.min(speed,.9);else{speed=0;this.heading[i]=Math.atan2(o.x-x,o.z-z);if(this.timer[i]<=0){this.attachSegment(i);m=this.motion[i];dx=this.gx[i]-x;dz=this.gz[i]-z;d=Math.hypot(dx,dz);speed=this.speed[i]*.85;}}}
   if(m===CROSS){
    this.timer[i]+=dt;
    if(!this.entered[i]&&this.roadBlocked(x,z))this.entered[i]=1;
    if(!this.entered[i]&&(phase!=='walk'||walkLeft<P.cutoff)){// Police cut-off: wait for the next green.
     if(phase==='walk'){this.cutoffs++;this.cutoffsCycle++;}
     this.motion[i]=m=WAIT;this.active--;this.admitted--;const [wx,wz]=this.waitSpot(i,this.source[i]);this.gx[i]=wx;this.gz[i]=wz;speed=.6;}
    else if(this.delay[i]>0){this.delay[i]-=dt;speed=0;}
    else if(this.timer[i]>150&&this.entered[i]){// Last-resort safety valve, reported as `rescued` and never counted (tests require zero).
     const [wx,wz]=this.waitSpot(i,this.destination[i]);X[i]=this.px[i]=wx;Z[i]=this.pz[i]=wz;this.vx[i]=this.vz[i]=0;this.rescued++;this.rescuedCycle++;this.motion[i]=m=LEAVE;this.flag[i]=0;this.active--;this.timer[i]=20;continue;}
    else{const route=this.g.cross[this.destination[i]],v=this.field(route,x,z);
     // Arrived: back on the sidewalk at the destination, or at a neighbouring corner when
     // the crowd there pushed them aside (that corner becomes their destination).
     let arrived=this.entered[i]&&!this.roadBlocked(x,z)&&(v<=2.5||this.field(this.g.walk[this.destination[i]],x,z)<=6);
     if(!arrived&&this.entered[i]&&!this.roadBlocked(x,z)){const [k,w]=this.nearestCorner(x,z);if(k>=0&&w<=6){this.destination[i]=k;arrived=true;}}
     if(arrived){this.motion[i]=m=LEAVE;this.flag[i]=0;this.active--;this.completed++;this.totalCompleted++;this.timer[i]=14+this.rand(i)*80;}
     else if(v<Infinity&&d>2){if(!this.clearLine(x,z,this.gx[i],this.gz[i])){const dir=this.descend(route,x,z);if(dir){dx=dir[0];dz=dir[1];d=1;}}}
     else if(v<Infinity){const dir=this.descend(route,x,z);if(dir){dx=dir[0];dz=dir[1];d=1;}}
     if(phase!=='walk')speed=Math.max(speed,1.55);}
   }
   if(m===LEAVE&&!this.flag[i]){// Out of the corner from the arrival strip, then away on the walk map.
    const exit=H.exits[this.destination[i]],e=this.field(exit,x,z);
    if(e<=1){this.attachSegment(i);m=this.motion[i];dx=this.gx[i]-x;dz=this.gz[i]-z;d=Math.hypot(dx,dz);}else if(e===Infinity)this.flag[i]=1;else{const dir=this.descend(exit,x,z);if(dir){dx=dir[0];dz=dir[1];d=1;}else this.flag[i]=1;}}
   if(m===LEAVE&&this.flag[i]){const route=this.g.walk[this.destination[i]],v=this.field(route,x,z);
    if(v>=this.timer[i]||v===Infinity){this.attachSegment(i);m=this.motion[i];dx=this.gx[i]-x;dz=this.gz[i]-z;d=Math.sqrt(dx*dx+dz*dz);}
    else{const dir=this.descend(route,x,z,-1);if(dir){// Outbound lane: keep left of the way out (the half away from the inbound lane).
      const r=this.g.rkey(x,z),ln=r>=0?H.lane[r]:0,pull=ln===1?.9:ln===2?.25:0;dx=dir[0]-H.laneN[2*r]*pull;dz=dir[1]-H.laneN[2*r+1]*pull;d=Math.hypot(dx,dz);}else{this.attachSegment(i);m=this.motion[i];}}}
   if(m===TRAIN){this.attachSegment(i);m=this.motion[i];}
   const standing=m===WAIT||m===HOLD||(m===ATTEND&&d<=.6);
   this.move(i,x,z,dx,dz,d,speed,standing,m===CROSS||m===LEAVE,m===CROSS&&(phase==='walk'||this.entered[i]),m===CROSS&&this.entered[i]&&phase!=='walk');
  }
  if(this.stepCount%10===0)this.sampleDensity();
 }
 // Hook for subclass-owned motion codes (≥ EXTRA_MOTION): called once per step instead of the
 // built-in behaviours, with the same occupancy grid and neighbour hash. No-op here.
 extraAgent(i,x,z,dt,phase,walkLeft){}
 // One walker's motion for this step: look-ahead around full square metres, social force
 // (same parameters as the normal mode), fixed bodies (officers, staff), walls, the
 // carriageway rule and the hard occupancy limit. Shared by the dispersal scenario.
 move(i,x,z,dx,dz,d,speed,standing,moving,mayCross,hurry,ocap=HALLOWEEN.occupancy,pass=false){
  if(pass){const l=d>.05?1/d:0;this.ddx[i]=dx*l;this.ddz[i]=dz*l;}// desired heading, for counter-flow passing
  const X=this.x,Z=this.z,occ=this.occ,key=this.g.key,cs=this.ncell,ns=this.nsize,head=this.head,next=this.next,H=this.h,obstacles=H.obstacles,OG=H.OG,obsHead=H.obsHead,obsNext=H.obsNext,R=this.g.R;
  // Look-ahead: veer left (Japan keeps left), else right, around a crowded square metre ahead
  // (not when clearing the carriageway after the green: then the curb is the only way).
  if(d>.05&&speed>0&&!standing&&!hurry){const fx=dx/d,fz=dz/d,ahead=key(x+fx*1.2,z+fz*1.2);if(ahead>=0&&occ[ahead]>=3){
   const c=.82,sn=.57,lx=fx*c+fz*sn,lz=fz*c-fx*sn,rx=fx*c-fz*sn,rz=fz*c+fx*sn,kl=key(x+lx*1.2,z+lz*1.2),kr=key(x+rx*1.2,z+rz*1.2);
   if(kl>=0&&occ[kl]<3){dx=lx;dz=lz;d=1;}else if(kr>=0&&occ[kr]<3){dx=rx;dz=rz;d=1;}}}
  // Social force (same parameters as the normal mode).
  const ux=d>.05?dx/d*speed:0,uz=d>.05?dz/d*speed:0;let ax=(ux-this.vx[i])/.5,az=(uz-this.vz[i])/.5,rx=0,rz=0,count=0;
  const a=Math.floor((x+450)/cs),b=Math.floor((z+450)/cs),still=this.still;
  for(let zz=Math.max(0,b-1);zz<=Math.min(ns-1,b+1);zz++)for(let xx=Math.max(0,a-1);xx<=Math.min(ns-1,a+1);xx++)for(let j=head[zz*ns+xx];j>=0&&count<20;j=next[j]){if(j===i)continue;const ex=x-X[j],ez=z-Z[j],r2=ex*ex+ez*ez;if(r2>2.56)continue;count++;const r=Math.sqrt(Math.max(1e-4,r2)),sj=still[this.motion[j]],f=Math.min(6,2*Math.exp((.5-r)/.3))*(moving&&sj?.12:standing&&!sj?1.6:1);rx+=ex/r*f;rz+=ez/r*f;}
  // Officers and event staff are fixed bodies.
  {const oa=Math.floor((x+R)/2),ob=Math.floor((z+R)/2);if(oa>0&&ob>0&&oa<OG-1&&ob<OG-1)for(let zz=ob-1;zz<=ob+1;zz++)for(let xx=oa-1;xx<=oa+1;xx++)for(let q=obsHead[zz*OG+xx];q>=0;q=obsNext[q]){const ex=x-obstacles[q][0],ez=z-obstacles[q][1],r2=ex*ex+ez*ez;if(r2>1.44)continue;const r=Math.sqrt(Math.max(1e-4,r2)),f=Math.min(6,2.4*Math.exp((.55-r)/.25));rx+=ex/r*f;rz+=ez/r*f;}}
  const limit=standing?2.2:hurry?1.2:3.5,rep=Math.sqrt(rx*rx+rz*rz),wgt=rep>limit?limit/rep:1;ax+=rx*wgt;az+=rz*wgt;
  for(const [ox,oz] of [[1,0],[-1,0],[0,1],[0,-1]])if(this.blocked(x+ox*.8,z+oz*.8)){ax-=ox*1.5;az-=oz*1.5;}
  let vx=this.vx[i]+ax*this.dt,vz=this.vz[i]+az*this.dt,v=Math.sqrt(vx*vx+vz*vz);const cap=standing?.7:1.95;if(v>cap){vx*=cap/v;vz*=cap/v;v=cap;}
  const blocked=(p,q)=>mayCross?this.crossBlocked(p,q):this.blocked(p,q)||this.roadBlocked(p,q),dt=this.dt;
  let nx=Math.fround(x+vx*dt),nz=Math.fround(z+vz*dt);if(blocked(nx,nz)){if(!blocked(nx,z)){nz=z;vz=0;}else if(!blocked(x,nz)){nx=x;vx=0;}else{nx=x;nz=z;vx=vz=0;}}
  // Hard occupancy limit: a full square metre cannot be entered (the walker waits).
  const k0=key(x,z);let k1=key(nx,nz);
  // Counter-flow passing (dispersal only): shoulder past someone walking the other way.
  if(pass&&k1!==k0&&k1>=0&&occ[k1]===ocap&&this.opposed(i,nx,nz))ocap++;
  if(k1!==k0&&k1>=0&&occ[k1]>=ocap){// Refused: sidestep into a free neighbouring square metre (left first), else wait.
   this.blockedMoves++;const sp=Math.max(.35,Math.hypot(vx,vz)*.7),hx=vx/(Math.hypot(vx,vz)||1),hz=vz/(Math.hypot(vx,vz)||1);let moved=false;
   for(const [c,sn] of SIDESTEP){const tx=hx*c+hz*sn,tz=hz*c-hx*sn,px=Math.fround(x+tx*sp*dt),pz=Math.fround(z+tz*sp*dt),kk=key(px,pz);if(blocked(px,pz))continue;if(kk!==k0&&(kk<0||occ[kk]>=ocap))continue;nx=px;nz=pz;vx=tx*sp;vz=tz*sp;k1=kk;moved=true;break;}
   if(!moved){nx=x;nz=z;vx*=.2;vz*=.2;k1=k0;}}
  if(k1!==k0&&k1>=0){occ[k1]++;if(k0>=0)occ[k0]--;}
  X[i]=nx;Z[i]=nz;this.vx[i]=vx;this.vz[i]=vz;if(v>.15&&!standing)this.heading[i]=Math.atan2(vx,vz);}
 // Someone in the square metre at (x,z) heading the opposite way (desired directions)?
 opposed(i,x,z){const ux=this.ddx[i],uz=this.ddz[i];const cs=this.ncell,ns=this.nsize,a=Math.floor((x+450)/cs),b=Math.floor((z+450)/cs),cx=Math.floor(x),cz=Math.floor(z);
  for(let zz=Math.max(0,b-1);zz<=Math.min(ns-1,b+1);zz++)for(let xx=Math.max(0,a-1);xx<=Math.min(ns-1,a+1);xx++)for(let j=this.head[zz*ns+xx];j>=0;j=this.next[j]){if(j===i||Math.floor(this.x[j])!==cx||Math.floor(this.z[j])!==cz)continue;if(this.ddx[j]*ux+this.ddz[j]*uz<-.5)return true;}
  return false;}
 // Density on 3 m cells of walkable area (sidewalk + scramble). `peak` is the
 // densest cell with at least 4 m² of walkable area; median/p95 are what the
 // people within 120 m of the junction experience (person-weighted).
 sampleDensity(){const H=this.h,DC=H.DC,DN=H.DN,R=this.g.R,cnt=this.dcount,n=this.n;cnt.fill(0);const cell=new Int32Array(n);
  for(let i=0;i<n;i++){const a=Math.floor((this.x[i]+R)/DC),b=Math.floor((this.z[i]+R)/DC);if(a<0||b<0||a>=DN||b>=DN){cell[i]=-1;continue;}const k=b*DN+a;cell[i]=k;if(cnt[k]<65535)cnt[k]++;}
  let peak=0,at=-1,occupied=0;for(let k=0;k<cnt.length;k++){if(!cnt[k])continue;occupied++;const area=H.darea[k];if(area<4)continue;const v=cnt[k]/area;if(v>peak){peak=v;at=k;}}
  const list=[];for(let i=0;i<n;i++){if(cell[i]<0)continue;const x=this.x[i],z=this.z[i];if(x*x+z*z>14400)continue;list.push(cnt[cell[i]]/Math.max(4,H.darea[cell[i]]));}
  list.sort((a,b)=>a-b);const q=f=>list.length?list[Math.min(list.length-1,Math.floor(f*list.length))]:0;
  const mean=list.length?list.reduce((s,v)=>s+v,0)/list.length:0;
  this.density={peak,median:q(.5),p95:q(.95),mean,peakRun:Math.max(this.density?.peakRun??0,peak),cells:occupied,time:this.time,at:at<0?null:[(at%DN+.5)*DC-R,(Math.floor(at/DN)+.5)*DC-R],sample:list.length};}
 snapshot(){const s=super.snapshot(),H=this.h;let held=0,queued=0,attending=0;for(let k=0;k<6;k++){held+=this.held[k];queued+=this.queued[k];}for(const v of this.poiLoad)attending+=v;
  // Recount from the motion codes so the HUD never drifts from the agents themselves.
  let h2=0,a2=0;for(let i=0;i<this.n;i++){const m=this.motion[i];if(m===HOLD)h2++;else if(m===ATTEND)a2++;}
  return {...s,mode:'halloween',held:h2,heldByCorner:Array.from(this.held),queuedByCorner:Array.from(this.queued),attending:a2,gates:Array.from(this.gate),poiLoad:Array.from(this.poiLoad),density:{...this.density},heldPeak:this.heldPeak,released:this.released,cutoffs:this.cutoffs,teleports:this.teleports,laneViolations:this.laneViolations,transitions:this.transitions,turnbacks:this.turnbacks,blockedMoves:this.blockedMoves,cornerCap:H.cornerCap.reduce((a,b)=>a+b,0),penCap:H.penCap.reduce((a,b)=>a+b,0)};}
}
