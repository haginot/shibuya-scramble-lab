export const DURATION=18,FPS=24;
export const STILL_FRAMES=[12,48,68,103,119,130,135,151,167,210,300,360,393,431];
export const ACTIVATIONS=[4.05,4.7,5.35,6.0,6.65];
export const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
const mix=(a,b,u)=>a.map((v,i)=>v+(b[i]-v)*u);
// Read the entire crossing on green before the brief eye-level passage.
const poses=[
 [0,[-76,116,-116],[0,4,0]],
 [1.5,[-65,125,-123],[0,3,0]],
 [2.3,[-58,112,-112],[0,2,0]],
 [2.8,[-17,2.8,-18],[12,1.6,10]],
 [3.1,[-10,2.8,-11],[18,1.6,14]],
 [4.05,[-800,1900,700],[-500,0,100]],
 [4.7,[100,4300,500],[100,0,-800]],
 [5.35,[100,7600,1700],[100,0,-500]],
 [7.4,[100,7600,1700],[100,0,-500]],
 [9.8,[180,7400,1550],[100,0,-500]],
 [11.0,[-110,2300,700],[0,0,-120]],
 [12.0,[-76,116,-116],[0,4,0]],
 [18,[-76,116,-116],[0,4,0]],
];
export function cameraAt(seconds,fixed=false){if(fixed)return{position:poses[0][1],target:poses[0][2]};for(let i=1;i<poses.length;i++){if(seconds<=poses[i][0]){const a=poses[i-1],b=poses[i],u=smooth((seconds-a[0])/(b[0]-a[0]));return{position:mix(a[1],b[1],u),target:mix(a[2],b[2],u)};}}return{position:poses[0][1],target:poses[0][2]};}
export function witchAt(seconds){const a=seconds/DURATION*Math.PI*2;return{position:[-15+47*Math.sin(a),38+10*Math.sin(a*2),-21+22*Math.cos(a)],yaw:.2+.5*Math.sin(a),roll:.1*Math.sin(a*2),scale:1.6+.25*Math.cos(a)};}
export function storyAt(seconds){
 if(!Number.isFinite(seconds)||seconds<0||seconds>DURATION)throw Error('Frame time must be 0..18');
 const loop=seconds>=17.25,hook=seconds<1.5||loop,promoted=seconds>=3.35&&!loop;
 // Return replays the same green window from 1084s, with people still walking.
 const simTime=loop?1074:seconds<1.5?1074:seconds<3.35?1080+Math.floor((seconds-1.5)*9):seconds<11?Math.floor(300+(seconds-3.35)/7.65*1500):1084+Math.floor(Math.max(0,seconds-12)*3);
 const activeHub=seconds<4.05?-1:Math.min(4,ACTIVATIONS.filter(t=>seconds>=t).length-1);
 const captions=hook?['荒れる渋谷、\n周りの街で散らせるか？','Can nearby towns ease\na packed Shibuya?']:seconds<3.35?['青で、いっせいに。','GREEN. Everybody goes.']:seconds<7.3?['街ごと、ハロウィン。','Five towns. Five side quests.']:seconds<11?['灯りへ、ぞろぞろ。','Follow the glow. Walk or ride.']:seconds<14?['少し、余白。','A little breathing room.']:seconds<16?['効いた？ トイモデルでは。','Did it work? In this toy model.']:['次の青で、もう一周。','Next green. One more loop.'];
 return{promoted,simTime,captions,hook,comparison:seconds>=14&&seconds<16,credits:seconds>=16&&seconds<17.25,loop,regional:seconds>=3.6&&seconds<11.3,green:seconds>=1.5&&seconds<3.35,activeHub,activation:promoted?Math.max(0,Math.min(1,(seconds-4.05)/3.25)):0,reset:seconds>=16.8&&seconds<17.5};
}
