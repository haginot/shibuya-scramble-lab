#!/usr/bin/env node
// JR v8 configs = the v7 configs (web3d/shibuya/series/variants/jr/v7/*.json) + the crowd-flow simulation as the centrepiece
// (logs/ssl-claude-halloween/v8/STEERING-sim-core.md; docs/V8.md):
//   * NEW sim beats right after the start map: `sim-plan` (CG map: heat map + agents of every route of the pair running at
//     once, compare panel with predicted time / peak density / risk / score per route, rows live) → `sim-pick` (the sim
//     highlights the optimal route = argmin of the stated score) → `over-choice` (the player ignores it once: gut pick + gag);
//   * retry after GAME OVER: `retry-why` (heat map frozen at the failing moment + pulsing ring + the sim's numbers there) →
//     `clear-choice` (re-run: rows slide from the first ranking to the new one, new optimal highlighted);
//   * `simmeter` (density meter + ETA, sim) on the move / result beats (photoreal plates and CG maps), fed by the tracked
//     walker of the route;
//   * gate CLEAR moves to the New South gate and the alt pair swaps outcomes (Ebisu = gut pick → GAME OVER, Harajuku = sim
//     pick → CLEAR), because that is what the solver says (web3d/shibuya/series/variants/jr/v8/sim/*.json);
//   * shorter cards (mission 3.0, first choice 4.0, guide 2.5, sources 3.0) to stay < 100 s;
//   * kaiju: party-colour crystals + confetti blast (kaiju.mjs) → party_popper cue at the pop.
// Every number written into a config text here comes from the sim summaries (tests/test_v8.py checks them).
// usage: node tools/v8_configs.mjs --write | --check
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as V8 from '../web3d/shibuya/series/sim-v8.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const V7=path.join(ROOT,'web3d/shibuya/series/variants/jr/v7'),OUT=path.join(ROOT,'web3d/shibuya/series/variants/jr/v8');
const SIMDIR=path.join(OUT,'sim');
export const PAIRS=['gate','taxi','zone','alt'];
const GEN='tools/v8_configs.mjs (do not edit by hand: edit the generator and re-run --write)';
const rd=f=>JSON.parse(fs.readFileSync(f,'utf8'));
export const SUM={plan:rd(path.join(SIMDIR,'plan.json')),retry:rd(path.join(SIMDIR,'retry.json'))};
const clone=v=>JSON.parse(JSON.stringify(v));
const r1=v=>Math.round(v*10)/10;
const fmtRho=V8.fmtRho,fmtMS=V8.fmtMS;

// beat durations (s)
export const DUR={mission:3.0,'first-choice':4.0,guide:2.5,'sim-plan':6.5,'sim-pick':2.5,'over-choice':3.5,'retry-why':2.5,'clear-choice':4.5,sources:3.0};
export const SIM_RUN=[.35,6.1];        // sim-plan: beat-local window of the sim playback
export const RETRY_RUN=[.45,3.2];      // clear-choice: window of the re-run
export const ORDER=['first-choice','true-end','guide','over-start','sim-plan','sim-pick','over-choice','over-move','over-result','caught','over-stamp',
 'over-lesson','continue','retry-why','clear-choice','clear-move','clear-result','clear-stamp','clear-cheat','kaiju','goodbye','sources'];
// the player's gut line (ignores the SIM PICK once)
const GUT={gate:'みんなが行く方でしょ？',taxi:'駅前の乗り場でいいでしょ？',zone:'近い方でいいでしょ？',alt:'終電が遅い方が安心でしょ？'};
// assumptions line per pair (small text in the panel); fact ids keep their labels (2024年 / 未発表)
const ASSUME={
 gate:{ja:'仮定：人出48,000人・ピーク時／ハチ公改札前は入場規制を仮定（2024年の例）／2026年のJRの対策は未発表',factIds:['MEAS-15','NA-JR-2026']},
 taxi:{ja:'仮定：人出48,000人・ピーク時／歩く区間のみシミュレーション（タクシー待ちは含まず）',factIds:[]},
 zone:{ja:'仮定：人出48,000人・ピーク時／シミュレーション範囲の外はOSMから概算（80m/分）',factIds:[]},
 alt:{ja:'仮定：人出48,000人・ピーク時／範囲外はOSMから概算（80m/分）／終電は通常の土休日ダイヤ',factIds:[]}};
// the CLEAR route of each pair = the retry pick (checked below)
const CLEAR={gate:'GC',taxi:'TB',zone:'HA',alt:'HA'};

