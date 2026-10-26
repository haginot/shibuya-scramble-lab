// node web3d/shibuya/series/ui/selftest.mjs → prints "hud selftest ok (N checks)" or throws.
// Pure-function checks of components.mjs/tokens.mjs (no DOM): every component renders at many t, output is
// deterministic, sim items are labelled, stamps are recorded, no banned names / real-alert wording in the HUD layer.
import {COMPONENTS,COMPONENT_KEYS,render,HUD_TEXT,life,continueTiming,mergeSourceRows} from './components.mjs';
import {SAFE,ZONE,EASE,hash,cssVars,fontFaceCSS,FONT_FILES} from './tokens.mjs';
import {readFileSync} from 'node:fs';
let n=0;const ok=(c,m)=>{n++;if(!c)throw Error('hud selftest: '+m);};
const config={choice:{prompt:{ja:'どの改札へ？'},options:[{key:'A',ja:'ハチ公改札'},{key:'B',ja:'新南改札'}],picked:'B'},lesson:{ja:'見出し\n点1\n点2',factIds:['F1']},cheat:{rows:[{ja:'行1',factIds:['F2'],sec:'改札'},{ja:'行2',tone:'ng'}]}};
const items={parody:{},fiction:{},tag:{ja:'位置・構造は概略'},header:{},clock:{start:'22:10',rate:1},mission:{ja:'目標',factIds:['F3']},choice:{dur:4},caption:{ja:'字幕'},direction:{ja:'左：ハチ公口',dir:'left'},
 sim:{ja:'待ち 5分（シミュレーション）'},footnote:{ja:'出典：X'},stamp:{kind:'GAME_OVER',ja:'人波に飲まれた（シミュレーション）'},lesson:{},rules:{items:[{title:'a',tip:'b',factIds:['F4']}]},
 notice:{ja:'本文'},'press-start':{},pressStart:{},sources:{rows:[{label:'S',date:'2025',url:'https://example.org/'}]},cheat:{},pin:{x:100,y:500,ja:'駅'},legend:{rows:[{color:'#FFD23F',ja:'最短'},{color:'#4FE3C1',ja:'ルート例'}]},
 continue:{ja:'別のルートでやり直す',count:3,dur:3},endcard:{ja:'あなたなら、\nどう帰る？',sub:'コメントで教えて',dur:2.5},gag:{ja:'なんで！？',sub:'※ゲームとは関係ありません',dur:4}};
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
// combined episodes (2026-10-26)
for(const k of ['continue','endcard','gag'])ok(COMPONENT_KEYS.includes(k),`COMPONENT_KEYS has ${k}`);
{const T=continueTiming({dur:3,count:3});ok(T.ticks.length===3&&T.ticks[0]>0&&T.yesAt<3-.5&&T.ticks.every((x,i)=>!i||x>T.ticks[i-1])&&T.ticks[2]<T.yesAt,'continue timing');
 const d=[.1,T.ticks[0]+.01,T.ticks[1]+.01,T.ticks[2]+.01].map(t=>render({c:'continue',t,dur:3},{}).cont.digit);ok(d.join()==='3,3,2,1','continue digits '+d);
 const a=render({c:'continue',t:T.yesAt-.5,dur:3},{}),b=render({c:'continue',t:T.yesAt+.05,dur:3},{});ok(!a.cont.yes&&b.cont.yes&&b.cont.digit===null,'continue YES near the end');
 ok(b.strings.includes('CONTINUE?')&&b.strings.includes('YES')&&b.strings.includes(HUD_TEXT.contSub),'continue strings (default subline)');
 ok(!b.stamps.length&&!b.strings.some(x=>/GAME\s*OVER|ESCAPED|GAME\s*CLEAR/i.test(x)),'continue: no stamp wording');}
{const e=render({c:'endcard',ja:'あなたなら、どう帰る？',t:.1,dur:2.5},{});ok(e.strings.includes('あなたなら、どう帰る？')&&e.strings.some(x=>x.includes('出典：国土交通省 PLATEAU'))&&e.credit,'endcard question + PLATEAU credit');
 ok(!e.endcard.done&&render({c:'endcard',ja:'あなたなら、どう帰る？',t:2,dur:2.5},{}).endcard.done,'endcard types on');
 ok(!render({c:'endcard',ja:'q',credit:false},{}).credit,'endcard credit:false');}
ok(render({c:'gag',ja:'なんで！？',t:1},{}).gag&&render({c:'gag',ja:'なんで！？',t:1},{}).strings.includes('なんで！？'),'gag');
{const ob=render({c:'stamp',kind:'GAME_OVER',onBlack:true,ja:'人波に飲まれた（シミュレーション）',safety:{ja:'混雑の中で立ち止まると危険',factIds:['F9']},t:1.2,dur:2},{});
 ok(ob.stamps[0]==='gameover'&&ob.strings.includes('混雑の中で立ち止まると危険')&&ob.factIds.includes('F9')&&/gh-safety/.test(ob.html)&&!/backdrop/.test(ob.fx)&&/gh-tint ob/.test(ob.fx),'stamp onBlack + safety line');
 const pl=render({c:'stamp',kind:'GAME_OVER',ja:'x',safety:'y',t:1.2,dur:2},{});ok(!/gh-safety|gh-static|ob/.test(pl.html+pl.fx),'stamp without onBlack unchanged (no safety/static)');}
{const rows=[{label:'A',date:'2025-01-02',factIds:['a']},{label:'A',date:'2026-09-30',factIds:['b']},{label:'B',factIds:['c']},{label:'A',date:'2025-01-02',factIds:['d']}];
 const m=mergeSourceRows(rows);ok(m.length===2&&m[0].date==='2026-09-30・2025-01-02'&&m[0].factIds.join()==='a,b,d','merge source rows');
 const many=Array.from({length:14},(_,i)=>({label:'媒体'+(i%10),date:'2025-10-'+String(10+i),factIds:['X'+i]}));
 const c=render({c:'sources',compact:true,rows:many,t:2,dur:3},{});ok(c.parodyNote&&c.strings.some(x=>x.includes('フィクション'))&&c.strings.some(x=>x.includes('出典：国土交通省 PLATEAU'))&&c.factIds.length===14&&!/class="u"/.test(c.html),'sources compact: note + credit + ids, no URLs');
 ok(!/class="cr"/.test(render({c:'sources',rows:many},{}).html),'sources non-compact unchanged (no credit line)');}
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
