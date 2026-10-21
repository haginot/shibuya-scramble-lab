import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {experiment} from '../web3d/shibuya/halloween-model.mjs';
const root=new URL('../',import.meta.url),plateau=JSON.parse(await readFile(new URL('web3d/data/shibuya_plateau.json',root),'utf8'));
const result=experiment(plateau),path=new URL('out/media/shibuya-halloween-metrics.json',root);
await mkdir(new URL('out/media/',root),{recursive:true});await writeFile(path,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({path:fileURLToPath(path),seed:result.settings.seed,no_promo:{peak:result.no_promo.peak_density_per_m2,visits:result.no_promo.visits},promo:{peak:result.promo.peak_density_per_m2,visits:result.promo.visits}},null,2));
