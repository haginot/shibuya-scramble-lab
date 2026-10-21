export const DURATION=20,FPS=24;
export const STILL_FRAMES=[0,8,18,29,35,38,51,62,78,107,126,144,171,188,221,243,273,300,332,364,402,421,452,479];
export const ACTIVATIONS=[4.05,4.25,4.45,4.65,4.85];
export const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
const mix=(a,b,u)=>a.map((v,i)=>v+(b[i]-v)*u);
const crossing=[[-64,144,-126],[0,3,6]],blueprint=[[0,210,.01],[0,0,0]];
// One crossing reveal; hold every arm through green, then pass between people.
// The distant map is a brief connective shot between tangible station/event views.
const poses=[
 [0,...blueprint],[.12,...blueprint],[.94,...crossing],[1.5,...crossing],
 [2.65,[-60,148,-123],[0,3,6]],
 [3.18,[-17,2.4,-18],[12,1.5,10]],[3.55,[-9,2.4,-10],[18,1.5,14]],
 [4.15,[-400,2800,700],[-200,0,-100]],
 [4.7,[150,8500,2100],[150,0,-600]],[5.55,[150,8500,2100],[150,0,-600]],
 [5.95,[-380,920,-700],[55,0,75]],[6.4,[-380,920,-700],[55,0,75]],
 [6.95,[-1250,1800,-300],[-850,0,210]],
 [7.35,[-1250,1800,-300],[-850,0,210]],
 [7.95,[-500,1500,-1800],[20,0,-2650]],
 [8.35,[-500,1500,-1800],[20,0,-2650]],
 [9.2,...crossing],[12,...crossing],[17,...crossing],[18.3,...crossing],
 [19.85,...blueprint],[20,...blueprint],
];
export function cameraAt(seconds,fixed=false){if(fixed)return{position:crossing[0],target:crossing[1]};for(let i=1;i<poses.length;i++){if(seconds<=poses[i][0]){const a=poses[i-1],b=poses[i],u=smooth((seconds-a[0])/(b[0]-a[0]));return{position:mix(a[1],b[1],u),target:mix(a[2],b[2],u)};}}return{position:blueprint[0],target:blueprint[1]};}
export function witchAt(seconds){
 const t=((seconds%DURATION)+DURATION)%DURATION,a=t/DURATION*Math.PI*2;
 const pass=Math.exp(-(((t-1.08)/.34)**4)),u=Math.max(0,Math.min(1,(t-.65)/.9));
 return{position:mix([-15+47*Math.sin(a),38+10*Math.sin(a*2),-21+22*Math.cos(a)],[-47+72*u,30,-34],pass),yaw:.2+.5*Math.sin(a)-pass*.6,roll:.1*Math.sin(a*2)-pass*.12,scale:1.5+.2*Math.cos(a)+pass*1.7};
}
export function storyAt(seconds){
 if(!Number.isFinite(seconds)||seconds<0||seconds>DURATION)throw Error('Frame time must be 0..20');
 const loop=seconds>=18.3,hook=seconds<1.5||loop,promoted=seconds>=3.8&&!loop;
 const opening=seconds<1.5?seconds:loop?Math.max(0,(20-seconds)/1.7*1.18):1.5;
 const extrusion=smooth((opening-.12)/.64),blueprint=1-smooth((opening-.18)/.48);
 const daylight=opening<.18?0:opening<.46?smooth((opening-.18)/.12):1-smooth((opening-.46)/.55);
 const dusk=opening>.46&&opening<1.01?Math.sin((opening-.46)/.55*Math.PI):0;
 const regionalClock=[[3.8,300],[5.4,860],[5.7,895],[6.05,910],[6.35,992],[6.65,1007],[6.9,1070],[7.3,1088],[7.65,1170],[8.2,1195],[8.7,1800]];
 const clockAt=t=>{for(let i=1;i<regionalClock.length;i++){const a=regionalClock[i-1],b=regionalClock[i];if(t<=b[0])return a[1]+(b[1]-a[1])*(t-a[0])/(b[0]-a[0]);}return 1800;};
 const clock=loop?1079:seconds<1.5?1079:seconds<3.8?1080+(seconds-1.5)*8:seconds<9.2?clockAt(seconds):1084+Math.max(0,seconds-9.2)*2;
 const simTime=Math.floor(clock),renderFraction=clock-simTime;
 const activeHub=seconds<ACTIVATIONS[0]?-1:Math.min(4,ACTIVATIONS.filter(t=>seconds>=t).length-1);
 const captions=hook?['荒れる渋谷、\n周りの街で散らせるか？','Can nearby towns ease a packed Shibuya?']:seconds<3.8?['青で、いっせいに。','GREEN. Everybody goes.']:seconds<5.6?['５つの街に、灯りを。','Five towns. Five side quests.']:seconds<7.3?['乗って、降りて、仮装広場へ。','Board. Ride. Find your party.']:seconds<9.2?['到着。街ごと、遊び場に。','Next stop: a lantern garden.']:seconds<12?['行き先が増えると、余白が。','More destinations. A little more room.']:['灯りも、街も、手づくり。','Original miniature city · HAGINO'];
 return{promoted,simTime,renderFraction,captions,pairedMelt:seconds>=9.2&&seconds<10.6,melt:Math.max(0,Math.min(1,(seconds-9.2)/1.4)),hook,comparison:seconds>=12&&seconds<17,districtResults:seconds>=14.2&&seconds<17,credits:seconds>=17&&seconds<18.3,loop,regional:seconds>=3.9&&seconds<9.2,overview:seconds>=4.5&&seconds<5.6,journey:seconds>=5.6&&seconds<8.6,focusDistrict:seconds<7.3?0:2,green:seconds>=1.5&&seconds<3.8,activeHub,activation:promoted?Math.max(0,Math.min(1,(seconds-4.05)/1.1)):0,reset:false,opening,extrusion,blueprint,daylight,dusk,speed:Math.round(6+94*smooth((opening-.12)/1.05)),timelapse:seconds<1.35||seconds>=19.3};
}
