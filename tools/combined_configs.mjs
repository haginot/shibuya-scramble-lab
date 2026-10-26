#!/usr/bin/env node
// JR編 combined episodes: build web3d/shibuya/series/variants/jr/combined/<pair>.json from the existing <pair>-over and
// <pair>-clear variant configs (combined/CONTRACT.md table; series/variant-system.mjs COMBINED_BEATS), so the four
// configs are reproducible. The configs are the source of truth for the page / recorder / cue sheet; this script is
// how they are made (edit COPY / FIX / NEW_BEATS here, re-run, commit both).
//   node tools/combined_configs.mjs [--write] [--check] [<pair> …]
//     (default) print a summary;  --write  write the configs;  --check  exit 1 when a file on disk differs (tests)
//
// Per pair: 16 beats. Copied beats (reuse) and re-shot beats (origin) are deep copies of the source beat made
// self-contained, so each one also renders on its own exactly like its source:
//   shot.t0 = the source beat's shot offset (camera-path time; continued moves become explicit), crowd.t0 = the source
//   state time at the beat start + crowd.restart, clock = {set:'HH:MM:SS', rate} (the source clock at the beat start, fractional
//   game minutes) or false, vt0 = the source beat's video time (background solver crowd = the original's), bgm/amb =
//   the source's effective track/bed; HUD/cues/transition/fadeOut verbatim. Choice beats get item.picked of their run.
// New beats: caught (caught-pov on the over-result location: base = that shot + params, baseT0 = shot time at the end of
// the result, + the result's departure board (alt) with its factIds on the beat → footnote; crowd caught-press with
// base = the over-result crowd state at its end time — the same people stay around), over-stamp (black, GAME OVER onBlack + the over stamp text + safety line), continue
// (continue-bg, HUD continue), kaiju (kaiju-skyline + gag caption), endcard (card-bg, HUD endcard), sources (union, compact).
// FIX: zone/alt clear-result + clear-stamp are re-shot (origin) with the fix params documented by the 3D camera /
// crowd-vfx owners (combined/notes-3d-camera.md, notes-crowd-vfx.md); unknown params are ignored by the page, so the
// values here are defensive defaults the integrator finalises.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as V from '../web3d/shibuya/series/variant-system.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const DIR=path.join(ROOT,'web3d/shibuya/series/variants/jr');
const OUTDIR=path.join(DIR,'combined');
export const PAIRS=['gate','taxi','zone','alt'];
const read=id=>JSON.parse(fs.readFileSync(path.join(DIR,`${id}.json`),'utf8'));
const clone=v=>JSON.parse(JSON.stringify(v));
const r4=v=>+(+v).toFixed(4);

// ---------------------------------------------------------------- copy (Japanese, game tone; no numbers / facts)
// caught: sim chip until the flash (ONE line: the sim chip shows a single line — stills 2026-10-26); stamp: the over stamp text (from the over config) + safety line (plain game advice,
// no numbers, no fact claim); cont: CONTINUE? sub line; gag: kaiju caption (short, silly, original; HUD: ≤ 2 lines of ≤ 9
// chars); end: closing question + sub (end card; the HUD types it on); stamp? (optional): the over-stamp text when the
// over config's stamp no longer follows the caught shot (QA 2026-10-26: taxi 「タクシーが来ない…」 / alt 「目の前で終電が…」
// right after being engulfed by the crowd → the crowd version; NEW beat, so no reuse is affected).
// seed: the caught sequence's hands / shake (caught-pov) and press-crowd people (caught-press) per pair, so the four
// caught shots are not identical (QA: same hands + same person centred in all four).
export const COPY={
 gate:{title:'ハチ公改札で GAME OVER → 別の改札で再挑戦',caught:'囲まれて動けない（シミュレーション）',safety:'混雑の中で立ち止まると危険',
  cont:'別の改札でやり直す',gag:'えっ、\nボス戦あるの!?',end:'あなたなら、\nどう帰る？',endSub:'改札はひとつじゃない',seed:7},
 taxi:{title:'西口で GAME OVER → 別の乗り場で再挑戦',caught:'押し寄せて動けない（シミュレーション）',safety:'人が集まる場所で立ち止まり続けない',
  cont:'別の乗り場でやり直す',gag:'それ\nタクシーじゃない!',end:'あなたなら、\nどう帰る？',endSub:'乗り場はひとつじゃない',seed:11,
  stamp:'タクシー待ちの人波で動けない…\n（シミュレーション）'},
 zone:{title:'最短ルートで GAME OVER → 外側を回って再挑戦',caught:'人の波にはさまれた（シミュレーション）',safety:'密集の中で立ち止まると危険',
  cont:'外側を回ってやり直す',gag:'隠しボス\n出現!?',end:'あなたなら、\nどう帰る？',endSub:'最短が近道とは限らない',seed:19},
 alt:{title:'原宿駅で GAME OVER → 恵比寿駅で再挑戦',caught:'ホームで囲まれた（シミュレーション）',safety:'混雑したホームで立ち止まると危険',
  cont:'反対側の駅でやり直す',gag:'終電より\nデカいの来た',end:'あなたなら、\nどう帰る？',endSub:'終電の時刻は駅ごとにちがう',seed:23,
  stamp:'ホームの人波で乗れない…\n（シミュレーション）'},
};

