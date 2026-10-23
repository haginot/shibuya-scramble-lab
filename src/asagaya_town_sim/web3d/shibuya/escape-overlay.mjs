// v4 game HUD for "🧙ハロウィンの渋谷を脱出せよ！🎃 / Escape Shibuya on Halloween!" (DOM only).
// Everything is driven by video time and the escape run's playback state of the same frame, so
// one capture serves both languages (body.lang-ja / body.lang-en) and the 9:16 cut (body.vcut hides
// the 16:9 panels and keeps the projected map labels, scaled ×1.25).
// update() returns the overlay record the recorder checks (window.__hwOverlay): every shown sim
// number next to its source value, the fact ids on screen (claims) and in the footnote bar, the
// projected label positions, and the shown strings per language for tools/compose_vertical.py.
// Copy: escape-copy.mjs (facts carry research-practical.md ids); sim numbers: escape.mjs.
import {HOOK,TITLE,MISSION,HUD,STAMPS,RESULT,TEASER,scenario,OVERVIEW,QUESTION,END_CARD,FOOTNOTE_COPY,END_SOURCES,SCENARIOS} from './escape-copy.mjs';
import {SOURCES,FACT_SOURCES,CROWD_2026} from './sources-halloween.mjs';
import {BEAT,LEVEL_SECONDS} from './director-halloween.mjs';

export const fmt=v=>Math.round(v).toLocaleString('en-US');
export const p2=v=>(Math.round(v*10)/10).toFixed(1);
export const mmss=s=>s==null?null:`${String(Math.floor(s/60)).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`;
export const DANGER_STEPS=[1,2,3,4];// p/m² (escape.mjs ESCAPE.dangerLevels)
export const dangerLevel=v=>DANGER_STEPS.filter(t=>v>=t).length;
export const DANGER_COLORS=['#4FE3C1','#FFD23F','#FF7A1A','#FF2A3A','#B0002A'];
// Escape rule (escape.mjs ESCAPE.rule): ESCAPED iff arrived within simLimit and < denseMax s at ≥ 3 p/m².
export function ruleOutcome({arrived,arriveAt,denseSeconds,simTime,simLimit,denseMax}){
 if(denseSeconds>=denseMax)return 'caught';if(arrived)return arriveAt<=simLimit?'escaped':'caught';return simTime>simLimit?'caught':null;}
// Map label safe area: inside the 9:16 crop column (x 160–1120) and below the header.
export const SAFE={x0:172,x1:1108,y0:80,y1:652};
// Label boxes stay between the 16:9 panels (levels) / right of the results panel (overview), above the callout.
export const LABEL_RECT={level:{x0:296,x1:984,y0:72,y1:582},all:{x0:458,x1:1112,y0:72,y1:650}};
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const easeOut=t=>1-Math.pow(1-clamp(t),3);
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const EMOJI=/(\p{Extended_Pictographic}️?)/gu;
const EMOJI1=/\p{Extended_Pictographic}/u;
const emo=s=>esc(s).replace(EMOJI,'<span class="emo">$1</span>');
const br=s=>emo(s).replace(/\n/g,'<br>');
const one=s=>emo(s).replace(/\n/g,lineJoin(s));
const lineJoin=s=>' ';
const L=(en,ja)=>`<span class="l-en">${en}</span><span class="l-ja">${ja}</span>`;
const T=(o,f=br)=>L(f(o.en),f(o.ja));

// ---- footnotes: numbered source groups (outlet + year), same numbers in both languages ----
export function sourceGroups(factIds){const list=[],at=new Map(),num={};
 for(const id of factIds){const f=FACT_SOURCES[id];if(!f)throw Error(`unknown fact id ${id}`);
  for(const k of f.src){const s=SOURCES[k],y=s.noYear?'':s.date.slice(0,4),g=`${s.ja}|${y}`;if(!at.has(g)){at.set(g,list.length+1);list.push({n:list.length+1,ja:s.noYear?s.ja:`${s.ja} ${y}`,en:s.noYear?s.en:`${s.en} ${y}`});}
   (num[id]??=new Set()).add(at.get(g));}}
 return {list,mark:ids=>{const n=[...new Set((ids||[]).flatMap(id=>[...(num[id]||[])]))].sort((a,b)=>a-b);return n.length?`*${n.join(',')}`:'';}};}
const sup=m=>m?`<sup>${m}</sup>`:'';

