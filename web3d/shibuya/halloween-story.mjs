export const DURATION=18,FPS=24;
export const STILL_FRAMES=[12,46,64,132,210,300,360,397,431];
export const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
const mix=(a,b,u)=>a.map((v,i)=>v+(b[i]-v)*u);
// Hold recognisable crossing, descend through costumes, reveal the whole 3km toy.
const poses=[
 [0,[-76,116,-116],[0,4,0]],
 [1.35,[-67,101,-110],[0,3,0]],
 [2.1,[-18,2.4,-18],[8,1.7,6]],
 [2.8,[-7,2.4,-7],[15,1.6,13]],
 [3.5,[-80,210,-200],[0,0,-30]],
 [6.0,[-550,6200,2300],[0,0,-540]],
 [10.5,[-350,6200,2300],[0,0,-540]],
 [11.6,[-130,260,-160],[0,0,0]],
 [13,[-65,135,-120],[0,2,0]],
 [16.4,[-76,116,-116],[0,4,0]],
 [18,[-76,116,-116],[0,4,0]],
];
export function cameraAt(seconds,fixed=false){if(fixed)return{position:poses[0][1],target:poses[0][2]};for(let i=1;i<poses.length;i++){if(seconds<=poses[i][0]){const a=poses[i-1],b=poses[i],u=smooth((seconds-a[0])/(b[0]-a[0]));return{position:mix(a[1],b[1],u),target:mix(a[2],b[2],u)};}}return{position:poses[0][1],target:poses[0][2]};}
export function witchAt(seconds){const a=seconds/DURATION*Math.PI*2;return{position:[-15+47*Math.sin(a),38+10*Math.sin(a*2),-21+22*Math.cos(a)],yaw:.2+.5*Math.sin(a),roll:.1*Math.sin(a*2),scale:1.6+.25*Math.cos(a)};}
export function storyAt(seconds){
 if(!Number.isFinite(seconds)||seconds<0||seconds>DURATION)throw Error('Frame time must be 0..18');
 const loop=seconds>=17.35,hook=seconds<1.5||loop,promoted=seconds>=3.5&&!loop;
 // Common seed, equal horizon: initial release is seen in both trial conditions.
 const simTime=loop?1074:seconds<1.5?1074:seconds<3.5?1080+Math.floor((seconds-1.5)*6):seconds<11?Math.floor(372+(seconds-3.5)/7.5*1428):1800;
 const captions=hook?['荒れる渋谷、\n周りの街で散らせるか？','Can nearby towns ease\na packed Shibuya?']:seconds<3.5?['青で、いっせいに。','GREEN. Everybody goes.']:seconds<7?['周りの街、点灯。','Five towns. Five side quests.']:seconds<11?['歩いて。電車でも。','Follow the lights. Take a train.']:seconds<14?['渋谷にも、余白。','More room for the next crossing.']:['街を増やすと、どうなる？','One crossing. More destinations.'];
 return{promoted,simTime,captions,hook,comparison:seconds>=14&&seconds<16.0,credits:seconds>=16.0&&seconds<17.35,loop,regional:seconds>=4&&seconds<11.3,green:seconds>=1.5&&seconds<3.5,activation:promoted?Math.min(1,(seconds-3.5)/2.2):0};
}
