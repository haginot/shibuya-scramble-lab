// 9:16 DOM HUD of the series pilot 「🧙ハロウィンの渋谷を脱出せよ！🎃 JR編」 (720×1280 CSS px; recorded at
// device scale 1.5 → 1080×1920). All words are DOM (never WebGL); all strings come from copy-jr.mjs (each with
// its fact ids) except the few game-framing strings in GAME below (no facts, sim ones labelled).
//
// Layout = safe areas of vertical social apps (TikTok / Reels / Shorts UI): nothing important in the top 84 px
// (status bar, tabs), the bottom 240 px (caption, buttons, progress) or the right 92 px (action buttons).
//   • ※パロディ badge: top-left, every frame;  • title header (🧙…🎃 JR編): every frame except while the big
//     title card is up (2–5 s) — the title is always the most prominent element;
//   • game clock (parody, not simulation) under the header;  • captions / panels in the middle band;
//   • per-section footnote 「出典：…」 just above the bottom safe area: the outlets of every fact on screen.
//
// API:
//   const ov = new SeriesOverlay(document.body, {run, lang:'ja'})
//   ov.update(f) → record (window.__seriesOverlay): f = {t, section, local, u, clip, wp, rate, jr (live jrState of the
//       frame), proj:{start, player, gates:{A,B,C,D}, stations:[...], taxi, newSouth, redZone}, W, H}
//   record = {t, section, title:{header, card}, parody, claims:[ids], footnote:{ids, text}, sims:[{key, shown, src, text}],
//             strings:[ja text…], labels:[{id, x, y, box}], stamps:[…]}
//   Every sim number: sims[] entry with the source value and the exact text shown (it contains 「シミュレーション」).
//   footBox (browser): rendered footnote box {top, bottom, scrollH, clientH, limit}; record_series.check_frame asserts it
//   is not clipped and ends above the bottom unsafe zone. Tally: a 'walk-alt' sim route is keyed 「別」 (A–D = JR gates).
import {COPY,footnote,ALL_FACT_IDS,END_SOURCES,END_DATA} from './copy-jr.mjs';

