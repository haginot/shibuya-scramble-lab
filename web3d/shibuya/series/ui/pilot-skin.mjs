// Design-system skin for the series PILOT overlay (overlay-jr.mjs, ?mode=series&ep=jr without `variant`).
// The pilot keeps its own DOM structure, copy, fact ids and per-frame record (tools/record_series.py checks stay valid);
// this module only restyles it with the shared HUD design system of the variants (ui/tokens.mjs + the hud.css look):
// GH fonts (Dela Gothic One / Zen Kaku Gothic New / Rajdhani, SIL OFL 1.1, web3d/fonts/), angled bevelled panels,
// pumpkin/violet accents, cyan simulation chips, slate-blue GAME OVER (never blood red), paper cheat sheet.
// No CSS animations / transitions (frames stay a pure function of t). Opt out with ?skin=flat.
//   import {applyPilotSkin} from './ui/pilot-skin.mjs'; await applyPilotSkin(document);   // css + fonts loaded
import {COLOR,SAFE,cssVars,fontFaceCSS,FONT_LOADS} from './tokens.mjs';

const C=COLOR;
const panel=(a=C.pumpkin)=>`background:linear-gradient(180deg,${C.panel}f2,${C.panel2}f2)!important;border:0!important;border-radius:0!important;
 clip-path:polygon(12px 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%,0 12px);
 box-shadow:inset 0 0 0 1.5px ${a}aa,inset 0 1px 0 #ffffff22,inset 0 0 28px ${C.violet}33!important`;
