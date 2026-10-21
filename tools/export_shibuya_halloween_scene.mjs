// Export the actual authored three.js scene for the socket-free CPU recorder.
import {mkdir,writeFile} from 'node:fs/promises';
import {readFileSync,writeFileSync} from 'node:fs';
import {makeNightScene} from '../web3d/shibuya/halloween-scene.mjs';
import {HalloweenModel,navigation,experiment} from '../web3d/shibuya/halloween-model.mjs';
import {storyAt} from '../web3d/shibuya/halloween-story.mjs';
const canvases=[];
class Canvas{
 constructor(){this.width=0;this.height=0;this.ops=[];canvases.push(this);this.context={fillStyle:'#fff',beginPath:()=>{},arc:(...args)=>this.arc=args,fill:()=>this.ops.push({kind:'arc',args:this.arc,style:this.context.fillStyle}),fillRect:(...args)=>this.ops.push({kind:'rect',args,style:JSON.parse(JSON.stringify(this.context.fillStyle))}),clearRect:()=>this.ops=[],createLinearGradient:(...args)=>gradient('linear',args),createRadialGradient:(...args)=>gradient('radial',args)};}
 getContext(){return this.context;}
}
function gradient(kind,args){return{kind,args,stops:[],addColorStop(t,color){this.stops.push([t,color]);}};}
globalThis.document={createElement:()=>new Canvas()};
const root=new URL('../',import.meta.url),load=name=>JSON.parse(readFileSync(new URL(`web3d/data/shibuya_${name}.json`,root),'utf8'));
const plateau=load('plateau'),osm=load('osm'),nav=navigation(plateau),night=makeNightScene(plateau,osm,nav),{THREE}=night;
const out=process.argv[2];if(!out)throw Error('supply output directory');await mkdir(out,{recursive:true});
const objects=[];night.scene.traverse(o=>{if(o.isMesh||o.isPoints||o.isLine)objects.push(o);});
const geometries=[],geometryMap=new Map(),chunks=[];let offset=0;
function buffer(a){const b=Buffer.from(a.buffer,a.byteOffset,a.byteLength),r={offset,count:a.length};chunks.push(b);offset+=b.length;return r;}
for(const o of objects){const g=o.geometry;if(geometryMap.has(g))continue;const id=geometries.length;geometryMap.set(g,id);const non=g.index?g.toNonIndexed():g;const attrs={};for(const key of ['position','normal','color','uv'])if(non.attributes[key])attrs[key]=buffer(new Float32Array(non.attributes[key].array));geometries.push({attrs,count:non.attributes.position.count});}
const material=m=>({color:m.color?.toArray()||[1,1,1],emissive:m.emissive?.toArray()||[0,0,0],emissiveIntensity:m.emissiveIntensity||0,opacity:m.opacity??1,basic:m.isMeshBasicMaterial||m.isPointsMaterial||m.isLineBasicMaterial||false,transparent:m.transparent,depthWrite:m.depthWrite,vertexColors:m.vertexColors,map:m.map?canvases.indexOf(m.map.image):-1,emissiveMap:m.emissiveMap?canvases.indexOf(m.emissiveMap.image):-1,size:m.size||1});
const descriptors=objects.map(o=>({geometry:geometryMap.get(o.geometry),kind:o.isPoints?'points':o.isLineSegments?'segments':o.isLine?'line':'triangles',material:material(o.material)}));
const dynamic=objects.map((o,i)=>({o,i})).filter(({o})=>o.isPoints);
const staticCanvas=()=>canvases.map(c=>({width:c.width,height:c.height,ops:c.ops}));
await writeFile(`${out}/geometry.bin`,Buffer.concat(chunks));
await writeFile(`${out}/scene.json`,JSON.stringify({geometries,objects:descriptors,textures:staticCanvas(),dynamic:dynamic.map(({o,i})=>({object:i,position_count:o.geometry.attributes.position.array.length,color_count:o.geometry.attributes.color?.array.length||0}))}));
const metrics=experiment(plateau);await writeFile(`${out}/metrics.json`,JSON.stringify(metrics,null,2)+'\n');
let no=new HalloweenModel(nav),promo=new HalloweenModel(nav,{promotion:true});
const selected=process.argv.includes('--preview')?[24,281,444,528,624]:Array.from({length:577},(_,i)=>i);
const camera=new THREE.PerspectiveCamera(43,1080/1310,.5,2500);
function frame(model,seconds,promoted,fixed=false){
 const x=Math.max(0,Math.min(1,(seconds-3)/15)),u=fixed?0:x*x*(3-2*x);camera.position.set(-200+u*70+(fixed?0:Math.min(seconds,6)*6),285-u*55,-220+u*70);camera.lookAt(0,5,4);camera.updateMatrixWorld();night.update(model,seconds,promoted);night.scene.updateMatrixWorld(true);
 const data=[...camera.projectionMatrix.elements,...camera.matrixWorldInverse.elements];
 for(const o of objects){let visible=true;for(let p=o;p;p=p.parent)visible&&=p.visible;data.push(...o.matrixWorld.elements,visible?1:0,o.geometry.drawRange.count===Infinity?o.geometry.attributes.position.count:o.geometry.drawRange.count);}
 for(const{o}of dynamic){data.push(...o.geometry.attributes.position.array);if(o.geometry.attributes.color)data.push(...o.geometry.attributes.color.array);}
 return Buffer.from(new Float32Array(data).buffer);
}
for(const i of selected){const seconds=i/24,story=storyAt(seconds),model=story.promoted?promo:no;model.advanceTo(story.simTime);writeFileSync(`${out}/frame-${String(i).padStart(5,'0')}.bin`,frame(model,seconds,story.promoted));writeFileSync(`${out}/state-${String(i).padStart(5,'0')}.json`,JSON.stringify({...story,seconds,state:model.snapshot()}));}
for(const[prefix,promoted]of[['no',false],['promo',true]]){const model=new HalloweenModel(nav,{promotion:promoted});model.advanceTo(900);await writeFile(`${out}/compare-${prefix}.bin`,frame(model,19,promoted,true));}
console.log(`Exported ${selected.length} scene frames, ${objects.length} objects, ${offset} geometry bytes.`);
