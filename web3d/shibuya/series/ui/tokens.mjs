// Design tokens of the series game HUD (「ハロウィンの渋谷を脱出せよ！」 JR編 variants). DOM-free: importable from node
// (tools/variant_cues.mjs, tests) and from the browser (components.mjs injects cssVars() + fontFaceCSS()).
//
// Canvas: 720×1280 CSS px (9:16), recorded at device scale 1.5 → 1080×1920. SAFE = vertical-app safe areas
// (identical to overlay-jr.mjs SAFE): nothing important in the top 84 px, bottom 240 px, right 92 px.
// Fonts (all SIL OFL 1.1, files in web3d/fonts/ with OFL-*.txt):
//   display  Dela Gothic One      (headings, stamps, big words)       https://github.com/google/fonts/tree/main/ofl/delagothicone
//   body     Zen Kaku Gothic New  (JP body text, 500/700/900)          https://github.com/google/fonts/tree/main/ofl/zenkakugothicnew
//   hud      Rajdhani             (Latin HUD labels, digits, 600/700)  https://github.com/google/fonts/tree/main/ofl/rajdhani
// Family names are prefixed "GH " so a system-installed copy never substitutes for the shipped files.
// Motion: every animation is a pure function of time t (seconds) — use EASE/seg/hash, never CSS animations/transitions.

export const SAFE=Object.freeze({top:84,bottom:240,left:28,right:92,W:720,H:1280});

// Layout zones (CSS px). Components place themselves in these; all inside SAFE.
export const ZONE=Object.freeze({
 parody:{left:SAFE.left,top:SAFE.top+4},                 // ※パロディ sticker (opt-in only since the 2026-10-26 steering)
 clock:{right:SAFE.right+4,top:SAFE.top+4},              // game clock, right of the sticker
 header:{left:SAFE.left,top:SAFE.top+51},                // logotype lockup (2 lines, ≈ 74 px), below the clock row (fixer: +9 px, title no longer touches the clock box)
 top:{left:SAFE.left,right:SAFE.right,top:SAFE.top+130}, // mission / objective band
 center:{left:SAFE.left,right:SAFE.right,top:SAFE.top+200,bottom:SAFE.bottom+70}, // cards / choice / stamp
 low:{left:SAFE.left,right:SAFE.right-8,bottom:SAFE.bottom+64}, // captions, direction, sim chips (stack upward)
 foot:{left:SAFE.left,right:SAFE.right-20,bottom:SAFE.bottom+6,maxH:52}, // 出典 footnote (≤ 3 lines)
});

export const COLOR=Object.freeze({
 ink:'#0A0610',            // near-black violet
 panel:'#160C22',          // panel fill (top)
 panel2:'#0C0714',         // panel fill (bottom)
 paper:'#F3EDE1',          // cheat-sheet paper
 paperInk:'#170E22',
 text:'#F6F1E9', textDim:'#CFC5DC', textMute:'#9A8FAE',
 pumpkin:'#FF8A1F', pumpkinHi:'#FFB45A', pumpkinDeep:'#B4470A',   // primary accent
 candle:'#FFD23F',         // parody sticker / highlights
 violet:'#8E5BFF', violetDeep:'#3A1E6E',                          // secondary accent
 jr:'#00B261', jrHi:'#5BEA9A',                                    // JR編 badge colour (colour only, no logo)
 sim:'#7FE3FF', simDeep:'#0E3B4C',                                // simulation chips
 clear:'#4DF2A0', clearGold:'#FFE07A',                            // GAME CLEAR / ESCAPED
 over:'#9DB2CF', overDeep:'#1B2636', overInk:'#C7D6EA',           // GAME OVER = cold slate "caught in crowd" (not blood)
 gold:'#FFD35A', goldHi:'#FFF0B8', goldDeep:'#7A4E00',                       // TRUE END (v6): warm gold, distinct from CLEAR green
 warn:'#FF6FB1',           // in-game zone warning (magenta, deliberately NOT emergency red/yellow)
 line:'rgba(255,255,255,.14)',
});

export const FONT=Object.freeze({
 display:'"GH Dela Gothic One","Noto Sans CJK JP",sans-serif',
 body:'"GH Zen Kaku Gothic New","Noto Sans CJK JP",sans-serif',
 hud:'"GH Rajdhani","GH Zen Kaku Gothic New","Noto Sans CJK JP",sans-serif',
});
// path relative to web3d/fonts/
export const FONT_FILES=Object.freeze([
 {family:'GH Dela Gothic One',file:'DelaGothicOne-Regular.ttf',weight:400,license:'OFL-DelaGothicOne.txt'},
 {family:'GH Zen Kaku Gothic New',file:'ZenKakuGothicNew-Medium.ttf',weight:500,license:'OFL-ZenKakuGothicNew.txt'},
 {family:'GH Zen Kaku Gothic New',file:'ZenKakuGothicNew-Bold.ttf',weight:700,license:'OFL-ZenKakuGothicNew.txt'},
 {family:'GH Zen Kaku Gothic New',file:'ZenKakuGothicNew-Black.ttf',weight:900,license:'OFL-ZenKakuGothicNew.txt'},
 {family:'GH Rajdhani',file:'Rajdhani-SemiBold.ttf',weight:600,license:'OFL-Rajdhani.txt'},
 {family:'GH Rajdhani',file:'Rajdhani-Bold.ttf',weight:700,license:'OFL-Rajdhani.txt'},
]);

