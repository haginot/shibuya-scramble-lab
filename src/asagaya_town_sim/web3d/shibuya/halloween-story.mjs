export const DURATION=20,FPS=24;
export const STILL_FRAMES=[0,9,20,30,48,68,90,103,115,128,142,162,192,240,288,336,380,402,432,479];
export const ACTIVATIONS=[3.6,4.15,4.7,5.25,5.8];
export const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
const mix=(a,b,u)=>a.map((v,i)=>v+(b[i]-v)*u);
const crossing=[[-76,116,-116],[0,4,0]],blueprint=[[0,370,.01],[0,0,0]];
// Flat blueprint -> extrusion -> whole green crossing -> pedestrian passage.
// The regional overview lasts under four seconds before returning to people.
const poses=[
 [0,...blueprint],[.18,...blueprint],[1.15,...crossing],
 [1.5,[-65,125,-123],[0,3,0]],[2.3,[-58,112,-112],[0,2,0]],
 [2.8,[-17,2.8,-18],[12,1.6,10]],[3.05,[-10,2.8,-11],[18,1.6,14]],
 [3.6,[-800,1900,700],[-500,0,100]],
 [4.15,[100,4600,500],[100,0,-800]],
 [4.7,[100,8500,1700],[100,0,-300]],
 [6.8,[100,8500,1700],[100,0,-300]],
 [7.5,[180,4200,1100],[100,0,-400]],
 [8.3,...crossing],[18.6,...crossing],[19.8,...blueprint],[20,...blueprint],
];
export function cameraAt(seconds,fixed=false){if(fixed)return{position:[-76,170,-116],target:crossing[1]};for(let i=1;i<poses.length;i++){if(seconds<=poses[i][0]){const a=poses[i-1],b=poses[i],u=smooth((seconds-a[0])/(b[0]-a[0]));return{position:mix(a[1],b[1],u),target:mix(a[2],b[2],u)};}}return{position:blueprint[0],target:blueprint[1]};}
export function witchAt(seconds){const a=seconds/DURATION*Math.PI*2;return{position:[-15+47*Math.sin(a),38+10*Math.sin(a*2),-21+22*Math.cos(a)],yaw:.2+.5*Math.sin(a),roll:.1*Math.sin(a*2),scale:1.6+.25*Math.cos(a)};}
export function storyAt(seconds){
 if(!Number.isFinite(seconds)||seconds<0||seconds>DURATION)throw Error('Frame time must be 0..20');
 const loop=seconds>=18,hook=seconds<1.5||seconds>=18.8,promoted=seconds>=3.35&&!loop;
 const opening=seconds<1.5?seconds:seconds>=18.6?Math.max(0,(20-seconds)/1.4*1.15):1.5;
 const extrusion=smooth((opening-.12)/.78),blueprint=1-smooth((opening-.25)/.6);
 const daylight=opening<.25?0:opening<.52?smooth((opening-.25)/.17):1-smooth((opening-.52)/.6);
 const dusk=opening>.52&&opening<1.12?Math.sin((opening-.52)/.6*Math.PI):0;
 // Separate paired trials; return replays the populated matched green, not its empty tail.
 const simTime=loop?1074:seconds<1.5?1074:seconds<3.35?1080+Math.floor((seconds-1.5)*9):seconds<8.3?Math.floor(300+(seconds-3.35)/4.95*1500):1084+Math.floor(Math.max(0,seconds-8.3)*2);
 const activeHub=seconds<ACTIVATIONS[0]?-1:Math.min(4,ACTIVATIONS.filter(t=>seconds>=t).length-1);
 const captions=hook?['荒れる渋谷、\n周りの街で散らせるか？','Can nearby towns ease a packed Shibuya?']:seconds<3.35?['青で、いっせいに。','GREEN. Everybody goes.']:seconds<6.4?['街ごと、ハロウィン。','Five towns. Five side quests.']:seconds<8.3?['歩く？ 電車で行く？','Walk, or catch a train?']:seconds<11.8?['17%ぶん、余白。','A little more room. Same green.']:seconds<15.8?['交差点ピーク −17%','Crossing peak −17% · toy-model']:seconds<17.5?['灯りも、街も、手づくり。','Original miniature city · HAGINO']:['次の実験、もう一周。','MODEL RESET. One more loop.'];
 return{promoted,simTime,captions,pairedMelt:seconds>=8.3&&seconds<9.55,melt:Math.max(0,Math.min(1,(seconds-8.3)/1.25)),hook,comparison:seconds>=11.8&&seconds<15.8,credits:seconds>=15.8&&seconds<17.5,loop,regional:seconds>=3.4&&seconds<8.1,green:seconds>=1.5&&seconds<3.35,activeHub,activation:promoted?Math.max(0,Math.min(1,(seconds-3.6)/2.75)):0,reset:seconds>=17.5&&seconds<18.8,opening,extrusion,blueprint,daylight,dusk,speed:seconds>=19.8?6:Math.round(6+94*smooth((seconds-.1)/1.05)),timelapse:seconds<1.35||seconds>=19.8};
}
