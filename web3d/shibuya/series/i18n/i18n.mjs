// JR v11-en: English text of the JR編 videos (logs/ssl-claude-halloween/v11-en/brief.md). Pure module (node + page).
// The JP configs / components stay the source of truth; with lang=en every displayed JP string is replaced by its entry in
// i18n/en.json ({exact: {JP: EN}, patterns: [[regex, replacement]]}; tools/v11_strings.mjs lists what reaches the screen).
// lang=ja: tr() is the identity (the JP builds are byte-identical). A JP string without an entry stays JP → the EN checks
// (tools/record_variant.py --lang en: no CJK on screen) fail.
export const CJK_RE=/[　-ヿ㐀-鿿＀-￯]/;
let DICT=null;
export function setDict(d){DICT={exact:new Map(Object.entries(d.exact||{})),patterns:(d.patterns||[]).map(([re,rep])=>[new RegExp(re,'u'),rep])};return DICT;}
export async function loadDict(url=new URL('./en.json',import.meta.url)){
 if(typeof window==='undefined'){const fs=await import('node:fs');return setDict(JSON.parse(fs.readFileSync(url,'utf8')));}
 const r=await fetch(url);if(!r.ok)throw Error(`i18n ${r.status}`);return setDict(await r.json());}
export function tr(s,lang='ja'){if(lang!=='en'||typeof s!=='string'||!DICT||!CJK_RE.test(s))return s;
 const e=DICT.exact.get(s);if(e!=null)return e;
 for(const [re,rep] of DICT.patterns){if(re.test(s)){const o=s.replace(re,rep);if(!CJK_RE.test(o))return o;if(!WORD_RE.test(o))return punct(o);}}
 // last resort: only full-width punctuation left (no kana / kanji) → ASCII punctuation (template glue like 「：」「・」)
 if(!WORD_RE.test(s))return punct(s);
 return s;}
const WORD_RE=/[\u3040-\u30fa\u30fc-\u30ff\u3400-\u9fff\uff10-\uff19\uff21-\uff3a\uff41-\uff5a]/;
const punct=s=>s.replace(/[：・／（）〜　]/g,c=>PUNCT[c]);
const PUNCT={'：':': ','・':' · ','／':' / ','（':' (','）':')','〜':'–','　':' '};
// deep copy with every string translated; an object with both ja and en gets en = tr(ja) (the dictionary wins over the
// older built-in EN sub-lines, so one table holds every EN string on screen)
const memo=new WeakMap();
export function trDeep(v,lang='ja'){if(lang!=='en')return v;
 if(typeof v==='string')return tr(v,lang);
 if(typeof v==='function')return (...a)=>trDeep(v(...a),lang);
 if(!v||typeof v!=='object')return v;
 if(memo.has(v))return memo.get(v);
 let out;
 if(Array.isArray(v))out=v.map(x=>trDeep(x,lang));
 else{out={};for(const [k,x] of Object.entries(v))out[k]=k==='factIds'||k==='c'||k==='kind'||k==='id'?x:trDeep(x,lang);
  if(typeof v.ja==='string'&&typeof v.en==='string'&&tr(v.ja,lang)!==v.ja)out.en=tr(v.ja,lang);}
 memo.set(v,out);
 return out;}
