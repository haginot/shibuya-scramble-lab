// Exercise the actual UI reset/RAF handlers, with only browser I/O replaced.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SourceTextModule,SyntheticModule,createContext} from 'node:vm';
import {StepQueue} from './timing.mjs';
const root=new URL('./',import.meta.url);
const read=p=>readFile(new URL(p,root),'utf8');
const [appSource,vendorSource,html]=await Promise.all(['app.mjs','../vendor/three.module.min.js','index.html'].map(read));
const config=JSON.parse(await read('../data/shibuya_config.json'));config.agents=8;
const datasets={'../data/shibuya_config.json':config,'../data/shibuya_osm.json':{roads:[],railways:[],nearby_150m_total:0},'../data/shibuya_plateau.json':{buildings:[]},'../data/shibuya_traffic.json':{tracks:[]}};
class Element{
 constructor(){this.children=[];this.style={};this.dataset={};this.checked=true;this.classList={add(){},toggle(){}};}
 append(...children){this.children.push(...children);}
 getBoundingClientRect(){return {width:1280,height:494,top:0,bottom:494};}
 getContext(){return {beginPath(){},arc(){},fill(){},fillRect(){}};}
 addEventListener(){}
}
const elements=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],new Element()]));
const document={body:new Element(),getElementById:id=>elements.get(id),createElement:()=>new Element(),querySelectorAll:()=>[]};
let now=0,scheduled,worker;
class Worker{
 constructor(){worker=this;this.time=0;this.clock=0;}
 terminate(){}
 postMessage(data){
  if(data.type==='init')this.promotion=data.config.promotion;
  if(data.type==='promo')this.promotion=data.enabled;
  if(data.type==='advance')this.time+=data.seconds;
  const result={id:data.id,promotion:this.promotion,time:this.time,clock:this.clock,dt:.1,positions:new Float32Array(16),previous:new Float32Array(16),motion:new Float32Array(16),roles:new Uint8Array(8),states:new Uint8Array(8),funnel:[8,0,0,0],trainWaves:[0,0],phase:'walk',admitted:5,completed:2,active:3,waiting:1,approaching:1,rescued:0,lastCycle:{admitted:4,completed:4,rescued:0,deferred:0}};
  queueMicrotask(()=>this.onmessage({data:result}));
 }
}
const context=createContext({document,URL,URLSearchParams,innerWidth:1280,innerHeight:720,location:{search:'?cam=top'},Worker,queueMicrotask,console,devicePixelRatio:1,performance:{now:()=>now},requestAnimationFrame:cb=>scheduled=cb,fetch:async path=>({ok:true,json:async()=>structuredClone(datasets[path])})});context.window=context;
const vendor=new SourceTextModule(vendorSource,{context});await vendor.link(()=>{});await vendor.evaluate();
class Renderer{
 constructor(){this.domElement=new Element();this.domElement.width=1280;this.domElement.height=720;this.info={render:{calls:1,triangles:0}};}
 setPixelRatio(){} getPixelRatio(){return 1;} setSize(){} render(){} setRenderTarget(){} clear(){}
}
// Rendering modules (city, crowd, vehicles, post effects) need a GPU; they are
// replaced by inert stand-ins. Simulation, timing, director and UI code are real.
const T=vendor.namespace;
const stubs={
 './city.mjs':{buildCity:()=>({groundMat:{uniforms:{uDyn:{value:null},uReflectMatrix:{value:new T.Matrix4()}}},reflective:[],reflectTarget:null,signalMaterial:{uniforms:{uPed:{value:new T.Color()},uCar:{value:new T.Color()}}},signCount:0})},
 './crowd.mjs':{Crowd:class{constructor(){this.uniforms={uUmbrella:{value:0}};}update(){}}},
 './vehicles.mjs':{Vehicles:class{constructor(){this.mesh=new T.Object3D();}update(){return [];}}},
 './fx.mjs':{Post:class{constructor(){this.settings={uFade:{value:1}};}setSize(){}render(){}},TopDown:class{constructor(){this.dyn={texture:null};}update(){}},Rain:class{constructor(){this.uniforms={uAmount:{value:0}};}},makeSky:()=>new T.Object3D()},
};
const graphics=new SyntheticModule(Object.keys(vendor.namespace),function(){for(const key of Object.keys(vendor.namespace))this.setExport(key,key==='WebGLRenderer'?Renderer:vendor.namespace[key]);},{context});
const modules={};
for(const [path,exports] of Object.entries(stubs)){modules[path]=new SyntheticModule(Object.keys(exports),function(){for(const [k,v] of Object.entries(exports))this.setExport(k,v);},{context});await modules[path].link(()=>{});}
for(const file of ['traffic.mjs','timing.mjs','indoor.mjs','shaders.mjs','simulation.mjs','director.mjs']){
 modules[`./${file}`]=new SourceTextModule(await read(file),{context});
 await modules[`./${file}`].link(path=>modules[path]||graphics);
}
const app=new SourceTextModule(appSource,{context,initializeImportMeta:meta=>meta.url=root.href});await app.link(path=>modules[path]||graphics);await app.evaluate();
assert(context.__ready);
const promotion=elements.get('promotion');promotion.checked=false;
await promotion.onchange({target:promotion});
assert.equal(worker.promotion,false);
scheduled(0);await new Promise(r=>setImmediate(r));
assert.equal(context.__shibuyaState.promotion,false);
// HUD: modelled population, people on the crossing, queued and last-cycle crossings are separate numbers.
assert.equal(elements.get('agents').textContent,'8');assert.equal(elements.get('crossing').textContent,'3');assert.equal(elements.get('waiting').textContent,'2');assert.equal(elements.get('lastcycle').textContent,'4');
assert.equal(elements.get('rescued').hidden,true,'safety valve badge only appears when used');
// Forty 250 ms frames must advance the full ten wall seconds (4 FPS).
for(let i=1;i<=40;i++){now=i*250;scheduled(now);await new Promise(r=>setImmediate(r));}
assert.equal(worker.time,10);
assert.equal(context.__shibuyaState.backlogSeconds,0);
const queue=new StepQueue();queue.add(10);assert.equal(queue.take(),.5);assert.equal(queue.seconds,9.5);
console.log('PASS: promo OFF retained; HUD separates population/crossing/queued/last cycle; 4 FPS retains all elapsed time; requests cap at 0.5 s.');
