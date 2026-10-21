// Individual agents in metre coordinates. No density/fluid solver.
export const CORNERS=[[-28,-14],[-5,-22],[21,-7],[18,12],[5,20],[-23,14]];
export function phaseAt(t,c){const p=((t%c.cycle_s)+c.cycle_s)%c.cycle_s;return p<c.walk_s?'walk':p<c.walk_s+c.clearance_s?'clearance':p<c.cycle_s-c.all_red_s?'vehicles':'all-red';}
export function demandAt(hour,c,peak=false){const h=((hour%24)+24)%24,i=Math.floor(h),w=c.hourly_weights;let rate=c.station_event_proxy*c.street_capture_assumption*(w[i]*(1-h%1)+w[(i+1)%24]*(h%1))/w.reduce((a,b)=>a+b,0)*c.signal.cycle_s/3600;if(peak)rate*=c.peak_phase_target/(c.station_event_proxy*c.street_capture_assumption*Math.max(...w)/w.reduce((a,b)=>a+b,0)*c.signal.cycle_s/3600);return rate;}
export function trainPhaseAt(t,line){const q=((t-line.offset_s)%line.headway_s+line.headway_s)%line.headway_s;return {visible:q<55||q>line.headway_s-22,travel:q<20?0:q<55?-(q-20)*12:(line.headway_s-q)/22*400};}
function inside(x,z,ring){let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
export class Simulation{
 constructor(config,osm,plateau){
  this.config=config;this.c=config.calibration;this.n=config.agents;this.seed=config.seed>>>0;this.time=0;this.clock=0;this.accumulator=0;this.promo=true;this.admitted=0;this.completed=0;this.totalCompleted=0;this.trainWaves=[0,0];this.lastTrain=[-1,-1];this.cycle=-1;this.active=0;this.primary=Math.min(this.n,6000);this.cursor=0;
  for(const key of ['x','z','vx','vz','gx','gz','speed','lane'])this[key]=new Float32Array(this.n);
  for(const key of ['state','motion','source','destination'])this[key]=new Uint8Array(this.n);
  this.segment=new Int32Array(this.n);this.direction=new Int8Array(this.n);this.randomState=new Uint32Array(this.n);
  this.cell=2.5;this.size=360;this.offset=450;this.head=new Int32Array(this.size*this.size);this.next=new Int32Array(this.n);this.solid=new Uint8Array(this.size*this.size);
  for(const b of plateau.buildings){const ring=b.ring;const xx=ring.map(p=>p[0]),zz=ring.map(p=>p[1]);const minX=Math.max(0,Math.floor((Math.min(...xx)+this.offset)/this.cell)),maxX=Math.min(this.size-1,Math.ceil((Math.max(...xx)+this.offset)/this.cell)),minZ=Math.max(0,Math.floor((Math.min(...zz)+this.offset)/this.cell)),maxZ=Math.min(this.size-1,Math.ceil((Math.max(...zz)+this.offset)/this.cell));for(let j=minZ;j<=maxZ;j++)for(let i=minX;i<=maxX;i++)if(inside((i+.5)*this.cell-this.offset,(j+.5)*this.cell-this.offset,ring))this.solid[j*this.size+i]=1;}
  // Static shortest-path distance to each sidewalk corner, for obstacle detours.
  // This is routing geometry, not a crowd-density field: every person still
  // integrates its own velocity, force, random stream and funnel state.
  this.routes=CORNERS.map(p=>{const distances=new Int32Array(this.solid.length).fill(-1),queue=new Int32Array(this.solid.length);let start=this.key(...p),read=0,write=0;distances[start]=0;queue[write++]=start;while(read<write){const k=queue[read++],x=k%this.size;for(const j of [x>0?k-1:-1,x<this.size-1?k+1:-1,k-this.size,k+this.size])if(j>=0&&j<distances.length&&!this.solid[j]&&distances[j]<0){distances[j]=distances[k]+1;queue[write++]=j;}}return distances;});
  this.exitGoals=CORNERS.map(p=>{const len=Math.hypot(...p),ux=p[0]/len,uz=p[1]/len,goals=[];for(let z=-12;z<=12;z+=1.25)for(let x=-12;x<=12;x+=1.25){const outward=x*ux+z*uz;if(outward>=3&&outward<=9&&Math.abs(-x*uz+z*ux)<=10&&!this.blocked(p[0]+x,p[1]+z))goals.push([p[0]+x,p[1]+z]);}if(!goals.length)throw Error('No walkable destination apron');return goals;});
  this.segments=[];
  for(const road of osm.roads){if(!['footway','pedestrian','path','living_street'].includes(road.kind)||Number(road.tags.layer||0)<0||road.tags.indoor==='yes'||road.tags.tunnel==='yes'||road.tags.footway==='crossing')continue;for(let k=1;k<road.points.length;k++){const a=road.points[k-1],b=road.points[k],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<7||len>180)continue;const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];if(Math.hypot(...mid)<38||this.blocked(...mid))continue;this.segments.push({a,b,len,width:road.kind==='pedestrian'?5:2});}}
  if(!this.segments.length)throw Error('No outdoor walking segments');
  for(let i=0;i<this.n;i++){this.randomState[i]=(this.seed+Math.imul(i+1,2654435761))>>>0;this.speed[i]=1.05+this.rand(i)*.60;this.lane[i]=(this.rand(i)-.5)*7;this.placeBackground(i);if(i<this.primary){this.source[i]=i%6;this.placeQueue(i,i%6);}}
  this.beginCycle();
 }
 rand(i){let s=this.randomState[i];s^=s<<13;s^=s>>>17;s^=s<<5;this.randomState[i]=s>>>0;return(s>>>0)/4294967296;}
 key(x,z){const a=Math.floor((x+this.offset)/this.cell),b=Math.floor((z+this.offset)/this.cell);return a<0||b<0||a>=this.size||b>=this.size?-1:b*this.size+a;}
 blocked(x,z){const k=this.key(x,z);return k<0||this.solid[k]===1;}
 placeBackground(i){const s=Math.floor(this.rand(i)*this.segments.length);this.segment[i]=s;this.motion[i]=3;this.direction[i]=this.rand(i)<.5?1:-1;const r=this.segments[s],u=this.rand(i),dx=(r.b[0]-r.a[0])/r.len,dz=(r.b[1]-r.a[1])/r.len,off=(this.rand(i)-.5)*r.width;this.x[i]=r.a[0]+u*(r.b[0]-r.a[0])-dz*off;this.z[i]=r.a[1]+u*(r.b[1]-r.a[1])+dx*off;if(this.blocked(this.x[i],this.z[i])){this.x[i]=r.a[0]+u*(r.b[0]-r.a[0]);this.z[i]=r.a[1]+u*(r.b[1]-r.a[1]);}this.backgroundGoal(i);}
 backgroundGoal(i){const s=this.segments[this.segment[i]],p=this.direction[i]>0?s.b:s.a;this.gx[i]=p[0];this.gz[i]=p[1];}
 placeQueue(i,corner){const p=CORNERS[corner],r=Math.hypot(...p),dx=p[0]/r,dz=p[1]/r;let x=p[0],z=p[1];for(let k=0;k<35;k++){const back=1+this.rand(i)*24,lateral=(this.rand(i)-.5)*21;x=p[0]+dx*back-dz*lateral;z=p[1]+dz*back+dx*lateral;if(!this.blocked(x,z))break;}if(this.blocked(x,z)){x=p[0];z=p[1];}this.x[i]=x;this.z[i]=z;this.gx[i]=x;this.gz[i]=z;this.motion[i]=0;}
 beginCycle(){this.cycle=Math.floor((this.clock+1e-7)/this.c.signal.cycle_s);this.admitted=0;this.completed=0;this.quota=Math.min(this.primary,Math.round(demandAt(this.config.hour,this.c,this.config.peak)));this.cursor=(this.cursor+this.quota)%Math.max(1,this.primary);for(let j=0;j<this.quota;j++){const i=(this.cursor+j)%this.primary;if(this.motion[i]===1)continue;let nearest=0,d=Infinity;for(let k=0;k<6;k++){const p=CORNERS[k],dd=(this.x[i]-p[0])**2+(this.z[i]-p[1])**2;if(dd<d){d=dd;nearest=k;}}this.source[i]=nearest;this.destination[i]=(nearest+2+Math.floor(this.rand(i)*3))%6;const goal=CORNERS[this.destination[i]],length=Math.hypot(...goal),ux=goal[0]/length,uz=goal[1]/length,tx=goal[0]+ux*6-uz*this.lane[i],tz=goal[1]+uz*6+ux*this.lane[i];let best=Infinity;for(const p of this.exitGoals[this.destination[i]]){const d=(p[0]-tx)**2+(p[1]-tz)**2;if(d<best){best=d;this.gx[i]=p[0];this.gz[i]=p[1];}}this.motion[i]=1;this.admitted++;}this.active=this.admitted;}
 advance(seconds){if(!Number.isFinite(seconds)||seconds<0||seconds>60)throw Error('advance expects 0..60 seconds');this.accumulator+=seconds;while(this.accumulator>=.1-1e-8){this.step(.1);this.accumulator-=.1;}return this.snapshot();}
 step(dt){
  this.time+=dt;const s=this.c.signal,p=this.clock%s.cycle_s;
  // Shared signal clock pauses BEFORE vehicle release until every admitted walker clears.
  if(!(p>=s.walk_s+s.clearance_s-.10001&&p<s.walk_s+s.clearance_s&&this.active>0))this.clock+=dt;
  if(Math.floor((this.clock+1e-7)/s.cycle_s)>this.cycle)this.beginCycle();
  
  this.c.trains.forEach((line,k)=>{const wave=Math.floor((this.time-line.offset_s-line.walk_delay_s)/line.headway_s);if(wave>=0&&wave>this.lastTrain[k]){this.lastTrain[k]=wave;this.trainWaves[k]++;const count=Math.min(line.alight_wave_agents,Math.max(0,this.n-this.primary));for(let j=0;j<count;j++){const i=this.primary+(wave*197+k*97+j)%Math.max(1,this.n-this.primary); // Existing identities emerge from the exit; no extra particles.
    if(this.state[i]===3)continue;this.x[i]=8+(this.rand(i)-.5)*10;this.z[i]=46+this.rand(i)*20;this.gx[i]=5+(this.rand(i)-.5)*8;this.gz[i]=23;let nearest=0,best=Infinity;for(let k=0;k<this.segments.length;k++){const s=this.segments[k],d=(s.a[0]-5)**2+(s.a[1]-23)**2;if(d<best){best=d;nearest=k;}}this.segment[i]=nearest;this.motion[i]=4;}}});
  this.head.fill(-1);for(let i=0;i<this.n;i++){const k=this.key(this.x[i],this.z[i]);if(k>=0){this.next[i]=this.head[k];this.head[k]=i;}}
  for(let i=0;i<this.n;i++){
   let x=this.x[i],z=this.z[i],dx=this.gx[i]-x,dz=this.gz[i]-z,d=Math.hypot(dx,dz),speed=this.speed[i];
   if(this.motion[i]===0)speed=0;
   const corner=CORNERS[this.destination[i]];
   if(this.motion[i]===1&&(d<4||Math.hypot(x-corner[0],z-corner[1])<4.5)&&(x-corner[0])*corner[0]+(z-corner[1])*corner[1]>Math.hypot(...corner)){this.motion[i]=2;this.active--;this.completed++;this.totalCompleted++;const goal=corner,len=Math.hypot(...goal);this.gx[i]=goal[0]+goal[0]/len*12+this.lane[i];this.gz[i]=goal[1]+goal[1]/len*12;}
   if(this.motion[i]===1&&Math.hypot(x-corner[0],z-corner[1])>10){const key=this.key(x,z),field=this.routes[this.destination[i]];if(key>=0){let best=key,value=field[key];const cx=key%this.size,cz=Math.floor(key/this.size);for(let zz=Math.max(0,cz-1);zz<=Math.min(this.size-1,cz+1);zz++)for(let xx=Math.max(0,cx-1);xx<=Math.min(this.size-1,cx+1);xx++){const j=zz*this.size+xx;if(field[j]>=0&&(value<0||field[j]<value)){best=j;value=field[j];}}if(best!==key){dx=(best%this.size+.5)*this.cell-this.offset-x;dz=(Math.floor(best/this.size)+.5)*this.cell-this.offset-z;d=Math.hypot(dx,dz);}}}
   if(this.motion[i]===2&&d<3){this.motion[i]=0;this.gx[i]=x;this.gz[i]=z;}
   if(this.motion[i]===4&&d<3){this.motion[i]=3;this.backgroundGoal(i);}
   if(i>=this.primary&&this.motion[i]===3&&d<2){this.direction[i]*=-1;this.backgroundGoal(i);dx=this.gx[i]-x;dz=this.gz[i]-z;d=Math.hypot(dx,dz);}
   // Departures are admitted only in beginCycle; they always keep clearing on red.
   if(this.state[i]===2&&i>=this.primary&&Math.hypot(x+46,z+42)<32){this.gx[i]=-46;this.gz[i]=-42;this.motion[i]=5;dx=this.gx[i]-x;dz=this.gz[i]-z;d=Math.hypot(dx,dz);}
   if(this.motion[i]===5&&d<3){this.state[i]=3;this.motion[i]=6;speed=0;}
   if(this.motion[i]===6)speed=0;
   const exposure=Math.hypot(x+46,z+42)<75,draw=this.rand(i);
   if(this.state[i]===0&&exposure&&draw<(this.promo?.04:.002)*dt)this.state[i]=1;
   else if(this.state[i]===1&&draw<(this.promo?.012:.001)*dt)this.state[i]=2;
   let ax=((d>.05?dx/d*speed:0)-this.vx[i])/.5,az=((d>.05?dz/d*speed:0)-this.vz[i])/.5;
   const k=this.key(x,z);let neighbors=0;
   if(k>=0){const cx=k%this.size,cz=Math.floor(k/this.size);for(let zz=Math.max(0,cz-1);zz<=Math.min(this.size-1,cz+1)&&neighbors<32;zz++)for(let xx=Math.max(0,cx-1);xx<=Math.min(this.size-1,cx+1)&&neighbors<32;xx++)for(let j=this.head[zz*this.size+xx];j>=0&&neighbors<32;j=this.next[j]){if(i===j)continue;const rx=x-this.x[j],rz=z-this.z[j],r2=rx*rx+rz*rz;if(r2>5.76)continue;neighbors++;const r=Math.sqrt(Math.max(.0001,r2)),force=Math.min(8,2.1*Math.exp((.46-r)/.32));ax+=rx/r*force;az+=rz/r*force;}}
   // Building boundary repulsion from the local footprint occupancy raster.
   for(const [ox,oz] of [[1,0],[-1,0],[0,1],[0,-1]])if(this.blocked(x+ox*1.2,z+oz*1.2)){ax-=ox*3;az-=oz*3;}
   let vx=this.vx[i]+ax*dt,vz=this.vz[i]+az*dt,v=Math.hypot(vx,vz);if(v>1.95){vx*=1.95/v;vz*=1.95/v;}
   let nx=x+vx*dt,nz=z+vz*dt;if(this.blocked(nx,nz)){if(!this.blocked(nx,z)){nz=z;vz=0;}else if(!this.blocked(x,nz)){nx=x;vx=0;}else{nx=x;nz=z;vx=vz=0;}}
   this.x[i]=nx;this.z[i]=nz;this.vx[i]=vx;this.vz[i]=vz;
  }
 }
 snapshot(){const positions=new Float32Array(this.n*2),states=this.state.slice(),funnel=[0,0,0,0];for(let i=0;i<this.n;i++){positions[2*i]=this.x[i];positions[2*i+1]=this.z[i];funnel[this.state[i]]++;}return {positions,states,time:this.time,clock:this.clock,phase:phaseAt(this.clock,this.c.signal),active:this.active,admitted:this.admitted,completed:this.completed,totalCompleted:this.totalCompleted,quota:this.quota,funnel,trainWaves:this.trainWaves.slice(),clearanceHold:this.active>0&&this.clock%this.c.signal.cycle_s>=this.c.signal.walk_s+this.c.signal.clearance_s-.10001};}
}