const CSS=`
#xo{position:fixed;inset:0;pointer-events:none;z-index:20;font-family:Inter,"Noto Sans CJK JP","Noto Color Emoji",sans-serif;color:#fff;font-variant-numeric:tabular-nums}
#xo>div{position:absolute;opacity:0}
#xo .emo{font-family:"Noto Color Emoji";-webkit-text-stroke:0;text-shadow:none;font-weight:400}
#xo sup{font-size:.62em;font-weight:700;color:#FFB35A;margin-left:1px;vertical-align:.55em;line-height:0;-webkit-text-stroke:0}
#xo .g{font-family:Bungee,"Noto Sans CJK JP","Noto Color Emoji",sans-serif;font-weight:400;letter-spacing:.02em}
.lang-ja #xo .g.jp{font-family:"Noto Sans CJK JP","Noto Color Emoji",sans-serif;font-weight:700}
#xo .pn{background:#0B0612db;border:1px solid #ffffff1f;border-radius:14px;box-shadow:0 8px 28px #000a}
#xo-hook{left:0;right:0;top:220px;text-align:center}
#xo-hook .k{display:inline-block;font-size:24px;color:#0B0612;background:#FF8A1F;padding:6px 20px 4px;border-radius:9px;box-shadow:0 0 34px #FF5A00aa}
#xo-hook .l{margin-top:16px;font:700 72px/1.1 "Noto Sans CJK JP","Noto Color Emoji",sans-serif;-webkit-text-stroke:6px #2A0A3A;paint-order:stroke fill;text-shadow:0 0 30px #FF2A3Acc,0 6px 0 #4B1A7A}
.lang-en #xo-hook .l{font:400 64px/1.1 Bungee,sans-serif}
#xo-hook .s{margin-top:12px;font:700 26px "Noto Sans CJK JP",sans-serif;color:#D9C2FF;text-shadow:0 2px 12px #000}
#xo-title{inset:0;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse 62% 58% at 50% 46%,#12061Ce0 0%,#12061Ca0 55%,#12061C00 100%)}
#xo-title .box{text-align:center;transform-origin:50% 50%}
#xo-title .tt{font:700 92px/1.05 "Noto Sans CJK JP","Noto Color Emoji",sans-serif;color:#FFF3E2;-webkit-text-stroke:6px #2A0A3A;paint-order:stroke fill;text-shadow:0 0 28px #FF8A1Faa,0 6px 0 #4B1A7A;white-space:nowrap}
.lang-en #xo-title .tt{font:400 72px/1.08 Bungee,"Noto Color Emoji",sans-serif}
#xo-title .ch{display:inline-block}
#xo-title .sb{margin-top:22px;font:700 40px "Noto Sans CJK JP",sans-serif;color:#D9C2FF;letter-spacing:.08em;text-shadow:0 2px 14px #000}
.lang-en #xo-title .sb{font:900 36px Inter,sans-serif;letter-spacing:.04em}
#xo-header{left:0;right:0;top:0;height:64px;display:flex;align-items:center;justify-content:center;gap:18px;background:linear-gradient(90deg,#2A0D3Af0,#0B0612f0 50%,#2A0D3Af0);border-bottom:3px solid #FF8A1F;border-image:linear-gradient(90deg,#FF8A1F,#9D4BFF) 1}
#xo-header .t{font:700 34px/1 "Noto Sans CJK JP","Noto Color Emoji",sans-serif;-webkit-text-stroke:3px #2A0A3A;paint-order:stroke fill;text-shadow:0 0 14px #FF8A1Fcc,0 3px 0 #4B1A7A;white-space:nowrap}
.lang-en #xo-header .t{font:400 29px/1 Bungee,"Noto Color Emoji",sans-serif}
#xo-header .d{width:2px;height:30px;background:#D9C2FF77}
#xo-header .s{font:700 18px "Noto Sans CJK JP",sans-serif;color:#D9C2FF;letter-spacing:.06em;white-space:nowrap}
.lang-en #xo-header .s{font:800 18px Inter,sans-serif}
#xo-mission{left:36px;top:84px;width:452px;padding:16px 20px 14px;border-left:3px solid #FF8A1F}
#xo-mission .h{font-size:22px;color:#FF8A1F}
#xo-mission .o{margin-top:6px;font:700 22px/1.3 "Noto Sans CJK JP",sans-serif}
.lang-en #xo-mission .o{font:800 22px/1.25 Inter,sans-serif}
#xo-mission .n{margin-top:10px;white-space:nowrap;font:900 36px/1.1 Inter,"Noto Sans CJK JP",sans-serif;color:#FF8A1F;text-shadow:0 0 18px #FF5A0066}
#xo-mission .nn{margin-top:4px;font:600 14px/1.45 Inter,"Noto Sans CJK JP",sans-serif;color:#E8DCFF}
#xo-mission .lg{margin-top:12px;font:700 14px/1.4 Inter,"Noto Sans CJK JP",sans-serif;color:#E8DCFF}
#xo .meter{display:flex;gap:4px;margin-top:6px}#xo .meter i{flex:1;height:14px;border-radius:3px;background:#ffffff1a;position:relative;overflow:hidden}
#xo .meter i b{position:absolute;inset:0;transform-origin:0 50%}
#xo .mlab{display:flex;gap:4px;margin-top:3px;font:700 11px Inter,"Noto Sans CJK JP",sans-serif;color:#cfc8de}#xo .mlab span{flex:1;text-align:center}
#xo-mission .ps{margin-top:12px;font:700 14px Inter,"Noto Sans CJK JP",sans-serif;color:#D9C2FF}
#xo-mission .pl{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:5px;font:700 14px Inter,"Noto Sans CJK JP",sans-serif}
#xo-mission .pl span{transition:none}#xo-mission .pl i{display:inline-block;width:11px;height:11px;border-radius:50%;margin-right:5px;vertical-align:-1px}
#xo-panel{left:20px;top:80px;width:268px;padding:12px 14px 12px}
#xo-panel .lv{font-size:22px}
#xo-panel .k{margin-top:4px;font:700 12px Inter,"Noto Sans CJK JP",sans-serif;color:#D9C2FF;letter-spacing:.08em}
#xo-panel .st{font:700 17px/1.25 "Noto Sans CJK JP",sans-serif}
.lang-en #xo-panel .st{font:900 17px/1.2 Inter,sans-serif}
#xo-panel .ob{margin-top:5px;font:700 13px/1.35 Inter,"Noto Sans CJK JP",sans-serif;color:#FFE2B8}
#xo-panel .rw{display:flex;gap:8px;align-items:flex-start;margin-top:8px;padding:6px 7px;border-radius:9px;background:#ffffff0a;border:1px solid #ffffff12}
#xo-panel .rw.ex{border-color:var(--c)}
#xo .chip{flex:none;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:400 14px Bungee,sans-serif;color:#0B0612;background:#D8D2E8}
#xo-panel .rw .tx{flex:1;min-width:0;font:600 12.5px/1.3 Inter,"Noto Sans CJK JP",sans-serif;color:#F2ECFF}#xo-panel .rw .tx b{font-weight:800;color:#fff}
#xo-panel .rw .tx small{display:block;white-space:nowrap;font:600 11px/1.35 Inter,"Noto Sans CJK JP",sans-serif;color:#cfc8de;margin-top:2px}
#xo-panel .rw .tag{display:inline-block;font:700 10.5px Inter,"Noto Sans CJK JP",sans-serif;color:#0B0612;background:var(--c);padding:1px 6px;border-radius:5px;margin-bottom:2px}
#xo-panel .rw .bd{flex:none;font:900 18px Inter,sans-serif;width:18px;text-align:center}
#xo-panel .nt{margin-top:8px;font:600 11.5px/1.4 Inter,"Noto Sans CJK JP",sans-serif;color:#E8DCFF;border-top:1px solid #ffffff1c;padding-top:6px}
#xo-hud{right:20px;top:80px;width:268px;padding:10px 14px 12px}
#xo-hud .sim,#xo-tips .sim{font:800 11px Inter,"Noto Sans CJK JP",sans-serif;letter-spacing:.14em;color:#0B0612;background:#D9C2FF;display:inline-block;padding:1px 7px;border-radius:4px}
#xo-hud .tm{margin-top:6px;font-size:32px;line-height:1}
#xo-hud .tm small{font:700 11px Inter,"Noto Sans CJK JP",sans-serif;color:#cfc8de;letter-spacing:.06em;display:block;margin-top:3px}
#xo-hud .dg{margin-top:9px;display:flex;align-items:baseline;gap:8px;font-size:15px}
#xo-hud .dg b{font:400 22px Bungee,"Noto Sans CJK JP",sans-serif}.lang-ja #xo-hud .dg b{font:700 22px "Noto Sans CJK JP",sans-serif}
#xo-hud .dg span{margin-left:auto;font:800 16px Inter,"Noto Sans CJK JP",sans-serif}
#xo-tips{right:20px;top:258px;width:268px;padding:10px 14px 10px;font:700 13px/1.4 Inter,"Noto Sans CJK JP",sans-serif}
#xo-tips p{margin:0 0 6px}#xo-tips p:last-child{margin:0}#xo-tips .h{font:800 11px Inter,"Noto Sans CJK JP",sans-serif;letter-spacing:.12em;color:#FFB35A;margin-bottom:4px}
#xo-callout{left:50%;bottom:62px;transform:translateX(-50%);max-width:700px;padding:8px 18px 8px;border:2px solid var(--c);border-radius:12px;background:#0B0612e6;display:flex;gap:10px;align-items:center;font:700 19px/1.35 "Noto Sans CJK JP",sans-serif;white-space:nowrap}
.lang-en #xo-callout{font:800 18px/1.35 Inter,sans-serif}
#xo-callout .ic{font-size:26px}
#xo-foot{left:0;right:0;bottom:0;padding:5px 18px 7px;background:#0B0612d9;font:600 13px/1.45 Inter,"Noto Sans CJK JP",sans-serif;color:#D9C2FF}
#xo-stamp{left:50%;bottom:52px;width:640px;padding:6px 14px 7px;border:3px solid var(--oc);border-radius:14px;background:#0B0612f0;box-shadow:0 0 30px #000c,0 0 22px var(--og)}
#xo-stamp .hd{display:flex;align-items:center;gap:12px;transform-origin:0 50%}
#xo-stamp .hd .m{font-size:34px;line-height:1;color:var(--oc);white-space:nowrap}.lang-ja #xo-stamp .hd .m{font:900 34px/1.05 "Noto Sans CJK JP",sans-serif}
#xo-stamp .hd .tm{font:800 22px Inter,sans-serif;color:#fff;white-space:nowrap}
#xo-stamp .hd .sim{margin-left:auto;font:800 11px Inter,"Noto Sans CJK JP",sans-serif;letter-spacing:.12em;color:#0B0612;background:#D9C2FF;padding:1px 7px;border-radius:4px}
#xo-stamp .vr{display:flex;align-items:center;gap:8px;margin-top:3px;font:700 13px Inter,"Noto Sans CJK JP",sans-serif;white-space:nowrap}
#xo-stamp .vr .chip{width:22px;height:22px;font-size:13px}
#xo-stamp .vr .nm{width:228px;overflow:hidden;text-overflow:ellipsis;color:#F2ECFF}
#xo-stamp .vr .bar{flex:1;height:12px;border-radius:6px;background:#ffffff14;overflow:hidden}#xo-stamp .vr .bar b{display:block;height:100%;border-radius:6px}
#xo-stamp .vr .bar b.edge{background:repeating-linear-gradient(135deg,#D8D2E8 0 6px,#D8D2E855 6px 12px)!important}
#xo-stamp .vr .v{width:92px;text-align:right;font:800 14px Inter,"Noto Sans CJK JP",sans-serif}
#xo-stamp .vr .dn{width:104px;font:700 12px Inter,"Noto Sans CJK JP",sans-serif;color:#FF6A73}
#xo-stamp .cmp{margin-top:4px;font:900 16px Inter,"Noto Sans CJK JP",sans-serif;color:#FFCF6A;text-align:center}
#xo-results{left:20px;top:80px;width:430px;padding:12px 16px}
#xo-results .h{font-size:20px;color:#FF8A1F}.lang-ja #xo-results .h{font:700 20px "Noto Sans CJK JP",sans-serif}
#xo-results .r{display:flex;align-items:center;gap:8px;margin-top:7px;font:700 13.5px/1.3 Inter,"Noto Sans CJK JP",sans-serif}
#xo-results .r i{flex:none;width:12px;height:12px;border-radius:50%}
#xo-results .r .nm{flex:1;min-width:0}#xo-results .r .nm small{display:block;font-weight:600;font-size:12px;color:#cfc8de}
#xo-results .r .oc{flex:none;text-align:right;font:800 13px Inter,"Noto Sans CJK JP",sans-serif;color:#4FE3C1}
#xo-results .r .oc.c{color:#FF2A3A}
#xo-results .ft{margin-top:8px;font:600 11.5px/1.4 Inter,"Noto Sans CJK JP",sans-serif;color:#cfc8de}
#xo-question{left:50%;top:150px;transform:translateX(-50%);width:900px;padding:22px 26px 18px;text-align:center}
#xo-question .q{font:700 64px/1.15 "Noto Sans CJK JP","Noto Color Emoji",sans-serif;color:#FFCF6A;text-shadow:0 0 30px #FF8A1F88;white-space:nowrap}
.lang-en #xo-question .q{font:400 52px/1.15 Bungee,"Noto Color Emoji",sans-serif}
#xo-question .op{display:flex;flex-wrap:wrap;justify-content:center;gap:8px 10px;margin-top:16px}
#xo-question .op>span{padding:6px 12px;border-radius:10px;background:#ffffff10;border:1px solid #ffffff2a;font:700 17px Inter,"Noto Sans CJK JP",sans-serif}
#xo-question .op>span i{font-style:normal;margin-right:6px;font:400 16px Bungee,sans-serif}
#xo-question .cta{margin-top:14px;font:800 22px Inter,"Noto Sans CJK JP",sans-serif}
#xo-labels{inset:0;opacity:1!important}
#xo-labels .lb{position:absolute;left:0;top:0;white-space:nowrap;text-shadow:0 1px 6px #000,0 0 2px #000;font:700 13px/1.25 Inter,"Noto Sans CJK JP",sans-serif}
#xo-labels .start{padding:3px 10px;border-radius:99px;background:#9D4BFF;color:#fff;font-size:14px;box-shadow:0 0 16px #9D4BFFaa;text-shadow:none}
#xo-labels .start.sm{font-size:12.5px;padding:2px 8px}
#xo-labels .ch{display:flex;align-items:center;gap:5px}
#xo-labels .ch .chip{width:26px;height:26px;font-size:15px;box-shadow:0 0 10px #000}
#xo-labels .ch em{font-style:normal;font-size:12px;padding:1px 6px;border-radius:5px;color:#0B0612;text-shadow:none}
#xo-labels .tg{padding:2px 7px;border-radius:6px;background:#0B0612cc;border:1px solid #ffffff22;text-align:center}
#xo-labels .tg small{display:block;font-size:11.5px;color:#E8DCFF;font-weight:600}
#xo-labels .off{font-size:11px;color:#E8DCFF;background:#0B0612b0;padding:1px 6px;border-radius:5px}
#xo-labels .street{font:800 12.5px/1 Inter,"Noto Sans CJK JP",sans-serif;color:#E9DDFF;letter-spacing:.06em;text-shadow:0 0 4px #0B0612,0 0 2px #0B0612,0 1px 0 #0B0612}
#xo-labels .station{padding:3px 9px;border-radius:7px;border:2px solid #FFF3E2;background:#140a1ee0;color:#FFF3E2;font:900 14px Inter,"Noto Sans CJK JP",sans-serif;text-shadow:none}
#xo-hud .wh{margin-top:2px;font:600 10.5px Inter,"Noto Sans CJK JP",sans-serif;color:#cfc8de}
body.vcut #xo>div:not(#xo-labels){display:none!important}
body.vcut #xo-labels{--ls:1.25}
body.vcut footer,body.vcut #disclaimer{display:none!important}
`;