// ---------------------------------------------------------------- sim numbers for texts
function rowsOf(sc,pair){return SUM[sc].scored[pair].rows;}
function trackRows(sc,key){return SUM[sc].track[key];}
// failing moment of the over route in the plan run: the tracked walker's densest moment (first time at its max); alt: arrival
export function failMoment(pair){const P=V8.V8_PAIRS[pair],key=P.over,tr=trackRows('plan',key);let best=tr.rows[0];
 if(pair==='alt'||pair==='taxi'){const last=tr.rows.at(-1);return {t:last[0],rho:last[1],x:last[2],z:last[3],born:tr.born,done:tr.done};}
 for(const r of tr.rows)if(r[1]>best[1]+1e-9)best=r;return {t:best[0],rho:best[1],x:best[2],z:best[3],born:tr.born,done:tr.done};}
function simWindow(sc,pair,extra=25){const keys=V8.V8_PAIRS[pair].routes.map(r=>r.key),fin=keys.map(k=>SUM[sc].track[k].done).filter(v=>v!=null);
 const anyStuck=keys.some(k=>SUM[sc].track[k].done==null);return Math.ceil(Math.max(...fin)+(anyStuck?90:extra));}
function framing(pair){const keys=V8.V8_PAIRS[pair].routes.map(r=>r.key),pts=[];for(const k of keys){const R=SUM.plan.routes.find(r=>r.key===k);pts.push(...R.path,[R.start.x,R.start.z]);}
 let x0=Infinity,z0=Infinity,x1=-Infinity,z1=-Infinity;for(const [x,z] of pts){x0=Math.min(x0,x);x1=Math.max(x1,x);z0=Math.min(z0,z);z1=Math.max(z1,z);}
 const m=12;return [[x0-m,z0-m],[x1+m,z0-m],[x0-m,z1+m],[x1+m,z1+m]];}
const simRouteId=k=>`SIM-${k}`;
function mapShot(pair,{highlight=null}={}){const P=V8.V8_PAIRS[pair],n=P.routes.length;
 return {key:'routemap',params:{routes:P.routes.map(r=>simRouteId(r.key)),highlight:highlight?simRouteId(highlight):null,colors:Object.fromEntries(P.routes.map(r=>[simRouteId(r.key),r.color])),
  points:framing(pair),azimuth:90,push:0,rect:{x0:.08,x1:.92,y0:.2,y1:n>2?.47:.5},span:true,redZone:pair==='zone'?.3:0,drawOn:[0,.01]},t0:0};}
const simmap=(pair,sc,x={})=>{const P=V8.V8_PAIRS[pair];return {scenario:sc,routes:P.routes.map(r=>r.key),colors:Object.fromEntries(P.routes.map(r=>[r.key,r.color])),player:P.over,crowd:true,heat:1,...x};};
function panelItem(pair,sc,x={}){const A=ASSUME[pair];return {c:'simpanel',scenario:sc,pair,head:'シミュレーション',assume:A.ja,factIds:[...A.factIds],...x};}
const pinsOf=(pair)=>{const P=V8.V8_PAIRS[pair],out=[];const R0=SUM.plan.routes.find(r=>r.key===P.routes[0].key);
 out.push({c:'pin',world:[R0.start.x,0,R0.start.z],ja:'スタート',color:'#E9DDFF',factIds:[]});
 for(const r of P.routes){const R=SUM.plan.routes.find(q=>q.key===r.key),n=SUM.plan.numbers[r.key];
  out.push({c:'pin',world:[R.zone.x,0,R.zone.z],ja:n.offsim?`${r.label.split(' ')[0]} →OSM区間（概算）`:r.label,color:r.color,factIds:n.offsim?[n.offsim.id]:[]});}
 return out;};

