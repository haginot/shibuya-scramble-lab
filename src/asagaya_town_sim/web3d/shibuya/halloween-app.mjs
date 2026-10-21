import {HalloweenModel,navigation,experiment} from './halloween-model.mjs';
import {makeNightScene} from './halloween-scene.mjs';
import {storyAt} from './halloween-story.mjs';
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search);
window.__ready=false;
const read=async p=>{const r=await fetch(p);if(!r.ok)throw Error(`${p}: ${r.status}`);return r.json();};
const[plateau,osm]=await Promise.all([read('../data/shibuya_plateau.json'),read('../data/shibuya_osm.json')]);
const nav=navigation(plateau),metrics=experiment(plateau),night=makeNightScene(plateau,osm,nav),{THREE}=night;
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
renderer.setPixelRatio(.85);renderer.setSize(1080,1310,false);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;$('view').append(renderer.domElement);
const camera=new THREE.PerspectiveCamera(43,1080/1310,.5,2500);
const labels=nav.shops.map(s=>{const el=document.createElement('div');el.className='shop-label';const b=document.createElement('b'),sm=document.createElement('small');b.textContent=s.name;sm.textContent=`架空 / FICTIONAL · ${s.en}`;el.append(b,sm);$('shop-labels').append(el);return{el,p:new THREE.Vector3(s.position[0],20,s.position[1])};});
function resize(){const scale=Math.min(innerWidth/1080,innerHeight/1920);document.documentElement.style.setProperty('--scale',scale);$('film').style.left=`${(innerWidth-1080*scale)/2}px`;}
window.addEventListener('resize',resize);resize();
let no=new HalloweenModel(nav),promo=new HalloweenModel(nav,{promotion:true}),previous=-1,comparisonReady=false;
const smooth=x=>x*x*(3-2*x);
function setCamera(seconds,fixed=false){const u=fixed?0:smooth(Math.max(0,Math.min(1,(seconds-3)/15)));camera.position.set(-200+u*70+(fixed?0:Math.min(seconds,6)*6),285-u*55,-220+u*70);camera.lookAt(0,5,4);camera.updateMatrixWorld();}
function draw(model,seconds,promoted,fixed=false){setCamera(seconds,fixed);night.update(model,seconds,promoted);renderer.render(night.scene,camera);}
function caption(ja,en){$('ja').textContent=ja;$('en').textContent=en;}
function comparison(){if(comparisonReady)return;const a=new HalloweenModel(nav),b=new HalloweenModel(nav,{promotion:true});a.advanceTo(900);b.advanceTo(900);draw(a,19,false,true);$('no-image').src=renderer.domElement.toDataURL('image/png');draw(b,19,true,true);$('promo-image').src=renderer.domElement.toDataURL('image/png');for(const[prefix,result]of[['no',metrics.no_promo],['promo',metrics.promo]]){$(`${prefix}-density`).textContent=result.peak_density_per_m2.toFixed(4);$(`${prefix}-visits`).textContent=result.visits;$(`${prefix}-line`).setAttribute('points',[[0,0],...result.history.map(s=>[s.time_s/900*880,s.central_count])].map(([x,y])=>`${x},${150-y/800*140}`).join(' '));}comparisonReady=true;}
window.__halloweenMetrics=metrics;
window.__frame=seconds=>{
 const {promoted,simTime,captions,chapter,offer}=storyAt(seconds);
 if(seconds<previous){no=new HalloweenModel(nav);promo=new HalloweenModel(nav,{promotion:true});}previous=seconds;
 const model=promoted?promo:no;
 model.advanceTo(simTime);draw(model,seconds,promoted);const state=model.snapshot();
 $('density').textContent=state.density.toFixed(3);$('visits').textContent=state.visits;$('density').style.color=promoted?'#b1f7d6':'#ffbac0';$('visits').style.color=promoted?'#b1f7d6':'#ffbac0';
 $('clock').textContent=`SIM ${String(Math.floor(simTime/60)).padStart(2,'0')}:${String(simTime%60).padStart(2,'0')}`;
 $('replay').textContent=promoted?'同じ到着条件で再試行 / Paired replay':'販促なし / No promotion';$('replay').style.color=promoted?'#b1f7d6':'#ffb7bb';
 $('chapter-number').textContent=chapter[0];$('chapter-ja').textContent=chapter[1];$('chapter-en').textContent=chapter[2];$('mode').textContent=promoted?'PROMO ON':'NO PROMO';$('mode').style.color=promoted?'#b1f7d6':'#ffacba';
 $('offer').firstElementChild.textContent=offer[0];$('offer').lastElementChild.textContent=offer[1];
 caption(...captions);
 labels.forEach(l=>{const p=l.p.clone().project(camera);l.el.style.left=`${(p.x+1)*540}px`;l.el.style.top=`${(1-p.y)*655}px`;l.el.hidden=!promoted||p.z>1||p.x<-.85||p.x>.85||p.y<-.7||p.y>.5;});
 $('comparison').hidden=seconds<20||seconds>=24;$('credits').hidden=seconds<24;if(seconds>=20)comparison();$('progress').style.width=`${seconds/28*100}%`;
 window.__halloweenState={video_seconds:seconds,scenario:promoted?'promo':'no_promo',...state,draw_calls:renderer.info.render.calls};return window.__halloweenState;
};
window.__frame(0);$('loading').hidden=true;await document.fonts.ready;window.__ready=true;
if(params.get('record')!=='1'){const start=performance.now();function tick(now){window.__frame(((now-start)/1000)%28);requestAnimationFrame(tick);}requestAnimationFrame(tick);}
