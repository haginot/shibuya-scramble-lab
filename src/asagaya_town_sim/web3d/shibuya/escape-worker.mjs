// One deterministic escape run for the v4 video (escape.mjs precomputeEscape), off the main thread.
// Posts {levels, summary, keyframes, keyframe} once; the page then terminates this worker (frees its crowd).
import {precomputeEscape} from './escape.mjs';
self.onmessage=({data})=>{try{const t=performance.now();const r=precomputeEscape(data.config,data.osm,data.plateau,data.traffic);self.postMessage({id:data.id,...r,ms:performance.now()-t});}
 catch(error){self.postMessage({id:data.id,error:String(error.stack||error)});}};