export class EscapeOverlay{
 constructor({levels,summary,agents,keyframes}){
  this.levels=levels;this.summary=summary;this.agents=agents;
  const st=document.createElement('style');st.textContent=CSS;document.head.append(st);
  const root=document.createElement('div');root.id='xo';
  const PN=new Set(['mission','panel','hud','tips','results','question']);
  root.innerHTML=['labels','hook','title','header','mission','panel','hud','tips','callout','results','question','stamp','foot'].map(k=>`<div id="xo-${k}"${PN.has(k)?' class="pn"':''}></div>`).join('');
  document.body.append(root);this.root=root;this.el=k=>root.querySelector(`#xo-${k}`);this.cache=new Map();
  // Static parts.
  this.html('hook',`<div class="k g">${T(HOOK.kicker)}</div><div class="l">${T(HOOK.line)}</div><div class="s">${T(HOOK.sub)}</div>`);
  const chars=s=>[...s].map(c=>c==='\n'?'<br>':`<span class="ch">${EMOJI1.test(c)?`<span class="emo">${c}</span>`:c===' '?'&nbsp;':esc(c)}</span>`).join('');
  this.html('title',`<div class="box"><div class="tt">${L(chars(TITLE.card.en),chars(TITLE.card.ja))}</div><div class="sb">${T(TITLE.sub)}</div></div>`);
  this.titleChars={ja:[],en:[]};this.el('title').querySelectorAll('.l-ja .ch').forEach(e=>this.titleChars.ja.push(e));this.el('title').querySelectorAll('.l-en .ch').forEach(e=>this.titleChars.en.push(e));
  this.html('header',`<div class="t">${L(emo('🧙 ESCAPE SHIBUYA ON HALLOWEEN! 🎃'),emo(TITLE.main.ja))}</div><div class="d"></div><div class="s">${T(TITLE.sub)}</div>`);
  this.levelInfo=Object.fromEntries(levels.map(lv=>[lv.key,this.levelCopy(lv)]));
  this.missionFG=sourceGroups([...MISSION.crowdNumber.factIds,...MISSION.crowdNote.factIds]);
  const exIds=levels.flatMap(lv=>this.levelInfo[lv.key].example.factIds);
  this.allFG=sourceGroups([...new Set(exIds)]);
 }
 html(k,h){const e=this.el(k);if(this.cache.get(k)!==h){e.innerHTML=h;this.cache.set(k,h);}}
 show(k,a,extra=''){const e=this.el(k),o=String(Math.round(clamp(a)*1000)/1000);if(e.style.opacity!==o)e.style.opacity=o;if(extra!==undefined&&e.dataset.tf!==extra){e.style.transform=extra;e.dataset.tf=extra;}}
 // Per-level copy joined to the sim's branches (same keys, kinds checked).
 levelCopy(lv){const sc=scenario(lv.key);if(!sc)throw Error(`no copy for level ${lv.key}`);
  const branches=lv.branches.map(B=>{const c=sc.branches.find(b=>b.key===B.key);if(!c)throw Error(`no copy for ${lv.key}/${B.key}`);
   if((c.kind==='walk-alt')!==(B.kind==='walk-alt')||(c.kind==='taxi')!==(B.kind==='taxi'))throw Error(`copy/sim branch kind mismatch ${lv.key}/${B.key}: ${c.kind} vs ${B.kind}`);
   return {key:B.key,kind:B.kind,example:!!B.recommended,line:c.line,gate:c.gate,factIds:[...c.factIds],simLimit:B.simLimit,offsim:!!B.offsim};});
  const example=branches.find(b=>b.example);
  const ids=[...new Set([...branches.flatMap(b=>b.factIds),...sc.route.factIds,...sc.taxi.factIds,...sc.alt.factIds,...sc.status.factIds])];
  return {sc,branches,example,factIds:ids,fg:sourceGroups(ids),n:lv.n,color:lv.color};}
 footHTML(fg,ids,lang,extra='',only=null){const keep=only?new Set(fg.mark(only).slice(1).split(',').filter(Boolean).map(Number)):null;
  const names=fg.list.filter(g=>!keep||keep.has(g.n)).map(g=>`*${g.n} ${g[lang]}`).join(lang==='ja'?' ・ ':' · ');
  return (ids.length?FOOTNOTE_COPY.prefix[lang]+names+(lang==='ja'?' ／ ':' / '):'')+FOOTNOTE_COPY.simSuffix[lang]+(lang==='ja'?'・地図上の位置は概略':' · map positions approx.')+extra;}

