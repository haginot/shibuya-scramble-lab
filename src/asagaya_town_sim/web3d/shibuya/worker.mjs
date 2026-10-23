import {Simulation} from './simulation.mjs';
import {HalloweenSimulation} from './halloween.mjs';
import {DispersalSimulation} from './dispersal.mjs';
let sim;
const create=({config,osm,plateau,traffic})=>config.mode==='dispersal'?new DispersalSimulation(config,osm,plateau,traffic):config.mode==='halloween'?new HalloweenSimulation(config,osm,plateau,traffic):new Simulation(config,osm,plateau,traffic);
self.onmessage=({data})=>{try{if(data.type==='init')sim=create(data);if(data.type==='promo')sim.promo=data.enabled;const result=data.type==='advance'?sim.advance(data.seconds):sim.snapshot();if(data.type==='init'&&sim.layout)result.layout=sim.layout;if(data.type==='init'&&sim.scenario)result.scenario=sim.scenario;self.postMessage({id:data.id,...result},[result.positions.buffer,result.previous.buffer,result.motion.buffer,result.states.buffer,result.roles.buffer]);}catch(error){self.postMessage({id:data.id,error:String(error.stack||error)});}};