// ---------------------------------------------------------------- beats
function simBeats(pair,c){const P=V8.V8_PAIRS[pair],T1=simWindow('plan',pair),runDur=SIM_RUN[1]-SIM_RUN[0];
 const speed=`×${Math.round(T1/runDur)} 早送り`,routes=Object.fromEntries(P.routes.map(r=>[simRouteId(r.key),{ja:`${r.label}（シミュレーションの経路）`,factIds:[],points:SUM.plan.routes.find(q=>q.key===r.key).path}]));
 Object.assign(c.routes||(c.routes={}),routes);
 const plan={id:'sim-plan',dur:DUR['sim-plan'],shot:mapShot(pair),simmap:simmap(pair,'plan',{run:SIM_RUN,simT:[0,T1]}),
  hud:[panelItem(pair,'plan',{phase:'run',run:SIM_RUN,simT:[0,T1],speed,exit:false,finalAt:SIM_RUN[1]}),...pinsOf(pair)],
  cues:[{at:.05,sfx:'card_in',gain_db:-4},{at:.4,sfx:'tick',repeat:.45,until:SIM_RUN[1],gain_db:-6}],
  clock:false,header:true,bgm:'tension',amb:'crowd-night',duck:-5};
 const pick={id:'sim-pick',dur:DUR['sim-pick'],shot:mapShot(pair,{highlight:SUM.plan.scored[pair].pick}),simmap:simmap(pair,'plan',{run:[0,1],simT:[T1,T1]}),
  hud:[panelItem(pair,'plan',{phase:'pick',run:[0,1],simT:[T1,T1],speed,anim:'none',reorder:[.1,.6],pickAt:.7,verdict:'シミュレーションの結論'}),...pinsOf(pair)],
  cues:[{at:.1,sfx:'whoosh',gain_db:-12},{at:.7,sfx:'ui_select'},{at:.74,sfx:'choice_pick',gain_db:-2}],clock:false,header:true,bgm:'tension',amb:'crowd-night',duck:-5};
 return [plan,pick];}

function retryBeats(pair,c){const P=V8.V8_PAIRS[pair],F=failMoment(pair),T1=simWindow('retry',pair),runDur=RETRY_RUN[1]-RETRY_RUN[0];
 const over=rowsOf('plan',pair).find(r=>r.key===P.over);
 // why it failed: the numbers of the plan run at the failing moment (same sim the player ignored)
 let why;
 if(pair==='gate')why={ja:`改札前 ${fmtRho(F.rho)}人/m²\n15分たっても通れない\n（シミュレーション）`,factIds:[]};
 else if(pair==='taxi')why={ja:`乗り場は休止中（2025年3月30日から）\nまわり ${fmtRho(F.rho)}人/m²（シミュレーション）`,factIds:['TAXI-01']};
 else if(pair==='zone')why={ja:`赤枠内 ${fmtRho(F.rho)}人/m²（シミュレーション）\n状況により規制（2026年）`,factIds:['MEAS-01']};
 else why={ja:`恵比寿着 ${V8.hmOf(over.arrive)}\n内回り終電0:50に間に合わない\n（シミュレーション・土休日ダイヤ）`,factIds:['JR-LAST-14']};
 const whyBeat={id:'retry-why',dur:DUR['retry-why'],shot:mapShot(pair),simmap:simmap(pair,'plan',{freeze:F.t,pulse:[F.x,F.z],dim:P.routes.filter(r=>r.key!==P.over).map(r=>r.key),run:[0,1],simT:[F.t,F.t]}),
  hud:[{c:'caption',ja:'なぜ失敗した？\nシミュレーションで見直す',factIds:[],tone:'warn'},{c:'pin',world:pair==='alt'?[r1((F.x+60)/2),0,r1((F.z+40)/2)]:[F.x,0,F.z],ja:why.ja,color:'#FF6FB1',factIds:why.factIds}],
  cues:[{at:.02,sfx:'red_alert',gain_db:-6},{at:.05,sfx:'card_in',gain_db:-6}],clock:false,header:true,bgm:'retry',amb:'crowd-night',duck:-4,
  why:{t:F.t,rho:F.rho,x:F.x,z:F.z,text:why.ja}};
 const speed=`×${Math.round(T1/runDur)} 早送り`;
 const cc={id:'clear-choice',dur:DUR['clear-choice'],shot:mapShot(pair,{highlight:null}),simmap:simmap(pair,'retry',{run:RETRY_RUN,simT:[0,T1],player:CLEAR[pair]}),
  hud:[panelItem(pair,'retry',{phase:'recompute',from:'plan',reorder:[RETRY_RUN[1],RETRY_RUN[1]+.4],run:RETRY_RUN,simT:[0,T1],speed,head:'再計算（失敗した時間帯の人の流れで）',finalAt:RETRY_RUN[1],pickAt:RETRY_RUN[1]+.45,verdict:'再計算の結論'}),...pinsOf(pair)],
  cues:[{at:.05,sfx:'whoosh',gain_db:-8},{at:.6,sfx:'tick',repeat:.4,until:RETRY_RUN[1],gain_db:-6},{at:RETRY_RUN[1]+.45,sfx:'ui_select'},{at:RETRY_RUN[1]+.49,sfx:'choice_pick',gain_db:-2}],
  clock:false,header:true,bgm:'retry',amb:'crowd-night',duck:-5};
 return [whyBeat,cc];}

