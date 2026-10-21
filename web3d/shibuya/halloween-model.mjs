// Authored illustrative routing experiment. Metres/seconds; fixed one-second ticks.
// It is deliberately separate from the calibrated-scale physical crossing solver.
export const SETTINGS=Object.freeze({seed:1031,agents:960,horizon_s:900,promo_start_s:300,arrival_window_s:600,central_radius_m:24,cell_m:2.5,extent_m:220});
export const SHOPS=Object.freeze([
 {name:'ひだまり珈琲',en:'Hidamari Coffee',position:[-88,-84],offer:'かぼちゃラテ1杯プレゼント',offerEn:'Free pumpkin latte · take the scenic route',kind:'distance'},
 {name:'月あかり書房',en:'Moonlit Books',position:[-110,44],offer:'3分後から使える栞クーポン',offerEn:'Bookmark coupon opens in 3 minutes',kind:'time-shift'},
 {name:'こはく菓子店',en:'Amber Sweets',position:[60,88],offer:'10分限定、焼き菓子セット',offerEn:'A 10-minute baked treat offer',kind:'distance'},
]);
export function randomStream(seed){let s=seed>>>0;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296;};}
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
 constructor(nav,{promotion=false,seed=SETTINGS.seed,agents=SETTINGS.agents}={}){
  this.nav=nav;this.promotion=promotion;this.seed=seed;this.time=0;this.peak=0;this.visits=0;this.shopVisits=[0,0,0];this.history=[];
  const rand=randomStream(seed);this.people=Array.from({length:agents},(_,i)=>{const entry=nav.entries[i%nav.entries.length],p=nav.point(entry),plaza=nav.plaza[Math.floor(rand()*nav.plaza.length)];return{id:i,x:p[0],z:p[1],cell:entry,entry,arrival:Math.floor(rand()*SETTINGS.arrival_window_s),speed:1.05+rand()*.45,plaza,dwell:330+Math.floor(rand()*300),accept:rand(),shift:rand(),shop:Math.floor(rand()*SHOPS.length),stage:'waiting',goal:0,wait:0,redirected:false,visited:false};});
  // Cached individual plaza distance fields avoid any building intersections.
  this.plazaFields=new Map();
 }
 fieldFor(p){if(p.goal>0)return this.nav.fields[p.goal];if(!this.plazaFields.has(p.plaza))this.plazaFields.set(p.plaza,this.nav.field(p.plaza));return this.plazaFields.get(p.plaza);}
 step(){this.time++;
  for(const p of this.people){
   if(p.stage==='gone')continue;
   const promo=this.promotion&&this.time>=SETTINGS.promo_start_s;
   if(promo&&!p.redirected&&!p.visited&&p.accept<.82){p.redirected=true;p.goal=p.shop+1;if(p.stage==='waiting'&&p.shift<.3)p.arrival+=180;else if(p.stage==='plaza')p.stage='walking';}
   if(p.stage==='waiting'){if(this.time<p.arrival)continue;p.stage='walking';}
   if(p.stage==='shopping'){if(--p.wait<=0)p.stage='gone';continue;}
   if(p.stage==='plaza'){if(--p.wait>0)continue;p.goal=p.accept<.1?p.shop+1:-1;p.stage='walking';}
   if(p.goal===-1){p.stage='gone';continue;}
   let remaining=p.speed;
   const f=this.fieldFor(p),target=p.goal>0?this.nav.goals[p.goal]:p.plaza;
   while(remaining>1e-7){
    const q=this.nav.point(p.cell),dx=q[0]-p.x,dz=q[1]-p.z,d=Math.hypot(dx,dz);
    if(d>.0001){const travel=Math.min(d,remaining);p.x+=dx/d*travel;p.z+=dz/d*travel;remaining-=travel;if(travel<d)break;}
    if(p.cell===target){if(p.goal>0){p.stage='shopping';p.wait=45;p.visited=true;this.visits++;this.shopVisits[p.shop]++;}else{p.stage='plaza';p.wait=p.dwell;}break;}
    let best=p.cell;for(const j of this.nav.neighbors(p.cell))if(f[j]>=0&&f[j]<f[best])best=j;
    if(best===p.cell)throw Error(`Unreachable route ${p.id}`);p.cell=best;
   }
  }
  const s=this.snapshot();this.peak=Math.max(this.peak,s.central_count);if(this.time%30===0)this.history.push({time_s:this.time,central_count:s.central_count,visits:this.visits});return s;
 }
 advanceTo(seconds){if(!Number.isInteger(seconds)||seconds<this.time||seconds>SETTINGS.horizon_s)throw Error('advanceTo requires a monotonic whole second within the horizon');while(this.time<seconds)this.step();return this.snapshot();}
 snapshot(){const active=this.people.filter(p=>p.stage!=='waiting'&&p.stage!=='gone'),central_count=active.filter(p=>Math.hypot(p.x,p.z)<SETTINGS.central_radius_m).length;return{time_s:this.time,central_count,density:central_count/(Math.PI*SETTINGS.central_radius_m**2),peak_central_count:Math.max(this.peak,central_count),visits:this.visits,shop_visits:[...this.shopVisits],active:active.length,waiting:this.people.filter(p=>p.stage==='waiting').length,gone:this.people.filter(p=>p.stage==='gone').length};}
 metrics(){const s=this.snapshot();return{...s,peak_density_per_m2:Number((s.peak_central_count/(Math.PI*SETTINGS.central_radius_m**2)).toFixed(4)),history:this.history};}
}
export function experiment(plateau,seed=SETTINGS.seed){const nav=navigation(plateau),no=new HalloweenModel(nav,{seed}),promo=new HalloweenModel(nav,{promotion:true,seed});no.advanceTo(SETTINGS.horizon_s);promo.advanceTo(SETTINGS.horizon_s);return{schema:1,notice:'トイモデルの値 / toy-model values. Uncalibrated routing assumptions, not a prediction or causal evidence.',settings:{...SETTINGS,seed},definitions:{density:'Active individual centres inside a 24 m radius disk at the junction / (pi * 24^2 m²); peak sampled every simulated second over 0–900 s.',visits:'Distinct individuals who physically reach a fictional shop destination by 900 s; at most one visit per individual.',promotion:'At 300 s, 82% acceptance assumption diverts to 3 farther shops; 30% of accepting not-yet-arrived agents defer 180 s. Others keep their original arrival. No capacity or economic calibration.',movement:'1.05–1.50 m/s grid routes avoiding the unchanged building footprints, pedestrian-only illustrative scenario. No vehicles, physical pressure, collision or crowd-safety model.'},shops:nav.shops,no_promo:no.metrics(),promo:promo.metrics()};}
