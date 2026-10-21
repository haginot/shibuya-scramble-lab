export const DURATION=18,FPS=24;
export const STILL_FRAMES=[0,8,17,28,38,51,65,88,103,118,139,165,192,222,255,299,330,360,390,431];
export const ACTIVATIONS=[3.65,4,4.35,4.7,5.05];
export const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
const mix=(a,b,u)=>a.map((v,i)=>v+(b[i]-v)*u);
const crossing=[[-64,144,-126],[0,3,6]],blueprint=[[0,285,.01],[0,0,0]];
// Whole crossing at green, then a real eye-level passage, lift, and matched return.
const poses=[
 [0,...blueprint],[.08,...blueprint],[.92,...crossing],
 [1.5,[-60,148,-123],[0,3,6]],[2.15,[-54,140,-120],[0,2,6]],
 [2.65,[-17,2.4,-18],[12,1.5,10]],[3.05,[-9,2.4,-10],[18,1.5,14]],
 [3.65,[-600,2300,650],[-270,0,-100]],
 [4.35,[150,9000,2100],[150,0,-600]],
 [7.2,[150,9000,2100],[150,0,-600]],
 [7.65,[180,4500,1000],[100,0,-400]],
 [8.6,...crossing],[12.2,[-57,144,-130],[0,3,6]],
 [15.7,...crossing],[16.2,...crossing],[17.85,...blueprint],[18,...blueprint],
];
export function cameraAt(seconds,fixed=false){if(fixed)return{position:crossing[0],target:crossing[1]};for(let i=1;i<poses.length;i++){if(seconds<=poses[i][0]){const a=poses[i-1],b=poses[i],u=smooth((seconds-a[0])/(b[0]-a[0]));return{position:mix(a[1],b[1],u),target:mix(a[2],b[2],u)};}}return{position:blueprint[0],target:blueprint[1]};}
export function witchAt(seconds){
 const t=((seconds%DURATION)+DURATION)%DURATION,a=t/DURATION*Math.PI*2;
 // A foreground pass during the hook; the closed orbit carries the visual rewind.
 const pass=Math.exp(-(((t-1.06)/.4)**4)),u=Math.max(0,Math.min(1,(t-.55)/1.05));
 return{position:mix([-15+47*Math.sin(a),38+10*Math.sin(a*2),-21+22*Math.cos(a)],[-63+87*u,40,-49],pass),yaw:.2+.5*Math.sin(a)-pass*.6,roll:.1*Math.sin(a*2)-pass*.12,scale:1.7+.2*Math.cos(a)+pass*1.8};
}
export function storyAt(seconds){
 if(!Number.isFinite(seconds)||seconds<0||seconds>DURATION)throw Error('Frame time must be 0..18');
 const loop=seconds>=16.2,hook=seconds<1.5||seconds>=16.2,promoted=seconds>=3.2&&!loop;
 const opening=seconds<1.5?seconds:loop?Math.max(0,(18-seconds)/1.8*1.18):1.5;
 const extrusion=smooth((opening-.1)/.64),blueprint=1-smooth((opening-.2)/.5);
 const daylight=opening<.17?0:opening<.48?smooth((opening-.17)/.12):1-smooth((opening-.48)/.55);
 const dusk=opening>.48&&opening<1.03?Math.sin((opening-.48)/.55*Math.PI):0;
 // Evidence replays the same populated green, rather than an empty end-of-run tail.
 const clock=loop?1074:seconds<1.5?1074:seconds<3.2?1080+(seconds-1.5)*9:seconds<8.6?300+(seconds-3.2)/5.4*1500:1084+Math.max(0,seconds-8.6)*2;
 const simTime=Math.floor(clock),renderFraction=clock-simTime;
 const activeHub=seconds<ACTIVATIONS[0]?-1:Math.min(4,ACTIVATIONS.filter(t=>seconds>=t).length-1);
 const captions=hook?['荒れる渋谷、\n周りの街で散らせるか？','Can nearby towns ease a packed Shibuya?']:seconds<3.2?['青で、いっせいに。','GREEN. Everybody goes.']:seconds<5.1?['５つの街に、灯りを。','Five towns. Five side quests.']:seconds<8.6?['人の流れが、街へほどける。','Follow the lights. Find your party.']:seconds<12.2?['17%ぶん、余白。','More destinations. A little more room.']:seconds<14.7?['交差点ピーク −17%','Crossing peak −17% · toy-model']:['灯りも、街も、手づくり。','Original miniature city · HAGINO'];
 return{promoted,simTime,renderFraction,captions,pairedMelt:seconds>=8.6&&seconds<10,melt:Math.max(0,Math.min(1,(seconds-8.6)/1.4)),hook,comparison:seconds>=12.2&&seconds<14.7,credits:seconds>=14.7&&seconds<15.7,loop,regional:seconds>=3.3&&seconds<8.4,green:seconds>=1.5&&seconds<3.2,activeHub,activation:promoted?Math.max(0,Math.min(1,(seconds-3.65)/2.3)):0,reset:false,opening,extrusion,blueprint,daylight,dusk,speed:loop?Math.round(6+94*smooth((opening-.1)/1.05)):Math.round(6+94*smooth((seconds-.1)/1.05)),timelapse:seconds<1.35||seconds>=17.3};
}
