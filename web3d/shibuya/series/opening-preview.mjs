// OP preview (title/motion role): the 3D agent's preview harness (preview-variants.mjs: scene + sets + static crowd,
// no solver) + the opening choreography of opening.mjs (op-flythrough with the slam shakes + the 3D logotype).
//   web3d/shibuya/series/opening-preview.html[?w=720&h=1280&people=2500]
//   await window.__opReady; window.__op.render(t) → {ms, phase, shot}
import './preview-variants.mjs';
import {createOpeningLogo,opFrame,OP_TIMELINE} from './opening.mjs';
while(!window.__pv)await new Promise(r=>setTimeout(r,50));
const pv=window.__pv,{scene,camera}=pv.debug;
const W=Number(new URLSearchParams(location.search).get('w')||720),H=Number(new URLSearchParams(location.search).get('h')||1280);
const op=await createOpeningLogo({scene,camera,aspect:W/H});
window.__op={timeline:OP_TIMELINE,render(t){const f=opFrame(t);const s=op.update(f.logo);const r=pv.render(f.shot.key,f.shot.params,f.shot.t);return {ms:Math.round(r.ms),phase:s.phase,shot:r.shot};}};
window.__opReady=true;