export const PILOT_SKIN_CSS=()=>`${fontFaceCSS()}
${cssVars().replace('#gh{','#sj{')}
#sj{font-family:var(--gh-f-body)}
#sj .h{font:400 24px/1.25 var(--gh-f-display),"Noto Color Emoji"!important;color:${C.pumpkinHi};letter-spacing:.01em}
#sj .h2{font-family:var(--gh-f-body)!important;font-weight:900!important}
#sj .l,#sj .m,#sj .sm,#sj .lab{font-family:var(--gh-f-body),"Noto Color Emoji"!important}
#sj-parody{background:${C.candle}!important;border-radius:0!important;font:900 17px/1.2 var(--gh-f-body)!important;clip-path:polygon(6px 0,100% 0,100% 100%,0 100%,0 6px);box-shadow:inset 0 -2px 0 rgba(0,0,0,.25)!important}
#sj-head .t{font:400 31px/1.18 var(--gh-f-display),"Noto Color Emoji"!important;-webkit-text-stroke:5px #12061C!important;text-shadow:0 0 14px rgba(255,138,31,.55),0 2px 0 #3A1200!important}
#sj-head .s{font:900 19px/1.2 var(--gh-f-body)!important;color:${C.pumpkinHi}!important;-webkit-text-stroke:4px #12061C!important}
#sj-clock{${panel()};padding:3px 12px 4px!important;font:700 14px/1.3 var(--gh-f-body)!important;color:${C.pumpkinHi}!important}
#sj-clock b{font:700 21px/1 var(--gh-f-hud)!important;letter-spacing:.06em;color:#fff!important}
#sj-card>.p{${panel()};padding:18px 20px!important}
#sj-top .b{${panel(C.violet)};padding:8px 15px!important;font:900 21px/1.3 var(--gh-f-body),"Noto Color Emoji"!important;color:${C.pumpkinHi}!important}
#sj-top .b.sub{font:700 16.5px/1.35 var(--gh-f-body),"Noto Color Emoji"!important;color:${C.text}!important}
#sj-caps .c{${panel()};border-left:0!important;padding:10px 16px 10px 20px!important;font:900 26px/1.32 var(--gh-f-body),"Noto Color Emoji"!important;
 background:linear-gradient(90deg,${C.pumpkin} 0 5px,${C.panel}f0 5px,${C.panel2}e8)!important}
#sj-caps .c.s{font:700 18px/1.35 var(--gh-f-body)!important;background:linear-gradient(90deg,${C.sim} 0 4px,${C.panel}f0 4px,${C.panel2}e8)!important;box-shadow:inset 0 0 0 1.5px ${C.sim}66!important}
#sj-caps .c.n{font:700 15px/1.35 var(--gh-f-body)!important;background:linear-gradient(90deg,${C.textMute} 0 4px,${C.panel}e8 4px,${C.panel2}e0)!important;box-shadow:inset 0 0 0 1px #ffffff33!important}
#sj-tags span{font:700 13.5px/1.2 var(--gh-f-body)!important;background:${C.simDeep}e6!important;border:1px solid ${C.sim}!important;color:${C.sim}!important;border-radius:0!important;
 clip-path:polygon(5px 0,100% 0,100% calc(100% - 5px),calc(100% - 5px) 100%,0 100%,0 5px)}
#sj-tags span.a{border-color:${C.candle}!important;color:${C.candle}!important;background:#2A1A00e6!important}
#sj-pins .pin .tx{${panel('var(--c,'+C.pumpkin+')')};font:900 16px/1.3 var(--gh-f-body),"Noto Color Emoji"!important;padding:5px 11px!important}
#sj-pins .pin.big .tx{font:900 21px/1.25 var(--gh-f-body),"Noto Color Emoji"!important}
#sj-pins .box{${panel('var(--c,'+C.clear+')')};font:700 15.5px/1.35 var(--gh-f-body)!important;padding:8px 12px!important}
#sj-pins .box b{font:900 19px/1.3 var(--gh-f-body)!important}
#sj-stamp .g{font:400 64px/1 var(--gh-f-display)!important;letter-spacing:.03em!important;padding:10px 22px 14px;border:6px solid currentColor;
 -webkit-text-stroke:4px #12061C!important;box-shadow:0 0 0 3px #12061Caa,inset 0 0 0 3px #12061Caa}
#sj-stamp .g.esc{color:${C.clear}!important;text-shadow:0 0 26px ${C.clear}aa!important}
#sj-stamp .g.over{color:${C.over}!important;text-shadow:0 0 22px #6A86B0aa!important}
#sj-stamp .x{${panel(C.sim)};font:900 19px/1.35 var(--gh-f-body)!important;padding:7px 14px!important;color:${C.sim}!important}
#sj-foot{font:500 12.5px/1.35 var(--gh-f-body)!important}
#sj-cold{background:linear-gradient(180deg,#24103Af4,#160A26f4)!important;border:0!important;box-shadow:inset 0 0 0 2px ${C.violet},inset 0 0 0 5px #12061C,inset 0 0 0 6.5px ${C.candle}88!important}
#sj-cold .is{font:900 14.5px/1.3 var(--gh-f-body)!important;border-radius:0!important}
#sj-cold .hd{font:400 30px/1.25 var(--gh-f-display)!important}
#sj-cold .bd{font:900 25px/1.4 var(--gh-f-body)!important}
#sj-cold .cue{font:900 18px/1.35 var(--gh-f-body)!important;border-radius:0!important}
#sj-title .tc{font:400 52px/1.16 var(--gh-f-display),"Noto Color Emoji"!important;-webkit-text-stroke:8px #12061C!important}
#sj-title .ts{font:900 30px/1.3 var(--gh-f-body)!important}
#sj-title .tl{${panel()};font:700 17px/1.4 var(--gh-f-body)!important}
#sj-cheat{background:${C.paper}!important;clip-path:polygon(12px 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%,0 12px);box-shadow:inset 0 0 0 3px ${C.pumpkin}!important;color:${C.paperInk}!important}
#sj-cheat .h{font:400 23px/1.25 var(--gh-f-display)!important;color:#B4470A!important}
#sj-cheat .m{font:700 16px/1.35 var(--gh-f-body)!important;color:${C.paperInk}!important}
#sj-end .tt{font:400 26px/1.25 var(--gh-f-display),"Noto Color Emoji"!important}
#sj-end .q{font:900 22px/1.3 var(--gh-f-body)!important}
#sj-end ul{font:500 12.5px/1.45 var(--gh-f-body)!important}
#sj-ask .q{font:400 31px/1.3 var(--gh-f-display),"Noto Color Emoji"!important;-webkit-text-stroke:7px #12061C!important}
#sj-ask .c{font:900 27px/1.3 var(--gh-f-body),"Noto Color Emoji"!important}
`;
export const SKIN_SAFE=SAFE;
export async function applyPilotSkin(doc=document){
 const st=doc.createElement('style');st.id='sj-skin';st.textContent=PILOT_SKIN_CSS();doc.head.append(st);
 await Promise.all(FONT_LOADS.map(s=>doc.fonts.load(s,'渋谷脱出せよ！ABC0123')));await doc.fonts.ready;return true;}