 // ctx: {t, shot, state (escape playback of the level, or null), states (overview: per level), proj (projected anchors), dangerBar}
 update(ctx){const {t,shot}=ctx,sec=shot.section,ov={t,shot:shot.name,section:sec,u:shot.local,claims:[],footnote:[],labels:[],text:{ja:{},en:{}}};
  const tx=(k,o)=>{ov.text.ja[k]=o.ja;ov.text.en[k]=o.en;};
  // ---- hook (0–1 s): slam-in ----
  const hookA=sec==='hook'?Math.min(1,shot.local/.2)*clamp((1-shot.local)/.12):0;const slam=1+.25*(1-easeOut(shot.local/.2));
  this.show('hook',hookA,`scale(${slam.toFixed(3)})`);
  if(sec==='hook'){tx('kicker',HOOK.kicker);tx('hook',HOOK.line);tx('hookSub',HOOK.sub);}
  if(sec==='hook'||sec==='title')for(const lang of ['ja','en'])ov.text[lang].teaser={legend:TEASER.legend[lang],simTag:TEASER.simTag[lang],routes:TEASER.routes[lang]};
  // ---- title card (1–3 s), FLIP into the header 2.55–3.0 ----
  let titleA=0,fly=0;if(sec==='title'){const lt=t-1;titleA=Math.min(1,lt/.12);fly=ease3(clamp((t-2.75)/.25));if(t>2.92)titleA*=clamp((3-t)/.08);
   for(const lang of ['ja','en']){const d=Math.min(1.5,14/Math.max(1,this.titleChars[lang].length));this.titleChars[lang].forEach((e,i)=>{const u=(lt*30-i*d)/4,s=u<=0?.6:u<.6?.6+.48*(u/.6):u<1?1.08-.08*((u-.6)/.4):1,isE=e.querySelector('.emo'),w=isE?Math.sin(lt*9+i)*6:0;
    const tf=`scale(${s.toFixed(3)}) rotate(${w.toFixed(2)}deg)`;if(e.dataset.tf!==tf){e.style.transform=tf;e.style.opacity=u<=0?'0':'1';e.dataset.tf=tf;}});}}
  const sbA=sec==='title'?clamp((t-1.3)/.25):0;this.el('title').querySelector('.sb').style.opacity=String(sbA);
  this.show('title',titleA,`translateY(${(-268*fly).toFixed(1)}px) scale(${(1-.63*fly).toFixed(3)})`);
  ov.titleChars={ja:this.titleChars.ja.filter(e=>e.style.opacity==='1').length,en:this.titleChars.en.filter(e=>e.style.opacity==='1').length,total:{ja:this.titleChars.ja.length,en:this.titleChars.en.length}};
  ov.title={card:titleA>0,header:false,fly};
  if(sec==='title'){tx('card',TITLE.card);tx('sub',TITLE.sub);ov.titleFly=fly;}
  // ---- persistent header (from 2.85 s to the end of the scene) ----
  const headA=t<2.88?0:clamp((t-2.88)/.12);this.show('header',headA,'');ov.title.header=headA>0;tx('title',{ja:TITLE.main.ja,en:'🧙 ESCAPE SHIBUYA ON HALLOWEEN! 🎃'});tx('titleSub',TITLE.sub);
  // ---- mission (3–7 s) ----
  const misA=sec==='mission'?Math.min(1,shot.local/.3)*clamp((4-shot.local)/.25):0;this.show('mission',misA,`translateX(${(-30*(1-easeOut(shot.local/.3))).toFixed(1)}px)`);
  if(sec==='mission'){const fg=this.missionFG,m=fg.mark;
   const legend=HUD.dangerLevels;
   const pins=this.levels.map((lv,k)=>{const on=t>=3.6+.2*k;return `<span style="opacity:${on?1:0}"><i style="background:${lv.color}"></i>${T(this.levelInfo[lv.key].sc.start)}</span>`;}).join('');
   this.html('mission',`<div class="h g">${T(MISSION.heading)}</div><div class="o">${T(MISSION.objective)}</div>
    <div class="n">${L(esc(MISSION.crowdNumber.en.replace('*',''))+sup(m(MISSION.crowdNumber.factIds)),esc(MISSION.crowdNumber.ja.replace('*',''))+sup(m(MISSION.crowdNumber.factIds)))}</div>
    <div class="nn">${L(br(MISSION.crowdNote.en)+sup(m(MISSION.crowdNote.factIds)),br(MISSION.crowdNote.ja)+sup(m(MISSION.crowdNote.factIds)))}</div>
    <div class="lg">${T(MISSION.dangerLegend)}</div>${meterHTML(5)}<div class="mlab">${['<1','1–2','2–3','3–4','≥4'].map((r,i)=>`<span>${L(legend.en[i],legend.ja[i])}<br>${r}</span>`).join('')}</div>
    <div class="ps">${T(MISSION.starts)}</div><div class="pl">${pins}</div>`);
   const nShown=fmt(CROWD_2026.estimate);ov.mission={n:nShown,src:CROWD_2026.estimate};
   ov.claims.push(...MISSION.crowdNumber.factIds,...MISSION.crowdNote.factIds);ov.footnote.push(...MISSION.crowdNumber.factIds,...MISSION.crowdNote.factIds);
   tx('mission',{ja:{heading:'MISSION',objective:MISSION.objective.ja,number:MISSION.crowdNumber.ja.replace('*','')+m(MISSION.crowdNumber.factIds),note:MISSION.crowdNote.ja+m(MISSION.crowdNote.factIds),legend:MISSION.dangerLegend.ja,levels:legend.ja},
    en:{heading:'MISSION',objective:MISSION.objective.en,number:MISSION.crowdNumber.en.replace('*','')+m(MISSION.crowdNumber.factIds),note:MISSION.crowdNote.en+m(MISSION.crowdNote.factIds),legend:MISSION.dangerLegend.en,levels:legend.en}});
   ov.text.ja.bar='MISSION';ov.text.en.bar='MISSION';
   this.setFoot(fg,[...MISSION.crowdNumber.factIds,...MISSION.crowdNote.factIds],ov);}
  // ---- level HUD ----
  const lvA=sec==='level'?Math.min(1,shot.local/.25):0;
  ['panel','hud'].forEach(k=>this.show(k,lvA,''));
  if(sec==='level')this.level(ctx,ov,tx);else{this.show('tips',0,'');this.show('callout',0,'translateX(-50%)');this.show('stamp',0,'translateX(-50%)');}
  // ---- overview / question ----
  const qt=sec==='question'?shot.local:0,qEnd=shot.t1??42;
  const resA=sec==='overview'?Math.min(1,shot.local/.3):sec==='question'?clamp(1-qt/.25):0;this.show('results',resA,'');
  const qA=sec==='question'?Math.min(1,qt/.3)*clamp((qEnd-t)/.3+.0001):0;this.show('question',qA,`translateX(-50%) scale(${(1+.08*(1-easeOut(qt/.3))).toFixed(3)})`);
  if(sec==='overview'||sec==='question')this.overview(ctx,ov,tx);
  // ---- footnote bar ----
  const footA=t<3?0:Math.min(1,(t-3)/.3);this.show('foot',footA,'');
  if(sec==='hook'||sec==='title'){this.html('foot','');}
  // ---- projected map labels ----
  this.labels(ctx,ov);
  return ov;}

