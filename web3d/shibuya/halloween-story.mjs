import {SHOPS} from './halloween-model.mjs';
export const DURATION=18, FPS=24;
export const STILL_FRAMES=[12,132,240,336,384,408,431];
export const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
const mix=(a,b,u)=>a.map((v,i)=>v+(b[i]-v)*u);
// One authored camera path shared by WebGL and the geometry exporter.
export function cameraAt(seconds,fixed=false){
 const opening={position:[-112,196,-130],target:[-4,20,1]};
 const wide={position:[-166,255,-170],target:[-4,4,1]};
 const pan={position:[-120,248,-186],target:[-4,4,1]};
 const shop={position:[-205,218,-225],target:[-74,9,-63]};
 if(fixed)return pan;
 let a,b,u;
 if(seconds<1.5){a=opening;b=wide;u=smooth(seconds/1.5);}
 else if(seconds<6){a=wide;b=pan;u=smooth((seconds-1.5)/4.5);}
 else if(seconds<12){a=pan;b=shop;u=smooth((seconds-6)/6);}
 else if(seconds<16.75){a=shop;b=pan;u=smooth((seconds-12)/3.5);}
 else {a=pan;b=opening;u=smooth((seconds-16.75)/.75);}
 return{position:mix(a.position,b.position,u),target:mix(a.target,b.target,u)};
}
// A closed orbit: position, scale, tilt and particles agree across 18 -> 0.
export function witchAt(seconds){
 const a=seconds/DURATION*Math.PI*2;
 return{position:[-20+70*Math.sin(a),68+8*Math.sin(a*2),-20+25*Math.cos(a)],yaw:.1+.3*Math.sin(a),roll:.09*Math.sin(a*2),scale:2.15+.25*Math.cos(a)};
}
export function storyAt(seconds){
 if(!Number.isFinite(seconds)||seconds<0||seconds>DURATION)throw Error('Frame time must be 0..18');
 const loop=seconds>=17.5,hook=seconds<1.5||loop;
 const promoted=seconds>=6&&!loop;
 // Show the actual no-promo maximum at 5.5s, then clearly restart paired arrivals.
 // Slow the opening of the replay so the later red-to-cyan melt is readable.
 const simTime=loop?300:Math.floor(promoted?(seconds<12?300+(seconds-6)/6*12:Math.min(900,312+(seconds-12)/3.5*588)):300+Math.min(1,seconds/5.5)*384);
 const captions=hook?['渋谷、無理ゲー？','Impossible crowd?']:seconds<6?['特典なし＝密集','No deals = Red gridlock']:seconds<9?['クーポン、置いてみる。','Drop a deal.']:seconds<12?['寄り道、発生。','Side quest unlocked.']:['ラテ1杯で解散？','Free pumpkin latte solves it?'];
 const shopIndex=Math.max(0,Math.min(2,Math.floor((seconds-6)/2))),shop=SHOPS[shopIndex];
 return{promoted,simTime,captions,hook,comparison:seconds>=15.5&&seconds<16.75,credits:seconds>=16.75&&seconds<17.5,loop,shopIndex,offer:promoted?[`${shop.name} · 架空`,shop.offerEn]:['',''],replay:promoted?'同じ到着条件で再試行 / SAME ARRIVALS · REPLAY':''};
}
