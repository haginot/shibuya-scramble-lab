import {EVENTS,pointOnPath} from './halloween-model.mjs';
export const DURATION=20,FPS=24;
export const STILL_FRAMES=[0,6,15,29,35,38,51,68,83,103,119,132,145,154,167,179,193,209,225,237,253,280,303,322,354,385,409,433,456,479];
export const ACTIVATIONS=[4.15,4.30,4.45,4.60,4.75];
// This actual three-person group boards the 900s service together.
export const FEATURED_GROUP=288;
export const RELIEF_TIME=1092;
export const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
const mix=(a,b,u)=>a.map((v,i)=>v+(b[i]-v)*u);
const crossing=[[-64,144,-126],[0,3,6]],blueprint=[[0,210,.01],[0,0,0]];
// The whole six-arm launch holds before the continuous outward journey.
const poses=[
 [0,...blueprint],[.08,...blueprint],[.94,...crossing],[1.5,...crossing],
 [2.9,[-60,148,-123],[0,3,6]],
 [3.45,[-17,2.4,-18],[12,1.5,10]],[3.65,[-9,2.4,-10],[18,1.5,14]],
 [4.35,[150,8500,2100],[150,0,-600]],[5.2,[150,8500,2100],[150,0,-600]],
 [5.5,[-380,880,-650],[55,0,75]],[6.3,[-380,880,-650],[55,0,75]],
 [8.55,[-650,1050,-3350],[-40,10,-2650]],
 [8.75,[-650,1050,-3350],[-40,10,-2650]],[8.95,...crossing],[9.3,...crossing],[12.6,...crossing],
 [13.05,...crossing],[18.5,...crossing],
 [19.85,...blueprint],[20,...blueprint],
];
export function cameraAt(seconds,fixed=false){
 if(fixed)return{position:crossing[0],target:crossing[1]};
 // Track the same 900s Yamanote departure into the visible lantern platform.
 if(seconds>6.05&&seconds<8.55){
  const s=storyAt(seconds),e=EVENTS[2],path=[[55,75],...e.corridor.slice(1,-1),[e.position[0]-430,e.position[1]+200],[e.position[0]-430,e.position[1]]];
  const u=Math.max(0,Math.min(1,(s.simTime+s.renderFraction-900)/(e.travel_s-12))),p=pointOnPath(path,u);
  const settle=smooth((seconds-7.55)/.75),target=mix([p[0],10,p[1]],[-40,10,-2650],settle);
  const follow=[p[0]-435,880,p[1]-725],arrival=[-650,1050,-3350];
  const depart=smooth((seconds-6.05)/.25);return{position:mix([-380,880,-650],mix(follow,arrival,settle),depart),target:mix([55,0,75],target,depart)};
 }
 for(let i=1;i<poses.length;i++){if(seconds<=poses[i][0]){const a=poses[i-1],b=poses[i],u=smooth((seconds-a[0])/(b[0]-a[0]));return{position:mix(a[1],b[1],u),target:mix(a[2],b[2],u)};}}
 return{position:blueprint[0],target:blueprint[1]};
}
export function witchAt(seconds){
 const t=((seconds%DURATION)+DURATION)%DURATION,a=t/DURATION*Math.PI*2;
 const pass=Math.exp(-(((t-1.08)/.34)**4)),u=Math.max(0,Math.min(1,(t-.65)/.9));
 return{position:mix([-15+47*Math.sin(a),38+10*Math.sin(a*2),-21+22*Math.cos(a)],[-30+52*u,23,-12],pass),yaw:.2+.5*Math.sin(a)-pass*.6,roll:.1*Math.sin(a*2)-pass*.12,scale:1.5+.2*Math.cos(a)+pass*.9};
}
export function storyAt(seconds){
 if(!Number.isFinite(seconds)||seconds<0||seconds>DURATION)throw Error('Frame time must be 0..20');
 const loop=seconds>=18.5,hook=seconds<1.5||loop,promoted=seconds>=3.65&&!loop;
 const opening=seconds<1.5?seconds:loop?Math.max(0,(20-seconds)/1.5*1.18):1.5;
 // Plan strokes leave before solid buildings rise; no translucent wire tangle.
 const extrusion=smooth((opening-.20)/.56),blueprint=1-smooth((opening-.07)/.14);
 const daylight=opening<.18?0:opening<.46?smooth((opening-.18)/.12):1-smooth((opening-.46)/.55);
 const dusk=opening>.46&&opening<1.01?Math.sin((opening-.46)/.55*Math.PI):0;
 const regionalClock=[[3.65,600],[4.35,760],[5.2,880],[5.4,895],[5.65,912],[5.9,985],[6.15,1007],[6.3,1020],[7.15,1145],[7.55,1174],[8.0,1187],[8.55,1225],[9.3,1800]];
 const clockAt=t=>{for(let i=1;i<regionalClock.length;i++){const a=regionalClock[i-1],b=regionalClock[i];if(t<=b[0])return a[1]+(b[1]-a[1])*(t-a[0])/(b[0]-a[0]);}return 1800;};
 const clock=loop?1079:seconds>=17.5?1145+(seconds-17.5)*4:seconds<1.5?1079:seconds<3.65?1080+(seconds-1.5)*14:seconds<8.95?clockAt(seconds):seconds<10?RELIEF_TIME:RELIEF_TIME+Math.min(140,(seconds-10)*52);
 const simTime=Math.floor(clock),renderFraction=clock-simTime;
 const activeHub=seconds<ACTIVATIONS[0]?-1:Math.min(4,ACTIVATIONS.filter(t=>seconds>=t).length-1);
 const captions=hook?['荒れる渋谷、\n周りの街で散らせるか？','Can nearby towns ease a packed Shibuya?']:seconds<3.65?['青で、いっせいに。','GREEN. Everybody goes.']:seconds<5.3?['５つの街に、灯りを。','Five towns. Five side quests.']:seconds<6.3?['２つの路線で、街の外へ。','Two lines. More places to go.']:seconds<7.55?['この３人を、追いかけて。','Follow the golden trio.']:seconds<8.75?['降りたら、ランタンの庭。','Step off. Follow the lanterns.']:seconds>=17.5?['次の青まで、ひと休み。','Room for the next green.']:seconds<13.05?['人が動いて、余白ができる。','Follow the trails. Find a little room.']:['灯りも、街も、手づくり。','Original miniature city · HAGINO'];
 return{promoted,simTime,renderFraction,captions,pairedMelt:seconds>=8.95&&seconds<10,melt:Math.max(0,Math.min(1,(seconds-9.25)/.65)),departureBeat:seconds>=10&&seconds<13.05,hook,comparison:seconds>=13.05&&seconds<16.35,districtResults:false,credits:seconds>=16.35&&seconds<17.5,loop,regional:seconds>=3.85&&seconds<8.95,overview:seconds>=4.35&&seconds<5.3,journey:seconds>=5.3&&seconds<8.55,focusDistrict:seconds<6.3?0:2,green:seconds>=1.5&&seconds<3.65,activeHub,activation:promoted?Math.max(0,Math.min(1,(seconds-4.15)/.8)):0,reset:false,opening,extrusion,blueprint,daylight,dusk,speed:Math.round(6+94*smooth((opening-.12)/1.05)),timelapse:seconds<1.35||seconds>=19.3};
}