// simmeter on a move / result beat: tracked walker of `route` (scenario), sim time window [a,b]
const meter=(sc,route,a,b,x={})=>({c:'simmeter',scenario:sc,route,run:[0,1],simT:[r1(a),r1(b)],factIds:[],...x});
// the meter plays its sim window over the whole beat
const addMeter=(b,m)=>{b.hud.push({...m,run:[0,b.dur]});};

export function build(){const out={};
 // ---------- opening
 const op=rd(path.join(V7,'_opening.json'));op.id='_opening-v8';op.release='v8';op.generated=GEN;
 for(const b of op.beats)if(b.id==='mission')b.dur=DUR.mission;
 out._opening=op;
 for(const pair of PAIRS){const c=rd(path.join(V7,`${pair}.json`)),P=V8.V8_PAIRS[pair];
  c.id=`v8-${pair}`;c.release='v8';c.generated=GEN;
  const by=Object.fromEntries(c.beats.map(b=>[b.id,b]));
  const F=failMoment(pair),overTr=trackRows('plan',P.over),clr=CLEAR[pair],clrTr=trackRows('retry',clr);
  if(SUM.retry.scored[pair].pick!==clr)throw Error(`${pair}: retry pick ${SUM.retry.scored[pair].pick} ≠ CLEAR route ${clr}`);
  if(SUM.plan.scored[pair].pick===P.over)throw Error(`${pair}: the plan pick is the GAME OVER route`);
  // cards
  by['first-choice'].dur=DUR['first-choice'];for(const h of by['first-choice'].hud)if(h.c==='choice'&&h.pickAt)h.pickAt=3.0;
  by.guide.dur=DUR.guide;by.sources.dur=DUR.sources;
  {const s=by.sources.hud.find(h=>h.c==='sources');s.note='徒歩はOSMから概算（混雑・信号は含まず）／混雑・所要時間は人流シミュレーション（人出48,000人・ピーク時、入場規制などは仮定）';}
  // over-choice: the gut pick right after the SIM PICK
  {const b=by['over-choice'];b.dur=DUR['over-choice'];const ch=b.hud.find(h=>h.c==='choice');if(pair==='alt'){ch.picked='B';}
   const pk=SUM.plan.scored[pair].rows.find(r=>r.key===SUM.plan.scored[pair].pick);
   b.hud.push({c:'sim',ja:`シミュレーションの結論は「${pk.label}」`,factIds:[]},{c:'caption',ja:`でも…${GUT[pair]}`,speaker:'プレイヤー',factIds:[],tone:'sub',at:1.0});}
  // over move / result meters (plan run, the over route)
  const oEnd=pair==='gate'||pair==='zone'?F.t:(overTr.done??F.t),oMid=overTr.born+.55*(oEnd-overTr.born);
  const etaLab={gate:'改札まで',taxi:'乗り場まで',zone:'原宿駅まで',alt:'恵比寿駅まで'}[pair];
  if(by['over-move'])addMeter(by['over-move'],meter('plan',P.over,overTr.born,oMid,{etaLabel:etaLab}));
  if(pair!=='alt')addMeter(by['over-result'],meter('plan',P.over,oMid,oEnd,{etaLabel:etaLab}));
  // clear move / result meters (retry run, the clear route)
  const cEnd=clrTr.done,cMid=clrTr.born+.6*(cEnd-clrTr.born),cLab={gate:'改札まで',taxi:'乗り場まで',zone:'原宿駅まで',alt:'原宿駅まで'}[pair];
  if(by['clear-move'])addMeter(by['clear-move'],meter('retry',clr,clrTr.born,cMid,{etaLabel:cLab}));
  if(pair!=='alt')addMeter(by['clear-result'],meter('retry',clr,cMid,cEnd,{etaLabel:cLab}));
  // kaiju: confetti blast pop (kaiju.mjs: roarAt 1.85 + popDelay 0.1)
  by.kaiju.cues=[...(by.kaiju.cues||[]),{at:1.95,sfx:'party_popper',gain_db:-2}];
  // pair-specific story changes (the solver's verdict)
  if(pair==='gate')gateNewSouth(c,by);
  if(pair==='alt')altSwap(c,by,F);
  if(pair==='taxi'||pair==='zone'){}
  // assemble in ORDER (clear-choice replaced; new beats inserted)
  const [sp,spk]=simBeats(pair,c),[rw,cc]=retryBeats(pair,c);
  const keep={...by,'sim-plan':sp,'sim-pick':spk,'retry-why':rw,'clear-choice':{...cc,reuse:by['clear-choice'].reuse}};
  c.beats=ORDER.map(id=>{const b=keep[id];if(!b)throw Error(`${pair}: beat ${id} missing`);return b;});
  for(const id of ['sim-plan','sim-pick','retry-why'])delete keep[id].reuse;
  // sources: the facts the new items cite
  for(const id of [...ASSUME[pair].factIds,...(pair==='gate'?['JR-GATE-08','JR-GATE-09']:[]),...(pair==='taxi'?['TAXI-01']:[]),...(pair==='zone'?['MEAS-01']:[]),...(pair==='alt'?['JR-LAST-08','JR-LAST-14']:[])])
   if(!c.sources.includes(id))c.sources.push(id);
  c.sim={plan:'v8/sim/plan.json',retry:'v8/sim/retry.json',pick:SUM.plan.scored[pair].pick,retryPick:SUM.retry.scored[pair].pick,over:P.over,clear:clr,
   rule:V8.V8_RULE.ja,assumptions:V8.V8_ASSUMPTIONS.ja};
  out[pair]=c;}
 return out;}