// Type scale (CSS px at 720 wide; ×1.5 in the video). Minimum readable on a phone ≈ 13 px (footnotes only).
export const TYPE=Object.freeze({
 stamp:78, hero:54, title:36, h1:30, h2:24, caption:27, body:20, small:16.5, chip:15, label:13.5, foot:12.5,
});
export const SPACE=Object.freeze({xs:4,s:8,m:12,l:16,xl:24,xxl:36});
export const CUT=Object.freeze({s:8,m:14,l:22});      // angled corner cuts (px)
export const BORDER=2;
export const GLOW=Object.freeze({
 pumpkin:'0 0 18px rgba(255,138,31,.55)', violet:'0 0 18px rgba(142,91,255,.5)', sim:'0 0 12px rgba(127,227,255,.45)',
 clear:'0 0 26px rgba(77,242,160,.7)', over:'0 0 22px rgba(157,178,207,.45)', drop:'0 10px 24px rgba(0,0,0,.6)',
});

// ---- motion (deterministic) ----
export const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export const seg=(t,a,b)=>clamp((t-a)/(b-a));          // normalised progress of t in [a,b]
export const mix=(a,b,k)=>a+(b-a)*k;
export const EASE=Object.freeze({
 linear:k=>k,
 inCubic:k=>k*k*k,
 outCubic:k=>1-Math.pow(1-k,3),
 inOutCubic:k=>k<.5?4*k*k*k:1-Math.pow(-2*k+2,3)/2,
 outExpo:k=>k>=1?1:1-Math.pow(2,-10*k),
 outBack:k=>{const c1=1.70158,c3=c1+1;return 1+c3*Math.pow(k-1,3)+c1*Math.pow(k-1,2);},
 outElastic:k=>k<=0?0:k>=1?1:Math.pow(2,-10*k)*Math.sin((k*10-.75)*(2*Math.PI)/3)+1,
 smooth:k=>k*k*(3-2*k),
});
// integer hash → [0,1) (deterministic jitter for glitch / grit; same output for the same frame everywhere)
export const hash=(n,seed=0)=>{let x=(Math.floor(n)*374761393+seed*668265263)|0;x=(x^(x>>>13))*1274126177|0;x^=x>>>16;return (x>>>0)/4294967296;};
export const MOTION=Object.freeze({
 fps:30,
 enter:.32,      // default slide/scale-in
 glitch:.30,     // glitch-in burst
 exit:.22,       // fade-out at end of an item's dur
 stagger:.08,    // per row
 stampDrop:.16,  // stamp falls from 2.6× to 1× in this time
 stampSpread:.35,// ink spread after impact
 cursorMove:.22, // choice cursor hop
 blink:1.1,      // PRESS START blink period
});

// CSS custom properties (the single source of the values used by hud.css)
export function cssVars(){
 const v={};
 for(const [k,c] of Object.entries(COLOR))v[`--gh-${k}`]=c;
 for(const [k,f] of Object.entries(FONT))v[`--gh-f-${k}`]=f;
 for(const [k,s] of Object.entries(TYPE))v[`--gh-t-${k}`]=s+'px';
 for(const [k,s] of Object.entries(CUT))v[`--gh-cut-${k}`]=s+'px';
 for(const [k,g] of Object.entries(GLOW))v[`--gh-glow-${k}`]=g;
 v['--gh-safe-top']=SAFE.top+'px';v['--gh-safe-bottom']=SAFE.bottom+'px';v['--gh-safe-left']=SAFE.left+'px';v['--gh-safe-right']=SAFE.right+'px';
 return `#gh{${Object.entries(v).map(([k,x])=>`${k}:${x}`).join(';')}}`;
}
// @font-face rules; base = URL of web3d/fonts/ (default: resolved from this module)
export function fontFaceCSS(base){
 const b=base??new URL('../../../fonts/',import.meta.url).href;
 return FONT_FILES.map(f=>`@font-face{font-family:"${f.family}";src:url("${b}${f.file}") format("truetype");font-weight:${f.weight};font-style:normal;font-display:block}`).join('\n');
}
// fonts the page must wait for (document.fonts.load(spec, sample)) before the first recorded frame
export const FONT_LOADS=Object.freeze(FONT_FILES.map(f=>`${f.weight} 20px "${f.family}"`));