export const SAFE=Object.freeze({top:84,bottom:240,left:28,right:92,W:720,H:1280});
// footnote box: up to 3 lines of 12.5 px × 1.35, its bottom 4 px above the bottom unsafe zone (captions/tags sit above it)
export const FOOT_H=52;
const DATA_CREDIT=Object.freeze({ja:{prefix:'出典：',sep:'・',plateau:'3D：PLATEAU',both:'3D：PLATEAU／© OpenStreetMap contributors'},en:{prefix:'Sources: ',sep:' · ',plateau:'3D: PLATEAU',both:'3D: PLATEAU / © OpenStreetMap contributors'}});
// Game-framing strings not in copy-jr (no facts; sim strings carry 「シミュレーション」).
export const GAME=Object.freeze({
 start:{ja:'GAME START',en:'GAME START',factIds:[]},
 crowd:{ja:'人の流れ＝シミュレーション',en:'Crowd = simulation',factIds:[],sim:true},
 fast:{ja:'早送り ×2',en:'Fast-forward ×2',factIds:[]},
 rowTime:{ja:'中央値 {mmss}（シミュレーション）',en:'median {mmss} (simulation)',factIds:[],sim:true},
});
const esc=v=>String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const EMO=/(\p{Extended_Pictographic}️?)/gu;
export const html=s=>esc(s).replace(EMO,'<span class="emo">$1</span>').replace(/\n/g,'<br>');
export const fmt=v=>Math.round(v).toLocaleString('en-US');
export const p1=v=>(Math.round(v*10)/10).toFixed(1);
export const mmss=s=>s==null?'--:--':`${String(Math.floor(s/60)).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
// game stamps (GAME START / ESCAPED / GAME OVER): full for 1 s, then dimmed so the title header stays dominant
const dimStamp=lu=>(1-.62*clamp((lu-1)/.35)).toFixed(3);
// route-ribbon colours of the 別駅 map (app-jr.mjs ALT_STYLE uses the same): one colour per destination
export const ALT_COLORS=Object.freeze({harajuku:'#FF8A1F',yoyogi:'#5AB8FF',ebisu:'#FFD23F'});

const CSS=`
#sj{position:fixed;left:0;top:0;width:720px;height:1280px;pointer-events:none;z-index:40;color:#F4F1EA;font-family:"Noto Sans CJK JP","Noto Color Emoji",sans-serif;-webkit-font-smoothing:antialiased}
#sj .emo{font-family:"Noto Color Emoji";font-weight:400}
#sj *{box-sizing:border-box}
#sj-parody{position:absolute;left:${SAFE.left}px;top:${SAFE.top+2}px;padding:3px 10px 4px;border-radius:6px;background:#FFD23F;color:#14081C;font:900 17px/1.2 "Noto Sans CJK JP";letter-spacing:.04em;box-shadow:0 2px 10px #0008;z-index:5}
#sj-head{position:absolute;left:${SAFE.left}px;right:${SAFE.right-14}px;top:${SAFE.top+34}px;text-align:left}
#sj-head .t{font:900 35px/1.16 "Noto Sans CJK JP","Noto Color Emoji";color:#FFF3E2;-webkit-text-stroke:7px #1A0626;paint-order:stroke fill;text-shadow:0 0 18px #FF8A1F88;letter-spacing:0;white-space:nowrap}
#sj-head .t .jr{color:#9EE86A;text-shadow:0 0 16px #4FE36Acc}
#sj-head .t .s{display:inline-block;margin:0 0 0 14px;vertical-align:4px}
#sj-head .s{font:800 20px/1.2 "Noto Sans CJK JP";color:#FFCF6A;-webkit-text-stroke:4px #1A0626;paint-order:stroke fill}
#sj-clock:empty,#sj-top:empty,#sj-caps:empty,#sj-tags:empty{display:none}
#sj-clock{position:absolute;right:${SAFE.right+6}px;top:${SAFE.top+2}px;padding:2px 10px;border-radius:6px;background:#14081Ccc;border:1.5px solid #FF8A1F;font:800 16px/1.3 "Noto Sans CJK JP";color:#FFB067;white-space:nowrap}
#sj-clock b{font:900 18px "DejaVu Sans Mono",monospace;color:#fff;margin-left:6px}
#sj-card{position:absolute;left:${SAFE.left}px;right:${SAFE.right}px;top:224px;bottom:${SAFE.bottom+64}px;display:flex;flex-direction:column;justify-content:center;align-items:stretch}
#sj-card>.p{background:#120A1Ce6;border:2px solid #FF8A1F;border-radius:16px;padding:16px 18px;box-shadow:0 10px 40px #000a}
#sj .h{font:900 25px/1.25 "Noto Sans CJK JP","Noto Color Emoji";color:#FFB067;margin-bottom:8px}
#sj .h2{font:900 19px/1.3 "Noto Sans CJK JP";color:#FFCF6A;margin:10px 0 4px}
#sj .l{font:700 20px/1.38 "Noto Sans CJK JP","Noto Color Emoji";margin:5px 0}
#sj .m{font:700 17px/1.38 "Noto Sans CJK JP","Noto Color Emoji";margin:3px 0;color:#EDE6F5}
#sj .sm{font:700 14.5px/1.4 "Noto Sans CJK JP";color:#CFC6DA;margin:3px 0}
#sj .sim{color:#9FE8FF}
#sj .lab{display:inline-block;font:800 13px/1.2 "Noto Sans CJK JP";color:#14081C;background:#9FE8FF;padding:2px 7px;border-radius:5px;margin-left:4px;vertical-align:2px}
#sj .row{display:flex;gap:10px;align-items:flex-start}
#sj .k{flex:0 0 auto;width:34px;height:34px;border-radius:9px;font:900 22px/34px "DejaVu Sans";text-align:center;color:#14081C}
#sj-caps{position:absolute;left:${SAFE.left}px;right:${SAFE.right-10}px;bottom:${SAFE.bottom+FOOT_H+36}px;display:flex;flex-direction:column;gap:8px;align-items:flex-start}
#sj-caps .c{background:#0B0612e0;border-left:6px solid #FF8A1F;border-radius:10px;padding:9px 14px;font:900 27px/1.32 "Noto Sans CJK JP","Noto Color Emoji";color:#FFFFFF;box-shadow:0 6px 24px #000a}
#sj-caps .c.s{font:700 18px/1.35 "Noto Sans CJK JP";border-left-color:#9FE8FF;padding:6px 12px}
#sj-caps .c.n{font:700 15px/1.35 "Noto Sans CJK JP";border-left-color:#888;color:#E4DCEB;padding:5px 10px}
#sj-top{position:absolute;left:${SAFE.left}px;right:${SAFE.right-10}px;top:${SAFE.top+132}px;display:flex;flex-direction:column;gap:6px;align-items:flex-start}
#sj-top .b{background:#120A1Cd9;border-radius:10px;padding:7px 13px;font:900 22px/1.3 "Noto Sans CJK JP","Noto Color Emoji";color:#FFB067}
#sj-top .b.sub{font:700 16.5px/1.35 "Noto Sans CJK JP","Noto Color Emoji",sans-serif;letter-spacing:normal;color:#F4F1EA}
#sj-pins{position:absolute;inset:0}
#sj-pins .pin{position:absolute;transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center}
#sj-pins .pin .tx{background:#0B0612e8;border:2px solid var(--c,#FF8A1F);border-radius:9px;padding:4px 9px;font:800 16px/1.3 "Noto Sans CJK JP","Noto Color Emoji";white-space:nowrap;color:#fff}
#sj-pins .pin .st{width:2px;height:22px;background:var(--c,#FF8A1F)}
#sj-pins .pin .dot{width:12px;height:12px;border-radius:50%;background:var(--c,#FF8A1F);box-shadow:0 0 12px var(--c,#FF8A1F);margin-top:-2px;transform:translateY(6px)}
#sj-pins .pin.big .tx{font:900 21px/1.25 "Noto Sans CJK JP","Noto Color Emoji"}
#sj-pins .box{position:absolute;background:#0B0612e8;border:2px solid var(--c,#9EE86A);border-radius:10px;padding:6px 10px;font:700 15.5px/1.35 "Noto Sans CJK JP";color:#fff;width:268px}
#sj-pins .box b{font:900 19px/1.3 "Noto Sans CJK JP";color:var(--c,#9EE86A)}
#sj-pins .box .lt{font:700 14px/1.35 "Noto Sans CJK JP";color:#FFE2B8;margin-top:3px}
#sj-stamp{position:absolute;left:0;right:0;top:330px;display:flex;flex-direction:column;align-items:center;gap:10px}
#sj-stamp .g{font:900 68px/1 "DejaVu Sans",sans-serif;letter-spacing:.02em;color:#FFF3E2;-webkit-text-stroke:5px #2A0A3A;paint-order:stroke fill;text-shadow:0 0 30px #FF8A1Fcc,0 6px 0 #6A2A00;transform:rotate(-6deg)}
#sj-stamp .g.esc{color:#B8FF8A;text-shadow:0 0 30px #4FE36Acc,0 6px 0 #0A4A10}
#sj-stamp .g.over{color:#FF5A64;text-shadow:0 0 30px #FF2A3Acc,0 6px 0 #5A0010}
#sj-stamp .x{font:800 20px/1.35 "Noto Sans CJK JP";background:#0B0612e0;border-radius:8px;padding:5px 12px;color:#9FE8FF;text-align:center}
#sj-tags{position:absolute;left:${SAFE.left}px;bottom:${SAFE.bottom+FOOT_H+8}px;display:flex;gap:6px}
#sj-tags span{font:800 13.5px/1.2 "Noto Sans CJK JP";background:#0B0612cc;border:1px solid #9FE8FF;color:#9FE8FF;border-radius:6px;padding:3px 8px}
#sj-tags span.a{border-color:#FFCF6A;color:#FFCF6A}
#sj-foot{position:absolute;left:${SAFE.left}px;right:${SAFE.right-20}px;bottom:${SAFE.bottom+4}px;font:600 12.5px/1.35 "Noto Sans CJK JP";color:#E9E2F0;text-shadow:0 1px 3px #000,0 0 6px #000;max-height:${FOOT_H}px;overflow:hidden}
#sj-cold{background:#1B0B2Af2!important;border:3px dashed #FFD23F!important;text-align:center}
#sj-cold .is{font:800 15px "Noto Sans CJK JP";color:#1B0B2A;background:#FFD23F;display:inline-block;padding:2px 10px;border-radius:5px}
#sj-cold .hd{font:900 30px/1.2 "Noto Sans CJK JP";color:#FFD23F;margin:10px 0 4px}
#sj-cold .bd{font:900 27px/1.35 "Noto Sans CJK JP";color:#fff;margin:8px 0}
#sj-cold .cue{font:900 19px/1.35 "Noto Sans CJK JP";color:#1B0B2A;background:#FFD23F;border-radius:8px;padding:6px 10px;margin-top:12px}
#sj-title{text-align:center}
#sj-title .tc{font:900 56px/1.16 "Noto Sans CJK JP","Noto Color Emoji";color:#FFF3E2;-webkit-text-stroke:9px #1A0626;paint-order:stroke fill;text-shadow:0 0 34px #FF8A1Fcc,0 8px 0 #4A1A00}
#sj-title .tc .jr{color:#9EE86A;font-size:64px;text-shadow:0 0 30px #4FE36Acc,0 8px 0 #0A3A10}
#sj-title .ts{font:900 32px/1.3 "Noto Sans CJK JP";color:#FFCF6A;-webkit-text-stroke:6px #1A0626;paint-order:stroke fill;margin-top:18px}
#sj-title .tl{display:inline-block;font:800 18px/1.4 "Noto Sans CJK JP";color:#fff;background:#0B0612cc;border-radius:8px;padding:5px 12px;margin-top:16px}
#sj-cheat{background:#F7F2E8!important;color:#14081C;border:3px solid #FF8A1F!important;padding:14px 16px!important}
#sj-cheat .h{color:#C24A00;font-size:24px;margin-bottom:4px}
#sj-cheat .h2{color:#5A2A8A;font-size:16.5px;margin:8px 0 2px;border-bottom:2px solid #5A2A8A33}
#sj-cheat .m{color:#14081C;font-size:16px;margin:2px 0;line-height:1.35}
#sj-cheat .sm{color:#4A4458;font-size:13px}
#sj-cheat .w{color:#B0002A}
#sj-end{text-align:center}
#sj-end .tt{font:900 27px/1.25 "Noto Sans CJK JP","Noto Color Emoji";color:#FFF3E2}
#sj-end .q{font:900 23px/1.3 "Noto Sans CJK JP";color:#FFCF6A;margin:6px 0 10px}
#sj-end ul{list-style:none;padding:0;margin:4px 0 8px;columns:2;column-gap:14px;text-align:left;font:600 12.5px/1.45 "Noto Sans CJK JP";color:#E8DCFF}
#sj-ask{text-align:center}
#sj-ask .q{font:900 32px/1.3 "Noto Sans CJK JP","Noto Color Emoji";color:#FFF3E2;-webkit-text-stroke:8px #1A0626;paint-order:stroke fill;text-shadow:0 0 30px #FF8A1Fcc}
#sj-ask .c{font:900 28px/1.3 "Noto Sans CJK JP","Noto Color Emoji";color:#FFCF6A;margin-top:18px;-webkit-text-stroke:5px #1A0626;paint-order:stroke fill}
`;

export class SeriesOverlay{
 constructor(parent,{run=null,lang='ja'}={}){
  this.lang=lang;this.run=run;
  const st=document.createElement('style');st.textContent=CSS;document.head.append(st);
  const root=document.createElement('div');root.id='sj';parent.append(root);this.root=root;
  root.innerHTML='<div id="sj-pins"></div><div id="sj-top"></div><div id="sj-card"></div><div id="sj-stamp"></div><div id="sj-caps"></div><div id="sj-tags"></div><div id="sj-foot"></div><div id="sj-clock"></div><div id="sj-head"></div><div id="sj-parody"></div>';
  this.el=Object.fromEntries([...root.children].map(e=>[e.id.slice(3),e]));
  this.cache={};
 }
 set(name,h){if(this.cache[name]!==h){this.el[name].innerHTML=h;this.cache[name]=h;}}
 // ---- per frame ----
 update(f){
  const C=COPY,L=this.lang,rec={t:f.t,section:f.section,title:{header:false,card:false},parody:false,claims:[],sims:[],strings:[],labels:[],stamps:[]};
  const claims=new Set(),txt=T=>{for(const id of T.factIds||[])claims.add(id);rec.strings.push(T[L]);return html(T[L]);};
  const sim=(key,T,vals,src)=>{let s=T[L];for(const [k,v] of Object.entries(vals))s=s.replaceAll(`{${k}}`,v);for(const id of T.factIds||[])claims.add(id);rec.strings.push(s);rec.sims.push({key,shown:vals,src,text:s,label:/シミュレーション|simulation/i.test(s)});return html(s);};
  const S=f.section,lu=f.local,jr=f.jr,run=this.run;
  let top='',card='',caps='',stamp='',pins='',tags=[];
  // persistent: ※パロディ + title header (+ subtitle)
  this.set('parody',txt(C.PARODY.cue));rec.parody=true;
  const showHeader=S!=='title';
  if(showHeader){const m=C.TITLE.main[L],k=m.lastIndexOf(' ');rec.strings.push(m);// 2 lines: 「🧙…🎃」 / 「JR編」 (green) + subtitle
   this.set('head',`<div class="t">${html(m.slice(0,k))}<br><span class="jr">${html(m.slice(k+1))}</span><span class="s">${txt(C.TITLE.sub)}</span></div>`);}else this.set('head','');rec.title.header=showHeader;
  // parody game clock (not simulation): 09 s → 46 s
  const gc=f.t>=9&&f.t<46;this.set('clock',gc?`${html(C.CLOCK.tag[L])}<b>${html(C.CLOCK.countdown[L].replace('{mmss}',mmss(46-f.t)))}</b>`:'');
  if(gc)rec.strings.push(C.CLOCK.countdown[L].replace('{mmss}',mmss(46-f.t)));
  const crowdVisible=['mission','walk','inside','rules','facts','title','cold','tally'].includes(S);
  if(['mission','walk','inside'].includes(S))tags.push(`<span>${txt(GAME.crowd)}</span>`);
  if(S==='cold'){
   const N=C.COLD_OPEN;card=`<div class="p" id="sj-cold"><div class="is">${txt(N.issuer)}</div><div class="hd">${txt(N.head)}</div><div class="m">${txt(N.when)}</div><div class="bd">${txt(N.body)}</div><div class="bd" style="color:#FFB067">${txt(N.order)}</div><div class="cue">${txt(N.cue)}</div></div>`;}
  else if(S==='title'){
   const k=clamp((f.t-2)/.35),tc=C.TITLE.card[L].split('\n');rec.title.card=true;rec.titleAlpha=k;
   card=`<div id="sj-title" style="opacity:${k.toFixed(3)};transform:scale(${(1.08-.08*k).toFixed(4)})"><div class="tc">${html(tc.slice(0,2).join('\n'))}<br><span class="jr">${html(tc[2]||'')}</span></div><div class="ts">${txt(C.TITLE.sub)}</div><div class="tl">${txt(C.TITLE.lines)}</div></div>`;
   claims.add('JR-LINE-01');rec.strings.push(C.TITLE.card[L]);}
  else if(S==='rules'){
   const R=C.RULES;card=`<div class="p"><div class="h">${txt(R.head)}</div>${R.items.map(it=>`<div class="l" style="color:#FFCF6A">${txt(it.title)}</div><div class="m">${txt(it.tip)}</div>`).join('')}</div>`;}
  else if(S==='facts'){
   const F=C.FACTS_2026;card=`<div class="p"><div class="h">${txt(F.head)}</div>${F.items.map(x=>`<div class="m">・${txt(x)}</div>`).join('')}<div class="h2">${txt(F.notAnnouncedHead)}</div>${[F.notAnnounced[0],F.notAnnounced[2],F.notAnnounced[3]].map(x=>`<div class="m">・${txt(x)}</div>`).join('')}</div>`;}
  else if(S==='mission'){
   const M=C.MISSION;top=`<div class="b">${txt(M.head)}：${txt(M.objective)}</div>`;
   if(lu<1.4)stamp=`<div class="g" style="opacity:${dimStamp(lu)}">${txt(GAME.start)}</div>`,rec.stamps.push('start');
   const P=jr?.player,spawned=P&&(P.walking||P.queued||P.reachedAt!=null);
   const at=spawned?f.proj?.player:f.proj?.start;
   if(at?.inFrame){pins+=this.pin('player',at,txt(M.player),'#FF8A1F',true);rec.labels.push({id:'player',x:at.x,y:at.y});}
   const s0=f.proj?.start;if(s0?.inFrame&&spawned){pins+=this.pin('start',s0,txt(M.start),'#FFD23F');rec.labels.push({id:'start',x:s0.x,y:s0.y});}
   if(jr&&lu>=1.2){const d=jr.density.camera.max;caps+=`<div class="c s sim">${sim('density',M.density,{d:p1(d)},{value:d,at:'start',radius:jr.radius??12})}</div>`;}
   if(!spawned&&!s0)caps+=`<div class="c s">${txt(M.start)}</div>`;}
  else if(S==='walk'){
   const W=C.WALK_A;top=`<div class="b">${txt(W.head)}</div><div class="b sub">${txt(W.dist)}<br>${txt(W.caveat)}</div>`;
   const step=W.steps.find(s=>s.wp===f.wp);if(step)caps+=`<div class="c">${txt(step)}</div>`;
   if(f.clip===4){caps+=`<div class="c s">${txt(W.staff)}</div>`;
    const g=jr?.gates?.find(g=>g.key==='hachiko');if(g)caps+=`<div class="c s sim">${sim('queue',C.TALLY.queue,{queue:fmt(g.queue)},{value:g.queue,gate:'hachiko'})}</div>`;}
   tags.push(`<span class="a">${txt(GAME.fast)}</span>`);}
  else if(S==='inside'){
   const I=C.INTERIOR;top=`<div class="b sub">${txt(I.approx)}</div>`;
   const A=run?.summary?.routes?.find(r=>r.key==='A');
   if(lu<1.6&&A?.player?.doneAt!=null){stamp=`<div class="g esc" style="opacity:${dimStamp(lu)}">ESCAPED!</div><div class="x">${txt(C.TALLY.stampWhere)}<br>${sim('stamp',C.TALLY.stamp,{},{outcome:A.outcome,route:'A'}).replace(/^ESCAPED!<br>/,'')}</div><div class="x">${sim('arrival',C.TALLY.arrival,{mmss:mmss(A.player.doneAt)},{value:A.player.doneAt,route:'A',what:'player admitted at the Hachiko gate (JR time, s)'})}</div>`;rec.stamps.push('escaped');}
   else{const k=lu<3.75?0:1,u2=k?lu-3.75:lu;
    if(k===0)caps+=u2<1.9?`<div class="c">${txt(I.gate)}</div>`:`<div class="c">${txt(I.exits)}</div>`;
    else caps+=u2<1.85?`<div class="c">${txt(I.stairs)}</div><div class="c s">${txt(I.updown)}</div>`:`<div class="c">${txt(I.plat1)}</div><div class="c">${txt(I.plat2)}</div><div class="c s">${txt(I.saikyo)}</div>`;}}
  else if(S==='gates'){
   const B=C.BRANCHES;top=`<div class="b">${txt(B.head)}</div>`;
   const cols={A:'#FF8A1F',B:'#5AB8FF',C:'#FFD23F',D:'#C59BFF'};
   caps+=`<div class="c s" style="font-size:17px">${B.gates.map(g=>`<div class="row" style="margin:4px 0"><div class="k" style="background:${cols[g.key]}">${g.key}</div><div>${txt(g.label).replace(/^[A-D] /,'')}</div></div>`).join('')}<div class="sm">${txt(B.note)}・${txt(B.approx)}</div></div>`;
   for(const [k,p] of Object.entries(f.proj?.gates||{}))if(p?.inFrame){pins+=this.pin('gate'+k,p,k,cols[k],true);rec.labels.push({id:'gate:'+k,x:p.x,y:p.y});}}
  else if(S==='alt'){
   const B=C.BRANCHES;top=`<div class="b">${txt(B.altHead)}</div>`;
   const appear=k=>clamp((lu-.9-k*.45)/.3);
   const sp=f.proj?.altStart;if(sp?.inFrame){pins+=this.pin('altStart',sp,txt(B.startPin),'#FFFFFF',true);rec.labels.push({id:'start:H',x:sp.x,y:sp.y});}
   B.alt.forEach((a,k)=>{const p=(f.proj?.stations||[]).find(s=>s.key===a.key);if(!p||appear(k)<=0)return;const rc=ALT_COLORS[a.key]||'#9EE86A';
    const box=this.box(p,f,a.key);pins+=`<div class="box" style="left:${box.x}px;top:${box.y}px;opacity:${appear(k).toFixed(3)};--c:${rc}"><b>${txt(a.walk).split('<br>')[0]}</b><br>${html(a.walk[L].split('\n').slice(1).join('\n'))}<div class="lt">${txt(a.last)}</div></div>`;
    pins+=this.pin('st'+a.key,p,'',rc);rec.labels.push({id:'station:'+a.key,x:p.x,y:p.y,box:{x0:box.x,y0:box.y,x1:box.x+268,y1:box.y+box.h}});});
   if(lu>2.2)caps+=`<div class="c s" style="max-width:330px">${txt(B.lastHead)}<br>${txt(B.shibuyaLast)}</div><div class="c s" style="border-left-color:#FF4A55;max-width:330px">${txt(B.warn)}</div>`;
   if(f.proj?.redZone?.inFrame&&lu>1){caps+=`<div class="c n" style="max-width:330px">${txt(B.zone)}</div>`;}}
  else if(S==='taxi'){
   const X=C.TAXI;top=`<div class="b">${txt(X.head)}</div>`;
   const tp=f.proj?.taxi;if(tp?.inFrame){pins+=this.pin('taxi',tp,'🚕','#FFD23F',true);rec.labels.push({id:'taxi',x:tp.x,y:tp.y});}
   const ns=f.proj?.gates?.C;if(ns?.inFrame){pins+=this.pin('ns',ns,html(C.BRANCHES.gates[2].label[L].split('\n')[0].replace(/^C /,'')),'#FFD23F');claims.add('JR-GATE-01');rec.labels.push({id:'gate:C',x:ns.x,y:ns.y});}
   caps+=`<div class="c" style="font-size:22px">${txt(X.stand)}</div><div class="c s">${txt(X.walk)}</div><div class="c s">${txt(X.scramble)}</div><div class="c s">${txt(X.zone)}</div><div class="c n">${txt(X.west)}・${txt(X.east)}</div>`;}
  else if(S==='fall'){
   const F=C.FALLBACK;card=`<div class="p"><div class="h">${txt(F.head)}</div><div class="l">${txt(F.other)}</div><div class="h2">${txt(F.lastHead)}</div><div class="m">${txt(F.yamanote)}</div><div class="m">${txt(F.saikyo)}</div><div class="m">${txt(F.shonan)}</div><div class="h2">案内・トイレ</div><div class="m">・${txt(F.info)}</div><div class="m">・${txt(F.toilet)}</div><div class="m">・${txt(F.tokyu)}</div><div class="m">・${txt(F.rest)}</div><div class="sm">${txt(F.onDay)}</div></div>`;
   rec.strings.push('案内・トイレ');}
  else if(S==='tally'){
   const T=C.TALLY,R=run?.summary?.routes||[];const esc=R.filter(r=>r.outcome==='escaped').length;
   const allOut=R.length>0&&esc===R.length;// m1: GAME OVER only when some route failed
   stamp=`<div class="g ${allOut?'esc':'over'}" style="opacity:${dimStamp(lu)}">${txt(allOut?T.clear:T.gameOver)}</div>`;rec.stamps.push(allOut?'clear':'gameover');rec.gameOver={escaped:esc,total:R.length,outcomes:R.map(r=>r.outcome)};
   const rows=R.map(r=>{const info=run.routes?.find(x=>x.key===r.key),alt=info?.kind==='walk-alt';for(const id of r.sources||[])claims.add(id);
     const ok=`<div class="k" style="background:${r.outcome==='escaped'?'#9EE86A':'#FF5A64'}">${r.outcome==='escaped'?'✔':'✖'}</div>`;
     if(alt){const t=sim('route'+r.key,T.altRow,{mmss:mmss(r.timeP50)},{value:r.timeP50,route:r.key,what:'median time (s) of the walk-alt walkers to the edge of the modelled area (outside the red zone), not to the station'});
      return `<div class="row" style="margin:5px 0;align-items:center">${ok}<div class="m" style="margin:0">${txt(T.altKey)} <span class="sim">${t}</span></div></div>`;}
     const lab=info?.label?.[L]??r.key;rec.strings.push(lab);
     const t=sim('route'+r.key,GAME.rowTime,{mmss:mmss(r.timeP50)},{value:r.timeP50,route:r.key,what:'median route time (s) of the route walkers'});
     return `<div class="row" style="margin:5px 0;align-items:center">${ok}<div class="m" style="margin:0">${html(r.key+' '+lab)}　<span class="sim">${t}</span></div></div>`;}).join('');
   card=`<div class="p" style="margin-top:250px;border-color:#9FE8FF"><div class="h sim">${sim('tally',T.tally,{escaped:String(esc),total:String(R.length)},{escaped:esc,total:R.length})}</div>${rows}<div class="sm sim">${sim('rowNote',{ja:'時間＝各ルート24人の中央値（シミュレーション）',en:'Times: median of 24 walkers per route (simulation)',factIds:[]},{},{walkers:run?.summary?.walkersPerRoute})}</div><div class="sm">${txt(T.notForecast)}</div><div class="l" style="color:#FFCF6A">${txt(T.line)}</div></div>`;}
  else if(S==='cheat'){
   const H=C.CHEAT;card=`<div class="p" id="sj-cheat"><div class="h">📌 ${txt(H.head)}</div><div class="h2">${txt(H.gatesHead)}</div>${H.gates.map(g=>`<div class="m">${txt(g)}</div>`).join('')}<div class="h2">${txt(H.altHead)}</div>${H.alt.map(g=>`<div class="m">${txt(g)}</div>`).join('')}<div class="h2">タクシー・終電</div><div class="m">${txt(H.taxi)}</div><div class="m">${txt(H.last)}</div><div class="m">${txt(H.last2)}</div><div class="m w">${txt(H.warn)}</div><div class="sm">${txt(H.status)}</div><div class="sm">${txt(H.note)}</div></div>`;
   rec.strings.push('タクシー・終電');rec.cheat=true;}
  else if(S==='ask'){
   const Q=C.QUESTION,k=clamp(lu/.4);card=`<div id="sj-ask" style="opacity:${k.toFixed(3)}"><div class="q">${txt(Q.line)}</div><div class="c">${txt(Q.cta)}</div></div>`;rec.question=true;
   caps+=`<div class="c s" style="font-size:16px">A ハチ公改札・B 南改札・C 新南改札・D 中央改札</div>`;rec.strings.push('A ハチ公改札・B 南改札・C 新南改札・D 中央改札');claims.add('JR-GATE-01');}
  else if(S==='end'){
   const E=C.END_CARD;for(const id of ALL_FACT_IDS)claims.add(id);
   card=`<div class="p" id="sj-end"><div class="tt">${txt(E.title)}</div><div class="q">${txt(E.question)}</div><div class="h2">${txt(E.sourcesHead)}</div><ul>${END_SOURCES[L].map(s=>`<li>${html(s)}</li>`).join('')}</ul><div class="sm">${html(END_DATA[L])}</div><div class="m sim">${txt(E.sim)}</div><div class="m">${txt(E.walk)}・${txt(E.approx)}</div><div class="l" style="color:#FFCF6A">${txt(E.people)}</div><div class="sm">${txt(E.parody)}</div><div class="sm">${txt(E.checkOnDay)}</div></div>`;
   rec.endSources=END_SOURCES[L].slice();rec.strings.push(...END_SOURCES[L]);}
  this.set('top',top);this.set('card',card);this.set('caps',caps);this.set('stamp',stamp);this.set('pins',pins);this.set('tags',tags.join(''));
  // footnote: every outlet of every fact on screen (the end card lists them all itself)
  const ids=[...claims];rec.claims=ids;
  // + the 3D/map data credit on every 3D frame (PLATEAU, OSM-derived geometry: ODbL attribution where it is shown)
  let foot=S==='end'?'':footnote(ids,L);
  if(S!=='end'){const cr=/OpenStreetMap/.test(foot)?DATA_CREDIT[L].plateau:DATA_CREDIT[L].both;foot=foot?foot+DATA_CREDIT[L].sep+cr:DATA_CREDIT[L].prefix+cr;}
  this.set('foot',html(foot));rec.footnote={ids:S==='end'?ALL_FACT_IDS.slice():ids,text:S==='end'?END_SOURCES[L].join(' / '):foot};
  // rendered footnote box (browser only): must not be clipped and must end above the bottom unsafe zone
  const fe=this.el.foot;if(fe&&typeof fe.getBoundingClientRect==='function'){const r=fe.getBoundingClientRect();rec.footBox={top:Math.round(r.top),bottom:Math.round(r.bottom),scrollH:fe.scrollHeight,clientH:fe.clientHeight,limit:SAFE.H-SAFE.bottom};}
  rec.crowdVisible=crowdVisible;
  return rec;}
 pin(id,p,label,color,big=false){const x=Math.round(clamp(p.x,SAFE.left+20,SAFE.W-SAFE.right-20)),y=Math.round(clamp(p.y,SAFE.top+150,SAFE.H-SAFE.bottom-10));
  return `<div class="pin${big?' big':''}" style="left:${x}px;top:${y}px;--c:${color}">${label?`<div class="tx">${label}</div><div class="st"></div>`:''}<div class="dot"></div></div>`;}
 // station boxes beside their point, inside the safe column, never over the bottom panel
 box(p,f,key){const w=268,h=120;const low=p.y>620;// low on screen: right column, clear of the left caption stack
  let x=low?SAFE.W-SAFE.right-w+40:p.x<360?p.x+16:p.x-w-16;x=clamp(x,SAFE.left,SAFE.W-SAFE.right-w+40);let y=clamp(low?p.y-h-30:p.y-h/2,SAFE.top+200,SAFE.H-SAFE.bottom-h-60);return {x:Math.round(x),y:Math.round(y),h};}
}
