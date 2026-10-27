// Game HUD components of the series variants (JR編). One look for every variant + the shared opening.
//
// Two layers:
//   1. pure component functions  COMPONENTS[c](item, env) → {slot, html, strings, factIds, sims, stamps, ...}
//      (no DOM: runnable in node for tests; html is a string with all animation baked in as inline styles)
//   2. GameHUD (browser): owns the #gh layer, injects tokens/fonts/hud.css, lays components into slots per frame.
//
// Deterministic: every animation is a function of the item-local time t (s) and the item's dur — no CSS
// animations, transitions or wall clock. Same t → same pixels.
//
// Usage (variant page):
//   import {GameHUD} from './ui/components.mjs';
//   const hud=new GameHUD(document.body,{lang:'ja'}); await hud.ready;          // fonts + css loaded
//   const rec=hud.frame({T, items:[{c:'mission',ja:'…',factIds:[],t:1.2,dur:3}, …],
//                        header:true, clock:{time:'22:14'}|null, footnote:'出典：…'|ids=>'…'|null, config, sources});
//   window.__hud=rec;   // record: strings, factIds, sims, stamps, parody, boxes, safe, footBox (see frame())
// item.t = seconds since the item (beat) started (defaults to T), item.dur = its beat duration (for exit fade).
// Component keys (item.c): parody header clock mission choice caption direction sim footnote stamp lesson cheat
//   sources press-start notice rules pin legend continue endcard gag
//   ('logo' is the 3D logotype of series/ui/logo3d.mjs → ignored here).
// Combined episodes (2026-10-26): continue (「CONTINUE?」 retry beat), endcard (closing question), gag (kaiju caption),
//   stamp {onBlack:true, safety} (GAME OVER on the hard cut to black), sources {compact:true} (over+clear union).
// Item fields per component: see the JSDoc line above each function below. Texts: item[lang] ?? item.ja.
import {SAFE,ZONE,FOOT_CLEAR,COLOR,MOTION,EASE,clamp,seg,mix,hash,cssVars,fontFaceCSS,FONT_LOADS} from './tokens.mjs';

export const HUD_TEXT=Object.freeze({   // game-framing strings (no facts)
 parody:'※パロディ', parodySub:'架空のゲーム演出', fiction:'フィクション',
 sourcesNote:'※この動画はパロディ（フィクション）です。実在の団体の発表ではありません',
 title:'ハロウィンの渋谷を脱出せよ！', jr:'JR編', sub:'10/31 渋谷からどう帰る？',
 clockLabel:'ゲーム内時刻（架空）',
 noticeIssuer:'渋谷脱出ゲーム運営（架空）', noticeFoot:'',
 cheatTitle:'保存版 渋谷脱出メモ', cheatSnap:'スクショして保存', cheatParody:'※パロディ',
 cheatFoot:'当日は駅係員・警察の案内と公式発表を確認してください。',
 sourcesHead:'出典', lessonTab:'LESSON', lessonTabJa:'本当の教訓',
 press:'PRESS START', pressSub:'渋谷から脱出せよ', pressGo:'はじめる',
 pick:'決定',
 // combined episodes (2026-10-26): CONTINUE? retry screen, end card, sources-card credit
 cont:'CONTINUE?', contSub:'別のルートでやり直す', yes:'YES', no:'NO', contTab:'RETRY',
 credit:'出典：国土交通省 PLATEAU（3D都市モデル）／© OpenStreetMap contributors',
 endTab:'THANKS FOR PLAYING',
 // v6 (2026-10-27): opening mission card, first choice, TRUE END, guide card, GOODBYE end card
 missionIssuer:'脱出ゲーム運営（架空）', guideDone:'TRUE END', quoteLabel:'引用', oursLabel:'制作チームより', oursTab:'FROM THE TEAM',
});
// GOODBYE BAD HALLOWEEN end card — exact text from CONTRACT/STEERING (HAGINO-approved, endcard-facts.md 2026-10-27).
// Must not be altered (only line breaks). Block 1 = quoted city text (attributed), block 2 = facts, block 3 = OUR message
// (never attributed to the city), foot = sources + fiction note. `\n` marks allowed visual line breaks only.
export const GOODBYE_TEXT=Object.freeze({
 quote:Object.freeze({title:'GOODBYE BAD HALLOWEEN',ja:'渋谷駅周辺では、条例で飲酒・喫煙、\nごみのポイ捨ては禁止されています。',attr:'（渋谷区）',
  en:'Drinking, smoking and littering on the streets around Shibuya Station are banned by ordinance.',enAttr:'(Shibuya City)'}),
 facts:Object.freeze([
  Object.freeze({ja:'10/30(金)早朝〜11/1(日)朝方　ハチ公像は囲いで観覧不可',en:'Oct 30 early AM – Nov 1 morning: Hachiko statue fenced off'}),
  Object.freeze({ja:'10/30夕方〜11/1早朝　駅周辺で交通規制',en:'Oct 30 evening – Nov 1 early AM: traffic restrictions around the station'})]),
 ours:Object.freeze({ja:'いちばんのCLEARは、\n今年の渋谷に「行かない」こと。',en:"The best CLEAR this year: don't go to Shibuya."}),
 foot:Object.freeze({ja:'出典：渋谷区公式X（2026/10/22）・渋谷区・警視庁渋谷警察署　※本編はフィクションです',
  en:'Sources: Shibuya City (X, Oct 22, 2026), Shibuya City, MPD Shibuya Police Station. *Story is fiction.'}),
});
const STAMP_KIND={
 GAME_OVER:{cls:'over',word:'GAME OVER',w2:'MISSION FAILED',tint:'over'},
 GAME_CLEAR:{cls:'clear',word:'GAME CLEAR',w2:'MISSION COMPLETE',tint:'clear'},
 CLEAR:{cls:'clear',word:'GAME CLEAR',w2:'MISSION COMPLETE',tint:'clear'},
 ESCAPED:{cls:'esc',word:'ESCAPED!',w2:'YOU MADE IT OUT',tint:'esc'},
 TRUE_END:{cls:'true',word:'TRUE END',w2:'THE SAFEST CLEAR',tint:'true'},   // v6: 「そもそも渋谷に行かない」 → gold, warm
};
const STAMP_ID={over:'gameover',clear:'clear',esc:'escaped',true:'trueend'};
const inkOf=K=>K.cls==='over'?COLOR.overInk:K.cls==='clear'?COLOR.clear:K.cls==='true'?COLOR.gold:COLOR.pumpkinHi;

// ---------- text helpers ----------
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const EMO=/(\p{Extended_Pictographic}️?)/gu;
export const html=s=>esc(s).replace(EMO,'<span style="font-family:\'Noto Color Emoji\';font-weight:400">$1</span>').replace(/\n/g,'<br>');
const f3=v=>(+v).toFixed(3);
const SIM_RE=/シミュレーション|simulation/i;

