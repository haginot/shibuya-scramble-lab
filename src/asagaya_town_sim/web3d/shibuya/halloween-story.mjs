import {SHOPS} from './halloween-model.mjs';
export function storyAt(seconds){
 if(!Number.isFinite(seconds)||seconds<0||seconds>28)throw Error('Frame time must be 0..28');
 const promoted=seconds>=12,simTime=Math.min(900,Math.floor(promoted?300+(seconds-12)/8*600:80+seconds/12*620));
 const captions=seconds<4?['荒れる渋谷、施策で散らせるか？','Can promos tame the Shibuya crush?']:seconds<8?['毎年の「ここ集合」が、積もっていく。','The annual “meet here” habit starts to add up.']:seconds<12?['目的地がひとつなら、赤くなる。','One destination. A rather red heatmap.']:seconds<14?['同じ条件で巻き戻す。今度は、お店へ。','Replay the same arrivals. Give them somewhere else to go.']:seconds<17?['少し遠いお店へ。時間も、少しずらす。','Farther shops. Later offers. A little breathing room.']:['交差点の密度は下がり、お店の来訪は増えた。','In this toy run: less central density, more shop visits.'];
 const shop=SHOPS[Math.max(0,Math.min(2,Math.floor((seconds-12)/2.7)))];
 return{promoted,simTime,captions,chapter:promoted?['02','行き先を、増やす。','MORE PLACES. MORE TIME.']:['01','集まる夜。','ONE MEETING POINT. AGAIN.'],offer:promoted?[`${shop.name}（架空） · ${shop.offer}`,shop.offerEn]:seconds<5?['とりあえず、交差点集合。','Everyone had the same meeting point. How original.']:['待ち合わせ場所、人気が集中。','A popular meeting point. A very popular meeting point.']};
}
