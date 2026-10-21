// Seeded illustrative event-routing model. Distances in metres; time in seconds.
// Regional corridors/timetables and participation are assumptions, not forecasts.
import {CORNERS} from './simulation.mjs';
export const SETTINGS=Object.freeze({seed:1031,agents:960,horizon_s:1800,promo_start_s:300,event_start_s:300,arrival_window_s:900,central_radius_m:24,cell_m:2.5,extent_m:220,baseline_participation:.30,event_participation:.50,dt:.25});
export const SHOPS=Object.freeze([
 {name:'ひだまり珈琲',en:'Hidamari Coffee',position:[-88,-84]},
 {name:'月あかり書房',en:'Moonlit Books',position:[-110,44]},
 {name:'こはく菓子店',en:'Amber Sweets',position:[60,88]},
]);
export const EVENTS=Object.freeze([
 {name:'神泉',en:'Shinsen',event:'月影コスチューム広場',eventEn:'Moonmask costume contest',position:[-700,210],capacity:150,color:0xffac50,line:'Inokashira',travel_s:95,railShare:.35,exit:[-145,75],corridor:[[-145,75],[-300,100],[-510,240],[-700,210]]},
 {name:'原宿',en:'Harajuku',event:'星くず仮装パレード',eventEn:'Stardust costume parade',position:[220,-1460],capacity:170,color:0xdc8dff,line:'Yamanote',travel_s:150,railShare:.66,exit:[35,-150],corridor:[[35,-150],[140,-450],[330,-900],[220,-1460]]},
 {name:'代々木',en:'Yoyogi',event:'ゴースト・ランタン庭園',eventEn:'Ghost lantern garden',position:[140,-2650],capacity:130,color:0x82e8c7,line:'Yamanote',travel_s:285,railShare:.85,exit:[35,-150],corridor:[[35,-150],[140,-450],[330,-1000],[220,-1460],[60,-2150],[140,-2650]]},
 {name:'表参道',en:'Omotesando',event:'魔法の光さんぽ',eventEn:'Spelllight promenade',position:[1100,-820],capacity:130,color:0xffd473,line:'walk',travel_s:0,railShare:0,exit:[150,-45],corridor:[[150,-45],[350,-240],[700,-470],[1100,-820]]},
 {name:'恵比寿',en:'Ebisu',participation:.40,event:'かぼちゃ屋台村',eventEn:'Pumpkin food-stall village',position:[1000,1420],capacity:180,color:0xff86b3,line:'Yamanote',travel_s:165,railShare:.72,exit:[110,145],corridor:[[110,145],[300,460],[700,900],[1000,1420]]},
]);
export const randomStream=seed=>{let s=seed>>>0;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296;};};
export const signalAt=t=>t%90<34?'green':t%90<41?'flashing':'red';
export function pointOnPath(path,u){
 const lengths=path.slice(1).map((p,i)=>Math.hypot(p[0]-path[i][0],p[1]-path[i][1])),total=lengths.reduce((a,b)=>a+b,0);let d=Math.max(0,Math.min(1,u))*total;
 for(let i=0;i<lengths.length;i++){if(d<=lengths[i]||i===lengths.length-1){const v=d/lengths[i];return[path[i][0]+(path[i+1][0]-path[i][0])*v,path[i][1]+(path[i+1][1]-path[i][1])*v];}d-=lengths[i];}return path.at(-1);
}
export const pathLength=path=>path.slice(1).reduce((d,p,i)=>d+Math.hypot(p[0]-path[i][0],p[1]-path[i][1]),0);
function inside(x,z,ring){let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
export function navigation(plateau){
 const cell=SETTINGS.cell_m,extent=SETTINGS.extent_m,size=extent*2/cell,solid=new Uint8Array(size*size);
 const key=(x,z)=>{const a=Math.floor((x+extent)/cell),b=Math.floor((z+extent)/cell);return a<0||a>=size||b<0||b>=size?-1:b*size+a;};
 const point=k=>[(k%size+.5)*cell-extent,(Math.floor(k/size)+.5)*cell-extent];
 for(const b of plateau.buildings){const xs=b.ring.map(p=>p[0]),zs=b.ring.map(p=>p[1]);for(let z=Math.max(0,Math.floor((Math.min(...zs)+extent)/cell)-1);z<Math.min(size,Math.ceil((Math.max(...zs)+extent)/cell)+1);z++)for(let x=Math.max(0,Math.floor((Math.min(...xs)+extent)/cell)-1);x<Math.min(size,Math.ceil((Math.max(...xs)+extent)/cell)+1);x++){const k=z*size+x,p=point(k);if(inside(...p,b.ring)||[[-.9,0],[.9,0],[0,-.9],[0,.9]].some(([a,c])=>inside(p[0]+a,p[1]+c,b.ring)))solid[k]=1;}}
 const neighbors=k=>{const x=k%size;return[x>0?k-1:-1,x<size-1?k+1:-1,k-size,k+size].filter(j=>j>=0&&j<solid.length&&!solid[j]);};
 const nearest=(p,reachable)=>{let best=-1,d=Infinity;for(let k=0;k<solid.length;k++){if(solid[k]||(reachable&&reachable[k]<0))continue;const q=point(k),dd=(p[0]-q[0])**2+(p[1]-q[1])**2;if(dd<d){best=k;d=dd;}}return best;};
 const field=goal=>{const f=new Int32Array(solid.length).fill(-1),queue=new Int32Array(solid.length);let r=0,w=1;queue[0]=goal;f[goal]=0;while(r<w){const k=queue[r++];for(const j of neighbors(k))if(f[j]<0){f[j]=f[k]+1;queue[w++]=j;}}return f;};
 const center=nearest([0,3]),central=field(center),shops=SHOPS.map(s=>({...s,position:point(nearest(s.position,central))}));
 const goals=[center,...shops.map(s=>key(...s.position))],fields=goals.map(field);
 const entries=[[-130,-90],[-100,110],[100,-50],[80,120]].map(p=>nearest(p,central));
 const plaza=[];for(let k=0;k<solid.length;k++)if(central[k]>=0&&Math.hypot(...point(k))<SETTINGS.central_radius_m-2)plaza.push(k);
 return{cell,size,solid,key,point,neighbors,nearest,field,fields,shops,goals,entries,plaza};
}
export class HalloweenModel{
 constructor(nav,{promotion=false,events=promotion,seed=SETTINGS.seed,agents=SETTINGS.agents}={}){
  this.nav=nav;this.promotion=events;this.seed=seed;this.time=0;this.peak=0;this.visits=0;this.shopVisits=[0,0,0];this.history=[];this.districts=EVENTS.map(()=>0);this.reserved=EVENTS.map(()=>0);this.boardings={Yamanote:0,Inokashira:0};this.modes={walk:0,Yamanote:0,Inokashira:0};this.plazaFields=new Map();
  this.curbTargets=CORNERS.map(p=>nav.point(nav.nearest(p,nav.fields[0])));
  this.exitGoals=EVENTS.map(e=>nav.nearest(e.exit,nav.fields[0]));this.exitFields=this.exitGoals.map(k=>nav.field(k));this.station=nav.nearest([40,70],nav.fields[0]);this.stationField=nav.field(this.station);
  const rand=randomStream(seed),groups=[];
  this.people=Array.from({length:agents},(_,i)=>{
   const group=Math.floor(i/3);if(!groups[group])groups[group]={arrival:Math.floor(rand()*SETTINGS.arrival_window_s),accept:rand(),district:Math.floor(rand()*EVENTS.length),mode:rand()};const g=groups[group],entry=nav.entries[group%nav.entries.length],p=nav.point(entry),plaza=nav.plaza[Math.floor(rand()*nav.plaza.length)];
   return{id:i,group,x:p[0]+(i%3-1)*.25,z:p[1],vx:0,vz:0,heading:0,entry,cell:entry,arrival:g.arrival+(i%3)*2,speed:1.05+rand()*.5,acceleration:.8+rand()*.5,plaza,offset:[(rand()-.5)*1.3,(rand()-.5)*1.3],dwell:650+Math.floor(rand()*400),accept:g.accept,district:g.district,modeChoice:g.mode,stage:'waiting',goal:0,wait:0,redirected:false,decided:false,visited:false,photo:0,phase:rand()*Math.PI*2,journey:0,boardedAt:-1,arrivedAt:-1,mode:'walk'};
  });
 }
 fieldFor(p){if(p.goal===1)return p.mode==='walk'?this.exitFields[p.district]:this.stationField;if(!this.plazaFields.has(p.plaza))this.plazaFields.set(p.plaza,this.nav.field(p.plaza));return this.plazaFields.get(p.plaza);}
 step(){
  const nav=this.nav;
  for(let sub=0;sub<4;sub++){
   this.time+=SETTINGS.dt;const dt=SETTINGS.dt,active=this.people.filter(p=>['walking','plaza'].includes(p.stage)),buckets=new Map();
   const bucket=(x,z)=>`${Math.floor(x/3)},${Math.floor(z/3)}`;
   for(const p of active){const k=bucket(p.x,p.z);if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(p);}
   for(const p of this.people){
    if(p.stage==='gone'||p.stage==='event')continue;
    if(p.stage==='waiting'){if(this.time<p.arrival)continue;p.stage='walking';}
    if(!p.decided&&this.time>=SETTINGS.event_start_s){
     p.decided=true;const e=EVENTS[p.district],threshold=this.promotion?(e.participation??SETTINGS.event_participation):SETTINGS.baseline_participation;
     if(p.accept<threshold&&this.reserved[p.district]<e.capacity){p.redirected=true;this.reserved[p.district]++;p.mode=p.modeChoice<e.railShare?e.line:'walk';if(p.stage==='plaza')p.wait=Math.min(p.wait,35+p.id%60);}
    }
    if(p.stage==='regional'||p.stage==='rail'){
     p.journey+=dt;const e=EVENTS[p.district],path=p.stage==='rail'?[[55,75],...e.corridor.slice(1)]:e.corridor;
     const total=p.stage==='rail'?e.travel_s:pathLength(path)/p.speed;[p.x,p.z]=pointOnPath(path,p.journey/total);
     if(p.journey>=total){p.x=e.position[0];p.z=e.position[1];p.stage='event';p.arrivedAt=this.time;p.visited=true;this.visits++;this.districts[p.district]++;this.modes[p.mode]++;}continue;
    }
    if(p.stage==='platform'){
     const headway=p.mode==='Inokashira'?240:180,offset=p.mode==='Inokashira'?30:0,phase=(this.time-offset)%headway;
     if(phase<dt+.001){p.stage='rail';p.boardedAt=this.time;p.journey=0;this.boardings[p.mode]++;}continue;
    }
    if(p.stage==='plaza'){
     p.wait-=dt;
     if(p.wait<=0){if(!p.redirected){p.stage='gone';continue;}p.goal=1;p.stage='walking';}
    }
    // Distance-field look-ahead plus social force: mutual repulsion and
    // weak same-group attraction. Integrate individual acceleration/velocity.
    let target=p.plaza,f=this.fieldFor(p);if(p.goal===1)target=p.mode==='walk'?this.exitGoals[p.district]:this.station;
    const here=nav.key(p.x,p.z);p.cell=here;let best=here;
    if(p.stage==='walking')for(let j=0;j<4;j++){let next=best;for(const k of nav.neighbors(best))if(f[k]>=0&&f[k]<f[next])next=k;if(next===best)break;best=next;}
    let q=nav.point(p.stage==='plaza'?p.plaza:best);
    // Every plaza group queues at a curb and begins the same green together.
    // Six arms / stable group lanes replace the old stationary circular patch.
    if(p.stage==='plaza'){
     const cycle=Math.floor((this.time+49)/90),green=signalAt(this.time)!=='red';
     const source=(p.group+cycle*3)%6,destination=(source+3)%6;
     const curb=this.curbTargets[green?destination:source],length=Math.hypot(...curb);
     const lane=((p.group*7)%17-8)*.75,depth=1+((p.group*11)%7)*.9;
     q=[curb[0]+curb[0]/length*depth-curb[1]/length*lane,curb[1]+curb[1]/length*depth+curb[0]/length*lane];
     const cell=nav.key(...q);if(cell<0||nav.solid[cell])q=curb;
    }
    let dx=q[0]+p.offset[0]-p.x,dz=q[1]+p.offset[1]-p.z,d=Math.hypot(dx,dz);
    let speed=p.speed;if(signalAt(this.time)==='flashing'&&Math.hypot(p.x,p.z)<22)speed*=1.35;
    if(p.id%23===0&&Math.floor(this.time+p.id)%115<6&&Math.hypot(p.x,p.z)>19){speed=0;p.photo=1;}else p.photo=0;
    if(signalAt(this.time)==='red'&&Math.hypot(p.x,p.z)>22&&Math.hypot(...q)<22&&p.goal===0)speed=0;
    const desired=p.stage==='plaza'?Math.min(speed,d):speed;let ax=((d>.05?dx/d*desired:0)-p.vx)/.8,az=((d>.05?dz/d*desired:0)-p.vz)/.8;
    const bx=Math.floor(p.x/3),bz=Math.floor(p.z/3);
    for(let ix=-1;ix<=1;ix++)for(let iz=-1;iz<=1;iz++)for(const other of buckets.get(`${bx+ix},${bz+iz}`)||[]){
     if(other===p)continue;const rx=p.x-other.x,rz=p.z-other.z,r=Math.hypot(rx,rz),safe=Math.max(.05,r);if(r<2.6){const force=1.35*Math.exp((.8-r)/.7);ax+=rx/safe*force;az+=rz/safe*force;if(other.group===p.group&&r>1.2){ax-=rx*.16;az-=rz*.16;}}
    }
    const force=Math.hypot(ax,az),limit=p.acceleration;if(force>limit){ax*=limit/force;az*=limit/force;}
    p.vx+=ax*dt;p.vz+=az*dt;const v=Math.hypot(p.vx,p.vz),max=speed*1.15+.15;if(v>max){p.vx*=max/v;p.vz*=max/v;}
    const nx=p.x+p.vx*dt,nz=p.z+p.vz*dt,k=nav.key(nx,nz);
    if(k>=0&&!nav.solid[k]){p.x=nx;p.z=nz;}else{p.vx*=.1;p.vz*=.1;}
    if(Math.hypot(p.vx,p.vz)>.08){const heading=Math.atan2(p.vx,p.vz),delta=Math.atan2(Math.sin(heading-p.heading),Math.cos(heading-p.heading));p.heading+=delta*Math.min(1,dt*3);}
    if(p.stage==='walking'&&Math.hypot(p.x-nav.point(target)[0],p.z-nav.point(target)[1])<3){
     if(p.goal===1){p.stage=p.mode==='walk'?'regional':'platform';p.journey=0;p.vx=p.vz=0;}
     else{p.stage='plaza';p.wait=p.redirected?35+p.id%60:p.dwell;}
    }
   }
  }
  const s=this.snapshot();this.peak=Math.max(this.peak,s.central_count);if(this.time%30===0)this.history.push({time_s:this.time,central_count:s.central_count,district_people:[...this.districts],boardings:{...this.boardings}});return s;
 }
 advanceTo(seconds){if(!Number.isInteger(seconds)||seconds<this.time||seconds>SETTINGS.horizon_s)throw Error('advanceTo requires monotonic whole seconds within horizon');while(this.time<seconds)this.step();return this.snapshot();}
 snapshot(){const active=this.people.filter(p=>p.stage!=='waiting'&&p.stage!=='gone'),central_count=active.filter(p=>Math.hypot(p.x,p.z)<SETTINGS.central_radius_m).length;return{time_s:this.time,central_count,density:central_count/(Math.PI*SETTINGS.central_radius_m**2),peak_central_count:Math.max(this.peak,central_count),visits:this.visits,district_people:[...this.districts],boardings:{...this.boardings},arrival_modes:{...this.modes},active:active.length,waiting:this.people.filter(p=>p.stage==='waiting').length,gone:this.people.filter(p=>p.stage==='gone').length,signal:signalAt(this.time)};}
 metrics(){const s=this.snapshot();return{...s,peak_density_per_m2:Number((s.peak_central_count/(Math.PI*SETTINGS.central_radius_m**2)).toFixed(4)),history:this.history};}
}
export function experiment(plateau,seed=SETTINGS.seed){
 const nav=navigation(plateau),no=new HalloweenModel(nav,{seed}),events=new HalloweenModel(nav,{events:true,seed});no.advanceTo(SETTINGS.horizon_s);events.advanceTo(SETTINGS.horizon_s);const a=no.metrics(),b=events.metrics(),best=b.district_people.indexOf(Math.max(...b.district_people)),lifts=b.district_people.map((n,i)=>n-a.district_people[i]),liftBest=lifts.indexOf(Math.max(...lifts));
 return{schema:3,notice:'トイモデルの値 / toy-model values. Fictional events and assumed behaviour, not a forecast or causal evidence.',settings:{...SETTINGS,seed},definitions:{density:'Individual centres within 24m of crossing / (pi * 24² m²). Maximum of whole-second samples over full paired 1800s runs.',visits:'Unique actual district arrivals by 1800s, including completed walking and rail journeys; excludes people still travelling.',events:'Common arrivals, groups, speeds and tastes. Decisions from 300s: 30% baseline versus 50% event participation (40% Ebisu), subject to per-event capacity. No shop coupon intervention.',movement:'0.25s social-force steps with mutual avoidance, per-person speed/acceleration, group cohesion, photo pauses, late jogging, smooth heading. All plaza groups queue at six curbs and start on green. Central paths avoid PLATEAU footprints. Regional corridors are schematic, distances in metres.',rail:'Assumed 180s Yamanote / 240s Inokashira headways; wait at station, actual boarding then 95–285s travel. Rail corridors/stations schematic; no timetable or operational prediction.'},events:EVENTS,no_events:a,events_on:b,best_event:{criterion:'most completed arrivals',district:EVENTS[best].en,event:EVENTS[best].eventEn,people:b.district_people[best]},largest_lift:{criterion:'additional completed arrivals',district:EVENTS[liftBest].en,people:lifts[liftBest]},district_lifts:lifts,density_change_pct:Number(((b.peak_central_count/a.peak_central_count-1)*100).toFixed(1)),attendance_ratio:Number((b.visits/a.visits).toFixed(3))};
}
