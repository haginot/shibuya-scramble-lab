// Game-OP choreography of the series 「ハロウィンの渋谷を脱出せよ！」 JR編 (shared opening of every variant; no persistent ※パロディ label since the 2026-10-26 steering):
//   ① cinematic night-Shibuya flythrough (SHOTS['op-flythrough'], shots-variants.mjs: street-level rush across the
//      Scramble → swoop up the tower face → city reveal)
//   ② 3D logo burn-in + SLAM (ui/logo3d.mjs: glyphs fly in hot, backing slabs burn in, slam with camera shake, flash,
//      shockwave, sparks, dust; 「JR編」 ticket drops in; subtitle bar wipes in; light sweep)
//   ③ original PRESS START beat (3D line 「PRESS START」 + 「▶ 脱出をはじめる」, pulsing; a "pressed" hit; the lockup
//      dissolves into embers → clean cut to the prologue cards of _opening.json).
// Everything is a pure function of the opening time t (s) — deterministic per frame.
//
// Timeline (seconds of the opening part; OP_TIMELINE):
//   0.00 ─ fly ─ 3.60 logo starts (burn-in) ─ 4.50 SLAM ─ 4.92 JR編 ─ 5.15–5.65 subtitle ─ 5.65–6.6 sweep
//   6.10 PRESS START line on ─ 7.10 "pressed" hit ─ 7.25–7.70 dissolve ─ 7.70 OP ends (prologue cards follow)
//
// API
//   OP_TIMELINE                         the numbers above (+ flyDur passed to op-flythrough)
//   openingBeats({prologue=[]})         → beats[] for variants/jr/_opening.json (writer may copy / extend; the logo
//                                         HUD item carries {c:'logo', press, outAt, outDur, params:{hitAt}} in the
//                                         variant-system schema; shots continue via shot.t0; slam shake via params.shake)
//   opShakes()                          → [{t, amp, decay, freq}] camera shakes for SHOTS['op-flythrough'] params.shake
//                                         (logo slam + badge drop, in op-flythrough local time = opening time)
//   opFrame(t)                          → {shot:{key, params, t}, logo:{t, press, dissolve, params}|null} — reference
//                                         per-frame spec (what variant-system frameSpec yields for openingBeats())
//   createOpeningLogo({scene, camera, aspect, data?, sdf?, options?}) → Promise<OpeningLogo>
//     OpeningLogo.update(logoSpec|null) → {flash, impact, phase}   logoSpec = frameSpec(...).logo ({t, press, dissolve,
//                                         params:{hitAt?}}); null hides the logo
//     OpeningLogo.logo                  the Logo3D (attached to scene/camera: drawn over the frame in the host HDR pass)
//     OpeningLogo.dispose()
import {Logo3D,loadLogoGlyphs,loadLogoSdf,LOGO_TIMELINE} from './ui/logo3d.mjs';

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const fr=s=>Math.round(s*30)/30;// whole frames at 30 fps
const L=LOGO_TIMELINE;
export const OP_TIMELINE=Object.freeze({
 flyDur:5.6,             // op-flythrough move length (then a slow push)
 logoAt:3.6,             // logo sequence t=0 (burn-in starts while the camera climbs)
 slam:3.6+L.slam,        // 4.50
 badge:3.6+L.badge,      // 4.92
 pressAt:6.1,            // PRESS START line appears
 hitAt:7.1,              // "pressed" (logo sequence time 3.5)
 outAt:7.25,outDur:.45,  // dissolve into embers
 end:7.7,                // OP part ends here (prologue cards follow in _opening.json)
});
const O=OP_TIMELINE;

export function opShakes(){return [{t:O.slam,amp:.55,decay:.32,freq:11},{t:O.badge+.02,amp:.18,decay:.22,freq:13}];}
const flyParams=()=>({dur:O.flyDur,shake:opShakes()});

// Beats for _opening.json (OP part). Times are whole frames at 30 fps: 3.6 = 108 f, 2.5 = 75 f, 1.6 = 48 f.
export function openingBeats({prologue=[]}={}){
 const p=flyParams();
 return [
  {id:'op-fly',dur:O.logoAt,shot:{key:'op-flythrough',params:p},header:false,hud:[],
   cues:[{at:0,sfx:'whoosh',gain_db:-4},{at:1.2,sfx:'whoosh',gain_db:-6}],bgm:'tension',amb:'crowd-night'},
  {id:'op-logo',dur:fr(O.pressAt-O.logoAt),shot:{key:'op-flythrough',params:p,t0:O.logoAt},header:false,
   hud:[{c:'logo',factIds:[]}]},
  {id:'op-press',dur:fr(O.end-O.pressAt),shot:{key:'op-flythrough',params:p,t0:O.pressAt},header:false,
   hud:[{c:'logo',press:true,outAt:fr(O.outAt-O.pressAt),outDur:O.outDur,params:{hitAt:fr(O.hitAt-O.logoAt)},factIds:[]}],
   cues:[{at:fr(O.hitAt-O.pressAt),sfx:'ui_select'},{at:fr(O.outAt-O.pressAt),sfx:'whoosh',gain_db:-6}]},
  ...prologue];}

// Reference per-frame spec for the OP (previews / tests); the page uses variant-system frameSpec instead.
export function opFrame(t){
 const shot={key:'op-flythrough',params:flyParams(),t};
 if(t<O.logoAt)return {shot,logo:null};
 if(t>=O.end)return {shot,logo:null};
 const press=t>=O.pressAt,dissolve=press?clamp((t-O.outAt)/O.outDur):0;
 return {shot,logo:{t:t-O.logoAt,press,dissolve,params:{hitAt:O.hitAt-O.logoAt}}};}

export class OpeningLogo{
 constructor(logo){this.logo=logo;}
 update(spec){const g=this.logo;
  if(!spec){g.setPress(false,0);g.setTime(-1);g.setDissolve(0);return {flash:0,impact:0,phase:'hidden'};}
  const hit=spec.params?.hitAt;const k=hit!=null&&spec.t>=hit?Math.exp(-(spec.t-hit)*5):0;
  g.setPress(!!spec.press,k);g._dissolve=Math.max(0,Math.min(1,spec.dissolve||0));g.setDissolve(g._dissolve);g.setTime(spec.t);
  const s=g.state;return {flash:s.flash,impact:s.impact,phase:s.phase};}
 dispose(){this.logo.dispose();}
}
export async function createOpeningLogo({scene,camera,aspect=9/16,data=null,sdf=null,options={}}={}){
 const [d,s]=await Promise.all([data??loadLogoGlyphs(),sdf??loadLogoSdf()]);
 // frame.y -.08 (Logo3D default -.32): lockup ≈5 % higher so 「▶ 脱出をはじめる」 clears the 出典 footnote line
 const logo=new Logo3D({data:d,sdf:s,aspect,press:true,frame:{y:-.08},...options});logo.attach(scene,camera);logo.setTime(-1);
 return new OpeningLogo(logo);}
