// variants.md generator for the JR編 branching variants: every config in web3d/shibuya/series/variants/jr/
// (not starting with _) → pattern, choice, outcome, beats, lesson, sources (fact id → outlet, date, URL).
//   node tools/variants_md.mjs > /workspace/demos/halloween-escape-series/jr-variants/variants-body.md
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {FACTS,SOURCES,sourceKeys}=await import(path.join(root,'web3d/shibuya/series/sources-series.mjs'));
const dir=path.join(root,'web3d/shibuya/series/variants/jr');
const order=['gate','taxi','zone','alt'];
const cfgs=fs.readdirSync(dir).filter(f=>f.endsWith('.json')&&!f.startsWith('_')).map(f=>JSON.parse(fs.readFileSync(path.join(dir,f),'utf8')))
 .sort((a,b)=>order.indexOf(a.pair)-order.indexOf(b.pair)||(a.outcome==='GAME_OVER'?-1:1));
const one=s=>String(s??'').replace(/\n/g,' ').trim();
const out=[];
for(const c of cfgs){
 const dur=c.beats.reduce((s,b)=>s+b.dur,0);
 const ch=c.choice,pick=ch.options.find(o=>o.key===ch.picked);
 out.push(`### \`${c.id}\` — ${c.outcome==='GAME_OVER'?'GAME OVER':'GAME CLEAR'} · ${one(c.title.ja)}`,'');
 out.push(`- **Choice:** ${one(ch.prompt.ja)} — ${ch.options.map(o=>`${o.key}「${one(o.ja)}」${o.sub?`（${one(o.sub)}）`:''}`).join(' / ')} → picked **${pick.key}「${one(pick.ja)}」**`);
 out.push(`- **Start:** ${one(c.start.ja)} · clock ${c.clock?.start??''} ${one(c.clock?.ja)} · body ${dur.toFixed(1)} s`);
 const story=c.beats.filter(b=>!['lesson','cheat','sources'].includes(b.id)).map(b=>{const t=b.hud.filter(h=>h.ja&&['caption','sim','stamp','mission'].includes(h.c)).map(h=>one(h.ja));return `${b.id} (${b.shot.key}, ${b.dur}s)${t.length?': '+t.join(' ／ '):''}`;});
 out.push(`- **Beats:** ${story.join(' → ')}`);
 out.push(`- **Lesson:** ${one(c.lesson.summary??c.lesson.ja)}`,'');
 const ids=[...new Set([...(c.sources||[]),...(c.lesson.factIds||[])])].filter(id=>FACTS[id]);
 const keys=[...new Set(sourceKeys(ids))];
 out.push(`- **Sources** (fact ids: ${ids.join(', ')}):`);
 for(const k of keys){const s=SOURCES[k];out.push(`  - ${s.ja}${s.date?` (${s.date})`:''} — ${s.url}`);}
 out.push('');
}
process.stdout.write(out.join('\n')+'\n');
