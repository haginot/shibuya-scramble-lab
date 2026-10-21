import {EVENTS,HalloweenModel,navigation,experiment} from './halloween-model.mjs';
import {makeNightScene} from './halloween-scene.mjs';
import {storyAt,cameraAt,DURATION,ACTIVATIONS,RELIEF_TIME} from './halloween-story.mjs';
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search);window.__ready=false;
const read=async p=>{const r=await fetch(p);if(!r.ok)throw Error(`${p}: ${r.status}`);return r.json();};
const[plateau,osm,region]=await Promise.all(['plateau','osm','halloween_region'].map(p=>read(`../data/shibuya_${p}.json`)));
const nav=navigation(plateau),metrics=experiment(plateau),night=makeNightScene(plateau,osm,nav,region),{THREE}=night;
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(1080,1920,false);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;$('view').append(renderer.domElement);
const meltCanvas=document.createElement('canvas');meltCanvas.width=1080;meltCanvas.height=1920;meltCanvas.style.cssText='position:absolute;inset:0;width:100%;height:100%';$('view').append(meltCanvas);const meltContext=meltCanvas.getContext('2d');
const camera=new THREE.PerspectiveCamera(43,1080/1920,.5,15000);
const activities=['仮装','行進','灯り','光の道','屋台'];
const labels=EVENTS.map((e,i)=>{const el=document.createElement('div');el.className='event-label';el.style.setProperty('--accent','#'+e.color.toString(16));const b=document.createElement('b'),small=document.createElement('small'),note=document.createElement('em');b.textContent=e.name+' · '+activities[i];small.textContent=e.en;el.append(b,small,note);$('event-labels').append(el);return el;});
const journeyCard=document.createElement('aside');journeyCard.id='journey-info';const journeyTitle=document.createElement('b'),journeyEn=document.createElement('small');journeyCard.append(journeyTitle,journeyEn);$('film').append(journeyCard);
const hubNote=document.createElement('div');hubNote.className='hub-note';hubNote.textContent='架空イベント / FICTIONAL EVENTS';$('event-labels').append(hubNote);
for(const prefix of['no','promo']){const r=metrics[prefix==='no'?'no_events':'events_on'];$(`${prefix}-density`).textContent=r.peak_density_per_m2.toFixed(2);$(`${prefix}-visits`).textContent=r.visits;}
$('peak-counts').textContent=`${metrics.no_events.peak_central_count} → ${metrics.events_on.peak_central_count}人`;
$('arrival-counts').textContent=`${metrics.no_events.visits} → ${metrics.events_on.visits}人`;
$('change').textContent=Math.round(metrics.density_change_pct)+'%';$('gain').textContent='+'+Math.round((metrics.attendance_ratio-1)*100)+'%';
const best=metrics.best_event,lift=metrics.largest_lift;
$('best').textContent=`最多到着：${EVENTS.find(e=>e.en===best.district).name} ${best.people}人`;
$('best-en').textContent=`MOST ARRIVALS · ${best.district} lantern garden`;

const districtCard=document.createElement('div');districtCard.id='district-results';
EVENTS.forEach((e,i)=>{const row=document.createElement('div');row.className='district-row';row.classList.toggle('winner',e.en===best.district);const name=document.createElement('b'),en=document.createElement('small'),count=document.createElement('strong');name.textContent=e.name;en.textContent=e.en;count.textContent=`${metrics.no_events.district_people[i]} → ${metrics.events_on.district_people[i]}`;row.append(name,en,count);districtCard.append(row);});$('comparison').append(districtCard);