function gateNewSouth(c,by){// the solver: the South gate jams like Hachiko; the New South gate flows → CLEAR at 新南改札
 c.title={ja:'ハチ公改札で GAME OVER → 新南改札で再挑戦'};
 const cm=by['clear-move'];cm.shot.params.routes=['JR-C-newsouth-east','JR-B-south','JR-A-hachiko'];cm.shot.params.highlight='JR-C-newsouth-east';
 cm.hud=cm.hud.filter(h=>h.c!=='caption'&&h.c!=='legend');
 cm.hud.unshift({c:'legend',factIds:[],rows:[{color:'#4FE3C1',ja:'ルート例：新南改札へ'},{color:'#FFD23F',ja:'南改札へ'},{color:'#FF7A9A',ja:'ハチ公改札へ'}]},
  {c:'caption',ja:'ルート例：新南改札（3F）へ\nハチ公前から約7〜8分\n（OSMから概算）',factIds:['GATE-H-NS-E','GATE-H-NS-W','JR-GATE-01'],until:2.3},
  {c:'caption',ja:'出て右がサクラステージ\n左がストリーム（3F・2024年〜）',factIds:['JR-GATE-08','JR-GATE-09'],at:2.3});
 const cs=by['clear-stamp'].hud.find(h=>h.c==='stamp');cs.ja='新南改札から乗車！\n（シミュレーション）';}

