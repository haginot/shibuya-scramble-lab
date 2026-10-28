#!/usr/bin/env node
// JR v9 configs = the v8 configs (tools/v8_configs.mjs build(), unchanged story / sim / labels) +
// logs/ssl-claude-halloween/v9/STEERING-*.md:
//   * look.costumes:'v9' on the opening and every pair: every CG person (solver crowd, near people, crowd states) wears a
//     Halloween costume (series/costumes-v9.mjs); the sim-map crowd dots take their costume colour (simmap.costumes);
//   * crush-pov (7 s, photo layer = the eye-level crush POV of tools/v9_composite.py): crushmeter = the crush scenario
//     (tools/v9_sim.mjs crush: the v8 retry crowd with the model's 4 p/m² limit lifted to 8) — the worst walker of the GAME
//     OVER route, its meter rows up to its densest moment → the last value shown IS the scenario's peak (tests/test_v9.py);
//     pulsing 「圧死危険」, 「シミュレーション」 + the assumption; heartbeat / breathing / muffled crowd (original SFX), no BGM.
//     Placed right before the caught sequence (gate / taxi / zone: after over-result), alt: on the way out (after the gut
//     pick; alt's GAME OVER is the missed last train);
//   * clear-pov (2.5 s, photo): the CLEAR route at eye level, low density (simmeter of the retry run) — the contrast;
//   * more room for the sim comparison (sim-plan 6.5 → 9.0 s, sim-pick 2.5 → 4.0 s) and the retry recompute
//     (retry-why 2.5 → 4.0 s, clear-choice 4.5 → 6.5 s). No padding: the extra time slows the fast-forward and holds the
//     panels / verdicts long enough to read.
// usage: node tools/v9_configs.mjs --write | --check
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as V8 from '../web3d/shibuya/series/sim-v8.mjs';
import * as V8C from './v8_configs.mjs';
import {JR_CROWD} from '../web3d/shibuya/series/crowd-jr.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const OUT=path.join(ROOT,'web3d/shibuya/series/variants/jr/v9');
export const CRUSH=JSON.parse(fs.readFileSync(path.join(OUT,'sim/crush.json'),'utf8'));
const GEN='tools/v9_configs.mjs (do not edit by hand: edit the generator and re-run --write)';
const r1=v=>Math.round(v*10)/10;

// v9 ghost guide (STEERING-guide-ghost: reading time ≈ 0.12 s/char + 1 s per bubble, tools/v9_ghost.py): guide 2.5 → 3.0,
// over-start 2.5 → 3.5, sim-plan 9 → 11, retry-why 4 → 5, clear-choice 6.5 → 7.5, crush-pov 7 → 8, clear-pov 2.5 → 3.0
export const DUR={guide:3.0,'over-start':3.5,'sim-plan':11.0,'sim-pick':4.0,'retry-why':5.0,'clear-choice':7.5,'crush-pov':8.0,'clear-pov':3.0};
export const SIM_RUN=[.35,10.4],RETRY_RUN=[.45,4.2],PICK={reorder:[.15,.95],pickAt:1.15};
export const CRUSH_RUN=[.3,5.6];   // crush-pov: beat-local window in which the meter climbs to the peak (then holds)
const SHOVES=[.95,2.25,3.35,4.65,5.9,6.95];   // s: the crowd shoves (picture: tools/v9_composite.py crush_frame; sound: `shove` cues)
const DANGER=JR_CROWD.crush;       // p/m²: 「圧死危険」 at or above the solver's own crush threshold (crowd-jr JR_CROWD.crush = 4)

// where the crush happens (for the caption): rough areas of the model (x, z in m; Scramble centre = 0, 0)
function areaOf([x,z]){if(x>55&&x<150&&z>-5&&z<25)return '改札前';if(x>-5&&x<60&&z>12&&z<70)return 'ハチ公前';if(Math.hypot(x,z)<45)return 'スクランブル交差点';return '道の途中';}

function crushBeat(pair,c){const P=V8.V8_PAIRS[pair],pov=CRUSH.pov[pair],W=CRUSH.worst[P.over];
 // meter window: from 75 s before the peak (or the walker's start) to the peak
 const t0=Math.max(W.rows[0][0],pov.simT-75);let area=areaOf(pov.at);if(area==='改札前'&&pair!=='gate')area='駅前の通路';
 return {id:'crush-pov',dur:DUR['crush-pov'],shot:{key:'card-bg',params:{},t0:0},clock:false,header:true,
  hud:[{c:'crushmeter',scenario:'crush',route:P.over,track:'worst',run:CRUSH_RUN,simT:[r1(t0),pov.simT],peak:pov.peak,danger:DANGER,
    label:`足元の密度（${area}・圧死シナリオ）`,note:'シミュレーション（仮定：モデルの上限 4人/m² を 8人/m² に緩和）',factIds:[]},
   {c:'caption',ja:`${area}：一歩も前に進めない`,factIds:[],tone:'warn',at:.9,until:3.9},
   {c:'caption',ja:'押されても倒れられない。\nこれが「近づくな」の理由。',factIds:[],tone:'warn',at:4.0}],
  cues:[{at:0,sfx:'crush_muffled',gain_db:0,duck:0},{at:.15,sfx:'heartbeat',repeat:.74,until:7.9,gain_db:-1},{at:.6,sfx:'breath',repeat:2.05,until:7.4,gain_db:-3},
   ...SHOVES.map(t=>({at:t,sfx:'shove',gain_db:-2}))],
  bgm:null,amb:null,crush:{pair,route:P.over,walker:pov.walker,peak:pov.peak,simT:pov.simT,at:pov.at,area,shoves:[...SHOVES]}};}

