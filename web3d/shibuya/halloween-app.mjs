import {SETTINGS,HalloweenModel,navigation,experiment} from './halloween-model.mjs';
import {makeNightScene} from './halloween-scene.mjs';
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
function setCamera(seconds,fixed=false){const u=fixed?0:smooth(Math.max(0,Math.min(1,(seconds-3)/15)));camera.position.set(-210+u*83+(fixed?0:Math.min(seconds,6)*6),235-u*82,-230+u*82);camera.lookAt(0,5,4);camera.updateMatrixWorld();}
function draw(model,seconds,promoted,fixed=false){setCamera(seconds,fixed);night.update(model,seconds,promoted);renderer.render(night.scene,camera);}
function caption(ja,en){$('ja').textContent=ja;$('en').textContent=en;}
function comparison(){if(comparisonReady)return;const a=new HalloweenModel(nav),b=new HalloweenModel(nav,{promotion:true});a.advanceTo(900);b.advanceTo(900);draw(a,19,false,true);$('no-image').src=renderer.domElement.toDataURL('image/png');draw(b,19,true,true);$('promo-image').src=renderer.domElement.toDataURL('image/png');for(const[prefix,result]of[['no',metrics.no_promo],['promo',metrics.promo]]){$(`${prefix}-density`).textContent=result.peak_density_per_m2.toFixed(4);$(`${prefix}-visits`).textContent=result.visits;$(`${prefix}-line`).setAttribute('points',[[0,0],...result.history.map(s=>[s.time_s/900*880,s.central_count])].map(([x,y])=>`${x},${150-y/800*140}`).join(' '));}comparisonReady=true;}
window.__halloweenMetrics=metrics;
window.__frame=seconds=>{
 if(!Number.isFinite(seconds)||seconds<0||seconds>28)throw Error('Frame time must be 0..28');
 if(seconds<previous){no=new HalloweenModel(nav);promo=new HalloweenModel(nav,{promotion:true});}previous=seconds;
 const promoted=seconds>=12,simTime=Math.min(900,Math.floor(promoted?300+(seconds-12)/8*600:80+seconds/12*620)),model=promoted?promo:no;
 model.advanceTo(simTime);draw(model,seconds,promoted);const state=model.snapshot();
 $('density').textContent=state.density.toFixed(3);$('visits').textContent=state.visits;$('density').style.color=promoted?'#b1f7d6':'#ffbac0';$('visits').style.color=promoted?'#b1f7d6':'#ffbac0';
 $('clock').textContent=`SIM ${String(Math.floor(simTime/60)).padStart(2,'0')}:${String(simTime%60).padStart(2,'0')}`;
 $('replay').textContent=promoted?'同じ到着条件で再試行 / Paired replay':'販促なし / No promotion';$('replay').style.color=promoted?'#b1f7d6':'#ffb7bb';
 $('chapter-number').textContent=promoted?'02':'01';$('chapter-ja').textContent=promoted?'行き先を、増やす。':'集まる夜。';$('chapter-en').textContent=promoted?'MORE PLACES. MORE TIME.':'ONE MEETING POINT. AGAIN.';$('mode').textContent=promoted?'PROMO ON':'NO PROMO';$('mode').style.color=promoted?'#b1f7d6':'#ffacba';
 const offerIndex=Math.min(2,Math.floor((seconds-12)/2.7));if(promoted){const s=nav.shops[Math.max(0,offerIndex)];$('offer').firstElementChild.textContent=`${s.name}（架空） · ${s.offer}`;$('offer').lastElementChild.textContent=s.offerEn;}else{$('offer').firstElementChild.textContent=seconds<5?'とりあえず、交差点集合。':'待ち合わせ場所、人気が集中。';$('offer').lastElementChild.textContent=seconds<5?'Everyone had the same meeting point. How original.':'A popular meeting point. A very popular meeting point.';}
 if(seconds<4)caption('荒れる渋谷、施策で散らせるか？','Can promos tame the Shibuya crush?');else if(seconds<8)caption('毎年の「ここ集合」が、積もっていく。','The annual “meet here” habit starts to add up.');else if(seconds<12)caption('目的地がひとつなら、赤くなる。','One destination. A rather red heatmap.');else if(seconds<14)caption('同じ条件で巻き戻す。今度は、お店へ。','Replay the same arrivals. Give them somewhere else to go.');else if(seconds<17)caption('少し遠いお店へ。時間も、少しずらす。','Farther shops. Later offers. A little breathing room.');else caption('交差点の密度は下がり、お店の来訪は増えた。','In this toy run: less central density, more shop visits.');
 labels.forEach(l=>{const p=l.p.clone().project(camera);l.el.style.left=`${(p.x+1)*540}px`;l.el.style.top=`${(1-p.y)*655}px`;l.el.hidden=!promoted||p.z>1||p.x<-.85||p.x>.85||p.y<-.7||p.y>.5;});
 $('comparison').hidden=seconds<20||seconds>=24;$('credits').hidden=seconds<24;if(seconds>=20)comparison();$('progress').style.width=`${seconds/28*100}%`;
 window.__halloweenState={video_seconds:seconds,scenario:promoted?'promo':'no_promo',...state,draw_calls:renderer.info.render.calls};return window.__halloweenState;
};
window.__frame(0);$('loading').hidden=true;await document.fonts.ready;window.__ready=true;
if(params.get('record')!=='1'){const start=performance.now();function tick(now){window.__frame(((now-start)/1000)%28);requestAnimationFrame(tick);}requestAnimationFrame(tick);}