 setFoot(fg,ids,ov,extra={},idsV=null){const h=L(esc(this.footHTML(fg,ids,'en',extra.en||'')),esc(this.footHTML(fg,ids,'ja',extra.ja||'')));this.html('foot',h);
  for(const lang of ['ja','en']){ov.text[lang].foot=this.footHTML(fg,ids,lang,extra[lang]||'');ov.text[lang].footV=idsV?this.footHTML(fg,ids,lang,extra[lang]||'',idsV):ov.text[lang].foot;}
  ov.footnoteV=idsV||ids;}

 level(ctx,ov,tx){const {shot,state:s,t}=ctx,u=shot.local,lv=this.levels.find(l=>l.key===shot.level),I=this.levelInfo[lv.key],sc=I.sc,m=I.fg.mark,END=LEVEL_SECONDS;
  const c=lv.color,brs=s?.branches||[];
  // Left panel: level, start, objective, branch rows (sim counters), 2026 status.
  const rowA=k=>clamp((u-.6-.25*k)/.25);
  const rows=I.branches.map((b,k)=>{const st=brs.find(x=>x.key===b.key)||{walking:0,arrived:0,corridorNow:0,outcome:null};
   // Routes that leave the sim area (walk to another station, off-sim taxi stretch): walkers only reach the
   // sim edge, so no ✔/✖ and "at sim edge" instead of "arrived".
   const edge=b.kind==='walk-alt'||b.offsim;
   const walking=fmt(st.walking),arrived=fmt(st.arrived),dens=p2(st.corridorNow),badge=edge?'':st.outcome==='escaped'?'✔':st.outcome==='caught'?'✖':'';
   return {b,k,st,edge,walking,arrived,dens,badge,mark:m(b.factIds)};});
  const cnt=(r,lang)=>(r.edge?HUD.countersEdge:HUD.counters)[lang].replace('{walking}',r.walking).replace('{arrived}',r.arrived);
  const densTxt=(r,lang)=>lang==='ja'?`混雑 ${r.dens}人/m²`:`${r.dens} p/m²`;
  const rowHTML=r=>`<div class="rw${r.b.example?' ex':''}" style="--c:${c};opacity:${rowA(r.k).toFixed(3)}"><i class="chip" style="${r.b.example?`background:${c}`:''}">${r.b.key}</i><div class="tx">${r.b.example?`<span class="tag">${T(HUD.exampleChip)}</span><br>`:''}${L('<b>'+esc(r.b.line.en)+'</b><br>'+esc(r.b.gate.en)+sup(r.mark),'<b>'+esc(r.b.line.ja)+'</b><br>'+esc(r.b.gate.ja)+sup(r.mark))}<small>${L(cnt(r,'en')+' · '+densTxt(r,'en'),cnt(r,'ja')+' ・ '+densTxt(r,'ja'))}</small></div><span class="bd" style="color:${r.badge==='✖'?'#FF2A3A':'#4FE3C1'}">${r.badge}</span></div>`;
  const status=sc.status,sm=m(status.factIds);
  this.html('panel',`<div class="lv g jp" style="color:${c}">${L(HUD.level.en.replace('{n}',lv.n),HUD.level.ja.replace('{n}',lv.n))}</div><div class="k">${T(HUD.playerStart)}</div><div class="st">${T(sc.start)}</div><div class="ob">${T(sc.objective)}</div>${rows.map(rowHTML).join('')}<div class="nt">${L(one(status.en)+sup(sm),one(status.ja)+sup(sm))}</div>`);
  // Right HUD: SIM timer + DANGER (exact values of this frame's keyframe; only the bar is smoothed).
  const p=s?.player,arrived=!!p?.arrived,timerSrc=arrived?p.arriveAt:(s?.simTime??0),timer=`SIM +${mmss(timerSrc)}`;
  const dv=s?.danger?.value??0,dl=s?.danger?.level??0,bar=ctx.dangerBar??dv,DL=HUD.dangerLevels;
  this.html('hud',`<span class="sim">${T(HUD.simTag)}</span><div class="tm g">${timer}<small>${L(arrived?'player arrived (sim time)':'player walking (sim time)',arrived?'プレイヤー到着（シミュレーション時間）':'プレイヤー移動中（シミュレーション時間）')}</small></div>
   <div class="dg"><span class="g" style="margin:0;font:400 15px Bungee">DANGER</span><b style="color:${DANGER_COLORS[dl]}">${L(DL.en[dl],DL.ja[dl])}</b><span>${L(`${p2(dv)} p/m²`,`${p2(dv)}人/m²`)}</span></div><div class="wh">${T(HUD.dangerWhere)}</div>${meterHTML(bar)}`);
  const hudEl=this.el('hud');hudEl.style.borderColor=dl>=3&&Math.sin(t*Math.PI*4)>0?'#FF2A3A':'';
  // Tips (taxi, walk) and the example-route callout (until the result card takes its place).
  const tipA=clamp((u-1.8)/.3),altA=clamp((u-2.6)/.3);
  this.html('tips',`<div class="h">${L('TIPS','ヒント')}</div><p style="opacity:${tipA}">${L(one(sc.taxi.en)+sup(m(sc.taxi.factIds)),one(sc.taxi.ja)+sup(m(sc.taxi.factIds)))}</p><p style="opacity:${altA}">${L(one(sc.alt.en)+sup(m(sc.alt.factIds)),one(sc.alt.ja)+sup(m(sc.alt.factIds)))}</p>`);
  this.show('tips',Math.min(clamp((u-1.8)/.3),clamp((END-u)/.2+.0001)),'');
  const [c0,c1]=BEAT.callout,calA=clamp((u-c0)/.3)*clamp((c1-u)/.2+.0001);
  this.el('callout').style.setProperty('--c',c);
  this.html('callout',`<span class="ic emo">🚉</span><span>${L(br(sc.route.en)+sup(m(sc.route.factIds)),br(sc.route.ja)+sup(m(sc.route.factIds)))}</span>`);
  this.show('callout',calA,`translateX(-50%) translateY(${(12*(1-easeOut((u-c0)/.3))).toFixed(1)}px)`);
  // Result card: the example route's outcome (sim rule) slams in when its first walker arrives, then the
  // clock fast-forwards and every route's first walker is compared (VS, simulation, same start).
  const src={arrived,arriveAt:p?.arriveAt??null,denseSeconds:p?.denseSeconds??0,simTime:s?.simTime??0,simLimit:I.example.simLimit,denseMax:ctx.rule.denseMax};
  const outcome=p?.outcome??null,stampOn=u>=BEAT.stamp&&u<END&&!!outcome;let stamp=null,vs=null;
  if(stampOn){const k=(u-BEAT.stamp)*30,sc2=k<4?1.5-.58*(k/4):k<7?.92+.08*((k-4)/3):1,shake=k<2?(k<1?4:-4):0,a=Math.min(1,k/1.5)*clamp((END-u)/.15);
   const caught=outcome==='caught',S=STAMPS,reason=caught?(p.reason==='dense'?{ja:S.reasonDense.ja.replace('{t}',mmss(p.denseSeconds)),en:S.reasonDense.en.replace('{t}',mmss(p.denseSeconds))}:S.reasonTimeout):{ja:`${I.example.key} +${mmss(p.arriveAt)}`,en:`${I.example.key} +${mmss(p.arriveAt)}`};
   const main=caught?S.caught:S.escaped,col=caught?'#FF2A3A':'#4FE3C1',enMain=caught?'CAUGHT IN THE CROWD':'ESCAPED!';
   // VS rows: first walker of every route (summary of the same run), shown once the playback clock has reached it.
   const SL=this.summary.levels.find(l=>l.key===lv.key),simNow=s?.simTime??0;
   const vrows=rows.map(r=>{const B=SL.branches.find(b=>b.key===r.b.key),at=B.player.arriveAt,ds=B.player.denseSeconds||0,on=at!=null&&simNow+1e-6>=at;
    return {r,at,ds,on,time:on?`+${mmss(at)}`:'',dense:on&&ds>=.5?String(Math.round(ds)):'',badge:on&&!r.edge?(B.outcome==='escaped'?'✔':B.outcome==='caught'?'✖':''):'',outcome:B.outcome};});
   const tmax=Math.max(...vrows.map(v=>v.at??0),1);
   const ex=vrows.find(v=>v.r.b.example),alts=vrows.filter(v=>!v.r.b.example&&!v.r.edge&&v.at!=null);
   let cmp=null;if(u>=BEAT.vs&&ex.on&&alts.length&&alts.every(v=>v.on)){const w=alts.reduce((a,b)=>b.at>a.at?b:a),r=w.at/ex.at,kind=r>=1.2?'slower':r<=1/1.2?'faster':'same',fill=o=>o.replace('{a}',ex.r.b.key).replace('{b}',w.r.b.key).replace('{r}',p2(r));
    cmp={kind,b:w.r.b.key,a:ex.r.b.key,ratio:p2(r),src:{a:ex.at,b:w.at},ja:fill(RESULT[kind].ja),en:fill(RESULT[kind].en)};}
   const name=(r,lang)=>`${r.b.line[lang]} ${r.b.gate[lang]}`;
   const vrow=v=>`<div class="vr" style="opacity:${v.on?1:.35}"><i class="chip" style="${v.r.b.example?`background:${c}`:''}">${v.r.b.key}</i><span class="nm">${L(esc(name(v.r,'en')),esc(name(v.r,'ja')))}</span><span class="bar"><b class="${v.r.edge?'edge':''}" style="width:${v.on?(100*v.at/tmax).toFixed(1):0}%;background:${v.r.b.example?c:'#D8D2E8'}"></b></span><span class="v">${v.on?(v.r.edge?L(esc(RESULT.edge.en)+' ',esc(RESULT.edge.ja)+' '):'')+v.time+(v.badge?` <span style="color:${v.badge==='✖'?'#FF2A3A':'#4FE3C1'}">${v.badge}</span>`:''):''}</span><span class="dn">${v.dense?L(esc(RESULT.dense.en.replace('{t}',v.dense)),esc(RESULT.dense.ja.replace('{t}',v.dense))):''}</span></div>`;
   this.html('stamp',`<div class="hd" style="transform:scale(${sc2.toFixed(3)}) translateX(${shake}px)"><span class="m g">${L(enMain,esc(main.ja))}</span><span class="tm">${L(esc(reason.en),esc(reason.ja))}</span><span class="sim">${T(RESULT.head)}</span></div>${vrows.map(vrow).join('')}${cmp?`<div class="cmp">${L(esc(cmp.en),esc(cmp.ja))}</div>`:''}`);
   const e=this.el('stamp');e.style.setProperty('--oc',col);e.style.setProperty('--og',col+'55');
   this.show('stamp',a,'translateX(-50%)');
   stamp={shown:outcome,main:{ja:main.ja,en:enMain},sub:reason,k};
   vs={rows:vrows.map(v=>({key:v.r.b.key,example:v.r.b.example,edge:!!v.r.edge,label:{ja:name(v.r,'ja'),en:name(v.r,'en')},shown:{time:v.time,dense:v.dense,badge:v.badge},src:{arriveAt:v.at,denseSeconds:v.ds,outcome:v.outcome,simTime:simNow},bar:v.on?v.at/tmax:0,on:v.on})),cmp};}
  else this.show('stamp',0,'translateX(-50%)');
  ov.escape={level:lv.key,n:lv.n,color:c,timer:{shown:timer,src:{simTime:s?.simTime??0,arrived,arriveAt:p?.arriveAt??null}},
   danger:{shown:p2(dv),level:dl,src:dv,srcLevel:s?.danger?.level??0},
   branches:rows.map(r=>({key:r.b.key,example:r.b.example,edge:!!r.edge,shown:{walking:r.walking,arrived:r.arrived,density:r.dens,badge:r.badge},src:{walking:r.st.walking,arrived:r.st.arrived,density:r.st.corridorNow,outcome:r.st.outcome}})),
   stamp:{shown:stamp?stamp.shown:null,visible:!!stamp,src},vs};
  const claims=[...rows.flatMap(r=>r.b.factIds),...status.factIds];if(calA>0)claims.push(...sc.route.factIds);if(tipA>0)claims.push(...sc.taxi.factIds);if(altA>0)claims.push(...sc.alt.factIds);
  ov.claims.push(...claims);ov.footnote.push(...I.factIds);
  // Strings for the 9:16 bands (the 9:16 cut has no 2026 status line, so its footnote leaves that source out unless also used elsewhere).
  const idsV=[...new Set([...I.branches.flatMap(b=>b.factIds),...sc.route.factIds,...sc.taxi.factIds,...sc.alt.factIds])];
  for(const lang of ['ja','en']){const X=ov.text[lang];
   X.bar=`${HUD.level[lang].replace('{n}',lv.n)} · ${HUD.playerStart[lang]}：${sc.start[lang]}`.replace('PLAYER START：','PLAYER START: ');
   X.level={n:lv.n,color:c,start:sc.start[lang],objective:sc.objective[lang],simTag:HUD.simTag[lang],timer,danger:{label:HUD.dangerLevels[lang][dl],value:lang==='ja'?`${p2(dv)}人/m²`:`${p2(dv)} p/m²`,level:dl,bar,where:HUD.dangerWhere[lang]},
    branches:rows.map(r=>({key:r.b.key,example:r.b.example,edge:!!r.edge,exampleTag:HUD.exampleChip[lang],line:r.b.line[lang],gate:r.b.gate[lang]+r.mark,count:cnt(r,lang),density:densTxt(r,lang),badge:r.badge,alpha:rowA(r.k)})),
    tips:[{text:sc.route[lang]+m(sc.route.factIds),from:BEAT.callout[0]},{text:sc.taxi[lang]+m(sc.taxi.factIds),from:1.8},{text:sc.alt[lang]+m(sc.alt.factIds),from:2.6}],status:status[lang]+sm,
    stamp:stamp?{kind:stamp.shown,main:stamp.main[lang],sub:stamp.sub[lang],k:stamp.k,head:RESULT.head[lang],
     rows:vs.rows.map(v=>({key:v.key,example:v.example,edge:v.edge,label:v.label[lang],time:v.shown.time,badge:v.shown.badge,dense:v.shown.dense?RESULT.dense[lang].replace('{t}',v.shown.dense):'',edgeTag:v.edge&&v.on?RESULT.edge[lang]:'',bar:v.bar,on:v.on})),cmp:vs.cmp?vs.cmp[lang]:''}:null};}
  this.setFoot(I.fg,I.factIds,ov,{},idsV);}