function altSwap(c,by,F){// the solver: Ebisu (later last train, farther) misses it; Harajuku (closer) makes it → swap outcomes
 const S=SUM.plan.scored.alt,eb=S.rows.find(r=>r.key==='EB'),R=SUM.retry.scored.alt.rows.find(r=>r.key==='HA');
 c.title={ja:'恵比寿駅で GAME OVER → 原宿駅で再挑戦'};c.choice.picked='B';
 c.clock.start='00:23';
 for(const b of c.beats)if(b.clock&&b.clock.set){const [h,m,s]=b.clock.set.split(':').map(Number);const t=h*3600+m*60+(s||0)+180;b.clock.set=`${String(Math.floor(t/3600)%24).padStart(2,'0')}:${String(Math.floor(t/60)%60).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;}
 const om=by['over-move'];om.hud=om.hud.filter(h=>h.c!=='caption'&&h.c!=='sim');om.hud.unshift({c:'caption',ja:'恵比寿へ 約1932m・約25分\n（OSMから概算）',factIds:['ALT-EBI-H']});
 const arr=V8.hmOf(eb.arrive);
 const or=by['over-result'];or.hud=[{c:'caption',ja:`恵比寿着 ${arr}（シミュレーション）\n内回り終電0:50に間に合わない\n（通常の土休日ダイヤ）`,factIds:['JR-LAST-14'],tone:'warn',sim:true},{c:'sim',ja:`着${arr}＝シミュレーション`,factIds:[],at:.4}];
 or.factIds=['JR-LAST-14'];or.clock={set:`00:${arr.split(':')[1]}:00`,rate:.5};
 if(or.board)or.board={...or.board,title:'恵比寿 山手線 内回り',rows:[{note:'終電',time:'0:50',dest:'大崎'}]};
 const ca=by.caught;ca.hud=[{c:'sim',ja:'終電に間に合わない…（シミュレーション）',factIds:[],until:1.75}];ca.factIds=['JR-LAST-14'];
 const st=by['over-stamp'].hud.find(h=>h.c==='stamp');st.ja='終電に間に合わない…\n（シミュレーション）';st.safety={ja:'終電の時刻と歩く時間を先に確認',factIds:[]};
 c.lesson={title:'終電が遅い駅が正解とは限らない',points:['恵比寿の内回り終電0:50は\n渋谷0:48より遅いけれど\n歩いて約25分（OSMから概算）','原宿の内回り終電は0:45\n歩いて約20分（OSMから概算）','通常の土休日ダイヤ（10/25確認）\n2026年の臨時ダイヤは未発表','終電の時刻と歩く時間を\n両方先に確認'],
  factIds:['JR-LAST-14','JR-LAST-02','JR-LAST-08','ALT-EBI-H','ALT-HARA-H','NA-JR-2026']};
 c.lesson.ja=[c.lesson.title,...c.lesson.points].join('\n');
 c.lesson.summary='終電が遅い駅が正解とは限らない。恵比寿の内回り終電0:50は渋谷0:48より遅いが歩いて約25分、原宿は0:45で約20分（OSMから概算・通常の土休日ダイヤ・10/25確認、2026年の臨時ダイヤは未発表）。終電の時刻と歩く時間を両方先に確認。';
 for(const r of c.cheat.rows)delete r.tone;
 const cm=by['clear-move'];cm.shot.params.routes=['ALT-HARA-H','ALT-EBI-H'];cm.shot.params.highlight='ALT-HARA-H';
 cm.shot.params.colors={'ALT-HARA-H':'#4FE3C1','ALT-EBI-H':'#FF9A3D'};cm.shot.params.points=[[209.8,-1211.2],[22,34],[768.8,1406]];
 cm.hud=cm.hud.filter(h=>h.c!=='caption'&&h.c!=='pin');
 cm.hud.unshift({c:'caption',ja:'原宿の内回り終電は0:45\n（通常の土休日ダイヤ）',factIds:['JR-LAST-08'],until:2.3},{c:'caption',ja:'原宿へ 約1572m・約20分\n（OSMから概算）',factIds:['ALT-HARA-H'],at:2.3},
  {c:'pin',world:[209.8,0,-1211.2],ja:'原宿駅',color:'#4FE3C1',factIds:[]});
 const harr=V8.hmOf(R.arrive);
 const cr=by['clear-result'];cr.hud=[{c:'caption',ja:`原宿に${harr}ごろ到着\n（シミュレーション）`,factIds:[],sim:true},{c:'sim',ja:'到着時刻＝シミュレーション',factIds:[],at:.4}];
 cr.factIds=['JR-LAST-08'];cr.clock={set:`00:${harr.split(':')[1]}:00`,rate:.5};
 for(const id of ['clear-result','clear-stamp'])if(by[id].board)by[id].board={...by[id].board,title:'原宿 山手線 内回り',rows:[{note:'終電',time:'0:45',dest:'大崎'}]};
 by['clear-stamp'].factIds=['JR-LAST-08'];
 const cs=by['clear-stamp'];cs.clock={set:`00:${String(Number(harr.split(':')[1])+2).padStart(2,'0')}:00`,rate:.5};
 by.continue.hud.find(h=>h.c==='continue').ja='反対側の駅でやり直す';}

if(process.argv[1]===fileURLToPath(import.meta.url)){
 const mode=process.argv[2]||'--check',cfgs=build();let bad=0;
 for(const [k,c] of Object.entries(cfgs)){const f=path.join(OUT,`${k}.json`),txt=JSON.stringify(c,null,2)+'\n';
  if(mode==='--write'){fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(f,txt);console.log('wrote',path.relative(ROOT,f));}
  else if(!fs.existsSync(f)||fs.readFileSync(f,'utf8')!==txt){console.error('stale:',path.relative(ROOT,f));bad++;}}
 if(mode!=='--write')console.log(bad?`${bad} stale v8 config(s): run node tools/v8_configs.mjs --write`:'v8 configs up to date');
 process.exit(bad?1:0);}
