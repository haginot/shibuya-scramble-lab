import * as THREE from '../vendor/three.module.min.js';
import {initWorld, ll, buildCity, buildAlternative, terrainHeight} from './city.mjs';
window.__ready = false;
window.__caption = (ja='', en='') => {document.getElementById('ja').textContent=ja;document.getElementById('en').textContent=en;};
const params=new URLSearchParams(location.search);
const colors=[0x999999,0x48aaff,0xffe052,0xff943b,0xff4b59];
async function json(path){const r=await fetch(path);if(!r.ok)throw new Error(`${path}: ${r.status}`);return r.json();}
async function start(){
 const [data,buildings,terrain,engine]=await Promise.all([json('../data/promo.json'),json('../data/buildings.json'),json('../data/terrain.json'),json('../data/engine.json')]);
 const requested=(params.get('combos')||'none,sns_only,sns+coupon,all_four').replaceAll(' ','+').split(',');
 const combos=requested.filter((n,i)=>data.combinations[n]&&requested.indexOf(n)===i).slice(0,4);
 if(!combos.length)throw new Error('No valid combinations selected');
 initWorld(buildings,terrain);
 const scene=new THREE.Scene();scene.background=new THREE.Color(0x18303b);
 scene.add(new THREE.HemisphereLight(0xe8ffff,0x52624f,2));const sun=new THREE.DirectionalLight(0xffecc5,2);sun.position.set(-200,450,180);scene.add(sun);
 buildCity(scene,buildings,engine);
 const store=ll(...data.store.position);
 buildAlternative(scene,'cafe',store);
 const beam=new THREE.Mesh(new THREE.CylinderGeometry(3,9,110,24),new THREE.MeshBasicMaterial({color:0xffdc85,transparent:true,opacity:.24,depthWrite:false,blending:THREE.AdditiveBlending}));beam.position.copy(store);beam.position.y+=55;scene.add(beam);
 const core=new THREE.Mesh(new THREE.CylinderGeometry(.8,1.8,110,12),new THREE.MeshBasicMaterial({color:0xffedb0,transparent:true,opacity:.8,depthWrite:false}));core.position.copy(beam.position);scene.add(core);
 const marker=new THREE.Mesh(new THREE.TorusGeometry(18,1.2,8,64),new THREE.MeshBasicMaterial({color:0xffdc75,transparent:true,opacity:.85,depthTest:false}));marker.rotation.x=-Math.PI/2;marker.position.copy(store);marker.position.y+=2;marker.renderOrder=2;scene.add(marker);
 // A single orthographic camera keeps scale and orbit identical in every panel.
 const camera=new THREE.OrthographicCamera(-350,350,160,-160,1,3000);
 const focus=store.clone().add(new THREE.Vector3(0,8,0));
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));document.body.append(renderer.domElement);renderer.setScissorTest(true);
 const cols=combos.length===1?1:2,rows=Math.ceil(combos.length/cols), panels=document.getElementById('panels');panels.style.gridTemplateColumns=`repeat(${cols},1fr)`;
 // Screen-facing discs retain the funnel colours above dense roof geometry.
 const disc=document.createElement('canvas');disc.width=64;disc.height=64;
 const ink=disc.getContext('2d');ink.beginPath();ink.arc(32,32,26,0,Math.PI*2);ink.fillStyle='#fff';ink.fill();ink.lineWidth=6;ink.strokeStyle='#18303b';ink.stroke();
 const texture=new THREE.CanvasTexture(disc);
 const materials=colors.map(color=>new THREE.SpriteMaterial({map:texture,color,depthTest:false,depthWrite:false}));
 const people=Array.from({length:data.combinations[combos[0]].frames[0].agents.length},()=>{const m=new THREE.Sprite(materials[0]);m.renderOrder=3;scene.add(m);return m;});
 // The recorded store offsets are under 6 m; use only those actual visit slots.
 const layouts=Object.fromEntries(combos.map(name=>[name,data.combinations[name].frames.map(frame=>{
  const positions=frame.agents.map(a=>ll(a[0],a[1]));
  const visitors=positions.flatMap((p,i)=>Math.hypot(p.x-store.x,p.z-store.z)<8?[i]:[]);
  visitors.forEach((id,j)=>{
   const angle=j*2.399963229728653,radius=17+6*Math.sqrt(j);
   const p=positions[id];p.x=store.x+Math.cos(angle)*radius;p.z=store.z+Math.sin(angle)*radius;p.y=terrainHeight(p.x,p.z);
  });
  return {positions,visitors:visitors.length};
 })]));
 const titles={none:'施策なし / No promotion',sns_only:'SNS広告 / Social ads',flyer_only:'チラシ・看板 / Flyers & signboard',pr_only:'広報・メディア / PR & media',coupon_only:'クーポン / Coupon','sns+coupon':'SNS広告＋クーポン / Social ads + coupon',all_four:'全4施策 / All four'};
 const labels=combos.map(name=>{const p=document.createElement('section');p.className='panel';const title=document.createElement('h2');title.textContent=titles[name]||`${name} / Custom`;const stats=document.createElement('div');stats.className='stats';const tag=document.createElement('div');tag.className='store-label';p.append(title,stats,tag);panels.append(p);return {stats,tag};});
 const speed=Number(params.get('speed')||30);if(!Number.isFinite(speed)||speed<=0)throw new Error('speed must be positive (seconds for the whole period)');
 window.__promoState={data,combos,durationSeconds:speed,frameIndex:0,day:0,ready:false};
 const startTime=performance.now();
 function animate(now){
  renderer.setSize(innerWidth,innerHeight,false);
  // The first animation timestamp can precede setup’s performance.now().
  const day=Math.min(data.config.days-0.00001,Math.max(0,now-startTime)/1000/speed*data.config.days);
  const idx=Math.min(data.combinations[combos[0]].frames.length-1,Math.floor(day*data.config.hours.length));
  Object.assign(window.__promoState,{frameIndex:idx,day,metrics:Object.fromEntries(combos.map(name=>[name,data.combinations[name].frames[idx].metrics]))});
  document.getElementById('clock').textContent=`Day ${Math.floor(day)+1}/${data.config.days} · ${data.config.hours[idx%data.config.hours.length]}:00 · ${data.combinations[combos[0]].daily[Math.floor(day)].weather}`;
  const top=78,bottom=65,w=innerWidth/cols,h=(innerHeight-top-bottom)/rows;
  const orbit=(now-startTime)/1000*.025+.65;
  camera.position.set(store.x+Math.sin(orbit)*400,store.y+550,store.z+Math.cos(orbit)*400);camera.lookAt(focus);
  combos.forEach((name,k)=>{
   const result=data.combinations[name],frame=result.frames[idx];
   const current=layouts[name][idx],previous=layouts[name][Math.max(0,idx-1)];
   const phase=(day*data.config.hours.length)%1;
   const arrival=Math.min(1,phase/.32),blend=arrival*arrival*(3-2*arrival);
   const pixelSize=9*700/w;
   frame.agents.forEach((a,i)=>{people[i].position.copy(previous.positions[i]).lerp(current.positions[i],blend);people[i].position.y+=7;people[i].scale.setScalar(pixelSize);people[i].material=materials[a[2]];});
   const visitors=previous.visitors+(current.visitors-previous.visitors)*blend;
   marker.scale.setScalar((22+6*Math.sqrt(visitors))/18);marker.material.opacity=visitors? .85:.3;
   const m=frame.metrics,pct=v=>v===null?'N/A':`${(v*100).toFixed(1)}%`;
   labels[k].stats.textContent=`認知/Aware ${pct(1-frame.funnel[0]/data.config.population)} · 来訪/Visits ${m.total_visits.toFixed(0)} · 増分/Uplift +${m.uplift.toFixed(0)} (${m.uplift_pct===null?'N/A':m.uplift_pct.toFixed(1)+'%'}) · 元々来訪/Anyway ${pct(m.would_have_come_anyway_share)} · ROI ${pct(m.roi)}`;
   const x=(k%cols)*w,y=innerHeight-top-(Math.floor(k/cols)+1)*h;
   renderer.setViewport(x,y,w,h);renderer.setScissor(x,y,w,h);camera.left=-350;camera.right=350;camera.top=350*h/w;camera.bottom=-350*h/w;camera.updateProjectionMatrix();
   const pin=store.clone().add(new THREE.Vector3(0,113,0)).project(camera);
   labels[k].tag.style.left=`${(pin.x+1)*50}%`;labels[k].tag.style.top=`${(1-pin.y)*h/2}px`;
   labels[k].tag.textContent=`ひだまり珈琲 (架空) · 現在 ${current.visitors}人`;
   renderer.render(scene,camera);
  });
  requestAnimationFrame(animate);
 }
 requestAnimationFrame(animate);window.__promoState.ready=true;window.__ready=true;
}
start().catch(error=>{window.__promoState={ready:false,error:String(error)};document.getElementById('clock').textContent=String(error);console.error(error);});
