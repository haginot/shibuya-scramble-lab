// node web3d/shibuya/series/ui/selftest.mjs → prints "hud selftest ok (N checks)" or throws.
// Pure-function checks of components.mjs/tokens.mjs (no DOM): every component renders at many t, output is
// deterministic, sim items are labelled, stamps are recorded, no banned names / real-alert wording in the HUD layer.
import {COMPONENTS,render,HUD_TEXT,life} from './components.mjs';
import {SAFE,ZONE,EASE,hash,cssVars,fontFaceCSS,FONT_FILES} from './tokens.mjs';
import {readFileSync} from 'node:fs';
let n=0;const ok=(c,m)=>{n++;if(!c)throw Error('hud selftest: '+m);};
const config={choice:{prompt:{ja:'どの改札へ？'},options:[{key:'A',ja:'ハチ公改札'},{key:'B',ja:'新南改札'}],picked:'B'},lesson:{ja:'見出し\n点1\n点2',factIds:['F1']},cheat:{rows:[{ja:'行1',factIds:['F2'],sec:'改札'},{ja:'行2',tone:'ng'}]}};
const items={parody:{},fiction:{},tag:{ja:'位置・構造は概略'},header:{},clock:{start:'22:10',rate:1},mission:{ja:'目標',factIds:['F3']},choice:{dur:4},caption:{ja:'字幕'},direction:{ja:'左：ハチ公口',dir:'left'},
 sim:{ja:'待ち 5分（シミュレーション）'},footnote:{ja:'出典：X'},stamp:{kind:'GAME_OVER',ja:'人波に飲まれた（シミュレーション）'},lesson:{},rules:{items:[{title:'a',tip:'b',factIds:['F4']}]},
 notice:{ja:'本文'},'press-start':{},pressStart:{},sources:{rows:[{label:'S',date:'2025',url:'https://example.org/'}]},cheat:{},pin:{x:100,y:500,ja:'駅'},legend:{rows:[{color:'#FFD23F',ja:'最短'},{color:'#4FE3C1',ja:'ルート例'}]}};
for(const k of Object.keys(COMPONENTS)){ok(items[k],`sample for ${k}`);
 for(const t of [0,.05,.1,.2,.3,.5,1,2,3.3,3.9,4]){const a=render({c:k,...items[k],t},{config,T:t}),b=render({c:k,...items[k],t},{config,T:t});
  ok(a&&typeof a.html==='string'&&a.html.length>0,`${k}@${t} renders`);ok(a.html===b.html,`${k}@${t} deterministic`);ok(!/NaN|undefined/.test(a.html),`${k}@${t} no NaN/undefined: ${a.html.match(/.{30}(NaN|undefined).{10}/)?.[0]}`);}}
ok(render({c:'parody'},{}).parody===true,'parody flag');
ok(render({c:'parody'},{}).strings.includes('※パロディ'),'parody text');
ok(render({c:'sim',ja:'待ち5分'},{}).sims[0].label===false,'unlabelled sim detected');
ok(render({c:'sim',ja:'待ち5分（シミュレーション）'},{}).sims[0].label===true,'labelled sim');
for(const [k,s] of [['GAME_OVER','gameover'],['GAME_CLEAR','clear'],['CLEAR','clear'],['ESCAPED','escaped']])ok(render({c:'stamp',kind:k,t:1},{}).stamps[0]===s,`stamp ${k}`);
const ch=render({c:'choice',t:3.5,dur:4,pickAt:3},{config});ok(ch.choice.picked==='B'&&ch.choice.hot===1,'choice picks configured option');
ok(render({c:'choice',t:.1,dur:4},{config}).choice.picked===null,'choice not picked early');
ok(render({c:'lesson'},{config}).factIds.includes('F1'),'lesson fact ids from config');
ok(render({c:'cheat'},{config}).cheat&&!render({c:'cheat'},{config}).strings.includes('※パロディ'),'cheat: no parody badge (steering 2026-10-26)');
ok(render({c:'fiction'},{}).fiction===true&&render({c:'fiction'},{}).strings.includes('フィクション'),'fiction tag');
ok(render({c:'sources',rows:[]},{}).strings.some(s=>s.includes('フィクション')),'sources card carries the parody/fiction note');
ok(!render({c:'notice',ja:'本文'},{}).strings.some(s=>s.includes('※パロディ')),'notice: no parody foot (fiction tag instead)');
ok(render({c:'logo'},{})===null,'logo external');
ok(Math.abs(EASE.outBack(1)-1)<1e-9&&EASE.outCubic(0)===0,'ease');ok(hash(5)===hash(5)&&hash(5)!==hash(6),'hash');
ok(life(3.95,4).kout>0&&life(1,4).alpha===1,'life');
ok(ZONE.foot.bottom>=SAFE.bottom&&ZONE.header.top>=SAFE.top,'zones in safe area');
ok(cssVars().includes('--gh-pumpkin')&&fontFaceCSS('/f/').includes('/f/DelaGothicOne-Regular.ttf'),'css');
const here=new URL('.',import.meta.url);
for(const f of FONT_FILES){ok(readFileSync(new URL(`../../../fonts/${f.file}`,here)).length>1e5,`font ${f.file}`);ok(/Open Font License/.test(readFileSync(new URL(`../../../fonts/${f.license}`,here),'utf8')),`license ${f.license}`);}
const src=['components.mjs','tokens.mjs','hud.css','preview.html'].map(f=>readFileSync(new URL(f,here),'utf8')).join('\n');
// banned names built from char codes (as variant-system.mjs TEXT_RULES): never spelled out in a committed file
const cc=(...c)=>String.fromCharCode(...c),BANNED_RE=new RegExp([cc(101,110,97,98,108,101)+'\\s*'+cc(120),cc(0x30AB,0x30F3,0x30EA,0x30FC),cc(99,97,110)+'-?'+cc(108,121)].join('|'),'i');
ok(!BANNED_RE.test(src),'banned names');
ok(!/J-?ALERT|Jアラート|緊急速報|国民保護|NHK/i.test(src),'no real-alert wording');
ok(!/@keyframes|animation\s*:|transition\s*:/.test(readFileSync(new URL('hud.css',here),'utf8')),'no CSS animations/transitions');
console.log(`hud selftest ok (${n} checks)`);