// ---------------------------------------------------------------- fixes (re-shot clear beats; integrator finalises)
// zone-clear result (~13.4 s body): a near pedestrian (a detour-light state walker) filled the frame → crowd.params.clear
// = {ahead:8, behind:1.5, half:2.4, ease:3} (crowd-variants.mjs clearCone, crowd-vfx owner 2026-10-26: walkers inside the
// cone ahead side-step to |lateral| ≥ 2.4 m → out of frame closer than ≈6.5 m; the shot has crowd:false, so the solver
// crowd is not involved and the camera is unchanged). alt-clear result: the 3D departure
// board overlapped the header (the original pan tilted the board + a canopy light strip up into the lockup) → alt-platform
// board framing {pan:0, side:3, dist:7.5, push:.05, fov:56, lookDy:-.6} (shots-variants.mjs header, 3D camera owner
// 2026-10-26, final: board held at screen y≈.32–.52, below the header + clock and above the captions, no light strip, the
// near pillar on the board's empty right part so 「終電 0:50」「大崎」 + the foot line read; the draft {pan:0,side:.7,push:.15}
// let a pillar cover 大崎).
export const FIX={
 zone:{shot:{},crowd:{clear:{ahead:8,behind:1.5,half:2.4,ease:3}},note:'zone-clear fix: clear cone ahead of the eye camera (nobody close in view)'},
 alt:{shot:{pan:0,side:3,dist:7.5,push:.05,fov:56,lookDy:-.6},crowd:{},note:'alt-clear fix: departure board below the header + clock'},
};
// sound: caught sequence cues (beat-local s); flash / black match the caught-pov defaults (flashAt 1.75, blackAt 2.15)
const FLASH_AT=1.75,BLACK_AT=2.15;
// caught VFX hands (vfx-caught.mjs CAUGHT_HANDS_DEFAULTS ×): smaller + shallower than the defaults so the creature hands stay
// a suggestion at the frame edges and never overlap the bystanders' backs in the centre (integrator stills 2026-10-26)
const CAUGHT_HANDS={scale:.75,reach:.6};
const CAUGHT_CUES=[{at:0,sfx:'crowd_press'},{at:.35,sfx:'zombie_groan'},{at:1.15,sfx:'zombie_groan_b',gain_db:-3,pan:.4},
 {at:FLASH_AT,sfx:'red_flash'},{at:FLASH_AT,sfx:'caught_hit',duck:.6,duck_db:-12},{at:BLACK_AT,sfx:'cut_black'}];
const CONT_YES=1.6; // CONTINUE? YES press (s) → ticks .34/.76/1.18, subline 「別の…でやり直す」 at 1.76 (+.28 ease) → ≈1 s readable
                    // before the exit at 2.8 (QA 2026-10-26: at yesAt 2 it read for only ≈.5 s); the cue sheet follows (continueTiming)
