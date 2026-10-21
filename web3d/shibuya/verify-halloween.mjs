import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SETTINGS,EVENTS,navigation,HalloweenModel,experiment,signalAt} from './halloween-model.mjs';
import {storyAt,cameraAt,witchAt,DURATION,FPS} from './halloween-story.mjs';
const plateau=JSON.parse(await readFile(new URL('../data/shibuya_plateau.json',import.meta.url),'utf8'));
const original=JSON.stringify(plateau),nav=navigation(plateau),a=new HalloweenModel(nav),b=new HalloweenModel(nav,{events:true});
a.advanceTo(299);b.advanceTo(299);assert.deepEqual(a.people,b.people,'identical demand and individuals before intervention');
let photo=false,rail=false,curve=false,queued=[];
for(let t=300;t<=SETTINGS.horizon_s;t++){
 a.step();b.step();
 if(t===1079)queued=a.people.filter(p=>p.stage==='plaza').map(p=>({id:p.id,x:p.x,z:p.z}));
 if(t===1085){const movers=queued.filter(p=>Math.hypot(a.people[p.id].x-p.x,a.people[p.id].z-p.z)>2);assert(movers.length>queued.length*.75,'most curbside people physically start together on green');assert(queued.filter(p=>Math.hypot(p.x,p.z)<12).length<queued.length*.1,'red phase leaves the scramble centre open');}
 for(const model of[a,b]){
  const s=model.snapshot();assert.equal(s.active+s.waiting+s.gone,SETTINGS.agents);assert.equal(s.visits,model.people.filter(p=>p.visited).length);assert.equal(s.district_people.reduce((x,y)=>x+y,0),s.visits);
  if(t%60===0)for(const p of model.people){
   assert(Number.isFinite(p.x)&&Number.isFinite(p.z)&&Number.isFinite(p.heading));
   if(!['event','rail','regional'].includes(p.stage))assert.equal(nav.solid[nav.key(p.x,p.z)],0,'local paths stay out of building footprints');
   if(p.visited)assert(Math.hypot(p.x-EVENTS[p.district].position[0],p.z-EVENTS[p.district].position[1])<1e-6,'district arrival requires completed journey');
   if(p.photo)photo=true;if(p.stage==='rail')rail=true;if(Math.abs(p.vx)>.1&&Math.abs(p.vz)>.1)curve=true;
  }
 }
}
const first=experiment(plateau);assert.deepEqual(first.no_events,a.metrics(),'seeded social-force rerun reproduces baseline');assert.deepEqual(first.events_on,b.metrics(),'seeded social-force rerun reproduces event trial');
const reduction=1-first.events_on.peak_density_per_m2/first.no_events.peak_density_per_m2;
assert(reduction>.1&&reduction<.5,'modest measured peak effect');assert(first.attendance_ratio>1.1&&first.attendance_ratio<2,'retire outsized visit ratio');
assert(photo&&rail&&curve,'photo pauses, actual rail state and non-grid velocity occur');
assert(first.events_on.boardings.Yamanote>0&&first.events_on.boardings.Inokashira>0);
for(let i=0;i<EVENTS.length;i++){assert(first.events_on.district_people[i]<=EVENTS[i].capacity);assert(first.events_on.district_people[i]/first.no_events.district_people[i]<=2,'each district stays within 2×');}
assert.equal(first.density_change_pct,Number(((b.peak/a.peak-1)*100).toFixed(1)),'percentage uses unrounded individual counts');
assert.equal(first.best_event.criterion,'most completed arrivals');
assert.equal(first.largest_lift.people,Math.max(...first.district_lifts));
assert.equal(first.best_event.people,Math.max(...first.events_on.district_people));
const changed=new HalloweenModel(nav,{seed:1032,events:true});assert.notDeepEqual(changed.people,b.people,'seed changes people');
assert.equal(JSON.stringify(plateau),original);assert.equal(EVENTS.length,5);
assert.equal(signalAt(storyAt(1.5).simTime),'green','release must coincide with real model green');
assert.equal(storyAt(9.2).simTime,1084,'return begins in matched green rather than empty tail');
assert(storyAt(10.5).simTime>storyAt(9.2).simTime,'people keep walking during the return');
assert.equal(signalAt(storyAt(15.5).simTime),'green');
assert(cameraAt(2.05).position[1]>100,'whole crossing visible during release before descent');
assert(storyAt(18.5).loop&&!storyAt(18.5).reset,'visual rewind replaces the reset instruction');
assert.equal(DURATION,20);assert.equal(FPS,24);assert(storyAt(6).regional);assert(storyAt(13).comparison);assert(storyAt(17.5).credits);
assert.equal(storyAt(DURATION).simTime,storyAt(0).simTime);assert.deepEqual(cameraAt(DURATION),cameraAt(0));
for(const key of['position'])for(let i=0;i<3;i++)assert(Math.abs(witchAt(DURATION)[key][i]-witchAt(0)[key][i])<1e-9);
assert.equal(storyAt(0).extrusion,0,'opening is flat');assert.equal(storyAt(1.2).extrusion,1,'city rises during hook');assert(storyAt(.33).daylight>.8&&storyAt(.75).dusk>.8,'day and dusk are visible');assert.equal(storyAt(1.3).daylight,0,'night before first green');assert.equal(storyAt(0).speed,6);assert.equal(storyAt(1.2).speed,100);assert(cameraAt(3.3).position[1]<3,'pedestrian-eye passage');assert(storyAt(0).captions[0].replace('\n','').includes('荒れる渋谷、周りの街で散らせるか？'));
assert(witchAt(1.1).scale>3,'foreground witch pass within the first 1.5 seconds');
assert(storyAt(9.55).renderFraction>0,'subsecond velocity interpolation keeps the return moving between model samples');
assert(storyAt(13).comparison&&!storyAt(13).districtResults&&storyAt(15).districtResults,'matched proof then five readable district results');assert(storyAt(5).overview&&!storyAt(6).overview&&storyAt(6).journey,'brief overview gives way to station journey');
for(let i=0;i<=DURATION*FPS;i++){const s=storyAt(i/FPS);assert(Number.isInteger(s.simTime)&&s.simTime<=SETTINGS.horizon_s&&s.simTime>=300);for(const v of[...cameraAt(i/FPS).position,...cameraAt(i/FPS).target])assert(Number.isFinite(v));}
const region=JSON.parse(await readFile(new URL('../data/shibuya_halloween_region.json',import.meta.url),'utf8'));assert(region.buildings.length>10000&&region.radius_m===3000&&region.files.every(f=>f.sha256.length===64));assert(region.coverage_gaps.length>0);
const stored=JSON.parse(await readFile(new URL('../../out/media/shibuya-halloween-metrics.json',import.meta.url),'utf8'));assert.deepEqual(stored,first,'all published metrics generated by the model');assert.throws(()=>storyAt(NaN));assert.throws(()=>a.advanceTo(899));
console.log(`PASS Halloween: matched seeded social-force runs, conservation, capacities, physical arrivals, rail, photo stops, footprint avoidance, modest effects, region provenance, green release and closed camera loop. ${a.peak} → ${b.peak}; ${a.visits} → ${b.visits}`);
