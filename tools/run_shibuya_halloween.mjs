import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {experiment} from '../web3d/shibuya/halloween-model.mjs';
const root=new URL('../',import.meta.url),plateau=JSON.parse(await readFile(new URL('web3d/data/shibuya_plateau.json',root),'utf8'));
const result=experiment(plateau),path=new URL('out/media/shibuya-halloween-metrics.json',root);
await mkdir(new URL('out/media/',root),{recursive:true});await writeFile(path,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({no_events:result.no_events,events_on:result.events_on,best:result.best_event,change:result.density_change_pct,ratio:result.attendance_ratio},null,2));