 overview(ctx,ov,tx){const {t}=ctx,fg=this.allFG,m=fg.mark,rows=[];
  for(const lv of this.levels){const I=this.levelInfo[lv.key],ex=I.example,S=this.summary.levels.find(l=>l.key===lv.key).branches.find(b=>b.key===ex.key);
   const time=S.player.arriveAt,out=S.outcome;rows.push({lv,I,ex,time:mmss(time),src:{arriveAt:time,outcome:out},out});}
  const oc=r=>r.out==='escaped'?{en:`✔ ESCAPED +${r.time}`,ja:`✔ 脱出 +${r.time}`}:r.out==='caught'?{en:'✖ CAUGHT',ja:'✖ 捕まった'}:{en:'—',ja:'—'};
  this.html('results',`<div class="h g">${T(OVERVIEW.results)}</div>${rows.map(r=>`<div class="r"><i style="background:${r.lv.color}"></i><div class="nm">${T(r.I.sc.start)}<small>→ ${L(esc(r.ex.line.en+' · '+r.ex.gate.en)+sup(m(r.ex.factIds)),esc(r.ex.line.ja+' '+r.ex.gate.ja)+sup(m(r.ex.factIds)))}</small></div><span class="oc${r.out==='caught'?' c':''}">${L(oc(r).en,oc(r).ja)}</span></div>`).join('')}
   <div class="ft">${L('Example routes (no source ranks them) · player = first of 24 sim walkers per route','ルート例（出典は優劣を示していない）・各ルート24人のうち先頭の1人')}</div>`);
  const opts=rows.map((r,k)=>({k:'ABCDE'[k],ja:`${r.I.sc.start.ja} → ${r.ex.line.ja} ${r.ex.gate.ja}`,en:`${r.I.sc.start.en} → ${r.ex.line.en} ${r.ex.gate.en}`,mark:m(r.ex.factIds)}));
  this.html('question',`<div class="q">${T(QUESTION.line,emo)}</div><div class="op">${opts.map(o=>`<span><i style="color:${rows[ 'ABCDE'.indexOf(o.k)].lv.color}">${o.k}</i>${L(esc(o.en)+sup(o.mark),esc(o.ja)+sup(o.mark))}</span>`).join('')}</div><div class="cta">${T(QUESTION.cta)}</div>`);
  ov.overview={rows:rows.map(r=>({level:r.lv.key,shown:{time:r.time,outcome:r.out},src:r.src}))};
  const ids=[...new Set(rows.flatMap(r=>r.ex.factIds))];ov.claims.push(...ids);ov.footnote.push(...ids);
  for(const lang of ['ja','en']){const X=ov.text[lang];X.bar=OVERVIEW.results[lang];
   X.overview=rows.map(r=>({color:r.lv.color,start:r.I.sc.start[lang],dest:`${r.ex.line[lang]} ${r.ex.gate[lang]}${m(r.ex.factIds)}`,outcome:oc(r)[lang]}));
   if(ctx.shot.section==='question'){X.question={line:QUESTION.line[lang],options:opts.map(o=>({k:o.k,text:o[lang]+o.mark,color:rows['ABCDE'.indexOf(o.k)].lv.color})),cta:QUESTION.cta[lang]};X.bar='';}}
  this.setFoot(fg,ids,ov);}

