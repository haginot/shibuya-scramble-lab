import {HalloweenModel,navigation,experiment} from './halloween-model.mjs';
import {makeNightScene} from './halloween-scene.mjs';
import {storyAt,cameraAt,DURATION} from './halloween-story.mjs';
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search);
window.__ready=false;
const read=async p=>{const r=await fetch(p);if(!r.ok)throw Error(`${p}: ${r.status}`);return r.json();};
const[plateau,osm]=await Promise.all([read('../data/shibuya_plateau.json'),read('../data/shibuya_osm.json')]);
const nav=navigation(plateau),metrics=experiment(plateau),night=makeNightScene(plateau,osm,nav),{THREE}=night;
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
renderer.setPixelRatio(1);renderer.setSize(1080,1920,false);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;$('view').append(renderer.domElement);
const camera=new THREE.PerspectiveCamera(43,1080/1920,.5,2500);
const labels=nav.shops.map((s,i)=>{const el=document.createElement('div');el.className='shop-label';const small=document.createElement('small'),b=document.createElement('b');small.textContent='COUPON';b.textContent=['LATTE','BOOK','SWEET'][i];el.append(small,b);$('shop-labels').append(el);return{el,p:new THREE.Vector3(s.position[0],24,s.position[1])};});
function resize(){const scale=Math.min(innerWidth/1080,innerHeight/1920);document.documentElement.style.setProperty('--scale',scale);$('film').style.left=`${(innerWidth-1080*scale)/2}px`;}
window.addEventListener('resize',resize);resize();
let no=new HalloweenModel(nav),promo=new HalloweenModel(nav,{promotion:true});
function draw(model,seconds,promoted,fixed=false){const pose=cameraAt(seconds,fixed);camera.position.set(...pose.position);camera.lookAt(...pose.target);camera.updateMatrixWorld();night.update(model,seconds,promoted);renderer.render(night.scene,camera);}
for(const[prefix,promoted]of[['no',false],['promo',true]]){
 const model=new HalloweenModel(nav,{promotion:promoted});model.advanceTo(900);draw(model,15.5,promoted,true);$(''+prefix+'-image').src=renderer.domElement.toDataURL('image/png');
 const result=metrics[promoted?'promo':'no_promo'];$(`${prefix}-density`).textContent=result.peak_density_per_m2.toFixed(4);$(`${prefix}-visits`).textContent=result.visits;
}
window.__halloweenMetrics=metrics;
window.__frame=seconds=>{
 const story=storyAt(seconds),{promoted,simTime,captions}=story;let model=promoted?promo:no;
 if(model.time>simTime){model=new HalloweenModel(nav,{promotion:promoted});if(promoted)promo=model;else no=model;}
 model.advanceTo(simTime);draw(model,seconds,promoted);const state=model.snapshot();
 $('ja').textContent=captions[0];$('en').textContent=captions[1].replace('latte solves','latte\nsolves');
 $('replay').textContent=story.replay;$('offer').hidden=!promoted||seconds>=12;
 $('offer').firstElementChild.textContent=nav.shops[story.shopIndex].name+' · 架空 / FICTIONAL';$('offer').lastElementChild.textContent=nav.shops[story.shopIndex].offer;
 $('prompt-ja').hidden=promoted&&seconds<12;$('prompt-en').hidden=promoted&&seconds<12;
 $('prompt-ja').textContent=story.hook?'このパズル、解ける？':promoted?'SIDE QUEST COMPLETE?':'ONE MEETING POINT. AGAIN.';
 $('prompt-en').textContent=story.hook?'Can one little deal change the map?':promoted?'仮定の販促効果 / Assumed offer response':'同じ交差点に、集合。';
 labels.forEach((l,i)=>{const p=l.p.clone().project(camera),x=(p.x+1)*540,y=(1-p.y)*960,age=seconds-(6+i*1.5);l.el.style.left=`${Math.max(130,Math.min(950,x))}px`;l.el.style.top=`${Math.max(515,Math.min(1400,y-20))}px`;l.el.hidden=!promoted||age<0||p.z>1;const scale=1+.17*Math.exp(-age*4)*Math.sin(age*12);l.el.style.transform=`translate(-50%,-50%) scale(${scale})`;});
 $('comparison').hidden=!story.comparison;$('credits').hidden=!story.credits;
 window.__halloweenState={video_seconds:seconds,scenario:promoted?'promo':'no_promo',...state,draw_calls:renderer.info.render.calls};return window.__halloweenState;
};
window.__frame(0);$('loading').hidden=true;await document.fonts.ready;window.__ready=true;
if(params.get('record')!=='1'){const start=performance.now();function tick(now){window.__frame(((now-start)/1000)%DURATION);requestAnimationFrame(tick);}requestAnimationFrame(tick);}
