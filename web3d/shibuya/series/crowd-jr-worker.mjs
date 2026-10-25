// Worker for the JR episode crowd (crowd-jr.mjs). Messages ({id, type, …}) → reply {id, …} or {id, error}:
//  {type:'precompute', config, osm, plateau, traffic, opts?} → precomputeJR(…) result + ms (one deterministic run
//      for the overlay numbers, route walkers and the concourse model; terminate the worker afterwards).
//  {type:'init', config, osm, plateau, traffic} → live solver; reply = snapshot (+ layout, routes, gates, grid).
//  {type:'advance', seconds, camera?} → steps the live solver; reply = snapshot (positions/previous/motion/
//      states/roles transferred, as worker.mjs) with `jr` = jrState({camera}).
//  {type:'stats', camera?, radius?} → {jr: jrState(…)} without positions.
// Same config → same positions as the precomputed run (the solver is deterministic).
import {JRCrowdSimulation,precomputeJR} from './crowd-jr.mjs';
let sim;
self.onmessage=({data})=>{try{
 if(data.type==='precompute'){const t=performance.now();const r=precomputeJR(data.config,data.osm,data.plateau,data.traffic,data.opts||{});self.postMessage({id:data.id,...r,ms:performance.now()-t});return;}
 if(data.type==='init')sim=new JRCrowdSimulation(data.config,data.osm,data.plateau,data.traffic);
 if(data.type==='stats'){self.postMessage({id:data.id,jr:sim.jrState({camera:data.camera||null,radius:data.radius})});return;}
 if(data.type==='advance')sim.advance(data.seconds);
 const result=sim.snapshot();if(data.camera)result.jr=sim.jrState({camera:data.camera});
 if(data.type==='init'){result.layout=sim.layout;result.routes=sim.jrRoutes;result.gates=sim.jrGates;result.grid=sim.grid;}
 self.postMessage({id:data.id,...result},[result.positions.buffer,result.previous.buffer,result.motion.buffer,result.states.buffer,result.roles.buffer]);}
 catch(error){self.postMessage({id:data.id,error:String(error.stack||error)});}};