// ---------- icons (original glyphs, 24×24 viewBox) ----------
export const ICON={
 pumpkin:`<svg viewBox="0 0 24 24"><path d="M12 6c-1-2.6.6-4 2.6-4.2-.9 1-1.2 2.4-.9 4" fill="#5BEA9A"/><ellipse cx="7.6" cy="14" rx="5.6" ry="7" fill="#E46A0C"/><ellipse cx="16.4" cy="14" rx="5.6" ry="7" fill="#E46A0C"/><ellipse cx="12" cy="14" rx="5.4" ry="7.6" fill="#FF8A1F"/><path d="M7 12l2.6-2 .6 3zM17 12l-2.6-2-.6 3z" fill="#2A0A00"/><path d="M7.4 16.2c2.8 2.4 6.4 2.4 9.2 0l-1.4.2-.9 1.1-1-1-1.3 1.2-1.3-1.2-1 1-.9-1.1z" fill="#2A0A00"/></svg>`,
 target:`<svg viewBox="0 0 24 24" fill="none" stroke="#FFB45A" stroke-width="1.8"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.2" stroke="#FF8A1F"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" stroke-linecap="round"/><circle cx="12" cy="12" r="1.4" fill="#FFD23F" stroke="none"/></svg>`,
 clock:`<svg viewBox="0 0 24 24" fill="none" stroke="#FFB45A" stroke-width="2"><circle cx="12" cy="13" r="8.5"/><path d="M12 8.2V13l3.2 2" stroke-linecap="round"/><path d="M9 2.5h6" stroke-linecap="round"/></svg>`,
 arrow:`<svg viewBox="0 0 24 24"><path d="M3 9.2h9.5V4.5L21.5 12l-9 7.5v-4.7H3z" fill="#FFD23F" stroke="#3A1200" stroke-width="1.2" stroke-linejoin="round"/><path d="M3 9.2h9.5V4.5L16 7.4" fill="none" stroke="#FFF4C2" stroke-width="1.1" stroke-linejoin="round" opacity=".9"/></svg>`,
 check:`<svg viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
 cross:`<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/></svg>`,
 bulb:`<svg viewBox="0 0 24 24"><circle cx="12" cy="10" r="9" fill="rgba(255,210,63,.18)"/><path d="M12 3.2a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.3h5c0-.9.4-1.7 1.1-2.3A6 6 0 0 0 12 3.2z" fill="#FFD23F" stroke="#5A3A00" stroke-width="1"/><path d="M9.6 18.2h4.8M10.2 20.6h3.6" stroke="#FFE7A0" stroke-width="1.6" stroke-linecap="round"/><path d="M10.4 9.5l1.6 2 1.6-2" fill="none" stroke="#8A5200" stroke-width="1.1"/></svg>`,
 camera:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8h4l2-2.5h6L17 8h4v11H3z" stroke-linejoin="round"/><circle cx="12" cy="13.2" r="3.6"/></svg>`,
 pin:`<svg viewBox="0 0 24 24"><path d="M9 2.5h6l-1 5 3 3.2H7l3-3.2z" fill="#FF8A1F" stroke="#3A1200" stroke-width="1"/><path d="M12 10.7v10.8" stroke="#E9DDFF" stroke-width="2" stroke-linecap="round"/></svg>`,
 train:`<svg viewBox="0 0 24 24" fill="#fff"><rect x="5" y="3" width="14" height="14" rx="3"/><rect x="7" y="5.5" width="10" height="5" rx="1" fill="#170E22" opacity=".85"/><circle cx="8.6" cy="13.6" r="1.3" fill="#170E22"/><circle cx="15.4" cy="13.6" r="1.3" fill="#170E22"/><path d="M8 17l-2.5 4M16 17l2.5 4" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>`,
 taxi:`<svg viewBox="0 0 24 24" fill="#fff"><rect x="9" y="3" width="6" height="3" rx=".8"/><path d="M5.5 11l2-4.5h9l2 4.5z"/><rect x="3" y="10.5" width="18" height="6.5" rx="2"/><circle cx="7.5" cy="17.5" r="2" fill="#170E22"/><circle cx="16.5" cy="17.5" r="2" fill="#170E22"/></svg>`,
 walk:`<svg viewBox="0 0 24 24" fill="#fff"><circle cx="13" cy="4" r="2.2"/><path d="M11.4 7.2l-3 2.6-.8 4 1.6.3.7-3.2 1.4-1-1.2 5.8-3 5.3 1.6.9 3.2-5.3 1.9 2.4v4.5H15v-5.2l-2-2.6.7-3.4.9 1.6 3 1.4.6-1.5-2.5-1.2-1.6-3.2c-.4-.7-1.2-1.1-2-1.1z"/></svg>`,
 gate:`<svg viewBox="0 0 24 24" fill="#fff"><rect x="2.5" y="8" width="5" height="12" rx="1"/><rect x="16.5" y="8" width="5" height="12" rx="1"/><path d="M7.5 12h4M12.5 12h4" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><path d="M4 4.5h16" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>`,
 info:`<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#fff"/><path d="M12 10.5v7" stroke="#170E22" stroke-width="2.6" stroke-linecap="round"/><circle cx="12" cy="7" r="1.6" fill="#170E22"/></svg>`,
 sim:`<svg viewBox="0 0 24 24" fill="#06222C"><circle cx="5" cy="7" r="2.4"/><circle cx="12" cy="5" r="2.4"/><circle cx="19" cy="9" r="2.4"/><circle cx="8" cy="15" r="2.4"/><circle cx="16" cy="17" r="2.4"/><path d="M5 7l7-2 7 4M5 7l3 8 8 2 3-8" fill="none" stroke="#06222C" stroke-width="1.2"/></svg>`,
 warn:`<svg viewBox="0 0 24 24"><path d="M12 2.5l10 18H2z" fill="#FF6FB1" stroke="#3A0020" stroke-width="1.2" stroke-linejoin="round"/><path d="M12 9v5.5" stroke="#2A0014" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="17.4" r="1.4" fill="#2A0014"/></svg>`,
 ng:`<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="#fff" stroke-width="3"/><path d="M6.5 17.5l11-11" stroke="#fff" stroke-width="3"/></svg>`,
 ok:`<svg viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
 cursor:`<svg viewBox="0 0 40 40"><path d="M6 5l28 15L6 35l6-15z" fill="#FF8A1F" stroke="#2A0A00" stroke-width="2" stroke-linejoin="round"/><path d="M6 5l28 15H12z" fill="#FFD9A0" opacity=".85"/><path d="M12 20L6 35l28-15z" fill="#B4470A" opacity=".6"/></svg>`,
 play:`<svg viewBox="0 0 24 24"><path d="M5 3l16 9-16 9z" fill="#160A14"/></svg>`,
 rewind:`<svg viewBox="0 0 24 24"><path d="M12 5v14L2 12zM22 5v14l-10-7z" fill="#FFD23F" stroke="#3A1200" stroke-width="1.2" stroke-linejoin="round"/></svg>`,
 bat:`<svg viewBox="0 0 24 24"><path d="M12 8.5l1.2-2 .8 2.4c1.6-.4 3.6 0 5.2 1.6 1.4 1.4 2.4 3.4 2.8 5.3-1.2-1-2.6-1.2-3.6-.6-.8-1.2-2.2-1.6-3.4-1-.6-.9-1.6-1.2-3-1.2s-2.4.3-3 1.2c-1.2-.6-2.6-.2-3.4 1-1-.6-2.4-.4-3.6.6.4-1.9 1.4-3.9 2.8-5.3 1.6-1.6 3.6-2 5.2-1.6l.8-2.4z" fill="#160A14"/></svg>`,
};
const icon=k=>ICON[k]||'';

// ---------- motion helpers ----------
// life(): enter progress, exit progress and combined alpha for an item living [0,dur]
export function life(t,dur,{enter=MOTION.enter,exit=MOTION.exit,exitOn=true}={}){
 const kin=EASE.outCubic(seg(t,0,enter)),kout=exitOn&&dur>0?EASE.inCubic(seg(t,dur-exit,dur)):0;
 return {kin,kout,alpha:kin*(1-kout)};}
// enter style: slide-l | slide-r | slide-up | scale | glitch | fade | none
export function enterStyle(kind,t,dur,opt={}){
 const {kin,kout}=life(t,dur,opt),f=Math.floor(t*MOTION.fps),seed=opt.seed||0;
 let tx=0,ty=0,sc=1,op=kin*(1-kout),clip='',gx=0;
 if(kind==='slide-l')tx=-48*(1-kin);
 else if(kind==='slide-r')tx=48*(1-kin);
 else if(kind==='slide-up')ty=28*(1-kin);
 else if(kind==='scale')sc=mix(.86,1,EASE.outBack(seg(t,0,opt.enter??MOTION.enter)));
 else if(kind==='glitch'){
  const g=seg(t,0,MOTION.glitch),on=g<1;
  if(on){const h1=hash(f,7+seed),h2=hash(f,13+seed),h3=hash(f,29+seed);
   tx=(h1-.5)*26*(1-g);gx=(4+8*h2)*(1-g);
   const a=Math.floor(h2*60),b=Math.floor(h3*40);clip=`clip-path:inset(${a*(1-g)}% 0 ${b*(1-g)}% 0);`;
   op=(h3>.22||g>.6?1:.25)*(1-kout);}
  else op=1-kout;
  tx-=40*(1-EASE.outExpo(seg(t,0,MOTION.glitch+.1)));
  if(t<1/MOTION.fps-1e-6)op=0;}// fixer: the glitch-in starts one frame late (frame 0 = the cut: no half-off-screen card, QA finding 11)
 else if(kind==='none')op=1-kout;
 ty-=8*kout;
 return {style:`opacity:${f3(op)};transform:translate(${f3(tx)}px,${f3(ty)}px) scale(${f3(sc)});${clip}${gx?`--gx:${f3(gx)}px;`:''}`,glitch:gx>0,alpha:op};
}
const rowIn=(t,i,base=.18,kind='x')=>{const k=EASE.outCubic(seg(t,base+i*MOTION.stagger,base+i*MOTION.stagger+.28));return `opacity:${f3(k)};transform:translate${kind==='x'?'X':'Y'}(${f3((1-k)*(kind==='x'?-22:14))}px)`;};
const panel=(cls,inner,{style='',inStyle='',acc=null,brackets=true,attrs=''}={})=>
 `<div class="gh-sh ${cls}" style="${style}" ${attrs}><div class="gh-panel"${acc?` style="--acc:${acc}"`:''}><div class="in" style="${inStyle}">${inner}${brackets?'<i class="gh-br tr"></i><i class="gh-br bl"></i>':''}</div></div></div>`;
const tab=(label,{ic='',jp=''}={})=>`<div class="gh-tab">${ic?icon(ic):''}<span>${esc(label)}</span>${jp?`<span class="jp">${esc(jp)}</span>`:''}</div>`;

// ---------- result builder ----------
function R(slot,lang){const r={slot,html:'',strings:[],factIds:[],sims:[],stamps:[]};
 r.txt=(T,key)=>{if(T==null)return '';const s=typeof T==='string'?T:(T[lang]??T.ja??'');for(const id of (typeof T==='object'&&T.factIds)||[])if(!r.factIds.includes(id))r.factIds.push(id);if(s)r.strings.push(s);return html(s);};
 r.ids=ids=>{for(const id of ids||[])if(!r.factIds.includes(id))r.factIds.push(id);};
 return r;}
const L=(item,lang,k='')=>item?.[k?k+'_'+lang:lang]??item?.[k||'ja']??'';

// ================= components =================
// parody: {ja?, sub?} — the ※パロディ sticker. Opt-in only (GameHUD.frame({parody:true})): HAGINO steering 2026-10-26 removed
// the persistent label; only the small 「フィクション」 tag (below) during the fictional notice + the sources-card note remain.
function parody(item,env){const r=R('parody',env.lang);
 r.html=`<div class="gh-parody" data-c="parody" style="left:${ZONE.parody.left}px;top:${ZONE.parody.top}px"><span class="k">${r.txt(item.ja??HUD_TEXT.parody)}</span>${item.sub===false?'':`<span class="s">${r.txt(item.sub??HUD_TEXT.parodySub)}</span>`}</div>`;
 r.parody=true;return r;}

// fiction: {ja?} — small, unobtrusive 「フィクション」 corner tag. GameHUD adds it automatically while a 'notice' item (the
// fictional operator cold open) is on screen, so it can never be mistaken for a real announcement.
function fiction(item,env){const r=R('parody',env.lang);
 r.html=`<div class="gh-fiction" data-c="fiction" style="right:${ZONE.clock.right}px;top:${ZONE.clock.top}px">${r.txt(item.ja??HUD_TEXT.fiction)}</div>`;
 r.fiction=true;return r;}

// tag: {ja, top?} — small corner chip (same look as the fiction tag), e.g. 「位置・構造は概略」 for approximate 3D sets;
// GameHUD.frame({tags:['…']}) stacks them top-right under the game clock.
function tag(item,env){const r=R('parody',env.lang);
 r.html=`<div class="gh-fiction gh-tag" data-c="tag" style="right:${ZONE.clock.right}px;top:${item.top??ZONE.clock.top}px">${r.txt(item)}</div>`;
 return r;}

// header: {title?, jr?, sub?, scrim?} — small logotype lockup (every frame except while the big 3D logo is up). scrim:true
//   (v6 QA) puts a soft dark plate behind the lockup for shots where big scene lettering passes behind the header.
function header(item,env){const r=R('header',env.lang),st=enterStyle(item.anim??'fade',item.t??9,0,{exitOn:false});
 r.html=`<div class="gh-head${item.scrim?' scrim':''}" data-c="header" style="left:${ZONE.header.left}px;top:${ZONE.header.top}px;${st.style}"><div class="l1">${icon('pumpkin')}<span>${r.txt(item.title??HUD_TEXT.title)}</span></div><div class="l2"><span class="gh-jr">${r.txt(item.jr??HUD_TEXT.jr)}</span><span class="sub">${r.txt(item.sub??HUD_TEXT.sub)}</span></div></div>`;
 r.header=true;return r;}

// clock: {time:'22:14'} | {start:'22:10', rate:min-per-s, (uses env.T)} , label?, progress? (0..1 bar) — parody game clock
export function clockText(item,T){if(item.time)return String(item.time);const [h,m]=String(item.start||'22:00').split(':').map(Number);const tot=h*60+m+Math.floor((item.rate??1)*(T-(item.t0??0)));return `${String(Math.floor(tot/60)%24).padStart(2,'0')}:${String(((tot%60)+60)%60).padStart(2,'0')}`;}
function clock(item,env){const r=R('clock',env.lang),T=env.T??0,tm=clockText(item,T),[hh,mm]=tm.split(':');
 r.strings.push(tm);const colon=Math.floor(T*2)%2?.35:1;
 const lab=item.label??HUD_TEXT.clockLabel;r.strings.push(lab);
 r.html=`<div class="gh-sh gh-clock" data-c="clock" style="right:${ZONE.clock.right}px;top:${ZONE.clock.top}px;position:absolute"><div class="gh-panel"><div class="in">${icon('clock')}<div class="lab"><b>GAME TIME</b><i>${html(lab)}</i></div><div class="tm num" style="--colon:${colon}">${esc(hh)}<span class="c">:</span>${esc(mm)}</div>${item.progress!=null?`<div class="bar"><i style="width:${f3(clamp(item.progress)*100)}%"></i></div>`:''}</div></div></div>`;
 return r;}

// mission: {ja, label?='MISSION', factIds} — objective band under the header (glitch-in)
function mission(item,env){if(item.card)return missionCard(item,env);const r=R('top',env.lang),st=enterStyle(item.anim??'glitch',item.t??0,item.dur??0,{seed:3});
 r.html=panel('gh-mission'+(st.glitch?' gh-glitch':''),`<div class="ic">${icon('target')}</div><div><div>${tab(item.label??'MISSION',{jp:item.labelJa??'ミッション'})}</div><div class="tx">${r.txt(item)}</div></div>`,{style:st.style,attrs:'data-c="mission"'});
 return r;}

// caption: {ja, tone?:'main'|'sub'|'note'|'warn', speaker?, icon?, factIds} — subtitle band (lower third)
function caption(item,env){const r=R('low',env.lang),tone=item.tone??'main',st=enterStyle(item.anim??'slide-l',item.t??0,item.dur??0);
 const ic=item.icon??(tone==='warn'?'warn':'');
 r.html=panel(`gh-cap ${tone==='main'?'':tone}`,`<span class="bar"></span>${ic?`<span class="ic">${icon(ic)}</span>`:''}<div class="tx">${item.speaker?`<span class="spk">${esc(item.speaker)}</span>`:''}${r.txt(item)}</div>`,{style:st.style,brackets:false,attrs:'data-c="caption"'});
 if(SIM_RE.test(r.strings.at(-1)||''))r.sims.push({text:r.strings.at(-1),label:true});
 return r;}

// direction: {ja, sub?, dir:'left'|'right'|'up'|'down'|'upleft'|'upright'|'back'|deg, factIds} — landmark direction chip
const DIRS={right:0,downright:45,down:90,downleft:135,left:180,upleft:-135,up:-90,upright:-45,back:90};
function direction(item,env){const r=R('low',env.lang),st=enterStyle(item.anim??'slide-l',item.t??0,item.dur??0),t=item.t??0;
 const deg=typeof item.dir==='number'?item.dir:(DIRS[item.dir]??-90),nudge=3*Math.sin(t*2*Math.PI*1.2);
 const rad=deg*Math.PI/180;
 r.html=panel('gh-dir',`<div class="ar"><div style="transform:translate(${f3(Math.cos(rad)*nudge)}px,${f3(Math.sin(rad)*nudge)}px) rotate(${deg}deg)">${icon('arrow')}</div></div><div class="tx">${r.txt(item)}${item.sub?`<small>${r.txt(item.sub)}</small>`:''}</div>`,{style:st.style,brackets:false,attrs:'data-c="direction"'});
 return r;}

// sim: {ja, factIds} — simulation chip; ja MUST contain 「シミュレーション」 (record sims[].label=false otherwise)
function sim(item,env){const r=R('chips',env.lang),st=enterStyle(item.anim??'slide-l',item.t??0,item.dur??0,{enter:.24});
 const s=L(item,env.lang);r.html=`<div class="gh-sim" data-c="sim" style="${st.style}"><span class="k">${icon('sim')}SIM</span><span class="v">${r.txt(item)}</span></div>`;
 r.sims.push({text:s,label:SIM_RE.test(s)});return r;}

// footnote: {ja} — 出典 line (GameHUD also accepts state.footnote); prefix 「出典：」 shown as a small tag
// plate:true → dark backing plate (page: shots over a bright street row, e.g. the kaiju gag; QA 2026-10-26)
function footnote(item,env){const r=R('foot',env.lang);let s=L(item,env.lang);r.strings.push(s);const m=/^(出典|Sources?)[：:]\s*/.exec(s);if(m)s=s.slice(m[0].length);
 r.html=`<div class="gh-foot${item.plate?' pl':''}" data-c="footnote" style="left:${ZONE.foot.left}px;right:${ZONE.foot.right}px;bottom:${ZONE.foot.bottom}px;max-height:${ZONE.foot.maxH}px"><b>${env.lang==='en'?'SOURCES':'出典'}</b>${html(s)}</div>`;r.ids(item.factIds);return r;}

// choice: {prompt?, options?:[{key,ja,sub?}], picked?, pickAt?, label?} (defaults: env.config.choice); t,dur
function choice(item,env){if(item.card)return choiceCard(item,env);const r=R('center',env.lang),C=env.config?.choice||{},t=item.t??0,dur=item.dur??4;
 const prompt=item.prompt??C.prompt,opts=item.options??C.options??[],picked=item.picked??C.picked??opts[0]?.key,pickAt=item.pickAt??Math.max(1.2,dur-1.0);
 const pi=Math.max(0,opts.findIndex(o=>o.key===picked));
 const q=enterStyle('glitch',t,dur,{seed:11});
 // cursor hops: 0 → other → picked (deterministic), each hop eased
 const c0=.5,hops=[[c0,0],[c0+(pickAt-c0)*.38,opts.length>1?1:0],[c0+(pickAt-c0)*.72,pi]];
 let cy=0;for(let i=0;i<hops.length;i++){const [at,idx]=hops[i],prev=i?hops[i-1][1]:idx;if(t>=at)cy=mix(prev,idx,EASE.outBack(seg(t,at,at+MOTION.cursorMove)));}
 const hot=Math.round(cy),done=t>=pickAt,pk=seg(t,pickAt,pickAt+.32),pulse=done?1+.06*Math.sin(Math.PI*pk):1;
 const OPT_H=88,GAP=14,cursorA=seg(t,c0-.15,c0)*(1-life(t,dur).kout);
 const remain=Math.max(0,pickAt-t),ringK=clamp(remain/Math.max(.1,pickAt-.2));
 const circ=2*Math.PI*26;
 const ring=`<div class="ring"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="rgba(0,0,0,.35)" stroke="rgba(255,255,255,.15)" stroke-width="6"/><circle cx="32" cy="32" r="26" fill="none" stroke="${done?COLOR.candle:COLOR.pumpkin}" stroke-width="6" stroke-linecap="butt" stroke-dasharray="${f3(circ)}" stroke-dashoffset="${f3(circ*(1-ringK))}" transform="rotate(-90 32 32)"/></svg><b class="num">${done?'!':Math.ceil(remain)}</b></div>`;
 const ops=opts.map((o,i)=>{const cls=done?(i===pi?'pick hot':'dim'):(i===hot&&t>=c0?'hot':'');const sc=done&&i===pi?pulse:1;
  return `<div class="gh-sh gh-opt ${cls}" style="${rowIn(t,i,.22)};${sc!==1?`transform:scale(${f3(sc)});`:''}"><div class="gh-panel"><div class="in"><div class="key">${esc(o.key)}</div><div class="tx">${r.txt(o)}${o.sub?`<small>${r.txt(o.sub)}</small>`:''}</div>${done&&i===pi?`<span class="ok">${esc(env.lang==='en'?'SELECT':HUD_TEXT.pick)}</span>`:''}</div></div></div>`;}).join('');
 const bob=3*Math.sin(t*2*Math.PI*2.2)*(done?0:1);
 r.html=`<div class="gh-choice" data-c="choice"><div class="q gh-sh${q.glitch?' gh-glitch':''}" style="${q.style}"><div class="gh-panel"><div class="in"><div style="flex:1">${tab(item.label??'CHOICE',{jp:item.labelJa??'どっちを選ぶ？'})}<div class="qt">${r.txt(prompt)}</div></div>${ring}<i class="gh-br tr"></i><i class="gh-br bl"></i></div></div></div><div class="opts" style="opacity:${f3(1-life(t,dur).kout)}"><div class="gh-cursor" style="top:${f3(cy*(OPT_H+GAP)+OPT_H/2-20)}px;opacity:${f3(cursorA)};transform:translateX(${f3(bob)}px)">${icon('cursor')}</div>${ops}</div></div>`;
 r.choice={hot:done?pi:hot,picked:done?picked:null,pickAt};return r;}

// stamp: {kind:'GAME_OVER'|'GAME_CLEAR'|'ESCAPED', ja?(sub line), sub?, word?, w2?, factIds} — slam with ink spread
//   onBlack:true (combined episodes: the stamp after the caught sequence's hard cut to black) → no backdrop tint; instead a
//   cold slate glow + CRT scanlines + faint per-frame static on the black, slate impact flash, a taller wrap, and an optional
//   safety:{ja,factIds}|'…' line (the real lesson, e.g. 「混雑の中で立ち止まると危険」) under the sub line from ≈0.8 s.
//   Without onBlack the output is byte-identical to the variant renders (reused frames must match).
function inkBlots(k){let s='';const n=30,cx=320,cy=160;// small splatter flecks thrown off the plate edge at impact
 for(let i=0;i<n;i++){const a=hash(i,41)*Math.PI*2,d=.98+.3*hash(i,47)*k;const x=cx+Math.cos(a)*272*d,y=cy+Math.sin(a)*118*d;
  const rad=(1.2+4.2*hash(i,59)*hash(i,61))*clamp(k*1.4);s+=`<circle cx="${f3(x)}" cy="${f3(y)}" r="${f3(rad)}"/>`;}
 return s;}
function stamp(item,env){const r=R('center',env.lang),K=STAMP_KIND[item.kind]||STAMP_KIND.GAME_OVER,t=item.t??0,dur=item.dur??0;
 const D=MOTION.stampDrop,k=EASE.inCubic(seg(t,0,D)),hit=t>=D,spread=EASE.outExpo(seg(t,D,D+MOTION.stampSpread));
 const sc=hit?1+.05*Math.exp(-(t-D)*14)*Math.cos((t-D)*40):mix(2.7,1,k),rot=hit?-7:mix(-16,-7,k);
 const shake=hit?Math.exp(-(t-D)*9):0,sx=(hash(Math.floor(t*30),5)-.5)*18*shake,sy=(hash(Math.floor(t*30),9)-.5)*14*shake;
 const out=life(t,dur,{exit:.3}).kout,op=(hit?1:clamp(k*1.6))*(1-out);
 const shockK=seg(t,D,D+.45),flash=hit?clamp(1-(t-D)/.12)*.32:0;
 const subK=EASE.outCubic(seg(t,.55,.9));
 r.strings.push(K.word);r.stamps.push(STAMP_ID[K.cls]);
 const sub=item.ja||item.sub?panel(`gh-stampsub ${K.cls==='over'?'':K.cls}`,`${r.txt(item)}${item.sub?`<small>${r.txt(item.sub)}</small>`:''}`,{style:`opacity:${f3(subK*(1-out))};transform:translateY(${f3((1-subK)*24)}px)`,brackets:false}):'';
 // v6 TRUE END extras (only when given): kicker ribbon above the sub line, small EN line under it
 const sub2=item.kicker||item.en?panel(`gh-stampsub ${K.cls==='over'?'':K.cls} x2`,`${item.kicker?`<div class="kk">${r.txt(item.kicker)}</div>`:''}${item.ja?`<div class="jl">${r.txt(item)}</div>`:''}${item.sub?`<small>${r.txt(item.sub)}</small>`:''}${item.en?`<div class="en">${r.txt(item.en)}</div>`:''}`,{style:`opacity:${f3(subK*(1-out))};transform:translateY(${f3((1-subK)*24)}px)`,brackets:false}):'';
 if(item.ja&&SIM_RE.test(L(item,env.lang)))r.sims.push({text:L(item,env.lang),label:true});
 if(item.onBlack){// black-frame mood: glow + scanlines + static (deterministic per frame) instead of the backdrop tint
  const gk=EASE.outCubic(seg(t,D*.5,D+.5))*(1-out),st=.05+.05*hash(Math.floor(t*MOTION.fps),71)+.25*(hit?Math.exp(-(t-D)*10):0);
  r.fx=`<div class="gh-tint ob ${K.tint}" style="opacity:${f3(gk)}"></div><div class="gh-static" style="opacity:${f3(st*(1-out))};background-position:${Math.floor(hash(Math.floor(t*MOTION.fps),73)*128)}px ${Math.floor(hash(Math.floor(t*MOTION.fps),79)*128)}px"></div>${flash>0?`<div class="gh-flash" style="opacity:${f3(flash*.8)};background:${K.cls==='over'?COLOR.over:K.cls==='clear'?'#D8FFE9':'#FFE6C2'}"></div>`:''}`;}
 else r.fx=`<div class="gh-tint ${K.tint}" style="opacity:${f3(EASE.outCubic(seg(t,D*.5,D+.4))*(1-out))}"></div>${flash>0?`<div class="gh-flash" style="opacity:${f3(flash)};background:${K.cls==='over'?COLOR.overInk:K.cls==='clear'?'#D8FFE9':'#FFE6C2'}"></div>`:''}`;
 if(K.cls==='true')r.fx+=trueFx(t,D,out);
 let safety='';if(item.onBlack&&item.safety){const S=typeof item.safety==='string'?{ja:item.safety}:item.safety,sk=EASE.outCubic(seg(t,item.safetyAt??.8,(item.safetyAt??.8)+.3));
  // below the stamp text: hud.css top 478 fits a 2-line text; each further line (\n) pushes it down one line (32 px) so a
  // 3-line text's 「（シミュレーション）」 line is never covered (fixer 2026-10-26: gate's over-stamp lost it)
  const extra=Math.max(0,(item.ja||'').split('\n').length-2)*32;
  safety=`<div class="gh-sh gh-safety" data-c="stamp-safety" style="${extra?`top:${478+extra}px;`:''}opacity:${f3(sk*(1-out))};transform:translateY(${f3((1-sk)*18)}px)"><div class="gh-panel"><div class="in"><span class="ic">${icon('info')}</span><span class="tx">${r.txt(S)}</span></div></div></div>`;}
 r.html=`<div class="gh-stampwrap${item.onBlack?' ob':''}" data-c="stamp" style="transform:translate(${f3(sx)}px,${f3(sy)}px)">${hit&&shockK<1?`<div class="gh-shock" style="--sc:${inkOf(K)};opacity:${f3((1-shockK)*.8)};transform:scale(${f3(mix(.5,1.7,EASE.outCubic(shockK)))})"></div>`:''}<div class="gh-stamp ${K.cls}" style="opacity:${f3(op)};transform:translateX(-50%) rotate(${f3(rot)}deg) scale(${f3(sc)})"><svg class="ink" viewBox="0 0 640 320" style="opacity:${f3(.8*spread)}"><g fill="${inkOf(K)}">${hit?inkBlots(spread):''}</g></svg><div class="plate" style="box-shadow:0 0 ${f3(2+22*spread)}px ${f3(6*spread)}px color-mix(in srgb,var(--sc) ${Math.round(28*(1-.6*spread))}%,transparent),inset 0 0 ${f3(10+30*spread)}px color-mix(in srgb,var(--sc) 30%,transparent)"><div class="w" style="--fs:${Math.round(Math.min(84,500/((item.word??K.word).length*.86)))}px">${esc(item.word??K.word)}</div><div class="w2">${esc(item.w2??K.w2)}</div></div></div>${sub2||sub}${safety}</div>`;
 return r;}
// TRUE END backdrop: warm gold glow, slowly turning light rays, twinkling sparkles around the plate (deterministic)
function trueFx(t,D,out){const gk=EASE.outCubic(seg(t,D*.5,D+.5))*(1-out);let sp='';
 for(let i=0;i<18;i++){const a=hash(i,131)*Math.PI*2,rx=200+130*hash(i,137),ry=120+150*hash(i,139),x=360+Math.cos(a)*rx,y=650+Math.sin(a)*ry;
  const tw=clamp(.5+.5*Math.sin(2*Math.PI*(.7+.6*hash(i,149))*t+hash(i,151)*6.28)),k=seg(t,D+.04*i,D+.04*i+.3),sz=8+14*hash(i,157);
  sp+=`<i style="left:${f3(x-sz/2)}px;top:${f3(y-sz/2)}px;width:${f3(sz)}px;height:${f3(sz)}px;opacity:${f3(k*tw*(1-out))};transform:rotate(${f3(t*40*(hash(i,163)-.5))}deg)"></i>`;}
 return `<div class="gh-tint true" style="opacity:${f3(gk)}"></div><div class="gh-rays" style="opacity:${f3(gk*.9)};background:repeating-conic-gradient(from ${f3(t*9)}deg at 50% 51%,rgba(255,211,90,.17) 0deg 5deg,transparent 5deg 15deg)"></div><div class="gh-spk">${sp}</div>`;}

// lesson: {title?, ja (body; lines after the first become points), points?, head?, factIds} (defaults env.config.lesson)
function lesson(item,env){const r=R('center',env.lang),src={...(env.config?.lesson||{}),...item},t=item.t??0,dur=item.dur??0;
 const st=enterStyle('scale',t,dur);const body=L(src,env.lang).split('\n').filter(Boolean);
 const title=src.title?(typeof src.title==='string'?src.title:L(src.title,env.lang)):body.shift();const pts=src.points??body;r.ids(src.factIds);
 r.html=panel('gh-card gh-lesson',`${tab(src.head??HUD_TEXT.lessonTab,{jp:src.headJa??HUD_TEXT.lessonTabJa})}<div class="lt">${icon('bulb')}<div class="h">${r.txt(title)}</div></div>${pts.length?`<ul class="pts">${pts.map((p,i)=>`<li style="${rowIn(t,i,.3)}">${r.txt(p)}</li>`).join('')}</ul>`:''}${src.note?`<div class="sm">${r.txt(src.note)}</div>`:''}`,{style:st.style,attrs:'data-c="lesson"'});
 return r;}

// rules: {head, items:[{title, tip, factIds}]} — opening rules card (real safety tips)
function rules(item,env){const r=R('center',env.lang),t=item.t??0,st=enterStyle('glitch',t,item.dur??0,{seed:17});
 r.html=panel('gh-card gh-rules'+(st.glitch?' gh-glitch':''),`${tab(item.label??'RULES',{jp:item.labelJa??'ルール'})}<div class="h">${r.txt(item.head??'ゲームのルール＝本物の注意')}</div>${(item.items||[]).map((it,i)=>`<div class="r" style="${rowIn(t,i,.25)}"><div class="n num">${i+1}</div><div><div class="rt">${r.txt(it.title??it)}</div>${it.tip?`<div class="rd">${r.txt(it.tip)}</div>`:''}</div></div>`).join('')}`,{style:st.style,attrs:'data-c="rules"'});
 for(const it of item.items||[])r.ids(it.factIds);return r;}

// notice: {issuer?, head, ja (body), order?, foot?} — fictional game-operator notice ※パロディ (never alert-styled)
function notice(item,env){const r=R('center',env.lang),t=item.t??0,st=enterStyle('scale',t,item.dur??0);
 r.html=panel('gh-card gh-notice',`<div class="is">${r.txt(item.issuer??HUD_TEXT.noticeIssuer)}</div><div class="hd">${r.txt(item.head??'運営からのお知らせ')}</div>${item.when?`<div class="b" style="color:var(--gh-textDim)">${r.txt(item.when)}</div>`:''}<div class="bd" style="${rowIn(t,0,.25,'y')}">${r.txt(item)}</div>${item.order?`<div class="bd" style="color:var(--gh-pumpkinHi);${rowIn(t,1,.35,'y')}">${r.txt(item.order)}</div>`:''}${(item.foot??HUD_TEXT.noticeFoot)?`<div class="ft">${r.txt(item.foot??HUD_TEXT.noticeFoot)}</div>`:''}`,{style:st.style,attrs:'data-c="notice"'});
 r.notice=true;return r;}

// press-start: {ja?=PRESS START, sub?, go?, y?=820} — original start-screen beat (blinks deterministically)
function pressStart(item,env){const r=R('press',env.lang),t=item.t??0,dur=item.dur??0;
 const a=life(t,dur,{enter:.4}).alpha,blink=.45+.55*(.5+.5*Math.cos(2*Math.PI*t/MOTION.blink)),gk=EASE.outCubic(seg(t,.5,.8));
 r.html=`<div class="gh-press" data-c="press-start" style="top:${item.y??820}px;opacity:${f3(a)}"><div class="band"></div><div class="ps" style="opacity:${f3(blink)}">${r.txt(item.ja??HUD_TEXT.press)}</div><div class="sub"><i></i>${r.txt(item.sub??HUD_TEXT.pressSub)}<i class="r"></i></div><br><div class="go" style="opacity:${f3(gk)};transform:scale(${f3(mix(.9,1,gk))})">${icon('play')}${r.txt(item.go??HUD_TEXT.pressGo)}</div></div>`;
 return r;}

// sources: {head?, rows?:[{label, date?, url?}]} (defaults env.sources = resolved rows of config.sources)
//   compact:true (combined episodes: the over+clear union, ~6–14 resolved rows) → rows with the same label merge into one
//   (dates listed newest first, fact ids merged), no URL lines, 2 columns from 7 merged rows, tighter type; adds the data
//   credit line credit?:'…' (default HUD_TEXT.credit 「出典：国土交通省 PLATEAU…」; credit:false hides it). The
//   parody/fiction note always stays (the recorder asserts it). compact is opt-in: the variant cards render unchanged.
export function mergeSourceRows(rows){const out=[];
 for(const s of rows||[]){const label=s.label??s.ja??'';let m=out.find(o=>o.label===label);if(!m){m={label,dates:[],factIds:[],url:s.url};out.push(m);}
  if(s.date&&!m.dates.includes(s.date))m.dates.push(s.date);for(const id of s.factIds||(s.id?[s.id]:[]))if(!m.factIds.includes(id))m.factIds.push(id);}
 for(const m of out){m.dates.sort().reverse();m.date=m.dates.length>3?`${m.dates.slice(0,3).join('・')} ほか`:m.dates.join('・');}
 return out;}
function sourcesCompact(item,env){const r=R('center',env.lang),t=item.t??0,raw=item.rows??env.sources??[],rows=mergeSourceRows(raw),st=enterStyle('slide-up',t,item.dur??0);
 const cols=item.cols??(rows.length>6?2:1),credit=item.credit===false?'':(item.credit??HUD_TEXT.credit);
 const dense=item.dense??rows.length>12;// v6: the larger union (+ end-card city/MPD sources) → tighter rows, dates inline
 r.html=panel('gh-card gh-sources cmp'+(dense?' dn':''),`${tab('SOURCES',{jp:item.headJa??''})}<div class="h">${r.txt(item.head??HUD_TEXT.sourcesHead)}</div><ol style="--cols:${cols}">${rows.map((s,i)=>{if(s.label)r.strings.push(s.label);return `<li style="${rowIn(t,i*.5,.2,'y')}">${html(s.label)}${s.date?`<span class="d">${esc(s.date)}</span>`:''}</li>`;}).join('')}</ol>${credit?`<div class="cr">${r.txt(credit)}</div>`:''}${item.note?`<div class="sm">${r.txt(item.note)}</div>`:''}${item.parodyNote===false?'':`<div class="sm pn">${r.txt(item.parodyNote??HUD_TEXT.sourcesNote)}</div>`}`,{style:st.style,attrs:'data-c="sources"'});
 r.parodyNote=item.parodyNote!==false;r.credit=!!credit;
 r.ids(item.factIds);for(const s of rows)r.ids(s.factIds);return r;}
function sources(item,env){if(item.compact)return sourcesCompact(item,env);
 const r=R('center',env.lang),t=item.t??0,rows=item.rows??env.sources??[],st=enterStyle('slide-up',t,item.dur??0);
 const cols=item.cols??(rows.length>7?2:1);
 r.html=panel('gh-card gh-sources',`${tab('SOURCES',{jp:item.headJa??''})}<div class="h">${r.txt(item.head??HUD_TEXT.sourcesHead)}</div><ol style="--cols:${cols}">${rows.map((s,i)=>{const host=s.url?String(s.url).replace(/^https?:\/\//,'').replace(/\/$/,''):'';if(s.label)r.strings.push(s.label);return `<li style="${rowIn(t,i*.5,.2,'y')}">${html(s.label??s.ja??'')}${s.date?`<span class="d">${esc(s.date)}</span>`:''}${host&&cols===1?`<span class="u">${esc(host.length>64?host.slice(0,62)+'…':host)}</span>`:''}</li>`;}).join('')}</ol>${item.note?`<div class="sm">${r.txt(item.note)}</div>`:''}${item.parodyNote===false?'':`<div class="sm pn">${r.txt(item.parodyNote??HUD_TEXT.sourcesNote)}</div>`}`,{style:st.style,attrs:'data-c="sources"'});
 r.parodyNote=item.parodyNote!==false;
 r.ids(item.factIds);for(const s of rows)r.ids(s.factIds||(s.id?[s.id]:[]));return r;}

// cheat: {title?, sub?, asOf?, rows:[{ja, sub?, icon?, tone?:'ok'|'ng', sec?, factIds}], note?, foot?} (defaults env.config.cheat)
// Bright paper card meant to be screenshotted: carries its own ※パロディ mark, as-of date and caveat line.
function cheat(item,env){const r=R('center',env.lang),src={...(env.config?.cheat||{}),...item},t=item.t??0,dur=item.dur??0,st=enterStyle('scale',t,dur);
 let sec=null;const rows=(src.rows||[]).map((row,i)=>{let h='';if(row.sec&&row.sec!==sec){sec=row.sec;h=`<div class="sec" style="${rowIn(t,i,.25)}">${r.txt(row.sec)}</div>`;}
  const ic=row.icon??(row.tone==='ng'?'ng':row.tone==='ok'?'ok':'pin');
  return h+`<div class="row ${row.tone||''}" style="${rowIn(t,i,.25)}${row.color?`;--rc:${row.color}`:''}"><div class="ri">${icon(ic)}</div><div class="rt">${r.txt(row)}${row.sub?`<small>${r.txt(row.sub)}</small>`:''}</div></div>`;}).join('');
 const vf=clamp(seg(t,.6,.8))*(.6+.4*Math.cos(2*Math.PI*(t-.6)/1.6));// viewfinder corners invite a screenshot
 r.html=`<div class="gh-cheat" data-c="cheat" style="${st.style}"><div class="pp"><div class="top">${icon('pin')}<div class="tt">${r.txt(src.title??HUD_TEXT.cheatTitle)}${src.sub?`<small>${r.txt(src.sub)}</small>`:''}</div></div><div class="snap">${icon('camera')}${r.txt(src.snap??HUD_TEXT.cheatSnap)}${src.asOf?`<span class="asof">${r.txt(src.asOf)}</span>`:''}</div>${rows}<div class="ft">${src.note?`<b>${r.txt(src.note)}</b><br>`:''}${r.txt(src.foot??HUD_TEXT.cheatFoot)}</div></div><i class="crn a" style="--vf:${f3(vf)}"></i><i class="crn b" style="--vf:${f3(vf)}"></i><i class="crn c" style="--vf:${f3(vf)}"></i><i class="crn d" style="--vf:${f3(vf)}"></i></div>`;
 r.cheat=true;return r;}

// pin: {x, y, ja, color?, big?} — projected landmark label (screen px), clamped inside the safe area
function pin(item,env){const r=R('pins',env.lang),x=Math.round(clamp(item.x,SAFE.left+30,SAFE.W-SAFE.right-30)),y=Math.round(clamp(item.y,SAFE.top+170,SAFE.H-SAFE.bottom-10));
 const a=life(item.t??1,item.dur??0,{enter:.25}).alpha,c=item.color??COLOR.pumpkin;
 r.html=`<div class="gh-pin" data-c="pin" style="left:${x}px;top:${y}px;--c:${c};opacity:${f3(a)}">${L(item,env.lang)?`<div class="gh-sh tx"><div class="gh-panel"><div class="in">${r.txt(item)}</div></div></div><div class="st"></div>`:''}<div class="dot"></div></div>`;
 r.label={x,y};return r;}

// legend: {rows:[{color, ja, factIds?}], head?} — map key for route maps (fixer 2026-10-26, QA: two unlabelled lines);
// top slot (under the header), slides in like a caption
function legend(item,env){const r=R('top',env.lang),st=enterStyle(item.anim??'slide-l',item.t??0,item.dur??0);
 const rows=(item.rows||[]).map(row=>`<div class="rw"><i style="--c:${row.color??COLOR.pumpkin}"></i><span>${r.txt(row)}</span></div>`).join('');
 r.html=panel('gh-legend',`<div class="hd">${r.txt(item.head??(env.lang==='en'?'MAP KEY':'凡例'))}</div>${rows}`,{style:st.style,attrs:'data-c="legend"'});return r;}

// ---------- combined episodes (GAME OVER → CONTINUE? → CLEAR → kaiju gag → end card), 2026-10-26 ----------
// continueTiming({dur=3, count=3, yesAt?}) → {t0, period, ticks:[s…], yesAt, hopAt, subAt, count} — the beat-local times of
// the countdown digits (count … 1), the cursor hop NO→YES and the YES press. Pure: the cue sheet (continue_tick at every
// tick, continue_yes at yesAt) and the component use the same numbers, so sound and picture can never drift apart.
export function continueTiming({dur=3,count=3,yesAt=null}={}){
 const n=Math.max(1,Math.round(count??3)),t0=.34,ya=yesAt??Math.max(t0+n*.3,dur-1.0),p=(ya-t0)/n;
 return {t0,period:p,ticks:Array.from({length:n},(_,i)=>+(t0+i*p).toFixed(3)),yesAt:+ya.toFixed(3),hopAt:+(ya-.36).toFixed(3),subAt:+(ya+.16).toFixed(3),count:n};}

// continue: {ja?='別のルートでやり直す', count?=3, yesAt?, word?='CONTINUE?', label?, t, dur(3)} — arcade retry screen:
//   letters of 「CONTINUE?」 drop in and pulse, a huge countdown digit (count…1) pops on every tick inside a draining
//   segment ring, the cursor sits on NO, hops to YES and presses it at yesAt (candle flash, NO dims), then the subline
//   (◀◀ 別のルートでやり直す) slides up. record: r.cont={digit, yes, yesAt, ticks}. No stamp wording (not a GAME OVER beat).
function cont(item,env){const r=R('center',env.lang),t=item.t??0,dur=item.dur??3,T=continueTiming({dur,count:item.count,yesAt:item.yesAt});
 const out=life(t,dur,{exit:.2}).kout,yes=t>=T.yesAt,word=item.word??HUD_TEXT.cont;r.strings.push(word);
 const pulse=yes?1:.55+.45*(.5+.5*Math.cos(2*Math.PI*(t-T.t0)/.56));
 const letters=[...word].map((ch,i)=>{const a=.02+i*.035,k=seg(t,a,a+.24),y=-70*(1-EASE.outBack(k)),sc=mix(1.9,1,EASE.outCubic(k)),wob=ch==='?'?7*Math.sin(2*Math.PI*1.5*t):0;
  return `<span style="opacity:${f3(clamp(k*3))};transform:translateY(${f3(y)}px) rotate(${f3(wob)}deg) scale(${f3(sc)})">${esc(ch)}</span>`;}).join('');
 // countdown digit
 const ti=Math.floor((t-T.t0)/T.period),digit=t<T.t0?T.count:Math.max(1,T.count-ti),tk=t<T.t0?0:t-(T.t0+Math.min(ti,T.count-1)*T.period);
 const dIn=seg(t,T.t0-.12,T.t0),dOut=EASE.inCubic(seg(t,T.yesAt,T.yesAt+.2)),dsc=(1+.38*Math.exp(-tk*9))*mix(1,.4,dOut)*mix(.6,1,EASE.outBack(dIn));
 const segs=T.count*4,left=yes?0:clamp(1-(t-T.t0)/(T.yesAt-T.t0)),lit=Math.ceil(left*segs-1e-9);
 const ring=Array.from({length:segs},(_,i)=>{const a0=-90+i*360/segs+2,a1=a0+360/segs-4,R0=96,R1=110,P=(a,rr)=>`${f3(120+Math.cos(a*Math.PI/180)*rr)},${f3(120+Math.sin(a*Math.PI/180)*rr)}`;
  return `<path d="M${P(a0,R0)}L${P(a0,R1)}L${P(a1,R1)}L${P(a1,R0)}Z" fill="${i<lit?(left<.34?COLOR.warn:COLOR.candle):'rgba(255,255,255,.12)'}"/>`;}).join('');
 // YES / NO with a hopping cursor (NO first → YES)
 const hk=EASE.outBack(seg(t,T.hopAt,T.hopAt+MOTION.cursorMove)),BX={yes:40,no:360},cx=mix(BX.no,BX.yes,hk)-50,ca=seg(t,T.t0-.1,T.t0)*(1-out);
 const pk=seg(t,T.yesAt,T.yesAt+.32),press=yes?1+.08*Math.sin(Math.PI*pk):1,hotYes=t>=T.hopAt+.1;
 const yesLab=item.yes??HUD_TEXT.yes,noLab=item.no??HUD_TEXT.no;r.strings.push(yesLab,noLab);
 const btn=(k,lab,x)=>{const cls=k==='yes'?(yes?'pick hot':hotYes?'hot':''):(yes?'dim':hotYes?'':'hot');const a=EASE.outCubic(seg(t,.3+(k==='no'?.06:0),.55+(k==='no'?.06:0)));
  return `<div class="gh-sh gh-cbtn ${cls}" style="left:${x}px;opacity:${f3(a)};transform:translateY(${f3((1-a)*16)}px) scale(${f3(k==='yes'?press:1)})"><div class="gh-panel"><div class="in">${esc(lab)}</div></div></div>`;};
 const sk=EASE.outCubic(seg(t,T.subAt,T.subAt+.28));
 const sub=L(item,env.lang)||HUD_TEXT.contSub;
 r.html=`<div class="gh-cont" data-c="continue" style="opacity:${f3(1-out)}"><div class="tb">${tab(item.label??HUD_TEXT.contTab,{jp:item.labelJa??'リトライ'})}</div><div class="cw" style="--pl:${f3(pulse)}">${letters}</div>`+
  `<div class="cd" style="opacity:${f3(dIn*(1-dOut))}"><svg viewBox="0 0 240 240">${ring}</svg><b class="num" style="transform:scale(${f3(dsc)})">${digit}</b></div>`+
  `<div class="yn">${btn('yes',yesLab,BX.yes)}${btn('no',noLab,BX.no)}<div class="gh-cursor" style="left:${f3(cx)}px;top:12px;opacity:${f3(ca)}">${icon('cursor')}</div></div>`+
  `<div class="cs gh-sh" style="opacity:${f3(sk)};transform:translateY(${f3((1-sk)*22)}px)"><div class="gh-panel"><div class="in"><span class="ic">${icon('rewind')}</span><span class="tx">${r.txt(item.ja?item:sub)}</span></div></div></div></div>`;
 const fl=yes?clamp(1-(t-T.yesAt)/.16)*.32:0;
 r.fx=`<div class="gh-tint cont" style="opacity:${f3(seg(t,0,.25)*(1-out))}"></div>${fl>0?`<div class="gh-flash" style="opacity:${f3(fl)};background:${COLOR.candle}"></div>`:''}`;
 r.cont={digit:yes?null:digit,yes,yesAt:T.yesAt,ticks:T.ticks};return r;}

// endcard: {ja (closing question, \n ok), sub?, credit?(false hides; default HUD_TEXT.credit), lockup?=true, tag?, factIds}
//   title lockup (pumpkin + 「ハロウィンの渋谷を脱出せよ！」 + JR編 badge, the header look at hero size) over an RPG dialogue
//   box: the question types on (layout fixed, chars revealed), a ▼ prompt blinks when done, sub line, small credit line.
//   Put {c:'logo'} + lockup:false if the 3D logotype is used instead. Use header:false on the beat (the lockup is the title).
function endcard(item,env){const r=R('center',env.lang),t=item.t??0,dur=item.dur??2.5,st=enterStyle('scale',t,dur);
 const q=L(item,env.lang),lines=q.split('\n'),maxLen=Math.max(1,...lines.map(l=>[...l].length)),fs=Math.round(Math.min(item.fs??52,520/maxLen));
 r.txt(item);const cps=item.cps??30,t0=item.t0??.1,total=[...q.replace(/\n/g,'')].length,shown=Math.floor(Math.max(0,t-t0)*cps),done=shown>=total;
 let k=0;const qh=lines.map(l=>[...l].map(ch=>`<span${k++<shown?'':' class="h"'}>${html(ch)}</span>`).join('')).join('<br>');
 const lk=EASE.outBack(seg(t,0,.34)),blink=done?(Math.floor((t-(t0+total/cps))/.28)%2?.25:1):0,sk=EASE.outCubic(seg(t,t0+total/cps,t0+total/cps+.3));
 const credit=item.credit===false?'':(item.credit??HUD_TEXT.credit);
 const lock=item.lockup===false?'':`<div class="lk" style="transform:scale(${f3(mix(.7,1,lk))});opacity:${f3(clamp(lk*2))}"><div class="l1">${icon('pumpkin')}<span>${r.txt(item.title??HUD_TEXT.title)}</span></div><div class="l2"><span class="gh-jr">${r.txt(item.jr??HUD_TEXT.jr)}</span><span class="tg">${esc(item.tag??HUD_TEXT.endTab)}</span></div></div>`;
 r.html=`<div class="gh-end" data-c="endcard" style="${st.style}">${lock}<div class="gh-sh dq"><div class="gh-panel"><div class="in">${tab(item.label??'QUESTION',{jp:item.labelJa??'さいごに'})}<div class="qt" style="font-size:${fs}px">${qh}</div>${item.sub?`<div class="sb" style="opacity:${f3(sk)}">${r.txt(item.sub)}</div>`:''}<i class="nx" style="opacity:${f3(blink)}"></i><i class="gh-br tr"></i><i class="gh-br bl"></i></div></div></div>${credit?`<div class="cr" style="opacity:${f3(EASE.outCubic(seg(t,.4,.8)))}">${r.txt(credit)}</div>`:''}</div>`;
 r.ids(item.factIds);r.endcard={typed:Math.min(shown,total),total,done};r.credit=!!credit;return r;}

// gag: {ja (big silly caption, \n ok), sub?, y?=800 (centre, CSS px), rot?=-6, fs?, factIds} — comic shout for the kaiju
//   beat: a spiky starburst (jittered, deterministic) slams in, every character hops in on its own and keeps bouncing,
//   the whole thing wobbles; optional small tilted sub band. Own slot (gag) above the cards, below the clock/header.
function gag(item,env){const r=R('gag',env.lang),t=item.t??0,dur=item.dur??0,a=life(t,dur,{enter:.18,exit:.2});
 const s=L(item,env.lang);r.txt(item);const lines=s.split('\n'),maxLen=Math.max(1,...lines.map(l=>[...l].length)),fs=Math.round(Math.min(item.fs??80,430/maxLen));
 const y=item.y??800,W=SAFE.W-SAFE.left-SAFE.right,H=Math.round(lines.length*fs*1.18+140);
 const bk=EASE.outBack(seg(t,0,.22)),shake=Math.exp(-t*7),f=Math.floor(t*MOTION.fps),jx=(hash(f,83)-.5)*16*shake,jy=(hash(f,89)-.5)*12*shake;
 const rot=(item.rot??-6)+2.2*Math.sin(2*Math.PI*1.3*t);
 let i=0;const txt=lines.map(l=>[...l].map(ch=>{const a0=.08+i*.045,k=seg(t,a0,a0+.22),sc=EASE.outBack(k),hop=k>=1?-Math.abs(Math.sin(2*Math.PI*1.6*t+i*.9))*fs*.08:0,rr=(hash(i,97)-.5)*14;i++;
  return `<span style="opacity:${f3(clamp(k*4))};transform:translateY(${f3(hop)}px) rotate(${f3(rr*(1.4-k*.6))}deg) scale(${f3(sc)})">${html(ch)}</span>`;}).join('')).map(l=>`<div class="ln">${l}</div>`).join('');
 const n=22,rx=W/2-6,ry=H/2;let pts='';for(let j=0;j<n*2;j++){const ang=j/(n*2)*Math.PI*2,out=j%2===0?1:.8-.08*hash(j,101),wob=1+.03*Math.sin(2*Math.PI*.9*t+j);pts+=`${f3(W/2+Math.cos(ang)*rx*out*wob)},${f3(H/2+Math.sin(ang)*ry*out*wob)} `;}
 const sk=EASE.outBack(seg(t,.45,.7));
 r.html=`<div class="gh-gag" data-c="gag" style="left:${SAFE.left}px;width:${W}px;top:${y-H/2}px;height:${H}px;opacity:${f3(a.alpha)}"><div class="gw" style="transform:translate(${f3(jx)}px,${f3(jy)}px) rotate(${f3(rot)}deg) scale(${f3(mix(.3,1,bk))})"><svg class="bu" viewBox="0 0 ${W} ${H}" style="width:${W}px;height:${H}px"><polygon points="${pts.trim()}" fill="${item.burst??COLOR.candle}" stroke="#1A0838" stroke-width="7" stroke-linejoin="round"/><polygon points="${pts.trim()}" fill="none" stroke="${COLOR.pumpkin}" stroke-width="3" transform="translate(${W*.04} ${H*.04}) scale(.92)"/></svg><div class="gt" style="font-size:${fs}px">${txt}</div></div>${item.sub?`<div class="gs" style="opacity:${f3(clamp(sk))};transform:translateX(-50%) rotate(${f3(-(item.rot??-6)*.6)}deg) scale(${f3(sk)})">${r.txt(item.sub)}</div>`:''}</div>`;
 r.gag=true;return r;}

// ---------- v6 「渋谷Halloweenには近づくな」 (2026-10-27): mission card, first-choice card, guide card, GOODBYE end card ----------
// split a JA line for display only (line breaks are the only allowed change): after 「、」 when the line is long
const brk=(s,max=16)=>s.split('\n').flatMap(l=>[...l].length>max&&l.includes('、')?l.replace(/、(?!$)/,'、\n').split('\n'):[l]);
const fitFs=(line,base,avail)=>Math.round(Math.min(base,avail/Math.max(1,[...line].length)));

// mission card: {card:true, ja (2 lines, \n), en?, issuer?, label?, labelJa?, fiction?:false, factIds} — opening mission beat.
//   Centre card: fictional issuer line, MISSION tab, JA line 1 hero size, line 2 (auto-wrapped after 「、」) a bit smaller,
//   a rule, EN translation small. GameHUD adds the 「フィクション」 tag while it is up (it replaces the fictional notice).
function missionCard(item,env){const r=R('center',env.lang),t=item.t??0,dur=item.dur??0,st=enterStyle('scale',t,dur,{enter:.34});
 const s=L(item,env.lang);r.strings.push(s);r.ids(item.factIds);const [l1,...rest]=s.split('\n');
 const l2=brk(rest.join('\n'),13),fs1=fitFs(l1,44,548),fs2=Math.min(fs1-4,...l2.map(l=>fitFs(l,38,548)));
 const issuer=item.issuer??HUD_TEXT.missionIssuer,en=item.en&&env.lang!=='en'?item.en:'';
 const lk=EASE.outCubic(seg(t,.25,.55)),ek=EASE.outCubic(seg(t,.5,.85));
 r.html=panel('gh-card gh-mcard',`<div class="is">${r.txt(issuer)}</div>${tab(item.label??'MISSION',{jp:item.labelJa??'ミッション'})}`+
  `<div class="m1" style="font-size:${fs1}px">${html(l1)}</div><div class="m2" style="font-size:${fs2}px;opacity:${f3(lk)};transform:translateY(${f3((1-lk)*12)}px)">${l2.map(html).join('<br>')}</div>`+
  `${en?`<div class="rule"></div><div class="en" style="opacity:${f3(ek)}">${r.txt(en)}</div>`:''}`,{style:st.style,attrs:'data-c="mission"'});
 r.fx=`<div class="gh-tint card" style="opacity:${f3(life(t,dur,{enter:.2}).alpha)}"></div>`;
 r.missionCard={lines:[l1,...l2],en:!!en};return r;}

// choiceTiming({dur, pickAt?}) → cursor hop times (s, beat-local) + pick time; same numbers as choice/choiceCard (sound cues)
export function choiceTiming({dur=4,pickAt=null}={}){const pa=pickAt??Math.max(1.2,dur-1.0),c0=.5;
 return {hops:[c0,c0+(pa-c0)*.38,c0+(pa-c0)*.72].map(x=>+x.toFixed(3)),pickAt:+pa.toFixed(3)};}

// choice card (card:true): {prompt, en?, options:[{key, ja, sub?}], picked, pickAt?, ring?:false, label?, labelJa?} — the
//   first choice without a map: big prompt card, tall option cards with sub lines, cursor hops 0 → 1 → picked, picked gets
//   決定 + glow, the other dims. Own dark tint (card-bg). record r.choice={hot, picked, pickAt}.
function choiceCard(item,env){const r=R('center',env.lang),C=env.config?.choice||{},t=item.t??0,dur=item.dur??4.5;
 const prompt=item.prompt??C.prompt,opts=item.options??C.options??[],picked=item.picked??C.picked??opts[0]?.key,T=choiceTiming({dur,pickAt:item.pickAt}),pickAt=T.pickAt;
 const pi=Math.max(0,opts.findIndex(o=>o.key===picked)),q=enterStyle('scale',t,dur,{enter:.3}),kout=life(t,dur).kout;
 const hops=[[T.hops[0],0],[T.hops[1],opts.length>1?1:0],[T.hops[2],pi]];
 let cy=0;for(let i=0;i<hops.length;i++){const [at,idx]=hops[i],prev=i?hops[i-1][1]:idx;if(t>=at)cy=mix(prev,idx,EASE.outBack(seg(t,at,at+MOTION.cursorMove)));}
 const hot=Math.round(cy),done=t>=pickAt,pk=seg(t,pickAt,pickAt+.32),pulse=done?1+.05*Math.sin(Math.PI*pk):1;
 const OPT_H=126,GAP=18,cursorA=seg(t,T.hops[0]-.15,T.hops[0])*(1-kout),bob=3*Math.sin(t*2*Math.PI*2.2)*(done?0:1);
 let ring='';if(item.ring){const remain=Math.max(0,pickAt-t),ringK=clamp(remain/Math.max(.1,pickAt-.2)),circ=2*Math.PI*26;
  ring=`<div class="ring"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="rgba(0,0,0,.35)" stroke="rgba(255,255,255,.15)" stroke-width="6"/><circle cx="32" cy="32" r="26" fill="none" stroke="${done?COLOR.candle:COLOR.pumpkin}" stroke-width="6" stroke-dasharray="${f3(circ)}" stroke-dashoffset="${f3(circ*(1-ringK))}" transform="rotate(-90 32 32)"/></svg><b class="num">${done?'!':Math.ceil(remain)}</b></div>`;}
 const P=typeof prompt==='string'?{ja:prompt}:(prompt||{}),en=item.en??P.en;
 const ops=opts.map((o,i)=>{const cls=done?(i===pi?'pick hot':'dim'):(i===hot&&t>=T.hops[0]?'hot':'');const sc=done&&i===pi?pulse:1;
  return `<div class="gh-sh gh-opt big ${cls}" style="${rowIn(t,i,.3)};${sc!==1?`transform:scale(${f3(sc)});`:''}"><div class="gh-panel"><div class="in"><div class="key">${esc(o.key)}</div><div class="tx">${r.txt(o)}${o.sub?`<small>${r.txt(o.sub)}</small>`:''}</div>${done&&i===pi?`<span class="ok">${esc(env.lang==='en'?'SELECT':HUD_TEXT.pick)}</span>`:''}</div></div></div>`;}).join('');
 r.html=`<div class="gh-choice card" data-c="choice"><div class="q gh-sh" style="${q.style}"><div class="gh-panel"><div class="in"><div style="flex:1">${tab(item.label??'CHOICE',{jp:item.labelJa??'さいしょの選択'})}<div class="qt">${r.txt(P)}</div>${en&&env.lang!=='en'?`<div class="en">${r.txt(en)}</div>`:''}</div>${ring}<i class="gh-br tr"></i><i class="gh-br bl"></i></div></div></div>`+
  `<div class="opts" style="opacity:${f3(1-kout)}"><div class="gh-cursor" style="top:${f3(cy*(OPT_H+GAP)+OPT_H/2-20)}px;opacity:${f3(cursorA)};transform:translateX(${f3(bob)}px)">${icon('cursor')}</div>${ops}</div></div>`;
 r.fx=`<div class="gh-tint card" style="opacity:${f3(life(t,dur,{enter:.2}).alpha)}"></div>`;
 r.choice={hot:done?pi:hot,picked:done?picked:null,pickAt};return r;}

// guide: {ja (title), sub?, en?, options?:[{key, ja, sub?}] (default env.config.choice.options), hot?='B', doneKey?='A',
//   doneLabel?='TRUE END', label?, labelJa?, factIds} — 「ここからは“もしも”の脱出ガイド」 bridge card after the TRUE END: the
//   first choice again, compact — A carries a gold TRUE END check badge, the cursor moves to B (highlighted, ▶) = into the run.
function guide(item,env){const r=R('center',env.lang),t=item.t??0,dur=item.dur??3,st=enterStyle('scale',t,dur);
 const opts=item.options??env.config?.choice?.options??[],hotKey=item.hot??'B',doneKey=item.doneKey??'A',hi=Math.max(0,opts.findIndex(o=>o.key===hotKey)),di=opts.findIndex(o=>o.key===doneKey);
 const ma=item.moveAt??.55,mk=EASE.outBack(seg(t,ma,ma+MOTION.cursorMove)),from=di>=0?di:0,cy=mix(from,hi,mk),on=t>=ma+.1,kout=life(t,dur).kout;
 const pl=on?.5+.5*Math.cos(2*Math.PI*(t-ma)/.7):0,OPT_H=96,GAP=12;r.ids(item.factIds);
 const ttl=L(item,env.lang);r.strings.push(ttl);const tl=brk(ttl,18),gfs=Math.min(...tl.map(l=>fitFs(l,36,600)));
 const ops=opts.map((o,i)=>{const cls=i===hi&&on?'hot gd':i===di?'done':'';const badge=i===di?`<span class="tb2">${icon('check')}${r.txt(item.doneLabel??HUD_TEXT.guideDone)}</span>`:i===hi&&on?`<span class="go" style="opacity:${f3(.55+.45*pl)}">${icon('arrow')}</span>`:'';
  return `<div class="gh-sh gh-opt gopt ${cls}" style="${rowIn(t,i,.25)}"><div class="gh-panel"><div class="in"><div class="key">${esc(o.key)}</div><div class="tx">${r.txt(o)}${o.sub?`<small>${r.txt(o.sub)}</small>`:''}</div>${badge}</div></div></div>`;}).join('');
 r.html=panel('gh-card gh-guide',`${tab(item.label??'GUIDE',{ic:'pin',jp:item.labelJa??'もしものガイド'})}<div class="gt" style="font-size:${gfs}px">${tl.map(html).join('<br>')}</div>${item.sub?`<div class="gs">${r.txt(item.sub)}</div>`:''}${item.en&&env.lang!=='en'?`<div class="en">${r.txt(item.en)}</div>`:''}`+
  `${opts.length?`<div class="opts" style="opacity:${f3(1-kout)}"><div class="gh-cursor" style="top:${f3(cy*(OPT_H+GAP)+OPT_H/2-20)}px;opacity:${f3(seg(t,.3,.45)*(1-kout))}">${icon('cursor')}</div>${ops}</div>`:''}`,{style:st.style,attrs:'data-c="guide"'});
 r.fx=`<div class="gh-tint card" style="opacity:${f3(life(t,dur,{enter:.2}).alpha)}"></div>`;
 r.guide={hot:on?hotKey:null,done:di>=0?doneKey:null};return r;}

// goodbyeTiming({dur=8}) → block entry times (beat-local s), when everything is fully visible, exit start (sound cues)
export function goodbyeTiming({dur=8}={}){const e=.32;
 return {quote:.15,facts:.45,ours:.85,foot:1.05,fullFrom:+(1.05+e).toFixed(3),exit:+(dur-.3).toFixed(3)};}
// goodbye: {quote?, facts?, ours?, foot?, factIds} (defaults GOODBYE_TEXT, the CONTRACT text) — GOODBYE BAD HALLOWEEN end card.
//   Three visually separate blocks + footer: (1) quoted city text: plain neutral panel, left quote bar, 「引用」 chip, our body
//   font only, attribution 「（渋谷区）」; (2) facts rows (when | what) neutral; (3) OUR message in the game's own panel style
//   (pumpkin bevel, pumpkin icon, 「制作チームより」 tab) — never inside the quote, never attributed to the city; footer sources +
//   fiction note. EN small under each JA block. record r.goodbye={blocks, lines:[…verbatim, line breaks removed]}.
function goodbye(item,env){const r=R('press',env.lang),t=item.t??0,dur=item.dur??8,G=GOODBYE_TEXT,T=goodbyeTiming({dur});
 const Q={...G.quote,...(item.quote||{})},F=item.facts??G.facts,O={...G.ours,...(item.ours||{})},FT={...G.foot,...(item.foot||{})};
 const out=life(t,dur,{exit:.3}).kout,bin=at=>{const k=EASE.outCubic(seg(t,at,at+.32));return `opacity:${f3(k*(1-out))};transform:translateY(${f3((1-k)*16)}px)`;};
 const one=s=>String(s).replace(/\n/g,''),ln=s=>{const v=one(s);r.strings.push(v);return v;};r.ids(item.factIds);
 const H=s=>html(s);// \n → <br>
 // block 1 — quote (neutral, attributed)
 ln(Q.title);ln(one(Q.ja)+Q.attr);ln(Q.en+' '+Q.enAttr);
 const b1=`<div class="gb-q" data-c="goodbye-quote" style="${bin(T.quote)}">${Q.label===false?'':`<span class="ql">${esc(Q.label??HUD_TEXT.quoteLabel)}</span>`}<div class="qt">${H(Q.title)}</div><div class="qj">${H(Q.ja)}<span class="qa">${esc(Q.attr)}</span></div><div class="qe">${esc(Q.en)} <span class="qa">${esc(Q.enAttr)}</span></div></div>`;
 // block 2 — facts (neutral rows: when | what)
 const b2=`<div class="gb-f" data-c="goodbye-facts" style="${bin(T.facts)}">${F.map(f=>{const v=ln(f.ja),m=/^(.*?)[　 ]+(.*)$/.exec(v),en=f.en?ln(f.en):'';
  return `<div class="fr"><span class="fi">${icon('clock')}</span><div class="fb"><div class="fj">${m?`<b>${esc(m[1])}</b><br><span>${esc(m[2])}</span>`:esc(v)}</div>${en?`<div class="fe">${esc(en)}</div>`:''}</div></div>`;}).join('')}</div>`;
 // block 3 — OUR message (game panel, own label)
 ln(O.ja);if(O.en)ln(O.en);const oj=H(O.ja).replace(/「行かない」/g,'<em>「行かない」</em>');
 const lab=O.label??HUD_TEXT.oursLabel,tabEn=O.tab??HUD_TEXT.oursTab;
 const b3=panel('gb-o',`<div class="oh">${icon('pumpkin')}${tab(tabEn,{jp:lab})}</div><div class="oj">${oj}</div>${O.en?`<div class="oe">${esc(O.en)}</div>`:''}`,{style:bin(T.ours),attrs:'data-c="goodbye-ours"'});
 r.strings.push(lab);
 // footer — sources + fiction note
 ln(FT.ja);if(FT.en)ln(FT.en);
 const b4=`<div class="gb-ft" data-c="goodbye-foot" style="${bin(T.foot)}"><div>${FT.ja.split(/(?<=　)(?=※)/).map(esc).join('<br>')}</div>${FT.en?`<div class="fe">${esc(FT.en)}</div>`:''}</div>`;
 r.html=`<div class="gh-goodbye" data-c="goodbye" style="left:${SAFE.left}px;right:${SAFE.right}px;top:${SAFE.top+12}px;bottom:${SAFE.bottom+12}px">${b1}${b2}${b3}${b4}</div>`;
 r.fx=`<div class="gh-tint gb" style="opacity:${f3(seg(t,0,.25)*(1-out))}"></div>`;
 r.goodbye={blocks:4,quoteAttr:Q.attr,full:t>=T.fullFrom&&t<=T.exit};r.parodyNote=/フィクション/.test(FT.ja);return r;}

export const COMPONENTS=Object.freeze({parody,fiction,tag,header,clock,mission,choice,caption,direction,sim,footnote,stamp,lesson,rules,notice,'press-start':pressStart,pressStart,sources,cheat,pin,legend,continue:cont,endcard,gag,guide,goodbye});
export const COMPONENT_KEYS=Object.freeze(Object.keys(COMPONENTS));
export const EXTERNAL_KEYS=Object.freeze(['logo']);   // rendered by other modules (3D logotype)

// render one item → result (or null for external/unknown keys)
export function render(item,env={}){const fn=COMPONENTS[item.c];if(!fn){if(!EXTERNAL_KEYS.includes(item.c))console.warn?.(`hud: unknown component ${item.c}`);return null;}
 return fn(item,{lang:'ja',...env});}

// ================= browser layer =================
const prng=seed=>()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
function noiseURL(size,fn){const c=document.createElement('canvas');c.width=c.height=size;const g=c.getContext('2d'),im=g.createImageData(size,size);
 for(let i=0;i<size*size;i++){const [v,a]=fn(i%size,Math.floor(i/size));im.data[i*4]=im.data[i*4+1]=im.data[i*4+2]=v;im.data[i*4+3]=a;}g.putImageData(im,0,0);return c.toDataURL('image/png');}
// value noise (tileable) for the rubber-stamp grit mask
function vnoise(size,cells,rnd){const g=[];for(let i=0;i<cells*cells;i++)g.push(rnd());const at=(x,y)=>g[((y%cells+cells)%cells)*cells+((x%cells+cells)%cells)];
 return (x,y)=>{const fx=x/size*cells,fy=y/size*cells,ix=Math.floor(fx),iy=Math.floor(fy),u=EASE.smooth(fx-ix),v=EASE.smooth(fy-iy);return mix(mix(at(ix,iy),at(ix+1,iy),u),mix(at(ix,iy+1),at(ix+1,iy+1),u),v);};}

const isObjS=v=>v&&typeof v==='object';
const SLOT_ORDER=['fx','pins','center','top','press','low','gag','foot','clock','header','parody'];
export class GameHUD{
 constructor(parent=document.body,{lang='ja',fontBase=null,cssHref=null}={}){
  this.lang=lang;
  const st=document.createElement('style');
  const rnd=prng(20261031),n1=vnoise(256,24,prng(7)),n2=vnoise(256,64,prng(9));
  const noise=noiseURL(128,()=>{const v=rnd();return [v>.5?255:0,Math.round(v*16)];});
  const grit=noiseURL(256,(x,y)=>{const a=n1(x,y)*.65+n2(x,y)*.35,s=rnd();return [255,a<.2||s<.01?Math.round(70*a):a<.25?170:255];});
  st.textContent=fontFaceCSS(fontBase??undefined)+'\n'+cssVars()+`\n#gh{--gh-noise:url(${noise});--gh-grit:url(${grit})}`;
  document.head.append(st);
  const link=document.createElement('link');link.rel='stylesheet';link.href=cssHref??new URL('./hud.css',import.meta.url).href;
  const cssLoaded=new Promise((res,rej)=>{link.onload=res;link.onerror=()=>rej(Error('hud.css failed to load'));});document.head.append(link);
  const root=document.createElement('div');root.id='gh';parent.append(root);this.root=root;
  root.innerHTML=SLOT_ORDER.map(s=>`<div class="gh-slot gh-slot-${s}" data-slot="${s}"></div>`).join('');
  this.el=Object.fromEntries([...root.children].map(e=>[e.dataset.slot,e]));
  const z={fx:1,pins:4,center:6,top:7,press:8,low:9,gag:10,foot:15,clock:20,header:20,parody:30};
  for(const [k,e] of Object.entries(this.el))e.style.zIndex=z[k];
  Object.assign(this.el.fx.style,{inset:'0'});Object.assign(this.el.pins.style,{inset:'0'});Object.assign(this.el.press.style,{inset:'0'});Object.assign(this.el.gag.style,{inset:'0'});
  Object.assign(this.el.center.style,{left:ZONE.center.left+'px',right:ZONE.center.right+'px',top:ZONE.center.top+'px',bottom:ZONE.center.bottom+'px',display:'flex',flexDirection:'column',justifyContent:'center',gap:'14px'});
  Object.assign(this.el.top.style,{left:ZONE.top.left+'px',right:ZONE.top.right+'px',top:ZONE.top.top+'px',display:'flex',flexDirection:'column',gap:'8px',alignItems:'flex-start'});
  Object.assign(this.el.low.style,{left:ZONE.low.left+'px',right:ZONE.low.right+'px',bottom:ZONE.low.bottom+'px'});
  for(const k of ['foot','clock','header','parody'])Object.assign(this.el[k].style,{inset:'0'});
  this.cache={};
  this.ready=Promise.all([cssLoaded,...FONT_LOADS.map(s=>document.fonts.load(s,'渋谷脱出せよ！ABC0123'))]).then(()=>document.fonts.ready).then(()=>true);
 }
 set(slot,h){if(this.cache[slot]!==h){this.el[slot].innerHTML=h;this.cache[slot]=h;}}
 // state: {T, items[], header?:bool|{…}, clock?:{…}|null, footnote?:string|{ja}|(ids)=>string|null, parody?:{…}, config?, sources?, lang?}
 // → record {T, parody, header, items:[c…], strings, factIds, sims:[{text,label}], stamps, cheat, choice, boxes:[{c,x0,y0,x1,y1}],
 //           safe:{ok, violations:[…]}, footnote:{ids,text}, footBox,
 //           cont:{digit,yes,yesAt,ticks}|null, endcard:{typed,total,done}|null, gag:bool, credit:bool (PLATEAU credit line drawn)}
 frame(state={}){
  const lang=state.lang??this.lang,T=state.T??0,env={lang,T,config:state.config,sources:state.sources};
  const out={fx:'',pins:'',center:'',top:'',press:'',low:'',gag:'',chips:'',foot:'',clock:'',header:'',parody:''};
  const rec={T,parody:false,fiction:false,notice:false,parodyNote:false,header:false,items:[],strings:[],factIds:[],sims:[],stamps:[],cheat:false,choice:null,labels:[],cont:null,endcard:null,gag:false,credit:false,goodbye:null,guide:null,mission:null};
  const add=res=>{if(!res)return;out[res.slot]+=res.html;if(res.fx)out.fx+=res.fx;rec.strings.push(...res.strings);for(const id of res.factIds)if(!rec.factIds.includes(id))rec.factIds.push(id);
   rec.sims.push(...res.sims);rec.stamps.push(...res.stamps);if(res.cheat)rec.cheat=true;if(res.choice)rec.choice=res.choice;if(res.label)rec.labels.push(res.label);if(res.header)rec.header=true;if(res.parody&&res.slot==='parody')rec.parody=true;if(res.fiction)rec.fiction=true;if(res.notice)rec.notice=true;if(res.parodyNote)rec.parodyNote=true;if(res.cont)rec.cont=res.cont;if(res.endcard)rec.endcard=res.endcard;if(res.gag)rec.gag=true;if(res.credit)rec.credit=true;if(res.goodbye)rec.goodbye=res.goodbye;if(res.guide)rec.guide=res.guide;if(res.missionCard)rec.mission=res.missionCard;};
  if(state.parody)add(render({c:'parody',...(state.parody===true?{}:state.parody)},env));   // opt-in (steering: no persistent label)
  if(state.fiction||(state.items||[]).some(it=>it.c==='notice'||(it.c==='mission'&&it.card&&it.fiction!==false)))add(render({c:'fiction',...(isObjS(state.fiction)?state.fiction:{})},env));
  if(state.header)add(render({c:'header',...(state.header===true?{}:state.header)},env));
  if(state.clock)add(render({c:'clock',...state.clock},env));
  {let y=ZONE.clock.top+(state.clock?50:rec.fiction?30:0);for(const tg of state.tags||[]){add(render({c:'tag',...(typeof tg==='string'?{ja:tg}:tg),top:y},env));y+=28;}}
  for(const it of state.items||[]){const res=render({t:T,...it},env);if(res){rec.items.push(it.c);add(res);}else if(EXTERNAL_KEYS.includes(it.c))rec.items.push(it.c);}
  if(out.chips)out.low+=`<div class="gh-chips">${out.chips}</div>`;
  let ft=state.footnote;if(typeof ft==='function')ft=ft(rec.factIds.slice());
  if(ft){const res=render({c:'footnote',...(typeof ft==='string'?{ja:ft,[lang]:ft}:ft)},env);add(res);rec.footnote={ids:rec.factIds.slice(),text:res.strings[0]};}else rec.footnote=null;
  for(const k of Object.keys(this.el))this.set(k,out[k]);
  // geometry checks (browser): every component box inside SAFE (tints/flash/pins excluded); footnote not clipped
  rec.boxes=[];const viol=[];
  for(const e of this.root.querySelectorAll('[data-c]')){const c=e.dataset.c;if(c==='pin')continue;const b=e.getBoundingClientRect();if(!b.width)continue;
   const box={c,x0:Math.round(b.left),y0:Math.round(b.top),x1:Math.round(b.right),y1:Math.round(b.bottom)};rec.boxes.push(box);
   const tol=2,xr=SAFE.W-(c==='stamp'||c==='press-start'?0:c==='footnote'?SAFE.right-20:SAFE.right);
   if(+getComputedStyle(e).opacity<.99)continue;// entering/leaving (slide/overshoot): checked once settled
   if(box.y0<SAFE.top-tol||box.y1>SAFE.H-SAFE.bottom+tol||box.x0<0||box.x1>xr+tol)viol.push(box);}
  rec.safe={ok:viol.length===0,violations:viol};
  const fe=this.root.querySelector('.gh-foot');if(fe){const b=fe.getBoundingClientRect();rec.footBox={top:Math.round(b.top),bottom:Math.round(b.bottom),right:Math.round(b.right),scrollH:fe.scrollHeight,clientH:fe.clientHeight,limit:Math.min(SAFE.H-SAFE.bottom,Math.round(SAFE.H*(1-FOOT_CLEAR.bottomFrac))),rlimit:Math.round(SAFE.W*(1-FOOT_CLEAR.rightFrac))};}
  rec.parody=rec.parody&&!!this.root.querySelector('.gh-parody');rec.fiction=rec.fiction&&!!this.root.querySelector('.gh-fiction');
  return rec;}
}
