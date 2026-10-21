import {Simulation} from './simulation.mjs';
let sim;
self.onmessage=({data})=>{try{if(data.type==='init')sim=new Simulation(data.config,data.osm,data.plateau,data.traffic);if(data.type==='promo')sim.promo=data.enabled;const result=data.type==='advance'?sim.advance(data.seconds):sim.snapshot();self.postMessage({id:data.id,...result},[result.positions.buffer,result.states.buffer]);}catch(error){self.postMessage({id:data.id,error:String(error.stack||error)});}};