const KAIJU={rise:[.15,1.7],roarAt:1.85,roarDur:1.35,kaiju:{scale:560,ground:490}};   // earlier roar (QA 2026-10-26): the
// compact kaiju_roar (1.75 s: bellow .95, hic 1.0, fall 1.2–1.7) runs 1.85→3.6 and lands whole before the smash cut at 4.0
// (its swell from 3.9); the mouth is open over the bellow and closes (roarDur 1.35: release 2.9–3.2) on the hic / fall.
// scale/ground (KAIJU_DEFAULT 700/430): the whole blob incl. the party hat stays inside the 9:16 frame at the roar (the
// default crops the hat; integrator stills 2026-10-26). Timing explicit here: the roar cue follows roarAt.
const KAIJU_CUES=[{at:.1,sfx:'kaiju_rumble'},{at:KAIJU.roarAt,sfx:'kaiju_roar',duck:1.2,duck_db:-10}];   // no boing: the roar's own hiccup (≈ roarAt + 1.0) is the punchline (sound notes)

// a source beat made self-contained (see header); plan/cfg = the source part plan + config, opening = its duration
function selfContained(b,cfg,plan,opening){const out=clone(cfg.beats[b.index]);
 if(out.shot){out.shot.t0=r4(b.shotOffset);delete out.shot.cut;}
 if(out.crowd){out.crowd.t0=r4((out.crowd.t0??0)+(b.t0-b.crowdRun)*(out.crowd.rate??1));out.crowd.restart=true;}
 const st=V.clockState(plan,cfg,b.t0+1e-6);
 out.clock=st&&st.visible?{set:V.fmtHMS(st.minutes),rate:st.rate}:false;
 out.vt0=r4(opening+b.t0);
 for(const k of ['bgm','amb'])out[k]=b[k]!==undefined?b[k]:(cfg[k]??null);
 return out;}

