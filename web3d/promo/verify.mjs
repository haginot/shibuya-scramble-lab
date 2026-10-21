// Exercise the real promotion renderer with three.js and a deterministic DOM/RAF shim.
// Run: node --experimental-vm-modules web3d/promo/verify.mjs
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SourceTextModule,SyntheticModule,createContext} from 'node:vm';
const root=new URL('./',import.meta.url);
const [vendorSource,citySource,appSource,html,css]=await Promise.all(
 ['../vendor/three.module.min.js','city.mjs','app.mjs','index.html','style.css'].map(p=>readFile(new URL(p,root),'utf8')));
const datasets={};
for(const name of ['engine','buildings','terrain','promo'])datasets[`../data/${name}.json`]=JSON.parse(await readFile(new URL(`../data/${name}.json`,root),'utf8'));
class Element{
 constructor(tag='div'){this.tagName=tag;this.children=[];this.style={};this.hidden=false;this._text='';}
 set textContent(v){this._text=String(v);this.children=[];}
 get textContent(){return this._text+this.children.map(v=>v.textContent).join('');}
 append(...v){this.children.push(...v);}
 replaceChildren(...v){this._text='';this.children=v;}
 get offsetHeight(){return this.className==='stats'?88:24;}
 getBoundingClientRect(){return {top:82,left:0,width:1280,height:476,bottom:558};}
 getContext(){return {beginPath(){},arc(){},fill(){},stroke(){}};}
}
async function boot(search='?speed=25',overrides={}){
 const elements=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],new Element()]));
 const document={body:new Element('body'),getElementById:id=>elements.get(id),createElement:tag=>new Element(tag)};
 let now=0,scheduled,draws=[];const errors=[];
 const context=createContext({document,console:{error:e=>errors.push(String(e))},location:{search},URLSearchParams,devicePixelRatio:1,innerWidth:1280,innerHeight:720,
  performance:{now:()=>now},requestAnimationFrame:cb=>scheduled=cb,
  fetch:async path=>({ok:true,json:async()=>structuredClone(overrides[path]||datasets[path])})});context.window=context;
 const vendor=new SourceTextModule(vendorSource,{context});await vendor.link(()=>{throw Error('unexpected import');});await vendor.evaluate();
 const THREE=vendor.namespace;
 class Renderer{
  constructor(){this.domElement=new Element('canvas');}
  setPixelRatio(){} setScissorTest(){} setSize(){}
  setViewport(x,y,w,h){this.viewport=[x,y,w,h];} setScissor(){}
  render(scene,camera){scene.updateMatrixWorld();draws.push({viewport:this.viewport,camera});}
 }
 const graphics=new SyntheticModule(Object.keys(THREE),function(){for(const key of Object.keys(THREE))this.setExport(key,key==='WebGLRenderer'?Renderer:THREE[key]);},{context});
 const city=new SourceTextModule(citySource,{context});await city.link(()=>graphics);
 const app=new SourceTextModule(appSource,{context});await app.link(spec=>spec==='./city.mjs'?city:graphics);await app.evaluate();
 for(let i=0;!context.__ready&&!context.__promoState?.error&&i<30;i++)await new Promise(r=>setImmediate(r));
 assert.deepEqual(errors,[]);assert(context.__ready);assert(context.__promoState.ready);
 return {context,elements,advance(ms){now=ms;const cb=scheduled;scheduled=null;draws=[];cb(now);return draws;}};
}
const app=await boot();const w=app.context,data=datasets['../data/promo.json'];
assert.equal(w.__promoState.combos.length,4);
app.advance(-1);assert.equal(w.__promoState.frameIndex,0);
const panels=app.elements.get('panels').children;
assert(panels.every(p=>p.textContent.includes('seed 0の1試行')));
assert(app.elements.get('sample-note').textContent.includes('200体 / 全400体'));
for(const ms of [0,1000,12000,24999,25000,29966]){
 const draws=app.advance(ms);
 assert.equal(draws.length,4);
 // Every viewport ends above the caption/footer band. Its coordinates are WebGL bottom-up.
 for(const {viewport:[x,y,width,height]} of draws){assert(y>=162);assert(y+height<=638);assert(width===640);assert(height===238);}
 const idx=w.__promoState.frameIndex;
 assert(idx>=0&&idx<data.combinations.none.frames.length);
 for(const [i,name]of Array.from(w.__promoState.combos).entries()){
  const m=data.combinations[name].frames[idx].metrics,text=panels[i].textContent;
  assert(text.includes(`来訪/Visits ${m.total_visits.toFixed(0)}`));
  assert(text.includes(`累積ROI・全期間費用計上`));
  assert(text.includes('mean'));
  assert(!text.includes('現在 '));
 }
 assert.equal(app.elements.get('summary-card').hidden,ms<25000);
}
const summary=app.elements.get('summary-results').textContent;
assert(summary.includes('-3.0%'));assert(summary.includes('27.0%')===false);
assert(app.elements.get('summary-title').textContent.includes('8試行平均'));
assert(summary.includes('95%'));
assert(summary.includes('総費用/Total cost')&&summary.includes('増分利益/Net gain'));
w.__caption('</script>日本語','<b>English</b>');
assert.equal(app.elements.get('ja').textContent,'</script>日本語');
assert.equal(app.elements.get('en').textContent,'<b>English</b>');
const empty=structuredClone(data);
for(const r of Object.values(empty.combinations))r.frames[0].metrics.would_have_come_anyway_share=null;
const zero=await boot('?speed=25',{'../data/promo.json':empty});zero.advance(0);
assert(zero.elements.get('panels').textContent.includes('Anyway N/A'));
for(const required of ['国土地理院の標高タイルを加工して作成','https://www.openstreetmap.org/copyright','https://opendatacommons.org/licenses/odbl/1-0/','../data/NOTICE','../data/index.html'])assert(html.includes(required),required);
assert(css.includes('--caption-height:74px'));
assert(css.includes('var(--footer-height) + var(--caption-height)'));
console.log('PASS: promotion data, 4 viewports, caption band, one-trial/mean ROI, end card, N/A, captions and attribution.');