// Evidence panels share the exact camera, model second and green signal phase.
for(const [prefix,events] of [['no',false],['promo',true]]){const m=new HalloweenModel(nav,{events});m.advanceTo(RELIEF_TIME);const pose=cameraAt(0,true);camera.position.set(...pose.position);camera.lookAt(...pose.target);night.update(m,13.1,events);renderer.render(night.scene,camera);$(`${prefix}-image`).src=renderer.domElement.toDataURL('image/png');}
function resize(){const scale=Math.min(innerWidth/1080,innerHeight/1920);document.documentElement.style.setProperty('--scale',scale);$('film').style.left=`${(innerWidth-1080*scale)/2}px`;}window.addEventListener('resize',resize);resize();
let no=new HalloweenModel(nav),promo=new HalloweenModel(nav,{events:true});window.__halloweenMetrics=metrics;
window.__frame=seconds=>{const story=storyAt(seconds);let model=story.promoted?promo:no;if(model.time>story.simTime){model=new HalloweenModel(nav,{events:story.promoted});if(story.promoted)promo=model;else no=model;}model.advanceTo(story.simTime);const pose=cameraAt(seconds);camera.position.set(...pose.position);camera.lookAt(...pose.target);camera.updateMatrixWorld();night.update(model,seconds,story.promoted);renderer.render(night.scene,camera);
 meltCanvas.hidden=!story.pairedMelt;if(story.pairedMelt){const on=document.createElement('canvas');on.width=1080;on.height=1920;on.getContext('2d').drawImage(renderer.domElement,0,0);if(no.time>story.simTime)no=new HalloweenModel(nav);no.advanceTo(story.simTime);night.update(no,seconds,false);renderer.render(night.scene,camera);meltContext.clearRect(0,0,1080,1920);meltContext.drawImage(renderer.domElement,0,0);meltContext.save();meltContext.beginPath();for(let y=0;y<=1920;y+=8){const x=(story.melt*1.22-.11+Math.sin(y*.016)*.045)*1080;if(y===0)meltContext.moveTo(0,0);meltContext.lineTo(x,y);}meltContext.lineTo(0,1920);meltContext.closePath();meltContext.clip();meltContext.drawImage(on,0,0);meltContext.restore();}
 $('ja').textContent=story.captions[0];$('en').textContent=story.captions[1];$('comparison').hidden=!story.comparison;$('credits').hidden=!story.credits;
 labels.forEach((el,i)=>{el.hidden=!story.overview||seconds<ACTIVATIONS[i];const e=EVENTS[i],p=new THREE.Vector3(e.position[0],80,e.position[1]).project(camera),offsets=[[-230,75],[-280,95],[90,-55],[100,60],[90,130]],x=(p.x+1)*540,y=(1-p.y)*960;el.style.left=Math.max(45,Math.min(780,x+offsets[i][0]))+'px';el.style.top=Math.max(425,Math.min(1360,y+offsets[i][1]))+'px';el.querySelector('em').textContent='';});
 hubNote.hidden=!story.regional;
 journeyCard.hidden=!story.journey;
 if(story.journey){const e=EVENTS[story.focusDistrict];journeyTitle.textContent=seconds<6.3?(seconds<5.85?'山手線 · 乗車 → 出発':'井の頭線 · 乗車 → 出発'):e.name+' · '+e.event;journeyEn.textContent=seconds<6.3?(seconds<5.85?'YAMANOTE · BOARD → RIDE':'INOKASHIRA · BOARD → RIDE'):e.en+' · '+e.eventEn;journeyCard.style.color=seconds<5.85?'#abf2d0':'#d5baff';} $('film').classList.toggle('hook',story.hook);
 const panelFade=Math.min(1,Math.max(0,(story.opening-.01)/.20));$('blueprint-panels').hidden=story.opening>=.25;$('blueprint-panels').style.opacity=1-panelFade;$('blueprint-panels').style.transform=`translateY(${panelFade*110}px)`;$('blueprint-crowd').textContent=model.snapshot().central_count+'人';$('speed').hidden=!story.timelapse;$('speed').querySelector('strong').textContent='×'+story.speed;
 $('beat').hidden=story.comparison||story.credits||story.regional||story.hook||(!story.green&&!story.pairedMelt&&!story.departureBeat);$('beat').style.top=story.green?'1510px':'1550px';$('prompt-ja').textContent=story.pairedMelt?'同時刻・同じ青 / 1092s · OFF → ON':story.green?'● GREEN / みんなで、渡ろう。':'青のまま、余白ができる。';$('prompt-en').textContent=story.departureBeat?'STILL GREEN · ACTUAL EVENT-BOUND PEOPLE':'';
 window.__halloweenState={video_seconds:seconds,scenario:story.promoted?'events_on':'no_events',...model.snapshot(),draw_calls:renderer.info.render.calls};return window.__halloweenState;};
window.__frame(0);$('loading').hidden=true;await document.fonts.ready;window.__ready=true;if(params.get('record')!=='1'){const start=performance.now();function tick(now){window.__frame(((now-start)/1000)%DURATION);requestAnimationFrame(tick);}requestAnimationFrame(tick);}