export function buildCombined(pair,{opening=null}={}){
 const O=read(`${pair}-over`),C=read(`${pair}-clear`),op=opening??read('_opening'),T=COPY[pair];
 const OP=V.buildPart(O,'body'),CP=V.buildPart(C,'body'),opDur=V.buildPart(op,'opening').duration;
 const ob=id=>OP.beats.find(b=>b.id===id),cb=id=>CP.beats.find(b=>b.id===id);
 const copy=(part,id,mode='reuse')=>{const [cfg,plan,b]=part==='over'?[O,OP,ob(id)]:[C,CP,cb(id)];const out=selfContained(b,cfg,plan,opDur);
  return {...out,id:`${part}-${id}`,[mode]:{variant:cfg.id,beat:id}};};
 const pick=(beat,p)=>{for(const h of beat.hud||[])if(h.c==='choice')h.picked=p;return beat;};
 const res=ob('result'),stampItem=(O.beats.find(b=>b.id==='stamp').hud||[]).find(h=>h.c==='stamp');
 const fix=FIX[pair];
 const reshoot=id=>{const b=copy('clear',id,fix?'origin':'reuse');if(!fix)return b;
  if(Object.keys(fix.shot).length)b.shot.params={...(b.shot.params||{}),...fix.shot};if(b.crowd&&fix.crowd&&Object.keys(fix.crowd).length)b.crowd.params={...(b.crowd.params||{}),...fix.crowd};
  b.fix=fix.note;return b;};
 const beats=[
  copy('over','start'),pick(copy('over','choice'),O.choice.picked),copy('over','move'),copy('over','result'),
  {id:'caught',dur:2.5,shot:{key:'caught-pov',params:{base:res.shot.key,baseParams:{...clone(res.shot.params||{}),...(res.board?{board:clone(res.board)}:{})},baseT0:r4(res.shotOffset+res.dur),eyeY:1.55,push:.6,flashAt:FLASH_AT,blackAt:BLACK_AT,hands:clone(CAUGHT_HANDS),seed:T.seed??7}},
   crowd:{key:'caught-press',params:{seed:T.seed??0,...(res.crowd?{base:{key:res.crowd.key,params:clone(res.crowd.params||{}),t0:r4((res.crowd.t0??0)+(res.t1-res.crowdRun)*(res.crowd.rate??1))}}:{})}},
   hud:[{c:'sim',ja:T.caught,factIds:[],until:FLASH_AT}],cues:CAUGHT_CUES,header:false,clock:false,vt0:r4(opDur+res.t1),...(res.factIds?{factIds:clone(res.factIds)}:{}),bgm:null,amb:res.amb!==undefined?res.amb:O.amb},
  {id:'over-stamp',dur:2,shot:{key:'black'},hud:[{c:'stamp',kind:'GAME_OVER',ja:T.stamp??stampItem.ja,factIds:stampItem.factIds||[],onBlack:true,safety:{ja:T.safety,factIds:[]}}],
   header:false,clock:false,bgm:null,amb:null},
  copy('over','lesson'),
  {id:'continue',dur:3,shot:{key:'continue-bg'},hud:[{c:'continue',ja:T.cont,count:3,yesAt:CONT_YES,factIds:[]}],clock:false,bgm:'retry',amb:null},
  pick(copy('clear','choice'),C.choice.picked),copy('clear','move'),reshoot('result'),reshoot('stamp'),copy('clear','cheat'),
  {id:'kaiju',dur:4,shot:{key:'kaiju-skyline',params:{rise:KAIJU.rise,roarAt:KAIJU.roarAt,roarDur:KAIJU.roarDur,kaiju:clone(KAIJU.kaiju)}},hud:[{c:'gag',ja:T.gag,factIds:[],at:2.5}],cues:KAIJU_CUES,
   header:false,clock:false,bgm:null,amb:'crowd-night'},
  {id:'endcard',dur:2.5,shot:{key:'card-bg',params:{yaw0:.6}},hud:[{c:'endcard',ja:T.end,sub:T.endSub,factIds:[]}],header:false,clock:false,footnote:false,bgm:'victory',amb:null},
  {id:'sources',dur:3,shot:{key:'card-bg',params:{yaw0:1.5}},hud:[{c:'sources',compact:true,note:sourcesNote(O,C),factIds:[]}],clock:false,bgm:'victory',amb:null,fadeOut:.4},
 ];
 const sources=[...new Set([...(O.sources||[]),...(C.sources||[])])];
 return {id:`combined-${pair}`,episode:'jr',pair,kind:'combined',outcome:'COMBINED',parts:{over:O.id,clear:C.id},
  title:{ja:T.title},start:clone(O.start),clock:clone(O.clock),choice:{...clone(O.choice),picked:O.choice.picked},
  beats,lesson:clone(O.lesson),cheat:clone(C.cheat),sources,bgm:O.bgm,amb:O.amb,
  routes:{...clone(O.routes||{}),...clone(C.routes||{})},
  generated:'tools/combined_configs.mjs (do not edit by hand: edit the generator and re-run --write)'};}
// the sources-card note of both runs (deduplicated, e.g. 「徒歩はOSMから概算（混雑・信号は含まず）」)
function sourcesNote(O,C){const n=[O,C].map(c=>(c.beats.find(b=>b.id==='sources')?.hud||[]).find(h=>h.c==='sources')?.note).filter(Boolean);return [...new Set(n)].join('\n')||undefined;}

export const combinedPath=pair=>path.join(OUTDIR,`${pair}.json`);
export const serialize=cfg=>JSON.stringify(cfg,null,1)+'\n';

function main(argv){const write=argv.includes('--write'),check=argv.includes('--check');const pairs=argv.filter(a=>!a.startsWith('-'));let rc=0;
 for(const pair of pairs.length?pairs:PAIRS){const cfg=buildCombined(pair),s=serialize(cfg),f=combinedPath(pair);
  const P=V.buildPart(cfg,'body');
  if(write){fs.mkdirSync(OUTDIR,{recursive:true});fs.writeFileSync(f,s);}
  const same=fs.existsSync(f)&&fs.readFileSync(f,'utf8')===s;if(check&&!same)rc=1;
  console.log(`${pair}: ${cfg.beats.length} beats · body ${P.duration.toFixed(2)} s (${P.frames} frames) · new: ${cfg.beats.filter(b=>!b.reuse).map(b=>b.id).join(', ')} · ${write?'written':same?'up to date':'DIFFERS from '+path.relative(ROOT,f)}`);}
 return rc;}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))process.exit(main(process.argv.slice(2)));
