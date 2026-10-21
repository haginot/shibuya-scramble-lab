import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SETTINGS,SHOPS,navigation,HalloweenModel,experiment} from './halloween-model.mjs';
import {storyAt,cameraAt,witchAt,DURATION,FPS,STILL_FRAMES} from './halloween-story.mjs';
const plateau=JSON.parse(await readFile(new URL('../data/shibuya_plateau.json',import.meta.url),'utf8'));
const original=JSON.stringify(plateau),nav=navigation(plateau),a=new HalloweenModel(nav),b=new HalloweenModel(nav,{promotion:true});
a.advanceTo(299);b.advanceTo(299);assert.deepEqual(a.people,b.people,'paired trial must share every pre-offer individual');
for(let t=300;t<=900;t++){
 a.step();b.step();
 for(const model of[a,b]){
  const s=model.snapshot();assert.equal(s.active+s.waiting+s.gone,SETTINGS.agents);assert.equal(s.visits,model.people.filter(p=>p.visited).length);assert.equal(s.shop_visits.reduce((x,y)=>x+y,0),s.visits);
  if(t%30===0)for(const p of model.people){assert(Number.isFinite(p.x)&&Number.isFinite(p.z));assert.equal(nav.solid[nav.key(p.x,p.z)],0,'routes must stay out of building footprints');if(p.stage==='shopping')assert(Math.hypot(p.x-nav.shops[p.shop].position[0],p.z-nav.shops[p.shop].position[1])<1e-5,'visit requires actual arrival');}
 }
}
const first=experiment(plateau),second=experiment(plateau);assert.deepEqual(first,second,'complete experiments reproduce bit for bit');
assert.deepEqual(first.no_promo,a.metrics());assert.deepEqual(first.promo,b.metrics());
assert(first.promo.peak_density_per_m2<first.no_promo.peak_density_per_m2);assert(first.promo.visits>first.no_promo.visits);assert(first.promo.visits<=SETTINGS.agents);
assert.notDeepEqual(experiment(plateau,1032).promo,first.promo,'seed actually changes individuals and outcomes');
assert.equal(JSON.stringify(plateau),original,'scene/model must not mutate PLATEAU data');assert.equal(SHOPS.length,3);
for(const shop of nav.shops)assert(Math.hypot(...shop.position)>90,'promoted fictional shops must be farther from the junction');
assert.equal(storyAt(5.99).promoted,false);assert.equal(storyAt(5.5).simTime,684);assert.equal(storyAt(6).simTime,300);assert.equal(storyAt(15.5).simTime,900);
assert.equal(DURATION,18);assert.equal(FPS,24);assert.equal(storyAt(16).comparison,true);assert.equal(storyAt(17).credits,true);
assert.equal(storyAt(17.5).hook,true);assert.equal(storyAt(18).simTime,storyAt(0).simTime);
assert.deepEqual(cameraAt(18),cameraAt(0),'loop camera must return to opening pose');
for(const key of ['position'])for(let i=0;i<3;i++)assert(Math.abs(witchAt(18)[key][i]-witchAt(0)[key][i])<1e-9,'witch orbit must close');
// The actual exporters may request preview frames out of order, then loop.
const trials={no:new HalloweenModel(nav),promo:new HalloweenModel(nav,{promotion:true})};
for(const t of [...STILL_FRAMES.map(i=>i/FPS),0,...Array.from({length:DURATION*FPS+1},(_,i)=>i/FPS)]){
 const story=storyAt(t),key=story.promoted?'promo':'no';
 assert(Number.isInteger(story.simTime)&&story.simTime>=300&&story.simTime<=900);
 if(trials[key].time>story.simTime)trials[key]=new HalloweenModel(nav,{promotion:story.promoted});
 const snapshot=trials[key].advanceTo(story.simTime);assert.equal(snapshot.time_s,story.simTime);
}
assert.equal(trials.no.snapshot().time_s,300,'loop restores opening model state');
assert.throws(()=>storyAt(18.1));
assert.throws(()=>storyAt(NaN));assert.throws(()=>a.advanceTo(899));
const stored=JSON.parse(await readFile(new URL('../../out/media/shibuya-halloween-metrics.json',import.meta.url),'utf8'));assert.deepEqual(stored,first,'checked-in numbers must come from this actual model');
console.log(`PASS Halloween: deterministic paired arrivals, agent conservation, footprint avoidance, actual visits, farther shops, seed sensitivity, stored metrics. ${first.no_promo.peak_density_per_m2}/${first.no_promo.visits} → ${first.promo.peak_density_per_m2}/${first.promo.visits}`);