function clearPovBeat(pair,c,cm){const S=V8C.SUM.retry,clr=c.sim.clear,tr=S.track[clr];
 // the clear-move meter window continues: a short stretch of the CLEAR route's tracked walker (retry run)
 const m=(cm?.hud||[]).find(h=>h.c==='simmeter');const a=m?m.simT[1]:tr.born,b=Math.min(tr.done??a+20,a+20);
 return {id:'clear-pov',dur:DUR['clear-pov'],shot:{key:'card-bg',params:{},t0:0},clock:false,header:true,
  hud:[{c:'simmeter',scenario:'retry',route:clr,run:[0,DUR['clear-pov']],simT:[r1(a),r1(b)],factIds:[],etaLabel:m?.etaLabel??'到着まで'},
   {c:'caption',ja:'こっちは歩ける。\nまわりに余裕がある\n（シミュレーション）',factIds:[],at:.3}],
  cues:[{at:.05,sfx:'whoosh',gain_db:-14}],bgm:'retry',amb:'street-quiet'};}

export function build(){
 Object.assign(V8C.DUR,{guide:DUR.guide,'sim-plan':DUR['sim-plan'],'sim-pick':DUR['sim-pick'],'retry-why':DUR['retry-why'],'clear-choice':DUR['clear-choice']});
 V8C.SIM_RUN.splice(0,2,...SIM_RUN);V8C.RETRY_RUN.splice(0,2,...RETRY_RUN);
 const v8=V8C.build(),out={};
 const op=v8._opening;op.id='_opening-v9';op.release='v9';op.generated=GEN;op.look={...(op.look||{}),costumes:'v9'};out._opening=op;
 for(const pair of V8C.PAIRS){const c=v8[pair],P=V8.V8_PAIRS[pair];
  c.id=`v9-${pair}`;c.release='v9';c.generated=GEN;c.look={...(c.look||{}),costumes:'v9'};
  for(const b of c.beats){if(b.simmap)b.simmap.costumes=true;}
  const by=Object.fromEntries(c.beats.map(b=>[b.id,b]));
  by['over-start'].dur=DUR['over-start'];   // reading time for the ghost's start-map line
  // sim-pick: the rows re-sort a bit later and slower, the verdict holds ~2.8 s
  {const sp=by['sim-pick'].hud.find(h=>h.c==='simpanel');sp.reorder=[...PICK.reorder];sp.pickAt=PICK.pickAt;
   by['sim-pick'].cues=[{at:.15,sfx:'whoosh',gain_db:-12},{at:PICK.pickAt,sfx:'ui_select'},{at:PICK.pickAt+.04,sfx:'choice_pick',gain_db:-2}];}
  // retry-why: the pin's numbers stay ~3.5 s; the caption gives way to the meter line of the failing moment at 2 s
  {const w=by['retry-why'];const cap=w.hud.find(h=>h.c==='caption');cap.until=2.0;
   w.hud.push({c:'caption',ja:'同じシミュレーションの\n失敗した瞬間',factIds:[],tone:'warn',at:2.0});}
  const crush=crushBeat(pair,c),cpov=clearPovBeat(pair,c,by['clear-move']);
  const order=[...c.beats];
  order.splice(order.findIndex(b=>b.id===(pair==='alt'?'over-choice':'over-result'))+1,0,crush);
  order.splice(order.findIndex(b=>b.id==='clear-move')+1,0,cpov);
  c.beats=order;
  c.sim={...c.sim,crush:'v9/sim/crush.json',crushPeak:CRUSH.pov[pair].peak,crushAssumption:CRUSH.assumptions.ja};
  out[pair]=c;}
 return out;}

if(process.argv[1]===fileURLToPath(import.meta.url)){
 const mode=process.argv[2]||'--check',cfgs=build();let bad=0;
 for(const [k,c] of Object.entries(cfgs)){const f=path.join(OUT,`${k}.json`),txt=JSON.stringify(c,null,2)+'\n';
  if(mode==='--write'){fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(f,txt);console.log('wrote',path.relative(ROOT,f));}
  else if(!fs.existsSync(f)||fs.readFileSync(f,'utf8')!==txt){console.error('stale:',path.relative(ROOT,f));bad++;}}
 if(mode!=='--write')console.log(bad?`${bad} stale v9 config(s): run node tools/v9_configs.mjs --write`:'v9 configs up to date');
 process.exit(bad?1:0);}