 labels(ctx,ov){const {shot,proj=[],streets=[]}=ctx,sec=shot.section,out=[];const u=shot.local;
  const rect=sec==='level'?LABEL_RECT.level:LABEL_RECT.all;
  // prio: lower = placed first (keeps its spot); streets are dropped when there is no free spot.
  const add=(a,cls,html,align='bottom',dy=0,alpha=1,prio=5,extra={})=>{if(!a||!a.visible&&a.visible!==undefined||!a.inFrame&&a.kind!=='edge'&&a.kind!=='walk-alt')return;out.push({id:`${a.level??'map'}:${a.id}`,x:clamp(a.x,SAFE.x0,SAFE.x1),y:clamp(a.y+dy,SAFE.y0,SAFE.y1),cls,html,align,alpha,rect,prio,...extra});};
  const mapA=clamp((ctx.t-4.6)/.4);
  for(const st of streets){if(st.kind==='station')add(st,'station',L(esc(st.en),esc(st.ja)),'center',0,(sec==='mission'?mapA:1)*(sec==='question'?.5:1),1,{optional:true});
   else if(sec==='level'&&u>=.3)add(st,'street',L(esc(st.en),esc(st.ja)),'center',0,clamp((u-.3)/.3)*.95,9,{optional:true,angle:st.angle});}
  if(sec==='mission'||sec==='overview'||sec==='question'){
   for(const lv of this.levels){const a=proj.find(q=>q.level===lv.key&&q.id==='start');const k=this.levels.indexOf(lv);
    if(sec==='mission'&&ctx.t<3.75+.2*k)continue;
    add(a,'start sm',`<span style="background:${lv.color};color:#0B0612;padding:0 6px;border-radius:99px;margin-right:4px">${lv.n}</span>${T(this.levelInfo[lv.key].sc.start)}`,'bottom',-4,sec==='question'?.45:1,2);}}
  // obstacles: objective icons (WebGL billboards above their anchor) and their ✔ badges
  const obst=[];
  if(sec==='level'){const lv=this.levels.find(l=>l.key===shot.level),I=this.levelInfo[lv.key],c=lv.color,mine=proj.filter(a=>a.level===lv.key);
   const a=mine.find(q=>q.id==='start');if(u>=.45)add(a,'start',`${L('YOU ARE HERE: ','現在地：')}${T(I.sc.start)}`,'bottom',-4,clamp((u-.45)/.2),0);
   for(const b of I.branches){const ch=mine.find(q=>q.id===b.key);
    add(ch,'ch',`<i class="chip" style="background:${b.example?c:'#D8D2E8'}">${b.key}</i>${b.example&&u>=1.3?`<em style="background:${c}">${T(HUD.exampleChip)}</em>`:''}`,'center',0,1,4);
    const tg=mine.find(q=>q.id===`${b.key}-target`),ed=mine.find(q=>q.id===`${b.key}-edge`),mk=I.fg.mark(b.factIds);
    const lab=`${L(esc(b.line.en)+'<small>'+esc(b.gate.en)+sup(mk)+'</small>',esc(b.line.ja)+'<small>'+esc(b.gate.ja)+sup(mk)+'</small>')}`;
    if(b.kind==='walk-alt'&&ed&&ed.visible)add(ed,'tg',lab,'top',10,b.example?1:.92,3);else add(tg,'tg',lab,'top',8,b.example?1:.92,3);
    if(b.kind==='taxi'&&b.offsim&&ed&&ed.visible)add(ed,'off',T(HUD.offSim),'bottom',-6,.95,6);}
   for(const q of mine)if(/-target$/.test(q.id)&&q.visible&&q.inFrame){const w=(q.iconPx||70)*1.15,h=(q.iconPx||70)*1.55;obst.push({x0:q.x-w/2,x1:q.x+w/2+16,y0:q.y-h,y1:q.y-4});}}
  else if(sec==='overview'||sec==='question')for(const q of proj)if(/-target$/.test(q.id)&&q.visible&&q.inFrame){const w=(q.iconPx||70)*1.15,h=(q.iconPx||70)*1.55;obst.push({x0:q.x-w/2,x1:q.x+w/2+16,y0:q.y-h,y1:q.y-4});}
  // DOM: reuse label nodes; place in priority order, nudging each label off already placed labels and icons.
  out.sort((a,b)=>a.prio-b.prio);
  const box=this.el('labels');while(box.children.length<out.length)box.append(Object.assign(document.createElement('div'),{className:'lb'}));
  const card=this.el('stamp');if(sec==='level'&&Number(card.style.opacity)>0&&!document.body.classList.contains('vcut')){const r=card.getBoundingClientRect();obst.push({x0:r.left,x1:r.right,y0:r.top-6,y1:720});}
  const placed=[...obst],shown=[],vscale=document.body.classList.contains('vcut')?1.25:1;
  const hit=(r)=>placed.some(q=>r.x0<q.x1+3&&r.x1>q.x0-3&&r.y0<q.y1+3&&r.y1>q.y0-3);
  [...box.children].forEach((e,i)=>{const o=out[i];if(!o){if(e.style.display!=='none')e.style.display='none';return;}e.style.display='';if(e.className!==`lb ${o.cls}`)e.className=`lb ${o.cls}`;if(e.dataset.h!==o.html){e.innerHTML=o.html;e.dataset.h=o.html;}
   const rad=(o.angle||0)*Math.PI/180,w0=e.offsetWidth*vscale,h0=e.offsetHeight*vscale,bw=Math.abs(w0*Math.cos(rad))+Math.abs(h0*Math.sin(rad)),bh=Math.abs(w0*Math.sin(rad))+Math.abs(h0*Math.cos(rad)),R=o.rect;
   const topOf=y=>o.align==='center'?y-bh/2:o.align==='top'?y:y-bh;
   const fitR=(x,y)=>{x=clamp(x,R.x0+bw/2,R.x1-bw/2);const tp=topOf(y),ny=clamp(tp,R.y0,R.y1-bh);return [x,y+ny-tp];};
   let best=null;for(const [dx,dy] of OFFSETS){const [x,y]=fitR(o.x+dx,o.y+dy),tp=topOf(y),r={x0:x-bw/2,x1:x+bw/2,y0:tp,y1:tp+bh};if(!hit(r)){best={x,y,r};break;}}
   if(!best){if(o.optional){e.style.display='none';return;}const [x,y]=fitR(o.x,o.y),tp=topOf(y);best={x,y,r:{x0:x-bw/2,x1:x+bw/2,y0:tp,y1:tp+bh}};}
   placed.push(best.r);o.x=Math.round(best.x*10)/10;o.y=Math.round(best.y*10)/10;shown.push(o);
   const tr=o.align==='center'?'translate(-50%,-50%)':o.align==='top'?'translate(-50%,0)':'translate(-50%,-100%)',org=o.align==='center'?'50% 50%':o.align==='top'?'50% 0':'50% 100%';e.style.transformOrigin=org;e.style.transform=`translate(${o.x}px,${o.y}px) ${tr} scale(var(--ls,1))${o.angle?` rotate(${o.angle}deg)`:''}`;e.style.opacity=String(o.alpha);});
  ov.labels=shown.map(o=>({id:o.id,x:o.x,y:o.y,cls:o.cls}));}
}
const OFFSETS=[[0,0]];for(const d of [16,32,48,64,88,112])OFFSETS.push([0,-d],[0,d],[-d*1.6,0],[d*1.6,0],[-d,-d],[d,-d]);
function ease3(t){return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;}
function meterHTML(v){return `<div class="meter">${DANGER_COLORS.map((c,i)=>`<i><b style="background:${c};transform:scaleX(${clamp(v-i).toFixed(3)})"></b></i>`).join('')}</div>`;}

// End card copy (recorder H_CREDIT_CARD): both languages, sources = every outlet used, with dates.
export function endCard(agents){const A=fmt(agents);return {
 ja:{title:END_CARD.title.ja,question:END_CARD.question.ja,sourcesHead:END_CARD.sourcesHead.ja,sources:END_SOURCES.ja,sim:END_CARD.sim.ja.replace('{agents}',A),walk:END_CARD.walk.ja,check:END_CARD.checkOnDay.ja,data:END_CARD.data.ja},
 en:{title:'🧙 Escape Shibuya on Halloween! 🎃',question:END_CARD.question.en,sourcesHead:END_CARD.sourcesHead.en,sources:END_SOURCES.en,sim:END_CARD.sim.en.replace('{agents}',A),walk:END_CARD.walk.en,check:END_CARD.checkOnDay.en,data:END_CARD.data.en}};}
export {SCENARIOS};
