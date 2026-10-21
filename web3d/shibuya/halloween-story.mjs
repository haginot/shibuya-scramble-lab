import {EVENTS,pointOnPath} from './halloween-model.mjs';
export const DURATION=20,FPS=24;
export const STILL_FRAMES=[0,4,10,23,35,37,44,65,84,105,121,132,143,154,167,181,196,201,213,217,232,244,249,260,277,296,328,338,372,396,429,459,479];
export const ACTIVATIONS=[4.02,4.08,4.14,4.20,4.26];
// This actual three-person group boards the 900s service together.
export const FEATURED_GROUP=288;
export const RELIEF_TIME=1092;
export const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
const mix=(a,b,u)=>a.map((v,i)=>v+(b[i]-v)*u);
const crossing=[[-64,144,-126],[0,3,6]],blueprint=[[0,210,.01],[0,0,0]];
// The whole six-arm launch holds before the continuous outward journey.
const poses=[
 [0,...blueprint],[.04,...blueprint],[.68,...crossing],[1.5,...crossing],
 [2.9,[-60,148,-123],[0,3,6]],
 [3.45,[-17,2.4,-18],[12,1.5,10]],[3.65,[-9,2.4,-10],[18,1.5,14]],
 [4.30,[352,5300,4600],[352,0,-660]],[5.05,[352,5300,4600],[352,0,-660]],
 [5.40,[-165,340,-225],[55,12,75]],[6.3,[-165,340,-225],[55,12,75]],
 [8.15,[-370,440,-3070],[-70,10,-2650]],
 [8.45,[-370,440,-3070],[-70,10,-2650]],
 [8.75,[-1430,500,-210],[-1120,12,210]],[9.15,[-1430,500,-210],[-1120,12,210]],
 [9.5,[610,650,920],[1000,30,1420]],[9.85,[650,610,980],[1000,30,1420]],
 [10.3,...crossing],[13.8,...crossing],[18.5,...crossing],
 [19.85,...blueprint],[20,...blueprint],
];
export function cameraAt(seconds,fixed=false){
 if(fixed)return{position:crossing[0],target:crossing[1]};
 // Track the same 900s Yamanote departure into the visible lantern platform.
 if(seconds>6.05&&seconds<8.15){
  const s=storyAt(seconds),e=EVENTS[2],path=[[55,75],...e.corridor.slice(1,-1),[e.position[0]-430,e.position[1]+200],[e.position[0]-430,e.position[1]]];
  const u=Math.max(0,Math.min(1,(s.simTime+s.renderFraction-900)/(e.travel_s-12))),p=pointOnPath(path,u);
  const settle=smooth((seconds-7.45)/.70),target=mix([p[0],12,p[1]],[-70,10,-2650],settle);
  const follow=[p[0]-220,340,p[1]-300],arrival=[-370,440,-3070];
  const depart=smooth((seconds-6.05)/.25);return{position:mix([-165,340,-225],mix(follow,arrival,settle),depart),target:mix([55,12,75],target,depart)};
 }
 for(let i=1;i<poses.length;i++){if(seconds<=poses[i][0]){const a=poses[i-1],b=poses[i],u=smooth((seconds-a[0])/(b[0]-a[0]));return{position:mix(a[1],b[1],u),target:mix(a[2],b[2],u)};}}
 return{position:blueprint[0],target:blueprint[1]};
}
export function witchAt(seconds){
 const t=((seconds%DURATION)+DURATION)%DURATION,a=t/DURATION*Math.PI*2;
 const pass=Math.exp(-(((t-.94)/.32)**4)),u=Math.max(0,Math.min(1,(t-.50)/.9));
 return{position:mix([-15+47*Math.sin(a),38+10*Math.sin(a*2),-21+22*Math.cos(a)],[-30+52*u,23,-12],pass),yaw:.2+.5*Math.sin(a)-pass*.6,roll:.1*Math.sin(a*2)-pass*.12,scale:1.5+.2*Math.cos(a)+pass*.9};
}
export function storyAt(seconds){
 if(!Number.isFinite(seconds)||seconds<0||seconds>DURATION)throw Error('Frame time must be 0..20');
 const loop=seconds>=18.5,hook=seconds<1.5||loop,promoted=seconds>=3.65&&seconds<19.92;
 const opening=seconds<1.5?seconds:loop?Math.max(0,(20-seconds)/1.5*.72):1.5;
 // Plan strokes leave before solid buildings rise; no translucent wire tangle.
 const extrusion=smooth((opening-.06)/.48),blueprint=1-smooth((opening-.02)/.10);
 // Capped well below full brightness: a washed pastel noon read as hazy and
 // competed with the hook's buildings/crowd; a brief dim-day beat is plenty.
 const daylight=(loop?0:opening<.08?0:opening<.26?smooth((opening-.08)/.09):1-smooth((opening-.26)/.34))*.52;
 const dusk=!loop&&opening>.26&&opening<.60?Math.sin((opening-.26)/.34*Math.PI):0;
 const regionalClock=[[3.65,600],[4.30,760],[5.05,880],[5.4,895],[5.65,912],[5.9,985],[6.15,1007],[6.3,1020],[7.15,1145],[7.55,1174],[8.0,1187],[8.45,1225],[8.75,1320],[9.15,1334],[9.5,1350],[9.85,1370],[10.3,1370]];
 const clockAt=t=>{for(let i=1;i<regionalClock.length;i++){const a=regionalClock[i-1],b=regionalClock[i];if(t<=b[0])return a[1]+(b[1]-a[1])*(t-a[0])/(b[0]-a[0]);}return 1800;};
 // All relief imagery stays in the same real green window. The wipe itself
 // holds exactly 1092s in both trials; subsequent people advance within green.
 // A slower advance keeps the six launch arms legible on screen: at the old
 // 14x rate the whole crossing had already fused into one disc by the time
 // the overhead hold ended, hiding the synchronized step-off it was meant to prove.
 const clock=seconds>=19.92?1079:seconds>=10.3?RELIEF_TIME+Math.max(0,seconds-11.6)*1.8:seconds<1.5?1079:seconds<3.65?1080+(seconds-1.5)*6:clockAt(seconds);
 const simTime=Math.floor(clock),renderFraction=clock-simTime;
 const activeHub=seconds<ACTIVATIONS[0]?-1:Math.min(4,ACTIVATIONS.filter(t=>seconds>=t).length-1);
 const captions=hook?['荒れる渋谷、\n周りの街で散らせるか？','Can nearby towns ease a packed Shibuya?']:seconds<3.65?['青で、いっせいに。','GREEN. Everybody goes.']:seconds<5.15?['５つの街に、灯りを。','Five towns. Five side quests.']:seconds<6.3?['２つの路線で、街の外へ。','Two lines. More places to go.']:seconds<7.45?['この３人を、追いかけて。','One hat. One pumpkin. One cape.']:seconds<8.55?['降りたら、ランタンの庭。','Step off. Follow the lanterns.']:seconds<9.2?['井の頭線で、仮装広場へ。','Inokashira → costume stage.']:seconds<10.05?['屋台にも、寄り道を。','Next stop: fictional pumpkin stalls.']:seconds<13.8?['同じ青。灯りで、街へ。','Same green. More places to go.']:['灯りも、街も、手づくり。','Original miniature city · HAGINO'];
 return{promoted,simTime,renderFraction,captions,pairedMelt:seconds>=10.3&&seconds<11.6,melt:Math.max(0,Math.min(1,(seconds-10.55)/.8)),departureBeat:seconds>=11.6&&seconds<13.8,hook,comparison:seconds>=13.8&&seconds<15.8,districtResults:false,credits:seconds>=15.8&&seconds<17.0,loop,regional:seconds>=3.85&&seconds<10.3,overview:seconds>=4.30&&seconds<5.15,journey:seconds>=5.15&&seconds<10.05,focusDistrict:seconds<6.3?0:seconds<8.55?2:seconds<9.2?0:4,green:seconds>=1.5&&seconds<3.65,activeHub,activation:promoted?Math.max(0,Math.min(1,(seconds-4.02)/.4)):0,reset:false,opening,extrusion,blueprint,daylight,dusk,speed:Math.round(6+94*smooth((opening-.25)/.45)),timelapse:seconds>=.25&&seconds<1.05};
}
